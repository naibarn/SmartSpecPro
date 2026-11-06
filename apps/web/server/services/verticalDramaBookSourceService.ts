import { and, eq, inArray } from "drizzle-orm";

import { mediaAssets, verticalDramaEpisodes, verticalDramaSeries } from "../../drizzle/schema";
import { getDb } from "../db";
import { readEpisodeCoverState } from "../../shared/verticalDramaSeries/episodeCover";
import {
  buildVerticalDramaBookSourceSnapshot,
  collectApprovedBookImageIds,
  type BookSnapshotEpisode,
} from "./verticalDramaBookSnapshot";

/** Captures only a series and episodes owned by the authenticated actor. */
export async function captureOwnedVerticalDramaBookSource(input: {
  tenantId: string;
  userId: number;
  seriesId: number;
  episodeIds: number[];
  additionalAssetIds?: Array<{ id: number; purpose: "cover" | "shot" }>;
}) {
  const ids = [...new Set(input.episodeIds)];
  if (ids.length === 0 || ids.length !== input.episodeIds.length) throw new Error("BOOK_SOURCE_EPISODE_SELECTION_INVALID");
  const db = await getDb();
  const [series] = await db.select({
    id: verticalDramaSeries.id,
    title: verticalDramaSeries.title,
    locale: verticalDramaSeries.locale,
    genre: verticalDramaSeries.genre,
    tone: verticalDramaSeries.tone,
    bible: verticalDramaSeries.bible,
  }).from(verticalDramaSeries).where(and(
    eq(verticalDramaSeries.id, input.seriesId),
    eq(verticalDramaSeries.tenantId, input.tenantId),
    eq(verticalDramaSeries.userId, input.userId),
  )).limit(1);
  if (!series) throw new Error("BOOK_SERIES_NOT_FOUND");

  const rows = await db.select({
    id: verticalDramaEpisodes.id,
    title: verticalDramaEpisodes.title,
    episodeKind: verticalDramaEpisodes.episodeKind,
    episodeNumber: verticalDramaEpisodes.episodeNumber,
    specialSequence: verticalDramaEpisodes.specialSequence,
    script: verticalDramaEpisodes.script,
    storyboard: verticalDramaEpisodes.storyboard,
    startFramePlan: verticalDramaEpisodes.startFramePlan,
    dialogueAudioPlan: verticalDramaEpisodes.dialogueAudioPlan,
    coverImage: verticalDramaEpisodes.coverImage,
  }).from(verticalDramaEpisodes).where(and(
    eq(verticalDramaEpisodes.seriesId, input.seriesId),
    eq(verticalDramaEpisodes.tenantId, input.tenantId),
    eq(verticalDramaEpisodes.userId, input.userId),
    inArray(verticalDramaEpisodes.id, ids),
  ));
  if (rows.length !== ids.length) throw new Error("BOOK_SOURCE_EPISODE_NOT_FOUND");
  const byId = new Map(rows.map(row => [row.id, row]));
  const ordered = ids.map(id => byId.get(id)!).map(row => ({ ...row, revisionId: null, revisionFingerprint: null })) as BookSnapshotEpisode[];
  const episodeCoverIds = ordered.flatMap(episode => {
    const cover = readEpisodeCoverState(episode.coverImage);
    const id = Number(cover?.mediaAssetId);
    return cover?.status === "ready" && Number.isSafeInteger(id) && id > 0 ? [id] : [];
  });
  const assetIds = [...new Set([
    ...collectApprovedBookImageIds(ordered),
    ...episodeCoverIds,
    ...(input.additionalAssetIds ?? []).map(item => item.id),
  ])];
  const assets = assetIds.length === 0 ? [] : await db.select({
    id: mediaAssets.id,
    checksumSha256: mediaAssets.checksumSha256,
    mimeType: mediaAssets.mimeType,
    status: mediaAssets.status,
    thumbnailUrl: mediaAssets.thumbnailUrl,
    originalUrl: mediaAssets.originalUrl,
  }).from(mediaAssets).where(and(
    eq(mediaAssets.tenantId, input.tenantId),
    eq(mediaAssets.userId, input.userId),
    inArray(mediaAssets.id, assetIds),
  ));

  return buildVerticalDramaBookSourceSnapshot({
    series,
    episodes: ordered,
    assets,
    additionalAssetIds: [
      ...episodeCoverIds.map(id => ({ id, purpose: "cover" as const })),
      ...(input.additionalAssetIds ?? []),
    ],
  });
}
