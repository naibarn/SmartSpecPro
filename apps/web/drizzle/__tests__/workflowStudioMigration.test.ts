import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const migrationPath = path.resolve(
  __dirname,
  "../0341_feature_209_workflow_studio.sql"
);
const schemaPath = path.resolve(__dirname, "../schema.ts");
const recoveryMigrationPath = path.resolve(
  __dirname,
  "../0365_spec215_durable_logical_runtime.sql"
);
const journalPath = path.resolve(__dirname, "../meta/_journal.json");

describe("Feature 209 marketplace persistence contract", () => {
  const migration = fs.readFileSync(migrationPath, "utf8");
  const recoveryMigration = fs.readFileSync(recoveryMigrationPath, "utf8");
  const schema = fs.readFileSync(schemaPath, "utf8");

  it("keeps public catalog metadata additive and forward-only", () => {
    expect(migration).not.toMatch(/\bDROP\s+(TABLE|COLUMN|TYPE|INDEX)\b/i);
    expect(migration).toContain('"workflow_studio_apps"');
    expect(migration).toContain('"tagsJson" jsonb');
    expect(migration).toContain('ADD COLUMN IF NOT EXISTS "tagsJson"');
    expect(migration).toContain('ADD COLUMN IF NOT EXISTS "draftRevision"');
    expect(schema).toContain('tagsJson: jsonb("tagsJson")');
    expect(schema).toContain('draftRevision: integer("draftRevision")');
    expect(migration).toContain('"workflow_studio_runs"');
    expect(migration).toContain('"workflow_studio_run_events"');
    expect(migration).toContain('"workflow_studio_checkpoints"');
    expect(schema).toContain("workflowStudioRuns");
    expect(schema).toContain("workflowStudioRunEvents");
    expect(schema).toContain("workflowStudioCheckpoints");
  });

  it("restores the 0340-0341 migration sequence between 0339 and 0342", () => {
    const journal = JSON.parse(fs.readFileSync(journalPath, "utf8"));
    const tags = journal.entries.map((entry: { tag: string }) => entry.tag);
    const start = tags.indexOf("0339_runner_release_build_publish");

    expect(tags.slice(start, start + 4)).toEqual([
      "0339_runner_release_build_publish",
      "0340_feature_207_economic_control_plane",
      "0341_feature_209_workflow_studio",
      "0342_vertical_drama_artifact_versions",
    ]);
  });

  it("repairs the missing 0340 and 0341 baselines before Spec 215 alters runs", () => {
    const alterRunsIndex = recoveryMigration.indexOf(
      'ALTER TABLE "workflow_studio_runs"'
    );
    const requiredTables = [
      "workflow_studio_definitions",
      "workflow_studio_versions",
      "workflow_studio_views",
      "workflow_studio_apps",
      "workflow_studio_runs",
      "workflow_studio_run_events",
      "workflow_studio_checkpoints",
    ];

    expect(alterRunsIndex).toBeGreaterThan(0);
    for (const table of requiredTables) {
      const createIndex = recoveryMigration.indexOf(
        `CREATE TABLE IF NOT EXISTS "${table}"`
      );
      expect(createIndex).toBeGreaterThanOrEqual(0);
      expect(createIndex).toBeLessThan(alterRunsIndex);
    }

    const feature207Migration = fs.readFileSync(
      path.resolve(__dirname, "../0340_feature_207_economic_control_plane.sql"),
      "utf8"
    );
    const feature207Tables = Array.from(
      feature207Migration.matchAll(/CREATE TABLE IF NOT EXISTS "([^"]+)"/g),
      (match) => match[1]
    );
    expect(feature207Tables.length).toBeGreaterThan(0);
    for (const table of feature207Tables) {
      expect(recoveryMigration).toContain(
        `CREATE TABLE IF NOT EXISTS "${table}"`
      );
    }
  });
});
