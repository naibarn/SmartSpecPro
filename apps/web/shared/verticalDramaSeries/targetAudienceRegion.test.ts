import { describe, it, expect } from "vitest";
import {
  VERTICAL_DRAMA_TARGET_AUDIENCE_REGIONS,
  VERTICAL_DRAMA_DEFAULT_TARGET_AUDIENCE_REGION,
  VERTICAL_DRAMA_TARGET_AUDIENCE_REGION_DESCRIPTORS,
  VERTICAL_DRAMA_TARGET_AUDIENCE_REGION_ANCHOR_KEYWORDS,
  normalizeTargetAudienceRegion,
  buildTargetAudienceRegionInstruction,
  readTargetAudienceRegionFromBible,
  resolveCharacterTargetAudienceRegion,
  readCharacterRegionOverrideFromData,
  buildCharacterRegionEthnicityInstruction,
  promptContainsRegionEthnicityAnchor,
  ensureRegionEthnicityAnchorPresent,
} from "./targetAudienceRegion";

describe("normalizeTargetAudienceRegion", () => {
  it("returns every documented region value unchanged", () => {
    for (const region of VERTICAL_DRAMA_TARGET_AUDIENCE_REGIONS) {
      expect(normalizeTargetAudienceRegion(region)).toBe(region);
    }
  });

  it("falls back to the default for unknown/invalid values", () => {
    expect(normalizeTargetAudienceRegion("atlantis")).toBe(
      VERTICAL_DRAMA_DEFAULT_TARGET_AUDIENCE_REGION,
    );
    expect(normalizeTargetAudienceRegion(undefined)).toBe(
      VERTICAL_DRAMA_DEFAULT_TARGET_AUDIENCE_REGION,
    );
    expect(normalizeTargetAudienceRegion(null)).toBe(
      VERTICAL_DRAMA_DEFAULT_TARGET_AUDIENCE_REGION,
    );
    expect(normalizeTargetAudienceRegion(42)).toBe(
      VERTICAL_DRAMA_DEFAULT_TARGET_AUDIENCE_REGION,
    );
  });

  it("defaults to 'thai'", () => {
    expect(VERTICAL_DRAMA_DEFAULT_TARGET_AUDIENCE_REGION).toBe("thai");
  });
});

describe("buildTargetAudienceRegionInstruction", () => {
  it("includes the correct English descriptor for every region", () => {
    for (const region of VERTICAL_DRAMA_TARGET_AUDIENCE_REGIONS) {
      const instruction = buildTargetAudienceRegionInstruction(region);
      expect(instruction).toContain(VERTICAL_DRAMA_TARGET_AUDIENCE_REGION_DESCRIPTORS[region]);
    }
  });

  it("always phrases the instruction as a DEFAULT that a character description can override", () => {
    const instruction = buildTargetAudienceRegionInstruction("western");
    expect(instruction).toMatch(/default/i);
    expect(instruction).toMatch(/description does not already/i);
    expect(instruction).toMatch(/always takes precedence/i);
  });

  it("falls back to the default region's descriptor when given null/undefined", () => {
    const instruction = buildTargetAudienceRegionInstruction(undefined);
    expect(instruction).toContain(
      VERTICAL_DRAMA_TARGET_AUDIENCE_REGION_DESCRIPTORS[VERTICAL_DRAMA_DEFAULT_TARGET_AUDIENCE_REGION],
    );
  });
});

describe("readTargetAudienceRegionFromBible", () => {
  it("reads a valid region off the bible payload", () => {
    expect(readTargetAudienceRegionFromBible({ targetAudienceRegion: "south_asian" })).toBe(
      "south_asian",
    );
  });

  it("normalizes an invalid/missing value to the default", () => {
    expect(readTargetAudienceRegionFromBible({ targetAudienceRegion: "bogus" })).toBe(
      VERTICAL_DRAMA_DEFAULT_TARGET_AUDIENCE_REGION,
    );
    expect(readTargetAudienceRegionFromBible({})).toBe(
      VERTICAL_DRAMA_DEFAULT_TARGET_AUDIENCE_REGION,
    );
    expect(readTargetAudienceRegionFromBible(null)).toBe(
      VERTICAL_DRAMA_DEFAULT_TARGET_AUDIENCE_REGION,
    );
    expect(readTargetAudienceRegionFromBible(undefined)).toBe(
      VERTICAL_DRAMA_DEFAULT_TARGET_AUDIENCE_REGION,
    );
  });
});

/* -------------------------------------------------------------------------- */
/* Per-character region/ethnicity override (planning/vd-per-character-        */
/* ethnicity/plan.md)                                                         */
/* -------------------------------------------------------------------------- */

