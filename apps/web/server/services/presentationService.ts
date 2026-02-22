import { and, count, eq, sql } from "drizzle-orm";

import { getDb } from "../db";
import {
  presentationAssetLinks,
  presentationDecks,
  presentationSlides,
  type PresentationAssetLink,
  type PresentationDeck,
  type PresentationSlide,
} from "../../drizzle/schema";
import {
  attachPresentationAsset,
  createPresentationDeck,
  createPresentationSlide,
  detachPresentationAsset,
  getPresentationDeckById,
  listPresentationSlides,
  reorderPresentationSlides,
} from "./presentationPersistence";
import {
  getLibraryItemById,
  getUserEffectivePermission,
  type LibraryActor,
  type LibraryItemDto,
} from "./libraryService";
import {
  PRESENTATION_CONFLICT_SCHEMA_VERSION,
  PRESENTATION_ERROR_CODE,
  PRESENTATION_ITEM_TYPE,
  PRESENTATION_LIMITS,
} from "@shared/presentation/constants";
import { presentationVersionConflictSchema, type PresentationVersionConflict } from "@shared/presentation/contracts";
import {
  recordPresentationFailureMetric,
  recordPresentationLog,
} from "./presentationObservability";

type DbClient = NonNullable<Awaited<ReturnType<typeof getDb>>>;

export interface PresentationActor extends LibraryActor {
  tenantId: string;
}

export interface PresentationDeckDetail {
  deck: PresentationDeck;
  slides: PresentationSlide[];
  assets: PresentationAssetLink[];
}

export interface CreatePresentationDeckForLibraryItemInput {
  libraryItemId: number;
  title?: string;
  description?: string | null;
}

export interface UpdatePresentationDeckMetadataInput {
  deckId: number;
  expectedVersion: number;
  title?: string;
  description?: string | null;
}

export interface AddPresentationSlideInput {
  deckId: number;
  expectedVersion: number;
  title?: string;
  slideContent?: Record<string, unknown>;
  notes?: string | null;
}

export interface DuplicatePresentationSlideInput {
  deckId: number;
  expectedVersion: number;
  slideId: number;
  targetIndex?: number;
}

export interface UpdatePresentationSlideInput {
  deckId: number;
  slideId: number;
  expectedVersion: number;
  saveMode?: "manual" | "autosave";
  title?: string;
  slideContent?: Record<string, unknown>;
  notes?: string | null;
}

export interface DeletePresentationSlideInput {
  deckId: number;
  slideId: number;
  expectedVersion: number;
}

export interface ReorderPresentationSlidesInput {
  deckId: number;
  movedSlideId: number;
  targetIndex: number;
  expectedVersion: number;
}

export interface ListPresentationAssetsInput {
  deckId: number;
  slideId?: number | null;
}

export interface AttachPresentationAssetInput {
  deckId: number;
  expectedVersion: number;
  slideId?: number | null;
  libraryItemId: number;
  byteSize: number;
}

export interface DetachPresentationAssetInput {
  deckId: number;
  linkId: number;
  expectedVersion: number;
}

export interface DeletePresentationDeckInput {
  deckId: number;
  expectedVersion: number;
}

export class PresentationServiceError extends Error {
  readonly code: string;
  readonly details?: Record<string, unknown>;

  constructor(code: string, message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = "PresentationServiceError";
    this.code = code;
    this.details = details;
  }
}

function rankPermissionLevel(permissionLevel: "read" | "write" | "delete" | "owner" | null): number {
  switch (permissionLevel) {
    case "owner":
      return 4;
    case "delete":
      return 3;
    case "write":
      return 2;
    case "read":
      return 1;
    default:
      return 0;
  }
}

function isLifecycleRestricted(item: Pick<LibraryItemDto, "status" | "deletedAt">): boolean {
  return item.status === "archived" || item.deletedAt !== null;
}

