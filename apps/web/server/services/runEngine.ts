/**
 * Run Engine — orchestrated execution lifecycle for team conversations.
 *
 * Manages start, pause, resume, stop, stop-policy evaluation,
 * and per-agent budget tracking.
 */

import { eq, and, sql, count, desc, inArray, isNull, or } from "drizzle-orm";
import { getDb } from "../db";
import {
  teamRuns,
  teamRooms,
  teamRoomMessages,
  assistantProfiles,
  agentActivityEvents,
  agentRunSummaries,
  teamWorkItems,
  workers,
  type TeamRun,
  type StopPolicy,
  type BudgetSnapshot,
} from "../../drizzle/schema";
import crypto from "crypto";
import { getCoordinatorProfile } from "./turnOrderEngine";
import * as workItemService from "./workItemService";
import * as roomService from "./roomService";
import * as monitoringService from "./monitoringService";
import { queueWorkerJobByRuntime } from "./workerSchedulerService";
import type { QueueWorkerJobByRuntimeInput } from "./workerSchedulerService";
import { agencyAgents, personaTemplates } from "../../drizzle/schema";
import { getNextSpeaker, type TurnStrategy } from "./turnOrderEngine";
import type { WorkItemStatus } from "./workItemService";
import { routeRoomIntent } from "./roomIntentRouter";
import { executeTeamRunSkillTurn } from "./teamRunSkillExecutor";
import { sanitizeMessageRuntimeMetadata } from "./localAiRuntimeMetadata";
import { describeStatusBridge, type StatusBridge } from "./workStatusBridge";

// ─── Types ──────────────────────────────────────────────────────────────────

export type StopPolicyInput = StopPolicy;

export interface StopEvaluation {
  shouldStop: boolean;
  reason: string | null;
}

export interface RunStatusBridge extends StatusBridge {}

export interface StartRunInput {
  roomId: string;
  tenantId: string;
  initiatedByUserId: number;
  executionMode: "team_chat" | "auto_team" | "review";
  objective: string;
  stopPolicy: StopPolicyInput;
  constraintsJson?: Record<string, unknown>;
  approvalPolicyJson?: Record<string, unknown>;
}

export interface TurnCost {
  inputTokens: number;
  outputTokens: number;
  costCredits: number;
}

export interface RunTurnResult {
  runId: string;
  roomId: string;
  teamId: string;
  assistantId: string;
  nextAssistantId: string | null;
  nextSpeakerReason: string | null;
  content: string;
  tokenUsage: { inputTokens: number; outputTokens: number };
  costCredits: number;
  nextSpeakerHint?: string;
  messageId: string;
}

export interface AutoLoopWorkItemSnapshot {
  status: WorkItemStatus;
  assignedMemberKind?: "assistant" | "human" | "external_connector" | null;
  reviewerMemberKind?: "assistant" | "human" | "external_connector" | null;
  approverMemberKind?: "assistant" | "human" | "external_connector" | null;
}

export interface AutoTeamLoopDecision {
  continueLoop: boolean;
  pauseRun: boolean;
  reason: "awaiting_human_approval" | "awaiting_external_member" | "no_actionable_work_items" | null;
}

export interface ExternalConnectorDispatchCandidate {
  workItemId: string;
  externalWorkerId: string;
  runtimeType: "openclaw_gateway" | "hermes_agent_gateway";
  memberId: string;
  title: string;
  objective: string | null;
  status: WorkItemStatus;
  threadRootMessageId: string | null;
}

// ─── Constants ──────────────────────────────────────────────────────────────

export const DEFAULT_STOP_POLICY: StopPolicyInput = {
  maxRounds: 20,
  maxDurationMinutes: 30,
  maxBudgetCredits: 100,
  stopOnConsensus: false,
  stopOnArtifactReady: false,
  stopOnLeadSummary: true,
  requireFinalSummary: true,
  idleTimeoutSeconds: 120,
};

const MAX_CONCURRENT_RUNS_PER_USER = 3;
const MAX_CONCURRENT_RUNS_PER_TENANT = 10;
const INITIAL_WORK_ITEM_TITLE_LIMIT = 120;
const AUTO_TEAM_INITIAL_TURNS = 3;
const MAX_ADVANCE_TURNS = 5;
const AUTO_TEAM_CONTINUATION_DELAY_MS = 200;
const activeTurnExecutions = new Set<string>();
const activeAutoAdvanceTimers = new Map<string, ReturnType<typeof setTimeout>>();

// ─── Budget Tracking (pure functions, exported for testing) ─────────────────

export function initBudgetSnapshot(): BudgetSnapshot {
  return {
    totalCreditsUsed: 0,
    perAgent: {},
  };
}

export function deriveInitialWorkItemTitle(objective: string): string {
  const normalized = objective.replace(/\s+/g, " ").trim();
  if (!normalized) return "Run kickoff task";
  const truncated = normalized.length > INITIAL_WORK_ITEM_TITLE_LIMIT
    ? `${normalized.slice(0, INITIAL_WORK_ITEM_TITLE_LIMIT - 3).trimEnd()}...`
    : normalized;
  return `Kickoff: ${truncated}`;
}

export function mapExecutionModeToTurnStrategy(
  executionMode: StartRunInput["executionMode"] | TeamRun["executionMode"],
): TurnStrategy {
  switch (executionMode) {
    case "team_chat":
      return "handoff";
    case "review":
      return "priority";
    case "auto_team":
    default:
      return "lead_directed";
  }
}

export function shouldContinueAutoTeamLoop(params: {
  runStatus: TeamRun["status"] | "idle";
  executionMode: StartRunInput["executionMode"] | TeamRun["executionMode"];
  completedTurns: number;
  shouldStop: boolean;
}): boolean {
  return (
    params.runStatus === "running" &&
    params.executionMode === "auto_team" &&
    params.completedTurns > 0 &&
    !params.shouldStop
  );
}

function getResponsibleMemberKind(
  workItem: AutoLoopWorkItemSnapshot,
): "assistant" | "human" | "external_connector" | null {
  switch (workItem.status) {
    case "in_review":
      return workItem.reviewerMemberKind ?? null;
    case "awaiting_approval":
      return workItem.approverMemberKind ?? null;
    case "planned":
    case "in_progress":
    case "needs_revision":
    case "blocked":
    default:
      return workItem.assignedMemberKind ?? null;
  }
}

