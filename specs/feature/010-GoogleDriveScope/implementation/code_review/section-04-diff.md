diff --git a/apps/web/server/_core/index.ts b/apps/web/server/_core/index.ts
index ce87f40..2c3530e 100644
--- a/apps/web/server/_core/index.ts
+++ b/apps/web/server/_core/index.ts
@@ -23,7 +23,7 @@ import { ENV } from "./env";
 import { debugError } from "./logger";
 import { sdk } from "./sdk";
 import { signBearerToken } from "./tokens";
-import { getUploadsDir } from "../storage";
+import { getUploadsDir, storageStreamFile } from "../storage";
 import { initializeSkillRegistry } from "../services/skillRegistry";
 import { initAuditLogger, auditLogger } from "../services/auditLogger";
 import { auditMiddleware } from "../middleware/auditMiddleware";
@@ -158,6 +158,61 @@ app.use('/uploads', express.static(uploadsDir, {
   },
 }));
 
+// Storage proxy: streams files from R2/S3 through the Node.js server.
+// This avoids broken R2 public URLs (SSL issues) and presigned URL expiration.
+// Supports HTTP Range requests for video seeking.
+app.get("/api/storage/files/*", async (req, res) => {
+  try {
+    const key = decodeURIComponent((req.params as any)[0] || "");
+    if (!key || key.includes("..")) {
+      res.status(400).json({ error: "Invalid storage key" });
+      return;
+    }
+
+    const range = req.headers.range;
+    const result = await storageStreamFile(key, range);
+    if (!result) {
+      res.status(404).json({ error: "File not found or storage not configured" });
+      return;
+    }
+
+    res.setHeader("Content-Type", result.contentType);
+    res.setHeader("Accept-Ranges", "bytes");
+    res.setHeader("Cache-Control", "public, max-age=86400");
+    res.setHeader("X-Content-Type-Options", "nosniff");
+
+    if (result.isPartial && result.rangeStart !== undefined && result.rangeEnd !== undefined) {
+      res.status(206);
+      const total = result.totalLength ?? "*";
+      res.setHeader("Content-Range", `bytes ${result.rangeStart}-${result.rangeEnd}/${total}`);
+      if (result.contentLength) res.setHeader("Content-Length", result.contentLength);
+    } else {
+      if (result.contentLength) res.setHeader("Content-Length", result.contentLength);
+    }
+
+    const nodeStream = result.stream as NodeJS.ReadableStream;
+    if (typeof (nodeStream as any).pipe === "function") {
+      (nodeStream as any).pipe(res);
+    } else {
+      const reader = (result.stream as ReadableStream).getReader();
+      while (true) {
+        const { done, value } = await reader.read();
+        if (done) { res.end(); break; }
+        res.write(value);
+      }
+    }
+  } catch (error: any) {
+    if (error.name === "NoSuchKey" || error.$metadata?.httpStatusCode === 404) {
+      res.status(404).json({ error: "File not found" });
+      return;
+    }
+    debugError("StorageProxy", "Failed to stream file", error);
+    if (!res.headersSent) {
+      res.status(500).json({ error: "Failed to stream file" });
+    }
+  }
+});
+
 // REST/SSE endpoints
 registerLLMRoutes(app);
 registerMCPRoutes(app);
@@ -183,6 +238,52 @@ app.get("/api/media/image-proxy", async (req, res) => {
   }
 });
 
