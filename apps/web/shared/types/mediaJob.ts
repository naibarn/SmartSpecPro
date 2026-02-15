import type {
  VideoEditorProject,
  Clip,
  ClipTransform,
  ClipTransition,
  TextConfig,
  Track,
} from "../../client/src/types/videoEditor";
import { createEmptyProject } from "../../client/src/types/videoEditor";

// ========================================
// Asset Model
// ========================================

export interface MediaStream {
  type: "video" | "audio";
  codec: string;
  width?: number;
  height?: number;
  fps?: number;
  channels?: number;
  sampleRate?: number;
}

export interface MediaAsset {
  assetId: string;
  kind: "video" | "audio" | "image" | "subtitle";
  uri: string;
  mime?: string;
  label?: string;
  durationMs?: number;
  streams?: MediaStream[];
  contentHash?: string;
  extra?: Record<string, unknown>;
}

// ========================================
// Timeline Model (ms-based)
// ========================================

export interface MediaTimeline {
  projectId: string;
  fps: number;
  width: number;
  height: number;
  contractVersion?: string;
  capabilityMode?: "strict_parity";
  compatibilityPolicy?: {
    unsupportedContractPolicy: UnsupportedContractPolicy;
  };
  tracks: MediaTrack[];
}

export interface MediaTrack {
  trackId: string;
  type: "video" | "audio" | "subtitle";
  clips: MediaClip[];
}

export interface MediaClip {
  clipId: string;
  assetId: string;
  inMs?: number;
  outMs?: number;
  startMs: number;
  playbackRate?: number;
  volume?: number;
  mute?: boolean;
  inTransition?: { name: string; durationMs: number; alignment?: string };
  transform?: ClipTransform;
  textConfig?: TextConfig;
  zOrder?: number;
}

// ========================================
// Job Envelope, Progress, and Result
// ========================================

export type MediaJobType =
  | "probe"
  | "render_mp4_h264"
  | "render_hls"
  | "waveform_peaks"
  | "thumbnails"
  | "subtitles_extract"
  | "subtitles_burnin"
  | "concat"
  | "dead_air_detect"
  | "dead_air_cut"
  | "generate_clip_from_api"
  | "transcode_h264"
  | "extract_audio";

export const VALID_JOB_TYPES: MediaJobType[] = [
  "probe",
  "render_mp4_h264",
  "render_hls",
  "waveform_peaks",
  "thumbnails",
  "subtitles_extract",
  "subtitles_burnin",
  "concat",
  "dead_air_detect",
  "dead_air_cut",
  "generate_clip_from_api",
  "transcode_h264",
  "extract_audio",
];

export interface MediaJobSpec {
  specVersion: "0.1";
  jobId: string;
  jobType: MediaJobType;
  priority?: "low" | "normal" | "high";
  inputs: {
    assets?: MediaAsset[];
    project?: MediaTimeline | null;
  };
  params?: Record<string, unknown>;
  output: {
    mode: "file" | "dir" | "memory";
    target: string;
    overwrite?: boolean;
  };
  engine?: {
    strategy: "desktop_sidecar" | "web_backend" | "web_wasm";
    hints?: Record<string, unknown>;
  };
  cache?: { enabled?: boolean; key?: string };
  telemetry?: { traceId?: string };
}

export type MediaJobStatus =
  | "queued"
  | "running"
  | "done"
  | "error"
  | "canceled";

export interface MediaJobProgress {
  jobId: string;
  status: MediaJobStatus;
  progress: number;
  etaMs?: number;
  stage?: string;
  message?: string;
  metrics?: { speed?: string; outTimeMs?: number };
}

export interface MediaJobResult {
  jobId: string;
  status: "done";
  artifacts: MediaArtifact[];
  derived?: Record<string, unknown>;
}

export interface MediaJobError {
  jobId: string;
  status: "error";
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
}

export interface MediaArtifact {
  kind: string;
  uri: string;
  mime?: string;
}

export const MEDIA_TIMELINE_CONTRACT_VERSION = "1.0";
export type UnsupportedContractPolicy =
  | "reject_with_clear_error"
  | "gated_downgrade";

function parseMajorVersion(value: string): number | null {
  const [majorRaw] = value.split(".");
  const parsed = Number.parseInt(majorRaw, 10);
  if (!Number.isFinite(parsed)) return null;
  if (parsed < 0) return null;
  return parsed;
}

function hasTextSemantics(timeline: MediaTimeline): boolean {
  return timeline.tracks.some(
    (track) =>
      track.type === "subtitle" ||
      track.clips.some((clip) => typeof clip.textConfig === "object" && clip.textConfig !== null),
  );
}

function resolveCompatibilityOutcome(
  contractVersion: string,
  policy: UnsupportedContractPolicy,
  timeline: MediaTimeline,
): "supported" | "gated_downgrade" {
  const supportedMajor = parseMajorVersion(MEDIA_TIMELINE_CONTRACT_VERSION);
  const requestedMajor = parseMajorVersion(contractVersion);

  if (supportedMajor === null || requestedMajor === null) {
    throw new Error('Invalid media timeline contractVersion format (expected: X.Y)');
  }
  if (requestedMajor <= supportedMajor) {
    return "supported";
  }
  if (policy === "gated_downgrade" && !hasTextSemantics(timeline)) {
    return "gated_downgrade";
  }
  throw new Error(
    `Unsupported media timeline contractVersion "${contractVersion}" (policy: ${policy})`,
  );
}

// ========================================
// Validation
// ========================================

