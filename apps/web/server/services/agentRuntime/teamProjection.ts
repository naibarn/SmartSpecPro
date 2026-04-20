import {
  AgentRuntimeResponseSchema,
  type AgentRuntimeResponse,
  type AgentRuntimeStepLink,
  type ReviewVerdict,
} from "../../../shared/agentRuntime/types";

export interface TeamExecutionStageProjection {
  stepKey: string;
  attemptId: string | null;
  ownerMemberId: string | null;
  reviewerMemberId: string | null;
  stageStatus: string;
  traceId: string | null;
}

export interface TeamReviewProjection {
  stepKey: string;
  attemptId: string | null;
  reviewerMemberId: string | null;
  verdict: ReviewVerdict["status"];
  score: number | null;
  issues: string[];
  recommendation: string | null;
}

export interface TeamFinalResultProjection {
  stepKey: string;
  attemptId: string | null;
  status: AgentRuntimeResponse["status"];
  terminalReason: AgentRuntimeResponse["terminalReason"];
  evidenceRefs: string[];
}

export interface TeamMessageMetadataProjection {
  requestId: string;
  stepKey: string;
  attemptId: string | null;
  status: AgentRuntimeResponse["status"];
  stepLinks: AgentRuntimeStepLink[];
}

export interface ProjectTeamRuntimeResponseInput {
  requestId: string;
  response: AgentRuntimeResponse;
  fallbackStepKey?: string | null;
}

export interface TeamProjectionResult {
  executionStage: TeamExecutionStageProjection | null;
  reviewRecord: TeamReviewProjection | null;
  finalResult: TeamFinalResultProjection | null;
  messageMetadata: TeamMessageMetadataProjection | null;
}

export function dedupeStepLinks(
  stepLinks: AgentRuntimeStepLink[],
): AgentRuntimeStepLink[] {
  const seen = new Set<string>();
  const deduped: AgentRuntimeStepLink[] = [];
  for (const link of stepLinks) {
    const key = [
      link.linkType,
      link.stepKey,
      link.attemptId ?? "",
      link.traceId ?? "",
      link.checkpointId ?? "",
      link.messageId ?? "",
      link.anchorId ?? "",
    ].join(":");
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(link);
  }
  return deduped;
}

function resolveProjectionStepKey(
  response: AgentRuntimeResponse,
  fallbackStepKey?: string | null,
): string | null {
  return (
    response.stepLinks[0]?.stepKey ??
    response.stepId ??
    fallbackStepKey ??
    null
  );
}

function resolveStageStatus(response: AgentRuntimeResponse): string {
  if (response.reviewVerdict?.status === "pass") return "approved";
  if (response.reviewVerdict?.status === "needs_repair") return "needs_repair";
  if (response.reviewVerdict?.status === "fail") return "rejected";
  if (response.reviewVerdict?.status === "blocked") return "blocked";
  return response.status;
}

export function projectTeamRuntimeResponse(
  input: ProjectTeamRuntimeResponseInput,
): TeamProjectionResult {
  const response = AgentRuntimeResponseSchema.parse(input.response);
  const stepLinks = dedupeStepLinks(response.stepLinks);
  const stepKey = resolveProjectionStepKey(response, input.fallbackStepKey);
  const attemptId = response.attemptId ?? stepLinks[0]?.attemptId ?? null;

  if (!stepKey) {
    return {
      executionStage: null,
      reviewRecord: null,
      finalResult: null,
      messageMetadata: null,
    };
  }

  return {
    executionStage: {
      stepKey,
      attemptId,
      ownerMemberId: response.stepAssignment?.ownerMemberId ?? null,
      reviewerMemberId: response.stepAssignment?.reviewerMemberId ?? null,
      stageStatus: resolveStageStatus(response),
      traceId: response.traceId ?? stepLinks[0]?.traceId ?? null,
    },
    reviewRecord: response.reviewVerdict
      ? {
          stepKey,
          attemptId,
          reviewerMemberId: response.stepAssignment?.reviewerMemberId ?? null,
          verdict: response.reviewVerdict.status,
          score: response.reviewVerdict.score ?? null,
          issues: response.reviewVerdict.issues,
          recommendation: response.reviewVerdict.recommendation ?? null,
        }
      : null,
    finalResult:
      response.status === "completed" ||
      response.status === "failed" ||
      response.status === "cancelled"
        ? {
            stepKey,
            attemptId,
            status: response.status,
            terminalReason: response.terminalReason ?? null,
            evidenceRefs: response.evidenceRefs,
          }
        : null,
    messageMetadata: {
      requestId: input.requestId,
      stepKey,
      attemptId,
      status: response.status,
      stepLinks,
    },
  };
}
