import { describe, expect, it } from "vitest";

import {
  buildTargetedRepairDirectiveForTest,
  ensureTargetedRepairDirectiveInImagePromptForTest,
  marketplaceAutoReviewImagePromptMaxCharsForTest,
} from "../marketplaceAutoReviewService";

describe("buildTargetedRepairDirectiveForTest", () => {
  it("returns empty string when unit has no reason codes or repair instruction", () => {
    expect(buildTargetedRepairDirectiveForTest({})).toBe("");
    expect(
      buildTargetedRepairDirectiveForTest({
        repairReasonCodes: [],
        repairInstruction: "   ",
      })
    ).toBe("");
  });

  it("maps reason codes to corrective sentences and appends the QA note", () => {
    const directive = buildTargetedRepairDirectiveForTest({
      repairReasonCodes: [
        "product_reference_mismatch",
        "character_reference_mismatch",
        "storyboard_grid_layout_mismatch",
      ],
      repairInstruction: "Match the reference bottle exactly.",
    });

    expect(directive).toContain("TARGETED REPAIR");
    expect(directive).toContain("@Image1");
    expect(directive).toContain("@Image2");
    expect(directive).toContain("strict 3x3 grid");
    expect(directive).toContain(
      "QA repair note: Match the reference bottle exactly."
    );
  });

  it("dedupes sentences and only includes mapped reason codes", () => {
    const directive = buildTargetedRepairDirectiveForTest({
      repairReasonCodes: [
        "storyboard_grid_layout_mismatch",
        "storyboard_grid_columns_mismatch",
        "unmapped_weird_code",
      ],
    });
    const gridSentenceCount = (
      directive.match(/The previous grid layout was wrong/g) ?? []
    ).length;
    expect(gridSentenceCount).toBe(1);
    expect(directive).not.toContain("@Image1");
    expect(directive).not.toContain("@Image2");
  });

  it("builds a directive from repairInstruction alone with no reason codes", () => {
    const directive = buildTargetedRepairDirectiveForTest({
      repairInstruction: "Fix the lighting on frame 4.",
    });
    expect(directive).toContain("TARGETED REPAIR");
    expect(directive).toContain("QA repair note: Fix the lighting on frame 4.");
  });
});

describe("ensureTargetedRepairDirectiveInImagePromptForTest", () => {
  const unit = {
    repairReasonCodes: ["product_reference_mismatch"],
    repairInstruction: "Match the product exactly.",
  };

  it("appends the directive once", () => {
    const base = "SHOT-BY-SHOT STORYBOARD PROMPT: Frame 1: something happens.";
    const result = ensureTargetedRepairDirectiveInImagePromptForTest(
      base,
      unit
    );
    expect(result).toContain("TARGETED REPAIR");
    expect(result.startsWith(base)).toBe(true);
  });

  it("is idempotent: a second call does not duplicate the block", () => {
    const base = "SHOT-BY-SHOT STORYBOARD PROMPT: Frame 1: something happens.";
    const once = ensureTargetedRepairDirectiveInImagePromptForTest(base, unit);
    const twice = ensureTargetedRepairDirectiveInImagePromptForTest(once, unit);
    expect(twice).toBe(once);
    const occurrences = (once.match(/TARGETED REPAIR/g) ?? []).length;
    expect(occurrences).toBe(1);
  });

  it("returns the base prompt unchanged when there is no repair signal", () => {
    const base = "SHOT-BY-SHOT STORYBOARD PROMPT: Frame 1: something happens.";
    const result = ensureTargetedRepairDirectiveInImagePromptForTest(base, {});
    expect(result).toBe(base);
  });

  it("returns empty string unchanged for empty prompt", () => {
    expect(ensureTargetedRepairDirectiveInImagePromptForTest("", unit)).toBe(
      ""
    );
  });

  it("respects the max prompt-length budget", () => {
    const maxChars = marketplaceAutoReviewImagePromptMaxCharsForTest();
    const base = `SHOT-BY-SHOT STORYBOARD PROMPT: ${"Frame 1: x. ".repeat(
      Math.ceil((maxChars - 200) / 12)
    )}`.slice(0, maxChars - 50);
    const result = ensureTargetedRepairDirectiveInImagePromptForTest(
      base,
      unit
    );
    expect(result.length).toBeLessThanOrEqual(maxChars);
    const occurrences = (result.match(/TARGETED REPAIR/g) ?? []).length;
    expect(occurrences).toBeLessThanOrEqual(1);
  });

  it("returns base unchanged when no remaining budget for the directive", () => {
    const maxChars = marketplaceAutoReviewImagePromptMaxCharsForTest();
    const base = "F".repeat(maxChars - 10);
    const result = ensureTargetedRepairDirectiveInImagePromptForTest(
      base,
      unit
    );
    expect(result.length).toBeLessThanOrEqual(maxChars);
  });
});
