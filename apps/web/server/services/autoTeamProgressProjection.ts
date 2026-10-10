import {
  assessAgentProgress,
  type AgentProgressAssessment,
  type AgentProgressTaskProfile,
} from "./agentRuntime/progressIntelligence";
import { getAutoTeamStageTimeoutPolicy } from "./autoTeamStageTimeoutPolicy";
import type { AutoTeamStageType } from "../../shared/autoTeamExecution";

const PROGRESS_SUPPORTED_STAGE_TYPES = new Set<AutoTeamStageType>([
  "route",
  "plan",
  "research",
  "storyboard",
  "prompt",
  "media_submit",
  "media_poll",
  "review",
  "repair",
  "human_approval",
  "finalize",
]);

type ProgressStage = {
  id: string;
  planStepKey: string;
  stageType: Parameters<typeof getAutoTeamStageTimeoutPolicy>[0];
  status: string;
  attempt: number;
  maxAttempts: number;
  startedAt: Date | string | null;
  completedAt: Date | string | null;
  claimExpiresAt: Date | string | null;
};

export function assessAutoTeamRunProgress(input: {
  tenantId: string;
  runId: string;
  runStatus: string | null;
  stages: ProgressStage[];
  currentStage: ProgressStage | null;
  activeProviderStatuses: Array<{ stageId: string | null; status: string }>;
  finalResultId: string | null;
  finalResultAccepted: boolean;
  loopDetected: boolean;
  nowMs?: number;
}): AgentProgressAssessment | null {
  if (
    input.stages.some(item => !PROGRESS_SUPPORTED_STAGE_TYPES.has(item.stageType)) ||
    (input.currentStage && !PROGRESS_SUPPORTED_STAGE_TYPES.has(input.currentStage.stageType))
  ) {
    return null;
  }
  const nowMs = input.nowMs ?? Date.now();
  const stage = input.currentStage;
  const policyStage = stage ?? input.stages.at(-1) ?? null;
  const taskProfile: AgentProgressTaskProfile =
    policyStage?.stageType === "media_poll"
      ? "provider_job"
      : policyStage?.stageType === "research" || policyStage?.stageType === "storyboard"
        ? "long_running"
        : policyStage?.stageType === "route" || policyStage?.stageType === "prompt"
          ? "interactive"
          : "standard";
  const threshold = policyStage ? getAutoTeamStageTimeoutPolicy(policyStage.stageType).timeoutMs : 0;
  const toMs = (value: Date | string | null | undefined): number | null => {
    if (!value) return null;
    const parsed = value instanceof Date ? value.getTime() : Date.parse(value);
    return Number.isFinite(parsed) ? parsed : null;
  };
  const latestStageByPlanStep = new Map<string, ProgressStage>();
  for (const item of input.stages) {
    const previous = latestStageByPlanStep.get(item.planStepKey);
    if (!previous || item.attempt >= previous.attempt) {
      latestStageByPlanStep.set(item.planStepKey, item);
    }
  }
  const requiredStages = [...latestStageByPlanStep.values()];
  const completedStages = requiredStages.filter(item => item.status === "completed");
  const finalAccepted = input.finalResultAccepted && Boolean(input.finalResultId);
  const criterionCount = requiredStages.length + 1;
  const currentProgress = (completedStages.length + (finalAccepted ? 1 : 0)) / criterionCount;
  const recentlyCompletedWorkUnit = lastCompletedAtFor(requiredStages, nowMs, toMs, threshold);
  const requiredCriteria = [
    ...requiredStages.map(item => ({
      criterionId: `work-unit:${item.id}`,
      required: true,
      weight: 1,
      status: item.status === "completed" ? "verified" as const : "pending" as const,
      evidenceRefs: [`work-unit:${item.id}`],
    })),
    {
      criterionId: "accepted-final-result",
      required: true,
      weight: 1,
      status: finalAccepted ? "verified" as const : "pending" as const,
      evidenceRefs: finalAccepted ? [`final-result:${input.finalResultId}`] : [],
    },
  ];
  const evidence = [
    ...completedStages.map(item => ({
      tenantId: input.tenantId,
      evidenceRef: `work-unit:${item.id}`,
      kind: "verified_work_unit" as const,
      status: "verified" as const,
    })),
    ...(finalAccepted ? [{
      tenantId: input.tenantId,
      evidenceRef: `final-result:${input.finalResultId}`,
      kind: "accepted_receipt" as const,
      status: "verified" as const,
    }] : []),
  ];
  const lastCompletedAt = completedStages
    .map(item => toMs(item.completedAt))
    .filter((value): value is number => value !== null)
    .sort((left, right) => right - left)[0] ?? null;
  const stageStartedAt = toMs(stage?.startedAt);
  const lastMeaningfulProgressAtMs = lastCompletedAt === null
    ? stageStartedAt
    : stageStartedAt === null
      ? lastCompletedAt
      : Math.max(lastCompletedAt, stageStartedAt);
  const runStatus = input.runStatus;
  const executionStatus = runStatus === "completed" ? "completed" as const
    : runStatus === "failed" ? "failed" as const
      : runStatus === "stopped" || runStatus === "cancelled" ? "cancelled" as const
        : runStatus === "queued" ? "queued" as const
          : "running" as const;
  const recoveryStage = input.stages.find(item => item.stageType === "repair");
  const recoveryStatus = recoveryStage?.status === "in_progress" ? "in_progress" as const
    : recoveryStage?.status === "failed" && recoveryStage.attempt >= recoveryStage.maxAttempts
      ? "exhausted" as const
      : "none" as const;
  const activeExternalOperation = Boolean(stage && input.activeProviderStatuses.some(job =>
    job.stageId === stage.id && !["completed", "failed", "cancelled"].includes(job.status.toLowerCase()),
  ));
  const timeoutWindow = Math.max(1, threshold);

  return assessAgentProgress({
    tenantId: input.tenantId,
    taskId: input.runId,
    executionStatus,
    recoveryStatus,
    taskProfile,
    nowMs,
    lastHeartbeatAtMs: toMs(stage?.claimExpiresAt),
    lastMeaningfulProgressAtMs,
    stallWindowMsByTaskProfile: {
      interactive: taskProfile === "interactive" ? timeoutWindow : 60_000,
      standard: taskProfile === "standard" ? timeoutWindow : 300_000,
      long_running: taskProfile === "long_running" ? timeoutWindow : 1_800_000,
      provider_job: taskProfile === "provider_job" ? timeoutWindow : 900_000,
    },
    loopDetectionMinRepeats: 3,
    previousProgress: recentlyCompletedWorkUnit
      ? Math.max(0, currentProgress - 1 / criterionCount)
      : currentProgress,
    previousPeakProgress: currentProgress,
    activeExternalOperation,
    waitingOn: stage?.status === "blocked"
      ? { kind: stage.stageType, dependencyRef: stage.id }
      : null,
    externalLoopDetected: input.loopDetected,
    requiredCriteria,
    evidence,
    previousVerifiedEvidenceRefs: [],
    invalidatedEvidenceRefs: [],
    toolCalls: [],
  });
}

function lastCompletedAtFor(
  stages: ProgressStage[],
  nowMs: number,
  toMs: (value: Date | string | null | undefined) => number | null,
  windowMs: number,
): boolean {
  const latest = stages
    .filter(item => item.status === "completed")
    .map(item => toMs(item.completedAt))
    .filter((value): value is number => value !== null)
    .sort((left, right) => right - left)[0];
  return latest !== undefined && windowMs > 0 && nowMs - latest < windowMs;
}
