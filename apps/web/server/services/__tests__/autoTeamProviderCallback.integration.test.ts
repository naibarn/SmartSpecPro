import { afterEach, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { closeDb } from "../../db";
import { createSpec277DisposablePostgres } from "./support/spec277DisposablePostgres";
import { installSpec277AutoTeamRuntimeSchema } from "./support/spec277AutoTeamRuntimeSchema";

describe("authenticated provider callback persistence", () => {
  afterEach(async () => closeDb());

  it("records a correlated callback once without mutating recovered job or TeamRun state", async () => {
    if (process.env.DATABASE_URL)
      throw new Error("SPEC277_REFUSES_INHERITED_DATABASE_URL");
    const fixture = await createSpec277DisposablePostgres();
    const client = postgres(fixture.databaseUrl, { max: 2, connect_timeout: 3 });
    const originalDatabaseUrl = process.env.DATABASE_URL;
    const tenantId = "tenant-r7-callback";
    const runId = "run-r7-callback";
    const jobId = randomUUID();
    try {
      await fixture.assertOwned();
      await installSpec277AutoTeamRuntimeSchema(client);
      await client.unsafe(
        `INSERT INTO team_rooms (id, "tenantId", "teamId", "orchestratorUserId", "roomType", title) VALUES ('room-r7-callback', $1, 'team-r7-callback', 1, 'auto_team', 'Callback acceptance')`,
        [tenantId]
      );
      await client.unsafe(
        `INSERT INTO team_runs (id, "roomId", "teamId", "initiatedByUserId", "executionMode", status, "startedAt") VALUES ($1, 'room-r7-callback', 'team-r7-callback', 1, 'auto_team', 'running', now())`,
        [runId]
      );
      await client.unsafe(
        `INSERT INTO worker_jobs (id, "tenantId", "runtimeType", "jobType", status, "executionClass", "contractVersion", "inputJson", "instructionsJson", "retryPolicyJson", "timeoutPolicyJson", attempt, "maxAttempts", "fencingVersion", "leaseOwnerToken", "leaseExpiresAt") VALUES ($1, $2, 'node_job_worker', 'auto-team.recovery.evaluate', 'running', 'long', 'auto-team-recovery-v1', jsonb_build_object('runId', $3::text), '{}', '{"deadlineMode":"fixed","deadlineMs":60000,"baseDelayMs":1,"maxDelayMs":1}'::jsonb, '{"softTimeoutMs":0,"hardTimeoutMs":60000}'::jsonb, 2, 4, 3, 'synthetic-current-lease-hash', clock_timestamp() + interval '1 minute')`,
        [jobId, tenantId, runId]
      );
      const [beforeJob] = await client.unsafe(
        `SELECT status, attempt, "fencingVersion" AS fencing_version FROM worker_jobs WHERE id = $1`,
        [jobId]
      );
      const [beforeRun] = await client.unsafe(
        `SELECT status, "stopReason" AS stop_reason FROM team_runs WHERE id = $1`,
        [runId]
      );

      process.env.DATABASE_URL = fixture.databaseUrl;
      const { recordAuthenticatedJobCallback } = await import("../jobControlPlane");
      const callback = {
        adapterNamespace: "r7-synthetic-provider",
        providerEventId: "event-r7-1",
        businessAttempt: 2,
        tenantId,
        jobId,
        occurredAt: new Date().toISOString(),
        signatureVerified: true,
        payload: { kind: "status_update", status: "succeeded" },
      };
      const first = await recordAuthenticatedJobCallback(callback);
      const duplicate = await recordAuthenticatedJobCallback(callback);
      const legacyCallback = await recordAuthenticatedJobCallback({
        adapterNamespace: callback.adapterNamespace,
        providerEventId: "event-r7-legacy-no-attempt",
        tenantId,
        jobId,
        occurredAt: callback.occurredAt,
        signatureVerified: true,
        payload: { kind: "status_update", status: "running" },
      });
      const staleAttempt = await recordAuthenticatedJobCallback({
        ...callback,
        providerEventId: "event-r7-stale-attempt",
        businessAttempt: 1,
      });
      const crossTenant = await recordAuthenticatedJobCallback({
        ...callback,
        providerEventId: "event-r7-cross-tenant",
        tenantId: "tenant-r7-other",
      });

      expect(first.disposition).toBe("accepted");
      expect(duplicate.disposition).toBe("duplicate");
      expect(legacyCallback.disposition).toBe("rejected");
      expect(staleAttempt.disposition).toBe("rejected");
      expect(crossTenant.disposition).toBe("rejected");
      const [afterJob] = await client.unsafe(
        `SELECT status, attempt, "fencingVersion" AS fencing_version FROM worker_jobs WHERE id = $1`,
        [jobId]
      );
      const [afterRun] = await client.unsafe(
        `SELECT status, "stopReason" AS stop_reason FROM team_runs WHERE id = $1`,
        [runId]
      );
      const [callbackRows] = await client.unsafe(
        `SELECT COUNT(*)::int AS callback_count,
          COUNT(*) FILTER (WHERE disposition = 'rejected' AND "workerJobId" IS NULL)::int AS rejected_unbound_count,
          COUNT(*) FILTER (WHERE disposition = 'rejected' AND "workerJobId" = $1)::int AS rejected_stale_attempt_count
         FROM worker_job_callbacks`,
        [jobId]
      );
      const [callbackEventCounts] = await client.unsafe(
        `SELECT
          COUNT(*) FILTER (WHERE "eventType" = 'CALLBACK_ACCEPTED')::int AS accepted_count,
          COUNT(*) FILTER (WHERE "eventType" = 'CALLBACK_REJECTED')::int AS rejected_count
         FROM worker_job_events WHERE "workerJobId" = $1`,
        [jobId]
      );
      const [staleCallbackEvidence] = await client.unsafe(
        `SELECT c."workerJobId" AS worker_job_id,
          c."payloadJson"->>'callbackBusinessAttempt' AS callback_business_attempt,
          (SELECT e."payloadJson" FROM worker_job_events e
           WHERE e."workerJobId" = c."workerJobId" AND e."eventType" = 'CALLBACK_REJECTED'
             AND e."payloadJson"->>'callbackBusinessAttempt' = '1'
           LIMIT 1) AS rejected_event
         FROM worker_job_callbacks c WHERE c."providerEventId" = 'event-r7-stale-attempt'`,
      );
      expect(afterJob).toEqual(beforeJob);
      expect(afterRun).toEqual(beforeRun);
      expect(callbackRows).toEqual({
        callback_count: 4,
        rejected_unbound_count: 1,
        rejected_stale_attempt_count: 2,
      });
      expect(callbackEventCounts).toEqual({ accepted_count: 1, rejected_count: 2 });
      expect(staleCallbackEvidence).toEqual({
        worker_job_id: jobId,
        callback_business_attempt: "1",
        rejected_event: {
          adapterNamespace: "r7-synthetic-provider",
          disposition: "rejected",
          callbackBusinessAttempt: 1,
          currentBusinessAttempt: 2,
        },
      });
      const [ambiguousLegacyEvidence] = await client.unsafe(
        `SELECT c."workerJobId" AS worker_job_id,
          c.disposition,
          (SELECT e."payloadJson" FROM worker_job_events e
           WHERE e."workerJobId" = c."workerJobId" AND e."eventType" = 'CALLBACK_REJECTED'
             AND e."eventIdempotencyKey" = 'callback:r7-synthetic-provider:event-r7-legacy-no-attempt'
           ORDER BY e."eventSequence" DESC LIMIT 1) AS rejected_event
         FROM worker_job_callbacks c WHERE c."providerEventId" = 'event-r7-legacy-no-attempt'`,
      );
      expect(ambiguousLegacyEvidence).toMatchObject({
        worker_job_id: jobId,
        disposition: "rejected",
        rejected_event: {
          adapterNamespace: "r7-synthetic-provider",
          disposition: "rejected",
          currentBusinessAttempt: 2,
          callbackCorrelationReason: "business_attempt_missing_after_retry",
        },
      });

      await client.unsafe(
        `UPDATE worker_jobs SET status = 'cancelled', "finishedAt" = now(),
          "leaseOwnerToken" = NULL, "leaseExpiresAt" = NULL WHERE id = $1`,
        [jobId]
      );
      const terminalCallback = await recordAuthenticatedJobCallback({
        ...callback,
        providerEventId: "event-r7-after-terminalization",
      });
      expect(terminalCallback.disposition).toBe("rejected");
      const [terminalState] = await client.unsafe(
        `SELECT j.status, c.disposition,
          c."payloadJson"->>'callbackCorrelationReason' AS correlation_reason
         FROM worker_jobs j JOIN worker_job_callbacks c ON c."workerJobId" = j.id
         WHERE j.id = $1 AND c."providerEventId" = 'event-r7-after-terminalization'`,
        [jobId]
      );
      expect(terminalState).toEqual({
        status: "cancelled",
        disposition: "rejected",
        correlation_reason: "job_already_terminal",
      });

      const concurrentJobId = randomUUID();
      await client.unsafe(
        `INSERT INTO worker_jobs (
          id, "tenantId", "runtimeType", "jobType", status, "executionClass",
          "contractVersion", "inputJson", "instructionsJson", "retryPolicyJson",
          "timeoutPolicyJson", attempt, "maxAttempts", "fencingVersion"
        ) VALUES (
          $1, $2, 'node_job_worker', 'auto-team.recovery.evaluate', 'running', 'long',
          'auto-team-recovery-v1', '{}', '{}',
          '{"deadlineMode":"fixed","deadlineMs":60000,"baseDelayMs":1,"maxDelayMs":1}'::jsonb,
          '{"softTimeoutMs":0,"hardTimeoutMs":60000}'::jsonb, 1, 4, 1
        )`,
        [concurrentJobId, tenantId]
      );
      let signalAttemptUpdate!: () => void;
      const attemptUpdateReady = new Promise<void>(resolve => {
        signalAttemptUpdate = resolve;
      });
      let releaseAttemptUpdate!: () => void;
      const holdAttemptUpdate = new Promise<void>(resolve => {
        releaseAttemptUpdate = resolve;
      });
      const attemptUpdate = client.begin(async tx => {
        await tx.unsafe(`UPDATE worker_jobs SET attempt = 2 WHERE id = $1`, [concurrentJobId]);
        signalAttemptUpdate();
        await holdAttemptUpdate;
      });
      await attemptUpdateReady;
      let callbackFinished = false;
      const concurrentCallback = recordAuthenticatedJobCallback({
        ...callback,
        jobId: concurrentJobId,
        providerEventId: "event-r7-concurrent-stale-attempt",
        businessAttempt: 1,
      }).then(result => {
        callbackFinished = true;
        return result;
      });
      try {
        await new Promise(resolve => setTimeout(resolve, 50));
        expect(callbackFinished).toBe(false);
      } finally {
        releaseAttemptUpdate();
      }
      await attemptUpdate;
      expect((await concurrentCallback).disposition).toBe("rejected");
      const [concurrentState] = await client.unsafe(
        `SELECT j.attempt, c.disposition, c."workerJobId" AS worker_job_id,
          e."payloadJson" AS event_payload
         FROM worker_jobs j
         JOIN worker_job_callbacks c ON c."workerJobId" = j.id
         JOIN worker_job_events e ON e."workerJobId" = j.id AND e."eventType" = 'CALLBACK_REJECTED'
         WHERE j.id = $1 AND c."providerEventId" = 'event-r7-concurrent-stale-attempt'`,
        [concurrentJobId]
      );
      expect(concurrentState).toEqual({
        attempt: 2,
        disposition: "rejected",
        worker_job_id: concurrentJobId,
        event_payload: {
          adapterNamespace: "r7-synthetic-provider",
          disposition: "rejected",
          callbackBusinessAttempt: 1,
          currentBusinessAttempt: 2,
        },
      });
    } finally {
      await closeDb();
      if (originalDatabaseUrl === undefined) delete process.env.DATABASE_URL;
      else process.env.DATABASE_URL = originalDatabaseUrl;
      await client.end({ timeout: 2 });
      await fixture.close();
    }
  }, 30_000);
});
