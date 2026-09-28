import { describe, expect, it } from "vitest";

import {
  buildVerticalDramaStoryTruthPackage,
  buildVerticalDramaStoryTruthRepairInstructions,
  inspectVerticalDramaStoryTruth,
  renderVerticalDramaStoryTruthPromptBlock,
} from "../storyTruth";

describe("story truth package", () => {
  const truth = buildVerticalDramaStoryTruthPackage({
    sourceVersion: "series-53:v4",
    story: { premise: "A locked premise" },
    characters: [{ key: "mali", role: "protagonist" }],
    locations: [{ key: "home" }],
    timeline: [{ episodeNumber: 1 }, { episodeNumber: 2 }],
    lockedKeys: ["story"],
  });

  it("renders a bounded authoritative prompt projection", () => {
    const block = renderVerticalDramaStoryTruthPromptBlock(truth);
    expect(block).toContain("series-53:v4");
    expect(block).toContain("locked facts");
  });

  it("detects stale versions, locked drift, and unsupported speakers", () => {
    const issues = inspectVerticalDramaStoryTruth({
      truth,
      expectedSourceVersion: "series-53:v5",
      output: {
        story: { premise: "rewritten" },
        storyTruthSourceVersion: "series-53:v3",
        cast: ["mali"],
        speakers: ["unknown-person"],
      },
    });
    expect(issues.map(issue => issue.code)).toEqual(expect.arrayContaining([
      "stale_source_version",
      "locked_fact_drift",
      "speaker_not_in_cast",
    ]));
    expect(buildVerticalDramaStoryTruthRepairInstructions(issues).length).toBeGreaterThan(0);
  });

  it("keeps missing legacy facts as warnings instead of inventing them", () => {
    const issues = inspectVerticalDramaStoryTruth({
      truth,
      expectedSourceVersion: "series-53:v4",
      output: { cast: ["mali"] },
    });
    expect(issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "missing_continuity_anchor", severity: "warning" }),
    ]));
  });
});
