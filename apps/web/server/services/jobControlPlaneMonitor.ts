import { createHmac, timingSafeEqual } from "node:crypto";

import { and, asc, count, desc, eq, exists, inArray, isNotNull, isNull, lt, not, or, sql } from "drizzle-orm";

import { db } from "../db";
import { workerHeartbeats, workerJobDispatches, workerJobEvents, workerJobOutbox, workerJobSettlements, workerJobs, workers } from "../../drizzle/schema";
import { redactJobPayload } from "./jobCanonicalization";
import { canonicalizeStoredStatus, compatibilityStatus, createJobControlPlane } from "./jobControlPlane";
import type { JobMutationScope } from "./jobControlPlane";
import { JobControlPlaneError } from "./jobControlPlaneTypes";

const TERMINAL = ["succeeded", "failed", "cancelled", "expired"] as const;
const STORED_STATUS_BY_CANONICAL: Record<string, string[]> = {
  pending: ["pending"],
  queued: ["queued"],
  leased: ["leased", "claimed"],
  running: ["running", "preparing", "uploading", "publishing", "indexing"],
  waiting_external: ["waiting_external"],
  retry_scheduled: ["retry_scheduled"],
  succeeded: ["succeeded", "completed"],
  failed: ["failed"],
  cancelled: ["cancelled", "canceled"],
  expired: ["expired"],
};

function storedStatusesForMonitorFilter(status: string): string[] {
  return STORED_STATUS_BY_CANONICAL[status] ?? [status];
}

export type JobMonitorFilter = {
  tenantId?: string;
  status?: string;
  jobType?: string;
  executionClass?: string;
  adapter?: string;
  stale?: boolean;
  limit: number;
  before?: Date;
  beforeCursor?: string;
};

export type JobMonitorCursor = { createdAt: string; jobId: string };

function monitorCursorSecret(): string {
  const configured = process.env.FEATURE_186_MONITOR_CURSOR_SECRET;
  if (!configured && process.env.NODE_ENV === "production") throw new Error("FEATURE_186_MONITOR_CURSOR_SECRET_REQUIRED");
  return configured ?? "feature-186-monitor-cursor-development-secret";
}

export function encodeJobMonitorCursor(cursor: JobMonitorCursor): string {
  const payload = Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");
  const signature = createHmac("sha256", monitorCursorSecret()).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

export function decodeJobMonitorCursor(value: string): JobMonitorCursor {
  try {
    const parts = value.split(".");
    if (parts.length !== 2) throw new Error("invalid");
    const [payload, signature] = parts;
    if (!payload || !signature) throw new Error("invalid");
    const expected = createHmac("sha256", monitorCursorSecret()).update(payload).digest();
    const supplied = Buffer.from(signature, "base64url");
    if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) throw new Error("invalid");
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as Partial<JobMonitorCursor>;
    if (typeof parsed.createdAt !== "string" || Number.isNaN(Date.parse(parsed.createdAt)) || typeof parsed.jobId !== "string" || !parsed.jobId) {
      throw new Error("invalid");
    }
    return { createdAt: new Date(parsed.createdAt).toISOString(), jobId: parsed.jobId };
  } catch {
    throw new Error("JOB_MONITOR_CURSOR_INVALID");
  }
}

