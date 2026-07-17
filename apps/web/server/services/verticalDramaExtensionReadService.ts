/**
 * Vertical Drama Series — read-only extension-facing service.
 *
 * Backs the Chrome extension side panel's "Drama Series" tab. Mirrors the
 * Production Director / Storyboard Review extension read patterns in
 * `server/routes/marketplaceCapture.ts`: every query is scoped to the
 * caller's `(tenantId, userId)`, ownership is verified before returning any
 * row, and an unowned id resolves to a 404 (never a 403, to avoid disclosing
 * existence of another tenant's/user's data).
 *
 * This service is READ-ONLY — it never inserts, updates, or deletes rows.
 */

import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { getDb } from "../db";
import {
  verticalDramaSeries,
  verticalDramaEpisodes,
  verticalDramaShotReferences,
  verticalDramaCharacters,
  verticalDramaCharacterAssets,
  mediaAssets,
} from "../../drizzle/schema";
import { resolveTenantIdVarchar } from "./tenantContext";
import { estimateVerticalDramaSpeechSeconds } from "../../shared/verticalDramaSeries/dialogueQuality";
import type {
  VerticalDramaShotgrid,
  VerticalDramaStartFramePlan,
  VerticalDramaMotionPromptPack,
} from "../../shared/verticalDramaSeries/contracts";

/* -------------------------------------------------------------------------- */
/* Shared helpers                                                             */
/* -------------------------------------------------------------------------- */

interface ExtensionAuth {
  userId: number;
  tenantId?: string;
}

function requireTenantId(auth: ExtensionAuth): string {
  const tenantId = resolveTenantIdVarchar(auth.tenantId, undefined);
  if (!tenantId) {
    throw Object.assign(new Error("Tenant context is required"), { status: 400, code: "tenant_required" });
  }
  return tenantId;
}

function toIsoOrNull(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  return (value instanceof Date ? value : new Date(value)).toISOString();
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;
}

/** Resolve a scoped set of media asset ids -> { originalUrl, thumbnailUrl }, in one query. */
async function loadMediaAssetUrlsById(
  db: ReturnType<typeof getDb>,
  tenantId: string,
  userId: number,
  assetIds: number[],
): Promise<Map<number, { originalUrl: string | null; thumbnailUrl: string | null }>> {
  const map = new Map<number, { originalUrl: string | null; thumbnailUrl: string | null }>();
  const uniqueIds = Array.from(new Set(assetIds));
  if (uniqueIds.length === 0) return map;
  const rows = await db
    .select({
      id: mediaAssets.id,
      originalUrl: mediaAssets.originalUrl,
      thumbnailUrl: mediaAssets.thumbnailUrl,
    })
    .from(mediaAssets)
    .where(and(
      eq(mediaAssets.tenantId, tenantId),
      eq(mediaAssets.userId, userId),
      inArray(mediaAssets.id, uniqueIds),
    ));
  for (const row of rows) {
    map.set(row.id, { originalUrl: row.originalUrl ?? null, thumbnailUrl: row.thumbnailUrl ?? null });
  }
  return map;
}

/** Extract the first non-null `frames[].approvedMediaAssetId` (as a number) from a startFramePlan JSONB value. */
function firstApprovedFrameAssetId(startFramePlan: unknown): number | null {
  const record = asRecord(startFramePlan);
  const frames = Array.isArray((record as { frames?: unknown } | undefined)?.frames)
    ? (record as { frames: Array<{ approvedMediaAssetId?: unknown }> }).frames
    : [];
  for (const frame of frames) {
    const raw = frame?.approvedMediaAssetId;
    if (typeof raw !== "string" && typeof raw !== "number") continue;
    const numeric = Number(raw);
    if (Number.isFinite(numeric)) return numeric;
  }
  return null;
}

/* -------------------------------------------------------------------------- */
/* 1. List drama series projects                                             */
/* -------------------------------------------------------------------------- */

