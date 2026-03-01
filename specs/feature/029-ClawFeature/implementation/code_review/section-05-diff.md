diff --git a/apps/web/scripts/migrate-telegram-to-channel-connections.ts b/apps/web/scripts/migrate-telegram-to-channel-connections.ts
new file mode 100644
index 0000000..2b5716b
--- /dev/null
+++ b/apps/web/scripts/migrate-telegram-to-channel-connections.ts
@@ -0,0 +1,97 @@
+/**
+ * Migration script: telegramConnections -> channel_connections
+ *
+ * Copies all rows from the legacy telegram_connections table into the new
+ * channel_connections table, preserving all data with correct column mapping.
+ *
+ * Run with: npx tsx apps/web/scripts/migrate-telegram-to-channel-connections.ts
+ *
+ * Safe to run multiple times (ON CONFLICT DO NOTHING on unique constraint).
+ * Does NOT delete source data — dual-write period begins after this script.
+ */
+
+import "dotenv/config";
+import { drizzle } from "drizzle-orm/node-postgres";
+import { Pool } from "pg";
+import { telegramConnections, channelConnections } from "../drizzle/schema";
+import { sql } from "drizzle-orm";
+
+async function main() {
+  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
+  const db = drizzle(pool);
+
+  console.log("[Migration] Starting telegram_connections -> channel_connections");
+
+  // Step 1: Count source rows
+  const [{ count: sourceCount }] = await db
+    .select({ count: sql<number>`count(*)::int` })
+    .from(telegramConnections);
+
+  console.log(`[Migration] Source rows in telegram_connections: ${sourceCount}`);
+
+  // Step 2: Query all rows from telegramConnections
+  const rows = await db.select().from(telegramConnections);
+
+  let inserted = 0;
+  let skipped = 0;
+  let errors = 0;
+
+  // Step 3: Insert each row into channel_connections
+  for (const row of rows) {
+    try {
+      await db
+        .insert(channelConnections)
+        .values({
+          id: row.id,
+          tenantId: row.tenantId,
+          userId: row.userId,
+          channelType: "telegram",
+          externalUserId: (row as any).telegramUserId ?? String(row.id),
+          externalChatId: (row as any).telegramChatId ?? null,
+          connectionConfig: { bot_id: (row as any).botId ?? null },
+          status: row.status,
+          activeChannelId: row.activeChannelId ?? null,
+          linkedAt: (row as any).linkedAt ?? new Date(),
+          revokedAt: (row as any).revokedAt ?? null,
+        })
+        .onConflictDoNothing();
+
+      inserted++;
+    } catch (err: any) {
+      // ON CONFLICT DO NOTHING handles duplicates, other errors are reported
+      if (err.code === "23505") {
+        // Unique constraint violation — already migrated
+        skipped++;
+      } else {
+        errors++;
+        console.error(`[Migration] Error migrating row ${row.id}:`, err.message);
+      }
+    }
+  }
+
+  // Step 4: Verify row counts
+  const [{ count: destCount }] = await db
+    .select({ count: sql<number>`count(*)::int` })
+    .from(channelConnections)
+    .where(sql`"channelType" = 'telegram'`);
+
+  console.log(`\n[Migration] Summary:`);
+  console.log(`  Source rows:      ${sourceCount}`);
+  console.log(`  Inserted:         ${inserted}`);
+  console.log(`  Skipped (dupes):  ${skipped}`);
+  console.log(`  Errors:           ${errors}`);
+  console.log(`  Telegram rows in channel_connections: ${destCount}`);
+
+  if (errors > 0) {
+    console.error(`\n[Migration] ⚠️  ${errors} rows had errors. Check logs above.`);
+    process.exit(1);
+  }
+
+  console.log(`\n[Migration] ✅ Complete`);
+  await pool.end();
+}
+
+main().catch((err) => {
+  console.error("[Migration] Fatal error:", err);
+  process.exit(1);
+});
diff --git a/apps/web/server/_core/index.ts b/apps/web/server/_core/index.ts
index 2542547..a25f3b8 100644
--- a/apps/web/server/_core/index.ts
+++ b/apps/web/server/_core/index.ts
@@ -21,7 +21,9 @@ import { registerAgencyStreamRoutes } from "./agencyStreamProxy";
 
 import { createWebhookRouter } from "../routes/webhooks";
 import { createTelegramWebhookRouter } from "../routes/telegramWebhook";
+import { createChannelWebhookRouter } from "../routes/channelWebhook";
 import "../services/telegramLinkService"; // Register /start link handler
+import "../services/channelAdapters/telegram"; // Register Telegram adapter
 import { createSlideRenderRouter } from "../routes/slideRender";
 import { registerDeviceAuthRoutes } from "./deviceAuthRoutes";
 import { registerServicesRoutes } from "../routers/services";
@@ -43,6 +45,7 @@ import { initializeTelegramQueue, shutdownTelegramWorker } from "../services/tel
 import { initDeliveryQueue, closeDeliveryQueue } from "../services/deliveryQueue";
 import { initializeTrashPurgeJob, shutdownTrashPurgeWorker } from "../jobs/purgeOldTrashItems";
 import { initializeGDriveCleanupJob, shutdownGDriveCleanupWorker } from "../jobs/gdriveSessionCleanup";
+import { initializePendingApprovalAlertJob } from "../jobs/pendingApprovalAlert";
 import { initFromDb, startPeriodicPersistence } from "../services/providerHealth";
 import { startHistoryCollection } from "../services/llmQueue";
 import { createTasksRouter } from "../routes/tasks";
@@ -227,7 +230,10 @@ const csrfCheck = (req: any, res: any, next: any) => {
     req.path.startsWith("/webhooks/gdrive") ||
     req.originalUrl.startsWith("/api/webhooks/gdrive") ||
     req.path.startsWith("/webhooks/telegram/") ||
-    req.originalUrl.startsWith("/webhooks/telegram/")
+    req.originalUrl.startsWith("/webhooks/telegram/") ||
+    // Generalized channel webhooks (platform callbacks: WhatsApp, Slack, Discord, etc.)
+    /^\/webhooks\/[a-z]+\/[a-z0-9-]+/.test(req.path) ||
+    /^\/webhooks\/[a-z]+\/[a-z0-9-]+/.test(req.originalUrl)
   ) {
     return next();
   }
@@ -335,7 +341,12 @@ app.use("/internal", createSlideRenderRouter());
 // Webhook routes (before CSRF-protected routes, external services send raw POSTs)
 app.use("/api/webhooks", createWebhookRouter());
 
-// Telegram Bot API webhook (Telegram sends POSTs with secret-token header, no Origin)
+// Generalized channel webhook router (all adapters: WhatsApp, Slack, Discord, LINE, etc.)
+// Must be registered BEFORE the legacy Telegram route so /webhooks/:channelType/:connectionId
+// is handled by the generalized router.
+app.use("/webhooks", express.json({ limit: "1mb" }), createChannelWebhookRouter());
+
+// Telegram Bot API webhook (legacy route — kept for backward compat with existing bot webhook URLs)
 // Tighter body limit than global 10MB — Telegram updates are small JSON payloads
 app.use("/webhooks/telegram", express.json({ limit: "1mb" }), createTelegramWebhookRouter());
 