function getResponsibleMemberId(workItem: {
  status: WorkItemStatus;
  assignedMemberId: string | null;
  reviewerMemberId: string | null;
  approverMemberId: string | null;
}): string | null {
  switch (workItem.status) {
    case "in_review":
      return workItem.reviewerMemberId ?? null;
    case "awaiting_approval":
      return workItem.approverMemberId ?? null;
    case "planned":
    case "in_progress":
    case "needs_revision":
    case "blocked":
    default:
      return workItem.assignedMemberId ?? null;
  }
}

function isAssistantActionableWorkItem(workItem: AutoLoopWorkItemSnapshot): boolean {
  const responsibleMemberKind = getResponsibleMemberKind(workItem);
  switch (workItem.status) {
    case "planned":
    case "in_progress":
    case "needs_revision":
    case "blocked":
    case "in_review":
      return responsibleMemberKind !== "human" && responsibleMemberKind !== "external_connector";
    case "awaiting_approval":
      return responsibleMemberKind === null || responsibleMemberKind === "assistant";
    default:
      return false;
  }
}

export function evaluateAutoTeamLoopDecision(params: {
  runStatus: TeamRun["status"] | "idle";
  executionMode: StartRunInput["executionMode"] | TeamRun["executionMode"];
  completedTurns: number;
  shouldStop: boolean;
  openWorkItems: AutoLoopWorkItemSnapshot[];
}): AutoTeamLoopDecision {
  const baseContinuation = shouldContinueAutoTeamLoop({
    runStatus: params.runStatus,
    executionMode: params.executionMode,
    completedTurns: params.completedTurns,
    shouldStop: params.shouldStop,
  });

  if (!baseContinuation) {
    return { continueLoop: false, pauseRun: false, reason: null };
  }

  if (params.openWorkItems.some((workItem) => isAssistantActionableWorkItem(workItem))) {
    return { continueLoop: true, pauseRun: false, reason: null };
  }

  const waitingForHuman = params.openWorkItems.some(
    (workItem) => getResponsibleMemberKind(workItem) === "human",
  );
  if (waitingForHuman) {
    return { continueLoop: false, pauseRun: true, reason: "awaiting_human_approval" };
  }

  const waitingForExternal = params.openWorkItems.some(
    (workItem) => getResponsibleMemberKind(workItem) === "external_connector",
  );
  if (waitingForExternal) {
    return { continueLoop: false, pauseRun: true, reason: "awaiting_external_member" };
  }

  return { continueLoop: false, pauseRun: false, reason: "no_actionable_work_items" };
}

export function resolveExternalConnectorDispatchCandidates(params: {
  workItems: Array<{
    id: string;
    title: string;
    objective: string | null;
    status: WorkItemStatus;
    threadRootMessageId: string | null;
    assignedMemberId: string | null;
    reviewerMemberId: string | null;
    approverMemberId: string | null;
  }>;
  memberBindings: Record<string, {
    memberKind: "assistant" | "human" | "external_connector";
    externalWorkerId: string | null;
    externalWorkerRuntimeType?: string | null;
  }>;
}): ExternalConnectorDispatchCandidate[] {
  const candidates: ExternalConnectorDispatchCandidate[] = [];
  const seen = new Set<string>();

  for (const workItem of params.workItems) {
    const memberId = getResponsibleMemberId(workItem);
    if (!memberId) continue;

    const binding = params.memberBindings[memberId];
    if (!binding || binding.memberKind !== "external_connector" || !binding.externalWorkerId) {
      continue;
    }

    const runtimeType = binding.externalWorkerRuntimeType === "hermes_agent_gateway"
      ? "hermes_agent_gateway"
      : binding.externalWorkerRuntimeType === "openclaw_gateway" || binding.externalWorkerRuntimeType == null
        ? "openclaw_gateway"
        : null;
    if (!runtimeType) {
      continue;
    }

    const dedupeKey = `${workItem.id}:${binding.externalWorkerId}`;
    if (seen.has(dedupeKey)) {
      continue;
    }
    seen.add(dedupeKey);

    candidates.push({
      workItemId: workItem.id,
      externalWorkerId: binding.externalWorkerId,
      runtimeType,
      memberId,
      title: workItem.title,
      objective: workItem.objective ?? null,
      status: workItem.status,
      threadRootMessageId: workItem.threadRootMessageId ?? null,
    });
  }

  return candidates;
}

export function buildExternalConnectorDispatchJobInput(params: {
  tenantId: string;
  run: Pick<TeamRun, "id" | "roomId" | "teamId" | "initiatedByUserId">;
  candidate: ExternalConnectorDispatchCandidate;
}): QueueWorkerJobByRuntimeInput {
  const { tenantId, run, candidate } = params;
  const sharedInput = {
    tenantId,
    teamId: run.teamId,
    workflowRunId: run.id,
    requestedByUserId: run.initiatedByUserId,
    requestedBySystemComponent: "run_engine" as const,
    jobType: "external_agent_task" as const,
    title: candidate.title,
    description: candidate.objective ?? `External connector follow-up for ${candidate.title}`,
    priority: 50,
    inputJson: {
      roomId: run.roomId,
      runId: run.id,
      teamId: run.teamId,
      workItemId: candidate.workItemId,
      threadRootMessageId: candidate.threadRootMessageId,
      workItemStatus: candidate.status,
    },
    instructionsJson: {
      intent: "external_connector_follow_up",
      externalWorkerId: candidate.externalWorkerId,
    },
    idempotencyKey: `run:${run.id}:work-item:${candidate.workItemId}:worker:${candidate.externalWorkerId}`,
    preferredWorkerId: candidate.externalWorkerId,
    reservedCredits: 10,
  };

  if (candidate.runtimeType === "hermes_agent_gateway") {
    return {
      runtimeType: "hermes_agent_gateway",
      capabilityFamilies: ["artifact-producing-session"],
      ...sharedInput,
    };
  }

  return {
    runtimeType: "openclaw_gateway",
    capabilityFamilies: ["artifact-producing-session"],
    ...sharedInput,
  };
}

function normalizeAssistantTurnContent(content: string | null | undefined): string {
  const normalized = (content ?? "").trim();
  return normalized.length > 0 ? normalized : "[No response generated]";
}

function clearQueuedAutoAdvance(runId: string): void {
  const timeout = activeAutoAdvanceTimers.get(runId);
  if (!timeout) return;
  clearTimeout(timeout);
  activeAutoAdvanceTimers.delete(runId);
}

function isIgnorableAutoAdvanceError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return (
    message.includes("already advancing") ||
    message.includes("must be 'running' to advance") ||
    message.includes("not found")
  );
}

