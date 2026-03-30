import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  cleanupExpiredArchivesMock: vi.fn(),
  enqueueEmbeddingMock: vi.fn(),
  queueUpsertJobSchedulerMock: vi.fn().mockResolvedValue(undefined),
  queueCloseMock: vi.fn().mockResolvedValue(undefined),
  workerCloseMock: vi.fn().mockResolvedValue(undefined),
  workerOnMock: vi.fn(),
}));

vi.mock("../../db", () => ({
  getDb: vi.fn(),
}));

vi.mock("../../services/redisClients", () => ({
  getRealtimeClient: vi.fn(() => ({
    duplicate: vi.fn(() => ({})),
  })),
}));

vi.mock("../../services/memoryArchiveService", () => ({
  cleanupExpiredArchives: mocks.cleanupExpiredArchivesMock,
}));

vi.mock("../../services/embeddingQueue", () => ({
  enqueueEmbedding: mocks.enqueueEmbeddingMock,
}));

vi.mock("bullmq", () => ({
  Queue: vi.fn().mockImplementation(() => ({
    upsertJobScheduler: mocks.queueUpsertJobSchedulerMock,
    close: mocks.queueCloseMock,
  })),
  Worker: vi.fn().mockImplementation(() => ({
    close: mocks.workerCloseMock,
    on: mocks.workerOnMock,
  })),
}));

import { getDb } from "../../db";
import { shutdownMemoryMaintenanceJobs, initializeMemoryMaintenanceJobs, executeArchiveCleanup, executeChunkCleanup, executeEmbeddingReconciliation, executeMemoryEviction } from "../memoryMaintenanceJobs";

function makeDb(responses: unknown[]) {
  const queue = [...responses];
  const db = {
    execute: vi.fn().mockImplementation(() => Promise.resolve(queue.shift() ?? { rows: [] })),
  };
  (getDb as any).mockResolvedValue(db);
  return db;
}

function sqlText(query: unknown): string {
  const chunks = (query as any)?.queryChunks ?? [];
  return chunks
    .flatMap((chunk: any) => (Array.isArray(chunk.value) ? chunk.value : [chunk.value]))
    .map((part: unknown) => (typeof part === "string" || typeof part === "number" ? String(part) : ""))
    .join("");
}

