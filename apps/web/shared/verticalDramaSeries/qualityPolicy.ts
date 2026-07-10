/**
 * Vertical Drama Series — episode quality policy, floor evaluation, and
 * auto-improve loop state contracts (spec §16.1, added 2026-07-07;
 * section-14-script-quality-qc-auto-improve).
 *
 * Pure, deterministic, provider-free contracts + helpers — no server/db
 * imports, safe for both client and server. This module owns policy
 * resolution and pass/fail floor math only; the full quality scorecard
 * schema (all dimensions, `issues[]`, `density_metrics`, etc.) is owned by
 * `server/services/verticalDramaEpisodeQualityReview.ts`. The narrow
 * `VerticalDramaQualityScorecardDimensions` type below intentionally mirrors
 * only the numeric-dimension field names that service already ships
 * (snake_case, matching the LLM/skill JSON output convention) so a future
 * caller can pass its scorecard straight through without remapping keys.
 */

import { z } from "zod";
import type { VerticalDramaPipelineStage } from "./contracts";

/* -------------------------------------------------------------------------- */
/* Quality policy (spec §16.1)                                                */
/* -------------------------------------------------------------------------- */

export type VerticalDramaQualityPolicy = {
  /** Default 4 (of 5). */
  minOverall: number;
  /** Default 3 (of 5). */
  minPerDimension: number;
  /** Default 70 (of 100, spec §13.1); regulated categories may only RAISE it. */
  tieInMinNaturalnessScore: number;
  /** Default 2, allowed 0-3; 0 = manual apply only (no auto loop). */
  maxAutoImproveRounds: number;
  /** Default true in guided mode — the review scores script + storyboard together. */
  autoRunReviewAfterStoryboard: boolean;
  /** Default true in guided mode, false in expert mode. */
  blockPaidGenerationBelowFloor: boolean;
  /** Feature 132 multi-pass season QC opt-in. Default false preserves the legacy single-pass critique. */
  multiPass: boolean;
};

export const VERTICAL_DRAMA_QUALITY_POLICY_DEFAULTS: VerticalDramaQualityPolicy =
  {
    minOverall: 4,
    minPerDimension: 3,
    tieInMinNaturalnessScore: 70,
    maxAutoImproveRounds: 2,
    autoRunReviewAfterStoryboard: true,
    blockPaidGenerationBelowFloor: true,
    multiPass: false,
  };

const MAX_AUTO_IMPROVE_ROUNDS_FLOOR = 0;
const MAX_AUTO_IMPROVE_ROUNDS_CEILING = 3;

/**
 * Superset-friendly — persists as the nullable `qualityPolicy` jsonb column
 * on `vertical_drama_series` (and an optional copy on
 * `vertical_drama_genre_presets`, stamped onto the series at create/apply
 * time). Every field carries its spec default so parsing `{}` yields the
 * full built-in-defaults policy.
 */
export const verticalDramaQualityPolicySchema = z
  .object({
    minOverall: z
      .number()
      .min(0)
      .max(5)
      .default(VERTICAL_DRAMA_QUALITY_POLICY_DEFAULTS.minOverall),
    minPerDimension: z
      .number()
      .min(0)
      .max(5)
      .default(VERTICAL_DRAMA_QUALITY_POLICY_DEFAULTS.minPerDimension),
    tieInMinNaturalnessScore: z
      .number()
      .min(0)
      .max(100)
      .default(VERTICAL_DRAMA_QUALITY_POLICY_DEFAULTS.tieInMinNaturalnessScore),
    maxAutoImproveRounds: z
      .number()
      .int()
      .min(MAX_AUTO_IMPROVE_ROUNDS_FLOOR)
      .max(MAX_AUTO_IMPROVE_ROUNDS_CEILING)
      .default(VERTICAL_DRAMA_QUALITY_POLICY_DEFAULTS.maxAutoImproveRounds),
    autoRunReviewAfterStoryboard: z
      .boolean()
      .default(
        VERTICAL_DRAMA_QUALITY_POLICY_DEFAULTS.autoRunReviewAfterStoryboard
      ),
    blockPaidGenerationBelowFloor: z
      .boolean()
      .default(
        VERTICAL_DRAMA_QUALITY_POLICY_DEFAULTS.blockPaidGenerationBelowFloor
      ),
    multiPass: z
      .boolean()
      .default(VERTICAL_DRAMA_QUALITY_POLICY_DEFAULTS.multiPass),
  })
  .passthrough();

