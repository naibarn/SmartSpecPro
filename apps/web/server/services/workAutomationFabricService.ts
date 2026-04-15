import crypto from "crypto";
import { and, desc, eq, or } from "drizzle-orm";

import {
  workAutomationRunCheckpoints,
  workAutomationRunEvents,
  workAutomationRunSteps,
  workAutomationRuns,
  workCases,
  workExceptions,
  workRequests,
  type InsertWorkAutomationRun,
  type InsertWorkAutomationRunCheckpoint,
  type InsertWorkAutomationRunEvent,
  type InsertWorkAutomationRunStep,
  type WorkAutomationRun,
  type WorkAutomationRunCheckpoint,
  type WorkAutomationRunEvent,
  type WorkAutomationRunStep,
  type WorkCase,
  type WorkRequest,
  type WorkException,
} from "../../drizzle/schema";
import { getDb } from "../db";
import {
  buildAutomationPolicySnapshot,
  resolveAutomationLaunchPolicy,
  resolveAutomationStepRoute,
  validateAutomationModeTransition,
  type WorkAutomationLaunchPolicy,
  type WorkAutomationMode,
} from "./workAutomationPolicyService";

type WorkAutomationRunStatus = "pending" | "running" | "waiting_for_input" | "waiting_for_approval" | "paused" | "completed" | "failed" | "cancelled";
type WorkAutomationStepStatus = "planned" | "running" | "needs_input" | "awaiting_approval" | "blocked" | "succeeded" | "failed" | "skipped" | "cancelled";
type WorkAutomationCheckpointApprovalState = "pending" | "approved" | "rejected" | "not_required";
type WorkAutomationCheckpointStatus = "open" | "approved" | "rejected" | "resumed" | "cancelled";

export interface CreateAutomationRunInput {
  tenantId: string;
  caseId: string;
  requestId?: string | null;
  taskId?: string | null;
  templateKey?: string | null;
  templateVersion?: string | null;
  title: string;
  objective?: string | null;
  mode?: "manual_assist" | "semi_auto" | "fully_auto";
  status?: "pending" | "running" | "waiting_for_input" | "waiting_for_approval" | "paused" | "completed" | "failed" | "cancelled";
  createdByUserId?: number | null;
  createdByAssistantId?: string | null;
}

export interface RecordAutomationRunStepProgressInput {
  tenantId: string;
  caseId: string;
  runId: string;
  stepKey: string;
  stepIndex: number;
  title: string;
  status: WorkAutomationStepStatus;
  riskTier?: "low" | "medium" | "high" | "critical";
  surface?: "manual" | "work_os" | "skill" | "agency" | "browser" | "document_management" | "media_studio" | "video_editor";
  inputRefsJson?: string[];
  outputRefsJson?: string[];
  retryCount?: number;
  idempotencyKey?: string | null;
  summary?: string | null;
  detailJson?: Record<string, unknown> | null;
  checkpointId?: string | null;
  startedAt?: Date | null;
  completedAt?: Date | null;
  runStatus?: WorkAutomationRunStatus;
  finalDisposition?: string | null;
  finalDispositionReason?: string | null;
  createdByUserId?: number | null;
  createdByAssistantId?: string | null;
}

export interface RecordAutomationCheckpointInput {
  tenantId: string;
  caseId: string;
  runId: string;
  stepId?: string | null;
  stepKey?: string | null;
  checkpointKey: string;
  resumeCursor: string;
  approvalState?: WorkAutomationCheckpointApprovalState;
  checkpointStatus?: WorkAutomationCheckpointStatus;
  editSnapshotRefsJson?: string[];
  snapshotJson?: Record<string, unknown>;
  detailJson?: Record<string, unknown> | null;
  requestedByUserId?: number | null;
  approvedByUserId?: number | null;
  actorAssistantId?: string | null;
  requestedAt?: Date | null;
  approvedAt?: Date | null;
  resumedAt?: Date | null;
}

export interface RecordAutomationModeChangeInput {
  tenantId: string;
  caseId: string;
  runId: string;
  fromMode?: WorkAutomationMode | null;
  toMode: WorkAutomationMode;
  reason?: string | null;
  detailJson?: Record<string, unknown> | null;
  actorUserId?: number | null;
  actorAssistantId?: string | null;
}

export interface AutomationRunProjection {
  run: WorkAutomationRun;
  steps: WorkAutomationRunStep[];
  checkpoints: WorkAutomationRunCheckpoint[];
  events: WorkAutomationRunEvent[];
}

export interface CaseAutomationProjection {
  run: WorkAutomationRun | null;
  steps: WorkAutomationRunStep[];
  checkpoints: WorkAutomationRunCheckpoint[];
  events: WorkAutomationRunEvent[];
}

function now(): Date {
  return new Date();
}

