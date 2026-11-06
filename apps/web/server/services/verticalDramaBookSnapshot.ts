import { createHash } from "node:crypto";

import {
  verticalDramaBookSourceSnapshotSchema,
  type VerticalDramaBookSourceSnapshot,
} from "../../shared/verticalDramaSeries/bookDocument";

export type BookSnapshotAsset = {
  id: number;
  checksumSha256: string | null;
  mimeType: string;
  status: string | null;
};

export type BookSnapshotEpisode = {
  id: number;
  revisionId?: number | null;
  revisionFingerprint?: string | null;
  title: string | null;
  episodeKind: string;
  episodeNumber: number;
  specialSequence: number | null;
  script: unknown;
  storyboard: unknown;
  startFramePlan: unknown;
  dialogueAudioPlan: unknown;
  coverImage: unknown;
};

export type BookSnapshotBuildResult = {
  snapshot: VerticalDramaBookSourceSnapshot;
  fingerprint: string;
  imageCoverage: { totalShots: number; usableShots: number; missing: Array<{ episodeId: number; shotNumber: number }> };
};

function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  const object = value as Record<string, unknown>;
  return `{${Object.keys(object).filter(key => object[key] !== undefined).sort().map(key => `${JSON.stringify(key)}:${canonical(object[key])}`).join(",")}}`;
}

export function fingerprintBookSource(value: unknown): string {
  return createHash("sha256").update(canonical(value)).digest("hex");
}

function readFrames(value: unknown): Array<{ shotNumber: number; approvedMediaAssetId?: string }> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];
  const frames = (value as { frames?: unknown }).frames;
  if (!Array.isArray(frames)) return [];
  return frames.flatMap(frame => {
    if (!frame || typeof frame !== "object" || Array.isArray(frame)) return [];
    const item = frame as Record<string, unknown>;
    const shotNumber = Number(item.shotNumber);
    if (!Number.isInteger(shotNumber) || shotNumber < 1) return [];
    return [{ shotNumber, ...(typeof item.approvedMediaAssetId === "string" ? { approvedMediaAssetId: item.approvedMediaAssetId } : {}) }];
  });
}

function readStoryboardShotNumbers(value: unknown): number[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];
  const shots = (value as { shots?: unknown }).shots;
  if (!Array.isArray(shots)) return [];
  return [...new Set(shots.flatMap(shot => {
    if (!shot || typeof shot !== "object" || Array.isArray(shot)) return [];
    const number = Number((shot as Record<string, unknown>).shotNumber);
    return Number.isInteger(number) && number > 0 ? [number] : [];
  }))].sort((a, b) => a - b);
}

export function collectApprovedBookImageIds(episodes: readonly BookSnapshotEpisode[]): number[] {
  const ids = new Set<number>();
  for (const episode of episodes) {
    for (const frame of readFrames(episode.startFramePlan)) {
      const id = Number(frame.approvedMediaAssetId);
      if (Number.isSafeInteger(id) && id > 0) ids.add(id);
    }
  }
  return [...ids];
}

/** Build a deterministic snapshot from rows already authorized by the caller. */
export function buildVerticalDramaBookSourceSnapshot(input: {
  series: { id: number; title: string; synopsis?: string | null; locale?: string | null; genre?: string | null; tone?: string | null; bible?: unknown };
  episodes: BookSnapshotEpisode[];
  assets: BookSnapshotAsset[];
  now?: Date;
}): BookSnapshotBuildResult {
  if (input.episodes.length === 0) throw new Error("BOOK_SOURCE_EPISODES_REQUIRED");
  const assetsById = new Map(input.assets.map(asset => [asset.id, asset]));
  const missing: Array<{ episodeId: number; shotNumber: number }> = [];
  let totalShots = 0;
  let usableShots = 0;

  const episodes = input.episodes.map(episode => {
    const frames = new Map(readFrames(episode.startFramePlan).map(frame => [frame.shotNumber, frame]));
    const storyboardShots = readStoryboardShotNumbers(episode.storyboard);
    const shotNumbers = storyboardShots.length > 0 ? storyboardShots : [...frames.keys()].sort((a, b) => a - b);
    const shots = shotNumbers.map(shotNumber => {
      totalShots += 1;
      const frame = frames.get(shotNumber);
      const parsedId = Number(frame?.approvedMediaAssetId);
      const asset = Number.isSafeInteger(parsedId) ? assetsById.get(parsedId) : undefined;
      const usable = !!asset && asset.status !== "expired" && asset.mimeType.toLowerCase().startsWith("image/") && /^[a-f0-9]{64}$/.test(asset.checksumSha256 ?? "");
      if (usable) usableShots += 1;
      else missing.push({ episodeId: episode.id, shotNumber });
      const locator = `episode:${episode.id}/shot:${shotNumber}`;
      return { shotNumber, mediaAssetId: usable ? parsedId : null, mediaChecksum: usable ? asset!.checksumSha256!.toLowerCase() : null, locator };
    });
    const payload = {
      title: episode.title,
      episodeKind: episode.episodeKind,
      episodeNumber: episode.episodeNumber,
      specialSequence: episode.specialSequence,
      script: episode.script,
      storyboard: episode.storyboard,
      startFramePlan: episode.startFramePlan,
      dialogueAudioPlan: episode.dialogueAudioPlan,
      coverImage: episode.coverImage,
    };
    const revisionFingerprint = fingerprintBookSource({ revisionId: episode.revisionId ?? null, revisionFingerprint: episode.revisionFingerprint ?? null, payload });
    return {
      episodeId: episode.id,
      episodeRevisionId: episode.revisionId ?? null,
      revisionFingerprint,
      payload,
      shots,
    };
  });

  const seriesPayload = {
    title: input.series.title,
    synopsis: input.series.synopsis ?? null,
    locale: input.series.locale ?? null,
    genre: input.series.genre ?? null,
    tone: input.series.tone ?? null,
    bible: input.series.bible ?? null,
  };
  const referencedIds = new Set<number>();
  for (const episode of episodes) for (const shot of episode.shots) if (shot.mediaAssetId) referencedIds.add(shot.mediaAssetId);
  const pinnedAssets = Array.from(referencedIds).sort((a, b) => a - b).map(mediaAssetId => ({
    mediaAssetId,
    checksum: assetsById.get(mediaAssetId)!.checksumSha256!.toLowerCase(),
    purpose: "shot" as const,
  }));
  const seriesFingerprint = fingerprintBookSource({ id: input.series.id, seriesPayload });
  const snapshot = verticalDramaBookSourceSnapshotSchema.parse({
    schemaVersion: 1,
    seriesId: input.series.id,
    seriesFingerprint,
    seriesPayload,
    capturedAt: (input.now ?? new Date()).toISOString(),
    episodes,
    assets: pinnedAssets,
  });
  return {
    snapshot,
    fingerprint: fingerprintBookSource({ ...snapshot, capturedAt: undefined }),
    imageCoverage: { totalShots, usableShots, missing },
  };
}

export function assertAllShotImageCoverage(result: BookSnapshotBuildResult): void {
  if (result.imageCoverage.totalShots === 0 || result.imageCoverage.missing.length > 0) {
    throw new Error("BOOK_ALL_SHOTS_IMAGE_COVERAGE_INCOMPLETE");
  }
}
