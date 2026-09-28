/**
 * Bounded multi-round QA loop (Feature 133/142, section-06). Mirrors the
 * Vertical Drama DI shape (`verticalDramaQualityLoop.ts`, research A10) with
 * the SAME effect names — `runReview` / `repairStage` / `persistReview` /
 * `recomputeMetrics`. This file is a fresh module: it does NOT import
 * `verticalDramaQualityLoop` internals (research C2 — no cross-module
 * private imports; that module is a different domain, only its DI *shape*
 * is reused here).
 *
 * Runs *review -> repair -> recompute -> re-review*, capped by
 * `clampQualityLoopRounds(policy.maxLoops)`, early-exiting once
 * `review.score >= policy.targetScore`. `bestReview` is the highest-scoring
 * round; on a tie the LATER round wins (it judges the document as it now
 * stands). `maxLoops: 0` still yields exactly one round with no repair — the
 * documented no-deploy kill switch (`spec.md` §13).
 *
 * Pure orchestrator: every side effect (running the review skill, repairing
 * a stage, persisting a review, recomputing metrics) is INJECTED via the
 * `effects` parameter, so this file has no DB/LLM/render imports of its own.
 * The actual LLM calls (review + repair rewrites) and DB persistence are
 * wired by the caller in `server/routers/videoProjects.ts`.
 */
import type { VideoProjectQualityMetrics } from "./videoProjectQualityMetrics";
import type {
  AssertNever,
  ForbiddenMediaGenerationEffectMembers,
} from "@shared/videoIntelligence/effectGuards";

/** Repair stages (spec §12): content | narration | scenes | motion | captions
 *  | claims | layout. `layout` (Feature 142, section-06 gap-1) is a
 *  deterministic safe-area-clamp stage — see `videoProjectRepairApplier.ts`'s
 *  `applyLayoutHandler`. */
export type QualityRepairStage =
  | "content"
  | "narration"
  | "scenes"
  | "motion"
  | "captions"
  | "claims"
  | "layout";

export type VideoProjectReview = {
  /** 0..10. */
  score: number;
  /** Per-dimension sub-scores (dimensions defined in
   *  `skills/video-project-quality-review/skill.md`). */
  scorecard: Record<string, number>;
  issues: Array<{
    dimension: string;
    severity: "low" | "medium" | "high";
    message: string;
    repairStage?: QualityRepairStage;
  }>;
  repairInstructions?: Array<{ stage: QualityRepairStage; instruction: string }>;
};

export type VideoProjectQualityLoopPolicy = {
  targetScore: number;
  /** Defaults to `1` when omitted. Clamped to `[1, QUALITY_LOOP_MAX_ROUNDS]`
   *  via `clampQualityLoopRounds` — see this file's header comment. */
  maxLoops?: number;
};

/**
 * DI seam — identical member set to `VerticalDramaQualityLoopEffects`,
 * renamed `recomputeDensityMetrics` -> `recomputeMetrics`. NOTE: there is
 * deliberately NO media-generation / render member here; `pnpm check`
 * enforcing that absence is part of the test gate (TDD cross-cutting rule,
 * see `AssertNoMediaGenerationEffectMember` below).
 */
export type VideoProjectQualityLoopEffects = {
  runReview(input: { projectId: string; metrics: VideoProjectQualityMetrics }): Promise<VideoProjectReview>;
  repairStage(stage: QualityRepairStage, instruction: string): Promise<void>;
  persistReview(review: VideoProjectReview): Promise<void>;
  recomputeMetrics(projectId: string): Promise<VideoProjectQualityMetrics>;
};

/**
 * Compile-time guarantee (section-06 §5.3 / §7 gate #2, unified section-08
 * §4.1 via the shared `effectGuards.ts` primitives): `pnpm check` enforces
 * that `VideoProjectQualityLoopEffects` never gains a media-generation /
 * render member. If a forbidden key name is ever added to the interface,
 * `ForbiddenMediaGenerationEffectMembers<VideoProjectQualityLoopEffects>`
 * resolves to a non-`never` string-literal type and stops satisfying
 * `AssertNever`'s `T extends never` constraint — tsc fails to compile this
 * file. Type-only construct; zero runtime cost. Exported alias name kept
 * unchanged — section-08's fs guard and this section's own trap reference it
 * by name.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export type AssertNoMediaGenerationEffectMember = AssertNever<
  ForbiddenMediaGenerationEffectMembers<VideoProjectQualityLoopEffects>
>;

export type VideoProjectQualityLoopState = {
  /** Number of rounds actually run. */
  rounds: number;
  bestReview: VideoProjectReview;
  history: VideoProjectReview[];
};

