export type ReconciliationAction =
  "cancel" | "resume" | "hold" | "wait" | "fail_review";

export type WaitingExternalEvidence = {
  operationKey: string;
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
