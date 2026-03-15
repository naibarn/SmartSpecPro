import { describe, expect, it } from "vitest";

import { BUILT_IN_PRESENTATION_COMPONENT_IDS } from "./componentRecipes";
import {
  buildPresentationComponentRecipeSlotBindings,
  type PresentationRecipeNarrativeInput,
} from "./componentRecipeSlotBindings";
import {
  getPresentationComponentSlotBudget,
  measurePresentationTextUnits,
} from "./componentRecipes";

function makeInput(overrides: Partial<PresentationRecipeNarrativeInput> = {}): PresentationRecipeNarrativeInput {
  return {
    title: "Test Title",
    body: ["First paragraph", "Second paragraph", "Third paragraph"],
    notes: "Some notes here",
    sections: [
      { heading: "Section One", details: ["Detail A", "Detail B"] },
      { heading: "Section Two", details: ["Detail C", "Detail D"] },
      { heading: "Section Three", details: ["Detail E"] },
    ],
    graphicCategory: "technology",
    mediaUrl: "https://example.com/image.jpg",
    ...overrides,
  };
}

// All recipe IDs that have binding builders
const RECIPE_IDS_WITH_BINDINGS = BUILT_IN_PRESENTATION_COMPONENT_IDS;

describe("buildPresentationComponentRecipeSlotBindings", () => {
  for (const recipeId of RECIPE_IDS_WITH_BINDINGS) {
    describe(recipeId, () => {
      it("produces non-empty slot bindings from standard input", () => {
        const input = makeInput();
        const result = buildPresentationComponentRecipeSlotBindings(recipeId, input);
        expect(result.length).toBeGreaterThan(0);
      });

      it("every binding has a non-empty slotId and valid type", () => {
        const input = makeInput();
        const result = buildPresentationComponentRecipeSlotBindings(recipeId, input);
        for (const binding of result) {
          expect(binding.slotId).toBeTruthy();
          expect(["text", "list", "image", "video"]).toContain(binding.type);
        }
      });

      it("handles minimal input without errors", () => {
        const input = makeInput({
          body: ["Only one line"],
          notes: null,
          sections: [],
          graphicCategory: null,
          mediaUrl: null,
        });
        const result = buildPresentationComponentRecipeSlotBindings(recipeId, input);
        expect(result.length).toBeGreaterThan(0);
      });

      it("slot bindings do not exceed slot budget constraints", () => {
        const longBody = Array.from({ length: 10 }, () => "A".repeat(200));
        const input = makeInput({ body: longBody, notes: "N".repeat(800) });
        const result = buildPresentationComponentRecipeSlotBindings(recipeId, input);
        for (const binding of result) {
          if (binding.type === "text") {
            const budget = getPresentationComponentSlotBudget(recipeId, binding.slotId);
            if (budget.maxChars) {
              expect(measurePresentationTextUnits(binding.text)).toBeLessThanOrEqual(budget.maxChars);
            } else {
              expect(binding.text.length).toBeLessThanOrEqual(2000);
            }
          }
          if (binding.type === "list") {
            const budget = getPresentationComponentSlotBudget(recipeId, binding.slotId);
            if (budget.maxItems) {
              expect(binding.items.length).toBeLessThanOrEqual(budget.maxItems);
            }
            if (budget.maxChars) {
              for (const item of binding.items) {
                expect(measurePresentationTextUnits(item)).toBeLessThanOrEqual(budget.maxChars);
              }
            }
          }
        }
      });
    });
  }

  it("article-focus includes key-points list slot", () => {
    const result = buildPresentationComponentRecipeSlotBindings("article-focus", makeInput());
    const keyPoints = result.find((b) => b.slotId === "key-points");
    expect(keyPoints).toBeDefined();
    expect(keyPoints!.type).toBe("list");
  });

  it("faq-stack produces 3 question-answer pairs", () => {
    const result = buildPresentationComponentRecipeSlotBindings("faq-stack", makeInput());
    const questions = result.filter((b) => b.slotId.match(/^faq\d-question$/));
    const answers = result.filter((b) => b.slotId.match(/^faq\d-answer$/));
    expect(questions).toHaveLength(3);
    expect(answers).toHaveLength(3);
  });

  it("profile-board includes portrait image slot", () => {
    const result = buildPresentationComponentRecipeSlotBindings("profile-board", makeInput());
    const portrait = result.find((b) => b.slotId === "portrait");
    expect(portrait).toBeDefined();
    expect(portrait!.type).toBe("image");
  });

  it("sectioned-explainer includes takeaways list", () => {
    const result = buildPresentationComponentRecipeSlotBindings("sectioned-explainer", makeInput());
    const takeaways = result.find((b) => b.slotId === "takeaways");
    const hero = result.find((b) => b.slotId === "hero");
    expect(takeaways).toBeDefined();
    expect(takeaways!.type).toBe("list");
    expect(hero).toBeDefined();
    expect(hero!.type).toBe("image");
  });

  it("article-focus includes hero image slot", () => {
    const result = buildPresentationComponentRecipeSlotBindings("article-focus", makeInput());
    const hero = result.find((b) => b.slotId === "hero");
    expect(hero).toBeDefined();
    expect(hero!.type).toBe("image");
  });

  it("two-column-article includes hero image slot", () => {
    const result = buildPresentationComponentRecipeSlotBindings("two-column-article", makeInput());
    const hero = result.find((b) => b.slotId === "hero");
    expect(hero).toBeDefined();
    expect(hero!.type).toBe("image");
  });

  it("stat-cards extracts value/label pairs", () => {
    const input = makeInput({
      body: ["95%: Satisfaction Rate", "4.8: Average Rating", "50K: Monthly Users"],
    });
    const result = buildPresentationComponentRecipeSlotBindings("stat-cards", input);
    const stat1Value = result.find((b) => b.slotId === "stat1-value");
    expect(stat1Value).toBeDefined();
    expect(stat1Value!.type).toBe("text");
  });

  it("photo-collage includes two image slots", () => {
    const input = makeInput({
      mediaUrls: ["https://example.com/a.jpg", "https://example.com/b.jpg"],
    });
    const result = buildPresentationComponentRecipeSlotBindings("photo-collage", input);
    const primary = result.find((b) => b.slotId === "primary-photo");
    const secondary = result.find((b) => b.slotId === "secondary-photo");
    expect(primary).toBeDefined();
    expect(primary!.type).toBe("image");
    expect(secondary).toBeDefined();
    expect(secondary!.type).toBe("image");
  });

  it("a4-photo-grid includes five image-oriented slots", () => {
    const input = makeInput({
      mediaUrls: [
        "https://example.com/a.jpg",
        "https://example.com/b.jpg",
        "https://example.com/c.jpg",
        "https://example.com/d.jpg",
        "https://example.com/e.jpg",
      ],
    });
    const result = buildPresentationComponentRecipeSlotBindings("a4-photo-grid", input);
    for (const slotId of ["hero-photo", "detail-photo-1", "detail-photo-2", "detail-photo-3", "detail-photo-4"]) {
      const binding = result.find((entry) => entry.slotId === slotId);
      expect(binding).toBeDefined();
      expect(binding!.type).toBe("image");
    }
  });

  it("landscape-photo-story includes supporting image slots and highlights", () => {
    const input = makeInput({
      mediaUrls: [
        "https://example.com/a.jpg",
        "https://example.com/b.jpg",
        "https://example.com/c.jpg",
        "https://example.com/d.jpg",
      ],
    });
    const result = buildPresentationComponentRecipeSlotBindings("landscape-photo-story", input);
    expect(result.find((entry) => entry.slotId === "hero-photo")?.type).toBe("image");
    expect(result.find((entry) => entry.slotId === "detail-photo-1")?.type).toBe("image");
    expect(result.find((entry) => entry.slotId === "detail-photo-2")?.type).toBe("image");
    expect(result.find((entry) => entry.slotId === "detail-photo-3")?.type).toBe("image");
    expect(result.find((entry) => entry.slotId === "highlights")?.type).toBe("list");
  });

  it("clamps thai-heavy profile-summary text using weighted slot capacity", () => {
    const thaiLong = "ก".repeat(1200);
    const result = buildPresentationComponentRecipeSlotBindings("profile-summary", makeInput({
      title: thaiLong,
      notes: thaiLong,
      sections: [
        { heading: thaiLong, details: [thaiLong, thaiLong] },
        { heading: thaiLong, details: [thaiLong] },
        { heading: thaiLong, details: [thaiLong, thaiLong] },
      ],
    }));

    for (const binding of result) {
      if (binding.type !== "text" && binding.type !== "list") {
        continue;
      }
      const budget = getPresentationComponentSlotBudget("profile-summary", binding.slotId);
      if (binding.type === "text" && budget.maxChars) {
        expect(measurePresentationTextUnits(binding.text)).toBeLessThanOrEqual(budget.maxChars);
      }
      if (binding.type === "list" && budget.maxChars) {
        for (const item of binding.items) {
          expect(measurePresentationTextUnits(item)).toBeLessThanOrEqual(budget.maxChars);
        }
      }
    }
  });
});
