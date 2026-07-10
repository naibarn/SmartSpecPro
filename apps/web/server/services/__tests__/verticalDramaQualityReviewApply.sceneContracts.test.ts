/**
 * Feature 132 §6.2 (F132C, scene contracts, `verticalDramaSceneContracts`,
 * added 2026-07-09) — coverage for `verticalDramaQualityReviewApply.ts`'s
 * flag-gated contract-preservation repair directive:
 *  - `composeQualityReviewRepairInstruction`'s new `sceneContractsStage`
 *    option;
 *  - `appendVerticalDramaSceneContractPreservationConstraint` standalone.
 *
 * Mirrors `verticalDramaQualityReviewApply.test.ts`'s existing
 * `storyLockStage`/`appendVerticalDramaStoryLockRepairConstraint` test
 * structure exactly.
 */
import { describe, expect, it } from "vitest";
import {
  appendVerticalDramaSceneContractPreservationConstraint,
  appendVerticalDramaStoryLockRepairConstraint,
  composeQualityReviewRepairInstruction,
  VD_SCENE_CONTRACT_PRESERVATION_CONSTRAINT,
  VD_STORY_LOCK_SCRIPT_REPAIR_CONSTRAINT,
} from "../verticalDramaQualityReviewApply";

describe("composeQualityReviewRepairInstruction — sceneContractsStage option (F132C)", () => {
  const issues = [
    { location: "shot 1", problem: "flat emotion", suggested_fix: "vary expression" },
  ];

  it("is byte-identical to the no-option call when sceneContractsStage is omitted", () => {
    expect(composeQualityReviewRepairInstruction(issues)).toBe(
      composeQualityReviewRepairInstruction(issues, undefined),
    );
    expect(composeQualityReviewRepairInstruction(issues)).not.toContain(
      VD_SCENE_CONTRACT_PRESERVATION_CONSTRAINT,
    );
  });

  it("appends the contract-preservation directive for plan_episode_script", () => {
    const instruction = composeQualityReviewRepairInstruction(issues, {
      sceneContractsStage: "plan_episode_script",
    });
    expect(instruction).toContain("แก้ตามคำแนะนำต่อไปนี้:");
    expect(instruction).toContain(VD_SCENE_CONTRACT_PRESERVATION_CONSTRAINT);
  });

  it("appends the contract-preservation directive for storyboard_shotgrid", () => {
    const instruction = composeQualityReviewRepairInstruction(issues, {
      sceneContractsStage: "storyboard_shotgrid",
    });
    expect(instruction).toContain(VD_SCENE_CONTRACT_PRESERVATION_CONSTRAINT);
  });

  it("is a no-op for dialogue_audio_plan/tie_in — never mentions the constraint", () => {
    const dialogueInstruction = composeQualityReviewRepairInstruction(issues, {
      sceneContractsStage: "dialogue_audio_plan",
    });
    const tieInInstruction = composeQualityReviewRepairInstruction(issues, {
      sceneContractsStage: "tie_in",
    });
    expect(dialogueInstruction).toBe(composeQualityReviewRepairInstruction(issues));
    expect(tieInInstruction).toBe(composeQualityReviewRepairInstruction(issues));
  });

  it("combines with storyLockStage independently — both directives can be appended together", () => {
    const instruction = composeQualityReviewRepairInstruction(issues, {
      storyLockStage: "plan_episode_script",
      sceneContractsStage: "plan_episode_script",
    });
    expect(instruction).toContain(VD_STORY_LOCK_SCRIPT_REPAIR_CONSTRAINT);
    expect(instruction).toContain(VD_SCENE_CONTRACT_PRESERVATION_CONSTRAINT);
  });

  it("storyLockStage alone (sceneContractsStage omitted) never mentions the contract directive — every pre-existing call site stays byte-identical", () => {
    const instruction = composeQualityReviewRepairInstruction(issues, {
      storyLockStage: "plan_episode_script",
    });
    expect(instruction).toBe(
      appendVerticalDramaStoryLockRepairConstraint(
        composeQualityReviewRepairInstruction(issues),
        "plan_episode_script",
      ),
    );
    expect(instruction).not.toContain(VD_SCENE_CONTRACT_PRESERVATION_CONSTRAINT);
  });
});

describe("appendVerticalDramaSceneContractPreservationConstraint", () => {
  it("appends the directive for plan_episode_script", () => {
    const result = appendVerticalDramaSceneContractPreservationConstraint(
      "base instruction",
      "plan_episode_script",
    );
    expect(result).toBe(`base instruction\n\n${VD_SCENE_CONTRACT_PRESERVATION_CONSTRAINT}`);
  });

  it("appends the directive for storyboard_shotgrid", () => {
    const result = appendVerticalDramaSceneContractPreservationConstraint(
      "base instruction",
      "storyboard_shotgrid",
    );
    expect(result).toBe(`base instruction\n\n${VD_SCENE_CONTRACT_PRESERVATION_CONSTRAINT}`);
  });

  it("returns the instruction UNCHANGED for dialogue_audio_plan", () => {
    expect(
      appendVerticalDramaSceneContractPreservationConstraint("base instruction", "dialogue_audio_plan"),
    ).toBe("base instruction");
  });

  it("returns the instruction UNCHANGED for tie_in", () => {
    expect(appendVerticalDramaSceneContractPreservationConstraint("base instruction", "tie_in")).toBe(
      "base instruction",
    );
  });

  it("returns the instruction UNCHANGED for an arbitrary non-contract-carrying stage string", () => {
    expect(
      appendVerticalDramaSceneContractPreservationConstraint("base instruction", "video_motion_prompt_pack"),
    ).toBe("base instruction");
  });

  it("the exact directive wording matches spec §6.2's Thai text verbatim", () => {
    expect(VD_SCENE_CONTRACT_PRESERVATION_CONSTRAINT).toBe(
      "รักษา `contract` เดิมของแต่ละช็อตไว้ เว้นแต่การแก้ไขนี้เปลี่ยนแก่นของช็อตนั้นจริง ๆ — ถ้าเปลี่ยน ให้ระบุ `contract` ใหม่ที่สอดคล้องด้วย",
    );
  });
});
