/**
 * Vertical Drama Series — "Generate story" (spec feature 131 UI addendum).
 *
 * The FIRST real, credit-consuming LLM call in the vertical-drama surface —
 * every other series-level procedure (`create`/`updateSeries`) is explicitly
 * metadata-only/dry-run. Takes the wizard-gathered bible fields and expands
 * them into a fuller season arc + episode-by-episode breakdown + refined
 * character profiles, following the same credit-check -> call -> deduct
 * convention used by `enhancePrompt` in `server/routers/skills.ts`.
 */

import { randomUUID } from "crypto";
import { z } from "zod";
import { executeWithFallback } from "./llmRouter";
import {
  loadEnabledLlmModelRows,
  type EnabledLlmModelRow,
} from "./enabledLlmModels";
import { selectBestLlmModel } from "./intelligentModelSelector";
import {
  hasEnoughCredits,
  deductCredits,
  calculateCreditsForLLM,
} from "./creditService";
import { debugLog, debugError } from "../_core/logger";
import {
  verticalDramaLocaleEnglishName,
  type VerticalDramaSeriesLocale,
} from "@shared/verticalDramaSeries";
// Story-density reform (spec §7.7, section-13, added 2026-07-07) — imported
// DIRECTLY from the submodule (not the shared barrel) per section-13: this
// is the ONE canonical source for the content-budget/breakdown-versioning
// contracts and the ONE canonical speech-budget module, respectively. Never
// re-declare a rate/ratio/type from either module elsewhere.
import {
  verticalDramaEpisodeContentBudgetSchema,
  verticalDramaEpisodeBreakdownItemSchema as sharedStoredBreakdownItemSchema,
  verticalDramaBreakdownVersionSchema,
  deriveDefaultContentBudget,
  derivePerShotSpeechBudgets,
  VERTICAL_DRAMA_SILENCE_INTENTS,
  type VerticalDramaBreakdownVersionSource,
  type VerticalDramaEpisodeContentBudget,
  // Task #22 (season-level product tie-in draft awareness, spec §7.7.2/
  // §7.7.3, added 2026-07-09) — TYPE ONLY. The season-plan placement
  // decision shape itself lives entirely in `contentBudget.ts` (task #31);
  // this file only ever READS a placement (never plans/derives one — that
  // stays the router's job via `planSeasonTieInPlacements`, called from
  // `verticalDramaSeries.ts`, never from here).
  type VerticalDramaEpisodeTieInPlacement,
} from "@shared/verticalDramaSeries/contentBudget";
import {
  MIN_EPISODE_COVERAGE_RATIO,
  ERROR_EPISODE_COVERAGE_RATIO,
  analyzeVerticalDramaEpisodeDialogueQuality,
  analyzeVerticalDramaLineSpeakability,
  type VerticalDramaLineSpeakabilityViolation,
  type VerticalDramaLineSpeakabilityCleaned,
} from "@shared/verticalDramaSeries/dialogueQuality";
// Deep story drafts (W10-A, added 2026-07-08) — the per-shot speech band
// used in the deep-draft generation prompt AND its post-chunk coverage
// enforcement is derived from the canonical FIXED 60s/9-SHOT fallback
// duration profile (`vertical_drama_60s_9_shots`, 9 explicit shot
// durations summing to 60s) — distinct from the DEFAULT 9-frames/8-clips
// bridge profile `verticalDramaScriptGeneration.ts` uses for its own
// (pre-storyboard) speech_budget prompt section. Deep drafts are always
// literally 9 numbered shots (`shot_number` 1-9), so the 9-element profile
// is the correct match; never re-declare a duration array here.
import { VERTICAL_DRAMA_DURATION_PROFILE_FALLBACK } from "@shared/verticalDramaSeries/assembly";
// Format profiles (task #23, added 2026-07-08) — length-tier generation/
// critique/judge/tie-in knobs for a short/ultra-short planned episode count.
// Imported directly from the submodule (not the shared barrel), same
// convention as `contentBudget`/`dialogueQuality`/`assembly` above. See that
// module's own header for the ROLLOUT note: every consumer below is gated
// behind an OPTIONAL `formatProfilesEnabled` param that defaults to `false`
// (flag-pending — F131X is not registered yet), so omitting it anywhere is
// byte-identical to before this feature existed.
import {
  resolveVerticalDramaFormatProfile,
  type VerticalDramaFormatProfile,
} from "@shared/verticalDramaSeries/formatProfiles";
// Feature 132 §11 "Unified Criteria Application" (spec; plan
// `sections/section-01-shared-criteria-and-flags.md`) — every prompt builder
// in this file stamps the greppable criteria-version marker, tracked by
// `verticalDramaQualityCriteria.agreement.test.ts`.
import {
  renderCriteriaVersionMarker,
  getVerticalDramaQualityCriteriaBundle,
} from "./verticalDramaQualityCriteria";
// Feature 132 §4 (F132A, user-premise-preset-mix) — the deterministic,
// no-LLM premise-coverage guard, reused here at story-bible generation time.
// NOTE: `verticalDramaPresetSynthesis.ts` also imports FROM this file
// (`resolveStoryBibleModel`) — this is an intentional, already-established
// circular service pair; both exports here are only ever called from inside
// function bodies (never at module-evaluation time), so the cycle resolves
// safely at runtime.
import { evaluatePremiseCoverage } from "./verticalDramaPresetSynthesis";
// Feature 132 §5 (F132B, ledgers-and-story-state) — see
// `readBreakdownVersionLedgers`/`appendBreakdownVersion` below.
import {
  emptyQualityLedgers,
  type VerticalDramaQualityLedgers,
} from "@shared/verticalDramaSeries/qualityLedgers";

const LAST_RESORT_MODEL = "gpt-4o-mini";
const DEEP_STORY_DRAFT_MIN_CONTEXT_LENGTH = 1_000_000;

export async function resolveStoryBibleModel(): Promise<string> {
  try {
    const rows = await loadEnabledLlmModelRows();
    if (rows.length === 0) return LAST_RESORT_MODEL;
    const best = selectBestLlmModel({ supportsStructuredOutputs: true }, rows);
    return (
      best ??
      rows.sort((a, b) => a.priority - b.priority)[0]?.modelId ??
      LAST_RESORT_MODEL
    );
  } catch {
    return LAST_RESORT_MODEL;
  }
}

export async function resolveDeepStoryDraftModel(): Promise<string> {
  try {
    const rows = await loadEnabledLlmModelRows();
    if (rows.length === 0) return LAST_RESORT_MODEL;
    const best = selectBestLlmModel(
      {
        supportsThinking: true,
        supportsStructuredOutputs: true,
        supportsResponses: true,
        contextLength: DEEP_STORY_DRAFT_MIN_CONTEXT_LENGTH,
      },
      rows
    );
    return best ?? (await resolveStoryBibleModel());
  } catch {
    return resolveStoryBibleModel();
  }
}

/* -------------------------------------------------------------------------- */
/* Deep story drafts (W10-A, added 2026-07-08)                                */
/*                                                                            */
/* Chunked bible-stage generation: for EVERY planned episode, draft a full    */
/* 9-shot breakdown with speakable Thai dialogue, across multiple LLM calls   */
/* with real cross-chunk continuity. See `generateStoryBibleDeep` below.      */
/* -------------------------------------------------------------------------- */

/** Every deep-drafted episode carries exactly this many numbered shots. */
export const VD_DEEP_DRAFT_SHOTS_PER_EPISODE = 9;

/** Episodes covered per chunked LLM call (owner-approved chunk size). */
export const VD_DEEP_DRAFT_EPISODES_PER_CALL = 5;

/**
 * Premium fan-out asks for 3 long, judged candidates per chunk. Keep the
 * per-call JSON body smaller than standard mode so failures are driven by
 * true schema/content errors, not oversized structured-output truncation.
 */
export const VD_PREMIUM_DEEP_DRAFT_EPISODES_PER_CALL = 2;

/** Series with at most this many total episodes default to drafting ALL of them. */
export const VD_DEEP_DRAFT_HORIZON_ALL_THRESHOLD = 20;

/** Default horizon (in episodes) for a series LARGER than the threshold above. */
export const VD_DEEP_DRAFT_DEFAULT_HORIZON_FOR_LARGE_SERIES = 3;

/**
 * Per-call pre-check credit estimate — mirrors `generateStoryBible`'s own
 * `hasEnoughCredits(userId, 1)` placeholder pre-check (the REAL cost is
 * always computed per-call from actual token usage via
 * `calculateCreditsForLLM` and deducted after that call succeeds; this
 * constant only gates "does the caller have at least a plausible minimum"
 * BEFORE the first of possibly several chunk calls is made).
 */
export const VD_DEEP_DRAFT_PER_CALL_CREDIT_ESTIMATE = 1;

/** Default additional-episode count for `extendStoryDraftHorizon` when the caller omits one. */
export const VD_DEEP_DRAFT_EXTEND_DEFAULT_EPISODES = 5;

/**
 * A single speakable dialogue line within a deep-drafted shot. Field names
 * (snake_case `dialogue_lines[]`/`speaker`/`line`/`delivery`) intentionally
 * mirror `verticalDramaScriptGeneration.ts`'s existing `scriptDialogueLineSchema`
 * (spec §7.7.2 Layer 2) — this is the SAME dialogue-authoring shape brought
 * forward to bible stage, not a new convention.
 */
const shotDialogueLineSchema = z
  .object({
    speaker: z.string().min(1),
    line: z.string().min(1),
    delivery: z.string().optional(),
  })
  .passthrough();

/**
 * Task #22 (season-level product tie-in draft awareness, spec §7.7.2/§7.7.3,
 * added 2026-07-09) — marks ONE shot within a deep-drafted episode as the
 * shot that carries this episode's planned product tie-in moment. Optional/
 * additive on `shotDraftSchema` below — absent on every shot for a
 * non-tie-in-aware run (grandfather), so a legacy drafted episode/response
 * parses unchanged. `benefit_line` is the short, natural in-scene benefit the
 * shot's dialogue references (never ad-speak) — optional since a shot can be
 * marked `has_product_moment: true` on visual presence alone (e.g. a
 * `silence_intent` shot showing the product with no spoken line).
 */
const shotDraftTieInSchema = z
  .object({
    has_product_moment: z.boolean(),
    benefit_line: z.string().min(1).optional(),
  })
  .passthrough();

export type VdDeepDraftShotTieIn = z.infer<typeof shotDraftTieInSchema>;

/**
 * Feature 132 §6.1 (F132C, scene-contracts) — a per-shot story-function
 * contract, requested ONLY when `sceneContractsEnabled` is true (see
 * `buildDeepDraftPrompts`). Deliberately `newClueIds` has NO `.max()` at the
 * schema level — the ≤2 clue budget is enforced solely by the deterministic
 * gate (`meetsPremiumDraftContractFloor`/`validateStagePayload`), never a
 * schema-retry failure (spec §6.2, resolved open question).
 */
const shotContractSchema = z
  .object({
    storyFunction: z.string().min(1),
    emotionalBeat: z.string().min(1),
    audienceTakeaway: z.string().min(1),
    tensionSource: z.string().min(1),
    newClueIds: z.array(z.string().min(1)).default([]),
    dialoguePurpose: z.string().min(1),
    characterDecision: z.string().min(1).optional(),
    continuityDependency: z.string().min(1).optional(),
    anchorLine: z.boolean().optional(),
  })
  .passthrough();

export type VdSceneContract = z.infer<typeof shotContractSchema>;

/**
 * One of the 9 numbered shots in a deep-drafted episode. `silence_intent`
 * reuses the canonical enum from `contentBudget.ts` (spec §7.7.2 Layer 3) —
 * never re-declared here — for shots that are intentionally visual-only
 * (e.g. a bare animal/ambient sound must be a silence-intent shot, never a
 * dialogue line — see `enforceEpisodeShotDraftSpeakability` below).
 */
const shotDraftSchema = z
  .object({
    shot_number: z.number().int().min(1).max(VD_DEEP_DRAFT_SHOTS_PER_EPISODE),
    summary: z.string().min(1),
    dialogue_lines: z.array(shotDialogueLineSchema).default([]),
    // Phase A reliability fix (chronic bug, added 2026-07-09) — the model
    // frequently emits an explicit JSON `null` for this field on shots that
    // have no silence intent (instead of omitting the key), which
    // `.optional()` alone rejects (it only accepts `undefined`/absent),
    // failing schema validation on both the first attempt AND the schema
    // retry. `.nullish()` accepts `null` too, and the `.transform` normalizes
    // it to `undefined` so the persisted/returned shape never carries an
    // explicit `null` (every downstream read — e.g. `enforceEpisodeShotDraftSpeakability`,
    // `computeDraftCompleteness` — already treats `undefined` as "no silence intent").
    silence_intent: z
      .enum(VERTICAL_DRAMA_SILENCE_INTENTS)
      .nullish()
      .transform(v => v ?? undefined),
    /** Task #22 — see `shotDraftTieInSchema`'s own doc comment. */
    tie_in: shotDraftTieInSchema.optional(),
    /** Feature 132 §6.1 (F132C) — see `shotContractSchema`'s own doc comment. Absent on every shot from a flag-off/legacy response. */
    contract: shotContractSchema.optional(),
  })
  .passthrough();

/**
 * Deterministic per-item readiness summary (spec W10-A design point 3) —
 * computed by `computeDraftCompleteness` AFTER post-chunk speakability
 * enforcement, so the UI/hydration layer can read readiness without
 * recomputing the canonical estimator itself.
 */
const draftCompletenessSchema = z
  .object({
    dialogueEveryShot: z.boolean(),
    allSpeakable: z.boolean(),
    estimatedSpeechSeconds: z.number().nonnegative(),
    coverageStatus: z.enum(["ok", "warning", "error"]),
  })
  .passthrough();

export type VdDeepDraftShotDialogueLine = z.infer<
  typeof shotDialogueLineSchema
>;
export type VdDeepDraftShotDraft = z.infer<typeof shotDraftSchema>;
export type VdDeepDraftCompleteness = z.infer<typeof draftCompletenessSchema>;

export type VdDeepDraftWarning = {
  episodeNumber: number;
  shotNumber: number;
  /**
   * `"silence_intent_conflict"` (live-bug fix, added 2026-07-08) — a shot
   * carried BOTH an explicit `silence_intent` AND at least one usable
   * (post-cleaning) dialogue line; dialogue won and `silence_intent` was
   * stripped — see `enforceEpisodeShotDraftSpeakability`.
   * `"episode_missing_after_retry"` (live-bug fix, added 2026-07-08) — a
   * chunk's returned episode set was still missing this `episodeNumber`
   * after the ONE corrective retry `generateStoryBibleDeep`/`runPremiumChunk`
   * issue on a count mismatch; `shotNumber` is always `0` for this reason
   * (episode-level, not shot-level) — see `reconcileDeepDraftChunkEpisodes`.
   * `"tie_in_placement_mismatch"` (task #22, added 2026-07-09) — this
   * episode's SEASON-PLANNED tie-in placement (`VerticalDramaEpisodeTieInPlacement.planned`)
   * disagrees with what the drafted shots actually marked: a PLANNED episode
   * has NO shot with `tie_in.has_product_moment: true` (`shotNumber: 0`,
   * episode-level — no single shot to blame), or an UNPLANNED episode has
   * ONE anyway (`shotNumber` names the offending shot). See
   * `reconcileTieInDraftMarking` — deterministic, never fails the run.
   * `"premise_coverage_low"` (Feature 132 §4.2.7, F132A, added 2026-07-09) —
   * a season-level (`episodeNumber: 0`, `shotNumber: 0`) warning from
   * `evaluatePremiseCoverage` finding this run's drafted shots/open threads
   * don't sufficiently cover `params.userPremise`. Only ever present when
   * `userPremise` was supplied this run — see
   * `appendDeepDraftPremiseCoverageWarning`.
   */
  reason:
    | "nonverbal_line"
    | "empty_after_cleaning"
    | "silence_intent_conflict"
    | "episode_missing_after_retry"
    | "tie_in_placement_mismatch"
    | "premise_coverage_low";
};

/* -------------------------------------------------------------------------- */
/* Premium multi-round drafts — scorecard + process-metrics schemas           */
/* (W11-A, added 2026-07-08)                                                  */
/*                                                                            */
/* Declared early (ahead of `episodeBreakdownItemSchema` and                  */
/* `deepDraftMetadataSchema` further below, both of which reference these at  */
/* RUNTIME) so every later schema in this file can compose them. See the      */
/* "Premium multi-round generation pipeline" section near the end of this     */
/* file for the fan-out/judge/revise/sweep implementation that PRODUCES these */
/* shapes — this block only defines the shapes themselves.                    */
/* -------------------------------------------------------------------------- */

/** The judged dimensions, in prompt/response order (owner-approved design point 2c; Feature 132 scorecard v3 adds the last four). */
export const VD_PREMIUM_DRAFT_SCORE_DIMENSIONS = [
  "hook_strength",
  "reversal_sharpness",
  "emotion_variety",
  "dialogue_naturalness",
  "pacing",
  "cliffhanger_strength",
  "continuity_with_recap",
  "season_cohesion",
  "clarity",
  "character_consistency",
  "evidence_payoff",
  "threat_escalation",
] as const;

export type VdPremiumDraftScoreDimension =
  (typeof VD_PREMIUM_DRAFT_SCORE_DIMENSIONS)[number];

/**
 * Plain-object zod-shape (NOT a `ZodObject`) so it can be spread into several
 * response schemas in the pipeline section below (judge/re-judge responses,
 * the persisted scorecard) without re-typing the same 9 fields repeatedly.
 * Dimension names are DELIBERATELY distinct from `qualityPolicy.ts`'s
 * post-production `VerticalDramaQualityScorecardDimensions`
 * (`continuity_consistency`, no `season_cohesion`) — this is a SEPARATE,
 * bible-stage draft-quality judgment, not that later pipeline-stage review;
 * never imported from/into `qualityPolicy.ts`.
 */
const premiumScoreDimensionsShape = {
  hook_strength: z.number().min(1).max(5),
  reversal_sharpness: z.number().min(1).max(5),
  emotion_variety: z.number().min(1).max(5),
  dialogue_naturalness: z.number().min(1).max(5),
  pacing: z.number().min(1).max(5),
  cliffhanger_strength: z.number().min(1).max(5),
  continuity_with_recap: z.number().min(1).max(5),
  season_cohesion: z.number().min(1).max(5),
  clarity: z.number().min(1).max(5),
  character_consistency: z.number().min(1).max(5),
  evidence_payoff: z.number().min(1).max(5),
  threat_escalation: z.number().min(1).max(5),
  overall: z.number().min(1).max(5),
};

/**
 * Task #22 (season-level product tie-in draft awareness, added 2026-07-09) —
 * an OPTIONAL 9th judged dimension, scored ONLY for an episode carrying a
 * planned tie-in placement this run (see `VdTieInDraftContext`). Deliberately
 * kept OUT of `premiumScoreDimensionsShape`/`VD_PREMIUM_DRAFT_SCORE_DIMENSIONS`
 * above — those 8 core dimensions are scored for EVERY episode
 * unconditionally; this one is conditional, so it is threaded as its OWN
 * optional field everywhere a scorecard/score shape is built
 * (`meetsPremiumDraftFloor`/`scoreToScorecard`/`worstCasePremiumScorecard`/
 * `composePremiumScoreFeedback` below all treat it as "present -> also
 * floor-check/report it; absent -> ignore it entirely"), which keeps every
 * existing call site (none of which pass tie-in context) byte-identical.
 */
const premiumTieInNaturalnessShape = {
  tie_in_naturalness: z.number().min(1).max(5).optional(),
};

/** Sentinel `judgedAtRound` for a score last updated by the one-time season continuity sweep (distinct from the 1-2 per-chunk targeted-revise rounds; 0 = the initial fan-out judge pass). */
export const VD_PREMIUM_DRAFT_SWEEP_ROUND = 3;

/**
 * Persisted per-episode scorecard (owner-approved design point 4) — a
 * superset of `premiumScoreDimensionsShape` plus `judgedAtRound`.
 * `.passthrough()` (tolerant superset), matching every other stored-item
 * schema in this file.
 */
const draftScorecardSchema = z
  .object({
    ...premiumScoreDimensionsShape,
    // Feature 132 v3 dimensions are required for newly-produced premium
    // judge payloads, but optional while reading persisted scorecards so
    // older drafts can still be parsed and updated in-place by critique apply.
    clarity: premiumScoreDimensionsShape.clarity.optional(),
    character_consistency: premiumScoreDimensionsShape.character_consistency.optional(),
    evidence_payoff: premiumScoreDimensionsShape.evidence_payoff.optional(),
    threat_escalation: premiumScoreDimensionsShape.threat_escalation.optional(),
    ...premiumTieInNaturalnessShape,
    judgedAtRound: z.number().int().nonnegative(),
  })
  .passthrough();

export type VdPremiumDraftScorecard = z.infer<typeof draftScorecardSchema>;

/**
 * Per-version process metrics (owner-approved design point 4) — stamped onto
 * `StoredDeepDraftMetadata.premium` ONLY when that version was produced (in
 * whole or in part) by the premium pipeline; absent for every standard-mode
 * version, so existing/standard callers are unaffected (spec: "standard mode
 * + flag-off byte-identical").
 */
const vdPremiumDeepDraftMetricsSchema = z
  .object({
    mode: z.literal("premium"),
    candidateCount: z.number().int().positive(),
    roundsUsedPerChunk: z.array(z.number().int().nonnegative()),
    firstPassGatePassRate: z.number().min(0).max(1),
    episodesBelowFloorAfter: z.number().int().nonnegative(),
    sweepIssuesFound: z.number().int().nonnegative(),
    callsMade: z.number().int().nonnegative(),
  })
  .passthrough();

export type VdPremiumDeepDraftMetrics = z.infer<
  typeof vdPremiumDeepDraftMetricsSchema
>;

/**
 * Dramaturgy critic (W11.5, added 2026-07-08) — one named character's
 * decision recorded for a single episode (agency signal, see
 * `analyzeSeasonDramaturgy`'s `character_agency_zero_decisions` check further
 * below). Field names are literal per the owner-approved design, matching
 * this file's own `cliffhanger_line`-style snake_case convention for
 * LLM-facing JSON keys.
 */
const characterDecisionSchema = z
  .object({ character: z.string().min(1), decision: z.string().min(1) })
  .passthrough();

/**
 * Dramaturgy critic (W11.5) — one fantasy/world rule + its stated limit or
 * cost, requested ONCE (bible-level, stored on episode 1 — see
 * `buildDeepDraftPrompts`'s `includeBibleLevelFields` branch below).
 *
 * Feature 132 §5.2 (F132B, ledgers-and-story-state) upgrade-in-place: this
 * schema is widened, not narrowed, to also carry the richer world-rule-ledger
 * shape (`id`, `introducedEpisode`, `usedAgainEpisodes[]`, `createsChoice`,
 * `payoffEpisode?`, `verdict`) alongside the two legacy fields
 * (`rule`/`limit_or_cost`) `buildDeepDraftPrompts`'s CURRENT, unchanged
 * prompt still requests. Every §5.2 field is optional/defaulted and
 * `limit_or_cost` is now optional (was required) so a legacy
 * `{rule, limit_or_cost}`-only row (or today's unchanged LLM response, which
 * never emits the §5.2 fields) still parses without a migration — this is
 * the ONE non-purely-additive change in Feature 132 F132B, per that
 * section's own risk note.
 */
const worldRuleSchema = z
  .object({
    rule: z.string().min(1),
    limit_or_cost: z.string().min(1).optional(),
    /** §5.2 richer shape — all optional/defaulted for legacy-row back-compat (see doc comment above). */
    id: z.string().min(1).optional(),
    introducedEpisode: z.number().int().positive().optional(),
    usedAgainEpisodes: z.array(z.number().int().positive()).default([]),
    createsChoice: z.boolean().optional(),
    payoffEpisode: z.number().int().positive().optional(),
    verdict: z.enum(["keep", "revise"]).default("keep"),
  })
  .passthrough();

export type VdCharacterDecision = z.infer<typeof characterDecisionSchema>;
export type VdWorldRule = z.infer<typeof worldRuleSchema>;

export const episodeBreakdownItemSchema = z.object({
  episodeNumber: z.number().int().positive(),
  workingTitle: z.string().min(1),
  logline: z.string().min(1),
  keyBeats: z.array(z.string().min(1)).min(1),
  /**
   * Story-density reform (spec §7.7.2 Layer 1, section-13, added
   * 2026-07-07) — OPTIONAL so this schema still validates a flag-off LLM
   * response (byte-identical to before this change) and any legacy/partial
   * response that omits it. Only REQUESTED in the prompt (see
   * `buildPrompts`) when `opts.speechBudgetEnabled` is true; never
   * hard-required here, since a model that omits it should not fail the
   * whole story-bible generation.
   */
  contentBudget: verticalDramaEpisodeContentBudgetSchema.optional(),
  /**
   * Deep story drafts (W10-A, added 2026-07-08) — a full 9-shot breakdown
   * with speakable dialogue for this episode. OPTIONAL/superset: absent for
   * every response that predates this field (including `generateStoryBible`'s
   * OWN unchanged response, which never requests it — see `buildPrompts`
   * above, untouched) and for any legacy/partial response — so this schema
   * stays byte-compatible with every existing caller. Only REQUIRED (via the
   * stricter local `deepDraftChunkEpisodeItemSchema`) for a fresh deep-draft
   * chunk LLM response.
   */
  shotDrafts: z
    .array(shotDraftSchema)
    .length(VD_DEEP_DRAFT_SHOTS_PER_EPISODE)
    .optional(),
  /** Deep story drafts (W10-A) — optional per-episode cliffhanger line/teaser. */
  cliffhanger_line: z.string().min(1).optional(),
  /** Deep story drafts (W10-A) — optional, see `draftCompletenessSchema` above. */
  draftCompleteness: draftCompletenessSchema.optional(),
  /** Premium multi-round drafts (W11-A) — optional, see `draftScorecardSchema` above. */
  draftScorecard: draftScorecardSchema.optional(),
  /**
   * Dramaturgy critic (W11.5, added 2026-07-08) — short antagonist-tactic
   * tags used THIS episode (e.g. "ขู่", "สลับเอกสาร", "ปิดปาก") — feeds
   * `analyzeSeasonDramaturgy`'s `antagonist_tactic_repetition` check.
   * OPTIONAL/superset, same "absent for every response that predates this
   * field" convention as every sibling field above.
   */
  antagonist_tactics: z.array(z.string().min(1)).optional(),
  /**
   * Dramaturgy critic (W11.5) — named character decisions made THIS episode
   * (an agency signal — feeds the `character_agency_zero_decisions` check).
   */
  character_decisions: z.array(characterDecisionSchema).optional(),
  /**
   * Dramaturgy critic (W11.5) — bible-level protagonist stake, requested
   * ONCE (the chunk covering episode 1) and stored on episode 1's own item
   * (see `buildDeepDraftPrompts`'s `includeBibleLevelFields` branch).
   */
  protagonist_stake: z.string().min(1).optional(),
  /**
   * Dramaturgy critic (W11.5) — bible-level fantasy/world rule system,
   * requested ONCE alongside `protagonist_stake` and stored on episode 1.
   */
  world_rules: z.array(worldRuleSchema).optional(),
  /**
   * Dramaturgy critic (W11.5) — finale-only: the concrete cost/price paid to
   * resolve the season (feeds the `finale_no_price_paid` check).
   */
  price_paid: z.string().min(1).optional(),
});

const expandedStoryBibleSchema = z.object({
  expandedSeasonArc: z.string().min(1),
  refinedCharacters: z
    .array(
      z.object({
        name: z.string().min(1),
        role: z.string().min(1),
        description: z.string().min(1),
      })
    )
    .min(1),
  episodeBreakdown: z.array(episodeBreakdownItemSchema).min(1),
});

export type ExpandedVerticalDramaStoryBible = z.infer<
  typeof expandedStoryBibleSchema
>;

/** Mirrors the pipeline's own `VD_SCHEMA_VALIDATION_FAILED` convention for LLM-output parse failures. */
export class VdSchemaValidationError extends Error {
  code = "VD_SCHEMA_VALIDATION_FAILED" as const;
  issueSummary: string | null;
  constructor(
    message: string,
    public issues: unknown
  ) {
    const issueSummary = summarizeValidationIssues(issues);
    super(issueSummary ? `${message}: ${issueSummary}` : message);
    this.name = "VdSchemaValidationError";
    this.issueSummary = issueSummary;
  }
}

function summarizeValidationIssues(issues: unknown): string | null {
  const maybeIssues =
    issues &&
    typeof issues === "object" &&
    "issues" in issues &&
    Array.isArray((issues as { issues?: unknown }).issues)
      ? (issues as { issues: unknown[] }).issues
      : [];
  if (maybeIssues.length === 0) {
    return null;
  }
  return maybeIssues
    .slice(0, 8)
    .map((issue) => {
      if (!issue || typeof issue !== "object") {
        return "unknown validation issue";
      }
      const record = issue as { path?: unknown; message?: unknown };
      const path =
        Array.isArray(record.path) && record.path.length > 0
          ? record.path.join(".")
          : "(root)";
      const message =
        typeof record.message === "string" ? record.message : "invalid value";
      return `${path}: ${message}`;
    })
    .join("; ");
}

export class InsufficientCreditsError extends Error {
  code = "INSUFFICIENT_CREDITS" as const;
  constructor() {
    super("Insufficient credits to generate the story bible");
    this.name = "InsufficientCreditsError";
  }
}

/**
 * Scans `text` starting at `openIndex` (which must point at `{` or `[`) for
 * the matching closing brace/bracket, honoring string/escape state so that
 * `{`/`}`/`[`/`]` characters that appear *inside* JSON string values are
 * never mistaken for structural tokens. Returns the index of the matching
 * closer, or -1 if `text` ends before the value is balanced (e.g. a
 * truncated response).
 */
function findBalancedJsonEnd(text: string, openIndex: number): number {
  const openChar = text[openIndex];
  const closeChar = openChar === "{" ? "}" : "]";
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = openIndex; i < text.length; i++) {
    const ch = text[i];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (ch === "\\") {
        escaped = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }

    if (ch === '"') {
      inString = true;
      continue;
    }

    if (ch === "{" || ch === "[") {
      depth++;
    } else if (ch === "}" || ch === "]") {
      depth--;
      if (depth === 0) {
        return i;
      }
    }
  }

  // Ran off the end of the string without closing — but if the very first
  // token closed at depth 0 already (single scalar-ish edge case) fall back
  // to indicating failure so the caller's fallback logic can decide.
  void closeChar;
  return -1;
}

/**
 * Extracts and parses the first balanced JSON value (object or array) found
 * in `text`, ignoring any trailing content after that value (commentary,
 * a duplicated second JSON object, stray tokens, etc.). This is the
 * dominant real-world failure mode for "compact JSON" instructions: the
 * model emits one complete, valid JSON value and then keeps talking.
 *
 * Order of operations:
 *  1. Strip a markdown code fence if present.
 *  2. Find the first `{` or `[` and scan forward with a string-aware
 *     brace/bracket counter (respecting quotes + backslash escapes) to find
 *     the matching closer. Parse exactly that slice.
 *  3. If that fails for any reason (no opener found, unbalanced/truncated
 *     JSON, or the balanced slice itself doesn't parse), fall back to the
 *     previous "first `{` to last `}`" heuristic so existing error messages
 *     and behavior are preserved for genuinely malformed/truncated output.
 */
export function extractJson(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1] : text;

  const braceStart = candidate.indexOf("{");
  const bracketStart = candidate.indexOf("[");
  const start =
    braceStart >= 0 && (bracketStart < 0 || braceStart < bracketStart)
      ? braceStart
      : bracketStart;

  if (start >= 0) {
    const end = findBalancedJsonEnd(candidate, start);
    if (end > start) {
      const balancedSlice = candidate.slice(start, end + 1);
      try {
        return JSON.parse(balancedSlice);
      } catch {
        // Balanced-scan slice didn't parse (shouldn't normally happen since
        // the scan is string-aware) — fall through to the legacy heuristic
        // below rather than failing immediately.
      }
    }
  }

  // Legacy fallback: first `{` to last `}`. Preserved so truncated/malformed
  // responses still fail with the same informative error as before.
  const legacyStart = candidate.indexOf("{");
  const legacyEnd = candidate.lastIndexOf("}");
  const jsonSlice =
    legacyStart >= 0 && legacyEnd > legacyStart
      ? candidate.slice(legacyStart, legacyEnd + 1)
      : candidate;
  try {
    return JSON.parse(jsonSlice);
  } catch (error) {
    throw new VdSchemaValidationError(
      `LLM response was not valid JSON: ${error instanceof Error ? error.message : String(error)}`,
      { rawResponse: text }
    );
  }
}

/**
 * Appended to the user message on the single automatic retry below — asks
 * the model to keep its answer complete and compact so a longer, enriched
 * multi-shot payload (Phase 3B per-shot prompt upgrades: micro-expressions,
 * mood lighting, power-dynamic composition, etc.) is less likely to be cut
 * off by the output-token ceiling. Compact (no pretty-printing) JSON is
 * meaningfully shorter than indented JSON for the same content, which is why
 * this is appended to every planning call's user prompt up front, not only
 * on retry — see each generation module's `buildUserPrompt`.
 */
