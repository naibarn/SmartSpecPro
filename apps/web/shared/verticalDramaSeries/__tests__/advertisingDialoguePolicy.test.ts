import { describe, expect, it } from "vitest";
import {
  resolveSpecialDialogueSpeakerEligibility,
  screenSpecialDialogueCompliance,
} from "../advertisingDialoguePolicy";

describe("special tie-in advertising dialogue policy", () => {
  it("allows a character with explicit adult evidence", () => {
    expect(
      resolveSpecialDialogueSpeakerEligibility({
        role: "นางเอก",
        data: {
          visualBible: { ageRange: "adult, late-20s to early-30s" },
        },
      }),
    ).toMatchObject({ eligible: true, isMinor: false });
  });

  it("rejects a minor character as a dialogue speaker", () => {
    expect(
      resolveSpecialDialogueSpeakerEligibility({
        role: "เด็กนักเรียน",
        data: { age: 12, ageStage: "school_age" },
      }),
    ).toMatchObject({ eligible: false, isMinor: true });
  });

  it("fails closed when a speaker has no usable adult age evidence", () => {
    expect(
      resolveSpecialDialogueSpeakerEligibility({ role: "supporting", data: {} }),
    ).toMatchObject({ eligible: false, isMinor: false });
  });

  it("recognizes an explicitly older adult visual profile as eligible", () => {
    expect(
      resolveSpecialDialogueSpeakerEligibility({
        role: "supporting",
        data: { lookDesign: { visual_description: "ชายสูงวัยช่วงต้นวัยเจ็ดสิบ" } },
      }),
    ).toMatchObject({ eligible: true, isMinor: false });
  });

  it("rejects prohibited advertising claims and hard-sell dialogue", () => {
    const result = screenSpecialDialogueCompliance([
      "สินค้านี้รักษาโรคได้และการันตีผล 100% ซื้อเลย",
    ]);
    expect(result.hasViolations).toBe(true);
    expect(result.violations.length).toBeGreaterThan(0);
  });

  it("allows modest, natural product dialogue", () => {
    expect(
      screenSpecialDialogueCompliance([
        "ลองใช้ตามวิธีบนฉลากก่อนนะ ถ้าเข้ากับเราค่อยใช้ต่อ",
      ]),
    ).toMatchObject({ hasViolations: false, violations: [] });
  });
});
