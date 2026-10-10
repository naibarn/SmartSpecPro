import { beforeEach, describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";

const { mockGetDb, mockGenerateQueryEmbedding, wherePredicates } = vi.hoisted(
  () => ({
    mockGetDb: vi.fn(),
    mockGenerateQueryEmbedding: vi.fn(async () => null),
    wherePredicates: [] as unknown[],
  })
);

vi.mock("../../db", () => ({ getDb: mockGetDb }));
vi.mock("../queryEmbeddingService", () => ({
  generateQueryEmbedding: mockGenerateQueryEmbedding,
}));

import { getRuleMemories, retrieveForPrompt } from "../scopedMemoryService";

const roomDerivedMemory = {
  id: "promoted-room-memory",
  tenantId: "tenant-1",
  ownerType: "user",
  ownerId: "7",
  memoryKind: "rule",
  title: "Room-derived rule",
  content: "Keep the room private",
  summary: null,
  sourceRoomId: "room-1",
  metadataJson: {},
  tags: [],
  importance: 5,
  reinforcementCount: 1,
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-01T00:00:00.000Z"),
};

function installDb(resultSets: unknown[][]) {
  let selectIndex = 0;
  mockGetDb.mockResolvedValue({
    select: vi.fn(() => {
      const index = selectIndex++;
      const query: any = {
        from: vi.fn(() => query),
        where: vi.fn((predicate: unknown) => {
          wherePredicates.push(predicate);
          return query;
        }),
        orderBy: vi.fn(() => query),
        limit: vi.fn(async () => resultSets[index] ?? []),
      };
      return query;
    }),
  });
}

describe("team-room memory prompt boundary", () => {
  beforeEach(() => {
    mockGetDb.mockReset();
    mockGenerateQueryEmbedding.mockClear();
    wherePredicates.length = 0;
  });

  it("does not query or return room-derived memories through prompt retrieval", async () => {
    installDb([
      [
        {
          memory: roomDerivedMemory,
          keywordScore: 1,
          vectorScore: 0,
          combinedScore: 1,
        },
      ],
      [],
      [{ memory: roomDerivedMemory, score: 1 }],
      [{ memory: roomDerivedMemory, score: 1 }],
    ]);

    const results = await retrieveForPrompt(
      "tenant-1",
      "assistant-1",
      "run-1",
      "room-1",
      "team-1",
      "private room information",
      1000,
      undefined,
      { initiatedByUserId: 7, projectId: "project-1" }
    );

    expect(results).toEqual([]);
    const queries = wherePredicates.map(predicate =>
      new PgDialect().sqlToQuery(predicate as never)
    );
    expect(queries).toHaveLength(4);
    for (const query of queries) {
      expect(query.params).not.toContain("room-1");
      expect(query.params).not.toContain("team-1");
      expect(query.sql).toContain('"memory_promotions"');
      expect(query.sql).toContain('"fromOwnerType"');
      expect(query.sql.toLowerCase()).toContain("not exists");
    }

    const graphQuery = queries.at(-1)!;
    const graphSql = graphQuery.sql.toLowerCase();
    expect(graphSql.indexOf("and not exists")).toBeGreaterThan(
      graphSql.indexOf("metadatajson"),
    );
  });

  it("does not return a promoted room-derived user rule to prompt composition", async () => {
    installDb([[roomDerivedMemory]]);

    await expect(
      getRuleMemories("tenant-1", 7, null, "project-1")
    ).resolves.toEqual([]);

    const query = new PgDialect().sqlToQuery(wherePredicates[0] as never);
    expect(query.sql.toLowerCase()).toContain("not exists");
    expect(query.params).toContain("room");
    expect(query.params).toContain("team");
    expect(query.params).toContain("run");
  });
});
