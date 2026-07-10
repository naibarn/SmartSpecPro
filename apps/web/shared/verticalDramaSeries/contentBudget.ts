/**
 * Vertical Drama Series — episode content budget, per-shot speech budgets,
 * and cross-episode arc-drift/re-plan contracts (spec §7.7, added
 * 2026-07-07; section-13-story-dialogue-density-reform).
 *
 * Pure, deterministic, provider-free contracts + helpers — no server/db
 * imports, safe for both client and server. Every rate/ratio constant is
 * IMPORTED from `./dialogueQuality` (the ONE canonical speech-budget module,
 * spec §7.7.1) — this file never re-declares a speech rate or coverage
 * ratio; introducing a second one is a review-blocking defect per spec.
 */

import { z } from "zod";
import type { VerticalDramaSeriesLocale } from "./contracts";
import {
  MIN_CLIP_COVERAGE_RATIO,
  MIN_EPISODE_COVERAGE_RATIO,
  targetVerticalDramaSpeechSeconds,
} from "./dialogueQuality";
// Task #31 (tie-in defer -> real arc re-plan proposal, added 2026-07-09) —
// reuses task #23's format-profile tie-in budget proration
// (`resolveTieInEpisodeBudget`) as the ONE canonical source for "how many
// episodes out of `plannedCount` may carry a tie-in" — never re-derives the
// `ceil(perTenCap * plannedCount / 10)` formula here.
import {
  resolveTieInEpisodeBudget,
  resolveVerticalDramaFormatProfile,
  type VerticalDramaFormatProfile,
} from "./formatProfiles";
// Feature 132 §5 (F132B, ledgers-and-story-state) — the versioned quality
// ledgers persisted per breakdown version. Imported directly from the
// submodule (not a barrel) to avoid a cycle; `qualityLedgers.ts` has no
// dependency on this file.
import {
  verticalDramaQualityLedgersSchema,
  type VerticalDramaQualityLedgers,
} from "./qualityLedgers";

/* -------------------------------------------------------------------------- */
/* Episode content budget (spec §7.7.2 Layer 1)                               */
/* -------------------------------------------------------------------------- */

/** Escalation-curve position across the season, 1 (calmest) to 5 (peak). */
export type VerticalDramaConflictLevel = 1 | 2 | 3 | 4 | 5;

export const verticalDramaConflictLevelSchema = z.union([
  z.literal(1),
  z.literal(2),
  z.literal(3),
  z.literal(4),
  z.literal(5),
]);

/**
 * Per-episode content budget that must be CONCEIVED at series-bible stage
 * (spec §7.7.2 Layer 1) so an episode carries enough narrative material for
 * its speech target, instead of being padded after the fact.
 */
export type VerticalDramaEpisodeContentBudget = {
  /** Default 5-7 per 60s episode. */
  beatCount: number;
  /** Must satisfy `MIN_EPISODE_COVERAGE_RATIO` for the episode's target duration. */
  estimatedSpeechSeconds: number;
  conflictLevel: VerticalDramaConflictLevel;
  /** Default >= 2 (Phase 3B reversal grammar). */
  reversalTarget: number;
  /** Season threads this episode advances. */
  arcThreads: string[];
};

/** Superset-friendly — this budget is persisted inside the series bible JSONB. */
export const verticalDramaEpisodeContentBudgetSchema = z
  .object({
    beatCount: z.number().int().positive(),
    estimatedSpeechSeconds: z.number().nonnegative(),
    conflictLevel: verticalDramaConflictLevelSchema,
    reversalTarget: z.number().int().nonnegative(),
    arcThreads: z.array(z.string().min(1)),
  })
  .passthrough();

/**
 * Season-level per-episode product tie-in placement decision (task #31,
 * spec §7.7.2/§7.7.3, added 2026-07-09). Elevates "does this episode carry
 * a product tie-in" from a purely REACTIVE signal (today: whatever the LLM
 * happened to place in the script, scored after the fact by
 * `evaluateFatigue` in `verticalDramaProductTieIn.ts`) to a first-class,
 * PLANNED field on the season breakdown — the root-cause fix behind
 * `deferEpisodeTieIn` gaining a real `arc_replan_proposal` instead of only
 * a `scheduleAtRisk` boolean (see `proposeTieInDeferReplan` below).
 */
