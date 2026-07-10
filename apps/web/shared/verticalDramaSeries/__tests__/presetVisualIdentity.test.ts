import { describe, expect, it } from "vitest";
import {
  computeBlendCoverage,
  findUnderBlended,
  mergeVisualIdentities,
  verticalDramaPresetVisualIdentityColumnSchema,
  verticalDramaPresetVisualIdentitySchema,
  type VerticalDramaBlendReport,
  type VerticalDramaPresetVisualIdentity,
  type VerticalDramaVisualIdentitySelection,
} from "../presetVisualIdentity";

function buildIdentity(
  overrides: Partial<VerticalDramaPresetVisualIdentity> = {}
): VerticalDramaPresetVisualIdentity {
  return {
    styleName: "Test Style",
    palette: ["Teal", "Gunmetal", "Ivory"],
    lighting: "overcast hangar glow",
    environmentMotifs: ["hangar"],
    wardrobeGrammar: ["tactical straps"],
    signaturePropsAndCompanions: ["giant robot companion"],
    cameraGrammar: "low-angle hero portrait, centered 9:16",
    characterArchetypes: [{ role: "lead", look: "techwear scout" }],
    imagePromptFragments: { positive: ["cinematic"], negative: ["blurry"] },
    ...overrides,
  };
}

describe("verticalDramaPresetVisualIdentitySchema", () => {
  it("parses a valid identity with a 3-color palette (lower bound)", () => {
    expect(() =>
      verticalDramaPresetVisualIdentitySchema.parse(
        buildIdentity({ palette: ["A", "B", "C"] })
      )
    ).not.toThrow();
  });

  it("parses a valid identity with a 6-color palette (upper bound)", () => {
    expect(() =>
      verticalDramaPresetVisualIdentitySchema.parse(
        buildIdentity({ palette: ["A", "B", "C", "D", "E", "F"] })
      )
    ).not.toThrow();
  });

  it("rejects a palette with fewer than 3 colors", () => {
    expect(() =>
      verticalDramaPresetVisualIdentitySchema.parse(
        buildIdentity({ palette: ["A", "B"] })
      )
    ).toThrow();
  });

  it("rejects a palette with more than 6 colors", () => {
    expect(() =>
      verticalDramaPresetVisualIdentitySchema.parse(
        buildIdentity({ palette: ["A", "B", "C", "D", "E", "F", "G"] })
      )
    ).toThrow();
  });
});

describe("verticalDramaPresetVisualIdentityColumnSchema", () => {
  it("tolerates a legacy preset's null visualIdentityJson column", () => {
    expect(
      verticalDramaPresetVisualIdentityColumnSchema.parse(null)
    ).toBeNull();
  });

  it("still enforces the palette bound when the column IS present", () => {
    expect(() =>
      verticalDramaPresetVisualIdentityColumnSchema.parse(
        buildIdentity({ palette: ["A"] })
      )
    ).toThrow();
  });
});

