"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.evaluateBrowserPolicyReleaseReadiness = evaluateBrowserPolicyReleaseReadiness;
exports.evaluateBrowserPolicyRollbackReadiness = evaluateBrowserPolicyRollbackReadiness;
function evaluateBrowserPolicyReleaseReadiness(input) {
    var failedChecks = [];
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
        failedChecks: failedChecks,
    };
}
function evaluateBrowserPolicyRollbackReadiness(input) {
    var failedChecks = [];
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
        failedChecks: failedChecks,
    };
}