function ensurePresentationItemType(item: Pick<LibraryItemDto, "itemType">): void {
  if (item.itemType !== PRESENTATION_ITEM_TYPE) {
    throw new PresentationServiceError(
      PRESENTATION_ERROR_CODE.ITEM_TYPE_MISMATCH,
      `${PRESENTATION_ERROR_CODE.ITEM_TYPE_MISMATCH}: presentation operations require itemType="${PRESENTATION_ITEM_TYPE}"`,
    );
  }
}

function ensureActiveLifecycle(item: Pick<LibraryItemDto, "status" | "deletedAt">): void {
  if (!isLifecycleRestricted(item)) {
    return;
  }

  throw new PresentationServiceError(
    PRESENTATION_ERROR_CODE.LIFECYCLE_RESTRICTED,
    `${PRESENTATION_ERROR_CODE.LIFECYCLE_RESTRICTED}: archived or deleted resources are read-only`,
  );
}

async function ensureWritePermission(itemId: number, actor: PresentationActor): Promise<void> {
  const permission = await getUserEffectivePermission(itemId, actor);
  if (rankPermissionLevel(permission.effectivePermissionLevel) >= 2) {
    return;
  }

  throw new PresentationServiceError(
    PRESENTATION_ERROR_CODE.PERMISSION_DENIED,
    `${PRESENTATION_ERROR_CODE.PERMISSION_DENIED}: write permission is required`,
  );
}

function toDeckConflictSnapshot(deck: PresentationDeck): PresentationVersionConflict["latestDeck"] {
  return {
    id: deck.id,
    version: deck.version,
    slideCount: deck.slideCount,
    totalAssetBytes: deck.totalAssetBytes,
    updatedAt: deck.updatedAt,
  };
}

function toSlideConflictSnapshot(slide: PresentationSlide): NonNullable<PresentationVersionConflict["latestSlide"]> {
  return {
    id: slide.id,
    deckId: slide.deckId,
    orderIndex: slide.orderIndex,
    version: slide.version,
    title: slide.title,
    slideContent: slide.slideContent as Record<string, unknown>,
    notes: slide.notes,
    updatedAt: slide.updatedAt,
  };
}

function buildVersionConflict(
  payload: Omit<PresentationVersionConflict, "conflictSchemaVersion">,
): PresentationVersionConflict {
  return presentationVersionConflictSchema.parse({
    conflictSchemaVersion: PRESENTATION_CONFLICT_SCHEMA_VERSION,
    ...payload,
  });
}

function throwDeckVersionConflict(deck: PresentationDeck, expectedVersion: number): never {
  const conflict = buildVersionConflict({
    reasonCode: "DECK_VERSION_MISMATCH",
    expectedVersion,
    latestDeckVersion: deck.version,
    deckId: deck.id,
    latestDeck: toDeckConflictSnapshot(deck),
  });
  recordPresentationFailureMetric(PRESENTATION_ERROR_CODE.VERSION_CONFLICT);
  recordPresentationLog("presentation_conflict", {
    tenantId: deck.tenantId,
    deckId: deck.id,
    errorCode: PRESENTATION_ERROR_CODE.VERSION_CONFLICT,
    reasonCode: "DECK_VERSION_MISMATCH",
  });

  throw new PresentationServiceError(
    PRESENTATION_ERROR_CODE.VERSION_CONFLICT,
    `${PRESENTATION_ERROR_CODE.VERSION_CONFLICT}: expected deck version ${expectedVersion} but latest is ${deck.version}`,
    { conflict },
  );
}

