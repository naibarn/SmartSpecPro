"""Sandbox metric emission helpers.

Emits structured metric events to the JSONL audit log.
SmartSpecPro uses structured logging instead of Prometheus.
"""
import logging
from datetime import datetime, timezone
from typing import Any

logger = logging.getLogger(__name__)

_STATE_MAP = {"closed": 0, "open": 1, "half_open": 2}


def emit_metric(
    metric_name: str,
    value: float,
    labels: dict[str, Any] | None = None,
) -> None:
    """Emit a structured metric event to the JSONL audit log."""
    logger.info(
        "sandbox_metric",
        extra={
            "event_type": "sandbox_metric",
            "metric_name": metric_name,
            "metric_value": value,
            "labels": labels or {},
            "timestamp": datetime.now(timezone.utc).isoformat(),
        },
    )


def emit_job_completed(
    job_id: str,
    status: str,
    feature_type: str,
    duration_seconds: float,
    cost_actual: float,
    profile_slug: str,
) -> None:
    """Emit all metrics for a completed sandbox job."""
    emit_metric(
        "sandbox_jobs_total",
        1,
        {"status": status, "feature_type": feature_type},
    )
    emit_metric(
        "sandbox_execution_duration_seconds",
        duration_seconds,
        {"profile_slug": profile_slug, "feature_type": feature_type},
    )
    if cost_actual > 0:
        emit_metric(
            "sandbox_cost_usd",
            cost_actual,
            {"feature_type": feature_type, "profile_slug": profile_slug},
        )


def emit_sandbox_created(
    sandbox_id: str,
    profile_slug: str,
    creation_seconds: float,
) -> None:
    """Emit creation duration metric."""
    emit_metric(
        "sandbox_creation_duration_seconds",
        creation_seconds,
        {"profile_slug": profile_slug},
    )


def emit_concurrent_gauge(active_count: int) -> None:
    """Emit current count of active sandboxes."""
    emit_metric("sandbox_concurrent_active", float(active_count))


def emit_artifact_size(size_bytes: int, artifact_type: str) -> None:
    """Emit artifact size metric."""
    emit_metric(
        "sandbox_artifacts_size_bytes",
        float(size_bytes),
        {"artifact_type": artifact_type},
    )


def emit_circuit_breaker_state(state: str) -> None:
    """Emit circuit breaker state (closed=0, open=1, half_open=2)."""
    emit_metric(
        "sandbox_circuit_breaker_state",
        float(_STATE_MAP.get(state, -1)),
        {"state": state},
    )


def emit_hetzner_health(is_healthy: bool) -> None:
    """Emit Hetzner sandbox health gauge."""
    emit_metric("sandbox_hetzner_health", 1.0 if is_healthy else 0.0)
