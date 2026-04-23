import type { TeamRoomMessage, WorkItemEvent } from "../../drizzle/schema";
import { getRequiredEvidenceForRoute } from "../../shared/autoTeamExecution";
import type { AgentRuntimeStepLink } from "../../shared/agentRuntime/types";
import { isAutoTeamDebugVisible, type AutoTeamCallerContext } from "./autoTeamAccessPolicy";
import {
  getAutoTeamDebugSnapshot,
  type AutoTeamDebugSnapshot,
} from "./autoTeamDebugSnapshotService";
import { backfillAutoTeamRoom } from "./autoTeamBackfillService";
import { extractRunPlanArtifact } from "./monitoringService";
import * as roomService from "./roomService";
import * as workItemService from "./workItemService";

const NINETY_DAYS_MS = 90 * 24 * 60 * 60 * 1000;

type LedgerAccessLevel = "summary" | "detailed";

interface MessageLinkage {
  messageType: string | null;
  workItemId: string | null;
  stageId: string | null;
  threadRootMessageId: string | null;
  llmModelId: string | null;
  runtimeTraceId: string | null;
  checkpointId: string | null;
  stepKey: string | null;
  stepResultPhase: string | null;
  reviewStatus: string | null;
}

export interface AutoTeamLedgerRuntimeMetadata {
  runtimeEngine: string | null;
  runtimeMode: string | null;
  runtimeSelectionReason: string | null;
  runtimeTraceId: string | null;
  runtimeSdkVersion: string | null;
  runtimeAdapterVersion: string | null;
  runtimeSelectedSkillSlug: string | null;
  runtimeStatus: string | null;
}

export type AutoTeamLedgerStepLink = AgentRuntimeStepLink;

export interface AutoTeamLedgerGate {
  key:
    | "plan"
    | "execution"
    | "review"
    | "human_approval"
    | "final_result";
  label: string;
  status: "passed" | "pending" | "blocked" | "not_required";
  detail: string | null;
}

export interface AutoTeamLedgerAttempt {
  id: string;
  stepKey: string;
  stepTitle: string;
  stageId: string | null;
  workItemId: string | null;
  stageType: string;
  status: string;
  attempt: number;
  assignedPersonaId: string | null;
  expectedCapabilityFamily: string | null;
  selectedSkillId: string | null;
  selectedProvider: string | null;
  selectedModel: string | null;
  startedAt: string | null;
  completedAt: string | null;
  blockedReason: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  summary: string | null;
  outputArtifactRefs: string[];
  jobRefIds: string[];
  messagePreviews: Array<{
    id: string;
    createdAt: string | null;
    senderType: string;
    messageType: string | null;
    contentPreview: string;
  }>;
  reviews: Array<{
    id: string;
    reviewType: string;
    reviewerPersonaId: string | null;
    passed: boolean;
    score: number;
    passThreshold: number;
    comments: string | null;
    repairInstructions: string | null;
    createdAt: string | null;
    resolution: "open" | "resolved";
    resolvedByAttemptId: string | null;
  }>;
  auditDetail:
    | {
        provider: string | null;
        model: string | null;
        promptRefs: string[];
        contextRefs: string[];
        toolRefs: string[];
        rawOutputRefs: string[];
      }
    | null;
  runtimeMetadata: AutoTeamLedgerRuntimeMetadata | null;
}

export interface AutoTeamLedgerStep {
  stepKey: string;
  title: string;
  objective: string | null;
  deliverable: string | null;
  status: string;
  ownerPersona: string | null;
  ownerMemberId: string | null;
  reviewerPersona: string | null;
  reviewerMemberId: string | null;
  verificationMethod: string | null;
  retryRule: string | null;
  evidenceRequirements: string[];
  qualityCriteria: string[];
  reviewChecklist: string[];
  notes: string | null;
  stepLinks: AutoTeamLedgerStepLink[];
  attemptIds: string[];
  latestAttemptId: string | null;
  openFindingCount: number;
  resolvedFindingCount: number;
}

export interface AutoTeamLedgerChatPlan {
  messageId: string;
  createdAt: string | null;
  messagePreview: string | null;
  objective: string | null;
  status: string | null;
  reviewStatus: string | null;
  reviewIteration: number | null;
  reviewScore: number | null;
  reviewRecommendation: string | null;
  reviewIssues: string[];
  stepCount: number;
  steps: AutoTeamLedgerStep[];
}

export interface AutoTeamLedgerTimelineEntry {
  id: string;
  kind:
    | "plan"
    | "attempt"
    | "review"
    | "rework"
    | "workflow"
    | "trace"
    | "message"
    | "terminal";
  at: string | null;
  actorId: string | number | null;
  stepKey: string | null;
  attemptId: string | null;
  workItemId: string | null;
  messageId: string | null;
  statusTone: "neutral" | "success" | "warning" | "danger";
  title: string;
  summary: string | null;
}

export interface AutoTeamLedgerReadModel {
  tenantId: string;
  roomId: string | null;
  runId: string | null;
  teamId: string | null;
  roomType: string | null;
  derivedAt: string;
  derivedState: "structured" | "reconstructed" | "partial";
  accessLevel: LedgerAccessLevel;
  objective: string | null;
  summary: {
    runStatus: string | null;
    stopReason: string | null;
    terminalState:
      | "running"
      | "waiting"
      | "completed"
      | "accepted_exception"
      | "failed";
    terminalReason: string | null;
    nextAction: string | null;
    currentStepKey: string | null;
    currentStepTitle: string | null;
    latestOutcome: string | null;
  };
  gates: AutoTeamLedgerGate[];
  plan: {
    status: string | null;
    reviewStatus: string | null;
    reviewIteration: number | null;
    stepCount: number;
    explorationEnabled: boolean;
    source: "audited" | "chat";
    reviewScore: number | null;
    reviewRecommendation: string | null;
    reviewIssues: string[];
    sourceMessageId: string | null;
    sourceMessageCreatedAt: string | null;
  } | null;
  steps: AutoTeamLedgerStep[];
  chatPlan: AutoTeamLedgerChatPlan | null;
  attempts: AutoTeamLedgerAttempt[];
  timeline: AutoTeamLedgerTimelineEntry[];
}

export interface GetAutoTeamLedgerSnapshotInput {
  tenantId: string;
  caller: AutoTeamCallerContext;
  roomId?: string | null;
  runId?: string | null;
  workRequestId?: string | null;
  workCaseId?: string | null;
  limitMessages?: number;
}

function asIso(value: string | Date | null | undefined): string | null {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : value;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value
        .map((item) => asString(item))
        .filter((item): item is string => Boolean(item))
    : [];
}

function previewContent(content: string): string {
  return content.trim().replace(/\s+/g, " ").slice(0, 180);
}

