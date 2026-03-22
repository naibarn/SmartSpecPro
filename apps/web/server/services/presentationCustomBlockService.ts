import crypto from "node:crypto";
import { and, desc, eq, inArray } from "drizzle-orm";

import { getDb } from "../db";
import { storageDelete, storagePut } from "../storage";
import { contentArtifacts } from "../../drizzle/schema";
import {
  PRESENTATION_CUSTOM_BLOCK_OUTPUT_FORMAT,
  PRESENTATION_CUSTOM_BLOCK_PREVIEW_RENDERER_VERSION,
  PRESENTATION_CUSTOM_BLOCK_SKILL_SLUG,
  PRESENTATION_CUSTOM_BLOCK_GOVERNANCE_OUTPUT_FORMAT,
  PRESENTATION_CUSTOM_BLOCK_GOVERNANCE_SKILL_SLUG,
  PRESENTATION_PREVIEW_CACHE_OUTPUT_FORMAT,
  PRESENTATION_PREVIEW_CACHE_SKILL_SLUG,
  presentationCustomBlockCreateInputSchema,
  presentationCustomBlockGovernanceAuditInputSchema,
  presentationCustomBlockListInputSchema,
  presentationCustomBlockRenderPreviewInputSchema,
  presentationCustomBlockUpdateInputSchema,
  presentationCustomBlockTrackUseInputSchema,
  presentationPreviewCacheRecordSchema,
  presentationCustomBlockRecordSchema,
  presentationCustomBlockGovernanceAuditRecordSchema,
  type PresentationCustomBlock,
  type PresentationCustomBlockCreateInput,
  type PresentationCustomBlockGovernanceAuditEntry,
  type PresentationCustomBlockGovernanceAuditInput,
  type PresentationCustomBlockGovernanceAuditRecord,
  type PresentationCustomBlockGovernanceEvent,
  type PresentationCustomBlockListInput,
  type PresentationCustomBlockPreviewSource,
  type PresentationCustomBlockRenderPreviewInput,
  type PresentationCustomBlockRenderPreviewResult,
  type PresentationPreviewCacheRecord,
  type PresentationCustomBlockUpdateInput,
  type PresentationCustomBlockTrackUseInput,
  type PresentationCustomBlockRecord,
} from "@shared/presentation/customBlocks";
import { PRESENTATION_ERROR_CODE } from "@shared/presentation/constants";
import { buildPresentationBlockPreviewSvg } from "@shared/presentation/blockPreviewSvg";
import { PresentationServiceError, type PresentationActor } from "./presentationService";

interface ArtifactRow {
  id: number;
  userId: number;
  contentJson: unknown;
  createdAt: Date;
}

const PRESENTATION_PREVIEW_CACHE_ARTIFACT_PREFIX = "presentation/preview-cache";
const PRESENTATION_PREVIEW_CACHE_MAX_ENTRIES = 256;
const PRESENTATION_PREVIEW_CACHE_MAX_PERSISTED_ROWS = 512;
const PRESENTATION_PREVIEW_CACHE_RETENTION_DAYS = 45;

const renderedPreviewArtifactCache = new Map<string, PresentationCustomBlockRenderPreviewResult>();

export function resetPresentationPreviewArtifactCacheForTests(): void {
  renderedPreviewArtifactCache.clear();
}

function buildPresentationPreviewCacheUrl(rawUrl: string): string {
  const value = rawUrl.trim();
  if (!value) {
    return value;
  }
  if (
    value.startsWith("data:")
    || value.startsWith("/api/media/image-proxy")
    || value.startsWith("/api/storage/files/")
    || value.startsWith("/uploads/")
    || value.startsWith("/")
  ) {
    return value;
  }
  if (/^https?:\/\//i.test(value)) {
    return `/api/media/image-proxy?url=${encodeURIComponent(value)}`;
  }
  return value;
}

function buildPresentationPreviewCacheArtifactKey(
  tenantId: string,
  previewHash: string,
): string {
  return [
    PRESENTATION_PREVIEW_CACHE_ARTIFACT_PREFIX,
    tenantId,
    `${previewHash}.svg`,
  ].join("/");
}

function buildRenderedPreviewCacheId(
  tenantId: string,
  previewHash: string,
  rendererVersion: string,
): string {
  return `${tenantId}:${rendererVersion}:${previewHash}`;
}

function rememberRenderedPreviewArtifact(
  key: string,
  preview: PresentationCustomBlockRenderPreviewResult,
): PresentationCustomBlockRenderPreviewResult {
  renderedPreviewArtifactCache.set(key, preview);
  if (renderedPreviewArtifactCache.size > PRESENTATION_PREVIEW_CACHE_MAX_ENTRIES) {
    const oldestKey = renderedPreviewArtifactCache.keys().next().value;
    if (oldestKey) {
      renderedPreviewArtifactCache.delete(oldestKey);
    }
  }
  return preview;
}