+// Internal credit billing endpoint (Python backend -> Node.js)
+app.post("/api/internal/credits/charge", async (req, res) => {
+  // Authenticate via gateway token
+  const authHeader = req.headers.authorization || "";
+  const token = authHeader.replace("Bearer ", "");
+  if (!ENV.webGatewayToken || token !== ENV.webGatewayToken) {
+    return res.status(401).json({ success: false, error: "Unauthorized" });
+  }
+
+  try {
+    const { userId, amount, chunkCount, service, idempotencyKey, metadata } = req.body;
+    if (!userId || !service) {
+      return res.status(400).json({ success: false, error: "userId and service are required" });
+    }
+
+    const { chargeForIndexing, chargeForRagQuery, deductCredits } = await import("../services/creditService");
+
+    if (chunkCount != null) {
+      const result = await chargeForIndexing({
+        userId,
+        chunkCount,
+        service,
+        idempotencyKey,
+        metadata,
+      });
+      return res.json({ success: true, ...result });
+    }
+
+    if (amount != null) {
+      const result = await deductCredits({
+        userId,
+        amount,
+        description: `Service charge (${service})`,
+        idempotencyKey,
+        metadata: { ...metadata, service },
+      });
+      return res.json({ success: true, creditsUsed: result.creditsUsed, transactionId: result.transactionId });
+    }
+
+    return res.status(400).json({ success: false, error: "Either amount or chunkCount is required" });
+  } catch (err: any) {
+    const status = err.message?.includes("Insufficient credits") ? 402 : 500;
+    return res.status(status).json({ success: false, error: err.message });
+  }
+});
+
 // Device auth routes (for desktop app)
 registerDeviceAuthRoutes(app);
 
diff --git a/apps/web/server/routers/systemSettings.ts b/apps/web/server/routers/systemSettings.ts
index b841d7b..0c98b01 100644
--- a/apps/web/server/routers/systemSettings.ts
+++ b/apps/web/server/routers/systemSettings.ts
@@ -15,7 +15,7 @@ import { validateGoogleOAuthFormat } from "../services/googleOAuthValidation";
 // System Settings Router
 // ============================================================
 
