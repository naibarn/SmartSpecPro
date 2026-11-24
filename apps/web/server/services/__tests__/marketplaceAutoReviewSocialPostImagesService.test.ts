import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  hasEnoughCredits: vi.fn(),
  deductCredits: vi.fn(),
  refundCredits: vi.fn(),
  resolveEnabledMediaModelSelection: vi.fn(),
  resolveAdBannerImageModelPricing: vi.fn(),
  dbSelect: vi.fn(),
  createInternalTokenFromAuth: vi.fn(),
  generateImageAsync: vi.fn(),
  getTask: vi.fn(),
  ensureMarketplaceAutoReviewTaskResultDurable: vi.fn(),
  generateMarketplaceSocialImagePrompt: vi.fn(),
}));

vi.mock("../creditService", () => ({
  hasEnoughCredits: mocks.hasEnoughCredits,
  deductCredits: mocks.deductCredits,
  refundCredits: mocks.refundCredits,
}));
vi.mock("../enabledMediaModelSelection", () => ({
  resolveEnabledMediaModelSelection: mocks.resolveEnabledMediaModelSelection,
}));
vi.mock("../verticalDramaAdBanner", () => ({
  resolveAdBannerImageModelPricing: mocks.resolveAdBannerImageModelPricing,
}));
vi.mock("../../db", () => ({
  db: { select: mocks.dbSelect },
}));
vi.mock("../../../drizzle/schema", () => ({
  mediaModels: {
    aspectRatios: "aspectRatios",
    configJson: "configJson",
    modelId: "modelId",
  },
}));
vi.mock("../../_core/tokens", () => ({
  createInternalTokenFromAuth: mocks.createInternalTokenFromAuth,
}));
vi.mock("../mediaGenerationService", () => ({
  mediaGenerationService: {
    generateImageAsync: mocks.generateImageAsync,
    getTask: mocks.getTask,
  },
}));
vi.mock("../marketplaceAutoReviewMediaAssetService", () => ({
  ensureMarketplaceAutoReviewTaskResultDurable:
    mocks.ensureMarketplaceAutoReviewTaskResultDurable,
}));
vi.mock("../marketplaceAutoReviewSocialImagePromptSkillRunner", () => ({
  generateMarketplaceSocialImagePrompt:
    mocks.generateMarketplaceSocialImagePrompt,
}));

import { generateMarketplaceSocialPostImage } from "../marketplaceAutoReviewSocialPostImagesService";

const params = {
  userId: 7,
  tenantId: "tenant-a",
  runId: "mar_run_1",
  batchId: "social-set-1",
  requestIdempotencyKey: "social-image-request-1",
  modelId: "image-model-a",
  aspectRatio: "4:5" as const,
  variant: "product_reference" as const,
  language: "th" as const,
  caption: "ครีมบำรุงผิวสำหรับทุกวัน",
  product: {
    productName: "Daily Cream",
    description: "Light moisturizer",
    specs: { size: "30 ml" },
  },
  source: {
    label: "Daily Cream main image",
    imageUrl: "https://media.example.test/product.jpg",
  },
};

