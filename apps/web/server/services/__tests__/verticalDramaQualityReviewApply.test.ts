/**
 * Coverage for `verticalDramaQualityReviewApply.ts`'s pure grouping +
 * instruction-composition helpers, used by the router's
 * `applyQualityReviewSuggestions` mutation.
 */
import { describe, expect, it } from "vitest";
import {
  appendVerticalDramaStoryLockRepairConstraint,
  classifyQualityReviewIssueLocation,
  composeQualityReviewRepairInstruction,
  evaluateVerticalDramaStoryLockScriptGuard,
  evaluateVerticalDramaStoryLockStoryboardGuard,
  groupQualityReviewIssuesByStage,
  groupQualityReviewIssuesByStageWithFlag,
  QUALITY_REVIEW_APPLY_STAGE_ORDER,
  VD_STORY_LOCK_SCRIPT_REPAIR_CONSTRAINT,
  VD_STORY_LOCK_STORYBOARD_REPAIR_CONSTRAINT,
  VD_STORY_LOCK_TEXT_OVERLAP_THRESHOLD,
  VD_STORY_LOCK_VIOLATION,
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

  it("always orders script before storyboard, matching the canonical QUALITY_REVIEW_APPLY_STAGE_ORDER prefix", () => {
    const issues = [
      { location: "shot 9", problem: "p1", suggested_fix: "f1" },
      { location: "beat 1", problem: "p2", suggested_fix: "f2" },
    ];
    const grouped = groupQualityReviewIssuesByStage(issues);
    // QUALITY_REVIEW_APPLY_STAGE_ORDER is now the 4-entry v2 canonical order
    // (spec §16.1: script, storyboard, dialogue, tie-in) — only script +
    // storyboard have issues here (v1 shape), so the grouped stages must
    // equal that order's first two entries.
    expect(grouped.map(g => g.stage)).toEqual(QUALITY_REVIEW_APPLY_STAGE_ORDER.slice(0, 2));
  });
});

describe("QUALITY_REVIEW_APPLY_STAGE_ORDER (v2 canonical order, spec §16.1)", () => {
  it("is the 4-entry canonical order: script, storyboard, dialogue, tie-in", () => {
    expect(QUALITY_REVIEW_APPLY_STAGE_ORDER).toEqual([
      "plan_episode_script",
      "storyboard_shotgrid",
      "dialogue_audio_plan",
      "tie_in",
    ]);
  });
});

describe("classifyQualityReviewIssueLocation — dialogue group (v2, unconditional)", () => {
  it("classifies the skill's own documented example to dialogue_audio_plan even though it also mentions a shot", () => {
    expect(classifyQualityReviewIssueLocation("dialogue_line shot 3 clip 1")).toBe(
      "dialogue_audio_plan",
    );
  });

  it("classifies a standalone 'line N' reference to dialogue_audio_plan", () => {
    expect(classifyQualityReviewIssueLocation("line 4")).toBe("dialogue_audio_plan");
  });

  it("classifies Thai dialogue wording (บทพูด / คำพูด) to dialogue_audio_plan", () => {
    expect(classifyQualityReviewIssueLocation("บทพูด shot 2")).toBe("dialogue_audio_plan");
    expect(classifyQualityReviewIssueLocation("คำพูดไม่เป็นธรรมชาติ")).toBe(
      "dialogue_audio_plan",
    );
  });

  it("does not false-positive on 'line' inside an unrelated word (word-boundary safe)", () => {
    expect(classifyQualityReviewIssueLocation("storyline issue")).toBe("storyboard_shotgrid");
  });

  it("is unconditional — active even when tieInEnabled is explicitly false", () => {
    expect(
      classifyQualityReviewIssueLocation("dialogue naturalness", { tieInEnabled: false }),
    ).toBe("dialogue_audio_plan");
  });

  it("still classifies beat references to plan_episode_script even when they also read like dialogue", () => {
    // beat-check runs first and is unchanged from v1.
    expect(classifyQualityReviewIssueLocation("beat 2 dialogue")).toBe("plan_episode_script");
  });
});

