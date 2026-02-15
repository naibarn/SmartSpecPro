/**
 * Tests for cloud_task_events table schema definition.
 * Validates the Drizzle schema object without requiring a live database.
 */

import { describe, it, expect } from "vitest";
import { getTableName, getTableColumns } from "drizzle-orm";
import { getTableConfig } from "drizzle-orm/pg-core";

describe("cloud_task_events schema", () => {
  it("table exists with expected columns after import", async () => {
    const { cloudTaskEvents } = await import("@db/schema");

    expect(getTableName(cloudTaskEvents)).toBe("cloud_task_events");

    const columns = getTableColumns(cloudTaskEvents);

    // Verify all expected columns exist
    expect(columns).toHaveProperty("id");
    expect(columns).toHaveProperty("taskId");
    expect(columns).toHaveProperty("queueName");
    expect(columns).toHaveProperty("jobId");
    expect(columns).toHaveProperty("status");
    expect(columns).toHaveProperty("attemptCount");
    expect(columns).toHaveProperty("payload");
    expect(columns).toHaveProperty("errorMessage");
    expect(columns).toHaveProperty("createdAt");
    expect(columns).toHaveProperty("completedAt");

    // Verify required columns are not nullable
    expect(columns.taskId.notNull).toBe(true);
    expect(columns.queueName.notNull).toBe(true);
    expect(columns.status.notNull).toBe(true);
    expect(columns.attemptCount.notNull).toBe(true);
    expect(columns.createdAt.notNull).toBe(true);

    // Verify nullable columns
    expect(columns.jobId.notNull).toBe(false);
    expect(columns.errorMessage.notNull).toBe(false);
    expect(columns.completedAt.notNull).toBe(false);
  });

  it("has appropriate indexes for taskId and status lookups", async () => {
    const { cloudTaskEvents } = await import("@db/schema");

    const config = getTableConfig(cloudTaskEvents);
    const indexNames = config.indexes.map((idx) => idx.config.name);

    expect(indexNames).toContain("cloud_task_events_task_id_idx");
    expect(indexNames).toContain("cloud_task_events_status_idx");
    expect(indexNames).toContain("cloud_task_events_queue_name_idx");
    expect(indexNames).toContain("cloud_task_events_job_id_idx");
  });

  it("exports CloudTaskEvent and InsertCloudTaskEvent types", async () => {
    const schema = await import("@db/schema");

    // Verify the table export exists (types are compile-time only,
    // but we can verify the table is exported)
    expect(schema.cloudTaskEvents).toBeDefined();
  });
});
