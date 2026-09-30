import { afterAll, beforeAll, describe, expect, it } from "vitest";
import postgres from "postgres";
import { randomUUID } from "node:crypto";

const enabled = process.env.RUN_DB_INTEGRATION_TESTS === "true";
const describeDb = enabled ? describe : describe.skip;
const connectionString =
  process.env.DATABASE_URL ?? "postgresql://localhost/spec224_skipped_test";
let sql: ReturnType<typeof postgres>;
let tenantId = "";
let userId = 0;
let jobId = "";

describeDb("Spec 224 runner admission audit PostgreSQL", () => {
  beforeAll(async () => {
    sql = postgres(connectionString, { max: 3, connect_timeout: 5 });
    tenantId = randomUUID();
    jobId = randomUUID();
    const [user] = await sql`
      INSERT INTO users ("openId", role, plan, credits, "isDisabled")
      VALUES (${`spec224-audit-${tenantId}`}, 'user', 'free', 0, false)
      RETURNING id
    `;
    userId = Number(user.id);
    await sql`
      INSERT INTO tenants (id, slug, name, "isActive", status, plan, created_at, "createdAt", "updatedAt")
      VALUES (${tenantId}, ${`${tenantId}-slug`}, 'Spec 224 admission audit test', true, 'ACTIVE', 'FREE', NOW(), NOW(), NOW())
    `;
    await sql`
      INSERT INTO worker_jobs (
        id, "tenantId", "runtimeType", "requestedByUserId", "jobType", status,
        "executionClass", "contractVersion", "inputJson", "progressJson", attempt,
        "maxAttempts", "fencingVersion", "createdAt"
      ) VALUES (
        ${jobId}, ${tenantId}, 'node_job_worker', ${userId}, 'external_agent_task', 'running',
        'external', 'feature-186-v1', ${sql.json({})}, ${sql.json({})}, 1,
        1, 1, NOW()
      )
    `;
    await sql`
      INSERT INTO worker_job_attempts ("workerJobId", attempt, "leaseGeneration", "createdAt")
      VALUES (${jobId}, 1, 1, NOW())
    `;
  });

  afterAll(async () => {
    if (!sql) return;
    await sql`DELETE FROM worker_job_events WHERE "workerJobId" = ${jobId}`;
    await sql`DELETE FROM worker_job_attempts WHERE "workerJobId" = ${jobId}`;
    await sql`DELETE FROM worker_jobs WHERE id = ${jobId}`;
    if (tenantId) await sql`DELETE FROM tenants WHERE id = ${tenantId}`;
    if (userId) await sql`DELETE FROM users WHERE id = ${userId}`;
    await sql.end({ timeout: 5 });
  });

  it("persists one idempotent denial event without creating a dispatch intent", async () => {
    const [{ id: attemptId }] = await sql`
      SELECT id FROM worker_job_attempts WHERE "workerJobId" = ${jobId} AND attempt = 1
    `;
    const { recordSpec224RunnerDispatchDenied } =
      await import("../spec224AdmissionAudit");
    const input = {
      workerJobId: jobId,
      attemptId: String(attemptId),
      commandId: "spec224-audit-command-1",
      attempt: 1,
      fencingToken: 1,
    };
    await Promise.all([
      recordSpec224RunnerDispatchDenied(input),
      recordSpec224RunnerDispatchDenied(input),
    ]);
    await expect(
      recordSpec224RunnerDispatchDenied({ ...input, fencingToken: 2 })
    ).rejects.toThrow("SPEC224_ADMISSION_DENIAL_AUDIT_CONFLICT");
    const events = await sql`
      SELECT "eventType", "eventIdempotencyKey", "payloadJson"
      FROM worker_job_events
      WHERE "workerJobId" = ${jobId}
        AND "eventIdempotencyKey" = 'spec224:runner-admission-denied:spec224-audit-command-1'
    `;
    expect(events).toHaveLength(1);
    expect(events[0]!.eventType).toBe("SPEC224_RUNNER_DISPATCH_DENIED");
    expect(events[0]!.payloadJson).toEqual({
      commandId: input.commandId,
      reason: "DENIED_CANONICAL_START_NOT_COMMITTED",
      attempt: 1,
      fenceVersion: 1,
    });
    await expect(
      sql`SELECT id FROM worker_job_outbox WHERE "workerJobId" = ${jobId}`
    ).resolves.toHaveLength(0);
  }, 30_000);
});
