/**
 * Vertical Drama Series — Dialogue / Audio / Subtitle planner service (spec §14,
 * §6.8, §7.4 / section-07).
 *
 * Turns an episode's normalized script beats into a durable, inspectable
 * dialogue+audio+subtitle plan BEFORE Storyboard Review handoff. It plans:
 *
 *  - dialogue/narration lines by shot (with continuous timing across sub-shot cuts),
 *  - the narration-vs-dialogue `mode` axis and the produced-audio `audioStrategy` axis,
 *  - a series-scoped speaker→character→voice continuity map,
 *  - a native-audio capability policy (native video audio only when the model supports it),
 *  - a separate-TTS render plan that NEVER injects speech into visual video prompts,
 *  - a 9:16 subtitle cue plan with per-sub-shot safe-area validation,
 *  - an audio timing summary and a repair queue (overlong lines, missing voice IDs,
 *    unsupported native audio, timing / safe-area mismatch).
 *
 * NO paid TTS or video is produced here — this is planning metadata only. The plan
 * is persisted into the episode run artifact ledger (`vertical_drama_run_artifacts`)
 * and mirrored onto `vertical_drama_episodes.dialogueAudioPlan`, always scoped to the
 * caller's tenant + user.
 *
 * The pure planning functions (`buildDialogueAudioPlan`, `applyAudioRepair`,
 * `buildStoryboardReviewAudioMetadata`) are DB-free and unit-testable in isolation.
 */

import fs from "fs";
import path from "path";
import { z } from "zod";
import { and, desc, eq } from "drizzle-orm";
import { parseSkillFile } from "@smartspec/skills";
import { db } from "../db";
import {
  verticalDramaEpisodes,
  verticalDramaEpisodeRuns,
  verticalDramaRunArtifacts,
  type VerticalDramaEpisodeRunRow,
} from "../../drizzle/schema";
import type { VerticalDramaWarning, VerticalDramaSeriesLocale } from "@shared/verticalDramaSeries";
import { artifactChecksumSha256, verticalDramaLocaleEnglishName } from "@shared/verticalDramaSeries";
import {
  buildVerticalDramaDialogueLanguageProfilePrompt,
  type VerticalDramaDialogueLanguageProfile,
} from "@shared/verticalDramaSeries/dialogueLanguageProfile";
import {
  resolveSkillDirCandidates,
  resolveSkillManifestPath,
} from "./skillFiles";
import {
  hasEnoughCredits,
  deductCredits,
  calculateCreditsForLLM,
} from "./creditService";
import { mediaGenerationLimiter } from "./rateLimiter";
import {
  executeJsonPlanningCallWithRetry,
  InsufficientCreditsError,
  VdSchemaValidationError,
  VD_COMPACT_JSON_INSTRUCTION,
} from "./verticalDramaStoryBible";
import { resolveQualityLargeContextModelId } from "./verticalDramaImproveScript";
import { resolveVerticalDramaSeriesModel } from "./verticalDramaLlmModelPolicy";
// Section 05 (spec §7.1/§7.3 dialogue rules v2 + speech profiles, F132D/
// F132F, added 2026-07-09) — the ONE canonical quality-criteria bundle and
// the speech-profile schema. Never re-declared here.
import { getVerticalDramaQualityCriteriaBundle } from "./verticalDramaQualityCriteria";
import type { VerticalDramaSpeechProfile } from "@shared/verticalDramaSeries/speechProfile";

// Re-exported so `verticalDramaEpisodePipeline.ts` only needs to import from
// this one module for its `dialogue_audio_plan` real-repair wiring — mirrors
// `verticalDramaScriptGeneration.ts`/`verticalDramaStoryboardGeneration.ts`'s
// identical re-export convention exactly.
export { InsufficientCreditsError, VdSchemaValidationError };
import type { VerticalDramaProviderCapabilities } from "@shared/verticalDramaSeries/providerRouting";
import {
  VERTICAL_DRAMA_AUDIO_STRATEGIES,
  VERTICAL_DRAMA_DIALOGUE_MODES,
  computeNativeAudioPolicy,
  computeRegenerationImpact,
  resolveAudioStrategy,
  type VerticalDramaAudioRepairAction,
  type VerticalDramaAudioStrategy,
  type VerticalDramaAudioTimingShot,
  type VerticalDramaAudioTimingSummary,
  type VerticalDramaDialogueAudioPlan,
  type VerticalDramaDialogueLine,
  type VerticalDramaDialogueMode,
  type VerticalDramaNativeAudioSnippet,
  type VerticalDramaSeparateTtsPlan,
  type VerticalDramaSeparateTtsPlanItem,
  type VerticalDramaSpeakerVoiceMap,
  type VerticalDramaSpeakerVoiceMapEntry,
} from "@shared/verticalDramaSeries/audio";
import {
  analyzeVerticalDramaEpisodeDialogueQuality,
  sanitizeSpeakableLineForDelivery,
  type VerticalDramaEpisodeDialogueQuality,
} from "@shared/verticalDramaSeries/dialogueQuality";
import {
  VERTICAL_DRAMA_DEFAULT_SUBTITLE_SAFE_AREA,
  computeSubShotSpans,
  validateCueSafeAreaPerSubShot,
  type SubtitleSubShotSlice,
  type VerticalDramaSubtitleCue,
  type VerticalDramaSubtitleSafeArea,
} from "@shared/verticalDramaSeries/subtitles";
import {
  buildCharacterVoiceConfigMap,
  verticalDramaCharacterVoiceConfigMapEntrySchema,
  type VerticalDramaCharacterVoiceConfig,
} from "@shared/verticalDramaSeries/voiceCasting";

/** Run/artifact stage key used for the dialogue-audio plan (spec §7.3). */
export const VERTICAL_DRAMA_DIALOGUE_AUDIO_STAGE = "dialogue_audio_plan" as const;

/** Episode target the pipeline pins for a Vertical Drama episode (spec §6). */
export const VERTICAL_DRAMA_EPISODE_TARGET_SECONDS = 60;

/** Default tolerance (seconds) before a per-shot / episode drift is a mismatch. */
export const VERTICAL_DRAMA_TIMING_TOLERANCE_SECONDS = 0.5;

const EPS = 1e-6;

/* -------------------------------------------------------------------------- */
/* Input contracts (normalized script beats + series voice bindings)          */
/* -------------------------------------------------------------------------- */

const providerCapabilitiesSchema: z.ZodType<VerticalDramaProviderCapabilities> = z
  .object({
    supportsImageGeneration: z.boolean(),
    supportsImageReferences: z.boolean(),
    supportsVideoGeneration: z.boolean(),
    supportsVideoInputReference: z.boolean(),
    supportsFirstLastFrameVideo: z.boolean(),
    supportsHumanFaceInputReference: z.boolean(),
    supportsHumanLikenessCharacterAsset: z.boolean(),
    supportsNativeAudio: z.boolean(),
    supportsThaiNativeAudio: z.boolean(),
    supportsSeparateTts: z.boolean(),
    supportsDialogueTts: z.boolean(),
    supportsSubtitleBurnIn: z.boolean(),
    allowedVideoSeconds: z.array(z.number()),
    allowedVideoSizes: z.array(z.string()),
    allowedAspectRatios: z.array(z.enum(["9:16", "16:9", "1:1"])),
  })
  .passthrough() as unknown as z.ZodType<VerticalDramaProviderCapabilities>;

const subShotSliceSchema = z.object({
  subShotNumber: z.number().int().positive(),
  durationSeconds: z.number().positive(),
});

/** One normalized script beat produced by the dialogue-audio planner skill. */
export const dialogueBeatInputSchema = z.object({
  shotNumber: z.number().int().positive(),
  clipNumber: z.number().int().positive().optional(),
  speakerName: z.string().trim().min(1).max(120),
  speakerCharacterId: z.string().trim().max(120).optional(),
  isNarration: z.boolean().default(false),
  text: z.string().max(2000),
  estimatedSeconds: z.number().nonnegative().max(600),
});

/** Per-shot timing envelope (and optional sub-shot slices when decomposed). */
export const shotTimingInputSchema = z.object({
  shotNumber: z.number().int().positive(),
  shotDurationSeconds: z.number().positive().max(600),
  subShots: z.array(subShotSliceSchema).optional(),
});

/** Series-scoped voice continuity binding (from series memory / character state). */
export const seriesVoiceBindingSchema = z.object({
  speakerName: z.string().trim().min(1).max(120),
  characterId: z.string().trim().max(120).optional(),
  voiceProvider: z.string().trim().max(80).optional(),
  voiceModelId: z.string().trim().max(120).optional(),
  voiceId: z.string().trim().max(120).optional(),
  fallbackVoiceId: z.string().trim().max(120).optional(),
  locked: z.boolean().optional(),
});

