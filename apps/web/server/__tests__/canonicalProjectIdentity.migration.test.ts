import { readFileSync } from "node:fs";
import path from "node:path";
import { getTableColumns, getTableName } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { canonicalProjectAppBindings, canonicalProjectMemberships, canonicalProjects, miniAppResearchNotes } from "../../drizzle/schema";

const drizzleDir = path.resolve(import.meta.dirname, "../../drizzle");

describe("SPEC-302 canonical project identity migration", () => {
  const migration = readFileSync(path.join(drizzleDir, "0393_spec302_canonical_project_identity.sql"), "utf8");

  it("keeps the additive SQL and Drizzle journal entry aligned", () => {
    const journal = JSON.parse(readFileSync(path.join(drizzleDir, "meta/_journal.json"), "utf8")) as {
      entries: Array<{ idx: number; tag: string; version: string; breakpoints: boolean }>;
    };
    const entryIndex = journal.entries.findIndex(entry => entry.tag === "0393_spec302_canonical_project_identity");
    expect(entryIndex).toBeGreaterThanOrEqual(0);
    expect(journal.entries[entryIndex]).toMatchObject({
      idx: entryIndex,
      version: "7",
      tag: "0393_spec302_canonical_project_identity",
      breakpoints: true,
    });
    expect(migration.trimStart()).toMatch(/^-- SPEC-302[\s\S]*?BEGIN;/);
    expect(migration.trimEnd()).toMatch(/COMMIT;\s*$/);
    expect(migration).not.toMatch(/\bDROP\s+(TABLE|COLUMN|INDEX)|\bDELETE\s+FROM\b/i);
  });

  it("creates tenant-scoped project, membership, App binding and notes tables", () => {
    for (const table of [
      "canonical_projects",
      "canonical_project_memberships",
      "canonical_project_app_bindings",
      "mini_app_research_notes",
    ]) {
      expect(migration).toContain(`CREATE TABLE "${table}"`);
    }
    expect(migration).toContain('REFERENCES "tenants"("id")');
    expect(migration).toContain('FOREIGN KEY ("tenant_id", "app_id") REFERENCES "app_identities"("tenant_id", "app_id")');
    expect(migration).toContain("canonical_project_memberships_role_check");
    expect(migration).toContain("mini_app_research_notes_content_size_check");
    expect(migration).toContain('"ai_summary" text');
  });

  it("matches the Drizzle table and column definitions used by the service", () => {
    expect(getTableName(canonicalProjects)).toBe("canonical_projects");
    expect(getTableName(canonicalProjectMemberships)).toBe("canonical_project_memberships");
    expect(getTableName(canonicalProjectAppBindings)).toBe("canonical_project_app_bindings");
    expect(getTableName(miniAppResearchNotes)).toBe("mini_app_research_notes");
    expect(Object.keys(getTableColumns(miniAppResearchNotes))).toEqual(expect.arrayContaining([
      "tenantId", "projectId", "appId", "ownerPrincipalId", "title", "content", "aiSummary", "lifecycle",
    ]));
  });
});
