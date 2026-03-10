"""Browser policy rollout and rollback gate helpers."""

from __future__ import annotations


def evaluate_browser_policy_rollout_gate(
    transition: str,
    metrics: dict[str, float | int | bool],
) -> dict[str, object]:
    failed_checks: list[str] = []

    if transition == "observe_to_read_only":
        if int(metrics.get("observed_days", 0)) < 14:
            failed_checks.append("minimum_observed_days")
        if int(metrics.get("total_decisions", 0)) < 10_000:
            failed_checks.append("minimum_total_decisions")
        if int(metrics.get("reviewed_sample_size", 0)) < 500:
            failed_checks.append("minimum_reviewed_sample")
        if float(metrics.get("precision", 0)) < 0.98:
            failed_checks.append("precision_gate")
        if float(metrics.get("false_positive_rate", 1)) > 0.01:
            failed_checks.append("false_positive_gate")
        if float(metrics.get("false_negative_rate", 1)) > 0.02:
            failed_checks.append("false_negative_gate")
        if int(metrics.get("stable_days", 0)) < 7:
            failed_checks.append("stability_window")
        if int(metrics.get("p0p1_misses", 1)) > 0:
            failed_checks.append("p0_p1_misses")

    return {
        "passed": len(failed_checks) == 0,
        "failed_checks": failed_checks,
    }


def evaluate_browser_policy_rollback_readiness(
    status: dict[str, bool],
) -> dict[str, object]:
    failed_checks: list[str] = []

    if not status.get("tenant_facing_access_disabled", False):
        failed_checks.append("tenant_disable_first")
    if not status.get("additive_tables_preserved", False):
        failed_checks.append("additive_tables_not_preserved")
    if not status.get("approval_flows_healthy", False):
        failed_checks.append("approval_flows_unhealthy")
    if not status.get("raw_browser_bypass_closed", False):
        failed_checks.append("raw_browser_bypass_open")

    return {
        "ready": len(failed_checks) == 0,
        "failed_checks": failed_checks,
    }
