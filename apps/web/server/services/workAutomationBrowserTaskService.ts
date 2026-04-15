import crypto from "crypto";
import { and, desc, eq, inArray, isNull, lte, or } from "drizzle-orm";

import {
  workAutomationBrowserTaskClaims,
  type InsertWorkAutomationBrowserTaskClaim,
  type WorkAutomationBrowserTaskClaim,
} from "../../drizzle/schema";
import { finalizeAutomationCopilotTaskReservation, getAutomationCopilotTaskStatus } from "./automationCopilotExecutionService";
import { getDb } from "../db";
import { getAutomationRunProjection, recordAutomationRunStepProgress, updateAutomationRunStepProgress } from "./workAutomationFabricService";

export type BrowserAutomationClaimStatus =
  | "claimed"
  | "queued"
  | "running"
  | "completed"
  | "failed"
  | "cancelled";

export interface BrowserAutomationHealth {
  totalClaims: number;
  pendingClaims: number;
  claimedClaims: number;
  queuedClaims: number;
  runningClaims: number;
  completedClaims: number;
  failedClaims: number;
  cancelledClaims: number;
  staleClaims: number;
  distinctCases: number;
  latestClaimedAt: Date | null;
  latestPolledAt: Date | null;
  latestUpdatedAt: Date | null;
  latestCompletedAt: Date | null;
  nextPollAt: Date | null;
}

export interface ClaimBrowserAutomationTaskInput {
  tenantId: string;
  caseId: string;
  runId: string;
  stepKey: string;
  stepIndex: number;
  title: string;
  idempotencyKey?: string | null;
  taskId: string;
  executionId: string;
  reservationId?: string | null;
  inputRefsJson?: string[];
  detailJson?: Record<string, unknown> | null;
  createdByUserId?: number | null;
  createdByAssistantId?: string | null;
}

export interface UpdateBrowserAutomationTaskClaimInput {
  tenantId: string;
  claimId: string;
  status?: BrowserAutomationClaimStatus;
  taskId?: string | null;
  executionId?: string | null;
  reservationId?: string | null;
  inputRefsJson?: string[];
  outputRefsJson?: string[];
  detailJson?: Record<string, unknown> | null;
  errorMessage?: string | null;
  nextPollAt?: Date | null;
  pollCount?: number;
  stepId?: string | null;
  completedAt?: Date | null;
}

export function mapAutomationCopilotStatusToBrowserClaimStatus(status: string | null | undefined): BrowserAutomationClaimStatus {
  const normalized = String(status ?? "").trim().toLowerCase();
  if (normalized === "success" || normalized === "completed" || normalized === "done") {
    return "completed";
  }
  if (normalized === "failed" || normalized === "error") {
    return "failed";
  }
  if (normalized === "cancelled" || normalized === "canceled") {
    return "cancelled";
  }
  if (normalized === "executing" || normalized === "running") {
    return "running";
  }
  return "queued";
}

export function isBrowserAutomationClaimTerminal(status: BrowserAutomationClaimStatus): boolean {
  return status === "completed" || status === "failed" || status === "cancelled";
}

function now(): Date {
  return new Date();
}

