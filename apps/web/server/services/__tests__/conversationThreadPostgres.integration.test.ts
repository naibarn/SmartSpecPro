import { randomUUID } from "node:crypto";
import { access } from "node:fs/promises";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { canonicalProjectMemberships, canonicalProjects, conversationThreads, conversations } from "../../../drizzle/schema";
import { closeDb } from "../../db";
import { createSpec277DisposablePostgres } from "./support/spec277DisposablePostgres";
import { installSpec277AutoTeamRuntimeSchema } from "./support/spec277AutoTeamRuntimeSchema";
import {
  createConversationThread,
  listRecentConversationThreads,
  listConversationThreads,
  touchConversationThread,
} from "../conversationThreadService";

/** Real service/query behavior against an owner-marked disposable PostgreSQL cluster. */
describe("conversation thread PostgreSQL integration", () => {
  const priorDatabaseUrl = process.env.DATABASE_URL;
  const tenantId = "thread-tenant-a";
  const ownerUserId = 71;
  const foreignUserId = 72;
  const mainConversationId = 571;
  const foreignConversationId = 572;
  const projectId = randomUUID();
  const busyThreadId = randomUUID();
  const quietThreadId = randomUUID();
  const foreignThreadId = randomUUID();
  let fixture: Awaited<ReturnType<typeof createSpec277DisposablePostgres>>;
  let writer: postgres.Sql;

  beforeAll(async () => {
    if (process.env.DATABASE_URL) throw new Error("CONVERSATION_THREAD_TEST_REFUSES_INHERITED_DATABASE_URL");
    fixture = await createSpec277DisposablePostgres();
    await fixture.assertOwned();
    writer = postgres(fixture.databaseUrl, { max: 1, connect_timeout: 3 });
    await writer.unsafe("CREATE EXTENSION IF NOT EXISTS pgcrypto");
    await installSpec277AutoTeamRuntimeSchema(writer, [canonicalProjects, canonicalProjectMemberships, conversations, conversationThreads]);
    await writer`INSERT INTO canonical_projects (project_id, tenant_id, project_type, title, owner_principal_id, lifecycle)
      VALUES (${projectId}, ${tenantId}, 'PLATFORM_ENGINEERING', 'Authorized Platform Project', ${`user:${ownerUserId}`}, 'ACTIVE')`;
    await writer`INSERT INTO canonical_project_memberships (tenant_id, project_id, principal_id, role, lifecycle)
      VALUES (${tenantId}, ${projectId}, ${`user:${ownerUserId}`}, 'owner', 'ACTIVE')`;
    await writer`INSERT INTO conversations (id, "userId", "tenantId", title, project_id) VALUES
      (${mainConversationId}, ${ownerUserId}, ${tenantId}, 'Thread test conversation', ${projectId}),
      (${foreignConversationId}, ${foreignUserId}, ${tenantId}, 'Foreign conversation', null)`;
    await writer`INSERT INTO conversation_threads
      (id, conversation_id, tenant_id, owner_user_id, title, idempotency_key) VALUES
      (${busyThreadId}, ${mainConversationId}, ${tenantId}, ${ownerUserId}, 'Busy thread', 'seed-busy-thread'),
      (${quietThreadId}, ${mainConversationId}, ${tenantId}, ${ownerUserId}, 'Quiet thread', 'seed-quiet-thread'),
      (${foreignThreadId}, ${foreignConversationId}, ${tenantId}, ${foreignUserId}, 'Foreign thread', 'seed-foreign-thread')`;

    await writer`INSERT INTO worker_jobs
      (id, "tenantId", "requestedByUserId", "runtimeType", "jobType", status,
       "executionClass", "contractVersion", thread_id, "createdAt", "outputJson", "resultRef")
      VALUES (${randomUUID()}, ${tenantId}, ${ownerUserId}, 'node_job_worker', 'test.thread_latest', 'succeeded',
        'long', 'test-only', ${quietThreadId}, now() - interval '1 year', ${{ evidenceRefs: [""] }}, null)`;
    await writer.unsafe(`INSERT INTO worker_jobs
      (id, "tenantId", "requestedByUserId", "runtimeType", "jobType", status,
       "executionClass", "contractVersion", thread_id, "createdAt")
      SELECT gen_random_uuid()::text, $1, $2, 'node_job_worker', 'test.thread_busy', 'queued',
        'long', 'test-only', $3::uuid, now() - make_interval(secs => g)
      FROM generate_series(1, 301) AS g`, [tenantId, ownerUserId, busyThreadId]);
    await writer.unsafe(`ALTER ROLE "${fixture.username}" SET default_transaction_read_only = off`);
    await closeDb();
    process.env.DATABASE_URL = fixture.databaseUrl;
  }, 60_000);

  afterAll(async () => {
    try {
      await closeDb();
      await writer?.end({ timeout: 2 });
    } finally {
      if (fixture) {
        await fixture.assertOwned();
        await fixture.close();
        await expect(access(fixture.root)).rejects.toMatchObject({ code: "ENOENT" });
      }
      if (priorDatabaseUrl === undefined) delete process.env.DATABASE_URL;
      else process.env.DATABASE_URL = priorDatabaseUrl;
    }
  }, 30_000);

  it("returns only the current owner threads and one latest canonical job per thread", async () => {
    const result = await listConversationThreads({ conversationId: mainConversationId, userId: ownerUserId, tenantId });
    expect(result.threads.map(thread => thread.threadId)).toEqual(expect.arrayContaining([null, busyThreadId, quietThreadId]));
    expect(result.threads).toHaveLength(3);
    expect(result.threads.find(thread => thread.threadId === busyThreadId)).toMatchObject({ status: "WORKING" });
    // A nonempty array containing only an empty reference is not review evidence.
    expect(result.threads.find(thread => thread.threadId === quietThreadId)).toMatchObject({ status: "UNKNOWN" });
    await expect(listConversationThreads({ conversationId: mainConversationId, userId: foreignUserId, tenantId }))
      .rejects.toMatchObject({ code: "CONVERSATION_NOT_FOUND" });
  });

  it("creates a child idempotently and rejects changed retries and foreign parents", async () => {
    const request = {
      conversationId: mainConversationId,
      userId: ownerUserId,
      tenantId,
      idempotencyKey: "stable-thread-create-key-001",
      title: "Created thread",
      parentThreadId: busyThreadId,
    };
    const first = await createConversationThread(request);
    const retry = await createConversationThread(request);
    expect(first.idempotent).toBe(false);
    expect(retry).toMatchObject({ idempotent: true, thread: { threadId: first.thread.threadId, parentThreadId: busyThreadId } });
    await expect(createConversationThread({ ...request, title: "Different request under same key" }))
      .rejects.toMatchObject({ code: "THREAD_IDEMPOTENCY_CONFLICT" });
    await expect(createConversationThread({
      ...request,
      idempotencyKey: "foreign-parent-thread-key-002",
      parentThreadId: foreignThreadId,
    })).rejects.toMatchObject({ code: "THREAD_NOT_FOUND" });
  });

  it("pages the owner-scoped cross-conversation overview without leaking foreign threads", async () => {
    // A current canonical job must move a dormant Thread ahead of another
    // Thread whose stored navigation timestamp is newer but whose job is old.
    await writer`UPDATE conversation_threads SET last_activity_at='2024-01-01T00:00:00Z' WHERE conversation_id=${mainConversationId}`;
    await writer`UPDATE conversation_threads SET last_activity_at='2025-01-01T00:00:00Z' WHERE id=${busyThreadId}`;
    await writer`UPDATE conversation_threads SET last_activity_at='2025-01-02T00:00:00Z' WHERE id=${quietThreadId}`;
    const first = await listRecentConversationThreads({ userId: ownerUserId, tenantId, limit: 1 });
    expect(first.items).toHaveLength(1);
    expect(first.items[0].threadId).toBe(busyThreadId);
    expect(Date.parse(first.items[0].lastActivityAt)).toBeGreaterThan(Date.parse("2025-01-02T00:00:00Z"));
    expect(first.nextCursor).toBeTruthy();
    const second = await listRecentConversationThreads({ userId: ownerUserId, tenantId, limit: 1, cursor: first.nextCursor });
    expect(second.items).toHaveLength(1);
    expect(second.items[0].threadId).not.toBe(first.items[0].threadId);
    expect([first.items[0].threadId, second.items[0].threadId]).not.toContain(foreignThreadId);
    expect(first.items[0]).toMatchObject({ conversationId: mainConversationId, conversationTitle: "Thread test conversation" });
    expect(first.items[0].projectTitle).toBe("Authorized Platform Project");
    const working = await listRecentConversationThreads({ userId: ownerUserId, tenantId, status: "WORKING" });
    expect(working.items.some(item => item.threadId === busyThreadId)).toBe(true);
    await expect(listRecentConversationThreads({
      userId: ownerUserId, tenantId, limit: 1, cursor: first.nextCursor, search: "different filter",
    })).rejects.toMatchObject({ code: "THREAD_CURSOR_INVALID" });
    await expect(listRecentConversationThreads({ userId: ownerUserId, tenantId: "thread-tenant-other" })).resolves.toMatchObject({ items: [] });
  });

  it("moves an explicitly reopened thread and its conversation to the recent-session top", async () => {
    const old = new Date("2026-01-01T00:00:00.000Z");
    await writer`UPDATE conversations SET "updatedAt"=${old} WHERE id=${mainConversationId}`;
    await writer`UPDATE conversation_threads SET last_activity_at=${old} WHERE id=${busyThreadId}`;
    await touchConversationThread({ conversationId: mainConversationId, userId: ownerUserId, tenantId, threadId: busyThreadId });
    const [conversation] = await writer`SELECT "updatedAt" FROM conversations WHERE id=${mainConversationId}`;
    const [thread] = await writer`SELECT last_activity_at FROM conversation_threads WHERE id=${busyThreadId}`;
    expect(new Date(conversation.updatedAt).getTime()).toBeGreaterThan(old.getTime());
    expect(new Date(thread.last_activity_at).getTime()).toBeGreaterThan(old.getTime());
    await expect(touchConversationThread({ conversationId: mainConversationId, userId: foreignUserId, tenantId }))
      .rejects.toMatchObject({ code: "CONVERSATION_NOT_FOUND" });
  });
});
