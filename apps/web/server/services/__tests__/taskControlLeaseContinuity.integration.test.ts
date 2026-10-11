import { afterEach, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { once } from "node:events";
import postgres from "postgres";
import { closeDb } from "../../db";
import { createSpec277DisposablePostgres } from "./support/spec277DisposablePostgres";
import { installSpec277AutoTeamRuntimeSchema } from "./support/spec277AutoTeamRuntimeSchema";

describe("Task Control worker lease continuity", () => {
  afterEach(async () => closeDb());

  it("keeps the persisted Task Control job identity through interruption, retry, provider wait, and final verify", async () => {
    if (process.env.DATABASE_URL)
      throw new Error("SPEC277_REFUSES_INHERITED_DATABASE_URL");

    const fixture = await createSpec277DisposablePostgres();
    const client = postgres(fixture.databaseUrl, {
      max: 3,
      connect_timeout: 3,
    });
    const priorDatabaseUrl = process.env.DATABASE_URL;
    const priorPg = {
      PGHOST: process.env.PGHOST,
      PGPORT: process.env.PGPORT,
      PGUSER: process.env.PGUSER,
      PGPASSWORD: process.env.PGPASSWORD,
    };
    process.env.DATABASE_URL = fixture.databaseUrl;
    delete process.env.PGHOST;
    delete process.env.PGPORT;
    delete process.env.PGUSER;
    delete process.env.PGPASSWORD;

    const tenantId = "tenant-r7-task-control";
    const userId = 2701;
    const jobId = randomUUID();
    const workflowRunId = randomUUID();
    const workers = new Set<ReturnType<typeof spawn>>();
    const childEnv = {
      ...process.env,
      DATABASE_URL: fixture.databaseUrl,
      R7_TASK_CONTROL_INPUT: "",
    };
    delete childEnv.PGHOST;
    delete childEnv.PGPORT;
    delete childEnv.PGUSER;
    delete childEnv.PGPASSWORD;

    const spawnWorker = (role: string) => {
      const child = spawn(
        process.execPath,
        ["--import", "tsx", "scripts/task-control-continuity-child.ts"],
        {
          cwd: process.cwd(),
          env: {
            ...childEnv,
            R7_TASK_CONTROL_INPUT: JSON.stringify({ jobId, role }),
          },
          stdio: ["pipe", "pipe", "pipe"],
        }
      );
      workers.add(child);
      let stdout = "";
      let stderr = "";
      child.stdout.on("data", chunk => {
        stdout += chunk.toString();
      });
      child.stderr.on("data", chunk => {
        stderr += chunk.toString();
      });
      return {
        child,
        get stdout() {
          return stdout;
        },
        get stderr() {
          return stderr;
        },
      };
    };
    const waitForMarker = async (
      worker: ReturnType<typeof spawnWorker>,
      marker: string
    ) => {
      const deadline = Date.now() + 15_000;
      while (!worker.stdout.includes(marker) && Date.now() < deadline) {
        if (worker.child.exitCode !== null)
          throw new Error(`R7_TASK_CONTROL_CHILD_EXITED:${worker.stderr}`);
        await new Promise(resolve => setTimeout(resolve, 10));
      }
      if (!worker.stdout.includes(marker))
        throw new Error(
          `R7_TASK_CONTROL_CHILD_MARKER_TIMEOUT:${marker}:${worker.stderr}`
        );
    };
    const runWorker = async (role: string, marker: string) => {
      const worker = spawnWorker(role);
      await waitForMarker(worker, marker);
      const [exitCode] = (await once(worker.child, "close")) as [
        number | null,
        NodeJS.Signals | null,
      ];
      if (exitCode !== 0)
        throw new Error(
          `R7_TASK_CONTROL_CHILD_FAILED:${role}:${worker.stderr}`
        );
      return worker.stdout;
    };

    try {
      await fixture.assertOwned();
      await installSpec277AutoTeamRuntimeSchema(client);
      await client.unsafe(
        `INSERT INTO worker_jobs (
          id, "tenantId", "requestedByUserId", "runtimeType", "workflowRunId", "jobType", status,
          "executionClass", "contractVersion", "inputJson", "instructionsJson", "retryPolicyJson",
          "timeoutPolicyJson", attempt, "maxAttempts", "fencingVersion"
        ) VALUES (
          $1, $2, $3, 'node_job_worker', $4, 'r7.task-control.continuity', 'queued',
          'long', 'r7-task-control-v1', $5::jsonb, '{}',
          '{"deadlineMode":"fixed","deadlineMs":1200000,"baseDelayMs":1,"maxDelayMs":1}'::jsonb,
          '{"softTimeoutMs":0,"hardTimeoutMs":1200000}'::jsonb, 1, 4, 0
        )`,
        [
          jobId,
          tenantId,
          userId,
          workflowRunId,
          JSON.stringify({ logicalTaskId: `task-${jobId}` }),
        ]
      );

      const interrupted = spawnWorker("interrupted-attempt");
      await waitForMarker(interrupted, "R7_TASK_CONTROL_INTERRUPTED_READY");
      interrupted.child.kill("SIGKILL");
      const [, interruptedSignal] = (await once(
        interrupted.child,
        "close"
      )) as [number | null, NodeJS.Signals | null];
      expect(interruptedSignal).toBe("SIGKILL");

      const [attempt] = await client.unsafe(
        `SELECT id FROM worker_job_attempts WHERE "workerJobId" = $1 AND attempt = 1`,
        [jobId]
      );
      await client.unsafe(
        `UPDATE worker_jobs SET "leaseExpiresAt" = clock_timestamp() - interval '1 second' WHERE id = $1`,
        [jobId]
      );
      await client.unsafe(
        `UPDATE worker_job_attempts SET "leaseExpiresAt" = clock_timestamp() - interval '1 second' WHERE id = $1`,
        [attempt.id]
      );

      const { createJobControlPlane } = await import("../jobControlPlane");
      const controlPlane = createJobControlPlane();
      expect(await controlPlane.recoverExpiredLease(jobId, new Date())).toBe(
        "recovered"
      );
      expect(await controlPlane.makeRetryDue(jobId)).toBe(true);

      const { getUserWorkerJobDetail, listUserWorkerTaskGroups } =
        await import("../workerJobMonitorService");
      const auth = { tenantId, userId };
      const readPersistedJob = async () => {
        const [row] = await client.unsafe(
          `SELECT id, "tenantId", "workerId", "runtimeType", "workflowRunId", "requestedByUserId",
             "jobType", status, "statusReason", "resourceProfile", "outputJson", "instructionsJson",
             "failureReason", "errorCode", "errorMessage", "operatorReviewRequired", "operatorReviewReason",
             "inputJson", "progressJson", "createdAt", "startedAt", "finishedAt"
           FROM worker_jobs WHERE id = $1 AND "tenantId" = $2 AND "requestedByUserId" = $3`,
          [jobId, tenantId, userId]
        );
        return row ? { ...row, worker: null } : null;
      };
      const makePersistedTaskControlRepo = () => ({
        getUserJob: async () => readPersistedJob(),
        listUserJobs: async (input: {
          auth: typeof auth;
          statuses?: string[];
        }) => {
          const row = await readPersistedJob();
          if (
            !row ||
            row.tenantId !== input.auth.tenantId ||
            row.requestedByUserId !== input.auth.userId
          )
            return [];
          if (input.statuses && !input.statuses.includes(row.status)) return [];
          return [row];
        },
        listEvents: async (jobIds: string[]) =>
          await client.unsafe(
            `SELECT id, "workerJobId", "eventSequence", "eventType", "payloadJson", "createdAt"
             FROM worker_job_events WHERE "workerJobId" = ANY($1::text[])`,
            [jobIds]
          ),
        listArtifacts: async () => [],
      });
      const readTaskControl = async () =>
        getUserWorkerJobDetail(
          { auth, jobId },
          { repo: makePersistedTaskControlRepo() as never }
        );
      const readTaskGroup = async () =>
        listUserWorkerTaskGroups(
          { auth, limit: 10 },
          { repo: makePersistedTaskControlRepo() as never }
        );

      const afterRecovery = await readTaskControl();
      expect(afterRecovery.id).toBe(jobId);
      expect(afterRecovery.status).toBe("queued");
      expect(afterRecovery.events.map(event => event.eventType)).toContain(
        "RECOVERED"
      );
      const recoveredGroup = await readTaskGroup();
      expect(recoveredGroup.groups[0]?.groupId).toBe(
        `workflow:${workflowRunId}`
      );
      expect(recoveredGroup.groups[0]?.jobs.map(task => task.id)).toEqual([
        jobId,
      ]);

      await runWorker(
        "provider-wait",
        "R7_TASK_CONTROL_PROVIDER_WAIT_PERSISTED"
      );
      const duringProviderWait = await readTaskControl();
      expect(duringProviderWait.id).toBe(jobId);
      expect(duringProviderWait.status).toBe("waiting_external");
      expect(duringProviderWait.progressPhase).toBe("provider_submission");
      expect(duringProviderWait.events.map(event => event.eventType)).toContain(
        "WAITING_EXTERNAL"
      );
      const waitingGroup = await readTaskGroup();
      expect(waitingGroup.groups[0]?.groupId).toBe(`workflow:${workflowRunId}`);
      expect(waitingGroup.groups[0]?.jobs.map(task => task.id)).toEqual([
        jobId,
      ]);

      expect(
        await controlPlane.resumeExternal(
          jobId,
          "r7-task-control-resumer",
          "postgres-pull",
          { logicalTaskId: `task-${jobId}`, finalVerifyRequested: true },
          "synthetic-provider-completion",
          true
        )
      ).toBe(true);
      await runWorker("final-verify", "R7_TASK_CONTROL_FINAL_VERIFY_COMPLETED");

      const completed = await readTaskControl();
      expect(completed.id).toBe(jobId);
      expect(completed.status).toBe("succeeded");
      expect(completed.progressPhase).toBe("final_verify");
      expect(completed.events.map(event => event.eventType)).toEqual(
        expect.arrayContaining([
          "RECOVERED",
          "WAITING_EXTERNAL",
          "DISPATCH_REQUESTED",
          "COMPLETED",
        ])
      );
      expect(completed.outputRefs).toEqual([]);
      const [persisted] = await client.unsafe(
        `SELECT "outputJson", attempt, "fencingVersion" FROM worker_jobs WHERE id = $1`,
        [jobId]
      );
      expect(persisted.attempt).toBe(3);
      expect(persisted.fencingVersion).toBe(3);
      expect(persisted.outputJson).toMatchObject({
        finalVerification: { status: "passed" },
      });
    } finally {
      for (const child of workers) {
        if (child.exitCode === null && child.signalCode === null) {
          child.kill("SIGKILL");
          await once(child, "close");
        }
      }
      await closeDb();
      await client.end({ timeout: 2 });
      await fixture.close();
      if (priorDatabaseUrl === undefined) delete process.env.DATABASE_URL;
      else process.env.DATABASE_URL = priorDatabaseUrl;
      for (const [key, value] of Object.entries(priorPg)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    }
  }, 90_000);
});
