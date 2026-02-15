/**
 * Tests for search tRPC endpoints.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.stubEnv("CLOUDFLARE_AI_API_KEY", "test-api-key");
vi.stubEnv("CLOUDFLARE_ACCOUNT_ID", "test-account-id");

const mockQuery = vi.fn();

vi.mock("../services/vectorize", () => ({
  generateEmbedding: vi.fn().mockResolvedValue(Array.from({ length: 768 }, () => 0.1)),
  chunkDocument: vi.fn().mockReturnValue(["chunk"]),
  generateImageDescription: vi.fn().mockResolvedValue("description"),
}));

vi.mock("../services/vectorize-indexing", () => ({
  getVectorizeClient: vi.fn().mockReturnValue({
    query: mockQuery,
    upsert: vi.fn(),
    delete: vi.fn(),
  }),
}));

const { searchDocs, searchImages } = await import("../services/vectorize-search");

beforeEach(() => {
  vi.clearAllMocks();
});

describe("Search Endpoints", () => {
  describe("search.docs", () => {
    it("returns ranked results for text query", async () => {
      mockQuery.mockResolvedValueOnce({
        matches: [
          {
            id: "doc-1-chunk-0",
            score: 0.92,
            metadata: {
              title: "Auth Guide",
              type: "article",
              sourceUrl: "/docs/auth",
              createdAt: Date.now(),
              tenantId: "t1",
            },
          },
          {
            id: "doc-2-chunk-0",
            score: 0.85,
            metadata: {
              title: "Login Flow",
              type: "article",
              sourceUrl: "/docs/login",
              createdAt: Date.now(),
              tenantId: "t1",
            },
          },
        ],
      });

      const results = await searchDocs({
        query: "user authentication flow",
        tenantId: "t1",
        limit: 10,
      });

      expect(results).toHaveLength(2);
      // Results should be sorted by score descending
      expect(results[0].score).toBeGreaterThanOrEqual(results[1].score);
      expect(results[0].title).toBe("Auth Guide");
    });

    it("filters results by tenantId", async () => {
      mockQuery.mockResolvedValueOnce({
        matches: [
          {
            id: "doc-3",
            score: 0.88,
            metadata: {
              title: "Tenant Guide",
              type: "article",
              sourceUrl: "/docs/tenant",
              createdAt: Date.now(),
              tenantId: "tenant-42",
            },
          },
        ],
      });

      const results = await searchDocs({
        query: "test",
        tenantId: "tenant-42",
        limit: 10,
      });

      expect(results).toHaveLength(1);
      // Verify the query was called with the tenant filter
      expect(mockQuery).toHaveBeenCalledWith(
        expect.any(Array),
        expect.objectContaining({
          filter: expect.objectContaining({ tenantId: "tenant-42" }),
        }),
      );
    });

    it("limits results to topK", async () => {
      mockQuery.mockResolvedValueOnce({
        matches: Array.from({ length: 5 }, (_, i) => ({
          id: `doc-${i}`,
          score: 0.9 - i * 0.1,
          metadata: {
            title: `Doc ${i}`,
            type: "article",
            sourceUrl: `/docs/${i}`,
            createdAt: Date.now(),
            tenantId: "t1",
          },
        })),
      });

      const results = await searchDocs({ query: "test", tenantId: "t1", limit: 5 });
      expect(results.length).toBeLessThanOrEqual(5);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.any(Array),
        expect.objectContaining({ topK: 5 }),
      );
    });

    it("returns empty array for empty query", async () => {
      const results = await searchDocs({ query: "", tenantId: "t1", limit: 10 });
      expect(results).toEqual([]);
      expect(mockQuery).not.toHaveBeenCalled();
    });
  });

  describe("search.images", () => {
    it("returns results with image metadata", async () => {
      mockQuery.mockResolvedValueOnce({
        matches: [
          {
            id: "img-1",
            score: 0.88,
            metadata: {
              title: "screenshot.png",
              type: "image",
              sourceUrl: "https://cdn.example.com/screenshot.png",
              createdAt: Date.now(),
              tenantId: "t1",
              description: "A dashboard screenshot",
            },
          },
        ],
      });

      const results = await searchImages({ query: "product screenshot", tenantId: "t1", limit: 10 });
      expect(results).toHaveLength(1);
      expect(results[0].imageUrl).toBeTruthy();
      expect(results[0].filename).toBe("screenshot.png");
      expect(results[0].description).toBe("A dashboard screenshot");
    });

    it("returns empty array for empty query", async () => {
      const results = await searchImages({ query: "", tenantId: "t1", limit: 10 });
      expect(results).toEqual([]);
    });
  });
});
