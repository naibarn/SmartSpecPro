import crypto from "crypto";
import { and, asc, desc, eq, inArray, or, sql } from "drizzle-orm";
import {
  autoTeamArtifactRefs,
  autoTeamExecutionStages,
  autoTeamFinalResults,
  autoTeamMediaJobRefs,
  autoTeamReviewRecords,
  autoTeamRouteDecisions,
  autoTeamTraceEvents,
  type AutoTeamArtifactRefRow,
  type AutoTeamExecutionStageRow,
  type AutoTeamFinalResultRow,
  type AutoTeamMediaJobRefRow,
  type AutoTeamReviewRecordRow,
  type AutoTeamRouteDecisionRow,
  type AutoTeamTraceEventRow,
} from "../../drizzle/schema";
import { getDb } from "../db";
import * as roomService from "./roomService";
import { freezeAutoTeamExecutionModeSnapshot } from "./autoTeamFeatureFlags";
import { getRequiredStagePlan, type AutoTeamStagePlanEntry } from "./autoTeamRoutePolicy";
import { emitAutoTeamTraceEvent, listAutoTeamTraceEvents, type AutoTeamTraceEventInput } from "./autoTeamTraceEventService";
import { evaluateStageTimeout as evaluateStageTimeoutPolicy, getAutoTeamStageTimeoutPolicy } from "./autoTeamStageTimeoutPolicy";
import { getLatestRunSnapshot } from "./monitoringService";
import { projectTaskAsCase } from "./workOsService";
import { evaluateCompletionEvidence } from "./autoTeamCompletionEvidence";
import { type AutoTeamRoutePolicyInput, classifyAutoTeamRoute, buildRouteDecisionIdempotencyKey } from "./autoTeamRoutePolicy";
import { type AutoTeamCapabilityFamily, type AutoTeamRouteClass, type AutoTeamRunSnapshot, type AutoTeamStageType, type AutoTeamStageStatus } from "../../shared/autoTeamExecution";

export interface EnsureRouteDecisionInput extends AutoTeamRoutePolicyInput {
  runId: string;
  workItemId?: string | null;
}

export interface EnsureStagePlanInput {
  tenantId: string;
  teamId?: string | null;
  roomId?: string | null;
  runId: string;
  routeDecision: AutoTeamRouteDecisionRow;
  workItemId?: string | null;
  objective?: string | null;
  language?: "en" | "th" | null;
}

export interface ClaimNextRunnableStageInput {
  tenantId: string;
  runId: string;
  claimedBy: string;
  now?: Date;
}

export interface MarkStageInput {
  tenantId: string;
  runId: string;
  stageId: string;
  workItemId?: string | null;
  actor?: string | null;
  reason?: string | null;
  metadataJson?: Record<string, unknown> | null;
}

export interface AttachStageEvidenceInput {
  tenantId: string;
  runId: string;
  stageId: string;
  workItemId?: string | null;
  inputArtifactRefsJson?: string[];
  outputArtifactRefsJson?: string[];
  jobRefIdsJson?: string[];
  metadataJson?: Record<string, unknown> | null;
}

export interface PostStageUpdateInput {
  tenantId: string;
  roomId: string;
  runId?: string | null;
  senderAssistantId: string;
  content: string;
  summaryContent?: string | null;
  stageId?: string | null;
  workItemId?: string | null;
  artifactRefsJson?: string[] | null;
  metadataJson?: Record<string, unknown> | null;
  tokenUsageJson?: Record<string, unknown> | null;
}

export interface GetRunSnapshotInput {
  tenantId: string;
  runId: string;
}

export interface CanonicalExecutionSnapshot extends AutoTeamRunSnapshot {
  latestMonitoringSnapshot: Awaited<ReturnType<typeof getLatestRunSnapshot>> | null;
}

