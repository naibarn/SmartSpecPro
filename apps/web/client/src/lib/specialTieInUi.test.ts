import { describe, expect, it } from "vitest";
import {
  buildSpecialTieInMarketplaceProductBrief,
  canAddSpecialReferences,
  resolveSpecialTieInCharacterId,
  specialEpisodeLabel,
  toggleBoundedSelection,
} from "./specialTieInUi";

describe("special tie-in UI constraints", () => {
  it("builds a product brief from saved insights without volatile price or promo text", () => {
    const brief = buildSpecialTieInMarketplaceProductBrief({
      productName: "SKG espresso machine SK-1222",
      brand: "SKG",
      productCategory: "Coffee appliances",
      supportingInsights: {
        summary: {
          shortSummary: "เครื่องชงกาแฟพร้อมเครื่องบดในตัว ราคา ฿5,790",
          sellingPoints: ["หัวชงมาตรฐาน 58 มม.", "ส่วนลด 30% วันนี้"],
          contentAngles: ["สาธิตการชงกาแฟที่บ้าน"],
        },
        storytelling: {
          storyOptions: [{
            recommended: true,
            title: "มุมกาแฟที่บ้าน",
            hook: "เริ่มวันด้วยกาแฟแก้วโปรด",
            videoBrief: { scenes: [{ sceneGoal: "สาธิตการชงกาแฟ" }] },
          }],
        },
      },
    });

    expect(brief).toContain("SKG espresso machine SK-1222");
    expect(brief).toContain("หัวชงมาตรฐาน 58 มม.");
    expect(brief).toContain("มุมกาแฟที่บ้าน");
    expect(brief).not.toMatch(/5,790|฿|ส่วนลด|30%/);
  });

  it("enforces the aggregate three-reference cap", () => {
    expect(canAddSpecialReferences(1, 2)).toBe(true);
    expect(canAddSpecialReferences(2, 2)).toBe(false);
  });
  it("keeps bounded character/speaker selections deterministic", () => {
    expect(toggleBoundedSelection(["a", "b"], "c", 2)).toEqual(["a", "b"]);
    expect(toggleBoundedSelection(["a"], "b", 2)).toEqual(["a", "b"]);
    expect(toggleBoundedSelection(["a", "b"], "a", 2)).toEqual(["b"]);
  });
  it("uses the server characterId as the stable selection and portrait key", () => {
    expect(
      resolveSpecialTieInCharacterId({ characterId: "42", id: "legacy-42" })
    ).toBe("42");
    expect(resolveSpecialTieInCharacterId({ id: 7 })).toBe("7");
    expect(resolveSpecialTieInCharacterId({})).toBe("");
  });
  it("labels special episodes independently from normal episode numbers", () => {
    expect(specialEpisodeLabel(3, "th")).toBe("ตอนพิเศษ 03");
    expect(specialEpisodeLabel(3, "en")).toBe("SPECIAL 03");
  });
});
