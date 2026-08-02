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
import fs from "fs";
import path from "path";
import { z } from "zod";
import { jsonrepair } from "jsonrepair";
import { parseSkillFile } from "@smartspec/skills";
import {
  resolveSkillDirCandidates,
  resolveSkillManifestPath,
} from "./skillFiles";
import { executeWithFallback } from "./llmRouter";
import {
  loadEnabledLlmModelRows,
  type EnabledLlmModelRow,
} from "./enabledLlmModels";
import { resolveVerticalDramaSeriesModel } from "./verticalDramaLlmModelPolicy";
// NOTE: `resolveQualityLargeContextModelId` is imported LAZILY (dynamic
// `await import("./verticalDramaImproveScript")`) inside `generateStoryBible`
// below, NOT as a top-level static import — unlike the already-established
// `verticalDramaPresetSynthesis.ts` cycle (safe as a static import there),
// `verticalDramaImproveScript.ts` also imports FROM this file
// (`resolveStoryBibleModel`, `getActiveBreakdown`, etc.), and a top-level
// static import here was confirmed (via a real vitest run) to break test
// files that partially-mock this module via `vi.importActual` + `vi.mock`
// spread — the mock factory's `importActual` call fully evaluates this file,
// which would eagerly evaluate `verticalDramaImproveScript.ts` too, and the
// resulting module-registry ordering caused OTHER test files (that mock this
// module's `resolveStoryBibleModel` export) to silently receive the REAL
// implementation instead of the mock. A dynamic import deferred to
// call-time avoids that eager evaluation entirely, following this
// codebase's already-established lazy-import convention (see e.g.
// `verticalDramaEpisodePipeline.ts`'s `await import("./verticalDramaStoryBible")`).
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
/**
 * Genre pollution guard (Stage 1.5, `planning/vd-series-memory-and-lineage/
 * plan.md`) — see `buildGenrePromptLine` below (this file's ONE routing
 * point for every `Genre:` prompt-emit site) and the guard module's own
 * header doc comment for the real-data investigation behind this.
 */
import { isGenrePolluted } from "@shared/verticalDramaSeries/genrePollutionGuard";
import {
  lenientNarrativeRoleSchema,
  lenientRoleTierSchema,
  normalizeLegacyRole,
  NARRATIVE_ROLE_VALUES,
  ROLE_TIER_VALUES,
} from "@shared/verticalDramaSeries/narrativeRole";
/**
 * Re-exported unchanged from `verticalDramaBibleRefinedCharacters.ts`
 * (extracted out 2026-07-17,
 * `planning/vd-character-visual-bible-occupation-fix/plan.md` — see that
 * file's own header doc comment for why: `verticalDramaCharacters.ts` needs
 * a SAFE static import of `readBibleRefinedCharacterProfiles`, and this
 * file's own module graph is too heavy for that router's minimal-mock test
 * suites). Every existing caller keeps importing from THIS file unchanged.
 */
export type { VdBibleRefinedCharacter } from "./verticalDramaBibleRefinedCharacters";
import {
  readBibleRefinedCharacterProfiles,
  type VdBibleRefinedCharacter,
} from "./verticalDramaBibleRefinedCharacters";
export { readBibleRefinedCharacterProfiles };
/**
 * Series-level audience age rating (Phase 1 of a 2-phase feature — later
 * phases thread it into per-episode stages). Imported directly from its own
 * submodule (not the shared barrel), same convention as `speechProfile.ts`
 * (this module's own header doc comment mirrors that file). `buildPrompts`/
 * `buildDeepDraftPrompts` always resolve+render the block unconditionally —
 * see each function's own doc comment below.
 */
import {
  resolveAudienceAgeRating,
  renderAudienceAgeRatingBlock,
  type AudienceAgeRating,
} from "@shared/verticalDramaSeries/audienceAgeRating";
/**
 * Series memory (`planning/vd-series-memory-and-lineage/plan.md` Stage
 * 1.2/1.3) — `resolveEpisodeMemoryBlock` turns each drafted episode's
 * OPTIONAL raw `episode_memory` LLM value into a trustworthy
 * `VdEpisodeMemory`, tolerantly (never throws — see that function's own doc
 * comment). Called from `extractDramaturgyStructureFields` below, the ONE
 * shared choke point every deep-draft construction site (standard chunk
 * loop, premium gate/revise/sweep) already routes through, so this feature
 * needs no other touch point in this file's premium pipeline.
 */
import {
  resolveEpisodeMemoryBlock,
  type VdEpisodeMemoryFallbackContext,
} from "./verticalDramaSeriesMemoryProjection";
import type {
  VdEpisodeMemory,
  VdRelationshipState,
  VdOpenThread,
} from "@shared/verticalDramaSeries/seriesMemoryState";
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
// no-LLM premise-coverage guard, still used by `appendDeepDraftPremiseCoverageWarning`
// (the deep-draft-stage premise check, below) — but NO LONGER by
// `generateStoryBible`, whose own call site now uses the generation call's
// own `premise_coverage` self-assessment instead
// (`vertical-drama-skill-first-architecture` plan, Phase 4 item 2). NOTE:
// `verticalDramaPresetSynthesis.ts` also imports FROM this file
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
 * Production-grade full-story generation (spec
 * `planning/vertical-drama-full-story-production-grade`, added 2026-07-13) —
 * one character visible in a shot, with an explicit emotional state. `name`
 * is expected to match the character bible verbatim (checked by the
 * deterministic completeness gate, NOT this schema — see
 * `computeShotCompletenessViolations`); this schema only validates shape.
 */
const shotDraftCharacterSchema = z
  .object({
    name: z.string().min(1),
    emotion: z.string().min(1),
    emotion_after: z.string().min(1).optional(),
  })
  .passthrough();

export type VdDeepDraftShotCharacter = z.infer<typeof shotDraftCharacterSchema>;

/**
 * One of the 9 numbered shots in a deep-drafted episode. `silence_intent`
 * reuses the canonical enum from `contentBudget.ts` (spec §7.7.2 Layer 3) —
 * never re-declared here — for shots that are intentionally visual-only
 * (e.g. a bare animal/ambient sound must be a silence-intent shot, never a
 * dialogue line — see `enforceEpisodeShotDraftSpeakability` below).
 *
 * `characters`/`location_key` (production-grade full-story generation, added
 * 2026-07-13) are OPTIONAL here — this base schema is ALSO the tolerant
 * READ-path schema for stored shot drafts (`readItemShotDrafts` below), so a
 * pre-existing series bible (drafted before this feature) must keep parsing
 * unchanged. They are made REQUIRED only for a FRESH deep-draft chunk
 * generation via `deepDraftRequiredShotSchema` further below — never here.
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
    /** Production-grade full-story generation — see this schema's own doc comment above. */
    characters: z.array(shotDraftCharacterSchema).optional(),
    /** Production-grade full-story generation — see this schema's own doc comment above. */
    location_key: z.string().min(1).max(64).optional(),
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
   * `"shot_completeness_violation"` (production-grade full-story generation,
   * added 2026-07-13) — a deterministic completeness-gate violation
   * (missing/unknown character, invalid `location_key`, or a duplicate/
   * colliding `new_locations` declaration) that survived the ONE corrective
   * retry the standard-mode chunk loop issues — see
   * `computeShotCompletenessViolations`/`computeNewLocationDeclarationViolations`.
   * Chunk-level violations (e.g. a bad `new_locations` entry) use
   * `episodeNumber: 0, shotNumber: 0`.
   */
  reason:
    | "nonverbal_line"
    | "empty_after_cleaning"
    | "silence_intent_conflict"
    | "episode_missing_after_retry"
    | "tie_in_placement_mismatch"
    | "premise_coverage_low"
    | "shot_completeness_violation";
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

/**
 * The judged dimensions, in prompt/response order (owner-approved design
 * point 2c; Feature 132 scorecard v3 adds dimensions 9-12; production-grade
 * full-story generation, plan
 * `planning/vertical-drama-full-story-production-grade`, added 2026-07-13,
 * adds the final two — `shot_completeness`/`dialogue_accessibility`,
 * matching the `vertical-drama-season-dramaturgy-critic` skill's Mode 2
 * dimensions 13-14 exactly, per that skill.md's own
 * "Keep this dimension list in sync" note).
 */
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
  "shot_completeness",
  "dialogue_accessibility",
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
  /** Production-grade full-story generation, added 2026-07-13 — see `VD_PREMIUM_DRAFT_SCORE_DIMENSIONS`'s own doc comment. */
  shot_completeness: z.number().min(1).max(5),
  /** Production-grade full-story generation, added 2026-07-13 — see `VD_PREMIUM_DRAFT_SCORE_DIMENSIONS`'s own doc comment. */
  dialogue_accessibility: z.number().min(1).max(5),
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

/**
 * Stage 2.4b (`planning/vd-series-memory-and-lineage/plan.md`, added
 * 2026-07-17) — a SECOND optional conditional dimension, mirroring
 * `premiumTieInNaturalnessShape` above field-for-field (same "kept OUT of the
 * 8 core dimensions, threaded as its own optional field everywhere a
 * scorecard/score shape is built, present -> also floor-check/report,
 * absent -> ignore entirely" contract, which keeps every existing call site
 * byte-identical). Scored ONLY for an episode drafted as part of a SEQUEL
 * season (`GenerateStoryBibleDeepParams.seasonLineage` present this run) —
 * judges whether the episode stays continuous with the parent season's
 * carried relationships/disclosure/open threads/character knowledge, as
 * opposed to contradicting or silently resetting them. The actual judging
 * CRITERIA (what counts as legitimate change vs. drift) live ONLY in
 * `vertical-drama-season-dramaturgy-critic` skill.md's own
 * "prior_season_continuity" section — never hardcoded here (project policy:
 * TS computes facts, skill owns judgment).
 */
const premiumPriorSeasonContinuityShape = {
  prior_season_continuity: z.number().min(1).max(5).optional(),
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
    character_consistency:
      premiumScoreDimensionsShape.character_consistency.optional(),
    evidence_payoff: premiumScoreDimensionsShape.evidence_payoff.optional(),
    threat_escalation: premiumScoreDimensionsShape.threat_escalation.optional(),
    // Production-grade full-story generation, added 2026-07-13 — same
    // "required for fresh payloads, optional for reading persisted
    // (pre-existing) scorecards" convention as the 4 Feature 132 v3
    // dimensions immediately above.
    shot_completeness: premiumScoreDimensionsShape.shot_completeness.optional(),
    dialogue_accessibility:
      premiumScoreDimensionsShape.dialogue_accessibility.optional(),
    ...premiumTieInNaturalnessShape,
    // Stage 2.4b — see `premiumPriorSeasonContinuityShape`'s own doc comment.
    ...premiumPriorSeasonContinuityShape,
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
  /**
   * Series memory (Stage 1.2/1.3, added 2026-07-17) — an OPTIONAL per-episode
   * memory block (`recap`/`canonicalFacts`/relationship state/open threads/
   * knowledge changes). Deliberately typed `z.unknown()` here, NOT a strict
   * shape: this schema must stay byte-compatible with every legacy/partial
   * response (same "optional/superset" convention as every sibling field
   * above), and — per the documented weak-model JSON failure class — a
   * malformed nested block must NEVER fail this whole episode item's parse.
   * `resolveEpisodeMemoryBlock` (`verticalDramaSeriesMemoryProjection.ts`)
   * owns the ACTUAL strict validation + deterministic fallback, applied once
   * per episode inside `extractDramaturgyStructureFields` below.
   */
  episode_memory: z.unknown().optional(),
});

/**
 * `vertical-drama-skill-first-architecture` plan, Phase 4 item 2 — the
 * generation call's OWN self-reported premise-coverage assessment, replacing
 * the deterministic token-overlap heuristic
 * (`verticalDramaPresetSynthesis.ts`'s `evaluatePremiseCoverage`) for THIS
 * call site (`generateStoryBible`). Optional: only ever requested (see
 * `buildPrompts`) when `params.userPremise` is a non-empty trimmed string;
 * absent for every response that predates this field or that didn't carry a
 * user premise, so this schema stays byte-compatible with every existing
 * caller. The LLM authors `note` itself — code never invents warning text.
 */
const premiseCoverageSchema = z
  .object({
    sufficient: z.boolean(),
    note: z.string().min(1),
  })
  .passthrough();

const expandedStoryBibleSchema = z.object({
  expandedSeasonArc: z.string().min(1),
  refinedCharacters: z
    .array(
      z.object({
        name: z.string().min(1),
        role: z.string().min(1),
        description: z.string().min(1),
        // Lenient LLM-response schemas (2026-07-14 recurring-failure fix —
        // same root cause as preset synthesis: the prompt never listed the
        // allowed enum values, so the model title-cased/invented labels like
        // "Protagonist"/"Tier-1"/"Love Interest"). A pure-casing miss still
        // parses; anything else degrades to `undefined` and is backfilled by
        // `normalizeExpandedCharacterRoles` below via `normalizeLegacyRole`.
        narrativeRole: lenientNarrativeRoleSchema,
        roleTier: lenientRoleTierSchema,
        occupation: z.string().min(1).optional(),
        /**
         * `planning/vd-character-identity-repair/plan.md` Phase 2.1 (added
         * 2026-07-17) — root-cause-chain item 1: Thai drama dialogue
         * naturally calls a character by a given name alone, a nickname, or
         * a romanization ("คิริน" for "คิริน วัฒนเมธา") — legitimate short-form
         * usage, not a typo. Before this field, the pipeline had no concept
         * of a canonical name + its aliases, so it read every natural short
         * form as a stranger. Requested (see `buildPrompts`'s system prompt
         * below) but OPTIONAL here so a response that omits it (every
         * pre-2026-07-17 response, or a lenient/legacy replay) still parses;
         * `readBibleRefinedCharacterProfiles` treats a missing/empty array
         * as "no declared aliases", never throws.
         */
        aliases: z.array(z.string().min(1)).optional(),
      })
    )
    .min(1),
  episodeBreakdown: z.array(episodeBreakdownItemSchema).min(1),
  premise_coverage: premiseCoverageSchema.optional(),
});

export type ExpandedVerticalDramaStoryBible = z.infer<
  typeof expandedStoryBibleSchema
>;

// `planning/vd-character-identity-repair/plan.md` Phase 2.1 — `aliases`
// (when the LLM supplied it) passes through untouched via the `...character`
// spread below; this function only ever backfills narrativeRole/roleTier/
// occupation, never touches aliases.
function normalizeExpandedCharacterRoles(
  characters: ExpandedVerticalDramaStoryBible["refinedCharacters"],
): ExpandedVerticalDramaStoryBible["refinedCharacters"] {
  return characters.map(character => {
    if (character.narrativeRole && character.roleTier) return character;
    const legacy = normalizeLegacyRole(character.role);
    return {
      ...character,
      narrativeRole: character.narrativeRole ?? legacy.narrativeRole ?? undefined,
      roleTier: character.roleTier ?? legacy.roleTier ?? undefined,
      occupation: character.occupation ?? character.role,
    };
  });
}

