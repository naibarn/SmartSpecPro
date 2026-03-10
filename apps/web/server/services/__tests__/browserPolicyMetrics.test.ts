import { describe, expect, it } from "vitest";

import {
  summarizeBrowserPolicyMetrics,
  type BrowserPolicyMetricSample,
} from "../browserPolicyMetrics";

describe("browser policy metrics", () => {
  it("computes decision counts, latency classes, and audit-write failures", () => {
    const summary = summarizeBrowserPolicyMetrics([
      {
        actionClass: "read",
        decision: "allow",
        latencyMs: 40,
        outcome: "success",
        auditWriteFailed: false,
      },
      {
        actionClass: "restricted",
        decision: "require_approval",
        latencyMs: 210,
        outcome: "soft_timeout",
        auditWriteFailed: false,
      },
      {
        actionClass: "commit",
        decision: "deny",
        latencyMs: 1100,
        outcome: "hard_failure",
        auditWriteFailed: true,
      },
    ] satisfies BrowserPolicyMetricSample[]);

    expect(summary.decisionCounts).toEqual({
      allow: 1,
      deny: 1,
      requireApproval: 1,
    });
    expect(summary.latencyClasses).toEqual({
      success: 1,
      softTimeout: 1,
      hardFailure: 1,
    });
    expect(summary.auditWriteFailures).toBe(1);
    expect(summary.byActionClass.restricted.requireApproval).toBe(1);
  });
});
