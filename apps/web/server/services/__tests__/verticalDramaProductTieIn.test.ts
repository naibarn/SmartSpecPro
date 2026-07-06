import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  planTieIn,
  screenClaims,
  evaluateFatigue,
  isDisclosureSeparateFromPrompt,
  approveTieIn,
  removeTieIn,
  canRunPaidGeneration,
  buildTieInProvenance,
  isRegulatedCategory,
  extractShotProductPlacements,
  tieInShotNumberSet,
  findPlacementForShot,
  appendProductPresenceDirective,
  mergeAndTrimReferenceImageUrls,
  resolveProductReferenceImageUrls,
  resolveMarketplaceCaptureProductImageUrls,
  mergeProductLockNegativePrompt,
  VD_PRODUCT_LOCK_INSTRUCTION,
  VD_PRODUCT_LOCK_VIDEO_INSTRUCTION,
  VD_PRODUCT_LOCK_NEGATIVE_TERMS,
  type PlanTieInInput,
} from "../verticalDramaProductTieIn";
import type { VerticalDramaProductTieInConfig } from "@shared/verticalDramaSeries";

function config(overrides: Partial<VerticalDramaProductTieInConfig> = {}): VerticalDramaProductTieInConfig {
  return {
    enabled: true,
    productName: "GlowCream",
    referenceAssetIds: ["asset-1"],
    productSource: "marketplace",
    disclosurePolicy: "caption_disclosure",
    regulatedCategory: "none",
    allowedStoryFunctions: ["daily_use"],
    forbiddenClaims: [],
    maxEpisodesWithTieInPerTenEpisodes: 3,
    requireHumanApproval: true,
    ...overrides,
  };
}

function planInput(overrides: Partial<PlanTieInInput> = {}): PlanTieInInput {
  return {
    config: config(),
    episodeNumber: 5,
    shotNumbers: [3, 4],
    storyFunction: "daily_use",
    ...overrides,
  };
}

describe("tie-in compliance", () => {
  it("blocks when the product unrealistically solves the main conflict", () => {
    const r = planTieIn(planInput({ resolvesMainConflict: true }));
    expect(r.blocked).toBe(true);
    expect(r.warnings.some((w) => w.code === "VD_TIE_IN_RESOLVES_MAIN_CONFLICT")).toBe(true);
  });

  it("requires an explicit story function", () => {
    const r = planTieIn(planInput({ storyFunction: "" }));
    expect(r.blocked).toBe(true);
    expect(r.warnings.some((w) => w.code === "VD_TIE_IN_MISSING_STORY_FUNCTION")).toBe(true);
  });

  it("blocks unsupported regulated (medical) claims", () => {
    const r = planTieIn(planInput({ config: config({ regulatedCategory: "medical" }), proposedClaims: ["clinically proven to cure acne"] }));
    expect(r.blocked).toBe(true);
    expect(r.usage.claimsReview.unsupportedClaimsDetected).toBe(true);
  });

  it("hard-blocks explicitly forbidden claims regardless of category", () => {
    const res = screenClaims(config({ forbiddenClaims: ["miracle"] }), ["a miracle serum"]);
    expect(res.hardBlock).toBe(true);
  });
});

describe("fatigue / diversity", () => {
  it("prevents repeated placement over the limit", () => {
    const history = Array.from({ length: 9 }, (_v, i) => ({ episodeNumber: i + 1, hadTieIn: true }));
    const f = evaluateFatigue(history, 3);
    expect(f.exceeded).toBe(true);
    const r = planTieIn(planInput({ placementHistory: history }));
    expect(r.warnings.some((w) => w.code === "VD_TIE_IN_PLACEMENT_FATIGUE")).toBe(true);
  });

  it("allows placement under the limit", () => {
    const history = [{ episodeNumber: 1, hadTieIn: true }];
    expect(evaluateFatigue(history, 3).exceeded).toBe(false);
  });
});

