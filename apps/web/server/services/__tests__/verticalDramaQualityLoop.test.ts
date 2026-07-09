/**
 * Coverage for `verticalDramaQualityLoop.ts`'s bounded auto-improve loop
 * orchestrator (spec §16.1 / section-14-script-quality-qc-auto-improve).
 * Every effect is a `vi.fn()` mock — no DB/LLM/credit imports are exercised
 * here, matching the orchestrator's own pure-with-injected-effects design.
 */
import { describe, expect, it, vi } from "vitest";
import {
  VERTICAL_DRAMA_QUALITY_POLICY_DEFAULTS,
  type VerticalDramaQualityPolicy,
  type VerticalDramaQualityScorecardDimensions,
} from "@shared/verticalDramaSeries/qualityPolicy";
import {
  estimateVerticalDramaQualityLoopCredits,
  runVerticalDramaQualityLoop,
  type VerticalDramaQualityLoopEffects,
  type VerticalDramaQualityLoopReviewLike,
} from "../verticalDramaQualityLoop";
import { VD_STORY_LOCK_SCRIPT_REPAIR_CONSTRAINT } from "../verticalDramaQualityReviewApply";
import type { VerticalDramaDensityMetrics } from "../verticalDramaEpisodeQualityReview";

function policy(overrides: Partial<VerticalDramaQualityPolicy> = {}): VerticalDramaQualityPolicy {
  return { ...VERTICAL_DRAMA_QUALITY_POLICY_DEFAULTS, ...overrides };
}

function scorecard(
  overall: number,
  overrides: Partial<VerticalDramaQualityScorecardDimensions> = {},
): VerticalDramaQualityScorecardDimensions {
  return {
    overall,
    reversal_sharpness: overall,
    emotion_variety: overall,
    dialogue_naturalness: overall,
    pacing: overall,
    ...overrides,
  };
}

function densityMetrics(): VerticalDramaDensityMetrics {
  return {
    estimated_speech_seconds: 40,
    per_clip_coverage: {
      clips_evaluated: 9,
      clips_below_min_ratio: 0,
      clips_below_error_ratio: 0,
      average_coverage_ratio: 0.6,
    },
    silent_gap_count: 0,
    duplicate_line_count: 0,
    stage_direction_count: 0,
    reversal_count: 2,
    max_consecutive_same_emotion: 1,
  };
}

interface MockEffects extends VerticalDramaQualityLoopEffects {
  runReview: ReturnType<typeof vi.fn>;
  repairStage: ReturnType<typeof vi.fn>;
  persistReview: ReturnType<typeof vi.fn>;
  recomputeDensityMetrics: ReturnType<typeof vi.fn>;
}

function makeEffects(): MockEffects {
  let artifactCounter = 0;
  return {
    runReview: vi.fn(),
    repairStage: vi.fn(async () => {}),
    persistReview: vi.fn(async () => `artifact-${++artifactCounter}`),
    recomputeDensityMetrics: vi.fn(() => densityMetrics()),
  };
}

describe("runVerticalDramaQualityLoop — pass within maxAutoImproveRounds", () => {
  it("runs one round and stops with status passed when the re-review clears policy floors", async () => {
    const effects = makeEffects();
    effects.runReview.mockResolvedValueOnce({
      scorecard: scorecard(4),
      issues: [],
    } satisfies VerticalDramaQualityLoopReviewLike);

    const result = await runVerticalDramaQualityLoop({
      episodeId: "ep-1",
      policy: policy({ maxAutoImproveRounds: 2 }),
      initialReview: {
        artifactId: "artifact-initial",
        review: { scorecard: scorecard(2), issues: [{ location: "shot 1", problem: "p", suggested_fix: "f" }] },
      },
      effects,
    });

    expect(result.status).toBe("passed");
    expect(result.rounds).toHaveLength(1);
    expect(result.rounds[0]).toMatchObject({
      round: 1,
      reviewArtifactId: "artifact-initial",
      overallBefore: 2,
      overallAfter: 4,
    });
    expect(result.activeReviewArtifactId).toBe(result.rounds[0].reReviewArtifactId);
    expect(effects.runReview).toHaveBeenCalledTimes(1);
    expect(effects.persistReview).toHaveBeenCalledTimes(1);
  });

  it("short-circuits with zero rounds when the initial review already passes", async () => {
    const effects = makeEffects();

    const result = await runVerticalDramaQualityLoop({
      episodeId: "ep-1",
      policy: policy({ maxAutoImproveRounds: 2 }),
      initialReview: {
        artifactId: "artifact-initial",
        review: { scorecard: scorecard(4), issues: [] },
      },
      effects,
    });

    expect(result).toEqual({
      episodeId: "ep-1",
      rounds: [],
      status: "passed",
      activeReviewArtifactId: "artifact-initial",
    });
    expect(effects.runReview).not.toHaveBeenCalled();
    expect(effects.repairStage).not.toHaveBeenCalled();
    expect(effects.persistReview).not.toHaveBeenCalled();
    expect(effects.recomputeDensityMetrics).not.toHaveBeenCalled();
  });
});

