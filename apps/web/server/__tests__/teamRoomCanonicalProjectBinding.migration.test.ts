import { readFileSync } from "node:fs";
import path from "node:path";
import { getTableColumns, getTableName } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { canonicalProjects, teamRooms } from "../../drizzle/schema";

const drizzleDir = path.resolve(import.meta.dirname, "../../drizzle");

describe("SPEC-268 team room canonical Project binding", () => {
  const migration = readFileSync(
    path.join(drizzleDir, "0397_spec268_team_room_canonical_project_binding.sql"),
    "utf8",
  );

  it("adds a tenant-scoped canonical binding without changing legacy project IDs", () => {
    expect(migration).toContain('ADD COLUMN "canonicalProjectId" varchar(36)');
    expect(migration).toContain(
      'FOREIGN KEY ("tenantId","canonicalProjectId") REFERENCES "public"."canonical_projects"("tenant_id","project_id") ON DELETE restrict',
    );
    expect(migration).toContain('"canonicalProjectId" IS NOT NULL');
    expect(migration).not.toMatch(/\bDROP\s+(TABLE|COLUMN|INDEX)|\bDELETE\s+FROM\b/i);
    expect(getTableName(canonicalProjects)).toBe("canonical_projects");
    expect(getTableName(teamRooms)).toBe("team_rooms");
    expect(Object.keys(getTableColumns(teamRooms))).toContain("canonicalProjectId");
    expect(Object.keys(getTableColumns(teamRooms))).toContain("projectId");
  });

  it("keeps the migration journal entry aligned", () => {
    const journal = JSON.parse(
      readFileSync(path.join(drizzleDir, "meta/_journal.json"), "utf8"),
    ) as { entries: Array<{ idx: number; version: string; tag: string; breakpoints: boolean }> };
    const entryIndex = journal.entries.findIndex(
      (entry) => entry.tag === "0397_spec268_team_room_canonical_project_binding",
    );
    expect(entryIndex).toBe(383);
    expect(journal.entries[entryIndex]).toMatchObject({
      idx: entryIndex,
      version: "7",
      tag: "0397_spec268_team_room_canonical_project_binding",
      breakpoints: true,
    });
  });
});
