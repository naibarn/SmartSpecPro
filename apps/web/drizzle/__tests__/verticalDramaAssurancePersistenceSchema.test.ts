import fs from "fs";
import path from "path";
import { describe, expect, it } from "vitest";

const drizzleDir = path.resolve(__dirname, "..");
const parentMigrationPath = path.join(
  drizzleDir,
  "0238_vertical_drama_story_generation_assurance.sql"
);
const successorMigrationPath = path.join(
  drizzleDir,
  "0245_vertical_drama_assurance_attempts_reconciliation.sql"
);
const schemaPath = path.join(drizzleDir, "schema.ts");

describe("vertical drama assurance durable persistence migration", () => {
  const parentMigration = fs.readFileSync(parentMigrationPath, "utf8");
  const successorMigration = fs.readFileSync(successorMigrationPath, "utf8");
  const schema = fs.readFileSync(schemaPath, "utf8");

  it("keeps Feature 152 migration 0238 as the untouched execution parent", () => {
    expect(parentMigration).toContain(
      'CREATE TABLE IF NOT EXISTS "vertical_drama_story_generation_runs"'
    );
    expect(parentMigration).toContain('"seriesId" bigint NOT NULL');
    expect(successorMigration).toContain(
      'ALTER COLUMN "seriesId" DROP NOT NULL'
    );
    expect(successorMigration).not.toContain("DROP COLUMN");
  });

  it("adds durable attempt/event/call relations and dual-readable parent projection fields", () => {
    expect(successorMigration).toContain(
      'CREATE TABLE IF NOT EXISTS "vertical_drama_assurance_attempts"'
    );
    expect(successorMigration).toContain(
      'CREATE TABLE IF NOT EXISTS "vertical_drama_assurance_events"'
    );
    expect(successorMigration).toContain(
      'CREATE TABLE IF NOT EXISTS "vertical_drama_assurance_calls"'
    );
    expect(successorMigration).toContain('"domainOwnerType" varchar(64)');
    expect(successorMigration).toContain('"domainOwnerId" varchar(128)');
    expect(successorMigration).toContain('"acceptedAttemptId" varchar(64)');
    expect(schema).toContain("export const verticalDramaAssuranceAttempts");
    expect(schema).toContain("export const verticalDramaAssuranceEvents");
    expect(schema).toContain("export const verticalDramaAssuranceCalls");
  });

  it("uses tenant-scoped idempotency, ordered events, and one active/accepted attempt fence", () => {
    expect(successorMigration).toContain('"vd_assurance_admission_unique"');
    expect(successorMigration).toContain(
      '"vd_assurance_attempt_identity_unique"'
    );
    expect(successorMigration).toContain(
      '"vd_assurance_event_sequence_unique"'
    );
    expect(successorMigration).toContain(
      '"vd_assurance_event_idempotency_unique"'
    );
    expect(successorMigration).toContain(
      '"vd_assurance_one_active_attempt_unique"'
    );
    expect(successorMigration).toContain(
      '"vd_assurance_one_accepted_attempt_unique"'
    );
    expect(successorMigration).toContain(
      '"vd_assurance_call_key_unique"'
    );
  });

  it("keeps legacy rows dual-readable while allowing a pre-create Draft QC owner", () => {
    expect(successorMigration).toContain('"projectionSchemaVersion" integer');
    expect(successorMigration).toContain(
      'ALTER COLUMN "seriesId" DROP NOT NULL'
    );
    expect(successorMigration).toContain('"domainOwnerType" IS NULL');
    expect(successorMigration).toContain('"domainOwnerId" IS NULL');
  });
});