describe("runVerticalDramaQualityLoop — regression guard (spec §16.1 rule 3)", () => {
  it("stops immediately on regression, keeps the pre-round artifact active, and preserves both reports", async () => {
    const effects = makeEffects();
    effects.runReview.mockResolvedValueOnce({
      scorecard: scorecard(2), // LOWER than the pre-round review's overall (3) — a regression.
      issues: [],
    } satisfies VerticalDramaQualityLoopReviewLike);

    const result = await runVerticalDramaQualityLoop({
      episodeId: "ep-2",
      policy: policy({ maxAutoImproveRounds: 2 }),
      initialReview: {
        artifactId: "artifact-initial",
        review: { scorecard: scorecard(3), issues: [{ location: "shot 1", problem: "p", suggested_fix: "f" }] },
      },
      effects,
    });

    expect(result.status).toBe("escalated_regression");
    // The PRE-round (better) artifact stays active, not the regressed one.
    expect(result.activeReviewArtifactId).toBe("artifact-initial");
    expect(result.rounds).toHaveLength(1);
    expect(result.rounds[0].overallBefore).toBe(3);
    expect(result.rounds[0].overallAfter).toBe(2);
    // Both reports remain visible/addressable via the round record.
    expect(result.rounds[0].reviewArtifactId).toBe("artifact-initial");
    expect(result.rounds[0].reReviewArtifactId).toBeTruthy();
    expect(result.rounds[0].reReviewArtifactId).not.toBe("artifact-initial");
    // The loop stops — it must NOT attempt a second round.
    expect(effects.runReview).toHaveBeenCalledTimes(1);
  });

  it("does not treat an equal overall score as a regression (continues looping)", async () => {
    const effects = makeEffects();
    effects.runReview
      .mockResolvedValueOnce({ scorecard: scorecard(3), issues: [] })
      .mockResolvedValueOnce({ scorecard: scorecard(3), issues: [] });

    const result = await runVerticalDramaQualityLoop({
      episodeId: "ep-2b",
      policy: policy({ maxAutoImproveRounds: 2 }),
      initialReview: {
        artifactId: "artifact-initial",
        review: { scorecard: scorecard(3), issues: [{ location: "shot 1", problem: "p", suggested_fix: "f" }] },
      },
      effects,
    });

    expect(result.status).toBe("escalated_max_rounds");
    expect(result.rounds).toHaveLength(2);
    expect(effects.runReview).toHaveBeenCalledTimes(2);
  });
});

