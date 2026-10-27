import { and, eq, inArray, notExists, or, sql } from "drizzle-orm";
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
import { createSpec224WorkspaceLifecycleReceiptReader } from "./spec224WorkspaceLifecycleReceiptReader";
import { settleMiniAppFactoryRunnerStage } from "./miniAppFactoryRunnerSettlement";
import { createAndBindNextPhase } from "./spec224PhaseController";
import { defaultSpec224AuthorizationService } from "./spec224AuthorizationService";
import { canonicalDevelopmentRunWorkerJobId, decideNextSafeAction } from "./spec224DevelopmentRunContracts";

const INTENT_EVENT = "SPEC224_CONTINUATION_PENDING";
const PROCESSED_EVENTS = [
  "SPEC224_CONTINUATION_RECONCILED",
  "SPEC224_CONTINUATION_REVIEW_REQUIRED",
  "SPEC224_CONTINUATION_SUCCESSOR_DISPATCHED",
] as const;

function terminalContinuationEvent(event: typeof workerJobEvents, goalId: unknown) {
  return sql`(${event.eventType} IN ('SPEC224_CONTINUATION_REVIEW_REQUIRED', 'SPEC224_CONTINUATION_SUCCESSOR_DISPATCHED') OR
    (${event.eventType} = 'SPEC224_CONTINUATION_RECONCILED' AND ((${goalId})::text IS NULL OR
      COALESCE(${event.payloadJson}->>'reason', '') NOT IN ('phase_succeeded', 'phase_failed_repairable', 'worker_job_already_reconciled', 'development_run_transition_already_persisted'))))`;
}

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
  leaseId: string | null;
  leaseFenceVersion: number | null;
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
    (row.leaseId !== null && typeof row.leaseId !== "string") ||
    (row.leaseFenceVersion !== null &&
      !Number.isSafeInteger(row.leaseFenceVersion)) ||
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
      eventIdempotencyKey: eventType === "SPEC224_CONTINUATION_SUCCESSOR_DISPATCHED"
        ? `spec224-continuation-successor:${intent.operationId}` : `spec224-continuation-result:${intent.operationId}`,
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
      goalId: sql<string | null>`${workerJobs.inputJson}->'spec224Run'->>'goalId'`,
    })
    .from(workerJobEvents)
    .innerJoin(workerJobs, eq(workerJobs.id, workerJobEvents.workerJobId))
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
                terminalContinuationEvent(processedEvents, sql`${workerJobs.inputJson}->'spec224Run'->>'goalId'`),
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
    defaultDevelopmentRunPersistenceAdapter,
    { workspaceLifecycleReceiptReader: createSpec224WorkspaceLifecycleReceiptReader(controlPlane) }
  );
  let reconciled = 0;
  let reviewRequired = 0;
  let ignored = 0;

  async function advanceGoal(intent: ContinuationIntent, jobInput: Record<string, unknown>): Promise<boolean> {
    const manifest = jobInput.manifest as Record<string, any> | undefined;
    const originalRun = jobInput.spec224Run as Record<string, any> | undefined;
    if (!originalRun?.goalId) return false;
    const record = await developmentRuns.get({ runId: intent.runId, tenantId: intent.tenantId, actorId: intent.actorId });
    const action = decideNextSafeAction(record.run);
    if (!["RUN_PHASE", "RECOVER_PHASE"].includes(action.command)) return false;
    if (!manifest || !["codex", "claude_code"].includes(manifest.provider) ||
      !["local_runner", "cloudflare_container"].includes(manifest.runtime) || typeof manifest.planId !== "string" ||
      !Number.isSafeInteger(manifest.planRevision) || !Array.isArray(manifest.skillIds) || !Array.isArray(manifest.requestedCapabilities))
      throw new Error("SPEC224_CONTINUATION_CONFIGURATION_INVALID");
    await createAndBindNextPhase({ runId: intent.runId, tenantId: intent.tenantId, actorId: intent.actorId,
      expectedRevision: record.revision, expectedFencingVersion: record.run.fencingVersion,
      idempotencyKey: `spec224-receipt:${intent.operationId}`, provider: manifest.provider, runtime: manifest.runtime,
      planId: manifest.planId, planRevision: manifest.planRevision, skillIds: manifest.skillIds,
      requestedCapabilities: manifest.requestedCapabilities, authorizationScope: "spec224.development.run",
      deferredAdmission: true, persistence: defaultDevelopmentRunPersistenceAdapter, controlPlane });
    const authorized = await defaultSpec224AuthorizationService.authorizeDelegatedChild({
      context: { tenantId: intent.tenantId, actorId: intent.actorId }, runId: intent.runId,
    });
    if (authorized.status !== "READY_FOR_LIVE") throw new Error(`SPEC224_CHILD_AUTHORIZATION_${authorized.status}`);
    return true;
  }

  for (const row of intents) {
    const intent = parseIntent(row.payloadJson);
    if (!intent || intent.workerJobId !== row.workerJobId) {
      ignored += 1;
      continue;
    }
    await db.transaction(async lockTx => {
      await lockTx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${`spec224-continuation:${intent.operationId}`}, 0))`);
      const [processed] = await lockTx.select({ id: workerJobEvents.id }).from(workerJobEvents).where(and(
        eq(workerJobEvents.workerJobId, intent.workerJobId), terminalContinuationEvent(workerJobEvents, row.goalId),
        sql`${workerJobEvents.payloadJson}->>'operationId' = ${intent.operationId}`)).limit(1);
      if (processed) return;
      const [job] = await db
        .select({
          tenantId: workerJobs.tenantId,
          requestedByUserId: workerJobs.requestedByUserId,
          jobType: workerJobs.jobType,
          attempt: workerJobs.attempt,
          fencingVersion: workerJobs.fencingVersion,
          status: workerJobs.status,
          operatorReviewRequired: workerJobs.operatorReviewRequired,
          progressJson: workerJobs.progressJson,
          inputJson: workerJobs.inputJson,
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
            or(eq(workerJobEvents.workerJobId, intent.workerJobId), eq(workerJobEvents.workerJobId, canonicalDevelopmentRunWorkerJobId(intent.runId))),
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
            eq(
              sql<string>`${runnerCapabilitySnapshots.snapshotJson}->>'capabilitySnapshotId'`,
              intent.capabilitySnapshotId
            ),
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
        (!validProjection && !(alreadyContinued.length && (job?.inputJson?.spec224Run as Record<string, unknown> | undefined)?.runId === intent.runId)) ||
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
        return;
      }

      if (alreadyContinued.length) {
        if (await advanceGoal(intent, job.inputJson)) {
          await markOperation(intent, "SPEC224_CONTINUATION_SUCCESSOR_DISPATCHED", "next_phase_authorized_and_released");
          reconciled += 1;
          return;
        }
        if (
          intent.receiptEventType === "RUNNER_EXECUTION_COMPLETED" &&
          job.jobType === "mini_app_factory.stage"
        ) {
          await settleMiniAppFactoryRunnerStage({
            runId: intent.runId, tenantId: intent.tenantId, actorId: intent.actorId,
            receiptEventId: intent.receiptEventId, receiptEventType: intent.receiptEventType, developmentRuns,
          });
        }
        await markOperation(
          intent,
          "SPEC224_CONTINUATION_RECONCILED",
          "development_run_transition_already_persisted"
        );
        reconciled += 1;
        return;
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
        return;
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
        if (await advanceGoal(intent, job.inputJson)) {
          await markOperation(intent, "SPEC224_CONTINUATION_SUCCESSOR_DISPATCHED", "next_phase_authorized_and_released");
          reconciled += 1;
          return;
        }
        if (
          intent.receiptEventType === "RUNNER_EXECUTION_COMPLETED" &&
          job.jobType === "mini_app_factory.stage"
        ) {
          await settleMiniAppFactoryRunnerStage({
            runId: intent.runId, tenantId: intent.tenantId, actorId: intent.actorId,
            receiptEventId: intent.receiptEventId, receiptEventType: intent.receiptEventType, developmentRuns,
          });
        }
        await markOperation(
          intent,
          "SPEC224_CONTINUATION_RECONCILED",
          result.reason
        );
        reconciled += 1;
      }
    });
  }
  return { scanned: intents.length, reconciled, reviewRequired, ignored };
}