export interface StageTimeoutEvaluationInput {
  tenantId: string;
  runId: string;
  stage: Pick<AutoTeamExecutionStageRow, "id" | "stageType" | "status" | "deadlineAt" | "claimExpiresAt" | "startedAt" | "blockedReason" | "errorCode" | "errorMessage">;
  now?: Date;
}

function now(input?: Date): Date {
  return input ?? new Date();
}

function getIdempotencyKeyForStage(
  runId: string,
  planStepKey: string,
  attempt: number,
): string {
  return crypto.createHash("sha256").update([runId, planStepKey, String(attempt)].join("|")).digest("hex");
}

export function evaluateStageTimeout(
  input: StageTimeoutEvaluationInput,
): ReturnType<typeof evaluateStageTimeoutPolicy> {
  return evaluateStageTimeoutPolicy({
    stageType: input.stage.stageType,
    startedAt: input.stage.startedAt ?? input.stage.deadlineAt ?? input.stage.claimExpiresAt ?? null,
    status: input.stage.status,
    now: input.now,
  });
}

export async function emitTraceEvent(
  input: AutoTeamTraceEventInput,
): Promise<Awaited<ReturnType<typeof emitAutoTeamTraceEvent>>> {
  return emitAutoTeamTraceEvent(input);
}

function buildStageCapabilityFamily(
  routeClass: AutoTeamRouteClass,
  stageType: AutoTeamStageType,
): AutoTeamCapabilityFamily | null {
  if (routeClass === "media.video") {
    if (stageType === "prompt") return "video.prompt";
    if (stageType === "research" || stageType === "storyboard" || stageType === "plan") return "research.synthesis";
    if (stageType === "media_submit" || stageType === "media_poll") return "media.video";
    if (stageType === "review" || stageType === "human_approval" || stageType === "finalize") return "writing.review";
  }
  if (routeClass === "media.image") {
    if (stageType === "prompt") return "image.prompt";
    if (stageType === "media_submit" || stageType === "media_poll") return "media.image";
    if (stageType === "plan") return "research.synthesis";
    if (stageType === "review" || stageType === "human_approval" || stageType === "finalize") return "writing.review";
  }
  if (routeClass === "agency.swarm") {
    if (stageType === "agency_delegate") return "agency.swarm";
    if (stageType === "plan" || stageType === "research") return "research.synthesis";
    if (stageType === "review" || stageType === "human_approval" || stageType === "finalize") return "writing.review";
  }
  if (routeClass === "workflow.automation") {
    if (stageType === "route" || stageType === "plan" || stageType === "research") return "workflow.automation";
    if (stageType === "review" || stageType === "finalize") return "writing.review";
  }
  if (routeClass === "research.synthesis") {
    if (stageType === "research") return "research.synthesis";
    if (stageType === "review" || stageType === "finalize") return "writing.review";
  }
  if (routeClass === "document.writing") {
    if (stageType === "plan" || stageType === "prompt") return "document.writing";
    if (stageType === "review" || stageType === "finalize") return "writing.review";
  }
  return null;
}

function buildStageInputArtifacts(
  routeClass: AutoTeamRouteClass,
  stageType: AutoTeamStageType,
): string[] {
  if (routeClass === "media.video") {
    if (stageType === "storyboard") return ["research_summary"];
    if (stageType === "prompt") return ["research_summary", "storyboard"];
    if (stageType === "media_submit" || stageType === "media_poll") return ["media_prompt", "storyboard"];
    if (stageType === "review") return ["media_result", "media_prompt"];
    if (stageType === "finalize") return ["media_result", "review_note"];
  }
  if (routeClass === "media.image") {
    if (stageType === "prompt") return ["research_summary"];
    if (stageType === "media_submit" || stageType === "media_poll") return ["media_prompt"];
    if (stageType === "review") return ["media_result", "media_prompt"];
    if (stageType === "finalize") return ["media_result", "review_note"];
  }
  if (routeClass === "agency.swarm") {
    if (stageType === "agency_delegate") return ["research_summary"];
    if (stageType === "review") return ["review_note"];
    if (stageType === "finalize") return ["final_result", "review_note"];
  }
  return [];
}

