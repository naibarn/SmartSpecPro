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
  type RunSnapshot,
  type WorkAssignment,
  type WorkApproval,
  type WorkCase,
  type WorkException,
  type WorkOutcome,
  type WorkRequest,
  type WorkSla,
} from "../../drizzle/schema";
import { getDb } from "../db";
import {
  describeStatusBridge,
  mapTeamRunStatusToWorkOsState,
} from "./workStatusBridge";
import * as monitoringService from "./monitoringService";
import {
  extractEnterpriseArtifacts,
  type GovernedContextSnapshot,
  type ReadinessMetricRecord,
} from "./enterprisePlatformArtifacts";
import {
  buildAutomationTimelineEntries,
  getAutomationProjectionForCase,
  type CaseAutomationProjection,
} from "./workAutomationFabricService";
import { buildBrowserAutomationTimelineEntries } from "./workAutomationBrowserTaskService";
import {
  getRoleRoutineRun,
  listRoleRoutineRunsForRoutine,
} from "./rolePersistence";
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

export interface UpdateWorkRequestInput {
  tenantId: string;
  requestId: string;
  actorRole?: string | null;
  title?: string | null;
  objective?: string | null;
  sourceType?: string | null;
  sourceRef?: string | null;
  businessDomain?: string | null;
  urgency?: string | null;
  riskLevel?: string | null;
  defaultOwnerType?: "human" | "queue" | "role" | "hybrid" | null;
  defaultOwnerId?: string | null;
  defaultQueueId?: string | null;
  actorUserId?: number | null;
  actorAssistantId?: string | null;
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
  source:
    | "work_os"
    | "legacy_work_item"
    | "workpack_record"
    | "team_run"
    | "role_routine"
    | "browser_automation";
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

export interface WorkInboxCase extends WorkCase {
  latestTeamId: string | null;
  latestTeamRoomId: string | null;
  latestTeamRunId: string | null;
  latestTeamRunStatus: string | null;
  latestTeamRunMode: string | null;
  latestExploration: {
    selectedCandidateId: string;
    selectionReason: string;
    candidateCount: number;
  } | null;
  latestFinalReview: {
    reviewerPersona: string | null;
    score: number | null;
    recommendation: string | null;
    comment: string | null;
  } | null;
  latestTraceId: string | null;
  latestContext: GovernedContextSnapshot | null;
  latestReadiness: ReadinessMetricRecord | null;
}

export interface MyRequestExecutionTrail {
  teamId: string | null;
  roomId: string | null;
  teamRunId: string | null;
  teamRunStatus: string | null;
  teamRunMode: string | null;
  workItemId: string | null;
  workItemStatus: string | null;
}

export interface MyWorkRequestRecord extends WorkRequest {
  executionTrail: MyRequestExecutionTrail | null;
}

function now(): Date {
  return new Date();
}

async function withWorkOsTransaction<T>(
  db: Awaited<ReturnType<typeof getDb>>,
  fn: (tx: Awaited<ReturnType<typeof getDb>>) => Promise<T>
): Promise<T> {
  if (
    db &&
    typeof (db as { transaction?: unknown }).transaction === "function"
  ) {
    return (
      db as unknown as {
        transaction: <R>(
          fn: (tx: Awaited<ReturnType<typeof getDb>>) => Promise<R>
        ) => Promise<R>;
      }
    ).transaction(fn);
  }
  return fn(db);
}

function eventPayload(
  detailJson: Record<string, unknown> | null | undefined
): Record<string, unknown> | null {
  return detailJson && Object.keys(detailJson).length > 0 ? detailJson : null;
}

function summarizePlanExploration(
  planArtifact: monitoringService.RunPlanArtifact | null | undefined
): Record<string, unknown> | null {
  const exploration = planArtifact?.exploration;
  if (!exploration) return null;

  return {
    selectedCandidateId: exploration.selectedCandidateId,
    selectionReason: exploration.selectionReason,
    criteria: exploration.criteria,
    candidateCount: exploration.candidates.length,
    candidates: exploration.candidates.map(candidate => ({
      candidateId: candidate.candidateId,
      title: candidate.title,
      strategy: candidate.strategy,
      summary: candidate.summary,
      riskClass: candidate.riskClass,
      strengths: candidate.strengths,
      tradeoffs: candidate.tradeoffs,
    })),
  };
}

function summarizeFinalReview(
  snapshot: Pick<RunSnapshot, "artifactCountJson"> | null | undefined
): Record<string, unknown> | null {
  const payload = snapshot?.artifactCountJson as
    | Record<string, unknown>
    | null
    | undefined;
  if (!payload) return null;
  const runtimeState = payload.runtimeState as
    | Record<string, unknown>
    | undefined;
  const finalReview =
    (runtimeState?.finalReview as Record<string, unknown> | undefined) ??
    (payload.finalReview as Record<string, unknown> | undefined);
  if (!finalReview) return null;

  const score =
    typeof finalReview.score === "number" ? finalReview.score : null;
  const reviewerPersona =
    typeof finalReview.reviewerPersona === "string"
      ? finalReview.reviewerPersona
      : null;
  const recommendation =
    typeof finalReview.recommendation === "string"
      ? finalReview.recommendation
      : null;
  const comment =
    typeof finalReview.comment === "string" ? finalReview.comment : null;

  if (score === null && !reviewerPersona && !recommendation && !comment)
    return null;

  return {
    reviewerPersona,
    score,
    recommendation,
    comment,
  };
}

function summarizeTeamRunArtifacts(
  snapshot: Pick<RunSnapshot, "artifactCountJson"> | null | undefined
): {
  traceId: string | null;
  governedContext: GovernedContextSnapshot | null;
  readinessRecord: ReadinessMetricRecord | null;
} {
  const payload = snapshot?.artifactCountJson as
    | Record<string, unknown>
    | null
    | undefined;
  if (!payload) {
    return {
      traceId: null,
      governedContext: null,
      readinessRecord: null,
    };
  }

  const artifacts = extractEnterpriseArtifacts({ payload });
  return {
    traceId: artifacts.traceEnvelope?.traceId ?? null,
    governedContext: artifacts.governedContext,
    readinessRecord: artifacts.readinessRecord,
  };
}

function toDate(value: string | Date | null | undefined): Date {
  if (!value) return new Date(0);
  if (value instanceof Date) return value;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? new Date(0) : parsed;
}

async function insertWorkOsEvent(
  input: InsertWorkOsEvent,
  tx?: Awaited<ReturnType<typeof getDb>>
): Promise<void> {
  const db = tx ?? (await getDb());
  if (!db) throw new Error("Database not available");

  await db.insert(workOsEvents).values(input).returning();
}

async function insertWorkAssignment(
  input: InsertWorkAssignment,
  tx?: Awaited<ReturnType<typeof getDb>>
): Promise<WorkAssignment> {
  const db = tx ?? (await getDb());
  if (!db) throw new Error("Database not available");

  const [assignment] = await db
    .insert(workAssignments)
    .values(input)
    .returning();
  return assignment;
}

async function loadCaseRecord(
  caseId: string,
  tenantId: string
): Promise<WorkCase | null> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const [record] = await db
    .select()
    .from(workCases)
    .where(and(eq(workCases.id, caseId), eq(workCases.tenantId, tenantId)))
    .limit(1);

