/**
 * Feature 136 (Marketplace Auto Review: Sequential Shot Storyboard) — section
 * 02 §4.2. Fixture-based tests for the sequential-mode reference resolver,
 * using `...ForTest` exports with hand-built `RunMetadata`/`AutoReviewPlan`
 * fixtures. Fixture style (basePlan / readyProductReferenceAssetPack /
 * readyCharacterIdentityAssetPack / readyEnvironmentReferenceAssetPack)
 * cloned verbatim from `marketplaceAutoReviewService.test.ts`, which is the
 * source of truth for the shot/plan/pack fixture shapes.
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("../../db", () => ({
  getDb: vi.fn(async () => null),
}));

import {
  approvedProductReferenceUrlsForTest,
  approvedSequentialProductReferenceUrlsForTest,
  enforceSequentialReferenceIndexMappingForTest,
  getSequentialReferenceImageModelCapForTest,
  resolveSequentialReferenceAttachmentPlanForTest,
} from "../marketplaceAutoReviewService";
import { findReferenceIndexMappingMismatches, type ReferenceIndexEntry } from "../../../shared/marketplaceCapture/referenceIndexMap";

const basePlan = {
  conceptId: "concept-1",
  title: "รีวิวสินค้า",
  productTruth: {
    productId: "mp_1",
    productName: "Greenforst โต๊ะวางของข้างเตียง",
    brand: "Greenforst",
    platform: "shopee",
    externalProductId: "2162",
    externalShopId: "seller-1",
    productCategory: "furniture",
    categoryText: "เฟอร์นิเจอร์",
    categoryPath: ["บ้านและไลฟ์สไตล์", "เฟอร์นิเจอร์"],
    sourceUrl: "https://example.com/product",
    affiliateUrl: null,
    shopName: null,
    price: null,
    rating: null,
    sold: null,
    reviews: null,
    description: "",
    specs: {},
    imageUrls: ["https://example.com/product.png"],
  },
  storyboardGuide: "Shot-by-shot storyboard guide",
  voiceoverScript: "VOICEOVER SCRIPT BY SHOT",
  productDetail:
    "PRODUCT FACTS LOCK: Greenforst โต๊ะวางของข้างเตียง. Do not alter shape, material, or shelf count.",
  shots: [],
} as any;

const readyProductReferenceAssetPack = {
  status: "ready",
  providerUsePolicy: "allowed",
  assetPackId: "product-pack-1",
  productId: "mp_1",
  selectedProductImageUrl: "https://example.com/product.png",
  selectedSource: "user_selected",
  primaryRef: "product-image:1:selected",
  supportingRefs: [],
  providerReferenceUrls: ["https://example.com/product.png"],
  sourceMetadata: {
    role: "product",
    source: "marketplace_product_image",
    uploadKey: "products/img_1.png",
    hash: "producthash",
    id: "img_1",
    verifiedProviderEvidence: {
      status: "verified",
      verifiedBy: "test",
      evidenceRef: "stored-product-image:1:test",
    },
  },
  auditRefs: ["product-image:1:selected", "product-image-sha256:product"],
  rejectedRefs: [],
  qaRefs: ["product-reference-qa:main"],
  requiredUserAction: null,
};

const readyCharacterIdentityAssetPack = {
  status: "ready",
  assetPackId: "character-pack-1",
  sourceKind: "uploaded_reference",
  referenceImageRefs: ["character-reference:abc"],
  referenceImageUrls: ["https://cdn.example.test/person.png"],
  sourceMetadata: {
    role: "character",
    source: "user_upload",
    uploadKey: "anchors/person.png",
    hash: "personhash",
    fileEvidence: { fileName: "person.png", fileType: "image/png" },
    verifiedProviderEvidence: {
      status: "verified",
      verifiedBy: "test",
      evidenceRef: "verified-upload-reference:character:test",
    },
  },
  auditRefs: ["character-reference:abc", "character-image-sha256:person"],
  consentRefs: ["character-consent:mar_1:user_supplied_reference"],
  allowedFaceUsage: "recurring",
  allowedVoiceUsage: "tts",
  continuityDescriptors: ["same approved presenter identity"],
  blockedRefs: [],
};

const readyEnvironmentReferenceAssetPack = {
  status: "ready",
  assetPackId: "environment-pack-1",
  sourceKind: "uploaded_reference",
  referenceImageRefs: ["environment-reference:abc"],
  referenceImageUrls: ["https://cdn.example.test/place.png"],
  sourceMetadata: {
    role: "environment",
    source: "user_upload",
    uploadKey: "anchors/place.png",
    hash: "placehash",
    fileEvidence: { fileName: "place.png", fileType: "image/png" },
    verifiedProviderEvidence: {
      status: "verified",
      verifiedBy: "test",
      evidenceRef: "verified-upload-reference:environment:test",
    },
  },
  auditRefs: ["environment-reference:abc", "environment-image-sha256:place"],
  providerUsePolicy: "style_layout_lighting_anchor",
  continuityDescriptors: ["same approved room lighting"],
  blockedRefs: [],
};

function angleEntry(overrides: Record<string, unknown> = {}) {
  return {
    url: "https://cdn.example.test/angle-default.png",
    ref: "product-image:angle-default",
    hash: "angledefaulthash",
    storageKey: null,
    source: "marketplace_product_image",
    angleLabel: "back",
    evidenceOnly: false,
    ...overrides,
  };
}

const guardianRequiredPolicy = {
  sequentialStoryboard: {
    childSubjectPolicy: { productChildRelated: true, childDepictionPlanned: true },
  },
};

describe("resolveSequentialReferenceAttachmentPlan / approvedSequentialProductReferenceUrls", () => {
  it("orders primary first, angles in user order, and dedupes by hash first then by resolved URL", () => {
    const metadata = {
      productReferenceAssetPack: readyProductReferenceAssetPack,
      productAngleReferenceAssetPack: {
        entries: [
          angleEntry({
            url: "https://cdn.example.test/angle-back.png",
            ref: "angle-1",
            hash: "anglehash1",
            angleLabel: "back",
          }),
          angleEntry({
            // dropped: hash equals the primary's hash ("producthash")
            url: "https://cdn.example.test/angle-front-different.png",
            ref: "angle-2",
            hash: "producthash",
            angleLabel: "front",
          }),
          angleEntry({
            // dropped: URL repeats angle-1's resolved URL, despite a different hash
            url: "https://cdn.example.test/angle-back.png",
            ref: "angle-3",
            hash: "anglehash3",
            angleLabel: "side",
          }),
        ],
      },
    };

    const urls = approvedSequentialProductReferenceUrlsForTest({
      metadata: metadata as any,
      plan: basePlan,
      modelCap: 10,
    });

    expect(urls).toEqual([
      "https://example.com/product.png",
      "https://cdn.example.test/angle-back.png",
    ]);
  });

  it("reserves primary + required guardian + present environment ahead of angles, trimming surplus angles from the end", () => {
    const metadata = {
      productReferenceAssetPack: readyProductReferenceAssetPack,
      characterIdentityAssetPack: readyCharacterIdentityAssetPack,
      environmentReferenceAssetPack: readyEnvironmentReferenceAssetPack,
      ...guardianRequiredPolicy,
      productAngleReferenceAssetPack: {
        entries: [
          angleEntry({ url: "https://cdn.example.test/angle-1.png", ref: "angle-1", hash: "h1", angleLabel: "back" }),
          angleEntry({ url: "https://cdn.example.test/angle-2.png", ref: "angle-2", hash: "h2", angleLabel: "side" }),
          angleEntry({ url: "https://cdn.example.test/angle-3.png", ref: "angle-3", hash: "h3", angleLabel: "top" }),
          angleEntry({ url: "https://cdn.example.test/angle-4.png", ref: "angle-4", hash: "h4", angleLabel: "detail" }),
        ],
      },
    };

    const plan = resolveSequentialReferenceAttachmentPlanForTest({
      metadata: metadata as any,
      plan: basePlan,
      modelCap: 5,
    });

    expect(plan.providerReferenceUrls).toEqual([
      "https://example.com/product.png",
      "https://cdn.example.test/angle-1.png",
      "https://cdn.example.test/angle-2.png",
      "https://cdn.example.test/person.png",
      "https://cdn.example.test/place.png",
    ]);
    expect(plan.trimmedAngles).toEqual([
      { ref: "angle-3", angleLabel: "top" },
      { ref: "angle-4", angleLabel: "detail" },
    ]);
    expect(plan.attachedAngleCount).toBe(2);
    expect(
      plan.storedManifest.map(entry => ({ index: entry.index, role: entry.role }))
    ).toEqual([
      { index: 1, role: "primary_product" },
      { index: 2, role: "product_angle" },
      { index: 3, role: "product_angle" },
      { index: 4, role: "character" },
      { index: 5, role: "environment" },
    ]);
  });

  it("fails closed with PRECONDITION_FAILED before any credit path when required slots exceed the model cap", () => {
    const guardianRequiredMetadata = {
      productReferenceAssetPack: readyProductReferenceAssetPack,
      characterIdentityAssetPack: readyCharacterIdentityAssetPack,
      ...guardianRequiredPolicy,
    };

    expect(() =>
      resolveSequentialReferenceAttachmentPlanForTest({
        metadata: guardianRequiredMetadata as any,
        plan: basePlan,
        modelCap: 1,
      })
    ).toThrow(expect.objectContaining({ code: "PRECONDITION_FAILED" }));

    expect(() =>
      resolveSequentialReferenceAttachmentPlanForTest({
        metadata: { productReferenceAssetPack: readyProductReferenceAssetPack } as any,
        plan: basePlan,
        modelCap: 0,
      })
    ).toThrow(expect.objectContaining({ code: "PRECONDITION_FAILED" }));
  });

  it("does not throw for a present-but-not-required guardian that cannot fit — it is simply not attached", () => {
    const metadata = {
      productReferenceAssetPack: readyProductReferenceAssetPack,
      characterIdentityAssetPack: readyCharacterIdentityAssetPack,
      // no sequentialStoryboard.childSubjectPolicy — guardian not required
    };

    const plan = resolveSequentialReferenceAttachmentPlanForTest({
      metadata: metadata as any,
      plan: basePlan,
      modelCap: 1,
    });

    expect(plan.providerReferenceUrls).toEqual(["https://example.com/product.png"]);
  });

  it("excludes evidence-only (package/parts_diagram) entries from the provider payload but keeps them in skillVisionUrls and storedManifest", () => {
    const metadata = {
      productReferenceAssetPack: readyProductReferenceAssetPack,
      productAngleReferenceAssetPack: {
        entries: [
          angleEntry({ url: "https://cdn.example.test/angle-back.png", ref: "angle-1", hash: "h1", angleLabel: "back" }),
          angleEntry({
            url: "https://cdn.example.test/package.png",
            ref: "angle-package",
            hash: "hpackage",
            angleLabel: "package",
            evidenceOnly: true,
          }),
          angleEntry({
            url: "https://cdn.example.test/parts.png",
            ref: "angle-parts",
            hash: "hparts",
            angleLabel: "parts_diagram",
            evidenceOnly: true,
          }),
        ],
      },
    };

    const plan = resolveSequentialReferenceAttachmentPlanForTest({
      metadata: metadata as any,
      plan: basePlan,
      modelCap: 5,
    });

    expect(plan.providerReferenceUrls).toEqual([
      "https://example.com/product.png",
      "https://cdn.example.test/angle-back.png",
    ]);
    expect(
      plan.providerManifest.some(entry => entry.url === "https://cdn.example.test/package.png")
    ).toBe(false);
    expect(
      plan.providerManifest.some(entry => entry.url === "https://cdn.example.test/parts.png")
    ).toBe(false);
    expect(plan.skillVisionUrls).toEqual(
      expect.arrayContaining([
        "https://cdn.example.test/package.png",
        "https://cdn.example.test/parts.png",
      ])
    );
    const evidenceEntries = plan.storedManifest.filter(entry => entry.evidenceOnly === true);
    expect(evidenceEntries).toEqual([
      {
        index: 3,
        role: "product_angle",
        angleLabel: "package",
        url: "https://cdn.example.test/package.png",
        evidenceOnly: true,
      },
      {
        index: 4,
        role: "product_angle",
        angleLabel: "parts_diagram",
        url: "https://cdn.example.test/parts.png",
        evidenceOnly: true,
      },
    ]);
  });

  it("drops an angle whose URL cannot resolve (relative path, no publicUrl) and keeps the run going", () => {
    const metadata = {
      productReferenceAssetPack: readyProductReferenceAssetPack,
      productAngleReferenceAssetPack: {
        entries: [
          angleEntry({ url: "/uploads/angle-relative.png", ref: "angle-unresolvable", hash: "hunresolvable" }),
        ],
      },
    };

    const plan = resolveSequentialReferenceAttachmentPlanForTest({
      metadata: metadata as any,
      plan: basePlan,
      modelCap: 5,
      // publicUrl intentionally omitted
    });

    expect(plan.providerReferenceUrls).toEqual(["https://example.com/product.png"]);
  });

  it("keeps the 3x3 single-anchor rule byte-identical (guards against accidental relaxation)", () => {
    expect(() =>
      approvedProductReferenceUrlsForTest({
        metadata: {
          productReferenceAssetPack: {
            ...readyProductReferenceAssetPack,
            supportingRefs: ["https://cdn.example.test/extra.png"],
          },
        } as any,
        plan: basePlan,
      })
    ).toThrow(/supporting product references are not allowed/);

    expect(() =>
      approvedProductReferenceUrlsForTest({
        metadata: {
          productReferenceAssetPack: {
            ...readyProductReferenceAssetPack,
            providerReferenceUrls: [
              readyProductReferenceAssetPack.selectedProductImageUrl,
              "https://cdn.example.test/extra.png",
            ],
          },
        } as any,
        plan: basePlan,
      })
    ).toThrow(/must contain only the selected product image URL/);
  });
});

describe("getSequentialReferenceImageModelCap", () => {
  it("defaults to 5 for an unrecognized model id", () => {
    expect(getSequentialReferenceImageModelCapForTest("totally-unknown-model-id")).toBe(5);
  });

  it("reads google-banana-2 as 14 (kie.ai nano-banana-2 input-image limit)", () => {
    // Multi-view fix (planning/marketplace-multi-product-reference-images):
    // the resolver reads getModelById (DB-merged; static fallback in this
    // DB-less test env). The static registry entry now carries
    // configJson.maxReferenceImages = 14 — matching the DB row and the seed —
    // so the plan-time cap and the dispatch-time trim agree at 14 instead of
    // silently degrading to the ?? 5 fallback.
    expect(getSequentialReferenceImageModelCapForTest("google-banana-2")).toBe(14);
  });
});

describe("enforceSequentialReferenceIndexMapping", () => {
  const manifest: ReferenceIndexEntry[] = [
    { index: 1, role: "primary_product" },
    { index: 2, role: "character" },
  ];

  it("skips the retry when the initial pack is already clean", async () => {
    const retry = vi.fn();
    const initial = { shots: [{ shotId: 1, prompt: "@Image1 = primary product identity." }] };

    const result = await enforceSequentialReferenceIndexMappingForTest({
      initial,
      getPrompts: (pack: typeof initial) => pack.shots.map(s => ({ shotId: s.shotId, prompt: s.prompt })),
      manifest,
      retry,
    });

    expect(result).toBe(initial);
    expect(retry).not.toHaveBeenCalled();
  });

  it("retries exactly once and returns the corrected pack when the retry fixes the mismatch", async () => {
    const initial = { shots: [{ shotId: 1, prompt: "@Image2 = product back angle." }] };
    const corrected = { shots: [{ shotId: 1, prompt: "@Image2 = guardian presenter." }] };
    const retry = vi.fn(async () => corrected);

    const result = await enforceSequentialReferenceIndexMappingForTest({
      initial,
      getPrompts: (pack: typeof initial) => pack.shots.map(s => ({ shotId: s.shotId, prompt: s.prompt })),
      manifest,
      retry,
    });

    expect(result).toBe(corrected);
    expect(retry).toHaveBeenCalledTimes(1);
    const [mismatches, directive] = retry.mock.calls[0];
    expect(mismatches).toEqual([
      {
        imageIndex: 2,
        claimedRole: "product_angle:back",
        expectedRole: "character",
        expectedAngleLabel: undefined,
      },
    ]);
    expect(directive).toContain("@Image2");
  });

  it("throws when the retry still leaves a mismatch", async () => {
    const initial = { shots: [{ shotId: 1, prompt: "@Image2 = product back angle." }] };
    const stillMismatched = { shots: [{ shotId: 1, prompt: "@Image2 = product side angle." }] };
    const retry = vi.fn(async () => stillMismatched);

    await expect(
      enforceSequentialReferenceIndexMappingForTest({
        initial,
        getPrompts: (pack: typeof initial) => pack.shots.map(s => ({ shotId: s.shotId, prompt: s.prompt })),
        manifest,
        retry,
      })
    ).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
    expect(retry).toHaveBeenCalledTimes(1);
  });
});

describe("submit-time re-validation catches manifest drift (contract pin — full wiring is section 06)", () => {
  it("a prompt authored against manifest A mismatches once re-validated against a live manifest B", () => {
    const manifestA: ReferenceIndexEntry[] = [
      { index: 1, role: "primary_product" },
      { index: 2, role: "product_angle", angleLabel: "back" },
      { index: 3, role: "environment" },
      { index: 4, role: "character" },
    ];
    const manifestB: ReferenceIndexEntry[] = [
      { index: 1, role: "primary_product" },
      { index: 2, role: "product_angle", angleLabel: "back" },
      { index: 3, role: "character" },
    ];
    const prompt = "@Image4 = guardian presenter.";

    expect(findReferenceIndexMappingMismatches(prompt, manifestA)).toEqual([]);
    expect(findReferenceIndexMappingMismatches(prompt, manifestB)).not.toEqual([]);
  });
});
