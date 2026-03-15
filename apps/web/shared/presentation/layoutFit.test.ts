import { describe, expect, it } from "vitest";

import { evaluatePresentationRecipeSlotFit } from "./recipeCompaction";
import type { PresentationComponentSlotBinding } from "./contracts";

describe("evaluatePresentationRecipeSlotFit", () => {
  it("marks oversized raw long-form slot bindings as unsafe", () => {
    const rawBindings: PresentationComponentSlotBinding[] = [
      { slotId: "eyebrow", type: "text", text: "Explainer" },
      { slotId: "title", type: "text", text: "คู่มือการนอนของเด็กเล็กแบบละเอียดมากที่ยาวกว่าช่องหัวเรื่องตาม budget อย่างชัดเจน" },
      {
        slotId: "intro",
        type: "text",
        text: "บทนำที่ยาวมาก ".repeat(80).trim(),
      },
      { slotId: "section1-heading", type: "text", text: "ความผิดพลาดที่พบบ่อย" },
      { slotId: "section1-body", type: "text", text: "รายละเอียดที่ยาวมาก ".repeat(50).trim() },
      { slotId: "section2-heading", type: "text", text: "ใครควรอ่าน" },
      { slotId: "section2-body", type: "text", text: "คำอธิบายที่ยาวมาก ".repeat(50).trim() },
      { slotId: "section3-heading", type: "text", text: "สิ่งที่ควรทำต่อ" },
      { slotId: "section3-body", type: "text", text: "คำอธิบายที่ยาวมาก ".repeat(50).trim() },
      { slotId: "takeaways-title", type: "text", text: "Key Takeaways" },
      {
        slotId: "takeaways",
        type: "list",
        items: [
          "ข้อแรกที่ยาวมากและกินพื้นที่เกินควร".repeat(3),
          "ข้อสองที่ยาวมากและกินพื้นที่เกินควร".repeat(3),
          "ข้อสามที่ยาวมากและกินพื้นที่เกินควร".repeat(3),
          "ข้อสี่ที่ยาวมากและกินพื้นที่เกินควร".repeat(3),
          "ข้อห้าที่ไม่ควรเหลืออยู่",
        ],
      },
    ];

    const result = evaluatePresentationRecipeSlotFit("sectioned-explainer", rawBindings);

    expect(result.fitScore.status).toBe("unsafe");
    expect(result.fitScore.overall).toBeLessThan(0.62);
    expect(result.fitScore.overflowRisk).toBeGreaterThan(0.45);
  });

  it("accepts compacted long-form slot bindings that stay within budget", () => {
    const compactedBindings: PresentationComponentSlotBinding[] = [
      { slotId: "eyebrow", type: "text", text: "Sleep guide" },
      { slotId: "title", type: "text", text: "คู่มือการนอนของเด็กเล็ก" },
      { slotId: "intro", type: "text", text: "เริ่มจากกิจวัตรเดิมทุกคืนและรักษาเวลาเข้านอนให้คงที่เพื่อสร้างสัญญาณก่อนนอนที่ชัดเจน" },
      { slotId: "section1-heading", type: "text", text: "ความผิดพลาดที่พบบ่อย" },
      { slotId: "section1-body", type: "text", text: "หลีกเลี่ยงการเปลี่ยนเวลานอนทุกวันและอย่าตอบสนองทันทีทุกครั้งโดยไม่มีแผน" },
      { slotId: "section2-heading", type: "text", text: "ใครควรอ่าน" },
      { slotId: "section2-body", type: "text", text: "เหมาะกับพ่อแม่หรือผู้ดูแลเด็กเล็กที่กำลังฝึกนิสัยการนอนของลูก" },
      { slotId: "section3-heading", type: "text", text: "สิ่งที่ควรทำต่อ" },
      { slotId: "section3-body", type: "text", text: "เลือกเพียงหนึ่งถึงสองแนวทางแล้วทำซ้ำอย่างต่อเนื่องเพื่อให้เด็กไม่สับสน" },
      { slotId: "takeaways-title", type: "text", text: "Key Takeaways" },
      {
        slotId: "takeaways",
        type: "list",
        items: [
          "ทำกิจวัตรเดิมทุกคืน",
          "รักษาเวลาเข้านอนให้คงที่",
          "ให้ผู้ดูแลใช้แนวทางเดียวกัน",
        ],
      },
    ];

    const result = evaluatePresentationRecipeSlotFit("sectioned-explainer", compactedBindings);

    expect(result.fitScore.status).toBe("fits");
    expect(result.fitScore.overall).toBeGreaterThanOrEqual(0.78);
    expect(result.fitScore.overflowRisk).toBeLessThanOrEqual(0.45);
  });
});