export const planDialogueAudioInputSchema = z.object({
  seriesId: z.string().min(1),
  episodeId: z.string().min(1),
  runId: z.string().min(1).optional(),
  language: z.string().trim().min(1).max(35).default("th"),
  mode: z.enum(VERTICAL_DRAMA_DIALOGUE_MODES),
  requestedStrategy: z.enum(VERTICAL_DRAMA_AUDIO_STRATEGIES).optional(),
  episodeTargetSeconds: z.number().positive().max(3600).optional(),
  beats: z.array(dialogueBeatInputSchema),
  shots: z.array(shotTimingInputSchema),
  voiceBindings: z.array(seriesVoiceBindingSchema).optional(),
  /**
   * Authoritative per-character voice casting (W12-A voice chain wave) — when
   * a beat's `speakerCharacterId` has an entry here, it OVERRIDES whatever
   * `voiceBindings` resolves for that speaker; `voiceBindings` remains the
   * fallback source for uncast characters (unchanged codepath, including the
   * `missing_voice_id` warning when neither source resolves a voice — see
   * `buildSpeakerVoiceMap`). Threaded in by
   * `server/routers/verticalDramaDialogueAudio.ts` from the series'
   * `vertical_drama_characters.voiceConfig` column, flag-gated on
   * `verticalDramaSeriesVoiceChain`. Absent/empty is fully
   * backward-compatible — identical to pre-W12-A behavior.
   */
  characterVoiceConfigs: z.array(verticalDramaCharacterVoiceConfigMapEntrySchema).optional(),
  nativeAudio: z
    .object({
      requested: z.boolean().default(false),
      videoModelId: z.string().trim().max(120).optional(),
      capabilities: providerCapabilitiesSchema.optional(),
      userAcceptedRegenerationCost: z.boolean().optional(),
    })
    .optional(),
  subShotsEnabled: z.boolean().optional(),
  subtitleSafeArea: z
    .object({
      position: z.enum(["bottom_safe", "middle_safe", "top_safe"]),
      maxLines: z.number().int().positive(),
      avoidFaceArea: z.boolean(),
      marginTopPct: z.number().min(0).max(1),
      marginBottomPct: z.number().min(0).max(1),
      marginSidePct: z.number().min(0).max(1),
    })
    .optional(),
  /** Optional per-shot → per-sub-shot face-occlusion map for safe-area checks. */
  faceRegionByShotSubShot: z.record(z.string(), z.record(z.string(), z.boolean())).optional(),
  overlongToleranceSeconds: z.number().nonnegative().max(60).optional(),
  /** Deterministic clock override (tests). */
  now: z.string().optional(),
});

export type PlanDialogueAudioInput = z.infer<typeof planDialogueAudioInputSchema>;
export type DialogueBeatInput = z.infer<typeof dialogueBeatInputSchema>;
export type ShotTimingInput = z.infer<typeof shotTimingInputSchema>;
export type SeriesVoiceBinding = z.infer<typeof seriesVoiceBindingSchema>;

/* -------------------------------------------------------------------------- */
/* Pure planner                                                               */
/* -------------------------------------------------------------------------- */

/** Deterministic speaker key so map lookups are stable regardless of casing. */
function speakerKey(speakerName: string, characterId?: string): string {
  return characterId ? `char:${characterId}` : `name:${speakerName.trim().toLowerCase()}`;
}

/** Resolve the effective voice id for a binding (primary, else fallback). */
function resolveVoiceId(binding?: SeriesVoiceBinding): string | undefined {
  return binding?.voiceId || binding?.fallbackVoiceId || undefined;
}

/**
 * Build the series-scoped speaker→voice continuity map from the beats and the
 * series voice bindings. Voice continuity is SERIES-scoped (not episode-only):
 * a binding marked `locked` is carried verbatim. A speaker with no resolvable
 * voice id gets `missingVoiceId: true` — this warns and blocks separate TTS but
 * never blocks script planning (spec §14 Audio Strategy Rules).
 *
 * `characterVoiceConfigs` (W12-A, optional) — a `characterId -> casting`
 * lookup that is AUTHORITATIVE when present for a beat's
 * `speakerCharacterId`: it overrides whatever `voiceBindings` would have
 * resolved for that speaker. `voiceBindings` remains the fallback source when
 * a speaker has no casting entry, so a speaking character with neither a
 * casting NOR a resolvable binding still gets `missingVoiceId: true` — the
 * EXACT same warning path as before this parameter existed (unchanged codes).
 */
export function buildSpeakerVoiceMap(
  beats: DialogueBeatInput[],
  voiceBindings: SeriesVoiceBinding[],
  characterVoiceConfigs?: Map<string, VerticalDramaCharacterVoiceConfig>,
): VerticalDramaSpeakerVoiceMap {
  const bindingByKey = new Map<string, SeriesVoiceBinding>();
  for (const b of voiceBindings) {
    bindingByKey.set(speakerKey(b.speakerName, b.characterId), b);
    if (b.characterId) bindingByKey.set(`char:${b.characterId}`, b);
  }

  const seen = new Map<string, VerticalDramaSpeakerVoiceMapEntry>();
  for (const beat of beats) {
    const key = speakerKey(beat.speakerName, beat.speakerCharacterId);
    if (seen.has(key)) continue;

    const casting = beat.speakerCharacterId
      ? characterVoiceConfigs?.get(beat.speakerCharacterId)
      : undefined;
    if (casting) {
      // Casting is a deliberate, explicit per-character lock — always
      // `locked: true` and never `missingVoiceId` (the schema guarantees
      // `voiceModelId`/`voiceId` are present whenever a casting exists).
      seen.set(key, {
        speakerName: beat.speakerName,
        characterId: beat.speakerCharacterId,
        voiceProvider: casting.voiceProvider,
        voiceModelId: casting.voiceModelId,
        voiceId: casting.voiceId,
        fallbackVoiceId: undefined,
        locked: true,
        missingVoiceId: false,
      });
      continue;
    }

    const binding =
      bindingByKey.get(key) ??
      (beat.speakerCharacterId ? bindingByKey.get(`char:${beat.speakerCharacterId}`) : undefined) ??
      bindingByKey.get(speakerKey(beat.speakerName));
    const voiceId = resolveVoiceId(binding);
    seen.set(key, {
      speakerName: beat.speakerName,
      characterId: beat.speakerCharacterId ?? binding?.characterId,
      voiceProvider: binding?.voiceProvider,
      voiceModelId: binding?.voiceModelId,
      voiceId,
      fallbackVoiceId: binding?.fallbackVoiceId,
      locked: Boolean(binding?.locked),
      missingVoiceId: !voiceId,
    });
  }
  return { entries: [...seen.values()] };
}

/**
 * Lay dialogue lines end-to-end on each shot's LOCAL timeline (0..shotDuration).
 * A line MAY span sub-shot cuts within one main shot and keeps a single
 * continuous `start`/`end` across the cuts — a cut never forces an audio break
 * (spec §7.4). `spansSubShotNumbers` is only populated when sub-shots are enabled.
 */
export function buildDialogueLines(
  beats: DialogueBeatInput[],
  shots: ShotTimingInput[],
  subShotsEnabled: boolean,
): VerticalDramaDialogueLine[] {
  const shotByNumber = new Map(shots.map((s) => [s.shotNumber, s]));
  const cursorByShot = new Map<number, number>();
  const indexByShot = new Map<number, number>();
  const lines: VerticalDramaDialogueLine[] = [];

  for (const beat of beats) {
    const start = cursorByShot.get(beat.shotNumber) ?? 0;
    const end = start + beat.estimatedSeconds;
    const idx = (indexByShot.get(beat.shotNumber) ?? 0) + 1;
    indexByShot.set(beat.shotNumber, idx);
    cursorByShot.set(beat.shotNumber, end);

    const shot = shotByNumber.get(beat.shotNumber);
    let spans: number[] | undefined;
    if (subShotsEnabled && shot?.subShots && shot.subShots.length > 1) {
      const computed = computeSubShotSpans(start, end, shot.subShots as SubtitleSubShotSlice[]);
      if (computed.length > 0) spans = computed;
    }

    lines.push({
      lineId: `line-s${beat.shotNumber}-c${beat.clipNumber ?? 0}-${idx}`,
      shotNumber: beat.shotNumber,
      clipNumber: beat.clipNumber,
      speakerName: beat.speakerName,
      speakerCharacterId: beat.speakerCharacterId,
      isNarration: beat.isNarration,
      text: beat.text,
      start,
      end,
      targetDurationSeconds: beat.estimatedSeconds,
      subtitleCueId: `cue-s${beat.shotNumber}-c${beat.clipNumber ?? 0}-${idx}`,
      spansSubShotNumbers: spans,
    });
  }
  return lines;
}

/**
 * Derive one 9:16 subtitle cue per dialogue line. Timing mirrors the line's
 * shot-local `start`/`end`; a cue that spans multiple sub-shots keeps a single
 * continuous window and is validated against EACH overlapped sub-shot's safe
 * area (spec §7.4).
 */
