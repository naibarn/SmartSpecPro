import { describe, expect, it } from "vitest";
import { mapToApiModelId } from "../modelRegistry";

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

  it("returns exact model ID unchanged", () => {
    expect(mapToApiModelId("google-banana-2")).toBe("google-banana-2");
  });

  it("keeps unknown model IDs unchanged", () => {
    expect(mapToApiModelId("custom-db-model")).toBe("custom-db-model");
  });
});
