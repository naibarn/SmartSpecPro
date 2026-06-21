import { describe, expect, it } from "vitest";

import {
  capabilityFromMediaModelConfig,
  resolveVideoModelSegmentCapability,
} from "../capabilityProfiles";

describe("video segment capability profiles", () => {
  it("falls back unknown models to single-shot capability", () => {
    const capability = resolveVideoModelSegmentCapability({
      modelId: "brand-new-model",
    });

    expect(capability.supportsMultiShotPrompt).toBe(false);
    expect(capability.maxSubShotsPerSegment).toBe(1);
    expect(capability.source).toBe("unknown");
  });

  it("reads capabilities.videoSegment as the primary structured source", () => {
    const capability = capabilityFromMediaModelConfig({
      modelId: "seedance-2",
      configJson: {
        capabilities: {
          videoSegment: {
            supportsMultiShotPrompt: true,
            maxSubShotsPerSegment: 6,
            maxSegmentDurationSeconds: 15,
            maxReferenceImagesPerSegment: 4,
            supportsNativeAudio: true,
            reviewed: true,
          },
        },
      },
    });

    expect(capability).toMatchObject({
      source: "media_model_config",
      supportsMultiShotPrompt: true,
      maxSubShotsPerSegment: 6,
      maxSegmentDurationSeconds: 15,
    });
  });

  it("does not enable paid multi-shot from display-name style heuristics", () => {
    const capability = resolveVideoModelSegmentCapability({
      modelId: "seedance 2 supports 6 shots 15 seconds",
      provider: "unknown",
    });

    expect(capability.supportsMultiShotPrompt).toBe(false);
    expect(capability.source).toBe("unknown");
  });

  it("enables reviewed multi-shot for Higgsfield Seedance MCP models", () => {
    const capability = resolveVideoModelSegmentCapability({
      modelId: "higgsfield/seedance_unlimited",
      provider: "higgsfield",
      transport: "mcp",
    });

    expect(capability).toMatchObject({
      source: "provider_template",
      transport: "mcp",
      supportsMultiShotPrompt: true,
      maxSubShotsPerSegment: 6,
      maxSegmentDurationSeconds: 15,
      maxReferenceImagesPerSegment: 5,
      supportsNativeAudio: true,
      supportsThaiNativeAudio: false,
    });
  });

  it("enables conservative multi-shot for Higgsfield Veo and Kling MCP models", () => {
    const veo = resolveVideoModelSegmentCapability({
      modelId: "higgsfield/veo3_1_lite",
      provider: "higgsfield",
      transport: "mcp",
    });
    const kling = resolveVideoModelSegmentCapability({
      modelId: "higgsfield/kling3_0_turbo",
      provider: "higgsfield",
      transport: "mcp",
    });

    expect(veo.supportsMultiShotPrompt).toBe(true);
    expect(veo.maxSubShotsPerSegment).toBe(3);
    expect(kling.supportsMultiShotPrompt).toBe(true);
    expect(kling.maxSubShotsPerSegment).toBe(3);
  });
});