function toPreviewCacheResult(
  record: PresentationPreviewCacheRecord,
  svg: string,
): PresentationCustomBlockRenderPreviewResult {
  return {
    previewHash: record.previewHash,
    rendererVersion: record.rendererVersion,
    artifactKey: record.artifactKey,
    artifactUrl: record.artifactUrl,
    generatedAt: record.generatedAt,
    svg,
  };
}

function buildGovernanceAuditArtifactContent(
  entry: PresentationCustomBlockGovernanceAuditEntry,
): PresentationCustomBlockGovernanceAuditRecord {
  return presentationCustomBlockGovernanceAuditRecordSchema.parse({
    ...entry,
    indexedAt: new Date().toISOString(),
  });
}

function isSharedPresentationPreviewArtifactKey(artifactKey: string | undefined): boolean {
  return typeof artifactKey === "string" && artifactKey.startsWith(`${PRESENTATION_PREVIEW_CACHE_ARTIFACT_PREFIX}/`);
}

function buildRenderedPresentationCustomBlockPreview(
  previewSource: PresentationCustomBlockPreviewSource,
): PresentationCustomBlockRenderPreviewResult {
  const svg = buildPresentationBlockPreviewSvg(
    previewSource.fallbackElements,
    previewSource.canvas,
    previewSource.background,
    {
      resolveImageUrl: buildPresentationPreviewCacheUrl,
    },
  );
  const previewHash = crypto.createHash("sha256").update(svg).digest("hex");
  return {
    svg,
    previewHash,
    rendererVersion: PRESENTATION_CUSTOM_BLOCK_PREVIEW_RENDERER_VERSION,
    generatedAt: new Date().toISOString(),
    artifactKey: "",
    artifactUrl: "",
  };
}

function canAdministerTeamPresentationBlocks(actor: Pick<PresentationActor, "role">): boolean {
  return actor.role === "admin" || actor.role === "super_admin" || actor.role === "domain_admin";
}

function appendGovernanceEvent(
  record: PresentationCustomBlockRecord,
  event: PresentationCustomBlockGovernanceEvent,
): PresentationCustomBlockRecord {
  return {
    ...record,
    governanceEvents: [...record.governanceEvents, event].slice(-32),
  };
}

function toPresentationCustomBlock(
  row: ArtifactRow,
  actor: Pick<PresentationActor, "userId" | "role">,
): PresentationCustomBlock | null {
  const parsed = presentationCustomBlockRecordSchema.safeParse(row.contentJson);
  if (!parsed.success) {
    return null;
  }

  if (parsed.data.visibility === "private" && row.userId !== actor.userId) {
    return null;
  }

  const isOwner = row.userId === actor.userId;
  const canAdministerTeam = canAdministerTeamPresentationBlocks(actor);

  return {
    id: String(row.id),
    ownerUserId: row.userId,
    canDelete: isOwner,
    canFeature: parsed.data.visibility === "team" && canAdministerTeam,
    canTransferOwnership: canAdministerTeam,
    isFavorite: parsed.data.favoriteUserIds.includes(actor.userId),
    ...parsed.data,
  };
}

function parseBlockId(blockId: string): number {
  const normalizedId = Number(blockId);
  if (!Number.isInteger(normalizedId) || normalizedId <= 0) {
    throw new PresentationServiceError(
      PRESENTATION_ERROR_CODE.NOT_FOUND,
      `${PRESENTATION_ERROR_CODE.NOT_FOUND}: custom block ${blockId} not found`,
    );
  }
  return normalizedId;
}

async function getActiveArtifactRow(
  db: NonNullable<Awaited<ReturnType<typeof getDb>>>,
  blockId: string,
  actor: PresentationActor,
): Promise<ArtifactRow> {
  const normalizedId = parseBlockId(blockId);
  const [row] = await db
    .select({
      id: contentArtifacts.id,
      userId: contentArtifacts.userId,
      contentJson: contentArtifacts.contentJson,
      createdAt: contentArtifacts.createdAt,
    })
    .from(contentArtifacts)
    .where(and(
      eq(contentArtifacts.id, normalizedId),
      eq(contentArtifacts.tenantId, actor.tenantId),
      eq(contentArtifacts.skillSlug, PRESENTATION_CUSTOM_BLOCK_SKILL_SLUG),
      eq(contentArtifacts.outputFormat, PRESENTATION_CUSTOM_BLOCK_OUTPUT_FORMAT),
      eq(contentArtifacts.status, "active"),
    ))
    .limit(1);

  if (!row) {
    throw new PresentationServiceError(
      PRESENTATION_ERROR_CODE.NOT_FOUND,
      `${PRESENTATION_ERROR_CODE.NOT_FOUND}: custom block ${blockId} not found`,
    );
  }
  return row;
}