describe("classifyQualityReviewIssueLocation — tie_in group (v2, gated by tieInEnabled)", () => {
  it("classifies tie-in wording to tie_in only when tieInEnabled is true", () => {
    expect(
      classifyQualityReviewIssueLocation("tie-in shot 4", { tieInEnabled: true }),
    ).toBe("tie_in");
    expect(
      classifyQualityReviewIssueLocation("product placement shot 2", { tieInEnabled: true }),
    ).toBe("tie_in");
    expect(
      classifyQualityReviewIssueLocation("สินค้า shot 5", { tieInEnabled: true }),
    ).toBe("tie_in");
  });

  it("falls back to the v1 storyboard default when tieInEnabled is omitted or false", () => {
    expect(classifyQualityReviewIssueLocation("tie-in shot 4")).toBe("storyboard_shotgrid");
    expect(
      classifyQualityReviewIssueLocation("product placement shot 2", { tieInEnabled: false }),
    ).toBe("storyboard_shotgrid");
  });
});

describe("groupQualityReviewIssuesByStage — v2 4-group canonical order", () => {
  it("groups dialogue issues into the third group, after script and storyboard", () => {
    const issues = [
      { location: "shot 1", problem: "p1", suggested_fix: "f1" },
      { location: "beat 1", problem: "p2", suggested_fix: "f2" },
      { location: "line 3", problem: "p3", suggested_fix: "f3" },
    ];
    const grouped = groupQualityReviewIssuesByStage(issues, { tieInEnabled: true });
    expect(grouped.map(g => g.stage)).toEqual([
      "plan_episode_script",
      "storyboard_shotgrid",
      "dialogue_audio_plan",
    ]);
  });

  it("groups all four canonical stages, in canonical order, when every group has issues and tieInEnabled is true", () => {
    const issues = [
      { location: "tie-in shot 8", problem: "p4", suggested_fix: "f4" },
      { location: "shot 1", problem: "p1", suggested_fix: "f1" },
      { location: "line 3", problem: "p3", suggested_fix: "f3" },
      { location: "beat 1", problem: "p2", suggested_fix: "f2" },
    ];
    const grouped = groupQualityReviewIssuesByStage(issues, { tieInEnabled: true });
    expect(grouped.map(g => g.stage)).toEqual([
      "plan_episode_script",
      "storyboard_shotgrid",
      "dialogue_audio_plan",
      "tie_in",
    ]);
  });

  it("never produces a tie_in group when tieInEnabled is omitted, even with tie-in-flavored locations", () => {
    const issues = [
      { location: "tie-in shot 8", problem: "p4", suggested_fix: "f4" },
      { location: "shot 1", problem: "p1", suggested_fix: "f1" },
    ];
    const grouped = groupQualityReviewIssuesByStage(issues);
    expect(grouped.map(g => g.stage)).toEqual(["storyboard_shotgrid"]);
    expect(grouped[0].issues).toHaveLength(2);
  });
});

