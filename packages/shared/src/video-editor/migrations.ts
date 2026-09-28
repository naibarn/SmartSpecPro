import { assertCanonicalProject, type CanonicalNleClip, type CanonicalNleProject, type CanonicalNleTrack } from "./nleProject";

export interface MigrationReport {
  sourceFormat: string;
  sourceVersion: string;
  mappingVersion: string;
  converted: string[];
  unresolved: string[];
  unsupported: string[];
  preservedUnknown: Record<string, unknown>;
}

type JsonObject = Record<string, unknown>;

function asObject(value: unknown): JsonObject {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonObject : {};
}

function finiteNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function secondsToMs(value: unknown, fallback: number): number {
  return Math.max(0, Math.round(finiteNumber(value, fallback) * 1000));
}

function safeIdOrFallback(value: unknown, fallback: string, unsupported: string[], path: string): string {
  if (typeof value === "string" && /^[A-Za-z0-9._:-]{1,160}$/.test(value)) return value;
  if (value !== undefined) unsupported.push(path);
  return fallback;
}

function trackKind(value: unknown): CanonicalNleTrack["kind"] {
  const type = typeof value === "string" ? value.toLowerCase() : "";
  if (type.startsWith("audio")) return "audio";
  if (type === "subtitle" || type === "text" || type.startsWith("text_")) return "subtitle";
  if (type === "overlay" || type === "code_overlay" || type.startsWith("code")) return "overlay";
  return "video";
}

function assetIdForClip(clip: JsonObject, assets: JsonObject): string | number | null {
  const direct = clip.assetId ?? clip.mediaId;
  if (typeof direct === "number" && Number.isSafeInteger(direct) && direct > 0) return direct;
  if (typeof direct === "string" && /^[A-Za-z0-9._:-]{1,160}$/.test(direct)) return direct;
  const sourcePath = typeof clip.sourcePath === "string" ? clip.sourcePath : typeof clip.sourceUrl === "string" ? clip.sourceUrl : null;
  if (!sourcePath) return null;
  for (const [key, rawAsset] of Object.entries(assets)) {
    const asset = asObject(rawAsset);
    const candidate = asset.path ?? asset.filePath ?? asset.sourcePath ?? asset.sourceUrl ?? asset.originalPath;
    if (candidate === sourcePath) return key;
  }
  return null;
}

function mapClip(clip: JsonObject, trackIndex: number, clipIndex: number, assets: JsonObject, unresolved: string[], unsupported: string[]): CanonicalNleClip | null {
  const assetId = assetIdForClip(clip, assets);
  if (assetId === null) {
    unresolved.push(`tracks[${trackIndex}].clips[${clipIndex}].asset`);
    return null;
  }
  const startMs = typeof clip.timelineStartMs === "number" ? Math.max(0, Math.round(clip.timelineStartMs)) : typeof clip.startMs === "number" ? Math.max(0, Math.round(clip.startMs)) : secondsToMs(clip.startTime, 0);
  const sourceInMs = typeof clip.trimInMs === "number" ? Math.max(0, Math.round(clip.trimInMs)) : typeof clip.inMs === "number" ? Math.max(0, Math.round(clip.inMs)) : secondsToMs(clip.trimIn, 0);
  const playbackRate = finiteNumber(clip.playbackRate ?? clip.speed, 1);
  const safePlaybackRate = playbackRate > 0 ? playbackRate : 1;
  const durationMs = typeof clip.durationMs === "number" ? Math.max(0, Math.round(clip.durationMs)) : secondsToMs(clip.duration, 0);
  const sourceOutMs = typeof clip.trimOutMs === "number" ? Math.max(sourceInMs, Math.round(clip.trimOutMs)) : typeof clip.outMs === "number" ? Math.max(sourceInMs, Math.round(clip.outMs)) : sourceInMs + Math.round(durationMs * safePlaybackRate);
  const textConfig = asObject(clip.textConfig);
  const textValue = typeof clip.text === "string" ? clip.text : typeof textConfig.text === "string" ? textConfig.text : undefined;
  const transform = asObject(clip.transform);
  const hasTransform = Object.keys(transform).length > 0;
  const canonicalTransform = hasTransform ? {
    x: finiteNumber(transform.x, 0),
    y: finiteNumber(transform.y, 0),
    scaleX: finiteNumber(transform.scaleX ?? transform.scale, 1),
    scaleY: finiteNumber(transform.scaleY ?? transform.scale, 1),
    rotation: finiteNumber(transform.rotation ?? transform.rotationDeg, 0),
    opacity: finiteNumber(transform.opacity, 1),
  } : undefined;
  if (clip.effects !== undefined || clip.inTransition !== undefined || clip.transitions !== undefined) unsupported.push(`tracks[${trackIndex}].clips[${clipIndex}].effects-or-transitions`);
  return {
    id: safeIdOrFallback(clip.id ?? clip.clipId, `clip-${trackIndex + 1}-${clipIndex + 1}`, unsupported, `tracks[${trackIndex}].clips[${clipIndex}].id`),
    asset: { namespace: "media_asset", id: assetId },
    startMs,
    sourceInMs,
    sourceOutMs,
    playbackRate: safePlaybackRate,
    volume: Math.max(0, finiteNumber(clip.volume, 1)),
    muted: clip.muted === true || clip.mute === true,
    ...(canonicalTransform ? { transform: canonicalTransform } : {}),
    ...(textValue !== undefined ? { text: { value: textValue, style: textConfig } } : {}),
  };
}

