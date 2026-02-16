"""Vector observability/audit utilities for indexing and cutover operations."""

from __future__ import annotations

from collections import deque
from datetime import datetime, timedelta
from typing import Any

from sqlalchemy import and_, asc, desc, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.library import (
    LibraryBackfillCampaign,
    LibraryIndexJob,
    LibraryProviderSwitchState,
)
from app.services.library_observability import emit_metric, log_observability_event, redact_sensitive

VECTOR_AUDIT_EVENT_VERSION = "v1"
VECTOR_OPERATIONS = {"index", "delete", "search", "switch", "reindex"}
VECTOR_OUTCOMES = {"success", "failure", "skipped"}

QUEUE_LAG_THRESHOLD_MINUTES = 10
QUEUE_LAG_WINDOW_MINUTES = 15
FAILURE_RATE_THRESHOLD = 0.05
FAILURE_RATE_WINDOW_MINUTES = 30
LATENCY_REGRESSION_FACTOR_THRESHOLD = 1.5
LATENCY_WINDOW_MINUTES = 15

INDEX_JOB_PENDING_STATUS = "pending"
INDEX_JOB_RETRY_PENDING_STATUS = "retry_pending"
INDEX_JOB_FAILED_STATUS = "failed"

_EVENT_CAPACITY = 5000
_VECTOR_AUDIT_EVENTS: deque[dict[str, Any]] = deque(maxlen=_EVENT_CAPACITY)

_DIAGNOSTIC_REDACT_KEYS = {
    "api_key",
    "apikey",
    "token",
    "secret",
    "password",
    "authorization",
    "cookie",
}


def _now_iso() -> str:
    return datetime.utcnow().isoformat()


def _normalize_operation(operation: str) -> str:
    normalized = str(operation or "").strip().lower()
    if normalized not in VECTOR_OPERATIONS:
        raise ValueError(f"unsupported_vector_operation:{normalized}")
    return normalized


def _normalize_outcome(outcome: str) -> str:
    normalized = str(outcome or "").strip().lower()
    if normalized not in VECTOR_OUTCOMES:
        raise ValueError(f"unsupported_vector_outcome:{normalized}")
    return normalized


def _mask_value(value: Any) -> Any:
    if isinstance(value, dict):
        masked: dict[str, Any] = {}
        for key, item in value.items():
            lowered = key.lower()
            if any(marker in lowered for marker in _DIAGNOSTIC_REDACT_KEYS):
                masked[key] = "***redacted***"
            else:
                masked[key] = _mask_value(item)
        return masked
    if isinstance(value, list):
        return [_mask_value(item) for item in value]
    return value


def build_vector_audit_event(
    *,
    operation: str,
    outcome: str,
    tenant_id: str | None,
    provider: str,
    correlation_id: str,
    domain: str = "library",
    entity_id: str | None = None,
    details: dict[str, Any] | None = None,
    event_version: str = VECTOR_AUDIT_EVENT_VERSION,
) -> dict[str, Any]:
    """Build a stable audit event payload for vector operations."""
    normalized_operation = _normalize_operation(operation)
    normalized_outcome = _normalize_outcome(outcome)

    return {
        "event_version": str(event_version or VECTOR_AUDIT_EVENT_VERSION),
        "event_type": f"vector_{normalized_operation}",
        "operation": normalized_operation,
        "outcome": normalized_outcome,
        "tenant_id": str(tenant_id) if tenant_id is not None else None,
        "provider": str(provider or "unknown"),
        "domain": str(domain or "library"),
        "entity_id": str(entity_id) if entity_id is not None else None,
        "correlation_id": str(correlation_id or ""),
        "timestamp": _now_iso(),
        "details": redact_sensitive(details or {}),
    }


def record_vector_audit_event(event: dict[str, Any]) -> dict[str, Any]:
    """Record vector audit event in-memory and emit structured observability logs."""
    required = {
        "event_version",
        "event_type",
        "operation",
        "outcome",
        "tenant_id",
        "provider",
        "correlation_id",
        "timestamp",
    }
    missing = [key for key in sorted(required) if key not in event]
    if missing:
        raise ValueError(f"vector_audit_event_missing_fields:{','.join(missing)}")

    payload = dict(event)
    payload["details"] = redact_sensitive(payload.get("details") or {})
    _VECTOR_AUDIT_EVENTS.append(payload)

    emit_metric(
        "library.vector.audit.event_total",
        operation=payload["operation"],
        outcome=payload["outcome"],
        provider=payload["provider"],
    )
    log_observability_event(
        "vector_audit_event_recorded",
        **payload,
    )
    return payload


