import { describe, expect, it } from "vitest";

import {
  buildStagedImagePrompt,
  type StagedCastMember,
  type StagedStoryArcPlan,
} from "../marketplaceAutoReviewStoryArcPlanner";

describe("staged image prompt minor safety", () => {
  it("marks an under-18 supporting portrait as silent and supervised", () => {
    const host: StagedCastMember = {
      castId: "cast-1",
      name: "Ann",
      source: "uploaded",
      role: "host",
      imageIndex: 2,
    };
    const minor: StagedCastMember = {
      castId: "cast-2",
      name: "Pui",
      source: "uploaded",
      role: "support",
      ageRange: "9 years old",
      depictsMinor: true,
      imageIndex: 3,
    };
    const plan = {
      storySummary: "The host reviews the product with a supporting character.",
      product: { productName: "Test product" },
      languagePlan: { promptLanguage: "en" },
      cast: [host, minor],
    } as StagedStoryArcPlan;
    const shot = {
      shotId: 1,
      title: "Opening",
      storySummary: "The host begins the review.",
      visualSummary: "The host presents the product.",
      dialogue: "Ann: Here is the product.",
      movementDirection: "The host presents the product.",
      durationSeconds: 10,
      castInShot: ["cast-1", "cast-2"],
      supportingBeats: [
        { castId: "cast-2", action: "quietly watches the host" },
      ],
    } as const;

    const prompt = buildStagedImagePrompt({
      plan,
      shot,
      customManifest: [
        { url: "https://example.test/product.png", role: "product" },
        { url: "https://example.test/host.png", role: "character" },
        { url: "https://example.test/minor.png", role: "character" },
      ],
    });

    expect(prompt).toContain("Pui are under 18");
    expect(prompt).toContain("silent supporting characters");
    expect(prompt).toContain("no dialogue or lip movement");
    expect(prompt).toContain("adult supervision in the same frame");
  });
});
