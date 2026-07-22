import { and, eq, gt, lte, sql, getTableColumns } from "drizzle-orm";

import { getDb } from "../db";
import {
  presentationAssetLinks,
  presentationConversionLocks,
  presentationConversionRecords,
  presentationDecks,
  presentationSourceAttachments,
  presentationSlides,
  type PresentationAssetLink,
  type PresentationConversionRecord,
  type PresentationDeck,
  type SlideAudioTrackJson,
  type PresentationSourceAttachment,
  type PresentationSlide,
} from "../../drizzle/schema";
import { PRESENTATION_LIMITS } from "@shared/presentation/constants";

type DbClient = NonNullable<Awaited<ReturnType<typeof getDb>>>;
let cachedPresentationDeckNotesColumnAvailable: boolean | null = null;

const { notes: _presentationDeckNotesColumn, ...presentationDeckColumnsWithoutNotes } = getTableColumns(presentationDecks);

function isMissingPresentationDeckNotesColumnError(error: unknown): boolean {
  const code = String((error as any)?.code ?? "");
  const message = String((error as any)?.message ?? "");
  return (
    code === "42703"
    || (
      message.includes("presentation_decks")
      && message.includes("notes")
      && message.toLowerCase().includes("column")
    )
  );
}

async function hasPresentationDeckNotesColumn(dbClient?: DbClient): Promise<boolean> {
  if (cachedPresentationDeckNotesColumnAvailable !== null) {
    return cachedPresentationDeckNotesColumnAvailable;
  }
  const db = await resolveDb(dbClient);
  try {
    const result = await db.execute(sql`
      SELECT 1
      FROM information_schema.columns
      WHERE table_name = 'presentation_decks'
        AND column_name = 'notes'
      LIMIT 1
    `);
    cachedPresentationDeckNotesColumnAvailable = Array.isArray(result) ? result.length > 0 : ((result as any)?.rows?.length ?? 0) > 0;
  } catch {
    cachedPresentationDeckNotesColumnAvailable = true;
  }
  return cachedPresentationDeckNotesColumnAvailable;
}

async function buildPresentationDeckSelectShape(dbClient?: DbClient) {
  const includeNotes = await hasPresentationDeckNotesColumn(dbClient);
  if (includeNotes) {
    return getTableColumns(presentationDecks);
  }
  return {
    ...presentationDeckColumnsWithoutNotes,
    notes: sql<string | null>`null::text`,
  };
}

export interface DeckByteTotalsStatus {
  warningExceeded: boolean;
  hardLimitExceeded: boolean;
}

export interface DeckByteReconciliationRow {
  deckId: number;
  persistedTotalBytes: number;
  summedAssetBytes: number;
}

export interface DeckByteMismatch extends DeckByteReconciliationRow {
  deltaBytes: number;
}

export interface PresentationAssetLinkIntegrityRow {
  linkId: number;
  deckExists: boolean;
  slideId: number | null;
  slideExists: boolean;
  libraryItemExists: boolean;
}

export interface OrphanedPresentationAssetLinkFinding {
  linkId: number;
  reasons: Array<"missing_deck" | "missing_slide" | "missing_library_item">;
}

export interface PresentationObjectReferenceRow {
  objectKey: string;
  referenced: boolean;
}

export interface CreatePresentationDeckInput {
  tenantId: string;
  libraryItemId: number;
  title: string;
  description?: string | null;
  notes?: string | null;
}

export interface CreatePresentationSlideInput {
  deckId: number;
  title?: string;
  slideContent?: Record<string, unknown>;
  audioTrack?: SlideAudioTrackJson | null;
  notes?: string | null;
}

export interface ReorderPresentationSlideInput {
  deckId: number;
  movedSlideId: number;
  targetIndex: number;
}

export interface AttachPresentationAssetInput {
  tenantId: string;
  deckId: number;
  slideId: number | null;
  libraryItemId: number;
  byteSize: number;
}

export interface UpsertPresentationSourceAttachmentInput {
  deckId: number;
  sourceLibraryItemId: number | null;
  sourceFormat: string;
  conversionStatus: string;
  partialFidelity: boolean;
  fidelityWarnings: string[];
}

export interface PresentationConversionLookupInput {
  tenantId: string;
  sourceItemId: number;
  now: Date;
}

export interface PresentationConversionIdempotencyLookupInput extends PresentationConversionLookupInput {
  idempotencyKey: string;
}