async function listOpenAutoLoopWorkItems(params: {
  db: NonNullable<Awaited<ReturnType<typeof getDb>>>;
  roomId: string;
  runId: string;
  tenantId: string;
  startedAt: Date | null;
}): Promise<AutoLoopWorkItemSnapshot[]> {
  const { db, roomId, runId, tenantId, startedAt } = params;
  const workItems = await db
    .select({
      status: teamWorkItems.status,
      assignedMemberId: teamWorkItems.assignedMemberId,
      reviewerMemberId: teamWorkItems.reviewerMemberId,
      approverMemberId: teamWorkItems.approverMemberId,
      supersededByWorkItemId: teamWorkItems.supersededByWorkItemId,
      runId: teamWorkItems.runId,
      createdAt: teamWorkItems.createdAt,
    })
    .from(teamWorkItems)
    .where(
      and(
        eq(teamWorkItems.roomId, roomId),
        eq(teamWorkItems.tenantId, tenantId),
      ),
    );

  const openStatuses = new Set<WorkItemStatus>([
    "planned",
    "in_progress",
    "in_review",
    "needs_revision",
    "awaiting_approval",
    "blocked",
  ]);

  const currentItems = workItems.filter((workItem) => {
    if (workItem.supersededByWorkItemId) return false;
    if (!openStatuses.has(workItem.status as WorkItemStatus)) return false;
    if (workItem.runId === runId) return true;
    if (workItem.runId == null && startedAt && workItem.createdAt >= startedAt) return true;
    return false;
  });

  if (currentItems.length === 0) return [];

  const memberIds = Array.from(new Set(
    currentItems.flatMap((workItem) => [
      workItem.assignedMemberId,
      workItem.reviewerMemberId,
      workItem.approverMemberId,
    ]).filter((value): value is string => Boolean(value)),
  ));

  const memberKinds = new Map<string, "assistant" | "human" | "external_connector">();
  if (memberIds.length > 0) {
    const profiles = await db
      .select({
        id: assistantProfiles.id,
        memberKind: assistantProfiles.memberKind,
      })
      .from(assistantProfiles)
      .where(
        and(
          eq(assistantProfiles.tenantId, tenantId),
          inArray(assistantProfiles.id, memberIds),
        ),
      );

    for (const profile of profiles) {
      memberKinds.set(profile.id, profile.memberKind as "assistant" | "human" | "external_connector");
    }
  }

  return currentItems.map((workItem) => ({
    status: workItem.status as WorkItemStatus,
    assignedMemberKind: workItem.assignedMemberId ? memberKinds.get(workItem.assignedMemberId) ?? null : null,
    reviewerMemberKind: workItem.reviewerMemberId ? memberKinds.get(workItem.reviewerMemberId) ?? null : null,
    approverMemberKind: workItem.approverMemberId ? memberKinds.get(workItem.approverMemberId) ?? null : null,
  }));
}

function queueAutoAdvance(
  runId: string,
  tenantId: string,
  maxTurns: number,
  delayMs: number = 0,
): void {
  if (activeAutoAdvanceTimers.has(runId)) return;

  const timeout = setTimeout(() => {
    activeAutoAdvanceTimers.delete(runId);
    advanceRun(runId, tenantId, maxTurns).catch((error) => {
      if (isIgnorableAutoAdvanceError(error)) return;
      console.warn("Auto advance run failed", {
        runId,
        tenantId,
        error: error instanceof Error ? error.message : String(error),
      });
    });
  }, delayMs);

  activeAutoAdvanceTimers.set(runId, timeout);
}

async function resolveAssistantTurnContext(
  db: NonNullable<Awaited<ReturnType<typeof getDb>>>,
  assistantId: string,
) {
  const [row] = await db
    .select({
      profile: assistantProfiles,
      personaName: personaTemplates.name,
      personaPrompt: personaTemplates.systemPromptPrefix,
      agentInstructions: agencyAgents.instructions,
      agentModel: agencyAgents.model,
    })
    .from(assistantProfiles)
    .leftJoin(personaTemplates, eq(personaTemplates.id, assistantProfiles.personaId))
    .leftJoin(agencyAgents, eq(agencyAgents.id, assistantProfiles.agencyAgentId))
    .where(eq(assistantProfiles.id, assistantId))
    .limit(1);

  return row ?? null;
}

function buildPersonaContext(row: Awaited<ReturnType<typeof resolveAssistantTurnContext>>): string | undefined {
  if (!row) return undefined;

  const sections = [
    row.profile.displayName ? `Display name: ${row.profile.displayName}` : null,
    row.profile.roleTitle ? `Role: ${row.profile.roleTitle}` : null,
    row.personaName ? `Persona: ${row.personaName}` : null,
    row.profile.memberRole ? `Team role: ${row.profile.memberRole}` : null,
    row.profile.preferredLanguage ? `Preferred language: ${row.profile.preferredLanguage}` : null,
    row.profile.specialtyTags?.length ? `Specialties: ${row.profile.specialtyTags.join(", ")}` : null,
    row.agentInstructions ? `Agent instructions: ${row.agentInstructions}` : null,
    row.personaPrompt ? `Persona guidance: ${row.personaPrompt}` : null,
  ].filter((value): value is string => Boolean(value && value.trim().length > 0));

  if (sections.length === 0) return undefined;
  return sections.join("\n");
}

async function resolveCurrentAssistantId(
  db: NonNullable<Awaited<ReturnType<typeof getDb>>>,
  run: TeamRun,
): Promise<string> {
  if (run.activeAssistantId) return run.activeAssistantId;

  const candidates = await db
    .select()
    .from(assistantProfiles)
    .where(
      and(
        eq(assistantProfiles.teamId, run.teamId),
        eq(assistantProfiles.memberKind, "assistant"),
        eq(assistantProfiles.isActive, true),
      ),
    )
    .orderBy(assistantProfiles.sortOrder);

  const coordinator = getCoordinatorProfile(candidates);
  if (!coordinator) {
    throw new Error("No active assistant available for run");
  }
  return coordinator.id;
}