function normalizeChatPlanStep(
  step: Record<string, unknown> | null | undefined,
  index: number,
): AutoTeamLedgerStep {
  const fallbackStepKey = `step-${index + 1}`;
  const stepKey = asString(step?.stepKey) ?? fallbackStepKey;
  return {
    stepKey,
    title: asString(step?.title) ?? humanizeIdentifier(stepKey),
    objective: asString(step?.objective),
    deliverable: asString(step?.deliverable),
    status: asString(step?.status) ?? "planned",
    ownerPersona: asString(step?.ownerPersona),
    ownerMemberId: asString(step?.ownerMemberId),
    reviewerPersona: asString(step?.reviewerPersona),
    reviewerMemberId: asString(step?.reviewerMemberId),
    verificationMethod: asString(step?.verificationMethod),
    retryRule: asString(step?.retryRule),
    evidenceRequirements: asStringArray(step?.evidenceRequirements),
    qualityCriteria: asStringArray(step?.qualityCriteria),
    reviewChecklist: asStringArray(step?.reviewChecklist),
    notes: asString(step?.notes),
    stepLinks: [],
    attemptIds: [],
    latestAttemptId: null,
    openFindingCount: 0,
    resolvedFindingCount: 0,
  };
}

function buildPlanStepAnchorId(stepKey: string): string {
  return `plan-step-${stepKey
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^a-zA-Z0-9:_-]/g, "-")}`;
}

function buildLedgerStepLink(
  link: Omit<AutoTeamLedgerStepLink, "status" | "isPrimary"> & {
    status?: AutoTeamLedgerStepLink["status"];
    isPrimary?: boolean;
  },
): AutoTeamLedgerStepLink {
  return {
    ...link,
    status: link.status ?? "available",
    isPrimary: link.isPrimary ?? false,
  };
}

function extractChatPlanSteps(
  metadata: Record<string, unknown> | null,
  payload: Record<string, unknown> | null,
): AutoTeamLedgerStep[] {
  const stepSources = [payload, metadata];
  const stepKeys = ["steps", "planSteps"];

  for (const source of stepSources) {
    if (!source) continue;
    for (const key of stepKeys) {
      const value = source[key];
      if (!Array.isArray(value) || value.length === 0) continue;
      return value.map((step, index) => normalizeChatPlanStep(asRecord(step), index));
    }
  }

  return [];
}

function extractChatPlanArtifact(
  messages: TeamRoomMessage[],
): AutoTeamLedgerChatPlan | null {
  const planMessages = messages
    .map((message) => ({
      message,
      metadata: asRecord(message.metadataJson),
    }))
    .map(({ message, metadata }) => {
      const payload = asRecord(metadata?.details) ?? metadata;
      return {
        message,
        metadata,
        payload,
        messageType:
          asString(metadata?.messageType) ?? asString(payload?.messageType),
      };
    })
    .filter(({ messageType }) => messageType === "plan_summary")
    .sort((left, right) => {
      const leftAt = new Date(left.message.createdAt ?? 0).getTime();
      const rightAt = new Date(right.message.createdAt ?? 0).getTime();
      return rightAt - leftAt;
    });

  const planCandidates = planMessages.map((candidate) => ({
    ...candidate,
    steps: extractChatPlanSteps(candidate.metadata, candidate.payload),
  }));
  const latest =
    planCandidates.find((candidate) => candidate.steps.length > 0) ??
    planCandidates[0];
  if (!latest) return null;

  const metadata = latest.metadata;
  const payload = asRecord(metadata?.details) ?? metadata;
  const steps = latest.steps;
  const reviewIssues = asStringArray(payload?.reviewIssues);

  return {
    messageId: latest.message.id,
    createdAt: asIso(latest.message.createdAt),
    messagePreview: previewContent(latest.message.content),
    objective: asString(payload?.objective) ?? asString(metadata?.objective),
    status: asString(payload?.planStatus) ?? asString(metadata?.planStatus),
    reviewStatus:
      asString(payload?.reviewStatus) ?? asString(metadata?.reviewStatus),
    reviewIteration:
      typeof payload?.reviewIteration === "number"
        ? payload.reviewIteration
        : typeof metadata?.reviewIteration === "number"
          ? metadata.reviewIteration
        : null,
    reviewScore:
      typeof payload?.reviewScore === "number"
        ? payload.reviewScore
        : typeof metadata?.reviewScore === "number"
          ? metadata.reviewScore
          : null,
    reviewRecommendation:
      asString(payload?.reviewRecommendation) ??
      asString(metadata?.reviewRecommendation),
    reviewIssues,
    stepCount: steps.length,
    steps,
  };
}

