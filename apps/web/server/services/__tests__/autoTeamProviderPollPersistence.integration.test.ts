import { afterEach, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { closeDb } from "../../db";
import { createSpec277DisposablePostgres } from "./support/spec277DisposablePostgres";
import { installSpec277AutoTeamRuntimeSchema } from "./support/spec277AutoTeamRuntimeSchema";

describe("provider poll result persistence and cancellation fencing", () => {
  afterEach(async () => closeDb());

  it("persists one provider result and allows only one terminal winner against cancellation", async () => {
    if (process.env.DATABASE_URL)
      throw new Error("SPEC277_REFUSES_INHERITED_DATABASE_URL");

    const fixture = await createSpec277DisposablePostgres();
    const client = postgres(fixture.databaseUrl, { max: 3, connect_timeout: 3 });
    const priorDatabaseUrl = process.env.DATABASE_URL;
    const priorPg = {
      PGHOST: process.env.PGHOST,
      PGPORT: process.env.PGPORT,
      PGUSER: process.env.PGUSER,
      PGPASSWORD: process.env.PGPASSWORD,
    };
    const providerPoolKey = "media:kie_ai:account-pool";
    const userKey = "r7-provider-poll-user";
    const now = new Date();

    try {
      await fixture.assertOwned();
      await client.unsafe("CREATE EXTENSION IF NOT EXISTS pgcrypto");
      await installSpec277AutoTeamRuntimeSchema(client);
      process.env.DATABASE_URL = fixture.databaseUrl;
      delete process.env.PGHOST;
      delete process.env.PGPORT;
      delete process.env.PGUSER;
      delete process.env.PGPASSWORD;

      const { createPostgresProviderSchedulerRepository } = await import(
        "../postgresProviderSchedulerRepository"
      );
      const { createJobControlPlane } = await import("../jobControlPlane");
      const providerRepository = createPostgresProviderSchedulerRepository();
      const controlPlane = createJobControlPlane();

      const seedWaitingProviderJob = async (jobId: string, operationKey: string) => {
        const reservationId = randomUUID();
        await client.unsafe(
          `INSERT INTO worker_jobs (
            id, "tenantId", "requestedByUserId", "runtimeType", "jobType", status,
            "executionClass", "contractVersion", "inputJson", "progressJson",
            "retryPolicyJson", "timeoutPolicyJson", attempt, "maxAttempts", "fencingVersion"
          ) VALUES (
            $1, 'tenant-r7-provider-poll', 2702, 'node_job_worker', 'r7.provider.poll',
            'waiting_external', 'long', 'r7-provider-poll-v1', '{}',
            jsonb_build_object('externalWait', jsonb_build_object(
              'operationKey', $2::text,
              'metadata', jsonb_build_object('commandTemplate', jsonb_build_object(
                'commandType', 'execute', 'commandId', 'r7-provider-poll-execute',
                'leaseId', 'r7-provider-poll-lease', 'tenantId', 'tenant-r7-provider-poll',
                'runnerId', 'r7-provider-poll-runner', 'runnerSessionId', 'r7-provider-poll-session',
                'capabilitySnapshotId', 'r7-provider-poll-capability',
                'capabilitySnapshotRevision', '1', 'controlPlaneOrigin', 'https://control.example',
                'executionKind', 'external_agent_task', 'adapterId', 'codex.v1',
                'deadline', '2026-10-12T00:00:00.000Z',
                'authorizationGrantRef', 'r7-provider-poll-auth',
                'fenceVersion', 1
              ))
            )),
            '{"deadlineMode":"fixed","deadlineMs":60000,"baseDelayMs":1,"maxDelayMs":1}'::jsonb,
            '{"softTimeoutMs":0,"hardTimeoutMs":60000}'::jsonb, 1, 3, 1
          )`,
          [jobId, operationKey]
        );
        await client.unsafe(
          `INSERT INTO worker_job_provider_reservations (
            id, "workerJobId", "businessAttempt", "providerKind", "providerName",
            "reservationKind", "reservationStatus", "userKey", "operationKey",
            "providerJobId", "pollerLeaseTokenHash", "pollerLeaseExpiresAt",
            "nextPollAt", "pollAttempt", "providerDeadlineAt"
          ) VALUES (
            $1, $2, 1, 'media', 'kie_ai', 'running', 'reserved', $3, $4,
            $5, NULL, NULL, $6, 0, $7
          )`,
          [
            reservationId,
            jobId,
            userKey,
            operationKey,
            `provider-${jobId}`,
            new Date(now.getTime() - 1_000),
            new Date(now.getTime() + 3_600_000),
          ]
        );
        await client.unsafe(
          `INSERT INTO provider_scheduler_states (
            "providerKind", "providerPoolKey", "userKey", "activeCount"
          ) VALUES ('media', $1, $2, 1)
          ON CONFLICT ("providerPoolKey", "userKey") DO UPDATE
          SET "activeCount" = provider_scheduler_states."activeCount" + 1`,
          [providerPoolKey, userKey]
        );
        return { jobId, operationKey, reservationId };
      };

      const first = await seedWaitingProviderJob(
        randomUUID(),
        `r7-provider-poll:${randomUUID()}`
      );
      const [firstRecord] = await providerRepository.claimDue({
        now,
        limit: 10,
        leaseMs: 30_000,
      });
      expect(firstRecord).toMatchObject({
        reservationId: first.reservationId,
        jobId: first.jobId,
        operationKey: first.operationKey,
      });
      const completedObservation = {
        status: "completed" as const,
        resultRef: `https://storage.example/tenant-r7-provider-poll/${first.jobId}/result.mp4`,
      };
      await providerRepository.recordObservation({
        record: firstRecord,
        observation: completedObservation,
        nextPollAt: null,
        now,
      });

      const [settledJob] = await client.unsafe(
        `SELECT status, "resultRef" AS result_ref FROM worker_jobs WHERE id = $1`,
        [first.jobId]
      );
      const [settledReservation] = await client.unsafe(
        `SELECT "reservationStatus" AS status, "lastObservedStatus" AS observed_status,
          "pollerLeaseTokenHash" AS lease_token, "releasedAt" AS released_at
         FROM worker_job_provider_reservations WHERE id = $1`,
        [first.reservationId]
      );
      const [firstCounts] = await client.unsafe(
        `SELECT
          (SELECT COUNT(*)::int FROM worker_job_events WHERE "workerJobId" = $1 AND "eventType" = 'COMPLETED') AS completions,
          (SELECT "activeCount" FROM provider_scheduler_states WHERE "providerPoolKey" = $2 AND "userKey" = $3) AS active_count`,
        [first.jobId, providerPoolKey, userKey]
      );
      expect(settledJob).toEqual({
        status: "succeeded",
        result_ref: completedObservation.resultRef,
      });
      expect(settledReservation).toMatchObject({
        status: "released",
        observed_status: "completed",
        lease_token: null,
      });
      expect(settledReservation.released_at).toBeTruthy();
      expect(firstCounts).toEqual({ completions: 1, active_count: 0 });

      await providerRepository.recordObservation({
        record: firstRecord,
        observation: completedObservation,
        nextPollAt: null,
        now,
      });
      const [afterDuplicate] = await client.unsafe(
        `SELECT
          (SELECT COUNT(*)::int FROM worker_job_events WHERE "workerJobId" = $1 AND "eventType" = 'COMPLETED') AS completions,
          (SELECT "activeCount" FROM provider_scheduler_states WHERE "providerPoolKey" = $2 AND "userKey" = $3) AS active_count`,
        [first.jobId, providerPoolKey, userKey]
      );
      expect(afterDuplicate).toEqual({ completions: 1, active_count: 0 });

      const racedJobs = await Promise.all(
        Array.from({ length: 3 }, () =>
          seedWaitingProviderJob(
            randomUUID(),
            `r7-provider-cancel-race:${randomUUID()}`
          )
        )
      );
      const racedRecords = await providerRepository.claimDue({
        now,
        limit: 10,
        leaseMs: 30_000,
      });
      expect(racedRecords).toHaveLength(racedJobs.length);
      const outcomes = await Promise.all(
        racedJobs.map(async job => {
          const record = racedRecords.find(item => item.jobId === job.jobId);
          expect(record).toBeDefined();
          await Promise.all([
            controlPlane.cancel(job.jobId, "r7_cancel_competes_with_provider"),
            providerRepository.recordObservation({
              record: record!,
              observation: {
                status: "completed",
                resultRef: `https://storage.example/tenant-r7-provider-poll/${job.jobId}/result.mp4`,
              },
              nextPollAt: null,
              now,
            }),
          ]);
          const [state] = await client.unsafe(
            `SELECT
              j.status,
              r."reservationStatus" AS reservation_status,
              (SELECT COUNT(*)::int FROM worker_job_events e WHERE e."workerJobId" = j.id AND e."eventType" IN ('COMPLETED', 'CANCELLED')) AS terminal_events,
              (SELECT COUNT(*)::int FROM worker_job_events e WHERE e."workerJobId" = j.id AND e."eventType" = 'COMPLETED') AS completed_events,
              (SELECT COUNT(*)::int FROM worker_job_events e WHERE e."workerJobId" = j.id AND e."eventType" = 'CANCELLED') AS cancelled_events
             FROM worker_jobs j
             JOIN worker_job_provider_reservations r ON r."workerJobId" = j.id
             WHERE j.id = $1`,
            [job.jobId]
          );
          return state;
        })
      );
      for (const outcome of outcomes) {
        expect(outcome.status).toMatch(/^(succeeded|cancelled)$/);
        expect(outcome.reservation_status).toBe("released");
        expect(outcome.terminal_events).toBe(1);
        expect(outcome.completed_events + outcome.cancelled_events).toBe(1);
        expect(outcome.status === "succeeded").toBe(
          outcome.completed_events === 1
        );
      }
      const [remainingCapacity] = await client.unsafe(
        `SELECT "activeCount" AS active_count FROM provider_scheduler_states WHERE "providerPoolKey" = $1 AND "userKey" = $2`,
        [providerPoolKey, userKey]
      );
      expect(remainingCapacity.active_count).toBe(0);
    } finally {
      await closeDb();
      if (priorDatabaseUrl === undefined) delete process.env.DATABASE_URL;
      else process.env.DATABASE_URL = priorDatabaseUrl;
      for (const [key, value] of Object.entries(priorPg)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
      await client.end({ timeout: 2 });
      await fixture.close();
    }
  }, 60_000);
});
