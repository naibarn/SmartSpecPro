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
const backgroundRunMigration = fs.readFileSync(
  path.join(
    process.cwd(),
    "drizzle",
    "0312_feature_185_storyboard_background_run.sql"
  ),
  "utf8"
);
const activeRunForeignKeyMigration = fs.readFileSync(
  path.join(
    process.cwd(),
    "drizzle",
    "0328_feature_185_storyboard_active_run_fk.sql"
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

  it("binds runs to the canonical worker job and retains per-shot recovery evidence", () => {
    expect(backgroundRunMigration).toContain('ADD COLUMN IF NOT EXISTS "worker_job_id"');
    expect(backgroundRunMigration).toContain('ADD COLUMN IF NOT EXISTS "candidate_history"');
    expect(backgroundRunMigration).toContain('ADD COLUMN IF NOT EXISTS "provider_operation_key"');
    expect(backgroundRunMigration).toContain('ADD COLUMN IF NOT EXISTS "suppressed_result"');
    expect(backgroundRunMigration).toContain("storyboard_skill_runs_worker_job_fk");
    expect(backgroundRunMigration).toContain("storyboard_skill_runs_worker_job_unique");
    expect(backgroundRunMigration).not.toMatch(/DROP\s+(TABLE|COLUMN|TYPE)/i);
  });

  it("protects the refresh/recovery pointer with an additive FK", () => {
    expect(activeRunForeignKeyMigration).toContain(
      "storyboard_skill_projects_active_run_fk"
    );
    expect(activeRunForeignKeyMigration).toContain("ON DELETE SET NULL");
    expect(activeRunForeignKeyMigration).not.toMatch(/DROP\s+(TABLE|COLUMN|TYPE)/i);
  });
});
