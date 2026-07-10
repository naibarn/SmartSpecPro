import { describe, expect, it } from "vitest";
import {
  VD_AD_BANNER_STYLE_IDS,
  VD_AD_BANNER_PLACEMENT_IDS,
  VD_AD_BANNER_STYLE_PRESETS,
  VD_AD_BANNER_PLACEMENT_PRESETS,
  VD_AD_BANNER_MAX_PER_SERIES,
  VD_AD_BANNER_COPY_LIMITS,
  VD_AD_BANNER_FRAME_WIDTH,
  VD_AD_BANNER_FRAME_HEIGHT,
  getAdBannerStylePreset,
  getAdBannerPlacementPreset,
  resolvePlacementBox,
  styleMatchesProductCategory,
  recommendStylePresets,
  containsForbiddenClaim,
  validateAdBannerDesigns,
  createDefaultAdBannerDesign,
  parseAdBannerDesigns,
  readAdBannerProductContext,
  vdAdBannerDesignSchema,
  type VdAdBannerDesign,
} from "./adBannerPresets";

function baseDesign(
  overrides: Partial<VdAdBannerDesign> = {}
): VdAdBannerDesign {
  return {
    id: "banner-1",
    stylePresetId: "bold_typography",
    placementId: "bottom_band",
    copy: {},
    prompt: {},
    generation: {},
    defaultTiming: { mode: "entire" },
    status: "draft",
    ...overrides,
  };
}

describe("VD_AD_BANNER_STYLE_PRESETS", () => {
  it("has exactly the 10 documented style ids, each present exactly once", () => {
    expect(VD_AD_BANNER_STYLE_PRESETS).toHaveLength(10);
    expect(VD_AD_BANNER_STYLE_PRESETS.map(p => p.id).sort()).toEqual(
      [...VD_AD_BANNER_STYLE_IDS].sort()
    );
  });

  it("gives every preset non-empty prompt tokens in all 4 categories, negative tokens, and fitCategories", () => {
    for (const preset of VD_AD_BANNER_STYLE_PRESETS) {
      expect(preset.promptTokens.style.length).toBeGreaterThan(0);
      expect(preset.promptTokens.composition.length).toBeGreaterThan(0);
      expect(preset.promptTokens.texture.length).toBeGreaterThan(0);
      expect(preset.promptTokens.lighting.length).toBeGreaterThan(0);
      expect(preset.negativeTokens.length).toBeGreaterThan(0);
      expect(preset.fitCategories.length).toBeGreaterThan(0);
      expect(["low", "med", "high"]).toContain(preset.textInImageRisk);
      expect(preset.nameTh.length).toBeGreaterThan(0);
      expect(preset.nameEn.length).toBeGreaterThan(0);
      expect(preset.essenceTh.length).toBeGreaterThan(0);
    }
  });

  it("marks the two text-hero trends as high textInImageRisk", () => {
    expect(getAdBannerStylePreset("bold_typography").textInImageRisk).toBe(
      "high"
    );
    expect(getAdBannerStylePreset("vertical_first").textInImageRisk).toBe(
      "high"
    );
  });

  it("getAdBannerStylePreset throws on an unknown id", () => {
    expect(() => getAdBannerStylePreset("nope" as never)).toThrow();
  });
});

