import { createHash, randomUUID } from "node:crypto";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { execFileSync, spawn } from "node:child_process";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createSpec277DisposablePostgres } from "./support/spec277DisposablePostgres";
import { installSpec277AutoTeamRuntimeSchema } from "./support/spec277AutoTeamRuntimeSchema";

async function prepareGoldenDefaultPathRepository(sourceRoot: string, tempRoot: string) {
  const repositoryRoot = path.join(tempRoot, "repository");
  const originPath = path.join(tempRoot, "spec224-fixture", "developer-workunit.git");
  const sourceRootPath = path.join(tempRoot, "workspace-sources");
  const workunitPath = "experiments/agents-sdk-codex-subscription/tests/fixtures/golden_default_path/golden_workunit_test.py";
  const execGit = (args: string[], cwd = repositoryRoot) => execFileSync("git", args, { cwd, encoding: "utf8", maxBuffer: 32 * 1024 * 1024 }).trim();
  execFileSync("git", ["clone", "--shared", "--no-checkout", sourceRoot, repositoryRoot], { stdio: "ignore" });
  await (await import("node:fs/promises")).mkdir(path.dirname(originPath), { recursive: true });
  execFileSync("git", ["init", "--bare", originPath], { stdio: "ignore" });
  const sourceObjects = execFileSync("git", ["rev-parse", "--path-format=absolute", "--git-common-dir"], { cwd: sourceRoot, encoding: "utf8" }).trim();
  const cloneObjects = execFileSync("git", ["rev-parse", "--path-format=absolute", "--git-dir"], { cwd: repositoryRoot, encoding: "utf8" }).trim();
  await (await import("node:fs/promises")).mkdir(path.join(originPath, "objects", "info"), { recursive: true });
  await (await import("node:fs/promises")).writeFile(path.join(originPath, "objects", "info", "alternates"), `${path.join(sourceObjects, "objects")}\n${path.join(cloneObjects, "objects")}\n`);
  const portServer = net.createServer();
  await new Promise<void>(resolve => portServer.listen(0, "127.0.0.1", resolve));
  const port = (portServer.address() as net.AddressInfo).port;
  await new Promise<void>(resolve => portServer.close(() => resolve()));
  const originServer = spawn("git", ["daemon", "--reuseaddr", "--export-all", `--base-path=${tempRoot}`, "--listen=127.0.0.1", `--port=${port}`], { stdio: "ignore" });
  const ready = await new Promise<boolean>(resolve => {
    const attempt = (remaining: number) => {
      const socket = net.connect(port, "127.0.0.1");
      socket.once("connect", () => { socket.destroy(); resolve(true); });
      socket.once("error", () => { socket.destroy(); if (remaining <= 0) resolve(false); else setTimeout(() => attempt(remaining - 1), 25); });
    };
    attempt(40);
  });
  if (!ready) { originServer.kill("SIGTERM"); throw new Error("GOLDEN_LOCAL_GIT_ORIGIN_FAILED_TO_START"); }
  execGit(["remote", "set-url", "origin", `git://127.0.0.1:${port}/spec224-fixture/developer-workunit.git`]);
  execGit(["config", "user.name", "SPEC-224 test fixture"]);
  execGit(["config", "user.email", "spec224-fixture@example.invalid"]);
  execGit(["config", "core.hooksPath", "/dev/null"]);
  const originalSourceRevision = execGit(["rev-parse", "HEAD"]);
  execFileSync("git", ["--git-dir", originPath, "update-ref", "refs/heads/main", originalSourceRevision], { stdio: "ignore" });
  execGit(["checkout", "--detach", originalSourceRevision]);
  const fixturePath = path.join(repositoryRoot, workunitPath);
  await (await import("node:fs/promises")).mkdir(path.dirname(fixturePath), { recursive: true });
  await (await import("node:fs/promises")).copyFile(path.join(sourceRoot, workunitPath), fixturePath);
  for (const harnessPath of [
    "experiments/agents-sdk-codex-subscription/developer_workunit.py",
    "experiments/agents-sdk-codex-subscription/run_spec_workunit.py",
    "experiments/agents-sdk-codex-subscription/codex_model.py",
  ]) {
    await (await import("node:fs/promises")).copyFile(path.join(sourceRoot, harnessPath), path.join(repositoryRoot, harnessPath));
  }
  const policy = `[repository]\nrepository_id = "spec224-golden-${path.basename(tempRoot)}"\nremote = "origin"\ncanonical_ref = "refs/heads/main"\ncanonical_user_workspace = "${path.join(tempRoot, "primary-workspace")}"\nsource_root = "${sourceRootPath}"\nsource_fallback_roots = ["/mnt/SmartSpecDev/.tmp"]\nlease_root = "${path.join(tempRoot, "leases")}"\nbuild_target = "spec224-test"\n`;
  await (await import("node:fs/promises")).writeFile(path.join(repositoryRoot, ".development-repository.toml"), policy);
  execGit(["add", ".development-repository.toml", workunitPath, "experiments/agents-sdk-codex-subscription/developer_workunit.py", "experiments/agents-sdk-codex-subscription/run_spec_workunit.py", "experiments/agents-sdk-codex-subscription/codex_model.py"]);
  execGit(["commit", "-m", "Configure isolated golden E2E workspace authority"]);
  const sourceRevision = execGit(["rev-parse", "HEAD"]);
  execFileSync("git", ["--git-dir", originPath, "update-ref", "refs/heads/main", sourceRevision], { stdio: "ignore" });
  return { repositoryRoot, originPath, sourceRootPath, sourceRevision, originServer };
}

