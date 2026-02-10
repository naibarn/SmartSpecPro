"""Quantitative rollout gate checks derived from emitted reliability metrics."""

from __future__ import annotations

from typing import Any

from app.services.library_observability import get_metric_count

DEFAULT_THRESHOLDS = {
    "max_callback_failure_rate": 0.01,
    "max_index_failure_rate": 0.02,
    "max_dlq_backlog": 25,
}


def _safe_rate(numerator: int, denominator: int) -> float:
    if denominator <= 0:
        return 0.0
    return float(numerator) / float(denominator)


def evaluate_release_gates(thresholds: dict[str, Any] | None = None) -> dict[str, Any]:
    """Evaluate rollout readiness against configured metric thresholds."""
    effective = {
        **DEFAULT_THRESHOLDS,
        **(thresholds or {}),
    }

    callback_processed = get_metric_count("media.callback.processed_total")
    callback_failed = get_metric_count("media.callback.failed_total")
    callback_total = callback_processed + callback_failed

    index_completed = get_metric_count("library.index.job.completed_total")
    index_failed = get_metric_count("library.index.job.failed_total")
    index_total = index_completed + index_failed

    dlq_backlog = get_metric_count("media.callback.dlq_total")

    callback_failure_rate = _safe_rate(callback_failed, callback_total)
    index_failure_rate = _safe_rate(index_failed, index_total)

    gates = {
        "callback_failure_rate_ok": callback_failure_rate <= float(effective["max_callback_failure_rate"]),
        "index_failure_rate_ok": index_failure_rate <= float(effective["max_index_failure_rate"]),
        "dlq_backlog_ok": dlq_backlog <= int(effective["max_dlq_backlog"]),
    }

    return {
        "all_passed": all(gates.values()),
        "thresholds": {
            "max_callback_failure_rate": float(effective["max_callback_failure_rate"]),
            "max_index_failure_rate": float(effective["max_index_failure_rate"]),
            "max_dlq_backlog": int(effective["max_dlq_backlog"]),
        },
        "metrics": {
            "callback_processed_total": callback_processed,
            "callback_failed_total": callback_failed,
            "callback_failure_rate": callback_failure_rate,
            "index_completed_total": index_completed,
            "index_failed_total": index_failed,
            "index_failure_rate": index_failure_rate,
            "dlq_backlog": dlq_backlog,
        },
        "gates": gates,
    }

