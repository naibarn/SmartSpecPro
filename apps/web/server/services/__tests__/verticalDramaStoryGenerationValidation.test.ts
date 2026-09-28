import { describe, expect, it } from "vitest";
import { validateStoryGenerationOutput } from "../verticalDramaStoryGenerationValidation";
import type { StoryGenerationRunContract } from "../verticalDramaStoryGenerationContracts";

const contract = {
  contractHash: "c", qualityCriteriaVersion: 1, targetEpisodes: [1],
} as StoryGenerationRunContract;

describe("vertical drama story generation validation", () => {
  it("blocks empty output and duplicate episode scope", () => {
    const report = validateStoryGenerationOutput({
      contract: { ...contract, targetEpisodes: [1, 2] },
      output: [{ episodeNumber: 1 }, { episodeNumber: 1 }],
    });
    expect(report.passed).toBe(false);
    expect(report.findings.map((finding) => finding.code)).toContain("structure.duplicate_episode");
  });

  it("blocks a missing requested episode and preserves string beat alignment", () => {
    const report = validateStoryGenerationOutput({
      contract: { ...contract, targetEpisodes: [1, 2], expectedShots: null },
      plan: {
        episodes: [
          { episodeNumber: 1, keyBeats: ["Reveal the clue"] },
          { episodeNumber: 2, keyBeats: ["Confront the rival"] },
        ],
      },
      output: [{ episodeNumber: 1, keyBeats: ["Reveal the clue"] }],
    });
    expect(report.findings.map((finding) => finding.code)).toContain("structure.missing_episode");
    expect(report.alignment?.missingRequiredBeatIds).toHaveLength(1);
    expect(report.impactedEpisodes).toEqual([2]);
  });

  it("flags a missing required planned beat as alignment drift", () => {
    const report = validateStoryGenerationOutput({
      contract,
      plan: { episodes: [{ episodeNumber: 1, keyBeats: [{ id: "beat-1", description: "Reveal the clue" }] }] },
      output: [{ episodeNumber: 1, keyBeats: [] }],
    });
    expect(report.alignment?.missingRequiredBeatIds).toEqual(["beat-1"]);
    expect(report.findings[0]?.requiresApproval).toBe(true);
    expect(report.impactedEpisodes).toEqual([1]);
  });
});