describe("runVerticalDramaQualityLoop — max rounds exhausted", () => {
  it("stops after maxAutoImproveRounds without a pass, sets escalated_max_rounds, preserves every round", async () => {
    const effects = makeEffects();
    effects.runReview
      .mockResolvedValueOnce({ scorecard: scorecard(3), issues: [{ location: "shot 2", problem: "p2", suggested_fix: "f2" }] })
      .mockResolvedValueOnce({ scorecard: scorecard(3), issues: [] });

    const result = await runVerticalDramaQualityLoop({
      episodeId: "ep-3",
      policy: policy({ maxAutoImproveRounds: 2 }),
      initialReview: {
        artifactId: "artifact-initial",
        review: { scorecard: scorecard(2), issues: [{ location: "shot 1", problem: "p1", suggested_fix: "f1" }] },
      },
      effects,
    });

    expect(result.status).toBe("escalated_max_rounds");
    expect(result.rounds).toHaveLength(2);
    expect(result.rounds[0].round).toBe(1);
    expect(result.rounds[1].round).toBe(2);
    // Never regressed (2 -> 3 -> 3), so the active artifact is the LATEST re-review.
    expect(result.activeReviewArtifactId).toBe(result.rounds[1].reReviewArtifactId);
    expect(effects.runReview).toHaveBeenCalledTimes(2);
    expect(effects.persistReview).toHaveBeenCalledTimes(2);
  });
});

describe("runVerticalDramaQualityLoop — maxAutoImproveRounds: 0 disables the loop", () => {
  it("returns status idle (no effects called) when the initial review fails floor", async () => {
    const effects = makeEffects();

    const result = await runVerticalDramaQualityLoop({
      episodeId: "ep-4",
      policy: policy({ maxAutoImproveRounds: 0 }),
      initialReview: {
        artifactId: "artifact-initial",
        review: { scorecard: scorecard(2), issues: [{ location: "shot 1", problem: "p", suggested_fix: "f" }] },
      },
      effects,
    });

    expect(result).toEqual({
      episodeId: "ep-4",
      rounds: [],
      status: "idle",
      activeReviewArtifactId: "artifact-initial",
    });
    expect(effects.runReview).not.toHaveBeenCalled();
    expect(effects.repairStage).not.toHaveBeenCalled();
    expect(effects.persistReview).not.toHaveBeenCalled();
  });

  it("returns status passed (not idle) when the initial review already meets floor", async () => {
    const effects = makeEffects();

    const result = await runVerticalDramaQualityLoop({
      episodeId: "ep-4b",
      policy: policy({ maxAutoImproveRounds: 0 }),
      initialReview: {
        artifactId: "artifact-initial",
        review: { scorecard: scorecard(4), issues: [] },
      },
      effects,
    });

    expect(result.status).toBe("passed");
    expect(result.rounds).toEqual([]);
    expect(effects.runReview).not.toHaveBeenCalled();
  });
});

describe("runVerticalDramaQualityLoop — canonical repair-group order (spec §16.1 rule 2)", () => {
  it("repairs script, storyboard, dialogue, then tie-in — regardless of the issues' input order — only when tieInEnabled", async () => {
    const effects = makeEffects();
    effects.runReview.mockResolvedValueOnce({ scorecard: scorecard(4), issues: [] });

    await runVerticalDramaQualityLoop({
      episodeId: "ep-5",
      policy: policy({ maxAutoImproveRounds: 1 }),
      initialReview: {
        artifactId: "artifact-initial",
        review: {
          scorecard: scorecard(2),
          issues: [
            { location: "tie-in shot 8", problem: "p-tiein", suggested_fix: "f" },
            { location: "shot 1", problem: "p-storyboard", suggested_fix: "f" },
            { location: "line 3", problem: "p-dialogue", suggested_fix: "f" },
            { location: "beat 2", problem: "p-script", suggested_fix: "f" },
          ],
        },
      },
      effects,
      tieInEnabled: true,
    });

    expect(effects.repairStage).toHaveBeenCalledTimes(4);
    expect(effects.repairStage.mock.calls[0][0]).toBe("plan_episode_script");
    expect(effects.repairStage.mock.calls[1][0]).toBe("storyboard_shotgrid");
    expect(effects.repairStage.mock.calls[2][0]).toBe("dialogue_audio_plan");
    expect(effects.repairStage.mock.calls[3][0]).toBe("tie_in");
  });

  it("dialogue issues repair as the third group even when tie-in is not enabled", async () => {
    const effects = makeEffects();
    effects.runReview.mockResolvedValueOnce({ scorecard: scorecard(4), issues: [] });

    await runVerticalDramaQualityLoop({
      episodeId: "ep-5b",
      policy: policy({ maxAutoImproveRounds: 1 }),
      initialReview: {
        artifactId: "artifact-initial",
        review: {
          scorecard: scorecard(2),
          issues: [
            { location: "line 3", problem: "p-dialogue", suggested_fix: "f" },
            { location: "shot 1", problem: "p-storyboard", suggested_fix: "f" },
          ],
        },
      },
      effects,
      // tieInEnabled omitted — default false.
    });

    expect(effects.repairStage).toHaveBeenCalledTimes(2);
    expect(effects.repairStage.mock.calls[0][0]).toBe("storyboard_shotgrid");
    expect(effects.repairStage.mock.calls[1][0]).toBe("dialogue_audio_plan");
  });

  it("never produces a tie_in repair call when tieInEnabled is omitted, even with tie-in-flavored locations", async () => {
    const effects = makeEffects();
    effects.runReview.mockResolvedValueOnce({ scorecard: scorecard(4), issues: [] });

    await runVerticalDramaQualityLoop({
      episodeId: "ep-5c",
      policy: policy({ maxAutoImproveRounds: 1 }),
      initialReview: {
        artifactId: "artifact-initial",
        review: {
          scorecard: scorecard(2),
          issues: [{ location: "tie-in shot 8", problem: "p", suggested_fix: "f" }],
        },
      },
      effects,
    });

    expect(effects.repairStage).toHaveBeenCalledTimes(1);
    expect(effects.repairStage.mock.calls[0][0]).toBe("storyboard_shotgrid");
  });
});

