import { afterEach, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { once } from "node:events";
import postgres from "postgres";
import { closeDb } from "../../db";
import { createSpec277DisposablePostgres } from "./support/spec277DisposablePostgres";
import { installSpec277AutoTeamRuntimeSchema } from "./support/spec277AutoTeamRuntimeSchema";

describe("worker lease fence protects retry outbox and terminal settlement", () => {
  afterEach(async () => closeDb());

  it("rejects stale failure/complete calls without duplicating outbox or accepted terminal state", async () => {
    if (process.env.DATABASE_URL)
      throw new Error("SPEC277_REFUSES_INHERITED_DATABASE_URL");
    const fixture = await createSpec277DisposablePostgres();
    const client = postgres(fixture.databaseUrl, { max: 3, connect_timeout: 3 });
    const workers = new Set<ReturnType<typeof spawn>>();
    const tenantId = "tenant-r7-outbox";
    const jobId = randomUUID();
    const spawnWorker = (role: "stale" | "current") => {
      const child = spawn(
        process.execPath,
        ["--import", "tsx", "scripts/auto-team-stale-outbox-worker-child.ts"],
        {
          cwd: process.cwd(),
          env: {
            ...process.env,
            DATABASE_URL: fixture.databaseUrl,
            SPEC277_OUTBOX_INPUT: JSON.stringify({ role, jobId }),
          },
          stdio: ["pipe", "pipe", "pipe"],
        }
      );
      workers.add(child);
      let stdout = "";
      let stderr = "";
      child.stdout.on("data", chunk => { stdout += chunk.toString(); });
      child.stderr.on("data", chunk => { stderr += chunk.toString(); });
      return { child, get stdout() { return stdout; }, get stderr() { return stderr; } };
    };
    const waitForOutput = async (
      worker: ReturnType<typeof spawnWorker>, marker: string
    ) => {
      const deadline = Date.now() + 10_000;
      while (!worker.stdout.includes(marker) && Date.now() < deadline) {
        if (worker.child.exitCode !== null)
          throw new Error(`SPEC277_OUTBOX_CHILD_EXITED:${worker.stderr}`);
        await new Promise(resolve => setTimeout(resolve, 10));
      }
      if (!worker.stdout.includes(marker))
        throw new Error(`SPEC277_OUTBOX_MARKER_TIMEOUT:${marker}:${worker.stderr}`);
    };
    const waitForClose = async (worker: ReturnType<typeof spawnWorker>) =>
      new Promise<[number | null, NodeJS.Signals | null]>((resolve, reject) => {
        const timer = setTimeout(() => {
          worker.child.kill("SIGKILL");
          reject(new Error(`SPEC277_OUTBOX_CHILD_TIMEOUT:${worker.stderr}`));
        }, 20_000);
        worker.child.once("close", (code, signal) => {
          clearTimeout(timer);
          resolve([code, signal]);
        });
      });

    try {
      await fixture.assertOwned();
      await installSpec277AutoTeamRuntimeSchema(client);
      await client.unsafe(
        `INSERT INTO worker_jobs (id, "tenantId", "runtimeType", "jobType", status, "executionClass", "contractVersion", "inputJson", "instructionsJson", "retryPolicyJson", "timeoutPolicyJson", attempt, "maxAttempts", "fencingVersion") VALUES ($1, $2, 'node_job_worker', 'r7.test.stale-outbox-fence', 'queued', 'long', 'r7-outbox-v1', '{}', '{}', '{"deadlineMode":"fixed","deadlineMs":60000,"baseDelayMs":1,"maxDelayMs":1}'::jsonb, '{"softTimeoutMs":0,"hardTimeoutMs":60000}'::jsonb, 1, 4, 0)`,
        [jobId, tenantId]
      );

      const stale = spawnWorker("stale");
      await waitForOutput(stale, "SPEC277_OUTBOX_STALE_READY");
      await client.unsafe(
        `UPDATE worker_jobs SET "leaseExpiresAt" = clock_timestamp() + interval '700 milliseconds' WHERE id = $1`,
        [jobId]
      );
      const [staleAttempt] = await client.unsafe(
        `SELECT id FROM worker_job_attempts WHERE "workerJobId" = $1 AND "finishedAt" IS NULL ORDER BY attempt DESC LIMIT 1`,
        [jobId]
      );
      await client.unsafe(
        `UPDATE worker_job_attempts SET "leaseExpiresAt" = clock_timestamp() + interval '700 milliseconds' WHERE id = $1`,
        [staleAttempt.id]
      );
      const [lease] = await client.unsafe(
        `SELECT "leaseExpiresAt" FROM worker_jobs WHERE id = $1`, [jobId]
      );
      while (Date.now() <= new Date(lease.leaseExpiresAt).getTime())
        await new Promise(resolve => setTimeout(resolve, 20));

      const current = spawnWorker("current");
      await waitForOutput(current, "SPEC277_OUTBOX_CURRENT_READY");
      const [beforeStale] = await client.unsafe(
        `SELECT COUNT(*)::int AS outbox_count FROM worker_job_outbox WHERE "workerJobId" = $1`,
        [jobId]
      );
      expect(beforeStale.outbox_count).toBe(1);

      stale.child.stdin.end("resume\n");
      const [staleExit] = await waitForClose(stale);
      expect(staleExit).toBe(0);
      expect(stale.stdout).toContain("SPEC277_OUTBOX_STALE_TERMINAL_REJECTED");
      expect(stale.stdout).toContain("SPEC277_OUTBOX_STALE_RETRY_OUTBOX_REJECTED");
      const [afterStale] = await client.unsafe(
        `SELECT
           (SELECT COUNT(*)::int FROM worker_job_outbox WHERE "workerJobId" = $1) AS outbox_count,
           (SELECT COUNT(*)::int FROM worker_job_settlements WHERE "workerJobId" = $1) AS settlement_count,
           (SELECT COUNT(*)::int FROM worker_job_events WHERE "workerJobId" = $1 AND "eventType" = 'COMPLETED') AS terminal_event_count,
           (SELECT attempt FROM worker_jobs WHERE id = $1) AS attempt,
           (SELECT status FROM worker_jobs WHERE id = $1) AS status`,
        [jobId]
      );
      expect(afterStale).toEqual({
        outbox_count: 1,
        settlement_count: 0,
        terminal_event_count: 0,
        attempt: 2,
        status: "running",
      });

      current.child.stdin.end("complete\n");
      const [currentExit] = await waitForClose(current);
      expect(currentExit).toBe(0);
      expect(current.stdout).toContain("SPEC277_OUTBOX_CURRENT_TERMINAL_ACCEPTED");
      const [finalState] = await client.unsafe(
        `SELECT
           j.status,
           j.attempt,
           j."fencingVersion" AS fencing_version,
           (SELECT COUNT(*)::int FROM worker_job_outbox WHERE "workerJobId" = j.id) AS outbox_count,
           (SELECT COUNT(*)::int FROM worker_job_settlements WHERE "workerJobId" = j.id) AS settlement_count,
           (SELECT COUNT(*)::int FROM worker_job_events WHERE "workerJobId" = j.id AND "eventType" = 'COMPLETED') AS terminal_event_count
         FROM worker_jobs j WHERE j.id = $1`,
        [jobId]
      );
      expect(finalState).toEqual({
        status: "succeeded",
        attempt: 2,
        fencing_version: 2,
        outbox_count: 1,
        settlement_count: 1,
        terminal_event_count: 1,
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
    }
  }, 60_000);
});