/** Nullable-column convenience — the stored `qualityPolicy` jsonb value itself may be null. */
export const verticalDramaQualityPolicyColumnSchema =
  verticalDramaQualityPolicySchema.nullable();

/**
 * Resolves the effective policy via the pinned chain (spec §16.1 / section-02):
 * series column -> tenant default -> built-in defaults, merged FIELD BY FIELD
 * (a field present at a more specific layer always wins, independent of its
 * sibling fields). A preset-carried policy is a separate write-time concern
 * (stamped onto the series column at create/apply) — by the time this merge
 * runs, that has already become `seriesPolicy`, so this function only ever
 * needs the two override layers below the built-in defaults.
 *
 * `maxAutoImproveRounds` is defensively re-clamped to 0-3 after the merge,
 * regardless of layer, so this function can never emit an out-of-range loop
 * bound even if a stored value predates a range change.
 */
export function resolveQualityPolicy(
  seriesPolicy?: Partial<VerticalDramaQualityPolicy> | null,
  tenantPolicy?: Partial<VerticalDramaQualityPolicy> | null
): VerticalDramaQualityPolicy {
  const merged: VerticalDramaQualityPolicy = {
    ...VERTICAL_DRAMA_QUALITY_POLICY_DEFAULTS,
    ...(tenantPolicy ?? {}),
    ...(seriesPolicy ?? {}),
  };

  return {
    ...merged,
    maxAutoImproveRounds: Math.min(
      MAX_AUTO_IMPROVE_ROUNDS_CEILING,
      Math.max(MAX_AUTO_IMPROVE_ROUNDS_FLOOR, merged.maxAutoImproveRounds)
    ),
  };
}

/* -------------------------------------------------------------------------- */
/* Scorecard floor evaluation (spec §16.1)                                    */
/* -------------------------------------------------------------------------- */

/**
 * The numeric-dimension subset of the (v1 or v2) quality scorecard needed to
 * evaluate policy floors. Field names match
 * `verticalDramaEpisodeQualityReview.ts`'s shipped scorecard JSON verbatim
 * (snake_case). v1 scorecards simply omit the v2-only fields (`hook_strength`
 * etc.), which is indistinguishable from `undefined` here — both are treated
 * as "not present, cannot fail". `dialogue_naturalness` and
 * `tie_in_naturalness` are explicitly nullable per spec (null when not
 * judged / tie-in disabled).
 */
export type VerticalDramaQualityScorecardDimensions = {
  overall: number;
  reversal_sharpness?: number | null;
  emotion_variety?: number | null;
  dialogue_naturalness?: number | null;
  pacing?: number | null;
  hook_strength?: number | null;
  cliffhanger_strength?: number | null;
  continuity_consistency?: number | null;
  tie_in_naturalness?: number | null;
  clarity?: number | null;
  character_consistency?: number | null;
  evidence_payoff?: number | null;
  threat_escalation?: number | null;
};

export type VerticalDramaQualityScorecardEvaluation = {
  passed: boolean;
  failingDimensions: string[];
};

/**
 * Evaluates a scorecard against policy floors (spec §16.1): `overall` must
 * meet `minOverall`; every PRESENT per-dimension score must meet
 * `minPerDimension`. A `null` or absent dimension never fails — it simply
 * was not judged (v1 scorecard, or tie-in/hook dimensions not applicable) —
 * matching the shipped v1 semantic that a missing dimension is not an
 * automatic failure.
 */
