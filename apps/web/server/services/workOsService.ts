import crypto from "crypto";
import { and, asc, desc, eq, inArray, or } from "drizzle-orm";
import {
  teamRuns,
  teamRooms,
  teamWorkItems,
  workAssignments,
  workApprovals,
  workCases,
  workExceptions,
  workItemEvents,
  workOsEvents,
  workOutcomes,
  workRequests,
  workSlas,
  workpackRecords,
  type InsertWorkApproval,
  type InsertWorkAssignment,
  type InsertWorkCase,
  type InsertWorkException,
  type InsertWorkOutcome,
  type InsertWorkOsEvent,
  type InsertWorkRequest,
  type InsertWorkSla,
  type TeamWorkItem,
  type WorkAssignment,
  type WorkApproval,
  type WorkCase,
  type WorkException,
  type WorkOutcome,
  type WorkRequest,
  type WorkSla,
} from "../../drizzle/schema";
import { getDb } from "../db";
import { describeStatusBridge, mapTeamRunStatusToWorkOsState } from "./workStatusBridge";
import {
  buildAutomationTimelineEntries,
  getAutomationProjectionForCase,
  type CaseAutomationProjection,
} from "./workAutomationFabricService";
import { buildBrowserAutomationTimelineEntries } from "./workAutomationBrowserTaskService";
import { getRoleRoutineRun, listRoleRoutineRunsForRoutine } from "./rolePersistence";
import * as workItemService from "./workItemService";

export interface CreateWorkRequestInput {
  tenantId: string;
  projectId?: number | null;
  sourceType: string;
  sourceRef?: string | null;
  requesterType?: "human" | "queue" | "role" | "hybrid";
  requesterId?: string | null;
  workType?: string | null;
  businessDomain?: string | null;
  urgency?: string | null;
  riskLevel?: string | null;
  classificationConfidence?: number | null;
  defaultOwnerType?: "human" | "queue" | "role" | "hybrid" | null;
  defaultOwnerId?: string | null;
  defaultQueueId?: string | null;
  title: string;
  objective?: string | null;
  linkedConversationIds?: string[];
  linkedWorkpackRunIds?: string[];
  linkedRoleRoutineRunIds?: string[];
}

export interface CreateWorkTaskInput {
  tenantId: string;
  caseId: string;
  teamId: string;
  roomId: string;
  runId?: string | null;
  title: string;
  objective?: string | null;
  sourceType?: string | null;
  sourceRef?: string | null;
  priority?: "low" | "normal" | "high" | "urgent";
  riskClass?: "low" | "medium" | "high" | "critical";
  requiresApproval?: boolean;
  actorUserId?: number | null;
  actorAssistantId?: string | null;
}

export interface RecordApprovalInput {
  tenantId: string;
  caseId: string;
  taskId?: string | null;
  requestId?: string | null;
  approvalTransportId?: string | null;
  decision?: "pending" | "approved" | "rejected" | "cancelled";
  approverType?: "human" | "queue" | "role" | "hybrid";
  approverId?: string | null;
  comment?: string | null;
  metadataJson?: Record<string, unknown> | null;
  actorUserId?: number | null;
  actorAssistantId?: string | null;
}

export interface RecordExceptionInput {
  tenantId: string;
  caseId: string;
  taskId?: string | null;
  requestId?: string | null;
  exceptionType: string;
  severity?: string | null;
  reason?: string | null;
  ownerType?: "human" | "queue" | "role" | "hybrid" | null;
  ownerId?: string | null;
  status?: "open" | "paused" | "downgraded" | "resolved";
  metadataJson?: Record<string, unknown> | null;
  actorUserId?: number | null;
  actorAssistantId?: string | null;
}

export interface RecordOutcomeInput {
  tenantId: string;
  caseId: string;
  taskId?: string | null;
  requestId?: string | null;
  disposition: string;
  resolutionCode?: string | null;
  customerImpact?: string | null;
  reviewerResult?: string | null;
  followUpRequired?: boolean;
  summary?: string | null;
  metadataJson?: Record<string, unknown> | null;
  actorUserId?: number | null;
  actorAssistantId?: string | null;
}

export interface RecordSlaInput {
  tenantId: string;
  caseId: string;
  taskId?: string | null;
  requestId?: string | null;
  policyId?: string | null;
  dueAt?: Date | null;
  serviceWindowStartAt?: Date | null;
  serviceWindowEndAt?: Date | null;
  urgency?: string | null;
  breachState?: "none" | "at_risk" | "breached" | "resolved";
  breachedAt?: Date | null;
  escalatedAt?: Date | null;
  actorUserId?: number | null;
  actorAssistantId?: string | null;
}

export interface RecordAssignmentInput {
  tenantId: string;
  caseId: string;
  taskId?: string | null;
  requestId?: string | null;
  ownerType: "human" | "queue" | "role" | "hybrid";
  ownerId?: string | null;
  previousOwnerType?: "human" | "queue" | "role" | "hybrid" | null;
  previousOwnerId?: string | null;
  assignmentSource?: string | null;
  reason?: string | null;
  actorUserId?: number | null;
  actorAssistantId?: string | null;
}

export interface WorkTimelineEntry {
  id: string;
  source: "work_os" | "legacy_work_item" | "workpack_record" | "team_run" | "role_routine" | "browser_automation";
  eventType: string;
  createdAt: Date;
  requestId: string | null;
  caseId: string | null;
  taskId: string | null;
  detailJson: Record<string, unknown> | null;
}

