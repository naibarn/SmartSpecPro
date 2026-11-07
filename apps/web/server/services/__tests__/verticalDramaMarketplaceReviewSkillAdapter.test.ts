import { describe, expect, it } from "vitest";
import { marketplaceReviewIdeaInputSchema } from "../../../shared/marketplaceReviewIdeas/contracts";
import {
  buildMarketplaceReviewIdeaUserPrompt,
  buildMarketplaceReviewIdeaResumeSnapshot,
  removeMarketplacePriceReferences,
  validateMarketplaceReviewIdeaOutput,
} from "../verticalDramaMarketplaceReviewSkillAdapter";

function idea(ideaId: string, episodeStory: string, dialogueScript: string) {
  return {
    ideaId,
    title: "ของเล่นในวันที่บ้านวุ่นวาย",
    logline: "ครอบครัวช่วยกันแก้ปัญหาเล็ก ๆ ผ่านกิจกรรมที่เหมาะกับเด็ก",
    episodeStory,
    dialogueScript,
    storyFunction: "ทำให้ครอบครัวกลับมาคุยกัน",
    scene: {
      location: "ห้องนอนเด็ก",
      atmosphere: "อบอุ่นแต่เร่งรีบ",
      beats: ["พบปัญหา", "ทดลองใช้", "คลี่คลาย"],
    },
    productMentionReason: "สินค้าปรากฏในจังหวะที่ตัวละครกำลังหาทางแก้ปัญหา",
    dialogue: [
      { speaker: "แม่", line: "ลองชิ้นนี้กันไหม" },
      { speaker: "ลุง", line: "ค่อย ๆ เล่นและสังเกตกันไป" },
    ],
    shotDialogues: Array.from({ length: 9 }, (_, index) => ({
      shotNumber: index + 1,
      lines: [
        { speaker: "แม่", line: `เราค่อย ๆ ดูกันในช็อตที่ ${index + 1}` },
        { speaker: "ลุง", line: "ได้เลย เราจะสังเกตไปด้วยกัน" },
      ],
    })),
    actions: ["เก็บของที่เสียหาย", "สาธิตการเล่น"],
    benefitsMentioned: ["ช่วยฝึกการใช้มือ"],
    claimsGuard: {
      allowed: ["ช่วยฝึกการใช้มือ"],
      prohibited: ["ดีที่สุด"],
      notes: ["พูดตามข้อมูลสินค้า"],
    },
    continuity: {
      dnaKept: ["ใจเย็นและดูแลครอบครัว"],
      relationshipBeat: "ผู้ใหญ่ช่วยกันสังเกตพัฒนาการของเด็ก",
      toneFit: "อบอุ่นสมจริง",
    },
    lookSlotRequests: [],
    sceneSlotRequests: [],
  };
}

const paragraphs = [
  "พิมพ์ชนกเปิดประตูเข้าห้องนอนแล้วพบของเล่นกระจัดกระจาย เธอหยุดมองชิ้นที่แตกและค่อย ๆ แยกของที่ควรเก็บออกจากของที่ยังใช้ได้ โดยไม่ทำให้ภูมิรู้สึกว่าถูกดุ",
  "ลุงชาญเดินเข้ามาพร้อมของเล่นชิ้นใหม่ เขาชวนภูมินั่งลองเล่นตรงพื้นห้อง ภูมิหมุนชิ้นส่วนตามเกลียวทีละชั้น ส่วนพิมพ์ชนกคอยถามให้เขาสังเกตขนาดและลำดับด้วยตัวเอง",
  "เมื่อภูมิเรียงชิ้นใหญ่ไปเล็กได้สำเร็จ เขาหันมายิ้มให้แม่ พิมพ์ชนกชมความพยายามของลูก และลุงชาญก็ชวนทั้งคู่คุยกันต่อว่าของเล่นที่แข็งแรงและเหมาะกับวัยช่วยให้เวลาเล่นปลอดภัยขึ้นอย่างไร",
].join("\n\n");