export type VerticalDramaEpisodeTieInPlacement = {
  /** `true` = this episode is planned to carry a tie-in placement. */
  planned: boolean;
  /** Depth of on-screen presence; defaults to `"light"` when omitted. */
  intensity?: "light" | "featured";
  /** The benefit/talking-point this episode's placement should foreground. */
  benefitFocus?: string;
  /** How this placement decision came to be. */
  source: "planned" | "deferred" | "manual";
  /**
   * Present iff `source === "deferred"` — the episode this placement was
   * moved FROM by `proposeTieInDeferReplan`/`deferEpisodeTieIn`.
   */
  movedFromEpisodeNumber?: number;
};

export const verticalDramaEpisodeTieInPlacementSchema = z
  .object({
    planned: z.boolean(),
    intensity: z.enum(["light", "featured"]).optional(),
    benefitFocus: z.string().min(1).optional(),
    source: z.enum(["planned", "deferred", "manual"]),
    movedFromEpisodeNumber: z.number().int().positive().optional(),
  })
  .passthrough();

/**
 * `episodeBreakdown[]` item shape, extended with `contentBudget` (spec
 * §7.7.2 Layer 1). Mirrors the shipped fields in
 * `server/services/verticalDramaStoryBible.ts`'s `episodeBreakdownItemSchema`
 * exactly (episodeNumber/workingTitle/logline/keyBeats) — this shared module
 * does not import that server-only file (no server imports allowed here), so
 * the shape is intentionally kept identical rather than re-exported.
 * `contentBudget` is REQUIRED on the canonical type (every NEW item must
 * carry one), but legacy stored items predate this field — see
 * `verticalDramaEpisodeBreakdownItemSchema` below and
 * `deriveDefaultContentBudget` for the read-time-default path (spec §7.7.2
 * hard rule 6: legacy rows are never silently mutated).
 */
export type VerticalDramaEpisodeBreakdownItem = {
  episodeNumber: number;
  workingTitle: string;
  logline: string;
  keyBeats: string[];
  contentBudget: VerticalDramaEpisodeContentBudget;
  /**
   * Season-level product tie-in placement decision for this episode (task
   * #31, spec §7.7.2/§7.7.3, added 2026-07-09) — OPTIONAL and additive:
   * absent on every item persisted before this field existed (spec §7.7.2
   * hard rule 6 grandfather rule applies identically to `contentBudget`
   * above). When present, this is a FIRST-CLASS planning decision
   * (`planned: true/false`), not merely a byproduct of what the episode's
   * script happened to contain — see `VerticalDramaEpisodeTieInPlacement`.
   */
  tieIn?: VerticalDramaEpisodeTieInPlacement;
};

/**
 * Tolerant/superset parse of a breakdown item: `contentBudget` is OPTIONAL
 * here (unlike the canonical TS type) so legacy stored items — persisted
 * before this field existed — still parse without mutation or a migration
 * (spec §7.7.2 hard rule 6).
 */
export const verticalDramaEpisodeBreakdownItemSchema = z
  .object({
    episodeNumber: z.number().int().positive(),
    workingTitle: z.string().min(1),
    logline: z.string().min(1),
    keyBeats: z.array(z.string().min(1)).min(1),
    contentBudget: verticalDramaEpisodeContentBudgetSchema.optional(),
    tieIn: verticalDramaEpisodeTieInPlacementSchema.optional(),
  })
  .passthrough();

/* -------------------------------------------------------------------------- */
/* Per-shot speech budget (spec §7.7.2 Layer 3)                                */
/* -------------------------------------------------------------------------- */

export const VERTICAL_DRAMA_SILENCE_INTENTS = [
  "dramatic_pause",
  "action_visual",
  "montage",
  "establishing",
] as const;

export type VerticalDramaSilenceIntent =
  (typeof VERTICAL_DRAMA_SILENCE_INTENTS)[number];

/**
 * Explicit per-shot speech budget replacing today's positional/proportional
 * guess (spec §7.7.2 Layer 3). `sourceBeatIndexes` is the persisted
 * shot->beat attribution so dialogue, repair, and QC can attribute lines to
 * shots deterministically.
 */
export type VerticalDramaPerShotSpeechBudget = {
  shotNumber: number;
  clipDurationSeconds: number;
  /** `targetVerticalDramaSpeechSeconds(clipDurationSeconds)`. */
  targetSpeechSeconds: number;
  /** `MIN_CLIP_COVERAGE_RATIO * clipDurationSeconds`. */
  minSpeechSeconds: number;
  sourceBeatIndexes: number[];
  silenceIntent?: VerticalDramaSilenceIntent;
};