export interface WorkCaseProjection {
  request: WorkRequest | null;
  case: WorkCase;
  task: TeamWorkItem | null;
  automation: CaseAutomationProjection;
  assignments: WorkAssignment[];
  approvals: WorkApproval[];
  exceptions: WorkException[];
  outcomes: WorkOutcome[];
  slas: WorkSla[];
  timeline: WorkTimelineEntry[];
}

function now(): Date {
  return new Date();
}

function eventPayload(detailJson: Record<string, unknown> | null | undefined): Record<string, unknown> | null {
  return detailJson && Object.keys(detailJson).length > 0 ? detailJson : null;
}

function toDate(value: string | Date | null | undefined): Date {
  if (!value) return new Date(0);
  if (value instanceof Date) return value;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? new Date(0) : parsed;
}

async function insertWorkOsEvent(input: InsertWorkOsEvent): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db.insert(workOsEvents).values(input).returning();
}

async function insertWorkAssignment(input: InsertWorkAssignment): Promise<WorkAssignment> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const [assignment] = await db.insert(workAssignments).values(input).returning();
  return assignment;
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

async function loadRequestRecord(requestId: string | null | undefined, tenantId: string): Promise<WorkRequest | null> {
  if (!requestId) return null;
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const [record] = await db
    .select()
    .from(workRequests)
    .where(and(eq(workRequests.id, requestId), eq(workRequests.tenantId, tenantId)))
    .limit(1);

  return record ?? null;
}

async function syncRequestAndCaseState(
  tenantId: string,
  caseId: string,
  nextState: typeof workCases.$inferSelect["currentState"],
  requestId?: string | null,
): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const linkedRequestId = requestId ?? (await loadCaseRecord(caseId, tenantId))?.requestId ?? null;

  await db
    .update(workCases)
    .set({
      currentState: nextState,
      updatedAt: now(),
    })
    .where(eq(workCases.id, caseId))
    .returning();

  if (linkedRequestId) {
    await db
      .update(workRequests)
      .set({
        currentState: nextState,
        updatedAt: now(),
      })
      .where(eq(workRequests.id, linkedRequestId))
      .returning();
  }
}

function resolveAssignmentOwner(input: {
  ownerType?: "human" | "queue" | "role" | "hybrid" | null;
  ownerId?: string | null;
  defaultQueueId?: string | null;
  defaultOwnerType?: "human" | "queue" | "role" | "hybrid" | null;
  defaultOwnerId?: string | null;
}): { ownerType: "human" | "queue" | "role" | "hybrid"; ownerId: string | null } | null {
  if (input.ownerType) {
    return {
      ownerType: input.ownerType,
      ownerId: input.ownerId ?? null,
    };
  }

  if (input.defaultQueueId) {
    return {
      ownerType: "queue",
      ownerId: input.defaultQueueId,
    };
  }

  if (input.defaultOwnerType) {
    return {
      ownerType: input.defaultOwnerType,
      ownerId: input.defaultOwnerId ?? null,
    };
  }

  return null;
}

async function recordAssignmentChange(input: RecordAssignmentInput): Promise<WorkAssignment | null> {
  const resolvedOwner = resolveAssignmentOwner({
    ownerType: input.ownerType,
    ownerId: input.ownerId ?? null,
  });
  if (!resolvedOwner) {
    return null;
  }

  return insertWorkAssignment({
    id: crypto.randomUUID(),
    tenantId: input.tenantId,
    requestId: input.requestId ?? null,
    caseId: input.caseId,
    taskId: input.taskId ?? null,
    previousOwnerType: input.previousOwnerType ?? null,
    previousOwnerId: input.previousOwnerId ?? null,
    ownerType: resolvedOwner.ownerType,
    ownerId: resolvedOwner.ownerId,
    assignmentSource: input.assignmentSource ?? "manual",
    reason: input.reason ?? null,
    actorAssistantId: input.actorAssistantId ?? null,
    actorUserId: input.actorUserId ?? null,
    createdAt: now(),
  } satisfies InsertWorkAssignment);
}

function mapTaskStatusToCaseState(taskStatus: TeamWorkItem["status"]): typeof workCases.$inferSelect["currentState"] {
  switch (taskStatus) {
    case "in_progress":
      return "in_progress";
    case "in_review":
      return "waiting_for_approval";
    case "needs_revision":
      return "waiting_for_input";
    case "awaiting_approval":
      return "waiting_for_approval";
    case "completed":
      return "completed";
    case "failed":
      return "failed";
    case "blocked":
      return "blocked";
    case "cancelled":
      return "cancelled";
    case "superseded":
      return "triaged";
    case "planned":
    default:
      return "planned";
  }
}

function coerceRequestState(state: string | null | undefined): typeof workCases.$inferSelect["currentState"] {
  if (
    state === "new"
    || state === "triaged"
    || state === "planned"
    || state === "in_progress"
    || state === "waiting_for_approval"
    || state === "waiting_for_input"
    || state === "blocked"
    || state === "escalated"
    || state === "completed"
    || state === "cancelled"
    || state === "failed"
  ) {
    return state;
  }
  return "new";
}