-const settingCategorySchema = z.enum(["stripe", "invoice", "email", "general", "oauth", "ai", "telegram", "vectordb"]);
+const settingCategorySchema = z.enum(["stripe", "invoice", "email", "general", "oauth", "ai", "telegram", "vectordb", "credit_pricing"]);
 
 const stripeSettingsSchema = z.object({
   secretKey: z.string().optional(),
diff --git a/apps/web/server/services/creditService.ts b/apps/web/server/services/creditService.ts
index 0bdb8ca..d9bd41c 100644
--- a/apps/web/server/services/creditService.ts
+++ b/apps/web/server/services/creditService.ts
@@ -4,8 +4,9 @@
  */
 
 import { db } from "../db";
-import { users, creditTransactions, creditPackages, modelProviderMap } from "../../drizzle/schema";
+import { users, creditTransactions, creditPackages, modelProviderMap, systemSettings } from "../../drizzle/schema";
 import { eq, desc, and, gte, lte, sql } from "drizzle-orm";
+import { getRedisClient, isRedisAvailable } from "./redis";
 
 export type TransactionType = "purchase" | "usage" | "bonus" | "refund" | "adjustment" | "subscription";
 
@@ -13,6 +14,7 @@ export interface DeductCreditsParams {
   userId: number;
   amount: number;
   description: string;
+  idempotencyKey?: string;
   metadata?: {
     model?: string;
     provider?: string;
@@ -20,6 +22,7 @@ export interface DeductCreditsParams {
     costUsd?: number;
     endpoint?: string;
     traceId?: string;
+    service?: string;
     [key: string]: any;
   };
 }
@@ -95,54 +98,100 @@ export async function hasEnoughCredits(userId: number, amount: number): Promise<
  * This prevents TOCTOU race conditions and negative balances.
  */
 export async function deductCredits(params: DeductCreditsParams) {
-  const { userId, amount, description, metadata } = params;
+  const { userId, amount, description, metadata, idempotencyKey } = params;
 
   if (amount <= 0) {
     throw new Error("Deduction amount must be positive");
   }
 
+  // Redis fast-path check for idempotency
+  if (idempotencyKey && isRedisAvailable()) {
+    try {
+      const redis = getRedisClient();
+      const cached = await redis.get(`credit:idemp:${idempotencyKey}`);
+      if (cached) {
+        return JSON.parse(cached);
+      }
+    } catch {
+      // Redis unavailable -- fall through to DB check
+    }
+  }
+
   let transactionId: number = 0;
   let newBalance: number = 0;
 
-  await db.transaction(async (tx) => {
-    // Atomic deduction: balance check + decrement in one statement
-    const [result] = await tx
-      .update(users)
-      .set({ credits: sql`${users.credits} - ${amount}` })
-      .where(and(eq(users.id, userId), gte(users.credits, amount)))
-      .returning({ newBalance: users.credits });
-
-    if (!result) {
-      // Either user not found or insufficient credits
-      const [user] = await tx
-        .select({ id: users.id })
-        .from(users)
-        .where(eq(users.id, userId))
+  try {
+    await db.transaction(async (tx) => {
+      // Atomic deduction: balance check + decrement in one statement
+      const [result] = await tx
+        .update(users)
+        .set({ credits: sql`${users.credits} - ${amount}` })
+        .where(and(eq(users.id, userId), gte(users.credits, amount)))
+        .returning({ newBalance: users.credits });
+
+      if (!result) {
+        // Either user not found or insufficient credits
+        const [user] = await tx
+          .select({ id: users.id })
+          .from(users)
+          .where(eq(users.id, userId))
+          .limit(1);
+        if (!user) throw new Error("User not found");
+        throw new Error("Insufficient credits");
+      }
+
+      newBalance = result.newBalance;
+
+      const [txRecord] = await tx.insert(creditTransactions).values({
+        userId,
+        amount: -amount, // Negative for deductions
+        type: "usage",
+        description,
+        metadata,
+        balanceAfter: newBalance,
+        idempotencyKey: idempotencyKey ?? null,
+      }).returning({ id: creditTransactions.id });
+
+      transactionId = txRecord?.id || 0;
+    });
+  } catch (err: any) {
+    // Handle unique constraint violation on idempotencyKey (DB safety net)
+    if (idempotencyKey && err?.code === "23505" && err?.constraint?.includes("idempotency")) {
+      const existing = await db
+        .select({ id: creditTransactions.id, amount: creditTransactions.amount, balanceAfter: creditTransactions.balanceAfter })
+        .from(creditTransactions)
+        .where(eq(creditTransactions.idempotencyKey, idempotencyKey))
         .limit(1);
-      if (!user) throw new Error("User not found");
-      throw new Error("Insufficient credits");
+      if (existing[0]) {
+        return {
+          success: true,
+          creditsUsed: Math.abs(existing[0].amount),
+          newBalance: existing[0].balanceAfter ?? 0,
+          transactionId: existing[0].id,
+        };
+      }
     }
+    throw err;
+  }
 
-    newBalance = result.newBalance;
-
-    const [txRecord] = await tx.insert(creditTransactions).values({
-      userId,
-      amount: -amount, // Negative for deductions
-      type: "usage",
-      description,
-      metadata,
-      balanceAfter: newBalance,
-    }).returning({ id: creditTransactions.id });
-
-    transactionId = txRecord?.id || 0;
-  });
-
-  return {
+  const result = {
     success: true,
     creditsUsed: amount,
     newBalance,
     transactionId,
   };
+
+  // Cache result in Redis for fast dedup (24h TTL)
+  if (idempotencyKey && isRedisAvailable()) {
+    try {
+      const redis = getRedisClient();
+      await redis.set(`credit:idemp:${idempotencyKey}`, JSON.stringify(result), "EX", 86400);
+    } catch {
+      // Non-critical -- DB constraint is the safety net
+    }
+  }
+
+  return result;
 }
 
 /**
@@ -507,3 +556,125 @@ export async function giveSignupBonus(userId: number, bonusAmount: number = 100)
     metadata: { reason: "signup" },
   });
 }
+
+// ─── Credit Pricing Config ─────────────────────────────────────────
+
+interface CreditPricingConfig {
+  costPerChunk: number;
+  ragQueryCost: number;
+  mcpReadMaxCost: number;
+  mcpSheetMaxCost: number;
+}
+
+const PRICING_DEFAULTS: CreditPricingConfig = {
+  costPerChunk: 2,
+  ragQueryCost: 1,
+  mcpReadMaxCost: 5,
+  mcpSheetMaxCost: 3,
+};
+
+let _pricingCache: { config: CreditPricingConfig; expiresAt: number } | null = null;
+
+/**
+ * Load credit pricing from system_settings with 5-minute cache.
+ */
+export async function getCreditPricingConfig(): Promise<CreditPricingConfig> {
+  if (_pricingCache && Date.now() < _pricingCache.expiresAt) {
+    return _pricingCache.config;
+  }
+
+  const rows = await db
+    .select({ key: systemSettings.key, value: systemSettings.value })
+    .from(systemSettings)
+    .where(eq(systemSettings.category, "credit_pricing"));
+
+  const config: CreditPricingConfig = { ...PRICING_DEFAULTS };
+  for (const row of rows) {
+    const num = Number(row.value);
+    if (!isNaN(num) && num > 0) {
+      if (row.key === "costPerChunk") config.costPerChunk = num;
+      else if (row.key === "ragQueryCost") config.ragQueryCost = num;
+      else if (row.key === "mcpReadMaxCost") config.mcpReadMaxCost = num;
+      else if (row.key === "mcpSheetMaxCost") config.mcpSheetMaxCost = num;
+    }
+  }
+
+  _pricingCache = { config, expiresAt: Date.now() + 5 * 60_000 };
+  return config;
+}
+
+// ─── Service-Tagged Billing Functions ───────────────────────────────
+
+export type IndexingService = "library.upload_index" | "library.save_reindex" | "gdrive.index" | "gdrive.reindex";
+
+/**
+ * Charge credits for indexing operations.
+ * Formula: ceil(chunkCount) * costPerChunk (default 2).
+ */
+export async function chargeForIndexing(params: {
+  userId: number;
+  chunkCount: number;
+  service: IndexingService;
+  idempotencyKey?: string;
+  metadata?: Record<string, any>;
+}): Promise<{ creditsUsed: number; transactionId: number }> {
+  const pricing = await getCreditPricingConfig();
+  const amount = Math.ceil(params.chunkCount) * pricing.costPerChunk;
+
+  if (amount <= 0) {
+    return { creditsUsed: 0, transactionId: 0 };
+  }
+
+  const result = await deductCredits({
+    userId: params.userId,
+    amount,
+    description: `Indexing (${params.service}): ${params.chunkCount} chunks`,
+    idempotencyKey: params.idempotencyKey,
+    metadata: { ...params.metadata, service: params.service, chunkCount: params.chunkCount },
+  });
+
+  return { creditsUsed: result.creditsUsed, transactionId: result.transactionId };
+}
+
+export type RagService = "rag.semantic_search" | "rag.chat_context";
+
+/**
+ * Charge credits for a RAG query (semantic/hybrid search).
+ * Fixed cost per query (default 1 credit). BM25-only is free.
+ */
+export async function chargeForRagQuery(params: {
+  userId: number;
+  service: RagService;
+  idempotencyKey?: string;
+  metadata?: Record<string, any>;
+}): Promise<{ creditsUsed: number; transactionId: number }> {
+  const pricing = await getCreditPricingConfig();
+  const amount = pricing.ragQueryCost;
+
+  const result = await deductCredits({
+    userId: params.userId,
+    amount,
+    description: `RAG query (${params.service})`,
+    idempotencyKey: params.idempotencyKey,
+    metadata: { ...params.metadata, service: params.service },
+  });
+
+  return { creditsUsed: result.creditsUsed, transactionId: result.transactionId };
+}
+
+/**
+ * Pre-flight estimation: estimate indexing cost without charging.
+ */
+export async function estimateIndexingCost(fileCount: number, totalSizeBytes: number): Promise<{
+  estimatedChunks: number;
+  estimatedCredits: number;
+  costPerChunk: number;
+}> {
+  const pricing = await getCreditPricingConfig();
+  const estimatedChunks = Math.ceil(totalSizeBytes / 500);
+  return {
+    estimatedChunks,
+    estimatedCredits: estimatedChunks * pricing.costPerChunk,
+    costPerChunk: pricing.costPerChunk,
+  };
+}
diff --git a/python-backend/app/orchestrator/rag/hybrid_rag.py b/python-backend/app/orchestrator/rag/hybrid_rag.py
index d97ef36..ddc89e6 100644
--- a/python-backend/app/orchestrator/rag/hybrid_rag.py
+++ b/python-backend/app/orchestrator/rag/hybrid_rag.py
@@ -289,16 +289,18 @@ class HybridRAGEngine:
         top_k: Optional[int] = None,
         mode: Optional[SearchMode] = None,
         filters: Optional[Dict[str, Any]] = None,
+        user_id: Optional[int] = None,
     ) -> RAGResult:
         """
         Retrieve relevant documents for a query.
-        
+
         Args:
             query: Search query
             top_k: Number of results to return
             mode: Search mode override
             filters: Metadata filters
-            
+            user_id: Optional user ID for credit billing (None = no billing)
+
         Returns:
             RAGResult with ranked documents
         """
@@ -398,7 +400,23 @@ class HybridRAGEngine:
                 results=result.final_count,
                 total_ms=result.total_time_ms,
             )
-            
+
+            # Bill for semantic/hybrid searches (BM25-only is free)
+            if user_id and mode in (SearchMode.SEMANTIC, SearchMode.HYBRID, SearchMode.FAST):
+                try:
+                    from app.services.credit_billing_client import charge_credits_post_deduct
+                    import hashlib, time
+                    query_hash = hashlib.md5(query.encode()).hexdigest()[:12]
+                    ts_minute = int(time.time()) // 60
+                    await charge_credits_post_deduct(
+                        user_id=user_id,
+                        amount=1,
+                        service="rag.semantic_search",
+                        idempotency_key=f"rag-search:{query_hash}:{user_id}:{ts_minute}",
+                    )
+                except Exception as billing_err:
+                    logger.warning("rag_billing_failed", error=str(billing_err))
+
             return result
             
         except Exception as e:
diff --git a/python-backend/app/services/credit_billing_client.py b/python-backend/app/services/credit_billing_client.py
new file mode 100644
index 0000000..23b5a7b
--- /dev/null
+++ b/python-backend/app/services/credit_billing_client.py
@@ -0,0 +1,90 @@
+"""
+Credit billing client -- calls Node.js internal credit endpoint.
+
+Post-deduct pattern: charges credits after successful operation.
+Failures are logged but do not fail the parent operation.
+"""
+
+import logging
+from typing import Any, Dict, Optional
+
+import httpx
+
+from app.core.config import settings
+
+logger = logging.getLogger(__name__)
+
+
+async def charge_credits_post_deduct(
+    user_id: int,
+    chunk_count: Optional[int] = None,
+    amount: Optional[int] = None,
+    service: str = "library.upload_index",
+    idempotency_key: Optional[str] = None,
+    metadata: Optional[Dict[str, Any]] = None,
+) -> Optional[Dict[str, Any]]:
+    """Charge credits via the Node.js internal endpoint.
+
+    Post-deduct: if billing fails, the operation is NOT rolled back.
+    The failure is logged for manual reconciliation.
+    """
+    base_url = (settings.SMARTSPEC_WEB_GATEWAY_URL or "").rstrip("/")
+    token = settings.SMARTSPEC_WEB_GATEWAY_TOKEN or ""
+
+    if not base_url or not token:
+        logger.warning(
+            "credit_billing_skipped: SMARTSPEC_WEB_GATEWAY_URL or TOKEN not configured",
+            extra={"user_id": user_id, "service": service},
+        )
+        return None
+
+    payload: Dict[str, Any] = {
+        "userId": user_id,
+        "service": service,
+    }
+    if chunk_count is not None:
+        payload["chunkCount"] = chunk_count
+    if amount is not None:
+        payload["amount"] = amount
+    if idempotency_key:
+        payload["idempotencyKey"] = idempotency_key
+    if metadata:
+        payload["metadata"] = metadata
+
+    try:
+        async with httpx.AsyncClient(timeout=10.0) as client:
+            resp = await client.post(
+                f"{base_url}/api/internal/credits/charge",
+                json=payload,
+                headers={"Authorization": f"Bearer {token}"},
+            )
+
+        if resp.status_code == 200:
+            data = resp.json()
+            logger.info(
+                "credit_billing_success",
+                extra={
+                    "user_id": user_id,
+                    "service": service,
+                    "credits_used": data.get("creditsUsed", 0),
+                },
+            )
+            return data
+        else:
+            logger.warning(
+                "credit_billing_failed",
+                extra={
+                    "user_id": user_id,
+                    "service": service,
+                    "status": resp.status_code,
+                    "response": resp.text[:200],
+                },
+            )
+            return None
+
+    except Exception as exc:
+        logger.error(
+            "credit_billing_error",
+            extra={"user_id": user_id, "service": service, "error": str(exc)},
+        )
+        return None
diff --git a/python-backend/app/services/drive_billing.py b/python-backend/app/services/drive_billing.py
new file mode 100644
index 0000000..778efad
--- /dev/null
+++ b/python-backend/app/services/drive_billing.py
@@ -0,0 +1,39 @@
+"""
+Drive billing formula functions.
+
+Pure functions for calculating credit costs of Google Drive operations.
+Used by MCP handlers and the indexing pipeline.
+"""
+
+import math
+
+
+def calculate_drive_index_cost(chunk_count: int, cost_per_chunk: int = 2) -> int:
+    """Calculate credits for indexing a Drive file.
+
+    Formula: ceil(chunk_count) * cost_per_chunk.
+    Returns 0 if chunk_count <= 0.
+    """
+    if chunk_count <= 0:
+        return 0
+    return math.ceil(chunk_count) * cost_per_chunk
+
+
+def calculate_mcp_read_cost(text_length: int, max_cost: int = 5) -> int:
+    """Calculate credits for reading a Drive file via MCP.
+
+    Formula: max(1, ceil(text_length / 2000)), capped at max_cost.
+    """
+    if text_length <= 0:
+        return 1
+    return min(max(1, math.ceil(text_length / 2000)), max_cost)
+
+
+def calculate_mcp_sheet_cost(cell_count: int, max_cost: int = 3) -> int:
+    """Calculate credits for reading a spreadsheet via MCP.
+
+    Formula: max(1, ceil(cell_count / 500)), capped at max_cost.
+    """
+    if cell_count <= 0:
+        return 1
+    return min(max(1, math.ceil(cell_count / 500)), max_cost)
diff --git a/python-backend/app/services/library_indexing_service.py b/python-backend/app/services/library_indexing_service.py
index 4be40b8..910a47d 100644
--- a/python-backend/app/services/library_indexing_service.py
+++ b/python-backend/app/services/library_indexing_service.py
@@ -13,6 +13,7 @@ from app.core.vectordb import VectorCollection
 from app.models.library import LibraryChunk, LibraryIndexJob, LibraryItem
 from app.services.embedding_service import EmbeddingService, get_embedding_service
 from app.services.library_observability import emit_metric, log_observability_event
+from app.services.credit_billing_client import charge_credits_post_deduct
 
 logger = structlog.get_logger()
 
@@ -598,6 +599,15 @@ async def process_library_index_job(
             attempt_count=job.attempt_count,
         )
 
+        # Post-deduct credit billing for indexing
+        service_tag = "library.save_reindex" if job.job_type == "reindex" else "library.upload_index"
+        await charge_credits_post_deduct(
+            user_id=item.owner_user_id,
+            chunk_count=len(chunks),
+            service=service_tag,
+            idempotency_key=f"library-index:{job.id}",
+        )
+
         return {
             "job_id": job.id,
             "status": COMPLETED_STATUS,
diff --git a/python-backend/tests/test_drive_billing.py b/python-backend/tests/test_drive_billing.py
new file mode 100644
index 0000000..28d126c
--- /dev/null
+++ b/python-backend/tests/test_drive_billing.py
@@ -0,0 +1,56 @@
+"""Tests for Drive billing formula functions."""
+
+import pytest
+from app.services.drive_billing import (
+    calculate_drive_index_cost,
+    calculate_mcp_read_cost,
+    calculate_mcp_sheet_cost,
+)
+
+
+@pytest.mark.unit
+class TestDriveBillingFormulas:
+    """Pure function tests -- no async or DB needed."""
+
+    def test_drive_index_cost_basic(self):
+        assert calculate_drive_index_cost(chunk_count=7) == 14
+        assert calculate_drive_index_cost(chunk_count=1) == 2
+
+    def test_drive_index_cost_zero(self):
+        assert calculate_drive_index_cost(chunk_count=0) == 0
+
+    def test_drive_index_cost_negative(self):
+        assert calculate_drive_index_cost(chunk_count=-1) == 0
+
+    def test_drive_index_cost_custom_rate(self):
+        assert calculate_drive_index_cost(chunk_count=5, cost_per_chunk=3) == 15
+
+    def test_mcp_read_cost_small(self):
+        assert calculate_mcp_read_cost(text_length=100) == 1
+
+    def test_mcp_read_cost_boundary(self):
+        assert calculate_mcp_read_cost(text_length=2000) == 1
+
+    def test_mcp_read_cost_over_boundary(self):
+        assert calculate_mcp_read_cost(text_length=2001) == 2
+
+    def test_mcp_read_cost_large(self):
+        assert calculate_mcp_read_cost(text_length=10000) == 5  # cap
+
+    def test_mcp_read_cost_very_large(self):
+        assert calculate_mcp_read_cost(text_length=20000) == 5  # cap
+
+    def test_mcp_sheet_cost_small(self):
+        assert calculate_mcp_sheet_cost(cell_count=100) == 1
+
+    def test_mcp_sheet_cost_boundary(self):
+        assert calculate_mcp_sheet_cost(cell_count=500) == 1
+
+    def test_mcp_sheet_cost_over_boundary(self):
+        assert calculate_mcp_sheet_cost(cell_count=501) == 2
+
+    def test_mcp_sheet_cost_large(self):
+        assert calculate_mcp_sheet_cost(cell_count=1500) == 3  # cap
+
+    def test_mcp_sheet_cost_very_large(self):
+        assert calculate_mcp_sheet_cost(cell_count=5000) == 3  # cap
diff --git a/python-backend/tests/test_rag_billing.py b/python-backend/tests/test_rag_billing.py
new file mode 100644
index 0000000..92070db
--- /dev/null
+++ b/python-backend/tests/test_rag_billing.py
@@ -0,0 +1,60 @@
+"""Tests for RAG query billing integration."""
+
+import pytest
+from unittest.mock import AsyncMock, patch
+
+
+@pytest.mark.unit
+@pytest.mark.asyncio
+class TestRagBilling:
+    """Tests for credit billing in the RAG retrieve path."""
+
+    async def test_semantic_search_charges_credits(self):
+        """Semantic search mode should trigger credit billing."""
+        from app.orchestrator.rag.hybrid_rag import HybridRAGEngine, SearchMode, RAGConfig
+
+        mock_vector = AsyncMock()
+        mock_vector.retrieve.return_value = []
+        engine = HybridRAGEngine(
+            config=RAGConfig(mode=SearchMode.SEMANTIC),
+            vector_retriever=mock_vector,
+        )
+
+        with patch("app.services.credit_billing_client.charge_credits_post_deduct") as mock_charge:
+            mock_charge.return_value = {"creditsUsed": 1}
+            await engine.retrieve("test query", user_id=42)
+            mock_charge.assert_called_once()
+            call_kwargs = mock_charge.call_args[1]
+            assert call_kwargs["user_id"] == 42
+            assert call_kwargs["amount"] == 1
+            assert call_kwargs["service"] == "rag.semantic_search"
+
+    async def test_keyword_search_does_not_charge(self):
+        """BM25-only (keyword) search should NOT trigger billing."""
+        from app.orchestrator.rag.hybrid_rag import HybridRAGEngine, SearchMode, RAGConfig
+
+        mock_bm25 = AsyncMock()
+        mock_bm25.retrieve.return_value = []
+        engine = HybridRAGEngine(
+            config=RAGConfig(mode=SearchMode.KEYWORD),
+            bm25_retriever=mock_bm25,
+        )
+
+        with patch("app.services.credit_billing_client.charge_credits_post_deduct") as mock_charge:
+            await engine.retrieve("keyword query", user_id=42)
+            mock_charge.assert_not_called()
+
+    async def test_no_user_id_no_billing(self):
+        """When user_id is None, no billing should occur."""
+        from app.orchestrator.rag.hybrid_rag import HybridRAGEngine, SearchMode, RAGConfig
+
+        mock_vector = AsyncMock()
+        mock_vector.retrieve.return_value = []
+        engine = HybridRAGEngine(
+            config=RAGConfig(mode=SearchMode.SEMANTIC),
+            vector_retriever=mock_vector,
+        )
+
+        with patch("app.services.credit_billing_client.charge_credits_post_deduct") as mock_charge:
+            await engine.retrieve("test query", user_id=None)
+            mock_charge.assert_not_called()