export async function claimBrowserAutomationTask(
  input: ClaimBrowserAutomationTaskInput,
): Promise<{ claim: WorkAutomationBrowserTaskClaim; created: boolean }> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const claimPayload = {
    id: crypto.randomUUID(),
    tenantId: input.tenantId,
    requestId: null,
    caseId: input.caseId,
    runId: input.runId,
    stepId: null,
    stepKey: input.stepKey,
    stepIndex: input.stepIndex,
    title: input.title,
    idempotencyKey: input.idempotencyKey ?? null,
    claimToken: crypto.randomUUID(),
    status: "claimed",
    taskId: input.taskId,
    executionId: input.executionId,
    reservationId: input.reservationId ?? null,
    inputRefsJson: input.inputRefsJson ?? [],
    outputRefsJson: [],
    detailJson: input.detailJson ?? {},
    errorMessage: null,
    claimedAt: now(),
    dispatchedAt: null,
    lastPolledAt: null,
    nextPollAt: null,
    completedAt: null,
    pollCount: 0,
    createdByUserId: input.createdByUserId ?? null,
    createdByAssistantId: input.createdByAssistantId ?? null,
    createdAt: now(),
    updatedAt: now(),
  } satisfies InsertWorkAutomationBrowserTaskClaim;

  const inserted = await db
    .insert(workAutomationBrowserTaskClaims)
    .values(claimPayload)
    .onConflictDoNothing()
    .returning();

  if (inserted.length > 0) {
    return { claim: inserted[0], created: true };
  }

  const [existing] = await db
    .select()
    .from(workAutomationBrowserTaskClaims)
    .where(and(
      eq(workAutomationBrowserTaskClaims.tenantId, input.tenantId),
      eq(workAutomationBrowserTaskClaims.runId, input.runId),
      eq(workAutomationBrowserTaskClaims.stepKey, input.stepKey),
      eq(workAutomationBrowserTaskClaims.taskId, input.taskId),
    ))
    .limit(1);

  if (!existing) {
    throw new Error(`Browser automation claim ${input.taskId} could not be created or loaded`);
  }

  return { claim: existing, created: false };
}

export async function getBrowserAutomationTaskClaimByTaskId(
  tenantId: string,
  taskId: string,
): Promise<WorkAutomationBrowserTaskClaim | null> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const [claim] = await db
    .select()
    .from(workAutomationBrowserTaskClaims)
    .where(and(eq(workAutomationBrowserTaskClaims.tenantId, tenantId), eq(workAutomationBrowserTaskClaims.taskId, taskId)))
    .limit(1);

  return claim ?? null;
}

export async function listPendingBrowserAutomationTaskClaims(
  tenantId: string,
  limit = 20,
  nowValue = now(),
): Promise<WorkAutomationBrowserTaskClaim[]> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  return db
    .select()
    .from(workAutomationBrowserTaskClaims)
    .where(and(
      eq(workAutomationBrowserTaskClaims.tenantId, tenantId),
      inArray(workAutomationBrowserTaskClaims.status, ["claimed", "queued", "running"]),
      or(
        isNull(workAutomationBrowserTaskClaims.nextPollAt),
        lte(workAutomationBrowserTaskClaims.nextPollAt, nowValue),
      )!,
    ))
    .orderBy(desc(workAutomationBrowserTaskClaims.createdAt))
    .limit(limit);
}

export async function updateBrowserAutomationTaskClaim(
  input: UpdateBrowserAutomationTaskClaimInput,
): Promise<WorkAutomationBrowserTaskClaim> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const current = await getBrowserAutomationTaskClaimByClaimId(input.tenantId, input.claimId);
  if (!current) {
    throw new Error(`Browser automation claim ${input.claimId} not found`);
  }

  const [updated] = await db
    .update(workAutomationBrowserTaskClaims)
    .set({
      ...(input.status !== undefined ? { status: input.status } : {}),
      ...(input.taskId !== undefined ? { taskId: input.taskId } : {}),
      ...(input.executionId !== undefined ? { executionId: input.executionId } : {}),
      ...(input.reservationId !== undefined ? { reservationId: input.reservationId } : {}),
      ...(input.inputRefsJson !== undefined ? { inputRefsJson: input.inputRefsJson } : {}),
      ...(input.outputRefsJson !== undefined ? { outputRefsJson: input.outputRefsJson } : {}),
      ...(input.detailJson !== undefined ? { detailJson: input.detailJson ?? {} } : {}),
      ...(input.errorMessage !== undefined ? { errorMessage: input.errorMessage } : {}),
      ...(input.nextPollAt !== undefined ? { nextPollAt: input.nextPollAt } : {}),
      ...(input.pollCount !== undefined ? { pollCount: input.pollCount } : {}),
      ...(input.stepId !== undefined ? { stepId: input.stepId } : {}),
      ...(input.status === "completed" || input.status === "failed" || input.status === "cancelled"
        ? { completedAt: input.completedAt ?? now() }
        : {}),
      updatedAt: now(),
    })
    .where(and(eq(workAutomationBrowserTaskClaims.id, input.claimId), eq(workAutomationBrowserTaskClaims.tenantId, input.tenantId)))
    .returning();

  if (!updated) {
    throw new Error(`Browser automation claim ${input.claimId} could not be updated`);
  }

  return updated;
}