async function findPersistedPresentationPreviewArtifact(
  db: NonNullable<Awaited<ReturnType<typeof getDb>>>,
  tenantId: string,
  renderedPreview: PresentationCustomBlockRenderPreviewResult,
): Promise<PresentationCustomBlockRenderPreviewResult | null> {
  const rows = await db
    .select({
      id: contentArtifacts.id,
      userId: contentArtifacts.userId,
      contentJson: contentArtifacts.contentJson,
      createdAt: contentArtifacts.createdAt,
    })
    .from(contentArtifacts)
    .where(and(
      eq(contentArtifacts.tenantId, tenantId),
      eq(contentArtifacts.skillSlug, PRESENTATION_PREVIEW_CACHE_SKILL_SLUG),
      eq(contentArtifacts.outputFormat, PRESENTATION_PREVIEW_CACHE_OUTPUT_FORMAT),
      eq(contentArtifacts.status, "active"),
    ))
    .orderBy(desc(contentArtifacts.createdAt))
    .limit(200);

  for (const row of rows) {
    const parsed = presentationPreviewCacheRecordSchema.safeParse(row.contentJson);
    if (!parsed.success) {
      continue;
    }
    if (
      parsed.data.previewHash === renderedPreview.previewHash
      && parsed.data.rendererVersion === renderedPreview.rendererVersion
    ) {
      return toPreviewCacheResult(parsed.data, renderedPreview.svg);
    }
  }

  return null;
}

async function persistPresentationPreviewArtifactIndex(
  db: NonNullable<Awaited<ReturnType<typeof getDb>>>,
  actor: Pick<PresentationActor, "tenantId" | "userId">,
  preview: PresentationCustomBlockRenderPreviewResult,
): Promise<void> {
  const cacheRecord = presentationPreviewCacheRecordSchema.parse({
    previewHash: preview.previewHash,
    rendererVersion: preview.rendererVersion,
    artifactKey: preview.artifactKey,
    artifactUrl: preview.artifactUrl,
    generatedAt: preview.generatedAt,
  });

  await db
    .insert(contentArtifacts)
    .values({
      tenantId: actor.tenantId,
      userId: actor.userId,
      skillSlug: PRESENTATION_PREVIEW_CACHE_SKILL_SLUG,
      outputFormat: PRESENTATION_PREVIEW_CACHE_OUTPUT_FORMAT,
      contentJson: cacheRecord,
      status: "active",
      lastVerifiedAt: new Date(),
      nextRefreshAt: null,
      refreshCadenceDays: 365,
    });
}

async function cleanupPersistedPresentationPreviewArtifacts(
  db: NonNullable<Awaited<ReturnType<typeof getDb>>>,
  tenantId: string,
): Promise<void> {
  const cutoff = Date.now() - (PRESENTATION_PREVIEW_CACHE_RETENTION_DAYS * 24 * 60 * 60 * 1000);
  const rows = await db
    .select({
      id: contentArtifacts.id,
      createdAt: contentArtifacts.createdAt,
    })
    .from(contentArtifacts)
    .where(and(
      eq(contentArtifacts.tenantId, tenantId),
      eq(contentArtifacts.skillSlug, PRESENTATION_PREVIEW_CACHE_SKILL_SLUG),
      eq(contentArtifacts.outputFormat, PRESENTATION_PREVIEW_CACHE_OUTPUT_FORMAT),
      eq(contentArtifacts.status, "active"),
    ))
    .orderBy(desc(contentArtifacts.createdAt))
    .limit(PRESENTATION_PREVIEW_CACHE_MAX_PERSISTED_ROWS * 2);

  const idsToArchive = rows
    .filter((row, index) => index >= PRESENTATION_PREVIEW_CACHE_MAX_PERSISTED_ROWS || row.createdAt.getTime() < cutoff)
    .map((row) => row.id);

  if (idsToArchive.length === 0) {
    return;
  }

  await db
    .update(contentArtifacts)
    .set({
      status: "archived",
      updatedAt: new Date(),
    })
    .where(inArray(contentArtifacts.id, idsToArchive));
}

async function persistPresentationCustomBlockGovernanceAuditEntries(
  db: NonNullable<Awaited<ReturnType<typeof getDb>>>,
  actor: Pick<PresentationActor, "tenantId">,
  entries: PresentationCustomBlockGovernanceAuditEntry[],
): Promise<void> {
  if (entries.length === 0) {
    return;
  }

  await db
    .insert(contentArtifacts)
    .values(entries.map((entry) => ({
      tenantId: actor.tenantId,
      userId: entry.ownerUserId,
      skillSlug: PRESENTATION_CUSTOM_BLOCK_GOVERNANCE_SKILL_SLUG,
      outputFormat: PRESENTATION_CUSTOM_BLOCK_GOVERNANCE_OUTPUT_FORMAT,
      contentJson: buildGovernanceAuditArtifactContent(entry),
      status: "active",
      lastVerifiedAt: new Date(),
      nextRefreshAt: null,
      refreshCadenceDays: 365,
    })) as any);
}

async function createCanonicalPreviewArtifact(
  record: PresentationCustomBlockRecord,
  actor: Pick<PresentationActor, "tenantId"> & { userId: number },
): Promise<PresentationCustomBlockRecord> {
  if (!record.previewSource) {
    return record;
  }

  const renderedPreview = await renderPresentationCustomBlockPreview(
    { previewSource: record.previewSource },
    actor,
  );
  return {
    ...record,
    preview: {
      artifactKey: renderedPreview.artifactKey,
      artifactUrl: renderedPreview.artifactUrl,
      previewHash: renderedPreview.previewHash,
      rendererVersion: renderedPreview.rendererVersion,
      generatedAt: renderedPreview.generatedAt,
    },
  };
}