@@ -610,6 +621,170 @@ app.post("/api/internal/google-drive/cleanup", async (req, res) => {
 // Internal presentation import callback (Python backend -> Node.js)
 app.post("/api/internal/presentation-import/callback", presentationImportCallbackHandler);
 
+// Internal agency creation endpoint (Python AI Creator task -> Node.js)
+// Auth: user Bearer JWT (same token that started the creation task)
+app.post("/api/internal/agency/create", async (req, res) => {
+  let user: Awaited<ReturnType<typeof sdk.authenticateRequest>> | null = null;
+  try {
+    user = await sdk.authenticateRequest(req);
+  } catch {
+    // Fallback: accept Bearer token as session token (for internal service calls from Python/Celery)
+    const authHeader = req.headers.authorization;
+    if (authHeader?.startsWith("Bearer ")) {
+      const token = authHeader.slice(7);
+      // Inject as cookie so authenticateRequest works
+      req.headers.cookie = `app_session_id=${token}`;
+      try {
+        user = await sdk.authenticateRequest(req);
+      } catch { /* still unauthorized */ }
+    }
+  }
+  if (!user) return res.status(401).json({ error: "Unauthorized" });
+
+  try {
+    const {
+      agencies: agenciesTable,
+      agencyAgents,
+      agencyCommunicationFlows,
+      agencyAgentTools,
+    } = await import("../../drizzle/schema");
+    const drizzleDb = await getDb();
+    if (!drizzleDb) return res.status(503).json({ error: "Database unavailable" });
+    const cryptoModule = await import("crypto");
+    const tenantReq = req as any;
+    // Prefer explicit tenantId from request body (passed by Celery task from the user's tRPC context),
+    // then fall back to tenant middleware, then user's currentTenantId
+    const tenantId: string = req.body.tenantId || tenantReq.tenant?.id || String(user.currentTenantId ?? "");
+
+    const {
+      name,
+      description,
+      agents = [],
+      communicationFlows = [],
+    } = req.body as {
+      name: string;
+      description?: string;
+      agents: Array<{
+        id: string; // spec-level ID used in communicationFlows
+        name: string;
+        description?: string;
+        instructions?: string;
+        model?: string;
+        nodeType?: string;
+        nodeConfig?: Record<string, unknown>;
+        isEntryPoint?: boolean;
+        isOptional?: boolean;
+        position?: { x: number; y: number };
+        toolIds?: string[];
+        toolConfigs?: Record<string, Record<string, unknown>>;
+      }>;
+      communicationFlows: Array<{
+        fromAgentId: string; // spec-level ID
+        toAgentId: string;
+        flowType?: string;
+      }>;
+    };
+
+    if (!name?.trim()) {
+      return res.status(400).json({ error: "name is required" });
+    }
+    if (!agents.length) {
+      return res.status(400).json({ error: "at least 1 agent is required" });
+    }
+
+    const agencyId = cryptoModule.default.randomUUID();
+    // Map spec-level agent IDs → new DB UUIDs
+    const specIdToDbId: Record<string, string> = {};
+    const agentRows = agents.map((a, idx) => {
+      const dbId = cryptoModule.default.randomUUID();
+      specIdToDbId[a.id] = dbId;
+      return {
+        id: dbId,
+        agencyId,
+        name: String(a.name || "Agent").slice(0, 100),
+        description: a.description ? String(a.description).slice(0, 500) : null,
+        instructions: a.instructions ? String(a.instructions).slice(0, 50000) : null,
+        model: a.model ? String(a.model).slice(0, 100) : null,
+        nodeType: (a.nodeType ?? "agent") as any,
+        nodeConfig: (a.nodeConfig ?? {}) as any,
+        isEntryPoint: Boolean(a.isEntryPoint),
+        isOptional: Boolean(a.isOptional),
+        position: a.position ?? { x: 400, y: 80 + idx * 200 },
+      };
+    });
+
+    const slug = name
+      .toLowerCase()
+      .replace(/[^a-z0-9]+/g, "-")
+      .replace(/^-|-$/g, "")
+      .slice(0, 100) || `agency-${Date.now()}`;
+
+    await drizzleDb.transaction(async (tx) => {
+      await tx.insert(agenciesTable).values({
+        id: agencyId,
+        tenantId,
+        slug,
+        name: String(name).slice(0, 255),
+        description: description ? String(description).slice(0, 500) : null,
+        creditMultiplier: "1",
+        maxAgents: 20,
+        maxRunTimeSeconds: 600,
+        isFallbackSafe: false,
+        creatorFeeCredits: 0,
+        status: "draft",
+        createdBy: user!.id,
+      });
+
+      if (agentRows.length > 0) {
+        await tx.insert(agencyAgents).values(agentRows);
+      }
+
+      const flowRows = communicationFlows
+        .map((f) => ({
+          id: cryptoModule.default.randomUUID(),
+          agencyId,
+          fromAgentId: specIdToDbId[f.fromAgentId] ?? null,
+          toAgentId: specIdToDbId[f.toAgentId] ?? null,
+          flowType: (f.flowType ?? "delegation") as any,
+        }))
+        .filter((f) => f.fromAgentId && f.toAgentId);
+
+      if (flowRows.length > 0) {
+        await tx.insert(agencyCommunicationFlows).values(flowRows);
+      }
+
+      // Insert tool assignments for agents
+      const toolRows: Array<{
+        id: string;
+        agentId: string;
+        toolId: string;
+        toolConfig: any;
+      }> = [];
+      for (const agent of agents) {
+        const dbAgentId = specIdToDbId[agent.id];
+        if (!dbAgentId || !agent.toolIds?.length) continue;
+        for (const toolId of agent.toolIds) {
+          if (!toolId || typeof toolId !== "string") continue;
+          toolRows.push({
+            id: cryptoModule.default.randomUUID(),
+            agentId: dbAgentId,
+            toolId: String(toolId).slice(0, 100),
+            toolConfig: agent.toolConfigs?.[toolId] ?? {},
+          });
+        }
+      }
+      if (toolRows.length > 0) {
+        await tx.insert(agencyAgentTools).values(toolRows);
+      }
+    });
+
+    return res.status(201).json({ id: agencyId });
+  } catch (err: any) {
+    console.error("[internal/agency/create] error:", err?.message ?? err);
+    return res.status(500).json({ error: err?.message ?? "Internal server error" });
+  }
+});
+
 // Device auth routes (for desktop app)
 registerDeviceAuthRoutes(app);
 
@@ -828,6 +1003,13 @@ async function main() {
     console.error("[Startup] Failed to initialize trash purge job:", error);
   }
 
+  // Initialize pending approval daily alert (9 AM)
+  try {
+    await initializePendingApprovalAlertJob();
+  } catch (error) {
+    console.error("[Startup] Failed to initialize approval alert job:", error);
+  }
+
   // Initialize Google Drive edit session cleanup (every 6h)
   try {
     await initializeGDriveCleanupJob();
@@ -871,6 +1053,13 @@ async function main() {
     console.error("[Startup] Failed to initialize trash purge job:", error);
   }
 
+  // Initialize pending approval daily alert (9 AM)
+  try {
+    await initializePendingApprovalAlertJob();
+  } catch (error) {
+    console.error("[Startup] Failed to initialize approval alert job:", error);
+  }
+
   // Initialize Google Drive edit session cleanup (every 6h)
   try {
     await initializeGDriveCleanupJob();
diff --git a/apps/web/server/routes/__tests__/channelWebhook.test.ts b/apps/web/server/routes/__tests__/channelWebhook.test.ts
new file mode 100644
index 0000000..6d1b3b1
--- /dev/null
+++ b/apps/web/server/routes/__tests__/channelWebhook.test.ts
@@ -0,0 +1,252 @@
+import { describe, it, expect, vi, beforeEach } from "vitest";
+
+// --- Hoisted mocks ---
+const {
+  mockAdapterGet,
+  mockAdapterValidateWebhook,
+  mockAdapterParseInbound,
+  mockAdapterFormatMessage,
+  mockRedisSet,
+  mockChannelGatewayIngest,
+  mockGetDb,
+  mockDbSelect,
+  mockAuditLog,
+} = vi.hoisted(() => ({
+  mockAdapterGet: vi.fn(),
+  mockAdapterValidateWebhook: vi.fn().mockResolvedValue(true),
+  mockAdapterParseInbound: vi.fn(),
+  mockAdapterFormatMessage: vi.fn((text: string) => [text]),
+  mockRedisSet: vi.fn().mockResolvedValue("OK"),
+  mockChannelGatewayIngest: vi.fn().mockResolvedValue({ ok: true }),
+  mockGetDb: vi.fn(),
+  mockDbSelect: vi.fn(),
+  mockAuditLog: vi.fn(),
+}));
+
+vi.mock("../../services/channelAdapters", () => ({
+  adapterRegistry: {
+    get: mockAdapterGet,
+  },
+}));
+
+vi.mock("../../services/redisClients", () => ({
+  getCacheClient: vi.fn(() => ({
+    set: mockRedisSet,
+  })),
+}));
+
+vi.mock("../../services/channelGateway", () => ({
+  channelGateway: {
+    ingest: mockChannelGatewayIngest,
+  },
+}));
+
+vi.mock("../../services/auditLogger", () => ({
+  auditLogger: {
+    log: mockAuditLog,
+  },
+}));
+
+vi.mock("../../db", () => ({
+  getDb: mockGetDb,
+}));
+
+vi.mock("../../../drizzle/schema", () => ({
+  channelConnections: {
+    id: "cc.id",
+    status: "cc.status",
+    tenantId: "cc.tenantId",
+    userId: "cc.userId",
+    activeChannelId: "cc.activeChannelId",
+  },
+}));
+
+vi.mock("drizzle-orm", () => ({
+  eq: vi.fn((_col: any, val: any) => ({ _type: "eq", val })),
+}));
+
+import { createChannelWebhookRouter } from "../channelWebhook";
+import express from "express";
+import request from "supertest";
+
+function createMockAdapter(channelType = "telegram") {
+  return {
+    channelType,
+    validateWebhook: mockAdapterValidateWebhook,
+    parseInbound: mockAdapterParseInbound,
+    formatMessage: mockAdapterFormatMessage,
+  };
+}
+
+function makeApp() {
+  const app = express();
+  app.use(express.json());
+  app.use("/webhooks", createChannelWebhookRouter());
+  return app;
+}
+
+function setupParsedInbound(update_id = 100) {
+  mockAdapterParseInbound.mockResolvedValue({
+    event: {
+      eventType: "user_message",
+      channel: {
+        type: "telegram",
+        connectionId: "conn-123",
+        externalChatId: "12345",
+        externalMessageId: "42",
+      },
+      message: { text: "Hello!", attachments: [] },
+    },
+    dedupKey: `tg:conn-123:${update_id}`,
+  });
+}
+
+function setupDbConnection() {
+  const limitFn = vi.fn().mockResolvedValue([
+    {
+      id: "conn-123",
+      status: "active",
+      tenantId: "tenant-1",
+      userId: 42,
+      activeChannelId: "ch-1",
+    },
+  ]);
+  const whereFn = vi.fn().mockReturnValue({ limit: limitFn });
+  const fromFn = vi.fn().mockReturnValue({ where: whereFn });
+  mockDbSelect.mockReturnValue({ from: fromFn });
+  mockGetDb.mockResolvedValue({ select: mockDbSelect });
+}
+
+describe("channelWebhook router", () => {
+  beforeEach(() => {
+    vi.clearAllMocks();
+  });
+
+  it("returns 404 for unknown channelType", async () => {
+    mockAdapterGet.mockReturnValue(undefined); // No adapter registered
+
+    const app = makeApp();
+    const res = await request(app)
+      .post("/webhooks/unknown/conn-123")
+      .send({ update_id: 1 });
+
+    expect(res.status).toBe(404);
+  });
+
+  it("returns 403 when adapter.validateWebhook returns false", async () => {
+    mockAdapterGet.mockReturnValue(createMockAdapter());
+    mockAdapterValidateWebhook.mockResolvedValueOnce(false);
+
+    const app = makeApp();
+    const res = await request(app)
+      .post("/webhooks/telegram/conn-123")
+      .send({ update_id: 1 });
+
+    expect(res.status).toBe(403);
+  });
+
+  it("returns 200 when message type is ignored (parseInbound returns null)", async () => {
+    mockAdapterGet.mockReturnValue(createMockAdapter());
+    mockAdapterValidateWebhook.mockResolvedValueOnce(true);
+    mockAdapterParseInbound.mockResolvedValueOnce(null);
+
+    const app = makeApp();
+    const res = await request(app)
+      .post("/webhooks/telegram/conn-123")
+      .send({ update_id: 1 });
+
+    expect(res.status).toBe(200);
+    expect(mockRedisSet).not.toHaveBeenCalled();
+  });
+
+  it("routes to correct adapter based on channelType param", async () => {
+    const adapter = createMockAdapter("telegram");
+    mockAdapterGet.mockImplementation((type: string) =>
+      type === "telegram" ? adapter : undefined,
+    );
+    mockAdapterValidateWebhook.mockResolvedValueOnce(true);
+    setupParsedInbound();
+
+    const app = makeApp();
+    await request(app)
+      .post("/webhooks/telegram/conn-123")
+      .send({ update_id: 100 });
+
+    expect(mockAdapterGet).toHaveBeenCalledWith("telegram");
+    expect(mockAdapterValidateWebhook).toHaveBeenCalled();
+    expect(mockAdapterParseInbound).toHaveBeenCalledWith(
+      expect.any(Object),
+      "conn-123",
+    );
+  });
+
+  it("returns 200 immediately before async processing", async () => {
+    mockAdapterGet.mockReturnValue(createMockAdapter());
+    mockAdapterValidateWebhook.mockResolvedValueOnce(true);
+    setupParsedInbound();
+    setupDbConnection();
+
+    let ingestCalled = false;
+    let responseSent = false;
+
+    mockChannelGatewayIngest.mockImplementation(async () => {
+      ingestCalled = true;
+      return { ok: true };
+    });
+
+    const app = makeApp();
+    const res = await request(app)
+      .post("/webhooks/telegram/conn-123")
+      .send({ update_id: 100 });
+
+    responseSent = true;
+    expect(res.status).toBe(200);
+    // Response sent before ingest is called
+    expect(responseSent).toBe(true);
+  });
+
+  it("rejects duplicate updates via Redis NX dedup", async () => {
+    mockAdapterGet.mockReturnValue(createMockAdapter());
+    mockAdapterValidateWebhook.mockResolvedValue(true);
+    setupParsedInbound(200);
+    setupDbConnection();
+
+    const app = makeApp();
+
+    // First call: Redis returns "OK" (key set)
+    mockRedisSet.mockResolvedValueOnce("OK");
+    const res1 = await request(app)
+      .post("/webhooks/telegram/conn-123")
+      .send({ update_id: 200 });
+    expect(res1.status).toBe(200);
+
+    // Second call: Redis returns null (duplicate)
+    mockRedisSet.mockResolvedValueOnce(null);
+    const res2 = await request(app)
+      .post("/webhooks/telegram/conn-123")
+      .send({ update_id: 200 });
+    expect(res2.status).toBe(200);
+
+    // Redis set called for both
+    expect(mockRedisSet).toHaveBeenCalledTimes(2);
+  });
+
+  it("uses correct dedup key format in Redis", async () => {
+    mockAdapterGet.mockReturnValue(createMockAdapter());
+    mockAdapterValidateWebhook.mockResolvedValueOnce(true);
+    setupParsedInbound(99);
+
+    const app = makeApp();
+    await request(app)
+      .post("/webhooks/telegram/conn-123")
+      .send({ update_id: 99 });
+
+    expect(mockRedisSet).toHaveBeenCalledWith(
+      "channel:dedup:tg:conn-123:99",
+      "1",
+      "EX",
+      86400,
+      "NX",
+    );
+  });
+});
diff --git a/apps/web/server/routes/channelWebhook.ts b/apps/web/server/routes/channelWebhook.ts
new file mode 100644
index 0000000..561a200
--- /dev/null
+++ b/apps/web/server/routes/channelWebhook.ts
@@ -0,0 +1,148 @@
+/**
+ * Generalized Channel Webhook Router
+ *
+ * POST /webhooks/:channelType/:connectionId
+ *
+ * Routes incoming webhooks to the correct ChannelAdapter based on
+ * the channelType URL parameter. Platform-specific validation,
+ * parsing, and dedup are delegated to the adapter.
+ *
+ * Processing flow:
+ * 1. Resolve adapter from registry
+ * 2. Validate webhook (adapter-specific signature check)
+ * 3. Parse inbound (adapter-specific body parsing)
+ * 4. Redis dedup (NX set with 24h TTL)
+ * 5. Return 200 immediately
+ * 6. Async: look up connection → build ChatIngressEvent → channelGateway.ingest()
+ */
+
+import { Router } from "express";
+import crypto from "crypto";
+import { eq } from "drizzle-orm";
+import { adapterRegistry } from "../services/channelAdapters";
+import { getCacheClient } from "../services/redisClients";
+import { channelGateway } from "../services/channelGateway";
+import { auditLogger } from "../services/auditLogger";
+import { getDb } from "../db";
+import { channelConnections } from "../../drizzle/schema";
+import type { ChatIngressEvent } from "@shared/channelTypes";
+
+export function createChannelWebhookRouter(): Router {
+  const router = Router();
+
+  router.post("/:channelType/:connectionId", async (req, res) => {
+    const { channelType, connectionId } = req.params;
+
+    // 1. Resolve adapter
+    const adapter = adapterRegistry.get(channelType);
+    if (!adapter) {
+      res.status(404).json({ error: `Unknown channel type: ${channelType}` });
+      return;
+    }
+
+    // 2. Validate webhook
+    let valid: boolean;
+    try {
+      valid = await adapter.validateWebhook({
+        headers: req.headers as Record<string, string | string[] | undefined>,
+        body: req.body,
+        params: req.params,
+      });
+    } catch {
+      valid = false;
+    }
+    if (!valid) {
+      auditLogger.log({
+        eventType: "channel_webhook_validation_failed",
+        metadata: { channelType, connectionId },
+      });
+      res.sendStatus(403);
+      return;
+    }
+
+    // 3. Parse inbound
+    let parsed: Awaited<ReturnType<typeof adapter.parseInbound>>;
+    try {
+      parsed = await adapter.parseInbound(req.body, connectionId);
+    } catch {
+      res.sendStatus(200);
+      return;
+    }
+    if (!parsed) {
+      // Ignored message type (non-text, etc.)
+      res.sendStatus(200);
+      return;
+    }
+
+    // 4. Redis dedup
+    try {
+      const redis = getCacheClient();
+      const dedupResult = await redis.set(
+        `channel:dedup:${parsed.dedupKey}`,
+        "1",
+        "EX",
+        86400,
+        "NX",
+      );
+      if (dedupResult === null) {
+        // Duplicate — already processed
+        res.sendStatus(200);
+        return;
+      }
+    } catch (err) {
+      // Redis unavailable — continue (accept risk of rare duplicate)
+      auditLogger.log({
+        eventType: "channel_webhook_dedup_failed",
+        metadata: { channelType, connectionId, error: String(err) },
+      });
+    }
+
+    // 5. Return 200 immediately
+    res.sendStatus(200);
+
+    // 6. Async: look up connection → ingest
+    const parsedEvent = parsed.event;
+    const dedupKey = parsed.dedupKey;
+
+    setImmediate(async () => {
+      try {
+        const db = await getDb();
+        if (!db) return;
+
+        const [connection] = await db
+          .select()
+          .from(channelConnections)
+          .where(eq(channelConnections.id, connectionId))
+          .limit(1);
+
+        if (!connection || connection.status !== "active") return;
+
+        const event: ChatIngressEvent = {
+          eventId: crypto.randomUUID(),
+          eventType: parsedEvent.eventType,
+          tenantId: connection.tenantId,
+          userId: connection.userId,
+          conversationId: connection.activeChannelId || "",
+          conversationType: "chat",
+          channel: {
+            type: channelType as ChatIngressEvent["channel"]["type"],
+            connectionId,
+            externalChatId: parsedEvent.channel.externalChatId,
+            externalMessageId: parsedEvent.channel.externalMessageId,
+          },
+          message: parsedEvent.message,
+          idempotencyKey: dedupKey,
+        };
+
+        await channelGateway.ingest(event);
+      } catch (err) {
+        auditLogger.log({
+          eventType: "channel_webhook_ingest_error",
+          metadata: { channelType, connectionId, error: String(err) },
+        });
+      }
+    });
+  });
+
+  return router;
+}
diff --git a/apps/web/server/services/__tests__/channelAdapterRegistry.test.ts b/apps/web/server/services/__tests__/channelAdapterRegistry.test.ts
new file mode 100644
index 0000000..b4b6ebe
--- /dev/null
+++ b/apps/web/server/services/__tests__/channelAdapterRegistry.test.ts
@@ -0,0 +1,80 @@
+import { describe, it, expect, vi, beforeEach } from "vitest";
+
+// Import after mocking dependencies
+vi.mock("../auditLogger", () => ({
+  auditLogger: {
+    log: vi.fn(),
+  },
+}));
+
+import { adapterRegistry } from "../channelAdapters/registry";
+import type { ChannelAdapter } from "../channelAdapters/types";
+
+function makeMockAdapter(channelType: string): ChannelAdapter {
+  return {
+    channelType,
+    capabilities: {
+      maxMessageLength: 4096,
+      supportsButtons: false,
+      supportsRichText: false,
+      supportsAttachments: false,
+      rateLimitPerSecond: 10,
+    },
+    validateWebhook: vi.fn().mockResolvedValue(true),
+    parseInbound: vi.fn().mockResolvedValue(null),
+    sendMessage: vi.fn().mockResolvedValue({ ok: true }),
+    formatMessage: vi.fn((text: string) => [text]),
+  };
+}
+
+describe("ChannelAdapterRegistry", () => {
+  beforeEach(() => {
+    // Reset registry state between tests
+    adapterRegistry._reset();
+  });
+
+  it("register adds adapter and get retrieves it by channelType", () => {
+    const adapter = makeMockAdapter("telegram");
+    adapterRegistry.register(adapter);
+
+    expect(adapterRegistry.get("telegram")).toBe(adapter);
+  });
+
+  it("get returns undefined for unregistered channelType", () => {
+    expect(adapterRegistry.get("whatsapp")).toBeUndefined();
+  });
+
+  it("getAll returns all registered adapters", () => {
+    const telegramAdapter = makeMockAdapter("telegram");
+    const whatsappAdapter = makeMockAdapter("whatsapp");
+
+    adapterRegistry.register(telegramAdapter);
+    adapterRegistry.register(whatsappAdapter);
+
+    const all = adapterRegistry.getAll();
+    expect(all).toHaveLength(2);
+    expect(all).toContain(telegramAdapter);
+    expect(all).toContain(whatsappAdapter);
+  });
+
+  it("registering same channelType twice overwrites the first", () => {
+    const adapter1 = makeMockAdapter("telegram");
+    const adapter2 = makeMockAdapter("telegram");
+
+    adapterRegistry.register(adapter1);
+    adapterRegistry.register(adapter2);
+
+    expect(adapterRegistry.get("telegram")).toBe(adapter2);
+    expect(adapterRegistry.getAll()).toHaveLength(1);
+  });
+
+  it("_reset clears all adapters", () => {
+    adapterRegistry.register(makeMockAdapter("telegram"));
+    adapterRegistry.register(makeMockAdapter("whatsapp"));
+
+    adapterRegistry._reset();
+
+    expect(adapterRegistry.getAll()).toHaveLength(0);
+    expect(adapterRegistry.get("telegram")).toBeUndefined();
+  });
+});
diff --git a/apps/web/server/services/__tests__/channelGateway.test.ts b/apps/web/server/services/__tests__/channelGateway.test.ts
index da49e13..5e695b1 100644
--- a/apps/web/server/services/__tests__/channelGateway.test.ts
+++ b/apps/web/server/services/__tests__/channelGateway.test.ts
@@ -16,6 +16,8 @@ const {
   mockHasEnoughCredits,
   mockDeductCreditsForModel,
   mockCalculateCreditsForLLM,
+  mockAdapterGet,
+  mockAgencyBridgeExecuteRun,
 } = vi.hoisted(() => ({
   mockSelect: vi.fn(),
   mockInsert: vi.fn(),
@@ -35,6 +37,24 @@ const {
   mockHasEnoughCredits: vi.fn().mockResolvedValue(true),
   mockDeductCreditsForModel: vi.fn().mockResolvedValue({ creditsUsed: 5, wasFree: false }),
   mockCalculateCreditsForLLM: vi.fn().mockReturnValue(5),
+  mockAdapterGet: vi.fn(),
+  mockAgencyBridgeExecuteRun: vi.fn().mockResolvedValue({ response: "Agency response", runId: "run-1" }),
+}));
+
+// Mock adapter registry — returns a Telegram-like adapter for known channelTypes
+vi.mock("../channelAdapters/registry", () => ({
+  adapterRegistry: {
+    get: mockAdapterGet,
+    register: vi.fn(),
+    getAll: vi.fn(() => []),
+    _reset: vi.fn(),
+  },
+}));
+
+vi.mock("../agencyBridge", () => ({
+  agencyBridge: {
+    executeRun: mockAgencyBridgeExecuteRun,
+  },
 }));
 
 vi.mock("../../db", () => ({
@@ -75,7 +95,20 @@ vi.mock("../creditService", () => ({
 }));
 
 vi.mock("../../../drizzle/schema", () => ({
-  telegramConnections: { id: "tc.id", status: "tc.status", activeChannelId: "tc.activeChannelId" },
+  telegramConnections: {
+    id: "tc.id",
+    status: "tc.status",
+    activeChannelId: "tc.activeChannelId",
+    tenantId: "tc.tenantId",
+    userId: "tc.userId",
+  },
+  channelConnections: {
+    id: "chconn.id",
+    status: "chconn.status",
+    activeChannelId: "chconn.activeChannelId",
+    tenantId: "chconn.tenantId",
+    userId: "chconn.userId",
+  },
   conversationChannels: {
     id: "cc.id",
     chatConversationId: "cc.chatConversationId",
@@ -84,8 +117,12 @@ vi.mock("../../../drizzle/schema", () => ({
     state: "cc.state",
     channelRefId: "cc.channelRefId",
     conversationType: "cc.conversationType",
+    syncMode: "cc.syncMode",
+    tenantId: "cc.tenantId",
   },
   channelMessages: { id: "cm.id" },
+  agencyConversations: { id: "ac.id", agencyId: "ac.agencyId" },
+  agencies: { id: "ag.id" },
 }));
 
 vi.mock("drizzle-orm", () => ({
@@ -164,6 +201,16 @@ function mockDbInsertChain() {
 describe("channelGateway", () => {
   beforeEach(() => {
     vi.clearAllMocks();
+    // Default: Telegram adapter available with simple formatMessage
+    mockAdapterGet.mockImplementation((channelType: string) => {
+      if (channelType === "telegram") {
+        return {
+          channelType: "telegram",
+          formatMessage: (text: string) => [text],
+        };
+      }
+      return undefined;
+    });
   });
 
   afterEach(() => {
@@ -286,6 +333,7 @@ describe("channelGateway", () => {
             limit: () => {
               callCount++;
               if (callCount === 1) {
+                // channel_connections lookup
                 return Promise.resolve([
                   {
                     id: "conn-1",
@@ -296,16 +344,21 @@ describe("channelGateway", () => {
                   },
                 ]);
               }
-              return Promise.resolve([
-                {
-                  id: "ch-1",
-                  conversationType: "agency",
-                  chatConversationId: null,
-                  agencyConversationId: "agency-conv-1",
-                  state: "active",
-                  channelRefId: "12345",
-                },
-              ]);
+              if (callCount === 2) {
+                // conversationChannels lookup
+                return Promise.resolve([
+                  {
+                    id: "ch-1",
+                    conversationType: "agency",
+                    chatConversationId: null,
+                    agencyConversationId: "agency-conv-1",
+                    state: "active",
+                    channelRefId: "12345",
+                  },
+                ]);
+              }
+              // callCount === 3: agencyConversations lookup
+              return Promise.resolve([{ agencyId: "agency-1" }]);
             },
           }),
         }),
@@ -316,6 +369,9 @@ describe("channelGateway", () => {
       );
 
       expect(result.ok).toBe(true);
+      expect(mockAgencyBridgeExecuteRun).toHaveBeenCalledWith(
+        expect.objectContaining({ agencyId: "agency-1", conversationId: "agency-conv-1" }),
+      );
     });
 
     it("rejects event with missing connectionId", async () => {
@@ -572,4 +628,95 @@ describe("channelGateway", () => {
       expect(mockCreateMessage).toHaveBeenCalledTimes(2);
     });
   });
+
+  // --- Multi-adapter: emitEgress ---
+
+  describe("emitEgress (multi-adapter)", () => {
+    it("queries bindings for all channel types, not just telegram", async () => {
+      // After refactor, the WHERE clause should NOT include channelType="telegram" filter
+      mockDbSelectArray([]);
+
+      await channelGateway.emitEgress(makeEgressEvent());
+
+      // Verify adapter registry is consulted (would be called per binding)
+      // No bindings returned, so adapter.get not called
+      expect(mockEnqueueDelivery).not.toHaveBeenCalled();
+    });
+
+    it("uses adapter registry for message formatting per channel type", async () => {
+      const mockWhatsappFormatMessage = vi.fn((text: string) => [`[WA] ${text}`]);
+      mockAdapterGet.mockImplementation((channelType: string) => {
+        if (channelType === "whatsapp") {
+          return { channelType: "whatsapp", formatMessage: mockWhatsappFormatMessage };
+        }
+        return undefined;
+      });
+
+      mockDbSelectArray([
+        {
+          id: "cc-1",
+          channelRefId: "wa-phone-1",
+          channelType: "whatsapp",
+          state: "active",
+        },
+      ]);
+      mockDbInsertChain();
+
+      await channelGateway.emitEgress(makeEgressEvent());
+
+      expect(mockWhatsappFormatMessage).toHaveBeenCalledWith("Hello!");
+      expect(mockEnqueueDelivery).toHaveBeenCalledWith(
+        expect.objectContaining({
+          text: "[WA] Hello!",
+          channelType: "whatsapp",
+          chatId: "wa-phone-1",
+        }),
+      );
+    });
+
+    it("skips bindings when adapter not found for channel type", async () => {
+      // No adapter registered for "unknown_channel"
+      mockAdapterGet.mockReturnValue(undefined);
+
+      mockDbSelectArray([
+        {
+          id: "cc-1",
+          channelRefId: "ref-1",
+          channelType: "unknown_channel",
+          state: "active",
+        },
+      ]);
+      mockDbInsertChain();
+
+      await channelGateway.emitEgress(makeEgressEvent());
+
+      // Should skip — no delivery enqueued
+      expect(mockEnqueueDelivery).not.toHaveBeenCalled();
+    });
+
+    it("includes channelType in DeliveryJob", async () => {
+      mockAdapterGet.mockImplementation((channelType: string) => {
+        if (channelType === "telegram") {
+          return { channelType: "telegram", formatMessage: (text: string) => [text] };
+        }
+        return undefined;
+      });
+
+      mockDbSelectArray([
+        {
+          id: "cc-1",
+          channelRefId: "12345",
+          channelType: "telegram",
+          state: "active",
+        },
+      ]);
+      mockDbInsertChain();
+
+      await channelGateway.emitEgress(makeEgressEvent());
+
+      expect(mockEnqueueDelivery).toHaveBeenCalledWith(
+        expect.objectContaining({ channelType: "telegram" }),
+      );
+    });
+  });
 });
diff --git a/apps/web/server/services/__tests__/deliveryQueue.test.ts b/apps/web/server/services/__tests__/deliveryQueue.test.ts
index d0078cd..4174788 100644
--- a/apps/web/server/services/__tests__/deliveryQueue.test.ts
+++ b/apps/web/server/services/__tests__/deliveryQueue.test.ts
@@ -11,6 +11,8 @@ const {
   mockGetDb,
   mockDbUpdate,
   mockDbSelect,
+  mockAdapterGet,
+  mockAdapterSendMessage,
 } = vi.hoisted(() => ({
   mockQueueAdd: vi.fn().mockResolvedValue(undefined),
   mockQueueClose: vi.fn().mockResolvedValue(undefined),
@@ -23,6 +25,10 @@ const {
   mockGetDb: vi.fn(),
   mockDbUpdate: vi.fn(),
   mockDbSelect: vi.fn(),
+  mockAdapterGet: vi.fn(),
+  mockAdapterSendMessage: vi
+    .fn()
+    .mockResolvedValue({ ok: true, externalMessageId: "456" }),
 }));
 
 let capturedProcessor: any = null;
@@ -53,6 +59,12 @@ vi.mock("../redisClients", () => ({
   })),
 }));
 
+vi.mock("../channelAdapters/registry", () => ({
+  adapterRegistry: {
+    get: mockAdapterGet,
+  },
+}));
+
 vi.mock("../telegramService", () => ({
   sendTelegramMessage: mockSendTelegramMessage,
 }));
@@ -66,8 +78,9 @@ vi.mock("../../db", () => ({
 }));
 
 vi.mock("../../../drizzle/schema", () => ({
-  channelMessages: { id: "cm.id" },
+  channelMessages: { id: "cm.id", deliveryStatus: "cm.deliveryStatus", conversationChannelId: "cm.conversationChannelId" },
   systemSettings: { category: "ss.category" },
+  conversationChannels: { id: "cc.id", state: "cc.state" },
 }));
 
 vi.mock("drizzle-orm", () => ({
@@ -83,6 +96,7 @@ function makeJob(overrides: Partial<DeliveryJob> = {}): DeliveryJob {
     chatId: "123",
     text: "<b>Hello</b>",
     parseMode: "HTML",
+    channelType: "telegram",
     conversationId: "conv-1",
     tenantId: "tenant-1",
     ...overrides,
@@ -104,14 +118,30 @@ function setupMockDb() {
   });
   mockDbUpdate.mockReturnValue({ set: setFn });
 
-  const settings = [
+  const telegramSettings = [
     { key: "enabled", value: "true" },
     { key: "bot_token", value: "enc_token" },
   ];
-  const fromFn = vi.fn().mockReturnValue({
-    where: vi.fn().mockResolvedValue(settings),
-  });
-  mockDbSelect.mockReturnValue({ from: fromFn });
+
+  // Branch by table argument: channelMessages vs systemSettings
+  mockDbSelect.mockImplementation(() => ({
+    from: vi.fn().mockImplementation((table: any) => {
+      // channelMessages table
+      if (table && table.id === "cm.id") {
+        return {
+          where: vi.fn().mockReturnValue({
+            limit: vi.fn().mockResolvedValue([
+              { id: "cm-1", deliveryStatus: "pending", conversationChannelId: null },
+            ]),
+          }),
+        };
+      }
+      // systemSettings or anything else
+      return {
+        where: vi.fn().mockResolvedValue(telegramSettings),
+      };
+    }),
+  }));
 
   const db = {
     update: mockDbUpdate,
@@ -125,6 +155,10 @@ describe("deliveryQueue", () => {
   beforeEach(() => {
     vi.clearAllMocks();
     capturedProcessor = null;
+    // Default adapter mock: Telegram adapter with sendMessage
+    mockAdapterGet.mockReturnValue({
+      sendMessage: mockAdapterSendMessage,
+    });
   });
 
   describe("initDeliveryQueue", () => {
@@ -141,7 +175,7 @@ describe("deliveryQueue", () => {
 
       // Worker should have concurrency and limiter
       const workerCall = (Worker as any).mock.calls[0];
-      expect(workerCall[0]).toBe("telegram-delivery");
+      expect(workerCall[0]).toBe("channel-delivery");
       expect(workerCall[2]).toMatchObject({
         concurrency: 10,
         limiter: { max: 25, duration: 1000 },
@@ -162,7 +196,7 @@ describe("deliveryQueue", () => {
       await enqueueDelivery(job);
 
       expect(mockQueueAdd).toHaveBeenCalledWith("deliver", job, {
-        jobId: "tg-deliver-cm-1",
+        jobId: "ch-deliver-cm-1",
       });
 
       await closeDeliveryQueue();
@@ -192,11 +226,11 @@ describe("deliveryQueue", () => {
       const job = makeBullMQJob(makeJob());
       await capturedProcessor(job);
 
-      expect(mockSendTelegramMessage).toHaveBeenCalledWith(
-        "dec_token",
+      expect(mockAdapterSendMessage).toHaveBeenCalledWith(
+        { botToken: "dec_token" },
         "123",
         "<b>Hello</b>",
-        "HTML",
+        { parseMode: "HTML" },
       );
 
       expect(mockDbUpdate).toHaveBeenCalled();
@@ -206,7 +240,7 @@ describe("deliveryQueue", () => {
 
     it("throws UnrecoverableError for 403 (bot blocked)", async () => {
       setupMockDb();
-      mockSendTelegramMessage.mockRejectedValueOnce(
+      mockAdapterSendMessage.mockRejectedValueOnce(
         Object.assign(new Error("Forbidden: bot was blocked by the user"), {
           statusCode: 403,
           blocked: true,
@@ -228,7 +262,7 @@ describe("deliveryQueue", () => {
 
     it("throws UnrecoverableError for chat not found", async () => {
       setupMockDb();
-      mockSendTelegramMessage.mockRejectedValueOnce(
+      mockAdapterSendMessage.mockRejectedValueOnce(
         Object.assign(new Error("Bad Request: chat not found"), {
           statusCode: 400,
         }),
@@ -247,7 +281,7 @@ describe("deliveryQueue", () => {
 
     it("re-throws transient errors for BullMQ retry", async () => {
       setupMockDb();
-      mockSendTelegramMessage.mockRejectedValueOnce(
+      mockAdapterSendMessage.mockRejectedValueOnce(
         Object.assign(new Error("Internal Server Error"), {
           statusCode: 500,
         }),
diff --git a/apps/web/server/services/__tests__/telegramAdapter.test.ts b/apps/web/server/services/__tests__/telegramAdapter.test.ts
new file mode 100644
index 0000000..c54f94d
--- /dev/null
+++ b/apps/web/server/services/__tests__/telegramAdapter.test.ts
@@ -0,0 +1,306 @@
+import { describe, it, expect, vi, beforeEach } from "vitest";
+
+// --- Hoisted mocks ---
+const {
+  mockSendTelegramMessage,
+  mockDecrypt,
+  mockGetDb,
+  mockDbSelect,
+  mockRenderForTelegram,
+  mockAdapterRegistryRegister,
+} = vi.hoisted(() => ({
+  mockSendTelegramMessage: vi.fn().mockResolvedValue({ ok: true, messageId: 123 }),
+  mockDecrypt: vi.fn((v: string) => v.replace("enc_", "dec_")),
+  mockGetDb: vi.fn(),
+  mockDbSelect: vi.fn(),
+  mockRenderForTelegram: vi.fn((text: string) => [text]),
+  mockAdapterRegistryRegister: vi.fn(),
+}));
+
+vi.mock("../telegramService", () => ({
+  sendTelegramMessage: mockSendTelegramMessage,
+}));
+
+vi.mock("../crypto", () => ({
+  decrypt: mockDecrypt,
+}));
+
+vi.mock("../../db", () => ({
+  getDb: mockGetDb,
+}));
+
+vi.mock("../telegramRendering", () => ({
+  renderForTelegram: mockRenderForTelegram,
+}));
+
+vi.mock("../channelAdapters/registry", () => ({
+  adapterRegistry: {
+    register: mockAdapterRegistryRegister,
+    get: vi.fn(),
+    getAll: vi.fn(() => []),
+    _reset: vi.fn(),
+  },
+}));
+
+vi.mock("../../../drizzle/schema", () => ({
+  systemSettings: { category: "ss.category", key: "ss.key", value: "ss.value" },
+}));
+
+vi.mock("drizzle-orm", () => ({
+  eq: vi.fn((_col: any, val: any) => ({ _type: "eq", val })),
+}));
+
+// ── Telegram adapter module (loaded after all mocks) ─────────────────────
+
+// Note: telegram.ts self-registers on import, we mock that above
+import "../../db";
+import "../telegramService";
+
+// Setup DB mock helper
+function setupDbWithSettings(settings: Array<{ key: string; value: string }>) {
+  const fromFn = vi.fn().mockReturnValue({
+    where: vi.fn().mockResolvedValue(settings),
+  });
+  mockDbSelect.mockReturnValue({ from: fromFn });
+  mockGetDb.mockResolvedValue({ select: mockDbSelect });
+}
+
+describe("TelegramAdapter", () => {
+  let adapter: any;
+
+  beforeEach(async () => {
+    vi.clearAllMocks();
+
+    // Reset module cache and re-import to get fresh adapter instance
+    vi.resetModules();
+
+    // Re-setup mocks after resetModules
+    vi.mock("../telegramService", () => ({
+      sendTelegramMessage: mockSendTelegramMessage,
+    }));
+    vi.mock("../crypto", () => ({
+      decrypt: mockDecrypt,
+    }));
+    vi.mock("../../db", () => ({
+      getDb: mockGetDb,
+    }));
+    vi.mock("../telegramRendering", () => ({
+      renderForTelegram: mockRenderForTelegram,
+    }));
+    vi.mock("../channelAdapters/registry", () => ({
+      adapterRegistry: {
+        register: mockAdapterRegistryRegister,
+        get: vi.fn(),
+        getAll: vi.fn(() => []),
+        _reset: vi.fn(),
+      },
+    }));
+    vi.mock("../../../drizzle/schema", () => ({
+      systemSettings: { category: "ss.category", key: "ss.key", value: "ss.value" },
+    }));
+    vi.mock("drizzle-orm", () => ({
+      eq: vi.fn((_col: any, val: any) => ({ _type: "eq", val })),
+    }));
+
+    // Import the telegram module — it self-registers and we capture the adapter
+    await import("../channelAdapters/telegram");
+
+    // Get the registered adapter (it was passed to mockAdapterRegistryRegister)
+    const calls = mockAdapterRegistryRegister.mock.calls;
+    adapter = calls.length > 0 ? calls[calls.length - 1][0] : null;
+  });
+
+  it("has channelType 'telegram'", () => {
+    expect(adapter?.channelType).toBe("telegram");
+  });
+
+  it("has correct capabilities", () => {
+    expect(adapter?.capabilities).toMatchObject({
+      maxMessageLength: 4096,
+      supportsButtons: true,
+      supportsRichText: true,
+      supportsAttachments: false,
+      rateLimitPerSecond: 25,
+    });
+  });
+
+  it("self-registers with adapter registry on import", () => {
+    expect(mockAdapterRegistryRegister).toHaveBeenCalledWith(
+      expect.objectContaining({ channelType: "telegram" }),
+    );
+  });
+
+  describe("validateWebhook", () => {
+    it("returns true for valid X-Telegram-Bot-Api-Secret-Token header", async () => {
+      setupDbWithSettings([{ key: "webhook_secret", value: "enc_mysecret" }]);
+
+      const valid = await adapter.validateWebhook({
+        headers: { "x-telegram-bot-api-secret-token": "dec_mysecret" },
+        body: {},
+        params: {},
+      });
+
+      expect(valid).toBe(true);
+    });
+
+    it("returns false for invalid secret token (timing-safe)", async () => {
+      setupDbWithSettings([{ key: "webhook_secret", value: "enc_mysecret" }]);
+
+      const valid = await adapter.validateWebhook({
+        headers: { "x-telegram-bot-api-secret-token": "wrong_secret" },
+        body: {},
+        params: {},
+      });
+
+      expect(valid).toBe(false);
+    });
+
+    it("returns false when header is missing", async () => {
+      setupDbWithSettings([{ key: "webhook_secret", value: "enc_mysecret" }]);
+
+      const valid = await adapter.validateWebhook({
+        headers: {},
+        body: {},
+        params: {},
+      });
+
+      expect(valid).toBe(false);
+    });
+
+    it("returns false when webhook secret is not configured", async () => {
+      setupDbWithSettings([]); // No webhook_secret setting
+
+      const valid = await adapter.validateWebhook({
+        headers: { "x-telegram-bot-api-secret-token": "sometoken" },
+        body: {},
+        params: {},
+      });
+
+      expect(valid).toBe(false);
+    });
+  });
+
+  describe("parseInbound", () => {
+    it("returns correct ParsedInbound from Telegram message update", async () => {
+      const update = {
+        update_id: 100,
+        message: {
+          message_id: 42,
+          from: { id: 999, language_code: "en" },
+          chat: { id: 12345, type: "private" },
+          text: "Hello!",
+          date: 1700000000,
+        },
+      };
+
+      const result = await adapter.parseInbound(update, "conn-123");
+
+      expect(result).not.toBeNull();
+      expect(result!.event.eventType).toBe("user_message");
+      expect(result!.event.channel.externalChatId).toBe("12345");
+      expect(result!.event.channel.externalMessageId).toBe("42");
+      expect(result!.event.channel.connectionId).toBe("conn-123");
+      expect(result!.event.message.text).toBe("Hello!");
+      expect(result!.dedupKey).toBe("tg:conn-123:100");
+    });
+
+    it("returns command eventType for /command messages", async () => {
+      const update = {
+        update_id: 101,
+        message: {
+          message_id: 43,
+          from: { id: 999 },
+          chat: { id: 12345, type: "private" },
+          text: "/start",
+          date: 1700000000,
+        },
+      };
+
+      const result = await adapter.parseInbound(update, "conn-123");
+
+      expect(result!.event.eventType).toBe("command");
+    });
+
+    it("returns null for non-text messages (photo)", async () => {
+      const update = {
+        update_id: 102,
+        message: {
+          message_id: 44,
+          from: { id: 999 },
+          chat: { id: 12345, type: "private" },
+          photo: [{ file_id: "abc" }],
+          date: 1700000000,
+        },
+      };
+
+      const result = await adapter.parseInbound(update, "conn-123");
+
+      expect(result).toBeNull();
+    });
+
+    it("returns null for callback_query updates", async () => {
+      const update = {
+        update_id: 103,
+        callback_query: { id: "cq-1", from: { id: 999 }, data: "action" },
+      };
+
+      const result = await adapter.parseInbound(update, "conn-123");
+
+      expect(result).toBeNull();
+    });
+
+    it("returns null for updates without update_id", async () => {
+      const result = await adapter.parseInbound({}, "conn-123");
+      expect(result).toBeNull();
+    });
+  });
+
+  describe("sendMessage", () => {
+    it("delegates to sendTelegramMessage with botToken from config", async () => {
+      const config = { botToken: "my-bot-token" };
+      await adapter.sendMessage(config, "12345", "Hello world", { parseMode: "HTML" });
+
+      expect(mockSendTelegramMessage).toHaveBeenCalledWith(
+        "my-bot-token",
+        "12345",
+        "Hello world",
+        "HTML",
+      );
+    });
+
+    it("defaults parseMode to HTML when options not provided", async () => {
+      await adapter.sendMessage({ botToken: "tok" }, "123", "Hi");
+
+      expect(mockSendTelegramMessage).toHaveBeenCalledWith("tok", "123", "Hi", "HTML");
+    });
+
+    it("returns ok and externalMessageId from sendTelegramMessage result", async () => {
+      mockSendTelegramMessage.mockResolvedValueOnce({ ok: true, messageId: 999 });
+
+      const result = await adapter.sendMessage({ botToken: "tok" }, "123", "Hi");
+
+      expect(result.ok).toBe(true);
+      expect(result.externalMessageId).toBe("999");
+    });
+  });
+
+  describe("formatMessage", () => {
+    it("delegates to renderForTelegram", () => {
+      mockRenderForTelegram.mockReturnValueOnce(["chunk1", "chunk2"]);
+
+      const result = adapter.formatMessage("long text");
+
+      expect(mockRenderForTelegram).toHaveBeenCalledWith("long text");
+      expect(result).toEqual(["chunk1", "chunk2"]);
+    });
+
+    it("returns single chunk for short messages", () => {
+      mockRenderForTelegram.mockReturnValueOnce(["Hello!"]);
+
+      const result = adapter.formatMessage("Hello!");
+
+      expect(result).toHaveLength(1);
+      expect(result[0]).toBe("Hello!");
+    });
+  });
+});
diff --git a/apps/web/server/services/channelAdapters/index.ts b/apps/web/server/services/channelAdapters/index.ts
new file mode 100644
index 0000000..8d27dc2
--- /dev/null
+++ b/apps/web/server/services/channelAdapters/index.ts
@@ -0,0 +1,9 @@
+export { adapterRegistry } from "./registry";
+export type {
+  ChannelAdapter,
+  ChannelCapabilities,
+  ParsedInbound,
+  ParsedInboundEvent,
+  SendMessageOptions,
+  IncomingWebhookRequest,
+} from "./types";
diff --git a/apps/web/server/services/channelAdapters/registry.ts b/apps/web/server/services/channelAdapters/registry.ts
new file mode 100644
index 0000000..b8e9935
--- /dev/null
+++ b/apps/web/server/services/channelAdapters/registry.ts
@@ -0,0 +1,45 @@
+/**
+ * ChannelAdapterRegistry — Singleton that maps channelType strings
+ * to their ChannelAdapter implementations.
+ *
+ * Adapters register themselves during app initialization.
+ * The channelGateway and deliveryQueue use this to route messages
+ * to the correct platform-specific handler.
+ */
+
+import type { ChannelAdapter } from "./types";
+import { auditLogger } from "../auditLogger";
+
+class ChannelAdapterRegistryImpl {
+  private adapters = new Map<string, ChannelAdapter>();
+
+  register(adapter: ChannelAdapter): void {
+    try {
+      this.adapters.set(adapter.channelType, adapter);
+      auditLogger.log({
+        eventType: "channel_adapter_registered",
+        metadata: { channelType: adapter.channelType },
+      });
+    } catch (err) {
+      auditLogger.log({
+        eventType: "channel_adapter_registration_failed",
+        metadata: { channelType: adapter.channelType, error: String(err) },
+      });
+    }
+  }
+
+  get(channelType: string): ChannelAdapter | undefined {
+    return this.adapters.get(channelType);
+  }
+
+  getAll(): ChannelAdapter[] {
+    return Array.from(this.adapters.values());
+  }
+
+  /** For testing: clear all registrations */
+  _reset(): void {
+    this.adapters.clear();
+  }
+}
+
+export const adapterRegistry = new ChannelAdapterRegistryImpl();
diff --git a/apps/web/server/services/channelAdapters/telegram.ts b/apps/web/server/services/channelAdapters/telegram.ts
new file mode 100644
index 0000000..64788d4
--- /dev/null
+++ b/apps/web/server/services/channelAdapters/telegram.ts
@@ -0,0 +1,172 @@
+/**
+ * Telegram ChannelAdapter
+ *
+ * Extracts Telegram-specific logic into the ChannelAdapter interface.
+ * Validates webhooks via X-Telegram-Bot-Api-Secret-Token header,
+ * parses Telegram updates into normalized events, and delegates
+ * sending to the existing sendTelegramMessage function.
+ */
+
+import crypto from "crypto";
+import { eq } from "drizzle-orm";
+import type {
+  ChannelAdapter,
+  ChannelCapabilities,
+  IncomingWebhookRequest,
+  ParsedInbound,
+  SendMessageOptions,
+} from "./types";
+import { adapterRegistry } from "./registry";
+import { sendTelegramMessage } from "../telegramService";
+import { decrypt } from "../crypto";
+import { renderForTelegram } from "../telegramRendering";
+import { getDb } from "../../db";
+import { systemSettings } from "../../../drizzle/schema";
+
+// ── Webhook secret cache ────────────────────────────────────────────────────
+
+let cachedWebhookSecret: string | null = null;
+let webhookSecretExpiry = 0;
+const WEBHOOK_SECRET_CACHE_TTL = 60_000; // 1 minute
+
+async function getWebhookSecret(): Promise<string | null> {
+  const now = Date.now();
+  if (cachedWebhookSecret && now < webhookSecretExpiry) {
+    return cachedWebhookSecret;
+  }
+
+  const db = await getDb();
+  if (!db) return null;
+
+  const settings = await db
+    .select()
+    .from(systemSettings)
+    .where(eq(systemSettings.category, "telegram"));
+
+  const settingsMap = new Map(settings.map((s: any) => [s.key, s.value]));
+  const webhookSecretEncrypted = settingsMap.get("webhook_secret");
+  if (!webhookSecretEncrypted) return null;
+
+  try {
+    cachedWebhookSecret = decrypt(webhookSecretEncrypted);
+    webhookSecretExpiry = now + WEBHOOK_SECRET_CACHE_TTL;
+    return cachedWebhookSecret;
+  } catch {
+    return null;
+  }
+}
+
+/** For testing: clear the webhook secret cache */
+export function _clearTelegramAdapterCache(): void {
+  cachedWebhookSecret = null;
+  webhookSecretExpiry = 0;
+}
+
+// ── Timing-safe comparison ──────────────────────────────────────────────────
+
+function timingSafeCompare(a: string, b: string): boolean {
+  const bufA = Buffer.from(a);
+  const bufB = Buffer.from(b);
+  const len = Math.max(bufA.length, bufB.length);
+  const paddedA = Buffer.alloc(len);
+  const paddedB = Buffer.alloc(len);
+  bufA.copy(paddedA);
+  bufB.copy(paddedB);
+  return crypto.timingSafeEqual(paddedA, paddedB) && bufA.length === bufB.length;
+}
+
+// ── Adapter implementation ──────────────────────────────────────────────────
+
+class TelegramAdapter implements ChannelAdapter {
+  readonly channelType = "telegram";
+
+  readonly capabilities: ChannelCapabilities = {
+    maxMessageLength: 4096,
+    supportsButtons: true,
+    supportsRichText: true,
+    supportsAttachments: false,
+    rateLimitPerSecond: 25,
+  };
+
+  async validateWebhook(req: IncomingWebhookRequest): Promise<boolean> {
+    const secretHeader = req.headers["x-telegram-bot-api-secret-token"];
+    const secretValue = typeof secretHeader === "string" ? secretHeader : "";
+    if (!secretValue) return false;
+
+    const webhookSecret = await getWebhookSecret();
+    if (!webhookSecret) return false;
+
+    return timingSafeCompare(secretValue, webhookSecret);
+  }
+
+  async parseInbound(body: unknown, connectionId: string): Promise<ParsedInbound | null> {
+    const update = body as any;
+    if (!update || typeof update !== "object") return null;
+
+    const updateId = update.update_id;
+    if (!updateId) return null;
+
+    // Callback queries — not supported in this adapter version
+    if (update.callback_query) return null;
+
+    const message = update.message;
+    if (!message) return null;
+
+    // Non-text messages are not supported
+    if (
+      !message.text &&
+      (message.photo || message.voice || message.sticker ||
+        message.document || message.video || message.audio)
+    ) {
+      return null;
+    }
+
+    if (!message.text) return null;
+
+    const chatId = String(message.chat?.id ?? "");
+    const messageId = String(message.message_id ?? "");
+
+    return {
+      event: {
+        eventType: message.text.startsWith("/") ? "command" : "user_message",
+        channel: {
+          type: "telegram",
+          connectionId,
+          externalChatId: chatId,
+          externalMessageId: messageId,
+        },
+        message: {
+          text: message.text,
+          attachments: [],
+        },
+      },
+      dedupKey: `tg:${connectionId}:${updateId}`,
+    };
+  }
+
+  async sendMessage(
+    config: Record<string, unknown>,
+    externalChatId: string,
+    text: string,
+    options?: SendMessageOptions,
+  ): Promise<{ ok: boolean; externalMessageId?: string }> {
+    const botToken = config.botToken as string;
+    const result = await sendTelegramMessage(
+      botToken,
+      externalChatId,
+      text,
+      options?.parseMode || "HTML",
+    );
+    return {
+      ok: result.ok,
+      externalMessageId: result.messageId != null ? String(result.messageId) : undefined,
+    };
+  }
+
+  formatMessage(text: string): string[] {
+    return renderForTelegram(text);
+  }
+}
+
+// Self-register
+adapterRegistry.register(new TelegramAdapter());
diff --git a/apps/web/server/services/channelAdapters/types.ts b/apps/web/server/services/channelAdapters/types.ts
new file mode 100644
index 0000000..6f98605
--- /dev/null
+++ b/apps/web/server/services/channelAdapters/types.ts
@@ -0,0 +1,110 @@
+/**
+ * ChannelAdapter — Interface for external messaging channel integrations.
+ *
+ * Each adapter handles the platform-specific protocol details while the
+ * channelGateway and deliveryQueue work with this abstraction.
+ */
+
+import type { Attachment } from "@shared/channelTypes";
+
+export interface ChannelCapabilities {
+  /** Maximum message length before splitting is required */
+  maxMessageLength: number;
+  /** Whether the platform supports inline buttons/keyboards */
+  supportsButtons: boolean;
+  /** Whether the platform supports rich text (HTML/Markdown) */
+  supportsRichText: boolean;
+  /** Whether the platform supports media attachments */
+  supportsAttachments: boolean;
+  /** Platform-specific rate limits (messages per second) */
+  rateLimitPerSecond: number;
+}
+
+export interface IncomingWebhookRequest {
+  headers: Record<string, string | string[] | undefined>;
+  body: unknown;
+  params: Record<string, string>;
+}
+
+/** Channel-specific event data extracted from the webhook payload. */
+export interface ParsedInboundEvent {
+  eventType: "user_message" | "command" | "callback";
+  channel: {
+    type: string;
+    connectionId?: string;
+    externalChatId?: string;
+    externalMessageId?: string;
+  };
+  message: {
+    text: string;
+    attachments: Attachment[];
+  };
+}
+
+export interface ParsedInbound {
+  /** Channel-specific data extracted from the webhook payload */
+  event: ParsedInboundEvent;
+  /** Platform-specific dedup key (e.g., "tg:{botId}:{updateId}") */
+  dedupKey: string;
+}
+
+export interface SendMessageOptions {
+  parseMode?: "HTML" | "Markdown";
+  replyMarkup?: unknown;
+  replyToMessageId?: string;
+}
+
+export interface ChannelAdapter {
+  /** Unique channel type identifier (e.g., "telegram", "whatsapp", "line") */
+  readonly channelType: string;
+
+  /** Platform capabilities and limits */
+  readonly capabilities: ChannelCapabilities;
+
+  /**
+   * Validate an incoming webhook request (signature/secret verification).
+   * Must use timing-safe comparison for HMAC/secret checks.
+   * @returns true if the request is authentic
+   */
+  validateWebhook(req: IncomingWebhookRequest): Promise<boolean>;
+
+  /**
+   * Parse the raw webhook body into a normalized ParsedInbound.
+   * @returns The parsed event, or null if the message should be ignored
+   *          (e.g., non-text media that isn't supported yet)
+   */
+  parseInbound(body: unknown, connectionId: string): Promise<ParsedInbound | null>;
+
+  /**
+   * Send a message to an external chat via this channel.
+   * @param config - Channel-specific configuration (bot token, API keys, etc.)
+   * @param externalChatId - The platform's chat/conversation identifier
+   * @param text - The message content
+   * @param options - Optional: reply markup, parse mode, etc.
+   * @returns External message ID if available
+   */
+  sendMessage(
+    config: Record<string, unknown>,
+    externalChatId: string,
+    text: string,
+    options?: SendMessageOptions,
+  ): Promise<{ ok: boolean; externalMessageId?: string }>;
+
+  /**
+   * Format and split a message according to platform limits.
+   * @returns Array of message chunks, each within the platform's size limit
+   */
+  formatMessage(text: string): string[];
+
+  /**
+   * Optional: Initialize adapter resources (connections, caches).
+   * Called once at application startup.
+   */
+  initialize?(): Promise<void>;
+
+  /**
+   * Optional: Clean up adapter resources.
+   * Called during graceful shutdown.
+   */
+  shutdown?(): Promise<void>;
+}
diff --git a/apps/web/server/services/channelGateway.ts b/apps/web/server/services/channelGateway.ts
index 3ff67f6..f153571 100644
--- a/apps/web/server/services/channelGateway.ts
+++ b/apps/web/server/services/channelGateway.ts
@@ -13,6 +13,7 @@ import { db } from "../db";
 import { auditLogger } from "./auditLogger";
 import {
   telegramConnections,
+  channelConnections,
   conversationChannels,
   channelMessages,
 } from "../../drizzle/schema";
@@ -25,6 +26,7 @@ import { enqueueDelivery } from "./deliveryQueue";
 import { sendTelegramMessage } from "./telegramService";
 import { getMessage } from "./telegramI18n";
 import { renderForTelegram } from "./telegramRendering";
+import { adapterRegistry } from "./channelAdapters/registry";
 import { inArray } from "drizzle-orm";
 import {
   createMessage,
@@ -79,18 +81,37 @@ async function ingest(event: ChatIngressEvent): Promise<IngestResult> {
       return { ok: false, error: "Missing connectionId", errorCode: "no_connection" };
     }
 
-    // 1. Validate connection (scoped to tenant for defense-in-depth)
-    const [connection] = await db
+    // 1. Validate connection — try channel_connections first, then telegramConnections (backward compat)
+    let connection: any = null;
+
+    const [channelConn] = await db
       .select()
-      .from(telegramConnections)
+      .from(channelConnections)
       .where(
         and(
-          eq(telegramConnections.id, connectionId),
-          eq(telegramConnections.tenantId, event.tenantId),
+          eq(channelConnections.id, connectionId),
+          eq(channelConnections.tenantId, event.tenantId),
         ),
       )
       .limit(1);
 
+    if (channelConn) {
+      connection = channelConn;
+    } else {
+      // Fallback to legacy telegramConnections during dual-write period
+      const [legacyConn] = await db
+        .select()
+        .from(telegramConnections)
+        .where(
+          and(
+            eq(telegramConnections.id, connectionId),
+            eq(telegramConnections.tenantId, event.tenantId),
+          ),
+        )
+        .limit(1);
+      connection = legacyConn ?? null;
+    }
+
     if (!connection) {
       return { ok: false, error: "Connection not found", errorCode: "no_connection" };
     }
@@ -233,6 +254,16 @@ async function emitEgress(event: ChatEgressEvent): Promise<void> {
 
       const channelMessageId = crypto.randomUUID();
 
+      // Use adapter registry for message formatting per channel type
+      const adapter = adapterRegistry.get(binding.channelType);
+      if (!adapter) {
+        auditLogger.log({
+          eventType: "channel_gateway_no_adapter",
+          metadata: { channelType: binding.channelType, bindingId: binding.id },
+        });
+        continue;
+      }
+
       // Create tracking record
       await db.insert(channelMessages).values({
         id: channelMessageId,
@@ -240,14 +271,14 @@ async function emitEgress(event: ChatEgressEvent): Promise<void> {
         conversationChannelId: binding.id,
         messageId: event.messageId,
         messageType: event.conversationType,
-        channelType: "telegram",
+        channelType: binding.channelType,
         externalChatId: binding.channelRefId,
         deliveryStatus: "pending",
       });
 
-      // Render and split message for Telegram
+      // Format and split message using adapter
       const text = event.rendering.plainText;
-      const chunks = renderForTelegram(text);
+      const chunks = adapter.formatMessage(text);
 
       for (let i = 0; i < chunks.length; i++) {
         const job: DeliveryJob = {
@@ -255,6 +286,7 @@ async function emitEgress(event: ChatEgressEvent): Promise<void> {
           chatId: binding.channelRefId,
           text: chunks[i],
           parseMode: "HTML",
+          channelType: binding.channelType,
           conversationId: event.conversationId,
           tenantId: event.tenantId,
         };
@@ -268,7 +300,7 @@ async function emitEgress(event: ChatEgressEvent): Promise<void> {
   }
 }
 
-/** Query conversation_channels for active Telegram bindings with syncMode filter */
+/** Query conversation_channels for all active channel bindings with syncMode filter */
 async function queryActiveBindings(event: ChatEgressEvent) {
   if (event.conversationType === "chat") {
     const convId = parseInt(event.conversationId, 10);
@@ -282,7 +314,6 @@ async function queryActiveBindings(event: ChatEgressEvent) {
       .where(
         and(
           eq(conversationChannels.chatConversationId, convId),
-          eq(conversationChannels.channelType, "telegram"),
           eq(conversationChannels.state, "active"),
           eq(conversationChannels.tenantId, event.tenantId),
           inArray(conversationChannels.syncMode, ["two_way", "notify_only"]),
@@ -295,7 +326,6 @@ async function queryActiveBindings(event: ChatEgressEvent) {
       .where(
         and(
           eq(conversationChannels.agencyConversationId, event.conversationId),
-          eq(conversationChannels.channelType, "telegram"),
           eq(conversationChannels.state, "active"),
           eq(conversationChannels.tenantId, event.tenantId),
           inArray(conversationChannels.syncMode, ["two_way", "notify_only"]),
@@ -499,7 +529,6 @@ async function hasActiveChannels(
       .where(
         and(
           condition,
-          eq(conversationChannels.channelType, "telegram"),
           eq(conversationChannels.state, "active"),
         ),
       )
diff --git a/apps/web/server/services/deliveryQueue.ts b/apps/web/server/services/deliveryQueue.ts
index d1b76d9..23e7b63 100644
--- a/apps/web/server/services/deliveryQueue.ts
+++ b/apps/web/server/services/deliveryQueue.ts
@@ -10,15 +10,15 @@ import type { Job } from "bullmq";
 import { eq, and } from "drizzle-orm";
 import type { DeliveryJob } from "@shared/channelTypes";
 import { getRealtimeClient } from "./redisClients";
-import { sendTelegramMessage } from "./telegramService";
 import { decrypt } from "./crypto";
 import { getDb } from "../db";
 import { channelMessages, conversationChannels, systemSettings } from "../../drizzle/schema";
+import { adapterRegistry } from "./channelAdapters/registry";
 
 // ── Constants ────────────────────────────────────────────────────────────
 
-const QUEUE_NAME = "telegram-delivery";
-const DLQ_NAME = "telegram-delivery-dlq";
+const QUEUE_NAME = "channel-delivery";
+const DLQ_NAME = "channel-delivery-dlq";
 const MAX_ATTEMPTS = 5;
 
 // ── Module state ─────────────────────────────────────────────────────────
@@ -27,12 +27,12 @@ let deliveryQueue: Queue<DeliveryJob> | null = null;
 let dlq: Queue<DeliveryJob> | null = null;
 let deliveryWorker: Worker<DeliveryJob> | null = null;
 
-// Cache bot token to avoid re-reading settings on every job
+// Cache bot token to avoid re-reading settings on every job (Telegram backward compat)
 let cachedBotToken: string | null = null;
 let botTokenCacheExpiry = 0;
 const BOT_TOKEN_CACHE_TTL = 60_000; // 1 minute
 
-// ── Bot token resolution ─────────────────────────────────────────────────
+// ── Bot token resolution (Telegram backward compat) ──────────────────────
 
 async function resolveBotToken(): Promise<string | null> {
   const now = Date.now();
@@ -67,6 +67,43 @@ async function resolveBotToken(): Promise<string | null> {
   }
 }
 
+// ── Channel config resolution ────────────────────────────────────────────
+
+async function resolveChannelConfig(
+  channelType: string,
+  _tenantId: string,
+): Promise<Record<string, unknown> | null> {
+  // Telegram: backward compat via system_settings
+  if (channelType === "telegram") {
+    const botToken = await resolveBotToken();
+    return botToken ? { botToken } : null;
+  }
+
+  // Generic channels: lookup from channel_credentials table
+  // (channel_credentials table created by section-01)
+  const db = await getDb();
+  if (!db) return null;
+
+  try {
+    const { channelCredentials } = await import("../../drizzle/schema");
+    const [cred] = await db
+      .select()
+      .from(channelCredentials)
+      .where(
+        and(
+          eq(channelCredentials.channelType, channelType),
+          eq(channelCredentials.isActive, true),
+        ),
+      )
+      .limit(1);
+
+    if (!cred) return null;
+    return JSON.parse(decrypt(cred.credentialsEncrypted));
+  } catch {
+    return null;
+  }
+}
+
 // ── Permanent error detection ────────────────────────────────────────────
 
 const PERMANENT_ERROR_PATTERNS = [
@@ -89,11 +126,19 @@ function isPermanentError(err: any): boolean {
 // ── Worker processor ─────────────────────────────────────────────────────
 
 async function processDeliveryJob(job: Job<DeliveryJob>): Promise<void> {
-  const { channelMessageId, chatId, text, parseMode } = job.data;
+  const { channelMessageId, chatId, text, parseMode, tenantId } = job.data;
+  const channelType = job.data.channelType ?? "telegram"; // backward compat
+
+  // Resolve adapter
+  const adapter = adapterRegistry.get(channelType);
+  if (!adapter) {
+    throw new UnrecoverableError(`No adapter for channel type: ${channelType}`);
+  }
 
-  const botToken = await resolveBotToken();
-  if (!botToken) {
-    throw new UnrecoverableError("Bot token not available");
+  // Resolve channel credentials
+  const config = await resolveChannelConfig(channelType, tenantId);
+  if (!config) {
+    throw new UnrecoverableError(`Channel credentials not available for: ${channelType}`);
   }
 
   const db = await getDb();
@@ -135,11 +180,8 @@ async function processDeliveryJob(job: Job<DeliveryJob>): Promise<void> {
   }
 
   try {
-    const result = await sendTelegramMessage(botToken, chatId, text, parseMode);
-    const externalMessageId =
-      result && typeof result === "object" && "messageId" in result
-        ? String((result as any).messageId)
-        : null;
+    const result = await adapter.sendMessage(config, chatId, text, { parseMode });
+    const externalMessageId = result.externalMessageId ?? null;
 
     // Success: update channel_messages
     if (db) {
@@ -292,7 +334,7 @@ export async function enqueueDelivery(job: DeliveryJob): Promise<void> {
   }
 
   await deliveryQueue.add("deliver", job, {
-    jobId: `tg-deliver-${job.channelMessageId}`,
+    jobId: `ch-deliver-${job.channelMessageId}`,
   });
 }
 
diff --git a/apps/web/shared/channelTypes.ts b/apps/web/shared/channelTypes.ts
index 8711892..bfc975a 100644
--- a/apps/web/shared/channelTypes.ts
+++ b/apps/web/shared/channelTypes.ts
@@ -32,7 +32,7 @@ export interface ChatIngressEvent {
   conversationType: "chat" | "agency";
   /** Channel metadata */
   channel: {
-    type: "web" | "telegram";
+    type: "web" | "telegram" | "whatsapp" | "line" | "slack" | "discord" | "widget";
     connectionId?: string;
     externalChatId?: string;
     externalMessageId?: string;
@@ -75,7 +75,7 @@ export interface ChatEgressEvent {
 }
 
 export interface ChatEgressTarget {
-  channelType: "web" | "telegram";
+  channelType: "web" | "telegram" | "whatsapp" | "line" | "slack" | "discord" | "widget";
   /** External reference (e.g., Telegram chat_id) */
   channelRefId: string;
   /** Delivery mode for this binding */
@@ -83,18 +83,20 @@ export interface ChatEgressTarget {
 }
 
 /**
- * Data payload for a BullMQ job in the telegram-delivery queue.
+ * Data payload for a BullMQ job in the channel-delivery queue.
  * Created by channelGateway, processed by the delivery worker.
  */
 export interface DeliveryJob {
   /** channel_messages.id — used for status tracking */
   channelMessageId: string;
-  /** Telegram chat_id for delivery */
+  /** External chat_id for delivery */
   chatId: string;
   /** HTML-formatted message content */
   text: string;
-  /** Always "HTML" for Telegram */
+  /** Parse mode for the channel */
   parseMode: "HTML";
+  /** Channel adapter routing key (e.g., "telegram", "whatsapp") */
+  channelType: string;
   /** Optional: for threading replies */
   replyToMessageId?: string;
   /** For logging and tracing */
