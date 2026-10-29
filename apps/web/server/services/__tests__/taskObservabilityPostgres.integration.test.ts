import { randomUUID } from "node:crypto";
import { access } from "node:fs/promises";
import postgres from "postgres";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  conversationThreads, conversations, economicEvents, llmInferenceAttempts, llmInferencePlans, runnerExecutionSessions,
  runnerExecutionSessionEvents, runnerNodes,
} from "../../../drizzle/schema";
import { closeDb, getDb } from "../../db";
import { sql as drizzleSql } from "drizzle-orm";
import { createSpec277DisposablePostgres } from "./support/spec277DisposablePostgres";
import { installSpec277AutoTeamRuntimeSchema } from "./support/spec277AutoTeamRuntimeSchema";
import {
  aggregateTaskObservability, encodeProjectionSnapshotToken,
  getTaskHarnessOutputEvents, getTaskObservabilityDetail, listTaskObservability,
} from "../taskObservabilityReadModel";

/** Real SQL read-boundary acceptance only. Caller scopes and signing secret are
 * test inputs, not authenticated users, owner grants, or live Runner evidence. */
describe("Task observability native PostgreSQL read prerequisites (not live auth)", () => {
  const priorEnv = Object.fromEntries(["DATABASE_URL", "PGHOST", "PGPORT", "PGUSER", "PGPASSWORD"].map(key => [key, process.env[key]]));
  const owner = { tenantId: "read-tenant-a", userId: 7 };
  const projectId = "read-prerequisite-project";
  const conversationId = 451;
  const foreignConversationId = 452;
  const legacyTenantlessConversationId = 453;
  const threadId = randomUUID();
  const foreignThreadId = randomUUID();
  const legacyConversationThreadId = randomUUID();
  const threadJobId = randomUUID();
  const legacyConversationJobId = randomUUID();
  const foreignConversationJobId = randomUUID();
  const mismatchedThreadJobId = randomUUID();
  const legacyTenantlessConversationJobId = randomUUID();
  const ids = Array.from({ length: 30 }, () => randomUUID());
  const foreignUserId = randomUUID();
  const foreignTenantId = randomUUID();
  let fixture: Awaited<ReturnType<typeof createSpec277DisposablePostgres>>;
  let writer: postgres.Sql;

  beforeAll(async () => {
    if (process.env.DATABASE_URL) throw new Error("TASK_READ_TEST_REFUSES_INHERITED_DATABASE_URL");
    fixture = await createSpec277DisposablePostgres();
    await fixture.assertOwned();
    writer = postgres(fixture.databaseUrl, { max: 1, connect_timeout: 3 });
    await writer.unsafe("CREATE EXTENSION IF NOT EXISTS pgcrypto");
    await installSpec277AutoTeamRuntimeSchema(writer, [
      conversations, conversationThreads,
      runnerNodes, runnerExecutionSessions, runnerExecutionSessionEvents,
      llmInferencePlans, llmInferenceAttempts, economicEvents,
    ]);
    await writer`INSERT INTO conversations (id, "userId", "tenantId", title) VALUES
      (${conversationId}, ${owner.userId}, ${owner.tenantId}, 'Authorized thread conversation'),
      (${foreignConversationId}, 8, ${owner.tenantId}, 'Foreign thread conversation'),
      (${legacyTenantlessConversationId}, ${owner.userId}, null, 'Legacy tenantless conversation')`;
    await writer`INSERT INTO conversation_threads
      (id, conversation_id, tenant_id, owner_user_id, title, idempotency_key) VALUES
      (${threadId}, ${conversationId}, ${owner.tenantId}, ${owner.userId}, 'Child task', 'child-thread-idempotency'),
      (${foreignThreadId}, ${foreignConversationId}, ${owner.tenantId}, 8, 'Foreign child task', 'foreign-thread-idempotency'),
      (${legacyConversationThreadId}, ${legacyTenantlessConversationId}, null, ${owner.userId}, 'Legacy child task', 'legacy-child-thread-idempotency')`;
    for (const [index, id] of [...ids, foreignUserId, foreignTenantId].entries()) {
      await writer.unsafe(`INSERT INTO worker_jobs
        (id, "tenantId", "requestedByUserId", "runtimeType", "jobType", status,
         "executionClass", "contractVersion", "inputJson", "createdAt")
        VALUES ($1,$2,$3,'node_job_worker','test.read_prerequisite','queued','long','test-only',
          $4::jsonb,$5)`, [id, id === foreignTenantId ? "read-tenant-b" : owner.tenantId,
        id === foreignUserId ? 8 : owner.userId, { projectId, specId: "224" },
        new Date(Date.now() - 60_000 - index * 1000).toISOString()]);
    }
    await writer.unsafe(`INSERT INTO worker_job_events
      ("workerJobId", "workerJobAttempt", "eventType", "eventSequence", "payloadJson", "createdAt") VALUES
      ($1, 1, 'RUNNER_PROGRESS', 1, $2::jsonb, '2026-10-29T10:00:01Z'),
      ($1, 1, 'RUNNER_PROGRESS', 2, $3::jsonb, '2026-10-29T10:00:02Z'),
      ($1, 1, 'RUNNER_PROGRESS', 3, $4::jsonb, '2026-10-29T10:00:03Z'),
      ($1, 1, 'RUNNER_PROGRESS', 4, $5::jsonb, '2026-10-29T10:00:04Z'),
      ($1, 1, 'JOB_PROGRESS', 5, $6::jsonb, '2026-10-29T10:00:05Z')`, [ids[0],
    JSON.stringify({ harnessEvent: { kind: "assistant_message", text: "Phase 1 started" } }),
    JSON.stringify({ harnessEvent: { kind: "tool_result", name: "test", text: "2 tests passed token=do-not-leak" } }),
    JSON.stringify({ harnessEvent: { kind: "final_summary", text: "Phase 1 complete" } }),
    JSON.stringify({ harnessEvent: { kind: "private_reasoning", text: "must not be shown" } }),
    JSON.stringify({ harnessEvent: { kind: "assistant_message", text: "wrong event source" } }),
    ]);
    await writer`INSERT INTO worker_jobs
      (id, "tenantId", "requestedByUserId", "runtimeType", "jobType", status,
       "executionClass", "contractVersion", "inputJson") VALUES
      (${threadJobId}, ${owner.tenantId}, ${owner.userId}, 'node_job_worker', 'test.thread_linked', 'queued', 'long', 'test-only', ${{ projectId: "conversation-thread-project" }}),
      (${legacyConversationJobId}, ${owner.tenantId}, ${owner.userId}, 'node_job_worker', 'test.legacy_conversation', 'queued', 'long', 'test-only', ${{ conversationId }}),
      (${foreignConversationJobId}, ${owner.tenantId}, ${owner.userId}, 'node_job_worker', 'test.foreign_thread', 'queued', 'long', 'test-only', ${{ projectId: "conversation-thread-project" }}),
      (${mismatchedThreadJobId}, ${owner.tenantId}, ${owner.userId}, 'node_job_worker', 'test.mismatched_thread', 'queued', 'long', 'test-only', ${{ conversationId }}),
      (${legacyTenantlessConversationJobId}, ${owner.tenantId}, ${owner.userId}, 'node_job_worker', 'test.legacy_tenantless_thread', 'queued', 'long', 'test-only', ${{ projectId: "legacy-thread-project" }})`;
    await writer`UPDATE worker_jobs SET thread_id=${threadId} WHERE id=${threadJobId}`;
    await writer`UPDATE worker_jobs SET thread_id=${foreignThreadId} WHERE id=${foreignConversationJobId}`;
    await writer`UPDATE worker_jobs SET thread_id=${foreignThreadId} WHERE id=${mismatchedThreadJobId}`;
    await writer`UPDATE worker_jobs SET thread_id=${legacyConversationThreadId} WHERE id=${legacyTenantlessConversationJobId}`;
    // Existing writer connection seeds/reassigns fixture rows. Every connection
    // opened by the real read service is enforced read-only by PostgreSQL.
    await writer.unsafe(`ALTER ROLE "${fixture.username}" SET default_transaction_read_only = on`);
    await closeDb();
    process.env.DATABASE_URL = fixture.databaseUrl;
    for (const key of ["PGHOST", "PGPORT", "PGUSER", "PGPASSWORD"]) delete process.env[key];
  }, 60_000);

  beforeEach(async () => {
    await writer`UPDATE worker_jobs SET "requestedByUserId"=${owner.userId}, status='queued', "heartbeatAt"=NULL, "startedAt"=NULL, "finishedAt"=NULL WHERE id=${ids[0]}`;
  });

  afterAll(async () => {
    try {
      await closeDb();
      await writer?.end({ timeout: 2 });
    } finally {
      try {
        if (fixture) {
          await fixture.assertOwned();
          await fixture.close();
          await expect(access(fixture.root)).rejects.toMatchObject({ code: "ENOENT" });
        }
      } finally {
        for (const [key, value] of Object.entries(priorEnv)) {
          if (value === undefined) delete process.env[key]; else process.env[key] = value;
        }
      }
    }
  }, 30_000);

  it("paginates and aggregates the same owner scope without inferring missing Goal or usage", async () => {
    const first = await listTaskObservability({ scope: owner, projectId });
    expect(first.items).toHaveLength(25);
    expect(first.nextCursor).toBeTruthy();
    const second = await listTaskObservability({ scope: owner, projectId, cursor: first.nextCursor, projectionToken: first.snapshot.projectionToken });
    const replay = await listTaskObservability({ scope: owner, projectId, cursor: first.nextCursor, projectionToken: first.snapshot.projectionToken });
    expect(second.items).toEqual(replay.items);
    expect(new Set([...first.items, ...second.items].map(job => job.id))).toEqual(new Set(ids));
    expect(second.nextCursor).toBeNull();
    expect(second.snapshot.asOf).toBe(first.snapshot.asOf);
    const aggregate = await aggregateTaskObservability({ scope: owner, projectId, projectionToken: first.snapshot.projectionToken });
    expect(aggregate.observedJobCount).toBe(30);
    expect(aggregate.goalCoverage.status).toBe("UNKNOWN");
    expect(aggregate.usage.completeTotalTokens).toBeNull();
    expect(aggregate.usage.coverage.status).toBe("PARTIAL");
    const detail = await getTaskObservabilityDetail({ scope: owner, jobId: ids[0]!, projectionToken: first.snapshot.projectionToken });
    expect(detail.acceptance.goal.verifiedPercent).toBeNull();
    expect(detail.projectionSnapshot?.asOf).toBe(first.snapshot.asOf);
  });

  it("denies foreign owner/tenant detail even when a valid snapshot is replayed", async () => {
    const page = await listTaskObservability({ scope: owner });
    for (const jobId of [foreignUserId, foreignTenantId]) {
      await expect(getTaskObservabilityDetail({ scope: owner, jobId, projectionToken: page.snapshot.projectionToken }))
        .rejects.toMatchObject({ code: "TASK_NOT_FOUND" });
    }
    await expect(getTaskObservabilityDetail({ scope: { ...owner, isAdmin: true }, jobId: foreignTenantId }))
      .rejects.toMatchObject({ code: "TASK_NOT_FOUND" });
  });

  it("replays durable harness output by sequence with bounded pages and current Job ownership", async () => {
    const first = await getTaskHarnessOutputEvents({ scope: owner, jobId: ids[0]!, limit: 2 });
    expect(first).toMatchObject({ jobId: ids[0], hasMore: true, nextSequence: 2 });
    expect(first.events.map(event => [event.sequence, event.kind])).toEqual([[1, "assistant_message"], [2, "tool_result"]]);
    expect(first.events[1]?.text).toBe("2 tests passed [redacted]");
    expect(JSON.stringify(first)).not.toContain("do-not-leak");
    expect(JSON.stringify(first)).not.toContain("must not be shown");

    const replay = await getTaskHarnessOutputEvents({ scope: owner, jobId: ids[0]!, limit: 2 });
    expect(replay).toEqual(first);
    const next = await getTaskHarnessOutputEvents({ scope: owner, jobId: ids[0]!, afterSequence: first.nextSequence, limit: 2 });
    expect(next).toMatchObject({ jobId: ids[0], hasMore: false, nextSequence: 4 });
    expect(next.events.map(event => [event.sequence, event.kind, event.text])).toEqual([[3, "final_summary", "Phase 1 complete"]]);
    await expect(getTaskHarnessOutputEvents({ scope: owner, jobId: foreignUserId })).rejects.toMatchObject({ code: "TASK_NOT_FOUND" });
    await expect(getTaskHarnessOutputEvents({ scope: owner, jobId: foreignTenantId })).rejects.toMatchObject({ code: "TASK_NOT_FOUND" });
  });

  it("projects legacy and child-thread jobs into the authorized conversation without leaking another conversation", async () => {
    const page = await listTaskObservability({ scope: owner, conversationId });
    expect(page.items.map(item => item.id)).toContain(threadJobId);
    expect(page.items.map(item => item.id)).toContain(legacyConversationJobId);
    expect(page.items.map(item => item.id)).not.toContain(mismatchedThreadJobId);
    expect(page.items).toHaveLength(2);
    expect(page.items.find(item => item.id === threadJobId)?.threadId).toBe(threadId);
    expect(page.items.find(item => item.id === threadJobId)?.conversationId).toBe(conversationId);
    expect(page.items.find(item => item.id === threadJobId)).toMatchObject({
      conversationTitle: "Authorized thread conversation",
      threadTitle: "Child task",
    });
    expect(page.items.find(item => item.id === legacyConversationJobId)?.conversationId).toBe(conversationId);
    expect(page.items.find(item => item.id === legacyConversationJobId)).toMatchObject({
      conversationTitle: "Authorized thread conversation",
      threadTitle: "Authorized thread conversation",
    });
    const exactJob = await listTaskObservability({ scope: owner, conversationId, threadId, jobId: threadJobId });
    expect(exactJob.items.map(item => item.id)).toEqual([threadJobId]);
    expect(exactJob.items[0]).toMatchObject({ threadTitle: "Child task", conversationTitle: "Authorized thread conversation" });
    await expect(listTaskObservability({ scope: owner, conversationId, threadId, jobId: foreignConversationJobId }))
      .resolves.toMatchObject({ items: [] });
    const mainThread = await listTaskObservability({ scope: owner, conversationId, threadId: null });
    expect(mainThread.items.map(item => item.id)).toEqual([legacyConversationJobId]);
    await expect(listTaskObservability({ scope: owner, conversationId: foreignConversationId }))
      .rejects.toMatchObject({ code: "TASK_NOT_FOUND" });
    await expect(listTaskObservability({ scope: owner, conversationId, threadId: foreignThreadId }))
      .rejects.toMatchObject({ code: "TASK_NOT_FOUND" });
    await expect(listTaskObservability({ scope: owner, threadId }))
      .rejects.toMatchObject({ code: "SCOPE_REQUIRED" });
    await expect(listTaskObservability({ scope: owner, threadId: null }))
      .rejects.toMatchObject({ code: "SCOPE_REQUIRED" });
    const tenantAdminPage = await listTaskObservability({ scope: { ...owner, isAdmin: true } });
    expect(tenantAdminPage.items.find(item => item.id === mismatchedThreadJobId)).toMatchObject({
      conversationId: null,
      conversationTitle: null,
      threadTitle: null,
    });
    const legacyTenantless = await listTaskObservability({ scope: owner, conversationId: legacyTenantlessConversationId });
    expect(legacyTenantless.items.map(item => item.id)).toEqual([legacyTenantlessConversationJobId]);
    expect(legacyTenantless.items[0]?.conversationId).toBe(legacyTenantlessConversationId);
  });

  it("rechecks persisted ownership instead of restoring access from an older snapshot", async () => {
    const page = await listTaskObservability({ scope: owner });
    await getTaskObservabilityDetail({ scope: owner, jobId: ids[0]!, projectionToken: page.snapshot.projectionToken });
    await writer`UPDATE worker_jobs SET "requestedByUserId"=8 WHERE id=${ids[0]}`;
    await expect(getTaskObservabilityDetail({ scope: owner, jobId: ids[0]!, projectionToken: page.snapshot.projectionToken }))
      .rejects.toMatchObject({ code: "TASK_NOT_FOUND" });
    const aggregate = await aggregateTaskObservability({ scope: owner, projectId, projectionToken: page.snapshot.projectionToken });
    expect(aggregate.observedJobCount).toBe(29);
  });

  it("rejects cursor filter changes, cross-principal replay, role downgrade and expiration", async () => {
    const page = await listTaskObservability({ scope: owner, projectId });
    await expect(listTaskObservability({ scope: owner, projectId: "another-project", cursor: page.nextCursor }))
      .rejects.toMatchObject({ code: "SNAPSHOT_INVALID" });
    await expect(listTaskObservability({ scope: { ...owner, userId: 8 }, projectionToken: page.snapshot.projectionToken }))
      .rejects.toMatchObject({ code: "SNAPSHOT_INVALID" });
    const admin = await listTaskObservability({ scope: { ...owner, isAdmin: true } });
    await expect(getTaskObservabilityDetail({ scope: owner, jobId: foreignUserId, projectionToken: admin.snapshot.projectionToken }))
      .rejects.toMatchObject({ code: "SNAPSHOT_INVALID" });
    const expired = encodeProjectionSnapshotToken(owner, page.snapshot.asOf, Date.now() - 1);
    await expect(listTaskObservability({ scope: owner, projectionToken: expired }))
      .rejects.toMatchObject({ code: "SNAPSHOT_EXPIRED" });
  });

  it("reports persisted job activity instead of its creation time while keeping Goal evidence unknown", async () => {
    const page = await listTaskObservability({ scope: owner });
    const heartbeatAt = new Date();
    await writer`UPDATE worker_jobs SET status='running', "heartbeatAt"=${heartbeatAt} WHERE id=${ids[0]}`;
    const active = await getTaskObservabilityDetail({ scope: owner, jobId: ids[0]!, projectionToken: page.snapshot.projectionToken });
    expect(active.updatedAt).toBe(heartbeatAt.toISOString());
    expect(active.projectionSnapshot?.consistency).toBe("created_at_watermark_live_state");
    expect(active.acceptance.goal.verifiedPercent).toBeNull();
    const finishedAt = new Date(heartbeatAt.getTime() + 1);
    await writer`UPDATE worker_jobs SET status='succeeded', "finishedAt"=${finishedAt} WHERE id=${ids[0]}`;
    const finished = await getTaskObservabilityDetail({ scope: owner, jobId: ids[0]! });
    expect(finished.updatedAt).toBe(finishedAt.toISOString());
    expect(finished.acceptance.goal.verifiedPercent).toBeNull();
  });

  it("uses PostgreSQL read-only transactions and leaves jobs, outbox, reservations and settlements unchanged", async () => {
    const counts = () => writer.unsafe(`SELECT
      (SELECT count(*)::int FROM worker_jobs) AS jobs,
      (SELECT count(*)::int FROM worker_job_outbox) AS outbox,
      (SELECT count(*)::int FROM worker_job_provider_reservations) AS reservations,
      (SELECT count(*)::int FROM worker_job_settlements) AS settlements,
      (SELECT count(*)::int FROM economic_events) AS economics`);
    const before = await counts();
    expect((await getDb().execute(drizzleSql`SHOW transaction_read_only`))[0]?.transaction_read_only).toBe("on");
    const page = await listTaskObservability({ scope: owner });
    await Promise.all([
      getTaskObservabilityDetail({ scope: owner, jobId: ids[0]!, projectionToken: page.snapshot.projectionToken }),
      aggregateTaskObservability({ scope: owner, projectId, projectionToken: page.snapshot.projectionToken }),
    ]);
    expect(await counts()).toEqual(before);
  });
});
