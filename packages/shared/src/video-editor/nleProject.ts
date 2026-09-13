export type ManagedAssetRef =
  | { namespace: "media_asset"; id: number | string }
  | { namespace: "library_item"; id: number }
  | { namespace: "worker_artifact"; id: string };

export type Rational = { numerator: number; denominator: number };

export interface CanonicalTransformKeyframe {
  time: number;
  x: number;
  y: number;
  scaleX: number;
  scaleY: number;
  rotation: number;
  opacity: number;
  easing?: "linear" | "ease-in" | "ease-out" | "ease-in-out";
}

export interface CanonicalClipTransform {
  x: number;
  y: number;
  scaleX: number;
  scaleY: number;
  rotation: number;
  opacity: number;
  keyframes?: CanonicalTransformKeyframe[];
}

export interface CanonicalNleClip {
  id: string;
  asset: ManagedAssetRef;
  startMs: number;
  sourceInMs: number;
  sourceOutMs: number;
  playbackRate: number;
  volume: number;
  muted: boolean;
  transform?: CanonicalClipTransform;
  text?: { value: string; style?: Record<string, unknown> };
}

export interface CanonicalNleTrack {
  id: string;
  kind: "video" | "audio" | "subtitle" | "overlay";
  clips: CanonicalNleClip[];
}

export interface CanonicalNleProject {
  projectId: string;
  schemaVersion: "nle.web.1";
  timebase: Rational;
  canvas: { width: number; height: number; pixelAspectRatio: Rational };
  tracks: CanonicalNleTrack[];
  markers: Array<{ id: string; timeMs: number; label?: string }>;
  render: { profileId: string; fps: Rational; outputRoles: string[] };
  migration: {
    sourceFormat: string;
    sourceVersion: string;
    mappingVersion: string;
    unresolved: string[];
    unsupported: string[];
    preservedUnknown: Record<string, unknown>;
  };
}