export interface DramaSeriesProjectSummary {
  id: string;
  title: string;
  status: string;
  genre: string | null;
  tone: string | null;
  locale: string | null;
  episodeCount: number;
  latestEpisodeNumber: number;
  thumbnailUrl: string | null;
  updatedAt: string | null;
  createdAt: string | null;
}

export async function listDramaSeriesProjectsForExtension(
  auth: ExtensionAuth,
  input: { query?: string; limit?: number },
): Promise<{ projects: DramaSeriesProjectSummary[] }> {
  const db = getDb();
  const tenantId = requireTenantId(auth);
  const limit = Math.min(Math.max(Number(input.limit ?? 50) || 50, 1), 50);

  const seriesRows = await db
    .select({
      id: verticalDramaSeries.id,
      title: verticalDramaSeries.title,
      status: verticalDramaSeries.status,
      genre: verticalDramaSeries.genre,
      tone: verticalDramaSeries.tone,
      locale: verticalDramaSeries.locale,
      updatedAt: verticalDramaSeries.updatedAt,
      createdAt: verticalDramaSeries.createdAt,
    })
    .from(verticalDramaSeries)
    .where(and(
      eq(verticalDramaSeries.tenantId, tenantId),
      eq(verticalDramaSeries.userId, auth.userId),
    ))
    .orderBy(desc(verticalDramaSeries.updatedAt));

  const seriesIds = seriesRows.map((row) => row.id);
  const episodeAggByseriesId = new Map<number, { episodeCount: number; latestEpisodeNumber: number }>();
  if (seriesIds.length > 0) {
    const aggRows = await db
      .select({
        seriesId: verticalDramaEpisodes.seriesId,
        episodeCount: sql<number>`COUNT(*)`,
        latestEpisodeNumber: sql<number>`COALESCE(MAX(${verticalDramaEpisodes.episodeNumber}), 0)`,
      })
      .from(verticalDramaEpisodes)
      .where(and(
        eq(verticalDramaEpisodes.tenantId, tenantId),
        eq(verticalDramaEpisodes.userId, auth.userId),
        inArray(verticalDramaEpisodes.seriesId, seriesIds),
      ))
      .groupBy(verticalDramaEpisodes.seriesId);
    for (const row of aggRows) {
      episodeAggByseriesId.set(row.seriesId, {
        episodeCount: Number(row.episodeCount ?? 0),
        latestEpisodeNumber: Number(row.latestEpisodeNumber ?? 0),
      });
    }
  }

  // Thumbnail = main image (approvedMediaAssetId) of the first shot that has
  // one, from the lowest-episodeNumber episode of each series. One query
  // over the listed seriesIds extracts the first approved frame asset id per
  // episode via a JSONB subselect, ordered so the lowest episodeNumber with a
  // hit wins per series; then one scoped mediaAssets lookup resolves URLs.
  const seriesThumbnailAssetId = new Map<number, number>();
  if (seriesIds.length > 0) {
    const frameAssetRows = await db
      .select({
        seriesId: verticalDramaEpisodes.seriesId,
        episodeNumber: verticalDramaEpisodes.episodeNumber,
        approvedAssetId: sql<string | null>`(
          SELECT f->>'approvedMediaAssetId'
          FROM jsonb_array_elements(${verticalDramaEpisodes.startFramePlan}->'frames') f
          WHERE f->>'approvedMediaAssetId' IS NOT NULL
          LIMIT 1
        )`,
      })
      .from(verticalDramaEpisodes)
      .where(and(
        eq(verticalDramaEpisodes.tenantId, tenantId),
        eq(verticalDramaEpisodes.userId, auth.userId),
        inArray(verticalDramaEpisodes.seriesId, seriesIds),
      ))
      .orderBy(asc(verticalDramaEpisodes.seriesId), asc(verticalDramaEpisodes.episodeNumber));

    for (const row of frameAssetRows) {
      if (seriesThumbnailAssetId.has(row.seriesId)) continue; // keep lowest-episodeNumber hit
      if (!row.approvedAssetId) continue;
      const numeric = Number(row.approvedAssetId);
      if (Number.isFinite(numeric)) {
        seriesThumbnailAssetId.set(row.seriesId, numeric);
      }
    }
  }

  const thumbnailAssetById = await loadMediaAssetUrlsById(
    db,
    tenantId,
    auth.userId,
    Array.from(seriesThumbnailAssetId.values()),
  );

  const query = String(input.query ?? "").trim().toLowerCase();
  const projects = seriesRows
    .map((row) => {
      const agg = episodeAggByseriesId.get(row.id);
      const thumbnailAssetId = seriesThumbnailAssetId.get(row.id);
      const thumbnailAsset = thumbnailAssetId !== undefined ? thumbnailAssetById.get(thumbnailAssetId) : undefined;
      const thumbnailUrl = thumbnailAsset ? (thumbnailAsset.thumbnailUrl ?? thumbnailAsset.originalUrl ?? null) : null;
      return {
        id: String(row.id),
        title: row.title,
        status: row.status,
        genre: row.genre ?? null,
        tone: row.tone ?? null,
        locale: row.locale ?? null,
        episodeCount: agg?.episodeCount ?? 0,
        latestEpisodeNumber: agg?.latestEpisodeNumber ?? 0,
        thumbnailUrl,
        updatedAt: toIsoOrNull(row.updatedAt),
        createdAt: toIsoOrNull(row.createdAt),
      } satisfies DramaSeriesProjectSummary;
    })
    .filter((project) => !query || [
      project.title,
      project.genre ?? "",
      project.tone ?? "",
      project.status,
    ].join(" ").toLowerCase().includes(query))
    .slice(0, limit);

  return { projects };
}

