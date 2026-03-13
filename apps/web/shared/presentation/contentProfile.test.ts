import { describe, expect, it } from "vitest";

import type { AIPresentationSlide } from "./aiTypes";
import {
  buildPresentationContentProfile,
  resolvePresentationLayoutMode,
} from "./contentProfile";

function buildSlide(overrides: Partial<AIPresentationSlide> = {}): AIPresentationSlide {
  return {
    templateId: "split_right_image",
    title: "หัวข้อทดสอบ",
    body: ["สรุปสั้น"],
    graphicCategory: "Business",
    imagePromptKeywords: "test image",
    ...overrides,
  };
}

describe("presentation content profile", () => {
  it("derives paragraph, bullet, section, and source identifiers from markdown-shaped content", () => {
    const profile = buildPresentationContentProfile(buildSlide({
      body: [
        "เกริ่นนำสั้น ๆ",
        "- bullet หนึ่ง",
        "- bullet สอง",
      ],
      markdownHierarchy: [
        { level: "h2", text: "ภาพรวม" },
        { level: "body", text: "คำอธิบายฉบับย่อ" },
        { level: "h3", text: "รายละเอียดเพิ่มเติม" },
      ],
      sections: [
        {
          heading: "สิ่งที่ควรสังเกต",
          details: [
            "ย่อหน้าแรกที่ยาวกว่าปกติสำหรับใช้ประเมินความหนาแน่นของข้อความในสไลด์นี้",
            "- รายการสรุปที่ควรนับเป็น bullet",
          ],
        },
      ],
    }));

    expect(profile.headingCount).toBe(1);
    expect(profile.subheadingCount).toBe(1);
    expect(profile.sectionCount).toBe(1);
    expect(profile.bulletCount).toBe(3);
    expect(profile.paragraphCount).toBeGreaterThanOrEqual(4);
    expect(profile.paragraphs.map((paragraph) => paragraph.id)).toEqual(expect.arrayContaining([
      "body-0",
      "body-1",
      "section-0-detail-0",
    ]));
    expect(profile.sections.map((section) => section.id)).toEqual(["section-0"]);
  });
});

describe("presentation layout mode router", () => {
  it("prefers long-form mode for dense section-heavy slides and records unavailable richer modes", () => {
    const resolved = resolvePresentationLayoutMode({
      slide: buildSlide({
        title: "ขั้นตอนปฏิบัติ / เคล็ดลับ",
        body: [
          "สร้างกิจวัตรก่อนนอน: ทำให้กิจกรรมตอนก่อนนอนมีความซ้ำซ้อน เช่น อ่านหนังสือ เล่าเรื่อง หรืออาบน้ำ เพื่อสร้างความรู้สึกผ่อนคลายให้กับลูก",
          "กำหนดเวลาเข้านอน: ตั้งเวลาเข้านอนที่สม่ำเสมอทุกวัน เพื่อช่วยให้ร่างกายสร้างนิสัยในการนอน",
          "สร้างสภาพแวดล้อมที่เอื้อต่อการนอน: ห้องนอนควรเงียบ สบาย และมีอุณหภูมิที่เหมาะสม",
        ],
        sections: [
          {
            heading: "ความผิดพลาดที่พบบ่อย",
            details: [
              "ให้นอนในที่นอนที่ไม่ปลอดภัย: ควรจัดสภาพแวดล้อมให้นอนอย่างปลอดภัย",
              "นอนดึกและตื่นไม่เป็นเวลา: ควรรักษาเวลาเข้านอนและตื่นนอนให้ใกล้เคียงกันทุกวัน",
            ],
          },
          {
            heading: "ใครควรอ่านสไลด์นี้",
            details: [
              "พ่อแม่หรือผู้ดูแลเด็กเล็กที่กำลังฝึกนิสัยการนอนของลูก",
            ],
          },
        ],
      }),
      slideIndex: 2,
      enabledModes: {
        structured_block: true,
        long_form_block: false,
        llm_layout_dsl: false,
        full_slide_media: false,
      },
      previousModes: ["structured_block"],
    });

    expect(resolved.recommendedMode).toBe("long_form_block");
    expect(resolved.mode).toBe("structured_block");
    expect(resolved.candidateModes[0]).toMatchObject({
      mode: "long_form_block",
      blockedBy: "feature_flag",
    });
    expect(resolved.profile.longParagraphCount).toBeGreaterThan(0);
  });

  it("penalizes repeated full-slide media choices to protect deck consistency", () => {
    const resolved = resolvePresentationLayoutMode({
      slide: buildSlide({
        title: "โปรโมชันใหม่",
        body: ["ราคาพิเศษวันนี้", "สมัครเลย"],
        notes: "Poster style launch slide with short campaign copy.",
      }),
      slideIndex: 3,
      enabledModes: {
        structured_block: true,
        long_form_block: false,
        llm_layout_dsl: false,
        full_slide_media: true,
      },
      previousModes: ["full_slide_media", "structured_block", "full_slide_media"],
    });

    expect(resolved.candidateModes.find((candidate) => candidate.mode === "full_slide_media")?.reason)
      .toContain("deck consistency");
    expect(resolved.mode).toBe("structured_block");
  });
});
