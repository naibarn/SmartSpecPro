export type ReconciliationAction =
  "cancel" | "resume" | "hold" | "wait" | "fail_review";

export type WaitingExternalEvidence = {
  operationKey: string;
  waitReason?: "budget" | "provider_capacity";
  runStatus: string | null;
  providerReference: string | null;
  resumeAfter: string | null;
  now: Date;
};

export type WaitingExternalDecision = {
  action: ReconciliationAction;
  reasonCode: string;
  explanation: string;
  operatorReviewRequired: boolean;
};

const STORYBOARD_PAUSE_PREFIX = "storyboard.pause:";

/**
 * Decide the next action from persisted evidence only. This deliberately
 * avoids guessing that a missing provider callback is safe to retry.
 */
export function classifyWaitingExternal(
  evidence: WaitingExternalEvidence
): WaitingExternalDecision {
  const { operationKey, runStatus, resumeAfter, now } = evidence;
  const isStoryboardPause = operationKey.startsWith(STORYBOARD_PAUSE_PREFIX);

  if (operationKey.startsWith("development-dependency:")) {
    return {
      action: "wait",
      reasonCode: "development_dependency_unsatisfied",
      explanation: "The dependency predicate is non-terminal; keep its durable work handoff available for event or reconciliation evidence.",
      operatorReviewRequired: false,
    };
  }

  if (evidence.waitReason === "budget" || evidence.waitReason === "provider_capacity") {
    const resumeAt = resumeAfter ? Date.parse(resumeAfter) : Number.NaN;
    if (!Number.isFinite(resumeAt)) {
      return {
        action: "hold",
        reasonCode: evidence.waitReason === "budget" ? "budget_wait_without_eligible_time" : "capacity_wait_without_eligible_time",
        explanation: "A typed capacity wait without a durable next eligible time remains held for safe repair.",
        operatorReviewRequired: false,
      };
    }
    if (resumeAt > now.getTime()) {
      return {
        action: "wait",
        reasonCode: evidence.waitReason === "budget" ? "budget_not_yet_eligible" : "provider_capacity_not_yet_eligible",
        explanation: "Keep the existing WorkUnit parked until its persisted retry time.",
        operatorReviewRequired: false,
      };
    }
    return {
      action: "resume",
      reasonCode: evidence.waitReason === "budget" ? "budget_retry_due" : "provider_capacity_retry_due",
      explanation: "The bounded wait time elapsed; re-enter the same canonical WorkUnit and let admission decide again.",
      operatorReviewRequired: false,
    };
  }

  if (isStoryboardPause) {
    if (runStatus === "cancel_requested") {
      return {
        action: "cancel",
        reasonCode: "domain_run_cancel_requested",
        explanation:
          "The domain run requested cancellation while its internal continuation was waiting.",
        operatorReviewRequired: false,
      };
    }
    if (runStatus === "cancelled") {
      return {
        action: "cancel",
        reasonCode: "domain_run_cancelled",
        explanation:
          "The domain run is already cancelled; its continuation must be terminal too.",
        operatorReviewRequired: false,
      };
    }
    if (operationKey.includes(":ambiguous:")) {
      return {
        action: "fail_review",
        reasonCode: "ambiguous_provider_submission",
        explanation:
          "The provider submission outcome is ambiguous and must not be retried automatically.",
        operatorReviewRequired: true,
      };
    }
    if (runStatus === "paused" || runStatus === "partial") {
      return {
        action: "hold",
        reasonCode: "domain_run_paused",
        explanation:
          "The domain run is intentionally paused or awaiting repair.",
        operatorReviewRequired: false,
      };
    }
    if (runStatus === "queued" || runStatus === "running") {
      return {
        action: "resume",
        reasonCode: "domain_run_active",
        explanation:
          "The domain run is active again; resume the internal continuation through the outbox.",
        operatorReviewRequired: false,
      };
    }
    return {
      action: "cancel",
      reasonCode: "domain_run_missing",
      explanation:
        "The internal storyboard wait has no verifiable domain run to resume.",
      operatorReviewRequired: false,
    };
  }

  const resumeAt = resumeAfter ? Date.parse(resumeAfter) : Number.NaN;
  if (Number.isFinite(resumeAt) && resumeAt > now.getTime()) {
    return {
      action: "wait",
      reasonCode: "external_operation_pending",
      explanation:
        "A real external operation is still inside its persisted wait window.",
      operatorReviewRequired: false,
    };
  }

  return {
    action: "fail_review",
    reasonCode: "external_wait_unknown",
    explanation:
      "The external wait deadline passed without verifiable provider completion evidence.",
    operatorReviewRequired: true,
  };
}