function buildPlanSteps(routeClass: AutoTeamRouteClass): AutoTeamStagePlanEntry[] {
  return getRequiredStagePlan(routeClass);
}

export async function ensureRouteDecision(
  input: EnsureRouteDecisionInput,
): Promise<AutoTeamRouteDecisionRow> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const classification = classifyAutoTeamRoute({
    tenantId: input.tenantId,
    teamId: input.teamId ?? null,
    roomId: input.roomId ?? null,
    runId: input.runId,
    workRequestId: input.workRequestId ?? null,
    workCaseId: input.workCaseId ?? null,
    objective: input.objective ?? null,
    requestTitle: input.requestTitle ?? null,
    requestSummary: input.requestSummary ?? null,
    workType: input.workType ?? null,
    language: input.language ?? null,
    requestedProvider: input.requestedProvider ?? null,
    requestedModel: input.requestedModel ?? null,
    availableCapabilities: input.availableCapabilities ?? null,
    teamPersonas: input.teamPersonas ?? null,
  });
  const executionModeSnapshot = await freezeAutoTeamExecutionModeSnapshot();
  const idempotencyKey = buildRouteDecisionIdempotencyKey({
    tenantId: input.tenantId,
    teamId: input.teamId ?? null,
    roomId: input.roomId ?? null,
    runId: input.runId,
    workRequestId: input.workRequestId ?? null,
    workCaseId: input.workCaseId ?? null,
    objective: input.objective ?? null,
    requestTitle: input.requestTitle ?? null,
    requestSummary: input.requestSummary ?? null,
    workType: input.workType ?? null,
    language: classification.language,
    requestedProvider: input.requestedProvider ?? null,
    requestedModel: input.requestedModel ?? null,
  });

  const [existing] = await db
    .select()
    .from(autoTeamRouteDecisions)
    .where(
      and(
        eq(autoTeamRouteDecisions.tenantId, input.tenantId),
        eq(autoTeamRouteDecisions.runId, input.runId),
        eq(autoTeamRouteDecisions.idempotencyKey, idempotencyKey),
      ),
    )
    .limit(1);
  if (existing) return existing;

  const [inserted] = await db
    .insert(autoTeamRouteDecisions)
    .values({
      tenantId: input.tenantId,
      teamId: input.teamId ?? null,
      roomId: input.roomId ?? null,
      runId: input.runId,
      workRequestId: input.workRequestId ?? null,
      workCaseId: input.workCaseId ?? null,
      routeClass: classification.routeClass,
      routeConfidence: classification.routeConfidence,
      allowedCapabilityFamiliesJson: classification.allowedCapabilityFamilies,
      selectedPolicyJson: {
        ...classification.selectedPolicyJson,
        executionMode: executionModeSnapshot.executionMode,
        executionModeSnapshot,
      },
      selectedOrchestratorPersonaId: classification.selectedOrchestratorPersonaId,
      language: classification.language,
      decisionReason: classification.decisionReason,
      source: "auto_team_route_policy",
      blockedReason: classification.blockedReason,
      idempotencyKey,
      createdAt: now(),
      updatedAt: now(),
    })
    .returning();

  await emitAutoTeamTraceEvent({
    tenantId: input.tenantId,
    teamId: input.teamId ?? null,
    roomId: input.roomId ?? null,
    runId: input.runId,
    stageId: null,
    workItemId: input.workItemId ?? null,
    traceEventId: `route.decision.created:${input.runId}`,
    eventName: "route.decision.created",
    sourceComponent: "autoTeamExecutionService",
    severity: classification.blockedReason ? "warn" : "info",
    summary: classification.decisionReason,
    redactedMetadataJson: {
      routeClass: classification.routeClass,
      routeConfidence: classification.routeConfidence,
      selectedOrchestratorPersonaId: classification.selectedOrchestratorPersonaId,
      language: classification.language,
      executionMode: executionModeSnapshot.executionMode,
    },
    idempotencyKey: `route.decision.created:${idempotencyKey}`,
  });

  return inserted;
}

