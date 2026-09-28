/**
 * Vertical Drama — derived thumbnails (no schema change).
 *
 * There is no dedicated thumbnail column anywhere in the Vertical Drama
 * feature. Instead, every episode already carries a "main image" once its
 * Start Frame stage has an approved shot 1 image:
 * `vertical_drama_episodes.startFramePlan.frames[i].approvedMediaAssetId`
 * (JSONB, `@shared/verticalDramaSeries` `VerticalDramaStartFramePlan`).
 *
 * These helpers derive a display URL for:
 *  - a Series card / sidebar entry -> episode 1's cover, then its approved
 *    shot image.
 *  - a single Episode list row -> that episode's cover, then its approved
 *    shot image.
 *
 * Both queries are read-only, additive, and strictly tenant+user scoped —
 * they never touch `approvedMediaAssetId` itself (that remains owned by the
 * Start Frame stage) and never require a migration.
 */

import { and, eq, inArray, sql } from "drizzle-orm";
import { verticalDramaEpisodes, mediaAssets } from "../../drizzle/schema";
import {
  readEpisodeCoverState,
  readEpisodeCoverVariants,
} from "../../shared/verticalDramaSeries/episodeCover";
import type { db as dbProxy } from "../db";

type Db = typeof dbProxy;

type ThumbnailCandidate = {
  coverMediaAssetId: string | null;
  startFrameMediaAssetId: string | null;
};

function normalizeMediaAssetId(value: unknown): string | null {
  const id =
    typeof value === "string" ? value.trim() : String(value ?? "").trim();
  return /^\d+$/.test(id) ? id : null;
}

function resolveCoverMediaAssetId(value: unknown): string | null {
  const activeState = readEpisodeCoverState(value);
  const variantStates = readEpisodeCoverVariants(value).map(
    variant => variant.state
  );
  const states = activeState ? [activeState, ...variantStates] : variantStates;
  for (const state of states) {
    const mediaAssetId = normalizeMediaAssetId(state.mediaAssetId);
    if (mediaAssetId) return mediaAssetId;
  }
  return null;
}

/**
 * Prefer the owner-scoped managed-storage key over persisted display URLs.
 * Older rows can still carry an expired provider URL in `originalUrl` or
 * `thumbnailUrl`, while the durable object remains available under
 * `storageKey`. Keeping this normalization at the read boundary fixes both
 * the series sidebar and episode lists without weakening storage auth.
 */
function buildManagedStorageUrl(
  storageKey: string | null | undefined
): string | null {
  const key = String(storageKey ?? "")
    .trim()
    .replace(/^\/+/, "");
  return key ? `/api/storage/files/${encodeURI(key)}` : null;
}

/** Owner scope shared by both resolvers. */
export type VerticalDramaThumbnailOwner = {
  tenantId: string;
  userId: number;
};

/** Extracts the first frame (by array order) with a non-null `approvedMediaAssetId`. */
const FIRST_APPROVED_MEDIA_ASSET_ID_SQL = sql<string | null>`(
  SELECT f->>'approvedMediaAssetId'
  FROM jsonb_array_elements(${verticalDramaEpisodes.startFramePlan}->'frames') AS f
  WHERE f->>'approvedMediaAssetId' IS NOT NULL
  LIMIT 1
)`;

/** Resolves `media_assets.id -> displayUrl` (thumbnailUrl falling back to originalUrl). */
async function resolveMediaAssetUrls(
  db: Db,
  owner: VerticalDramaThumbnailOwner,
  mediaAssetIds: number[]
): Promise<Map<number, string>> {
  const urlByAssetId = new Map<number, string>();
  if (mediaAssetIds.length === 0) return urlByAssetId;

  const rows: Array<{
    id: number;
    storageKey: string | null;
    thumbnailUrl: string | null;
    originalUrl: string | null;
    status: string;
  }> = await db
    .select({
      id: mediaAssets.id,
      storageKey: mediaAssets.storageKey,
      thumbnailUrl: mediaAssets.thumbnailUrl,
      originalUrl: mediaAssets.originalUrl,
      status: mediaAssets.status,
    })
    .from(mediaAssets)
    .where(
      and(
        eq(mediaAssets.tenantId, owner.tenantId),
        eq(mediaAssets.userId, owner.userId),
        inArray(mediaAssets.id, mediaAssetIds)
      )
    );

  for (const row of rows) {
    if (row.status === "expired") continue;
    const url =
      buildManagedStorageUrl(row.storageKey) ??
      row.thumbnailUrl ??
      row.originalUrl;
    if (url) urlByAssetId.set(row.id, url);
  }
  return urlByAssetId;
}

/**
 * Series List / sidebar thumbnails: for each series id, episode 1's cover,
 * falling back to episode 1's approved shot image.
 */