export function buildSubtitleCues(
  lines: VerticalDramaDialogueLine[],
  shots: ShotTimingInput[],
  safeArea: VerticalDramaSubtitleSafeArea,
  subShotsEnabled: boolean,
  faceRegionByShotSubShot?: Record<string, Record<string, boolean>>,
): VerticalDramaSubtitleCue[] {
  const shotByNumber = new Map(shots.map((s) => [s.shotNumber, s]));
  return lines.map((line) => {
    const shot = shotByNumber.get(line.shotNumber);
    const cue: VerticalDramaSubtitleCue = {
      cueId: line.subtitleCueId ?? `cue-${line.lineId}`,
      shotNumber: line.shotNumber,
      speakerName: line.isNarration ? undefined : line.speakerName,
      speakerCharacterId: line.speakerCharacterId,
      text: line.text,
      start: line.start,
      end: line.end,
      lineId: line.lineId,
      safeArea,
    };
    if (subShotsEnabled && shot?.subShots && shot.subShots.length > 1) {
      const slices = shot.subShots as SubtitleSubShotSlice[];
      const spans = computeSubShotSpans(line.start, line.end, slices);
      if (spans.length > 0) {
        cue.spansSubShotNumbers = spans;
        const faceMapRaw = faceRegionByShotSubShot?.[String(line.shotNumber)];
        const faceMap = faceMapRaw
          ? Object.fromEntries(Object.entries(faceMapRaw).map(([k, v]) => [Number(k), v]))
          : undefined;
        cue.safeAreaPerSubShot = validateCueSafeAreaPerSubShot(
          { start: line.start, end: line.end, safeArea },
          slices,
          faceMap,
        );
      }
    }
    return cue;
  });
}

/** Build the audio timing summary (per-shot overflow + episode drift). */
export function buildTimingSummary(
  lines: VerticalDramaDialogueLine[],
  shots: ShotTimingInput[],
  episodeTargetSeconds: number,
  toleranceSeconds: number,
): VerticalDramaAudioTimingSummary {
  const perShot: VerticalDramaAudioTimingShot[] = [];
  const overlongLineIds: string[] = [];
  let totalDialogueSeconds = 0;
  let anyOverflow = false;

  for (const shot of shots) {
    const shotLines = lines.filter((l) => l.shotNumber === shot.shotNumber);
    const totalLineSeconds = shotLines.reduce((acc, l) => acc + l.targetDurationSeconds, 0);
    totalDialogueSeconds += totalLineSeconds;
    const overflow = totalLineSeconds > shot.shotDurationSeconds + EPS;
    if (overflow) anyOverflow = true;
    // A line is overlong when it (or the running total) pushes past the shot end.
    for (const l of shotLines) {
      if (l.end > shot.shotDurationSeconds + EPS) overlongLineIds.push(l.lineId);
    }
    perShot.push({
      shotNumber: shot.shotNumber,
      shotDurationSeconds: shot.shotDurationSeconds,
      totalLineSeconds,
      overflow,
    });
  }

  const shotDurationTotal = shots.reduce((acc, s) => acc + s.shotDurationSeconds, 0);
  const episodeDrift = Math.abs(shotDurationTotal - episodeTargetSeconds) > toleranceSeconds + EPS;
  return {
    episodeTargetSeconds,
    totalDialogueSeconds,
    perShot,
    overlongLineIds,
    timingMismatch: anyOverflow || episodeDrift,
  };
}

/**
 * Build the separate-TTS render plan. Applies only to `separate_tts_voiceover`
 * and `dialogue_tts`. `injectsIntoVideoPrompts` is pinned `false`: separate TTS
 * NEVER writes speech/lip-sync into the visual video prompts (spec §14 rule 7).
 * A line whose speaker has no resolvable voice id is `blocked`.
 *
 * Speakability sanitize (2026-07-08/W9-A, spec §14.1 rule 6b) — each item's
 * `text` (the literal string that will be sent to the TTS provider) is run
 * through `sanitizeSpeakableLineForDelivery` here, at the point dialogue
 * text enters the TTS payload. `plan.dialogueLines[].text` (the original
 * artifact this function reads FROM) is never mutated — only the OUTBOUND
 * `items[].text` copy is sanitized. A clean line is byte-identical.
 *
 * `characterVoiceConfigs` (W12-A, optional) — same authoritative-casting
 * override `buildSpeakerVoiceMap` applies, repeated here directly against
 * `voiceMap`'s resolved `entry` as the fallback. When this function is
 * called via `buildDialogueAudioPlan` below, `voiceMap` has ALREADY been
 * built with casting merged in, so passing the map again here is a no-op
 * (idempotent); it exists so a call site with a raw, unmerged `voiceMap`
 * (e.g. a future caller, or a direct unit test) still resolves casting
 * correctly without going through `buildSpeakerVoiceMap` first.
 */
export function buildSeparateTtsPlan(
  strategy: "separate_tts_voiceover" | "dialogue_tts",
  lines: VerticalDramaDialogueLine[],
  voiceMap: VerticalDramaSpeakerVoiceMap,
  characterVoiceConfigs?: Map<string, VerticalDramaCharacterVoiceConfig>,
): VerticalDramaSeparateTtsPlan {
  const entryByKey = new Map(
    voiceMap.entries.map((e) => [speakerKey(e.speakerName, e.characterId), e]),
  );
  const items: VerticalDramaSeparateTtsPlanItem[] = [];
  const blockedLineIds: string[] = [];
  let provider: string | undefined;

  for (const line of lines) {
    const entry =
      entryByKey.get(speakerKey(line.speakerName, line.speakerCharacterId)) ??
      entryByKey.get(speakerKey(line.speakerName));
    const casting = line.speakerCharacterId
      ? characterVoiceConfigs?.get(line.speakerCharacterId)
      : undefined;
    const voiceProvider = casting?.voiceProvider ?? entry?.voiceProvider;
    const voiceModelId = casting?.voiceModelId ?? entry?.voiceModelId;
    const voiceId = casting?.voiceId ?? entry?.voiceId;
    provider = provider ?? voiceProvider;
    const blocked = !voiceId;
    if (blocked) blockedLineIds.push(line.lineId);
    items.push({
      lineId: line.lineId,
      speakerName: line.speakerName,
      characterId: line.speakerCharacterId,
      voiceProvider,
      voiceModelId,
      voiceId,
      text: sanitizeSpeakableLineForDelivery(line.text),
      targetDurationSeconds: line.targetDurationSeconds,
      blocked,
      blockReason: blocked ? "missing_voice_id" : undefined,
    });
  }

  return { strategy, provider, items, injectsIntoVideoPrompts: false, blockedLineIds };
}

/**
 * Native-audio prompt snippets — ONLY when native audio is policy-allowed.
 * Speakability sanitize (2026-07-08/W9-A, spec §14.1 rule 6b) — same
 * treatment as `buildSeparateTtsPlan` above: `text` is the outbound native-
 * audio consumption copy, sanitized here; `plan.dialogueLines[].text`
 * (the artifact) is untouched.
 */
function buildNativeAudioSnippets(
  lines: VerticalDramaDialogueLine[],
  allowed: boolean,
): VerticalDramaNativeAudioSnippet[] {
  if (!allowed) return [];
  return lines.map((line) => ({
    shotNumber: line.shotNumber,
    speakerName: line.isNarration ? undefined : line.speakerName,
    text: sanitizeSpeakableLineForDelivery(line.text),
  }));
}

/**
 * Assemble the repair queue + warnings for the plan. Covers overlong dialogue,
 * missing voice ids, unsupported-but-requested native audio, timing mismatch and
 * invalid per-sub-shot subtitle safe areas (spec §14 rule set + §7.4).
 */
