/**
 * Vertical Drama Series — Dialogue / Audio / Voice contracts (spec §14, §6.8, §7.4).
 *
 * Pure field-only TypeScript contracts + pure planning helpers. NO server/db
 * imports so the client and the planner service can both import these directly.
 *
 * NOTE: this file is imported by DIRECT PATH (`@shared/verticalDramaSeries/audio`)
 * rather than through the barrel so its `VerticalDramaDialogueAudioPlan` — the
 * authoritative section-07 shape carrying the `mode` axis — does not collide with
 * the compact recommendation type re-exported from `./contracts`.
 */

import type { VerticalDramaWarning } from "./contracts";
import type { VerticalDramaProviderCapabilities } from "./providerRouting";
import type {
  VerticalDramaSubtitleCue,
  VerticalDramaSubtitleSafeArea,
} from "./subtitles";

/* -------------------------------------------------------------------------- */
/* Enums / axes (spec §14 field pins)                                         */
/* -------------------------------------------------------------------------- */

/**
 * `mode` — narration-vs-dialogue INTENT. Distinct from `audioStrategy` (how the
 * audio is produced). `narrator` = voiceover/monologue delivery; `dialogue` =
 * named-speaker exchange. Persisted alongside `audioStrategy` (spec §14).
 */
export const VERTICAL_DRAMA_DIALOGUE_MODES = ["narrator", "dialogue"] as const;
export type VerticalDramaDialogueMode = (typeof VERTICAL_DRAMA_DIALOGUE_MODES)[number];

/**
 * `audioStrategy` — HOW the audio is produced. Exactly one of four values
 * (spec §14 field pins). Independent axis from `mode`.
 */
export const VERTICAL_DRAMA_AUDIO_STRATEGIES = [
  "separate_tts_voiceover",
  "native_video_audio",
  "dialogue_tts",
  "silent",
] as const;
export type VerticalDramaAudioStrategy = (typeof VERTICAL_DRAMA_AUDIO_STRATEGIES)[number];

/* -------------------------------------------------------------------------- */
/* Dialogue lines & speaker→voice continuity                                  */
/* -------------------------------------------------------------------------- */

/**
 * A single planned dialogue/narration line. `start`/`end` are seconds on the
 * PARENT MAIN SHOT's local timeline. A line MAY span sub-shot cuts within one
 * main shot and keeps continuous audio timing across the cuts (spec §7.4).
 */
export type VerticalDramaDialogueLine = {
  lineId: string;
  shotNumber: number;
  clipNumber?: number;
  speakerName: string;
  /** Maps to a series character; narrator lines may be unmapped. */
  speakerCharacterId?: string;
  isNarration: boolean;
  text: string;
  /** Seconds within the parent main shot. */
  start: number;
  end: number;
  targetDurationSeconds: number;
  subtitleCueId?: string;
  /** 1-based sub-shot numbers the line overlaps (only when decomposed, §7.4). */
  spansSubShotNumbers?: number[];
};

/** One speaker's series-scoped voice continuity binding. */
export type VerticalDramaSpeakerVoiceMapEntry = {
  speakerName: string;
  characterId?: string;
  voiceProvider?: string;
  voiceModelId?: string;
  /** Stable, series-scoped voice ID. Missing → warning + blocks separate TTS. */
  voiceId?: string;
  fallbackVoiceId?: string;
  /** True when the voice is locked series-wide (continuity is series-scoped). */
  locked: boolean;
  /** True when no `voiceId` is resolved for a speaker that needs a voice. */
  missingVoiceId: boolean;
};

export type VerticalDramaSpeakerVoiceMap = {
  entries: VerticalDramaSpeakerVoiceMapEntry[];
};

/* -------------------------------------------------------------------------- */
/* Native-audio policy (spec §14 rules 6-7)                                   */
/* -------------------------------------------------------------------------- */

/**
 * Native-audio capability gate. Native video audio is allowed ONLY when the
 * selected video model supports the requested audio/language AND the user
 * accepts regeneration cost (spec §14). Otherwise separate TTS is the safe
 * default.
 */
export type VerticalDramaNativeAudioPolicy = {
  requested: boolean;
  videoModelId?: string;
  modelSupportsNativeAudio: boolean;
  modelSupportsRequestedLanguage: boolean;
  userAcceptedRegenerationCost: boolean;
  allowed: boolean;
  /** Reason codes when not allowed (localizable), e.g. `model_lacks_native_audio`. */
  blockingReasons: string[];
};

/* -------------------------------------------------------------------------- */
/* Separate-TTS plan                                                          */
/* -------------------------------------------------------------------------- */