function uniqueIds(values: Array<string | null | undefined>): string[] {
  return Array.from(new Set(values.filter((value): value is string => Boolean(value && value.trim()))));
}

async function buildWorkpackTimelineEntries(
  tenantId: string,
  request: WorkRequest | null,
  workCase: WorkCase,
): Promise<WorkTimelineEntry[]> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const recordIds = uniqueIds([
    ...(request?.linkedWorkpackRunIdsJson ?? []),
    ...(workCase.linkedWorkpackRunIdsJson ?? []),
  ]);
  if (recordIds.length === 0) {
    return [];
  }

  const records = await db
    .select()
    .from(workpackRecords)
    .where(and(eq(workpackRecords.tenantId, tenantId), inArray(workpackRecords.recordId, recordIds)))
    .orderBy(desc(workpackRecords.createdAt));

  return records.map((entry) => ({
    id: `workpack-${entry.id}`,
    source: "workpack_record",
    eventType: entry.recordType,
    createdAt: entry.sortTimestamp ?? entry.createdAt,
    requestId: request?.id ?? null,
    caseId: workCase.id,
    taskId: null,
    detailJson: {
      recordType: entry.recordType,
      recordId: entry.recordId,
      workpackId: entry.workpackId ?? null,
      payloadJson: entry.payloadJson ?? null,
    },
  }));
}

async function buildTeamRunTimelineEntries(
  tenantId: string,
  request: WorkRequest | null,
  workCase: WorkCase,
  task: TeamWorkItem | null,
): Promise<WorkTimelineEntry[]> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const runIds = uniqueIds([
    ...(request?.linkedRoleRoutineRunIdsJson ?? []),
    ...(workCase.linkedRoleRoutineRunIdsJson ?? []),
    task?.runId ?? null,
  ]);
  if (runIds.length === 0) {
    return [];
  }

  const runs = await db
    .select({ run: teamRuns })
    .from(teamRuns)
    .innerJoin(teamRooms, eq(teamRooms.id, teamRuns.roomId))
    .where(and(eq(teamRooms.tenantId, tenantId), inArray(teamRuns.id, runIds)))
    .orderBy(desc(teamRuns.startedAt));

  return runs.map(({ run }) => ({
    id: `team-run-${run.id}`,
    source: "team_run",
    eventType: "team_run_snapshot",
    createdAt: run.endedAt ?? run.startedAt ?? new Date(0),
    requestId: request?.id ?? null,
    caseId: workCase.id,
    taskId: task?.id ?? null,
    detailJson: {
      runId: run.id,
      teamId: run.teamId,
      roomId: run.roomId,
      status: run.status,
      workOsState: mapTeamRunStatusToWorkOsState(run.status, run.stopReason),
      statusBridge: describeStatusBridge(run.status, run.stopReason),
      executionMode: run.executionMode,
      objective: run.objective,
      startedAt: run.startedAt ? run.startedAt.toISOString() : null,
      endedAt: run.endedAt ? run.endedAt.toISOString() : null,
      stopReason: run.stopReason ?? null,
      activeAssistantId: run.activeAssistantId ?? null,
      summaryArtifactId: run.summaryArtifactId ?? null,
    },
  }));
}

async function buildRoleRoutineTimelineEntries(
  tenantId: string,
  request: WorkRequest | null,
  workCase: WorkCase,
  task: TeamWorkItem | null,
): Promise<WorkTimelineEntry[]> {
  type RoleRoutineRunRecord = NonNullable<Awaited<ReturnType<typeof getRoleRoutineRun>>>;
  const linkedRunIds = uniqueIds([
    ...(request?.linkedRoleRoutineRunIdsJson ?? []),
    ...(workCase.linkedRoleRoutineRunIdsJson ?? []),
  ]);

  const runs = new Map<string, RoleRoutineRunRecord>();

  await Promise.all(linkedRunIds.map(async (runId) => {
    const run = await getRoleRoutineRun(runId);
    if (run && run.tenantId === tenantId) {
      runs.set(run.id, run);
    }
  }));

  if (runs.size === 0 && task?.routineId) {
    const routineRuns = await listRoleRoutineRunsForRoutine(task.routineId);
    for (const run of routineRuns) {
      if (run.tenantId === tenantId) {
        runs.set(run.id, run);
      }
    }
  }

  return Array.from(runs.values())
    .map((run) => ({
      id: `role-routine-${run.id}`,
      source: "role_routine" as const,
      eventType: `role_routine_${run.status}`,
      createdAt: toDate(run.updatedAt ?? run.createdAt ?? run.startedAt),
      requestId: request?.id ?? null,
      caseId: workCase.id,
      taskId: task?.id ?? null,
      detailJson: {
        routineId: run.routineId,
        routineRunId: run.id,
        status: run.status,
        triggerSource: run.triggerSource,
        selectedWorkpackFamily: run.selectedWorkpackFamily ?? null,
        resolvedWorkpackVersionId: run.resolvedWorkpackVersionId ?? null,
        linkedWorkpackRunIds: run.linkedWorkpackRunIds ?? [],
        recoveryState: run.recoveryState,
        blockerCodes: run.blockerCodes ?? [],
        currentObjectiveSummary: run.currentObjectiveSummary ?? "",
        checkpointId: run.checkpointId ?? null,
      },
    }))
    .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime());
}

