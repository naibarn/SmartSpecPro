import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  createVectorProviderAdapter,
  dispatchVectorOperation,
  getProviderCapabilities,
  registerVectorProviderAdapter,
  resetVectorProviderAdapterRegistry,
  resolveVectorProvider,
  validateProviderCapabilityRequest,
  VectorProviderError,
  type VectorProvider,
} from "../vectorProvider";

describe("vectorProvider resolver", () => {
  it("resolves read/write providers from effective settings and switch-state", () => {
    const resolvedRead = resolveVectorProvider("search", {
      provider: "chromadb",
      currentReadProvider: "cloudflare_vectorize",
      targetProvider: "pgvector",
    });
    const resolvedWrite = resolveVectorProvider("index", {
      provider: "chromadb",
      currentReadProvider: "cloudflare_vectorize",
      targetProvider: "pgvector",
    });

    expect(resolvedRead.provider).toBe("cloudflare_vectorize");
    expect(resolvedWrite.provider).toBe("pgvector");
  });

  it("uses deterministic fallback when settings are partially missing", () => {
    const resolved = resolveVectorProvider("search", {
      provider: undefined,
      currentReadProvider: undefined,
      targetProvider: undefined,
    });

    expect(resolved.provider).toBe("cloudflare_vectorize");
    expect(resolved.fallbackApplied).toBe(true);
  });
});

describe("vectorProvider dispatch", () => {
  beforeEach(() => {
    resetVectorProviderAdapterRegistry();
  });

  it("dispatches to the selected adapter only", async () => {
    const calls: Record<VectorProvider, number> = {
      chromadb: 0,
      pgvector: 0,
      cloudflare_vectorize: 0,
    };

    for (const provider of ["chromadb", "pgvector", "cloudflare_vectorize"] as const) {
      registerVectorProviderAdapter(provider, {
        capabilities: {
          provider,
          minTopK: 1,
          maxTopK: 50,
          supportsMetadataFilter: true,
          supportedDimensions: [3, 384, 768],
        },
        async index() {
          calls[provider] += 1;
          return { count: 1 };
        },
        async delete() {
          calls[provider] += 1;
          return { count: 1 };
        },
        async search() {
          calls[provider] += 1;
          return { matches: [] };
        },
      });
    }

    await dispatchVectorOperation({
      operation: "index",
      indexName: "docs-index",
      vectors: [
        {
          id: "vec-1",
          values: [0.1, 0.2, 0.3],
          metadata: { tenantId: "t-1", type: "doc", createdAt: Date.now(), title: "x", sourceUrl: "y" },
        },
      ],
      providerConfig: {
        provider: "chromadb",
        targetProvider: "pgvector",
      },
    });

    expect(calls.pgvector).toBe(1);
    expect(calls.chromadb).toBe(0);
    expect(calls.cloudflare_vectorize).toBe(0);
  });
});

describe("vectorProvider adapter contract", () => {
  it("exposes index/delete/search contract for all providers", async () => {
    const cloudflare = createVectorProviderAdapter("cloudflare_vectorize", {
      vectorizeAccountId: "acc",
      vectorizeApiToken: "token",
    });
    const pgvector = createVectorProviderAdapter("pgvector", {
      pgvectorHost: "localhost",
      pgvectorDatabase: "smartspec",
    });
    const chroma = createVectorProviderAdapter("chromadb");

    expect(typeof cloudflare.index).toBe("function");
    expect(typeof cloudflare.delete).toBe("function");
    expect(typeof cloudflare.search).toBe("function");

    await expect(
      pgvector.search({
        indexName: "library",
        vector: [0.1, 0.2, 0.3],
        topK: 5,
      }),
    ).rejects.toBeInstanceOf(VectorProviderError);

    await expect(
      chroma.search({
        indexName: "library",
        vector: [0.1, 0.2, 0.3],
        topK: 5,
      }),
    ).rejects.toBeInstanceOf(VectorProviderError);
  });
});

describe("vectorProvider capability validation", () => {
  it("rejects unsupported topK/filter/dimension requests", () => {
    const capabilities = getProviderCapabilities("cloudflare_vectorize");

    expect(() =>
      validateProviderCapabilityRequest({
        capabilities,
        request: {
          topK: capabilities.maxTopK + 1,
          dimension: 768,
          filter: { tenantId: "tenant-1" },
        },
      }),
    ).toThrow(VectorProviderError);

    expect(() =>
      validateProviderCapabilityRequest({
        capabilities: {
          ...capabilities,
          supportsMetadataFilter: false,
        },
        request: {
          topK: 10,
          dimension: 768,
          filter: { tenantId: "tenant-1" },
        },
      }),
    ).toThrow(VectorProviderError);

    expect(() =>
      validateProviderCapabilityRequest({
        capabilities,
        request: {
          topK: 10,
          dimension: 1024,
          filter: undefined,
        },
      }),
    ).toThrow(VectorProviderError);
  });
});
