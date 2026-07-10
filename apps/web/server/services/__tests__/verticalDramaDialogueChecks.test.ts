import { describe, expect, it } from "vitest";
import {
  checkClueOverload,
  checkMissingAnchorLine,
  detectUnnaturalRegisterContribution,
  VD_UNNATURAL_REGISTER_DENSITY_THRESHOLD,
} from "../verticalDramaDialogueChecks";
import {
  QUALITY_CRITERIA_CLUE_BUDGET_PER_SHOT,
  QUALITY_CRITERIA_ANCHOR_LINE_MAX_GAP_SHOTS,
} from "@shared/verticalDramaSeries/qualityCriteria";

describe("checkClueOverload", () => {
  it("flags a shot whose newClueIds exceeds the shared clue-budget constant", () => {
    const overBudget = Array.from(
      { length: QUALITY_CRITERIA_CLUE_BUDGET_PER_SHOT + 1 },
      (_, i) => `clue-${i}`,
    );
    const findings = checkClueOverload([
      { episodeNumber: 1, shots: [{ shotNumber: 3, newClueIds: overBudget }] },
    ]);
    expect(findings).toHaveLength(1);
    expect(findings[0].kind).toBe("clue_overload");
    expect(findings[0].evidenceEpisodes).toEqual([1]);
  });

  it("does not flag a shot exactly at the budget", () => {
    const atBudget = Array.from(
      { length: QUALITY_CRITERIA_CLUE_BUDGET_PER_SHOT },
      (_, i) => `clue-${i}`,
    );
    const findings = checkClueOverload([
      { episodeNumber: 1, shots: [{ shotNumber: 1, newClueIds: atBudget }] },
    ]);
    expect(findings).toHaveLength(0);
  });

  it("returns [] for shots with no newClueIds/contract data at all", () => {
    expect(
      checkClueOverload([{ episodeNumber: 1, shots: [{ shotNumber: 1 }] }]),
    ).toEqual([]);
  });
});

describe("checkMissingAnchorLine", () => {
  it("flags an episode whose max non-anchor run exceeds the shared cadence constant", () => {
    const shots = Array.from(
      { length: QUALITY_CRITERIA_ANCHOR_LINE_MAX_GAP_SHOTS + 2 },
      (_, i) => ({ shotNumber: i + 1, anchorLine: false }),
    );
    const findings = checkMissingAnchorLine([{ episodeNumber: 2, shots }]);
    expect(findings).toHaveLength(1);
    expect(findings[0].kind).toBe("missing_anchor_line");
    expect(findings[0].evidenceEpisodes).toEqual([2]);
  });

  it("does not flag an episode whose gap is exactly at the cadence limit", () => {
    const shots = Array.from(
      { length: QUALITY_CRITERIA_ANCHOR_LINE_MAX_GAP_SHOTS },
      (_, i) => ({ shotNumber: i + 1, anchorLine: false }),
    );
    expect(checkMissingAnchorLine([{ episodeNumber: 1, shots }])).toEqual([]);
  });

  it("returns [] for an episode with zero shots", () => {
    expect(checkMissingAnchorLine([{ episodeNumber: 1, shots: [] }])).toEqual([]);
  });

  it("sorts shots by shotNumber before scanning regardless of input array order", () => {
    const shots = [
      { shotNumber: 5, anchorLine: true },
      { shotNumber: 2, anchorLine: false },
      { shotNumber: 1, anchorLine: true },
      { shotNumber: 4, anchorLine: false },
      { shotNumber: 3, anchorLine: false },
    ];
    // Sorted: 1(true),2(false),3(false),4(false),5(true) -> gap of 3.
    const findings = checkMissingAnchorLine([{ episodeNumber: 1, shots }]);
    if (QUALITY_CRITERIA_ANCHOR_LINE_MAX_GAP_SHOTS < 3) {
      expect(findings).toHaveLength(1);
    } else {
      expect(findings).toHaveLength(0);
    }
  });
});

describe("detectUnnaturalRegisterContribution", () => {
  it("returns [] when total density is at/below the threshold", () => {
    const episodes = [{ episodeNumber: 1, lines: ["ไปกันเถอะ", "จริงเหรอ", "ทำไมล่ะ"] }];
    expect(detectUnnaturalRegisterContribution(episodes, "th")).toEqual([]);
  });

  it("returns [] for an empty episode list (no lines at all)", () => {
    expect(detectUnnaturalRegisterContribution([], "th")).toEqual([]);
  });

  it("fires a deterministic unnatural_dialogue_language contribution above the density threshold, naming every contributing episode", () => {
    const episodes = [
      { episodeNumber: 1, lines: ["อย่างไรก็ตาม เราต้องไป", "ไปกันเถอะ"] },
      { episodeNumber: 2, lines: ["ดังนั้นเราจึงตัดสินใจ", "สบายดีไหม"] },
    ];
    const findings = detectUnnaturalRegisterContribution(episodes, "th");
    expect(findings).toHaveLength(1);
    expect(findings[0].kind).toBe("unnatural_dialogue_language");
    expect(findings[0].evidenceEpisodes).toEqual([1, 2]);
  });

  it("pins the density threshold constant is a small, sub-1 fraction", () => {
    expect(VD_UNNATURAL_REGISTER_DENSITY_THRESHOLD).toBeGreaterThan(0);
    expect(VD_UNNATURAL_REGISTER_DENSITY_THRESHOLD).toBeLessThan(1);
  });
});