/* -------------------------------------------------------------------------- */
/* 2. List episodes for a series                                             */
/* -------------------------------------------------------------------------- */

export interface DramaSeriesEpisodeSummary {
  id: string;
  episodeNumber: number;
  title: string;
  status: string;
  shotCount: number;
  clipCount: number;
  thumbnailUrl: string | null;
  updatedAt: string | null;
  createdAt: string | null;
}

export async function listDramaSeriesEpisodesForExtension(
  auth: ExtensionAuth,
  seriesId: number,
): Promise<{ series: { id: string; title: string; status: string } | null; episodes: DramaSeriesEpisodeSummary[] }> {
  const db = getDb();
  const tenantId = requireTenantId(auth);

  const [seriesRow] = await db
    .select({
      id: verticalDramaSeries.id,
      title: verticalDramaSeries.title,
      status: verticalDramaSeries.status,
    })
    .from(verticalDramaSeries)
    .where(and(
      eq(verticalDramaSeries.id, seriesId),
      eq(verticalDramaSeries.tenantId, tenantId),
      eq(verticalDramaSeries.userId, auth.userId),
    ))
    .limit(1);
  if (!seriesRow) {
    throw Object.assign(new Error("Drama series not found"), { status: 404, code: "not_found" });
  }

  const episodeRows = await db
    .select({
      id: verticalDramaEpisodes.id,
      episodeNumber: verticalDramaEpisodes.episodeNumber,
      title: verticalDramaEpisodes.title,
      status: verticalDramaEpisodes.status,
      storyboard: verticalDramaEpisodes.storyboard,
      startFramePlan: verticalDramaEpisodes.startFramePlan,
      motionPromptPack: verticalDramaEpisodes.motionPromptPack,
      updatedAt: verticalDramaEpisodes.updatedAt,
      createdAt: verticalDramaEpisodes.createdAt,
    })
    .from(verticalDramaEpisodes)
    .where(and(
      eq(verticalDramaEpisodes.tenantId, tenantId),
      eq(verticalDramaEpisodes.userId, auth.userId),
      eq(verticalDramaEpisodes.seriesId, seriesId),
    ))
    .orderBy(asc(verticalDramaEpisodes.episodeNumber));

  // First-approved-frame asset id per episode, extracted in JS since
  // startFramePlan is already selected above — resolve all episodes' URLs in
  // one scoped mediaAssets query.
  const episodeThumbnailAssetId = new Map<number, number>();
  for (const row of episodeRows) {
    const assetId = firstApprovedFrameAssetId(row.startFramePlan);
    if (assetId !== null) episodeThumbnailAssetId.set(row.id, assetId);
  }
  const episodeThumbnailAssetById = await loadMediaAssetUrlsById(
    db,
    tenantId,
    auth.userId,
    Array.from(episodeThumbnailAssetId.values()),
  );

  const episodes = episodeRows.map((row): DramaSeriesEpisodeSummary => {
    const storyboard = asRecord(row.storyboard) as VerticalDramaShotgrid | undefined;
    const motionPromptPack = asRecord(row.motionPromptPack) as VerticalDramaMotionPromptPack | undefined;
    const thumbnailAssetId = episodeThumbnailAssetId.get(row.id);
    const thumbnailAsset = thumbnailAssetId !== undefined ? episodeThumbnailAssetById.get(thumbnailAssetId) : undefined;
    const thumbnailUrl = thumbnailAsset ? (thumbnailAsset.thumbnailUrl ?? thumbnailAsset.originalUrl ?? null) : null;
    return {
      id: String(row.id),
      episodeNumber: row.episodeNumber,
      title: row.title ?? "",
      status: row.status,
      shotCount: Array.isArray(storyboard?.shots) ? storyboard!.shots.length : 0,
      clipCount: Array.isArray(motionPromptPack?.clips) ? motionPromptPack!.clips.length : 0,
      thumbnailUrl,
      updatedAt: toIsoOrNull(row.updatedAt),
      createdAt: toIsoOrNull(row.createdAt),
    };
  });

  return {
    series: { id: String(seriesRow.id), title: seriesRow.title, status: seriesRow.status },
    episodes,
  };
}

