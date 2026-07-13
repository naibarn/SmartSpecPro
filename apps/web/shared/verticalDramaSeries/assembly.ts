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
  /**
   * Per-line dialogue-audio timeline (W12-A voice chain wave), populated by
   * `verticalDramaEpisodes.assembleEpisodeVideo` (flag-gated on
   * `verticalDramaSeriesVoiceChain`) from the episode's persisted
   * `dialogueAudioPlan.separateTtsPlan.items[]` whenever a line carries a
   * completed audio task (`audioTask.audioUrl`/`mediaAssetId`).
   *
   * IMPORTANT — this manifest is presently MANIFEST-ONLY / plan-level for
   * the `assemble_episode_manifest` stage fields above (`clips`/
   * `ffmpegConcatPlan`/`subtitlePlan`/`audioBgmPlan`): no server-side render
   * ever consumes them (see `server/services/verticalDramaAssembly.ts`'s own
   * doc comment). The REAL, currently-functioning whole-episode render
   * (`compiledVideo` above, via `server/services/verticalDramaEpisodeVideoAssembly.ts`)
   * is a pure video-clip ffmpeg concat and does NOT mix in a separate audio
   * track today. `dialogueAudioTimeline` is therefore a forward-compatible
   * DATA CONTRACT for a future render wave (or the Python
   * `media_job_worker.py` VideoStudio-shaped compositor) to consume — this
   * wave deliberately does not wire it into any ffmpeg invocation (no new
   * ffmpeg infra built here).
   */
  dialogueAudioTimeline?: Array<{
    lineId: string;
    shotNumber: number;
    clipNumber?: number;
    /** Canonical `media_assets` id when resolved, else the raw `audioUrl` —
     *  see `VerticalDramaSeparateTtsPlanItem.audioTask` in `audio.ts`. Today
     *  this is virtually always the raw URL, since nothing resolves TTS
     *  output into a canonical asset yet (mirrors `clip.videoTask.videoUrl`,
     *  which is never resolved to a `media_assets` id either). */
    audioAssetId: string;
    startSeconds: number;
    durationSeconds?: number;
  }>;
  /** Paired with `dialogueAudioTimeline` — signals that a future renderer
   *  should loudness-normalize the per-line dialogue tracks before mixing
   *  (different TTS providers/voices can differ significantly in output
   *  level). Always `true` when `dialogueAudioTimeline` is non-empty;
   *  omitted otherwise. */
  loudnessNormalize?: true;
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

/**
 * Durable status for the series-level narrated trailer (Bible tab, series
 * trailer feature, 2026-07-07) — persisted onto `verticalDramaSeries.trailer`
 * (a dedicated nullable JSONB column, NOT nested under an episode's
 * `assemblyManifest`, since a trailer is a whole-series artifact). Same
 * submit -> background-job -> poll convention as
 * `VerticalDramaCompiledVideoState`: a non-null value with `status:
 * "processing"` and a `jobId` means "still running, resume polling on load."
 */
export type VerticalDramaSeriesTrailerState = {
  status: "processing" | "completed" | "failed";
  /** Present while `status === "processing"`; cleared on terminal states. */
  jobId?: string;
  /** Narration voice-over audio the trailer was muxed against (as supplied by
   *  the caller to `generateTrailer` — usually a `media.generateAudio` result). */
  narrationAudioUrl?: string;
  narrationDurationSeconds?: number;
  /** Same-origin `/api/storage/...` path or absolute storage URL for the
   *  finished 1080x1920 mp4. Present only when `status === "completed"`. */
  videoUrl?: string;
  durationSeconds?: number;
  sourceCounts?: { images: number; videoClips: number };
  /** Present only when `status === "failed"`; capped length (see assembly service). */
  error?: string;
  updatedAt: string;
};