export async function resolveSeriesThumbnailUrls(
  db: Db,
  owner: VerticalDramaThumbnailOwner & { seriesIds: number[] }
): Promise<Map<number, string>> {
  const { tenantId, userId, seriesIds } = owner;
  const result = new Map<number, string>();
  if (seriesIds.length === 0) return result;

  const rows: Array<{
    seriesId: number;
    episodeNumber: number;
    coverImage: unknown;
    approvedMediaAssetId: string | null;
  }> = await db
    .select({
      seriesId: verticalDramaEpisodes.seriesId,
      episodeNumber: verticalDramaEpisodes.episodeNumber,
      coverImage: verticalDramaEpisodes.coverImage,
      approvedMediaAssetId: FIRST_APPROVED_MEDIA_ASSET_ID_SQL,
    })
    .from(verticalDramaEpisodes)
    .where(
      and(
        eq(verticalDramaEpisodes.tenantId, tenantId),
        eq(verticalDramaEpisodes.userId, userId),
        inArray(verticalDramaEpisodes.seriesId, seriesIds),
        eq(verticalDramaEpisodes.episodeNumber, 1)
      )
    )
    .orderBy(verticalDramaEpisodes.episodeNumber);

  const candidateBySeriesId = new Map<number, ThumbnailCandidate>();
  for (const row of rows) {
    if (row.episodeNumber !== 1) continue;
    const candidate = {
      coverMediaAssetId: resolveCoverMediaAssetId(row.coverImage),
      startFrameMediaAssetId: normalizeMediaAssetId(row.approvedMediaAssetId),
    } satisfies ThumbnailCandidate;
    if (candidate.coverMediaAssetId || candidate.startFrameMediaAssetId) {
      candidateBySeriesId.set(row.seriesId, candidate);
    }
  }

  const mediaAssetIds = Array.from(
    new Set(
      Array.from(candidateBySeriesId.values()).flatMap(candidate => [
        candidate.coverMediaAssetId,
        candidate.startFrameMediaAssetId,
      ])
    )
  )
    .map(Number)
    .filter(id => Number.isFinite(id));
  const urlByAssetId = await resolveMediaAssetUrls(
    db,
    { tenantId, userId },
    mediaAssetIds
  );

  for (const [seriesId, candidate] of candidateBySeriesId.entries()) {
    const url =
      (candidate.coverMediaAssetId
        ? urlByAssetId.get(Number(candidate.coverMediaAssetId))
        : null) ??
      (candidate.startFrameMediaAssetId
        ? urlByAssetId.get(Number(candidate.startFrameMediaAssetId))
        : null);
    if (url) result.set(seriesId, url);
  }

  return result;
}

/**
 * Episode List thumbnails: for each episode id, that episode's own cover,
 * falling back to its approved shot 1 image.
 */
export async function resolveEpisodeThumbnailUrls(
  db: Db,
  owner: VerticalDramaThumbnailOwner & { episodeIds: number[] }
): Promise<Map<number, string>> {
  const { tenantId, userId, episodeIds } = owner;
  const result = new Map<number, string>();
  if (episodeIds.length === 0) return result;

  const rows: Array<{
    id: number;
    coverImage: unknown;
    approvedMediaAssetId: string | null;
  }> = await db
    .select({
      id: verticalDramaEpisodes.id,
      coverImage: verticalDramaEpisodes.coverImage,
      approvedMediaAssetId: FIRST_APPROVED_MEDIA_ASSET_ID_SQL,
    })
    .from(verticalDramaEpisodes)
    .where(
      and(
        eq(verticalDramaEpisodes.tenantId, tenantId),
        eq(verticalDramaEpisodes.userId, userId),
        inArray(verticalDramaEpisodes.id, episodeIds)
      )
    );

  const candidateByEpisodeId = new Map<number, ThumbnailCandidate>();
  for (const row of rows) {
    const candidate = {
      coverMediaAssetId: resolveCoverMediaAssetId(row.coverImage),
      startFrameMediaAssetId: normalizeMediaAssetId(row.approvedMediaAssetId),
    } satisfies ThumbnailCandidate;
    if (candidate.coverMediaAssetId || candidate.startFrameMediaAssetId) {
      candidateByEpisodeId.set(row.id, candidate);
    }
  }

  const mediaAssetIds = Array.from(
    new Set(
      Array.from(candidateByEpisodeId.values()).flatMap(candidate => [
        candidate.coverMediaAssetId,
        candidate.startFrameMediaAssetId,
      ])
    )
  )
    .map(Number)
    .filter(id => Number.isFinite(id));
  const urlByAssetId = await resolveMediaAssetUrls(
    db,
    { tenantId, userId },
    mediaAssetIds
  );

  for (const [episodeId, candidate] of candidateByEpisodeId.entries()) {
    const url =
      (candidate.coverMediaAssetId
        ? urlByAssetId.get(Number(candidate.coverMediaAssetId))
        : null) ??
      (candidate.startFrameMediaAssetId
        ? urlByAssetId.get(Number(candidate.startFrameMediaAssetId))
        : null);
    if (url) result.set(episodeId, url);
  }

  return result;
}