export async function ensureStagePlan(
  input: EnsureStagePlanInput,
): Promise<{ routeDecision: AutoTeamRouteDecisionRow; stages: AutoTeamExecutionStageRow[] }> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const existingStages = await db
    .select()
    .from(autoTeamExecutionStages)
    .where(
      and(
        eq(autoTeamExecutionStages.tenantId, input.tenantId),
        eq(autoTeamExecutionStages.runId, input.runId),
        eq(autoTeamExecutionStages.routeDecisionId, input.routeDecision.id ?? null),
      ),
    )
    .orderBy(asc(autoTeamExecutionStages.createdAt));
  if (existingStages.length > 0) {
    return { routeDecision: input.routeDecision, stages: existingStages };
  }

  const plan = buildPlanSteps(input.routeDecision.routeClass);
  const createdStages: AutoTeamExecutionStageRow[] = [];

  for (const [index, entry] of plan.entries()) {
    const [stage] = await db
      .insert(autoTeamExecutionStages)
      .values({
        tenantId: input.tenantId,
        teamId: input.teamId ?? null,
        roomId: input.roomId ?? null,
        runId: input.runId,
        routeDecisionId: input.routeDecision.id ?? null,
        workItemId: input.workItemId ?? null,
        planStepKey: `${entry.stageType}:${index + 1}`,
        stageType: entry.stageType,
        status: "queued",
        assignedPersonaId: null,
        expectedCapabilityFamily: buildStageCapabilityFamily(input.routeDecision.routeClass, entry.stageType),
        selectedSkillId: null,
        selectedProvider: null,
        inputArtifactRefsJson: buildStageInputArtifacts(input.routeDecision.routeClass, entry.stageType),
        outputArtifactRefsJson: [],
        jobRefIdsJson: [],
        attempt: 1,
        maxAttempts: 3,
        claimToken: null,
        claimExpiresAt: null,
        claimedBy: null,
        startedAt: null,
        completedAt: null,
        deadlineAt: null,
        blockedReason: entry.reason,
        errorCode: null,
        errorMessage: null,
        idempotencyKey: getIdempotencyKeyForStage(input.runId, `${entry.stageType}:${index + 1}`, 1),
        metadataJson: {
          routeClass: input.routeDecision.routeClass,
          requiresHumanApproval: entry.requiresHumanApproval,
          planReason: entry.reason,
          language: input.language ?? input.routeDecision.language,
        },
        createdAt: now(),
        updatedAt: now(),
      })
      .returning();
    if (stage) {
      createdStages.push(stage);
      await emitAutoTeamTraceEvent({
        tenantId: input.tenantId,
        teamId: input.teamId ?? null,
        roomId: input.roomId ?? null,
        runId: input.runId,
        stageId: stage.id,
        workItemId: input.workItemId ?? null,
        traceEventId: `stage.created:${stage.id}`,
        eventName: "stage.created",
        sourceComponent: "autoTeamExecutionService",
        severity: "info",
        summary: `Stage ${stage.stageType} created`,
        redactedMetadataJson: {
          planStepKey: stage.planStepKey,
          expectedCapabilityFamily: stage.expectedCapabilityFamily,
        },
        idempotencyKey: `stage.created:${stage.id}`,
      });
    }
  }

  return { routeDecision: input.routeDecision, stages: createdStages };
}

async function selectNextStageCandidate(
  tenantId: string,
  runId: string,
  nowValue: Date,
): Promise<AutoTeamExecutionStageRow | null> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const candidates = await db
    .select()
    .from(autoTeamExecutionStages)
    .where(
      and(
        eq(autoTeamExecutionStages.tenantId, tenantId),
        eq(autoTeamExecutionStages.runId, runId),
        or(
          eq(autoTeamExecutionStages.status, "queued"),
          eq(autoTeamExecutionStages.status, "needs_revision"),
          sql`${autoTeamExecutionStages.claimExpiresAt} < ${nowValue}`,
        ),
      ),
    )
    .orderBy(asc(autoTeamExecutionStages.createdAt), asc(autoTeamExecutionStages.attempt));

  return candidates[0] ?? null;
}