export async function listCanonicalJobs(filter: JobMonitorFilter) {
  const conditions = [] as any[];
  if (filter.tenantId) conditions.push(eq(workerJobs.tenantId, filter.tenantId));
  if (filter.status) conditions.push(inArray(workerJobs.status, storedStatusesForMonitorFilter(filter.status) as any));
  if (filter.jobType) conditions.push(eq(workerJobs.jobType, filter.jobType));
  if (filter.executionClass) conditions.push(eq(workerJobs.executionClass, filter.executionClass));
  if (filter.adapter) conditions.push(exists(db.select({ id: workerJobDispatches.id }).from(workerJobDispatches).where(and(eq(workerJobDispatches.workerJobId, workerJobs.id), eq(workerJobDispatches.adapter, filter.adapter)))));
  if (filter.stale) conditions.push(
    inArray(workerJobs.status, [
      "leased", "claimed", "running", "preparing", "uploading", "publishing", "indexing", "waiting_external",
    ] as any),
    isNotNull(workerJobs.leaseExpiresAt),
    lt(workerJobs.leaseExpiresAt, new Date()),
  );
  if (filter.before) conditions.push(lt(workerJobs.createdAt, filter.before));
  if (filter.beforeCursor) {
    const cursor = decodeJobMonitorCursor(filter.beforeCursor);
    const cursorDate = new Date(cursor.createdAt);
    conditions.push(or(
      lt(workerJobs.createdAt, cursorDate),
      and(eq(workerJobs.createdAt, cursorDate), lt(workerJobs.id, cursor.jobId)),
    ));
  }
  const rows = await db.select({
    jobId: workerJobs.id,
    tenantId: workerJobs.tenantId,
    requestedByUserId: workerJobs.requestedByUserId,
    jobType: workerJobs.jobType,
    executionClass: workerJobs.executionClass,
    status: workerJobs.status,
    statusReason: workerJobs.statusReason,
    attempt: workerJobs.attempt,
    maxAttempts: workerJobs.maxAttempts,
    fencingVersion: workerJobs.fencingVersion,
    heartbeatAt: workerJobs.heartbeatAt,
    leaseExpiresAt: workerJobs.leaseExpiresAt,
    nextRetryAt: workerJobs.nextRetryAt,
    operatorReviewRequired: workerJobs.operatorReviewRequired,
    createdAt: workerJobs.createdAt,
    startedAt: workerJobs.startedAt,
    finishedAt: workerJobs.finishedAt,
  }).from(workerJobs).where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(workerJobs.createdAt), desc(workerJobs.id)).limit(Math.max(1, Math.min(filter.limit, 100)));
  return rows.map(row => ({
    ...row,
    canonicalStatus: canonicalizeStoredStatus(row.status),
    compatibilityStatus: compatibilityStatus(row.status),
    stale: Boolean(row.leaseExpiresAt && row.leaseExpiresAt.getTime() <= Date.now() && [
      "leased", "running", "waiting_external",
    ].includes(canonicalizeStoredStatus(row.status))),
  }));
}

export async function getCanonicalJobTimeline(jobId: string, limit = 200) {
  const rows = await db.select({
    id: workerJobEvents.id,
    eventSequence: workerJobEvents.eventSequence,
    eventType: workerJobEvents.eventType,
    attemptId: workerJobEvents.attemptId,
    payloadJson: workerJobEvents.payloadJson,
    createdAt: workerJobEvents.createdAt,
  }).from(workerJobEvents).where(eq(workerJobEvents.workerJobId, jobId))
    .orderBy(asc(workerJobEvents.eventSequence), asc(workerJobEvents.createdAt), asc(workerJobEvents.id)).limit(Math.max(1, Math.min(limit, 500)));
  return rows.map((row: { payloadJson: Record<string, unknown> | null }) => ({
    ...row,
    payloadJson: redactJobPayload(row.payloadJson ?? {}) as Record<string, unknown>,
  }));
}

export async function getCanonicalJobOverview(tenantId?: string) {
  const scope = tenantId ? eq(workerJobs.tenantId, tenantId) : undefined;
  const grouped = await db.select({ status: workerJobs.status, total: count() })
    .from(workerJobs)
    .where(scope)
    .groupBy(workerJobs.status);
  const staleConditions = [
    inArray(workerJobs.status, [
      "leased", "claimed", "running", "preparing", "uploading", "publishing", "indexing", "waiting_external",
    ] as any),
    isNotNull(workerJobs.leaseExpiresAt),
    lt(workerJobs.leaseExpiresAt, new Date()),
  ];
  if (scope) staleConditions.push(scope);
  const [stale] = await db.select({ total: count() }).from(workerJobs).where(and(...staleConditions));
  const unsettledConditions = [
    inArray(workerJobs.status, ["succeeded", "completed"] as any),
    not(exists(db.select({ id: workerJobSettlements.id }).from(workerJobSettlements).where(eq(workerJobSettlements.workerJobId, workerJobs.id)))),
  ];
  if (scope) unsettledConditions.push(scope);
  const [terminalUnsettled] = await db.select({ total: count() }).from(workerJobs).where(and(...unsettledConditions));
  const canonicalCounts = new Map<string, number>();
  for (const row of grouped as Array<{ status: string | null; total: unknown }>) {
    const canonical = canonicalizeStoredStatus(row.status ?? "unknown");
    canonicalCounts.set(canonical, (canonicalCounts.get(canonical) ?? 0) + Number(row.total));
  }
  return {
    counts: Object.fromEntries(canonicalCounts),
    stale: Number(stale?.total ?? 0),
    terminalUnsettled: Number(terminalUnsettled?.total ?? 0),
  };
}

