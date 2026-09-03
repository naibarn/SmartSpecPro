/**
 * Tests for migration ordering between Drizzle (Node.js) and Alembic (Python).
 * Validates that schema definitions and migration files are consistent.
 */

import { describe, it, expect } from "vitest";
import { getTableName, getTableColumns } from "drizzle-orm";
import fs from "fs";
import path from "path";

describe("migration ordering", () => {
  it("cloudTaskEvents table is defined in Drizzle schema", async () => {
    const { cloudTaskEvents } = await import("@db/schema");
    expect(getTableName(cloudTaskEvents)).toBe("cloud_task_events");

    const columns = getTableColumns(cloudTaskEvents);
    expect(Object.keys(columns)).toContain("id");
    expect(Object.keys(columns)).toContain("taskId");
    expect(Object.keys(columns)).toContain("queueName");
    expect(Object.keys(columns)).toContain("status");
  });

  it("Python MediaTask model includes cloud_task_id column", () => {
    const modelPath = path.resolve(
      import.meta.dirname,
      "../../../../python-backend/app/models/media_task.py"
    );

    expect(fs.existsSync(modelPath)).toBe(true);
    const content = fs.readFileSync(modelPath, "utf-8");
    expect(content).toContain('__tablename__ = "media_tasks"');
    expect(content).toContain("cloud_task_id");
  });

  it("Python migration 005 adds cloud_task_id with IF NOT EXISTS", () => {
    const migrationPath = path.resolve(
      import.meta.dirname,
      "../../../../python-backend/migrations/005_add_cloud_task_id.py"
    );

    expect(fs.existsSync(migrationPath)).toBe(true);

    const content = fs.readFileSync(migrationPath, "utf-8");
    expect(content).toContain("IF NOT EXISTS");
    expect(content).toContain("cloud_task_id");
    expect(content).toContain("VARCHAR(512)");
  });

  it("migration files exist in correct order", () => {
    const migrationsDir = path.resolve(
      import.meta.dirname,
      "../../../../python-backend/migrations"
    );

    const migrations = fs
      .readdirSync(migrationsDir)
      .filter((f: string) => f.match(/^\d{3}_/))
      .sort();

    expect(migrations.length).toBeGreaterThanOrEqual(13);
    expect(migrations).toContain("008_library_provider_switch_state.py");
    expect(migrations[migrations.length - 1]).toContain(
      "013_add_media_task_tenant_id"
    );
  });

  it("finance foundation migrations are ordered and present in the web drizzle folder", () => {
    const migrationsDir = path.resolve(
      import.meta.dirname,
      "../../../../apps/web/drizzle"
    );

    const migrations = fs
      .readdirSync(migrationsDir)
      .filter((f: string) => /^\d{4}_.+\.sql$/.test(f))
      .sort();

    const foundationFile = "0138_private_personal_finance_foundation.sql";
    const backstopFile = "0139_private_personal_finance_security_backstop.sql";
    const vectorIndexFile = "0140_private_personal_finance_vector_index_name.sql";
    const counterpartiesFile = "0141_private_personal_finance_counterparties.sql";
    const paymentInstrumentsFile = "0142_private_personal_finance_payment_instruments.sql";
    const foundationIndex = migrations.indexOf(foundationFile);
    const backstopIndex = migrations.indexOf(backstopFile);
    const vectorIndexFileIndex = migrations.indexOf(vectorIndexFile);
    const counterpartiesIndex = migrations.indexOf(counterpartiesFile);
    const paymentInstrumentsIndex = migrations.indexOf(paymentInstrumentsFile);

    expect(foundationIndex).toBeGreaterThan(-1);
    expect(backstopIndex).toBeGreaterThan(foundationIndex);
    expect(vectorIndexFileIndex).toBeGreaterThan(backstopIndex);
    expect(counterpartiesIndex).toBeGreaterThan(vectorIndexFileIndex);
    expect(paymentInstrumentsIndex).toBeGreaterThan(counterpartiesIndex);
    expect(migrations[foundationIndex - 1]).toBe("0137_desktop_installer_distribution.sql");
  });

  it("finance foundation migration creates the new finance tables and keeps legacy library rows compatibility-only", () => {
    const foundationPath = path.resolve(
      import.meta.dirname,
      "../../../../apps/web/drizzle/0138_private_personal_finance_foundation.sql"
    );

    expect(fs.existsSync(foundationPath)).toBe(true);

    const content = fs.readFileSync(foundationPath, "utf-8");
    expect(content).toContain('CREATE TYPE "public"."finance_transaction_type"');
    expect(content).toContain('CREATE TABLE IF NOT EXISTS "finance_transactions"');
    expect(content).toContain('CREATE TABLE IF NOT EXISTS "finance_drafts"');
    expect(content).toContain('CREATE TABLE IF NOT EXISTS "document_extractions"');
    expect(content).toContain('CREATE TABLE IF NOT EXISTS "finance_transaction_documents"');
    expect(content).toContain('ADD COLUMN IF NOT EXISTS "project_id" varchar(100)');
    expect(content).toContain('"source_message_id" integer');
    expect(content).toContain("compatibility-only");
    expect(content).toContain("tombstone finance-backed library rows");
  });

  it("finance security backstop migration enables RLS on the finance tables", () => {
    const backstopPath = path.resolve(
      import.meta.dirname,
      "../../../../apps/web/drizzle/0139_private_personal_finance_security_backstop.sql"
    );

    expect(fs.existsSync(backstopPath)).toBe(true);

    const content = fs.readFileSync(backstopPath, "utf-8");
    expect(content).toContain("ENABLE ROW LEVEL SECURITY");
    expect(content).toContain("FORCE ROW LEVEL SECURITY");
    expect(content).toContain("CREATE POLICY \"finance_transactions_tenant_scope\"");
    expect(content).toContain("CREATE POLICY \"finance_drafts_tenant_scope\"");
    expect(content).toContain("CREATE POLICY \"finance_recurring_rules_tenant_scope\"");
    expect(content).toContain("CREATE POLICY \"document_extractions_tenant_scope\"");
    expect(content).toContain("CREATE POLICY \"finance_transaction_documents_tenant_scope\"");
    expect(content).toContain("app.current_tenant_id");
    expect(content).toContain("app.current_user_id");
    expect(content).toContain("app.current_project_id");
  });

  it("finance vector cleanup migration persists vector index names for library chunks", () => {
    const vectorIndexPath = path.resolve(
      import.meta.dirname,
      "../../../../apps/web/drizzle/0140_private_personal_finance_vector_index_name.sql"
    );

    expect(fs.existsSync(vectorIndexPath)).toBe(true);

    const content = fs.readFileSync(vectorIndexPath, "utf-8");
    expect(content).toContain('ADD COLUMN IF NOT EXISTS "vector_index_name" varchar(128)');
    expect(content).toContain('library_chunks_vector_index_name_idx');
    expect(content).toContain("compatibility-only");
  });

  it("finance payment instrument migration creates the new bank/account tables and enums", () => {
    const migrationPath = path.resolve(
      import.meta.dirname,
      "../../../../apps/web/drizzle/0142_private_personal_finance_payment_instruments.sql"
    );

    expect(fs.existsSync(migrationPath)).toBe(true);

    const content = fs.readFileSync(migrationPath, "utf-8");
    expect(content).toContain("finance_payment_institutions");
    expect(content).toContain("finance_payment_accounts");
    expect(content).toContain("finance_payment_account_aliases");
    expect(content).toContain("finance_payment_direction");
    expect(content).toContain("transfer_slip");
    expect(content).toContain("payment_source_account_id");
    expect(content).toContain("payment_destination_account_id");
  });

  it("Work OS migration metadata keeps the journal entry and snapshot file in sync", () => {
    const journalPath = path.resolve(
      import.meta.dirname,
      "../../../../apps/web/drizzle/meta/_journal.json"
    );
    const snapshotPath = path.resolve(
      import.meta.dirname,
      "../../../../apps/web/drizzle/meta/0147_snapshot.json"
    );

    expect(fs.existsSync(journalPath)).toBe(true);
    expect(fs.existsSync(snapshotPath)).toBe(true);

    const journal = JSON.parse(fs.readFileSync(journalPath, "utf-8"));
    const entries = journal.entries ?? journal;
    const targetEntry = entries.find((entry: { tag?: string; idx?: number }) => entry.tag === "0147_private_personal_finance_transfer_slip_fields");
    expect(targetEntry).toBeTruthy();
    expect(targetEntry?.idx).toBeGreaterThan(0);

    const snapshot = JSON.parse(fs.readFileSync(snapshotPath, "utf-8"));
    expect(snapshot.version).toBe("7");
    expect(snapshot.prevId).toBeTruthy();
    expect(Object.keys(snapshot.tables)).toEqual(expect.arrayContaining([
      "public.work_requests",
      "public.work_cases",
      "public.work_assignments",
      "public.work_approvals",
      "public.work_exceptions",
      "public.work_outcomes",
      "public.work_slas",
      "public.work_os_events",
    ]));
  });

  it("Work OS migration SQL and snapshot naming stay aligned with the migration sequence", () => {
    const migrationsDir = path.resolve(
      import.meta.dirname,
      "../../../../apps/web/drizzle"
    );
    const metaDir = path.resolve(
      import.meta.dirname,
      "../../../../apps/web/drizzle/meta"
    );

    const migrations = fs
      .readdirSync(migrationsDir)
      .filter((f: string) => /^\d{4}_.+\.sql$/.test(f))
      .sort();
    const migrationFile = "0147_private_personal_finance_transfer_slip_fields.sql";
    const previousMigrationFile = "0146_work_os_case_ledger_and_operating_queues.sql";
    const snapshotFile = "0147_snapshot.json";

    expect(migrations).toContain(migrationFile);
    expect(fs.existsSync(path.join(metaDir, snapshotFile))).toBe(true);

    const migrationIndex = migrations.indexOf(migrationFile);
    const previousMigrationIndex = migrations.indexOf(previousMigrationFile);
    expect(migrationIndex).toBeGreaterThan(previousMigrationIndex);

    const migrationPrefix = migrationFile.split("_")[0];
    const snapshotPrefix = snapshotFile.split("_")[0];
    expect(migrationPrefix).toBe(snapshotPrefix);
  });

  it("Python migration 006 defines pgvector extension and tenant RLS", () => {
    const migrationPath = path.resolve(
      import.meta.dirname,
      "../../../../python-backend/migrations/006_pgvector_tenant_rls.py"
    );

    expect(fs.existsSync(migrationPath)).toBe(true);
    const content = fs.readFileSync(migrationPath, "utf-8");
    expect(content).toContain("CREATE EXTENSION IF NOT EXISTS");
    expect(content).toContain('VECTOR_EXTENSION_NAME = "vector"');
    expect(content).toContain("ENABLE ROW LEVEL SECURITY");
    expect(content).toContain("FORCE ROW LEVEL SECURITY");
    expect(content).toContain("library_chunk_vectors_tenant_select");
  });

  it("Python migration 007 defines backfill campaign persistence table", () => {
    const migrationPath = path.resolve(
      import.meta.dirname,
      "../../../../python-backend/migrations/007_library_backfill_campaign.py"
    );

    expect(fs.existsSync(migrationPath)).toBe(true);
    const content = fs.readFileSync(migrationPath, "utf-8");
    expect(content).toContain("library_backfill_campaigns");
    expect(content).toContain("CREATE TABLE IF NOT EXISTS");
    expect(content).toContain("queued_count");
    expect(content).toContain("processed_count");
  });

  it("Python migration 008 defines provider switch-state persistence table", () => {
    const migrationPath = path.resolve(
      import.meta.dirname,
      "../../../../python-backend/migrations/008_library_provider_switch_state.py"
    );

    expect(fs.existsSync(migrationPath)).toBe(true);
    const content = fs.readFileSync(migrationPath, "utf-8");
    expect(content).toContain("library_provider_switch_states");
    expect(content).toContain("current_read_provider");
    expect(content).toContain("target_provider");
    expect(content).toContain("switch_version");
  });
});
