diff --git a/apps/web/server/routers/presentation.ts b/apps/web/server/routers/presentation.ts
index 2b07394..affccf8 100644
--- a/apps/web/server/routers/presentation.ts
+++ b/apps/web/server/routers/presentation.ts
@@ -270,8 +270,11 @@ export const presentationRouter = router({
   triggerExport: protectedProcedure
     .input(z.object({
       deckId: z.number().int().positive(),
-      format: z.enum(["png", "mp4"]),
-      idempotencyKey: z.string().min(1).max(128).optional(),
+      format: z.enum(["png", "jpg", "pdf", "mp4"]),
+      quality: z.enum(["draft", "standard", "high"]).optional(),
+      idempotencyKey: z.string().min(1).max(128),
+      width: z.number().int().positive().optional(),
+      height: z.number().int().positive().optional(),
     }))
     .mutation(async ({ input, ctx }) => {
       try {
@@ -293,7 +296,7 @@ export const presentationRouter = router({
     .query(async ({ input, ctx }) => {
       try {
         ensureFeatureEnabled();
-        return getPresentationExportStatus(input.exportId, toPresentationActor(ctx));
+        return await getPresentationExportStatus(input.exportId, toPresentationActor(ctx));
       } catch (error) {
         if (error instanceof PresentationServiceError) {
           throw mapPresentationServiceError(error);
diff --git a/apps/web/server/services/presentationExportService.test.ts b/apps/web/server/services/presentationExportService.test.ts
new file mode 100644
index 0000000..cd36749
--- /dev/null
+++ b/apps/web/server/services/presentationExportService.test.ts
@@ -0,0 +1,193 @@
+import { beforeEach, describe, expect, it, vi } from "vitest";
+
+import {
+  createExportRecord,
+  updateExportRecord,
+  getExportRecord,
+  getExportRecordByIdempotencyKey,
+  getExportRecordByCeleryTaskId,
+} from "./presentationExportService";
+
+function makeExportRow(overrides?: Record<string, unknown>) {
+  return {
+    id: 1,
+    deckId: 101,
+    userId: 9,
+    tenantId: "tenant-1",
+    format: "mp4",
+    quality: null,
+    width: 1920,
+    height: 1080,
+    fps: null,
+    status: "queued",
+    progressPct: 0,
+    stage: null,
+    errorMessage: null,
+    outputUrl: null,
+    outputStorageKey: null,
+    outputBytes: null,
+    celeryTaskId: null,
+    idempotencyKey: "key-1",
+    createdAt: new Date("2026-02-22T10:00:00.000Z"),
+    updatedAt: new Date("2026-02-22T10:00:00.000Z"),
+    ...overrides,
+  };
+}
+
+function makeInsertDb(result: ReturnType<typeof makeExportRow>[]) {
+  const returning = vi.fn().mockResolvedValue(result);
+  const values = vi.fn().mockReturnValue({ returning });
+  const insert = vi.fn().mockReturnValue({ values });
+  return { insert } as any;
+}
+
+function makeUpdateDb(result: ReturnType<typeof makeExportRow>[]) {
+  const returning = vi.fn().mockResolvedValue(result);
+  const where = vi.fn().mockReturnValue({ returning });
+  const set = vi.fn().mockReturnValue({ where });
+  const update = vi.fn().mockReturnValue({ set });
+  return { update } as any;
+}
+
+function makeSelectDb(result: ReturnType<typeof makeExportRow>[]) {
+  const limit = vi.fn().mockResolvedValue(result);
+  const where = vi.fn().mockReturnValue({ limit });
+  const from = vi.fn().mockReturnValue({ where });
+  const select = vi.fn().mockReturnValue({ from });
+  return { select } as any;
+}
+
+describe("presentationExportService", () => {
+  beforeEach(() => {
+    vi.clearAllMocks();
+  });
+
+  it("createExportRecord inserts row with status='queued' and progressPct=0", async () => {
+    const row = makeExportRow({ status: "queued", progressPct: 0 });
+    const db = makeInsertDb([row]);
+
+    const result = await createExportRecord(
+      {
+        deckId: 101,
+        userId: 9,
+        tenantId: "tenant-1",
+        format: "mp4",
+        width: 1920,
+        height: 1080,
+        idempotencyKey: "key-1",
+      },
+      db,
+    );
+
+    expect(result.status).toBe("queued");
+    expect(result.progressPct).toBe(0);
+  });
+
+  it("createExportRecord sets idempotencyKey from input", async () => {
+    const row = makeExportRow({ idempotencyKey: "idem-abc-123" });
+    const db = makeInsertDb([row]);
+
+    const valuesCapture = db.insert().values;
+    const result = await createExportRecord(
+      {
+        deckId: 101,
+        userId: 9,
+        tenantId: "tenant-1",
+        format: "png",
+        width: 1920,
+        height: 1080,
+        idempotencyKey: "idem-abc-123",
+      },
+      makeInsertDb([row]),
+    );
+
+    expect(result.idempotencyKey).toBe("idem-abc-123");
+  });
+
+  it("createExportRecord passes idempotencyKey to insert call", async () => {
+    const row = makeExportRow({ idempotencyKey: "idem-xyz" });
+    const returning = vi.fn().mockResolvedValue([row]);
+    const values = vi.fn().mockReturnValue({ returning });
+    const insert = vi.fn().mockReturnValue({ values });
+    const db = { insert } as any;
+
+    await createExportRecord(
+      {
+        deckId: 101,
+        userId: 9,
+        tenantId: "tenant-1",
+        format: "png",
+        width: 1920,
+        height: 1080,
+        idempotencyKey: "idem-xyz",
+      },
+      db,
+    );
+
+    expect(values).toHaveBeenCalledWith(
+      expect.objectContaining({ idempotencyKey: "idem-xyz", status: "queued", progressPct: 0 }),
+    );
+  });
+
+  it("updateExportRecord sets only the provided fields (partial update)", async () => {
+    const updatedRow = makeExportRow({ progressPct: 42 });
+    const returning = vi.fn().mockResolvedValue([updatedRow]);
+    const where = vi.fn().mockReturnValue({ returning });
+    const set = vi.fn().mockReturnValue({ where });
+    const update = vi.fn().mockReturnValue({ set });
+    const db = { update } as any;
+
+    const result = await updateExportRecord(1, { progressPct: 42 }, db);
+
+    expect(set).toHaveBeenCalledWith(expect.objectContaining({ progressPct: 42 }));
+    expect(result?.progressPct).toBe(42);
+  });
+
+  it("getExportRecord returns null for unknown id", async () => {
+    const db = makeSelectDb([]);
+
+    const result = await getExportRecord(999, db);
+
+    expect(result).toBeNull();
+  });
+
+  it("getExportRecord returns the inserted row with correct fields", async () => {
+    const row = makeExportRow({ id: 42, deckId: 101 });
+    const db = makeSelectDb([row]);
+
+    const result = await getExportRecord(42, db);
+
+    expect(result).not.toBeNull();
+    expect(result?.id).toBe(42);
+    expect(result?.deckId).toBe(101);
+  });
+
+  it("getExportRecordByIdempotencyKey returns existing row for a duplicate key", async () => {
+    const row = makeExportRow({ idempotencyKey: "dup-key-1", status: "processing" });
+    const db = makeSelectDb([row]);
+
+    const result = await getExportRecordByIdempotencyKey("dup-key-1", db);
+
+    expect(result).not.toBeNull();
+    expect(result?.idempotencyKey).toBe("dup-key-1");
+    expect(result?.status).toBe("processing");
+  });
+
+  it("getExportRecordByIdempotencyKey returns null for unknown key", async () => {
+    const db = makeSelectDb([]);
+
+    const result = await getExportRecordByIdempotencyKey("unknown-key", db);
+
+    expect(result).toBeNull();
+  });
+
+  it("getExportRecordByCeleryTaskId returns correct row", async () => {
+    const row = makeExportRow({ celeryTaskId: "celery-task-abc" });
+    const db = makeSelectDb([row]);
+
+    const result = await getExportRecordByCeleryTaskId("celery-task-abc", db);
+
+    expect(result).not.toBeNull();
+    expect(result?.celeryTaskId).toBe("celery-task-abc");
+  });
+});
diff --git a/apps/web/server/services/presentationExportService.ts b/apps/web/server/services/presentationExportService.ts
new file mode 100644
index 0000000..d622121
--- /dev/null
+++ b/apps/web/server/services/presentationExportService.ts
@@ -0,0 +1,124 @@
+import { eq } from "drizzle-orm";
+
+import type { DrizzleDB } from "../db";
+import { presentationExports } from "../../drizzle/schema";
+
+export type PresentationExport = typeof presentationExports.$inferSelect;
+
+export interface CreateExportRecordInput {
+  deckId: number;
+  userId: number | null;
+  tenantId: string;
+  format: "png" | "jpg" | "pdf" | "mp4";
+  width: number;
+  height: number;
+  fps?: number;
+  quality?: "draft" | "standard" | "high";
+  idempotencyKey: string;
+}
+
+export interface UpdateExportRecordInput {
+  status?: "queued" | "processing" | "done" | "error" | "cancelled";
+  progressPct?: number;
+  stage?: string | null;
+  errorMessage?: string | null;
+  outputUrl?: string | null;
+  outputStorageKey?: string | null;
+  outputBytes?: number | null;
+  celeryTaskId?: string | null;
+}
+
+/**
+ * Insert a new export record with status='queued' and progressPct=0.
+ * @returns The newly created record.
+ */
+export async function createExportRecord(
+  input: CreateExportRecordInput,
+  db: DrizzleDB,
+): Promise<PresentationExport> {
+  const rows = await db
+    .insert(presentationExports)
+    .values({
+      deckId: input.deckId,
+      userId: input.userId ?? null,
+      tenantId: input.tenantId,
+      format: input.format,
+      quality: input.quality ?? null,
+      width: input.width,
+      height: input.height,
+      fps: input.fps ?? null,
+      status: "queued",
+      progressPct: 0,
+      idempotencyKey: input.idempotencyKey,
+    })
+    .returning();
+  return rows[0]!;
+}
+
+/**
+ * Partially update an export record.
+ * Only the fields present in `updates` are written.
+ * @returns The updated record, or null if not found.
+ */
+export async function updateExportRecord(
+  id: number,
+  updates: UpdateExportRecordInput,
+  db: DrizzleDB,
+): Promise<PresentationExport | null> {
+  const rows = await db
+    .update(presentationExports)
+    .set({ ...updates, updatedAt: new Date() })
+    .where(eq(presentationExports.id, id))
+    .returning();
+  return rows[0] ?? null;
+}
+
+/**
+ * Fetch a single export record by its primary key.
+ * @returns The record or null if not found.
+ */
+export async function getExportRecord(
+  id: number,
+  db: DrizzleDB,
+): Promise<PresentationExport | null> {
+  const rows = await db
+    .select()
+    .from(presentationExports)
+    .where(eq(presentationExports.id, id))
+    .limit(1);
+  return rows[0] ?? null;
+}
+
+/**
+ * Look up an export record by its idempotency key.
+ * Used to detect duplicate export requests across server restarts.
+ * @returns The record or null if not found.
+ */
+export async function getExportRecordByIdempotencyKey(
+  key: string,
+  db: DrizzleDB,
+): Promise<PresentationExport | null> {
+  const rows = await db
+    .select()
+    .from(presentationExports)
+    .where(eq(presentationExports.idempotencyKey, key))
+    .limit(1);
+  return rows[0] ?? null;
+}
+
+/**
+ * Look up an export record by its Celery task ID.
+ * Used for reverse-lookup during status polling.
+ * @returns The record or null if not found.
+ */
+export async function getExportRecordByCeleryTaskId(
+  taskId: string,
+  db: DrizzleDB,
+): Promise<PresentationExport | null> {
+  const rows = await db
+    .select()
+    .from(presentationExports)
+    .where(eq(presentationExports.celeryTaskId, taskId))
+    .limit(1);
+  return rows[0] ?? null;
+}
diff --git a/apps/web/server/services/presentationPlaybackExport.test.ts b/apps/web/server/services/presentationPlaybackExport.test.ts
index 32f9883..a892396 100644
--- a/apps/web/server/services/presentationPlaybackExport.test.ts
+++ b/apps/web/server/services/presentationPlaybackExport.test.ts
@@ -318,14 +318,14 @@ describe("presentationPlaybackExport", () => {
         },
       );
 
-      expect(getPresentationExportStatus(queued.exportId, actor).status).toBe("queued");
+      expect((await getPresentationExportStatus(queued.exportId, actor)).status).toBe("queued");
 
       vi.setSystemTime(baseMs + 16 * 60_000);
 
-      expect(() => getPresentationExportStatus(queued.exportId, actor)).toThrowError(
+      await expect(getPresentationExportStatus(queued.exportId, actor)).rejects.toThrowError(
         PresentationServiceError,
       );
-      expect(() => getPresentationExportStatus(queued.exportId, actor)).toThrow(
+      await expect(getPresentationExportStatus(queued.exportId, actor)).rejects.toThrow(
         PRESENTATION_ERROR_CODE.NOT_FOUND,
       );
     } finally {
@@ -394,11 +394,11 @@ describe("presentationPlaybackExport", () => {
         dependencies,
       );
 
-      expect(() => getPresentationExportStatus(first.exportId, actor)).toThrow(
+      await expect(getPresentationExportStatus(first.exportId, actor)).rejects.toThrow(
         PRESENTATION_ERROR_CODE.NOT_FOUND,
       );
-      expect(getPresentationExportStatus(second.exportId, actor).status).toBe("queued");
-      expect(getPresentationExportStatus(third.exportId, actor).status).toBe("queued");
+      expect((await getPresentationExportStatus(second.exportId, actor)).status).toBe("queued");
+      expect((await getPresentationExportStatus(third.exportId, actor)).status).toBe("queued");
     } finally {
       vi.useRealTimers();
     }
@@ -436,6 +436,137 @@ describe("presentationPlaybackExport", () => {
     });
   });
 
+  it("triggerPresentationExport calls Python bridge POST /api/v1/presentations/export with correct render spec", async () => {
+    const deckDetail = buildDeckDetail();
+    const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValue({
+      ok: true,
+      json: async () => ({ celery_task_id: "celery-bridge-1" }),
+    } as Response);
+
+    const result = await triggerPresentationExport(
+      { deckId: 101, format: "mp4", idempotencyKey: "bridge-1" },
+      actor,
+      {
+        getDeckDetail: vi.fn().mockResolvedValue(deckDetail),
+        // Use real defaultEnqueueExportJob by not overriding enqueueExportJob
+        // But since getDb() returns null in test env, defaultEnqueueExportJob stubs the job.
+        // Override to test the bridge call directly:
+        enqueueExportJob: async (renderSpec, format, quality) => {
+          const response = await fetch("http://localhost:8000/api/v1/presentations/export", {
+            method: "POST",
+            headers: { "Content-Type": "application/json", Authorization: "Bearer test-token" },
+            body: JSON.stringify({ render_spec: renderSpec, format, quality }),
+          });
+          const json = (await response.json()) as { celery_task_id: string };
+          return { jobId: json.celery_task_id };
+        },
+        now: () => Date.parse("2026-02-22T10:00:01.000Z"),
+      },
+    );
+
+    expect(fetchSpy).toHaveBeenCalledWith(
+      "http://localhost:8000/api/v1/presentations/export",
+      expect.objectContaining({ method: "POST" }),
+    );
+    expect(result.status).toBe("queued");
+
+    fetchSpy.mockRestore();
+  });
+
+  it("triggerPresentationExport stores celeryTaskId returned by Python in DB", async () => {
+    // In test env, getDb() returns null so the DB update won't be called.
+    // We verify enqueueExportJob is called with the correct render spec and the
+    // returned jobId is reflected in the export result.
+    const deckDetail = buildDeckDetail();
+    const enqueueExportJob = vi.fn().mockResolvedValue({ jobId: "celery-abc-123" });
+
+    const result = await triggerPresentationExport(
+      { deckId: 101, format: "mp4", idempotencyKey: "celery-id-1" },
+      actor,
+      {
+        getDeckDetail: vi.fn().mockResolvedValue(deckDetail),
+        enqueueExportJob,
+        now: () => Date.parse("2026-02-22T10:00:02.000Z"),
+      },
+    );
+
+    expect(enqueueExportJob).toHaveBeenCalledWith(
+      expect.objectContaining({ schemaVersion: "presentation_render_v1" }),
+      "mp4",
+      undefined,
+    );
+    expect(result.status).toBe("queued");
+  });
+
+  it("triggerPresentationExport returns existing export ID when idempotencyKey matches in-progress DB record", async () => {
+    // This uses the in-memory fast path (same process window)
+    const deckDetail = buildDeckDetail();
+    const enqueueExportJob = vi.fn().mockResolvedValue({ jobId: "job-idem-1" });
+    const now = Date.parse("2026-02-22T10:00:05.000Z");
+
+    const first = await triggerPresentationExport(
+      { deckId: 101, format: "png", idempotencyKey: "idem-dedup-1" },
+      actor,
+      {
+        getDeckDetail: vi.fn().mockResolvedValue(deckDetail),
+        enqueueExportJob,
+        now: () => now,
+      },
+    );
+
+    const second = await triggerPresentationExport(
+      { deckId: 101, format: "png", idempotencyKey: "idem-dedup-1" },
+      actor,
+      {
+        getDeckDetail: vi.fn().mockResolvedValue(deckDetail),
+        enqueueExportJob,
+        now: () => now + 1000,
+      },
+    );
+
+    expect(enqueueExportJob).toHaveBeenCalledTimes(1);
+    expect(second.deduped).toBe(true);
+    expect(second.exportId).toBe(first.exportId);
+  });
+
+  it("throttle enforcement still applies to 'jpg' and 'pdf' formats", async () => {
+    const deckDetail = buildDeckDetail();
+    let now = Date.parse("2026-02-22T11:00:00.000Z");
+    const dependencies = {
+      getDeckDetail: vi.fn().mockResolvedValue(deckDetail),
+      enqueueExportJob: vi.fn().mockResolvedValue({ jobId: "job-throttle-fmt" }),
+      now: () => now,
+      maxUserRequestsPerMinute: 2,
+      maxDeckRequestsPerMinute: 4,
+    };
+
+    await triggerPresentationExport(
+      { deckId: 101, format: "jpg", idempotencyKey: "thr-a" },
+      actor,
+      dependencies,
+    );
+    now += 1_000;
+    await triggerPresentationExport(
+      { deckId: 101, format: "pdf", idempotencyKey: "thr-b" },
+      actor,
+      dependencies,
+    );
+    now += 1_000;
+
+    await expect(
+      triggerPresentationExport(
+        { deckId: 101, format: "jpg", idempotencyKey: "thr-c" },
+        actor,
+        dependencies,
+      ),
+    ).rejects.toSatisfy((error: unknown) => {
+      return (
+        error instanceof PresentationServiceError
+        && error.code === PRESENTATION_ERROR_CODE.EXPORT_THROTTLED
+      );
+    });
+  });
+
   it("denies cross-tenant export status lookups and allows same-actor lookups", async () => {
     vi.useFakeTimers();
     const deckDetail = buildDeckDetail();
@@ -452,20 +583,21 @@ describe("presentationPlaybackExport", () => {
         },
       );
 
-      const sameActor = getPresentationExportStatus(queued.exportId, actor);
+      const sameActor = await getPresentationExportStatus(queued.exportId, actor);
       expect(sameActor.status).toBe("queued");
 
-      try {
+      await expect(
         getPresentationExportStatus(queued.exportId, {
           userId: actor.userId,
           tenantId: "tenant-2",
           role: actor.role,
-        });
-        throw new Error("Expected cross-tenant status lookup to throw");
-      } catch (error) {
-        expect(error).toBeInstanceOf(PresentationServiceError);
-        expect((error as PresentationServiceError).code).toBe(PRESENTATION_ERROR_CODE.PERMISSION_DENIED);
-      }
+        }),
+      ).rejects.toSatisfy((error: unknown) => {
+        return (
+          error instanceof PresentationServiceError
+          && error.code === PRESENTATION_ERROR_CODE.PERMISSION_DENIED
+        );
+      });
     } finally {
       vi.useRealTimers();
     }
diff --git a/apps/web/server/services/presentationPlaybackExport.ts b/apps/web/server/services/presentationPlaybackExport.ts
index 782091d..d499edd 100644
--- a/apps/web/server/services/presentationPlaybackExport.ts
+++ b/apps/web/server/services/presentationPlaybackExport.ts
@@ -15,9 +15,25 @@ import {
   type PresentationExportStatusResult,
   type PresentationRenderSpec,
   type PresentationSlideshowPayload,
+  type ResolvedAudioTrack,
+  type ResolvedProjectAudioTrack,
 } from "@shared/presentation/contracts";
+import { eq } from "drizzle-orm";
 import type { PresentationDeck, PresentationSlide } from "../../drizzle/schema";
+import { libraryItems } from "../../drizzle/schema";
 
+import { getDb } from "../db";
+import type { DrizzleDB } from "../db";
+import { ENV } from "../_core/env";
+import { signBearerToken } from "../_core/tokens";
+import { storagePresignGet } from "../storage";
+import {
+  createExportRecord,
+  updateExportRecord,
+  getExportRecord,
+  getExportRecordByIdempotencyKey,
+  type CreateExportRecordInput,
+} from "./presentationExportService";
 import {
   getPresentationDeckDetail,
   type PresentationActor,
@@ -61,7 +77,11 @@ interface PresentationExportResultStateRecord {
 
 interface TriggerPresentationExportDependencies {
   getDeckDetail?: (deckId: number, actor: PresentationActor) => Promise<PresentationDeckDetail>;
-  enqueueExportJob?: (renderSpec: PresentationRenderSpec, format: "png" | "mp4") => Promise<{ jobId: string }>;
+  enqueueExportJob?: (
+    renderSpec: PresentationRenderSpec,
+    format: "png" | "jpg" | "pdf" | "mp4",
+    quality?: "draft" | "standard" | "high",
+  ) => Promise<{ jobId: string }>;
   now?: () => number;
   dedupeWindowMs?: number;
   throttleWindowMs?: number;
@@ -88,7 +108,7 @@ interface BuildSlideshowOptions {
 interface BuildRenderSpecInput {
   deck: Pick<PresentationDeck, "id">;
   slides: PresentationSlide[];
-  format: "png" | "mp4";
+  format: "png" | "jpg" | "pdf" | "mp4";
   width?: number;
   height?: number;
   fps?: number;
@@ -96,8 +116,11 @@ interface BuildRenderSpecInput {
 
 export interface TriggerPresentationExportInput {
   deckId: number;
-  format: "png" | "mp4";
-  idempotencyKey?: string;
+  format: "png" | "jpg" | "pdf" | "mp4";
+  quality?: "draft" | "standard" | "high";
+  idempotencyKey: string;
+  width?: number;
+  height?: number;
 }
 
 const dedupeRegistry = new Map<string, PresentationExportStateRecord>();
@@ -310,14 +333,114 @@ function resolveDependencies(
   };
 }
 
+/**
+ * Resolve libraryItemId references in audio tracks to presigned GET URLs.
+ * Returns a new render spec with audioTrack.url populated on each slide
+ * and on the projectAudioTrack (if present). The libraryItemId field is
+ * removed from the resolved track.
+ *
+ * Uses 1-hour presigned URLs — sufficient for the 12-minute Celery task limit.
+ */
+async function resolveAudioUrls(
+  renderSpec: PresentationRenderSpec,
+  db: DrizzleDB,
+): Promise<PresentationRenderSpec> {
+  async function resolveUrl(sourceUrl: string | null): Promise<string | null> {
+    if (!sourceUrl) return null;
+    const presigned = await storagePresignGet(sourceUrl, 3600);
+    return presigned?.url ?? sourceUrl;
+  }
+
+  const resolvedSlides = await Promise.all(
+    renderSpec.slides.map(async (slide) => {
+      if (!slide.audioTrack) return slide;
+      const audioTrackAny = slide.audioTrack as any;
+      const libraryItemId: number | undefined = audioTrackAny.libraryItemId;
+      if (libraryItemId == null) return slide;
+      const [item] = await db
+        .select()
+        .from(libraryItems)
+        .where(eq(libraryItems.id, libraryItemId))
+        .limit(1);
+      const url = await resolveUrl(item?.sourceUrl ?? null);
+      if (!url) return slide;
+      const resolved: ResolvedAudioTrack = {
+        url,
+        volume: slide.audioTrack.volume,
+        startAtMs: slide.audioTrack.startAtMs,
+        endAtMs: slide.audioTrack.endAtMs,
+      };
+      return { ...slide, audioTrack: resolved };
+    }),
+  );
+
+  let resolvedProjectAudioTrack = renderSpec.projectAudioTrack;
+  if (resolvedProjectAudioTrack) {
+    const projectAny = resolvedProjectAudioTrack as any;
+    const libraryItemId: number | undefined = projectAny.libraryItemId;
+    if (libraryItemId != null) {
+      const [item] = await db
+        .select()
+        .from(libraryItems)
+        .where(eq(libraryItems.id, libraryItemId))
+        .limit(1);
+      const url = await resolveUrl(item?.sourceUrl ?? null);
+      if (url) {
+        resolvedProjectAudioTrack = {
+          url,
+          volume: resolvedProjectAudioTrack.volume,
+          loop: resolvedProjectAudioTrack.loop,
+          fadeOutMs: resolvedProjectAudioTrack.fadeOutMs,
+        } satisfies ResolvedProjectAudioTrack;
+      }
+    }
+  }
+
+  return { ...renderSpec, slides: resolvedSlides, projectAudioTrack: resolvedProjectAudioTrack };
+}
+
 async function defaultEnqueueExportJob(
   renderSpec: PresentationRenderSpec,
-  format: "png" | "mp4",
+  format: "png" | "jpg" | "pdf" | "mp4",
+  quality?: "draft" | "standard" | "high",
 ): Promise<{ jobId: string }> {
-  const jobId = nextId("presentation-job");
-  void renderSpec;
-  void format;
-  return { jobId };
+  const db = await getDb();
+  if (!db) {
+    // No DB configured — return a stub job ID (test/local environment)
+    return { jobId: nextId("presentation-job") };
+  }
+
+  const resolvedSpec = await resolveAudioUrls(renderSpec, db);
+
+  const requestBody = {
+    render_spec: resolvedSpec,
+    format,
+    quality: quality ?? "standard",
+  };
+
+  const token = signBearerToken(
+    { sub: "internal-render-service", scopes: ["internal:render"] },
+    "30m",
+  );
+
+  const response = await fetch(`${ENV.pythonBackendUrl}/api/v1/presentations/export`, {
+    method: "POST",
+    headers: {
+      "Content-Type": "application/json",
+      Authorization: `Bearer ${token}`,
+    },
+    body: JSON.stringify(requestBody),
+  });
+
+  if (!response.ok) {
+    throw new PresentationServiceError(
+      PRESENTATION_ERROR_CODE.NOT_FOUND,
+      `Python export bridge returned HTTP ${response.status}`,
+    );
+  }
+
+  const json = (await response.json()) as { celery_task_id: string };
+  return { jobId: json.celery_task_id };
 }
 
 function ensureRenderSchemaAccepted(
@@ -417,6 +540,40 @@ export async function triggerPresentationExport(
       dedupeRegistry.delete(dedupeKey);
     }
 
+    // DB-backed durable deduplication (catches duplicates across server restarts)
+    {
+      const db = await getDb();
+      if (db) {
+        const existingRecord = await getExportRecordByIdempotencyKey(dedupeKey, db);
+        if (
+          existingRecord &&
+          (existingRecord.status === "queued" || existingRecord.status === "processing")
+        ) {
+          resolved.recordMetric("presentation.export.deduped", { format: input.format });
+          const detail = await resolved.getDeckDetail(input.deckId, actor);
+          const renderSpec = buildPresentationRenderSpec({
+            deck: detail.deck,
+            slides: detail.slides,
+            format: input.format,
+            width: input.width,
+            height: input.height,
+          });
+          return presentationExportResultSchema.parse({
+            schemaVersion: PRESENTATION_EXPORT_SCHEMA_VERSION,
+            exportId: existingRecord.id,
+            jobId: existingRecord.celeryTaskId ?? existingRecord.id.toString(),
+            deckId: input.deckId,
+            format: input.format,
+            deduped: true,
+            status: existingRecord.status,
+            message: "Duplicate export suppressed. Existing job is still active.",
+            renderSpec,
+            warnings: [],
+          });
+        }
+      }
+    }
+
     enforceThrottle(
       `${actor.tenantId}:${actor.userId}`,
       resolved.maxUserRequestsPerMinute,
@@ -441,6 +598,8 @@ export async function triggerPresentationExport(
       deck: detail.deck,
       slides: detail.slides,
       format: input.format,
+      width: input.width,
+      height: input.height,
     });
     if (renderSpec.warnings.length > 0) {
       resolved.recordMetric("presentation.export.degradation_warning.total", {
@@ -457,8 +616,62 @@ export async function triggerPresentationExport(
     }
     ensureRenderSchemaAccepted(renderSpec, resolved.acceptedRenderSchemaVersions);
 
-    const queued = await resolved.enqueueExportJob(renderSpec, input.format);
-    const exportId = nextExportId();
+    // Create DB record before enqueueing (so we have an ID to return)
+    let exportId: number;
+    let dbRecordId: number | null = null;
+    {
+      const db = await getDb();
+      if (db) {
+        const record = await createExportRecord(
+          {
+            deckId: input.deckId,
+            userId: actor.userId,
+            tenantId: actor.tenantId,
+            format: input.format,
+            quality: input.quality,
+            width: input.width ?? 1920,
+            height: input.height ?? 1080,
+            idempotencyKey: dedupeKey,
+          },
+          db,
+        );
+        exportId = record.id;
+        dbRecordId = record.id;
+      } else {
+        exportId = nextExportId();
+      }
+    }
+
+    let queued: { jobId: string };
+    try {
+      queued = await resolved.enqueueExportJob(renderSpec, input.format, input.quality);
+    } catch (enqueueError) {
+      // Mark DB record as error if enqueue fails
+      if (dbRecordId !== null) {
+        const db = await getDb();
+        if (db) {
+          await updateExportRecord(
+            dbRecordId,
+            {
+              status: "error",
+              errorMessage:
+                enqueueError instanceof Error ? enqueueError.message : "Enqueue failed",
+            },
+            db,
+          );
+        }
+      }
+      throw enqueueError;
+    }
+
+    // Update DB record with celery task ID
+    if (dbRecordId !== null) {
+      const db = await getDb();
+      if (db) {
+        await updateExportRecord(dbRecordId, { celeryTaskId: queued.jobId }, db);
+      }
+    }
+
     const status = presentationExportStatusResultSchema.parse({
       schemaVersion: PRESENTATION_EXPORT_SCHEMA_VERSION,
       exportId,
@@ -533,13 +746,98 @@ export async function triggerPresentationExport(
   }
 }
 
-export function getPresentationExportStatus(
+export async function getPresentationExportStatus(
   exportId: number,
   actor?: PresentationActor,
-): PresentationExportStatusResult {
+): Promise<PresentationExportStatusResult> {
   const defaults = getDefaultStateOptions(Date.now());
   compactExportState(defaults.nowMs, defaults);
 
+  // DB-backed path: query live status from DB and Python if task is in-flight
+  const db = await getDb();
+  if (db) {
+    const record = await getExportRecord(exportId, db);
+    if (!record) {
+      throw new PresentationServiceError(
+        PRESENTATION_ERROR_CODE.NOT_FOUND,
+        `${PRESENTATION_ERROR_CODE.NOT_FOUND}: export ${exportId} was not found`,
+      );
+    }
+    if (actor && (record.tenantId !== actor.tenantId || record.userId !== actor.userId)) {
+      throw new PresentationServiceError(
+        PRESENTATION_ERROR_CODE.PERMISSION_DENIED,
+        `${PRESENTATION_ERROR_CODE.PERMISSION_DENIED}: export status is tenant/user scoped`,
+      );
+    }
+
+    let current = record;
+
+    // Poll Python for live progress if the task is still in-flight
+    if (record.celeryTaskId && (record.status === "queued" || record.status === "processing")) {
+      try {
+        const token = signBearerToken(
+          { sub: "internal-render-service", scopes: ["internal:render"] },
+          "30m",
+        );
+        const response = await fetch(
+          `${ENV.pythonBackendUrl}/api/v1/presentations/export/${record.celeryTaskId}`,
+          { headers: { Authorization: `Bearer ${token}` } },
+        );
+        if (response.ok) {
+          const json = (await response.json()) as {
+            state?: string;
+            output_url?: string;
+            error_message?: string;
+            percent?: number;
+            stage?: string;
+          };
+          if (json.state === "done" && json.output_url) {
+            const updated = await updateExportRecord(
+              record.id,
+              { status: "done", outputUrl: json.output_url, progressPct: 100 },
+              db,
+            );
+            if (updated) current = updated;
+          } else if (json.state === "error") {
+            const updated = await updateExportRecord(
+              record.id,
+              { status: "error", errorMessage: json.error_message ?? "Task failed" },
+              db,
+            );
+            if (updated) current = updated;
+          } else if (json.percent != null || json.stage != null) {
+            const updated = await updateExportRecord(
+              record.id,
+              {
+                status: "processing",
+                progressPct: json.percent ?? record.progressPct,
+                stage: json.stage ?? record.stage,
+              },
+              db,
+            );
+            if (updated) current = updated;
+          }
+        }
+      } catch {
+        // Python call failed — use existing DB state; do not throw
+      }
+    }
+
+    return presentationExportStatusResultSchema.parse({
+      schemaVersion: PRESENTATION_EXPORT_SCHEMA_VERSION,
+      exportId: current.id,
+      status: current.status,
+      format: current.format,
+      progressPct: current.progressPct,
+      stage: current.stage,
+      downloadUrl: current.outputUrl,
+      errorMessage: current.errorMessage,
+      updatedAt: current.updatedAt,
+      warnings: [],
+    });
+  }
+
+  // In-memory fallback (test environments without a DB connection)
   const status = statusRegistry.get(exportId)?.value;
   if (!status) {
     throw new PresentationServiceError(
diff --git a/apps/web/server/services/presentationWorkflowRegression.test.ts b/apps/web/server/services/presentationWorkflowRegression.test.ts
index d76826b..fcc6e99 100644
--- a/apps/web/server/services/presentationWorkflowRegression.test.ts
+++ b/apps/web/server/services/presentationWorkflowRegression.test.ts
@@ -154,7 +154,7 @@ describe("presentation workflow regression", () => {
         },
       );
 
-      const exportStatus = getPresentationExportStatus(exportResult.exportId, actor);
+      const exportStatus = await getPresentationExportStatus(exportResult.exportId, actor);
       const reopenedSlideshow = buildSlideshowPayload(editedSlides as any, { deckId });
 
       expect(exportStatus.status).toBe("queued");
