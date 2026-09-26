/**
 * Spec 224 DB-backed certification.
 *
 * This suite is intentionally opt-in and refuses non-local databases whose
 * name does not contain `test` or `ci`. It exercises the real Feature 195
 * PostgreSQL control plane with the deterministic Runner adapter; it is not
 * live Codex/Claude provider evidence.
 *
 * Run from apps/web with:
 *   RUN_DB_INTEGRATION_TESTS=true \
 *   DATABASE_URL=postgresql://.../smartspec_test \
 *   npx vitest run server/services/__tests__/spec224PostgresIntegration.integration.test.ts
 */
import { execFile } from "node:child_process";
import { promisify } from "node:util";

import postgres from "postgres";
import { afterAll, describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);
const RUN_DB_INTEGRATION_TESTS =
  process.env.RUN_DB_INTEGRATION_TESTS === "true";
const describeDbSuite = RUN_DB_INTEGRATION_TESTS ? describe : describe.skip;

function resolveTestDatabaseUrl(): string {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl)
    throw new Error("DATABASE_URL is required for DB integration tests");

  let parsed: URL;
  try {
    parsed = new URL(databaseUrl);
  } catch {
    throw new Error(
      "DATABASE_URL must be a valid URL for DB integration tests"
    );
  }

  const databaseName = parsed.pathname.replace(/^\/+/, "");
  if (!databaseName || !/(^|_|-)(test|ci)(_|-|$)/i.test(databaseName)) {
    throw new Error(
      `Refusing DB integration tests against non-test database "${databaseName || "<unknown>"}"`
    );
  }

  const allowedHosts = new Set([
    "localhost",
    "127.0.0.1",
    "postgres",
    "smartspec-postgres",
  ]);
  if (!allowedHosts.has(parsed.hostname)) {
    throw new Error(
      `Refusing DB integration tests on non-local host "${parsed.hostname}"`
    );
  }
  return databaseUrl;
}

const databaseUrl = RUN_DB_INTEGRATION_TESTS
  ? resolveTestDatabaseUrl()
  : "postgresql://localhost:5432/smartspec_test";

// The canonical service lazily initializes its real postgres client.
process.env.DATABASE_URL = databaseUrl;

const sql = postgres(databaseUrl, { max: 2 });

type ControlPlane = ReturnType<
  typeof import("../jobControlPlane").createJobControlPlane
>;

const createdJobs: string[] = [];
const createdTenants: string[] = [];
const createdUsers: number[] = [];

let controlPlane: ControlPlane;
let createJobControlPlane: typeof import("../jobControlPlane").createJobControlPlane;
let buildAgentJobDefinition: typeof import("../agentControlPlaneContracts").buildAgentJobDefinition;
let createExternalAgentTaskDispatcher: typeof import("../externalAgentRunnerDispatcher").createExternalAgentTaskDispatcher;
let executeCanonicalJob: typeof import("../jobExecutor").executeCanonicalJob;
let publishJobOutboxRow: typeof import("../jobOutboxPublisher").publishJobOutboxRow;

async function loadRuntime(): Promise<void> {
  ({ createJobControlPlane } = await import("../jobControlPlane"));
  controlPlane = createJobControlPlane();
  ({ buildAgentJobDefinition } = await import("../agentControlPlaneContracts"));
  ({ createExternalAgentTaskDispatcher } =
    await import("../externalAgentRunnerDispatcher"));
  ({ executeCanonicalJob } = await import("../jobExecutor"));
  ({ publishJobOutboxRow } = await import("../jobOutboxPublisher"));
}