export const verticalDramaPerShotSpeechBudgetSchema = z
  .object({
    shotNumber: z.number().int().positive(),
    clipDurationSeconds: z.number().positive(),
    targetSpeechSeconds: z.number().nonnegative(),
    minSpeechSeconds: z.number().nonnegative(),
    sourceBeatIndexes: z.array(z.number().int().nonnegative()),
    silenceIntent: z.enum(VERTICAL_DRAMA_SILENCE_INTENTS).optional(),
  })
  .passthrough();

/* -------------------------------------------------------------------------- */
/* Breakdown versioning (spec §7.7.2/§7.7.3; pinned section-02)               */
/* -------------------------------------------------------------------------- */

export type VerticalDramaBreakdownVersionSource =
  | "generate_story"
  | "arc_replan"
  | "improve_script";

/** Append-only — a new version is added, never edited in place (spec §7.7.3). */
export type VerticalDramaBreakdownVersion = {
  versionId: string;
  createdAt: string;
  createdByUserId: number;
  source: VerticalDramaBreakdownVersionSource;
  items: VerticalDramaEpisodeBreakdownItem[];
  /**
   * Feature 132 §5 (F132B, ledgers-and-story-state) — the seven quality
   * ledgers as they stood after this version's `ledger_plan`/reconcile step.
   * OPTIONAL/additive: absent for every version that predates F132B or was
   * produced with the `verticalDramaQualityLedgers` flag off (spec §16:
   * "flag-off must be byte-identical to current behavior").
   */
  ledgers?: VerticalDramaQualityLedgers;
};

export const verticalDramaBreakdownVersionSchema = z
  .object({
    versionId: z.string().min(1),
    createdAt: z.string().min(1),
    createdByUserId: z.number().int().positive(),
    source: z.enum(["generate_story", "arc_replan", "improve_script"]),
    items: z.array(verticalDramaEpisodeBreakdownItemSchema).min(1),
    /** Feature 132 §5 (F132B) — see `VerticalDramaBreakdownVersion.ledgers`'s own doc comment. */
    ledgers: verticalDramaQualityLedgersSchema.optional(),
  })
  .passthrough();

/* -------------------------------------------------------------------------- */
/* Arc drift + re-plan (spec §7.7.3)                                          */
/* -------------------------------------------------------------------------- */

export const VERTICAL_DRAMA_ARC_DRIFT_REASON_CODES = [
  "VD_ARC_BEATS_CONSUMED_EARLY",
  "VD_ARC_HOOK_RESOLVED_EARLY",
  "VD_ARC_HOOK_UNPLANNED",
  "VD_ARC_CONTENT_BUDGET_EXCEEDED",
  "VD_ARC_ESCALATION_ORDER_BROKEN",
  // Task #31 (added 2026-07-09) — DELIBERATE, not detected: every code above
  // fires from `detectArcDrift`'s deterministic scan of a just-approved
  // script against the active breakdown. `VD_ARC_TIE_IN_DEFERRED` instead
  // marks a proposal the USER triggered directly via `deferEpisodeTieIn`
  // (moving a planned tie-in placement to a future episode) — see
  // `proposeTieInDeferReplan` below and `applyApprovedArcReplan`'s guard in
  // `verticalDramaArcReplan.ts`, which requires every `proposedBreakdown`
  // item on a proposal carrying this code to be byte-identical to the
  // active version except for `tieIn`.
  "VD_ARC_TIE_IN_DEFERRED",
] as const;

export type VerticalDramaArcDriftReasonCode =
  (typeof VERTICAL_DRAMA_ARC_DRIFT_REASON_CODES)[number];

/**
 * A proposed forward re-plan of the episode breakdown (spec §7.7.3). Faces
 * FORWARD (future, non-produced episodes only) — the retcon-review mirror
 * that faces backward. Approval appends a new `VerticalDramaBreakdownVersion`
 * and moves `activeBreakdownVersionId`; produced episodes are never rewritten.
 */
