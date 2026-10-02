import { afterAll, beforeAll, describe, expect, it } from "vitest";
import postgres from "postgres";
import { randomUUID } from "node:crypto";

import { spec224RecoveryGrantBindingStateIsCurrent } from "../spec224RecoveryGrantBinding";

const enabled = process.env.RUN_DB_INTEGRATION_TESTS === "true";
const describeDb = enabled ? describe : describe.skip;
const connectionString =
  process.env.DATABASE_URL ?? "postgresql://localhost/spec224_skipped_test";
const tenantId = randomUUID();
const runId = randomUUID();
const jobId = randomUUID();
const runnerId = `spec224-binding-${randomUUID()}`;
const sessionId = randomUUID();
const snapshotId = randomUUID();
const snapshotRevision = `revision-${randomUUID()}`;
let sql: ReturnType<typeof postgres>;
let ownerId: number;

describeDb("Spec 224 recovery grant binding state PostgreSQL", () => {
  beforeAll(async () => {
    sql = postgres(connectionString, { max: 3, connect_timeout: 5 });
    const [user] = await sql`
      INSERT INTO users ("openId", role, plan, credits, "isDisabled")
      VALUES (${`spec224-binding-${tenantId}`}, 'user', 'free', 0, false)
      RETURNING id
    `;
    ownerId = Number(user.id);
    await sql`
      INSERT INTO tenants (id, slug, name, "ownerId", "isActive", status, plan, created_at, "createdAt", "updatedAt")
      VALUES (${tenantId}, ${`${tenantId}-slug`}, 'Spec 224 binding test', ${ownerId}, true, 'ACTIVE', 'FREE', NOW(), NOW(), NOW())
    `;
    const binding = {
      runnerId,
      runnerSessionId: sessionId,
      capabilitySnapshotId: snapshotId,
      capabilitySnapshotRevision: snapshotRevision,
    };
    await sql`
      INSERT INTO runner_nodes ("runnerId", "tenantId", "ownerUserId", "nodeKind", "profile", "displayName", "trustState", "status", "currentSnapshotRevision", "activeSessionId")
      VALUES (${runnerId}, ${tenantId}, ${ownerId}, 'rust_runner', 'development', 'Spec 224 binding test', 'trusted', 'online', ${snapshotRevision}, ${sessionId})
    `;
    await sql`
      INSERT INTO runner_capability_snapshots (id, "runnerId", "tenantId", revision, "idempotencyKey", "observedAt", "expiresAt", "snapshotJson")
      VALUES (${snapshotId}, ${runnerId}, ${tenantId}, ${snapshotRevision}, ${`spec224-binding-${snapshotId}`}, NOW(), NOW() + INTERVAL '10 minutes', ${sql.json({ capabilitySnapshotId: snapshotId, runnerSessionId: sessionId })})
    `;
    await sql`
      INSERT INTO worker_jobs (id, "tenantId", "runtimeType", "requestedByUserId", "jobType", status, "executionClass", "contractVersion", "inputJson", "progressJson", attempt, "maxAttempts", "fencingVersion", "createdAt")
      VALUES (${jobId}, ${tenantId}, 'node_job_worker', ${ownerId}, 'external_agent_task', 'running', 'external', 'feature-186-v1', ${sql.json({})}, ${sql.json(
        {
          spec224: {
            runId,
            tenantId,
            actorId: ownerId,
            workPackageId: "WP-RECOVERY-04",
            workerJobId: jobId,
            projectionVersion: 2,
            decisionEpoch: 3,
            fencingVersion: 5,
          },
          spec224Authorization: { binding },
        }
      )}, 1, 1, 4, NOW())
    `;
    await sql`
      INSERT INTO worker_job_attempts ("workerJobId", attempt, "leaseGeneration", "startedAt", "createdAt")
      VALUES (${jobId}, 1, 1, NOW(), NOW())
    `;
  });

  afterAll(async () => {
    if (!sql) return;
    await sql`DELETE FROM worker_job_events WHERE "workerJobId" = ${jobId}`;
    await sql`DELETE FROM worker_job_outbox WHERE "workerJobId" = ${jobId}`;
    await sql`DELETE FROM worker_job_attempts WHERE "workerJobId" = ${jobId}`;
    await sql`DELETE FROM worker_jobs WHERE id = ${jobId}`;
    await sql`DELETE FROM tenants WHERE id = ${tenantId}`;
    await sql`DELETE FROM users WHERE id = ${ownerId}`;
    await sql.end({ timeout: 5 });
  });

  it("rejects a persisted cancel request even while the job remains running", async () => {
    const [job] = await sql`
      SELECT status, "statusReason", attempt, "fencingVersion", "progressJson"
      FROM worker_jobs WHERE id = ${jobId} AND "tenantId" = ${tenantId}
    `;
    const [attempt] = await sql`
      SELECT id, "finishedAt" FROM worker_job_attempts
      WHERE "workerJobId" = ${jobId} AND attempt = 1
    `;
    const [runner] = await sql`
      SELECT "ownerUserId", status, "trustState", "activeSessionId", "currentSnapshotRevision", "revokedAt"
      FROM runner_nodes WHERE "runnerId" = ${runnerId} AND "tenantId" = ${tenantId}
    `;
    const [capability] = await sql`
      SELECT "expiresAt", "snapshotJson" FROM runner_capability_snapshots
      WHERE id = ${snapshotId} AND "runnerId" = ${runnerId} AND "tenantId" = ${tenantId}
    `;
    const run = job.progressJson.spec224;
    const expectedBinding = job.progressJson.spec224Authorization.binding;
    const predicateInput = {
      tenantOwnerId: ownerId,
      expectedOwnerId: ownerId,
      jobStatus: job.status,
      jobStatusReason: job.statusReason,
      jobAttempt: job.attempt,
      jobFencingVersion: job.fencingVersion,
      expectedJobFencingVersion: 4,
      expectedAttempt: 1,
      run,
      requestedByUserId: ownerId,
      expectedRunId: runId,
      expectedRevision: 2,
      expectedDecisionEpoch: 3,
      expectedRunFencingVersion: 5,
      authorizationBinding: expectedBinding,
      expectedRunnerBinding: expectedBinding,
      attemptId: attempt.id,
      expectedAttemptId: attempt.id,
      attemptFinishedAt: attempt.finishedAt,
      runner: {
        ownerUserId: runner.ownerUserId,
        status: runner.status,
        trustState: runner.trustState,
        activeSessionId: runner.activeSessionId,
        currentSnapshotRevision: runner.currentSnapshotRevision,
        revokedAt: runner.revokedAt,
      },
      capability: {
        expiresAt: capability.expiresAt,
        snapshotJson: capability.snapshotJson,
      },
      now: new Date(),
    };
    expect(spec224RecoveryGrantBindingStateIsCurrent(predicateInput)).toBe(
      true
    );

    await sql`
      UPDATE worker_jobs SET "statusReason" = 'cancel_requested:owner requested cancellation'
      WHERE id = ${jobId} AND "tenantId" = ${tenantId}
    `;
    const [cancelledRequest] = await sql`
      SELECT status, "statusReason" FROM worker_jobs
      WHERE id = ${jobId} AND "tenantId" = ${tenantId}
    `;
    expect(cancelledRequest.status).toBe("running");
    expect(
      spec224RecoveryGrantBindingStateIsCurrent({
        ...predicateInput,
        jobStatus: cancelledRequest.status,
        jobStatusReason: cancelledRequest.statusReason,
      })
    ).toBe(false);
  });
});
