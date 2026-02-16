import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const pgState = vi.hoisted(() => ({
  rows: new Map<string, { embedding: number[]; metadata: Record<string, unknown> }>(),
}));

vi.mock("pg", () => {
  class Pool {
    async query(text: string, values: unknown[] = []) {
      const sql = text.toLowerCase();
      if (sql.includes("create table") || sql.includes("create index")) {
        return { rows: [], rowCount: 0 };
      }

      if (sql.includes("insert into smartspec_vector_entries")) {
        const indexName = String(values[0] || "");
        const vectorId = String(values[1] || "");
        const embedding = Array.isArray(values[2]) ? values[2].map((value) => Number(value)) : [];
        const metadataRaw = values[3];
        const metadata =
          typeof metadataRaw === "string" ? (JSON.parse(metadataRaw) as Record<string, unknown>) : {};
        pgState.rows.set(`${indexName}:${vectorId}`, { embedding, metadata });
        return { rows: [], rowCount: 1 };
      }

      if (sql.includes("delete from smartspec_vector_entries")) {
        const indexName = String(values[0] || "");
        const ids = new Set((Array.isArray(values[1]) ? values[1] : []).map((value) => String(value)));
        let removed = 0;
        for (const key of Array.from(pgState.rows.keys())) {
          const [rowIndex, rowId] = key.split(":");
          if (rowIndex === indexName && ids.has(rowId)) {
            pgState.rows.delete(key);
            removed += 1;
          }
        }
        return { rows: [], rowCount: removed };
      }

      if (sql.includes("select vector_id, embedding, metadata")) {
        const indexName = String(values[0] || "");
        const pairs: Array<[string, string]> = [];
        for (let i = 1; i < values.length; i += 2) {
          if (values[i + 1] === undefined) break;
          pairs.push([String(values[i]), String(values[i + 1])]);
        }

        const rows = Array.from(pgState.rows.entries())
          .filter(([key, value]) => {
            const [rowIndex] = key.split(":");
            if (rowIndex !== indexName) return false;
            for (const [filterKey, filterValue] of pairs) {
              if (String(value.metadata[filterKey]) !== filterValue) return false;
            }
            return true;
          })
          .map(([key, value]) => {
            const [, vectorId] = key.split(":");
            return {
              vector_id: vectorId,
              embedding: value.embedding,
              metadata: value.metadata,
            };
          });
        return { rows, rowCount: rows.length };
      }

      return { rows: [], rowCount: 0 };
    }

    async end() {}
  }

  return { Pool };
});

import {
  createVectorProviderAdapter,
  dispatchVectorOperation,
  getProviderCapabilities,
  registerVectorProviderAdapter,
  resetVectorProviderAdapterRegistry,
  resolveVectorProvider,
  validateProviderCapabilityRequest,
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
    pgState.rows.clear();
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
  beforeEach(() => {
    resetVectorProviderAdapterRegistry();
    pgState.rows.clear();
  });

  it("executes index/search/delete for pgvector and chromadb adapters", async () => {
    const chromaDir = await mkdtemp(join(tmpdir(), "vector-provider-test-"));
    const pgvector = createVectorProviderAdapter("pgvector", {
      pgvectorHost: "localhost",
      pgvectorDatabase: "smartspec",
    });
    const chroma = createVectorProviderAdapter("chromadb", {
      chromaPersistDir: chromaDir,
    });

    const sharedVectors = [
      {
        id: "vec-1",
        values: [0.9, 0.1, 0.0],
        metadata: {
          tenantId: "tenant-1",
          type: "doc",
          createdAt: Date.now(),
          title: "alpha",
          sourceUrl: "s3://alpha",
        },
      },
      {
        id: "vec-2",
        values: [0.0, 1.0, 0.0],
        metadata: {
          tenantId: "tenant-1",
          type: "doc",
          createdAt: Date.now(),
          title: "beta",
          sourceUrl: "s3://beta",
        },
      },
    ];

    await pgvector.index({ indexName: "library", vectors: sharedVectors });
    const pgSearch = await pgvector.search({
      indexName: "library",
      vector: [1, 0, 0],
      topK: 2,
      filter: { tenantId: "tenant-1" },
    });
    expect(pgSearch.matches[0]?.id).toBe("vec-1");
    const pgDelete = await pgvector.delete({ indexName: "library", ids: ["vec-1"] });
    expect(pgDelete.count).toBe(1);

    await chroma.index({ indexName: "library", vectors: sharedVectors });
    const chromaSearch = await chroma.search({
      indexName: "library",
      vector: [0, 1, 0],
      topK: 2,
      filter: { tenantId: "tenant-1" },
    });
    expect(chromaSearch.matches[0]?.id).toBe("vec-2");
    const chromaDelete = await chroma.delete({ indexName: "library", ids: ["vec-2"] });
    expect(chromaDelete.count).toBe(1);
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
    ).toThrow();

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
    ).toThrow();

    expect(() =>
      validateProviderCapabilityRequest({
        capabilities,
        request: {
          topK: 10,
          dimension: 1024,
          filter: undefined,
        },
      }),
    ).toThrow();
  });
});