function eventPayload(detailJson: Record<string, unknown> | null | undefined): Record<string, unknown> | null {
  return detailJson && Object.keys(detailJson).length > 0 ? detailJson : null;
}

async function loadCaseRecord(caseId: string, tenantId: string): Promise<WorkCase | null> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const [record] = await db
    .select()
    .from(workCases)
    .where(and(eq(workCases.id, caseId), eq(workCases.tenantId, tenantId)))
    .limit(1);

  return record ?? null;
}

async function loadRequestRecord(requestId: string, tenantId: string): Promise<WorkRequest | null> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const [record] = await db
    .select()
    .from(workRequests)
    .where(and(eq(workRequests.id, requestId), eq(workRequests.tenantId, tenantId)))
    .limit(1);

  return record ?? null;
}

async function loadRunRecord(runId: string, tenantId: string): Promise<WorkAutomationRun | null> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const [record] = await db
    .select()
    .from(workAutomationRuns)
    .where(and(eq(workAutomationRuns.id, runId), eq(workAutomationRuns.tenantId, tenantId)))
    .limit(1);

  return record ?? null;
}

async function loadStepRecord(stepId: string, tenantId: string): Promise<WorkAutomationRunStep | null> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const [record] = await db
    .select()
    .from(workAutomationRunSteps)
    .where(and(eq(workAutomationRunSteps.id, stepId), eq(workAutomationRunSteps.tenantId, tenantId)))
    .limit(1);

  return record ?? null;
}

async function loadRunByCase(caseId: string, tenantId: string): Promise<WorkAutomationRun | null> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const [record] = await db
    .select()
    .from(workAutomationRuns)
    .where(and(eq(workAutomationRuns.caseId, caseId), eq(workAutomationRuns.tenantId, tenantId)))
    .orderBy(desc(workAutomationRuns.createdAt))
    .limit(1);

  return record ?? null;
}

async function loadCheckpointRecord(checkpointId: string, tenantId: string): Promise<WorkAutomationRunCheckpoint | null> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const [record] = await db
    .select()
    .from(workAutomationRunCheckpoints)
    .where(and(eq(workAutomationRunCheckpoints.id, checkpointId), eq(workAutomationRunCheckpoints.tenantId, tenantId)))
    .limit(1);

  return record ?? null;
}

function normalizePolicyFromRun(run: WorkAutomationRun, caseRecord: WorkCase, requestRecord: WorkRequest | null): WorkAutomationLaunchPolicy {
  const policy = resolveAutomationLaunchPolicy({
    caseRecord,
    requestRecord,
    templateKey: run.templateKey,
    templateVersion: run.templateVersion ?? null,
    mode: run.currentMode,
  });
  return policy;
}

async function syncCaseAutomationState(input: {
  tenantId: string;
  caseId: string;
  runId?: string | null;
  mode?: WorkAutomationMode | null;
  templateKey?: string | null;
  templateFamily?: string | null;
  templateSource?: string | null;
  policyJson?: Record<string, unknown> | null;
  stepId?: string | null;
  checkpointId?: string | null;
  disposition?: string | null;
  summary?: string | null;
}): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const payload: Record<string, unknown> = {
    automationUpdatedAt: now(),
    updatedAt: now(),
  };
  if (input.runId !== undefined) payload.automationRunId = input.runId;
  if (input.mode !== undefined && input.mode !== null) payload.automationMode = input.mode;
  if (input.templateKey !== undefined) payload.automationTemplateKey = input.templateKey;
  if (input.templateFamily !== undefined && input.templateFamily !== null) payload.automationTemplateFamily = input.templateFamily;
  if (input.templateSource !== undefined && input.templateSource !== null) payload.automationTemplateSource = input.templateSource;
  if (input.policyJson !== undefined && input.policyJson !== null) payload.automationPolicyJson = input.policyJson;
  if (input.stepId !== undefined) payload.automationStepId = input.stepId;
  if (input.checkpointId !== undefined) payload.automationCheckpointId = input.checkpointId;
  if (input.disposition !== undefined) payload.automationDisposition = input.disposition;
  if (input.summary !== undefined) payload.automationSummary = input.summary;

  await db
    .update(workCases)
    .set(payload as any)
    .where(and(eq(workCases.id, input.caseId), eq(workCases.tenantId, input.tenantId)))
    .returning();
}

function deriveRunStatusFromStep(
  stepStatus: RecordAutomationRunStepProgressInput["status"],
  currentStatus?: RecordAutomationRunStepProgressInput["runStatus"],
): WorkAutomationRunStatus {
  if (currentStatus) {
    return currentStatus;
  }
  switch (stepStatus) {
    case "awaiting_approval":
      return "waiting_for_approval";
    case "needs_input":
    case "blocked":
      return "waiting_for_input";
    case "failed":
      return "failed";
    case "cancelled":
      return "cancelled";
    case "succeeded":
    case "skipped":
      return "running";
    case "planned":
    case "running":
    default:
      return "running";
  }
}

