/**
 * Vertical Drama Series — bounded episode quality auto-improve loop (spec
 * §16.1 / section-14-script-quality-qc-auto-improve, added 2026-07-07).
 *
 * One loop round = `review -> group -> repair -> re-review` (spec §16.1 rule
 * 2), repeating while the scorecard is below policy floors AND rounds
 * remain (`policy.maxAutoImproveRounds`), in the CANONICAL repair-group
 * order: `plan_episode_script` -> `storyboard_shotgrid` ->
 * `dialogue_audio_plan` -> `tie_in` (the last group only when `tieInEnabled`
 * is set — see `verticalDramaQualityReviewApply.ts`'s doc comment for why
 * `tie_in` is not a `VerticalDramaPipelineStage`).
 *
 * Pure orchestrator: every side effect (re-running the review skill,
 * repairing a stage, persisting a review, recomputing density metrics) is
 * INJECTED via the `effects` parameter, so this file has no DB/LLM/credit
 * imports of its own and is cheaply unit-testable with mocked effects. The
 * `effects` interface deliberately has NO media-generation member — there is
 * no way for this loop to call an image/video/TTS path even by accident
 * (spec §16.1 rule 4: "the loop is LLM-only (plan_only class)").
 *
 * Regression guard (spec §16.1 rule 3): if a round's re-review scores a
 * LOWER `overall` than the pre-round review, the loop stops immediately,
 * the PRE-round artifact stays the active candidate (the round's repairs
 * are superseded, never deleted — both the pre-round and the regressed
 * re-review stay referenceable via that round's `reviewArtifactId` /
 * `reReviewArtifactId`), and status becomes `escalated_regression`.
 *
 * After `maxAutoImproveRounds` without a pass, the loop stops and escalates
 * as `escalated_max_rounds`. `maxAutoImproveRounds: 0` means "no loop" —
 * the initial review is only evaluated against policy floors: `passed` if
 * it already meets them, `idle` otherwise (spec's "0 = manual apply only").
 *
 * Storyboard/dialogue/tie-in repair instructions are always composed from
 * the CURRENT round's review (`activeReview`, re-assigned after every
 * successful, non-regressed round) — never the loop's original review (spec
 * §16.1 rule 7 / the documented v1 limitation this section fixes).
 *
 * Credit/audit tracking is NOT reimplemented here — it lives inside whatever
 * real function the caller wires up as `effects.runReview` /
 * `effects.repairStage` / `effects.persistReview` (e.g.
 * `runVerticalDramaEpisodeQualityReview`, which already deducts credits, and
 * `verticalDramaEpisodePipeline.repairStage`, which already writes
 * append-only audited artifacts). This orchestrator's only job is to call
 * those effects in the right order, the right number of times, and to
 * decide when to stop.
 */

import {
  evaluateScorecardAgainstPolicy,
  type VerticalDramaQualityLoopState,
  type VerticalDramaQualityPolicy,
  type VerticalDramaQualityScorecardDimensions,
} from "@shared/verticalDramaSeries/qualityPolicy";
import {
  composeQualityReviewRepairInstruction,
  groupQualityReviewIssuesByStageWithFlag,
  type QualityReviewApplicableStageWithTieIn,
  type QualityReviewIssueLike,
} from "./verticalDramaQualityReviewApply";
import type { VerticalDramaDensityMetrics } from "./verticalDramaEpisodeQualityReview";

/** The narrow slice of a quality-review artifact the loop actually needs. */
export interface VerticalDramaQualityLoopReviewLike {
  scorecard: VerticalDramaQualityScorecardDimensions;
  issues: QualityReviewIssueLike[];
}

export interface VerticalDramaQualityLoopRunReviewParams {
  /**
   * Always `false` for every round the loop itself drives — `avoidPrevious`
   * only makes sense for the interactive "suggest something different
   * WITHOUT applying repairs" UX (see
   * `RunEpisodeQualityReviewParams.avoidPrevious`), which is orthogonal to
   * this loop: repairs DO happen between rounds here, so a genuinely fresh
   * judgment is exactly what's wanted. Kept on the interface (rather than
   * hardcoded away) so the injected implementation's signature lines up
   * 1:1 with `RunEpisodeQualityReviewParams`.
   */
  avoidPrevious: boolean;
  /** Recomputed via `effects.recomputeDensityMetrics()` immediately before this call, every round (spec §16.1 rule 1). */
  densityMetrics: VerticalDramaDensityMetrics;
}

/**
 * Every side effect the loop needs, injected by the caller. No member of
 * this interface can trigger paid image/video/TTS generation — there simply
 * is no such member (spec §16.1 rule 4).
 */
