import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dirname, "..", "..", "..");
const migration = readFileSync(join(root, "apps/web/drizzle/0303_feature_186_unified_job_control_plane.sql"), "utf8");
const contractMigration = readFileSync(join(root, "apps/web/drizzle/0304_feature_186_contract_version.sql"), "utf8");
const timeoutMigration = readFileSync(join(root, "apps/web/drizzle/0305_feature_186_timeout_policy.sql"), "utf8");
const outboxMigration = readFileSync(join(root, "apps/web/drizzle/0306_feature_186_outbox_cancellation.sql"), "utf8");
const required = ["worker_job_attempts", "worker_job_dispatches", "worker_job_outbox", "worker_job_schedule_occurrences", "worker_job_settlements", "worker_jobs", "worker_job_events"];
const missing = required.filter(name => !migration.includes(`"${name}"`));
const requiredContractFields = ["definitionHash", "eventSequence", "eventIdempotencyKey", "fencingVersion", "publisherFencingVersion", "occurrenceKey"];
const missingContractFields = requiredContractFields.filter(field => !migration.includes(`"${field}"`));
const missingContractVersion = contractMigration.includes('ADD COLUMN IF NOT EXISTS "contractVersion"') ? [] : ["contractVersion"];
const missingTimeoutPolicy = timeoutMigration.includes('ADD COLUMN IF NOT EXISTS "timeoutPolicyJson"') ? [] : ["timeoutPolicyJson"];
const missingOutboxCancellation = outboxMigration.includes('ADD COLUMN IF NOT EXISTS "cancelledAt"') ? [] : ["cancelledAt"];
const forbidden = /\b(DROP\s+(TABLE|TYPE|COLUMN)|TRUNCATE|DELETE\s+FROM)\b/i.test(migration);
const artifacts = [
  "specs/feature/186-unified-job-control-plane-adapters/rollout-manifest.yaml",
  "specs/feature/186-unified-job-control-plane-adapters/runbook.md",
  "apps/web/scripts/backfill-unified-job-control-plane.ts",
].filter(path => !existsSync(join(root, path)));

if (missing.length || missingContractFields.length || missingContractVersion.length || missingTimeoutPolicy.length || missingOutboxCancellation.length || forbidden || artifacts.length) {
  console.error(JSON.stringify({ ok: false, missing, missingContractFields, missingContractVersion, missingTimeoutPolicy, missingOutboxCancellation, forbiddenMigrationOperation: forbidden, missingArtifacts: artifacts }));
  process.exit(1);
}
console.log(JSON.stringify({ ok: true, migration: "additive", cloudflareProductionProof: false }));