describe("VD_AD_BANNER_PLACEMENT_PRESETS", () => {
  it("has exactly the 3 documented placement ids", () => {
    expect(VD_AD_BANNER_PLACEMENT_PRESETS).toHaveLength(3);
    expect(VD_AD_BANNER_PLACEMENT_PRESETS.map(p => p.id).sort()).toEqual(
      [...VD_AD_BANNER_PLACEMENT_IDS].sort()
    );
  });

  it("keeps every placement box within the 1080x1920 frame", () => {
    for (const placement of VD_AD_BANNER_PLACEMENT_PRESETS) {
      expect(placement.box.x).toBeGreaterThanOrEqual(0);
      expect(placement.box.y).toBeGreaterThanOrEqual(0);
      expect(placement.box.x + placement.box.w).toBeLessThanOrEqual(
        VD_AD_BANNER_FRAME_WIDTH
      );
      expect(placement.box.y + placement.box.h).toBeLessThanOrEqual(
        VD_AD_BANNER_FRAME_HEIGHT
      );
      expect(placement.fadeSec).toBeCloseTo(0.3);
      expect(placement.compositionGuidance.length).toBeGreaterThan(0);
    }
  });

  it("matches the exact preferredModelAspects orderings from the design", () => {
    expect(
      getAdBannerPlacementPreset("bottom_band").preferredModelAspects
    ).toEqual(["16:9", "3:2"]);
    expect(
      getAdBannerPlacementPreset("side_vertical").preferredModelAspects
    ).toEqual(["9:16", "2:3", "3:4"]);
    expect(
      getAdBannerPlacementPreset("fullscreen").preferredModelAspects
    ).toEqual(["9:16"]);
  });

  it("defaults bottom_band and side_vertical to entire-clip timing, fullscreen to a 3s window", () => {
    expect(getAdBannerPlacementPreset("bottom_band").defaultTiming).toEqual({
      mode: "entire",
    });
    expect(getAdBannerPlacementPreset("side_vertical").defaultTiming).toEqual({
      mode: "entire",
    });
    expect(getAdBannerPlacementPreset("fullscreen").defaultTiming).toEqual({
      mode: "window",
      startSec: 0,
      durationSec: 3,
    });
  });

  it("getAdBannerPlacementPreset throws on an unknown id", () => {
    expect(() => getAdBannerPlacementPreset("nope" as never)).toThrow();
  });
});

describe("resolvePlacementBox", () => {
  it("returns the box unchanged for non-side_vertical placements regardless of sideAlign", () => {
    const band = getAdBannerPlacementPreset("bottom_band");
    expect(resolvePlacementBox(band, "right")).toEqual(band.box);
  });

  it("returns the left-aligned default box for side_vertical when sideAlign is left or absent", () => {
    const side = getAdBannerPlacementPreset("side_vertical");
    expect(resolvePlacementBox(side)).toEqual({
      x: 20,
      y: 480,
      w: 300,
      h: 960,
    });
    expect(resolvePlacementBox(side, "left")).toEqual({
      x: 20,
      y: 480,
      w: 300,
      h: 960,
    });
  });

  it("mirrors the box to x=760 for side_vertical + right align (1080 - 300 - 20)", () => {
    const side = getAdBannerPlacementPreset("side_vertical");
    expect(resolvePlacementBox(side, "right")).toEqual({
      x: 760,
      y: 480,
      w: 300,
      h: 960,
    });
  });
});

describe("styleMatchesProductCategory / recommendStylePresets", () => {
  it("matches exact fitCategories tags case-insensitively", () => {
    const preset = getAdBannerStylePreset("imperfect_by_design");
    expect(styleMatchesProductCategory(preset, "coffee")).toBe(true);
    expect(styleMatchesProductCategory(preset, "COFFEE")).toBe(true);
    expect(styleMatchesProductCategory(preset, "automobile")).toBe(false);
  });

  it("bidirectionally substring-matches the tie-in's coarser productCategory vocabulary", () => {
    const tactile = getAdBannerStylePreset("tactile_sensory"); // fitCategories includes "cosmetic"
    expect(styleMatchesProductCategory(tactile, "cosmetics")).toBe(true);

    const documentary = getAdBannerStylePreset("documentary_realism"); // fitCategories includes "food"
    const boldTypography = getAdBannerStylePreset("bold_typography"); // fitCategories includes "beverage"
    expect(styleMatchesProductCategory(documentary, "food_beverage")).toBe(
      true
    );
    expect(styleMatchesProductCategory(boldTypography, "food_beverage")).toBe(
      true
    );
  });

  it("never matches an absent/empty category", () => {
    const preset = getAdBannerStylePreset("imperfect_by_design");
    expect(styleMatchesProductCategory(preset, undefined)).toBe(false);
    expect(styleMatchesProductCategory(preset, null)).toBe(false);
    expect(styleMatchesProductCategory(preset, "  ")).toBe(false);
  });

  it("recommendStylePresets returns all 10 ids, matches first, stable order otherwise", () => {
    const ordered = recommendStylePresets("cosmetics");
    expect(ordered).toHaveLength(10);
    expect(new Set(ordered)).toEqual(new Set(VD_AD_BANNER_STYLE_IDS));
    // tactile_sensory (fitCategories has "cosmetic") must be recommended first.
    expect(ordered[0]).toBe("tactile_sensory");
  });

  it("recommendStylePresets degrades to the plain original order for an unmatched category", () => {
    expect(recommendStylePresets("some_totally_unmapped_category")).toEqual([
      ...VD_AD_BANNER_STYLE_IDS,
    ]);
    expect(recommendStylePresets(undefined)).toEqual([
      ...VD_AD_BANNER_STYLE_IDS,
    ]);
  });
});