export type VerticalDramaArcReplanProposal = {
  proposalId: string;
  seriesId: string;
  triggeredByEpisodeNumber: number;
  driftReasons: VerticalDramaArcDriftReasonCode[];
  affectedEpisodeNumbers: number[];
  proposedBreakdown: VerticalDramaEpisodeBreakdownItem[];
  rationale: string;
  status: "proposed" | "approved" | "rejected";
};

export const verticalDramaArcReplanProposalSchema = z
  .object({
    proposalId: z.string().min(1),
    seriesId: z.string().min(1),
    triggeredByEpisodeNumber: z.number().int().positive(),
    driftReasons: z.array(z.enum(VERTICAL_DRAMA_ARC_DRIFT_REASON_CODES)).min(1),
    affectedEpisodeNumbers: z.array(z.number().int().positive()),
    proposedBreakdown: z.array(verticalDramaEpisodeBreakdownItemSchema).min(1),
    rationale: z.string().min(1),
    status: z.enum(["proposed", "approved", "rejected"]),
  })
  .passthrough();

/* -------------------------------------------------------------------------- */
/* Pure helpers                                                               */
/* -------------------------------------------------------------------------- */

export type DerivePerShotSpeechBudgetsOptions = {
  /** shotNumber (1-based) -> persisted beat attribution. Defaults to `[]`. */
  sourceBeatIndexesByShot?: Record<number, number[]>;
  /** shotNumber (1-based) -> explicit visual-only intent. */
  silenceIntentByShot?: Record<number, VerticalDramaSilenceIntent>;
};

/**
 * Derives an explicit per-shot speech budget for every clip duration in
 * order (spec §7.7.2 Layer 3), e.g. the default duration profile's
 * `[8, 8, 8, 8, 8, 8, 8, 4]` clip durations. `shotNumber` is the 1-based
 * position in `clipDurations`. Uses ONLY the canonical
 * `targetVerticalDramaSpeechSeconds` function and `MIN_CLIP_COVERAGE_RATIO`
 * constant from `./dialogueQuality` — never re-declares either rate.
 */
export function derivePerShotSpeechBudgets(
  clipDurations: number[],
  opts: DerivePerShotSpeechBudgetsOptions = {}
): VerticalDramaPerShotSpeechBudget[] {
  return clipDurations.map((rawClipDurationSeconds, index) => {
    const shotNumber = index + 1;
    const clipDurationSeconds = Math.max(0, rawClipDurationSeconds);
    const silenceIntent = opts.silenceIntentByShot?.[shotNumber];

    const budget: VerticalDramaPerShotSpeechBudget = {
      shotNumber,
      clipDurationSeconds,
      targetSpeechSeconds:
        targetVerticalDramaSpeechSeconds(clipDurationSeconds),
      minSpeechSeconds: MIN_CLIP_COVERAGE_RATIO * clipDurationSeconds,
      sourceBeatIndexes: opts.sourceBeatIndexesByShot?.[shotNumber] ?? [],
    };

    return silenceIntent ? { ...budget, silenceIntent } : budget;
  });
}

/**
 * Read-time-only default content budget for a LEGACY episode-breakdown item
 * that predates `contentBudget` (spec §7.7.2 hard rule 6) — never persisted
 * by this function and never mutates a stored breakdown. `beatCount` and
 * `reversalTarget` are the fixed spec defaults for the product's current
 * fixed 60-second episode duration; `estimatedSpeechSeconds` is the only
 * duration-scaled field, computed from the canonical
 * `MIN_EPISODE_COVERAGE_RATIO` floor (imported from `dialogueQuality.ts` —
 * never re-declared). `conflictLevel` defaults to the escalation curve's
 * midpoint since a standalone legacy item carries no season-position
 * context to derive a real curve position from.
 *
 * `locale` is accepted for forward-compatible parity with locale-aware call
 * sites (a legacy series' locale is known at the call site, e.g.
 * `verticalDramaStoryBible.ts`); the formula itself is duration-only and
 * currently does not branch on locale (there is no locale-specific pacing
 * rule in spec §7.7 — `estimatedSpeechSeconds` here is a duration-based
 * floor in seconds, not a text-derived character/word count).
 */
export function deriveDefaultContentBudget(
  targetDurationSeconds: number,
  locale?: VerticalDramaSeriesLocale
): VerticalDramaEpisodeContentBudget {
  void locale;
  const durationSeconds = Math.max(0, targetDurationSeconds);

  return {
    beatCount: 6,
    estimatedSpeechSeconds: Math.ceil(
      MIN_EPISODE_COVERAGE_RATIO * durationSeconds
    ),
    conflictLevel: 3,
    reversalTarget: 2,
    arcThreads: [],
  };
}