function deriveRunStatusFromCheckpoint(
  checkpointStatus: RecordAutomationCheckpointInput["checkpointStatus"],
  approvalState: RecordAutomationCheckpointInput["approvalState"],
): WorkAutomationRunStatus {
  if (checkpointStatus === "cancelled") return "cancelled";
  if (checkpointStatus === "rejected" || approvalState === "rejected") return "paused";
  if (checkpointStatus === "resumed" || approvalState === "approved") return "running";
  return "waiting_for_approval";
}

async function loadOpenCriticalExceptions(caseId: string, tenantId: string): Promise<WorkException[]> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  return db
    .select()
    .from(workExceptions)
    .where(and(
      eq(workExceptions.caseId, caseId),
      eq(workExceptions.tenantId, tenantId),
      or(
        eq(workExceptions.status, "open"),
        eq(workExceptions.status, "paused"),
      ),
    ))
    .limit(50);
}

async function hasUnresolvedAutomationCheckpoint(runId: string, tenantId: string): Promise<boolean> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const rows = await db
    .select()
    .from(workAutomationRunCheckpoints)
    .where(and(
      eq(workAutomationRunCheckpoints.runId, runId),
      eq(workAutomationRunCheckpoints.tenantId, tenantId),
    ))
    .limit(50);

  return rows.some((checkpoint) => checkpoint.approvalState === "pending" || checkpoint.checkpointStatus === "open" || checkpoint.checkpointStatus === "rejected");
}

async function insertRunEvent(input: InsertWorkAutomationRunEvent): Promise<WorkAutomationRunEvent> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const [event] = await db.insert(workAutomationRunEvents).values(input).returning();
  return event;
}

export async function createAutomationRun(input: CreateAutomationRunInput): Promise<WorkAutomationRun> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const currentCase = await loadCaseRecord(input.caseId, input.tenantId);
  if (!currentCase) {
    throw new Error(`Work case ${input.caseId} not found`);
  }
  const requestId = input.requestId ?? currentCase.requestId;
  const request = requestId ? await loadRequestRecord(requestId, input.tenantId) : null;

  const resolvedPolicy = resolveAutomationLaunchPolicy({
    caseRecord: currentCase,
    requestRecord: request,
    templateKey: input.templateKey ?? null,
    templateVersion: input.templateVersion ?? null,
    mode: input.mode ?? null,
  });
  const policySnapshot = buildAutomationPolicySnapshot(resolvedPolicy);
  const effectiveTitle = input.title.trim();
  const effectiveObjective = input.objective ?? currentCase.summary ?? request?.objective ?? null;

  const [run] = await db.insert(workAutomationRuns).values({
    id: crypto.randomUUID(),
    tenantId: input.tenantId,
    requestId: input.requestId ?? currentCase.requestId,
    caseId: currentCase.id,
    taskId: input.taskId ?? currentCase.primaryTaskId ?? null,
    templateKey: resolvedPolicy.templateKey,
    templateVersion: resolvedPolicy.templateVersion,
    templateFamily: resolvedPolicy.templateFamily,
    templateSource: resolvedPolicy.templateSource,
    title: effectiveTitle,
    objective: effectiveObjective,
    currentMode: resolvedPolicy.modeResolution.effectiveMode,
    status: input.status ?? "pending",
    createdByUserId: input.createdByUserId ?? null,
    createdByAssistantId: input.createdByAssistantId ?? null,
    startedAt: input.status && input.status !== "pending" ? now() : null,
    policyJson: policySnapshot,
    resolvedAt: now(),
    createdAt: now(),
    updatedAt: now(),
  } satisfies InsertWorkAutomationRun).returning();

  await syncCaseAutomationState({
    tenantId: input.tenantId,
    caseId: currentCase.id,
    runId: run.id,
    mode: run.currentMode,
    templateKey: run.templateKey,
    templateFamily: run.templateFamily,
    templateSource: run.templateSource,
    policyJson: policySnapshot,
    summary: run.objective ?? run.title,
  });

  await insertRunEvent({
    id: crypto.randomUUID(),
    tenantId: input.tenantId,
    requestId: run.requestId ?? null,
    caseId: currentCase.id,
    runId: run.id,
    eventType: "automation_run_created",
    fromMode: null,
    toMode: run.currentMode,
    status: run.status,
    detailJson: eventPayload({
      templateKey: run.templateKey,
      templateVersion: run.templateVersion ?? null,
      templateFamily: run.templateFamily,
      templateSource: run.templateSource,
      policyJson: policySnapshot,
      title: run.title,
      objective: run.objective ?? null,
    }) ?? {},
    actorUserId: input.createdByUserId ?? null,
    actorAssistantId: input.createdByAssistantId ?? null,
    createdAt: now(),
  });

  return run;
}