/* -------------------------------------------------------------------------- */
/* 3. Episode shot detail                                                     */
/* -------------------------------------------------------------------------- */

export interface DramaShotReferenceImage {
  id: string;
  url: string;
  thumbnailUrl: string | null;
  role: string;
  source: string;
  title?: string;
}

export interface DramaShotGridFrame {
  index: number;
  url: string;
  thumbnailUrl: string | null;
}

/** Safe, extension-facing dialogue projection. Voice and audio-task data stay server-side. */
export interface DramaShotDialogueLine {
  speaker: string;
  emotion: string | null;
  text: string;
  durationSeconds: number | null;
}

export interface DramaShot {
  shotNumber: number;
  description: string;
  cameraSetup: string;
  durationSeconds: number | null;
  imagePrompt: string;
  negativeImagePrompt: string;
  videoPrompt: string;
  negativeVideoPrompt: string;
  dialogue: string;
  dialogueLines: DramaShotDialogueLine[];
  mainImageUrl: string | null;
  mainImageThumbnailUrl: string | null;
  gridImageUrl: string | null;
  gridFrames: DramaShotGridFrame[];
  referenceImages: DramaShotReferenceImage[];
}

export interface DramaSeriesEpisodeDetail {
  id: string;
  seriesId: string;
  seriesTitle: string;
  episodeNumber: number;
  title: string;
  status: string;
  updatedAt: string | null;
  shots: DramaShot[];
}

/**
 * Projects the minimal dialogue data required by the extension. When an authored
 * audio plan exists its real per-line durations win; otherwise (clip-only
 * dialogue, i.e. before the dialogue-audio stage has run) we fall back to the
 * canonical text-based speech estimate so the extension can still show an
 * approximate speaking length instead of "ยังไม่มีเวลาพูด". This matches the
 * estimate the web workspace's density meter already shows for the same lines.
 */