describe("groupQualityReviewIssuesByStageWithFlag", () => {
  it("behaves identically to groupQualityReviewIssuesByStage({ tieInEnabled: true }) when passed true", () => {
    const issues = [
      { location: "tie-in shot 8", problem: "p4", suggested_fix: "f4" },
      { location: "shot 1", problem: "p1", suggested_fix: "f1" },
    ];
    expect(groupQualityReviewIssuesByStageWithFlag(issues, true)).toEqual(
      groupQualityReviewIssuesByStage(issues, { tieInEnabled: true }),
    );
  });

  it("behaves identically to groupQualityReviewIssuesByStage(issues) (v1 default) when passed false", () => {
    const issues = [
      { location: "shot 1", problem: "p1", suggested_fix: "f1" },
      { location: "beat 2", problem: "p2", suggested_fix: "f2" },
    ];
    expect(groupQualityReviewIssuesByStageWithFlag(issues, false)).toEqual(
      groupQualityReviewIssuesByStage(issues),
    );
  });

  it("accepts a plain runtime boolean variable (not just a literal) without a type error", () => {
    const tieInEnabled: boolean = Boolean(1);
    const issues = [{ location: "tie-in shot 1", problem: "p", suggested_fix: "f" }];
    const grouped = groupQualityReviewIssuesByStageWithFlag(issues, tieInEnabled);
    expect(grouped).toEqual([{ stage: "tie_in", issues }]);
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
    // Criteria marker + one header line + one line per issue.
    expect(instruction.split("\n")).toHaveLength(4);
  });

  it("composes a valid instruction for a single issue", () => {
    const instruction = composeQualityReviewRepairInstruction([
      { location: "beat 2", problem: "weak reversal", suggested_fix: "sharpen the flip" },
    ]);
    expect(instruction).toContain("แก้ตามคำแนะนำต่อไปนี้:");
    expect(instruction).toContain(
      "- [beat 2] ปัญหา: weak reversal -> แก้ไข: sharpen the flip",
    );
  });

  describe("storyLockStage option (W11.6 Story Lock)", () => {
    const issues = [
      { location: "shot 1", problem: "flat emotion", suggested_fix: "vary expression" },
    ];

    it("is byte-identical to the no-option call when storyLockStage is omitted", () => {
      expect(composeQualityReviewRepairInstruction(issues)).toBe(
        composeQualityReviewRepairInstruction(issues, undefined),
      );
      expect(composeQualityReviewRepairInstruction(issues)).not.toContain(
        VD_STORY_LOCK_SCRIPT_REPAIR_CONSTRAINT,
      );
    });

    it("appends the script constraint block for plan_episode_script", () => {
      const instruction = composeQualityReviewRepairInstruction(issues, {
        storyLockStage: "plan_episode_script",
      });
      expect(instruction).toContain("แก้ตามคำแนะนำต่อไปนี้:");
      expect(instruction).toContain(VD_STORY_LOCK_SCRIPT_REPAIR_CONSTRAINT);
    });

    it("appends the storyboard constraint block for storyboard_shotgrid", () => {
      const instruction = composeQualityReviewRepairInstruction(issues, {
        storyLockStage: "storyboard_shotgrid",
      });
      expect(instruction).toContain(VD_STORY_LOCK_STORYBOARD_REPAIR_CONSTRAINT);
      expect(instruction).not.toContain(VD_STORY_LOCK_SCRIPT_REPAIR_CONSTRAINT);
    });

    it("is a no-op for dialogue_audio_plan/tie_in — never mentions either constraint", () => {
      const dialogueInstruction = composeQualityReviewRepairInstruction(issues, {
        storyLockStage: "dialogue_audio_plan",
      });
      const tieInInstruction = composeQualityReviewRepairInstruction(issues, {
        storyLockStage: "tie_in",
      });
      expect(dialogueInstruction).toBe(composeQualityReviewRepairInstruction(issues));
      expect(tieInInstruction).toBe(composeQualityReviewRepairInstruction(issues));
    });
  });
});

describe("appendVerticalDramaStoryLockRepairConstraint", () => {
  it("appends the script constraint for plan_episode_script", () => {
    const result = appendVerticalDramaStoryLockRepairConstraint("base instruction", "plan_episode_script");
    expect(result).toBe(`base instruction\n\n${VD_STORY_LOCK_SCRIPT_REPAIR_CONSTRAINT}`);
  });

  it("appends the storyboard constraint for storyboard_shotgrid", () => {
    const result = appendVerticalDramaStoryLockRepairConstraint("base instruction", "storyboard_shotgrid");
    expect(result).toBe(`base instruction\n\n${VD_STORY_LOCK_STORYBOARD_REPAIR_CONSTRAINT}`);
  });

  it("returns the instruction unchanged for any other stage", () => {
    expect(appendVerticalDramaStoryLockRepairConstraint("x", "dialogue_audio_plan")).toBe("x");
    expect(appendVerticalDramaStoryLockRepairConstraint("x", "tie_in")).toBe("x");
    expect(appendVerticalDramaStoryLockRepairConstraint("x", "render_or_import_video_clips")).toBe("x");
  });
});

/* -------------------------------------------------------------------------- */
/* W11.6 "Story Lock" — deterministic post-repair guard ("the teeth")         */
/* -------------------------------------------------------------------------- */

