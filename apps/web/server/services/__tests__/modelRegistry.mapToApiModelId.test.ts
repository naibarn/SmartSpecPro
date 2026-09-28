import { describe, expect, it } from "vitest";
import { getStaticFallbackModels, getStaticModelById, mapToApiModelId } from "../modelRegistry";

describe("mapToApiModelId", () => {
  it("resolves known alias with spaces from registry aliases", () => {
    expect(mapToApiModelId("google banana 2")).toBe("google-banana-2");
  });

  it("resolves underscore legacy aliases", () => {
    expect(mapToApiModelId("nano_banana_2")).toBe("google-banana-2");
    expect(mapToApiModelId("google_banana_2")).toBe("google-banana-2");
    expect(mapToApiModelId("nano_banana_2_lite")).toBe("google-banana-2-lite");
    expect(mapToApiModelId("google_banana_2_lite")).toBe("google-banana-2-lite");
  });

  it("resolves Nano Banana 2 Lite aliases", () => {
    expect(mapToApiModelId("nano banana 2 lite")).toBe("google-banana-2-lite");
    expect(mapToApiModelId("gemini-3.1-flash-lite-image")).toBe("google-banana-2-lite");
  });

  it("resolves Gemini TTS aliases", () => {
    expect(mapToApiModelId("gemini tts")).toBe("fal-ai/gemini-3.1-flash-tts");
    expect(mapToApiModelId("fal gemini tts")).toBe("fal-ai/gemini-3.1-flash-tts");
  });

  it("resolves WaveSpeed audio compatibility IDs to provider API IDs", () => {
    expect(mapToApiModelId("wavespeed/gemini-2.5-flash/text-to-speech")).toBe("google/gemini-2.5-flash/text-to-speech");
    expect(mapToApiModelId("wavespeed/gemini-2.5-pro/text-to-speech")).toBe("google/gemini-2.5-pro/text-to-speech");
    expect(mapToApiModelId("wavespeed/lyria-3-clip/music")).toBe("google/lyria-3-clip/music");
    expect(mapToApiModelId("wavespeed/lyria-3-pro/music")).toBe("google/lyria-3-pro/music");
  });

  it("resolves Magnific static fallback models with endpoint and pricing metadata", () => {
    const mystic = getStaticModelById("magnific/mystic");
    const veoFast = getStaticModelById("magnific/veo-3-1-text-to-video-fast");

    expect(mystic).toMatchObject({
      id: "magnific/mystic",
      provider: "magnific",
      type: "image",
      creditCost: 20,
    });
    expect(mystic?.configJson).toMatchObject({
      endpoint: {
        submit: "/v1/ai/mystic",
        status: "/v1/ai/mystic/{taskId}",
      },
      dispatchMode: "async-polling",
      pricingStatus: "estimated",
      pricingSource: "magnific-docs-or-admin",
    });
    expect(veoFast?.configJson?.modelFamily).toBe("magnific/veo-3-1");
    expect(veoFast?.isEnabled).toBe(false);
  });

  it("keeps Magnific model ids as exact lookup keys", () => {
    expect(mapToApiModelId("magnific/mystic")).toBe("magnific/mystic");
    expect(mapToApiModelId("veo 3.1 text to video fast")).toBe("magnific/veo-3-1-text-to-video-fast");
  });

  it("returns exact model ID unchanged", () => {
    expect(mapToApiModelId("google-banana-2")).toBe("google-banana-2");
  });

  it("keeps Nano Banana 2 Lite static fallback metadata ready for Kie API", () => {
    const lite = getStaticModelById("google-banana-2-lite");

    expect(lite).toMatchObject({
      id: "google-banana-2-lite",
      provider: "kie.ai",
      type: "image",
      creditCost: 35,
    });
    expect(lite?.configJson).toMatchObject({
      apiEndpoint: "/api/v1/jobs/createTask",
      apiPayloadFormat: "market",
      kieModelId: "nano-banana-2-lite",
      reference_image_input_key: "image_urls",
      reference_image_input_type: "array",
      maxReferenceImages: 14,
      inputFields: expect.arrayContaining([
        expect.objectContaining({ key: "image_urls", maxItems: 14 }),
      ]),
    });
  });

  it("declares the documented five-image Grok Imagine Image 2 edit contract", () => {
    const grok = getStaticModelById("grok-imagine-image-2");

    expect(grok?.configJson).toMatchObject({
      maxPromptLength: 390000,
      maxReferenceImages: 5,
      supportsReferenceImages: true,
      apiConfig: {
        reference_image_input_key: "image_urls",
        reference_image_input_type: "array",
        operations: {
          "image-edit": {
            kie_model_id: "grok-imagine-image-2-0/image-edit",
            drop_params: ["resolution", "output_format", "sourceMediaTaskId", "grokOperation"],
          },
        },
      },
    });
  });

  it("keeps Gemini Omni capability metadata available in static fallback mode", () => {
    const flash = getStaticFallbackModels().find(
      model => model.id === "gemini-omni-flash-1-1",
    );

    expect(flash).toMatchObject({
      provider: "kie.ai",
      videoCapabilityProfile: {
        providerFamily: "gemini-omni",
        modelKey: "gemini-omni-flash-1-1",
        modes: [expect.objectContaining({
          acceptsStartFrame: true,
          acceptsStopFrame: true,
          maxImages: 7,
          maxVideos: 1,
          maxAudio: 3,
          maxTotalReferences: null,
          maxVideoDurationSec: 10,
          nativeFieldMap: expect.objectContaining({
            startFrame: "first_frame_url",
            stopFrame: "last_frame_url",
            images: "image_urls",
            audio: "audio_ids",
          }),
        })],
      },
    });
    expect(flash?.configJson?.providerProfileId).toBe(
      "google/gemini-omni-flash-1-1",
    );
  });

  it("keeps unknown model IDs unchanged", () => {
    expect(mapToApiModelId("custom-db-model")).toBe("custom-db-model");
  });
});
