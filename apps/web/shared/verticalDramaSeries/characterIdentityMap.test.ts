import { describe, expect, it } from "vitest";
import {
  buildCharacterDescriptorLine,
  buildCharacterIdentityMapBlock,
  findMissingCharacterIdentityWarnings,
  type VerticalDramaCharacterDescriptorSource,
} from "./characterIdentityMap";

// Real repro data (2026-07-07 non-human-character-vanishing fix): shot 3,
// series/episode with a cat mascot character required, silently rendered as
// "a figure... face mostly obscured by shadows" because the prompt only ever
// carried the bare characterKey `character-8`.
const catMascot: VerticalDramaCharacterDescriptorSource = {
  characterKey: "character-8",
  name: "เจ้าเกลือ",
  role: "มาสคอตของร้าน",
  description: "แมวขาวปุยตาสีทะเลที่ชอบนอนทับขวดสำคัญ",
};

const humanCharacter: VerticalDramaCharacterDescriptorSource = {
  characterKey: "character-1",
  name: "หนูนา",
  role: "protagonist",
  description: "a young woman who runs the memory shop",
};

describe("buildCharacterDescriptorLine", () => {
  it("builds a compact key = name (role): descriptor line", () => {
    expect(buildCharacterDescriptorLine(catMascot)).toBe(
      "character-8 = เจ้าเกลือ (มาสคอตของร้าน): แมวขาวปุยตาสีทะเลที่ชอบนอนทับขวดสำคัญ",
    );
  });

  it("falls back to the characterKey as the label when name/role are absent", () => {
    expect(
      buildCharacterDescriptorLine({ characterKey: "character-9", description: "a stray dog" }),
    ).toBe("character-9 = character-9: a stray dog");
  });

  it("omits the description clause entirely when there is no description", () => {
    expect(buildCharacterDescriptorLine({ characterKey: "character-2", name: "ชายนต์" })).toBe(
      "character-2 = ชายนต์",
    );
  });
});

describe("buildCharacterIdentityMapBlock", () => {
  it("returns undefined when there are no required character keys", () => {
    expect(buildCharacterIdentityMapBlock([], [catMascot])).toBeUndefined();
  });

  it("returns undefined when there are no character rows at all", () => {
    expect(buildCharacterIdentityMapBlock(["character-8"], [])).toBeUndefined();
  });

  it("returns undefined when none of the required keys resolve to a known character row", () => {
    expect(buildCharacterIdentityMapBlock(["character-unknown"], [catMascot])).toBeUndefined();
  });

  it("builds the full block with the mandatory non-human-identity instruction for a known required character", () => {
    const block = buildCharacterIdentityMapBlock(["character-8"], [catMascot]);
    expect(block).toContain("CHARACTER IDENTITY MAP");
    expect(block).toContain(
      "character-8 = เจ้าเกลือ (มาสคอตของร้าน): แมวขาวปุยตาสีทะเลที่ชอบนอนทับขวดสำคัญ",
    );
    expect(block).toMatch(/NEVER render a non-human character/i);
  });

  it("includes multiple required characters in the given order, deduplicated", () => {
    const block = buildCharacterIdentityMapBlock(
      ["character-1", "character-8", "character-1"],
      [catMascot, humanCharacter],
    );
    const lines = block!.split("\n");
    const humanLineIndex = lines.findIndex((l) => l.startsWith("character-1 ="));
    const catLineIndex = lines.findIndex((l) => l.startsWith("character-8 ="));
    expect(humanLineIndex).toBeGreaterThanOrEqual(0);
    expect(catLineIndex).toBeGreaterThan(humanLineIndex);
    // Deduplicated — only one "character-1 =" line even though it appears twice in input.
    expect(lines.filter((l) => l.startsWith("character-1 =")).length).toBe(1);
  });

  it("skips required keys with no matching row but still includes the ones that do resolve", () => {
    const block = buildCharacterIdentityMapBlock(
      ["character-unknown", "character-8"],
      [catMascot],
    );
    expect(block).toContain("character-8 =");
    expect(block).not.toContain("character-unknown =");
  });
});

describe("findMissingCharacterIdentityWarnings", () => {
  it("flags a frame whose prompt mentions neither the character's name nor any descriptor word (the เจ้าเกลือ repro)", () => {
    const warnings = findMissingCharacterIdentityWarnings(
      [
        {
          shotNumber: 3,
          imagePrompt:
            "A figure stands near the shelf, face mostly obscured by shadows, hand reaching toward a bottle.",
          requiredCharacterRefs: ["character-8"],
        },
      ],
      [catMascot],
    );
    expect(warnings).toEqual([
      { shotNumber: 3, characterKey: "character-8", characterName: "เจ้าเกลือ" },
    ]);
  });

  it("does NOT flag a frame whose prompt mentions the character's name", () => {
    const warnings = findMissingCharacterIdentityWarnings(
      [
        {
          shotNumber: 3,
          imagePrompt: "เจ้าเกลือ curls up on top of the bottle, tail flicking lazily.",
          requiredCharacterRefs: ["character-8"],
        },
      ],
      [catMascot],
    );
    expect(warnings).toEqual([]);
  });

  it("does NOT flag a frame whose prompt mentions a meaningful descriptor word even without the name", () => {
    const warnings = findMissingCharacterIdentityWarnings(
      [
        {
          shotNumber: 3,
          imagePrompt: "A fluffy white cat sits atop the bottle in the dim light.",
          requiredCharacterRefs: ["character-8"],
        },
      ],
      [{ ...catMascot, description: "fluffy white cat with sea-colored eyes" }],
    );
    expect(warnings).toEqual([]);
  });

  it("skips characters with no matching row (nothing to check against)", () => {
    const warnings = findMissingCharacterIdentityWarnings(
      [
        {
          shotNumber: 1,
          imagePrompt: "A generic figure stands in the doorway.",
          requiredCharacterRefs: ["character-unknown"],
        },
      ],
      [catMascot],
    );
    expect(warnings).toEqual([]);
  });

  it("checks every shot independently and only flags the ones missing the identity", () => {
    const warnings = findMissingCharacterIdentityWarnings(
      [
        {
          shotNumber: 1,
          imagePrompt: "เจ้าเกลือ sleeps on the counter.",
          requiredCharacterRefs: ["character-8"],
        },
        {
          shotNumber: 2,
          imagePrompt: "A shadowy figure lurks near the door.",
          requiredCharacterRefs: ["character-8"],
        },
      ],
      [catMascot],
    );
    expect(warnings).toEqual([
      { shotNumber: 2, characterKey: "character-8", characterName: "เจ้าเกลือ" },
    ]);
  });
});
