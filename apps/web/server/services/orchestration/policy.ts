import { JobControlPlaneError } from "../jobControlPlaneTypes";
import type {
  CapabilityOffer,
  DecisionRecord,
  PlanRevision,
} from "./contracts";

export type OrchestrationPolicy = {
  version: string;
  allowedJobTypes?: ReadonlySet<string>;
  maxSteps: number;
  maxEstimatedCostCredits?: number;
  requireApprovalForExternal: boolean;
};

export function evaluatePlanPolicy(
  plan: PlanRevision,
  offers: readonly CapabilityOffer[],
  policy: OrchestrationPolicy
): DecisionRecord {
  const reasons: string[] = [];
  if (plan.steps.length === 0 || plan.steps.length > policy.maxSteps)
    reasons.push("step_limit");
  const unavailable = offers
    .filter(offer => !offer.available)
    .map(offer => offer.capabilityId);
  if (unavailable.length > 0) reasons.push("capability_unavailable");
  if (
    policy.allowedJobTypes &&
    plan.steps.some(step => !policy.allowedJobTypes?.has(step.jobType))
  )
    reasons.push("job_type_not_allowed");
  const estimatedCost = offers.reduce(
    (sum, offer) => sum + (offer.estimatedCostCredits ?? 0),
    0
  );
  if (
    policy.maxEstimatedCostCredits !== undefined &&
    estimatedCost > policy.maxEstimatedCostCredits
  )
    reasons.push("cost_limit");
  if (
    policy.requireApprovalForExternal &&
    plan.steps.some(step => step.executionClass === "external")
  )
    reasons.push("external_approval_required");
  const outcome = reasons.some(reason =>
    [
      "step_limit",
      "capability_unavailable",
      "job_type_not_allowed",
      "cost_limit",
    ].includes(reason)
  )
    ? "deny"
    : reasons.length > 0
      ? "needs_approval"
      : "allow";
  return {
    decisionId: `decision:${plan.planId}:${plan.revision}:${policy.version}`,
    planId: plan.planId,
    planRevision: plan.revision,
    policyVersion: policy.version,
    outcome,
    reasons,
  };
}

export function assertApprovedPlan(input: {
  plan: PlanRevision;
  approval?: { planId: string; planRevision: number; decision: string };
}): void {
  if (
    input.plan.status !== "approved" ||
    input.approval?.decision !== "approved" ||
    input.approval.planId !== input.plan.planId ||
    input.approval.planRevision !== input.plan.revision
  ) {
    throw new JobControlPlaneError(
      "ORCHESTRATION_APPROVAL_REQUIRED",
      "Plan approval is missing or stale"
    );
  }
}
