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

    expect(migrations.length).toBeGreaterThanOrEqual(7);
    expect(migrations[migrations.length - 1]).toContain(
      "007_library_backfill_campaign"
    );
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
});