export async function createWorkRequest(input: CreateWorkRequestInput): Promise<{ request: WorkRequest; case: WorkCase }> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  return db.transaction(async (tx) => {
    const initialAssignment = resolveAssignmentOwner({
      defaultQueueId: input.defaultQueueId ?? null,
      defaultOwnerType: input.defaultOwnerType ?? null,
      defaultOwnerId: input.defaultOwnerId ?? null,
    });

    const [request] = await tx.insert(workRequests).values({
      tenantId: input.tenantId,
      projectId: input.projectId ?? null,
      sourceType: input.sourceType,
      sourceRef: input.sourceRef ?? null,
      requesterType: input.requesterType ?? "human",
      requesterId: input.requesterId ?? null,
      workType: input.workType ?? null,
      businessDomain: input.businessDomain ?? null,
      urgency: input.urgency ?? "normal",
      riskLevel: input.riskLevel ?? "medium",
      classificationConfidence: input.classificationConfidence ?? null,
      defaultOwnerType: input.defaultOwnerType ?? null,
      defaultOwnerId: input.defaultOwnerId ?? null,
      defaultQueueId: input.defaultQueueId ?? null,
      title: input.title,
      objective: input.objective ?? null,
      currentState: input.classificationConfidence != null && input.classificationConfidence < 0.5 ? "triaged" : "new",
      linkedConversationIdsJson: input.linkedConversationIds ?? [],
      linkedWorkpackRunIdsJson: input.linkedWorkpackRunIds ?? [],
      linkedRoleRoutineRunIdsJson: input.linkedRoleRoutineRunIds ?? [],
    } satisfies InsertWorkRequest).returning();

    const [workCase] = await tx.insert(workCases).values({
      tenantId: input.tenantId,
      projectId: input.projectId ?? null,
      requestId: request.id,
      title: input.title,
      summary: input.objective ?? null,
      ownerType: initialAssignment?.ownerType ?? null,
      ownerId: initialAssignment?.ownerId ?? null,
      priority: "normal",
      riskLevel: input.riskLevel ?? "medium",
      dataClassification: "internal",
      currentState: request.currentState,
      linkedConversationIdsJson: input.linkedConversationIds ?? [],
      linkedWorkpackRunIdsJson: input.linkedWorkpackRunIds ?? [],
      linkedRoleRoutineRunIdsJson: input.linkedRoleRoutineRunIds ?? [],
    } satisfies InsertWorkCase).returning();

    if (initialAssignment) {
      await tx.insert(workAssignments).values({
        id: crypto.randomUUID(),
        tenantId: input.tenantId,
        requestId: request.id,
        caseId: workCase.id,
        previousOwnerType: null,
        previousOwnerId: null,
        ownerType: initialAssignment.ownerType,
        ownerId: initialAssignment.ownerId,
        assignmentSource: "initial_intake",
        reason: "Initial ownership derived from intake classification",
        createdAt: now(),
      } satisfies InsertWorkAssignment).returning();
    }

    await tx
      .update(workRequests)
      .set({
        linkedCaseId: workCase.id,
        updatedAt: now(),
      })
      .where(eq(workRequests.id, request.id))
      .returning();

    await tx.insert(workOsEvents).values({
      id: crypto.randomUUID(),
      tenantId: input.tenantId,
      requestId: request.id,
      caseId: workCase.id,
      eventType: "work_request_created",
      fromState: null,
      toState: request.currentState,
      detailJson: eventPayload({
        sourceType: input.sourceType,
        sourceRef: input.sourceRef ?? null,
        requesterType: input.requesterType ?? "human",
        businessDomain: input.businessDomain ?? null,
      }),
      createdAt: now(),
    } satisfies InsertWorkOsEvent).returning();

    return { request, case: workCase };
  });
}

export async function listMyWorkRequests(input: {
  tenantId: string;
  requesterId: string;
  limit?: number;
}): Promise<Array<WorkRequest>> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const rows = await db
    .select()
    .from(workRequests)
    .where(and(
      eq(workRequests.tenantId, input.tenantId),
      eq(workRequests.requesterId, input.requesterId),
    ))
    .orderBy(desc(workRequests.createdAt))
    .limit(input.limit ?? 10);

  return rows;
}

export async function createWorkTask(input: CreateWorkTaskInput): Promise<{ case: WorkCase; task: TeamWorkItem }> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const currentCase = await loadCaseRecord(input.caseId, input.tenantId);
  if (!currentCase) {
    throw new Error(`Work case ${input.caseId} not found`);
  }
  const request = await loadRequestRecord(currentCase.requestId, input.tenantId);

  const task = await workItemService.createWorkItem({
    tenantId: input.tenantId,
    teamId: input.teamId,
    roomId: input.roomId,
    runId: input.runId ?? undefined,
    sourceType: input.sourceType ?? "work_os",
    sourceRef: input.sourceRef ?? currentCase.id,
    title: input.title,
    objective: input.objective ?? currentCase.summary ?? undefined,
    priority: input.priority ?? currentCase.priority,
    riskClass: input.riskClass ?? (currentCase.riskLevel as "low" | "medium" | "high" | "critical"),
    actorUserId: input.actorUserId ?? undefined,
    actorAssistantId: input.actorAssistantId ?? undefined,
    requiresApproval: input.requiresApproval,
    autoAssignByRole: true,
  });

  const nextState = mapTaskStatusToCaseState(task.status);
  const [updatedCase] = await db
    .update(workCases)
    .set({
      primaryTaskId: task.id,
      currentState: nextState,
      updatedAt: now(),
    })
    .where(eq(workCases.id, currentCase.id))
    .returning();

  await syncRequestAndCaseState(input.tenantId, updatedCase.id, nextState, currentCase.requestId);

  await insertWorkOsEvent({
    id: crypto.randomUUID(),
    tenantId: input.tenantId,
    requestId: request?.id ?? currentCase.requestId,
    caseId: updatedCase.id,
    taskId: task.id,
    actorAssistantId: input.actorAssistantId ?? null,
    actorUserId: input.actorUserId ?? null,
    eventType: "work_task_linked",
    fromState: currentCase.currentState,
    toState: nextState,
    detailJson: eventPayload({
      teamId: input.teamId,
      roomId: input.roomId,
      runId: input.runId ?? null,
    }),
    createdAt: now(),
  });

  return { case: updatedCase, task };
}