export async function recordAutomationRunStepProgress(input: RecordAutomationRunStepProgressInput): Promise<{ run: WorkAutomationRun; step: WorkAutomationRunStep }> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const run = await loadRunRecord(input.runId, input.tenantId);
  if (!run) {
    throw new Error(`Automation run ${input.runId} not found`);
  }
  const currentCase = await loadCaseRecord(input.caseId, input.tenantId);
  if (!currentCase || currentCase.id !== run.caseId) {
    throw new Error(`Automation case ${input.caseId} not found for run ${input.runId}`);
  }
  const request = currentCase.requestId ? await loadRequestRecord(currentCase.requestId, input.tenantId) : null;
  const policy = normalizePolicyFromRun(run, currentCase, request);
  const stepRoute = resolveAutomationStepRoute({
    stepKey: input.stepKey,
    policy,
    requestedSurface: input.surface ?? null,
  });

  const stepStatus = input.status;
  const nextRunStatus = deriveRunStatusFromStep(stepStatus, input.runStatus);
  const stepPayload = {
    id: crypto.randomUUID(),
    tenantId: input.tenantId,
    requestId: run.requestId ?? null,
    caseId: input.caseId,
    runId: run.id,
    stepKey: input.stepKey,
    stepIndex: input.stepIndex,
    title: input.title,
    status: stepStatus,
    riskTier: input.riskTier ?? stepRoute.riskTier ?? "medium",
    surface: stepRoute.surface,
    inputRefsJson: input.inputRefsJson ?? [],
    outputRefsJson: input.outputRefsJson ?? [],
    retryCount: input.retryCount ?? 0,
    idempotencyKey: input.idempotencyKey ?? null,
    summary: input.summary ?? null,
    detailJson: input.detailJson ?? {},
    actorUserId: input.createdByUserId ?? null,
    actorAssistantId: input.createdByAssistantId ?? null,
    startedAt: input.startedAt ?? (stepStatus === "running" ? now() : null),
    completedAt: input.completedAt ?? (stepStatus === "succeeded" || stepStatus === "failed" || stepStatus === "skipped" || stepStatus === "cancelled" ? now() : null),
    createdAt: now(),
    updatedAt: now(),
  } satisfies InsertWorkAutomationRunStep;

  const [step] = await db.insert(workAutomationRunSteps).values(stepPayload).returning();

  const [updatedRun] = await db
    .update(workAutomationRuns)
    .set({
      currentStepId: step.id,
      status: nextRunStatus,
      currentMode: run.currentMode,
      finalDisposition: input.finalDisposition ?? run.finalDisposition ?? null,
      finalDispositionReason: input.finalDispositionReason ?? run.finalDispositionReason ?? null,
      completedAt: nextRunStatus === "completed" || nextRunStatus === "failed" || nextRunStatus === "cancelled" ? now() : run.completedAt,
      startedAt: run.startedAt ?? now(),
      updatedAt: now(),
    })
    .where(and(eq(workAutomationRuns.id, run.id), eq(workAutomationRuns.tenantId, input.tenantId)))
    .returning();

  await syncCaseAutomationState({
    tenantId: input.tenantId,
    caseId: input.caseId,
    runId: updatedRun.id,
    mode: updatedRun.currentMode,
    stepId: step.id,
    disposition: updatedRun.finalDisposition ?? null,
    summary: input.summary ?? step.summary ?? updatedRun.objective ?? updatedRun.title,
  });

  await insertRunEvent({
    id: crypto.randomUUID(),
    tenantId: input.tenantId,
    requestId: run.requestId ?? null,
    caseId: input.caseId,
    runId: run.id,
    stepId: step.id,
    eventType: `automation_step_${step.status}`,
    fromMode: run.currentMode,
    toMode: updatedRun.currentMode,
    status: updatedRun.status,
    detailJson: eventPayload({
      stepKey: step.stepKey,
      stepIndex: step.stepIndex,
      title: step.title,
      status: step.status,
      riskTier: step.riskTier,
      surface: step.surface,
      routePolicy: {
        templateKey: policy.templateKey,
        templateFamily: policy.templateFamily,
        templateVersion: policy.templateVersion,
        templateSource: policy.templateSource,
      },
      inputRefsJson: step.inputRefsJson,
      outputRefsJson: step.outputRefsJson,
      retryCount: step.retryCount,
      idempotencyKey: step.idempotencyKey ?? null,
    }) ?? {},
    actorUserId: input.createdByUserId ?? null,
    actorAssistantId: input.createdByAssistantId ?? null,
    createdAt: now(),
  });

  return { run: updatedRun, step };
}

