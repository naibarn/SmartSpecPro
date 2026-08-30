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
// Both of these are documented (in their own header doc comments) as
// deliberately lightweight, DB-free, non-router modules — the same
// convention `server/routers/verticalDramaCharacters.ts` itself relies on to
// import them safely. `resolveEffectiveCharacterFacts`/`extractCharacterDescription`
// themselves live in that router file, whose module graph pulls in
// `protectedProcedure`/`requireFeatureFlag`/`mediaGenerationService`/
// `creditService`/etc. — importing them here would drag this read-only
// service into that entire router's dependency graph for the sake of two
// pure functions, so §5(d) of this task replicates them locally instead
// (see `extractCharacterDescriptionForPicker`/`resolveEffectiveCharacterFactsForPicker`
// below) and only statically imports the two small leaf helpers.
import { readBibleRefinedCharacterProfiles, type VdBibleRefinedCharacter } from "./verticalDramaBibleRefinedCharacters";
import { normalizeStoryCharacterName } from "./verticalDramaCharacterRosterAutoRegister";

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
  stopFrameUrl: string | null;
  stopFrameThumbnailUrl: string | null;
  gridImageUrl: string | null;
  gridFrames: DramaShotGridFrame[];
  referenceImages: DramaShotReferenceImage[];
}

export function projectDramaShotFrameUrlsForExtension(input: {
  startFrameAssetId: unknown;
  stopFrameAssetId: unknown;
  assetById: ReadonlyMap<number, { originalUrl: string | null; thumbnailUrl: string | null }>;
}): Pick<DramaShot, "mainImageUrl" | "mainImageThumbnailUrl" | "stopFrameUrl" | "stopFrameThumbnailUrl"> {
  const resolve = (rawAssetId: unknown) => {
    if (typeof rawAssetId !== "string" && typeof rawAssetId !== "number") return null;
    const assetId = Number(rawAssetId);
    if (!Number.isFinite(assetId)) return null;
    return input.assetById.get(assetId) ?? null;
  };
  const start = resolve(input.startFrameAssetId);
  const stop = resolve(input.stopFrameAssetId);
  return {
    mainImageUrl: start?.originalUrl ?? null,
    mainImageThumbnailUrl: start?.thumbnailUrl ?? null,
    stopFrameUrl: stop?.originalUrl ?? null,
    stopFrameThumbnailUrl: stop?.thumbnailUrl ?? null,
  };
}

interface ExtensionShotReferenceRow {
  id: number;
  mediaAssetId: number;
  role: string;
  source: string;
  assetOriginalUrl: string | null;
  assetThumbnailUrl: string | null;
}

interface ExtensionCharacterAsset {
  assetRowId: number;
  mediaAssetId: number;
  role: string | null;
  characterName: string;
}

/**
 * Keep the extension's shot payload aligned with the storyboard card: only
 * user-created reference frames plus one approved portrait for each character
 * that belongs to this shot. Grid cuts, generation history, product images,
 * unused cast, and additional looks remain server-side.
 */
