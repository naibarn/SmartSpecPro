import { describe, expect, it } from "vitest";
import {
  deterministicVectorId,
  validateVectorizeEntry,
  validateVectorizeProjectionContract,
  validateVectorizeQuery,
  vectorizeNamespaceForTenant,
} from "../vectorizeContract";

describe("Vectorize projection contract", () => {
  const identity = {
    vectorIndex: "smartaihub-knowledge-v1",
    namespace: "tenant:tenant-1",
    sourceFamily: "library_chunks",
    sourceId: "chunk-1",
    chunkOrSegmentId: "0",
    sourceRevision: "revision-1",
    embeddingVersion: "bge-base-en-v1.5-v1",
  };

  it("derives a stable bounded namespace and vector id", () => {
    expect(vectorizeNamespaceForTenant(" tenant-1 ")).toBe("tenant:tenant-1");
    expect(deterministicVectorId(identity)).toBe(
      deterministicVectorId({ ...identity })
    );
    expect(deterministicVectorId(identity)).toMatch(/^v:[a-f0-9]{56}$/);
  });

  it("rejects incomplete or cross-tenant projection contracts", () => {
    expect(() => vectorizeNamespaceForTenant(" ")).toThrow(
      "VECTORIZE_TENANT_REQUIRED"
    );
    expect(() =>
      validateVectorizeProjectionContract({
        tenantId: "tenant-1",
        namespace: "global",
        embeddingModel: "@cf/baai/bge-base-en-v1.5",
        embeddingDimensions: 768,
        metric: "cosine",
        sourceFamily: "library_chunks",
        sourceId: "chunk-1",
      })
    ).toThrow("VECTORIZE_NAMESPACE_INVALID");
    expect(() => vectorizeNamespaceForTenant("x".repeat(100))).toThrow(
      "VECTORIZE_NAMESPACE_INVALID"
    );
  });

  it("rejects model and dimension drift before provider mutation", () => {
    expect(() =>
      validateVectorizeProjectionContract({
        tenantId: "tenant-1",
        namespace: "tenant:tenant-1",
        embeddingModel: "text-embedding-3-small",
        embeddingDimensions: 1536,
        metric: "cosine",
        sourceFamily: "library_chunks",
        sourceId: "chunk-1",
      })
    ).toThrow("VECTORIZE_MODEL_MISMATCH");
  });

  it("binds native namespaces to the tenant metadata boundary", () => {
    const entry = {
      id: "v-1",
      values: Array.from({ length: 768 }, () => 0.1),
      namespace: "tenant:tenant-1",
      metadata: { tenantId: "tenant-1" },
    };

    expect(() => validateVectorizeEntry(entry)).not.toThrow();
    expect(() =>
      validateVectorizeEntry({ ...entry, namespace: "tenant-2" })
    ).toThrow("VECTORIZE_NAMESPACE_INVALID");
    expect(() =>
      validateVectorizeQuery({
        vector: entry.values,
        topK: 5,
        namespace: "tenant:tenant-1",
        filter: { tenantId: "tenant-2" },
      })
    ).toThrow("VECTORIZE_NAMESPACE_INVALID");
  });
});