export type VerticalDramaSeparateTtsPlanItem = {
  lineId: string;
  speakerName: string;
  characterId?: string;
  voiceProvider?: string;
  voiceModelId?: string;
  voiceId?: string;
  text: string;
  targetDurationSeconds: number;
  /** Blocked when the voice ID is missing. */
  blocked: boolean;
  /** Reason code when blocked, e.g. `missing_voice_id`. */
  blockReason?: string;
};

/**
 * Separate-TTS render plan. `injectsIntoVideoPrompts` is a pinned `false`
 * invariant: separate TTS never writes speech/lip-sync instructions into the
 * visual video prompts (spec §14 rule 7) — audio is a separate track.
 */
export type VerticalDramaSeparateTtsPlan = {
  strategy: "separate_tts_voiceover" | "dialogue_tts";
  provider?: string;
  items: VerticalDramaSeparateTtsPlanItem[];
  injectsIntoVideoPrompts: false;
  blockedLineIds: string[];
};

/** Native-audio prompt snippet — only produced when native audio is allowed. */
export type VerticalDramaNativeAudioSnippet = {
  shotNumber: number;
  speakerName?: string;
  text: string;
};

/* -------------------------------------------------------------------------- */
/* Timing summary & repair                                                    */
/* -------------------------------------------------------------------------- */

export type VerticalDramaAudioTimingShot = {
  shotNumber: number;
  shotDurationSeconds: number;
  totalLineSeconds: number;
  overflow: boolean;
};

export type VerticalDramaAudioTimingSummary = {
  episodeTargetSeconds: number;
  totalDialogueSeconds: number;
  perShot: VerticalDramaAudioTimingShot[];
  overlongLineIds: string[];
  /** True when a per-shot line total exceeds the shot duration or the episode
   * duration drifts from `episodeTargetSeconds`. */
  timingMismatch: boolean;
};

export type VerticalDramaAudioRepairKind =
  | "shorten_overlong_line"
  | "assign_missing_voice_id"
  | "disable_native_audio"
  | "fix_timing_mismatch"
  | "fix_safe_area";

export type VerticalDramaAudioRepairAction = {
  repairId: string;
  kind: VerticalDramaAudioRepairKind;
  targetLineId?: string;
  targetSubtitleCueId?: string;
  targetSpeakerName?: string;
  targetShotNumber?: number;
  /** Localizable instruction reason code + human text. */
  reasonCode: string;
  instruction: string;
  autoRunnable: boolean;
  state: "open" | "in_progress" | "resolved" | "dismissed";
};

/* -------------------------------------------------------------------------- */
/* The plan (spec §14 field pins)                                             */
/* -------------------------------------------------------------------------- */

export type VerticalDramaDialogueAudioPlan = {
  planId: string;
  seriesId: string;
  episodeId: string;
  runId?: string;
  /** Narration-vs-dialogue intent (independent of `audioStrategy`). */
  mode: VerticalDramaDialogueMode;
  /** How audio is produced. Exactly one pinned enum value. */
  audioStrategy: VerticalDramaAudioStrategy;
  language: string;
  dialogueLines: VerticalDramaDialogueLine[];
  speakerVoiceMap: VerticalDramaSpeakerVoiceMap;
  nativeAudioPolicy: VerticalDramaNativeAudioPolicy;
  /** Only present for `separate_tts_voiceover` / `dialogue_tts`. */
  separateTtsPlan?: VerticalDramaSeparateTtsPlan;
  /** Empty unless native audio is allowed by policy. */
  nativeAudioSnippets: VerticalDramaNativeAudioSnippet[];
  subtitleCues: VerticalDramaSubtitleCue[];
  subtitleSafeArea: VerticalDramaSubtitleSafeArea;
  timing: VerticalDramaAudioTimingSummary;
  repairQueue: VerticalDramaAudioRepairAction[];
  warnings: VerticalDramaWarning[];
  /** True when `verticalDramaSeriesSubShots` was enabled for this plan. */
  subShotsEnabled: boolean;
  createdAt: string;
  updatedAt: string;
};

/* -------------------------------------------------------------------------- */
/* Regeneration-impact copy (spec §14 rules 6-7)                              */
/* -------------------------------------------------------------------------- */

export type VerticalDramaRegenerationImpact = {
  audioStrategy: VerticalDramaAudioStrategy;
  /** True when a script/dialogue change forces VIDEO regeneration. */
  requiresVideoRegeneration: boolean;
  /** Localizable reason code. */
  reasonCode: string;
  /** Default English message; UI should localize by `reasonCode`. */
  message: string;
};

