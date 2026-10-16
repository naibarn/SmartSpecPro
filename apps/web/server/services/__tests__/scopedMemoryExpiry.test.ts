import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";

const { mockGetDb, mockGenerateQueryEmbedding, predicates } = vi.hoisted(() => ({
  mockGetDb: vi.fn(),
  mockGenerateQueryEmbedding: vi.fn(async () => null),
  predicates: [] as unknown[],
}));

vi.mock("../../db", () => ({ getDb: mockGetDb }));
vi.mock("../queryEmbeddingService", () => ({ generateQueryEmbedding: mockGenerateQueryEmbedding }));

import { getRuleMemories, listMemories, retrieveForPrompt, searchMemories } from "../scopedMemoryService";

function memory(id: string, expiresAt: Date | null, title = "Useful memory") {
  return {
    id,
    tenantId: "tenant-1",
    ownerType: "agent",
    ownerId: "assistant-1",
    memoryKind: "fact",
    title,
    content: "matching knowledge",
    summary: null,
    metadataJson: title.startsWith("Working Summary") ? { contextRole: "working_summary" } : {},
    tags: [],
    importance: 5,
    reinforcementCount: 1,
    projectId: null,
    sourceRoomId: null,
    sourceAssistantId: null,
    expiresAt,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
  } as any;
}

function installDb(resultSets: unknown[][], afterLimit?: (index: number) => void) {
  let selectIndex = 0;
  mockGetDb.mockResolvedValue({
    select: vi.fn(() => {
      const index = selectIndex++;
      const query: any = {
        from: vi.fn(() => query),
        where: vi.fn((predicate: unknown) => {
          predicates.push(predicate);
          return query;
        }),
        orderBy: vi.fn(() => query),
        limit: vi.fn(async () => {
          afterLimit?.(index);
          return resultSets[index] ?? [];
        }),
      };
      return query;
    }),
  });
}

function expirySql(predicate: unknown) {
  return new PgDialect().sqlToQuery(predicate as never);
}

