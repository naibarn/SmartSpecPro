diff --git a/apps/web/server/routers/presentation.test.ts b/apps/web/server/routers/presentation.test.ts
index 244deed..4d546fe 100644
--- a/apps/web/server/routers/presentation.test.ts
+++ b/apps/web/server/routers/presentation.test.ts
@@ -28,6 +28,9 @@ const serviceMocks = vi.hoisted(() => ({
   updateSlideInDeck: vi.fn(),
   listPresentationVersionHistory: vi.fn(),
   restorePresentationVersion: vi.fn(),
+  getPresentationDeckByLibraryItem: vi.fn(),
+  updateSlideAudioTrack: vi.fn(),
+  updateDeckProjectAudioTrack: vi.fn(),
 }));
 
 const templateServiceMocks = vi.hoisted(() => ({
@@ -43,6 +46,7 @@ const playbackMocks = vi.hoisted(() => ({
   buildSlideshowPayload: vi.fn(),
   triggerPresentationExport: vi.fn(),
   getPresentationExportStatus: vi.fn(),
+  buildPlayDeckPayload: vi.fn(),
 }));
 
 vi.mock("../services/presentationService", async () => {
@@ -57,6 +61,9 @@ vi.mock("../services/presentationService", async () => {
     updateSlideInDeck: serviceMocks.updateSlideInDeck,
     listPresentationVersionHistory: serviceMocks.listPresentationVersionHistory,
     restorePresentationVersion: serviceMocks.restorePresentationVersion,
+    getPresentationDeckByLibraryItem: serviceMocks.getPresentationDeckByLibraryItem,
+    updateSlideAudioTrack: serviceMocks.updateSlideAudioTrack,
+    updateDeckProjectAudioTrack: serviceMocks.updateDeckProjectAudioTrack,
   };
 });
 
@@ -69,6 +76,7 @@ vi.mock("../services/presentationPlaybackExport", () => ({
   buildSlideshowPayload: playbackMocks.buildSlideshowPayload,
   triggerPresentationExport: playbackMocks.triggerPresentationExport,
   getPresentationExportStatus: playbackMocks.getPresentationExportStatus,
+  buildPlayDeckPayload: playbackMocks.buildPlayDeckPayload,
 }));
 
 vi.mock("../services/presentationTemplateService", () => ({
@@ -115,7 +123,7 @@ describe("presentationRouter", () => {
     });
     playbackMocks.triggerPresentationExport.mockResolvedValue({
       schemaVersion: "presentation_export_v1",
-      exportId: "exp-1",
+      exportId: 1,
       jobId: "job-1",
       deckId: 88,
       format: "mp4",
@@ -133,18 +141,44 @@ describe("presentationRouter", () => {
     });
     playbackMocks.getPresentationExportStatus.mockResolvedValue({
       schemaVersion: "presentation_export_v1",
-      exportId: "exp-1",
-      jobId: "job-1",
+      exportId: 1,
       status: "queued",
       format: "mp4",
+      progressPct: 0,
       updatedAt: new Date(),
     });
+    playbackMocks.buildPlayDeckPayload.mockResolvedValue({
+      schemaVersion: "presentation_slideshow_v1",
+      deckId: 88,
+      generatedAt: new Date(),
+      slides: [],
+    });
     serviceMocks.listPresentationVersionHistory.mockResolvedValue([]);
     serviceMocks.restorePresentationVersion.mockResolvedValue({
       restoredSlideId: 71,
       restoredSlideVersion: 4,
       deckVersion: 9,
     });
+    serviceMocks.getPresentationDeckByLibraryItem.mockResolvedValue({
+      id: 88,
+      tenantId: "tenant-1",
+      libraryItemId: 42,
+      title: "Play Deck",
+      description: null,
+      version: 1,
+      slideCount: 0,
+      totalAssetBytes: 0,
+      projectAudioTrack: null,
+      createdAt: new Date(),
+      updatedAt: new Date(),
+    });
+    serviceMocks.getPresentationDeckDetail.mockResolvedValue({
+      deck: { id: 88, libraryItemId: 42 },
+      slides: [],
+      assets: [],
+    });
+    serviceMocks.updateSlideAudioTrack.mockResolvedValue({ deckVersion: 2, slideVersion: 3 });
+    serviceMocks.updateDeckProjectAudioTrack.mockResolvedValue({ deckVersion: 2 });
   });
 
   it("returns disabled availability when feature flag is off", async () => {
@@ -564,6 +598,247 @@ describe("presentationRouter", () => {
       { userId: 77, tenantId: "tenant-1", role: "user" },
     );
   });
+
+  // --- triggerExport extended format ---
+
+  it("triggerExport accepts format: 'jpg' and passes it to service", async () => {
+    const fn = presentationRouter.triggerExport as Function;
+    await fn({
+      ctx: { tenantId: "tenant-1", user: { id: 10, role: "user" } },
+      input: { deckId: 88, format: "jpg", idempotencyKey: "key-jpg-1" },
+    });
+
+    expect(playbackMocks.triggerPresentationExport).toHaveBeenCalledWith(
+      expect.objectContaining({ format: "jpg" }),
+      expect.any(Object),
+    );
+  });
+
+  it("triggerExport accepts format: 'pdf' and passes it to service", async () => {
+    const fn = presentationRouter.triggerExport as Function;
+    await fn({
+      ctx: { tenantId: "tenant-1", user: { id: 10, role: "user" } },
+      input: { deckId: 88, format: "pdf", idempotencyKey: "key-pdf-1" },
+    });
+
+    expect(playbackMocks.triggerPresentationExport).toHaveBeenCalledWith(
+      expect.objectContaining({ format: "pdf" }),
+      expect.any(Object),
+    );
+  });
+
+  it("triggerExport passes quality to service layer", async () => {
+    const fn = presentationRouter.triggerExport as Function;
+    await fn({
+      ctx: { tenantId: "tenant-1", user: { id: 10, role: "user" } },
+      input: { deckId: 88, format: "mp4", quality: "high", idempotencyKey: "key-quality-1" },
+    });
+
+    expect(playbackMocks.triggerPresentationExport).toHaveBeenCalledWith(
+      expect.objectContaining({ quality: "high" }),
+      expect.any(Object),
+    );
+  });
+
+  // --- getExportStatus output extension ---
+
+  it("getExportStatus returns progressPct and stage fields", async () => {
+    playbackMocks.getPresentationExportStatus.mockResolvedValue({
+      schemaVersion: "presentation_export_v1",
+      exportId: 5,
+      status: "processing",
+      format: "mp4",
+      progressPct: 42,
+      stage: "Rendering slide 3 of 10",
+      updatedAt: new Date(),
+    });
+
+    const fn = presentationRouter.getExportStatus as Function;
+    const result = await fn({
+      ctx: { tenantId: "tenant-1", user: { id: 10, role: "user" } },
+      input: { exportId: 5 },
+    });
+
+    expect(result.progressPct).toBe(42);
+    expect(result.stage).toBe("Rendering slide 3 of 10");
+  });
+
+  it("getExportStatus returns downloadUrl when status is done", async () => {
+    playbackMocks.getPresentationExportStatus.mockResolvedValue({
+      schemaVersion: "presentation_export_v1",
+      exportId: 5,
+      status: "done",
+      format: "mp4",
+      progressPct: 100,
+      downloadUrl: "https://cdn.example.com/out.mp4",
+      updatedAt: new Date(),
+    });
+
+    const fn = presentationRouter.getExportStatus as Function;
+    const result = await fn({
+      ctx: { tenantId: "tenant-1", user: { id: 10, role: "user" } },
+      input: { exportId: 5 },
+    });
+
+    expect(result.downloadUrl).toBe("https://cdn.example.com/out.mp4");
+    expect(result.status).toBe("done");
+  });
+
+  // --- setSlideAudio ---
+
+  it("setSlideAudio stores audio track on slide via service", async () => {
+    const fn = presentationRouter.setSlideAudio as Function;
+    const result = await fn({
+      ctx: { tenantId: "tenant-1", user: { id: 10, role: "user" } },
+      input: {
+        deckId: 88,
+        slideId: 10,
+        expectedVersion: 3,
+        audioTrack: { libraryItemId: 5, volume: 0.8, startAtMs: 0 },
+      },
+    });
+
+    expect(serviceMocks.updateSlideAudioTrack).toHaveBeenCalledWith(
+      {
+        deckId: 88,
+        slideId: 10,
+        expectedVersion: 3,
+        audioTrack: { libraryItemId: 5, volume: 0.8, startAtMs: 0 },
+      },
+      { userId: 10, tenantId: "tenant-1", role: "user" },
+    );
+    expect(result.deckVersion).toBe(2);
+    expect(result.slideVersion).toBe(3);
+  });
+
+  it("setSlideAudio with null audioTrack removes existing audio track", async () => {
+    const fn = presentationRouter.setSlideAudio as Function;
+    await fn({
+      ctx: { tenantId: "tenant-1", user: { id: 10, role: "user" } },
+      input: { deckId: 88, slideId: 10, expectedVersion: 3, audioTrack: null },
+    });
+
+    expect(serviceMocks.updateSlideAudioTrack).toHaveBeenCalledWith(
+      expect.objectContaining({ audioTrack: null }),
+      expect.any(Object),
+    );
+  });
+
+  it("setSlideAudio requires tenant context", async () => {
+    const fn = presentationRouter.setSlideAudio as Function;
+    await expect(
+      fn({
+        ctx: { tenantId: null, user: { id: 1 } },
+        input: { deckId: 88, slideId: 10, expectedVersion: 3, audioTrack: null },
+      }),
+    ).rejects.toMatchObject({ message: "Tenant context is required for presentation operations" });
+  });
+
+  it("setSlideAudio maps VERSION_CONFLICT to CONFLICT tRPC error", async () => {
+    serviceMocks.updateSlideAudioTrack.mockRejectedValue(
+      new PresentationServiceError(
+        PRESENTATION_ERROR_CODE.VERSION_CONFLICT,
+        `${PRESENTATION_ERROR_CODE.VERSION_CONFLICT}: deck version mismatch`,
+      ),
+    );
+
+    const fn = presentationRouter.setSlideAudio as Function;
+    await expect(
+      fn({
+        ctx: { tenantId: "tenant-1", user: { id: 10, role: "user" } },
+        input: { deckId: 88, slideId: 10, expectedVersion: 2, audioTrack: null },
+      }),
+    ).rejects.toSatisfy((err: unknown) => err instanceof TRPCError && err.code === "CONFLICT");
+  });
+
+  // --- setDeckAudio ---
+
+  it("setDeckAudio stores project audio track on deck via service", async () => {
+    const fn = presentationRouter.setDeckAudio as Function;
+    const result = await fn({
+      ctx: { tenantId: "tenant-1", user: { id: 10, role: "user" } },
+      input: {
+        deckId: 88,
+        expectedVersion: 3,
+        projectAudioTrack: { libraryItemId: 7, volume: 0.5, loop: true },
+      },
+    });
+
+    expect(serviceMocks.updateDeckProjectAudioTrack).toHaveBeenCalledWith(
+      {
+        deckId: 88,
+        expectedVersion: 3,
+        projectAudioTrack: { libraryItemId: 7, volume: 0.5, loop: true },
+      },
+      { userId: 10, tenantId: "tenant-1", role: "user" },
+    );
+    expect(result.deckVersion).toBe(2);
+  });
+
+  it("setDeckAudio with null removes project audio track", async () => {
+    const fn = presentationRouter.setDeckAudio as Function;
+    await fn({
+      ctx: { tenantId: "tenant-1", user: { id: 10, role: "user" } },
+      input: { deckId: 88, expectedVersion: 3, projectAudioTrack: null },
+    });
+
+    expect(serviceMocks.updateDeckProjectAudioTrack).toHaveBeenCalledWith(
+      expect.objectContaining({ projectAudioTrack: null }),
+      expect.any(Object),
+    );
+  });
+
+  // --- getPlayDeck ---
+
+  it("getPlayDeck returns deck with resolved audio via buildPlayDeckPayload", async () => {
+    const mockPayload = {
+      schemaVersion: "presentation_slideshow_v1",
+      deckId: 88,
+      generatedAt: new Date(),
+      slides: [
+        {
+          slideId: 1,
+          orderIndex: 0,
+          title: "Slide 1",
+          durationMs: 3000,
+          transition: "none",
+          audioTrack: { url: "https://cdn.example.com/audio.mp3", volume: 0.8, startAtMs: 0 },
+        },
+      ],
+    };
+    playbackMocks.buildPlayDeckPayload.mockResolvedValue(mockPayload);
+
+    const fn = presentationRouter.getPlayDeck as Function;
+    const result = await fn({
+      ctx: { tenantId: "tenant-1", user: { id: 10, role: "user" } },
+      input: { itemId: 42 },
+    });
+
+    expect(playbackMocks.buildPlayDeckPayload).toHaveBeenCalled();
+    expect(result.slides[0].audioTrack?.url).toBe("https://cdn.example.com/audio.mp3");
+  });
+
+  it("getPlayDeck requires tenant context", async () => {
+    const fn = presentationRouter.getPlayDeck as Function;
+    await expect(
+      fn({
+        ctx: { tenantId: null, user: { id: 1 } },
+        input: { itemId: 42 },
+      }),
+    ).rejects.toMatchObject({ message: "Tenant context is required for presentation operations" });
+  });
+
+  it("getPlayDeck throws NOT_FOUND when deck does not exist for library item", async () => {
+    serviceMocks.getPresentationDeckByLibraryItem.mockResolvedValue(null);
+
+    const fn = presentationRouter.getPlayDeck as Function;
+    await expect(
+      fn({
+        ctx: { tenantId: "tenant-1", user: { id: 10, role: "user" } },
+        input: { itemId: 99 },
+      }),
+    ).rejects.toSatisfy((err: unknown) => err instanceof TRPCError && err.code === "NOT_FOUND");
+  });
 });
 
 describe("presentation router registration", () => {
diff --git a/apps/web/server/routers/presentation.ts b/apps/web/server/routers/presentation.ts
index affccf8..143f584 100644
--- a/apps/web/server/routers/presentation.ts
+++ b/apps/web/server/routers/presentation.ts
@@ -14,6 +14,8 @@ import {
   presentationSlideContentSchema,
   presentationRouteGuardInputSchema,
   presentationRouteGuardResultSchema,
+  audioTrackInputSchema,
+  projectAudioTrackInputSchema,
   type PresentationAvailability,
   type PresentationRouteBlockedResult,
   type PresentationRouteGuardResult,
@@ -39,12 +41,15 @@ import {
   restorePresentationVersion,
   updatePresentationDeckMetadata,
   updateSlideInDeck,
+  updateSlideAudioTrack,
+  updateDeckProjectAudioTrack,
 } from "../services/presentationService";
 import {
   convertOfficeSourceToPresentation,
   getPresentationCompatibilityOpen,
 } from "../services/presentationCompatibilityService";
 import {
+  buildPlayDeckPayload,
   buildSlideshowPayload,
   getPresentationExportStatus,
   triggerPresentationExport,
@@ -630,6 +635,67 @@ export const presentationRouter = router({
       }
     }),
 
+  setSlideAudio: protectedProcedure
+    .input(z.object({
+      deckId: z.number().int().positive(),
+      slideId: z.number().int().positive(),
+      expectedVersion: z.number().int().nonnegative(),
+      audioTrack: audioTrackInputSchema.nullable(),
+    }))
+    .mutation(async ({ input, ctx }) => {
+      try {
+        ensureFeatureEnabled();
+        return await updateSlideAudioTrack(input, toPresentationActor(ctx));
+      } catch (error) {
+        if (error instanceof PresentationServiceError) {
+          throw mapPresentationServiceError(error);
+        }
+        throw error;
+      }
+    }),
+
+  setDeckAudio: protectedProcedure
+    .input(z.object({
+      deckId: z.number().int().positive(),
+      expectedVersion: z.number().int().nonnegative(),
+      projectAudioTrack: projectAudioTrackInputSchema.nullable(),
+    }))
+    .mutation(async ({ input, ctx }) => {
+      try {
+        ensureFeatureEnabled();
+        return await updateDeckProjectAudioTrack(input, toPresentationActor(ctx));
+      } catch (error) {
+        if (error instanceof PresentationServiceError) {
+          throw mapPresentationServiceError(error);
+        }
+        throw error;
+      }
+    }),
+
+  getPlayDeck: protectedProcedure
+    .input(z.object({ itemId: z.number().int().positive() }))
+    .query(async ({ input, ctx }) => {
+      try {
+        ensureFeatureEnabled();
+        const actor = toPresentationActor(ctx);
+        const deck = await getPresentationDeckByLibraryItem(input.itemId, actor);
+        if (!deck) {
+          throw new PresentationServiceError(
+            PRESENTATION_ERROR_CODE.NOT_FOUND,
+            `${PRESENTATION_ERROR_CODE.NOT_FOUND}: no presentation deck for library item ${input.itemId}`,
+          );
+        }
+        const detail = await getPresentationDeckDetail(deck.id, actor);
+        const slideshowPayload = buildSlideshowPayload(detail.slides, { deckId: detail.deck.id });
+        return await buildPlayDeckPayload(detail, slideshowPayload);
+      } catch (error) {
+        if (error instanceof PresentationServiceError) {
+          throw mapPresentationServiceError(error);
+        }
+        throw error;
+      }
+    }),
+
   guardEditorOpen: protectedProcedure
     .input(presentationRouteGuardInputSchema)
     .query(({ input }): PresentationRouteGuardResult => {
diff --git a/apps/web/server/services/presentationPlaybackExport.ts b/apps/web/server/services/presentationPlaybackExport.ts
index ce6a6d6..110db7a 100644
--- a/apps/web/server/services/presentationPlaybackExport.ts
+++ b/apps/web/server/services/presentationPlaybackExport.ts
@@ -9,10 +9,12 @@ import {
 import {
   presentationExportResultSchema,
   presentationExportStatusResultSchema,
+  presentationPlayDeckPayloadSchema,
   presentationRenderSpecSchema,
   presentationSlideshowPayloadSchema,
   type PresentationExportResult,
   type PresentationExportStatusResult,
+  type PresentationPlayDeckPayload,
   type PresentationRenderSpec,
   type PresentationSlideshowPayload,
   type ResolvedAudioTrack,
@@ -485,6 +487,81 @@ export function buildSlideshowPayload(
   });
 }
 
+/**
+ * Builds a PresentationPlayDeckPayload from a deck detail + slideshow payload.
+ * Resolves libraryItemId references in audio tracks to presigned S3/R2 URLs.
+ * Called by the getPlayDeck tRPC procedure for play mode.
+ * Falls back to returning the unmodified slideshow payload when no DB is available.
+ */
+export async function buildPlayDeckPayload(
+  detail: PresentationDeckDetail,
+  slideshowPayload: PresentationSlideshowPayload,
+): Promise<PresentationPlayDeckPayload> {
+  const db = await getDb();
+  if (!db) {
+    return presentationPlayDeckPayloadSchema.parse(slideshowPayload);
+  }
+
+  async function resolveUrl(sourceUrl: string | null): Promise<string | null> {
+    if (!sourceUrl) return null;
+    const presigned = await storagePresignGet(sourceUrl, 3600);
+    return presigned?.url ?? sourceUrl;
+  }
+
+  // Build lookup map for DB slides by primary key
+  const dbSlideMap = new Map(detail.slides.map((s) => [s.id, s]));
+
+  // Enrich each slideshow slide with resolved audio track from DB slide
+  const enrichedSlides = await Promise.all(
+    slideshowPayload.slides.map(async (slide) => {
+      const dbSlide = dbSlideMap.get(slide.slideId);
+      if (!dbSlide?.audioTrack) return slide;
+      // audioTrack in DB is SlideAudioTrackJson: { libraryItemId, volume, startAtMs, endAtMs }
+      const audioJson = dbSlide.audioTrack;
+      const [item] = await db
+        .select()
+        .from(libraryItems)
+        .where(eq(libraryItems.id, audioJson.libraryItemId))
+        .limit(1);
+      const url = await resolveUrl(item?.sourceUrl ?? null);
+      if (!url) return slide;
+      const resolved: ResolvedAudioTrack = {
+        url,
+        volume: audioJson.volume,
+        startAtMs: audioJson.startAtMs,
+        endAtMs: audioJson.endAtMs ?? undefined,
+      };
+      return { ...slide, audioTrack: resolved };
+    }),
+  );
+
+  // Resolve deck-level project audio track
+  let resolvedProjectAudioTrack: ResolvedProjectAudioTrack | null | undefined;
+  const dbProjectAudio = detail.deck.projectAudioTrack;
+  if (dbProjectAudio) {
+    const [item] = await db
+      .select()
+      .from(libraryItems)
+      .where(eq(libraryItems.id, dbProjectAudio.libraryItemId))
+      .limit(1);
+    const url = await resolveUrl(item?.sourceUrl ?? null);
+    if (url) {
+      resolvedProjectAudioTrack = {
+        url,
+        volume: dbProjectAudio.volume,
+        loop: dbProjectAudio.loop,
+        fadeOutMs: dbProjectAudio.fadeOutMs ?? undefined,
+      };
+    }
+  }
+
+  return presentationPlayDeckPayloadSchema.parse({
+    ...slideshowPayload,
+    slides: enrichedSlides,
+    ...(resolvedProjectAudioTrack !== undefined && { projectAudioTrack: resolvedProjectAudioTrack }),
+  });
+}
+
 export function buildPresentationRenderSpec(input: BuildRenderSpecInput): PresentationRenderSpec {
   const degraded = degradeSlidesForExport(input.slides, DEFAULT_DURATION_MS);
   const slideshowPayload = presentationSlideshowPayloadSchema.parse({
diff --git a/apps/web/server/services/presentationService.ts b/apps/web/server/services/presentationService.ts
index d1905fe..68575fb 100644
--- a/apps/web/server/services/presentationService.ts
+++ b/apps/web/server/services/presentationService.ts
@@ -42,6 +42,8 @@ import {
 import {
   presentationSlideContentSchema,
   presentationVersionConflictSchema,
+  type AudioTrackInput,
+  type ProjectAudioTrackInput,
   type PresentationVersionConflict,
 } from "@shared/presentation/contracts";
 import {
@@ -1442,3 +1444,108 @@ export async function createPresentationFromTemplate(
     dbClient,
   );
 }
+
+export interface UpdateSlideAudioTrackInput {
+  deckId: number;
+  slideId: number;
+  /** Deck version for optimistic locking — ensures no concurrent modification. */
+  expectedVersion: number;
+  audioTrack: AudioTrackInput | null;
+}
+
+/**
+ * Updates or clears the per-slide audio track configuration.
+ * Uses optimistic locking on the deck version: throws VERSION_CONFLICT if expectedVersion mismatches.
+ * Returns the updated deck and slide version numbers.
+ */
+export async function updateSlideAudioTrack(
+  input: UpdateSlideAudioTrackInput,
+  actor: PresentationActor,
+  dbClient?: DbClient,
+): Promise<{ deckVersion: number; slideVersion: number }> {
+  const { deck, db } = await resolveDeckContext(input.deckId, actor, { write: true }, dbClient);
+  ensureExpectedDeckVersion(deck, input.expectedVersion);
+
+  const currentSlide = await getSlideById(input.slideId, input.deckId, db);
+  if (!currentSlide) {
+    throw new PresentationServiceError(
+      PRESENTATION_ERROR_CODE.NOT_FOUND,
+      `${PRESENTATION_ERROR_CODE.NOT_FOUND}: slide ${input.slideId} not found in deck ${input.deckId}`,
+    );
+  }
+
+  const newSlideVersion = currentSlide.version + 1;
+  const newDeckVersion = deck.version + 1;
+
+  const slideRows = await db
+    .update(presentationSlides)
+    .set({
+      audioTrack: input.audioTrack as any,
+      version: newSlideVersion,
+      updatedAt: new Date(),
+    })
+    .where(and(
+      eq(presentationSlides.id, input.slideId),
+      eq(presentationSlides.deckId, input.deckId),
+    ))
+    .returning({ version: presentationSlides.version });
+
+  if (!slideRows[0]) {
+    throw new PresentationServiceError(
+      PRESENTATION_ERROR_CODE.NOT_FOUND,
+      `${PRESENTATION_ERROR_CODE.NOT_FOUND}: slide ${input.slideId} not found`,
+    );
+  }
+
+  await db
+    .update(presentationDecks)
+    .set({ version: newDeckVersion, updatedAt: new Date() })
+    .where(eq(presentationDecks.id, input.deckId));
+
+  return { deckVersion: newDeckVersion, slideVersion: slideRows[0].version };
+}
+
+export interface UpdateDeckProjectAudioTrackInput {
+  deckId: number;
+  /** Deck version for optimistic locking. */
+  expectedVersion: number;
+  projectAudioTrack: ProjectAudioTrackInput | null;
+}
+
+/**
+ * Updates or clears the deck-level project audio track.
+ * Uses optimistic locking: throws VERSION_CONFLICT if expectedVersion mismatches.
+ * Returns the updated deck version number.
+ */
+export async function updateDeckProjectAudioTrack(
+  input: UpdateDeckProjectAudioTrackInput,
+  actor: PresentationActor,
+  dbClient?: DbClient,
+): Promise<{ deckVersion: number }> {
+  const { deck, db } = await resolveDeckContext(input.deckId, actor, { write: true }, dbClient);
+  ensureExpectedDeckVersion(deck, input.expectedVersion);
+
+  const newDeckVersion = deck.version + 1;
+
+  const rows = await db
+    .update(presentationDecks)
+    .set({
+      projectAudioTrack: input.projectAudioTrack as any,
+      version: newDeckVersion,
+      updatedAt: new Date(),
+    })
+    .where(and(
+      eq(presentationDecks.id, input.deckId),
+      eq(presentationDecks.tenantId, actor.tenantId),
+    ))
+    .returning({ version: presentationDecks.version });
+
+  if (!rows[0]) {
+    throw new PresentationServiceError(
+      PRESENTATION_ERROR_CODE.NOT_FOUND,
+      `${PRESENTATION_ERROR_CODE.NOT_FOUND}: deck ${input.deckId} not found`,
+    );
+  }
+
+  return { deckVersion: rows[0].version };
+}