/** Mirrors the pipeline's own `VD_SCHEMA_VALIDATION_FAILED` convention for LLM-output parse failures. */
export class VdSchemaValidationError extends Error {
  code = "VD_SCHEMA_VALIDATION_FAILED" as const;
  issueSummary: string | null;
  constructor(
    message: string,
    public issues: unknown,
    /**
     * OPTIONAL, both new params below (2026-07-18, character-portrait
     * lead-beauty graceful-degradation fix — root cause + user decision
     * recorded on `executeJsonPlanningCallWithRetry`'s `onSchemaRetriesExhausted`
     * doc comment). The JSON that was successfully PARSED but failed zod
     * validation — kept ONLY so that hook can re-inspect/re-validate it with
     * a lenient variant schema after every corrective retry is exhausted.
     * Every one of this class's 5 OTHER pre-existing throw sites
     * (`verticalDramaVideoMotionPromptGeneration.ts`, `verticalDramaAdBanner.ts`,
     * `verticalDramaEpisodeContinuation.ts`, and this file's own 2 sites)
     * simply omits this argument, so it stays `undefined` there — zero
     * behavior change for any of them.
     */
    public parsedJson?: unknown,
    /** Same rationale as `parsedJson` — the raw LLM response for THIS attempt, so the hook's accepted result can still return a real `response` object to its caller instead of `undefined`. */
    public rawResponse?: unknown
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
    .map(issue => {
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
 *  4. Only if THAT also fails to parse (i.e. every happy-path attempt above
 *     has already thrown), make one last-resort attempt to repair the slice
 *     with `jsonrepair` (see the catch block below for why).
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

  // Tracked outside the `if` block below so the catch-path repair (added for
  // ticket #61, see below) can prefer this slice over the cruder legacy one.
  let balancedSlice: string | null = null;
  if (start >= 0) {
    const end = findBalancedJsonEnd(candidate, start);
    if (end > start) {
      balancedSlice = candidate.slice(start, end + 1);
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
    // Last-resort repair (ticket #61 — trace `zKiR56XQGSE1KpCJewzGI`):
    // weaker models (e.g. `google/gemini-3.1-flash-lite`, picked by the
    // cheapest-thinking-model cost policy — see
    // `resolveVerticalDramaSeriesModel`) occasionally emit STRUCTURALLY
    // malformed JSON (e.g. a missing comma between array elements) well
    // under the output-token ceiling, so it is NOT a truncation issue, and
    // it survives all `VD_SCHEMA_MAX_RETRIES` retries unchanged because the
    // model keeps making the same class of mistake. This block runs ONLY
    // after the normal `JSON.parse` above has already thrown — it can only
    // turn a current failure into a possible success, and it NEVER touches
    // the happy path above.
    //
    // IMPORTANT: only attempt repair when `balancedSlice` is non-null, i.e.
    // the string-aware brace/bracket scan already found a FULLY-CLOSED JSON
    // envelope somewhere in the text (so the failure is a structural glitch
    // *inside* an otherwise-complete value, like a missing comma). If no
    // balanced envelope was found at all, the response is genuinely
    // truncated (cut off mid-value by the output-token ceiling) — and
    // `jsonrepair` happily "fixes" truncation too, by fabricating whatever
    // closing brackets are needed. Silently accepting a machine-completed
    // guess for a truncated response would defeat
    // `executeJsonPlanningCallWithRetry`'s higher-token-ceiling schema retry
    // and could ship fabricated/incomplete data, so truncated responses must
    // keep throwing exactly as before.
    //
    // 2026-07-22 follow-up (`google/gemini-3.5-flash`, "Episode script"
    // stage — journalctl smartspec-web 08:57-08:58 UTC, 3/3 attempts failed
    // with `Expected ',' or '}' after property value` / `Expected ',' or ']'
    // after array element` at positions 7401/9082/9659, i.e. far under the
    // 12000/24000-token ceilings, so NOT truncation): when the model leaves
    // an UNESCAPED `"` inside a string value — extremely common for Thai
    // dialogue that quotes a character — the string-aware scan above
    // desyncs on that stray quote. With an odd number of stray quotes the
    // scan never returns to depth 0, so `findBalancedJsonEnd` returns -1,
    // `balancedSlice` stays null, and the repair below was SKIPPED
    // entirely even though `jsonrepair` fixes exactly this input. That is
    // why the failure survived all `VD_SCHEMA_MAX_RETRIES` retries.
    //
    // So: prefer the balanced slice when the scan found one, and otherwise
    // fall back to the legacy slice — but ONLY when the response is
    // COMPLETE, i.e. the trimmed candidate's last non-whitespace character
    // closes a JSON value (`}` / `]`). A genuinely truncated response is cut
    // off mid-token and never ends that way, so it keeps throwing exactly as
    // before and still reaches `executeJsonPlanningCallWithRetry`'s
    // higher-token-ceiling retry instead of shipping machine-fabricated
    // closing brackets.
    const trimmedCandidate = candidate.trimEnd();
    const looksComplete =
      trimmedCandidate.endsWith("}") || trimmedCandidate.endsWith("]");
    const repairTarget =
      balancedSlice ?? (looksComplete && legacyEnd > legacyStart ? jsonSlice : null);
    if (repairTarget) {
      try {
        const repaired = jsonrepair(repairTarget);
        return JSON.parse(repaired);
      } catch {
        // Repair failed too (or produced something still unparsable) — fall
        // through to the throw below.
      }
    }
    // Throw the SAME error shape/message as before this change, using the
    // ORIGINAL (pre-repair) parse error so audit logs stay consistent.
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

/**
 * Genre pollution guard (Stage 1.5, `planning/vd-series-memory-and-lineage/
 * plan.md`) — the ONE place in this file that decides whether a `Genre:`
 * line reaches an LLM prompt. EVERY genre-emit call site in this file
 * (`buildPrompts`, `buildDeepDraftPrompts`, `buildPremiumJudgePrompts`,
 * `buildPremiumRejudgePrompts`, `buildPremiumRevisePrompts`,
 * `buildPremiumSweepPrompts`) calls this instead of inlining
 * `params.genre ? \`Genre: ${params.genre}\` : null` directly, so the guard
 * can never silently be skipped at a new call site.
 *
 * `vertical_drama_series.genre` has been observed holding a logline or a
 * copy of `title` for real series (see
 * `@shared/verticalDramaSeries/genrePollutionGuard`'s header doc comment for
 * the investigation) — emitting THAT as `Genre: ...` injects a second,
 * conflicting title into every prompt, which is worse than omitting the
 * line entirely. For every series whose `genre` is clean (the overwhelming
 * majority, and the ONLY case `createSeriesInput`'s guard allows going
 * forward — see that schema's `superRefine`), this returns the exact same
 * `Genre: ${genre}` string as before this change, so every existing
 * call site's prompt stays byte-identical for a clean genre.
 */
function buildGenrePromptLine(
  genre: string | null | undefined,
  title: string | null | undefined
): string | null {
  if (!genre) return null;
  if (isGenrePolluted(genre, title)) return null;
  return `Genre: ${genre}`;
}

const VD_RETRY_STRICT_INSTRUCTION =
  "Your previous response was truncated or was not valid JSON. Return ONLY complete, valid, compact JSON (no markdown fences, no commentary, no trailing text). Do not truncate — if needed, shorten prose fields to fit, but every object/array must be properly closed. Output exactly ONE JSON object and nothing after it.";

function validationIssuePaths(issues: unknown): string[] {
  const maybeIssues =
    issues &&
    typeof issues === "object" &&
    "issues" in issues &&
    Array.isArray((issues as { issues?: unknown }).issues)
      ? (issues as { issues: unknown[] }).issues
      : [];
  return maybeIssues.slice(0, 16).map(issue => {
    if (!issue || typeof issue !== "object") return "(root)";
    const rawPath = (issue as { path?: unknown }).path;
    if (!Array.isArray(rawPath) || rawPath.length === 0) return "(root)";
    return rawPath
      .slice(0, 16)
      .map(segment => String(segment).replace(/[^A-Za-z0-9_-]/g, "?").slice(0, 80))
      .join(".");
  });
}

/**
 * Return bounded, non-content-bearing guidance for a schema retry.
 *
 * Zod issue messages are normally code-authored, but custom refinements may
 * include model/user-derived text. Echoing them verbatim into the next model
 * turn would both waste tokens and create a prompt-injection/data-reflection
 * path. Keep the exact path (already sanitized above), map messages to stable
 * code-authored diagnostics, and cap the guidance before sending it back to
 * the skill.
 */
function validationIssueGuidance(issues: unknown): string[] {
  const maybeIssues =
    issues &&
    typeof issues === "object" &&
    "issues" in issues &&
    Array.isArray((issues as { issues?: unknown }).issues)
      ? (issues as { issues: unknown[] }).issues
      : [];

  return maybeIssues.slice(0, 8).flatMap(issue => {
    if (!issue || typeof issue !== "object") return [];
    const record = issue as { path?: unknown; message?: unknown };
    const rawPath =
      Array.isArray(record.path) && record.path.length > 0
        ? record.path
            .slice(0, 16)
            .map(segment =>
              String(segment).replace(/[^A-Za-z0-9_-]/g, "?").slice(0, 80),
            )
            .join(".")
        : "(root)";
    if (typeof record.message !== "string" || record.message.trim().length === 0) {
      return [`${rawPath}: invalid value`];
    }

    const message = record.message
      .replace(/[\r\n\u0000-\u001f\u007f]/g, " ")
      .replace(/\s+/g, " ")
      .trim();

    // Preserve the three skill-owned lead QC rules as stable, code-authored
    // guidance. Do not interpolate the raw message: a custom refinement can
    // contain model/user text, including prompt-injection instructions.
    let safeMessage: string;
    if (/prompt contains villain-coded visual grammar/i.test(message)) {
      safeMessage =
        "Lead prompt contains villain-coded visual grammar; keep the face open, emotionally accessible, and heroic/romantic, and move thriller tension into setting or posture.";
    } else if (/prompt must contain unmistakable camera-ready lead beauty language/i.test(message)) {
      safeMessage =
        "Lead prompt must contain unmistakable camera-ready lead beauty language: include a role-specific star marker and at least two appeal signals.";
    } else if (/negative_prompt must include at least two role-drift guards/i.test(message)) {
      safeMessage =
        "Lead negative_prompt must include at least two role-drift guards for villain gaze, menace, calculation, or thriller-grade drift.";
    } else if (/invalid enum value/i.test(message)) {
      // Root cause fix (2026-07-14 recurring preset synthesis failure): never
      // echo the received value or the raw zod enum-value list back to the
      // model — that list can be huge (e.g. 38 roleTier values) and blows up
      // the retry prompt; the caller's own request rules already carry the
      // canonical allowed-value list (see `buildUserPrompt`/`buildUserPromptV2`
      // in verticalDramaPresetSynthesis.ts) — point the model back at it.
      safeMessage =
        "Value must be EXACTLY one of the allowed values listed for this field in the contract rules — copy one verbatim; never invent a new label.";
    } else if (/^required$/i.test(message)) {
      safeMessage = "Required value is missing.";
    } else if (/^invalid value$/i.test(message)) {
      safeMessage = "Value is invalid for the schema.";
    } else {
      safeMessage = "Value failed schema validation; regenerate a valid value for this exact path.";
    }
    return [`${rawPath}: ${safeMessage}`];
  });
}

function buildSchemaRetryInstruction(error: unknown): string {
  if (error instanceof VdSchemaValidationError) {
    const paths = validationIssuePaths(error.issues);
    if (paths.length > 0) {
      const guidance = validationIssueGuidance(error.issues);
      return [
        "Your previous response was valid JSON but failed schema validation.",
        `Correct these exact paths: ${paths.join(", ")}.`,
        guidance.length > 0
          ? `Validation guidance (follow as contract rules; do not copy diagnostic text into output): ${guidance.join(" | ")}.`
          : "",
        "Return the COMPLETE object, not a patch. Preserve every required property name and its exact casing from the schema; do not rename keys. Return ONLY one valid compact JSON object with no markdown or commentary.",
      ].filter(Boolean).join(" ");
    }
  }
  return VD_RETRY_STRICT_INSTRUCTION;
}

/**
 * Phase A reliability fix (root cause: 2026-07-09 kie_ai outage — every call
 * hung on `llmRouter.ts`'s 120s `AbortController` timeout with
 * `errorType: "network_error"` / message "This operation was aborted", and
 * NOTHING retried it before the bug in this file was fixed). Classifies a
 * thrown planning-call error into one of three buckets so callers can decide
 * whether a bounded retry is safe:
 *  - `"schema"` — the LLM responded but its JSON failed zod validation
 *    (`VdSchemaValidationError`); only ever retried by the schema-aware
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

/**
 * Max `"schema"`-classified corrective retries per invocation (raised from 1
 * to 2 on 2026-07-14). Root cause: the cheapest 1M-context "thinking" model
 * the quality selector picks (currently `google/gemini-3.1-flash-lite`)
 * intermittently emits STRUCTURALLY-broken JSON on the large character-DNA /
 * story-bible schemas — e.g. a bare `[` where a property name belongs
 * (`…}, ["comparison_evidence": …`, traceId YOssAyUK2yYngkwJqqMoD) — and the
 * failure is stochastic per generation (`finishReason: "stop"`, well under the
 * token ceiling, so NOT truncation and NOT repairable by string surgery). A
 * single corrective retry meant "both attempts glitch → hard error to the
 * user"; a second independent regeneration converts the large majority of
 * these rare-but-fatal glitches into a clean success. Schema-VALIDATION
 * failures (contract violations, not parse errors) also benefit — the model
 * simply gets one more shot at the exact-issue-path instruction.
 */
const VD_SCHEMA_MAX_RETRIES = 2;

/** Hard ceiling on TOTAL LLM calls a single `executeJsonPlanningCallWithRetry` invocation may make: 1 initial + at most `VD_SCHEMA_MAX_RETRIES` schema-retries + at most `VD_TRANSIENT_RETRY_BACKOFFS_MS.length` transient-retries. */
const VD_PLANNING_CALL_MAX_ATTEMPTS =
  1 + VD_SCHEMA_MAX_RETRIES + VD_TRANSIENT_RETRY_BACKOFFS_MS.length;

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
 *  1. **Schema retry** — on a `"schema"`-classified failure
 *     (JSON-parse/zod-validation), retries up to `VD_SCHEMA_MAX_RETRIES` (2)
 *     times with (a) the same system+user prompt plus one appended
 *     strict-JSON instruction message, and (b) a higher `maxTokens` ceiling
 *     (`retryMaxTokens`, defaults to `Math.max(params.maxTokens * 2, 16000)`
 *     when omitted) so a previously-truncated multi-shot payload has more room
 *     to complete. The 2nd retry (raised from 1 on 2026-07-14) exists because
 *     the cheapest 1M-context "thinking" model the quality selector picks
 *     emits stochastic STRUCTURALLY-broken JSON on the large character-DNA /
 *     story-bible schemas — a second independent regeneration usually clears
 *     it (see `VD_SCHEMA_MAX_RETRIES`).
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
  /**
   * OPTIONAL escape hatch (2026-07-18, character-portrait lead-beauty
   * graceful-degradation fix). `undefined` for every one of this function's
   * PRE-EXISTING callers (story bible, episode script, storyboard,
   * start-frame plan, video motion, ad banner, episode continuation) — since
   * the new branch below only runs when this is supplied, their control flow
   * and final-throw behavior is BYTE-IDENTICAL to before this option existed.
   *
   * Root cause this exists for: the cheapest-eligible-model auto-selector
   * some VD stages use (`resolveQualityLargeContextModelId`) reliably writes
   * lead-character portrait prose too plain to pass the pre-existing
   * `findLeadPromptQualityIssues` gate in
   * `verticalDramaCharacterImageGeneration.ts`, hard-failing lead character
   * creation on every one of `VD_SCHEMA_MAX_RETRIES` retries (audit-2026-07-18
   * .jsonl, 00:30-00:31 UTC). The user's fix (both accepted, binding):
   * (1) soften the LEAD-BEAUTY QUALITY gate specifically to a non-fatal
   * warning once retries are exhausted — never the structural/identity
   * checks (JSON shape, `character_design_dna` required keys, role-tier
   * compatibility, the region/ethnicity anchor) — combined with (2) a
   * stronger default model for that one stage
   * (`resolvePremiumLargeContextModelId`, see `verticalDramaImproveScript.ts`)
   * so the softening is rarely even needed going forward.
   *
   * Contract: invoked EXACTLY ONCE, only when (a) every corrective schema
   * retry has already been consumed (mirrors the schema-retry branch's own
   * exhaustion guard, so this NEVER short-circuits a retry that might still
   * succeed cleanly) and (b) the final failure is schema-classified with real
   * parsed JSON to re-offer (never for a JSON-PARSE failure, where there is
   * no `parsedJson`/`zodError` to reason about). Receives the last attempt's
   * parsed-but-invalid JSON and its zod error; return a non-null
   * `{ data, warnings }` to ACCEPT that response despite the validation
   * failure (the caller is expected to have proven, e.g. by re-validating
   * `parsedJson` against a lenient variant of its own schema, that the
   * REMAINING issues are only the ones it has decided are safe to downgrade —
   * this function has no opinion on which issues qualify). Return `null` to
   * preserve today's exact hard-throw behavior.
   */
  onSchemaRetriesExhausted?: (ctx: {
    parsedJson: unknown;
    zodError: unknown;
  }) => { data: T; warnings: string[] } | null;
  /**
   * OPTIONAL passthrough (2026-07-18, timeout-hole fix — see
   * `llmRouter.ts`'s `executeWithFallback` two-phase-timeout doc comment,
   * audit-2026-07-18.jsonl root cause: moonshotai/kimi-k3 capacity-limited,
   * totalMs 275904 per hung attempt). `undefined` for every one of this
   * function's PRE-EXISTING callers — forwarded verbatim to
   * `executeWithFallback`'s own `timeoutMs`, which is itself opt-in and
   * default-off, so omitting this keeps every existing caller's control
   * flow and timing byte-identical to before this option existed. Only
   * INTERACTIVE callers that need a bounded fail-fast budget (currently
   * `verticalDramaCharacterImageGeneration.ts`'s character-generation calls)
   * should set this.
   */
  timeoutMs?: number;
  /**
   * OPTIONAL override (default `undefined` → `VD_TRANSIENT_RETRY_BACKOFFS_MS.length`,
   * i.e. 2 — byte-identical to pre-existing behavior) for how many
   * `"transient"`-classified retries this invocation may use. Exists
   * because a caller that also sets `timeoutMs` bounds EVERY attempt
   * (initial + retries) to that same wall-clock ceiling, so the worst-case
   * total for a stalling provider is `timeoutMs * (1 + effective transient
   * retries) + sum(backoffs used)` — see the two interactive call sites in
   * `verticalDramaCharacterImageGeneration.ts` for the concrete arithmetic
   * proving this stays under the 600s `/trpc/` nginx gateway timeout.
   * Never affects the (orthogonal) schema-retry budget.
   */
  maxTransientRetries?: number;
}): Promise<{
  data: T;
  response: Awaited<ReturnType<typeof executeWithFallback>> extends infer R
    ? R extends { type: "success"; response: infer Resp }
      ? Resp
      : never
    : never;
  retried: boolean;
  /** Only present when `onSchemaRetriesExhausted` accepted a degraded response instead of throwing. Absent (`undefined`) on every normal successful parse, and for every caller that never supplies the option. */
  warnings?: string[];
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
      timeoutMs: params.timeoutMs,
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
        validation.error,
        // `parsedJson`/`rawResponse` — see `VdSchemaValidationError`'s doc
        // comment. Only ever read by the optional `onSchemaRetriesExhausted`
        // hook below; every other catch site of this error class ignores
        // these extra args entirely.
        parsed,
        result.response
      );
    }
    return { data: validation.data as T, response: result.response };
  };

  let currentUserPrompt = params.userPrompt;
  let currentMaxTokens = params.maxTokens;
  let schemaRetriesUsed = 0;
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

      // Schema retry — up to `VD_SCHEMA_MAX_RETRIES` higher-token-ceiling
      // retries. Malformed JSON receives the compact/non-truncation
      // instruction; valid JSON that fails validation receives bounded exact
      // issue paths plus sanitized guidance so skill-owned quality gates can
      // be repaired without echoing values. Each retry rebuilds from the base
      // `params.userPrompt` + the fresh error's instruction (never compounds
      // prior retry text), so a 2nd corrective attempt is a clean, independent
      // regeneration — the reliability lever for the weak selected model's
      // stochastic structural-JSON glitches (see `VD_SCHEMA_MAX_RETRIES`).
      if (
        classification === "schema" &&
        schemaRetriesUsed < VD_SCHEMA_MAX_RETRIES &&
        attemptNumber < VD_PLANNING_CALL_MAX_ATTEMPTS
      ) {
        schemaRetriesUsed++;
        debugError(
          "vd_planning_retry",
          `${params.label}: attempt ${attemptNumber} failed schema validation for model ${params.model}, retrying with stricter instruction + higher token ceiling (schema retry ${schemaRetriesUsed}/${VD_SCHEMA_MAX_RETRIES})`,
          { message: errorMessage }
        );
        currentMaxTokens =
          params.retryMaxTokens ?? Math.max(params.maxTokens * 2, 16000);
        currentUserPrompt = `${params.userPrompt}\n\n${buildSchemaRetryInstruction(error)}`;
        continue;
      }

      // Transient retry (Phase A reliability fix, 2026-07-09 kie_ai outage —
      // see `classifyVerticalDramaLlmError`'s doc comment) — bounded backoff
      // retry for network/timeout/rate-limit/upstream-5xx failures, ORTHOGONAL
      // to the schema retry above (either may fire independently), but the
      // overall attempt count is capped by `VD_PLANNING_CALL_MAX_ATTEMPTS`.
      const effectiveMaxTransientRetries =
        params.maxTransientRetries ?? VD_TRANSIENT_RETRY_BACKOFFS_MS.length;
      if (
        classification === "transient" &&
        transientRetriesUsed < effectiveMaxTransientRetries &&
        attemptNumber < VD_PLANNING_CALL_MAX_ATTEMPTS
      ) {
        const backoffMs = VD_TRANSIENT_RETRY_BACKOFFS_MS[transientRetriesUsed];
        transientRetriesUsed++;
        debugError(
          "vd_planning_retry",
          `${params.label}: attempt ${attemptNumber} failed with a transient error for model ${params.model}, retrying after ${backoffMs}ms (transient retry ${transientRetriesUsed}/${effectiveMaxTransientRetries})`,
          { message: errorMessage }
        );
        await vdSleep(backoffMs);
        continue;
      }

      // Graceful-degradation escape hatch (opt-in — see `onSchemaRetriesExhausted`'s
      // doc comment above). Only reached once the schema-retry branch's OWN
      // exhaustion guard above has already declined to retry again, so this
      // never fires instead of a retry that might still succeed cleanly —
      // only as the very last resort before the unconditional throw below.
      // Restricted to `VdSchemaValidationError` (never a raw JSON-parse
      // failure, transient error, or fatal error) because only that error
      // carries the `parsedJson`/`zodError` the hook needs to reason about.
      if (
        classification === "schema" &&
        params.onSchemaRetriesExhausted &&
        error instanceof VdSchemaValidationError
      ) {
        const degraded = params.onSchemaRetriesExhausted({
          parsedJson: error.parsedJson,
          zodError: error.issues,
        });
        if (degraded) {
          debugError(
            "vd_planning_retry",
            `${params.label}: attempt ${attemptNumber} failed schema validation on every retry, but the graceful-degradation hook accepted the last response with ${degraded.warnings.length} warning(s) instead of failing the stage`,
            { attemptNumber, warnings: degraded.warnings }
          );
          return {
            data: degraded.data,
            response: error.rawResponse,
            retried: attemptNumber > 1,
            warnings: degraded.warnings,
          } as never;
        }
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

/* ---- Shared Vision-Aware JSON Retry Helpers ------------------------------ */

export type VisionAwareContent =
  | string
  | Array<
      | { type: "text"; text: string }
      | { type: "image_url"; image_url: { url: string; detail: "high" } }
    >;

export interface VisionAwareImageInput {
  url: string;
  label?: string;
}

export function buildVisionAwareContent(
  text: string,
  hasVision: boolean,
  images: VisionAwareImageInput[],
): VisionAwareContent {
  if (!hasVision) return text;
  const parts: Array<
    | { type: "text"; text: string }
    | { type: "image_url"; image_url: { url: string; detail: "high" } }
  > = [{ type: "text" as const, text }];
  for (const image of images) {
    if (image.label) {
      parts.push({ type: "text" as const, text: image.label });
    }
    parts.push({
      type: "image_url" as const,
      image_url: { url: image.url, detail: "high" as const },
    });
  }
  return parts;
}

export type VisionAwareCallResponse = Awaited<ReturnType<typeof executeWithFallback>> extends infer R
  ? R extends { type: "success"; response: infer Resp }
    ? Resp
    : never
  : never;

export async function runVisionAwareJsonAttempt<T>(args: {
  model: string;
  systemPrompt: string;
  content: VisionAwareContent;
  userId: number;
  maxTokens: number;
  schema: { safeParse: (value: unknown) => { success: boolean; data?: T; error?: unknown } };
}): Promise<{ data: T; response: VisionAwareCallResponse }> {
  const result = await executeWithFallback({
    model: args.model,
    messages: [
      { role: "system", content: args.systemPrompt },
      { role: "user", content: args.content },
    ],
    stream: false,
    userId: args.userId,
    maxTokens: args.maxTokens,
    temperature: 0.7,
  });

  if (result.type !== "success") {
    throw new Error(
      result.type === "error"
        ? `LLM request failed: ${result.error}`
        : "LLM request did not reach a successful provider response",
    );
  }

  const responseContent = result.response.choices?.[0]?.message?.content ?? "";
  const parsed = extractJson(responseContent);
  const validation = args.schema.safeParse(parsed);
  if (!validation.success) {
    console.error("[runVisionAwareJsonAttempt] Schema validation failed:", {
      model: args.model,
      responseContentLength: responseContent.length,
      responseContentSnippet: responseContent.slice(0, 1000),
      parsedType: typeof parsed,
      validationError: validation.error,
    });
    throw new VdSchemaValidationError(
      "Vision-aware response failed schema validation",
      validation.error,
    );
  }
  return { data: validation.data as T, response: result.response };
}

export async function executeVisionAwareJsonCallWithRetry<T>(args: {
  model: string;
  systemPrompt: string;
  userPromptText: string;
  hasVision: boolean;
  images: VisionAwareImageInput[];
  userId: number;
  schema: { safeParse: (value: unknown) => { success: boolean; data?: T; error?: unknown } };
  firstAttemptMaxTokens: number;
  retryMaxTokens: number;
}): Promise<{ data: T; response: VisionAwareCallResponse }> {
  try {
    return await runVisionAwareJsonAttempt<T>({
      model: args.model,
      systemPrompt: args.systemPrompt,
      content: buildVisionAwareContent(args.userPromptText, args.hasVision, args.images),
      userId: args.userId,
      maxTokens: args.firstAttemptMaxTokens,
      schema: args.schema,
    });
  } catch (firstError) {
    console.warn(`[executeVisionAwareJsonCallWithRetry] First attempt failed with model ${args.model}:`, firstError instanceof Error ? firstError.message : firstError);
    const retryText = `${args.userPromptText}\n\nYour previous response was truncated or was not valid JSON. Return ONLY complete, valid, compact JSON (no markdown fences, no commentary, no trailing text).`;
    try {
      return await runVisionAwareJsonAttempt<T>({
        model: args.model,
        systemPrompt: args.systemPrompt,
        content: buildVisionAwareContent(retryText, args.hasVision, args.images),
        userId: args.userId,
        maxTokens: args.retryMaxTokens,
        schema: args.schema,
      });
    } catch (retryError) {
      console.warn(`[executeVisionAwareJsonCallWithRetry] Retry attempt failed with model ${args.model}. Attempting fallback model gpt-4o-mini...`, retryError instanceof Error ? retryError.message : retryError);
      const fallbackModel = "gpt-4o-mini";
      if (args.model !== fallbackModel) {
        try {
          return await runVisionAwareJsonAttempt<T>({
            model: fallbackModel,
            systemPrompt: args.systemPrompt,
            content: buildVisionAwareContent(args.userPromptText, args.hasVision, args.images),
            userId: args.userId,
            maxTokens: args.retryMaxTokens,
            schema: args.schema,
          });
        } catch (fallbackErr) {
          console.warn(`[executeVisionAwareJsonCallWithRetry] Fallback model ${fallbackModel} failed. Attempting text-only mode...`, fallbackErr instanceof Error ? fallbackErr.message : fallbackErr);
        }
      }
      if (args.hasVision && args.images.length > 0) {
        return await runVisionAwareJsonAttempt<T>({
          model: args.model !== fallbackModel ? fallbackModel : args.model,
          systemPrompt: args.systemPrompt,
          content: args.userPromptText,
          userId: args.userId,
          maxTokens: args.retryMaxTokens,
          schema: args.schema,
        });
      }
      throw retryError;
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
  /** Legacy field name; this value is the planned Sub-episode count. */
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
  /**
   * Series-level audience age rating (Phase 1, `@shared/verticalDramaSeries/
   * audienceAgeRating`) — persisted at `bible.audienceAgeRating`, resolved
   * by the router (`verticalDramaSeries.ts`) via `resolveAudienceAgeRating`
   * before this call. Optional here ONLY so every pre-existing caller/test
   * that predates this field keeps compiling — UNLIKE `userPremise` above,
   * `buildPrompts` ALWAYS renders the resulting content-constraint block
   * (re-resolving a missing/invalid value to the least-restrictive
   * `"18plus"` default), so the block itself is never absent.
   */
  audienceAgeRating?: AudienceAgeRating;
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

  // Feature 132 §4.2.7 (F132A) — moved ahead of `systemPrompt` so the
  // premise-coverage self-assessment request below can gate on it. An
  // absent/empty `userPremise` renders nothing anywhere this variable is
  // used (byte-identical), per the `.filter(Boolean).join("\n")`
  // conditional-block idiom used throughout this file.
  const trimmedUserPremise = params.userPremise?.trim();

  const responseShape = trimmedUserPremise
    ? '{"expandedSeasonArc": string, "refinedCharacters": [{"name": string, "role": string, "description": string, "narrativeRole": string, "roleTier": string, "occupation": string, "aliases": string[]}], "episodeBreakdown": [{"episodeNumber": number, "workingTitle": string, "logline": string, "keyBeats": string[]}], "premise_coverage": {"sufficient": boolean, "note": string}}'
    : '{"expandedSeasonArc": string, "refinedCharacters": [{"name": string, "role": string, "description": string, "narrativeRole": string, "roleTier": string, "occupation": string, "aliases": string[]}], "episodeBreakdown": [{"episodeNumber": number, "workingTitle": string, "logline": string, "keyBeats": string[]}]}';

  const systemPrompt = [
    renderCriteriaVersionMarker(),
    "You are a vertical-drama (short-form mobile drama series) story bible writer.",
    "Given a series' basic setup, expand it into a fuller production-ready story bible.",
    langInstruction,
    // Series-level audience age rating (Phase 1) — firm, unconditional
    // instruction; the actual constraint block is rendered in the user
    // message below (see `audienceAgeRatingBlock`).
    "Every story beat, character, and plot element you generate MUST honor the AUDIENCE AGE RATING (HARD CONSTRAINT) block given in the user message below — treat it as a non-negotiable content boundary, exactly like the JSON response shape.",
    "Respond with ONLY a single JSON object (no markdown, no commentary) matching exactly this shape:",
    responseShape,
    "For every refined character, assign exactly one canonical narrativeRole and roleTier from the supplied role taxonomy. Keep the legacy role field as a human-readable occupation or free-text descriptor; never use an occupation alone as the narrative role. If the story does not establish the narrative role, use the safest supporting/other tier and make the ambiguity explicit in the description rather than inventing a lead or villain.",
    `"narrativeRole" MUST be exactly one of: ${NARRATIVE_ROLE_VALUES.join(", ")}.`,
    `"roleTier" MUST be exactly one of: ${ROLE_TIER_VALUES.join(", ")}. Copy one value verbatim — never invent a new label; lowercase snake_case only.`,
    // `planning/vd-character-identity-repair/plan.md` Phase 2.1 (root-cause-
    // chain item 1: "legitimate short-form usage") — Thai (and most) drama
    // dialogue naturally calls a character by a given name alone, a
    // nickname, or a common romanization; without a declared alias, the
    // deep-draft stage reads that natural short form as a stranger. Declaring
    // it here is what lets the deep-draft prompt's own "CHARACTER BIBLE" FACT
    // block (`buildKnownCharactersPromptBlock`) accept it as a valid name
    // instead of a violation.
    'For each refined character, ALSO include "aliases": an array of every OTHER string ANY dialogue or shot in this story would call this character by — a given name alone when "name" is a full name, a nickname, an honorific/kinship form, or a common romanization. Return an empty array only when the character truly has no other form of address; never omit the field.',
    // `planning/vd-character-identity-repair/plan.md` Phase 6.1 — closes the
    // NEW-PROJECT (wizard) path hole: series 7's roster row
    // `ผู้บงการ(คนร้าย)` (seeded verbatim from the wizard's `charactersDraft`
    // textarea at series creation) was refined by THIS call into
    // `refinedCharacters[].name = "ผู้บงการ"` with no alias declared back to
    // the original — so `reconcileCharactersFromStoryBible` couldn't find it
    // by exact name and silently no-opped, and the NEXT deep draft would
    // have minted a genuine duplicate row (the exact bug this whole plan
    // fixes, reproduced from a clean wizard project rather than an existing
    // one). The instruction below is the model-facing half of the fix; see
    // `charactersDraftBlock` a few lines down in the user message for the
    // deterministic (facts-only) half that makes the original names visible
    // enough for the model to actually satisfy this rule.
    'The "WIZARD CHARACTER DRAFT" block in the user message (when present) lists the creator\'s ORIGINAL character names, verbatim, before your refinement. When a "refinedCharacters" entry\'s "name" is a renamed/expanded/corrected/translated form of one of those original lines (e.g. the draft said "ผู้บงการ(คนร้าย)" and you refined it to "ผู้บงการ"), you MUST include that draft line\'s EXACT original name string in this character\'s "aliases" array — this is the ONLY way the rest of the pipeline can tell your refined name and the creator\'s original name are the same person, so never skip it.',
    `"episodeBreakdown" must contain exactly ${params.targetEpisodeCount} Sub-episode entries, numbered 1..${params.targetEpisodeCount} in order, each with 3-5 short keyBeats.`,
    speechBudgetEnabled
      ? `Each Sub-episode is a fixed ${episodeDurationSeconds}-second short video that must carry AT LEAST ${minEpisodeSpeechSeconds} seconds of spoken dialogue (the platform's minimum speech-coverage floor) — plan enough plot/conflict per Sub-episode to genuinely fill that budget instead of padding a thin Sub-episode afterward. Each entry in "episodeBreakdown" must ALSO include a "contentBudget" object: {"beatCount": number (5-7 story beats), "estimatedSpeechSeconds": number (this Sub-episode's planned total spoken-dialogue seconds, >= ${minEpisodeSpeechSeconds}), "conflictLevel": integer 1-5 (this Sub-episode's position on the SEASON'S escalation curve — start low in early Sub-episodes and rise toward 5 near the finale; never flat across the season), "reversalTarget": integer (at least 2 reversals planned for this Sub-episode), "arcThreads": string[] (season threads this Sub-episode advances)}.`
      : null,
    // `vertical-drama-skill-first-architecture` plan, Phase 4 item 2 —
    // replaces `evaluatePremiseCoverage`'s deterministic token-overlap
    // heuristic for THIS call site: the generation call now self-assesses
    // its own premise coverage as a structured output field instead of code
    // computing it (and authoring the warning text) after the fact. Only
    // requested when a premise was actually supplied — absent otherwise,
    // byte-identical to before this field existed.
    trimmedUserPremise
      ? 'Also self-assess how well your OWN "expandedSeasonArc" + "episodeBreakdown" reflect the USER PREMISE given below, as a "premise_coverage" object: {"sufficient": boolean (true when the season you wrote genuinely develops the premise\'s core idea/conflict/hook — false when it drifted away from it or only nodded to it superficially), "note": string (one or two sentences, in the same language as your other string values, explaining your own assessment — if sufficient is false, name specifically what part of the premise got lost or under-developed)}.'
      : null,
  ]
    .filter(Boolean)
    .join("\n");

  // Feature 132 §4.2.7 (F132A) — prepended ahead of `Series title:` so an
  // absent/empty `userPremise` renders nothing (byte-identical), per the
  // `.filter(Boolean).join("\n")` conditional-block idiom used throughout
  // this file.
  const userPremiseBlock = trimmedUserPremise
    ? `USER PREMISE (PRIMARY):\n${trimmedUserPremise}\nThis premise is the PRIMARY story spine — the series' genre/tone/existing bible fields below are supporting flavor. Do not contradict this premise.`
    : null;

  // Series-level audience age rating (Phase 1) — unlike `userPremiseBlock`
  // above, this is unconditional: `resolveAudienceAgeRating` always returns
  // a concrete tier (defaulting to the least-restrictive "18plus" when
  // `params.audienceAgeRating` is absent/invalid), so this block is never
  // `null`.
  const audienceAgeRatingBlock = renderAudienceAgeRatingBlock(
    resolveAudienceAgeRating(params.audienceAgeRating)
  );

  // `planning/vd-character-identity-repair/plan.md` Phase 6.1 — the wizard's
  // `charactersDraft` freeform textarea is ALREADY present, verbatim, inside
  // the `Existing bible: ${JSON.stringify(params.bible)}` dump below (it is
  // just a raw key on `params.bible`) — but buried in one giant JSON blob it
  // has near-zero salience, and the model has no cue that THESE specific
  // strings are the ones its own naming-alias rule (the instruction ending
  // in "...so never skip it" in the system prompt above) is talking about.
  // Pulling it into its own labeled block is the deterministic, facts-only
  // half of the fix (no code-side name parsing/matching — this file cannot
  // safely import `parseCharactersDraft` from `verticalDramaSeries.ts`
  // without a router->service->router import cycle, and guessing which
  // draft line a refined name came from is exactly the fuzzy-matching this
  // plan forbids). The actual judgment of "which original line does this
  // refined character correspond to" stays entirely with the model
  // (skill-first — see `feedback_skill_first_authoring`); this block only
  // supplies the fact. Renders nothing when the wizard's textarea was left
  // empty (every legacy series, and every series created before this field
  // existed) — byte-identical prompt in that case.
  const rawCharactersDraft =
    typeof (params.bible as { charactersDraft?: unknown } | null)
      ?.charactersDraft === "string"
      ? (
          (params.bible as { charactersDraft?: string }).charactersDraft ?? ""
        ).trim()
      : "";
  const charactersDraftBlock = rawCharactersDraft
    ? [
        "WIZARD CHARACTER DRAFT (verbatim, exactly as the creator originally typed it, one character per line):",
        rawCharactersDraft,
        'When a "refinedCharacters" entry you write has a "name" that differs from how that SAME character appears above (a fuller name, a corrected spelling, a title added/removed, a translation/romanization), you MUST include that original line\'s name string, verbatim, in that character\'s "aliases" array.',
      ].join("\n")
    : null;

  const userPrompt = [
    userPremiseBlock,
    audienceAgeRatingBlock,
    `Series title: ${params.title}`,
    buildGenrePromptLine(params.genre, params.title),
    params.tone ? `Tone: ${params.tone}` : null,
    `Target Sub-episode count (story structure, not Public Episode count): ${params.targetEpisodeCount}`,
    `Existing bible (from the creator's wizard input): ${JSON.stringify(params.bible)}`,
    charactersDraftBlock,
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
   * Feature 132 §4.2.7 (F132A) — warn-only, sourced from the generation
   * call's OWN `premise_coverage` self-assessment (`vertical-drama-skill-
   * first-architecture` plan, Phase 4 item 2 — replaces the deterministic
   * `evaluatePremiseCoverage` heuristic for this call site). Never present
   * when `params.userPremise` is absent/blank, or when the LLM assessed its
   * own output as sufficiently covering the premise. Additive: every
   * existing caller destructuring `{ expanded, creditsUsed, model }` is
   * unaffected.
   */
  warnings?: Array<{ code: string; message: string }>;
}> {
  const hasCredits = await hasEnoughCredits(params.userId, 1);
  if (!hasCredits) {
    throw new InsufficientCreditsError();
  }

  // Lazy import — see the doc comment near this file's top import block for
  // why this cannot be a static top-level import.
  const { resolveQualityLargeContextModelId } =
    await import("./verticalDramaImproveScript");
  const model = await resolveVerticalDramaSeriesModel(
    params.seriesId,
    resolveQualityLargeContextModelId
  );
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

  // `vertical-drama-skill-first-architecture` plan, Phase 4 item 2 — the
  // generation call's OWN `premise_coverage` self-assessment (requested by
  // `buildPrompts` above only when a premise was supplied) replaces
  // `evaluatePremiseCoverage`'s deterministic token-overlap heuristic for
  // THIS call site. The LLM authors `note` itself; code only decides
  // whether to surface it as a warning (`sufficient === false`) — it never
  // invents the warning text. `validatedData.premise_coverage` is absent
  // whenever no premise was supplied (see `buildPrompts`) or an older/
  // lenient response omitted it, in which case no warning is produced —
  // same "additive, never present unless a premise was given" contract the
  // deterministic heuristic used to provide.
  const premiseCoverage = validatedData.premise_coverage;
  const expanded = {
    ...validatedData,
    refinedCharacters: normalizeExpandedCharacterRoles(validatedData.refinedCharacters),
  };

  return {
    expanded,
    creditsUsed,
    model,
    ...(premiseCoverage && !premiseCoverage.sufficient
      ? {
          warnings: [
            { code: "premise_coverage_low", message: premiseCoverage.note },
          ],
        }
      : {}),
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

export function computePremiumDeepDraftChunkSizes(
  episodeCount: number
): number[] {
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
  return `Your previous response was missing required Sub-episode(s): ${list}. Return the COMPLETE response again, covering EVERY requested Sub-episode from this chunk — this time make absolutely sure Sub-episode(s) ${list} are included, each with a full ${VD_DEEP_DRAFT_SHOTS_PER_EPISODE}-shot draft, exactly like every other Sub-episode.`;
}

/* -------------------------------------------------------------------------- */
/* Deterministic per-shot completeness gate (production-grade full-story      */
/* generation, plan `planning/vertical-drama-full-story-production-grade`,    */
/* added 2026-07-13)                                                          */
/*                                                                            */
/* Facts-only, code-only checks — NO LLM call, NO creative judgment (creative */
/* rules live in the `vertical-drama-full-story-architect` skill, per project */
/* policy). `characters`/`location_key` PRESENCE is already enforced by       */
/* `deepDraftRequiredShotSchema` at parse time for a fresh generation — these */
/* checks cover what a zod schema cannot: whether a character NAME matches   */
/* the season's character bible, and whether a `location_key` actually       */
/* resolves against the known (existing + this-run-declared) location roster.*/
/* Both context sets are OPTIONAL: omitting one only disables ITS OWN         */
/* membership check (every other check still runs) — this keeps every caller */
/* that doesn't yet thread character/location context byte-identical (no     */
/* violations ever reported for the checks it opted out of).                 */
/* -------------------------------------------------------------------------- */

export type VdDeepDraftCompletenessViolation = {
  /** `0` for a chunk-level (not one specific episode's) violation — e.g. a bad `new_locations` entry. */
  episodeNumber: number;
  /** `0` for an episode-level (not one specific shot's) violation. */
  shotNumber: number;
  message: string;
};

export interface VdDeepDraftCompletenessGateContext {
  /**
   * Accepted character-name strings for BOTH the `characters[].name` check
   * below AND (Phase 2.5) the `dialogue_lines[].speaker` check — a flat set
   * of canonical bible names (`readBibleRefinedCharacterProfiles`). Omit to
   * skip both membership checks entirely.
   *
   * `planning/vd-character-identity-repair/plan.md` Phase 2.1/2.5 (added
   * 2026-07-17) — the caller (see `GenerateStoryBibleDeepParams.
   * characterBibleNames`'s own doc comment) now flattens each character's
   * declared `aliases` into this SAME set alongside its canonical `name`, so
   * a legitimate short form (e.g. "คิริน" for "คิริน วัฒนเมธา") is accepted
   * exactly like the canonical spelling — this type's own shape (a flat
   * `ReadonlySet<string>`) is UNCHANGED; only what the caller populates it
   * with grew richer. A caller that predates Phase 2.1 (no declared aliases
   * anywhere in the bible) populates this set with canonical names only,
   * byte-identical to before.
   */
  characterBibleNames?: ReadonlySet<string>;
  /** Existing (DB) + already-accepted-this-run `new_locations` keys. Omit to skip the `location_key`-membership check. */
  knownLocationKeys?: ReadonlySet<string>;
}

/**
 * Per-episode shot completeness: every shot's `characters[]` (when present —
 * schema already guarantees `.min(1)` for a fresh deep-draft generation, so
 * an empty array here only happens for a caller reading tolerant/legacy
 * data) has every character's `name` in the character bible (when
 * `context.characterBibleNames` is given), every `dialogue_lines[].speaker`
 * ALSO resolves against that same set (Phase 2.5 — see below), and every
 * shot's `location_key` (when present) resolves against
 * `context.knownLocationKeys` (when given).
 *
 * `planning/vd-character-identity-repair/plan.md` Phase 2.5 (added
 * 2026-07-17, root-cause-chain item 1b/3) — before this change, ONLY
 * `characters[].name` was checked; `dialogue_lines[].speaker` was completely
 * ungoverned, even though `selectStoryIntroducedCharacterNames`
 * (`verticalDramaCharacterRosterAutoRegister.ts`) treats a speaker with >= 2
 * lines as grounds to mint a NEW roster row — the widest character-creation
 * path in the pipeline had no corresponding gate. Every `dialogue_lines`
 * entry's `speaker` is now checked the SAME way (no line-count threshold —
 * a single invented speaker is still an invented name), using the SAME
 * `context.characterBibleNames` set, so a declared alias (Phase 2.1) is
 * accepted for a speaker exactly like it is for a `characters[].name`.
 */
export function computeShotCompletenessViolations(
  episodeNumber: number,
  shotDrafts: VdDeepDraftShotDraft[],
  context: VdDeepDraftCompletenessGateContext = {}
): VdDeepDraftCompletenessViolation[] {
  const violations: VdDeepDraftCompletenessViolation[] = [];
  for (const shot of shotDrafts) {
    const characters = shot.characters ?? [];
    if (characters.length === 0) {
      violations.push({
        episodeNumber,
        shotNumber: shot.shot_number,
        message: `Episode ${episodeNumber} shot ${shot.shot_number} has no "characters" — every shot must list who is in it, each with an explicit "emotion".`,
      });
    } else {
      for (const character of characters) {
        // Defense-in-depth — the fresh-generation schema already requires a
        // non-blank `emotion` (`.min(1)`), but this deterministic check also
        // covers tolerant/legacy-read data (`shotDraftSchema`'s base,
        // optional-field shape) where a stored character could lack one.
        if (!character.emotion || character.emotion.trim().length === 0) {
          violations.push({
            episodeNumber,
            shotNumber: shot.shot_number,
            message: `Episode ${episodeNumber} shot ${shot.shot_number}: character "${character.name}" is missing an "emotion".`,
          });
        }
        if (
          context.characterBibleNames &&
          !context.characterBibleNames.has(character.name)
        ) {
          violations.push({
            episodeNumber,
            shotNumber: shot.shot_number,
            message: `Episode ${episodeNumber} shot ${shot.shot_number}: character "${character.name}" is not in the character bible — use an existing character's exact name, never invent a new one.`,
          });
        }
      }
    }

    // Phase 2.5 — see this function's own doc comment above for why the
    // dialogue speaker gets the SAME membership check as `characters[].name`,
    // with no line-count threshold. `?? []` mirrors `shot.characters ?? []`
    // just above — defense-in-depth for tolerant/legacy-read data, even
    // though a fresh deep-draft generation's schema always defaults this to
    // an array.
    for (const dialogueLine of shot.dialogue_lines ?? []) {
      const speaker = dialogueLine.speaker?.trim();
      if (
        speaker &&
        context.characterBibleNames &&
        !context.characterBibleNames.has(speaker)
      ) {
        violations.push({
          episodeNumber,
          shotNumber: shot.shot_number,
          message: `Episode ${episodeNumber} shot ${shot.shot_number}: dialogue speaker "${speaker}" is not in the character bible — use an existing character's exact name, never invent a new one.`,
        });
      }
    }

    const locationKey = shot.location_key?.trim();
    if (!locationKey) {
      violations.push({
        episodeNumber,
        shotNumber: shot.shot_number,
        message: `Episode ${episodeNumber} shot ${shot.shot_number} has no "location_key".`,
      });
    } else if (
      context.knownLocationKeys &&
      !context.knownLocationKeys.has(locationKey)
    ) {
      violations.push({
        episodeNumber,
        shotNumber: shot.shot_number,
        message: `Episode ${episodeNumber} shot ${shot.shot_number}: location_key "${locationKey}" is neither an existing location nor declared in this response's "new_locations".`,
      });
    }
  }
  return violations;
}