export function projectDramaShotReferenceImagesForExtension(input: {
  shotReferenceRows: ExtensionShotReferenceRow[];
  requiredCharacterRefs: string[];
  characterAssetsByCharacterKey: ReadonlyMap<string, ExtensionCharacterAsset[]>;
  assetById: ReadonlyMap<number, { originalUrl: string | null; thumbnailUrl: string | null }>;
}): DramaShotReferenceImage[] {
  const images: DramaShotReferenceImage[] = [];
  const includedMediaAssetIds = new Set<number>();

  for (const row of input.shotReferenceRows) {
    if (row.source !== "reference_frame") continue;
    const url = row.assetOriginalUrl ?? row.assetThumbnailUrl;
    if (!url || includedMediaAssetIds.has(row.mediaAssetId)) continue;
    images.push({
      id: String(row.id),
      url,
      thumbnailUrl: row.assetThumbnailUrl,
      role: row.role,
      source: row.source,
    });
    includedMediaAssetIds.add(row.mediaAssetId);
  }

  for (const rawCharacterKey of input.requiredCharacterRefs) {
    const characterKey = rawCharacterKey.trim();
    if (!characterKey) continue;
    const characterAssets = input.characterAssetsByCharacterKey.get(characterKey)
      ?? input.characterAssetsByCharacterKey.get(normalizeStoryCharacterName(characterKey))
      ?? [];
    const characterAsset = characterAssets.find((candidate) => {
      if (includedMediaAssetIds.has(candidate.mediaAssetId)) return false;
      const asset = input.assetById.get(candidate.mediaAssetId);
      return Boolean(asset?.originalUrl ?? asset?.thumbnailUrl);
    });
    if (!characterAsset) continue;
    const asset = input.assetById.get(characterAsset.mediaAssetId)!;
    const url = asset.originalUrl ?? asset.thumbnailUrl;
    if (!url) continue;
    images.push({
      id: `char-${characterAsset.assetRowId}`,
      url,
      thumbnailUrl: asset.thumbnailUrl,
      role: characterAsset.role ?? "character_reference",
      source: "character",
      title: characterAsset.characterName,
    });
    includedMediaAssetIds.add(characterAsset.mediaAssetId);
  }

  return images;
}