const DASHBOARD_EXECUTING_STATUSES = [
  "leased", "claimed", "preparing", "running",
  "uploading", "publishing", "indexing",
] as const;

const DASHBOARD_OPEN_STORED_STATUSES = [
  "pending", "queued", "retry_scheduled", ...DASHBOARD_EXECUTING_STATUSES,
  "waiting_external",
] as const;

type DashboardHeartbeatRow = {
  workerId: string;
  status: typeof workerHeartbeats.$inferSelect.status;
  currentJobCount: number;
  queueDepth: number;
  metricsJson: Record<string, unknown>;
  createdAt: Date;
};

/**
 * Load only the newest heartbeat for each worker. The heartbeat table is an
 * append-only stream, so selecting every historical row before reducing it in
 * memory makes the dashboard progressively slower as the fleet runs longer.
 * The worker/createdAt index makes one bounded lookup per registered worker.
 */
export async function getLatestWorkerHeartbeats(workerIds: string[]): Promise<DashboardHeartbeatRow[]> {
  const rows: DashboardHeartbeatRow[] = [];
  for (const workerId of workerIds) {
    const [row] = await db.select({
      workerId: workerHeartbeats.workerId,
      status: workerHeartbeats.status,
      currentJobCount: workerHeartbeats.currentJobCount,
      queueDepth: workerHeartbeats.queueDepth,
      metricsJson: workerHeartbeats.metricsJson,
      createdAt: workerHeartbeats.createdAt,
    })
      .from(workerHeartbeats)
      .where(eq(workerHeartbeats.workerId, workerId))
      .orderBy(desc(workerHeartbeats.createdAt))
      .limit(1);
    if (row) rows.push(row);
  }
  return rows;
}

function readNumericMetric(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? Math.trunc(value)
    : null;
}

type WorkerSlotCapacity = { slots: number; source: string };

function readWorkerSlotCapacity(value: unknown, path = "worker"): WorkerSlotCapacity | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  for (const key of ["maxConcurrentJobs", "maxConcurrency", "concurrency", "maxSlots", "slots", "capacity"]) {
    const direct = readNumericMetric(record[key]);
    if (direct != null && direct > 0) return { slots: direct, source: `${path}.${key}` };
  }
  for (const key of ["runtimeMetadata", "executorCapabilityProfile", "capacity"]) {
    const nested = record[key];
    if (nested && nested !== value) {
      const result = readWorkerSlotCapacity(nested, `${path}.${key}`);
      if (result) return result;
    }
  }
  return null;
}

/**
 * Dashboard-safe projection of the canonical worker_jobs control plane.
 * This deliberately avoids Redis/Celery counters so the dashboard reports the
 * durable admission, outbox, lease, and worker-heartbeat state that operators
 * can reconcile after a restart.
 */