/**
 * Validates a chunk's declared `new_locations` array against the known
 * (existing + already-accepted-this-run) location keys: flags a duplicate
 * key declared twice in the SAME array, and a key that collides with an
 * ALREADY-EXISTING location (should have been reused via `location_key`
 * instead of redeclared). `acceptedKeys` is every OTHER declared key —
 * safe to merge into the known-location roster for subsequent chunks/rounds.
 * `knownLocationKeys` omitted entirely disables the collision check (only
 * within-array duplicates are still checked) — mirrors
 * `computeShotCompletenessViolations`'s own "omit to skip that one check"
 * contract.
 */
export function computeNewLocationDeclarationViolations(
  newLocations: ReadonlyArray<{ location_key: string }>,
  knownLocationKeys: ReadonlySet<string> | undefined
): {
  violations: VdDeepDraftCompletenessViolation[];
  acceptedKeys: Set<string>;
} {
  const violations: VdDeepDraftCompletenessViolation[] = [];
  const acceptedKeys = new Set<string>();
  const seen = new Set<string>();
  for (const loc of newLocations) {
    const key = loc.location_key?.trim();
    if (!key) continue;
    if (seen.has(key)) {
      violations.push({
        episodeNumber: 0,
        shotNumber: 0,
        message: `"new_locations" declares "${key}" more than once — declare each new location ONCE.`,
      });
      continue;
    }
    seen.add(key);
    if (knownLocationKeys?.has(key)) {
      violations.push({
        episodeNumber: 0,
        shotNumber: 0,
        message: `"new_locations" declares "${key}" as new, but it already exists — reuse it via "location_key" instead of redeclaring it.`,
      });
      continue;
    }
    acceptedKeys.add(key);
  }
  return { violations, acceptedKeys };
}

