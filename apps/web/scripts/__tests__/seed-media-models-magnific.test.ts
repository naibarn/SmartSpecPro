import { describe, expect, it } from "vitest";

import {
  buildMagnificSeedModels,
  summarizeMagnificSeedModels,
} from "../seed-media-models-magnific";

const EXPECTED_MAGNIFIC_MODEL_IDS = [
  "magnific/mystic",
  "magnific/seedream-v5-lite",
  "magnific/seedream-v5-lite-edit",
  "magnific/nano-banana-pro",
  "magnific/nano-banana-pro-flash",
  "magnific/z-image-turbo",
  "magnific/upscaler-creative",
  "magnific/relight",
  "magnific/style-transfer",
  "magnific/remove-background",
  "magnific/image-expand",
  "magnific/skin-enhancer-creative",
  "magnific/skin-enhancer-faithful",
  "magnific/skin-enhancer-flexible",
  "magnific/change-camera",
  "magnific/kling-v3-pro",
  "magnific/kling-v3-standard",
  "magnific/kling-v3-omni-pro",
  "magnific/kling-v3-omni-standard",
  "magnific/kling-v3-omni-reference-pro",
  "magnific/kling-v3-omni-reference-standard",
  "magnific/kling-v3-motion-control-pro",
  "magnific/kling-v3-motion-control-standard",
  "magnific/kling-v2-6-motion-control-pro",
  "magnific/kling-v2-6-motion-control-standard",
  "magnific/wan-v2-7-text-to-video",
  "magnific/wan-v2-7-image-to-video",
  "magnific/wan-v2-7-reference-to-video",
  "magnific/veo-3-1-text-to-video",
  "magnific/veo-3-1-text-to-video-fast",
  "magnific/veo-3-1-image-to-video",
  "magnific/veo-3-1-image-to-video-fast",
  "magnific/veo-3-1-reference-to-video",
  "magnific/video-upscaler-precision",
];

describe("seed-media-models-magnific", () => {
  it("builds the exact 34-record Magnific model inventory", () => {
    const models = buildMagnificSeedModels();

    expect(models).toHaveLength(34);
    expect(models.map((model) => model.modelId)).toEqual(EXPECTED_MAGNIFIC_MODEL_IDS);
  });

  it("adds required config metadata to every Magnific seed", () => {
    for (const model of buildMagnificSeedModels()) {
      expect(model.provider).toBe("magnific");
      expect(model.configJson).toMatchObject({
        provider: "magnific",
        providerModelId: model.modelId,
        modelFamily: model.modelFamily,
        pricingStatus: "estimated",
        pricingSource: "magnific-docs-or-admin",
        pricingLastReviewedAt: "2026-05-06",
        adminVisible: true,
      });
      expect(model.configJson.endpoint).toEqual(expect.objectContaining({
        submit: expect.stringMatching(/^\//),
      }));
      expect(model.configJson.pricing).toEqual(expect.objectContaining({
        defaultCredits: model.creditCost,
      }));
    }
  });

  it("keeps expensive video and upscaler rows disabled by default", () => {
    const models = buildMagnificSeedModels();
    const videoModels = models.filter((model) => model.modelType === "video");

    expect(videoModels.length).toBeGreaterThan(0);
    expect(videoModels.every((model) => model.isEnabled === false)).toBe(true);
    expect(models.find((model) => model.modelId === "magnific/mystic")?.isEnabled).toBe(true);
    expect(models.find((model) => model.modelId === "magnific/video-upscaler-precision")?.configJson.readinessReason)
      .toBe("estimated-pricing; staging-smoke-required; high-cost");
  });

  it("summarizes dry-run output by type and readiness state", () => {
    const summary = summarizeMagnificSeedModels();

    expect(summary).toMatchObject({
      total: 34,
      enabled: 15,
      disabled: 19,
      byType: {
        image: 15,
        video: 19,
      },
    });
    expect(summary.modelIds).toEqual(EXPECTED_MAGNIFIC_MODEL_IDS);
  });
});
