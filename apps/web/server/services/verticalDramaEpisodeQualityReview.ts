/**
 * Vertical Drama Series — episode quality-review scorecard (Phase 3B,
 * `planning/vertical-drama-storyboard-complete/plan.md` §3B.5; formalized +
 * extended to v2 by spec §16.1 / section-14-script-quality-qc-auto-improve,
 * 2026-07-07).
 *
 * Invokes the `vertical-drama-episode-quality-review` skill
 * (`apps/web/skills/vertical-drama-episode-quality-review/`) via a direct
 * `executeWithFallback` LLM call — mirrors `verticalDramaScriptGeneration.ts`'s
 * (itself mirroring `verticalDramaStoryBible.ts`'s) check-credits ->
 * resolve-model -> call -> validate -> deduct-credits convention exactly.
 *
 * This is a cheap, LLM-only text review (script + storyboard + optional
 * dialogue plan in, a scorecard + issues list out) meant to run BEFORE the
 * user spends credits on image/video generation. It never blocks: even a
 * maximally flat episode gets a full, valid scorecard back — the caller
 * decides what to do with it.
 *
 * Wired into `server/routers/verticalDramaEpisodes.ts` (`runEpisodeQualityReview`
 * / `applyQualityReviewSuggestions`).
 *
 * v2 (spec §16.1): `episodeQualityReviewOutputSchema` is a superset —
 * `contract_version` may be `1` (default/legacy, unchanged) or `2`, which adds
 * `hook_strength` / `cliffhanger_strength` / `continuity_consistency` /
 * `tie_in_naturalness` to the scorecard plus a top-level `density_metrics`
 * block. `density_metrics` is always computed deterministically in code
 * (`computeVerticalDramaDensityMetrics`, built only from
 * `@shared/verticalDramaSeries/dialogueQuality`'s analyzers + simple counting
 * — no LLM) and, when a caller supplies it via
 * `RunEpisodeQualityReviewParams.densityMetrics`, it is injected into the
 * prompt AND force-overwritten onto the parsed LLM output afterward — the LLM
 * judges qualitative dimensions only, it never re-estimates these facts (spec
 * §16.1 rule 1). Callers that omit `densityMetrics`/`tieInConfig` get
 * byte-identical v1 behavior (prompt text and validated-output handling both
 * unchanged).
 */

import fs from "fs";
import path from "path";
import { z } from "zod";
import { parseSkillFile } from "@smartspec/skills";
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
  resolveStoryBibleModel,
  executeJsonPlanningCallWithRetry,
  InsufficientCreditsError,
  VdSchemaValidationError,
  VD_COMPACT_JSON_INSTRUCTION,
} from "./verticalDramaStoryBible";
import { debugError } from "../_core/logger";
import {
  verticalDramaLocaleEnglishName,
  type VerticalDramaSeriesLocale,
} from "@shared/verticalDramaSeries";
import {
  analyzeVerticalDramaEpisodeDialogueQuality,
  analyzeVerticalDramaClipSilence,
  hasVerticalDramaStageDirectionDialogue,
  type VerticalDramaDialogueClipQualityInput,
  type VerticalDramaDialogueQualityLine,
} from "@shared/verticalDramaSeries/dialogueQuality";

// Re-exported so callers only need to import from this one module.
export { InsufficientCreditsError, VdSchemaValidationError };

/**
 * Thrown when the per-user `mediaGenerationLimiter` rejects a quality-review
 * call. There is no pipeline stage mapper for this skill yet (it is not
 * wired into `verticalDramaEpisodePipeline.ts`), so callers should handle
 * this the same way the other Vertical Drama generation services' sibling
 * `RateLimitExceededError` classes are handled — surface a retryable error.
 */
export class RateLimitExceededError extends Error {
  code = "VD_RATE_LIMIT_EXCEEDED" as const;
  constructor(retryAfterMs: number) {
    super(
      `Rate limit exceeded for episode quality review. Try again in ${Math.ceil(retryAfterMs / 1000)} seconds.`
    );
    this.name = "RateLimitExceededError";
  }
}