async function initializeRunWorkContext(params: {
  tenantId: string;
  roomId: string;
  teamId: string;
  runId: string;
  objective: string;
  initiatedByUserId: number;
  coordinatorAssistantId?: string | null;
}): Promise<void> {
  const kickoffWorkItem = await workItemService.createWorkItem({
    tenantId: params.tenantId,
    teamId: params.teamId,
    roomId: params.roomId,
    runId: params.runId,
    sourceType: "run_objective",
    sourceRef: `run:${params.runId}`,
    title: deriveInitialWorkItemTitle(params.objective),
    objective: params.objective,
    status: "planned",
    priority: "high",
    riskClass: "medium",
    actorAssistantId: params.coordinatorAssistantId ?? undefined,
    actorUserId: params.initiatedByUserId,
    autoAssignByRole: true,
  });

  const kickoffPrepared = roomService.prepareWorkUpdate({
    roomId: params.roomId,
    tenantId: params.tenantId,
    senderAssistantId: "system",
    runId: params.runId,
    workItemId: kickoffWorkItem.id,
    messageType: "work_update",
    content: `Run started. Objective: ${params.objective}`,
    sensitivity: "medium",
  });

  const kickoffMessage = await roomService.sendMessage({
    roomId: params.roomId,
    tenantId: params.tenantId,
    senderType: "system",
    senderUserId: params.initiatedByUserId,
    recipientType: "all",
    runId: params.runId,
    turnType: kickoffPrepared.turnType,
    visibility: kickoffPrepared.visibility,
    content: kickoffPrepared.content,
    summaryContent: kickoffPrepared.summaryContent,
    artifactRefsJson: kickoffPrepared.artifactRefsJson,
    memoryRefsJson: kickoffPrepared.memoryRefsJson,
    metadataJson: kickoffPrepared.metadataJson,
  });

  const attachedWorkItem = await workItemService.setThreadRootMessageId(
    kickoffWorkItem.id,
    kickoffMessage.id,
    params.tenantId,
  );

  if (!params.coordinatorAssistantId) {
    return;
  }

  const routed = await workItemService.routeWorkItemByRole({
    tenantId: params.tenantId,
    workItemId: attachedWorkItem.id,
    expectedRevisionVersion: attachedWorkItem.revisionVersion,
    actorAssistantId: params.coordinatorAssistantId,
    targetStep: "research",
  });

  const routePrepared = roomService.prepareWorkUpdate({
    roomId: params.roomId,
    tenantId: params.tenantId,
    senderAssistantId: "system",
    runId: params.runId,
    workItemId: routed.workItem.id,
    messageType: "decision",
    replyToMessageId: kickoffMessage.id,
    threadRootMessageId: kickoffMessage.id,
    content: `Orchestrator routed kickoff work item to ${routed.targetStep} stage.`,
    sensitivity: "medium",
  });

  await roomService.sendMessage({
    roomId: params.roomId,
    tenantId: params.tenantId,
    senderType: "system",
    senderUserId: params.initiatedByUserId,
    recipientType: "all",
    runId: params.runId,
    turnType: routePrepared.turnType,
    visibility: routePrepared.visibility,
    content: routePrepared.content,
    summaryContent: routePrepared.summaryContent,
    artifactRefsJson: routePrepared.artifactRefsJson,
    memoryRefsJson: routePrepared.memoryRefsJson,
    metadataJson: routePrepared.metadataJson,
  });
}

async function autoPauseRunForDependency(params: {
  run: TeamRun;
  tenantId: string;
  reason: "awaiting_human_approval" | "awaiting_external_member";
}): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const [updated] = await db
    .update(teamRuns)
    .set({ status: "paused", stopReason: params.reason })
    .where(eq(teamRuns.id, params.run.id))
    .returning();

  stopAutoStopChecker(params.run.id);
  clearQueuedAutoAdvance(params.run.id);

  const explanation = params.reason === "awaiting_human_approval"
    ? "Auto-paused the run because the current workflow is waiting for a human member to review or approve the next step."
    : "Auto-paused the run because the current workflow is waiting for an external connector member to respond.";

  const prepared = roomService.prepareWorkUpdate({
    roomId: params.run.roomId,
    tenantId: params.tenantId,
    senderAssistantId: "system",
    runId: params.run.id,
    messageType: "decision",
    content: explanation,
    sensitivity: "medium",
    metadataJson: {
      autoPauseReason: params.reason,
      runStatus: "paused",
    },
  });

  await roomService.sendMessage({
    roomId: params.run.roomId,
    tenantId: params.tenantId,
    senderType: "system",
    senderUserId: params.run.initiatedByUserId,
    recipientType: "all",
    runId: params.run.id,
    turnType: prepared.turnType,
    visibility: prepared.visibility,
    content: prepared.content,
    summaryContent: prepared.summaryContent,
    artifactRefsJson: prepared.artifactRefsJson,
    memoryRefsJson: prepared.memoryRefsJson,
    metadataJson: prepared.metadataJson,
  });

  try {
    if (params.reason === "awaiting_external_member") {
      const workItems = await db
        .select({
          id: teamWorkItems.id,
          title: teamWorkItems.title,
          objective: teamWorkItems.objective,
          status: teamWorkItems.status,
          threadRootMessageId: teamWorkItems.threadRootMessageId,
          assignedMemberId: teamWorkItems.assignedMemberId,
          reviewerMemberId: teamWorkItems.reviewerMemberId,
          approverMemberId: teamWorkItems.approverMemberId,
        })
        .from(teamWorkItems)
        .where(
          and(
            eq(teamWorkItems.roomId, params.run.roomId),
            eq(teamWorkItems.tenantId, params.tenantId),
            or(eq(teamWorkItems.runId, params.run.id), isNull(teamWorkItems.runId)),
          ),
        );

      const memberIds = Array.from(new Set(
        workItems.flatMap((workItem) => [
          workItem.assignedMemberId,
          workItem.reviewerMemberId,
          workItem.approverMemberId,
        ]).filter((value): value is string => Boolean(value)),
      ));

      const memberBindings = memberIds.length === 0
        ? []
        : await db
            .select({
              id: assistantProfiles.id,
              memberKind: assistantProfiles.memberKind,
              externalWorkerId: assistantProfiles.externalWorkerId,
              externalWorkerRuntimeType: workers.runtimeType,
            })
            .from(assistantProfiles)
            .leftJoin(
              workers,
              and(
                eq(workers.id, assistantProfiles.externalWorkerId),
                eq(workers.tenantId, params.tenantId),
              ),
            )
            .where(
              and(
                eq(assistantProfiles.tenantId, params.tenantId),
                inArray(assistantProfiles.id, memberIds),
              ),
            );

      const dispatchCandidates = resolveExternalConnectorDispatchCandidates({
        workItems: workItems.map((workItem) => ({
          ...workItem,
          status: workItem.status as WorkItemStatus,
        })),
        memberBindings: Object.fromEntries(
            memberBindings.map((member) => [
              member.id,
              {
                memberKind: member.memberKind as "assistant" | "human" | "external_connector",
                externalWorkerId: member.externalWorkerId ?? null,
                externalWorkerRuntimeType: member.externalWorkerRuntimeType ?? null,
              },
            ]),
        ),
      });

      await Promise.all(
        dispatchCandidates.map((candidate) =>
          queueWorkerJobByRuntime(buildExternalConnectorDispatchJobInput({
            tenantId: params.tenantId,
            run: params.run,
            candidate,
          })).catch((error) => {
            console.warn("External connector worker dispatch failed", {
              runId: params.run.id,
              workItemId: candidate.workItemId,
              workerId: candidate.externalWorkerId,
              error: error instanceof Error ? error.message : String(error),
            });
            return null;
          }),
        ),
      );
    }

    const { publishEvent, createEvent } = await import("./orchestratorEventBus");
    await publishEvent(createEvent("status_change", {
      tenantId: params.tenantId,
      teamId: params.run.teamId,
      roomId: params.run.roomId,
      runId: params.run.id,
      actorType: "system",
      actorId: "system",
      data: {
        fromStatus: params.run.status,
        toStatus: updated?.status ?? "paused",
        reason: params.reason,
      },
      userId: params.run.initiatedByUserId,
    }));
  } catch {
    // Best-effort realtime event
  }
}