async function createGoldenFastLaneHarness(sourceRoot: string) {
  const fs = await import("node:fs/promises");
  const tempRoot = await fs.mkdtemp("/mnt/SmartSpecDev/.tmp/spec224-golden-harness-");
  const repositoryRoot = sourceRoot;
  const stateRoot = path.join(tempRoot, "mock-codex");
  const evidenceRoot = path.join(tempRoot, "evidence");
  const fakeBin = path.join(tempRoot, "bin");
  const clockPath = path.join(tempRoot, "clock-epoch-seconds");
  const initialClock = new Date();
  // Server lifecycle and Python share the injected clock from fixture creation.
  vi.setSystemTime(initialClock);
  const prior = Object.fromEntries(["PATH", "PYTHONPATH", "SPEC224_GOLDEN_STATE_DIR", "SPEC224_GOLDEN_CLOCK_FILE", "SPEC224_GOLDEN_429_ONCE", "SPEC224_GOLDEN_RETRY_AFTER_SECONDS"].map(key => [key, process.env[key]]));
  await fs.mkdir(fakeBin, { recursive: true });
  await fs.writeFile(path.join(fakeBin, "gh"), "#!/bin/sh\ncase \"$*\" in\n  *user) echo '{\"login\":\"developer\"}' ;;\n  *permission) echo '{\"permission\":\"write\"}' ;;\n  *) exit 2 ;;\nesac\n", { mode: 0o755 });
  process.env.PATH = `${fakeBin}${path.delimiter}${prior.PATH ?? ""}`;
  process.env.PYTHONPATH = [path.join(sourceRoot, "experiments/agents-sdk-codex-subscription/tests/fixtures/golden_default_path/pythonpath"), prior.PYTHONPATH].filter(Boolean).join(path.delimiter);
  process.env.SPEC224_GOLDEN_STATE_DIR = stateRoot;
  process.env.SPEC224_GOLDEN_CLOCK_FILE = clockPath;
  await fs.writeFile(clockPath, String(initialClock.getTime() / 1_000));
  const isolated = await prepareGoldenDefaultPathRepository(sourceRoot, tempRoot);
  const [spec226DevelopmentControlRouter, jobControl, executorRegistryModule, jobConsumer, executorModule, contractModule] = await Promise.all([
    import("../../routers/spec226DevelopmentControl"), import("../jobControlPlane"), import("../jobExecutorRegistry"), import("../../jobs/unifiedJobConsumer"), import("../spec224DeveloperFastLaneExecutor"), import("../spec224DeveloperFastLaneContract"),
  ]);
  let serverNow = initialClock;
  let crashAt: string | undefined;
  let terminateOnInjectedFault = false;
  let simulateRunnerProcessLoss = false;
  const controlPlane = jobControl.createJobControlPlane();
  const registry = executorRegistryModule.createJobExecutorRegistry([{
    jobType: contractModule.DEVELOPER_FAST_LANE_JOB, executionClass: "long",
    contractVersions: new Set([contractModule.DEVELOPER_FAST_LANE_CONTRACT]),
    executor: executorModule.createSpec224DeveloperFastLaneExecutor({
      repositoryRoot: isolated.repositoryRoot, evidenceRoot,
      pythonExecutable: process.env.SPEC224_PYTHON ?? "/tmp/agents-sdk-codex-subscription-venv/bin/python",
      includeStderrInFailure: true, now: () => new Date(serverNow), get crashAt() { return crashAt; },
      get terminateOnInjectedFault() { return terminateOnInjectedFault; },
    }),
  }]);
  const procedure = spec226DevelopmentControlRouter.spec226DevelopmentControlRouter.startDeveloperFastLane;
  const resolver = (procedure as unknown as { _def: { resolver: (value: unknown) => Promise<{ runId: string; jobId: string }> } })._def.resolver;
  const execute = (jobId: string, attempt: number) => jobConsumer.executeCanonicalJobEnvelope(
    { jobId, contractVersion: contractModule.DEVELOPER_FAST_LANE_CONTRACT, businessAttempt: attempt },
    {
      controlPlane: simulateRunnerProcessLoss ? {
        ...controlPlane,
        async fail(_lease: Parameters<typeof controlPlane.fail>[0], error: Parameters<typeof controlPlane.fail>[1]) {
          throw new Error(`SIMULATED_CANONICAL_RUNNER_PROCESS_LOSS:${error.message}`);
        },
      } : controlPlane,
      executorRegistry: registry, runnerId: `spec224-golden-${randomUUID()}`, adapter: "test",
    },
  );
  return {
    ...isolated, tempRoot, stateRoot, evidenceRoot, clockPath, controlPlane,
    async createJob(request: Record<string, unknown>) {
      return resolver({ ctx: { tenantId: "tenant-golden-default", user: { id: 22401, role: "admin" } }, input: request });
    },
    execute,
    setCrashAt(value?: string, terminateAtBoundary = false) {
      crashAt = value;
      terminateOnInjectedFault = terminateAtBoundary;
      simulateRunnerProcessLoss = terminateAtBoundary;
    },
    setTime(date: Date) {
      serverNow = new Date(date);
      vi.setSystemTime(date);
      return fs.writeFile(clockPath, String(date.getTime() / 1_000));
    },
    async advanceOrigin() {
      const revisionPath = path.join(isolated.repositoryRoot, "origin-advanced-for-e2e.txt");
      await fs.writeFile(revisionPath, `${new Date().toISOString()}\n`);
      execFileSync("git", ["add", "origin-advanced-for-e2e.txt"], { cwd: isolated.repositoryRoot, stdio: "ignore" });
      execFileSync("git", ["commit", "-m", "Advance isolated origin during provider wait"], { cwd: isolated.repositoryRoot, stdio: "ignore" });
      const revision = execFileSync("git", ["rev-parse", "HEAD"], { cwd: isolated.repositoryRoot, encoding: "utf8" }).trim();
      execFileSync("git", ["--git-dir", isolated.originPath, "update-ref", "refs/heads/main", revision], { stdio: "ignore" });
      return revision;
    },
    async close() {
      // Restore the real clock rather than freezing later tests at fixture start.
      vi.useRealTimers();
      for (const [key, value] of Object.entries(prior)) if (value === undefined) delete process.env[key]; else process.env[key] = value;
      if (isolated.originServer.exitCode === null && isolated.originServer.signalCode === null) {
        await new Promise<void>(resolve => { isolated.originServer.once("close", () => resolve()); isolated.originServer.kill("SIGTERM"); });
      }
      await fs.rm(tempRoot, { recursive: true, force: true });
    },
  };
}

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
  }, 60_000);

  afterAll(async () => {
    await closeDb?.();
    await sql?.end();
    await fixture?.assertOwned();
    await fixture?.close();
    for (const [key, value] of Object.entries(priorEnv)) if (value === undefined) delete process.env[key]; else process.env[key] = value;
  });

  it.each([
    ["python.deadline_test", "python_job_worker", 10],
    ["media.image_generation", "node_job_worker", 10],
    ["media.audio_generation", "node_job_worker", 10],
    ["media.video_render", "node_job_worker", 60],
    ["notification.deadline_test", "node_job_worker", 10],
  ] as const)("retains the persisted ordinary family limit for %s", async (jobType, runtimeType, minutes) => {
    const { createJobControlPlane } = await import("../jobControlPlane");
    const controlPlane = createJobControlPlane();
    const created = await controlPlane.create({
      contractVersion: "feature-186-v1", tenantId: "tenant-deadline-ordinary", requestedByUserId: 22401,
      jobType, executionClass: "long", input: {}, idempotencyKey: `ordinary-deadline-${randomUUID()}`,
      retryPolicy: { deadlineMs: 7 * 24 * 60 * 60_000, deadlineMode: "fixed", maxAttempts: 2, baseDelayMs: 1, maxDelayMs: 10, jitter: "none", allowedErrorClasses: [] },
      timeoutPolicy: { softTimeoutMs: 300_000, hardTimeoutMs: 28_800_000 },
    }, { runtimeType });
    const [stored] = await sql`SELECT "createdAt", "retryPolicyJson" FROM worker_jobs WHERE id = ${created.jobId}`;
    expect(stored.retryPolicyJson).toMatchObject({ deadlineMs: minutes * 60_000, deadlineMode: "fixed" });
    expect(await controlPlane.expireDeadline(created.jobId, new Date(new Date(stored.createdAt).getTime() + minutes * 60_000))).toBe("expired");
  });

  it.each(["budget", "provider_capacity"] as const)(
    "persists the authenticated seven-day deadline and recovers %s waits without model dispatch", async reason => {
      const [{ spec226DevelopmentControlRouter }, { createJobControlPlane }, { runJobReconciler }] = await Promise.all([
        import("../../routers/spec226DevelopmentControl"), import("../jobControlPlane"), import("../jobReconciler"),
      ]);
      const controlPlane = createJobControlPlane();
      // External test identity; exercise actual admin middleware, input parsing,
      // producer, gateway and PostgreSQL persistence. No executor/model is run.
      const caller = spec226DevelopmentControlRouter.createCaller({ tenantId: "tenant-deadline", user: { id: 22401, role: "admin" } } as any);
      const request = {
        idempotencyKey: `deadline-persistence-${reason}-${randomUUID()}`,
        developerLogin: "developer", sourceRevision: "a".repeat(40), task: "Validate bounded Fast Lane lifecycle",
        allowedFiles: ["apps/web/server/services/spec224DeveloperFastLane.ts", "apps/web/server/services/__tests__/spec224DeveloperFastLane.test.ts"],
        writableFiles: ["apps/web/server/services/spec224DeveloperFastLane.ts"],
        tests: { runner: "vitest" as const, cwd: "apps/web", paths: ["apps/web/server/services/__tests__/spec224DeveloperFastLane.test.ts"], databaseMode: "none" as const },
        acceptanceCriteria: ["Preserve bounded authority independently of the job deadline"],
        budget: { implementationMaxTurns: 4, planMaxTurns: 2, reviewMaxTurns: 2, maxAttempts: 2 }, scopeTtlSeconds: 3600,
      };
      try {
        await expect(spec226DevelopmentControlRouter.createCaller({ tenantId: "tenant-deadline", user: null } as any).startDeveloperFastLane(request)).rejects.toMatchObject({ code: "FORBIDDEN" });
        const created = await caller.startDeveloperFastLane(request);
        const [stored] = await sql`SELECT * FROM worker_jobs WHERE id = ${created.jobId}`;
        const sevenDays = 7 * 24 * 60 * 60_000;
        expect(stored.retryPolicyJson).toMatchObject({ deadlineMs: sevenDays, deadlineMode: "fixed", maxAttempts: 8 });
        expect(stored.inputJson.developerWorkUnit).toMatchObject({ runId: created.runId, workerJobId: created.jobId, tenantId: "tenant-deadline", actorId: 22401, request: { scopeTtlSeconds: 3600, budget: request.budget } });
        await expect(caller.startDeveloperFastLane(request)).resolves.toMatchObject({ jobId: created.jobId, runId: created.runId, created: false });
        const startedAt = new Date(stored.createdAt).getTime();
        const eligible = new Date(startedAt + 3 * 24 * 60 * 60_000);
        const lease = await controlPlane.claim({ jobId: created.jobId, runnerId: "deadline-test", adapter: "test" });
        expect(lease).not.toBeNull();
        await controlPlane.start(lease!);
        await controlPlane.waitForExternal(lease!, { operationKey: `deadline:${reason}`, reason, resumeAfter: eligible.toISOString() });
        for (const minutes of [11, 121]) {
          const now = new Date(startedAt + minutes * 60_000);
          vi.setSystemTime(now);
          const reconciled = await runJobReconciler({ now });
          expect(reconciled.decisions).toContainEqual({ jobId: created.jobId, action: "wait", reasonCode: `${reason === "budget" ? "budget" : "provider_capacity"}_not_yet_eligible` });
          const [waiting] = await sql`SELECT status, "leaseOwnerToken" IS NULL AS released, "leaseExpiresAt", "retryPolicyJson" FROM worker_jobs WHERE id = ${created.jobId}`;
          expect(waiting).toMatchObject({ status: "waiting_external", released: true, leaseExpiresAt: null, retryPolicyJson: { deadlineMs: sevenDays } });
        }
        vi.setSystemTime(eligible);
        const resumed = await runJobReconciler({ now: eligible });
        expect(resumed.decisions).toContainEqual({ jobId: created.jobId, action: "resume", reasonCode: `${reason === "budget" ? "budget" : "provider_capacity"}_retry_due` });
        const nextLease = await controlPlane.claim({ jobId: created.jobId, runnerId: "deadline-restart", adapter: "test" });
        expect(nextLease!.fencingVersion).toBeGreaterThan(lease!.fencingVersion);
        await expect(controlPlane.start(lease!)).rejects.toBeDefined();
        await controlPlane.start(nextLease!);
        // Process loss after restart remains recoverable within the absolute bound.
        const lostAt = new Date(Date.parse(nextLease!.expiresAt) + 1);
        vi.setSystemTime(lostAt);
        expect(await controlPlane.recoverExpiredLease(created.jobId, lostAt)).toBe("recovered");
        const [retry] = await sql`SELECT status, attempt, "nextRetryAt" FROM worker_jobs WHERE id = ${created.jobId}`;
        expect(retry.status).toBe("retry_scheduled");
        vi.setSystemTime(new Date(retry.nextRetryAt));
        await runJobReconciler({ now: new Date(retry.nextRetryAt) });
        const recoveredLease = await controlPlane.claim({ jobId: created.jobId, runnerId: "deadline-recovered", adapter: "test" });
        await controlPlane.start(recoveredLease!);
        await controlPlane.waitForExternal(recoveredLease!, { operationKey: `deadline:${reason}:past-bound`, reason, resumeAfter: new Date(startedAt + sevenDays + 24 * 60 * 60_000).toISOString() });
        vi.setSystemTime(new Date(startedAt + sevenDays - 1));
        await runJobReconciler({ now: new Date() });
        expect((await sql`SELECT status FROM worker_jobs WHERE id = ${created.jobId}`)[0].status).toBe("waiting_external");
        vi.setSystemTime(new Date(startedAt + sevenDays));
        await runJobReconciler({ now: new Date() });
        const [expired] = await sql`SELECT status, "statusReason", "inputJson", "retryPolicyJson", "leaseOwnerToken" IS NULL AS released FROM worker_jobs WHERE id = ${created.jobId}`;
        expect(expired).toMatchObject({ status: "expired", statusReason: "job_deadline", released: true, inputJson: stored.inputJson, retryPolicyJson: stored.retryPolicyJson });
        expect(await controlPlane.resumeExternal(created.jobId, "test", "test", undefined, "cannot-reopen-expired")).toBe(false);
        expect(await controlPlane.claim({ jobId: created.jobId, runnerId: "test", adapter: "test" })).toBeNull();
        const [effects] = await sql`SELECT count(*)::int AS count FROM worker_job_provider_reservations WHERE "workerJobId" = ${created.jobId}`;
        expect(effects.count).toBe(0);
        const [expiryEvents] = await sql`SELECT count(*)::int AS count FROM worker_job_events WHERE "workerJobId" = ${created.jobId} AND "eventType" = 'EXPIRED'`;
        expect(expiryEvents.count).toBe(1);
        process.stdout.write(`FAST_LANE_DEADLINE_PERSISTENCE ${JSON.stringify({ jobId: created.jobId, runId: created.runId, deadlineMs: stored.retryPolicyJson.deadlineMs, waitedMinutes: [11, 121], recoveredAfterDays: 3, terminalAtDays: 7, modelDispatches: 0 })}\n`);
      } finally { vi.useRealTimers(); }
    }, 60_000,
  );

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

  it("completes the golden authenticated default Developer Fast Lane process chain", async () => {
    const fs = await import("node:fs/promises");
    const repositoryRoot = process.cwd().replace(/\/apps\/web$/, "");
    const harness = await createGoldenFastLaneHarness(repositoryRoot);
    const workunitPath = "experiments/agents-sdk-codex-subscription/tests/fixtures/golden_default_path/golden_workunit_test.py";
    try {
      const created = await harness.createJob({
        idempotencyKey: `authenticated-fast-lane-golden-${randomUUID()}`, developerLogin: "developer",
        sourceRevision: harness.sourceRevision,
        task: "Verify that the pre-seeded golden workunit behavior satisfies its focused acceptance test.",
        allowedFiles: [workunitPath], writableFiles: [workunitPath],
        tests: { runner: "pytest", cwd: ".", paths: [workunitPath] },
        acceptanceCriteria: ["The allowlisted focused pytest passes on the pinned source revision."],
        budget: { implementationMaxTurns: 1, planMaxTurns: 1, reviewMaxTurns: 1 }, scopeTtlSeconds: 3600,
      });
      const result = await harness.execute(created.jobId, 1);
      expect(result).toMatchObject({ state: "succeeded", jobId: created.jobId });
      const state = JSON.parse(await fs.readFile(path.join(harness.evidenceRoot, created.runId, "run-state.json"), "utf8"));
      const contract = JSON.parse(await fs.readFile(path.join(harness.evidenceRoot, created.runId, "contract.json"), "utf8"));
      const authorizationReceipt = await fs.readFile(path.join(harness.evidenceRoot, created.runId, "authorization-receipt.json"));
      const [job] = await sql`SELECT status, "progressJson" FROM worker_jobs WHERE id = ${created.jobId}`;
      const reservations = await sql`SELECT "modelCallId", "reservationStatus", "requestedModel", "reasoningEffort", "threadId", "turnId", "usageReceiptJson", "modelSelectionJson" FROM worker_job_provider_reservations WHERE "workerJobId" = ${created.jobId} AND "reservationKind" = 'model_call' ORDER BY "createdAt"`;
      expect(job.status).toBe("succeeded");
      expect(state).toMatchObject({ runId: created.runId, workspaceId: contract.workspaceId, status: "VERIFIED_COMPLETE" });
      expect(contract.sourceRevision).toBe(harness.sourceRevision);
      expect(contract.canonicalJobBinding).toMatchObject({ jobId: created.jobId, runId: created.runId, tenantId: "tenant-golden-default", actorId: 22401 });
      expect(contract.originalAuthorizationReceiptSha256).toBe(createHash("sha256").update(authorizationReceipt).digest("hex"));
      expect(state.iterations?.[0]?.testReceipt?.exitCode).toBe(0);
      expect(state.reviews?.at(-1)?.complete).toBe(true);
      expect(state.verification?.complete).toBe(true);
      expect(reservations.length).toBeGreaterThanOrEqual(3);
      expect(reservations.every(row => row.reservationStatus === "released")).toBe(true);
      expect(reservations.every(row => row.requestedModel === "gpt-6-luna" && row.reasoningEffort === "medium")).toBe(true);
      expect(reservations.every(row => row.usageReceiptJson?.inputTokens === 19 && row.usageReceiptJson?.outputTokens === 7)).toBe(true);
      expect(reservations.every(row => row.modelSelectionJson?.requestedModel === "gpt-6-luna")).toBe(true);
      expect(new Set(reservations.map(row => row.modelCallId)).size).toBe(reservations.length);
      expect(Number(await fs.readFile(path.join(harness.stateRoot, "turn-dispatch-count"), "utf8"))).toBe(reservations.length);
      expect(JSON.stringify(job.progressJson)).not.toContain("leaseToken");
    } finally {
      await harness.close();
    }
  }, 240_000);

  it("resumes the same default Fast Lane WorkUnit after a three-day capacity wait and source advance", async () => {
    const [{ runJobReconciler }] = await Promise.all([import("../jobReconciler")]);
    const fs = await import("node:fs/promises");
    const repositoryRoot = process.cwd().replace(/\/apps\/web$/, "");
    const harness = await createGoldenFastLaneHarness(repositoryRoot);
    const workunitPath = "experiments/agents-sdk-codex-subscription/tests/fixtures/golden_default_path/golden_workunit_test.py";
    try {
      process.env.SPEC224_GOLDEN_429_ONCE = "1";
      process.env.SPEC224_GOLDEN_RETRY_AFTER_SECONDS = String(3 * 24 * 60 * 60);
      const created = await harness.createJob({
        idempotencyKey: `authenticated-fast-lane-golden-capacity-${randomUUID()}`, developerLogin: "developer",
        sourceRevision: harness.sourceRevision,
        task: "Verify the seeded behavior after scheduler-controlled provider recovery.",
        allowedFiles: [workunitPath], writableFiles: [workunitPath],
        tests: { runner: "pytest", cwd: ".", paths: [workunitPath] },
        acceptanceCriteria: ["The allowlisted focused pytest passes on the original pinned source revision."],
        budget: { maxAttempts: 3, implementationMaxTurns: 1, planMaxTurns: 1, reviewMaxTurns: 1 }, scopeTtlSeconds: 300,
      });
      const firstStarted = Date.now();
      const first = await harness.execute(created.jobId, 1);
      expect(first).toMatchObject({ state: "deferred", jobId: created.jobId });
      const provider429 = JSON.parse(await fs.readFile(path.join(harness.stateRoot, "provider-429-issued"), "utf8"));
      expect(Date.now() - provider429.atEpochSeconds * 1_000).toBeLessThan(5_000);
      expect(Date.now() - firstStarted).toBeLessThan(60_000);

      const runDirectory = path.join(harness.evidenceRoot, created.runId);
      const originalState = JSON.parse(await fs.readFile(path.join(runDirectory, "run-state.json"), "utf8"));
      const originalContract = JSON.parse(await fs.readFile(path.join(runDirectory, "contract.json"), "utf8"));
      const originalReceipt = await fs.readFile(path.join(runDirectory, "authorization-receipt.json"));
      const originalReceiptHash = createHash("sha256").update(originalReceipt).digest("hex");
      const [waitingJob] = await sql`SELECT status, "progressJson", attempt, "fencingVersion", "retryPolicyJson" FROM worker_jobs WHERE id = ${created.jobId}`;
      expect(waitingJob.retryPolicyJson).toMatchObject({ deadlineMs: 7 * 24 * 60 * 60_000, deadlineMode: "fixed" });
      const wait = waitingJob.progressJson.externalWait;
      expect(waitingJob.status).toBe("waiting_external");
      expect(wait).toMatchObject({ reason: "provider_capacity", metadata: { schemaVersion: "spec224.developer-model-wait.v1" } });
      expect(Date.parse(wait.resumeAfter)).toBeGreaterThanOrEqual(provider429.atEpochSeconds * 1_000 + 3 * 24 * 60 * 60 * 1_000 - 30_000);
      expect(originalState).toMatchObject({ runId: created.runId, status: "WAITING_CAPACITY", canonicalWaitPersisted: true });
      expect(originalState.modelReceipts).toHaveLength(0);
      const [unknown] = await sql`SELECT "modelCallId", "reservationStatus", "usageState", "dispatchState", "threadId", "turnId" FROM worker_job_provider_reservations WHERE "workerJobId" = ${created.jobId} AND "reservationKind" = 'model_call'`;
      expect(unknown).toMatchObject({ reservationStatus: "unknown", usageState: "unknown", dispatchState: "unknown", threadId: null, turnId: null });

      const due = new Date(Date.parse(wait.resumeAfter) + 1);
      await harness.setTime(due);
      const advancedMain = await harness.advanceOrigin();
      expect(advancedMain).not.toBe(harness.sourceRevision);
      expect(originalContract.scopeExpiresAt * 1_000).toBeLessThan(due.getTime());
      const early = await runJobReconciler({ now: new Date(Date.parse(wait.resumeAfter) - 1) });
      expect(early.decisions).toContainEqual({ jobId: created.jobId, action: "wait", reasonCode: "provider_capacity_not_yet_eligible" });
      const dueResult = await runJobReconciler({ now: due });
      expect(dueResult.decisions).toContainEqual({ jobId: created.jobId, action: "resume", reasonCode: "provider_capacity_retry_due" });
      const [queued] = await sql`SELECT status, attempt, "fencingVersion" FROM worker_jobs WHERE id = ${created.jobId}`;
      expect(queued.status).toBe("queued");

      let resumed: Awaited<ReturnType<typeof harness.execute>>;
      try {
        resumed = await harness.execute(created.jobId, queued.attempt);
      } catch (error) {
        const recovery = await fs.readFile(path.join(runDirectory, "recovery-receipt.json"), "utf8").then(value => JSON.parse(value), () => null);
        const runState = await fs.readFile(path.join(runDirectory, "run-state.json"), "utf8").then(value => JSON.parse(value), () => null);
        const logNames = await fs.readdir(path.join(runDirectory, "process-logs")).catch(() => [] as string[]);
        const processLogs = await Promise.all(logNames.map(async name => [name, await fs.readFile(path.join(runDirectory, "process-logs", name), "utf8").then(value => JSON.parse(value), () => null)]));
        console.error("GOLDEN_RESUME_FAILURE", JSON.stringify({ error: String(error), recovery, status: runState?.status, blocker: runState?.routingBlocker, processLogs }));
        throw error;
      }
      expect(resumed).toMatchObject({ state: "succeeded", jobId: created.jobId });
      const finalState = JSON.parse(await fs.readFile(path.join(runDirectory, "run-state.json"), "utf8"));
      const finalContract = JSON.parse(await fs.readFile(path.join(runDirectory, "contract.json"), "utf8"));
      const [completedJob] = await sql`SELECT status, attempt, "fencingVersion" FROM worker_jobs WHERE id = ${created.jobId}`;
      const reservations = await sql`SELECT "modelCallId", "reservationStatus", "usageState", "dispatchState", "requestedModel", "reasoningEffort", "threadId", "turnId", "usageReceiptJson" FROM worker_job_provider_reservations WHERE "workerJobId" = ${created.jobId} AND "reservationKind" = 'model_call' ORDER BY "createdAt"`;
      const continuationLines = (await fs.readFile(path.join(runDirectory, "continuation-receipts.jsonl"), "utf8")).trim().split("\n");
      const continuation = JSON.parse(continuationLines.at(-1)!);
      expect(completedJob).toMatchObject({ status: "succeeded", attempt: queued.attempt });
      expect(Number(completedJob.fencingVersion)).toBeGreaterThan(Number(waitingJob.fencingVersion));
      expect(finalState).toMatchObject({ runId: created.runId, workspaceId: originalState.workspaceId, status: "VERIFIED_COMPLETE" });
      expect(finalContract.sourceRevision).toBe(harness.sourceRevision);
      expect(finalContract.originalAuthorizationReceiptSha256).toBe(originalReceiptHash);
      expect(continuation).toMatchObject({ jobId: created.jobId, runId: created.runId, workspaceId: originalState.workspaceId, sourceRevision: harness.sourceRevision, originalAuthorizationReceiptSha256: originalReceiptHash, attemptId: expect.any(String) });
      expect(Number(continuation.fencingVersion)).toBe(Number(completedJob.fencingVersion));
      expect(reservations[0]).toMatchObject({ ...unknown, reservationStatus: "unknown", usageState: "unknown" });
      expect(reservations.slice(1).every(row => row.reservationStatus === "released" && row.usageState === "known")).toBe(true);
      expect(reservations.slice(1).every(row => row.requestedModel === "gpt-6-luna" && row.reasoningEffort === "medium")).toBe(true);
      expect(reservations.slice(1).every(row => row.usageReceiptJson?.inputTokens === 19)).toBe(true);
      expect(new Set(reservations.map(row => row.modelCallId)).size).toBe(reservations.length);
      expect(Number(await fs.readFile(path.join(harness.stateRoot, "turn-dispatch-count"), "utf8"))).toBe(reservations.length - 1);
      const workspaceHead = execFileSync("git", ["-C", finalContract.workspace, "rev-parse", "HEAD"], { encoding: "utf8" }).trim();
      expect(workspaceHead).toBe(harness.sourceRevision);
      expect(advancedMain).not.toBe(workspaceHead);
    } finally {
      await harness.close();
    }
  }, 240_000);

  it.each([
    "model.after_selection_persisted",
    "model.after_reservation_before_dispatch",
    "model.after_turn_created_before_receipt",
    "model.after_turn_identity_persisted",
    "model.after_receipt_persisted_before_settlement",
    "model.after_receipt",
  ])("recovers the default Fast Lane process chain through a new canonical Attempt after %s", async crashBoundary => {
    const fs = await import("node:fs/promises");
    const repositoryRoot = process.cwd().replace(/\/apps\/web$/, "");
    const harness = await createGoldenFastLaneHarness(repositoryRoot);
    const workunitPath = "experiments/agents-sdk-codex-subscription/tests/fixtures/golden_default_path/golden_workunit_test.py";
    try {
      const created = await harness.createJob({
        idempotencyKey: `authenticated-fast-lane-crash-${crashBoundary}-${randomUUID()}`, developerLogin: "developer",
        sourceRevision: harness.sourceRevision, task: `Recover the default WorkUnit at ${crashBoundary}.`,
        allowedFiles: [workunitPath], writableFiles: [workunitPath],
        tests: { runner: "pytest", cwd: ".", paths: [workunitPath] },
        acceptanceCriteria: ["The allowlisted focused pytest passes on the pinned source revision."],
        budget: { maxAttempts: 3, implementationMaxTurns: 1, planMaxTurns: 1, reviewMaxTurns: 1 }, scopeTtlSeconds: 3600,
      });
      harness.setCrashAt(crashBoundary, true);
      const runDirectory = path.join(harness.evidenceRoot, created.runId);
      let crash: unknown;
      try {
        await harness.execute(created.jobId, 1);
      } catch (error) {
        crash = error;
      }
      expect(String(crash)).toContain("SIMULATED_CANONICAL_RUNNER_PROCESS_LOSS");
      expect(String(crash)).toContain("DEVELOPER_FAST_LANE_PROCESS_FAILED:SIGKILL");
      const originalState = JSON.parse(await fs.readFile(path.join(runDirectory, "run-state.json"), "utf8"));
      const originalContract = JSON.parse(await fs.readFile(path.join(runDirectory, "contract.json"), "utf8"));
      const originalReceipt = await fs.readFile(path.join(runDirectory, "authorization-receipt.json"));
      const originalReceiptHash = createHash("sha256").update(originalReceipt).digest("hex");
      const [interruptedJob] = await sql`SELECT status, attempt, "fencingVersion", "leaseExpiresAt" FROM worker_jobs WHERE id = ${created.jobId}`;
      expect(interruptedJob).toMatchObject({ status: "running", attempt: 1 });
      expect(originalState.crashConsumed).toContain(crashBoundary);
      const firstPlannedCall = originalState.lifecycleEvents.find((event: any) => event.kind === "model.call.planned")?.payload?.callId;
      expect(firstPlannedCall).toBeTruthy();

      const { runJobReconciler } = await import("../jobReconciler");
      const due = new Date(new Date(interruptedJob.leaseExpiresAt).getTime() + 1);
      await harness.setTime(due);
      const reconciled = await runJobReconciler({ now: due });
      expect(reconciled.expiredRecovered).toBe(1);
      let [queued] = await sql`SELECT status, attempt, "fencingVersion", "nextRetryAt" FROM worker_jobs WHERE id = ${created.jobId}`;
      if (queued.status === "retry_scheduled") {
        const retryAt = new Date(queued.nextRetryAt);
        await harness.setTime(new Date(retryAt.getTime() + 1));
        await runJobReconciler({ now: new Date(retryAt.getTime() + 1) });
        [queued] = await sql`SELECT status, attempt, "fencingVersion", "nextRetryAt" FROM worker_jobs WHERE id = ${created.jobId}`;
      }
      expect(queued).toMatchObject({ status: "queued", attempt: 2 });
      harness.setCrashAt();
      const result = await harness.execute(created.jobId, queued.attempt);
      expect(result).toMatchObject({ state: "succeeded", jobId: created.jobId });
      const [job] = await sql`SELECT status, attempt, "fencingVersion" FROM worker_jobs WHERE id = ${created.jobId}`;
      const state = JSON.parse(await fs.readFile(path.join(runDirectory, "run-state.json"), "utf8"));
      const recovery = JSON.parse(await fs.readFile(path.join(runDirectory, "recovery-receipt.json"), "utf8"));
      const reservations = await sql`SELECT "modelCallId", "reservationStatus", "usageState", "dispatchState", "reservedTokens", "requestedModel", "reasoningEffort", "threadId", "turnId" FROM worker_job_provider_reservations WHERE "workerJobId" = ${created.jobId} AND "reservationKind" = 'model_call' ORDER BY "createdAt"`;
      const events = await fs.readFile(path.join(runDirectory, "events.jsonl"), "utf8");
      const finalContract = JSON.parse(await fs.readFile(path.join(runDirectory, "contract.json"), "utf8"));
      expect(job).toMatchObject({ status: "succeeded", attempt: 2 });
      expect(Number(job.fencingVersion)).toBeGreaterThan(Number(interruptedJob.fencingVersion));
      expect(state.runId).toBe(created.runId);
      expect(state.workspaceId).toBe(originalState.workspaceId);
      expect(state.crashConsumed).toContain(crashBoundary);
      expect(recovery.supervisorResult).toBe("COMPLETED");
      expect(finalContract.sourceRevision).toBe(harness.sourceRevision);
      expect(finalContract.originalAuthorizationReceiptSha256).toBe(originalReceiptHash);
      expect(originalContract.sourceRevision).toBe(harness.sourceRevision);
      expect(reservations[0]?.modelCallId).toBe(firstPlannedCall);
      expect(Number(await fs.readFile(path.join(harness.stateRoot, "turn-dispatch-count"), "utf8"))).toBe(reservations.length);
      expect(new Set(reservations.map(row => row.modelCallId)).size).toBe(reservations.length);
      expect(reservations.every(row => row.requestedModel === "gpt-6-luna" && row.reasoningEffort === "medium")).toBe(true);
      expect(reservations.every(row => row.usageState === "known" || row.usageState === "unknown" || row.usageState === "reserved")).toBe(true);
      expect(reservations.filter(row => row.usageState !== "known").every(row => Number(row.reservedTokens) > 0)).toBe(true);
      if (crashBoundary === "model.after_turn_created_before_receipt" || crashBoundary === "model.after_turn_identity_persisted") {
        expect(reservations[0]).toMatchObject({ reservationStatus: "released", usageState: "known", threadId: expect.any(String), turnId: expect.any(String) });
      }
      expect(events).toContain(`"trigger": "${crashBoundary}"`);
      expect(JSON.stringify(job)).not.toContain("leaseToken");
    } finally {
      await harness.close();
    }
  }, 240_000);

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
      expect(outcome?.error, JSON.stringify(outcome)).toBeTruthy();
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