export async function claimNextRunnableStage(
  input: ClaimNextRunnableStageInput,
): Promise<AutoTeamExecutionStageRow | null> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const nowValue = now(input.now);
  const candidate = await selectNextStageCandidate(input.tenantId, input.runId, nowValue);
  if (!candidate) return null;

  const claimToken = crypto.randomUUID();
  const claimExpiresAt = new Date(nowValue.getTime() + getAutoTeamStageTimeoutPolicy(candidate.stageType).timeoutMs);
  const [claimed] = await db
    .update(autoTeamExecutionStages)
    .set({
      status: "in_progress",
      claimToken,
      claimedBy: input.claimedBy,
      claimExpiresAt,
      startedAt: candidate.startedAt ?? nowValue,
      deadlineAt: candidate.deadlineAt ?? claimExpiresAt,
      updatedAt: nowValue,
    })
    .where(
      and(
        eq(autoTeamExecutionStages.id, candidate.id),
        eq(autoTeamExecutionStages.tenantId, input.tenantId),
        or(
          eq(autoTeamExecutionStages.status, "queued"),
          eq(autoTeamExecutionStages.status, "needs_revision"),
          sql`${autoTeamExecutionStages.claimExpiresAt} < ${nowValue}`,
        ),
      ),
    )
    .returning();

  if (!claimed) return null;

  await emitAutoTeamTraceEvent({
    tenantId: input.tenantId,
    teamId: claimed.teamId,
    roomId: claimed.roomId,
    runId: input.runId,
    stageId: claimed.id,
    workItemId: claimed.workItemId ?? null,
    traceEventId: `stage.claimed:${claimed.id}:${claimToken}`,
    eventName: "stage.claimed",
    sourceComponent: "autoTeamExecutionService",
    severity: "info",
    summary: `Claimed ${claimed.stageType}`,
    redactedMetadataJson: {
      claimExpiresAt: claimExpiresAt.toISOString(),
      claimedBy: input.claimedBy,
    },
    idempotencyKey: `stage.claimed:${claimed.id}:${claimToken}`,
  });

  return claimed;
}

async function updateStage(
  input: MarkStageInput & {
    status: AutoTeamStageStatus;
    errorCode?: string | null;
    errorMessage?: string | null;
  },
): Promise<AutoTeamExecutionStageRow> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const [updated] = await db
    .update(autoTeamExecutionStages)
    .set({
      status: input.status,
      blockedReason: input.reason ?? null,
      errorCode: input.errorCode ?? null,
      errorMessage: input.errorMessage ?? null,
      updatedAt: now(),
    })
    .where(and(eq(autoTeamExecutionStages.id, input.stageId), eq(autoTeamExecutionStages.tenantId, input.tenantId), eq(autoTeamExecutionStages.runId, input.runId)))
    .returning();

  if (!updated) throw new Error(`Stage ${input.stageId} not found`);
  return updated;
}

export async function markStageInProgress(input: MarkStageInput): Promise<AutoTeamExecutionStageRow> {
  const updated = await updateStage({ ...input, status: "in_progress" });
  await emitAutoTeamTraceEvent({
    tenantId: input.tenantId,
    teamId: updated.teamId,
    roomId: updated.roomId,
    runId: input.runId,
    stageId: input.stageId,
    workItemId: input.workItemId ?? null,
    traceEventId: `stage.started:${input.stageId}`,
    eventName: "stage.claimed",
    sourceComponent: "autoTeamExecutionService",
    severity: "info",
    summary: input.reason ?? `Stage ${updated.stageType} started`,
    redactedMetadataJson: input.metadataJson ?? {},
    idempotencyKey: `stage.started:${input.stageId}`,
  });
  return updated;
}