describe("readCharacterRegionOverrideFromData", () => {
  it("reads region/ethnicityText off a character's data blob", () => {
    expect(readCharacterRegionOverrideFromData({ region: "western", ethnicityText: "Japanese-Thai mix" })).toEqual({
      region: "western",
      ethnicityText: "Japanese-Thai mix",
    });
  });

  it("tolerantly treats non-string/missing values as absent, never throws", () => {
    expect(readCharacterRegionOverrideFromData(null)).toEqual({
      region: undefined,
      ethnicityText: undefined,
    });
    expect(readCharacterRegionOverrideFromData(undefined)).toEqual({
      region: undefined,
      ethnicityText: undefined,
    });
    expect(readCharacterRegionOverrideFromData({ region: 42, ethnicityText: {} })).toEqual({
      region: undefined,
      ethnicityText: undefined,
    });
    expect(readCharacterRegionOverrideFromData({})).toEqual({
      region: undefined,
      ethnicityText: undefined,
    });
  });
});

describe("resolveCharacterTargetAudienceRegion — precedence", () => {
  it("level 1: free-text ethnicity wins even when a dropdown region is ALSO set", () => {
    const resolved = resolveCharacterTargetAudienceRegion(
      { region: "western", ethnicityText: "Japanese-Thai mix" },
      "thai",
    );
    expect(resolved.source).toBe("character_free_text");
    expect(resolved.isExplicit).toBe(true);
    expect(resolved.descriptor).toContain("Japanese-Thai mix");
    expect(resolved.anchorKeywords).toEqual(["japanese-thai mix"]);
  });

  it("level 2: dropdown region wins when no free text is set", () => {
    const resolved = resolveCharacterTargetAudienceRegion({ region: "western" }, "thai");
    expect(resolved.source).toBe("character_region");
    expect(resolved.isExplicit).toBe(true);
    expect(resolved.region).toBe("western");
    expect(resolved.descriptor).toBe(VERTICAL_DRAMA_TARGET_AUDIENCE_REGION_DESCRIPTORS.western);
    expect(resolved.anchorKeywords).toEqual(VERTICAL_DRAMA_TARGET_AUDIENCE_REGION_ANCHOR_KEYWORDS.western);
  });

  it("level 2: blank ethnicityText (whitespace only) falls through to the dropdown region", () => {
    const resolved = resolveCharacterTargetAudienceRegion(
      { region: "east_asian", ethnicityText: "   " },
      "thai",
    );
    expect(resolved.source).toBe("character_region");
    expect(resolved.region).toBe("east_asian");
  });

  it("level 4/5: falls through to the series default when neither override is set", () => {
    const resolved = resolveCharacterTargetAudienceRegion(undefined, "south_asian");
    expect(resolved.source).toBe("series_default");
    expect(resolved.isExplicit).toBe(false);
    expect(resolved.region).toBe("south_asian");
    expect(resolved.descriptor).toBe(VERTICAL_DRAMA_TARGET_AUDIENCE_REGION_DESCRIPTORS.south_asian);
  });

  it("level 4/5: falls through to the global 'thai' default when the series has no region set either", () => {
    const resolved = resolveCharacterTargetAudienceRegion(null, null);
    expect(resolved.source).toBe("series_default");
    expect(resolved.isExplicit).toBe(false);
    expect(resolved.region).toBe(VERTICAL_DRAMA_DEFAULT_TARGET_AUDIENCE_REGION);
  });

  it("an invalid/garbage dropdown region value is ignored, falling through to the series default", () => {
    const resolved = resolveCharacterTargetAudienceRegion({ region: "atlantis" }, "western");
    expect(resolved.source).toBe("series_default");
    expect(resolved.region).toBe("western");
  });

  it("every preset region's descriptor contains at least one of its own anchor keywords (self-verifying, required for D2 idempotency)", () => {
    for (const region of VERTICAL_DRAMA_TARGET_AUDIENCE_REGIONS) {
      const descriptor = VERTICAL_DRAMA_TARGET_AUDIENCE_REGION_DESCRIPTORS[region].toLowerCase();
      const keywords = VERTICAL_DRAMA_TARGET_AUDIENCE_REGION_ANCHOR_KEYWORDS[region];
      expect(keywords.some((keyword) => descriptor.includes(keyword))).toBe(true);
    }
  });
});

