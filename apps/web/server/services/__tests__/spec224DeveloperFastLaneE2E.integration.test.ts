import { randomUUID } from "node:crypto";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
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
    SPEC224_MOCK_PROVIDER_RETRY_AFTER_SECONDS: process.env.SPEC224_MOCK_PROVIDER_RETRY_AFTER_SECONDS,
    SPEC224_MOCK_ACCEPTED_THREAD_RESPONSE_LOST: process.env.SPEC224_MOCK_ACCEPTED_THREAD_RESPONSE_LOST,
    FEATURE_186_MAX_CONCURRENT_PER_TENANT_LONG: process.env.FEATURE_186_MAX_CONCURRENT_PER_TENANT_LONG,
    FEATURE_186_MAX_CONCURRENT_GLOBAL_LONG: process.env.FEATURE_186_MAX_CONCURRENT_GLOBAL_LONG,
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
    // This file intentionally leaves one denied-before-dispatch reservation
    // unknown; keep the fixture's per-user cap above its accumulated cases.
    process.env.SPEC224_CODEX_MAX_CONCURRENT_TURNS_PER_USER = "10";
    process.env.SPEC224_CODEX_MAX_OUTPUT_TOKENS_PER_TURN = "100";
    process.env.FEATURE_186_MAX_CONCURRENT_PER_TENANT_LONG = "100";
    process.env.FEATURE_186_MAX_CONCURRENT_GLOBAL_LONG = "100";
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

  it("preserves both private admission FDs through a grandchild Python reserve and response", async () => {
    const [{ spec226DevelopmentControlRouter }, { createJobControlPlane }, { createJobExecutorRegistry }, { executeCanonicalJobEnvelope }, { createSpec224DeveloperFastLaneExecutor }, { DEVELOPER_FAST_LANE_JOB, DEVELOPER_FAST_LANE_CONTRACT }] = await Promise.all([
      import("../../routers/spec226DevelopmentControl"), import("../jobControlPlane"), import("../jobExecutorRegistry"), import("../../jobs/unifiedJobConsumer"), import("../spec224DeveloperFastLaneExecutor"), import("../spec224DeveloperFastLaneContract"),
    ]);
    const fs = await import("node:fs/promises");
    const evidenceRoot = await fs.mkdtemp(path.join(os.tmpdir(), "spec224-fast-lane-grandchild-fd-"));
    try {
      const procedure = spec226DevelopmentControlRouter.startDeveloperFastLane as unknown as { _def: { resolver: (value: unknown) => Promise<{ runId: string; jobId: string }> } };
      const created = await procedure._def.resolver({ ctx: { tenantId: "tenant-grandchild-fd", user: { id: 22401, role: "admin" } }, input: {
        idempotencyKey: `authenticated-fast-lane-grandchild-${randomUUID()}`, developerLogin: "developer",
        sourceRevision: "d".repeat(40), task: "Verify inherited request and response descriptors",
        allowedFiles: ["experiments/agents-sdk-codex-subscription/tests/fixtures/canonical_admission_grandchild.py"],
        writableFiles: ["experiments/agents-sdk-codex-subscription/tests/fixtures/canonical_admission_grandchild.py"],
        tests: { runner: "pytest", cwd: ".", paths: ["experiments/agents-sdk-codex-subscription/tests/fixtures/canonical_admission_grandchild.py"] },
        acceptanceCriteria: ["A grandchild reserve request receives a canonical server response over the private FD protocol"],
        budget: { implementationMaxTurns: 1, planMaxTurns: 1, reviewMaxTurns: 1 },
      } });
      const repositoryRoot = process.cwd().replace(/\/apps\/web$/, "");
      const executorRegistry = createJobExecutorRegistry([{
        jobType: DEVELOPER_FAST_LANE_JOB, executionClass: "long", contractVersions: new Set([DEVELOPER_FAST_LANE_CONTRACT]),
        executor: createSpec224DeveloperFastLaneExecutor({ repositoryRoot, evidenceRoot,
          pythonExecutable: process.env.SPEC224_PYTHON ?? "/tmp/agents-sdk-codex-subscription-venv/bin/python",
          pythonScript: path.join(repositoryRoot, "experiments/agents-sdk-codex-subscription/tests/fixtures/canonical_admission_grandchild_parent.py"),
          pythonScriptArgs: (binding, root) => [binding.runId, root], includeStderrInFailure: true,
        }),
      }]);
      const result = await executeCanonicalJobEnvelope({ jobId: created.jobId, contractVersion: DEVELOPER_FAST_LANE_CONTRACT, businessAttempt: 1 }, {
        controlPlane: createJobControlPlane(), executorRegistry, runnerId: `spec224-grandchild-fd-${randomUUID()}`, adapter: "test",
      });
      expect(result).toMatchObject({ state: "succeeded", jobId: created.jobId });
      const grandchildReceipt = JSON.parse(await fs.readFile(path.join(evidenceRoot, created.runId, "grandchild-admission-response.json"), "utf8"));
      expect(grandchildReceipt).toMatchObject({ runId: created.runId, reservation: { kind: "reserved", operationKey: expect.any(String) } });
      const [reservation] = await sql`SELECT "reservationStatus", "usageReceiptJson", "threadId", "turnId" FROM worker_job_provider_reservations WHERE "workerJobId" = ${created.jobId} AND "reservationKind" = 'model_call'`;
      expect(reservation).toMatchObject({ reservationStatus: "released", threadId: "mock-grandchild-thread", turnId: "mock-grandchild-turn" });
      expect(reservation.usageReceiptJson).toMatchObject({ inputTokens: 13, cachedInputTokens: 2, outputTokens: 5, effectiveModel: "gpt-6-luna" });
      expect(JSON.stringify(reservation)).not.toContain("leaseToken");
    } finally {
      await fs.rm(evidenceRoot, { recursive: true, force: true });
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

  it("parks expired scope in WAITING_AUTHORIZATION and rechecks authority before any Python/Codex dispatch", async () => {
    const [{ spec226DevelopmentControlRouter }, { createJobControlPlane }, { createJobExecutorRegistry }, { executeCanonicalJobEnvelope }, { runJobReconciler }, { createSpec224DeveloperFastLaneExecutor }, { DEVELOPER_FAST_LANE_JOB, DEVELOPER_FAST_LANE_CONTRACT }] = await Promise.all([
      import("../../routers/spec226DevelopmentControl"), import("../jobControlPlane"), import("../jobExecutorRegistry"), import("../../jobs/unifiedJobConsumer"), import("../jobReconciler"), import("../spec224DeveloperFastLaneExecutor"), import("../spec224DeveloperFastLaneContract"),
    ]);
    const fs = await import("node:fs/promises");
    const evidenceRoot = await fs.mkdtemp(path.join(os.tmpdir(), "spec224-fast-lane-authorization-wait-"));
    const repositoryRoot = process.cwd().replace(/\/apps\/web$/, "");
    const sourceRevision = execFileSync("git", ["rev-parse", "HEAD"], { cwd: repositoryRoot, encoding: "utf8" }).trim();
    const fixedNow = new Date();
    const authorizeContinuation = vi.fn(async () => { throw new Error("DEVELOPER_CONTINUATION_PERMISSION_REQUIRED"); });
    const spawnImpl = vi.fn(() => { throw new Error("DENIED_AUTHORITY_MUST_NOT_SPAWN_PYTHON_OR_CODEX"); });
    const controlPlane = createJobControlPlane();
    try {
      const procedure = spec226DevelopmentControlRouter.startDeveloperFastLane as unknown as { _def: { resolver: (value: unknown) => Promise<{ runId: string; jobId: string }> } };
      const request = {
        idempotencyKey: `authenticated-fast-lane-auth-wait-${randomUUID()}`,
        developerLogin: "developer", sourceRevision, task: "Wait for fresh authorization without dispatch",
        allowedFiles: ["experiments/agents-sdk-codex-subscription/tests/fixtures/canonical_admission_model_call.py"],
        writableFiles: ["experiments/agents-sdk-codex-subscription/tests/fixtures/canonical_admission_model_call.py"],
        tests: { runner: "pytest", cwd: ".", paths: ["experiments/agents-sdk-codex-subscription/tests/fixtures/canonical_admission_model_call.py"] },
        acceptanceCriteria: ["Expired scope requires fresh server authorization"],
        budget: { maxAttempts: 3, implementationMaxTurns: 1, planMaxTurns: 1, reviewMaxTurns: 1 }, scopeTtlSeconds: 3600,
      };
      const created = await procedure._def.resolver({ ctx: { tenantId: "tenant-e2e", user: { id: 22401, role: "admin" } }, input: request });
      const evidenceDir = path.join(evidenceRoot, created.runId);
      await fs.mkdir(evidenceDir, { recursive: true });
      const allowedTools = ["list_files", "read_file", "read_range", "write_file", "patch_file", "run_focused_tests"];
      const expiredAt = fixedNow.getTime() / 1_000 - 1;
      const receipt = {
        schema: "developer-local-workunit-authorization.v1", taskId: created.runId, workspaceId: "workspace-auth-wait",
        sourceSha: sourceRevision, developerIdentity: { login: "developer", permission: "write" },
        allowedFiles: request.allowedFiles, writableFiles: request.writableFiles, allowedTools, budget: request.budget,
        scopeExpiresAt: expiredAt, productionAccess: false, runnerDispatch: false,
      };
      await fs.writeFile(path.join(evidenceDir, "authorization-receipt.json"), JSON.stringify(receipt));
      await fs.writeFile(path.join(evidenceDir, "contract.json"), JSON.stringify({
        taskId: created.runId, sourceRevision, requirementText: request.task, workspace: repositoryRoot,
        workspaceId: receipt.workspaceId, allowedFiles: request.allowedFiles, writableFiles: request.writableFiles,
        patchableFiles: [], acceptanceCriteria: request.acceptanceCriteria, tests: request.tests,
        budget: request.budget, allowedTools, authority: { productionAccess: false, sharedDatabaseWrite: false, runnerDispatch: false },
        scopeExpiresAt: expiredAt,
        canonicalJobBinding: { jobId: created.jobId, runId: created.runId, tenantId: "tenant-e2e", actorId: 22401 },
      }));
      const executorRegistry = createJobExecutorRegistry([{
        jobType: DEVELOPER_FAST_LANE_JOB, executionClass: "long", contractVersions: new Set([DEVELOPER_FAST_LANE_CONTRACT]),
        executor: createSpec224DeveloperFastLaneExecutor({
          repositoryRoot, evidenceRoot, now: () => fixedNow, authorizeContinuation, spawnImpl: spawnImpl as never,
        }),
      }]);
      const first = await executeCanonicalJobEnvelope({ jobId: created.jobId, contractVersion: DEVELOPER_FAST_LANE_CONTRACT, businessAttempt: 1 }, {
        controlPlane, executorRegistry, runnerId: `spec224-auth-wait-${randomUUID()}`, adapter: "test",
      });
      expect(first).toMatchObject({ state: "deferred", jobId: created.jobId });
      const [waiting] = await sql`SELECT status, "statusReason", "leaseOwnerToken", "leaseExpiresAt", "progressJson" FROM worker_jobs WHERE id = ${created.jobId}`;
      expect(waiting).toMatchObject({ status: "waiting_external", statusReason: "WAITING_AUTHORIZATION", leaseOwnerToken: null, leaseExpiresAt: null });
      const externalWait = waiting.progressJson.externalWait;
      expect(externalWait).toMatchObject({ reason: "authorization", metadata: { schemaVersion: "spec224.developer-authorization-wait.v1" } });
      expect(spawnImpl).not.toHaveBeenCalled();

      const early = await runJobReconciler({ now: new Date(Date.parse(externalWait.resumeAfter) - 1) });
      expect(early.decisions).toContainEqual({ jobId: created.jobId, action: "wait", reasonCode: "authorization_not_yet_eligible" });
      const [stillWaiting] = await sql`SELECT status FROM worker_jobs WHERE id = ${created.jobId}`;
      expect(stillWaiting.status).toBe("waiting_external");

      const due = await runJobReconciler({ now: new Date(Date.parse(externalWait.resumeAfter) + 1) });
      expect(due.decisions).toContainEqual({ jobId: created.jobId, action: "resume", reasonCode: "authorization_recheck_due" });
      const [queued] = await sql`SELECT status, attempt FROM worker_jobs WHERE id = ${created.jobId}`;
      expect(queued.status).toBe("queued");
      const rechecked = await executeCanonicalJobEnvelope({ jobId: created.jobId, contractVersion: DEVELOPER_FAST_LANE_CONTRACT, businessAttempt: queued.attempt }, {
        controlPlane, executorRegistry, runnerId: `spec224-auth-recheck-${randomUUID()}`, adapter: "test",
      });
      expect(rechecked).toMatchObject({ state: "deferred", jobId: created.jobId });
      expect(authorizeContinuation).toHaveBeenCalledTimes(2);
      expect(spawnImpl).not.toHaveBeenCalled();
      const [reservationCount] = await sql`SELECT count(*)::int AS count FROM worker_job_provider_reservations WHERE "workerJobId" = ${created.jobId}`;
      expect(reservationCount.count).toBe(0);
      // Do not leave an auth wait behind for later simulated-clock tests in
      // this shared disposable database fixture.
      await sql`UPDATE worker_jobs SET status = 'cancelled' WHERE id = ${created.jobId}`;
    } finally {
      await fs.rm(evidenceRoot, { recursive: true, force: true });
    }
  }, 90_000);

  it("rejects an unauthorized WorkUnit binding before creating the Python caller", async () => {
    const [{ spec226DevelopmentControlRouter }, { createJobControlPlane }, { createJobExecutorRegistry }, { executeCanonicalJobEnvelope }, { createSpec224DeveloperFastLaneExecutor }, { DEVELOPER_FAST_LANE_JOB, DEVELOPER_FAST_LANE_CONTRACT }] = await Promise.all([
      import("../../routers/spec226DevelopmentControl"), import("../jobControlPlane"), import("../jobExecutorRegistry"), import("../../jobs/unifiedJobConsumer"), import("../spec224DeveloperFastLaneExecutor"), import("../spec224DeveloperFastLaneContract"),
    ]);
    const evidenceRoot = await import("node:fs/promises").then(fs => fs.mkdtemp(path.join(os.tmpdir(), "spec224-fast-lane-unauthorized-binding-")));
    const spawnImpl = vi.fn();
    try {
      const procedure = spec226DevelopmentControlRouter.startDeveloperFastLane as unknown as { _def: { resolver: (value: unknown) => Promise<{ runId: string; jobId: string }> } };
      const created = await procedure._def.resolver({ ctx: { tenantId: "tenant-e2e", user: { id: 22401, role: "admin" } }, input: {
        idempotencyKey: `authenticated-fast-lane-unauthorized-${randomUUID()}`, developerLogin: "developer", sourceRevision: "e".repeat(40), task: "Deny changed WorkUnit authority binding",
        allowedFiles: ["experiments/agents-sdk-codex-subscription/tests/fixtures/canonical_admission_model_call.py"], writableFiles: ["experiments/agents-sdk-codex-subscription/tests/fixtures/canonical_admission_model_call.py"],
        tests: { runner: "pytest", cwd: ".", paths: ["experiments/agents-sdk-codex-subscription/tests/fixtures/canonical_admission_model_call.py"] }, acceptanceCriteria: ["Mismatched actor cannot start a Python caller"], budget: { implementationMaxTurns: 1, planMaxTurns: 1, reviewMaxTurns: 1 },
      } });
      await sql`UPDATE worker_jobs SET "inputJson" = jsonb_set("inputJson", '{developerWorkUnit,actorId}', '22402'::jsonb) WHERE id = ${created.jobId}`;
      const executorRegistry = createJobExecutorRegistry([{
        jobType: DEVELOPER_FAST_LANE_JOB, executionClass: "long", contractVersions: new Set([DEVELOPER_FAST_LANE_CONTRACT]),
        executor: createSpec224DeveloperFastLaneExecutor({ repositoryRoot: process.cwd().replace(/\/apps\/web$/, ""), evidenceRoot, spawnImpl: spawnImpl as never }),
      }]);
      await expect(executeCanonicalJobEnvelope({ jobId: created.jobId, contractVersion: DEVELOPER_FAST_LANE_CONTRACT, businessAttempt: 1 }, {
        controlPlane: createJobControlPlane(), executorRegistry, runnerId: `spec224-unauthorized-${randomUUID()}`, adapter: "test",
      })).rejects.toThrow("DEVELOPER_FAST_LANE_JOB_BINDING_INVALID");
      expect(spawnImpl).not.toHaveBeenCalled();
      const [reservationCount] = await sql`SELECT count(*)::int AS count FROM worker_job_provider_reservations WHERE "workerJobId" = ${created.jobId}`;
      expect(reservationCount.count).toBe(0);
      await sql`UPDATE worker_jobs SET status = 'failed' WHERE id = ${created.jobId}`;
    } finally {
      await import("node:fs/promises").then(fs => fs.rm(evidenceRoot, { recursive: true, force: true }));
    }
  }, 60_000);

  it("preserves a multi-day provider reset, then resumes the same WorkUnit with a distinct call ID and unknown usage retained", async () => {
    const [{ spec226DevelopmentControlRouter }, { createJobControlPlane }, { createJobExecutorRegistry }, { executeCanonicalJobEnvelope }, { runJobReconciler }, { createSpec224DeveloperFastLaneExecutor }, { DEVELOPER_FAST_LANE_JOB, DEVELOPER_FAST_LANE_CONTRACT }] = await Promise.all([
      import("../../routers/spec226DevelopmentControl"), import("../jobControlPlane"), import("../jobExecutorRegistry"), import("../../jobs/unifiedJobConsumer"), import("../jobReconciler"), import("../spec224DeveloperFastLaneExecutor"), import("../spec224DeveloperFastLaneContract"),
    ]);
    const fs = await import("node:fs/promises");
    const evidenceRoot = await fs.mkdtemp(path.join(os.tmpdir(), "spec224-fast-lane-capacity-resume-"));
    const controlPlane = createJobControlPlane();
    try {
      process.env.SPEC224_CODEX_MAX_TOKENS_PER_WINDOW = "100000";
      process.env.SPEC224_MOCK_PROVIDER_RETRY_AFTER_SECONDS = String(3 * 24 * 60 * 60);
      const procedure = spec226DevelopmentControlRouter.startDeveloperFastLane as unknown as { _def: { resolver: (value: unknown) => Promise<{ runId: string; jobId: string }> } };
      const created = await procedure._def.resolver({ ctx: { tenantId: "tenant-e2e", user: { id: 22401, role: "admin" } }, input: {
        idempotencyKey: `authenticated-fast-lane-capacity-${randomUUID()}`, developerLogin: "developer", sourceRevision: "d".repeat(40), task: "Resume after mocked multi-day Codex capacity wait",
        allowedFiles: ["experiments/agents-sdk-codex-subscription/tests/fixtures/canonical_admission_model_call.py"], writableFiles: ["experiments/agents-sdk-codex-subscription/tests/fixtures/canonical_admission_model_call.py"],
        tests: { runner: "pytest", cwd: ".", paths: ["experiments/agents-sdk-codex-subscription/tests/fixtures/canonical_admission_model_call.py"] }, acceptanceCriteria: ["Provider reset wait resumes through the canonical scheduler"], budget: { implementationMaxTurns: 1, planMaxTurns: 1, reviewMaxTurns: 1 },
      } });
      const executorRegistry = createJobExecutorRegistry([{
        jobType: DEVELOPER_FAST_LANE_JOB, executionClass: "long", contractVersions: new Set([DEVELOPER_FAST_LANE_CONTRACT]),
        executor: createSpec224DeveloperFastLaneExecutor({ repositoryRoot: process.cwd().replace(/\/apps\/web$/, ""), evidenceRoot,
          pythonExecutable: process.env.SPEC224_PYTHON ?? "/tmp/agents-sdk-codex-subscription-venv/bin/python",
          pythonScript: path.join(process.cwd().replace(/\/apps\/web$/, ""), "experiments/agents-sdk-codex-subscription/tests/fixtures/canonical_admission_model_call.py"),
          pythonScriptArgs: (binding, root) => [binding.runId, root], includeStderrInFailure: true,
        }),
      }]);
      const first = await executeCanonicalJobEnvelope({ jobId: created.jobId, contractVersion: DEVELOPER_FAST_LANE_CONTRACT, businessAttempt: 1 }, {
        controlPlane, executorRegistry, runnerId: `spec224-capacity-${randomUUID()}`, adapter: "test",
      });
      expect(first).toMatchObject({ state: "deferred", jobId: created.jobId });
      const [waitingJob] = await sql`SELECT status, "progressJson", attempt, "fencingVersion" FROM worker_jobs WHERE id = ${created.jobId}`;
      const externalWait = waitingJob.progressJson.externalWait;
      expect(waitingJob.status).toBe("waiting_external");
      expect(externalWait).toMatchObject({ reason: "provider_capacity", metadata: { schemaVersion: "spec224.developer-model-wait.v1", reservationState: "unknown_after_dispatch" } });
      expect(Date.parse(externalWait.resumeAfter) - Date.now()).toBeGreaterThan(3 * 24 * 60 * 60 * 1_000 - 5_000);
      const [unknownReservation] = await sql`SELECT "modelCallId", "reservationStatus", "usageState", "dispatchState", "threadId", "turnId" FROM worker_job_provider_reservations WHERE "workerJobId" = ${created.jobId} AND "reservationKind" = 'model_call'`;
      expect(unknownReservation).toMatchObject({ reservationStatus: "unknown", usageState: "unknown", dispatchState: "unknown", threadId: null, turnId: null });
      const idsBeforeResume = JSON.parse(await fs.readFile(path.join(evidenceRoot, created.runId, "mock-model-call-ids.json"), "utf8"));

      const early = await runJobReconciler({ now: new Date(Date.parse(externalWait.resumeAfter) - 1) });
      expect(early.decisions).toContainEqual({ jobId: created.jobId, action: "wait", reasonCode: "provider_capacity_not_yet_eligible" });
      const [stillWaiting] = await sql`SELECT status FROM worker_jobs WHERE id = ${created.jobId}`;
      expect(stillWaiting.status).toBe("waiting_external");

      process.env.SPEC224_MOCK_PROVIDER_RETRY_AFTER_SECONDS = "";
      const due = await runJobReconciler({ now: new Date(Date.parse(externalWait.resumeAfter) + 1) });
      expect(due.decisions).toContainEqual({ jobId: created.jobId, action: "resume", reasonCode: "provider_capacity_retry_due" });
      const [queued] = await sql`SELECT status, attempt FROM worker_jobs WHERE id = ${created.jobId}`;
      expect(queued.status).toBe("queued");
      const resumed = await executeCanonicalJobEnvelope({ jobId: created.jobId, contractVersion: DEVELOPER_FAST_LANE_CONTRACT, businessAttempt: queued.attempt }, {
        controlPlane, executorRegistry, runnerId: `spec224-capacity-${randomUUID()}`, adapter: "test",
      });
      expect(resumed).toMatchObject({ state: "succeeded", jobId: created.jobId });

      const reservations = await sql`SELECT "modelCallId", "reservationStatus", "usageState", "threadId", "turnId" FROM worker_job_provider_reservations WHERE "workerJobId" = ${created.jobId} AND "reservationKind" = 'model_call' ORDER BY "createdAt"`;
      expect(reservations).toHaveLength(2);
      expect(reservations[0]).toMatchObject({ modelCallId: unknownReservation.modelCallId, reservationStatus: "unknown", usageState: "unknown", threadId: null, turnId: null });
      expect(reservations[1]).toMatchObject({ reservationStatus: "released", usageState: "known", threadId: "mock-thread-e2e", turnId: "mock-turn-e2e" });
      expect(reservations[1].modelCallId).not.toBe(reservations[0].modelCallId);
      const idsAfterResume = JSON.parse(await fs.readFile(path.join(evidenceRoot, created.runId, "mock-model-call-ids.json"), "utf8"));
      expect(idsAfterResume).toHaveLength(2);
      expect(idsAfterResume[0]).toBe(idsBeforeResume[0]);
      expect(idsAfterResume[1]).toBe(reservations[1].modelCallId);
      expect(await fs.readFile(path.join(evidenceRoot, created.runId, "mock-thread-start-count"), "utf8")).toBe("1");
    } finally {
      process.env.SPEC224_CODEX_MAX_TOKENS_PER_WINDOW = "100000";
      if (priorEnv.SPEC224_MOCK_PROVIDER_RETRY_AFTER_SECONDS === undefined) delete process.env.SPEC224_MOCK_PROVIDER_RETRY_AFTER_SECONDS;
      else process.env.SPEC224_MOCK_PROVIDER_RETRY_AFTER_SECONDS = priorEnv.SPEC224_MOCK_PROVIDER_RETRY_AFTER_SECONDS;
      await fs.rm(evidenceRoot, { recursive: true, force: true });
    }
  }, 90_000);

  it.each(["missing_lease", "expired_lease", "revoked_lease", "wrong_attempt", "stale_fencing", "lease_lost_before_dispatch"] as const)(
    "denies a Python Codex caller for %s after reserve and before dispatch", async denial => {
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

      if (denial === "missing_lease") await sql`UPDATE worker_jobs SET "leaseExpiresAt" = NULL WHERE id = ${created.jobId}`;
      else if (denial === "expired_lease") await sql`UPDATE worker_jobs SET "leaseExpiresAt" = NOW() - INTERVAL '1 second' WHERE id = ${created.jobId}`;
      else if (denial === "revoked_lease") await sql`UPDATE worker_jobs SET "leaseOwnerToken" = NULL, "leaseExpiresAt" = NULL WHERE id = ${created.jobId}`;
      else if (denial === "wrong_attempt") await sql`UPDATE worker_jobs SET attempt = attempt + 1 WHERE id = ${created.jobId}`;
      else if (denial === "stale_fencing") await sql`UPDATE worker_jobs SET "fencingVersion" = "fencingVersion" + 1 WHERE id = ${created.jobId}`;
      else await sql`UPDATE worker_jobs SET "leaseOwnerToken" = 'revoked-before-dispatch' WHERE id = ${created.jobId}`;
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

  it("keeps an accepted provider thread with lost identity unknown and refuses duplicate dispatch after restart", async () => {
    const [{ spec226DevelopmentControlRouter }, { createJobControlPlane }, { createSpec224DeveloperFastLaneExecutor }, { DEVELOPER_FAST_LANE_JOB, DEVELOPER_FAST_LANE_CONTRACT }] = await Promise.all([
      import("../../routers/spec226DevelopmentControl"), import("../jobControlPlane"), import("../spec224DeveloperFastLaneExecutor"), import("../spec224DeveloperFastLaneContract"),
    ]);
    const fs = await import("node:fs/promises");
    const evidenceRoot = await fs.mkdtemp(path.join(os.tmpdir(), "spec224-fast-lane-ambiguous-turn-"));
    const controlPlane = createJobControlPlane();
    try {
      delete process.env.SPEC224_E2E_PAUSE_AFTER_RESERVE;
      process.env.SPEC224_CODEX_MAX_TOKENS_PER_WINDOW = "100000";
      process.env.SPEC224_MOCK_PROVIDER_RETRY_AFTER_SECONDS = "";
      process.env.SPEC224_MOCK_ACCEPTED_THREAD_RESPONSE_LOST = "1";
      const procedure = spec226DevelopmentControlRouter.startDeveloperFastLane as unknown as { _def: { resolver: (value: unknown) => Promise<{ runId: string; jobId: string }> } };
      const created = await procedure._def.resolver({ ctx: { tenantId: "tenant-e2e", user: { id: 22401, role: "admin" } }, input: {
        idempotencyKey: `authenticated-fast-lane-ambiguous-${randomUUID()}`, developerLogin: "developer", sourceRevision: "f".repeat(40), task: "Fail closed when accepted thread identity is lost",
        allowedFiles: ["experiments/agents-sdk-codex-subscription/tests/fixtures/canonical_admission_model_call.py"], writableFiles: ["experiments/agents-sdk-codex-subscription/tests/fixtures/canonical_admission_model_call.py"],
        tests: { runner: "pytest", cwd: ".", paths: ["experiments/agents-sdk-codex-subscription/tests/fixtures/canonical_admission_model_call.py"] }, acceptanceCriteria: ["Do not create a duplicate provider thread after an ambiguous acceptance"], budget: { implementationMaxTurns: 1, planMaxTurns: 1, reviewMaxTurns: 1 },
      } });
      const lease = await controlPlane.claim({ jobId: created.jobId, runnerId: `spec224-ambiguous-${randomUUID()}`, adapter: "test" });
      expect(lease).toBeTruthy();
      await controlPlane.start(lease!);
      const context = await controlPlane.getContext(created.jobId);
      const executor = createSpec224DeveloperFastLaneExecutor({
        repositoryRoot: process.cwd().replace(/\/apps\/web$/, ""), evidenceRoot,
        pythonExecutable: process.env.SPEC224_PYTHON ?? "/tmp/agents-sdk-codex-subscription-venv/bin/python",
        pythonScript: path.join(process.cwd().replace(/\/apps\/web$/, ""), "experiments/agents-sdk-codex-subscription/tests/fixtures/canonical_admission_model_call.py"),
        pythonScriptArgs: (binding, root) => [binding.runId, root], includeStderrInFailure: true,
      });
      const reporter = {
        assertActive: (activeLease: typeof lease & {}) => controlPlane.assertActive(activeLease!),
        heartbeat: (activeLease: typeof lease & {}) => controlPlane.heartbeat(activeLease!),
        waitForExternal: (activeLease: typeof lease & {}, input: any) => controlPlane.waitForExternal(activeLease!, input),
      };
      const invoke = () => executor({ context: context!, lease: lease!, reporter: reporter as any });
      const firstOutcome = await invoke().then(result => ({ result, error: null as Error | null }), error => ({ result: null, error: error as Error }));
      const firstError = firstOutcome.error ?? new Error(`EXPECTED_AMBIGUOUS_MODEL_FAILURE:${JSON.stringify(firstOutcome.result)}`);
      expect(firstError.message).toContain("DEVELOPER_FAST_LANE_PROCESS_FAILED");
      const acceptedPath = path.join(evidenceRoot, created.runId, "mock-provider-accepted-thread-with-lost-identity");
      expect(await fs.stat(acceptedPath).then(() => true, () => false), firstError?.message).toBe(true);
      await expect(invoke()).rejects.toThrow("DEVELOPER_FAST_LANE_PROCESS_FAILED");

      const [reservation] = await sql`SELECT "modelCallId", "reservationStatus", "usageState", "dispatchState", "threadId", "turnId", "usageReceiptJson" FROM worker_job_provider_reservations WHERE "workerJobId" = ${created.jobId} AND "reservationKind" = 'model_call'`;
      expect(reservation).toMatchObject({ reservationStatus: "unknown", usageState: "unknown", dispatchState: "unknown", threadId: null, turnId: null, usageReceiptJson: null });
      expect(await fs.readFile(path.join(evidenceRoot, created.runId, "mock-thread-start-attempt-count"), "utf8")).toBe("1");
      const modelCallId = await fs.readFile(path.join(evidenceRoot, created.runId, "mock-model-call-id"), "utf8");
      expect(reservation.modelCallId).toBe(modelCallId);
      expect(await fs.readFile(path.join(evidenceRoot, created.runId, "mock-thread-start-count"), "utf8").catch(() => "0")).toBe("0");
      await controlPlane.fail(lease!, {
        code: "CODEX_TURN_RECONCILIATION_REQUIRED",
        message: "Mock Codex accepted the thread but provider identity was lost; do not replay without reconciliation evidence.",
        class: "permanent", operatorReviewRequired: true,
      });
      const [job] = await sql`SELECT status, "operatorReviewReason" FROM worker_jobs WHERE id = ${created.jobId}`;
      expect(job.status).toBe("failed");
    } finally {
      process.env.SPEC224_CODEX_MAX_TOKENS_PER_WINDOW = "100000";
      if (priorEnv.SPEC224_MOCK_ACCEPTED_THREAD_RESPONSE_LOST === undefined) delete process.env.SPEC224_MOCK_ACCEPTED_THREAD_RESPONSE_LOST;
      else process.env.SPEC224_MOCK_ACCEPTED_THREAD_RESPONSE_LOST = priorEnv.SPEC224_MOCK_ACCEPTED_THREAD_RESPONSE_LOST;
      if (priorEnv.SPEC224_E2E_PAUSE_AFTER_RESERVE === undefined) delete process.env.SPEC224_E2E_PAUSE_AFTER_RESERVE;
      else process.env.SPEC224_E2E_PAUSE_AFTER_RESERVE = priorEnv.SPEC224_E2E_PAUSE_AFTER_RESERVE;
      await fs.rm(evidenceRoot, { recursive: true, force: true });
    }
  }, 60_000);
});