export async function markStageCompleted(input: MarkStageInput): Promise<AutoTeamExecutionStageRow> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const [updated] = await db
    .update(autoTeamExecutionStages)
    .set({
      status: "completed",
      completedAt: now(),
      blockedReason: input.reason ?? null,
      metadataJson: {
        ...(input.metadataJson ?? {}),
        completedBy: input.actor ?? null,
      },
      updatedAt: now(),
    })
    .where(and(eq(autoTeamExecutionStages.id, input.stageId), eq(autoTeamExecutionStages.tenantId, input.tenantId), eq(autoTeamExecutionStages.runId, input.runId)))
    .returning();
  if (!updated) throw new Error(`Stage ${input.stageId} not found`);
  await emitAutoTeamTraceEvent({
    tenantId: input.tenantId,
    teamId: updated.teamId,
    roomId: updated.roomId,
    runId: input.runId,
    stageId: input.stageId,
    workItemId: input.workItemId ?? null,
    traceEventId: `stage.completed:${input.stageId}`,
    eventName: "stage.completed",
    sourceComponent: "autoTeamExecutionService",
    severity: "info",
    summary: input.reason ?? `Stage ${updated.stageType} completed`,
    redactedMetadataJson: input.metadataJson ?? {},
    idempotencyKey: `stage.completed:${input.stageId}`,
  });
  return updated;
}

export async function markStageBlocked(input: MarkStageInput): Promise<AutoTeamExecutionStageRow> {
  const updated = await updateStage({ ...input, status: "blocked", errorCode: input.metadataJson?.errorCode as string | null | undefined });
  await emitAutoTeamTraceEvent({
    tenantId: input.tenantId,
    teamId: updated.teamId,
    roomId: updated.roomId,
    runId: input.runId,
    stageId: input.stageId,
    workItemId: input.workItemId ?? null,
    traceEventId: `stage.blocked:${input.stageId}:${input.reason ?? "blocked"}`,
    eventName: "stage.blocked",
    sourceComponent: "autoTeamExecutionService",
    severity: "warn",
    summary: input.reason ?? "stage blocked",
    redactedMetadataJson: input.metadataJson ?? {},
    idempotencyKey: `stage.blocked:${input.stageId}:${input.reason ?? "blocked"}`,
  });
  return updated;
}

export async function markStageFailed(input: MarkStageInput): Promise<AutoTeamExecutionStageRow> {
  const updated = await updateStage({ ...input, status: "failed", errorCode: input.metadataJson?.errorCode as string | null | undefined });
  await emitAutoTeamTraceEvent({
    tenantId: input.tenantId,
    teamId: updated.teamId,
    roomId: updated.roomId,
    runId: input.runId,
    stageId: input.stageId,
    workItemId: input.workItemId ?? null,
    traceEventId: `stage.failed:${input.stageId}:${input.reason ?? "failed"}`,
    eventName: "stage.failed",
    sourceComponent: "autoTeamExecutionService",
    severity: "error",
    summary: input.reason ?? "stage failed",
    redactedMetadataJson: input.metadataJson ?? {},
    idempotencyKey: `stage.failed:${input.stageId}:${input.reason ?? "failed"}`,
  });
  return updated;
}

export async function markStageCancelled(input: MarkStageInput): Promise<AutoTeamExecutionStageRow> {
  const updated = await updateStage({ ...input, status: "cancelled" });
  await emitAutoTeamTraceEvent({
    tenantId: input.tenantId,
    teamId: updated.teamId,
    roomId: updated.roomId,
    runId: input.runId,
    stageId: input.stageId,
    workItemId: input.workItemId ?? null,
    traceEventId: `stage.cancelled:${input.stageId}:${input.reason ?? "cancelled"}`,
    eventName: "stage.cancelled",
    sourceComponent: "autoTeamExecutionService",
    severity: "warn",
    summary: input.reason ?? "stage cancelled",
    redactedMetadataJson: input.metadataJson ?? {},
    idempotencyKey: `stage.cancelled:${input.stageId}:${input.reason ?? "cancelled"}`,
  });
  return updated;
}