export interface VerticalDramaQualityLoopEffects {
  /** Re-run the quality-review skill and return its (not-yet-persisted) result. */
  runReview(
    params: VerticalDramaQualityLoopRunReviewParams,
  ): Promise<VerticalDramaQualityLoopReviewLike>;
  /**
   * Repair exactly one canonical group with ONE combined instruction
   * (script/storyboard/dialogue/tie-in).
   *
   * W11.6 "Story Lock" (added 2026-07-08) — the return type widened from
   * `Promise<void>` to optionally report `{ storyLockViolated: true }`: every
   * pre-existing injected implementation that resolves to `undefined`/
   * nothing (i.e. every implementation written before this wave) still
   * type-checks (`void` remains a member of the union) and still counts as
   * "no violation" — fully backward compatible, zero behavior change when
   * the caller never sets this. Set by the caller's `repairStage`
   * implementation when its OWN deterministic post-repair guard
   * (`verticalDramaQualityReviewApply.ts`'s
   * `evaluateVerticalDramaStoryLockScriptGuard`/
   * `evaluateVerticalDramaStoryLockStoryboardGuard`) rejected this round's
   * `plan_episode_script`/`storyboard_shotgrid` repair and reverted to the
   * prior content — this loop has no script/storyboard content of its own to
   * compare (it only ever sees `{scorecard, issues}`), so the actual
   * before/after comparison MUST happen inside the injected effect (which has
   * DB access), reported back here as a plain boolean signal.
   */
  repairStage(
    stage: QualityReviewApplicableStageWithTieIn,
    instruction: string,
  ): Promise<{ storyLockViolated?: boolean } | void>;
  /** Persist a review (append-only ledger, spec §16.1 rule 5) and return ITS artifact id. */
  persistReview(review: VerticalDramaQualityLoopReviewLike): Promise<string>;
  /** Recompute deterministic density metrics AFTER a repair round, BEFORE that round's re-review (spec §16.1 rule 1). */
  recomputeDensityMetrics():
    | Promise<VerticalDramaDensityMetrics>
    | VerticalDramaDensityMetrics;
}

export interface RunVerticalDramaQualityLoopParams {
  episodeId: string;
  policy: VerticalDramaQualityPolicy;
  /** The already-persisted review the loop starts from (script+storyboard review, spec §6.8.1/§16.1 rule 2). */
  initialReview: {
    artifactId: string;
    review: VerticalDramaQualityLoopReviewLike;
  };
  effects: VerticalDramaQualityLoopEffects;
  /** Activates the fourth canonical repair group, `tie_in` (spec §13.1/§16.1). Default false. */
  tieInEnabled?: boolean;
  /**
   * W11.6 "Story Lock" (added 2026-07-08). Default false (byte-identical to
   * before this wave). When true: (1) every `plan_episode_script`/
   * `storyboard_shotgrid` repair instruction this loop composes gains the
   * execution-only hard-constraint block (`composeQualityReviewRepairInstruction`'s
   * `storyLockStage` option); (2) this loop tallies how many rounds'
   * `effects.repairStage` calls reported `{ storyLockViolated: true }` into
   * the returned state's `storyLockRejections` (only ever present/nonzero
   * when this flag is true — the loop itself never evaluates script/
   * storyboard content, it only relays what the injected effect reports).
   */
  storyLockEnabled?: boolean;
}

/**
 * Upfront credit estimate for the WHOLE bounded loop (spec §16.1: "every LLM
 * call is credit-tracked with the estimate shown up-front for the whole loop
 * (rounds × per-round estimate)"). A simple multiplication — the exact cost
 * of any given round is only known after that round's LLM call actually
 * returns, same as every other Vertical Drama planning call site's
 * conservative pre-check estimate.
 */
export function estimateVerticalDramaQualityLoopCredits(
  perRoundEstimateCredits: number,
  maxAutoImproveRounds: number,
): number {
  return Math.max(0, perRoundEstimateCredits) * Math.max(0, maxAutoImproveRounds);
}

/**
 * Runs the bounded auto-improve loop to completion and returns the final
 * `VerticalDramaQualityLoopState` (spec §16.1). See this file's header
 * comment for the full round/regression/escalation semantics.
 */
