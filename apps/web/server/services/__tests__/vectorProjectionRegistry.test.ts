import { describe, expect, it, vi } from "vitest";
import {
  buildVectorProjectionRecord,
  markVectorProjectionIndexed,
  upsertVectorProjectionRecord,
} from "../vectorProjectionRegistry";

const HASH = "a".repeat(64);

describe("Vectorize projection registry", () => {
  const input = {
    tenantId: "tenant-1",
    sourceFamily: "library_chunks",
    sourceTable: "library_chunks",
    sourceId: "chunk-1",
    chunkId: "0",
    vectorIndex: "smartaihub-knowledge-v1",
    sourceRevision: "revision-1",
    contentHash: HASH,
  };

  it("builds a canonical 768D tenant-scoped projection record", () => {
    const record = buildVectorProjectionRecord(input);

    expect(record).toMatchObject({
      tenantId: "tenant-1",
      namespace: "tenant:tenant-1",
      embeddingDimensions: 768,
      metric: "cosine",
      status: "queued",
      contentHash: HASH,
    });
    expect(record.vectorId).toMatch(/^v:[a-f0-9]{56}$/);
  });

  it("fails closed for a non-canonical hash or cross-tenant namespace", () => {
    expect(() =>
      buildVectorProjectionRecord({ ...input, contentHash: "old-vector" }),
    ).toThrow("VECTORIZE_CONTENT_HASH_INVALID");
    expect(() =>
      buildVectorProjectionRecord({
        ...input,
        namespace: "global",
      }),
    ).toThrow("VECTORIZE_NAMESPACE_INVALID");
  });

  it("upserts before provider visibility and marks indexed afterward", async () => {
    const values = vi.fn().mockReturnThis();
    const onConflictDoUpdate = vi.fn().mockResolvedValue(undefined);
    const insert = vi.fn(() => ({ values, onConflictDoUpdate }));
    const updateSet = vi.fn().mockReturnThis();
    const updateWhere = vi.fn().mockResolvedValue(undefined);
    const db = {
      insert,
      update: vi.fn(() => ({ set: updateSet, where: updateWhere })),
    };

    const record = await upsertVectorProjectionRecord(db, input);
    await markVectorProjectionIndexed(db, {
      vectorIndex: record.vectorIndex,
      vectorId: record.vectorId!,
      mutationId: "mutation-1",
    });

    expect(insert).toHaveBeenCalled();
    expect(onConflictDoUpdate).toHaveBeenCalled();
    expect(updateSet).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "indexed",
        lastMutationId: "mutation-1",
      }),
    );
  });
});
