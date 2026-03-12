"""Operational readiness and cleanup helpers for live-browser rollout."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

from app.services.live_browser_adapter import (
    LiveBrowserReadiness,
    ManagedLiveBrowserAdapter,
)
from app.services.live_browser_observability import LiveBrowserTelemetry
from app.services.live_browser_session_manager import (
    ACTIVE_SESSION_STATUSES,
    LiveBrowserSessionManager,
    LiveBrowserSessionRecord,
)


@dataclass(slots=True)
class LiveBrowserMaintenanceResult:
    provisioning_failed: int = 0
    sessions_expired: int = 0
    controller_leases_expired: int = 0
    idempotency_rows_deleted: int = 0


def assess_live_browser_provider_readiness(
    adapter: ManagedLiveBrowserAdapter,
    *,
    telemetry: LiveBrowserTelemetry | None = None,
) -> LiveBrowserReadiness:
    readiness = adapter.check_readiness()
    if telemetry is not None:
        telemetry.increment(
            "live_browser_provider_readiness_checks_total",
            ready=str(readiness.ready).lower(),
        )
        if not readiness.ready:
            telemetry.increment("live_browser_provider_failures_total")
            telemetry.record_incident(
                kind="provider_readiness_failed",
                owner="python",
                severity="error",
                details={"failures": list(readiness.failures), "details": dict(readiness.details)},
            )
    return readiness


def run_live_browser_maintenance(
    manager: LiveBrowserSessionManager,
    *,
    now: datetime | None = None,
    provisioning_timeout: timedelta = timedelta(minutes=10),
    session_idle_timeout: timedelta = timedelta(hours=4),
    telemetry: LiveBrowserTelemetry | None = None,
) -> LiveBrowserMaintenanceResult:
    timestamp = now or datetime.now(UTC)
    sessions_before = {
        session.session_id: session
        for session in manager.list_sessions()
    }

    cleanup_result = manager.cleanup_stale_sessions(
        now=timestamp,
        provisioning_timeout=provisioning_timeout,
        session_ttl=session_idle_timeout,
    )
    idempotency_rows_deleted = manager.cleanup_expired_idempotency_results(now=timestamp)

    if telemetry is not None:
        _record_session_cleanup_telemetry(
            sessions_before=sessions_before,
            manager=manager,
            timestamp=timestamp,
            telemetry=telemetry,
        )
        if idempotency_rows_deleted:
            telemetry.increment("live_browser_idempotency_cleanup_total", value=idempotency_rows_deleted)

    return LiveBrowserMaintenanceResult(
        provisioning_failed=cleanup_result["staleProvisioningSessions"],
        sessions_expired=cleanup_result["expiredSessions"],
        controller_leases_expired=cleanup_result["expiredControllerLeases"],
        idempotency_rows_deleted=idempotency_rows_deleted,
    )


def _record_session_cleanup_telemetry(
    *,
    sessions_before: dict[str, LiveBrowserSessionRecord],
    manager: LiveBrowserSessionManager,
    timestamp: datetime,
    telemetry: LiveBrowserTelemetry,
) -> None:
    for session_id, previous in sessions_before.items():
        current = manager.get_session(session_id)
        if previous.status == "provisioning" and current.status == "failed":
            telemetry.increment(
                "live_browser_maintenance_actions_total",
                outcome="stale_provisioning_failed",
            )
            telemetry.record_incident(
                kind="stale_provisioning_failed",
                owner="python",
                session_id=session_id,
                details={"ended_at": timestamp.isoformat()},
            )

        if previous.status in ACTIVE_SESSION_STATUSES and current.status == "expired":
            telemetry.increment(
                "live_browser_maintenance_actions_total",
                outcome="session_expired",
            )
            telemetry.record_incident(
                kind="session_expired",
                owner="python",
                session_id=session_id,
                details={"ended_at": timestamp.isoformat()},
            )

        if previous.status == "human_controlling" and current.status == "waiting_for_human":
            telemetry.increment(
                "live_browser_maintenance_actions_total",
                outcome="controller_lease_expired",
            )
            telemetry.record_incident(
                kind="controller_lease_expired",
                owner="python",
                session_id=session_id,
                details={"recovered_status": current.status},
            )