export async function renderPresentationCustomBlockPreview(
  input: PresentationCustomBlockRenderPreviewInput,
  actor?: Pick<PresentationActor, "tenantId" | "userId">,
): Promise<PresentationCustomBlockRenderPreviewResult> {
  const parsed = presentationCustomBlockRenderPreviewInputSchema.parse(input);
  const renderedPreview = buildRenderedPresentationCustomBlockPreview(parsed.previewSource);
  if (!actor?.tenantId || !actor.userId) {
    return renderedPreview;
  }

  const cacheId = buildRenderedPreviewCacheId(
    actor.tenantId,
    renderedPreview.previewHash,
    renderedPreview.rendererVersion,
  );
  const cached = renderedPreviewArtifactCache.get(cacheId);
  if (cached) {
    return cached;
  }

  const db = await getDb();
  if (db) {
    const persisted = await findPersistedPresentationPreviewArtifact(db, actor.tenantId, renderedPreview);
    if (persisted) {
      return rememberRenderedPreviewArtifact(cacheId, persisted);
    }
  }

  const artifactKey = buildPresentationPreviewCacheArtifactKey(actor.tenantId, renderedPreview.previewHash);
  const storedPreview = await storagePut(artifactKey, renderedPreview.svg, "image/svg+xml");
  const previewResult = rememberRenderedPreviewArtifact(cacheId, {
    ...renderedPreview,
    artifactKey: storedPreview.key,
    artifactUrl: storedPreview.url,
  });
  if (db) {
    await persistPresentationPreviewArtifactIndex(db, actor, previewResult);
    await cleanupPersistedPresentationPreviewArtifacts(db, actor.tenantId);
  }
  return previewResult;
}

async function ensureCanonicalPreviewForRow(
  db: NonNullable<Awaited<ReturnType<typeof getDb>>>,
  row: ArtifactRow,
  actor: PresentationActor,
): Promise<ArtifactRow> {
  const parsed = presentationCustomBlockRecordSchema.safeParse(row.contentJson);
  if (!parsed.success) {
    return row;
  }

  const preview = parsed.data.preview;
  const previewMissing = !preview;
  const previewStale = preview?.rendererVersion !== PRESENTATION_CUSTOM_BLOCK_PREVIEW_RENDERER_VERSION;
  if ((!previewMissing && !previewStale) || !parsed.data.previewSource) {
    return row;
  }

  const nextRecord = await createCanonicalPreviewArtifact(parsed.data, {
    tenantId: actor.tenantId,
    userId: row.userId,
  });
  if (preview?.artifactKey && !isSharedPresentationPreviewArtifactKey(preview.artifactKey)) {
    await storageDelete(preview.artifactKey).catch(() => undefined);
  }
  await db
    .update(contentArtifacts)
    .set({
      contentJson: nextRecord,
      updatedAt: new Date(),
    })
    .where(eq(contentArtifacts.id, row.id));

  return {
    ...row,
    contentJson: nextRecord,
  };
}