export function evaluateScorecardAgainstPolicy(
  scorecard: VerticalDramaQualityScorecardDimensions,
  policy: VerticalDramaQualityPolicy
): VerticalDramaQualityScorecardEvaluation {
  const failingDimensions: string[] = [];

  if (scorecard.overall < policy.minOverall) {
    failingDimensions.push("overall");
  }

  const perDimensionEntries: Array<[string, number | null | undefined]> = [
    ["reversal_sharpness", scorecard.reversal_sharpness],
    ["emotion_variety", scorecard.emotion_variety],
    ["dialogue_naturalness", scorecard.dialogue_naturalness],
    ["pacing", scorecard.pacing],
    ["hook_strength", scorecard.hook_strength],
    ["cliffhanger_strength", scorecard.cliffhanger_strength],
    ["continuity_consistency", scorecard.continuity_consistency],
    ["tie_in_naturalness", scorecard.tie_in_naturalness],
    ["clarity", scorecard.clarity],
    ["character_consistency", scorecard.character_consistency],
    ["evidence_payoff", scorecard.evidence_payoff],
    ["threat_escalation", scorecard.threat_escalation],
  ];

  for (const [dimension, value] of perDimensionEntries) {
    if (value === null || value === undefined) continue;
    if (value < policy.minPerDimension) {
      failingDimensions.push(dimension);
    }
  }

  return { passed: failingDimensions.length === 0, failingDimensions };
}

/* -------------------------------------------------------------------------- */
/* Story vs. execution dimension split (W11.6 "Story Lock", added 2026-07-08) */
/* -------------------------------------------------------------------------- */

/**
 * Owner principle: the STORY is finalized on the series Overview (season
 * arc/episode breakdown, arc re-plan). Episode-level improve/repair may only
 * ever change EXECUTION — dialogue wording/delivery, acting/emotion, camera/
 * composition, movement/transition, ambient scene dressing — and must NEVER
 * change the story itself (beats/events, reversals, hook/cliffhanger
 * meaning, plot-relevant locations, new story content).
 *
 * These two lists partition the scorecard's non-`overall`/non-
 * `tie_in_naturalness` dimensions (spec §16.1's scorecard v1+v2 union) into
 * "did the STORY score well" vs. "did the EXECUTION score well" — 5 + 3 = 8,
 * covering every dimension `VerticalDramaQualityScorecardDimensions` and the
 * wider LLM scorecard (`server/services/verticalDramaEpisodeQualityReview.ts`'s
 * `qualityReviewScorecardSchema`) carry except `overall` (an aggregate of
 * both) and `tie_in_naturalness` (a separate product-placement axis, neither
 * story nor execution). `reversal_count` is a deterministic COUNT (not a 1-5
 * LLM judgment — see `computeVerticalDramaDensityMetrics`'s
 * `reversal_count`/the LLM scorecard's own `reversal_count` field), included
 * here because "how many reversals exist" is a story-structure fact, not an
 * execution one.
 *
 * Mapping onto the shipped scorecard field names verbatim (snake_case, no
 * remapping needed by any caller):
 *  - story:     reversal_count, reversal_sharpness, hook_strength,
 *               cliffhanger_strength, continuity_consistency
 *  - execution: dialogue_naturalness, emotion_variety, pacing
 *
 * Used by the client (`VerticalDramaStoryboardPanel.tsx`'s `QualityReviewCard`
 * split) to render story dims read-only ("ตัดสินที่หน้าภาพรวมแล้ว") separately
 * from the actionable execution dims + loop CTA, and can also be consulted by
 * a future server-side wave that wants to reason about "story" vs.
 * "execution" scoring without re-deriving the split.
 */
export const VD_STORY_DIMENSIONS = [
  "reversal_count",
  "reversal_sharpness",
  "hook_strength",
  "cliffhanger_strength",
  "continuity_consistency",
] as const;

export type VerticalDramaStoryDimension = (typeof VD_STORY_DIMENSIONS)[number];

export const VD_EXECUTION_DIMENSIONS = [
  "dialogue_naturalness",
  "emotion_variety",
  "pacing",
] as const;

export type VerticalDramaExecutionDimension =
  (typeof VD_EXECUTION_DIMENSIONS)[number];

/* -------------------------------------------------------------------------- */
/* Auto-improve loop state (spec §16.1)                                       */
/* -------------------------------------------------------------------------- */

export const VERTICAL_DRAMA_QUALITY_LOOP_STATUSES = [
  "idle",
  "running",
  "passed",
  "escalated_max_rounds",
  "escalated_regression",
] as const;

export type VerticalDramaQualityLoopStatus =
  (typeof VERTICAL_DRAMA_QUALITY_LOOP_STATUSES)[number];

