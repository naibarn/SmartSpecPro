import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Hoisted mocks ──────────────────────────────────────────────────────────

const { mockFetch } = vi.hoisted(() => ({
  mockFetch: vi.fn(),
}));

vi.stubGlobal("fetch", mockFetch);

// ── Import after mocks ─────────────────────────────────────────────────────

import { synthesize, calculateTTSCredits, MAX_TTS_CHARS } from "../ttsService";

// ── Tests ─────────────────────────────────────────────────────────────────

describe("ttsService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch.mockResolvedValue({
      ok: true,
      headers: { get: () => "audio/mpeg" },
      arrayBuffer: async () => Buffer.alloc(4096).buffer,
    });
  });

  describe("synthesize", () => {
    it("returns audio buffer with content type", async () => {
      const result = await synthesize("Hello world", { format: "mp3" });

      expect(mockFetch).toHaveBeenCalledOnce();
      expect(result.audioBuffer).toBeInstanceOf(Buffer);
      expect(result.contentType).toBe("audio/mpeg");
      expect(typeof result.duration).toBe("number");
    });

    it("sends text to python backend TTS endpoint", async () => {
      await synthesize("Test sentence", { format: "mp3", voice: "alloy" });

      const [url, opts] = mockFetch.mock.calls[0];
      expect(url).toContain("/api/internal/tts");
      expect(opts.method).toBe("POST");
      const body = JSON.parse(opts.body);
      expect(body.text).toBe("Test sentence");
      expect(body.voice).toBe("alloy");
    });

    it("routes to elevenlabs provider when specified", async () => {
      await synthesize("Hi", { format: "mp3", provider: "elevenlabs" });
      const [, opts] = mockFetch.mock.calls[0];
      const body = JSON.parse(opts.body);
      expect(body.provider).toBe("elevenlabs");
    });

    it("routes to openai provider by default", async () => {
      await synthesize("Hi", { format: "mp3" });
      const [, opts] = mockFetch.mock.calls[0];
      const body = JSON.parse(opts.body);
      expect(body.provider).toBe("openai");
    });

    it("rejects text exceeding MAX_TTS_CHARS", async () => {
      const tooLong = "x".repeat(MAX_TTS_CHARS + 1);
      await expect(synthesize(tooLong, { format: "mp3" })).rejects.toThrow(
        /exceeds maximum/i,
      );
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it("throws when python backend returns non-ok response", async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        json: async () => ({ detail: "Provider error" }),
      });
      await expect(synthesize("Hello", { format: "mp3" })).rejects.toThrow();
    });
  });

  describe("calculateTTSCredits", () => {
    it("calculates 5 credits per 1000 characters (ceiling)", () => {
      // 1000 chars -> 5 credits
      expect(calculateTTSCredits(1000)).toBe(5);
      // 500 chars -> ceil(2.5) = 3 credits
      expect(calculateTTSCredits(500)).toBe(3);
      // 1 char -> 1 credit minimum
      expect(calculateTTSCredits(1)).toBe(1);
      // 2000 chars -> 10 credits
      expect(calculateTTSCredits(2000)).toBe(10);
    });
  });

  describe("constants", () => {
    it("MAX_TTS_CHARS is 5000", () => {
      expect(MAX_TTS_CHARS).toBe(5000);
    });
  });
});
