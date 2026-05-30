import { describe, expect, it } from "vitest";
import {
  buildProductionReferenceStoryboardConceptDetails,
  buildProductionReferenceStoryboardGuide,
  buildProductionReferenceStoryboardVoiceoverScript,
  detectProductionReferenceStoryboardProductCategoryFromText,
  detectProductionReferenceStoryboardSkillIdFromText,
  PRODUCTION_REFERENCE_STORYBOARD_LEGACY_SKILL_IDS,
  PRODUCTION_REFERENCE_STORYBOARD_PRODUCT_CATEGORIES,
  PRODUCTION_REFERENCE_STORYBOARD_SKILL_ID,
  PRODUCTION_REFERENCE_STORYBOARD_SKILL_IDS,
} from "./productionReferenceStoryboard";

describe("productionReferenceStoryboard", () => {
  it("uses one unified production reference storyboard skill with legacy category ids tracked separately", () => {
    expect([...PRODUCTION_REFERENCE_STORYBOARD_SKILL_IDS]).toEqual([
      PRODUCTION_REFERENCE_STORYBOARD_SKILL_ID,
    ]);
    expect([...PRODUCTION_REFERENCE_STORYBOARD_LEGACY_SKILL_IDS].sort()).toEqual([
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
    expect([...PRODUCTION_REFERENCE_STORYBOARD_PRODUCT_CATEGORIES]).toContain("furniture");
    expect([...PRODUCTION_REFERENCE_STORYBOARD_PRODUCT_CATEGORIES]).toContain("cosmetics");
  });

  it("detects product categories from product text while routing to the unified skill", () => {
    expect(
      detectProductionReferenceStoryboardProductCategoryFromText(
        "Greenforst โต๊ะวางของ ชั้นวางสไตล์นอร์ดิก ชั้นวางของข้างเตียง ขนาดเล็ก รุ่น F-2122",
      ),
    ).toBe("furniture");

    expect(
      detectProductionReferenceStoryboardProductCategoryFromText(
        "เก้าอี้กินข้าวเด็ก โต๊ะกินข้าว เด็ก 6 เดือน high chair พร้อมเข็มขัดนิรภัย",
      ),
    ).toBe("mother_baby");

    expect(
      detectProductionReferenceStoryboardProductCategoryFromText("หูฟัง earbuds พร้อมเคสชาร์จและสายชาร์จ"),
    ).toBe("electronics");

    expect(
      detectProductionReferenceStoryboardProductCategoryFromText("รองเท้าวิ่ง sneakers น้ำหนักเบา"),
    ).toBe("shoes");

    expect(
      detectProductionReferenceStoryboardSkillIdFromText("รองเท้าวิ่ง sneakers น้ำหนักเบา"),
    ).toBe(PRODUCTION_REFERENCE_STORYBOARD_SKILL_ID);
  });

  it.each([
    ["automotive", "กล้องติดรถ dash cam สำหรับรถยนต์"],
    ["books", "หนังสือนิยายและมังงะ box set"],
    ["camera_photography", "กล้อง action camera พร้อมขาตั้งกล้อง"],
    ["computer_laptop", "โน้ตบุ๊ก laptop พร้อมเมาส์และคีย์บอร์ด"],
    ["cosmetics", "สกินแคร์ serum และ lipstick beauty set"],
    ["electrical_appliance", "หม้อทอด air fryer เครื่องใช้ไฟฟ้าในบ้าน"],
    ["electronics", "หูฟัง earbuds พร้อมพาวเวอร์แบงค์"],
    ["fashion_clothing", "เสื้อผ้าแฟชั่น dress jacket activewear"],
    ["food_beverage", "กาแฟ เครื่องดื่ม powdered drink"],
    ["furniture", "โต๊ะข้างเตียง furniture ชั้นวางของ"],
    ["gaming_accessories", "จอยเกม controller gaming headset"],
    ["household_product", "กล่องเก็บของ organizer เครื่องใช้ในบ้าน"],
    ["jewelry", "แหวน necklace earrings เครื่องประดับ"],
    ["mobile_tablet", "มือถือ smartphone tablet เคสมือถือ"],
    ["mother_baby", "สินค้าแม่และเด็ก baby high chair"],
    ["pet_supplies", "อาหารสัตว์ pet supplies litter"],
    ["shoes", "รองเท้าวิ่ง sneakers footwear"],
    ["sports_equipment", "ดัมเบล fitness yoga อุปกรณ์กีฬา"],
    ["stationery", "ปากกา notebook stationery"],
    ["watch_eyewear", "นาฬิกา watch sunglasses eyewear"],
  ] as const)("detects %s", (category, text) => {
    expect(detectProductionReferenceStoryboardProductCategoryFromText(text)).toBe(category);
    expect(detectProductionReferenceStoryboardSkillIdFromText(text)).toBe(PRODUCTION_REFERENCE_STORYBOARD_SKILL_ID);
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

  it("separates storyboard guide from voiceover script while preserving facts in concept details", () => {
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
      voiceoverBeats: [
        {
          order: 1,
          startSec: 0,
          endSec: 3,
          title: "Hook",
          voiceoverScript: "A tiny room feels calmer when every bedside item has a real place.",
        },
        {
          order: 2,
          startSec: 3,
          endSec: 12,
          title: "Demo",
          voiceoverScript: "Use the three tiers for a lamp, book, water glass, and alarm clock without crowding the bed.",
        },
      ],
    };

    const guide = buildProductionReferenceStoryboardGuide({
      projectTitle: "Greenforst storyboard",
      projectSummary: "Create a marketplace product video.",
      concept,
      fallbackConceptDetails: concept.conceptDetails,
      locale: "en",
    });
    const voiceoverScript = buildProductionReferenceStoryboardVoiceoverScript({
      concept,
    });

    expect(guide).toContain("CUSTOMER JOURNEY / STORY INTENT");
    expect(guide).toContain("STORY BEATS");
    expect(guide).toContain("FRAME ALLOCATION POLICY");
    expect(guide).toContain("map one beat to one frame in order");
    expect(guide).toContain("Frame 1 through Frame 9 aligned with beats 1 through 9");
    expect(voiceoverScript).toContain("VOICEOVER SCRIPT BY SHOT");
    expect(voiceoverScript).toContain("1. 0-3s Hook: A tiny room feels calmer");
    expect(voiceoverScript).toContain("2. 3-12s Demo: Use the three tiers");
    expect(voiceoverScript).not.toContain("PRODUCT FACTS LOCK");
    expect(voiceoverScript).not.toContain("Show the cluttered bedside floor");
  });

  it("uses a selected shot-by-shot video concept as the storyboard guide directly", () => {
    const shotByShotConcept = [
      "แนวคิดวิดีโอแบบ Shot-by-shot: 9 shot / 60 วินาที",
      "",
      "1. 0-6.7s Hook",
      "ภาพ: มือหยิบของข้างเตียงที่รก",
      "มุมกล้อง: handheld close-up แล้วค่อย push in",
      "บทพูด (~10s): เคยไหม ของเล็ก ๆ ข้างเตียงไม่มีที่ประจำ พอจะหยิบทีไรต้องรื้อทุกอย่าง",
    ].join("\n");

    const guide = buildProductionReferenceStoryboardGuide({
      projectTitle: "Greenforst storyboard",
      projectSummary: "Create a marketplace product video.",
      concept: {
        title: "Old summary concept",
        hook: "Old opening hook",
        conceptDetails: "Legacy guide",
      },
      fallbackConceptDetails: shotByShotConcept,
      locale: "th",
    });

    expect(guide).toBe(shotByShotConcept);
    expect(guide).not.toContain("PROJECT:");
    expect(guide).not.toContain("SELECTED CONCEPT:");
  });
});