export function buildRepairQueue(args: {
  lines: VerticalDramaDialogueLine[];
  voiceMap: VerticalDramaSpeakerVoiceMap;
  timing: VerticalDramaAudioTimingSummary;
  dialogueQuality?: VerticalDramaEpisodeDialogueQuality;
  cues: VerticalDramaSubtitleCue[];
  nativeAudioRequested: boolean;
  nativeAudioAllowed: boolean;
  audioStrategy: VerticalDramaAudioStrategy;
}): { repairQueue: VerticalDramaAudioRepairAction[]; warnings: VerticalDramaWarning[] } {
  const repairQueue: VerticalDramaAudioRepairAction[] = [];
  const warnings: VerticalDramaWarning[] = [];
  const lineById = new Map(args.lines.map((l) => [l.lineId, l]));

  // Overlong dialogue lines.
  for (const lineId of args.timing.overlongLineIds) {
    const line = lineById.get(lineId);
    repairQueue.push({
      repairId: `repair-overlong-${lineId}`,
      kind: "shorten_overlong_line",
      targetLineId: lineId,
      targetShotNumber: line?.shotNumber,
      reasonCode: "overlong_dialogue_line",
      instruction: "Shorten or split this dialogue line so it fits within the shot duration.",
      autoRunnable: false,
      state: "open",
    });
    warnings.push({
      code: "overlong_dialogue_line",
      severity: "warning",
      message: `Dialogue line ${lineId} exceeds its shot duration.`,
      targetStage: "dialogue_audio_plan",
      targetShotNumber: line?.shotNumber,
      repairable: true,
    });
  }

  // Missing voice ids (only matters for separate TTS strategies).
  const ttsStrategy =
    args.audioStrategy === "separate_tts_voiceover" || args.audioStrategy === "dialogue_tts";
  for (const entry of args.voiceMap.entries) {
    if (!entry.missingVoiceId) continue;
    repairQueue.push({
      repairId: `repair-voice-${speakerKey(entry.speakerName, entry.characterId)}`,
      kind: "assign_missing_voice_id",
      targetSpeakerName: entry.speakerName,
      reasonCode: "missing_voice_id",
      instruction: `Assign a series-scoped voice id for "${entry.speakerName}" before separate TTS can run.`,
      autoRunnable: false,
      state: "open",
    });
    warnings.push({
      code: "missing_voice_id",
      severity: ttsStrategy ? "warning" : "info",
      message: `Speaker "${entry.speakerName}" has no resolved voice id; separate TTS is blocked for this speaker.`,
      targetStage: "dialogue_audio_plan",
      repairable: true,
    });
  }

  // Native audio requested but not supported by the model/language.
  if (args.nativeAudioRequested && !args.nativeAudioAllowed) {
    repairQueue.push({
      repairId: "repair-native-audio",
      kind: "disable_native_audio",
      reasonCode: "native_audio_unsupported",
      instruction:
        "The selected video model cannot produce the requested native audio. Keep separate TTS or switch to a capable model.",
      autoRunnable: true,
      state: "open",
    });
    warnings.push({
      code: "native_audio_unsupported",
      severity: "warning",
      message: "Requested native video audio is not supported; falling back to separate TTS.",
      targetStage: "dialogue_audio_plan",
      repairable: true,
    });
  }

  // Timing mismatch.
  if (args.timing.timingMismatch) {
    repairQueue.push({
      repairId: "repair-timing",
      kind: "fix_timing_mismatch",
      reasonCode: "audio_timing_mismatch",
      instruction:
        "Dialogue timing overflows a shot or the episode duration drifts from target. Rebalance line durations.",
      autoRunnable: false,
      state: "open",
    });
    warnings.push({
      code: "audio_timing_mismatch",
      severity: "warning",
      message: "Audio/subtitle timing does not fit the shot or episode duration.",
      targetStage: "dialogue_audio_plan",
      repairable: true,
    });
  }

  const underfilledIssues = (args.dialogueQuality?.issues ?? []).filter(
    (issue) =>
      issue.code === "VD_DIALOGUE_UNDERFILLED" ||
      issue.code === "VD_DIALOGUE_EPISODE_UNDERFILLED",
  );
  if (underfilledIssues.length > 0) {
    const episodeUnderfilled = underfilledIssues.find(
      (issue) => issue.code === "VD_DIALOGUE_EPISODE_UNDERFILLED",
    );
    repairQueue.push({
      repairId: "repair-underfilled-dialogue",
      kind: "expand_underfilled_dialogue",
      targetShotNumber: episodeUnderfilled ? undefined : underfilledIssues[0]?.shotNumber,
      reasonCode: episodeUnderfilled
        ? "episode_dialogue_underfilled"
        : "shot_dialogue_underfilled",
      instruction:
        "Regenerate the dialogue/audio plan for the whole episode so spoken content fits the 60-second pacing before rebuilding video prompts.",
      autoRunnable: false,
      state: "open",
    });
    warnings.push({
      code: episodeUnderfilled ? "episode_dialogue_underfilled" : "shot_dialogue_underfilled",
      severity: episodeUnderfilled?.severity === "error" ? "error" : "warning",
      message: episodeUnderfilled
        ? "The episode has too little spoken content for its target duration; regenerate the dialogue plan before video prompts."
        : "One or more shots have too little dialogue for their duration; regenerate the dialogue plan before video prompts.",
      targetStage: "dialogue_audio_plan",
      targetShotNumber: episodeUnderfilled ? undefined : underfilledIssues[0]?.shotNumber,
      repairable: true,
    });
  }

  // Invalid per-sub-shot safe areas.
  for (const cue of args.cues) {
    const invalid = (cue.safeAreaPerSubShot ?? []).filter((c) => !c.valid);
    if (invalid.length === 0) continue;
    repairQueue.push({
      repairId: `repair-safearea-${cue.cueId}`,
      kind: "fix_safe_area",
      targetSubtitleCueId: cue.cueId,
      targetShotNumber: cue.shotNumber,
      reasonCode: invalid[0].reason ?? "caption_outside_vertical_safe_area",
      instruction:
        "Adjust the caption placement so it stays inside the 9:16 safe area across every sub-shot it spans.",
      autoRunnable: false,
      state: "open",
    });
    warnings.push({
      code: invalid[0].reason ?? "caption_outside_vertical_safe_area",
      severity: "warning",
      message: `Subtitle cue ${cue.cueId} leaves the vertical safe area on a sub-shot cut.`,
      targetStage: "dialogue_audio_plan",
      targetShotNumber: cue.shotNumber,
      repairable: true,
    });
  }

  return { repairQueue, warnings };
}

/**
 * Build the full dialogue/audio/subtitle plan from normalized inputs (pure, no
 * DB). This is the deterministic core the service persists and the tests drive.
 */
export function buildDialogueAudioPlan(input: PlanDialogueAudioInput): VerticalDramaDialogueAudioPlan {
  const language = input.language || "th";
  const beats = [...input.beats].sort(
    (a, b) => a.shotNumber - b.shotNumber || (a.clipNumber ?? 0) - (b.clipNumber ?? 0),
  );
  const voiceBindings = input.voiceBindings ?? [];
  const characterVoiceConfigMap = buildCharacterVoiceConfigMap(input.characterVoiceConfigs);
  const subShotsEnabled = Boolean(input.subShotsEnabled);
  const safeArea = input.subtitleSafeArea ?? VERTICAL_DRAMA_DEFAULT_SUBTITLE_SAFE_AREA;
  const episodeTargetSeconds = input.episodeTargetSeconds ?? VERTICAL_DRAMA_EPISODE_TARGET_SECONDS;
  const tolerance = input.overlongToleranceSeconds ?? VERTICAL_DRAMA_TIMING_TOLERANCE_SECONDS;
  const now = input.now ?? new Date().toISOString();

  const dialogueLines = buildDialogueLines(beats, input.shots, subShotsEnabled);
  const speakerVoiceMap = buildSpeakerVoiceMap(beats, voiceBindings, characterVoiceConfigMap);

  // Native-audio policy (spec §14 rules 6-7) — revalidated whenever the model changes.
  const nativeAudioRequested = Boolean(input.nativeAudio?.requested);
  const nativeAudioPolicy = computeNativeAudioPolicy({
    requested: nativeAudioRequested,
    videoModelId: input.nativeAudio?.videoModelId,
    language,
    capabilities: input.nativeAudio?.capabilities,
    userAcceptedRegenerationCost: input.nativeAudio?.userAcceptedRegenerationCost,
  });

  const audioStrategy = resolveAudioStrategy({
    hasDialogue: dialogueLines.length > 0,
    requestedStrategy: input.requestedStrategy,
    nativeAudioAllowed: nativeAudioPolicy.allowed,
  });

  const cues = buildSubtitleCues(
    dialogueLines,
    input.shots,
    safeArea,
    subShotsEnabled,
    input.faceRegionByShotSubShot,
  );
  const timing = buildTimingSummary(dialogueLines, input.shots, episodeTargetSeconds, tolerance);
  const dialogueQuality = analyzeVerticalDramaEpisodeDialogueQuality(
    input.shots.map((shot) => ({
      shotNumber: shot.shotNumber,
      durationSeconds: shot.shotDurationSeconds,
      dialogue: dialogueLines
        .filter((line) => line.shotNumber === shot.shotNumber)
        .map((line) => ({ lineTh: line.text })),
    })),
  );

  const separateTtsPlan =
    audioStrategy === "separate_tts_voiceover" || audioStrategy === "dialogue_tts"
      ? buildSeparateTtsPlan(audioStrategy, dialogueLines, speakerVoiceMap, characterVoiceConfigMap)
      : undefined;

  const nativeAudioSnippets = buildNativeAudioSnippets(
    dialogueLines,
    audioStrategy === "native_video_audio" && nativeAudioPolicy.allowed,
  );

  const { repairQueue, warnings } = buildRepairQueue({
    lines: dialogueLines,
    voiceMap: speakerVoiceMap,
    timing,
    dialogueQuality,
    cues,
    nativeAudioRequested,
    nativeAudioAllowed: nativeAudioPolicy.allowed,
    audioStrategy,
  });

  return {
    planId: `dap-${input.seriesId}-${input.episodeId}${input.runId ? `-${input.runId}` : ""}`,
    seriesId: input.seriesId,
    episodeId: input.episodeId,
    runId: input.runId,
    mode: input.mode as VerticalDramaDialogueMode,
    audioStrategy,
    language,
    dialogueLines,
    speakerVoiceMap,
    nativeAudioPolicy,
    separateTtsPlan,
    nativeAudioSnippets,
    subtitleCues: cues,
    subtitleSafeArea: safeArea,
    timing,
    dialogueQuality,
    repairQueue,
    warnings,
    subShotsEnabled,
    createdAt: now,
    updatedAt: now,
  };
}

