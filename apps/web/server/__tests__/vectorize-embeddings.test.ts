/**
 * Tests for embedding generation and document chunking.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the global fetch
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

// Mock environment
vi.stubEnv("CLOUDFLARE_AI_API_KEY", "test-api-key");
vi.stubEnv("CLOUDFLARE_ACCOUNT_ID", "test-account-id");

// Mock fetch for Workers AI API calls
beforeEach(() => {
  vi.clearAllMocks();
});

// Import after mocks
const { chunkDocument, generateEmbedding, generateImageDescription } =
  await import("../services/vectorize");

describe("Embedding Generation", () => {
  it("chunks documents into ~500 token segments", () => {
    // ~2000 chars per chunk, with 200 char overlap
    const longText = "a".repeat(5000);
    const chunks = chunkDocument(longText);

    // With 2000 char chunks and 200 overlap, 5000 chars produces ~3 chunks
    expect(chunks.length).toBeGreaterThanOrEqual(3);
    expect(chunks.length).toBeLessThanOrEqual(4);
    // Each chunk should be <= 2000 characters
    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThanOrEqual(2000);
    }
  });

  it("returns single chunk for short documents", () => {
    const shortText = "Hello, this is a short document.";
    const chunks = chunkDocument(shortText);
    expect(chunks.length).toBe(1);
    expect(chunks[0]).toBe(shortText);
  });

  it("generates 768-dimension embeddings from text", async () => {
    const mockEmbedding = Array.from({ length: 768 }, () => Math.random());
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        result: { data: [mockEmbedding] },
        success: true,
      }),
    });

    const result = await generateEmbedding("test text");
    expect(result).toHaveLength(768);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("generates image descriptions via vision model", async () => {
    // Mock image fetch
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        arrayBuffer: async () => new ArrayBuffer(100),
      })
      // Mock Workers AI vision response
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          result: { description: "A product screenshot showing a dashboard" },
          success: true,
        }),
      });

    const desc = await generateImageDescription("https://example.com/img.png");
    expect(desc).toBeTruthy();
    expect(typeof desc).toBe("string");
    expect(desc.length).toBeGreaterThan(0);
  });

  it("throws on API error", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      statusText: "Internal Server Error",
    });

    await expect(generateEmbedding("test")).rejects.toThrow();
  });
});
