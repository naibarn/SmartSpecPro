import { and, eq, inArray, notExists, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

import { db, getDb } from "../db";
import {
  runnerCapabilitySnapshots,
  runnerNodes,
  workerJobAttempts,
  workerJobEvents,
  workerJobs,
} from "../../drizzle/schema";
import { appendJobEvent, createJobControlPlane } from "./jobControlPlane";
import {
  createDevelopmentRunService,
  defaultDevelopmentRunPersistenceAdapter,
} from "./spec224DevelopmentRunPersistence";

const INTENT_EVENT = "SPEC224_CONTINUATION_PENDING";
const PROCESSED_EVENTS = [
  "SPEC224_CONTINUATION_RECONCILED",
  "SPEC224_CONTINUATION_REVIEW_REQUIRED",
] as const;

type ContinuationIntent = {
  schemaVersion: "spec224.runner-continuation.v1";
  operationId: string;
  runId: string;
  tenantId: string;
  actorId: number;
  workerJobId: string;
  attempt: number;
  workerJobFencingVersion: number;
  developmentRunRevision: number | null;
  developmentRunFencingVersion: number | null;
  receiptEventId: string;
  receiptEventType: string;
  commandId: string;
  operationKey: string;
  runnerId: string;
  runnerSessionId: string;
  capabilitySnapshotId: string;
  capabilitySnapshotRevision: string;
  resultRef: string | null;
  errorCode: string | null;
};

function parseIntent(value: unknown): ContinuationIntent | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  if (
    row.schemaVersion !== "spec224.runner-continuation.v1" ||
    typeof row.operationId !== "string" ||
    typeof row.runId !== "string" ||
    typeof row.tenantId !== "string" ||
    !Number.isSafeInteger(row.actorId) ||
    typeof row.workerJobId !== "string" ||
    !Number.isSafeInteger(row.attempt) ||
    !Number.isSafeInteger(row.workerJobFencingVersion) ||
    typeof row.receiptEventId !== "string" ||
    typeof row.receiptEventType !== "string" ||
    typeof row.commandId !== "string" ||
    typeof row.operationKey !== "string" ||
    typeof row.runnerId !== "string" ||
    typeof row.runnerSessionId !== "string" ||
    typeof row.capabilitySnapshotId !== "string" ||
    typeof row.capabilitySnapshotRevision !== "string"
  )
    return null;
  return row as unknown as ContinuationIntent;
}

async function markOperation(
  intent: ContinuationIntent,
  eventType: (typeof PROCESSED_EVENTS)[number],
  reason: string
): Promise<void> {
  await db.transaction(async tx => {
    await appendJobEvent(tx, {
      workerJobId: intent.workerJobId,
      eventType,
      eventIdempotencyKey: `spec224-continuation-result:${intent.operationId}`,
      payloadJson: {
        schemaVersion: "spec224.runner-continuation-result.v1",
        operationId: intent.operationId,
        runId: intent.runId,
        receiptEventId: intent.receiptEventId,
        reason,
      },
    });
  });
}

/**
 * Replays receipt settlement and DevelopmentRun projection recovery from the
 * canonical worker event ledger. No new job, queue, scheduler, or provider call
 * is created here.
 */
