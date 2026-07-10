import { describe, expect, it } from "vitest";
import { findCastVisuallySimilarPairs } from "../verticalDramaCastContrast";
import type { VerticalDramaCharacterVisualBible } from "@shared/verticalDramaSeries/characterProfile";

function bible(over: Partial<VerticalDramaCharacterVisualBible> = {}): VerticalDramaCharacterVisualBible {
  return {
    version: 1,
    createdAt: "now",
    model: "test",
    visualIdentitySummary: "lead",
    identityAnchors: [],
    signatureWardrobe: "navy blazer",
    hairMakeupNotes: "short bob",
    performanceEnergy: "tense",
    consistencyStrategy: "consistent",
    signatureVisualCues: ["round glasses"],
    colorPalette: "navy silver",
    storyWorldRelationship: "office",
    forbiddenDrift: [],
    emotionalRangeNeeded: [],
    ageRange: "30s",
    ...over,
  };
}

describe("findCastVisuallySimilarPairs", () => {
  it("flags same-tier characters with overlapping visual bibles", () => {
    const findings = findCastVisuallySimilarPairs([
      { characterId: 1, characterKey: "a", tier: "lead_female", visualBible: bible(), hasApprovedAnchor: false },
      { characterId: 2, characterKey: "b", tier: "lead_female", visualBible: bible(), hasApprovedAnchor: false },
    ]);

    expect(findings).toHaveLength(1);
    expect(findings[0].overlapAxes).toContain("palette");
    expect(findings[0].requiresUserApproval).toBe(false);
  });

  it("requires approval when any character in the similar pair has an approved anchor", () => {
    const findings = findCastVisuallySimilarPairs([
      { characterId: 1, characterKey: "a", tier: "lead_female", visualBible: bible(), hasApprovedAnchor: true },
      { characterId: 2, characterKey: "b", tier: "lead_female", visualBible: bible(), hasApprovedAnchor: false },
    ]);

    expect(findings[0]).toMatchObject({
      requiresUserApproval: true,
      suggestedDifferentiation: expect.stringContaining("b"),
    });
  });
});

