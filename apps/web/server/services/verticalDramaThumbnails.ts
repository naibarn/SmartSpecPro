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
 *  - a Series card / sidebar entry -> episode 1's (lowest episodeNumber with
 *    a resolvable frame) approved shot image.
 *  - a single Episode list row -> that episode's own approved shot image.
 *
 * Both queries are read-only, additive, and strictly tenant+user scoped —
 * they never touch `approvedMediaAssetId` itself (that remains owned by the
 * Start Frame stage) and never require a migration.
 */

import { and, eq, inArray, sql } from "drizzle-orm";
import { verticalDramaEpisodes, mediaAssets } from "../../drizzle/schema";
import type { db as dbProxy } from "../db";

type Db = typeof dbProxy;

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
  }> = await db
    .select({
      id: mediaAssets.id,
      storageKey: mediaAssets.storageKey,
      thumbnailUrl: mediaAssets.thumbnailUrl,
      originalUrl: mediaAssets.originalUrl,
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
    const url =
      buildManagedStorageUrl(row.storageKey) ??
      row.thumbnailUrl ??
      row.originalUrl;
    if (url) urlByAssetId.set(row.id, url);
  }
  return urlByAssetId;
}

/**
 * Series List / sidebar thumbnails: for each series id, the approved shot
 * image of the lowest-numbered episode that has one (normally episode 1).
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
    approvedMediaAssetId: string | null;
  }> = await db
    .select({
      seriesId: verticalDramaEpisodes.seriesId,
      episodeNumber: verticalDramaEpisodes.episodeNumber,
      approvedMediaAssetId: FIRST_APPROVED_MEDIA_ASSET_ID_SQL,
    })
    .from(verticalDramaEpisodes)
    .where(
      and(
        eq(verticalDramaEpisodes.tenantId, tenantId),
        eq(verticalDramaEpisodes.userId, userId),
        inArray(verticalDramaEpisodes.seriesId, seriesIds)
      )
    )
    .orderBy(verticalDramaEpisodes.episodeNumber);

  // Keep the first (lowest episodeNumber, thanks to the ORDER BY) resolvable
  // candidate per series.
  const candidateBySeriesId = new Map<number, string>();
  for (const row of rows) {
    if (candidateBySeriesId.has(row.seriesId)) continue;
    if (!row.approvedMediaAssetId) continue;
    candidateBySeriesId.set(row.seriesId, row.approvedMediaAssetId);
  }

  const mediaAssetIds = Array.from(
    new Set(Array.from(candidateBySeriesId.values()).map(Number))
  ).filter(id => Number.isFinite(id));
  const urlByAssetId = await resolveMediaAssetUrls(
    db,
    { tenantId, userId },
    mediaAssetIds
  );

  for (const [seriesId, assetIdStr] of candidateBySeriesId.entries()) {
    const url = urlByAssetId.get(Number(assetIdStr));
    if (url) result.set(seriesId, url);
  }

  return result;
}

/**
 * Episode List thumbnails: for each episode id, that episode's own approved
 * shot 1 (first frame with a resolvable image) media asset URL.
 */
export async function resolveEpisodeThumbnailUrls(
  db: Db,
  owner: VerticalDramaThumbnailOwner & { episodeIds: number[] }
): Promise<Map<number, string>> {
  const { tenantId, userId, episodeIds } = owner;
  const result = new Map<number, string>();
  if (episodeIds.length === 0) return result;

  const rows: Array<{ id: number; approvedMediaAssetId: string | null }> =
    await db
      .select({
        id: verticalDramaEpisodes.id,
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

  const candidateByEpisodeId = new Map<number, string>();
  for (const row of rows) {
    if (row.approvedMediaAssetId)
      candidateByEpisodeId.set(row.id, row.approvedMediaAssetId);
  }

  const mediaAssetIds = Array.from(
    new Set(Array.from(candidateByEpisodeId.values()).map(Number))
  ).filter(id => Number.isFinite(id));
  const urlByAssetId = await resolveMediaAssetUrls(
    db,
    { tenantId, userId },
    mediaAssetIds
  );

  for (const [episodeId, assetIdStr] of candidateByEpisodeId.entries()) {
    const url = urlByAssetId.get(Number(assetIdStr));
    if (url) result.set(episodeId, url);
  }

  return result;
}