  return record ?? null;
}

async function loadCaseByRequestId(
  requestId: string,
  tenantId: string
): Promise<WorkCase | null> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const [record] = await db
    .select()
    .from(workCases)
    .where(
      and(eq(workCases.requestId, requestId), eq(workCases.tenantId, tenantId))
    )
    .limit(1);

  return record ?? null;
}

async function loadRequestRecord(
  requestId: string | null | undefined,
  tenantId: string
): Promise<WorkRequest | null> {
  if (!requestId) return null;
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const [record] = await db
    .select()
    .from(workRequests)
    .where(
      and(eq(workRequests.id, requestId), eq(workRequests.tenantId, tenantId))
    )
    .limit(1);

  return record ?? null;
}

async function syncRequestAndCaseState(
  tenantId: string,
  caseId: string,
  nextState: (typeof workCases.$inferSelect)["currentState"],
  requestId?: string | null,
  tx?: Awaited<ReturnType<typeof getDb>>
): Promise<void> {
  const db = tx ?? (await getDb());
  if (!db) throw new Error("Database not available");

  const linkedRequestId =
    requestId ?? (await loadCaseRecord(caseId, tenantId))?.requestId ?? null;

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
}): {
  ownerType: "human" | "queue" | "role" | "hybrid";
  ownerId: string | null;
} | null {
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

async function recordAssignmentChange(
  input: RecordAssignmentInput,
  tx?: Awaited<ReturnType<typeof getDb>>
): Promise<WorkAssignment | null> {
  const resolvedOwner = resolveAssignmentOwner({
    ownerType: input.ownerType,
    ownerId: input.ownerId ?? null,
  });
  if (!resolvedOwner) {
    return null;
  }

  return insertWorkAssignment(
    {
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
    } satisfies InsertWorkAssignment,
    tx
  );
}

function mapTaskStatusToCaseState(
  taskStatus: TeamWorkItem["status"]
): (typeof workCases.$inferSelect)["currentState"] {
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

function coerceRequestState(
  state: string | null | undefined
): (typeof workCases.$inferSelect)["currentState"] {
  if (
    state === "new" ||
    state === "triaged" ||
    state === "planned" ||
    state === "in_progress" ||
    state === "waiting_for_approval" ||
    state === "waiting_for_input" ||
    state === "blocked" ||
    state === "escalated" ||
    state === "completed" ||
    state === "cancelled" ||
    state === "failed"
  ) {
    return state;
  }
  return "new";
}

function uniqueIds(values: Array<string | null | undefined>): string[] {
  return Array.from(
    new Set(
      values.filter((value): value is string => Boolean(value && value.trim()))
    )
  );
}

async function buildWorkpackTimelineEntries(
  tenantId: string,
  request: WorkRequest | null,
  workCase: WorkCase
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
    .where(
      and(
        eq(workpackRecords.tenantId, tenantId),
        inArray(workpackRecords.recordId, recordIds)
      )
    )
    .orderBy(desc(workpackRecords.createdAt));

  return records.map(entry => ({
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
  task: TeamWorkItem | null
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

  const explorationByRunId = new Map<string, Record<string, unknown> | null>();
  const finalReviewByRunId = new Map<string, Record<string, unknown> | null>();
  const traceIdByRunId = new Map<string, string | null>();
  const contextByRunId = new Map<string, GovernedContextSnapshot | null>();
  const readinessByRunId = new Map<string, ReadinessMetricRecord | null>();
  await Promise.all(
    runs.map(async ({ run }) => {
      const latestSnapshot = await monitoringService
        .getLatestRunSnapshot(run.id)
        .catch(() => null);
      const planArtifact =
        monitoringService.extractRunPlanArtifact(latestSnapshot);
      explorationByRunId.set(run.id, summarizePlanExploration(planArtifact));
      finalReviewByRunId.set(run.id, summarizeFinalReview(latestSnapshot));
      const artifacts = summarizeTeamRunArtifacts(latestSnapshot);
      traceIdByRunId.set(run.id, artifacts.traceId);
      contextByRunId.set(run.id, artifacts.governedContext);
      readinessByRunId.set(run.id, artifacts.readinessRecord);
    })
  );

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
      exploration: explorationByRunId.get(run.id),
      finalReview: finalReviewByRunId.get(run.id),
      traceId: traceIdByRunId.get(run.id),
      governedContext: contextByRunId.get(run.id),
      readinessRecord: readinessByRunId.get(run.id),
    },
  }));
}

async function buildRoleRoutineTimelineEntries(
  tenantId: string,
  request: WorkRequest | null,
  workCase: WorkCase,
  task: TeamWorkItem | null
): Promise<WorkTimelineEntry[]> {
  type RoleRoutineRunRecord = NonNullable<
    Awaited<ReturnType<typeof getRoleRoutineRun>>
  >;
  const linkedRunIds = uniqueIds([
    ...(request?.linkedRoleRoutineRunIdsJson ?? []),
    ...(workCase.linkedRoleRoutineRunIdsJson ?? []),
  ]);

  const runs = new Map<string, RoleRoutineRunRecord>();

  await Promise.all(
    linkedRunIds.map(async runId => {
      const run = await getRoleRoutineRun(runId);
      if (run && run.tenantId === tenantId) {
        runs.set(run.id, run);
      }
    })
  );

  if (runs.size === 0 && task?.routineId) {
    const routineRuns = await listRoleRoutineRunsForRoutine(task.routineId);
    for (const run of routineRuns) {
      if (run.tenantId === tenantId) {
        runs.set(run.id, run);
      }
    }
  }

  return Array.from(runs.values())
    .map(run => ({
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
    .sort(
      (left, right) => right.createdAt.getTime() - left.createdAt.getTime()
    );
}

export async function createWorkRequest(
  input: CreateWorkRequestInput
): Promise<{ request: WorkRequest; case: WorkCase }> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  return withWorkOsTransaction(db, async tx => {
    const initialAssignment = resolveAssignmentOwner({
      defaultQueueId: input.defaultQueueId ?? null,
      defaultOwnerType: input.defaultOwnerType ?? null,
      defaultOwnerId: input.defaultOwnerId ?? null,
    });

    const [request] = await tx
      .insert(workRequests)
      .values({
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
        currentState:
          input.classificationConfidence != null &&
          input.classificationConfidence < 0.5
            ? "triaged"
            : "new",
        linkedConversationIdsJson: input.linkedConversationIds ?? [],
        linkedWorkpackRunIdsJson: input.linkedWorkpackRunIds ?? [],
        linkedRoleRoutineRunIdsJson: input.linkedRoleRoutineRunIds ?? [],
      } satisfies InsertWorkRequest)
      .returning();

    const [workCase] = await tx
      .insert(workCases)
      .values({
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
      } satisfies InsertWorkCase)
      .returning();

    if (initialAssignment) {
      await tx
        .insert(workAssignments)
        .values({
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
        } satisfies InsertWorkAssignment)
        .returning();
    }

    await tx
      .update(workRequests)
      .set({
        linkedCaseId: workCase.id,
        updatedAt: now(),
      })
      .where(eq(workRequests.id, request.id))
      .returning();

    await tx
      .insert(workOsEvents)
      .values({
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
      } satisfies InsertWorkOsEvent)
      .returning();

    return { request, case: workCase };
  });
}

export async function getWorkRequest(input: {
  tenantId: string;
  requestId: string;
  actorUserId?: number | null;
  actorRole?: string | null;
}): Promise<{
  request: WorkRequest;
  case: WorkCase | null;
  editable: boolean;
}> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const request = await loadRequestRecord(input.requestId, input.tenantId);
  if (!request) {
    throw new Error(`Work request ${input.requestId} not found`);
  }

  const canAccessAsRequester =
    input.actorUserId != null &&
    request.requesterId === String(input.actorUserId);
  const canAccessAsAdmin =
    input.actorRole === "admin" || input.actorRole === "domain_admin";
  if (!canAccessAsRequester && !canAccessAsAdmin) {
    throw new Error("You do not have permission to view this work request.");
  }

  const linkedCase = request.linkedCaseId
    ? await loadCaseRecord(request.linkedCaseId, input.tenantId)
    : await loadCaseByRequestId(request.id, input.tenantId);

  return {
    request,
    case: linkedCase,
    editable: !linkedCase?.automationRunId,
  };
}

export async function updateWorkRequest(
  input: UpdateWorkRequestInput
): Promise<{ request: WorkRequest; case: WorkCase | null }> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const request = await loadRequestRecord(input.requestId, input.tenantId);
  if (!request) {
    throw new Error(`Work request ${input.requestId} not found`);
  }

  const currentCase = request.linkedCaseId
    ? await loadCaseRecord(request.linkedCaseId, input.tenantId)
    : await loadCaseByRequestId(request.id, input.tenantId);

  if (currentCase?.automationRunId) {
    throw new Error(
      "This work request already has an active automation run and can no longer be edited here."
    );
  }

  const canEditAsRequester =
    input.actorUserId != null &&
    request.requesterId === String(input.actorUserId);
  const canEditAsAdmin =
    input.actorRole === "admin" || input.actorRole === "domain_admin";
  if (!canEditAsRequester && !canEditAsAdmin) {
    throw new Error("You do not have permission to edit this work request.");
  }

  const resolvedAssignment = resolveAssignmentOwner({
    ownerType: input.defaultOwnerType ?? undefined,
    ownerId: input.defaultOwnerId ?? undefined,
    defaultQueueId: input.defaultQueueId ?? undefined,
    defaultOwnerType: input.defaultOwnerType ?? undefined,
    defaultOwnerId: input.defaultOwnerId ?? undefined,
  });

  const nextTitle = input.title?.trim() || request.title;
  const nextObjective =
    input.objective !== undefined
      ? input.objective?.trim() || null
      : request.objective;
  const nextSourceType = input.sourceType?.trim() || request.sourceType;
  const nextSourceRef =
    input.sourceRef !== undefined
      ? input.sourceRef?.trim() || null
      : request.sourceRef;
  const nextBusinessDomain =
    input.businessDomain !== undefined
      ? input.businessDomain?.trim() || null
      : request.businessDomain;
  const nextUrgency = input.urgency?.trim() || request.urgency;
  const nextRiskLevel = input.riskLevel?.trim() || request.riskLevel;

  const [updatedRequest, updatedCase] = await withWorkOsTransaction(
    db,
    async tx => {
      const [requestRow] = await tx
        .update(workRequests)
        .set({
          title: nextTitle,
          objective: nextObjective,
          sourceType: nextSourceType,
          sourceRef: nextSourceRef,
          businessDomain: nextBusinessDomain,
          urgency: nextUrgency,
          riskLevel: nextRiskLevel,
          defaultOwnerType:
            input.defaultOwnerType ?? request.defaultOwnerType ?? null,
          defaultOwnerId:
            input.defaultOwnerId ?? request.defaultOwnerId ?? null,
          defaultQueueId:
            input.defaultQueueId ?? request.defaultQueueId ?? null,
          updatedAt: now(),
        })
        .where(eq(workRequests.id, request.id))
        .returning();

      let caseRow: WorkCase | null = currentCase ?? null;

      if (caseRow) {
        const previousOwnerType = caseRow.ownerType ?? null;
        const previousOwnerId = caseRow.ownerId ?? null;
        const [nextCase] = await tx
          .update(workCases)
          .set({
            title: nextTitle,
            summary: nextObjective,
            ownerType: resolvedAssignment?.ownerType ?? caseRow.ownerType,
            ownerId: resolvedAssignment?.ownerId ?? caseRow.ownerId,
            riskLevel: nextRiskLevel,
            updatedAt: now(),
          })
          .where(eq(workCases.id, caseRow.id))
          .returning();
        caseRow = nextCase;

        if (
          resolvedAssignment &&
          (resolvedAssignment.ownerType !== previousOwnerType ||
            resolvedAssignment.ownerId !== previousOwnerId)
        ) {
          await recordAssignmentChange(
            {
              tenantId: input.tenantId,
              requestId: requestRow.id,
              caseId: nextCase.id,
              ownerType: resolvedAssignment.ownerType,
              ownerId: resolvedAssignment.ownerId,
              previousOwnerType,
              previousOwnerId,
              assignmentSource: "request_edit",
              reason: "Work request updated before automation started",
              actorUserId: input.actorUserId ?? null,
              actorAssistantId: input.actorAssistantId ?? null,
            },
            tx
          );
        }

        await insertWorkOsEvent(
          {
            id: crypto.randomUUID(),
            tenantId: input.tenantId,
            requestId: requestRow.id,
            caseId: nextCase.id,
            taskId: nextCase.primaryTaskId ?? null,
            actorAssistantId: input.actorAssistantId ?? null,
            actorUserId: input.actorUserId ?? null,
            eventType: "work_request_updated",
            fromState: request.currentState,
            toState: request.currentState,
            detailJson: eventPayload({
              titleChanged: nextTitle !== request.title,
              objectiveChanged: nextObjective !== request.objective,
              sourceTypeChanged: nextSourceType !== request.sourceType,
              sourceRefChanged: nextSourceRef !== request.sourceRef,
              businessDomainChanged:
                nextBusinessDomain !== request.businessDomain,
              urgencyChanged: nextUrgency !== request.urgency,
              riskLevelChanged: nextRiskLevel !== request.riskLevel,
            }),
            createdAt: now(),
          },
          tx
        );
      }

      return [requestRow, caseRow] as const;
    }
  );

  return { request: updatedRequest, case: updatedCase };
}

export async function listMyWorkRequests(input: {
  tenantId: string;
  requesterId: string;
  limit?: number;
}): Promise<Array<MyWorkRequestRecord>> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const rows = await db
    .select()
    .from(workRequests)
    .where(
      and(
        eq(workRequests.tenantId, input.tenantId),
        eq(workRequests.requesterId, input.requesterId)
      )
    )
    .orderBy(desc(workRequests.createdAt))
    .limit(input.limit ?? 10);

  const enriched = await Promise.all(
    rows.map(async request => {
      if (!request.linkedCaseId) {
        return {
          ...request,
          executionTrail: null,
        } satisfies MyWorkRequestRecord;
      }

      const currentCase = await loadCaseRecord(
        request.linkedCaseId,
        input.tenantId
      ).catch(() => null);
      if (!currentCase) {
        return {
          ...request,
          executionTrail: null,
        } satisfies MyWorkRequestRecord;
      }

      const workItem = currentCase.primaryTaskId
        ? await workItemService
            .getWorkItem(currentCase.primaryTaskId, input.tenantId)
            .catch(() => null)
        : null;
      if (!workItem) {
        return {
          ...request,
          executionTrail: null,
        } satisfies MyWorkRequestRecord;
      }

      const teamRun = workItem.runId
        ? await db
            .select({ run: teamRuns })
            .from(teamRuns)
            .innerJoin(teamRooms, eq(teamRooms.id, teamRuns.roomId))
            .where(
              and(
                eq(teamRooms.tenantId, input.tenantId),
                eq(teamRuns.id, workItem.runId)
              )
            )
            .limit(1)
            .then(rows => rows[0]?.run ?? null)
        : null;

      return {
        ...request,
        executionTrail: {
          teamId: teamRun?.teamId ?? workItem.teamId ?? null,
          roomId: teamRun?.roomId ?? workItem.roomId ?? null,
          teamRunId: teamRun?.id ?? workItem.runId ?? null,
          teamRunStatus: teamRun?.status ?? null,
          teamRunMode: teamRun?.executionMode ?? null,
          workItemId: workItem.id,
          workItemStatus: workItem.status,
        },
      } satisfies MyWorkRequestRecord;
    })
  );

  return enriched;
}