export async function updateAutomationRunStepProgress(input: RecordAutomationRunStepProgressInput & { stepId: string }): Promise<{ run: WorkAutomationRun; step: WorkAutomationRunStep }> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const run = await loadRunRecord(input.runId, input.tenantId);
  if (!run) {
    throw new Error(`Automation run ${input.runId} not found`);
  }
  const currentCase = await loadCaseRecord(input.caseId, input.tenantId);
  if (!currentCase || currentCase.id !== run.caseId) {
    throw new Error(`Automation case ${input.caseId} not found for run ${input.runId}`);
  }
  const existingStep = await loadStepRecord(input.stepId, input.tenantId);
  if (!existingStep || existingStep.runId !== run.id) {
    throw new Error(`Automation step ${input.stepId} not found for run ${input.runId}`);
  }

  const request = currentCase.requestId ? await loadRequestRecord(currentCase.requestId, input.tenantId) : null;
  const policy = normalizePolicyFromRun(run, currentCase, request);
  const stepRoute = resolveAutomationStepRoute({
    stepKey: input.stepKey,
    policy,
    requestedSurface: input.surface ?? existingStep.surface,
  });

  const stepStatus = input.status;
  const nextRunStatus = deriveRunStatusFromStep(stepStatus, input.runStatus);

  const [step] = await db
    .update(workAutomationRunSteps)
    .set({
      title: input.title ?? existingStep.title,
      status: stepStatus,
      riskTier: input.riskTier ?? existingStep.riskTier ?? stepRoute.riskTier ?? "medium",
      surface: stepRoute.surface,
      inputRefsJson: input.inputRefsJson ?? existingStep.inputRefsJson ?? [],
      outputRefsJson: input.outputRefsJson ?? existingStep.outputRefsJson ?? [],
      retryCount: input.retryCount ?? existingStep.retryCount ?? 0,
      idempotencyKey: input.idempotencyKey ?? existingStep.idempotencyKey ?? null,
      summary: input.summary ?? existingStep.summary ?? null,
      detailJson: input.detailJson ?? existingStep.detailJson ?? {},
      actorUserId: input.createdByUserId ?? existingStep.actorUserId ?? null,
      actorAssistantId: input.createdByAssistantId ?? existingStep.actorAssistantId ?? null,
      startedAt: input.startedAt ?? existingStep.startedAt ?? (stepStatus === "running" ? now() : null),
      completedAt: input.completedAt ?? (stepStatus === "succeeded" || stepStatus === "failed" || stepStatus === "skipped" || stepStatus === "cancelled" ? now() : existingStep.completedAt),
      updatedAt: now(),
    })
    .where(and(eq(workAutomationRunSteps.id, existingStep.id), eq(workAutomationRunSteps.tenantId, input.tenantId)))
    .returning();

  const [updatedRun] = await db
    .update(workAutomationRuns)
    .set({
      currentStepId: step.id,
      status: nextRunStatus,
      currentMode: run.currentMode,
      finalDisposition: input.finalDisposition ?? run.finalDisposition ?? null,
      finalDispositionReason: input.finalDispositionReason ?? run.finalDispositionReason ?? null,
      completedAt: nextRunStatus === "completed" || nextRunStatus === "failed" || nextRunStatus === "cancelled" ? now() : run.completedAt,
      startedAt: run.startedAt ?? now(),
      updatedAt: now(),
    })
    .where(and(eq(workAutomationRuns.id, run.id), eq(workAutomationRuns.tenantId, input.tenantId)))
    .returning();

  await syncCaseAutomationState({
    tenantId: input.tenantId,
    caseId: input.caseId,
    runId: updatedRun.id,
    mode: updatedRun.currentMode,
    stepId: step.id,
    disposition: updatedRun.finalDisposition ?? null,
    summary: input.summary ?? step.summary ?? updatedRun.objective ?? updatedRun.title,
  });

  await insertRunEvent({
    id: crypto.randomUUID(),
    tenantId: input.tenantId,
    requestId: run.requestId ?? null,
    caseId: input.caseId,
    runId: run.id,
    stepId: step.id,
    eventType: `automation_step_${step.status}`,
    fromMode: run.currentMode,
    toMode: updatedRun.currentMode,
    status: updatedRun.status,
    detailJson: eventPayload({
      stepKey: step.stepKey,
      stepIndex: step.stepIndex,
      title: step.title,
      status: step.status,
      riskTier: step.riskTier,
      surface: step.surface,
      routePolicy: {
        templateKey: policy.templateKey,
        templateFamily: policy.templateFamily,
        templateVersion: policy.templateVersion,
        templateSource: policy.templateSource,
      },
      inputRefsJson: step.inputRefsJson,
      outputRefsJson: step.outputRefsJson,
      retryCount: step.retryCount,
      idempotencyKey: step.idempotencyKey ?? null,
    }) ?? {},
    actorUserId: input.createdByUserId ?? null,
    actorAssistantId: input.createdByAssistantId ?? null,
    createdAt: now(),
  });

  return { run: updatedRun, step };
}

