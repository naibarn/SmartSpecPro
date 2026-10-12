import { beforeEach, describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";

const { mockGetDb, mockWhere } = vi.hoisted(() => ({
  mockGetDb: vi.fn(),
  mockWhere: vi.fn(),
}));

vi.mock("../../db", () => ({ getDb: mockGetDb }));

import {
  getEntityMemoriesForContext,
  upsertEntityMemory,
} from "../memoryService";

describe("entity memory team-room provenance filter", () => {
  beforeEach(() => {
    mockGetDb.mockReset();
    mockWhere.mockReset();
    const query = {
      orderBy: vi.fn(() => ({ limit: vi.fn().mockResolvedValue([]) })),
    };
    mockGetDb.mockResolvedValue({
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn((predicate: unknown) => {
            mockWhere(predicate);
            return query;
          }),
        })),
      })),
    });
  });

  it("filters previously captured team-room facts from global and project context", async () => {
    await getEntityMemoriesForContext(7, 12, "project-1");

    const query = new PgDialect().sqlToQuery(mockWhere.mock.calls[0]?.[0]);
    expect(query.sql).toContain('"source"');
    expect(query.sql.toLowerCase()).toContain(" is null");
    expect(query.sql).toContain("<>");
    expect(query.params).toContain("team_room");
  });

  it("requires source-message provenance before writing team-room memory", async () => {
    await expect(upsertEntityMemory(
      7,
      "person",
      "Ada",
      ["works with a team room"],
      undefined,
      5,
      "team_room",
      "project-1",
      null,
    )).rejects.toThrow("Team-room entity memory requires canonical source provenance");
  });
});