function throwSlideVersionConflict(
  deck: PresentationDeck,
  slide: PresentationSlide,
  expectedVersion: number,
  saveMode?: "manual" | "autosave",
): never {
  const conflict = buildVersionConflict({
    reasonCode: "SLIDE_VERSION_MISMATCH",
    expectedVersion,
    latestDeckVersion: deck.version,
    latestSlideVersion: slide.version,
    deckId: deck.id,
    slideId: slide.id,
    saveMode,
    latestDeck: toDeckConflictSnapshot(deck),
    latestSlide: toSlideConflictSnapshot(slide),
  });
  recordPresentationFailureMetric(PRESENTATION_ERROR_CODE.VERSION_CONFLICT);
  recordPresentationLog("presentation_conflict", {
    tenantId: deck.tenantId,
    deckId: deck.id,
    slideId: slide.id,
    errorCode: PRESENTATION_ERROR_CODE.VERSION_CONFLICT,
    reasonCode: "SLIDE_VERSION_MISMATCH",
  });

  throw new PresentationServiceError(
    PRESENTATION_ERROR_CODE.VERSION_CONFLICT,
    `${PRESENTATION_ERROR_CODE.VERSION_CONFLICT}: expected slide version ${expectedVersion} but latest is ${slide.version}`,
    { conflict },
  );
}

