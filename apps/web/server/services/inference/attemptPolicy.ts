import type { InferenceAttemptReceipt, InferencePlanR4 } from "./contracts";

export type AttemptRetryDecision =
  | {
      action: "terminal";
      reason:
        | "COMPLETED"
        | "CANCELLED"
        | "UNKNOWN_OUTCOME"
        | "STREAM_COMMITTED"
        | "NON_RETRYABLE_FAILURE"
        | "ATTEMPT_BUDGET_EXHAUSTED"
        | "DEADLINE_EXHAUSTED"
        | "NO_APPROVED_FALLBACK"
        | "IDEMPOTENCY_NOT_CERTIFIED"
        | "PLAN_RECEIPT_MISMATCH";
    }
  | {
      action: "consent_required";
      reason: "LOCKED_ROUTE_FALLBACK_REQUIRES_CONSENT";
    }
  | {
      action: "retry";
      strategy: "preapproved_fallback";
      deploymentId: string;
      attemptOrdinal: number;
    };

const retryableFailures = new Set([
  "rate_limited",
  "provider_unavailable",
  "connection_failed",
]);

/**
 * Determines one safe next attempt. UNKNOWN_OUTCOME is terminal; retries never
 * bypass plan budget, deadline, stream commit, idempotency certification or the
 * approved fallback chain.
 */
export function decideInferenceAttemptRetry(
  plan: InferencePlanR4,
  receipt: InferenceAttemptReceipt,
  nowMs: number,
  providerIdempotencyCertified: boolean
): AttemptRetryDecision {
  if (receipt.planId !== plan.planId)
    return { action: "terminal", reason: "PLAN_RECEIPT_MISMATCH" };
  const expectedDeployment =
    receipt.attemptOrdinal === 1
      ? plan.selectedDeploymentProfile
      : plan.fallbackCandidates[receipt.attemptOrdinal - 2];
  if (!expectedDeployment || receipt.deploymentId !== expectedDeployment) {
    return { action: "terminal", reason: "PLAN_RECEIPT_MISMATCH" };
  }
  if (receipt.outcome === "completed")
    return { action: "terminal", reason: "COMPLETED" };
  if (receipt.outcome === "cancelled")
    return { action: "terminal", reason: "CANCELLED" };
  if (
    receipt.outcome === "unknown" ||
    receipt.submissionState === "unknown" ||
    receipt.normalizedFailure === "unknown_outcome"
  ) {
    return { action: "terminal", reason: "UNKNOWN_OUTCOME" };
  }
  if (receipt.streamCommitted)
    return { action: "terminal", reason: "STREAM_COMMITTED" };
  if (
    !receipt.normalizedFailure ||
    !retryableFailures.has(receipt.normalizedFailure)
  ) {
    return { action: "terminal", reason: "NON_RETRYABLE_FAILURE" };
  }
  if (
    nowMs >= Date.parse(plan.deadlineAt) ||
    nowMs >= Date.parse(plan.overallDeadlineAt)
  ) {
    return { action: "terminal", reason: "DEADLINE_EXHAUSTED" };
  }

  // A user-locked route may only continue after a distinct consent/replan step.
  if (plan.fallbackPermission === "ask") {
    return {
      action: "consent_required",
      reason: "LOCKED_ROUTE_FALLBACK_REQUIRES_CONSENT",
    };
  }
  if (receipt.attemptOrdinal >= plan.attemptBudget)
    return { action: "terminal", reason: "ATTEMPT_BUDGET_EXHAUSTED" };
  if (
    receipt.submissionState === "submitted" &&
    !providerIdempotencyCertified
  ) {
    return { action: "terminal", reason: "IDEMPOTENCY_NOT_CERTIFIED" };
  }

  const nextDeployment = plan.fallbackCandidates[receipt.attemptOrdinal - 1];
  if (plan.fallbackPermission !== "preapproved" || !nextDeployment) {
    return { action: "terminal", reason: "NO_APPROVED_FALLBACK" };
  }
  return {
    action: "retry",
    strategy: "preapproved_fallback",
    deploymentId: nextDeployment,
    attemptOrdinal: receipt.attemptOrdinal + 1,
  };
}