export async function getWorkerJobDashboardSummary(input: {
  tenantId?: string;
  userId?: number;
} = {}) {
  const jobConditions: any[] = [];
  if (input.tenantId) jobConditions.push(eq(workerJobs.tenantId, input.tenantId));
  if (input.userId) jobConditions.push(eq(workerJobs.requestedByUserId, input.userId));
  const jobScope = jobConditions.length ? and(...jobConditions) : undefined;

  const outboxScopeConditions: any[] = [];
  if (input.tenantId) outboxScopeConditions.push(eq(workerJobs.tenantId, input.tenantId));
  if (input.userId) outboxScopeConditions.push(eq(workerJobs.requestedByUserId, input.userId));
  const outboxScope = outboxScopeConditions.length ? and(...outboxScopeConditions) : undefined;
  const scopedOutboxCondition = (extra: any) => outboxScope ? and(extra, outboxScope) : extra;
  // The user dashboard only renders personal job counts/recent jobs. Capacity
  // and heartbeat data belongs to the admin monitor, so avoid querying the
  // entire tenant worker fleet for every signed-in user.
  const includeCapacity = !input.userId;
  const now = new Date();
  const [grouped, staleRows, recentJobs, openJobRows, oldestQueuedRows, pendingOutbox, failedOutbox, quarantinedOutbox, workersRows, assignedActiveRows] = await Promise.all([
    db.select({ status: workerJobs.status, total: count() })
      .from(workerJobs).where(jobScope).groupBy(workerJobs.status),
    db.select({ total: count() }).from(workerJobs).where(and(
      ...(jobConditions.length ? jobConditions : []),
      inArray(workerJobs.status, ["leased", "claimed", "running", "preparing", "uploading", "publishing", "indexing", "waiting_external"] as any),
      isNotNull(workerJobs.leaseExpiresAt),
      lt(workerJobs.leaseExpiresAt, now),
    )),
    db.select({
      jobId: workerJobs.id,
      jobType: workerJobs.jobType,
      status: workerJobs.status,
      executionClass: workerJobs.executionClass,
      runtimeType: workerJobs.runtimeType,
      priority: workerJobs.priority,
      createdAt: workerJobs.createdAt,
      startedAt: workerJobs.startedAt,
      heartbeatAt: workerJobs.heartbeatAt,
      workerId: workerJobs.workerId,
      failureReason: workerJobs.failureReason,
    }).from(workerJobs).where(jobScope).orderBy(desc(workerJobs.createdAt)).limit(8),
    db.select({
      jobId: workerJobs.id,
      jobType: workerJobs.jobType,
      status: workerJobs.status,
      statusReason: workerJobs.statusReason,
      workerId: workerJobs.workerId,
      createdAt: workerJobs.createdAt,
      startedAt: workerJobs.startedAt,
      heartbeatAt: workerJobs.heartbeatAt,
      leaseExpiresAt: workerJobs.leaseExpiresAt,
      nextRetryAt: workerJobs.nextRetryAt,
    }).from(workerJobs).where(and(
      ...(jobConditions.length ? jobConditions : []),
      inArray(workerJobs.status, DASHBOARD_OPEN_STORED_STATUSES as any),
    )).orderBy(asc(workerJobs.createdAt), asc(workerJobs.id)).limit(50),
    db.select({ createdAt: workerJobs.createdAt }).from(workerJobs).where(and(
      ...(jobConditions.length ? jobConditions : []),
      inArray(workerJobs.status, ["pending", "queued"] as any),
    )).orderBy(asc(workerJobs.createdAt)).limit(1),
    db.select({ total: count(), oldestAt: sql`min(${workerJobOutbox.createdAt})` })
      .from(workerJobOutbox).innerJoin(workerJobs, eq(workerJobs.id, workerJobOutbox.workerJobId))
      .where(scopedOutboxCondition(and(isNull(workerJobOutbox.publishedAt), isNull(workerJobOutbox.cancelledAt), isNull(workerJobOutbox.quarantinedAt)))),
    db.select({ total: count() }).from(workerJobOutbox).innerJoin(workerJobs, eq(workerJobs.id, workerJobOutbox.workerJobId))
      .where(scopedOutboxCondition(and(isNull(workerJobOutbox.publishedAt), isNotNull(workerJobOutbox.failedReason)))),
    db.select({ total: count() }).from(workerJobOutbox).innerJoin(workerJobs, eq(workerJobs.id, workerJobOutbox.workerJobId))
      .where(scopedOutboxCondition(isNotNull(workerJobOutbox.quarantinedAt))),
    includeCapacity ? db.select({
      id: workers.id,
      displayName: workers.displayName,
      runtimeType: workers.runtimeType,
      status: workers.status,
      lastSeenAt: workers.lastSeenAt,
      capabilitiesJson: workers.capabilitiesJson,
      healthSummaryJson: workers.healthSummaryJson,
    }).from(workers).where(input.tenantId ? eq(workers.tenantId, input.tenantId) : undefined) : Promise.resolve([]),
    includeCapacity ? db.select({ workerId: workerJobs.workerId, total: count() })
      .from(workerJobs)
      .where(and(
        ...(jobConditions.length ? jobConditions : []),
        isNotNull(workerJobs.workerId),
        inArray(workerJobs.status, DASHBOARD_EXECUTING_STATUSES as any),
      ))
      .groupBy(workerJobs.workerId) : Promise.resolve([]),
  ]);

  const counts = new Map<string, number>();
  for (const row of grouped as Array<{ status: string | null; total: unknown }>) {
    const canonical = canonicalizeStoredStatus(row.status ?? "unknown");
    counts.set(canonical, (counts.get(canonical) ?? 0) + Number(row.total));
  }
  const queued = counts.get("queued") ?? 0;
  const active = DASHBOARD_EXECUTING_STATUSES.reduce((sum, status) => sum + (counts.get(canonicalizeStoredStatus(status)) ?? 0), 0);
  const stale = Number(staleRows[0]?.total ?? 0);
  const assignedActiveByWorker = new Map(
    assignedActiveRows.map(row => [row.workerId, Number(row.total ?? 0)]),
  );

  const workerIds = workersRows.map(row => row.id);
  const heartbeatRows = workerIds.length ? await getLatestWorkerHeartbeats(workerIds) : [];
  const latestHeartbeats = new Map<string, (typeof heartbeatRows)[number]>();
  for (const heartbeat of heartbeatRows) if (!latestHeartbeats.has(heartbeat.workerId)) latestHeartbeats.set(heartbeat.workerId, heartbeat);

  let workersOnline = 0;
  let workersUnhealthy = 0;
  let workersStale = 0;
  let totalSlots = 0;
  let usedSlots = 0;
  let unknownCapacityWorkers = 0;
  let workerQueueDepth = 0;
  const slotSources = [] as Array<{
    workerId: string;
    displayName: string;
    runtimeType: string;
    workerStatus: string;
    heartbeatStatus: string | null;
    lastSeenAt: string | null;
    heartbeatAt: string | null;
    eligible: boolean;
    stale: boolean;
    capacity: number | null;
    capacitySource: string | null;
    assignedJobCount: number;
    reportedJobCount: number | null;
    usedSlots: number | null;
    freeSlots: number | null;
    queueDepth: number;
  }>;
  for (const worker of workersRows) {
    const heartbeat = latestHeartbeats.get(worker.id);
    const lastSeenMs = Math.max(worker.lastSeenAt?.getTime() ?? 0, heartbeat?.createdAt.getTime() ?? 0);
    const isStale = !lastSeenMs || now.getTime() - lastSeenMs > 120_000;
    if (isStale) workersStale += 1;
    if (worker.status === "online" && !isStale) workersOnline += 1;
    if (worker.status === "unhealthy") workersUnhealthy += 1;
    const capacityInfo = readWorkerSlotCapacity(heartbeat?.metricsJson, "heartbeat.metricsJson")
      ?? readWorkerSlotCapacity(worker.capabilitiesJson, "worker.capabilitiesJson")
      ?? readWorkerSlotCapacity(worker.healthSummaryJson, "worker.healthSummaryJson");
    const capacity = capacityInfo?.slots ?? null;
    const eligible = worker.status === "online" && !isStale;
    const assignedJobCount = assignedActiveByWorker.get(worker.id) ?? 0;
    const reportedJobCount = heartbeat?.currentJobCount ?? null;
    const observedUsedSlots = eligible
      ? Math.max(assignedJobCount, reportedJobCount ?? 0)
      : null;
    const freeWorkerSlots = eligible && capacity != null && observedUsedSlots != null
      ? Math.max(0, capacity - Math.min(capacity, observedUsedSlots))
      : null;
    if (eligible && capacity == null) unknownCapacityWorkers += 1;
    if (eligible && capacity != null && observedUsedSlots != null) {
      totalSlots += capacity;
      usedSlots += Math.min(capacity, observedUsedSlots);
    }
    if (eligible) workerQueueDepth += Math.max(0, heartbeat?.queueDepth ?? 0);
    slotSources.push({
      workerId: worker.id,
      displayName: worker.displayName,
      runtimeType: worker.runtimeType,
      workerStatus: worker.status,
      heartbeatStatus: heartbeat?.status ?? null,
      lastSeenAt: worker.lastSeenAt?.toISOString() ?? null,
      heartbeatAt: heartbeat?.createdAt?.toISOString() ?? null,
      eligible,
      stale: isStale,
      capacity,
      capacitySource: capacityInfo?.source ?? null,
      assignedJobCount,
      reportedJobCount,
      usedSlots: observedUsedSlots,
      freeSlots: freeWorkerSlots,
      queueDepth: Math.max(0, heartbeat?.queueDepth ?? 0),
    });
  }
  const capacityKnown = unknownCapacityWorkers === 0;

  const oldestOutboxValue = pendingOutbox[0]?.oldestAt;
  const oldestOutboxCandidate = oldestOutboxValue instanceof Date
    ? oldestOutboxValue
    : oldestOutboxValue
      ? new Date(String(oldestOutboxValue))
      : null;
  const oldestOutboxAt = oldestOutboxCandidate && !Number.isNaN(oldestOutboxCandidate.getTime())
    ? oldestOutboxCandidate
    : null;
  const oldestQueuedAt = oldestQueuedRows[0]?.createdAt ?? null;
  const ageSeconds = (value: Date | null) => value ? Math.max(0, Math.floor((now.getTime() - value.getTime()) / 1000)) : 0;
  return {
    generatedAt: now.toISOString(),
    scope: input.userId ? "user" as const : input.tenantId ? "tenant" as const : "global" as const,
    counts: {
      pending: counts.get("pending") ?? 0,
      queued,
      running: counts.get("running") ?? 0,
      waitingExternal: counts.get("waiting_external") ?? 0,
      retryScheduled: counts.get("retry_scheduled") ?? 0,
      succeeded: counts.get("succeeded") ?? 0,
      failed: counts.get("failed") ?? 0,
      canceled: counts.get("cancelled") ?? counts.get("canceled") ?? 0,
      expired: counts.get("expired") ?? 0,
      active,
      stale,
      executingByStatus: Object.fromEntries(
        DASHBOARD_EXECUTING_STATUSES.map(status => [status, counts.get(canonicalizeStoredStatus(status)) ?? 0]),
      ),
    },
    capacity: {
      workersTotal: workersRows.length,
      workersOnline,
      workersUnhealthy,
      workersStale,
      totalSlots,
      usedSlots,
      freeSlots: Math.max(0, totalSlots - usedSlots),
      queueDepth: workerQueueDepth,
      capacityKnown,
      unknownCapacityWorkers,
      slotSources,
    },
    outbox: {
      pending: Number(pendingOutbox[0]?.total ?? 0),
      failed: Number(failedOutbox[0]?.total ?? 0),
      quarantined: Number(quarantinedOutbox[0]?.total ?? 0),
      oldestPendingAt: oldestOutboxAt?.toISOString() ?? null,
      oldestPendingAgeSeconds: ageSeconds(oldestOutboxAt),
    },
    backlog: {
      oldestQueuedAt: oldestQueuedAt?.toISOString() ?? null,
      oldestQueuedAgeSeconds: ageSeconds(oldestQueuedAt),
    },
    alerts: {
      hasIncident: stale > 0 || (counts.get("waiting_external") ?? 0) > 0 || Number(failedOutbox[0]?.total ?? 0) > 0 || Number(quarantinedOutbox[0]?.total ?? 0) > 0 || workersUnhealthy > 0,
      capacityExhausted: totalSlots > 0 && usedSlots >= totalSlots && (queued > 0 || (counts.get("pending") ?? 0) > 0),
      capacityUnknown: unknownCapacityWorkers > 0,
    },
    openJobs: openJobRows.map(job => ({
      id: job.jobId,
      jobType: job.jobType,
      status: canonicalizeStoredStatus(job.status),
      statusReason: job.statusReason,
      workerId: job.workerId,
      createdAt: job.createdAt.toISOString(),
      startedAt: job.startedAt?.toISOString() ?? null,
      heartbeatAt: job.heartbeatAt?.toISOString() ?? null,
      leaseExpiresAt: job.leaseExpiresAt?.toISOString() ?? null,
      nextRetryAt: job.nextRetryAt?.toISOString() ?? null,
      ageSeconds: Math.max(0, Math.floor((now.getTime() - job.createdAt.getTime()) / 1000)),
    })),
    recentJobs: recentJobs.map(job => ({
      id: job.jobId,
      jobType: job.jobType,
      status: canonicalizeStoredStatus(job.status),
      executionClass: job.executionClass,
      runtimeType: job.runtimeType,
      priority: job.priority,
      createdAt: job.createdAt.toISOString(),
      startedAt: job.startedAt?.toISOString() ?? null,
      heartbeatAt: job.heartbeatAt?.toISOString() ?? null,
      workerId: job.workerId,
      failureReason: job.failureReason,
    })),
  };
}

export async function applyCanonicalJobAction(input: {
  jobId: string;
  action: "cancel" | "requeue" | "force_fail";
  reason: string;
  actionId: string;
  actorId?: number;
  scope?: JobMutationScope;
}) {
  const controlPlane = createJobControlPlane();
  if (input.action === "cancel") await controlPlane.cancel(input.jobId, input.reason, input.actionId, input.actorId, input.scope);
  else if (input.action === "requeue") {
    const accepted = await controlPlane.makeRetryDue(input.jobId, input.actionId, input.actorId, input.reason, input.scope);
    if (!accepted) throw new JobControlPlaneError("JOB_STATE_CONFLICT", "Job cannot be requeued in its current state");
  }
  else await controlPlane.forceFail(input.jobId, input.reason, input.actionId, input.actorId, input.scope);
  return { jobId: input.jobId, action: input.action, accepted: true };
}

export function isTerminalCanonicalStatus(status: string): boolean {
  return (TERMINAL as readonly string[]).includes(status);
}
