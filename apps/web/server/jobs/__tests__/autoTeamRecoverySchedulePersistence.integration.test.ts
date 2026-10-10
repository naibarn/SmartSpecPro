import { afterEach, describe, expect, it } from "vitest";
import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";
import postgres from "postgres";
import { closeDb } from "../../db";
import {
  installSpec277AutoTeamRuntimeSchema,
} from "../../services/__tests__/support/spec277AutoTeamRuntimeSchema";
import {
  createSpec277DisposablePostgres,
} from "../../services/__tests__/support/spec277DisposablePostgres";

const exec = promisify(execFile);

describe("AutoTeam recovery scheduler persistence", () => {
  afterEach(async () => {
    await closeDb();
  });

  it("persists one canonical scan job and coalesces a repeated schedule occurrence", async () => {
    if (process.env.DATABASE_URL) {
      throw new Error("SPEC277_REFUSES_INHERITED_DATABASE_URL");
    }
    const fixture = await createSpec277DisposablePostgres();
    const client = postgres(fixture.databaseUrl, { max: 2, connect_timeout: 3 });
    let interruptedWorker: ReturnType<typeof spawn> | null = null;
    let interruptedExit: Promise<[number | null, NodeJS.Signals | null]> | null = null;
    try {
      await fixture.assertOwned();
      await installSpec277AutoTeamRuntimeSchema(client);
      const childEnv = {
        ...process.env,
        DATABASE_URL: fixture.databaseUrl,
        FEATURE_186_SYSTEM_TENANT_ID: "tenant-r6-synthetic",
        JWT_SECRET: "r6-synthetic-fixture-secret-32-bytes",
      };
      delete childEnv.PGHOST;
      delete childEnv.PGPORT;
      delete childEnv.PGUSER;
      delete childEnv.PGPASSWORD;

      await client.unsafe(`
        INSERT INTO team_rooms (
          id, "tenantId", "teamId", "orchestratorUserId", "roomType", title
        ) VALUES (
          'room-r6-capacity', 'tenant-r6-synthetic', 'team-r6-synthetic', 1,
          'auto_team', 'Synthetic resource wait'
        ), (
          'room-r6-future-approval', 'tenant-r6-synthetic', 'team-r6-synthetic', 1,
          'auto_team', 'Synthetic future approval'
        ), (
          'room-r6-terminal', 'tenant-r6-synthetic', 'team-r6-synthetic', 1,
          'auto_team', 'Synthetic terminal run'
        )
      `);
      await client.unsafe(`
        INSERT INTO team_runs (
          id, "roomId", "teamId", "initiatedByUserId", "executionMode", status,
          "stopReason", "runtimeStateJson", "startedAt"
        ) VALUES (
          'run-r6-capacity', 'room-r6-capacity', 'team-r6-synthetic', 1,
          'auto_team', 'paused', 'awaiting_async_media_pipeline',
          '{"autoTeamMediaPipeline":{"status":"capacity_wait"}}'::jsonb,
          now() - interval '1 hour'
        ), (
          'run-r6-future-approval', 'room-r6-future-approval', 'team-r6-synthetic', 1,
          'auto_team', 'paused', 'awaiting_human_choice',
          jsonb_build_object('choiceDeadlineAt', (now() + interval '1 hour')::text),
          now() - interval '1 hour'
        ), (
          'run-r6-terminal', 'room-r6-terminal', 'team-r6-synthetic', 1,
          'auto_team', 'completed', 'completed', '{}'::jsonb,
          now() - interval '1 hour'
        )
      `);

      const waitForOccurrence = async () => {
        const deadline = Date.now() + 5_000;
        while (Date.now() < deadline) {
          const [row] = await client.unsafe(`
            SELECT occurrence."workerJobId" AS job_id,
                   job."jobType" AS job_type,
                   job."status" AS job_status,
                   outbox."workerJobId" AS outbox_job_id,
                   COUNT(DISTINCT event."id")::int AS event_count
            FROM worker_job_schedule_occurrences occurrence
            JOIN worker_jobs job ON job."id" = occurrence."workerJobId"
            JOIN worker_job_outbox outbox ON outbox."workerJobId" = job."id"
            JOIN worker_job_events event ON event."workerJobId" = job."id"
            WHERE occurrence."tenantId" = 'tenant-r6-synthetic'
              AND occurrence."scheduleId" = 'auto-team-recovery-scan'
            GROUP BY occurrence."workerJobId", job."jobType", job."status", outbox."workerJobId"
          `);
          if (row) return row;
          await new Promise(resolve => setTimeout(resolve, 25));
        }
        throw new Error("SPEC277_SCHEDULE_OCCURRENCE_TIMEOUT");
      };

      // Independent scheduler processes race to persist the same occurrence;
      // PostgreSQL and canonical idempotency must converge them on one job.
      await Promise.all([1, 2].map(() => exec(
        process.execPath,
        ["--import", "tsx", "scripts/auto-team-recovery-scheduler-child.ts"],
        { cwd: process.cwd(), env: childEnv, timeout: 10_000, maxBuffer: 32 * 1024 },
      )));
      const first = await waitForOccurrence();
      const second = await waitForOccurrence();
      const [counts] = await client.unsafe(`
        SELECT COUNT(*)::int AS occurrences,
               COUNT(DISTINCT job."id")::int AS jobs,
               COUNT(DISTINCT outbox."id")::int AS outbox_rows
        FROM worker_job_schedule_occurrences occurrence
        JOIN worker_jobs job ON job."id" = occurrence."workerJobId"
        JOIN worker_job_outbox outbox ON outbox."workerJobId" = job."id"
        WHERE occurrence."tenantId" = 'tenant-r6-synthetic'
          AND occurrence."scheduleId" = 'auto-team-recovery-scan'
      `);

      expect(first.job_type).toBe("auto-team.recovery.scan");
      expect(first.job_status).toBe("queued");
      expect(first.outbox_job_id).toBe(first.job_id);
      expect(Number(first.event_count)).toBeGreaterThanOrEqual(3);
      expect(second.job_id).toBe(first.job_id);
      expect(counts).toMatchObject({ occurrences: 1, jobs: 1, outbox_rows: 1 });

      const childScript = "scripts/auto-team-recovery-scheduler-child.ts";
      childEnv.FEATURE_186_LEASE_SHORT_MS = "10000";
      const runChild = async (mode: string) => {
        try {
          await exec(process.execPath, ["--import", "tsx", childScript, mode], {
            cwd: process.cwd(), env: childEnv, timeout: 35_000, maxBuffer: 64 * 1024,
          });
        } catch (error) {
          const childError = error as { stderr?: string; stdout?: string; message?: string };
          throw new Error(`SPEC277_${mode.toUpperCase()}_CHILD_FAILED: ${childError.stderr ?? childError.stdout ?? childError.message}`);
        }
      };
      interruptedWorker = spawn(process.execPath, ["--import", "tsx", childScript, "interrupt"], {
        cwd: process.cwd(), env: childEnv, stdio: ["ignore", "ignore", "pipe"],
      });
      interruptedExit = new Promise(resolveExit => {
        interruptedWorker!.once("exit", (code, signal) => resolveExit([code, signal]));
      });
      let interruptedStderr = "";
      const checkpointPersisted = await new Promise<boolean>((resolveCheckpoint, rejectCheckpoint) => {
        const timeout = setTimeout(() => rejectCheckpoint(new Error("SPEC277_SIGKILL_CHECKPOINT_TIMEOUT")), 10_000);
        interruptedWorker.once("error", error => {
          clearTimeout(timeout);
          rejectCheckpoint(error);
        });
        interruptedWorker.once("exit", (code, signal) => {
          if (!interruptedStderr.includes("SPEC277_SCAN_CHECKPOINT_PERSISTED")) {
            clearTimeout(timeout);
            rejectCheckpoint(new Error(`SPEC277_SIGKILL_WORKER_EXITED_EARLY:${code}:${signal}:${interruptedStderr}`));
          }
        });
        interruptedWorker.stderr.on("data", chunk => {
          interruptedStderr += chunk.toString();
          if (interruptedStderr.includes("SPEC277_SCAN_CHECKPOINT_PERSISTED")) {
            clearTimeout(timeout);
            resolveCheckpoint(true);
          }
        });
      });
      expect(checkpointPersisted).toBe(true);
      expect(interruptedWorker.kill("SIGKILL")).toBe(true);
      const [, killSignal] = await interruptedExit;
      expect(killSignal).toBe("SIGKILL");
      const [persistedCheckpoint] = await client.unsafe(`
        SELECT status, attempt, "progressJson" ->> 'stage' AS stage,
               "leaseExpiresAt" AS lease_expires_at
        FROM worker_jobs WHERE id = $1
      `, [first.job_id]);
      expect(persistedCheckpoint).toMatchObject({ status: "running", attempt: 1, stage: "scan_checkpoint" });
      const leaseExpiredAt = new Date(persistedCheckpoint.lease_expires_at).getTime();
      while (Date.now() <= leaseExpiredAt) await new Promise(resolve => setTimeout(resolve, 50));
      expect(Date.now()).toBeGreaterThan(leaseExpiredAt);
      await runChild("recover");
      await runChild("scan");
      const [queuedEvaluation] = await client.unsafe(`
        SELECT id, "inputJson" ->> 'runId' AS run_id
        FROM worker_jobs
        WHERE "jobType" = 'auto-team.recovery.evaluate' AND status = 'queued'
      `);
      expect(queuedEvaluation?.run_id).toBe("run-r6-capacity");
      const evaluations = await client.unsafe(`
        SELECT "inputJson" ->> 'runId' AS run_id
        FROM worker_jobs WHERE "jobType" = 'auto-team.recovery.evaluate'
      `);
      expect(evaluations.map(row => row.run_id)).toEqual(["run-r6-capacity"]);

      await runChild("evaluate");
      const [runAfterEvaluation] = await client.unsafe(`
        SELECT status, "stopReason" AS stop_reason,
               "runtimeStateJson" -> 'autoTeamMediaPipeline' ->> 'status' AS pipeline_status
        FROM team_runs WHERE id = 'run-r6-capacity'
      `);
      const [evaluationJob] = await client.unsafe(`
        SELECT status, "outputJson" ->> 'outcome' AS outcome
        FROM worker_jobs WHERE id = $1
      `, [queuedEvaluation.id]);
      const [scanJob] = await client.unsafe(`
        SELECT status, attempt FROM worker_jobs WHERE id = $1
      `, [first.job_id]);
      expect(runAfterEvaluation).toMatchObject({
        status: "paused",
        stop_reason: "awaiting_async_media_pipeline",
        pipeline_status: "capacity_wait",
      });
      const [futureApproval] = await client.unsafe(`
        SELECT status, "stopReason" AS stop_reason,
               "runtimeStateJson" ->> 'choiceDeadlineAt' AS choice_deadline
        FROM team_runs WHERE id = 'run-r6-future-approval'
      `);
      expect(futureApproval.status).toBe("paused");
      expect(futureApproval.stop_reason).toBe("awaiting_human_choice");
      expect(Date.parse(futureApproval.choice_deadline)).toBeGreaterThan(Date.now());
      expect(evaluationJob).toMatchObject({ status: "succeeded", outcome: "resource_scheduling" });
      expect(scanJob).toMatchObject({ status: "succeeded", attempt: 2 });
      const attempts = await client.unsafe(`
        SELECT attempt, "leaseGeneration" AS lease_generation,
               "terminalClass" AS terminal_class, "recoveryReason" AS recovery_reason
        FROM worker_job_attempts WHERE "workerJobId" = $1 ORDER BY attempt
      `, [first.job_id]);
      expect(attempts).toHaveLength(2);
      expect(attempts[0]).toMatchObject({ terminal_class: "retryable", recovery_reason: "lease_expired" });
      expect(Number(attempts[1].lease_generation)).toBeGreaterThan(Number(attempts[0].lease_generation));
      const [recoveredEvents] = await client.unsafe(`
        SELECT COUNT(*)::int AS count FROM worker_job_events
        WHERE "workerJobId" = $1 AND "eventType" = 'RECOVERED'
      `, [first.job_id]);
      expect(recoveredEvents.count).toBeGreaterThanOrEqual(1);
      const [allJobs] = await client.unsafe(`SELECT COUNT(*)::int AS count FROM worker_jobs`);
      expect(allJobs.count).toBe(2);
      const [checkpointEvent] = await client.unsafe(`
        SELECT COUNT(*)::int AS count
        FROM worker_job_events
        WHERE "workerJobId" = $1 AND "eventType" = 'PROGRESS'
          AND "payloadJson" ->> 'stage' = 'scan_checkpoint'
      `, [first.job_id]);
      expect(checkpointEvent.count).toBe(1);
      const [workerLifecycle] = await client.unsafe(`
        SELECT COUNT(DISTINCT job.id)::int AS job_count,
               COUNT(DISTINCT attempt.id)::int AS attempt_count,
               COUNT(DISTINCT outbox.id)::int AS outbox_count,
               COUNT(DISTINCT event.id)::int AS event_count
        FROM worker_jobs job
        LEFT JOIN worker_job_attempts attempt ON attempt."workerJobId" = job.id
        LEFT JOIN worker_job_outbox outbox ON outbox."workerJobId" = job.id
        LEFT JOIN worker_job_events event ON event."workerJobId" = job.id
        WHERE job."jobType" IN ('auto-team.recovery.scan', 'auto-team.recovery.evaluate')
      `);
      expect(workerLifecycle).toMatchObject({ job_count: 2, attempt_count: 3, outbox_count: 3 });
      expect(Number(workerLifecycle.event_count)).toBeGreaterThanOrEqual(10);
    } finally {
      if (interruptedWorker && interruptedWorker.exitCode === null && interruptedWorker.signalCode === null) {
        interruptedWorker.kill("SIGKILL");
        await interruptedExit;
      }
      await closeDb();
      await client.end({ timeout: 2 });
      await fixture.close();
    }
  }, 90_000);
});
