import { describe, expect, it, vi } from "vitest";

vi.mock("../../db", () => ({
  getDb: vi.fn(async () => null),
}));

vi.mock("../productReferenceStoryboardSkillRunner", async (importOriginal) => {
  const actual = await importOriginal<
    typeof import("../productReferenceStoryboardSkillRunner")
  >();
  return {
    ...actual,
    runProductReferenceStoryboardPromptSkill: vi
      .fn()
      .mockRejectedValue(
        new Error(
          "product-reference-storyboard LLM call failed after 3 attempt(s) " +
            "(3 vision model(s) + text-only fallback): No endpoints found that support image input",
        ),
      ),
  };
});

import { prepareMarketplaceAutoReviewImagePromptForSubmitForTest } from "../marketplaceAutoReviewService";

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

const storyboardGridUnit = {
  unitId: "storyboard-grid-image",
  role: "storyboard_grid",
} as any;

const emptyReferenceImageGroups = {
  product: [],
  character: [],
  environment: [],
  all: [],
};

describe("prepareMarketplaceAutoReviewImagePromptForSubmit — storyboard_grid degraded fallback (Layer 2)", () => {
  it("never throws and returns a usable prompt when the prompt-skill loop ultimately rejects", async () => {
    const result = await prepareMarketplaceAutoReviewImagePromptForSubmitForTest({
      tenantId: "tenant_1",
      auth: { userId: 42, tenantId: "tenant_1" } as any,
      runId: "run-1",
      plan: basePlan,
      unit: storyboardGridUnit,
      attempt: 1,
      overlayTextMode: "no_text",
      referenceImageGroups: emptyReferenceImageGroups,
      publicUrl: "https://smartaihub.app",
      metadata: null,
    });

    expect(typeof result.prompt).toBe("string");
    expect(result.prompt.length).toBeGreaterThan(0);
    expect(result.skillRun).toBeNull();
    expect(result.skillRuntime).toMatchObject({
      degradedFallback: "plan_prompt",
    });
    expect(result.skillRuntime?.degradedReason).toContain(
      "No endpoints found that support image input",
    );
  });

  it("marks the advisory preflight result with a storyboard_prompt_degraded_fallback warning without throwing even if preflight fails", async () => {
    const result = await prepareMarketplaceAutoReviewImagePromptForSubmitForTest({
      tenantId: "tenant_1",
      auth: { userId: 42, tenantId: "tenant_1" } as any,
      runId: "run-2",
      plan: basePlan,
      unit: storyboardGridUnit,
      attempt: 1,
      overlayTextMode: "no_text",
      referenceImageGroups: emptyReferenceImageGroups,
      publicUrl: "https://smartaihub.app",
      metadata: null,
    });

    // Advisory mode: whatever the computed preflight status is, the
    // function must still return (never throw), and the degraded warning
    // marker must be present so the UI can surface it.
    expect(["passed", "failed"]).toContain(result.preflight.status);
    expect(result.preflight.warnings).toContain(
      "storyboard_prompt_degraded_fallback",
    );
  });
});