export interface UpsertPresentationConversionRecordInput {
  tenantId: string;
  userId: number;
  sourceItemId: number | null;
  sourceFormat: "pptx" | "ppt" | "google_slides";
  idempotencyKey: string;
  deckLibraryItemId: number;
  deckId: number;
  partialFidelity: boolean;
  fidelityWarnings: string[];
  now: Date;
  expiresAt: Date;
}

export interface AcquirePresentationConversionLockInput {
  tenantId: string;
  sourceItemId: number;
  lockToken: string;
  now: Date;
  expiresAt: Date;
}

export interface ReleasePresentationConversionLockInput {
  tenantId: string;
  sourceItemId: number;
  lockToken: string;
}

export interface StoredPresentationConversionRecord {
  sourceItemId: number | null;
  sourceFormat: "pptx" | "ppt" | "google_slides";
  deckLibraryItemId: number | null;
  deckId: number | null;
  partialFidelity: boolean;
  fidelityWarnings: string[];
}

export interface CleanupExpiredPresentationConversionStateInput {
  now: Date;
}

async function resolveDb(dbClient?: DbClient): Promise<DbClient> {
  if (dbClient) {
    return dbClient;
  }

  const db = await getDb();
  if (!db) {
    throw new Error("Database unavailable");
  }

  return db;
}

export function assertNoDuplicateOrderIndexes(orderIndexes: number[]): void {
  const seen = new Set<number>();
  for (const orderIndex of orderIndexes) {
    if (seen.has(orderIndex)) {
      throw new Error(`Duplicate order index detected: ${orderIndex}`);
    }
    seen.add(orderIndex);
  }
}

export function buildReorderedSlideIds(
  currentSlideIds: number[],
  movedSlideId: number,
  targetIndex: number,
): number[] {
  const fromIndex = currentSlideIds.indexOf(movedSlideId);
  if (fromIndex === -1) {
    throw new Error("Slide not found in current deck order");
  }

  const maxIndex = Math.max(0, currentSlideIds.length - 1);
  const clampedTarget = Math.min(Math.max(targetIndex, 0), maxIndex);

  const reordered = [...currentSlideIds];
  reordered.splice(fromIndex, 1);
  reordered.splice(clampedTarget, 0, movedSlideId);
  return reordered;
}

export function evaluateDeckByteTotals(totalBytes: number): DeckByteTotalsStatus {
  return {
    warningExceeded: totalBytes >= PRESENTATION_LIMITS.softDeckSizeBytes,
    hardLimitExceeded: totalBytes >= PRESENTATION_LIMITS.hardDeckSizeBytes,
  };
}

export function findPresentationByteInconsistencies(
  rows: DeckByteReconciliationRow[],
): DeckByteMismatch[] {
  return rows
    .map((row) => ({
      ...row,
      deltaBytes: row.summedAssetBytes - row.persistedTotalBytes,
    }))
    .filter((row) => row.deltaBytes !== 0);
}

export function findOrphanedPresentationAssetLinks(
  rows: PresentationAssetLinkIntegrityRow[],
): OrphanedPresentationAssetLinkFinding[] {
  const findings: OrphanedPresentationAssetLinkFinding[] = [];

  for (const row of rows) {
    const reasons: OrphanedPresentationAssetLinkFinding["reasons"] = [];
    if (!row.deckExists) {
      reasons.push("missing_deck");
    }
    if (row.slideId !== null && !row.slideExists) {
      reasons.push("missing_slide");
    }
    if (!row.libraryItemExists) {
      reasons.push("missing_library_item");
    }

    if (reasons.length > 0) {
      findings.push({ linkId: row.linkId, reasons });
    }
  }

  return findings.sort((a, b) => a.linkId - b.linkId);
}

export function findStalePresentationObjectKeys(
  rows: PresentationObjectReferenceRow[],
): string[] {
  const stale = new Set<string>();

  for (const row of rows) {
    const key = row.objectKey.trim();
    if (!key || row.referenced) {
      continue;
    }
    stale.add(key);
  }

  return [...stale].sort((a, b) => a.localeCompare(b));
}

