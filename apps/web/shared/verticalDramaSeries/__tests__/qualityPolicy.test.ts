import { describe, expect, it } from "vitest";
import {
  evaluateScorecardAgainstPolicy,
  resolveQualityPolicy,
  VD_EXECUTION_DIMENSIONS,
  VD_STORY_DIMENSIONS,
  VERTICAL_DRAMA_QUALITY_LOOP_STATUSES,
  VERTICAL_DRAMA_QUALITY_POLICY_DEFAULTS,
  verticalDramaQualityLoopStateSchema,
  verticalDramaQualityPolicyColumnSchema,
  verticalDramaQualityPolicySchema,
  type VerticalDramaQualityLoopState,
  type VerticalDramaQualityPolicy,
} from "../qualityPolicy";

describe("VERTICAL_DRAMA_QUALITY_POLICY_DEFAULTS", () => {
  it("pins the exact spec §16.1 built-in defaults", () => {
    expect(VERTICAL_DRAMA_QUALITY_POLICY_DEFAULTS).toEqual({
      minOverall: 4,
      minPerDimension: 3,
      tieInMinNaturalnessScore: 70,
      maxAutoImproveRounds: 2,
      autoRunReviewAfterStoryboard: true,
      blockPaidGenerationBelowFloor: true,
    } satisfies VerticalDramaQualityPolicy);
  });
});

describe("resolveQualityPolicy", () => {
  it("returns the built-in defaults when neither layer is provided", () => {
    expect(resolveQualityPolicy()).toEqual(
      VERTICAL_DRAMA_QUALITY_POLICY_DEFAULTS
    );
    expect(resolveQualityPolicy(null, null)).toEqual(
      VERTICAL_DRAMA_QUALITY_POLICY_DEFAULTS
    );
  });

  it("applies a series-level override on top of the defaults", () => {
    const resolved = resolveQualityPolicy({ minOverall: 5 });
    expect(resolved.minOverall).toBe(5);
    expect(resolved.minPerDimension).toBe(
      VERTICAL_DRAMA_QUALITY_POLICY_DEFAULTS.minPerDimension
    );
  });

  it("applies a tenant-level override when the series layer is absent", () => {
    const resolved = resolveQualityPolicy(null, { minPerDimension: 4 });
    expect(resolved.minPerDimension).toBe(4);
    expect(resolved.minOverall).toBe(
      VERTICAL_DRAMA_QUALITY_POLICY_DEFAULTS.minOverall
    );
  });

  it("merges series -> tenant -> defaults FIELD BY FIELD, series always winning where set", () => {
    const resolved = resolveQualityPolicy(
      { minOverall: 5, blockPaidGenerationBelowFloor: false },
      { minOverall: 2, minPerDimension: 2, tieInMinNaturalnessScore: 80 }
    );

    // Series sets minOverall -> series wins over tenant's conflicting value.
    expect(resolved.minOverall).toBe(5);
    // Series does not set minPerDimension -> tenant's value is used.
    expect(resolved.minPerDimension).toBe(2);
    // Series does not set tieInMinNaturalnessScore -> tenant's value is used.
    expect(resolved.tieInMinNaturalnessScore).toBe(80);
    // Series sets blockPaidGenerationBelowFloor -> series wins.
    expect(resolved.blockPaidGenerationBelowFloor).toBe(false);
    // Neither layer sets autoRunReviewAfterStoryboard -> built-in default.
    expect(resolved.autoRunReviewAfterStoryboard).toBe(
      VERTICAL_DRAMA_QUALITY_POLICY_DEFAULTS.autoRunReviewAfterStoryboard
    );
  });

  it("clamps maxAutoImproveRounds to 0-3 regardless of layer", () => {
    expect(
      resolveQualityPolicy({ maxAutoImproveRounds: -1 }).maxAutoImproveRounds
    ).toBe(0);
    expect(
      resolveQualityPolicy({ maxAutoImproveRounds: 7 }).maxAutoImproveRounds
    ).toBe(3);
    expect(
      resolveQualityPolicy({ maxAutoImproveRounds: 1 }).maxAutoImproveRounds
    ).toBe(1);
  });

  it("is deterministic — identical input yields identical output", () => {
    const build = () =>
      resolveQualityPolicy({ minOverall: 5 }, { minPerDimension: 2 });
    expect(build()).toEqual(build());
  });
});

describe("evaluateScorecardAgainstPolicy", () => {
  const policy = VERTICAL_DRAMA_QUALITY_POLICY_DEFAULTS; // minOverall 4, minPerDimension 3

  it("passes when overall and every present dimension meet the floors", () => {
    const result = evaluateScorecardAgainstPolicy(
      {
        overall: 4,
        reversal_sharpness: 3,
        emotion_variety: 4,
        dialogue_naturalness: 3,
        pacing: 5,
      },
      policy
    );

    expect(result).toEqual({ passed: true, failingDimensions: [] });
  });

  it("fails when overall is below the floor", () => {
    const result = evaluateScorecardAgainstPolicy({ overall: 3 }, policy);
    expect(result.passed).toBe(false);
    expect(result.failingDimensions).toContain("overall");
  });

  it("fails a specific per-dimension score below the floor", () => {
    const result = evaluateScorecardAgainstPolicy(
      { overall: 4, pacing: 2, emotion_variety: 4 },
      policy
    );
    expect(result.passed).toBe(false);
    expect(result.failingDimensions).toEqual(["pacing"]);
  });

  it("never fails a null or absent dimension (v1 scorecards omit v2 dimensions entirely)", () => {
    const result = evaluateScorecardAgainstPolicy(
      {
        overall: 4,
        reversal_sharpness: 4,
        emotion_variety: 4,
        dialogue_naturalness: null, // not judged
        pacing: 4,
        // hook_strength / cliffhanger_strength / continuity_consistency / tie_in_naturalness
        // are absent entirely, as in a v1 scorecard.
      },
      policy
    );

    expect(result.passed).toBe(true);
    expect(result.failingDimensions).toEqual([]);
  });

  it("is deterministic — identical input yields identical output", () => {
    const scorecard = { overall: 3, pacing: 2 };
    expect(evaluateScorecardAgainstPolicy(scorecard, policy)).toEqual(
      evaluateScorecardAgainstPolicy(scorecard, policy)
    );
  });
});

