from dataclasses import replace
from datetime import UTC, datetime, timedelta
from unittest.mock import patch

from app.core.config import Settings
from app.services.live_browser_adapter import (
    InMemoryManagedBrowserBackend,
    ManagedLiveBrowserAdapter,
)
from app.services.library_observability import (
    get_metric_count,
    reset_library_observability_metrics,
)
from app.services.live_browser_observability import RuntimeLiveBrowserTelemetry
from app.services.live_browser_session_manager import (
    InMemoryLiveBrowserStore,
    InMemorySingleWriterCoordinator,
    LiveBrowserSessionManager,
)
from app.tasks.live_browser_tasks import (
    build_live_browser_readiness_snapshot,
    inspect_live_browser_readiness_snapshot,
    publish_live_browser_readiness_snapshot,
    run_live_browser_maintenance_job,
)


def _build_manager() -> LiveBrowserSessionManager:
    return LiveBrowserSessionManager(
        store=InMemoryLiveBrowserStore(),
        coordinator=InMemorySingleWriterCoordinator(),
        writer_id="test-live-runtime",
        lease_ttl=timedelta(minutes=1),
    )


def setup_function() -> None:
    reset_library_observability_metrics()


def test_runtime_telemetry_emits_metrics_and_incidents():
    telemetry = RuntimeLiveBrowserTelemetry()

    telemetry.increment("live_browser_provider_failures_total", outcome="attach")
    telemetry.increment("live_browser_provider_failures_total", outcome="attach")
    telemetry.record_incident(
        kind="provider_readiness_failed",
        owner="python",
        severity="error",
        session_id="lbs_123",
        details={"failures": ["provider_attach_failed"]},
    )

    assert get_metric_count("live_browser_provider_failures_total", outcome="attach") == 2
    assert get_metric_count(
        "live_browser_incidents_total",
        kind="provider_readiness_failed",
        owner="python",
        severity="error",
    ) == 1


def test_readiness_snapshot_reports_provider_and_runtime_state():
    manager = _build_manager()
    adapter = ManagedLiveBrowserAdapter(
        backend=InMemoryManagedBrowserBackend(
            health_overrides={"attach": False},
        ),
        token_ttl=timedelta(minutes=5),
    )

    snapshot = build_live_browser_readiness_snapshot(
        manager=manager,
        adapter=adapter,
        now=datetime(2026, 3, 12, 12, 0, tzinfo=UTC),
    )

    assert snapshot["runtimeReady"] is True
    assert snapshot["providerReady"] is False
    assert "provider_attach_failed" in snapshot["providerFailures"]
    assert snapshot["publisher"] == "python_celery_beat"
    assert snapshot["owner"] == "python-live-browser-oncall"
    assert snapshot["runbookUrl"] == "https://runbooks.smartaihub.app/live-browser/readiness"
    assert snapshot["publishIntervalSeconds"] == 60
    assert snapshot["maxAgeSeconds"] == 120


def test_readiness_snapshot_uses_configured_operational_metadata():
    manager = _build_manager()
    adapter = ManagedLiveBrowserAdapter(
        backend=InMemoryManagedBrowserBackend(),
        token_ttl=timedelta(minutes=5),
    )
    custom_settings = Settings(
        LIVE_BROWSER_READINESS_PUBLISHER="celery-prod-eu",
        LIVE_BROWSER_READINESS_OWNER="live-browser-primary",
        LIVE_BROWSER_READINESS_RUNBOOK_URL="https://ops.example.com/runbooks/live-browser/readiness",
        LIVE_BROWSER_READINESS_PUBLISH_INTERVAL_SECONDS=45,
        LIVE_BROWSER_READINESS_MAX_AGE_SECONDS=90,
        LIVE_BROWSER_READINESS_TTL_SECONDS=180,
        LIVE_BROWSER_READINESS_WATCHDOG_INTERVAL_SECONDS=60,
    )

    with patch("app.tasks.live_browser_tasks.settings", custom_settings):
        snapshot = build_live_browser_readiness_snapshot(
            manager=manager,
            adapter=adapter,
            now=datetime(2026, 3, 12, 12, 0, tzinfo=UTC),
        )

    assert snapshot["publisher"] == "celery-prod-eu"
    assert snapshot["owner"] == "live-browser-primary"
    assert snapshot["runbookUrl"] == "https://ops.example.com/runbooks/live-browser/readiness"
    assert snapshot["publishIntervalSeconds"] == 45
    assert snapshot["maxAgeSeconds"] == 90


def test_publish_readiness_snapshot_records_metric_and_incident_for_unready_state():
    manager = _build_manager()
    adapter = ManagedLiveBrowserAdapter(
        backend=InMemoryManagedBrowserBackend(
            health_overrides={"attach": False},
        ),
        token_ttl=timedelta(minutes=5),
    )
    with (
        patch("app.tasks.live_browser_tasks.get_live_browser_session_manager", return_value=manager),
        patch("app.tasks.live_browser_tasks.get_live_browser_adapter", return_value=adapter),
        patch("app.tasks.live_browser_tasks._write_readiness_snapshot"),
    ):
        snapshot = publish_live_browser_readiness_snapshot()

    assert snapshot["providerReady"] is False
    assert get_metric_count("live_browser_readiness_published_total", ready="false") == 1
    assert get_metric_count("live_browser_provider_failures_total") == 1


