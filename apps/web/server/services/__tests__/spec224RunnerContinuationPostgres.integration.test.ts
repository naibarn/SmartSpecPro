import { randomUUID } from "node:crypto";
import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";

import postgres from "postgres";
import { afterAll, describe, expect, it } from "vitest";

const enabled = process.env.RUN_DB_INTEGRATION_TESTS === "true";
const suite = enabled ? describe : describe.skip;
const databaseUrl =
  process.env.DATABASE_URL ?? "postgresql://localhost/spec224_skipped_test";
const parsedDatabaseUrl = new URL(databaseUrl);
if (
  enabled &&
  (!/^spec224_[a-z0-9_-]*_test$/i.test(
    parsedDatabaseUrl.pathname.replace(/^\//, "")
  ) ||
    !["localhost", "127.0.0.1"].includes(parsedDatabaseUrl.hostname))
)
  throw new Error(
    "Runner continuation DB certification requires an isolated loopback spec224_*_test database"
  );
process.env.DATABASE_URL = databaseUrl;

const sql = postgres(databaseUrl, { max: 8 });
const execFileAsync = promisify(execFile);
const ownedJobs: string[] = [];
const ownedTenants: string[] = [];
const ownedUsers: number[] = [];

function freshId(prefix: string) {
  return `${prefix}-${randomUUID()}`.slice(0, 36);
}

async function reconcileInFreshProcess() {
  const source = `
    const { reconcileSpec224RunnerContinuations } = await import("../spec224RunnerContinuationReconciler.ts");
    const result = await reconcileSpec224RunnerContinuations({ limit: 100 });
    process.stdout.write(JSON.stringify(result));
    process.exit(0);
  `;
  const result = await execFileAsync(
    process.execPath,
    ["--import", "tsx", "--input-type=module", "--eval", source],
    {
      cwd: process.cwd(),
      env: process.env,
      timeout: 20_000,
      maxBuffer: 32 * 1024,
    }
  );
  return JSON.parse(result.stdout) as {
    scanned: number;
    reconciled: number;
    reviewRequired: number;
    ignored: number;
  };
}

async function settleAndCrashProcess(fixture: {
  jobId: string;
  resultRef: string;
  operationKey: string;
}) {
  const source = `
    const { createJobControlPlane } = await import("../jobControlPlane.ts");
    const settled = await createJobControlPlane().completeExternal(
      ${JSON.stringify(fixture.jobId)},
      ${JSON.stringify(fixture.resultRef)},
      ${JSON.stringify(fixture.operationKey)}
    );
    process.exit(settled ? 73 : 74);
  `;
  try {
    await execFileAsync(
      process.execPath,
      ["--import", "tsx", "--input-type=module", "--eval", source],
      {
        cwd: process.cwd(),
        env: process.env,
        timeout: 20_000,
        maxBuffer: 32 * 1024,
      }
    );
    throw new Error("D343_FAILURE_INJECTION_DID_NOT_EXIT");
  } catch (error) {
    if (
      !error ||
      typeof error !== "object" ||
      (error as NodeJS.ErrnoException).code !== 73
    )
      throw error;
  }
}

async function createPendingReceiptFixture(
  eventType: "EXECUTION_COMPLETED" | "UNKNOWN_OUTCOME" = "EXECUTION_COMPLETED",
  persistReceipt = true
) {
  const tenantId = randomUUID();
  const runnerId = `runner-${randomUUID()}`;
  const runnerSessionId = `session-${randomUUID()}`;
  const snapshotId = randomUUID();
  const snapshotRevision = `rev-${randomUUID()}`;
  const expiresAt = new Date(Date.now() + 10 * 60_000);
  const [user] = await sql`
    INSERT INTO users ("openId", "role", "plan", "credits", "isDisabled")
    VALUES (${`spec224-${tenantId}`}, 'user', 'free', 0, false) RETURNING id
  `;
  await sql`
    INSERT INTO tenants ("id", "slug", "name", "isActive", "status", "plan", "created_at", "createdAt", "updatedAt")
    VALUES (${tenantId}, ${`${tenantId}-slug`}, 'Spec 224 continuation certification', true, 'ACTIVE', 'FREE', NOW(), NOW(), NOW())
  `;
  ownedTenants.push(tenantId);
  ownedUsers.push(Number(user.id));
  await sql`
    INSERT INTO runner_nodes ("runnerId", "tenantId", "ownerUserId", "nodeKind", "profile", "displayName", "trustState", "status", "currentSnapshotRevision", "snapshotExpiresAt", "activeSessionId")
    VALUES (${runnerId}, ${tenantId}, ${Number(user.id)}, 'rust_runner', 'development', 'D343 deterministic runner', 'trusted', 'offline', ${snapshotRevision}, ${expiresAt}, ${runnerSessionId})
  `;
  await sql`
    INSERT INTO runner_capability_snapshots ("id", "runnerId", "tenantId", "revision", "idempotencyKey", "observedAt", "expiresAt", "snapshotJson")
    VALUES (${snapshotId}, ${runnerId}, ${tenantId}, ${snapshotRevision}, ${`d343-${snapshotId}`}, NOW(), ${expiresAt}, ${sql.json({ capabilitySnapshotId: snapshotId, capabilities: ["workspace.read"] })})
  `;

  const [
    { createJobControlPlane },
    { buildDevelopmentHarnessJob, buildDevelopmentRun, bindWorkerJob },
    { createDevelopmentRunService, defaultDevelopmentRunPersistenceAdapter },
  ] = await Promise.all([
    import("../jobControlPlane"),
    import("../spec224DevelopmentRunContracts"),
    import("../spec224DevelopmentRunPersistence"),
  ]);
  const runId = randomUUID();
  const run = buildDevelopmentRun({
    runId,
    tenantId,
    actorId: Number(user.id),
    goal: "D343 durable continuation test",
    repositoryRef: "repo:spec224-d343-test",
    baseRevision: "git:d343-test-base",
    contextPackHash: "a".repeat(64),
    workspaceId: `workspace:${runId}`,
  });
  const policyBinding = {
    runnerId,
    runnerSessionId,
    capabilitySnapshotId: snapshotId,
    capabilitySnapshotRevision: snapshotRevision,
    authorizationGrantRef: `grant-${runId}`,
    approvalRef: `approval-${runId}`,
    budgetReservationRef: `budget-${runId}`,
    spendCeilingMicros: 1000,
    workspaceRef: run.workspaceId,
    deadline: expiresAt.toISOString(),
  };
  const { definition } = buildDevelopmentHarnessJob({
    run,
    provider: "codex",
    runtime: "local_runner",
    planId: `plan-${runId}`,
    planRevision: 1,
    skillIds: ["d343-test"],
    requestedCapabilities: ["workspace.read"],
    policyBinding,
  });
  const controlPlane = createJobControlPlane();
  const jobId = randomUUID();
  const boundRun = bindWorkerJob(run, jobId);
  const created = await controlPlane.create(
    {
      ...definition,
      input: {
        ...definition.input,
        spec224Run: { ...boundRun, projectionVersion: 0 },
      },
    },
    { canonicalJobId: jobId }
  );
  ownedJobs.push(created.jobId);
  await createDevelopmentRunService(
    defaultDevelopmentRunPersistenceAdapter
  ).initialize({
    run: boundRun,
    eventIdempotencyKey: `run-created:${created.jobId}`,
    scope: { tenantId, actorId: Number(user.id) },
  });
  const lease = await controlPlane.claim({
    jobId: created.jobId,
    runnerId: "d343-test-worker",
    adapter: "postgres-direct",
  });
  if (!lease) throw new Error("D343_TEST_JOB_CLAIM_FAILED");
  await controlPlane.start(lease);
  const commandId = `command-${randomUUID()}`;
  const operationKey = `external-agent:${runId}:plan-1:1`;
  const leaseId = `lease:${lease.jobId}:${lease.attemptId}`;
  await controlPlane.waitForExternal(lease, {
    operationKey,
    resumeAfter: expiresAt.toISOString(),
    metadata: {
      commandId,
      executionKind: "external_agent_task",
      runnerId,
      runnerSessionId,
      capabilitySnapshotId: snapshotId,
      capabilitySnapshotRevision: snapshotRevision,
      leaseId,
      fenceVersion: lease.fencingVersion,
      policyBinding,
    },
  });
  const receipt = {
    jobId: lease.jobId,
    commandId,
    eventId: `receipt-${randomUUID()}`,
    eventType,
    sequence: 1,
    runnerId,
    runnerSessionId,
    tenantId,
    payload: {
      attempt: 1,
      leaseId,
      fenceVersion: lease.fencingVersion,
      capabilitySnapshotId: snapshotId,
      capabilitySnapshotRevision: snapshotRevision,
      ...(eventType === "EXECUTION_COMPLETED"
        ? { resultRef: `d343-result:${runId}` }
        : { errorCode: "UNKNOWN_OUTCOME" }),
    },
  };
  if (persistReceipt) {
    const receiptResult = await controlPlane.recordRunnerReceipt(receipt);
    if (receiptResult !== "recorded")
      throw new Error(`D343_TEST_RECEIPT_${receiptResult}`);
  }
  return {
    runId,
    tenantId,
    actorId: Number(user.id),
    jobId: lease.jobId,
    runnerId,
    operationKey,
    resultRef: `d343-result:${runId}`,
    receipt,
  };
}

afterAll(async () => {
  if (enabled) {
    for (const jobId of ownedJobs) {
      await sql`DELETE FROM worker_job_events WHERE "workerJobId" = ${jobId}`;
      await sql`DELETE FROM worker_job_outbox WHERE "workerJobId" = ${jobId}`;
      await sql`DELETE FROM worker_job_attempts WHERE "workerJobId" = ${jobId}`;
      await sql`DELETE FROM worker_jobs WHERE id = ${jobId}`;
    }
    for (const tenantId of ownedTenants) {
      await sql`DELETE FROM runner_capability_snapshots WHERE "tenantId" = ${tenantId}`;
      await sql`DELETE FROM runner_nodes WHERE "tenantId" = ${tenantId}`;
      await sql`DELETE FROM tenants WHERE id = ${tenantId}`;
    }
    for (const userId of ownedUsers)
      await sql`DELETE FROM users WHERE id = ${userId}`;
  }
  await sql.end();
});

suite("Spec 224 durable Runner continuation — PostgreSQL", () => {
  it("restarts after receipt persistence and reconciles the DevelopmentRun exactly once", async () => {
    const fixture = await createPendingReceiptFixture();
    const [before] = await sql`
      SELECT j.status,
        COUNT(*) FILTER (WHERE e."eventType" = 'RUNNER_EXECUTION_COMPLETED')::int AS receipts,
        COUNT(*) FILTER (WHERE e."eventType" = 'SPEC224_CONTINUATION_PENDING')::int AS intents,
        COUNT(*) FILTER (WHERE e."eventType" = 'COMPLETED')::int AS settlements
      FROM worker_jobs j JOIN worker_job_events e ON e."workerJobId" = j.id
      WHERE j.id = ${fixture.jobId}
      GROUP BY j.status
    `;
    expect(before).toMatchObject({
      status: "waiting_external",
      receipts: 1,
      intents: 1,
      settlements: 0,
    });

    // Model a crash after canonical settlement committed but before the
    // DevelopmentRun projection/continuation transaction began.
    const restartedProcess = await reconcileInFreshProcess();
    expect(restartedProcess).toMatchObject({
      reconciled: 1,
      reviewRequired: 0,
    });
    const { createJobControlPlane } = await import("../jobControlPlane");
    await expect(
      createJobControlPlane().recordRunnerReceipt(fixture.receipt)
    ).resolves.toBe("duplicate");
    const [afterFirst] = await sql`
      SELECT j.status, j."progressJson"->'spec224'->>'state' AS "runState",
        COUNT(*) FILTER (WHERE e."eventType" = 'COMPLETED')::int AS settlements,
        COUNT(*) FILTER (WHERE e."eventType" = 'SPEC224_PHASE_COMPLETED')::int AS "phaseContinuations",
        COUNT(*) FILTER (WHERE e."eventType" = 'SPEC224_CONTINUATION_RECONCILED')::int AS "continuationMarks"
      FROM worker_jobs j JOIN worker_job_events e ON e."workerJobId" = j.id
      WHERE j.id = ${fixture.jobId}
      GROUP BY j.status, j."progressJson"
    `;
    expect(afterFirst).toMatchObject({
      status: "succeeded",
      runState: "PLANNING",
      settlements: 1,
      phaseContinuations: 1,
      continuationMarks: 1,
    });

    const concurrentFixture = await createPendingReceiptFixture();
    await Promise.all([reconcileInFreshProcess(), reconcileInFreshProcess()]);
    const [afterReplay] = await sql`
      SELECT COUNT(*) FILTER (WHERE "eventType" = 'COMPLETED')::int AS settlements,
        COUNT(*) FILTER (WHERE "eventType" = 'SPEC224_PHASE_COMPLETED')::int AS "phaseContinuations",
        COUNT(*) FILTER (WHERE "eventType" = 'SPEC224_CONTINUATION_RECONCILED')::int AS "continuationMarks"
      FROM worker_job_events WHERE "workerJobId" = ${concurrentFixture.jobId}
    `;
    expect(afterReplay).toEqual({
      settlements: 1,
      phaseContinuations: 1,
      continuationMarks: 1,
    });
  }, 60_000);

  it("routes a persisted unknown provider outcome to operator review without retry", async () => {
    const fixture = await createPendingReceiptFixture("UNKNOWN_OUTCOME");
    const result = await reconcileInFreshProcess();
    expect(result).toMatchObject({ reconciled: 1, reviewRequired: 0 });
    const [state] = await sql`
      SELECT j.status, j."operatorReviewRequired",
        j."progressJson"->'spec224'->>'state' AS "runState",
        COUNT(*) FILTER (WHERE e."eventType" = 'COMPLETED')::int AS settlements,
        COUNT(*) FILTER (WHERE e."eventType" = 'SPEC224_DECISION_REQUIRED')::int AS decisions
      FROM worker_jobs j JOIN worker_job_events e ON e."workerJobId" = j.id
      WHERE j.id = ${fixture.jobId}
      GROUP BY j.status, j."operatorReviewRequired", j."progressJson"
    `;
    expect(state).toMatchObject({
      status: "failed",
      operatorReviewRequired: true,
      runState: "WAITING_HUMAN_DECISION",
      settlements: 0,
      decisions: 1,
    });
  }, 60_000);

  it("holds receipt recovery for operator review when the Runner authorization is revoked", async () => {
    const fixture = await createPendingReceiptFixture();
    await sql`
      UPDATE runner_nodes SET "revokedAt" = NOW(), "trustState" = 'revoked'
      WHERE "runnerId" = ${fixture.runnerId}
    `;
    const result = await reconcileInFreshProcess();
    expect(result).toMatchObject({ reconciled: 0, reviewRequired: 1 });
    const [state] = await sql`
      SELECT j.status,
        COUNT(*) FILTER (WHERE e."eventType" = 'COMPLETED')::int AS settlements,
        COUNT(*) FILTER (WHERE e."eventType" = 'SPEC224_CONTINUATION_REVIEW_REQUIRED')::int AS reviews
      FROM worker_jobs j JOIN worker_job_events e ON e."workerJobId" = j.id
      WHERE j.id = ${fixture.jobId}
      GROUP BY j.status
    `;
    expect(state).toMatchObject({
      status: "waiting_external",
      settlements: 0,
      reviews: 1,
    });
  }, 60_000);

  it("reconciles after a process boundary between canonical settlement and projection commit", async () => {
    const fixture = await createPendingReceiptFixture();
    await settleAndCrashProcess(fixture);
    // The test process stops after settlement commit; only a fresh child
    // process is allowed to advance the DevelopmentRun projection.
    const recovered = await reconcileInFreshProcess();
    expect(recovered).toMatchObject({ reconciled: 1, reviewRequired: 0 });
    const [evidence] = await sql`
      SELECT j.status,
        j."progressJson"->'spec224'->>'state' AS "runState",
        COUNT(*) FILTER (WHERE e."eventType" = 'COMPLETED')::int AS settlements,
        COUNT(*) FILTER (WHERE e."eventType" = 'SPEC224_PHASE_COMPLETED')::int AS continuations
      FROM worker_jobs j JOIN worker_job_events e ON e."workerJobId" = j.id
      WHERE j.id = ${fixture.jobId}
      GROUP BY j.status, j."progressJson"
    `;
    expect(evidence).toMatchObject({
      status: "succeeded",
      runState: "PLANNING",
      settlements: 1,
      continuations: 1,
    });
  }, 60_000);

  it("rolls back receipt and continuation intent when a child process dies before receipt persistence", async () => {
    const fixture = await createPendingReceiptFixture(
      "EXECUTION_COMPLETED",
      false
    );
    const heldLock = await sql.reserve();
    const childUrl = new URL(databaseUrl);
    childUrl.searchParams.set(
      "application_name",
      `d343-crash-${fixture.jobId}`
    );
    const lockIdentity = `runner-receipt:${fixture.jobId}:${fixture.operationKey}`;
    let child: ReturnType<typeof spawn> | undefined;
    try {
      await heldLock`SELECT pg_advisory_lock(hashtextextended(${lockIdentity}, 0))`;
      const childScript = `
        const { createJobControlPlane } = await import("../jobControlPlane.ts");
        await createJobControlPlane().recordRunnerReceipt(${JSON.stringify(fixture.receipt)});
      `;
      child = spawn(
        process.execPath,
        ["--import", "tsx", "--input-type=module", "--eval", childScript],
        {
          cwd: process.cwd(),
          env: { ...process.env, DATABASE_URL: childUrl.toString() },
          stdio: "ignore",
        }
      );
      const waitUntil = Date.now() + 10_000;
      let waitingOnAdvisory = false;
      while (Date.now() < waitUntil) {
        const [activity] = await sql`
          SELECT wait_event_type AS "waitEventType", query
          FROM pg_stat_activity
          WHERE application_name = ${`d343-crash-${fixture.jobId}`}
            AND query LIKE '%pg_advisory_xact_lock%'
          LIMIT 1
        `;
        if (activity?.waitEventType === "Lock") {
          waitingOnAdvisory = true;
          break;
        }
        await new Promise(resolve => setTimeout(resolve, 25));
      }
      expect(waitingOnAdvisory).toBe(true);
      child.kill("SIGKILL");
      await new Promise<void>(resolve => child?.once("exit", () => resolve()));
    } finally {
      await heldLock`SELECT pg_advisory_unlock(hashtextextended(${lockIdentity}, 0))`;
      await heldLock.release();
    }
    const [persisted] = await sql`
      SELECT
        COUNT(*) FILTER (WHERE "eventType" = 'RUNNER_EXECUTION_COMPLETED')::int AS receipts,
        COUNT(*) FILTER (WHERE "eventType" = 'SPEC224_CONTINUATION_PENDING')::int AS intents
      FROM worker_job_events WHERE "workerJobId" = ${fixture.jobId}
    `;
    expect(persisted).toEqual({ receipts: 0, intents: 0 });
  }, 60_000);
});