describe("runVerticalDramaQualityLoop — each round re-derives from the CURRENT review (spec §16.1 rule 7)", () => {
  it("round 2's storyboard repair instruction is composed from round 2's (round 1's re-review) issues, not the original review", async () => {
    const effects = makeEffects();
    effects.runReview
      .mockResolvedValueOnce({
        scorecard: scorecard(3), // still fails (< minOverall 4), not a regression (2 -> 3)
        issues: [{ location: "shot 5", problem: "round-1-rereview-issue", suggested_fix: "fix-5" }],
      })
      .mockResolvedValueOnce({ scorecard: scorecard(4), issues: [] });

    await runVerticalDramaQualityLoop({
      episodeId: "ep-6",
      policy: policy({ maxAutoImproveRounds: 2 }),
      initialReview: {
        artifactId: "artifact-initial",
        review: {
          scorecard: scorecard(2),
          issues: [{ location: "shot 1", problem: "original-issue", suggested_fix: "fix-1" }],
        },
      },
      effects,
    });

    expect(effects.repairStage).toHaveBeenCalledTimes(2);
    // Round 1 repairs from the ORIGINAL review's issue.
    expect(effects.repairStage.mock.calls[0][1]).toContain("shot 1");
    expect(effects.repairStage.mock.calls[0][1]).toContain("original-issue");
    // Round 2 repairs from ROUND 1's RE-REVIEW issue — never the original.
    expect(effects.repairStage.mock.calls[1][1]).toContain("shot 5");
    expect(effects.repairStage.mock.calls[1][1]).toContain("round-1-rereview-issue");
    expect(effects.repairStage.mock.calls[1][1]).not.toContain("original-issue");
  });
});

describe("runVerticalDramaQualityLoop — never calls any media-generation effect", () => {
  it("only ever calls the 4 documented effect members (no image/video/TTS member exists on the interface)", async () => {
    const effects = makeEffects();
    effects.runReview.mockResolvedValueOnce({ scorecard: scorecard(4), issues: [] });

    // `effects` is typed as `VerticalDramaQualityLoopEffects` — TypeScript
    // itself guarantees there is no 5th "generateImage"/"generateVideo"/
    // "generateTts" member this loop could call even by accident; this test
    // additionally proves runtime call counts stay within the injected mocks.
    await runVerticalDramaQualityLoop({
      episodeId: "ep-7",
      policy: policy({ maxAutoImproveRounds: 1 }),
      initialReview: {
        artifactId: "artifact-initial",
        review: { scorecard: scorecard(2), issues: [{ location: "shot 1", problem: "p", suggested_fix: "f" }] },
      },
      effects,
    });

    const calledFunctionCount =
      effects.runReview.mock.calls.length +
      effects.repairStage.mock.calls.length +
      effects.persistReview.mock.calls.length +
      effects.recomputeDensityMetrics.mock.calls.length;
    expect(calledFunctionCount).toBeGreaterThan(0);
    expect(Object.keys(effects).sort()).toEqual(
      ["persistReview", "recomputeDensityMetrics", "repairStage", "runReview"].sort(),
    );
  });
});

