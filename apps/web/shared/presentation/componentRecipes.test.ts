import { describe, expect, it } from "vitest";

import {
  BUILT_IN_PRESENTATION_COMPONENT_IDS,
  clampPresentationTextToUnits,
  getPresentationComponentSlotTextCapacity,
  PRESENTATION_COMPONENT_MEDIA_SLOT_TYPES,
  PRESENTATION_COMPONENT_LAYOUT_FAMILIES,
  PRESENTATION_COMPONENT_SLOT_BUDGETS,
  presentationMediaSlotSupportsType,
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

  it("marks faq-stack as a long-form family recipe with question and answer budgets", () => {
    expect(PRESENTATION_COMPONENT_LAYOUT_FAMILIES["faq-stack"]).toBe("long_form");
    expect(PRESENTATION_COMPONENT_SLOT_BUDGETS["faq-stack"]).toMatchObject({
      intro: expect.objectContaining({ maxChars: expect.any(Number) }),
      "faq1-question": expect.objectContaining({ maxChars: expect.any(Number) }),
      "faq1-answer": expect.objectContaining({ maxChars: expect.any(Number) }),
    });
  });

  it("marks timeline-report as a long-form family recipe with milestone and next-step budgets", () => {
    expect(PRESENTATION_COMPONENT_LAYOUT_FAMILIES["timeline-report"]).toBe("long_form");
    expect(PRESENTATION_COMPONENT_SLOT_BUDGETS["timeline-report"]).toMatchObject({
      summary: expect.objectContaining({ maxChars: expect.any(Number) }),
      "phase1-date": expect.objectContaining({ maxChars: expect.any(Number) }),
      "phase1-body": expect.objectContaining({ maxChars: expect.any(Number) }),
      "next-steps": expect.objectContaining({ maxItems: expect.any(Number) }),
    });
  });

  it("marks two-column-article as a long-form family recipe with mirrored section budgets", () => {
    expect(PRESENTATION_COMPONENT_LAYOUT_FAMILIES["two-column-article"]).toBe("long_form");
    expect(PRESENTATION_COMPONENT_SLOT_BUDGETS["two-column-article"]).toMatchObject({
      intro: expect.objectContaining({ maxChars: expect.any(Number) }),
      "left-title": expect.objectContaining({ maxChars: expect.any(Number) }),
      "left-body": expect.objectContaining({ maxChars: expect.any(Number) }),
      "right-title": expect.objectContaining({ maxChars: expect.any(Number) }),
      "right-body": expect.objectContaining({ maxChars: expect.any(Number) }),
      takeaways: expect.objectContaining({ maxItems: expect.any(Number) }),
    });
  });

  it("marks new photo-led A4 recipes as long-form with multi-image budgets", () => {
    expect(PRESENTATION_COMPONENT_LAYOUT_FAMILIES["a4-photo-grid"]).toBe("long_form");
    expect(PRESENTATION_COMPONENT_SLOT_BUDGETS["a4-photo-grid"]).toMatchObject({
      headline: expect.objectContaining({ maxChars: expect.any(Number) }),
      "hero-photo": expect.any(Object),
      "detail-photo-4": expect.any(Object),
    });
    expect(PRESENTATION_COMPONENT_LAYOUT_FAMILIES["landscape-photo-story"]).toBe("long_form");
    expect(PRESENTATION_COMPONENT_SLOT_BUDGETS["landscape-photo-story"]).toMatchObject({
      body: expect.objectContaining({ maxChars: expect.any(Number) }),
      "detail-photo-3": expect.any(Object),
      highlights: expect.objectContaining({ maxItems: expect.any(Number) }),
    });
  });

  it("marks visual A4 and editorial hero slots as mixed media where image or video can be bound", () => {
    expect(PRESENTATION_COMPONENT_MEDIA_SLOT_TYPES["a4-photo-grid"]?.["hero-photo"]).toBe("media");
    expect(PRESENTATION_COMPONENT_MEDIA_SLOT_TYPES["sectioned-explainer"]?.hero).toBe("media");
    expect(presentationMediaSlotSupportsType("media", "image")).toBe(true);
    expect(presentationMediaSlotSupportsType("media", "video")).toBe(true);
  });
});