/* -------------------------------------------------------------------------- */
/* Season tie-in placement planning (task #31, spec §7.7.2/§7.7.3, added      */
/* 2026-07-09) — pure, deterministic, provider-free. See                     */
/* `VerticalDramaEpisodeTieInPlacement`'s doc comment for the "why" (elevates */
/* tie-in placement from a reactive-only signal to a first-class season      */
/* plan field).                                                              */
/* -------------------------------------------------------------------------- */

/**
 * Mirrors `VERTICAL_DRAMA_TIE_IN_FATIGUE_WINDOW` (`server/services/
 * verticalDramaProductTieIn.ts`, value `10`) — duplicated here (not
 * imported) because that module is server-only and this file must stay
 * server-import-free; same small-constant-duplication convention this
 * component family already uses (see e.g. `VD_TIE_IN_MAX_SPOKEN_MENTIONS`
 * in `VerticalDramaTieInReportCard.tsx`). If the server-side window size
 * ever changes, this MUST change with it — both are spec §13 constants
 * pinned to "10 episodes".
 */
const VD_ARC_TIE_IN_FATIGUE_WINDOW_MIRROR = 10;

/**
 * TODO(conductor, F131Y `verticalDramaSeriesTieInReplan`): searchable rollout
 * marker for task #31 (mirrors task #23's `VD_FORMAT_PROFILES_ROLLOUT` in
 * `./formatProfiles.ts` — same reason: `shared/featureFlags.ts` and
 * `client/src/components/admin/tenantFeatureFlagGroups.ts` were being
 * concurrently edited by another agent when this wave shipped). UNLIKE
 * `VD_FORMAT_PROFILES_ROLLOUT`, no hardcoded-boolean-parameter swap is
 * needed at the two live call sites below — both already resolve the flag
 * via the SAME loose, fail-closed `getTenantFeatureFlags(tenantId)` string
 * lookup this router file's sibling resolvers use for already-registered
 * flags (e.g. `resolveVerticalDramaDensityFlags`'s `verticalDramaSeriesArcReplan`
 * key) — an unregistered key simply never resolves `true` for a real
 * tenant, so this is safe to ship live today:
 *   1. `server/routers/verticalDramaEpisodes.ts` —
 *      `resolveVerticalDramaTieInReplanFlag` (gates `deferEpisodeTieIn`'s
 *      real-proposal path).
 *   2. `server/services/verticalDramaEpisodePipeline.ts` — NOT wired by this
 *      wave (out of file scope) — the `plan_episode_script` real-generation
 *      call site needs ~3-4 lines: resolve the SAME flag, read the active
 *      breakdown item for the episode being generated, and pass its `tieIn`
 *      as `episodeTieInPlacement` into `generateEpisodeScript`'s params
 *      (`verticalDramaScriptGeneration.ts`, already accepts it).
 * Once `verticalDramaSeriesTieInReplan` is registered + given an admin
 * group entry, call site 1 requires ZERO further code change — only call
 * site 2 needs the small pipeline wiring above.
 */
export const VD_TIE_IN_REPLAN_ROLLOUT = "flag_pending" as const;

export interface PlanSeasonTieInPlacementsOptions {
  /** Admin-configured `maxEpisodesWithTieInPerTenEpisodes` (per-10-episode cap). */
  perTenCap: number;
  /**
   * Total planned episode count, for `resolveTieInEpisodeBudget` proration.
   * Defaults to `items.length` when omitted.
   */
  plannedCount?: number;
  /**
   * Resolved format-profile (task #23) — when omitted, resolves one from
   * `plannedCount` via `resolveVerticalDramaFormatProfile` (never a second
   * tier-resolution formula).
   */
  formatProfile?: VerticalDramaFormatProfile;
  /** Episode 1 is a pure hook and is never planned for a tie-in. Default `true`. */
  avoidEpisodeOne?: boolean;
}

/**
 * Evenly spread `count` picks across `candidates` (already sorted
 * ascending), biased to the middle of each bucket — e.g. 3 picks across 9
 * candidates lands roughly every 3rd one instead of clustering at the
 * start. Deterministic: a collision (possible when `count` is close to
 * `candidates.length`) resolves by walking forward (wrapping once) to the
 * next not-yet-picked index, so the result never has fewer than
 * `min(count, candidates.length)` entries.
 */