describe("marketplace social post image generation billing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.hasEnoughCredits.mockResolvedValue(true);
    mocks.deductCredits.mockResolvedValue({});
    mocks.refundCredits.mockResolvedValue({});
    mocks.resolveEnabledMediaModelSelection.mockResolvedValue({
      ok: true,
      modelId: "image-model-a",
    });
    mocks.resolveAdBannerImageModelPricing.mockResolvedValue({
      modelId: "image-model-a",
      creditCost: 30,
      maxReferenceImages: 2,
      configJson: null,
    });
    mocks.dbSelect.mockReturnValue({
      from: () => ({
        where: () => ({
          limit: async () => [
            { aspectRatios: ["4:5", "9:16"], configJson: null },
          ],
        }),
      }),
    });
    mocks.createInternalTokenFromAuth.mockReturnValue("worker-media-token");
    mocks.generateImageAsync.mockResolvedValue({
      id: "media-task-1",
      mediaType: "image",
      status: "completed",
      resultUrl: "https://provider.example.test/generated.jpg",
    });
    mocks.getTask.mockResolvedValue({
      id: "media-task-1",
      mediaType: "image",
      status: "completed",
      resultUrl: "https://provider.example.test/generated.jpg",
    });
    mocks.ensureMarketplaceAutoReviewTaskResultDurable.mockResolvedValue({
      durableUrl: "/api/storage/files/marketplace-auto-review/generated.jpg",
      storageKey: "marketplace-auto-review/generated.jpg",
      task: { id: "media-task-1" },
    });
    mocks.generateMarketplaceSocialImagePrompt.mockResolvedValue({
      imagePrompt: "Portrait studio photograph of the referenced product.",
      negativePrompt: "added text, watermark",
      model: "vision-model-a",
      provider: "openrouter",
      creditsUsed: 12,
    });
  });

  it("reserves the chosen image model cost and sends one reference with the saved caption", async () => {
    const result = await generateMarketplaceSocialPostImage(params);

    expect(result).toMatchObject({
      imageStorageKey: "marketplace-auto-review/generated.jpg",
      modelId: "image-model-a",
      aspectRatio: "4:5",
      imageCreditsUsed: 30,
      promptCreditsUsed: 12,
    });
    expect(mocks.hasEnoughCredits).toHaveBeenCalledWith(7, 30);
    expect(mocks.deductCredits).toHaveBeenCalledWith(
      expect.objectContaining({
        amount: 30,
        tenantId: "tenant-a",
        sourceType: "media_image",
        idempotencyKey: expect.stringContaining(
          "marketplace-social-post-image:"
        ),
      })
    );
    expect(mocks.generateMarketplaceSocialImagePrompt).toHaveBeenCalledWith(
      expect.objectContaining({
        caption: params.caption,
        variant: "product_reference",
        source: params.source,
      })
    );
    expect(mocks.generateImageAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "image-model-a",
        strictModelSelection: true,
        numImages: 1,
        aspectRatio: "4:5",
        referenceImageUrls: [params.source.imageUrl],
        prompt: expect.stringContaining("Portrait studio photograph"),
        extraParams: expect.objectContaining({
          __auto_review_run_id: "mar_run_1",
          __unit_id: "social-post-social-set-1-product_reference",
        }),
      }),
      "worker-media-token"
    );
    expect(mocks.refundCredits).not.toHaveBeenCalled();
  });

  it("refunds the reserved image credits when the provider reports failure", async () => {
    mocks.generateImageAsync.mockResolvedValueOnce({
      id: "media-task-1",
      mediaType: "image",
      status: "failed",
      resultUrl: null,
    });

    await expect(
      generateMarketplaceSocialPostImage(params)
    ).rejects.toMatchObject({
      message: "MARKETPLACE_SOCIAL_POST_IMAGE_PROVIDER_FAILED",
      promptCreditsUsed: 12,
      imageCreditsUsed: 0,
    });
    expect(mocks.refundCredits).toHaveBeenCalledWith(
      expect.objectContaining({ amount: 30, sourceType: "media_image" })
    );
  });

  it("rejects a model without the requested portrait ratio before charging", async () => {
    mocks.dbSelect.mockReturnValue({
      from: () => ({
        where: () => ({
          limit: async () => [
            { aspectRatios: ["1:1", "16:9"], configJson: null },
          ],
        }),
      }),
    });

    await expect(generateMarketplaceSocialPostImage(params)).rejects.toThrow(
      "MARKETPLACE_SOCIAL_POST_IMAGE_ASPECT_RATIO_UNSUPPORTED"
    );
    expect(mocks.deductCredits).not.toHaveBeenCalled();
  });

  it("rejects image models with no declared portrait ratio", async () => {
    mocks.dbSelect.mockReturnValue({
      from: () => ({
        where: () => ({
          limit: async () => [{ aspectRatios: [], configJson: null }],
        }),
      }),
    });

    await expect(generateMarketplaceSocialPostImage(params)).rejects.toThrow(
      "MARKETPLACE_SOCIAL_POST_IMAGE_ASPECT_RATIO_UNSUPPORTED"
    );
    expect(mocks.deductCredits).not.toHaveBeenCalled();
  });

  it("rejects a disabled or substituted image model before charging", async () => {
    mocks.resolveEnabledMediaModelSelection.mockResolvedValueOnce({
      ok: true,
      modelId: "substitute-model",
    });

    await expect(generateMarketplaceSocialPostImage(params)).rejects.toThrow(
      "MARKETPLACE_SOCIAL_POST_IMAGE_MODEL_UNAVAILABLE"
    );
    expect(mocks.resolveEnabledMediaModelSelection).toHaveBeenCalledWith(
      expect.objectContaining({
        requestedModel: "image-model-a",
        allowSubstitution: false,
      })
    );
    expect(mocks.deductCredits).not.toHaveBeenCalled();
  });
});
