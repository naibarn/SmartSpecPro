import { describe, expect, it } from "vitest";

import {
  resolveMarketplaceAutoReviewPlanningArchitecture,
  shouldDispatchStagedMarketplaceAutoReview,
} from "../marketplaceAutoReviewService";

describe("Feature 141 architecture selection", () => {
  it("freezes staged v2 only for eligible sequential runs", () => {
    expect(
      resolveMarketplaceAutoReviewPlanningArchitecture({
        frameStrategy: "sequential_shot_storyboard",
        stagedSequentialStoryboardV2Enabled: true,
      })
    ).toBe("staged_two_skill_v2");
    expect(
      resolveMarketplaceAutoReviewPlanningArchitecture({
        frameStrategy: "storyboard_3x3_split",
        stagedSequentialStoryboardV2Enabled: true,
      })
    ).toBeNull();
  });

  it("keeps the legacy sequential architecture when v2 is disabled", () => {
    expect(
      resolveMarketplaceAutoReviewPlanningArchitecture({
        frameStrategy: "sequential_shot_storyboard",
        stagedSequentialStoryboardV2Enabled: false,
      })
    ).toBe("monolithic_sequential_v1");
  });

  it("dispatches resume from persisted architecture instead of current flags", () => {
    expect(shouldDispatchStagedMarketplaceAutoReview("staged_two_skill_v2")).toBe(
      true
    );
    expect(shouldDispatchStagedMarketplaceAutoReview("monolithic_sequential_v1")).toBe(
      false
    );
    expect(shouldDispatchStagedMarketplaceAutoReview(undefined)).toBe(false);
  });
});
