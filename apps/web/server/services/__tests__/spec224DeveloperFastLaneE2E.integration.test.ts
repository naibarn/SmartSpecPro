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
});