/* -------------------------------------------------------------------------- */
/* Repair application (pure)                                                  */
/* -------------------------------------------------------------------------- */

export const audioRepairInputSchema = z.object({
  seriesId: z.string().min(1),
  episodeId: z.string().min(1),
  runId: z.string().min(1).optional(),
  repairId: z.string().min(1),
  resolution: z.discriminatedUnion("kind", [
    z.object({
      kind: z.literal("assign_missing_voice_id"),
      speakerName: z.string().min(1),
      voiceId: z.string().min(1),
      voiceProvider: z.string().optional(),
      voiceModelId: z.string().optional(),
    }),
    z.object({
      kind: z.literal("shorten_overlong_line"),
      lineId: z.string().min(1),
      newTargetDurationSeconds: z.number().positive(),
      newText: z.string().optional(),
    }),
    z.object({ kind: z.literal("disable_native_audio") }),
    z.object({ kind: z.literal("fix_timing_mismatch") }),
    z.object({
      kind: z.literal("fix_safe_area"),
      cueId: z.string().min(1),
    }),
    z.object({ kind: z.literal("dismiss") }),
  ]),
  now: z.string().optional(),
});

export type AudioRepairInput = z.infer<typeof audioRepairInputSchema>;

/**
 * Recompute the timing summary from a plan's own dialogue lines + per-shot
 * durations (used after a repair mutates line durations). Pure and self-contained.
 */
function recomputeTimingFromPlan(
  plan: VerticalDramaDialogueAudioPlan,
  tolerance = VERTICAL_DRAMA_TIMING_TOLERANCE_SECONDS,
): VerticalDramaAudioTimingSummary {
  const shots: ShotTimingInput[] = plan.timing.perShot.map((s) => ({
    shotNumber: s.shotNumber,
    shotDurationSeconds: s.shotDurationSeconds,
  }));
  return buildTimingSummary(plan.dialogueLines, shots, plan.timing.episodeTargetSeconds, tolerance);
}

/**
 * Apply a repair action to a persisted plan and rebuild the affected derived
 * state. Never re-derives `audioStrategy` per sub-shot — strategy is a MAIN-shot
 * property (spec §7.4). Returns a new plan; the input plan is not mutated.
 */
export function applyAudioRepair(
  plan: VerticalDramaDialogueAudioPlan,
  input: AudioRepairInput,
): VerticalDramaDialogueAudioPlan {
  const now = input.now ?? new Date().toISOString();
  const next: VerticalDramaDialogueAudioPlan = {
    ...plan,
    dialogueLines: plan.dialogueLines.map((l) => ({ ...l })),
    speakerVoiceMap: { entries: plan.speakerVoiceMap.entries.map((e) => ({ ...e })) },
    separateTtsPlan: plan.separateTtsPlan
      ? { ...plan.separateTtsPlan, items: plan.separateTtsPlan.items.map((i) => ({ ...i })) }
      : undefined,
    subtitleCues: plan.subtitleCues.map((c) => ({ ...c })),
    repairQueue: plan.repairQueue.map((r) => ({ ...r })),
    warnings: [...plan.warnings],
    updatedAt: now,
  };

  const res = input.resolution;

  switch (res.kind) {
    case "assign_missing_voice_id": {
      for (const entry of next.speakerVoiceMap.entries) {
        if (entry.speakerName.trim().toLowerCase() === res.speakerName.trim().toLowerCase()) {
          entry.voiceId = res.voiceId;
          entry.missingVoiceId = false;
          if (res.voiceProvider) entry.voiceProvider = res.voiceProvider;
          if (res.voiceModelId) entry.voiceModelId = res.voiceModelId;
        }
      }
      break;
    }
    case "shorten_overlong_line": {
      let cursorShot: number | undefined;
      for (const line of next.dialogueLines) {
        if (line.lineId === res.lineId) {
          line.targetDurationSeconds = res.newTargetDurationSeconds;
          if (res.newText != null) line.text = res.newText;
          cursorShot = line.shotNumber;
        }
      }
      // Re-lay the affected shot's lines end-to-end so start/end stay contiguous.
      if (cursorShot != null) relayShotTimings(next, cursorShot);
      break;
    }
    case "disable_native_audio": {
      next.nativeAudioPolicy = { ...next.nativeAudioPolicy, requested: false };
      next.nativeAudioSnippets = [];
      if (next.audioStrategy === "native_video_audio") {
        next.audioStrategy = "separate_tts_voiceover";
        next.separateTtsPlan = buildSeparateTtsPlan(
          "separate_tts_voiceover",
          next.dialogueLines,
          next.speakerVoiceMap,
        );
      }
      break;
    }
    case "fix_safe_area": {
      for (const cue of next.subtitleCues) {
        if (cue.cueId === res.cueId && cue.safeAreaPerSubShot) {
          cue.safeAreaPerSubShot = cue.safeAreaPerSubShot.map((c) => ({
            subShotNumber: c.subShotNumber,
            valid: true,
          }));
        }
      }
      break;
    }
    case "fix_timing_mismatch":
    case "dismiss":
      break;
  }

  // Rebuild derived state that depends only on plan-local data.
  next.timing = recomputeTimingFromPlan(next);
  if (next.separateTtsPlan) {
    next.separateTtsPlan = buildSeparateTtsPlan(
      next.separateTtsPlan.strategy,
      next.dialogueLines,
      next.speakerVoiceMap,
    );
  }
  const rebuilt = buildRepairQueue({
    lines: next.dialogueLines,
    voiceMap: next.speakerVoiceMap,
    timing: next.timing,
    cues: next.subtitleCues,
    nativeAudioRequested: next.nativeAudioPolicy.requested,
    nativeAudioAllowed: next.nativeAudioPolicy.allowed,
    audioStrategy: next.audioStrategy,
  });

  // Preserve the dismissed/resolved state for the repair the caller acted on.
  const resolvedState: VerticalDramaAudioRepairAction["state"] =
    res.kind === "dismiss" ? "dismissed" : "resolved";
  const priorById = new Map(next.repairQueue.map((r) => [r.repairId, r]));
  next.repairQueue = rebuilt.repairQueue.map((r) => {
    if (r.repairId === input.repairId) return { ...r, state: resolvedState };
    const prior = priorById.get(r.repairId);
    return prior && prior.state !== "open" ? { ...r, state: prior.state } : r;
  });
  // If the acted-on repair no longer regenerates (fixed), record it as resolved.
  if (!next.repairQueue.some((r) => r.repairId === input.repairId)) {
    const prior = priorById.get(input.repairId);
    if (prior) next.repairQueue.push({ ...prior, state: resolvedState });
  }
  next.warnings = rebuilt.warnings;
  return next;
}

/** Re-lay one shot's dialogue lines end-to-end after a duration change. */
function relayShotTimings(plan: VerticalDramaDialogueAudioPlan, shotNumber: number): void {
  let cursor = 0;
  for (const line of plan.dialogueLines) {
    if (line.shotNumber !== shotNumber) continue;
    line.start = cursor;
    line.end = cursor + line.targetDurationSeconds;
    cursor = line.end;
  }
  // Keep cue windows in sync with their lines.
  const lineById = new Map(plan.dialogueLines.map((l) => [l.lineId, l]));
  for (const cue of plan.subtitleCues) {
    const line = cue.lineId ? lineById.get(cue.lineId) : undefined;
    if (line && line.shotNumber === shotNumber) {
      cue.start = line.start;
      cue.end = line.end;
    }
  }
}

/* -------------------------------------------------------------------------- */
/* LLM-driven real generation (`vertical-drama-dialogue-audio-planner`)       */
/* -------------------------------------------------------------------------- */

