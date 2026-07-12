/**
 * Single-round QA loop (Feature 133, section-06 §5.3, Phase 1 / MVP). Mirrors
 * the Vertical Drama DI shape (`verticalDramaQualityLoop.ts`, research A10)
 * with the SAME effect names — `runReview` / `repairStage` / `persistReview`
 * / `recomputeMetrics` (renamed from `recomputeDensityMetrics`) — so a
 * future Phase 3 bounded multi-round auto-improve loop is a policy change,
 * not a rewrite. This file is a fresh module: it does NOT import
 * `verticalDramaQualityLoop` internals (research C2 — no cross-module
 * private imports; that module is a different domain, only its DI *shape*
 * is reused here).
 *
 * MVP: exactly ONE review round, always. `policy.maxLoops` defaults to `1`
 * and — unlike a future Phase 3 loop — a caller-supplied larger value is
 * still capped to a single round in Phase 1 (see the `// Phase 3:` marker
 * below). `repairStage` and `recomputeMetrics` are part of the effects
 * interface for forward-compat only and MUST NOT be called anywhere in this
 * file's MVP path (enforced by `videoProjectQualityLoop.test.ts`).
 *
 * Pure orchestrator: every side effect (running the review skill, repairing
 * a stage, persisting a review, recomputing metrics) is INJECTED via the
 * `effects` parameter, so this file has no DB/LLM/render imports of its own.
 * The actual LLM call (to the `video-project-quality-review` skill) and DB
 * persistence are wired by the caller in section-07.
 */
import type { VideoProjectQualityMetrics } from "./videoProjectQualityMetrics";

/** Repair stages (spec §12): content | narration | scenes | motion | captions | claims. */
export type QualityRepairStage = "content" | "narration" | "scenes" | "motion" | "captions" | "claims";

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
  /** Defaults to `1` when omitted. Phase 1 always runs exactly one round
   *  regardless of this value — see this file's header comment. */
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
  /** Unused in the MVP single-round path — present for Phase 3 forward-compat. */
  repairStage(stage: QualityRepairStage, instruction: string): Promise<void>;
  persistReview(review: VideoProjectReview): Promise<void>;
  /** Unused in the MVP single-round path — present for Phase 3 forward-compat. */
  recomputeMetrics(projectId: string): Promise<VideoProjectQualityMetrics>;
};

/**
 * Compile-time guarantee (section-06 §5.3 / §7 gate #2): `pnpm check`
 * enforces that `VideoProjectQualityLoopEffects` never gains a
 * media-generation / render member. If a forbidden key name is ever added to
 * the interface, `ForbiddenQualityLoopEffectKeys` becomes a non-`never`
 * string-literal type and `AssertNever<ForbiddenQualityLoopEffectKeys>` stops
 * satisfying its `T extends never` constraint — tsc fails to compile this
 * file. Type-only construct; zero runtime cost.
 */
type AssertNever<T extends never> = T;
type ForbiddenQualityLoopEffectKeys = Extract<
  keyof VideoProjectQualityLoopEffects,
  | "render"
  | "renderVideo"
  | "queueRender"
  | "generateImage"
  | "generateVideo"
  | "generateAudio"
  | "generateMedia"
  | "synthesizeSpeech"
  | "runFfmpeg"
>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export type AssertNoMediaGenerationEffectMember = AssertNever<ForbiddenQualityLoopEffectKeys>;

export type VideoProjectQualityLoopState = {
  /** === 1 in MVP. */
  rounds: number;
  bestReview: VideoProjectReview;
  history: VideoProjectReview[];
};

export interface RunVideoProjectQualityLoopArgs {
  projectId: string;
  /** `{ targetScore, maxLoops? }` — `maxLoops` defaults to 1. */
  policy: VideoProjectQualityLoopPolicy;
  /** Optional pre-computed first review — when provided, `effects.runReview`
   *  is not called. */
  initialReview?: VideoProjectReview | null;
  /** Deterministic facts fed INTO the review (`videoProjectQualityMetrics.ts`). */
  metrics: VideoProjectQualityMetrics;
  effects: VideoProjectQualityLoopEffects;
}

/**
 * Runs the Phase 1 single-round QA loop (section-06 §5.3):
 * 1. Use `initialReview` if provided, else call `effects.runReview` once.
 * 2. Call `effects.persistReview(review)` once.
 * 3. Return `{ rounds: 1, bestReview: review, history: [review] }`.
 *
 * `repairStage` / `recomputeMetrics` are never called here — see this file's
 * header comment.
 */
export async function runVideoProjectQualityLoop(
  args: RunVideoProjectQualityLoopArgs,
): Promise<VideoProjectQualityLoopState> {
  // Phase 3: bounded multi-round loop here (policy.maxLoops would drive how
  // many `review -> repairStage -> recomputeMetrics -> re-review` rounds
  // run). Phase 1 always runs exactly one round, no matter what
  // `args.policy.maxLoops` requests.
  const review = args.initialReview
    ? args.initialReview
    : await args.effects.runReview({ projectId: args.projectId, metrics: args.metrics });

  await args.effects.persistReview(review);

  return { rounds: 1, bestReview: review, history: [review] };
}
