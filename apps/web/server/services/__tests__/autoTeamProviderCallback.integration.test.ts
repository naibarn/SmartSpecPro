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
        tenantId,
        jobId,
        occurredAt: new Date().toISOString(),
        signatureVerified: true,
        payload: { kind: "status_update", status: "succeeded" },
      };
      const first = await recordAuthenticatedJobCallback(callback);
      const duplicate = await recordAuthenticatedJobCallback(callback);
      const crossTenant = await recordAuthenticatedJobCallback({
        ...callback,
        providerEventId: "event-r7-cross-tenant",
        tenantId: "tenant-r7-other",
      });

      expect(first.disposition).toBe("accepted");
      expect(duplicate.disposition).toBe("duplicate");
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
        `SELECT COUNT(*)::int AS callback_count, COUNT(*) FILTER (WHERE disposition = 'rejected' AND "workerJobId" IS NULL)::int AS rejected_unbound_count FROM worker_job_callbacks`,
      );
      const [callbackEventCounts] = await client.unsafe(
        `SELECT COUNT(*)::int AS event_count FROM worker_job_events WHERE "workerJobId" = $1 AND "eventType" = 'CALLBACK_ACCEPTED'`,
        [jobId]
      );
      expect(afterJob).toEqual(beforeJob);
      expect(afterRun).toEqual(beforeRun);
      expect(callbackRows).toEqual({ callback_count: 2, rejected_unbound_count: 1 });
      expect(callbackEventCounts.event_count).toBe(1);
    } finally {
      await closeDb();
      if (originalDatabaseUrl === undefined) delete process.env.DATABASE_URL;
      else process.env.DATABASE_URL = originalDatabaseUrl;
      await client.end({ timeout: 2 });
      await fixture.close();
    }
  }, 30_000);
});