export async function listPresentationCustomBlocks(
  input: PresentationCustomBlockListInput,
  actor: PresentationActor,
): Promise<PresentationCustomBlock[]> {
  const db = await getDb();
  if (!db) {
    return [];
  }
  const parsedInput = presentationCustomBlockListInputSchema.parse(input);
  const searchQuery = parsedInput.search?.trim().toLowerCase() ?? "";

  const rows = await db
    .select({
      id: contentArtifacts.id,
      userId: contentArtifacts.userId,
      contentJson: contentArtifacts.contentJson,
      createdAt: contentArtifacts.createdAt,
    })
    .from(contentArtifacts)
    .where(and(
      eq(contentArtifacts.tenantId, actor.tenantId),
      eq(contentArtifacts.skillSlug, PRESENTATION_CUSTOM_BLOCK_SKILL_SLUG),
      eq(contentArtifacts.outputFormat, PRESENTATION_CUSTOM_BLOCK_OUTPUT_FORMAT),
      eq(contentArtifacts.status, "active"),
    ))
    .orderBy(desc(contentArtifacts.createdAt));

  const hydratedRows = await Promise.all(rows.map((row) => ensureCanonicalPreviewForRow(db, row, actor)));

  return hydratedRows
    .map((row) => toPresentationCustomBlock(row, actor))
    .filter((row): row is PresentationCustomBlock => row !== null)
    .filter((block) => {
      if (parsedInput.scope === "mine" && block.ownerUserId !== actor.userId) {
        return false;
      }
      if (parsedInput.scope === "team" && block.visibility !== "team") {
        return false;
      }
      if (!searchQuery) {
        return true;
      }
      const haystack = [
        block.label,
        block.description,
        block.category,
        block.componentId,
      ].join(" ").toLowerCase();
      return haystack.includes(searchQuery);
    })
    .sort((left, right) => {
      if (parsedInput.sort === "a_z") {
        return left.label.localeCompare(right.label);
      }
      const leftGovernanceAt = left.governanceEvents.reduce((latest, event) => {
        const nextTs = Date.parse(event.recordedAt) || 0;
        return Math.max(latest, nextTs);
      }, 0);
      const rightGovernanceAt = right.governanceEvents.reduce((latest, event) => {
        const nextTs = Date.parse(event.recordedAt) || 0;
        return Math.max(latest, nextTs);
      }, 0);
      if (parsedInput.sort === "most_used") {
        if (right.usageCount !== left.usageCount) {
          return right.usageCount - left.usageCount;
        }
        return right.savedAt.localeCompare(left.savedAt);
      }
      if (parsedInput.sort === "recent_activity") {
        if (rightGovernanceAt !== leftGovernanceAt) {
          return rightGovernanceAt - leftGovernanceAt;
        }
        return right.savedAt.localeCompare(left.savedAt);
      }
      if (parsedInput.sort === "newest") {
        return right.savedAt.localeCompare(left.savedAt);
      }
      const leftFeatured = left.isTeamFeatured || left.isPinned || left.isFavorite;
      const rightFeatured = right.isTeamFeatured || right.isPinned || right.isFavorite;
      if (leftFeatured !== rightFeatured) {
        return leftFeatured ? -1 : 1;
      }
      if (left.isTeamFeatured !== right.isTeamFeatured) {
        return left.isTeamFeatured ? -1 : 1;
      }
      if (left.isPinned !== right.isPinned) {
        return left.isPinned ? -1 : 1;
      }
      if (left.isFavorite !== right.isFavorite) {
        return left.isFavorite ? -1 : 1;
      }
      if (right.usageCount !== left.usageCount) {
        return right.usageCount - left.usageCount;
      }
      return right.savedAt.localeCompare(left.savedAt);
    })
    .slice(0, parsedInput.limit);
}

export async function listPresentationCustomBlockGovernanceAudit(
  input: PresentationCustomBlockGovernanceAuditInput,
  actor: PresentationActor,
): Promise<PresentationCustomBlockGovernanceAuditEntry[]> {
  const db = await getDb();
  if (!db) {
    return [];
  }

  const parsedInput = presentationCustomBlockGovernanceAuditInputSchema.parse(input);
  const searchQuery = parsedInput.search?.trim().toLowerCase() ?? "";

  const indexedRows = await db
    .select({
      id: contentArtifacts.id,
      userId: contentArtifacts.userId,
      contentJson: contentArtifacts.contentJson,
      createdAt: contentArtifacts.createdAt,
    })
    .from(contentArtifacts)
    .where(and(
      eq(contentArtifacts.tenantId, actor.tenantId),
      eq(contentArtifacts.skillSlug, PRESENTATION_CUSTOM_BLOCK_GOVERNANCE_SKILL_SLUG),
      eq(contentArtifacts.outputFormat, PRESENTATION_CUSTOM_BLOCK_GOVERNANCE_OUTPUT_FORMAT),
      eq(contentArtifacts.status, "active"),
    ))
    .orderBy(desc(contentArtifacts.createdAt))
    .limit(Math.max(parsedInput.limit * 3, 100));

  const indexedEntries = indexedRows
    .map((row) => presentationCustomBlockGovernanceAuditRecordSchema.safeParse(row.contentJson))
    .filter((parsed): parsed is { success: true; data: PresentationCustomBlockGovernanceAuditRecord } => parsed.success)
    .map((parsed) => ({
      blockId: parsed.data.blockId,
      blockLabel: parsed.data.blockLabel,
      ownerUserId: parsed.data.ownerUserId,
      visibility: parsed.data.visibility,
      eventType: parsed.data.eventType,
      actorUserId: parsed.data.actorUserId,
      actorRole: parsed.data.actorRole,
      recordedAt: parsed.data.recordedAt,
      detail: parsed.data.detail,
    }))
    .filter((entry) => {
      if (parsedInput.eventType !== "all" && entry.eventType !== parsedInput.eventType) {
        return false;
      }
      if (!searchQuery) {
        return true;
      }
      return [
        entry.blockLabel,
        entry.detail ?? "",
        entry.actorRole,
        entry.eventType,
      ].join(" ").toLowerCase().includes(searchQuery);
    })
    .sort((left, right) => {
      const leftTs = Date.parse(left.recordedAt) || 0;
      const rightTs = Date.parse(right.recordedAt) || 0;
      return rightTs - leftTs;
    })
    .slice(0, parsedInput.limit);

  if (indexedEntries.length > 0) {
    return indexedEntries;
  }

  const rows = await db
    .select({
      id: contentArtifacts.id,
      userId: contentArtifacts.userId,
      contentJson: contentArtifacts.contentJson,
      createdAt: contentArtifacts.createdAt,
    })
    .from(contentArtifacts)
    .where(and(
      eq(contentArtifacts.tenantId, actor.tenantId),
      eq(contentArtifacts.skillSlug, PRESENTATION_CUSTOM_BLOCK_SKILL_SLUG),
      eq(contentArtifacts.outputFormat, PRESENTATION_CUSTOM_BLOCK_OUTPUT_FORMAT),
      eq(contentArtifacts.status, "active"),
    ))
    .orderBy(desc(contentArtifacts.createdAt));

  return rows
    .flatMap((row) => {
      const parsed = presentationCustomBlockRecordSchema.safeParse(row.contentJson);
      if (!parsed.success) {
        return [];
      }
      return parsed.data.governanceEvents.map((event) => ({
        blockId: String(row.id),
        blockLabel: parsed.data.label,
        ownerUserId: row.userId,
        visibility: parsed.data.visibility,
        eventType: event.eventType,
        actorUserId: event.actorUserId,
        actorRole: event.actorRole,
        recordedAt: event.recordedAt,
        detail: event.detail,
      }));
    })
    .filter((entry) => {
      if (parsedInput.eventType !== "all" && entry.eventType !== parsedInput.eventType) {
        return false;
      }
      if (!searchQuery) {
        return true;
      }
      return [
        entry.blockLabel,
        entry.detail ?? "",
        entry.actorRole,
        entry.eventType,
      ].join(" ").toLowerCase().includes(searchQuery);
    })
    .sort((left, right) => {
      const leftTs = Date.parse(left.recordedAt) || 0;
      const rightTs = Date.parse(right.recordedAt) || 0;
      return rightTs - leftTs;
    })
    .slice(0, parsedInput.limit);
}

