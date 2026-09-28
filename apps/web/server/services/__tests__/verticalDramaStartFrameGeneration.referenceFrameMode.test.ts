/**
 * Phase 6a (`planning/vd-start-frame-reference-mapping/plan.md` Phase 6 —
 * user-controlled supplementary reference frames) — coverage for
 * `buildStartFrameShotPromptUserPrompt`'s new `referenceFrameMode` fact line.
 *
 * Pure function, no mocking needed — mirrors
 * `verticalDramaStartFrameGeneration.locationGrounding.test.ts`'s own
 * "byte-identical when the new field is absent" + "renders the new fact line
 * in the right place" convention exactly.
 */
import { describe, it, expect } from "vitest";
import {
  buildStartFrameShotPromptUserPrompt,
  type GenerateStartFrameShotPromptParams,
} from "../verticalDramaStartFrameGeneration";

function baseShotParams(
  overrides: Partial<GenerateStartFrameShotPromptParams> = {},
): GenerateStartFrameShotPromptParams {
  return {
    userId: 1,
    tenantId: "tenant-1",
    seriesId: 42,
    episodeId: 7,
    shotNumber: 4,
    instruction: "ไอริณโอบกอดภาคิน",
    currentPrompt: "vertical 9:16 start frame for shot 4, Aria in boardroom.",
    currentNegativePrompt: "no identity drift",
    characterReferenceManifest: [],
    ...overrides,
  };
}

describe("buildStartFrameShotPromptUserPrompt — referenceFrameMode (Phase 6a)", () => {
  it("byte-identical: no 'reference_frame_mode' line at all when the flag is absent (regression guard)", () => {
    const prompt = buildStartFrameShotPromptUserPrompt(baseShotParams());
    expect(prompt).not.toContain("reference_frame_mode");
  });

  it("byte-identical: no 'reference_frame_mode' line when the flag is explicitly false", () => {
    const prompt = buildStartFrameShotPromptUserPrompt(
      baseShotParams({ referenceFrameMode: false }),
    );
    expect(prompt).not.toContain("reference_frame_mode");
  });

  it("emits 'reference_frame_mode: true' immediately after the 'repair_instruction' line when the flag is true", () => {
    const prompt = buildStartFrameShotPromptUserPrompt(
      baseShotParams({ referenceFrameMode: true }),
    );
    const lines = prompt.split("\n");
    const repairInstructionIndex = lines.findIndex(l =>
      l.startsWith("repair_instruction:"),
    );
    expect(repairInstructionIndex).toBeGreaterThanOrEqual(0);
    expect(lines[repairInstructionIndex + 1]).toBe("reference_frame_mode: true");
  });

  it("byte-identical otherwise: setting the flag inserts exactly one new line and changes nothing else in the prompt", () => {
    const without = buildStartFrameShotPromptUserPrompt(baseShotParams());
    const withFlag = buildStartFrameShotPromptUserPrompt(
      baseShotParams({ referenceFrameMode: true }),
    );
    expect(withFlag.replace("reference_frame_mode: true\n", "")).toBe(without);
  });

  it("still carries the user's free-text directive via repair_instruction, unaffected by the new fact line", () => {
    const prompt = buildStartFrameShotPromptUserPrompt(
      baseShotParams({ referenceFrameMode: true, instruction: "ไอริณโอบกอดภาคิน" }),
    );
    expect(prompt).toContain("repair_instruction: ไอริณโอบกอดภาคิน");
  });
});