export function assertCanonicalProject(value: unknown): asserts value is CanonicalNleProject {
  if (!value || typeof value !== "object") throw new Error("PROJECT_INVALID");
  const project = value as Partial<CanonicalNleProject>;
  const safeId = (candidate: unknown): candidate is string => typeof candidate === "string" && /^[A-Za-z0-9._:-]{1,160}$/.test(candidate);
  if (project.schemaVersion !== "nle.web.1" || !safeId(project.projectId)) {
    throw new Error("PROJECT_VERSION_UNSUPPORTED");
  }
  const rational = (candidate: unknown): candidate is Rational => {
    if (!candidate || typeof candidate !== "object") return false;
    const item = candidate as Rational;
    return Number.isSafeInteger(item.numerator) && item.numerator > 0 && Number.isSafeInteger(item.denominator) && item.denominator > 0;
  };
  if (!Array.isArray(project.tracks) || !rational(project.timebase) || !project.canvas || typeof project.canvas !== "object") {
    throw new Error("PROJECT_INVALID");
  }
  if (!Number.isSafeInteger(project.canvas.width) || project.canvas.width <= 0 || !Number.isSafeInteger(project.canvas.height) || project.canvas.height <= 0 || !rational(project.canvas.pixelAspectRatio)) {
    throw new Error("PROJECT_CANVAS_INVALID");
  }
  const render = project.render;
  if (!Array.isArray(project.markers) || !render || !Array.isArray(render.outputRoles) || render.outputRoles.length === 0 || !safeId(render.profileId) || !rational(render.fps)) {
    throw new Error("PROJECT_RENDER_INVALID");
  }
  if (new Set(render.outputRoles).size !== render.outputRoles.length || render.outputRoles.some((role) => !safeId(role))) {
    throw new Error("PROJECT_RENDER_INVALID");
  }
  const migration = project.migration;
  if (!migration || typeof migration !== "object" || !safeId(migration.mappingVersion) || typeof migration.sourceFormat !== "string" || typeof migration.sourceVersion !== "string" || !Array.isArray(migration.unresolved) || !Array.isArray(migration.unsupported) || !migration.preservedUnknown || typeof migration.preservedUnknown !== "object" || Array.isArray(migration.preservedUnknown)) {
    throw new Error("PROJECT_MIGRATION_INVALID");
  }
  const markerIds = new Set<string>();
  for (const marker of project.markers) {
    if (!marker || typeof marker !== "object" || !safeId(marker.id) || !Number.isFinite(marker.timeMs) || marker.timeMs < 0 || (marker.label !== undefined && typeof marker.label !== "string")) {
      throw new Error("PROJECT_MARKER_INVALID");
    }
    if (!Number.isSafeInteger(marker.timeMs) || markerIds.has(marker.id)) throw new Error("PROJECT_MARKER_INVALID");
    markerIds.add(marker.id);
  }
  const kinds = new Set<CanonicalNleTrack["kind"]>(["video", "audio", "subtitle", "overlay"]);
  const namespaces = new Set<ManagedAssetRef["namespace"]>(["media_asset", "library_item", "worker_artifact"]);
  const trackIds = new Set<string>();
  for (const track of project.tracks) {
    if (!track || typeof track !== "object" || !safeId(track.id) || !kinds.has(track.kind) || !Array.isArray(track.clips)) throw new Error("PROJECT_TRACK_INVALID");
    if (trackIds.has(track.id)) throw new Error("PROJECT_TRACK_INVALID");
    trackIds.add(track.id);
    const clipIds = new Set<string>();
    for (const clip of track.clips) {
      if (!clip || typeof clip !== "object" || !safeId(clip.id) || !clip.asset || !namespaces.has(clip.asset.namespace) || (typeof clip.asset.id !== "string" && (!Number.isSafeInteger(clip.asset.id) || clip.asset.id <= 0)) || (typeof clip.asset.id === "string" && !safeId(clip.asset.id))) throw new Error("PROJECT_CLIP_INVALID");
      if (clipIds.has(clip.id)) throw new Error("PROJECT_CLIP_INVALID");
      clipIds.add(clip.id);
      if (![clip.startMs, clip.sourceInMs, clip.sourceOutMs].every(Number.isSafeInteger) || ![clip.playbackRate, clip.volume].every(Number.isFinite) || clip.startMs < 0 || clip.sourceInMs < 0 || clip.sourceOutMs < clip.sourceInMs || clip.playbackRate <= 0 || clip.volume < 0) throw new Error("PROJECT_TIMING_INVALID");
      if (clip.transform !== undefined) {
        const transform = clip.transform;
        if (typeof transform !== "object" || transform === null || Array.isArray(transform)) throw new Error("PROJECT_CLIP_INVALID");
        const numericFields = [transform.x, transform.y, transform.scaleX, transform.scaleY, transform.rotation, transform.opacity];
        if (numericFields.some((item) => typeof item !== "number" || !Number.isFinite(item))) throw new Error("PROJECT_CLIP_INVALID");
        if (transform.keyframes !== undefined && (!Array.isArray(transform.keyframes) || transform.keyframes.some((keyframe) => {
          if (!keyframe || typeof keyframe !== "object") return true;
          const item = keyframe as CanonicalTransformKeyframe;
          const values = [item.time, item.x, item.y, item.scaleX, item.scaleY, item.rotation, item.opacity];
          return values.some((value) => typeof value !== "number" || !Number.isFinite(value)) || item.time < 0 || item.time > 1 || (item.easing !== undefined && !["linear", "ease-in", "ease-out", "ease-in-out"].includes(item.easing));
        }))) throw new Error("PROJECT_CLIP_INVALID");
      }
      if (clip.text !== undefined && (!clip.text || typeof clip.text.value !== "string" || (clip.text.style !== undefined && (typeof clip.text.style !== "object" || clip.text.style === null || Array.isArray(clip.text.style))))) throw new Error("PROJECT_CLIP_INVALID");
    }
  }
}
