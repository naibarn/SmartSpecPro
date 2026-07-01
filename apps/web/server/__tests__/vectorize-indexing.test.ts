/**
 * Tests for Vectorize indexing operations.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.stubEnv("CLOUDFLARE_AI_API_KEY", "test-api-key");
vi.stubEnv("CLOUDFLARE_ACCOUNT_ID", "test-account-id");
vi.stubEnv("VECTORIZE_API_TOKEN", "test-vectorize-token");

// Track calls to the Vectorize API
const upsertCalls: unknown[][] = [];
const deleteCalls: string[][] = [];

// Mock fetch at global level to intercept Vectorize API calls
const mockFetch = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
  const urlStr = String(url);
  if (urlStr.includes("/vectorize/") && urlStr.includes("/upsert")) {
    // Parse NDJSON body to track what was upserted
    const body = String(init?.body || "");
    const vectors = body
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line));
    upsertCalls.push(vectors);
    return { ok: true, json: async () => ({ result: { count: vectors.length } }) };
  }
  if (urlStr.includes("/vectorize/") && urlStr.includes("/delete-by-ids")) {
    const body = JSON.parse(String(init?.body || "{}"));
    deleteCalls.push(body.ids);
    return { ok: true, json: async () => ({ result: { count: body.ids.length } }) };
  }
  // Default: return 200 for any other API call
  return { ok: true, json: async () => ({ result: { data: [Array.from({ length: 768 }, () => 0.1)] }, success: true }) };
});
vi.stubGlobal("fetch", mockFetch);

vi.mock("../services/vectorize", () => ({
  generateEmbedding: vi.fn().mockResolvedValue(Array.from({ length: 768 }, () => 0.1)),
  chunkDocument: vi.fn().mockImplementation((text: string) => {
    const chunks: string[] = [];
    for (let i = 0; i < text.length; i += 1800) {
      chunks.push(text.slice(i, i + 2000));
    }
    return chunks.length > 0 ? chunks : [text];
  }),
  generateImageDescription: vi.fn().mockResolvedValue("A test image description"),
}));

vi.mock("../services/vectorProvider", async () => {
  const actual = await vi.importActual("../services/vectorProvider");
  return {
    ...actual,
    getEffectiveVectorProviderConfig: vi.fn().mockResolvedValue({ provider: "cloudflare_vectorize" }),
  };
});

const { indexDocument, indexImage, removeVector } = await import(
  "../services/vectorize-indexing"
);

beforeEach(() => {
  vi.clearAllMocks();
  upsertCalls.length = 0;
  deleteCalls.length = 0;
});

describe("Vectorize Indexing", () => {
  it("indexes a document with chunked embeddings", async () => {
    await indexDocument({
      id: "doc-1",
      text: "A".repeat(4000),
      tenantId: "tenant-1",
      title: "Test Doc",
      type: "article",
      sourceUrl: "/docs/test",
    });

    expect(upsertCalls.length).toBeGreaterThan(0);
    const vectors = upsertCalls[0];
    expect(vectors.length).toBeGreaterThan(1);
    expect(vectors[0].id).toContain("doc-1-chunk-");
    expect(vectors[0].values).toHaveLength(768);
    expect(vectors[0].metadata.tenantId).toBe("tenant-1");
  });

  it("batch upserts vectors in groups of 1000", async () => {
    const { chunkDocument: mockChunk } = await import("../services/vectorize");
    vi.mocked(mockChunk).mockReturnValueOnce(
      Array.from({ length: 1500 }, (_, i) => `chunk-${i}`),
    );

    await indexDocument({
      id: "big-doc",
      text: "A".repeat(2000000),
      tenantId: "tenant-1",
      title: "Big Doc",
      type: "article",
      sourceUrl: "/docs/big",
    });

    // Should have been called twice (1000 + 500)
    expect(upsertCalls).toHaveLength(2);
    expect(upsertCalls[0].length).toBe(1000);
    expect(upsertCalls[1].length).toBe(500);
  });

  it("indexes an image with generated description", async () => {
    await indexImage({
      id: "img-1",
      imageUrl: "https://cdn.example.com/image.png",
      tenantId: "tenant-1",
      filename: "image.png",
    });

    expect(upsertCalls).toHaveLength(1);
    const vectors = upsertCalls[0];
    expect(vectors).toHaveLength(1);
    expect(vectors[0].id).toBe("img-1");
    expect(vectors[0].metadata.type).toBe("image");
    expect(vectors[0].metadata.description).toBeTruthy();
  });

  it("indexes marketplace product images with searchable metadata", async () => {
    await indexImage({
      id: "marketplace-asset-1",
      imageUrl: "https://cdn.example.com/product.jpg",
      tenantId: "tenant-1",
      filename: "Baby bottle main",
      type: "marketplace_image",
      metadata: {
        productId: "mp-1",
        imageId: "mpi-1",
        captureAssetId: "asset-1",
        productName: "Baby bottle",
        productCategory: "Baby Bottles",
        platform: "shopee",
        imageKind: "main",
      },
    });

    expect(upsertCalls).toHaveLength(1);
    const vector = upsertCalls[0][0];
    expect(vector.id).toBe("marketplace-asset-1");
    expect(vector.metadata.type).toBe("marketplace_image");
    expect(vector.metadata.captureAssetId).toBe("asset-1");
    expect(vector.metadata.productId).toBe("mp-1");
    expect(vector.metadata.productName).toBe("Baby bottle");
    expect(vector.metadata.platform).toBe("shopee");
  });

  it("removes vectors when gallery item is deleted", async () => {
    await removeVector("images-index", "img-1");
    expect(deleteCalls).toHaveLength(1);
    expect(deleteCalls[0]).toEqual(["img-1"]);
  });
});
