import { describe, expect, it } from "vitest";
import {
  buildShotCharacterReferencePickerGroups,
  type VerticalDramaCharacterPortraitMap,
} from "@/components/verticalDramaSeries/VerticalDramaStoryboardPanel";

/**
 * Coverage for the per-shot character/variant reference picker's pure
 * grouping function (planning/vertical-drama-twin-variant-completeness/
 * plan.md, W6 frontend) — turns the flat `characterPortraits` record (keyed
 * by characterKey, `parentCharacterId`/`sharesFaceWithCharacterId` carrying
 * the OTHER character's DB row id) into the nested shape the picker
 * renders: base characters/twins as top-level entries, variants
 * (outfit/age-stage) nested under their parent.
 */
describe("buildShotCharacterReferencePickerGroups", () => {
  it("returns each base character as its own top-level entry with no variants, when there are no relationships", () => {
    const map: VerticalDramaCharacterPortraitMap = {
      hero: { characterId: "1", name: "พระเอก", portraitUrl: "u1" },
      villain: { characterId: "2", name: "ผู้ร้าย", portraitUrl: null },
    };
    const result = buildShotCharacterReferencePickerGroups(map);
    expect(result).toHaveLength(2);
    expect(result.every(g => g.variants.length === 0)).toBe(true);
    expect(result.every(g => g.twinSourceName === undefined)).toBe(true);
    expect(result.map(g => g.key).sort()).toEqual(["hero", "villain"]);
  });

  it("nests a variant (outfit) row under its parent instead of listing it as a top-level entry", () => {
    const map: VerticalDramaCharacterPortraitMap = {
      hero: { characterId: "1", name: "พระเอก", portraitUrl: "u1" },
      "hero-uniform": {
        characterId: "2",
        name: "พระเอก",
        portraitUrl: "u2",
        parentCharacterId: "1",
        variantLabel: "ชุดยูนิฟอร์ม",
        variantType: "outfit",
      },
    };
    const result = buildShotCharacterReferencePickerGroups(map);
    expect(result).toHaveLength(1);
    expect(result[0].key).toBe("hero");
    expect(result[0].variants).toEqual([
      {
        key: "hero-uniform",
        characterId: "2",
        name: "พระเอก",
        portraitUrl: "u2",
        variantLabel: "ชุดยูนิฟอร์ม",
        variantType: "outfit",
      },
    ]);
  });

  it("nests multiple variants (outfit + age_stage) under the same parent, preserving both", () => {
    const map: VerticalDramaCharacterPortraitMap = {
      hero: { characterId: "1", name: "พระเอก", portraitUrl: null },
      "hero-uniform": {
        characterId: "2",
        name: "พระเอก",
        portraitUrl: null,
        parentCharacterId: "1",
        variantLabel: "ชุดยูนิฟอร์ม",
        variantType: "outfit",
      },
      "hero-teen": {
        characterId: "3",
        name: "พระเอก",
        portraitUrl: null,
        parentCharacterId: "1",
        variantLabel: "วัยรุ่น",
        variantType: "age_stage",
      },
    };
    const result = buildShotCharacterReferencePickerGroups(map);
    expect(result).toHaveLength(1);
    expect(result[0].variants.map(v => v.key).sort()).toEqual([
      "hero-teen",
      "hero-uniform",
    ]);
    expect(result[0].variants.find(v => v.key === "hero-teen")?.variantType).toBe(
      "age_stage"
    );
  });

  it("shows a twin as its own top-level entry (never nested), carrying the resolved face-source character's name", () => {
    const map: VerticalDramaCharacterPortraitMap = {
      hero: { characterId: "1", name: "พระเอก", portraitUrl: null },
      "hero-twin": {
        characterId: "3",
        name: "น้องเอก",
        portraitUrl: null,
        sharesFaceWithCharacterId: "1",
      },
    };
    const result = buildShotCharacterReferencePickerGroups(map);
    expect(result).toHaveLength(2);
    const twin = result.find(g => g.key === "hero-twin");
    expect(twin?.twinSourceName).toBe("พระเอก");
    expect(twin?.variants).toEqual([]);
  });

  it("combines variant nesting AND a twin entry together for the same roster", () => {
    const map: VerticalDramaCharacterPortraitMap = {
      hero: { characterId: "1", name: "พระเอก", portraitUrl: null },
      "hero-uniform": {
        characterId: "2",
        name: "พระเอก",
        portraitUrl: null,
        parentCharacterId: "1",
        variantLabel: "ชุดยูนิฟอร์ม",
        variantType: "outfit",
      },
      "hero-twin": {
        characterId: "3",
        name: "น้องเอก",
        portraitUrl: null,
        sharesFaceWithCharacterId: "1",
      },
    };
    const result = buildShotCharacterReferencePickerGroups(map);
    // Top-level: "hero" (with 1 nested variant) and "hero-twin" — never the
    // variant itself, and the twin is never nested under "hero".
    expect(result.map(g => g.key).sort()).toEqual(["hero", "hero-twin"]);
    const hero = result.find(g => g.key === "hero");
    expect(hero?.variants).toHaveLength(1);
    expect(hero?.variants[0].key).toBe("hero-uniform");
    const twin = result.find(g => g.key === "hero-twin");
    expect(twin?.twinSourceName).toBe("พระเอก");
  });

  it("falls back to showing an orphaned variant (parent row missing from the map) as its own top-level entry instead of dropping it", () => {
    const map: VerticalDramaCharacterPortraitMap = {
      "hero-uniform": {
        characterId: "2",
        name: "พระเอก",
        portraitUrl: null,
        parentCharacterId: "1", // "1" has no entry in this map
        variantLabel: "ชุดยูนิฟอร์ม",
        variantType: "outfit",
      },
    };
    const result = buildShotCharacterReferencePickerGroups(map);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      key: "hero-uniform",
      characterId: "2",
      name: "พระเอก",
      portraitUrl: null,
      variants: [],
    });
  });

  it("returns an empty array for an empty map", () => {
    expect(buildShotCharacterReferencePickerGroups({})).toEqual([]);
  });
});
