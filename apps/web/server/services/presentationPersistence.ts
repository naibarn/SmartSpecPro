import { and, eq, sql } from "drizzle-orm";

import { getDb } from "../db";
import {
  presentationAssetLinks,
  presentationDecks,
  presentationSourceAttachments,
  presentationSlides,
  type PresentationAssetLink,
  type PresentationDeck,
  type PresentationSourceAttachment,
  type PresentationSlide,
} from "../../drizzle/schema";
import { PRESENTATION_LIMITS } from "@shared/presentation/constants";

type DbClient = NonNullable<Awaited<ReturnType<typeof getDb>>>;

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
}

export interface CreatePresentationSlideInput {
  deckId: number;
  title?: string;
  slideContent?: Record<string, unknown>;
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
  const [created] = await db
    .insert(presentationDecks)
    .values({
      tenantId: input.tenantId,
      libraryItemId: input.libraryItemId,
      title: input.title,
      description: input.description ?? null,
      version: 1,
      slideCount: 0,
      totalAssetBytes: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .returning();

  if (!created) {
    throw new Error("Failed to create presentation deck");
  }

  return created;
}

export async function getPresentationDeckById(
  deckId: number,
  tenantId: string,
  dbClient?: DbClient,
): Promise<PresentationDeck | null> {
  const db = await resolveDb(dbClient);
  const rows = await db
    .select()
    .from(presentationDecks)
    .where(and(eq(presentationDecks.id, deckId), eq(presentationDecks.tenantId, tenantId)))
    .limit(1);

  return rows[0] ?? null;
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

  const maxOrderRows = await db
    .select({ maxOrderIndex: sql<number>`coalesce(max(${presentationSlides.orderIndex}), -1)` })
    .from(presentationSlides)
    .where(eq(presentationSlides.deckId, input.deckId));

  const nextOrderIndex = (maxOrderRows[0]?.maxOrderIndex ?? -1) + 1;

  const [created] = await db
    .insert(presentationSlides)
    .values({
      deckId: input.deckId,
      orderIndex: nextOrderIndex,
      version: 1,
      title: input.title || `Slide ${nextOrderIndex + 1}`,
      slideContent: input.slideContent || {},
      notes: input.notes ?? null,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .returning();

  if (!created) {
    throw new Error("Failed to create presentation slide");
  }

  await db
    .update(presentationDecks)
    .set({
      slideCount: sql`${presentationDecks.slideCount} + 1`,
      version: sql`${presentationDecks.version} + 1`,
      updatedAt: new Date(),
    })
    .where(eq(presentationDecks.id, input.deckId));

  return created;
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