export async function reassignWorkCase(input: {
  tenantId: string;
  caseId: string;
  ownerType: "human" | "queue" | "role" | "hybrid";
  ownerId?: string | null;
  reason?: string | null;
  actorUserId?: number | null;
  actorAssistantId?: string | null;
}): Promise<WorkCaseProjection> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const currentCase = await loadCaseRecord(input.caseId, input.tenantId);
  if (!currentCase) {
    throw new Error(`Work case ${input.caseId} not found`);
  }

  const previousOwnerType = currentCase.ownerType ?? null;
  const previousOwnerId = currentCase.ownerId ?? null;
  const [updatedCase] = await db
    .update(workCases)
    .set({
      ownerType: input.ownerType,
      ownerId: input.ownerId ?? null,
      updatedAt: now(),
    })
    .where(eq(workCases.id, currentCase.id))
    .returning();

  await recordAssignmentChange({
    tenantId: input.tenantId,
    requestId: currentCase.requestId,
    caseId: updatedCase.id,
    ownerType: input.ownerType,
    ownerId: input.ownerId ?? null,
    previousOwnerType,
    previousOwnerId,
    assignmentSource: "reassignment",
    reason: input.reason ?? null,
    actorUserId: input.actorUserId ?? null,
    actorAssistantId: input.actorAssistantId ?? null,
  });

  await insertWorkOsEvent({
    id: crypto.randomUUID(),
    tenantId: input.tenantId,
    requestId: currentCase.requestId,
    caseId: updatedCase.id,
    taskId: currentCase.primaryTaskId ?? null,
    actorAssistantId: input.actorAssistantId ?? null,
    actorUserId: input.actorUserId ?? null,
    eventType: "assignment_changed",
    fromState: currentCase.currentState,
    toState: currentCase.currentState,
    detailJson: eventPayload({
      previousOwnerType,
      previousOwnerId,
      ownerType: input.ownerType,
      ownerId: input.ownerId ?? null,
      reason: input.reason ?? null,
    }),
    createdAt: now(),
  });

  return getWorkCaseProjection(updatedCase.id, input.tenantId);
}

export async function attachLegacyTaskToCase(input: {
  tenantId: string;
  caseId: string;
  taskId: string;
  actorUserId?: number | null;
  actorAssistantId?: string | null;
}): Promise<WorkCaseProjection> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const currentCase = await loadCaseRecord(input.caseId, input.tenantId);
  if (!currentCase) throw new Error(`Work case ${input.caseId} not found`);

  const [task] = await db
    .select()
    .from(teamWorkItems)
    .where(and(eq(teamWorkItems.id, input.taskId), eq(teamWorkItems.tenantId, input.tenantId)))
    .limit(1);

  if (!task) throw new Error(`Work task ${input.taskId} not found`);

  const nextState = mapTaskStatusToCaseState(task.status);
  const [updatedCase] = await db
    .update(workCases)
    .set({
      primaryTaskId: task.id,
      currentState: nextState,
      updatedAt: now(),
    })
    .where(eq(workCases.id, currentCase.id))
    .returning();

  await syncRequestAndCaseState(input.tenantId, updatedCase.id, nextState, currentCase.requestId);

  await insertWorkOsEvent({
    id: crypto.randomUUID(),
    tenantId: input.tenantId,
    requestId: currentCase.requestId,
    caseId: updatedCase.id,
    taskId: task.id,
    actorAssistantId: input.actorAssistantId ?? null,
    actorUserId: input.actorUserId ?? null,
    eventType: "legacy_task_projected",
    fromState: currentCase.currentState,
    toState: nextState,
    detailJson: eventPayload({ taskStatus: task.status }),
    createdAt: now(),
  });

  return getWorkCaseProjection(updatedCase.id, input.tenantId);
}

