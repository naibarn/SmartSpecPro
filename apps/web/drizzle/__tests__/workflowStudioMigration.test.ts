import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const migrationPath = path.resolve(
  __dirname,
  "../0341_feature_209_workflow_studio.sql"
);
const schemaPath = path.resolve(__dirname, "../schema.ts");

describe("Feature 209 marketplace persistence contract", () => {
  const migration = fs.readFileSync(migrationPath, "utf8");
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
});
