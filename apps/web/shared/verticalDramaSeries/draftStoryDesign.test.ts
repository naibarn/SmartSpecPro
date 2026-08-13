import { describe, expect, it } from "vitest";
import {
  buildVerticalDramaDraftStoryDesignPrompt,
  readDraftStoryControlSeed,
  readVerticalDramaDraftStoryDesign,
  renderVerticalDramaDraftStoryDesignBlock,
} from "./draftStoryDesign";

const design = {
  contractVersion: 1 as const,
  primaryEngine:
    "Academic rivalry becomes an earned romance under scholarship pressure.",
  secondaryEngines: ["family expectation"],
  pressureThreads: [
    {
      threadId: "scholarship-risk",
      label: "Scholarship risk",
      description:
        "The lead may lose funding if writing and presentation do not improve.",
      category: "career_or_school" as const,
      episodeWindow: { startEpisode: 1, endEpisode: 8 },
    },
  ],
  earlyPayoff: {
    promise:
      "The lead solves a problem nobody else can solve in an early episode.",
    episodeWindow: { startEpisode: 1, endEpisode: 2 },
    evidence: "A public classroom challenge changes how the rival sees her.",
  },
  romanceProgression: [
    {
      phase: "friction" as const,
      episodeWindow: { startEpisode: 1, endEpisode: 2 },
      pair: ["lead", "rival"] as [string, string],
      purpose: "They compete before they understand one another.",
      allowPause: true,
    },
  ],
  advantageBeats: [
    {
      episodeNumber: 2,
      advantagedSide: "protagonist" as const,
      cost: "She gains respect but attracts scrutiny.",
      opponentResponse: "The rival raises the difficulty.",
      purpose: "Show competence and keep the romance engine active.",
    },
  ],
  conflictGuardrails: ["Do not make racism the default conflict engine."],
  storyControlSeed: {
    contractVersion: 1 as const,
    premiseAnchor:
      "A scholarship student proves that language confidence is not intelligence.",
    canonicalCharacterKeys: ["lead", "rival"],
    threadCandidates: [],
    romancePhaseSkeleton: [],
    advantageIntent: [],
  },
};

describe("draft story design contract", () => {
  it("accepts a bounded design with a valid control seed", () => {
    const parsed = readVerticalDramaDraftStoryDesign(design);
    expect(parsed?.primaryEngine).toContain("Academic rivalry");
    expect(
      readDraftStoryControlSeed(parsed, { totalEpisodeCount: 8 })
        ?.canonicalCharacterKeys
    ).toEqual(["lead", "rival"]);
  });

  it("renders a labeled control block and prompt guardrails", () => {
    expect(renderVerticalDramaDraftStoryDesignBlock(design)).toContain(
      "The primary engine and bounded pressure threads are the spine"
    );
    expect(
      buildVerticalDramaDraftStoryDesignPrompt({ targetEpisodeCount: 8 })
    ).toContain("Advantage beats must alternate meaningful advantage and cost");
  });

  it("rejects a dangling seed through the shared validator", () => {
    expect(
      readDraftStoryControlSeed({
        ...design,
        storyControlSeed: {
          ...design.storyControlSeed,
          canonicalCharacterKeys: ["lead", "lead"],
        },
      })
    ).toBeNull();
  });
});
