import { and, eq, inArray, isNotNull, lte, sql } from "drizzle-orm";

import { db, getDb } from "../db";
import { workerJobs } from "../../drizzle/schema";
import { createJobControlPlane } from "./jobControlPlane";
import { publishPendingJobOutbox, type JobAdapterResolver } from "./jobOutboxPublisher";
import type { JobTransportAdapter } from "./jobTransportAdapters";

export type JobReconcilerOptions = {
  adapters?: ReadonlyMap<string, JobTransportAdapter>;
  resolveAdapter?: JobAdapterResolver;
  externalWaitInspector?: (input: { jobId: string; operationKey: string; providerReference?: string }) => Promise<"pending" | "succeeded" | "failed" | "unknown">;
  limit?: number;
  now?: Date;
};

export type JobReconcilerResult = {
  expiredScanned: number;
  expiredRecovered: number;
  retriesMadeDue: number;
  outboxResults: number;
  externalWaitsScanned: number;
  externalWaitsRecovered: number;
  deadlinesExpired: number;
  softTimeoutsRequested: number;
  cancelRequestsScanned: number;
  cancelRequestsFinalized: number;
};

/**
 * Bounded, repeatable recovery sweep. PostgreSQL state is authoritative; queue
 * observations are deliberately handled by the outbox publisher only.
 */
export async function runJobReconciler(options: JobReconcilerOptions = {}): Promise<JobReconcilerResult> {
  getDb();
  const now = options.now ?? new Date();
  const limit = Math.max(1, Math.min(options.limit ?? 100, 500));
  const controlPlane = createJobControlPlane();
  const expired = await db.select({ id: workerJobs.id })
    .from(workerJobs)
    .where(and(
      inArray(workerJobs.status, ["running", "waiting_external"] as any),
      isNotNull(workerJobs.leaseExpiresAt),
      lte(workerJobs.leaseExpiresAt, now),
    ))
    .limit(limit);

  let expiredRecovered = 0;
  for (const row of expired) {
    if (await controlPlane.recoverExpiredLease(row.id, now) === "recovered") expiredRecovered += 1;
  }

  const dueRetries = await db.select({ id: workerJobs.id })
    .from(workerJobs)
    .where(and(
      eq(workerJobs.status, "retry_scheduled" as any),
      eq(workerJobs.operatorReviewRequired, false),
      isNotNull(workerJobs.nextRetryAt),
      lte(workerJobs.nextRetryAt, now),
    ))
    .limit(limit);
  let retriesMadeDue = 0;
  for (const row of dueRetries) {
    if (await controlPlane.makeRetryDue(row.id)) retriesMadeDue += 1;
  }

  const cancellationRequests = await db.select({ id: workerJobs.id })
    .from(workerJobs)
    .where(and(
      sql`${workerJobs.statusReason} LIKE 'cancel_requested:%'`,
      sql`${workerJobs.status} NOT IN ('succeeded', 'failed', 'cancelled', 'expired')`,
    ))
    .limit(limit);
  let cancelRequestsFinalized = 0;
  for (const row of cancellationRequests) {
    if (await controlPlane.reconcileCancellationRequest(row.id) === "finalized") cancelRequestsFinalized += 1;
  }

  const deadlineCandidates = await db.select({ id: workerJobs.id })
    .from(workerJobs)
    .where(inArray(workerJobs.status, ["pending", "queued", "leased", "running", "retry_scheduled"] as any))
    .limit(limit);
  let deadlinesExpired = 0;
  for (const row of deadlineCandidates) {
    if (await controlPlane.expireDeadline(row.id, now) === "expired") deadlinesExpired += 1;
  }

  const softTimeoutCandidates = await db.select({ id: workerJobs.id })
    .from(workerJobs)
    .where(eq(workerJobs.status, "running" as any))
    .limit(limit);
  let softTimeoutsRequested = 0;
  for (const row of softTimeoutCandidates) {
    if (await controlPlane.requestSoftTimeout(row.id, now) === "requested") softTimeoutsRequested += 1;
  }

  let externalWaitsScanned = 0;
  let externalWaitsRecovered = 0;
  const externalWaits = await db.select({ id: workerJobs.id, progressJson: workerJobs.progressJson })
    .from(workerJobs)
    .where(eq(workerJobs.status, "waiting_external" as any))
    .limit(limit);
  externalWaitsScanned = externalWaits.length;
  for (const row of externalWaits) {
    const wait = (row.progressJson as { externalWait?: { operationKey?: string; providerReference?: string; resumeAfter?: string } } | null)?.externalWait;
    if (!wait?.operationKey || !wait.resumeAfter || Number.isNaN(Date.parse(wait.resumeAfter)) || Date.parse(wait.resumeAfter) > now.getTime()) continue;
    const observation = options.externalWaitInspector
      ? await options.externalWaitInspector({ jobId: row.id, operationKey: wait.operationKey, providerReference: wait.providerReference })
      : "unknown";
    if (observation === "succeeded") {
        if (await controlPlane.resumeExternal(row.id, "job-reconciler", "reconciler")) externalWaitsRecovered += 1;
    } else if (observation === "failed" || observation === "unknown") {
      if (await controlPlane.failExternalWait(row.id, `provider_external_wait_${observation}`, observation === "unknown", now) === "failed") externalWaitsRecovered += 1;
    }
  }

  const outboxResults = options.adapters
    ? (await publishPendingJobOutbox(options.adapters, limit, now, options.resolveAdapter)).length
    : 0;
  return {
    expiredScanned: expired.length,
    expiredRecovered,
    retriesMadeDue,
    outboxResults,
    externalWaitsScanned,
    externalWaitsRecovered,
    deadlinesExpired,
    softTimeoutsRequested,
    cancelRequestsScanned: cancellationRequests.length,
    cancelRequestsFinalized,
  };
}