const SHELL_METACHAR_RE = /[;|&`$(){}><]/;

export function validateJobSpec(
  spec: MediaJobSpec,
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!spec.specVersion) {
    errors.push("specVersion is required");
  } else if (spec.specVersion !== "0.1") {
    errors.push(`specVersion must be "0.1", got "${spec.specVersion}"`);
  }

  if (!spec.jobId) {
    errors.push("jobId is required");
  }

  if (!spec.jobType) {
    errors.push("jobType is required");
  } else if (!VALID_JOB_TYPES.includes(spec.jobType)) {
    errors.push(
      `jobType "${spec.jobType}" is not valid. Must be one of: ${VALID_JOB_TYPES.join(", ")}`,
    );
  }

  if (!spec.inputs) {
    errors.push("inputs is required");
  }

  if (!spec.output) {
    errors.push("output is required");
  }

  // URI validation on assets
  if (spec.inputs?.assets) {
    for (const asset of spec.inputs.assets) {
      if (SHELL_METACHAR_RE.test(asset.uri)) {
        errors.push(
          `Asset "${asset.assetId}" uri contains invalid shell metacharacters: "${asset.uri}"`,
        );
      }
    }
  }

  // Clip validation: outMs > inMs
  if (spec.inputs?.project?.tracks) {
    const project = spec.inputs.project;
    const contractVersion = project.contractVersion ?? MEDIA_TIMELINE_CONTRACT_VERSION;
    const policy =
      project.compatibilityPolicy?.unsupportedContractPolicy ??
      "reject_with_clear_error";
    try {
      resolveCompatibilityOutcome(contractVersion, policy, project);
    } catch (error) {
      errors.push(error instanceof Error ? error.message : "Invalid project contract");
    }
    for (const track of spec.inputs.project.tracks) {
      for (const clip of track.clips) {
        if (
          clip.inMs !== undefined &&
          clip.outMs !== undefined &&
          clip.outMs <= clip.inMs
        ) {
          errors.push(
            `Clip "${clip.clipId}": outMs (${clip.outMs}) must be greater than inMs (${clip.inMs})`,
          );
        }
      }
    }
  }

  // Numeric range validation for params
  if (spec.params) {
    if (spec.params.bucketMs !== undefined) {
      const b = spec.params.bucketMs as number;
      if (b < 10 || b > 500) {
        errors.push(
          `params.bucketMs must be between 10 and 500 inclusive, got ${b}`,
        );
      }
    }
    if (spec.params.segmentSeconds !== undefined) {
      const s = spec.params.segmentSeconds as number;
      if (s < 2 || s > 10) {
        errors.push(
          `params.segmentSeconds must be between 2 and 10 inclusive, got ${s}`,
        );
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

// ========================================
// Conversion Helpers
// ========================================

export function msToSeconds(ms: number): number {
  return ms / 1000;
}

export function secondsToMs(s: number): number {
  return Math.round(s * 1000);
}

export function projectToTimeline(
  project: VideoEditorProject,
): MediaTimeline {
  return {
    projectId: project.name || "untitled",
    fps: project.settings.fps,
    width: project.settings.width,
    height: project.settings.height,
    contractVersion: MEDIA_TIMELINE_CONTRACT_VERSION,
    capabilityMode: "strict_parity",
    compatibilityPolicy: {
      unsupportedContractPolicy: "reject_with_clear_error",
    },
    tracks: project.timeline.tracks.map(
      (track: Track): MediaTrack => ({
        trackId: track.id,
        type:
          track.type === "overlay"
            ? "video"
            : track.type === "text"
              ? "subtitle"
              : track.type,
        clips: track.clips.map(
          (clip: Clip, index: number): MediaClip => ({
            clipId: clip.id,
            assetId: clip.assetId,
            startMs: secondsToMs(clip.startTime),
            inMs: secondsToMs(clip.trimIn),
            outMs: secondsToMs(clip.trimOut),
            playbackRate: clip.speed,
            volume: clip.volume,
            inTransition: clip.inTransition,
            transform: clip.transform,
            textConfig: clip.textConfig,
            zOrder: index,
          }),
        ),
      }),
    ),
  };
}

export interface TimelineToProjectOptions {
  unsupportedContractPolicy?: UnsupportedContractPolicy;
}

export function timelineToProject(
  timeline: MediaTimeline,
  options: TimelineToProjectOptions = {},
): VideoEditorProject {
  const policy =
    options.unsupportedContractPolicy ??
    timeline.compatibilityPolicy?.unsupportedContractPolicy ??
    "reject_with_clear_error";
  const contractVersion = timeline.contractVersion ?? MEDIA_TIMELINE_CONTRACT_VERSION;
  resolveCompatibilityOutcome(contractVersion, policy, timeline);

  const base = createEmptyProject(timeline.projectId);

  base.version = "2.0";
  base.settings.fps = timeline.fps;
  base.settings.width = timeline.width;
  base.settings.height = timeline.height;

  base.timeline.tracks = timeline.tracks.map(
    (track: MediaTrack): Track => ({
      id: track.trackId,
      type: track.type === "subtitle" ? "text" : track.type,
      name: track.trackId,
      clips: track.clips.map(
        (clip: MediaClip): Clip => ({
          id: clip.clipId,
          assetId: clip.assetId,
          trackId: track.trackId,
          startTime: msToSeconds(clip.startMs),
          duration: clip.outMs && clip.inMs !== undefined
            ? msToSeconds(clip.outMs - clip.inMs)
            : 0,
          trimIn: clip.inMs !== undefined ? msToSeconds(clip.inMs) : 0,
          trimOut: clip.outMs !== undefined ? msToSeconds(clip.outMs) : 0,
          volume: clip.volume ?? 1.0,
          speed: clip.playbackRate ?? 1.0,
          effects: [],
          inTransition: clip.inTransition as ClipTransition | undefined,
          transform: clip.transform,
          textConfig: clip.textConfig,
        }),
      ),
      muted: false,
      locked: false,
      visible: true,
    }),
  );

  return base;
}
