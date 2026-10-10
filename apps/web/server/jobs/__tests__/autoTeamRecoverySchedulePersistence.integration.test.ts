import { afterEach, describe, expect, it } from "vitest";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import postgres from "postgres";
import { closeDb } from "../../db";
import {
  installSpec277AutoTeamScheduleSchema,
} from "../../services/__tests__/support/spec277AutoTeamScheduleSchema";
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
    try {
      await fixture.assertOwned();
      await installSpec277AutoTeamScheduleSchema(client);
      const childEnv = {
        ...process.env,
        DATABASE_URL: fixture.databaseUrl,
        FEATURE_186_SYSTEM_TENANT_ID: "tenant-r6-synthetic",
      };
      delete childEnv.PGHOST;
      delete childEnv.PGPORT;
      delete childEnv.PGUSER;
      delete childEnv.PGPASSWORD;

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
    } finally {
      await closeDb();
      await client.end({ timeout: 2 });
      await fixture.close();
    }
  }, 15_000);
});
