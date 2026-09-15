import { createHmac, timingSafeEqual } from "node:crypto";

import { and, asc, count, desc, eq, exists, inArray, isNotNull, lt, not, or } from "drizzle-orm";

import { db } from "../db";
import { workerJobDispatches, workerJobEvents, workerJobSettlements, workerJobs } from "../../drizzle/schema";
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
