/**
 * Monitoring Service — records agent activity events, captures snapshots,
 * and detects stuck/looping agents.
 */

import {
  eq,
  and,
  sql,
  desc,
  count,
  gte,
  isNull,
  isNotNull,
  inArray,
} from "drizzle-orm";
import { getDb } from "../db";
import {
  agentActivityEvents,
  agentRunSummaries,
  runSnapshots,
  teamRuns,
  teamRooms,
  assistantProfiles,
  monitoringChecks,
  monitoringAlerts,
  systemMetricsHistory,
  llmProviders,
  providerUsageLog,
  apiAuditEvents,
  userNotifications,
  users,
  type AgentActivityEvent,
  type InsertAgentActivityEvent,
  type RunSnapshot,
  type BudgetSnapshot,
  type MonitoringCheck,
  type MonitoringAlert,
  type SystemMetricsHistory,
  type InsertMonitoringCheck,
  type InsertMonitoringAlert,
  type InsertSystemMetricsHistory,
  type TeamRun,
} from "../../drizzle/schema";
import crypto from "crypto";
import { auditLogger, type AuditLogEntry } from "./auditLogger";
import { getQueueHealthStatus } from "./queueHealthMonitor";
import { describeStatusBridge, type StatusBridge } from "./workStatusBridge";
import { getTraceId } from "./traceContext";
import {
  buildGovernedContextSnapshot,
  buildReadinessMetricRecord,
  buildTraceEnvelope,
  extractEnterpriseArtifacts,
  type GovernedContextInputItem,
  type GovernedContextSnapshot,
  type ReadinessMetricRecord,
  type TraceEnvelope,
} from "./enterprisePlatformArtifacts";
import {
  classifyContextEngineStatus,
  evaluateContextPack,
  evaluateContextStateHints,
  type ContextPack,
  type ContextStateHints,
  type ContextEngineEvaluation,
} from "./contextEngineAdapter";
import type {
  RuntimeDispatchPolicy,
  WorkOrchestratorSurface,
} from "../../shared/workOrchestrator";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface RecordEventInput {
  tenantId: string;
  teamId: string;
  roomId: string;
  runId: string;
  assistantId?: string;
  eventType: string;
  eventCategory:
    | "status_change"
    | "communication"
    | "tool_use"
    | "memory_op"
    | "artifact_op"
    | "handoff"
    | "approval"
    | "error";
  visibility?:
    | "transparent"
    | "milestone"
    | "summary_only"
    | "private_internal";
  summary?: string;
  detailJson?: Record<string, unknown>;
  tokenUsageSnapshot?: number;
  costSnapshot?: number;
  durationMs?: number;
}

export interface StuckAgentCheck {
  isStuck: boolean;
  agentId: string | null;
  reason: string | null;
  lastActivityAge: number | null;
}

export function describeRunStatusBridge(
  status: "queued" | "running" | "paused" | "completed" | "failed" | "stopped",
  stopReason?: string | null
) {
  return describeStatusBridge(status, stopReason);
}

export type RunRuntimePhase =
  | "planned"
  | "running"
  | "waiting_for_worker"
  | "waiting_for_poll"
  | "awaiting_human_choice"
  | "awaiting_final_review"
  | "awaiting_final_approval"
  | "awaiting_human_approval"
  | "blocked"
  | "completed"
  | "failed"
  | "cancelled";

export interface RunRuntimeState {
  currentPhase: RunRuntimePhase;
  waitingReason: string | null;
  policyGateReason: string | null;
  selectedSkillId: string | null;
  routeReason: string | null;
  traceId: string | null;
  nextPollAt: string | null;
  choiceDeadlineAt: string | null;
  finalReviewDeadlineAt: string | null;
  riskClass: "low" | "medium" | "high" | "critical" | null;
  reviewerPersona: string | null;
  verificationState: "pending" | "passed" | "failed" | "unknown";
  finalReview: {
    status: "pending" | "passed" | "failed";
    reviewerPersona: string | null;
    score: number | null;
    recommendation: string | null;
    comment: string | null;
    issues: string[];
  } | null;
  evidenceRefs: string[];
  jobHandle: Record<string, unknown> | null;
  statusBridge: StatusBridge;
  planArtifact: RunPlanArtifact | null;
  governedContext: GovernedContextSnapshot | null;
  traceEnvelope: TraceEnvelope | null;
  readinessRecord: ReadinessMetricRecord | null;
  workOsLinkage: {
    teamId: string;
    roomId: string;
    projectedWorkOsState: StatusBridge["workOsState"];
  } | null;
}

export type RunPlanStepStatus =
  | "planned"
  | "in_progress"
  | "waiting_for_worker"
  | "waiting_for_poll"
  | "awaiting_human_approval"
  | "blocked"
  | "completed"
  | "failed";

export type RunPlanReviewStatus = "pending" | "passed" | "failed";

export interface RunPlanReview {
  status: RunPlanReviewStatus;
  iteration: number;
  reviewedAt: string | null;
  reviewerPersona: string;
  issues: string[];
  score: number | null;
  recommendation: string | null;
}

export interface RunPlanComparisonCandidate {
  candidateId: string;
  title: string;
  strategy: string;
  summary: string;
  strengths: string[];
  tradeoffs: string[];
  riskClass: "low" | "medium" | "high" | "critical";
}

export interface RunPlanComparison {
  selectedCandidateId: string;
  selectionReason: string;
  criteria: string[];
  candidates: RunPlanComparisonCandidate[];
}

export interface RunPlanStep {
  stepKey: string;
  title: string;
  objective: string;
  deliverable: string;
  ownerPersona: string;
  ownerMemberId: string | null;
  reviewerPersona: string;
  reviewerMemberId: string | null;
  verificationMethod: string;
  retryRule: string;
  evidenceRequirements: string[];
  qualityCriteria: string[];
  reviewChecklist: string[];
  status: RunPlanStepStatus;
  evidenceRefs: string[];
  notes: string | null;
  surface?: WorkOrchestratorSurface | null;
  selectedCapabilityId?: string | null;
  runtimeDispatchPolicy?: RuntimeDispatchPolicy | null;
  validationState?: {
    status: "pending" | "passed" | "failed";
    attempt: number;
    maxAttempts: number;
    issues: string[];
    summary: string | null;
    semanticScore?: number | null;
    checkedAt: string | null;
  } | null;
}

export interface RunPlanArtifact {
  version: 1;
  runId: string;
  roomId: string;
  teamId: string;
  caseId: string | null;
  requestId: string | null;
  objective: string;
  source: "team_run" | "work_os";
  status:
    | "planning"
    | "ready"
    | "executing"
    | "blocked"
    | "completed"
    | "failed";
  generatedAt: string;
  lastUpdatedAt: string;
  steps: RunPlanStep[];
  evidenceRefs: string[];
  planEvidenceRefs: string[];
  reviewerMatrix: Array<{
    riskClass: "low" | "medium" | "high" | "critical";
    reviewerPersona: string;
    escalationRule: string;
  }>;
  exploration: RunPlanComparison | null;
  review: RunPlanReview;
}

function normalizeRunPlanStep(
  step: Partial<RunPlanStep> | null | undefined,
  index: number,
): RunPlanStep {
  const fallbackStepKey = `step-${index + 1}`;
  const normalizedStepKey =
    typeof step?.stepKey === "string" && step.stepKey.trim().length > 0
      ? step.stepKey.trim()
      : fallbackStepKey;
  const normalizedTitle =
    typeof step?.title === "string" && step.title.trim().length > 0
      ? step.title.trim()
      : normalizedStepKey;
  const normalizedObjective =
    typeof step?.objective === "string" && step.objective.trim().length > 0
      ? step.objective.trim()
      : normalizedTitle;

  return {
    stepKey: normalizedStepKey,
    title: normalizedTitle,
    objective: normalizedObjective,
    deliverable:
      typeof step?.deliverable === "string" && step.deliverable.trim().length > 0
        ? step.deliverable.trim()
        : normalizedTitle,
    ownerPersona:
      typeof step?.ownerPersona === "string" ? step.ownerPersona : "",
    ownerMemberId:
      typeof step?.ownerMemberId === "string" ? step.ownerMemberId : null,
    reviewerPersona:
      typeof step?.reviewerPersona === "string" ? step.reviewerPersona : "",
    reviewerMemberId:
      typeof step?.reviewerMemberId === "string" ? step.reviewerMemberId : null,
    verificationMethod:
      typeof step?.verificationMethod === "string"
        ? step.verificationMethod
        : "",
    retryRule: typeof step?.retryRule === "string" ? step.retryRule : "",
    evidenceRequirements: Array.isArray(step?.evidenceRequirements)
      ? step.evidenceRequirements.filter(
          (item): item is string => typeof item === "string",
        )
      : [],
    qualityCriteria: Array.isArray(step?.qualityCriteria)
      ? step.qualityCriteria.filter(
          (item): item is string => typeof item === "string",
        )
      : [],
    reviewChecklist: Array.isArray(step?.reviewChecklist)
      ? step.reviewChecklist.filter(
          (item): item is string => typeof item === "string",
        )
      : [],
    status: step?.status ?? "planned",
    evidenceRefs: Array.isArray(step?.evidenceRefs)
      ? step.evidenceRefs.filter(
          (item): item is string => typeof item === "string",
        )
      : [],
    notes: typeof step?.notes === "string" ? step.notes : null,
    surface:
      typeof step?.surface === "string"
        ? (step.surface as WorkOrchestratorSurface)
        : null,
    selectedCapabilityId:
      typeof step?.selectedCapabilityId === "string"
        ? step.selectedCapabilityId
        : null,
    runtimeDispatchPolicy:
      step?.runtimeDispatchPolicy &&
      typeof step.runtimeDispatchPolicy === "object"
        ? (step.runtimeDispatchPolicy as RuntimeDispatchPolicy)
        : null,
    validationState:
      step?.validationState && typeof step.validationState === "object"
        ? {
            status:
              step.validationState.status === "passed" ||
              step.validationState.status === "failed"
                ? step.validationState.status
                : "pending",
            attempt:
              typeof step.validationState.attempt === "number"
                ? step.validationState.attempt
                : 0,
            maxAttempts:
              typeof step.validationState.maxAttempts === "number"
                ? step.validationState.maxAttempts
                : 0,
            issues: Array.isArray(step.validationState.issues)
              ? step.validationState.issues.filter(
                  (item): item is string => typeof item === "string",
                )
              : [],
            summary:
              typeof step.validationState.summary === "string"
                ? step.validationState.summary
                : null,
            semanticScore:
              typeof step.validationState.semanticScore === "number"
                ? step.validationState.semanticScore
                : null,
            checkedAt:
              typeof step.validationState.checkedAt === "string"
                ? step.validationState.checkedAt
                : null,
          }
        : null,
  };
}

function normalizeRunPlanArtifact(
  artifact: Partial<RunPlanArtifact> | null | undefined
): RunPlanArtifact | null {
  if (!artifact) return null;

  return {
    version: artifact.version ?? 1,
    runId: artifact.runId ?? "",
    roomId: artifact.roomId ?? "",
    teamId: artifact.teamId ?? "",
    caseId: artifact.caseId ?? null,
    requestId: artifact.requestId ?? null,
    objective: artifact.objective ?? "Run objective",
    source: artifact.source ?? "team_run",
    status: artifact.status ?? "planning",
    generatedAt: artifact.generatedAt ?? new Date().toISOString(),
    lastUpdatedAt: artifact.lastUpdatedAt ?? new Date().toISOString(),
    steps: Array.isArray(artifact.steps)
      ? artifact.steps.map((step, index) =>
          normalizeRunPlanStep(step as Partial<RunPlanStep>, index),
        )
      : [],
    evidenceRefs: Array.isArray(artifact.evidenceRefs)
      ? artifact.evidenceRefs.filter(
          (item): item is string => typeof item === "string"
        )
      : [],
    planEvidenceRefs: Array.isArray(artifact.planEvidenceRefs)
      ? artifact.planEvidenceRefs.filter(
          (item): item is string => typeof item === "string"
        )
      : [],
    reviewerMatrix: Array.isArray(artifact.reviewerMatrix)
      ? artifact.reviewerMatrix.filter(
          (item): item is RunPlanArtifact["reviewerMatrix"][number] =>
            Boolean(item && typeof item === "object")
        )
      : [],
    exploration:
      artifact.exploration && typeof artifact.exploration === "object"
        ? {
            selectedCandidateId:
              typeof artifact.exploration.selectedCandidateId === "string"
                ? artifact.exploration.selectedCandidateId
                : "candidate-balanced",
            selectionReason:
              typeof artifact.exploration.selectionReason === "string"
                ? artifact.exploration.selectionReason
                : "Selected from the candidate comparison set.",
            criteria: Array.isArray(artifact.exploration.criteria)
              ? artifact.exploration.criteria.filter(
                  (item): item is string => typeof item === "string"
                )
              : [],
            candidates: Array.isArray(artifact.exploration.candidates)
              ? artifact.exploration.candidates.filter(
                  (item): item is RunPlanComparisonCandidate =>
                    Boolean(item && typeof item === "object")
                )
              : [],
          }
        : null,
    review: {
      status: artifact.review?.status ?? "pending",
      iteration: artifact.review?.iteration ?? 0,
      reviewedAt: artifact.review?.reviewedAt ?? null,
      reviewerPersona: artifact.review?.reviewerPersona ?? "orchestrator",
      issues: Array.isArray(artifact.review?.issues)
        ? artifact.review.issues.filter(
            (item): item is string => typeof item === "string"
          )
        : [],
      score:
        typeof artifact.review?.score === "number"
          ? artifact.review.score
          : null,
      recommendation:
        typeof artifact.review?.recommendation === "string"
          ? artifact.review.recommendation
          : null,
    },
  };
}

function deriveRunRuntimePhase(
  status: "queued" | "running" | "paused" | "completed" | "failed" | "stopped",
  stopReason?: string | null
): RunRuntimePhase {
  switch (status) {
    case "queued":
      return "planned";
    case "running":
      return "running";
    case "paused":
      if (stopReason === "awaiting_human_choice")
        return "awaiting_human_choice";
      if (stopReason === "awaiting_final_review")
        return "awaiting_final_review";
      if (stopReason === "awaiting_final_approval")
        return "awaiting_final_approval";
      if (stopReason === "awaiting_human_approval")
        return "awaiting_human_approval";
      if (stopReason === "awaiting_external_member")
        return "waiting_for_worker";
      if (stopReason === "user_paused") return "blocked";
      return "blocked";
    case "completed":
      return "completed";
    case "failed":
      return "failed";
    case "stopped":
      return stopReason === "user_requested" ? "cancelled" : "blocked";
    default:
      return "blocked";
  }
}

export function buildRunRuntimeState(
  run: Pick<
    TeamRun,
    "status" | "stopReason" | "summaryArtifactId" | "roomId" | "teamId"
  >
): RunRuntimeState {
  const statusBridge = describeRunStatusBridge(run.status, run.stopReason);
  return {
    currentPhase: deriveRunRuntimePhase(run.status, run.stopReason),
    waitingReason: run.stopReason ?? null,
    policyGateReason: null,
    selectedSkillId: null,
    routeReason: null,
    traceId: getTraceId() ?? null,
    nextPollAt: null,
    choiceDeadlineAt: null,
    finalReviewDeadlineAt: null,
    riskClass: null,
    reviewerPersona: null,
    verificationState:
      run.status === "completed"
        ? "passed"
        : run.status === "failed"
          ? "failed"
          : "unknown",
    finalReview: null,
    evidenceRefs: run.summaryArtifactId
      ? [`summary:${run.summaryArtifactId}`]
      : [],
    jobHandle: null,
    statusBridge,
    planArtifact: null,
    governedContext: null,
    traceEnvelope: null,
    readinessRecord: null,
    workOsLinkage: {
      teamId: run.teamId,
      roomId: run.roomId,
      projectedWorkOsState: statusBridge.workOsState,
    },
  };
}