describe("disclosure separation", () => {
  it("stores disclosure text separate from the video prompt", () => {
    const r = planTieIn(planInput({ disclosureText: "Paid partnership" }));
    expect(r.usage.disclosureRequired).toBe(true);
    expect(r.usage.disclosureText).toBe("Paid partnership");
  });

  it("detects disclosure copy leaking into the prompt payload", () => {
    expect(isDisclosureSeparateFromPrompt({ prompt: "hero walks" }, "Paid partnership")).toBe(true);
    expect(isDisclosureSeparateFromPrompt({ prompt: "hero walks. Paid partnership" }, "Paid partnership")).toBe(false);
  });
});

describe("approval gate + provenance", () => {
  it("requires human approval before paid generation and records the approver", () => {
    const r = planTieIn(planInput());
    expect(r.requiresHumanApproval).toBe(true);
    expect(canRunPaidGeneration(r, r.usage)).toBe(false);
    const approved = approveTieIn(r.usage, "42");
    expect(approved.approvedByUserId).toBe("42");
    expect(canRunPaidGeneration(r, approved)).toBe(true);
  });

  it("regulated categories require manual review first", () => {
    const r = planTieIn(planInput({ config: config({ regulatedCategory: "beauty" }) }));
    expect(r.requiresRegulatedManualReview).toBe(true);
    expect(isRegulatedCategory("beauty")).toBe(true);
    expect(isRegulatedCategory("none")).toBe(false);
  });

  it("is removable and retains productSource provenance", () => {
    const r = planTieIn(planInput());
    const provenance = buildTieInProvenance(config(), r.usage);
    expect(provenance.productSource).toBe("marketplace");
    const removed = removeTieIn(r.usage);
    expect(removed.enabled).toBe(false);
    expect(removed.approvedByUserId).toBeUndefined();
  });
});

describe("extractShotProductPlacements", () => {
  it("returns [] for the disabled/no-product placeholder", () => {
    expect(extractShotProductPlacements({ tie_ins: [], note: "no product this episode" })).toEqual([]);
  });

  it("returns [] for missing/malformed input", () => {
    expect(extractShotProductPlacements(undefined)).toEqual([]);
    expect(extractShotProductPlacements(null)).toEqual([]);
    expect(extractShotProductPlacements({})).toEqual([]);
    expect(extractShotProductPlacements({ tie_ins: "not-an-array" })).toEqual([]);
  });

  it("normalizes a well-formed entry", () => {
    const placements = extractShotProductPlacements({
      tie_ins: [
        {
          shot_numbers: [3, 4],
          story_function: "daily_use",
          placement_style: "in-use moment",
          benefit_talking_point: "keeps her skin hydrated all day",
        },
      ],
    });
    expect(placements).toEqual([
      {
        shotNumbers: [3, 4],
        storyFunction: "daily_use",
        placementStyle: "in_use_moment",
        benefitTalkingPoint: "keeps her skin hydrated all day",
      },
    ]);
  });

  it("accepts a single shot_number field and dedupes/sorts shot numbers", () => {
    const placements = extractShotProductPlacements({
      tie_ins: [{ shot_number: 5, story_function: "status_symbol" }],
    });
    expect(placements[0].shotNumbers).toEqual([5]);

    const deduped = extractShotProductPlacements({
      tie_ins: [{ shot_numbers: [4, 2, 4, 2], story_function: "daily_use" }],
    });
    expect(deduped[0].shotNumbers).toEqual([2, 4]);
  });

  it("defaults placement_style to in_use_moment for unrecognized values", () => {
    const placements = extractShotProductPlacements({
      tie_ins: [{ shot_numbers: [1], story_function: "daily_use", placement_style: "weird_value" }],
    });
    expect(placements[0].placementStyle).toBe("in_use_moment");
  });

  it("skips entries missing a story_function (spec §13 mandatory field)", () => {
    const placements = extractShotProductPlacements({
      tie_ins: [
        { shot_numbers: [1], story_function: "" },
        { shot_numbers: [2] },
        { shot_numbers: [3], story_function: "daily_use" },
      ],
    });
    expect(placements).toHaveLength(1);
    expect(placements[0].shotNumbers).toEqual([3]);
  });

  it("skips entries with no valid shot numbers (out of 1-9 range or non-numeric)", () => {
    const placements = extractShotProductPlacements({
      tie_ins: [
        { shot_numbers: [0, 10, "x"], story_function: "daily_use" },
        { shot_numbers: [7], story_function: "daily_use" },
      ],
    });
    expect(placements).toHaveLength(1);
    expect(placements[0].shotNumbers).toEqual([7]);
  });

  it("never throws on malformed entries mixed with valid ones", () => {
    expect(() =>
      extractShotProductPlacements({
        tie_ins: [null, 42, "oops", { shot_numbers: [1], story_function: "daily_use" }],
      }),
    ).not.toThrow();
  });
});