function ensureExpectedDeckVersion(deck: PresentationDeck, expectedVersion: number): void {
  if (deck.version === expectedVersion) {
    return;
  }
  throwDeckVersionConflict(deck, expectedVersion);
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

async function resolveReadableLibraryItem(
  libraryItemId: number,
  actor: PresentationActor,
): Promise<LibraryItemDto> {
  const item = await getLibraryItemById(libraryItemId, actor);
  if (!item) {
    throw new PresentationServiceError(
      PRESENTATION_ERROR_CODE.NOT_FOUND,
      `${PRESENTATION_ERROR_CODE.NOT_FOUND}: presentation resource not found`,
    );
  }

  return item;
}

async function resolveDeckContext(
  deckId: number,
  actor: PresentationActor,
  options: { write: boolean; allowNonPresentationItem?: boolean },
  dbClient?: DbClient,
): Promise<{ deck: PresentationDeck; libraryItem: LibraryItemDto; db: DbClient }> {
  const db = await resolveDb(dbClient);
  const deck = await getPresentationDeckById(deckId, actor.tenantId, db);
  if (!deck) {
    throw new PresentationServiceError(
      PRESENTATION_ERROR_CODE.NOT_FOUND,
      `${PRESENTATION_ERROR_CODE.NOT_FOUND}: deck ${deckId} not found`,
    );
  }

  const libraryItem = await resolveReadableLibraryItem(deck.libraryItemId, actor);
  if (!options.allowNonPresentationItem) {
    ensurePresentationItemType(libraryItem);
  }
  ensureActiveLifecycle(libraryItem);

  if (options.write) {
    await ensureWritePermission(libraryItem.id, actor);
  }

  return { deck, libraryItem, db };
}

async function getDeckByLibraryItemId(
  libraryItemId: number,
  tenantId: string,
  dbClient?: DbClient,
): Promise<PresentationDeck | null> {
  const db = await resolveDb(dbClient);
  const rows = await db
    .select()
    .from(presentationDecks)
    .where(and(eq(presentationDecks.libraryItemId, libraryItemId), eq(presentationDecks.tenantId, tenantId)))
    .limit(1);

  return rows[0] ?? null;
}

async function getSlideById(
  slideId: number,
  deckId: number,
  dbClient?: DbClient,
): Promise<PresentationSlide | null> {
  const db = await resolveDb(dbClient);
  const rows = await db
    .select()
    .from(presentationSlides)
    .where(and(eq(presentationSlides.id, slideId), eq(presentationSlides.deckId, deckId)))
    .limit(1);

  return rows[0] ?? null;
}

export async function getPresentationDeckDetail(
  deckId: number,
  actor: PresentationActor,
  dbClient?: DbClient,
): Promise<PresentationDeckDetail> {
  const { deck, db } = await resolveDeckContext(deckId, actor, { write: false }, dbClient);
  const slides = await listPresentationSlides(deck.id, db);
  const assets = await db
    .select()
    .from(presentationAssetLinks)
    .where(eq(presentationAssetLinks.deckId, deck.id));

  return { deck, slides, assets };
}

export async function getPresentationDeckByLibraryItem(
  libraryItemId: number,
  actor: PresentationActor,
  dbClient?: DbClient,
): Promise<PresentationDeckDetail | null> {
  const item = await resolveReadableLibraryItem(libraryItemId, actor);
  ensurePresentationItemType(item);
  ensureActiveLifecycle(item);

  const db = await resolveDb(dbClient);
  const deck = await getDeckByLibraryItemId(libraryItemId, actor.tenantId, db);
  if (!deck) {
    return null;
  }

  const slides = await listPresentationSlides(deck.id, db);
  const assets = await db
    .select()
    .from(presentationAssetLinks)
    .where(eq(presentationAssetLinks.deckId, deck.id));

  return { deck, slides, assets };
}

export async function createPresentationDeckForLibraryItem(
  input: CreatePresentationDeckForLibraryItemInput,
  actor: PresentationActor,
  dbClient?: DbClient,
): Promise<{ created: boolean; deck: PresentationDeck }> {
  const item = await resolveReadableLibraryItem(input.libraryItemId, actor);
  ensurePresentationItemType(item);
  ensureActiveLifecycle(item);
  await ensureWritePermission(item.id, actor);

  const db = await resolveDb(dbClient);
  const existing = await getDeckByLibraryItemId(input.libraryItemId, actor.tenantId, db);
  if (existing) {
    return { created: false, deck: existing };
  }

  const deck = await createPresentationDeck(
    {
      tenantId: actor.tenantId,
      libraryItemId: input.libraryItemId,
      title: input.title || item.title,
      description: input.description ?? item.description,
    },
    db,
  );

  return { created: true, deck };
}

export async function updatePresentationDeckMetadata(
  input: UpdatePresentationDeckMetadataInput,
  actor: PresentationActor,
  dbClient?: DbClient,
): Promise<PresentationDeck> {
  const { deck, db } = await resolveDeckContext(input.deckId, actor, { write: true }, dbClient);
  ensureExpectedDeckVersion(deck, input.expectedVersion);
  const updates: Partial<typeof presentationDecks.$inferInsert> = {
    updatedAt: new Date(),
    version: deck.version + 1,
  };

  if (input.title !== undefined) {
    updates.title = input.title;
  }
  if (input.description !== undefined) {
    updates.description = input.description;
  }

  const rows = await db
    .update(presentationDecks)
    .set(updates)
    .where(and(eq(presentationDecks.id, input.deckId), eq(presentationDecks.tenantId, actor.tenantId)))
    .returning();

  if (!rows[0]) {
    throw new PresentationServiceError(
      PRESENTATION_ERROR_CODE.NOT_FOUND,
      `${PRESENTATION_ERROR_CODE.NOT_FOUND}: deck ${input.deckId} not found`,
    );
  }

  return rows[0];
}

export async function deletePresentationDeck(
  input: DeletePresentationDeckInput,
  actor: PresentationActor,
  dbClient?: DbClient,
): Promise<{ success: boolean }> {
  const { deck, db } = await resolveDeckContext(input.deckId, actor, { write: true }, dbClient);
  ensureExpectedDeckVersion(deck, input.expectedVersion);

  const rows = await db
    .delete(presentationDecks)
    .where(and(eq(presentationDecks.id, input.deckId), eq(presentationDecks.tenantId, actor.tenantId)))
    .returning({ id: presentationDecks.id });

  return { success: Boolean(rows[0]?.id) };
}

export async function listSlidesForDeck(
  deckId: number,
  actor: PresentationActor,
  dbClient?: DbClient,
): Promise<PresentationSlide[]> {
  const { deck, db } = await resolveDeckContext(deckId, actor, { write: false }, dbClient);
  return listPresentationSlides(deck.id, db);
}

export async function addSlideToDeck(
  input: AddPresentationSlideInput,
  actor: PresentationActor,
  dbClient?: DbClient,
): Promise<PresentationSlide> {
  const { deck, db } = await resolveDeckContext(input.deckId, actor, { write: true }, dbClient);
  ensureExpectedDeckVersion(deck, input.expectedVersion);
  if (deck.slideCount >= PRESENTATION_LIMITS.maxSlidesPerDeck) {
    throw new PresentationServiceError(
      PRESENTATION_ERROR_CODE.SLIDE_LIMIT_EXCEEDED,
      `${PRESENTATION_ERROR_CODE.SLIDE_LIMIT_EXCEEDED}: max ${PRESENTATION_LIMITS.maxSlidesPerDeck} slides per deck`,
    );
  }

  return createPresentationSlide(
    {
      deckId: input.deckId,
      title: input.title,
      slideContent: input.slideContent,
      notes: input.notes,
    },
    db,
  );
}

export async function duplicateSlideInDeck(
  input: DuplicatePresentationSlideInput,
  actor: PresentationActor,
  dbClient?: DbClient,
): Promise<PresentationSlide> {
  const { deck, db } = await resolveDeckContext(input.deckId, actor, { write: true }, dbClient);
  ensureExpectedDeckVersion(deck, input.expectedVersion);
  if (deck.slideCount >= PRESENTATION_LIMITS.maxSlidesPerDeck) {
    throw new PresentationServiceError(
      PRESENTATION_ERROR_CODE.SLIDE_LIMIT_EXCEEDED,
      `${PRESENTATION_ERROR_CODE.SLIDE_LIMIT_EXCEEDED}: max ${PRESENTATION_LIMITS.maxSlidesPerDeck} slides per deck`,
    );
  }

  const sourceSlide = await getSlideById(input.slideId, input.deckId, db);
  if (!sourceSlide) {
    throw new PresentationServiceError(
      PRESENTATION_ERROR_CODE.NOT_FOUND,
      `${PRESENTATION_ERROR_CODE.NOT_FOUND}: slide ${input.slideId} not found`,
    );
  }

  const duplicated = await createPresentationSlide(
    {
      deckId: input.deckId,
      title: `${sourceSlide.title} copy`,
      slideContent: sourceSlide.slideContent as Record<string, unknown>,
      notes: sourceSlide.notes,
    },
    db,
  );

  if (input.targetIndex !== undefined) {
    await reorderPresentationSlides(
      {
        deckId: input.deckId,
        movedSlideId: duplicated.id,
        targetIndex: input.targetIndex,
      },
      db,
    );
  }

  return duplicated;
}

export async function updateSlideInDeck(
  input: UpdatePresentationSlideInput,
  actor: PresentationActor,
  dbClient?: DbClient,
): Promise<PresentationSlide> {
  const { deck, db } = await resolveDeckContext(input.deckId, actor, { write: true }, dbClient);
  const currentSlide = await getSlideById(input.slideId, input.deckId, db);
  if (!currentSlide) {
    throw new PresentationServiceError(
      PRESENTATION_ERROR_CODE.NOT_FOUND,
      `${PRESENTATION_ERROR_CODE.NOT_FOUND}: slide ${input.slideId} not found`,
    );
  }
  if (currentSlide.version !== input.expectedVersion) {
    throwSlideVersionConflict(deck, currentSlide, input.expectedVersion, input.saveMode);
  }

  const updates: Record<string, unknown> = {
    updatedAt: new Date(),
    version: sql`${presentationSlides.version} + 1`,
  };

  if (input.title !== undefined) {
    updates.title = input.title;
  }
  if (input.slideContent !== undefined) {
    updates.slideContent = input.slideContent;
  }
  if (input.notes !== undefined) {
    updates.notes = input.notes;
  }

  const rows = await db
    .update(presentationSlides)
    .set(updates)
    .where(and(
      eq(presentationSlides.id, input.slideId),
      eq(presentationSlides.deckId, input.deckId),
      eq(presentationSlides.version, input.expectedVersion),
    ))
    .returning();

  if (!rows[0]) {
    const latestSlide = await getSlideById(input.slideId, input.deckId, db);
    if (latestSlide) {
      throwSlideVersionConflict(deck, latestSlide, input.expectedVersion, input.saveMode);
    }
    throw new PresentationServiceError(
      PRESENTATION_ERROR_CODE.NOT_FOUND,
      `${PRESENTATION_ERROR_CODE.NOT_FOUND}: slide ${input.slideId} not found`,
    );
  }

  await db
    .update(presentationDecks)
    .set({
      version: deck.version + 1,
      updatedAt: new Date(),
    })
    .where(eq(presentationDecks.id, input.deckId));

  return rows[0];
}

export async function deleteSlideFromDeck(
  input: DeletePresentationSlideInput,
  actor: PresentationActor,
  dbClient?: DbClient,
): Promise<{ deleted: boolean }> {
  const { deck, db } = await resolveDeckContext(input.deckId, actor, { write: true }, dbClient);
  ensureExpectedDeckVersion(deck, input.expectedVersion);

  const deleted = await db.transaction(async (tx) => {
    const existing = await tx
      .select()
      .from(presentationSlides)
      .where(and(eq(presentationSlides.id, input.slideId), eq(presentationSlides.deckId, input.deckId)))
      .limit(1);

    if (!existing[0]) {
      return false;
    }

    await tx
      .delete(presentationSlides)
      .where(and(eq(presentationSlides.id, input.slideId), eq(presentationSlides.deckId, input.deckId)));

    const remaining = await tx
      .select({ id: presentationSlides.id })
      .from(presentationSlides)
      .where(eq(presentationSlides.deckId, input.deckId))
      .orderBy(presentationSlides.orderIndex);

    await tx
      .update(presentationSlides)
      .set({ orderIndex: sql`${presentationSlides.orderIndex} + 10000` })
      .where(eq(presentationSlides.deckId, input.deckId));

    for (let index = 0; index < remaining.length; index += 1) {
      await tx
        .update(presentationSlides)
        .set({
          orderIndex: index,
          version: sql`${presentationSlides.version} + 1`,
          updatedAt: new Date(),
        })
        .where(and(eq(presentationSlides.id, remaining[index].id), eq(presentationSlides.deckId, input.deckId)));
    }

    await tx
      .update(presentationDecks)
      .set({
        slideCount: sql`GREATEST(0, ${presentationDecks.slideCount} - 1)`,
        version: deck.version + 1,
        updatedAt: new Date(),
      })
      .where(eq(presentationDecks.id, input.deckId));

    return true;
  });

  return { deleted };
}

export async function reorderSlidesInDeck(
  input: ReorderPresentationSlidesInput,
  actor: PresentationActor,
  dbClient?: DbClient,
): Promise<{ slideIds: number[] }> {
  const { deck } = await resolveDeckContext(input.deckId, actor, { write: true }, dbClient);
  ensureExpectedDeckVersion(deck, input.expectedVersion);
  const slideIds = await reorderPresentationSlides(
    {
      deckId: input.deckId,
      movedSlideId: input.movedSlideId,
      targetIndex: input.targetIndex,
    },
    dbClient,
  );
  return { slideIds };
}

export async function listAssetsForDeck(
  input: ListPresentationAssetsInput,
  actor: PresentationActor,
  dbClient?: DbClient,
): Promise<PresentationAssetLink[]> {
  const { deck, db } = await resolveDeckContext(input.deckId, actor, { write: false }, dbClient);
  if (input.slideId === undefined || input.slideId === null) {
    return db
      .select()
      .from(presentationAssetLinks)
      .where(eq(presentationAssetLinks.deckId, deck.id));
  }

  return db
    .select()
    .from(presentationAssetLinks)
    .where(and(eq(presentationAssetLinks.deckId, deck.id), eq(presentationAssetLinks.slideId, input.slideId)));
}

export async function attachAssetToDeck(
  input: AttachPresentationAssetInput,
  actor: PresentationActor,
  dbClient?: DbClient,
): Promise<{ link: PresentationAssetLink; totals: { totalAssetBytes: number; warningExceeded: boolean; hardLimitExceeded: boolean } }> {
  if (!Number.isFinite(input.byteSize) || input.byteSize < 0) {
    throw new PresentationServiceError(
      PRESENTATION_ERROR_CODE.VALIDATION_FAILED,
      `${PRESENTATION_ERROR_CODE.VALIDATION_FAILED}: byteSize must be a non-negative number`,
    );
  }

  const { deck, db } = await resolveDeckContext(input.deckId, actor, { write: true }, dbClient);
  ensureExpectedDeckVersion(deck, input.expectedVersion);
  await resolveReadableLibraryItem(input.libraryItemId, actor);

  const existingRows = await db
    .select()
    .from(presentationAssetLinks)
    .where(and(
      eq(presentationAssetLinks.deckId, input.deckId),
      eq(presentationAssetLinks.libraryItemId, input.libraryItemId),
      input.slideId === undefined || input.slideId === null
        ? sql`${presentationAssetLinks.slideId} IS NULL`
        : eq(presentationAssetLinks.slideId, input.slideId),
    ))
    .limit(1);

  const existing = existingRows[0] ?? null;

  if (!existing) {
    const countRows = await db
      .select({ value: count() })
      .from(presentationAssetLinks)
      .where(eq(presentationAssetLinks.deckId, deck.id));

    const currentAssetCount = Number(countRows[0]?.value ?? 0);
    if (currentAssetCount >= PRESENTATION_LIMITS.maxAssetsPerDeck) {
      throw new PresentationServiceError(
        PRESENTATION_ERROR_CODE.ASSET_LIMIT_EXCEEDED,
        `${PRESENTATION_ERROR_CODE.ASSET_LIMIT_EXCEEDED}: max ${PRESENTATION_LIMITS.maxAssetsPerDeck} assets per deck`,
      );
    }
  }

  const projectedTotalBytes = Math.max(
    0,
    deck.totalAssetBytes - (existing?.byteSize ?? 0) + input.byteSize,
  );
  if (projectedTotalBytes >= PRESENTATION_LIMITS.hardDeckSizeBytes) {
    throw new PresentationServiceError(
      PRESENTATION_ERROR_CODE.DECK_SIZE_LIMIT_EXCEEDED,
      `${PRESENTATION_ERROR_CODE.DECK_SIZE_LIMIT_EXCEEDED}: max deck size is ${PRESENTATION_LIMITS.hardDeckSizeBytes} bytes`,
    );
  }

  return attachPresentationAsset(
    {
      tenantId: actor.tenantId,
      deckId: input.deckId,
      slideId: input.slideId ?? null,
      libraryItemId: input.libraryItemId,
      byteSize: input.byteSize,
    },
    db,
  );
}

export async function detachAssetFromDeck(
  input: DetachPresentationAssetInput,
  actor: PresentationActor,
  dbClient?: DbClient,
): Promise<{ deleted: boolean; totals?: { totalAssetBytes: number; warningExceeded: boolean; hardLimitExceeded: boolean } }> {
  const { deck, db } = await resolveDeckContext(input.deckId, actor, { write: true }, dbClient);
  ensureExpectedDeckVersion(deck, input.expectedVersion);
  const rows = await db
    .select({ id: presentationAssetLinks.id })
    .from(presentationAssetLinks)
    .where(and(eq(presentationAssetLinks.id, input.linkId), eq(presentationAssetLinks.deckId, deck.id)))
    .limit(1);

  if (!rows[0]) {
    return { deleted: false };
  }

  return detachPresentationAsset(input.linkId, db);
}