function makeScript(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    episode_title: "Midnight Verdict",
    hook: "Aria's phone lights up mid-signature: her sister's clinic is named as collateral in the merger she is about to sign.",
    cliffhanger:
      "As Aria walks out, her assistant whispers that the rival's own backers just called an emergency vote — the reversal she pulled off has put his own board on his neck next.",
    structure: {
      beats: [
        { beat: 1, summary: "Aria discovers the clause", is_reversal: false },
        { beat: 2, summary: "Aria confronts the rival", is_reversal: false },
        { beat: 3, summary: "Aria reveals the twist", is_reversal: true },
        { beat: 4, summary: "the rival scrambles", is_reversal: false },
      ],
    },
    scene_dialogue_summary: [
      { scene: 1, location: "boardroom", summary: "signing interrupted" },
      { scene: 2, location: "boardroom", summary: "the reveal" },
    ],
    ...overrides,
  };
}

describe("evaluateVerticalDramaStoryLockScriptGuard", () => {
  it("never violates when prior or repaired is null/undefined (nothing to compare against yet)", () => {
    expect(evaluateVerticalDramaStoryLockScriptGuard(null, makeScript())).toEqual({
      violated: false,
      violations: [],
    });
    expect(evaluateVerticalDramaStoryLockScriptGuard(makeScript(), null)).toEqual({
      violated: false,
      violations: [],
    });
    expect(evaluateVerticalDramaStoryLockScriptGuard(undefined, undefined)).toEqual({
      violated: false,
      violations: [],
    });
  });

  it("accepts a wording-only repair (same beats/reversals/scenes, high hook+cliffhanger overlap)", () => {
    // Pure word-REORDER of the prior hook/cliffhanger — guarantees an
    // identical significant-word SET (the overlap heuristic is order-
    // independent), so overlap = 1.0 regardless of exact tokenization,
    // proving a "same content, different delivery order" repair is accepted.
    const prior = makeScript({
      hook: "Aria discovers a secret clause hidden inside the merger contract just before she signs it.",
      cliffhanger:
        "Aria walks out while her assistant whispers that the rival board just called an emergency vote against him.",
    });
    const repaired = makeScript({
      hook: "Just before she signs it, Aria discovers a secret clause hidden inside the merger contract.",
      cliffhanger:
        "While her assistant whispers that the rival board just called an emergency vote against him, Aria walks out.",
    });

    const result = evaluateVerticalDramaStoryLockScriptGuard(prior, repaired);
    expect(result).toEqual({ violated: false, violations: [] });
  });

  it("rejects a repair that adds a beat (beat count changed)", () => {
    const prior = makeScript();
    const repaired = makeScript({
      structure: {
        beats: [
          ...(makeScript().structure as { beats: unknown[] }).beats,
          { beat: 5, summary: "a brand new scene", is_reversal: false },
        ],
      },
    });

    const result = evaluateVerticalDramaStoryLockScriptGuard(prior, repaired);
    expect(result.violated).toBe(true);
    expect(result.violations.some(v => v.includes("beat count changed"))).toBe(true);
  });

  it("rejects a repair that moves the reversal to a different beat", () => {
    const prior = makeScript();
    const repaired = makeScript({
      structure: {
        beats: [
          { beat: 1, summary: "Aria discovers the clause", is_reversal: false },
          { beat: 2, summary: "Aria confronts the rival", is_reversal: true },
          { beat: 3, summary: "Aria reveals the twist", is_reversal: false },
          { beat: 4, summary: "the rival scrambles", is_reversal: false },
        ],
      },
    });

    const result = evaluateVerticalDramaStoryLockScriptGuard(prior, repaired);
    expect(result.violated).toBe(true);
    expect(result.violations.some(v => v.includes("reversal"))).toBe(true);
  });

  it("rejects a repair whose cliffhanger meaning changed (low token overlap)", () => {
    const prior = makeScript();
    const repaired = makeScript({
      cliffhanger: "The next morning, an entirely unrelated character arrives with unrelated news about the weather.",
    });

    const result = evaluateVerticalDramaStoryLockScriptGuard(prior, repaired);
    expect(result.violated).toBe(true);
    expect(result.violations.some(v => v.includes("cliffhanger meaning changed"))).toBe(true);
  });

  it("rejects a repair whose hook meaning changed (low token overlap)", () => {
    const prior = makeScript();
    const repaired = makeScript({
      hook: "A completely different opening about a chef losing a cooking competition.",
    });

    const result = evaluateVerticalDramaStoryLockScriptGuard(prior, repaired);
    expect(result.violated).toBe(true);
    expect(result.violations.some(v => v.includes("hook meaning changed"))).toBe(true);
  });

  it("rejects a repair that changes the scene count", () => {
    const prior = makeScript();
    const repaired = makeScript({
      scene_dialogue_summary: [
        { scene: 1, location: "boardroom", summary: "signing interrupted" },
      ],
    });

    const result = evaluateVerticalDramaStoryLockScriptGuard(prior, repaired);
    expect(result.violated).toBe(true);
    expect(result.violations.some(v => v.includes("scene count changed"))).toBe(true);
  });

  it("uses exactly the exported VD_STORY_LOCK_TEXT_OVERLAP_THRESHOLD (0.6)", () => {
    expect(VD_STORY_LOCK_TEXT_OVERLAP_THRESHOLD).toBe(0.6);
  });
});