export async function recordApproval(input: RecordApprovalInput): Promise<WorkApproval> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const caseRecord = await loadCaseRecord(input.caseId, input.tenantId);
  const previousState = caseRecord?.currentState ?? "new";
  const nextState = input.decision === "approved"
    ? "completed"
    : input.decision === "rejected"
      ? "waiting_for_input"
      : previousState;

  const [approval] = await db.insert(workApprovals).values({
    tenantId: input.tenantId,
    requestId: input.requestId ?? null,
    caseId: input.caseId,
    taskId: input.taskId ?? null,
    approvalTransportId: input.approvalTransportId ?? null,
    approvalStatus: input.decision ?? "pending",
    approverType: input.approverType ?? "human",
    approverId: input.approverId ?? null,
    comment: input.comment ?? null,
    metadataJson: input.metadataJson ?? null,
    requestedAt: now(),
    respondedAt: input.decision && input.decision !== "pending" ? now() : null,
  } satisfies InsertWorkApproval).returning();

  if (caseRecord) {
    await syncRequestAndCaseState(input.tenantId, caseRecord.id, nextState, input.requestId ?? caseRecord.requestId);
  }

  await insertWorkOsEvent({
    id: crypto.randomUUID(),
    tenantId: input.tenantId,
    requestId: input.requestId ?? null,
    caseId: input.caseId,
    taskId: input.taskId ?? null,
    actorAssistantId: input.actorAssistantId ?? null,
    actorUserId: input.actorUserId ?? null,
    eventType: "approval_recorded",
    fromState: previousState,
    toState: nextState,
    detailJson: eventPayload({
      approvalTransportId: input.approvalTransportId ?? null,
      approvalStatus: input.decision ?? "pending",
    }),
    createdAt: now(),
  });

  return approval;
}

export async function recordException(input: RecordExceptionInput): Promise<WorkException> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const caseRecord = await loadCaseRecord(input.caseId, input.tenantId);
  const previousState = caseRecord?.currentState ?? "new";
  const nextState = input.status === "resolved" ? "in_progress" : "escalated";

  const [exception] = await db.insert(workExceptions).values({
    tenantId: input.tenantId,
    requestId: input.requestId ?? null,
    caseId: input.caseId,
    taskId: input.taskId ?? null,
    exceptionType: input.exceptionType,
    severity: input.severity ?? "medium",
    status: input.status ?? "open",
    reason: input.reason ?? null,
    ownerType: input.ownerType ?? null,
    ownerId: input.ownerId ?? null,
    metadataJson: input.metadataJson ?? null,
    createdAt: now(),
    resolvedAt: input.status === "resolved" ? now() : null,
    updatedAt: now(),
  } satisfies InsertWorkException).returning();

  if (caseRecord) {
    await syncRequestAndCaseState(input.tenantId, input.caseId, nextState, input.requestId ?? caseRecord.requestId);
  }

  await insertWorkOsEvent({
    id: crypto.randomUUID(),
    tenantId: input.tenantId,
    requestId: input.requestId ?? null,
    caseId: input.caseId,
    taskId: input.taskId ?? null,
    actorAssistantId: input.actorAssistantId ?? null,
    actorUserId: input.actorUserId ?? null,
    eventType: "exception_recorded",
    fromState: previousState,
    toState: nextState,
    detailJson: eventPayload({
      exceptionType: input.exceptionType,
      severity: input.severity ?? "medium",
      status: input.status ?? "open",
      reason: input.reason ?? null,
    }),
    createdAt: now(),
  });

  return exception;
}

export async function recordOutcome(input: RecordOutcomeInput): Promise<WorkOutcome> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const caseRecord = await loadCaseRecord(input.caseId, input.tenantId);
  const previousState = caseRecord?.currentState ?? "new";

  const [outcome] = await db.insert(workOutcomes).values({
    tenantId: input.tenantId,
    requestId: input.requestId ?? null,
    caseId: input.caseId,
    taskId: input.taskId ?? null,
    disposition: input.disposition,
    resolutionCode: input.resolutionCode ?? null,
    customerImpact: input.customerImpact ?? null,
    reviewerResult: input.reviewerResult ?? null,
    followUpRequired: input.followUpRequired ?? false,
    summary: input.summary ?? null,
    metadataJson: input.metadataJson ?? null,
  } satisfies InsertWorkOutcome).returning();

  await syncRequestAndCaseState(input.tenantId, input.caseId, "completed", input.requestId);

  await insertWorkOsEvent({
    id: crypto.randomUUID(),
    tenantId: input.tenantId,
    requestId: input.requestId ?? null,
    caseId: input.caseId,
    taskId: input.taskId ?? null,
    actorAssistantId: input.actorAssistantId ?? null,
    actorUserId: input.actorUserId ?? null,
    eventType: "outcome_recorded",
    fromState: previousState,
    toState: "completed",
    detailJson: eventPayload({
      disposition: input.disposition,
      resolutionCode: input.resolutionCode ?? null,
      followUpRequired: input.followUpRequired ?? false,
    }),
    createdAt: now(),
  });

  return outcome;
}

