import { describe, expect, it } from "vitest";
import {
  buildCharacterDescriptorLine,
  buildCharacterIdentityMapBlock,
  buildCharacterIdentityLockBlock,
  ensureCharacterIdentityLockPrompt,
  findCharacterImageIndexMappingMismatches,
  findMissingCharacterIdentityWarnings,
  stripExistingIdentityLockSuffix,
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

  it("includes the deterministic twin identity lock alongside local descriptors", () => {
    expect(
      buildCharacterDescriptorLine({
        characterKey: "character-3",
        name: "ภูมิ",
        description: "navy shirt",
        twinIdentityLock:
          "TWIN IDENTITY LOCK: same face and facial structure as ภาคิน; same apparent age range (around 9 years old); clothing, hair, and personality may differ",
      })
    ).toContain("TWIN IDENTITY LOCK: same face and facial structure as ภาคิน");
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

describe("findCharacterImageIndexMappingMismatches (2026-07-16 start-frame reference-mapping contradiction fix)", () => {
  // Real repro data (series 16, episode 66, shot 9): the skill's own prose
  // said "ภาคิน (Image 1)" / "ไอริณ (Image 2)" while a code-appended tail
  // block said "Image 1 = ไอริณ; Image 2 = ภาคิน" — a direct, silent
  // self-contradiction. The tail-block phrasing is now the ONLY code-authored
  // path removed (Phase 3); this validator exists to catch exactly this
  // shape of contradiction wherever it appears in a skill-authored prompt.
  const references = [
    { imageIndex: 1, characterName: "ภาคิน" },
    { imageIndex: 2, characterName: "ไอริณ" },
  ];

  it("returns no mismatches for a correct mapping (name-then-Image-N prose)", () => {
    const prompt =
      "ภาคิน (Image 1, leftmost, mid-stride) faces ไอริณ (Image 2, rightmost, arms crossed).";
    expect(findCharacterImageIndexMappingMismatches(prompt, references)).toEqual([]);
  });

  it("returns no mismatches for a correct mapping (Image-N-equals-name tail style)", () => {
    const prompt = "A tense standoff. Image 1 = ภาคิน; Image 2 = ไอริณ.";
    expect(findCharacterImageIndexMappingMismatches(prompt, references)).toEqual([]);
  });

  it("catches a swapped mapping — the exact live bug (prose says Image 1/2 one way, tail says the other)", () => {
    const prompt =
      "ภาคิน (Image 1, leftmost) faces ไอริณ (Image 2, rightmost). " +
      "[Attached character reference images: Image 1 = ไอริณ; Image 2 = ภาคิน.]";
    const mismatches = findCharacterImageIndexMappingMismatches(prompt, references);
    expect(mismatches.length).toBeGreaterThan(0);
    expect(mismatches).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          characterName: "ไอริณ",
          claimedImageIndex: 1,
          expectedImageIndex: 2,
        }),
        expect.objectContaining({
          characterName: "ภาคิน",
          claimedImageIndex: 2,
          expectedImageIndex: 1,
        }),
      ]),
    );
  });

  it("catches the exact 'Image 1 = ไอริณ; Image 2 = ภาคิน' tail-style claim contradicting the manifest", () => {
    const prompt = "A quiet scene. Image 1 = ไอริณ; Image 2 = ภาคิน";
    const mismatches = findCharacterImageIndexMappingMismatches(prompt, references);
    expect(mismatches).toEqual([
      { characterName: "ไอริณ", claimedImageIndex: 1, expectedImageIndex: 2 },
      { characterName: "ภาคิน", claimedImageIndex: 2, expectedImageIndex: 1 },
    ]);
  });

  it("catches a 'name (Image N, leftmost' style claim that contradicts the manifest", () => {
    // ภาคิน is really Image 1, but this prose claims Image 2.
    const prompt = "ภาคิน (Image 2, leftmost, mid-stride) glances toward the door.";
    const mismatches = findCharacterImageIndexMappingMismatches(prompt, references);
    expect(mismatches).toEqual([
      { characterName: "ภาคิน", claimedImageIndex: 2, expectedImageIndex: 1 },
    ]);
  });

  it("works with Latin names, case-insensitively", () => {
    const latinReferences = [
      { imageIndex: 1, characterName: "Hero" },
      { imageIndex: 2, characterName: "Villain" },
    ];
    const prompt = "hero (image 2, tense) squares off against Villain (Image 1).";
    const mismatches = findCharacterImageIndexMappingMismatches(prompt, latinReferences);
    expect(mismatches).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ characterName: "Hero", claimedImageIndex: 2, expectedImageIndex: 1 }),
        expect.objectContaining({ characterName: "Villain", claimedImageIndex: 1, expectedImageIndex: 2 }),
      ]),
    );
  });

  it("does NOT flag implicit prose that never makes an explicit 'Image N' claim (lenient by design)", () => {
    const prompt =
      "ภาคิน stands near the window while ไอริณ leans against the counter, both illuminated by warm evening light.";
    expect(findCharacterImageIndexMappingMismatches(prompt, references)).toEqual([]);
  });

  it("ignores 'Image N = location: ...' claims — locations are a separate concern", () => {
    const prompt =
      "Image 1 = ภาคิน; Image 2 = ไอริณ; Image 3 = location: ร้านกาแฟริมทาง, warm afternoon light.";
    expect(
      findCharacterImageIndexMappingMismatches(prompt, [
        ...references,
        { imageIndex: 3, characterName: "ร้านกาแฟริมทาง" },
      ]),
    ).toEqual([]);
  });

  it("does not let a shorter name that is a substring of a longer one produce a false match", () => {
    const substringReferences = [
      { imageIndex: 1, characterName: "Rin" },
      { imageIndex: 2, characterName: "Katarin" },
    ];
    // "Katarin" correctly claims Image 2 — "Rin" (a substring of "Katarin")
    // must NOT also be matched here and flagged as claiming Image 2.
    const prompt = "Katarin (Image 2, composed) stands at the doorway.";
    expect(
      findCharacterImageIndexMappingMismatches(prompt, substringReferences),
    ).toEqual([]);
  });

  it("returns no mismatches when the prompt is empty or no references are known", () => {
    expect(findCharacterImageIndexMappingMismatches("", references)).toEqual([]);
    expect(
      findCharacterImageIndexMappingMismatches("Image 1 = ภาคิน", []),
    ).toEqual([]);
  });

  it("ignores an explicit claim naming someone who isn't a known reference at all", () => {
    const prompt = "Image 1 = ภาคิน; a background extra also appears (Image 3, unnamed).";
    expect(findCharacterImageIndexMappingMismatches(prompt, references)).toEqual([]);
  });
});

