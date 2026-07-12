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
  listAvailableProductReferenceImages,
  resolveFrameProductReferenceAssetIds,
  mergeProductLockNegativePrompt,
  sanitizeBrandMentionsInPrompt,
  VD_PRODUCT_LOCK_INSTRUCTION,
  VD_PRODUCT_LOCK_VIDEO_INSTRUCTION,
  VD_PRODUCT_LOCK_NEGATIVE_TERMS,
  buildTieInQualityReport,
  isSoftCtaStoryFunction,
  VD_TIE_IN_MAX_SPOKEN_MENTIONS,
  VD_TIE_IN_MAX_VISUAL_SHOTS,
  VERTICAL_DRAMA_AD_SPEAK_LEXICON,
  type PlanTieInInput,
  type BuildTieInQualityReportParams,
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
  it("appends a natural, non-ad-poster placement direction, brand-neutral by default", () => {
    const result = appendProductPresenceDirective("A woman sits at a cafe table.", "GlowCream", {
      shotNumbers: [1],
      storyFunction: "daily_use",
      placementStyle: "hero_prop",
    });
    expect(result).toContain("A woman sits at a cafe table.");
    // Brand-neutral by design (2026-07-06 Thai ad-compliance upgrade) — the
    // brand name must never appear in the outgoing directive text.
    expect(result).not.toContain("GlowCream");
    expect(result.toLowerCase()).toContain("hero prop");
    // The directive explicitly forbids an ad-poster look — the negative
    // instruction itself legitimately contains these words, so assert the
    // instruction is present rather than absent.
    expect(result).toMatch(/never as packaging art, a poster/i);
    expect(result).toMatch(/never render brand names, logos as text/i);
  });

  it("uses a category descriptor when provided instead of the brand name", () => {
    const result = appendProductPresenceDirective(
      "A shot.",
      "GlowCream",
      { shotNumbers: [1], storyFunction: "daily_use", placementStyle: "background" },
      "skincare bottle",
    );
    expect(result).toContain("the skincare bottle shown in the reference image");
    expect(result).not.toContain("GlowCream");
  });

  it("falls back to the generic reference-image descriptor when no category is given", () => {
    const result = appendProductPresenceDirective("A shot.", undefined, {
      shotNumbers: [1],
      storyFunction: "daily_use",
      placementStyle: "background",
    });
    expect(result).toContain("the product shown in the reference image");
  });

  it("sanitizes a brand name that already appears in the base image prompt", () => {
    const result = appendProductPresenceDirective("A woman holds GlowCream on the table.", "GlowCream", {
      shotNumbers: [1],
      storyFunction: "daily_use",
      placementStyle: "hero_prop",
    });
    expect(result).not.toContain("GlowCream");
    expect(result).toContain("the product shown in the reference image");
  });
});

