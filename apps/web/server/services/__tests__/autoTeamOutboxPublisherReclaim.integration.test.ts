import { afterEach, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { closeDb } from "../../db";
import type { DispatchRef, DispatchRequest } from "../jobControlPlaneTypes";
import type { JobTransportAdapter } from "../jobTransportAdapters";
import { createSpec277DisposablePostgres } from "./support/spec277DisposablePostgres";
import { installSpec277AutoTeamRuntimeSchema } from "./support/spec277AutoTeamRuntimeSchema";

describe("outbox publisher lease reclaim", () => {
  afterEach(async () => closeDb());

  it("does not cancel a live dispatch when an expired publisher finishes late", async () => {
    if (process.env.DATABASE_URL)
      throw new Error("SPEC277_REFUSES_INHERITED_DATABASE_URL");

    const fixture = await createSpec277DisposablePostgres();
    const client = postgres(fixture.databaseUrl, { max: 4, connect_timeout: 3 });
    const previousDatabaseUrl = process.env.DATABASE_URL;
    const now = new Date();
    const jobId = randomUUID();
    const outboxId = randomUUID();
    const dedupeKey = `r7-outbox-reclaim:${randomUUID()}`;
    let notifyFirstStarted!: () => void;
    const firstStarted = new Promise<void>(resolve => {
      notifyFirstStarted = resolve;
    });
    let releaseFirst!: () => void;
    const holdFirst = new Promise<void>(resolve => {
      releaseFirst = resolve;
    });
    let publishCalls = 0;
    const adapter: JobTransportAdapter = {
      name: "r7-reclaim-adapter",
      referenceNamespace: "r7-reclaim",
      supports: () => true,
      publish: vi.fn(async (request: DispatchRequest): Promise<DispatchRef> => {
        publishCalls += 1;
        const first = publishCalls === 1;
        if (first) {
          notifyFirstStarted();
          await holdFirst;
        }
        return {
          jobId: request.jobId,
          attemptId: request.attemptId,
          adapter: "r7-reclaim-adapter",
          referenceNamespace: "r7-reclaim",
          dispatchId: first ? "stale-publisher-dispatch" : "current-publisher-dispatch",
          dedupeKey: request.dedupeKey,
          queueJobId: first ? "stale-queue-ref" : "current-queue-ref",
        };
      }),
      inspect: vi.fn(async () => "unknown" as const),
      cancel: vi.fn(async () => undefined),
    };

    try {
      await fixture.assertOwned();
      await installSpec277AutoTeamRuntimeSchema(client);
      process.env.DATABASE_URL = fixture.databaseUrl;
      delete process.env.PGHOST;
      delete process.env.PGPORT;
      delete process.env.PGUSER;
      delete process.env.PGPASSWORD;
      const { publishJobOutboxRow } = await import("../jobOutboxPublisher");

      await client.unsafe(
        `INSERT INTO worker_jobs (
          id, "tenantId", "runtimeType", "jobType", status,
          "executionClass", "contractVersion", "inputJson", "instructionsJson",
          "retryPolicyJson", "timeoutPolicyJson", attempt, "maxAttempts", "fencingVersion"
        ) VALUES (
          $1, 'tenant-r7-outbox-reclaim', 'node_job_worker', 'r7.outbox.reclaim',
          'queued', 'long', 'feature-186-v1', '{}', '{}',
          '{"deadlineMode":"fixed","deadlineMs":60000,"baseDelayMs":1,"maxDelayMs":1}'::jsonb,
          '{"softTimeoutMs":0,"hardTimeoutMs":60000}'::jsonb, 1, 2, 0
        )`,
        [jobId]
      );
      await client.unsafe(
        `INSERT INTO worker_job_outbox (
          id, "workerJobId", "envelopeVersion", "envelopeJson", "dedupeKey", "nextAttemptAt"
        ) VALUES (
          $1, $2, 'feature-186-v1',
          jsonb_build_object('businessAttempt', 1, 'routingMetadata', '{}'::jsonb),
          $3, $4
        )`,
        [outboxId, jobId, dedupeKey, now]
      );

      const stalePublish = publishJobOutboxRow(outboxId, adapter, now);
      await firstStarted;
      const currentPublish = await publishJobOutboxRow(
        outboxId,
        adapter,
        new Date(now.getTime() + 31_000)
      );
      expect(currentPublish.state).toBe("published");
      releaseFirst();
      const staleResult = await stalePublish;

      const [outbox] = await client.unsafe(
        `SELECT "publishedAt" AS published_at, "publisherLeaseTokenHash" AS lease_token,
          "publisherFencingVersion" AS fence_version FROM worker_job_outbox WHERE id = $1`,
        [outboxId]
      );
      const [counts] = await client.unsafe(
        `SELECT
          (SELECT COUNT(*)::int FROM worker_job_dispatches WHERE "workerJobId" = $1) AS dispatches,
          (SELECT COUNT(*)::int FROM worker_job_events WHERE "workerJobId" = $1 AND "eventType" = 'DISPATCHED') AS dispatched_events`,
        [jobId]
      );
      expect(staleResult.state).toBe("skipped");
      expect(adapter.publish).toHaveBeenCalledTimes(2);
      expect(adapter.cancel).not.toHaveBeenCalled();
      expect(outbox.published_at).toBeTruthy();
      expect(outbox.lease_token).toBeNull();
      expect(outbox.fence_version).toBe(2);
      expect(counts).toEqual({ dispatches: 1, dispatched_events: 1 });
    } finally {
      await closeDb();
      if (previousDatabaseUrl === undefined) delete process.env.DATABASE_URL;
      else process.env.DATABASE_URL = previousDatabaseUrl;
      await client.end({ timeout: 2 });
      await fixture.close();
    }
  }, 60_000);
});