/**
 * The `vertical-drama-dialogue-audio-planner` skill
 * (`apps/web/skills/vertical-drama-dialogue-audio-planner/`) has existed on
 * disk since it was authored, with its own doc comment stating "The Vertical
 * Drama episode pipeline invokes it explicitly" — but nothing ever actually
 * invoked it: `dialogue_audio_plan`'s `runStage` override does not exist (see
 * `verticalDramaEpisodePipeline.ts`'s `buildStagePayload` — this stage's
 * placeholder was always returned unconditionally, including for every real
 * runner mode), and `repairStage` returned the same placeholder for every
 * stage, dialogue included. `generateEpisodeDialogueAudioPlan` below is the
 * fix for `repairStage`'s `dialogue_audio_plan` case specifically (see
 * `verticalDramaEpisodePipeline.ts`'s `generateRealDialogueAudioPlan`) — it
 * is intentionally NOT wired into `runStage`'s fresh-generation path, which
 * is out of THIS fix's scope (the dedicated Dialogue & Audio workspace tab's
 * `planDialogueAudio`/`repairAudio` mutations above already cover the
 * "fresh plan" and "structured repair action" cases for real; only a
 * free-text quality-review `instruction`-driven repair of dialogue content —
 * routed here via the pipeline's `repairStage` — had no real path at all).
 *
 * Returns the skill's RAW validated (snake_case) output — deliberately NOT
 * the shape persisted onto `vertical_drama_episodes.dialogueAudioPlan`
 * (`VerticalDramaDialogueAudioPlan`, camelCase). `dialogueAudioPlan` has
 * several STRICT, camelCase-typed readers elsewhere in this codebase (e.g.
 * `verticalDramaEpisodes.ts`'s separate-TTS submission flow, the dialogue
 * timeline builder) — persisting this skill's raw shape directly into that
 * column would silently break every one of them. The caller
 * (`generateRealDialogueAudioPlan`) instead extracts this output's
 * `dialogue_lines[]` TEXT content and feeds it through the SAME canonical,
 * already-battle-tested `buildDialogueAudioPlan` pure builder above (mirrors
 * `applyAudioRepair`'s "run the LLM/repair, then re-derive every downstream
 * field through the ONE canonical builder" convention), so the persisted
 * plan is byte-shape-identical to one produced by the dedicated
 * `planDialogueAudio` mutation — only the dialogue TEXT differs.
 */
const DIALOGUE_AUDIO_PLANNER_SKILL_FOLDER_PATH = path.join(
  "skills",
  "vertical-drama-dialogue-audio-planner",
);

let cachedDialogueAudioPlannerSystemPrompt: string | null = null;

/** Mirrors `verticalDramaScriptGeneration.ts`'s `loadSkillSystemPrompt`. */
function loadDialogueAudioPlannerSkillSystemPrompt(): string {
  if (cachedDialogueAudioPlannerSystemPrompt) return cachedDialogueAudioPlannerSystemPrompt;

  for (const dir of resolveSkillDirCandidates(DIALOGUE_AUDIO_PLANNER_SKILL_FOLDER_PATH)) {
    const manifestPath = resolveSkillManifestPath(dir);
    if (manifestPath && fs.existsSync(manifestPath)) {
      const raw = fs.readFileSync(manifestPath, "utf-8");
      const { content } = parseSkillFile(raw);
      if (content && content.trim().length > 0) {
        cachedDialogueAudioPlannerSystemPrompt = content;
        return cachedDialogueAudioPlannerSystemPrompt;
      }
    }
  }

  throw new Error(
    `Could not locate skill.md for "vertical-drama-dialogue-audio-planner" under any known skills directory`,
  );
}

/** Mirrors `vertical-drama-dialogue-audio-planner/schemas/output.schema.json`'s REQUIRED fields — `.passthrough()` everywhere so the skill's richer optional fields (delivery/subtext/native audio/etc.) survive even though only the required subset is strictly validated here. */
const dialogueAudioPlannerDeliverySchema = z
  .object({
    tone: z.string().optional(),
    pace: z.string().optional(),
    pauses: z.string().optional(),
    texture: z.string().optional(),
  })
  .passthrough();

const dialogueAudioPlannerLineSchema = z
  .object({
    shot_number: z.number().int().optional(),
    clip_number: z.number().int().optional(),
    speaker_character_id: z.string(),
    dialogue_line: z.string(),
    estimated_seconds: z.number().nonnegative().optional(),
    delivery: dialogueAudioPlannerDeliverySchema.optional(),
    subtext: z.string().optional(),
    origin: z.enum(["script", "script_fallback"]).optional(),
  })
  .passthrough();

const dialogueAudioPlannerSubtitleCueSchema = z
  .object({
    shot_number: z.number().int().optional(),
    text: z.string().optional(),
    start_seconds: z.number().optional(),
    end_seconds: z.number().optional(),
    safe_area_hint: z.string().optional(),
  })
  .passthrough();

export const dialogueAudioPlannerOutputSchema = z
  .object({
    contract_version: z.literal(1),
    dialogue_lines: z.array(dialogueAudioPlannerLineSchema),
    speaker_mapping: z.array(z.object({}).passthrough()),
    voice_continuity_map: z.object({}).passthrough(),
    missing_voice_warnings: z.array(z.object({}).passthrough()),
    subtitle_cues: z.array(dialogueAudioPlannerSubtitleCueSchema),
    audio_timing_estimate: z.object({}).passthrough(),
    native_audio_snippets: z.array(z.object({}).passthrough()),
    separate_tts_plan: z.object({}).passthrough(),
    warnings: z.array(z.object({}).passthrough()),
    repair_queue: z.array(z.object({}).passthrough()),
  })
  .passthrough();

export type DialogueAudioPlannerOutput = z.infer<typeof dialogueAudioPlannerOutputSchema>;

export interface GenerateEpisodeDialogueAudioPlanParams {
  userId: number;
  tenantId?: string;
  seriesId: number;
  episodeId: number;
  locale: VerticalDramaSeriesLocale;
  /** Shared series-level spoken-language/market contract for generated audio text. */
  dialogueLanguageProfile?: VerticalDramaDialogueLanguageProfile;
  durationSeconds: number;
  /** The episode's own persisted `script` column (full object) — the skill's dialogue-complete source of truth when present. */
  episodeScript: Record<string, unknown>;
  audioStrategy?: string;
  characters: Array<{
    characterId: string;
    name: string;
    role: string | null;
    /**
     * Section 05 addition (spec §7.3 speech profiles, F132F
     * `verticalDramaCharacterProfiles`, added 2026-07-09) — purely additive
     * optional field. Every existing caller that omits it keeps the prompt
     * byte-identical. When present, mapped into a per-line delivery-hint
     * instruction (`emotionalDefault`/`speakingSpeed` -> tone/pace guidance)
     * so the planner's `delivery.tone`/`delivery.pace` output honors each
     * character's distinct speech profile.
     */
    speechProfile?: VerticalDramaSpeechProfile;
  }>;
  shotClipTiming?: Array<{
    shotNumber: number;
    clipNumber?: number;
    durationSeconds: number;
  }>;
  /**
   * Repair-mode context — see `GenerateEpisodeScriptParams.repairContext`'s
   * doc comment (`verticalDramaScriptGeneration.ts`) for the shared
   * convention. Only set by `verticalDramaEpisodePipeline.ts`'s
   * `repairStage` — `runStage` never calls this function (see this section's
   * header doc comment).
   */
  repairContext?: {
    currentPlan: Record<string, unknown> | null;
    instruction: string;
  };
  /**
   * Additive feature-flag bag (Section 05, spec §11, added 2026-07-09) —
   * mirrors `GenerateEpisodeScriptParams.opts`'s convention exactly. Every
   * flag defaults to falsy/undefined, preserving today's byte-identical
   * prompt.
   */
  opts?: {
    /**
     * Feature flag `verticalDramaMultiPassQc` (F132D) — injects Section 01's
     * single-source dialogue-rules-v2 fragment (stamped with the greppable
     * criteria-version marker) into this planner's prompt. Omitted/false
     * preserves today's byte-identical prompt.
     */
    dialogueRulesV2Enabled?: boolean;
  };
}

/** Human-readable speaking-speed -> pacing-instruction phrase for the per-character delivery-hint section. */
const SPEAKING_SPEED_DELIVERY_HINT: Record<VerticalDramaSpeechProfile["speakingSpeed"], string> = {
  slow: "deliberately slow pacing",
  measured: "measured, unhurried pacing",
  normal: "normal conversational pacing",
  fast: "quick, energetic pacing",
  rapid_fire: "rapid-fire, breathless pacing",
};

