diff --git a/apps/web/server/_core/index.ts b/apps/web/server/_core/index.ts
index dc52be44..793d3604 100644
--- a/apps/web/server/_core/index.ts
+++ b/apps/web/server/_core/index.ts
@@ -101,6 +101,7 @@ import { createPublicWebhooksRouter } from "../routes/publicWebhooksApi";
 import { createPublicEventsRouter } from "../routes/publicEventsApi";
 import { initWebhookApiDeliveryQueue, closeWebhookApiDeliveryQueue } from "../services/webhookDeliveryService";
 import { registerPublicDocsRoutes } from "../routes/publicDocsApi";
+import { createAgencyToolsApiRouter } from "../routes/agencyToolsApi";
 import { apiKeyAuthMiddleware } from "../middleware/apiKeyAuth";
 import { assertHmacSecretConfigured } from "../services/apiKeyService";
 import { publicApiAuditMiddleware } from "../middleware/publicApiAudit";
@@ -467,6 +468,7 @@ app.use("/v1/media", createPublicMediaRouter());
 app.use("/v1/jobs", createPublicJobsRouter());
 app.use("/v1/webhooks", createPublicWebhooksRouter());
 app.use("/v1/events", createPublicEventsRouter());
+app.use("/v1/agency-tools", createAgencyToolsApiRouter());
 
 // Public API documentation (unauthenticated)
 registerPublicDocsRoutes(app);
diff --git a/apps/web/server/routers/agency.ts b/apps/web/server/routers/agency.ts
index 718b6ed1..a86fb042 100644
--- a/apps/web/server/routers/agency.ts
+++ b/apps/web/server/routers/agency.ts
@@ -2484,6 +2484,55 @@ export const agencyRouter = router({
       return { ok: true };
     }),
 