export async function attachStageEvidence(
  input: AttachStageEvidenceInput,
): Promise<AutoTeamExecutionStageRow> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const [updated] = await db
    .update(autoTeamExecutionStages)
    .set({
      inputArtifactRefsJson: input.inputArtifactRefsJson ?? [],
      outputArtifactRefsJson: input.outputArtifactRefsJson ?? [],
      jobRefIdsJson: input.jobRefIdsJson ?? [],
      metadataJson: {
        ...(input.metadataJson ?? {}),
        evidenceAttachedAt: now().toISOString(),
      },
      updatedAt: now(),
    })
    .where(and(eq(autoTeamExecutionStages.id, input.stageId), eq(autoTeamExecutionStages.tenantId, input.tenantId), eq(autoTeamExecutionStages.runId, input.runId)))
    .returning();
  if (!updated) throw new Error(`Stage ${input.stageId} not found`);
  return updated;
}

export async function postStageUpdate(
  input: PostStageUpdateInput,
): Promise<Awaited<ReturnType<typeof roomService.postWorkUpdate>>> {
  return roomService.postWorkUpdate({
    roomId: input.roomId,
    tenantId: input.tenantId,
    senderAssistantId: input.senderAssistantId,
    runId: input.runId ?? undefined,
    content: input.content,
    artifactRefs: (input.artifactRefsJson ?? []).map((artifactId) => ({
      artifactId,
    })),
    metadataJson: {
      ...input.metadataJson,
      summaryContent: input.summaryContent ?? null,
      stageId: input.stageId ?? null,
      workItemId: input.workItemId ?? null,
    },
    tokenUsageJson: input.tokenUsageJson ?? undefined,
  });
}

export async function mirrorStageToWorkOs(
  input: { tenantId: string; stage: AutoTeamExecutionStageRow },
): Promise<unknown | null> {
  if (!input.stage.workItemId) return null;
  return projectTaskAsCase(input.stage.workItemId, input.tenantId).catch(() => null);
}

export async function assertCanCompleteRun(
  input: { tenantId: string; runId: string },
): Promise<ReturnType<typeof evaluateCompletionEvidence>> {
  const snapshot = await getRunSnapshot(input);
  const result = evaluateCompletionEvidence({
    tenantId: input.tenantId,
    teamId: snapshot.teamId,
    roomId: snapshot.roomId,
    runId: input.runId,
    routeDecision: snapshot.routeDecision
      ? {
          id: snapshot.routeDecision.id ?? "",
          routeClass: snapshot.routeDecision.routeClass,
          language: snapshot.routeDecision.language,
        }
      : {
          id: "",
          routeClass: "unknown.blocked",
          language: "en",
        },
    artifactRefs: snapshot.stages.flatMap((stage) => (stage.outputArtifactRefsJson ?? []).map((artifactId) => ({
      tenantId: input.tenantId,
      teamId: snapshot.teamId,
      roomId: snapshot.roomId,
      runId: input.runId,
      stageId: stage.id ?? null,
      workItemId: stage.workItemId ?? null,
      artifactType: "final_result",
      artifactRole: "result",
      storageRef: artifactId,
      externalRef: null,
      contentHash: null,
      visibility: "tenant",
      retentionPolicyJson: null,
      safetyStatus: "unknown",
      source: "autoTeamExecutionService",
    }))),
    mediaJobRefs: snapshot.mediaJobs,
    reviewRecords: snapshot.reviews.map((review) => ({
      id: review.id ?? "",
      passed: review.passed,
      reviewType: review.reviewType,
    })),
    humanApprovalStatus: snapshot.finalResult?.humanApprovalStatus ?? "not_required",
    finalCandidateStageId: snapshot.currentStage?.id ?? null,
  });
  if (!result.ok) {
    throw new Error(result.userMessage);
  }
  return result;
}