/**
 * Production Episodes (Phase D′-1,
 * `planning/vertical-drama-production-episodes/plan.md`) — durable status
 * for ONE Production Episode GROUP, persisted as an entry inside
 * `VerticalDramaProductionEpisodesManifest` below (see that type's own doc
 * comment for the whole-series shape and where it lives).
 *
 * MODEL: a Sub-Episode (today's `vertical_drama_episodes` row, ~9 shots, the
 * spec's "ตอน") is compiled into one short video via
 * `verticalDramaEpisodes.assembleEpisodeVideo`
 * (`VerticalDramaCompiledVideoState` above,
 * `episode.assemblyManifest.compiledVideo.videoUrl`). A Production Episode
 * groups `groupSize` (5 or 10) CONSECUTIVE Sub-Episodes' own compiled videos
 * into ONE concatenated 4-10 minute video — the actual publishable unit. See
 * `server/services/verticalDramaProductionEpisodeAssembly.ts` for the
 * chunking + concat job that produces this state (reuses the SAME
 * download/concat/upload ffmpeg machinery `VerticalDramaCompiledVideoState`
 * above already uses — no new ffmpeg infra for this feature).
 */
export type VerticalDramaProductionEpisodeGroupState = {
  /** 0-based position of this group within `VerticalDramaProductionEpisodesManifest.episodes[]` (also its concat/playback order). */
  index: number;
  /** The group size this GROUP was actually assembled with. Carried per-group
   *  (not just read off the manifest-level `groupSize`) so a group produced
   *  by a prior call with a DIFFERENT group size is never mistaken for
   *  still being current after the caller re-assembles with a new size. */
  groupSize: number;
  /** Sub-Episode `episodeNumber`s concatenated into this group, in playback
   *  order. May be fewer than `groupSize` for a short last group, or when
   *  assembled with `allowPartial: true` and some member had no compiled
   *  video yet. */
  subEpisodeNumbers: number[];
  status: "pending" | "completed" | "failed";
  /** Same-origin `/api/storage/...` path or absolute storage URL. Present
   *  only when `status === "completed"`. */
  videoUrl?: string;
  durationSeconds?: number;
  assembledAt?: string;
  /** Present only when `status === "failed"`. */
  error?: string;
  /**
   * Render-options LEVEL (plan.md "Render-options LEVEL" section, user
   * correction 2026-07-13) — the STYLING options this group was assembled
   * WITH, mirroring `assembleEpisodeVideo`'s own render-options input fields
   * (`verticalDramaEpisodes.ts`). Recorded here purely for UI display of
   * "what styling was this Production Episode rendered with" — persisted
   * onto the group state at "pending" time by
   * `assembleProductionEpisodesForSeries`
   * (`server/services/verticalDramaProductionEpisodeAssembly.ts`) and
   * carried through unchanged to "completed"/"failed" (that service's
   * per-group patch never touches this field). Absent when the group was
   * assembled with no `renderOptions` (D′-1 default behavior: plain concat
   * of each Sub-Episode's EXISTING compiled video, unchanged, no re-render).
   *
   * Deliberately loosely typed here (plain `string`/a small literal union),
   * NOT the server's strict `CaptionPresetId`/`SubtitleFontSizeId` enums —
   * this module stays dependency-free (no server-service imports, since it
   * is shared with the client). See
   * `server/services/verticalDramaProductionEpisodeAssembly.ts`'s own
   * `ProductionEpisodeRenderOptions` for the STRICT type that actually
   * drives rendering; a value of that stricter type always structurally
   * satisfies this looser one.
   */
  renderOptions?: {
    subtitlePreset?: string;
    subtitleFontSize?: "small" | "medium" | "large" | "xlarge";
    showAgeBadge?: boolean;
    includeDialogueAudio?: boolean;
    loudnessNormalize?: boolean;
  };
};

/**
 * Whole-series Production Episodes state — persisted onto
 * `verticalDramaSeries.productionEpisodesManifest` (a dedicated nullable
 * JSONB column, NOT nested under any one Sub-Episode's own
 * `assemblyManifest`, since a Production Episode groups MULTIPLE
 * Sub-Episodes — mirrors `VerticalDramaSeriesTrailerState`'s own "whole-series
 * artifact gets its own series-level column" convention above).
 * `groupSize` reflects the group size used by the MOST RECENT assemble call;
 * individual `episodes[]` entries carry their OWN `groupSize` too (see that
 * type's doc comment) since a re-assemble with a different group size can
 * leave older entries stamped with the previous size until they are
 * recomputed.
 */
export type VerticalDramaProductionEpisodesManifest = {
  groupSize: 5 | 10;
  episodes: VerticalDramaProductionEpisodeGroupState[];
};