export async function recordSla(input: RecordSlaInput): Promise<WorkSla> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const caseRecord = await loadCaseRecord(input.caseId, input.tenantId);
  const previousState = caseRecord?.currentState ?? "new";
  const nextState = input.breachState === "breached"
    ? "blocked"
    : input.breachState === "at_risk"
      ? "escalated"
      : previousState;

  const [sla] = await db.insert(workSlas).values({
    tenantId: input.tenantId,
    requestId: input.requestId ?? null,
    caseId: input.caseId,
    taskId: input.taskId ?? null,
    policyId: input.policyId ?? null,
    dueAt: input.dueAt ?? null,
    serviceWindowStartAt: input.serviceWindowStartAt ?? null,
    serviceWindowEndAt: input.serviceWindowEndAt ?? null,
    urgency: input.urgency ?? "normal",
    breachState: input.breachState ?? "none",
    breachedAt: input.breachedAt ?? null,
    escalatedAt: input.escalatedAt ?? null,
    createdAt: now(),
    updatedAt: now(),
  } satisfies InsertWorkSla).returning();

  if (sla.breachState === "at_risk" || sla.breachState === "breached") {
    const exceptionType = sla.breachState === "breached" ? "sla_breached" : "sla_at_risk";
    const [existingException] = await db
      .select()
      .from(workExceptions)
      .where(and(
        eq(workExceptions.caseId, input.caseId),
        eq(workExceptions.tenantId, input.tenantId),
        eq(workExceptions.exceptionType, exceptionType),
        eq(workExceptions.status, "open"),
      ))
      .limit(1);

    if (!existingException) {
      await db.insert(workExceptions).values({
        id: crypto.randomUUID(),
        tenantId: input.tenantId,
        requestId: input.requestId ?? null,
        caseId: input.caseId,
        taskId: input.taskId ?? null,
        exceptionType,
        severity: sla.breachState === "breached" ? "critical" : "high",
        status: "open",
        reason: sla.breachState === "breached"
          ? "SLA breached"
          : "SLA at risk",
        metadataJson: {
          policyId: input.policyId ?? null,
          breachState: sla.breachState,
          dueAt: input.dueAt?.toISOString() ?? null,
        },
        createdAt: now(),
        updatedAt: now(),
      } satisfies InsertWorkException).returning();
    }
  }

  if (caseRecord && nextState !== previousState) {
    await syncRequestAndCaseState(input.tenantId, input.caseId, nextState, input.requestId ?? caseRecord.requestId);
  }

  await insertWorkOsEvent({
    id: crypto.randomUUID(),
    tenantId: input.tenantId,
    requestId: input.requestId ?? null,
    caseId: input.caseId,
    taskId: input.taskId ?? null,
    actorAssistantId: input.actorAssistantId ?? null,
    actorUserId: input.actorUserId ?? null,
    eventType: "sla_recorded",
    fromState: previousState,
    toState: nextState === previousState ? null : nextState,
    detailJson: eventPayload({
      policyId: input.policyId ?? null,
      dueAt: input.dueAt?.toISOString() ?? null,
      breachState: input.breachState ?? "none",
    }),
    createdAt: now(),
  });

  return sla;
}

export async function getWorkCaseProjection(caseId: string, tenantId: string): Promise<WorkCaseProjection> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const workCase = await loadCaseRecord(caseId, tenantId);
  if (!workCase) {
    throw new Error(`Work case ${caseId} not found`);
  }

  const request = await loadRequestRecord(workCase.requestId, tenantId);
  const task = workCase.primaryTaskId
    ? (await db
        .select()
        .from(teamWorkItems)
        .where(and(eq(teamWorkItems.id, workCase.primaryTaskId), eq(teamWorkItems.tenantId, tenantId)))
        .limit(1))[0] ?? null
    : null;

  const assignments = await db.select().from(workAssignments).where(and(eq(workAssignments.caseId, workCase.id), eq(workAssignments.tenantId, tenantId))).orderBy(desc(workAssignments.createdAt));
  const approvals = await db.select().from(workApprovals).where(and(eq(workApprovals.caseId, workCase.id), eq(workApprovals.tenantId, tenantId))).orderBy(desc(workApprovals.createdAt));
  const exceptions = await db.select().from(workExceptions).where(and(eq(workExceptions.caseId, workCase.id), eq(workExceptions.tenantId, tenantId))).orderBy(desc(workExceptions.createdAt));
  const outcomes = await db.select().from(workOutcomes).where(and(eq(workOutcomes.caseId, workCase.id), eq(workOutcomes.tenantId, tenantId))).orderBy(desc(workOutcomes.createdAt));
  const slas = await db.select().from(workSlas).where(and(eq(workSlas.caseId, workCase.id), eq(workSlas.tenantId, tenantId))).orderBy(desc(workSlas.createdAt));

  const [osEvents, legacyEvents, workpackEvidence, teamRunEvidence, roleRoutineEvidence] = await Promise.all([
    db.select().from(workOsEvents).where(and(eq(workOsEvents.caseId, workCase.id), eq(workOsEvents.tenantId, tenantId))).orderBy(desc(workOsEvents.createdAt)),
    task
      ? db.select().from(workItemEvents).where(eq(workItemEvents.workItemId, task.id)).orderBy(desc(workItemEvents.createdAt))
      : Promise.resolve([]),
    buildWorkpackTimelineEntries(tenantId, request, workCase),
    buildTeamRunTimelineEntries(tenantId, request, workCase, task),
    buildRoleRoutineTimelineEntries(tenantId, request, workCase, task),
  ]);
  const [automationEvidence, automation] = await Promise.all([
    buildAutomationTimelineEntries(workCase.id, tenantId),
    getAutomationProjectionForCase(workCase.id, tenantId),
  ]);
  const browserAutomationEvidence = await buildBrowserAutomationTimelineEntries(workCase.id, tenantId);

  const timeline: WorkTimelineEntry[] = [
    ...osEvents.map((entry) => ({
      id: entry.id,
      source: "work_os" as const,
      eventType: entry.eventType,
      createdAt: entry.createdAt,
      requestId: entry.requestId,
      caseId: entry.caseId,
      taskId: entry.taskId,
      detailJson: (entry.detailJson as Record<string, unknown> | null) ?? null,
    })),
    ...legacyEvents.map((entry) => ({
      id: entry.id,
      source: "legacy_work_item" as const,
      eventType: entry.eventType,
      createdAt: entry.createdAt,
      requestId: request?.id ?? null,
      caseId: workCase.id,
      taskId: task?.id ?? null,
      detailJson: (entry.detailJson as Record<string, unknown> | null) ?? null,
    })),
    ...workpackEvidence,
    ...teamRunEvidence,
    ...roleRoutineEvidence,
    ...automationEvidence,
    ...browserAutomationEvidence,
  ].sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime());

  return { request, case: workCase, task, automation, assignments, approvals, exceptions, outcomes, slas, timeline };
}