export function resolveDramaShotCharacterRefsForExtension(
  frameRequiredCharacterRefs: unknown,
  storyboardCharacterIds: unknown,
): string[] {
  const selected = Array.isArray(frameRequiredCharacterRefs)
    ? frameRequiredCharacterRefs
    : Array.isArray(storyboardCharacterIds)
      ? storyboardCharacterIds
      : [];
  return selected.filter(
    (value): value is string => typeof value === "string" && Boolean(value.trim()),
  );
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

const OPAQUE_CHARACTER_SPEAKER_PATTERN =
  /^(?:(?:character|char)(?:$|[-_\s].+|\d.*)|c-[a-f0-9]{8,})$/i;

function asTrimmedString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function resolveDramaSpeakerNameForExtension(input: {
  line?: Record<string, unknown>;
  clipLine?: Record<string, unknown>;
  characterNameByKey?: ReadonlyMap<string, string>;
}): string {
  if (input.line?.isNarration === true) return "ผู้บรรยาย";

  const identityCandidates = [
    asTrimmedString(input.line?.speakerCharacterId),
    asTrimmedString(input.clipLine?.characterKey),
    asTrimmedString(input.line?.characterKey),
    asTrimmedString(input.line?.speakerName),
  ];
  for (const candidate of identityCandidates) {
    if (!candidate) continue;
    const canonicalName =
      input.characterNameByKey?.get(candidate) ??
      input.characterNameByKey?.get(normalizeStoryCharacterName(candidate));
    if (canonicalName?.trim()) return canonicalName.trim();
  }

  const legacySpeakerName = asTrimmedString(input.line?.speakerName);
  if (
    legacySpeakerName &&
    !OPAQUE_CHARACTER_SPEAKER_PATTERN.test(legacySpeakerName)
  ) {
    return legacySpeakerName;
  }
  const legacyClipSpeaker = asTrimmedString(input.clipLine?.characterKey);
  if (
    legacyClipSpeaker &&
    !OPAQUE_CHARACTER_SPEAKER_PATTERN.test(legacyClipSpeaker)
  ) {
    return legacyClipSpeaker;
  }
  return "ไม่ระบุผู้พูด";
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
  characterNameByKey?: ReadonlyMap<string, string>;
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
      speaker: resolveDramaSpeakerNameForExtension({
        line,
        clipLine,
        characterNameByKey: input.characterNameByKey,
      }),
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
      speaker: resolveDramaSpeakerNameForExtension({
        clipLine: line,
        characterNameByKey: input.characterNameByKey,
      }),
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
      eq(verticalDramaShotReferences.source, "reference_frame"),
    ))
    .orderBy(
      asc(verticalDramaShotReferences.shotNumber),
      asc(verticalDramaShotReferences.sortOrder),
      asc(verticalDramaShotReferences.createdAt),
    );

  // Resolve approved Start/Stop asset ids from frames[] (JSONB) in one scoped lookup.
  const approvedAssetIds = frames
    .flatMap((frame) => [frame.approvedMediaAssetId, frame.approvedStopFrameAssetId])
    .map((raw) => {
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
  const characterNameByKey = new Map<string, string>();
  for (const row of characterRows) {
    characterById.set(row.id, { characterKey: row.characterKey, name: row.name });
    const characterKey = row.characterKey.trim();
    const characterName = row.name.trim();
    if (characterKey && characterName) {
      characterNameByKey.set(characterKey, characterName);
      characterNameByKey.set(
        normalizeStoryCharacterName(characterKey),
        characterName
      );
    }
  }

  const requiredCharacterRefsByShot = new Map<number, string[]>();
  for (const shotNumber of shotNumbers) {
    const frame = frames.find((candidate) => candidate.shotNumber === shotNumber);
    const storyboardShot = storyboardShots.find((candidate) => candidate.shotNumber === shotNumber);
    requiredCharacterRefsByShot.set(
      shotNumber,
      resolveDramaShotCharacterRefsForExtension(
        frame?.requiredCharacterRefs,
        storyboardShot?.characterIds,
      ),
    );
  }
  const requiredCharacterKeys = new Set(
    Array.from(requiredCharacterRefsByShot.values()).flatMap((refs) =>
      refs.flatMap((key) => [key, normalizeStoryCharacterName(key)]),
    ),
  );
  const requiredCharacterIds = characterRows
    .filter((row) => requiredCharacterKeys.has(row.characterKey)
      || requiredCharacterKeys.has(normalizeStoryCharacterName(row.characterKey)))
    .map((row) => row.id);

  const characterAssetRows = requiredCharacterIds.length > 0
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
          inArray(verticalDramaCharacterAssets.characterId, requiredCharacterIds),
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

  for (const [characterKey, bucket] of Array.from(characterAssetsByCharacterKey.entries())) {
    const normalizedKey = normalizeStoryCharacterName(characterKey);
    if (normalizedKey && !characterAssetsByCharacterKey.has(normalizedKey)) {
      characterAssetsByCharacterKey.set(normalizedKey, bucket);
    }
  }

  const characterMediaAssetIds = characterAssetRows
    .map((row) => row.mediaAssetId)
    .filter((id): id is number => id !== null);

  const referenceAssetById = await loadMediaAssetUrlsById(
    db,
    tenantId,
    auth.userId,
    characterMediaAssetIds,
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
        characterNameByKey,
      });
      const dialogue = dialogueLines.map((line) => `${line.speaker}: ${line.text}`).join("\n");

      const frameUrls = projectDramaShotFrameUrlsForExtension({
        startFrameAssetId: frame?.approvedMediaAssetId,
        stopFrameAssetId: frame?.approvedStopFrameAssetId,
        assetById: approvedAssetById,
      });

      const shotReferenceRows = referencesByShot.get(shotNumber) ?? [];
      const referenceImages = projectDramaShotReferenceImagesForExtension({
        shotReferenceRows,
        requiredCharacterRefs: requiredCharacterRefsByShot.get(shotNumber) ?? [],
        characterAssetsByCharacterKey,
        assetById: referenceAssetById,
      });

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
        ...frameUrls,
        gridImageUrl: null,
        gridFrames: [],
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

/* -------------------------------------------------------------------------- */
/* 4. List Drama-series characters for the Marketplace character picker      */
/* -------------------------------------------------------------------------- */

/**
 * Local replica of `server/routers/verticalDramaCharacters.ts`'s
 * `extractCharacterDescription` — byte-for-byte the same projection logic
 * (see that function's own doc comment for the "why `data.description` leads"
 * rationale). Kept in sync manually; do not diverge without checking that
 * file first.
 */
function extractCharacterDescriptionForPicker(data: Record<string, unknown> | null): string | undefined {
  if (!data) return undefined;
  const parts: string[] = [];
  if (typeof data.description === "string" && data.description.trim()) {
    parts.push(`Description: ${data.description.trim()}`);
  }
  if (typeof data.personality === "string" && data.personality.trim()) {
    parts.push(`Personality: ${data.personality.trim()}`);
  }
  if (typeof data.backstory === "string" && data.backstory.trim()) {
    parts.push(`Backstory: ${data.backstory.trim()}`);
  }
  if (typeof data.identityLock === "string" && data.identityLock.trim()) {
    parts.push(`Identity lock: ${data.identityLock.trim()}`);
  }
  if (Array.isArray(data.wardrobeRules)) {
    const rules = data.wardrobeRules.filter(
      (rule): rule is string => typeof rule === "string" && rule.trim().length > 0,
    );
    if (rules.length > 0) parts.push(`Wardrobe rules: ${rules.join("; ")}`);
  }
  return parts.length > 0 ? parts.join(" | ") : undefined;
}

/**
 * Local replica of `server/routers/verticalDramaCharacters.ts`'s
 * `resolveEffectiveCharacterFacts` — same roster-wins/bible-fills-gaps
 * semantics for `role`/`occupation`/`description` (see that function's own
 * doc comment). Uses the same two dependency-safe leaf imports that source
 * function itself uses (`readBibleRefinedCharacterProfiles`,
 * `normalizeStoryCharacterName`), so behavior stays identical even though
 * the surrounding function body is duplicated rather than imported.
 */
function resolveEffectiveCharacterFactsForPicker(
  character: { name: string; role: string | null; occupation: string | null; data: Record<string, unknown> | null },
  bible: Record<string, unknown> | null,
): { role: string | null; occupation: string | null; description: string | undefined } {
  const rosterDescription = extractCharacterDescriptionForPicker(character.data);
  const hasRosterRole = typeof character.role === "string" && character.role.trim().length > 0;
  const hasRosterOccupation = typeof character.occupation === "string" && character.occupation.trim().length > 0;

  let role = character.role;
  let occupation = character.occupation;
  let description = rosterDescription;

  if (hasRosterRole && hasRosterOccupation && description !== undefined) {
    return { role, occupation, description };
  }
  if (typeof character.name !== "string" || character.name.trim().length === 0) {
    return { role, occupation, description };
  }

  const bibleCharacters: ReadonlyArray<VdBibleRefinedCharacter> = readBibleRefinedCharacterProfiles(bible);
  const normalizedTarget = normalizeStoryCharacterName(character.name);
  const bibleEntry = bibleCharacters.find((entry) => {
    if (normalizeStoryCharacterName(entry.name) === normalizedTarget) return true;
    return (entry.aliases ?? []).some((alias) => normalizeStoryCharacterName(alias) === normalizedTarget);
  });
  if (!bibleEntry) {
    return { role, occupation, description };
  }

  if (!hasRosterRole && typeof bibleEntry.role === "string" && bibleEntry.role.trim()) {
    role = bibleEntry.role;
  }
  if (!hasRosterOccupation && typeof bibleEntry.occupation === "string" && bibleEntry.occupation.trim()) {
    occupation = bibleEntry.occupation;
  }
  if (description === undefined && typeof bibleEntry.description === "string" && bibleEntry.description.trim()) {
    description = `Description: ${bibleEntry.description.trim()}`;
  }
  return { role, occupation, description };
}

/** `data.visualBible.ageRange` — free text; there is no dedicated age/gender column. */
function extractCharacterAgeRangeForPicker(data: Record<string, unknown> | undefined): string | null {
  const visualBible = asRecord(data?.visualBible);
  const raw = visualBible?.ageRange;
  return typeof raw === "string" && raw.trim() ? raw.trim() : null;
}

function parsePickerSeriesId(value: string): number {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    throw Object.assign(new Error("A valid seriesId is required"), { status: 400, code: "invalid_request" });
  }
  return numeric;
}