export async function reconcileSpec224RunnerContinuations(
  input: {
    limit?: number;
  } = {}
): Promise<{
  scanned: number;
  reconciled: number;
  reviewRequired: number;
  ignored: number;
}> {
  getDb();
  const limit = Math.max(1, Math.min(input.limit ?? 50, 200));
  const processedEvents = alias(
    workerJobEvents,
    "spec224_processed_continuation_events"
  );
  const intents = await db
    .select({
      workerJobId: workerJobEvents.workerJobId,
      payloadJson: workerJobEvents.payloadJson,
    })
    .from(workerJobEvents)
    .where(
      and(
        eq(workerJobEvents.eventType, INTENT_EVENT),
        notExists(
          db
            .select({ id: processedEvents.id })
            .from(processedEvents)
            .where(
              and(
                eq(processedEvents.workerJobId, workerJobEvents.workerJobId),
                inArray(processedEvents.eventType, [...PROCESSED_EVENTS]),
                sql`${processedEvents.payloadJson}->>'operationId' = ${workerJobEvents.payloadJson}->>'operationId'`
              )
            )
        )
      )
    )
    .orderBy(workerJobEvents.createdAt)
    .limit(limit);
  if (!intents.length)
    return { scanned: 0, reconciled: 0, reviewRequired: 0, ignored: 0 };

  const controlPlane = createJobControlPlane();
  const developmentRuns = createDevelopmentRunService(
    defaultDevelopmentRunPersistenceAdapter
  );
  let reconciled = 0;
  let reviewRequired = 0;
  let ignored = 0;

  for (const row of intents) {
    const intent = parseIntent(row.payloadJson);
    if (!intent || intent.workerJobId !== row.workerJobId) {
      ignored += 1;
      continue;
    }
    const [job] = await db
      .select({
        tenantId: workerJobs.tenantId,
        requestedByUserId: workerJobs.requestedByUserId,
        attempt: workerJobs.attempt,
        fencingVersion: workerJobs.fencingVersion,
        status: workerJobs.status,
        operatorReviewRequired: workerJobs.operatorReviewRequired,
        progressJson: workerJobs.progressJson,
      })
      .from(workerJobs)
      .where(eq(workerJobs.id, intent.workerJobId))
      .limit(1);
    const [attempt] = await db
      .select({
        id: workerJobAttempts.id,
        leaseGeneration: workerJobAttempts.leaseGeneration,
      })
      .from(workerJobAttempts)
      .where(
        and(
          eq(workerJobAttempts.workerJobId, intent.workerJobId),
          eq(workerJobAttempts.attempt, intent.attempt)
        )
      )
      .limit(1);
    const receiptRows = await db
      .select({ id: workerJobEvents.id })
      .from(workerJobEvents)
      .where(
        and(
          eq(workerJobEvents.workerJobId, intent.workerJobId),
          eq(workerJobEvents.eventType, intent.receiptEventType),
          sql`${workerJobEvents.payloadJson}->>'eventId' = ${intent.receiptEventId}`,
          sql`${workerJobEvents.payloadJson}->>'commandId' = ${intent.commandId}`,
          sql`${workerJobEvents.payloadJson}->>'runnerSessionId' = ${intent.runnerSessionId}`,
          sql`${workerJobEvents.payloadJson}->>'runnerId' = ${intent.runnerId}`
        )
      )
      .limit(1);
    const projection = job?.progressJson?.spec224;
    const alreadyContinued = await db
      .select({ id: workerJobEvents.id })
      .from(workerJobEvents)
      .where(
        and(
          eq(workerJobEvents.workerJobId, intent.workerJobId),
          inArray(workerJobEvents.eventType, [
            "SPEC224_PHASE_COMPLETED",
            "SPEC224_PHASE_FAILED",
            "SPEC224_RUN_CANCELLED",
            "SPEC224_DECISION_REQUIRED",
            "SPEC224_RUN_COMPLETED",
          ]),
          sql`${workerJobEvents.payloadJson}->>'runId' = ${intent.runId}`,
          sql`${workerJobEvents.payloadJson}->'payload'->>'workerJobId' = ${intent.workerJobId}`
        )
      )
      .limit(1);
    if (alreadyContinued.length) {
      await markOperation(
        intent,
        "SPEC224_CONTINUATION_RECONCILED",
        "development_run_transition_already_persisted"
      );
      reconciled += 1;
      continue;
    }
    const validProjection =
      projection &&
      typeof projection === "object" &&
      !Array.isArray(projection) &&
      (projection as Record<string, unknown>).runId === intent.runId &&
      (projection as Record<string, unknown>).workerJobId ===
        intent.workerJobId &&
      (projection as Record<string, unknown>).tenantId === intent.tenantId &&
      (projection as Record<string, unknown>).actorId === intent.actorId &&
      (projection as Record<string, unknown>).projectionVersion ===
        intent.developmentRunRevision &&
      (projection as Record<string, unknown>).fencingVersion ===
        intent.developmentRunFencingVersion;
    const [runner] = await db
      .select({
        trustState: runnerNodes.trustState,
        activeSessionId: runnerNodes.activeSessionId,
        currentSnapshotRevision: runnerNodes.currentSnapshotRevision,
        snapshotExpiresAt: runnerNodes.snapshotExpiresAt,
        revokedAt: runnerNodes.revokedAt,
      })
      .from(runnerNodes)
      .where(
        and(
          eq(runnerNodes.runnerId, intent.runnerId),
          eq(runnerNodes.tenantId, intent.tenantId)
        )
      )
      .limit(1);
    const [snapshot] = await db
      .select({
        revision: runnerCapabilitySnapshots.revision,
        expiresAt: runnerCapabilitySnapshots.expiresAt,
      })
      .from(runnerCapabilitySnapshots)
      .where(
        and(
          eq(runnerCapabilitySnapshots.id, intent.capabilitySnapshotId),
          eq(runnerCapabilitySnapshots.runnerId, intent.runnerId),
          eq(runnerCapabilitySnapshots.tenantId, intent.tenantId)
        )
      )
      .limit(1);
    const now = new Date();
    const validCapability = Boolean(
      runner &&
      snapshot &&
      runner.trustState === "trusted" &&
      runner.activeSessionId === intent.runnerSessionId &&
      runner.currentSnapshotRevision === intent.capabilitySnapshotRevision &&
      snapshot.revision === intent.capabilitySnapshotRevision &&
      runner.revokedAt === null &&
      runner.snapshotExpiresAt &&
      runner.snapshotExpiresAt > now &&
      snapshot.expiresAt > now
    );

    if (
      !job ||
      job.tenantId !== intent.tenantId ||
      job.requestedByUserId !== intent.actorId ||
      job.attempt !== intent.attempt ||
      job.fencingVersion !== intent.workerJobFencingVersion ||
      !attempt ||
      attempt.leaseGeneration !== intent.leaseFenceVersion ||
      intent.leaseId !== `lease:${intent.workerJobId}:${attempt.id}` ||
      receiptRows.length !== 1 ||
      !validProjection ||
      !validCapability
    ) {
      await markOperation(
        intent,
        "SPEC224_CONTINUATION_REVIEW_REQUIRED",
        "continuation_binding_stale_or_revoked"
      );
      await controlPlane.recordReconciliation({
        jobId: intent.workerJobId,
        action: "operator_review",
        reasonCode: "SPEC224_CONTINUATION_BINDING_STALE",
        explanation:
          "Persisted Runner continuation binding no longer matches current tenant, run, fence, session, or capability state.",
        evidence: {
          operationId: intent.operationId,
          receiptEventId: intent.receiptEventId,
        },
      });
      reviewRequired += 1;
      continue;
    }

    let settlementOk = true;
    if (job.status === "waiting_external") {
      if (intent.receiptEventType === "RUNNER_EXECUTION_COMPLETED") {
        settlementOk = await controlPlane.completeExternal(
          intent.workerJobId,
          intent.resultRef ?? `runner-receipt:${intent.receiptEventId}`,
          intent.operationKey
        );
      } else if (
        [
          "RUNNER_EXECUTION_FAILED",
          "RUNNER_COMMAND_REJECTED",
          "RUNNER_UNKNOWN_OUTCOME",
        ].includes(intent.receiptEventType)
      ) {
        settlementOk =
          (await controlPlane.failExternalWait(
            intent.workerJobId,
            intent.errorCode ?? intent.receiptEventType,
            intent.receiptEventType === "RUNNER_UNKNOWN_OUTCOME",
            new Date(),
            intent.operationKey
          )) === "failed";
      } else {
        settlementOk = false;
      }
    } else if (
      !["succeeded", "failed", "cancelled", "expired"].includes(job.status)
    ) {
      settlementOk = false;
    }
    if (!settlementOk) {
      await markOperation(
        intent,
        "SPEC224_CONTINUATION_REVIEW_REQUIRED",
        "canonical_settlement_not_recoverable"
      );
      await controlPlane.recordReconciliation({
        jobId: intent.workerJobId,
        action: "operator_review",
        reasonCode: "SPEC224_CONTINUATION_SETTLEMENT_AMBIGUOUS",
        explanation:
          "Persisted receipt could not be safely settled against the current canonical external wait.",
        evidence: {
          operationId: intent.operationId,
          receiptEventId: intent.receiptEventId,
        },
      });
      reviewRequired += 1;
      continue;
    }

    const result = await developmentRuns.reconcile({
      runId: intent.runId,
      tenantId: intent.tenantId,
      actorId: intent.actorId,
      expectedRevision: intent.developmentRunRevision ?? undefined,
      expectedFencingVersion: intent.developmentRunFencingVersion ?? undefined,
      expectedWorkerJobId: intent.workerJobId,
      expectedAttempt: intent.attempt,
    });
    if (
      result.reason === "continuation_binding_stale" ||
      result.reason === "continuation_attempt_stale"
    ) {
      await markOperation(
        intent,
        "SPEC224_CONTINUATION_REVIEW_REQUIRED",
        result.reason
      );
      reviewRequired += 1;
    } else {
      await markOperation(
        intent,
        "SPEC224_CONTINUATION_RECONCILED",
        result.reason
      );
      reconciled += 1;
    }
  }
  return { scanned: intents.length, reconciled, reviewRequired, ignored };
}
