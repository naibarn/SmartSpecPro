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

  it("returns exact model ID unchanged", () => {
    expect(mapToApiModelId("google-banana-2")).toBe("google-banana-2");
  });

  it("keeps unknown model IDs unchanged", () => {
    expect(mapToApiModelId("custom-db-model")).toBe("custom-db-model");
  });
});
