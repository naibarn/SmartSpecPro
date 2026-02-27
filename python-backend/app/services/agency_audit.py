"""
Agency audit logging.

Logs structured events for all agency lifecycle actions:
run start/complete/fail, tool calls, credit reconciliation.

Events are logged to:
1. Python structured logger (JSON format to python-backend/logs/)
2. agency_runs.metadata JSON column (for queryable history)
"""

import logging
from datetime import datetime, timezone
from typing import Any

logger = logging.getLogger("agency.audit")


def log_agency_event(
    event_type: str,
    *,
    run_id: str | None = None,
    agency_id: str | None = None,
    tenant_id: str | None = None,
    user_id: int | None = None,
    duration_ms: int | None = None,
    total_credits_used: float | None = None,
    step_count: int | None = None,
    retry_count: int | None = None,
    error_type: str | None = None,
    error_message: str | None = None,
    tool_name: str | None = None,
    agent_name: str | None = None,
    risk_level: str | None = None,
    metadata: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Log a structured agency event. Returns the event dict for testing."""
    entry: dict[str, Any] = {
        "event_type": event_type,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }

    if run_id is not None:
        entry["run_id"] = run_id
    if agency_id is not None:
        entry["agency_id"] = agency_id
    if tenant_id is not None:
        entry["tenant_id"] = tenant_id
    if user_id is not None:
        entry["user_id"] = user_id
    if duration_ms is not None:
        entry["duration_ms"] = duration_ms
    if total_credits_used is not None:
        entry["total_credits_used"] = total_credits_used
    if step_count is not None:
        entry["step_count"] = step_count
    if retry_count is not None:
        entry["retry_count"] = retry_count
    if error_type is not None:
        entry["error_type"] = error_type
    if error_message is not None:
        entry["error_message"] = error_message
    if tool_name is not None:
        entry["tool_name"] = tool_name
    if agent_name is not None:
        entry["agent_name"] = agent_name
    if risk_level is not None:
        entry["risk_level"] = risk_level
    if metadata is not None:
        entry["metadata"] = metadata

    logger.info("agency_audit_event", extra={"audit": entry})
    return entry


async def reconcile_credits(
    run_id: str,
    gateway_total: float,
    run_total_credits: float,
    threshold: float = 1.0,
) -> bool:
    """Compare gateway cost total against run's total_credits_used.

    If mismatch exceeds threshold, log a warning event.
    Returns True if reconciled (match), False if mismatch detected.
    """
    diff = abs(gateway_total - run_total_credits)
    if diff <= threshold:
        return True

    log_agency_event(
        "agency_credit_mismatch",
        run_id=run_id,
        metadata={
            "gateway_total": gateway_total,
            "run_total_credits": run_total_credits,
            "difference": diff,
            "threshold": threshold,
        },
    )
    return False
