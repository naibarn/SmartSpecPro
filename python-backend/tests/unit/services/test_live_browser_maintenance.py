from dataclasses import replace
from datetime import UTC, datetime, timedelta

from app.services.live_browser_adapter import (
    InMemoryManagedBrowserBackend,
    ManagedLiveBrowserAdapter,
)
from app.services.live_browser_maintenance import (
    assess_live_browser_provider_readiness,
    run_live_browser_maintenance,
)
from app.services.live_browser_observability import InMemoryLiveBrowserTelemetry
from app.services.live_browser_session_manager import (
    InMemoryLiveBrowserStore,
    InMemorySingleWriterCoordinator,
    LiveBrowserSessionManager,
)


def _create_manager() -> LiveBrowserSessionManager:
    return LiveBrowserSessionManager(
        store=InMemoryLiveBrowserStore(),
        coordinator=InMemorySingleWriterCoordinator(),
        writer_id="writer-a",
        lease_ttl=timedelta(minutes=1),
    )


def _seed_session(
    manager: LiveBrowserSessionManager,
    *,
    session_id: str,
    status: str,
    now: datetime,
):
    return manager.create_session(
        session_id=session_id,
        tenant_id="tenant-123",
        user_id=42,
        source_type="automation",
        source_id=f"src-{session_id}",
        status=status,
        control_mode="observe",
        now=now,
    )


def test_maintenance_marks_stale_provisioning_and_expired_sessions_and_cleans_idempotency():
    manager = _create_manager()
    telemetry = InMemoryLiveBrowserTelemetry()
    now = datetime(2026, 3, 12, 12, 0, tzinfo=UTC)

    provisioning = _seed_session(
        manager,
        session_id="lbs_provisioning",
        status="provisioning",
        now=now - timedelta(minutes=20),
    )
    ready = _seed_session(
        manager,
        session_id="lbs_ready",
        status="ready",
        now=now - timedelta(hours=3),
    )

    manager.send_command(
        session_id="lbs_ready",
        expected_session_version=1,
        idempotency_key="idem-expire",
        actor_type="user",
        actor_id="42",
        command_text="Open the pricing page",
        now=now - timedelta(hours=2, minutes=30),
    )

    store = manager._store
    key = ("lbs_ready", "idem-expire")
    store.idempotency_expiry[key] = now - timedelta(minutes=1)

    provisioning_record = manager.get_session(provisioning.session_id)
    ready_record = manager.get_session(ready.session_id)
    manager._store.save_session(
        replace(
            provisioning_record,
            last_activity_at=now - timedelta(minutes=20),
        )
    )
    manager._store.save_session(
        replace(
            ready_record,
            last_activity_at=now - timedelta(hours=2),
        )
    )

    result = run_live_browser_maintenance(
        manager,
        now=now,
        provisioning_timeout=timedelta(minutes=10),
        session_idle_timeout=timedelta(hours=1),
        telemetry=telemetry,
    )

    assert result.provisioning_failed == 1
    assert result.sessions_expired == 1
    assert result.idempotency_rows_deleted == 1

    assert manager.get_session("lbs_provisioning").status == "failed"
    assert manager.get_session("lbs_ready").status == "expired"

    events, _, _ = manager.list_events(session_id="lbs_ready", limit=20)
    assert any(
        event.event_type == "session_failed"
        and event.payload.get("reason") == "session_ttl_expired"
        for event in events
    )

    assert telemetry.get_count("live_browser_maintenance_actions_total", outcome="stale_provisioning_failed") == 1
    assert telemetry.get_count("live_browser_maintenance_actions_total", outcome="session_expired") == 1
    assert telemetry.get_count("live_browser_idempotency_cleanup_total") == 1


def test_maintenance_expires_controller_leases_and_records_incidents():
    manager = _create_manager()
    telemetry = InMemoryLiveBrowserTelemetry()
    seeded_at = datetime(2026, 3, 12, 12, 0, tzinfo=UTC)

    _seed_session(
        manager,
        session_id="lbs_takeover",
        status="waiting_for_human",
        now=seeded_at,
    )
    manager.take_control(
        session_id="lbs_takeover",
        expected_session_version=1,
        idempotency_key="takeover-1",
        actor_id="42",
        reason="manual_review",
        now=seeded_at,
    )

    result = run_live_browser_maintenance(
        manager,
        now=seeded_at + timedelta(minutes=2),
        session_idle_timeout=timedelta(hours=1),
        telemetry=telemetry,
    )

    session = manager.get_session("lbs_takeover")

    assert result.controller_leases_expired == 1
    assert session.status == "waiting_for_human"
    assert session.control_mode == "approve_only"
    assert telemetry.get_count("live_browser_maintenance_actions_total", outcome="controller_lease_expired") == 1
    assert any(
        incident.kind == "controller_lease_expired"
        and incident.session_id == "lbs_takeover"
        for incident in telemetry.incidents
    )


def test_provider_readiness_failures_record_metrics_and_incidents():
    telemetry = InMemoryLiveBrowserTelemetry()
    adapter = ManagedLiveBrowserAdapter(
        backend=InMemoryManagedBrowserBackend(
            health_overrides={"attach": False},
        )
    )

    readiness = assess_live_browser_provider_readiness(adapter, telemetry=telemetry)

    assert readiness.ready is False
    assert "provider_attach_failed" in readiness.failures
    assert telemetry.get_count("live_browser_provider_readiness_checks_total", ready="false") == 1
    assert telemetry.get_count("live_browser_provider_failures_total") == 1
    assert any(
        incident.kind == "provider_readiness_failed"
        and "provider_attach_failed" in incident.details.get("failures", [])
        for incident in telemetry.incidents
    )
