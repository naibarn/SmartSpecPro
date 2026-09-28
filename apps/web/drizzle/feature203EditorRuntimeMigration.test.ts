import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const parentMigration = readFileSync(new URL("./0333_feature_203_editor_revision_parent.sql", import.meta.url), "utf8");
const snapshotMigration = readFileSync(new URL("./0334_feature_203_execution_snapshots.sql", import.meta.url), "utf8");

describe("Feature 203 editor runtime migrations", () => {
  it("adds revision ancestry additively", () => {
    expect(parentMigration).toContain('ADD COLUMN IF NOT EXISTS "parentRevisionId"');
    expect(parentMigration).toContain("ON DELETE SET NULL");
    expect(parentMigration).not.toMatch(/DROP\s+(TABLE|COLUMN)/i);
  });

  it("pins snapshots to tenant/idempotency and the canonical worker job", () => {
    expect(snapshotMigration).toContain('CREATE TABLE IF NOT EXISTS "video_editor_execution_snapshots"');
    expect(snapshotMigration).toContain("video_editor_execution_snapshots_tenant_idempotency_unique");
    expect(snapshotMigration).toContain('REFERENCES "worker_jobs"("id")');
    expect(snapshotMigration).not.toMatch(/DROP\s+(TABLE|COLUMN)/i);
  });
});