describe("presentation component slot text capacity", () => {
  it("derives thai guidance more conservatively than english guidance", () => {
    const capacity = getPresentationComponentSlotTextCapacity("article-focus", "body");
    expect(capacity.recommendedEnglishChars).toBeTruthy();
    expect(capacity.recommendedThaiChars).toBeTruthy();
    expect(capacity.recommendedThaiChars!).toBeLessThan(capacity.recommendedEnglishChars!);
    expect(capacity.maxTextUnits).toBe(PRESENTATION_COMPONENT_SLOT_BUDGETS["article-focus"].body.maxChars);
  });

  it("clamps thai-heavy text sooner than the raw character max", () => {
    const clamped = clampPresentationTextToUnits("ก".repeat(120), 100);
    expect(clamped.length).toBeLessThan(100);
    expect(clamped.length).toBeGreaterThan(0);
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

describe("faq-stack slot bindings", () => {
  it("maps question-heavy narratives into stacked FAQ slots", () => {
    const slotBindings = buildPresentationComponentRecipeSlotBindings("faq-stack", {
      title: "เด็กตื่นกลางคืนบ่อยควรทำอย่างไร",
      body: [
        "เด็กตื่นกลางคืนบ่อยเป็นเรื่องปกติไหม",
        "ในวัยทารกการตื่นกลางคืนยังพบได้ปกติ แต่ควรสังเกตรูปแบบการหลับร่วมด้วย",
        "ควรรีบอุ้มทันทีทุกครั้งหรือไม่",
        "เริ่มจากประเมินก่อนว่าเด็กต้องการความช่วยเหลือจริงหรือสามารถกลับไปหลับต่อเองได้",
      ],
      notes: "รวมคำถามที่พ่อแม่ถามบ่อยเกี่ยวกับการนอนของเด็กเล็ก",
      sections: [
        {
          heading: "เด็กตื่นกลางคืนบ่อยเป็นเรื่องปกติไหม",
          details: ["ในวัยทารกการตื่นกลางคืนยังพบได้ปกติ แต่ควรสังเกตรูปแบบการหลับร่วมด้วย"],
        },
        {
          heading: "ควรรีบอุ้มทันทีทุกครั้งหรือไม่",
          details: ["เริ่มจากประเมินก่อนว่าเด็กต้องการความช่วยเหลือจริงหรือสามารถกลับไปหลับต่อเองได้"],
        },
        {
          heading: "เมื่อไรควรขอคำปรึกษาแพทย์",
          details: ["หากมีอาการร่วม เช่น หายใจผิดปกติ น้ำหนักไม่ขึ้น หรือร้องกวนรุนแรงผิดปกติ ควรปรึกษาแพทย์"],
        },
      ],
      graphicCategory: "Education",
    });

    const bySlot = new Map(slotBindings.map((slot) => [slot.slotId, slot] as const));
    expect(bySlot.get("title")).toMatchObject({ type: "text", text: "เด็กตื่นกลางคืนบ่อยควรทำอย่างไร" });
    expect(bySlot.get("faq1-question")).toMatchObject({
      type: "text",
      text: expect.stringContaining("เด็กตื่นกลางคืนบ่อย"),
    });
    expect(bySlot.get("faq2-answer")).toMatchObject({
      type: "text",
      text: expect.stringContaining("ประเมินก่อน"),
    });
  });
});

describe("timeline-report slot bindings", () => {
  it("maps dense roadmap narratives into long-form timeline slots", () => {
    const slotBindings = buildPresentationComponentRecipeSlotBindings("timeline-report", {
      title: "แผนพัฒนาโครงการตลอดปี 2026",
      body: [
        "Q1 2026 รวบรวมข้อมูลผู้ใช้และนิยามปัญหาที่ต้องแก้ก่อนเริ่มออกแบบระบบใหม่",
        "Q2 2026 ทดลองใช้ workflow ใหม่กับทีมหลักและปรับวิธีทำงานจาก feedback จริง",
        "Q3 2026 ขยายการใช้งานสู่หลายทีมพร้อมจัดชุดคู่มือและ dashboard ติดตามผล",
      ],
      notes: "โรดแมปนี้ต้องเก็บคำอธิบายของแต่ละช่วงเวลาและสิ่งที่ต้องทำต่อแบบยังแก้ไขได้ใน editor",
      sections: [
        {
          heading: "Q1 2026 Discover the bottlenecks",
          details: ["สัมภาษณ์ทีมงาน รวบรวม pain points และสรุปข้อจำกัดหลักของระบบเดิม"],
        },
        {
          heading: "Q2 2026 Pilot the new workflow",
          details: ["ทดสอบกับทีมหลัก วัดเวลาใช้งานจริง และเก็บข้อเสนอแนะเพื่อปรับปรุงขั้นตอน"],
        },
        {
          heading: "Q3 2026 Scale and govern",
          details: ["ขยาย rollout พร้อมคู่มือ มาตรฐานทีม และ owner สำหรับ governance หลังเปิดใช้จริง"],
        },
      ],
      graphicCategory: "Roadmap",
    });

    const bySlot = new Map(slotBindings.map((slot) => [slot.slotId, slot] as const));
    expect(bySlot.get("title")).toMatchObject({ type: "text", text: "แผนพัฒนาโครงการตลอดปี 2026" });
    expect(bySlot.get("phase1-date")).toMatchObject({ type: "text", text: expect.stringContaining("Q1 2026") });
    expect(bySlot.get("phase2-title")).toMatchObject({ type: "text", text: expect.stringContaining("Pilot") });
    expect(bySlot.get("next-steps")).toMatchObject({
      type: "list",
      items: expect.arrayContaining([expect.stringContaining("workflow")]),
    });
  });
});

describe("two-column-article slot bindings", () => {
  it("maps dense two-section narratives into mirrored long-form columns", () => {
    const slotBindings = buildPresentationComponentRecipeSlotBindings("two-column-article", {
      title: "แนวทางพัฒนาทักษะการสื่อสารสำหรับทีมงาน",
      body: [
        "การสื่อสารที่ดีในทีมเริ่มจากการทำให้ทุกคนเข้าใจบริบทเดียวกันก่อนลงมือทำ",
        "หัวหน้าทีมควรสร้างจังหวะการอัปเดตที่สม่ำเสมอและกำหนดว่าประเด็นไหนต้องสื่อสารแบบ synchronous",
        "หลังจากนั้นจึงค่อยออกแบบวิธีติดตามงานที่ไม่ทำให้ทุกคนต้องประชุมมากเกินจำเป็น",
      ],
      notes: "สไลด์นี้เป็นบทความสองช่วงที่ต้องวางซ้ายขวาอย่างสมดุลและยังมี takeaway ให้สรุปตอนท้าย",
      sections: [
        {
          heading: "ตั้งบริบทให้ตรงกัน",
          details: [
            "เริ่มจากนิยามเป้าหมาย ขอบเขต และคำที่ใช้ร่วมกันให้ชัดเจนก่อนจะลงรายละเอียดงาน",
          ],
        },
        {
          heading: "ออกแบบจังหวะการสื่อสาร",
          details: [
            "กำหนดว่าการตัดสินใจใดต้องคุยสด และเรื่องใดส่งต่อแบบ asynchronous ได้เพื่อไม่ให้ทีมประชุมเกินจำเป็น",
          ],
        },
      ],
      graphicCategory: "Communication",
    });

    const bySlot = new Map(slotBindings.map((slot) => [slot.slotId, slot] as const));
    expect(bySlot.get("left-title")).toMatchObject({ type: "text", text: "ตั้งบริบทให้ตรงกัน" });
    expect(bySlot.get("right-title")).toMatchObject({ type: "text", text: "ออกแบบจังหวะการสื่อสาร" });
    expect(bySlot.get("takeaways")).toMatchObject({
      type: "list",
      items: expect.arrayContaining([
        expect.stringContaining("การสื่อสารที่ดี"),
      ]),
    });
  });
});