export function accumulateBudget(
  snapshot: BudgetSnapshot,
  agentId: string,
  cost: TurnCost,
): BudgetSnapshot {
  const existing = snapshot.perAgent[agentId] ?? {
    creditsUsed: 0,
    inputTokens: 0,
    outputTokens: 0,
    turnCount: 0,
  };

  return {
    totalCreditsUsed: snapshot.totalCreditsUsed + cost.costCredits,
    perAgent: {
      ...snapshot.perAgent,
      [agentId]: {
        creditsUsed: existing.creditsUsed + cost.costCredits,
        inputTokens: existing.inputTokens + cost.inputTokens,
        outputTokens: existing.outputTokens + cost.outputTokens,
        turnCount: existing.turnCount + 1,
      },
    },
  };
}

// ─── Stop Policy Evaluation (pure function, exported for testing) ───────────

export interface StopConditionContext {
  currentRound: number;
  totalCreditsUsed: number;
  startedAt: Date;
  lastActivityAt: Date;
  leadSummaryDetected?: boolean;
  consensusDetected?: boolean;
  artifactReady?: boolean;
}

export function evaluateStopConditions(
  policy: StopPolicyInput,
  context: StopConditionContext,
): StopEvaluation {
  // 1. Max rounds
  if (context.currentRound >= policy.maxRounds) {
    return { shouldStop: true, reason: "max_rounds_reached" };
  }

  // 2. Max duration
  const elapsedMs = Date.now() - context.startedAt.getTime();
  if (elapsedMs >= policy.maxDurationMinutes * 60 * 1000) {
    return { shouldStop: true, reason: "max_duration" };
  }

  // 3. Budget exceeded
  if (context.totalCreditsUsed >= policy.maxBudgetCredits) {
    return { shouldStop: true, reason: "budget_exceeded" };
  }

  // 4. Idle timeout
  const idleMs = Date.now() - context.lastActivityAt.getTime();
  if (idleMs >= policy.idleTimeoutSeconds * 1000) {
    return { shouldStop: true, reason: "idle_timeout" };
  }

  // 5. Lead summary
  if (policy.stopOnLeadSummary && context.leadSummaryDetected) {
    return { shouldStop: true, reason: "lead_summary" };
  }

  // 6. Consensus
  if (policy.stopOnConsensus && context.consensusDetected) {
    return { shouldStop: true, reason: "consensus_reached" };
  }

  // 7. Artifact ready
  if (policy.stopOnArtifactReady && context.artifactReady) {
    return { shouldStop: true, reason: "artifact_ready" };
  }

  return { shouldStop: false, reason: null };
}

// ─── Run Lifecycle ──────────────────────────────────────────────────────────

export async function startRun(input: StartRunInput): Promise<TeamRun> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // Load room — verify it belongs to the caller's tenant
  const [room] = await db
    .select()
    .from(teamRooms)
    .where(and(eq(teamRooms.id, input.roomId), eq(teamRooms.tenantId, input.tenantId)))
    .limit(1);

  if (!room || room.status !== "active") {
    throw new Error(`Room ${input.roomId} not found or not active`);
  }

  // Check concurrent run limits (user)
  const [userRunCount] = await db
    .select({ cnt: count() })
    .from(teamRuns)
    .where(
      and(
        eq(teamRuns.initiatedByUserId, input.initiatedByUserId),
        sql`${teamRuns.status} IN ('queued', 'running')`,
      ),
    );

  if (Number(userRunCount.cnt) >= MAX_CONCURRENT_RUNS_PER_USER) {
    throw new Error("Maximum concurrent runs per user reached");
  }

  // Find the preferred coordinating assistant: orchestrator first, then lead.
  const coordinatorCandidates = await db
    .select()
    .from(assistantProfiles)
    .where(
      and(
        eq(assistantProfiles.teamId, room.teamId),
        eq(assistantProfiles.memberKind, "assistant"),
        eq(assistantProfiles.isActive, true),
      ),
    );
  const coordinatorProfile = getCoordinatorProfile(coordinatorCandidates);

  const runId = crypto.randomUUID();
  const now = new Date();

  const [run] = await db
    .insert(teamRuns)
    .values({
      id: runId,
      roomId: input.roomId,
      teamId: room.teamId,
      initiatedByUserId: input.initiatedByUserId,
      executionMode: input.executionMode,
      objective: input.objective,
      constraintsJson: input.constraintsJson ?? null,
      approvalPolicyJson: input.approvalPolicyJson ?? null,
      stopPolicyJson: input.stopPolicy,
      budgetSnapshotJson: initBudgetSnapshot(),
      status: "running",
      activeAssistantId: coordinatorProfile?.id ?? null,
      startedAt: now,
    })
    .returning();

  // Update room's lastRunId
  await db
    .update(teamRooms)
    .set({ lastRunId: runId, updatedAt: now })
    .where(eq(teamRooms.id, input.roomId));

  try {
    await initializeRunWorkContext({
      tenantId: input.tenantId,
      roomId: input.roomId,
      teamId: room.teamId,
      runId,
      objective: input.objective,
      initiatedByUserId: input.initiatedByUserId,
      coordinatorAssistantId: coordinatorProfile?.id ?? null,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("Failed to initialize run work context", {
      roomId: input.roomId,
      runId,
      error: errorMessage,
      stack: error instanceof Error ? error.stack : undefined,
    });

    await db
      .update(teamRuns)
      .set({
        status: "failed",
        stopReason: `initialization_failed: ${errorMessage}`.slice(0, 1000),
        endedAt: new Date(),
      })
      .where(eq(teamRuns.id, runId));

    throw new Error(`Run initialization failed: ${errorMessage}`);
  }

  // Start auto-stop policy checker
  startAutoStopChecker(runId);

  if (input.executionMode === "auto_team") {
    queueAutoAdvance(runId, input.tenantId, AUTO_TEAM_INITIAL_TURNS);
  }

  // Publish run_started event to Redis for SSE
  try {
    const { publishEvent, createEvent } = await import("./orchestratorEventBus");
    await publishEvent(createEvent("run_started", {
      tenantId: input.tenantId,
      teamId: room.teamId,
      roomId: input.roomId,
      runId,
      actorType: "user",
      actorId: String(input.initiatedByUserId),
      data: { executionMode: input.executionMode, objective: input.objective.slice(0, 200) },
      userId: input.initiatedByUserId,
    }));
  } catch {
    // Non-critical — SSE notification missed
  }

  return run;
}

/**
 * Load a run by ID, verifying it belongs to the given tenant via its room.
 * Returns null if not found or tenant mismatch.
 */
async function loadRunWithTenantCheck(
  db: Awaited<ReturnType<typeof getDb>>,
  runId: string,
  tenantId?: string,
): Promise<TeamRun | null> {
  if (!db) return null;
  const [run] = await db
    .select()
    .from(teamRuns)
    .where(eq(teamRuns.id, runId))
    .limit(1);
  if (!run) return null;
  // Always verify tenant isolation — reject if tenantId is missing
  if (!tenantId) return null;
  const [room] = await db
    .select({ tenantId: teamRooms.tenantId })
    .from(teamRooms)
    .where(and(eq(teamRooms.id, run.roomId), eq(teamRooms.tenantId, tenantId)))
    .limit(1);
  if (!room) { console.error(`[loadRunCheck] tenant mismatch: run=${runId}, roomId=${run.roomId}, resolvedTenant=${tenantId}`); return null; }
  return run;
}

export async function pauseRun(runId: string, tenantId?: string): Promise<TeamRun> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const run = await loadRunWithTenantCheck(db, runId, tenantId);
  if (!run) throw new Error(`Run ${runId} not found`);
  if (run.status !== "running") {
    throw new Error(`Run must be 'running' to pause, current status: ${run.status}`);
  }

  const [updated] = await db
    .update(teamRuns)
    .set({ status: "paused", stopReason: "user_paused" })
    .where(eq(teamRuns.id, runId))
    .returning();

  stopAutoStopChecker(runId);
  clearQueuedAutoAdvance(runId);
  return updated;
}

