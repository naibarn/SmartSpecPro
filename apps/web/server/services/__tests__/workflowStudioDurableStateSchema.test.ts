import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { WorkflowSettlementError } from "../workflowStudioSettlement";

const schemaPath = fileURLToPath(
  new URL("../../../drizzle/schema.ts", import.meta.url)
);
const migrationPath = fileURLToPath(
  new URL(
    "../../../drizzle/0365_spec215_durable_logical_runtime.sql",
    import.meta.url
  )
);

describe("Spec 215 durable logical execution persistence", () => {
  it("uses typed settlement failures for stale or incomplete physical evidence", () => {
    expect(new WorkflowSettlementError("WORKFLOW_FENCE_MISMATCH").code).toBe(
      "WORKFLOW_FENCE_MISMATCH"
    );
  });

  it("stores a pinned execution plan on the logical workflow run", () => {
    const schema = readFileSync(schemaPath, "utf8");
    expect(schema).toMatch(/executionPlanJson:\s*jsonb\("executionPlanJson"\)/);
    expect(schema).toMatch(/planHash:\s*varchar\("planHash"/);
    expect(schema).toMatch(
      /selectedNodeIdsJson:\s*jsonb\("selectedNodeIdsJson"\)/
    );
  });

  it("persists tenant-scoped node runs and attempts linked to Feature 195 jobs", () => {
    const schema = readFileSync(schemaPath, "utf8");
    expect(schema).toMatch(/pgTable\([\s\n]*"workflow_studio_node_runs"/);
    expect(schema).toMatch(/pgTable\([\s\n]*"workflow_studio_node_attempts"/);
    expect(schema).toMatch(
      /workerJobId:[\s\S]{0,260}references\(\(\) => workerJobs\.id/
    );
    expect(schema).toMatch(
      /workerAttemptId:[\s\S]{0,300}references\(\(\) => workerJobAttempts\.id/
    );
    expect(schema).toMatch(/'pending', 'ready', 'dispatching', 'admitted'/);
  });

  it("adds the durable schema with tenant/run and attempt idempotency constraints", () => {
    const migration = readFileSync(migrationPath, "utf8");
    expect(migration).toContain('ADD COLUMN "selectedNodeIdsJson" jsonb');
    expect(migration).toContain(
      'CREATE TABLE IF NOT EXISTS "workflow_studio_node_runs"'
    );
    expect(migration).toContain(
      'CREATE TABLE IF NOT EXISTS "workflow_studio_node_attempts"'
    );
    expect(migration).toContain('REFERENCES "worker_jobs"("id")');
    expect(migration).toContain('REFERENCES "worker_job_attempts"("id")');
    expect(migration).toContain('"workflow_studio_node_runs_run_node_unique"');
    expect(migration).toContain(
      '"workflow_studio_node_attempts_node_attempt_unique"'
    );
    expect(migration).toContain('"workflow_studio_node_attempts_job_unique"');
    expect(migration).toContain('"workflow_studio_node_runs_status_check"');
    expect(migration).toMatch(/'pending', 'ready', 'dispatching', 'admitted'/);
    expect(migration).toContain('"workflow_studio_node_attempts_status_check"');
  });
});