export async function createWorkTask(
  input: CreateWorkTaskInput
): Promise<{ case: WorkCase; task: TeamWorkItem }> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const currentCase = await loadCaseRecord(input.caseId, input.tenantId);
  if (!currentCase) {
    throw new Error(`Work case ${input.caseId} not found`);
  }
  const request = await loadRequestRecord(
    currentCase.requestId,
    input.tenantId
  );

  let task: TeamWorkItem | null = null;
  const [updatedCase] = await withWorkOsTransaction(db, async tx => {
    task = await workItemService.createWorkItem(
      {
        tenantId: input.tenantId,
        teamId: input.teamId,
        roomId: input.roomId,
        runId: input.runId ?? undefined,
        sourceType: input.sourceType ?? "work_os",
        sourceRef: input.sourceRef ?? currentCase.id,
        title: input.title,
        objective: input.objective ?? currentCase.summary ?? undefined,
        priority: input.priority ?? currentCase.priority,
        riskClass:
          input.riskClass ??
          (currentCase.riskLevel as "low" | "medium" | "high" | "critical"),
        actorUserId: input.actorUserId ?? undefined,
        actorAssistantId: input.actorAssistantId ?? undefined,
        requiresApproval: input.requiresApproval,
        autoAssignByRole: true,
      },
      tx
    );

    const nextState = mapTaskStatusToCaseState(task.status);
    const [caseRow] = await tx
      .update(workCases)
      .set({
        primaryTaskId: task.id,
        currentState: nextState,
        updatedAt: now(),
      })
      .where(eq(workCases.id, currentCase.id))
      .returning();

    await syncRequestAndCaseState(
      input.tenantId,
      caseRow.id,
      nextState,
      currentCase.requestId,
      tx
    );

    await insertWorkOsEvent(
      {
        id: crypto.randomUUID(),
        tenantId: input.tenantId,
        requestId: request?.id ?? currentCase.requestId,
        caseId: caseRow.id,
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
      },
      tx
    );

    return [caseRow];
  });

  if (!task) {
    throw new Error("Work task creation failed");
  }

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
  const [updatedCase] = await withWorkOsTransaction(db, async tx => {
    const [caseRow] = await tx
      .update(workCases)
      .set({
        ownerType: input.ownerType,
        ownerId: input.ownerId ?? null,
        updatedAt: now(),
      })
      .where(eq(workCases.id, currentCase.id))
      .returning();

    await recordAssignmentChange(
      {
        tenantId: input.tenantId,
        requestId: currentCase.requestId,
        caseId: caseRow.id,
        ownerType: input.ownerType,
        ownerId: input.ownerId ?? null,
        previousOwnerType,
        previousOwnerId,
        assignmentSource: "reassignment",
        reason: input.reason ?? null,
        actorUserId: input.actorUserId ?? null,
        actorAssistantId: input.actorAssistantId ?? null,
      },
      tx
    );

    await insertWorkOsEvent(
      {
        id: crypto.randomUUID(),
        tenantId: input.tenantId,
        requestId: currentCase.requestId,
        caseId: caseRow.id,
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
      },
      tx
    );

    return [caseRow];
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
    .where(
      and(
        eq(teamWorkItems.id, input.taskId),
        eq(teamWorkItems.tenantId, input.tenantId)
      )
    )
    .limit(1);

  if (!task) throw new Error(`Work task ${input.taskId} not found`);

  const nextState = mapTaskStatusToCaseState(task.status);
  const [updatedCase] = await withWorkOsTransaction(db, async tx => {
    const [caseRow] = await tx
      .update(workCases)
      .set({
        primaryTaskId: task.id,
        currentState: nextState,
        updatedAt: now(),
      })
      .where(eq(workCases.id, currentCase.id))
      .returning();

    await syncRequestAndCaseState(
      input.tenantId,
      caseRow.id,
      nextState,
      currentCase.requestId,
      tx
    );

    await insertWorkOsEvent(
      {
        id: crypto.randomUUID(),
        tenantId: input.tenantId,
        requestId: currentCase.requestId,
        caseId: caseRow.id,
        taskId: task.id,
        actorAssistantId: input.actorAssistantId ?? null,
        actorUserId: input.actorUserId ?? null,
        eventType: "legacy_task_projected",
        fromState: currentCase.currentState,
        toState: nextState,
        detailJson: eventPayload({ taskStatus: task.status }),
        createdAt: now(),
      },
      tx
    );

    return [caseRow];
  });

  return getWorkCaseProjection(updatedCase.id, input.tenantId);
}

export async function recordApproval(
  input: RecordApprovalInput
): Promise<WorkApproval> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const caseRecord = await loadCaseRecord(input.caseId, input.tenantId);
  const previousState = caseRecord?.currentState ?? "new";
  const nextState =
    input.decision === "approved"
      ? "completed"
      : input.decision === "rejected"
        ? "waiting_for_input"
        : previousState;

  const [approval] = await withWorkOsTransaction(db, async tx => {
    const [approvalRow] = await tx
      .insert(workApprovals)
      .values({
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
        respondedAt:
          input.decision && input.decision !== "pending" ? now() : null,
      } satisfies InsertWorkApproval)
      .returning();

    if (caseRecord) {
      await syncRequestAndCaseState(
        input.tenantId,
        caseRecord.id,
        nextState,
        input.requestId ?? caseRecord.requestId,
        tx
      );
    }

    await insertWorkOsEvent(
      {
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
      },
      tx
    );

    return [approvalRow];
  });

  return approval;
}

