import { describe, expect, it } from "vitest";

import {
  BUILT_IN_PRESENTATION_COMPONENT_IDS,
  PRESENTATION_COMPONENT_LAYOUT_FAMILIES,
  PRESENTATION_COMPONENT_SLOT_BUDGETS,
} from "./componentRecipes";
import { buildPresentationComponentRecipeSlotBindings } from "./componentRecipeSlotBindings";

describe("presentation component recipe metadata", () => {
  it("provides slot budgets and layout families for every built-in component recipe", () => {
    for (const recipeId of BUILT_IN_PRESENTATION_COMPONENT_IDS) {
      expect(PRESENTATION_COMPONENT_LAYOUT_FAMILIES[recipeId]).toBeTruthy();
      expect(PRESENTATION_COMPONENT_SLOT_BUDGETS[recipeId]).toBeTruthy();
      expect(Object.keys(PRESENTATION_COMPONENT_SLOT_BUDGETS[recipeId] ?? {})).not.toHaveLength(0);
    }
  });

  it("marks sectioned-explainer as a long-form family recipe", () => {
    expect(PRESENTATION_COMPONENT_LAYOUT_FAMILIES["sectioned-explainer"]).toBe("long_form");
    expect(PRESENTATION_COMPONENT_SLOT_BUDGETS["sectioned-explainer"]).toMatchObject({
      intro: expect.objectContaining({ maxChars: expect.any(Number) }),
      "section1-body": expect.objectContaining({ maxChars: expect.any(Number) }),
      takeaways: expect.objectContaining({ maxItems: expect.any(Number) }),
    });
  });
});

describe("sectioned-explainer slot bindings", () => {
  it("maps dense sectioned narratives into long-form slots without collapsing everything into compact text", () => {
    const slotBindings = buildPresentationComponentRecipeSlotBindings("sectioned-explainer", {
      title: "คู่มือการนอนของเด็กเล็ก",
      body: [
        "สร้างกิจวัตรก่อนนอนให้สม่ำเสมอด้วยกิจกรรมเดิมในเวลาใกล้เคียงกันทุกวัน",
        "สังเกตสัญญาณง่วงและปรับสภาพแวดล้อมห้องให้เงียบ สบาย และมืดเพียงพอ",
        "คุยกับผู้ดูแลทุกคนให้ใช้แนวทางเดียวกันเพื่อลดความสับสนของเด็ก",
      ],
      notes: "บทความนี้เหมาะสำหรับพ่อแม่และผู้ดูแลที่ต้องการคำอธิบายยาวและค่อยเป็นค่อยไปมากกว่าการ์ดสั้น",
      sections: [
        {
          heading: "ความผิดพลาดที่พบบ่อย",
          details: [
            "ตอบสนองเร็วเกินไปทุกครั้งจนเด็กไม่ได้ฝึกกลับไปนอนเอง",
            "เวลาเข้านอนไม่คงที่ทำให้วงจรการนอนเปลี่ยนบ่อย",
          ],
        },
        {
          heading: "ใครควรอ่านสไลด์นี้",
          details: [
            "พ่อแม่หรือผู้ดูแลเด็กเล็กที่กำลังฝึกนิสัยการนอนของลูก",
          ],
        },
      ],
      graphicCategory: "Education",
    });

    const bySlot = new Map(slotBindings.map((slot) => [slot.slotId, slot] as const));
    expect(bySlot.get("title")).toMatchObject({ type: "text", text: "คู่มือการนอนของเด็กเล็ก" });
    expect(bySlot.get("section1-heading")).toMatchObject({ type: "text", text: "ความผิดพลาดที่พบบ่อย" });
    expect(bySlot.get("section2-heading")).toMatchObject({ type: "text", text: "ใครควรอ่านสไลด์นี้" });
    expect(bySlot.get("takeaways")).toMatchObject({
      type: "list",
      items: expect.arrayContaining([
        expect.stringContaining("สร้างกิจวัตรก่อนนอน"),
      ]),
    });
  });
});
