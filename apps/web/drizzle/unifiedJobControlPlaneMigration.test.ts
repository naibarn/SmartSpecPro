import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(new URL("./0303_feature_186_unified_job_control_plane.sql", import.meta.url), "utf8");
const contractMigration = readFileSync(new URL("./0304_feature_186_contract_version.sql", import.meta.url), "utf8");
const timeoutMigration = readFileSync(new URL("./0305_feature_186_timeout_policy.sql", import.meta.url), "utf8");

describe("Feature 186 migration contract", () => {
  it("is additive and preserves legacy status values", () => {
    expect(migration).toContain("ADD VALUE IF NOT EXISTS 'pending'");
    expect(migration).toContain("ADD VALUE IF NOT EXISTS 'cancelled'");
    expect(migration).toContain("ADD COLUMN IF NOT EXISTS \"definitionHash\"");
    expect(migration).toContain("CREATE TABLE IF NOT EXISTS \"worker_job_attempts\"");
    expect(migration).toContain("CREATE TABLE IF NOT EXISTS \"worker_job_dispatches\"");
    expect(migration).toContain("CREATE TABLE IF NOT EXISTS \"worker_job_outbox\"");
    expect(migration).toContain("CREATE TABLE IF NOT EXISTS \"worker_job_schedule_occurrences\"");
    expect(migration).toContain("CREATE TABLE IF NOT EXISTS \"worker_job_settlements\"");
    expect(migration).not.toMatch(/DROP TABLE|TRUNCATE|DELETE FROM/i);
  });

  it("protects event, publication, external-reference, and schedule uniqueness", () => {
    for (const indexName of [
      "worker_job_events_job_event_sequence_unique",
      "worker_job_events_idempotency_unique",
      "worker_job_dispatches_dedupe_unique",
      "worker_job_dispatches_provider_ref_unique",
      "worker_job_dispatches_queue_ref_unique",
      "worker_job_dispatches_celery_ref_unique",
      "worker_job_outbox_dedupe_unique",
      "worker_job_schedule_occurrence_unique",
      "worker_job_settlements_key_unique",
    ]) {
      expect(migration).toContain(indexName);
    }
  });

  it("persists the envelope contract version without replacing the job ledger", () => {
    expect(contractMigration).toContain('ADD COLUMN IF NOT EXISTS "contractVersion"');
    expect(contractMigration).not.toMatch(/DROP TABLE|TRUNCATE|DELETE FROM/i);
  });

  it("persists soft and hard timeout policy on the canonical row", () => {
    expect(timeoutMigration).toContain('ADD COLUMN IF NOT EXISTS "timeoutPolicyJson"');
    expect(timeoutMigration).not.toMatch(/DROP TABLE|TRUNCATE|DELETE FROM/i);
  });
});