export async function recordException(
  input: RecordExceptionInput
): Promise<WorkException> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const caseRecord = await loadCaseRecord(input.caseId, input.tenantId);
  const previousState = caseRecord?.currentState ?? "new";
  const nextState = input.status === "resolved" ? "in_progress" : "escalated";

  const [exception] = await withWorkOsTransaction(db, async tx => {
    const [exceptionRow] = await tx
      .insert(workExceptions)
      .values({
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
      } satisfies InsertWorkException)
      .returning();

    if (caseRecord) {
      await syncRequestAndCaseState(
        input.tenantId,
        input.caseId,
        nextState,
        input.requestId ?? caseRecord.requestId,
        tx
      );
    }

    await insertWorkOsEvent(
      {
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
      },
      tx
    );

    return [exceptionRow];
  });

  return exception;
}

export async function recordOutcome(
  input: RecordOutcomeInput
): Promise<WorkOutcome> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const caseRecord = await loadCaseRecord(input.caseId, input.tenantId);
  const previousState = caseRecord?.currentState ?? "new";

  const [outcome] = await withWorkOsTransaction(db, async tx => {
    const [outcomeRow] = await tx
      .insert(workOutcomes)
      .values({
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
      } satisfies InsertWorkOutcome)
      .returning();

    await syncRequestAndCaseState(
      input.tenantId,
      input.caseId,
      "completed",
      input.requestId,
      tx
    );

    await insertWorkOsEvent(
      {
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
      },
      tx
    );

    return [outcomeRow];
  });

  return outcome;
}