describe("verticalDramaQualityPolicySchema", () => {
  it("parses an empty object into the full set of defaults", () => {
    expect(verticalDramaQualityPolicySchema.parse({})).toEqual(
      VERTICAL_DRAMA_QUALITY_POLICY_DEFAULTS
    );
  });

  it("parses a partial override, keeping schema defaults for the rest", () => {
    const parsed = verticalDramaQualityPolicySchema.parse({ minOverall: 5 });
    expect(parsed.minOverall).toBe(5);
    expect(parsed.minPerDimension).toBe(
      VERTICAL_DRAMA_QUALITY_POLICY_DEFAULTS.minPerDimension
    );
  });

  it("rejects maxAutoImproveRounds outside 0-3", () => {
    expect(() =>
      verticalDramaQualityPolicySchema.parse({ maxAutoImproveRounds: 4 })
    ).toThrow();
    expect(() =>
      verticalDramaQualityPolicySchema.parse({ maxAutoImproveRounds: -1 })
    ).toThrow();
  });

  it("is passthrough-tolerant of unknown future fields", () => {
    const parsed = verticalDramaQualityPolicySchema.parse({
      futureField: "reserved",
    });
    expect(parsed).toMatchObject(VERTICAL_DRAMA_QUALITY_POLICY_DEFAULTS);
  });
});

describe("verticalDramaQualityPolicyColumnSchema", () => {
  it("tolerates the nullable jsonb column being null", () => {
    expect(verticalDramaQualityPolicyColumnSchema.parse(null)).toBeNull();
  });
});

describe("quality loop state contracts", () => {
  it("pins the exact 5 loop statuses from spec §16.1", () => {
    expect(VERTICAL_DRAMA_QUALITY_LOOP_STATUSES).toEqual([
      "idle",
      "running",
      "passed",
      "escalated_max_rounds",
      "escalated_regression",
    ]);
  });

  it("validates a full loop state referencing real pipeline stages", () => {
    const state: VerticalDramaQualityLoopState = {
      episodeId: "episode-1",
      rounds: [
        {
          round: 1,
          reviewArtifactId: "artifact-review-1",
          stagesRepaired: ["plan_episode_script", "storyboard_shotgrid"],
          reReviewArtifactId: "artifact-review-2",
          overallBefore: 2,
          overallAfter: 4,
        },
      ],
      status: "passed",
      activeReviewArtifactId: "artifact-review-2",
    };

    expect(() =>
      verticalDramaQualityLoopStateSchema.parse(state)
    ).not.toThrow();
  });

  it("accepts storyLockRejections (W11.6 tolerant field) and still accepts state without it", () => {
    const state: VerticalDramaQualityLoopState = {
      episodeId: "episode-1",
      rounds: [],
      status: "escalated_max_rounds",
      activeReviewArtifactId: "artifact-review-1",
      storyLockRejections: 2,
    };
    expect(() => verticalDramaQualityLoopStateSchema.parse(state)).not.toThrow();

    const withoutField: VerticalDramaQualityLoopState = {
      episodeId: "episode-1",
      rounds: [],
      status: "passed",
      activeReviewArtifactId: "artifact-review-1",
    };
    const parsed = verticalDramaQualityLoopStateSchema.parse(withoutField);
    expect(parsed.storyLockRejections).toBeUndefined();
  });

  it("rejects a negative storyLockRejections", () => {
    expect(() =>
      verticalDramaQualityLoopStateSchema.parse({
        episodeId: "episode-1",
        rounds: [],
        status: "passed",
        activeReviewArtifactId: "artifact-review-1",
        storyLockRejections: -1,
      })
    ).toThrow();
  });
});

describe("VD_STORY_DIMENSIONS / VD_EXECUTION_DIMENSIONS (W11.6 Story Lock)", () => {
  it("pins the exact 5 story dimensions", () => {
    expect(VD_STORY_DIMENSIONS).toEqual([
      "reversal_count",
      "reversal_sharpness",
      "hook_strength",
      "cliffhanger_strength",
      "continuity_consistency",
    ]);
  });

  it("pins the exact 3 execution dimensions", () => {
    expect(VD_EXECUTION_DIMENSIONS).toEqual([
      "dialogue_naturalness",
      "emotion_variety",
      "pacing",
    ]);
  });

  it("never overlaps between story and execution", () => {
    const story = new Set<string>(VD_STORY_DIMENSIONS);
    const overlap = VD_EXECUTION_DIMENSIONS.filter(dim => story.has(dim));
    expect(overlap).toEqual([]);
  });

  it("excludes overall and tie_in_naturalness from both lists", () => {
    const all = new Set<string>([...VD_STORY_DIMENSIONS, ...VD_EXECUTION_DIMENSIONS]);
    expect(all.has("overall")).toBe(false);
    expect(all.has("tie_in_naturalness")).toBe(false);
  });
});