export async function savePresentationCustomBlock(
  input: PresentationCustomBlockCreateInput,
  actor: PresentationActor,
): Promise<PresentationCustomBlock> {
  const db = await getDb();
  if (!db) {
    throw new PresentationServiceError(
      PRESENTATION_ERROR_CODE.FEATURE_DISABLED,
      `${PRESENTATION_ERROR_CODE.FEATURE_DISABLED}: database unavailable for custom block save`,
    );
  }

  const parsed = presentationCustomBlockCreateInputSchema.parse(input);
  const savedAt = new Date().toISOString();

  const contentRecord = await createCanonicalPreviewArtifact(presentationCustomBlockRecordSchema.parse({
    label: parsed.label,
    description: parsed.description,
    category: "Custom",
    componentId: parsed.componentId,
    slotBindings: parsed.slotBindings,
    savedAt,
    visibility: parsed.visibility,
    isPinned: false,
    isTeamFeatured: false,
    usageCount: 0,
    favoriteUserIds: [],
    previewSource: parsed.previewSource,
  }), actor);

  const [row] = await db
    .insert(contentArtifacts)
    .values({
      tenantId: actor.tenantId,
      userId: actor.userId,
      skillSlug: PRESENTATION_CUSTOM_BLOCK_SKILL_SLUG,
      outputFormat: PRESENTATION_CUSTOM_BLOCK_OUTPUT_FORMAT,
      contentJson: contentRecord,
      status: "active",
      lastVerifiedAt: new Date(),
      nextRefreshAt: null,
      refreshCadenceDays: 365,
    })
    .returning({
      id: contentArtifacts.id,
      userId: contentArtifacts.userId,
      contentJson: contentArtifacts.contentJson,
      createdAt: contentArtifacts.createdAt,
    });

  const block = row ? toPresentationCustomBlock(row, actor) : null;
  if (!block) {
    throw new PresentationServiceError(
      PRESENTATION_ERROR_CODE.AI_INVALID_RESPONSE,
      `${PRESENTATION_ERROR_CODE.AI_INVALID_RESPONSE}: failed to persist custom block`,
    );
  }

  return block;
}

export async function deletePresentationCustomBlock(
  blockId: string,
  actor: PresentationActor,
): Promise<{ deleted: true }> {
  const db = await getDb();
  if (!db) {
    throw new PresentationServiceError(
      PRESENTATION_ERROR_CODE.FEATURE_DISABLED,
      `${PRESENTATION_ERROR_CODE.FEATURE_DISABLED}: database unavailable for custom block delete`,
    );
  }

  const row = await getActiveArtifactRow(db, blockId, actor);
  if (row.userId !== actor.userId) {
    throw new PresentationServiceError(
      PRESENTATION_ERROR_CODE.PERMISSION_DENIED,
      `${PRESENTATION_ERROR_CODE.PERMISSION_DENIED}: you cannot delete this custom block`,
    );
  }

  const parsed = presentationCustomBlockRecordSchema.safeParse(row.contentJson);
  await db
    .update(contentArtifacts)
    .set({
      status: "archived",
      updatedAt: new Date(),
    })
    .where(eq(contentArtifacts.id, row.id));

  if (parsed.success && parsed.data.preview?.artifactKey) {
    if (isSharedPresentationPreviewArtifactKey(parsed.data.preview.artifactKey)) {
      return { deleted: true };
    }
    await storageDelete(parsed.data.preview.artifactKey).catch(() => undefined);
  }

  return { deleted: true };
}