export interface RunVideoProjectQualityLoopArgs {
  projectId: string;
  /** `{ targetScore, maxLoops? }` — `maxLoops` defaults to 1. */
  policy: VideoProjectQualityLoopPolicy;
  /** Optional pre-computed first review — when provided, `effects.runReview`
   *  is not called for round 1. */
  initialReview?: VideoProjectReview | null;
  /** Deterministic facts fed INTO the review (`videoProjectQualityMetrics.ts`). */
  metrics: VideoProjectQualityMetrics;
  effects: VideoProjectQualityLoopEffects;
}

/**
 * Hard ceiling on the number of rounds a single loop run may execute. The
 * document schema (`VideoProjectQaSchema`) permits `maxLoops` up to 20 and
 * the estimator quotes ~5 calls per round — an unclamped 20 is therefore a
 * 100-call authorisation nobody confirmed a price for. `getStageEstimate`
 * (`server/routers/videoProjects.ts`) uses this SAME clamp so the quoted
 * ceiling and the round count the loop actually runs never disagree.
 */
export const QUALITY_LOOP_MAX_ROUNDS = 5;

/** Clamps a requested `maxLoops` into `[1, QUALITY_LOOP_MAX_ROUNDS]`.
 *  `maxLoops: 0` (or any value below 1) still yields `1` — the documented
 *  no-deploy kill switch (`spec.md` §13): even "no repairs" runs one review
 *  round. */
export function clampQualityLoopRounds(maxLoops: number): number {
  const truncated = Math.trunc(maxLoops);
  return Math.min(Math.max(1, truncated), QUALITY_LOOP_MAX_ROUNDS);
}

/**
 * Runs the bounded multi-round QA loop (section-06 §6.7):
 *
 * ```
 * rounds = clampQualityLoopRounds(policy.maxLoops ?? 1)
 * review = initialReview ?? await runReview({ projectId, metrics })
 * for round in 1..rounds:
 *     await persistReview(review)
 *     if review.score >= policy.targetScore: break
 *     if round === rounds: break
 *     instructions = review.repairInstructions ?? []
 *     if instructions.length === 0: break
 *     for { stage, instruction } of instructions: await repairStage(stage, instruction)
 *     metrics = await recomputeMetrics(projectId)
 *     review  = await runReview({ projectId, metrics })
 * return { rounds: <rounds actually run>, bestReview, history }
 * ```
 *
 * `bestReview` tracks the highest `score` seen; a tie is won by the LATER
 * round (it judges the document as it now stands). The loop stays pure — it
 * never touches the document, the DB, or an LLM directly; every effect is
 * injected by the caller.
 */
export async function runVideoProjectQualityLoop(
  args: RunVideoProjectQualityLoopArgs,
): Promise<VideoProjectQualityLoopState> {
  const totalRounds = clampQualityLoopRounds(args.policy.maxLoops ?? 1);

  let metrics = args.metrics;
  let review = args.initialReview
    ? args.initialReview
    : await args.effects.runReview({ projectId: args.projectId, metrics });

  const history: VideoProjectReview[] = [];
  let bestReview = review;
  let roundsRun = 0;

  for (let round = 1; round <= totalRounds; round++) {
    roundsRun = round;

    await args.effects.persistReview(review);
    history.push(review);
    // Highest score wins; on a tie the LATER round wins (>= keeps
    // overwriting on equal scores).
    if (review.score >= bestReview.score) bestReview = review;

    if (review.score >= args.policy.targetScore) break;
    if (round === totalRounds) break;

    const instructions = review.repairInstructions ?? [];
    if (instructions.length === 0) break;

    for (const { stage, instruction } of instructions) {
      await args.effects.repairStage(stage, instruction);
    }

    metrics = await args.effects.recomputeMetrics(args.projectId);
    review = await args.effects.runReview({ projectId: args.projectId, metrics });
  }

  return { rounds: roundsRun, bestReview, history };
}
