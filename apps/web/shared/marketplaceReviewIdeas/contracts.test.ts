import { describe, expect, it } from "vitest";
import {
  marketplaceReviewIdeaOutputSchema,
  marketplaceReviewIdeaSchema,
} from "./contracts";

function idea(ideaId: string) {
  return {
    ideaId,
    title: "คืนฝนตกกับแก้วใบเดิม",
    logline:
      "ตัวละครต้องตัดสินใจในคืนเร่งรีบและพบว่าสินค้าช่วยลดปัญหาเล็ก ๆ ได้",
    episodeStory:
      "มีนากลับถึงห้องทำงานในคืนฝนตกและพบว่าปัญหาเล็ก ๆ กำลังทำให้ทุกคนตึงเครียด เธอจึงชวนอีกคนลองใช้สินค้าในจังหวะที่เหมาะสม ก่อนทั้งคู่จะกลับมาคุยกันด้วยความเข้าใจมากขึ้น",
    dialogueScript:
      "มีนา: ลองดูอันนี้ก่อนนะ\nอีกคน: ได้ เราค่อย ๆ แก้ไปด้วยกัน",
    storyFunction: "ทำให้ตัวละครมีเหตุผลหยุดคุยกันก่อนแยกย้าย",
    scene: {
      location: "ห้องทำงานของมีนา",
      atmosphere: "เงียบ อบอุ่น และเร่งรีบ",
      beats: ["เกิดปัญหาเล็ก ๆ", "ทดลองใช้", "กลับเข้าสู่บทสนทนา"],
    },
    selectedCharacterIds: ["1"],
    productMentionReason:
      "สินค้าวางอยู่ในเหตุการณ์เดิมและถูกพูดถึงเมื่อแก้ปัญหา",
    dialogue: [
      { speaker: "มีนา", line: "อย่างน้อยวันนี้ก็ไม่ต้องกังวลเรื่องนี้แล้ว" },
    ],
    actions: ["หยิบสินค้า", "สังเกตผลลัพธ์ตามจริง"],
    benefitsMentioned: ["ใช้งานสะดวก"],
    claimsGuard: {
      allowed: ["ใช้งานสะดวก"],
      prohibited: ["รักษาได้ทุกอย่าง"],
      notes: ["พูดตามข้อมูลสินค้าเท่านั้น"],
    },
    continuity: {
      dnaKept: ["ใจเย็นและช่างสังเกต"],
      relationshipBeat: "เริ่มไว้ใจกันมากขึ้น",
      toneFit: "อบอุ่นแต่มีแรงกดดัน",
    },
    lookSlotRequests: [],
    sceneSlotRequests: [],
  };
}

describe("Marketplace review idea contract", () => {
  it("requires exactly three cards", () => {
    expect(
      marketplaceReviewIdeaOutputSchema.safeParse({
        schemaVersion: 1,
        ideas: [idea("a"), idea("b"), idea("c")],
      }).success
    ).toBe(true);
    expect(
      marketplaceReviewIdeaOutputSchema.safeParse({
        schemaVersion: 1,
        ideas: [idea("a")],
      }).success
    ).toBe(false);
  });

  it("keeps additive look and scene requests in the card contract", () => {
    const parsed = marketplaceReviewIdeaSchema.parse({
      ...idea("slot"),
      lookSlotRequests: [
        {
          characterId: "1",
          lookLabel: "ชุดราตรี",
          reason: "ฉากงานเลี้ยง",
          dnaConstraints: ["คงทรงผมเดิม"],
        },
      ],
      sceneSlotRequests: [
        {
          sceneLabel: "งานเลี้ยง",
          description: "ห้องจัดเลี้ยงโทนอุ่น",
          reason: "ลุคเดิมไม่ตรงบริบท",
        },
      ],
    });
    expect(parsed.lookSlotRequests[0]?.lookLabel).toBe("ชุดราตรี");
    expect(parsed.sceneSlotRequests[0]?.sceneLabel).toBe("งานเลี้ยง");
  });
});
