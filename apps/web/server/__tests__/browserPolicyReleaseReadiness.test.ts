import { describe, expect, it } from "vitest";

import {
  evaluateBrowserPolicyReleaseReadiness,
  evaluateBrowserPolicyRollbackReadiness,
} from "../services/browserPolicyReleaseReadiness";

describe("browser policy release readiness", () => {
  it("blocks commit rollout when audit completeness or red-team checks are incomplete", () => {
    const result = evaluateBrowserPolicyReleaseReadiness({
      regressionSuitePassed: true,
      abuseSuitePassed: true,
      auditCompletenessReady: false,
      redTeamPassed: false,
      rollbackReady: true,
      rawBrowserBypassClosed: true,
    });

    expect(result.passed).toBe(false);
    expect(result.failedChecks).toContain("audit_completeness_missing");
    expect(result.failedChecks).toContain("red_team_incomplete");
  });

  it("requires tenant disablement first during rollback posture checks", () => {
    const result = evaluateBrowserPolicyRollbackReadiness({
      tenantFacingAccessDisabled: false,
      additiveTablesPreserved: true,
      approvalFlowsHealthy: true,
      rawBrowserBypassClosed: true,
    });

    expect(result.ready).toBe(false);
    expect(result.failedChecks).toContain("tenant_disable_first");
  });
});