describe("buildCharacterRegionEthnicityInstruction", () => {
  it("phrases an explicit override as OVERRIDING the series default and the character's own description", () => {
    const resolved = resolveCharacterTargetAudienceRegion({ region: "western" }, "thai");
    const instruction = buildCharacterRegionEthnicityInstruction(resolved);
    expect(instruction).toMatch(/explicitly set by the user/i);
    expect(instruction).toMatch(/overrides/i);
    expect(instruction).toContain(VERTICAL_DRAMA_TARGET_AUDIENCE_REGION_DESCRIPTORS.western);
  });

  it("falls back to the byte-identical series-default instruction for a non-explicit resolution", () => {
    const resolved = resolveCharacterTargetAudienceRegion(undefined, "thai");
    expect(buildCharacterRegionEthnicityInstruction(resolved)).toBe(
      buildTargetAudienceRegionInstruction("thai"),
    );
  });
});

describe("promptContainsRegionEthnicityAnchor", () => {
  it("matches case-insensitively against any of the region's anchor keywords", () => {
    const resolved = resolveCharacterTargetAudienceRegion({ region: "thai" }, "thai");
    expect(promptContainsRegionEthnicityAnchor("A portrait with THAI features", resolved)).toBe(true);
    expect(promptContainsRegionEthnicityAnchor("A Southeast Asian look", resolved)).toBe(true);
    expect(promptContainsRegionEthnicityAnchor("A generic portrait", resolved)).toBe(false);
  });

  it("matches the raw free text for a free-text override", () => {
    const resolved = resolveCharacterTargetAudienceRegion({ ethnicityText: "half-Japanese, half-Thai" }, "thai");
    expect(promptContainsRegionEthnicityAnchor("A portrait of a half-Japanese, half-Thai woman", resolved)).toBe(true);
    expect(promptContainsRegionEthnicityAnchor("A generic portrait", resolved)).toBe(false);
  });

  it("returns false for empty/missing prompt text", () => {
    const resolved = resolveCharacterTargetAudienceRegion({ region: "thai" }, "thai");
    expect(promptContainsRegionEthnicityAnchor("", resolved)).toBe(false);
    expect(promptContainsRegionEthnicityAnchor(undefined, resolved)).toBe(false);
    expect(promptContainsRegionEthnicityAnchor(null, resolved)).toBe(false);
  });
});

describe("ensureRegionEthnicityAnchorPresent", () => {
  it("prepends the descriptor when the anchor is missing", () => {
    const resolved = resolveCharacterTargetAudienceRegion({ region: "thai" }, "thai");
    const prompt = "Cinematic portrait of a woman, tall with dark hair, wearing a trench coat";
    const result = ensureRegionEthnicityAnchorPresent(prompt, resolved);
    expect(result.startsWith(resolved.descriptor)).toBe(true);
    expect(result).toContain(prompt);
    expect(promptContainsRegionEthnicityAnchor(result, resolved)).toBe(true);
  });

  it("is a no-op when the anchor is already present", () => {
    const resolved = resolveCharacterTargetAudienceRegion({ region: "thai" }, "thai");
    const prompt = "Cinematic portrait of a woman with Thai features, tall with dark hair";
    expect(ensureRegionEthnicityAnchorPresent(prompt, resolved)).toBe(prompt);
  });

  it("is idempotent — prepending twice never double-injects", () => {
    const resolved = resolveCharacterTargetAudienceRegion({ region: "western" }, "thai");
    const prompt = "Cinematic portrait of a woman, tall with dark hair";
    const once = ensureRegionEthnicityAnchorPresent(prompt, resolved);
    const twice = ensureRegionEthnicityAnchorPresent(once, resolved);
    expect(twice).toBe(once);
    expect(once.split(resolved.descriptor).length - 1).toBe(1);
  });

  it("real-data-style proof: a Thai character (region='thai') ends up with a Thai/Southeast-Asian anchor physically present", () => {
    // Mirrors series 18's คิริน วัฒนเมธา — a Thai-named lead whose stored
    // visualBible had ZERO ethnicity anchor because the prompt-writing LLM
    // dropped the series-level default (see plan.md's diagnosis). This
    // proves the deterministic fallback guarantees the anchor lands in the
    // string an image model actually receives, even when the model's own
    // prose (like the real one that shipped for คิริน) omits it entirely.
    const resolved = resolveCharacterTargetAudienceRegion({ region: "thai" }, "thai");
    const modelDroppedAnchorPrompt =
      "Cinematic portrait of คิริน, piercing dark eyes, sharp jawline, light-tan complexion, " +
      "wearing a tailored charcoal suit, 85mm lens, shallow depth of field, 9:16";
    const finalPrompt = ensureRegionEthnicityAnchorPresent(modelDroppedAnchorPrompt, resolved);
    expect(finalPrompt).toMatch(/thai/i);
    expect(promptContainsRegionEthnicityAnchor(finalPrompt, resolved)).toBe(true);
  });
});