function id(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 7)}`.slice(0, 36);
}

async function createScope(): Promise<{ tenantId: string; userId: number }> {
  const tenantId = id("spec224-tenant");
  const slug = `${tenantId}-slug`.slice(0, 64);
  const [user] = await sql`
    INSERT INTO users ("openId", "role", "plan", "credits", "isDisabled")
    VALUES (${`spec224-${tenantId}`}, 'user', 'free', 0, false)
    RETURNING id
  `;
  await sql`
    INSERT INTO tenants ("id", "slug", "name", "isActive", "status", "plan", "created_at", "createdAt", "updatedAt")
    VALUES (${tenantId}, ${slug}, ${"Spec 224 PostgreSQL Integration"}, true, 'ACTIVE', 'FREE', NOW(), NOW(), NOW())
  `;
  createdTenants.push(tenantId);
  createdUsers.push(Number(user.id));
  return { tenantId, userId: Number(user.id) };
}

function makeManifest(input: {
  taskId: string;
  tenantId: string;
  actorId: number;
  planId: string;
  workspaceId: string;
}) {
  return {
    taskId: input.taskId,
    tenantId: input.tenantId,
    actorId: input.actorId,
    goalId: `goal-${input.taskId}`,
    planId: input.planId,
    planRevision: 1,
    provider: "codex" as const,
    runtime: "local_runner" as const,
    workspaceId: input.workspaceId,
    contextPackageIds: [`context-${input.taskId}`],
    skillIds: ["skill-spec224"],
    mcpGrantIds: [],
    requestedCapabilities: ["workspace.read", "workspace.write"],
    policyBinding: {
      runnerId: "runner-spec224-db",
      runnerSessionId: `session-${input.taskId}`,
      capabilitySnapshotId: `snapshot-${input.taskId}`,
      capabilitySnapshotRevision: "1",
      authorizationGrantRef: `grant-${input.taskId}`,
      approvalRef: `approval-${input.taskId}`,
      budgetReservationRef: `budget-${input.taskId}`,
      spendCeilingMicros: 1000,
      workspaceRef: input.workspaceId,
      deadline: new Date(Date.now() + 60_000).toISOString(),
    },
  };
}

async function createAgentJob(input: {
  tenantId: string;
  userId: number;
  taskId?: string;
}) {
  const taskId = input.taskId ?? id("task");
  const manifest = makeManifest({
    taskId,
    tenantId: input.tenantId,
    actorId: input.userId,
    planId: `plan-${taskId}`,
    workspaceId: `workspace-${taskId}`,
  });
  const definition = buildAgentJobDefinition(manifest);
  const created = await controlPlane.create(definition);
  if (created.created) createdJobs.push(created.jobId);
  return { created, definition, manifest };
}

async function executeWithDeterministicRunner(
  jobId: string,
  manifest: ReturnType<typeof makeManifest>
) {
  let observedLease: import("../jobControlPlaneTypes").LeaseContext | null =
    null;
  let dispatchedCommand: Record<string, unknown> | null = null;
  const dispatcher = createExternalAgentTaskDispatcher({
    controlPlaneOrigin: "http://runner.test",
    commandId: () => `command-${jobId}`,
    dispatch: async command => {
      dispatchedCommand = command as unknown as Record<string, unknown>;
      return {
        status: "accepted" as const,
        commandId: command.commandId,
        runnerId: command.runnerId,
        runnerSessionId: command.runnerSessionId,
      };
    },
  });

  const result = await executeCanonicalJob(
    {
      jobId,
      runnerId: "node-worker-spec224",
      adapter: "postgres-pull",
    },
    {
      controlPlane,
      executor: async input => {
        observedLease = input.lease;
        return dispatcher({ ...input, manifest });
      },
    }
  );

  expect(result.state).toBe("deferred");
  expect(observedLease).not.toBeNull();
  expect(dispatchedCommand?.executionKind).toBe("external_agent_task");
  expect(dispatchedCommand?.adapterId).toBe("codex.v1");
  return { lease: observedLease!, command: dispatchedCommand! };
}

async function readStatusFromFreshProcess(jobId: string) {
  const script = `
    const { createJobControlPlane } = await import("./server/services/jobControlPlane.ts");
    const status = await createJobControlPlane().getStatus(${JSON.stringify(jobId)});
    process.stdout.write(JSON.stringify(status ? { status: status.status, attempt: status.attempt, fencingVersion: status.lease.fencingVersion } : null));
    process.exit(0);
  `;
  const result = await execFileAsync(
    process.execPath,
    ["--import", "tsx", "--input-type=module", "--eval", script],
    {
      cwd: process.cwd(),
      env: { ...process.env, DATABASE_URL: databaseUrl },
      timeout: 15_000,
      maxBuffer: 32 * 1024,
    }
  );
  return JSON.parse(result.stdout) as {
    status: string;
    attempt: number;
    fencingVersion: number;
  } | null;
}

async function deleteJobRows(jobId: string): Promise<void> {
  // Resolve all actual FK columns from PostgreSQL so cleanup follows schema
  // reality without hard-coding a second copy of Feature 195's table list.
  const references = await sql`
    SELECT DISTINCT kcu.table_name AS "tableName", kcu.column_name AS "columnName"
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu
      ON kcu.constraint_name = tc.constraint_name
     AND kcu.constraint_schema = tc.constraint_schema
    JOIN information_schema.constraint_column_usage ccu
      ON ccu.constraint_name = tc.constraint_name
     AND ccu.constraint_schema = tc.constraint_schema
    WHERE tc.constraint_type = 'FOREIGN KEY'
      AND ccu.table_schema = 'public'
      AND ccu.table_name = 'worker_jobs'
  `;
  for (const reference of references) {
    if (reference.tableName === "worker_jobs") continue;
    await sql.unsafe(
      `DELETE FROM "${reference.tableName}" WHERE "${reference.columnName}" = $1`,
      [jobId]
    );
  }
  await sql`DELETE FROM worker_jobs WHERE id = ${jobId}`;
}

afterAll(async () => {
  if (RUN_DB_INTEGRATION_TESTS) {
    for (const jobId of createdJobs) await deleteJobRows(jobId);
    for (const tenantId of createdTenants)
      await sql`DELETE FROM tenants WHERE id = ${tenantId}`;
    for (const userId of createdUsers)
      await sql`DELETE FROM users WHERE id = ${userId}`;
  }
  await sql.end();
});

describeDbSuite("Spec 224 — PostgreSQL control-plane certification", () => {
  it("persists outbox, survives a fresh process, fences receipts, and settles once", async () => {
    await loadRuntime();
    const scope = await createScope();
    const { created, definition, manifest } = await createAgentJob(scope);
    const replay = await controlPlane.create(definition);

    expect(created.created).toBe(true);
    expect(replay).toEqual({ jobId: created.jobId, created: false });

    const queuedEvidence = await sql`
      SELECT j.status, j.attempt, j."fencingVersion", o."dedupeKey",
             COUNT(e.id)::int AS "eventCount"
      FROM worker_jobs j
      JOIN worker_job_outbox o ON o."workerJobId" = j.id
      LEFT JOIN worker_job_events e ON e."workerJobId" = j.id
      WHERE j.id = ${created.jobId}
      GROUP BY j.status, j.attempt, j."fencingVersion", o."dedupeKey"
    `;
    expect(queuedEvidence[0]).toMatchObject({
      status: "queued",
      attempt: 1,
      dedupeKey: `job:${created.jobId}:attempt:1`,
    });

    expect(await readStatusFromFreshProcess(created.jobId)).toMatchObject({
      status: "queued",
      attempt: 1,
    });

    const [outbox] = await sql`
      SELECT id
      FROM worker_job_outbox
      WHERE "workerJobId" = ${created.jobId}
      ORDER BY "createdAt" ASC
      LIMIT 1
    `;
    const stalePublisherLeaseUntil = new Date(Date.now() + 30_000);
    await sql`
      UPDATE worker_job_outbox
      SET "publisherLeaseTokenHash" = 'spec224-stale-publisher',
          "publisherLeaseExpiresAt" = ${stalePublisherLeaseUntil}
      WHERE id = ${outbox.id}
    `;
    const deterministicTransport = {
      name: "postgres-pull",
      referenceNamespace: "spec224-deterministic-runner",
      supports: () => true,
      publish: async (
        request: import("../jobControlPlaneTypes").DispatchRequest
      ) => ({
        jobId: request.jobId,
        attemptId: request.attemptId,
        adapter: "postgres-pull",
        referenceNamespace: "spec224-deterministic-runner",
        dispatchId: request.outboxId,
        dedupeKey: request.dedupeKey,
      }),
      inspect: async () => "published" as const,
    };
    expect(
      (await publishJobOutboxRow(outbox.id, deterministicTransport, new Date()))
        .state
    ).toBe("skipped");
    expect(
      (
        await publishJobOutboxRow(
          outbox.id,
          deterministicTransport,
          new Date(stalePublisherLeaseUntil.getTime() + 1)
        )
      ).state
    ).toBe("published");
    const [dispatchEvidence] = await sql`
      SELECT "publicationStatus", "dedupeKey", "publishedAt"
      FROM worker_job_dispatches
      WHERE "workerJobId" = ${created.jobId}
      LIMIT 1
    `;
    expect(dispatchEvidence).toMatchObject({
      publicationStatus: "published",
      dedupeKey: `job:${created.jobId}:attempt:1`,
    });

    const { lease, command } = await executeWithDeterministicRunner(
      created.jobId,
      manifest
    );
    expect(await readStatusFromFreshProcess(created.jobId)).toMatchObject({
      status: "waiting_external",
      attempt: 1,
      fencingVersion: lease.fencingVersion,
    });

    const receipt = {
      jobId: created.jobId,
      commandId: String(command.commandId),
      eventId: `event-${created.jobId}`,
      eventType: "progress",
      sequence: 1,
      runnerId: String(command.runnerId),
      runnerSessionId: String(command.runnerSessionId),
      tenantId: scope.tenantId,
      payload: {
        attempt: 1,
        leaseId: `lease:${created.jobId}:${lease.attemptId}`,
        fenceVersion: lease.fencingVersion,
        evidenceRef: `sha256:${"a".repeat(64)}`,
      },
    };
    expect(
      await controlPlane.recordRunnerReceipt({
        ...receipt,
        tenantId: "wrong-tenant",
      })
    ).toBe("ignored");
    expect(
      await controlPlane.recordRunnerReceipt({
        ...receipt,
        payload: { ...receipt.payload, attempt: 2 },
      })
    ).toBe("ignored");
    expect(
      await controlPlane.recordRunnerReceipt({
        ...receipt,
        payload: { ...receipt.payload, fenceVersion: lease.fencingVersion + 1 },
      })
    ).toBe("ignored");
    expect(await controlPlane.recordRunnerReceipt(receipt)).toBe("recorded");
    expect(await controlPlane.recordRunnerReceipt(receipt)).toBe("duplicate");
    expect(
      await controlPlane.completeExternal(
        created.jobId,
        `sha256:${"b".repeat(64)}`,
        `external-agent:${manifest.taskId}:${manifest.planId}:1`
      )
    ).toBe(true);
    expect(
      await controlPlane.completeExternal(
        created.jobId,
        `sha256:${"b".repeat(64)}`,
        `external-agent:${manifest.taskId}:${manifest.planId}:1`
      )
    ).toBe(true);

    const terminal = await readStatusFromFreshProcess(created.jobId);
    expect(terminal).toMatchObject({ status: "succeeded", attempt: 1 });
    const terminalEvidence = await sql`
      SELECT j.status, j."resultRef", COUNT(e.id)::int AS "eventCount",
             COUNT(*) FILTER (WHERE e."eventType" = 'COMPLETED')::int AS "completedEvents"
      FROM worker_jobs j
      LEFT JOIN worker_job_events e ON e."workerJobId" = j.id
      WHERE j.id = ${created.jobId}
      GROUP BY j.status, j."resultRef"
    `;
    expect(terminalEvidence[0]).toMatchObject({
      status: "succeeded",
      resultRef: `sha256:${"b".repeat(64)}`,
      completedEvents: 1,
    });
  }, 30_000);

  it("records cancellation, timeout review, stale lease recovery, and ambiguous outcomes without retrying blindly", async () => {
    await loadRuntime();
    const scope = await createScope();

    const cancellable = await createAgentJob(scope);
    const cancelledRun = await executeWithDeterministicRunner(
      cancellable.created.jobId,
      cancellable.manifest
    );
    await controlPlane.cancel(cancellable.created.jobId, "test_cancel");
    expect(
      (await controlPlane.getStatus(cancellable.created.jobId))?.status
    ).toBe("cancelled");
    expect(cancelledRun.lease.fencingVersion).toBeGreaterThan(0);

    const timedOut = await createAgentJob(scope);
    await executeWithDeterministicRunner(
      timedOut.created.jobId,
      timedOut.manifest
    );
    const timeoutResult = await controlPlane.failExternalWait(
      timedOut.created.jobId,
      "deterministic provider timeout",
      true,
      new Date(),
      `external-agent:${timedOut.manifest.taskId}:${timedOut.manifest.planId}:1`
    );
    expect(timeoutResult).toBe("failed");
    expect(await controlPlane.getStatus(timedOut.created.jobId)).toMatchObject({
      status: "failed",
      operatorReviewRequired: true,
      errorCode: "EXTERNAL_WAIT_TIMEOUT",
    });

    const ambiguous = await createAgentJob(scope);
    const ambiguousOperation = `external-agent:${ambiguous.manifest.taskId}:${ambiguous.manifest.planId}:1`;
    expect(
      await controlPlane.markProviderSubmissionReview(
        ambiguous.created.jobId,
        ambiguousOperation,
        "receipt lost after provider submission"
      )
    ).toBe(true);
    expect(await controlPlane.getStatus(ambiguous.created.jobId)).toMatchObject(
      {
        status: "failed",
        operatorReviewRequired: true,
        errorCode: "PROVIDER_SUBMISSION_AMBIGUOUS",
      }
    );

    const staleLeaseJob = await createAgentJob(scope);
    const staleLease = await controlPlane.claim({
      jobId: staleLeaseJob.created.jobId,
      runnerId: "runner-stale",
      adapter: "postgres-pull",
    });
    await controlPlane.start(staleLease!);
    expect(
      await controlPlane.recoverExpiredLease(
        staleLeaseJob.created.jobId,
        new Date(Date.parse(staleLease!.expiresAt) + 1)
      )
    ).toBe("recovered");
    await expect(controlPlane.assertActive(staleLease!)).rejects.toMatchObject({
      code: "JOB_LEASE_STALE",
    });
    expect(await controlPlane.makeRetryDue(staleLeaseJob.created.jobId)).toBe(
      true
    );
    const retryStatus = await controlPlane.getStatus(
      staleLeaseJob.created.jobId
    );
    expect(retryStatus).toMatchObject({ status: "queued", attempt: 2 });

    const evidence = (
      await Promise.all(
        [cancellable, timedOut, ambiguous, staleLeaseJob].map(
          item => sql`
            SELECT j.id, j.status, j.attempt, j."operatorReviewRequired",
                   COUNT(e.id)::int AS "eventCount",
                   COUNT(*) FILTER (WHERE e."eventType" IN ('TIMEOUT', 'CANCELLED', 'LEASE_EXPIRED'))::int AS "guardEvents"
            FROM worker_jobs j
            LEFT JOIN worker_job_events e ON e."workerJobId" = j.id
            WHERE j.id = ${item.created.jobId}
            GROUP BY j.id, j.status, j.attempt, j."operatorReviewRequired"
          `
        )
      )
    ).flat();
    expect(evidence).toHaveLength(4);
    expect(
      evidence.reduce((sum, row) => sum + Number(row.guardEvents), 0)
    ).toBe(3);
  });
});
