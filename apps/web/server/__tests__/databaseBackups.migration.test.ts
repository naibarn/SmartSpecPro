import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const drizzleDir = path.resolve(import.meta.dirname, "../../drizzle");

describe("admin database backup migration", () => {
  it("keeps the migration SQL and journal entry aligned", () => {
    const migration = readFileSync(
      path.join(drizzleDir, "0241_admin_database_backups.sql"),
      "utf8"
    );
    const journal = JSON.parse(
      readFileSync(path.join(drizzleDir, "meta/_journal.json"), "utf8")
    ) as {
      entries: Array<{ idx: number; tag: string }>;
    };
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS "backup_jobs"');
    const entryIndex = journal.entries.findIndex(
      entry => entry.tag === "0241_admin_database_backups"
    );
    expect(entryIndex).toBeGreaterThanOrEqual(0);
    expect(journal.entries[entryIndex]).toMatchObject({
      idx: entryIndex,
      version: "7",
      tag: "0241_admin_database_backups",
      breakpoints: true,
    });
  });
});
