import { describe, expect, it } from "vitest";
import {
  inferVerticalDramaSupportingPresenceFromShotText,
  normalizeVerticalDramaSupportingPresence,
  renderSupportingPresencePromptBlock,
} from "./supportingPresence";

describe("vertical drama supporting presence", () => {
  it("normalizes bounded shot-local groups without creating character refs", () => {
    const entries = normalizeVerticalDramaSupportingPresence([
      {
        role: "ตำรวจ",
        count: { min: 2, max: 4 },
        visibility: "visible",
        action: "เข้ามารับฟังเหตุการณ์",
        evidence: "บทระบุว่าพาตำรวจมา",
      },
    ]);

    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      role: "ตำรวจ",
      countMin: 2,
      countMax: 4,
      source: "auto",
      status: "suggestion",
    });
    expect(entries[0]).not.toHaveProperty("characterRef");
  });

  it("accepts the storyboard skill's snake_case count fields", () => {
    expect(
      normalizeVerticalDramaSupportingPresence([
        { role: "building members", count_min: 4, count_max: 8 },
      ])[0]
    ).toMatchObject({ countMin: 4, countMax: 8 });
  });

  it("backfills visible police from legacy shot prose without using a roster ref", () => {
    const entries = inferVerticalDramaSupportingPresenceFromShotText({
      description:
        "เจ้าของร้านพาตำรวจเข้ามาหลังได้รับสายขอความช่วยเหลือ เขาชี้ให้เจ้าหน้าที่เห็นหลักฐาน",
    });
    expect(entries[0]).toMatchObject({
      role: "ตำรวจ",
      countMin: 1,
      countMax: 1,
      source: "auto",
      status: "suggestion",
    });
  });

  it("does not backfill a caller, news, or off-screen mention", () => {
    expect(
      inferVerticalDramaSupportingPresenceFromShotText({
        action: "ได้ยินเสียงตำรวจทางโทรศัพท์จากนอกเฟรม",
      })
    ).toEqual([]);
  });

  it("preserves explicit empty as a valid suppression payload", () => {
    expect(
      normalizeVerticalDramaSupportingPresence([], {
        source: "manual",
        idPrefix: "shot-6-supporting",
      })
    ).toEqual([]);
  });

  it("renders a count-constrained text block and forbids unrelated people", () => {
    const block = renderSupportingPresencePromptBlock([
      {
        id: "villagers",
        role: "ชาวบ้าน",
        countMin: 3,
        countMax: 5,
        visibility: "background",
        action: "ยืนฟังการพูดคุย",
        source: "manual",
        confidence: "high",
        status: "accepted",
      },
    ]);

    expect(block).toContain("ชาวบ้าน x3-5");
    expect(block).toContain("Do not add unrelated people");
    expect(block).not.toContain("Image 1");
  });
});
