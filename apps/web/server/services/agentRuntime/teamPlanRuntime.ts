import type { AutoTeamLedgerStep } from "../autoTeamLedgerService";

export interface TeamPlanRuntimeStepSummary {
  stepKey: string;
  title: string;
  status: string;
  ownerPersona: string | null;
  ownerMemberId: string | null;
  reviewerPersona: string | null;
  reviewerMemberId: string | null;
  deliverable: string | null;
  stepLinks: AutoTeamLedgerStep["stepLinks"];
  attemptIds: string[];
  latestAttemptId: string | null;
  openFindingCount: number;
  resolvedFindingCount: number;
}

export function summarizeTeamPlanSteps(
  steps: AutoTeamLedgerStep[] | null | undefined,
): TeamPlanRuntimeStepSummary[] {
  return (steps ?? []).map((step) => ({
    stepKey: step.stepKey,
    title: step.title,
    status: step.status,
    ownerPersona: step.ownerPersona,
    ownerMemberId: step.ownerMemberId,
    reviewerPersona: step.reviewerPersona,
    reviewerMemberId: step.reviewerMemberId,
    deliverable: step.deliverable,
    stepLinks: step.stepLinks ?? [],
    attemptIds: step.attemptIds ?? [],
    latestAttemptId: step.latestAttemptId ?? null,
    openFindingCount: step.openFindingCount ?? 0,
    resolvedFindingCount: step.resolvedFindingCount ?? 0,
  }));
}

export function countTeamPlanStepLinks(
  steps: AutoTeamLedgerStep[] | null | undefined,
): number {
  return (steps ?? []).reduce(
    (total, step) => total + (step.stepLinks?.length ?? 0),
    0,
  );
}
