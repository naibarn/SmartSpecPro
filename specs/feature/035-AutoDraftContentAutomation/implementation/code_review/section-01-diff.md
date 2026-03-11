diff --git a/apps/web/server/_core/index.ts b/apps/web/server/_core/index.ts
index d8906de8..1e4ef08f 100644
--- a/apps/web/server/_core/index.ts
+++ b/apps/web/server/_core/index.ts
@@ -18,6 +18,7 @@ import { registerLLMRoutes } from "./llmRoutes";
 import { registerMCPRoutes } from "./mcpRoutes";
 import { registerMediaJobRoutes } from "../routers/mediaJobs";
 import { registerAgencyStreamRoutes } from "./agencyStreamProxy";
+import { registerContentAutomationRoutes } from "../routers/contentAutomationRoutes";
 
 import { createWebhookRouter } from "../routes/webhooks";
 import { createWebhookTriggerRouter } from "../routes/webhookTrigger";
@@ -401,6 +402,7 @@ registerLLMRoutes(app);
 registerMCPRoutes(app);
 registerMediaJobRoutes(app);
 registerAgencyStreamRoutes(app);
+registerContentAutomationRoutes(app);
 
 // Proxy remote images through same-origin endpoint so browser canvas operations
 // (split/crop preview) work even when source host doesn't expose CORS headers.
diff --git a/apps/web/server/middleware/contentAutomationGate.test.ts b/apps/web/server/middleware/contentAutomationGate.test.ts
new file mode 100644
index 00000000..394d6b62
--- /dev/null
+++ b/apps/web/server/middleware/contentAutomationGate.test.ts
@@ -0,0 +1,72 @@
+import { describe, it, expect, vi, beforeEach } from "vitest";
+import type { Request, Response, NextFunction } from "express";
+import { contentAutomationGate } from "./contentAutomationGate";
+
+vi.mock("../services/featureFlags", () => ({
+  getFeatureFlag: vi.fn(),
+}));
+
+import { getFeatureFlag } from "../services/featureFlags";
+
+const mockGetFeatureFlag = vi.mocked(getFeatureFlag);
+
+function makeReqRes() {
+  const req = {} as Request;
+  const res = {
+    status: vi.fn().mockReturnThis(),
+    json: vi.fn().mockReturnThis(),
+  } as unknown as Response;
+  const next = vi.fn() as NextFunction;
+  return { req, res, next };
+}
+
+describe("contentAutomationGate middleware", () => {
+  beforeEach(() => {
+    vi.clearAllMocks();
+  });
+
+  it("returns 503 when ENABLE_CONTENT_AUTOMATION is unset (getFeatureFlag returns false)", async () => {
+    mockGetFeatureFlag.mockResolvedValue(false);
+    const { req, res, next } = makeReqRes();
+
+    await contentAutomationGate(req, res, next);
+
+    expect(res.status).toHaveBeenCalledWith(503);
+    expect(res.json).toHaveBeenCalledWith({
+      error: "Content automation is not enabled",
+    });
+    expect(next).not.toHaveBeenCalled();
+  });
+
+  it("returns 503 when ENABLE_CONTENT_AUTOMATION is 'false'", async () => {
+    mockGetFeatureFlag.mockResolvedValue(false);
+    const { req, res, next } = makeReqRes();
+
+    await contentAutomationGate(req, res, next);
+
+    expect(res.status).toHaveBeenCalledWith(503);
+    expect(res.json).toHaveBeenCalledWith({
+      error: "Content automation is not enabled",
+    });
+    expect(next).not.toHaveBeenCalled();
+  });
+
+  it("calls next() when ENABLE_CONTENT_AUTOMATION is 'true'", async () => {
+    mockGetFeatureFlag.mockResolvedValue(true);
+    const { req, res, next } = makeReqRes();
+
+    await contentAutomationGate(req, res, next);
+
+    expect(next).toHaveBeenCalled();
+    expect(res.status).not.toHaveBeenCalled();
+  });
+
+  it("checks the ENABLE_CONTENT_AUTOMATION flag name", async () => {
+    mockGetFeatureFlag.mockResolvedValue(true);
+    const { req, res, next } = makeReqRes();
+
+    await contentAutomationGate(req, res, next);
+
+    expect(mockGetFeatureFlag).toHaveBeenCalledWith("ENABLE_CONTENT_AUTOMATION");
+  });
+});
diff --git a/apps/web/server/middleware/contentAutomationGate.ts b/apps/web/server/middleware/contentAutomationGate.ts
new file mode 100644
index 00000000..3c8c283c
--- /dev/null
+++ b/apps/web/server/middleware/contentAutomationGate.ts
@@ -0,0 +1,15 @@
+import type { Request, Response, NextFunction } from "express";
+import { getFeatureFlag } from "../services/featureFlags";
+
+export async function contentAutomationGate(
+  req: Request,
+  res: Response,
+  next: NextFunction,
+): Promise<void> {
+  const enabled = await getFeatureFlag("ENABLE_CONTENT_AUTOMATION");
+  if (!enabled) {
+    res.status(503).json({ error: "Content automation is not enabled" });
+    return;
+  }
+  next();
+}
diff --git a/apps/web/server/routers/contentAutomationRoutes.ts b/apps/web/server/routers/contentAutomationRoutes.ts
new file mode 100644
index 00000000..4fbaabb8
--- /dev/null
+++ b/apps/web/server/routers/contentAutomationRoutes.ts
@@ -0,0 +1,12 @@
+import type { Express } from "express";
+import { contentAutomationGate } from "../middleware/contentAutomationGate";
+
+/**
+ * Register content automation internal tool routes.
+ *
+ * Applies the feature-flag gate middleware to all /api/internal/tools/* paths.
+ * Actual tool handlers are registered by their dedicated router files (sections 02-05, 08).
+ */
+export function registerContentAutomationRoutes(app: Express): void {
+  app.use("/api/internal/tools", contentAutomationGate);
+}
diff --git a/apps/web/server/routers/infrastructure.ts b/apps/web/server/routers/infrastructure.ts
index ab82e56f..4ca420d1 100644
--- a/apps/web/server/routers/infrastructure.ts
+++ b/apps/web/server/routers/infrastructure.ts
@@ -7,7 +7,7 @@
  */
 
 import { z } from "zod";
