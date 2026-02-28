import crypto from "node:crypto";
import { and, count, desc, eq, sql } from "drizzle-orm";

import { getDb } from "../db";
import {
  libraryContentVersions,
  presentationAssetLinks,
  presentationDecks,
  presentationSlides,
  type LibraryContentVersion,
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
  createLibraryItem,
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
import {
  PRESENTATION_PROJECT_SOURCE,
  PRESENTATION_TEMPLATE_SOURCE,
  isPresentationTemplateItem,
} from "@shared/presentation/template";
import {
  presentationSlideContentSchema,
  presentationVersionConflictSchema,
  type AudioTrackInput,
  type ProjectAudioTrackInput,
  type PresentationVersionConflict,
} from "@shared/presentation/contracts";
import {
  incrementPresentationMetric,
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

export interface ListPresentationVersionHistoryInput {
  deckId: number;
  limit?: number;
  offset?: number;
}

export interface RestorePresentationVersionInput {
  deckId: number;
  versionId: number;
}

export interface PresentationSlideSnapshotPayload {
  schemaVersion: "presentation_slide_snapshot_v1";
  deckId: number;
  libraryItemId: number;
  slideId: number;
  slideVersion: number;
  slideTitle: string;
  slideContent: Record<string, unknown>;
  notes: string | null;
  saveMode: "manual";
  savedAt: string;
  savedByUserId: number;
}

export interface PresentationVersionHistoryItem {
  id: number;
  versionNumber: number;
  contentType: string;
  changeDescription: string | null;
  createdAt: Date;
  createdByUserId: number;
  snapshot: PresentationSlideSnapshotPayload | null;
}

export interface RestorePresentationVersionResult {
  restoredSlideId: number;
  restoredSlideVersion: number;
  deckVersion: number;
}

const PRESENTATION_SLIDE_SNAPSHOT_SCHEMA_VERSION = "presentation_slide_snapshot_v1";
const PRESENTATION_SLIDE_SNAPSHOT_CONTENT_TYPE = "presentation_slide_snapshot_v1";

export interface CreateTemplateFromPresentationInput {
  sourceLibraryItemId: number;
  templateTitle?: string;
  templateDescription?: string | null;
}

export interface CreatePresentationFromTemplateInput {
  templateLibraryItemId: number;
  title?: string;
  description?: string | null;
}

export interface ClonePresentationLibraryItemResult {
  item: LibraryItemDto;
  deck: PresentationDeck;
  slidesCopied: number;
  assetsCopied: number;
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

function computeSlideContentBytes(slideContent: unknown): number {
  try {
    return Buffer.byteLength(JSON.stringify(slideContent), "utf8");
  } catch {
    return Number.POSITIVE_INFINITY;
  }
}

function collectUnsupportedLegacyElementTypes(slideContent: Record<string, unknown>): string[] {
  const elements = (slideContent as any)?.elements;
  if (!Array.isArray(elements)) {
    return [];
  }

  const supportedTypes = new Set(["text", "image", "video", "rect", "line"]);
  const unsupported = new Set<string>();
  for (const element of elements) {
    if (!element || typeof element !== "object") {
      continue;
    }

    const type = String((element as any).type || "").trim().toLowerCase();
    if (!type || supportedTypes.has(type)) {
      continue;
    }
    unsupported.add(type);
  }

  return [...unsupported].sort();
}

function validateSlideContentPayload(slideContent: Record<string, unknown>): Record<string, unknown> {
  const parsed = presentationSlideContentSchema.safeParse(slideContent);
  if (!parsed.success) {
    const unsupportedLegacyTypes = collectUnsupportedLegacyElementTypes(slideContent);
    if (unsupportedLegacyTypes.length > 0) {
      throw new PresentationServiceError(
        PRESENTATION_ERROR_CODE.VALIDATION_FAILED,
        `${PRESENTATION_ERROR_CODE.VALIDATION_FAILED}: unsupported legacy payload for editable v2 content`,
        {
          guidanceCode: "PRESENTATION_LEGACY_PAYLOAD_BLOCKED",
          unsupportedElementTypes: unsupportedLegacyTypes,
          guidance: "Open read-only and convert this deck before editing.",
        },
      );
    }

    throw new PresentationServiceError(
      PRESENTATION_ERROR_CODE.VALIDATION_FAILED,
      `${PRESENTATION_ERROR_CODE.VALIDATION_FAILED}: slideContent failed schema validation`,
      {
        issueCount: parsed.error.issues.length,
      },
    );
  }

  const byteSize = computeSlideContentBytes(parsed.data);
  if (byteSize > PRESENTATION_LIMITS.maxSlideContentBytes) {
    throw new PresentationServiceError(
      PRESENTATION_ERROR_CODE.VALIDATION_FAILED,
      `${PRESENTATION_ERROR_CODE.VALIDATION_FAILED}: slideContent exceeds max bytes (${PRESENTATION_LIMITS.maxSlideContentBytes})`,
      {
        maxSlideContentBytes: PRESENTATION_LIMITS.maxSlideContentBytes,
        byteSize,
      },
    );
  }

  return parsed.data;
}

function parsePresentationSlideSnapshotContent(content: string): PresentationSlideSnapshotPayload | null {
  try {
    const parsed = JSON.parse(content) as Partial<PresentationSlideSnapshotPayload>;
    if (parsed?.schemaVersion !== PRESENTATION_SLIDE_SNAPSHOT_SCHEMA_VERSION) {
      return null;
    }
    if (!Number.isFinite(parsed.deckId) || !Number.isFinite(parsed.slideId) || !parsed.slideContent) {
      return null;
    }
    return {
      schemaVersion: PRESENTATION_SLIDE_SNAPSHOT_SCHEMA_VERSION,
      deckId: Number(parsed.deckId),
      libraryItemId: Number(parsed.libraryItemId),
      slideId: Number(parsed.slideId),
      slideVersion: Number(parsed.slideVersion),
      slideTitle: String(parsed.slideTitle || "Slide"),
      slideContent: parsed.slideContent as Record<string, unknown>,
      notes: parsed.notes == null ? null : String(parsed.notes),
      saveMode: "manual",
      savedAt: String(parsed.savedAt || new Date().toISOString()),
      savedByUserId: Number(parsed.savedByUserId),
    };
  } catch {
    return null;
  }
}

async function createPresentationSlideSnapshotVersion(
  db: DbClient,
  input: {
    deck: PresentationDeck;
    slide: PresentationSlide;
    actor: PresentationActor;
    changeDescription?: string;
  },
): Promise<LibraryContentVersion | null> {
  const snapshotPayload: PresentationSlideSnapshotPayload = {
    schemaVersion: PRESENTATION_SLIDE_SNAPSHOT_SCHEMA_VERSION,
    deckId: input.deck.id,
    libraryItemId: input.deck.libraryItemId,
    slideId: input.slide.id,
    slideVersion: input.slide.version,
    slideTitle: input.slide.title,
    slideContent: input.slide.slideContent as Record<string, unknown>,
    notes: input.slide.notes,
    saveMode: "manual",
    savedAt: new Date().toISOString(),
    savedByUserId: input.actor.userId,
  };

  const content = JSON.stringify(snapshotPayload);
  const contentHash = crypto
    .createHash("sha256")
    .update(content, "utf8")
    .digest("hex");
  const contentSizeBytes = Buffer.byteLength(content, "utf8");

  const existingWithHash = await db
    .select({ id: libraryContentVersions.id })
    .from(libraryContentVersions)
    .where(and(
      eq(libraryContentVersions.libraryItemId, input.deck.libraryItemId),
      eq(libraryContentVersions.contentHash, contentHash),
      eq(libraryContentVersions.contentType, PRESENTATION_SLIDE_SNAPSHOT_CONTENT_TYPE),
      eq(libraryContentVersions.tenantId, input.actor.tenantId),
    ))
    .limit(1);

  if (existingWithHash[0]) {
    return null;
  }

  const latestVersion = await db
    .select({ versionNumber: libraryContentVersions.versionNumber })
    .from(libraryContentVersions)
    .where(and(
      eq(libraryContentVersions.libraryItemId, input.deck.libraryItemId),
      eq(libraryContentVersions.tenantId, input.actor.tenantId),
    ))
    .orderBy(desc(libraryContentVersions.versionNumber))
    .limit(1);

  const nextVersionNumber = latestVersion[0]
    ? latestVersion[0].versionNumber + 1
    : 1;

  const [created] = await db
    .insert(libraryContentVersions)
    .values({
      tenantId: input.actor.tenantId,
      libraryItemId: input.deck.libraryItemId,
      versionNumber: nextVersionNumber,
      contentHash,
      content,
      contentType: PRESENTATION_SLIDE_SNAPSHOT_CONTENT_TYPE,
      contentSizeBytes,
      changeDescription: input.changeDescription ?? `Manual save: ${input.slide.title}`,
      createdByUserId: input.actor.userId,
    })
    .returning();

  return created ?? null;
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

export async function listPresentationVersionHistory(
  input: ListPresentationVersionHistoryInput,
  actor: PresentationActor,
  dbClient?: DbClient,
): Promise<PresentationVersionHistoryItem[]> {
  const { deck, db } = await resolveDeckContext(input.deckId, actor, { write: false }, dbClient);
  const limit = Math.min(Math.max(input.limit ?? 30, 1), 100);
  const offset = Math.max(input.offset ?? 0, 0);

  const rows = await db
    .select()
    .from(libraryContentVersions)
    .where(and(
      eq(libraryContentVersions.tenantId, actor.tenantId),
      eq(libraryContentVersions.libraryItemId, deck.libraryItemId),
      eq(libraryContentVersions.contentType, PRESENTATION_SLIDE_SNAPSHOT_CONTENT_TYPE),
    ))
    .orderBy(desc(libraryContentVersions.createdAt))
    .limit(limit)
    .offset(offset);

  return rows.map((row) => ({
    id: row.id,
    versionNumber: row.versionNumber,
    contentType: row.contentType,
    changeDescription: row.changeDescription ?? null,
    createdAt: row.createdAt,
    createdByUserId: row.createdByUserId,
    snapshot: parsePresentationSlideSnapshotContent(row.content),
  }));
}

export async function restorePresentationVersion(
  input: RestorePresentationVersionInput,
  actor: PresentationActor,
  dbClient?: DbClient,
): Promise<RestorePresentationVersionResult> {
  const { deck, db } = await resolveDeckContext(input.deckId, actor, { write: true }, dbClient);
  const [versionRow] = await db
    .select()
    .from(libraryContentVersions)
    .where(and(
      eq(libraryContentVersions.id, input.versionId),
      eq(libraryContentVersions.tenantId, actor.tenantId),
      eq(libraryContentVersions.libraryItemId, deck.libraryItemId),
      eq(libraryContentVersions.contentType, PRESENTATION_SLIDE_SNAPSHOT_CONTENT_TYPE),
    ))
    .limit(1);

  if (!versionRow) {
    throw new PresentationServiceError(
      PRESENTATION_ERROR_CODE.NOT_FOUND,
      `${PRESENTATION_ERROR_CODE.NOT_FOUND}: version ${input.versionId} not found`,
    );
  }

  const snapshot = parsePresentationSlideSnapshotContent(versionRow.content);
  if (!snapshot || snapshot.deckId !== deck.id) {
    throw new PresentationServiceError(
      PRESENTATION_ERROR_CODE.VALIDATION_FAILED,
      `${PRESENTATION_ERROR_CODE.VALIDATION_FAILED}: invalid presentation version payload`,
    );
  }

  const targetSlide = await getSlideById(snapshot.slideId, deck.id, db);
  if (!targetSlide) {
    throw new PresentationServiceError(
      PRESENTATION_ERROR_CODE.NOT_FOUND,
      `${PRESENTATION_ERROR_CODE.NOT_FOUND}: slide ${snapshot.slideId} not found for restore`,
    );
  }

  const restoredContent = validateSlideContentPayload(snapshot.slideContent);
  const now = new Date();
  const restoredRows = await db
    .update(presentationSlides)
    .set({
      title: snapshot.slideTitle,
      slideContent: restoredContent,
      notes: snapshot.notes,
      updatedAt: now,
      version: sql`${presentationSlides.version} + 1`,
    })
    .where(and(
      eq(presentationSlides.id, targetSlide.id),
      eq(presentationSlides.deckId, deck.id),
    ))
    .returning();

  const restoredSlide = restoredRows[0];
  if (!restoredSlide) {
    throw new PresentationServiceError(
      PRESENTATION_ERROR_CODE.NOT_FOUND,
      `${PRESENTATION_ERROR_CODE.NOT_FOUND}: failed to restore slide`,
    );
  }

  const deckRows = await db
    .update(presentationDecks)
    .set({
      version: deck.version + 1,
      updatedAt: now,
    })
    .where(eq(presentationDecks.id, deck.id))
    .returning();
  const restoredDeck = deckRows[0];

  try {
    await createPresentationSlideSnapshotVersion(db, {
      deck: {
        ...deck,
        version: restoredDeck?.version ?? deck.version + 1,
        updatedAt: now,
      },
      slide: restoredSlide,
      actor,
      changeDescription: `Restored from version ${versionRow.versionNumber}`,
    });
  } catch (snapshotError) {
    recordPresentationLog("presentation_version_snapshot_failed", {
      tenantId: actor.tenantId,
      userId: actor.userId,
      deckId: deck.id,
      slideId: restoredSlide.id,
      versionId: input.versionId,
      error: String((snapshotError as Error)?.message || "unknown"),
    });
  }

  return {
    restoredSlideId: restoredSlide.id,
    restoredSlideVersion: restoredSlide.version,
    deckVersion: restoredDeck?.version ?? (deck.version + 1),
  };
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

  // Auto-create the first slide so the user doesn't start with an empty deck.
  await createPresentationSlide(
    {
      deckId: deck.id,
      title: "Slide 1",
      slideContent: { elements: [] },
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

  const validatedSlideContent =
    input.slideContent === undefined
      ? undefined
      : validateSlideContentPayload(input.slideContent);

  return createPresentationSlide(
    {
      deckId: input.deckId,
      title: input.title,
      slideContent: validatedSlideContent,
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
  const validatedSlideContent =
    input.slideContent === undefined
      ? undefined
      : validateSlideContentPayload(input.slideContent);
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
    updates.slideContent = validatedSlideContent;
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

  incrementPresentationMetric("presentation.save.success");
  recordPresentationLog("presentation_slide_saved", {
    tenantId: actor.tenantId,
    userId: actor.userId,
    deckId: input.deckId,
    slideId: input.slideId,
    saveMode: input.saveMode ?? "manual",
  });

  if ((input.saveMode ?? "manual") === "manual") {
    try {
      await createPresentationSlideSnapshotVersion(db, {
        deck: {
          ...deck,
          version: deck.version + 1,
          updatedAt: new Date(),
        },
        slide: rows[0],
        actor,
      });
    } catch (snapshotError) {
      recordPresentationLog("presentation_version_snapshot_failed", {
        tenantId: actor.tenantId,
        userId: actor.userId,
        deckId: input.deckId,
        slideId: input.slideId,
        error: String((snapshotError as Error)?.message || "unknown"),
      });
    }
  }

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

function sanitizeTitleInput(value: string | undefined, fallback: string): string {
  const normalized = String(value || "").trim();
  return normalized || fallback;
}

async function clonePresentationDeckIntoNewLibraryItem(
  input: {
    sourceLibraryItemId: number;
    targetTitle: string;
    targetDescription?: string | null;
    targetSource: string;
    targetMetadata: Record<string, unknown>;
    requireSourceWrite: boolean;
    requireTemplateSource: boolean;
  },
  actor: PresentationActor,
  dbClient?: DbClient,
): Promise<ClonePresentationLibraryItemResult> {
  const db = await resolveDb(dbClient);
  const sourceItem = await resolveReadableLibraryItem(input.sourceLibraryItemId, actor);
  ensurePresentationItemType(sourceItem);
  ensureActiveLifecycle(sourceItem);
  if (input.requireSourceWrite) {
    await ensureWritePermission(sourceItem.id, actor);
  }
  if (input.requireTemplateSource && !isPresentationTemplateItem(sourceItem)) {
    throw new PresentationServiceError(
      PRESENTATION_ERROR_CODE.VALIDATION_FAILED,
      `${PRESENTATION_ERROR_CODE.VALIDATION_FAILED}: source item is not a presentation template`,
    );
  }

  const sourceDeck = await getDeckByLibraryItemId(sourceItem.id, actor.tenantId, db);
  if (!sourceDeck) {
    throw new PresentationServiceError(
      PRESENTATION_ERROR_CODE.NOT_FOUND,
      `${PRESENTATION_ERROR_CODE.NOT_FOUND}: no presentation deck exists for library item ${sourceItem.id}`,
    );
  }

  const sourceSlides = await listPresentationSlides(sourceDeck.id, db);
  if (sourceSlides.length > PRESENTATION_LIMITS.maxSlidesPerDeck) {
    throw new PresentationServiceError(
      PRESENTATION_ERROR_CODE.SLIDE_LIMIT_EXCEEDED,
      `${PRESENTATION_ERROR_CODE.SLIDE_LIMIT_EXCEEDED}: max ${PRESENTATION_LIMITS.maxSlidesPerDeck} slides per deck`,
    );
  }

  const sourceAssets = await db
    .select()
    .from(presentationAssetLinks)
    .where(eq(presentationAssetLinks.deckId, sourceDeck.id));
  if (sourceAssets.length > PRESENTATION_LIMITS.maxAssetsPerDeck) {
    throw new PresentationServiceError(
      PRESENTATION_ERROR_CODE.ASSET_LIMIT_EXCEEDED,
      `${PRESENTATION_ERROR_CODE.ASSET_LIMIT_EXCEEDED}: max ${PRESENTATION_LIMITS.maxAssetsPerDeck} assets per deck`,
    );
  }

  const sourceTotalAssetBytes = sourceAssets.reduce((sum, asset) => sum + Math.max(0, Number(asset.byteSize || 0)), 0);
  if (sourceTotalAssetBytes >= PRESENTATION_LIMITS.hardDeckSizeBytes) {
    throw new PresentationServiceError(
      PRESENTATION_ERROR_CODE.DECK_SIZE_LIMIT_EXCEEDED,
      `${PRESENTATION_ERROR_CODE.DECK_SIZE_LIMIT_EXCEEDED}: max deck size is ${PRESENTATION_LIMITS.hardDeckSizeBytes} bytes`,
    );
  }

  const created = await createLibraryItem(
    {
      itemType: PRESENTATION_ITEM_TYPE,
      source: input.targetSource,
      title: input.targetTitle,
      description: input.targetDescription ?? sourceItem.description,
      status: "ready",
      visibility: "private",
      metadata: input.targetMetadata,
    },
    actor,
    db,
  );
  const createdItem = created.item;
  const createdDeck = await createPresentationDeck(
    {
      tenantId: actor.tenantId,
      libraryItemId: createdItem.id,
      title: input.targetTitle,
      description: input.targetDescription ?? sourceItem.description,
    },
    db,
  );

  const slideIdMap = new Map<number, number>();
  for (const sourceSlide of sourceSlides) {
    const createdSlide = await createPresentationSlide(
      {
        deckId: createdDeck.id,
        title: sourceSlide.title,
        slideContent: sourceSlide.slideContent as Record<string, unknown>,
        notes: sourceSlide.notes,
      },
      db,
    );
    slideIdMap.set(sourceSlide.id, createdSlide.id);
  }

  if (sourceAssets.length > 0) {
    await db.insert(presentationAssetLinks).values(
      sourceAssets.map((asset) => ({
        tenantId: actor.tenantId,
        deckId: createdDeck.id,
        slideId: asset.slideId ? (slideIdMap.get(asset.slideId) ?? null) : null,
        libraryItemId: asset.libraryItemId,
        byteSize: asset.byteSize,
        createdAt: new Date(),
      })),
    );
    await db
      .update(presentationDecks)
      .set({
        totalAssetBytes: sourceTotalAssetBytes,
        version: sql`${presentationDecks.version} + 1`,
        updatedAt: new Date(),
      })
      .where(eq(presentationDecks.id, createdDeck.id));
  }

  const finalDeck = await getPresentationDeckById(createdDeck.id, actor.tenantId, db);
  if (!finalDeck) {
    throw new PresentationServiceError(
      PRESENTATION_ERROR_CODE.NOT_FOUND,
      `${PRESENTATION_ERROR_CODE.NOT_FOUND}: deck ${createdDeck.id} not found`,
    );
  }

  return {
    item: createdItem,
    deck: finalDeck,
    slidesCopied: sourceSlides.length,
    assetsCopied: sourceAssets.length,
  };
}

export async function createTemplateFromPresentation(
  input: CreateTemplateFromPresentationInput,
  actor: PresentationActor,
  dbClient?: DbClient,
): Promise<ClonePresentationLibraryItemResult> {
  const sourceItem = await resolveReadableLibraryItem(input.sourceLibraryItemId, actor);
  const templateTitle = sanitizeTitleInput(input.templateTitle, `${sourceItem.title} Template`);

  return clonePresentationDeckIntoNewLibraryItem(
    {
      sourceLibraryItemId: sourceItem.id,
      targetTitle: templateTitle,
      targetDescription: input.templateDescription ?? sourceItem.description,
      targetSource: PRESENTATION_TEMPLATE_SOURCE,
      targetMetadata: {
        source_type: PRESENTATION_TEMPLATE_SOURCE,
        presentation_type: "template",
        is_template: true,
        template_source_item_id: sourceItem.id,
        template_saved_at: new Date().toISOString(),
      },
      requireSourceWrite: true,
      requireTemplateSource: false,
    },
    actor,
    dbClient,
  );
}

export async function createPresentationFromTemplate(
  input: CreatePresentationFromTemplateInput,
  actor: PresentationActor,
  dbClient?: DbClient,
): Promise<ClonePresentationLibraryItemResult> {
  const templateItem = await resolveReadableLibraryItem(input.templateLibraryItemId, actor);
  const projectTitle = sanitizeTitleInput(input.title, `${templateItem.title} Copy`);

  return clonePresentationDeckIntoNewLibraryItem(
    {
      sourceLibraryItemId: templateItem.id,
      targetTitle: projectTitle,
      targetDescription: input.description ?? templateItem.description,
      targetSource: PRESENTATION_PROJECT_SOURCE,
      targetMetadata: {
        source_type: "presentation_document",
        presentation_type: "project",
        from_template: true,
        template_source_item_id: templateItem.id,
        template_used_at: new Date().toISOString(),
      },
      requireSourceWrite: false,
      requireTemplateSource: true,
    },
    actor,
    dbClient,
  );
}

export interface UpdateSlideAudioTrackInput {
  deckId: number;
  slideId: number;
  /** Deck version for optimistic locking — ensures no concurrent modification. */
  expectedVersion: number;
  audioTrack: AudioTrackInput | null;
}

/**
 * Updates or clears the per-slide audio track configuration.
 * Uses optimistic locking on the deck version: throws VERSION_CONFLICT if expectedVersion mismatches.
 * Returns the updated deck and slide version numbers.
 */
export async function updateSlideAudioTrack(
  input: UpdateSlideAudioTrackInput,
  actor: PresentationActor,
  dbClient?: DbClient,
): Promise<{ deckVersion: number; slideVersion: number }> {
  const { deck, db } = await resolveDeckContext(input.deckId, actor, { write: true }, dbClient);
  ensureExpectedDeckVersion(deck, input.expectedVersion);

  const currentSlide = await getSlideById(input.slideId, input.deckId, db);
  if (!currentSlide) {
    throw new PresentationServiceError(
      PRESENTATION_ERROR_CODE.NOT_FOUND,
      `${PRESENTATION_ERROR_CODE.NOT_FOUND}: slide ${input.slideId} not found in deck ${input.deckId}`,
    );
  }

  const newSlideVersion = currentSlide.version + 1;
  const newDeckVersion = deck.version + 1;

  // Wrap both UPDATE statements in a transaction to keep slide + deck versions consistent.
  // CAS guard on slide version (`eq(presentationSlides.version, currentSlide.version)`) prevents
  // lost updates from concurrent writes — matches the pattern used by updateSlideInDeck.
  const [slideVersion] = await db.transaction(async (tx) => {
    const slideRows = await tx
      .update(presentationSlides)
      .set({
        // AudioTrackInput.endAtMs is `number | undefined` while SlideAudioTrackJson.endAtMs is
        // `number | null`. The schemas are structurally equivalent at runtime; cast is safe.
        audioTrack: input.audioTrack as any,
        version: newSlideVersion,
        updatedAt: new Date(),
      })
      .where(and(
        eq(presentationSlides.id, input.slideId),
        eq(presentationSlides.deckId, input.deckId),
        // CAS: only update if slide version is still what we read
        eq(presentationSlides.version, currentSlide.version),
      ))
      .returning({ version: presentationSlides.version });

    if (!slideRows[0]) {
      throw new PresentationServiceError(
        PRESENTATION_ERROR_CODE.NOT_FOUND,
        `${PRESENTATION_ERROR_CODE.NOT_FOUND}: slide ${input.slideId} not found`,
      );
    }

    await tx
      .update(presentationDecks)
      .set({ version: newDeckVersion, updatedAt: new Date() })
      .where(eq(presentationDecks.id, input.deckId));

    return [slideRows[0].version];
  });

  return { deckVersion: newDeckVersion, slideVersion };
}

export interface UpdateDeckProjectAudioTrackInput {
  deckId: number;
  /** Deck version for optimistic locking. */
  expectedVersion: number;
  projectAudioTrack: ProjectAudioTrackInput | null;
}

/**
 * Updates or clears the deck-level project audio track.
 * Uses optimistic locking: throws VERSION_CONFLICT if expectedVersion mismatches.
 * Returns the updated deck version number.
 */
export async function updateDeckProjectAudioTrack(
  input: UpdateDeckProjectAudioTrackInput,
  actor: PresentationActor,
  dbClient?: DbClient,
): Promise<{ deckVersion: number }> {
  const { deck, db } = await resolveDeckContext(input.deckId, actor, { write: true }, dbClient);
  ensureExpectedDeckVersion(deck, input.expectedVersion);

  const newDeckVersion = deck.version + 1;

  const rows = await db
    .update(presentationDecks)
    .set({
      // ProjectAudioTrackInput.fadeOutMs is `number | undefined` while DeckAudioTrackJson.fadeOutMs
      // is `number | null`. The schemas are structurally equivalent at runtime; cast is safe.
      projectAudioTrack: input.projectAudioTrack as any,
      version: newDeckVersion,
      updatedAt: new Date(),
    })
    .where(and(
      eq(presentationDecks.id, input.deckId),
      eq(presentationDecks.tenantId, actor.tenantId),
    ))
    .returning({ version: presentationDecks.version });

  if (!rows[0]) {
    throw new PresentationServiceError(
      PRESENTATION_ERROR_CODE.NOT_FOUND,
      `${PRESENTATION_ERROR_CODE.NOT_FOUND}: deck ${input.deckId} not found`,
    );
  }

  return { deckVersion: rows[0].version };
}
