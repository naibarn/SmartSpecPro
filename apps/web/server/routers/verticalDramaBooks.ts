import { createHash, randomUUID } from "node:crypto";
import { TRPCError } from "@trpc/server";
import { and, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";

import { mediaAssets, verticalDramaBookExportArtifacts, verticalDramaBookRevisions, verticalDramaBooks, workerJobs } from "../../drizzle/schema";
import { verticalDramaBookDocumentSchema, verticalDramaBookImageDensitySchema } from "../../shared/verticalDramaSeries/bookDocument";
import { db } from "../db";
import { protectedProcedure, router } from "../_core/trpc";
import { requireFeatureFlag } from "../middleware/requireFeatureFlag";
import { captureOwnedVerticalDramaBookSource } from "../services/verticalDramaBookSourceService";
import { assertAllShotImageCoverage } from "../services/verticalDramaBookSnapshot";
import { fingerprintBookSource } from "../services/verticalDramaBookSnapshot";
import { createFeature186VerticalDramaJobRef } from "../services/feature186VerticalDramaJobAdapter";
import { storageGet } from "../storage";
import { cancelQueuedUserWorkerJob } from "../services/workerJobMonitorService";
import { getCreditBalance } from "../services/creditService";

const bookProcedure = protectedProcedure.use(requireFeatureFlag("verticalDramaSeries"));

function owner(ctx: { tenantId: string | null; user: { id: number } }) {
  if (!ctx.tenantId) throw new TRPCError({ code: "FORBIDDEN", message: "Book Studio requires a tenant workspace." });
  return { tenantId: ctx.tenantId, userId: ctx.user.id };
}

function notFound(): never {
  throw new TRPCError({ code: "NOT_FOUND", message: "Book not found." });
}

function documentAssetSelections(document: { metadata: { coverMediaAssetId?: number | null }; chapters: Array<{ blocks: Array<{ type: string; mediaAssetId?: number }> }> }) {
  const assets = new Map<number, "cover" | "shot">();
  const coverId = document.metadata.coverMediaAssetId;
  if (coverId) assets.set(coverId, "cover");
  for (const chapter of document.chapters) {
    for (const block of chapter.blocks) {
      if (block.type === "illustration" && block.mediaAssetId) assets.set(block.mediaAssetId, "shot");
    }
  }
  return [...assets].map(([id, purpose]) => ({ id, purpose }));
}

function assertDocumentBoundToSnapshot(document: z.infer<typeof verticalDramaBookDocumentSchema>, snapshot: { assets: Array<{ mediaAssetId: number; checksum: string }>; episodes: Array<{ episodeId: number; episodeRevisionId: number | null; revisionFingerprint: string }> }, selectedEpisodeIds: number[]) {
  const allowedEpisodes = new Set(selectedEpisodeIds);
  const pinnedAssets = new Map(snapshot.assets.map(asset => [asset.mediaAssetId, asset.checksum]));
  const pinnedEpisodes = new Map(snapshot.episodes.map(episode => [episode.episodeId, episode]));
  if (document.source.episodeIds.length !== selectedEpisodeIds.length || new Set(document.source.episodeIds).size !== selectedEpisodeIds.length || document.source.episodeIds.some(id => !allowedEpisodes.has(id))) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Book chapters do not match the selected episode set." });
  }
  const chapterSources = document.chapters.flatMap(chapter => chapter.sourceEpisodeIds);
  if (selectedEpisodeIds.some(id => !chapterSources.includes(id)) || chapterSources.some(id => !allowedEpisodes.has(id))) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Every selected episode must remain linked to at least one book chapter." });
  }
  const coverId = document.metadata.coverMediaAssetId;
  if (coverId && (!pinnedAssets.has(coverId) || pinnedAssets.get(coverId) !== document.metadata.coverChecksum)) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "The selected cover image is no longer available." });
  }
  for (const chapter of document.chapters) {
    const chapterSources = new Set(chapter.sourceEpisodeIds);
    if (!chapter.sourceEpisodeIds.length || chapter.sourceEpisodeIds.some(id => !allowedEpisodes.has(id))) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Chapter source references are invalid." });
    }
    for (const block of chapter.blocks) {
      if (block.sourceRefs.some(ref => !allowedEpisodes.has(ref.episodeId) || !chapterSources.has(ref.episodeId))) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Book provenance references are invalid." });
      }
      if (block.sourceRefs.some(ref => {
        const episode = pinnedEpisodes.get(ref.episodeId);
        return !episode || ref.sourceHash !== episode.revisionFingerprint || ref.episodeRevisionId !== episode.episodeRevisionId || !ref.locator.startsWith(`episode:${ref.episodeId}/`);
      })) throw new TRPCError({ code: "BAD_REQUEST", message: "Book provenance does not match the pinned episode source." });
      if (block.type === "illustration" && pinnedAssets.get(block.mediaAssetId) !== block.mediaChecksum) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "An illustration is not part of the pinned source snapshot." });
      }
    }
  }
}