describe("tieInShotNumberSet / findPlacementForShot", () => {
  const placements = extractShotProductPlacements({
    tie_ins: [
      { shot_numbers: [2, 3], story_function: "daily_use", placement_style: "hero_prop" },
      { shot_numbers: [7], story_function: "status_symbol", placement_style: "background" },
    ],
  });

  it("flattens every placed shot number into a Set", () => {
    expect(tieInShotNumberSet(placements)).toEqual(new Set([2, 3, 7]));
  });

  it("finds the placement covering a given shot", () => {
    expect(findPlacementForShot(placements, 3)?.placementStyle).toBe("hero_prop");
    expect(findPlacementForShot(placements, 7)?.placementStyle).toBe("background");
    expect(findPlacementForShot(placements, 5)).toBeUndefined();
  });
});

describe("appendProductPresenceDirective", () => {
  it("appends a natural, non-ad-poster placement direction", () => {
    const result = appendProductPresenceDirective("A woman sits at a cafe table.", "GlowCream", {
      shotNumbers: [1],
      storyFunction: "daily_use",
      placementStyle: "hero_prop",
    });
    expect(result).toContain("A woman sits at a cafe table.");
    expect(result).toContain("GlowCream");
    expect(result.toLowerCase()).toContain("hero prop");
    // The directive explicitly forbids an ad-poster look — the negative
    // instruction itself legitimately contains these words, so assert the
    // instruction is present rather than absent.
    expect(result).toMatch(/never as packaging art, a poster/i);
  });

  it("falls back to a generic product name when absent", () => {
    const result = appendProductPresenceDirective("A shot.", undefined, {
      shotNumbers: [1],
      storyFunction: "daily_use",
      placementStyle: "background",
    });
    expect(result).toContain("the tied-in product");
  });
});

describe("mergeAndTrimReferenceImageUrls", () => {
  it("merges character refs first, then product refs, deduping", () => {
    const { urls, trimmedCount } = mergeAndTrimReferenceImageUrls(
      ["char-1", "char-2"],
      ["product-1"],
      undefined,
    );
    expect(urls).toEqual(["char-1", "char-2", "product-1"]);
    expect(trimmedCount).toBe(0);
  });

  it("dedupes overlapping URLs", () => {
    const { urls } = mergeAndTrimReferenceImageUrls(["a", "b"], ["b", "c"], undefined);
    expect(urls).toEqual(["a", "b", "c"]);
  });

  it("trims from the end (product refs) when over maxReferenceImages, prioritizing character refs", () => {
    const { urls, trimmedCount } = mergeAndTrimReferenceImageUrls(
      ["char-1", "char-2", "char-3"],
      ["product-1", "product-2"],
      3,
    );
    expect(urls).toEqual(["char-1", "char-2", "char-3"]);
    expect(trimmedCount).toBe(2);
  });

  it("passes through unchanged when maxReferenceImages is 0/undefined", () => {
    const { urls, trimmedCount } = mergeAndTrimReferenceImageUrls(["a"], ["b"], 0);
    expect(urls).toEqual(["a", "b"]);
    expect(trimmedCount).toBe(0);
  });
});