/**
 * Regeneration impact of a script/dialogue change, keyed strictly by
 * `audioStrategy` (spec §14 rules 6-7). Evaluated per MAIN shot — decomposing a
 * shot into sub-shots (§7.4) does NOT change which message applies.
 *
 * - `native_video_audio`: audio is baked into the generated video → the change
 *   requires VIDEO regeneration.
 * - `separate_tts_voiceover` / `dialogue_tts`: audio is an independent track →
 *   it can be regenerated WITHOUT changing video prompts or frame references.
 * - `silent`: no audio to regenerate.
 */
export function computeRegenerationImpact(
  audioStrategy: VerticalDramaAudioStrategy,
): VerticalDramaRegenerationImpact {
  switch (audioStrategy) {
    case "native_video_audio":
      return {
        audioStrategy,
        requiresVideoRegeneration: true,
        reasonCode: "native_audio_requires_video_regeneration",
        message:
          "Audio is baked into the generated video. Changing the script or dialogue requires regenerating the VIDEO for the affected shots.",
      };
    case "separate_tts_voiceover":
    case "dialogue_tts":
      return {
        audioStrategy,
        requiresVideoRegeneration: false,
        reasonCode: "separate_tts_audio_regenerated_independently",
        message:
          "Audio is a separate track. Changing the script or dialogue can regenerate the audio WITHOUT changing video prompts or frame references.",
      };
    case "silent":
    default:
      return {
        audioStrategy,
        requiresVideoRegeneration: false,
        reasonCode: "silent_no_audio_regeneration",
        message: "This plan is silent; there is no audio to regenerate.",
      };
  }
}

/* -------------------------------------------------------------------------- */
/* Native-audio policy resolution                                            */
/* -------------------------------------------------------------------------- */

export type NativeAudioPolicyInput = {
  requested: boolean;
  videoModelId?: string;
  language: string;
  capabilities?: VerticalDramaProviderCapabilities;
  userAcceptedRegenerationCost?: boolean;
};

/** Returns true when the requested language is a Thai locale. */
function isThaiLanguage(language: string): boolean {
  return /^th(-|$)/i.test(language) || language.toLowerCase() === "thai";
}

/**
 * Resolve the native-audio policy. Native video audio is allowed ONLY when the
 * model supports native audio, supports the requested language, and the user
 * accepted regeneration cost (spec §14). Otherwise it is blocked with reason
 * codes and the caller falls back to separate TTS (the safe default).
 */
export function computeNativeAudioPolicy(
  input: NativeAudioPolicyInput,
): VerticalDramaNativeAudioPolicy {
  const caps = input.capabilities;
  const modelSupportsNativeAudio = Boolean(caps?.supportsNativeAudio);
  const modelSupportsRequestedLanguage = !caps
    ? false
    : isThaiLanguage(input.language)
      ? Boolean(caps.supportsThaiNativeAudio)
      : Boolean(caps.supportsNativeAudio);
  const userAcceptedRegenerationCost = Boolean(input.userAcceptedRegenerationCost);

  const blockingReasons: string[] = [];
  if (!input.requested) blockingReasons.push("native_audio_not_requested");
  if (!modelSupportsNativeAudio) blockingReasons.push("model_lacks_native_audio");
  if (!modelSupportsRequestedLanguage) blockingReasons.push("model_lacks_language_native_audio");
  if (!userAcceptedRegenerationCost) blockingReasons.push("regeneration_cost_not_accepted");

  return {
    requested: input.requested,
    videoModelId: input.videoModelId,
    modelSupportsNativeAudio,
    modelSupportsRequestedLanguage,
    userAcceptedRegenerationCost,
    allowed: blockingReasons.length === 0,
    blockingReasons,
  };
}

/**
 * Choose the final audio strategy. Native video audio requires the policy to be
 * `allowed`; otherwise the safe default is separate TTS. An explicit
 * `requestedStrategy` of `dialogue_tts` is honored for multi-speaker exchanges.
 * With no dialogue lines the plan is `silent`.
 */
export function resolveAudioStrategy(args: {
  hasDialogue: boolean;
  requestedStrategy?: VerticalDramaAudioStrategy;
  nativeAudioAllowed: boolean;
}): VerticalDramaAudioStrategy {
  if (!args.hasDialogue) return "silent";
  if (args.requestedStrategy === "native_video_audio") {
    return args.nativeAudioAllowed ? "native_video_audio" : "separate_tts_voiceover";
  }
  if (args.requestedStrategy === "dialogue_tts") return "dialogue_tts";
  if (args.requestedStrategy === "silent") return "silent";
  // Default / `separate_tts_voiceover` request → separate TTS is the safe default.
  return "separate_tts_voiceover";
}