export function extractRunRuntimeState(
  snapshot: Pick<RunSnapshot, "artifactCountJson"> | null | undefined
): RunRuntimeState | null {
  const payload = snapshot?.artifactCountJson as
    | Record<string, unknown>
    | null
    | undefined;
  if (!payload) return null;
  const extractedEnterpriseArtifacts = extractEnterpriseArtifacts({ payload });

  const runtimeState = payload.runtimeState as
    | Partial<RunRuntimeState>
    | undefined;
  const statusBridge = payload.statusBridge as StatusBridge | undefined;

  if (runtimeState) {
    return {
      currentPhase:
        (runtimeState.currentPhase as RunRuntimePhase | undefined) ?? "blocked",
      waitingReason:
        (runtimeState.waitingReason as string | null | undefined) ?? null,
      policyGateReason:
        (runtimeState.policyGateReason as string | null | undefined) ?? null,
      selectedSkillId:
        (runtimeState.selectedSkillId as string | null | undefined) ?? null,
      routeReason:
        (runtimeState.routeReason as string | null | undefined) ?? null,
      nextPollAt:
        (runtimeState.nextPollAt as string | null | undefined) ?? null,
      choiceDeadlineAt:
        (runtimeState.choiceDeadlineAt as string | null | undefined) ?? null,
      finalReviewDeadlineAt:
        (runtimeState.finalReviewDeadlineAt as string | null | undefined) ??
        null,
      riskClass:
        (runtimeState.riskClass as RunRuntimeState["riskClass"] | undefined) ??
        null,
      reviewerPersona:
        (runtimeState.reviewerPersona as string | null | undefined) ?? null,
      verificationState:
        (runtimeState.verificationState as
          | RunRuntimeState["verificationState"]
          | undefined) ?? "unknown",
      finalReview:
        (runtimeState.finalReview as
          | RunRuntimeState["finalReview"]
          | undefined) ?? null,
      evidenceRefs: Array.isArray(runtimeState.evidenceRefs)
        ? runtimeState.evidenceRefs.filter(
            (item): item is string => typeof item === "string"
          )
        : [],
      jobHandle:
        (runtimeState.jobHandle as
          | Record<string, unknown>
          | null
          | undefined) ?? null,
      statusBridge:
        (runtimeState.statusBridge as StatusBridge | undefined) ??
        statusBridge ??
        describeRunStatusBridge("queued"),
      traceId: (runtimeState.traceId as string | null | undefined) ?? null,
      planArtifact:
        normalizeRunPlanArtifact(
          runtimeState.planArtifact as
            | Partial<RunPlanArtifact>
            | null
            | undefined
        ) ??
        normalizeRunPlanArtifact(
          payload.planArtifact as Partial<RunPlanArtifact> | undefined
        ) ??
        null,
      governedContext:
        (runtimeState.governedContext as GovernedContextSnapshot | undefined) ??
        extractedEnterpriseArtifacts.governedContext,
      traceEnvelope:
        (runtimeState.traceEnvelope as TraceEnvelope | undefined) ??
        extractedEnterpriseArtifacts.traceEnvelope,
      readinessRecord:
        (runtimeState.readinessRecord as ReadinessMetricRecord | undefined) ??
        extractedEnterpriseArtifacts.readinessRecord,
      workOsLinkage:
        (runtimeState.workOsLinkage as
          | RunRuntimeState["workOsLinkage"]
          | undefined) ?? null,
    };
  }

  if (statusBridge) {
    const phase: RunRuntimePhase = (() => {
      switch (statusBridge.workOsState) {
        case "planned":
        case "triaged":
          return "planned";
        case "in_progress":
          return "running";
        case "waiting_for_approval":
          return "awaiting_human_approval";
        case "waiting_for_input":
          return "blocked";
        case "completed":
          return "completed";
        case "failed":
          return "failed";
        case "cancelled":
          return "cancelled";
        case "blocked":
        case "escalated":
        default:
          return "blocked";
      }
    })();

    return {
      currentPhase: phase,
      waitingReason: null,
      policyGateReason: null,
      selectedSkillId: null,
      routeReason: null,
      nextPollAt: null,
      choiceDeadlineAt: null,
      finalReviewDeadlineAt: null,
      riskClass: null,
      reviewerPersona: null,
      verificationState: "unknown",
      finalReview: null,
      evidenceRefs: [],
      jobHandle: null,
      statusBridge,
      traceId: null,
      planArtifact:
        normalizeRunPlanArtifact(
          payload.planArtifact as Partial<RunPlanArtifact> | undefined
        ) ?? null,
      governedContext: extractedEnterpriseArtifacts.governedContext,
      traceEnvelope: extractedEnterpriseArtifacts.traceEnvelope,
      readinessRecord: extractedEnterpriseArtifacts.readinessRecord,
      workOsLinkage: null,
    };
  }

  return null;
}

export async function getLatestRunSnapshot(
  runId: string
): Promise<RunSnapshot | null> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const [snapshot] = await db
    .select()
    .from(runSnapshots)
    .where(eq(runSnapshots.runId, runId))
    .orderBy(desc(runSnapshots.capturedAt))
    .limit(1);

  return snapshot ?? null;
}

export async function getLatestPolicyGateReason(
  runId: string,
  tenantId?: string
): Promise<string | null> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const rows = tenantId
    ? await db
        .select({
          detailJson: agentActivityEvents.detailJson,
        })
        .from(agentActivityEvents)
        .where(
          and(
            eq(agentActivityEvents.runId, runId),
            eq(agentActivityEvents.tenantId, tenantId)
          )
        )
        .orderBy(desc(agentActivityEvents.createdAt))
        .limit(20)
    : await db
        .select({
          detailJson: agentActivityEvents.detailJson,
        })
        .from(agentActivityEvents)
        .where(eq(agentActivityEvents.runId, runId))
        .orderBy(desc(agentActivityEvents.createdAt))
        .limit(20);

  for (const row of rows) {
    const detail = row.detailJson as Record<string, unknown> | null | undefined;
    const gate = detail?.verificationGate as
      | Record<string, unknown>
      | undefined;
    const reason = gate?.reason;
    if (typeof reason === "string" && reason.trim()) {
      return reason.trim();
    }
  }

  return null;
}

export function extractRunPlanArtifact(
  snapshot: Pick<RunSnapshot, "artifactCountJson"> | null | undefined
): RunPlanArtifact | null {
  const payload = snapshot?.artifactCountJson as
    | Record<string, unknown>
    | null
    | undefined;
  if (!payload) return null;
  return normalizeRunPlanArtifact(
    payload.planArtifact as Partial<RunPlanArtifact> | undefined
  );
}

function buildRunSnapshotArtifactPayload(
  run: Pick<
    TeamRun,
    | "id"
    | "status"
    | "stopReason"
    | "summaryArtifactId"
    | "roomId"
    | "teamId"
    | "objective"
  >,
  tenantId: string,
  extraArtifacts?: Record<string, unknown> | null,
  extraRuntimeState?: Partial<RunRuntimeState> | null
) {
  const runtimeState = buildRunRuntimeState(run);
  if (extraRuntimeState && typeof extraRuntimeState === "object") {
    Object.assign(runtimeState, extraRuntimeState);
  }
  if (
    extraArtifacts?.planArtifact &&
    typeof extraArtifacts.planArtifact === "object"
  ) {
    runtimeState.planArtifact = extraArtifacts.planArtifact as RunPlanArtifact;
  }
  const traceId =
    runtimeState.traceId ?? getTraceId() ?? `snapshot-${run.id ?? run.roomId}`;
  const finalReview =
    (extraArtifacts?.finalReview as Record<string, unknown> | undefined) ??
    (runtimeState.finalReview as Record<string, unknown> | undefined);
  const planScore =
    typeof runtimeState.planArtifact?.review.score === "number"
      ? runtimeState.planArtifact.review.score
      : null;
  const finalScore =
    typeof finalReview?.score === "number" ? finalReview.score : null;
  const readinessScore =
    finalScore ??
    planScore ??
    (runtimeState.verificationState === "passed"
      ? 0.9
      : runtimeState.verificationState === "failed"
        ? 0.2
        : 0.55);
  const readinessReason =
    typeof finalReview?.comment === "string" && finalReview.comment.trim()
      ? finalReview.comment.trim()
      : (runtimeState.planArtifact?.review.recommendation ??
        runtimeState.policyGateReason ??
        `Runtime readiness for ${run.objective}`);
  const governedContextItems: GovernedContextInputItem[] = [
    {
      id: `run:${run.id}`,
      label: run.objective || "Run objective",
      sourceType: "team_run",
      scope: "room",
      trustTier: "trusted",
      freshnessTier: "fresh",
      reason: "Primary run objective",
      score: 1,
      evidenceRefs: runtimeState.evidenceRefs,
    },
    {
      id: `status:${run.id}`,
      label: runtimeState.currentPhase,
      sourceType: "runtime_state",
      scope: "room",
      trustTier: "trusted",
      freshnessTier: "fresh",
      reason: "Current runtime phase",
      score: 0.92,
      evidenceRefs: runtimeState.evidenceRefs,
    },
    ...(runtimeState.planArtifact
      ? [
          {
            id: `plan:${run.id}`,
            label: runtimeState.planArtifact.objective,
            sourceType: "plan_artifact",
            scope: "room",
            trustTier: "derived",
            freshnessTier: "fresh",
            reason: "Durable plan artifact selected for execution",
            score: runtimeState.planArtifact.review.score ?? 0.85,
            evidenceRefs: runtimeState.planArtifact.planEvidenceRefs,
          } satisfies GovernedContextInputItem,
        ]
      : []),
    ...(runtimeState.policyGateReason
      ? [
          {
            id: `policy:${run.id}`,
            label: runtimeState.policyGateReason,
            sourceType: "policy_gate",
            scope: "case",
            trustTier: "trusted",
            freshnessTier: "fresh",
            reason: "Latest policy gate reason",
            score: 0.8,
            evidenceRefs: runtimeState.evidenceRefs,
          } satisfies GovernedContextInputItem,
        ]
      : []),
    ...(finalReview
      ? [
          {
            id: `final:${run.id}`,
            label:
              typeof finalReview.comment === "string" &&
              finalReview.comment.trim()
                ? finalReview.comment.trim()
                : "Final review",
            sourceType: "final_review",
            scope: "room",
            trustTier: "derived",
            freshnessTier: "fresh",
            reason: "Final reviewer commentary",
            score:
              typeof finalReview.score === "number" ? finalReview.score : 0.7,
            evidenceRefs: runtimeState.evidenceRefs,
          } satisfies GovernedContextInputItem,
        ]
      : []),
  ];
  const context = buildGovernedContextSnapshot({
    tenantId,
    principalScope: run.teamId,
    objective: run.objective || "Run objective",
    items: governedContextItems,
  });
  const traceEnvelope = buildTraceEnvelope({
    traceId,
    tenantId,
    source: "team_run_snapshot",
    entityId: run.id,
    eventType: "run_snapshot",
    summary: `${run.objective || "Run objective"} · ${runtimeState.currentPhase}`,
    evidenceRefs: runtimeState.evidenceRefs,
  });
  const readinessRecord = buildReadinessMetricRecord({
    kind: "team_run",
    entityId: run.id,
    score: readinessScore,
    reason: readinessReason,
    evidenceRefs: runtimeState.evidenceRefs,
  });
  return {
    statusBridge: describeRunStatusBridge(run.status, run.stopReason),
    runtimeState,
    traceEnvelope,
    governedContext: context,
    readinessRecord,
    ...(extraArtifacts ?? {}),
  } satisfies Record<string, unknown>;
}

// ─── Constants ──────────────────────────────────────────────────────────────

export const STUCK_THRESHOLD_MS = 120_000; // 2 minutes without activity
export const SNAPSHOT_INTERVAL_MS = 15_000; // every 15 seconds

// ─── Event Recording ────────────────────────────────────────────────────────

export async function recordEvent(
  input: RecordEventInput
): Promise<AgentActivityEvent> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const [event] = await db
    .insert(agentActivityEvents)
    .values({
      id: crypto.randomUUID(),
      tenantId: input.tenantId,
      teamId: input.teamId,
      roomId: input.roomId,
      runId: input.runId,
      assistantId: input.assistantId ?? null,
      eventType: input.eventType,
      eventCategory: input.eventCategory,
      visibility: (input.visibility as any) ?? "transparent",
      summary: input.summary ?? null,
      detailJson: input.detailJson ?? null,
      tokenUsageSnapshot: input.tokenUsageSnapshot ?? null,
      costSnapshot: input.costSnapshot ? String(input.costSnapshot) : null,
      durationMs: input.durationMs ?? null,
    })
    .returning();

  return event;
}

// ─── Snapshot Capture ───────────────────────────────────────────────────────

export async function captureSnapshot(
  runId: string,
  tenantId: string,
  options?: {
    artifactCountJson?: Record<string, unknown> | null;
    runtimeState?: Partial<RunRuntimeState> | null;
  }
): Promise<RunSnapshot> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const [run] = await db
    .select({ run: teamRuns })
    .from(teamRuns)
    .innerJoin(teamRooms, eq(teamRooms.id, teamRuns.roomId))
    .where(and(eq(teamRuns.id, runId), eq(teamRooms.tenantId, tenantId)))
    .limit(1)
    .then(rows => rows.map(r => r.run));

  if (!run) throw new Error(`Run ${runId} not found`);
  const latestSnapshot = await getLatestRunSnapshot(runId);
  const previousArtifactCountJson =
    (latestSnapshot?.artifactCountJson as
      | Record<string, unknown>
      | null
      | undefined) ?? null;
  const mergedArtifactCountJson = {
    ...(previousArtifactCountJson ?? {}),
    ...(options?.artifactCountJson ?? {}),
  } satisfies Record<string, unknown>;
  const policyGateReason = await getLatestPolicyGateReason(
    runId,
    tenantId
  ).catch(() => null);
  const traceId = getTraceId() ?? null;

  const budget = (run.budgetSnapshotJson as BudgetSnapshot) ?? {
    totalCreditsUsed: 0,
    perAgent: {},
  };
  const perAgent = budget.perAgent ?? {};

  // Build agent statuses
  const agentStatuses: Record<string, string> = {};
  for (const [agentId] of Object.entries(perAgent)) {
    agentStatuses[agentId] =
      agentId === run.activeAssistantId ? "active" : "idle";
  }

  const [snapshot] = await db
    .insert(runSnapshots)
    .values({
      runId,
      activeAssistantId: run.activeAssistantId,
      agentStatusesJson: agentStatuses,
      tokenUsageJson: Object.fromEntries(
        Object.entries(perAgent).map(([id, d]) => [
          id,
          { inputTokens: d.inputTokens, outputTokens: d.outputTokens },
        ])
      ),
      costJson: Object.fromEntries(
        Object.entries(perAgent).map(([id, d]) => [id, d.creditsUsed])
      ),
      artifactCountJson: buildRunSnapshotArtifactPayload(
        run,
        tenantId,
        mergedArtifactCountJson,
        {
          ...(policyGateReason ? { policyGateReason } : {}),
          ...(options?.runtimeState ?? {}),
        }
      ),
    })
    .returning();

  return snapshot;
}

// ─── Stuck Detection ────────────────────────────────────────────────────────

export async function checkStuckAgent(
  runId: string,
  tenantId: string
): Promise<StuckAgentCheck> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const [run] = await db
    .select({ run: teamRuns })
    .from(teamRuns)
    .innerJoin(teamRooms, eq(teamRooms.id, teamRuns.roomId))
    .where(and(eq(teamRuns.id, runId), eq(teamRooms.tenantId, tenantId)))
    .limit(1)
    .then(rows => rows.map(r => r.run));

  if (!run || run.status !== "running") {
    return {
      isStuck: false,
      agentId: null,
      reason: null,
      lastActivityAge: null,
    };
  }

  // Get last activity event
  const [lastEvent] = await db
    .select()
    .from(agentActivityEvents)
    .where(eq(agentActivityEvents.runId, runId))
    .orderBy(desc(agentActivityEvents.createdAt))
    .limit(1);

  const lastActivityTime = lastEvent?.createdAt ?? run.startedAt;
  const ageMs = lastActivityTime
    ? Date.now() - new Date(lastActivityTime).getTime()
    : 0;

  if (ageMs > STUCK_THRESHOLD_MS) {
    return {
      isStuck: true,
      agentId: run.activeAssistantId,
      reason: `No activity for ${Math.round(ageMs / 1000)}s`,
      lastActivityAge: ageMs,
    };
  }

  return {
    isStuck: false,
    agentId: null,
    reason: null,
    lastActivityAge: ageMs,
  };
}

// ─── Event Queries ──────────────────────────────────────────────────────────

export async function getRunEvents(
  runId: string,
  tenantId: string,
  limit: number = 100
): Promise<AgentActivityEvent[]> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  return db
    .select()
    .from(agentActivityEvents)
    .where(
      and(
        eq(agentActivityEvents.runId, runId),
        eq(agentActivityEvents.tenantId, tenantId)
      )
    )
    .orderBy(desc(agentActivityEvents.createdAt))
    .limit(limit);
}

// ─── System Monitoring (Celery Push) ─────────────────────────────────────────

export interface PushMetricsInput {
  checkType: string;
  status: "ok" | "warning" | "critical" | "error";
  source: string;
  details: Record<string, unknown>;
  alert?: {
    severity: string;
    title: string;
    message: string;
    channel: string;
  } | null;
}

/**
 * Persist a health check push from Python Celery.
 * Inserts a monitoring_check row, optionally a monitoring_alert, and a
 * system_metrics_history row when memory/cpu/disk fields are present.
 */
export async function pushMetrics(
  input: PushMetricsInput
): Promise<{ checkId: number }> {
  const db = await getDb();

  // 1. Insert the check row
  const [check] = await db
    .insert(monitoringChecks)
    .values({
      checkType: input.checkType,
      status: input.status,
      source: input.source,
      details: input.details,
    } satisfies InsertMonitoringCheck)
    .returning({ id: monitoringChecks.id });

  const checkId = check.id;

  // 2. Insert alert if present
  if (input.alert) {
    await db.insert(monitoringAlerts).values({
      severity: input.alert.severity,
      title: input.alert.title,
      message: input.alert.message,
      channel: input.alert.channel,
      metadata: { checkId },
    });
  }

  // 3. Insert metrics history if memory/cpu/disk fields are present
  const d = input.details;
  const hasMetrics =
    typeof d.memoryPercent === "number" || typeof d.cpuPercent === "number";

  if (hasMetrics) {
    await db.insert(systemMetricsHistory).values({
      memoryUsedMb: typeof d.memoryUsedMb === "number" ? d.memoryUsedMb : 0,
      memoryTotalMb: typeof d.memoryTotalMb === "number" ? d.memoryTotalMb : 0,
      memoryPercent: typeof d.memoryPercent === "number" ? d.memoryPercent : 0,
      cpuPercent: typeof d.cpuPercent === "number" ? d.cpuPercent : null,
      diskUsedGb: typeof d.diskUsedGb === "number" ? d.diskUsedGb : null,
      diskTotalGb: typeof d.diskTotalGb === "number" ? d.diskTotalGb : null,
      serviceStatuses:
        d.services != null ? (d.services as Record<string, string>) : null,
      processRestartCounts:
        d.processRestartCounts != null
          ? (d.processRestartCounts as Record<string, number>)
          : null,
    });
  }

  return { checkId };
}

