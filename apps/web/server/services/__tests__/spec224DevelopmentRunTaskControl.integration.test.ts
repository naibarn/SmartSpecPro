import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { promisify } from "node:util";

import postgres from "postgres";
import { afterEach, describe, expect, it } from "vitest";

import { closeDb } from "../../db";
import { createSpec277DisposablePostgres } from "./support/spec277DisposablePostgres";
import { installSpec277AutoTeamRuntimeSchema } from "./support/spec277AutoTeamRuntimeSchema";

const execFileAsync = promisify(execFile);

describe("Spec 224 DevelopmentRun Task Control projection — PostgreSQL", () => {
  afterEach(async () => closeDb());

  it("keeps one canonical run/job and reconstructs its durable stage after process restart", async () => {
    if (process.env.DATABASE_URL)
      throw new Error("SPEC224_REFUSES_INHERITED_DATABASE_URL");

    const fixture = await createSpec277DisposablePostgres();
    const client = postgres(fixture.databaseUrl, { max: 3, connect_timeout: 3 });
    const previousDatabaseUrl = process.env.DATABASE_URL;
    const priorPg = {
      PGHOST: process.env.PGHOST,
      PGPORT: process.env.PGPORT,
      PGUSER: process.env.PGUSER,
      PGPASSWORD: process.env.PGPASSWORD,
    };

    try {
      await fixture.assertOwned();
      await client.unsafe("CREATE EXTENSION IF NOT EXISTS pgcrypto");
      await installSpec277AutoTeamRuntimeSchema(client);
      await client.unsafe("CREATE TABLE users (id integer PRIMARY KEY)");
      await client.unsafe("INSERT INTO users (id) VALUES (22401)");
      await client.unsafe(`CREATE TABLE tenant_data_transfer_plans (
        "operationId" varchar(36), "tenantId" varchar(36), "sourceUserId" integer
      )`);
      await client.unsafe(`CREATE TABLE tenant_identity_actions (
        id varchar(36) PRIMARY KEY, "userId" integer, "sourceTenantId" varchar(36), phase varchar(40)
      )`);
      process.env.DATABASE_URL = fixture.databaseUrl;
      delete process.env.PGHOST;
      delete process.env.PGPORT;
      delete process.env.PGUSER;
      delete process.env.PGPASSWORD;

      const [
        { createJobControlPlane },
        { createDevelopmentRunService, createPersistedDevelopmentRun, defaultDevelopmentRunPersistenceAdapter },
        { buildDevelopmentRun },
        { createDevelopmentWorkUnit },
        { defaultJobExecutorRegistry },
        { getUserWorkerJobDetail },
      ] = await Promise.all([
        import("../jobControlPlane"),
        import("../spec224DevelopmentRunPersistence"),
        import("../spec224DevelopmentRunContracts"),
        import("../developmentLifecycleContracts"),
        import("../jobExecutorRegistry"),
        import("../workerJobMonitorService"),
      ]);
      const controlPlane = createJobControlPlane();
      const runId = randomUUID();
      const tenantId = randomUUID();
      const actorId = 22401;
      const run = buildDevelopmentRun({
        runId,
        tenantId,
        actorId,
        goal: "Expose persisted DevelopmentRun stage in Task Control",
        repositoryRef: "repo:r9-task-control-test",
        baseRevision: "git:r9-task-control-base",
        contextPackHash: "a".repeat(64),
        workspaceId: `workspace-${runId}`,
        workUnit: createDevelopmentWorkUnit({
          workId: `work-${runId}`,
          projectId: "project:r9-test",
          repositoryId: "repo:r9-task-control-test",
          source: { type: "feature", ref: "spec:224" },
          objective: "Project durable progress to Task Control",
          ownership: {
            actor: `user:${actorId}`,
            session: "synthetic-r9-session",
            harness: "deterministic-test-executor",
          },
          canonicalTarget: { kind: "git", locator: "repo:r9-task-control-test" },
          baseRevision: "git:r9-task-control-base",
        }),
      });
      const createInput = {
        run,
        provider: "codex" as const,
        runtime: "local_runner" as const,
        planId: `plan-${runId}`,
        planRevision: 1,
        skillIds: [],
        requestedCapabilities: ["workspace.edit"],
        authorizationScope: "spec224.development.run",
        persistence: defaultDevelopmentRunPersistenceAdapter,
        controlPlane,
        executorRegistry: defaultJobExecutorRegistry,
      };
      const first = await createPersistedDevelopmentRun(createInput);
      const duplicate = await createPersistedDevelopmentRun(createInput);
      expect(first.jobRef).toMatchObject({ created: true });
      expect(duplicate.jobRef).toMatchObject({
        jobId: first.jobRef.jobId,
        created: false,
      });

      const service = createDevelopmentRunService(
        defaultDevelopmentRunPersistenceAdapter
      );
      const moved = await service.command({
        runId,
        tenantId,
        actorId,
        expectedRevision: 0,
        expectedFencingVersion: first.run.fencingVersion,
        idempotencyKey: `r9-task-control-stage:${runId}`,
        command: {
          kind: "transition",
          nextState: "PLANNING",
          eventType: "PHASE_COMPLETED",
          payload: { workerJobId: first.jobRef.jobId, source: "synthetic-test" },
        },
      });
      expect(moved.run.workerJobId).toBe(first.jobRef.jobId);

      const childScript = `
        import postgres from "postgres";
        const sql = postgres(process.env.DATABASE_URL, { max: 1 });
        const [row] = await sql.unsafe('SELECT "progressJson" FROM worker_jobs WHERE id = $1', [process.env.TEST_JOB_ID]);
        process.stdout.write(JSON.stringify(row?.progressJson?.spec224 ?? null));
        await sql.end();
      `;
      const child = await execFileAsync(
        process.execPath,
        ["--import", "tsx", "--input-type=module", "--eval", childScript],
        {
          cwd: process.cwd(),
          env: { ...process.env, DATABASE_URL: fixture.databaseUrl, TEST_JOB_ID: first.jobRef.jobId },
          timeout: 15_000,
          maxBuffer: 16 * 1024,
        }
      );
      expect(JSON.parse(child.stdout)).toMatchObject({
        runId,
        workerJobId: first.jobRef.jobId,
        state: "PLANNING",
      });

      const [job] = await client.unsafe(
        `SELECT id, "tenantId", "requestedByUserId", "runtimeType", "workflowRunId",
          "jobType", status, "statusReason", "resourceProfile", "outputJson",
          "failureReason", "errorCode", "errorMessage", "operatorReviewRequired",
          "operatorReviewReason", "progressJson", "createdAt", "startedAt", "finishedAt"
         FROM worker_jobs WHERE id = $1`,
        [first.jobRef.jobId]
      );
      const taskControl = await getUserWorkerJobDetail(
        { auth: { tenantId, userId: actorId }, jobId: first.jobRef.jobId },
        {
          repo: {
            getUserJob: async () => ({ ...job, workerId: null, worker: null }),
            listUserJobs: async () => [],
            listEvents: async jobIds => await client.unsafe(
              `SELECT id, "workerJobId", "eventSequence", "eventType", "payloadJson", "createdAt"
               FROM worker_job_events WHERE "workerJobId" = ANY($1::text[])`,
              [jobIds]
            ),
            listArtifacts: async () => [],
          },
        }
      );
      expect(taskControl).toMatchObject({
        id: first.jobRef.jobId,
        status: "queued",
        progressPhase: "PLANNING",
        progressPercent: null,
      });
      const persisted = await service.get({ runId, tenantId, actorId });
      expect(persisted?.run).toMatchObject({
        runId,
        state: "PLANNING",
        workerJobId: first.jobRef.jobId,
      });
    } finally {
      await closeDb();
      if (previousDatabaseUrl === undefined) delete process.env.DATABASE_URL;
      else process.env.DATABASE_URL = previousDatabaseUrl;
      for (const [key, value] of Object.entries(priorPg)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
      await client.end({ timeout: 2 });
      await fixture.close();
    }
  }, 60_000);
});
