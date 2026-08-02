/**
 * Coverage for `videoProjectQualityLoop.ts`'s bounded multi-round DI loop
 * (Feature 142, section-06 §5.3). Every effect is a `vi.fn()` mock — this
 * module does no DB/LLM/render calls itself, matching its
 * pure-with-injected-effects design.
 *
 * ⚠️ REWRITE (section-06 §5.3): two tests from the Phase-1 single-round MVP
 * are now false by design and have been replaced —
 * "does not call repairStage in the single-round MVP path (even when a
 * larger maxLoops is requested)" no longer describes this file's contract
 * (a larger `maxLoops` now genuinely repairs across multiple rounds). The
 * `maxLoops: 1` case's "no repair" assertion is preserved below (still true
 * — one round never repairs, regardless of the loop's multi-round support).
 */
import { describe, expect, it, vi } from "vitest";

import {
  clampQualityLoopRounds,
  QUALITY_LOOP_MAX_ROUNDS,
  runVideoProjectQualityLoop,
  type QualityRepairStage,
  type VideoProjectQualityLoopEffects,
  type VideoProjectReview,
} from "../videoProjectQualityLoop";
import type { VideoProjectQualityMetrics } from "../videoProjectQualityMetrics";

function metrics(overrides: Partial<VideoProjectQualityMetrics> = {}): VideoProjectQualityMetrics {
  return {
    sceneDurations: [],
    captionCps: [],
    layerCounts: { perScene: [], total: 0, maxLayersPerScene: 0 },
    safeAreaViolations: [],
    claimCoverage: { coverage: 1, mappedCount: 0, unmappedCount: 0, prohibitedCount: 0 },
    renderCost: { score: 0, cls: "low", recommendPreRender: false },
    ...overrides,
  };
}

function review(overrides: Partial<VideoProjectReview> = {}): VideoProjectReview {
  return {
    score: 8,
    scorecard: { content: 8, claims: 9 },
    issues: [],
    ...overrides,
  };
}

interface MockEffects extends VideoProjectQualityLoopEffects {
  runReview: ReturnType<typeof vi.fn>;
  repairStage: ReturnType<typeof vi.fn>;
  persistReview: ReturnType<typeof vi.fn>;
  recomputeMetrics: ReturnType<typeof vi.fn>;
}

function makeEffects(): MockEffects {
  return {
    runReview: vi.fn(),
    repairStage: vi.fn(async () => {}),
    persistReview: vi.fn(async () => {}),
    recomputeMetrics: vi.fn(async () => metrics()),
  };
}