export interface RecordContextEngineMetricInput {
  source: string;
  surface: ContextPack["surface"];
  contextPack?: ContextPack | null;
  contextState?: ContextStateHints | null;
  traceId?: string | null;
  tenantId?: string | null;
  teamId?: string | null;
  userId?: number | null;
  conversationId?: number | null;
  roomId?: string | null;
  runId?: string | null;
  projectId?: string | null;
  skillId?: string | null;
  latencyMs?: number | null;
  notes?: string | null;
}

function buildContextEngineMetricDetails(
  input: RecordContextEngineMetricInput,
  evaluation: ContextEngineEvaluation,
): Record<string, unknown> {
  return {
    source: input.source,
    surface: input.surface,
    traceId: input.traceId ?? null,
    tenantId: input.tenantId ?? null,
    teamId: input.teamId ?? null,
    userId: input.userId ?? null,
    conversationId: input.conversationId ?? null,
    roomId: input.roomId ?? null,
    runId: input.runId ?? null,
    projectId: input.projectId ?? null,
    skillId: input.skillId ?? null,
    latencyMs: input.latencyMs ?? null,
    notes: input.notes ?? null,
    intent: input.contextPack?.intent ?? "conversation",
    budgetProfile: input.contextPack?.budgetProfile ?? "balanced",
    retrievalModes: input.contextPack?.retrievalModes ?? [],
    estimatedTokens: input.contextPack?.estimatedTokens ?? evaluation.totalSlots,
    tokenHeadroom: evaluation.tokenHeadroom,
    dedupedMessages: evaluation.dedupedMessages,
    injectedMessages: evaluation.injectedMessages,
    totalSlots: evaluation.totalSlots,
    sessionStateSlots: evaluation.sessionStateSlots,
    activeNoteSlots: evaluation.activeNoteSlots,
    recentNoteSlots: evaluation.recentNoteSlots,
    projectStateSlots: evaluation.projectStateSlots,
    workingSummarySlots: evaluation.workingSummarySlots,
    durableMemorySlots: evaluation.durableMemorySlots,
    retrievedEvidenceSlots: evaluation.retrievedEvidenceSlots,
    toolResultSlots: evaluation.toolResultSlots,
    resourceSlots: evaluation.resourceSlots,
    promptAssetSlots: evaluation.promptAssetSlots,
    freshSlots: evaluation.freshSlots,
    recentSlots: evaluation.recentSlots,
    staleSlots: evaluation.staleSlots,
    retrievalCoverage: evaluation.retrievalCoverage,
    groundingScore: evaluation.groundingScore,
    staleContextRatio: evaluation.staleContextRatio,
    freshnessScore: evaluation.freshnessScore,
    tokenPressureRatio: evaluation.tokenPressureRatio,
    healthScore: evaluation.healthScore,
  };
}

export async function recordContextEngineMetric(
  input: RecordContextEngineMetricInput,
): Promise<{ checkId: number }> {
  const evaluation = input.contextPack
    ? evaluateContextPack(input.contextPack)
    : evaluateContextStateHints(input.contextState ?? null);
  const status = input.contextPack
    ? classifyContextEngineStatus({
        groundingScore: evaluation.groundingScore,
        staleContextRatio: evaluation.staleContextRatio,
        tokenHeadroom: evaluation.tokenHeadroom,
        retrievalCoverage: evaluation.retrievalCoverage,
      })
    : evaluation.tokenHeadroom <= 0 ||
        evaluation.staleContextRatio >= 0.5 ||
        evaluation.groundingScore < 0.25
      ? "critical"
      : evaluation.staleContextRatio >= 0.25 ||
          evaluation.groundingScore < 0.45
        ? "warning"
        : "ok";

  return pushMetrics({
    checkType: "context_engine_eval",
    status,
    source: input.source,
    details: buildContextEngineMetricDetails(input, evaluation),
  });
}

export interface ContextEngineMetricDetails {
  source: string | null;
  surface: string | null;
  traceId: string | null;
  tenantId: string | null;
  teamId: string | null;
  userId: number | null;
  conversationId: number | null;
  roomId: string | null;
  runId: string | null;
  projectId: string | null;
  skillId: string | null;
  latencyMs: number | null;
  notes: string | null;
  intent: string | null;
  budgetProfile: string | null;
  retrievalModes: string[];
  estimatedTokens: number | null;
  tokenHeadroom: number | null;
  dedupedMessages: number | null;
  injectedMessages: number | null;
  totalSlots: number | null;
  sessionStateSlots: number | null;
  activeNoteSlots: number | null;
  recentNoteSlots: number | null;
  projectStateSlots: number | null;
  workingSummarySlots: number | null;
  durableMemorySlots: number | null;
  retrievedEvidenceSlots: number | null;
  toolResultSlots: number | null;
  resourceSlots: number | null;
  promptAssetSlots: number | null;
  freshSlots: number | null;
  recentSlots: number | null;
  staleSlots: number | null;
  retrievalCoverage: number | null;
  groundingScore: number | null;
  staleContextRatio: number | null;
  freshnessScore: number | null;
  tokenPressureRatio: number | null;
  healthScore: number | null;
}

export interface ContextEngineHealthCheckSummary {
  id: number;
  checkType: string;
  status: string;
  source: string;
  createdAt: string;
  details: ContextEngineMetricDetails;
}

export interface ContextEngineScopeBreakdownItem {
  teamId: string | null;
  roomId: string | null;
  runId: string | null;
  skillId: string | null;
  count: number;
  latestCreatedAt: string | null;
  latestStatus: string | null;
  latestSource: string | null;
  latestHealthScore: number | null;
  latestGroundingScore: number | null;
  latestRetrievalCoverage: number | null;
}

export interface ContextEngineHealthSummary {
  scope: {
    tenantId: string;
    teamId: string | null;
    roomId: string | null;
    runId: string | null;
    skillId: string | null;
    userId: number | null;
    since: string | null;
    limit: number;
  };
  window: {
    matchedChecks: number;
    latestCreatedAt: string | null;
  };
  totals: {
    total: number;
    ok: number;
    warning: number;
    critical: number;
    error: number;
  };
  latest: ContextEngineHealthCheckSummary | null;
  recentChecks: ContextEngineHealthCheckSummary[];
  averages: {
    healthScore: number | null;
    groundingScore: number | null;
    retrievalCoverage: number | null;
    freshnessScore: number | null;
    staleContextRatio: number | null;
    tokenPressureRatio: number | null;
    latencyMs: number | null;
  };
  sourceBreakdown: Array<{ source: string; count: number }>;
  scopeBreakdown: ContextEngineScopeBreakdownItem[];
}

export interface ContextEngineHealthQuery {
  tenantId: string;
  teamId?: string | null;
  roomId?: string | null;
  runId?: string | null;
  skillId?: string | null;
  userId?: number | null;
  since?: string | null;
  limit?: number;
}

function readNullableString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0
    ? value
    : null;
}

function readNullableNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function readStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string");
}

function normalizeContextEngineMetricDetails(
  details: Record<string, unknown> | null | undefined,
): ContextEngineMetricDetails {
  const record = details ?? {};
  return {
    source: readNullableString(record.source),
    surface: readNullableString(record.surface),
    traceId: readNullableString(record.traceId),
    tenantId: readNullableString(record.tenantId),
    teamId: readNullableString(record.teamId),
    userId: readNullableNumber(record.userId),
    conversationId: readNullableNumber(record.conversationId),
    roomId: readNullableString(record.roomId),
    runId: readNullableString(record.runId),
    projectId: readNullableString(record.projectId),
    skillId: readNullableString(record.skillId),
    latencyMs: readNullableNumber(record.latencyMs),
    notes: readNullableString(record.notes),
    intent: readNullableString(record.intent),
    budgetProfile: readNullableString(record.budgetProfile),
    retrievalModes: readStringArray(record.retrievalModes),
    estimatedTokens: readNullableNumber(record.estimatedTokens),
    tokenHeadroom: readNullableNumber(record.tokenHeadroom),
    dedupedMessages: readNullableNumber(record.dedupedMessages),
    injectedMessages: readNullableNumber(record.injectedMessages),
    totalSlots: readNullableNumber(record.totalSlots),
    sessionStateSlots: readNullableNumber(record.sessionStateSlots),
    activeNoteSlots: readNullableNumber(record.activeNoteSlots),
    recentNoteSlots: readNullableNumber(record.recentNoteSlots),
    projectStateSlots: readNullableNumber(record.projectStateSlots),
    workingSummarySlots: readNullableNumber(record.workingSummarySlots),
    durableMemorySlots: readNullableNumber(record.durableMemorySlots),
    retrievedEvidenceSlots: readNullableNumber(record.retrievedEvidenceSlots),
    toolResultSlots: readNullableNumber(record.toolResultSlots),
    resourceSlots: readNullableNumber(record.resourceSlots),
    promptAssetSlots: readNullableNumber(record.promptAssetSlots),
    freshSlots: readNullableNumber(record.freshSlots),
    recentSlots: readNullableNumber(record.recentSlots),
    staleSlots: readNullableNumber(record.staleSlots),
    retrievalCoverage: readNullableNumber(record.retrievalCoverage),
    groundingScore: readNullableNumber(record.groundingScore),
    staleContextRatio: readNullableNumber(record.staleContextRatio),
    freshnessScore: readNullableNumber(record.freshnessScore),
    tokenPressureRatio: readNullableNumber(record.tokenPressureRatio),
    healthScore: readNullableNumber(record.healthScore),
  };
}

function normalizeContextEngineCheck(
  check: MonitoringCheck,
): ContextEngineHealthCheckSummary {
  return {
    id: check.id,
    checkType: check.checkType,
    status: check.status,
    source: check.source,
    createdAt: check.createdAt.toISOString(),
    details: normalizeContextEngineMetricDetails(check.details),
  };
}

function average(values: number[]): number | null {
  if (values.length === 0) return null;
  const total = values.reduce((sum, value) => sum + value, 0);
  return total / values.length;
}

function buildContextEngineHealthSummary(
  checks: ContextEngineHealthCheckSummary[],
  scope: ContextEngineHealthQuery & { since: string | null; limit: number },
): ContextEngineHealthSummary {
  const sourceBreakdown = new Map<string, number>();
  const scopeBreakdown = new Map<
    string,
    ContextEngineScopeBreakdownItem & { latestCreatedAtMs: number }
  >();
  const averages = {
    healthScore: [] as number[],
    groundingScore: [] as number[],
    retrievalCoverage: [] as number[],
    freshnessScore: [] as number[],
    staleContextRatio: [] as number[],
    tokenPressureRatio: [] as number[],
    latencyMs: [] as number[],
  };
  const totals = {
    total: 0,
    ok: 0,
    warning: 0,
    critical: 0,
    error: 0,
  };

  for (const check of checks) {
    totals.total += 1;
    if (check.status === "ok") totals.ok += 1;
    else if (check.status === "warning") totals.warning += 1;
    else if (check.status === "critical") totals.critical += 1;
    else if (check.status === "error") totals.error += 1;

    sourceBreakdown.set(
      check.source,
      (sourceBreakdown.get(check.source) ?? 0) + 1,
    );

    const details = check.details;
    const scopeKey = [
      details.teamId ?? "",
      details.roomId ?? "",
      details.runId ?? "",
      details.skillId ?? "",
    ].join("|");
    const createdAtMs = new Date(check.createdAt).getTime();
    const scopeItem = scopeBreakdown.get(scopeKey);
    if (!scopeItem) {
      scopeBreakdown.set(scopeKey, {
        teamId: details.teamId ?? null,
        roomId: details.roomId ?? null,
        runId: details.runId ?? null,
        skillId: details.skillId ?? null,
        count: 1,
        latestCreatedAt: check.createdAt,
        latestCreatedAtMs: createdAtMs,
        latestStatus: check.status,
        latestSource: check.source,
        latestHealthScore: details.healthScore,
        latestGroundingScore: details.groundingScore,
        latestRetrievalCoverage: details.retrievalCoverage,
      });
    } else {
      scopeItem.count += 1;
      if (createdAtMs >= scopeItem.latestCreatedAtMs) {
        scopeItem.latestCreatedAt = check.createdAt;
        scopeItem.latestCreatedAtMs = createdAtMs;
        scopeItem.latestStatus = check.status;
        scopeItem.latestSource = check.source;
        scopeItem.latestHealthScore = details.healthScore;
        scopeItem.latestGroundingScore = details.groundingScore;
        scopeItem.latestRetrievalCoverage = details.retrievalCoverage;
      }
    }

    if (details.healthScore !== null) averages.healthScore.push(details.healthScore);
    if (details.groundingScore !== null) averages.groundingScore.push(details.groundingScore);
    if (details.retrievalCoverage !== null) averages.retrievalCoverage.push(details.retrievalCoverage);
    if (details.freshnessScore !== null) averages.freshnessScore.push(details.freshnessScore);
    if (details.staleContextRatio !== null) averages.staleContextRatio.push(details.staleContextRatio);
    if (details.tokenPressureRatio !== null) averages.tokenPressureRatio.push(details.tokenPressureRatio);
    if (details.latencyMs !== null) averages.latencyMs.push(details.latencyMs);
  }

  return {
    scope: {
      tenantId: scope.tenantId,
      teamId: scope.teamId ?? null,
      roomId: scope.roomId ?? null,
      runId: scope.runId ?? null,
      skillId: scope.skillId ?? null,
      userId: scope.userId ?? null,
      since: scope.since ?? null,
      limit: scope.limit,
    },
    window: {
      matchedChecks: checks.length,
      latestCreatedAt: checks[0]?.createdAt ?? null,
    },
    totals,
    latest: checks[0] ?? null,
    recentChecks: checks.slice(0, scope.limit),
    averages: {
      healthScore: average(averages.healthScore),
      groundingScore: average(averages.groundingScore),
      retrievalCoverage: average(averages.retrievalCoverage),
      freshnessScore: average(averages.freshnessScore),
      staleContextRatio: average(averages.staleContextRatio),
      tokenPressureRatio: average(averages.tokenPressureRatio),
      latencyMs: average(averages.latencyMs),
    },
    sourceBreakdown: Array.from(sourceBreakdown.entries())
      .map(([source, count]) => ({ source, count }))
      .sort((left, right) => right.count - left.count || left.source.localeCompare(right.source)),
    scopeBreakdown: Array.from(scopeBreakdown.values())
      .map(({ latestCreatedAtMs: _latestCreatedAtMs, ...item }) => item)
      .sort(
        (left, right) =>
          right.count - left.count ||
          (right.latestCreatedAt ?? "").localeCompare(left.latestCreatedAt ?? "") ||
          (left.roomId ?? "").localeCompare(right.roomId ?? "") ||
          (left.runId ?? "").localeCompare(right.runId ?? "")
      ),
  };
}

export async function getContextEngineHealth(
  opts: ContextEngineHealthQuery,
): Promise<ContextEngineHealthSummary> {
  const db = await getDb();
  const since = opts.since ? new Date(opts.since) : new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const limit = Math.max(1, Math.min(opts.limit ?? 12, 50));

  const conditions = [
    eq(monitoringChecks.checkType, "context_engine_eval"),
    gte(monitoringChecks.createdAt, since),
    sql`${monitoringChecks.details}->>'tenantId' = ${opts.tenantId}`,
  ];
  if (opts.teamId) {
    conditions.push(sql`${monitoringChecks.details}->>'teamId' = ${opts.teamId}`);
  }
  if (opts.roomId) {
    conditions.push(sql`${monitoringChecks.details}->>'roomId' = ${opts.roomId}`);
  }
  if (opts.runId) {
    conditions.push(sql`${monitoringChecks.details}->>'runId' = ${opts.runId}`);
  }
  if (opts.skillId) {
    conditions.push(sql`${monitoringChecks.details}->>'skillId' = ${opts.skillId}`);
  }
  if (opts.userId !== undefined && opts.userId !== null) {
    conditions.push(sql`${monitoringChecks.details}->>'userId' = ${String(opts.userId)}`);
  }

  const where = and(...conditions);
  const rows = await db
    .select()
    .from(monitoringChecks)
    .where(where)
    .orderBy(desc(monitoringChecks.createdAt))
    .limit(limit);

  const checks = rows.map(normalizeContextEngineCheck);
  return buildContextEngineHealthSummary(checks, {
    ...opts,
    since: since.toISOString(),
    limit,
  });
}

