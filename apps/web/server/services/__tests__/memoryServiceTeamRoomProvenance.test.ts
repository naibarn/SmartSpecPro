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

  it.each([
    { existingSource: "auto", incomingSource: "team_room" },
    { existingSource: "team_room", incomingSource: "auto" },
  ])(
    "retains team-room provenance when merging $incomingSource into $existingSource",
    async ({ existingSource, incomingSource }) => {
      const existing = {
        id: 44,
        userId: 7,
        personaId: null,
        entityType: "person",
        entityName: "Ada",
        facts: ["likes concise notes"],
        source: existingSource,
        sourceConversationId: 12,
        projectId: "project-1",
      };
      const where = vi.fn().mockResolvedValue(undefined);
      const set = vi.fn(() => ({ where }));
      mockGetDb.mockResolvedValue({
        select: vi.fn(() => ({
          from: vi.fn(() => ({
            where: vi.fn(() => ({
              limit: vi.fn().mockResolvedValue([existing]),
            })),
          })),
        })),
        update: vi.fn(() => ({ set })),
      });

      const updated = await upsertEntityMemory(
        7,
        "person",
        "Ada",
        ["works with a team room"],
        undefined,
        5,
        incomingSource,
        "project-1",
        null
      );

      expect(set).toHaveBeenCalledWith(
        expect.objectContaining({ source: "team_room" })
      );
      expect(updated).toMatchObject({ source: "team_room" });
    }
  );
});