export function projectDramaShotDialogueLinesForExtension(input: {
  dialogueAudioPlan: unknown;
  clipDialogue: unknown;
  shotNumber: number;
}): DramaShotDialogueLine[] {
  const clipLines = Array.isArray(input.clipDialogue)
    ? input.clipDialogue
      .map((value) => asRecord(value))
      .filter((value): value is Record<string, unknown> => Boolean(value))
    : [];
  const clipLineForText = (text: string) => clipLines.find((line) => line.lineTh === text);
  const plan = asRecord(input.dialogueAudioPlan);
  const planLines = Array.isArray(plan?.dialogueLines) ? plan.dialogueLines : [];
  const timedLines = planLines.flatMap((value): DramaShotDialogueLine[] => {
    const line = asRecord(value);
    if (!line || Number(line.shotNumber) !== input.shotNumber) return [];
    const text = typeof line.text === "string" ? line.text.trim() : "";
    if (!text) return [];
    const clipLine = clipLineForText(text);
    const duration = typeof line.targetDurationSeconds === "number" && line.targetDurationSeconds >= 0
      ? line.targetDurationSeconds
      : typeof line.start === "number" && typeof line.end === "number" && line.end >= line.start
        ? line.end - line.start
        : null;
    return [{
      speaker: typeof line.speakerName === "string" && line.speakerName.trim()
        ? line.speakerName.trim()
        : typeof clipLine?.characterKey === "string" && clipLine.characterKey.trim()
          ? clipLine.characterKey.trim()
          : line.isNarration === true ? "ผู้บรรยาย" : "ไม่ระบุผู้พูด",
      emotion: typeof line.emotion === "string" && line.emotion.trim()
        ? line.emotion.trim()
        : typeof clipLine?.emotion === "string" && clipLine.emotion.trim()
          ? clipLine.emotion.trim()
          : null,
      text,
      durationSeconds: duration,
    }];
  });
  if (timedLines.length > 0) return timedLines;

  return clipLines.flatMap((line): DramaShotDialogueLine[] => {
    const text = typeof line.lineTh === "string" ? line.lineTh.trim() : "";
    if (!text) return [];
    return [{
      speaker: typeof line.characterKey === "string" && line.characterKey.trim()
        ? line.characterKey.trim()
        : "ไม่ระบุผู้พูด",
      emotion: typeof line.emotion === "string" && line.emotion.trim() ? line.emotion.trim() : null,
      text,
      durationSeconds: estimateVerticalDramaSpeechSeconds(text),
    }];
  });
}