const SKILL_FOLDER_PATH = path.join(
  "skills",
  "vertical-drama-episode-quality-review"
);

let cachedSystemPrompt: string | null = null;

/** Mirrors `verticalDramaScriptGeneration.ts`'s `loadSkillSystemPrompt`. */
function loadSkillSystemPrompt(): string {
  if (cachedSystemPrompt) return cachedSystemPrompt;

  for (const dir of resolveSkillDirCandidates(SKILL_FOLDER_PATH)) {
    const manifestPath = resolveSkillManifestPath(dir);
    if (manifestPath && fs.existsSync(manifestPath)) {
      const raw = fs.readFileSync(manifestPath, "utf-8");
      const { content } = parseSkillFile(raw);
      if (content && content.trim().length > 0) {
        cachedSystemPrompt = content;
        return cachedSystemPrompt;
      }
    }
  }

  throw new Error(
    `Could not locate skill.md for "vertical-drama-episode-quality-review" under any known skills directory`
  );
}

/* -------------------------------------------------------------------------- */
/* Output schema — mirrors schemas/output.schema.json's REQUIRED fields        */
/* -------------------------------------------------------------------------- */

const qualityReviewScorecardSchema = z
  .object({
    reversal_count: z.number().int().min(0),
    reversal_sharpness: z.number().int().min(1).max(5),
    emotion_variety: z.number().int().min(1).max(5),
    dialogue_naturalness: z.number().int().min(1).max(5).nullable(),
    pacing: z.number().int().min(1).max(5),
    overall: z.number().int().min(1).max(5),
    /** v2 superset (spec §16.1, added 2026-07-07) — all optional so v1 payloads keep parsing unchanged. */
    hook_strength: z.number().int().min(1).max(5).optional(),
    cliffhanger_strength: z.number().int().min(1).max(5).optional(),
    continuity_consistency: z.number().int().min(1).max(5).optional(),
    /** 1-5, or null when no tie-in is configured for this episode. */
    tie_in_naturalness: z.number().int().min(1).max(5).nullable().optional(),
  })
  .passthrough();

const qualityReviewIssueSchema = z
  .object({
    location: z.string().min(1),
    problem: z.string().min(1),
    suggested_fix: z.string().min(1),
  })
  .passthrough();

/**
 * Mirrors `schemas/output.schema.json`'s `density_metrics` block (spec §16.1
 * / §7.7.1). Every field is optional at the zod level — this schema's only
 * job is to accept whatever the LLM echoes back (see
 * `computeVerticalDramaDensityMetrics` below for the strict, always-populated
 * shape the CODE itself produces, which is what actually gets persisted —
 * `runVerticalDramaEpisodeQualityReview` force-overwrites this field with
 * that code-computed value whenever the caller supplies one, so leniency
 * here only matters for the rare case where the caller does NOT supply
 * `densityMetrics` and the LLM nonetheless includes something under this key).
 */
const densityMetricsPerClipCoverageSchema = z
  .object({
    clips_evaluated: z.number().int().min(0).optional(),
    clips_below_min_ratio: z.number().int().min(0).optional(),
    clips_below_error_ratio: z.number().int().min(0).optional(),
    average_coverage_ratio: z.number().optional(),
  })
  .passthrough();

const densityMetricsSchema = z
  .object({
    estimated_speech_seconds: z.number().optional(),
    per_clip_coverage: densityMetricsPerClipCoverageSchema.optional(),
    silent_gap_count: z.number().int().min(0).optional(),
    duplicate_line_count: z.number().int().min(0).optional(),
    stage_direction_count: z.number().int().min(0).optional(),
    reversal_count: z.number().int().min(0).optional(),
    max_consecutive_same_emotion: z.number().int().min(0).optional(),
  })
  .passthrough();