describe("evaluateVerticalDramaStoryLockStoryboardGuard", () => {
  function makeStoryboard(shots: Array<Record<string, unknown>>): Record<string, unknown> {
    return { shots };
  }

  function nineShots(overrides: Record<number, Record<string, unknown>> = {}) {
    return Array.from({ length: 9 }, (_, i) => {
      const shotNumber = i + 1;
      return {
        shot_number: shotNumber,
        source_beat_indexes: [Math.min(i, 3)],
        ...(overrides[shotNumber] ?? {}),
      };
    });
  }

  it("never violates when prior or repaired is null/undefined", () => {
    expect(evaluateVerticalDramaStoryLockStoryboardGuard(null, makeStoryboard(nineShots()))).toEqual(
      { violated: false, violations: [] },
    );
    expect(evaluateVerticalDramaStoryLockStoryboardGuard(makeStoryboard(nineShots()), null)).toEqual(
      { violated: false, violations: [] },
    );
  });

  it("accepts a repair that keeps 9 shots and unchanged source_beat_indexes", () => {
    const prior = makeStoryboard(nineShots());
    const repaired = makeStoryboard(nineShots({ 1: { action: "reworded action text" } }));

    const result = evaluateVerticalDramaStoryLockStoryboardGuard(prior, repaired);
    expect(result).toEqual({ violated: false, violations: [] });
  });

  it("rejects a repair that does not keep exactly 9 shots", () => {
    const prior = makeStoryboard(nineShots());
    const repaired = makeStoryboard(nineShots().slice(0, 8));

    const result = evaluateVerticalDramaStoryLockStoryboardGuard(prior, repaired);
    expect(result.violated).toBe(true);
    expect(result.violations.some(v => v.includes("exactly 9 shots"))).toBe(true);
  });

  it("rejects a repair that changes a shot's source_beat_indexes", () => {
    const prior = makeStoryboard(nineShots());
    const repaired = makeStoryboard(nineShots({ 3: { source_beat_indexes: [9] } }));

    const result = evaluateVerticalDramaStoryLockStoryboardGuard(prior, repaired);
    expect(result.violated).toBe(true);
    expect(result.violations.some(v => v.includes("shot 3 source_beat_indexes changed"))).toBe(true);
  });

  it("does not compare shots where source_beat_indexes is absent on both sides", () => {
    const prior = makeStoryboard(
      nineShots({
        4: { source_beat_indexes: undefined },
      }),
    );
    const repaired = makeStoryboard(
      nineShots({
        4: { source_beat_indexes: undefined, action: "different action text" },
      }),
    );

    const result = evaluateVerticalDramaStoryLockStoryboardGuard(prior, repaired);
    expect(result).toEqual({ violated: false, violations: [] });
  });
});

describe("VD_STORY_LOCK_VIOLATION", () => {
  it("is the fixed warning code", () => {
    expect(VD_STORY_LOCK_VIOLATION).toBe("VD_STORY_LOCK_VIOLATION");
  });
});