export async function recordSla(input: RecordSlaInput): Promise<WorkSla> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const caseRecord = await loadCaseRecord(input.caseId, input.tenantId);
  const previousState = caseRecord?.currentState ?? "new";
  const nextState =
    input.breachState === "breached"
      ? "blocked"
      : input.breachState === "at_risk"
        ? "escalated"
        : previousState;

  const [sla] = await withWorkOsTransaction(db, async tx => {
    const [slaRow] = await tx
      .insert(workSlas)
      .values({
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
      } satisfies InsertWorkSla)
      .returning();

    if (slaRow.breachState === "at_risk" || slaRow.breachState === "breached") {
      const exceptionType =
        slaRow.breachState === "breached" ? "sla_breached" : "sla_at_risk";
      const [existingException] = await tx
        .select()
        .from(workExceptions)
        .where(
          and(
            eq(workExceptions.caseId, input.caseId),
            eq(workExceptions.tenantId, input.tenantId),
            eq(workExceptions.exceptionType, exceptionType),
            eq(workExceptions.status, "open")
          )
        )
        .limit(1);

      if (!existingException) {
        await tx
          .insert(workExceptions)
          .values({
            id: crypto.randomUUID(),
            tenantId: input.tenantId,
            requestId: input.requestId ?? null,
            caseId: input.caseId,
            taskId: input.taskId ?? null,
            exceptionType,
            severity: slaRow.breachState === "breached" ? "critical" : "high",
            status: "open",
            reason:
              slaRow.breachState === "breached"
                ? "SLA breached"
                : "SLA at risk",
            metadataJson: {
              policyId: input.policyId ?? null,
              breachState: slaRow.breachState,
              dueAt: input.dueAt?.toISOString() ?? null,
            },
            createdAt: now(),
            updatedAt: now(),
          } satisfies InsertWorkException)
          .returning();
      }
    }

    if (caseRecord && nextState !== previousState) {
      await syncRequestAndCaseState(
        input.tenantId,
        input.caseId,
        nextState,
        input.requestId ?? caseRecord.requestId,
        tx
      );
    }

    await insertWorkOsEvent(
      {
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
      },
      tx
    );

    return [slaRow];
  });

  return sla;
}

