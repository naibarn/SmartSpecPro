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
    expect(wavespeed?.availableModels).toHaveLength(12);
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
      expect.objectContaining({
        id: "wavespeed-ai/elevenlabs/voice-changer",
        type: "audio",
      }),
      expect.objectContaining({
        id: "elevenlabs/eleven-v3",
        type: "audio",
      }),
    ]));
  });

  it("includes an ElevenLabs direct provider row with all first-party audio workflows", () => {
    const elevenlabs = DEFAULT_PROVIDERS.find((provider) => provider.providerName === "elevenlabs");

    expect(elevenlabs).toBeDefined();
    expect(elevenlabs).toMatchObject({
      displayName: "ElevenLabs",
      providerType: "audio",
      baseUrl: "https://api.elevenlabs.io",
      defaultModel: "elevenlabs/text-to-speech",
      isEnabled: false,
    });
    expect(elevenlabs?.availableModels).toHaveLength(5);
    expect(elevenlabs?.availableModels).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "elevenlabs/text-to-speech", type: "audio" }),
      expect.objectContaining({ id: "elevenlabs/voice-changer", type: "audio" }),
      expect.objectContaining({ id: "elevenlabs/speech-to-text", type: "audio" }),
      expect.objectContaining({ id: "elevenlabs/sound-effects", type: "audio" }),
      expect.objectContaining({ id: "elevenlabs/voice-isolator", type: "audio" }),
    ]));
  });

  it("includes a disabled Magnific provider row with all phase-one image and video workflows", () => {
    const magnific = DEFAULT_PROVIDERS.find((provider) => provider.providerName === "magnific");

    expect(magnific).toBeDefined();
    expect(magnific).toMatchObject({
      displayName: "Magnific",
      providerType: "multimodal",
      baseUrl: "https://api.magnific.com",
      defaultModel: "magnific/mystic",
      isEnabled: false,
      isPrimary: false,
    });
    expect(magnific?.availableModels).toHaveLength(34);
    expect(magnific?.availableModels).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "magnific/mystic", type: "image" }),
      expect.objectContaining({ id: "magnific/remove-background", type: "image" }),
      expect.objectContaining({ id: "magnific/veo-3-1-text-to-video-fast", type: "video" }),
      expect.objectContaining({ id: "magnific/video-upscaler-precision", type: "video" }),
    ]));
  });
});
