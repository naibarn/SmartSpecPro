import { describe, it, expect, vi, afterEach } from "vitest";
import { PROVIDER_TEMPLATES, testFalAI } from "../routers/mediaProviders";

// --- Provider template completeness ---

describe("PROVIDER_TEMPLATES fal_ai entry", () => {
  const falAiTemplate = PROVIDER_TEMPLATES.find(
    (t) => t.providerName === "fal_ai"
  );

  it("exists in PROVIDER_TEMPLATES", () => {
    expect(falAiTemplate).toBeDefined();
  });

  it("contains all 7 LTX-2.3 video models", () => {
    const ltxModels = falAiTemplate!.availableModels.filter((m) =>
      m.id.startsWith("fal-ai/ltx-2.3/")
    );
    expect(ltxModels).toHaveLength(7);

    const expectedIds = [
      "fal-ai/ltx-2.3/text-to-video",
      "fal-ai/ltx-2.3/text-to-video/fast",
      "fal-ai/ltx-2.3/image-to-video",
      "fal-ai/ltx-2.3/image-to-video/fast",
      "fal-ai/ltx-2.3/audio-to-video",
      "fal-ai/ltx-2.3/extend-video",
      "fal-ai/ltx-2.3/retake-video",
    ];
    for (const id of expectedIds) {
      expect(ltxModels.find((m) => m.id === id)).toBeDefined();
    }
  });

  it("contains Lux TTS audio model", () => {
    const luxTts = falAiTemplate!.availableModels.find(
      (m) => m.id === "fal-ai/lux-tts"
    );
    expect(luxTts).toBeDefined();
    expect(luxTts!.type).toBe("audio");
  });

  it("contains Gemini 3.1 Flash TTS audio model", () => {
    const geminiTts = falAiTemplate!.availableModels.find(
      (m) => m.id === "fal-ai/gemini-3.1-flash-tts"
    );
    expect(geminiTts).toBeDefined();
    expect(geminiTts!.type).toBe("audio");
    expect(geminiTts!.description).toContain("multi-speaker");
  });

  it("retains existing 4 Flux image models", () => {
    const fluxIds = [
      "fal-ai/flux/schnell",
      "fal-ai/flux/dev",
      "fal-ai/flux-pro",
      "fal-ai/stable-diffusion-v3-medium",
    ];
    for (const id of fluxIds) {
      expect(
        falAiTemplate!.availableModels.find((m) => m.id === id)
      ).toBeDefined();
    }
  });

  it("each model entry has id, name, type, and description fields", () => {
    for (const model of falAiTemplate!.availableModels) {
      expect(model.id).toBeTruthy();
      expect(model.name).toBeTruthy();
      expect(model.type).toBeTruthy();
      expect(model.description).toBeTruthy();
    }
  });

  it("video model IDs match expected fal-ai/ltx-2.3/* pattern", () => {
    const ltxModels = falAiTemplate!.availableModels.filter((m) =>
      m.id.startsWith("fal-ai/ltx-2.3/")
    );
    for (const model of ltxModels) {
      expect(model.type).toBe("video");
    }
  });

  it("Lux TTS model ID is fal-ai/lux-tts with type audio", () => {
    const luxTts = falAiTemplate!.availableModels.find(
      (m) => m.id === "fal-ai/lux-tts"
    );
    expect(luxTts).toBeDefined();
    expect(luxTts!.id).toBe("fal-ai/lux-tts");
    expect(luxTts!.type).toBe("audio");
  });

  it("has 15 total entries", () => {
    expect(falAiTemplate!.availableModels).toHaveLength(15);
  });
});

// --- testFalAI authentication probe ---

describe("testFalAI", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("sends POST to queue.fal.run with Authorization: Key header", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      status: 422,
      ok: false,
    });
    globalThis.fetch = mockFetch;

    await testFalAI("test-key-123");

    expect(mockFetch).toHaveBeenCalledWith(
      "https://queue.fal.run/fal-ai/flux/schnell",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Key test-key-123",
        }),
      })
    );
  });

  it("returns success: true when API responds with 422 (valid key)", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      status: 422,
      ok: false,
    });

    const result = await testFalAI("valid-key");
    expect(result.success).toBe(true);
  });

  it("returns success: false when API responds with 401 (invalid key)", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      status: 401,
      ok: false,
    });

    const result = await testFalAI("invalid-key");
    expect(result.success).toBe(false);
  });

  it("returns success: false when API responds with 403 (forbidden)", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      status: 403,
      ok: false,
    });

    const result = await testFalAI("forbidden-key");
    expect(result.success).toBe(false);
  });

  it("returns success: true when API responds with 429 (rate limited)", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      status: 429,
      ok: false,
    });

    const result = await testFalAI("valid-key");
    expect(result.success).toBe(true);
  });

  it("handles network errors gracefully", async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error("ECONNREFUSED"));

    const result = await testFalAI("any-key");
    expect(result.success).toBe(false);
  });

  it("never sends the actual API key in the response message", async () => {
    const secretKey = "sk-super-secret-key-12345";

    // Test all response paths
    for (const status of [422, 401, 403, 429, 200, 500]) {
      globalThis.fetch = vi.fn().mockResolvedValue({
        status,
        ok: status >= 200 && status < 300,
      });

      const result = await testFalAI(secretKey);
      expect(result.message).not.toContain(secretKey);
    }

    // Test error path
    globalThis.fetch = vi
      .fn()
      .mockRejectedValue(new Error("connection failed"));
    const errorResult = await testFalAI(secretKey);
    expect(errorResult.message).not.toContain(secretKey);
  });
});
