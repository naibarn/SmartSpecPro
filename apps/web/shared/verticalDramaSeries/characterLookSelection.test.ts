import { describe, expect, it } from "vitest";
import {
  buildVerticalDramaCharacterLookImageBrief,
  detectVerticalDramaCharacterLookConflict,
  detectVerticalDramaCharacterLookIntent,
  getVerticalDramaCharacterLookSemanticKey,
  normalizeVerticalDramaCharacterLookImageBrief,
  selectVerticalDramaCharacterLooks,
  VERTICAL_DRAMA_LOOK_IMAGE_BRIEF_MAX_LENGTH,
} from "./characterLookSelection";

const base = {
  characterKey: "mali",
  name: "มะลิ",
  description: "หญิงสาวผมยาวสีดำ มีไฝเล็กใต้ตาซ้าย ใบหน้าอ่อนโยน",
  hasPortrait: true,
};

describe("vertical drama automatic character look selection", () => {
  it("supports a reusable look brief up to 2,000 characters and trims oversized input recoverably", () => {
    const accepted = "x".repeat(2000);
    expect(normalizeVerticalDramaCharacterLookImageBrief(accepted)).toBe(
      accepted
    );

    const oversized = normalizeVerticalDramaCharacterLookImageBrief(
      "รายละเอียดลุค ".repeat(500)
    );
    expect(oversized).toBeDefined();
    expect(oversized!.length).toBeLessThanOrEqual(
      VERTICAL_DRAMA_LOOK_IMAGE_BRIEF_MAX_LENGTH
    );
    expect(oversized).toMatch(/…$/);
  });

  it("keeps the generated look brief within the reusable brief contract", () => {
    const brief = buildVerticalDramaCharacterLookImageBrief({
      base: {
        ...base,
        description: "หญิงสาวไทยผมยาวสีดำ มีไฝใต้ตาซ้าย ใบหน้าอ่อนโยน",
      },
      intent: "evening_formal",
      label: "ชุดราตรี",
      shotText: "พิมพ์ชนกไปร่วมงานกลางคืนในโรงแรม",
    });

    expect(brief.length).toBeLessThanOrEqual(
      VERTICAL_DRAMA_LOOK_IMAGE_BRIEF_MAX_LENGTH
    );
    expect(brief).toContain("Required look: ชุดราตรี");
    expect(brief).toContain("Source shot context");
  });

  it("matches equivalent Thai/English cues to an existing look", () => {
    const result = selectVerticalDramaCharacterLooks({
      catalog: [
        base,
        {
          characterKey: "mali-sleep",
          name: "มะลิ",
          parentCharacterKey: "mali",
          variantLabel: "ชุดใส่นอน",
          variantType: "outfit",
          description: "ชุดนอนผ้าฝ้ายสีฟ้าอ่อน",
          hasPortrait: true,
        },
      ],
      shots: [
        {
          shotNumber: 1,
          characterKeys: ["mali"],
          text: "มะลิกำลังเข้านอนและคุยอยู่บนเตียงนอน",
          sceneKey: "bedroom",
        },
      ],
    });

    expect(result.characterKeysByShotNumber.get(1)).toEqual(["mali-sleep"]);
    expect(result.assignmentsByShotNumber.get(1)?.[0]).toMatchObject({
      mode: "matched_existing",
      status: "ready",
      canonicalIntent: "sleepwear",
    });
    expect(result.suggestions).toHaveLength(0);
  });

  it("matches a casual home cue to an existing casual look", () => {
    const result = selectVerticalDramaCharacterLooks({
      catalog: [
        base,
        {
          characterKey: "mali-casual",
          name: "มะลิ",
          parentCharacterKey: "mali",
          variantLabel: "ชุดอยู่บ้าน",
          variantType: "outfit",
          description: "เสื้อยืดสีครีมกับกางเกงผ้านุ่ม",
          hasPortrait: true,
        },
      ],
      shots: [
        {
          shotNumber: 1,
          characterKeys: ["mali"],
          text: "มะลิคุยอยู่ในบ้านพักตอนเช้า",
          sceneKey: "home",
        },
      ],
    });

    expect(result.characterKeysByShotNumber.get(1)).toEqual(["mali-casual"]);
    expect(result.assignmentsByShotNumber.get(1)?.[0]).toMatchObject({
      mode: "matched_existing",
      canonicalIntent: "casual_home",
    });
  });

  it("proposes one reusable casual-home look for a base-only character", () => {
    const result = selectVerticalDramaCharacterLooks({
      catalog: [base],
      shots: [
        {
          shotNumber: 1,
          characterKeys: ["mali"],
          text: "มะลิยืนคุยกับลุงชาญในบ้านพัก",
          sceneKey: "home",
        },
        {
          shotNumber: 2,
          characterKeys: ["mali"],
          text: "มะลิหยิบแก้วน้ำในบ้าน",
          sceneKey: "home",
        },
      ],
    });

    expect(result.suggestions).toHaveLength(1);
    expect(result.suggestions[0]).toMatchObject({
      canonicalIntent: "casual_home",
      variantLabel: "ชุดลำลองอยู่บ้าน",
      sourceShotNumbers: [1, 2],
    });
    expect(result.assignmentsByShotNumber.get(1)?.[0]).toMatchObject({
      mode: "needs_new_look",
      status: "waiting_for_portrait",
    });
  });

  it("lets sleepwear win over a compatible home cue", () => {
    expect(
      detectVerticalDramaCharacterLookConflict(
        "กำลังเข้านอนในห้องนอนที่บ้าน"
      )
    ).toEqual([]);
    expect(detectVerticalDramaCharacterLookIntent("กำลังเข้านอนในบ้าน")).toEqual({
      key: "sleepwear",
      label: "ชุดนอน",
      variantType: "outfit",
    });
  });

  it("creates one reusable, portrait-less proposal for a missing age/look intent", () => {
    const result = selectVerticalDramaCharacterLooks({
      catalog: [base],
      shots: [
        {
          shotNumber: 1,
          characterKeys: ["mali"],
          text: "เด็กเพิ่งคลอดอยู่ในอ้อมแขนของแม่",
          sceneKey: "hospital",
        },
        {
          shotNumber: 2,
          characterKeys: ["mali"],
          text: "ทารกแรกเกิดหลับอย่างสงบในห้องพักฟื้น",
          sceneKey: "hospital",
        },
      ],
    });

    expect(result.suggestions).toHaveLength(1);
    expect(result.suggestions[0]).toMatchObject({
      canonicalIntent: "newborn",
      variantType: "age_stage",
      sourceShotNumbers: [1, 2],
    });
    expect(result.suggestions[0].imageBrief).toContain("Preserve the same person's identity");
    expect(result.suggestions[0].imageBrief).toContain("age-appropriate wardrobe");
    expect(result.assignmentsByShotNumber.get(1)?.[0]).toMatchObject({
      mode: "needs_new_look",
      status: "waiting_for_portrait",
      requestedLabel: "วัยทารกแรกเกิด",
    });
  });

  it("rotates an existing look after a meaningful scene transition, then keeps continuity", () => {
    const result = selectVerticalDramaCharacterLooks({
      catalog: [
        base,
        {
          characterKey: "mali-evening",
          name: "มะลิ",
          parentCharacterKey: "mali",
          variantLabel: "ชุดราตรี",
          variantType: "outfit",
          description: "เดรสผ้าไหมสีแดงสำหรับงานกาลา",
          hasPortrait: true,
        },
      ],
      shots: [
        { shotNumber: 1, characterKeys: ["mali"], text: "คุยในบ้าน", sceneKey: "home" },
        { shotNumber: 2, characterKeys: ["mali"], text: "เดินเข้าสถานที่ใหม่", sceneKey: "gala" },
        { shotNumber: 3, characterKeys: ["mali"], text: "ยืนคุยต่อในงาน", sceneKey: "gala" },
      ],
    });

    expect(result.characterKeysByShotNumber.get(2)).toEqual(["mali-evening"]);
    expect(result.characterKeysByShotNumber.get(3)).toEqual(["mali-evening"]);
  });

  it("proposes one reusable new outfit when time/location changes but no alternate exists", () => {
    const result = selectVerticalDramaCharacterLooks({
      catalog: [base],
      shots: [
        {
          shotNumber: 1,
          characterKeys: ["mali"],
          text: "คุยในสตูดิโอตอนกลางวัน",
          sceneKey: "home",
          timeKey: "day",
        },
        {
          shotNumber: 2,
          characterKeys: ["mali"],
          text: "เดินเข้าร้านใหม่",
          sceneKey: "shop",
          timeKey: "night",
        },
      ],
    });

    expect(result.suggestions).toHaveLength(1);
    expect(result.suggestions[0].canonicalIntent).toBe("scene_transition");
    expect(result.assignmentsByShotNumber.get(2)?.[0]).toMatchObject({
      mode: "needs_new_look",
      status: "waiting_for_portrait",
    });
  });

  it("detects a textual time/place transition when structured shot metadata is absent", () => {
    const result = selectVerticalDramaCharacterLooks({
      catalog: [base],
      shots: [
        {
          shotNumber: 1,
          characterKeys: ["mali"],
          text: "มะลิคุยในสตูดิโอตอนกลางวัน",
        },
        {
          shotNumber: 2,
          characterKeys: ["mali"],
          text: "วันรุ่งขึ้น มะลิเดินทางไปสถานที่ใหม่ตอนกลางคืน",
        },
      ],
    });

    expect(result.suggestions).toHaveLength(1);
    expect(result.suggestions[0].canonicalIntent).toBe("scene_transition");
    expect(result.assignmentsByShotNumber.get(2)?.[0]).toMatchObject({
      mode: "needs_new_look",
      status: "waiting_for_portrait",
    });
  });

  it("never overrides a manually selected portrait-less look", () => {
    const result = selectVerticalDramaCharacterLooks({
      catalog: [
        base,
        {
          characterKey: "mali-newborn",
          name: "มะลิ",
          parentCharacterKey: "mali",
          variantLabel: "ทารก",
          variantType: "age_stage",
          hasPortrait: false,
        },
      ],
      manualShotNumbers: new Set([1]),
      shots: [
        {
          shotNumber: 1,
          characterKeys: ["mali-newborn"],
          text: "เด็กเพิ่งคลอด",
        },
      ],
    });

    expect(result.characterKeysByShotNumber.get(1)).toEqual(["mali-newborn"]);
    expect(result.assignmentsByShotNumber.get(1)?.[0]).toMatchObject({
      mode: "manual_override",
      status: "waiting_for_portrait",
    });
    expect(result.suggestions).toHaveLength(0);
  });

  it("keeps a manual look authoritative when the shot is replayed", () => {
    const result = selectVerticalDramaCharacterLooks({
      catalog: [
        base,
        {
          characterKey: "mali-sleep",
          name: "มะลิ",
          parentCharacterKey: "mali",
          variantLabel: "ชุดนอน",
          variantType: "outfit",
          hasPortrait: true,
        },
      ],
      manualShotNumbers: new Set([1]),
      shots: [
        {
          shotNumber: 1,
          characterKeys: ["mali-sleep"],
          text: "มะลิไปงานกลางคืน",
        },
      ],
    });

    expect(result.characterKeysByShotNumber.get(1)).toEqual(["mali-sleep"]);
    expect(result.assignmentsByShotNumber.get(1)?.[0]).toMatchObject({
      mode: "manual_override",
      selectedLookKey: "mali-sleep",
    });
  });

  it("normalizes look identity instead of using the visible label as a key", () => {
    expect(detectVerticalDramaCharacterLookIntent("sleepwear for bedtime")).toEqual({
      key: "sleepwear",
      label: "ชุดนอน",
      variantType: "outfit",
    });
    expect(
      getVerticalDramaCharacterLookSemanticKey({
        parentCharacterKey: "mali",
        canonicalIntent: "Sleepwear",
        variantType: "outfit",
      })
    ).toBe("mali::outfit::sleepwear");
    expect(
      buildVerticalDramaCharacterLookImageBrief({
        base,
        intent: "evening_formal",
        label: "ชุดราตรี",
        shotText: "งานกลางคืนในโรงแรม",
      })
    ).toContain("no text, watermark, logos");
  });

  it("does not silently choose the first look when story cues conflict", () => {
    expect(
      detectVerticalDramaCharacterLookConflict("เด็กทารกใส่ชุดนักเรียนไปโรงเรียน")
    ).toEqual(["วัยทารกแรกเกิด", "ชุดนักเรียน"]);

    const result = selectVerticalDramaCharacterLooks({
      catalog: [base],
      shots: [
        {
          shotNumber: 1,
          characterKeys: ["mali"],
          text: "เด็กทารกใส่ชุดนักเรียนไปโรงเรียน",
        },
      ],
    });
    expect(result.suggestions).toHaveLength(0);
    expect(result.assignmentsByShotNumber.get(1)?.[0]).toMatchObject({
      status: "review",
      selectedLookKey: "mali",
    });
  });

  it("does not treat night-time alone as formalwear", () => {
    expect(detectVerticalDramaCharacterLookIntent("เดินกลับบ้านตอนกลางคืน")).toBeNull();
  });
});