describe("runVideoProjectQualityLoop", () => {
  it("runs exactly one review round when maxLoops is 1, and never repairs", async () => {
    const effects = makeEffects();
    effects.runReview.mockResolvedValueOnce(review({ score: 3 }));

    const result = await runVideoProjectQualityLoop({
      projectId: "proj-1",
      policy: { targetScore: 8, maxLoops: 1 },
      metrics: metrics(),
      effects,
    });

    expect(result.rounds).toBe(1);
    expect(effects.runReview).toHaveBeenCalledTimes(1);
    expect(effects.repairStage).not.toHaveBeenCalled();
  });

  it("runs exactly one round when maxLoops is 0 (documented no-deploy kill switch)", async () => {
    const effects = makeEffects();
    effects.runReview.mockResolvedValueOnce(review({ score: 3 }));

    const result = await runVideoProjectQualityLoop({
      projectId: "proj-1",
      policy: { targetScore: 8, maxLoops: 0 },
      metrics: metrics(),
      effects,
    });

    expect(result.rounds).toBe(1);
    expect(effects.repairStage).not.toHaveBeenCalled();
  });

  it("returns scorecard + issues with an exact key-set", async () => {
    const effects = makeEffects();
    const r = review();
    effects.runReview.mockResolvedValueOnce(r);

    const result = await runVideoProjectQualityLoop({
      projectId: "proj-1",
      policy: { targetScore: 8, maxLoops: 1 },
      metrics: metrics(),
      effects,
    });

    expect(Object.keys(result).sort()).toEqual(["bestReview", "history", "rounds"]);
    expect(Object.keys(result.bestReview).sort()).toEqual(["issues", "score", "scorecard"]);
    expect(result.bestReview).toBe(r);
    expect(result.history).toEqual([r]);
  });

  it("passes deterministic metrics into runReview", async () => {
    const effects = makeEffects();
    const m = metrics();
    effects.runReview.mockResolvedValueOnce(review());

    await runVideoProjectQualityLoop({
      projectId: "proj-1",
      policy: { targetScore: 8, maxLoops: 1 },
      metrics: m,
      effects,
    });

    expect(effects.runReview).toHaveBeenCalledTimes(1);
    const call = effects.runReview.mock.calls[0][0];
    expect(call.projectId).toBe("proj-1");
    expect(call.metrics).toBe(m);
  });

  it("persists the review via the injected effect", async () => {
    const effects = makeEffects();
    const r = review();
    effects.runReview.mockResolvedValueOnce(r);

    await runVideoProjectQualityLoop({
      projectId: "proj-1",
      policy: { targetScore: 8, maxLoops: 1 },
      metrics: metrics(),
      effects,
    });

    expect(effects.persistReview).toHaveBeenCalledTimes(1);
    expect(effects.persistReview).toHaveBeenCalledWith(r);
  });

  it("defaults maxLoops to 1 when policy omits it", async () => {
    const effects = makeEffects();
    effects.runReview.mockResolvedValueOnce(review({ score: 3 }));

    const result = await runVideoProjectQualityLoop({
      projectId: "proj-1",
      policy: { targetScore: 8 },
      metrics: metrics(),
      effects,
    });

    expect(result.rounds).toBe(1);
    expect(effects.runReview).toHaveBeenCalledTimes(1);
  });

  it("uses initialReview when provided instead of calling runReview for round 1", async () => {
    const effects = makeEffects();
    const r = review({ score: 9 });

    const result = await runVideoProjectQualityLoop({
      projectId: "proj-1",
      policy: { targetScore: 8, maxLoops: 1 },
      initialReview: r,
      metrics: metrics(),
      effects,
    });

    expect(effects.runReview).not.toHaveBeenCalled();
    expect(result.bestReview).toBe(r);
    expect(effects.persistReview).toHaveBeenCalledWith(r);
  });

  /* ------------------------------------------------------------------ */
  /* Multi-round behaviour (section-06 §5.3 — the two rewritten tests)  */
  /* ------------------------------------------------------------------ */

  it("runs review -> repair -> recompute -> re-review up to maxLoops", async () => {
    const effects = makeEffects();
    const round1 = review({
      score: 3,
      repairInstructions: [{ stage: "narration", instruction: "tighten it" }],
    });
    const round2 = review({ score: 9 });
    effects.runReview.mockResolvedValueOnce(round1).mockResolvedValueOnce(round2);

    const result = await runVideoProjectQualityLoop({
      projectId: "proj-1",
      policy: { targetScore: 8, maxLoops: 3 },
      metrics: metrics(),
      effects,
    });

    expect(effects.runReview).toHaveBeenCalledTimes(2);
    expect(effects.repairStage).toHaveBeenCalledTimes(1);
    expect(effects.repairStage).toHaveBeenCalledWith("narration", "tighten it");
    expect(effects.recomputeMetrics).toHaveBeenCalledTimes(1);
    expect(result.rounds).toBe(2);
    expect(result.bestReview).toBe(round2);
  });

  it("calls repairStage once per repairInstruction, in review order, per round", async () => {
    const effects = makeEffects();
    const round1 = review({
      score: 2,
      repairInstructions: [
        { stage: "captions", instruction: "split fast cues" },
        { stage: "claims", instruction: "drop the unbacked claim" },
      ],
    });
    const round2 = review({ score: 9 });
    effects.runReview.mockResolvedValueOnce(round1).mockResolvedValueOnce(round2);

    await runVideoProjectQualityLoop({
      projectId: "proj-1",
      policy: { targetScore: 8, maxLoops: 2 },
      metrics: metrics(),
      effects,
    });

    expect(effects.repairStage).toHaveBeenCalledTimes(2);
    const calledStages = effects.repairStage.mock.calls.map((call: unknown[]) => call[0] as QualityRepairStage);
    expect(calledStages).toEqual(["captions", "claims"]);
  });

  it("passes the recomputed metrics into the NEXT round's runReview", async () => {
    const effects = makeEffects();
    const recomputed = metrics({ claimCoverage: { coverage: 0.5, mappedCount: 1, unmappedCount: 1, prohibitedCount: 0 } });
    effects.recomputeMetrics.mockResolvedValueOnce(recomputed);

    const round1 = review({
      score: 2,
      repairInstructions: [{ stage: "narration", instruction: "fix it" }],
    });
    const round2 = review({ score: 9 });
    effects.runReview.mockResolvedValueOnce(round1).mockResolvedValueOnce(round2);

    await runVideoProjectQualityLoop({
      projectId: "proj-1",
      policy: { targetScore: 8, maxLoops: 3 },
      metrics: metrics(),
      effects,
    });

    const secondCallArgs = effects.runReview.mock.calls[1][0];
    expect(secondCallArgs.metrics).toBe(recomputed);
  });

  it("stops early once score >= targetScore, without repairing", async () => {
    const effects = makeEffects();
    effects.runReview.mockResolvedValueOnce(
      review({ score: 9, repairInstructions: [{ stage: "narration", instruction: "x" }] }),
    );

    const result = await runVideoProjectQualityLoop({
      projectId: "proj-1",
      policy: { targetScore: 8, maxLoops: 5 },
      metrics: metrics(),
      effects,
    });

    expect(result.rounds).toBe(1);
    expect(effects.repairStage).not.toHaveBeenCalled();
    expect(effects.recomputeMetrics).not.toHaveBeenCalled();
  });

  it("keeps the best-scoring round as bestReview", async () => {
    const effects = makeEffects();
    const round1 = review({ score: 6, repairInstructions: [{ stage: "content", instruction: "x" }] });
    const round2 = review({ score: 4 });
    effects.runReview.mockResolvedValueOnce(round1).mockResolvedValueOnce(round2);

    const result = await runVideoProjectQualityLoop({
      projectId: "proj-1",
      policy: { targetScore: 8, maxLoops: 3 },
      metrics: metrics(),
      effects,
    });

    expect(result.bestReview).toBe(round1);
    expect(result.history).toEqual([round1, round2]);
  });

  it("keeps the LATER round on a score tie", async () => {
    const effects = makeEffects();
    const round1 = review({ score: 6, repairInstructions: [{ stage: "content", instruction: "x" }] });
    const round2 = review({ score: 6 });
    effects.runReview.mockResolvedValueOnce(round1).mockResolvedValueOnce(round2);

    const result = await runVideoProjectQualityLoop({
      projectId: "proj-1",
      policy: { targetScore: 8, maxLoops: 3 },
      metrics: metrics(),
      effects,
    });

    expect(result.bestReview).toBe(round2);
  });

  it("clamps maxLoops to QUALITY_LOOP_MAX_ROUNDS", async () => {
    const effects = makeEffects();
    effects.runReview.mockResolvedValue(
      review({ score: 1, repairInstructions: [{ stage: "content", instruction: "x" }] }),
    );

    const result = await runVideoProjectQualityLoop({
      projectId: "proj-1",
      policy: { targetScore: 10, maxLoops: 20 },
      metrics: metrics(),
      effects,
    });

    expect(result.rounds).toBe(QUALITY_LOOP_MAX_ROUNDS);
    expect(effects.runReview).toHaveBeenCalledTimes(QUALITY_LOOP_MAX_ROUNDS);
  });

  it("persists a review for every round, in round order", async () => {
    const effects = makeEffects();
    const round1 = review({ score: 2, repairInstructions: [{ stage: "content", instruction: "x" }] });
    const round2 = review({ score: 9 });
    effects.runReview.mockResolvedValueOnce(round1).mockResolvedValueOnce(round2);

    await runVideoProjectQualityLoop({
      projectId: "proj-1",
      policy: { targetScore: 8, maxLoops: 3 },
      metrics: metrics(),
      effects,
    });

    expect(effects.persistReview).toHaveBeenCalledTimes(2);
    expect(effects.persistReview.mock.calls[0][0]).toBe(round1);
    expect(effects.persistReview.mock.calls[1][0]).toBe(round2);
  });

  it("does not repair when a round produced no repairInstructions", async () => {
    const effects = makeEffects();
    effects.runReview.mockResolvedValueOnce(review({ score: 2 }));

    const result = await runVideoProjectQualityLoop({
      projectId: "proj-1",
      policy: { targetScore: 8, maxLoops: 3 },
      metrics: metrics(),
      effects,
    });

    expect(result.rounds).toBe(1);
    expect(effects.repairStage).not.toHaveBeenCalled();
    expect(effects.recomputeMetrics).not.toHaveBeenCalled();
  });

  it("stops the loop and rethrows when repairStage throws — no silent partial round", async () => {
    const effects = makeEffects();
    effects.runReview.mockResolvedValueOnce(
      review({ score: 2, repairInstructions: [{ stage: "content", instruction: "x" }] }),
    );
    effects.repairStage.mockRejectedValueOnce(new Error("repair exploded"));

    await expect(
      runVideoProjectQualityLoop({
        projectId: "proj-1",
        policy: { targetScore: 8, maxLoops: 3 },
        metrics: metrics(),
        effects,
      }),
    ).rejects.toThrow(/repair exploded/);

    expect(effects.recomputeMetrics).not.toHaveBeenCalled();
    expect(effects.runReview).toHaveBeenCalledTimes(1);
  });
});