function buildDialogueAudioPlannerUserPrompt(params: GenerateEpisodeDialogueAudioPlanParams): string {
  const langInstruction =
    params.locale === "th"
      ? "Write dialogue_line (and any Thai native_audio_snippets/separate_tts_plan lines) in natural spoken Thai per the HARD RULEs above."
      : `Write dialogue_line (and any native_audio_snippets/separate_tts_plan lines) in natural spoken ${verticalDramaLocaleEnglishName(params.locale)}.`;
  const dialogueLanguageProfilePrompt =
    buildVerticalDramaDialogueLanguageProfilePrompt({
      locale: params.locale,
      profile: params.dialogueLanguageProfile,
    });

  const characterLines = params.characters.length
    ? params.characters
        .map((c) => `- ${c.characterId}: ${c.name}${c.role ? ` (${c.role})` : ""}`)
        .join("\n")
    : "(no characters registered yet — use the script's own character names/ids)";

  const shotTimingSection = params.shotClipTiming?.length
    ? `shot_clip_timing: ${JSON.stringify(
        params.shotClipTiming.map((s) => ({
          shot_number: s.shotNumber,
          clip_number: s.clipNumber,
          duration_seconds: s.durationSeconds,
        })),
      )}`
    : null;

  // Section 05 addition (spec §7.3 speech profiles, F132F, added
  // 2026-07-09) — per-character delivery-hint instructions, only rendered
  // for characters that actually carry a `speechProfile` (purely additive:
  // a character list with none produces `null` here, byte-identical to
  // before this field existed). Maps `speakingSpeed`/`emotionalDefault`
  // into a concrete tone/pace instruction for this planner's
  // `delivery.tone`/`delivery.pace` output — never the speech-profile object
  // verbatim, since this planner's job is delivery HINTS, not profile
  // echoing (that's the script-builder's "voice card", a different
  // rendering — see `verticalDramaScriptGeneration.ts`'s `renderVoiceCardBlock`
  // usage).
  const charactersWithSpeechProfile = params.characters.filter((c) => c.speechProfile);
  const speechProfileDeliveryHintsSection =
    charactersWithSpeechProfile.length > 0
      ? [
          "Character speech-profile delivery hints — map each character's speech profile into per-line delivery.tone/delivery.pace whenever that character speaks:",
          ...charactersWithSpeechProfile.map((c) => {
            const profile = c.speechProfile!;
            return `- ${c.characterId} (${c.name}): pace = ${SPEAKING_SPEED_DELIVERY_HINT[profile.speakingSpeed] ?? profile.speakingSpeed}; tone = ${profile.emotionalDefault}`;
          }),
        ].join("\n")
      : null;

  // Section 05 addition (spec §11 "Unified Criteria Application" / F132D,
  // added 2026-07-09) — embeds Section 01's single-source dialogue-rules-v2
  // fragment (already carries the criteria-version marker) into this
  // planner's prompt, satisfying the "dialogue-audio-planner prompt"
  // consumer entry point tracked by
  // `verticalDramaQualityCriteria.agreement.test.ts`. Gated on
  // `opts.dialogueRulesV2Enabled` — omitted/false preserves today's byte-
  // identical prompt.
  const dialogueRulesV2Section = params.opts?.dialogueRulesV2Enabled
    ? getVerticalDramaQualityCriteriaBundle().dialogueRulesV2
    : null;

  // Repair-mode framing — see `GenerateEpisodeDialogueAudioPlanParams.repairContext`'s
  // doc comment. Additive; only rendered when a caller explicitly supplies
  // `repairContext`, so the (currently sole) call site always renders it —
  // there is no fresh-generation call site for this function today.
  const repairSection = params.repairContext
    ? [
        "REPAIR MODE: You are REPAIRING an existing dialogue/audio plan — you are NOT planning from scratch.",
        "Apply ONLY the targeted change(s) the instruction below calls for. Preserve every other line's speaker, timing, and delivery from the CURRENT plan exactly as-is unless the instruction specifically requires changing it — do not rewrite unrelated shots' dialogue.",
        params.repairContext.currentPlan
          ? `current_plan: ${JSON.stringify(params.repairContext.currentPlan)}`
          : "current_plan: (none on record yet for this episode — produce a first plan that satisfies the instruction)",
        `repair_instruction: ${params.repairContext.instruction}`,
      ].join("\n")
    : null;

  return [
    `episode_script: ${JSON.stringify(params.episodeScript)}`,
    `audio_strategy: ${params.audioStrategy ?? "separate_tts_voiceover"}`,
    `target_language: ${params.locale}`,
    `dialogue_language_profile: ${JSON.stringify(params.dialogueLanguageProfile ?? { version: 2, spokenLocale: "auto" })}`,
    langInstruction,
    dialogueLanguageProfilePrompt,
    `target_duration_seconds: ${params.durationSeconds}`,
    `characters:\n${characterLines}`,
    speechProfileDeliveryHintsSection,
    shotTimingSection,
    repairSection,
    dialogueRulesV2Section,
    VD_COMPACT_JSON_INSTRUCTION,
  ]
    .filter(Boolean)
    .join("\n\n");
}

/**
 * Generate the `dialogue_audio_plan` stage's real content via the
 * `vertical-drama-dialogue-audio-planner` skill, using a direct
 * `executeWithFallback` LLM call (through the shared
 * `executeJsonPlanningCallWithRetry` wrapper). Credit-gated (throws
 * `InsufficientCreditsError` before calling out) and schema-validated
 * (throws `VdSchemaValidationError` on a malformed LLM response) — mirrors
 * `generateEpisodeScript`/`generateStoryboardShotgrid`'s check-credits ->
 * resolve-model -> call -> validate -> deduct-credits convention exactly.
 */
export async function generateEpisodeDialogueAudioPlan(
  params: GenerateEpisodeDialogueAudioPlanParams,
): Promise<{
  plan: DialogueAudioPlannerOutput;
  creditsUsed: number;
  model: string;
}> {
  const rateLimitKey = `user:${params.userId}`;
  if (!mediaGenerationLimiter.isAllowed(rateLimitKey)) {
    throw new Error(
      `Rate limit exceeded for dialogue audio plan generation. Try again in ${Math.ceil(mediaGenerationLimiter.getResetTime(rateLimitKey) / 1000)} seconds.`,
    );
  }

  const hasCredits = await hasEnoughCredits(params.userId, 1);
  if (!hasCredits) {
    throw new InsufficientCreditsError();
  }

  const model = await resolveVerticalDramaSeriesModel(
    params.seriesId,
    resolveQualityLargeContextModelId,
  );
  const systemPrompt = loadDialogueAudioPlannerSkillSystemPrompt();
  const userPrompt = buildDialogueAudioPlannerUserPrompt(params);

  const { data: validatedData, response } = await executeJsonPlanningCallWithRetry({
    model,
    systemPrompt,
    userPrompt,
    temperature: 0.8,
    userId: params.userId,
    maxTokens: 12000,
    schema: dialogueAudioPlannerOutputSchema,
    label: "Dialogue audio plan",
  });

  const usage = response.usage;
  const creditsUsed = calculateCreditsForLLM(
    usage?.prompt_tokens ?? 0,
    usage?.completion_tokens ?? 0,
    model,
  );

  await deductCredits({
    userId: params.userId,
    tenantId: params.tenantId,
    amount: creditsUsed,
    description: `Vertical Drama — generate dialogue audio plan (episode #${params.episodeId})`,
    sourceType: "skill",
    metadata: {
      model,
      llmModel: model,
      feature: "vertical_drama_series",
      seriesId: params.seriesId,
      episodeId: params.episodeId,
      inputTokens: usage?.prompt_tokens ?? 0,
      outputTokens: usage?.completion_tokens ?? 0,
    },
  });

  return { plan: validatedData, creditsUsed, model };
}

/* -------------------------------------------------------------------------- */
/* Storyboard Review handoff metadata (spec §12, §14 rules 6-7)               */
/* -------------------------------------------------------------------------- */

export type VerticalDramaAudioReviewMetadata = {
  dialogueAudioPlanId: string;
  mode: VerticalDramaDialogueMode;
  audioStrategy: VerticalDramaAudioStrategy;
  voiceIds: string[];
  subtitleCueIds: string[];
  totalDialogueSeconds: number;
  episodeTargetSeconds: number;
  timingMismatch: boolean;
  /** Strategy-specific regeneration-impact copy for a script/dialogue change. */
  regenerationImpact: ReturnType<typeof computeRegenerationImpact>;
};

/**
 * Project the audio plan into the metadata carried into Storyboard Review. Extra
 * params must preserve audio strategy, voice ids, subtitle cue ids and timing so
 * they survive save/load (section-07 Acceptance). The regeneration-impact copy is
 * strategy-specific (spec §14 rules 6-7): native video audio → a change requires
 * VIDEO regeneration; separate TTS → audio regenerates without touching video.
 */
export function buildStoryboardReviewAudioMetadata(
  plan: VerticalDramaDialogueAudioPlan,
): VerticalDramaAudioReviewMetadata {
  const voiceIds = [
    ...new Set(
      plan.speakerVoiceMap.entries
        .map((e) => e.voiceId)
        .filter((v): v is string => Boolean(v)),
    ),
  ];
  return {
    dialogueAudioPlanId: plan.planId,
    mode: plan.mode,
    audioStrategy: plan.audioStrategy,
    voiceIds,
    subtitleCueIds: plan.subtitleCues.map((c) => c.cueId),
    totalDialogueSeconds: plan.timing.totalDialogueSeconds,
    episodeTargetSeconds: plan.timing.episodeTargetSeconds,
    timingMismatch: plan.timing.timingMismatch,
    regenerationImpact: computeRegenerationImpact(plan.audioStrategy),
  };
}