/**
 * The four canonical repair groups the spec §16.1 auto-improve loop can
 * repair, in fixed order: `plan_episode_script` -> `storyboard_shotgrid` ->
 * `dialogue_audio_plan` -> `tie_in`. The first three are real
 * `VerticalDramaPipelineStage` members; `tie_in` is deliberately NOT a
 * pipeline stage — it is a cross-cutting rewrite scoped to tie-in-carrying
 * beats/lines/shots, not a pipeline execution stage (see
 * `server/services/verticalDramaQualityReviewApply.ts`'s header comment,
 * which defines the server-side twin `QualityReviewApplicableStageWithTieIn`
 * this type mirrors so the two never drift). Exported so
 * `VerticalDramaQualityLoopRound.stagesRepaired` below — and any other
 * caller needing the full 4-group union — has one shared, reusable name
 * instead of re-deriving `VerticalDramaPipelineStage | "tie_in"` locally or
 * casting around the mismatch (Wave-4B, 2026-07-07 — replaces
 * `verticalDramaQualityLoop.ts`'s former `as unknown as
 * VerticalDramaPipelineStage[]` cast at its one call site).
 */
export type VerticalDramaQualityRepairGroup =
  | VerticalDramaPipelineStage
  | "tie_in";

/** One review -> group -> repair -> re-review round (spec §16.1). */
export type VerticalDramaQualityLoopRound = {
  /** 1-based. */
  round: number;
  reviewArtifactId: string;
  /**
   * Widened (Wave-4B, 2026-07-07) from `VerticalDramaPipelineStage[]` to
   * `VerticalDramaQualityRepairGroup[]` so a round that repaired the
   * `tie_in` group type-checks without a cast. Runtime/persistence shape is
   * UNCHANGED — `verticalDramaQualityLoopRoundSchema` below already accepted
   * any non-empty string per element, so every previously-valid value
   * (including the literal `"tie_in"`) parses exactly as before; only the
   * compile-time TS type became more precise.
   */
  stagesRepaired: VerticalDramaQualityRepairGroup[];
  reReviewArtifactId: string;
  overallBefore: number;
  overallAfter: number;
};

export const verticalDramaQualityLoopRoundSchema = z
  .object({
    round: z.number().int().positive(),
    reviewArtifactId: z.string().min(1),
    stagesRepaired: z.array(z.string().min(1)),
    reReviewArtifactId: z.string().min(1),
    overallBefore: z.number(),
    overallAfter: z.number(),
  })
  .passthrough();

export type VerticalDramaQualityLoopState = {
  episodeId: string;
  rounds: VerticalDramaQualityLoopRound[];
  status: VerticalDramaQualityLoopStatus;
  /** The best-scoring surviving review (never the worse one after a regression). */
  activeReviewArtifactId: string;
  /**
   * W11.6 "Story Lock" (added 2026-07-08) — tolerant/additive count of
   * repair rounds across this loop run whose `plan_episode_script` or
   * `storyboard_shotgrid` repair was REJECTED by the deterministic
   * post-repair story-lock guard (`verticalDramaQualityReviewApply.ts`'s
   * `evaluateVerticalDramaStoryLockScriptGuard`/
   * `evaluateVerticalDramaStoryLockStoryboardGuard`) because the repaired
   * content changed the STORY rather than only its execution — the prior
   * (pre-round) content is kept in that case, mirroring the existing
   * overall-score regression guard's "supersede, never delete" pattern.
   * `undefined`/absent whenever story lock is disabled for the episode OR
   * every round's repairs stayed execution-only (never violated) — kept
   * OPTIONAL specifically so every pre-existing persisted loop-state
   * artifact and every existing exact-shape test fixture (`toEqual({...})`
   * with no such key) keeps parsing/matching unchanged.
   */
  storyLockRejections?: number;
};

export const verticalDramaQualityLoopStateSchema = z
  .object({
    episodeId: z.string().min(1),
    rounds: z.array(verticalDramaQualityLoopRoundSchema),
    status: z.enum(VERTICAL_DRAMA_QUALITY_LOOP_STATUSES),
    activeReviewArtifactId: z.string().min(1),
    storyLockRejections: z.number().int().min(0).optional(),
  })
  .passthrough();