export async function recordAutomationCheckpoint(input: RecordAutomationCheckpointInput): Promise<{ run: WorkAutomationRun; checkpoint: WorkAutomationRunCheckpoint }> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const run = await loadRunRecord(input.runId, input.tenantId);
  if (!run) {
    throw new Error(`Automation run ${input.runId} not found`);
  }
  const currentCase = await loadCaseRecord(input.caseId, input.tenantId);
  if (!currentCase || currentCase.id !== run.caseId) {
    throw new Error(`Automation case ${input.caseId} not found for run ${input.runId}`);
  }

  const approvalState = input.approvalState ?? "pending";
  const checkpointStatus = input.checkpointStatus ?? "open";
  const [checkpoint] = await db.insert(workAutomationRunCheckpoints).values({
    id: crypto.randomUUID(),
    tenantId: input.tenantId,
    requestId: run.requestId ?? null,
    caseId: input.caseId,
    runId: run.id,
    stepId: input.stepId ?? null,
    stepKey: input.stepKey ?? null,
    checkpointKey: input.checkpointKey,
    resumeCursor: input.resumeCursor,
    approvalState,
    checkpointStatus,
    editSnapshotRefsJson: input.editSnapshotRefsJson ?? [],
    snapshotJson: input.snapshotJson ?? {},
    detailJson: input.detailJson ?? {},
    requestedByUserId: input.requestedByUserId ?? null,
    approvedByUserId: input.approvedByUserId ?? null,
    actorAssistantId: input.actorAssistantId ?? null,
    requestedAt: input.requestedAt ?? (approvalState === "pending" ? now() : null),
    approvedAt: input.approvedAt ?? (approvalState === "approved" ? now() : null),
    resumedAt: input.resumedAt ?? (checkpointStatus === "resumed" ? now() : null),
    createdAt: now(),
    updatedAt: now(),
  } satisfies InsertWorkAutomationRunCheckpoint).returning();

  const nextRunStatus = deriveRunStatusFromCheckpoint(checkpoint.checkpointStatus, checkpoint.approvalState);
  const [updatedRun] = await db
    .update(workAutomationRuns)
    .set({
      currentCheckpointId: checkpoint.id,
      currentStepId: input.stepId ?? run.currentStepId ?? null,
      status: nextRunStatus,
      finalDisposition: run.finalDisposition ?? null,
      finalDispositionReason: run.finalDispositionReason ?? null,
      updatedAt: now(),
      completedAt: nextRunStatus === "completed" ? now() : run.completedAt,
      startedAt: run.startedAt ?? now(),
    })
    .where(and(eq(workAutomationRuns.id, run.id), eq(workAutomationRuns.tenantId, input.tenantId)))
    .returning();

  await syncCaseAutomationState({
    tenantId: input.tenantId,
    caseId: input.caseId,
    runId: updatedRun.id,
    mode: updatedRun.currentMode,
    stepId: input.stepId ?? run.currentStepId ?? null,
    checkpointId: checkpoint.id,
    disposition: updatedRun.finalDisposition ?? null,
    summary: run.objective ?? run.title,
  });

  await insertRunEvent({
    id: crypto.randomUUID(),
    tenantId: input.tenantId,
    requestId: run.requestId ?? null,
    caseId: input.caseId,
    runId: run.id,
    stepId: input.stepId ?? null,
    checkpointId: checkpoint.id,
    eventType: `automation_checkpoint_${checkpoint.checkpointStatus}`,
    fromMode: run.currentMode,
    toMode: updatedRun.currentMode,
    status: updatedRun.status,
    detailJson: eventPayload({
      checkpointKey: checkpoint.checkpointKey,
      resumeCursor: checkpoint.resumeCursor,
      approvalState: checkpoint.approvalState,
      checkpointStatus: checkpoint.checkpointStatus,
      editSnapshotRefsJson: checkpoint.editSnapshotRefsJson,
    }) ?? {},
    actorUserId: input.requestedByUserId ?? input.approvedByUserId ?? null,
    actorAssistantId: input.actorAssistantId ?? null,
    createdAt: now(),
  });

  return { run: updatedRun, checkpoint };
}

