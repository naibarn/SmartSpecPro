import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Hoisted mocks ──────────────────────────────────────────────────────────

const { mockFetch, mockGetDb, mockDbSelect } = vi.hoisted(() => ({
  mockFetch: vi.fn(),
  mockGetDb: vi.fn(),
  mockDbSelect: vi.fn(),
}));

vi.stubGlobal("fetch", mockFetch);

vi.mock("../../db", () => ({
  getDb: mockGetDb,
}));

// ── Import after mocks ─────────────────────────────────────────────────────

import {
  transcribe,
  calculateSTTCredits,
  MAX_AUDIO_BYTES,
  MAX_AUDIO_DURATION_SECONDS,
} from "../sttService";

// ── Helpers ────────────────────────────────────────────────────────────────

function makeAudioBuffer(bytes: number): Buffer {
  return Buffer.alloc(bytes, 0xab);
}

// ── Tests ─────────────────────────────────────────────────────────────────

describe("sttService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        text: "Hello world",
        language: "en",
        confidence: 0.95,
        duration: 3.5,
      }),
    });
  });

  describe("transcribe", () => {
    it("routes to groq provider by default and returns transcript", async () => {
      const audio = makeAudioBuffer(1024);
      const result = await transcribe(audio, { format: "pcm16" });

      expect(mockFetch).toHaveBeenCalledOnce();
      const [url, opts] = mockFetch.mock.calls[0];
      expect(url).toContain("/api/internal/stt");
      expect(opts.method).toBe("POST");
      // Default provider is groq
      const body = opts.body as FormData;
      expect(body.get("provider")).toBe("groq");

      expect(result.text).toBe("Hello world");
      expect(result.language).toBe("en");
      expect(result.confidence).toBe(0.95);
      expect(result.duration).toBe(3.5);
    });

    it("accepts provider override (openai)", async () => {
      const audio = makeAudioBuffer(512);
      await transcribe(audio, { format: "pcm16", provider: "openai" });

      const [, opts] = mockFetch.mock.calls[0];
      const body = opts.body as FormData;
      expect(body.get("provider")).toBe("openai");
    });

    it("falls back to openai on groq failure", async () => {
      mockFetch
        .mockRejectedValueOnce(new Error("Groq unavailable"))
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ text: "Fallback text", language: "en", confidence: 0.8, duration: 2 }),
        });

      const audio = makeAudioBuffer(512);
      const result = await transcribe(audio, { format: "pcm16" });

      expect(mockFetch).toHaveBeenCalledTimes(2);
      expect(result.text).toBe("Fallback text");
    });

    it("rejects audio buffers exceeding MAX_AUDIO_BYTES", async () => {
      const tooLarge = makeAudioBuffer(MAX_AUDIO_BYTES + 1);
      await expect(transcribe(tooLarge, { format: "pcm16" })).rejects.toThrow(
        /exceeds maximum/i,
      );
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it("throws when python backend returns non-ok status", async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 413,
        json: async () => ({ detail: "File too large" }),
      });
      const audio = makeAudioBuffer(512);
      await expect(transcribe(audio, { format: "pcm16" })).rejects.toThrow();
    });
  });

  describe("calculateSTTCredits", () => {
    it("returns 0 for groq (free tier)", () => {
      expect(calculateSTTCredits(60, "groq")).toBe(0);
      expect(calculateSTTCredits(300, "groq")).toBe(0);
    });

    it("calculates 3 credits per minute for non-groq providers (ceiling)", () => {
      // 60s = 1 min -> 3 credits
      expect(calculateSTTCredits(60, "openai")).toBe(3);
      // 30s = 0.5 min -> ceil(1.5) = 2 credits
      expect(calculateSTTCredits(30, "openai")).toBe(2);
      // 1s = ceil(0.05) -> 1 credit minimum
      expect(calculateSTTCredits(1, "openai")).toBe(1);
      // 120s = 2 min -> 6 credits
      expect(calculateSTTCredits(120, "openai")).toBe(6);
    });
  });

  describe("constants", () => {
    it("MAX_AUDIO_BYTES is approximately 1.9MB (60s at 16kHz 16-bit mono)", () => {
      // 16000 samples/s * 2 bytes/sample * 60s = 1,920,000 bytes
      expect(MAX_AUDIO_BYTES).toBeGreaterThanOrEqual(1_900_000);
      expect(MAX_AUDIO_BYTES).toBeLessThanOrEqual(2_000_000);
    });

    it("MAX_AUDIO_DURATION_SECONDS is 60", () => {
      expect(MAX_AUDIO_DURATION_SECONDS).toBe(60);
    });
  });
});
