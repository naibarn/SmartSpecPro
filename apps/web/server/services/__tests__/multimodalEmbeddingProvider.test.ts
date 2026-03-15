import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock fetch globally
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

// Mock vectorize.ts
vi.mock("../vectorize", () => ({
  generateEmbedding: vi.fn(),
  generateImageDescription: vi.fn(),
}));

// Mock DB and crypto
vi.mock("../../db", () => ({
  getDb: vi.fn(),
}));

vi.mock("../crypto", () => ({
  decrypt: vi.fn((v: string) => v),
}));

import { generateEmbedding, generateImageDescription } from "../vectorize";
import { getDb } from "../../db";

const mockGenerateEmbedding = vi.mocked(generateEmbedding);
const mockGenerateImageDescription = vi.mocked(generateImageDescription);
const mockGetDb = vi.mocked(getDb);

const FAKE_VECTOR_768 = Array.from({ length: 768 }, (_, i) => i / 768);

function makeDbWithGeminiKey(key: string | null) {
  const db = {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    and: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue(
      key ? [{ value: key, isSensitive: false }] : []
    ),
  };
  return db;
}

function mockGeminiEmbedResponse(vector: number[]) {
  mockFetch.mockResolvedValueOnce({
    ok: true,
    json: async () => ({ embedding: { values: vector } }),
  } as Response);
}

describe("MultimodalEmbeddingProvider", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("GeminiEmbeddingProvider", () => {
    async function makeGeminiProvider() {
      // Force a fresh provider by importing dynamically and bypassing cache
      const { GeminiEmbeddingProvider } = await import("../multimodalEmbeddingProvider");
      return new GeminiEmbeddingProvider("test-api-key");
    }

    it("embedImage returns a 768-dimension vector", async () => {
      const provider = await makeGeminiProvider();
      mockGeminiEmbedResponse(FAKE_VECTOR_768);

      const result = await provider.embedImage({ fileUrl: "https://example.com/img.jpg" });
      expect(result).toHaveLength(768);
      expect(typeof result[0]).toBe("number");
    });

    it("embedText returns a 768-dimension vector", async () => {
      const provider = await makeGeminiProvider();
      mockGeminiEmbedResponse(FAKE_VECTOR_768);

      const result = await provider.embedText({ text: "a modern house" });
      expect(result).toHaveLength(768);
    });

    it("handles API errors gracefully", async () => {
      const provider = await makeGeminiProvider();
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: async () => "Internal Server Error",
      } as unknown as Response);

      await expect(provider.embedText({ text: "test" })).rejects.toThrow(/500/);
    });

    it("getDimension returns 768", async () => {
      const provider = await makeGeminiProvider();
      expect(provider.getDimension()).toBe(768);
    });

    it("getProviderName returns 'gemini'", async () => {
      const provider = await makeGeminiProvider();
      expect(provider.getProviderName()).toBe("gemini");
    });

    it("getModelName returns 'gemini-embedding-2-preview'", async () => {
      const provider = await makeGeminiProvider();
      expect(provider.getModelName()).toBe("gemini-embedding-2-preview");
    });
  });

  describe("CloudflareFallbackProvider", () => {
    async function makeCfProvider() {
      const { CloudflareFallbackProvider } = await import("../multimodalEmbeddingProvider");
      return new CloudflareFallbackProvider();
    }

    it("embedImage calls generateImageDescription then generateEmbedding", async () => {
      const provider = await makeCfProvider();
      mockGenerateImageDescription.mockResolvedValueOnce("A bright living room with wooden floors.");
      mockGenerateEmbedding.mockResolvedValueOnce(FAKE_VECTOR_768);

      const result = await provider.embedImage({ fileUrl: "https://example.com/img.jpg" });

      expect(mockGenerateImageDescription).toHaveBeenCalledWith("https://example.com/img.jpg");
      expect(mockGenerateEmbedding).toHaveBeenCalledWith(
        "A bright living room with wooden floors."
      );
      expect(result).toHaveLength(768);
    });

    it("embedText returns a 768-dimension vector", async () => {
      const provider = await makeCfProvider();
      mockGenerateEmbedding.mockResolvedValueOnce(FAKE_VECTOR_768);

      const result = await provider.embedText({ text: "some text" });
      expect(result).toHaveLength(768);
      expect(mockGenerateEmbedding).toHaveBeenCalledWith("some text");
    });

    it("getDimension returns 768", async () => {
      const provider = await makeCfProvider();
      expect(provider.getDimension()).toBe(768);
    });

    it("getProviderName returns 'cloudflare'", async () => {
      const provider = await makeCfProvider();
      expect(provider.getProviderName()).toBe("cloudflare");
    });
  });

  describe("getMultimodalEmbeddingProvider (selection logic)", () => {
    it("returns GeminiEmbeddingProvider when API key is configured in system settings", async () => {
      const mockDb = makeDbWithGeminiKey("encrypted-gemini-key");
      mockGetDb.mockResolvedValue(mockDb as any);

      // Reset module cache to force re-evaluation
      const module = await import("../multimodalEmbeddingProvider");
      // Access _resetCacheForTest if available (for unit testing)
      if (typeof (module as any)._resetCacheForTest === "function") {
        (module as any)._resetCacheForTest();
      }

      const provider = await module.getMultimodalEmbeddingProvider();
      expect(provider.getProviderName()).toBe("gemini");
    });

    it("falls back to CloudflareFallbackProvider when Gemini key is not configured", async () => {
      const mockDb = makeDbWithGeminiKey(null);
      mockGetDb.mockResolvedValue(mockDb as any);

      const module = await import("../multimodalEmbeddingProvider");
      if (typeof (module as any)._resetCacheForTest === "function") {
        (module as any)._resetCacheForTest();
      }

      const provider = await module.getMultimodalEmbeddingProvider();
      expect(provider.getProviderName()).toBe("cloudflare");
    });

    it("falls back to Cloudflare when Gemini key is empty string", async () => {
      const mockDb = makeDbWithGeminiKey("");
      mockGetDb.mockResolvedValue(mockDb as any);

      const module = await import("../multimodalEmbeddingProvider");
      if (typeof (module as any)._resetCacheForTest === "function") {
        (module as any)._resetCacheForTest();
      }

      const provider = await module.getMultimodalEmbeddingProvider();
      expect(provider.getProviderName()).toBe("cloudflare");
    });
  });
});