export const VD_COMPACT_JSON_INSTRUCTION =
  "Return ONLY a single JSON object. Do not pretty-print or indent — emit compact JSON (no unnecessary whitespace/newlines) to keep the response as short as possible.";

const VD_RETRY_STRICT_INSTRUCTION =
  "Your previous response was truncated or was not valid JSON. Return ONLY complete, valid, compact JSON (no markdown fences, no commentary, no trailing text). Do not truncate — if needed, shorten prose fields to fit, but every object/array must be properly closed. Output exactly ONE JSON object and nothing after it.";

/**
 * Phase A reliability fix (root cause: 2026-07-09 kie_ai outage — every call
 * hung on `llmRouter.ts`'s 120s `AbortController` timeout with
 * `errorType: "network_error"` / message "This operation was aborted", and
 * NOTHING retried it before the bug in this file was fixed). Classifies a
 * thrown planning-call error into one of three buckets so callers can decide
 * whether a bounded retry is safe:
 *  - `"schema"` — the LLM responded but its JSON failed zod validation
 *    (`VdSchemaValidationError`); only ever retried by the stricter-
 *    instruction/higher-token-ceiling path below, never by the transient
 *    backoff retry.
 *  - `"transient"` — network/timeout/rate-limit/upstream-5xx failures that a
 *    provider (or a different provider via `executeWithFallback`'s own
 *    internal fallback chain) may well succeed at moments later; safe to
 *    retry with backoff.
 *  - `"fatal"` — auth, invalid-request, or insufficient-credit failures that
 *    will never succeed on retry; retrying only wastes time and money.
 * Classification is intentionally conservative (message-substring matching)
 * since `executeWithFallback` (see `llmRouter.ts`, NOT modified here) only
 * ever throws/returns a flattened string message by the time it reaches this
 * file's `attempt()` closures — it does not preserve a structured error code
 * across its own fallback chain.
 */
export type VdLlmErrorClass = "schema" | "transient" | "fatal";

const VD_FATAL_LLM_ERROR_PATTERNS: RegExp[] = [
  /unauthorized/,
  /forbidden/,
  /invalid api key/,
  /invalid_api_key/,
  /\b401\b/,
  /\b403\b/,
  /payment required/,
  /\b402\b/,
  /insufficient credit/,
  /insufficient_quota/,
  /invalid_request_error/,
  /does not allow/,
  /unsupported field/,
  /unsupported request fields/,
];

const VD_TRANSIENT_LLM_ERROR_PATTERNS: RegExp[] = [
  /operation was aborted/,
  /econnreset/,
  /etimedout/,
  /econnrefused/,
  /fetch failed/,
  /network_error/,
  /network error/,
  /no successful provider/,
  /did not reach a successful provider response/,
  /all providers failed/,
  /timed out/,
  /\btimeout\b/,
  /socket hang up/,
  /\b429\b/,
  /\b5\d{2}\b/,
  /rate limit/,
];

export function classifyVerticalDramaLlmError(error: unknown): VdLlmErrorClass {
  if (error instanceof VdSchemaValidationError) {
    return "schema";
  }
  const message = (
    error instanceof Error ? error.message : String(error ?? "")
  ).toLowerCase();
  if (!message) {
    return "fatal";
  }
  if (VD_FATAL_LLM_ERROR_PATTERNS.some(pattern => pattern.test(message))) {
    return "fatal";
  }
  if (VD_TRANSIENT_LLM_ERROR_PATTERNS.some(pattern => pattern.test(message))) {
    return "transient";
  }
  return "fatal";
}

/** Bounded backoff schedule (ms) for `"transient"`-classified retries in `executeJsonPlanningCallWithRetry` — see `classifyVerticalDramaLlmError`. */
const VD_TRANSIENT_RETRY_BACKOFFS_MS = [5_000, 15_000];

/** Hard ceiling on TOTAL LLM calls a single `executeJsonPlanningCallWithRetry` invocation may make: 1 initial + at most 1 schema-retry + at most `VD_TRANSIENT_RETRY_BACKOFFS_MS.length` transient-retries. */
const VD_PLANNING_CALL_MAX_ATTEMPTS =
  1 + 1 + VD_TRANSIENT_RETRY_BACKOFFS_MS.length;

function vdSleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Shared retry wrapper for the `executeWithFallback` -> `extractJson` ->
 * zod-`safeParse` pattern used by every vertical-drama LLM *planning* call
 * (`generateStoryBible`, `generateEpisodeScript`, `generateStoryboardShotgrid`,
 * `generateStartFrameRenderPlan`, `generateVideoMotionPromptPack`).
 *
 * Two INDEPENDENT (orthogonal) retry mechanisms, both against the SAME model
 * (never switches models — vertical drama and the wider app never
 * auto-switch a model chosen for a call):
 *  1. **Schema retry** (original behavior) — on a `"schema"`-classified
 *     failure (JSON-parse/zod-validation), retries AT MOST ONCE with (a) the
 *     same system+user prompt plus one appended strict-JSON instruction
 *     message, and (b) a higher `maxTokens` ceiling (`retryMaxTokens`,
 *     defaults to `Math.max(params.maxTokens * 2, 16000)` when omitted) so a
 *     previously-truncated multi-shot payload has more room to complete.
 *  2. **Transient retry** (Phase A reliability fix, added 2026-07-09) — on a
 *     `"transient"`-classified failure (network/timeout/rate-limit/upstream
 *     5xx — see `classifyVerticalDramaLlmError`), retries with the SAME
 *     prompt/token-ceiling after a backoff (`VD_TRANSIENT_RETRY_BACKOFFS_MS`:
 *     5s then 15s), up to `VD_TRANSIENT_RETRY_BACKOFFS_MS.length` times.
 *     `"fatal"`-classified failures (auth/invalid-request/insufficient-
 *     credit) are NEVER retried.
 * A transient failure of the schema-retry attempt (or vice versa) may also
 * be retried — the two mechanisms are orthogonal — but TOTAL LLM calls for a
 * single invocation are hard-capped at `VD_PLANNING_CALL_MAX_ATTEMPTS` (4).
 * Logs every retry attempt and the final failure via the shared
 * file/console `debugLog`/`debugError` logger (never logs prompt or response
 * bodies — only lengths/codes/messages, per the secret/PII logging rules).
 *
 * Returns the successfully-parsed+validated data. Throws the LAST attempt's
 * own error when every attempt fails — callers keep their existing
 * catch/failed-run handling unchanged.
 */
export async function executeJsonPlanningCallWithRetry<T>(params: {
  model: string;
  systemPrompt: string;
  userPrompt: string;
  temperature: number;
  userId: number;
  maxTokens: number;
  retryMaxTokens?: number;
  /** zod schema (or any object exposing `safeParse`) validating the parsed JSON. */
  schema: {
    safeParse: (value: unknown) => {
      success: boolean;
      data?: T;
      error?: unknown;
    };
  };
  /** Human-readable label used only in log lines, e.g. "start-frame render plan". */
  label: string;
}): Promise<{
  data: T;
  response: Awaited<ReturnType<typeof executeWithFallback>> extends infer R
    ? R extends { type: "success"; response: infer Resp }
      ? Resp
      : never
    : never;
  retried: boolean;
}> {
  const attempt = async (userPrompt: string, maxTokens: number) => {
    const result = await executeWithFallback({
      model: params.model,
      messages: [
        { role: "system", content: params.systemPrompt },
        { role: "user", content: userPrompt },
      ],
      stream: false,
      userId: params.userId,
      maxTokens,
      temperature: params.temperature,
    });

    if (result.type !== "success") {
      throw new Error(
        result.type === "error"
          ? `LLM request failed: ${result.error}`
          : "LLM request did not reach a successful provider response"
      );
    }

    const content = result.response.choices?.[0]?.message?.content ?? "";
    const parsed = extractJson(content);
    const validation = params.schema.safeParse(parsed);
    if (!validation.success) {
      throw new VdSchemaValidationError(
        `${params.label} response failed schema validation`,
        validation.error
      );
    }
    return { data: validation.data as T, response: result.response };
  };

  let currentUserPrompt = params.userPrompt;
  let currentMaxTokens = params.maxTokens;
  let usedSchemaRetry = false;
  let transientRetriesUsed = 0;
  let attemptNumber = 0;

  for (;;) {
    attemptNumber++;
    try {
      const result = await attempt(currentUserPrompt, currentMaxTokens);
      if (attemptNumber > 1) {
        debugLog(
          "vd_planning_retry",
          `${params.label}: retry succeeded for model ${params.model} (attempt ${attemptNumber}/${VD_PLANNING_CALL_MAX_ATTEMPTS})`,
          { attemptNumber }
        );
      }
      return { ...result, retried: attemptNumber > 1 } as never;
    } catch (error) {
      const classification = classifyVerticalDramaLlmError(error);
      const errorMessage =
        error instanceof Error ? error.message : String(error);

      // Schema retry (original behavior) — at most ONE stricter-instruction
      // + higher-token-ceiling retry, only for JSON-parse/schema failures.
      if (
        classification === "schema" &&
        !usedSchemaRetry &&
        attemptNumber < VD_PLANNING_CALL_MAX_ATTEMPTS
      ) {
        usedSchemaRetry = true;
        debugError(
          "vd_planning_retry",
          `${params.label}: attempt ${attemptNumber} failed schema validation for model ${params.model}, retrying once with stricter instruction + higher token ceiling`,
          { message: errorMessage }
        );
        currentMaxTokens =
          params.retryMaxTokens ?? Math.max(params.maxTokens * 2, 16000);
        currentUserPrompt = `${params.userPrompt}\n\n${VD_RETRY_STRICT_INSTRUCTION}`;
        continue;
      }

      // Transient retry (Phase A reliability fix, 2026-07-09 kie_ai outage —
      // see `classifyVerticalDramaLlmError`'s doc comment) — bounded backoff
      // retry for network/timeout/rate-limit/upstream-5xx failures, ORTHOGONAL
      // to the schema retry above (either may fire independently), but the
      // overall attempt count is capped by `VD_PLANNING_CALL_MAX_ATTEMPTS`.
      if (
        classification === "transient" &&
        transientRetriesUsed < VD_TRANSIENT_RETRY_BACKOFFS_MS.length &&
        attemptNumber < VD_PLANNING_CALL_MAX_ATTEMPTS
      ) {
        const backoffMs = VD_TRANSIENT_RETRY_BACKOFFS_MS[transientRetriesUsed];
        transientRetriesUsed++;
        debugError(
          "vd_planning_retry",
          `${params.label}: attempt ${attemptNumber} failed with a transient error for model ${params.model}, retrying after ${backoffMs}ms (transient retry ${transientRetriesUsed}/${VD_TRANSIENT_RETRY_BACKOFFS_MS.length})`,
          { message: errorMessage }
        );
        await vdSleep(backoffMs);
        continue;
      }

      // Fatal, or every available retry budget exhausted — fail the stage.
      debugError(
        "vd_planning_retry",
        `${params.label}: attempt ${attemptNumber} (classification: ${classification}) failed for model ${params.model} — failing the stage`,
        { message: errorMessage, attemptNumber }
      );
      throw error;
    }
  }
}

interface GenerateStoryBibleParams {
  userId: number;
  tenantId?: string;
  seriesId: number;
  title: string;
  locale: VerticalDramaSeriesLocale;
  genre?: string | null;
  tone?: string | null;
  targetEpisodeCount: number;
  bible: Record<string, unknown>;
  /**
   * Story-density reform (spec §7.7, section-13, added 2026-07-07) — the
   * fixed per-episode target duration in seconds, used ONLY to compute the
   * speech-budget floor stated in the prompt when
   * `opts.speechBudgetEnabled` is true. Optional; defaults to `60` (the
   * product-wide fixed episode length — see
   * `VERTICAL_DRAMA_TARGET_DURATION_SECONDS` and the
   * `defaultEpisodeDurationSeconds` DB column's default) so existing
   * callers that predate this field are unaffected.
   */
  episodeDurationSeconds?: number;
  /**
   * Additive feature-flag bag (spec §7.7, section-13). Every flag defaults
   * to falsy/undefined, which preserves today's byte-identical prompt and
   * schema behavior — see section-13's "flags off" acceptance test.
   */
  opts?: {
    /**
     * Feature flag `verticalDramaSeriesSpeechBudget` — states the
     * per-episode speech budget (in seconds) in the generation prompt and
     * requires a `contentBudget` per breakdown item when true.
     */
    speechBudgetEnabled?: boolean;
  };
  /**
   * Feature 132 §4.2.7 (F132A, user-premise-preset-mix) — the creator's
   * free-form "โจทย์เรื่องที่อยากได้" premise (persisted at `bible.userPremise`,
   * gated by the `verticalDramaUserPremise` tenant flag at the router layer —
   * see `verticalDramaSeries.ts`). When a non-empty trimmed string,
   * `buildPrompts` prepends a dedicated "USER PREMISE (PRIMARY)" block ahead
   * of `Series title:`/`Existing bible:`. Optional — absent/empty is
   * BYTE-IDENTICAL to before this field existed (the `.filter(Boolean)`
   * conditional-block idiom below renders nothing).
   */
  userPremise?: string;
}

function buildPrompts(params: GenerateStoryBibleParams): {
  systemPrompt: string;
  userPrompt: string;
} {
  const langInstruction =
    params.locale === "th"
      ? "Write ALL string values in natural Thai."
      : `Write all string values in ${verticalDramaLocaleEnglishName(params.locale)}.`;

  // Story-density reform (spec §7.7.2 Layer 1, section-13, added
  // 2026-07-07) — additive; only sent when `verticalDramaSeriesSpeechBudget`
  // is enabled, so the flag-off prompt is byte-identical to before this
  // change (section-13 acceptance: "flags off — ... byte-compatible").
  const speechBudgetEnabled = params.opts?.speechBudgetEnabled === true;
  const episodeDurationSeconds = params.episodeDurationSeconds ?? 60;
  const minEpisodeSpeechSeconds = Math.ceil(
    MIN_EPISODE_COVERAGE_RATIO * episodeDurationSeconds
  );

  const systemPrompt = [
    renderCriteriaVersionMarker(),
    "You are a vertical-drama (short-form mobile drama series) story bible writer.",
    "Given a series' basic setup, expand it into a fuller production-ready story bible.",
    langInstruction,
    "Respond with ONLY a single JSON object (no markdown, no commentary) matching exactly this shape:",
    '{"expandedSeasonArc": string, "refinedCharacters": [{"name": string, "role": string, "description": string}], "episodeBreakdown": [{"episodeNumber": number, "workingTitle": string, "logline": string, "keyBeats": string[]}]}',
    `"episodeBreakdown" must contain exactly ${params.targetEpisodeCount} entries, numbered 1..${params.targetEpisodeCount} in order, each with 3-5 short keyBeats.`,
    speechBudgetEnabled
      ? `Each episode is a fixed ${episodeDurationSeconds}-second episode that must carry AT LEAST ${minEpisodeSpeechSeconds} seconds of spoken dialogue (the platform's minimum speech-coverage floor) — plan enough plot/conflict per episode to genuinely fill that budget instead of padding a thin episode afterward. Each entry in "episodeBreakdown" must ALSO include a "contentBudget" object: {"beatCount": number (5-7 story beats), "estimatedSpeechSeconds": number (this episode's planned total spoken-dialogue seconds, >= ${minEpisodeSpeechSeconds}), "conflictLevel": integer 1-5 (this episode's position on the SEASON'S escalation curve — start low in early episodes and rise toward 5 near the finale; never flat across the season), "reversalTarget": integer (at least 2 reversals planned for this episode), "arcThreads": string[] (season threads this episode advances)}.`
      : null,
  ]
    .filter(Boolean)
    .join("\n");

  // Feature 132 §4.2.7 (F132A) — prepended ahead of `Series title:` so an
  // absent/empty `userPremise` renders nothing (byte-identical), per the
  // `.filter(Boolean).join("\n")` conditional-block idiom used throughout
  // this file.
  const trimmedUserPremise = params.userPremise?.trim();
  const userPremiseBlock = trimmedUserPremise
    ? `USER PREMISE (PRIMARY):\n${trimmedUserPremise}\nThis premise is the PRIMARY story spine — the series' genre/tone/existing bible fields below are supporting flavor. Do not contradict this premise.`
    : null;

  const userPrompt = [
    userPremiseBlock,
    `Series title: ${params.title}`,
    params.genre ? `Genre: ${params.genre}` : null,
    params.tone ? `Tone: ${params.tone}` : null,
    `Target episode count: ${params.targetEpisodeCount}`,
    `Existing bible (from the creator's wizard input): ${JSON.stringify(params.bible)}`,
    VD_COMPACT_JSON_INSTRUCTION,
  ]
    .filter(Boolean)
    .join("\n");

  return { systemPrompt, userPrompt };
}

/**
 * Expand a series' wizard-gathered bible into a full season/episode story
 * bible via a real LLM call. Credit-gated (throws `InsufficientCreditsError`
 * before calling out) and schema-validated (throws `VdSchemaValidationError`
 * on a malformed LLM response) — mirrors `enhancePrompt`'s
 * check-credits -> call -> deduct-credits convention.
 */
export async function generateStoryBible(
  params: GenerateStoryBibleParams
): Promise<{
  expanded: ExpandedVerticalDramaStoryBible;
  creditsUsed: number;
  model: string;
  /**
   * Feature 132 §4.2.7 (F132A) — deterministic, warn-only findings from
   * `evaluatePremiseCoverage` (never present when `params.userPremise` is
   * absent/blank, or when the produced bible covers the premise). Additive:
   * every existing caller destructuring `{ expanded, creditsUsed, model }`
   * is unaffected.
   */
  warnings?: Array<{ code: string; message: string }>;
}> {
  const hasCredits = await hasEnoughCredits(params.userId, 1);
  if (!hasCredits) {
    throw new InsufficientCreditsError();
  }

  const model = await resolveStoryBibleModel();
  const { systemPrompt, userPrompt } = buildPrompts(params);

  // Base ceiling raised from 3500 to 6000 — `episodeBreakdown` grows with
  // `targetEpisodeCount` (each entry has a workingTitle/logline/3-5
  // keyBeats), so a series with a larger target episode count is a
  // plausible truncation risk of the same class already hit in the sibling
  // generators. Shares the same one-retry-on-truncated/invalid-JSON safety
  // net (`executeJsonPlanningCallWithRetry`, defined just above in this
  // file) as every other Vertical Drama planning call site.
  const { data: validatedData, response } =
    await executeJsonPlanningCallWithRetry({
      model,
      systemPrompt,
      userPrompt,
      temperature: 0.8,
      userId: params.userId,
      maxTokens: 6000,
      schema: expandedStoryBibleSchema,
      label: "Story bible",
    });

  const usage = response.usage;
  const creditsUsed = calculateCreditsForLLM(
    usage?.prompt_tokens ?? 0,
    usage?.completion_tokens ?? 0,
    model
  );

  await deductCredits({
    userId: params.userId,
    tenantId: params.tenantId,
    amount: creditsUsed,
    description: `Vertical Drama — generate story bible (series #${params.seriesId})`,
    sourceType: "skill",
    metadata: {
      model,
      llmModel: model,
      feature: "vertical_drama_series",
      seriesId: params.seriesId,
      inputTokens: usage?.prompt_tokens ?? 0,
      outputTokens: usage?.completion_tokens ?? 0,
    },
  });

  // Feature 132 §4.2.7 (F132A) — deterministic, no-LLM premise-coverage
  // guard, only run when a premise was actually supplied this call
  // (router-level flag gate already forces `undefined` when the
  // `verticalDramaUserPremise` tenant flag is off — see `verticalDramaSeries.ts`).
  const trimmedUserPremiseForCoverage = params.userPremise?.trim();
  const coverage = trimmedUserPremiseForCoverage
    ? evaluatePremiseCoverage(trimmedUserPremiseForCoverage, {
        logline: params.title,
        mainPlot: validatedData.expandedSeasonArc,
        seasonArc: validatedData.episodeBreakdown
          .map(ep => `${ep.workingTitle}: ${ep.logline}`)
          .join(" "),
      })
    : undefined;

  return {
    expanded: validatedData,
    creditsUsed,
    model,
    ...(coverage?.warning ? { warnings: [coverage.warning] } : {}),
  };
}

/* -------------------------------------------------------------------------- */
/* Breakdown versioning (spec §7.7.2/§7.7.3, section-13, added 2026-07-07)     */
/*                                                                            */
/* Pure, append-only helpers over the series `bible` jsonb blob. NONE of      */
/* these functions mutate the `bible` object passed in or read/write the      */
/* database — they always return a brand-new plain object; the caller        */
/* (router/pipeline, a later wave) owns persisting it. This mirrors           */
/* `verticalDramaQualityReviewApply.ts`'s pure/DB-free shape.                 */
/* -------------------------------------------------------------------------- */

/**
 * Tolerant shape of a breakdown item as READ from persisted storage (bible
 * jsonb `breakdownVersions[].items` or the legacy flat `episodeBreakdown`
 * array) — `contentBudget` is OPTIONAL (legacy rows predate it, spec §7.7.2
 * hard rule 6). Distinct from this file's own `episodeBreakdownItemSchema`
 * above, which validates a FRESH `generateStoryBible` LLM response and does
 * not `.passthrough()` unknown keys the way the shared storage schema does.
 */
export type StoredEpisodeBreakdownItem = z.infer<
  typeof sharedStoredBreakdownItemSchema
>;

const breakdownVersionsArraySchema = z.array(
  verticalDramaBreakdownVersionSchema
);
const storedBreakdownItemArraySchema = z.array(sharedStoredBreakdownItemSchema);

/**
 * Zod-inferred shape of a single `breakdownVersions[]` entry as actually
 * parsed/stored. NOTE: this is deliberately used in place of the
 * hand-written `VerticalDramaBreakdownVersion` TS type from
 * `contentBudget.ts` — that type declares `items: VerticalDramaEpisodeBreakdownItem[]`
 * with `contentBudget` REQUIRED, but `verticalDramaBreakdownVersionSchema`'s
 * own nested item schema (`verticalDramaEpisodeBreakdownItemSchema`) makes
 * `contentBudget` OPTIONAL (intentionally tolerant of legacy items — see
 * `StoredEpisodeBreakdownItem` above). Using the zod-inferred type here
 * avoids a false assignability conflict between those two (both defined in
 * `contentBudget.ts`, outside this file's ownership) while remaining 100%
 * structurally compatible with `VerticalDramaBreakdownVersion` wherever a
 * version's items all happen to carry a `contentBudget`.
 */
export type StoredBreakdownVersion = z.infer<
  typeof verticalDramaBreakdownVersionSchema
>;

/**
 * Tolerant read of `bible.breakdownVersions[]` (spec §7.7.2/§7.7.3) —
 * returns `[]` when the field is absent or fails to parse (e.g. a legacy
 * bible that predates breakdown versioning), never throws. Read-only: never
 * mutates `bible`.
 */
export function readBreakdownVersions(
  bible: Record<string, unknown> | null | undefined
): StoredBreakdownVersion[] {
  const raw = (bible as { breakdownVersions?: unknown } | null | undefined)
    ?.breakdownVersions;
  if (raw === undefined) return [];
  const parsed = breakdownVersionsArraySchema.safeParse(raw);
  return parsed.success ? parsed.data : [];
}

/** Deep story drafts (W10-A) — persisted per-version metadata, see `AppendBreakdownVersionInput.deepDraft`. */
export type StoredDeepDraftMetadata = {
  horizonEndEpisode: number;
  chunkSizes: number[];
  generatedAt: string;
  /** Premium multi-round drafts (W11-A) — present only when this version's deep draft run used `mode: "premium"`. */
  premium?: VdPremiumDeepDraftMetrics;
};

export interface AppendBreakdownVersionInput {
  source: VerticalDramaBreakdownVersionSource;
  items: StoredEpisodeBreakdownItem[];
  createdByUserId: number;
  /** Overridable for deterministic tests; defaults to `crypto.randomUUID()`. */
  versionId?: string;
  /** Overridable for deterministic tests; defaults to `new Date().toISOString()`. */
  createdAt?: string;
  /**
   * Deep story drafts (W10-A, added 2026-07-08) — additive/optional version
   * metadata stamped by the router when this version was produced (in whole
   * or in part) by `generateStoryBibleDeep`/`extendStoryDraftHorizon`.
   * Absent for every other version source (arc-replan, plain
   * `generateStoryBible`), so existing callers/tests are unaffected.
   */
  deepDraft?: StoredDeepDraftMetadata;
  /**
   * Feature 132 §5 (F132B, ledgers-and-story-state) — this version's quality
   * ledgers, as produced by the `ledger_plan` step / kept in sync by
   * `reconcileLedgers`. Optional/additive: absent whenever the
   * `verticalDramaQualityLedgers` tenant flag is off, or for any version
   * source that doesn't run ledger planning — existing callers/tests are
   * unaffected.
   */
  ledgers?: VerticalDramaQualityLedgers;
}

/**
 * Append-only breakdown-version writer (spec §7.7.3 hard rule 4: "Breakdown
 * versions are append-only; approving an `arc_replan_proposal` appends a
 * version ... Produced episodes are NEVER rewritten"). NEVER mutates
 * `bible` or any existing version in place — always returns a brand-new
 * bible object with the new version pushed onto `breakdownVersions[]` and
 * `activeBreakdownVersionId` moved to point at it; every other key on
 * `bible` (and every prior version) is carried over untouched via a shallow
 * spread.
 *
 * Feature 132 §5 (F132B) — whenever this new version becomes the active one
 * (which every call does, per the above), its `ledgers` (when given) are
 * ALSO mirrored onto the top-level `bible.ledgers` key, at this SAME call
 * site, mirroring how `activeBreakdownVersionId` itself is kept in sync with
 * "whichever version is active" right here. Omitted entirely (never an
 * `undefined` key) when `input.ledgers` is absent, so a flag-off/legacy
 * caller's returned bible shape is byte-identical to before this field
 * existed.
 */
export function appendBreakdownVersion(
  bible: Record<string, unknown> | null | undefined,
  input: AppendBreakdownVersionInput
): Record<string, unknown> {
  const existingVersions = readBreakdownVersions(bible);
  const newVersion: StoredBreakdownVersion = {
    versionId: input.versionId ?? randomUUID(),
    createdAt: input.createdAt ?? new Date().toISOString(),
    createdByUserId: input.createdByUserId,
    source: input.source,
    items: input.items,
    // `verticalDramaBreakdownVersionSchema` is `.passthrough()`, so this
    // extra key round-trips through `readBreakdownVersions` unchanged for
    // every reader; omitted entirely (not even an `undefined` key) when the
    // caller doesn't pass it, matching every other version source's shape.
    ...(input.deepDraft ? { deepDraft: input.deepDraft } : {}),
    ...(input.ledgers ? { ledgers: input.ledgers } : {}),
  };

  const nextBible: Record<string, unknown> = {
    ...(bible ?? {}),
    breakdownVersions: [...existingVersions, newVersion],
    activeBreakdownVersionId: newVersion.versionId,
  };
  // The mirror reflects the NEWLY-ACTIVE version's own `ledgers` — explicitly
  // cleared (not left as a stale copy from the shallow spread above) when
  // this version doesn't carry any, so `bible.ledgers` never lags one
  // version behind `activeBreakdownVersionId`. A legacy/flag-off bible that
  // never had a `ledgers` key to begin with is unaffected either way (`delete`
  // on an absent key is a no-op).
  if (input.ledgers) {
    nextBible.ledgers = input.ledgers;
  } else {
    delete nextBible.ledgers;
  }
  return nextBible;
}

/**
 * Feature 132 §5 (F132B) — tolerant read of the CURRENTLY ACTIVE breakdown
 * version's `ledgers` (mirrors `readBreakdownVersions`'s "never throw, `[]`/
 * default on absence or malformed data" convention). Falls back to
 * `emptyQualityLedgers()` when no active version carries `ledgers` (flag
 * off, a version predating F132B, or no versions at all) — never `undefined`,
 * so callers never need a null-check.
 */
export function readBreakdownVersionLedgers(
  bible: Record<string, unknown> | null | undefined
): VerticalDramaQualityLedgers {
  const versions = readBreakdownVersions(bible);
  if (versions.length === 0) return emptyQualityLedgers();

  const activeId = (
    bible as { activeBreakdownVersionId?: unknown } | null | undefined
  )?.activeBreakdownVersionId;
  const active =
    (typeof activeId === "string" &&
      versions.find(v => v.versionId === activeId)) ||
    versions[versions.length - 1];

  return active.ledgers ?? emptyQualityLedgers();
}

/**
 * Resolve the CURRENTLY ACTIVE episode breakdown (spec §7.7.2/§7.7.3): the
 * `breakdownVersions[]` entry pointed to by `activeBreakdownVersionId` when
 * versioning has been adopted (falling back to the MOST RECENTLY appended
 * version if the pointer is missing/stale — versions are append-only, so
 * the last entry is always the newest), or the legacy top-level
 * `bible.episodeBreakdown` array when no versions exist at all (a series
 * that has never run "Generate story"/"Regenerate" under the story-density
 * reform) — spec §7.7.2 hard rule 6: legacy data is read tolerantly here,
 * never migrated or mutated by this read path.
 */
export function getActiveBreakdown(
  bible: Record<string, unknown> | null | undefined
): StoredEpisodeBreakdownItem[] {
  const versions = readBreakdownVersions(bible);
  if (versions.length > 0) {
    const activeId = (
      bible as { activeBreakdownVersionId?: unknown } | null | undefined
    )?.activeBreakdownVersionId;
    const active =
      (typeof activeId === "string" &&
        versions.find(v => v.versionId === activeId)) ||
      versions[versions.length - 1];
    return active.items;
  }

  const legacyRaw = (bible as { episodeBreakdown?: unknown } | null | undefined)
    ?.episodeBreakdown;
  if (!Array.isArray(legacyRaw)) return [];
  const parsed = storedBreakdownItemArraySchema.safeParse(legacyRaw);
  return parsed.success ? parsed.data : [];
}

/**
 * Resolve an EFFECTIVE content budget for a single breakdown item read from
 * storage (spec §7.7.2 hard rule 6): returns the item's own `contentBudget`
 * when already present (a new-series item, or an already-migrated legacy
 * item), otherwise derives a READ-TIME-ONLY default via the canonical
 * `deriveDefaultContentBudget` (imported from `contentBudget.ts` — never
 * re-declared). Never mutates `item`, and never writes the derived default
 * back to storage — a legacy series only PERSISTS a real `contentBudget` by
 * adopting Layer-1 planning via "Generate story"/"Regenerate", which
 * appends a brand-new, approval-gated breakdown version through
 * `appendBreakdownVersion` (spec §7.7.2 hard rule 6).
 */
export function deriveLegacyContentBudget(
  item: StoredEpisodeBreakdownItem,
  targetDurationSeconds: number,
  locale?: VerticalDramaSeriesLocale
): VerticalDramaEpisodeContentBudget {
  return (
    item.contentBudget ??
    deriveDefaultContentBudget(targetDurationSeconds, locale)
  );
}

/* -------------------------------------------------------------------------- */
/* Deep story drafts — tolerant per-item readers (W10-A, added 2026-07-08)    */
/*                                                                            */
/* Mirror `deriveLegacyContentBudget`'s "tolerant read, never mutate, never   */
/* throw" shape for the 3 new optional item fields.                          */
/* -------------------------------------------------------------------------- */

const shotDraftArraySchema = z
  .array(shotDraftSchema)
  .length(VD_DEEP_DRAFT_SHOTS_PER_EPISODE);

/**
 * Tolerant read of a stored breakdown item's `shotDrafts` (W10-A) — returns
 * `null` when absent or malformed (a legacy item, or one this run's horizon
 * never covered), never throws.
 */
