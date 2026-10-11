import { afterEach, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { once } from "node:events";
import postgres from "postgres";
import { closeDb } from "../../db";
import { createSpec277DisposablePostgres } from "./support/spec277DisposablePostgres";
import { installSpec277AutoTeamRuntimeSchema } from "./support/spec277AutoTeamRuntimeSchema";

describe("AutoTeam mutation fence against worker lease reclaim", () => {
  afterEach(async () => closeDb());

  it("rejects a paused stale process after a newer generation commits TeamRun progress", async () => {
    if (process.env.DATABASE_URL)
      throw new Error("SPEC277_REFUSES_INHERITED_DATABASE_URL");
    const fixture = await createSpec277DisposablePostgres();
    const client = postgres(fixture.databaseUrl, {
      max: 2,
      connect_timeout: 3,
    });
    const workers = new Set<ReturnType<typeof spawn>>();
    const tenantId = "tenant-r7-fence";

    const spawnWorker = (input: Record<string, unknown>) => {
      const child = spawn(
        process.execPath,
        ["--import", "tsx", "scripts/auto-team-run-fence-worker-child.ts"],
        {
          cwd: process.cwd(),
          env: {
            ...process.env,
            DATABASE_URL: fixture.databaseUrl,
            SPEC277_FENCE_INPUT: JSON.stringify(input),
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
          return stdout.replace(
            /"leaseToken":"[^"]+"/g,
            '"leaseToken":"[redacted]"'
          );
        },
        get stderr() {
          return stderr;
        },
      };
    };
    const waitForClose = async (worker: ReturnType<typeof spawnWorker>) => {
      return new Promise<[number | null, NodeJS.Signals | null]>(
        (resolve, reject) => {
          const timer = setTimeout(() => {
            worker.child.kill("SIGKILL");
            reject(
              new Error(
                `SPEC277_FENCE_CHILD_TIMEOUT:${worker.stdout}:${worker.stderr}`
              )
            );
          }, 20_000);
          worker.child.once("close", (code, signal) => {
            clearTimeout(timer);
            resolve([code, signal]);
          });
        }
      );
    };

    try {
      await fixture.assertOwned();
      await installSpec277AutoTeamRuntimeSchema(client);
      await client.unsafe(
        `
        INSERT INTO team_rooms (id, "tenantId", "teamId", "orchestratorUserId", "roomType", title)
        VALUES ($1, $2, 'team-r7-fence', 1, 'auto_team', 'R7 fence race')
      `,
        ["room-r7-fence", tenantId]
      );
      for (let race = 0; race < 3; race += 1) {
        const runId = `run-r7-fence-${race}`;
        const jobId = randomUUID();
        await client.unsafe(
          `
          INSERT INTO team_runs (id, "roomId", "teamId", "initiatedByUserId", "executionMode", status, "startedAt")
          VALUES ($1, 'room-r7-fence', 'team-r7-fence', 1, 'auto_team', 'running', now())
        `,
          [runId]
        );
        await client.unsafe(
          `
          INSERT INTO worker_jobs (
            id, "tenantId", "runtimeType", "jobType", status, "executionClass", "contractVersion",
            "inputJson", "instructionsJson", "retryPolicyJson", "timeoutPolicyJson", attempt,
            "maxAttempts", "fencingVersion"
          ) VALUES (
            $1, $2, 'node_job_worker', 'auto-team.recovery.evaluate', 'queued', 'long',
            'auto-team-recovery-v1', jsonb_build_object('runId', $3::text), '{}',
            '{"deadlineMode":"fixed","deadlineMs":60000,"baseDelayMs":1,"maxDelayMs":1}'::jsonb,
            '{"softTimeoutMs":0,"hardTimeoutMs":60000}'::jsonb, 1, 4, 0
          )
        `,
          [jobId, tenantId, runId]
        );
        const stale = spawnWorker({
          role: "stale-worker",
          tenantId,
          runId,
          jobId,
        });
        const readyDeadline = Date.now() + 5_000;
        while (
          !stale.stdout.includes("SPEC277_FENCE_WORKER_READY") &&
          Date.now() < readyDeadline
        ) {
          if (stale.child.exitCode !== null)
            throw new Error(`SPEC277_STALE_WORKER_EXITED:${stale.stderr}`);
          await new Promise(resolve => setTimeout(resolve, 10));
        }
        const readyLine = stale.stdout
          .split("\n")
          .find(line => line.startsWith("SPEC277_FENCE_WORKER_READY "));
        expect(readyLine).toBeTruthy();
        const acquiredLease = JSON.parse(
          readyLine!.slice("SPEC277_FENCE_WORKER_READY ".length)
        ) as { attemptId: string; fencingVersion: number };
        expect(acquiredLease.fencingVersion).toBe(1);
        await client.unsafe(
          `UPDATE worker_jobs SET "leaseExpiresAt" = clock_timestamp() + interval '700 milliseconds' WHERE id = $1`,
          [jobId]
        );
        await client.unsafe(
          `UPDATE worker_job_attempts SET "leaseExpiresAt" = clock_timestamp() + interval '700 milliseconds' WHERE id = $1`,
          [acquiredLease.attemptId]
        );
        const [lease] = await client.unsafe(
          `SELECT "leaseExpiresAt" FROM worker_jobs WHERE id = $1`,
          [jobId]
        );
        while (Date.now() <= new Date(lease.leaseExpiresAt).getTime())
          await new Promise(resolve => setTimeout(resolve, 20));

        const reclaim = spawnWorker({
          role: "reclaiming-worker",
          tenantId,
          runId,
          jobId,
        });
        const [reclaimExit] = await waitForClose(reclaim);
        if (reclaimExit !== 0)
          throw new Error(`SPEC277_RECLAIM_WORKER_FAILED:${reclaim.stderr}`);
        expect(reclaim.stdout).toContain(
          "SPEC277_FENCE_RECLAIM_MUTATION_ACCEPTED"
        );

        stale.child.stdin.end("resume\n");
        const [staleExit] = await waitForClose(stale);
        if (staleExit !== 0)
          throw new Error(`SPEC277_STALE_WORKER_FAILED:${stale.stderr}`);
        expect(stale.stdout).toContain("SPEC277_FENCE_MUTATION_REJECTED");

        const [finalRun] = await client.unsafe(
          `
          SELECT status, "stopReason" AS stop_reason,
                 "runtimeStateJson" ->> 'lastAcceptedWorkerGeneration' AS accepted_generation
          FROM team_runs WHERE id = $1
        `,
          [runId]
        );
        expect(finalRun).toEqual({
          status: "running",
          stop_reason: null,
          accepted_generation: "2",
        });
      }
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
  }, 90_000);
});
