/**
 * Coverage for `videoProjectQualityLoop.ts`'s single-round DI loop (Feature
 * 133, section-06 §5.3). Every effect is a `vi.fn()` mock — this module does
 * no DB/LLM/render calls itself, matching its pure-with-injected-effects
 * design. Phase 1 runs exactly ONE review round; `repairStage` /
 * `recomputeMetrics` exist on the interface for Phase 3 forward-compat but
 * MUST NOT be called in this MVP path.
 */
import { describe, expect, it, vi } from "vitest";

import {
  runVideoProjectQualityLoop,
  type VideoProjectQualityLoopEffects,
  type VideoProjectReview,
} from "../videoProjectQualityLoop";
import type { VideoProjectQualityMetrics } from "../videoProjectQualityMetrics";

function metrics(): VideoProjectQualityMetrics {
  return {
    sceneDurations: [],
    captionCps: [],
    layerCounts: { perScene: [], total: 0, maxLayersPerScene: 0 },
    safeAreaViolations: [],
    claimCoverage: { coverage: 1, mappedCount: 0, unmappedCount: 0, prohibitedCount: 0 },
    renderCost: { score: 0, cls: "low", recommendPreRender: false },
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
  it("runs exactly one review round in MVP (maxLoops=1)", async () => {
    const effects = makeEffects();
    effects.runReview.mockResolvedValueOnce(review());

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
    expect(call.metrics).toMatchObject({
      sceneDurations: [],
      captionCps: [],
      layerCounts: { perScene: [], total: 0, maxLayersPerScene: 0 },
      safeAreaViolations: [],
      claimCoverage: { coverage: 1, mappedCount: 0, unmappedCount: 0, prohibitedCount: 0 },
    });
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
    effects.runReview.mockResolvedValueOnce(review());

    const result = await runVideoProjectQualityLoop({
      projectId: "proj-1",
      policy: { targetScore: 8 },
      metrics: metrics(),
      effects,
    });

    expect(result.rounds).toBe(1);
    expect(effects.runReview).toHaveBeenCalledTimes(1);
  });

  it("does not call repairStage in the single-round MVP path (even when a larger maxLoops is requested)", async () => {
    const effects = makeEffects();
    effects.runReview.mockResolvedValueOnce(review());

    const result = await runVideoProjectQualityLoop({
      projectId: "proj-1",
      // A larger requested maxLoops still caps to exactly 1 round in Phase 1.
      policy: { targetScore: 8, maxLoops: 5 },
      metrics: metrics(),
      effects,
    });

    expect(result.rounds).toBe(1);
    expect(effects.repairStage).not.toHaveBeenCalled();
    expect(effects.recomputeMetrics).not.toHaveBeenCalled();
  });

  it("uses initialReview when provided instead of calling runReview", async () => {
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
