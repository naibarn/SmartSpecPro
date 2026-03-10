import type { BrowserActionClass } from "../../shared/browserPolicy";

export type BrowserPolicyRolloutTransition =
  | "observe_to_read_only"
  | "read_only_to_draft"
  | "draft_to_commit"
  | "commit_to_expanded";

export interface BrowserPolicyRolloutInput {
  observedDays?: number;
  totalDecisions?: number;
  reviewedSampleSize?: number;
  precision?: number;
  falsePositiveRate?: number;
  falseNegativeRate?: number;
  stableDays?: number;
  p0p1Misses?: number;
  denyPrecision?: number;
  approvalUxSignedOff?: boolean;
  incidentFreeDays?: number;
  approvalAbandonmentPercent?: number;
  redTeamPassed?: boolean;
  auditCompletenessReady?: boolean;
}

export function evaluateBrowserPolicyRolloutGate(
  transition: BrowserPolicyRolloutTransition,
  input: BrowserPolicyRolloutInput,
): { passed: boolean; failedChecks: string[] } {
  const failedChecks: string[] = [];

  if (transition === "observe_to_read_only") {
    if ((input.observedDays ?? 0) < 14) failedChecks.push("minimum_observed_days");
    if ((input.totalDecisions ?? 0) < 10_000) failedChecks.push("minimum_total_decisions");
    if ((input.reviewedSampleSize ?? 0) < 500) failedChecks.push("minimum_reviewed_sample");
    if ((input.precision ?? 0) < 0.98) failedChecks.push("precision_gate");
    if ((input.falsePositiveRate ?? 1) > 0.01) failedChecks.push("false_positive_gate");
    if ((input.falseNegativeRate ?? 1) > 0.02) failedChecks.push("false_negative_gate");
    if ((input.stableDays ?? 0) < 7) failedChecks.push("stability_window");
    if ((input.p0p1Misses ?? 1) > 0) failedChecks.push("p0_p1_misses");
  }

  if (transition === "read_only_to_draft") {
    if ((input.denyPrecision ?? 0) < 0.99) failedChecks.push("deny_precision_gate");
    if (!input.approvalUxSignedOff) failedChecks.push("approval_ux_signoff_missing");
  }

  if (transition === "draft_to_commit") {
    if ((input.incidentFreeDays ?? 0) < 7) failedChecks.push("incident_free_window");
    if ((input.approvalAbandonmentPercent ?? 100) >= 10) failedChecks.push("approval_abandonment_gate");
  }

  if (transition === "commit_to_expanded") {
    if ((input.incidentFreeDays ?? 0) < 14) failedChecks.push("incident_free_window");
    if (!input.redTeamPassed) failedChecks.push("red_team_incomplete");
    if (!input.auditCompletenessReady) failedChecks.push("audit_completeness_missing");
  }

  return {
    passed: failedChecks.length === 0,
    failedChecks,
  };
}

export function isObserveModeWriteSafe(input: {
  productionSurface: boolean;
  actionClass: BrowserActionClass;
}): boolean {
  if (!input.productionSurface) {
    return true;
  }

  return input.actionClass === "read" || input.actionClass === "draft";
}
