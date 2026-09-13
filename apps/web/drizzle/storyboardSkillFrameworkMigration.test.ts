import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const migration = fs.readFileSync(
  path.join(
    process.cwd(),
    "drizzle",
    "0301_feature_185_skill_framework_storyboard.sql"
  ),
  "utf8"
);

describe("Feature 185 migration safety", () => {
  it("is additive and creates the project/run/shot and character-library boundaries", () => {
    expect(migration).toContain(
      'CREATE TABLE IF NOT EXISTS "storyboard_skill_projects"'
    );
    expect(migration).toContain(
      'CREATE TABLE IF NOT EXISTS "storyboard_skill_runs"'
    );
    expect(migration).toContain(
      'CREATE TABLE IF NOT EXISTS "storyboard_skill_shots"'
    );
    expect(migration).toContain(
      'CREATE TABLE IF NOT EXISTS "character_library_characters"'
    );
    expect(migration).toContain(
      "storyboard_skill_runs_tenant_idempotency_unique"
    );
    expect(migration).toContain("storyboard_skill_shots_run_number_unique");
    expect(migration).not.toMatch(/\bDROP\s+(TABLE|COLUMN|TYPE)\b/i);
  });
});
