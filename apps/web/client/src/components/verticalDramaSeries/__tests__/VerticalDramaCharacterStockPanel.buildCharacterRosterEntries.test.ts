import { describe, expect, it } from "vitest";
import {
  buildCharacterRosterEntries,
  type VdRosterCharacterFields,
} from "@/components/verticalDramaSeries/VerticalDramaCharacterStockPanel";

/**
 * Coverage for planning/vertical-drama-character-variants/plan.md Phase E:
 * the Characters tab roster grid must nest variant rows (`parentCharacterId`
 * set — same person, different outfit/age-stage look) under their parent's
 * card instead of rendering every row as an unrelated top-level card, keep
 * twin rows (`sharesFaceWithCharacterId` set) as independent top-level
 * cards, and leave plain characters (neither field set — the vast majority
 * of existing rows today) rendering exactly as before this change.
 */
function character(
  over: Partial<VdRosterCharacterFields> & { characterId: string; name: string }
): VdRosterCharacterFields {
  return {
    characterId: over.characterId,
    name: over.name,
    parentCharacterId: undefined,
    variantLabel: undefined,
    sharesFaceWithCharacterId: undefined,
    ...over,
  };
}

describe("buildCharacterRosterEntries", () => {
  it("renders a parent character with 2 variants as one entry with 2 nested variants, not 3 separate top-level entries", () => {
    const parent = character({ characterId: "1", name: "หนูนา" });
    const variantA = character({
      characterId: "2",
      name: "หนูนา",
      parentCharacterId: "1",
      variantLabel: "ชุดนักเรียน",
    });
    const variantB = character({
      characterId: "3",
      name: "หนูนา",
      parentCharacterId: "1",
      variantLabel: "ชุดนอน",
    });

    const entries = buildCharacterRosterEntries([parent, variantA, variantB]);

    expect(entries).toHaveLength(1);
    expect(entries[0].character.characterId).toBe("1");
    expect(entries[0].variants.map(v => v.characterId)).toEqual(["2", "3"]);
    expect(entries[0].variants.map(v => v.variantLabel)).toEqual([
      "ชุดนักเรียน",
      "ชุดนอน",
    ]);
    expect(entries[0].shareFaceSourceName).toBeUndefined();
  });

  it("falls back to a generic label lookup being unnecessary at this layer — variantLabel passes through undefined for the UI to fall back on", () => {
    const parent = character({ characterId: "1", name: "หนูนา" });
    const variantNoLabel = character({
      characterId: "2",
      name: "หนูนา",
      parentCharacterId: "1",
      variantLabel: undefined,
    });

    const entries = buildCharacterRosterEntries([parent, variantNoLabel]);

    expect(entries[0].variants).toHaveLength(1);
    expect(entries[0].variants[0].variantLabel).toBeUndefined();
  });

  it("renders a twin as a top-level entry with the shares-face badge resolved to the correct source name", () => {
    const original = character({ characterId: "1", name: "เอิร์ธ" });
    const twin = character({
      characterId: "2",
      name: "อากาศ",
      sharesFaceWithCharacterId: "1",
    });

    const entries = buildCharacterRosterEntries([original, twin]);

    expect(entries).toHaveLength(2);
    const twinEntry = entries.find(e => e.character.characterId === "2");
    expect(twinEntry?.shareFaceSourceName).toBe("เอิร์ธ");
    expect(twinEntry?.variants).toEqual([]);
  });

  it("omits the shares-face badge (rather than throwing or showing broken text) when the source character isn't in the list", () => {
    const twin = character({
      characterId: "2",
      name: "อากาศ",
      sharesFaceWithCharacterId: "999",
    });

    const entries = buildCharacterRosterEntries([twin]);

    expect(entries).toHaveLength(1);
    expect(entries[0].shareFaceSourceName).toBeUndefined();
  });

  it("renders a plain character (no variant/twin fields set) as a single top-level entry with no variants and no shares-face name — matching pre-Phase-E behavior", () => {
    const plain = character({ characterId: "1", name: "มาลี" });

    const entries = buildCharacterRosterEntries([plain]);

    expect(entries).toHaveLength(1);
    expect(entries[0].character).toBe(plain);
    expect(entries[0].variants).toEqual([]);
    expect(entries[0].shareFaceSourceName).toBeUndefined();
  });

  it("handles a mix of plain, variant, and twin rows in one list correctly", () => {
    const plain = character({ characterId: "1", name: "มาลี" });
    const parent = character({ characterId: "2", name: "หนูนา" });
    const variant = character({
      characterId: "3",
      name: "หนูนา",
      parentCharacterId: "2",
      variantLabel: "ชุดทำงานบ้าน",
    });
    const twinSource = character({ characterId: "4", name: "เอิร์ธ" });
    const twin = character({
      characterId: "5",
      name: "อากาศ",
      sharesFaceWithCharacterId: "4",
    });

    const entries = buildCharacterRosterEntries([
      plain,
      parent,
      variant,
      twinSource,
      twin,
    ]);

    // 5 rows in, 1 variant nested away -> 4 top-level entries.
    expect(entries).toHaveLength(4);
    expect(entries.map(e => e.character.characterId)).toEqual([
      "1",
      "2",
      "4",
      "5",
    ]);
    const parentEntry = entries.find(e => e.character.characterId === "2");
    expect(parentEntry?.variants.map(v => v.characterId)).toEqual(["3"]);
    const twinEntry = entries.find(e => e.character.characterId === "5");
    expect(twinEntry?.shareFaceSourceName).toBe("เอิร์ธ");
  });
});