export async function updatePresentationCustomBlock(
  input: PresentationCustomBlockUpdateInput,
  actor: PresentationActor,
): Promise<PresentationCustomBlock> {
  const db = await getDb();
  if (!db) {
    throw new PresentationServiceError(
      PRESENTATION_ERROR_CODE.FEATURE_DISABLED,
      `${PRESENTATION_ERROR_CODE.FEATURE_DISABLED}: database unavailable for custom block update`,
    );
  }

  const parsedInput = presentationCustomBlockUpdateInputSchema.parse(input);
  const row = await getActiveArtifactRow(db, parsedInput.blockId, actor);
  const parsedRecord = presentationCustomBlockRecordSchema.safeParse(row.contentJson);
  if (!parsedRecord.success) {
    throw new PresentationServiceError(
      PRESENTATION_ERROR_CODE.AI_INVALID_RESPONSE,
      `${PRESENTATION_ERROR_CODE.AI_INVALID_RESPONSE}: custom block ${parsedInput.blockId} is invalid`,
    );
  }
  if (parsedRecord.data.visibility === "private" && row.userId !== actor.userId) {
    throw new PresentationServiceError(
      PRESENTATION_ERROR_CODE.PERMISSION_DENIED,
      `${PRESENTATION_ERROR_CODE.PERMISSION_DENIED}: you cannot update this custom block`,
    );
  }

  let nextRecord: PresentationCustomBlockRecord = parsedRecord.data;
  const governanceAuditEntries: PresentationCustomBlockGovernanceAuditEntry[] = [];
  if (parsedInput.favorite !== undefined) {
    const favoriteUserIds = new Set(nextRecord.favoriteUserIds);
    if (parsedInput.favorite) {
      favoriteUserIds.add(actor.userId);
    } else {
      favoriteUserIds.delete(actor.userId);
    }
    nextRecord = {
      ...nextRecord,
      favoriteUserIds: [...favoriteUserIds].sort((left, right) => left - right),
    };
  }

  if (parsedInput.visibility !== undefined || parsedInput.isPinned !== undefined) {
    if (row.userId !== actor.userId && !canAdministerTeamPresentationBlocks(actor)) {
      throw new PresentationServiceError(
        PRESENTATION_ERROR_CODE.PERMISSION_DENIED,
        `${PRESENTATION_ERROR_CODE.PERMISSION_DENIED}: only the owner can manage this custom block`,
      );
    }
    nextRecord = {
      ...nextRecord,
      ...(parsedInput.visibility !== undefined ? { visibility: parsedInput.visibility } : {}),
      ...(parsedInput.isPinned !== undefined ? { isPinned: parsedInput.isPinned } : {}),
    };
    if (parsedInput.visibility !== undefined && parsedInput.visibility !== parsedRecord.data.visibility) {
      const recordedAt = new Date().toISOString();
      nextRecord = appendGovernanceEvent(nextRecord, {
        eventType: "visibility_changed",
        actorUserId: actor.userId,
        actorRole: String(actor.role ?? "unknown"),
        recordedAt,
        detail: `Visibility changed to ${parsedInput.visibility}`,
      });
      governanceAuditEntries.push({
        blockId: parsedInput.blockId,
        blockLabel: nextRecord.label,
        ownerUserId: row.userId,
        visibility: nextRecord.visibility,
        eventType: "visibility_changed",
        actorUserId: actor.userId,
        actorRole: String(actor.role ?? "unknown"),
        recordedAt,
        detail: `Visibility changed to ${parsedInput.visibility}`,
      });
    }
    if (parsedInput.isPinned !== undefined && parsedInput.isPinned !== parsedRecord.data.isPinned) {
      const recordedAt = new Date().toISOString();
      const detail = parsedInput.isPinned ? "Block pinned" : "Block unpinned";
      nextRecord = appendGovernanceEvent(nextRecord, {
        eventType: "pinned_changed",
        actorUserId: actor.userId,
        actorRole: String(actor.role ?? "unknown"),
        recordedAt,
        detail,
      });
      governanceAuditEntries.push({
        blockId: parsedInput.blockId,
        blockLabel: nextRecord.label,
        ownerUserId: row.userId,
        visibility: nextRecord.visibility,
        eventType: "pinned_changed",
        actorUserId: actor.userId,
        actorRole: String(actor.role ?? "unknown"),
        recordedAt,
        detail,
      });
    }
  }

  if (parsedInput.isTeamFeatured !== undefined || parsedInput.transferToUserId !== undefined) {
    if (!canAdministerTeamPresentationBlocks(actor)) {
      throw new PresentationServiceError(
        PRESENTATION_ERROR_CODE.PERMISSION_DENIED,
        `${PRESENTATION_ERROR_CODE.PERMISSION_DENIED}: only a tenant admin can manage team preset governance`,
      );
    }
  }
  if (parsedInput.isTeamFeatured !== undefined) {
    nextRecord = {
      ...nextRecord,
      isTeamFeatured: parsedInput.isTeamFeatured,
      visibility: "team",
    };
    if (parsedInput.isTeamFeatured !== parsedRecord.data.isTeamFeatured) {
      const recordedAt = new Date().toISOString();
      const detail = parsedInput.isTeamFeatured ? "Block featured for team" : "Block unfeatured for team";
      nextRecord = appendGovernanceEvent(nextRecord, {
        eventType: "featured_changed",
        actorUserId: actor.userId,
        actorRole: String(actor.role ?? "unknown"),
        recordedAt,
        detail,
      });
      governanceAuditEntries.push({
        blockId: parsedInput.blockId,
        blockLabel: nextRecord.label,
        ownerUserId: row.userId,
        visibility: nextRecord.visibility,
        eventType: "featured_changed",
        actorUserId: actor.userId,
        actorRole: String(actor.role ?? "unknown"),
        recordedAt,
        detail,
      });
    }
  }

  let nextOwnerUserId = row.userId;
  if (parsedInput.transferToUserId !== undefined) {
    nextOwnerUserId = parsedInput.transferToUserId;
    nextRecord = {
      ...nextRecord,
      visibility: "team",
      isTeamFeatured: false,
    };
    if (parsedInput.transferToUserId !== row.userId) {
      const recordedAt = new Date().toISOString();
      const detail = `Ownership transferred to user ${parsedInput.transferToUserId}`;
      nextRecord = appendGovernanceEvent(nextRecord, {
        eventType: "ownership_transferred",
        actorUserId: actor.userId,
        actorRole: String(actor.role ?? "unknown"),
        recordedAt,
        detail,
      });
      governanceAuditEntries.push({
        blockId: parsedInput.blockId,
        blockLabel: nextRecord.label,
        ownerUserId: nextOwnerUserId,
        visibility: nextRecord.visibility,
        eventType: "ownership_transferred",
        actorUserId: actor.userId,
        actorRole: String(actor.role ?? "unknown"),
        recordedAt,
        detail,
      });
    }
  }

  await db
    .update(contentArtifacts)
    .set({
      userId: nextOwnerUserId,
      contentJson: nextRecord,
      updatedAt: new Date(),
    })
    .where(eq(contentArtifacts.id, row.id));

  await persistPresentationCustomBlockGovernanceAuditEntries(db, actor, governanceAuditEntries);

  const nextRow: ArtifactRow = {
    ...row,
    userId: nextOwnerUserId,
    contentJson: nextRecord,
  };
  const block = toPresentationCustomBlock(nextRow, actor);
  if (!block) {
    throw new PresentationServiceError(
      PRESENTATION_ERROR_CODE.AI_INVALID_RESPONSE,
      `${PRESENTATION_ERROR_CODE.AI_INVALID_RESPONSE}: failed to update custom block`,
    );
  }
  return block;
}