export async function getWorkpackMonitoringSummary(tenantId: string): Promise<{
  totals: {
    workpackCount: number;
    eventCount: number;
    snapshotCount: number;
  };
  recentEvents: Array<{
    id: string;
    workpackId: string;
    eventName: string;
    detail: string;
    createdAt: string;
  }>;
  readiness: Array<{
    workpackId: string;
    versionId: string;
    gateResult: string;
    reasonCode: string;
    rolloutPhase: string;
    nextAction: string;
  }>;
}> {
  const { getWorkpackTelemetrySummary } =
    await import("./workpackTelemetryService");
  const { listWorkpackReadinessSummaries } =
    await import("./workpackReadinessService");

  const telemetry = await getWorkpackTelemetrySummary(tenantId);
  const readiness = await listWorkpackReadinessSummaries(tenantId);

  return {
    totals: telemetry.totals,
    recentEvents: telemetry.recentEvents.map(event => ({
      id: event.id,
      workpackId: event.workpackId,
      eventName: event.eventName,
      detail: event.detail,
      createdAt: event.createdAt,
    })),
    readiness: readiness.map(summary => ({
      workpackId: summary.workpackId,
      versionId: summary.versionId,
      gateResult: summary.gateResult,
      reasonCode: summary.reasonCode,
      rolloutPhase: summary.rolloutPhase,
      nextAction: summary.nextAction,
    })),
  };
}

/**
 * Paginated list of monitoring checks with optional filters.
 */
export async function getChecks(opts: {
  page: number;
  limit: number;
  status?: string;
  checkType?: string;
  since?: string;
}): Promise<{ checks: MonitoringCheck[]; total: number; page: number }> {
  const db = await getDb();
  const offset = (opts.page - 1) * opts.limit;

  const conditions = [];
  if (opts.status) conditions.push(eq(monitoringChecks.status, opts.status));
  if (opts.checkType)
    conditions.push(eq(monitoringChecks.checkType, opts.checkType));
  if (opts.since) {
    conditions.push(gte(monitoringChecks.createdAt, new Date(opts.since)));
  }

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const [rows, [{ cnt }]] = await Promise.all([
    db
      .select()
      .from(monitoringChecks)
      .where(where)
      .orderBy(desc(monitoringChecks.createdAt))
      .limit(opts.limit)
      .offset(offset),
    db.select({ cnt: count() }).from(monitoringChecks).where(where),
  ]);

  return { checks: rows, total: Number(cnt), page: opts.page };
}

/**
 * Paginated list of monitoring alerts with optional filters.
 */
export async function getAlerts(opts: {
  page: number;
  limit: number;
  severity?: string;
  acknowledged?: boolean;
  groupKey?: string;
}): Promise<{ alerts: MonitoringAlert[]; total: number }> {
  const db = await getDb();
  const offset = (opts.page - 1) * opts.limit;

  const conditions = [];
  if (opts.severity)
    conditions.push(eq(monitoringAlerts.severity, opts.severity));
  if (opts.acknowledged !== undefined) {
    conditions.push(eq(monitoringAlerts.acknowledged, opts.acknowledged));
  }
  if (opts.groupKey) {
    conditions.push(
      sql`${monitoringAlerts.metadata}->>'dedupeKey' = ${opts.groupKey}`
    );
  }

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const [rows, [{ cnt }]] = await Promise.all([
    db
      .select()
      .from(monitoringAlerts)
      .where(where)
      .orderBy(desc(monitoringAlerts.createdAt))
      .limit(opts.limit)
      .offset(offset),
    db.select({ cnt: count() }).from(monitoringAlerts).where(where),
  ]);

  return { alerts: rows, total: Number(cnt) };
}

/**
 * Acknowledge an alert by ID.
 */
export async function acknowledgeAlert(input: {
  alertId: number;
  acknowledgedBy: number;
  actorName?: string | null;
  actorEmail?: string | null;
  note?: string | null;
}): Promise<void> {
  const db = await getDb();
  const [existingAlert] = await db
    .select()
    .from(monitoringAlerts)
    .where(eq(monitoringAlerts.id, input.alertId))
    .limit(1);

  if (!existingAlert) {
    throw new Error(`Alert ${input.alertId} not found`);
  }

  const metadata = asRecord(existingAlert.metadata) ?? {};
  const acknowledgedAt = new Date();
  const acknowledgementNote = input.note?.trim() ? input.note.trim() : null;
  const existingIncidentResponse = asOpsIncidentResponseState(
    metadata.incidentResponse
  );
  const nextIncidentResponse = buildIncidentResponseState(
    existingIncidentResponse,
    {
      type: "acknowledged",
      at: acknowledgedAt.toISOString(),
      actorId: input.acknowledgedBy,
      actorName: input.actorName ?? null,
      actorEmail: input.actorEmail ?? null,
      note: acknowledgementNote,
      ownerId: input.acknowledgedBy,
      ownerName: input.actorName ?? null,
      ownerEmail: input.actorEmail ?? null,
    },
    {
      currentOwnerId: input.acknowledgedBy,
      currentOwnerName: input.actorName ?? null,
      currentOwnerEmail: input.actorEmail ?? null,
    }
  );

  await db
    .update(monitoringAlerts)
    .set({
      acknowledged: true,
      acknowledgedBy: input.acknowledgedBy,
      acknowledgedAt,
      metadata: {
        ...metadata,
        acknowledgement: {
          actorId: input.acknowledgedBy,
          actorName: input.actorName ?? null,
          actorEmail: input.actorEmail ?? null,
          note: acknowledgementNote,
          at: acknowledgedAt.toISOString(),
        },
        incidentResponse: nextIncidentResponse,
      },
    })
    .where(eq(monitoringAlerts.id, input.alertId));
}

export async function recordIncidentAction(input: {
  groupKey: string;
  action: Exclude<OpsIncidentResponseActionType, "acknowledged">;
  actorId: number;
  actorName?: string | null;
  actorEmail?: string | null;
  note?: string | null;
  ownerUserId?: number | null;
}): Promise<void> {
  const db = await getDb();
  const [latestAlert] = await db
    .select()
    .from(monitoringAlerts)
    .where(sql`${monitoringAlerts.metadata}->>'dedupeKey' = ${input.groupKey}`)
    .orderBy(desc(monitoringAlerts.createdAt))
    .limit(1);

  if (!latestAlert) {
    throw new Error(`Incident ${input.groupKey} not found`);
  }

  const metadata = asRecord(latestAlert.metadata) ?? {};
  const existingIncidentResponse = asOpsIncidentResponseState(
    metadata.incidentResponse
  );
  const acknowledgement = asOpsAlertMetadata(metadata).acknowledgement;
  const normalizedNote = input.note?.trim() ? input.note.trim() : null;

  let ownerId =
    existingIncidentResponse.currentOwnerId ?? acknowledgement?.actorId ?? null;
  let ownerName =
    existingIncidentResponse.currentOwnerName ??
    acknowledgement?.actorName ??
    null;
  let ownerEmail =
    existingIncidentResponse.currentOwnerEmail ??
    acknowledgement?.actorEmail ??
    null;

  if (input.action === "handoff") {
    const targetOwnerId = input.ownerUserId ?? null;
    if (!targetOwnerId) {
      throw new Error("A target owner is required for handoff");
    }

    const [owner] = await db
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
        role: users.role,
      })
      .from(users)
      .where(eq(users.id, targetOwnerId))
      .limit(1);

    if (!owner || !["admin", "domain_admin"].includes(owner.role)) {
      throw new Error("Target owner must be an admin or domain admin");
    }

    ownerId = owner.id;
    ownerName = owner.name ?? owner.email ?? `User ${owner.id}`;
    ownerEmail = owner.email ?? null;
  } else if (
    !ownerId &&
    ["note", "resolved", "reopened"].includes(input.action)
  ) {
    ownerId = input.actorId;
    ownerName = input.actorName ?? null;
    ownerEmail = input.actorEmail ?? null;
  }

  const eventAt = new Date().toISOString();
  const nextIncidentResponse = buildIncidentResponseState(
    existingIncidentResponse,
    {
      type: input.action,
      at: eventAt,
      actorId: input.actorId,
      actorName: input.actorName ?? null,
      actorEmail: input.actorEmail ?? null,
      note: normalizedNote,
      ownerId,
      ownerName,
      ownerEmail,
    },
    {
      currentOwnerId: ownerId,
      currentOwnerName: ownerName,
      currentOwnerEmail: ownerEmail,
      resolutionNote:
        input.action === "resolved"
          ? normalizedNote
          : (existingIncidentResponse.resolutionNote ?? null),
      reopenReason:
        input.action === "reopened"
          ? normalizedNote
          : (existingIncidentResponse.reopenReason ?? null),
    }
  );

  await db
    .update(monitoringAlerts)
    .set({
      metadata: {
        ...metadata,
        incidentResponse: nextIncidentResponse,
      },
    })
    .where(eq(monitoringAlerts.id, latestAlert.id));
}

export interface MetricPoint {
  id: number;
  memoryUsedMb: number;
  memoryTotalMb: number;
  memoryPercent: number;
  cpuPercent: number | null;
  diskUsedGb: number | null;
  diskTotalGb: number | null;
  serviceStatuses: Record<string, string> | null;
  processRestartCounts: Record<string, number> | null;
  createdAt: Date;
}

/**
 * Returns system_metrics_history rows from the last N hours.
 */
export async function getMetricsHistory(hours: number): Promise<{
  metrics: MetricPoint[];
  latestMemoryPercent: number;
  latestCpuPercent: number | null;
}> {
  const db = await getDb();
  const since = new Date(Date.now() - hours * 60 * 60 * 1000);

  const rows = await db
    .select()
    .from(systemMetricsHistory)
    .where(gte(systemMetricsHistory.createdAt, since))
    .orderBy(desc(systemMetricsHistory.createdAt))
    .limit(500);

  const latest = rows[0];
  return {
    metrics: rows as MetricPoint[],
    latestMemoryPercent: latest?.memoryPercent ?? 0,
    latestCpuPercent: latest?.cpuPercent ?? null,
  };
}

export interface ServiceStatus {
  name: string;
  status: string;
  [key: string]: unknown;
}

type AlertCounts = {
  critical: number;
  warning: number;
  error: number;
  info: number;
};

type OpenAlertContext = {
  title: string;
  message: string;
  signal: string | null;
  recommendation: string | null;
  source: string | null;
  anomalyType: string | null;
  severity: string;
  createdAt: string;
};

type AuditSignalStats = {
  total: number;
  errorCount: number;
  serverErrorCount: number;
  timeoutCount: number;
  fallbackCount: number;
  p95LatencyMs: number | null;
  avgLatencyMs: number | null;
  lastSeenAt: string | null;
  topFailureSummary?: string | null;
};

type OrchestrationSignalStats = {
  totalEvents: number;
  classifyCount: number;
  fallbackCount: number;
  qualityCount: number;
  riskyQualityCount: number;
  avgClassifyLatencyMs: number | null;
  fallbackRate: number | null;
  qualityRiskRate: number | null;
  topFallbackReason: string | null;
  lastSeenAt: string | null;
};

type QueueSignalStats = {
  available: boolean;
  healthy: boolean;
  activeAlertCount: number;
  criticalAlertCount: number;
  warningAlertCount: number;
  maxQueueDepth: number | null;
  hottestQueue: string | null;
  topMessage: string | null;
  lastCheckAt: string | null;
};

export interface OpsAnomaly {
  id: string;
  dedupeKey?: string;
  severity: "warning" | "critical";
  category: "resources" | "services" | "monitoring" | "audit" | "orchestration";
  type: string;
  title: string;
  message: string;
  recommendation: string;
  signal: string | null;
  observedAt: string | null;
  source: string;
}

export interface OpsOverview {
  health: "healthy" | "warning" | "critical";
  anomalies: OpsAnomaly[];
  summary: {
    totalAnomalies: number;
    criticalCount: number;
    warningCount: number;
    resourceCount: number;
    serviceCount: number;
    monitoringCount: number;
    auditCount: number;
    orchestrationCount: number;
  };
  leadingSignals: {
    memoryPercent: number | null;
    cpuPercent: number | null;
    diskPercent: number | null;
    maxRestartDelta: number | null;
    llmErrorRate: number | null;
    mediaErrorRate: number | null;
    llmP95LatencyMs: number | null;
    mediaP95LatencyMs: number | null;
    fallbackRate: number | null;
    qualityRiskRate: number | null;
  };
  windows: {
    metricsHours: number;
    auditHours: number;
    orchestrationHours: number;
  };
  updatedAt: string;
}

export interface OpsOverviewInput {
  latestMetrics: MetricPoint | null;
  previousMetrics?: MetricPoint | null;
  baselineMetrics: MetricPoint | null;
  lastCheckAt: Date | null;
  services: ServiceStatus[];
  unackedAlerts: AlertCounts;
  latestOpenAlert?: OpenAlertContext | null;
  llmStats: AuditSignalStats;
  mediaStats: AuditSignalStats;
  orchestrationStats: OrchestrationSignalStats;
  queueStats?: QueueSignalStats | null;
  windows: OpsOverview["windows"];
  now?: Date;
}

type OpsAlertMetadata = {
  source?: string;
  dedupeKey?: string;
  anomalyId?: string;
  category?: string;
  anomalyType?: string;
  signal?: string | null;
  recommendation?: string;
  observedAt?: string;
  acknowledgement?: {
    actorId?: number;
    actorName?: string | null;
    actorEmail?: string | null;
    note?: string | null;
    at?: string | null;
  };
  incidentResponse?: OpsIncidentResponseState;
};

export type OpsIncidentResponseActionType =
  | "acknowledged"
  | "note"
  | "handoff"
  | "resolved"
  | "reopened";

export type OpsIncidentResponseEntry = {
  type: OpsIncidentResponseActionType;
  at: string;
  actorId?: number | null;
  actorName?: string | null;
  actorEmail?: string | null;
  note?: string | null;
  ownerId?: number | null;
  ownerName?: string | null;
  ownerEmail?: string | null;
};

export type OpsIncidentResponseState = {
  currentOwnerId?: number | null;
  currentOwnerName?: string | null;
  currentOwnerEmail?: string | null;
  latestEventType?: OpsIncidentResponseActionType | null;
  latestEventAt?: string | null;
  latestEventActorName?: string | null;
  latestEventActorEmail?: string | null;
  latestNote?: string | null;
  resolutionNote?: string | null;
  reopenReason?: string | null;
  history?: OpsIncidentResponseEntry[];
};

type OpsNotificationRecord = {
  id: number | string;
  title: string;
  priority: string | null;
  isRead: boolean;
  createdAt: Date | string;
  lastOccurredAt?: Date | string | null;
  occurrenceCount?: number | null;
  groupKey?: string | null;
};

export interface OpsIncidentTimelineItem {
  groupKey: string;
  title: string;
  severity: "info" | "warning" | "error" | "critical";
  category: string | null;
  status: "alerted" | "awaiting_action" | "acknowledged";
  latestMessage: string;
  signal: string | null;
  recommendation: string | null;
  totalAlertCount: number;
  openAlertCount: number;
  firstObservedAt: string | null;
  lastCheckedAt: string | null;
  lastAlertAt: string;
  lastAcknowledgedAt: string | null;
  lastAcknowledgedByName: string | null;
  lastAcknowledgedByEmail: string | null;
  latestActionNote: string | null;
  currentOwnerId: number | null;
  currentOwnerName: string | null;
  currentOwnerEmail: string | null;
  latestResponseType: OpsIncidentResponseActionType | null;
  latestResponseAt: string | null;
  latestResponseByName: string | null;
  latestResponseByEmail: string | null;
  latestResponseNote: string | null;
  resolutionNote: string | null;
  reopenReason: string | null;
  responseHistory: OpsIncidentResponseEntry[];
  notification: {
    sent: boolean;
    firstSentAt: string | null;
    lastSentAt: string | null;
    recipientCount: number;
    readCount: number;
    occurrenceCount: number;
    latestTitle: string | null;
  };
}

function asOpsAlertMetadata(value: unknown): OpsAlertMetadata {
  return (asRecord(value) ?? {}) as OpsAlertMetadata;
}

function asOpsIncidentResponseState(value: unknown): OpsIncidentResponseState {
  return (asRecord(value) ?? {}) as OpsIncidentResponseState;
}

function normalizeResponseHistory(value: unknown): OpsIncidentResponseEntry[] {
  if (!Array.isArray(value)) return [];
  const normalized: OpsIncidentResponseEntry[] = [];
  for (const item of value) {
    const record = asRecord(item);
    if (!record) {
      continue;
    }
    const type = record.type;
    const at = record.at;
    if (typeof type !== "string" || typeof at !== "string") {
      continue;
    }
    normalized.push({
      type: type as OpsIncidentResponseActionType,
      at,
      actorId: typeof record.actorId === "number" ? record.actorId : null,
      actorName: typeof record.actorName === "string" ? record.actorName : null,
      actorEmail:
        typeof record.actorEmail === "string" ? record.actorEmail : null,
      note: typeof record.note === "string" ? record.note : null,
      ownerId: typeof record.ownerId === "number" ? record.ownerId : null,
      ownerName: typeof record.ownerName === "string" ? record.ownerName : null,
      ownerEmail:
        typeof record.ownerEmail === "string" ? record.ownerEmail : null,
    });
  }
  return normalized.sort(
    (left, right) => new Date(right.at).getTime() - new Date(left.at).getTime()
  );
}

