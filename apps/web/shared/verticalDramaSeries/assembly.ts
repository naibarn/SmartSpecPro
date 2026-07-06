/**
 * Vertical Drama Series — Duration profiles + assembly manifest (spec §7.3, §7.4).
 *
 * Two duration profiles are pinned as constants:
 *  - default: Veo-first `first_last_frame_bridge` (9 frames -> 8 clips)
 *  - fallback: OpenAI-compatible per-shot strategy (9 clips)
 * Both must sum to the 60-second target. Final clip trimming is recorded on the
 * assembly manifest (`trimStartSeconds`/`trimEndSeconds`), never applied silently.
 */

import type { VerticalDramaSubShotPolicy } from "./subShots";

/** Target episode duration in seconds (fixed for the MVP). */
export const VERTICAL_DRAMA_TARGET_DURATION_SECONDS = 60 as const;

export type VerticalDramaDurationProfileDefault = {
  id: "vertical_drama_60s_9_frames_8_clips";
  totalSeconds: 60;
  frameCount: 9;
  clipCount: 8;
  clipDurationsSeconds: number[];
  motionMode: "first_last_frame_bridge";
  /** Optional sub-shot decomposition policy (spec §7.4); default off / absent. */
  subShotPolicy?: VerticalDramaSubShotPolicy;
};

export type VerticalDramaDurationProfileFallback = {
  id: "vertical_drama_60s_9_shots";
  totalSeconds: 60;
  shotCount: 9;
  shotDurationsSeconds: number[];
  motionMode: "per_shot_first_frame_or_prompt";
  subShotPolicy?: VerticalDramaSubShotPolicy;
};

export type VerticalDramaDurationProfile =
  | VerticalDramaDurationProfileDefault
  | VerticalDramaDurationProfileFallback;

/**
 * Default profile referenced by `VerticalDramaEpisode.durationProfileId`
 * for generated episodes: 9 frames bridged into 8 clips (spec §7.4).
 */
export const VERTICAL_DRAMA_DURATION_PROFILE_DEFAULT = {
  id: "vertical_drama_60s_9_frames_8_clips",
  totalSeconds: 60,
  frameCount: 9,
  clipCount: 8,
  clipDurationsSeconds: [8, 8, 8, 8, 8, 8, 8, 4],
  motionMode: "first_last_frame_bridge",
} as const satisfies VerticalDramaDurationProfileDefault;

/** Fallback profile for providers without first/last-frame support (spec §7.4). */
export const VERTICAL_DRAMA_DURATION_PROFILE_FALLBACK = {
  id: "vertical_drama_60s_9_shots",
  totalSeconds: 60,
  shotCount: 9,
  shotDurationsSeconds: [8, 8, 8, 4, 8, 8, 4, 8, 4],
  motionMode: "per_shot_first_frame_or_prompt",
} as const satisfies VerticalDramaDurationProfileFallback;

/** The canonical default duration profile ID used across episode planning. */
export const VERTICAL_DRAMA_DEFAULT_DURATION_PROFILE_ID =
  VERTICAL_DRAMA_DURATION_PROFILE_DEFAULT.id;

/** Returns the per-clip / per-shot durations for a profile. */
export function durationsOf(profile: VerticalDramaDurationProfile): number[] {
  return "clipDurationsSeconds" in profile
    ? profile.clipDurationsSeconds
    : profile.shotDurationsSeconds;
}

export type DurationProfileValidationResult = {
  valid: boolean;
  errors: string[];
};

/**
 * Validate a duration profile (spec §7.4):
 *  - the sum of durations must equal `totalSeconds` (60);
 *  - every duration must be supported by the provider's `allowedVideoSeconds`
 *    (when `allowedVideoSeconds` is supplied).
 */
export function validateDurationProfile(
  profile: VerticalDramaDurationProfile,
  allowedVideoSeconds?: number[],
): DurationProfileValidationResult {
  const errors: string[] = [];
  const durations = durationsOf(profile);
  const sum = durations.reduce((acc, d) => acc + d, 0);
  if (sum !== profile.totalSeconds) {
    errors.push(`duration_sum_mismatch: durations sum to ${sum}s, expected ${profile.totalSeconds}s`);
  }
  if (allowedVideoSeconds) {
    for (const d of durations) {
      if (!allowedVideoSeconds.includes(d)) {
        errors.push(`unsupported_clip_duration: ${d}s not in provider allowedVideoSeconds`);
      }
    }
  }
  return { valid: errors.length === 0, errors };
}

/** Assembly / export manifest handed to the render pipeline (spec §7.3). */
export type VerticalDramaAssemblyManifest = {
  handoffType: "video_assembly_manifest";
  targetDurationSeconds: 60;
  clips: Array<{
    clipNumber: number;
    sourceShotNumbers: number[];
    durationSeconds: number;
    mediaAssetId?: string;
    trimStartSeconds?: number;
    trimEndSeconds?: number;
    status: "planned" | "rendering" | "ready" | "failed" | "skipped";
  }>;
  ffmpegConcatPlan: string[];
  subtitlePlan: Array<{
    subtitleCueId: string;
    startSeconds: number;
    endSeconds: number;
    text: string;
    safeArea: "bottom_safe" | "middle_safe" | "top_safe";
  }>;
  audioBgmPlan: Array<{
    trackType: "dialogue" | "voiceover" | "bgm" | "ambience";
    mediaAssetId?: string;
    startSeconds: number;
    endSeconds: number;
    volumeDb?: number;
  }>;
  exportSettings: {
    aspectRatio: "9:16";
    resolution: "1080p" | "720p" | string;
    fps: 24 | 30 | number;
    container: "mp4";
  };
  /** Whole-episode compiled-video status (feature 131 "download + compound
   *  video" upgrade, 2026-07-06) — see `VerticalDramaCompiledVideoState`
   *  below. Optional/absent for manifests created before this feature, and
   *  independent of the `clips`/`ffmpegConcatPlan` plan fields above (which
   *  describe the `assemble_episode_manifest` STAGE's plan-only output, not
   *  this feature's real ffmpeg concat job). */
  compiledVideo?: VerticalDramaCompiledVideoState;
};

/**
 * Durable status for the whole-episode compiled video (feature 131
 * "download + compound video" upgrade, 2026-07-06) — persisted onto
 * `episode.assemblyManifest.compiledVideo` by
 * `verticalDramaEpisodes.assembleEpisodeVideo` (async submit) and its
 * background ffmpeg concat job. Mirrors the `videoTask.pendingTaskId`/
 * `videoUrl` resume convention used elsewhere in this feature. A reload
 * recovers in-progress/completed/failed state by reading this field back via
 * `getEpisodeDetail` (or any other read of the episode row that includes
 * `assemblyManifest`) instead of relying on a transient toast.
 */
export type VerticalDramaCompiledVideoState = {
  /** Set immediately at submit time; cleared once the job reaches a terminal
   *  state (completed or failed) — a non-empty value with no terminal
   *  `videoUrl`/`error` means "still processing, resume polling on load." */
  pendingJobId?: string;
  /** Same-origin `/api/storage/...` path or absolute provider/storage URL. */
  videoUrl?: string;
  durationSeconds?: number;
  /** Number of clips actually concatenated (may be less than the full shot
   *  count when the job was submitted with `allowPartial: true`). */
  shotCount?: number;
  assembledAt?: string;
  status?: "pending" | "completed" | "failed";
  error?: string;
};
