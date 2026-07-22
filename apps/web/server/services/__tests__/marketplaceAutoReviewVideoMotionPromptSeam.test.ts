import { describe, it, expect, vi } from "vitest";

import {
  resolveMarketplaceAutoReviewVideoUnitPrompt,
  buildMarketplaceAutoReviewSubmittedVideoPrompt,
} from "../marketplaceAutoReviewService";

const BASE_PROMPT = "Video prompt body. Action: hero pours product.";
const MOTION_TEXT_EN =
  "The model pumps the bottle, pours onto the palm, lathers, then ends on a clear product showcase.";
const SKILL_PROMPT =
  "Ground the motion in the start keyframe: the model presses the pump so shampoo falls onto the open palm, then lathers it into soft foam through the hair, ending on a clear product showcase.";

describe("resolveMarketplaceAutoReviewVideoUnitPrompt — skill-first with deterministic fallback", () => {
  it("uses the skill prompt on success (source=skill) and never re-appends the motion line", async () => {
    const runSkill = vi.fn(async () => ({ prompt: SKILL_PROMPT }));
    const result = await resolveMarketplaceAutoReviewVideoUnitPrompt({
      basePrompt: BASE_PROMPT,
      motionDirection: MOTION_TEXT_EN,
      runSkill,
    });
    expect(runSkill).toHaveBeenCalledTimes(1);
    expect(result.videoPromptSource).toBe("skill");
    expect(result.prompt).toBe(SKILL_PROMPT);
    // The skill already folded in the user motion direction — the "User motion
    // direction (MANDATORY...)" line must NOT be appended a second time.
    expect(result.prompt).not.toContain("User motion direction (MANDATORY");
    expect(result.warnings).toEqual([]);
  });

  it("still appends the targeted-repair line on skill success (existing behavior preserved)", async () => {
    const runSkill = vi.fn(async () => ({ prompt: SKILL_PROMPT }));
    const result = await resolveMarketplaceAutoReviewVideoUnitPrompt({
      basePrompt: BASE_PROMPT,
      repairInstruction: "Fix the label crop.",
      motionDirection: MOTION_TEXT_EN,
      runSkill,
    });
    expect(result.videoPromptSource).toBe("skill");
    expect(result.prompt).toBe(
      `${SKILL_PROMPT}\nTargeted repair: Fix the label crop.`
    );
  });

  it("falls back to the EXACT Phase-1 deterministic prompt when the skill throws", async () => {
    const runSkill = vi.fn(async () => {
      throw new Error("vision model exhausted");
    });
    const result = await resolveMarketplaceAutoReviewVideoUnitPrompt({
      basePrompt: BASE_PROMPT,
      repairInstruction: "Fix the label crop.",
      motionDirection: MOTION_TEXT_EN,
      runSkill,
    });
    const phase1 = buildMarketplaceAutoReviewSubmittedVideoPrompt({
      basePrompt: BASE_PROMPT,
      repairInstruction: "Fix the label crop.",
      motionDirection: MOTION_TEXT_EN,
    });
    expect(result.videoPromptSource).toBe("deterministic_fallback");
    expect(result.prompt).toBe(phase1);
    expect(result.failureReason).toBe("vision model exhausted");
    expect(result.warnings).toContain("video_prompt_skill_fallback");
  });

  it("falls back to Phase-1 output when the skill returns an empty prompt", async () => {
    const runSkill = vi.fn(async () => ({ prompt: "   " }));
    const result = await resolveMarketplaceAutoReviewVideoUnitPrompt({
      basePrompt: BASE_PROMPT,
      motionDirection: MOTION_TEXT_EN,
      runSkill,
    });
    expect(result.videoPromptSource).toBe("deterministic_fallback");
    expect(result.prompt).toBe(
      buildMarketplaceAutoReviewSubmittedVideoPrompt({
        basePrompt: BASE_PROMPT,
        motionDirection: MOTION_TEXT_EN,
      })
    );
  });

  it("NEVER invokes the skill when motion direction is absent (zero new cost, legacy path)", async () => {
    const runSkill = vi.fn(async () => ({ prompt: SKILL_PROMPT }));
    const absent = await resolveMarketplaceAutoReviewVideoUnitPrompt({
      basePrompt: BASE_PROMPT,
      repairInstruction: "Fix the label crop.",
      motionDirection: undefined,
      runSkill,
    });
    expect(runSkill).not.toHaveBeenCalled();
    expect(absent.videoPromptSource).toBe("deterministic");
    // Byte-identical to the existing repair-only behavior.
    expect(absent.prompt).toBe(`${BASE_PROMPT}\nTargeted repair: Fix the label crop.`);
  });

  it("NEVER invokes the skill when motion direction is whitespace-only", async () => {
    const runSkill = vi.fn(async () => ({ prompt: SKILL_PROMPT }));
    const result = await resolveMarketplaceAutoReviewVideoUnitPrompt({
      basePrompt: BASE_PROMPT,
      motionDirection: "   ",
      runSkill,
    });
    expect(runSkill).not.toHaveBeenCalled();
    expect(result.videoPromptSource).toBe("deterministic");
    expect(result.prompt).toBe(BASE_PROMPT);
  });
});