describe("appendProductPresenceDirective — product lock", () => {
  it("appends VD_PRODUCT_LOCK_INSTRUCTION immediately after the placement directive", () => {
    const result = appendProductPresenceDirective("A woman sits at a cafe table.", "GlowCream", {
      shotNumbers: [1],
      storyFunction: "daily_use",
      placementStyle: "hero_prop",
    });
    expect(result).toContain(VD_PRODUCT_LOCK_INSTRUCTION);
    // The lock must come after the placement directive but the caller may
    // still append more decorative detail after this function returns — the
    // lock itself must never be the tail-most part of THIS function's output
    // relative to the placement sentence (i.e. it's early, not appended last
    // by some later, unrelated step).
    const placementIndex = result.indexOf("Product placement (natural, not an advertisement)");
    const lockIndex = result.indexOf(VD_PRODUCT_LOCK_INSTRUCTION);
    expect(placementIndex).toBeGreaterThanOrEqual(0);
    expect(lockIndex).toBeGreaterThan(placementIndex);
  });
});

describe("mergeProductLockNegativePrompt", () => {
  it("is a no-op when there are no product references", () => {
    expect(mergeProductLockNegativePrompt("blurry, low quality", false)).toBe("blurry, low quality");
    expect(mergeProductLockNegativePrompt(undefined, false)).toBeUndefined();
  });

  it("appends every lock negative term when product references are attached", () => {
    const merged = mergeProductLockNegativePrompt("blurry, low quality", true);
    expect(merged).toContain("blurry, low quality");
    for (const term of VD_PRODUCT_LOCK_NEGATIVE_TERMS) {
      expect(merged).toContain(term);
    }
  });

  it("returns just the lock terms when there was no existing negative prompt", () => {
    const merged = mergeProductLockNegativePrompt(undefined, true);
    for (const term of VD_PRODUCT_LOCK_NEGATIVE_TERMS) {
      expect(merged).toContain(term);
    }
  });

  it("treats a blank/whitespace-only existing negative prompt the same as absent", () => {
    const merged = mergeProductLockNegativePrompt("   ", true);
    expect(merged?.startsWith(" ")).toBe(false);
    for (const term of VD_PRODUCT_LOCK_NEGATIVE_TERMS) {
      expect(merged).toContain(term);
    }
  });
});

describe("VD_PRODUCT_LOCK_VIDEO_INSTRUCTION", () => {
  it("is present and mentions the product remaining unchanged in motion", () => {
    expect(VD_PRODUCT_LOCK_VIDEO_INSTRUCTION.toLowerCase()).toContain("remain visually unchanged");
    expect(VD_PRODUCT_LOCK_VIDEO_INSTRUCTION.toLowerCase()).toContain("motion");
  });
});

describe("resolveProductReferenceImageUrls", () => {
  it("returns [] when neither a capture nor a manual productImageUrl is set", () => {
    expect(resolveProductReferenceImageUrls({})).toEqual([]);
  });

  it("url-only: falls back to productImageUrl alone when there are no capture images", () => {
    const urls = resolveProductReferenceImageUrls({
      productImageUrl: "https://cdn.example.test/manual-product.png",
    });
    expect(urls).toEqual(["https://cdn.example.test/manual-product.png"]);
  });

  it("capture-only: uses the capture's selected images when no manual productImageUrl is set", () => {
    const urls = resolveProductReferenceImageUrls({
      captureSelectedImageUrls: ["https://cdn.example.test/hero.png", "https://cdn.example.test/detail.png"],
    });
    expect(urls).toEqual(["https://cdn.example.test/hero.png", "https://cdn.example.test/detail.png"]);
  });

  it("both: merges capture images first, then the manual productImageUrl, deduped", () => {
    const urls = resolveProductReferenceImageUrls({
      productImageUrl: "https://cdn.example.test/hero.png", // duplicate of a capture image
      captureSelectedImageUrls: [
        "https://cdn.example.test/hero.png",
        "https://cdn.example.test/detail.png",
      ],
    });
    expect(urls).toEqual([
      "https://cdn.example.test/hero.png",
      "https://cdn.example.test/detail.png",
    ]);
  });

  it("caps the resolved set at VD_PRODUCT_REFERENCE_IMAGE_CAP (3) before the character-ref merge step", () => {
    const urls = resolveProductReferenceImageUrls({
      productImageUrl: "https://cdn.example.test/manual.png",
      captureSelectedImageUrls: [
        "https://cdn.example.test/1.png",
        "https://cdn.example.test/2.png",
        "https://cdn.example.test/3.png",
        "https://cdn.example.test/4.png",
      ],
    });
    expect(urls).toHaveLength(3);
    expect(urls).toEqual([
      "https://cdn.example.test/1.png",
      "https://cdn.example.test/2.png",
      "https://cdn.example.test/3.png",
    ]);
  });

  it("ignores blank/non-string entries in captureSelectedImageUrls", () => {
    const urls = resolveProductReferenceImageUrls({
      captureSelectedImageUrls: ["", "   ", "https://cdn.example.test/ok.png"],
    });
    expect(urls).toEqual(["https://cdn.example.test/ok.png"]);
  });
});

