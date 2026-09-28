import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const migrationPath = path.resolve(
  __dirname,
  "../0342_vertical_drama_artifact_versions.sql",
);
const schemaPath = path.resolve(__dirname, "../schema.ts");
const journalPath = path.resolve(__dirname, "../meta/_journal.json");

describe("Vertical Drama artifact version persistence", () => {
  const migration = fs.readFileSync(migrationPath, "utf8");
  const schema = fs.readFileSync(schemaPath, "utf8");
  const journal = fs.readFileSync(journalPath, "utf8");

  it("creates additive raw/protected sibling storage without destructive DDL", () => {
    expect(migration).not.toMatch(/\bDROP\s+(TABLE|COLUMN|TYPE|INDEX)\b/i);
    expect(migration).toContain(
      'CREATE TABLE IF NOT EXISTS "vertical_drama_artifact_versions"',
    );
    expect(migration).toContain("'raw_render'");
    expect(migration).toContain("'protected_render'");
    expect(migration).toContain(
      'vds_artifact_version_render_kind_unique',
    );
    expect(migration).toContain('REFERENCES "worker_jobs"("id")');
    expect(migration).toContain(
      'REFERENCES "content_protection_assets"("id")',
    );
    expect(schema).toContain("verticalDramaArtifactVersions");
    expect(schema).toContain('"vertical_drama_artifact_versions"');
  });

  it("registers the migration so deployment actually applies the table", () => {
    expect(journal).toContain('"tag": "0342_vertical_drama_artifact_versions"');
  });
});