export const episodeQualityReviewOutputSchema = z
  .object({
    // v1 shipped as `z.literal(1).optional()` — widened to accept `2` too
    // (spec §16.1). Still optional/absent-defaults-to-1 so every already
    // persisted v1 artifact (many predate this field entirely) keeps parsing.
    contract_version: z.union([z.literal(1), z.literal(2)]).optional(),
    episode_title: z.string().min(1),
    scorecard: qualityReviewScorecardSchema,
    summary: z.string().min(1),
    /** v2 superset — short qualitative note supporting `scorecard.tie_in_naturalness`; omitted when no tie-in is configured. */
    tie_in_assessment: z.string().optional(),
    /** v2 superset — deterministic density facts (spec §16.1 rule 1); see `computeVerticalDramaDensityMetrics`. */
    density_metrics: densityMetricsSchema.optional(),
    issues: z.array(qualityReviewIssueSchema),
    warnings: z.array(z.object({}).passthrough()),
    repair_queue: z.array(z.object({}).passthrough()),
  })
  .passthrough();

export type EpisodeQualityReviewOutput = z.infer<
  typeof episodeQualityReviewOutputSchema
>;

/* -------------------------------------------------------------------------- */
/* Deterministic density metrics (spec §16.1 rule 1 / §7.7.1) — NO LLM         */
/* -------------------------------------------------------------------------- */

/**
 * The strict, always-fully-populated shape the CODE computes
 * (`computeVerticalDramaDensityMetrics`) — distinct from `densityMetricsSchema`
 * above, which is the lenient shape used only to validate whatever the LLM
 * happens to echo back. Field names are snake_case to match
 * `schemas/output.schema.json`'s `density_metrics` verbatim, since a value of
 * this exact shape is injected into the prompt and assigned directly onto
 * `EpisodeQualityReviewOutput.density_metrics`.
 */
export interface VerticalDramaDensityMetrics {
  estimated_speech_seconds: number;
  per_clip_coverage: {
    clips_evaluated: number;
    clips_below_min_ratio: number;
    clips_below_error_ratio: number;
    average_coverage_ratio: number;
  };
  silent_gap_count: number;
  duplicate_line_count: number;
  stage_direction_count: number;
  /** Deterministic count from `script.structure.beats[].is_reversal === true` — distinct from `scorecard.reversal_count`, which is the LLM's own judgment. */
  reversal_count: number;
  max_consecutive_same_emotion: number;
}

/** One clip's duration, keyed by shot (+ optional sub-shot/clip number). */
export interface VerticalDramaDensityMetricsClipInput {
  shotNumber?: number;
  clipNumber?: number;
  durationSeconds: number;
}

export interface ComputeVerticalDramaDensityMetricsParams {
  /** Raw (or relevant-subset) output of `vertical-drama-script-builder` — only `structure.beats[].is_reversal` is consulted. */
  script?: Record<string, unknown> | null;
  /** Raw (or relevant-subset) output of `vertical-drama-storyboard-shotgrid` — used for `shots[].emotion` and, when `clipDurations` is omitted, `shots[].duration_seconds`. */
  storyboard?: Record<string, unknown> | null;
  /** Raw (or relevant-subset) persisted dialogue/audio plan (`VerticalDramaDialogueAudioPlan`-shaped) — used for `dialogueLines[]` when present. */
  dialoguePlan?: Record<string, unknown> | null;
  /** Explicit per-clip durations (e.g. post sub-shot decomposition). Falls back to each storyboard shot's own duration when omitted. */
  clipDurations?: VerticalDramaDensityMetricsClipInput[];
  /**
   * Accepted for signature symmetry with `RunEpisodeQualityReviewParams` —
   * NOT currently consulted: every `dialogueQuality.ts` estimator already
   * auto-detects Thai vs. non-Thai from each line's actual text content, so
   * there is nothing locale-specific left for this function to decide.
   */
  locale?: VerticalDramaSeriesLocale;
}

function asPlainRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asPlainArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function asFiniteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function asNonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function roundTo(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

type DensityStoryboardShot = {
  shotNumber: number;
  durationSeconds: number;
  emotion: string | null;
  dialogueExcerpt: string | null;
};

/** Sorted ascending by `shot_number` (falls back to `shotNumber`) for deterministic ordering regardless of input array order. */
function deriveShotsFromStoryboard(
  storyboard: Record<string, unknown> | null | undefined,
): DensityStoryboardShot[] {
  const shotsRaw = asPlainArray(asPlainRecord(storyboard)?.shots);
  const shots: DensityStoryboardShot[] = [];
  for (const raw of shotsRaw) {
    const shot = asPlainRecord(raw);
    if (!shot) continue;
    const shotNumber = asFiniteNumber(shot.shot_number) ?? asFiniteNumber(shot.shotNumber);
    if (shotNumber === null) continue;
    const durationSeconds =
      asFiniteNumber(shot.duration_seconds) ?? asFiniteNumber(shot.durationSeconds) ?? 0;
    shots.push({
      shotNumber,
      durationSeconds,
      emotion: asNonEmptyString(shot.emotion),
      dialogueExcerpt:
        asNonEmptyString(shot.dialogue_excerpt) ?? asNonEmptyString(shot.dialogueExcerpt),
    });
  }
  return shots.sort((a, b) => a.shotNumber - b.shotNumber);
}

/** Keyed by `${shotNumber}:${clipNumber ?? "main"}` so a clip with no sub-shot/clip number lines up with a plain storyboard shot. */
function deriveDialogueLinesByClipKey(
  dialoguePlan: Record<string, unknown> | null | undefined,
): Map<string, VerticalDramaDialogueQualityLine[]> {
  const record = asPlainRecord(dialoguePlan);
  const camelLines = asPlainArray(record?.dialogueLines);
  const linesRaw = camelLines.length > 0 ? camelLines : asPlainArray(record?.dialogue_lines);

  const byKey = new Map<string, VerticalDramaDialogueQualityLine[]>();
  for (const raw of linesRaw) {
    const line = asPlainRecord(raw);
    if (!line) continue;
    const shotNumber = asFiniteNumber(line.shotNumber) ?? asFiniteNumber(line.shot_number);
    if (shotNumber === null) continue;
    const clipNumber = asFiniteNumber(line.clipNumber) ?? asFiniteNumber(line.clip_number);
    const text =
      asNonEmptyString(line.text) ??
      asNonEmptyString(line.line) ??
      asNonEmptyString(line.lineTh) ??
      asNonEmptyString(line.line_th) ??
      "";
    const key = `${shotNumber}:${clipNumber ?? "main"}`;
    const bucket = byKey.get(key);
    if (bucket) bucket.push({ lineTh: text });
    else byKey.set(key, [{ lineTh: text }]);
  }
  return byKey;
}

/**
 * Builds the shared analyzer's `VerticalDramaDialogueClipQualityInput[]` from
 * whatever combination of `clipDurations` / `storyboard` / `dialoguePlan` the
 * caller supplied. When no dialogue-plan line exists for a clip, falls back
 * to the storyboard shot's own `dialogue_excerpt` string as a single
 * `origin: "script_fallback"` line (spec §7.7.2 Layer 4's existing legacy-path
 * vocabulary) — never invents dialogue that was not authored somewhere.
 */
function buildDensityClipInputs(
  params: ComputeVerticalDramaDensityMetricsParams,
): VerticalDramaDialogueClipQualityInput[] {
  const storyboardShots = deriveShotsFromStoryboard(params.storyboard);
  const dialogueLinesByKey = deriveDialogueLinesByClipKey(params.dialoguePlan);

  const baseClips: Array<{ shotNumber?: number; clipNumber?: number; durationSeconds: number }> =
    params.clipDurations && params.clipDurations.length > 0
      ? params.clipDurations.map((clip) => ({
          shotNumber: clip.shotNumber,
          clipNumber: clip.clipNumber,
          durationSeconds: clip.durationSeconds,
        }))
      : storyboardShots.map((shot) => ({
          shotNumber: shot.shotNumber,
          durationSeconds: shot.durationSeconds,
        }));

  return baseClips.map((clip) => {
    const key = `${clip.shotNumber ?? "?"}:${clip.clipNumber ?? "main"}`;
    let dialogue = dialogueLinesByKey.get(key);
    if ((!dialogue || dialogue.length === 0) && clip.shotNumber !== undefined) {
      const shot = storyboardShots.find((s) => s.shotNumber === clip.shotNumber);
      if (shot?.dialogueExcerpt) {
        dialogue = [{ lineTh: shot.dialogueExcerpt, origin: "script_fallback" }];
      }
    }
    return {
      shotNumber: clip.shotNumber,
      clipNumber: clip.clipNumber,
      durationSeconds: clip.durationSeconds,
      dialogue,
    };
  });
}

function countReversalsFromScript(script: Record<string, unknown> | null | undefined): number {
  const structure = asPlainRecord(asPlainRecord(script)?.structure);
  const beats = asPlainArray(structure?.beats);
  let count = 0;
  for (const raw of beats) {
    const beat = asPlainRecord(raw);
    if (beat?.is_reversal === true) count += 1;
  }
  return count;
}

/**
 * Longest run of consecutive storyboard shots (in `shot_number` order)
 * sharing the exact same non-empty `emotion` value — matching the skill's own
 * flagging rule ("the same emotion value on 3+ consecutive shots is a flat
 * storyboard"). A single shot with a defined emotion trivially forms a run of
 * 1 (the healthy baseline for a fully-varied storyboard); 0 only when no shot
 * has an emotion at all.
 */
function maxConsecutiveSameEmotion(shots: DensityStoryboardShot[]): number {
  let max = 0;
  let current = 0;
  let previous: string | null = null;
  for (const shot of shots) {
    current = shot.emotion && shot.emotion === previous ? current + 1 : shot.emotion ? 1 : 0;
    previous = shot.emotion;
    if (current > max) max = current;
  }
  return max;
}

/**
 * Deterministic density-metrics block (spec §16.1 rule 1 / §7.7.1) — built
 * ONLY from `@shared/verticalDramaSeries/dialogueQuality`'s exported analyzers
 * plus simple counting on top of their output. No LLM call, no re-declared
 * speech-rate/coverage constants (spec §7.7.4's "every layer uses
 * `dialogueQuality.ts` — no duplicate estimator exists").
 */
export function computeVerticalDramaDensityMetrics(
  params: ComputeVerticalDramaDensityMetricsParams,
): VerticalDramaDensityMetrics {
  const clips = buildDensityClipInputs(params);
  const episodeQuality = analyzeVerticalDramaEpisodeDialogueQuality(clips);

  const clipsEvaluated = episodeQuality.clips.length;
  const clipsBelowMinRatio = episodeQuality.clips.filter((clip) =>
    clip.issues.some((issue) => issue.code === "VD_DIALOGUE_UNDERFILLED"),
  ).length;
  const clipsBelowErrorRatio = episodeQuality.clips.filter((clip) =>
    clip.issues.some(
      (issue) => issue.code === "VD_DIALOGUE_UNDERFILLED" && issue.severity === "error",
    ),
  ).length;
  const averageCoverageRatio =
    clipsEvaluated > 0
      ? roundTo(
          episodeQuality.clips.reduce((sum, clip) => sum + clip.coverageRatio, 0) / clipsEvaluated,
          4,
        )
      : 0;

  const duplicateLineCount = episodeQuality.issues.filter(
    (issue) => issue.code === "VD_DIALOGUE_DUPLICATE",
  ).length;

  const stageDirectionCount = clips.reduce(
    (sum, clip) =>
      sum + (clip.dialogue ?? []).filter((line) => hasVerticalDramaStageDirectionDialogue(line.lineTh ?? "")).length,
    0,
  );

  const silentGapCount = clips.reduce(
    (sum, clip) =>
      sum + (analyzeVerticalDramaClipSilence(clip.dialogue, clip.durationSeconds).exceedsLimit ? 1 : 0),
    0,
  );

  return {
    estimated_speech_seconds: roundTo(episodeQuality.totalSpeechSeconds, 2),
    per_clip_coverage: {
      clips_evaluated: clipsEvaluated,
      clips_below_min_ratio: clipsBelowMinRatio,
      clips_below_error_ratio: clipsBelowErrorRatio,
      average_coverage_ratio: averageCoverageRatio,
    },
    silent_gap_count: silentGapCount,
    duplicate_line_count: duplicateLineCount,
    stage_direction_count: stageDirectionCount,
    reversal_count: countReversalsFromScript(params.script),
    max_consecutive_same_emotion: maxConsecutiveSameEmotion(deriveShotsFromStoryboard(params.storyboard)),
  };
}

/* -------------------------------------------------------------------------- */
/* Prompt building                                                            */
/* -------------------------------------------------------------------------- */

export interface RunEpisodeQualityReviewParams {
  userId: number;
  tenantId?: string;
  seriesId: number;
  episodeId: number;
  episodeTitle: string;
  locale: VerticalDramaSeriesLocale;
  /** Raw (or relevant-subset) output of `vertical-drama-script-builder`. */
  script: Record<string, unknown>;
  /** Raw (or relevant-subset) output of `vertical-drama-storyboard-shotgrid`. */
  storyboard: Record<string, unknown>;
  /** Optional raw (or relevant-subset) output of `vertical-drama-dialogue-audio-planner`. */
  dialoguePlan?: Record<string, unknown> | null;
  /**
   * When set together with `previousIssues`, instructs the LLM to propose
   * substantively DIFFERENT alternative issues/suggested fixes than the
   * previous review — the "ตรวจใหม่ แนะนำแนวทางอื่น" ("re-review, suggest a
   * different approach") loop the storyboard quality-review UI offers after
   * the user has already seen one set of suggestions and wants alternatives
   * instead of applying them. Ignored (no effect on the prompt) if
   * `previousIssues` is empty/absent.
   */
  avoidPrevious?: boolean;
  /** The previous review's `issues[]` — only consulted when `avoidPrevious` is set. */
  previousIssues?: Array<{ location: string; problem: string; suggested_fix: string }>;
  /** Forwarded to `deductCredits` so a retried request doesn't double-charge. */
  idempotencyKey?: string;
  /**
   * Deterministic density facts (spec §16.1 rule 1 — see
   * `computeVerticalDramaDensityMetrics`). When supplied: (1) injected into
   * the prompt with an instruction to echo them back verbatim and switch to
   * `contract_version: 2`, and (2) force-overwritten onto the parsed LLM
   * output afterward regardless of what the LLM actually returned for this
   * field — the LLM never gets the final say on these numbers. Omitted
   * (default) reproduces exact v1 behavior.
   */
  densityMetrics?: VerticalDramaDensityMetrics;
  /**
   * Tie-in QC passthrough (spec §13.1/§16.1) — forwarded into the prompt
   * as-is (`{ enabled: boolean, ...}`) so the skill can judge
   * `scorecard.tie_in_naturalness` / `tie_in_assessment`. Omitted (default)
   * reproduces exact v1 behavior (`tie_in_naturalness` stays absent/null).
   */
  tieInConfig?: { enabled: boolean } & Record<string, unknown>;
  /**
   * W11.6 "Story Lock" (added 2026-07-08). Omitted (default) reproduces
   * exact prior prompt text unchanged. When `"execution"` (only ever set by
   * a caller for an episode whose tenant has `verticalDramaSeriesStoryLock`
   * on), the prompt instructs the LLM that every `issues[].suggested_fix`
   * must stay execution-level (wording/delivery, acting/emotion, camera/
   * composition, movement/transition, ambient scene dressing) and must never
   * propose a story change (events, beats, reversals, hook/cliffhanger
   * meaning, new plot content) — the story dimensions
   * (`reversal_count`/`reversal_sharpness`/`hook_strength`/
   * `cliffhanger_strength`/`continuity_consistency`, see
   * `@shared/verticalDramaSeries/qualityPolicy`'s `VD_STORY_DIMENSIONS`)
   * are still SCORED as usual — only the repair suggestions this review
   * proposes are constrained. This is a prompt-level nudge only; the
   * mechanical enforcement is the deterministic post-repair guard in
   * `verticalDramaQualityReviewApply.ts`.
   */
  reviewMode?: "execution";
}

/**
 * Conservative fixed pre-check estimate (credits) for this skill's LLM call.
 * The real cost (computed from actual token usage after the call returns) is
 * almost always lower than this — it exists only to reject an
 * obviously-can't-afford-it request BEFORE spending the LLM call, the same
 * role the sibling Vertical Drama generation services' `hasEnoughCredits(...,
 * 1)` pre-checks play for them. None of those siblings compute a real
 * pre-call estimate either (there is no token count yet to estimate from —
 * the prompt is built from arbitrary-sized script/storyboard JSON), so a
 * fixed constant sized for this skill's typical worst-case token usage is
 * used instead of the too-permissive `1`.
 */
const QUALITY_REVIEW_ESTIMATED_CREDIT_COST = 20;

function buildUserPrompt(params: RunEpisodeQualityReviewParams): string {
  const langInstruction =
    params.locale === "th"
      ? "Write summary/problem/suggested_fix in natural Thai."
      : `Write summary/problem/suggested_fix in natural ${verticalDramaLocaleEnglishName(params.locale)}.`;

  const avoidPreviousInstruction =
    params.avoidPrevious && params.previousIssues && params.previousIssues.length > 0
      ? [
          "The user already saw the following previous review issues/suggested fixes and",
          "explicitly asked for a DIFFERENT set of alternative improvements — do NOT repeat",
          "these same issues or rephrase the same suggested fixes; propose substantively",
          "different problems and/or different fix approaches (still grounded in the actual",
          "script/storyboard content, still citing real shot/beat numbers):",
          JSON.stringify(params.previousIssues),
        ].join("\n")
      : null;

  // v2 superset (spec §16.1) — both segments are `null` (and therefore
  // dropped by `.filter(Boolean)` below) whenever the caller supplies
  // neither `densityMetrics` nor `tieInConfig`, which is exactly what keeps
  // this prompt byte-identical to v1 by default.
  const densityMetricsInstruction = params.densityMetrics
    ? [
        `density_metrics:\n${JSON.stringify(params.densityMetrics)}`,
        "The density_metrics object above was computed deterministically in code from the",
        "canonical speech-budget module — echo it back VERBATIM as the output's top-level",
        "density_metrics; never recompute, round differently, or second-guess any of its numbers.",
      ].join("\n")
    : null;

  const tieInConfigInstruction = params.tieInConfig
    ? `tie_in_config:\n${JSON.stringify(params.tieInConfig)}`
    : null;

  // W11.6 "Story Lock" (spec owner directive) — `null` (dropped below) unless
  // the caller explicitly opts in, which keeps every existing call site's
  // prompt byte-identical by default.
  const executionModeInstruction =
    params.reviewMode === "execution"
      ? [
          "STORY LOCK MODE: the story is finalized (locked) at the series level —",
          "every issues[].suggested_fix you propose must stay execution-level only:",
          "dialogue wording/delivery, acting/emotion, camera/composition,",
          "movement/transition, and ambient scene dressing. NEVER suggest a fix that",
          "changes events, beat order, reversal count/position, plot threads, or the",
          "meaning of the hook/cliffhanger — those are locked. Still SCORE every",
          "dimension (including reversal_count, reversal_sharpness, hook_strength,",
          "cliffhanger_strength, continuity_consistency) normally; only the",
          "suggested_fix wording of each issue is constrained to execution-only.",
        ].join(" ")
      : null;

  const contractVersion2Instruction =
    params.densityMetrics || params.tieInConfig
      ? [
          'Set "contract_version": 2 in your output and additionally score hook_strength,',
          "cliffhanger_strength, and continuity_consistency (1-5 each).",
          params.tieInConfig?.enabled
            ? "Also score tie_in_naturalness (1-5) and include tie_in_assessment, per your instructions."
            : "",
        ]
          .filter(Boolean)
          .join(" ")
      : null;

  return [
    `episode_title: ${params.episodeTitle}`,
    langInstruction,
    `script:\n${JSON.stringify(params.script)}`,
    `storyboard:\n${JSON.stringify(params.storyboard)}`,
    params.dialoguePlan
      ? `dialogue_plan:\n${JSON.stringify(params.dialoguePlan)}`
      : "dialogue_plan: (not provided — score dialogue_naturalness as null)",
    densityMetricsInstruction,
    tieInConfigInstruction,
    contractVersion2Instruction,
    executionModeInstruction,
    avoidPreviousInstruction,
    VD_COMPACT_JSON_INSTRUCTION,
  ]
    .filter(Boolean)
    .join("\n\n");
}

/* -------------------------------------------------------------------------- */
/* Generation entry point                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Run the `vertical-drama-episode-quality-review` skill via a direct
 * `executeWithFallback` LLM call. Credit-gated (throws
 * `InsufficientCreditsError` before calling out) and schema-validated
 * (throws `VdSchemaValidationError` on a malformed LLM response) — mirrors
 * `generateEpisodeScript`'s check-credits -> call -> deduct-credits
 * convention. Called from `server/routers/verticalDramaEpisodes.ts`'s
 * `runEpisodeQualityReview` / `applyQualityReviewSuggestions` procedures (see
 * the file-level doc comment for the v2 superset behavior).
 */
export async function runVerticalDramaEpisodeQualityReview(
  params: RunEpisodeQualityReviewParams
): Promise<{
  review: EpisodeQualityReviewOutput;
  creditsUsed: number;
  model: string;
}> {
  const rateLimitKey = `user:${params.userId}`;
  if (!mediaGenerationLimiter.isAllowed(rateLimitKey)) {
    throw new RateLimitExceededError(
      mediaGenerationLimiter.getResetTime(rateLimitKey)
    );
  }

  const hasCredits = await hasEnoughCredits(
    params.userId,
    QUALITY_REVIEW_ESTIMATED_CREDIT_COST,
  );
  if (!hasCredits) {
    throw new InsufficientCreditsError();
  }

  const model = await resolveStoryBibleModel();
  const systemPrompt = loadSkillSystemPrompt();
  const userPrompt = buildUserPrompt(params);

  // Small, bounded output (a fixed-shape scorecard + a handful of issues) —
  // base ceiling raised only modestly (3000 -> 4000) versus the multi-shot
  // generators, but still gets the same shared one-retry-on-truncated/
  // invalid-JSON safety net for consistency across every Vertical Drama
  // planning call site.
  const { data: validatedData, response } = await executeJsonPlanningCallWithRetry({
    model,
    systemPrompt,
    userPrompt,
    temperature: 0.4,
    userId: params.userId,
    maxTokens: 4000,
    schema: episodeQualityReviewOutputSchema,
    label: "Episode quality review",
  });

  // Spec §16.1 rule 1 — enforce in code: the LLM never gets the final say on
  // deterministic density facts. Whatever `validatedData.density_metrics`
  // parsed to (LLM-authored, possibly absent/wrong) is unconditionally
  // replaced with the caller-supplied, code-computed value. A shallow+one-
  // level clone (not a reference share) so the caller's object can't be
  // mutated later through the returned review.
  if (params.densityMetrics) {
    validatedData.density_metrics = {
      ...params.densityMetrics,
      per_clip_coverage: { ...params.densityMetrics.per_clip_coverage },
    };
  }

  const usage = response.usage;
  const creditsUsed = calculateCreditsForLLM(
    usage?.prompt_tokens ?? 0,
    usage?.completion_tokens ?? 0,
    model
  );

  // The LLM cost is already sunk by this point — a failure deducting credits
  // must not turn into a 500 that discards an otherwise-valid review the
  // caller already paid provider cost for. Log for manual reconciliation
  // instead of bubbling the raw error.
  try {
    await deductCredits({
      userId: params.userId,
      tenantId: params.tenantId,
      amount: creditsUsed,
      description: `Vertical Drama — episode quality review (episode #${params.episodeId})`,
      sourceType: "skill",
      idempotencyKey: params.idempotencyKey,
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
  } catch (err) {
    debugError(
      "verticalDramaEpisodeQualityReview",
      `deductCredits failed after a successful review (userId=${params.userId}, episodeId=${params.episodeId}, creditsUsed=${creditsUsed}) — needs manual reconciliation`,
      err,
    );
  }

  return { review: validatedData, creditsUsed, model };
}
