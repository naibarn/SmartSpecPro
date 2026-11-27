import { describe, expect, it } from "vitest";

import {
  inferMarketplaceSingleSpeakerDialogueDefault,
} from "../marketplaceAutoReviewVideoPromptSkillRunner";
import type { StagedCastMember } from "../marketplaceAutoReviewStoryArcPlanner";

describe("Auto Review solo speaker fallback", () => {
  it("uses the only eligible adult lead when silent supporting cast members are present", () => {
    const cast = [
      { castId: "cast-1", name: "Host", role: "host", source: "uploaded", imageIndex: 1 },
      { castId: "cast-2", name: "Adult support", role: "support", source: "uploaded", imageIndex: 2 },
      { castId: "cast-3", name: "Child", role: "support", source: "uploaded", imageIndex: 3, depictsMinor: true },
    ] as StagedCastMember[];

    expect(inferMarketplaceSingleSpeakerDialogueDefault(cast)).toBe("Host");
  });

  it("does not infer a default when two adult lead speakers exist", () => {
    const cast = [
      { castId: "cast-1", name: "Host", role: "host", source: "uploaded", imageIndex: 1 },
      { castId: "cast-2", name: "Guest", role: "guest", source: "uploaded", imageIndex: 2 },
      { castId: "cast-3", name: "Child", role: "support", source: "uploaded", imageIndex: 3, depictsMinor: true },
    ] as StagedCastMember[];

    expect(inferMarketplaceSingleSpeakerDialogueDefault(cast)).toBeUndefined();
  });
});