async function getBrowserAutomationTaskClaimByClaimId(
  tenantId: string,
  claimId: string,
): Promise<WorkAutomationBrowserTaskClaim | null> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const [claim] = await db
    .select()
    .from(workAutomationBrowserTaskClaims)
    .where(and(eq(workAutomationBrowserTaskClaims.id, claimId), eq(workAutomationBrowserTaskClaims.tenantId, tenantId)))
    .limit(1);

  return claim ?? null;
}

export async function buildBrowserAutomationTimelineEntries(
  caseId: string,
  tenantId: string,
): Promise<Array<{
  id: string;
  source: "browser_automation";
  eventType: string;
  createdAt: Date;
  requestId: string | null;
  caseId: string | null;
  taskId: string | null;
  detailJson: Record<string, unknown> | null;
}>> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const claims = await db
    .select()
    .from(workAutomationBrowserTaskClaims)
    .where(and(eq(workAutomationBrowserTaskClaims.caseId, caseId), eq(workAutomationBrowserTaskClaims.tenantId, tenantId)))
    .orderBy(desc(workAutomationBrowserTaskClaims.createdAt));

  return claims.map((claim) => ({
    id: `browser-claim-${claim.id}`,
    source: "browser_automation" as const,
    eventType: `browser_automation_${claim.status}`,
    createdAt: claim.updatedAt ?? claim.createdAt,
    requestId: claim.requestId ?? null,
    caseId: claim.caseId,
    taskId: claim.taskId ?? null,
    detailJson: {
      claimId: claim.id,
      runId: claim.runId,
      stepId: claim.stepId ?? null,
      stepKey: claim.stepKey,
      stepIndex: claim.stepIndex,
      title: claim.title,
      status: claim.status,
      taskId: claim.taskId ?? null,
      executionId: claim.executionId ?? null,
      reservationId: claim.reservationId ?? null,
      pollCount: claim.pollCount,
      inputRefsJson: claim.inputRefsJson,
      outputRefsJson: claim.outputRefsJson,
      errorMessage: claim.errorMessage ?? null,
      ...(claim.detailJson ?? {}),
    },
  }));
}

export async function getBrowserAutomationHealth(
  tenantId: string,
  nowValue = now(),
): Promise<BrowserAutomationHealth> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const claims = await db
    .select()
    .from(workAutomationBrowserTaskClaims)
    .where(eq(workAutomationBrowserTaskClaims.tenantId, tenantId));

  let latestClaimedAt: Date | null = null;
  let latestPolledAt: Date | null = null;
  let latestUpdatedAt: Date | null = null;
  let latestCompletedAt: Date | null = null;
  let nextPollAt: Date | null = null;
  let staleClaims = 0;
  const distinctCases = new Set<string>();

  const summary = claims.reduce(
    (acc, claim) => {
      const status = claim.status as BrowserAutomationClaimStatus;
      const isPending = status === "claimed" || status === "queued" || status === "running";
      acc.totalClaims += 1;
      distinctCases.add(claim.caseId);

      if (status === "claimed") acc.claimedClaims += 1;
      if (status === "queued") acc.queuedClaims += 1;
      if (status === "running") acc.runningClaims += 1;
      if (status === "completed") acc.completedClaims += 1;
      if (status === "failed") acc.failedClaims += 1;
      if (status === "cancelled") acc.cancelledClaims += 1;
      if (isPending && claim.nextPollAt && claim.nextPollAt <= nowValue) {
        staleClaims += 1;
      }

      if (isPending) {
        acc.pendingClaims += 1;
      }

      if (!latestClaimedAt || claim.claimedAt > latestClaimedAt) {
        latestClaimedAt = claim.claimedAt;
      }
      if (claim.lastPolledAt && (!latestPolledAt || claim.lastPolledAt > latestPolledAt)) {
        latestPolledAt = claim.lastPolledAt;
      }
      if (!latestUpdatedAt || claim.updatedAt > latestUpdatedAt) {
        latestUpdatedAt = claim.updatedAt;
      }
      if (claim.completedAt && (!latestCompletedAt || claim.completedAt > latestCompletedAt)) {
        latestCompletedAt = claim.completedAt;
      }
      if (claim.nextPollAt && (!nextPollAt || claim.nextPollAt < nextPollAt)) {
        nextPollAt = claim.nextPollAt;
      }

      return acc;
    },
    {
      totalClaims: 0,
      pendingClaims: 0,
      claimedClaims: 0,
      queuedClaims: 0,
      runningClaims: 0,
      completedClaims: 0,
      failedClaims: 0,
      cancelledClaims: 0,
    },
  );

  return {
    ...summary,
    staleClaims,
    distinctCases: distinctCases.size,
    latestClaimedAt,
    latestPolledAt,
    latestUpdatedAt,
    latestCompletedAt,
    nextPollAt,
  };
}