describe("resolveMarketplaceCaptureProductImageUrls", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.doUnmock("../marketplaceInsightService");
  });

  it("returns [] immediately when no marketplaceCaptureId is given", async () => {
    const urls = await resolveMarketplaceCaptureProductImageUrls(undefined, { userId: 1 });
    expect(urls).toEqual([]);
  });

  it("resolves images from a synced storytelling_handoff insight when one exists", async () => {
    vi.doMock("../marketplaceInsightService", () => ({
      listMarketplaceInsightsByCapture: vi.fn().mockResolvedValue([
        {
          insightType: "storytelling_handoff",
          payloadJson: {
            selectedImages: [
              { url: "https://cdn.example.test/synced-1.png" },
              { url: "https://cdn.example.test/synced-2.png" },
            ],
          },
        },
      ]),
      buildBasicStorytellingHandoffFromCapture: vi.fn(),
    }));
    const { resolveMarketplaceCaptureProductImageUrls: resolveWithMock } = await import(
      "../verticalDramaProductTieIn"
    );
    const urls = await resolveWithMock("capture-1", { userId: 1, tenantId: "tenant-a" });
    expect(urls).toEqual([
      "https://cdn.example.test/synced-1.png",
      "https://cdn.example.test/synced-2.png",
    ]);
  });

  it("falls back to the basic on-the-fly handoff when no synced insight exists", async () => {
    vi.doMock("../marketplaceInsightService", () => ({
      listMarketplaceInsightsByCapture: vi.fn().mockResolvedValue([]),
      buildBasicStorytellingHandoffFromCapture: vi.fn().mockResolvedValue({
        selectedImages: [{ url: "https://cdn.example.test/basic-1.png" }],
      }),
    }));
    const { resolveMarketplaceCaptureProductImageUrls: resolveWithMock } = await import(
      "../verticalDramaProductTieIn"
    );
    const urls = await resolveWithMock("capture-2", { userId: 1 });
    expect(urls).toEqual(["https://cdn.example.test/basic-1.png"]);
  });

  it("gracefully returns [] when the capture read throws (missing / cross-tenant / inaccessible)", async () => {
    vi.doMock("../marketplaceInsightService", () => ({
      listMarketplaceInsightsByCapture: vi.fn().mockRejectedValue(new Error("capture_not_found")),
      buildBasicStorytellingHandoffFromCapture: vi.fn(),
    }));
    const { resolveMarketplaceCaptureProductImageUrls: resolveWithMock } = await import(
      "../verticalDramaProductTieIn"
    );
    const urls = await resolveWithMock("capture-cross-tenant", { userId: 1, tenantId: "tenant-a" });
    expect(urls).toEqual([]);
  });

  it("gracefully returns [] when the capture/insight has no selectable images", async () => {
    vi.doMock("../marketplaceInsightService", () => ({
      listMarketplaceInsightsByCapture: vi.fn().mockResolvedValue([]),
      buildBasicStorytellingHandoffFromCapture: vi.fn().mockResolvedValue({ selectedImages: [] }),
    }));
    const { resolveMarketplaceCaptureProductImageUrls: resolveWithMock } = await import(
      "../verticalDramaProductTieIn"
    );
    const urls = await resolveWithMock("capture-empty", { userId: 1 });
    expect(urls).toEqual([]);
  });
});
