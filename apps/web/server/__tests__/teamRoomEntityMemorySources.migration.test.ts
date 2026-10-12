import { readFileSync } from "node:fs";
import path from "node:path";
import { getTableColumns, getTableName } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { entityMemories, teamRoomEntityMemorySources } from "../../drizzle/schema";

const drizzleDir = path.resolve(import.meta.dirname, "../../drizzle");

describe("SPEC-268 team-room entity memory source ledger", () => {
  const migration = readFileSync(
    path.join(drizzleDir, "0398_spec268_team_room_entity_memory_sources.sql"),
    "utf8",
  );

  it("stores tenant, room, project, actor, run, and source-message provenance", () => {
    expect(getTableName(teamRoomEntityMemorySources)).toBe("team_room_entity_memory_sources");
    expect(Object.keys(getTableColumns(teamRoomEntityMemorySources))).toEqual(
      expect.arrayContaining([
        "entityMemoryId",
        "tenantId",
        "roomId",
        "teamId",
        "runId",
        "sourceMessageId",
        "actorUserId",
        "canonicalProjectId",
        "authorityVersion",
      ]),
    );
    expect(getTableName(entityMemories)).toBe("entity_memories");
    expect(migration).toContain('FOREIGN KEY ("entityMemoryId", "entityMemoryOwnerUserId", "canonicalProjectId")');
    expect(migration).toContain('FOREIGN KEY ("tenantId", "canonicalProjectId")');
    expect(migration).toContain('FOREIGN KEY ("sourceMessageId") REFERENCES "team_room_messages"("id")');
    expect(migration).toContain('CHECK ("authorityVersion" = \'team-room-provider-context.v1\')');
    expect(migration).not.toMatch(/\bDROP\s+(TABLE|COLUMN|INDEX)|\bDELETE\s+FROM\b/i);
  });

  it("keeps the migration journal entry aligned", () => {
    const journal = JSON.parse(
      readFileSync(path.join(drizzleDir, "meta/_journal.json"), "utf8"),
    ) as { entries: Array<{ idx: number; version: string; tag: string; breakpoints: boolean }> };
    const entryIndex = journal.entries.findIndex(
      (entry) => entry.tag === "0398_spec268_team_room_entity_memory_sources",
    );
    expect(entryIndex).toBe(384);
    expect(journal.entries[entryIndex]).toMatchObject({
      idx: entryIndex,
      version: "7",
      tag: "0398_spec268_team_room_entity_memory_sources",
      breakpoints: true,
    });
  });
});