describe("containsForbiddenClaim", () => {
  it("is false when there are no forbidden claims", () => {
    expect(containsForbiddenClaim("cures everything instantly", [])).toBe(
      false
    );
    expect(
      containsForbiddenClaim("cures everything instantly", undefined)
    ).toBe(false);
  });

  it("matches case-insensitively as a substring, trimming each claim", () => {
    expect(
      containsForbiddenClaim("This product CURES acne overnight.", [
        "  cures  ",
      ])
    ).toBe(true);
    expect(containsForbiddenClaim("รับประกันผลลัพธ์ 100%", ["100%"])).toBe(
      true
    );
  });

  it("is false when no forbidden claim appears anywhere in the text", () => {
    expect(
      containsForbiddenClaim("a gentle daily moisturizer", [
        "cures",
        "guaranteed",
      ])
    ).toBe(false);
  });

  it("ignores blank/whitespace-only forbidden claim entries", () => {
    expect(containsForbiddenClaim("some text", ["", "   "])).toBe(false);
  });
});

describe("createDefaultAdBannerDesign", () => {
  it("builds a draft design seeded from the placement's default timing", () => {
    const design = createDefaultAdBannerDesign({
      id: "banner-abc",
      stylePresetId: "reality_warp",
      placementId: "fullscreen",
    });
    expect(design).toMatchObject({
      id: "banner-abc",
      stylePresetId: "reality_warp",
      placementId: "fullscreen",
      status: "draft",
      copy: {},
      prompt: {},
      generation: {},
      defaultTiming: { mode: "window", startSec: 0, durationSec: 3 },
    });
    expect(vdAdBannerDesignSchema.safeParse(design).success).toBe(true);
  });
});

describe("parseAdBannerDesigns", () => {
  it("returns [] for a non-array value", () => {
    expect(parseAdBannerDesigns(undefined)).toEqual([]);
    expect(parseAdBannerDesigns(null)).toEqual([]);
    expect(parseAdBannerDesigns({ not: "an array" })).toEqual([]);
  });

  it("keeps valid entries and silently drops malformed ones", () => {
    const valid = baseDesign({ id: "ok-1" });
    const malformed = { id: "bad-1", stylePresetId: "not_a_real_style" };
    const result = parseAdBannerDesigns([valid, malformed, "garbage", 42]);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("ok-1");
  });
});

describe("readAdBannerProductContext", () => {
  it("reads all fields defensively from a well-formed productTieIn blob", () => {
    const ctx = readAdBannerProductContext({
      productName: "Glow Serum",
      productCategory: "cosmetics",
      forbiddenClaims: ["cures", 42, null],
      regulatedCategory: "beauty",
      requireHumanApproval: true,
    });
    expect(ctx).toEqual({
      name: "Glow Serum",
      category: "cosmetics",
      forbiddenClaims: ["cures"],
      regulatedCategory: "beauty",
      requireHumanApproval: true,
    });
  });

  it("degrades gracefully for null/undefined/malformed input", () => {
    expect(readAdBannerProductContext(null)).toEqual({
      name: undefined,
      category: undefined,
      forbiddenClaims: [],
      regulatedCategory: undefined,
      requireHumanApproval: false,
    });
    expect(
      readAdBannerProductContext({ forbiddenClaims: "not-an-array" })
    ).toEqual({
      name: undefined,
      category: undefined,
      forbiddenClaims: [],
      regulatedCategory: undefined,
      requireHumanApproval: false,
    });
  });
});