export async function resumeAutomationRunFromCheckpoint(input: {
  tenantId: string;
  caseId: string;
  runId: string;
  checkpointId: string;
  requestedByUserId?: number | null;
  actorAssistantId?: string | null;
}): Promise<{ run: WorkAutomationRun; checkpoint: WorkAutomationRunCheckpoint }> {
  const checkpoint = await loadCheckpointRecord(input.checkpointId, input.tenantId);
  if (!checkpoint) {
    throw new Error(`Automation checkpoint ${input.checkpointId} not found`);
  }

  return recordAutomationCheckpoint({
    tenantId: input.tenantId,
    caseId: input.caseId,
    runId: input.runId,
    stepId: checkpoint.stepId ?? null,
    stepKey: checkpoint.stepKey ?? null,
    checkpointKey: `${checkpoint.checkpointKey}:resume`,
    resumeCursor: checkpoint.resumeCursor,
    approvalState: "approved",
    checkpointStatus: "resumed",
    editSnapshotRefsJson: checkpoint.editSnapshotRefsJson,
    snapshotJson: checkpoint.snapshotJson,
    detailJson: {
      ...(checkpoint.detailJson ?? {}),
      resumedFromCheckpointId: checkpoint.id,
      resumedFromCheckpointKey: checkpoint.checkpointKey,
    },
    requestedByUserId: input.requestedByUserId ?? checkpoint.requestedByUserId ?? null,
    approvedByUserId: input.requestedByUserId ?? checkpoint.approvedByUserId ?? null,
    actorAssistantId: input.actorAssistantId ?? checkpoint.actorAssistantId ?? null,
    resumedAt: now(),
  });
}

export async function recordAutomationModeChange(input: RecordAutomationModeChangeInput): Promise<{ run: WorkAutomationRun; event: WorkAutomationRunEvent }> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const run = await loadRunRecord(input.runId, input.tenantId);
  if (!run) {
    throw new Error(`Automation run ${input.runId} not found`);
  }
  const currentCase = await loadCaseRecord(input.caseId, input.tenantId);
  if (!currentCase || currentCase.id !== run.caseId) {
    throw new Error(`Automation case ${input.caseId} not found for run ${input.runId}`);
  }
  const request = currentCase.requestId ? await loadRequestRecord(currentCase.requestId, input.tenantId) : null;
  const policy = normalizePolicyFromRun(run, currentCase, request);
  const hasOpenCriticalException = (await loadOpenCriticalExceptions(input.caseId, input.tenantId)).some((exception) =>
    exception.severity === "critical" || exception.severity === "high");
  const hasUnresolvedCheckpoint = await hasUnresolvedAutomationCheckpoint(input.runId, input.tenantId);
  const transition = validateAutomationModeTransition({
    fromMode: input.fromMode ?? run.currentMode,
    toMode: input.toMode,
    policy,
    runStatus: run.status,
    hasOpenCriticalException,
    hasUnresolvedCheckpoint,
  });
  if (!transition.allowed) {
    throw new Error(`Mode transition blocked: ${transition.reason}`);
  }

  const previousMode = input.fromMode ?? run.currentMode;
  const [updatedRun] = await db
    .update(workAutomationRuns)
    .set({
      currentMode: input.toMode,
      updatedAt: now(),
      startedAt: run.startedAt ?? now(),
    })
    .where(and(eq(workAutomationRuns.id, run.id), eq(workAutomationRuns.tenantId, input.tenantId)))
    .returning();

  await syncCaseAutomationState({
    tenantId: input.tenantId,
    caseId: input.caseId,
    runId: updatedRun.id,
    mode: updatedRun.currentMode,
    stepId: updatedRun.currentStepId ?? null,
    checkpointId: updatedRun.currentCheckpointId ?? null,
    disposition: updatedRun.finalDisposition ?? null,
    summary: updatedRun.objective ?? updatedRun.title,
  });

  const event = await insertRunEvent({
    id: crypto.randomUUID(),
    tenantId: input.tenantId,
    requestId: run.requestId ?? null,
    caseId: input.caseId,
    runId: run.id,
    eventType: "automation_mode_changed",
    fromMode: previousMode,
    toMode: input.toMode,
    status: updatedRun.status,
    detailJson: eventPayload({
      reason: input.reason ?? null,
      transitionReason: transition.reason,
      policy: {
        templateKey: policy.templateKey,
        templateFamily: policy.templateFamily,
        templateVersion: policy.templateVersion,
        templateSource: policy.templateSource,
        confidence: policy.modeResolution.confidence,
      },
    }) ?? {},
    actorUserId: input.actorUserId ?? null,
    actorAssistantId: input.actorAssistantId ?? null,
    createdAt: now(),
  });

  return { run: updatedRun, event };
}

export async function getAutomationRunProjection(runId: string, tenantId: string): Promise<AutomationRunProjection> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const run = await loadRunRecord(runId, tenantId);
  if (!run) {
    throw new Error(`Automation run ${runId} not found`);
  }

  const [steps, checkpoints, events] = await Promise.all([
    db.select().from(workAutomationRunSteps).where(and(eq(workAutomationRunSteps.runId, run.id), eq(workAutomationRunSteps.tenantId, tenantId))).orderBy(desc(workAutomationRunSteps.createdAt)),
    db.select().from(workAutomationRunCheckpoints).where(and(eq(workAutomationRunCheckpoints.runId, run.id), eq(workAutomationRunCheckpoints.tenantId, tenantId))).orderBy(desc(workAutomationRunCheckpoints.createdAt)),
    db.select().from(workAutomationRunEvents).where(and(eq(workAutomationRunEvents.runId, run.id), eq(workAutomationRunEvents.tenantId, tenantId))).orderBy(desc(workAutomationRunEvents.createdAt)),
  ]);

  return { run, steps, checkpoints, events };
}