describe("stripExistingIdentityLockSuffix", () => {
  it("returns the prompt unchanged when no identity-lock suffix is present", () => {
    expect(stripExistingIdentityLockSuffix("A scenic view.")).toBe(
      "A scenic view."
    );
  });

  it("strips the bracketed multi-character block and trims trailing whitespace", () => {
    const withSuffix =
      "A scene description. [Attached character reference images: Image 1 = A. Strictly reference each character's exact facial and physical identity from their assigned attached image number (Image 1, Image 2, etc.) — match face shape, skin tone, hairstyle, clothing/outfit, and distinguishing features precisely from the corresponding attached image; do not alter identity or wardrobe.]";
    expect(stripExistingIdentityLockSuffix(withSuffix)).toBe(
      "A scene description."
    );
  });

  it("strips the generic single-character fallback sentence", () => {
    const withSuffix =
      "A close-up shot. Use the attached reference image as this character's exact identity — match face shape, skin tone, hairstyle, clothing/outfit, and distinguishing features precisely; do not alter identity or wardrobe.";
    expect(stripExistingIdentityLockSuffix(withSuffix)).toBe(
      "A close-up shot."
    );
  });

  it("strips the combined generated identity-lock block", () => {
    const prompt = ensureCharacterIdentityLockPrompt("A scene.", [
      { imageIndex: 1, characterKey: "a", characterName: "A" },
      { imageIndex: 2, characterKey: "b", characterName: "B" },
    ]).prompt;
    expect(stripExistingIdentityLockSuffix(prompt)).toBe("A scene.");
  });

  it("removes a generated block in the middle without dropping the remaining scene prompt", () => {
    const prompt = ensureCharacterIdentityLockPrompt(
      "REFERENCE MAPPING: Image 1 = A. PHYSICAL CAST LOCK (MANDATORY): exactly one. SCENE DETAILS: keep the table.",
      [{ imageIndex: 1, characterKey: "a", characterName: "A" }]
    ).prompt;
    expect(stripExistingIdentityLockSuffix(prompt)).toBe(
      "REFERENCE MAPPING: Image 1 = A.\n\nPHYSICAL CAST LOCK (MANDATORY): exactly one. SCENE DETAILS: keep the table."
    );
  });
});

describe("combined character identity lock", () => {
  it("covers all attached characters in one block", () => {
    const block = buildCharacterIdentityLockBlock([
      { imageIndex: 1, characterKey: "a", characterName: "Pimpchanok" },
      { imageIndex: 2, characterKey: "b", characterName: "Mayuree" },
      { imageIndex: 3, characterKey: "c", characterName: "Nicha" },
    ]);
    expect(block).toContain("- Pimpchanok — Reference Image 1");
    expect(block).toContain("- Mayuree — Reference Image 2");
    expect(block).toContain("- Nicha — Reference Image 3");
    expect(block?.match(/facial proportions/g)).toHaveLength(1);
    expect(block).toContain("Do not change, merge, swap, replace");
  });

  it("merges repeated references for one character without duplicating the checklist", () => {
    const block = buildCharacterIdentityLockBlock([
      { imageIndex: 1, characterKey: "a", characterName: "Pimpchanok" },
      { imageIndex: 3, characterKey: "a", characterName: "Pimpchanok" },
    ]);
    expect(block).toContain("- Pimpchanok — Reference Images 1, 3");
    expect(block?.match(/CHARACTER IDENTITY LOCK —/g)).toHaveLength(1);
    expect(block?.match(/^- apparent age$/gm)).toHaveLength(1);
    expect(block).toContain("AGE / MATURITY LOCK (NON-NEGOTIABLE)");
  });

  it("is idempotent and preserves prompts without references", () => {
    const references = [
      { imageIndex: 1, characterKey: "a", characterName: "Pimpchanok" },
    ];
    const first = ensureCharacterIdentityLockPrompt("A scene.", references);
    expect(ensureCharacterIdentityLockPrompt(first.prompt, references)).toEqual(first);
    const mapped = ensureCharacterIdentityLockPrompt(
      "REFERENCE MAPPING: Image 1 = Pimpchanok. PHYSICAL CAST LOCK (MANDATORY): exactly one. Scene.",
      references
    ).prompt;
    expect(mapped.indexOf("BEGIN CHARACTER IDENTITY LOCKS")).toBeGreaterThan(
      mapped.indexOf("REFERENCE MAPPING:")
    );
    expect(mapped.indexOf("BEGIN CHARACTER IDENTITY LOCKS")).toBeLessThan(
      mapped.indexOf("PHYSICAL CAST LOCK")
    );
    expect(ensureCharacterIdentityLockPrompt("A scene.", [])).toEqual({
      prompt: "A scene.",
    });
  });
});