export interface DramaSeriesCharacterLookForPicker {
  characterId: string;
  variantLabel: string | null;
  variantType: string | null;
  portraitUrl: string | null;
  portraitAssetId: string | null;
}

export interface DramaSeriesCharacterForPicker {
  characterId: string;
  characterKey: string;
  name: string;
  role: string | null;
  narrativeRole: string | null;
  roleTier: string | null;
  occupation: string | null;
  description: string | null;
  ageRange: string | null;
  portraitUrl: string | null;
  portraitAssetId: string | null;
  hasPortrait: boolean;
  looks: DramaSeriesCharacterLookForPicker[];
}

/**
 * Marketplace two-character conversation picker (spec
 * `planning/marketplace-two-character-conversation/plan.md` §3.7): lists a
 * caller-owned Vertical Drama series' character roster so the Marketplace
 * Auto Review workflow can let a user pick 2 characters and have them
 * converse under their real story names — deliberately bypasses the
 * `verticalDramaSeries` tenant feature flag (this is a Marketplace surface;
 * gating it would FORBIDDEN a Marketplace-only tenant), mirroring this
 * file's own established precedent (see this file's header doc comment).
 *
 * READ-ONLY. Every query is scoped to `(tenantId, userId, seriesId)` —
 * deliberately NOT the tenant+series-only predicate
 * `verticalDramaEpisodes.ts`'s `resolveSeriesCharacterPortraits` uses (that
 * one is safe only because its caller already re-verifies ownership); this
 * function has no such caller-side check, so it enforces `userId` itself on
 * every table it touches. An unowned/missing series resolves to a 404-style
 * thrown error (never a 403), matching `loadOwnedSeries` in
 * `verticalDramaCharacters.ts` and every other function in this file.
 *
 * "ลุค" (character variants/twins) are separate rows in
 * `vertical_drama_characters` linked via `parentCharacterId` — this
 * nests them under their parent's `looks[]` instead of returning them as
 * their own top-level entries (a flat list would show the same character
 * repeated once per look).
 *
 * Portrait resolution is fully batched (one query for every character's
 * `primary_portrait` link across the whole roster + looks, then one
 * `loadMediaAssetUrlsById` call) — no N+1 per character/look, even on a
 * large roster.
 */
