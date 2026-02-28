diff --git a/apps/web/server/_core/index.ts b/apps/web/server/_core/index.ts
index 3a65273..3c7d9c2 100644
--- a/apps/web/server/_core/index.ts
+++ b/apps/web/server/_core/index.ts
@@ -42,6 +42,7 @@ import { initializeGDriveCleanupJob, shutdownGDriveCleanupWorker } from "../jobs
 import { initFromDb, startPeriodicPersistence } from "../services/providerHealth";
 import { startHistoryCollection } from "../services/llmQueue";
 import { createTasksRouter } from "../routes/tasks";
+import { presentationImportCallbackHandler } from "../routes/presentationImportCallback";
 import { PostgresAdapter } from "../services/postgresAdapter";
 import { getUploadStaticHeaders } from "../services/uploadContentSafety";
 import { ImageProxySafetyError, proxyImageFromUrl } from "../services/imageProxySafety";
@@ -486,6 +487,9 @@ app.post("/api/internal/google-drive/cleanup", async (req, res) => {
   }
 });
 
+// Internal presentation import callback (Python backend -> Node.js)
+app.post("/api/internal/presentation-import/callback", presentationImportCallbackHandler);
+
 // Device auth routes (for desktop app)
 registerDeviceAuthRoutes(app);
 
@@ -721,7 +725,7 @@ async function main() {
   server.requestTimeout = 120_000;   // 2 min — same as timeout, explicit
 
   server.listen(port, '0.0.0.0', () => {
-    console.log(`SmartSpec Web listening on http://0.0.0.0:${port}`);
+    console.log(`SmartAIHub Web listening on http://0.0.0.0:${port}`);
   });
 }
 
