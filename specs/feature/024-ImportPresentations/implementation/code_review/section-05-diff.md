diff --git a/apps/web/server/routers.ts b/apps/web/server/routers.ts
index ae0d4ff..18a2df6 100644
--- a/apps/web/server/routers.ts
+++ b/apps/web/server/routers.ts
@@ -64,6 +64,7 @@ import { adminOpsRouter } from "./routers/adminOps";
 import { funnelAnalyticsRouter } from "./routers/funnelAnalytics";
 import { infrastructureRouter } from "./routers/infrastructure";
 import { presentationRouter } from "./routers/presentation";
+import { presentationImportRouter } from "./routers/presentationImport";
 
 // Zod schemas for validation
 const strongPasswordSchema = z.string().min(8).refine(
@@ -840,7 +841,7 @@ export const appRouter = router({
       const cfg: Record<string, string> = {};
       for (const s of twoFaSettings) { if (s.value) cfg[s.key] = s.value; }
       if (cfg.enabled === "false") throw new Error("2FA is disabled by administrator");
-      const issuer = cfg.issuer || "SmartSpec Pro";
+      const issuer = cfg.issuer || "SmartAIHub";
       const codesCount = parseInt(cfg.backup_codes_count || "10", 10);
 
       const [user] = await db.select({ id: users.id, email: users.email, twoFactorEnabled: users.twoFactorEnabled }).from(users).where(eq(users.id, ctx.user.id));
@@ -1354,6 +1355,9 @@ export const appRouter = router({
   // Presentation domain APIs
   presentation: presentationRouter,
 
+  // Presentation import (PPTX + Google Slides)
+  presentationImport: presentationImportRouter,
+
   // Library operations (admin)
   libraryOps: libraryOpsRouter,
 
diff --git a/apps/web/server/routers/presentationImport.test.ts b/apps/web/server/routers/presentationImport.test.ts
new file mode 100644
index 0000000..bf29d16
--- /dev/null
+++ b/apps/web/server/routers/presentationImport.test.ts
@@ -0,0 +1,320 @@
+import { describe, it, expect, vi, beforeEach } from "vitest";
+import { TRPCError } from "@trpc/server";
+
+// Mock the tRPC core (same pattern as presentation.test.ts)
+vi.mock("../_core/trpc", () => {
+  const createProcedure = () => {
+    const proc: any = {
+      query: (fn: Function) => fn,
+      mutation: (fn: Function) => fn,
+      input: () => proc,
+    };
+    return proc;
+  };
+  return {
+    router: (routes: any) => routes,
+    protectedProcedure: createProcedure(),
+  };
+});
+
+// Hoisted mocks for DB
+const dbMocks = vi.hoisted(() => {
+  const insertResult = { returning: vi.fn() };
+  const updateResult = { set: vi.fn() };
+  const selectResult = { from: vi.fn() };
+
+  return { insertResult, updateResult, selectResult };
+});
+
+vi.mock("../db", () => ({
+  getDb: vi.fn(),
+}));
+
+vi.mock("@shared/presentation/constants", () => ({
+  isPresentationFeatureEnabled: vi.fn().mockReturnValue(true),
+}));
+
+vi.mock("../services/tenantContext", () => ({
+  resolveTenantIdVarchar: vi.fn().mockReturnValue("1"),
+}));
+
+vi.mock("../_core/tokens", () => ({
+  signBearerToken: vi.fn().mockReturnValue("mock-jwt-token"),
+}));
+
+import { presentationImportRouter } from "./presentationImport";
+import { getDb } from "../db";
+import { isPresentationFeatureEnabled } from "@shared/presentation/constants";
+import { resolveTenantIdVarchar } from "../services/tenantContext";
+
+// Helpers to call router procedures with a fake context
+function makeMockDb(overrides: Record<string, any> = {}) {
+  const whereResult = { limit: vi.fn() };
+  const fromResult = { where: vi.fn().mockReturnValue(whereResult) };
+  const selectResult = { from: vi.fn().mockReturnValue(fromResult) };
+
+  const setResult = { where: vi.fn() };
+  const updateResult = { set: vi.fn().mockReturnValue(setResult) };
+
+  const returningResult = { returning: vi.fn() };
+  const valuesResult = { returning: vi.fn() };
+  const insertResult = { values: vi.fn().mockReturnValue(valuesResult) };
+
+  return {
+    select: vi.fn().mockReturnValue(selectResult),
+    insert: vi.fn().mockReturnValue(insertResult),
+    update: vi.fn().mockReturnValue(updateResult),
+    _selectResult: selectResult,
+    _fromResult: fromResult,
+    _whereResult: whereResult,
+    _insertResult: insertResult,
+    _valuesResult: valuesResult,
+    _updateResult: updateResult,
+    _setResult: setResult,
+    ...overrides,
+  };
+}
+
+function makeCtx(overrides: Record<string, any> = {}) {
+  return {
+    tenantId: "1",
+    user: {
+      id: 42,
+      role: "user",
+      currentTenantId: 1,
+    },
+    ...overrides,
+  };
+}
+
+describe("presentationImport router", () => {
+  beforeEach(() => {
+    vi.clearAllMocks();
+    vi.mocked(isPresentationFeatureEnabled).mockReturnValue(true);
+    vi.mocked(resolveTenantIdVarchar).mockReturnValue("1");
+    // Reset global fetch mock
+    global.fetch = vi.fn();
+  });
+
+  describe("startImport", () => {
+    it("throws validation error when sourceType=pptx but sourceLibraryItemId is missing", async () => {
+      const fn = presentationImportRouter.startImport as Function;
+      await expect(
+        fn({
+          input: { sourceType: "pptx" },
+          ctx: makeCtx(),
+        }),
+      ).rejects.toThrow();
+    });
+
+    it("throws validation error when sourceType=google_slides but slidesUrl is missing", async () => {
+      const fn = presentationImportRouter.startImport as Function;
+      await expect(
+        fn({
+          input: { sourceType: "google_slides" },
+          ctx: makeCtx(),
+        }),
+      ).rejects.toThrow();
+    });
+
+    it("throws PRECONDITION_FAILED when Google Slides source and OAuth not connected", async () => {
+      vi.mocked(global.fetch as any).mockResolvedValueOnce({
+        ok: true,
+        json: async () => ({ status: "not_connected", email: null }),
+      });
+
+      const fn = presentationImportRouter.startImport as Function;
+      await expect(
+        fn({
+          input: {
+            sourceType: "google_slides",
+            slidesUrl: "https://docs.google.com/presentation/d/abc123",
+          },
+          ctx: makeCtx(),
+        }),
+      ).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
+    });
+
+    it("inserts presentationConversionRecords row with correct fields for PPTX", async () => {
+      const db = makeMockDb();
+      db._valuesResult.returning.mockResolvedValue([{ id: 99 }]);
+      vi.mocked(getDb).mockResolvedValue(db as any);
+
+      vi.mocked(global.fetch as any).mockResolvedValueOnce({
+        ok: true,
+        json: async () => ({}),
+      });
+
+      const fn = presentationImportRouter.startImport as Function;
+      await fn({
+        input: { sourceType: "pptx", sourceLibraryItemId: 7 },
+        ctx: makeCtx(),
+      });
+
+      expect(db.insert).toHaveBeenCalled();
+      const insertedValues = db._insertResult.values.mock.calls[0][0];
+      expect(insertedValues).toMatchObject({
+        tenantId: "1",
+        userId: 42,
+        sourceItemId: 7,
+        sourceFormat: "pptx",
+        status: "queued",
+        progress: 0,
+      });
+    });
+
+    it("calls Python API with conversionId, userId, tenantId for PPTX", async () => {
+      const db = makeMockDb();
+      db._valuesResult.returning.mockResolvedValue([{ id: 55 }]);
+      vi.mocked(getDb).mockResolvedValue(db as any);
+
+      vi.mocked(global.fetch as any).mockResolvedValueOnce({
+        ok: true,
+        json: async () => ({}),
+      });
+
+      const fn = presentationImportRouter.startImport as Function;
+      await fn({
+        input: { sourceType: "pptx", sourceLibraryItemId: 7 },
+        ctx: makeCtx(),
+      });
+
+      expect(global.fetch).toHaveBeenCalledWith(
+        expect.stringContaining("/api/v1/presentation-import/start"),
+        expect.objectContaining({
+          method: "POST",
+          body: expect.stringContaining('"conversion_id":55'),
+        }),
+      );
+    });
+
+    it("returns { conversionId } on success", async () => {
+      const db = makeMockDb();
+      db._valuesResult.returning.mockResolvedValue([{ id: 77 }]);
+      vi.mocked(getDb).mockResolvedValue(db as any);
+
+      vi.mocked(global.fetch as any).mockResolvedValueOnce({
+        ok: true,
+        json: async () => ({}),
+      });
+
+      const fn = presentationImportRouter.startImport as Function;
+      const result = await fn({
+        input: { sourceType: "pptx", sourceLibraryItemId: 7 },
+        ctx: makeCtx(),
+      });
+
+      expect(result).toEqual({ conversionId: 77 });
+    });
+  });
+
+  describe("getImportStatus", () => {
+    it("returns status + progress for own tenant's record", async () => {
+      const db = makeMockDb();
+      db._whereResult.limit.mockResolvedValue([
+        {
+          id: 10,
+          status: "processing",
+          progress: 50,
+          fidelityWarnings: [],
+          deckLibraryItemId: null,
+        },
+      ]);
+      vi.mocked(getDb).mockResolvedValue(db as any);
+
+      const fn = presentationImportRouter.getImportStatus as Function;
+      const result = await fn({
+        input: { conversionId: 10 },
+        ctx: makeCtx(),
+      });
+
+      expect(result).toMatchObject({
+        status: "processing",
+        progress: 50,
+      });
+    });
+
+    it("throws NOT_FOUND when conversionId belongs to a different tenant", async () => {
+      const db = makeMockDb();
+      db._whereResult.limit.mockResolvedValue([]);
+      vi.mocked(getDb).mockResolvedValue(db as any);
+
+      // Simulate different tenant by having no results returned (filter by tenant)
+      const fn = presentationImportRouter.getImportStatus as Function;
+      await expect(
+        fn({
+          input: { conversionId: 999 },
+          ctx: makeCtx({ tenantId: "2" }),
+        }),
+      ).rejects.toMatchObject({ code: "NOT_FOUND" });
+    });
+
+    it("throws NOT_FOUND when conversionId does not exist", async () => {
+      const db = makeMockDb();
+      db._whereResult.limit.mockResolvedValue([]);
+      vi.mocked(getDb).mockResolvedValue(db as any);
+
+      const fn = presentationImportRouter.getImportStatus as Function;
+      await expect(
+        fn({
+          input: { conversionId: 9999 },
+          ctx: makeCtx(),
+        }),
+      ).rejects.toMatchObject({ code: "NOT_FOUND" });
+    });
+  });
+
+  describe("cancelImport", () => {
+    it("returns { cancelled: true } early without DB update when record is already done", async () => {
+      const db = makeMockDb();
+      db._whereResult.limit.mockResolvedValue([{ id: 10, status: "done" }]);
+      vi.mocked(getDb).mockResolvedValue(db as any);
+
+      const fn = presentationImportRouter.cancelImport as Function;
+      const result = await fn({
+        input: { conversionId: 10 },
+        ctx: makeCtx(),
+      });
+
+      expect(result).toEqual({ cancelled: true });
+      expect(db.update).not.toHaveBeenCalled();
+    });
+
+    it("returns { cancelled: true } early without DB update when record is already failed", async () => {
+      const db = makeMockDb();
+      db._whereResult.limit.mockResolvedValue([{ id: 10, status: "failed" }]);
+      vi.mocked(getDb).mockResolvedValue(db as any);
+
+      const fn = presentationImportRouter.cancelImport as Function;
+      const result = await fn({
+        input: { conversionId: 10 },
+        ctx: makeCtx(),
+      });
+
+      expect(result).toEqual({ cancelled: true });
+      expect(db.update).not.toHaveBeenCalled();
+    });
+
+    it("updates status to cancelled and calls Python cancel endpoint for in-progress record", async () => {
+      const db = makeMockDb();
+      db._whereResult.limit.mockResolvedValue([{ id: 10, status: "processing" }]);
+      db._setResult.where.mockResolvedValue([]);
+      vi.mocked(getDb).mockResolvedValue(db as any);
+
+      vi.mocked(global.fetch as any).mockResolvedValueOnce({ ok: true });
+
+      const fn = presentationImportRouter.cancelImport as Function;
+      const result = await fn({
+        input: { conversionId: 10 },
+        ctx: makeCtx(),
+      });
+
+      expect(result).toEqual({ cancelled: true });
+      expect(db.update).toHaveBeenCalled();
+      expect(global.fetch).toHaveBeenCalledWith(
+        expect.stringContaining("/api/v1/presentation-import/10"),
+        expect.objectContaining({ method: "DELETE" }),
+      );
+    });
+  });
+});
diff --git a/apps/web/server/routers/presentationImport.ts b/apps/web/server/routers/presentationImport.ts
new file mode 100644
index 0000000..af16a86
--- /dev/null
+++ b/apps/web/server/routers/presentationImport.ts
@@ -0,0 +1,346 @@
+import crypto from "crypto";
+import { TRPCError } from "@trpc/server";
+import { z } from "zod";
+import { eq, and } from "drizzle-orm";
+
+import { protectedProcedure, router } from "../_core/trpc";
+import { isPresentationFeatureEnabled } from "@shared/presentation/constants";
+import { getDb } from "../db";
+import { presentationConversionRecords } from "../../drizzle/schema";
+import { resolveTenantIdVarchar } from "../services/tenantContext";
+import { signBearerToken } from "../_core/tokens";
+
+const PYTHON_BACKEND_URL =
+  process.env.PYTHON_BACKEND_URL ?? "http://localhost:8000";
+
+// ── Local helpers (same pattern as presentation.ts) ───────────────────────
+
+function resolvePresentationTenantId(ctx: {
+  tenantId: unknown;
+  user: { currentTenantId?: unknown };
+}): string {
+  const tenantId = resolveTenantIdVarchar(ctx.tenantId, ctx.user.currentTenantId);
+  if (!tenantId) {
+    throw new TRPCError({
+      code: "BAD_REQUEST",
+      message: "Tenant context is required for presentation operations",
+    });
+  }
+  return tenantId;
+}
+
+function toPresentationActor(ctx: {
+  tenantId: unknown;
+  user: { id: number; role?: string | null; currentTenantId?: unknown };
+}) {
+  return {
+    userId: ctx.user.id,
+    tenantId: resolvePresentationTenantId(ctx),
+    role: ctx.user.role,
+  };
+}
+
+function ensureFeatureEnabled(): void {
+  if (!isPresentationFeatureEnabled()) {
+    throw new TRPCError({
+      code: "FORBIDDEN",
+      message: "Presentation editor feature is disabled",
+    });
+  }
+}
+
+// ── Input schemas ─────────────────────────────────────────────────────────
+
+const startImportInputSchema = z
+  .object({
+    sourceType: z.enum(["pptx", "google_slides"]),
+    sourceLibraryItemId: z.number().int().positive().optional(),
+    slidesUrl: z.string().url().optional(),
+    title: z.string().max(500).optional(),
+  })
+  .refine(
+    (d) => (d.sourceType === "pptx" ? !!d.sourceLibraryItemId : !!d.slidesUrl),
+    {
+      message:
+        "sourceLibraryItemId required for pptx; slidesUrl required for google_slides",
+    },
+  );
+
+const conversionIdInputSchema = z.object({
+  conversionId: z.number().int().positive(),
+});
+
+// ── Router ────────────────────────────────────────────────────────────────
+
+export const presentationImportRouter = router({
+  /**
+   * Start a new presentation import job.
+   *
+   * For PPTX: expects sourceLibraryItemId pointing to an existing library item
+   * that holds the uploaded .pptx file.
+   * For Google Slides: expects a slidesUrl. Python retrieves the OAuth token
+   * itself via GoogleTokenService — Node never touches the access token.
+   *
+   * Creates a presentationConversionRecords row (status="queued"), then POSTs
+   * to the Python backend to enqueue the Celery task. Returns the conversionId
+   * so the frontend can begin polling.
+   */
+  startImport: protectedProcedure
+    .input(startImportInputSchema)
+    .mutation(async ({ input, ctx }) => {
+      ensureFeatureEnabled();
+
+      const tenantId = resolvePresentationTenantId(ctx);
+      const actor = toPresentationActor(ctx);
+
+      // Google Slides: verify OAuth is connected before creating the DB record.
+      // Uses a short-lived user JWT so Python's get_current_user dependency can
+      // resolve the user_id from the token — the access token never leaves Python.
+      if (input.sourceType === "google_slides") {
+        const driveToken = signBearerToken(
+          { sub: String(actor.userId), type: "access", scopes: ["drive:read"] },
+          "5m",
+        );
+
+        let statusBody: { status?: string } = {};
+        try {
+          const statusRes = await fetch(
+            `${PYTHON_BACKEND_URL}/api/oauth/google/drive/status`,
+            { headers: { Authorization: `Bearer ${driveToken}` } },
+          );
+          if (statusRes.ok) {
+            statusBody = (await statusRes.json()) as { status?: string };
+          }
+        } catch {
+          // Network failure — treat as not connected
+        }
+
+        if (statusBody.status !== "connected") {
+          throw new TRPCError({
+            code: "PRECONDITION_FAILED",
+            message:
+              "Google Drive not connected. Please connect your Google account in Settings.",
+          });
+        }
+      }
+
+      const db = await getDb();
+      if (!db)
+        throw new TRPCError({
+          code: "INTERNAL_SERVER_ERROR",
+          message: "Database not available",
+        });
+
+      let record: { id: number };
+      try {
+        const [inserted] = await db
+          .insert(presentationConversionRecords)
+          .values({
+            tenantId,
+            userId: actor.userId,
+            sourceItemId: input.sourceLibraryItemId ?? null,
+            slidesUrl: input.slidesUrl ?? null,
+            sourceFormat: input.sourceType,
+            idempotencyKey: crypto.randomUUID(),
+            status: "queued",
+            progress: 0,
+            expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
+          })
+          .returning({ id: presentationConversionRecords.id });
+        record = inserted;
+      } catch (err) {
+        throw new TRPCError({
+          code: "INTERNAL_SERVER_ERROR",
+          message: "Failed to create import record",
+        });
+      }
+
+      const conversionId = record.id;
+
+      // POST to Python to enqueue the Celery task.
+      // Python validates source_type and decides which importer to use.
+      // Never forward an OAuth access token — Python uses GoogleTokenService internally.
+      let pyRes: Response;
+      try {
+        pyRes = await fetch(
+          `${PYTHON_BACKEND_URL}/api/v1/presentation-import/start`,
+          {
+            method: "POST",
+            headers: {
+              "Content-Type": "application/json",
+              Authorization: `Bearer ${process.env.SMARTSPEC_WEB_GATEWAY_TOKEN ?? ""}`,
+            },
+            body: JSON.stringify({
+              conversion_id: conversionId,
+              source_type: input.sourceType,
+              source_library_item_id: input.sourceLibraryItemId ?? null,
+              slides_url: input.slidesUrl ?? null,
+              user_id: actor.userId,
+              tenant_id: parseInt(tenantId, 10),
+            }),
+          },
+        );
+      } catch (err) {
+        // Network failure — roll back record to failed
+        await db
+          .update(presentationConversionRecords)
+          .set({ status: "failed" })
+          .where(eq(presentationConversionRecords.id, conversionId));
+
+        throw new TRPCError({
+          code: "INTERNAL_SERVER_ERROR",
+          message: "Failed to enqueue import task. Please try again.",
+        });
+      }
+
+      if (!pyRes.ok) {
+        // Roll back the queued record status so the user knows it failed immediately.
+        await db
+          .update(presentationConversionRecords)
+          .set({ status: "failed" })
+          .where(eq(presentationConversionRecords.id, conversionId));
+
+        throw new TRPCError({
+          code: "INTERNAL_SERVER_ERROR",
+          message: "Failed to enqueue import task. Please try again.",
+        });
+      }
+
+      return { conversionId };
+    }),
+
+  /**
+   * Poll the current status of an import job.
+   *
+   * Enforces tenant isolation: the query filters on BOTH conversionId AND
+   * tenantId, so a user in tenant A can never read tenant B's records.
+   *
+   * Returns: { status, progress, fidelityWarnings, deckLibraryItemId }
+   */
+  getImportStatus: protectedProcedure
+    .input(conversionIdInputSchema)
+    .query(async ({ input, ctx }) => {
+      const tenantId = resolvePresentationTenantId(ctx);
+      const db = await getDb();
+      if (!db)
+        throw new TRPCError({
+          code: "INTERNAL_SERVER_ERROR",
+          message: "Database not available",
+        });
+
+      let record: (typeof presentationConversionRecords.$inferSelect) | undefined;
+      try {
+        const [found] = await db
+          .select()
+          .from(presentationConversionRecords)
+          .where(
+            and(
+              eq(presentationConversionRecords.id, input.conversionId),
+              eq(presentationConversionRecords.tenantId, tenantId),
+            ),
+          )
+          .limit(1);
+        record = found;
+      } catch (err) {
+        throw new TRPCError({
+          code: "INTERNAL_SERVER_ERROR",
+          message: "Failed to retrieve import status",
+        });
+      }
+
+      if (!record) {
+        throw new TRPCError({
+          code: "NOT_FOUND",
+          message: "Conversion record not found",
+        });
+      }
+
+      return {
+        status: record.status,
+        progress: record.progress,
+        fidelityWarnings: record.fidelityWarnings ?? [],
+        deckLibraryItemId: record.deckLibraryItemId ?? null,
+      };
+    }),
+
+  /**
+   * Cancel an in-progress import job.
+   *
+   * If the job is already done or failed, returns early (idempotent).
+   * Otherwise, sets the DB record to "cancelled" and sends a best-effort
+   * DELETE to Python to revoke the Celery task via SIGTERM.
+   */
+  cancelImport: protectedProcedure
+    .input(conversionIdInputSchema)
+    .mutation(async ({ input, ctx }) => {
+      const tenantId = resolvePresentationTenantId(ctx);
+      const db = await getDb();
+      if (!db)
+        throw new TRPCError({
+          code: "INTERNAL_SERVER_ERROR",
+          message: "Database not available",
+        });
+
+      let record: { id: number; status: string } | undefined;
+      try {
+        const [found] = await db
+          .select({
+            id: presentationConversionRecords.id,
+            status: presentationConversionRecords.status,
+          })
+          .from(presentationConversionRecords)
+          .where(
+            and(
+              eq(presentationConversionRecords.id, input.conversionId),
+              eq(presentationConversionRecords.tenantId, tenantId),
+            ),
+          )
+          .limit(1);
+        record = found;
+      } catch (err) {
+        throw new TRPCError({
+          code: "INTERNAL_SERVER_ERROR",
+          message: "Failed to retrieve import record",
+        });
+      }
+
+      if (!record) {
+        throw new TRPCError({
+          code: "NOT_FOUND",
+          message: "Conversion record not found",
+        });
+      }
+
+      // Idempotent: already terminal
+      if (
+        record.status === "done" ||
+        record.status === "failed" ||
+        record.status === "cancelled"
+      ) {
+        return { cancelled: true };
+      }
+
+      // Mark cancelled in DB first (best-effort Celery revoke follows)
+      await db
+        .update(presentationConversionRecords)
+        .set({ status: "cancelled" })
+        .where(eq(presentationConversionRecords.id, input.conversionId));
+
+      // Best-effort Celery task revocation — do not throw if this fails
+      try {
+        await fetch(
+          `${PYTHON_BACKEND_URL}/api/v1/presentation-import/${input.conversionId}`,
+          {
+            method: "DELETE",
+            headers: {
+              Authorization: `Bearer ${process.env.SMARTSPEC_WEB_GATEWAY_TOKEN ?? ""}`,
+            },
+          },
+        );
+      } catch {
+        // Non-fatal — DB record is already "cancelled"
+      }
+
+      return { cancelled: true };
+    }),
+});