describe("validateAdBannerDesigns", () => {
  it("returns no issues for a small, well-formed design list", () => {
    const designs = [baseDesign({ id: "a" }), baseDesign({ id: "b" })];
    expect(validateAdBannerDesigns(designs)).toEqual([]);
  });

  it("flags more than VD_AD_BANNER_MAX_PER_SERIES designs as an error", () => {
    const designs = Array.from(
      { length: VD_AD_BANNER_MAX_PER_SERIES + 1 },
      (_, i) => baseDesign({ id: `banner-${i}` })
    );
    const issues = validateAdBannerDesigns(designs);
    expect(issues).toContainEqual(
      expect.objectContaining({
        code: "VD_AD_BANNER_TOO_MANY",
        severity: "error",
      })
    );
  });

  it("does not flag exactly VD_AD_BANNER_MAX_PER_SERIES designs", () => {
    const designs = Array.from(
      { length: VD_AD_BANNER_MAX_PER_SERIES },
      (_, i) => baseDesign({ id: `banner-${i}` })
    );
    expect(
      validateAdBannerDesigns(designs).some(
        i => i.code === "VD_AD_BANNER_TOO_MANY"
      )
    ).toBe(false);
  });

  it("flags duplicate ids as an error", () => {
    const designs = [baseDesign({ id: "dup" }), baseDesign({ id: "dup" })];
    const issues = validateAdBannerDesigns(designs);
    expect(issues).toContainEqual(
      expect.objectContaining({
        code: "VD_AD_BANNER_DUPLICATE_ID",
        severity: "error",
        bannerId: "dup",
      })
    );
  });

  it("warns (not errors) on copy fields longer than the recommended limit", () => {
    const tooLongHeadline = "x".repeat(VD_AD_BANNER_COPY_LIMITS.headline + 1);
    const issues = validateAdBannerDesigns([
      baseDesign({ copy: { headline: tooLongHeadline } }),
    ]);
    expect(issues).toContainEqual(
      expect.objectContaining({
        code: "VD_AD_BANNER_COPY_TOO_LONG",
        severity: "warning",
        field: "headline",
      })
    );
  });

  it("does not check copy length for entire-clip designs any differently than window ones", () => {
    const okHeadline = "x".repeat(VD_AD_BANNER_COPY_LIMITS.headline);
    const issues = validateAdBannerDesigns([
      baseDesign({ copy: { headline: okHeadline } }),
    ]);
    expect(issues).toEqual([]);
  });

  it("errors on invalid window startSec (missing, negative, non-finite)", () => {
    const missing = validateAdBannerDesigns([
      baseDesign({ defaultTiming: { mode: "window", durationSec: 3 } }),
    ]);
    expect(missing).toContainEqual(
      expect.objectContaining({ code: "VD_AD_BANNER_INVALID_TIMING_START" })
    );

    const negative = validateAdBannerDesigns([
      baseDesign({
        defaultTiming: { mode: "window", startSec: -1, durationSec: 3 },
      }),
    ]);
    expect(negative).toContainEqual(
      expect.objectContaining({ code: "VD_AD_BANNER_INVALID_TIMING_START" })
    );
  });

  it("errors on invalid window durationSec (missing, zero, negative)", () => {
    const missing = validateAdBannerDesigns([
      baseDesign({ defaultTiming: { mode: "window", startSec: 0 } }),
    ]);
    expect(missing).toContainEqual(
      expect.objectContaining({ code: "VD_AD_BANNER_INVALID_TIMING_DURATION" })
    );

    const zero = validateAdBannerDesigns([
      baseDesign({
        defaultTiming: { mode: "window", startSec: 0, durationSec: 0 },
      }),
    ]);
    expect(zero).toContainEqual(
      expect.objectContaining({ code: "VD_AD_BANNER_INVALID_TIMING_DURATION" })
    );
  });

  it("accepts a valid window timing with no timing issues", () => {
    const issues = validateAdBannerDesigns([
      baseDesign({
        defaultTiming: { mode: "window", startSec: 0, durationSec: 3 },
      }),
    ]);
    expect(
      issues.filter(i => i.code.startsWith("VD_AD_BANNER_INVALID_TIMING"))
    ).toEqual([]);
  });

  it("never checks startSec/durationSec for entire-mode designs", () => {
    const issues = validateAdBannerDesigns([
      baseDesign({ defaultTiming: { mode: "entire" } }),
    ]);
    expect(issues).toEqual([]);
  });
});
