export function evaluateBrowserPolicyReleaseReadiness(input: {
  regressionSuitePassed: boolean;
  abuseSuitePassed: boolean;
  auditCompletenessReady: boolean;
  redTeamPassed: boolean;
  rollbackReady: boolean;
  rawBrowserBypassClosed: boolean;
}): { passed: boolean; failedChecks: string[] } {
  const failedChecks: string[] = [];

  if (!input.regressionSuitePassed) {
    failedChecks.push("regression_suite_failed");
  }

  if (!input.abuseSuitePassed) {
    failedChecks.push("abuse_suite_failed");
  }

  if (!input.auditCompletenessReady) {
    failedChecks.push("audit_completeness_missing");
  }

  if (!input.redTeamPassed) {
    failedChecks.push("red_team_incomplete");
  }

  if (!input.rollbackReady) {
    failedChecks.push("rollback_not_ready");
  }

  if (!input.rawBrowserBypassClosed) {
    failedChecks.push("raw_browser_bypass_open");
  }

  return {
    passed: failedChecks.length === 0,
    failedChecks,
  };
}

export function evaluateBrowserPolicyRollbackReadiness(input: {
  tenantFacingAccessDisabled: boolean;
  additiveTablesPreserved: boolean;
  approvalFlowsHealthy: boolean;
  rawBrowserBypassClosed: boolean;
}): { ready: boolean; failedChecks: string[] } {
  const failedChecks: string[] = [];

  if (!input.tenantFacingAccessDisabled) {
    failedChecks.push("tenant_disable_first");
  }

  if (!input.additiveTablesPreserved) {
    failedChecks.push("additive_tables_not_preserved");
  }

  if (!input.approvalFlowsHealthy) {
    failedChecks.push("approval_flows_unhealthy");
  }

  if (!input.rawBrowserBypassClosed) {
    failedChecks.push("raw_browser_bypass_open");
  }

  return {
    ready: failedChecks.length === 0,
    failedChecks,
  };
}
