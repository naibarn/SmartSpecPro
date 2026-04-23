import type { TeamPlanRuntimeStepSummary } from "./teamPlanRuntime";

export interface TeamStepRuntimeSnapshot {
  stepKey: string;
  title: string;
  latestAttemptId: string | null;
  attemptCount: number;
  ownerPersona: string | null;
  reviewerPersona: string | null;
  status: string;
}

export function summarizeTeamStepRuntime(
  step: TeamPlanRuntimeStepSummary,
  input: {
    latestAttemptId?: string | null;
    attemptCount?: number;
  },
): TeamStepRuntimeSnapshot {
  return {
    stepKey: step.stepKey,
    title: step.title,
    latestAttemptId: input.latestAttemptId ?? null,
    attemptCount: Math.max(0, Math.trunc(input.attemptCount ?? 0)),
    ownerPersona: step.ownerPersona,
    reviewerPersona: step.reviewerPersona,
    status: step.status,
  };
}

