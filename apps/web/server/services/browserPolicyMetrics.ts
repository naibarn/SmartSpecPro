import type {
  BrowserActionClass,
  BrowserPolicyDecision,
} from "../../shared/browserPolicy";

export interface BrowserPolicyMetricSample {
  actionClass: BrowserActionClass;
  decision: BrowserPolicyDecision;
  latencyMs: number;
  outcome: "success" | "soft_timeout" | "hard_failure";
  auditWriteFailed: boolean;
}

export function summarizeBrowserPolicyMetrics(
  samples: BrowserPolicyMetricSample[],
) {
  const decisionCounts = {
    allow: 0,
    deny: 0,
    requireApproval: 0,
  };
  const latencyClasses = {
    success: 0,
    softTimeout: 0,
    hardFailure: 0,
  };
  const byActionClass = {
    read: { allow: 0, deny: 0, requireApproval: 0 },
    draft: { allow: 0, deny: 0, requireApproval: 0 },
    commit: { allow: 0, deny: 0, requireApproval: 0 },
    restricted: { allow: 0, deny: 0, requireApproval: 0 },
  };

  let auditWriteFailures = 0;

  for (const sample of samples) {
    if (sample.decision === "allow" || sample.decision === "allow_with_redaction") {
      decisionCounts.allow += 1;
      byActionClass[sample.actionClass].allow += 1;
    } else if (sample.decision === "deny" || sample.decision === "escalate_for_review") {
      decisionCounts.deny += 1;
      byActionClass[sample.actionClass].deny += 1;
    } else {
      decisionCounts.requireApproval += 1;
      byActionClass[sample.actionClass].requireApproval += 1;
    }

    if (sample.outcome === "success") {
      latencyClasses.success += 1;
    } else if (sample.outcome === "soft_timeout") {
      latencyClasses.softTimeout += 1;
    } else {
      latencyClasses.hardFailure += 1;
    }

    if (sample.auditWriteFailed) {
      auditWriteFailures += 1;
    }
  }

  return {
    decisionCounts,
    latencyClasses,
    auditWriteFailures,
    byActionClass,
  };
}
