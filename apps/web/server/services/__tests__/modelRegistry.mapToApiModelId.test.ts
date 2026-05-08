import { describe, expect, it } from "vitest";
import { getStaticModelById, mapToApiModelId } from "../modelRegistry";

describe("mapToApiModelId", () => {
  it("resolves known alias with spaces from registry aliases", () => {
    expect(mapToApiModelId("google banana 2")).toBe("google-banana-2");
  });

  it("resolves underscore legacy aliases", () => {
    expect(mapToApiModelId("nano_banana_2")).toBe("google-banana-2");
    expect(mapToApiModelId("google_banana_2")).toBe("google-banana-2");
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

  it("keeps unknown model IDs unchanged", () => {
    expect(mapToApiModelId("custom-db-model")).toBe("custom-db-model");
  });
});