function dedupeResponseHistory(
  entries: OpsIncidentResponseEntry[]
): OpsIncidentResponseEntry[] {
  const seen = new Set<string>();
  const deduped: OpsIncidentResponseEntry[] = [];
  for (const entry of entries) {
    const key = [
      entry.type,
      entry.at,
      entry.actorId ?? "",
      entry.ownerId ?? "",
      entry.note ?? "",
    ].join("|");
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(entry);
  }
  deduped.sort(
    (left, right) => new Date(right.at).getTime() - new Date(left.at).getTime()
  );
  return deduped.slice(0, 12);
}

function buildIncidentResponseState(
  existing: OpsIncidentResponseState,
  entry: OpsIncidentResponseEntry,
  overrides?: {
    currentOwnerId?: number | null;
    currentOwnerName?: string | null;
    currentOwnerEmail?: string | null;
    resolutionNote?: string | null;
    reopenReason?: string | null;
  }
): OpsIncidentResponseState {
  const history = dedupeResponseHistory([
    entry,
    ...normalizeResponseHistory(existing.history),
  ]);

  const nextState: OpsIncidentResponseState = {
    ...existing,
    currentOwnerId:
      overrides?.currentOwnerId ??
      entry.ownerId ??
      existing.currentOwnerId ??
      null,
    currentOwnerName:
      overrides?.currentOwnerName ??
      entry.ownerName ??
      existing.currentOwnerName ??
      null,
    currentOwnerEmail:
      overrides?.currentOwnerEmail ??
      entry.ownerEmail ??
      existing.currentOwnerEmail ??
      null,
    latestEventType: entry.type,
    latestEventAt: entry.at,
    latestEventActorName: entry.actorName ?? null,
    latestEventActorEmail: entry.actorEmail ?? null,
    latestNote: entry.note ?? null,
    resolutionNote:
      overrides?.resolutionNote ?? existing.resolutionNote ?? null,
    reopenReason: overrides?.reopenReason ?? existing.reopenReason ?? null,
    history,
  };

  if (entry.type === "resolved") {
    nextState.resolutionNote = entry.note ?? nextState.resolutionNote ?? null;
  }
  if (entry.type === "reopened") {
    nextState.reopenReason = entry.note ?? nextState.reopenReason ?? null;
  }

  return nextState;
}

function toDateOrNull(value: string | Date | null | undefined): Date | null {
  if (!value) return null;
  const normalized = value instanceof Date ? value : new Date(value);
  return Number.isNaN(normalized.getTime()) ? null : normalized;
}

function toIsoOrNull(value: string | Date | null | undefined): string | null {
  return toDateOrNull(value)?.toISOString() ?? null;
}

function severityRank(severity: string | null | undefined): number {
  switch ((severity ?? "").toLowerCase()) {
    case "critical":
      return 4;
    case "error":
      return 3;
    case "warning":
      return 2;
    case "info":
      return 1;
    default:
      return 0;
  }
}

function getOpsAlertGroupKey(alert: MonitoringAlert): string | null {
  const metadata = asOpsAlertMetadata(alert.metadata);
  if (typeof metadata.dedupeKey === "string" && metadata.dedupeKey.length > 0) {
    return metadata.dedupeKey;
  }
  if (metadata.source === "ops_overview") {
    return `ops-alert:${alert.id}`;
  }
  return null;
}

export function buildOpsIncidentTimeline(input: {
  alerts: MonitoringAlert[];
  notifications: OpsNotificationRecord[];
  lastCheckAt: string | Date | null;
  limit?: number;
}): OpsIncidentTimelineItem[] {
  const notificationGroups = new Map<
    string,
    {
      firstSentAt: Date | null;
      lastSentAt: Date | null;
      recipientCount: number;
      readCount: number;
      occurrenceCount: number;
      latestTitle: string | null;
    }
  >();

  for (const notification of input.notifications) {
    if (!notification.groupKey) continue;
    const createdAt = toDateOrNull(notification.createdAt);
    const lastOccurredAt = toDateOrNull(
      notification.lastOccurredAt ?? notification.createdAt
    );
    const existing = notificationGroups.get(notification.groupKey) ?? {
      firstSentAt: null,
      lastSentAt: null,
      recipientCount: 0,
      readCount: 0,
      occurrenceCount: 0,
      latestTitle: null,
    };

    if (
      createdAt &&
      (!existing.firstSentAt || createdAt < existing.firstSentAt)
    ) {
      existing.firstSentAt = createdAt;
    }
    if (
      lastOccurredAt &&
      (!existing.lastSentAt || lastOccurredAt > existing.lastSentAt)
    ) {
      existing.lastSentAt = lastOccurredAt;
      existing.latestTitle = notification.title;
    }

    existing.recipientCount += 1;
    existing.readCount += notification.isRead ? 1 : 0;
    existing.occurrenceCount += notification.occurrenceCount ?? 1;
    if (!existing.latestTitle) {
      existing.latestTitle = notification.title;
    }

    notificationGroups.set(notification.groupKey, existing);
  }

  const timelineGroups = new Map<string, OpsIncidentTimelineItem>();
  const lastCheckAtIso = toIsoOrNull(input.lastCheckAt);

  for (const alert of input.alerts) {
    const groupKey = getOpsAlertGroupKey(alert);
    if (!groupKey) continue;

    const metadata = asOpsAlertMetadata(alert.metadata);
    const incidentResponse = asOpsIncidentResponseState(
      metadata.incidentResponse
    );
    const responseHistory = normalizeResponseHistory(incidentResponse.history);
    const createdAt = toDateOrNull(alert.createdAt);
    if (!createdAt) continue;
    const observedAt = toDateOrNull(metadata.observedAt ?? alert.createdAt);
    const acknowledgedAt = toDateOrNull(alert.acknowledgedAt);
    const fallbackAcknowledgedEntry = acknowledgedAt
      ? {
          type: "acknowledged" as const,
          at: acknowledgedAt.toISOString(),
          actorId:
            metadata.acknowledgement?.actorId ?? alert.acknowledgedBy ?? null,
          actorName: metadata.acknowledgement?.actorName ?? null,
          actorEmail: metadata.acknowledgement?.actorEmail ?? null,
          note: metadata.acknowledgement?.note ?? null,
          ownerId:
            metadata.acknowledgement?.actorId ?? alert.acknowledgedBy ?? null,
          ownerName: metadata.acknowledgement?.actorName ?? null,
          ownerEmail: metadata.acknowledgement?.actorEmail ?? null,
        }
      : null;
    const mergedResponseHistory = fallbackAcknowledgedEntry
      ? dedupeResponseHistory([fallbackAcknowledgedEntry, ...responseHistory])
      : responseHistory;
    const notificationSummary = notificationGroups.get(groupKey);
    const existing = timelineGroups.get(groupKey);

    if (!existing) {
      timelineGroups.set(groupKey, {
        groupKey,
        title: alert.title,
        severity: (["info", "warning", "error", "critical"].includes(
          alert.severity
        )
          ? alert.severity
          : "warning") as OpsIncidentTimelineItem["severity"],
        category:
          typeof metadata.category === "string" ? metadata.category : null,
        status: alert.acknowledged
          ? "acknowledged"
          : notificationSummary
            ? "awaiting_action"
            : "alerted",
        latestMessage: alert.message,
        signal: typeof metadata.signal === "string" ? metadata.signal : null,
        recommendation:
          typeof metadata.recommendation === "string"
            ? metadata.recommendation
            : null,
        totalAlertCount: 1,
        openAlertCount: alert.acknowledged ? 0 : 1,
        firstObservedAt: toIsoOrNull(observedAt),
        lastCheckedAt: lastCheckAtIso,
        lastAlertAt: createdAt.toISOString(),
        lastAcknowledgedAt: toIsoOrNull(acknowledgedAt),
        lastAcknowledgedByName: metadata.acknowledgement?.actorName ?? null,
        lastAcknowledgedByEmail: metadata.acknowledgement?.actorEmail ?? null,
        latestActionNote: metadata.acknowledgement?.note ?? null,
        currentOwnerId:
          incidentResponse.currentOwnerId ??
          metadata.acknowledgement?.actorId ??
          null,
        currentOwnerName:
          incidentResponse.currentOwnerName ??
          metadata.acknowledgement?.actorName ??
          null,
        currentOwnerEmail:
          incidentResponse.currentOwnerEmail ??
          metadata.acknowledgement?.actorEmail ??
          null,
        latestResponseType:
          incidentResponse.latestEventType ??
          (acknowledgedAt ? "acknowledged" : null),
        latestResponseAt:
          incidentResponse.latestEventAt ?? toIsoOrNull(acknowledgedAt),
        latestResponseByName:
          incidentResponse.latestEventActorName ??
          metadata.acknowledgement?.actorName ??
          null,
        latestResponseByEmail:
          incidentResponse.latestEventActorEmail ??
          metadata.acknowledgement?.actorEmail ??
          null,
        latestResponseNote:
          incidentResponse.latestNote ?? metadata.acknowledgement?.note ?? null,
        resolutionNote: incidentResponse.resolutionNote ?? null,
        reopenReason: incidentResponse.reopenReason ?? null,
        responseHistory: mergedResponseHistory,
        notification: {
          sent: Boolean(notificationSummary),
          firstSentAt: toIsoOrNull(notificationSummary?.firstSentAt ?? null),
          lastSentAt: toIsoOrNull(notificationSummary?.lastSentAt ?? null),
          recipientCount: notificationSummary?.recipientCount ?? 0,
          readCount: notificationSummary?.readCount ?? 0,
          occurrenceCount: notificationSummary?.occurrenceCount ?? 0,
          latestTitle: notificationSummary?.latestTitle ?? null,
        },
      });
      continue;
    }

    existing.totalAlertCount += 1;
    if (!alert.acknowledged) {
      existing.openAlertCount += 1;
    }
    if (observedAt) {
      const earliestObserved = toDateOrNull(existing.firstObservedAt);
      if (!earliestObserved || observedAt < earliestObserved) {
        existing.firstObservedAt = observedAt.toISOString();
      }
    }
    if (createdAt > new Date(existing.lastAlertAt)) {
      existing.lastAlertAt = createdAt.toISOString();
      existing.latestMessage = alert.message;
      existing.title = alert.title;
      existing.signal =
        typeof metadata.signal === "string" ? metadata.signal : existing.signal;
      existing.recommendation =
        typeof metadata.recommendation === "string"
          ? metadata.recommendation
          : existing.recommendation;
    }
    if (severityRank(alert.severity) > severityRank(existing.severity)) {
      existing.severity = (
        ["info", "warning", "error", "critical"].includes(alert.severity)
          ? alert.severity
          : existing.severity
      ) as OpsIncidentTimelineItem["severity"];
    }
    if (acknowledgedAt) {
      const previousAck = toDateOrNull(existing.lastAcknowledgedAt);
      if (!previousAck || acknowledgedAt > previousAck) {
        existing.lastAcknowledgedAt = acknowledgedAt.toISOString();
        existing.lastAcknowledgedByName =
          metadata.acknowledgement?.actorName ??
          existing.lastAcknowledgedByName;
        existing.lastAcknowledgedByEmail =
          metadata.acknowledgement?.actorEmail ??
          existing.lastAcknowledgedByEmail;
        existing.latestActionNote =
          metadata.acknowledgement?.note ?? existing.latestActionNote;
      }
    }
    const latestResponseAt = toDateOrNull(incidentResponse.latestEventAt);
    const previousResponseAt = toDateOrNull(existing.latestResponseAt);
    if (
      latestResponseAt &&
      (!previousResponseAt || latestResponseAt > previousResponseAt)
    ) {
      existing.currentOwnerId =
        incidentResponse.currentOwnerId ?? existing.currentOwnerId;
      existing.currentOwnerName =
        incidentResponse.currentOwnerName ?? existing.currentOwnerName;
      existing.currentOwnerEmail =
        incidentResponse.currentOwnerEmail ?? existing.currentOwnerEmail;
      existing.latestResponseType =
        incidentResponse.latestEventType ?? existing.latestResponseType;
      existing.latestResponseAt = latestResponseAt.toISOString();
      existing.latestResponseByName =
        incidentResponse.latestEventActorName ?? existing.latestResponseByName;
      existing.latestResponseByEmail =
        incidentResponse.latestEventActorEmail ??
        existing.latestResponseByEmail;
      existing.latestResponseNote =
        incidentResponse.latestNote ?? existing.latestResponseNote;
      existing.resolutionNote =
        incidentResponse.resolutionNote ?? existing.resolutionNote;
      existing.reopenReason =
        incidentResponse.reopenReason ?? existing.reopenReason;
    }
    if (mergedResponseHistory.length > 0) {
      existing.responseHistory = dedupeResponseHistory([
        ...existing.responseHistory,
        ...mergedResponseHistory,
      ]);
    }
  }

  const items = Array.from(timelineGroups.values()).map(item => {
    if (item.openAlertCount > 0) {
      item.status = item.notification.sent ? "awaiting_action" : "alerted";
    } else if (item.lastAcknowledgedAt) {
      item.status = "acknowledged";
    } else {
      item.status = item.notification.sent ? "awaiting_action" : "alerted";
    }
    return item;
  });

  items.sort((left, right) => {
    const leftActivity = Math.max(
      toDateOrNull(left.lastAcknowledgedAt)?.getTime() ?? 0,
      toDateOrNull(left.notification.lastSentAt)?.getTime() ?? 0,
      toDateOrNull(left.lastAlertAt)?.getTime() ?? 0
    );
    const rightActivity = Math.max(
      toDateOrNull(right.lastAcknowledgedAt)?.getTime() ?? 0,
      toDateOrNull(right.notification.lastSentAt)?.getTime() ?? 0,
      toDateOrNull(right.lastAlertAt)?.getTime() ?? 0
    );
    if (rightActivity !== leftActivity) {
      return rightActivity - leftActivity;
    }
    return severityRank(right.severity) - severityRank(left.severity);
  });

  return items.slice(0, input.limit ?? 6);
}

const HEALTHY_SERVICE_STATUSES = new Set([
  "ok",
  "healthy",
  "active",
  "running",
  "up",
  "pass",
]);
const WARNING_SERVICE_STATUSES = new Set([
  "warning",
  "degraded",
  "starting",
  "restarting",
  "unknown",
]);
const CRITICAL_SERVICE_STATUSES = new Set([
  "critical",
  "error",
  "failed",
  "unhealthy",
  "down",
  "stopped",
]);

const ORCHESTRATION_EVENT_TYPES = [
  "orchestration_classify",
  "orchestration_pipeline",
  "orchestration_agent_step",
  "orchestration_quality_gate",
  "orchestration_param_extract",
  "orchestration_fallback",
] as const;

const ORCHESTRATION_READ_LIMIT_PER_TYPE = 300;
const DEFAULT_ANOMALY_ALERT_COOLDOWN_MINUTES = 20;