export async function getWorkCaseProjection(
  caseId: string,
  tenantId: string
): Promise<WorkCaseProjection> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const workCase = await loadCaseRecord(caseId, tenantId);
  if (!workCase) {
    throw new Error(`Work case ${caseId} not found`);
  }

  const request = await loadRequestRecord(workCase.requestId, tenantId);
  const task = workCase.primaryTaskId
    ? ((
        await db
          .select()
          .from(teamWorkItems)
          .where(
            and(
              eq(teamWorkItems.id, workCase.primaryTaskId),
              eq(teamWorkItems.tenantId, tenantId)
            )
          )
          .limit(1)
      )[0] ?? null)
    : null;

  const assignments = await db
    .select()
    .from(workAssignments)
    .where(
      and(
        eq(workAssignments.caseId, workCase.id),
        eq(workAssignments.tenantId, tenantId)
      )
    )
    .orderBy(desc(workAssignments.createdAt));
  const approvals = await db
    .select()
    .from(workApprovals)
    .where(
      and(
        eq(workApprovals.caseId, workCase.id),
        eq(workApprovals.tenantId, tenantId)
      )
    )
    .orderBy(desc(workApprovals.createdAt));
  const exceptions = await db
    .select()
    .from(workExceptions)
    .where(
      and(
        eq(workExceptions.caseId, workCase.id),
        eq(workExceptions.tenantId, tenantId)
      )
    )
    .orderBy(desc(workExceptions.createdAt));
  const outcomes = await db
    .select()
    .from(workOutcomes)
    .where(
      and(
        eq(workOutcomes.caseId, workCase.id),
        eq(workOutcomes.tenantId, tenantId)
      )
    )
    .orderBy(desc(workOutcomes.createdAt));
  const slas = await db
    .select()
    .from(workSlas)
    .where(
      and(eq(workSlas.caseId, workCase.id), eq(workSlas.tenantId, tenantId))
    )
    .orderBy(desc(workSlas.createdAt));

  const [
    osEvents,
    legacyEvents,
    workpackEvidence,
    teamRunEvidence,
    roleRoutineEvidence,
  ] = await Promise.all([
    db
      .select()
      .from(workOsEvents)
      .where(
        and(
          eq(workOsEvents.caseId, workCase.id),
          eq(workOsEvents.tenantId, tenantId)
        )
      )
      .orderBy(desc(workOsEvents.createdAt)),
    task
      ? db
          .select()
          .from(workItemEvents)
          .where(eq(workItemEvents.workItemId, task.id))
          .orderBy(desc(workItemEvents.createdAt))
      : Promise.resolve([]),
    buildWorkpackTimelineEntries(tenantId, request, workCase),
    buildTeamRunTimelineEntries(tenantId, request, workCase, task),
    buildRoleRoutineTimelineEntries(tenantId, request, workCase, task),
  ]);
  const [automationEvidence, automation] = await Promise.all([
    buildAutomationTimelineEntries(workCase.id, tenantId),
    getAutomationProjectionForCase(workCase.id, tenantId),
  ]);
  const browserAutomationEvidence = await buildBrowserAutomationTimelineEntries(
    workCase.id,
    tenantId
  );

  const timeline: WorkTimelineEntry[] = [
    ...osEvents.map(entry => ({
      id: entry.id,
      source: "work_os" as const,
      eventType: entry.eventType,
      createdAt: entry.createdAt,
      requestId: entry.requestId,
      caseId: entry.caseId,
      taskId: entry.taskId,
      detailJson: (entry.detailJson as Record<string, unknown> | null) ?? null,
    })),
    ...legacyEvents.map(entry => ({
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

  return {
    request,
    case: workCase,
    task,
    automation,
    assignments,
    approvals,
    exceptions,
    outcomes,
    slas,
    timeline,
  };
}

export async function getInbox(
  tenantId: string,
  ownerType?: string | null,
  ownerId?: string | null
): Promise<WorkInboxCase[]> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const filters = [eq(workCases.tenantId, tenantId)];
  if (ownerType) {
    filters.push(eq(workCases.ownerType, ownerType as never));
  }
  if (ownerId) {
    filters.push(eq(workCases.ownerId, ownerId));
  }

  const cases = await db
    .select()
    .from(workCases)
    .where(and(...filters))
    .orderBy(desc(workCases.updatedAt));
  const enriched = await Promise.all(
    cases.map(async workCase => {
      const runIds = uniqueIds(workCase.linkedRoleRoutineRunIdsJson ?? []);
      if (runIds.length === 0) {
        return {
          ...workCase,
          latestTeamId: null,
          latestTeamRoomId: null,
          latestTeamRunId: null,
          latestTeamRunStatus: null,
          latestTeamRunMode: null,
          latestExploration: null,
          latestFinalReview: null,
          latestTraceId: null,
          latestContext: null,
          latestReadiness: null,
        } satisfies WorkInboxCase;
      }

      const runs = await db
        .select({ run: teamRuns })
        .from(teamRuns)
        .innerJoin(teamRooms, eq(teamRooms.id, teamRuns.roomId))
        .where(
          and(eq(teamRooms.tenantId, tenantId), inArray(teamRuns.id, runIds))
        )
        .orderBy(desc(teamRuns.startedAt));

      for (const { run } of runs) {
        const latestSnapshot = await monitoringService
          .getLatestRunSnapshot(run.id)
          .catch(() => null);
        const planArtifact =
          monitoringService.extractRunPlanArtifact(latestSnapshot);
        const exploration = planArtifact?.exploration;
        const finalReview = summarizeFinalReview(latestSnapshot);
        const artifacts = summarizeTeamRunArtifacts(latestSnapshot);
        if (
          exploration ||
          finalReview ||
          artifacts.traceId ||
          artifacts.governedContext ||
          artifacts.readinessRecord
        ) {
          const latestExploration = exploration
            ? {
                selectedCandidateId: exploration.selectedCandidateId,
                selectionReason: exploration.selectionReason,
                candidateCount: exploration.candidates.length,
              }
            : null;
          const latestFinalReview = finalReview
            ? {
                reviewerPersona: finalReview.reviewerPersona as string | null,
                score: finalReview.score as number | null,
                recommendation: finalReview.recommendation as string | null,
                comment: finalReview.comment as string | null,
              }
            : null;
          return {
            ...workCase,
            latestTeamId: run.teamId,
            latestTeamRoomId: run.roomId,
            latestTeamRunId: run.id,
            latestTeamRunStatus: run.status,
            latestTeamRunMode: run.executionMode,
            latestExploration,
            latestFinalReview,
            latestTraceId: artifacts.traceId,
            latestContext: artifacts.governedContext,
            latestReadiness: artifacts.readinessRecord,
          } satisfies WorkInboxCase;
        }
      }

      return {
        ...workCase,
        latestTeamId: null,
        latestTeamRoomId: null,
        latestTeamRunId: null,
        latestTeamRunStatus: null,
        latestTeamRunMode: null,
        latestExploration: null,
        latestFinalReview: null,
        latestTraceId: null,
        latestContext: null,
        latestReadiness: null,
      } satisfies WorkInboxCase;
    })
  );

  return enriched;
}

export async function getOverview(tenantId: string): Promise<{
  byState: Record<string, number>;
  openExceptions: number;
  overdueSla: number;
  completed: number;
}> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const cases = await db
    .select()
    .from(workCases)
    .where(eq(workCases.tenantId, tenantId));
  const exceptions = await db
    .select()
    .from(workExceptions)
    .where(
      and(
        eq(workExceptions.tenantId, tenantId),
        eq(workExceptions.status, "open")
      )
    );
  const overdue = await db
    .select()
    .from(workSlas)
    .where(
      and(
        eq(workSlas.tenantId, tenantId),
        inArray(workSlas.breachState, ["at_risk", "breached"])
      )
    );

  const byState = cases.reduce<Record<string, number>>((acc, item) => {
    acc[item.currentState] = (acc[item.currentState] ?? 0) + 1;
    return acc;
  }, {});

  return {
    byState,
    openExceptions: exceptions.length,
    overdueSla: overdue.length,
    completed: cases.filter(item => item.currentState === "completed").length,
  };
}

export async function projectTaskAsCase(
  taskId: string,
  tenantId: string
): Promise<WorkCaseProjection> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const [task] = await db
    .select()
    .from(teamWorkItems)
    .where(
      and(eq(teamWorkItems.id, taskId), eq(teamWorkItems.tenantId, tenantId))
    )
    .limit(1);
  if (!task) {
    throw new Error(`Work task ${taskId} not found`);
  }

  const [linkedCase] = await db
    .select()
    .from(workCases)
    .where(
      and(eq(workCases.primaryTaskId, taskId), eq(workCases.tenantId, tenantId))
    )
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

  const legacyEvents = await db
    .select()
    .from(workItemEvents)
    .where(eq(workItemEvents.workItemId, task.id))
    .orderBy(desc(workItemEvents.createdAt));
  const roleRoutineEvidence = await buildRoleRoutineTimelineEntries(
    tenantId,
    null,
    syntheticCase,
    task
  );
  const automation = await getAutomationProjectionForCase(
    syntheticCase.id,
    tenantId
  );
  const automationEvidence = await buildAutomationTimelineEntries(
    syntheticCase.id,
    tenantId
  );
  const browserAutomationEvidence = await buildBrowserAutomationTimelineEntries(
    syntheticCase.id,
    tenantId
  );
  const timeline: WorkTimelineEntry[] = [
    ...legacyEvents.map(entry => ({
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