export async function runVerticalDramaQualityLoop(
  params: RunVerticalDramaQualityLoopParams,
): Promise<VerticalDramaQualityLoopState> {
  const tieInEnabled = params.tieInEnabled === true;
  const storyLockEnabled = params.storyLockEnabled === true;
  const rounds: VerticalDramaQualityLoopState["rounds"] = [];
  // W11.6 "Story Lock" — tallied purely from what `effects.repairStage`
  // reports back (this loop never sees script/storyboard content itself).
  // Stays 0 (and therefore omitted from every returned state below) whenever
  // `storyLockEnabled` is false or no round's repair was ever rejected —
  // byte-identical to pre-W11.6 state shapes in both cases.
  let storyLockRejections = 0;

  /** Builds a state object, including `storyLockRejections` ONLY when > 0 (keeps every pre-W11.6 exact-shape fixture/`toEqual` assertion unchanged). */
  const buildState = (
    status: VerticalDramaQualityLoopState["status"],
    activeReviewArtifactId: string,
  ): VerticalDramaQualityLoopState => ({
    episodeId: params.episodeId,
    rounds,
    status,
    activeReviewArtifactId,
    ...(storyLockRejections > 0 ? { storyLockRejections } : {}),
  });

  let activeArtifactId = params.initialReview.artifactId;
  let activeReview = params.initialReview.review;

  const initialEvaluation = evaluateScorecardAgainstPolicy(
    activeReview.scorecard,
    params.policy,
  );

  // "maxAutoImproveRounds: 0" = no loop at all (manual apply only) — only
  // ever evaluate the initial review against policy floors, no effects
  // called whatsoever.
  if (params.policy.maxAutoImproveRounds <= 0) {
    return buildState(initialEvaluation.passed ? "passed" : "idle", activeArtifactId);
  }

  // Already passing — no point spending a round (or an LLM call) on it.
  if (initialEvaluation.passed) {
    return buildState("passed", activeArtifactId);
  }

  for (let round = 1; round <= params.policy.maxAutoImproveRounds; round++) {
    // Group + compose from the CURRENT (active) review — never the original
    // — fixing the documented v1 limitation (spec §16.1 rule 7).
    const grouped = groupQualityReviewIssuesByStageWithFlag(activeReview.issues, tieInEnabled);

    const stagesRepairedThisRound: QualityReviewApplicableStageWithTieIn[] = [];
    for (const group of grouped) {
      const instruction = composeQualityReviewRepairInstruction(
        group.issues,
        storyLockEnabled ? { storyLockStage: group.stage } : undefined,
      );
      const repairResult = await params.effects.repairStage(group.stage, instruction);
      if (repairResult && repairResult.storyLockViolated) storyLockRejections++;
      stagesRepairedThisRound.push(group.stage);
    }

    const densityMetrics = await params.effects.recomputeDensityMetrics();
    const reReview = await params.effects.runReview({
      avoidPrevious: false,
      densityMetrics,
    });
    const reReviewArtifactId = await params.effects.persistReview(reReview);

    const overallBefore = activeReview.scorecard.overall;
    const overallAfter = reReview.scorecard.overall;

    rounds.push({
      round,
      reviewArtifactId: activeArtifactId,
      // `stagesRepairedThisRound` is `QualityReviewApplicableStageWithTieIn[]`
      // (`"plan_episode_script" | "storyboard_shotgrid" |
      // "dialogue_audio_plan" | "tie_in"`), which is now directly assignable
      // to `VerticalDramaQualityLoopRound.stagesRepaired`'s widened
      // `VerticalDramaQualityRepairGroup[]` type (shared `qualityPolicy.ts`,
      // Wave-4B: `VerticalDramaPipelineStage | "tie_in"`) — no cast needed.
      stagesRepaired: stagesRepairedThisRound,
      reReviewArtifactId,
      overallBefore,
      overallAfter,
    });

    if (overallAfter < overallBefore) {
      // Regression guard (spec §16.1 rule 3) — stop immediately. The
      // PRE-round artifact (`activeArtifactId`, unchanged below) stays the
      // active candidate; this round's repairs are superseded, not deleted,
      // and both reports stay visible via this round's own
      // `reviewArtifactId` / `reReviewArtifactId`.
      return buildState("escalated_regression", activeArtifactId);
    }

    // Advance to the new (>= previous) review as the current candidate.
    activeArtifactId = reReviewArtifactId;
    activeReview = reReview;

    const evaluation = evaluateScorecardAgainstPolicy(reReview.scorecard, params.policy);
    if (evaluation.passed) {
      return buildState("passed", activeArtifactId);
    }
  }

  // Exhausted `maxAutoImproveRounds` without a pass — escalate, never spin
  // unbounded (spec §16.1 rule 4's rounds cap).
  return buildState("escalated_max_rounds", activeArtifactId);
}