/**
 * Appended to a chunk's user prompt for the ONE corrective retry the
 * standard-mode chunk loop issues when `computeShotCompletenessViolations`/
 * `computeNewLocationDeclarationViolations` find a violation — same
 * "same prompt + one appended instruction" shape as
 * `buildDeepDraftMissingEpisodesRetryInstruction` (and combinable with it in
 * the SAME retry call, see `generateStoryBibleDeep`'s main loop).
 */
export function buildDeepDraftCompletenessRetryInstruction(
  violations: VdDeepDraftCompletenessViolation[]
): string {
  return `Your previous response failed these completeness checks: ${violations
    .map(v => v.message)
    .join(" ")} Return the COMPLETE response again with every issue above fixed — keep everything else that already works.`;
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
 * Production-grade full-story generation, added 2026-07-13 — the STRICT
 * per-shot shape required of a FRESH deep-draft/revise LLM response:
 * `characters` (>=1, each with a required `emotion`) and `location_key` are
 * REQUIRED here (unlike the tolerant base `shotDraftSchema`, which keeps
 * both optional for the stored-data read path — see that schema's own doc
 * comment). Used ONLY inside `deepDraftChunkEpisodeItemSchema` below.
 */
const deepDraftRequiredShotSchema = shotDraftSchema.extend({
  characters: z.array(shotDraftCharacterSchema).min(1),
  location_key: z.string().min(1).max(64),
});

/**
 * Requires exactly `shotDrafts` (using the STRICT per-shot shape above) on
 * top of the base (byte-compatible) `episodeBreakdownItemSchema` — used ONLY
 * to validate a fresh deep-draft chunk/revise LLM response, never for reading
 * stored data (that stays tolerant via `readItemShotDrafts` above).
 */
const deepDraftChunkEpisodeItemSchema = episodeBreakdownItemSchema.extend({
  shotDrafts: z
    .array(deepDraftRequiredShotSchema)
    .length(VD_DEEP_DRAFT_SHOTS_PER_EPISODE),
});

/**
 * Production-grade full-story generation, added 2026-07-13 — one NEW
 * location a deep-draft/revise response declares (see the
 * `vertical-drama-full-story-architect` skill's "New locations" hard
 * requirement). `.passthrough()` mirrors this file's own tolerant-superset
 * convention for every other LLM-facing object schema.
 */
const newLocationDeclarationSchema = z
  .object({
    location_key: z.string().min(1).max(64),
    name: z.string().min(1),
    description: z.string().min(1),
    environment: z.string().min(1),
    time_of_day: z.string().min(1).optional(),
    mood: z.string().min(1).optional(),
  })
  .passthrough();

export type VdDeclaredLocation = z.infer<typeof newLocationDeclarationSchema>;

const deepDraftChunkResponseSchema = z.object({
  episodeBreakdown: z.array(deepDraftChunkEpisodeItemSchema).min(1),
  open_threads: z.array(z.string().min(1)).optional(),
  /** Production-grade full-story generation — optional: absent/`[]` means this chunk needed no new location. */
  new_locations: z.array(newLocationDeclarationSchema).optional(),
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
  /**
   * Special-edition-only facts (Stage 2.5 follow-up, added 2026-07-18) — a
   * "ภาคพิเศษ" (`createMode === "special_edition"`) is a tie-in for its
   * ENTIRE 1-2 sub-episode runtime, built by
   * `buildSpecialEditionProductTieInConfig` (`verticalDramaProductTieIn.ts`)
   * with an `allowedStoryFunctions` subset and (often) uploaded
   * `referenceAssetIds`, but until this follow-up `resolveTieInDraftBootstrap`
   * only ever forwarded `productName`/`productCategory`/`benefitFocus`/
   * `forbiddenClaims`/`placements` — the model never learned WHICH story
   * function the product/place is allowed to play (a straight review vs. a
   * plot-solution) or that verified reference photos exist. `undefined` for
   * EVERY non-special-edition run (including a regular sequel/original series
   * with `productTieIn.enabled === true`) — this keeps every existing
   * tie-in-block test byte-identical; only `resolveTieInDraftBootstrap`
   * populates this, and only when the series' `createMode ===
   * "special_edition"`.
   */
  specialEdition?: {
    /** `VerticalDramaProductTieInConfig["allowedStoryFunctions"]` values (e.g. `"soft_cta"`/`"plot_clue"`) — the model must keep the placement's role within this set. */
    allowedStoryFunctions: string[];
    /**
     * `true` when the series' `productTieIn.referenceAssetIds` is non-empty.
     * Deliberately a boolean, NOT the asset ids themselves — media asset ids
     * are storage handles for the storyboard/image-generation stage, not a
     * fact a TEXT-drafting model can do anything with; the model only needs
     * to know verified reference photos exist so it keeps its description of
     * the product/place grounded in something real rather than inventing a
     * generic one.
     */
    hasReferenceImages: boolean;
  };
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
    `PRODUCT TIE-IN (season plan): this season has a planned product tie-in for "${context.productName}"${context.productCategory ? ` (category: ${context.productCategory})` : ""}. Each Sub-episode's data below states "productTieIn.planned" true or false for THAT Sub-episode — follow it exactly, this is a season-level planning decision, not yours to make.`,
    `For a "planned": true episode: weave the product naturally into exactly ONE shot's beat, like real TV-drama product placement — it must serve that scene's story beat (never unrealistically resolve the main conflict, never read like an advertisement/ad-speak). NEVER use any of these forbidden claims, verbatim or in spirit: ${forbidden}. Mark that ONE shot's "tie_in" as {"has_product_moment": true, "benefit_line": "<short natural in-scene benefit line the dialogue or visual can carry>"}; every OTHER shot in that episode must omit "tie_in" (or set "has_product_moment": false).`,
    `For a "planned": false episode: do NOT introduce, mention, or visually feature the product at all this episode — every shot omits "tie_in" (or sets "has_product_moment": false).`,
    // Special-edition-only facts (Stage 2.5 follow-up) — see
    // `VdTieInDraftContext.specialEdition`'s own doc comment. `null` (renders
    // nothing) for every non-special-edition run, keeping this block
    // byte-identical to before this follow-up whenever `specialEdition` is
    // absent.
    context.specialEdition
      ? `This is a SPECIAL EDITION ("ภาคพิเศษ"): "${context.productName}" is the reason this whole mini-story exists, so it must appear across EVERY episode, not just some. Its role in the story must stay inside this allowed set: ${context.specialEdition.allowedStoryFunctions.join(", ") || "(none specified)"} — do not give it a function outside this list (e.g. do not turn it into a hard sales pitch if only "daily_use"/"soft_cta" are allowed).`
      : null,
    context.specialEdition?.hasReferenceImages
      ? `Verified reference photos of the real product/place exist for this special edition — keep every description of its appearance consistent with a real, specific, recognizable item/place, not a generic invented one.`
      : null,
  ]
    .filter(Boolean)
    .join("\n");
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
function buildSceneContractPromptBlock(
  enabled: boolean | undefined
): string | null {
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
  draftedItems: Array<
    Pick<DeepDraftedEpisodeItem, "shotDrafts" | "cliffhanger_line">
  >,
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
    {
      episodeNumber: 0,
      shotNumber: 0,
      reason: "premise_coverage_low" as const,
    },
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
  draftedItems: Array<{
    episodeNumber: number;
    shotDrafts: VdDeepDraftShotDraft[];
  }>,
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

/**
 * Production-grade full-story generation, added 2026-07-13 — renders the
 * "EXISTING LOCATIONS" FACT block for `buildDeepDraftPrompts`'s userPrompt
 * (and `buildPremiumRevisePrompts`'s, which shares the same contract). `null`
 * (renders nothing, `.filter(Boolean)` drops it) when `locations` is
 * `undefined` — every caller that predates this field stays byte-identical.
 * An empty (but DEFINED) array still renders a block stating there is
 * nothing to reuse yet, so a caller that DOES thread location context always
 * gets an honest instruction either way — see `buildDeepDraftPrompts`'s own
 * `knownLocations` doc comment.
 */
function buildKnownLocationsPromptBlock(
  locations:
    | Array<{ locationKey: string; name: string; description?: string }>
    | undefined
): string | null {
  if (!locations) return null;
  if (locations.length === 0) {
    return 'EXISTING LOCATIONS: none declared yet for this series — every location this response uses must be declared in "new_locations".';
  }
  return `EXISTING LOCATIONS (reuse one of these "location_key" values whenever the shot's location genuinely matches; declare a NEW location in "new_locations" only when none of these fit): ${JSON.stringify(
    locations.map(l => ({
      location_key: l.locationKey,
      name: l.name,
      description: l.description ?? null,
    }))
  )}`;
}

/**
 * THE PRIMARY FIX for `planning/vd-character-identity-repair/plan.md`'s
 * root-cause-chain item 1 (added 2026-07-17) — renders the "CHARACTER BIBLE"
 * FACT block for `buildDeepDraftPrompts`'s userPrompt. Before this function
 * existed, `skill.md:56` commanded the model to spell every name "EXACTLY as
 * spelled in the character bible" while the assembled prompt never actually
 * showed the model that bible — locations got a rendered "EXISTING LOCATIONS"
 * FACT block (`buildKnownLocationsPromptBlock` above) so the model reuses an
 * established key; characters got nothing, so the model could only infer
 * names from whatever short form an earlier stage happened to write, then was
 * penalized by the completeness gate for improvising a spelling it was never
 * given. Mirrors `buildKnownLocationsPromptBlock` exactly (same optional-
 * param / honest-empty-block contract): `undefined` (every caller that
 * predates this field) renders NO block at all, byte-identical to before
 * this fix; an EMPTY (but DEFINED) array still renders a block, so a caller
 * that DOES thread character context always gets an honest instruction
 * either way — see `buildDeepDraftPrompts`'s own `knownCharacters` doc
 * comment.
 */
function buildKnownCharactersPromptBlock(
  characters: VdBibleRefinedCharacter[] | undefined
): string | null {
  if (!characters) return null;
  if (characters.length === 0) {
    return 'CHARACTER BIBLE: no characters declared yet for this series — there is no established roster to check names against yet, so keep every name you introduce consistent across shots.';
  }
  return `CHARACTER BIBLE (every "characters[].name" and "dialogue_lines[].speaker" you write MUST be EXACTLY one of these declared strings — the canonical "name" or one of its "aliases" — never invent a new spelling or a new character): ${JSON.stringify(
    characters.map(c => ({
      name: c.name,
      aliases: c.aliases ?? [],
      role: c.role ?? null,
      narrativeRole: c.narrativeRole ?? null,
      roleTier: c.roleTier ?? null,
      occupation: c.occupation ?? null,
    }))
  )}`;
}

/**
 * Sequel authoring — Stage 2.4 (`planning/vd-series-memory-and-lineage/
 * plan.md`, added 2026-07-17). The bounded fact set a sequel's deep-draft
 * (and, per Stage 2.4b, the premium judge/rejudge/revise prompts) needs to
 * stay continuous with the season it follows — deliberately NOT the parent's
 * full story (20-100 sub-episodes would be far too much input, per the
 * plan's Context section): only the parent's already-bounded
 * `series.memory.compactSummary` + `currentState` projection
 * (`VdSeriesMemory`, `@shared/verticalDramaSeries/seriesMemoryState`), plus
 * the Stage 2.2 carry-over planner's user-approved character disposition.
 * Every field here is a FACT this run was GIVEN, never something the model
 * is asked to EMIT — unlike `episode_memory`, this type needs no entry in
 * `buildDeepDraftPrompts`'s output-contract JSON string.
 */
export type VdSeasonLineageContext = {
  seasonNumber: number;
  parentTitle: string;
  /** The parent series' `series.memory.compactSummary` — bounded, never the parent's full episode-by-episode story. */
  priorSeasonSummary: string;
  /** The parent's `currentState.relationships` as of its last folded episode — carried forward so the model knowingly MOVES them, never silently resets them. */
  carriedRelationships: VdRelationshipState[];
  /** The parent's still-open `currentState.openThreads` (any `threadClass`, including `"domestic"`) this season may pick back up — or must explicitly close/acknowledge, never silently drop. */
  carriedThreads: VdOpenThread[];
  /** Stage 2.2 carry-over planner output — characters returning this season (user-approved), by name for prompt rendering. */
  carriedCharacters: Array<{
    characterKey: string;
    name: string;
    postFinaleStatus?: string;
  }>;
  /** Stage 2.2 — characters explicitly written out; the model must not resurrect them without a stated in-story reason. */
  writtenOutCharacters: Array<{ characterKey: string; name: string }>;
  /** Stage 2.2 — the carry-over planner's antagonist decision for this season (e.g. "released on parole, must re-earn threat" or "new antagonist introduced"). */
  antagonistStrategy: string;
  /** The parent's `currentState.characterKnowledge` — who already knows what; a sequel must not write a character as newly-ignorant of something they already learned in the parent season. */
  characterKnowledge: Record<string, string[]>;
};

/**
 * Renders the "SEASON LINEAGE" FACT block for `buildDeepDraftPrompts`'s (and,
 * per Stage 2.4b, the premium judge/rejudge/revise prompts') userPrompt.
 * Mirrors `buildKnownLocationsPromptBlock`'s optional-param contract EXACTLY
 * — this `null`-when-absent return is the WHOLE byte-identity guarantee for
 * this feature: `undefined` (every caller that predates this field, i.e.
 * every non-sequel run) renders NO block at all and is dropped by the
 * existing `.filter(Boolean)` chain, byte-identical to before this feature
 * existed. Unlike `knownLocations` there is no "empty but defined" honest-
 * block case — a sequel run only ever supplies this once it has a real
 * parent season to describe.
 *
 * The literal string "SEASON LINEAGE" is load-bearing: the
 * `vertical-drama-full-story-architect` skill's guard is the prose
 * "When the user message contains a SEASON LINEAGE block, additionally...",
 * and Stage 2.4b's judge instruction (`buildPriorSeasonContinuityJudgeInstruction`)
 * refers back to this same block by name.
 */
function buildSeasonLineagePromptBlock(
  lineage: VdSeasonLineageContext | undefined
): string | null {
  if (!lineage) return null;
  // Only include facts that actually carry a value. An EMPTY array/object here
  // is not neutral: serialized as `"carriedRelationships":[]` the model reads
  // it as an assertion that the prior season had NO relationships — the exact
  // over-claim that makes a zero-relationship parent (most parents, since
  // script-derived memory yields no pairs) look like it was affirmatively
  // "checked and found empty" rather than simply "not recorded". Omitting the
  // key lets the model treat that dimension as unknown, not as none. Non-fact
  // framing fields (`seasonNumber`, `parentTitle`) are always in the prose
  // header above, never gated.
  const facts: Record<string, unknown> = {};
  if (lineage.priorSeasonSummary) {
    facts.priorSeasonSummary = lineage.priorSeasonSummary;
  }
  if (lineage.carriedRelationships.length > 0) {
    facts.carriedRelationships = lineage.carriedRelationships;
  }
  if (lineage.carriedThreads.length > 0) {
    facts.carriedThreads = lineage.carriedThreads;
  }
  if (lineage.carriedCharacters.length > 0) {
    facts.carriedCharacters = lineage.carriedCharacters;
  }
  if (lineage.writtenOutCharacters.length > 0) {
    facts.writtenOutCharacters = lineage.writtenOutCharacters;
  }
  if (lineage.antagonistStrategy) {
    facts.antagonistStrategy = lineage.antagonistStrategy;
  }
  if (Object.keys(lineage.characterKnowledge).length > 0) {
    facts.characterKnowledge = lineage.characterKnowledge;
  }
  return `SEASON LINEAGE (this is Season ${lineage.seasonNumber}, continuing the SAME story as "${lineage.parentTitle}" — every episode you draft MUST stay recognizably part of that same story world, genre, and tone; open a genuinely NEW conflict rather than re-running the prior season's already-resolved plot): ${JSON.stringify(
    facts
  )}`;
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
  /** Feature 137 P1 — activates identity-safe shot-boundary craft guidance. */
  motionContractsEnabled?: boolean;
  /**
   * Series-level audience age rating (Phase 1) — see
   * `GenerateStoryBibleParams.audienceAgeRating`'s own doc comment; same
   * "optional field, unconditionally-rendered block" contract, threaded
   * into the standard-mode per-chunk loop below (see `generateStoryBibleDeep`).
   */
  audienceAgeRating?: AudienceAgeRating;
  /**
   * Production-grade full-story generation, added 2026-07-13 — the series'
   * currently-known location roster (existing DB rows + any `new_locations`
   * already accepted earlier THIS run), rendered as an "EXISTING LOCATIONS"
   * FACT block so the model reuses an established `location_key` instead of
   * inventing a duplicate. Optional — `undefined` (every caller that
   * predates this field) renders NO such block at all, byte-identical to
   * before this feature existed; an EMPTY array still renders the block
   * (stating there is nothing to reuse yet), so callers that DO thread
   * location context always get an honest instruction either way.
   */
  knownLocations?: Array<{
    locationKey: string;
    name: string;
    description?: string;
  }>;
  /**
   * `planning/vd-character-identity-repair/plan.md` Phase 2.0 (added
   * 2026-07-17) — this series' character-bible roster
   * (`readBibleRefinedCharacterProfiles`), rendered as a "CHARACTER BIBLE"
   * FACT block (`buildKnownCharactersPromptBlock`) so the model can actually
   * obey `skill.md`'s "spell names EXACTLY as in the character bible" rule
   * instead of improvising — see that function's own doc comment for the
   * bug this fixes. Optional — `undefined` (every caller that predates this
   * field) renders NO such block at all, byte-identical to before this fix;
   * an EMPTY array still renders the block (stating there is no established
   * roster yet), so a caller that DOES thread character context always gets
   * an honest instruction either way — mirrors `knownLocations`'s own
   * contract exactly.
   */
  knownCharacters?: VdBibleRefinedCharacter[];
  /**
   * Sequel authoring — Stage 2.4 (`planning/vd-series-memory-and-lineage/
   * plan.md`, added 2026-07-17) — see `VdSeasonLineageContext`'s own doc
   * comment. Optional — `undefined` (every caller that predates this field,
   * i.e. every non-sequel run) renders NO "SEASON LINEAGE" block at all,
   * byte-identical to before this feature existed (see
   * `buildSeasonLineagePromptBlock`'s own doc comment for the full
   * guarantee).
   */
  seasonLineage?: VdSeasonLineageContext;
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
    // Production-grade full-story generation, added 2026-07-13 — the sole
    // author of creative-authorship/craft-rule content (role framing, shot
    // completeness w/ characters+emotion+location, new-location declaration,
    // dialogue accessibility, dramaturgy craft rules) — REPLACES this
    // function's previous inline "You are a vertical-drama... shot-dialogue
    // writer" role line + `VD_NATURAL_THAI_DIALOGUE_RULES` (both project
    // policy: creative judgment lives in the skill, TS only computes facts
    // and the mechanical/config instructions below).
    loadFullStoryArchitectSkillSystemPrompt(),
    `For EACH Sub-episode listed below, write a draft of EXACTLY ${VD_DEEP_DRAFT_SHOTS_PER_EPISODE} numbered shots ("shot_number" 1-${VD_DEEP_DRAFT_SHOTS_PER_EPISODE}, in order) with speakable dialogue that fills that shot's speech budget.`,
    langInstruction,
    // Series-level audience age rating (Phase 1) — firm, unconditional
    // instruction; the actual constraint block is rendered in the user
    // message below (see `audienceAgeRatingBlockForDeepDraft`).
    "Every shot, dialogue line, and situation you draft MUST honor the AUDIENCE AGE RATING (HARD CONSTRAINT) block given in the user message below — treat it as a non-negotiable content boundary, exactly like the JSON response shape.",
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
    params.motionContractsEnabled
      ? '- identity_safe_shot_boundaries: REQUIRED — apply the skill\'s "Identity-safe shot boundaries" section.'
      : null,
    "Respond with ONLY a single JSON object (no markdown, no commentary) matching exactly this shape:",
    `{"episodeBreakdown": [{"episodeNumber": number, "workingTitle": string, "logline": string, "keyBeats": string[], "shotDrafts": [{"shot_number": number, "summary": string, "characters": [{"name": string, "emotion": string, "emotion_after": string}], "location_key": string, "dialogue_lines": [{"speaker": string, "line": string, "delivery": string}], "silence_intent": "dramatic_pause"|"action_visual"|"montage"|"establishing"${tieInDraftShotShapeSuffix(params.tieInDraftContext)}${sceneContractShotShapeSuffix(params.sceneContractsEnabled)}}], "cliffhanger_line": string, "antagonist_tactics": string[], "character_decisions": [{"character": string, "decision": string}], "protagonist_stake": string, "world_rules": [{"rule": string, "limit_or_cost": string}], "price_paid": string, "episode_memory": {"recap": string, "canonical_facts": string[], "threads_opened": [{"thread_id": string, "description": string, "thread_class": "plot"|"domestic"|"career"|"financial"|"health"|"relationship"}], "threads_resolved": string[], "relationship_changes": [{"pair": [string, string], "status": string, "disclosure": "secret"|"known_to_some"|"public"|"undeclared", "known_by": string[]}], "knowledge_changes": [{"character_key": string, "learned": string}]}}], "open_threads": string[], "new_locations": [{"location_key": string, "name": string, "description": string, "environment": string, "time_of_day": string, "mood": string}]}`,
    `"episodeBreakdown" must contain exactly ${params.chunkEpisodes.length} entries — one per Sub-episode listed below, using the SAME episodeNumber/workingTitle/logline/keyBeats given (do not rename or renumber) — each with EXACTLY ${VD_DEEP_DRAFT_SHOTS_PER_EPISODE} "shotDrafts", and EVERY shot's "characters" (>= 1) and "location_key" filled in per this system prompt's shot-completeness/new-location rules.`,
    '"open_threads" must be the UPDATED list of unresolved plot threads/hooks after these episodes: carry forward every thread you were given that is still open, add any new thread you introduce, and drop any thread you fully resolve.',
    '"new_locations" must contain EVERY location this response uses that is not already in the "EXISTING LOCATIONS" list given in the user message — omit the key entirely (or return an empty array) when no new location is needed this chunk.',
    // Without this line the model never emits `episode_memory` at all: the
    // system prompt (skill.md) TEACHES the block, and the parser accepts it,
    // but a model follows the explicit output contract above over prose — the
    // Part 1 gate caught exactly this (gpt-5.4, a strong model, returned every
    // memory array empty and the deterministic fallback took over). Do NOT
    // remove: the whole series-memory feature is dead without it.
    'Every "episodeBreakdown" entry MUST include "episode_memory" — the continuity record for THAT Sub-episode, per this system prompt\'s Episode memory rules. "relationship_changes" is the state AFTER this Sub-episode (never a delta like "trust -> rivalry"), each with a "disclosure" that reflects what the story has actually shown: "public" only once it is openly acknowledged in-world, "secret" when it is deliberately hidden, "undeclared" when neither party has said it aloud yet. Record mundane unfinished business (an unfinished renovation, an unpaid debt) as "threads_opened" with "thread_class": "domestic" — not only plot hooks. Do NOT include "openedEpisode"/"sinceEpisode"; those are assigned automatically.',
  ]
    .filter(Boolean)
    .join("\n");

  const trimmedUserPremiseForDeepDraft = params.userPremise?.trim();
  const userPremiseBlockForDeepDraft = trimmedUserPremiseForDeepDraft
    ? `USER PREMISE (PRIMARY):\n${trimmedUserPremiseForDeepDraft}\nThis premise is the PRIMARY story spine — keep every drafted shot consistent with it.`
    : null;

  // Series-level audience age rating (Phase 1) — unconditional, see
  // `buildPrompts`'s identical `audienceAgeRatingBlock` doc comment.
  const audienceAgeRatingBlockForDeepDraft = renderAudienceAgeRatingBlock(
    resolveAudienceAgeRating(params.audienceAgeRating)
  );

  const episodesPayload = params.chunkEpisodes.map(ep => ({
    episodeNumber: ep.episodeNumber,
    workingTitle: ep.workingTitle,
    logline: ep.logline,
    keyBeats: ep.keyBeats,
    contentBudget: ep.contentBudget ?? null,
    ...(buildTieInDraftEpisodePayloadField(
      params.tieInDraftContext,
      ep.episodeNumber
    )
      ? {
          productTieIn: buildTieInDraftEpisodePayloadField(
            params.tieInDraftContext,
            ep.episodeNumber
          ),
        }
      : {}),
  }));

  const recapText = buildDeepDraftContinuityRecap(
    params.recapItems,
    params.openThreads
  );

  const knownCharactersBlock = buildKnownCharactersPromptBlock(
    params.knownCharacters
  );

  const knownLocationsBlock = buildKnownLocationsPromptBlock(
    params.knownLocations
  );

  // Sequel authoring — Stage 2.4 — see `buildSeasonLineagePromptBlock`'s own
  // doc comment for the byte-identity guarantee (`null` when absent).
  const seasonLineageBlock = buildSeasonLineagePromptBlock(
    params.seasonLineage
  );

  const userPrompt = [
    userPremiseBlockForDeepDraft,
    audienceAgeRatingBlockForDeepDraft,
    `Series title: ${params.title}`,
    buildGenrePromptLine(params.genre, params.title),
    params.tone ? `Tone: ${params.tone}` : null,
    recapText,
    knownCharactersBlock,
    knownLocationsBlock,
    seasonLineageBlock,
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
  /** Feature 137 P1 — activates identity-safe shot-boundary craft guidance. */
  motionContractsEnabled?: boolean;
  /**
   * Series-level audience age rating (Phase 1 of a 2-phase feature) — see
   * `GenerateStoryBibleParams.audienceAgeRating`'s own doc comment; same
   * contract. Threaded into `buildDeepDraftPrompts` for the STANDARD-mode
   * per-chunk loop below only — the `mode: "premium"` pipeline
   * (`generateStoryBibleDeepPremium`) is NOT yet wired to forward this field
   * (a Phase 2 follow-up), so premium-mode `buildDeepDraftPrompts` calls
   * fall back to the unconditional `"18plus"` default block rather than the
   * series' actual chosen tier.
   */
  audienceAgeRating?: AudienceAgeRating;
  /**
   * Production-grade full-story generation, added 2026-07-13 — this series'
   * already-known location roster (existing `vertical_drama_locations` DB
   * rows), threaded straight through to `buildDeepDraftPrompts`'s
   * `knownLocations` (STANDARD mode) / `buildPremiumRevisePrompts`'s
   * `knownLocations` (PREMIUM mode) and the deterministic completeness
   * gate's `location_key`-membership check (`computeShotCompletenessViolations`).
   * Optional — `undefined` (every caller that predates this field) disables
   * BOTH the "EXISTING LOCATIONS" prompt block and the location-membership
   * check (only presence of `location_key` is still enforced, by the
   * schema), so this is byte-identical to before this feature existed. Grows
   * across this run's own chunks as `new_locations` are accepted — the
   * caller only ever supplies the PRE-RUN baseline here.
   */
  existingLocations?: Array<{
    locationKey: string;
    name: string;
    description?: string;
  }>;
  /**
   * Production-grade full-story generation, added 2026-07-13 — this series'
   * character-bible names, used ONLY by the deterministic completeness
   * gate's character-name/dialogue-speaker-membership check
   * (`computeShotCompletenessViolations`). Optional — `undefined` (every
   * caller that predates this field) disables that check entirely (a shot's
   * `characters[].name` is still required to be present/non-empty, by the
   * schema).
   *
   * `planning/vd-character-identity-repair/plan.md` Phase 2.1/2.5 (added
   * 2026-07-17) — the router now flattens each character's declared
   * `aliases` (Phase 2.1) into this SAME flat list alongside its canonical
   * `name`, so "คิริน" (an alias of "คิริน วัฒนเมธา") passes this membership
   * check exactly like the canonical name would — this is deliberately the
   * ONE list threaded to the gate, not a separate alias set, so every
   * existing membership check (shot `characters[].name`, and now
   * `dialogue_lines[].speaker` too — see `computeShotCompletenessViolations`'s
   * own doc comment) becomes alias-tolerant for free, with no signature
   * change anywhere else in this threading chain. A legacy bible with no
   * declared aliases contributes nothing extra here — byte-identical to
   * before Phase 2.1.
   */
  characterBibleNames?: string[];
  /**
   * `planning/vd-character-identity-repair/plan.md` Phase 2.0 (added
   * 2026-07-17) — this series' character-bible roster
   * (`readBibleRefinedCharacterProfiles`), threaded straight through to
   * `buildDeepDraftPrompts`'s `knownCharacters` (STANDARD mode) / the premium
   * fan-out candidates + missing-episode recovery retry (PREMIUM mode — see
   * `runPremiumChunk`) so the model actually SEES the bible it is told to
   * copy names from. Optional — `undefined` (every caller that predates this
   * field) renders NO "CHARACTER BIBLE" prompt block at all, byte-identical
   * to before this fix. Deliberately a SEPARATE field from
   * `characterBibleNames` just above: that one stays a flat name(+alias)
   * `string[]` for the completeness gate's cheap membership check; this one
   * carries the full profile (role/narrativeRole/roleTier/occupation/
   * aliases) the prompt block actually renders.
   */
  knownCharacters?: VdBibleRefinedCharacter[];
  /**
   * Sequel authoring — Stage 2.4 (`planning/vd-series-memory-and-lineage/
   * plan.md`, added 2026-07-17) — see `VdSeasonLineageContext`'s own doc
   * comment. Threaded straight through to `buildDeepDraftPrompts`'s
   * `seasonLineage` (STANDARD mode) and `runPremiumChunk`'s `seasonLineage`
   * (PREMIUM mode — fan-out candidates, judge/re-judge/revise calls, and the
   * missing-episode recovery retry all see it; see Stage 2.4b for the
   * premium judge's conditional `prior_season_continuity` dimension this
   * also gates). Optional — `undefined` (every caller that predates this
   * field, i.e. every non-sequel run) is BYTE-IDENTICAL to before this
   * feature existed: no "SEASON LINEAGE" prompt block, no
   * `prior_season_continuity` judging, no floor-check/feedback text for it.
   */
  seasonLineage?: VdSeasonLineageContext;
  /**
   * Resilient resume (added 2026-07-14, `planning/vertical-drama-deep-story-
   * resilient-resume/plan.md`) — episodes already drafted by an EARLIER
   * (interrupted or already-completed) run, unioned back onto this run's
   * result so they're returned untouched without re-drafting/re-charging
   * them. Supported by BOTH modes: standard mode (see `generateStoryBibleDeep`'s
   * mode switch) seeds these straight into its `draftedItems` accumulator;
   * `generateStoryBibleDeepPremium` filters them out of the episodes it
   * processes and unions them back onto its OWN result at the very end
   * (after its per-episode `Map` accumulator is finalized) — see that
   * function's own doc comment for why the union happens later there.
   * Optional — omitting it (every caller that predates this field) is
   * BYTE-IDENTICAL to before this feature existed.
   */
  resumeDraftedItems?: DeepDraftedEpisodeItem[];
  /**
   * Resilient resume — episode numbers to SKIP entirely: no prompt is built,
   * no LLM call is made, and no credits are deducted for them. The caller
   * (`routers/verticalDramaSeries.ts`) computes this as the union of (a) any
   * episode in the active breakdown that already carries a valid 9-shot
   * `shotDrafts` at job start, and (b) `completedEpisodeNumbers` from a
   * resumed Redis job-record checkpoint. Supported by BOTH modes — see
   * `resumeDraftedItems`'s own doc comment. Optional — omitting it is
   * BYTE-IDENTICAL to before this feature existed (every episode in
   * `params.episodes` gets drafted, exactly like today).
   */
  alreadyDraftedEpisodeNumbers?: number[];
  /**
   * Resilient resume — fired after EACH chunk's drafts are finalized, with
   * ONLY that chunk's freshly-drafted items (never the resumed ones).
   * Standard mode fires it right where the chunk's items are appended to its
   * running `draftedItems` accumulator; `generateStoryBibleDeepPremium` fires
   * it after every SUCCESSFUL `applyChunkResult` call (both the main
   * fan-out chunk loop and its per-episode split-retry fallback — never for
   * the missing-episode/failing branch). Mirrors `onProgress`'s
   * "fire-and-forget, additive, no-op when absent" contract exactly — the
   * caller wires this to a checkpoint writer (`verticalDramaStoryJobs.ts`'s
   * `persistCheckpoint`) so a mid-run crash after this chunk survives a
   * same-jobId BullMQ redelivery. Supported by BOTH modes.
   */
  onChunkComplete?: (chunkDraftedItems: DeepDraftedEpisodeItem[]) => void;
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
  /**
   * Series memory (`planning/vd-series-memory-and-lineage/plan.md` Stage
   * 1.2/1.3, added 2026-07-17) — this episode's resolved memory block
   * (recap + canonical facts + relationship state + open/resolved threads +
   * knowledge changes), always populated by `extractDramaturgyStructureFields`
   * for every FRESHLY drafted episode (at minimum via
   * `resolveEpisodeMemoryBlock`'s deterministic recap-only fallback when the
   * LLM omitted/broke `episode_memory` — see that function's own doc
   * comment). Optional on this TYPE only for backward-compat with items
   * constructed by code that predates this feature (a resumed checkpoint's
   * `draftedItems` from an older run, or the plain `generateStoryBible`
   * response, never carries it). Consumed by
   * `persistDeepDraftEpisodeMemories` (`verticalDramaSeriesMemoryProjection.ts`),
   * called from `runGenerateStoryBibleDeepJob`/`runExtendStoryDraftHorizonJob`
   * (`server/routers/verticalDramaSeries.ts`).
   */
  episodeMemory?: VdEpisodeMemory;
};

/**
 * Dramaturgy critic (W11.5) — copies the 5 structural fields (see
 * `episodeBreakdownItemSchema`) from a raw LLM episode response onto a
 * `DeepDraftedEpisodeItem`-shaped object, omitting any field the response
 * left out entirely (never stamps an explicit `undefined` key — mirrors this
 * file's established "omit, don't null" convention for optional fields).
 * Shared by BOTH standard mode's chunk loop and premium mode's gating step
 * below, so both pipelines read these fields identically.
 *
 * Series memory (Stage 1.2/1.3, added 2026-07-17) — ALSO the single choke
 * point every deep-draft construction site routes through, so it is where
 * `episodeMemory` is resolved (raw `episode_memory` -> trustworthy
 * `VdEpisodeMemory`, ALWAYS present, never omitted — unlike the 5 fields
 * above, which stay legitimately optional). Accepts EITHER shape for the
 * memory field:
 *  - `episode_memory` (snake_case, `unknown`) — a FRESH raw LLM response
 *    (`PremiumRawEpisode`/a standard-mode chunk item) that has not been
 *    resolved yet.
 *  - `episodeMemory` (camelCase, already a `VdEpisodeMemory`) — an object
 *    that already went through this function once (e.g. `PremiumGatedEpisode`
 *    read again when building `PremiumEpisodeState`) — passed through
 *    unchanged, never re-resolved.
 * `episodeNumber`/`logline`/`keyBeats`/`cliffhanger_line` are the fallback
 * context `resolveEpisodeMemoryBlock` needs when the block is absent/invalid
 * — every raw episode item this function is ever called with carries them
 * (required fields on `episodeBreakdownItemSchema`), so the fallback recap is
 * always buildable.
 */
function extractDramaturgyStructureFields(raw: {
  antagonist_tactics?: string[];
  character_decisions?: VdCharacterDecision[];
  protagonist_stake?: string;
  world_rules?: VdWorldRule[];
  price_paid?: string;
  episode_memory?: unknown;
  episodeMemory?: VdEpisodeMemory;
  episodeNumber?: number;
  logline?: string;
  keyBeats?: string[];
  cliffhanger_line?: string;
}): Pick<
  DeepDraftedEpisodeItem,
  | "antagonist_tactics"
  | "character_decisions"
  | "protagonist_stake"
  | "world_rules"
  | "price_paid"
  | "episodeMemory"
> {
  const resolvedEpisodeMemory: VdEpisodeMemory | undefined =
    raw.episodeMemory ??
    (typeof raw.episodeNumber === "number"
      ? resolveEpisodeMemoryBlock(raw.episode_memory, {
          episodeNumber: raw.episodeNumber,
          logline: raw.logline,
          keyBeats: raw.keyBeats,
          cliffhangerLine: raw.cliffhanger_line,
        } satisfies VdEpisodeMemoryFallbackContext)
      : undefined);
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
    ...(resolvedEpisodeMemory ? { episodeMemory: resolvedEpisodeMemory } : {}),
  };
}

/** Plain shape `mergeDramaturgyStructureFields` reads from both `newer`/`prior`. */
type DramaturgyStructureFieldsLike = {
  antagonist_tactics?: string[];
  character_decisions?: VdCharacterDecision[];
  protagonist_stake?: string;
  world_rules?: VdWorldRule[];
  price_paid?: string;
  /** Series memory (Stage 1.2/1.3) — see `PremiumDramaturgyStructureFields`'s own doc comment. */
  episodeMemory?: VdEpisodeMemory;
};

/**
 * Dramaturgy critic (W11.5) — carries a structural field FORWARD from
 * `prior` when a revision/spot-revise response didn't re-emit it. The
 * premium revise/sweep prompts ask for these fields too (see
 * `buildPremiumRevisePrompts`), but a lenient model can still omit one —
 * this stops that from silently erasing already-known season structure.
 * `newer` always wins when it actually has a value for a given field.
 *
 * `episodeMemory` follows the SAME "newer wins, else keep prior" rule —
 * `newer.episodeMemory` is populated by `extractDramaturgyStructureFields`
 * for EVERY freshly-gated response (always resolved, at minimum to the
 * deterministic recap-only fallback), so in practice it always wins here;
 * the `prior` fallback exists only as defense-in-depth against a future
 * caller that constructs `newer` some other way.
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
    ...(newer.episodeMemory
      ? { episodeMemory: newer.episodeMemory }
      : prior.episodeMemory
        ? { episodeMemory: prior.episodeMemory }
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
  /**
   * Production-grade full-story generation, added 2026-07-13 — every NEW
   * location this run's chunks declared and the deterministic gate accepted
   * (deduped by `location_key`, excluding any that collided with an
   * ALREADY-EXISTING key — see `computeNewLocationDeclarationViolations`).
   * Always `[]` (never `undefined`), same "no null-check needed" convention
   * as `warnings`/`missingEpisodes` above. The router persists these into
   * `vertical_drama_locations` after the bible write succeeds — see
   * `runGenerateStoryBibleDeepJob`.
   */
  newLocations: VdDeclaredLocation[];
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
      newLocations: [],
    };
  }

  // Resilient resume (added 2026-07-14) — remove any episode the caller
  // already knows is drafted (resumed checkpoint and/or already-drafted
  // bible state) from the set this run will actually process: it gets no
  // prompt, no LLM call, and no credit deduction. `resumedDraftedItems`
  // seeds the `draftedItems` accumulator below so the FINAL result still
  // returns the full (resumed + newly drafted) union — see
  // `GenerateStoryBibleDeepParams.resumeDraftedItems`'s own doc comment.
  // Both fields are additive/optional: omitting them makes
  // `episodesToProcess`/`resumedDraftedItems` byte-identical to `episodes`/
  // `[]`, i.e. this whole block is a no-op for every caller that predates
  // this feature.
  const alreadyDraftedEpisodeSet = new Set(
    params.alreadyDraftedEpisodeNumbers ?? []
  );
  const episodesToProcess = alreadyDraftedEpisodeSet.size
    ? episodes.filter(ep => !alreadyDraftedEpisodeSet.has(ep.episodeNumber))
    : episodes;
  const resumedDraftedItems = params.resumeDraftedItems ?? [];

  if (episodesToProcess.length === 0) {
    // Every requested episode was already drafted (full resume) — nothing
    // left to draft this run. Return the resumed items as the complete,
    // honest result (no chunks run, no credits spent).
    return {
      draftedItems: resumedDraftedItems,
      chunkSizes: [],
      partial: false,
      creditsUsed: 0,
      model: "",
      warnings: [],
      finalOpenThreads: params.priorRecap?.openThreads ?? [],
      missingEpisodes: [],
      newLocations: [],
    };
  }

  const chunkSizes = computeDeepDraftChunkSizes(episodesToProcess.length);
  const totalEstimate =
    chunkSizes.length * VD_DEEP_DRAFT_PER_CALL_CREDIT_ESTIMATE;
  const hasCredits = await hasEnoughCredits(params.userId, totalEstimate);
  if (!hasCredits) {
    throw new InsufficientCreditsError();
  }

  // The series-level policy is authoritative for every LLM-backed stage.
  // `resolveDeepStoryDraftModel` is only the automatic fallback when the
  // series has no pinned model.
  const model = await resolveVerticalDramaSeriesModel(
    params.seriesId,
    resolveDeepStoryDraftModel,
  );

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

  // Resilient resume — seed the accumulator with what an earlier run already
  // drafted so the final result stays the full union; `resumedDraftedItems`
  // is `[]` for every caller that predates this feature (byte-identical).
  const draftedItems: DeepDraftedEpisodeItem[] = [...resumedDraftedItems];
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

  // Production-grade full-story generation, added 2026-07-13 — see
  // `GenerateStoryBibleDeepParams.existingLocations`/`characterBibleNames`'s
  // own doc comments. `characterBibleNameSet`/`knownLocationKeySet` stay
  // `undefined` (disabling their respective completeness-gate check) when
  // the caller doesn't supply that context; `knownLocationsForPrompt` grows
  // across this run's own chunks as `new_locations` are accepted, so a later
  // chunk can reuse a location an earlier chunk in THIS run just declared.
  const characterBibleNameSet = params.characterBibleNames?.length
    ? new Set(params.characterBibleNames)
    : undefined;
  const knownLocationKeySet = params.existingLocations
    ? new Set(params.existingLocations.map(l => l.locationKey))
    : undefined;
  let knownLocationsForPrompt = params.existingLocations
    ? [...params.existingLocations]
    : undefined;
  const collectedNewLocations: VdDeclaredLocation[] = [];

  for (const size of chunkSizes) {
    chunkIndex += 1;
    const chunkEpisodes = episodesToProcess.slice(cursor, cursor + size);
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
      motionContractsEnabled: params.motionContractsEnabled,
      audienceAgeRating: params.audienceAgeRating,
      knownLocations: knownLocationsForPrompt,
      knownCharacters: params.knownCharacters,
      seasonLineage: params.seasonLineage,
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
      let chunkNewLocationsRaw: VdDeclaredLocation[] =
        first.data.new_locations ?? [];

      // Production-grade full-story generation, added 2026-07-13 —
      // deterministic completeness gate (facts only, NO extra LLM call):
      // validates this chunk's `new_locations` declarations against the
      // known roster, then every returned shot's `characters`/`location_key`
      // against the known roster + this chunk's OWN (still-being-validated)
      // `new_locations`. Reuses the SAME "one corrective retry" mechanism as
      // the missing-episode fix immediately below.
      const gateChunkCompleteness = (
        items: typeof reconciled.items,
        newLocationsRaw: VdDeclaredLocation[]
      ): VdDeepDraftCompletenessViolation[] => {
        const { violations: newLocationViolations, acceptedKeys } =
          computeNewLocationDeclarationViolations(
            newLocationsRaw,
            knownLocationKeySet
          );
        const combinedKnownKeys = knownLocationKeySet
          ? new Set([...knownLocationKeySet, ...acceptedKeys])
          : undefined;
        const shotViolations = items.flatMap(item =>
          computeShotCompletenessViolations(
            item.episodeNumber,
            item.shotDrafts,
            {
              characterBibleNames: characterBibleNameSet,
              knownLocationKeys: combinedKnownKeys,
            }
          )
        );
        return [...newLocationViolations, ...shotViolations];
      };

      let completenessViolations = gateChunkCompleteness(
        reconciled.items,
        chunkNewLocationsRaw
      );

      // Live-bug fix (chunk under-count no longer accepted silently, added
      // 2026-07-08), EXTENDED (production-grade full-story generation,
      // 2026-07-13) to ALSO cover the deterministic completeness gate above:
      // the chunk's returned episode set didn't exactly match what was
      // requested (missing/extra/duplicate) OR failed a completeness check —
      // issue ONE corrective retry of the SAME chunk (same prompt + an
      // explicit instruction naming the missing episode numbers AND/OR the
      // completeness violations), reusing the exact
      // `executeJsonPlanningCallWithRetry` call shape every chunk call
      // already uses. Best-effort: if this retry call itself fails outright
      // (network/still-malformed-after-ITS-OWN-internal-retry), this simply
      // keeps the first attempt's (still incomplete/imperfect) result —
      // never throws away what the first attempt DID successfully draft.
      if (
        reconciled.missingEpisodeNumbers.length > 0 ||
        completenessViolations.length > 0
      ) {
        try {
          const retryInstructionParts = [
            reconciled.missingEpisodeNumbers.length > 0
              ? buildDeepDraftMissingEpisodesRetryInstruction(
                  reconciled.missingEpisodeNumbers
                )
              : null,
            completenessViolations.length > 0
              ? buildDeepDraftCompletenessRetryInstruction(
                  completenessViolations
                )
              : null,
          ]
            .filter((part): part is string => Boolean(part))
            .join("\n\n");
          const retryUserPrompt = `${userPrompt}\n\n${retryInstructionParts}`;
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
              completenessViolationCount: completenessViolations.length,
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
          chunkNewLocationsRaw = retry.data.new_locations ?? chunkNewLocationsRaw;
          // Re-run the SAME gate over the retry's result — this is the FINAL
          // check for this chunk (only ONE corrective retry is ever issued);
          // any violation still present after this is accepted and recorded
          // as a `"shot_completeness_violation"` warning further below,
          // never a second retry.
          completenessViolations = gateChunkCompleteness(
            reconciled.items,
            chunkNewLocationsRaw
          );
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

      // Production-grade full-story generation — record any SURVIVING
      // completeness violation as a non-fatal warning (never blocks the
      // run), then accept this chunk's validated `new_locations` into the
      // running known-location roster for subsequent chunks.
      for (const violation of completenessViolations) {
        warnings.push({
          episodeNumber: violation.episodeNumber,
          shotNumber: violation.shotNumber,
          reason: "shot_completeness_violation",
        });
      }
      const { acceptedKeys: chunkAcceptedLocationKeys } =
        computeNewLocationDeclarationViolations(
          chunkNewLocationsRaw,
          knownLocationKeySet
        );
      const chunkAcceptedLocations = chunkNewLocationsRaw.filter(loc =>
        chunkAcceptedLocationKeys.has(loc.location_key)
      );
      if (chunkAcceptedLocations.length > 0) {
        collectedNewLocations.push(...chunkAcceptedLocations);
        if (knownLocationKeySet) {
          for (const key of chunkAcceptedLocationKeys) {
            knownLocationKeySet.add(key);
          }
        }
        knownLocationsForPrompt = knownLocationsForPrompt
          ? [
              ...knownLocationsForPrompt,
              ...chunkAcceptedLocations.map(loc => ({
                locationKey: loc.location_key,
                name: loc.name,
                description: loc.description,
              })),
            ]
          : undefined;
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
      // Resilient resume — fire-and-forget checkpoint hook, THIS chunk's
      // items only (never the resumed ones already seeded above). No-op
      // when absent, same "additive, never awaited" contract as `onProgress`.
      params.onChunkComplete?.(chunkDrafted);
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

  // Production-grade full-story generation — final dedupe safety net (the
  // per-chunk gate already prevents duplicates within/against the known
  // roster whenever `knownLocationKeySet` is defined; this also protects a
  // caller that omitted `existingLocations` entirely, where no cross-chunk
  // roster was tracked).
  const dedupedNewLocations: VdDeclaredLocation[] = [];
  const seenNewLocationKeys = new Set<string>();
  for (const loc of collectedNewLocations) {
    if (seenNewLocationKeys.has(loc.location_key)) continue;
    seenNewLocationKeys.add(loc.location_key);
    dedupedNewLocations.push(loc);
  }

  return {
    draftedItems,
    chunkSizes: completedChunkSizes,
    partial,
    creditsUsed: totalCreditsUsed,
    model,
    warnings: warningsWithPremiseCoverage,
    finalOpenThreads: openThreads,
    missingEpisodes,
    newLocations: dedupedNewLocations,
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

/**
 * At most this many targeted-revise rounds run per chunk (owner-approved
 * design point 2e). Raised 2 -> 4 (production-grade full-story generation,
 * plan `planning/vertical-drama-full-story-production-grade`, 2026-07-13) —
 * "loop engineering with more rounds... revise the weakest until the
 * scorecard passes the threshold BEFORE returning" (long processing time is
 * acceptable; no second improvement pass afterwards). Regression guard and
 * keep-best-version behavior are UNCHANGED.
 */
export const VD_PREMIUM_DRAFT_MAX_REVISE_ROUNDS = 4;

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
 * conservative FLAT per-chunk estimate, not an exact sum: 10 calls/chunk
 * (3 fan-out + 1 judge + an average of ~3 revise-round call-pairs, rounded
 * up for headroom against `VD_PREMIUM_DRAFT_MAX_REVISE_ROUNDS`) plus a flat 2
 * for the ONE-TIME season continuity sweep (1 sweep-detect call + 1
 * spot-revise/re-judge pair, collapsed to 2 since the spot-revise/re-judge
 * pair only runs when the sweep actually finds an issue). The REAL cost is
 * always the sum of the per-call `calculateCreditsForLLM` amounts actually
 * deducted (`deductPremiumCall`) — this estimate only gates the upfront
 * `hasEnoughCredits` pre-check, mirroring every other Vertical Drama
 * planning call site's conservative pre-check convention.
 *
 * Updated 4/chunk -> 10/chunk (production-grade full-story generation,
 * 2026-07-13) alongside `VD_PREMIUM_DRAFT_MAX_REVISE_ROUNDS` 2 -> 4: 3
 * fan-out + 1 judge = 4 calls, plus up to 4 revise-round pairs (8 calls) —
 * averaged down to ~3 pairs (6 calls) for headroom since most chunks pass
 * floor checks in fewer rounds, giving 4 + 6 = 10.
 */
export function estimatePremiumDeepDraftCalls(chunkCount: number): number {
  return Math.max(0, chunkCount) * 10 + 2;
}

/** `Record<dimension, score>` shape shared by judge/re-judge scores AND the persisted scorecard — used for floor checks, feedback text, and scorecard construction. Persisted legacy scorecards may omit newer v3 dimensions. */
type PremiumScoreLike = Partial<
  Record<VdPremiumDraftScoreDimension, number>
> & {
  overall: number;
  /** Task #22 — see `premiumTieInNaturalnessShape`'s own doc comment; present ONLY for a placed episode's score. */
  tie_in_naturalness?: number;
  /** Stage 2.4b — see `premiumPriorSeasonContinuityShape`'s own doc comment; present ONLY for a sequel-season episode's score. */
  prior_season_continuity?: number;
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
 *
 * Production-grade full-story generation, added 2026-07-13 — `item`'s
 * OPTIONAL `completenessViolations` (see
 * `computeShotCompletenessViolations`/`computeNewLocationDeclarationViolations`)
 * adds ONE violation per entry, straight onto the same sum. Omitted entirely
 * (every pre-existing caller) contributes `0`, so this is byte-identical to
 * before this field existed.
 */
export function computePremiumGateViolationCount(
  items: Array<{
    draftCompleteness: VdDeepDraftCompleteness;
    completenessViolations?: VdDeepDraftCompletenessViolation[];
  }>
): number {
  return items.reduce((sum, item) => {
    const c = item.draftCompleteness;
    let violations = 0;
    if (!c.dialogueEveryShot) violations += 1;
    if (!c.allSpeakable) violations += 1;
    if (c.coverageStatus === "error") violations += 2;
    else if (c.coverageStatus === "warning") violations += 1;
    violations += item.completenessViolations?.length ?? 0;
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
  // Stage 2.4b — additive: only checked when this episode was actually
  // judged on `prior_season_continuity` (a sequel-season episode this run);
  // absent (every existing caller, or a non-sequel run) never affects the
  // floor.
  if (
    scorecard.prior_season_continuity !== undefined &&
    scorecard.prior_season_continuity < VD_PREMIUM_DRAFT_MIN_DIMENSION
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
  // Stage 2.4b — see `premiumPriorSeasonContinuityShape`'s own doc comment.
  ...premiumPriorSeasonContinuityShape,
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
  /** Production-grade full-story generation, added 2026-07-13 — a revise round MAY also declare a new location a fixed shot now needs. */
  new_locations: z.array(newLocationDeclarationSchema).optional(),
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
  /** Series memory (Stage 1.2/1.3) — see `DeepDraftedEpisodeItem.episodeMemory`'s own doc comment. */
  episodeMemory?: VdEpisodeMemory;
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
  /** Production-grade full-story generation, added 2026-07-13 — see `computeShotCompletenessViolations`. */
  completenessViolations: VdDeepDraftCompletenessViolation[];
} & PremiumDramaturgyStructureFields;

/** The CURRENT best version of a single episode as the per-chunk/sweep pipeline progresses (winner, then possibly revised). */
type PremiumEpisodeState = {
  episodeNumber: number;
  shotDrafts: VdDeepDraftShotDraft[];
  cliffhanger_line?: string;
  draftCompleteness: VdDeepDraftCompleteness;
  draftScorecard: VdPremiumDraftScorecard;
  localWarnings: VdDeepDraftWarning[];
  /** Production-grade full-story generation, added 2026-07-13 — see `computeShotCompletenessViolations`. */
  completenessViolations: VdDeepDraftCompletenessViolation[];
} & PremiumDramaturgyStructureFields;

/* -------------------------------------------------------------------------- */
/* Premium pipeline — pure helpers                                            */
/* -------------------------------------------------------------------------- */

/**
 * Runs the SAME deterministic post-chunk enforcement standard mode uses
 * (`enforceEpisodeShotDraftSpeakability` + `computeDraftCompleteness`) over a
 * raw fan-out/revise LLM response's `episodeBreakdown` — any freshly
 * generated shot content always goes through this before being trusted.
 *
 * Production-grade full-story generation, added 2026-07-13 — `context`
 * (optional, same "omit to skip that one check" contract as
 * `computeShotCompletenessViolations`) threads the character-bible/
 * known-location facts into the SAME deterministic gate standard mode uses,
 * per episode — its violation count is folded into `gateViolations`.
 */
function gateRawPremiumEpisodes(
  rawEpisodeBreakdown: PremiumRawEpisode[],
  context: VdDeepDraftCompletenessGateContext = {}
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
    const completenessViolations = computeShotCompletenessViolations(
      raw.episodeNumber,
      cleaned,
      context
    );
    return {
      episodeNumber: raw.episodeNumber,
      workingTitle: raw.workingTitle,
      logline: raw.logline,
      keyBeats: raw.keyBeats,
      shotDrafts: cleaned,
      cliffhanger_line: raw.cliffhanger_line,
      draftCompleteness,
      gateViolations: computePremiumGateViolationCount([
        { draftCompleteness, completenessViolations },
      ]),
      localWarnings,
      completenessViolations,
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
  // Stage 2.4b — carried through ONLY when the judge actually scored it (a
  // sequel-season episode), matching `worstCasePremiumScorecard`'s own "omit
  // unless applicable" convention below.
  if (score.prior_season_continuity !== undefined) {
    scorecard.prior_season_continuity = score.prior_season_continuity;
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
 *
 * Stage 2.4b — `includePriorSeasonContinuity` (defaults `false`, same
 * byte-identical-when-omitted contract as `includeTieIn`) additionally
 * stamps `prior_season_continuity: 1` — pass `true` ONLY when this run is
 * drafting a sequel season (`seasonLineage` present), so a missing judgment
 * for a sequel episode still reads as "needs revision" on that dimension too.
 */
function worstCasePremiumScorecard(
  judgedAtRound: number,
  includeTieIn = false,
  includePriorSeasonContinuity = false
): VdPremiumDraftScorecard {
  const scorecard: Record<string, number> = { judgedAtRound, overall: 1 };
  for (const dimension of VD_PREMIUM_DRAFT_SCORE_DIMENSIONS) {
    scorecard[dimension] = 1;
  }
  if (includeTieIn) {
    scorecard.tie_in_naturalness = 1;
  }
  if (includePriorSeasonContinuity) {
    scorecard.prior_season_continuity = 1;
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
  // Stage 2.4b — `prior_season_continuity` participates in the SAME "weak
  // dimensions"/feedback text as the 8 core dimensions whenever it was
  // actually judged (a sequel-season episode); absent otherwise, so this
  // stays byte-identical for every non-sequel call — mirrors `tieInWeak`
  // exactly.
  const priorSeasonContinuityWeak =
    scorecard.prior_season_continuity !== undefined &&
    scorecard.prior_season_continuity < VD_PREMIUM_DRAFT_MIN_DIMENSION;
  const allWeakDimensions = [
    ...weakDimensions,
    ...(tieInWeak ? ["tie_in_naturalness"] : []),
    ...(priorSeasonContinuityWeak ? ["prior_season_continuity"] : []),
  ];
  const allScoresText = [
    `overall: ${scorecard.overall}/5`,
    ...VD_PREMIUM_DRAFT_SCORE_DIMENSIONS.map(
      dimension => `${dimension}: ${scorecard[dimension] ?? "missing"}/5`
    ),
    ...(scorecard.tie_in_naturalness !== undefined
      ? [`tie_in_naturalness: ${scorecard.tie_in_naturalness}/5`]
      : []),
    ...(scorecard.prior_season_continuity !== undefined
      ? [`prior_season_continuity: ${scorecard.prior_season_continuity}/5`]
      : []),
  ].join(", ");
  const focus =
    allWeakDimensions.length > 0
      ? `Focus specifically on raising: ${allWeakDimensions.join(", ")}.`
      : "Focus on raising the overall score while keeping every dimension at or above its current level.";
  const tieInNote = tieInWeak
    ? " Make the product tie-in moment feel more organic and natural — like real product placement, not an advertisement."
    : "";
  const priorSeasonContinuityNote = priorSeasonContinuityWeak
    ? " Fix the break in continuity with the prior season named in the SEASON LINEAGE facts — restore what was established there without undoing any legitimate story progress."
    : "";
  return `Current judged scores — ${allScoresText}. ${focus}${tieInNote}${priorSeasonContinuityNote} Revise ONLY what's needed to fix these — do not discard what already works.`;
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
 * `vertical-drama-skill-first-architecture` plan, Phase 4 item 1 — the
 * previously-orphaned `vertical-drama-season-dramaturgy-critic` skill's
 * system prompt, now the sole author of the judge/re-judge instructional
 * content below (rubric definitions, output-shape template). Mirrors
 * `verticalDramaScriptGeneration.ts`'s `loadSkillSystemPrompt` exactly (same
 * resolve -> read -> parse -> cache shape). Loads the skill's Mode 2
 * ("draft_quality_score") content — see that skill's own skill.md.
 */
const DRAMATURGY_CRITIC_SKILL_FOLDER_PATH = path.join(
  "skills",
  "vertical-drama-season-dramaturgy-critic"
);

let cachedDramaturgyCriticSystemPrompt: string | null = null;

function loadDramaturgyCriticSkillSystemPrompt(): string {
  if (cachedDramaturgyCriticSystemPrompt)
    return cachedDramaturgyCriticSystemPrompt;

  for (const dir of resolveSkillDirCandidates(
    DRAMATURGY_CRITIC_SKILL_FOLDER_PATH
  )) {
    const manifestPath = resolveSkillManifestPath(dir);
    if (manifestPath && fs.existsSync(manifestPath)) {
      const raw = fs.readFileSync(manifestPath, "utf-8");
      const { content } = parseSkillFile(raw);
      if (content && content.trim().length > 0) {
        cachedDramaturgyCriticSystemPrompt = content;
        return cachedDramaturgyCriticSystemPrompt;
      }
    }
  }

  throw new Error(
    `Could not locate skill.md for "vertical-drama-season-dramaturgy-critic" under any known skills directory`
  );
}

/**
 * Production-grade full-story generation
 * (`planning/vertical-drama-full-story-production-grade`, added 2026-07-13)
 * — the `vertical-drama-full-story-architect` skill's system prompt, now the
 * sole author of `buildDeepDraftPrompts`'s creative-authorship/craft-rule
 * content (role framing, shot-completeness contract, dialogue-accessibility
 * rule, craft requirements) — per project policy, creative judgment lives in
 * the skill, TS only computes facts and orchestrates. Mirrors
 * `loadDramaturgyCriticSkillSystemPrompt` immediately above (same
 * resolve -> read -> parse -> cache shape), PLUS appends the skill's
 * `references/production-grade-vertical-drama.md` reference document under a
 * `"REFERENCE: Production-Grade Vertical Drama Guidelines"` separator line
 * (the skill.md body itself names this exact heading — see that file's own
 * "A full production-grade craft guideline document is appended..." note).
 * The reference file is read best-effort: its absence does not fail
 * generation, only omits the appended section (the skill.md body alone is
 * still a complete, useful system prompt).
 */
const FULL_STORY_ARCHITECT_SKILL_FOLDER_PATH = path.join(
  "skills",
  "vertical-drama-full-story-architect"
);
const FULL_STORY_ARCHITECT_REFERENCE_RELATIVE_PATH = path.join(
  "references",
  "production-grade-vertical-drama.md"
);
const FULL_STORY_ARCHITECT_REFERENCE_HEADER =
  "REFERENCE: Production-Grade Vertical Drama Guidelines";

let cachedFullStoryArchitectSystemPrompt: string | null = null;

function loadFullStoryArchitectSkillSystemPrompt(): string {
  if (cachedFullStoryArchitectSystemPrompt)
    return cachedFullStoryArchitectSystemPrompt;

  for (const dir of resolveSkillDirCandidates(
    FULL_STORY_ARCHITECT_SKILL_FOLDER_PATH
  )) {
    const manifestPath = resolveSkillManifestPath(dir);
    if (manifestPath && fs.existsSync(manifestPath)) {
      const raw = fs.readFileSync(manifestPath, "utf-8");
      const { content } = parseSkillFile(raw);
      if (content && content.trim().length > 0) {
        const referencePath = path.join(
          dir,
          FULL_STORY_ARCHITECT_REFERENCE_RELATIVE_PATH
        );
        let referenceContent = "";
        try {
          if (fs.existsSync(referencePath)) {
            referenceContent = fs.readFileSync(referencePath, "utf-8").trim();
          }
        } catch {
          // Best-effort — see this function's own doc comment.
          referenceContent = "";
        }
        cachedFullStoryArchitectSystemPrompt = referenceContent
          ? `${content}\n\n${FULL_STORY_ARCHITECT_REFERENCE_HEADER}\n${referenceContent}`
          : content;
        return cachedFullStoryArchitectSystemPrompt;
      }
    }
  }

  throw new Error(
    `Could not locate skill.md for "vertical-drama-full-story-architect" under any known skills directory`
  );
}

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
  'Good Thai dialogue: "แม่ไม่ต้องพูดแล้ว หนูเห็นเองกับตา" / "ถ้าเขารู้ เราจบกันคืนนี้". Bad Thai dialogue: "ฉันรู้สึกถึงความยุติธรรมและสิทธิ์ของครอบครัว" / "ข้อมูลนี้ทำให้สถานการณ์เปลี่ยนแปลงอย่างมีนัยสำคัญ".',
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
 * `buildPremiumJudgePrompts`/`buildPremiumRejudgePrompts`. `null` (renders
 * nothing) unless at least one episode being judged THIS call actually has
 * `hasPlannedTieIn: true`, so a chunk/judge call with no placed episode
 * renders byte-identical to before task #22 (see
 * `verticalDramaStoryBible.tieInDraft.test.ts`'s
 * ".not.toContain('tie_in_naturalness')" regression coverage). Kept as a
 * narrow, deliberately-code-appended addendum rather than folded into the
 * `vertical-drama-season-dramaturgy-critic` skill's static Mode 2 content —
 * see that skill.md's Mode 2 section, which intentionally never mentions
 * `tie_in_naturalness` in its own static rubric for exactly this reason.
 */
function buildTieInJudgeInstruction(
  hasAnyPlacedEpisode: boolean
): string | null {
  if (!hasAnyPlacedEpisode) return null;
  return 'Additionally, for any episode digest marked "hasPlannedTieIn": true, ALSO score "tie_in_naturalness" 1-5 (1 = reads like a forced advertisement, 5 = reads like real, organic product placement) — omit this field entirely for an episode NOT marked "hasPlannedTieIn": true.';
}

/**
 * Stage 2.4b (`planning/vd-series-memory-and-lineage/plan.md`, added
 * 2026-07-17) — the `prior_season_continuity` judge-prompt addition, shared
 * by `buildPremiumJudgePrompts`/`buildPremiumRejudgePrompts`. `null` (renders
 * nothing) unless this call is judging a SEQUEL season (`seasonLineage`
 * present), so a non-sequel run's judge prompt stays byte-identical to
 * before this feature existed — mirrors `buildTieInJudgeInstruction`'s exact
 * contract.
 *
 * UNLIKE `buildTieInJudgeInstruction` (whose whole rubric lives in this
 * file), this function is deliberately a thin POINTER, not a rubric — per
 * project policy ("TS computes facts, skill owns judgment"), the actual
 * drift-vs-legitimate-change criteria live ONLY in
 * `vertical-drama-season-dramaturgy-critic` skill.md's own
 * "prior_season_continuity" section; this string only names the JSON
 * key/range and tells the model which facts to judge against (the "SEASON
 * LINEAGE" block `buildSeasonLineagePromptBlock` renders into the user
 * message).
 */
function buildPriorSeasonContinuityJudgeInstruction(
  hasSeasonLineage: boolean
): string | null {
  if (!hasSeasonLineage) return null;
  return 'Additionally — because a "SEASON LINEAGE" fact block is given in the user message (this run is drafting a SEQUEL season) — ALSO score "prior_season_continuity" 1-5 for every episode in this call, per this skill\'s own "prior_season_continuity" section, judging strictly against the SEASON LINEAGE facts given (carried relationships/disclosure, carried open threads, canonical facts, character knowledge) — never against invented continuity.';
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
  /** Stage 2.4b — see `buildPriorSeasonContinuityJudgeInstruction`'s own doc comment; threaded straight through from `GenerateStoryBibleDeepParams.seasonLineage`. */
  seasonLineage?: VdSeasonLineageContext;
}): { systemPrompt: string; userPrompt: string } {
  const hasAnyPlacedEpisode = params.candidates.some(c =>
    c.episodes.some(e => e.hasPlannedTieIn === true)
  );
  // `vertical-drama-skill-first-architecture` plan, Phase 4 item 1 — the
  // dramaturgy-critic skill's Mode 2 content is the sole author of the
  // rubric/output-shape instructions below; this function supplies only
  // structured input facts (title/genre/tone/locale/recap/candidates) plus
  // the two narrow, deliberately-code-appended conditional addenda (see
  // `buildTieInJudgeInstruction`/`buildPriorSeasonContinuityJudgeInstruction`'s
  // own doc comments).
  const systemPrompt = [
    loadDramaturgyCriticSkillSystemPrompt(),
    buildTieInJudgeInstruction(hasAnyPlacedEpisode),
    buildPriorSeasonContinuityJudgeInstruction(
      params.seasonLineage !== undefined
    ),
  ]
    .filter(Boolean)
    .join("\n");

  const recapText = buildDeepDraftContinuityRecap(
    params.recapItems,
    params.openThreads
  );

  // Stage 2.4b — see `buildSeasonLineagePromptBlock`'s own doc comment for
  // the byte-identity guarantee (`null` when absent).
  const seasonLineageBlock = buildSeasonLineagePromptBlock(
    params.seasonLineage
  );

  const userPrompt = [
    'Action: "draft_quality_score"',
    `Series title: ${params.title}`,
    buildGenrePromptLine(params.genre, params.title),
    params.tone ? `Tone: ${params.tone}` : null,
    `Locale: ${params.locale}`,
    recapText,
    seasonLineageBlock,
    `Number of candidate drafts given below: ${params.candidates.length}`,
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
  /** Stage 2.4b — see `buildPriorSeasonContinuityJudgeInstruction`'s own doc comment; threaded straight through from `GenerateStoryBibleDeepParams.seasonLineage`. */
  seasonLineage?: VdSeasonLineageContext;
}): { systemPrompt: string; userPrompt: string } {
  const hasAnyPlacedEpisode = params.episodes.some(
    e => e.hasPlannedTieIn === true
  );
  // Same skill-driven system prompt as `buildPremiumJudgePrompts` — the
  // skill's Mode 2 content already covers the "single ungrouped set of
  // episodes" (re-judge) case (see skill.md Mode 2's own framing).
  const systemPrompt = [
    loadDramaturgyCriticSkillSystemPrompt(),
    buildTieInJudgeInstruction(hasAnyPlacedEpisode),
    buildPriorSeasonContinuityJudgeInstruction(
      params.seasonLineage !== undefined
    ),
  ]
    .filter(Boolean)
    .join("\n");

  const recapText = buildDeepDraftContinuityRecap(
    params.recapItems,
    params.openThreads
  );

  // Stage 2.4b — see `buildSeasonLineagePromptBlock`'s own doc comment for
  // the byte-identity guarantee (`null` when absent).
  const seasonLineageBlock = buildSeasonLineagePromptBlock(
    params.seasonLineage
  );

  const userPrompt = [
    'Action: "draft_quality_score"',
    `Series title: ${params.title}`,
    buildGenrePromptLine(params.genre, params.title),
    params.tone ? `Tone: ${params.tone}` : null,
    `Locale: ${params.locale}`,
    recapText,
    seasonLineageBlock,
    `Episodes to score (no candidate grouping — treat as a single implicit candidate, candidateIndex 0): ${JSON.stringify(
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

/**
 * Series memory (Stage 1.2/1.3, added 2026-07-17) — strips `episodeMemory`
 * before a `DramaturgyStructureFieldsLike` value is embedded into a premium
 * revise/sweep prompt payload (`buildPremiumRevisePrompts`'s `currentStructure`
 * field below). That prompt's documented shape/instructions only ever
 * mention the 5 legacy structural fields (see its own system-prompt line);
 * embedding the (potentially large) resolved memory block there would
 * silently inflate every premium revise call's token cost with no
 * corresponding instruction telling the model what to do with it. The
 * STATE object (`PremiumGatedEpisode`/`PremiumEpisodeState`) still carries
 * `episodeMemory` untouched — this only scrubs the PROMPT-payload copy.
 */
function omitEpisodeMemoryForPrompt(
  structure: DramaturgyStructureFieldsLike
): Omit<DramaturgyStructureFieldsLike, "episodeMemory"> {
  const { episodeMemory: _episodeMemory, ...rest } = structure;
  return rest;
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
  /** Production-grade full-story generation — see `buildDeepDraftPrompts`'s own `knownLocations` doc comment; threaded through so a revise call still only reuses/declares valid location keys. */
  knownLocations?: Array<{
    locationKey: string;
    name: string;
    description?: string;
  }>;
  /**
   * `planning/vd-character-identity-repair/plan.md` Phase 2.0 (added
   * 2026-07-18, follow-up) — see `buildDeepDraftPrompts`'s own
   * `knownCharacters` doc comment; same optional-param / honest-empty-block
   * contract. This closes the gap the initial Phase 2.0 pass left open:
   * `mode: "premium"` — the mode picker's DEFAULT (see
   * `VerticalDramaDeepStoryDraftsPanel.tsx`) — revises via THIS function,
   * not `buildDeepDraftPrompts`, and its `currentDraft.shots[].characters`
   * payload below hands the model whatever names the fan-out candidate
   * already wrote (possibly already-drifted, e.g. "คีริน"/"Kirin") with no
   * canonical anchor to correct back to. Rendering the SAME "CHARACTER
   * BIBLE" FACT block here gives every revise round (both the per-chunk
   * targeted-revise loop and the season-sweep spot-revise) a name it can
   * actually revise TOWARD, not just drift further from.
   */
  knownCharacters?: VdBibleRefinedCharacter[];
  /** Stage 2.4b — see `buildDeepDraftPrompts`'s own `seasonLineage` doc comment; threaded through so a below-floor sequel episode's revise call still has the SEASON LINEAGE facts to actually fix a continuity break against. */
  seasonLineage?: VdSeasonLineageContext;
}): { systemPrompt: string; userPrompt: string } {
  const langInstruction =
    params.locale === "th"
      ? "Write every dialogue line, shot summary, and cliffhanger line in natural, speakable Thai."
      : `Write every dialogue line, shot summary, and cliffhanger line in ${verticalDramaLocaleEnglishName(params.locale)}.`;

  const systemPrompt = [
    "You are a vertical-drama (short-form mobile drama series) shot-dialogue REVISER.",
    `For EACH Sub-episode listed below, REVISE its existing ${VD_DEEP_DRAFT_SHOTS_PER_EPISODE}-shot draft to address the specific feedback given for that Sub-episode — keep everything that already works, change only what the feedback calls out. The revised draft must still have EXACTLY ${VD_DEEP_DRAFT_SHOTS_PER_EPISODE} numbered shots ("shot_number" 1-${VD_DEEP_DRAFT_SHOTS_PER_EPISODE}, in order) and must NOT change the Sub-episode's workingTitle/logline/keyBeats.`,
    langInstruction,
    params.locale === "th" ? VD_NATURAL_THAI_DIALOGUE_RULES : null,
    VD_PREMIUM_SPEAKABILITY_RULES,
    VD_PREMIUM_NO_SILENCE_INTENT_WITH_DIALOGUE_RULE,
    'Each shot\'s "currentDraft" already carries its "characters" (each with "emotion") and "location_key" — carry them forward UNCHANGED unless the feedback specifically calls for a fix to a character/emotion/location, in which case update ONLY what the feedback names; every revised shot MUST still include both fields exactly like the JSON response shape requires.',
    // `planning/vd-character-identity-repair/plan.md` Phase 2.0 follow-up
    // (added 2026-07-18) — a "currentDraft" character/speaker name MAY
    // already be drifted (the fan-out candidate this revises invented a
    // spelling); when the feedback calls for a name fix, the corrected name
    // MUST come from the "CHARACTER BIBLE" FACT block in the user message
    // below (a canonical name or one of its declared aliases), never a new
    // invented spelling.
    'If the feedback calls for correcting a character\'s "name" (in "characters[]" or a "dialogue_lines[].speaker"), the corrected value MUST be EXACTLY one of the names/aliases declared in the "CHARACTER BIBLE" block below — never invent a new spelling or a new character.',
    'Each Sub-episode\'s "currentStructure" (when given) is its already-recorded antagonist_tactics/character_decisions/protagonist_stake/world_rules/price_paid — carry each forward UNCHANGED in your revised entry unless the feedback specifically calls for updating that one, in which case update ONLY that field.',
    buildTieInDraftSystemBlock(params.tieInDraftContext),
    params.tieInDraftContext
      ? 'If an episode\'s "currentDraft" already has a shot marked "tie_in.has_product_moment": true and the feedback does not ask you to change the product placement, KEEP that SAME shot marked (refine it — e.g. making it feel more organic — only if the feedback calls for that) — do not move the placement to a different shot or drop it.'
      : null,
    "Respond with ONLY a single JSON object (no markdown, no commentary) matching exactly this shape:",
    `{"episodeBreakdown": [{"episodeNumber": number, "workingTitle": string, "logline": string, "keyBeats": string[], "shotDrafts": [{"shot_number": number, "summary": string, "characters": [{"name": string, "emotion": string, "emotion_after": string}], "location_key": string, "dialogue_lines": [{"speaker": string, "line": string, "delivery": string}], "silence_intent": "dramatic_pause"|"action_visual"|"montage"|"establishing"${tieInDraftShotShapeSuffix(params.tieInDraftContext)}}], "cliffhanger_line": string, "antagonist_tactics": string[], "character_decisions": [{"character": string, "decision": string}], "protagonist_stake": string, "world_rules": [{"rule": string, "limit_or_cost": string}], "price_paid": string}], "new_locations": [{"location_key": string, "name": string, "description": string, "environment": string, "time_of_day": string, "mood": string}]}`,
    `"episodeBreakdown" must contain exactly ${params.episodes.length} entries — one per Sub-episode listed below, using the SAME episodeNumber/workingTitle/logline/keyBeats given — each with EXACTLY ${VD_DEEP_DRAFT_SHOTS_PER_EPISODE} "shotDrafts".`,
    '"new_locations" is OPTIONAL — include it ONLY if a fix requires a location not already in "EXISTING LOCATIONS" or already declared for this episode.',
  ]
    .filter(Boolean)
    .join("\n");

  const recapText = buildDeepDraftContinuityRecap(
    params.recapItems,
    params.openThreads
  );

  const knownCharactersBlock = buildKnownCharactersPromptBlock(
    params.knownCharacters
  );

  const knownLocationsBlock = buildKnownLocationsPromptBlock(
    params.knownLocations
  );

  // Stage 2.4b — see `buildSeasonLineagePromptBlock`'s own doc comment for
  // the byte-identity guarantee (`null` when absent).
  const seasonLineageBlock = buildSeasonLineagePromptBlock(
    params.seasonLineage
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
        characters: shot.characters ?? [],
        location_key: shot.location_key ?? null,
        dialogue_lines: shot.dialogue_lines,
        silence_intent: shot.silence_intent,
        ...(shot.tie_in ? { tie_in: shot.tie_in } : {}),
      })),
    },
    currentStructure: e.currentStructure
      ? omitEpisodeMemoryForPrompt(e.currentStructure)
      : null,
    ...(buildTieInDraftEpisodePayloadField(
      params.tieInDraftContext,
      e.sourceItem.episodeNumber
    )
      ? {
          productTieIn: buildTieInDraftEpisodePayloadField(
            params.tieInDraftContext,
            e.sourceItem.episodeNumber
          ),
        }
      : {}),
  }));

  const userPrompt = [
    `Series title: ${params.title}`,
    buildGenrePromptLine(params.genre, params.title),
    params.tone ? `Tone: ${params.tone}` : null,
    recapText,
    knownCharactersBlock,
    knownLocationsBlock,
    seasonLineageBlock,
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
    buildGenrePromptLine(params.genre, params.title),
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
    motionContractsEnabled?: boolean;
    /** Production-grade full-story generation — see `buildDeepDraftPrompts`'s own `knownLocations` doc comment; threaded straight through. */
    knownLocations?: Array<{
      locationKey: string;
      name: string;
      description?: string;
    }>;
    /** `planning/vd-character-identity-repair/plan.md` Phase 2.0 — see `buildDeepDraftPrompts`'s own `knownCharacters` doc comment; threaded straight through. */
    knownCharacters?: VdBibleRefinedCharacter[];
    /** Stage 2.4 — see `buildDeepDraftPrompts`'s own `seasonLineage` doc comment; threaded straight through. */
    seasonLineage?: VdSeasonLineageContext;
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
  /** Production-grade full-story generation, added 2026-07-13 — every NEW location this chunk's WINNING candidate (+ its revise rounds + missing-episode recovery) declared and the gate accepted, in declaration order. */
  newLocations: VdDeclaredLocation[];
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
    motionContractsEnabled?: boolean;
    /** Production-grade full-story generation — see `buildDeepDraftPrompts`'s own `knownLocations` doc comment; threaded to the fan-out candidates, the revise calls, and the deterministic completeness gate below. Mutated in place (append-only) as this chunk's OWN `new_locations` are accepted, so later revise rounds in this SAME chunk see them too. */
    knownLocations?: Array<{
      locationKey: string;
      name: string;
      description?: string;
    }>;
    /** Production-grade full-story generation — see `GenerateStoryBibleDeepParams.characterBibleNames`'s own doc comment; threaded to the deterministic completeness gate below. */
    characterBibleNames?: string[];
    /** `planning/vd-character-identity-repair/plan.md` Phase 2.0 — see `GenerateStoryBibleDeepParams.knownCharacters`'s own doc comment; threaded to the fan-out candidates (via `callPremiumFanoutCandidate`) and the missing-episode recovery retry below. */
    knownCharacters?: VdBibleRefinedCharacter[];
    /** Stage 2.4/2.4b — see `GenerateStoryBibleDeepParams.seasonLineage`'s own doc comment; threaded to the fan-out candidates, the judge/re-judge/revise calls (Stage 2.4b's `prior_season_continuity` dimension), and the missing-episode recovery retry below. */
    seasonLineage?: VdSeasonLineageContext;
  },
  callAccounting: PremiumCallAccounting
): Promise<PremiumChunkResult> {
  const characterBibleNameSet = params.characterBibleNames?.length
    ? new Set(params.characterBibleNames)
    : undefined;
  // Production-grade full-story generation — this chunk's OWN running known-
  // location roster, seeded from `params.knownLocations` (the run's roster as
  // of the START of this chunk) and grown in place as THIS chunk's candidates/
  // revise rounds accept new declarations — mirrors `generateStoryBibleDeep`'s
  // standard-mode `knownLocationKeySet`/`collectedNewLocations` pairing.
  const knownLocationKeySet = params.knownLocations
    ? new Set(params.knownLocations.map(l => l.locationKey))
    : undefined;
  let knownLocationsForPrompt = params.knownLocations
    ? [...params.knownLocations]
    : undefined;
  const chunkNewLocations: VdDeclaredLocation[] = [];
  const acceptChunkNewLocations = (
    newLocationsRaw: VdDeclaredLocation[]
  ): Set<string> => {
    const { acceptedKeys } = computeNewLocationDeclarationViolations(
      newLocationsRaw,
      knownLocationKeySet
    );
    const accepted = newLocationsRaw.filter(loc =>
      acceptedKeys.has(loc.location_key)
    );
    if (accepted.length > 0) {
      chunkNewLocations.push(...accepted);
      if (knownLocationKeySet) {
        for (const key of acceptedKeys) knownLocationKeySet.add(key);
      }
      knownLocationsForPrompt = knownLocationsForPrompt
        ? [
            ...knownLocationsForPrompt,
            ...accepted.map(loc => ({
              locationKey: loc.location_key,
              name: loc.name,
              description: loc.description,
            })),
          ]
        : undefined;
    }
    return acceptedKeys;
  };

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

  // 2. DETERMINISTIC GATES — no extra LLM call. Production-grade full-story
  // generation — ALSO validates each candidate's OWN `new_locations` against
  // the chunk's known roster (not yet mutated by any candidate — a losing
  // candidate's declarations must never pollute the shared roster; only the
  // WINNER's are accepted, below) and folds any violation into that
  // candidate's `gateViolationCount`.
  const gatedCandidates = fulfilled.map(({ index, data }) => {
    const candidateNewLocationsRaw = data.new_locations ?? [];
    const { violations: newLocationViolations, acceptedKeys } =
      computeNewLocationDeclarationViolations(
        candidateNewLocationsRaw,
        knownLocationKeySet
      );
    const combinedKnownKeys = knownLocationKeySet
      ? new Set([...knownLocationKeySet, ...acceptedKeys])
      : undefined;
    const episodes = gateRawPremiumEpisodes(data.episodeBreakdown, {
      characterBibleNames: characterBibleNameSet,
      knownLocationKeys: combinedKnownKeys,
    });
    const gateViolationCount =
      computePremiumGateViolationCount(episodes) +
      newLocationViolations.length;
    return {
      index,
      episodes,
      openThreads: data.open_threads ?? params.openThreads,
      gateViolationCount,
      newLocationsRaw: candidateNewLocationsRaw,
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
    seasonLineage: params.seasonLineage,
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

  // Production-grade full-story generation — accept ONLY the WINNING
  // candidate's `new_locations` into this chunk's shared known-location
  // roster (a losing candidate's declarations are discarded along with the
  // rest of its content).
  acceptChunkNewLocations(winner.newLocationsRaw);

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
        : worstCasePremiumScorecard(
            0,
            isEpisodeTieInPlaced(ep.episodeNumber),
            params.seasonLineage !== undefined
          ),
      localWarnings: ep.localWarnings,
      completenessViolations: ep.completenessViolations,
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
          !meetsPremiumDraftContractFloor(ep.shotDrafts)) ||
        // Production-grade full-story generation — an episode with a
        // surviving deterministic completeness violation (missing/unknown
        // character, invalid location_key) is ALWAYS revised, regardless of
        // its judged score.
        ep.completenessViolations.length > 0
    );
    if (belowFloor.length === 0) break; // stop early — every episode already passes floors.
    roundsUsed = round;

    const reviseEpisodesInput = belowFloor.map(ep => ({
      sourceItem: findPremiumSourceItem(params.chunkEpisodes, ep.episodeNumber),
      currentShotDrafts: ep.shotDrafts,
      currentCliffhangerLine: ep.cliffhanger_line,
      feedback: [
        composePremiumScoreFeedback(ep.draftScorecard),
        ep.completenessViolations.length > 0
          ? buildDeepDraftCompletenessRetryInstruction(
              ep.completenessViolations
            )
          : null,
      ]
        .filter((part): part is string => Boolean(part))
        .join(" "),
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
        knownLocations: knownLocationsForPrompt,
        knownCharacters: params.knownCharacters,
        seasonLineage: params.seasonLineage,
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

    // Production-grade full-story generation — accept this revise round's
    // own `new_locations` into the SAME shared roster (mutates
    // `knownLocationKeySet`/`knownLocationsForPrompt` in place) BEFORE
    // gating the revised episodes, so a location this round just declared
    // resolves as valid for its own shots.
    acceptChunkNewLocations(reviseResult.data.new_locations ?? []);
    const revisedGated = gateRawPremiumEpisodes(
      reviseResult.data.episodeBreakdown,
      { characterBibleNames: characterBibleNameSet, knownLocationKeys: knownLocationKeySet }
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
        seasonLineage: params.seasonLineage,
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
        : worstCasePremiumScorecard(
            round,
            isEpisodeTieInPlaced(revisedEp.episodeNumber),
            params.seasonLineage !== undefined
          );
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
        completenessViolations: revisedEp.completenessViolations,
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
        motionContractsEnabled: params.motionContractsEnabled,
        knownLocations: knownLocationsForPrompt,
        knownCharacters: params.knownCharacters,
        seasonLineage: params.seasonLineage,
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

      acceptChunkNewLocations(retryData.new_locations ?? []);
      const recoveredRaw = retryData.episodeBreakdown.filter(ep =>
        missingEpisodeNumbers.includes(ep.episodeNumber)
      );
      const recovered = gateRawPremiumEpisodes(recoveredRaw, {
        characterBibleNames: characterBibleNameSet,
        knownLocationKeys: knownLocationKeySet,
      });
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
            isEpisodeTieInPlaced(ep.episodeNumber),
            params.seasonLineage !== undefined
          ),
          localWarnings: ep.localWarnings,
          completenessViolations: ep.completenessViolations,
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
    newLocations: chunkNewLocations,
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
    // Bug fix (2026-07-11): this sweep's revise/rejudge calls previously
    // never received tie-in context at all — a tie-in-placed episode caught
    // by the season sweep silently lost its `tie_in` instruction during
    // revise and was never scored on `tie_in_naturalness` during rejudge.
    // Mirrors `runPremiumChunk`'s own `tieInDraftContext` plumbing exactly.
    tieInDraftContext?: VdTieInDraftContext;
    /** Production-grade full-story generation — see `buildDeepDraftPrompts`'s own `knownLocations` doc comment; threaded to the spot-revise call and its gate. */
    knownLocations?: Array<{
      locationKey: string;
      name: string;
      description?: string;
    }>;
    /** Production-grade full-story generation — see `GenerateStoryBibleDeepParams.characterBibleNames`'s own doc comment. */
    characterBibleNames?: string[];
    /** `planning/vd-character-identity-repair/plan.md` Phase 2.0 (added 2026-07-18) — see `GenerateStoryBibleDeepParams.knownCharacters`'s own doc comment; threaded to the spot-revise call below so the sweep's revise round ALSO gets the "CHARACTER BIBLE" FACT block — closing the gap where premium mode's default revise/sweep path (the mode picker's DEFAULT — see `VerticalDramaDeepStoryDraftsPanel.tsx`) was the one path still handing the model already-drifted names with no canonical anchor. */
    knownCharacters?: VdBibleRefinedCharacter[];
    /** Stage 2.4b — see `GenerateStoryBibleDeepParams.seasonLineage`'s own doc comment; threaded to the spot-revise/re-judge calls below so a sequel run's season sweep ALSO stays continuity-aware (and re-scores `prior_season_continuity`) for any episode it touches. */
    seasonLineage?: VdSeasonLineageContext;
  },
  callAccounting: PremiumCallAccounting
): Promise<{ issuesFound: number }> {
  const characterBibleNameSet = params.characterBibleNames?.length
    ? new Set(params.characterBibleNames)
    : undefined;
  const knownLocationKeySet = params.knownLocations
    ? new Set(params.knownLocations.map(l => l.locationKey))
    : undefined;
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
      tieInDraftContext: params.tieInDraftContext,
      knownLocations: params.knownLocations,
      knownCharacters: params.knownCharacters,
      seasonLineage: params.seasonLineage,
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

  // Production-grade full-story generation — a spot-revise CAN declare a new
  // location; accept it into the local known-key set before gating (this
  // sweep's own accepted new locations are NOT surfaced to the caller today —
  // they were already implicitly available from the run's earlier chunks, so
  // this is best-effort validation only, not a second `newLocations` source).
  if (knownLocationKeySet && reviseResult.data.new_locations) {
    const { acceptedKeys } = computeNewLocationDeclarationViolations(
      reviseResult.data.new_locations,
      knownLocationKeySet
    );
    for (const key of acceptedKeys) knownLocationKeySet.add(key);
  }
  const revisedGated = gateRawPremiumEpisodes(
    reviseResult.data.episodeBreakdown,
    { characterBibleNames: characterBibleNameSet, knownLocationKeys: knownLocationKeySet }
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
        hasPlannedTieIn: params.tieInDraftContext
          ? findTieInDraftPlacement(params.tieInDraftContext, ep.episodeNumber)
              ?.planned === true
          : undefined,
      })),
      seasonLineage: params.seasonLineage,
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
      : worstCasePremiumScorecard(
          VD_PREMIUM_DRAFT_SWEEP_ROUND,
          undefined,
          params.seasonLineage !== undefined
        );
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
      completenessViolations: revisedEp.completenessViolations,
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
      newLocations: [],
    };
  }

  // Resilient resume (added 2026-07-14, `planning/vertical-drama-deep-story-
  // resilient-resume/plan.md`) — mirrors `generateStoryBibleDeep`'s (standard
  // mode) identical resume/skip block above: remove any episode the caller
  // already knows is drafted (resumed checkpoint and/or already-drafted
  // bible state) from the set THIS run will actually process — it gets no
  // chunk, no `runPremiumChunk` call, and no credit deduction.
  // `resumedDraftedItems` is unioned back onto the result at the very end
  // (after `finalStates` is built) rather than seeded into a growing
  // accumulator like standard mode, since premium mode's own accumulator
  // (`allDraftedByEpisode`) also drives the season sweep/`premiumMetrics`,
  // which must stay scoped to episodes THIS run actually (re)drafted — a
  // resumed episode was already swept in whatever earlier run produced it.
  // Both fields are additive/optional: omitting them makes
  // `episodesToProcess`/`resumedDraftedItems` byte-identical to `episodes`/
  // `[]`, i.e. this whole block is a no-op for every caller that predates
  // this feature.
  const alreadyDraftedEpisodeSet = new Set(
    params.alreadyDraftedEpisodeNumbers ?? []
  );
  const episodesToProcess = alreadyDraftedEpisodeSet.size
    ? episodes.filter(ep => !alreadyDraftedEpisodeSet.has(ep.episodeNumber))
    : episodes;
  const resumedDraftedItems = params.resumeDraftedItems ?? [];

  if (episodesToProcess.length === 0) {
    // Every requested episode was already drafted (full resume) — nothing
    // left to draft this run. Return the resumed items as the complete,
    // honest result (no chunks run, no credits spent, no sweep).
    return {
      draftedItems: resumedDraftedItems,
      chunkSizes: [],
      partial: false,
      creditsUsed: 0,
      model: "",
      warnings: [],
      finalOpenThreads: params.priorRecap?.openThreads ?? [],
      premiumMetrics: {
        mode: "premium",
        candidateCount: VD_PREMIUM_DRAFT_CANDIDATE_COUNT,
        roundsUsedPerChunk: [],
        firstPassGatePassRate: 0,
        episodesBelowFloorAfter: 0,
        sweepIssuesFound: 0,
        callsMade: 0,
      },
      missingEpisodes: [],
      newLocations: [],
    };
  }

  const chunkSizes = computePremiumDeepDraftChunkSizes(episodesToProcess.length);
  const totalEstimate =
    estimatePremiumDeepDraftCalls(chunkSizes.length) *
    VD_DEEP_DRAFT_PER_CALL_CREDIT_ESTIMATE;
  const hasCredits = await hasEnoughCredits(params.userId, totalEstimate);
  if (!hasCredits) {
    throw new InsufficientCreditsError();
  }

  // Keep candidate, judge, revise, re-judge, and continuity-sweep calls on
  // the model the user pinned for this series. The deep-draft selector is
  // used only when no series-wide model policy is set.
  const model = await resolveVerticalDramaSeriesModel(
    params.seriesId,
    resolveDeepStoryDraftModel,
  );
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

  // Production-grade full-story generation, added 2026-07-13 — see
  // `generateStoryBibleDeep`'s (standard mode) identical setup; grows across
  // this run's own chunks as each `runPremiumChunk` call's `newLocations` are
  // accepted, so a later chunk sees an earlier chunk's declarations too.
  let knownLocationsForPrompt = params.existingLocations
    ? [...params.existingLocations]
    : undefined;
  const collectedNewLocations: VdDeclaredLocation[] = [];

  const callAccounting: PremiumCallAccounting = {
    addCredits: amount => {
      totalCreditsUsed += amount;
    },
    addCall: () => {
      callsMade += 1;
    },
  };

  // Resilient resume — shared by the per-chunk `onChunkComplete` hook below
  // AND the finalization step further down (`finalStates.map(...)`), so both
  // read the SAME `PremiumEpisodeState` -> `DeepDraftedEpisodeItem` mapping.
  const premiumStateToDraftedItem = (
    state: PremiumEpisodeState
  ): DeepDraftedEpisodeItem => ({
    episodeNumber: state.episodeNumber,
    shotDrafts: state.shotDrafts,
    cliffhanger_line: state.cliffhanger_line,
    draftCompleteness: state.draftCompleteness,
    draftScorecard: state.draftScorecard,
    ...extractDramaturgyStructureFields(state),
  });

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

    // Production-grade full-story generation — grow the running known-
    // location roster with THIS chunk's accepted `new_locations` so the NEXT
    // chunk (which reads `knownLocationsForPrompt` when it's built below)
    // can reuse them.
    if (chunkResult.newLocations.length > 0) {
      collectedNewLocations.push(...chunkResult.newLocations);
      knownLocationsForPrompt = knownLocationsForPrompt
        ? [
            ...knownLocationsForPrompt,
            ...chunkResult.newLocations.map(loc => ({
              locationKey: loc.location_key,
              name: loc.name,
              description: loc.description,
            })),
          ]
        : undefined;
    }

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
    const chunkEpisodes = episodesToProcess.slice(cursor, cursor + size);
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
          knownLocations: knownLocationsForPrompt,
          characterBibleNames: params.characterBibleNames,
          knownCharacters: params.knownCharacters,
          seasonLineage: params.seasonLineage,
        },
        callAccounting
      );

      if (!applyChunkResult(chunkResult, chunkEpisodes)) {
        // Stop here — same "never let a later chunk push horizonEndEpisode
        // past an actual gap" reasoning as standard mode's loop.
        break;
      }
      // Resilient resume — fire-and-forget checkpoint hook, THIS chunk's
      // items only (never the resumed ones), fired only after a SUCCESSFUL
      // `applyChunkResult` (never for the missing-episode/failing branch).
      // Mirrors standard mode's identical `onChunkComplete` call.
      params.onChunkComplete?.(
        chunkResult.episodeStates.map(premiumStateToDraftedItem)
      );
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
                knownLocations: knownLocationsForPrompt,
                characterBibleNames: params.characterBibleNames,
                knownCharacters: params.knownCharacters,
                seasonLineage: params.seasonLineage,
              },
              callAccounting
            );
            if (!applyChunkResult(singleResult, [singleEpisode])) {
              splitFailure = new Error(failureMessage);
              break;
            }
            // Resilient resume — same per-chunk checkpoint hook as the main
            // fan-out call site above, for the split-retry (per-episode)
            // path.
            params.onChunkComplete?.(
              singleResult.episodeStates.map(premiumStateToDraftedItem)
            );
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
        allEpisodes: episodesToProcess,
        byEpisode: allDraftedByEpisode,
        tieInDraftContext: params.tieInDraftContext,
        knownLocations: knownLocationsForPrompt,
        characterBibleNames: params.characterBibleNames,
        knownCharacters: params.knownCharacters,
        seasonLineage: params.seasonLineage,
      },
      callAccounting
    );
    sweepIssuesFound = sweepOutcome.issuesFound;
  }

  const finalStates = [...allDraftedByEpisode.values()].sort(
    (a, b) => a.episodeNumber - b.episodeNumber
  );
  const newlyDraftedItems: DeepDraftedEpisodeItem[] = finalStates.map(
    premiumStateToDraftedItem
  );

  // Resilient resume — union the resumed (already-drafted-in-a-prior-run)
  // episodes back onto this run's freshly-drafted items, so the FINAL result
  // is the full (resumed + new) set — same contract as standard mode's
  // `GenerateStoryBibleDeepResult.draftedItems`. Deduped by `episodeNumber`
  // (newly-drafted wins on any collision, though by construction the two
  // sets never actually overlap — a resumed episode number was excluded
  // from `episodesToProcess` above, so `allDraftedByEpisode`/`finalStates`
  // can never contain one), sorted ascending.
  const draftedByEpisodeNumber = new Map<number, DeepDraftedEpisodeItem>();
  for (const item of resumedDraftedItems) {
    draftedByEpisodeNumber.set(item.episodeNumber, item);
  }
  for (const item of newlyDraftedItems) {
    draftedByEpisodeNumber.set(item.episodeNumber, item);
  }
  const draftedItems: DeepDraftedEpisodeItem[] = [
    ...draftedByEpisodeNumber.values(),
  ].sort((a, b) => a.episodeNumber - b.episodeNumber);
  const warnings = [
    ...finalStates.flatMap(state => state.localWarnings),
    // Production-grade full-story generation — surviving per-episode
    // completeness violations (missing/unknown character, invalid
    // location_key) surface as `"shot_completeness_violation"` warnings,
    // mirroring standard mode's identical conversion.
    ...finalStates.flatMap(state =>
      state.completenessViolations.map(violation => ({
        episodeNumber: violation.episodeNumber,
        shotNumber: violation.shotNumber,
        reason: "shot_completeness_violation" as const,
      }))
    ),
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

  // Production-grade full-story generation — final dedupe safety net, same
  // as `generateStoryBibleDeep`'s (standard mode) identical step.
  const dedupedNewLocations: VdDeclaredLocation[] = [];
  const seenNewLocationKeys = new Set<string>();
  for (const loc of collectedNewLocations) {
    if (seenNewLocationKeys.has(loc.location_key)) continue;
    seenNewLocationKeys.add(loc.location_key);
    dedupedNewLocations.push(loc);
  }

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
    newLocations: dedupedNewLocations,
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

/* -------------------------------------------------------------------------- */
/* Manual shot-summary edits — series Overview per-shot "เรื่องย่อช็อต"       */
/* correction (added 2026-07-22,                                              */
/* `planning/vd-edit-episode-synopsis/plan.md` Phase 2).                     */
/*                                                                            */
/* Lets the user fix ONE deep-drafted shot's `summary` heading text ("ช็อต N  */
/* — <summary>") AT THE SOURCE (the series' active breakdown item), mirroring */
/* `applyManualDialogueEdit`/`manualDialogueEditStampSchema`/                */
/* `readItemManualDialogueEdit` immediately above 1:1 — same stamp shape,    */
/* same tolerant-reader convention, and the SAME "edit the ACTIVE breakdown  */
/* version's item IN PLACE" persistence decision documented in that          */
/* section's own "PERSISTENCE DECISION" comment above (the identical         */
/* justification applies verbatim here: a summary-text correction is a       */
/* typo/line-level fix to already-produced content, not a re-plan, so it is  */
/* exempt from the append-only breakdown-versions discipline the same way a  */
/* dialogue-line fix is).                                                    */
/*                                                                            */
/* Only `summary` changes — `dialogue_lines`, `silence_intent`, `characters`, */
/* `location_key`, `contract`, `tie_in`, and the item's `draftCompleteness`  */
/* (derived from dialogue only, per `computeDraftCompleteness` — a summary   */
/* edit never affects it) are all left untouched, carried over via the same  */
/* shallow-spread-only discipline this file uses throughout.                 */
/* -------------------------------------------------------------------------- */

const manualShotSummaryEditStampSchema = z
  .object({
    editedAt: z.string().min(1),
    editedByUserId: z.number().int().positive(),
    shotNumbers: z.array(
      z.number().int().min(1).max(VD_DEEP_DRAFT_SHOTS_PER_EPISODE)
    ),
    /** Idempotency replay guard — mirrors `manualDialogueEditStampSchema.appliedIdempotencyKeys`'s own doc comment exactly, scoped to the `summary` half of `updateEpisodeDraftShot` instead. */
    appliedIdempotencyKeys: z.array(z.string()).optional(),
  })
  .passthrough();

export type VdManualSummaryEditStamp = z.infer<
  typeof manualShotSummaryEditStampSchema
>;

/**
 * Tolerant read of a stored breakdown item's `manualSummaryEdit` — mirrors
 * `readItemManualDialogueEdit`'s exact "never throw, `null` when absent or
 * malformed" shape.
 */
export function readItemManualSummaryEdit(
  item: StoredEpisodeBreakdownItem
): VdManualSummaryEditStamp | null {
  const raw = (item as { manualSummaryEdit?: unknown }).manualSummaryEdit;
  if (raw === undefined) return null;
  const parsed = manualShotSummaryEditStampSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

/** Thrown by `applyManualShotSummaryEdit` when `item` has no `shotDrafts` at all, or none matching the requested `shotNumber`. The router maps this to `TRPCError({ code: "NOT_FOUND" })`, reusing this error's own message verbatim — mirrors `ManualDialogueEditNoDraftError` exactly. */
export class ManualShotSummaryEditNoDraftError extends Error {
  code = "VD_MANUAL_SHOT_SUMMARY_EDIT_NO_DRAFT" as const;
  constructor() {
    super("ไม่มีร่างสำหรับตอน/ช็อตนี้");
    this.name = "ManualShotSummaryEditNoDraftError";
  }
}

export interface ApplyManualShotSummaryEditInput {
  /** The ACTIVE breakdown item carrying the target shot (already resolved by the caller — this function never scans `bible`). */
  item: StoredEpisodeBreakdownItem;
  shotNumber: number;
  /** REPLACES the shot's `summary` verbatim. */
  summary: string;
  editedByUserId: number;
  /** Overridable for deterministic tests; defaults to `new Date().toISOString()`. */
  editedAt?: string;
  /**
   * Recorded into `manualSummaryEdit.appliedIdempotencyKeys` (accumulated)
   * when provided. The router calls this function ONLY on a fresh
   * (non-replay, non-no-op) edit — mirrors
   * `ApplyManualDialogueEditInput.idempotencyKey`'s own doc comment.
   */
  idempotencyKey?: string;
}

export interface ApplyManualShotSummaryEditResult {
  item: StoredEpisodeBreakdownItem;
}

/**
 * Pure (DB-free) core of the `summary` half of `updateEpisodeDraftShot`
 * (`verticalDramaSeries.ts` — a combined summary+dialogue edit; this
 * function only ever handles the summary side, `applyManualDialogueEdit`
 * above handles the dialogue side): REPLACES shot `shotNumber`'s `summary`
 * text only. Every other shot field (`dialogue_lines`, `silence_intent`,
 * `characters`, `location_key`, `contract`, `tie_in`) survives via a
 * shallow spread, and the item's `draftCompleteness` is left completely
 * untouched (it is derived from dialogue only — see this section's own
 * header doc comment). Stamps `manualSummaryEdit` with the accumulated,
 * deduped, ascending set of every shot number ever manually summary-edited
 * on this item (`editedAt`/`editedByUserId` reflect only the MOST RECENT
 * edit) — mirrors `applyManualDialogueEdit`'s own stamp accounting exactly.
 *
 * Throws `ManualShotSummaryEditNoDraftError` when `item` has no
 * `shotDrafts` at all, or none matching `shotNumber`. Never mutates `item`.
 */
export function applyManualShotSummaryEdit(
  input: ApplyManualShotSummaryEditInput
): ApplyManualShotSummaryEditResult {
  const shotDrafts = readItemShotDrafts(input.item);
  const shotIndex =
    shotDrafts?.findIndex(shot => shot.shot_number === input.shotNumber) ?? -1;
  if (!shotDrafts || shotIndex === -1) {
    throw new ManualShotSummaryEditNoDraftError();
  }

  const currentShot = shotDrafts[shotIndex];
  const updatedShot: VdDeepDraftShotDraft = {
    ...currentShot,
    summary: input.summary,
  };

  const updatedShotDrafts = [...shotDrafts];
  updatedShotDrafts[shotIndex] = updatedShot;

  const priorStamp = readItemManualSummaryEdit(input.item);
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

  const manualSummaryEdit: VdManualSummaryEditStamp = {
    editedAt: input.editedAt ?? new Date().toISOString(),
    editedByUserId: input.editedByUserId,
    shotNumbers,
    ...(appliedIdempotencyKeys ? { appliedIdempotencyKeys } : {}),
  };

  // NOTE: `draftCompleteness` is intentionally NOT recomputed/touched here
  // (unlike `applyManualDialogueEdit`) — it is derived from dialogue only,
  // and a summary edit never changes dialogue. Whatever value was already
  // on `input.item` survives via the spread below, byte-identical.
  const updatedItem = {
    ...input.item,
    shotDrafts: updatedShotDrafts,
    manualSummaryEdit,
  } as StoredEpisodeBreakdownItem;

  return { item: updatedItem };
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
  return readBibleRefinedCharacterProfiles(bible).map(c => ({ name: c.name }));
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
        detail: `${character.name} ปรากฏตัวมีน้ำหนักครั้งแรกในตอนย่อยที่ ${firstAppearance} จาก ${totalEpisodes} ตอนย่อย (ช้ากว่าเกณฑ์ตอนย่อยที่ ${effectiveLateIntroThreshold})`,
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
        decisionsBeforeFinale <
          profile!.dramaturgy.agencyMinDecisionsBeforeFinale
      : speakingEpisodes.length > 0 && totalDecisions === 0;
    if (agencyFires) {
      findings.push({
        kind: "character_agency_zero_decisions",
        evidenceEpisodes: speakingEpisodes,
        detail: `${character.name} ปรากฏตัว ${speakingEpisodes.length} ตอนย่อย แต่ไม่เคยมีการตัดสินใจของตัวเองเลยตลอดซีซั่น`,
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
              detail: `ตัวร้ายใช้กลวิธี "${tag}" ซ้ำติดต่อกัน ${evidence.length} ตอนย่อย (ตอนย่อยที่ ${runStart}-${runEnd})`,
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
        detail: `ตอนจบ (ตอนย่อยที่ ${finaleEpisodeNumber}) ไม่มีการระบุ "ราคาที่ต้องจ่าย" ของการคลี่คลายเรื่อง`,
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
          detail: `บทพูดพูดถึงกติกา/พลังของโลกเรื่องนี้ใน ${episodesWithRuleWords.size} ตอนย่อย แต่ยังไม่เคยกำหนด world_rules ให้ชัดเจน`,
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
        detail: `ตอนย่อยที่วางแผนใส่สินค้าอยู่ติดกันเกินไป (ตอนย่อยที่ ${evidence.join(", ")}) ควรกระจายให้ห่างกันมากกว่านี้ตามแผนการกระจายสินค้าของซีซั่น`,
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
        detail: `ตอนย่อยที่ ${evidence.join(", ")} มีแผนใส่สินค้าตามแผนซีซั่น แต่ร่างช็อตยังไม่ได้ระบุช็อตที่มีสินค้าอย่างชัดเจน`,
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
