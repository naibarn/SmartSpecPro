/**
 * Coverage for `verticalDramaQualityReviewApply.ts`'s pure grouping +
 * instruction-composition helpers, used by the router's
 * `applyQualityReviewSuggestions` mutation.
 */
import { describe, expect, it } from "vitest";
import {
  classifyQualityReviewIssueLocation,
  composeQualityReviewRepairInstruction,
  groupQualityReviewIssuesByStage,
  QUALITY_REVIEW_APPLY_STAGE_ORDER,
} from "../verticalDramaQualityReviewApply";

describe("classifyQualityReviewIssueLocation", () => {
  it("classifies a single shot reference as storyboard_shotgrid", () => {
    expect(classifyQualityReviewIssueLocation("shot 7")).toBe("storyboard_shotgrid");
  });

  it("classifies a shot range as storyboard_shotgrid", () => {
    expect(classifyQualityReviewIssueLocation("shots 3-5")).toBe("storyboard_shotgrid");
  });

  it("classifies a comma-separated shot list as storyboard_shotgrid", () => {
    expect(classifyQualityReviewIssueLocation("shots 3, 5, 7")).toBe("storyboard_shotgrid");
  });

  it("is case-insensitive for shot references", () => {
    expect(classifyQualityReviewIssueLocation("Shot 2")).toBe("storyboard_shotgrid");
    expect(classifyQualityReviewIssueLocation("SHOTS 1-2")).toBe("storyboard_shotgrid");
  });

  it("classifies a single beat reference as plan_episode_script", () => {
    expect(classifyQualityReviewIssueLocation("beat 3")).toBe("plan_episode_script");
  });

  it("classifies a beat range as plan_episode_script", () => {
    expect(classifyQualityReviewIssueLocation("beats 1-2")).toBe("plan_episode_script");
  });

  it("defaults unrecognized locations to storyboard_shotgrid", () => {
    expect(classifyQualityReviewIssueLocation("cliffhanger")).toBe("storyboard_shotgrid");
    expect(classifyQualityReviewIssueLocation("")).toBe("storyboard_shotgrid");
    expect(classifyQualityReviewIssueLocation("scene 2")).toBe("storyboard_shotgrid");
  });
});

describe("groupQualityReviewIssuesByStage", () => {
  it("groups issues into script/storyboard buckets, preserving order within each", () => {
    const issues = [
      { location: "shot 1", problem: "flat emotion", suggested_fix: "vary expression" },
      { location: "beat 2", problem: "weak reversal", suggested_fix: "sharpen the flip" },
      { location: "shot 3", problem: "generic gaze", suggested_fix: "add specificity" },
    ];

    const grouped = groupQualityReviewIssuesByStage(issues);

    expect(grouped).toEqual([
      { stage: "plan_episode_script", issues: [issues[1]] },
      { stage: "storyboard_shotgrid", issues: [issues[0], issues[2]] },
    ]);
  });

  it("omits stages with zero issues", () => {
    const issues = [
      { location: "shot 1", problem: "p", suggested_fix: "f" },
    ];
    const grouped = groupQualityReviewIssuesByStage(issues);
    expect(grouped).toHaveLength(1);
    expect(grouped[0].stage).toBe("storyboard_shotgrid");
  });

  it("returns an empty array for zero issues", () => {
    expect(groupQualityReviewIssuesByStage([])).toEqual([]);
  });

  it("always orders script before storyboard, matching QUALITY_REVIEW_APPLY_STAGE_ORDER", () => {
    const issues = [
      { location: "shot 9", problem: "p1", suggested_fix: "f1" },
      { location: "beat 1", problem: "p2", suggested_fix: "f2" },
    ];
    const grouped = groupQualityReviewIssuesByStage(issues);
    expect(grouped.map(g => g.stage)).toEqual([...QUALITY_REVIEW_APPLY_STAGE_ORDER]);
  });
});

describe("composeQualityReviewRepairInstruction", () => {
  it("composes a single Thai-prefixed instruction listing every issue", () => {
    const issues = [
      { location: "shot 1", problem: "flat emotion", suggested_fix: "vary expression" },
      { location: "shot 3", problem: "generic gaze", suggested_fix: "add specificity" },
    ];

    const instruction = composeQualityReviewRepairInstruction(issues);

    expect(instruction).toContain("แก้ตามคำแนะนำต่อไปนี้:");
    expect(instruction).toContain("[shot 1] ปัญหา: flat emotion -> แก้ไข: vary expression");
    expect(instruction).toContain("[shot 3] ปัญหา: generic gaze -> แก้ไข: add specificity");
    // One line per issue plus the header line.
    expect(instruction.split("\n")).toHaveLength(3);
  });

  it("composes a valid instruction for a single issue", () => {
    const instruction = composeQualityReviewRepairInstruction([
      { location: "beat 2", problem: "weak reversal", suggested_fix: "sharpen the flip" },
    ]);
    expect(instruction).toBe(
      "แก้ตามคำแนะนำต่อไปนี้:\n- [beat 2] ปัญหา: weak reversal -> แก้ไข: sharpen the flip",
    );
  });
});
