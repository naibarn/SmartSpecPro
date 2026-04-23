import type { AutoTeamCallerContext } from "./autoTeamAccessPolicy";
import { assessAutoTeamBudget, type AutoTeamBudgetDecision } from "./autoTeamBudgetService";
import {
  evaluateCompletionEvidence,
  summarizeMissingEvidence,
} from "./autoTeamCompletionEvidence";
import { evaluateAutoTeamLoopGuard } from "./autoTeamLoopGuard";
import {
  evaluateStageTimeout,
  getRunSnapshot,
  type CanonicalExecutionSnapshot,
} from "./autoTeamExecutionService";
import {
  getAutoTeamRolloutFlags,
  resolveAutoTeamExecutionMode,
} from "./autoTeamFeatureFlags";
import { getAutoTeamRetentionSummary } from "./autoTeamRetentionService";
import { verifyAutoTeamMigrationBaseline } from "./autoTeamMigrationVerificationService";
import * as monitoringService from "./monitoringService";
import * as roomService from "./roomService";
import * as runEngine from "./runEngine";
import * as teamService from "./teamService";
import * as workItemService from "./workItemService";
import * as workOsService from "./workOsService";
import { isAutoTeamDebugVisible } from "./autoTeamAccessPolicy";
import { resolveAutoTeamProviderDecision, type AutoTeamProviderDecision } from "./autoTeamProviderPolicy";
import type {
  AutoTeamExecutionStageRow,
  AutoTeamFinalResultRow,
  AutoTeamMediaJobRefRow,
  AutoTeamReviewRecordRow,
  AutoTeamRouteDecisionRow,
  TeamRoom,
  TeamRun,
} from "../../drizzle/schema";

export interface AutoTeamDebugSnapshotInput {
  tenantId: string;
  caller: AutoTeamCallerContext;
  roomId?: string | null;
  runId?: string | null;
  workRequestId?: string | null;
  workCaseId?: string | null;
  limitMessages?: number;
}

export interface AutoTeamDebugSnapshot {
  tenantId: string;
  room: TeamRoom | null;
  team: Awaited<ReturnType<typeof teamService.getTeam>> | null;
  request: Awaited<ReturnType<typeof workOsService.getWorkRequest>> | null;
  workCase: Awaited<ReturnType<typeof workOsService.getWorkCaseProjection>> | null;
  run: TeamRun | null;
  execution: {
    routeDecision: AutoTeamRouteDecisionRow | null;
    executionMode: ReturnType<typeof resolveAutoTeamExecutionMode> | "unknown";
    frozenAt: string | null;
    rolloutFlags: Awaited<ReturnType<typeof getAutoTeamRolloutFlags>>;
    canonicalSnapshot: CanonicalExecutionSnapshot | null;
  };
  stages: Array<{
    id: string;
    stageType: AutoTeamExecutionStageRow["stageType"];
    status: AutoTeamExecutionStageRow["status"];
    expectedCapabilityFamily: AutoTeamExecutionStageRow["expectedCapabilityFamily"];
    blockedReason: string | null;
    startedAt: string | null;
    completedAt: string | null;
    deadlineAt: string | null;
    selectedSkillId: string | null;
    selectedProvider: string | null;
    jobRefIdsJson: string[];
    outputArtifactRefsJson: string[];
    metadataJson: Record<string, unknown> | null;
  }>;
  roomMessages: Array<{
    id: string;
    senderType: string;
    senderAssistantId: string | null;
    createdAt: string;
    contentPreview: string;
  }>;
  mediaJobs: AutoTeamMediaJobRefRow[];
  reviews: AutoTeamReviewRecordRow[];
  finalResult: AutoTeamFinalResultRow | null;
  workItems: Array<{
    id: string;
    title: string;
    status: string;
    revisionVersion: number;
    assignedMemberId: string | null;
    reviewerMemberId: string | null;
    approverMemberId: string | null;
    runId: string | null;
    sourceType: string;
    sourceRef: string | null;
    threadRootMessageId: string | null;
    activeDraftArtifactId: string | null;
    createdAt: string;
    updatedAt: string;
  }>;
  agencyRuns: Array<{
    agencyRunId: string;
    agencyConversationId: string | null;
    stageId: string | null;
    workItemId: string | null;
    agencyStatus: string | null;
  }>;
  migrationVerification: Awaited<ReturnType<typeof verifyAutoTeamMigrationBaseline>> | null;
  missingEvidenceSummary: string;
  loopGuard: ReturnType<typeof evaluateAutoTeamLoopGuard> | null;
  timeout: ReturnType<typeof evaluateStageTimeout> | null;
  observability: {
    budgetDecision: AutoTeamBudgetDecision | null;
    providerDecision: AutoTeamProviderDecision | null;
    safetyStatus: string;
    timeout: ReturnType<typeof evaluateStageTimeout> | null;
  };
  contextEngineHealth: Awaited<ReturnType<typeof monitoringService.getContextEngineHealth>> | null;
  memoryContinuity: {
    roomLanguage: string;
    initiatorUserId: number | null;
    availableMemoryScopes: string[];
    guidedChatBacked: boolean;
    automationLed: boolean;
  };
  retention: Awaited<ReturnType<typeof getAutoTeamRetentionSummary>>;
  traceSummary: Array<{
    sequence: number;
    traceEventId: string;
    eventName: string;
    severity: string;
    summary: string | null;
    idempotencyKey: string;
  }>;
  rawDiagnostics?: Record<string, unknown> | null;
}