-import { router, adminProcedure, rateLimitedAdminProcedure } from "../_core/trpc";
+import { router, adminProcedure, rateLimitedAdminProcedure, protectedProcedure } from "../_core/trpc";
 import { getDb } from "../db";
 import { systemSettings } from "../../drizzle/schema";
 import { eq, and } from "drizzle-orm";
@@ -775,6 +775,15 @@ export const infrastructureRouter = router({
       return { success: true as const, results };
     }),
 
+  // ----------------------------------------------------------
+  // Content Automation Feature Flag
+  // ----------------------------------------------------------
+
+  getContentAutomationEnabled: protectedProcedure.query(async () => {
+    const enabled = await getFeatureFlag("ENABLE_CONTENT_AUTOMATION");
+    return { contentAutomation: enabled };
+  }),
+
   // ----------------------------------------------------------
   // Deploy Mode Management
   // ----------------------------------------------------------
diff --git a/apps/web/server/services/contentAutomationRateLimit.test.ts b/apps/web/server/services/contentAutomationRateLimit.test.ts
new file mode 100644
index 00000000..d9a77085
--- /dev/null
+++ b/apps/web/server/services/contentAutomationRateLimit.test.ts
@@ -0,0 +1,190 @@
+import { describe, it, expect, vi, beforeEach } from "vitest";
+
+vi.mock("./redis", () => ({
+  getRedisClient: vi.fn(),
+}));
+
+import { getRedisClient } from "./redis";
+import {
+  checkHourlyRate,
+  acquireConcurrentSlot,
+  releaseConcurrentSlot,
+  checkDailyBatchLimit,
+} from "./contentAutomationRateLimit";
+
+const mockGetRedisClient = vi.mocked(getRedisClient);
+
+function makeMockRedis(overrides: Record<string, unknown> = {}) {
+  return {
+    incr: vi.fn(),
+    expire: vi.fn(),
+    expireat: vi.fn(),
+    get: vi.fn(),
+    set: vi.fn(),
+    setnx: vi.fn(),
+    decr: vi.fn(),
+    del: vi.fn(),
+    ...overrides,
+  };
+}
+
+describe("contentAutomationRateLimit", () => {
+  beforeEach(() => {
+    vi.clearAllMocks();
+  });
+
+  describe("checkHourlyRate", () => {
+    it("allows first request within interactive limit", async () => {
+      const redis = makeMockRedis({
+        incr: vi.fn().mockResolvedValue(1),
+        expire: vi.fn().mockResolvedValue(1),
+      });
+      mockGetRedisClient.mockReturnValue(redis as any);
+
+      const result = await checkHourlyRate(1, "interactive");
+
+      expect(result.allowed).toBe(true);
+      expect(result.remaining).toBe(9);
+    });
+
+    it("blocks request exceeding 10/hour for interactive", async () => {
+      const redis = makeMockRedis({
+        incr: vi.fn().mockResolvedValue(11),
+        expire: vi.fn().mockResolvedValue(1),
+      });
+      mockGetRedisClient.mockReturnValue(redis as any);
+
+      const result = await checkHourlyRate(1, "interactive");
+
+      expect(result.allowed).toBe(false);
+      expect(result.remaining).toBe(0);
+    });
+
+    it("blocks request exceeding 50/hour for batch", async () => {
+      const redis = makeMockRedis({
+        incr: vi.fn().mockResolvedValue(51),
+        expire: vi.fn().mockResolvedValue(1),
+      });
+      mockGetRedisClient.mockReturnValue(redis as any);
+
+      const result = await checkHourlyRate(1, "batch");
+
+      expect(result.allowed).toBe(false);
+      expect(result.remaining).toBe(0);
+    });
+
+    it("allows requests within batch limit (50/hour)", async () => {
+      const redis = makeMockRedis({
+        incr: vi.fn().mockResolvedValue(25),
+        expire: vi.fn().mockResolvedValue(1),
+      });
+      mockGetRedisClient.mockReturnValue(redis as any);
+
+      const result = await checkHourlyRate(1, "batch");
+
+      expect(result.allowed).toBe(true);
+      expect(result.remaining).toBe(25);
+    });
+  });
+
+  describe("acquireConcurrentSlot", () => {
+    it("allows up to 3 simultaneous drafts", async () => {
+      const redis = makeMockRedis({
+        incr: vi.fn().mockResolvedValue(3),
+        expire: vi.fn().mockResolvedValue(1),
+        decr: vi.fn().mockResolvedValue(2),
+      });
+      mockGetRedisClient.mockReturnValue(redis as any);
+
+      const result = await acquireConcurrentSlot(1);
+
+      expect(result.allowed).toBe(true);
+    });
+
+    it("blocks 4th concurrent draft", async () => {
+      const redis = makeMockRedis({
+        incr: vi.fn().mockResolvedValue(4),
+        expire: vi.fn().mockResolvedValue(1),
+        decr: vi.fn().mockResolvedValue(3),
+      });
+      mockGetRedisClient.mockReturnValue(redis as any);
+
+      const result = await acquireConcurrentSlot(1);
+
+      expect(result.allowed).toBe(false);
+      // Should decrement back when blocked
+      expect(redis.decr).toHaveBeenCalled();
+    });
+  });
+
+  describe("releaseConcurrentSlot", () => {
+    it("decrements the semaphore correctly", async () => {
+      const redis = makeMockRedis({
+        get: vi.fn().mockResolvedValue("2"),
+        decr: vi.fn().mockResolvedValue(1),
+      });
+      mockGetRedisClient.mockReturnValue(redis as any);
+
+      await releaseConcurrentSlot(1);
+
+      expect(redis.decr).toHaveBeenCalledWith("rate:concurrent_draft:1");
+    });
+
+    it("does not go below zero", async () => {
+      const redis = makeMockRedis({
+        get: vi.fn().mockResolvedValue("0"),
+        decr: vi.fn().mockResolvedValue(-1),
+      });
+      mockGetRedisClient.mockReturnValue(redis as any);
+
+      // Should not throw
+      await releaseConcurrentSlot(1);
+    });
+  });
+
+  describe("checkDailyBatchLimit", () => {
+    it("allows requests within daily limit", async () => {
+      const redis = makeMockRedis({
+        incr: vi.fn().mockResolvedValue(50),
+        expireat: vi.fn().mockResolvedValue(1),
+      });
+      mockGetRedisClient.mockReturnValue(redis as any);
+
+      const result = await checkDailyBatchLimit(1);
+
+      expect(result.allowed).toBe(true);
+      expect(result.used).toBe(50);
+      expect(result.limit).toBe(100);
+    });
+
+    it("blocks after 100 items per day", async () => {
+      const redis = makeMockRedis({
+        incr: vi.fn().mockResolvedValue(101),
+        expireat: vi.fn().mockResolvedValue(1),
+      });
+      mockGetRedisClient.mockReturnValue(redis as any);
+
+      const result = await checkDailyBatchLimit(1);
+
+      expect(result.allowed).toBe(false);
+      expect(result.used).toBe(101);
+    });
+
+    it("sets EXPIREAT to next midnight UTC", async () => {
+      const redis = makeMockRedis({
+        incr: vi.fn().mockResolvedValue(1),
+        expireat: vi.fn().mockResolvedValue(1),
+      });
+      mockGetRedisClient.mockReturnValue(redis as any);
+
+      await checkDailyBatchLimit(1);
+
+      expect(redis.expireat).toHaveBeenCalled();
+      // Verify the expireat timestamp is in the future (next midnight UTC)
+      const call = redis.expireat.mock.calls[0];
+      const expireTs = call[1] as number;
+      const now = Math.floor(Date.now() / 1000);
+      expect(expireTs).toBeGreaterThan(now);
+    });
+  });
+});
diff --git a/apps/web/server/services/contentAutomationRateLimit.ts b/apps/web/server/services/contentAutomationRateLimit.ts
new file mode 100644
index 00000000..e3dee1b6
--- /dev/null
+++ b/apps/web/server/services/contentAutomationRateLimit.ts
@@ -0,0 +1,83 @@
+import { getRedisClient } from "./redis";
+
+const HOURLY_INTERACTIVE_LIMIT = 10;
+const HOURLY_BATCH_LIMIT = 50;
+const CONCURRENT_LIMIT = 3;
+const CONCURRENT_TTL = 600; // 10 min safety net
+const DAILY_BATCH_LIMIT = 100;
+
+function nextMidnightUtcTimestamp(): number {
+  const now = new Date();
+  const midnight = new Date(
+    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1, 0, 0, 0),
+  );
+  return Math.floor(midnight.getTime() / 1000);
+}
+
+export async function checkHourlyRate(
+  userId: number,
+  mode: "interactive" | "batch",
+): Promise<{ allowed: boolean; remaining: number; resetIn: number }> {
+  const redis = getRedisClient();
+  const key = `rate:auto_draft:${userId}`;
+  const limit = mode === "interactive" ? HOURLY_INTERACTIVE_LIMIT : HOURLY_BATCH_LIMIT;
+
+  const count = await redis.incr(key);
+  // Set TTL only on first increment
+  if (count === 1) {
+    await redis.expire(key, 3600);
+  }
+
+  if (count > limit) {
+    return { allowed: false, remaining: 0, resetIn: 3600 };
+  }
+
+  return { allowed: true, remaining: limit - count, resetIn: 3600 };
+}
+
+export async function acquireConcurrentSlot(
+  userId: number,
+): Promise<{ allowed: boolean }> {
+  const redis = getRedisClient();
+  const key = `rate:concurrent_draft:${userId}`;
+
+  const count = await redis.incr(key);
+  // Set safety TTL on first acquire
+  if (count === 1) {
+    await redis.expire(key, CONCURRENT_TTL);
+  }
+
+  if (count > CONCURRENT_LIMIT) {
+    await redis.decr(key);
+    return { allowed: false };
+  }
+
+  return { allowed: true };
+}
+
+export async function releaseConcurrentSlot(userId: number): Promise<void> {
+  const redis = getRedisClient();
+  const key = `rate:concurrent_draft:${userId}`;
+
+  const current = await redis.get(key);
+  if (current !== null && parseInt(current, 10) > 0) {
+    await redis.decr(key);
+  }
+}
+
+export async function checkDailyBatchLimit(
+  userId: number,
+): Promise<{ allowed: boolean; used: number; limit: number }> {
+  const redis = getRedisClient();
+  const key = `daily:batch:${userId}`;
+
+  const count = await redis.incr(key);
+  // Set expiry to next midnight UTC
+  await redis.expireat(key, nextMidnightUtcTimestamp());
+
+  if (count > DAILY_BATCH_LIMIT) {
+    return { allowed: false, used: count, limit: DAILY_BATCH_LIMIT };
+  }
+
+  return { allowed: true, used: count, limit: DAILY_BATCH_LIMIT };
+}
diff --git a/apps/web/shared/contentAutomation/types.test.ts b/apps/web/shared/contentAutomation/types.test.ts
new file mode 100644
index 00000000..146bcabe
--- /dev/null
+++ b/apps/web/shared/contentAutomation/types.test.ts
@@ -0,0 +1,168 @@
+import { describe, it, expect } from "vitest";
+import {
+  AutoDraftRequestSchema,
+  ModelSuggestRequestSchema,
+  FileParseRequestSchema,
+  ScheduleDraftRequestSchema,
+  InputItemSchema,
+  canvasPresetToSize,
+} from "./types";
+
+describe("AutoDraftRequestSchema", () => {
+  const validRequest = {
+    topic: "How to build a React app",
+    canvas_preset: "16:9" as const,
+  };
+
+  it("validates a valid request with all required fields", () => {
+    const result = AutoDraftRequestSchema.safeParse(validRequest);
+    expect(result.success).toBe(true);
+  });
+
+  it("rejects missing topic (required field)", () => {
+    const result = AutoDraftRequestSchema.safeParse({});
+    expect(result.success).toBe(false);
+  });
+
+  it("rejects topic shorter than 3 characters", () => {
+    const result = AutoDraftRequestSchema.safeParse({ topic: "ab" });
+    expect(result.success).toBe(false);
+  });
+
+  it("rejects topic longer than 1000 characters", () => {
+    const result = AutoDraftRequestSchema.safeParse({ topic: "a".repeat(1001) });
+    expect(result.success).toBe(false);
+  });
+
+  it("rejects invalid canvas_preset values", () => {
+    const result = AutoDraftRequestSchema.safeParse({ topic: "valid topic", canvas_preset: "2:1" });
+    expect(result.success).toBe(false);
+  });
+
+  it("accepts all valid canvas_preset values", () => {
+    const validPresets = ["16:9", "4:3", "1:1", "9:16", "3:4", "4:5", "5:4"] as const;
+    for (const preset of validPresets) {
+      const result = AutoDraftRequestSchema.safeParse({ topic: "valid topic", canvas_preset: preset });
+      expect(result.success).toBe(true);
+    }
+  });
+
+  it("rejects num_slides < 1", () => {
+    const result = AutoDraftRequestSchema.safeParse({ topic: "valid topic", num_slides: 0 });
+    expect(result.success).toBe(false);
+  });
+
+  it("rejects num_slides > 30", () => {
+    const result = AutoDraftRequestSchema.safeParse({ topic: "valid topic", num_slides: 31 });
+    expect(result.success).toBe(false);
+  });
+});
+
+describe("ModelSuggestRequestSchema", () => {
+  it("validates purpose enum accepts 'image', 'video', 'audio', 'text'", () => {
+    for (const purpose of ["image", "video", "audio", "text"] as const) {
+      const result = ModelSuggestRequestSchema.safeParse({ purpose });
+      expect(result.success).toBe(true);
+    }
+  });
+
+  it("rejects unknown purpose value", () => {
+    const result = ModelSuggestRequestSchema.safeParse({ purpose: "unknown" });
+    expect(result.success).toBe(false);
+  });
+});
+
+describe("FileParseRequestSchema", () => {
+  it("validates file_type enum accepts 'csv', 'xlsx', 'txt'", () => {
+    for (const file_type of ["csv", "xlsx", "txt"] as const) {
+      const result = FileParseRequestSchema.safeParse({
+        file_url: "https://example.com/file",
+        file_type,
+      });
+      expect(result.success).toBe(true);
+    }
+  });
+
+  it("rejects unknown file_type", () => {
+    const result = FileParseRequestSchema.safeParse({
+      file_url: "https://example.com/file",
+      file_type: "pdf",
+    });
+    expect(result.success).toBe(false);
+  });
+});
+
+describe("ScheduleDraftRequestSchema", () => {
+  it("validates cron_expression is a string", () => {
+    const result = ScheduleDraftRequestSchema.safeParse({
+      topic_template: "Weekly report on {{topic}}",
+      schedule_type: "recurring",
+      cron_expression: "0 9 * * 1",
+    });
+    expect(result.success).toBe(true);
+  });
+
+  it("validates schedule_type is 'one_time' or 'recurring'", () => {
+    const recurring = ScheduleDraftRequestSchema.safeParse({
+      topic_template: "Test topic template",
+      schedule_type: "recurring",
+    });
+    expect(recurring.success).toBe(true);
+
+    const oneTime = ScheduleDraftRequestSchema.safeParse({
+      topic_template: "Test topic template",
+      schedule_type: "one_time",
+    });
+    expect(oneTime.success).toBe(true);
+
+    const invalid = ScheduleDraftRequestSchema.safeParse({
+      topic_template: "Test topic template",
+      schedule_type: "daily",
+    });
+    expect(invalid.success).toBe(false);
+  });
+});
+
+describe("InputItemSchema", () => {
+  it("validates topic is a non-empty string", () => {
+    const result = InputItemSchema.safeParse({ topic: "My topic" });
+    expect(result.success).toBe(true);
+  });
+
+  it("rejects empty topic", () => {
+    const result = InputItemSchema.safeParse({ topic: "" });
+    expect(result.success).toBe(false);
+  });
+
+  it("accepts optional custom_article_text, params, attachments", () => {
+    const result = InputItemSchema.safeParse({
+      topic: "My topic",
+      custom_article_text: "Some article text",
+      params: { key: "value" },
+      attachments: ["https://example.com/file.pdf"],
+    });
+    expect(result.success).toBe(true);
+  });
+});
+
+describe("canvasPresetToSize", () => {
+  it("maps '16:9' to { width: 1280, height: 720 }", () => {
+    expect(canvasPresetToSize("16:9")).toEqual({ width: 1280, height: 720 });
+  });
+
+  it("maps '9:16' to { width: 720, height: 1280 }", () => {
+    expect(canvasPresetToSize("9:16")).toEqual({ width: 720, height: 1280 });
+  });
+
+  it("maps '4:3' to { width: 1024, height: 768 }", () => {
+    expect(canvasPresetToSize("4:3")).toEqual({ width: 1024, height: 768 });
+  });
+
+  it("maps '1:1' to { width: 1080, height: 1080 }", () => {
+    expect(canvasPresetToSize("1:1")).toEqual({ width: 1080, height: 1080 });
+  });
+
+  it("returns null for unknown preset string", () => {
+    expect(canvasPresetToSize("2:1")).toBeNull();
+  });
+});
diff --git a/apps/web/shared/contentAutomation/types.ts b/apps/web/shared/contentAutomation/types.ts
new file mode 100644
index 00000000..e60db6d5
--- /dev/null
+++ b/apps/web/shared/contentAutomation/types.ts
@@ -0,0 +1,120 @@
+import { z } from "zod";
+
+// Canvas preset dimensions — must match PRESENTATION_CANVAS_PRESETS in client/src/presentation-canvas/constants.ts
+export const CANVAS_PRESET_MAP: Record<string, { width: number; height: number }> = {
+  "16:9": { width: 1280, height: 720 },
+  "9:16": { width: 720, height: 1280 },
+  "4:3": { width: 1024, height: 768 },
+  "3:4": { width: 768, height: 1024 },
+  "4:5": { width: 960, height: 1200 },
+  "5:4": { width: 1250, height: 1000 },
+  "1:1": { width: 1080, height: 1080 },
+};
+
+export function canvasPresetToSize(preset: string): { width: number; height: number } | null {
+  return CANVAS_PRESET_MAP[preset] ?? null;
+}
+
+const canvasPresetSchema = z.enum(["16:9", "9:16", "4:3", "3:4", "4:5", "5:4", "1:1"]);
+
+export const InputItemSchema = z.object({
+  topic: z.string().min(1).max(5000),
+  custom_article_text: z.string().max(50000).optional(),
+  params: z.record(z.unknown()).optional(),
+  attachments: z.array(z.string().url()).max(10).optional(),
+});
+
+export type InputItem = z.infer<typeof InputItemSchema>;
+
+export const AutoDraftRequestSchema = z.object({
+  topic: z.string().min(3).max(1000),
+  article_skill_slug: z.string().min(1).max(100).optional(),
+  media_skill_slug: z.string().min(1).max(100).optional(),
+  image_model_id: z.string().max(100).optional(),
+  canvas_preset: canvasPresetSchema.optional().default("16:9"),
+  num_slides: z.number().int().min(1).max(30).optional(),
+  language: z.string().min(2).max(10).optional(),
+  style_preset: z.string().max(100).optional(),
+  reference_image_urls: z.array(z.string()).max(5).optional(),
+  source: z.string().max(200).optional(),
+  trace_id: z.string().max(100).optional(),
+});
+
+export type AutoDraftRequest = z.infer<typeof AutoDraftRequestSchema>;
+
+export const AutoDraftResponseSchema = z.object({
+  success: z.boolean(),
+  deck_id: z.number().int().positive().optional(),
+  slide_count: z.number().int().min(0).optional(),
+  credits_used: z.number().min(0).optional(),
+  warnings: z.array(z.string()).optional(),
+  error: z.string().optional(),
+});
+
+export type AutoDraftResponse = z.infer<typeof AutoDraftResponseSchema>;
+
+export const ModelSuggestRequestSchema = z.object({
+  purpose: z.enum(["image", "video", "audio", "text"]),
+  quality_preference: z.enum(["speed", "balanced", "quality"]).optional().default("balanced"),
+  tenant_id: z.string().optional(),
+});
+
+export type ModelSuggestRequest = z.infer<typeof ModelSuggestRequestSchema>;
+
+const modelEntrySchema = z.object({
+  id: z.string(),
+  name: z.string(),
+  provider: z.string(),
+  cost_tier: z.enum(["low", "medium", "high"]),
+});
+
+export const ModelSuggestResponseSchema = z.object({
+  recommended: modelEntrySchema,
+  alternatives: z.array(modelEntrySchema).max(3),
+});
+
+export type ModelSuggestResponse = z.infer<typeof ModelSuggestResponseSchema>;
+
+export const FileParseRequestSchema = z.object({
+  file_url: z.string().url(),
+  file_type: z.enum(["csv", "xlsx", "txt"]).optional(),
+  topic_column: z.string().min(1).max(100).optional().default("topic"),
+  params_columns: z.record(z.string()).optional(),
+  parse_mode: z.enum(["per_line", "single"]).optional().default("per_line"),
+  max_rows: z.number().int().min(1).max(100).optional().default(100),
+});
+
+export type FileParseRequest = z.infer<typeof FileParseRequestSchema>;
+
+export const FileParseResponseSchema = z.object({
+  items: z.array(InputItemSchema),
+  total_rows: z.number().int(),
+  parsed_rows: z.number().int(),
+  warnings: z.array(z.string()).optional(),
+});
+
+export type FileParseResponse = z.infer<typeof FileParseResponseSchema>;
+
+// Draft params without topic (topic comes from template in schedule context)
+const DraftParamsSchema = AutoDraftRequestSchema.omit({ topic: true });
+
+export const ScheduleDraftRequestSchema = z.object({
+  topic_template: z.string().min(3).max(1000),
+  schedule_type: z.enum(["one_time", "recurring"]),
+  cron_expression: z.string().max(100).optional(),
+  run_at: z.string().datetime().optional(),
+  timezone: z.string().max(50).optional().default("UTC"),
+  draft_params: DraftParamsSchema.optional(),
+  notify_email: z.string().email().optional(),
+  notify_webhook_url: z.string().url().optional(),
+});
+
+export type ScheduleDraftRequest = z.infer<typeof ScheduleDraftRequestSchema>;
+
+export const ScheduleDraftResponseSchema = z.object({
+  schedule_id: z.number().int().positive(),
+  next_run: z.string().datetime(),
+  status: z.enum(["active", "paused", "completed"]),
+});
+
+export type ScheduleDraftResponse = z.infer<typeof ScheduleDraftResponseSchema>;