function humanizeIdentifier(value: string | null | undefined): string {
  if (!value) return "Unknown step";
  return value
    .replace(/[:._-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function normalizeStopReason(
  rawReason: string | null | undefined,
  missingGateKeys: string[],
  loopTriggered: boolean,
): string | null {
  if (loopTriggered) {
    return "stalled_repeated_attempt";
  }
  if (rawReason === "idle_timeout" && missingGateKeys.length > 0) {
    return "stalled_no_gate_progress";
  }
  return rawReason ?? null;
}

function normalizeMessageLinkage(message: TeamRoomMessage): MessageLinkage {
  const metadata = asRecord(message.metadataJson);
  const details = asRecord(metadata?.details);
  const runtimeMetadata =
    asRecord(details?.runtimeMetadata) ?? asRecord(metadata?.runtimeMetadata);
  const checkpointMetadata =
    asRecord(details?.checkpointMetadata) ?? asRecord(metadata?.checkpointMetadata);
  const stepResult = asRecord(details?.stepResult) ?? null;
  const stepKey =
    asString(details?.stepKey) ??
    asString(metadata?.stepKey) ??
    asString(details?.planStepKey) ??
    asString(stepResult?.stepKey) ??
    null;

  return {
    messageType: asString(metadata?.messageType),
    workItemId: asString(metadata?.workItemId),
    stageId: asString(details?.stageId) ?? asString(metadata?.stageId),
    threadRootMessageId: asString(metadata?.threadRootMessageId),
    llmModelId: asString(runtimeMetadata?.llmModelId),
    runtimeTraceId:
      asString(runtimeMetadata?.runtimeTraceId) ??
      asString(runtimeMetadata?.traceId) ??
      null,
    checkpointId:
      asString(runtimeMetadata?.checkpointId) ??
      asString(checkpointMetadata?.checkpointId) ??
      asString(metadata?.checkpointId) ??
      asString(details?.checkpointId) ??
      asString(stepResult?.checkpointId) ??
      null,
    stepKey,
    stepResultPhase:
      asString(details?.stepResultPhase) ??
      asString(stepResult?.phase) ??
      null,
    reviewStatus:
      asString(metadata?.reviewStatus) ??
      asString(details?.reviewStatus) ??
      asString(stepResult?.reviewStatus) ??
      null,
  };
}

function extractRuntimeMetadata(
  metadata: Record<string, unknown> | null | undefined,
): AutoTeamLedgerRuntimeMetadata | null {
  if (!metadata) return null;
  const runtimeMetadata = asRecord(metadata.runtimeMetadata) ?? metadata;
  const normalized: AutoTeamLedgerRuntimeMetadata = {
    runtimeEngine: asString(runtimeMetadata.runtimeEngine),
    runtimeMode: asString(runtimeMetadata.runtimeMode),
    runtimeSelectionReason: asString(runtimeMetadata.runtimeSelectionReason),
    runtimeTraceId:
      asString(runtimeMetadata.runtimeTraceId) ??
      asString(runtimeMetadata.traceId) ??
      null,
    runtimeSdkVersion:
      asString(runtimeMetadata.runtimeSdkVersion) ??
      asString(runtimeMetadata.sdkVersion) ??
      null,
    runtimeAdapterVersion:
      asString(runtimeMetadata.runtimeAdapterVersion) ??
      asString(runtimeMetadata.adapterVersion) ??
      null,
    runtimeSelectedSkillSlug:
      asString(runtimeMetadata.runtimeSelectedSkillSlug) ??
      asString(runtimeMetadata.selectedSkillSlug) ??
      null,
    runtimeStatus:
      asString(runtimeMetadata.runtimeStatus) ??
      asString(runtimeMetadata.status) ??
      null,
  };

  if (Object.values(normalized).every(value => value == null)) {
    return null;
  }

  return normalized;
}

function collectAuditRefs(
  metadata: Record<string, unknown> | null,
  key: string,
): string[] {
  if (!metadata) return [];
  const nested = asRecord(metadata.audit);
  return (
    asStringArray(metadata[key]) ??
    asStringArray(nested?.[key])
  );
}

function findLatestStepMessageLink(input: {
  messagesWithLinkage: Array<{
    message: TeamRoomMessage;
    linkage: MessageLinkage;
  }>;
  stepKey: string;
  phases?: string[];
  messageTypes?: string[];
}): {
  message: TeamRoomMessage;
  linkage: MessageLinkage;
} | null {
  const matches = input.messagesWithLinkage.filter(({ linkage }) => {
    if (linkage.stepKey !== input.stepKey) return false;
    if (
      input.messageTypes?.length &&
      (!linkage.messageType || !input.messageTypes.includes(linkage.messageType))
    ) {
      return false;
    }
    if (
      input.phases?.length &&
      (!linkage.stepResultPhase || !input.phases.includes(linkage.stepResultPhase))
    ) {
      return false;
    }
    return true;
  });

  matches.sort((left, right) => {
    const leftAt = new Date(left.message.createdAt ?? 0).getTime();
    const rightAt = new Date(right.message.createdAt ?? 0).getTime();
    return rightAt - leftAt;
  });

  return matches[0] ?? null;
}

function findLatestStepCheckpointLink(input: {
  messagesWithLinkage: Array<{
    message: TeamRoomMessage;
    linkage: MessageLinkage;
  }>;
  stepKey: string;
}): {
  message: TeamRoomMessage;
  linkage: MessageLinkage;
} | null {
  const matches = input.messagesWithLinkage.filter(({ linkage }) => {
    if (linkage.stepKey !== input.stepKey) return false;
    if (linkage.checkpointId) return true;
    return linkage.messageType === "checkpoint" || linkage.messageType === "checkpoint_state";
  });

  matches.sort((left, right) => {
    const leftAt = new Date(left.message.createdAt ?? 0).getTime();
    const rightAt = new Date(right.message.createdAt ?? 0).getTime();
    return rightAt - leftAt;
  });

  return matches[0] ?? null;
}

function findLatestAttemptMessagePreview(input: {
  stepAttempts: AutoTeamLedgerAttempt[];
  messageTypes?: string[];
}): {
  message: TeamRoomMessage;
  linkage: MessageLinkage;
} | null {
  const attempts = [...input.stepAttempts].reverse();
  for (const attempt of attempts) {
    const preview = [...attempt.messagePreviews]
      .reverse()
      .find((item) => {
        if (item.messageType === "plan_summary") return false;
        if (input.messageTypes?.length) {
          return Boolean(item.messageType && input.messageTypes.includes(item.messageType));
        }
        return true;
      });
    if (!preview) continue;

    return {
      message: {
        id: preview.id,
        content: preview.contentPreview,
        createdAt: preview.createdAt,
        senderType: preview.senderType as TeamRoomMessage["senderType"],
        senderUserId: null,
        senderAssistantId: null,
      } as unknown as TeamRoomMessage,
      linkage: {
        messageType: preview.messageType,
        workItemId: null,
        stageId: null,
        threadRootMessageId: null,
        llmModelId: null,
        runtimeTraceId: null,
        checkpointId: null,
        stepKey: attempt.stepKey,
        stepResultPhase: preview.messageType === "step_result" ? "execution" : null,
        reviewStatus: null,
      },
    };
  }

  return null;
}

function buildStepLinkSet(input: {
  stepKey: string;
  stepTitle: string;
  planSummaryMessageId: string | null;
  messagesWithLinkage: Array<{
    message: TeamRoomMessage;
    linkage: MessageLinkage;
  }>;
  stepAttempts: AutoTeamLedgerAttempt[];
  latestAttempt: AutoTeamLedgerAttempt | null;
  traceEvents: Array<{
    traceEventId: string;
    createdAt?: string | Date | null;
    summary: string | null;
    redactedMetadataJson: Record<string, unknown> | null;
  }>;
  finalResultSummary: string | null;
  runStatus: string | null;
  terminalReason: string | null;
}): AutoTeamLedgerStepLink[] {
  const planStepAnchorId = buildPlanStepAnchorId(input.stepKey);
  const latestTraceEvent = [...input.traceEvents]
    .filter((event) => {
      const metadata = asRecord(event.redactedMetadataJson);
      const eventStepKey =
        asString(metadata?.stepKey) ?? asString(metadata?.planStepKey) ?? null;
      return eventStepKey === input.stepKey;
    })
    .sort((left, right) => {
      const leftAt = new Date(left.createdAt ?? 0).getTime();
      const rightAt = new Date(right.createdAt ?? 0).getTime();
      return rightAt - leftAt;
    })[0] ?? null;

  const ownerMessage =
    findLatestStepMessageLink({
      messagesWithLinkage: input.messagesWithLinkage,
      stepKey: input.stepKey,
      phases: ["execution", "handoff", "finalize"],
      messageTypes: ["step_result", "work_update", "summary"],
    }) ??
    findLatestAttemptMessagePreview({
      stepAttempts: input.stepAttempts,
      messageTypes: ["step_result", "work_update", "summary"],
    });

  const reviewMessage = findLatestStepMessageLink({
    messagesWithLinkage: input.messagesWithLinkage,
    stepKey: input.stepKey,
    phases: ["review"],
    messageTypes: ["step_result"],
  });
  const repairMessage = findLatestStepMessageLink({
    messagesWithLinkage: input.messagesWithLinkage,
    stepKey: input.stepKey,
    phases: ["repair"],
    messageTypes: ["step_result"],
  });
  const checkpointMessage = findLatestStepCheckpointLink({
    messagesWithLinkage: input.messagesWithLinkage,
    stepKey: input.stepKey,
  });
  const ownerTraceId =
    ownerMessage?.linkage.runtimeTraceId ??
    checkpointMessage?.linkage.runtimeTraceId ??
    null;
  const ownerCheckpointId =
    ownerMessage?.linkage.checkpointId ??
    checkpointMessage?.linkage.checkpointId ??
    null;
  const reviewTraceId =
    reviewMessage?.linkage.runtimeTraceId ??
    checkpointMessage?.linkage.runtimeTraceId ??
    null;
  const reviewCheckpointId =
    reviewMessage?.linkage.checkpointId ??
    checkpointMessage?.linkage.checkpointId ??
    null;
  const repairTraceId =
    repairMessage?.linkage.runtimeTraceId ??
    checkpointMessage?.linkage.runtimeTraceId ??
    null;
  const repairCheckpointId =
    repairMessage?.linkage.checkpointId ??
    checkpointMessage?.linkage.checkpointId ??
    null;

  const stepLinks: AutoTeamLedgerStepLink[] = [];

  if (input.planSummaryMessageId) {
    stepLinks.push(
      buildLedgerStepLink({
        linkType: "plan_summary",
        stepKey: input.stepKey,
        messageId: input.planSummaryMessageId,
        anchorId: null,
        attemptId: null,
        traceId: null,
        checkpointId: null,
        label: "Plan summary",
        isPrimary: false,
        status: "available",
      }),
    );
    stepLinks.push(
      buildLedgerStepLink({
        linkType: "plan_step",
        stepKey: input.stepKey,
        messageId: input.planSummaryMessageId,
        anchorId: planStepAnchorId,
        attemptId: null,
        traceId: null,
        checkpointId: null,
        label: "Plan step",
        isPrimary: true,
        status: "available",
      }),
    );
  } else {
    stepLinks.push(
      buildLedgerStepLink({
        linkType: "plan_summary",
        stepKey: input.stepKey,
        messageId: null,
        anchorId: null,
        attemptId: null,
        traceId: null,
        checkpointId: null,
        label: "Plan summary",
        isPrimary: false,
        status: "pending",
      }),
    );
    stepLinks.push(
      buildLedgerStepLink({
        linkType: "plan_step",
        stepKey: input.stepKey,
        messageId: null,
        anchorId: null,
        attemptId: null,
        traceId: null,
        checkpointId: null,
        label: "Plan step",
        isPrimary: true,
        status: "pending",
      }),
    );
  }

  if (ownerMessage) {
    stepLinks.push(
      buildLedgerStepLink({
        linkType: "owner_result",
        stepKey: input.stepKey,
        messageId: ownerMessage.message.id,
        anchorId: null,
        attemptId: input.latestAttempt?.id ?? null,
        traceId: ownerTraceId,
        checkpointId: ownerCheckpointId,
        label: "Owner result",
        isPrimary: false,
        status: "available",
      }),
    );
  } else {
    stepLinks.push(
      buildLedgerStepLink({
        linkType: "owner_result",
        stepKey: input.stepKey,
        messageId: null,
        anchorId: null,
        attemptId: input.latestAttempt?.id ?? null,
        traceId: ownerTraceId,
        checkpointId: ownerCheckpointId,
        label: "Owner result",
        isPrimary: false,
        status: input.stepAttempts.length > 0 ? "pending" : "pending",
      }),
    );
  }

  if (reviewMessage) {
    stepLinks.push(
      buildLedgerStepLink({
        linkType: "review_result",
        stepKey: input.stepKey,
        messageId: reviewMessage.message.id,
        anchorId: null,
        attemptId: input.latestAttempt?.id ?? null,
        traceId: reviewTraceId,
        checkpointId: reviewCheckpointId,
        label: "Review result",
        isPrimary: false,
        status: "available",
      }),
    );
  } else {
    stepLinks.push(
      buildLedgerStepLink({
        linkType: "review_result",
        stepKey: input.stepKey,
        messageId: null,
        anchorId: null,
        attemptId: input.latestAttempt?.id ?? null,
        traceId: reviewTraceId,
        checkpointId: reviewCheckpointId,
        label: "Review result",
        isPrimary: false,
        status: "pending",
      }),
    );
  }

  if (repairMessage) {
    stepLinks.push(
      buildLedgerStepLink({
        linkType: "repair_result",
        stepKey: input.stepKey,
        messageId: repairMessage.message.id,
        anchorId: null,
        attemptId: input.latestAttempt?.id ?? null,
        traceId: repairTraceId,
        checkpointId: repairCheckpointId,
        label: "Repair result",
        isPrimary: false,
        status: "available",
      }),
    );
  } else if (input.stepAttempts.length > 1) {
    stepLinks.push(
      buildLedgerStepLink({
        linkType: "repair_result",
        stepKey: input.stepKey,
        messageId: null,
        anchorId: null,
        attemptId: input.latestAttempt?.id ?? null,
        traceId: repairTraceId,
        checkpointId: repairCheckpointId,
        label: "Repair result",
        isPrimary: false,
        status: "pending",
      }),
    );
  }

  if (latestTraceEvent) {
    stepLinks.push(
      buildLedgerStepLink({
        linkType: "execution_trace",
        stepKey: input.stepKey,
        messageId: null,
        anchorId: null,
        attemptId: input.latestAttempt?.id ?? null,
        traceId: latestTraceEvent.traceEventId,
        checkpointId: null,
        label: "Execution trace",
        isPrimary: false,
        status: "available",
      }),
    );
  }

  if (input.terminalReason || input.finalResultSummary) {
    stepLinks.push(
      buildLedgerStepLink({
        linkType: "terminal_result",
        stepKey: input.stepKey,
        messageId: null,
        anchorId: null,
        attemptId: null,
        traceId: latestTraceEvent?.traceEventId ?? null,
        checkpointId: null,
        label: "Terminal result",
        isPrimary: false,
        status: input.finalResultSummary ? "available" : "pending",
      }),
    );
  }

  if (checkpointMessage || input.runStatus === "paused" || input.terminalReason) {
    stepLinks.push(
      buildLedgerStepLink({
        linkType: "checkpoint",
        stepKey: input.stepKey,
        messageId: null,
        anchorId: null,
        attemptId: input.latestAttempt?.id ?? null,
        traceId: checkpointMessage?.linkage.runtimeTraceId ?? latestTraceEvent?.traceEventId ?? null,
        checkpointId: checkpointMessage?.linkage.checkpointId ?? null,
        label: "Checkpoint",
        isPrimary: false,
        status: checkpointMessage ? "available" : "pending",
      }),
    );
  }

  return stepLinks;
}

function deriveAttemptAuditDetail(input: {
  accessLevel: LedgerAccessLevel;
  stage: NonNullable<AutoTeamDebugSnapshot["execution"]["canonicalSnapshot"]>["stages"][number];
  linkedMessages: TeamRoomMessage[];
  selectedModelHint: string | null;
}): AutoTeamLedgerAttempt["auditDetail"] {
  if (input.accessLevel !== "detailed") {
    return null;
  }

  const metadata = asRecord(input.stage.metadataJson);
  const providerDecision = asRecord(metadata?.providerDecision);
  const provider =
    asString(metadata?.selectedProvider) ??
    asString(providerDecision?.selectedProvider) ??
    input.stage.selectedProvider ??
    null;
  const model =
    asString(metadata?.selectedModel) ??
    asString(providerDecision?.selectedModel) ??
    input.selectedModelHint;

  return {
    provider,
    model,
    promptRefs: collectAuditRefs(metadata, "promptRefs"),
    contextRefs: collectAuditRefs(metadata, "contextRefs"),
    toolRefs: collectAuditRefs(metadata, "toolRefs"),
    rawOutputRefs: collectAuditRefs(metadata, "rawOutputRefs"),
  };
}

function buildCurrentStepSummary(input: {
  stepKey: string | null;
  stepTitle: string | null;
  runStatus: string | null;
  stopReason: string | null;
  terminalReason: string | null;
  missingGateKeys: string[];
}): string | null {
  if (input.runStatus === "paused") {
    if (input.stopReason === "awaiting_human_choice") {
      return "Human plan choice is required before automation can continue.";
    }
    if (input.stopReason === "awaiting_final_approval") {
      return "A final approval decision is required before the run can close.";
    }
    if (input.stopReason === "awaiting_human_approval") {
      return "A human reviewer must inspect the current output.";
    }
    if (input.stopReason === "awaiting_external_member") {
      return "An external connector is holding the next action.";
    }
  }

  if (input.terminalReason === "stalled_no_gate_progress") {
    return "The run stopped without moving any remaining completion gate.";
  }
  if (input.terminalReason === "stalled_repeated_attempt") {
    return "The run repeated the same attempt pattern and was stalled.";
  }
  if (input.missingGateKeys.includes("plan")) {
    return "The audited plan artifact is missing or has not passed review yet.";
  }
  if (input.stepTitle) {
    return `Continue ${input.stepTitle}.`;
  }
  if (input.missingGateKeys.includes("review")) {
    return "Review feedback must be resolved before the run can finish.";
  }
  if (input.missingGateKeys.includes("final_result")) {
    return "The final result still has to be persisted.";
  }
  return null;
}

function buildTimelineTone(input: {
  passed?: boolean;
  status?: string | null;
  finalStatus?: string | null;
  eventType?: string | null;
}): AutoTeamLedgerTimelineEntry["statusTone"] {
  if (input.passed === true || input.status === "completed" || input.finalStatus === "completed") {
    return "success";
  }
  if (
    input.passed === false ||
    input.status === "failed" ||
    input.status === "blocked" ||
    input.finalStatus === "failed" ||
    input.eventType === "rejected"
  ) {
    return "danger";
  }
  if (
    input.status === "needs_revision" ||
    input.status === "waiting_human" ||
    input.eventType === "workflow_routed"
  ) {
    return "warning";
  }
  return "neutral";
}

export function buildAutoTeamLedgerReadModel(input: {
  snapshot: AutoTeamDebugSnapshot;
  messages: TeamRoomMessage[];
  workItemEvents: WorkItemEvent[];
  accessLevel: LedgerAccessLevel;
}): AutoTeamLedgerReadModel {
  const canonicalSnapshot = input.snapshot.execution.canonicalSnapshot;
  const auditedPlanArtifact = extractRunPlanArtifact(
    canonicalSnapshot?.latestMonitoringSnapshot ?? null,
  );
  const chatPlanArtifact = extractChatPlanArtifact(input.messages);
  const routeDecision = canonicalSnapshot?.routeDecision ?? null;
  const requiredEvidence = routeDecision
    ? getRequiredEvidenceForRoute(routeDecision.routeClass)
    : null;
  const stages = canonicalSnapshot?.stages ?? [];
  const reviews = canonicalSnapshot?.reviews ?? [];
  const mediaJobs = canonicalSnapshot?.mediaJobs ?? [];
  const finalResult = canonicalSnapshot?.finalResult ?? null;
  const runStatus = input.snapshot.run?.status ?? null;
  const roomType = input.snapshot.room?.roomType ?? null;

  const stepMetaByKey = new Map(
    (auditedPlanArtifact?.steps ?? []).map((step) => [step.stepKey, step] as const),
  );

  const messagesWithLinkage = input.messages.map((message) => ({
    message,
    linkage: normalizeMessageLinkage(message),
  }));
  const planSummaryMessageId = chatPlanArtifact?.messageId ?? null;
  const planSummaryMessageCreatedAt = chatPlanArtifact?.createdAt ?? null;
  const planSummaryMessagePreview = chatPlanArtifact?.messagePreview ?? null;

  const attempts = stages.map((stage) => {
    const stepMeta = stepMetaByKey.get(stage.planStepKey);
    const linkedMessages = messagesWithLinkage.filter(({ linkage }) => {
      if (stage.id && linkage.stageId && linkage.stageId === stage.id) return true;
      if (stage.workItemId && linkage.workItemId && linkage.workItemId === stage.workItemId) return true;
      return false;
    });
    const linkedReviews = reviews
      .filter((review) => {
        if (stage.id && review.stageId === stage.id) return true;
        if (stage.workItemId && review.workItemId === stage.workItemId) return true;
        return false;
      })
      .sort((left, right) => {
        const leftAt = new Date(left.createdAt ?? 0).getTime();
        const rightAt = new Date(right.createdAt ?? 0).getTime();
        return leftAt - rightAt;
      });

    const selectedModelHint =
      linkedMessages
        .map(({ linkage }) => linkage.llmModelId)
        .find((value): value is string => Boolean(value)) ??
      mediaJobs.find((job) => job.stageId === stage.id)?.model ??
      null;

    const auditDetail = deriveAttemptAuditDetail({
      accessLevel: input.accessLevel,
      stage,
      linkedMessages: linkedMessages.map(({ message }) => message),
      selectedModelHint,
    });
    const runtimeMetadata =
      extractRuntimeMetadata(stage.metadataJson) ??
      extractRuntimeMetadata(asRecord(linkedMessages.at(-1)?.message.metadataJson));

    const reviewRecords = linkedReviews.map((review) => ({
      id: review.id ?? `review-${stage.id ?? stage.planStepKey}-${review.reviewType}`,
      reviewType: review.reviewType,
      reviewerPersonaId: review.reviewerPersonaId,
      passed: review.passed,
      score: review.score,
      passThreshold: review.passThreshold,
      comments: review.comments,
      repairInstructions: review.repairInstructions,
      createdAt: asIso(review.createdAt),
      resolution: "open" as const,
      resolvedByAttemptId: null,
    }));

    const summary =
      linkedMessages.length > 0
        ? previewContent(linkedMessages[linkedMessages.length - 1].message.content)
        : reviewRecords.at(-1)?.comments ??
          stage.blockedReason ??
          stage.errorMessage ??
          null;

    return {
      id: stage.id ?? `${stage.planStepKey}:${stage.attempt}`,
      stepKey: stage.planStepKey,
      stepTitle: stepMeta?.title ?? humanizeIdentifier(stage.planStepKey),
      stageId: stage.id ?? null,
      workItemId: stage.workItemId ?? null,
      stageType: stage.stageType,
      status: stage.status,
      attempt: stage.attempt,
      assignedPersonaId: stage.assignedPersonaId,
      expectedCapabilityFamily: stage.expectedCapabilityFamily,
      selectedSkillId: stage.selectedSkillId,
      selectedProvider: stage.selectedProvider,
      selectedModel: auditDetail?.model ?? null,
      startedAt: asIso(stage.startedAt),
      completedAt: asIso(stage.completedAt),
      blockedReason: stage.blockedReason,
      errorCode: stage.errorCode,
      errorMessage: stage.errorMessage,
      summary,
      outputArtifactRefs: stage.outputArtifactRefsJson ?? [],
      jobRefIds: stage.jobRefIdsJson ?? [],
      messagePreviews: linkedMessages.map(({ message, linkage }) => ({
        id: message.id,
        createdAt: asIso(message.createdAt),
        senderType: message.senderType,
        messageType: linkage.messageType,
        contentPreview: previewContent(message.content),
      })),
      reviews: reviewRecords,
      auditDetail,
      runtimeMetadata,
    } satisfies AutoTeamLedgerAttempt;
  });

  const attemptsByStep = new Map<string, AutoTeamLedgerAttempt[]>();
  for (const attempt of attempts) {
    const list = attemptsByStep.get(attempt.stepKey) ?? [];
    list.push(attempt);
    attemptsByStep.set(attempt.stepKey, list);
  }

  for (const [stepKey, attemptList] of attemptsByStep.entries()) {
    const passingAttemptId =
      [...attemptList]
        .reverse()
        .find((attempt) => attempt.reviews.some((review) => review.passed))?.id ??
      null;
    for (const attempt of attemptList) {
      for (const review of attempt.reviews) {
        if (review.passed) {
          review.resolution = "resolved";
          review.resolvedByAttemptId = attempt.id;
          continue;
        }
        const laterResolution = passingAttemptId && passingAttemptId !== attempt.id
          ? passingAttemptId
          : attemptList.find((candidate) => candidate.attempt > attempt.attempt)?.id ?? null;
        if (laterResolution) {
          review.resolution = "resolved";
          review.resolvedByAttemptId = laterResolution;
        }
      }
    }
  }

  const fallbackStepKeys = Array.from(
    new Set(attempts.map((attempt) => attempt.stepKey)),
  ).filter((stepKey) => !stepMetaByKey.has(stepKey));
  const stepTerminalReason =
    finalResult?.failureReason ??
    finalResult?.blockedReason ??
    input.snapshot.run?.stopReason ??
    null;

  const buildStepLinksForStep = (inputStep: {
    stepKey: string;
    title: string;
    stepAttempts: AutoTeamLedgerAttempt[];
    latestAttempt: AutoTeamLedgerAttempt | null;
  }): AutoTeamLedgerStepLink[] =>
    buildStepLinkSet({
      stepKey: inputStep.stepKey,
      stepTitle: inputStep.title,
      planSummaryMessageId,
      messagesWithLinkage,
      stepAttempts: inputStep.stepAttempts,
      latestAttempt: inputStep.latestAttempt,
      traceEvents: canonicalSnapshot?.traceEvents ?? [],
      finalResultSummary: finalResult?.summary ?? null,
      runStatus,
      terminalReason: stepTerminalReason,
    });

  const steps: AutoTeamLedgerStep[] = [
    ...(auditedPlanArtifact?.steps ?? []).map((step) => {
      const stepAttempts = attemptsByStep.get(step.stepKey) ?? [];
      const latestAttempt = stepAttempts.at(-1) ?? null;
      const findingCounts = stepAttempts.reduce(
        (totals, attempt) => {
          for (const review of attempt.reviews) {
            if (!review.passed && review.resolution === "open") totals.open += 1;
            if (!review.passed && review.resolution === "resolved") totals.resolved += 1;
          }
          return totals;
        },
        { open: 0, resolved: 0 },
      );

      return {
        stepKey: step.stepKey,
        title: step.title,
        objective: step.objective,
        deliverable: step.deliverable,
        status: step.status,
        ownerPersona: step.ownerPersona,
        ownerMemberId: step.ownerMemberId,
        reviewerPersona: step.reviewerPersona,
        reviewerMemberId: step.reviewerMemberId,
        verificationMethod: step.verificationMethod,
        retryRule: step.retryRule,
        evidenceRequirements: step.evidenceRequirements,
        qualityCriteria: step.qualityCriteria,
        reviewChecklist: step.reviewChecklist,
        notes: step.notes,
        stepLinks: buildStepLinksForStep({
          stepKey: step.stepKey,
          title: step.title,
          stepAttempts,
          latestAttempt,
        }),
        attemptIds: stepAttempts.map((attempt) => attempt.id),
        latestAttemptId: latestAttempt?.id ?? null,
        openFindingCount: findingCounts.open,
        resolvedFindingCount: findingCounts.resolved,
      };
    }),
    ...fallbackStepKeys.map((stepKey) => {
      const stepAttempts = attemptsByStep.get(stepKey) ?? [];
      const latestAttempt = stepAttempts.at(-1) ?? null;
      return {
        stepKey,
        title: humanizeIdentifier(stepKey),
        objective: null,
        deliverable: null,
        status: latestAttempt?.status ?? "planned",
        ownerPersona: null,
        ownerMemberId: latestAttempt?.assignedPersonaId ?? null,
        reviewerPersona: null,
        reviewerMemberId: null,
        verificationMethod: null,
        retryRule: null,
        evidenceRequirements: [],
        qualityCriteria: [],
        reviewChecklist: [],
        notes: null,
        stepLinks: buildStepLinksForStep({
          stepKey,
          title: humanizeIdentifier(stepKey),
          stepAttempts,
          latestAttempt,
        }),
        attemptIds: stepAttempts.map((attempt) => attempt.id),
        latestAttemptId: latestAttempt?.id ?? null,
        openFindingCount: stepAttempts.flatMap((attempt) => attempt.reviews).filter((review) => !review.passed && review.resolution === "open").length,
        resolvedFindingCount: stepAttempts.flatMap((attempt) => attempt.reviews).filter((review) => !review.passed && review.resolution === "resolved").length,
      };
    }),
  ];

  const reviewPassed =
    reviews.some((review) => review.passed) ||
    auditedPlanArtifact?.review.status === "passed" ||
    chatPlanArtifact?.reviewStatus === "passed";
  const planPassed = Boolean(
    auditedPlanArtifact && auditedPlanArtifact.review.status === "passed",
  );
  const planMissing = !auditedPlanArtifact && stages.length > 0;
  const executionReady =
    stages.some((stage) => stage.status === "completed") ||
    Boolean(finalResult?.finalArtifactRefsJson?.length);
  const humanApprovalRequired =
    requiredEvidence?.requiresHumanApproval ||
    (finalResult?.humanApprovalStatus ?? "not_required") !== "not_required";
  const humanApprovalStatus = humanApprovalRequired
    ? finalResult?.humanApprovalStatus === "approved"
      ? "passed"
      : finalResult?.humanApprovalStatus === "rejected"
        ? "blocked"
        : "pending"
    : "not_required";
  const finalResultStatus =
    finalResult?.status === "completed" || finalResult?.status === "legacy_unverified"
      ? "passed"
      : finalResult?.status === "failed"
        ? "blocked"
        : "pending";

  const gates: AutoTeamLedgerGate[] = [
    {
      key: "plan",
      label: "Plan locked",
      status: planPassed ? "passed" : planMissing ? "blocked" : "pending",
      detail: planPassed
        ? "A reviewed durable plan artifact is locked."
        : planMissing
          ? chatPlanArtifact
            ? "A plan exists in chat, but the audited plan artifact is still missing."
            : "Execution exists but the audited plan artifact is missing."
          : chatPlanArtifact
            ? "A plan exists in chat and can be compared here while the audit ledger catches up."
            : "The run has not produced a durable reviewed plan yet.",
    },
    {
      key: "execution",
      label: "Execution evidence",
      status: executionReady ? "passed" : "pending",
      detail: executionReady ? "At least one execution attempt produced output evidence." : "Execution output is still missing.",
    },
    {
      key: "review",
      label: "Reviewer verdict",
      status: requiredEvidence?.requiresReview === false ? "not_required" : reviewPassed ? "passed" : "blocked",
      detail: reviewPassed
        ? "A reviewer accepted the current output."
        : "The run still needs a passing review.",
    },
    {
      key: "human_approval",
      label: "Human approval",
      status: humanApprovalStatus,
      detail:
        humanApprovalStatus === "passed"
          ? "Human approval has been recorded."
          : humanApprovalStatus === "blocked"
            ? "Human approval rejected the output."
            : humanApprovalStatus === "pending"
              ? "Human approval is still outstanding."
              : "Human approval is not required for this route.",
    },
    {
      key: "final_result",
      label: "Final result recorded",
      status: finalResultStatus,
      detail:
        finalResultStatus === "passed"
          ? "The final result has been written."
          : finalResultStatus === "blocked"
            ? "The run finalized with a failure record."
            : "The run has not persisted a final result yet.",
    },
  ];

  const missingGateKeys = gates
    .filter((gate) => gate.status !== "passed" && gate.status !== "not_required")
    .map((gate) => gate.key);
  const terminalReason = normalizeStopReason(
    finalResult?.failureReason ??
      finalResult?.blockedReason ??
      input.snapshot.run?.stopReason ??
      null,
    missingGateKeys,
    Boolean(input.snapshot.loopGuard?.triggered),
  );

  const terminalState: AutoTeamLedgerReadModel["summary"]["terminalState"] =
    finalResult?.status === "completed" && missingGateKeys.length === 0
      ? "completed"
      : finalResult?.status === "legacy_unverified"
        ? "accepted_exception"
        : finalResult?.status === "failed" || input.snapshot.run?.status === "failed"
          ? "failed"
          : input.snapshot.run?.status === "paused"
            ? "waiting"
            : terminalReason
              ? "failed"
              : "running";

  const currentStepKey = canonicalSnapshot?.currentStage?.planStepKey ?? attempts.at(-1)?.stepKey ?? null;
  const currentStepTitle =
    (currentStepKey ? steps.find((step) => step.stepKey === currentStepKey)?.title : null) ??
    (canonicalSnapshot?.currentStage ? humanizeIdentifier(canonicalSnapshot.currentStage.planStepKey) : null);

  const summary = {
    runStatus,
    stopReason: input.snapshot.run?.stopReason ?? null,
    terminalState,
    terminalReason,
    nextAction: buildCurrentStepSummary({
      stepKey: currentStepKey,
      stepTitle: currentStepTitle,
      runStatus,
      stopReason: input.snapshot.run?.stopReason ?? null,
      terminalReason,
      missingGateKeys,
    }),
    currentStepKey,
    currentStepTitle,
    latestOutcome:
      finalResult?.summary ??
      attempts.at(-1)?.summary ??
      input.snapshot.missingEvidenceSummary,
  };

  const timeline: AutoTeamLedgerTimelineEntry[] = [];

  if (auditedPlanArtifact) {
    timeline.push({
      id: `plan:${auditedPlanArtifact.generatedAt}`,
      kind: "plan",
      at: auditedPlanArtifact.generatedAt,
      actorId: null,
      stepKey: null,
      attemptId: null,
      workItemId: null,
      messageId: null,
      statusTone: buildTimelineTone({ status: auditedPlanArtifact.status }),
      title: "Plan generated",
      summary: `${auditedPlanArtifact.steps.length} step(s) prepared for execution.`,
    });
  } else if (chatPlanArtifact) {
    timeline.push({
      id: `plan-chat:${planSummaryMessageId ?? chatPlanArtifact.messageId}`,
      kind: "plan",
      at: planSummaryMessageCreatedAt,
      actorId: null,
      stepKey: null,
      attemptId: null,
      workItemId: null,
      messageId: planSummaryMessageId,
      statusTone: "warning",
      title: "Plan shared in chat",
      summary: `${chatPlanArtifact.stepCount} step(s) drafted for comparison before audit persisted.`,
    });
  }

  for (const event of input.workItemEvents) {
    timeline.push({
      id: `work-item:${event.id}`,
      kind: "workflow",
      at: asIso(event.createdAt),
      actorId: event.actorAssistantId ?? event.actorUserId ?? null,
      stepKey: null,
      attemptId: null,
      workItemId: event.workItemId,
      messageId: null,
      statusTone: buildTimelineTone({ eventType: event.eventType }),
      title: humanizeIdentifier(event.eventType),
      summary:
        asString(asRecord(event.detailJson)?.reason) ??
        asString(asRecord(event.detailJson)?.targetStep) ??
        null,
    });
  }

  for (const event of canonicalSnapshot?.traceEvents ?? []) {
    const metadata = asRecord(event.redactedMetadataJson);
    const traceStatus =
      event.severity === "error"
        ? "failed"
        : event.severity === "warn"
          ? "blocked"
          : "completed";
    timeline.push({
      id: `trace:${event.traceEventId}`,
      kind: "trace",
      at: asIso(event.createdAt),
      actorId: asString(metadata?.actor) ?? null,
      stepKey:
        asString(metadata?.stepKey) ??
        asString(metadata?.planStepKey) ??
        null,
      attemptId: null,
      workItemId: event.workItemId ?? null,
      messageId: null,
      statusTone: buildTimelineTone({ status: traceStatus }),
      title: humanizeIdentifier(event.eventName),
      summary:
        event.summary ??
        asString(metadata?.detail) ??
        asString(metadata?.reasonCode) ??
        null,
    });
  }

  for (const attempt of attempts) {
    timeline.push({
      id: `attempt:${attempt.id}`,
      kind: "attempt",
      at: attempt.startedAt ?? attempt.completedAt,
      actorId: attempt.assignedPersonaId,
      stepKey: attempt.stepKey,
      attemptId: attempt.id,
      workItemId: attempt.workItemId,
      messageId: null,
      statusTone: buildTimelineTone({ status: attempt.status }),
      title: `${attempt.stepTitle} · attempt ${attempt.attempt}`,
      summary: attempt.summary,
    });

    for (const review of attempt.reviews) {
      timeline.push({
        id: `review:${review.id}`,
        kind: review.passed ? "review" : "rework",
        at: review.createdAt,
        actorId: review.reviewerPersonaId,
        stepKey: attempt.stepKey,
        attemptId: attempt.id,
        workItemId: attempt.workItemId,
        messageId: null,
        statusTone: buildTimelineTone({ passed: review.passed }),
        title: review.passed ? "Review passed" : "Changes requested",
        summary: review.comments ?? review.repairInstructions,
      });
    }
  }

  for (const { message, linkage } of messagesWithLinkage) {
    if (!linkage.messageType || linkage.messageType === "work_update") continue;
    timeline.push({
      id: `message:${message.id}`,
      kind: "message",
      at: asIso(message.createdAt),
      actorId: message.senderAssistantId ?? message.senderUserId ?? null,
      stepKey: null,
      attemptId: attempts.find((attempt) => attempt.workItemId && attempt.workItemId === linkage.workItemId)?.id ?? null,
      workItemId: linkage.workItemId,
      messageId: message.id,
      statusTone: "neutral",
      title: humanizeIdentifier(linkage.messageType),
      summary: previewContent(message.content),
    });
  }

  if (finalResult || terminalReason) {
    timeline.push({
      id: `terminal:${finalResult?.id ?? terminalReason ?? "run"}`,
      kind: "terminal",
      at: asIso(finalResult?.updatedAt ?? input.snapshot.run?.endedAt ?? null),
      actorId: null,
      stepKey: null,
      attemptId: null,
      workItemId: null,
      messageId: null,
      statusTone: buildTimelineTone({ finalStatus: finalResult?.status ?? null }),
      title:
        terminalState === "completed"
          ? "Run completed"
          : terminalState === "accepted_exception"
            ? "Run reconstructed"
            : terminalState === "waiting"
              ? "Run waiting"
              : "Run stopped",
      summary: terminalReason ?? finalResult?.summary ?? null,
    });
  }

  timeline.sort((left, right) => {
    const leftAt = new Date(left.at ?? 0).getTime();
    const rightAt = new Date(right.at ?? 0).getTime();
    return leftAt - rightAt;
  });

  const derivedState =
    finalResult?.status === "legacy_unverified"
      ? "reconstructed"
      : canonicalSnapshot
        ? planMissing
          ? "partial"
          : "structured"
        : "partial";

  const chatPlan =
    chatPlanArtifact
      ? {
          messageId: planSummaryMessageId ?? chatPlanArtifact.messageId,
          createdAt: planSummaryMessageCreatedAt,
          messagePreview: planSummaryMessagePreview,
          objective: chatPlanArtifact.objective,
          status: chatPlanArtifact.status,
          reviewStatus: chatPlanArtifact.reviewStatus,
          reviewIteration: chatPlanArtifact.reviewIteration,
          reviewScore: chatPlanArtifact.reviewScore,
          reviewRecommendation: chatPlanArtifact.reviewRecommendation,
          reviewIssues: chatPlanArtifact.reviewIssues,
          stepCount: chatPlanArtifact.stepCount,
          steps: chatPlanArtifact.steps.map((step) => {
            const stepAttempts = attemptsByStep.get(step.stepKey) ?? [];
            const latestAttempt = stepAttempts.at(-1) ?? null;
            return {
              ...step,
              stepLinks: buildStepLinksForStep({
                stepKey: step.stepKey,
                title: step.title,
                stepAttempts,
                latestAttempt,
              }),
            };
          }),
        }
      : null;

  return {
    tenantId: input.snapshot.tenantId,
    roomId: input.snapshot.room?.id ?? canonicalSnapshot?.roomId ?? null,
    runId: input.snapshot.run?.id ?? canonicalSnapshot?.runId ?? null,
    teamId: input.snapshot.team?.id ?? canonicalSnapshot?.teamId ?? null,
    roomType,
    derivedAt: new Date().toISOString(),
    derivedState,
    accessLevel: input.accessLevel,
    objective:
      input.snapshot.room?.goalPrompt ??
      input.snapshot.request?.request?.objective ??
      finalResult?.summary ??
      null,
    summary,
    gates,
    plan: (auditedPlanArtifact ?? chatPlanArtifact)
      ? {
          status: (auditedPlanArtifact ?? chatPlanArtifact)!.status,
          reviewStatus: auditedPlanArtifact?.review.status ?? chatPlanArtifact?.reviewStatus ?? null,
          reviewIteration:
            auditedPlanArtifact?.review.iteration ?? chatPlanArtifact?.reviewIteration ?? null,
          stepCount:
            auditedPlanArtifact?.steps.length ?? chatPlanArtifact?.stepCount ?? 0,
          explorationEnabled: Boolean(auditedPlanArtifact?.exploration),
          source: auditedPlanArtifact ? "audited" : "chat",
          reviewScore:
            auditedPlanArtifact?.review.score ?? chatPlanArtifact?.reviewScore ?? null,
          reviewRecommendation:
            auditedPlanArtifact?.review.recommendation ??
            chatPlanArtifact?.reviewRecommendation ??
            null,
          reviewIssues:
            auditedPlanArtifact?.review.issues ??
            chatPlanArtifact?.reviewIssues ??
            [],
          sourceMessageId: chatPlanArtifact?.messageId ?? null,
          sourceMessageCreatedAt: chatPlanArtifact?.createdAt ?? null,
        }
      : null,
    steps,
    chatPlan,
    attempts,
    timeline,
  };
}

export async function getAutoTeamLedgerSnapshot(
  input: GetAutoTeamLedgerSnapshotInput,
): Promise<AutoTeamLedgerReadModel> {
  try {
    let snapshot = await getAutoTeamDebugSnapshot({
      tenantId: input.tenantId,
      caller: input.caller,
      roomId: input.roomId ?? null,
      runId: input.runId ?? null,
      workRequestId: input.workRequestId ?? null,
      workCaseId: input.workCaseId ?? null,
      limitMessages: Math.min(input.limitMessages ?? 24, 50),
    });

    if (
      snapshot.room?.roomType === "auto_team" &&
      snapshot.room?.createdAt &&
      !snapshot.execution.canonicalSnapshot &&
      snapshot.run?.id &&
      snapshot.run.status !== "running" &&
      Date.now() - new Date(snapshot.room.createdAt).getTime() <= NINETY_DAYS_MS
    ) {
      await backfillAutoTeamRoom({
        tenantId: input.tenantId,
        roomId: snapshot.room.id,
        runId: snapshot.run.id,
        initiatedByUserId: input.caller.userId ?? null,
        initiatedByActorRole: input.caller.isTenantAdmin
          ? "admin"
          : input.caller.isDebugUser
            ? "domain_admin"
            : null,
      }).catch(() => null);

      snapshot = await getAutoTeamDebugSnapshot({
        tenantId: input.tenantId,
        caller: input.caller,
        roomId: input.roomId ?? null,
        runId: input.runId ?? null,
        workRequestId: input.workRequestId ?? null,
        workCaseId: input.workCaseId ?? null,
        limitMessages: Math.min(input.limitMessages ?? 24, 50),
      });
    }

    if (snapshot.room?.id && input.caller.userId && !isAutoTeamDebugVisible(input.caller)) {
      const hasAccess = await roomService.hasRoomParticipantAccess(
        snapshot.room.id,
        input.tenantId,
        input.caller.userId,
      );
      if (!hasAccess) {
        throw new Error("You do not have access to this team room ledger");
      }
    }

    const roomMessages = snapshot.room?.id
      ? await roomService
          .getMessages(snapshot.room.id, input.tenantId, {
            callerType: "user",
            viewMode: "transparent",
            limit: Math.min(input.limitMessages ?? 200, 200),
          })
          .catch(() => [])
      : [];

    const workItemEvents = snapshot.room?.id
      ? await workItemService
          .listWorkItemEventsByRoom(snapshot.room.id, input.tenantId)
          .catch(() => [])
      : [];

    return buildAutoTeamLedgerReadModel({
      snapshot,
      messages: roomMessages,
      workItemEvents,
      accessLevel: isAutoTeamDebugVisible(input.caller) ? "detailed" : "summary",
    });
  } catch (error) {
    console.error("[autoTeamLedgerService] failed to build ledger snapshot", {
      tenantId: input.tenantId,
      roomId: input.roomId ?? null,
      runId: input.runId ?? null,
      workRequestId: input.workRequestId ?? null,
      workCaseId: input.workCaseId ?? null,
      callerUserId: input.caller.userId ?? null,
      callerIsTenantAdmin: input.caller.isTenantAdmin,
      callerIsDebugUser: input.caller.isDebugUser,
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    throw error;
  }
}