export async function listDramaSeriesCharactersForPicker(
  auth: { userId: number; tenantId: string },
  params: { seriesId: string },
): Promise<{ seriesId: string; seriesTitle: string; characters: DramaSeriesCharacterForPicker[] }> {
  const db = getDb();
  const tenantId = requireTenantId(auth);
  const seriesId = parsePickerSeriesId(params.seriesId);

  const [seriesRow] = await db
    .select({ id: verticalDramaSeries.id, title: verticalDramaSeries.title, bible: verticalDramaSeries.bible })
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
  const bible = asRecord(seriesRow.bible) ?? null;

  const characterRows = await db
    .select({
      id: verticalDramaCharacters.id,
      characterKey: verticalDramaCharacters.characterKey,
      name: verticalDramaCharacters.name,
      role: verticalDramaCharacters.role,
      narrativeRole: verticalDramaCharacters.narrativeRole,
      roleTier: verticalDramaCharacters.roleTier,
      occupation: verticalDramaCharacters.occupation,
      data: verticalDramaCharacters.data,
      parentCharacterId: verticalDramaCharacters.parentCharacterId,
      variantLabel: verticalDramaCharacters.variantLabel,
      variantType: verticalDramaCharacters.variantType,
    })
    .from(verticalDramaCharacters)
    .where(and(
      eq(verticalDramaCharacters.tenantId, tenantId),
      eq(verticalDramaCharacters.userId, auth.userId),
      eq(verticalDramaCharacters.seriesId, seriesId),
    ))
    .orderBy(asc(verticalDramaCharacters.id));

  const rowIdSet = new Set(characterRows.map((row) => row.id));

  // Batched primary-portrait resolution: one query across every character +
  // look row's id, mirroring `verticalDramaCharacterStockService.getPrimaryPortraitAssetId`'s
  // own predicate/join/order exactly (tenant+user+series scoped, role =
  // 'primary_portrait', inner-joined to media_assets so a dangling/deleted
  // link can never win), just batched instead of one query per character. A
  // global `ORDER BY approved DESC, updatedAt DESC` preserves each
  // character's own relative ranking, so the first row seen per
  // `characterId` while iterating is that character's best portrait —
  // identical to what a per-character `.limit(1)` call would return.
  const portraitAssetIdByCharacterId = new Map<number, number>();
  if (rowIdSet.size > 0) {
    const portraitRows = await db
      .select({
        characterId: verticalDramaCharacterAssets.characterId,
        mediaAssetId: mediaAssets.id,
        approved: verticalDramaCharacterAssets.approved,
        updatedAt: verticalDramaCharacterAssets.updatedAt,
      })
      .from(verticalDramaCharacterAssets)
      .innerJoin(mediaAssets, eq(verticalDramaCharacterAssets.mediaAssetId, mediaAssets.id))
      .where(and(
        eq(verticalDramaCharacterAssets.tenantId, tenantId),
        eq(verticalDramaCharacterAssets.userId, auth.userId),
        eq(verticalDramaCharacterAssets.seriesId, seriesId),
        eq(verticalDramaCharacterAssets.role, "primary_portrait"),
        inArray(verticalDramaCharacterAssets.characterId, Array.from(rowIdSet)),
      ))
      .orderBy(desc(verticalDramaCharacterAssets.approved), desc(verticalDramaCharacterAssets.updatedAt));
    for (const row of portraitRows) {
      if (row.characterId === null) continue;
      if (portraitAssetIdByCharacterId.has(row.characterId)) continue; // first hit = best per character
      portraitAssetIdByCharacterId.set(row.characterId, row.mediaAssetId);
    }
  }

  const mediaUrlById = await loadMediaAssetUrlsById(
    db,
    tenantId,
    auth.userId,
    Array.from(portraitAssetIdByCharacterId.values()),
  );

  function toPortraitFields(characterId: number): { portraitUrl: string | null; portraitAssetId: string | null } {
    const assetId = portraitAssetIdByCharacterId.get(characterId) ?? null;
    const asset = assetId !== null ? mediaUrlById.get(assetId) : undefined;
    return {
      portraitUrl: asset?.originalUrl ?? null,
      portraitAssetId: assetId !== null ? String(assetId) : null,
    };
  }

  // Group "look" rows (parentCharacterId set, and the parent is actually
  // present in this series' roster) under their parent — never as their own
  // top-level entry.
  const looksByParentId = new Map<number, DramaSeriesCharacterLookForPicker[]>();
  for (const row of characterRows) {
    if (row.parentCharacterId === null || !rowIdSet.has(row.parentCharacterId)) continue;
    const bucket = looksByParentId.get(row.parentCharacterId) ?? [];
    bucket.push({
      characterId: String(row.id),
      variantLabel: row.variantLabel ?? null,
      variantType: row.variantType ?? null,
      ...toPortraitFields(row.id),
    });
    looksByParentId.set(row.parentCharacterId, bucket);
  }

  const characters: DramaSeriesCharacterForPicker[] = [];
  for (const row of characterRows) {
    // Skip rows already nested as a look under their parent above.
    if (row.parentCharacterId !== null && rowIdSet.has(row.parentCharacterId)) continue;

    const data = asRecord(row.data) ?? null;
    const facts = resolveEffectiveCharacterFactsForPicker(
      { name: row.name, role: row.role, occupation: row.occupation, data },
      bible,
    );

    characters.push({
      characterId: String(row.id),
      characterKey: row.characterKey,
      name: row.name,
      role: facts.role,
      narrativeRole: row.narrativeRole ?? null,
      roleTier: row.roleTier ?? null,
      occupation: facts.occupation,
      description: facts.description ?? null,
      ageRange: extractCharacterAgeRangeForPicker(data ?? undefined),
      ...toPortraitFields(row.id),
      hasPortrait: portraitAssetIdByCharacterId.has(row.id),
      looks: looksByParentId.get(row.id) ?? [],
    } satisfies DramaSeriesCharacterForPicker);
  }

  return {
    seriesId: String(seriesRow.id),
    seriesTitle: seriesRow.title,
    characters,
  };
}