function asIso(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : value;
}

type AutoTeamRetentionSummaryValue = Awaited<ReturnType<typeof getAutoTeamRetentionSummary>>;

function zeroExpiredCounts(): AutoTeamRetentionSummaryValue["expiredCounts"] {
  return {
    routeDecisions: 0,
    executionStages: 0,
    mediaJobs: 0,
    reviewRecords: 0,
    finalResults: 0,
    traceEvents: 0,
    artifactRefs: 0,
  };
}

function buildUnavailableRetentionSummary(
  tenantId: string,
): AutoTeamRetentionSummaryValue {
  return {
    tenantId,
    retentionDays: 30,
    cutoffAt: new Date().toISOString(),
    featureEnabled: false,
    eligibleRunIds: [],
    eligibleRunCount: 0,
    expiredCounts: zeroExpiredCounts(),
    cleanupComplete: false,
  };
}

function errorMessageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function previewContent(content: string): string {
  return content.trim().replace(/\s+/g, " ").slice(0, 240);
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function extractProviderHint(policyJson: Record<string, unknown> | null | undefined): {
  requestedProvider: string | null;
  requestedModel: string | null;
} {
  const providerHint = asRecord(policyJson?.providerHint);
  if (!providerHint) {
    return { requestedProvider: null, requestedModel: null };
  }
  return {
    requestedProvider: asString(providerHint.requestedProvider),
    requestedModel: asString(providerHint.requestedModel),
  };
}

export async function getAutoTeamDebugSnapshot(
  input: AutoTeamDebugSnapshotInput,
): Promise<AutoTeamDebugSnapshot> {
  const roomIdFromInput = input.roomId ?? null;
  let request: Awaited<ReturnType<typeof workOsService.getWorkRequest>> | null = null;
  let workCase: Awaited<ReturnType<typeof workOsService.getWorkCaseProjection>> | null = null;

  if (input.workCaseId) {
    workCase = await workOsService.getWorkCaseProjection(input.workCaseId, input.tenantId).catch(() => null);
  }

  if (input.workRequestId) {
    request = await workOsService.getWorkRequest({
      tenantId: input.tenantId,
      requestId: input.workRequestId,
      actorUserId: input.caller.userId ?? null,
      actorRole: input.caller.isTenantAdmin ? "admin" : input.caller.isDebugUser ? "domain_admin" : undefined,
    }).catch(() => null);
    if (request && !workCase) {
      workCase = request.case ? await workOsService.getWorkCaseProjection(request.case.id, input.tenantId).catch(() => null) : null;
    }
  }

  const derivedRunId =
    input.runId ??
    workCase?.case.automationRunId ??
    request?.case?.automationRunId ??
    null;

  let room = null as TeamRoom | null;
  if (roomIdFromInput) {
    room = await roomService.getRoom(roomIdFromInput, input.tenantId).catch(() => null);
  } else if (derivedRunId) {
    const snapshot = await getRunSnapshot({ tenantId: input.tenantId, runId: derivedRunId }).catch(() => null);
    if (snapshot?.roomId) {
      room = await roomService.getRoom(snapshot.roomId, input.tenantId).catch(() => null);
    }
  }

  const runId =
    derivedRunId ??
    room?.lastRunId ??
    null;

  const canonicalSnapshot = runId
    ? await getRunSnapshot({ tenantId: input.tenantId, runId }).catch(() => null)
    : null;

  const teamId = canonicalSnapshot?.teamId ?? room?.teamId ?? null;
  const team = teamId ? await teamService.getTeam(teamId, input.tenantId).catch(() => null) : null;
  const rolloutFlags = await getAutoTeamRolloutFlags();
  const executionModeSnapshot =
    (canonicalSnapshot?.routeDecision?.selectedPolicyJson as Record<string, unknown> | null | undefined)?.executionModeSnapshot as {
      executionMode?: ReturnType<typeof resolveAutoTeamExecutionMode>;
      frozenAt?: string;
    } | undefined;
  const executionMode =
    executionModeSnapshot?.executionMode ??
    (canonicalSnapshot?.routeDecision
      ? resolveAutoTeamExecutionMode(rolloutFlags)
      : "unknown");
  const run = runId ? await runEngine.getRun(runId, input.tenantId).catch(() => null) : null;

  const stages = (canonicalSnapshot?.stages ?? []).map((stage) => ({
    id: stage.id ?? "",
    stageType: stage.stageType,
    status: stage.status,
    expectedCapabilityFamily: stage.expectedCapabilityFamily,
    blockedReason: stage.blockedReason,
    startedAt: asIso(stage.startedAt),
    completedAt: asIso(stage.completedAt),
    deadlineAt: asIso(stage.deadlineAt),
    selectedSkillId: stage.selectedSkillId,
    selectedProvider: stage.selectedProvider,
    jobRefIdsJson: stage.jobRefIdsJson ?? [],
    outputArtifactRefsJson: stage.outputArtifactRefsJson ?? [],
    metadataJson: stage.metadataJson ?? null,
  }));

  const roomMessages = room
    ? await roomService
        .getMessages(room.id, input.tenantId, {
          limit: input.limitMessages ?? 12,
          callerType: "user",
        })
        .then((messages) =>
          messages.map((message) => ({
            id: message.id,
            senderType: message.senderType,
            senderAssistantId: message.senderAssistantId ?? null,
            createdAt: asIso(message.createdAt) ?? new Date().toISOString(),
            contentPreview: previewContent(message.content),
          })),
        )
        .catch(() => [])
    : [];

  const workItems = room
    ? await workItemService
        .listWorkItemsByRoom(room.id, input.tenantId)
        .then((items) =>
          items.map((item) => ({
            id: item.id,
            title: item.title,
            status: item.status,
            revisionVersion: item.revisionVersion,
            assignedMemberId: item.assignedMemberId ?? null,
            reviewerMemberId: item.reviewerMemberId ?? null,
            approverMemberId: item.approverMemberId ?? null,
            runId: item.runId ?? null,
            sourceType: item.sourceType,
            sourceRef: item.sourceRef ?? null,
            threadRootMessageId: item.threadRootMessageId ?? null,
            activeDraftArtifactId: item.activeDraftArtifactId ?? null,
            createdAt: asIso(item.createdAt) ?? new Date().toISOString(),
            updatedAt: asIso(item.updatedAt) ?? new Date().toISOString(),
          })),
        )
        .catch(() => [])
    : [];

  const mediaJobs = canonicalSnapshot?.mediaJobs ?? [];
  const reviews = canonicalSnapshot?.reviews ?? [];
  const finalResult = canonicalSnapshot?.finalResult ?? null;
  const latestMediaJob = mediaJobs[0] ?? null;
  const latestMediaMetadata = asRecord(latestMediaJob?.metadataJson);
  const latestMediaProviderDecision = asRecord(latestMediaMetadata?.providerDecision);
  const latestMediaBudgetDecision = asRecord(latestMediaMetadata?.budgetDecision);
  const selectedPolicyJson = asRecord(canonicalSnapshot?.routeDecision?.selectedPolicyJson);
  const providerHint = extractProviderHint(selectedPolicyJson);
  const objective =
    room?.goalPrompt ??
    request?.request?.objective ??
    request?.request?.title ??
    workCase?.case.summary ??
    finalResult?.summary ??
    null;
  const budgetDecision = latestMediaBudgetDecision
    ? (latestMediaBudgetDecision as unknown as AutoTeamBudgetDecision)
    : canonicalSnapshot?.routeDecision
      ? assessAutoTeamBudget({
          tenantId: input.tenantId,
          runId: canonicalSnapshot.runId,
          routeClass: canonicalSnapshot.routeDecision.routeClass,
          stageType: canonicalSnapshot.currentStage?.stageType ?? "plan",
          objective,
        })
      : null;
  const providerDecision = latestMediaProviderDecision
    ? (latestMediaProviderDecision as unknown as AutoTeamProviderDecision)
    : canonicalSnapshot?.routeDecision
      ? resolveAutoTeamProviderDecision({
          tenantId: input.tenantId,
          runId: canonicalSnapshot.runId,
          routeClass: canonicalSnapshot.routeDecision.routeClass,
          objective,
          requestedProvider: providerHint.requestedProvider,
          requestedModel: providerHint.requestedModel,
          teamLanguage: canonicalSnapshot.routeDecision.language,
        })
      : null;
  const safetyStatus =
    typeof latestMediaMetadata?.safetyStatus === "string"
      ? latestMediaMetadata.safetyStatus
      : latestMediaJob?.errorCode
        ? "blocked"
        : finalResult?.status === "completed"
          ? "safe"
          : "unknown";

  const agencyRuns = Array.from(
    new Map(
      (canonicalSnapshot?.stages ?? [])
        .flatMap((stage) => {
          const metadata = asRecord(stage.metadataJson);
          const agencyRunId = typeof metadata?.agencyRunId === "string" ? metadata.agencyRunId : null;
          if (!agencyRunId) return [];
          return [{
            agencyRunId,
            agencyConversationId: typeof metadata?.agencyConversationId === "string" ? metadata.agencyConversationId : null,
            stageId: stage.id ?? null,
            workItemId: stage.workItemId ?? null,
            agencyStatus: typeof metadata?.agencyStatus === "string" ? metadata.agencyStatus : null,
          }];
        })
        .map((entry) => [entry.agencyRunId, entry] as const),
    ).values(),
  );

  const migrationVerification = await verifyAutoTeamMigrationBaseline({
    tenantId: input.tenantId,
  }).catch(() => null);

  const missingEvidenceSummary =
    canonicalSnapshot?.routeDecision
      ? summarizeMissingEvidence(
          evaluateCompletionEvidence({
            tenantId: input.tenantId,
            teamId,
            roomId: canonicalSnapshot.roomId ?? room?.id ?? null,
            runId: canonicalSnapshot.runId,
            routeDecision: {
              id: canonicalSnapshot.routeDecision.id ?? "",
              routeClass: canonicalSnapshot.routeDecision.routeClass,
              language: canonicalSnapshot.routeDecision.language,
            },
            artifactRefs: canonicalSnapshot.stages.flatMap((stage) =>
              (stage.outputArtifactRefsJson ?? []).map((artifactId) => ({
                tenantId: input.tenantId,
                teamId,
                roomId: canonicalSnapshot.roomId ?? room?.id ?? null,
                runId: canonicalSnapshot.runId,
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
                source: "autoTeamDebugSnapshotService",
              })),
            ),
            mediaJobRefs: mediaJobs.map((job) => ({
              id: job.id ?? "",
              providerStatus: job.providerStatus,
              resultArtifactRefsJson: job.resultArtifactRefsJson ?? [],
              stageId: job.stageId ?? null,
            })),
            reviewRecords: reviews.map((review) => ({
              id: review.id ?? "",
              passed: review.passed,
              reviewType: review.reviewType,
            })),
            humanApprovalStatus: finalResult?.humanApprovalStatus ?? "not_required",
            finalCandidateStageId: canonicalSnapshot.currentStage?.id ?? null,
          }),
        )
      : "none";

  const loopGuard = canonicalSnapshot
    ? evaluateAutoTeamLoopGuard({
        tenantId: input.tenantId,
        runId: canonicalSnapshot.runId,
        routeDecision: {
          routeClass: canonicalSnapshot.routeDecision?.routeClass ?? "unknown.blocked",
          id: canonicalSnapshot.routeDecision?.id ?? "",
        },
        recentStages: canonicalSnapshot.stages.slice(-5).map((stage) => ({
          stageType: stage.stageType,
          selectedSkillId: stage.selectedSkillId,
          status: stage.status,
          blockedReason: stage.blockedReason,
          attempt: stage.attempt,
        })),
        outputFingerprint: finalResult?.id ?? null,
        budgetSpent: canonicalSnapshot.mediaJobs.length + canonicalSnapshot.reviews.length,
      })
    : null;

  const timeout =
    canonicalSnapshot?.currentStage
      ? evaluateStageTimeout({
          tenantId: input.tenantId,
          runId: canonicalSnapshot.runId,
          stage: canonicalSnapshot.currentStage as AutoTeamExecutionStageRow,
          now: new Date(),
        })
      : null;

  const contextEngineHealth =
    room?.id || canonicalSnapshot?.runId
      ? await monitoringService.getContextEngineHealth({
          tenantId: input.tenantId,
          teamId,
          roomId: room?.id ?? canonicalSnapshot?.roomId ?? null,
          runId: canonicalSnapshot?.runId ?? room?.lastRunId ?? null,
          userId: input.caller.userId ?? null,
          limit: 8,
        }).catch(() => null)
      : null;

  let retentionUnavailableReason: string | null = null;
  const retention = await getAutoTeamRetentionSummary({
    tenantId: input.tenantId,
  }).catch((error) => {
    retentionUnavailableReason = errorMessageOf(error);
    console.warn("[autoTeamDebugSnapshot] Retention summary unavailable", {
      tenantId: input.tenantId,
      roomId: room?.id ?? input.roomId ?? null,
      runId: run?.id ?? input.runId ?? null,
      error: retentionUnavailableReason,
      stack: error instanceof Error ? error.stack : undefined,
    });
    return buildUnavailableRetentionSummary(input.tenantId);
  });

  const memoryContinuity = {
    roomLanguage: room?.language ?? canonicalSnapshot?.routeDecision?.language ?? "en",
    initiatorUserId: run?.initiatedByUserId ?? null,
    availableMemoryScopes: ["user", "project", "room", "team", "run"],
    guidedChatBacked: room?.roomType !== "auto_team",
    automationLed: room?.roomType === "auto_team" || canonicalSnapshot?.routeDecision?.routeClass !== "unknown.blocked",
  };

  const traceSummary = (canonicalSnapshot?.traceEvents ?? []).map((event) => ({
    sequence: event.sequence,
    traceEventId: event.traceEventId,
    eventName: event.eventName,
    severity: event.severity,
    summary: event.summary,
    idempotencyKey: event.idempotencyKey,
  }));

  const debugVisible = isAutoTeamDebugVisible(input.caller);

  return {
    tenantId: input.tenantId,
    room,
    team,
    request,
    workCase,
    run,
    execution: {
      routeDecision: canonicalSnapshot?.routeDecision as unknown as AutoTeamRouteDecisionRow | null,
      executionMode,
      frozenAt: executionModeSnapshot?.frozenAt ?? asIso(canonicalSnapshot?.routeDecision?.createdAt) ?? null,
      rolloutFlags,
      canonicalSnapshot,
    },
    stages,
    roomMessages,
    mediaJobs: mediaJobs as unknown as AutoTeamMediaJobRefRow[],
    reviews: reviews as unknown as AutoTeamReviewRecordRow[],
    finalResult: finalResult as unknown as AutoTeamFinalResultRow | null,
    workItems,
    agencyRuns,
    migrationVerification,
    missingEvidenceSummary,
    loopGuard,
    timeout,
    observability: {
      budgetDecision,
      providerDecision,
      safetyStatus,
      timeout,
    },
    contextEngineHealth,
    memoryContinuity,
    retention,
    traceSummary,
    rawDiagnostics: debugVisible
      ? {
          canonicalSnapshot,
	          executionModeSnapshot,
	          roomMessages,
	          contextEngineHealth,
	          retentionUnavailableReason,
	        }
	      : null,
	  };
	}