describe("mergeVisualIdentities", () => {
  it("weighted-merges the palette primary-heavy, higher-weight-first among supporting presets, capped at 6", () => {
    const primary: VerticalDramaVisualIdentitySelection = {
      identity: buildIdentity({ palette: ["A", "B"] }),
      weight: 3,
      isPrimary: true,
    };
    const highWeightSupport: VerticalDramaVisualIdentitySelection = {
      identity: buildIdentity({ palette: ["C", "D", "E"] }),
      weight: 5,
      isPrimary: false,
    };
    const lowWeightSupport: VerticalDramaVisualIdentitySelection = {
      identity: buildIdentity({ palette: ["F", "G", "H"] }),
      weight: 1,
      isPrimary: false,
    };

    const merged = mergeVisualIdentities([
      primary,
      highWeightSupport,
      lowWeightSupport,
    ]);

    // Primary's colors + the higher-weight supporter's colors all survive the
    // cap; the lower-weight supporter's tail (G, H) is the one cut off.
    expect(merged.palette).toEqual(["A", "B", "C", "D", "E", "F"]);
    expect(merged.palette).toHaveLength(6);
    expect(merged.palette).not.toContain("G");
    expect(merged.palette).not.toContain("H");
  });

  it("dedupes palette colors across selections case-insensitively, keeping the first-seen casing", () => {
    const primary: VerticalDramaVisualIdentitySelection = {
      identity: buildIdentity({ palette: ["Teal-Green", "Gunmetal"] }),
      weight: 3,
      isPrimary: true,
    };
    const supporting: VerticalDramaVisualIdentitySelection = {
      identity: buildIdentity({ palette: ["teal-green", "Rust"] }),
      weight: 2,
      isPrimary: false,
    };

    const merged = mergeVisualIdentities([primary, supporting]);

    expect(merged.palette).toEqual(["Teal-Green", "Gunmetal", "Rust"]);
  });

  it("unions motif/wardrobe/prop fields in plain INPUT order — NOT primary-first (contrast with palette)", () => {
    const nonPrimaryListedFirst: VerticalDramaVisualIdentitySelection = {
      identity: buildIdentity({
        palette: ["X", "Y"],
        environmentMotifs: ["neon jungle"],
        wardrobeGrammar: ["techwear knit"],
        signaturePropsAndCompanions: ["cyber cat"],
        imagePromptFragments: { positive: [], negative: ["overexposed"] },
      }),
      weight: 1,
      isPrimary: false,
    };
    const primaryListedSecond: VerticalDramaVisualIdentitySelection = {
      identity: buildIdentity({
        palette: ["A", "B"],
        environmentMotifs: ["hangar glow"],
        wardrobeGrammar: ["plated armor accents"],
        signaturePropsAndCompanions: ["giant robot companion"],
        imagePromptFragments: { positive: [], negative: ["cartoonish"] },
      }),
      weight: 3,
      isPrimary: true,
    };

    const merged = mergeVisualIdentities([
      nonPrimaryListedFirst,
      primaryListedSecond,
    ]);

    // Order-stable on the SELECTIONS array order (non-primary was listed first).
    expect(merged.environmentMotifs).toEqual(["neon jungle", "hangar glow"]);
    expect(merged.wardrobeGrammar).toEqual([
      "techwear knit",
      "plated armor accents",
    ]);
    expect(merged.signaturePropsAndCompanions).toEqual([
      "cyber cat",
      "giant robot companion",
    ]);
    expect(merged.imagePromptFragments.negative).toEqual([
      "overexposed",
      "cartoonish",
    ]);

    // Contrast: palette IS primary-heavy, so the primary (listed second) still leads.
    expect(merged.palette).toEqual(["A", "B", "X", "Y"]);
  });

  it("does not merge styleName, lighting, cameraGrammar, characterArchetypes, or positive fragments", () => {
    const primary: VerticalDramaVisualIdentitySelection = {
      identity: buildIdentity(),
      weight: 3,
      isPrimary: true,
    };
    const merged = mergeVisualIdentities([primary]);

    expect(merged).not.toHaveProperty("styleName");
    expect(merged).not.toHaveProperty("lighting");
    expect(merged).not.toHaveProperty("cameraGrammar");
    expect(merged).not.toHaveProperty("characterArchetypes");
    expect(merged.imagePromptFragments).not.toHaveProperty("positive");
  });

  it("is deterministic — identical input yields identical output", () => {
    const selections: VerticalDramaVisualIdentitySelection[] = [
      {
        identity: buildIdentity({ palette: ["A", "B"] }),
        weight: 3,
        isPrimary: true,
      },
      {
        identity: buildIdentity({ palette: ["C", "D"] }),
        weight: 2,
        isPrimary: false,
      },
    ];

    expect(mergeVisualIdentities(selections)).toEqual(
      mergeVisualIdentities(selections)
    );
  });
});

describe("computeBlendCoverage / findUnderBlended", () => {
  const report: Pick<VerticalDramaBlendReport, "facets"> = {
    facets: [
      {
        facet: "story_spine",
        contributions: [
          { presetId: "A", element: "hero's journey", kept: true },
        ],
      },
      {
        facet: "characters",
        contributions: [
          { presetId: "A", element: "mecha companion", kept: true },
          // A second KEPT contribution from A in the SAME facet — must not double count.
          { presetId: "A", element: "sidekick drone", kept: true },
          { presetId: "C", element: "rival cyborg", kept: false },
        ],
      },
      {
        facet: "tone",
        contributions: [
          { presetId: "A", element: "hopeful", kept: true },
          { presetId: "B", element: "gritty", kept: true },
        ],
      },
      {
        facet: "situations",
        contributions: [
          { presetId: "B", element: "desert chase", kept: false },
        ],
      },
    ],
  };

  it("counts only kept:true contributions, at most once per (preset, facet) pair", () => {
    const coverage = computeBlendCoverage(report);

    // A: story_spine + characters + tone = 3 (the duplicate kept contribution
    // within "characters" does not push it to 4).
    expect(coverage.A).toBe(3);
    // B: tone (kept) only; situations was NOT kept.
    expect(coverage.B).toBe(1);
    // C: appears only as a non-kept contribution -> explicit 0, not omitted.
    expect(coverage.C).toBe(0);
  });

  it("flags presets below the default floor (2) as under-blended, sorted", () => {
    expect(findUnderBlended(report)).toEqual(["B", "C"]);
  });

  it("respects a custom minFacetsPerPreset floor", () => {
    // At floor 4, even A (coverage 3) is now under-blended.
    expect(findUnderBlended(report, 4)).toEqual(["A", "B", "C"]);
    // At floor 1, everyone with at least one kept facet passes; only C (0) fails.
    expect(findUnderBlended(report, 1)).toEqual(["C"]);
  });

  it("is deterministic — identical input yields identical output", () => {
    expect(computeBlendCoverage(report)).toEqual(computeBlendCoverage(report));
    expect(findUnderBlended(report)).toEqual(findUnderBlended(report));
  });
});