describe("clampQualityLoopRounds", () => {
  it("clamps 0 up to 1 (no-deploy kill switch still runs one round)", () => {
    expect(clampQualityLoopRounds(0)).toBe(1);
  });

  it("clamps a negative value up to 1", () => {
    expect(clampQualityLoopRounds(-5)).toBe(1);
  });

  it("passes through values within [1, QUALITY_LOOP_MAX_ROUNDS]", () => {
    expect(clampQualityLoopRounds(1)).toBe(1);
    expect(clampQualityLoopRounds(3)).toBe(3);
    expect(clampQualityLoopRounds(QUALITY_LOOP_MAX_ROUNDS)).toBe(QUALITY_LOOP_MAX_ROUNDS);
  });

  it("clamps a value above QUALITY_LOOP_MAX_ROUNDS down to the ceiling", () => {
    expect(clampQualityLoopRounds(20)).toBe(QUALITY_LOOP_MAX_ROUNDS);
  });

  it("truncates a non-integer value", () => {
    expect(clampQualityLoopRounds(2.9)).toBe(2);
  });
});

describe("VideoProjectQualityLoopEffects — no media-generation member", () => {
  it("documents the compile-time guarantee enforced in videoProjectQualityLoop.ts (pnpm check)", () => {
    // The real enforcement is the `AssertNoMediaGenerationEffectMember` type
    // assertion exported from `videoProjectQualityLoop.ts`: if a forbidden
    // key (render/generateImage/generateVideo/etc.) is ever added to
    // `VideoProjectQualityLoopEffects`, `pnpm check` (tsc) fails to compile
    // that file. This runtime test only documents the intent at the call
    // site the section-06 spec's test list names.
    const effectNames: Array<keyof VideoProjectQualityLoopEffects> = [
      "runReview",
      "repairStage",
      "persistReview",
      "recomputeMetrics",
    ];
    const forbidden = ["render", "renderVideo", "queueRender", "generateImage", "generateVideo", "generateAudio"];
    for (const name of effectNames) {
      expect(forbidden).not.toContain(name);
    }
  });
});