describe("runVerticalDramaQualityLoop — credit/audit per round", () => {
  it("calls runReview and persistReview exactly once per round (the credit-tracked / audited effects)", async () => {
    const effects = makeEffects();
    effects.runReview
      .mockResolvedValueOnce({ scorecard: scorecard(3), issues: [{ location: "shot 2", problem: "p2", suggested_fix: "f2" }] })
      .mockResolvedValueOnce({ scorecard: scorecard(4), issues: [] });

    const result = await runVerticalDramaQualityLoop({
      episodeId: "ep-8",
      policy: policy({ maxAutoImproveRounds: 3 }),
      initialReview: {
        artifactId: "artifact-initial",
        review: { scorecard: scorecard(2), issues: [{ location: "shot 1", problem: "p1", suggested_fix: "f1" }] },
      },
      effects,
    });

    expect(result.rounds).toHaveLength(2);
    expect(effects.runReview).toHaveBeenCalledTimes(2);
    expect(effects.persistReview).toHaveBeenCalledTimes(2);
    expect(effects.recomputeDensityMetrics).toHaveBeenCalledTimes(2);
  });
});

describe("runVerticalDramaQualityLoop — no repairable issues", () => {
  it("still completes the round (recompute + re-review) when there is nothing to repair", async () => {
    const effects = makeEffects();
    effects.runReview.mockResolvedValueOnce({ scorecard: scorecard(2), issues: [] });

    const result = await runVerticalDramaQualityLoop({
      episodeId: "ep-9",
      policy: policy({ maxAutoImproveRounds: 1 }),
      initialReview: {
        artifactId: "artifact-initial",
        review: { scorecard: scorecard(2), issues: [] },
      },
      effects,
    });

    expect(effects.repairStage).not.toHaveBeenCalled();
    expect(effects.runReview).toHaveBeenCalledTimes(1);
    expect(result.status).toBe("escalated_max_rounds");
    expect(result.rounds[0].stagesRepaired).toEqual([]);
  });
});