describe("scoped memory expiry", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  beforeEach(() => {
    mockGetDb.mockReset();
    mockGenerateQueryEmbedding.mockClear();
    predicates.length = 0;
    vi.useRealTimers();
  });

  it("applies one stable expiry cutoff to lexical, summary, structured, and graph recall", async () => {
    const future = new Date(Date.now() + 60_000);
    const active = memory("active", future);
    const summary = { ...memory("summary", future, "Working Summary: project"), ownerType: "project", ownerId: "project-1" };
    installDb([
      [{ memory: active, keywordScore: 1, vectorScore: 0, combinedScore: 1 }],
      [{ ...summary, memory: summary, score: 1 }],
      [{ memory: active, score: 1 }],
      [{ memory: active, score: 1 }],
    ]);

    const results = await retrieveForPrompt(
      "tenant-1", "assistant-1", null, "room-1", null, "matching", 1000,
      undefined, { projectId: "project-1" },
    );

    expect(results.map((result) => result.memory.id)).toContain("active");
    expect(results.map((result) => result.memory.id)).toContain("summary");
    expect(predicates).toHaveLength(4);
    const expiryQueries = predicates.map(expirySql);
    for (const query of expiryQueries) {
      expect(query.sql).toContain('"expiresAt" is null');
      expect(query.sql).toContain('"expiresAt" >');
    }
    expect(expiryQueries[0].params.filter((value) => value instanceof Date)).toHaveLength(1);
    expect(expiryQueries.every((query) => query.params.includes(expiryQueries[0].params.find((v) => v instanceof Date)))).toBe(true);
  });

  it("excludes expired and boundary-equal rows in every ranked recall family", async () => {
    const now = new Date("2026-05-01T12:00:00.000Z");
    vi.useFakeTimers();
    vi.setSystemTime(now);
    const expired = memory("expired", new Date(now.getTime() - 1), "expired");
    const boundary = memory("boundary", now, "boundary");
    const future = memory("future", new Date(now.getTime() + 1), "future");
    const neverExpires = memory("never-expires", null, "never expires");
    const summaryExpired = { ...memory("summary-expired", now, "Working Summary: expired"), ownerType: "project", ownerId: "project-1" };
    installDb([
      [expired, boundary, future, neverExpires].map((item) => ({ memory: item, keywordScore: 1, vectorScore: 0, combinedScore: 1 })),
      [{ ...summaryExpired, memory: summaryExpired, score: 1 }],
      [expired, boundary, future, neverExpires].map((item) => ({ memory: item, score: 1 })),
      [expired, boundary, future, neverExpires].map((item) => ({ memory: item, score: 1 })),
    ]);

    const results = await retrieveForPrompt("tenant-1", "assistant-1", null, "room-1", null, "matching", 1000, undefined, { projectId: "project-1" });
    expect(results.map((result) => result.memory.id).sort()).toEqual(["future", "never-expires"]);
  });

  it("drops a result that expires during recall before returning hydrated prompt memories", async () => {
    const start = new Date("2026-05-01T12:00:00.000Z");
    vi.useFakeTimers();
    vi.setSystemTime(start);
    const expiring = memory("expiring-during-recall", new Date(start.getTime() + 100));
    installDb([
      [{ memory: expiring, keywordScore: 1, vectorScore: 0, combinedScore: 1 }],
      [],
      [],
      [],
    ], (index) => {
      if (index >= 1) vi.setSystemTime(new Date(start.getTime() + 101));
    });

    await expect(retrieveForPrompt("tenant-1", "assistant-1", null, null, null, "matching", 1000, undefined, { projectId: null }))
      .resolves.toEqual([]);
  });

  it("filters expired search results while keeping management list behavior unchanged", async () => {
    const old = memory("management-expired", new Date("2020-01-01T00:00:00.000Z"));
    installDb([[{ memory: old, keywordScore: 1, vectorScore: 0, combinedScore: 1 }], [old], [old]]);

    const search = await searchMemories({ tenantId: "tenant-1", scopes: [{ type: "agent", id: "assistant-1" }], query: "matching" });
    const listed = await listMemories("tenant-1", "agent", "assistant-1");
    const activeOnly = await listMemories("tenant-1", "agent", "assistant-1", 50, undefined, false, new Date());

    expect(search).toEqual([]);
    expect(listed.map((item) => item.id)).toEqual(["management-expired"]);
    expect(activeOnly).toEqual([]);
    expect(expirySql(predicates[0]).sql).toContain('"expiresAt"');
    expect(expirySql(predicates[1]).sql).not.toContain('"expiresAt"');
    expect(expirySql(predicates[2]).sql).toContain('"expiresAt"');
  });

  it("applies expiry to user rule recall while retaining null-expiry rules", async () => {
    const now = new Date("2026-05-01T12:00:00.000Z");
    vi.useFakeTimers();
    vi.setSystemTime(now);
    const active = { ...memory("rule-active", null), ownerType: "user", ownerId: "7", memoryKind: "rule" };
    const expired = { ...memory("rule-expired", now), ownerType: "user", ownerId: "7", memoryKind: "rule" };
    installDb([[active, expired]]);

    await expect(getRuleMemories("tenant-1", 7)).resolves.toEqual([active]);
    const query = expirySql(predicates[0]);
    expect(query.sql).toContain('"expiresAt" is null');
    expect(query.sql).toContain('"expiresAt" >');
  });

  it("uses expiry by default for direct vector search and rejects rows expiring during hydration", async () => {
    const start = new Date("2026-05-01T12:00:00.000Z");
    vi.useFakeTimers();
    vi.setSystemTime(start);
    const rows = [
      memory("vector-expired", new Date(start.getTime() - 1), "vector-expired"),
      memory("vector-boundary", start, "vector-boundary"),
      memory("vector-null", null, "vector-null"),
      memory("vector-future", new Date(start.getTime() + 100), "vector-future"),
    ].map((item) => ({ memory: item, keywordScore: 1, vectorScore: 1, combinedScore: 1 }));
    installDb([rows]);

    const results = await searchMemories({
      tenantId: "tenant-1",
      scopes: [{ type: "agent", id: "assistant-1" }],
      query: "matching",
      embedding: Array(1536).fill(0.1),
    });

    expect(results.map((result) => result.memory.id).sort()).toEqual(["vector-future", "vector-null"]);
    const query = expirySql(predicates[0]);
    expect(query.sql).toContain('"expiresAt" is null');
    expect(query.sql).toContain('"expiresAt" >');
    expect(query.params.some((value) => value instanceof Date && value.getTime() === start.getTime())).toBe(true);
  });

  it("uses a fresh cutoff when a direct vector result expires during the query", async () => {
    const start = new Date("2026-05-01T12:00:00.000Z");
    vi.useFakeTimers();
    vi.setSystemTime(start);
    const expiring = memory("vector-race", new Date(start.getTime() + 100));
    installDb([[{ memory: expiring, keywordScore: 1, vectorScore: 1, combinedScore: 1 }]], () =>
      vi.setSystemTime(new Date(start.getTime() + 101))
    );

    const results = await searchMemories({
      tenantId: "tenant-1",
      scopes: [{ type: "agent", id: "assistant-1" }],
      query: "matching",
      embedding: Array(1536).fill(0.1),
    });
    expect(results).toEqual([]);
    expect(expirySql(predicates[0]).params.some((value) => value instanceof Date && value.getTime() === start.getTime())).toBe(true);
  });

  it("rejects a rule that expires after its stable SQL cutoff but before hydration", async () => {
    const start = new Date("2026-05-01T12:00:00.000Z");
    vi.useFakeTimers();
    vi.setSystemTime(start);
    const expiring = { ...memory("rule-race", new Date(start.getTime() + 100)), ownerType: "user", ownerId: "7", memoryKind: "rule" };
    installDb([[expiring]], () => vi.setSystemTime(new Date(start.getTime() + 101)));

    await expect(getRuleMemories("tenant-1", 7)).resolves.toEqual([]);
    const query = expirySql(predicates[0]);
    expect(query.params.some((value) => value instanceof Date && value.getTime() === start.getTime())).toBe(true);
  });
});
