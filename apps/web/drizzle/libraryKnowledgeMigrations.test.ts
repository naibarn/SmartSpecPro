import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const migrationNames = [
  "0157_library_md_knowledge_vault.sql",
  "0158_library_index_job_payloads.sql",
  "0159_library_context_pack_review_events.sql",
  "0160_library_knowledge_telemetry_events.sql",
  "0161_library_knowledge_release_gate_overrides.sql",
  "0162_library_knowledge_override_governance.sql",
] as const;

function readMigration(name: (typeof migrationNames)[number]): string {
  return fs.readFileSync(path.join(process.cwd(), "drizzle", name), "utf8");
}

describe("Library Knowledge Vault migrations", () => {
  it("keeps all Knowledge Vault migrations additive and idempotent", () => {
    for (const name of migrationNames) {
      const sql = readMigration(name);

      expect(sql).toMatch(/\bIF NOT EXISTS\b/i);
      expect(sql).not.toMatch(/\bDROP\s+TABLE\b/i);
      expect(sql).not.toMatch(/\bDROP\s+COLUMN\b/i);
      expect(sql).not.toMatch(/\bDROP\s+TYPE\b/i);
      expect(sql).not.toMatch(/\bTRUNCATE\b/i);
    }
  });

  it("creates the core navigation, saved view, and context pack tables", () => {
    const sql = readMigration("0157_library_md_knowledge_vault.sql");

    expect(sql).toContain('CREATE TABLE IF NOT EXISTS "library_knowledge_notes"');
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS "library_knowledge_relations"');
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS "library_saved_views"');
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS "library_context_packs"');
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS "library_context_pack_members"');
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS "library_knowledge_backfill_runs"');

    expect(sql).toContain('"tenant_id"');
    expect(sql).toContain('"visibility_mode"');
    expect(sql).toContain('"readiness_status"');
    expect(sql).toContain('"approved_for_agents"');
    expect(sql).toContain('"default_runtime_tier"');
    expect(sql).toContain('"source_library_item_id"');
    expect(sql).toContain('"target_library_item_id"');
  });

  it("extends index jobs with durable refresh payloads and retry state", () => {
    const sql = readMigration("0158_library_index_job_payloads.sql");

    expect(sql).toContain('ALTER TABLE "library_index_jobs"');
    expect(sql).toContain('ADD COLUMN IF NOT EXISTS "payload_version"');
    expect(sql).toContain('ADD COLUMN IF NOT EXISTS "payload_json"');
    expect(sql).toContain('ADD COLUMN IF NOT EXISTS "source_metadata_json"');
    expect(sql).toContain('ADD COLUMN IF NOT EXISTS "dedupe_key"');
    expect(sql).toContain('ADD COLUMN IF NOT EXISTS "knowledge_refresh_status"');
    expect(sql).toContain('ADD COLUMN IF NOT EXISTS "knowledge_refresh_attempt_count"');
    expect(sql).toContain('ADD COLUMN IF NOT EXISTS "knowledge_refresh_requested_at"');
    expect(sql).toContain('ADD COLUMN IF NOT EXISTS "knowledge_refresh_completed_at"');
    expect(sql).toContain('CREATE INDEX IF NOT EXISTS "library_index_jobs_knowledge_refresh_idx"');
  });

  it("creates an auditable context pack review event ledger", () => {
    const sql = readMigration("0159_library_context_pack_review_events.sql");

    expect(sql).toContain('CREATE TABLE IF NOT EXISTS "library_context_pack_review_events"');
    expect(sql).toContain('"previous_readiness_status"');
    expect(sql).toContain('"next_readiness_status"');
    expect(sql).toContain('"previous_approved_for_agents"');
    expect(sql).toContain('"next_approved_for_agents"');
    expect(sql).toContain('"metadata" json NOT NULL DEFAULT');
    expect(sql).toContain('CREATE INDEX IF NOT EXISTS "library_context_pack_review_events_pack_idx"');
    expect(sql).toContain('CREATE INDEX IF NOT EXISTS "library_context_pack_review_events_tenant_idx"');
  });

  it("creates durable Knowledge Vault telemetry and release override ledgers", () => {
    const telemetrySql = readMigration("0160_library_knowledge_telemetry_events.sql");
    const overrideSql = readMigration("0161_library_knowledge_release_gate_overrides.sql");
    const governanceSql = readMigration("0162_library_knowledge_override_governance.sql");

    expect(telemetrySql).toContain('CREATE TABLE IF NOT EXISTS "library_knowledge_telemetry_events"');
    expect(overrideSql).toContain('CREATE TABLE IF NOT EXISTS "library_knowledge_release_gate_overrides"');
    expect(overrideSql).toContain('"actor_user_id"');
    expect(overrideSql).toContain('"approved_by_user_id"');
    expect(overrideSql).toContain('"expires_at"');
    expect(overrideSql).toContain('CREATE TABLE IF NOT EXISTS "library_knowledge_telemetry_rollups"');
    expect(overrideSql).toContain('"sample_count" >= 0');
    expect(overrideSql).toContain('"event_type" IN');
    expect(governanceSql).toContain('ADD COLUMN IF NOT EXISTS "override_mode"');
    expect(governanceSql).toContain('ADD COLUMN IF NOT EXISTS "approved_at"');
    expect(governanceSql).toContain('ADD COLUMN IF NOT EXISTS "approval_reason"');
    expect(governanceSql).toContain('ADD COLUMN IF NOT EXISTS "rejected_at"');
    expect(governanceSql).toContain('ADD COLUMN IF NOT EXISTS "rejected_by_user_id"');
    expect(governanceSql).toContain('ADD COLUMN IF NOT EXISTS "rejected_reason"');
    expect(governanceSql).toContain("'pending_approval'");
    expect(governanceSql).toContain("'break_glass'");
  });
});