export const verticalDramaBooksRouter = router({
  availableAssets: bookProcedure.input(z.object({
    seriesId: z.number().int().positive(),
    episodeIds: z.array(z.number().int().positive()).min(1).max(100),
  })).query(async ({ ctx, input }) => {
    const actor = owner(ctx);
    const source = await captureOwnedVerticalDramaBookSource({ ...actor, seriesId: input.seriesId, episodeIds: input.episodeIds });
    const assetIds = source.snapshot.assets.map(asset => asset.mediaAssetId);
    const rows = assetIds.length ? await db.select({
      id: mediaAssets.id,
      storageKey: mediaAssets.storageKey,
      thumbnailUrl: mediaAssets.thumbnailUrl,
      originalUrl: mediaAssets.originalUrl,
      fileSize: mediaAssets.fileSize,
    }).from(mediaAssets).where(and(
      eq(mediaAssets.tenantId, actor.tenantId), eq(mediaAssets.userId, actor.userId),
      inArray(mediaAssets.id, assetIds),
    )) : [];
    const byId = new Map(rows.map(row => [row.id, row]));
    const assets = source.snapshot.assets.flatMap(asset => {
      const row = byId.get(asset.mediaAssetId);
      if (!row) return [];
      const url = row.storageKey ? `/api/storage/files/${encodeURI(row.storageKey)}` : row.thumbnailUrl ?? row.originalUrl;
      const sourceRefs = source.snapshot.episodes.flatMap(episode => episode.shots.filter(shot => shot.mediaAssetId === asset.mediaAssetId).map(shot => ({
        episodeId: episode.episodeId,
        episodeRevisionId: episode.episodeRevisionId,
        locator: shot.locator,
        sourceHash: episode.revisionFingerprint,
      })));
      return [{ mediaAssetId: asset.mediaAssetId, checksum: asset.checksum, purpose: asset.purpose, fileSize: row.fileSize ?? 0, url, sourceRefs }];
    });
    return { assets, imageCoverage: source.imageCoverage };
  }),

  list: bookProcedure.input(z.object({ seriesId: z.number().int().positive() })).query(async ({ ctx, input }) => {
    const actor = owner(ctx);
    const books = await db.select().from(verticalDramaBooks).where(and(
      eq(verticalDramaBooks.tenantId, actor.tenantId),
      eq(verticalDramaBooks.userId, actor.userId),
      eq(verticalDramaBooks.seriesId, input.seriesId),
    )).orderBy(desc(verticalDramaBooks.updatedAt));
    return books.map(book => ({ id: book.id, seriesId: book.seriesId, title: book.title, metadata: book.metadata, currentRevisionNumber: book.currentRevisionNumber, stale: Boolean(book.staleAt), updatedAt: book.updatedAt }));
  }),

  get: bookProcedure.input(z.object({ bookId: z.number().int().positive() })).query(async ({ ctx, input }) => {
    const actor = owner(ctx);
    const [book] = await db.select().from(verticalDramaBooks).where(and(
      eq(verticalDramaBooks.id, input.bookId), eq(verticalDramaBooks.tenantId, actor.tenantId), eq(verticalDramaBooks.userId, actor.userId),
    )).limit(1);
    if (!book) notFound();
    const revisionRows = await db.select().from(verticalDramaBookRevisions).where(and(
      eq(verticalDramaBookRevisions.bookId, book.id), eq(verticalDramaBookRevisions.tenantId, actor.tenantId), eq(verticalDramaBookRevisions.userId, actor.userId),
    )).orderBy(desc(verticalDramaBookRevisions.revisionNumber));
    const exportRows = await db.select().from(verticalDramaBookExportArtifacts).where(and(
      eq(verticalDramaBookExportArtifacts.bookId, book.id), eq(verticalDramaBookExportArtifacts.tenantId, actor.tenantId), eq(verticalDramaBookExportArtifacts.userId, actor.userId),
    )).orderBy(desc(verticalDramaBookExportArtifacts.createdAt));
    const selectedEpisodeIds = (book.sourceSelection as { episodeIds?: unknown }).episodeIds;
    let sourceStale = Boolean(book.staleAt);
    if (Array.isArray(selectedEpisodeIds)) {
      try {
        const currentSource = await captureOwnedVerticalDramaBookSource({ ...actor, seriesId: book.seriesId, episodeIds: selectedEpisodeIds.map(Number) });
        sourceStale ||= currentSource.sourceContentFingerprint !== book.sourceFingerprint;
      } catch {
        sourceStale = true;
      }
    } else sourceStale = true;
    const revisions = revisionRows.map(revision => ({ id: revision.id, revisionNumber: revision.revisionNumber, status: revision.status, document: revision.document, approvedAt: revision.approvedAt, createdAt: revision.createdAt }));
    const exports = exportRows.map(artifact => ({ id: artifact.id, revisionId: artifact.revisionId, format: artifact.format, status: artifact.status, checksumSha256: artifact.checksumSha256, sizeBytes: artifact.sizeBytes, validation: artifact.validation, errorCode: artifact.errorCode, createdAt: artifact.createdAt, updatedAt: artifact.updatedAt }));
    return { book: { id: book.id, seriesId: book.seriesId, title: book.title, metadata: book.metadata, sourceSelection: book.sourceSelection, currentRevisionNumber: book.currentRevisionNumber, stale: sourceStale, updatedAt: book.updatedAt }, revisions, exports };
  }),

  create: bookProcedure.input(z.object({
    seriesId: z.number().int().positive(),
    episodeIds: z.array(z.number().int().positive()).min(1).max(100),
    title: z.string().trim().min(1).max(255),
    author: z.string().trim().min(1).max(255),
    coverMediaAssetId: z.number().int().positive().nullable().optional(),
    coverAltText: z.string().max(2000).nullable().optional(),
    subtitle: z.string().max(255).nullable().optional(),
    description: z.string().max(5000).nullable().optional(),
    copyrightText: z.string().max(3000).nullable().optional(),
    imageDensity: verticalDramaBookImageDensitySchema.default("occasional"),
  })).mutation(async ({ ctx, input }) => {
    const actor = owner(ctx);
    let source;
    try {
      source = await captureOwnedVerticalDramaBookSource({
        ...actor,
        seriesId: input.seriesId,
        episodeIds: input.episodeIds,
        additionalAssetIds: input.coverMediaAssetId ? [{ id: input.coverMediaAssetId, purpose: "cover" }] : [],
      });
      if (input.imageDensity === "all_shots") assertAllShotImageCoverage(source);
    } catch (error) {
      const code = error instanceof Error ? error.message : "BOOK_SOURCE_INVALID";
      if (code === "BOOK_SERIES_NOT_FOUND" || code === "BOOK_SOURCE_EPISODE_NOT_FOUND") notFound();
      if (code === "BOOK_ALL_SHOTS_IMAGE_COVERAGE_INCOMPLETE") {
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Some selected storyboard shots do not have an available approved image.", cause: { coverage: source?.imageCoverage } });
      }
      throw new TRPCError({ code: "BAD_REQUEST", message: "Selected episodes could not be prepared for Book Studio." });
    }

    const bookDocument = verticalDramaBookDocumentSchema.parse({
      schemaVersion: 1,
      metadata: {
        title: input.title,
        subtitle: input.subtitle ?? null,
        author: input.author,
        language: source.snapshot.seriesPayload.locale ?? "th",
        description: input.description ?? null,
        copyrightText: input.copyrightText ?? null,
        coverMediaAssetId: input.coverMediaAssetId ?? null,
        coverChecksum: input.coverMediaAssetId ? source.snapshot.assets.find(asset => asset.mediaAssetId === input.coverMediaAssetId)?.checksum ?? null : null,
        coverAltText: input.coverMediaAssetId ? input.coverAltText?.trim() || "Book cover" : null,
      },
      source: { seriesId: input.seriesId, sourceFingerprint: source.fingerprint, episodeIds: input.episodeIds },
      chapters: source.snapshot.episodes.map(episode => ({
        id: `chapter-${episode.episodeId}`,
        title: String(episode.payload.title ?? `Chapter ${episode.episodeId}`),
        sourceEpisodeIds: [episode.episodeId],
        blocks: [{ id: `chapter-${episode.episodeId}-opening`, type: "paragraph", text: "", sourceRefs: [] }],
      })),
    });
    const documentFingerprint = fingerprintBookSource(bookDocument);
    const { book, revision } = await db.transaction(async tx => {
      const [createdBook] = await tx.insert(verticalDramaBooks).values({
        ...actor,
        seriesId: input.seriesId,
        title: input.title,
        metadata: { ...bookDocument.metadata, imageDensity: input.imageDensity },
        sourceSelection: { episodeIds: input.episodeIds, imageDensity: input.imageDensity },
        currentRevisionNumber: 1,
        sourceFingerprint: source.sourceContentFingerprint,
      }).returning();
      const [createdRevision] = await tx.insert(verticalDramaBookRevisions).values({
        ...actor,
        seriesId: input.seriesId,
        bookId: createdBook.id,
        revisionNumber: 1,
        status: "draft",
        schemaVersion: 1,
        document: bookDocument,
        sourceSnapshot: source.snapshot,
        sourceFingerprint: source.fingerprint,
        documentFingerprint,
      }).returning();
      return { book: createdBook, revision: createdRevision };
    });
    return {
      book: { id: book.id, seriesId: book.seriesId, title: book.title, metadata: book.metadata, currentRevisionNumber: book.currentRevisionNumber },
      revision: { id: revision.id, revisionNumber: revision.revisionNumber, status: revision.status, document: revision.document },
      imageCoverage: source.imageCoverage,
    };
  }),

  saveRevision: bookProcedure.input(z.object({
    bookId: z.number().int().positive(),
    document: z.unknown(),
  })).mutation(async ({ ctx, input }) => {
    const actor = owner(ctx);
    const parsed = verticalDramaBookDocumentSchema.safeParse(input.document);
    if (!parsed.success) throw new TRPCError({ code: "BAD_REQUEST", message: "Book content needs correction before it can be saved." });
    const [book] = await db.select().from(verticalDramaBooks).where(and(
      eq(verticalDramaBooks.id, input.bookId), eq(verticalDramaBooks.tenantId, actor.tenantId), eq(verticalDramaBooks.userId, actor.userId),
    )).limit(1);
    if (!book) notFound();
    const episodeIds = (book.sourceSelection as { episodeIds?: unknown }).episodeIds;
    if (!Array.isArray(episodeIds) || parsed.data.source.seriesId !== book.seriesId) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Book source selection is invalid." });
    }
    const source = await captureOwnedVerticalDramaBookSource({
      ...actor,
      seriesId: book.seriesId,
      episodeIds: episodeIds.map(Number),
      additionalAssetIds: documentAssetSelections(parsed.data),
    });
    assertDocumentBoundToSnapshot(parsed.data, source.snapshot, episodeIds.map(Number));
    if (source.sourceContentFingerprint !== book.sourceFingerprint || parsed.data.source.seriesId !== book.seriesId ||
        JSON.stringify(parsed.data.source.episodeIds) !== JSON.stringify(episodeIds.map(Number))) {
      await db.update(verticalDramaBooks).set({ staleAt: new Date(), updatedAt: new Date() }).where(and(
        eq(verticalDramaBooks.id, book.id), eq(verticalDramaBooks.tenantId, actor.tenantId), eq(verticalDramaBooks.userId, actor.userId),
      ));
      throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Episode sources changed. Refresh the book draft before saving." });
    }
    const revisionNumber = book.currentRevisionNumber + 1;
    const nextDocument = { ...parsed.data, source: { ...parsed.data.source, sourceFingerprint: source.fingerprint } };
    const revision = await db.transaction(async tx => {
      const [lockedBook] = await tx.select().from(verticalDramaBooks).where(and(
        eq(verticalDramaBooks.id, book.id), eq(verticalDramaBooks.tenantId, actor.tenantId), eq(verticalDramaBooks.userId, actor.userId),
      )).for("update").limit(1);
      if (!lockedBook || lockedBook.currentRevisionNumber !== book.currentRevisionNumber) throw new TRPCError({ code: "CONFLICT", message: "This book changed while the revision was being saved. Reload and try again." });
      const [created] = await tx.insert(verticalDramaBookRevisions).values({
        ...actor,
        seriesId: book.seriesId,
        bookId: book.id,
        revisionNumber,
        status: "draft",
        schemaVersion: 1,
        document: nextDocument,
        sourceSnapshot: source.snapshot,
        sourceFingerprint: source.fingerprint,
        documentFingerprint: fingerprintBookSource(nextDocument),
      }).returning();
      await tx.update(verticalDramaBooks).set({
        title: nextDocument.metadata.title,
        metadata: { ...(lockedBook.metadata as Record<string, unknown>), ...nextDocument.metadata },
        currentRevisionNumber: revisionNumber,
        updatedAt: new Date(),
      }).where(and(
        eq(verticalDramaBooks.id, book.id), eq(verticalDramaBooks.tenantId, actor.tenantId), eq(verticalDramaBooks.userId, actor.userId),
      ));
      return created;
    });
    return { id: revision.id, revisionNumber: revision.revisionNumber, status: revision.status, document: revision.document };
  }),

  compose: bookProcedure.input(z.object({ bookId: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
    const actor = owner(ctx);
    const [book] = await db.select().from(verticalDramaBooks).where(and(
      eq(verticalDramaBooks.id, input.bookId), eq(verticalDramaBooks.tenantId, actor.tenantId), eq(verticalDramaBooks.userId, actor.userId),
    )).limit(1);
    if (!book) notFound();
    const selected = (book.sourceSelection as { episodeIds?: unknown; imageDensity?: unknown }).episodeIds;
    const imageDensity = (book.sourceSelection as { imageDensity?: unknown }).imageDensity;
    if (!Array.isArray(selected) || !["none", "chapter_openers", "occasional", "all_shots"].includes(String(imageDensity))) notFound();
    const [baseRevision] = await db.select().from(verticalDramaBookRevisions).where(and(
      eq(verticalDramaBookRevisions.bookId, book.id), eq(verticalDramaBookRevisions.tenantId, actor.tenantId), eq(verticalDramaBookRevisions.userId, actor.userId), eq(verticalDramaBookRevisions.revisionNumber, book.currentRevisionNumber),
    )).limit(1);
    if (!baseRevision || baseRevision.status !== "draft") throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Save a draft revision before starting composition." });
    const document = verticalDramaBookDocumentSchema.parse(baseRevision.document);
    if (document.chapters.some(chapter => chapter.blocks.some(block => block.type !== "paragraph" || block.text.trim()))) {
      throw new TRPCError({ code: "PRECONDITION_FAILED", message: "This revision already contains authored text. Create a separate candidate before recomposing." });
    }
    const source = await captureOwnedVerticalDramaBookSource({
      ...actor,
      seriesId: book.seriesId,
      episodeIds: selected.map(Number),
      additionalAssetIds: documentAssetSelections(document),
    });
    if (source.sourceContentFingerprint !== book.sourceFingerprint) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Episode sources changed. Refresh the book before composing." });
    const estimatedCredits = document.chapters.length * 20;
    const creditBalance = await getCreditBalance(actor.userId);
    if (!creditBalance || Number(creditBalance.credits) < estimatedCredits) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "There are not enough credits for the estimated chapter composition cost." });
    if (imageDensity === "all_shots") {
      try { assertAllShotImageCoverage(source); } catch {
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Every selected storyboard shot needs an approved image for all-shot mode.", cause: { coverage: source.imageCoverage } });
      }
    }
    const revisionNumber = book.currentRevisionNumber + 1;
    const [candidate] = await db.insert(verticalDramaBookRevisions).values({
      ...actor,
      seriesId: book.seriesId,
      bookId: book.id,
      revisionNumber,
      status: "candidate",
      schemaVersion: 1,
      document: { ...document, source: { ...document.source, sourceFingerprint: source.fingerprint } },
      sourceSnapshot: source.snapshot,
      sourceFingerprint: source.fingerprint,
      documentFingerprint: baseRevision.documentFingerprint,
    }).returning();
    const jobId = randomUUID();
    try {
      await createFeature186VerticalDramaJobRef({
        jobId,
        tenantId: actor.tenantId,
        userId: actor.userId,
        jobType: "vertical_drama.book.compose",
        executionClass: "long",
        idempotencyKey: `vd:book-compose:${book.id}:${source.fingerprint}:${revisionNumber}`,
        activeDedupeKey: `vd:book-compose:active:${actor.tenantId}:${book.id}`,
        payload: { tenantId: actor.tenantId, userId: actor.userId, seriesId: book.seriesId, bookId: book.id, revisionId: candidate.id, imageDensity },
      });
    } catch {
      await db.delete(verticalDramaBookRevisions).where(and(
        eq(verticalDramaBookRevisions.id, candidate.id), eq(verticalDramaBookRevisions.tenantId, actor.tenantId), eq(verticalDramaBookRevisions.userId, actor.userId), eq(verticalDramaBookRevisions.status, "candidate"),
      ));
      throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Composition could not be queued. Please retry." });
    }
    await db.update(verticalDramaBooks).set({
      currentRevisionNumber: revisionNumber,
      sourceSelection: { ...book.sourceSelection as Record<string, unknown>, compositionJobId: jobId },
      updatedAt: new Date(),
    }).where(and(eq(verticalDramaBooks.id, book.id), eq(verticalDramaBooks.tenantId, actor.tenantId), eq(verticalDramaBooks.userId, actor.userId)));
    return { jobId, revisionId: candidate.id, revisionNumber, estimatedCredits };
  }),

  cancelComposition: bookProcedure.input(z.object({ bookId: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
    const actor = owner(ctx);
    const [book] = await db.select().from(verticalDramaBooks).where(and(
      eq(verticalDramaBooks.id, input.bookId), eq(verticalDramaBooks.tenantId, actor.tenantId), eq(verticalDramaBooks.userId, actor.userId),
    )).limit(1);
    if (!book) notFound();
    const jobId = (book.sourceSelection as { compositionJobId?: unknown }).compositionJobId;
    if (typeof jobId !== "string" || !jobId) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "No active composition job was found." });
    const cancelled = await cancelQueuedUserWorkerJob({ auth: actor, jobId });
    if (!cancelled.canceled) return { cancelled: false };
    await db.transaction(async tx => {
      const [candidate] = await tx.select().from(verticalDramaBookRevisions).where(and(
        eq(verticalDramaBookRevisions.bookId, book.id), eq(verticalDramaBookRevisions.tenantId, actor.tenantId), eq(verticalDramaBookRevisions.userId, actor.userId), eq(verticalDramaBookRevisions.revisionNumber, book.currentRevisionNumber), eq(verticalDramaBookRevisions.status, "candidate"),
      )).limit(1);
      if (candidate) {
        const document = verticalDramaBookDocumentSchema.parse(candidate.document);
        await tx.update(verticalDramaBookRevisions).set({ status: "draft", documentFingerprint: fingerprintBookSource(document) }).where(and(
        eq(verticalDramaBookRevisions.bookId, book.id), eq(verticalDramaBookRevisions.tenantId, actor.tenantId), eq(verticalDramaBookRevisions.userId, actor.userId), eq(verticalDramaBookRevisions.revisionNumber, book.currentRevisionNumber), eq(verticalDramaBookRevisions.status, "candidate"),
        ));
      }
      const selection = { ...book.sourceSelection as Record<string, unknown> };
      delete selection.compositionJobId;
      await tx.update(verticalDramaBooks).set({ sourceSelection: selection, updatedAt: new Date() }).where(and(
        eq(verticalDramaBooks.id, book.id), eq(verticalDramaBooks.tenantId, actor.tenantId), eq(verticalDramaBooks.userId, actor.userId),
      ));
    });
    return { cancelled: true };
  }),

  retryComposition: bookProcedure.input(z.object({ bookId: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
    const actor = owner(ctx);
    const [book] = await db.select().from(verticalDramaBooks).where(and(
      eq(verticalDramaBooks.id, input.bookId), eq(verticalDramaBooks.tenantId, actor.tenantId), eq(verticalDramaBooks.userId, actor.userId),
    )).limit(1);
    if (!book) notFound();
    const [revision] = await db.select().from(verticalDramaBookRevisions).where(and(
      eq(verticalDramaBookRevisions.bookId, book.id), eq(verticalDramaBookRevisions.tenantId, actor.tenantId), eq(verticalDramaBookRevisions.userId, actor.userId), eq(verticalDramaBookRevisions.revisionNumber, book.currentRevisionNumber), eq(verticalDramaBookRevisions.status, "candidate"),
    )).limit(1);
    if (!revision) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "There is no failed composition to retry." });
    const selected = (book.sourceSelection as { episodeIds?: unknown; imageDensity?: unknown }).episodeIds;
    const imageDensity = (book.sourceSelection as { imageDensity?: unknown }).imageDensity;
    if (!Array.isArray(selected) || !["none", "chapter_openers", "occasional", "all_shots"].includes(String(imageDensity))) notFound();
    const candidateDocument = verticalDramaBookDocumentSchema.parse(revision.document);
    const remainingChapters = candidateDocument.chapters.filter(chapter => !chapter.blocks.some(block => block.type !== "paragraph" || block.text.trim())).length;
    const estimatedCredits = remainingChapters * 20;
    const creditBalance = await getCreditBalance(actor.userId);
    if (!creditBalance || Number(creditBalance.credits) < estimatedCredits) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "There are not enough credits for the estimated remaining chapters." });
    const source = await captureOwnedVerticalDramaBookSource({ ...actor, seriesId: book.seriesId, episodeIds: selected.map(Number), additionalAssetIds: documentAssetSelections(candidateDocument) });
    if (source.sourceContentFingerprint !== book.sourceFingerprint || source.fingerprint !== revision.sourceFingerprint) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Episode or artwork sources changed. Create a new book from current episodes." });
    const jobId = randomUUID();
    await createFeature186VerticalDramaJobRef({
      jobId,
      tenantId: actor.tenantId,
      userId: actor.userId,
      jobType: "vertical_drama.book.compose",
      executionClass: "long",
      idempotencyKey: `vd:book-compose-retry:${revision.id}:${jobId}`,
      activeDedupeKey: `vd:book-compose:active:${actor.tenantId}:${book.id}`,
      payload: { tenantId: actor.tenantId, userId: actor.userId, seriesId: book.seriesId, bookId: book.id, revisionId: revision.id, imageDensity },
    });
    await db.update(verticalDramaBooks).set({ sourceSelection: { ...book.sourceSelection as Record<string, unknown>, compositionJobId: jobId }, updatedAt: new Date() }).where(and(
      eq(verticalDramaBooks.id, book.id), eq(verticalDramaBooks.tenantId, actor.tenantId), eq(verticalDramaBooks.userId, actor.userId),
    ));
    return { jobId, revisionId: revision.id, revisionNumber: revision.revisionNumber, estimatedCredits };
  }),

  export: bookProcedure.input(z.object({
    bookId: z.number().int().positive(),
    revisionId: z.number().int().positive(),
    formats: z.array(z.enum(["epub", "pdf"])).min(1).max(2),
  })).mutation(async ({ ctx, input }) => {
    const actor = owner(ctx);
    const [revision] = await db.select().from(verticalDramaBookRevisions).where(and(
      eq(verticalDramaBookRevisions.id, input.revisionId), eq(verticalDramaBookRevisions.bookId, input.bookId),
      eq(verticalDramaBookRevisions.tenantId, actor.tenantId), eq(verticalDramaBookRevisions.userId, actor.userId), eq(verticalDramaBookRevisions.status, "approved"),
    )).limit(1);
    if (!revision) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Approve a book revision before exporting." });
    const results = [];
    for (const format of [...new Set(input.formats)]) {
      const profileFingerprint = createHash("sha256").update(JSON.stringify({ format, version: 1, pageSize: format === "pdf" ? "A5" : "reflowable" })).digest("hex");
      const idempotencyKey = `vd-book:${actor.tenantId}:${revision.id}:${format}:${profileFingerprint}`;
      let [artifact] = await db.select().from(verticalDramaBookExportArtifacts).where(and(
        eq(verticalDramaBookExportArtifacts.tenantId, actor.tenantId), eq(verticalDramaBookExportArtifacts.idempotencyKey, idempotencyKey),
      )).limit(1);
      if (!artifact) {
        [artifact] = await db.insert(verticalDramaBookExportArtifacts).values({
          ...actor,
          seriesId: revision.seriesId,
          bookId: input.bookId,
          revisionId: revision.id,
          format,
          status: "queued",
          idempotencyKey,
          profileFingerprint,
        }).onConflictDoNothing().returning();
        if (!artifact) {
          [artifact] = await db.select().from(verticalDramaBookExportArtifacts).where(and(
            eq(verticalDramaBookExportArtifacts.tenantId, actor.tenantId), eq(verticalDramaBookExportArtifacts.idempotencyKey, idempotencyKey),
          )).limit(1);
        }
      }
      if (!artifact) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Export could not be queued." });
      if (artifact.status === "available") {
        results.push({ artifactId: artifact.id, format, status: artifact.status });
        continue;
      }
      if (["queued", "running", "validating"].includes(artifact.status) && artifact.jobId) {
        results.push({ artifactId: artifact.id, jobId: artifact.jobId, format, status: artifact.status });
        continue;
      }
      const attemptKey = artifact.updatedAt?.toISOString?.() ?? String(artifact.id);
      const jobId = randomUUID();
      const activeDedupeKey = `vd-book-export:active:${actor.tenantId}:${artifact.id}`;
      if (artifact.status === "failed" || artifact.status === "cancelled") {
        const [requeued] = await db.update(verticalDramaBookExportArtifacts).set({ status: "queued", jobId: null, errorCode: null, updatedAt: new Date() }).where(and(
          eq(verticalDramaBookExportArtifacts.id, artifact.id), eq(verticalDramaBookExportArtifacts.tenantId, actor.tenantId), eq(verticalDramaBookExportArtifacts.userId, actor.userId), eq(verticalDramaBookExportArtifacts.status, artifact.status),
        )).returning();
        if (!requeued) {
          const [latest] = await db.select().from(verticalDramaBookExportArtifacts).where(and(eq(verticalDramaBookExportArtifacts.id, artifact.id), eq(verticalDramaBookExportArtifacts.tenantId, actor.tenantId), eq(verticalDramaBookExportArtifacts.userId, actor.userId))).limit(1);
          if (latest?.jobId) results.push({ artifactId: latest.id, jobId: latest.jobId, format, status: latest.status });
          continue;
        }
      }
      try {
        await createFeature186VerticalDramaJobRef({
          jobId,
          tenantId: actor.tenantId,
          userId: actor.userId,
          jobType: "vertical_drama.book.export",
          executionClass: "long",
          idempotencyKey: `vd-book-export:${artifact.id}:${attemptKey}`,
          activeDedupeKey,
          payload: { tenantId: actor.tenantId, userId: actor.userId, artifactId: artifact.id },
        });
        await db.update(verticalDramaBookExportArtifacts).set({ jobId, updatedAt: new Date() }).where(and(
          eq(verticalDramaBookExportArtifacts.id, artifact.id), eq(verticalDramaBookExportArtifacts.tenantId, actor.tenantId), eq(verticalDramaBookExportArtifacts.userId, actor.userId),
        ));
        results.push({ artifactId: artifact.id, jobId, format, status: "queued" });
      } catch {
        const [activeJob] = await db.select({ id: workerJobs.id }).from(workerJobs).where(and(
          eq(workerJobs.tenantId, actor.tenantId), eq(workerJobs.activeDedupeKey, activeDedupeKey),
          inArray(workerJobs.status, ["pending", "queued", "leased", "claimed", "preparing", "running", "waiting_external", "retry_scheduled", "uploading", "publishing", "indexing"]),
        )).limit(1);
        if (activeJob) {
          await db.update(verticalDramaBookExportArtifacts).set({ jobId: activeJob.id, errorCode: null, updatedAt: new Date() }).where(and(
            eq(verticalDramaBookExportArtifacts.id, artifact.id), eq(verticalDramaBookExportArtifacts.tenantId, actor.tenantId), eq(verticalDramaBookExportArtifacts.userId, actor.userId),
          ));
          results.push({ artifactId: artifact.id, jobId: activeJob.id, format, status: "queued" });
          continue;
        }
        await db.update(verticalDramaBookExportArtifacts).set({ status: "failed", errorCode: "BOOK_EXPORT_QUEUE_FAILED", updatedAt: new Date() }).where(and(
          eq(verticalDramaBookExportArtifacts.id, artifact.id), eq(verticalDramaBookExportArtifacts.tenantId, actor.tenantId), eq(verticalDramaBookExportArtifacts.userId, actor.userId),
        ));
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Export could not be queued. Retry the affected format." });
      }
    }
    return { exports: results };
  }),

  download: bookProcedure.input(z.object({ artifactId: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
    const actor = owner(ctx);
    const [artifact] = await db.select({ storageKey: verticalDramaBookExportArtifacts.storageKey }).from(verticalDramaBookExportArtifacts).where(and(
      eq(verticalDramaBookExportArtifacts.id, input.artifactId), eq(verticalDramaBookExportArtifacts.tenantId, actor.tenantId),
      eq(verticalDramaBookExportArtifacts.userId, actor.userId), eq(verticalDramaBookExportArtifacts.status, "available"),
    )).limit(1);
    if (!artifact?.storageKey) notFound();
    const stored = await storageGet(artifact.storageKey);
    return { url: stored.url };
  }),

  cancelExport: bookProcedure.input(z.object({ artifactId: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
    const actor = owner(ctx);
    const [artifact] = await db.select({ id: verticalDramaBookExportArtifacts.id, jobId: verticalDramaBookExportArtifacts.jobId, status: verticalDramaBookExportArtifacts.status }).from(verticalDramaBookExportArtifacts).where(and(
      eq(verticalDramaBookExportArtifacts.id, input.artifactId), eq(verticalDramaBookExportArtifacts.tenantId, actor.tenantId), eq(verticalDramaBookExportArtifacts.userId, actor.userId),
    )).limit(1);
    if (!artifact) notFound();
    if (!["queued", "running", "validating"].includes(artifact.status) || !artifact.jobId) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "This export is no longer active." });
    const cancelled = await cancelQueuedUserWorkerJob({ auth: actor, jobId: artifact.jobId });
    if (cancelled.canceled) await db.update(verticalDramaBookExportArtifacts).set({ status: "cancelled", updatedAt: new Date() }).where(and(
      eq(verticalDramaBookExportArtifacts.id, artifact.id), eq(verticalDramaBookExportArtifacts.tenantId, actor.tenantId), eq(verticalDramaBookExportArtifacts.userId, actor.userId), inArray(verticalDramaBookExportArtifacts.status, ["queued", "running", "validating"]),
    ));
    return { cancelled: cancelled.canceled };
  }),

  approve: bookProcedure.input(z.object({ bookId: z.number().int().positive(), revisionId: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
    const actor = owner(ctx);
    const [revision] = await db.select().from(verticalDramaBookRevisions).where(and(
      eq(verticalDramaBookRevisions.id, input.revisionId), eq(verticalDramaBookRevisions.bookId, input.bookId),
      eq(verticalDramaBookRevisions.tenantId, actor.tenantId), eq(verticalDramaBookRevisions.userId, actor.userId),
    )).limit(1);
    if (!revision) notFound();
    if (revision.status === "approved") return { id: revision.id, revisionNumber: revision.revisionNumber, status: revision.status, document: revision.document, approvedAt: revision.approvedAt };
    const reviewedDocument = verticalDramaBookDocumentSchema.safeParse(revision.document);
    if (!reviewedDocument.success || fingerprintBookSource(reviewedDocument.data) !== revision.documentFingerprint) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Book revision integrity check failed. Save a new revision before approval." });
    if (!reviewedDocument.data.chapters.some(chapter => chapter.blocks.some(block => block.type === "illustration" || ("text" in block && block.text.trim())))) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Add story text or an illustration before approving this revision." });
    const [book] = await db.select().from(verticalDramaBooks).where(and(
      eq(verticalDramaBooks.id, input.bookId), eq(verticalDramaBooks.tenantId, actor.tenantId), eq(verticalDramaBooks.userId, actor.userId),
    )).limit(1);
    if (!book) notFound();
    const selected = (book.sourceSelection as { episodeIds?: unknown }).episodeIds;
    if (!Array.isArray(selected)) notFound();
    const fresh = await captureOwnedVerticalDramaBookSource({
      ...actor,
      seriesId: book.seriesId,
      episodeIds: selected.map(Number),
      additionalAssetIds: documentAssetSelections(revision.document as any),
    });
    if (fresh.sourceContentFingerprint !== book.sourceFingerprint || fresh.fingerprint !== revision.sourceFingerprint) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Episode or image sources changed. Refresh and review the book before approval." });
    const now = new Date();
    return db.transaction(async tx => {
      const [lockedBook] = await tx.select({ id: verticalDramaBooks.id }).from(verticalDramaBooks).where(and(
        eq(verticalDramaBooks.id, book.id), eq(verticalDramaBooks.tenantId, actor.tenantId), eq(verticalDramaBooks.userId, actor.userId),
      )).for("update").limit(1);
      if (!lockedBook) notFound();
      await tx.update(verticalDramaBookRevisions).set({ status: "superseded" }).where(and(
        eq(verticalDramaBookRevisions.bookId, book.id), eq(verticalDramaBookRevisions.tenantId, actor.tenantId), eq(verticalDramaBookRevisions.userId, actor.userId), eq(verticalDramaBookRevisions.status, "approved"),
      ));
      const [approved] = await tx.update(verticalDramaBookRevisions).set({ status: "approved", approvedBy: actor.userId, approvedAt: now }).where(and(
        eq(verticalDramaBookRevisions.id, revision.id), eq(verticalDramaBookRevisions.tenantId, actor.tenantId), eq(verticalDramaBookRevisions.userId, actor.userId), eq(verticalDramaBookRevisions.status, "draft"),
      )).returning();
      if (!approved) throw new TRPCError({ code: "CONFLICT", message: "This book revision is no longer editable." });
      return { id: approved.id, revisionNumber: approved.revisionNumber, status: approved.status, document: approved.document, approvedAt: approved.approvedAt };
    });
  }),
});
