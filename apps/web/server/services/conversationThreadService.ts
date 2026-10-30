import { createHmac, timingSafeEqual } from "node:crypto";
import { and, desc, eq, ilike, inArray, isNotNull, isNull, lt, or, sql } from "drizzle-orm";

import { canonicalProjectMemberships, canonicalProjects, conversationThreads, conversations, workerJobs } from "../../drizzle/schema";
import { getDb } from "../db";

export type ConversationThreadStatus =
  | "WORKING"
  | "WAITING_ON_YOU"
  | "READY_FOR_REVIEW"
  | "LANDING"
  | "IDLE"
  | "RESOLVED"
  | "UNKNOWN"
  | "STALE"
  | "UNAVAILABLE"
  | "ERROR";

export class ConversationThreadError extends Error {
  constructor(public readonly code: "CONVERSATION_NOT_FOUND" | "THREAD_NOT_FOUND" | "THREAD_PARENT_INVALID" | "THREAD_SCOPE_MISMATCH" | "THREAD_IDEMPOTENCY_CONFLICT" | "THREAD_CURSOR_INVALID" | "THREAD_CURSOR_EXPIRED") {
    super(code);
    this.name = "ConversationThreadError";
  }
}

const THREAD_PAGE_LIMIT = 30;
const THREAD_SCAN_LIMIT = 100;
const THREAD_CURSOR_TTL_MS = 10 * 60_000;
const THREAD_CURSOR_SECRET = process.env.JWT_SECRET?.trim() ?? "";
type ThreadCursor = {
  v: 1;
  tenantId: string;
  userId: number;
  search: string | null;
  projectId: string | null;
  status: ConversationThreadStatus | null;
  beforeAt: string;
  beforeId: string;
  exp: number;
};

function signThreadCursor(body: string): string {
  if (THREAD_CURSOR_SECRET.length < 32) throw new ConversationThreadError("THREAD_CURSOR_INVALID");
  return createHmac("sha256", THREAD_CURSOR_SECRET).update(body).digest("base64url");
}

