import { describe, expect, it } from "vitest";

import { VERTICAL_DRAMA_VISUAL_CONSISTENCY_FLAG_KEYS } from "@shared/featureFlags";
import { BASE_TENANT_FLAG_GROUPS } from "../tenantFeatureFlagGroups";

describe("Vertical Drama visual-consistency admin flags", () => {
  it("lists each rollout flag once in the Vertical Drama Series group", () => {
    const group = BASE_TENANT_FLAG_GROUPS.find(
      (candidate) => candidate.title === "Vertical Drama Series",
    );
    expect(group).toBeDefined();

    for (const key of VERTICAL_DRAMA_VISUAL_CONSISTENCY_FLAG_KEYS) {
      expect(group?.flags.filter((flag) => flag.key === key)).toHaveLength(1);
    }
  });

  it("lists all Enhanced rollout controls in the tenant admin UI", () => {
    const group = BASE_TENANT_FLAG_GROUPS.find(
      (candidate) => candidate.title === "Vertical Drama Series",
    );
    for (const key of [
      "verticalDramaEnhancedVideoPromptUi",
      "verticalDramaEnhancedVideoPromptJobs",
      "verticalDramaEnhancedVideoPromptApply",
    ]) {
      expect(group?.flags.filter((flag) => flag.key === key)).toHaveLength(1);
    }
  });

  it("provides traceable Thai-first descriptions", () => {
    const group = BASE_TENANT_FLAG_GROUPS.find(
      (candidate) => candidate.title === "Vertical Drama Series",
    );
    const expectedFeature = new Map([
      ["verticalDramaSeriesLookLock", "F139"],
      ["verticalDramaMotionContracts", "F137"],
      ["verticalDramaSceneContinuity", "F138 P1a"],
      ["verticalDramaSceneContinuityQc", "F138 P2"],
      ["verticalDramaSceneNeighborAnchors", "F138 P1b"],
      ["verticalDramaVideoSafeStartFrames", "F137 P2"],
      ["verticalDramaClipIdentityQc", "F137 P3"],
    ]);

    for (const [key, feature] of expectedFeature) {
      const entry = group?.flags.find((flag) => flag.key === key);
      expect(entry?.label.length).toBeGreaterThan(0);
      expect(entry?.description).toMatch(/[\u0E00-\u0E7F]/);
      expect(entry?.description).toContain(feature);
    }
  });
});
