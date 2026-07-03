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

import { z } from "zod";
import { and, desc, eq } from "drizzle-orm";
import { db } from "../db";
import {
  verticalDramaEpisodes,
  verticalDramaEpisodeRuns,
  verticalDramaRunArtifacts,
  type VerticalDramaEpisodeRunRow,
} from "../../drizzle/schema";
import type { VerticalDramaWarning } from "@shared/verticalDramaSeries";
import { artifactChecksumSha256 } from "@shared/verticalDramaSeries";
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
  VERTICAL_DRAMA_DEFAULT_SUBTITLE_SAFE_AREA,
  computeSubShotSpans,
  validateCueSafeAreaPerSubShot,
  type SubtitleSubShotSlice,
  type VerticalDramaSubtitleCue,
  type VerticalDramaSubtitleSafeArea,
} from "@shared/verticalDramaSeries/subtitles";

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
 */
export function buildSpeakerVoiceMap(
  beats: DialogueBeatInput[],
  voiceBindings: SeriesVoiceBinding[],
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
 */
export function buildSeparateTtsPlan(
  strategy: "separate_tts_voiceover" | "dialogue_tts",
  lines: VerticalDramaDialogueLine[],
  voiceMap: VerticalDramaSpeakerVoiceMap,
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
    const voiceId = entry?.voiceId;
    provider = provider ?? entry?.voiceProvider;
    const blocked = !voiceId;
    if (blocked) blockedLineIds.push(line.lineId);
    items.push({
      lineId: line.lineId,
      speakerName: line.speakerName,
      characterId: line.speakerCharacterId,
      voiceProvider: entry?.voiceProvider,
      voiceModelId: entry?.voiceModelId,
      voiceId,
      text: line.text,
      targetDurationSeconds: line.targetDurationSeconds,
      blocked,
      blockReason: blocked ? "missing_voice_id" : undefined,
    });
  }

  return { strategy, provider, items, injectsIntoVideoPrompts: false, blockedLineIds };
}

/** Native-audio prompt snippets — ONLY when native audio is policy-allowed. */
function buildNativeAudioSnippets(
  lines: VerticalDramaDialogueLine[],
  allowed: boolean,
): VerticalDramaNativeAudioSnippet[] {
  if (!allowed) return [];
  return lines.map((line) => ({
    shotNumber: line.shotNumber,
    speakerName: line.isNarration ? undefined : line.speakerName,
    text: line.text,
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
  const subShotsEnabled = Boolean(input.subShotsEnabled);
  const safeArea = input.subtitleSafeArea ?? VERTICAL_DRAMA_DEFAULT_SUBTITLE_SAFE_AREA;
  const episodeTargetSeconds = input.episodeTargetSeconds ?? VERTICAL_DRAMA_EPISODE_TARGET_SECONDS;
  const tolerance = input.overlongToleranceSeconds ?? VERTICAL_DRAMA_TIMING_TOLERANCE_SECONDS;
  const now = input.now ?? new Date().toISOString();

  const dialogueLines = buildDialogueLines(beats, input.shots, subShotsEnabled);
  const speakerVoiceMap = buildSpeakerVoiceMap(beats, voiceBindings);

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

  const separateTtsPlan =
    audioStrategy === "separate_tts_voiceover" || audioStrategy === "dialogue_tts"
      ? buildSeparateTtsPlan(audioStrategy, dialogueLines, speakerVoiceMap)
      : undefined;

  const nativeAudioSnippets = buildNativeAudioSnippets(
    dialogueLines,
    audioStrategy === "native_video_audio" && nativeAudioPolicy.allowed,
  );

  const { repairQueue, warnings } = buildRepairQueue({
    lines: dialogueLines,
    voiceMap: speakerVoiceMap,
    timing,
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
