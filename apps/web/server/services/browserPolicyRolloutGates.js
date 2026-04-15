"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.evaluateBrowserPolicyRolloutGate = evaluateBrowserPolicyRolloutGate;
exports.isObserveModeWriteSafe = isObserveModeWriteSafe;
function evaluateBrowserPolicyRolloutGate(transition, input) {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m;
    var failedChecks = [];
    if (transition === "observe_to_read_only") {
        if (((_a = input.observedDays) !== null && _a !== void 0 ? _a : 0) < 14)
            failedChecks.push("minimum_observed_days");
        if (((_b = input.totalDecisions) !== null && _b !== void 0 ? _b : 0) < 10000)
            failedChecks.push("minimum_total_decisions");
        if (((_c = input.reviewedSampleSize) !== null && _c !== void 0 ? _c : 0) < 500)
            failedChecks.push("minimum_reviewed_sample");
        if (((_d = input.precision) !== null && _d !== void 0 ? _d : 0) < 0.98)
            failedChecks.push("precision_gate");
        if (((_e = input.falsePositiveRate) !== null && _e !== void 0 ? _e : 1) > 0.01)
            failedChecks.push("false_positive_gate");
        if (((_f = input.falseNegativeRate) !== null && _f !== void 0 ? _f : 1) > 0.02)
            failedChecks.push("false_negative_gate");
        if (((_g = input.stableDays) !== null && _g !== void 0 ? _g : 0) < 7)
            failedChecks.push("stability_window");
        if (((_h = input.p0p1Misses) !== null && _h !== void 0 ? _h : 1) > 0)
            failedChecks.push("p0_p1_misses");
    }
    if (transition === "read_only_to_draft") {
        if (((_j = input.denyPrecision) !== null && _j !== void 0 ? _j : 0) < 0.99)
            failedChecks.push("deny_precision_gate");
        if (!input.approvalUxSignedOff)
            failedChecks.push("approval_ux_signoff_missing");
    }
    if (transition === "draft_to_commit") {
        if (((_k = input.incidentFreeDays) !== null && _k !== void 0 ? _k : 0) < 7)
            failedChecks.push("incident_free_window");
        if (((_l = input.approvalAbandonmentPercent) !== null && _l !== void 0 ? _l : 100) >= 10)
            failedChecks.push("approval_abandonment_gate");
    }
    if (transition === "commit_to_expanded") {
        if (((_m = input.incidentFreeDays) !== null && _m !== void 0 ? _m : 0) < 14)
            failedChecks.push("incident_free_window");
        if (!input.redTeamPassed)
            failedChecks.push("red_team_incomplete");
        if (!input.auditCompletenessReady)
            failedChecks.push("audit_completeness_missing");
    }
    return {
        passed: failedChecks.length === 0,
        failedChecks: failedChecks,
    };
}
function isObserveModeWriteSafe(input) {
    if (!input.productionSurface) {
        return true;
    }
    return input.actionClass === "read" || input.actionClass === "draft";
}