export async function getAutomationProjectionForCase(caseId: string, tenantId: string): Promise<CaseAutomationProjection> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const run = await loadRunByCase(caseId, tenantId);
  if (!run) {
    return { run: null, steps: [], checkpoints: [], events: [] };
  }

  const [steps, checkpoints, events] = await Promise.all([
    db.select().from(workAutomationRunSteps).where(and(eq(workAutomationRunSteps.caseId, caseId), eq(workAutomationRunSteps.tenantId, tenantId))).orderBy(desc(workAutomationRunSteps.createdAt)),
    db.select().from(workAutomationRunCheckpoints).where(and(eq(workAutomationRunCheckpoints.caseId, caseId), eq(workAutomationRunCheckpoints.tenantId, tenantId))).orderBy(desc(workAutomationRunCheckpoints.createdAt)),
    db.select().from(workAutomationRunEvents).where(and(eq(workAutomationRunEvents.caseId, caseId), eq(workAutomationRunEvents.tenantId, tenantId))).orderBy(desc(workAutomationRunEvents.createdAt)),
  ]);

  return {
    run,
    steps,
    checkpoints,
    events,
  };
}

export async function buildAutomationTimelineEntries(caseId: string, tenantId: string): Promise<Array<{
  id: string;
  source: "work_os";
  eventType: string;
  createdAt: Date;
  requestId: string | null;
  caseId: string | null;
  taskId: string | null;
  detailJson: Record<string, unknown> | null;
}>> {
  const projection = await getAutomationProjectionForCase(caseId, tenantId);
  const entries = [
    ...projection.events.map((event) => ({
      id: `automation-event-${event.id}`,
      source: "work_os" as const,
      eventType: event.eventType,
      createdAt: event.createdAt,
      requestId: event.requestId ?? null,
      caseId: event.caseId,
      taskId: null,
      detailJson: {
        eventType: event.eventType,
        runId: event.runId,
        stepId: event.stepId ?? null,
        checkpointId: event.checkpointId ?? null,
        fromMode: event.fromMode ?? null,
        toMode: event.toMode ?? null,
        status: event.status ?? null,
        ...event.detailJson,
      },
    })),
    ...projection.steps.map((step) => ({
      id: `automation-step-${step.id}`,
      source: "work_os" as const,
      eventType: `automation_step_${step.status}`,
      createdAt: step.updatedAt ?? step.createdAt,
      requestId: step.requestId ?? null,
      caseId: step.caseId,
      taskId: null,
      detailJson: {
        stepId: step.id,
        runId: step.runId,
        stepKey: step.stepKey,
        stepIndex: step.stepIndex,
        title: step.title,
        status: step.status,
        surface: step.surface,
        riskTier: step.riskTier,
        retryCount: step.retryCount,
        inputRefsJson: step.inputRefsJson,
        outputRefsJson: step.outputRefsJson,
        idempotencyKey: step.idempotencyKey ?? null,
        ...step.detailJson,
      },
    })),
    ...projection.checkpoints.map((checkpoint) => ({
      id: `automation-checkpoint-${checkpoint.id}`,
      source: "work_os" as const,
      eventType: `automation_checkpoint_${checkpoint.checkpointStatus}`,
      createdAt: checkpoint.updatedAt ?? checkpoint.createdAt,
      requestId: checkpoint.requestId ?? null,
      caseId: checkpoint.caseId,
      taskId: null,
      detailJson: {
        checkpointId: checkpoint.id,
        runId: checkpoint.runId,
        checkpointKey: checkpoint.checkpointKey,
        resumeCursor: checkpoint.resumeCursor,
        approvalState: checkpoint.approvalState,
        checkpointStatus: checkpoint.checkpointStatus,
        stepId: checkpoint.stepId ?? null,
        stepKey: checkpoint.stepKey ?? null,
        editSnapshotRefsJson: checkpoint.editSnapshotRefsJson,
        snapshotJson: checkpoint.snapshotJson,
        ...checkpoint.detailJson,
      },
    })),
  ].sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime());

  return entries;
}

export async function listAutomationRunsForCase(caseId: string, tenantId: string): Promise<WorkAutomationRun[]> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  return db
    .select()
    .from(workAutomationRuns)
    .where(and(eq(workAutomationRuns.caseId, caseId), eq(workAutomationRuns.tenantId, tenantId)))
    .orderBy(desc(workAutomationRuns.createdAt));
}