diff --git a/apps/web/server/routes/presentationImportCallback.test.ts b/apps/web/server/routes/presentationImportCallback.test.ts
new file mode 100644
index 0000000..ae0101b
--- /dev/null
+++ b/apps/web/server/routes/presentationImportCallback.test.ts
@@ -0,0 +1,233 @@
+import { describe, it, expect, vi, beforeEach } from "vitest";
+import express from "express";
+import supertest from "supertest";
+
+// ── Module mocks ─────────────────────────────────────────────────────────────
+
+vi.mock("../db", () => ({
+  getDb: vi.fn(),
+}));
+
+vi.mock("../../drizzle/schema", () => ({
+  libraryItems: "libraryItems",
+  presentationConversionRecords: "presentationConversionRecords",
+}));
+
+vi.mock("drizzle-orm", () => ({
+  eq: vi.fn((col, val) => ({ col, val })),
+}));
+
+vi.mock("../services/presentationImportService", () => ({
+  createDeckFromImportResult: vi.fn(),
+}));
+
+vi.mock("../_core/logger", () => ({
+  debugLog: vi.fn(),
+  debugError: vi.fn(),
+}));
+
+// ENV is evaluated at request-time so we can override it per-test
+vi.mock("../_core/env", () => ({
+  ENV: { webGatewayToken: "secret-test-token" },
+}));
+
+// ── Imports after mocks ───────────────────────────────────────────────────────
+
+import { getDb } from "../db";
+import { createDeckFromImportResult } from "../services/presentationImportService";
+import { ENV } from "../_core/env";
+import { presentationImportCallbackHandler } from "./presentationImportCallback";
+
+const mockGetDb = vi.mocked(getDb);
+const mockCreateDeck = vi.mocked(createDeckFromImportResult);
+
+// ── Test app ──────────────────────────────────────────────────────────────────
+
+function makeApp() {
+  const app = express();
+  app.use(express.json());
+  app.post(
+    "/api/internal/presentation-import/callback",
+    presentationImportCallbackHandler,
+  );
+  return app;
+}
+
+/** Build a DB mock for the callback route (read → optionally update) */
+function makeMockDb(records: Record<string, any>[] = []) {
+  const limitMock = vi.fn().mockResolvedValue(records);
+  const whereMock = vi.fn().mockReturnValue({ limit: limitMock });
+  const fromMock = vi.fn().mockReturnValue({ where: whereMock });
+  const selectMock = vi.fn().mockReturnValue({ from: fromMock });
+
+  // update chain for failed path
+  const updateWhere = vi.fn().mockResolvedValue([]);
+  const updateSet = vi.fn().mockReturnValue({ where: updateWhere });
+  const updateMock = vi.fn().mockReturnValue({ set: updateSet });
+
+  return {
+    db: { select: selectMock, update: updateMock } as any,
+    mocks: { selectMock, whereMock, limitMock, updateMock, updateSet, updateWhere },
+  };
+}
+
+const VALID_BODY = {
+  conversionId: 1,
+  status: "done",
+  slides: [{ type: "slide" }],
+  fidelityWarnings: [],
+};
+
+const AUTH_HEADER = "Bearer secret-test-token";
+
+// ── Tests ─────────────────────────────────────────────────────────────────────
+
+describe("POST /api/internal/presentation-import/callback", () => {
+  beforeEach(() => {
+    vi.clearAllMocks();
+    // Default: ENV has a valid token
+    vi.mocked(ENV).webGatewayToken = "secret-test-token";
+  });
+
+  it("returns 401 with empty body when Authorization header is missing", async () => {
+    const res = await supertest(makeApp())
+      .post("/api/internal/presentation-import/callback")
+      .send(VALID_BODY);
+
+    expect(res.status).toBe(401);
+    expect(res.body).toEqual({});
+    expect(res.text).toBe("");
+  });
+
+  it("returns 401 when the Bearer token does not match ENV.webGatewayToken", async () => {
+    const res = await supertest(makeApp())
+      .post("/api/internal/presentation-import/callback")
+      .set("Authorization", "Bearer wrong-token")
+      .send(VALID_BODY);
+
+    expect(res.status).toBe(401);
+    expect(res.text).toBe("");
+  });
+
+  it("returns 400 when body fails Zod validation (malformed body)", async () => {
+    const { db } = makeMockDb();
+    mockGetDb.mockResolvedValue(db);
+
+    const res = await supertest(makeApp())
+      .post("/api/internal/presentation-import/callback")
+      .set("Authorization", AUTH_HEADER)
+      .send({ conversionId: "not-a-number", status: "done" });
+
+    expect(res.status).toBe(400);
+  });
+
+  it("returns 200 immediately without calling createDeckFromImportResult when status='done' and record is already done (idempotency)", async () => {
+    const { db } = makeMockDb([
+      {
+        id: 1,
+        status: "done",
+        deckLibraryItemId: 77,
+        userId: 5,
+        tenantId: "t1",
+        sourceFormat: "pptx",
+        sourceItemId: null,
+      },
+    ]);
+    mockGetDb.mockResolvedValue(db);
+
+    const res = await supertest(makeApp())
+      .post("/api/internal/presentation-import/callback")
+      .set("Authorization", AUTH_HEADER)
+      .send(VALID_BODY);
+
+    expect(res.status).toBe(200);
+    expect(res.body).toEqual({ ok: true, deckLibraryItemId: 77 });
+    expect(mockCreateDeck).not.toHaveBeenCalled();
+  });
+
+  it("returns 200 and calls createDeckFromImportResult when status='done' and record is not yet done", async () => {
+    const { db } = makeMockDb([
+      {
+        id: 1,
+        status: "queued",
+        deckLibraryItemId: null,
+        userId: 5,
+        tenantId: "tenant-xyz",
+        sourceFormat: "pptx",
+        sourceItemId: null,
+      },
+    ]);
+    mockGetDb.mockResolvedValue(db);
+    mockCreateDeck.mockResolvedValue({ deckLibraryItemId: 99 });
+
+    const res = await supertest(makeApp())
+      .post("/api/internal/presentation-import/callback")
+      .set("Authorization", AUTH_HEADER)
+      .send(VALID_BODY);
+
+    expect(res.status).toBe(200);
+    expect(res.body).toEqual({ ok: true, deckLibraryItemId: 99 });
+    expect(mockCreateDeck).toHaveBeenCalledWith(
+      expect.objectContaining({
+        conversionId: 1,
+        tenantId: "tenant-xyz",
+        userId: 5,
+        sourceFormat: "pptx",
+      }),
+    );
+  });
+
+  it("updates presentationConversionRecords to status='failed' and returns 200 when status='failed'", async () => {
+    const { db, mocks } = makeMockDb([
+      {
+        id: 1,
+        status: "processing",
+        deckLibraryItemId: null,
+        userId: 5,
+        tenantId: "t1",
+        sourceFormat: "pptx",
+        sourceItemId: null,
+      },
+    ]);
+    mockGetDb.mockResolvedValue(db);
+
+    const res = await supertest(makeApp())
+      .post("/api/internal/presentation-import/callback")
+      .set("Authorization", AUTH_HEADER)
+      .send({ conversionId: 1, status: "failed", error: "Import failed: bad format" });
+
+    expect(res.status).toBe(200);
+    expect(res.body).toEqual({ ok: true });
+    expect(mocks.updateSet).toHaveBeenCalledWith(
+      expect.objectContaining({
+        status: "failed",
+        error: "Import failed: bad format",
+      }),
+    );
+    expect(mockCreateDeck).not.toHaveBeenCalled();
+  });
+
+  it("responds 200 even when createDeckFromImportResult throws (logs error, does not bubble up)", async () => {
+    const { db } = makeMockDb([
+      {
+        id: 1,
+        status: "queued",
+        deckLibraryItemId: null,
+        userId: 5,
+        tenantId: "t1",
+        sourceFormat: "pptx",
+        sourceItemId: null,
+      },
+    ]);
+    mockGetDb.mockResolvedValue(db);
+    mockCreateDeck.mockRejectedValue(new Error("DB constraint violation"));
+
+    const res = await supertest(makeApp())
+      .post("/api/internal/presentation-import/callback")
+      .set("Authorization", AUTH_HEADER)
+      .send(VALID_BODY);
+
+    expect(res.status).toBe(200);
+    expect(res.body).toEqual({ ok: false, error: "internal" });
+  });
+});
diff --git a/apps/web/server/routes/presentationImportCallback.ts b/apps/web/server/routes/presentationImportCallback.ts
new file mode 100644
index 0000000..f85366b
--- /dev/null
+++ b/apps/web/server/routes/presentationImportCallback.ts
@@ -0,0 +1,129 @@
+import type { Request, Response } from "express";
+import { z } from "zod";
+import { eq } from "drizzle-orm";
+
+import { getDb } from "../db";
+import { libraryItems, presentationConversionRecords } from "../../drizzle/schema";
+import { createDeckFromImportResult } from "../services/presentationImportService";
+import { debugLog, debugError } from "../_core/logger";
+import { ENV } from "../_core/env";
+
+const callbackBodySchema = z.object({
+  conversionId: z.number().int().positive(),
+  status: z.enum(["done", "failed"]),
+  slides: z.array(z.record(z.unknown())).optional(),
+  fidelityWarnings: z.array(z.string()).max(25).optional(),
+  error: z.string().optional(),
+});
+
+/**
+ * Handler for: POST /api/internal/presentation-import/callback
+ *
+ * Python calls this after a Celery import task completes (success or failure).
+ * Auth: Bearer token matched against ENV.webGatewayToken.
+ * Security: auth check BEFORE body parsing; actor constructed from DB record,
+ * never from the untrusted callback body.
+ */
+export async function presentationImportCallbackHandler(
+  req: Request,
+  res: Response,
+): Promise<void> {
+  // Auth check BEFORE body parsing — do not parse the body for unauthenticated requests
+  const authHeader = req.headers.authorization || "";
+  if (!authHeader.startsWith("Bearer ") || !ENV.webGatewayToken) {
+    res.status(401).end();
+    return;
+  }
+  const token = authHeader.slice(7);
+  if (token !== ENV.webGatewayToken) {
+    res.status(401).end();
+    return;
+  }
+
+  // Validate body with Zod after auth passes
+  const parsed = callbackBodySchema.safeParse(req.body);
+  if (!parsed.success) {
+    res.status(400).json({ ok: false, error: "Invalid request body" });
+    return;
+  }
+  const body = parsed.data;
+
+  const db = await getDb();
+  if (!db) {
+    // Respond 200 so Python doesn't retry endlessly on DB unavailability
+    res.status(200).json({ ok: false, error: "database_unavailable" });
+    return;
+  }
+
+  // Idempotency: read conversion record before doing any meaningful work
+  const [record] = await db
+    .select()
+    .from(presentationConversionRecords)
+    .where(eq(presentationConversionRecords.id, body.conversionId))
+    .limit(1);
+
+  if (!record) {
+    // Unknown conversionId — respond 200 without leaking existence
+    debugLog("presentation-import", "callback: unknown conversionId", {
+      conversionId: body.conversionId,
+    });
+    res.status(200).json({ ok: true });
+    return;
+  }
+
+  // Already done — Celery retry delivered a duplicate callback
+  if (record.status === "done") {
+    res.status(200).json({ ok: true, deckLibraryItemId: record.deckLibraryItemId });
+    return;
+  }
+
+  if (body.status === "done") {
+    // Derive title from source library item or fall back to default
+    let title = "Imported Presentation";
+    if (record.sourceItemId) {
+      const [sourceItem] = await db
+        .select({ title: libraryItems.title })
+        .from(libraryItems)
+        .where(eq(libraryItems.id, record.sourceItemId))
+        .limit(1);
+      if (sourceItem?.title) {
+        title = sourceItem.title;
+      }
+    }
+
+    try {
+      const { deckLibraryItemId } = await createDeckFromImportResult({
+        conversionId: body.conversionId,
+        tenantId: record.tenantId,
+        userId: record.userId,
+        slides: body.slides ?? [],
+        title,
+        fidelityWarnings: body.fidelityWarnings ?? [],
+        sourceFormat: record.sourceFormat,
+        sourceLibraryItemId: record.sourceItemId ?? null,
+      });
+      res.status(200).json({ ok: true, deckLibraryItemId });
+    } catch (err) {
+      debugError(
+        "presentation-import",
+        "callback: createDeckFromImportResult failed",
+        err,
+      );
+      // Always respond 200 — prevent Celery from retrying endlessly on internal errors
+      res.status(200).json({ ok: false, error: "internal" });
+    }
+    return;
+  }
+
+  // status === "failed": mark the record and respond 200
+  await db
+    .update(presentationConversionRecords)
+    .set({
+      status: "failed",
+      error: body.error ?? "Unknown error",
+      updatedAt: new Date(),
+    })
+    .where(eq(presentationConversionRecords.id, body.conversionId));
+
+  res.status(200).json({ ok: true });
+}
diff --git a/apps/web/server/services/presentationImportService.test.ts b/apps/web/server/services/presentationImportService.test.ts
new file mode 100644
index 0000000..6c573ec
--- /dev/null
+++ b/apps/web/server/services/presentationImportService.test.ts
@@ -0,0 +1,223 @@
+import { describe, it, expect, vi, beforeEach } from "vitest";
+import { createDeckFromImportResult } from "./presentationImportService";
+
+// ── Module mocks ─────────────────────────────────────────────────────────────
+
+vi.mock("../db", () => ({
+  getDb: vi.fn(),
+}));
+
+// Expose table refs as stable string tokens so we can assert insert/update calls
+vi.mock("../../drizzle/schema", () => ({
+  libraryItems: "libraryItems",
+  presentationConversionRecords: "presentationConversionRecords",
+  presentationSourceAttachments: "presentationSourceAttachments",
+}));
+
+vi.mock("drizzle-orm", () => ({
+  eq: vi.fn((col, val) => ({ col, val, __eq: true })),
+}));
+
+vi.mock("./presentationService", () => ({
+  createPresentationDeckForLibraryItem: vi.fn(),
+  addSlideToDeck: vi.fn(),
+}));
+
+vi.mock("../_core/logger", () => ({
+  debugLog: vi.fn(),
+  debugError: vi.fn(),
+}));
+
+// ── Helpers ──────────────────────────────────────────────────────────────────
+
+import { getDb } from "../db";
+import {
+  createPresentationDeckForLibraryItem,
+  addSlideToDeck,
+} from "./presentationService";
+import { debugLog } from "../_core/logger";
+
+const mockGetDb = vi.mocked(getDb);
+const mockCreateDeck = vi.mocked(createPresentationDeckForLibraryItem);
+const mockAddSlide = vi.mocked(addSlideToDeck);
+const mockDebugLog = vi.mocked(debugLog);
+
+/** Build a DB mock whose insert/update return chained mocks. */
+function makeMockDb(libraryItemId = 42, deckId = 99) {
+  // insert(libraryItems).values(...).returning(...) → [{ id: libraryItemId }]
+  const returningLibraryItem = vi.fn().mockResolvedValue([{ id: libraryItemId }]);
+  const valuesLibraryItem = vi.fn().mockReturnValue({ returning: returningLibraryItem });
+
+  // insert(presentationSourceAttachments).values(...) → awaitable (no returning)
+  const valuesAttachment = vi.fn().mockResolvedValue(undefined);
+
+  const insertMock = vi
+    .fn()
+    .mockImplementationOnce(() => ({ values: valuesLibraryItem }))
+    .mockImplementationOnce(() => ({ values: valuesAttachment }));
+
+  // update(presentationConversionRecords).set(...).where(...) → awaitable
+  const updateWhere = vi.fn().mockResolvedValue([]);
+  const updateSet = vi.fn().mockReturnValue({ where: updateWhere });
+  const updateMock = vi.fn().mockReturnValue({ set: updateSet });
+
+  return {
+    db: { insert: insertMock, update: updateMock } as any,
+    mocks: {
+      insert: insertMock,
+      valuesLibraryItem,
+      returningLibraryItem,
+      valuesAttachment,
+      update: updateMock,
+      updateSet,
+      updateWhere,
+    },
+  };
+}
+
+const BASE_PARAMS = {
+  conversionId: 1,
+  tenantId: "tenant-abc",
+  userId: 7,
+  slides: [{ type: "slide", content: "hello" }],
+  title: "My Presentation",
+  fidelityWarnings: [],
+  sourceFormat: "pptx",
+  sourceLibraryItemId: 5,
+};
+
+// ── Tests ────────────────────────────────────────────────────────────────────
+
+describe("createDeckFromImportResult", () => {
+  beforeEach(() => {
+    vi.clearAllMocks();
+    mockCreateDeck.mockResolvedValue({
+      created: true,
+      deck: { id: 99 } as any,
+    });
+    mockAddSlide.mockResolvedValue({ id: 1 } as any);
+  });
+
+  it("creates a libraryItem Drizzle insert with itemType='presentation' and status='ready'", async () => {
+    const { db, mocks } = makeMockDb();
+    mockGetDb.mockResolvedValue(db);
+
+    await createDeckFromImportResult(BASE_PARAMS);
+
+    expect(mocks.insert).toHaveBeenNthCalledWith(1, "libraryItems");
+    expect(mocks.valuesLibraryItem).toHaveBeenCalledWith(
+      expect.objectContaining({
+        tenantId: "tenant-abc",
+        ownerUserId: 7,
+        itemType: "presentation",
+        source: "import",
+        title: "My Presentation",
+        status: "ready",
+        visibility: "private",
+      }),
+    );
+  });
+
+  it("calls createPresentationDeckForLibraryItem with the new libraryItemId", async () => {
+    const { db } = makeMockDb(42);
+    mockGetDb.mockResolvedValue(db);
+
+    await createDeckFromImportResult(BASE_PARAMS);
+
+    expect(mockCreateDeck).toHaveBeenCalledWith(
+      { libraryItemId: 42, title: "My Presentation" },
+      expect.objectContaining({ userId: 7, tenantId: "tenant-abc", role: "user" }),
+    );
+  });
+
+  it("calls addSlideToDeck for each slide with incrementing expectedVersion starting at 0", async () => {
+    const { db } = makeMockDb();
+    mockGetDb.mockResolvedValue(db);
+
+    const slides = [
+      { type: "slide", idx: 0 },
+      { type: "slide", idx: 1 },
+      { type: "slide", idx: 2 },
+    ];
+    await createDeckFromImportResult({ ...BASE_PARAMS, slides });
+
+    expect(mockAddSlide).toHaveBeenCalledTimes(3);
+    expect(mockAddSlide).toHaveBeenNthCalledWith(
+      1,
+      { deckId: 99, expectedVersion: 0, slideContent: slides[0] },
+      expect.objectContaining({ userId: 7 }),
+    );
+    expect(mockAddSlide).toHaveBeenNthCalledWith(
+      2,
+      { deckId: 99, expectedVersion: 1, slideContent: slides[1] },
+      expect.objectContaining({ userId: 7 }),
+    );
+    expect(mockAddSlide).toHaveBeenNthCalledWith(
+      3,
+      { deckId: 99, expectedVersion: 2, slideContent: slides[2] },
+      expect.objectContaining({ userId: 7 }),
+    );
+  });
+
+  it("inserts a presentationSourceAttachments row linking the deck to its source", async () => {
+    const { db, mocks } = makeMockDb(42, 99);
+    mockGetDb.mockResolvedValue(db);
+
+    await createDeckFromImportResult({
+      ...BASE_PARAMS,
+      fidelityWarnings: ["font not supported"],
+    });
+
+    expect(mocks.insert).toHaveBeenNthCalledWith(2, "presentationSourceAttachments");
+    expect(mocks.valuesAttachment).toHaveBeenCalledWith(
+      expect.objectContaining({
+        deckId: 99,
+        sourceLibraryItemId: 5,
+        sourceFormat: "pptx",
+        conversionStatus: "done",
+        partialFidelity: true,
+        fidelityWarnings: ["font not supported"],
+      }),
+    );
+  });
+
+  it("updates presentationConversionRecords with deckId, deckLibraryItemId, status='done', progress=100", async () => {
+    const { db, mocks } = makeMockDb(42, 99);
+    mockGetDb.mockResolvedValue(db);
+
+    await createDeckFromImportResult(BASE_PARAMS);
+
+    expect(mocks.update).toHaveBeenCalledWith("presentationConversionRecords");
+    expect(mocks.updateSet).toHaveBeenCalledWith(
+      expect.objectContaining({
+        deckId: 99,
+        deckLibraryItemId: 42,
+        status: "done",
+        progress: 100,
+      }),
+    );
+  });
+
+  it("truncates slides to 200 when more than 200 slides are provided", async () => {
+    const { db } = makeMockDb();
+    mockGetDb.mockResolvedValue(db);
+
+    const slides = Array.from({ length: 250 }, (_, i) => ({ idx: i }));
+    await createDeckFromImportResult({ ...BASE_PARAMS, slides });
+
+    expect(mockAddSlide).toHaveBeenCalledTimes(200);
+    expect(mockDebugLog).toHaveBeenCalledWith(
+      "presentationImportService",
+      "slides truncated",
+      expect.objectContaining({ original: 250, truncated: 200 }),
+    );
+  });
+
+  it("returns { deckLibraryItemId } on success", async () => {
+    const { db } = makeMockDb(42);
+    mockGetDb.mockResolvedValue(db);
+
+    const result = await createDeckFromImportResult(BASE_PARAMS);
+    expect(result).toEqual({ deckLibraryItemId: 42 });
+  });
+});
diff --git a/apps/web/server/services/presentationImportService.ts b/apps/web/server/services/presentationImportService.ts
new file mode 100644
index 0000000..e5c2fb0
--- /dev/null
+++ b/apps/web/server/services/presentationImportService.ts
@@ -0,0 +1,109 @@
+import { eq } from "drizzle-orm";
+
+import { getDb } from "../db";
+import {
+  libraryItems,
+  presentationConversionRecords,
+  presentationSourceAttachments,
+} from "../../drizzle/schema";
+import {
+  createPresentationDeckForLibraryItem,
+  addSlideToDeck,
+  type PresentationActor,
+} from "./presentationService";
+import { debugLog, debugError } from "../_core/logger";
+
+export interface CreateDeckFromImportResultParams {
+  conversionId: number;
+  tenantId: string; // varchar(36), matches presentationConversionRecords.tenantId
+  userId: number;
+  slides: Record<string, unknown>[]; // raw PresentationSlideContent objects from Python
+  title: string;
+  fidelityWarnings: string[];
+  sourceFormat: string; // e.g. "pptx" or "google_slides"
+  sourceLibraryItemId?: number | null;
+}
+
+export async function createDeckFromImportResult(
+  params: CreateDeckFromImportResultParams,
+): Promise<{ deckLibraryItemId: number }> {
+  // Step 1: Build actor from stored DB values (never from callback request body)
+  const actor: PresentationActor = {
+    userId: params.userId,
+    tenantId: params.tenantId,
+    role: "user",
+  };
+
+  const db = await getDb();
+  if (!db) {
+    throw new Error("Database not available");
+  }
+
+  // Step 2: Insert library item with itemType='presentation', source='import'
+  const [libraryItem] = await db
+    .insert(libraryItems)
+    .values({
+      tenantId: params.tenantId,
+      ownerUserId: params.userId,
+      itemType: "presentation",
+      source: "import",
+      title: params.title,
+      status: "ready",
+      visibility: "private",
+      metadata: {},
+    })
+    .returning({ id: libraryItems.id });
+  const libraryItemId = libraryItem.id;
+
+  // Step 3: Create the presentation deck (calls resolveReadableLibraryItem internally,
+  // so the library item must already exist with status='ready' and visibility='private')
+  const { deck } = await createPresentationDeckForLibraryItem(
+    { libraryItemId, title: params.title },
+    actor,
+  );
+  const deckId = deck.id;
+
+  // Step 4: Enforce slide limit — truncate silently, log warning
+  const slides =
+    params.slides.length > 200 ? params.slides.slice(0, 200) : params.slides;
+  if (params.slides.length > 200) {
+    debugLog("presentationImportService", "slides truncated", {
+      conversionId: params.conversionId,
+      original: params.slides.length,
+      truncated: 200,
+    });
+  }
+
+  // Step 5: Add slides sequentially (NOT parallel — addSlideToDeck uses optimistic locking
+  // via expectedVersion; each successful call increments the deck version)
+  let expectedVersion = 0;
+  for (const slideContent of slides) {
+    await addSlideToDeck({ deckId, expectedVersion, slideContent }, actor);
+    expectedVersion++;
+  }
+
+  // Step 6: Insert source attachment to record provenance
+  await db.insert(presentationSourceAttachments).values({
+    deckId,
+    sourceLibraryItemId: params.sourceLibraryItemId ?? null,
+    sourceFormat: params.sourceFormat,
+    conversionStatus: "done",
+    partialFidelity: params.fidelityWarnings.length > 0,
+    fidelityWarnings: params.fidelityWarnings,
+  });
+
+  // Step 7: Update conversion record to mark the job done with full FK pointers
+  await db
+    .update(presentationConversionRecords)
+    .set({
+      deckId,
+      deckLibraryItemId: libraryItemId,
+      status: "done",
+      progress: 100,
+      fidelityWarnings: params.fidelityWarnings,
+      updatedAt: new Date(),
+    })
+    .where(eq(presentationConversionRecords.id, params.conversionId));
+
+  return { deckLibraryItemId: libraryItemId };
+}
