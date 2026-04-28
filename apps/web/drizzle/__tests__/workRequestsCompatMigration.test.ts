import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("work requests compatibility migration", () => {
  it("backfills columns needed by My Requests when the table already exists", () => {
    const migrationPath = path.resolve(
      import.meta.dirname,
      "../0167_work_requests_compat_columns.sql"
    );

    const content = fs.readFileSync(migrationPath, "utf-8");

    expect(content).toContain('ALTER TABLE "work_requests"');
    [
      "requesterId",
      "defaultQueueId",
      "linkedConversationIdsJson",
      "linkedWorkpackRunIdsJson",
      "linkedRoleRoutineRunIdsJson",
      "linkedCaseId",
      "idempotencyKey",
      "idempotencyFingerprint",
    ].forEach(column => {
      expect(content).toContain(`ADD COLUMN IF NOT EXISTS "${column}"`);
    });

    expect(content).toContain("work_requests_tenant_state_idx");
    expect(content).toContain("work_requests_tenant_idempotency_unique");
  });

  it("is registered in the drizzle migration journal", () => {
    const journalPath = path.resolve(
      import.meta.dirname,
      "../meta/_journal.json"
    );

    const journal = JSON.parse(fs.readFileSync(journalPath, "utf-8"));
    expect(journal.entries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          tag: "0167_work_requests_compat_columns",
        }),
      ])
    );
  });
});
