import { describe, expect, it } from "vitest";

import {
  renderVisualNarrativeIdentityBlock,
  renderVisualNarrativeProfileBlock,
  verticalDramaVisualNarrativeProfileSchema,
} from "../visualNarrativeProfile";
import { getSeriesLookLockGenreIdentity } from "../seriesLookLock";

const profile = {
  version: 1 as const,
  emotionalRegister: "Tender, guarded, and quietly hopeful",
  worldTexture: "A lived-in summer town where warm practical light contrasts with old secrets.",
  recurringMotifs: [
    {
      motif: "faded cinema tickets",
      narrativeFunction: "Surface during moments when the couple chooses memory over performance.",
    },
  ],
  relationshipVisualLanguage: [
    {
      phase: "fake dating",
      visualExpression: "Public distance and private eyelines gradually become natural closeness.",
    },
  ],
  sceneOpportunities: ["Use the cinema lobby as a quiet place for an honest interruption."],
  constraints: [
    "Do not invent a new secret or alter the approved fake-dating premise to use the motif.",
  ],
};

describe("visual narrative DNA contract", () => {
  it("accepts the bounded profile and renders explicit soft-story guardrails", () => {
    const parsed = verticalDramaVisualNarrativeProfileSchema.safeParse(profile);
    expect(parsed.success).toBe(true);

    const rendered = renderVisualNarrativeProfileBlock(parsed.data);
    expect(rendered).toContain("VISUAL NARRATIVE DNA (SOFT STORY GUIDANCE)");
    expect(rendered).toContain("user premise and established canon");
    expect(rendered).toContain("Do not create, remove, resolve, or contradict");
    expect(rendered).toContain("faded cinema tickets");
  });

  it("keeps absent profile absent and provides a legacy-safe identity fallback", () => {
    expect(renderVisualNarrativeProfileBlock(undefined)).toBeNull();

    const rendered = renderVisualNarrativeIdentityBlock(
      getSeriesLookLockGenreIdentity("drama_romance"),
    );
    expect(rendered).toContain("VISUAL LOOK CONTEXT (LEGACY-SAFE, SOFT STORY GUIDANCE)");
    expect(rendered).toContain("Keep narrative/content language and spoken-language contracts unchanged");
  });
});