function encodeThreadCursor(payload: ThreadCursor): string {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${body}.${signThreadCursor(body)}`;
}

function decodeThreadCursor(token: string, scope: { userId: number; tenantId: string }, filters: {
  search: string | null; projectId: string | null; status: ConversationThreadStatus | null;
}): ThreadCursor {
  const [body, signature, extra] = token.split(".");
  if (!body || !signature || extra) throw new ConversationThreadError("THREAD_CURSOR_INVALID");
  const expected = signThreadCursor(body);
  const suppliedBytes = Buffer.from(signature);
  const expectedBytes = Buffer.from(expected);
  if (suppliedBytes.length !== expectedBytes.length || !timingSafeEqual(suppliedBytes, expectedBytes)) {
    throw new ConversationThreadError("THREAD_CURSOR_INVALID");
  }
  let payload: ThreadCursor;
  try { payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as ThreadCursor; }
  catch { throw new ConversationThreadError("THREAD_CURSOR_INVALID"); }
  if (payload.v !== 1 || payload.userId !== scope.userId || payload.tenantId !== scope.tenantId
    || payload.search !== filters.search || payload.projectId !== filters.projectId || payload.status !== filters.status
    || !Number.isFinite(Date.parse(payload.beforeAt)) || !payload.beforeId) {
    throw new ConversationThreadError("THREAD_CURSOR_INVALID");
  }
  if (!Number.isSafeInteger(payload.exp) || payload.exp <= Date.now()) throw new ConversationThreadError("THREAD_CURSOR_EXPIRED");
  return payload;
}

type ThreadScope = { conversationId: number; userId: number; tenantId: string };
type LatestJob = {
  id: string;
  status: string;
  statusReason: string | null;
  operatorReviewRequired: boolean;
  outputJson?: Record<string, unknown> | null;
  resultRef?: string | null;
  createdAt: Date;
  heartbeatAt: Date | null;
  threadId?: string | null;
};

const ACTIVE_JOB_STATES = new Set([
  "pending", "queued", "leased", "claimed", "preparing", "running",
  "retry_scheduled", "uploading", "indexing",
]);
const LANDING_JOB_STATES = new Set(["publishing", "finalizing", "reconciling"]);

function hasReviewableEvidence(job: LatestJob): boolean {
  if (job.resultRef?.trim()) return true;
  const output = job.outputJson;
  if (!output || typeof output !== "object" || Array.isArray(output)) return false;
  const hasTextResult = [output.result, output.output, output.resultText]
    .some(value => typeof value === "string" && value.trim().length > 0);
  const hasEvidenceRefs = [output.evidenceRefs, output.artifactRefs]
    .some(value => Array.isArray(value) && value.some(ref => typeof ref === "string" && ref.trim().length > 0));
  return hasTextResult || hasEvidenceRefs || (typeof output.artifactRef === "string" && output.artifactRef.trim().length > 0);
}

export function projectConversationThreadStatus(job: LatestJob | null, now = Date.now()): ConversationThreadStatus {
  if (!job) return "IDLE";
  if (job.status === "succeeded" || job.status === "completed") {
    return hasReviewableEvidence(job) ? "READY_FOR_REVIEW" : "UNKNOWN";
  }
  if (job.status === "cancelled" || job.status === "canceled") return "RESOLVED";
  if (["failed", "expired"].includes(job.status)) return "ERROR";
  if (job.status === "waiting_external") return "UNAVAILABLE";
  if (job.operatorReviewRequired || job.status === "waiting_approval") return "WAITING_ON_YOU";
  if (LANDING_JOB_STATES.has(job.status)) return "LANDING";
  if (ACTIVE_JOB_STATES.has(job.status)) {
    const freshnessAt = job.heartbeatAt?.getTime() ?? job.createdAt.getTime();
    return now - freshnessAt > 5 * 60_000 ? "STALE" : "WORKING";
  }
  return "UNKNOWN";
}

async function resolveConversation(scope: ThreadScope) {
  const db = await getDb();
  if (!db) throw new Error("DATABASE_UNAVAILABLE");
  const [conversation] = await db
    .select({ id: conversations.id, tenantId: conversations.tenantId, title: conversations.title, createdAt: conversations.createdAt, updatedAt: conversations.updatedAt })
    .from(conversations)
    .where(and(eq(conversations.id, scope.conversationId), eq(conversations.userId, scope.userId)))
    .limit(1);
  if (!conversation) throw new ConversationThreadError("CONVERSATION_NOT_FOUND");
  if (conversation.tenantId && conversation.tenantId !== scope.tenantId) {
    throw new ConversationThreadError("THREAD_SCOPE_MISMATCH");
  }
  return {
    db,
    conversation,
    tenantId: conversation.tenantId,
    jobTenantId: conversation.tenantId ?? scope.tenantId,
  };
}

function threadTenantCondition(tenantId: string | null) {
  return tenantId === null ? isNull(conversationThreads.tenantId) : eq(conversationThreads.tenantId, tenantId);
}

function latestJobsByThread(rows: LatestJob[]): Map<string, LatestJob> {
  const latest = new Map<string, LatestJob>();
  for (const job of rows) {
    const threadId = job.threadId;
    if (threadId && !latest.has(threadId)) latest.set(threadId, job);
  }
  return latest;
}

function projectThread(thread: typeof conversationThreads.$inferSelect, job: LatestJob | null) {
  const jobAt = job?.heartbeatAt ?? job?.createdAt;
  const lastActivityAt = jobAt && jobAt > thread.lastActivityAt ? jobAt : thread.lastActivityAt;
  return {
    threadId: thread.id,
    parentThreadId: thread.parentThreadId,
    title: thread.title,
    kind: "thread" as const,
    lastActivityAt: lastActivityAt.toISOString(),
    createdAt: thread.createdAt.toISOString(),
    status: projectConversationThreadStatus(job),
    latestJob: job ? {
      jobId: job.id,
      status: job.status,
      statusReason: job.statusReason,
      hasReviewableEvidence: hasReviewableEvidence(job),
      createdAt: job.createdAt.toISOString(),
      heartbeatAt: job.heartbeatAt?.toISOString() ?? null,
    } : null,
  };
}

export function projectTitleForThread(input: { title: string | null; ownerPrincipalId: string | null; memberPrincipalId: string | null; userId: number }): string | null {
  const principalId = `user:${input.userId}`;
  return input.title && (input.ownerPrincipalId === principalId || input.memberPrincipalId === principalId) ? input.title : null;
}

/** Return display names only for active projects the current tenant user can see. */
export async function listVisibleConversationProjectTitles(input: {
  tenantId: string;
  userId: number;
  projectIds: string[];
}): Promise<Map<string, string>> {
  const projectIds = [...new Set(input.projectIds.map(value => value.trim()).filter(value => value && value !== "personal"))].slice(0, 100);
  if (!projectIds.length) return new Map();
  const db = await getDb();
  if (!db) return new Map();
  const rows = await db.select({
    projectId: canonicalProjects.projectId,
    title: canonicalProjects.title,
    ownerPrincipalId: canonicalProjects.ownerPrincipalId,
    memberPrincipalId: canonicalProjectMemberships.principalId,
  }).from(canonicalProjects).leftJoin(canonicalProjectMemberships, and(
    eq(canonicalProjectMemberships.tenantId, canonicalProjects.tenantId),
    eq(canonicalProjectMemberships.projectId, canonicalProjects.projectId),
    eq(canonicalProjectMemberships.principalId, `user:${input.userId}`),
    eq(canonicalProjectMemberships.lifecycle, "ACTIVE"),
  )).where(and(
    eq(canonicalProjects.tenantId, input.tenantId),
    eq(canonicalProjects.lifecycle, "ACTIVE"),
    inArray(canonicalProjects.projectId, projectIds),
    or(eq(canonicalProjects.ownerPrincipalId, `user:${input.userId}`), eq(canonicalProjectMemberships.principalId, `user:${input.userId}`)),
  ));
  const titles = new Map<string, string>();
  for (const row of Array.isArray(rows) ? rows : []) {
    const title = projectTitleForThread({
      title: row.title,
      ownerPrincipalId: row.ownerPrincipalId,
      memberPrincipalId: row.memberPrincipalId,
      userId: input.userId,
    });
    if (title) titles.set(row.projectId, title);
  }
  return titles;
}

/**
 * Returns one virtual legacy/main thread plus durable child threads. Status is
 * a projection of canonical worker_jobs state and is never stored separately.
 */
export async function listConversationThreads(scope: ThreadScope) {
  const { db, conversation, tenantId, jobTenantId } = await resolveConversation(scope);
  const threads = await db
    .select()
    .from(conversationThreads)
    .where(and(
      eq(conversationThreads.conversationId, scope.conversationId),
      eq(conversationThreads.ownerUserId, scope.userId),
      threadTenantCondition(tenantId),
    ))
    .orderBy(desc(conversationThreads.lastActivityAt), desc(conversationThreads.createdAt))
    .limit(100);

  const threadIds = threads.map(thread => thread.id);
  const rankedThreadJobs = threadIds.length
    ? db.$with("ranked_thread_jobs").as(db.select({
        id: workerJobs.id,
        status: workerJobs.status,
        statusReason: workerJobs.statusReason,
        operatorReviewRequired: workerJobs.operatorReviewRequired,
        outputJson: workerJobs.outputJson,
        resultRef: workerJobs.resultRef,
        createdAt: workerJobs.createdAt,
        heartbeatAt: workerJobs.heartbeatAt,
        threadId: workerJobs.threadId,
        rank: sql<number>`row_number() over (partition by ${workerJobs.threadId} order by ${workerJobs.createdAt} desc, ${workerJobs.id} desc)`.as("rank"),
      }).from(workerJobs).where(and(
        eq(workerJobs.tenantId, jobTenantId),
        eq(workerJobs.requestedByUserId, scope.userId),
        inArray(workerJobs.threadId, threadIds),
      )))
    : null;
  const childJobs: LatestJob[] = rankedThreadJobs
    ? await db.with(rankedThreadJobs).select({
      id: rankedThreadJobs.id,
      status: rankedThreadJobs.status,
      statusReason: rankedThreadJobs.statusReason,
      operatorReviewRequired: rankedThreadJobs.operatorReviewRequired,
      outputJson: rankedThreadJobs.outputJson,
      resultRef: rankedThreadJobs.resultRef,
      createdAt: rankedThreadJobs.createdAt,
      heartbeatAt: rankedThreadJobs.heartbeatAt,
      threadId: rankedThreadJobs.threadId,
    }).from(rankedThreadJobs).where(eq(rankedThreadJobs.rank, 1)) as LatestJob[]
    : [];
  const childLatest = latestJobsByThread(childJobs);

  const [mainJob] = await db.select({
    id: workerJobs.id,
    status: workerJobs.status,
    statusReason: workerJobs.statusReason,
    operatorReviewRequired: workerJobs.operatorReviewRequired,
    outputJson: workerJobs.outputJson,
    resultRef: workerJobs.resultRef,
    createdAt: workerJobs.createdAt,
    heartbeatAt: workerJobs.heartbeatAt,
  }).from(workerJobs).where(and(
    eq(workerJobs.tenantId, jobTenantId),
    eq(workerJobs.requestedByUserId, scope.userId),
    isNull(workerJobs.threadId),
    sql`${workerJobs.inputJson}->>'conversationId' = ${String(scope.conversationId)}`,
  )).orderBy(desc(workerJobs.createdAt), desc(workerJobs.id)).limit(1);

  const mainActivityAt = mainJob?.heartbeatAt && mainJob.heartbeatAt > conversation.updatedAt
    ? mainJob.heartbeatAt
    : mainJob?.createdAt && mainJob.createdAt > conversation.updatedAt
      ? mainJob.createdAt
      : conversation.updatedAt;
  const mainThread = {
    threadId: null,
    parentThreadId: null,
    title: "Main chat",
    kind: "main" as const,
    lastActivityAt: mainActivityAt.toISOString(),
    createdAt: conversation.createdAt.toISOString(),
    status: projectConversationThreadStatus(mainJob ?? null),
    latestJob: mainJob ? {
      jobId: mainJob.id,
      status: mainJob.status,
      statusReason: mainJob.statusReason,
      hasReviewableEvidence: hasReviewableEvidence(mainJob),
      createdAt: mainJob.createdAt.toISOString(),
      heartbeatAt: mainJob.heartbeatAt?.toISOString() ?? null,
    } : null,
  };
  return {
    conversationId: scope.conversationId,
    conversationTitle: conversation.title,
    threads: [mainThread, ...threads.map(thread => projectThread(thread, childLatest.get(thread.id) ?? null))]
      .sort((left, right) => right.lastActivityAt.localeCompare(left.lastActivityAt)
        || (left.threadId ?? "").localeCompare(right.threadId ?? "")),
  };
}

/**
 * Owner/tenant scoped cross-conversation Thread overview. The cursor is signed
 * and filter-bound; status remains a projection of the latest canonical Job.
 */
export async function listRecentConversationThreads(input: {
  userId: number;
  tenantId: string;
  cursor?: string | null;
  limit?: number;
  search?: string;
  projectId?: string;
  status?: ConversationThreadStatus;
}) {
  const db = await getDb();
  if (!db) throw new Error("DATABASE_UNAVAILABLE");
  const search = input.search?.trim().slice(0, 100) || null;
  const projectId = input.projectId?.trim().slice(0, 100) || null;
  const status = input.status ?? null;
  const filters = { search, projectId, status };
  const cursor = input.cursor ? decodeThreadCursor(input.cursor, input, filters) : null;
  const limit = Math.max(1, Math.min(input.limit ?? THREAD_PAGE_LIMIT, 50));
  const rankedJobs = db.$with("overview_latest_thread_jobs").as(db.select({
    id: workerJobs.id,
    status: workerJobs.status,
    statusReason: workerJobs.statusReason,
    operatorReviewRequired: workerJobs.operatorReviewRequired,
    outputJson: workerJobs.outputJson,
    resultRef: workerJobs.resultRef,
    createdAt: workerJobs.createdAt,
    heartbeatAt: workerJobs.heartbeatAt,
    threadId: workerJobs.threadId,
    rank: sql<number>`row_number() over (partition by ${workerJobs.threadId} order by ${workerJobs.createdAt} desc, ${workerJobs.id} desc)`.as("rank"),
  }).from(workerJobs).where(and(
    eq(workerJobs.tenantId, input.tenantId),
    eq(workerJobs.requestedByUserId, input.userId),
    isNotNull(workerJobs.threadId),
  )));
  const lastActivity = sql<Date>`greatest(
    ${conversationThreads.lastActivityAt},
    coalesce(${rankedJobs.heartbeatAt}, ${rankedJobs.createdAt}, ${conversationThreads.lastActivityAt})
  )`;
  const predicates = [
    eq(conversationThreads.ownerUserId, input.userId),
    or(isNull(conversationThreads.tenantId), eq(conversationThreads.tenantId, input.tenantId))!,
    eq(conversations.userId, input.userId),
    or(isNull(conversations.tenantId), eq(conversations.tenantId, input.tenantId))!,
    isNull(conversations.trashedAt),
  ];
  if (projectId) predicates.push(eq(conversations.projectId, projectId));
  if (search) predicates.push(or(ilike(conversationThreads.title, `%${search}%`), ilike(conversations.title, `%${search}%`))!);
  if (cursor) predicates.push(or(
    sql`${lastActivity} < ${cursor.beforeAt}::timestamptz`,
    and(sql`${lastActivity} = ${cursor.beforeAt}::timestamptz`, lt(conversationThreads.id, cursor.beforeId))!,
  )!);
  const rawRows = await db.with(rankedJobs).select({
    thread: conversationThreads,
    conversationTitle: conversations.title,
    projectId: conversations.projectId,
    canonicalProjectTitle: canonicalProjects.title,
    canonicalProjectOwner: canonicalProjects.ownerPrincipalId,
    canonicalProjectMember: canonicalProjectMemberships.principalId,
    activityAt: lastActivity,
    latestJob: {
      id: rankedJobs.id,
      status: rankedJobs.status,
      statusReason: rankedJobs.statusReason,
      operatorReviewRequired: rankedJobs.operatorReviewRequired,
      outputJson: rankedJobs.outputJson,
      resultRef: rankedJobs.resultRef,
      createdAt: rankedJobs.createdAt,
      heartbeatAt: rankedJobs.heartbeatAt,
      threadId: rankedJobs.threadId,
    },
  }).from(conversationThreads)
    .innerJoin(conversations, eq(conversations.id, conversationThreads.conversationId))
    .leftJoin(canonicalProjects, and(
      eq(canonicalProjects.projectId, conversations.projectId),
      eq(canonicalProjects.tenantId, input.tenantId),
      eq(canonicalProjects.lifecycle, "ACTIVE"),
    ))
    .leftJoin(canonicalProjectMemberships, and(
      eq(canonicalProjectMemberships.tenantId, canonicalProjects.tenantId),
      eq(canonicalProjectMemberships.projectId, canonicalProjects.projectId),
      eq(canonicalProjectMemberships.principalId, `user:${input.userId}`),
      eq(canonicalProjectMemberships.lifecycle, "ACTIVE"),
    ))
    .leftJoin(rankedJobs, and(
      eq(rankedJobs.threadId, conversationThreads.id),
      eq(rankedJobs.rank, 1),
    ))
    .where(and(...predicates))
    .orderBy(desc(lastActivity), desc(conversationThreads.id))
    .limit(THREAD_SCAN_LIMIT + 1);
  const hasMoreRaw = rawRows.length > THREAD_SCAN_LIMIT;
  const rows = rawRows.slice(0, THREAD_SCAN_LIMIT);
  const projected = rows.map(row => {
    const job: LatestJob | null = row.latestJob?.id ? row.latestJob as LatestJob : null;
    const activityAt = row.activityAt instanceof Date ? row.activityAt : new Date(String(row.activityAt));
    return {
      ...projectThread(row.thread, job),
      lastActivityAt: activityAt.toISOString(),
      conversationId: row.thread.conversationId,
      conversationTitle: row.conversationTitle,
      projectId: row.projectId,
      projectTitle: projectTitleForThread({ title: row.canonicalProjectTitle, ownerPrincipalId: row.canonicalProjectOwner, memberPrincipalId: row.canonicalProjectMember, userId: input.userId }),
      cursorActivityAt: activityAt.toISOString(),
    };
  });
  const matching = status ? projected.filter(item => item.status === status) : projected;
  const items = matching.slice(0, limit).map(({ cursorActivityAt: _cursorActivityAt, ...item }) => item);
  const hasMore = matching.length > limit || hasMoreRaw;
  const anchor = matching.length > limit ? matching[limit - 1] : hasMoreRaw ? projected.at(-1) : undefined;
  return {
    items,
    nextCursor: hasMore && anchor ? encodeThreadCursor({
      v: 1,
      tenantId: input.tenantId,
      userId: input.userId,
      ...filters,
      beforeAt: anchor.cursorActivityAt,
      beforeId: anchor.threadId,
      exp: Date.now() + THREAD_CURSOR_TTL_MS,
    }) : null,
  };
}

export async function assertConversationThreadScope(scope: ThreadScope & { threadId: string }) {
  const { db, tenantId } = await resolveConversation(scope);
  const [thread] = await db.select().from(conversationThreads).where(and(
    eq(conversationThreads.id, scope.threadId),
    eq(conversationThreads.conversationId, scope.conversationId),
    eq(conversationThreads.ownerUserId, scope.userId),
    threadTenantCondition(tenantId),
  )).limit(1);
  if (!thread) throw new ConversationThreadError("THREAD_NOT_FOUND");
  return thread;
}

export async function createConversationThread(input: ThreadScope & {
  idempotencyKey: string;
  title?: string;
  parentThreadId?: string;
}) {
  const { db, tenantId } = await resolveConversation(input);
  if (input.parentThreadId) {
    await assertConversationThreadScope({ ...input, threadId: input.parentThreadId });
  }
  const values = {
    conversationId: input.conversationId,
    tenantId,
    ownerUserId: input.userId,
    parentThreadId: input.parentThreadId ?? null,
    title: input.title?.trim().slice(0, 160) || "New thread",
    idempotencyKey: input.idempotencyKey,
  };
  const result = await db.transaction(async tx => {
    const [created] = await tx.insert(conversationThreads).values(values)
      .onConflictDoNothing({ target: [conversationThreads.conversationId, conversationThreads.ownerUserId, conversationThreads.idempotencyKey] })
      .returning();
    if (created) {
      await tx.update(conversations)
        .set({ updatedAt: new Date() })
        .where(and(eq(conversations.id, input.conversationId), eq(conversations.userId, input.userId)));
      return { row: created, idempotent: false };
    }
    const [existing] = await tx.select().from(conversationThreads).where(and(
      eq(conversationThreads.conversationId, input.conversationId),
      eq(conversationThreads.ownerUserId, input.userId),
      threadTenantCondition(tenantId),
      eq(conversationThreads.idempotencyKey, input.idempotencyKey),
    )).limit(1);
    if (!existing) throw new Error("THREAD_IDEMPOTENCY_RECOVERY_FAILED");
    if (existing.title !== values.title || existing.parentThreadId !== values.parentThreadId) {
      throw new ConversationThreadError("THREAD_IDEMPOTENCY_CONFLICT");
    }
    return { row: existing, idempotent: true };
  });
  return { thread: projectThread(result.row, null), idempotent: result.idempotent };
}

/** Promote a conversation in recent-session navigation when a thread is used. */
export async function touchConversationThread(input: ThreadScope & { threadId?: string | null }) {
  const { db, conversation, tenantId } = await resolveConversation(input);
  if (input.threadId) {
    await assertConversationThreadScope({ ...input, threadId: input.threadId });
  }
  await db.transaction(async tx => {
    await tx.update(conversations)
      .set({ updatedAt: new Date() })
      .where(and(
        eq(conversations.id, input.conversationId),
        eq(conversations.userId, input.userId),
        tenantId === null ? isNull(conversations.tenantId) : eq(conversations.tenantId, tenantId),
      ));
    if (input.threadId) {
      await tx.update(conversationThreads)
        .set({ lastActivityAt: sql`greatest(${conversationThreads.lastActivityAt}, now())` })
        .where(and(
          eq(conversationThreads.id, input.threadId),
          eq(conversationThreads.conversationId, input.conversationId),
          eq(conversationThreads.ownerUserId, input.userId),
          threadTenantCondition(conversation.tenantId),
        ));
    }
  });
}