async function loadRouteDecisionForRun(
  tenantId: string,
  runId: string,
): Promise<AutoTeamRouteDecisionRow | null> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const [row] = await db
    .select()
    .from(autoTeamRouteDecisions)
    .where(and(eq(autoTeamRouteDecisions.tenantId, tenantId), eq(autoTeamRouteDecisions.runId, runId)))
    .orderBy(desc(autoTeamRouteDecisions.createdAt))
    .limit(1);
  return row ?? null;
}

export async function getRunSnapshot(
  input: GetRunSnapshotInput,
): Promise<CanonicalExecutionSnapshot> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const routeDecision = await loadRouteDecisionForRun(input.tenantId, input.runId);
  const stages = await db
    .select()
    .from(autoTeamExecutionStages)
    .where(and(eq(autoTeamExecutionStages.tenantId, input.tenantId), eq(autoTeamExecutionStages.runId, input.runId)))
    .orderBy(asc(autoTeamExecutionStages.createdAt));
  const mediaJobs = await db
    .select()
    .from(autoTeamMediaJobRefs)
    .where(and(eq(autoTeamMediaJobRefs.tenantId, input.tenantId), eq(autoTeamMediaJobRefs.runId, input.runId)))
    .orderBy(desc(autoTeamMediaJobRefs.createdAt));
  const reviews = await db
    .select()
    .from(autoTeamReviewRecords)
    .where(and(eq(autoTeamReviewRecords.tenantId, input.tenantId), eq(autoTeamReviewRecords.runId, input.runId)))
    .orderBy(desc(autoTeamReviewRecords.createdAt));
  const finalResults = await db
    .select()
    .from(autoTeamFinalResults)
    .where(and(eq(autoTeamFinalResults.tenantId, input.tenantId), eq(autoTeamFinalResults.runId, input.runId)))
    .orderBy(desc(autoTeamFinalResults.createdAt));
  const traceEvents = await listAutoTeamTraceEvents(input.tenantId, input.runId, 100);
  const latestMonitoringSnapshot = await getLatestRunSnapshot(input.runId).catch(() => null);

  return {
    tenantId: input.tenantId,
    teamId: routeDecision?.teamId ?? stages[0]?.teamId ?? null,
    roomId: routeDecision?.roomId ?? stages[0]?.roomId ?? null,
    runId: input.runId,
    routeDecision,
    currentStage:
      stages.find((stage) => stage.status === "in_progress") ??
      [...stages].reverse().find((stage) => stage.status === "queued" || stage.status === "needs_revision") ??
      null,
    stages,
    mediaJobs,
    reviews,
    finalResult: finalResults[0] ?? null,
    traceEvents,
    updatedAt:
      (traceEvents[0]?.createdAt instanceof Date
        ? traceEvents[0]!.createdAt.toISOString()
        : typeof traceEvents[0]?.createdAt === "string"
          ? traceEvents[0]?.createdAt
          : new Date().toISOString()),
    latestMonitoringSnapshot,
  };
}

export async function emitRunStartedTrace(input: {
  tenantId: string;
  teamId?: string | null;
  roomId?: string | null;
  runId: string;
  workItemId?: string | null;
  routeDecisionId?: string | null;
  objective?: string | null;
}): Promise<AutoTeamTraceEventRow> {
  return emitAutoTeamTraceEvent({
    tenantId: input.tenantId,
    teamId: input.teamId ?? null,
    roomId: input.roomId ?? null,
    runId: input.runId,
    stageId: null,
    workItemId: input.workItemId ?? null,
    traceEventId: `automation.run.started:${input.runId}`,
    eventName: "automation.run.started",
    sourceComponent: "autoTeamExecutionService",
    severity: "info",
    summary: input.objective ?? null,
    redactedMetadataJson: {
      routeDecisionId: input.routeDecisionId ?? null,
    },
    idempotencyKey: `automation.run.started:${input.runId}`,
  });
}
