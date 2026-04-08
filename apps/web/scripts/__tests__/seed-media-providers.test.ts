import { describe, expect, it } from "vitest";

import { DEFAULT_PROVIDERS } from "../seed-media-providers";

describe("seed-media-providers", () => {
  it("includes a WaveSpeed provider row so admin/media-providers can be bootstrapped from seed data", () => {
    const wavespeed = DEFAULT_PROVIDERS.find((provider) => provider.providerName === "wavespeed_ai");

    expect(wavespeed).toBeDefined();
    expect(wavespeed).toMatchObject({
      displayName: "WaveSpeedAI",
      providerType: "multimodal",
      baseUrl: "https://api.wavespeed.ai/api/v3",
      defaultModel: "wavespeed-ai/cinematic-video-generator",
      isEnabled: false,
    });
    expect(wavespeed?.availableModels).toHaveLength(5);
    expect(wavespeed?.availableModels).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: "wavespeed-ai/cinematic-video-generator",
        type: "video",
      }),
      expect.objectContaining({
        id: "bytedance/seedance-2.0/text-to-video",
        type: "video",
      }),
      expect.objectContaining({
        id: "bytedance/seedance-2.0-fast/image-to-video",
        type: "video",
      }),
    ]));
  });
});