+  toggleToolExposure: protectedProcedure
+    .input(
+      z.object({
+        toolId: z.string().uuid(),
+        exposed: z.boolean(),
+      }),
+    )
+    .mutation(async ({ ctx, input }) => {
+      // Feature flag guard
+      const { getFeatureFlag } = await import("../services/featureFlags");
+      const flagEnabled = await getFeatureFlag("AGENCY_TOOL_API_ENABLED");
+      if (!flagEnabled) {
+        throw new TRPCError({
+          code: "FORBIDDEN",
+          message: "Agency Tool API feature is not enabled",
+        });
+      }
+
+      const drizzle = db.instance;
+
+      // Fetch tool and verify tenant ownership
+      const [tool] = await drizzle
+        .select({ id: agencyTools.id, tenantId: agencyTools.tenantId })
+        .from(agencyTools)
+        .where(eq(agencyTools.id, input.toolId))
+        .limit(1);
+
+      if (!tool) {
+        throw new TRPCError({ code: "NOT_FOUND", message: "Tool not found" });
+      }
+
+      if (tool.tenantId !== ctx.tenantId) {
+        throw new TRPCError({
+          code: "FORBIDDEN",
+          message: "Tool belongs to a different tenant",
+        });
+      }
+
+      await drizzle
+        .update(agencyTools)
+        .set({
+          isExposedAsApi: input.exposed,
+          updatedAt: new Date(),
+        })
+        .where(eq(agencyTools.id, input.toolId));
+
+      return { success: true };
+    }),
+
   adminGetRevenueStats: adminProcedure
     .input(
       z.object({
diff --git a/apps/web/server/routes/__tests__/agencyToolsApi.test.ts b/apps/web/server/routes/__tests__/agencyToolsApi.test.ts
new file mode 100644
index 00000000..804ec643
--- /dev/null
+++ b/apps/web/server/routes/__tests__/agencyToolsApi.test.ts
@@ -0,0 +1,321 @@
+import { describe, it, expect, vi, beforeEach } from "vitest";
+import express from "express";
+import request from "supertest";
+
+// Mock dependencies before importing the module
+vi.mock("../../db", () => ({
+  db: {
+    instance: {
+      select: vi.fn().mockReturnThis(),
+      from: vi.fn().mockReturnThis(),
+      where: vi.fn().mockReturnThis(),
+      limit: vi.fn().mockResolvedValue([]),
+      update: vi.fn().mockReturnThis(),
+      set: vi.fn().mockReturnThis(),
+    },
+  },
+}));
+
+vi.mock("../../services/featureFlags", () => ({
+  getFeatureFlag: vi.fn().mockResolvedValue(true),
+}));
+
+vi.mock("../../services/crypto", () => ({
+  decrypt: vi.fn().mockReturnValue('{"X-Custom": "value"}'),
+}));
+
+vi.mock("../../services/redis", () => ({
+  getRedisClient: vi.fn().mockReturnValue({
+    incr: vi.fn().mockResolvedValue(1),
+    expire: vi.fn().mockResolvedValue(true),
+    get: vi.fn().mockResolvedValue(null),
+  }),
+}));
+
+vi.mock("../../middleware/requireScopes", () => ({
+  requireScopes: () => (req: any, _res: any, next: any) => next(),
+}));
+
+vi.mock("../../middleware/publicApiHeaders", () => ({
+  sendApiError: (res: any, status: number, code: string, message: string) => {
+    res.status(status).json({ error: { code, message, type: "error" } });
+  },
+}));
+
+import { createAgencyToolsApiRouter } from "../agencyToolsApi";
+import { db } from "../../db";
+import { getFeatureFlag } from "../../services/featureFlags";
+
+function createTestApp(auth?: Record<string, unknown>) {
+  const app = express();
+  app.use(express.json());
+  // Simulate auth middleware
+  app.use((req, _res, next) => {
+    if (auth) {
+      (req as any).auth = auth;
+    }
+    next();
+  });
+  app.use("/api/v1/agency-tools", createAgencyToolsApiRouter());
+  return app;
+}
+
+describe("Standalone Tool API", () => {
+  beforeEach(() => {
+    vi.clearAllMocks();
+    vi.mocked(getFeatureFlag).mockResolvedValue(true);
+  });
+
+  describe("POST /api/v1/agency-tools/:toolId/execute", () => {
+    it("requires authentication", async () => {
+      const app = createTestApp(); // No auth
+      const res = await request(app)
+        .post("/api/v1/agency-tools/test-id/execute")
+        .send({ query: "test" });
+      expect(res.status).toBe(401);
+    });
+
+    it("rejects tool not marked isExposedAsApi", async () => {
+      const app = createTestApp({
+        ok: true,
+        mode: "api_key",
+        tenantId: "tenant-1",
+        sub: "user-1",
+        keyHash: "hash1",
+        scopes: ["agency:tool:execute"],
+      });
+
+      // Mock: tool not found (select returns empty)
+      vi.mocked(db.instance.limit).mockResolvedValue([]);
+
+      const res = await request(app)
+        .post("/api/v1/agency-tools/tool-123/execute")
+        .send({ query: "test" });
+
+      expect(res.status).toBe(404);
+      expect(res.body.error.message).toContain("not found or not exposed");
+    });
+
+    it("validates tenant isolation", async () => {
+      const app = createTestApp({
+        ok: true,
+        mode: "api_key",
+        tenantId: "tenant-A",
+        sub: "user-1",
+        keyHash: "hash1",
+        scopes: ["agency:tool:execute"],
+      });
+
+      // Mock: tool belongs to tenant-B
+      vi.mocked(db.instance.limit).mockResolvedValue([
+        {
+          id: "tool-123",
+          tenantId: "tenant-B",
+          isExposedAsApi: true,
+          isEnabled: true,
+          name: "Test Tool",
+          inputSchema: null,
+          outputSchema: null,
+          config: { endpoint_url: "https://example.com/api" },
+          httpMethod: "POST",
+          headersEncrypted: null,
+        },
+      ]);
+
+      const res = await request(app)
+        .post("/api/v1/agency-tools/tool-123/execute")
+        .send({ query: "test" });
+
+      expect(res.status).toBe(403);
+      expect(res.body.error.message).toContain("not accessible from this tenant");
+    });
+
+    it("validates input against tool inputSchema", async () => {
+      const app = createTestApp({
+        ok: true,
+        mode: "api_key",
+        tenantId: "tenant-1",
+        sub: "user-1",
+        keyHash: "hash1",
+        scopes: ["agency:tool:execute"],
+      });
+
+      vi.mocked(db.instance.limit).mockResolvedValue([
+        {
+          id: "tool-123",
+          tenantId: "tenant-1",
+          isExposedAsApi: true,
+          isEnabled: true,
+          name: "Test Tool",
+          inputSchema: {
+            type: "object",
+            required: ["query"],
+            properties: { query: { type: "string" } },
+          },
+          outputSchema: null,
+          config: { endpoint_url: "https://example.com/api" },
+          httpMethod: "POST",
+          headersEncrypted: null,
+        },
+      ]);
+
+      const res = await request(app)
+        .post("/api/v1/agency-tools/tool-123/execute")
+        .send({ wrong_field: "value" });
+
+      expect(res.status).toBe(400);
+      expect(res.body.error.code).toBe("validation_error");
+    });
+
+    it("succeeds with valid input", async () => {
+      const app = createTestApp({
+        ok: true,
+        mode: "api_key",
+        tenantId: "tenant-1",
+        sub: "user-1",
+        keyHash: "hash1",
+        scopes: ["agency:tool:execute"],
+      });
+
+      vi.mocked(db.instance.limit).mockResolvedValue([
+        {
+          id: "tool-123",
+          tenantId: "tenant-1",
+          isExposedAsApi: true,
+          isEnabled: true,
+          name: "Test Tool",
+          inputSchema: null,
+          outputSchema: null,
+          config: { endpoint_url: "https://example.com/api" },
+          httpMethod: "POST",
+          headersEncrypted: null,
+        },
+      ]);
+
+      // Mock global fetch
+      const mockFetch = vi.fn().mockResolvedValue({
+        ok: true,
+        status: 200,
+        text: async () => '{"result": "ok"}',
+      });
+      vi.stubGlobal("fetch", mockFetch);
+
+      const res = await request(app)
+        .post("/api/v1/agency-tools/tool-123/execute")
+        .send({ query: "test" });
+
+      expect(res.status).toBe(200);
+      expect(res.body.result).toEqual({ result: "ok" });
+      vi.unstubAllGlobals();
+    });
+
+    it("returns 403 when feature flag is disabled", async () => {
+      vi.mocked(getFeatureFlag).mockResolvedValue(false);
+
+      const app = createTestApp({
+        ok: true,
+        mode: "api_key",
+        tenantId: "tenant-1",
+        sub: "user-1",
+        keyHash: "hash1",
+        scopes: ["agency:tool:execute"],
+      });
+
+      const res = await request(app)
+        .post("/api/v1/agency-tools/tool-123/execute")
+        .send({ query: "test" });
+
+      expect(res.status).toBe(403);
+      expect(res.body.error.code).toBe("feature_disabled");
+    });
+  });
+
+  describe("GET /api/v1/agency-tools/openapi.json", () => {
+    it("returns valid OpenAPI 3.0 spec", async () => {
+      const app = createTestApp({
+        ok: true,
+        mode: "api_key",
+        tenantId: "tenant-1",
+        sub: "user-1",
+        keyHash: "hash1",
+        scopes: ["agency:tool:execute"],
+      });
+
+      // Mock 2 exposed tools
+      vi.mocked(db.instance.limit).mockResolvedValue([]); // Not used for openapi.json
+      vi.mocked(db.instance.where).mockResolvedValue([
+        {
+          id: "tool-1",
+          name: "Search Tool",
+          description: "Searches the web",
+          inputSchema: { type: "object", properties: { query: { type: "string" } } },
+          outputSchema: { type: "object" },
+        },
+        {
+          id: "tool-2",
+          name: "Translate Tool",
+          description: "Translates text",
+          inputSchema: { type: "object", properties: { text: { type: "string" } } },
+          outputSchema: null,
+        },
+      ]);
+
+      const res = await request(app).get("/api/v1/agency-tools/openapi.json");
+
+      expect(res.status).toBe(200);
+      expect(res.body.openapi).toBe("3.0.3");
+      expect(res.body.info.title).toBe("SmartSpecPro Agency Tools API");
+      expect(res.body.paths[`/api/v1/agency-tools/tool-1/execute`]).toBeDefined();
+      expect(res.body.paths[`/api/v1/agency-tools/tool-2/execute`]).toBeDefined();
+      expect(res.body.components.securitySchemes.bearerAuth).toBeDefined();
+      expect(res.body.components.securitySchemes.apiKeyHeader).toBeDefined();
+    });
+
+    it("excludes non-exposed tools", async () => {
+      const app = createTestApp({
+        ok: true,
+        mode: "api_key",
+        tenantId: "tenant-1",
+        sub: "user-1",
+        keyHash: "hash1",
+        scopes: ["agency:tool:execute"],
+      });
+
+      // Only return exposed tools (the query already filters)
+      vi.mocked(db.instance.where).mockResolvedValue([
+        {
+          id: "tool-exposed",
+          name: "Exposed Tool",
+          description: "Visible",
+          inputSchema: null,
+          outputSchema: null,
+        },
+      ]);
+
+      const res = await request(app).get("/api/v1/agency-tools/openapi.json");
+
+      expect(res.status).toBe(200);
+      const pathKeys = Object.keys(res.body.paths);
+      expect(pathKeys.length).toBe(1);
+      expect(pathKeys[0]).toContain("tool-exposed");
+    });
+
+    it("returns empty paths for tenant with no exposed tools", async () => {
+      const app = createTestApp({
+        ok: true,
+        mode: "api_key",
+        tenantId: "tenant-1",
+        sub: "user-1",
+        keyHash: "hash1",
+        scopes: ["agency:tool:execute"],
+      });
+
+      vi.mocked(db.instance.where).mockResolvedValue([]);
+
+      const res = await request(app).get("/api/v1/agency-tools/openapi.json");
+
+      expect(res.status).toBe(200);
+      expect(Object.keys(res.body.paths)).toHaveLength(0);
+    });
+  });
+});
diff --git a/apps/web/server/routes/agencyToolsApi.ts b/apps/web/server/routes/agencyToolsApi.ts
new file mode 100644
index 00000000..6acb1769
--- /dev/null
+++ b/apps/web/server/routes/agencyToolsApi.ts
@@ -0,0 +1,274 @@
+/**
+ * Standalone Tool API — exposes custom agency tools as independent HTTP endpoints
+ * for external automation, webhooks, n8n, etc.
+ *
+ * Routes:
+ *   POST /api/v1/agency-tools/:toolId/execute  — Execute a tool
+ *   GET  /api/v1/agency-tools/openapi.json      — Dynamic OpenAPI spec for exposed tools
+ */
+
+import { Router, type Request, type Response } from "express";
+import { eq, and } from "drizzle-orm";
+import Ajv from "ajv";
+import { requireScopes } from "../middleware/requireScopes";
+import { sendApiError } from "../middleware/publicApiHeaders";
+import { getFeatureFlag } from "../services/featureFlags";
+import { decrypt } from "../services/crypto";
+import { getRedisClient } from "../services/redis";
+import { db } from "../db";
+import { agencyTools } from "../../drizzle/schema";
+
+const ajv = new Ajv({ allErrors: true });
+
+// Rate limit: 100 req/min per API key via Redis sliding window
+const RATE_LIMIT_MAX = 100;
+const RATE_LIMIT_WINDOW_SECONDS = 60;
+
+async function checkRateLimit(keyHash: string): Promise<{ allowed: boolean; remaining: number }> {
+  try {
+    const redis = getRedisClient();
+    const key = `agency-tool-api:${keyHash}`;
+    const current = await redis.incr(key);
+    if (current === 1) {
+      await redis.expire(key, RATE_LIMIT_WINDOW_SECONDS);
+    }
+    const remaining = Math.max(0, RATE_LIMIT_MAX - current);
+    return { allowed: current <= RATE_LIMIT_MAX, remaining };
+  } catch {
+    // Redis unavailable — allow request
+    return { allowed: true, remaining: RATE_LIMIT_MAX };
+  }
+}
+
+export function createAgencyToolsApiRouter(): Router {
+  const router = Router();
+
+  // All routes require agency:tool:execute scope
+  router.use(requireScopes("agency:tool:execute"));
+
+  // ── POST /api/v1/agency-tools/:toolId/execute ─────────────────────────
+  router.post("/:toolId/execute", async (req: Request, res: Response) => {
+    try {
+      // Feature flag check
+      const flagEnabled = await getFeatureFlag("AGENCY_TOOL_API_ENABLED");
+      if (!flagEnabled) {
+        return sendApiError(res, 403, "feature_disabled", "Agency Tool API is not enabled for this instance");
+      }
+
+      const auth = req.auth;
+      if (!auth) {
+        return sendApiError(res, 401, "invalid_api_key", "Authentication required");
+      }
+
+      // Rate limiting
+      const keyHash = auth.mode === "api_key" ? auth.apiKeyId : auth.sub || "unknown";
+      const { allowed, remaining } = await checkRateLimit(keyHash);
+      res.setHeader("X-RateLimit-Limit", RATE_LIMIT_MAX);
+      res.setHeader("X-RateLimit-Remaining", remaining);
+      if (!allowed) {
+        res.setHeader("Retry-After", RATE_LIMIT_WINDOW_SECONDS);
+        return sendApiError(res, 429, "rate_limit_exceeded", "Rate limit exceeded. Try again later.");
+      }
+
+      const { toolId } = req.params;
+      const drizzle = db.instance;
+
+      // Fetch tool
+      const [tool] = await drizzle
+        .select()
+        .from(agencyTools)
+        .where(
+          and(
+            eq(agencyTools.id, toolId),
+            eq(agencyTools.isExposedAsApi, true),
+            eq(agencyTools.isEnabled, true),
+          ),
+        )
+        .limit(1);
+
+      if (!tool) {
+        return sendApiError(res, 404, "not_found", "Tool not found or not exposed as API");
+      }
+
+      // Tenant isolation — only api_key mode carries tenantId
+      const tenantId = auth.mode === "api_key" ? auth.tenantId : undefined;
+      if (!tenantId || tool.tenantId !== tenantId) {
+        return sendApiError(res, 403, "forbidden", "Tool not accessible from this tenant");
+      }
+
+      // Validate input against tool inputSchema
+      const input = req.body;
+      if (tool.inputSchema) {
+        const validate = ajv.compile(tool.inputSchema);
+        if (!validate(input)) {
+          return sendApiError(
+            res,
+            400,
+            "validation_error",
+            `Input validation failed: ${ajv.errorsText(validate.errors)}`,
+          );
+        }
+      }
+
+      // Execute the tool via HTTP call
+      const endpointUrl = (tool.config as Record<string, unknown>)?.endpoint_url as string | undefined;
+      if (!endpointUrl) {
+        return sendApiError(res, 500, "tool_error", "Tool has no endpoint configured");
+      }
+
+      // Prepare headers
+      const headers: Record<string, string> = { "Content-Type": "application/json" };
+      if (tool.headersEncrypted) {
+        try {
+          const decryptedHeaders = JSON.parse(decrypt(tool.headersEncrypted));
+          Object.assign(headers, decryptedHeaders);
+        } catch {
+          // Ignore header decryption failures — proceed without custom headers
+        }
+      }
+
+      const method = (tool.httpMethod || "POST").toUpperCase();
+      const fetchOptions: RequestInit = {
+        method,
+        headers,
+        ...(method !== "GET" ? { body: JSON.stringify(input) } : {}),
+      };
+
+      const response = await fetch(endpointUrl, fetchOptions);
+      const responseText = await response.text();
+
+      if (!response.ok) {
+        return res.status(502).json({
+          error: {
+            code: "tool_execution_error",
+            message: `Tool returned HTTP ${response.status}`,
+            type: "tool_error",
+          },
+          details: responseText.slice(0, 500),
+        });
+      }
+
+      // Try to parse as JSON, otherwise return as text
+      try {
+        const jsonResult = JSON.parse(responseText);
+        return res.json({ result: jsonResult });
+      } catch {
+        return res.json({ result: responseText.slice(0, 51200) });
+      }
+    } catch (err) {
+      return sendApiError(res, 500, "internal_error", "Tool execution failed unexpectedly");
+    }
+  });
+
+  // ── GET /api/v1/agency-tools/openapi.json ─────────────────────────────
+  router.get("/openapi.json", async (req: Request, res: Response) => {
+    try {
+      const flagEnabled = await getFeatureFlag("AGENCY_TOOL_API_ENABLED");
+      if (!flagEnabled) {
+        return sendApiError(res, 403, "feature_disabled", "Agency Tool API is not enabled");
+      }
+
+      const auth = req.auth;
+      if (!auth) {
+        return sendApiError(res, 401, "invalid_api_key", "Authentication required");
+      }
+
+      const drizzle = db.instance;
+      const exposedTools = await drizzle
+        .select()
+        .from(agencyTools)
+        .where(
+          and(
+            eq(agencyTools.tenantId, auth.mode === "api_key" ? auth.tenantId : ""),
+            eq(agencyTools.isExposedAsApi, true),
+            eq(agencyTools.isEnabled, true),
+          ),
+        );
+
+      // Build dynamic paths
+      const paths: Record<string, unknown> = {};
+      for (const tool of exposedTools) {
+        const pathKey = `/api/v1/agency-tools/${tool.id}/execute`;
+        paths[pathKey] = {
+          post: {
+            summary: tool.name,
+            description: tool.description || `Execute tool: ${tool.name}`,
+            operationId: `execute_${tool.id.replace(/-/g, "_")}`,
+            tags: ["Agency Tools"],
+            requestBody: {
+              required: true,
+              content: {
+                "application/json": {
+                  schema: tool.inputSchema || { type: "object" },
+                },
+              },
+            },
+            responses: {
+              "200": {
+                description: "Tool execution result",
+                content: {
+                  "application/json": {
+                    schema: tool.outputSchema || { type: "object" },
+                  },
+                },
+              },
+              "400": { description: "Bad request — invalid parameters" },
+              "401": { description: "Authentication failed" },
+              "403": { description: "Insufficient scopes or tenant mismatch" },
+              "429": { description: "Rate limit exceeded" },
+            },
+          },
+        };
+      }
+
+      const spec = {
+        openapi: "3.0.3",
+        info: {
+          title: "SmartSpecPro Agency Tools API",
+          version: "1.0.0",
+          description: "Tenant-specific API for executing exposed agency tools.",
+        },
+        servers: [{ url: "https://smartaihub.app" }],
+        security: [{ bearerAuth: [] }, { apiKeyHeader: [] }],
+        paths,
+        components: {
+          securitySchemes: {
+            bearerAuth: {
+              type: "http",
+              scheme: "bearer",
+              description: "Bearer token (Authorization: Bearer sk-ssp_...)",
+            },
+            apiKeyHeader: {
+              type: "apiKey",
+              in: "header",
+              name: "X-Api-Key",
+              description: "API key header (X-Api-Key: sk-ssp_...)",
+            },
+          },
+          schemas: {
+            Error: {
+              type: "object",
+              properties: {
+                error: {
+                  type: "object",
+                  properties: {
+                    code: { type: "string" },
+                    message: { type: "string" },
+                    type: { type: "string" },
+                  },
+                },
+              },
+            },
+          },
+        },
+      };
+
+      res.setHeader("Content-Type", "application/json");
+      return res.json(spec);
+    } catch (err) {
+      return sendApiError(res, 500, "internal_error", "Failed to generate OpenAPI spec");
+    }
+  });
+
+  return router;
+}
diff --git a/python-backend/app/llm_proxy/providers/__init__.py b/python-backend/app/llm_proxy/providers/__init__.py
index 6235fe39..0ea84ff2 100644
--- a/python-backend/app/llm_proxy/providers/__init__.py
+++ b/python-backend/app/llm_proxy/providers/__init__.py
@@ -14,6 +14,7 @@ from app.llm_proxy.providers.zai_provider import ZAIProvider
 from .kie_ai_provider import KieAIProvider
 from .byteplus_modelark_provider import BytePlusModelArkProvider
 from .uvoice_provider import UVoiceProvider
+from .fal_ai_provider import FalAIProvider
 
 __all__ = [
     "BaseLLMProvider",
@@ -27,4 +28,5 @@ __all__ = [
     "KieAIProvider",
     "BytePlusModelArkProvider",
     "UVoiceProvider",
+    "FalAIProvider",
 ]
diff --git a/python-backend/app/llm_proxy/providers/fal_ai_provider.py b/python-backend/app/llm_proxy/providers/fal_ai_provider.py
new file mode 100644
index 00000000..d083f687
--- /dev/null
+++ b/python-backend/app/llm_proxy/providers/fal_ai_provider.py
@@ -0,0 +1,245 @@
+"""fal.ai media provider — video (queue), audio (sync TTS), image (sync Flux)."""
+
+import re
+from typing import Any
+from urllib.parse import urlparse
+
+import httpx
+import structlog
+
+from app.core.media_job_validators import validate_uri_no_ssrf
+
+logger = structlog.get_logger()
+
+# URL-bearing fields that must pass SSRF validation
+_URL_FIELDS = frozenset({"image_url", "end_image_url", "audio_url", "video_url"})
+
+
+class FalAIProvider:
+    BASE_URL = "https://fal.run"
+    QUEUE_BASE_URL = "https://queue.fal.run"
+    MAX_VIDEO_FILE_SIZE = 500 * 1024 * 1024  # 500 MB
+
+    VIDEO_MODELS: frozenset[str] = frozenset({
+        "fal-ai/ltx-2.3/text-to-video",
+        "fal-ai/ltx-2.3/text-to-video/fast",
+        "fal-ai/ltx-2.3/image-to-video",
+        "fal-ai/ltx-2.3/image-to-video/fast",
+        "fal-ai/ltx-2.3/audio-to-video",
+        "fal-ai/ltx-2.3/extend-video",
+        "fal-ai/ltx-2.3/retake-video",
+    })
+    AUDIO_MODELS: frozenset[str] = frozenset({"fal-ai/lux-tts"})
+    IMAGE_MODELS: frozenset[str] = frozenset({
+        "fal-ai/flux/schnell",
+        "fal-ai/flux/dev",
+        "fal-ai/flux-pro",
+        "fal-ai/stable-diffusion-v3-medium",
+    })
+
+    def __init__(self, api_key: str, base_url: str | None = None) -> None:
+        self.base_url = (base_url or self.BASE_URL).rstrip("/")
+        self._headers = {
+            "Authorization": f"Key {api_key}",
+            "Content-Type": "application/json",
+        }
+        self.client = httpx.AsyncClient(timeout=300.0)
+        logger.info("fal_ai_provider_init", base_url=self.base_url)
+
+    # ------------------------------------------------------------------
+    # Validation helpers
+    # ------------------------------------------------------------------
+
+    def _validate_urls(self, params: dict[str, Any]) -> None:
+        """SSRF: validate URL fields + reject host.docker.internal + HEAD size check for video_url."""
+        for key in _URL_FIELDS:
+            url = params.get(key)
+            if url is None:
+                continue
+
+            # Reject host.docker.internal (fal.ai provider-specific)
+            parsed = urlparse(url)
+            hostname = (parsed.hostname or "").lower()
+            if hostname == "host.docker.internal":
+                raise ValueError(
+                    f"URL field '{key}' targets host.docker.internal which is not allowed for fal.ai"
+                )
+
+            # Run the shared SSRF validator
+            validate_uri_no_ssrf(url)
+
+        # Video file size check (synchronous HEAD is not practical here, so
+        # callers needing async HEAD must do it separately — see _check_video_size)
+        video_url = params.get("video_url")
+        if video_url is not None:
+            self._check_video_size_sync(video_url)
+
+    def _check_video_size_sync(self, url: str) -> None:
+        """Synchronous HEAD check for video file size (best-effort)."""
+        try:
+            with httpx.Client(timeout=10.0) as sync_client:
+                resp = sync_client.head(url)
+                resp.raise_for_status()
+                cl = resp.headers.get("Content-Length")
+                if cl and int(cl) > self.MAX_VIDEO_FILE_SIZE:
+                    raise ValueError(
+                        f"Video file exceeds 500MB limit ({int(cl)} bytes)"
+                    )
+        except (httpx.RequestError, httpx.HTTPStatusError):
+            # Best effort — if HEAD fails, allow through
+            pass
+
+    @staticmethod
+    def _sanitize_prompt(prompt: str) -> str:
+        """Strip HTML/XML tags from prompt."""
+        return re.sub(r"<[^>]+>", "", prompt)
+
+    # ------------------------------------------------------------------
+    # HTTP error handling
+    # ------------------------------------------------------------------
+
+    @staticmethod
+    def _handle_http_error(exc: httpx.HTTPStatusError) -> None:
+        """Convert HTTP errors to sanitized ValueErrors. Never leak response body."""
+        status = exc.response.status_code
+        if status == 401:
+            raise ValueError("Invalid fal.ai API key") from None
+        if status == 422:
+            raise ValueError("Content policy rejection") from None
+        if status == 429:
+            raise ValueError("fal.ai rate limit exceeded") from None
+        raise ValueError(f"fal.ai error (HTTP {status})") from None
+
+    # ------------------------------------------------------------------
+    # Public API — media generation
+    # ------------------------------------------------------------------
+
+    async def generate_video(self, model_id: str, params: dict[str, Any]) -> dict:
+        """Queue-based video generation. Returns {id, status: PROCESSING}."""
+        self._validate_urls(params)
+
+        if "prompt" in params:
+            params = {**params, "prompt": self._sanitize_prompt(params["prompt"])}
+
+        logger.info("fal_ai_generate_video", model_id=model_id)
+        request_id = await self._submit_queue(model_id, params)
+        return {"id": request_id, "status": "PROCESSING"}
+
+    async def generate_audio(self, model_id: str, params: dict[str, Any]) -> dict:
+        """Synchronous TTS generation. Returns {data: [{url}], status: COMPLETED}."""
+        self._validate_urls(params)
+
+        if "prompt" in params:
+            params = {**params, "prompt": self._sanitize_prompt(params["prompt"])}
+
+        url = f"{self.base_url}/{model_id}"
+        logger.info("fal_ai_generate_audio", model_id=model_id, url=url)
+
+        try:
+            response = await self.client.post(url, headers=self._headers, json=params)
+            response.raise_for_status()
+        except httpx.HTTPStatusError as exc:
+            self._handle_http_error(exc)
+
+        data = response.json()
+        audio_url = data.get("audio", {}).get("url", "")
+        return {
+            "data": [{"url": audio_url}],
+            "status": "COMPLETED",
+        }
+
+    async def generate_image(self, model_id: str, params: dict[str, Any]) -> dict:
+        """Synchronous image generation. Returns {data: [{url}], status: COMPLETED}."""
+        self._validate_urls(params)
+
+        if "prompt" in params:
+            params = {**params, "prompt": self._sanitize_prompt(params["prompt"])}
+
+        url = f"{self.base_url}/{model_id}"
+        logger.info("fal_ai_generate_image", model_id=model_id, url=url)
+
+        try:
+            response = await self.client.post(url, headers=self._headers, json=params)
+            response.raise_for_status()
+        except httpx.HTTPStatusError as exc:
+            self._handle_http_error(exc)
+
+        data = response.json()
+        images = data.get("images", [])
+        return {
+            "data": [{"url": img.get("url", "")} for img in images],
+            "status": "COMPLETED",
+        }
+
+    # ------------------------------------------------------------------
+    # Queue operations
+    # ------------------------------------------------------------------
+
+    async def _submit_queue(self, model_id: str, payload: dict[str, Any]) -> str:
+        """POST queue.fal.run/{model_id} → return request_id."""
+        url = f"{self.QUEUE_BASE_URL}/{model_id}"
+        logger.info("fal_ai_submit_queue", model_id=model_id, url=url)
+
+        try:
+            response = await self.client.post(url, headers=self._headers, json=payload)
+            response.raise_for_status()
+        except httpx.HTTPStatusError as exc:
+            self._handle_http_error(exc)
+
+        data = response.json()
+        return data["request_id"]
+
+    async def get_queue_status(self, model_id: str, request_id: str) -> dict:
+        """GET queue status → {status: IN_QUEUE|IN_PROGRESS|COMPLETED}."""
+        url = f"{self.QUEUE_BASE_URL}/{model_id}/requests/{request_id}/status"
+        logger.info("fal_ai_queue_status", model_id=model_id, request_id=request_id)
+
+        try:
+            response = await self.client.get(url, headers=self._headers)
+            response.raise_for_status()
+        except httpx.HTTPStatusError as exc:
+            self._handle_http_error(exc)
+
+        return response.json()
+
+    async def get_queue_result(self, model_id: str, request_id: str) -> dict:
+        """GET queue result → normalized {data: [{url}], actual_duration, actual_resolution}."""
+        url = f"{self.QUEUE_BASE_URL}/{model_id}/requests/{request_id}"
+        logger.info("fal_ai_queue_result", model_id=model_id, request_id=request_id)
+
+        try:
+            response = await self.client.get(url, headers=self._headers)
+            response.raise_for_status()
+        except httpx.HTTPStatusError as exc:
+            self._handle_http_error(exc)
+
+        data = response.json()
+        video = data.get("video", {})
+        video_url = video.get("url", "")
+        width = video.get("width", 0)
+        height = video.get("height", 0)
+        duration = video.get("duration")
+
+        return {
+            "data": [{"url": video_url}],
+            "actual_duration": duration,
+            "actual_resolution": self._derive_resolution(width, height),
+        }
+
+    @staticmethod
+    def _derive_resolution(width: int, height: int) -> str:
+        """Derive resolution label from pixel dimensions."""
+        if width >= 3840:
+            return "2160p"
+        if width >= 2560:
+            return "1440p"
+        return "1080p"
+
+    # ------------------------------------------------------------------
+    # Cleanup
+    # ------------------------------------------------------------------
+
+    async def aclose(self) -> None:
+        """Close the httpx client. MUST be called in a finally block."""
+        await self.client.aclose()
+        logger.info("fal_ai_provider_closed")
diff --git a/python-backend/app/services/agency_orchestrator.py b/python-backend/app/services/agency_orchestrator.py
index cb32fc80..1943c0a9 100644
--- a/python-backend/app/services/agency_orchestrator.py
+++ b/python-backend/app/services/agency_orchestrator.py
@@ -420,6 +420,8 @@ class AgencyOrchestrator:
                     adapter=self.adapter,
                     retrieval_scope_mode=self.retrieval_scope_mode,
                     run_context=ctx.shared_context,
+                    emitter=self.event_emitter,
+                    run_id=self.event_emitter.run_id if self.event_emitter else None,
                 )
                 # Merge shared tools from agency level (cached per run)
                 if self._shared_tools_cache is None:
diff --git a/python-backend/app/services/agency_tools.py b/python-backend/app/services/agency_tools.py
index a2f7014c..196b9e05 100644
--- a/python-backend/app/services/agency_tools.py
+++ b/python-backend/app/services/agency_tools.py
@@ -260,11 +260,42 @@ def _execute_custom_tool_sync(custom_config: CustomToolConfig, tool_input: dict[
             lock.release()
 
 
-def _make_run_func(tool_config: ToolConfig, whitelist: set[str], run_context=None):
+def _make_run_func(
+    tool_config: ToolConfig,
+    whitelist: set[str],
+    run_context=None,
+    emitter=None,
+    run_id: str | None = None,
+):
     """Create a run function closure for a tool bridge."""
     captured_config = tool_config
     captured_whitelist = whitelist
     captured_run_context = run_context
+    captured_emitter = emitter
+    captured_run_id = run_id
+
+    async def _emit_progress(message: str, percent: int | None = None) -> None:
+        """Emit a tool_progress SSE event. No-op if emitter is None."""
+        if captured_emitter is None:
+            return
+        data: dict[str, Any] = {
+            "toolCallId": captured_config.tool_id,
+            "message": message,
+        }
+        if percent is not None:
+            data["percent"] = percent
+        await captured_emitter.emit("tool_progress", data)
+
+    def _emit_progress_sync(message: str, percent: int | None = None) -> None:
+        """Synchronous wrapper for _emit_progress (used inside sync run_func)."""
+        if captured_emitter is None:
+            return
+        import asyncio as _aio
+        try:
+            loop = _aio.get_running_loop()
+            loop.create_task(_emit_progress(message, percent))
+        except RuntimeError:
+            _aio.run(_emit_progress(message, percent))
 
     def run_func(tool_instance) -> str:
         # Attach run context to tool instance for tools that need shared state
@@ -300,6 +331,16 @@ def _make_run_func(tool_config: ToolConfig, whitelist: set[str], run_context=Non
 
         query = getattr(tool_instance, "query", "")
 
+        # Emit tool-specific progress before execution
+        _tool_progress_before = {
+            "builtin-web-search": "Searching...",
+            "builtin-browser": f"Navigating to {query[:100]}..." if query else "Navigating...",
+            "builtin-rag-knowledge": "Querying knowledge base...",
+            "builtin-skill-executor": f"Executing skill {config.config.get('skillSlug', '')}...".strip(".") + "...",
+        }
+        if config.tool_id in _tool_progress_before:
+            _emit_progress_sync(_tool_progress_before[config.tool_id])
+
         # Route based on risk level
         if config.tool_id == "builtin-agency-call":
             # Cross-agency calls are handled internally — not via HTTP sandbox.
@@ -339,6 +380,16 @@ def _make_run_func(tool_config: ToolConfig, whitelist: set[str], run_context=Non
         else:
             result = _execute_http(config, query)
 
+        # Emit tool-specific progress after execution
+        _tool_progress_after = {
+            "builtin-web-search": "Processing results...",
+            "builtin-browser": "Taking screenshot...",
+            "builtin-rag-knowledge": "Found documents...",
+            "builtin-skill-executor": "Generating output...",
+        }
+        if config.tool_id in _tool_progress_after:
+            _emit_progress_sync(_tool_progress_after[config.tool_id], percent=100)
+
         # Audit: log tool failure if result indicates error
         if result.startswith("Tool execution failed") or result.startswith("Sandbox execution failed"):
             log_agency_event(
@@ -350,6 +401,9 @@ def _make_run_func(tool_config: ToolConfig, whitelist: set[str], run_context=Non
 
         return result
 
+    # Attach emit_progress as a public async method on the run_func for external use
+    run_func.emit_progress = _emit_progress  # type: ignore[attr-defined]
+
     return run_func
 
 
@@ -420,6 +474,8 @@ def create_tool_bridge(
     whitelist: set[str],
     adapter=None,
     run_context=None,
+    emitter=None,
+    run_id: str | None = None,
 ) -> type:
     """Create a tool bridge class for agency-swarm.
 
@@ -435,7 +491,7 @@ def create_tool_bridge(
     Returns:
         A tool class for agency-swarm.
     """
-    run_func = _make_run_func(tool_config, whitelist, run_context=run_context)
+    run_func = _make_run_func(tool_config, whitelist, run_context=run_context, emitter=emitter, run_id=run_id)
     safe_name = tool_config.tool_id.replace("-", "_").replace(".", "_")
 
     if adapter is not None:
@@ -468,6 +524,8 @@ async def resolve_tools_for_agent(
     adapter=None,
     retrieval_scope_mode: str | None = None,
     run_context: "AgencyRunContext | None" = None,
+    emitter=None,
+    run_id: str | None = None,
 ) -> list[type]:
     """Resolve and construct tool bridges for a specific agent.
 
@@ -552,7 +610,7 @@ async def resolve_tools_for_agent(
             endpoint_url=endpoint_url,
             config=merged_config,
         )
-        tool_cls = create_tool_bridge(config, agency_whitelist, adapter=adapter, run_context=run_context)
+        tool_cls = create_tool_bridge(config, agency_whitelist, adapter=adapter, run_context=run_context, emitter=emitter, run_id=run_id)
         tool_classes.append(tool_cls)
 
     # MCP tools integration (section-14)
diff --git a/python-backend/tests/unit/services/test_fal_ai_provider.py b/python-backend/tests/unit/services/test_fal_ai_provider.py
new file mode 100644
index 00000000..420a5418
--- /dev/null
+++ b/python-backend/tests/unit/services/test_fal_ai_provider.py
@@ -0,0 +1,319 @@
+"""Unit tests for FalAIProvider."""
+
+import pytest
+import httpx
+from unittest.mock import AsyncMock, patch, MagicMock
+
+from app.llm_proxy.providers.fal_ai_provider import FalAIProvider
+
+
+# --- Constants ---
+
+
+class TestConstants:
+    def test_video_models_count(self):
+        assert len(FalAIProvider.VIDEO_MODELS) == 7
+
+    def test_video_models_are_frozenset(self):
+        assert isinstance(FalAIProvider.VIDEO_MODELS, frozenset)
+
+    def test_video_models_contain_ltx(self):
+        assert "fal-ai/ltx-2.3/text-to-video" in FalAIProvider.VIDEO_MODELS
+        assert "fal-ai/ltx-2.3/text-to-video/fast" in FalAIProvider.VIDEO_MODELS
+        assert "fal-ai/ltx-2.3/image-to-video" in FalAIProvider.VIDEO_MODELS
+        assert "fal-ai/ltx-2.3/image-to-video/fast" in FalAIProvider.VIDEO_MODELS
+        assert "fal-ai/ltx-2.3/audio-to-video" in FalAIProvider.VIDEO_MODELS
+        assert "fal-ai/ltx-2.3/extend-video" in FalAIProvider.VIDEO_MODELS
+        assert "fal-ai/ltx-2.3/retake-video" in FalAIProvider.VIDEO_MODELS
+
+    def test_audio_models(self):
+        assert FalAIProvider.AUDIO_MODELS == frozenset({"fal-ai/lux-tts"})
+
+    def test_image_models_count(self):
+        assert len(FalAIProvider.IMAGE_MODELS) == 4
+
+    def test_image_models_are_frozenset(self):
+        assert isinstance(FalAIProvider.IMAGE_MODELS, frozenset)
+
+    def test_base_url(self):
+        assert FalAIProvider.BASE_URL == "https://fal.run"
+
+    def test_queue_base_url(self):
+        assert FalAIProvider.QUEUE_BASE_URL == "https://queue.fal.run"
+
+
+# --- Init ---
+
+
+class TestInit:
+    def test_auth_header_format(self):
+        provider = FalAIProvider(api_key="test-key-123")
+        assert provider._headers["Authorization"] == "Key test-key-123"
+
+    def test_httpx_timeout(self):
+        provider = FalAIProvider(api_key="test-key")
+        assert provider.client.timeout.read == 300.0
+
+    def test_custom_base_url(self):
+        provider = FalAIProvider(api_key="test-key", base_url="https://custom.fal.run")
+        assert provider.base_url == "https://custom.fal.run"
+
+    def test_default_base_url(self):
+        provider = FalAIProvider(api_key="test-key")
+        assert provider.base_url == "https://fal.run"
+
+
+# --- generate_video (queue) ---
+
+
+class TestGenerateVideo:
+    @pytest.fixture
+    def provider(self):
+        return FalAIProvider(api_key="test-key")
+
+    async def test_posts_to_queue_endpoint(self, provider):
+        mock_response = MagicMock()
+        mock_response.status_code = 200
+        mock_response.json.return_value = {"request_id": "req-123", "status": "IN_QUEUE"}
+        mock_response.raise_for_status = MagicMock()
+
+        with patch.object(provider.client, "post", new_callable=AsyncMock, return_value=mock_response) as mock_post:
+            result = await provider.generate_video("fal-ai/ltx-2.3/text-to-video", {"prompt": "test"})
+
+            mock_post.assert_called_once()
+            call_url = mock_post.call_args[0][0]
+            assert call_url.startswith("https://queue.fal.run/")
+            assert "fal-ai/ltx-2.3/text-to-video" in call_url
+
+        assert result["id"] == "req-123"
+        assert result["status"] == "PROCESSING"
+
+    async def test_validates_urls_before_request(self, provider):
+        with patch.object(provider, "_validate_urls") as mock_validate:
+            mock_response = MagicMock()
+            mock_response.status_code = 200
+            mock_response.json.return_value = {"request_id": "req-123", "status": "IN_QUEUE"}
+            mock_response.raise_for_status = MagicMock()
+
+            with patch.object(provider.client, "post", new_callable=AsyncMock, return_value=mock_response):
+                await provider.generate_video(
+                    "fal-ai/ltx-2.3/text-to-video",
+                    {"prompt": "test", "image_url": "https://example.com/img.png"},
+                )
+                mock_validate.assert_called_once()
+
+    async def test_sanitizes_prompt(self, provider):
+        mock_response = MagicMock()
+        mock_response.status_code = 200
+        mock_response.json.return_value = {"request_id": "req-123", "status": "IN_QUEUE"}
+        mock_response.raise_for_status = MagicMock()
+
+        with patch.object(provider.client, "post", new_callable=AsyncMock, return_value=mock_response) as mock_post:
+            await provider.generate_video(
+                "fal-ai/ltx-2.3/text-to-video",
+                {"prompt": "Hello <script>alert(1)</script> world"},
+            )
+            posted_payload = mock_post.call_args[1]["json"]
+            assert "<script>" not in posted_payload["prompt"]
+            assert "Hello" in posted_payload["prompt"]
+            assert "world" in posted_payload["prompt"]
+
+
+# --- generate_audio (sync TTS) ---
+
+
+class TestGenerateAudio:
+    @pytest.fixture
+    def provider(self):
+        return FalAIProvider(api_key="test-key")
+
+    async def test_posts_to_sync_endpoint(self, provider):
+        mock_response = MagicMock()
+        mock_response.status_code = 200
+        mock_response.json.return_value = {"audio": {"url": "https://v3b.fal.media/audio.mp3"}}
+        mock_response.raise_for_status = MagicMock()
+
+        with patch.object(provider.client, "post", new_callable=AsyncMock, return_value=mock_response) as mock_post:
+            result = await provider.generate_audio("fal-ai/lux-tts", {"text": "Hello world"})
+
+            mock_post.assert_called_once()
+            call_url = mock_post.call_args[0][0]
+            assert call_url.startswith("https://fal.run/")
+
+        assert result["status"] == "COMPLETED"
+        assert result["data"][0]["url"] == "https://v3b.fal.media/audio.mp3"
+
+    async def test_validates_audio_url(self, provider):
+        with patch.object(provider, "_validate_urls") as mock_validate:
+            mock_response = MagicMock()
+            mock_response.status_code = 200
+            mock_response.json.return_value = {"audio": {"url": "https://v3b.fal.media/audio.mp3"}}
+            mock_response.raise_for_status = MagicMock()
+
+            with patch.object(provider.client, "post", new_callable=AsyncMock, return_value=mock_response):
+                await provider.generate_audio(
+                    "fal-ai/lux-tts",
+                    {"text": "Hello", "audio_url": "https://example.com/ref.mp3"},
+                )
+                mock_validate.assert_called_once()
+
+
+# --- generate_image (sync Flux) ---
+
+
+class TestGenerateImage:
+    @pytest.fixture
+    def provider(self):
+        return FalAIProvider(api_key="test-key")
+
+    async def test_posts_to_sync_endpoint(self, provider):
+        mock_response = MagicMock()
+        mock_response.status_code = 200
+        mock_response.json.return_value = {
+            "images": [{"url": "https://v3b.fal.media/img.png", "width": 1024, "height": 1024}]
+        }
+        mock_response.raise_for_status = MagicMock()
+
+        with patch.object(provider.client, "post", new_callable=AsyncMock, return_value=mock_response) as mock_post:
+            result = await provider.generate_image("fal-ai/flux/schnell", {"prompt": "a cat"})
+
+            mock_post.assert_called_once()
+            call_url = mock_post.call_args[0][0]
+            assert call_url.startswith("https://fal.run/")
+
+        assert result["status"] == "COMPLETED"
+        assert result["data"][0]["url"] == "https://v3b.fal.media/img.png"
+
+
+# --- Queue Operations ---
+
+
+class TestQueueOperations:
+    @pytest.fixture
+    def provider(self):
+        return FalAIProvider(api_key="test-key")
+
+    async def test_submit_queue_returns_request_id(self, provider):
+        mock_response = MagicMock()
+        mock_response.status_code = 200
+        mock_response.json.return_value = {"request_id": "abc-123-def", "status": "IN_QUEUE"}
+        mock_response.raise_for_status = MagicMock()
+
+        with patch.object(provider.client, "post", new_callable=AsyncMock, return_value=mock_response):
+            request_id = await provider._submit_queue("fal-ai/ltx-2.3/text-to-video", {"prompt": "test"})
+            assert request_id == "abc-123-def"
+
+    async def test_get_queue_status(self, provider):
+        mock_response = MagicMock()
+        mock_response.status_code = 200
+        mock_response.json.return_value = {"status": "IN_PROGRESS"}
+        mock_response.raise_for_status = MagicMock()
+
+        with patch.object(provider.client, "get", new_callable=AsyncMock, return_value=mock_response):
+            result = await provider.get_queue_status("fal-ai/ltx-2.3/text-to-video", "req-123")
+            assert result["status"] == "IN_PROGRESS"
+
+    async def test_get_queue_result_normalizes(self, provider):
+        mock_response = MagicMock()
+        mock_response.status_code = 200
+        mock_response.json.return_value = {
+            "video": {
+                "url": "https://v3b.fal.media/video.mp4",
+                "width": 1920,
+                "height": 1080,
+                "duration": 6.0,
+            }
+        }
+        mock_response.raise_for_status = MagicMock()
+
+        with patch.object(provider.client, "get", new_callable=AsyncMock, return_value=mock_response):
+            result = await provider.get_queue_result("fal-ai/ltx-2.3/text-to-video", "req-123")
+            assert result["data"][0]["url"] == "https://v3b.fal.media/video.mp4"
+            assert result["actual_duration"] == 6.0
+            assert result["actual_resolution"] == "1080p"
+
+
+# --- Resolution derivation ---
+
+
+class TestResolutionDerivation:
+    def test_4k_resolution(self):
+        provider = FalAIProvider(api_key="test-key")
+        assert provider._derive_resolution(3840, 2160) == "2160p"
+
+    def test_1440p_resolution(self):
+        provider = FalAIProvider(api_key="test-key")
+        assert provider._derive_resolution(2560, 1440) == "1440p"
+
+    def test_1080p_resolution(self):
+        provider = FalAIProvider(api_key="test-key")
+        assert provider._derive_resolution(1920, 1080) == "1080p"
+
+    def test_below_1440p_defaults_to_1080p(self):
+        provider = FalAIProvider(api_key="test-key")
+        assert provider._derive_resolution(1280, 720) == "1080p"
+
+
+# --- Error Handling ---
+
+
+class TestErrorHandling:
+    @pytest.fixture
+    def provider(self):
+        return FalAIProvider(api_key="test-key")
+
+    async def test_401_invalid_api_key(self, provider):
+        mock_response = MagicMock()
+        mock_response.status_code = 401
+        mock_response.raise_for_status.side_effect = httpx.HTTPStatusError(
+            "Unauthorized", request=MagicMock(), response=mock_response
+        )
+
+        with patch.object(provider.client, "post", new_callable=AsyncMock, return_value=mock_response):
+            with pytest.raises(ValueError, match="Invalid fal.ai API key"):
+                await provider.generate_image("fal-ai/flux/schnell", {"prompt": "test"})
+
+    async def test_422_content_policy(self, provider):
+        mock_response = MagicMock()
+        mock_response.status_code = 422
+        mock_response.raise_for_status.side_effect = httpx.HTTPStatusError(
+            "Unprocessable", request=MagicMock(), response=mock_response
+        )
+
+        with patch.object(provider.client, "post", new_callable=AsyncMock, return_value=mock_response):
+            with pytest.raises(ValueError, match="Content policy rejection"):
+                await provider.generate_image("fal-ai/flux/schnell", {"prompt": "test"})
+
+    async def test_429_rate_limit(self, provider):
+        mock_response = MagicMock()
+        mock_response.status_code = 429
+        mock_response.raise_for_status.side_effect = httpx.HTTPStatusError(
+            "Too Many Requests", request=MagicMock(), response=mock_response
+        )
+
+        with patch.object(provider.client, "post", new_callable=AsyncMock, return_value=mock_response):
+            with pytest.raises(ValueError, match="fal.ai rate limit exceeded"):
+                await provider.generate_image("fal-ai/flux/schnell", {"prompt": "test"})
+
+    async def test_500_no_body_in_message(self, provider):
+        mock_response = MagicMock()
+        mock_response.status_code = 500
+        mock_response.text = "Internal server error details that should not leak"
+        mock_response.raise_for_status.side_effect = httpx.HTTPStatusError(
+            "Internal Server Error", request=MagicMock(), response=mock_response
+        )
+
+        with patch.object(provider.client, "post", new_callable=AsyncMock, return_value=mock_response):
+            with pytest.raises(ValueError, match=r"fal\.ai error \(HTTP 500\)"):
+                await provider.generate_image("fal-ai/flux/schnell", {"prompt": "test"})
+
+
+# --- Resource Cleanup ---
+
+
+class TestResourceCleanup:
+    async def test_aclose_closes_client(self):
+        provider = FalAIProvider(api_key="test-key")
+        with patch.object(provider.client, "aclose", new_callable=AsyncMock) as mock_close:
+            await provider.aclose()
+            mock_close.assert_called_once()
diff --git a/python-backend/tests/unit/services/test_fal_ai_ssrf.py b/python-backend/tests/unit/services/test_fal_ai_ssrf.py
new file mode 100644
index 00000000..9ad9f682
--- /dev/null
+++ b/python-backend/tests/unit/services/test_fal_ai_ssrf.py
@@ -0,0 +1,117 @@
+"""SSRF validation tests for FalAIProvider."""
+
+import pytest
+import httpx
+from unittest.mock import AsyncMock, patch, MagicMock
+
+from app.llm_proxy.providers.fal_ai_provider import FalAIProvider
+
+
+class TestSSRFValidation:
+    @pytest.fixture
+    def provider(self):
+        return FalAIProvider(api_key="test-key")
+
+    def test_rejects_aws_metadata(self, provider):
+        with pytest.raises(ValueError):
+            provider._validate_urls({"image_url": "http://169.254.169.254/latest/meta-data/"})
+
+    def test_rejects_localhost(self, provider):
+        with pytest.raises(ValueError):
+            provider._validate_urls({"image_url": "http://localhost/secret"})
+
+    def test_rejects_127_0_0_1(self, provider):
+        with pytest.raises(ValueError):
+            provider._validate_urls({"image_url": "http://127.0.0.1/secret"})
+
+    def test_rejects_10_network(self, provider):
+        with pytest.raises(ValueError):
+            provider._validate_urls({"image_url": "http://10.0.0.1/internal"})
+
+    def test_rejects_192_168_network(self, provider):
+        with pytest.raises(ValueError):
+            provider._validate_urls({"image_url": "http://192.168.1.1/internal"})
+
+    def test_rejects_host_docker_internal(self, provider):
+        """fal.ai provider must reject host.docker.internal even though base SSRF allows it."""
+        with pytest.raises(ValueError, match="host.docker.internal"):
+            provider._validate_urls({"image_url": "http://host.docker.internal/uploads/img.png"})
+
+    def test_allows_public_url(self, provider):
+        # Should not raise
+        provider._validate_urls({"image_url": "https://example.com/image.png"})
+
+    def test_allows_fal_media_url(self, provider):
+        # Should not raise
+        provider._validate_urls({"image_url": "https://v3b.fal.media/files/some-file.png"})
+
+    def test_validates_all_url_fields(self, provider):
+        """All URL-like fields should be validated."""
+        for field in ("image_url", "end_image_url", "audio_url", "video_url"):
+            with pytest.raises(ValueError):
+                provider._validate_urls({field: "http://127.0.0.1/evil"})
+
+    def test_none_url_fields_skipped(self, provider):
+        # Should not raise when URL fields are None
+        provider._validate_urls({"image_url": None, "prompt": "test"})
+
+    def test_non_url_fields_ignored(self, provider):
+        # Non-URL fields should not be validated
+        provider._validate_urls({"prompt": "http://127.0.0.1/not-a-url-field", "width": 1920})
+
+
+class TestPromptSanitization:
+    @pytest.fixture
+    def provider(self):
+        return FalAIProvider(api_key="test-key")
+
+    def test_strips_script_tags(self, provider):
+        result = provider._sanitize_prompt("Hello <script>alert(1)</script> world")
+        assert "<script>" not in result
+        assert "</script>" not in result
+        assert "Hello" in result
+        assert "world" in result
+
+    def test_strips_img_tags(self, provider):
+        result = provider._sanitize_prompt('Test <img src="x" onerror="alert(1)"> end')
+        assert "<img" not in result
+        assert "Test" in result
+        assert "end" in result
+
+    def test_preserves_plain_text(self, provider):
+        result = provider._sanitize_prompt("A beautiful sunset over the ocean")
+        assert result == "A beautiful sunset over the ocean"
+
+
+class TestVideoFileSizeValidation:
+    @pytest.fixture
+    def provider(self):
+        return FalAIProvider(api_key="test-key")
+
+    def test_video_url_over_500mb_rejected(self, provider):
+        mock_response = MagicMock()
+        mock_response.headers = {"Content-Length": str(600 * 1024 * 1024)}
+        mock_response.raise_for_status = MagicMock()
+
+        mock_client = MagicMock()
+        mock_client.__enter__ = MagicMock(return_value=mock_client)
+        mock_client.__exit__ = MagicMock(return_value=False)
+        mock_client.head.return_value = mock_response
+
+        with patch("app.llm_proxy.providers.fal_ai_provider.httpx.Client", return_value=mock_client):
+            with pytest.raises(ValueError, match="500MB"):
+                provider._validate_urls({"video_url": "https://example.com/big-video.mp4"})
+
+    def test_missing_content_length_handled(self, provider):
+        mock_response = MagicMock()
+        mock_response.headers = {}
+        mock_response.raise_for_status = MagicMock()
+
+        mock_client = MagicMock()
+        mock_client.__enter__ = MagicMock(return_value=mock_client)
+        mock_client.__exit__ = MagicMock(return_value=False)
+        mock_client.head.return_value = mock_response
+
+        with patch("app.llm_proxy.providers.fal_ai_provider.httpx.Client", return_value=mock_client):
+            # Should not raise when Content-Length is missing
+            provider._validate_urls({"video_url": "https://example.com/video.mp4"})
diff --git a/python-backend/tests/unit/services/test_tool_progress.py b/python-backend/tests/unit/services/test_tool_progress.py
new file mode 100644
index 00000000..fd8ccfeb
--- /dev/null
+++ b/python-backend/tests/unit/services/test_tool_progress.py
@@ -0,0 +1,153 @@
+"""Tests for emit_progress support in tool bridge run functions."""
+
+import pytest
+from unittest.mock import AsyncMock, MagicMock, patch
+
+from app.services.agency_tools import (
+    ToolConfig,
+    _make_run_func,
+    create_tool_bridge,
+)
+
+
+class FakeEmitter:
+    """Fake AgencyEventEmitter that records emitted events."""
+
+    def __init__(self):
+        self.events: list[tuple[str, dict]] = []
+        self.run_id = "run-123"
+
+    async def emit(self, event_type: str, data: dict) -> None:
+        self.events.append((event_type, data))
+
+
+@pytest.mark.unit
+class TestToolProgressEmit:
+    """Tests for emit_progress in _make_run_func."""
+
+    def test_emit_progress_publishes_tool_progress_event(self):
+        """emit_progress publishes tool_progress SSE event via emitter."""
+        emitter = FakeEmitter()
+        config = ToolConfig(
+            tool_id="builtin-web-search",
+            tool_type="builtin",
+            risk_level="low",
+            requires_approval=False,
+            endpoint_url="http://127.0.0.1:3000/api/internal/tools/web-search",
+        )
+        run_func = _make_run_func(config, {"builtin-web-search"}, emitter=emitter, run_id="run-123")
+
+        # The run_func should expose emit_progress
+        assert hasattr(run_func, "emit_progress"), "run_func should have emit_progress attached"
+
+        # Call emit_progress
+        import asyncio
+        asyncio.run(run_func.emit_progress("Searching...", percent=25))
+
+        assert len(emitter.events) == 1
+        event_type, data = emitter.events[0]
+        assert event_type == "tool_progress"
+        assert data["toolCallId"] == "builtin-web-search"
+        assert data["message"] == "Searching..."
+        assert data["percent"] == 25
+
+    def test_emit_progress_without_percent_omits_percent_field(self):
+        """emit_progress with no percent omits percent field."""
+        emitter = FakeEmitter()
+        config = ToolConfig(
+            tool_id="builtin-rag-knowledge",
+            tool_type="builtin",
+            risk_level="low",
+            requires_approval=False,
+            endpoint_url="http://127.0.0.1:3000/api/internal/tools/rag-knowledge",
+        )
+        run_func = _make_run_func(config, {"builtin-rag-knowledge"}, emitter=emitter, run_id="run-123")
+
+        import asyncio
+        asyncio.run(run_func.emit_progress("Working..."))
+
+        assert len(emitter.events) == 1
+        event_type, data = emitter.events[0]
+        assert event_type == "tool_progress"
+        assert data["message"] == "Working..."
+        assert "percent" not in data
+
+    def test_emit_progress_noop_when_emitter_is_none(self):
+        """emit_progress is no-op when emitter is None."""
+        config = ToolConfig(
+            tool_id="builtin-web-search",
+            tool_type="builtin",
+            risk_level="low",
+            requires_approval=False,
+            endpoint_url="http://127.0.0.1:3000/api/internal/tools/web-search",
+        )
+        run_func = _make_run_func(config, {"builtin-web-search"}, emitter=None, run_id=None)
+
+        # Should not raise
+        import asyncio
+        asyncio.run(run_func.emit_progress("test"))
+        # No assertion needed — just verifying no exception
+
+    def test_builtin_web_search_emits_progress_during_execution(self):
+        """builtin-web-search emits progress during execution."""
+        emitter = FakeEmitter()
+        config = ToolConfig(
+            tool_id="builtin-web-search",
+            tool_type="builtin",
+            risk_level="low",
+            requires_approval=False,
+            endpoint_url="http://127.0.0.1:3000/api/internal/tools/web-search",
+        )
+        run_func = _make_run_func(config, {"builtin-web-search"}, emitter=emitter, run_id="run-123")
+
+        # Mock HTTP call
+        mock_response = MagicMock()
+        mock_response.status_code = 200
+        mock_response.text = '{"results": [{"title": "Test"}]}'
+
+        with patch("app.services.agency_tools.httpx.Client") as mock_client_cls:
+            mock_client = MagicMock()
+            mock_client.__enter__ = MagicMock(return_value=mock_client)
+            mock_client.__exit__ = MagicMock(return_value=False)
+            mock_client.post.return_value = mock_response
+            mock_client_cls.return_value = mock_client
+
+            tool_instance = MagicMock()
+            tool_instance.query = "test query"
+            result = run_func(tool_instance)
+
+        # Check at least one progress event was emitted with "Searching"
+        progress_events = [(t, d) for t, d in emitter.events if t == "tool_progress"]
+        assert len(progress_events) >= 1
+        assert any("Searching" in d["message"] for _, d in progress_events)
+
+    def test_builtin_rag_knowledge_emits_progress_during_execution(self):
+        """builtin-rag-knowledge emits progress during execution."""
+        emitter = FakeEmitter()
+        config = ToolConfig(
+            tool_id="builtin-rag-knowledge",
+            tool_type="builtin",
+            risk_level="low",
+            requires_approval=False,
+            endpoint_url="http://127.0.0.1:3000/api/internal/tools/rag-knowledge",
+        )
+        run_func = _make_run_func(config, {"builtin-rag-knowledge"}, emitter=emitter, run_id="run-123")
+
+        mock_response = MagicMock()
+        mock_response.status_code = 200
+        mock_response.text = '{"documents": []}'
+
+        with patch("app.services.agency_tools.httpx.Client") as mock_client_cls:
+            mock_client = MagicMock()
+            mock_client.__enter__ = MagicMock(return_value=mock_client)
+            mock_client.__exit__ = MagicMock(return_value=False)
+            mock_client.post.return_value = mock_response
+            mock_client_cls.return_value = mock_client
+
+            tool_instance = MagicMock()
+            tool_instance.query = "test query"
+            result = run_func(tool_instance)
+
+        progress_events = [(t, d) for t, d in emitter.events if t == "tool_progress"]
+        assert len(progress_events) >= 1
+        assert any("Querying" in d["message"] for _, d in progress_events)