function evenlySpacedPick<T>(candidates: readonly T[], count: number): T[] {
  const n = candidates.length;
  const k = Math.max(0, Math.min(count, n));
  if (k === 0) return [];
  if (k >= n) return [...candidates];

  const usedIndexes = new Set<number>();
  const pickedIndexes: number[] = [];
  for (let i = 0; i < k; i++) {
    let idx = Math.min(n - 1, Math.floor(((i + 0.5) * n) / k));
    while (usedIndexes.has(idx)) {
      idx = (idx + 1) % n;
    }
    usedIndexes.add(idx);
    pickedIndexes.push(idx);
  }
  return pickedIndexes.sort((a, b) => a - b).map(idx => candidates[idx]);
}

/**
 * Plans an initial, even distribution of tie-in placements across a whole
 * season (spec §7.7.2/§7.7.3, task #31) — deterministic, never mutates
 * story fields (`workingTitle`/`logline`/`keyBeats`/`contentBudget` are
 * carried through byte-identical; only `tieIn` is written/overwritten on
 * every returned item). Two callers: task #22's full-season generation, and
 * `deferEpisodeTieIn`'s in-memory bootstrap fallback for a legacy series
 * whose breakdown has never carried a `tieIn` field on any item (see
 * `proposeTieInDeferReplan`'s doc comment).
 *
 * Respects the format-profile-prorated budget (`resolveTieInEpisodeBudget`)
 * — a short/ultra-short season still gets at least 1 placement whenever
 * `plannedCount >= 3` (that floor is `resolveTieInEpisodeBudget`'s own
 * behavior, not re-implemented here). Episode 1 is excluded by default
 * (`avoidEpisodeOne`) since it is a pure hook episode.
 */
export function planSeasonTieInPlacements(
  items: VerticalDramaEpisodeBreakdownItem[],
  opts: PlanSeasonTieInPlacementsOptions
): VerticalDramaEpisodeBreakdownItem[] {
  const plannedCount = opts.plannedCount ?? items.length;
  const profile =
    opts.formatProfile ?? resolveVerticalDramaFormatProfile(plannedCount);
  const budget = resolveTieInEpisodeBudget(profile, plannedCount, opts.perTenCap);
  const avoidEpisodeOne = opts.avoidEpisodeOne ?? true;

  const eligibleEpisodeNumbers = items
    .map(item => item.episodeNumber)
    .filter(n => !avoidEpisodeOne || n !== 1)
    .sort((a, b) => a - b);

  const plannedEpisodeNumbers = new Set(
    evenlySpacedPick(eligibleEpisodeNumbers, budget)
  );

  return items.map(item => {
    const planned = plannedEpisodeNumbers.has(item.episodeNumber);
    return {
      ...item,
      tieIn: { planned, source: "planned" },
    };
  });
}

export interface ProposeTieInDeferReplanInput {
  /** Full active breakdown — every item should already carry a `tieIn` field (bootstrap via `planSeasonTieInPlacements` first if not). */
  items: VerticalDramaEpisodeBreakdownItem[];
  /** The episode the placement is being deferred FROM. */
  fromEpisodeNumber: number;
  /** Episode numbers that already have a persisted script — never a valid re-placement TARGET. */
  producedEpisodeNumbers: number[];
  /** Admin-configured `maxEpisodesWithTieInPerTenEpisodes` (per-10-episode cap). */
  perTenCap: number;
  /** Total planned episode count, for `resolveTieInEpisodeBudget` proration. Defaults to `items.length`. */
  plannedCount?: number;
  /** Resolved format-profile (task #23) — see `PlanSeasonTieInPlacementsOptions.formatProfile`. */
  formatProfile?: VerticalDramaFormatProfile;
}

export type ProposeTieInDeferReplanResult =
  | {
      ok: true;
      /** The FULL `items` array (see this function's doc comment) with exactly 2 items' `tieIn` touched. */
      proposedBreakdown: VerticalDramaEpisodeBreakdownItem[];
      targetEpisodeNumber: number;
      rationaleTh: string;
    }
  | {
      ok: false;
      reason: "source_episode_not_found" | "no_future_slot" | "cap_exhausted";
    };