function summarizeBrowserStatusPayload(payload: Record<string, unknown>): string | null {
  const errorMessage = typeof payload.error_message === "string" ? payload.error_message.trim() : "";
  if (errorMessage) return errorMessage;
  const status = typeof payload.status === "string" ? payload.status.trim() : "";
  return status || null;
}

function buildBrowserClaimDetailFromStatus(
  claim: WorkAutomationBrowserTaskClaim,
  payload: Record<string, unknown>,
): Record<string, unknown> {
  return {
    ...(claim.detailJson ?? {}),
    taskStatus: payload.status ?? null,
    tenantId: payload.tenant_id ?? claim.tenantId,
    userId: payload.user_id ?? null,
    actualCreditsUsed: payload.actual_credits_used ?? null,
    stepsCompleted: payload.steps_completed ?? null,
    stepsTotal: payload.steps_total ?? null,
    errorMessage: payload.error_message ?? null,
    lastStatusPayload: payload,
  };
}

export async function reconcileBrowserAutomationTaskClaims(
  tenantId: string,
  options: { limit?: number; now?: Date } = {},
): Promise<{
  processed: number;
  completed: number;
  failed: number;
  cancelled: number;
  pending: number;
}> {
  const nowValue = options.now ?? now();
  const claims = await listPendingBrowserAutomationTaskClaims(tenantId, options.limit ?? 20, nowValue);

  let completed = 0;
  let failed = 0;
  let cancelled = 0;
  let pending = 0;

  for (const claim of claims) {
    if (!claim.taskId) {
      pending += 1;
      continue;
    }

    let payload: Record<string, unknown>;
    try {
      payload = await getAutomationCopilotTaskStatus(tenantId, claim.taskId);
    } catch {
      pending += 1;
      await updateBrowserAutomationTaskClaim({
        tenantId,
        claimId: claim.id,
        status: claim.status as BrowserAutomationClaimStatus,
        nextPollAt: new Date(nowValue.getTime() + 30_000),
        pollCount: claim.pollCount + 1,
      }).catch(() => {});
      continue;
    }

    const mappedStatus = mapAutomationCopilotStatusToBrowserClaimStatus(String(payload.status ?? ""));
    const detailJson = buildBrowserClaimDetailFromStatus(claim, payload);
    const summary = summarizeBrowserStatusPayload(payload);
    const outputRefsJson = claim.outputRefsJson ?? [];
    const stepStatus = mappedStatus === "completed"
      ? "succeeded"
      : mappedStatus === "failed"
        ? "failed"
        : mappedStatus === "cancelled"
          ? "cancelled"
          : "running";
    const terminal = isBrowserAutomationClaimTerminal(mappedStatus);
    const projection = await getAutomationRunProjection(claim.runId, tenantId).catch(() => null);
    const existingStep = projection?.steps.find((step) =>
      step.stepKey === claim.stepKey
      && (claim.idempotencyKey ? step.idempotencyKey === claim.idempotencyKey : true),
    ) ?? null;

    if (!claim.stepId) {
      if (existingStep && terminal) {
        const stepResult = await updateAutomationRunStepProgress({
          tenantId,
          caseId: claim.caseId,
          runId: claim.runId,
          stepId: existingStep.id,
          stepKey: claim.stepKey,
          stepIndex: claim.stepIndex,
          title: claim.title,
          status: stepStatus,
          surface: "browser",
          inputRefsJson: claim.inputRefsJson ?? [],
          outputRefsJson,
          idempotencyKey: claim.idempotencyKey ?? null,
          summary: summary ?? claim.title,
          detailJson: {
            browserClaimId: claim.id,
            browserTaskId: claim.taskId,
            browserExecutionId: claim.executionId,
            browserReservationId: claim.reservationId ?? null,
            browserStatus: payload.status ?? null,
            browserStatusPayload: payload,
            browserClaimDetail: detailJson,
          },
          runStatus: stepStatus === "succeeded"
            ? "completed"
            : stepStatus === "failed"
              ? "failed"
              : stepStatus === "cancelled"
                ? "cancelled"
                : "running",
          finalDisposition: stepStatus === "succeeded" ? "completed" : stepStatus,
          finalDispositionReason: stepStatus === "failed" ? summarizeBrowserStatusPayload(payload) : null,
          createdByUserId: claim.createdByUserId ?? null,
          createdByAssistantId: claim.createdByAssistantId ?? null,
        });
        await updateBrowserAutomationTaskClaim({
          tenantId,
          claimId: claim.id,
          status: mappedStatus,
          stepId: stepResult.step.id,
          outputRefsJson,
          detailJson,
          errorMessage: payload.error_message ? String(payload.error_message) : null,
          pollCount: claim.pollCount + 1,
          completedAt: terminal ? nowValue : null,
          nextPollAt: terminal ? null : new Date(nowValue.getTime() + 30_000),
        });
      } else if (existingStep) {
        await updateBrowserAutomationTaskClaim({
          tenantId,
          claimId: claim.id,
          status: mappedStatus,
          stepId: existingStep.id,
          outputRefsJson,
          detailJson,
          errorMessage: payload.error_message ? String(payload.error_message) : null,
          pollCount: claim.pollCount + 1,
          completedAt: terminal ? nowValue : null,
          nextPollAt: terminal ? null : new Date(nowValue.getTime() + 30_000),
        });
      } else {
        const stepResult = await recordAutomationRunStepProgress({
          tenantId,
          caseId: claim.caseId,
          runId: claim.runId,
          stepKey: claim.stepKey,
          stepIndex: claim.stepIndex,
          title: claim.title,
          status: stepStatus,
          surface: "browser",
          inputRefsJson: claim.inputRefsJson ?? [],
          outputRefsJson,
          idempotencyKey: claim.idempotencyKey ?? null,
          summary: summary ?? claim.title,
          detailJson: {
            browserClaimId: claim.id,
            browserTaskId: claim.taskId,
            browserExecutionId: claim.executionId,
            browserReservationId: claim.reservationId ?? null,
            browserStatus: payload.status ?? null,
            browserStatusPayload: payload,
            browserClaimDetail: detailJson,
          },
          runStatus: stepStatus === "succeeded"
            ? "completed"
            : stepStatus === "failed"
              ? "failed"
              : stepStatus === "cancelled"
                ? "cancelled"
                : "running",
          finalDisposition: stepStatus === "succeeded" ? "completed" : stepStatus,
          finalDispositionReason: stepStatus === "failed" ? summarizeBrowserStatusPayload(payload) : null,
          createdByUserId: claim.createdByUserId ?? null,
          createdByAssistantId: claim.createdByAssistantId ?? null,
        });
        await updateBrowserAutomationTaskClaim({
          tenantId,
          claimId: claim.id,
          status: mappedStatus,
          stepId: stepResult.step.id,
          outputRefsJson,
          detailJson,
          errorMessage: payload.error_message ? String(payload.error_message) : null,
          pollCount: claim.pollCount + 1,
          completedAt: terminal ? nowValue : null,
          nextPollAt: terminal ? null : new Date(nowValue.getTime() + 30_000),
        });
      }
      if (mappedStatus === "completed") completed += 1;
      if (mappedStatus === "failed") failed += 1;
      if (mappedStatus === "cancelled") cancelled += 1;
      if (terminal) {
        await finalizeAutomationCopilotTaskReservation(claim.taskId, String(payload.status ?? "")).catch(() => {});
      }
      if (!terminal) pending += 1;
      continue;
    }

    if (terminal) {
      let resolvedStepId: string | null = existingStep?.id ?? claim.stepId ?? null;
      if (existingStep) {
        await updateAutomationRunStepProgress({
          tenantId,
          caseId: claim.caseId,
          runId: claim.runId,
          stepId: existingStep.id,
          stepKey: claim.stepKey,
          stepIndex: claim.stepIndex,
          title: claim.title,
          status: stepStatus,
          surface: "browser",
          inputRefsJson: claim.inputRefsJson ?? [],
          outputRefsJson,
          idempotencyKey: claim.idempotencyKey ?? null,
          summary: summary ?? claim.title,
          detailJson: {
            browserClaimId: claim.id,
            browserTaskId: claim.taskId,
            browserExecutionId: claim.executionId,
            browserReservationId: claim.reservationId ?? null,
            browserStatus: payload.status ?? null,
            browserStatusPayload: payload,
            browserClaimDetail: detailJson,
          },
          runStatus: stepStatus === "succeeded"
            ? "completed"
            : stepStatus === "failed"
              ? "failed"
              : stepStatus === "cancelled"
                ? "cancelled"
                : "running",
          finalDisposition: stepStatus === "succeeded" ? "completed" : stepStatus,
          finalDispositionReason: stepStatus === "failed" ? summarizeBrowserStatusPayload(payload) : null,
          createdByUserId: claim.createdByUserId ?? null,
          createdByAssistantId: claim.createdByAssistantId ?? null,
        });
        resolvedStepId = existingStep.id;
      } else {
        const stepResult = await recordAutomationRunStepProgress({
          tenantId,
          caseId: claim.caseId,
          runId: claim.runId,
          stepKey: claim.stepKey,
          stepIndex: claim.stepIndex,
          title: claim.title,
          status: stepStatus,
          surface: "browser",
          inputRefsJson: claim.inputRefsJson ?? [],
          outputRefsJson,
          idempotencyKey: claim.idempotencyKey ?? null,
          summary: summary ?? claim.title,
          detailJson: {
            browserClaimId: claim.id,
            browserTaskId: claim.taskId,
            browserExecutionId: claim.executionId,
            browserReservationId: claim.reservationId ?? null,
            browserStatus: payload.status ?? null,
            browserStatusPayload: payload,
            browserClaimDetail: detailJson,
          },
          runStatus: stepStatus === "succeeded"
            ? "completed"
            : stepStatus === "failed"
              ? "failed"
              : stepStatus === "cancelled"
                ? "cancelled"
                : "running",
          finalDisposition: stepStatus === "succeeded" ? "completed" : stepStatus,
          finalDispositionReason: stepStatus === "failed" ? summarizeBrowserStatusPayload(payload) : null,
          createdByUserId: claim.createdByUserId ?? null,
          createdByAssistantId: claim.createdByAssistantId ?? null,
        });
        resolvedStepId = stepResult.step.id;
      }
      await updateBrowserAutomationTaskClaim({
        tenantId,
        claimId: claim.id,
        status: mappedStatus,
        stepId: resolvedStepId,
        outputRefsJson,
        detailJson,
        errorMessage: payload.error_message ? String(payload.error_message) : null,
        pollCount: claim.pollCount + 1,
        completedAt: terminal ? nowValue : null,
        nextPollAt: terminal ? null : new Date(nowValue.getTime() + 30_000),
      });
    } else {
      await updateBrowserAutomationTaskClaim({
        tenantId,
        claimId: claim.id,
        status: mappedStatus,
        outputRefsJson,
        detailJson,
        errorMessage: payload.error_message ? String(payload.error_message) : null,
        pollCount: claim.pollCount + 1,
        nextPollAt: new Date(nowValue.getTime() + 30_000),
      });
    }

    if (mappedStatus === "completed") completed += 1;
    if (mappedStatus === "failed") failed += 1;
    if (mappedStatus === "cancelled") cancelled += 1;
    if (terminal) {
      await finalizeAutomationCopilotTaskReservation(claim.taskId, String(payload.status ?? "")).catch(() => {});
    }
    if (!terminal) pending += 1;
  }

  return {
    processed: claims.length,
    completed,
    failed,
    cancelled,
    pending,
  };
}