export async function getInbox(tenantId: string, ownerType?: string | null, ownerId?: string | null): Promise<WorkCase[]> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const filters = [eq(workCases.tenantId, tenantId)];
  if (ownerType) {
    filters.push(eq(workCases.ownerType, ownerType as never));
  }
  if (ownerId) {
    filters.push(eq(workCases.ownerId, ownerId));
  }

  return db.select().from(workCases).where(and(...filters)).orderBy(desc(workCases.updatedAt));
}

export async function getOverview(tenantId: string): Promise<{
  byState: Record<string, number>;
  openExceptions: number;
  overdueSla: number;
  completed: number;
}> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const cases = await db.select().from(workCases).where(eq(workCases.tenantId, tenantId));
  const exceptions = await db.select().from(workExceptions).where(and(eq(workExceptions.tenantId, tenantId), eq(workExceptions.status, "open")));
  const overdue = await db.select().from(workSlas).where(and(eq(workSlas.tenantId, tenantId), inArray(workSlas.breachState, ["at_risk", "breached"])));

  const byState = cases.reduce<Record<string, number>>((acc, item) => {
    acc[item.currentState] = (acc[item.currentState] ?? 0) + 1;
    return acc;
  }, {});

  return {
    byState,
    openExceptions: exceptions.length,
    overdueSla: overdue.length,
    completed: cases.filter((item) => item.currentState === "completed").length,
  };
}

export async function projectTaskAsCase(taskId: string, tenantId: string): Promise<WorkCaseProjection> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const [task] = await db.select().from(teamWorkItems).where(and(eq(teamWorkItems.id, taskId), eq(teamWorkItems.tenantId, tenantId))).limit(1);
  if (!task) {
    throw new Error(`Work task ${taskId} not found`);
  }

  const [linkedCase] = await db
    .select()
    .from(workCases)
    .where(and(eq(workCases.primaryTaskId, taskId), eq(workCases.tenantId, tenantId)))
    .limit(1);

  if (linkedCase) {
    return getWorkCaseProjection(linkedCase.id, tenantId);
  }

  const syntheticCase = {
    id: `legacy-${task.id}`,
    tenantId,
    projectId: null,
    requestId: null,
    primaryTaskId: task.id,
    title: task.title,
    summary: task.objective ?? null,
    ownerType: null,
    ownerId: null,
    priority: task.priority,
    riskLevel: task.riskClass,
    dataClassification: "internal",
    currentState: mapTaskStatusToCaseState(task.status),
    automationRunId: null,
    automationMode: "manual_assist",
    automationTemplateKey: null,
    automationTemplateFamily: "content-production",
    automationTemplateSource: "case_intake",
    automationPolicyJson: {},
    automationStepId: null,
    automationCheckpointId: null,
    automationDisposition: null,
    automationSummary: null,
    automationUpdatedAt: null,
    linkedConversationIdsJson: null,
    linkedWorkpackRunIdsJson: null,
    linkedRoleRoutineRunIdsJson: null,
    createdAt: task.createdAt,
    updatedAt: task.updatedAt,
  } as unknown as WorkCase;

  const legacyEvents = await db.select().from(workItemEvents).where(eq(workItemEvents.workItemId, task.id)).orderBy(desc(workItemEvents.createdAt));
  const roleRoutineEvidence = await buildRoleRoutineTimelineEntries(tenantId, null, syntheticCase, task);
  const automation = await getAutomationProjectionForCase(syntheticCase.id, tenantId);
  const automationEvidence = await buildAutomationTimelineEntries(syntheticCase.id, tenantId);
  const browserAutomationEvidence = await buildBrowserAutomationTimelineEntries(syntheticCase.id, tenantId);
  const timeline: WorkTimelineEntry[] = [
    ...legacyEvents.map((entry) => ({
    id: entry.id,
    source: "legacy_work_item" as const,
    eventType: entry.eventType,
    createdAt: entry.createdAt,
    requestId: null,
    caseId: syntheticCase.id,
    taskId: task.id,
    detailJson: (entry.detailJson as Record<string, unknown> | null) ?? null,
    })),
    ...roleRoutineEvidence,
    ...automationEvidence,
    ...browserAutomationEvidence,
  ].sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime());

  return {
    request: null,
    case: syntheticCase,
    task,
    automation,
    assignments: [],
    approvals: [],
    exceptions: [],
    outcomes: [],
    slas: [],
    timeline,
  };
}
