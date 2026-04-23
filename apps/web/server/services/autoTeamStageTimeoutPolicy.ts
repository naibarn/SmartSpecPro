import {
  AUTO_TEAM_STAGE_TYPES,
  type AutoTeamStageStatus,
  type AutoTeamStageType,
} from "../../shared/autoTeamExecution";

export interface AutoTeamStageTimeoutPolicy {
  stageType: AutoTeamStageType;
  timeoutMs: number;
  retryable: boolean;
  escalatesToHuman: boolean;
  blockedReason?: string | null;
}

export interface AutoTeamStageTimeoutEvaluation {
  stageType: AutoTeamStageType;
  timeoutMs: number;
  deadlineAt: Date;
  expired: boolean;
  retryable: boolean;
  escalatesToHuman: boolean;
  blockedReason: string | null;
  status: AutoTeamStageStatus;
}

const DEFAULT_TIMEOUTS: Record<AutoTeamStageType, AutoTeamStageTimeoutPolicy> = {
  route: { stageType: "route", timeoutMs: 30_000, retryable: true, escalatesToHuman: false },
  plan: { stageType: "plan", timeoutMs: 120_000, retryable: true, escalatesToHuman: false },
  research: { stageType: "research", timeoutMs: 300_000, retryable: true, escalatesToHuman: false },
  storyboard: { stageType: "storyboard", timeoutMs: 300_000, retryable: true, escalatesToHuman: false },
  prompt: { stageType: "prompt", timeoutMs: 180_000, retryable: true, escalatesToHuman: false },
  media_submit: { stageType: "media_submit", timeoutMs: 120_000, retryable: true, escalatesToHuman: false },
  media_poll: { stageType: "media_poll", timeoutMs: 30 * 60_000, retryable: true, escalatesToHuman: true },
  agency_delegate: { stageType: "agency_delegate", timeoutMs: 120_000, retryable: true, escalatesToHuman: true },
  review: { stageType: "review", timeoutMs: 300_000, retryable: true, escalatesToHuman: true },
  repair: { stageType: "repair", timeoutMs: 300_000, retryable: true, escalatesToHuman: true },
  human_approval: { stageType: "human_approval", timeoutMs: 300_000, retryable: false, escalatesToHuman: true },
  finalize: { stageType: "finalize", timeoutMs: 60_000, retryable: false, escalatesToHuman: true },
};

export function getAutoTeamStageTimeoutPolicy(
  stageType: AutoTeamStageType,
): AutoTeamStageTimeoutPolicy {
  return DEFAULT_TIMEOUTS[stageType] ?? DEFAULT_TIMEOUTS.finalize;
}

export function evaluateAutoTeamStageTimeout(input: {
  stageType: AutoTeamStageType;
  status: AutoTeamStageStatus;
  startedAt?: Date | string | null;
  now?: Date;
  routeBlockedReason?: string | null;
}): AutoTeamStageTimeoutEvaluation {
  const policy = getAutoTeamStageTimeoutPolicy(input.stageType);
  const startedAt = input.startedAt ? new Date(input.startedAt) : new Date();
  const now = input.now ?? new Date();
  const deadlineAt = new Date(startedAt.getTime() + policy.timeoutMs);
  const expired = now.getTime() > deadlineAt.getTime();

  return {
    stageType: input.stageType,
    timeoutMs: policy.timeoutMs,
    deadlineAt,
    expired,
    retryable: policy.retryable,
    escalatesToHuman: policy.escalatesToHuman,
    blockedReason: input.routeBlockedReason ?? policy.blockedReason ?? null,
    status: input.status,
  };
}

// Backward-compatible alias used by existing service imports.
export const evaluateStageTimeout = evaluateAutoTeamStageTimeout;

export function isAutoTeamStageTerminal(status: AutoTeamStageStatus): boolean {
  return [
    "completed",
    "failed",
    "cancelled",
    "blocked",
    "superseded",
    "needs_revision",
  ].includes(status);
}

export function getAutoTeamStageTypes(): AutoTeamStageType[] {
  return [...AUTO_TEAM_STAGE_TYPES];
}