describe("memoryMaintenanceJobs", () => {
  let logSpy: ReturnType<typeof vi.spyOn>;
  let warnSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    await shutdownMemoryMaintenanceJobs().catch(() => {});
    vi.clearAllMocks();
    logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(async () => {
    logSpy.mockRestore();
    warnSpy.mockRestore();
    errorSpy.mockRestore();
    await shutdownMemoryMaintenanceJobs().catch(() => {});
  });

  it("archives per tenant with retention floor", async () => {
    const db = makeDb([
      { rows: [{ tenantId: "tenant-a" }, { tenantId: "tenant-b" }] },
      { rows: [{ key: "tenant_tenant-a_chat_archive_retention_days", value: "3" }] },
      { rows: [{ key: "chat_archive_retention_days", value: "14" }] },
    ]);
    mocks.cleanupExpiredArchivesMock
      .mockResolvedValueOnce(4)
      .mockResolvedValueOnce(5);

    const result = await executeArchiveCleanup();

    expect(mocks.cleanupExpiredArchivesMock).toHaveBeenNthCalledWith(1, "tenant-a", 7);
    expect(mocks.cleanupExpiredArchivesMock).toHaveBeenNthCalledWith(2, "tenant-b", 14);
    expect(result).toMatchObject({
      tenantsProcessed: 2,
      archivesDeleted: 9,
    });
    expect(sqlText((db.execute as any).mock.calls[0][0])).toContain('SELECT DISTINCT "tenantId"');
  });

  it("cleans up old chunks per tenant using retention days", async () => {
    const db = makeDb([
      { rows: [{ tenantId: "tenant-a" }] },
      { rows: [{ key: "chat_chunk_retention_days", value: "45" }] },
      { rows: [{ id: "chunk-1" }, { id: "chunk-2" }] },
    ]);

    const result = await executeChunkCleanup();

    expect(result).toMatchObject({
      tenantsProcessed: 1,
      totalDeleted: 2,
    });
    expect(sqlText((db.execute as any).mock.calls[2][0])).toContain("DELETE FROM message_chunks");
    expect(sqlText((db.execute as any).mock.calls[2][0])).toContain("make_interval(days =>");
  });

  it("requeues orphaned embeddings and warns on large backlog", async () => {
    const chunkRows = Array.from({ length: 26 }, (_, index) => ({
      id: `chunk-${index + 1}`,
      content: `chunk content ${index + 1}`,
    }));
    const memoryRows = Array.from({ length: 25 }, (_, index) => ({
      id: `memory-${index + 1}`,
      title: `Title ${index + 1}`,
      content: `memory content ${index + 1}`,
    }));
    makeDb([
      { rows: chunkRows },
      { rows: memoryRows },
    ]);

    const result = await executeEmbeddingReconciliation();

    expect(result).toMatchObject({
      orphanedChunks: 26,
      orphanedMemories: 25,
      requeuedTotal: 51,
    });
    expect(mocks.enqueueEmbeddingMock).toHaveBeenCalledTimes(51);
    expect(mocks.enqueueEmbeddingMock).toHaveBeenCalledWith({
      type: "message_chunk",
      recordId: "chunk-1",
      text: "chunk content 1",
    });
    expect(mocks.enqueueEmbeddingMock).toHaveBeenCalledWith({
      type: "scoped_memory",
      recordId: "memory-1",
      text: "Title 1\n\nmemory content 1",
    });
    expect(warnSpy).toHaveBeenCalledWith(
      "[memoryMaintenance] WARN high_orphan_count",
      expect.objectContaining({ orphanedChunks: 26, orphanedMemories: 25 }),
    );
  });

  it("expires, decays, compacts, and warns when a user still exceeds the threshold", async () => {
    const db = makeDb([
      { rows: [{ tenantId: "tenant-a", ownerId: "42", count: 500 }] },
      { rows: [{ id: "expired-1" }, { id: "expired-2" }], rowCount: 2 },
      { rows: [{ id: "decay-1" }], rowCount: 1 },
      {
        rows: [
          {
            aId: "keep-a",
            aTitle: "Keep",
            aContent: "keep me",
            aImportance: 6,
            aReinforcementCount: 2,
            bId: "drop-b",
            bTitle: "Drop",
            bContent: "drop me",
            bImportance: 4,
            bReinforcementCount: 0,
            similarity: 0.97,
          },
        ],
      },
      { rows: [] },
      { rows: [] },
      { rows: [{ count: 500 }] },
    ]);

    const result = await executeMemoryEviction();

    expect(result).toMatchObject({
      usersProcessed: 1,
      expiredDeleted: 2,
      decayedDeleted: 1,
      compacted: 1,
    });
    const sqlCalls = (db.execute as any).mock.calls.map((call: unknown[]) => sqlText(call[0]));
    expect(sqlCalls[0]).toContain('HAVING COUNT(*) >=');
    expect(sqlCalls[1]).toContain('DELETE FROM scoped_memories');
    expect(sqlCalls[1]).toContain('"expiresAt" IS NOT NULL');
    expect(sqlCalls[2]).toContain('COALESCE("importance", 5) < 3');
    expect(sqlCalls[3]).toContain("ORDER BY similarity DESC");
    expect(warnSpy).toHaveBeenCalledWith(
      "[memoryMaintenance] memory_eviction_warning",
      expect.objectContaining({ tenantId: "tenant-a", userId: "42", remainingCount: 500 }),
    );
  });

  it("registers and shuts down the recurring schedules", async () => {
    await initializeMemoryMaintenanceJobs();

    expect(mocks.queueUpsertJobSchedulerMock).toHaveBeenCalledTimes(4);
    expect(mocks.queueUpsertJobSchedulerMock).toHaveBeenNthCalledWith(
      1,
      "memory-archive-cleanup",
      expect.objectContaining({ pattern: "0 3 * * *" }),
      expect.objectContaining({ name: "archive-cleanup" }),
    );
    expect(mocks.queueUpsertJobSchedulerMock).toHaveBeenNthCalledWith(
      2,
      "memory-chunk-cleanup",
      expect.objectContaining({ pattern: "30 3 * * *" }),
      expect.objectContaining({ name: "chunk-cleanup" }),
    );
    expect(mocks.queueUpsertJobSchedulerMock).toHaveBeenNthCalledWith(
      3,
      "memory-embedding-reconciliation",
      expect.objectContaining({ pattern: "0 4 * * *" }),
      expect.objectContaining({ name: "embedding-reconciliation" }),
    );
    expect(mocks.queueUpsertJobSchedulerMock).toHaveBeenNthCalledWith(
      4,
      "memory-eviction",
      expect.objectContaining({ pattern: "0 5 * * *" }),
      expect.objectContaining({ name: "eviction" }),
    );

    await shutdownMemoryMaintenanceJobs();

    expect(mocks.queueCloseMock).toHaveBeenCalled();
    expect(mocks.workerCloseMock).toHaveBeenCalled();
  });
});
