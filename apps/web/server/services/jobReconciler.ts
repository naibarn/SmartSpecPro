import { and, eq, inArray, isNotNull, lte, sql } from "drizzle-orm";

import { db, getDb } from "../db";
import { storyboardSkillRuns, workerJobs } from "../../drizzle/schema";
import { createJobControlPlane } from "./jobControlPlane";
import { classifyWaitingExternal, type WaitingExternalDecision } from "./jobReconciliationPolicy";
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
  waitingDecisionsScanned: number;
  waitingCancelled: number;
  waitingResumed: number;
  waitingFailedForReview: number;
  waitingHeld: number;
  waitingPending: number;
  reconciliationErrors: number;
  decisions: Array<{
    jobId: string;
    action: WaitingExternalDecision["action"];
    reasonCode: string;
  }>;
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
      inArray(workerJobs.status, ["leased", "running", "waiting_external"] as any),
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
  let waitingCancelled = 0;
  let waitingResumed = 0;
  let waitingFailedForReview = 0;
  let waitingHeld = 0;
  let waitingPending = 0;
  let reconciliationErrors = 0;
  const decisions: JobReconcilerResult["decisions"] = [];
  const externalWaits = await db.select({ id: workerJobs.id, jobType: workerJobs.jobType, inputJson: workerJobs.inputJson, progressJson: workerJobs.progressJson })
    .from(workerJobs)
    .where(eq(workerJobs.status, "waiting_external" as any))
    .limit(limit);
  externalWaitsScanned = externalWaits.length;

  const storyboardRunIds = externalWaits
    .filter(row => row.jobType === "storyboard.skill.run")
    .map(row => typeof row.inputJson?.runId === "string" ? row.inputJson.runId : null)
    .filter((value): value is string => Boolean(value));
  const storyboardRuns = storyboardRunIds.length > 0
    ? await db.select({ id: storyboardSkillRuns.id, status: storyboardSkillRuns.status })
      .from(storyboardSkillRuns)
      .where(inArray(storyboardSkillRuns.id, storyboardRunIds))
    : [];
  const storyboardRunStatus = new Map(storyboardRuns.map(row => [row.id, row.status]));

  for (const row of externalWaits) {
    const wait = (row.progressJson as { externalWait?: { operationKey?: string; providerReference?: string; resumeAfter?: string } } | null)?.externalWait;
    if (!wait?.operationKey) {
      const decision: WaitingExternalDecision = {
        action: "fail_review",
        reasonCode: "external_wait_metadata_missing",
        explanation: "The job is waiting without a durable operation key.",
        operatorReviewRequired: true,
      };
      decisions.push({ jobId: row.id, action: decision.action, reasonCode: decision.reasonCode });
      await controlPlane.forceFail(row.id, decision.explanation, `reconcile:fail:${row.id}:${decision.reasonCode}`);
      waitingFailedForReview += 1;
      await controlPlane.recordReconciliation({ jobId: row.id, ...decision, evidence: { status: "waiting_external" } });
      continue;
    }

    const runId = row.jobType === "storyboard.skill.run" && typeof row.inputJson?.runId === "string"
      ? row.inputJson.runId
      : null;
    const decision = classifyWaitingExternal({
      operationKey: wait.operationKey,
      runStatus: runId ? storyboardRunStatus.get(runId) ?? null : null,
      providerReference: wait.providerReference ?? null,
      resumeAfter: wait.resumeAfter ?? null,
      now,
    });
    decisions.push({ jobId: row.id, action: decision.action, reasonCode: decision.reasonCode });

    try {
      if (decision.action === "cancel") {
        await controlPlane.cancel(row.id, decision.reasonCode, `reconcile:cancel:${row.id}:${decision.reasonCode}`);
        waitingCancelled += 1;
      } else if (decision.action === "resume") {
        if (await controlPlane.resumeExternal(row.id, "job-reconciler", "postgres-pull", undefined, `reconcile:${decision.reasonCode}`)) {
          externalWaitsRecovered += 1;
          waitingResumed += 1;
        }
      } else if (decision.action === "fail_review") {
        let observation: "pending" | "succeeded" | "failed" | "unknown" = "unknown";
        if (!wait.operationKey.startsWith("storyboard.pause:")) {
          observation = options.externalWaitInspector
            ? await options.externalWaitInspector({ jobId: row.id, operationKey: wait.operationKey, providerReference: wait.providerReference })
            : "unknown";
        }
        if (observation === "succeeded") {
          if (await controlPlane.resumeExternal(row.id, "job-reconciler", "postgres-pull", undefined, `reconcile:${decision.reasonCode}`)) {
            externalWaitsRecovered += 1;
            waitingResumed += 1;
          }
        } else if (observation !== "pending") {
          if (await controlPlane.failExternalWait(row.id, decision.reasonCode, true, now, wait.operationKey) === "failed") {
            externalWaitsRecovered += 1;
            waitingFailedForReview += 1;
          }
        } else {
          waitingPending += 1;
        }
      } else if (decision.action === "hold") {
        waitingHeld += 1;
      } else {
        waitingPending += 1;
      }
      await controlPlane.recordReconciliation({
        jobId: row.id,
        ...decision,
        evidence: {
          operationKey: wait.operationKey,
          providerReference: wait.providerReference ?? null,
          resumeAfter: wait.resumeAfter ?? null,
          runId,
          runStatus: runId ? storyboardRunStatus.get(runId) ?? null : null,
        },
      });
    } catch (error) {
      reconciliationErrors += 1;
      console.error("[Feature186] job reconciliation decision failed", {
        jobId: row.id,
        action: decision.action,
        reasonCode: decision.reasonCode,
        error: error instanceof Error ? error.message.slice(0, 500) : "unknown_error",
      });
      await controlPlane.recordReconciliation({
        jobId: row.id,
        action: "error",
        reasonCode: "reconciliation_action_failed",
        explanation: "The reconciler could not apply its evidence-backed action; the next sweep will retry the decision.",
        evidence: {
          intendedAction: decision.action,
          intendedReasonCode: decision.reasonCode,
          error: error instanceof Error ? error.message.slice(0, 500) : "unknown_error",
        },
      }).catch(recordError => {
        console.error("[Feature186] failed to record reconciliation error", {
          jobId: row.id,
          error: recordError instanceof Error ? recordError.message.slice(0, 500) : "unknown_error",
        });
      });
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
    waitingDecisionsScanned: externalWaitsScanned,
    waitingCancelled,
    waitingResumed,
    waitingFailedForReview,
    waitingHeld,
    waitingPending,
    reconciliationErrors,
    decisions,
  };
}