export async function resumeRun(runId: string, tenantId?: string): Promise<TeamRun> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const run = await loadRunWithTenantCheck(db, runId, tenantId);
  if (!run) throw new Error(`Run ${runId} not found`);
  if (run.status !== "paused") {
    throw new Error(`Run must be 'paused' to resume, current status: ${run.status}`);
  }

  const [updated] = await db
    .update(teamRuns)
    .set({ status: "running", stopReason: null })
    .where(eq(teamRuns.id, runId))
    .returning();

  // Restart auto-stop checker
  startAutoStopChecker(runId);

  if (tenantId && updated.executionMode === "auto_team") {
    queueAutoAdvance(runId, tenantId, 1);
  }

  return updated;
}

export async function runNextTurn(runId: string, tenantId?: string): Promise<RunTurnResult> {
  if (!tenantId) throw new Error("Tenant context required");
  if (activeTurnExecutions.has(runId)) {
    throw new Error("Run is already advancing");
  }

  activeTurnExecutions.add(runId);
  try {
    const db = await getDb();
    if (!db) throw new Error("Database not available");

    const run = await loadRunWithTenantCheck(db, runId, tenantId);
    if (!run) throw new Error(`Run ${runId} not found`);
    if (run.status !== "running") {
      throw new Error(`Run must be 'running' to advance, current status: ${run.status}`);
    }

    const [room] = await db
      .select()
      .from(teamRooms)
      .where(and(eq(teamRooms.id, run.roomId), eq(teamRooms.tenantId, tenantId)))
      .limit(1);

    if (!room) {
      throw new Error(`Room ${run.roomId} not found`);
    }

    const assistantId = await resolveCurrentAssistantId(db, run);
    const assistantContext = await resolveAssistantTurnContext(db, assistantId);
    if (!assistantContext) {
      throw new Error(`Assistant ${assistantId} not found`);
    }

    const route = await routeRoomIntent({
      message: run.objective ?? room.goalPrompt ?? "",
      origin: "assistant",
      context: "run_turn",
      userId: run.initiatedByUserId,
      tenantId,
      roomId: run.roomId,
      teamId: run.teamId,
      assistantId,
    });

    const turnResponse = await executeTeamRunSkillTurn({
      run,
      tenantId,
      userId: run.initiatedByUserId,
      assistantId,
      assistantContext: {
        profile: {
          preferredModelId: assistantContext.profile.preferredModelId ?? undefined,
          displayName: assistantContext.profile.displayName ?? undefined,
          roleTitle: assistantContext.profile.roleTitle ?? undefined,
        },
        agentModel: assistantContext.agentModel ?? undefined,
        personaContext: buildPersonaContext(assistantContext),
      },
      roomId: run.roomId,
      teamId: run.teamId,
      objective: run.objective ?? room.goalPrompt ?? "",
      route,
    });

    const content = normalizeAssistantTurnContent(turnResponse.content);
    const normalizedRuntimeMetadata = sanitizeMessageRuntimeMetadata(
      turnResponse.metadata ?? {},
    );
    const message = await roomService.postWorkUpdate({
      roomId: run.roomId,
      tenantId,
      senderAssistantId: assistantId,
      runId,
      content,
      messageType: "work_update",
      metadataJson: {
        nextSpeakerHint: turnResponse.nextSpeakerHint ?? null,
        toolLoopEnabled: Boolean(turnResponse.metadata?.toolLoopEnabled),
        runtimeDisclosure: {
          source: normalizedRuntimeMetadata.source,
          taskClass: normalizedRuntimeMetadata.taskClass,
          profileId: normalizedRuntimeMetadata.profileId,
          fallbackReason: normalizedRuntimeMetadata.fallbackReason,
          voiceInputMode: normalizedRuntimeMetadata.voiceInputMode,
        },
        runtimeMetadata: turnResponse.metadata ?? {},
      },
      tokenUsageJson: {
        inputTokens: turnResponse.inputTokens,
        outputTokens: turnResponse.outputTokens,
        model: assistantContext.profile.preferredModelId ?? assistantContext.agentModel ?? undefined,
      },
    });

    const nextSpeaker = await getNextSpeaker({
      roomId: run.roomId,
      teamId: run.teamId,
      runId,
      currentAssistantId: assistantId,
      strategy: mapExecutionModeToTurnStrategy(run.executionMode),
      nextSpeakerHint: turnResponse.nextSpeakerHint,
    });

    const updatedBudget = accumulateBudget(
      (run.budgetSnapshotJson as BudgetSnapshot) ?? initBudgetSnapshot(),
      assistantId,
      {
        inputTokens: turnResponse.inputTokens,
        outputTokens: turnResponse.outputTokens,
        costCredits: turnResponse.costCredits,
      },
    );

    await db
      .update(teamRuns)
      .set({
        activeAssistantId: nextSpeaker.nextAssistantId,
        budgetSnapshotJson: updatedBudget,
      })
      .where(eq(teamRuns.id, runId));

    await monitoringService.recordEvent({
      tenantId,
      teamId: run.teamId,
      roomId: run.roomId,
      runId,
      assistantId,
      eventType: "agent_turn",
      eventCategory: "communication",
      summary: content.slice(0, 280),
      detailJson: {
        messageId: message.id,
        nextSpeakerHint: turnResponse.nextSpeakerHint ?? null,
        nextSpeakerId: nextSpeaker.nextAssistantId,
        nextSpeakerReason: nextSpeaker.reason,
        metadata: turnResponse.metadata ?? {},
      },
      tokenUsageSnapshot: turnResponse.inputTokens + turnResponse.outputTokens,
      costSnapshot: turnResponse.costCredits,
    });

    monitoringService.captureSnapshot(runId, tenantId).catch(() => {});

    try {
      const { publishEvent, createEvent } = await import("./orchestratorEventBus");
      await publishEvent(createEvent("agent_turn_completed", {
        tenantId,
        teamId: run.teamId,
        roomId: run.roomId,
        runId,
        actorType: "assistant",
        actorId: assistantId,
        data: {
          messageId: message.id,
          nextSpeakerId: nextSpeaker.nextAssistantId,
          nextSpeakerReason: nextSpeaker.reason,
          nextSpeakerHint: turnResponse.nextSpeakerHint ?? null,
        },
        userId: run.initiatedByUserId,
      }));
    } catch {
      // Best-effort realtime event
    }

    return {
      runId,
      roomId: run.roomId,
      teamId: run.teamId,
      assistantId,
      nextAssistantId: nextSpeaker.nextAssistantId,
      nextSpeakerReason: nextSpeaker.reason,
      content,
      tokenUsage: { inputTokens: turnResponse.inputTokens, outputTokens: turnResponse.outputTokens },
      costCredits: turnResponse.costCredits,
      nextSpeakerHint: turnResponse.nextSpeakerHint,
      messageId: message.id,
    };
  } finally {
    activeTurnExecutions.delete(runId);
  }
}