/**
 * Proposes moving episode `fromEpisodeNumber`'s planned tie-in placement to
 * the NEAREST eligible future episode (spec §7.7.3, task #31) — deterministic,
 * no LLM call. An eligible target is FUTURE (`episodeNumber >
 * fromEpisodeNumber`), NOT already produced, NOT already planned for a
 * tie-in, and placing one there would not push the 10-episode planned-
 * placement window over `cap` (mirrors `evaluateFatigue`'s window
 * semantics, but counts PLANNED `tieIn.planned` on the season breakdown —
 * a forward-looking analog — rather than realized script placements).
 *
 * Returns the WHOLE `items` array as `proposedBreakdown` (not just the 2
 * touched items) — `applyApprovedArcReplan` replaces active-breakdown items
 * by episode number, so a full-array proposal ALSO durably adopts an
 * in-memory bootstrap plan (`planSeasonTieInPlacements`) for the rest of
 * the season the moment this proposal is approved, without a separate
 * "adopt the season plan" action.
 *
 * NEVER touches `workingTitle`/`logline`/`keyBeats`/`contentBudget` on any
 * item — only `tieIn` on the source (cleared) and target (set,
 * `source: "deferred"`, `movedFromEpisodeNumber`) episodes changes. This is
 * what keeps the proposal deterministic without an LLM call, and is exactly
 * what `applyApprovedArcReplan`'s guard (`verticalDramaArcReplan.ts`)
 * enforces before applying a `VD_ARC_TIE_IN_DEFERRED` proposal.
 */
export function proposeTieInDeferReplan(
  input: ProposeTieInDeferReplanInput
): ProposeTieInDeferReplanResult {
  const sourceItem = input.items.find(
    item => item.episodeNumber === input.fromEpisodeNumber
  );
  if (!sourceItem) {
    return { ok: false, reason: "source_episode_not_found" };
  }

  const producedSet = new Set(input.producedEpisodeNumbers);
  const plannedCount = input.plannedCount ?? input.items.length;
  const profile =
    input.formatProfile ?? resolveVerticalDramaFormatProfile(plannedCount);
  const cap = resolveTieInEpisodeBudget(profile, plannedCount, input.perTenCap);

  const candidates = input.items
    .filter(item => item.episodeNumber > input.fromEpisodeNumber)
    .filter(item => !producedSet.has(item.episodeNumber))
    .filter(item => item.tieIn?.planned !== true)
    .sort((a, b) => a.episodeNumber - b.episodeNumber);

  if (candidates.length === 0) {
    return { ok: false, reason: "no_future_slot" };
  }

  const target = candidates.find(candidate => {
    const windowStart =
      candidate.episodeNumber - VD_ARC_TIE_IN_FATIGUE_WINDOW_MIRROR + 1;
    const countInWindow = input.items.filter(
      item =>
        item.episodeNumber >= windowStart &&
        item.episodeNumber <= candidate.episodeNumber &&
        item.episodeNumber !== input.fromEpisodeNumber &&
        item.tieIn?.planned === true
    ).length;
    return countInWindow + 1 <= cap;
  });

  if (!target) {
    return { ok: false, reason: "cap_exhausted" };
  }

  const proposedBreakdown = input.items.map(item => {
    if (item.episodeNumber === input.fromEpisodeNumber) {
      return {
        ...item,
        tieIn: {
          ...(item.tieIn ?? { source: "planned" as const, planned: false }),
          planned: false,
        },
      };
    }
    if (item.episodeNumber === target.episodeNumber) {
      return {
        ...item,
        tieIn: {
          planned: true,
          intensity: item.tieIn?.intensity,
          benefitFocus: item.tieIn?.benefitFocus,
          source: "deferred" as const,
          movedFromEpisodeNumber: input.fromEpisodeNumber,
        },
      };
    }
    return item;
  });

  const rationaleTh = `เลื่อนตำแหน่งสินค้าจากตอนที่ ${input.fromEpisodeNumber} ไปตอนที่ ${target.episodeNumber} (ตอนอนาคตที่ใกล้ที่สุดซึ่งยังไม่ผลิตและยังไม่มีแผนสินค้า ภายใต้เพดาน ${cap} ตอนต่อ 10 ตอน)`;

  return {
    ok: true,
    proposedBreakdown,
    targetEpisodeNumber: target.episodeNumber,
    rationaleTh,
  };
}