describe("runVerticalDramaQualityLoop — W11.6 Story Lock", () => {
  it("omits storyLockRejections when storyLockEnabled is false or omitted (byte-identical state shape)", async () => {
    const effects = makeEffects();
    effects.runReview.mockResolvedValueOnce({ scorecard: scorecard(4), issues: [] });

    const result = await runVerticalDramaQualityLoop({
      episodeId: "ep-sl-1",
      policy: policy({ maxAutoImproveRounds: 1 }),
      initialReview: {
        artifactId: "artifact-initial",
        review: { scorecard: scorecard(2), issues: [{ location: "shot 1", problem: "p", suggested_fix: "f" }] },
      },
      effects,
      // storyLockEnabled omitted.
    });

    expect(result.status).toBe("passed");
    // Exact key set — no `storyLockRejections` key present at all (not even `undefined`).
    expect(Object.keys(result).sort()).toEqual(
      ["activeReviewArtifactId", "episodeId", "rounds", "status"].sort(),
    );
    expect(result.storyLockRejections).toBeUndefined();
  });

  it("does not append the story-lock constraint to composed instructions when storyLockEnabled is false", async () => {
    const effects = makeEffects();
    effects.runReview.mockResolvedValueOnce({ scorecard: scorecard(4), issues: [] });

    await runVerticalDramaQualityLoop({
      episodeId: "ep-sl-2",
      policy: policy({ maxAutoImproveRounds: 1 }),
      initialReview: {
        artifactId: "artifact-initial",
        review: { scorecard: scorecard(2), issues: [{ location: "beat 1", problem: "p", suggested_fix: "f" }] },
      },
      effects,
      storyLockEnabled: false,
    });

    expect(effects.repairStage.mock.calls[0][1]).not.toContain(VD_STORY_LOCK_SCRIPT_REPAIR_CONSTRAINT);
  });

  it("appends the story-lock constraint to the plan_episode_script instruction when storyLockEnabled is true", async () => {
    const effects = makeEffects();
    effects.runReview.mockResolvedValueOnce({ scorecard: scorecard(4), issues: [] });

    await runVerticalDramaQualityLoop({
      episodeId: "ep-sl-3",
      policy: policy({ maxAutoImproveRounds: 1 }),
      initialReview: {
        artifactId: "artifact-initial",
        review: { scorecard: scorecard(2), issues: [{ location: "beat 1", problem: "p", suggested_fix: "f" }] },
      },
      effects,
      storyLockEnabled: true,
    });

    expect(effects.repairStage.mock.calls[0][0]).toBe("plan_episode_script");
    expect(effects.repairStage.mock.calls[0][1]).toContain(VD_STORY_LOCK_SCRIPT_REPAIR_CONSTRAINT);
  });

  it("tallies storyLockRejections from effects.repairStage's { storyLockViolated: true } signal across rounds", async () => {
    const effects = makeEffects();
    // Round 1: script repair reports a violation; storyboard repair does not.
    effects.repairStage
      .mockResolvedValueOnce({ storyLockViolated: true })
      .mockResolvedValueOnce({ storyLockViolated: false })
      // Round 2: no violation.
      .mockResolvedValueOnce(undefined);
    effects.runReview
      .mockResolvedValueOnce({ scorecard: scorecard(3), issues: [{ location: "shot 2", problem: "p2", suggested_fix: "f2" }] })
      .mockResolvedValueOnce({ scorecard: scorecard(4), issues: [] });

    const result = await runVerticalDramaQualityLoop({
      episodeId: "ep-sl-4",
      policy: policy({ maxAutoImproveRounds: 2 }),
      initialReview: {
        artifactId: "artifact-initial",
        review: {
          scorecard: scorecard(2),
          issues: [
            { location: "beat 1", problem: "p-script", suggested_fix: "f" },
            { location: "shot 1", problem: "p-storyboard", suggested_fix: "f" },
          ],
        },
      },
      effects,
      storyLockEnabled: true,
    });

    expect(result.status).toBe("passed");
    expect(result.storyLockRejections).toBe(1);
  });

  it("a repairStage resolving to undefined/void (every pre-W11.6 mock) never counts as a violation", async () => {
    const effects = makeEffects(); // default repairStage resolves to undefined
    effects.runReview.mockResolvedValueOnce({ scorecard: scorecard(4), issues: [] });

    const result = await runVerticalDramaQualityLoop({
      episodeId: "ep-sl-5",
      policy: policy({ maxAutoImproveRounds: 1 }),
      initialReview: {
        artifactId: "artifact-initial",
        review: { scorecard: scorecard(2), issues: [{ location: "shot 1", problem: "p", suggested_fix: "f" }] },
      },
      effects,
      storyLockEnabled: true,
    });

    expect(result.storyLockRejections).toBeUndefined();
  });
});

describe("estimateVerticalDramaQualityLoopCredits", () => {
  it("multiplies the per-round estimate by the max round count", () => {
    expect(estimateVerticalDramaQualityLoopCredits(20, 2)).toBe(40);
    expect(estimateVerticalDramaQualityLoopCredits(20, 3)).toBe(60);
  });

  it("returns 0 when maxAutoImproveRounds is 0", () => {
    expect(estimateVerticalDramaQualityLoopCredits(20, 0)).toBe(0);
  });

  it("never returns a negative number for negative inputs", () => {
    expect(estimateVerticalDramaQualityLoopCredits(-5, 2)).toBe(0);
    expect(estimateVerticalDramaQualityLoopCredits(20, -1)).toBe(0);
  });
});