export function migrateLegacyProject(input: unknown, projectId: string): { project: CanonicalNleProject; report: MigrationReport } {
  if (!input || typeof input !== "object") throw new Error("PROJECT_IMPORT_INVALID");
  const source = input as JsonObject;
  const settings = asObject(source.settings);
  const timeline = asObject(source.timeline);
  const assets: JsonObject = { ...asObject(source.assets) };
  if (Object.keys(assets).length === 0 && Array.isArray(source.mediaPool)) {
    for (const [index, rawAsset] of source.mediaPool.entries()) {
      const asset = asObject(rawAsset);
      const id = typeof asset.id === "string" && /^[A-Za-z0-9._:-]{1,160}$/.test(asset.id) ? asset.id : `media-${index + 1}`;
      assets[id] = asset;
    }
  }
  const sourceFormat = typeof source.format === "string" ? source.format : source.timeline ? "legacy-web" : "worker-nle";
  const sourceVersion = typeof source.version === "string" ? source.version : "unknown";
  const rawTracks = Array.isArray(source.tracks) ? source.tracks : Array.isArray(timeline.tracks) ? timeline.tracks : [];
  const unresolved: string[] = [];
  const unsupported: string[] = [];
  const tracks: CanonicalNleTrack[] = rawTracks.map((raw, index) => {
    const track = asObject(raw);
    const rawClips = Array.isArray(track.clips) ? track.clips : [];
    const clips = rawClips
      .map((rawClip, clipIndex) => mapClip(asObject(rawClip), index, clipIndex, assets, unresolved, unsupported))
      .filter((clip): clip is CanonicalNleClip => clip !== null);
    return { id: safeIdOrFallback(track.id, `track-${index + 1}`, unsupported, `tracks[${index}].id`), kind: trackKind(track.kind ?? track.type), clips };
  });
  const known = new Set(["format", "version", "tracks", "timeline", "assets", "mediaPool", "settings", "canvas", "fps", "name", "title", "createdAt", "modifiedAt", "updatedAt", "audioMixing", "export", "metadata", "projectId"]);
  const preservedUnknown = Object.fromEntries(Object.entries(source).filter(([key]) => !known.has(key)));
  const report: MigrationReport = {
    sourceFormat,
    sourceVersion,
    mappingVersion: "feature-184.2",
    converted: ["project-header", "canvas", "tracks", "clips", "asset-refs"],
    unresolved,
    unsupported,
    preservedUnknown,
  };
  const sourceCanvas = asObject(source.canvas);
  const width = Math.max(1, Math.round(finiteNumber(settings.width ?? sourceCanvas.width, 1080)));
  const height = Math.max(1, Math.round(finiteNumber(settings.height ?? sourceCanvas.height, 1920)));
  const fps = Math.max(1, finiteNumber(settings.fps ?? source.fps ?? sourceCanvas.fps, 30));
  const calculatedDurationMs = tracks.flatMap(track => track.clips).reduce((max, clip) => Math.max(max, clip.startMs + Math.round((clip.sourceOutMs - clip.sourceInMs) / clip.playbackRate)), 0);
  const durationMs = Math.max(0, Math.round(finiteNumber(sourceCanvas.durationMs, secondsToMs(settings.duration, calculatedDurationMs / 1000))));
  const rawMarkers = Array.isArray(source.markers) ? source.markers : Array.isArray(timeline.markers) ? timeline.markers : [];
  const markerIds = new Set<string>();
  const markers = rawMarkers.flatMap((raw, index) => {
    const marker = asObject(raw);
    const timeMs = typeof marker.timeMs === "number" ? marker.timeMs : secondsToMs(marker.time, 0);
    if (!Number.isFinite(timeMs) || timeMs < 0) {
      unsupported.push(`markers[${index}]`);
      return [];
    }
    const requestedId = typeof marker.id === "string" && /^[A-Za-z0-9._:-]{1,160}$/.test(marker.id) ? marker.id : `marker-${index + 1}`;
    const id = markerIds.has(requestedId) ? `marker-${index + 1}` : requestedId;
    if (markerIds.has(requestedId)) unsupported.push(`markers[${index}].duplicate-id`);
    markerIds.add(id);
    return [{
      id,
      timeMs: Math.round(timeMs),
      ...(typeof marker.label === "string" ? { label: marker.label } : {}),
    }];
  });
  const project: CanonicalNleProject = {
    projectId,
    schemaVersion: "nle.web.1",
    timebase: { numerator: 1, denominator: 1000 },
    canvas: { width, height, pixelAspectRatio: { numerator: 1, denominator: 1 } },
    tracks,
    markers,
    render: { profileId: "web-default", fps: { numerator: Math.round(fps * 1000), denominator: 1000 }, outputRoles: ["final_video"] },
    migration: { sourceFormat, sourceVersion, mappingVersion: report.mappingVersion, unresolved: report.unresolved, unsupported: report.unsupported, preservedUnknown },
  };
  try {
    assertCanonicalProject(project);
  } catch {
    throw new Error("PROJECT_IMPORT_INVALID");
  }
  // Canonical NLE stores duration at clip level; retain source duration for migration diagnostics.
  if (durationMs > calculatedDurationMs) report.converted.push("project-duration");
  return { project, report };
}