def test_publish_readiness_snapshot_records_failure_incident_when_postgres_write_fails():
    manager = _build_manager()
    adapter = ManagedLiveBrowserAdapter(
        backend=InMemoryManagedBrowserBackend(),
        token_ttl=timedelta(minutes=5),
    )

    with (
        patch("app.tasks.live_browser_tasks.get_live_browser_session_manager", return_value=manager),
        patch("app.tasks.live_browser_tasks.get_live_browser_adapter", return_value=adapter),
        patch("app.tasks.live_browser_tasks._write_readiness_snapshot", side_effect=RuntimeError("database unavailable")),
        patch("app.tasks.live_browser_tasks.logger") as mock_logger,
    ):
        try:
            publish_live_browser_readiness_snapshot()
        except RuntimeError as error:
            assert str(error) == "database unavailable"
        else:
            raise AssertionError("publish_live_browser_readiness_snapshot should re-raise database failures")

    assert get_metric_count("live_browser_readiness_publish_failures_total") == 1
    assert get_metric_count(
        "live_browser_incidents_total",
        kind="readiness_snapshot_publish_failed",
        owner="python",
        severity="error",
    ) == 1
    mock_logger.exception.assert_called_once()


def test_readiness_watchdog_reports_healthy_snapshot():
    snapshot = {"checkedAt": "2026-03-12T12:00:00+00:00", "publisher": "python_celery_beat", "owner": "python-live-browser-oncall", "runbookUrl": "https://runbooks.smartaihub.app/live-browser/readiness", "publishIntervalSeconds": 60, "maxAgeSeconds": 120}
    with patch("app.tasks.live_browser_tasks._read_readiness_snapshot", return_value=snapshot):
        result = inspect_live_browser_readiness_snapshot(
            telemetry=RuntimeLiveBrowserTelemetry(),
            now=datetime(2026, 3, 12, 12, 1, tzinfo=UTC),
        )

    assert result["healthy"] is True
    assert result["reason"] == "ok"
    assert result["owner"] == "python-live-browser-oncall"
    assert result["runbookUrl"] == "https://runbooks.smartaihub.app/live-browser/readiness"
    assert get_metric_count("live_browser_readiness_watchdog_checks_total", healthy="true", reason="ok") == 1


def test_readiness_watchdog_records_missing_snapshot_incident():
    with patch("app.tasks.live_browser_tasks._read_readiness_snapshot", return_value=None):
        result = inspect_live_browser_readiness_snapshot(
            telemetry=RuntimeLiveBrowserTelemetry(),
            now=datetime(2026, 3, 12, 12, 1, tzinfo=UTC),
        )

    assert result["healthy"] is False
    assert result["reason"] == "missing"
    assert get_metric_count(
        "live_browser_readiness_watchdog_checks_total",
        healthy="false",
        reason="missing",
    ) == 1
    assert get_metric_count(
        "live_browser_incidents_total",
        kind="readiness_snapshot_missing",
        owner="python",
        severity="error",
    ) == 1


def test_readiness_watchdog_records_stale_snapshot_incident():
    snapshot = {"checkedAt": "2026-03-12T11:56:00+00:00", "publisher": "python_celery_beat", "owner": "python-live-browser-oncall", "runbookUrl": "https://runbooks.smartaihub.app/live-browser/readiness", "publishIntervalSeconds": 60, "maxAgeSeconds": 120}
    with patch("app.tasks.live_browser_tasks._read_readiness_snapshot", return_value=snapshot):
        result = inspect_live_browser_readiness_snapshot(
            telemetry=RuntimeLiveBrowserTelemetry(),
            now=datetime(2026, 3, 12, 12, 0, tzinfo=UTC),
        )

    assert result["healthy"] is False
    assert result["reason"] == "stale"
    assert result["publisher"] == "python_celery_beat"
    assert get_metric_count(
        "live_browser_readiness_watchdog_checks_total",
        healthy="false",
        reason="stale",
    ) == 1
    assert get_metric_count(
        "live_browser_incidents_total",
        kind="readiness_snapshot_stale",
        owner="python",
        severity="error",
    ) == 1


def test_readiness_watchdog_records_missing_metadata_incident():
    snapshot = {"checkedAt": "2026-03-12T12:00:00+00:00", "publisher": "python_celery_beat"}
    with patch("app.tasks.live_browser_tasks._read_readiness_snapshot", return_value=snapshot):
        result = inspect_live_browser_readiness_snapshot(
            telemetry=RuntimeLiveBrowserTelemetry(),
            now=datetime(2026, 3, 12, 12, 1, tzinfo=UTC),
        )

    assert result["healthy"] is False
    assert result["reason"] == "metadata_missing"
    assert result["publisher"] == "python_celery_beat"
    assert result["owner"] is None
    assert result["runbookUrl"] is None
    assert get_metric_count(
        "live_browser_readiness_watchdog_checks_total",
        healthy="false",
        reason="metadata_missing",
    ) == 1
    assert get_metric_count(
        "live_browser_incidents_total",
        kind="readiness_snapshot_metadata_missing",
        owner="python",
        severity="error",
    ) == 1


def test_maintenance_job_runs_with_manager_and_telemetry():
    manager = _build_manager()
    now = datetime(2026, 3, 12, 12, 0, tzinfo=UTC)
    manager.create_session(
        session_id="lbs_provisioning",
        tenant_id="tenant-123",
        user_id=42,
        source_type="automation",
        status="provisioning",
        now=now - timedelta(minutes=15),
    )
    provisioning = manager.get_session("lbs_provisioning")
    manager._store.save_session(
        replace(
            provisioning,
            last_activity_at=now - timedelta(minutes=15),
        )
    )

    telemetry = RuntimeLiveBrowserTelemetry()
    result = run_live_browser_maintenance_job(
        manager=manager,
        telemetry=telemetry,
        now=now,
    )

    assert result["provisioning_failed"] == 1
    assert get_metric_count("live_browser_maintenance_actions_total", outcome="stale_provisioning_failed") == 1
