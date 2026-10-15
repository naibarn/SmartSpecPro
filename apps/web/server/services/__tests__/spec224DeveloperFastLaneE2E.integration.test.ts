import { randomUUID } from "node:crypto";
import os from "node:os";
import path from "node:path";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createSpec277DisposablePostgres } from "./support/spec277DisposablePostgres";
import { installSpec277AutoTeamRuntimeSchema } from "./support/spec277AutoTeamRuntimeSchema";

describe("SPEC-224 authenticated Developer Fast Lane model admission E2E", () => {
  const priorEnv = {
    DATABASE_URL: process.env.DATABASE_URL, PGHOST: process.env.PGHOST, PGPORT: process.env.PGPORT, PGUSER: process.env.PGUSER, PGPASSWORD: process.env.PGPASSWORD,
    SPEC224_CODEX_TOKEN_WINDOW_SECONDS: process.env.SPEC224_CODEX_TOKEN_WINDOW_SECONDS,
    SPEC224_CODEX_MAX_TOKENS_PER_WINDOW: process.env.SPEC224_CODEX_MAX_TOKENS_PER_WINDOW,
    SPEC224_CODEX_MAX_CONCURRENT_TURNS_PER_USER: process.env.SPEC224_CODEX_MAX_CONCURRENT_TURNS_PER_USER,
    SPEC224_CODEX_MAX_OUTPUT_TOKENS_PER_TURN: process.env.SPEC224_CODEX_MAX_OUTPUT_TOKENS_PER_TURN,
    SPEC224_E2E_PAUSE_AFTER_RESERVE: process.env.SPEC224_E2E_PAUSE_AFTER_RESERVE,
  };
  let fixture: Awaited<ReturnType<typeof createSpec277DisposablePostgres>>;
  let sql: postgres.Sql;
  let closeDb: typeof import("../../db").closeDb;

  beforeAll(async () => {
    if (process.env.DATABASE_URL) throw new Error("SPEC224_FAST_LANE_E2E_REFUSES_INHERITED_DATABASE_URL");
    fixture = await createSpec277DisposablePostgres();
    await fixture.assertOwned();
    sql = postgres(fixture.databaseUrl, { max: 8, connect_timeout: 3 });
    await sql.unsafe("CREATE EXTENSION IF NOT EXISTS pgcrypto");
    await installSpec277AutoTeamRuntimeSchema(sql);
    await sql.unsafe('CREATE TABLE users (id integer PRIMARY KEY)');
    await sql.unsafe('INSERT INTO users (id) VALUES (22401)');
    await sql.unsafe('CREATE TABLE tenant_data_transfer_plans ("operationId" varchar(36), "tenantId" varchar(36), "sourceUserId" integer)');
    await sql.unsafe('CREATE TABLE tenant_identity_actions (id varchar(36) PRIMARY KEY, "userId" integer, "sourceTenantId" varchar(36), phase varchar(40))');
    process.env.DATABASE_URL = fixture.databaseUrl;
    for (const key of ["PGHOST", "PGPORT", "PGUSER", "PGPASSWORD"]) delete process.env[key];
    process.env.SPEC224_CODEX_TOKEN_WINDOW_SECONDS = "3600";
    process.env.SPEC224_CODEX_MAX_TOKENS_PER_WINDOW = "100000";
    process.env.SPEC224_CODEX_MAX_CONCURRENT_TURNS_PER_USER = "2";
    process.env.SPEC224_CODEX_MAX_OUTPUT_TOKENS_PER_TURN = "100";
    ({ closeDb } = await import("../../db"));
    await (await import("../../db")).getDb();
  });

  afterAll(async () => {
    await closeDb?.();
    await sql?.end();
    await fixture?.assertOwned();
    await fixture?.close();
    for (const [key, value] of Object.entries(priorEnv)) if (value === undefined) delete process.env[key]; else process.env[key] = value;
  });

  it("creates, claims, dispatches a Python Codex model call, settles usage, and completes the canonical Job", async () => {
    const [{ spec226DevelopmentControlRouter }, { createJobControlPlane }, { createJobExecutorRegistry }, { executeCanonicalJobEnvelope }, { createSpec224DeveloperFastLaneExecutor }, { DEVELOPER_FAST_LANE_JOB, DEVELOPER_FAST_LANE_CONTRACT }] = await Promise.all([
      import("../../routers/spec226DevelopmentControl"), import("../jobControlPlane"), import("../jobExecutorRegistry"), import("../../jobs/unifiedJobConsumer"), import("../spec224DeveloperFastLaneExecutor"), import("../spec224DeveloperFastLaneContract"),
    ]);
    const evidenceRoot = await import("node:fs/promises").then(fs => fs.mkdtemp(path.join(os.tmpdir(), "spec224-fast-lane-e2e-")));
    try {
      const request = {
        idempotencyKey: `authenticated-fast-lane-${randomUUID()}`,
        developerLogin: "developer", sourceRevision: "a".repeat(40), task: "Mocked authenticated model call", allowedFiles: ["experiments/agents-sdk-codex-subscription/tests/fixtures/canonical_admission_model_call.py"], writableFiles: ["experiments/agents-sdk-codex-subscription/tests/fixtures/canonical_admission_model_call.py"],
        tests: { runner: "pytest", cwd: ".", paths: ["experiments/agents-sdk-codex-subscription/tests/fixtures/canonical_admission_model_call.py"] }, acceptanceCriteria: ["Admission precedes dispatch and usage settles"], budget: { implementationMaxTurns: 1, planMaxTurns: 1, reviewMaxTurns: 1 },
      };
      const procedure = spec226DevelopmentControlRouter.startDeveloperFastLane as unknown as { _def: { resolver: (value: unknown) => Promise<{ runId: string; jobId: string; created: boolean }> } };
      const created = await procedure._def.resolver({ ctx: { tenantId: "tenant-e2e", user: { id: 22401, role: "admin" } }, input: request });
      const executorRegistry = createJobExecutorRegistry([{
        jobType: DEVELOPER_FAST_LANE_JOB, executionClass: "long", contractVersions: new Set([DEVELOPER_FAST_LANE_CONTRACT]),
        executor: createSpec224DeveloperFastLaneExecutor({ repositoryRoot: process.cwd().replace(/\/apps\/web$/, ""), evidenceRoot,
          pythonExecutable: process.env.SPEC224_PYTHON ?? "/tmp/agents-sdk-codex-subscription-venv/bin/python",
          pythonScript: path.join(process.cwd().replace(/\/apps\/web$/, ""), "experiments/agents-sdk-codex-subscription/tests/fixtures/canonical_admission_model_call.py"),
          includeStderrInFailure: true,
          pythonScriptArgs: (binding, root) => [binding.runId, root],
        }),
      }]);
      const result = await executeCanonicalJobEnvelope({ jobId: created.jobId, contractVersion: DEVELOPER_FAST_LANE_CONTRACT, businessAttempt: 1 }, {
        controlPlane: createJobControlPlane(), executorRegistry, runnerId: `spec224-e2e-${randomUUID()}`, adapter: "test",
      });
      expect(result).toMatchObject({ state: "succeeded", jobId: created.jobId });
      const reservation = await sql`SELECT "reservationStatus", "usageReceiptJson", "modelSelectionJson", "requestedModel", "reasoningEffort", "threadId", "turnId" FROM worker_job_provider_reservations WHERE "workerJobId" = ${created.jobId} AND "reservationKind" = 'model_call'`;
      expect(reservation).toHaveLength(1);
      expect(reservation[0]).toMatchObject({ reservationStatus: "released", requestedModel: "gpt-6-luna", reasoningEffort: "medium", threadId: "mock-thread-e2e", turnId: "mock-turn-e2e" });
      expect(reservation[0].usageReceiptJson).toMatchObject({ inputTokens: 31, cachedInputTokens: 4, outputTokens: 9, effectiveModel: "gpt-6-luna" });
      expect(reservation[0].modelSelectionJson).toMatchObject({ requestedModel: "gpt-6-luna", reasoningEffort: "medium" });
      const events = await sql`SELECT "eventType" FROM worker_job_events WHERE "workerJobId" = ${created.jobId} ORDER BY "createdAt"`;
      const eventTypes = events.map(event => event.eventType);
      expect(eventTypes).toContain("CODEX_MODEL_TURN_RESERVED");
      expect(eventTypes).toContain("CODEX_MODEL_TURN_DISPATCHING");
      expect(eventTypes).toContain("CODEX_MODEL_THREAD_CREATED");
      expect(eventTypes).toContain("CODEX_MODEL_TURN_STARTED");
      expect(eventTypes).toContain("CODEX_MODEL_USAGE_SETTLED");
      expect(eventTypes.indexOf("CODEX_MODEL_TURN_RESERVED")).toBeLessThan(eventTypes.indexOf("CODEX_MODEL_TURN_DISPATCHING"));
      expect(eventTypes.indexOf("CODEX_MODEL_TURN_DISPATCHING")).toBeLessThan(eventTypes.indexOf("CODEX_MODEL_THREAD_CREATED"));
      expect(eventTypes.indexOf("CODEX_MODEL_THREAD_CREATED")).toBeLessThan(eventTypes.indexOf("CODEX_MODEL_TURN_STARTED"));
      expect(eventTypes.indexOf("CODEX_MODEL_TURN_STARTED")).toBeLessThan(eventTypes.indexOf("CODEX_MODEL_USAGE_SETTLED"));
      expect(eventTypes.at(-1)).toBe("COMPLETED");
      expect(JSON.stringify(reservation[0])).not.toContain("leaseToken");
    } finally {
      await import("node:fs/promises").then(fs => fs.rm(evidenceRoot, { recursive: true, force: true }));
    }
  }, 60_000);

  it("parks on budget, waits until eligibility, then resumes the same durable WorkUnit without duplicate model dispatch", async () => {
    const [{ spec226DevelopmentControlRouter }, { createJobControlPlane }, { createJobExecutorRegistry }, { executeCanonicalJobEnvelope }, { runJobReconciler }, { createSpec224DeveloperFastLaneExecutor }, { DEVELOPER_FAST_LANE_JOB, DEVELOPER_FAST_LANE_CONTRACT }] = await Promise.all([
      import("../../routers/spec226DevelopmentControl"), import("../jobControlPlane"), import("../jobExecutorRegistry"), import("../../jobs/unifiedJobConsumer"), import("../jobReconciler"), import("../spec224DeveloperFastLaneExecutor"), import("../spec224DeveloperFastLaneContract"),
    ]);
    const evidenceRoot = await import("node:fs/promises").then(fs => fs.mkdtemp(path.join(os.tmpdir(), "spec224-fast-lane-resume-")));
    const controlPlane = createJobControlPlane();
    try {
      process.env.SPEC224_CODEX_MAX_TOKENS_PER_WINDOW = "1";
      const request = {
        idempotencyKey: `authenticated-fast-lane-resume-${randomUUID()}`,
        developerLogin: "developer", sourceRevision: "b".repeat(40), task: "Resume mocked authenticated model call", allowedFiles: ["experiments/agents-sdk-codex-subscription/tests/fixtures/canonical_admission_model_call.py"], writableFiles: ["experiments/agents-sdk-codex-subscription/tests/fixtures/canonical_admission_model_call.py"],
        tests: { runner: "pytest", cwd: ".", paths: ["experiments/agents-sdk-codex-subscription/tests/fixtures/canonical_admission_model_call.py"] }, acceptanceCriteria: ["Budget wait resumes through the canonical scheduler"], budget: { implementationMaxTurns: 1, planMaxTurns: 1, reviewMaxTurns: 1 },
      };
      const procedure = spec226DevelopmentControlRouter.startDeveloperFastLane as unknown as { _def: { resolver: (value: unknown) => Promise<{ runId: string; jobId: string }> } };
      const created = await procedure._def.resolver({ ctx: { tenantId: "tenant-e2e", user: { id: 22401, role: "admin" } }, input: request });
      const executorRegistry = createJobExecutorRegistry([{
        jobType: DEVELOPER_FAST_LANE_JOB, executionClass: "long", contractVersions: new Set([DEVELOPER_FAST_LANE_CONTRACT]),
        executor: createSpec224DeveloperFastLaneExecutor({ repositoryRoot: process.cwd().replace(/\/apps\/web$/, ""), evidenceRoot,
          pythonExecutable: process.env.SPEC224_PYTHON ?? "/tmp/agents-sdk-codex-subscription-venv/bin/python",
          pythonScript: path.join(process.cwd().replace(/\/apps\/web$/, ""), "experiments/agents-sdk-codex-subscription/tests/fixtures/canonical_admission_model_call.py"),
          includeStderrInFailure: true, pythonScriptArgs: (binding, root) => [binding.runId, root],
        }),
      }]);
      const first = await executeCanonicalJobEnvelope({ jobId: created.jobId, contractVersion: DEVELOPER_FAST_LANE_CONTRACT, businessAttempt: 1 }, {
        controlPlane, executorRegistry, runnerId: `spec224-resume-${randomUUID()}`, adapter: "test",
      });
      expect(first).toMatchObject({ state: "deferred", jobId: created.jobId });

      const [waitingJob] = await sql`SELECT status, "progressJson", attempt, "fencingVersion" FROM worker_jobs WHERE id = ${created.jobId}`;
      const externalWait = waitingJob.progressJson.externalWait;
      expect(waitingJob.status).toBe("waiting_external");
      expect(externalWait).toMatchObject({ reason: "budget", metadata: { schemaVersion: "spec224.developer-model-wait.v1", reservationState: "not_reserved" } });
      const [waitEvent] = await sql`SELECT "eventType", "payloadJson" FROM worker_job_events WHERE "workerJobId" = ${created.jobId} AND "eventType" = 'WAITING_BUDGET'`;
      expect(waitEvent.payloadJson).toMatchObject({ resumeAfter: externalWait.resumeAfter, operationKey: externalWait.operationKey });
      const [before] = await sql`SELECT count(*)::int AS count FROM worker_job_provider_reservations WHERE "workerJobId" = ${created.jobId} AND "reservationKind" = 'model_call'`;
      expect(before.count).toBe(0);
      const modelCallIdBefore = await import("node:fs/promises").then(fs => fs.readFile(path.join(evidenceRoot, created.runId, "mock-model-call-id"), "utf8"));

      const early = await runJobReconciler({ now: new Date(Date.parse(externalWait.resumeAfter) - 1) });
      expect(early.decisions).toContainEqual({ jobId: created.jobId, action: "wait", reasonCode: "budget_not_yet_eligible" });
      const [stillWaiting] = await sql`SELECT status FROM worker_jobs WHERE id = ${created.jobId}`;
      expect(stillWaiting.status).toBe("waiting_external");

      process.env.SPEC224_CODEX_MAX_TOKENS_PER_WINDOW = "100000";
      const due = await runJobReconciler({ now: new Date(Date.parse(externalWait.resumeAfter) + 1) });
      expect(due.decisions).toContainEqual({ jobId: created.jobId, action: "resume", reasonCode: "budget_retry_due" });
      const [queued] = await sql`SELECT status, attempt, "fencingVersion" FROM worker_jobs WHERE id = ${created.jobId}`;
      expect(queued.status).toBe("queued");
      const resumed = await executeCanonicalJobEnvelope({ jobId: created.jobId, contractVersion: DEVELOPER_FAST_LANE_CONTRACT, businessAttempt: queued.attempt }, {
        controlPlane, executorRegistry, runnerId: `spec224-resume-${randomUUID()}`, adapter: "test",
      });
      expect(resumed).toMatchObject({ state: "succeeded", jobId: created.jobId });

      const [job] = await sql`SELECT status, attempt, "fencingVersion" FROM worker_jobs WHERE id = ${created.jobId}`;
      expect(job).toMatchObject({ status: "succeeded", attempt: queued.attempt });
      expect(Number(job.fencingVersion)).toBeGreaterThan(Number(waitingJob.fencingVersion));
      const [reservation] = await sql`SELECT "modelCallId", "reservationStatus", "threadId", "turnId", "usageReceiptJson" FROM worker_job_provider_reservations WHERE "workerJobId" = ${created.jobId} AND "reservationKind" = 'model_call'`;
      expect(reservation).toMatchObject({ reservationStatus: "released", threadId: "mock-thread-e2e", turnId: "mock-turn-e2e" });
      expect(reservation.modelCallId).toBe(modelCallIdBefore);
      const effectCount = await import("node:fs/promises").then(fs => fs.readFile(path.join(evidenceRoot, created.runId, "mock-thread-start-count"), "utf8"));
      expect(effectCount).toBe("1");
      expect(reservation.usageReceiptJson).toMatchObject({ inputTokens: 31, cachedInputTokens: 4, outputTokens: 9, effectiveModel: "gpt-6-luna" });
    } finally {
      process.env.SPEC224_CODEX_MAX_TOKENS_PER_WINDOW = "100000";
      await import("node:fs/promises").then(fs => fs.rm(evidenceRoot, { recursive: true, force: true }));
    }
  }, 90_000);

  it("denies a Python Codex caller when fencing changes after reserve but before dispatch", async () => {
    const [{ spec226DevelopmentControlRouter }, { createJobControlPlane }, { createJobExecutorRegistry }, { executeCanonicalJobEnvelope }, { createSpec224DeveloperFastLaneExecutor }, { DEVELOPER_FAST_LANE_JOB, DEVELOPER_FAST_LANE_CONTRACT }] = await Promise.all([
      import("../../routers/spec226DevelopmentControl"), import("../jobControlPlane"), import("../jobExecutorRegistry"), import("../../jobs/unifiedJobConsumer"), import("../spec224DeveloperFastLaneExecutor"), import("../spec224DeveloperFastLaneContract"),
    ]);
    const fs = await import("node:fs/promises");
    const evidenceRoot = await fs.mkdtemp(path.join(os.tmpdir(), "spec224-fast-lane-fence-"));
    const pauseDir = path.join(evidenceRoot, "dispatch-barrier");
    let execution: Promise<{ result?: unknown; error?: unknown }> | undefined;
    try {
      process.env.SPEC224_CODEX_MAX_TOKENS_PER_WINDOW = "100000";
      process.env.SPEC224_E2E_PAUSE_AFTER_RESERVE = pauseDir;
      const procedure = spec226DevelopmentControlRouter.startDeveloperFastLane as unknown as { _def: { resolver: (value: unknown) => Promise<{ runId: string; jobId: string }> } };
      const created = await procedure._def.resolver({ ctx: { tenantId: "tenant-e2e", user: { id: 22401, role: "admin" } }, input: {
        idempotencyKey: `authenticated-fast-lane-fence-${randomUUID()}`, developerLogin: "developer", sourceRevision: "c".repeat(40), task: "Deny dispatch after fencing changes",
        allowedFiles: ["experiments/agents-sdk-codex-subscription/tests/fixtures/canonical_admission_model_call.py"], writableFiles: ["experiments/agents-sdk-codex-subscription/tests/fixtures/canonical_admission_model_call.py"],
        tests: { runner: "pytest", cwd: ".", paths: ["experiments/agents-sdk-codex-subscription/tests/fixtures/canonical_admission_model_call.py"] }, acceptanceCriteria: ["Stale fencing prevents Codex dispatch"], budget: { implementationMaxTurns: 1, planMaxTurns: 1, reviewMaxTurns: 1 },
      } });
      const executorRegistry = createJobExecutorRegistry([{
        jobType: DEVELOPER_FAST_LANE_JOB, executionClass: "long", contractVersions: new Set([DEVELOPER_FAST_LANE_CONTRACT]),
        executor: createSpec224DeveloperFastLaneExecutor({ repositoryRoot: process.cwd().replace(/\/apps\/web$/, ""), evidenceRoot,
          pythonExecutable: process.env.SPEC224_PYTHON ?? "/tmp/agents-sdk-codex-subscription-venv/bin/python",
          pythonScript: path.join(process.cwd().replace(/\/apps\/web$/, ""), "experiments/agents-sdk-codex-subscription/tests/fixtures/canonical_admission_model_call.py"),
          pythonScriptArgs: (binding, root) => [binding.runId, root], includeStderrInFailure: true,
        }),
      }]);
      const controlPlane = createJobControlPlane();
      execution = executeCanonicalJobEnvelope({ jobId: created.jobId, contractVersion: DEVELOPER_FAST_LANE_CONTRACT, businessAttempt: 1 }, {
        controlPlane, executorRegistry, runnerId: `spec224-fence-${randomUUID()}`, adapter: "test",
      }).then(result => ({ result }), error => ({ error }));
      const deadline = Date.now() + 10_000;
      while (!(await fs.stat(path.join(pauseDir, "reserved")).then(() => true, () => false)) && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 20));
      expect(await fs.stat(path.join(pauseDir, "reserved")).then(() => true, () => false)).toBe(true);

      await sql`UPDATE worker_jobs SET "fencingVersion" = "fencingVersion" + 1 WHERE id = ${created.jobId}`;
      await fs.writeFile(path.join(pauseDir, "continue"), "go");
      const outcome = await execution;
      expect(outcome?.error).toBeTruthy();
      const [reservation] = await sql`SELECT "dispatchState", "threadId", "turnId" FROM worker_job_provider_reservations WHERE "workerJobId" = ${created.jobId} AND "reservationKind" = 'model_call'`;
      expect(reservation).toMatchObject({ dispatchState: "reserved", threadId: null, turnId: null });
      const dispatched = await sql`SELECT count(*)::int AS count FROM worker_job_events WHERE "workerJobId" = ${created.jobId} AND "eventType" IN ('CODEX_MODEL_TURN_DISPATCHING', 'CODEX_MODEL_THREAD_CREATED', 'CODEX_MODEL_TURN_STARTED')`;
      expect(dispatched[0].count).toBe(0);
      await expect(fs.readFile(path.join(evidenceRoot, created.runId, "mock-thread-start-count"), "utf8")).rejects.toMatchObject({ code: "ENOENT" });
    } finally {
      await fs.mkdir(pauseDir, { recursive: true });
      await fs.writeFile(path.join(pauseDir, "continue"), "go");
      await execution?.catch(() => undefined);
      await fs.rm(evidenceRoot, { recursive: true, force: true });
      if (priorEnv.SPEC224_CODEX_MAX_TOKENS_PER_WINDOW === undefined) delete process.env.SPEC224_CODEX_MAX_TOKENS_PER_WINDOW; else process.env.SPEC224_CODEX_MAX_TOKENS_PER_WINDOW = priorEnv.SPEC224_CODEX_MAX_TOKENS_PER_WINDOW;
    }
  }, 60_000);
});