def get_recent_vector_audit_events(*, limit: int = 100) -> list[dict[str, Any]]:
    """Return recent vector audit events in reverse-chronological order."""
    safe_limit = max(1, min(int(limit), _EVENT_CAPACITY))
    events = list(_VECTOR_AUDIT_EVENTS)
    return list(reversed(events[-safe_limit:]))


def reset_vector_audit_events_for_tests() -> None:
    """Testing helper to clear in-memory audit events."""
    _VECTOR_AUDIT_EVENTS.clear()


def evaluate_vector_alert_policies(
    *,
    queue_lag_minutes: float,
    queue_lag_window_minutes: float,
    failure_rate: float,
    failure_window_minutes: float,
    latency_p95_ms: float,
    latency_baseline_p95_ms: float,
    latency_window_minutes: float,
    owner: str = "vector-oncall",
    runbook_base_url: str = "https://runbooks.smartaihub.app/vector",
) -> list[dict[str, Any]]:
    """Evaluate vector operations alert thresholds and return triggered alerts."""
    alerts: list[dict[str, Any]] = []

    if (
        float(queue_lag_minutes) > float(QUEUE_LAG_THRESHOLD_MINUTES)
        and float(queue_lag_window_minutes) >= float(QUEUE_LAG_WINDOW_MINUTES)
    ):
        alerts.append(
            {
                "alert_key": "queue_lag_breach",
                "severity": "high",
                "owner": owner,
                "window_minutes": int(queue_lag_window_minutes),
                "message": "Vector indexing queue lag exceeded threshold window",
                "current_value": float(queue_lag_minutes),
                "threshold_value": float(QUEUE_LAG_THRESHOLD_MINUTES),
                "runbook_url": f"{runbook_base_url}/queue-lag",
            }
        )

    if (
        float(failure_rate) > float(FAILURE_RATE_THRESHOLD)
        and float(failure_window_minutes) >= float(FAILURE_RATE_WINDOW_MINUTES)
    ):
        alerts.append(
            {
                "alert_key": "index_failure_rate_breach",
                "severity": "high",
                "owner": owner,
                "window_minutes": int(failure_window_minutes),
                "message": "Vector indexing failure rate exceeded threshold",
                "current_value": float(failure_rate),
                "threshold_value": float(FAILURE_RATE_THRESHOLD),
                "runbook_url": f"{runbook_base_url}/failure-rate",
            }
        )

    baseline = max(float(latency_baseline_p95_ms), 1.0)
    regression_factor = float(latency_p95_ms) / baseline
    if (
        regression_factor > float(LATENCY_REGRESSION_FACTOR_THRESHOLD)
        and float(latency_window_minutes) >= float(LATENCY_WINDOW_MINUTES)
    ):
        alerts.append(
            {
                "alert_key": "search_latency_regression",
                "severity": "warning",
                "owner": owner,
                "window_minutes": int(latency_window_minutes),
                "message": "Vector search latency p95 regressed versus baseline",
                "current_value": float(regression_factor),
                "threshold_value": float(LATENCY_REGRESSION_FACTOR_THRESHOLD),
                "runbook_url": f"{runbook_base_url}/latency-regression",
            }
        )

    return alerts


