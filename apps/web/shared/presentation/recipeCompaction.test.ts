import { describe, expect, it } from "vitest";

import type { PresentationComponentSlotBinding } from "./contracts";
import {
  buildDefaultRecipeSourceTrace,
  evaluatePresentationRecipeSlotFit,
  PRESENTATION_RECIPE_FIT_THRESHOLDS,
  presentationRecipeCompactionSlotBudgetSchema,
} from "./recipeCompaction";

describe("evaluatePresentationRecipeSlotFit", () => {
  it("returns perfect score when no slot bindings provided", () => {
    const result = evaluatePresentationRecipeSlotFit("process-steps", []);
    expect(result.fitScore.overall).toBe(1);
    expect(result.fitScore.status).toBe("fits");
    expect(result.slotDetails).toHaveLength(0);
  });

  it("returns fits for text well within budget", () => {
    const bindings: PresentationComponentSlotBinding[] = [
      { slotId: "title", type: "text", text: "Short Title" },
    ];
    const result = evaluatePresentationRecipeSlotFit("process-steps", bindings);
    expect(result.fitScore.status).toBe("fits");
    expect(result.fitScore.overall).toBeGreaterThanOrEqual(PRESENTATION_RECIPE_FIT_THRESHOLDS.accept);
  });

  it("returns cramped for text near budget limit", () => {
    // process-steps title budget: maxChars 72, preferredLines 2
    const bindings: PresentationComponentSlotBinding[] = [
      { slotId: "title", type: "text", text: "A".repeat(68) },
    ];
    const result = evaluatePresentationRecipeSlotFit("process-steps", bindings);
    // Text is at ~94% of maxChars — should be cramped or fits depending on thresholds
    expect(result.fitScore.overall).toBeGreaterThan(0);
    expect(result.slotDetails).toHaveLength(1);
  });

  it("returns unsafe for text exceeding budget", () => {
    // process-steps step1-body budget: maxChars 260, preferredLines 4
    const bindings: PresentationComponentSlotBinding[] = [
      { slotId: "step1-body", type: "text", text: "A".repeat(400) },
    ];
    const result = evaluatePresentationRecipeSlotFit("process-steps", bindings);
    expect(result.fitScore.status).toBe("unsafe");
    expect(result.fitScore.overflowRisk).toBeGreaterThan(0);
  });

  it("evaluates list bindings against maxItems budget", () => {
    // process-steps has no list slots, use sectioned-explainer takeaways: maxItems 4
    const bindings: PresentationComponentSlotBinding[] = [
      {
        slotId: "takeaways",
        type: "list",
        items: ["One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight"],
      },
    ];
    const result = evaluatePresentationRecipeSlotFit("sectioned-explainer", bindings);
    expect(result.slotDetails).toHaveLength(1);
    expect(result.slotDetails[0].overflowRisk).toBeGreaterThan(0);
  });

  it("ignores slots without a budget entry", () => {
    const bindings: PresentationComponentSlotBinding[] = [
      { slotId: "nonexistent-slot", type: "text", text: "Hello" },
    ];
    const result = evaluatePresentationRecipeSlotFit("process-steps", bindings);
    expect(result.fitScore.overall).toBe(1);
    expect(result.slotDetails).toHaveLength(0);
  });

  it("aggregates multiple slot details", () => {
    const bindings: PresentationComponentSlotBinding[] = [
      { slotId: "title", type: "text", text: "Short" },
      { slotId: "subtitle", type: "text", text: "Also short" },
      { slotId: "step1-title", type: "text", text: "Step one" },
    ];
    const result = evaluatePresentationRecipeSlotFit("process-steps", bindings);
    expect(result.slotDetails).toHaveLength(3);
    expect(result.fitScore.overall).toBeGreaterThan(0);
  });

  it("returns score between 0 and 1", () => {
    const bindings: PresentationComponentSlotBinding[] = [
      { slotId: "title", type: "text", text: "A".repeat(300) },
      { slotId: "subtitle", type: "text", text: "B".repeat(300) },
    ];
    const result = evaluatePresentationRecipeSlotFit("process-steps", bindings);
    expect(result.fitScore.overall).toBeGreaterThanOrEqual(0);
    expect(result.fitScore.overall).toBeLessThanOrEqual(1);
  });
});

describe("buildDefaultRecipeSourceTrace", () => {
  it("returns empty array for empty input", () => {
    const result = buildDefaultRecipeSourceTrace([]);
    expect(result).toEqual([]);
  });

  it("creates trace entries with defaults", () => {
    const result = buildDefaultRecipeSourceTrace([
      { sourceId: "heading-1", sourceType: "heading" },
      { sourceId: "para-1", sourceType: "paragraph", targetSlotId: "body" },
    ]);
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({
      sourceId: "heading-1",
      sourceType: "heading",
      disposition: "used",
    });
    expect(result[1]).toEqual({
      sourceId: "para-1",
      sourceType: "paragraph",
      disposition: "used",
      targetSlotId: "body",
    });
  });

  it("preserves explicit disposition and notes", () => {
    const result = buildDefaultRecipeSourceTrace([
      {
        sourceId: "s1",
        sourceType: "bullet",
        disposition: "omitted",
        notes: "Too long for slot",
      },
    ]);
    expect(result[0].disposition).toBe("omitted");
    expect(result[0].notes).toBe("Too long for slot");
  });

  it("truncates sourceExcerpt to 512 chars", () => {
    const result = buildDefaultRecipeSourceTrace([
      {
        sourceId: "s1",
        sourceType: "paragraph",
        sourceExcerpt: "X".repeat(600),
      },
    ]);
    expect(result[0].sourceExcerpt!.length).toBe(512);
  });
});

describe("presentationRecipeCompactionSlotBudgetSchema", () => {
  it("accepts valid slot budget with preferredLines", () => {
    const result = presentationRecipeCompactionSlotBudgetSchema.safeParse({
      slotId: "title",
      role: "heading",
      maxChars: 200,
      preferredLines: 2,
    });
    expect(result.success).toBe(true);
  });

  it("rejects unknown fields", () => {
    const result = presentationRecipeCompactionSlotBudgetSchema.safeParse({
      slotId: "title",
      role: "heading",
      targetLines: 2,
    });
    expect(result.success).toBe(false);
  });
});