describe("mergeAndTrimReferenceImageUrls", () => {
  it("merges character refs first, then product refs, deduping (no location refs)", () => {
    const { urls, trimmedCount } = mergeAndTrimReferenceImageUrls(
      ["char-1", "char-2"],
      [],
      ["product-1"],
      undefined,
    );
    expect(urls).toEqual(["char-1", "char-2", "product-1"]);
    expect(trimmedCount).toBe(0);
  });

  it("dedupes overlapping URLs", () => {
    const { urls } = mergeAndTrimReferenceImageUrls(["a", "b"], [], ["b", "c"], undefined);
    expect(urls).toEqual(["a", "b", "c"]);
  });

  it("trims from the end (product refs) when over maxReferenceImages, prioritizing character refs", () => {
    const { urls, trimmedCount } = mergeAndTrimReferenceImageUrls(
      ["char-1", "char-2", "char-3"],
      [],
      ["product-1", "product-2"],
      3,
    );
    expect(urls).toEqual(["char-1", "char-2", "char-3"]);
    expect(trimmedCount).toBe(2);
  });

  it("passes through unchanged when maxReferenceImages is 0/undefined", () => {
    const { urls, trimmedCount } = mergeAndTrimReferenceImageUrls(["a"], [], ["b"], 0);
    expect(urls).toEqual(["a", "b"]);
    expect(trimmedCount).toBe(0);
  });

  /* ---------------------------------------------------------------------- */
  /* 3-source priority ordering (Phase 2 of                                  */
  /* `planning/polished-toasting-gadget.md` — location visual bible):        */
  /* character (highest) -> location -> product (lowest, trimmed first).     */
  /* ---------------------------------------------------------------------- */

  it("merges character, location, then product refs in that priority order", () => {
    const { urls, trimmedCount } = mergeAndTrimReferenceImageUrls(
      ["char-1"],
      ["loc-1"],
      ["product-1"],
      undefined,
    );
    expect(urls).toEqual(["char-1", "loc-1", "product-1"]);
    expect(trimmedCount).toBe(0);
  });

  it("trims product refs before ever trimming the location ref", () => {
    const { urls, trimmedCount } = mergeAndTrimReferenceImageUrls(
      ["char-1"],
      ["loc-1"],
      ["product-1", "product-2"],
      2,
    );
    expect(urls).toEqual(["char-1", "loc-1"]);
    expect(trimmedCount).toBe(2);
  });

  it("trims the location ref (once product refs are already gone) before ever trimming a character ref", () => {
    const { urls, trimmedCount } = mergeAndTrimReferenceImageUrls(
      ["char-1", "char-2"],
      ["loc-1"],
      ["product-1"],
      2,
    );
    expect(urls).toEqual(["char-1", "char-2"]);
    expect(trimmedCount).toBe(2);
  });

  it("dedupes across all three sources", () => {
    const { urls } = mergeAndTrimReferenceImageUrls(["a"], ["a", "b"], ["b", "c"], undefined);
    expect(urls).toEqual(["a", "b", "c"]);
  });

  it("a shot with no location (empty locationRefUrls) behaves byte-identical to the pre-Phase-2 2-source shape", () => {
    const { urls, trimmedCount } = mergeAndTrimReferenceImageUrls(
      ["char-1", "char-2"],
      [],
      ["product-1", "product-2", "product-3"],
      3,
    );
    expect(urls).toEqual(["char-1", "char-2", "product-1"]);
    expect(trimmedCount).toBe(2);
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

describe("listAvailableProductReferenceImages", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.doUnmock("../marketplaceInsightService");
  });

  it("returns only the direct URL when no capture is linked", async () => {
    const images = await listAvailableProductReferenceImages({
      productImageUrl: "https://cdn.example.test/direct.png",
      auth: { userId: 1 },
    });
    expect(images).toEqual([{ url: "https://cdn.example.test/direct.png", source: "direct" }]);
  });

  it("returns [] when neither a capture nor a direct URL is set", async () => {
    const images = await listAvailableProductReferenceImages({ auth: { userId: 1 } });
    expect(images).toEqual([]);
  });

  it("unions the FULL capture image set (not capped at 3) with the direct URL, capture images first", async () => {
    vi.doMock("../marketplaceInsightService", () => ({
      listMarketplaceInsightsByCapture: vi.fn().mockResolvedValue([
        {
          insightType: "storytelling_handoff",
          payloadJson: {
            selectedImages: [
              { url: "https://cdn.example.test/1.png", role: "hero" },
              { url: "https://cdn.example.test/2.png", role: "detail" },
              { url: "https://cdn.example.test/3.png", role: "detail" },
              { url: "https://cdn.example.test/4.png", role: "detail" },
              { url: "https://cdn.example.test/5.png", role: "detail" },
            ],
          },
        },
      ]),
      buildBasicStorytellingHandoffFromCapture: vi.fn(),
    }));
    const { listAvailableProductReferenceImages: listWithMock } = await import(
      "../verticalDramaProductTieIn"
    );
    const images = await listWithMock({
      productImageUrl: "https://cdn.example.test/direct.png",
      marketplaceCaptureId: "capture-1",
      auth: { userId: 1, tenantId: "tenant-a" },
    });
    // All 5 capture images (well beyond the generation-time cap of 3) plus the direct URL.
    expect(images).toHaveLength(6);
    expect(images.slice(0, 5).every((img) => img.source === "capture")).toBe(true);
    expect(images[5]).toEqual({ url: "https://cdn.example.test/direct.png", source: "direct" });
  });

  it("dedupes when the direct URL also appears in the capture image set", async () => {
    vi.doMock("../marketplaceInsightService", () => ({
      listMarketplaceInsightsByCapture: vi.fn().mockResolvedValue([
        {
          insightType: "storytelling_handoff",
          payloadJson: { selectedImages: [{ url: "https://cdn.example.test/same.png" }] },
        },
      ]),
      buildBasicStorytellingHandoffFromCapture: vi.fn(),
    }));
    const { listAvailableProductReferenceImages: listWithMock } = await import(
      "../verticalDramaProductTieIn"
    );
    const images = await listWithMock({
      productImageUrl: "https://cdn.example.test/same.png",
      marketplaceCaptureId: "capture-1",
      auth: { userId: 1 },
    });
    expect(images).toEqual([{ url: "https://cdn.example.test/same.png", source: "capture" }]);
  });

  it("gracefully degrades to the direct URL only when the capture read throws", async () => {
    vi.doMock("../marketplaceInsightService", () => ({
      listMarketplaceInsightsByCapture: vi.fn().mockRejectedValue(new Error("capture_not_found")),
      buildBasicStorytellingHandoffFromCapture: vi.fn(),
    }));
    const { listAvailableProductReferenceImages: listWithMock } = await import(
      "../verticalDramaProductTieIn"
    );
    const images = await listWithMock({
      productImageUrl: "https://cdn.example.test/direct.png",
      marketplaceCaptureId: "capture-cross-tenant",
      auth: { userId: 1, tenantId: "tenant-a" },
    });
    expect(images).toEqual([{ url: "https://cdn.example.test/direct.png", source: "direct" }]);
  });
});

describe("resolveFrameProductReferenceAssetIds — override semantics", () => {
  it("never-touched frame (productRefsCustomized absent): auto-merges the resolved product refs", () => {
    const result = resolveFrameProductReferenceAssetIds({
      existingProductReferenceAssetIds: [],
      productRefsCustomized: undefined,
      resolvedProductRefUrls: ["https://cdn.example.test/auto-1.png"],
    });
    expect(result).toEqual(["https://cdn.example.test/auto-1.png"]);
  });

  it("never-touched frame with prior auto-filled refs: merges + dedupes with the newly resolved refs", () => {
    const result = resolveFrameProductReferenceAssetIds({
      existingProductReferenceAssetIds: ["https://cdn.example.test/auto-1.png"],
      productRefsCustomized: false,
      resolvedProductRefUrls: ["https://cdn.example.test/auto-1.png", "https://cdn.example.test/auto-2.png"],
    });
    expect(result).toEqual([
      "https://cdn.example.test/auto-1.png",
      "https://cdn.example.test/auto-2.png",
    ]);
  });

  it("customized frame with a non-empty user selection: passes through as-is, ignores newly resolved refs", () => {
    const result = resolveFrameProductReferenceAssetIds({
      existingProductReferenceAssetIds: ["https://cdn.example.test/user-chosen.png"],
      productRefsCustomized: true,
      resolvedProductRefUrls: ["https://cdn.example.test/auto-1.png"],
    });
    expect(result).toEqual(["https://cdn.example.test/user-chosen.png"]);
  });

  it("customized frame with an EXPLICIT empty selection: stays empty, auto-resolution never refills it", () => {
    const result = resolveFrameProductReferenceAssetIds({
      existingProductReferenceAssetIds: [],
      productRefsCustomized: true,
      resolvedProductRefUrls: ["https://cdn.example.test/auto-1.png"],
    });
    expect(result).toEqual([]);
  });

  it("distinguishes 'customized to empty' from 'never touched' — same existing value, different productRefsCustomized, different outcome", () => {
    const neverTouched = resolveFrameProductReferenceAssetIds({
      existingProductReferenceAssetIds: [],
      productRefsCustomized: undefined,
      resolvedProductRefUrls: ["https://cdn.example.test/auto-1.png"],
    });
    const customizedEmpty = resolveFrameProductReferenceAssetIds({
      existingProductReferenceAssetIds: [],
      productRefsCustomized: true,
      resolvedProductRefUrls: ["https://cdn.example.test/auto-1.png"],
    });
    expect(neverTouched).toEqual(["https://cdn.example.test/auto-1.png"]);
    expect(customizedEmpty).toEqual([]);
  });
});

describe("sanitizeBrandMentionsInPrompt — brand/public-figure sanitize pass", () => {
  it("replaces every occurrence of the brand name with a generic descriptor", () => {
    const result = sanitizeBrandMentionsInPrompt(
      "She reaches for GlowCream on the shelf. GlowCream sparkles in the light.",
      ["GlowCream"],
    );
    expect(result).not.toContain("GlowCream");
    expect(result.match(/the product shown in the reference image/g)?.length).toBe(2);
  });

  it("is case-insensitive and word-boundary safe (does not corrupt unrelated words)", () => {
    const result = sanitizeBrandMentionsInPrompt(
      "the GLOWCREAM bottle sits near a glowcreamy light source",
      ["GlowCream"],
    );
    expect(result).toContain("the the product shown in the reference image bottle");
    // "glowcreamy" is not a whole-word match — must remain untouched.
    expect(result).toContain("glowcreamy");
  });

  it("uses the category descriptor when provided", () => {
    const result = sanitizeBrandMentionsInPrompt("GlowCream is visible on the table.", ["GlowCream"], "skincare bottle");
    expect(result).toContain("the skincare bottle shown in the reference image is visible on the table.");
  });

  it("is a no-op when no brand names are configured", () => {
    const prompt = "A clean, brand-free product shot.";
    expect(sanitizeBrandMentionsInPrompt(prompt, [undefined, null, ""])).toBe(prompt);
  });

  it("leaves a prompt with no brand mention untouched", () => {
    const prompt = "A woman sits at a cafe table with a generic bottle.";
    expect(sanitizeBrandMentionsInPrompt(prompt, ["GlowCream"])).toBe(prompt);
  });
});

describe("planTieIn — productCategory -> requiredDisclosure (Thai ad-compliance)", () => {
  it("surfaces the category-mandated disclosure line on the usage output", () => {
    const result = planTieIn(
      planInput({ config: config({ productCategory: "supplement" }) }),
    );
    expect(result.usage.requiredDisclosure).toBe("อ่านคำเตือนในฉลากก่อนบริโภค");
  });

  it("is undefined for a category with no mandated disclosure", () => {
    const result = planTieIn(
      planInput({ config: config({ productCategory: "general_goods" }) }),
    );
    expect(result.usage.requiredDisclosure).toBeUndefined();
  });

  it("is undefined when no productCategory is set (backward-compat)", () => {
    const result = planTieIn(planInput());
    expect(result.usage.requiredDisclosure).toBeUndefined();
  });

  it("hard-blocks + warns on a Thai-law prohibited claim even outside the generic regulated-claim list", () => {
    const result = planTieIn(
      planInput({ proposedClaims: ["ผลิตภัณฑ์นี้รักษาโรคได้หายขาด100%"] }),
    );
    expect(result.blocked).toBe(true);
    expect(
      result.warnings.some((w) => w.code === "VD_TIE_IN_THAI_AD_LAW_VIOLATION"),
    ).toBe(true);
  });
});

describe("isSoftCtaStoryFunction", () => {
  it("matches the exact enum literal", () => {
    expect(isSoftCtaStoryFunction("soft_cta")).toBe(true);
  });

  it("matches normalized prose variants", () => {
    expect(isSoftCtaStoryFunction("a soft CTA moment")).toBe(true);
    expect(isSoftCtaStoryFunction("soft-cta")).toBe(true);
  });

  it("does not match other story functions", () => {
    expect(isSoftCtaStoryFunction("daily_use")).toBe(false);
    expect(isSoftCtaStoryFunction(undefined)).toBe(false);
  });
});

describe("buildTieInQualityReport (spec §13.1)", () => {
  function scriptWithTieIns(
    tieIns: Array<{ shot_numbers: number[]; story_function: string; benefit_talking_point?: string }>,
  ): Record<string, unknown> {
    return { product_tie_in_plan: { tie_ins: tieIns } };
  }

  function reportParams(
    overrides: Partial<BuildTieInQualityReportParams> = {},
  ): BuildTieInQualityReportParams {
    return {
      script: scriptWithTieIns([
        { shot_numbers: [3], story_function: "daily_use", benefit_talking_point: "keeps skin hydrated" },
      ]),
      storyboard: { shots: [] },
      dialogueLinesByShot: new Map([[3, ["a normal line about her day"]]]),
      tieInConfig: config(),
      scorecardV2: { tie_in_naturalness: 5, tie_in_assessment: "feels earned" },
      fatigueContext: { exceeded: false },
      policy: { tieInMinNaturalnessScore: 70 },
      ...overrides,
    };
  }

  it("passes with a high qualitative score and zero deterministic violations", () => {
    const report = buildTieInQualityReport(reportParams());
    expect(report.naturalnessScore).toBe(100);
    expect(report.passed).toBe(true);
    expect(report.adSpeakViolations).toEqual([]);
    expect(report.claimViolations).toEqual([]);
    expect(report.disclosureSeparated).toBe(true);
    expect(report.fatigueOk).toBe(true);
  });

  it("folds the single shipped tie_in_naturalness dimension onto all three spec sub-dimensions (documented adaptation)", () => {
    const report = buildTieInQualityReport(reportParams({ scorecardV2: { tie_in_naturalness: 4 } }));
    expect(report.storyIntegration).toBe(4);
    expect(report.characterMotivation).toBe(4);
    expect(report.toneMatch).toBe(4);
    expect(report.naturalnessScore).toBe(80); // round(4/5*100)
  });

  it("defaults a null/absent tie_in_naturalness to the worst-case 0 (never silently passes)", () => {
    const report = buildTieInQualityReport(reportParams({ scorecardV2: { tie_in_naturalness: null } }));
    expect(report.naturalnessScore).toBe(0);
    expect(report.passed).toBe(false);
  });

  it("counts spoken product-name/benefit mentions only within tie-in-carrying shots", () => {
    const params = reportParams({
      tieInConfig: config({ productName: "GlowCream" }),
      dialogueLinesByShot: new Map([
        [3, ['I love using GlowCream every morning', "it keeps skin hydrated all day"]],
        [7, ["GlowCream is mentioned here too but shot 7 has no placement"]],
      ]),
    });
    const report = buildTieInQualityReport(params);
    // Both shot-3 lines mention the product/benefit; shot 7 is not a tie-in shot, so it's ignored.
    expect(report.spokenMentionCount).toBe(2);
  });

  it("flags a violation and caps the score at 69 when spokenMentionCount exceeds the max", () => {
    const lines = Array.from({ length: VD_TIE_IN_MAX_SPOKEN_MENTIONS + 1 }, () => "I love my GlowCream");
    const params = reportParams({
      tieInConfig: config({ productName: "GlowCream" }),
      dialogueLinesByShot: new Map([[3, lines]]),
      scorecardV2: { tie_in_naturalness: 5 },
    });
    const report = buildTieInQualityReport(params);
    expect(report.spokenMentionCount).toBeGreaterThan(VD_TIE_IN_MAX_SPOKEN_MENTIONS);
    expect(report.naturalnessScore).toBe(69);
    expect(report.passed).toBe(false);
  });

  it("flags a violation and caps the score at 69 when visualShotCount exceeds the max", () => {
    const params = reportParams({
      script: scriptWithTieIns([
        { shot_numbers: [1, 2, 3, 4], story_function: "daily_use" },
      ]),
      dialogueLinesByShot: new Map(),
      scorecardV2: { tie_in_naturalness: 5 },
    });
    const report = buildTieInQualityReport(params);
    expect(report.visualShotCount).toBe(4);
    expect(report.visualShotCount).toBeGreaterThan(VD_TIE_IN_MAX_VISUAL_SHOTS);
    expect(report.naturalnessScore).toBe(69);
    expect(report.passed).toBe(false);
  });

  it("flags an ad-speak lexicon hit outside a soft_cta shot", () => {
    const phrase = VERTICAL_DRAMA_AD_SPEAK_LEXICON[0];
    const params = reportParams({
      script: scriptWithTieIns([{ shot_numbers: [3], story_function: "daily_use" }]),
      dialogueLinesByShot: new Map([[3, [`this is the ${phrase} product around`]]]),
    });
    const report = buildTieInQualityReport(params);
    expect(report.adSpeakViolations.length).toBe(1);
    expect(report.naturalnessScore).toBe(69);
  });

  it("does NOT flag an ad-speak lexicon hit inside an explicit soft_cta shot", () => {
    const phrase = VERTICAL_DRAMA_AD_SPEAK_LEXICON[0];
    const params = reportParams({
      script: scriptWithTieIns([{ shot_numbers: [3], story_function: "soft_cta" }]),
      dialogueLinesByShot: new Map([[3, [`this is the ${phrase} product around`]]]),
    });
    const report = buildTieInQualityReport(params);
    expect(report.adSpeakViolations).toEqual([]);
    expect(report.naturalnessScore).toBe(100);
    expect(report.passed).toBe(true);
  });

  it("wires claimViolations from the existing screenClaims gate", () => {
    const params = reportParams({
      tieInConfig: config({ forbiddenClaims: ["miracle"] }),
      dialogueLinesByShot: new Map([[3, ["it's a miracle serum"]]]),
    });
    const report = buildTieInQualityReport(params);
    expect(report.claimViolations.length).toBeGreaterThan(0);
    expect(report.naturalnessScore).toBe(69);
    expect(report.passed).toBe(false);
  });

  it("flags disclosureSeparated: false when the category-mandated disclosure text leaks into the script/storyboard", () => {
    const params = reportParams({
      tieInConfig: config({ productCategory: "supplement" }),
      script: {
        ...scriptWithTieIns([{ shot_numbers: [3], story_function: "daily_use" }]),
        leaked_note: "อ่านคำเตือนในฉลากก่อนบริโภค",
      },
    });
    const report = buildTieInQualityReport(params);
    expect(report.disclosureSeparated).toBe(false);
    expect(report.naturalnessScore).toBe(69);
  });

  it("passes disclosureSeparated when the category has no mandated disclosure line", () => {
    const params = reportParams({ tieInConfig: config({ productCategory: "general_goods" }) });
    const report = buildTieInQualityReport(params);
    expect(report.disclosureSeparated).toBe(true);
  });

  it("flags fatigueOk: false and caps the score when the fatigue window is exceeded", () => {
    const params = reportParams({ fatigueContext: { exceeded: true } });
    const report = buildTieInQualityReport(params);
    expect(report.fatigueOk).toBe(false);
    expect(report.naturalnessScore).toBe(69);
    expect(report.passed).toBe(false);
  });

  it("requires the score to clear the policy floor even with zero deterministic violations", () => {
    const params = reportParams({
      scorecardV2: { tie_in_naturalness: 3 }, // round(3/5*100) = 60
      policy: { tieInMinNaturalnessScore: 70 },
    });
    const report = buildTieInQualityReport(params);
    expect(report.naturalnessScore).toBe(60);
    expect(report.passed).toBe(false);
  });

  it("respects a raised (regulated-category) policy floor", () => {
    const params = reportParams({
      scorecardV2: { tie_in_naturalness: 4 }, // round(4/5*100) = 80
      policy: { tieInMinNaturalnessScore: 85 },
    });
    const report = buildTieInQualityReport(params);
    expect(report.naturalnessScore).toBe(80);
    expect(report.passed).toBe(false);
  });

  it("returns zero deterministic violations and a null-safe report for an episode with no tie-in placements", () => {
    const params = reportParams({
      script: scriptWithTieIns([]),
      dialogueLinesByShot: new Map(),
    });
    const report = buildTieInQualityReport(params);
    expect(report.visualShotCount).toBe(0);
    expect(report.spokenMentionCount).toBe(0);
    expect(report.adSpeakViolations).toEqual([]);
  });
});