export async function createPresentationDeck(
  input: CreatePresentationDeckInput,
  dbClient?: DbClient,
): Promise<PresentationDeck> {
  const db = await resolveDb(dbClient);
  const notesColumnAvailable = await hasPresentationDeckNotesColumn(db);
  const selectShape = await buildPresentationDeckSelectShape(db);
  const values: Record<string, unknown> = {
    tenantId: input.tenantId,
    libraryItemId: input.libraryItemId,
    title: input.title,
    description: input.description ?? null,
    version: 1,
    slideCount: 0,
    totalAssetBytes: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  if (notesColumnAvailable) {
    values.notes = input.notes ?? null;
  }
  const [created] = await db
    .insert(presentationDecks)
    .values(values as any)
    .returning(selectShape as any)
    .catch(async (error) => {
      if (!isMissingPresentationDeckNotesColumnError(error)) {
        throw error;
      }
      cachedPresentationDeckNotesColumnAvailable = false;
      const { notes: _notes, ...fallbackValues } = values;
      const fallbackShape = await buildPresentationDeckSelectShape(db);
      return db
        .insert(presentationDecks)
        .values(fallbackValues as any)
        .returning(fallbackShape as any);
    });

  if (!created) {
    throw new Error("Failed to create presentation deck");
  }

  return created as PresentationDeck;
}

export async function getPresentationDeckById(
  deckId: number,
  tenantId: string,
  dbClient?: DbClient,
): Promise<PresentationDeck | null> {
  const db = await resolveDb(dbClient);
  const selectShape = await buildPresentationDeckSelectShape(db);
  const rows = await db
    .select(selectShape as any)
    .from(presentationDecks)
    .where(and(eq(presentationDecks.id, deckId), eq(presentationDecks.tenantId, tenantId)))
    .limit(1)
    .catch(async (error) => {
      if (!isMissingPresentationDeckNotesColumnError(error)) {
        throw error;
      }
      cachedPresentationDeckNotesColumnAvailable = false;
      const fallbackShape = await buildPresentationDeckSelectShape(db);
      return db
        .select(fallbackShape as any)
        .from(presentationDecks)
        .where(and(eq(presentationDecks.id, deckId), eq(presentationDecks.tenantId, tenantId)))
        .limit(1);
    });

  return (rows[0] as PresentationDeck | undefined) ?? null;
}

export async function listPresentationSlides(
  deckId: number,
  dbClient?: DbClient,
): Promise<PresentationSlide[]> {
  const db = await resolveDb(dbClient);
  const rows = await db
    .select()
    .from(presentationSlides)
    .where(eq(presentationSlides.deckId, deckId))
    .orderBy(presentationSlides.orderIndex);

  return rows;
}

export async function createPresentationSlide(
  input: CreatePresentationSlideInput,
  dbClient?: DbClient,
): Promise<PresentationSlide> {
  const db = await resolveDb(dbClient);

  // Two concurrent addSlide requests for the same deck can both read the same
  // max(order_index) before either inserts, then both try to insert at the
  // same order_index and one violates presentation_slides_deck_order_unique.
  // Take a row lock on the parent deck FIRST (inside a transaction — a nested
  // call becomes a SAVEPOINT when dbClient is already an open tx, e.g. from
  // presentationImportService) so concurrent calls for the same deck
  // serialize here before computing nextOrderIndex.
  return db.transaction(async (tx) => {
    await tx
      .select({ id: presentationDecks.id })
      .from(presentationDecks)
      .where(eq(presentationDecks.id, input.deckId))
      .for("update");

    const maxOrderRows = await tx
      .select({ maxOrderIndex: sql<number>`coalesce(max(${presentationSlides.orderIndex}), -1)` })
      .from(presentationSlides)
      .where(eq(presentationSlides.deckId, input.deckId));

    const nextOrderIndex = (maxOrderRows[0]?.maxOrderIndex ?? -1) + 1;

    const [created] = await tx
      .insert(presentationSlides)
      .values({
        deckId: input.deckId,
        orderIndex: nextOrderIndex,
        version: 1,
        title: input.title || `Slide ${nextOrderIndex + 1}`,
        slideContent: input.slideContent || {},
        audioTrack: input.audioTrack ?? null,
        notes: input.notes ?? null,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .returning();

    if (!created) {
      throw new Error("Failed to create presentation slide");
    }

    await tx
      .update(presentationDecks)
      .set({
        slideCount: sql`${presentationDecks.slideCount} + 1`,
        version: sql`${presentationDecks.version} + 1`,
        updatedAt: new Date(),
      })
      .where(eq(presentationDecks.id, input.deckId));

    return created;
  });
}

export async function reorderPresentationSlides(
  input: ReorderPresentationSlideInput,
  dbClient?: DbClient,
): Promise<number[]> {
  const db = await resolveDb(dbClient);

  const slides = await db
    .select({
      id: presentationSlides.id,
      orderIndex: presentationSlides.orderIndex,
    })
    .from(presentationSlides)
    .where(eq(presentationSlides.deckId, input.deckId))
    .orderBy(presentationSlides.orderIndex);

  assertNoDuplicateOrderIndexes(slides.map((slide) => slide.orderIndex));

  const currentIds = slides.map((slide) => slide.id);
  const reorderedIds = buildReorderedSlideIds(currentIds, input.movedSlideId, input.targetIndex);

  await db.transaction(async (tx) => {
    // Reserve a temporary index space to avoid unique collisions while rewriting order.
    await tx
      .update(presentationSlides)
      .set({ orderIndex: sql`${presentationSlides.orderIndex} + 10000` })
      .where(eq(presentationSlides.deckId, input.deckId));

    for (let index = 0; index < reorderedIds.length; index += 1) {
      await tx
        .update(presentationSlides)
        .set({
          orderIndex: index,
          version: sql`${presentationSlides.version} + 1`,
          updatedAt: new Date(),
        })
        .where(and(
          eq(presentationSlides.id, reorderedIds[index]),
          eq(presentationSlides.deckId, input.deckId),
        ));
    }

    await tx
      .update(presentationDecks)
      .set({
        version: sql`${presentationDecks.version} + 1`,
        updatedAt: new Date(),
      })
      .where(eq(presentationDecks.id, input.deckId));
  });

  return reorderedIds;
}

export async function adjustPresentationDeckBytes(
  deckId: number,
  byteDelta: number,
  dbClient?: DbClient,
): Promise<{ totalAssetBytes: number } & DeckByteTotalsStatus> {
  const db = await resolveDb(dbClient);

  const rows = await db
    .update(presentationDecks)
    .set({
      totalAssetBytes: sql`GREATEST(0, ${presentationDecks.totalAssetBytes} + ${byteDelta})`,
      version: sql`${presentationDecks.version} + 1`,
      updatedAt: new Date(),
    })
    .where(eq(presentationDecks.id, deckId))
    .returning({
      totalAssetBytes: presentationDecks.totalAssetBytes,
    });

  const totalAssetBytes = rows[0]?.totalAssetBytes ?? 0;
  return {
    totalAssetBytes,
    ...evaluateDeckByteTotals(totalAssetBytes),
  };
}

export async function attachPresentationAsset(
  input: AttachPresentationAssetInput,
  dbClient?: DbClient,
): Promise<{ link: PresentationAssetLink; totals: { totalAssetBytes: number } & DeckByteTotalsStatus }> {
  const db = await resolveDb(dbClient);

  const existing = await db
    .select()
    .from(presentationAssetLinks)
    .where(and(
      eq(presentationAssetLinks.deckId, input.deckId),
      eq(presentationAssetLinks.libraryItemId, input.libraryItemId),
      input.slideId === null
        ? sql`${presentationAssetLinks.slideId} IS NULL`
        : eq(presentationAssetLinks.slideId, input.slideId),
    ))
    .limit(1);

  let delta = input.byteSize;
  let link: PresentationAssetLink;

  if (existing[0]) {
    delta = input.byteSize - (existing[0].byteSize ?? 0);

    const updated = await db
      .update(presentationAssetLinks)
      .set({
        byteSize: input.byteSize,
      })
      .where(eq(presentationAssetLinks.id, existing[0].id))
      .returning();

    if (!updated[0]) {
      throw new Error("Failed to update presentation asset link");
    }

    link = updated[0];
  } else {
    const created = await db
      .insert(presentationAssetLinks)
      .values({
        tenantId: input.tenantId,
        deckId: input.deckId,
        slideId: input.slideId,
        libraryItemId: input.libraryItemId,
        byteSize: input.byteSize,
        createdAt: new Date(),
      })
      .returning();

    if (!created[0]) {
      throw new Error("Failed to create presentation asset link");
    }

    link = created[0];
  }

  const totals = await adjustPresentationDeckBytes(input.deckId, delta, db);
  return { link, totals };
}

export async function detachPresentationAsset(
  linkId: number,
  dbClient?: DbClient,
): Promise<{ deleted: boolean; totals?: { totalAssetBytes: number } & DeckByteTotalsStatus }> {
  const db = await resolveDb(dbClient);

  const existing = await db
    .select()
    .from(presentationAssetLinks)
    .where(eq(presentationAssetLinks.id, linkId))
    .limit(1);

  if (!existing[0]) {
    return { deleted: false };
  }

  await db
    .delete(presentationAssetLinks)
    .where(eq(presentationAssetLinks.id, linkId));

  const totals = await adjustPresentationDeckBytes(existing[0].deckId, -(existing[0].byteSize ?? 0), db);

  return {
    deleted: true,
    totals,
  };
}

export async function reconcilePresentationByteTotals(
  deckId?: number,
  dbClient?: DbClient,
): Promise<DeckByteMismatch[]> {
  const db = await resolveDb(dbClient);

  const rows = await db
    .select({
      deckId: presentationDecks.id,
      persistedTotalBytes: presentationDecks.totalAssetBytes,
      summedAssetBytes: sql<number>`coalesce(sum(${presentationAssetLinks.byteSize}), 0)`,
    })
    .from(presentationDecks)
    .leftJoin(presentationAssetLinks, eq(presentationAssetLinks.deckId, presentationDecks.id))
    .where(deckId ? eq(presentationDecks.id, deckId) : undefined)
    .groupBy(presentationDecks.id, presentationDecks.totalAssetBytes);

  return findPresentationByteInconsistencies(rows);
}

export async function upsertPresentationSourceAttachment(
  input: UpsertPresentationSourceAttachmentInput,
  dbClient?: DbClient,
): Promise<PresentationSourceAttachment> {
  const db = await resolveDb(dbClient);

  const existing = await db
    .select()
    .from(presentationSourceAttachments)
    .where(eq(presentationSourceAttachments.deckId, input.deckId))
    .limit(1);

  if (existing[0]) {
    const updated = await db
      .update(presentationSourceAttachments)
      .set({
        sourceLibraryItemId: input.sourceLibraryItemId,
        sourceFormat: input.sourceFormat,
        conversionStatus: input.conversionStatus,
        partialFidelity: input.partialFidelity,
        fidelityWarnings: input.fidelityWarnings,
        updatedAt: new Date(),
      })
      .where(eq(presentationSourceAttachments.deckId, input.deckId))
      .returning();

    if (!updated[0]) {
      throw new Error("Failed to update presentation source attachment");
    }
    return updated[0];
  }

  const created = await db
    .insert(presentationSourceAttachments)
    .values({
      deckId: input.deckId,
      sourceLibraryItemId: input.sourceLibraryItemId,
      sourceFormat: input.sourceFormat,
      conversionStatus: input.conversionStatus,
      partialFidelity: input.partialFidelity,
      fidelityWarnings: input.fidelityWarnings,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .returning();

  if (!created[0]) {
    throw new Error("Failed to create presentation source attachment");
  }

  return created[0];
}

function mapStoredConversionRecord(
  row: PresentationConversionRecord,
): StoredPresentationConversionRecord {
  const rawWarnings = Array.isArray(row.fidelityWarnings) ? row.fidelityWarnings : [];
  return {
    sourceItemId: row.sourceItemId,
    sourceFormat: row.sourceFormat === "ppt" ? "ppt" : row.sourceFormat === "google_slides" ? "google_slides" : "pptx",
    deckLibraryItemId: row.deckLibraryItemId,
    deckId: row.deckId,
    partialFidelity: row.partialFidelity,
    fidelityWarnings: rawWarnings.filter((warning): warning is string => typeof warning === "string"),
  };
}

export async function getActivePresentationConversionBySource(
  input: PresentationConversionLookupInput,
  dbClient?: DbClient,
): Promise<StoredPresentationConversionRecord | null> {
  const db = await resolveDb(dbClient);

  await db
    .delete(presentationConversionRecords)
    .where(and(
      eq(presentationConversionRecords.tenantId, input.tenantId),
      eq(presentationConversionRecords.sourceItemId, input.sourceItemId),
      lte(presentationConversionRecords.expiresAt, input.now),
    ));

  const rows = await db
    .select()
    .from(presentationConversionRecords)
    .where(and(
      eq(presentationConversionRecords.tenantId, input.tenantId),
      eq(presentationConversionRecords.sourceItemId, input.sourceItemId),
      gt(presentationConversionRecords.expiresAt, input.now),
    ))
    .limit(1);

  if (!rows[0]) {
    return null;
  }

  return mapStoredConversionRecord(rows[0]);
}

export async function getActivePresentationConversionByIdempotency(
  input: PresentationConversionIdempotencyLookupInput,
  dbClient?: DbClient,
): Promise<StoredPresentationConversionRecord | null> {
  const db = await resolveDb(dbClient);

  await db
    .delete(presentationConversionRecords)
    .where(and(
      eq(presentationConversionRecords.tenantId, input.tenantId),
      eq(presentationConversionRecords.sourceItemId, input.sourceItemId),
      lte(presentationConversionRecords.expiresAt, input.now),
    ));

  const rows = await db
    .select()
    .from(presentationConversionRecords)
    .where(and(
      eq(presentationConversionRecords.tenantId, input.tenantId),
      eq(presentationConversionRecords.sourceItemId, input.sourceItemId),
      eq(presentationConversionRecords.idempotencyKey, input.idempotencyKey),
      gt(presentationConversionRecords.expiresAt, input.now),
    ))
    .limit(1);

  if (!rows[0]) {
    return null;
  }

  return mapStoredConversionRecord(rows[0]);
}

export async function upsertPresentationConversionRecord(
  input: UpsertPresentationConversionRecordInput,
  dbClient?: DbClient,
): Promise<StoredPresentationConversionRecord> {
  const db = await resolveDb(dbClient);

  const rows = await db
    .insert(presentationConversionRecords)
    .values({
      tenantId: input.tenantId,
      userId: input.userId,
      sourceItemId: input.sourceItemId,
      sourceFormat: input.sourceFormat,
      idempotencyKey: input.idempotencyKey,
      deckLibraryItemId: input.deckLibraryItemId,
      deckId: input.deckId,
      partialFidelity: input.partialFidelity,
      fidelityWarnings: input.fidelityWarnings,
      expiresAt: input.expiresAt,
      createdAt: input.now,
      updatedAt: input.now,
    })
    .onConflictDoUpdate({
      target: [presentationConversionRecords.tenantId, presentationConversionRecords.sourceItemId],
      targetWhere: sql`${presentationConversionRecords.sourceItemId} IS NOT NULL`,
      set: {
        sourceFormat: input.sourceFormat,
        idempotencyKey: input.idempotencyKey,
        deckLibraryItemId: input.deckLibraryItemId,
        deckId: input.deckId,
        partialFidelity: input.partialFidelity,
        fidelityWarnings: input.fidelityWarnings,
        expiresAt: input.expiresAt,
        updatedAt: input.now,
      },
    })
    .returning();

  if (!rows[0]) {
    throw new Error("Failed to persist presentation conversion record");
  }

  return mapStoredConversionRecord(rows[0]);
}

export async function tryAcquirePresentationConversionLock(
  input: AcquirePresentationConversionLockInput,
  dbClient?: DbClient,
): Promise<boolean> {
  const db = await resolveDb(dbClient);

  const inserted = await db.transaction(async (tx) => {
    await tx
      .delete(presentationConversionLocks)
      .where(and(
        eq(presentationConversionLocks.tenantId, input.tenantId),
        eq(presentationConversionLocks.sourceItemId, input.sourceItemId),
        lte(presentationConversionLocks.expiresAt, input.now),
      ));

    return tx
      .insert(presentationConversionLocks)
      .values({
        tenantId: input.tenantId,
        sourceItemId: input.sourceItemId,
        lockToken: input.lockToken,
        expiresAt: input.expiresAt,
        createdAt: input.now,
        updatedAt: input.now,
      })
      .onConflictDoNothing()
      .returning({ lockToken: presentationConversionLocks.lockToken });
  });

  return inserted[0]?.lockToken === input.lockToken;
}

export async function releasePresentationConversionLock(
  input: ReleasePresentationConversionLockInput,
  dbClient?: DbClient,
): Promise<void> {
  const db = await resolveDb(dbClient);

  await db
    .delete(presentationConversionLocks)
    .where(and(
      eq(presentationConversionLocks.tenantId, input.tenantId),
      eq(presentationConversionLocks.sourceItemId, input.sourceItemId),
      eq(presentationConversionLocks.lockToken, input.lockToken),
    ));
}

export async function cleanupExpiredPresentationConversionState(
  input: CleanupExpiredPresentationConversionStateInput,
  dbClient?: DbClient,
): Promise<void> {
  const db = await resolveDb(dbClient);

  await db
    .delete(presentationConversionLocks)
    .where(lte(presentationConversionLocks.expiresAt, input.now));

  await db
    .delete(presentationConversionRecords)
    .where(lte(presentationConversionRecords.expiresAt, input.now));
}