export async function trackPresentationCustomBlockUse(
  input: PresentationCustomBlockTrackUseInput,
  actor: PresentationActor,
): Promise<PresentationCustomBlock> {
  const db = await getDb();
  if (!db) {
    throw new PresentationServiceError(
      PRESENTATION_ERROR_CODE.FEATURE_DISABLED,
      `${PRESENTATION_ERROR_CODE.FEATURE_DISABLED}: database unavailable for custom block tracking`,
    );
  }

  const parsedInput = presentationCustomBlockTrackUseInputSchema.parse(input);
  const row = await getActiveArtifactRow(db, parsedInput.blockId, actor);
  const parsedRecord = presentationCustomBlockRecordSchema.safeParse(row.contentJson);
  if (!parsedRecord.success) {
    throw new PresentationServiceError(
      PRESENTATION_ERROR_CODE.AI_INVALID_RESPONSE,
      `${PRESENTATION_ERROR_CODE.AI_INVALID_RESPONSE}: custom block ${parsedInput.blockId} is invalid`,
    );
  }
  if (parsedRecord.data.visibility === "private" && row.userId !== actor.userId) {
    throw new PresentationServiceError(
      PRESENTATION_ERROR_CODE.PERMISSION_DENIED,
      `${PRESENTATION_ERROR_CODE.PERMISSION_DENIED}: you cannot use this custom block`,
    );
  }

  const nextRecord: PresentationCustomBlockRecord = {
    ...parsedRecord.data,
    usageCount: parsedRecord.data.usageCount + 1,
    lastUsedAt: new Date().toISOString(),
  };

  await db
    .update(contentArtifacts)
    .set({
      contentJson: nextRecord,
      updatedAt: new Date(),
    })
    .where(eq(contentArtifacts.id, row.id));

  const nextRow: ArtifactRow = {
    ...row,
    contentJson: nextRecord,
  };
  const block = toPresentationCustomBlock(nextRow, actor);
  if (!block) {
    throw new PresentationServiceError(
      PRESENTATION_ERROR_CODE.AI_INVALID_RESPONSE,
      `${PRESENTATION_ERROR_CODE.AI_INVALID_RESPONSE}: failed to track custom block usage`,
    );
  }
  return block;
}
