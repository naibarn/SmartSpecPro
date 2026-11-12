import { describe, expect, it } from "vitest";

import { assertStoryPlanApprovedForPromptRefreshForTest } from "../marketplaceAutoReviewStagedCheckpointRouterService";

describe("saved prompt dispatch story approval boundary", () => {
  const metadata = {
    stagedSequentialStoryboard: {
      reviewCheckpoints: [
        {
          kind: "story_plan",
          state: "awaiting",
          revision: 2,
        },
      ],
    },
  };

  it("allows dispatching a saved prompt while the latest story revision awaits confirmation", () => {
    expect(() =>
      assertStoryPlanApprovedForPromptRefreshForTest(metadata, [
        { shotId: 5, stage: "image" },
      ])
    ).not.toThrow();
  });

  it("keeps story approval required when a new prompt must be authored", () => {
    expect(() =>
      assertStoryPlanApprovedForPromptRefreshForTest(metadata, [
        {
          shotId: 5,
          stage: "image",
          promptOnly: true,
          refreshPrompt: true,
        },
      ])
    ).toThrow("staged_story_plan_not_approved");
  });
});