export function readItemShotDrafts(
  item: StoredEpisodeBreakdownItem
): VdDeepDraftShotDraft[] | null {
  const raw = (item as { shotDrafts?: unknown }).shotDrafts;
  if (raw === undefined) return null;
  const parsed = shotDraftArraySchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

/** Tolerant read of a stored breakdown item's `cliffhanger_line` (W10-A). */
export function readItemCliffhangerLine(
  item: StoredEpisodeBreakdownItem
): string | undefined {
  const raw = (item as { cliffhanger_line?: unknown }).cliffhanger_line;
  return typeof raw === "string" && raw.trim().length > 0 ? raw : undefined;
}

/** Tolerant read of a stored breakdown item's `draftCompleteness` (W10-A). */
export function readItemDraftCompleteness(
  item: StoredEpisodeBreakdownItem
): VdDeepDraftCompleteness | null {
  const raw = (item as { draftCompleteness?: unknown }).draftCompleteness;
  if (raw === undefined) return null;
  const parsed = draftCompletenessSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

/** Tolerant read of a stored breakdown item's `draftScorecard` (W11-A premium multi-round drafts). */
export function readItemDraftScorecard(
  item: StoredEpisodeBreakdownItem
): VdPremiumDraftScorecard | null {
  const raw = (item as { draftScorecard?: unknown }).draftScorecard;
  if (raw === undefined) return null;
  const parsed = draftScorecardSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

/* -------------------------------------------------------------------------- */
/* Deep story drafts — chunk math + horizon resolution (W10-A)                */
/* -------------------------------------------------------------------------- */

/**
 * Splits `episodeCount` sequential episodes into ordered chunk sizes of at
 * most `VD_DEEP_DRAFT_EPISODES_PER_CALL` each (owner-approved design):
 * `computeDeepDraftChunkSizes(10) -> [5, 5]`,
 * `computeDeepDraftChunkSizes(12) -> [5, 5, 2]`,
 * `computeDeepDraftChunkSizes(3) -> [3]`.
 */
export function computeDeepDraftChunkSizes(episodeCount: number): number[] {
  if (episodeCount <= 0) return [];
  const chunks: number[] = [];
  let remaining = Math.floor(episodeCount);
  while (remaining > 0) {
    const size = Math.min(VD_DEEP_DRAFT_EPISODES_PER_CALL, remaining);
    chunks.push(size);
    remaining -= size;
  }
  return chunks;
}

export function computePremiumDeepDraftChunkSizes(episodeCount: number): number[] {
  if (episodeCount <= 0) return [];
  const chunks: number[] = [];
  let remaining = Math.floor(episodeCount);
  while (remaining > 0) {
    const size = Math.min(VD_PREMIUM_DEEP_DRAFT_EPISODES_PER_CALL, remaining);
    chunks.push(size);
    remaining -= size;
  }
  return chunks;
}

/**
 * Resolves the effective deep-draft horizon (owner-approved design): the
 * caller's `requestedHorizon` clamped to `[0, totalEpisodes]`, or — when
 * omitted — `totalEpisodes` itself for a series of at most
 * `VD_DEEP_DRAFT_HORIZON_ALL_THRESHOLD` episodes, else
 * `VD_DEEP_DRAFT_DEFAULT_HORIZON_FOR_LARGE_SERIES`.
 */
export function resolveDeepDraftHorizon(
  requestedHorizon: number | undefined,
  totalEpisodes: number
): number {
  const safeTotalEpisodes = Math.max(0, Math.floor(totalEpisodes));
  const defaultHorizon =
    safeTotalEpisodes <= VD_DEEP_DRAFT_HORIZON_ALL_THRESHOLD
      ? safeTotalEpisodes
      : VD_DEEP_DRAFT_DEFAULT_HORIZON_FOR_LARGE_SERIES;
  const requested = requestedHorizon ?? defaultHorizon;
  return Math.max(0, Math.min(Math.floor(requested), safeTotalEpisodes));
}

/* -------------------------------------------------------------------------- */
/* Deep story drafts — post-chunk deterministic enforcement (W10-A)           */
/* -------------------------------------------------------------------------- */

/**
 * Post-chunk deterministic enforcement (owner-approved design, NO extra LLM
 * call): runs the canonical `analyzeVerticalDramaLineSpeakability` on every
 * dialogue line of every shot. A violating line's CLEANED version is applied
 * automatically; if the cleaned line becomes empty (nothing left to speak)
 * or resolves to a bare nonverbal sound (spec §14.1 rule 6b's
 * `nonverbal_line` violation — e.g. "เหมียว~"), the line is DROPPED and a
 * warning is appended to `warnings` (caller-owned accumulator array, mutated
 * in place — mirrors the loop-scoped-accumulator pattern used throughout
 * `generateStoryBibleDeep` below). Never mutates `shotDrafts` itself.
 *
 * Live-bug fix (added 2026-07-08): a generated shot can carry BOTH an
 * explicit `silence_intent` AND one or more `dialogue_lines` — a
 * contradiction the LLM sometimes emits (e.g. an "establishing" shot that
 * ALSO has a real spoken line). Once a shot has at least one USABLE line
 * left after the speakability cleaning above, dialogue wins: `silence_intent`
 * is stripped from the returned shot and a `silence_intent_conflict` warning
 * is recorded. When a shot's `silence_intent` is set and NO usable line
 * survives cleaning (every line was junk/nonverbal and got dropped above),
 * the existing behavior is unchanged — `silence_intent` is kept as the sole
 * signal for that shot. Shared by both standard mode (`generateStoryBibleDeep`
 * below) and premium mode (`gateRawPremiumEpisodes`, applied to every
 * fan-out/revise/sweep-spot-revise response), since both route every fresh
 * shot draft through this same function.
 */
export function enforceEpisodeShotDraftSpeakability(
  episodeNumber: number,
  shotDrafts: VdDeepDraftShotDraft[],
  warnings: VdDeepDraftWarning[]
): VdDeepDraftShotDraft[] {
  return shotDrafts.map(shot => {
    const cleanedLines: VdDeepDraftShotDialogueLine[] = [];
    for (const line of shot.dialogue_lines) {
      const analysis = analyzeVerticalDramaLineSpeakability({
        speaker: line.speaker,
        line: line.line,
      });
      if (analysis.speakable) {
        cleanedLines.push(line);
        continue;
      }

      const isNonverbal = analysis.violations.some(
        v => v.kind === "nonverbal_line"
      );
      const cleanedText = analysis.cleaned.line;
      if (isNonverbal || !cleanedText) {
        warnings.push({
          episodeNumber,
          shotNumber: shot.shot_number,
          reason: isNonverbal ? "nonverbal_line" : "empty_after_cleaning",
        });
        continue;
      }

      cleanedLines.push({
        ...line,
        speaker: analysis.cleaned.speaker ?? line.speaker,
        line: cleanedText,
        delivery: line.delivery ?? analysis.cleaned.delivery,
      });
    }

    if (shot.silence_intent && cleanedLines.length > 0) {
      warnings.push({
        episodeNumber,
        shotNumber: shot.shot_number,
        reason: "silence_intent_conflict",
      });
      const {
        silence_intent: _droppedSilenceIntent,
        ...shotWithoutSilenceIntent
      } = shot;
      void _droppedSilenceIntent;
      return { ...shotWithoutSilenceIntent, dialogue_lines: cleanedLines };
    }

    return { ...shot, dialogue_lines: cleanedLines };
  });
}

/**
 * Per-episode `draftCompleteness` (owner-approved design point 3) — computed
 * from the ALREADY-ENFORCED (speakability-cleaned) shot drafts via the
 * canonical estimator (`analyzeVerticalDramaEpisodeDialogueQuality`, never a
 * second speech-rate model): `dialogueEveryShot` is true when every shot has
 * at least one line OR is an explicit `silence_intent` shot; `coverageStatus`
 * classifies the canonical `coverageRatio` against the SAME
 * `MIN_EPISODE_COVERAGE_RATIO`/`ERROR_EPISODE_COVERAGE_RATIO` bands
 * `analyzeVerticalDramaEpisodeDialogueQuality` itself uses to flag
 * `VD_DIALOGUE_EPISODE_UNDERFILLED` — durations come from the fixed
 * 60s/9-shot `VERTICAL_DRAMA_DURATION_PROFILE_FALLBACK` (same profile the
 * generation prompt's per-shot band was built from).
 */
export function computeDraftCompleteness(
  shotDrafts: VdDeepDraftShotDraft[]
): VdDeepDraftCompleteness {
  const clipDurations =
    VERTICAL_DRAMA_DURATION_PROFILE_FALLBACK.shotDurationsSeconds;
  const clips = shotDrafts.map(shot => {
    const durationIndex = Math.min(
      Math.max(shot.shot_number - 1, 0),
      clipDurations.length - 1
    );
    return {
      shotNumber: shot.shot_number,
      durationSeconds: clipDurations[durationIndex] ?? 0,
      dialogue: shot.dialogue_lines.map(line => ({
        lineTh: line.line,
        speaker: line.speaker,
      })),
    };
  });
  const analysis = analyzeVerticalDramaEpisodeDialogueQuality(clips);

  const dialogueEveryShot = shotDrafts.every(
    shot => shot.dialogue_lines.length > 0 || !!shot.silence_intent
  );
  const allSpeakable = shotDrafts.every(shot =>
    shot.dialogue_lines.every(
      line =>
        analyzeVerticalDramaLineSpeakability({
          speaker: line.speaker,
          line: line.line,
        }).speakable
    )
  );
  const coverageStatus: VdDeepDraftCompleteness["coverageStatus"] =
    analysis.coverageRatio >= MIN_EPISODE_COVERAGE_RATIO
      ? "ok"
      : analysis.coverageRatio >= ERROR_EPISODE_COVERAGE_RATIO
        ? "warning"
        : "error";

  return {
    dialogueEveryShot,
    allSpeakable,
    estimatedSpeechSeconds: analysis.totalSpeechSeconds,
    coverageStatus,
  };
}

/**
 * Live-bug fix (chunk under-count no longer accepted silently, added
 * 2026-07-08) — reconciles a chunk's RAW returned `episodeBreakdown` against
 * the episode numbers that were actually REQUESTED for that chunk:
 *  - a duplicate `episodeNumber` in `returned` is dropped deterministically,
 *    keeping only the FIRST occurrence (never the last);
 *  - an "extra" entry whose `episodeNumber` was never requested is dropped
 *    entirely (it is never a valid substitute for a missing one);
 *  - `items` is returned in `requestedEpisodeNumbers`' own order (always
 *    ascending — every caller sorts its chunk ascending before this is
 *    called), regardless of the order the LLM happened to return them in;
 *  - `missingEpisodeNumbers` lists every requested number with no surviving
 *    entry, in ascending order.
 *
 * Generic over `T` (only `episodeNumber` is read) so this ONE pure,
 * side-effect-free function serves as the single source of truth for BOTH
 * the raw LLM response shape (`DeepDraftChunkResponse["episodeBreakdown"]`)
 * standard mode reconciles directly, AND premium mode's merge of a
 * corrective retry's raw response back onto a chunk's already-gated winner
 * (see `runPremiumChunk`). Never throws, never mutates `returned`.
 */
export function reconcileDeepDraftChunkEpisodes<
  T extends { episodeNumber: number },
>(
  requestedEpisodeNumbers: number[],
  returned: readonly T[]
): { items: T[]; missingEpisodeNumbers: number[] } {
  const byEpisodeNumber = new Map<number, T>();
  for (const item of returned) {
    if (!byEpisodeNumber.has(item.episodeNumber)) {
      byEpisodeNumber.set(item.episodeNumber, item);
    }
  }

  const items: T[] = [];
  const missingEpisodeNumbers: number[] = [];
  for (const episodeNumber of requestedEpisodeNumbers) {
    const found = byEpisodeNumber.get(episodeNumber);
    if (found) {
      items.push(found);
    } else {
      missingEpisodeNumbers.push(episodeNumber);
    }
  }
  return { items, missingEpisodeNumbers };
}

/**
 * Appended to a chunk's ORIGINAL user prompt for the ONE corrective retry
 * `generateStoryBibleDeep`/`runPremiumChunk` issue when
 * `reconcileDeepDraftChunkEpisodes` finds the first attempt's episode set
 * incomplete — same "same prompt + one appended instruction" shape
 * `VD_RETRY_STRICT_INSTRUCTION` already uses for a DIFFERENT failure class
 * (malformed/truncated JSON) via `executeJsonPlanningCallWithRetry`; this is
 * a separate, chunk-level retry for a schema-VALID but incomplete response.
 */
export function buildDeepDraftMissingEpisodesRetryInstruction(
  missingEpisodeNumbers: number[]
): string {
  const list = missingEpisodeNumbers.join(", ");
  return `Your previous response was missing required episode(s): ${list}. Return the COMPLETE response again, covering EVERY requested episode from this chunk — this time make absolutely sure episode(s) ${list} are included, each with a full ${VD_DEEP_DRAFT_SHOTS_PER_EPISODE}-shot draft, exactly like every other episode.`;
}

/* -------------------------------------------------------------------------- */
/* Deep story drafts — active-version metadata + summary reads (W10-A)        */
/* -------------------------------------------------------------------------- */

const deepDraftMetadataSchema = z
  .object({
    horizonEndEpisode: z.number().int().nonnegative(),
    chunkSizes: z.array(z.number().int().positive()),
    generatedAt: z.string().min(1),
    /** Premium multi-round drafts (W11-A) — see `vdPremiumDeepDraftMetricsSchema`. */
    premium: vdPremiumDeepDraftMetricsSchema.optional(),
  })
  .passthrough();

/**
 * Tolerant read of the ACTIVE breakdown version's `deepDraft` metadata
 * (mirrors `getActiveBreakdown`'s own "active, falling back to most recent"
 * resolution — intentionally NOT refactored to share code with that
 * existing, separately-tested function, to keep this addition a pure,
 * risk-free superset). Returns `null` when no versions exist yet, or the
 * active version predates deep drafts.
 */
export function readActiveDeepDraftMetadata(
  bible: Record<string, unknown> | null | undefined
): StoredDeepDraftMetadata | null {
  const versions = readBreakdownVersions(bible);
  if (versions.length === 0) return null;
  const activeId = (
    bible as { activeBreakdownVersionId?: unknown } | null | undefined
  )?.activeBreakdownVersionId;
  const active =
    (typeof activeId === "string" &&
      versions.find(v => v.versionId === activeId)) ||
    versions[versions.length - 1];
  const raw = (active as unknown as { deepDraft?: unknown }).deepDraft;
  const parsed = deepDraftMetadataSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

/** Series `get`/`list` payload addition (owner-approved design point 6). */
export type VdDeepDraftSummary = {
  horizonEndEpisode: number;
  episodesWithDrafts: number;
  totalEpisodes: number;
  /** Premium multi-round drafts (W11-A) — present (`true`) ONLY when the active version's deep draft was produced with `mode: "premium"`; omitted entirely otherwise (never `false`), mirroring `AppendBreakdownVersionInput.deepDraft`'s own "omit when not applicable" convention. */
  premium?: true;
};

/**
 * Lightweight `deepDraftSummary` for the Series `get`/`list` payloads —
 * additive, `null` when the series has no deep-drafted episodes at all (a
 * series that has never run `generateStoryBibleDeep`/`extendStoryDraftHorizon`,
 * or has no breakdown yet). `horizonEndEpisode` prefers the active version's
 * PERSISTED `deepDraft.horizonEndEpisode` (authoritative — set by the router
 * on every deep-draft run), falling back to the highest episode number that
 * actually carries a `shotDrafts` array for a bible that predates that
 * metadata being stamped.
 */
export function computeDeepDraftSummary(
  bible: Record<string, unknown> | null | undefined,
  totalEpisodes: number
): VdDeepDraftSummary | null {
  const items = getActiveBreakdown(bible);
  if (items.length === 0) return null;

  let episodesWithDrafts = 0;
  let highestDraftedEpisode = 0;
  for (const item of items) {
    if (readItemShotDrafts(item) !== null) {
      episodesWithDrafts += 1;
      highestDraftedEpisode = Math.max(
        highestDraftedEpisode,
        item.episodeNumber
      );
    }
  }
  if (episodesWithDrafts === 0) return null;

  const metadata = readActiveDeepDraftMetadata(bible);
  return {
    horizonEndEpisode: metadata?.horizonEndEpisode ?? highestDraftedEpisode,
    episodesWithDrafts,
    totalEpisodes,
    ...(metadata?.premium?.mode === "premium"
      ? { premium: true as const }
      : {}),
  };
}

/* -------------------------------------------------------------------------- */
/* Deep story drafts — chunk prompts + continuity recap (W10-A)               */
/* -------------------------------------------------------------------------- */

/** One prior episode's continuity-recap facts (owner-approved design point 2). */
export type DeepDraftRecapEpisode = {
  episodeNumber: number;
  workingTitle: string;
  logline: string;
  cliffhangerLine?: string;
};

/**
 * Compact continuity recap (owner-approved design point 2) built from ALL
 * previously-drafted episodes in THIS run: per episode, `workingTitle` +
 * `logline` one-liner + `cliffhanger_line` (when present), plus the running
 * `open_threads` list the prompt asks the model to maintain/return every
 * chunk. Returns `null` for the very first chunk of a fresh run (nothing to
 * recap yet).
 */
function buildDeepDraftContinuityRecap(
  recapItems: DeepDraftRecapEpisode[],
  openThreads: string[]
): string | null {
  if (recapItems.length === 0 && openThreads.length === 0) return null;
  const lines = recapItems.map(
    ep =>
      `Episode ${ep.episodeNumber} "${ep.workingTitle}": ${ep.logline}${
        ep.cliffhangerLine ? ` (cliffhanger: ${ep.cliffhangerLine})` : ""
      }`
  );
  return [
    "Continuity recap from episodes ALREADY drafted earlier in this run (context only — do NOT redraft these episodes):",
    ...lines,
    openThreads.length > 0
      ? `Currently open threads to track/advance/resolve: ${openThreads.join("; ")}`
      : null,
  ]
    .filter(Boolean)
    .join("\n");
}

/**
 * Requires exactly `shotDrafts` on top of the base (byte-compatible)
 * `episodeBreakdownItemSchema` — used ONLY to validate a fresh deep-draft
 * chunk LLM response, never for reading stored data (that stays tolerant via
 * `readItemShotDrafts` above).
 */
const deepDraftChunkEpisodeItemSchema = episodeBreakdownItemSchema.extend({
  shotDrafts: z.array(shotDraftSchema).length(VD_DEEP_DRAFT_SHOTS_PER_EPISODE),
});

const deepDraftChunkResponseSchema = z.object({
  episodeBreakdown: z.array(deepDraftChunkEpisodeItemSchema).min(1),
  open_threads: z.array(z.string().min(1)).optional(),
});

type DeepDraftChunkResponse = z.infer<typeof deepDraftChunkResponseSchema>;

/**
 * Format profiles (task #23, added 2026-07-08) — compact "FORMAT PROFILE"
 * block appended to `buildDeepDraftPrompts`'s systemPrompt (standard AND
 * premium-fan-out paths — `callPremiumFanoutCandidate` calls
 * `buildDeepDraftPrompts` directly with the same `params`). `null` (renders
 * nothing — `.filter(Boolean)` drops it) for an absent profile OR a
 * `"standard"`-tier one, so a flag-off run or a long season's prompt is
 * byte-identical to before this feature existed. `hookInstruction` is
 * expressed as a shot-1 requirement, matching how every other structural
 * instruction in this prompt names a concrete field/shot rather than a vague
 * pacing note.
 */
function buildFormatProfilePromptBlock(
  profile: VerticalDramaFormatProfile | undefined,
  locale: VerticalDramaSeriesLocale
): string | null {
  if (!profile || profile.tier === "standard") return null;
  const guidance =
    locale === "th"
      ? profile.beatDensityGuidanceTh
      : profile.beatDensityGuidanceEn;
  const hookInstruction = profile.perEpisodeHookRule.requireColdOpenHook
    ? ` Shot 1 of EVERY episode in this chunk must function as a cold-open hook that lands within the first ${profile.perEpisodeHookRule.hookWithinSeconds} seconds of the episode — no slow scene-setting before it.`
    : "";
  return `FORMAT PROFILE (${profile.nameTh} / ${profile.tier}, short-season mode): ${guidance}${hookInstruction}`;
}

/* -------------------------------------------------------------------------- */
/* Season-level product tie-in draft awareness (task #22, spec §7.7.2/§7.7.3, */
/* added 2026-07-09)                                                          */
/*                                                                            */
/* Deep-draft generation was, until now, completely product-blind — only the  */
/* per-episode SCRIPT layer (`verticalDramaScriptGeneration.ts`'s            */
/* `episodeTieInPlacement`, task #31) knew about season-planned tie-in        */
/* placements. This section threads the SAME `VerticalDramaEpisodeTieInPlacement` */
/* decisions (built + persisted by `verticalDramaSeries.ts`'s                */
/* `resolveTieInDraftBootstrap`, never by this file) into the DRAFT/REVISE    */
/* prompt builders below, so the season-level 9-shot drafts weave the product */
/* into the RIGHT episodes and mark WHICH shot carries it — see              */
/* `reconcileTieInDraftMarking` further below for the post-chunk consistency  */
/* check. `VdTieInDraftContext` is optional/additive at every call site: when */
/* absent, every helper here is a no-op and every prompt this section touches */
/* stays byte-identical to before task #22.                                   */
/* -------------------------------------------------------------------------- */

export interface VdTieInDraftPlacementEntry {
  episodeNumber: number;
  placement: VerticalDramaEpisodeTieInPlacement;
}

/**
 * This run's product identity + per-episode placement plan. Built ONLY by
 * `verticalDramaSeries.ts`'s `resolveTieInDraftBootstrap` (reads the series'
 * `productTieIn` policy + the active breakdown's `tieIn` fields, bootstrapping
 * the latter via the canonical `planSeasonTieInPlacements` when no item has
 * one yet) — this file never plans/derives a placement decision itself (see
 * `VerticalDramaEpisodeTieInPlacement`'s own import doc comment above).
 */
export interface VdTieInDraftContext {
  /**
   * Always a non-empty display name — the router substitutes "the product"
   * when the stored config's own `productName` is blank, mirroring
   * `verticalDramaScriptGeneration.ts`'s own per-episode-script fallback
   * (`tieIn.productName ?? "the product"`).
   */
  productName: string;
  productCategory?: string;
  /**
   * Series-wide default benefit/talking-point fallback, used ONLY when a
   * given episode's OWN `placement.benefitFocus` is absent. No current UI
   * writes a `benefitFocus` key into the series' `productTieIn` blob — read
   * defensively here (forward-compatible), the same way
   * `verticalDramaEpisodePipeline.ts` already reads `productDescription`
   * even though no UI writes THAT key either.
   */
  benefitFocus?: string;
  forbiddenClaims: string[];
  /** One entry per active-breakdown episode that already carries a `tieIn` decision (`planned` true OR false) — see `planSeasonTieInPlacements`. */
  placements: VdTieInDraftPlacementEntry[];
}

/**
 * Looks up `episodeNumber`'s placement decision. `undefined` when `context`
 * is absent OR (defensively) this run's placements simply have no entry for
 * this episode — should not happen once bootstrapped, since
 * `planSeasonTieInPlacements` stamps a `tieIn` on every item it touches, but
 * never assumed.
 */
function findTieInDraftPlacement(
  context: VdTieInDraftContext | undefined,
  episodeNumber: number
): VerticalDramaEpisodeTieInPlacement | undefined {
  return context?.placements.find(p => p.episodeNumber === episodeNumber)
    ?.placement;
}

/**
 * General, episode-INDEPENDENT product-tie-in rules appended to a draft/
 * revise systemPrompt: product identity, forbidden claims (verbatim), the
 * natural-integration/no-ad-speak requirement, and the requirement to mark
 * the ONE shot that carries the placement. `null` (renders nothing —
 * `.filter(Boolean)` drops it, matching `buildFormatProfilePromptBlock`'s own
 * convention) when `context` is absent. Per-episode planned/not-planned
 * specifics are rendered separately, into the userPrompt DATA payload (see
 * `buildTieInDraftEpisodePayloadField`) — this block only ever states the
 * RULES, never a specific episode's plan.
 */
function buildTieInDraftSystemBlock(
  context: VdTieInDraftContext | undefined
): string | null {
  if (!context) return null;
  const forbidden =
    context.forbiddenClaims.length > 0
      ? context.forbiddenClaims.join("; ")
      : "(none specified)";
  return [
    `PRODUCT TIE-IN (season plan): this season has a planned product tie-in for "${context.productName}"${context.productCategory ? ` (category: ${context.productCategory})` : ""}. Each episode's data below states "productTieIn.planned" true or false for THAT episode — follow it exactly, this is a season-level planning decision, not yours to make.`,
    `For a "planned": true episode: weave the product naturally into exactly ONE shot's beat, like real TV-drama product placement — it must serve that scene's story beat (never unrealistically resolve the main conflict, never read like an advertisement/ad-speak). NEVER use any of these forbidden claims, verbatim or in spirit: ${forbidden}. Mark that ONE shot's "tie_in" as {"has_product_moment": true, "benefit_line": "<short natural in-scene benefit line the dialogue or visual can carry>"}; every OTHER shot in that episode must omit "tie_in" (or set "has_product_moment": false).`,
    `For a "planned": false episode: do NOT introduce, mention, or visually feature the product at all this episode — every shot omits "tie_in" (or sets "has_product_moment": false).`,
  ].join("\n");
}

/**
 * Per-episode PLANNED/NOT-PLANNED data attached to a draft/revise userPrompt
 * episode payload entry (mirrors how `contentBudget` is already attached
 * per-episode in `buildDeepDraftPrompts` below) — `undefined` when `context`
 * is absent, so the caller's spread adds no extra key, byte-identical to
 * before task #22.
 */
function buildTieInDraftEpisodePayloadField(
  context: VdTieInDraftContext | undefined,
  episodeNumber: number
): Record<string, unknown> | undefined {
  if (!context) return undefined;
  const placement = findTieInDraftPlacement(context, episodeNumber);
  if (placement?.planned === true) {
    return {
      planned: true,
      benefit_focus: placement.benefitFocus ?? context.benefitFocus ?? null,
      intensity: placement.intensity ?? "light",
      instruction:
        placement.intensity === "featured"
          ? "Give the product a prominent, hero-prop moment in the one shot you mark."
          : "Keep the product naturally in the background/daily-use register in the one shot you mark.",
    };
  }
  return {
    planned: false,
    instruction: "No product this episode — do not introduce it.",
  };
}

/**
 * JSON-shape suffix appended to a shot object's literal shape spec inside a
 * "Respond with ONLY..." instruction — empty string (no change to that line)
 * when `context` is absent, keeping it byte-identical to before task #22.
 */
function tieInDraftShotShapeSuffix(
  context: VdTieInDraftContext | undefined
): string {
  return context
    ? ', "tie_in": {"has_product_moment": boolean, "benefit_line": string}'
    : "";
}

/**
 * Feature 132 §6.1 (F132C, scene-contracts) — JSON-shape suffix appended to
 * a shot object's literal shape spec inside a "Respond with ONLY..."
 * instruction, mirroring `tieInDraftShotShapeSuffix`'s own "empty string
 * when disabled" convention — empty string (no change to that line) when
 * `enabled` is falsy, keeping it byte-identical to before F132C.
 */
function sceneContractShotShapeSuffix(enabled: boolean | undefined): string {
  return enabled
    ? ', "contract": {"storyFunction": string, "emotionalBeat": string, "audienceTakeaway": string, "tensionSource": string, "newClueIds": string[], "dialoguePurpose": string, "characterDecision": string, "continuityDependency": string, "anchorLine": boolean}'
    : "";
}

/**
 * Feature 132 §6.1 (F132C) — the flag-gated system-prompt instruction block
 * requiring each shot's `contract` object, the ≤2-`newClueIds` budget, and
 * the canonical anchor-line-cadence predicate (verbatim — this EXACT
 * wording is also used by `meetsPremiumDraftContractFloor` and
 * `validateStagePayload`, so prompt text and gate checks never drift).
 * `null` (renders nothing) when `enabled` is falsy — byte-identical to
 * before F132C.
 */
function buildSceneContractPromptBlock(enabled: boolean | undefined): string | null {
  if (!enabled) return null;
  return [
    getVerticalDramaQualityCriteriaBundle().sceneContractRequirements,
    'Every shot\'s JSON object must ALSO include a "contract" object with these 6 required fields: "storyFunction" (one clear function for this shot), "emotionalBeat" (one beat), "audienceTakeaway" (what the viewer must retain), "tensionSource" (the conflict/pressure present in this shot), "newClueIds" (array of new important names/objects/dates/lore terms this shot introduces — at most 2 per shot), "dialoguePurpose" (what the dialogue in this shot is for); and these 3 optional fields when applicable: "characterDecision" (set when a decision happens in this shot), "continuityDependency" (the earlier fact this shot relies on, if any), "anchorLine" (true when this shot carries an anchor line).',
    "Anchor-line cadence (hard requirement): no run of 3 or more consecutive shots without anchorLine: true (equivalently: for every 3 consecutive shots, at least 1 has anchorLine: true).",
  ].join("\n");
}

/**
 * Feature 132 §4.2.7 (F132A) — deterministic, no-LLM premise-coverage guard
 * over a just-drafted set of deep-draft episodes, reusing the SAME
 * `evaluatePremiseCoverage` heuristic `verticalDramaPresetSynthesis.ts` uses
 * at synthesis time. No-op (returns `warnings` unchanged, same reference)
 * when `userPremise` is absent/blank or nothing was drafted this run.
 * `VdDeepDraftWarning` has no free-text field, so the appended entry is
 * season-level (`episodeNumber: 0`, `shotNumber: 0`), mirroring
 * `"episode_missing_after_retry"`'s own episode-level convention above.
 * Shared by BOTH `generateStoryBibleDeep` (standard) and
 * `generateStoryBibleDeepPremium`.
 */
function appendDeepDraftPremiseCoverageWarning(
  warnings: VdDeepDraftWarning[],
  userPremise: string | undefined,
  draftedItems: Array<Pick<DeepDraftedEpisodeItem, "shotDrafts" | "cliffhanger_line">>,
  openThreads: string[]
): VdDeepDraftWarning[] {
  const trimmed = userPremise?.trim();
  if (!trimmed || draftedItems.length === 0) return warnings;

  const mainPlot = draftedItems
    .flatMap(item =>
      item.shotDrafts.flatMap(shot => [
        shot.summary,
        ...shot.dialogue_lines.map(line => line.line),
      ])
    )
    .join(" ");
  const logline = draftedItems
    .map(item => item.cliffhanger_line ?? "")
    .filter(Boolean)
    .join(" ");

  const coverage = evaluatePremiseCoverage(trimmed, {
    logline,
    mainPlot,
    seasonArc: openThreads.join(" "),
  });
  if (coverage.covered) return warnings;

  return [
    ...warnings,
    { episodeNumber: 0, shotNumber: 0, reason: "premise_coverage_low" as const },
  ];
}

/**
 * Deterministic post-chunk reconciliation (task #22) between the season plan
 * (`context.placements[].placement.planned`) and what the drafted shots
 * actually marked: every PLANNED episode must end up with >= 1 shot marked
 * `tie_in.has_product_moment: true`; every episode NOT planned must have
 * NONE. A violation is reported as a `VdDeepDraftWarning` (reusing the
 * existing warnings channel — this NEVER fails the run, only surfaces a
 * signal) and counted for `GenerateStoryBibleDeepResult.tieInMismatchCount`.
 * Called once, at the very end of BOTH `generateStoryBibleDeep` (standard)
 * and `generateStoryBibleDeepPremium`, over the FULL set of episodes drafted
 * this run. Pure/no-op (`{ warnings: [], mismatchCount: 0 }`) when `context`
 * is absent — byte-identical to before this feature existed.
 */
export function reconcileTieInDraftMarking(
  draftedItems: Array<{ episodeNumber: number; shotDrafts: VdDeepDraftShotDraft[] }>,
  context: VdTieInDraftContext | undefined
): { warnings: VdDeepDraftWarning[]; mismatchCount: number } {
  if (!context) return { warnings: [], mismatchCount: 0 };
  const warnings: VdDeepDraftWarning[] = [];
  for (const item of draftedItems) {
    const planned =
      findTieInDraftPlacement(context, item.episodeNumber)?.planned === true;
    const markedShot = item.shotDrafts.find(
      shot => shot.tie_in?.has_product_moment === true
    );
    if (planned && !markedShot) {
      warnings.push({
        episodeNumber: item.episodeNumber,
        shotNumber: 0,
        reason: "tie_in_placement_mismatch",
      });
    } else if (!planned && markedShot) {
      warnings.push({
        episodeNumber: item.episodeNumber,
        shotNumber: markedShot.shot_number,
        reason: "tie_in_placement_mismatch",
      });
    }
  }
  return { warnings, mismatchCount: warnings.length };
}

function buildDeepDraftPrompts(params: {
  title: string;
  locale: VerticalDramaSeriesLocale;
  genre?: string | null;
  tone?: string | null;
  chunkEpisodes: StoredEpisodeBreakdownItem[];
  recapItems: DeepDraftRecapEpisode[];
  openThreads: string[];
  /**
   * Dramaturgy critic (W11.5, added 2026-07-08) — the series' full planned
   * episode count, used ONLY to detect whether THIS chunk contains the
   * season finale (`chunkEpisodes` includes `episodeNumber ===
   * totalEpisodeCount`), in which case the finale's entry is additionally
   * asked for `price_paid`. Optional — omitted entirely means "never the
   * finale chunk" (no `price_paid` request), which keeps every caller that
   * predates this field (including every existing test's direct
   * `buildDeepDraftPrompts`-adjacent call through `generateStoryBibleDeep`)
   * byte-identical aside from the always-on `antagonist_tactics`/
   * `character_decisions` request below.
   */
  totalEpisodeCount?: number;
  /**
   * Format profiles (task #23, added 2026-07-08) — a resolved
   * `VerticalDramaFormatProfile` (see `@shared/verticalDramaSeries/
   * formatProfiles`), threaded straight through from
   * `GenerateStoryBibleDeepParams.formatProfilesEnabled`. Optional —
   * `undefined` (every caller that predates this field, or any run with the
   * flag off) renders NO "FORMAT PROFILE" block at all, byte-identical to
   * before this field existed. A `"standard"`-tier profile ALSO renders no
   * block (see `buildFormatProfilePromptBlock`) — only `"ultra_short"`/
   * `"short"` change the prompt.
   */
  formatProfile?: VerticalDramaFormatProfile;
  /**
   * Task #22 (added 2026-07-09) — this run's product tie-in identity + per-
   * episode placement plan. Optional — `undefined` (every caller that
   * predates this field, or any run with the `verticalDramaSeriesTieInReplan`
   * flag off / the series' tie-in disabled) renders NO tie-in content at all,
   * byte-identical to before this feature existed. See the "Season-level
   * product tie-in draft awareness" section above for the full design.
   */
  tieInDraftContext?: VdTieInDraftContext;
  /** Feature 132 §4.2.7 (F132A) — see `GenerateStoryBibleDeepParams.userPremise`'s own doc comment. */
  userPremise?: string;
  /** Feature 132 §6 (F132C) — see `GenerateStoryBibleDeepParams.sceneContractsEnabled`'s own doc comment. */
  sceneContractsEnabled?: boolean;
}): { systemPrompt: string; userPrompt: string } {
  const langInstruction =
    params.locale === "th"
      ? "Write every dialogue line, shot summary, and cliffhanger line in natural, speakable Thai."
      : `Write every dialogue line, shot summary, and cliffhanger line in ${verticalDramaLocaleEnglishName(params.locale)}.`;

  const perShotBudgets = derivePerShotSpeechBudgets([
    ...VERTICAL_DRAMA_DURATION_PROFILE_FALLBACK.shotDurationsSeconds,
  ]);
  const perShotBandText = perShotBudgets
    .map(
      b =>
        `shot ${b.shotNumber} (${b.clipDurationSeconds}s clip): ~${b.targetSpeechSeconds.toFixed(1)}s target, ${b.minSpeechSeconds.toFixed(1)}s minimum`
    )
    .join("; ");

  // Dramaturgy critic (W11.5) — bible-level fields (protagonist_stake/
  // world_rules) are requested ONCE, on whichever chunk covers episode 1;
  // price_paid is requested ONLY on the chunk covering the season finale.
  // Both flags are `false` when `totalEpisodeCount` is omitted, so a caller
  // that predates this field never sees these two conditional instructions.
  const includeBibleLevelFields = params.chunkEpisodes.some(
    ep => ep.episodeNumber === 1
  );
  const isFinaleChunk =
    params.totalEpisodeCount != null &&
    params.chunkEpisodes.some(
      ep => ep.episodeNumber === params.totalEpisodeCount
    );

  const systemPrompt = [
    renderCriteriaVersionMarker(),
    "You are a vertical-drama (short-form mobile drama series) shot-dialogue writer.",
    `For EACH episode listed below, write a draft of EXACTLY ${VD_DEEP_DRAFT_SHOTS_PER_EPISODE} numbered shots ("shot_number" 1-${VD_DEEP_DRAFT_SHOTS_PER_EPISODE}, in order) with speakable dialogue that fills that shot's speech budget.`,
    langInstruction,
    params.locale === "th" ? VD_NATURAL_THAI_DIALOGUE_RULES : null,
    'SPEAKABILITY RULES (hard requirement): every "line" must be literally speakable as written — no wrapping quote marks, no parenthetical stage direction, no symbols (~ * [ ] / ` < > _), no em-dash as a spoken beat (use a comma instead), at most one "…" per line, no emoji. Put delivery/emotion notes in the separate "delivery" field, NEVER inside "line" itself. A shot that is only an animal/ambient sound or otherwise wordless must set "silence_intent" instead of writing the sound as a dialogue line.',
    'A shot must NEVER set BOTH "silence_intent" and one or more "dialogue_lines" — pick exactly one: give it real speakable dialogue, or mark it "silence_intent" only if it truly has no speech at all.',
    `Per-shot speech budget for the standard 60-second/${VD_DEEP_DRAFT_SHOTS_PER_EPISODE}-shot episode profile: ${perShotBandText}. Give each speaking shot enough "dialogue_lines" to reach its target — do not leave a speaking shot underfilled.`,
    'Keep each episode\'s reversal/escalation grammar consistent with its "contentBudget" when one is given: honor "conflictLevel"\'s position on the season escalation curve and land at least "reversalTarget" reversals across that episode\'s shots.',
    'For each episode, ALSO include (when applicable to that episode\'s content) "antagonist_tactics": short tags naming the concrete tactic(s) the antagonist/villain uses THIS episode (e.g. "threaten", "swap_documents", "silence_witness") — vary the tactic across episodes rather than repeating the same one over and over; and "character_decisions": an array of {"character": name, "decision": short description} listing every named character who makes a real, SELF-DIRECTED decision (not just something that happens TO them) in this episode — give every character with meaningful screen time at least one decision somewhere across the season, not only the protagonist.',
    includeBibleLevelFields
      ? 'This chunk includes EPISODE 1. Episode 1\'s entry MUST ALSO include, ONCE for the whole season: "protagonist_stake" — one concrete sentence stating the protagonist\'s PERSONAL reason to be involved (a real personal stake, not just "helps other people"); and "world_rules" — an array of {"rule": string, "limit_or_cost": string} systematizing every fantasy/supernatural rule this season relies on (when/how it triggers, what confirms it, whether it can be faked, its limit or cost) — return an empty array if the season has no such rule system.'
      : null,
    isFinaleChunk
      ? `This chunk includes the SEASON FINALE (episode ${params.totalEpisodeCount}). That episode's entry MUST ALSO include "price_paid": one concrete sentence naming the real cost, sacrifice, or consequence the protagonist(s) pay to resolve the season — the ending must not be free.`
      : null,
    buildFormatProfilePromptBlock(params.formatProfile, params.locale),
    buildTieInDraftSystemBlock(params.tieInDraftContext),
    buildSceneContractPromptBlock(params.sceneContractsEnabled),
    "Respond with ONLY a single JSON object (no markdown, no commentary) matching exactly this shape:",
    `{"episodeBreakdown": [{"episodeNumber": number, "workingTitle": string, "logline": string, "keyBeats": string[], "shotDrafts": [{"shot_number": number, "summary": string, "dialogue_lines": [{"speaker": string, "line": string, "delivery": string}], "silence_intent": "dramatic_pause"|"action_visual"|"montage"|"establishing"${tieInDraftShotShapeSuffix(params.tieInDraftContext)}${sceneContractShotShapeSuffix(params.sceneContractsEnabled)}}], "cliffhanger_line": string, "antagonist_tactics": string[], "character_decisions": [{"character": string, "decision": string}], "protagonist_stake": string, "world_rules": [{"rule": string, "limit_or_cost": string}], "price_paid": string}], "open_threads": string[]}`,
    `"episodeBreakdown" must contain exactly ${params.chunkEpisodes.length} entries — one per episode listed below, using the SAME episodeNumber/workingTitle/logline/keyBeats given (do not rename or renumber) — each with EXACTLY ${VD_DEEP_DRAFT_SHOTS_PER_EPISODE} "shotDrafts".`,
    '"open_threads" must be the UPDATED list of unresolved plot threads/hooks after these episodes: carry forward every thread you were given that is still open, add any new thread you introduce, and drop any thread you fully resolve.',
  ]
    .filter(Boolean)
    .join("\n");

  const trimmedUserPremiseForDeepDraft = params.userPremise?.trim();
  const userPremiseBlockForDeepDraft = trimmedUserPremiseForDeepDraft
    ? `USER PREMISE (PRIMARY):\n${trimmedUserPremiseForDeepDraft}\nThis premise is the PRIMARY story spine — keep every drafted shot consistent with it.`
    : null;

  const episodesPayload = params.chunkEpisodes.map(ep => ({
    episodeNumber: ep.episodeNumber,
    workingTitle: ep.workingTitle,
    logline: ep.logline,
    keyBeats: ep.keyBeats,
    contentBudget: ep.contentBudget ?? null,
    ...(buildTieInDraftEpisodePayloadField(params.tieInDraftContext, ep.episodeNumber)
      ? { productTieIn: buildTieInDraftEpisodePayloadField(params.tieInDraftContext, ep.episodeNumber) }
      : {}),
  }));

  const recapText = buildDeepDraftContinuityRecap(
    params.recapItems,
    params.openThreads
  );

  const userPrompt = [
    userPremiseBlockForDeepDraft,
    `Series title: ${params.title}`,
    params.genre ? `Genre: ${params.genre}` : null,
    params.tone ? `Tone: ${params.tone}` : null,
    recapText,
    `Already-planned episodes to draft shots for: ${JSON.stringify(episodesPayload)}`,
    VD_COMPACT_JSON_INSTRUCTION,
  ]
    .filter(Boolean)
    .join("\n");

  return { systemPrompt, userPrompt };
}

/* -------------------------------------------------------------------------- */
/* Deep story drafts — main chunked generation entry point (W10-A)            */
/* -------------------------------------------------------------------------- */

export interface GenerateStoryBibleDeepParams {
  userId: number;
  tenantId?: string;
  seriesId: number;
  title: string;
  locale: VerticalDramaSeriesLocale;
  genre?: string | null;
  tone?: string | null;
  /**
   * Reserved for future duration-aware prompting; the per-shot band always
   * uses the fixed 60s/9-shot profile today (see `buildDeepDraftPrompts`).
   */
  episodeDurationSeconds?: number;
  /** Already-planned episodes (from the active breakdown) to draft shots for, any order — sorted ascending internally. */
  episodes: StoredEpisodeBreakdownItem[];
  /**
   * Continuity seed from episodes ALREADY drafted before this run (used by
   * `extendStoryDraftHorizon`'s router mutation) — omitted/empty for a
   * first-ever deep-generation run over a series.
   */
  priorRecap?: {
    items: DeepDraftRecapEpisode[];
    openThreads: string[];
  };
  /**
   * Premium multi-round drafts (W11-A, added 2026-07-08) — `"standard"`
   * (the default, including when omitted entirely) runs the EXACT W10-A
   * pipeline below, byte-identical. `"premium"` delegates to
   * `generateStoryBibleDeepPremium` (see the "Premium multi-round generation
   * pipeline" section near the end of this file) instead: per-chunk 3-way
   * fan-out -> deterministic gates -> LLM judge -> targeted revise loop with
   * a regression guard, plus a one-time season continuity sweep.
   */
  mode?: "standard" | "premium";
  /**
   * Dramaturgy critic (W11.5, added 2026-07-08) — the series' full planned
   * episode count, threaded straight through to `buildDeepDraftPrompts`
   * (see its own doc comment) so the chunk covering the season finale is
   * asked for `price_paid`. Optional — omitted disables that one request,
   * every other prompt/schema addition stays on regardless.
   */
  totalEpisodeCount?: number;
  /**
   * Format profiles (task #23, added 2026-07-08) — when `true` AND
   * `totalEpisodeCount` is ALSO given, resolves a `VerticalDramaFormatProfile`
   * from `totalEpisodeCount` (`resolveVerticalDramaFormatProfile`, see
   * `@shared/verticalDramaSeries/formatProfiles`) and threads it into the
   * deep-draft chunk prompt (`buildFormatProfilePromptBlock` — a no-op for
   * the `"standard"` tier) and, for `mode: "premium"`, the judge's
   * `hook_strength` floor (`meetsPremiumDraftFloor`). Deliberately requires
   * BOTH flags: `totalEpisodeCount` alone already existed for a narrower
   * purpose (the finale `price_paid` request) and this call's own
   * `episodes` slice may be a partial horizon (e.g. `extendStoryDraftHorizon`),
   * so `totalEpisodeCount` — the FULL planned season length — is the only
   * safe source for tier resolution.
   *
   * Optional, defaults to `false` — TEMPORARY flag-pending gate (see
   * `VD_FORMAT_PROFILES_ROLLOUT` in that module; the conductor swaps this to
   * a real feature-flag check at every call site once F131X
   * `verticalDramaSeriesFormatProfiles` is registered). Omitting it is
   * BYTE-IDENTICAL to before this field existed.
   */
  formatProfilesEnabled?: boolean;
  /**
   * Async story jobs (#28, added 2026-07-08) — optional, fire-and-forget
   * progress notifications for the caller's job-record store
   * (`services/verticalDramaStoryJobs.ts`). Additive only: omitting it is
   * byte-identical to before this param existed — every call site below
   * uses `params.onProgress?.(...)`, a pure no-op when absent. NEVER
   * awaited by this file (a slow/failing progress sink must never affect
   * generation timing or throw into the real generation flow).
   */
  onProgress?: VdStoryDraftProgressCallback;
  /**
   * Task #22 (season-level product tie-in draft awareness, added
   * 2026-07-09) — this run's product identity + per-episode placement plan,
   * built by `verticalDramaSeries.ts`'s `resolveTieInDraftBootstrap`.
   * Threaded into every chunk's draft/revise prompts (standard AND premium —
   * see `buildDeepDraftPrompts`/`buildPremiumRevisePrompts`) and, for
   * `mode: "premium"`, the judge's `tie_in_naturalness` dimension. Optional —
   * `undefined` (every existing caller, or any run with the
   * `verticalDramaSeriesTieInReplan` flag off / the series' tie-in disabled)
   * is BYTE-IDENTICAL to before this feature existed: no tie-in prompt
   * content, no `tie_in_naturalness` judging, no reconciliation warnings, no
   * `GenerateStoryBibleDeepResult.tieInMismatchCount`.
   */
  tieInDraftContext?: VdTieInDraftContext;
  /**
   * Feature 132 §4.2.7 (F132A, user-premise-preset-mix) — see
   * `GenerateStoryBibleParams.userPremise`'s own doc comment; same contract,
   * threaded into `buildDeepDraftPrompts` (standard AND premium — both share
   * that one function) instead of `buildPrompts`.
   */
  userPremise?: string;
  /**
   * Feature 132 §6 (F132C, scene-contracts) — when `true`, `buildDeepDraftPrompts`
   * additionally requests a per-shot `contract` object (see `shotContractSchema`)
   * and the premium pipeline's deterministic gate
   * (`meetsPremiumDraftContractFloor`) enforces it. Optional, defaults to
   * `false`/falsy — omitting it is BYTE-IDENTICAL to before this field
   * existed (spec §16.5 "flag-off = current behavior").
   */
  sceneContractsEnabled?: boolean;
}

/**
 * Async story jobs (#28) — progress phases shared by the deep-draft chunk
 * loop (standard + premium), `critiqueSeasonDrafts`, and `applySeasonCritique`.
 * Structurally mirrored (not imported) by `services/verticalDramaStoryJobs.ts`'s
 * own `VerticalDramaStoryJobProgress` — this file has no dependency on that
 * one, avoiding any service/service coupling for a pure notification type.
 *  - "outline"  — season-level structural pass (the premium pipeline's
 *                 one-time continuity sweep).
 *  - "ledger"   — Feature 132 §5 ledger_plan step, emitted by the story-job
 *                 executor before per-episode drafting when F132B is enabled.
 *  - "draft"    — a chunk's fan-out/generation call(s).
 *  - "review"   — a chunk's judge/scoring call.
 *  - "fix"      — a targeted revise call for specific episode(s)
 *                 (`episodesDone` names them) — premium's per-chunk revise
 *                 rounds, the season-sweep spot-revise, and
 *                 `applySeasonCritique`'s batched revise calls.
 *  - "reading"  — `critiqueSeasonDrafts`'s single whole-season critique call.
 */
export type VdStoryDraftProgressPhase =
  | "outline"
  | "ledger"
  | "draft"
  | "review"
  | "fix"
  | "reading";

export interface VdStoryDraftProgressEvent {
  phase: VdStoryDraftProgressPhase;
  /** 1-based index of the current call-round (chunk / revise-round) within this run, when applicable. */
  chunkIndex?: number;
  /** Total call-rounds expected for this run, when known upfront. */
  chunkCount?: number;
  /** Running count of individual LLM calls completed so far in this run. */
  callsDone?: number;
  /** Episode numbers this event's "fix" work targets (mainly meaningful for phase "fix"). */
  episodesDone?: number[];
}

export type VdStoryDraftProgressCallback = (
  event: VdStoryDraftProgressEvent
) => void;

/** A single deep-drafted episode's NEW fields — merged onto its existing breakdown item by the router. */
export type DeepDraftedEpisodeItem = {
  episodeNumber: number;
  shotDrafts: VdDeepDraftShotDraft[];
  cliffhanger_line?: string;
  draftCompleteness: VdDeepDraftCompleteness;
  /** Premium multi-round drafts (W11-A) — present only when `mode: "premium"` produced this episode. */
  draftScorecard?: VdPremiumDraftScorecard;
  /**
   * Dramaturgy critic (W11.5) — structural fields carried straight through
   * from the raw LLM response (see `episodeBreakdownItemSchema`'s own doc
   * comments on each). All optional; a caller that predates W11.5 (or a
   * response that simply omitted one) leaves it `undefined`, matching
   * `cliffhanger_line`'s own existing optionality.
   */
  antagonist_tactics?: string[];
  character_decisions?: VdCharacterDecision[];
  protagonist_stake?: string;
  world_rules?: VdWorldRule[];
  price_paid?: string;
};

/**
 * Dramaturgy critic (W11.5) — copies the 5 structural fields (see
 * `episodeBreakdownItemSchema`) from a raw LLM episode response onto a
 * `DeepDraftedEpisodeItem`-shaped object, omitting any field the response
 * left out entirely (never stamps an explicit `undefined` key — mirrors this
 * file's established "omit, don't null" convention for optional fields).
 * Shared by BOTH standard mode's chunk loop and premium mode's gating step
 * below, so both pipelines read these fields identically.
 */
function extractDramaturgyStructureFields(raw: {
  antagonist_tactics?: string[];
  character_decisions?: VdCharacterDecision[];
  protagonist_stake?: string;
  world_rules?: VdWorldRule[];
  price_paid?: string;
}): Pick<
  DeepDraftedEpisodeItem,
  | "antagonist_tactics"
  | "character_decisions"
  | "protagonist_stake"
  | "world_rules"
  | "price_paid"
> {
  return {
    ...(raw.antagonist_tactics
      ? { antagonist_tactics: raw.antagonist_tactics }
      : {}),
    ...(raw.character_decisions
      ? { character_decisions: raw.character_decisions }
      : {}),
    ...(raw.protagonist_stake
      ? { protagonist_stake: raw.protagonist_stake }
      : {}),
    ...(raw.world_rules ? { world_rules: raw.world_rules } : {}),
    ...(raw.price_paid ? { price_paid: raw.price_paid } : {}),
  };
}

/** Plain shape `mergeDramaturgyStructureFields` reads from both `newer`/`prior`. */
type DramaturgyStructureFieldsLike = {
  antagonist_tactics?: string[];
  character_decisions?: VdCharacterDecision[];
  protagonist_stake?: string;
  world_rules?: VdWorldRule[];
  price_paid?: string;
};

/**
 * Dramaturgy critic (W11.5) — carries a structural field FORWARD from
 * `prior` when a revision/spot-revise response didn't re-emit it. The
 * premium revise/sweep prompts ask for these fields too (see
 * `buildPremiumRevisePrompts`), but a lenient model can still omit one —
 * this stops that from silently erasing already-known season structure.
 * `newer` always wins when it actually has a value for a given field.
 */
function mergeDramaturgyStructureFields(
  newer: DramaturgyStructureFieldsLike,
  prior: DramaturgyStructureFieldsLike
): DramaturgyStructureFieldsLike {
  return {
    ...(newer.antagonist_tactics
      ? { antagonist_tactics: newer.antagonist_tactics }
      : prior.antagonist_tactics
        ? { antagonist_tactics: prior.antagonist_tactics }
        : {}),
    ...(newer.character_decisions
      ? { character_decisions: newer.character_decisions }
      : prior.character_decisions
        ? { character_decisions: prior.character_decisions }
        : {}),
    ...(newer.protagonist_stake
      ? { protagonist_stake: newer.protagonist_stake }
      : prior.protagonist_stake
        ? { protagonist_stake: prior.protagonist_stake }
        : {}),
    ...(newer.world_rules
      ? { world_rules: newer.world_rules }
      : prior.world_rules
        ? { world_rules: prior.world_rules }
        : {}),
    ...(newer.price_paid
      ? { price_paid: newer.price_paid }
      : prior.price_paid
        ? { price_paid: prior.price_paid }
        : {}),
  };
}

export interface GenerateStoryBibleDeepResult {
  /** Only episodes whose chunk actually succeeded — in ascending episodeNumber order. */
  draftedItems: DeepDraftedEpisodeItem[];
  /** Sizes of the chunks that actually COMPLETED (see `partial`). */
  chunkSizes: number[];
  /** True when at least one chunk succeeded but a LATER chunk failed — completed chunks are still returned, never discarded. */
  partial: boolean;
  creditsUsed: number;
  model: string;
  warnings: VdDeepDraftWarning[];
  /** The last known `open_threads` list — usable as the seed for a follow-up `extendStoryDraftHorizon` call. */
  finalOpenThreads: string[];
  /** Set only when `partial` is true — the error that stopped the run after at least one chunk succeeded. */
  error?: string;
  /** Premium multi-round drafts (W11-A) — present only when `mode: "premium"` was used AND at least one episode was drafted. */
  premiumMetrics?: VdPremiumDeepDraftMetrics;
  /**
   * Live-bug fix (chunk under-count no longer accepted silently, added
   * 2026-07-08) — requested episode numbers that STILL have no `shotDrafts`
   * after this run's chunk processing, including the ONE corrective retry
   * each affected chunk got via `reconcileDeepDraftChunkEpisodes`. Always
   * `[]` when every requested episode was successfully drafted (the
   * overwhelmingly common case) — always present (never `undefined`), same
   * convention as `warnings`/`finalOpenThreads` above. A non-empty value
   * always implies `partial: true` (the chunk that produced the gap is the
   * LAST chunk this run processed — see the main loop below — so
   * `horizonEndEpisode`, computed by the router as
   * `max(draftedItems[].episodeNumber)`, stays an honest, contiguous value).
   */
  missingEpisodes: number[];
  /**
   * Task #22 (added 2026-07-09) — count of tie-in placement/draft-marking
   * mismatches found by `reconcileTieInDraftMarking` this run (see
   * `VdDeepDraftWarning`'s `"tie_in_placement_mismatch"` reason for the
   * per-episode detail, included in `warnings` above). `undefined` when
   * `params.tieInDraftContext` was not supplied this run (grandfather / flag
   * off / tie-in disabled) — always a NUMBER (including `0`, meaning "fully
   * reconciled") whenever tie-in draft awareness was active.
   */
  tieInMismatchCount?: number;
}

/**
 * Chunked bible-stage deep-draft generation (owner-approved design, W10-A):
 * for every episode in `params.episodes`, draft a full 9-shot breakdown with
 * speakable dialogue, split across `computeDeepDraftChunkSizes`-sized LLM
 * calls with real cross-chunk continuity (`buildDeepDraftContinuityRecap`).
 *
 * Credits: the TOTAL pre-check (`chunks.length * VD_DEEP_DRAFT_PER_CALL_CREDIT_ESTIMATE`)
 * runs once, BEFORE the first call (mirrors `generateStoryBible`'s own
 * `hasEnoughCredits` gate); each chunk's REAL cost is deducted immediately
 * after that chunk succeeds (mirrors `generateStoryBible`'s own
 * check -> call -> deduct convention, repeated per chunk).
 *
 * Partial-failure semantics: if a chunk fails AFTER at least one earlier
 * chunk already succeeded, the run stops and returns normally with
 * `partial: true` — every already-drafted episode is preserved in
 * `draftedItems` (never discarded) so the caller can persist what
 * succeeded. If the VERY FIRST chunk fails, there is nothing to persist, so
 * this throws the underlying error exactly like a single-call
 * `generateStoryBible` failure (`InsufficientCreditsError`/
 * `VdSchemaValidationError`/provider error).
 */
export async function generateStoryBibleDeep(
  params: GenerateStoryBibleDeepParams
): Promise<GenerateStoryBibleDeepResult> {
  // Premium multi-round drafts (W11-A) — a mode switch to an entirely
  // separate function, so the standard body below is NEVER touched by the
  // premium pipeline and stays byte-identical to W10-A (spec: "standard mode
  // + flag-off byte-identical"). See `generateStoryBibleDeepPremium` near the
  // end of this file.
  if (params.mode === "premium") {
    return generateStoryBibleDeepPremium(params);
  }

  const episodes = [...params.episodes].sort(
    (a, b) => a.episodeNumber - b.episodeNumber
  );
  if (episodes.length === 0) {
    return {
      draftedItems: [],
      chunkSizes: [],
      partial: false,
      creditsUsed: 0,
      model: "",
      warnings: [],
      finalOpenThreads: params.priorRecap?.openThreads ?? [],
      missingEpisodes: [],
    };
  }

  const chunkSizes = computeDeepDraftChunkSizes(episodes.length);
  const totalEstimate =
    chunkSizes.length * VD_DEEP_DRAFT_PER_CALL_CREDIT_ESTIMATE;
  const hasCredits = await hasEnoughCredits(params.userId, totalEstimate);
  if (!hasCredits) {
    throw new InsufficientCreditsError();
  }

  const model = await resolveDeepStoryDraftModel();

  // Format profiles (task #23) — resolved ONCE per run, from the FULL
  // planned season length (`totalEpisodeCount`), never from `episodes.length`
  // (which can be a partial horizon slice — see `formatProfilesEnabled`'s own
  // doc comment on `GenerateStoryBibleDeepParams`). `undefined` whenever the
  // flag is off or `totalEpisodeCount` is unavailable, which keeps every
  // downstream consumer (`buildDeepDraftPrompts`) byte-identical to before
  // this feature existed.
  const formatProfile =
    params.formatProfilesEnabled && params.totalEpisodeCount != null
      ? resolveVerticalDramaFormatProfile(params.totalEpisodeCount)
      : undefined;

  const draftedItems: DeepDraftedEpisodeItem[] = [];
  const warnings: VdDeepDraftWarning[] = [];
  const completedChunkSizes: number[] = [];
  const missingEpisodes: number[] = [];
  let recapItems = [...(params.priorRecap?.items ?? [])];
  let openThreads = [...(params.priorRecap?.openThreads ?? [])];
  let totalCreditsUsed = 0;
  let cursor = 0;
  let partial = false;
  let failureMessage: string | undefined;
  let chunkIndex = 0;

  for (const size of chunkSizes) {
    chunkIndex += 1;
    const chunkEpisodes = episodes.slice(cursor, cursor + size);
    cursor += size;
    const requestedEpisodeNumbers = chunkEpisodes.map(ep => ep.episodeNumber);

    // Async story jobs (#28) — additive, no-op when `onProgress` is absent.
    params.onProgress?.({
      phase: "draft",
      chunkIndex,
      chunkCount: chunkSizes.length,
      callsDone: completedChunkSizes.length,
    });

    const { systemPrompt, userPrompt } = buildDeepDraftPrompts({
      title: params.title,
      locale: params.locale,
      genre: params.genre,
      tone: params.tone,
      chunkEpisodes,
      recapItems,
      openThreads,
      totalEpisodeCount: params.totalEpisodeCount,
      formatProfile,
      tieInDraftContext: params.tieInDraftContext,
      userPremise: params.userPremise,
      sceneContractsEnabled: params.sceneContractsEnabled,
    });

    try {
      const first = await executeJsonPlanningCallWithRetry({
        model,
        systemPrompt,
        userPrompt,
        temperature: 0.8,
        userId: params.userId,
        maxTokens: 16000,
        schema: deepDraftChunkResponseSchema,
        label: "Deep story draft chunk",
      });

      const firstUsage = first.response.usage;
      const firstCreditsForChunk = calculateCreditsForLLM(
        firstUsage?.prompt_tokens ?? 0,
        firstUsage?.completion_tokens ?? 0,
        model
      );
      await deductCredits({
        userId: params.userId,
        tenantId: params.tenantId,
        amount: firstCreditsForChunk,
        description: `Vertical Drama — deep story draft chunk (series #${params.seriesId}, episodes ${chunkEpisodes[0]?.episodeNumber}-${chunkEpisodes[chunkEpisodes.length - 1]?.episodeNumber})`,
        sourceType: "skill",
        metadata: {
          model,
          llmModel: model,
          feature: "vertical_drama_series_deep_story_draft",
          seriesId: params.seriesId,
          chunkEpisodeNumbers: requestedEpisodeNumbers,
          inputTokens: firstUsage?.prompt_tokens ?? 0,
          outputTokens: firstUsage?.completion_tokens ?? 0,
        },
      });
      totalCreditsUsed += firstCreditsForChunk;

      let reconciled = reconcileDeepDraftChunkEpisodes(
        requestedEpisodeNumbers,
        first.data.episodeBreakdown
      );
      let chunkOpenThreads = first.data.open_threads ?? openThreads;

      // Live-bug fix (chunk under-count no longer accepted silently, added
      // 2026-07-08): the chunk's returned episode set didn't exactly match
      // what was requested (missing/extra/duplicate) — issue ONE corrective
      // retry of the SAME chunk (same prompt + an explicit instruction
      // naming the missing episode numbers), reusing the exact
      // `executeJsonPlanningCallWithRetry` call shape every chunk call
      // already uses. Best-effort: if this retry call itself fails outright
      // (network/still-malformed-after-ITS-OWN-internal-retry), this simply
      // keeps the first attempt's (still incomplete) result — never throws
      // away what the first attempt DID successfully draft.
      if (reconciled.missingEpisodeNumbers.length > 0) {
        try {
          const retryUserPrompt = `${userPrompt}\n\n${buildDeepDraftMissingEpisodesRetryInstruction(reconciled.missingEpisodeNumbers)}`;
          const retry = await executeJsonPlanningCallWithRetry({
            model,
            systemPrompt,
            userPrompt: retryUserPrompt,
            temperature: 0.8,
            userId: params.userId,
            maxTokens: 16000,
            schema: deepDraftChunkResponseSchema,
            label: "Deep story draft chunk (missing-episode retry)",
          });

          const retryUsage = retry.response.usage;
          const retryCreditsForChunk = calculateCreditsForLLM(
            retryUsage?.prompt_tokens ?? 0,
            retryUsage?.completion_tokens ?? 0,
            model
          );
          await deductCredits({
            userId: params.userId,
            tenantId: params.tenantId,
            amount: retryCreditsForChunk,
            description: `Vertical Drama — deep story draft chunk missing-episode retry (series #${params.seriesId}, episodes ${chunkEpisodes[0]?.episodeNumber}-${chunkEpisodes[chunkEpisodes.length - 1]?.episodeNumber}, missing ${reconciled.missingEpisodeNumbers.join(",")})`,
            sourceType: "skill",
            metadata: {
              model,
              llmModel: model,
              feature: "vertical_drama_series_deep_story_draft",
              seriesId: params.seriesId,
              chunkEpisodeNumbers: requestedEpisodeNumbers,
              missingEpisodeNumbers: reconciled.missingEpisodeNumbers,
              inputTokens: retryUsage?.prompt_tokens ?? 0,
              outputTokens: retryUsage?.completion_tokens ?? 0,
            },
          });
          totalCreditsUsed += retryCreditsForChunk;

          // Retry's own copy of an episode wins over the first attempt's
          // (it was generated WITH the corrective instruction); any episode
          // the retry STILL doesn't cover falls back to the first attempt's
          // copy — `reconcileDeepDraftChunkEpisodes` treats the earlier
          // array's entries as the ones to prefer for a given episodeNumber,
          // so the retry's items are listed first.
          reconciled = reconcileDeepDraftChunkEpisodes(
            requestedEpisodeNumbers,
            [...retry.data.episodeBreakdown, ...first.data.episodeBreakdown]
          );
          chunkOpenThreads = retry.data.open_threads ?? chunkOpenThreads;
        } catch (retryError) {
          debugError(
            "vd_deep_draft_missing_episode_retry",
            `Deep story draft chunk missing-episode retry failed for series #${params.seriesId} — keeping the first attempt's episodes`,
            {
              message:
                retryError instanceof Error
                  ? retryError.message
                  : String(retryError),
            }
          );
        }
      }

      if (reconciled.items.length === 0) {
        // Neither the first attempt nor the retry returned ANY of the
        // requested episodes — treat exactly like a thrown chunk failure
        // (below) so the SAME "throw only if nothing has ever succeeded"
        // rule applies.
        throw new Error(
          `Deep story draft chunk (episodes ${requestedEpisodeNumbers.join(",")}) returned no requested episodes, even after a corrective retry`
        );
      }

      const chunkDrafted: DeepDraftedEpisodeItem[] = reconciled.items.map(
        raw => {
          const cleanedShotDrafts = enforceEpisodeShotDraftSpeakability(
            raw.episodeNumber,
            raw.shotDrafts,
            warnings
          )
            .slice()
            .sort((a, b) => a.shot_number - b.shot_number);
          return {
            episodeNumber: raw.episodeNumber,
            shotDrafts: cleanedShotDrafts,
            cliffhanger_line: raw.cliffhanger_line,
            draftCompleteness: computeDraftCompleteness(cleanedShotDrafts),
            ...extractDramaturgyStructureFields(raw),
          };
        }
      );

      draftedItems.push(...chunkDrafted);
      recapItems = [
        ...recapItems,
        ...chunkDrafted.map((drafted): DeepDraftRecapEpisode => {
          const source = chunkEpisodes.find(
            ep => ep.episodeNumber === drafted.episodeNumber
          );
          return {
            episodeNumber: drafted.episodeNumber,
            workingTitle:
              source?.workingTitle ?? `Episode ${drafted.episodeNumber}`,
            logline: source?.logline ?? "",
            cliffhangerLine: drafted.cliffhanger_line,
          };
        }),
      ];
      openThreads = chunkOpenThreads;
      // Actual number of episodes this chunk actually persisted — NOT the
      // originally-requested `size` (live-bug fix: this is what the client
      // success toast sums via `sumDeepDraftChunkSizes`, so it must never
      // overstate how many episodes were really drafted).
      completedChunkSizes.push(chunkDrafted.length);

      if (reconciled.missingEpisodeNumbers.length > 0) {
        for (const missingEpisodeNumber of reconciled.missingEpisodeNumbers) {
          missingEpisodes.push(missingEpisodeNumber);
          warnings.push({
            episodeNumber: missingEpisodeNumber,
            shotNumber: 0,
            reason: "episode_missing_after_retry",
          });
        }
        partial = true;
        failureMessage = `Deep story draft chunk (episodes ${requestedEpisodeNumbers[0]}-${requestedEpisodeNumbers[requestedEpisodeNumbers.length - 1]}) is still missing episode(s) ${reconciled.missingEpisodeNumbers.join(", ")} after a corrective retry`;
        // Stop here — do NOT let a later chunk run on top of this gap: that
        // would push `horizonEndEpisode` (computed by the router as
        // `max(draftedItems[].episodeNumber)`) past episodes that were
        // never actually drafted, exactly the "9/10 reported as done"
        // dishonesty this fix exists to close.
        break;
      }
    } catch (error) {
      if (draftedItems.length === 0) {
        // Nothing succeeded yet — nothing to persist, so fail exactly like a
        // single-call `generateStoryBible` failure (no partial result).
        throw error;
      }
      partial = true;
      failureMessage = error instanceof Error ? error.message : String(error);
      break;
    }
  }

  // Task #22 — deterministic tie-in placement/draft-marking reconciliation,
  // run ONCE over every episode drafted this run (see
  // `reconcileTieInDraftMarking`'s own doc comment; no-op when
  // `params.tieInDraftContext` is absent).
  const tieInReconciliation = reconcileTieInDraftMarking(
    draftedItems,
    params.tieInDraftContext
  );
  // Feature 132 §4.2.7 (F132A) — deterministic premise-coverage guard;
  // no-op when `params.userPremise` is absent/blank.
  const warningsWithPremiseCoverage = appendDeepDraftPremiseCoverageWarning(
    [...warnings, ...tieInReconciliation.warnings],
    params.userPremise,
    draftedItems,
    openThreads
  );

  return {
    draftedItems,
    chunkSizes: completedChunkSizes,
    partial,
    creditsUsed: totalCreditsUsed,
    model,
    warnings: warningsWithPremiseCoverage,
    finalOpenThreads: openThreads,
    missingEpisodes,
    ...(partial && failureMessage ? { error: failureMessage } : {}),
    ...(params.tieInDraftContext
      ? { tieInMismatchCount: tieInReconciliation.mismatchCount }
      : {}),
  };
}

/* ============================================================================ */
/* Premium multi-round generation pipeline (W11-A, added 2026-07-08)          */
/*                                                                              */
/* Activated by `GenerateStoryBibleDeepParams.mode === "premium"` (see the mode */
/* switch at the very top of `generateStoryBibleDeep` above — the standard body */
/* above this section is NEVER touched by anything below). PER CHUNK:          */
/*   1. FAN-OUT: `VD_PREMIUM_DRAFT_CANDIDATE_COUNT` (3) parallel candidate      */
/*      generations — the SAME base chunk prompt (`buildDeepDraftPrompts`,     */
/*      unmodified) plus a distinct creative "lens" appended to the system     */
/*      prompt (`VD_PREMIUM_DRAFT_LENSES`).                                    */
/*   2. DETERMINISTIC GATES: the SAME post-chunk enforcement standard mode     */
/*      uses (`enforceEpisodeShotDraftSpeakability` + `computeDraftCompleteness`) */
/*      applied to every candidate — NO extra LLM call — producing a           */
/*      per-episode/per-candidate gate-violation count                        */
/*      (`computePremiumGateViolationCount`).                                  */
/*   3. JUDGE: ONE inline LLM call scoring every candidate's every episode on  */
/*      `VD_PREMIUM_DRAFT_SCORE_DIMENSIONS` (8 dims) + `overall`, 1-5 each.    */
/*   4. SELECT: highest mean `overall` wins; ties broken by fewer gate         */
/*      violations, then by lens/candidate order (`selectPremiumDraftWinnerIndex`). */
/*   5. TARGETED REVISE (<= `VD_PREMIUM_DRAFT_MAX_REVISE_ROUNDS` rounds): the  */
/*      winner's below-floor episodes (`meetsPremiumDraftFloor`) get ONE       */
/*      batched revise call, re-gated, ONE re-judge call, then a PER-EPISODE   */
/*      regression guard — a revision scoring a LOWER `overall` than what it's */
/*      replacing is discarded and the prior episode version is kept.          */
/* After every chunk in this run completes, a ONE-TIME season continuity sweep */
/* (`runPremiumSeasonSweep`) runs over every episode drafted in THIS run and,  */
/* if it finds cross-episode issues, spot-revises the affected episodes with   */
/* the same regression-guarded re-judge — the sweep itself never loops.        */
/*                                                                              */
/* Credits are deducted per ACTUAL successful call (`deductPremiumCall`) —     */
/* finer-grained than standard mode's once-per-chunk deduction, but the same   */
/* check -> call -> deduct convention. Chunk-level partial-failure semantics   */
/* mirror standard mode exactly: a chunk whose REQUIRED calls (fan-out/judge)  */
/* fail is a failed chunk; if at least one earlier chunk already completed,    */
/* the run stops there and returns `partial: true` with everything already    */
/* drafted preserved (never discarded). Revise/re-judge/sweep/spot-revise      */
/* calls are best-effort — a failure there simply keeps the pre-revise/        */
/* pre-sweep version rather than failing the chunk or the run.                 */
/* ============================================================================ */

/** Exactly 3 lens-differentiated candidates are drafted per chunk (owner-approved design point 2a). */
export const VD_PREMIUM_DRAFT_CANDIDATE_COUNT = 3;

/** At most this many targeted-revise rounds run per chunk (owner-approved design point 2e). */
export const VD_PREMIUM_DRAFT_MAX_REVISE_ROUNDS = 2;

/** An episode's `overall` score must reach this to be considered "at floor" (owner-approved design point 2e). */
export const VD_PREMIUM_DRAFT_MIN_OVERALL = 4;

/** Every one of an episode's 8 dimension scores must reach this to be considered "at floor" (owner-approved design point 2e). */
export const VD_PREMIUM_DRAFT_MIN_DIMENSION = 3;

export const VD_PREMIUM_DRAFT_LENS_EMOTION_FIRST =
  "CREATIVE LENS for this draft: EMOTION-FIRST. Lead every beat with what the characters visibly feel — interiority, reactions, and emotional turns come first; let plot mechanics serve the emotion, not the other way around.";
export const VD_PREMIUM_DRAFT_LENS_CONFLICT_FIRST =
  "CREATIVE LENS for this draft: CONFLICT-FIRST. Sharpen every scene's opposing wants and stakes; every shot should advance, escalate, or complicate a concrete conflict between characters.";
export const VD_PREMIUM_DRAFT_LENS_DIALOGUE_NATURALNESS_FIRST =
  "CREATIVE LENS for this draft: DIALOGUE-NATURALNESS-FIRST. Write every line the way a real person would actually say it out loud — natural rhythm, subtext, and colloquial phrasing over exposition or stiff, on-the-nose lines.";

/** The 3 lens instructions, in fixed order — ALSO the tie-break order for winner selection (owner-approved design point 2d: "lens order"). */
export const VD_PREMIUM_DRAFT_LENSES = [
  VD_PREMIUM_DRAFT_LENS_EMOTION_FIRST,
  VD_PREMIUM_DRAFT_LENS_CONFLICT_FIRST,
  VD_PREMIUM_DRAFT_LENS_DIALOGUE_NATURALNESS_FIRST,
] as const;

/** Short labels for the 3 lenses — log lines / credit-deduction descriptions only, NEVER sent to the model. */
const VD_PREMIUM_DRAFT_LENS_LABELS = [
  "emotion_first",
  "conflict_first",
  "dialogue_naturalness_first",
] as const;

/**
 * Premium pre-check call estimate (owner-approved design point 5) — a
 * conservative FLAT per-chunk estimate, not an exact sum: 6 calls/chunk
 * (3 fan-out + 1 judge + an average of ~1.5 revise-round call-pairs, rounded
 * up for headroom) plus a flat 2 for the ONE-TIME season continuity sweep (1
 * sweep-detect call + 1 spot-revise/re-judge pair, collapsed to 2 since the
 * spot-revise/re-judge pair only runs when the sweep actually finds an
 * issue). The REAL cost is always the sum of the per-call
 * `calculateCreditsForLLM` amounts actually deducted (`deductPremiumCall`) —
 * this estimate only gates the upfront `hasEnoughCredits` pre-check,
 * mirroring every other Vertical Drama planning call site's conservative
 * pre-check convention.
 */
export function estimatePremiumDeepDraftCalls(chunkCount: number): number {
  return Math.max(0, chunkCount) * 6 + 2;
}

/** `Record<dimension, score>` shape shared by judge/re-judge scores AND the persisted scorecard — used for floor checks, feedback text, and scorecard construction. Persisted legacy scorecards may omit newer v3 dimensions. */
type PremiumScoreLike = Partial<Record<VdPremiumDraftScoreDimension, number>> & {
  overall: number;
  /** Task #22 — see `premiumTieInNaturalnessShape`'s own doc comment; present ONLY for a placed episode's score. */
  tie_in_naturalness?: number;
};

/**
 * Deterministic gate-violation count (owner-approved design point 2b) — NO
 * extra LLM call, reuses the SAME `draftCompleteness` signals standard mode
 * already computes: +1 for a shot missing dialogue/silence_intent
 * (`!dialogueEveryShot`), +1 for any unspeakable-after-cleaning line
 * (`!allSpeakable`), +1 for `coverageStatus: "warning"` or +2 for
 * `coverageStatus: "error"`. Summed across every item passed in — callers
 * pass a single-episode array for a per-episode count, or a whole chunk's
 * episodes for a per-candidate count. (Beat-count/reversal-marker counting
 * from shot summaries is deliberately NOT attempted here — too unreliable a
 * signal, per owner-approved design point 2b.)
 */
export function computePremiumGateViolationCount(
  items: Array<{ draftCompleteness: VdDeepDraftCompleteness }>
): number {
  return items.reduce((sum, item) => {
    const c = item.draftCompleteness;
    let violations = 0;
    if (!c.dialogueEveryShot) violations += 1;
    if (!c.allSpeakable) violations += 1;
    if (c.coverageStatus === "error") violations += 2;
    else if (c.coverageStatus === "warning") violations += 1;
    return sum + violations;
  }, 0);
}

/**
 * "At floor" per owner-approved design point 2e: `overall >=
 * VD_PREMIUM_DRAFT_MIN_OVERALL` AND every one of the 8 dimensions >=
 * `VD_PREMIUM_DRAFT_MIN_DIMENSION`.
 *
 * Format profiles (task #23, added 2026-07-08) — `profile` is OPTIONAL and,
 * when given, only ever affects the `hook_strength` dimension's floor (via
 * `profile.judge.hookStrengthFloorDelta` — every other dimension keeps
 * `VD_PREMIUM_DRAFT_MIN_DIMENSION` unchanged). An absent `profile` OR a
 * `"standard"`-tier one forces the delta to `0`, so every existing caller
 * (which never passes a 2nd argument) and every standard-tier/flag-off run
 * is byte-identical to before this parameter existed.
 */
export function meetsPremiumDraftFloor(
  scorecard: PremiumScoreLike,
  profile?: VerticalDramaFormatProfile
): boolean {
  if (scorecard.overall < VD_PREMIUM_DRAFT_MIN_OVERALL) return false;
  const hookStrengthFloorDelta =
    profile && profile.tier !== "standard"
      ? profile.judge.hookStrengthFloorDelta
      : 0;
  for (const dimension of VD_PREMIUM_DRAFT_SCORE_DIMENSIONS) {
    const floor =
      dimension === "hook_strength"
        ? VD_PREMIUM_DRAFT_MIN_DIMENSION + hookStrengthFloorDelta
        : VD_PREMIUM_DRAFT_MIN_DIMENSION;
    const value = scorecard[dimension];
    if (value === undefined || value < floor) return false;
  }
  // Task #22 — additive: only checked when this episode was actually judged
  // on `tie_in_naturalness` (a placed episode this run); absent (every
  // existing caller, or an unplaced episode) never affects the floor.
  if (
    scorecard.tie_in_naturalness !== undefined &&
    scorecard.tie_in_naturalness < VD_PREMIUM_DRAFT_MIN_DIMENSION
  ) {
    return false;
  }
  return true;
}

/**
 * Feature 132 §6.2 (F132C, scene-contracts) — deterministic contract gate,
 * called ALONGSIDE — never replacing — `meetsPremiumDraftFloor` at both its
 * call sites. Checks, over ONE episode's 9 shot drafts: (a) every shot has a
 * `contract` object; (b) every shot's `contract.newClueIds.length <= 2`
 * (the SOLE enforcement point for the clue budget — the schema itself has
 * no `.max()`); (c) the canonical anchor-line-cadence predicate — no run of
 * 3 or more consecutive shots without `anchorLine: true` (this EXACT
 * wording/definition is also used by `buildSceneContractPromptBlock` and
 * `validateStagePayload` — never restated differently); (d) a conservative
 * want/obstacle/choice/cost collective-coverage heuristic — across the
 * episode's shots, at least one `contract.tensionSource` (want/obstacle
 * signal), at least one `contract.characterDecision` (choice), and at least
 * one `contract.tensionSource` again read as the cost-implying field (a
 * presence-of-coverage check, not a quality judgment — Section 06's
 * Structure Pass owns judging QUALITY).
 */
export function meetsPremiumDraftContractFloor(
  shotDrafts: VdDeepDraftShotDraft[]
): boolean {
  if (shotDrafts.length === 0) return false;

  let consecutiveWithoutAnchor = 0;
  let hasTensionSource = false;
  let hasCharacterDecision = false;

  for (const shot of shotDrafts) {
    const contract = shot.contract;
    if (!contract) return false;
    if (contract.newClueIds.length > 2) return false;

    if (contract.anchorLine === true) {
      consecutiveWithoutAnchor = 0;
    } else {
      consecutiveWithoutAnchor += 1;
      if (consecutiveWithoutAnchor >= 3) return false;
    }

    if (contract.tensionSource.trim().length > 0) hasTensionSource = true;
    if (contract.characterDecision?.trim()) hasCharacterDecision = true;
  }

  // (d) want/obstacle/choice/cost collective coverage — conservative
  // field-presence heuristic: `tensionSource` doubles as the want/obstacle/
  // cost signal (every shot has one, checked above via `.min(1)` at the
  // schema level, so this only needs at least one non-blank occurrence
  // across the episode — already guaranteed once any shot exists), and
  // `characterDecision` is the choice signal (optional per-shot, so the
  // EPISODE must carry at least one somewhere).
  return hasTensionSource && hasCharacterDecision;
}

/**
 * Winner selection (owner-approved design point 2d): highest mean `overall`
 * across the chunk's episodes; ties broken by fewer `gateViolationCount`;
 * remaining ties broken by lens/candidate order (index 0 first) — this only
 * ever replaces the running `best` on a STRICT improvement, so an all-tied
 * case naturally keeps the lowest (earliest) index. Exported standalone (no
 * LLM/mocking needed) so winner-selection math is directly unit-testable.
 */
export function selectPremiumDraftWinnerIndex(
  candidates: Array<{
    index: number;
    meanOverall: number;
    gateViolationCount: number;
  }>
): number {
  let best = candidates[0];
  for (const candidate of candidates.slice(1)) {
    if (candidate.meanOverall > best.meanOverall) {
      best = candidate;
    } else if (
      candidate.meanOverall === best.meanOverall &&
      candidate.gateViolationCount < best.gateViolationCount
    ) {
      best = candidate;
    }
  }
  return best.index;
}

/* -------------------------------------------------------------------------- */
/* Premium pipeline — response schemas                                        */
/* -------------------------------------------------------------------------- */

/** Shared core fields for a single episode's judge/re-judge score (owner-approved design point 2c). */
const premiumEpisodeScoreCoreShape = {
  episodeNumber: z.number().int().positive(),
  ...premiumScoreDimensionsShape,
  // Task #22 — see `premiumTieInNaturalnessShape`'s own doc comment.
  ...premiumTieInNaturalnessShape,
};

const premiumJudgeScoreSchema = z
  .object({
    candidateIndex: z
      .number()
      .int()
      .min(0)
      .max(VD_PREMIUM_DRAFT_CANDIDATE_COUNT - 1),
    ...premiumEpisodeScoreCoreShape,
  })
  .passthrough();

const premiumJudgeResponseSchema = z
  .object({ scores: z.array(premiumJudgeScoreSchema).min(1) })
  .passthrough();

type PremiumJudgeScore = z.infer<typeof premiumJudgeScoreSchema>;

/** Re-judge (targeted-revise round AND season-sweep spot-revise) scores exactly ONE version per episode — no `candidateIndex`. */
const premiumRejudgeScoreSchema = z
  .object(premiumEpisodeScoreCoreShape)
  .passthrough();

const premiumRejudgeResponseSchema = z
  .object({ scores: z.array(premiumRejudgeScoreSchema).min(1) })
  .passthrough();

/** Revise responses (targeted per-chunk AND season-sweep spot-revise) reuse the exact chunk-generation episode shape. */
const premiumReviseResponseSchema = z.object({
  episodeBreakdown: z.array(deepDraftChunkEpisodeItemSchema).min(1),
});

type PremiumRawEpisode = z.infer<typeof deepDraftChunkEpisodeItemSchema>;

/** Season continuity sweep issue kinds (owner-approved design point 3). */
export const VD_PREMIUM_SWEEP_ISSUE_KINDS = [
  "contradiction",
  "repeat",
  "escalation_flat",
] as const;

const premiumSweepIssueSchema = z
  .object({
    episodeNumber: z.number().int().positive(),
    kind: z.enum(VD_PREMIUM_SWEEP_ISSUE_KINDS),
    instruction: z.string().min(1),
  })
  .passthrough();

const premiumSweepResponseSchema = z
  .object({ issues: z.array(premiumSweepIssueSchema) })
  .passthrough();

export type VdPremiumSweepIssue = z.infer<typeof premiumSweepIssueSchema>;

/* -------------------------------------------------------------------------- */
/* Premium pipeline — internal working types                                  */
/* -------------------------------------------------------------------------- */

type PremiumRunContext = {
  model: string;
  userId: number;
  tenantId?: string;
  seriesId: number;
  /** Async story jobs (#28) — see `GenerateStoryBibleDeepParams.onProgress`'s own doc comment; additive, no-op when absent. */
  onProgress?: VdStoryDraftProgressCallback;
};

type PremiumCallAccounting = {
  addCredits: (amount: number) => void;
  addCall: () => void;
};

/**
 * Dramaturgy critic (W11.5) — the 5 structural fields, shared by
 * `PremiumGatedEpisode`/`PremiumEpisodeState` below via intersection so both
 * carry them identically. All optional — see `episodeBreakdownItemSchema`'s
 * own doc comments for what each means.
 */
type PremiumDramaturgyStructureFields = {
  antagonist_tactics?: string[];
  character_decisions?: VdCharacterDecision[];
  protagonist_stake?: string;
  world_rules?: VdWorldRule[];
  price_paid?: string;
};

/** One fan-out (or revise) candidate's SINGLE episode after deterministic gating (owner-approved design point 2b) — pre-judge. */
type PremiumGatedEpisode = {
  episodeNumber: number;
  workingTitle: string;
  logline: string;
  keyBeats: string[];
  shotDrafts: VdDeepDraftShotDraft[];
  cliffhanger_line?: string;
  draftCompleteness: VdDeepDraftCompleteness;
  gateViolations: number;
  localWarnings: VdDeepDraftWarning[];
} & PremiumDramaturgyStructureFields;

/** The CURRENT best version of a single episode as the per-chunk/sweep pipeline progresses (winner, then possibly revised). */
type PremiumEpisodeState = {
  episodeNumber: number;
  shotDrafts: VdDeepDraftShotDraft[];
  cliffhanger_line?: string;
  draftCompleteness: VdDeepDraftCompleteness;
  draftScorecard: VdPremiumDraftScorecard;
  localWarnings: VdDeepDraftWarning[];
} & PremiumDramaturgyStructureFields;

/* -------------------------------------------------------------------------- */
/* Premium pipeline — pure helpers                                            */
/* -------------------------------------------------------------------------- */

/**
 * Runs the SAME deterministic post-chunk enforcement standard mode uses
 * (`enforceEpisodeShotDraftSpeakability` + `computeDraftCompleteness`) over a
 * raw fan-out/revise LLM response's `episodeBreakdown` — any freshly
 * generated shot content always goes through this before being trusted.
 */
function gateRawPremiumEpisodes(
  rawEpisodeBreakdown: PremiumRawEpisode[]
): PremiumGatedEpisode[] {
  return rawEpisodeBreakdown.map(raw => {
    const localWarnings: VdDeepDraftWarning[] = [];
    const cleaned = enforceEpisodeShotDraftSpeakability(
      raw.episodeNumber,
      raw.shotDrafts,
      localWarnings
    )
      .slice()
      .sort((a, b) => a.shot_number - b.shot_number);
    const draftCompleteness = computeDraftCompleteness(cleaned);
    return {
      episodeNumber: raw.episodeNumber,
      workingTitle: raw.workingTitle,
      logline: raw.logline,
      keyBeats: raw.keyBeats,
      shotDrafts: cleaned,
      cliffhanger_line: raw.cliffhanger_line,
      draftCompleteness,
      gateViolations: computePremiumGateViolationCount([{ draftCompleteness }]),
      localWarnings,
      ...extractDramaturgyStructureFields(raw),
    };
  });
}

/** Builds a full `VdPremiumDraftScorecard` from a judge/re-judge score + the round it was judged at. */
function scoreToScorecard(
  score: PremiumScoreLike,
  judgedAtRound: number
): VdPremiumDraftScorecard {
  const scorecard: Record<string, number> = {
    judgedAtRound,
    overall: score.overall,
  };
  for (const dimension of VD_PREMIUM_DRAFT_SCORE_DIMENSIONS) {
    scorecard[dimension] = score[dimension] ?? 1;
  }
  // Task #22 — carried through ONLY when the judge actually scored it
  // (a placed episode); absent otherwise, matching `worstCasePremiumScorecard`'s
  // own "omit unless placed" convention below.
  if (score.tie_in_naturalness !== undefined) {
    scorecard.tie_in_naturalness = score.tie_in_naturalness;
  }
  return scorecard as unknown as VdPremiumDraftScorecard;
}

/**
 * Fallback scorecard used ONLY when a judge/re-judge response omits a score
 * for an episode it should have covered (a lenient LLM, not itself a schema
 * violation, since `min(1)` on the `scores` array is the only hard
 * requirement) — every dimension at the WORST possible value (1) so a
 * missing judgment always reads as "needs revision" rather than silently
 * passing floors.
 *
 * Task #22 — `includeTieIn` (defaults `false`, so every pre-existing call
 * site stays byte-identical) additionally stamps `tie_in_naturalness: 1` —
 * pass `true` ONLY when the episode this fallback covers has a planned tie-in
 * placement this run, so a missing judgment for a PLACED episode still reads
 * as "needs revision" on that dimension too (mirrors this function's own
 * "worst case, never silently passes" rationale above).
 */
function worstCasePremiumScorecard(
  judgedAtRound: number,
  includeTieIn = false
): VdPremiumDraftScorecard {
  const scorecard: Record<string, number> = { judgedAtRound, overall: 1 };
  for (const dimension of VD_PREMIUM_DRAFT_SCORE_DIMENSIONS) {
    scorecard[dimension] = 1;
  }
  if (includeTieIn) {
    scorecard.tie_in_naturalness = 1;
  }
  return scorecard as unknown as VdPremiumDraftScorecard;
}

/** Composes human-readable feedback from a below-floor episode's CURRENT scorecard, for the targeted-revise call's per-episode instruction. */
function composePremiumScoreFeedback(scorecard: PremiumScoreLike): string {
  const weakDimensions = VD_PREMIUM_DRAFT_SCORE_DIMENSIONS.filter(
    dimension => (scorecard[dimension] ?? 0) < VD_PREMIUM_DRAFT_MIN_DIMENSION
  );
  // Task #22 — `tie_in_naturalness` participates in the SAME "weak
  // dimensions"/feedback text as the 8 core dimensions whenever it was
  // actually judged (a placed episode); absent otherwise, so this stays
  // byte-identical for every non-tie-in-aware call.
  const tieInWeak =
    scorecard.tie_in_naturalness !== undefined &&
    scorecard.tie_in_naturalness < VD_PREMIUM_DRAFT_MIN_DIMENSION;
  const allWeakDimensions = tieInWeak
    ? [...weakDimensions, "tie_in_naturalness"]
    : weakDimensions;
  const allScoresText = [
    `overall: ${scorecard.overall}/5`,
    ...VD_PREMIUM_DRAFT_SCORE_DIMENSIONS.map(
      dimension => `${dimension}: ${scorecard[dimension] ?? "missing"}/5`
    ),
    ...(scorecard.tie_in_naturalness !== undefined
      ? [`tie_in_naturalness: ${scorecard.tie_in_naturalness}/5`]
      : []),
  ].join(", ");
  const focus =
    allWeakDimensions.length > 0
      ? `Focus specifically on raising: ${allWeakDimensions.join(", ")}.`
      : "Focus on raising the overall score while keeping every dimension at or above its current level.";
  const tieInNote = tieInWeak
    ? " Make the product tie-in moment feel more organic and natural — like real product placement, not an advertisement."
    : "";
  return `Current judged scores — ${allScoresText}. ${focus}${tieInNote} Revise ONLY what's needed to fix these — do not discard what already works.`;
}

/** Composes human-readable feedback from the season sweep's issue(s) for ONE episode, combining multiple issues into one instruction. */
function composePremiumSweepFeedback(issues: VdPremiumSweepIssue[]): string {
  return issues
    .map(issue => `Continuity issue (${issue.kind}): ${issue.instruction}`)
    .join(" ");
}

/**
 * Tolerant lookup of a chunk episode's planned `workingTitle`/`logline`/
 * `keyBeats` by episode number — falls back to a synthetic placeholder
 * (never throws/crashes the pipeline) if the LLM ever returns an
 * episodeNumber outside what was actually requested, mirroring this file's
 * established "never trust LLM-controlled keys blindly" tolerance (see e.g.
 * `computeDeepDraftSummary`'s tolerant reads).
 */
function findPremiumSourceItem(
  chunkEpisodes: StoredEpisodeBreakdownItem[],
  episodeNumber: number
): StoredEpisodeBreakdownItem {
  return (
    chunkEpisodes.find(item => item.episodeNumber === episodeNumber) ??
    ({
      episodeNumber,
      workingTitle: `Episode ${episodeNumber}`,
      logline: "",
      keyBeats: [],
    } as StoredEpisodeBreakdownItem)
  );
}

/**
 * Compact per-episode digest for judge/re-judge prompts — summaries +
 * "speaker: line" dialogue strings, NOT the full shot objects (keeps the
 * judge prompt small).
 *
 * Task #22 — `hasPlannedTieIn` (optional; every existing caller omits it)
 * tells the judge WHICH episodes must ALSO be scored on `tie_in_naturalness`
 * (see `buildPremiumJudgePrompts`/`buildPremiumRejudgePrompts`); each shot's
 * `tie_in` marking (when present) is included so the judge can see WHICH shot
 * the draft claims carries the placement and judge how organically it reads.
 */
function buildPremiumEpisodeDigest(params: {
  sourceItem: StoredEpisodeBreakdownItem;
  cliffhangerLine?: string;
  shotDrafts: VdDeepDraftShotDraft[];
  hasPlannedTieIn?: boolean;
}): Record<string, unknown> {
  return {
    episodeNumber: params.sourceItem.episodeNumber,
    workingTitle: params.sourceItem.workingTitle,
    logline: params.sourceItem.logline,
    cliffhangerLine: params.cliffhangerLine ?? null,
    ...(params.hasPlannedTieIn !== undefined
      ? { hasPlannedTieIn: params.hasPlannedTieIn }
      : {}),
    shots: params.shotDrafts.map(shot => ({
      shot_number: shot.shot_number,
      summary: shot.summary,
      dialogue: shot.dialogue_lines.map(
        line => `${line.speaker}: ${line.line}`
      ),
      ...(shot.tie_in ? { tie_in: shot.tie_in } : {}),
    })),
  };
}

/* -------------------------------------------------------------------------- */
/* Premium pipeline — prompt builders                                         */
/* -------------------------------------------------------------------------- */

/**
 * Duplicated verbatim from `buildDeepDraftPrompts`'s inline speakability
 * rules (NOT extracted into a shared const) so that function's own source
 * stays completely untouched — this file's standard-mode byte-identity
 * requirement applies to `buildDeepDraftPrompts` too.
 */
const VD_PREMIUM_SPEAKABILITY_RULES =
  'SPEAKABILITY RULES (hard requirement): every "line" must be literally speakable as written — no wrapping quote marks, no parenthetical stage direction, no symbols (~ * [ ] / ` < > _), no em-dash as a spoken beat (use a comma instead), at most one "…" per line, no emoji. Put delivery/emotion notes in the separate "delivery" field, NEVER inside "line" itself. A shot that is only an animal/ambient sound or otherwise wordless must set "silence_intent" instead of writing the sound as a dialogue line.';

const VD_NATURAL_THAI_DIALOGUE_RULES = [
  "NATURAL THAI DIALOGUE RULES (hard requirement): write Thai dialogue like real people speaking in a tense short drama, not translated prose, textbook Thai, or summary text.",
  "Match pronouns and particles to each character's age, status, relationship, and emotional state; use ครับ/ค่ะ/นะ/สิ/เถอะ/วะ/เว้ย only when that speaker would naturally say it, and keep each character's voice consistent.",
  "Prefer short spoken clauses, implied meaning, interruptions, and emotion under pressure. Avoid stiff phrases, formal report language, repeated abstract nouns, and lines that explain the plot out loud.",
  "Good Thai dialogue: \"แม่ไม่ต้องพูดแล้ว หนูเห็นเองกับตา\" / \"ถ้าเขารู้ เราจบกันคืนนี้\". Bad Thai dialogue: \"ฉันรู้สึกถึงความยุติธรรมและสิทธิ์ของครอบครัว\" / \"ข้อมูลนี้ทำให้สถานการณ์เปลี่ยนแปลงอย่างมีนัยสำคัญ\".",
].join(" ");

/**
 * Duplicated verbatim from `buildDeepDraftPrompts`'s own "don't set both" rule
 * (live-bug fix, added 2026-07-08) for the SAME reason `VD_PREMIUM_SPEAKABILITY_RULES`
 * above is duplicated rather than shared — `buildDeepDraftPrompts`'s source
 * stays untouched by anything premium-specific. The deterministic
 * enforcement in `enforceEpisodeShotDraftSpeakability` (via
 * `gateRawPremiumEpisodes`) is the actual guarantee; this is a best-effort
 * reduction of how often the contradiction is generated in the first place.
 */
const VD_PREMIUM_NO_SILENCE_INTENT_WITH_DIALOGUE_RULE =
  'A shot must NEVER set BOTH "silence_intent" and one or more "dialogue_lines" — pick exactly one: give it real speakable dialogue, or mark it "silence_intent" only if it truly has no speech at all.';

/**
 * Task #22 — the `tie_in_naturalness` judge-prompt addition, shared by
 * `buildPremiumJudgePrompts`/`buildPremiumRejudgePrompts`: an extra scoring
 * instruction (appended to the systemPrompt) plus a `"tie_in_naturalness":
 * number` suffix for the score-shape JSON spec line. BOTH `null`/`""`
 * (render/add nothing) unless at least one episode being judged THIS call
 * actually has `hasPlannedTieIn: true`, so a chunk/judge call with no placed
 * episode renders byte-identical to before task #22.
 */
function buildTieInJudgeInstructionAndShapeSuffix(
  hasAnyPlacedEpisode: boolean
): { instruction: string | null; scoreShapeSuffix: string } {
  if (!hasAnyPlacedEpisode) return { instruction: null, scoreShapeSuffix: "" };
  return {
    instruction:
      'Additionally, for any episode digest marked "hasPlannedTieIn": true, ALSO score "tie_in_naturalness" 1-5 (1 = reads like a forced advertisement, 5 = reads like real, organic product placement) — omit this field entirely for an episode NOT marked "hasPlannedTieIn": true.',
    scoreShapeSuffix: ', "tie_in_naturalness": number',
  };
}

function buildPremiumJudgePrompts(params: {
  title: string;
  locale: VerticalDramaSeriesLocale;
  genre?: string | null;
  tone?: string | null;
  recapItems: DeepDraftRecapEpisode[];
  openThreads: string[];
  candidates: Array<{
    candidateIndex: number;
    lensLabel: string;
    episodes: Array<{
      sourceItem: StoredEpisodeBreakdownItem;
      cliffhangerLine?: string;
      shotDrafts: VdDeepDraftShotDraft[];
      /** Task #22 — see `buildPremiumEpisodeDigest`'s own doc comment. */
      hasPlannedTieIn?: boolean;
    }>;
  }>;
}): { systemPrompt: string; userPrompt: string } {
  const hasAnyPlacedEpisode = params.candidates.some(c =>
    c.episodes.some(e => e.hasPlannedTieIn === true)
  );
  const tieInAddon = buildTieInJudgeInstructionAndShapeSuffix(hasAnyPlacedEpisode);
  const scoreShape =
    VD_PREMIUM_DRAFT_SCORE_DIMENSIONS.map(d => `"${d}": number`).join(", ") +
    tieInAddon.scoreShapeSuffix;
  const systemPrompt = [
    "You are a strict vertical-drama story-quality judge.",
    `You are given ${params.candidates.length} DIFFERENT candidate drafts, each covering the SAME set of episodes. Score EVERY candidate's EVERY episode independently on these ${VD_PREMIUM_DRAFT_SCORE_DIMENSIONS.length} dimensions, each 1-5 (1 = weak, 5 = excellent): ${VD_PREMIUM_DRAFT_SCORE_DIMENSIONS.join(", ")}. Also give an "overall" 1-5 holistic score per candidate per episode.`,
    "Judge dialogue_naturalness/pacing/emotion_variety/reversal_sharpness/hook_strength/cliffhanger_strength from each episode's own shots. Judge continuity_with_recap against the continuity recap given below (does this candidate respect and build on it, without contradiction?). Judge season_cohesion against how well this candidate's set of episodes reads as one coherent stretch of the season, together with the recap.",
    params.locale === "th"
      ? 'For dialogue_naturalness in Thai: 5 means the lines sound like real Thai people speaking under pressure, with character-appropriate pronouns/particles and subtext; 3 means understandable but stiff or expositional; 1-2 means translated, textbook-like, formal-report-like, or plot-summary language.'
      : null,
    tieInAddon.instruction,
    "Respond with ONLY a single JSON object (no markdown, no commentary) matching exactly this shape:",
    `{"scores": [{"candidateIndex": number, "episodeNumber": number, ${scoreShape}, "overall": number}]}`,
    `"scores" must contain exactly one entry for EVERY (candidateIndex, episodeNumber) pair across all ${params.candidates.length} candidates.`,
  ]
    .filter(Boolean)
    .join("\n");

  const recapText = buildDeepDraftContinuityRecap(
    params.recapItems,
    params.openThreads
  );

  const userPrompt = [
    `Series title: ${params.title}`,
    params.genre ? `Genre: ${params.genre}` : null,
    params.tone ? `Tone: ${params.tone}` : null,
    recapText,
    `Candidates to judge: ${JSON.stringify(
      params.candidates.map(c => ({
        candidateIndex: c.candidateIndex,
        lens: c.lensLabel,
        episodes: c.episodes.map(e =>
          buildPremiumEpisodeDigest({
            sourceItem: e.sourceItem,
            cliffhangerLine: e.cliffhangerLine,
            shotDrafts: e.shotDrafts,
            hasPlannedTieIn: e.hasPlannedTieIn,
          })
        ),
      }))
    )}`,
    VD_COMPACT_JSON_INSTRUCTION,
  ]
    .filter(Boolean)
    .join("\n");

  return { systemPrompt, userPrompt };
}

function buildPremiumRejudgePrompts(params: {
  title: string;
  locale: VerticalDramaSeriesLocale;
  genre?: string | null;
  tone?: string | null;
  recapItems: DeepDraftRecapEpisode[];
  openThreads: string[];
  episodes: Array<{
    sourceItem: StoredEpisodeBreakdownItem;
    cliffhangerLine?: string;
    shotDrafts: VdDeepDraftShotDraft[];
    /** Task #22 — see `buildPremiumEpisodeDigest`'s own doc comment. */
    hasPlannedTieIn?: boolean;
  }>;
}): { systemPrompt: string; userPrompt: string } {
  const hasAnyPlacedEpisode = params.episodes.some(
    e => e.hasPlannedTieIn === true
  );
  const tieInAddon = buildTieInJudgeInstructionAndShapeSuffix(hasAnyPlacedEpisode);
  const scoreShape =
    VD_PREMIUM_DRAFT_SCORE_DIMENSIONS.map(d => `"${d}": number`).join(", ") +
    tieInAddon.scoreShapeSuffix;
  const systemPrompt = [
    "You are a strict vertical-drama story-quality judge.",
    `Score EVERY episode given below on these ${VD_PREMIUM_DRAFT_SCORE_DIMENSIONS.length} dimensions, each 1-5 (1 = weak, 5 = excellent): ${VD_PREMIUM_DRAFT_SCORE_DIMENSIONS.join(", ")}. Also give an "overall" 1-5 holistic score per episode.`,
    "Judge continuity_with_recap against the continuity recap given below, and season_cohesion against how well this episode fits the season so far.",
    params.locale === "th"
      ? 'For dialogue_naturalness in Thai: 5 means the lines sound like real Thai people speaking under pressure, with character-appropriate pronouns/particles and subtext; 3 means understandable but stiff or expositional; 1-2 means translated, textbook-like, formal-report-like, or plot-summary language.'
      : null,
    tieInAddon.instruction,
    "Respond with ONLY a single JSON object (no markdown, no commentary) matching exactly this shape:",
    `{"scores": [{"episodeNumber": number, ${scoreShape}, "overall": number}]}`,
    '"scores" must contain exactly one entry for EVERY episode given below.',
  ]
    .filter(Boolean)
    .join("\n");

  const recapText = buildDeepDraftContinuityRecap(
    params.recapItems,
    params.openThreads
  );

  const userPrompt = [
    `Series title: ${params.title}`,
    params.genre ? `Genre: ${params.genre}` : null,
    params.tone ? `Tone: ${params.tone}` : null,
    recapText,
    `Episodes to score: ${JSON.stringify(
      params.episodes.map(e =>
        buildPremiumEpisodeDigest({
          sourceItem: e.sourceItem,
          cliffhangerLine: e.cliffhangerLine,
          shotDrafts: e.shotDrafts,
          hasPlannedTieIn: e.hasPlannedTieIn,
        })
      )
    )}`,
    VD_COMPACT_JSON_INSTRUCTION,
  ]
    .filter(Boolean)
    .join("\n");

  return { systemPrompt, userPrompt };
}

function buildPremiumRevisePrompts(params: {
  title: string;
  locale: VerticalDramaSeriesLocale;
  genre?: string | null;
  tone?: string | null;
  recapItems: DeepDraftRecapEpisode[];
  openThreads: string[];
  episodes: Array<{
    sourceItem: StoredEpisodeBreakdownItem;
    currentShotDrafts: VdDeepDraftShotDraft[];
    currentCliffhangerLine?: string;
    feedback: string;
    /**
     * Dramaturgy critic (W11.5) — the episode's CURRENT structural fields
     * (see `episodeBreakdownItemSchema`), given as context so a revision can
     * knowingly update them (e.g. a "vary the antagonist's tactic" fix
     * changing `antagonist_tactics`). Optional; omitted entirely for a
     * caller that predates W11.5 or an episode with none recorded yet.
     */
    currentStructure?: DramaturgyStructureFieldsLike;
  }>;
  /** Task #22 — see `buildDeepDraftPrompts`'s own doc comment; threaded through so a below-floor episode's revise call stays tie-in-aware. */
  tieInDraftContext?: VdTieInDraftContext;
}): { systemPrompt: string; userPrompt: string } {
  const langInstruction =
    params.locale === "th"
      ? "Write every dialogue line, shot summary, and cliffhanger line in natural, speakable Thai."
      : `Write every dialogue line, shot summary, and cliffhanger line in ${verticalDramaLocaleEnglishName(params.locale)}.`;

  const systemPrompt = [
    "You are a vertical-drama (short-form mobile drama series) shot-dialogue REVISER.",
    `For EACH episode listed below, REVISE its existing ${VD_DEEP_DRAFT_SHOTS_PER_EPISODE}-shot draft to address the specific feedback given for that episode — keep everything that already works, change only what the feedback calls out. The revised draft must still have EXACTLY ${VD_DEEP_DRAFT_SHOTS_PER_EPISODE} numbered shots ("shot_number" 1-${VD_DEEP_DRAFT_SHOTS_PER_EPISODE}, in order) and must NOT change the episode's workingTitle/logline/keyBeats.`,
    langInstruction,
    params.locale === "th" ? VD_NATURAL_THAI_DIALOGUE_RULES : null,
    VD_PREMIUM_SPEAKABILITY_RULES,
    VD_PREMIUM_NO_SILENCE_INTENT_WITH_DIALOGUE_RULE,
    'Each episode\'s "currentStructure" (when given) is its already-recorded antagonist_tactics/character_decisions/protagonist_stake/world_rules/price_paid — carry each forward UNCHANGED in your revised entry unless the feedback specifically calls for updating that one, in which case update ONLY that field.',
    buildTieInDraftSystemBlock(params.tieInDraftContext),
    params.tieInDraftContext
      ? 'If an episode\'s "currentDraft" already has a shot marked "tie_in.has_product_moment": true and the feedback does not ask you to change the product placement, KEEP that SAME shot marked (refine it — e.g. making it feel more organic — only if the feedback calls for that) — do not move the placement to a different shot or drop it.'
      : null,
    "Respond with ONLY a single JSON object (no markdown, no commentary) matching exactly this shape:",
    `{"episodeBreakdown": [{"episodeNumber": number, "workingTitle": string, "logline": string, "keyBeats": string[], "shotDrafts": [{"shot_number": number, "summary": string, "dialogue_lines": [{"speaker": string, "line": string, "delivery": string}], "silence_intent": "dramatic_pause"|"action_visual"|"montage"|"establishing"${tieInDraftShotShapeSuffix(params.tieInDraftContext)}}], "cliffhanger_line": string, "antagonist_tactics": string[], "character_decisions": [{"character": string, "decision": string}], "protagonist_stake": string, "world_rules": [{"rule": string, "limit_or_cost": string}], "price_paid": string}]}`,
    `"episodeBreakdown" must contain exactly ${params.episodes.length} entries — one per episode listed below, using the SAME episodeNumber/workingTitle/logline/keyBeats given — each with EXACTLY ${VD_DEEP_DRAFT_SHOTS_PER_EPISODE} "shotDrafts".`,
  ]
    .filter(Boolean)
    .join("\n");

  const recapText = buildDeepDraftContinuityRecap(
    params.recapItems,
    params.openThreads
  );

  const episodesPayload = params.episodes.map(e => ({
    episodeNumber: e.sourceItem.episodeNumber,
    workingTitle: e.sourceItem.workingTitle,
    logline: e.sourceItem.logline,
    keyBeats: e.sourceItem.keyBeats,
    feedback: e.feedback,
    currentDraft: {
      cliffhangerLine: e.currentCliffhangerLine ?? null,
      shots: e.currentShotDrafts.map(shot => ({
        shot_number: shot.shot_number,
        summary: shot.summary,
        dialogue_lines: shot.dialogue_lines,
        silence_intent: shot.silence_intent,
        ...(shot.tie_in ? { tie_in: shot.tie_in } : {}),
      })),
    },
    currentStructure: e.currentStructure ?? null,
    ...(buildTieInDraftEpisodePayloadField(params.tieInDraftContext, e.sourceItem.episodeNumber)
      ? { productTieIn: buildTieInDraftEpisodePayloadField(params.tieInDraftContext, e.sourceItem.episodeNumber) }
      : {}),
  }));

  const userPrompt = [
    `Series title: ${params.title}`,
    params.genre ? `Genre: ${params.genre}` : null,
    params.tone ? `Tone: ${params.tone}` : null,
    recapText,
    `Episodes to revise (current draft + feedback to address): ${JSON.stringify(episodesPayload)}`,
    VD_COMPACT_JSON_INSTRUCTION,
  ]
    .filter(Boolean)
    .join("\n");

  return { systemPrompt, userPrompt };
}

function buildPremiumSweepPrompts(params: {
  title: string;
  locale: VerticalDramaSeriesLocale;
  genre?: string | null;
  tone?: string | null;
  episodes: Array<{
    episodeNumber: number;
    workingTitle: string;
    logline: string;
    cliffhangerLine?: string;
    hookOpen?: string;
    hookResolution?: string;
    mainDialoguePhrases: string[];
  }>;
}): { systemPrompt: string; userPrompt: string } {
  const systemPrompt = [
    "You are a vertical-drama season continuity checker.",
    "Given a compact digest of EVERY episode drafted in this run (title/logline/cliffhanger/opening hook/resolution/sample dialogue phrases), find CROSS-EPISODE issues only: a later episode contradicting an earlier one, a beat/line/reveal repeated near-verbatim across episodes, or the season's escalation going flat (stakes/conflict not rising where it should).",
    "Respond with ONLY a single JSON object (no markdown, no commentary) matching exactly this shape:",
    '{"issues": [{"episodeNumber": number, "kind": "contradiction"|"repeat"|"escalation_flat", "instruction": string}]}',
    'Return an EMPTY "issues" array when the season reads consistently — do NOT invent issues. Each "instruction" must be a concrete, actionable fix for that ONE episode.',
  ].join("\n");

  const userPrompt = [
    `Series title: ${params.title}`,
    params.genre ? `Genre: ${params.genre}` : null,
    params.tone ? `Tone: ${params.tone}` : null,
    `Episodes drafted this run: ${JSON.stringify(
      params.episodes.map(e => ({
        episodeNumber: e.episodeNumber,
        workingTitle: e.workingTitle,
        logline: e.logline,
        cliffhangerLine: e.cliffhangerLine ?? null,
        hookOpen: e.hookOpen ?? null,
        hookResolution: e.hookResolution ?? null,
        mainDialoguePhrases: e.mainDialoguePhrases,
      }))
    )}`,
    VD_COMPACT_JSON_INSTRUCTION,
  ]
    .filter(Boolean)
    .join("\n");

  return { systemPrompt, userPrompt };
}

/* -------------------------------------------------------------------------- */
/* Premium pipeline — credit deduction + LLM call wrappers                    */
/* -------------------------------------------------------------------------- */

/** Deducts credits for ONE actual successful premium call (owner-approved design point 5) and returns the amount deducted. */
async function deductPremiumCall(
  ctx: PremiumRunContext,
  usage:
    | { prompt_tokens?: number; completion_tokens?: number }
    | null
    | undefined,
  description: string,
  extraMetadata: Record<string, unknown>
): Promise<number> {
  const credits = calculateCreditsForLLM(
    usage?.prompt_tokens ?? 0,
    usage?.completion_tokens ?? 0,
    ctx.model
  );
  await deductCredits({
    userId: ctx.userId,
    tenantId: ctx.tenantId,
    amount: credits,
    description,
    sourceType: "skill",
    metadata: {
      model: ctx.model,
      llmModel: ctx.model,
      feature: "vertical_drama_series_deep_story_draft_premium",
      seriesId: ctx.seriesId,
      inputTokens: usage?.prompt_tokens ?? 0,
      outputTokens: usage?.completion_tokens ?? 0,
      ...extraMetadata,
    },
  });
  return credits;
}

async function callPremiumFanoutCandidate(
  ctx: PremiumRunContext,
  candidateIndex: number,
  params: {
    title: string;
    locale: VerticalDramaSeriesLocale;
    genre?: string | null;
    tone?: string | null;
    chunkEpisodes: StoredEpisodeBreakdownItem[];
    recapItems: DeepDraftRecapEpisode[];
    openThreads: string[];
    /** Dramaturgy critic (W11.5) — see `buildDeepDraftPrompts`'s own doc comment; threaded straight through. */
    totalEpisodeCount?: number;
    /** Format profiles (task #23) — see `buildDeepDraftPrompts`'s own doc comment; threaded straight through, same lens the fan-out itself already appends after this base prompt is built. */
    formatProfile?: VerticalDramaFormatProfile;
    /** Task #22 — see `buildDeepDraftPrompts`'s own doc comment; threaded straight through. */
    tieInDraftContext?: VdTieInDraftContext;
    /** Feature 132 §4.2.7 (F132A) — see `buildDeepDraftPrompts`'s own doc comment; threaded straight through. */
    userPremise?: string;
    /** Feature 132 §6 (F132C) — see `buildDeepDraftPrompts`'s own doc comment; threaded straight through. */
    sceneContractsEnabled?: boolean;
  }
) {
  const base = buildDeepDraftPrompts(params);
  const lens = VD_PREMIUM_DRAFT_LENSES[candidateIndex];
  const { data, response } = await executeJsonPlanningCallWithRetry({
    model: ctx.model,
    systemPrompt: `${base.systemPrompt}\n${lens}`,
    userPrompt: base.userPrompt,
    temperature: 0.85,
    userId: ctx.userId,
    maxTokens: 16000,
    schema: deepDraftChunkResponseSchema,
    label: `Premium deep draft candidate ${candidateIndex} (${VD_PREMIUM_DRAFT_LENS_LABELS[candidateIndex]})`,
  });
  return { data, usage: response.usage };
}

async function callPremiumJudge(
  ctx: PremiumRunContext,
  params: Parameters<typeof buildPremiumJudgePrompts>[0]
) {
  const { systemPrompt, userPrompt } = buildPremiumJudgePrompts(params);
  const { data, response } = await executeJsonPlanningCallWithRetry({
    model: ctx.model,
    systemPrompt,
    userPrompt,
    temperature: 0.2,
    userId: ctx.userId,
    maxTokens: 4000,
    schema: premiumJudgeResponseSchema,
    label: "Premium deep draft judge",
  });
  return { scores: data.scores as PremiumJudgeScore[], usage: response.usage };
}

async function callPremiumRejudge(
  ctx: PremiumRunContext,
  params: Parameters<typeof buildPremiumRejudgePrompts>[0]
) {
  const { systemPrompt, userPrompt } = buildPremiumRejudgePrompts(params);
  const { data, response } = await executeJsonPlanningCallWithRetry({
    model: ctx.model,
    systemPrompt,
    userPrompt,
    temperature: 0.2,
    userId: ctx.userId,
    maxTokens: 4000,
    schema: premiumRejudgeResponseSchema,
    label: "Premium deep draft re-judge",
  });
  return { scores: data.scores, usage: response.usage };
}

async function callPremiumRevise(
  ctx: PremiumRunContext,
  params: Parameters<typeof buildPremiumRevisePrompts>[0] & { label: string }
) {
  const { systemPrompt, userPrompt } = buildPremiumRevisePrompts(params);
  const { data, response } = await executeJsonPlanningCallWithRetry({
    model: ctx.model,
    systemPrompt,
    userPrompt,
    temperature: 0.7,
    userId: ctx.userId,
    maxTokens: 16000,
    schema: premiumReviseResponseSchema,
    label: params.label,
  });
  return { data, usage: response.usage };
}

async function callPremiumSweep(
  ctx: PremiumRunContext,
  params: Parameters<typeof buildPremiumSweepPrompts>[0]
) {
  const { systemPrompt, userPrompt } = buildPremiumSweepPrompts(params);
  const { data, response } = await executeJsonPlanningCallWithRetry({
    model: ctx.model,
    systemPrompt,
    userPrompt,
    temperature: 0.3,
    userId: ctx.userId,
    maxTokens: 4000,
    schema: premiumSweepResponseSchema,
    label: "Premium deep draft season continuity sweep",
  });
  return { issues: data.issues, usage: response.usage };
}

/* -------------------------------------------------------------------------- */
/* Premium pipeline — per-chunk orchestration                                 */
/* -------------------------------------------------------------------------- */

type PremiumChunkResult = {
  /** Final per-episode state (winner, possibly revised) — in ascending episodeNumber order. */
  episodeStates: PremiumEpisodeState[];
  recapDelta: DeepDraftRecapEpisode[];
  openThreads: string[];
  /** Targeted-revise rounds actually attempted this chunk (0 = the fan-out judge already had every episode at floor). */
  roundsUsed: number;
  /** One flag per episode: `true` when the WINNING candidate had zero gate violations before any revise (owner-approved design point 4 `firstPassGatePassRate`). */
  firstPassGatePassFlags: boolean[];
  /** Live-bug fix (added 2026-07-08) — requested episode numbers still missing after the winner + revise loop + ONE corrective retry; empty when every requested episode was recovered. See `generateStoryBibleDeep`'s standard-mode loop for the same fix. */
  missingEpisodeNumbers: number[];
};

async function runPremiumChunk(
  ctx: PremiumRunContext,
  params: {
    title: string;
    locale: VerticalDramaSeriesLocale;
    genre?: string | null;
    tone?: string | null;
    chunkEpisodes: StoredEpisodeBreakdownItem[];
    recapItems: DeepDraftRecapEpisode[];
    openThreads: string[];
    /** Dramaturgy critic (W11.5) — see `buildDeepDraftPrompts`'s own doc comment; threaded straight through to the fan-out candidates below. */
    totalEpisodeCount?: number;
    /** Format profiles (task #23) — threaded to the fan-out candidates (via `callPremiumFanoutCandidate`), the missing-episode recovery retry below, and the targeted-revise floor check (`meetsPremiumDraftFloor`). */
    formatProfile?: VerticalDramaFormatProfile;
    /** Async story jobs (#28) — this chunk's 1-based position/total among the run's chunks, for `ctx.onProgress` events below. Optional/omittable — every progress call degrades to no `chunkIndex`/`chunkCount` when absent, never affects generation. */
    chunkIndex?: number;
    chunkCount?: number;
    /** Task #22 — threaded to the fan-out candidates, the judge/re-judge/revise calls, and the missing-episode recovery retry below. */
    tieInDraftContext?: VdTieInDraftContext;
    /** Feature 132 §4.2.7 (F132A) — threaded to the fan-out candidates and the missing-episode recovery retry below. */
    userPremise?: string;
    /** Feature 132 §6 (F132C) — threaded to the fan-out candidates and the missing-episode recovery retry below; also gates the contract deterministic-gate check further below. */
    sceneContractsEnabled?: boolean;
  },
  callAccounting: PremiumCallAccounting
): Promise<PremiumChunkResult> {
  // Task #22 — `true` only when this run has a tie-in context AND that
  // episode's placement is planned; used below to decide when a worst-case
  // fallback scorecard should ALSO stamp `tie_in_naturalness: 1`.
  const isEpisodeTieInPlaced = (episodeNumber: number): boolean =>
    findTieInDraftPlacement(params.tieInDraftContext, episodeNumber)
      ?.planned === true;

  // Async story jobs (#28) — additive, no-op when `ctx.onProgress` is absent.
  ctx.onProgress?.({
    phase: "draft",
    chunkIndex: params.chunkIndex,
    chunkCount: params.chunkCount,
  });

  // 1. FAN-OUT — 3 candidates in parallel, same base prompt + a distinct lens.
  const settled = await Promise.allSettled(
    VD_PREMIUM_DRAFT_LENSES.map((_lens, idx) =>
      callPremiumFanoutCandidate(ctx, idx, params)
    )
  );

  const episodeRangeLabel = `episodes ${params.chunkEpisodes[0]?.episodeNumber}-${params.chunkEpisodes[params.chunkEpisodes.length - 1]?.episodeNumber}`;
  const fulfilled: Array<{
    index: number;
    data: DeepDraftChunkResponse;
    usage:
      | { prompt_tokens?: number; completion_tokens?: number }
      | null
      | undefined;
  }> = [];
  for (let idx = 0; idx < settled.length; idx++) {
    const outcome = settled[idx];
    if (outcome.status === "fulfilled") {
      fulfilled.push({
        index: idx,
        data: outcome.value.data,
        usage: outcome.value.usage,
      });
    }
  }

  const rejected = settled.find(s => s.status === "rejected") as
    | PromiseRejectedResult
    | undefined;
  if (rejected) {
    throw rejected.reason instanceof Error
      ? rejected.reason
      : new Error(
          `Premium fan-out candidate failed: ${String(rejected.reason)}`
        );
  }

  for (const candidate of fulfilled) {
    const credits = await deductPremiumCall(
      ctx,
      candidate.usage,
      `Vertical Drama — premium draft candidate ${candidate.index} [${VD_PREMIUM_DRAFT_LENS_LABELS[candidate.index]}] (series #${ctx.seriesId}, ${episodeRangeLabel})`,
      {
        candidateIndex: candidate.index,
        lens: VD_PREMIUM_DRAFT_LENS_LABELS[candidate.index],
      }
    );
    callAccounting.addCredits(credits);
    callAccounting.addCall();
  }

  // 2. DETERMINISTIC GATES — no extra LLM call.
  const gatedCandidates = fulfilled.map(({ index, data }) => {
    const episodes = gateRawPremiumEpisodes(data.episodeBreakdown);
    const gateViolationCount = computePremiumGateViolationCount(episodes);
    return {
      index,
      episodes,
      openThreads: data.open_threads ?? params.openThreads,
      gateViolationCount,
    };
  });

  // 3. JUDGE — ONE inline call scoring every candidate's every episode.
  // Async story jobs (#28) — additive, no-op when `ctx.onProgress` is absent.
  ctx.onProgress?.({
    phase: "review",
    chunkIndex: params.chunkIndex,
    chunkCount: params.chunkCount,
  });
  const judgeResult = await callPremiumJudge(ctx, {
    title: params.title,
    locale: params.locale,
    genre: params.genre,
    tone: params.tone,
    recapItems: params.recapItems,
    openThreads: params.openThreads,
    candidates: gatedCandidates.map(c => ({
      candidateIndex: c.index,
      lensLabel: VD_PREMIUM_DRAFT_LENS_LABELS[c.index],
      episodes: c.episodes.map(ep => ({
        sourceItem: findPremiumSourceItem(
          params.chunkEpisodes,
          ep.episodeNumber
        ),
        cliffhangerLine: ep.cliffhanger_line,
        shotDrafts: ep.shotDrafts,
        // Task #22 — `undefined` (not `false`) whenever this run has no tie-in
        // context at all, so the judge digest/prompt stays byte-identical.
        hasPlannedTieIn: params.tieInDraftContext
          ? findTieInDraftPlacement(params.tieInDraftContext, ep.episodeNumber)
              ?.planned === true
          : undefined,
      })),
    })),
  });
  {
    const credits = await deductPremiumCall(
      ctx,
      judgeResult.usage,
      `Vertical Drama — premium draft judge (series #${ctx.seriesId}, ${episodeRangeLabel})`,
      {}
    );
    callAccounting.addCredits(credits);
    callAccounting.addCall();
  }

  // 4. SELECT WINNER.
  const candidateStats = gatedCandidates.map(c => {
    const relevantScores = judgeResult.scores.filter(
      s => s.candidateIndex === c.index
    );
    const meanOverall =
      relevantScores.length > 0
        ? relevantScores.reduce((sum, s) => sum + s.overall, 0) /
          relevantScores.length
        : 0;
    return {
      index: c.index,
      meanOverall,
      gateViolationCount: c.gateViolationCount,
    };
  });
  const winnerIndex = selectPremiumDraftWinnerIndex(candidateStats);
  const winner = gatedCandidates.find(c => c.index === winnerIndex)!;

  const firstPassGatePassFlags = winner.episodes.map(
    ep => ep.gateViolations === 0
  );

  const currentByEpisode = new Map<number, PremiumEpisodeState>();
  for (const ep of winner.episodes) {
    const score = judgeResult.scores.find(
      s =>
        s.candidateIndex === winnerIndex && s.episodeNumber === ep.episodeNumber
    );
    currentByEpisode.set(ep.episodeNumber, {
      episodeNumber: ep.episodeNumber,
      shotDrafts: ep.shotDrafts,
      cliffhanger_line: ep.cliffhanger_line,
      draftCompleteness: ep.draftCompleteness,
      draftScorecard: score
        ? scoreToScorecard(score, 0)
        : worstCasePremiumScorecard(0, isEpisodeTieInPlaced(ep.episodeNumber)),
      localWarnings: ep.localWarnings,
      ...extractDramaturgyStructureFields(ep),
    });
  }

  // 5. TARGETED REVISE LOOP (<= VD_PREMIUM_DRAFT_MAX_REVISE_ROUNDS rounds).
  let roundsUsed = 0;
  for (let round = 1; round <= VD_PREMIUM_DRAFT_MAX_REVISE_ROUNDS; round++) {
    const belowFloor = [...currentByEpisode.values()].filter(
      ep =>
        !meetsPremiumDraftFloor(ep.draftScorecard, params.formatProfile) ||
        (params.sceneContractsEnabled &&
          !meetsPremiumDraftContractFloor(ep.shotDrafts))
    );
    if (belowFloor.length === 0) break; // stop early — every episode already passes floors.
    roundsUsed = round;

    const reviseEpisodesInput = belowFloor.map(ep => ({
      sourceItem: findPremiumSourceItem(params.chunkEpisodes, ep.episodeNumber),
      currentShotDrafts: ep.shotDrafts,
      currentCliffhangerLine: ep.cliffhanger_line,
      feedback: composePremiumScoreFeedback(ep.draftScorecard),
      currentStructure: extractDramaturgyStructureFields(ep),
    }));
    const belowFloorEpisodeNumbers = belowFloor
      .map(ep => ep.episodeNumber)
      .join(",");

    // Async story jobs (#28) — additive, no-op when `ctx.onProgress` is absent.
    ctx.onProgress?.({
      phase: "fix",
      chunkIndex: params.chunkIndex,
      chunkCount: params.chunkCount,
      episodesDone: belowFloor.map(ep => ep.episodeNumber),
    });

    let reviseResult;
    try {
      reviseResult = await callPremiumRevise(ctx, {
        title: params.title,
        locale: params.locale,
        genre: params.genre,
        tone: params.tone,
        recapItems: params.recapItems,
        openThreads: params.openThreads,
        label: `Premium deep draft revise round ${round}`,
        episodes: reviseEpisodesInput,
        tieInDraftContext: params.tieInDraftContext,
      });
    } catch (err) {
      // Phase A reliability fix (added 2026-07-09) — was a bare `catch {}`
      // that silently swallowed the error; behavior (best-effort early stop)
      // is UNCHANGED, this only adds visibility into WHY the revise loop
      // stopped early.
      debugError(
        "vd_premium_revise_round",
        `Premium deep draft revise round ${round} failed for chunk episodes ${belowFloorEpisodeNumbers} (model ${ctx.model}) — keeping the current winner state, stopping the revise loop early`,
        { message: err instanceof Error ? err.message : String(err) }
      );
      break; // best-effort — keep the current winner state, stop the revise loop early.
    }
    {
      const credits = await deductPremiumCall(
        ctx,
        reviseResult.usage,
        `Vertical Drama — premium draft revise round ${round} (series #${ctx.seriesId}, episodes ${belowFloorEpisodeNumbers})`,
        { round }
      );
      callAccounting.addCredits(credits);
      callAccounting.addCall();
    }

    const revisedGated = gateRawPremiumEpisodes(
      reviseResult.data.episodeBreakdown
    );

    let rejudgeResult;
    try {
      rejudgeResult = await callPremiumRejudge(ctx, {
        title: params.title,
        locale: params.locale,
        genre: params.genre,
        tone: params.tone,
        recapItems: params.recapItems,
        openThreads: params.openThreads,
        episodes: revisedGated.map(ep => ({
          sourceItem: findPremiumSourceItem(
            params.chunkEpisodes,
            ep.episodeNumber
          ),
          cliffhangerLine: ep.cliffhanger_line,
          shotDrafts: ep.shotDrafts,
          hasPlannedTieIn: params.tieInDraftContext
            ? isEpisodeTieInPlaced(ep.episodeNumber)
            : undefined,
        })),
      });
    } catch (err) {
      // Phase A reliability fix (added 2026-07-09) — see the revise catch
      // above's own comment; same treatment, behavior unchanged.
      debugError(
        "vd_premium_rejudge_round",
        `Premium deep draft re-judge round ${round} failed for chunk episodes ${belowFloorEpisodeNumbers} (model ${ctx.model}) — keeping the current (un-revised) winner, this round's revision can't be scored`,
        { message: err instanceof Error ? err.message : String(err) }
      );
      break; // best-effort — keep the current (un-revised) winner, this round's revision can't be scored.
    }
    {
      const credits = await deductPremiumCall(
        ctx,
        rejudgeResult.usage,
        `Vertical Drama — premium draft re-judge round ${round} (series #${ctx.seriesId}, episodes ${belowFloorEpisodeNumbers})`,
        { round }
      );
      callAccounting.addCredits(credits);
      callAccounting.addCall();
    }

    for (const revisedEp of revisedGated) {
      const prior = currentByEpisode.get(revisedEp.episodeNumber);
      if (!prior) continue; // defensive — revised set is expected to be a subset of belowFloor's episode numbers.
      const score = rejudgeResult.scores.find(
        s => s.episodeNumber === revisedEp.episodeNumber
      );
      const newScorecard = score
        ? scoreToScorecard(score, round)
        : worstCasePremiumScorecard(round, isEpisodeTieInPlaced(revisedEp.episodeNumber));
      if (newScorecard.overall < prior.draftScorecard.overall) {
        continue; // REGRESSION GUARD — keep the prior episode version.
      }
      currentByEpisode.set(revisedEp.episodeNumber, {
        episodeNumber: revisedEp.episodeNumber,
        shotDrafts: revisedEp.shotDrafts,
        cliffhanger_line: revisedEp.cliffhanger_line,
        draftCompleteness: revisedEp.draftCompleteness,
        draftScorecard: newScorecard,
        localWarnings: revisedEp.localWarnings,
        ...mergeDramaturgyStructureFields(revisedEp, prior),
      });
    }
  }

  // Live-bug fix (chunk under-count no longer accepted silently, added
  // 2026-07-08) — the WINNING candidate (after gating + the revise loop
  // above) may still not cover every episode this chunk requested (e.g. the
  // winner's own fan-out response dropped one). Recover via ONE cheap,
  // plain (non-fan-out, non-judge) corrective call — reusing the SAME
  // `buildDeepDraftPrompts` + explicit missing-episode instruction standard
  // mode's own retry uses — rather than repeating the full, expensive
  // 3-candidate fan-out + judge for just the gap. Best-effort: a failure
  // here simply leaves the episode(s) missing, reported via
  // `missingEpisodeNumbers` below.
  const requestedEpisodeNumbers = params.chunkEpisodes.map(
    ep => ep.episodeNumber
  );
  let missingEpisodeNumbers = requestedEpisodeNumbers.filter(
    n => !currentByEpisode.has(n)
  );

  if (missingEpisodeNumbers.length > 0) {
    try {
      const base = buildDeepDraftPrompts({
        title: params.title,
        locale: params.locale,
        genre: params.genre,
        tone: params.tone,
        chunkEpisodes: params.chunkEpisodes,
        recapItems: params.recapItems,
        openThreads: params.openThreads,
        totalEpisodeCount: params.totalEpisodeCount,
        formatProfile: params.formatProfile,
        tieInDraftContext: params.tieInDraftContext,
        userPremise: params.userPremise,
        sceneContractsEnabled: params.sceneContractsEnabled,
      });
      const retryUserPrompt = `${base.userPrompt}\n\n${buildDeepDraftMissingEpisodesRetryInstruction(missingEpisodeNumbers)}`;
      const { data: retryData, response: retryResponse } =
        await executeJsonPlanningCallWithRetry({
          model: ctx.model,
          systemPrompt: base.systemPrompt,
          userPrompt: retryUserPrompt,
          temperature: 0.8,
          userId: ctx.userId,
          maxTokens: 16000,
          schema: deepDraftChunkResponseSchema,
          label: "Premium deep draft missing-episode retry",
        });

      const credits = await deductPremiumCall(
        ctx,
        retryResponse.usage,
        `Vertical Drama — premium draft missing-episode retry (series #${ctx.seriesId}, ${episodeRangeLabel})`,
        { missingEpisodeNumbers }
      );
      callAccounting.addCredits(credits);
      callAccounting.addCall();

      const recoveredRaw = retryData.episodeBreakdown.filter(ep =>
        missingEpisodeNumbers.includes(ep.episodeNumber)
      );
      const recovered = gateRawPremiumEpisodes(recoveredRaw);
      for (const ep of recovered) {
        if (currentByEpisode.has(ep.episodeNumber)) continue; // defensive — recoveredRaw is already filtered to missing-only.
        currentByEpisode.set(ep.episodeNumber, {
          episodeNumber: ep.episodeNumber,
          shotDrafts: ep.shotDrafts,
          cliffhanger_line: ep.cliffhanger_line,
          draftCompleteness: ep.draftCompleteness,
          // Never went through the LLM judge (this is a cheap single-call
          // recovery pass, not another fan-out+judge round) — score at the
          // worst case (mirrors `worstCasePremiumScorecard`'s own existing
          // "a missing judgment always reads as needs-revision" convention)
          // rather than fabricate a passing score for content that was
          // never actually judged.
          draftScorecard: worstCasePremiumScorecard(
            0,
            isEpisodeTieInPlaced(ep.episodeNumber)
          ),
          localWarnings: ep.localWarnings,
          ...extractDramaturgyStructureFields(ep),
        });
      }
      missingEpisodeNumbers = requestedEpisodeNumbers.filter(
        n => !currentByEpisode.has(n)
      );
    } catch (retryError) {
      debugError(
        "vd_premium_deep_draft_missing_episode_retry",
        `Premium deep draft missing-episode retry failed for series #${ctx.seriesId} — keeping the winner's episodes`,
        {
          message:
            retryError instanceof Error
              ? retryError.message
              : String(retryError),
        }
      );
    }
  }

  const episodeStates = [...currentByEpisode.values()].sort(
    (a, b) => a.episodeNumber - b.episodeNumber
  );
  const recapDelta: DeepDraftRecapEpisode[] = episodeStates.map(ep => {
    const source = findPremiumSourceItem(
      params.chunkEpisodes,
      ep.episodeNumber
    );
    return {
      episodeNumber: ep.episodeNumber,
      workingTitle: source.workingTitle,
      logline: source.logline,
      cliffhangerLine: ep.cliffhanger_line,
    };
  });

  return {
    episodeStates,
    recapDelta,
    openThreads: winner.openThreads,
    roundsUsed,
    firstPassGatePassFlags,
    missingEpisodeNumbers,
  };
}

/* -------------------------------------------------------------------------- */
/* Premium pipeline — one-time season continuity sweep                        */
/* -------------------------------------------------------------------------- */

/**
 * Runs ONCE (never loops) after every chunk in this run has completed
 * (owner-approved design point 3: "Cap: sweep runs once"). Digest covers
 * every episode drafted in THIS run (`byEpisode`, already merged across all
 * chunks by the caller). Mutates `byEpisode` IN PLACE for any spot-revised
 * episode that passes the regression guard; every step is best-effort — any
 * failure simply leaves `byEpisode` as it already was, never throws, and
 * never blocks the run.
 */
async function runPremiumSeasonSweep(
  ctx: PremiumRunContext,
  params: {
    title: string;
    locale: VerticalDramaSeriesLocale;
    genre?: string | null;
    tone?: string | null;
    allEpisodes: StoredEpisodeBreakdownItem[];
    byEpisode: Map<number, PremiumEpisodeState>;
  },
  callAccounting: PremiumCallAccounting
): Promise<{ issuesFound: number }> {
  const digestEpisodes = [...params.byEpisode.values()]
    .sort((a, b) => a.episodeNumber - b.episodeNumber)
    .map(ep => {
      const source = findPremiumSourceItem(
        params.allEpisodes,
        ep.episodeNumber
      );
      const allLines = ep.shotDrafts.flatMap(shot =>
        shot.dialogue_lines.map(line => line.line)
      );
      return {
        episodeNumber: ep.episodeNumber,
        workingTitle: source.workingTitle,
        logline: source.logline,
        cliffhangerLine: ep.cliffhanger_line,
        hookOpen: ep.shotDrafts[0]?.summary,
        hookResolution: ep.shotDrafts[ep.shotDrafts.length - 1]?.summary,
        mainDialoguePhrases: allLines.slice(0, 3),
      };
    });

  // Async story jobs (#28) — additive, no-op when `ctx.onProgress` is absent.
  // The sweep runs ONCE after every chunk, so it deliberately omits
  // `chunkIndex`/`chunkCount` (not chunk-scoped).
  ctx.onProgress?.({ phase: "outline" });

  let sweepResult;
  try {
    sweepResult = await callPremiumSweep(ctx, {
      title: params.title,
      locale: params.locale,
      genre: params.genre,
      tone: params.tone,
      episodes: digestEpisodes,
    });
  } catch {
    return { issuesFound: 0 }; // best-effort — the sweep never blocks the run.
  }
  {
    const credits = await deductPremiumCall(
      ctx,
      sweepResult.usage,
      `Vertical Drama — premium draft season continuity sweep (series #${ctx.seriesId})`,
      {}
    );
    callAccounting.addCredits(credits);
    callAccounting.addCall();
  }

  if (sweepResult.issues.length === 0) {
    return { issuesFound: 0 };
  }

  // Batch by episode — multiple issues targeting the same episode combine into one feedback string.
  const issuesByEpisode = new Map<number, VdPremiumSweepIssue[]>();
  for (const issue of sweepResult.issues) {
    const list = issuesByEpisode.get(issue.episodeNumber) ?? [];
    list.push(issue);
    issuesByEpisode.set(issue.episodeNumber, list);
  }

  const affectedEpisodeNumbers = [...issuesByEpisode.keys()].filter(num =>
    params.byEpisode.has(num)
  );
  if (affectedEpisodeNumbers.length === 0) {
    return { issuesFound: sweepResult.issues.length };
  }

  const reviseEpisodesInput = affectedEpisodeNumbers.map(num => {
    const current = params.byEpisode.get(num)!;
    return {
      sourceItem: findPremiumSourceItem(params.allEpisodes, num),
      currentShotDrafts: current.shotDrafts,
      currentCliffhangerLine: current.cliffhanger_line,
      feedback: composePremiumSweepFeedback(issuesByEpisode.get(num)!),
      currentStructure: extractDramaturgyStructureFields(current),
    };
  });
  const affectedEpisodeNumbersLabel = affectedEpisodeNumbers.join(",");

  // Async story jobs (#28) — additive, no-op when `ctx.onProgress` is absent.
  ctx.onProgress?.({ phase: "fix", episodesDone: affectedEpisodeNumbers });

  let reviseResult;
  try {
    reviseResult = await callPremiumRevise(ctx, {
      title: params.title,
      locale: params.locale,
      genre: params.genre,
      tone: params.tone,
      recapItems: [],
      openThreads: [],
      label: "Premium deep draft season sweep spot-revise",
      episodes: reviseEpisodesInput,
    });
  } catch (err) {
    // Phase A reliability fix (added 2026-07-09) — was a bare `catch {}`
    // that silently swallowed the error; behavior (best-effort — the sweep
    // never blocks the run) is UNCHANGED, this only adds visibility.
    debugError(
      "vd_premium_sweep_spot_revise",
      `Premium deep draft season sweep spot-revise failed for episodes ${affectedEpisodeNumbersLabel} (model ${ctx.model}) — sweep issues reported but not fixed`,
      { message: err instanceof Error ? err.message : String(err) }
    );
    return { issuesFound: sweepResult.issues.length };
  }
  {
    const credits = await deductPremiumCall(
      ctx,
      reviseResult.usage,
      `Vertical Drama — premium draft season sweep spot-revise (series #${ctx.seriesId}, episodes ${affectedEpisodeNumbersLabel})`,
      {}
    );
    callAccounting.addCredits(credits);
    callAccounting.addCall();
  }

  const revisedGated = gateRawPremiumEpisodes(
    reviseResult.data.episodeBreakdown
  );

  let rejudgeResult;
  try {
    rejudgeResult = await callPremiumRejudge(ctx, {
      title: params.title,
      locale: params.locale,
      genre: params.genre,
      tone: params.tone,
      recapItems: [],
      openThreads: [],
      episodes: revisedGated.map(ep => ({
        sourceItem: findPremiumSourceItem(params.allEpisodes, ep.episodeNumber),
        cliffhangerLine: ep.cliffhanger_line,
        shotDrafts: ep.shotDrafts,
      })),
    });
  } catch (err) {
    // Phase A reliability fix (added 2026-07-09) — see the spot-revise
    // catch above's own comment; same treatment, behavior unchanged.
    debugError(
      "vd_premium_sweep_spot_rejudge",
      `Premium deep draft season sweep spot-rejudge failed for episodes ${affectedEpisodeNumbersLabel} (model ${ctx.model}) — sweep issues reported but not fixed`,
      { message: err instanceof Error ? err.message : String(err) }
    );
    return { issuesFound: sweepResult.issues.length };
  }
  {
    const credits = await deductPremiumCall(
      ctx,
      rejudgeResult.usage,
      `Vertical Drama — premium draft season sweep re-judge (series #${ctx.seriesId}, episodes ${affectedEpisodeNumbersLabel})`,
      {}
    );
    callAccounting.addCredits(credits);
    callAccounting.addCall();
  }

  for (const revisedEp of revisedGated) {
    const prior = params.byEpisode.get(revisedEp.episodeNumber);
    if (!prior) continue;
    const score = rejudgeResult.scores.find(
      s => s.episodeNumber === revisedEp.episodeNumber
    );
    const newScorecard = score
      ? scoreToScorecard(score, VD_PREMIUM_DRAFT_SWEEP_ROUND)
      : worstCasePremiumScorecard(VD_PREMIUM_DRAFT_SWEEP_ROUND);
    if (newScorecard.overall < prior.draftScorecard.overall) {
      continue; // REGRESSION GUARD — keep the prior episode version.
    }
    params.byEpisode.set(revisedEp.episodeNumber, {
      episodeNumber: revisedEp.episodeNumber,
      shotDrafts: revisedEp.shotDrafts,
      cliffhanger_line: revisedEp.cliffhanger_line,
      draftCompleteness: revisedEp.draftCompleteness,
      draftScorecard: newScorecard,
      localWarnings: revisedEp.localWarnings,
      ...mergeDramaturgyStructureFields(revisedEp, prior),
    });
  }

  return { issuesFound: sweepResult.issues.length };
}

/* -------------------------------------------------------------------------- */
/* Premium pipeline — top-level entry point                                   */
/* -------------------------------------------------------------------------- */

/**
 * Premium multi-round deep-draft generation (owner-approved design, W11-A).
 * Called ONLY via `generateStoryBibleDeep({..., mode: "premium"})` — see the
 * mode switch at the top of that function. Mirrors its credit
 * check -> call -> deduct convention and partial-failure semantics (a failed
 * chunk after at least one earlier chunk succeeded returns `partial: true`
 * with everything already drafted preserved; a failure on the very first
 * chunk throws, matching a single-call failure) — see this section's header
 * comment for the full per-chunk/sweep pipeline.
 */
async function generateStoryBibleDeepPremium(
  params: GenerateStoryBibleDeepParams
): Promise<GenerateStoryBibleDeepResult> {
  const episodes = [...params.episodes].sort(
    (a, b) => a.episodeNumber - b.episodeNumber
  );
  if (episodes.length === 0) {
    return {
      draftedItems: [],
      chunkSizes: [],
      partial: false,
      creditsUsed: 0,
      model: "",
      warnings: [],
      finalOpenThreads: params.priorRecap?.openThreads ?? [],
      missingEpisodes: [],
    };
  }

  const chunkSizes = computePremiumDeepDraftChunkSizes(episodes.length);
  const totalEstimate =
    estimatePremiumDeepDraftCalls(chunkSizes.length) *
    VD_DEEP_DRAFT_PER_CALL_CREDIT_ESTIMATE;
  const hasCredits = await hasEnoughCredits(params.userId, totalEstimate);
  if (!hasCredits) {
    throw new InsufficientCreditsError();
  }

  const model = await resolveDeepStoryDraftModel();
  const ctx: PremiumRunContext = {
    model,
    userId: params.userId,
    tenantId: params.tenantId,
    seriesId: params.seriesId,
    onProgress: params.onProgress,
  };

  // Format profiles (task #23) — see `generateStoryBibleDeep`'s (standard
  // mode) identical resolution for why this requires BOTH flags and reads
  // `totalEpisodeCount`, never `episodes.length`.
  const formatProfile =
    params.formatProfilesEnabled && params.totalEpisodeCount != null
      ? resolveVerticalDramaFormatProfile(params.totalEpisodeCount)
      : undefined;

  const completedChunkSizes: number[] = [];
  const roundsUsedPerChunk: number[] = [];
  const firstPassGateFlags: boolean[] = [];
  const missingEpisodes: number[] = [];
  const missingEpisodeWarnings: VdDeepDraftWarning[] = [];
  const allDraftedByEpisode = new Map<number, PremiumEpisodeState>();
  let recapItems = [...(params.priorRecap?.items ?? [])];
  let openThreads = [...(params.priorRecap?.openThreads ?? [])];
  let totalCreditsUsed = 0;
  let callsMade = 0;
  let cursor = 0;
  let partial = false;
  let failureMessage: string | undefined;
  let chunkIndex = 0;

  const callAccounting: PremiumCallAccounting = {
    addCredits: amount => {
      totalCreditsUsed += amount;
    },
    addCall: () => {
      callsMade += 1;
    },
  };

  const applyChunkResult = (
    chunkResult: PremiumChunkResult,
    sourceEpisodes: StoredEpisodeBreakdownItem[]
  ): boolean => {
    for (const state of chunkResult.episodeStates) {
      allDraftedByEpisode.set(state.episodeNumber, state);
    }
    recapItems = [...recapItems, ...chunkResult.recapDelta];
    openThreads = chunkResult.openThreads;
    // Actual number of episodes this chunk actually persisted — NOT the
    // originally-requested size (same live-bug fix as standard mode: the
    // client success toast sums this via `sumDeepDraftChunkSizes`).
    completedChunkSizes.push(chunkResult.episodeStates.length);
    roundsUsedPerChunk.push(chunkResult.roundsUsed);
    firstPassGateFlags.push(...chunkResult.firstPassGatePassFlags);

    if (chunkResult.missingEpisodeNumbers.length === 0) {
      return true;
    }

    for (const missingEpisodeNumber of chunkResult.missingEpisodeNumbers) {
      missingEpisodes.push(missingEpisodeNumber);
      missingEpisodeWarnings.push({
        episodeNumber: missingEpisodeNumber,
        shotNumber: 0,
        reason: "episode_missing_after_retry",
      });
    }
    partial = true;
    failureMessage = `Premium deep story draft chunk (${sourceEpisodes[0]?.episodeNumber}-${sourceEpisodes[sourceEpisodes.length - 1]?.episodeNumber}) is still missing episode(s) ${chunkResult.missingEpisodeNumbers.join(", ")} after a corrective retry`;
    return false;
  };

  for (const size of chunkSizes) {
    chunkIndex += 1;
    const chunkEpisodes = episodes.slice(cursor, cursor + size);
    cursor += size;

    try {
      const chunkResult = await runPremiumChunk(
        ctx,
        {
          title: params.title,
          locale: params.locale,
          genre: params.genre,
          tone: params.tone,
          chunkEpisodes,
          recapItems,
          openThreads,
          totalEpisodeCount: params.totalEpisodeCount,
          formatProfile,
          chunkIndex,
          chunkCount: chunkSizes.length,
          tieInDraftContext: params.tieInDraftContext,
          userPremise: params.userPremise,
          sceneContractsEnabled: params.sceneContractsEnabled,
        },
        callAccounting
      );

      if (!applyChunkResult(chunkResult, chunkEpisodes)) {
        // Stop here — same "never let a later chunk push horizonEndEpisode
        // past an actual gap" reasoning as standard mode's loop.
        break;
      }
    } catch (error) {
      if (chunkEpisodes.length > 1) {
        let splitFailure: unknown = null;
        for (const singleEpisode of chunkEpisodes) {
          chunkIndex += 1;
          try {
            const singleResult = await runPremiumChunk(
              ctx,
              {
                title: params.title,
                locale: params.locale,
                genre: params.genre,
                tone: params.tone,
                chunkEpisodes: [singleEpisode],
                recapItems,
                openThreads,
                totalEpisodeCount: params.totalEpisodeCount,
                formatProfile,
                chunkIndex,
                chunkCount: chunkSizes.length,
                tieInDraftContext: params.tieInDraftContext,
                userPremise: params.userPremise,
                sceneContractsEnabled: params.sceneContractsEnabled,
              },
              callAccounting
            );
            if (!applyChunkResult(singleResult, [singleEpisode])) {
              splitFailure = new Error(failureMessage);
              break;
            }
          } catch (singleError) {
            splitFailure = singleError;
            break;
          }
        }
        if (splitFailure == null) {
          continue;
        }
        if (allDraftedByEpisode.size > 0) {
          partial = true;
          failureMessage =
            splitFailure instanceof Error
              ? splitFailure.message
              : String(splitFailure);
          break;
        }
        throw splitFailure;
      }
      if (allDraftedByEpisode.size === 0) {
        // Nothing succeeded yet — nothing to persist, so fail exactly like a
        // single-call `generateStoryBible` failure (no partial result).
        throw error;
      }
      partial = true;
      failureMessage = error instanceof Error ? error.message : String(error);
      break;
    }
  }

  const episodesBelowFloorAfter = [...allDraftedByEpisode.values()].filter(
    state =>
      !meetsPremiumDraftFloor(state.draftScorecard, formatProfile) ||
      (params.sceneContractsEnabled &&
        !meetsPremiumDraftContractFloor(state.shotDrafts))
  ).length;

  let sweepIssuesFound = 0;
  if (!partial && allDraftedByEpisode.size > 0) {
    const sweepOutcome = await runPremiumSeasonSweep(
      ctx,
      {
        title: params.title,
        locale: params.locale,
        genre: params.genre,
        tone: params.tone,
        allEpisodes: episodes,
        byEpisode: allDraftedByEpisode,
      },
      callAccounting
    );
    sweepIssuesFound = sweepOutcome.issuesFound;
  }

  const finalStates = [...allDraftedByEpisode.values()].sort(
    (a, b) => a.episodeNumber - b.episodeNumber
  );
  const draftedItems: DeepDraftedEpisodeItem[] = finalStates.map(state => ({
    episodeNumber: state.episodeNumber,
    shotDrafts: state.shotDrafts,
    cliffhanger_line: state.cliffhanger_line,
    draftCompleteness: state.draftCompleteness,
    draftScorecard: state.draftScorecard,
    ...extractDramaturgyStructureFields(state),
  }));
  const warnings = [
    ...finalStates.flatMap(state => state.localWarnings),
    ...missingEpisodeWarnings,
  ];

  const firstPassGatePassRate =
    firstPassGateFlags.length > 0
      ? firstPassGateFlags.filter(Boolean).length / firstPassGateFlags.length
      : 0;

  const premiumMetrics: VdPremiumDeepDraftMetrics = {
    mode: "premium",
    candidateCount: VD_PREMIUM_DRAFT_CANDIDATE_COUNT,
    roundsUsedPerChunk,
    firstPassGatePassRate,
    episodesBelowFloorAfter,
    sweepIssuesFound,
    callsMade,
  };

  // Task #22 — same reconciliation standard mode runs above, over every
  // episode drafted this (premium) run.
  const tieInReconciliation = reconcileTieInDraftMarking(
    draftedItems,
    params.tieInDraftContext
  );
  // Feature 132 §4.2.7 (F132A) — same deterministic premise-coverage guard
  // standard mode runs above; no-op when `params.userPremise` is absent/blank.
  const warningsWithPremiseCoverage = appendDeepDraftPremiseCoverageWarning(
    [...warnings, ...tieInReconciliation.warnings],
    params.userPremise,
    draftedItems,
    openThreads
  );

  return {
    draftedItems,
    chunkSizes: completedChunkSizes,
    partial,
    creditsUsed: totalCreditsUsed,
    model,
    warnings: warningsWithPremiseCoverage,
    finalOpenThreads: openThreads,
    premiumMetrics,
    missingEpisodes,
    ...(partial && failureMessage ? { error: failureMessage } : {}),
    ...(params.tieInDraftContext
      ? { tieInMismatchCount: tieInReconciliation.mismatchCount }
      : {}),
  };
}

/* -------------------------------------------------------------------------- */
/* Manual dialogue edits — series Overview per-shot correction (W10.5,        */
/* added 2026-07-08)                                                          */
/*                                                                            */
/* Lets the user fix a deep-drafted shot's dialogue lines AT THE SOURCE (the  */
/* series' active breakdown item) so a corrected line hydrates into episodes  */
/* materialized from it later, instead of only patching an already-          */
/* materialized episode's own copy.                                          */
/*                                                                            */
/* PERSISTENCE DECISION (locked): `verticalDramaSeries.ts`'s                  */
/* `updateEpisodeDraftDialogue` mutation persists the item returned by        */
/* `applyManualDialogueEdit` below by EDITING the ACTIVE breakdown version's  */
/* item IN PLACE — an explicit, deliberate exception to the append-only       */
/* breakdown-versions discipline (spec §7.7.3 hard rule 4: "Breakdown         */
/* versions are append-only ... Produced episodes are NEVER rewritten").      */
/* Justification: these are typo/line-level user corrections to text that    */
/* was already produced, not a re-plan of future story content — append-only  */
/* versioning continues to govern genuine plan regeneration                   */
/* (`generateStoryBibleDeep`/`extendStoryDraftHorizon` above) and arc         */
/* re-plans (`verticalDramaArcReplan.ts`'s `applyApprovedArcReplan`). The     */
/* router persists via the exact SAME `db.update(verticalDramaSeries).set({   */
/* bible, updatedAt })` call shape `approveArcReplanProposal` uses — see      */
/* `updateEpisodeDraftDialogue` in `verticalDramaSeries.ts`.                  */
/* -------------------------------------------------------------------------- */

/** Max dialogue lines accepted per `updateEpisodeDraftDialogue` call (owner-approved design, W10.5). */
export const VD_MANUAL_DIALOGUE_EDIT_MAX_LINES = 8;
/** Max chars accepted (after `.trim()`) for a manually-edited line's `speaker` field (W10.5). */
export const VD_MANUAL_DIALOGUE_EDIT_SPEAKER_MAX_LENGTH = 60;
/** Max chars accepted (after `.trim()`) for a manually-edited line's `line` field (W10.5); `line` also has a `.min(1)` — an empty-after-trim line is rejected. */
export const VD_MANUAL_DIALOGUE_EDIT_LINE_MAX_LENGTH = 300;
/** Max chars accepted (after `.trim()`) for a manually-edited line's `delivery` field (W10.5). */
export const VD_MANUAL_DIALOGUE_EDIT_DELIVERY_MAX_LENGTH = 120;

/**
 * Placeholder stored for a manually-edited line whose `speaker` was omitted
 * or blank. The mutation's input allows an optional `speaker` (the client
 * does not always collect one), but the STORED per-line shape
 * (`shotDialogueLineSchema` above — a manually-edited shot is still read by
 * the SAME tolerant `readItemShotDrafts` every other deep-draft reader
 * uses) requires a non-empty `speaker` key on every line: an empty/missing
 * one would silently fail `readItemShotDrafts`'s WHOLE-ARRAY parse for this
 * item on every later read (including this item's OWN next manual edit) —
 * never just that one line. Storing this placeholder instead keeps every
 * later read (`readItemShotDrafts`, a second `applyManualDialogueEdit`
 * call, the continuity recap builder, etc.) succeeding. Never treated as a
 * real character name.
 */
export const VD_MANUAL_DIALOGUE_EDIT_UNSPECIFIED_SPEAKER = "ไม่ระบุผู้พูด";

/**
 * One caller-authored dialogue line replacement — the
 * `updateEpisodeDraftDialogue` mutation input shape. Distinct from
 * `VdDeepDraftShotDialogueLine` (this file's own fresh-LLM-response/stored
 * shape) ONLY in that `speaker` is optional here; `verticalDramaSeries.ts`'s
 * `updateEpisodeDraftDialogueInput` zod schema is this type's source of
 * validation (length limits above) — a plain TS type here, not a zod schema,
 * since input validation is the router's job.
 */
export type VdManualDialogueEditLine = {
  speaker?: string;
  line: string;
  delivery?: string;
};

/** One line's speakability report for `updateEpisodeDraftDialogue` — the client already offers live cleaning before submit, so the server only REPORTS violations here; it never silently cleans a manually-authored line (see `applyManualDialogueEdit`'s doc comment). */
export type VdManualDialogueEditSpeakabilityWarning = {
  lineIndex: number;
  violations: VerticalDramaLineSpeakabilityViolation[];
  cleanedSuggestion: VerticalDramaLineSpeakabilityCleaned;
};

/**
 * Runs the canonical `analyzeVerticalDramaLineSpeakability` over every line,
 * REPORT-ONLY — never mutates/cleans `lines` itself. Shared by
 * `applyManualDialogueEdit` (fresh edit) and `updateEpisodeDraftDialogue`'s
 * idempotent-replay short-circuit (recomputes warnings from the
 * already-stored lines instead of re-applying the edit), so both paths
 * derive warnings from exactly the same logic.
 */
export function analyzeManualDialogueEditLines(
  lines: readonly VdManualDialogueEditLine[]
): VdManualDialogueEditSpeakabilityWarning[] {
  const warnings: VdManualDialogueEditSpeakabilityWarning[] = [];
  lines.forEach((line, lineIndex) => {
    const analysis = analyzeVerticalDramaLineSpeakability({
      speaker: line.speaker,
      line: line.line,
    });
    if (!analysis.speakable) {
      warnings.push({
        lineIndex,
        violations: analysis.violations,
        cleanedSuggestion: analysis.cleaned,
      });
    }
  });
  return warnings;
}

const manualDialogueEditStampSchema = z
  .object({
    editedAt: z.string().min(1),
    editedByUserId: z.number().int().positive(),
    shotNumbers: z.array(
      z.number().int().min(1).max(VD_DEEP_DRAFT_SHOTS_PER_EPISODE)
    ),
    /**
     * Idempotency replay guard — every idempotencyKey `updateEpisodeDraftDialogue`
     * has already applied to this item, so a retried call with the SAME key
     * is detected as a replay (see that mutation) instead of re-applying
     * (and re-accumulating `shotNumbers` for) the same edit twice. Mirrors
     * `createEpisode`'s `_idempotencyReceipt` convention
     * (`verticalDramaEpisodes.ts`), scoped per-item instead of per-row since
     * this mutation edits one field of an existing item rather than creating
     * a new row.
     */
    appliedIdempotencyKeys: z.array(z.string()).optional(),
  })
  .passthrough();

export type VdManualDialogueEditStamp = z.infer<
  typeof manualDialogueEditStampSchema
>;

/**
 * Tolerant read of a stored breakdown item's `manualDialogueEdit` (W10.5) —
 * mirrors `readItemDraftScorecard`/`readItemDraftCompleteness`'s "never
 * throw, `null` when absent or malformed" shape exactly. `null` for every
 * item that predates this field (including one with `shotDrafts` that has
 * simply never been manually edited) — always legacy-tolerant.
 */
export function readItemManualDialogueEdit(
  item: StoredEpisodeBreakdownItem
): VdManualDialogueEditStamp | null {
  const raw = (item as { manualDialogueEdit?: unknown }).manualDialogueEdit;
  if (raw === undefined) return null;
  const parsed = manualDialogueEditStampSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

/**
 * Resolves the index (within `readBreakdownVersions(bible)`) of the
 * CURRENTLY ACTIVE breakdown version — the SAME "active, falling back to
 * the most recently appended version" resolution `getActiveBreakdown`/
 * `readActiveDeepDraftMetadata` each already implement, intentionally NOT
 * refactored to share code with either (same "keep this addition a pure,
 * risk-free superset" reasoning `readActiveDeepDraftMetadata`'s own doc
 * comment gives). Returns `-1` when no versions exist at all. Used by
 * `updateEpisodeDraftDialogue` (`verticalDramaSeries.ts`) to locate the ONE
 * version whose item it edits in place — see this section's own
 * "PERSISTENCE DECISION" note above.
 */
export function resolveActiveBreakdownVersionIndex(
  bible: Record<string, unknown> | null | undefined
): number {
  const versions = readBreakdownVersions(bible);
  if (versions.length === 0) return -1;
  const activeId = (
    bible as { activeBreakdownVersionId?: unknown } | null | undefined
  )?.activeBreakdownVersionId;
  if (typeof activeId === "string") {
    const index = versions.findIndex(v => v.versionId === activeId);
    if (index >= 0) return index;
  }
  return versions.length - 1;
}

/** Thrown by `applyManualDialogueEdit` when `item` has no `shotDrafts` at all, or none matching the requested `shotNumber`. The router maps this to `TRPCError({ code: "NOT_FOUND" })`, reusing this error's own message verbatim. */
export class ManualDialogueEditNoDraftError extends Error {
  code = "VD_MANUAL_DIALOGUE_EDIT_NO_DRAFT" as const;
  constructor() {
    super("ไม่มีร่างสำหรับตอน/ช็อตนี้");
    this.name = "ManualDialogueEditNoDraftError";
  }
}

export interface ApplyManualDialogueEditInput {
  /** The ACTIVE breakdown item carrying the target shot (already resolved by the caller — this function never scans `bible`). */
  item: StoredEpisodeBreakdownItem;
  shotNumber: number;
  /** REPLACES the shot's `dialogue_lines` verbatim — never auto-cleaned (see this function's own doc comment). */
  lines: VdManualDialogueEditLine[];
  editedByUserId: number;
  /** Overridable for deterministic tests; defaults to `new Date().toISOString()`. */
  editedAt?: string;
  /**
   * Recorded into `manualDialogueEdit.appliedIdempotencyKeys` (accumulated)
   * when provided. The router calls this function ONLY on a fresh
   * (non-replay) edit — an already-applied key is detected and short-circuited
   * BEFORE this function is ever called — so `idempotencyKey` here is always
   * a NEW key for this item by construction.
   */
  idempotencyKey?: string;
}

export interface ApplyManualDialogueEditResult {
  item: StoredEpisodeBreakdownItem;
  criteriaVersionMarker: string;
  speakabilityWarnings: VdManualDialogueEditSpeakabilityWarning[];
  silenceIntentRemoved: boolean;
}

/**
 * Pure (DB-free) core of `updateEpisodeDraftDialogue`
 * (`verticalDramaSeries.ts`): REPLACES shot `shotNumber`'s `dialogue_lines`
 * with `lines` VERBATIM — this is a user-authored fix, so (unlike
 * `enforceEpisodeShotDraftSpeakability`'s post-generation cleaning above)
 * nothing is silently rewritten; `analyzeManualDialogueEditLines` only
 * REPORTS speakability violations for the client to act on (it already
 * offers live cleaning before submit).
 *
 * When `lines` is non-empty and the shot carries a `silence_intent`, that
 * `silence_intent` is stripped and `silenceIntentRemoved: true` is returned
 * — the SAME "dialogue wins" rule `enforceEpisodeShotDraftSpeakability`
 * already enforces for freshly generated shots (the `silence_intent_conflict`
 * rule), applied here for a manual edit instead of a generation pass.
 *
 * Recomputes the ITEM's `draftCompleteness` from the FULL (updated) 9-shot
 * list via the canonical `computeDraftCompleteness` — never a second
 * estimator. Stamps `manualDialogueEdit` with the accumulated, deduped,
 * ascending set of every shot number ever manually edited on this item
 * (`editedAt`/`editedByUserId` reflect only the MOST RECENT edit).
 *
 * Throws `ManualDialogueEditNoDraftError` when `item` has no `shotDrafts` at
 * all, or none matching `shotNumber`. Never mutates `item`.
 */
export function applyManualDialogueEdit(
  input: ApplyManualDialogueEditInput
): ApplyManualDialogueEditResult {
  const shotDrafts = readItemShotDrafts(input.item);
  const shotIndex =
    shotDrafts?.findIndex(shot => shot.shot_number === input.shotNumber) ?? -1;
  if (!shotDrafts || shotIndex === -1) {
    throw new ManualDialogueEditNoDraftError();
  }

  const speakabilityWarnings = analyzeManualDialogueEditLines(input.lines);

  const currentShot = shotDrafts[shotIndex];
  const silenceIntentRemoved =
    input.lines.length > 0 && Boolean(currentShot.silence_intent);
  const nextLines: VdDeepDraftShotDialogueLine[] = input.lines.map(line => ({
    speaker:
      line.speaker && line.speaker.length > 0
        ? line.speaker
        : VD_MANUAL_DIALOGUE_EDIT_UNSPECIFIED_SPEAKER,
    line: line.line,
    delivery: line.delivery,
  }));

  let updatedShot: VdDeepDraftShotDraft;
  if (silenceIntentRemoved) {
    const {
      silence_intent: _droppedSilenceIntent,
      ...shotWithoutSilenceIntent
    } = currentShot;
    void _droppedSilenceIntent;
    updatedShot = { ...shotWithoutSilenceIntent, dialogue_lines: nextLines };
  } else {
    updatedShot = { ...currentShot, dialogue_lines: nextLines };
  }

  const updatedShotDrafts = [...shotDrafts];
  updatedShotDrafts[shotIndex] = updatedShot;

  const draftCompleteness = computeDraftCompleteness(updatedShotDrafts);

  const priorStamp = readItemManualDialogueEdit(input.item);
  const shotNumbers = Array.from(
    new Set([...(priorStamp?.shotNumbers ?? []), input.shotNumber])
  ).sort((a, b) => a - b);
  const appliedIdempotencyKeys = input.idempotencyKey
    ? Array.from(
        new Set([
          ...(priorStamp?.appliedIdempotencyKeys ?? []),
          input.idempotencyKey,
        ])
      )
    : priorStamp?.appliedIdempotencyKeys;

  const manualDialogueEdit: VdManualDialogueEditStamp = {
    editedAt: input.editedAt ?? new Date().toISOString(),
    editedByUserId: input.editedByUserId,
    shotNumbers,
    ...(appliedIdempotencyKeys ? { appliedIdempotencyKeys } : {}),
  };

  const updatedItem = {
    ...input.item,
    shotDrafts: updatedShotDrafts,
    draftCompleteness,
    manualDialogueEdit,
  } as StoredEpisodeBreakdownItem;

  return {
    item: updatedItem,
    criteriaVersionMarker: renderCriteriaVersionMarker(),
    speakabilityWarnings,
    silenceIntentRemoved,
  };
}

/* ============================================================================ */
/* Dramaturgy critic (W11.5, added 2026-07-08)                                */
/*                                                                              */
/* "วิจารณ์ซีซั่นนี้" — season-craft quality on top of the premium loop's       */
/* per-episode/per-shot polish. Encodes the owner's golden 8/10 human          */
/* critique's structural findings:                                            */
/*   1. protagonist lacks personal stake     -> LLM-only (no code signal)     */
/*   2. fantasy rule-system never systematized -> deterministic (rule words   */
/*      mentioned in >= N episodes' dialogue while `world_rules` stays empty) */
/*   3. key character enters too late        -> deterministic                */
/*   4. victim/side character has no agency  -> deterministic                */
/*   5. villains repeat the same tactics     -> deterministic                */
/*   6. finale resolves without cost         -> deterministic                */
/*   7. on-the-nose dialogue                 -> deterministic (abstract-word */
/*      density proxy)                                                       */
/*   8. info-heavy episodes, little dramatized action -> LLM-only            */
/*                                                                            */
/* Findings 1 and 8 need semantic judgment no code signal can approximate —   */
/* they are ONLY ever produced by the LLM critic (`critiqueSeasonDrafts`).    */
/* The other 6 are pure, deterministic, code-only checks (`analyzeSeasonDramaturgy`) */
/* run BEFORE the critic call and injected into its prompt as established     */
/* facts, and AGAIN after `applySeasonCritique` applies a fix (its regression  */
/* guard: a revision that introduces a NEW deterministic finding is rejected). */
/*                                                                              */
/* This is a SEPARATE, on-demand pass — it does NOT run inside the premium    */
/* fan-out/judge/revise/sweep pipeline above, and never changes that          */
/* pipeline's own behavior.                                                    */
/* ============================================================================ */

/* -------------------------------------------------------------------------- */
/* Tolerant per-item readers for the W11.5 structural fields (mirrors every   */
/* other `readItem*`/`readBible*` reader in this file: never throw, never     */
/* mutate, `[]`/`undefined` when absent or malformed).                        */
/* -------------------------------------------------------------------------- */

const antagonistTacticsArraySchema = z.array(z.string().min(1));

/** Tolerant read of a stored breakdown item's `antagonist_tactics` (W11.5) — `[]` when absent/malformed. */
export function readItemAntagonistTactics(
  item: StoredEpisodeBreakdownItem
): string[] {
  const raw = (item as { antagonist_tactics?: unknown }).antagonist_tactics;
  if (raw === undefined) return [];
  const parsed = antagonistTacticsArraySchema.safeParse(raw);
  return parsed.success ? parsed.data : [];
}

const characterDecisionArraySchema = z.array(characterDecisionSchema);

/** Tolerant read of a stored breakdown item's `character_decisions` (W11.5) — `[]` when absent/malformed. */
export function readItemCharacterDecisions(
  item: StoredEpisodeBreakdownItem
): VdCharacterDecision[] {
  const raw = (item as { character_decisions?: unknown }).character_decisions;
  if (raw === undefined) return [];
  const parsed = characterDecisionArraySchema.safeParse(raw);
  return parsed.success ? parsed.data : [];
}

/** Tolerant read of a stored breakdown item's `protagonist_stake` (W11.5) — mirrors `readItemCliffhangerLine`. */
export function readItemProtagonistStake(
  item: StoredEpisodeBreakdownItem
): string | undefined {
  const raw = (item as { protagonist_stake?: unknown }).protagonist_stake;
  return typeof raw === "string" && raw.trim().length > 0 ? raw : undefined;
}

const worldRuleArraySchema = z.array(worldRuleSchema);

/** Tolerant read of a stored breakdown item's `world_rules` (W11.5) — `[]` when absent/malformed. */
export function readItemWorldRules(
  item: StoredEpisodeBreakdownItem
): VdWorldRule[] {
  const raw = (item as { world_rules?: unknown }).world_rules;
  if (raw === undefined) return [];
  const parsed = worldRuleArraySchema.safeParse(raw);
  return parsed.success ? parsed.data : [];
}

/** Tolerant read of a stored breakdown item's `price_paid` (W11.5) — mirrors `readItemCliffhangerLine`. */
export function readItemPricePaid(
  item: StoredEpisodeBreakdownItem
): string | undefined {
  const raw = (item as { price_paid?: unknown }).price_paid;
  return typeof raw === "string" && raw.trim().length > 0 ? raw : undefined;
}

const bibleRefinedCharacterSchema = z
  .object({
    name: z.string().min(1),
    role: z.string().optional(),
    description: z.string().optional(),
  })
  .passthrough();
const bibleRefinedCharacterArraySchema = z.array(bibleRefinedCharacterSchema);

/** One roster entry `analyzeSeasonDramaturgy`/`critiqueSeasonDrafts` evaluate for late-intro/zero-agency signals. */
export type VdDramaturgyRosterCharacter = { name: string };

/**
 * Tolerant read of `bible.refinedCharacters` (persisted by `generateStoryBible`
 * — see `verticalDramaSeries.ts`'s `generateStoryBible` mutation) — the
 * season's named-character roster, reused here (rather than a fresh DB
 * query against `vertical_drama_characters`, a separate asset-casting
 * concept) as the roster `analyzeSeasonDramaturgy`'s late-intro/agency
 * checks evaluate. Returns `[]` when absent/malformed, never throws.
 */
export function readBibleRefinedCharacters(
  bible: Record<string, unknown> | null | undefined
): VdDramaturgyRosterCharacter[] {
  const raw = (bible as { refinedCharacters?: unknown } | null | undefined)
    ?.refinedCharacters;
  if (raw === undefined) return [];
  const parsed = bibleRefinedCharacterArraySchema.safeParse(raw);
  return parsed.success ? parsed.data.map(c => ({ name: c.name })) : [];
}

/* -------------------------------------------------------------------------- */
/* Deterministic dramaturgy checks (pure, code-only, NO LLM call)             */
/* -------------------------------------------------------------------------- */

/** The season-critique finding kinds + "other" — shared by deterministic findings AND the LLM critic's own `findings[].kind`. */
export const VD_SEASON_CRITIQUE_FINDING_KINDS = [
  /** (1) LLM-only — no deterministic signal. */
  "protagonist_no_stake",
  /** (2) deterministic — see `analyzeSeasonDramaturgy`. */
  "world_rules_undefined",
  /** (3) deterministic. */
  "key_character_late_intro",
  /** (4) deterministic. */
  "character_agency_zero_decisions",
  /** (5) deterministic. */
  "antagonist_tactic_repetition",
  /** (6) deterministic. */
  "finale_no_price_paid",
  /** (7) deterministic (abstract-word-density proxy). */
  "on_the_nose_dialogue",
  /** (8) LLM-only — Thai dialogue sounds written/translated, not spoken. */
  "unnatural_dialogue_language",
  /** (9) LLM-only — no deterministic signal. */
  "info_heavy_low_action",
  /**
   * (10) deterministic — task #22, added 2026-07-09. Season-planned product
   * tie-in placements read poorly distributed: either two ADJACENT episodes
   * both planned (bunching, instead of the even spread
   * `planSeasonTieInPlacements` targets), or a PLANNED episode whose drafted
   * shots carry no shot marked `tie_in.has_product_moment: true` (the same
   * signal `reconcileTieInDraftMarking` surfaces per-run, re-checked here at
   * whole-season granularity so it also fires on a season assembled across
   * multiple runs/extends). See `analyzeSeasonDramaturgy`.
   */
  "tie_in_distribution",
  "evidence_orphaned",
  "evidence_no_resistance",
  "evidence_no_payoff",
  "threat_not_escalating",
  "antagonist_idle",
  "clue_overload",
  "missing_anchor_line",
  "voices_too_similar",
  "cast_visually_similar",
  "hook_not_answered_in_opening",
  "decision_without_consequence",
  "thread_stalled",
  "episode_replaceable",
  "knowledge_continuity_break",
  "emotional_residue_reset",
  "premise_drifted",
  "other",
] as const;

export type VdSeasonCritiqueFindingKind =
  (typeof VD_SEASON_CRITIQUE_FINDING_KINDS)[number];

export type VdDramaturgyFinding = {
  kind: VdSeasonCritiqueFindingKind;
  evidenceEpisodes: number[];
  detail: string;
};

/** A roster character's first-appearance episode must be at or before `ceil(totalEpisodes / VD_DRAMATURGY_LATE_INTRO_DIVISOR)`. */
export const VD_DRAMATURGY_LATE_INTRO_DIVISOR = 3;
/** The season must use at least this many DISTINCT antagonist tactics overall. */
export const VD_DRAMATURGY_MIN_TACTIC_VARIETY = 3;
/** The same antagonist tactic repeated across this many (or more) CONSECUTIVE episode numbers is flagged. */
export const VD_DRAMATURGY_TACTIC_REPEAT_STREAK = 3;
/** Abstract-word occurrences per total dialogue line, above which dialogue reads as "on-the-nose". */
export const VD_DRAMATURGY_ABSTRACT_WORD_DENSITY_THRESHOLD = 0.12;
/** Thai abstract nouns the golden critique called out as spoken too directly/too often (finding 7). */
export const VD_DRAMATURGY_ABSTRACT_WORDS = [
  "ความจริง",
  "กติกา",
  "สิทธิ์",
  "ความยุติธรรม",
] as const;
/** General-purpose Thai words indicating a fantasy/supernatural rule-system reference (finding 2's deterministic proxy). */
export const VD_DRAMATURGY_RULE_SYSTEM_WORDS = [
  "กฎ",
  "พลัง",
  "เวทมนตร์",
  "คำสาป",
  "ขีดจำกัด",
] as const;
/** `world_rules` is flagged as undefined only once rule words appear in AT LEAST this many distinct episodes. */
export const VD_DRAMATURGY_RULE_MENTION_MIN_EPISODES = 3;

/** Counts NON-OVERLAPPING occurrences of `needle` in `haystack` — used instead of a global regex (`.test()`/`.match()` with the `g` flag carry cross-call state that is easy to get wrong across a loop of different strings). */
function countOccurrences(haystack: string, needle: string): number {
  if (needle.length === 0) return 0;
  let count = 0;
  let index = haystack.indexOf(needle);
  while (index !== -1) {
    count += 1;
    index = haystack.indexOf(needle, index + needle.length);
  }
  return count;
}

/**
 * Deterministic, pure, code-only season-craft checks (owner-approved design,
 * W11.5) — encodes the deterministic subset of the owner's critique findings
 * (LLM-only kinds still live in the critic prompt/schema). Operates on the FULL
 * active breakdown (`items` — drafted AND not-yet-drafted episodes; `total`
 * for the late-intro threshold is `items.length`, the season's full planned
 * length), but every per-content check only ever reads episodes that
 * actually carry `shotDrafts` — an item with none is silently skipped, so a
 * series with no deep-drafted episodes yet returns `[]` (nothing to
 * critique). `roster` is optional; the late-intro and zero-agency checks are
 * skipped entirely for any character not in it (they need to know WHICH
 * characters to hold to "key character" standards — see
 * `readBibleRefinedCharacters`). Never throws, never mutates `items`.
 *
 * Format profiles (task #23, added 2026-07-08) — `profile` is OPTIONAL and
 * ONLY changes behavior for a `"ultra_short"`/`"short"`-tier profile (see
 * `@shared/verticalDramaSeries/formatProfiles`): it scales the
 * `key_character_late_intro`, `antagonist_tactic_repetition`, and
 * `character_agency_zero_decisions` thresholds tighter, matching how much
 * less runway a short season has. An absent `profile` OR a `"standard"`-tier
 * one makes every one of those 3 checks run its EXACT original formula/
 * constant, unconditionally — this is what guarantees today's behavior stays
 * byte-identical for every existing caller (none of which pass a 3rd
 * argument) and for every standard-tier/flag-off run.
 */
export function analyzeSeasonDramaturgy(
  items: StoredEpisodeBreakdownItem[],
  roster: VdDramaturgyRosterCharacter[] = [],
  profile?: VerticalDramaFormatProfile
): VdDramaturgyFinding[] {
  const findings: VdDramaturgyFinding[] = [];
  const totalEpisodes = items.length;
  const useProfileThresholds = Boolean(profile && profile.tier !== "standard");
  const draftedItems = [...items]
    .filter(item => readItemShotDrafts(item) !== null)
    .sort((a, b) => a.episodeNumber - b.episodeNumber);

  if (draftedItems.length === 0) return findings;

  const dialogueByEpisode = new Map<
    number,
    { speakers: Set<string>; lines: string[] }
  >();
  for (const item of draftedItems) {
    const shotDrafts = readItemShotDrafts(item) ?? [];
    const speakers = new Set<string>();
    const lines: string[] = [];
    for (const shot of shotDrafts) {
      for (const line of shot.dialogue_lines) {
        speakers.add(line.speaker);
        lines.push(line.line);
      }
    }
    dialogueByEpisode.set(item.episodeNumber, { speakers, lines });
  }

  /* ---- (3) key-character-late-intro + (4) character-agency-zero-decisions ---- */
  const lateIntroThreshold = Math.ceil(
    totalEpisodes / VD_DRAMATURGY_LATE_INTRO_DIVISOR
  );
  // Format profiles (task #23) — a non-"standard"-tier profile overrides the
  // formula above with its own FIXED, tier-appropriate episode number (see
  // `VerticalDramaFormatProfileDramaturgy.keyCharacterLateIntroMaxEpisode`'s
  // own doc comment for why a fixed bar reads correctly across a short tier
  // where the formula above would not).
  const effectiveLateIntroThreshold = useProfileThresholds
    ? profile!.dramaturgy.keyCharacterLateIntroMaxEpisode
    : lateIntroThreshold;
  // Format profiles (task #23) — only read when `useProfileThresholds`, so
  // this reduce runs an extra O(n) pass ONLY for a non-"standard"-tier
  // profile; the legacy branch below never touches it.
  const finaleEpisodeNumberForAgency = items.reduce(
    (max, item) => Math.max(max, item.episodeNumber),
    0
  );
  for (const character of roster) {
    let firstAppearance: number | null = null;
    let totalDecisions = 0;
    let decisionsBeforeFinale = 0;
    const speakingEpisodes: number[] = [];
    for (const item of draftedItems) {
      const dialogue = dialogueByEpisode.get(item.episodeNumber);
      const spoke = dialogue?.speakers.has(character.name) ?? false;
      const decisions = readItemCharacterDecisions(item).filter(
        d => d.character === character.name
      );
      totalDecisions += decisions.length;
      if (item.episodeNumber !== finaleEpisodeNumberForAgency) {
        decisionsBeforeFinale += decisions.length;
      }
      if ((spoke || decisions.length > 0) && firstAppearance === null) {
        firstAppearance = item.episodeNumber;
      }
      if (spoke) speakingEpisodes.push(item.episodeNumber);
    }

    if (
      firstAppearance !== null &&
      firstAppearance > effectiveLateIntroThreshold
    ) {
      findings.push({
        kind: "key_character_late_intro",
        evidenceEpisodes: [firstAppearance],
        detail: `${character.name} ปรากฏตัวมีน้ำหนักครั้งแรกในตอนที่ ${firstAppearance} จาก ${totalEpisodes} ตอน (ช้ากว่าเกณฑ์ตอนที่ ${effectiveLateIntroThreshold})`,
      });
    }

    // Format profiles (task #23) — a non-"standard"-tier profile requires
    // `agencyMinDecisionsBeforeFinale` decisions BEFORE the finale episode
    // (a short season can't let a character's only agency land in the very
    // last episode, with no runway left to show its consequence); the
    // original "zero, ever" bar (equivalent to a minimum of 1, counted
    // across the WHOLE season including the finale) is preserved exactly
    // for an absent/"standard"-tier profile.
    const agencyFires = useProfileThresholds
      ? speakingEpisodes.length > 0 &&
        decisionsBeforeFinale < profile!.dramaturgy.agencyMinDecisionsBeforeFinale
      : speakingEpisodes.length > 0 && totalDecisions === 0;
    if (agencyFires) {
      findings.push({
        kind: "character_agency_zero_decisions",
        evidenceEpisodes: speakingEpisodes,
        detail: `${character.name} ปรากฏตัว ${speakingEpisodes.length} ตอน แต่ไม่เคยมีการตัดสินใจของตัวเองเลยตลอดซีซั่น`,
      });
    }
  }

  /* ---- (5) antagonist-tactic variety + repetition ---- */
  const tacticsByEpisode = new Map<number, string[]>();
  for (const item of draftedItems) {
    const tactics = readItemAntagonistTactics(item);
    if (tactics.length > 0) tacticsByEpisode.set(item.episodeNumber, tactics);
  }
  if (tacticsByEpisode.size > 0) {
    const episodesWithTactics = [...tacticsByEpisode.keys()].sort(
      (a, b) => a - b
    );
    const distinctTactics = new Set<string>();
    for (const tactics of tacticsByEpisode.values()) {
      for (const t of tactics) distinctTactics.add(t);
    }
    if (distinctTactics.size < VD_DRAMATURGY_MIN_TACTIC_VARIETY) {
      findings.push({
        kind: "antagonist_tactic_repetition",
        evidenceEpisodes: episodesWithTactics,
        detail: `ตัวร้ายใช้กลวิธีซ้ำเดิมตลอดซีซั่น พบเพียง ${distinctTactics.size} แบบ (${[...distinctTactics].join(", ")}) ต่ำกว่าเกณฑ์ ${VD_DRAMATURGY_MIN_TACTIC_VARIETY} แบบขึ้นไป`,
      });
    }

    const minEp = episodesWithTactics[0];
    const maxEp = episodesWithTactics[episodesWithTactics.length - 1];
    const allTagsUsed = new Set<string>();
    for (const tactics of tacticsByEpisode.values())
      for (const t of tactics) allTagsUsed.add(t);

    // Format profiles (task #23) — a non-"standard"-tier profile tightens
    // the consecutive-repeat streak window (a short season has far fewer
    // episodes to work with, so the SAME tactic repeating even 2 episodes
    // running already reads as repetitive); the original constant is used
    // unconditionally for an absent/"standard"-tier profile.
    const repeatStreakThreshold = useProfileThresholds
      ? profile!.dramaturgy.antagonistTacticRepetitionWindow
      : VD_DRAMATURGY_TACTIC_REPEAT_STREAK;

    for (const tag of allTagsUsed) {
      let runStart: number | null = null;
      // `maxEp + 1` is a sentinel pass so a run that extends to the very
      // last tracked episode still gets flushed below.
      for (let ep = minEp; ep <= maxEp + 1; ep++) {
        const hasTag =
          ep <= maxEp && (tacticsByEpisode.get(ep)?.includes(tag) ?? false);
        if (hasTag) {
          if (runStart === null) runStart = ep;
          continue;
        }
        if (runStart !== null) {
          const runEnd = ep - 1;
          if (runEnd - runStart + 1 >= repeatStreakThreshold) {
            const evidence = Array.from(
              { length: runEnd - runStart + 1 },
              (_, i) => runStart! + i
            );
            findings.push({
              kind: "antagonist_tactic_repetition",
              evidenceEpisodes: evidence,
              detail: `ตัวร้ายใช้กลวิธี "${tag}" ซ้ำติดต่อกัน ${evidence.length} ตอน (ตอนที่ ${runStart}-${runEnd})`,
            });
          }
          runStart = null;
        }
      }
    }
  }

  /* ---- (7) on-the-nose dialogue (abstract-word density proxy) ---- */
  {
    let totalLines = 0;
    let abstractMatches = 0;
    const episodesWithAbstractWords = new Set<number>();
    for (const item of draftedItems) {
      const dialogue = dialogueByEpisode.get(item.episodeNumber);
      if (!dialogue) continue;
      for (const line of dialogue.lines) {
        totalLines += 1;
        let lineMatched = false;
        for (const word of VD_DRAMATURGY_ABSTRACT_WORDS) {
          const occurrences = countOccurrences(line, word);
          if (occurrences > 0) {
            abstractMatches += occurrences;
            lineMatched = true;
          }
        }
        if (lineMatched) episodesWithAbstractWords.add(item.episodeNumber);
      }
    }
    if (totalLines > 0) {
      const density = abstractMatches / totalLines;
      if (density > VD_DRAMATURGY_ABSTRACT_WORD_DENSITY_THRESHOLD) {
        findings.push({
          kind: "on_the_nose_dialogue",
          evidenceEpisodes: [...episodesWithAbstractWords].sort(
            (a, b) => a - b
          ),
          detail: `บทพูดใช้คำนามธรรม (${VD_DRAMATURGY_ABSTRACT_WORDS.join("/")}) ถี่เกินไป: พบ ${abstractMatches} ครั้งจาก ${totalLines} บรรทัด (${(density * 100).toFixed(1)}%)`,
        });
      }
    }
  }

  /* ---- (6) finale price_paid missing ---- */
  {
    const finaleEpisodeNumber = items.reduce(
      (max, item) => Math.max(max, item.episodeNumber),
      0
    );
    const finaleItem = draftedItems.find(
      item => item.episodeNumber === finaleEpisodeNumber
    );
    if (finaleItem && !readItemPricePaid(finaleItem)) {
      findings.push({
        kind: "finale_no_price_paid",
        evidenceEpisodes: [finaleEpisodeNumber],
        detail: `ตอนจบ (ตอนที่ ${finaleEpisodeNumber}) ไม่มีการระบุ "ราคาที่ต้องจ่าย" ของการคลี่คลายเรื่อง`,
      });
    }
  }

  /* ---- (2) world-rules undefined while rule words are mentioned often ---- */
  {
    const hasWorldRules = draftedItems.some(
      item => readItemWorldRules(item).length > 0
    );
    if (!hasWorldRules) {
      const episodesWithRuleWords = new Set<number>();
      for (const item of draftedItems) {
        const dialogue = dialogueByEpisode.get(item.episodeNumber);
        if (!dialogue) continue;
        const mentionsRuleWords = dialogue.lines.some(line =>
          VD_DRAMATURGY_RULE_SYSTEM_WORDS.some(word => line.includes(word))
        );
        if (mentionsRuleWords) episodesWithRuleWords.add(item.episodeNumber);
      }
      if (
        episodesWithRuleWords.size >= VD_DRAMATURGY_RULE_MENTION_MIN_EPISODES
      ) {
        findings.push({
          kind: "world_rules_undefined",
          evidenceEpisodes: [...episodesWithRuleWords].sort((a, b) => a - b),
          detail: `บทพูดพูดถึงกติกา/พลังของโลกเรื่องนี้ใน ${episodesWithRuleWords.size} ตอน แต่ยังไม่เคยกำหนด world_rules ให้ชัดเจน`,
        });
      }
    }
  }

  /* ---- (9) tie-in placement distribution (task #22, added 2026-07-09) ---- */
  {
    // Bunching: two ADJACENT planned episodes (consecutive episodeNumber) —
    // `planSeasonTieInPlacements` targets an EVEN spread, so this signals
    // either a manually-adjusted plan or a `deferEpisodeTieIn` move that
    // landed next to an existing placement. Runs over the FULL `items` (not
    // just `draftedItems`) — this is a PLANNING signal, independent of
    // whether either episode has been drafted yet.
    const plannedEpisodeNumbers = items
      .filter(item => item.tieIn?.planned === true)
      .map(item => item.episodeNumber)
      .sort((a, b) => a - b);
    const adjacentPlannedPairs = new Set<number>();
    for (let i = 1; i < plannedEpisodeNumbers.length; i++) {
      if (plannedEpisodeNumbers[i] - plannedEpisodeNumbers[i - 1] === 1) {
        adjacentPlannedPairs.add(plannedEpisodeNumbers[i - 1]);
        adjacentPlannedPairs.add(plannedEpisodeNumbers[i]);
      }
    }
    if (adjacentPlannedPairs.size > 0) {
      const evidence = [...adjacentPlannedPairs].sort((a, b) => a - b);
      findings.push({
        kind: "tie_in_distribution",
        evidenceEpisodes: evidence,
        detail: `ตอนที่วางแผนใส่สินค้าอยู่ติดกันเกินไป (ตอนที่ ${evidence.join(", ")}) ควรกระจายให้ห่างกันมากกว่านี้ตามแผนการกระจายสินค้าของซีซั่น`,
      });
    }

    // Planned-but-unmarked: a PLANNED episode that IS drafted (has
    // shotDrafts) but no shot was marked `tie_in.has_product_moment: true` —
    // the same signal `reconcileTieInDraftMarking` reports per-run, re-
    // checked here at whole-season granularity (also catches a mismatch
    // introduced across multiple runs/extends, or by a manual dialogue edit).
    const plannedUnmarkedEpisodes: number[] = [];
    for (const item of draftedItems) {
      if (item.tieIn?.planned !== true) continue;
      const shotDrafts = readItemShotDrafts(item) ?? [];
      const hasMarkedShot = shotDrafts.some(
        shot => shot.tie_in?.has_product_moment === true
      );
      if (!hasMarkedShot) plannedUnmarkedEpisodes.push(item.episodeNumber);
    }
    if (plannedUnmarkedEpisodes.length > 0) {
      const evidence = plannedUnmarkedEpisodes.sort((a, b) => a - b);
      findings.push({
        kind: "tie_in_distribution",
        evidenceEpisodes: evidence,
        detail: `ตอนที่ ${evidence.join(", ")} มีแผนใส่สินค้าตามแผนซีซั่น แต่ร่างช็อตยังไม่ได้ระบุช็อตที่มีสินค้าอย่างชัดเจน`,
      });
    }
  }

  return findings;
}

/* -------------------------------------------------------------------------- */
/* LLM critic call (ONE call — judges dramaturgy/story craft ONLY)            */
/* -------------------------------------------------------------------------- */

const seasonCritiqueFindingSchema = z
  .object({
    kind: z.enum(VD_SEASON_CRITIQUE_FINDING_KINDS),
    evidenceEpisodes: z.array(z.number().int().positive()).default([]),
    problem: z.string().min(1),
    fixInstruction: z.string().min(1),
    severity: z
      .enum(["minor", "moderate", "major", "structural"])
      .default("moderate"),
  })
  .passthrough();

const seasonCritiqueResponseSchema = z
  .object({
    overallScore: z.number().min(1).max(10),
    strengths: z.array(z.string().min(1)).default([]),
    findings: z.array(seasonCritiqueFindingSchema).default([]),
  })
  .passthrough();

export type VdSeasonCritiqueFinding = z.infer<
  typeof seasonCritiqueFindingSchema
>;
export type VdSeasonCritiqueResult = z.infer<
  typeof seasonCritiqueResponseSchema
>;

/** Persisted shape of `lastCritique` on the active breakdown version's own metadata (version-level, `.passthrough()`-tolerant — see `readActiveSeasonCritique`/`stampSeasonCritiqueOnActiveVersion`). */
const storedSeasonCritiqueSchema = z
  .object({
    critiquedAt: z.string().min(1),
    overallScore: z.number().min(1).max(10),
    strengths: z.array(z.string()).default([]),
    findings: z.array(seasonCritiqueFindingSchema).default([]),
    deterministicFindingsCount: z.number().int().nonnegative(),
  })
  .passthrough();

export type StoredSeasonCritique = z.infer<typeof storedSeasonCritiqueSchema>;

/**
 * Tolerant read of the ACTIVE breakdown version's `lastCritique` (W11.5) —
 * mirrors `readActiveDeepDraftMetadata`'s exact "active, falling back to the
 * most recently appended version" resolution, intentionally NOT refactored
 * to share code with it (same "keep this addition a pure, risk-free
 * superset" reasoning that function's own doc comment gives). `null` when no
 * versions exist yet, or the active version has never been critiqued.
 */
export function readActiveSeasonCritique(
  bible: Record<string, unknown> | null | undefined
): StoredSeasonCritique | null {
  const versions = readBreakdownVersions(bible);
  if (versions.length === 0) return null;
  const activeId = (
    bible as { activeBreakdownVersionId?: unknown } | null | undefined
  )?.activeBreakdownVersionId;
  const active =
    (typeof activeId === "string" &&
      versions.find(v => v.versionId === activeId)) ||
    versions[versions.length - 1];
  const raw = (active as unknown as { lastCritique?: unknown }).lastCritique;
  const parsed = storedSeasonCritiqueSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

/**
 * Pure (DB-free) writer that stamps `critique` onto the CURRENTLY ACTIVE
 * breakdown version's `lastCritique` metadata key IN PLACE — a critique run
 * never changes any episode's content, so (unlike
 * `generateStoryBibleDeep`/`extendStoryDraftHorizon`, which always
 * `appendBreakdownVersion`) there is nothing to append a new version FOR.
 * This is the SAME "edit a version/item in place" exception
 * `applyManualDialogueEdit`'s persistence already documents, applied at
 * version-metadata granularity instead of item granularity. Never mutates
 * `bible`; a no-op copy when no version exists yet (nothing to stamp onto).
 */
export function stampSeasonCritiqueOnActiveVersion(
  bible: Record<string, unknown> | null | undefined,
  critique: StoredSeasonCritique
): Record<string, unknown> {
  const versions = readBreakdownVersions(bible);
  const activeIndex = resolveActiveBreakdownVersionIndex(bible);
  if (activeIndex < 0) return { ...(bible ?? {}) };
  const updatedVersions = versions.map((version, index) =>
    index === activeIndex ? { ...version, lastCritique: critique } : version
  );
  return { ...(bible ?? {}), breakdownVersions: updatedVersions };
}

/** Tolerant read of a stored breakdown item's `lastAppliedCritiqueRound` (plan §B.5 checkpoint) — `undefined` when absent/malformed. */
export function readItemLastAppliedCritiqueRound(
  item: StoredEpisodeBreakdownItem
): string | undefined {
  const raw = (item as { lastAppliedCritiqueRound?: unknown })
    .lastAppliedCritiqueRound;
  return typeof raw === "string" && raw.trim().length > 0 ? raw : undefined;
}

