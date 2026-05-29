import { describe, expect, it } from "vitest";
import {
  buildProductionReferenceStoryboardConceptDetails,
  buildProductionReferenceStoryboardGuide,
  buildProductionReferenceStoryboardSceneDescriptions,
  detectProductionReferenceStoryboardSkillIdFromText,
  PRODUCTION_REFERENCE_STORYBOARD_SKILL_IDS,
} from "./productionReferenceStoryboard";

describe("productionReferenceStoryboard", () => {
  it("covers every current production reference storyboard category skill", () => {
    expect([...PRODUCTION_REFERENCE_STORYBOARD_SKILL_IDS].sort()).toEqual([
      "automotive-reference-storyboard",
      "books-reference-storyboard",
      "camera-photography-reference-storyboard",
      "computer-laptop-reference-storyboard",
      "cosmatic-reference-storyboard",
      "electrical-appliance-reference-storyboard",
      "electronics-reference-storyboard",
      "fashion-clothing-reference-storyboard",
      "food-beverage-reference-storyboard",
      "furniture-reference-storyboard",
      "gaming-accessories-reference-storyboard",
      "household-product-reference-storyboard",
      "jewelry-reference-storyboard",
      "mobile-tablet-reference-storyboard",
      "mother-baby-reference-storyboard",
      "pet-supplies-reference-storyboard",
      "shoes-reference-storyboard",
      "sports-equipment-reference-storyboard",
      "stationery-reference-storyboard",
      "watch-eyewear-reference-storyboard",
    ]);
  });

  it("detects category-specific reference storyboard skills from product text", () => {
    expect(
      detectProductionReferenceStoryboardSkillIdFromText(
        "Greenforst โต๊ะวางของ ชั้นวางสไตล์นอร์ดิก ชั้นวางของข้างเตียง ขนาดเล็ก รุ่น F-2122",
      ),
    ).toBe("furniture-reference-storyboard");

    expect(
      detectProductionReferenceStoryboardSkillIdFromText(
        "เก้าอี้กินข้าวเด็ก โต๊ะกินข้าว เด็ก 6 เดือน high chair พร้อมเข็มขัดนิรภัย",
      ),
    ).toBe("mother-baby-reference-storyboard");

    expect(
      detectProductionReferenceStoryboardSkillIdFromText("หูฟัง earbuds พร้อมเคสชาร์จและสายชาร์จ"),
    ).toBe("electronics-reference-storyboard");

    expect(
      detectProductionReferenceStoryboardSkillIdFromText("รองเท้าวิ่ง sneakers น้ำหนักเบา"),
    ).toBe("shoes-reference-storyboard");
  });

  it.each([
    ["automotive-reference-storyboard", "กล้องติดรถ dash cam สำหรับรถยนต์"],
    ["books-reference-storyboard", "หนังสือนิยายและมังงะ box set"],
    ["camera-photography-reference-storyboard", "กล้อง action camera พร้อมขาตั้งกล้อง"],
    ["computer-laptop-reference-storyboard", "โน้ตบุ๊ก laptop พร้อมเมาส์และคีย์บอร์ด"],
    ["cosmatic-reference-storyboard", "สกินแคร์ serum และ lipstick beauty set"],
    ["electrical-appliance-reference-storyboard", "หม้อทอด air fryer เครื่องใช้ไฟฟ้าในบ้าน"],
    ["electronics-reference-storyboard", "หูฟัง earbuds พร้อมพาวเวอร์แบงค์"],
    ["fashion-clothing-reference-storyboard", "เสื้อผ้าแฟชั่น dress jacket activewear"],
    ["food-beverage-reference-storyboard", "กาแฟ เครื่องดื่ม powdered drink"],
    ["furniture-reference-storyboard", "โต๊ะข้างเตียง furniture ชั้นวางของ"],
    ["gaming-accessories-reference-storyboard", "จอยเกม controller gaming headset"],
    ["household-product-reference-storyboard", "กล่องเก็บของ organizer เครื่องใช้ในบ้าน"],
    ["jewelry-reference-storyboard", "แหวน necklace earrings เครื่องประดับ"],
    ["mobile-tablet-reference-storyboard", "มือถือ smartphone tablet เคสมือถือ"],
    ["mother-baby-reference-storyboard", "สินค้าแม่และเด็ก baby high chair"],
    ["pet-supplies-reference-storyboard", "อาหารสัตว์ pet supplies litter"],
    ["shoes-reference-storyboard", "รองเท้าวิ่ง sneakers footwear"],
    ["sports-equipment-reference-storyboard", "ดัมเบล fitness yoga อุปกรณ์กีฬา"],
    ["stationery-reference-storyboard", "ปากกา notebook stationery"],
    ["watch-eyewear-reference-storyboard", "นาฬิกา watch sunglasses eyewear"],
  ])("routes %s", (skillId, text) => {
    expect(detectProductionReferenceStoryboardSkillIdFromText(text)).toBe(skillId);
  });

  it("keeps product facts and concept journey together for the skill concept field", () => {
    const conceptDetails = buildProductionReferenceStoryboardConceptDetails({
      concept: {
        title: "Real Use Case",
        productFacts: [
          "PRODUCT FACTS LOCK: Greenforst bedside table.",
          "Exact size: 30 x 30 x 40 cm.",
          "Structure/design: 3-tier shelf / Nordic style.",
        ].join("\n"),
        conceptDetails: "She tests whether the small table can hold books, water, and an alarm clock beside the bed.",
      },
    });

    expect(conceptDetails).toContain("PRODUCT FACTS LOCK: Greenforst bedside table.");
    expect(conceptDetails).toContain("Exact size: 30 x 30 x 40 cm.");
    expect(conceptDetails).toContain("She tests whether the small table can hold books");
  });

  it("separates storyboard guide from scene descriptions while preserving facts", () => {
    const concept = {
      title: "Real Use Case",
      hook: "Tiny room, cleaner setup",
      painPoint: "Daily essentials are scattered around the bed.",
      useCase: "Small bedroom organization",
      productFacts: "PRODUCT FACTS LOCK: 3-tier Nordic bedside table, 30 x 30 x 40 cm.",
      conceptDetails: "Mini story of arranging a bedside corner before sleep.",
      sceneTimeline: [
        { timeRange: "0-3s", title: "Hook", detail: "Show the cluttered bedside floor." },
        { timeRange: "3-12s", title: "Demo", detail: "Place lamp, book, glass, and alarm clock across three tiers." },
      ],
    };

    const guide = buildProductionReferenceStoryboardGuide({
      projectTitle: "Greenforst storyboard",
      projectSummary: "Create a marketplace product video.",
      concept,
      fallbackConceptDetails: concept.conceptDetails,
      locale: "en",
    });
    const scenes = buildProductionReferenceStoryboardSceneDescriptions({
      productFacts: concept.productFacts,
      storyboardGuide: guide,
      concept,
    });

    expect(guide).toContain("CUSTOMER JOURNEY / STORY INTENT");
    expect(guide).toContain("STORY BEATS");
    expect(guide).toContain("FRAME ALLOCATION POLICY");
    expect(scenes[0]).toContain("PRODUCT FACTS LOCK");
    expect(scenes).toHaveLength(2);
    expect(scenes[1]).toContain("Do not treat Scene Descriptions item count as the output frame or shot count");
    expect(scenes.join("\n")).not.toContain("3-12s - Demo");
  });
});