/* -------------------------------------------------------------------------- */
/* DB-backed service (tenant + user scoped persistence)                       */
/* -------------------------------------------------------------------------- */

export interface VerticalDramaAudioOwner {
  tenantId: string;
  userId: number;
}

export class VerticalDramaOwnershipError extends Error {
  constructor(message = "Vertical Drama episode not found") {
    super(message);
    this.name = "VerticalDramaOwnershipError";
  }
}

export class VerticalDramaDialogueAudioService {
  /** Load an episode row the caller owns (tenant + user + series + episode). */
  private async loadOwnedEpisode(owner: VerticalDramaAudioOwner, seriesId: number, episodeId: number) {
    const [row] = await db
      .select()
      .from(verticalDramaEpisodes)
      .where(
        and(
          eq(verticalDramaEpisodes.id, episodeId),
          eq(verticalDramaEpisodes.seriesId, seriesId),
          eq(verticalDramaEpisodes.tenantId, owner.tenantId),
          eq(verticalDramaEpisodes.userId, owner.userId),
        ),
      )
      .limit(1);
    if (!row) throw new VerticalDramaOwnershipError();
    return row;
  }

  /** Resolve (or create) a dialogue-audio run for the episode, ownership-checked. */
  private async ensureRun(
    owner: VerticalDramaAudioOwner,
    seriesId: number,
    episodeId: number,
    runId?: number,
  ): Promise<VerticalDramaEpisodeRunRow> {
    if (runId != null) {
      const [row] = await db
        .select()
        .from(verticalDramaEpisodeRuns)
        .where(
          and(
            eq(verticalDramaEpisodeRuns.id, runId),
            eq(verticalDramaEpisodeRuns.tenantId, owner.tenantId),
            eq(verticalDramaEpisodeRuns.userId, owner.userId),
            eq(verticalDramaEpisodeRuns.episodeId, episodeId),
          ),
        )
        .limit(1);
      if (!row) throw new VerticalDramaOwnershipError("Vertical Drama run not found");
      return row;
    }
    // Reuse the latest dialogue-audio run for this episode if present.
    const [existing] = await db
      .select()
      .from(verticalDramaEpisodeRuns)
      .where(
        and(
          eq(verticalDramaEpisodeRuns.tenantId, owner.tenantId),
          eq(verticalDramaEpisodeRuns.userId, owner.userId),
          eq(verticalDramaEpisodeRuns.episodeId, episodeId),
          eq(verticalDramaEpisodeRuns.stage, VERTICAL_DRAMA_DIALOGUE_AUDIO_STAGE),
        ),
      )
      .orderBy(desc(verticalDramaEpisodeRuns.id))
      .limit(1);
    if (existing) return existing;

    const [created] = await db
      .insert(verticalDramaEpisodeRuns)
      .values({
        tenantId: owner.tenantId,
        userId: owner.userId,
        seriesId,
        episodeId,
        stage: VERTICAL_DRAMA_DIALOGUE_AUDIO_STAGE,
        runMode: "dry_run",
        status: "completed",
        nextAction: "none",
      } as typeof verticalDramaEpisodeRuns.$inferInsert)
      .returning();
    return created as VerticalDramaEpisodeRunRow;
  }

  /** Persist the plan as a run artifact + mirror it onto the episode row. */
  private async persistPlan(
    owner: VerticalDramaAudioOwner,
    seriesId: number,
    episodeId: number,
    run: VerticalDramaEpisodeRunRow,
    plan: VerticalDramaDialogueAudioPlan,
  ): Promise<{ artifactId: string }> {
    const checksum = artifactChecksumSha256(plan);
    const [artifact] = await db
      .insert(verticalDramaRunArtifacts)
      .values({
        tenantId: owner.tenantId,
        userId: owner.userId,
        seriesId,
        episodeId,
        runId: run.id,
        stage: VERTICAL_DRAMA_DIALOGUE_AUDIO_STAGE,
        jsonPayload: plan,
        checksumSha256: checksum,
      })
      .returning({ id: verticalDramaRunArtifacts.id });

    await db
      .update(verticalDramaEpisodes)
      .set({ dialogueAudioPlan: plan, updatedAt: new Date() })
      .where(
        and(
          eq(verticalDramaEpisodes.id, episodeId),
          eq(verticalDramaEpisodes.tenantId, owner.tenantId),
          eq(verticalDramaEpisodes.userId, owner.userId),
        ),
      );

    // Carry plan-level warnings onto the run row for the workspace to surface.
    await db
      .update(verticalDramaEpisodeRuns)
      .set({ warnings: plan.warnings, updatedAt: new Date() })
      .where(eq(verticalDramaEpisodeRuns.id, run.id));

    return { artifactId: String(artifact.id) };
  }

  /**
   * Plan dialogue/audio/subtitles for an owned episode and persist it (dry-run;
   * no paid TTS/video). Returns the plan, the artifact id and the Storyboard
   * Review handoff metadata.
   */
  async planDialogueAudio(
    owner: VerticalDramaAudioOwner,
    input: PlanDialogueAudioInput,
  ): Promise<{
    plan: VerticalDramaDialogueAudioPlan;
    artifactId: string;
    runId: string;
    reviewMetadata: VerticalDramaAudioReviewMetadata;
  }> {
    const seriesId = Number(input.seriesId);
    const episodeId = Number(input.episodeId);
    if (!Number.isFinite(seriesId) || !Number.isFinite(episodeId)) {
      throw new VerticalDramaOwnershipError("Invalid series/episode id");
    }
    await this.loadOwnedEpisode(owner, seriesId, episodeId);
    const run = await this.ensureRun(
      owner,
      seriesId,
      episodeId,
      input.runId != null ? Number(input.runId) : undefined,
    );

    const plan = buildDialogueAudioPlan({ ...input, runId: String(run.id) });
    const { artifactId } = await this.persistPlan(owner, seriesId, episodeId, run, plan);
    return {
      plan,
      artifactId,
      runId: String(run.id),
      reviewMetadata: buildStoryboardReviewAudioMetadata(plan),
    };
  }

  /** Load the latest persisted plan for an owned episode, or undefined. */
  async loadLatestPlan(
    owner: VerticalDramaAudioOwner,
    seriesId: number,
    episodeId: number,
  ): Promise<VerticalDramaDialogueAudioPlan | undefined> {
    await this.loadOwnedEpisode(owner, seriesId, episodeId);
    const [row] = await db
      .select({ jsonPayload: verticalDramaRunArtifacts.jsonPayload })
      .from(verticalDramaRunArtifacts)
      .where(
        and(
          eq(verticalDramaRunArtifacts.tenantId, owner.tenantId),
          eq(verticalDramaRunArtifacts.userId, owner.userId),
          eq(verticalDramaRunArtifacts.episodeId, episodeId),
          eq(verticalDramaRunArtifacts.stage, VERTICAL_DRAMA_DIALOGUE_AUDIO_STAGE),
        ),
      )
      .orderBy(desc(verticalDramaRunArtifacts.id))
      .limit(1);
    return (row?.jsonPayload as VerticalDramaDialogueAudioPlan | undefined) ?? undefined;
  }

  /**
   * Apply a repair to the latest persisted plan for an owned episode and persist
   * the repaired plan as a new artifact revision.
   */
  async repairAudio(
    owner: VerticalDramaAudioOwner,
    input: AudioRepairInput,
  ): Promise<{
    plan: VerticalDramaDialogueAudioPlan;
    artifactId: string;
    runId: string;
    reviewMetadata: VerticalDramaAudioReviewMetadata;
  }> {
    const seriesId = Number(input.seriesId);
    const episodeId = Number(input.episodeId);
    if (!Number.isFinite(seriesId) || !Number.isFinite(episodeId)) {
      throw new VerticalDramaOwnershipError("Invalid series/episode id");
    }
    const current = await this.loadLatestPlan(owner, seriesId, episodeId);
    if (!current) {
      throw new VerticalDramaOwnershipError("No dialogue-audio plan to repair");
    }
    const run = await this.ensureRun(
      owner,
      seriesId,
      episodeId,
      input.runId != null ? Number(input.runId) : undefined,
    );
    const repaired = applyAudioRepair(current, input);
    const { artifactId } = await this.persistPlan(owner, seriesId, episodeId, run, repaired);
    return {
      plan: repaired,
      artifactId,
      runId: String(run.id),
      reviewMetadata: buildStoryboardReviewAudioMetadata(repaired),
    };
  }
}

/** Shared singleton. */
export const verticalDramaDialogueAudioService = new VerticalDramaDialogueAudioService();
