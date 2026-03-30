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

  it("sectioned-explainer intro prefers structured slide copy over the full raw note", () => {
    const result = buildPresentationComponentRecipeSlotBindings("sectioned-explainer", makeInput({
      body: [
        "เริ่มจากสร้างกิจวัตรเดิมทุกคืน",
        "รักษาเวลาเข้านอนให้คงที่",
      ],
      notes: "เริ่มจากสร้างกิจวัตรเดิมทุกคืน รักษาเวลาเข้านอนให้คงที่ และอธิบายรายละเอียดเต็มที่ไม่ควรถูกยกทั้งก้อนมาเป็น intro",
    }));
    const intro = result.find((binding) => binding.slotId === "intro" && binding.type === "text");
    expect(intro?.type).toBe("text");
    if (intro?.type === "text") {
      expect(intro.text).toContain("เริ่มจากสร้างกิจวัตรเดิมทุกคืน");
      expect(intro.text).not.toContain("อธิบายรายละเอียดเต็มที่ไม่ควรถูกยกทั้งก้อนมาเป็น intro");
    }
  });

  it("article-focus lead prefers visible body copy over the full slide note blob", () => {
    const result = buildPresentationComponentRecipeSlotBindings("article-focus", makeInput({
      body: [
        "เริ่มจากประเมิน pattern การนอนของลูกในแต่ละคืน",
        "จดข้อมูลช่วงเวลาที่ตื่นและวิธีที่ช่วยให้กลับมาสงบได้",
      ],
      notes: "เริ่มจากประเมิน pattern การนอนของลูกในแต่ละคืน จดข้อมูลช่วงเวลาที่ตื่นและวิธีที่ช่วยให้กลับมาสงบได้ พร้อมรายละเอียดขยายยาวที่ไม่ควรถูกยกมาทั้งหมดใน lead",
    }));
    const lead = result.find((binding) => binding.slotId === "lead" && binding.type === "text");
    expect(lead?.type).toBe("text");
    if (lead?.type === "text") {
      expect(lead.text).toContain("เริ่มจากประเมิน pattern การนอนของลูก");
      expect(lead.text).not.toContain("รายละเอียดขยายยาวที่ไม่ควรถูกยกมาทั้งหมดใน lead");
    }
  });

  it("article-focus does not duplicate the same paragraph into both lead and body on single-thread slides", () => {
    const repeatedParagraph = "คู่มือการฝึกทารกวัยหกเดือนให้นอนหลับยาวตลอดคืน เมื่อลูกมีอายุหกเดือน ร่างกายของเขามักจะพร้อมสำหรับการนอนยาวตลอดคืนเนื่องจากขนาดกระเพาะอาหารที่ใหญ่ขึ้นและไม่จำเป็นต้องตื่นมาดื่มนมมื้อดึกบ่อยเหมือนช่วงแรกเกิด";
    const result = buildPresentationComponentRecipeSlotBindings("article-focus", makeInput({
      title: "คู่มือการฝึกทารกวัยหกเดือนให้นอนหลับยาวตลอดคืน",
      body: [repeatedParagraph],
      notes: repeatedParagraph,
      sections: [],
      graphicCategory: "Communication",
    }));

    const lead = result.find((binding) => binding.slotId === "lead" && binding.type === "text");
    const body = result.find((binding) => binding.slotId === "body" && binding.type === "text");
    const eyebrow = result.find((binding) => binding.slotId === "eyebrow" && binding.type === "text");

    expect(lead?.type).toBe("text");
    expect(body?.type).toBe("text");
    expect(eyebrow?.type).toBe("text");
    if (lead?.type === "text" && body?.type === "text" && eyebrow?.type === "text") {
      expect(lead.text).not.toContain("คู่มือการฝึกทารกวัยหกเดือนให้นอนหลับยาวตลอดคืน ");
      expect(body.text).not.toBe(lead.text);
      expect(body.text).not.toContain("คู่มือการฝึกทารกวัยหกเดือนให้นอนหลับยาวตลอดคืน");
      expect(eyebrow.text).toBe("Article");
    }
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