def build_provider_settings_diagnostics(
    *,
    provider_name: str,
    config: dict[str, Any] | None,
    connection_health: dict[str, Any] | None,
    capabilities: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Build masked provider diagnostics payload for admin settings responses."""
    masked_config = _mask_value(dict(config or {}))
    health = dict(connection_health or {})
    return {
        "provider": str(provider_name or "unknown"),
        "config_masked": masked_config,
        "connection_health": {
            "healthy": bool(health.get("healthy", False)),
            "status": str(health.get("status") or "unknown"),
            "message": str(health.get("message") or ""),
            "checked_at": str(health.get("checked_at") or _now_iso()),
        },
        "capabilities": dict(capabilities or {}),
    }


async def build_admin_vector_health_snapshot(
    db: AsyncSession,
    *,
    tenant_id: str | None = None,
    now: datetime | None = None,
) -> dict[str, Any]:
    """Aggregate provider/campaign/queue diagnostics for admin vector health views."""
    now_ts = now or datetime.utcnow()
    tenant_value = str(tenant_id).strip() if tenant_id else None

    switch_query = select(LibraryProviderSwitchState).order_by(
        desc(LibraryProviderSwitchState.updated_at),
        desc(LibraryProviderSwitchState.id),
    )
    campaign_query = select(LibraryBackfillCampaign).order_by(
        desc(LibraryBackfillCampaign.updated_at),
        desc(LibraryBackfillCampaign.id),
    )
    pending_query = select(LibraryIndexJob).where(
        LibraryIndexJob.status.in_([INDEX_JOB_PENDING_STATUS, INDEX_JOB_RETRY_PENDING_STATUS])
    )
    failed_query = select(LibraryIndexJob).where(
        and_(
            LibraryIndexJob.status == INDEX_JOB_FAILED_STATUS,
            or_(
                LibraryIndexJob.completed_at.is_(None),
                LibraryIndexJob.completed_at >= now_ts - timedelta(minutes=FAILURE_RATE_WINDOW_MINUTES),
            ),
        )
    )

    if tenant_value is not None:
        switch_query = switch_query.where(LibraryProviderSwitchState.tenant_id == tenant_value)
        campaign_query = campaign_query.where(LibraryBackfillCampaign.tenant_id == tenant_value)
        pending_query = pending_query.where(LibraryIndexJob.tenant_id == tenant_value)
        failed_query = failed_query.where(LibraryIndexJob.tenant_id == tenant_value)
    else:
        switch_query = switch_query.where(LibraryProviderSwitchState.tenant_id.is_(None))
        campaign_query = campaign_query.where(LibraryBackfillCampaign.tenant_id.is_(None))

    state = await db.scalar(switch_query.limit(1))
    campaign = await db.scalar(campaign_query.limit(1))

    oldest_due = await db.scalar(
        pending_query.with_only_columns(LibraryIndexJob.run_at).order_by(asc(LibraryIndexJob.run_at)).limit(1)
    )
    queue_lag_minutes = 0.0
    if oldest_due is not None:
        lag_seconds = max((now_ts - oldest_due).total_seconds(), 0.0)
        queue_lag_minutes = lag_seconds / 60.0

    failure_rows = (
        (
            await db.execute(
                failed_query.with_only_columns(
                    LibraryIndexJob.id,
                    LibraryIndexJob.tenant_id,
                    LibraryIndexJob.library_item_id,
                    LibraryIndexJob.last_error,
                    LibraryIndexJob.completed_at,
                )
                .order_by(desc(LibraryIndexJob.completed_at), desc(LibraryIndexJob.id))
                .limit(10)
            )
        )
        .all()
    )
    recent_failures = [
        {
            "job_id": int(row.id),
            "tenant_id": row.tenant_id,
            "library_item_id": int(row.library_item_id),
            "error": str(row.last_error or ""),
            "failed_at": row.completed_at.isoformat() if row.completed_at else None,
        }
        for row in failure_rows
    ]

    campaign_progress = {
        "campaign_id": int(campaign.id) if campaign is not None else None,
        "status": str(campaign.status) if campaign is not None else "idle",
        "domain": str(campaign.domain) if campaign is not None else "library",
        "queued": int(campaign.queued_count or 0) if campaign is not None else 0,
        "processed": int(campaign.processed_count or 0) if campaign is not None else 0,
        "succeeded": int(campaign.succeeded_count or 0) if campaign is not None else 0,
        "failed": int(campaign.failed_count or 0) if campaign is not None else 0,
        "skipped": int(campaign.skipped_count or 0) if campaign is not None else 0,
    }

    provider_status = {
        "current_read_provider": (
            str(state.current_read_provider)
            if state is not None
            else "cloudflare_vectorize"
        ),
        "target_provider": (
            str(state.target_provider)
            if state is not None and state.target_provider
            else None
        ),
        "switch_status": str(state.status) if state is not None else "idle",
        "mirror_writes": bool(state.mirror_writes) if state is not None else False,
    }

    return {
        "tenant_id": tenant_value,
        "provider_status": provider_status,
        "queue_status": {
            "lag_minutes": float(queue_lag_minutes),
            "lag_threshold_minutes": float(QUEUE_LAG_THRESHOLD_MINUTES),
            "lag_window_minutes": float(QUEUE_LAG_WINDOW_MINUTES),
        },
        "campaign_progress": campaign_progress,
        "recent_failures": recent_failures,
        "timestamp": now_ts.isoformat(),
    }