function toFiniteNumber(value: unknown): number | null {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function formatPercent(value: number | null, digits = 0): string {
  if (value == null) return "n/a";
  return `${value.toFixed(digits)}%`;
}

function formatLatency(value: number | null): string {
  if (value == null) return "n/a";
  if (value >= 1000) return `${(value / 1000).toFixed(1)}s`;
  return `${Math.round(value)}ms`;
}

function formatMinutes(value: number): string {
  if (value >= 60) {
    return `${(value / 60).toFixed(value >= 120 ? 0 : 1)}h`;
  }
  return `${Math.round(value)}m`;
}

function ratioOrNull(numerator: number, denominator: number): number | null {
  return denominator > 0 ? numerator / denominator : null;
}

function resolveServiceStatus(value: unknown): string {
  if (typeof value === "string" && value.trim().length > 0) {
    return value.trim();
  }

  const record = asRecord(value);
  if (!record) {
    return "unknown";
  }

  for (const key of ["status", "state", "health"]) {
    const candidate = record[key];
    if (typeof candidate === "string" && candidate.trim().length > 0) {
      return candidate.trim();
    }
  }

  if (typeof record.healthy === "boolean") {
    return record.healthy ? "healthy" : "unhealthy";
  }
  if (typeof record.ok === "boolean") {
    return record.ok ? "ok" : "error";
  }
  if (typeof record.active === "boolean") {
    return record.active ? "active" : "inactive";
  }

  return "unknown";
}

function extractServices(
  serviceStatuses: Record<string, unknown> | null | undefined
): ServiceStatus[] {
  if (!serviceStatuses || typeof serviceStatuses !== "object") {
    return [];
  }
  return Object.entries(serviceStatuses).map(([name, value]) => ({
    name,
    status: resolveServiceStatus(value),
    ...(typeof value === "object" && value !== null
      ? (value as Record<string, unknown>)
      : {}),
  }));
}

function computeRestartDelta(
  latest: Record<string, number> | null | undefined,
  baseline: Record<string, number> | null | undefined
): { maxDelta: number; breakdown: Array<{ name: string; delta: number }> } {
  if (!latest || typeof latest !== "object") {
    return { maxDelta: 0, breakdown: [] };
  }

  const breakdown = Object.entries(latest)
    .map(([name, count]) => {
      const next = toFiniteNumber(count) ?? 0;
      const previous = toFiniteNumber(baseline?.[name]) ?? 0;
      return { name, delta: Math.max(0, next - previous) };
    })
    .filter(entry => entry.delta > 0)
    .sort((a, b) => b.delta - a.delta || a.name.localeCompare(b.name));

  return {
    maxDelta: breakdown[0]?.delta ?? 0,
    breakdown,
  };
}

function toIsoString(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  const date = typeof value === "string" ? new Date(value) : value;
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

function buildAnomaly(input: Omit<OpsAnomaly, "id">): OpsAnomaly {
  return {
    id: `${input.category}:${input.type}`,
    ...input,
  };
}

export function buildOpsAlertDedupeKey(
  anomaly: OpsAnomaly,
  overview: any
): string {
  if (anomaly.type !== "alert_backlog") {
    return `ops-overview:${anomaly.id}`;
  }

  const latestOpenAlert =
    "latestOpenAlert" in overview ? overview.latestOpenAlert : null;
  const unackedAlerts =
    "unackedAlerts" in overview ? overview.unackedAlerts : undefined;
  const fingerprint = [
    unackedAlerts?.critical ?? 0,
    unackedAlerts?.error ?? 0,
    latestOpenAlert?.anomalyType ?? "none",
    latestOpenAlert?.title ?? "none",
    latestOpenAlert?.message ?? "none",
  ].join("|");

  const digest = crypto
    .createHash("sha1")
    .update(fingerprint)
    .digest("hex")
    .slice(0, 12);
  return `ops-overview:${anomaly.id}:${digest}`;
}

export function shouldSkipOpsAlertEmission(
  hasOpenAlert: boolean,
  hasRecentAlert: boolean
): boolean {
  return hasOpenAlert || hasRecentAlert;
}

export function deriveOpsOverview(input: OpsOverviewInput): OpsOverview {
  const now = input.now ?? new Date();
  const anomalies: OpsAnomaly[] = [];
  const latestMetrics = input.latestMetrics;
  const queueStats = input.queueStats ?? null;

  const diskPercent =
    latestMetrics?.diskUsedGb != null &&
    latestMetrics.diskTotalGb != null &&
    latestMetrics.diskTotalGb > 0
      ? (latestMetrics.diskUsedGb / latestMetrics.diskTotalGb) * 100
      : null;

  const restartDelta = computeRestartDelta(
    latestMetrics?.processRestartCounts ?? null,
    input.baselineMetrics?.processRestartCounts ?? null
  );

  const previousServiceStatuses = extractServices(
    (input.previousMetrics?.serviceStatuses as
      | Record<string, unknown>
      | null
      | undefined) ?? null
  ).reduce(
    (acc, service) => {
      acc[service.name] = String(service.status ?? "unknown")
        .trim()
        .toLowerCase();
      return acc;
    },
    {} as Record<string, string>
  );

  const serviceBuckets = input.services.reduce(
    (acc, service) => {
      const normalized = String(service.status ?? "unknown")
        .trim()
        .toLowerCase();
      const previousStatus = previousServiceStatuses[service.name] ?? null;
      const hadPreviousCritical =
        previousStatus != null && CRITICAL_SERVICE_STATUSES.has(previousStatus);
      if (CRITICAL_SERVICE_STATUSES.has(normalized)) {
        if (previousStatus == null || hadPreviousCritical)
          acc.critical.push(service.name);
        else acc.warning.push(service.name);
      } else if (!HEALTHY_SERVICE_STATUSES.has(normalized))
        acc.warning.push(service.name);
      return acc;
    },
    { critical: [] as string[], warning: [] as string[] }
  );

  if ((latestMetrics?.memoryPercent ?? 0) >= 88) {
    anomalies.push(
      buildAnomaly({
        severity: "critical",
        category: "resources",
        type: "memory_pressure",
        title: "Memory pressure is near exhaustion",
        message: `RAM usage reached ${formatPercent(latestMetrics?.memoryPercent ?? null, 1)}.`,
        recommendation:
          "Reduce memory-heavy workloads or recycle the busiest workers before OOM kills cascade.",
        signal: latestMetrics
          ? `${latestMetrics.memoryUsedMb}/${latestMetrics.memoryTotalMb} MB`
          : null,
        observedAt: toIsoString(latestMetrics?.createdAt),
        source: "system_metrics_history",
      })
    );
  } else if ((latestMetrics?.memoryPercent ?? 0) >= 75) {
    anomalies.push(
      buildAnomaly({
        severity: "warning",
        category: "resources",
        type: "memory_pressure",
        title: "Memory usage is trending high",
        message: `RAM usage is ${formatPercent(latestMetrics?.memoryPercent ?? null, 1)}.`,
        recommendation:
          "Watch queue depth and large jobs now so workers do not hit OOM under the next spike.",
        signal: latestMetrics
          ? `${latestMetrics.memoryUsedMb}/${latestMetrics.memoryTotalMb} MB`
          : null,
        observedAt: toIsoString(latestMetrics?.createdAt),
        source: "system_metrics_history",
      })
    );
  }

  if ((latestMetrics?.cpuPercent ?? 0) >= 92) {
    anomalies.push(
      buildAnomaly({
        severity: "critical",
        category: "resources",
        type: "cpu_saturation",
        title: "CPU saturation is critical",
        message: `CPU usage reached ${formatPercent(latestMetrics?.cpuPercent ?? null, 1)}.`,
        recommendation:
          "Inspect hot workers and backpressure heavy queues before request latency snowballs.",
        signal: formatPercent(latestMetrics?.cpuPercent ?? null, 1),
        observedAt: toIsoString(latestMetrics?.createdAt),
        source: "system_metrics_history",
      })
    );
  } else if ((latestMetrics?.cpuPercent ?? 0) >= 80) {
    anomalies.push(
      buildAnomaly({
        severity: "warning",
        category: "resources",
        type: "cpu_saturation",
        title: "CPU usage is elevated",
        message: `CPU usage is ${formatPercent(latestMetrics?.cpuPercent ?? null, 1)}.`,
        recommendation:
          "Review active workloads and queue growth before sustained saturation degrades the node.",
        signal: formatPercent(latestMetrics?.cpuPercent ?? null, 1),
        observedAt: toIsoString(latestMetrics?.createdAt),
        source: "system_metrics_history",
      })
    );
  }

  if ((diskPercent ?? 0) >= 92) {
    anomalies.push(
      buildAnomaly({
        severity: "critical",
        category: "resources",
        type: "disk_pressure",
        title: "Disk capacity is close to full",
        message: `Disk usage reached ${formatPercent(diskPercent, 1)}.`,
        recommendation:
          "Clear logs, temp files, or failed artifacts before writes start failing.",
        signal:
          latestMetrics &&
          latestMetrics.diskUsedGb != null &&
          latestMetrics.diskTotalGb != null
            ? `${latestMetrics.diskUsedGb.toFixed(1)}/${latestMetrics.diskTotalGb.toFixed(1)} GB`
            : null,
        observedAt: toIsoString(latestMetrics?.createdAt),
        source: "system_metrics_history",
      })
    );
  } else if ((diskPercent ?? 0) >= 85) {
    anomalies.push(
      buildAnomaly({
        severity: "warning",
        category: "resources",
        type: "disk_pressure",
        title: "Disk usage is climbing",
        message: `Disk usage is ${formatPercent(diskPercent, 1)}.`,
        recommendation:
          "Schedule cleanup before artifact growth or logs push the node into write failures.",
        signal:
          latestMetrics &&
          latestMetrics.diskUsedGb != null &&
          latestMetrics.diskTotalGb != null
            ? `${latestMetrics.diskUsedGb.toFixed(1)}/${latestMetrics.diskTotalGb.toFixed(1)} GB`
            : null,
        observedAt: toIsoString(latestMetrics?.createdAt),
        source: "system_metrics_history",
      })
    );
  }

  if (restartDelta.maxDelta >= 3) {
    anomalies.push(
      buildAnomaly({
        severity: "critical",
        category: "services",
        type: "restart_spike",
        title: "Process restarts spiked in the recent window",
        message: `At least one process restarted ${restartDelta.maxDelta} times in the last ${input.windows.metricsHours}h.`,
        recommendation:
          "Inspect the affected process logs now; restart churn often precedes full service outage.",
        signal: restartDelta.breakdown
          .slice(0, 3)
          .map(entry => `${entry.name}+${entry.delta}`)
          .join(", "),
        observedAt: toIsoString(latestMetrics?.createdAt),
        source: "system_metrics_history",
      })
    );
  } else if (restartDelta.maxDelta >= 1) {
    anomalies.push(
      buildAnomaly({
        severity: "warning",
        category: "services",
        type: "restart_spike",
        title: "Recent process restart detected",
        message: `One or more processes restarted in the last ${input.windows.metricsHours}h.`,
        recommendation:
          "Review whether this restart was planned so it does not turn into a loop under load.",
        signal: restartDelta.breakdown
          .slice(0, 3)
          .map(entry => `${entry.name}+${entry.delta}`)
          .join(", "),
        observedAt: toIsoString(latestMetrics?.createdAt),
        source: "system_metrics_history",
      })
    );
  }

  if (serviceBuckets.critical.length > 0) {
    anomalies.push(
      buildAnomaly({
        severity: "critical",
        category: "services",
        type: "service_unhealthy",
        title: "One or more services are unhealthy",
        message: `${serviceBuckets.critical.length} services report failing states.`,
        recommendation:
          "Check logs and dependencies for the affected services before traffic shifts load elsewhere.",
        signal: serviceBuckets.critical.slice(0, 4).join(", "),
        observedAt: toIsoString(latestMetrics?.createdAt),
        source: "system_metrics_history",
      })
    );
  }

  if (serviceBuckets.warning.length > 0) {
    anomalies.push(
      buildAnomaly({
        severity: "warning",
        category: "services",
        type: "service_degraded",
        title: "Some services are in non-steady states",
        message: `${serviceBuckets.warning.length} services are starting, degraded, or unknown.`,
        recommendation:
          "Confirm whether these states are expected so they do not mask a deeper dependency issue.",
        signal: serviceBuckets.warning.slice(0, 4).join(", "),
        observedAt: toIsoString(latestMetrics?.createdAt),
        source: "system_metrics_history",
      })
    );
  }

  if (queueStats?.available && queueStats.activeAlertCount > 0) {
    const severity = queueStats.criticalAlertCount > 0 ? "critical" : "warning";
    anomalies.push(
      buildAnomaly({
        severity,
        category: "services",
        type: "queue_backlog",
        title:
          severity === "critical"
            ? "Background queues are at risk"
            : "Background queues need attention",
        message:
          queueStats.topMessage ??
          `${queueStats.activeAlertCount} queue health alerts are active.`,
        recommendation:
          "Drain the hottest queue or restore workers before backlog spills into timeouts and failed jobs.",
        signal:
          queueStats.hottestQueue && queueStats.maxQueueDepth != null
            ? `${queueStats.hottestQueue}: ${queueStats.maxQueueDepth}`
            : queueStats.maxQueueDepth != null
              ? `${queueStats.maxQueueDepth} queued`
              : null,
        observedAt: queueStats.lastCheckAt,
        source: "queue_health_monitor",
      })
    );
  }

  const criticalLikeAlerts =
    input.unackedAlerts.critical + input.unackedAlerts.error;
  if (criticalLikeAlerts > 0) {
    const latestOpenAlert = input.latestOpenAlert ?? null;
    const backlogAnomaly = buildAnomaly({
      severity: "critical",
      category: "monitoring",
      type: "alert_backlog",
      title: "Critical monitoring alerts are still unacknowledged",
      message: latestOpenAlert
        ? `${criticalLikeAlerts} high-severity alerts are pending acknowledgement. Latest unresolved alert: ${latestOpenAlert.title}${latestOpenAlert.message ? ` - ${latestOpenAlert.message}` : ""}.`
        : `${criticalLikeAlerts} high-severity alerts are pending acknowledgement.`,
      recommendation: latestOpenAlert
        ? `Triage ${latestOpenAlert.title} first, then acknowledge the backlog once ownership and the root cause note are clear.`
        : "Triage the outstanding alerts now so the same failure does not silently compound.",
      signal: latestOpenAlert
        ? `${criticalLikeAlerts} pending · latest unresolved: ${latestOpenAlert.title}`
        : `${criticalLikeAlerts} pending`,
      observedAt: toIsoString(input.lastCheckAt),
      source: "monitoring_alerts",
    });
    backlogAnomaly.dedupeKey = buildOpsAlertDedupeKey(backlogAnomaly, {
      unackedAlerts: input.unackedAlerts,
      latestOpenAlert,
    });
    anomalies.push(backlogAnomaly);
  } else if (input.unackedAlerts.warning >= 3) {
    anomalies.push(
      buildAnomaly({
        severity: "warning",
        category: "monitoring",
        type: "alert_backlog",
        title: "Warning alerts are accumulating",
        message: `${input.unackedAlerts.warning} warning alerts are still open.`,
        recommendation:
          "Review the alert backlog before warning-level churn hides the next real incident.",
        signal: `${input.unackedAlerts.warning} pending`,
        observedAt: toIsoString(input.lastCheckAt),
        source: "monitoring_alerts",
      })
    );
  }

  const lastCheckAgeMinutes = input.lastCheckAt
    ? (now.getTime() - input.lastCheckAt.getTime()) / 60_000
    : null;

  if (lastCheckAgeMinutes != null && lastCheckAgeMinutes > 30) {
    anomalies.push(
      buildAnomaly({
        severity: "critical",
        category: "monitoring",
        type: "monitoring_stale",
        title: "Monitoring signal is stale",
        message: `No fresh monitoring check has landed for ${formatMinutes(lastCheckAgeMinutes)}.`,
        recommendation:
          "Restore the monitoring pipeline quickly so you are not flying blind during the next incident.",
        signal: `last check ${formatMinutes(lastCheckAgeMinutes)} ago`,
        observedAt: toIsoString(input.lastCheckAt),
        source: "monitoring_checks",
      })
    );
  } else if (lastCheckAgeMinutes != null && lastCheckAgeMinutes > 15) {
    anomalies.push(
      buildAnomaly({
        severity: "warning",
        category: "monitoring",
        type: "monitoring_stale",
        title: "Monitoring freshness is slipping",
        message: `The last monitoring check arrived ${formatMinutes(lastCheckAgeMinutes)} ago.`,
        recommendation:
          "Verify the collector and scheduler before alert coverage gaps widen.",
        signal: `last check ${formatMinutes(lastCheckAgeMinutes)} ago`,
        observedAt: toIsoString(input.lastCheckAt),
        source: "monitoring_checks",
      })
    );
  }

  const llmErrorRate = ratioOrNull(
    input.llmStats.errorCount,
    input.llmStats.total
  );
  if (
    input.llmStats.total >= 20 &&
    ((llmErrorRate ?? 0) >= 0.2 ||
      input.llmStats.serverErrorCount >= 5 ||
      input.llmStats.timeoutCount >= 3)
  ) {
    const topFailureSummary = input.llmStats.topFailureSummary?.trim();
    anomalies.push(
      buildAnomaly({
        severity: "critical",
        category: "audit",
        type: "llm_error_spike",
        title: "LLM error rate spiked",
        message: topFailureSummary
          ? `${input.llmStats.errorCount} of ${input.llmStats.total} recent LLM calls failed. Top failures: ${topFailureSummary}.`
          : `${input.llmStats.errorCount} of ${input.llmStats.total} recent LLM calls failed.`,
        recommendation: topFailureSummary
          ? "Check provider health, model routing, and fallback paths before chat traffic degrades broadly. The failure pattern points to a provider/model mismatch or endpoint rejection."
          : "Check provider health, rate limits, and fallback routing before chat traffic degrades broadly.",
        signal:
          topFailureSummary && llmErrorRate != null
            ? `${(llmErrorRate * 100).toFixed(0)}% error rate · ${topFailureSummary}`
            : llmErrorRate != null
              ? `${(llmErrorRate * 100).toFixed(0)}% error rate`
              : null,
        observedAt: input.llmStats.lastSeenAt,
        source: "provider_usage_log",
      })
    );
  } else if (input.llmStats.total >= 20 && (llmErrorRate ?? 0) >= 0.08) {
    anomalies.push(
      buildAnomaly({
        severity: "warning",
        category: "audit",
        type: "llm_error_spike",
        title: "LLM failures are trending upward",
        message: `${input.llmStats.errorCount} of ${input.llmStats.total} recent LLM calls failed.`,
        recommendation:
          "Inspect provider distribution and fallback volume before this crosses into user-visible failure.",
        signal:
          llmErrorRate != null
            ? `${(llmErrorRate * 100).toFixed(0)}% error rate`
            : null,
        observedAt: input.llmStats.lastSeenAt,
        source: "provider_usage_log",
      })
    );
  }

  if (
    input.llmStats.total >= 20 &&
    (input.llmStats.p95LatencyMs ?? 0) >= 15_000
  ) {
    anomalies.push(
      buildAnomaly({
        severity: "critical",
        category: "audit",
        type: "llm_latency_spike",
        title: "LLM tail latency is critically high",
        message: `Recent LLM p95 latency is ${formatLatency(input.llmStats.p95LatencyMs)}.`,
        recommendation:
          "Reduce queue pressure or reroute traffic before timeouts and retries amplify load.",
        signal: `p95 ${formatLatency(input.llmStats.p95LatencyMs)}`,
        observedAt: input.llmStats.lastSeenAt,
        source: "provider_usage_log",
      })
    );
  } else if (
    input.llmStats.total >= 20 &&
    (input.llmStats.p95LatencyMs ?? 0) >= 8_000
  ) {
    anomalies.push(
      buildAnomaly({
        severity: "warning",
        category: "audit",
        type: "llm_latency_spike",
        title: "LLM latency is elevated",
        message: `Recent LLM p95 latency is ${formatLatency(input.llmStats.p95LatencyMs)}.`,
        recommendation:
          "Watch queue growth and retries so the next spike does not push requests over timeout budgets.",
        signal: `p95 ${formatLatency(input.llmStats.p95LatencyMs)}`,
        observedAt: input.llmStats.lastSeenAt,
        source: "provider_usage_log",
      })
    );
  }

  const mediaErrorRate = ratioOrNull(
    input.mediaStats.errorCount,
    input.mediaStats.total
  );
  if (
    input.mediaStats.total >= 10 &&
    ((mediaErrorRate ?? 0) >= 0.25 || input.mediaStats.serverErrorCount >= 4)
  ) {
    anomalies.push(
      buildAnomaly({
        severity: "critical",
        category: "audit",
        type: "media_error_spike",
        title: "Media/API error rate spiked",
        message: `${input.mediaStats.errorCount} of ${input.mediaStats.total} recent media/API audit events failed.`,
        recommendation:
          "Inspect provider-side failures and worker throughput before media jobs start to backlog.",
        signal:
          mediaErrorRate != null
            ? `${(mediaErrorRate * 100).toFixed(0)}% error rate`
            : null,
        observedAt: input.mediaStats.lastSeenAt,
        source: "api_audit_events",
      })
    );
  } else if (input.mediaStats.total >= 10 && (mediaErrorRate ?? 0) >= 0.12) {
    anomalies.push(
      buildAnomaly({
        severity: "warning",
        category: "audit",
        type: "media_error_spike",
        title: "Media/API failures are trending upward",
        message: `${input.mediaStats.errorCount} of ${input.mediaStats.total} recent media/API audit events failed.`,
        recommendation:
          "Review provider errors now so retries do not build a delayed outage.",
        signal:
          mediaErrorRate != null
            ? `${(mediaErrorRate * 100).toFixed(0)}% error rate`
            : null,
        observedAt: input.mediaStats.lastSeenAt,
        source: "api_audit_events",
      })
    );
  }

  if (
    input.mediaStats.total >= 10 &&
    (input.mediaStats.p95LatencyMs ?? 0) >= 45_000
  ) {
    anomalies.push(
      buildAnomaly({
        severity: "critical",
        category: "audit",
        type: "media_latency_spike",
        title: "Media/API tail latency is critically high",
        message: `Recent media/API p95 latency is ${formatLatency(input.mediaStats.p95LatencyMs)}.`,
        recommendation:
          "Throttle heavy jobs or split traffic before long-running work starves the worker pool.",
        signal: `p95 ${formatLatency(input.mediaStats.p95LatencyMs)}`,
        observedAt: input.mediaStats.lastSeenAt,
        source: "api_audit_events",
      })
    );
  } else if (
    input.mediaStats.total >= 10 &&
    (input.mediaStats.p95LatencyMs ?? 0) >= 20_000
  ) {
    anomalies.push(
      buildAnomaly({
        severity: "warning",
        category: "audit",
        type: "media_latency_spike",
        title: "Media/API latency is elevated",
        message: `Recent media/API p95 latency is ${formatLatency(input.mediaStats.p95LatencyMs)}.`,
        recommendation:
          "Check queue time and provider slowness before latency tips jobs into failure territory.",
        signal: `p95 ${formatLatency(input.mediaStats.p95LatencyMs)}`,
        observedAt: input.mediaStats.lastSeenAt,
        source: "api_audit_events",
      })
    );
  }

  if (
    input.orchestrationStats.classifyCount >= 8 &&
    (input.orchestrationStats.fallbackRate ?? 0) >= 0.35
  ) {
    anomalies.push(
      buildAnomaly({
        severity: "critical",
        category: "orchestration",
        type: "orchestration_fallback_spike",
        title: "Orchestration fallback rate is too high",
        message: `${input.orchestrationStats.fallbackCount} fallbacks were triggered across ${input.orchestrationStats.classifyCount} recent classifications.`,
        recommendation:
          "Inspect classifier confidence and provider/tool instability before fallback paths exhaust capacity.",
        signal:
          input.orchestrationStats.fallbackRate != null
            ? `${(input.orchestrationStats.fallbackRate * 100).toFixed(0)}% fallback rate`
            : null,
        observedAt: input.orchestrationStats.lastSeenAt,
        source: "audit_jsonl",
      })
    );
  } else if (
    input.orchestrationStats.classifyCount >= 8 &&
    (input.orchestrationStats.fallbackRate ?? 0) >= 0.15
  ) {
    anomalies.push(
      buildAnomaly({
        severity: "warning",
        category: "orchestration",
        type: "orchestration_fallback_spike",
        title: "Orchestration is leaning on fallbacks more often",
        message: `${input.orchestrationStats.fallbackCount} fallbacks were triggered across ${input.orchestrationStats.classifyCount} recent classifications.`,
        recommendation:
          "Review the dominant fallback reason before routing quality or latency deteriorates further.",
        signal:
          input.orchestrationStats.fallbackRate != null
            ? `${(input.orchestrationStats.fallbackRate * 100).toFixed(0)}% fallback rate`
            : null,
        observedAt: input.orchestrationStats.lastSeenAt,
        source: "audit_jsonl",
      })
    );
  }

  if (
    input.orchestrationStats.qualityCount >= 6 &&
    (input.orchestrationStats.qualityRiskRate ?? 0) >= 0.4
  ) {
    anomalies.push(
      buildAnomaly({
        severity: "critical",
        category: "orchestration",
        type: "orchestration_quality_risk",
        title: "Quality gate failures are clustering",
        message: `${input.orchestrationStats.riskyQualityCount} of ${input.orchestrationStats.qualityCount} quality checks are failing.`,
        recommendation:
          "Investigate prompt quality, tool results, and output validation before bad runs pile up.",
        signal:
          input.orchestrationStats.qualityRiskRate != null
            ? `${(input.orchestrationStats.qualityRiskRate * 100).toFixed(0)}% risk rate`
            : null,
        observedAt: input.orchestrationStats.lastSeenAt,
        source: "audit_jsonl",
      })
    );
  } else if (
    input.orchestrationStats.qualityCount >= 6 &&
    (input.orchestrationStats.qualityRiskRate ?? 0) >= 0.2
  ) {
    anomalies.push(
      buildAnomaly({
        severity: "warning",
        category: "orchestration",
        type: "orchestration_quality_risk",
        title: "Quality risk is rising",
        message: `${input.orchestrationStats.riskyQualityCount} of ${input.orchestrationStats.qualityCount} quality checks are failing.`,
        recommendation:
          "Review repeated quality issues before they become an operator-facing incident.",
        signal:
          input.orchestrationStats.qualityRiskRate != null
            ? `${(input.orchestrationStats.qualityRiskRate * 100).toFixed(0)}% risk rate`
            : null,
        observedAt: input.orchestrationStats.lastSeenAt,
        source: "audit_jsonl",
      })
    );
  }

  if (
    input.orchestrationStats.classifyCount >= 8 &&
    (input.orchestrationStats.avgClassifyLatencyMs ?? 0) >= 4_000
  ) {
    anomalies.push(
      buildAnomaly({
        severity: "critical",
        category: "orchestration",
        type: "orchestration_latency_spike",
        title: "Classification latency is critically high",
        message: `Average classify latency reached ${formatLatency(input.orchestrationStats.avgClassifyLatencyMs)}.`,
        recommendation:
          "Inspect model latency and prompt complexity before orchestration queues start stacking.",
        signal: `avg ${formatLatency(input.orchestrationStats.avgClassifyLatencyMs)}`,
        observedAt: input.orchestrationStats.lastSeenAt,
        source: "audit_jsonl",
      })
    );
  } else if (
    input.orchestrationStats.classifyCount >= 8 &&
    (input.orchestrationStats.avgClassifyLatencyMs ?? 0) >= 1_500
  ) {
    anomalies.push(
      buildAnomaly({
        severity: "warning",
        category: "orchestration",
        type: "orchestration_latency_spike",
        title: "Classification latency is elevated",
        message: `Average classify latency is ${formatLatency(input.orchestrationStats.avgClassifyLatencyMs)}.`,
        recommendation:
          "Keep an eye on classifier load so routing decisions stay ahead of user-visible lag.",
        signal: `avg ${formatLatency(input.orchestrationStats.avgClassifyLatencyMs)}`,
        observedAt: input.orchestrationStats.lastSeenAt,
        source: "audit_jsonl",
      })
    );
  }

  anomalies.sort((a, b) => {
    const severityOrder =
      a.severity === b.severity ? 0 : a.severity === "critical" ? -1 : 1;
    if (severityOrder !== 0) return severityOrder;
    return a.title.localeCompare(b.title);
  });

  const summary = {
    totalAnomalies: anomalies.length,
    criticalCount: anomalies.filter(anomaly => anomaly.severity === "critical")
      .length,
    warningCount: anomalies.filter(anomaly => anomaly.severity === "warning")
      .length,
    resourceCount: anomalies.filter(anomaly => anomaly.category === "resources")
      .length,
    serviceCount: anomalies.filter(anomaly => anomaly.category === "services")
      .length,
    monitoringCount: anomalies.filter(
      anomaly => anomaly.category === "monitoring"
    ).length,
    auditCount: anomalies.filter(anomaly => anomaly.category === "audit")
      .length,
    orchestrationCount: anomalies.filter(
      anomaly => anomaly.category === "orchestration"
    ).length,
  };

  return {
    health:
      summary.criticalCount > 0
        ? "critical"
        : summary.warningCount > 0
          ? "warning"
          : "healthy",
    anomalies,
    summary,
    leadingSignals: {
      memoryPercent: latestMetrics?.memoryPercent ?? null,
      cpuPercent: latestMetrics?.cpuPercent ?? null,
      diskPercent,
      maxRestartDelta: restartDelta.maxDelta > 0 ? restartDelta.maxDelta : null,
      llmErrorRate,
      mediaErrorRate,
      llmP95LatencyMs: input.llmStats.p95LatencyMs,
      mediaP95LatencyMs: input.mediaStats.p95LatencyMs,
      fallbackRate: input.orchestrationStats.fallbackRate,
      qualityRiskRate: input.orchestrationStats.qualityRiskRate,
    },
    windows: input.windows,
    updatedAt: now.toISOString(),
  };
}

async function getAlertCounts(
  db: Awaited<ReturnType<typeof getDb>>
): Promise<AlertCounts> {
  const rows = await db
    .select({
      id: monitoringAlerts.id,
      severity: monitoringAlerts.severity,
      dedupeKey: sql<string | null>`${monitoringAlerts.metadata}->>'dedupeKey'`,
      anomalyType: sql<
        string | null
      >`${monitoringAlerts.metadata}->>'anomalyType'`,
    })
    .from(monitoringAlerts)
    .where(eq(monitoringAlerts.acknowledged, false))
    .orderBy(desc(monitoringAlerts.createdAt));

  const counts: AlertCounts = { critical: 0, warning: 0, error: 0, info: 0 };
  const seenIncidentKeys = new Set<string>();
  for (const row of rows) {
    const anomalyType = String(row.anomalyType ?? "")
      .trim()
      .toLowerCase();
    if (anomalyType === "alert_backlog") {
      continue;
    }

    const incidentKey =
      String(row.dedupeKey ?? "").trim() || `legacy:${row.id}`;
    if (seenIncidentKeys.has(incidentKey)) {
      continue;
    }
    seenIncidentKeys.add(incidentKey);

    const severity = String(
      row.severity ?? ""
    ).toLowerCase() as keyof AlertCounts;
    if (severity in counts) {
      counts[severity] += 1;
    }
  }
  return counts;
}

async function getLatestOpenAlertContext(
  db: Awaited<ReturnType<typeof getDb>>
): Promise<OpenAlertContext | null> {
  const rows = await db
    .select({
      id: monitoringAlerts.id,
      severity: monitoringAlerts.severity,
      title: monitoringAlerts.title,
      message: monitoringAlerts.message,
      source: sql<string | null>`${monitoringAlerts.metadata}->>'source'`,
      anomalyType: sql<
        string | null
      >`${monitoringAlerts.metadata}->>'anomalyType'`,
      signal: sql<string | null>`${monitoringAlerts.metadata}->>'signal'`,
      recommendation: sql<
        string | null
      >`${monitoringAlerts.metadata}->>'recommendation'`,
      createdAt: monitoringAlerts.createdAt,
    })
    .from(monitoringAlerts)
    .where(
      and(
        eq(monitoringAlerts.acknowledged, false),
        sql`coalesce(${monitoringAlerts.metadata}->>'anomalyType', '') <> 'alert_backlog'`
      )
    )
    .orderBy(desc(monitoringAlerts.createdAt))
    .limit(50);

  const latest = rows.sort((left, right) => {
    const severityDelta =
      severityRank(right.severity) - severityRank(left.severity);
    if (severityDelta !== 0) {
      return severityDelta;
    }
    return right.createdAt.getTime() - left.createdAt.getTime();
  })[0];

  if (!latest) {
    return null;
  }

  return {
    title: latest.title,
    message: latest.message,
    signal: latest.signal,
    recommendation: latest.recommendation,
    source: latest.source,
    anomalyType: latest.anomalyType,
    severity: latest.severity,
    createdAt: latest.createdAt.toISOString(),
  };
}

function formatFailureSummaryRows(
  rows: Array<{
    providerName: string;
    displayName: string;
    modelUsed: string;
    errorType: string | null;
    statusCode: number | null;
    count: number;
  }>
): string | null {
  if (rows.length === 0) {
    return null;
  }

  return rows
    .slice(0, 3)
    .map(row => {
      const providerLabel = row.displayName || row.providerName;
      const codeLabel =
        row.statusCode != null
          ? `HTTP ${row.statusCode}`
          : row.errorType
            ? row.errorType.replace(/_/g, " ")
            : "error";
      return `${providerLabel}/${row.modelUsed} → ${codeLabel} (${row.count})`;
    })
    .join("; ");
}

async function getAuditSignalStats(
  db: Awaited<ReturnType<typeof getDb>>,
  hours: number
): Promise<{ llm: AuditSignalStats; media: AuditSignalStats }> {
  const since = new Date(Date.now() - hours * 60 * 60 * 1000);

  const [llmRow] = await db
    .select({
      total: sql<number>`count(*)::int`,
      errorCount: sql<number>`count(*) filter (where ${providerUsageLog.errorType} is not null or coalesce(${providerUsageLog.statusCode}, 0) >= 400)::int`,
      serverErrorCount: sql<number>`count(*) filter (where coalesce(${providerUsageLog.statusCode}, 0) >= 500 or ${providerUsageLog.errorType} in ('timeout', 'server_error'))::int`,
      timeoutCount: sql<number>`count(*) filter (where ${providerUsageLog.errorType} = 'timeout')::int`,
      fallbackCount: sql<number>`count(*) filter (where ${providerUsageLog.wasFallback} = true)::int`,
      p95LatencyMs: sql<
        number | null
      >`percentile_cont(0.95) within group (order by ${providerUsageLog.responseTimeMs})`,
      avgLatencyMs: sql<
        number | null
      >`avg(${providerUsageLog.responseTimeMs})::float`,
      lastSeenAt: sql<string | null>`max(${providerUsageLog.createdAt})::text`,
    })
    .from(providerUsageLog)
    .where(gte(providerUsageLog.createdAt, since));

  const llmFailureRows = await db
    .select({
      providerName: llmProviders.providerName,
      displayName: llmProviders.displayName,
      modelUsed: providerUsageLog.modelUsed,
      errorType: providerUsageLog.errorType,
      statusCode: providerUsageLog.statusCode,
      count: sql<number>`count(*)::int`,
    })
    .from(providerUsageLog)
    .innerJoin(llmProviders, eq(providerUsageLog.providerId, llmProviders.id))
    .where(
      and(
        gte(providerUsageLog.createdAt, since),
        sql`(${providerUsageLog.errorType} is not null or coalesce(${providerUsageLog.statusCode}, 0) >= 400)`
      )
    )
    .groupBy(
      llmProviders.providerName,
      llmProviders.displayName,
      providerUsageLog.modelUsed,
      providerUsageLog.errorType,
      providerUsageLog.statusCode
    );

  llmFailureRows.sort((left, right) => {
    const countDelta = Number(right.count ?? 0) - Number(left.count ?? 0);
    if (countDelta !== 0) {
      return countDelta;
    }
    const providerDelta = left.displayName.localeCompare(right.displayName);
    if (providerDelta !== 0) {
      return providerDelta;
    }
    return left.modelUsed.localeCompare(right.modelUsed);
  });

  const [mediaRow] = await db
    .select({
      total: sql<number>`count(*)::int`,
      errorCount: sql<number>`count(*) filter (where ${apiAuditEvents.errorMessage} is not null or coalesce(${apiAuditEvents.statusCode}, 0) >= 400)::int`,
      serverErrorCount: sql<number>`count(*) filter (where coalesce(${apiAuditEvents.statusCode}, 0) >= 500)::int`,
      timeoutCount: sql<number>`count(*) filter (where ${apiAuditEvents.errorMessage} ilike '%timeout%')::int`,
      p95LatencyMs: sql<
        number | null
      >`percentile_cont(0.95) within group (order by ${apiAuditEvents.responseTimeMs})`,
      avgLatencyMs: sql<
        number | null
      >`avg(${apiAuditEvents.responseTimeMs})::float`,
      lastSeenAt: sql<string | null>`max(${apiAuditEvents.createdAt})::text`,
    })
    .from(apiAuditEvents)
    .where(gte(apiAuditEvents.createdAt, since));

  return {
    llm: {
      total: Number(llmRow?.total ?? 0),
      errorCount: Number(llmRow?.errorCount ?? 0),
      serverErrorCount: Number(llmRow?.serverErrorCount ?? 0),
      timeoutCount: Number(llmRow?.timeoutCount ?? 0),
      fallbackCount: Number(llmRow?.fallbackCount ?? 0),
      p95LatencyMs: toFiniteNumber(llmRow?.p95LatencyMs),
      avgLatencyMs: toFiniteNumber(llmRow?.avgLatencyMs),
      lastSeenAt: llmRow?.lastSeenAt ?? null,
      topFailureSummary: formatFailureSummaryRows(llmFailureRows),
    },
    media: {
      total: Number(mediaRow?.total ?? 0),
      errorCount: Number(mediaRow?.errorCount ?? 0),
      serverErrorCount: Number(mediaRow?.serverErrorCount ?? 0),
      timeoutCount: Number(mediaRow?.timeoutCount ?? 0),
      fallbackCount: 0,
      p95LatencyMs: toFiniteNumber(mediaRow?.p95LatencyMs),
      avgLatencyMs: toFiniteNumber(mediaRow?.avgLatencyMs),
      lastSeenAt: mediaRow?.lastSeenAt ?? null,
      topFailureSummary: null,
    },
  };
}

function enumerateDatesBetween(start: Date, end: Date): Date[] {
  const dates: Date[] = [];
  const cursor = new Date(
    Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate())
  );
  const finish = new Date(
    Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate())
  );

  while (cursor.getTime() <= finish.getTime()) {
    dates.push(new Date(cursor));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  return dates;
}

async function getRecentOrchestrationEntries(
  hours: number
): Promise<AuditLogEntry[]> {
  const now = new Date();
  const since = new Date(now.getTime() - hours * 60 * 60 * 1000);
  const dates = enumerateDatesBetween(since, now);
  const entries = (
    await Promise.all(
      dates.flatMap(date =>
        ORCHESTRATION_EVENT_TYPES.map(eventType =>
          auditLogger.readEntries({
            date,
            eventType,
            limit: ORCHESTRATION_READ_LIMIT_PER_TYPE,
            sortOrder: "desc",
          })
        )
      )
    )
  ).flat();

  const seen = new Set<string>();
  return entries.filter(entry => {
    const timestamp = entry?.timestamp
      ? new Date(entry.timestamp).getTime()
      : 0;
    if (!timestamp || timestamp < since.getTime()) return false;
    const key = `${entry.timestamp}|${entry.eventType}|${entry.traceId}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function getOrchestrationSignalStats(
  hours: number
): Promise<OrchestrationSignalStats> {
  const recentEntries = await getRecentOrchestrationEntries(hours);
  const classifyEntries = recentEntries.filter(
    entry => entry.eventType === "orchestration_classify"
  );
  const fallbackEntries = recentEntries.filter(
    entry => entry.eventType === "orchestration_fallback"
  );
  const qualityEntries = recentEntries.filter(
    entry => entry.eventType === "orchestration_quality_gate"
  );

  const classifyLatencyValues = classifyEntries
    .map(entry => toFiniteNumber(asRecord(entry.metadata)?.latencyMs))
    .filter((value): value is number => value != null);

  const fallbackReasons = new Map<string, number>();
  for (const entry of fallbackEntries) {
    const metadata = asRecord(entry.metadata);
    const reason = String(metadata?.reason ?? "").trim() || "unknown";
    fallbackReasons.set(reason, (fallbackReasons.get(reason) ?? 0) + 1);
  }

  const riskyQualityCount = qualityEntries.filter(entry => {
    const metadata = asRecord(entry.metadata);
    if (!metadata) return false;
    const pass = metadata.pass;
    const issues = Array.isArray(metadata.issues) ? metadata.issues : [];
    return pass === false || issues.length > 0;
  }).length;

  const avgClassifyLatencyMs =
    classifyLatencyValues.length > 0
      ? Math.round(
          classifyLatencyValues.reduce((sum, value) => sum + value, 0) /
            classifyLatencyValues.length
        )
      : null;

  const sortedReasons = Array.from(fallbackReasons.entries()).sort(
    (a, b) => b[1] - a[1] || a[0].localeCompare(b[0])
  );
  const lastSeenAt =
    recentEntries
      .map(entry => entry.timestamp)
      .filter((value): value is string => typeof value === "string")
      .sort()
      .at(-1) ?? null;

  return {
    totalEvents: recentEntries.length,
    classifyCount: classifyEntries.length,
    fallbackCount: fallbackEntries.length,
    qualityCount: qualityEntries.length,
    riskyQualityCount,
    avgClassifyLatencyMs,
    fallbackRate: ratioOrNull(fallbackEntries.length, classifyEntries.length),
    qualityRiskRate: ratioOrNull(riskyQualityCount, qualityEntries.length),
    topFallbackReason: sortedReasons[0]?.[0] ?? null,
    lastSeenAt,
  };
}

function getQueueSignalStats(): QueueSignalStats {
  const status = getQueueHealthStatus();
  const queueList = Array.isArray(status.queues) ? status.queues : [];
  const activeAlerts = Array.isArray(status.activeAlerts)
    ? status.activeAlerts
    : [];
  const hottestQueue =
    queueList
      .slice()
      .sort((a, b) => b.length - a.length || a.name.localeCompare(b.name))[0] ??
    null;

  return {
    available: true,
    healthy: status.healthy,
    activeAlertCount: activeAlerts.length,
    criticalAlertCount: activeAlerts.filter(
      alert => alert.severity === "critical"
    ).length,
    warningAlertCount: activeAlerts.filter(
      alert => alert.severity !== "critical"
    ).length,
    maxQueueDepth: hottestQueue?.length ?? null,
    hottestQueue: hottestQueue?.name ?? null,
    topMessage: activeAlerts[0]?.message ?? null,
    lastCheckAt: status.lastCheckAt,
  };
}

export async function getOpsOverview(opts?: {
  metricsHours?: number;
  auditHours?: number;
  orchestrationHours?: number;
}): Promise<OpsOverview> {
  const db = await getDb();
  const metricsHours = opts?.metricsHours ?? 6;
  const auditHours = opts?.auditHours ?? 6;
  const orchestrationHours = opts?.orchestrationHours ?? 6;
  const since = new Date(Date.now() - metricsHours * 60 * 60 * 1000);

  const [
    metricRows,
    latestCheck,
    alertCounts,
    latestOpenAlert,
    auditStats,
    orchestrationStats,
  ] = await Promise.all([
    db
      .select()
      .from(systemMetricsHistory)
      .where(gte(systemMetricsHistory.createdAt, since))
      .orderBy(desc(systemMetricsHistory.createdAt))
      .limit(500),
    db
      .select({ checkedAt: monitoringChecks.createdAt })
      .from(monitoringChecks)
      .orderBy(desc(monitoringChecks.createdAt))
      .limit(1)
      .then(rows => rows[0] ?? null),
    getAlertCounts(db),
    getLatestOpenAlertContext(db),
    getAuditSignalStats(db, auditHours),
    getOrchestrationSignalStats(orchestrationHours),
  ]);

  const latestMetrics = (metricRows[0] as MetricPoint | undefined) ?? null;
  const baselineMetrics =
    (metricRows[metricRows.length - 1] as MetricPoint | undefined) ?? null;

  return deriveOpsOverview({
    latestMetrics,
    previousMetrics: (metricRows[1] as MetricPoint | undefined) ?? null,
    baselineMetrics,
    lastCheckAt: latestCheck?.checkedAt ?? null,
    services: extractServices(
      (latestMetrics?.serviceStatuses as
        | Record<string, unknown>
        | null
        | undefined) ?? null
    ),
    unackedAlerts: alertCounts,
    latestOpenAlert,
    llmStats: auditStats.llm,
    mediaStats: auditStats.media,
    orchestrationStats,
    queueStats: getQueueSignalStats(),
    windows: { metricsHours, auditHours, orchestrationHours },
  });
}

function anomalyCooldownMinutes(anomaly: OpsAnomaly): number {
  if (anomaly.severity === "critical") {
    return 15;
  }
  return DEFAULT_ANOMALY_ALERT_COOLDOWN_MINUTES;
}

async function hasRecentOpsAlert(
  db: Awaited<ReturnType<typeof getDb>>,
  dedupeKey: string,
  since: Date
): Promise<boolean> {
  const rows = await db
    .select({ id: monitoringAlerts.id })
    .from(monitoringAlerts)
    .where(
      and(
        gte(monitoringAlerts.createdAt, since),
        sql`${monitoringAlerts.metadata}->>'source' = 'ops_overview'`,
        sql`${monitoringAlerts.metadata}->>'dedupeKey' = ${dedupeKey}`
      )
    )
    .limit(1);

  return rows.length > 0;
}

async function hasOpenOpsAlert(
  db: Awaited<ReturnType<typeof getDb>>,
  dedupeKey: string
): Promise<boolean> {
  const rows = await db
    .select({ id: monitoringAlerts.id })
    .from(monitoringAlerts)
    .where(
      and(
        eq(monitoringAlerts.acknowledged, false),
        sql`${monitoringAlerts.metadata}->>'source' = 'ops_overview'`,
        sql`${monitoringAlerts.metadata}->>'dedupeKey' = ${dedupeKey}`
      )
    )
    .limit(1);

  return rows.length > 0;
}

async function notifyAdminsAboutAnomaly(
  db: Awaited<ReturnType<typeof getDb>>,
  anomaly: OpsAnomaly,
  dedupeKey: string
): Promise<number> {
  const admins = await db
    .select({ id: users.id })
    .from(users)
    .where(inArray(users.role, ["admin", "domain_admin"]));

  if (admins.length === 0) {
    return 0;
  }

  const { createNotification } = await import("./notificationService");
  let sent = 0;
  const incidentActionUrl = `/admin/dashboard?incident=${encodeURIComponent(dedupeKey)}`;

  for (const admin of admins) {
    const result = await createNotification({
      db,
      userId: admin.id,
      type: "alert",
      title: anomaly.title,
      content:
        `${anomaly.message}${anomaly.recommendation ? ` Recommended: ${anomaly.recommendation}` : ""}`.trim(),
      priority: anomaly.severity === "critical" ? "critical" : "high",
      relatedResourceType: "system_health",
      relatedResourceId: dedupeKey,
      actionUrl: incidentActionUrl,
      actionLabel: "Open Incident",
      groupKey: dedupeKey,
      metadata: {
        source: "guardian.ops_overview",
        signal: anomaly.signal,
        recommendation: anomaly.recommendation,
        observedAt: anomaly.observedAt,
        relatedItems: {
          anomalyId: anomaly.id,
          category: anomaly.category,
          severity: anomaly.severity,
        },
      },
    });
    if (result) {
      sent += 1;
    }
  }

  return sent;
}

export async function syncOpsAlerts(opts?: {
  includeWarnings?: boolean;
  overview?: OpsOverview;
}): Promise<{
  overview: OpsOverview;
  emittedAlerts: number;
  emittedNotifications: number;
  skippedAsDuplicate: number;
}> {
  const db = await getDb();
  const overview = opts?.overview ?? (await getOpsOverview());
  const candidates = overview.anomalies.filter(anomaly =>
    opts?.includeWarnings ? true : anomaly.severity === "critical"
  );

  let emittedAlerts = 0;
  let emittedNotifications = 0;
  let skippedAsDuplicate = 0;

  for (const anomaly of candidates) {
    const dedupeKey = buildOpsAlertDedupeKey(anomaly, overview);
    const cooldownMinutes = anomalyCooldownMinutes(anomaly);
    const cooldownSince = new Date(Date.now() - cooldownMinutes * 60_000);
    const duplicate = shouldSkipOpsAlertEmission(
      await hasOpenOpsAlert(db, dedupeKey),
      await hasRecentOpsAlert(db, dedupeKey, cooldownSince)
    );
    if (duplicate) {
      skippedAsDuplicate += 1;
      continue;
    }

    await db.insert(monitoringAlerts).values({
      severity: anomaly.severity,
      title: anomaly.title,
      message: anomaly.message,
      channel: "log",
      metadata: {
        source: "ops_overview",
        dedupeKey,
        anomalyId: anomaly.id,
        category: anomaly.category,
        anomalyType: anomaly.type,
        signal: anomaly.signal,
        recommendation: anomaly.recommendation,
        observedAt: anomaly.observedAt,
      },
    });
    emittedAlerts += 1;

    if (anomaly.severity === "critical") {
      emittedNotifications += await notifyAdminsAboutAnomaly(
        db,
        anomaly,
        dedupeKey
      );
    }
  }

  return {
    overview,
    emittedAlerts,
    emittedNotifications,
    skippedAsDuplicate,
  };
}

export async function getOpsIncidentTimeline(
  tenantId: string,
  opts?: { limit?: number; groupKey?: string }
): Promise<{ items: OpsIncidentTimelineItem[]; lastCheckAt: string | null }> {
  const db = await getDb();
  const limit = Math.min(Math.max(opts?.limit ?? 6, 1), 20);

  const [latestCheckRow, recentAlerts] = await Promise.all([
    db
      .select({ checkedAt: monitoringChecks.createdAt })
      .from(monitoringChecks)
      .orderBy(desc(monitoringChecks.createdAt))
      .limit(1),
    db
      .select()
      .from(monitoringAlerts)
      .orderBy(desc(monitoringAlerts.createdAt))
      .limit(Math.max(limit * 12, 96)),
  ]);

  const opsAlerts = recentAlerts.filter(alert => {
    const groupKey = getOpsAlertGroupKey(alert);
    if (!groupKey) return false;
    if (opts?.groupKey) {
      return groupKey === opts.groupKey;
    }
    return true;
  });
  const groupKeys = Array.from(
    new Set(
      opsAlerts
        .map(alert => getOpsAlertGroupKey(alert))
        .filter(
          (value): value is string =>
            typeof value === "string" && value.length > 0
        )
    )
  );

  const tenantUserFilter = sql`"userId" IN (
    SELECT id FROM users
    WHERE "currentTenantId" = (SELECT id FROM tenants WHERE id = ${tenantId} LIMIT 1)::integer
  )`;

  const notificationRows =
    groupKeys.length === 0
      ? []
      : await db
          .select({
            id: userNotifications.id,
            title: userNotifications.title,
            priority: userNotifications.priority,
            isRead: userNotifications.isRead,
            createdAt: userNotifications.createdAt,
            lastOccurredAt: userNotifications.lastOccurredAt,
            occurrenceCount: userNotifications.occurrenceCount,
            groupKey: userNotifications.groupKey,
          })
          .from(userNotifications)
          .where(
            and(
              tenantUserFilter,
              inArray(userNotifications.groupKey, groupKeys),
              sql`${userNotifications.metadata}->>'source' = 'guardian.ops_overview'`
            )
          )
          .orderBy(desc(userNotifications.createdAt))
          .limit(Math.max(groupKeys.length * 8, 64));

  const lastCheckAt = latestCheckRow[0]?.checkedAt?.toISOString?.() ?? null;

  return {
    items: buildOpsIncidentTimeline({
      alerts: opsAlerts,
      notifications: notificationRows,
      lastCheckAt,
      limit,
    }),
    lastCheckAt,
  };
}

/**
 * Aggregate current system status from latest metrics row + unacknowledged alerts.
 */
export async function getCurrentStatus(): Promise<{
  services: ServiceStatus[];
  alerts: { critical: number; warning: number };
  lastCheck: string | null;
}> {
  const db = await getDb();

  // Latest metrics row
  const [latestMetrics] = await db
    .select()
    .from(systemMetricsHistory)
    .orderBy(desc(systemMetricsHistory.createdAt))
    .limit(1);

  // Latest check timestamp
  const [latestCheck] = await db
    .select({ checkedAt: monitoringChecks.createdAt })
    .from(monitoringChecks)
    .orderBy(desc(monitoringChecks.createdAt))
    .limit(1);

  const alertCounts = await getAlertCounts(db);
  const critical = alertCounts.critical + alertCounts.error;
  const warning = alertCounts.warning;

  // Extract service statuses from latest metrics
  let services = extractServices(
    (latestMetrics?.serviceStatuses as
      | Record<string, unknown>
      | null
      | undefined) ?? null
  );
  const lastCheckIso = latestCheck?.checkedAt
    ? new Date(latestCheck.checkedAt).toISOString()
    : null;
  const lastCheckAgeMinutes = latestCheck?.checkedAt
    ? (Date.now() - new Date(latestCheck.checkedAt).getTime()) / 60_000
    : null;

  if (lastCheckAgeMinutes != null && lastCheckAgeMinutes > 30) {
    services = services.map(service => ({
      ...service,
      lastKnownStatus: service.status,
      status: "stale",
      staleMinutes: Math.round(lastCheckAgeMinutes),
      staleSince: lastCheckIso,
    }));
  }

  return {
    services,
    alerts: { critical, warning },
    lastCheck: lastCheckIso,
  };
}