export async function advanceRun(
  runId: string,
  tenantId?: string,
  maxTurns: number = 1,
): Promise<RunTurnResult[]> {
  if (!tenantId) throw new Error("Tenant context required");
  clearQueuedAutoAdvance(runId);
  const turnsToRun = Math.min(Math.max(1, Math.trunc(maxTurns)), MAX_ADVANCE_TURNS);
  const results: RunTurnResult[] = [];
  let latestEvaluation: StopEvaluation = { shouldStop: false, reason: null };

  for (let index = 0; index < turnsToRun; index += 1) {
    const run = await getRun(runId, tenantId);
    if (!run || run.status !== "running") break;

    const turnResult = await runNextTurn(runId, tenantId);
    results.push(turnResult);

    latestEvaluation = await checkAndAutoStop(runId);
    if (latestEvaluation.shouldStop) break;
  }

  const latestRun = await getRun(runId, tenantId);
  if (latestRun) {
    const autoLoopDb = await getDb();
    if (!autoLoopDb) throw new Error("Database not available");
    const openWorkItems = await listOpenAutoLoopWorkItems({
      db: autoLoopDb,
      roomId: latestRun.roomId,
      runId,
      tenantId,
      startedAt: latestRun.startedAt ?? null,
    });

    const autoLoopDecision = evaluateAutoTeamLoopDecision({
      runStatus: latestRun.status,
      executionMode: latestRun.executionMode,
      completedTurns: results.length,
      shouldStop: latestEvaluation.shouldStop,
      openWorkItems,
    });

    if (
      autoLoopDecision.pauseRun &&
      autoLoopDecision.reason &&
      autoLoopDecision.reason !== "no_actionable_work_items"
    ) {
      await autoPauseRunForDependency({
        run: latestRun,
        tenantId,
        reason: autoLoopDecision.reason,
      });
    } else if (autoLoopDecision.continueLoop) {
      queueAutoAdvance(runId, tenantId, 1, AUTO_TEAM_CONTINUATION_DELAY_MS);
    }
  }

  return results;
}

export async function stopRun(
  runId: string,
  reason: string,
  tenantId?: string,
): Promise<TeamRun> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const run = await loadRunWithTenantCheck(db, runId, tenantId);
  if (!run) throw new Error(`Run ${runId} not found`);
  if (run.status !== "running" && run.status !== "paused") {
    throw new Error(`Run must be 'running' or 'paused' to stop, current status: ${run.status}`);
  }

  const now = new Date();
  const normalizedStatus = reason === "user_requested" ? "stopped" : "completed";

  const [updated] = await db.transaction(async (tx) => {
    // Update run status
    const [updatedRun] = await tx
      .update(teamRuns)
      .set({
        status: normalizedStatus,
        stopReason: reason,
        endedAt: now,
      })
      .where(eq(teamRuns.id, runId))
      .returning();

    // Generate agent run summaries
    const participants = await tx
      .select()
      .from(assistantProfiles)
      .where(eq(assistantProfiles.teamId, run.teamId));

    const budget = (run.budgetSnapshotJson as BudgetSnapshot) ?? initBudgetSnapshot();

    for (const participant of participants) {
      const agentBudget = budget.perAgent[participant.id] ?? {
        creditsUsed: 0,
        inputTokens: 0,
        outputTokens: 0,
        turnCount: 0,
      };

      await tx.insert(agentRunSummaries).values({
        runId,
        assistantId: participant.id,
        turnCount: agentBudget.turnCount,
        totalInputTokens: agentBudget.inputTokens,
        totalOutputTokens: agentBudget.outputTokens,
        totalCostCredits: String(agentBudget.creditsUsed),
      });
    }

    return [updatedRun];
  });

  stopAutoStopChecker(runId);
  clearQueuedAutoAdvance(runId);

  // Publish run_completed event to Redis for SSE
  try {
    const { publishEvent, createEvent } = await import("./orchestratorEventBus");
    await publishEvent(createEvent("run_completed", {
      tenantId: tenantId ?? "",
      teamId: run.teamId,
      roomId: run.roomId,
      runId,
      actorType: "system",
      actorId: "system",
      data: { reason, status: normalizedStatus },
    }));
  } catch {
    // Non-critical
  }

  // Generate final summary if stop policy requires it
  const stopPolicy = run.stopPolicyJson as StopPolicy | null;
  if (stopPolicy?.requireFinalSummary) {
    try {
      const { generateSummary } = await import("./summaryService");
      generateSummary({ runId, tenantId: tenantId ?? (run as any).tenantId ?? "" }).catch(() => {});
    } catch {
      // Summary generation is best-effort
    }
  }

  return updated;
}

