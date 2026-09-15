import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(new URL("./0303_feature_186_unified_job_control_plane.sql", import.meta.url), "utf8");
const contractMigration = readFileSync(new URL("./0304_feature_186_contract_version.sql", import.meta.url), "utf8");
const timeoutMigration = readFileSync(new URL("./0305_feature_186_timeout_policy.sql", import.meta.url), "utf8");
const cancellationMigration = readFileSync(new URL("./0306_feature_186_outbox_cancellation.sql", import.meta.url), "utf8");
const evidenceMigration = readFileSync(new URL("./0307_feature_186_action_callback_evidence.sql", import.meta.url), "utf8");
const reviewMigration = readFileSync(new URL("./0308_feature_186_operator_review_reason.sql", import.meta.url), "utf8");
const callbackTimestampMigration = readFileSync(new URL("./0315_feature_186_callback_timestamp.sql", import.meta.url), "utf8");
const providerAdmissionMigration = readFileSync(new URL("./0325_feature_186_provider_admission_polling.sql", import.meta.url), "utf8");
const providerAttemptMigration = readFileSync(new URL("./0326_feature_186_provider_attempt_windows.sql", import.meta.url), "utf8");
const providerAttemptRepairMigration = readFileSync(new URL("./0327_feature_186_provider_attempt_backfill_repair.sql", import.meta.url), "utf8");

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

  it("persists operator actions and authenticated callback replay evidence", () => {
    expect(evidenceMigration).toContain("CREATE TABLE IF NOT EXISTS \"worker_job_actions\"");
    expect(evidenceMigration).toContain("CREATE TABLE IF NOT EXISTS \"worker_job_callbacks\"");
    expect(reviewMigration).toContain('ADD COLUMN IF NOT EXISTS "operatorReviewReason"');
    expect(evidenceMigration).toContain("worker_job_actions_action_unique");
    expect(evidenceMigration).toContain("worker_job_callbacks_provider_event_unique");
    expect(evidenceMigration).toContain("worker_job_callbacks_replay_unique");
    expect(evidenceMigration).toContain("ON DELETE RESTRICT");
    expect(evidenceMigration).not.toMatch(/DROP TABLE|TRUNCATE|DELETE FROM/i);
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

  it("makes unpublished outbox cancellation durable and additive", () => {
    expect(cancellationMigration).toContain('ADD COLUMN IF NOT EXISTS "cancelledAt"');
    expect(cancellationMigration).toContain('DROP INDEX IF EXISTS "worker_job_outbox_due_idx"');
    expect(cancellationMigration).toContain("worker_job_outbox_due_idx");
    expect(cancellationMigration).not.toMatch(/DROP TABLE|TRUNCATE|DELETE FROM/i);
  });

  it("persists callback timestamps for bounded replay-window checks", () => {
    expect(callbackTimestampMigration).toContain('ADD COLUMN IF NOT EXISTS "occurredAt"');
    expect(callbackTimestampMigration).toContain("ALTER COLUMN \"occurredAt\" SET NOT NULL");
    expect(callbackTimestampMigration).not.toMatch(/DROP TABLE|TRUNCATE|DELETE FROM/i);
  });

  it("adds provider accounts, reservations, windows, and fairness state additively", () => {
    for (const table of [
      "llm_provider_accounts",
      "media_provider_accounts",
      "worker_job_provider_reservations",
      "provider_admission_windows",
      "provider_scheduler_states",
    ]) {
      expect(providerAdmissionMigration).toContain(`CREATE TABLE IF NOT EXISTS \"${table}\"`);
    }
    expect(providerAdmissionMigration).toContain("worker_job_provider_reservations_operation_unique");
    expect(providerAdmissionMigration).toContain("provider_admission_windows_scope_unique");
    expect(providerAdmissionMigration).toContain("provider_scheduler_states_pool_user_unique");
    expect(providerAdmissionMigration).toContain("INSERT INTO \"media_provider_accounts\"");
    expect(providerAdmissionMigration).not.toMatch(/DROP TABLE|TRUNCATE|DELETE FROM/i);
  });

  it("binds provider reservations to business attempts and enforces daily windows", () => {
    expect(providerAttemptMigration).toContain('ADD COLUMN IF NOT EXISTS "businessAttempt"');
    expect(providerAttemptMigration).toContain('FROM "worker_job_attempts" a');
    expect(providerAttemptMigration).toContain("worker_job_provider_reservations_job_business_attempt_kind_unique");
    expect(providerAttemptMigration).toContain("DROP INDEX IF EXISTS \"worker_job_provider_reservations_job_kind_null_attempt_unique\"");
    expect(providerAttemptMigration).not.toMatch(/DROP TABLE|TRUNCATE|DELETE FROM/i);
    expect(providerAttemptRepairMigration).toContain('FROM "worker_job_attempts" a');
    expect(providerAttemptRepairMigration).toContain("DROP INDEX IF EXISTS");
    expect(providerAttemptRepairMigration).toContain("worker_job_provider_reservations_job_business_attempt_kind_unique");
    expect(providerAttemptRepairMigration).not.toMatch(/DROP TABLE|TRUNCATE|DELETE FROM/i);
  });
});