describe("Marketplace review idea output gate", () => {
  it("does not prime the model with excluded character names", () => {
    const prompt = buildMarketplaceReviewIdeaUserPrompt(
      marketplaceReviewIdeaInputSchema.parse({
        product: { productId: "espresso-1", name: "เครื่องชงกาแฟ" },
        productImages: [{ url: "https://example.test/product.jpg" }],
        series: { seriesId: "53" },
        dialogueMode: "none",
        selectedCharacterIds: ["1"],
        excludedCharacterNames: ["ภูมิ"],
        characters: [{ characterId: "1", name: "พิมพ์ชนก" }],
        variationSeed: "excluded-name-prompt-test",
      }),
    );

    expect(JSON.parse(prompt).input).not.toHaveProperty("excludedCharacterNames");
    expect(prompt).not.toContain("ภูมิ");
  });

  it("removes volatile price and promotion data from saved creative context", () => {
    expect(
      removeMarketplacePriceReferences({
        sellingPoint: "หัวชงมาตรฐาน 58 มม.",
        price: 5790,
        story: "สาธิตการชงกาแฟ ราคา ฿5,790",
        contentAngle: "การชงกาแฟที่บ้าน",
      })
    ).toEqual({
      sellingPoint: "หัวชงมาตรฐาน 58 มม.",
      story: "",
      contentAngle: "การชงกาแฟที่บ้าน",
    });
  });

  it("requires three connected story paragraphs and two named dialogue lines", () => {
    const output = {
      schemaVersion: 1,
      ideas: [
        idea(
          "idea-1",
          paragraphs,
          "แม่: (ก้มเก็บของเล่น) เราค่อย ๆ ดูกันว่าชิ้นไหนยังเหมาะกับภูมิ\nลุง: (นั่งลงข้างเด็ก) ลองหมุนชิ้นนี้ตามเกลียวดูนะ"
        ),
        idea("idea-2", paragraphs, "แม่: ลองชิ้นนี้กันก่อนนะ เราค่อย ๆ สังเกตไปด้วยกัน\nลุง: ได้เลย ค่อย ๆ ทำตามจังหวะของภูมิก็พอ"),
        idea("idea-3", paragraphs, "แม่: เก่งมากเลยลูก วันนี้เราลองเรียนรู้ไปพร้อมกัน\nลุง: ใช่แล้ว เรามาดูด้วยกันว่าชิ้นไหนเหมาะกับเขา"),
      ],
    };
    expect(validateMarketplaceReviewIdeaOutput(output).ideas).toHaveLength(3);
  });

  it("normalizes missing and oversized dialogue summaries from the authoritative shot script", () => {
    const output = {
      schemaVersion: 1,
      ideas: [
        idea("idea-1", paragraphs, "แม่: ลองชิ้นนี้กันไหม เราค่อย ๆ สังเกตวิธีเล่นและดูว่าภูมิรู้สึกอย่างไร\nลุง: ได้เลย เราจะคุยกันระหว่างลองและช่วยกันคิดต่ออย่างใจเย็น"),
        idea("idea-2", paragraphs, "แม่: ลองชิ้นนี้กันไหม เราค่อย ๆ สังเกตวิธีเล่นและดูว่าภูมิรู้สึกอย่างไร\nลุง: ได้เลย เราจะคุยกันระหว่างลองและช่วยกันคิดต่ออย่างใจเย็น"),
        idea("idea-3", paragraphs, "แม่: ลองชิ้นนี้กันไหม เราค่อย ๆ สังเกตวิธีเล่นและดูว่าภูมิรู้สึกอย่างไร\nลุง: ได้เลย เราจะคุยกันระหว่างลองและช่วยกันคิดต่ออย่างใจเย็น"),
      ],
    };
    output.ideas[0]!.dialogue = undefined;
    output.ideas[1]!.dialogue = Array.from({ length: 18 }, (_, index) => ({
      speaker: index % 2 === 0 ? "แม่" : "ลุง",
      line: `บทพูด ${index + 1}`,
    }));

    const validated = validateMarketplaceReviewIdeaOutput(output);
    expect(validated.ideas[0]!.dialogue).toHaveLength(12);
    expect(validated.ideas[0]!.dialogue[0]).toEqual(
      output.ideas[0]!.shotDialogues[0]!.lines[0],
    );
    expect(validated.ideas[1]!.dialogue).toHaveLength(12);
  });

  it("uses actions instead of dialogue when the selected mode is no-dialogue", () => {
    const output = {
      schemaVersion: 1,
      ideas: [
        idea("idea-1", paragraphs, "แม่: เราค่อย ๆ ดูกันนะลูก วันนี้เราจะลองทำความเข้าใจไปด้วยกัน\nลุง: ลองชิ้นนี้ดูไหม เราจะค่อย ๆ สังเกตวิธีเล่นของภูมิด้วยกัน"),
        idea("idea-2", paragraphs, "แม่: เราค่อย ๆ ดูกันนะลูก วันนี้เราจะลองทำความเข้าใจไปด้วยกัน\nลุง: ลองชิ้นนี้ดูไหม เราจะค่อย ๆ สังเกตวิธีเล่นของภูมิด้วยกัน"),
        idea("idea-3", paragraphs, "แม่: เราค่อย ๆ ดูกันนะลูก วันนี้เราจะลองทำความเข้าใจไปด้วยกัน\nลุง: ลองชิ้นนี้ดูไหม เราจะค่อย ๆ สังเกตวิธีเล่นของภูมิด้วยกัน"),
      ],
    };
    const silentOutput = {
      ...output,
      ideas: output.ideas.map(candidate => ({
        ...candidate,
        dialogue: [],
        dialogueScript: "",
        shotDialogues: Array.from({ length: 9 }, (_, index) => ({
          shotNumber: index + 1,
          lines: [],
        })),
        actions: ["พิมพ์ชนกค่อย ๆ เก็บของที่แตกออกจากพื้นที่เล่น", "ภูมิใช้นิ้วหมุนชิ้นส่วนตามเกลียวทีละชั้น"],
      })),
    };
    expect(
      validateMarketplaceReviewIdeaOutput(silentOutput, { dialogueMode: "none" }).ideas
    ).toHaveLength(3);
    expect(() =>
      validateMarketplaceReviewIdeaOutput(output, { dialogueMode: "none" })
    ).toThrow("No-dialogue ideas must not contain spoken lines");
  });

  it("rejects a short single-paragraph story even when the base schema is valid", () => {
    const output = {
      schemaVersion: 1,
      ideas: [
        idea(
          "idea-1",
          paragraphs.replace(/\n\n/g, " "),
          "แม่: ลองชิ้นนี้กันก่อนนะ เราค่อย ๆ สังเกตไปด้วยกัน\nลุง: ได้เลย ค่อย ๆ ทำตามจังหวะของภูมิก็พอ"
        ),
        idea("idea-2", paragraphs, "แม่: ลองชิ้นนี้กันก่อนนะ เราค่อย ๆ สังเกตไปด้วยกัน\nลุง: ได้เลย ค่อย ๆ ทำตามจังหวะของภูมิก็พอ"),
        idea("idea-3", paragraphs, "แม่: เก่งมากเลยลูก วันนี้เราลองเรียนรู้ไปพร้อมกัน\nลุง: ใช่แล้ว เรามาดูด้วยกันว่าชิ้นไหนเหมาะกับเขา"),
      ],
    };
    expect(() => validateMarketplaceReviewIdeaOutput(output)).toThrow(
      "episode story or dialogue script is not usable"
    );
  });

  it("rejects dialogue and look slots for characters outside the selected cast", () => {
    const output = {
      schemaVersion: 1,
      ideas: [
        idea("idea-1", paragraphs, "แม่: เราค่อย ๆ ดูกันนะลูก วันนี้เราจะลองทำความเข้าใจไปด้วยกัน\nลุง: ลองชิ้นนี้ดูไหม เราจะค่อย ๆ สังเกตวิธีเล่นของภูมิด้วยกัน"),
        idea("idea-2", paragraphs, "แม่: เราค่อย ๆ ดูกันนะลูก วันนี้เราจะลองทำความเข้าใจไปด้วยกัน\nลุง: ลองชิ้นนี้ดูไหม เราจะค่อย ๆ สังเกตวิธีเล่นของภูมิด้วยกัน"),
        idea("idea-3", paragraphs, "แม่: เราค่อย ๆ ดูกันนะลูก วันนี้เราจะลองทำความเข้าใจไปด้วยกัน\nลุง: ลองชิ้นนี้ดูไหม เราจะค่อย ๆ สังเกตวิธีเล่นของภูมิด้วยกัน"),
      ],
    };
    output.ideas[0].shotDialogues[0]!.lines[0]!.speaker = "ธีร์";
    expect(() =>
      validateMarketplaceReviewIdeaOutput(output, {
        allowedCharacterIds: ["1", "2", "3"],
        allowedCharacterNames: ["แม่", "ลุง"],
        excludedCharacterNames: ["ธีร์"],
      })
    ).toThrow("dialogue speaker is not selected");
    output.ideas[0].shotDialogues[0]!.lines[0]!.speaker = "แม่";
    output.ideas[1].lookSlotRequests = [
      {
        characterId: "99",
        lookLabel: "ชุดลำลอง",
        reason: "ให้เข้ากับฉาก",
        dnaConstraints: [],
      },
    ];
    expect(() =>
      validateMarketplaceReviewIdeaOutput(output, {
        allowedCharacterIds: ["1", "2", "3"],
        allowedCharacterNames: ["แม่", "ลุง"],
      })
    ).toThrow("look slot requested for an unselected character");
  });

  it("rejects an unselected character mentioned in the story", () => {
    const output = {
      schemaVersion: 1,
      ideas: [
        idea("idea-1", paragraphs, "แม่: เราค่อย ๆ ดูกันนะลูก วันนี้เราจะลองทำความเข้าใจไปด้วยกัน\nลุง: ลองชิ้นนี้ดูไหม เราจะค่อย ๆ สังเกตวิธีเล่นของภูมิด้วยกัน"),
        idea("idea-2", paragraphs, "แม่: เราค่อย ๆ ดูกันนะลูก วันนี้เราจะลองทำความเข้าใจไปด้วยกัน\nลุง: ลองชิ้นนี้ดูไหม เราจะค่อย ๆ สังเกตวิธีเล่นของภูมิด้วยกัน"),
        idea("idea-3", paragraphs, "แม่: เราค่อย ๆ ดูกันนะลูก วันนี้เราจะลองทำความเข้าใจไปด้วยกัน\nลุง: ลองชิ้นนี้ดูไหม เราจะค่อย ๆ สังเกตวิธีเล่นของภูมิด้วยกัน"),
      ],
    };
    output.ideas[2].episodeStory += "\n\nธีร์เดินเข้ามาที่หน้าประตู";
    expect(() =>
      validateMarketplaceReviewIdeaOutput(output, {
        allowedCharacterIds: ["1", "2", "3"],
        allowedCharacterNames: ["แม่", "ลุง"],
        excludedCharacterNames: ["ธีร์"],
      })
    ).toThrow('unselected character "ธีร์" was used');
  });

  it("does not treat an excluded Thai name as a substring inside an ordinary word", () => {
    const output = {
      schemaVersion: 1,
      ideas: [
        idea("idea-1", paragraphs.replaceAll("ภูมิ", "เด็ก"), "แม่: ลองชิ้นนี้กันไหม เราค่อย ๆ สังเกตไปด้วยกัน\nลุง: ได้เลย ค่อย ๆ ทำตามจังหวะของเด็กก็พอ"),
        idea("idea-2", paragraphs.replaceAll("ภูมิ", "เด็ก"), "แม่: ลองชิ้นนี้กันไหม เราค่อย ๆ สังเกตไปด้วยกัน\nลุง: ได้เลย ค่อย ๆ ทำตามจังหวะของเด็กก็พอ"),
        idea("idea-3", paragraphs.replaceAll("ภูมิ", "เด็ก"), "แม่: เก่งมากเลยลูก วันนี้เราลองเรียนรู้ไปพร้อมกัน\nลุง: ใช่แล้ว เรามาดูด้วยกันว่าชิ้นไหนเหมาะกับเขา"),
      ],
    };
    output.ideas[0]!.episodeStory += "\n\nพิมพ์ชนกภูมิใจที่ทุกคนค่อย ๆ ช่วยกัน";

    expect(
      validateMarketplaceReviewIdeaOutput(output, {
        excludedCharacterNames: ["ภูมิ"],
      }).ideas,
    ).toHaveLength(3);
  });

  it("requires every speaking idea to carry dialogue for all nine shots", () => {
    const output = {
      schemaVersion: 1,
      ideas: [idea("idea-1", paragraphs, "แม่: เราค่อย ๆ ลองชิ้นนี้กันนะ แล้วสังเกตว่าภูมิรู้สึกอย่างไรโดยไม่ต้องรีบ\nลุง: ได้เลย เราจะอยู่ข้าง ๆ และดูวิธีเล่นไปพร้อมกันอย่างใจเย็น"), idea("idea-2", paragraphs, "แม่: เราค่อย ๆ ลองชิ้นนี้กันนะ แล้วสังเกตว่าภูมิรู้สึกอย่างไรโดยไม่ต้องรีบ\nลุง: ได้เลย เราจะอยู่ข้าง ๆ และดูวิธีเล่นไปพร้อมกันอย่างใจเย็น"), idea("idea-3", paragraphs, "แม่: เราค่อย ๆ ลองชิ้นนี้กันนะ แล้วสังเกตว่าภูมิรู้สึกอย่างไรโดยไม่ต้องรีบ\nลุง: ได้เลย เราจะอยู่ข้าง ๆ และดูวิธีเล่นไปพร้อมกันอย่างใจเย็น")],
    };
    output.ideas[1].shotDialogues[8]!.lines = [];
    expect(() => validateMarketplaceReviewIdeaOutput(output)).toThrow(
      "episode story or dialogue script is not usable"
    );
  });

  it("rejects hard-sell wording in any shot dialogue", () => {
    const output = {
      schemaVersion: 1,
      ideas: [idea("idea-1", paragraphs, "แม่: เราค่อย ๆ ลองชิ้นนี้กันนะ แล้วสังเกตว่าภูมิรู้สึกอย่างไรโดยไม่ต้องรีบ\nลุง: ได้เลย เราจะอยู่ข้าง ๆ และดูวิธีเล่นไปพร้อมกันอย่างใจเย็น"), idea("idea-2", paragraphs, "แม่: เราค่อย ๆ ลองชิ้นนี้กันนะ แล้วสังเกตว่าภูมิรู้สึกอย่างไรโดยไม่ต้องรีบ\nลุง: ได้เลย เราจะอยู่ข้าง ๆ และดูวิธีเล่นไปพร้อมกันอย่างใจเย็น"), idea("idea-3", paragraphs, "แม่: เราค่อย ๆ ลองชิ้นนี้กันนะ แล้วสังเกตว่าภูมิรู้สึกอย่างไรโดยไม่ต้องรีบ\nลุง: ได้เลย เราจะอยู่ข้าง ๆ และดูวิธีเล่นไปพร้อมกันอย่างใจเย็น")],
    };
    output.ideas[2].shotDialogues[0]!.lines[0]!.line = "ซื้อเลยตอนนี้";
    expect(() => validateMarketplaceReviewIdeaOutput(output)).toThrow(
      "advertising dialogue compliance failed"
    );
  });
});

describe("Marketplace review idea resume snapshot", () => {
  it("keeps only the editor fields needed to resume after a refresh", () => {
    const snapshot = buildMarketplaceReviewIdeaResumeSnapshot({
      schemaVersion: 1,
      productSource: "marketplace_capture",
      product: {
        productId: "product-17",
        name: "ของเล่น",
        description: "รายละเอียดสินค้า",
        sourceClaims: ["claim that should stay server-side"],
      },
      productImages: [
        {
          mediaAssetId: "501",
          imageId: "image-1",
          url: "https://example.test/product.jpg",
          label: "ภาพหลัก",
        },
      ],
      series: { seriesId: "53" },
      dialogueMode: "character_dialogue",
      selectedCharacterIds: ["1", "2"],
      characters: [],
      variationSeed: "resume-test",
    });

    expect(snapshot).toEqual({
      productSource: "marketplace_capture",
      referenceImages: [
        {
          mediaAssetId: "501",
          imageId: "image-1",
          url: "https://example.test/product.jpg",
          label: "ภาพหลัก",
        },
      ],
      selectedCharacterIds: ["1", "2"],
      dialogueMode: "character_dialogue",
    });
    expect(snapshot).not.toHaveProperty("product");
  });
});