export async function getDramaSeriesEpisodeDetailForExtension(
  auth: ExtensionAuth,
  seriesId: number,
  episodeId: number,
): Promise<{ episode: DramaSeriesEpisodeDetail | null }> {
  const db = getDb();
  const tenantId = requireTenantId(auth);

  const [seriesRow] = await db
    .select({ id: verticalDramaSeries.id, title: verticalDramaSeries.title })
    .from(verticalDramaSeries)
    .where(and(
      eq(verticalDramaSeries.id, seriesId),
      eq(verticalDramaSeries.tenantId, tenantId),
      eq(verticalDramaSeries.userId, auth.userId),
    ))
    .limit(1);
  if (!seriesRow) {
    throw Object.assign(new Error("Drama series not found"), { status: 404, code: "not_found" });
  }

  const [episodeRow] = await db
    .select({
      id: verticalDramaEpisodes.id,
      seriesId: verticalDramaEpisodes.seriesId,
      episodeNumber: verticalDramaEpisodes.episodeNumber,
      title: verticalDramaEpisodes.title,
      status: verticalDramaEpisodes.status,
      storyboard: verticalDramaEpisodes.storyboard,
      dialogueAudioPlan: verticalDramaEpisodes.dialogueAudioPlan,
      startFramePlan: verticalDramaEpisodes.startFramePlan,
      motionPromptPack: verticalDramaEpisodes.motionPromptPack,
      updatedAt: verticalDramaEpisodes.updatedAt,
    })
    .from(verticalDramaEpisodes)
    .where(and(
      eq(verticalDramaEpisodes.id, episodeId),
      eq(verticalDramaEpisodes.tenantId, tenantId),
      eq(verticalDramaEpisodes.userId, auth.userId),
      eq(verticalDramaEpisodes.seriesId, seriesId),
    ))
    .limit(1);
  if (!episodeRow) {
    throw Object.assign(new Error("Drama series not found"), { status: 404, code: "not_found" });
  }

  const storyboard = asRecord(episodeRow.storyboard) as VerticalDramaShotgrid | undefined;
  const startFramePlan = asRecord(episodeRow.startFramePlan) as VerticalDramaStartFramePlan | undefined;
  const motionPromptPack = asRecord(episodeRow.motionPromptPack) as VerticalDramaMotionPromptPack | undefined;

  const storyboardShots = Array.isArray(storyboard?.shots) ? storyboard!.shots : [];
  const frames = Array.isArray(startFramePlan?.frames) ? startFramePlan!.frames : [];
  const clips = Array.isArray(motionPromptPack?.clips) ? motionPromptPack!.clips : [];

  const shotNumbers = new Set<number>();
  for (const shot of storyboardShots) shotNumbers.add(shot.shotNumber);
  for (const frame of frames) shotNumbers.add(frame.shotNumber);

  // Load shot references (LEFT JOIN media_assets, scoped by tenant+user on the join side too).
  const referenceRows = await db
    .select({
      id: verticalDramaShotReferences.id,
      shotNumber: verticalDramaShotReferences.shotNumber,
      role: verticalDramaShotReferences.role,
      source: verticalDramaShotReferences.source,
      sortOrder: verticalDramaShotReferences.sortOrder,
      createdAt: verticalDramaShotReferences.createdAt,
      mediaAssetId: verticalDramaShotReferences.mediaAssetId,
      assetOriginalUrl: mediaAssets.originalUrl,
      assetThumbnailUrl: mediaAssets.thumbnailUrl,
    })
    .from(verticalDramaShotReferences)
    .leftJoin(
      mediaAssets,
      and(
        eq(verticalDramaShotReferences.mediaAssetId, mediaAssets.id),
        eq(mediaAssets.tenantId, tenantId),
        eq(mediaAssets.userId, auth.userId),
      ),
    )
    .where(and(
      eq(verticalDramaShotReferences.tenantId, tenantId),
      eq(verticalDramaShotReferences.userId, auth.userId),
      eq(verticalDramaShotReferences.seriesId, seriesId),
      eq(verticalDramaShotReferences.episodeId, episodeId),
    ))
    .orderBy(
      asc(verticalDramaShotReferences.shotNumber),
      asc(verticalDramaShotReferences.sortOrder),
      asc(verticalDramaShotReferences.createdAt),
    );

  // Resolve approvedMediaAssetId values (frames[].approvedMediaAssetId, string in JSONB).
  const approvedAssetIds = frames
    .map((frame) => {
      const raw = frame.approvedMediaAssetId;
      if (typeof raw !== "string" && typeof raw !== "number") return null;
      const numeric = Number(raw);
      return Number.isFinite(numeric) ? numeric : null;
    })
    .filter((id): id is number => id !== null);

  const approvedAssetById = await loadMediaAssetUrlsById(db, tenantId, auth.userId, approvedAssetIds);

  const referencesByShot = new Map<number, typeof referenceRows>();
  for (const row of referenceRows) {
    const bucket = referencesByShot.get(row.shotNumber) ?? [];
    bucket.push(row);
    referencesByShot.set(row.shotNumber, bucket);
  }

  // Character identity refs: vertical_drama_characters -> vertical_drama_character_assets
  // (approved, with a resolved mediaAssetId) -> media_assets, all for this series, loaded
  // once up front and grouped by characterKey.
  const characterRows = await db
    .select({
      id: verticalDramaCharacters.id,
      characterKey: verticalDramaCharacters.characterKey,
      name: verticalDramaCharacters.name,
    })
    .from(verticalDramaCharacters)
    .where(and(
      eq(verticalDramaCharacters.tenantId, tenantId),
      eq(verticalDramaCharacters.seriesId, seriesId),
    ));

  const characterById = new Map<number, { characterKey: string; name: string }>();
  for (const row of characterRows) {
    characterById.set(row.id, { characterKey: row.characterKey, name: row.name });
  }

  const characterAssetRows = characterRows.length > 0
    ? await db
        .select({
          id: verticalDramaCharacterAssets.id,
          characterId: verticalDramaCharacterAssets.characterId,
          mediaAssetId: verticalDramaCharacterAssets.mediaAssetId,
          role: verticalDramaCharacterAssets.role,
        })
        .from(verticalDramaCharacterAssets)
        .where(and(
          eq(verticalDramaCharacterAssets.tenantId, tenantId),
          eq(verticalDramaCharacterAssets.seriesId, seriesId),
          eq(verticalDramaCharacterAssets.approved, true),
        ))
    : [];

  const characterAssetsByCharacterKey = new Map<string, Array<{
    assetRowId: number;
    mediaAssetId: number;
    role: string | null;
    characterName: string;
  }>>();
  for (const row of characterAssetRows) {
    if (row.characterId === null || row.mediaAssetId === null) continue;
    const character = characterById.get(row.characterId);
    if (!character) continue;
    const bucket = characterAssetsByCharacterKey.get(character.characterKey) ?? [];
    bucket.push({
      assetRowId: row.id,
      mediaAssetId: row.mediaAssetId,
      role: row.role ?? null,
      characterName: character.name,
    });
    characterAssetsByCharacterKey.set(character.characterKey, bucket);
  }
  // Prefer 'primary_portrait' first within each character's asset list.
  for (const bucket of characterAssetsByCharacterKey.values()) {
    bucket.sort((a, b) => {
      const aPrimary = a.role === "primary_portrait" ? 0 : 1;
      const bPrimary = b.role === "primary_portrait" ? 0 : 1;
      return aPrimary - bPrimary;
    });
  }

  const characterMediaAssetIds = characterAssetRows
    .map((row) => row.mediaAssetId)
    .filter((id): id is number => id !== null);

  // Product refs: frames[].productReferenceAssetIds (string[] of mediaAsset ids).
  const productAssetIds = frames
    .flatMap((frame) => (Array.isArray(frame.productReferenceAssetIds) ? frame.productReferenceAssetIds : []))
    .map((raw) => {
      const numeric = Number(raw);
      return Number.isFinite(numeric) ? numeric : null;
    })
    .filter((id): id is number => id !== null);

  const referenceAssetById = await loadMediaAssetUrlsById(
    db,
    tenantId,
    auth.userId,
    [...characterMediaAssetIds, ...productAssetIds],
  );

  const shots: DramaShot[] = Array.from(shotNumbers)
    .sort((a, b) => a - b)
    .map((shotNumber) => {
      const storyboardShot = storyboardShots.find((shot) => shot.shotNumber === shotNumber);
      const frame = frames.find((f) => f.shotNumber === shotNumber);
      const clip = clips.find((c) => Array.isArray(c.sourceShotNumbers) && c.sourceShotNumbers.includes(shotNumber));

      const dialogueLines = projectDramaShotDialogueLinesForExtension({
        dialogueAudioPlan: episodeRow.dialogueAudioPlan,
        clipDialogue: clip?.dialogue,
        shotNumber,
      });
      const dialogue = dialogueLines.map((line) => `${line.speaker}: ${line.text}`).join("\n");

      let mainImageUrl: string | null = null;
      let mainImageThumbnailUrl: string | null = null;
      const rawApprovedId = frame?.approvedMediaAssetId;
      if (typeof rawApprovedId === "string" || typeof rawApprovedId === "number") {
        const numeric = Number(rawApprovedId);
        if (Number.isFinite(numeric)) {
          const asset = approvedAssetById.get(numeric);
          if (asset) {
            mainImageUrl = asset.originalUrl;
            mainImageThumbnailUrl = asset.thumbnailUrl;
          }
        }
      }

      const shotReferenceRows = referencesByShot.get(shotNumber) ?? [];
      const gridCutRows = shotReferenceRows.filter((row) => row.source === "grid_cut");
      const otherRows = shotReferenceRows.filter((row) => row.source !== "grid_cut");

      const gridFrames: DramaShotGridFrame[] = [];
      for (const row of gridCutRows) {
        if (!row.assetOriginalUrl) continue;
        gridFrames.push({
          index: gridFrames.length,
          url: row.assetOriginalUrl,
          thumbnailUrl: row.assetThumbnailUrl ?? null,
        });
      }

      const referenceImages: DramaShotReferenceImage[] = [];
      const referenceImageMediaAssetIds = new Set<number>();
      for (const row of otherRows) {
        const url = row.assetOriginalUrl ?? row.assetThumbnailUrl ?? null;
        if (!url) continue;
        referenceImages.push({
          id: String(row.id),
          url,
          thumbnailUrl: row.assetThumbnailUrl ?? null,
          role: row.role,
          source: row.source,
        });
        referenceImageMediaAssetIds.add(row.mediaAssetId);
      }

      // Character identity refs for this shot's required character keys.
      const requiredCharacterRefs = Array.isArray(frame?.requiredCharacterRefs) ? frame!.requiredCharacterRefs : [];
      for (const characterKey of requiredCharacterRefs) {
        const characterAssets = characterAssetsByCharacterKey.get(characterKey) ?? [];
        let addedForCharacter = 0;
        for (const characterAsset of characterAssets) {
          if (addedForCharacter >= 3) break;
          if (referenceImageMediaAssetIds.has(characterAsset.mediaAssetId)) continue;
          const asset = referenceAssetById.get(characterAsset.mediaAssetId);
          if (!asset?.originalUrl) continue;
          referenceImages.push({
            id: `char-${characterAsset.assetRowId}`,
            url: asset.originalUrl,
            thumbnailUrl: asset.thumbnailUrl,
            role: characterAsset.role ?? "character_reference",
            source: "character",
            title: characterAsset.characterName,
          });
          referenceImageMediaAssetIds.add(characterAsset.mediaAssetId);
          addedForCharacter += 1;
        }
      }

      // Product refs for this shot.
      const shotProductAssetIds = Array.isArray(frame?.productReferenceAssetIds) ? frame!.productReferenceAssetIds : [];
      for (const rawProductAssetId of shotProductAssetIds) {
        const numeric = Number(rawProductAssetId);
        if (!Number.isFinite(numeric)) continue;
        if (referenceImageMediaAssetIds.has(numeric)) continue;
        const asset = referenceAssetById.get(numeric);
        if (!asset?.originalUrl) continue;
        referenceImages.push({
          id: `product-${numeric}`,
          url: asset.originalUrl,
          thumbnailUrl: asset.thumbnailUrl,
          role: "product",
          source: "product",
          title: "product",
        });
        referenceImageMediaAssetIds.add(numeric);
      }

      return {
        shotNumber,
        description: storyboardShot?.description ?? "",
        cameraSetup: storyboardShot?.cameraSetup ?? "",
        durationSeconds: storyboardShot?.durationSeconds ?? null,
        imagePrompt: frame?.imagePrompt ?? "",
        negativeImagePrompt: frame?.negativePrompt ?? "",
        videoPrompt: clip?.prompt ?? "",
        negativeVideoPrompt: clip?.negativeMotionPrompt ?? "",
        dialogue,
        dialogueLines,
        mainImageUrl,
        mainImageThumbnailUrl,
        gridImageUrl: frame?.angleGrid?.imageUrl ?? null,
        gridFrames,
        referenceImages,
      } satisfies DramaShot;
    });

  return {
    episode: {
      id: String(episodeRow.id),
      seriesId: String(episodeRow.seriesId),
      seriesTitle: seriesRow.title,
      episodeNumber: episodeRow.episodeNumber,
      title: episodeRow.title ?? "",
      status: episodeRow.status,
      updatedAt: toIsoOrNull(episodeRow.updatedAt),
      shots,
    },
  };
}
