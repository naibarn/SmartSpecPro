import { createHash } from "crypto";
import type {
  VideoEditorProject,
  RenderProfile,
  Clip,
  Track,
} from "../../client/src/types/videoEditor";

export type { RenderProfile } from "../../client/src/types/videoEditor";

interface CanonicalClip {
  assetId: string;
  startTime: number;
  duration: number;
  trimIn: number;
  trimOut: number;
  volume: number;
  speed: number;
  effects: unknown[];
  inTransition?: unknown;
  transform?: unknown;
  textConfig?: unknown;
  transitions?: unknown;
}

function canonicalizeClips(clips: Clip[]): CanonicalClip[] {
  return [...clips]
    .sort((a, b) => a.startTime - b.startTime)
    .map((clip) => {
      const canonical: CanonicalClip = {
        assetId: clip.assetId,
        startTime: clip.startTime,
        duration: clip.duration,
        trimIn: clip.trimIn,
        trimOut: clip.trimOut,
        volume: clip.volume,
        speed: clip.speed,
        effects: clip.effects || [],
      };
      if (clip.inTransition) canonical.inTransition = clip.inTransition;
      if (clip.transform) canonical.transform = clip.transform;
      if (clip.textConfig) canonical.textConfig = clip.textConfig;
      if (clip.transitions) canonical.transitions = clip.transitions;
      return canonical;
    });
}

function canonicalizeTracks(tracks: Track[]) {
  return tracks.map((track) => ({
    type: track.type,
    name: track.name,
    clips: canonicalizeClips(track.clips),
    muted: track.muted,
  }));
}

/**
 * Deterministic JSON serialization with sorted keys and compact separators.
 * Matches Python's json.dumps(obj, sort_keys=True, separators=(',', ':')).
 */
function stableStringify(obj: unknown): string {
  if (obj === null || obj === undefined) return "null";
  if (typeof obj === "boolean" || typeof obj === "number") return JSON.stringify(obj);
  if (typeof obj === "string") return JSON.stringify(obj);
  if (Array.isArray(obj)) {
    return "[" + obj.map((item) => stableStringify(item)).join(",") + "]";
  }
  if (typeof obj === "object") {
    const keys = Object.keys(obj as Record<string, unknown>).sort();
    const pairs = keys.map(
      (key) =>
        JSON.stringify(key) + ":" + stableStringify((obj as Record<string, unknown>)[key]),
    );
    return "{" + pairs.join(",") + "}";
  }
  return String(obj);
}

/**
 * Compute a deterministic render hash from the project timeline, asset keys, and profile.
 *
 * The hash includes:
 * - All clip timings, ordering, transitions, and effects
 * - All asset references (by R2 object key, not by local path or URL)
 * - Project settings (resolution, fps, sample rate)
 * - Render profile name
 *
 * The hash excludes:
 * - Timestamps (createdAt, modifiedAt)
 * - UI state (selectedClipIds, hoveredClipId, zoom, scroll)
 * - Project name
 *
 * Returns a hex-encoded SHA-256 digest.
 */
export function computeRenderHash(
  project: VideoEditorProject,
  inputAssetKeys: Record<string, string>,
  profile: RenderProfile,
): string {
  const canonical = {
    settings: {
      width: project.settings.width,
      height: project.settings.height,
      fps: project.settings.fps,
      sampleRate: project.settings.sampleRate,
    },
    tracks: canonicalizeTracks(project.timeline.tracks),
    assetKeys: Object.fromEntries(
      Object.entries(inputAssetKeys).sort(([a], [b]) => a.localeCompare(b)),
    ),
    profile,
  };

  return createHash("sha256").update(stableStringify(canonical)).digest("hex");
}