export async function getRun(runId: string, tenantId?: string): Promise<(TeamRun & { statusBridge: RunStatusBridge }) | null> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const run = await loadRunWithTenantCheck(db, runId, tenantId);
  if (!run) return null;
  return {
    ...run,
    statusBridge: describeStatusBridge(run.status, run.stopReason),
  };
}

// ─── Auto-Stop Policy Checker ───────────────────────────────────────────────

/** Check a single run's stop policy and auto-stop if conditions are met. */
export async function checkAndAutoStop(runId: string): Promise<StopEvaluation> {
  const db = await getDb();
  if (!db) return { shouldStop: false, reason: null };

  const [run] = await db.select().from(teamRuns).where(eq(teamRuns.id, runId)).limit(1);
  if (!run || run.status !== "running") return { shouldStop: false, reason: null };

  const policy = run.stopPolicyJson as StopPolicyInput | null;
  if (!policy) return { shouldStop: false, reason: null };

  const budget = (run.budgetSnapshotJson as BudgetSnapshot) ?? initBudgetSnapshot();

  // Count rounds (turns completed)
  const [roundCount] = await db
    .select({ cnt: count() })
    .from(agentActivityEvents)
    .where(and(eq(agentActivityEvents.runId, runId), sql`${agentActivityEvents.eventType} = 'agent_turn'`));

  // Get latest activity timestamp
  const [latestActivity] = await db
    .select({ ts: agentActivityEvents.createdAt })
    .from(agentActivityEvents)
    .where(eq(agentActivityEvents.runId, runId))
    .orderBy(desc(agentActivityEvents.createdAt))
    .limit(1);

  const evaluation = evaluateStopConditions(policy, {
    currentRound: Number(roundCount?.cnt ?? 0),
    totalCreditsUsed: budget.totalCreditsUsed,
    startedAt: run.startedAt ?? new Date(),
    lastActivityAt: latestActivity?.ts ?? run.startedAt ?? new Date(),
  });

  if (evaluation.shouldStop) {
    // Resolve tenantId from the room (checkAndAutoStop runs outside request context)
    const [room] = await db
      .select({ tenantId: teamRooms.tenantId })
      .from(teamRooms)
      .where(eq(teamRooms.id, run.roomId))
      .limit(1);
    await stopRun(runId, evaluation.reason ?? "auto_stop_policy", room?.tenantId ?? undefined);
  }

  return evaluation;
}

const AUTO_STOP_CHECK_INTERVAL_MS = 30_000; // 30 seconds
const activeCheckers = new Map<string, ReturnType<typeof setInterval>>();

/** Start periodic auto-stop checking for a run. Call after startRun. */
export function startAutoStopChecker(runId: string): void {
  if (activeCheckers.has(runId)) return;

  const interval = setInterval(async () => {
    try {
      const result = await checkAndAutoStop(runId);
      if (result.shouldStop) {
        stopAutoStopChecker(runId);
      }
    } catch {
      // Checker error — will retry next interval
    }
  }, AUTO_STOP_CHECK_INTERVAL_MS);

  activeCheckers.set(runId, interval);
}

/** Stop the periodic checker (on manual stop, pause, or completion). */
export function stopAutoStopChecker(runId: string): void {
  const interval = activeCheckers.get(runId);
  if (interval) {
    clearInterval(interval);
    activeCheckers.delete(runId);
  }
}

/**
 * Rehydrate active runs after a process restart.
 * Auto-team runs rely on in-memory timers, so without this they can remain
 * marked "running" in the database while no further turns are executed.
 */
export async function recoverActiveRunsOnStartup(): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // Safety net: stop legacy runs from the pre-migration Python-bridge pipeline.
  // This catches any runs missed by the 0105 SQL migration (e.g. manual deploy without migration).
  const legacyRuns = await db
    .update(teamRuns)
    .set({
      status: "stopped",
      stopReason: "system_migration_051",
      endedAt: new Date(),
    })
    .where(
      and(
        inArray(teamRuns.status, ["running", "paused", "queued"]),
        sql`${teamRuns.stopReason} IS NULL`,
        sql`${teamRuns.startedAt} < NOW() - INTERVAL '5 minutes'`,
      ),
    )
    .returning({ id: teamRuns.id });

  if (legacyRuns.length > 0) {
    console.log(
      `[RunRecovery] Stopped ${legacyRuns.length} legacy runs from pre-migration pipeline`,
    );
  }

  const activeRuns = await db
    .select({
      runId: teamRuns.id,
      executionMode: teamRuns.executionMode,
      roomId: teamRuns.roomId,
      tenantId: teamRooms.tenantId,
      startedAt: teamRuns.startedAt,
    })
    .from(teamRuns)
    .innerJoin(teamRooms, eq(teamRooms.id, teamRuns.roomId))
    .where(eq(teamRuns.status, "running"));

  if (activeRuns.length === 0) {
    console.log("[RunRecovery] No active runs to recover");
    return;
  }

  for (const run of activeRuns) {
    startAutoStopChecker(run.runId);

    if (run.executionMode === "auto_team") {
      queueAutoAdvance(run.runId, run.tenantId, 1, 500);
    }
  }

  console.log("[RunRecovery] Recovered active runs", {
    total: activeRuns.length,
    autoTeam: activeRuns.filter((run) => run.executionMode === "auto_team").length,
    running: activeRuns.map((run) => ({
      runId: run.runId,
      roomId: run.roomId,
      executionMode: run.executionMode,
      startedAt: run.startedAt,
    })),
  });
}
