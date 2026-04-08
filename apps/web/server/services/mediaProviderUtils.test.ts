import { describe, expect, it } from "vitest";

import { calculateCreditCost } from "./pricingCalculator";
import { getStaticModelById } from "./modelRegistry";
import {
  buildWaveSpeedModelConfigJson,
  buildWaveSpeedModelSeeds,
  assertRelativeUploadMediaReferencePath,
  buildWaveSpeedLaunchModelConfigJson,
  buildWaveSpeedLaunchModelSeed,
  getWaveSpeedProviderAvailableModels,
  isReferenceImageRequiredFromConfig,
  normalizeMediaProviderName,
  normalizeRelativeMediaEndpointPath,
  normalizeWaveSpeedBaseUrl,
  sanitizeMediaModelConfigJson,
  WAVESPEED_LAUNCH_MODEL_ID,
  WAVESPEED_SEEDANCE_2_FAST_IMAGE_TO_VIDEO_MODEL_ID,
  WAVESPEED_SEEDANCE_2_TEXT_TO_VIDEO_MODEL_ID,
} from "./mediaProviderUtils";

describe("mediaProviderUtils", () => {
  it("normalizes WaveSpeed provider aliases without regressing existing providers", () => {
    expect(normalizeMediaProviderName("wavespeed_ai")).toBe("wavespeed_ai");
    expect(normalizeMediaProviderName("wavespeed-ai")).toBe("wavespeed_ai");
    expect(normalizeMediaProviderName("wavespeed ai")).toBe("wavespeed_ai");
    expect(normalizeMediaProviderName("wavespeedai")).toBe("wavespeed_ai");
    expect(normalizeMediaProviderName("kie.ai")).toBe("kie_ai");
  });

  it("normalizes both service-root and api-root WaveSpeed base URLs to a single api root", () => {
    expect(normalizeWaveSpeedBaseUrl("https://api.wavespeed.ai")).toBe("https://api.wavespeed.ai/api/v3");
    expect(normalizeWaveSpeedBaseUrl("https://api.wavespeed.ai/api/v3")).toBe("https://api.wavespeed.ai/api/v3");
    expect(normalizeWaveSpeedBaseUrl("https://proxy.example.com/wavespeed")).toBe("https://proxy.example.com/wavespeed/api/v3");
  });

  it("rejects unsafe absolute and traversal endpoint metadata", () => {
    expect(() => normalizeRelativeMediaEndpointPath("https://evil.example.com/submit")).toThrow(/relative/i);
    expect(() => normalizeRelativeMediaEndpointPath("//evil.example.com/submit")).toThrow(/relative/i);
    expect(() => normalizeRelativeMediaEndpointPath("/predictions/../result")).toThrow(/\.\./i);
    expect(() => normalizeRelativeMediaEndpointPath("/predictions/%2e%2e/result")).toThrow(/\.\./i);
    expect(() => normalizeRelativeMediaEndpointPath("%68%74%74%70%73%3A%2F%2Fevil.example.com/submit")).toThrow(/relative/i);
    expect(() => normalizeRelativeMediaEndpointPath("/predictions/{jobId}/result", { allowRequestIdPlaceholder: true })).toThrow(/placeholder/i);
  });

  it("only allows relative media asset paths under the public upload/storage routes", () => {
    expect(() => assertRelativeUploadMediaReferencePath("/uploads/reference.png")).not.toThrow();
    expect(() => assertRelativeUploadMediaReferencePath("/api/storage/files/uploads/reference.png")).not.toThrow();
    expect(() => assertRelativeUploadMediaReferencePath("/api/private.png")).toThrow(/\/uploads\/ or \/api\/storage\/files\//i);
    expect(() => assertRelativeUploadMediaReferencePath("/uploads/%2e%2e/private.png")).toThrow(/\.\./i);
    expect(() => assertRelativeUploadMediaReferencePath("/api/storage/files/%2e%2e/private.png")).toThrow(/\.\./i);
  });

  it("sanitizes persisted model config by keeping endpoints relative-only and canonicalizing provider names", () => {
    const sanitized = sanitizeMediaModelConfigJson({
      apiEndpoint: "wavespeed-ai/cinematic-video-generator",
      apiQueryEndpoint: "/predictions/{requestId}/result",
      apiConfig: {
        provider: "wavespeed-ai",
      },
    });

    expect(sanitized).toEqual({
      apiEndpoint: "/wavespeed-ai/cinematic-video-generator",
      apiQueryEndpoint: "/predictions/{requestId}/result",
      apiConfig: {
        provider: "wavespeed_ai",
      },
    });
  });

  it("builds the shared WaveSpeed launch model config with pricing and input caps", () => {
    const config = buildWaveSpeedLaunchModelConfigJson();

    expect(config).toMatchObject({
      apiPayloadFormat: "wavespeed",
      generateType: "text-to-video",
      providerModelId: WAVESPEED_LAUNCH_MODEL_ID,
      apiEndpoint: "/wavespeed-ai/cinematic-video-generator",
      apiQueryEndpoint: "/predictions/{requestId}/result",
      pricingFormula: "per_duration",
      nativeAudio: true,
      useSyncMode: false,
      maxReferenceImages: 4,
    });
    expect(config.pricingTiers).toEqual({
      "5s": 800,
      "10s": 1600,
      "15s": 2400,
    });
    expect(config.inputFields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: "image_urls",
          syncWith: "reference_images",
          maxItems: 4,
        }),
      ]),
    );
  });

  it("builds the WaveSpeed launch model seed with the expected DB metadata contract", () => {
    const seedModel = buildWaveSpeedLaunchModelSeed();

    expect(seedModel).toMatchObject({
      modelId: WAVESPEED_LAUNCH_MODEL_ID,
      provider: "wavespeed_ai",
      modelType: "video",
      creditCost: 800,
      durations: [5, 10, 15],
      aspectRatios: ["16:9", "9:16", "4:3", "3:4"],
      priority: 6,
      sortOrder: 60,
      isEnabled: true,
    });
    expect(seedModel.configJson).toMatchObject({
      apiPayloadFormat: "wavespeed",
      generateType: "text-to-video",
      nativeAudio: true,
      useSyncMode: false,
      pricingFormula: "per_duration",
    });
  });

  it("builds additive WaveSpeed Seedance 2.0 configs without changing the cinematic launch contract", () => {
    const standardText = buildWaveSpeedModelConfigJson(WAVESPEED_SEEDANCE_2_TEXT_TO_VIDEO_MODEL_ID);
    const fastImage = buildWaveSpeedModelConfigJson(WAVESPEED_SEEDANCE_2_FAST_IMAGE_TO_VIDEO_MODEL_ID);

    expect(standardText).toMatchObject({
      generateType: "text-to-video",
      providerModelId: WAVESPEED_SEEDANCE_2_TEXT_TO_VIDEO_MODEL_ID,
      apiEndpoint: "/bytedance/seedance-2.0/text-to-video",
      pricingFormula: "per_duration",
      maxReferenceImages: 4,
      requiresReferenceImages: false,
    });
    expect(fastImage).toMatchObject({
      generateType: "image-to-video",
      providerModelId: WAVESPEED_SEEDANCE_2_FAST_IMAGE_TO_VIDEO_MODEL_ID,
      apiEndpoint: "/bytedance/seedance-2.0-fast/image-to-video",
      maxReferenceImages: 4,
      requiresReferenceImages: true,
    });
    expect(isReferenceImageRequiredFromConfig(fastImage)).toBe(true);
    expect(fastImage.inputFields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: "image_urls",
          required: true,
          maxItems: 4,
        }),
      ]),
    );
  });

  it("exposes all WaveSpeed models for templates and seeds", () => {
    const seeds = buildWaveSpeedModelSeeds();
    const providerModels = getWaveSpeedProviderAvailableModels();

    expect(seeds).toHaveLength(5);
    expect(providerModels).toHaveLength(5);
    expect(seeds.map((seed) => seed.modelId)).toEqual(expect.arrayContaining([
      WAVESPEED_LAUNCH_MODEL_ID,
      WAVESPEED_SEEDANCE_2_TEXT_TO_VIDEO_MODEL_ID,
      WAVESPEED_SEEDANCE_2_FAST_IMAGE_TO_VIDEO_MODEL_ID,
    ]));
  });

  it("exposes the launch model through the static registry with tiered fallback pricing", () => {
    const model = getStaticModelById(WAVESPEED_LAUNCH_MODEL_ID);

    expect(model).toBeDefined();
    expect(model?.provider).toBe("wavespeed_ai");
    expect(model?.durations).toEqual([5, 10, 15]);
    expect(model?.aspectRatios).toEqual(["16:9", "9:16", "4:3", "3:4"]);
    expect(model?.configJson?.pricingFormula).toBe("per_duration");
    expect(model?.configJson?.pricingTiers).toEqual({
      "5s": 800,
      "10s": 1600,
      "15s": 2400,
    });
  });

  it("keeps duration-tier pricing aligned during DB-miss fallback calculations", () => {
    const model = getStaticModelById(WAVESPEED_LAUNCH_MODEL_ID);
    expect(model).toBeDefined();

    expect(calculateCreditCost(model!, { duration: 5 })).toBe(800);
    expect(calculateCreditCost(model!, { duration: 10 })).toBe(1600);
    expect(calculateCreditCost(model!, { duration: 15 })).toBe(2400);
  });

  it("adds Seedance 2.0 Image-to-Video to the static registry with its own pricing tier", () => {
    const model = getStaticModelById(WAVESPEED_SEEDANCE_2_FAST_IMAGE_TO_VIDEO_MODEL_ID);
    expect(model).toBeDefined();
    expect(model?.configJson?.generateType).toBe("image-to-video");
    expect(model?.configJson?.apiEndpoint).toBe("/bytedance/seedance-2.0-fast/image-to-video");
    expect(calculateCreditCost(model!, { duration: 5 })).toBe(600);
  });
});
