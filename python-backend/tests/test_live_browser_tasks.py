from dataclasses import replace
from datetime import UTC, datetime, timedelta

from app.services.live_browser_adapter import (
    InMemoryManagedBrowserBackend,
    ManagedLiveBrowserAdapter,
)
from app.services.live_browser_observability import RedisBackedLiveBrowserTelemetry
from app.services.live_browser_session_manager import (
    InMemoryLiveBrowserStore,
    InMemorySingleWriterCoordinator,
    LiveBrowserSessionManager,
)
from app.tasks.live_browser_tasks import (
    build_live_browser_readiness_snapshot,
    run_live_browser_maintenance_job,
)


class FakeRedis:
    def __init__(self) -> None:
        self.hashes: dict[str, dict[str, int]] = {}
        self.lists: dict[str, list[str]] = {}
        self.expiry: dict[str, int] = {}

    def hincrby(self, key: str, field: str, amount: int) -> None:
        self.hashes.setdefault(key, {})
        self.hashes[key][field] = self.hashes[key].get(field, 0) + amount

    def hget(self, key: str, field: str) -> int | None:
        return self.hashes.get(key, {}).get(field)

    def rpush(self, key: str, value: str) -> None:
        self.lists.setdefault(key, []).append(value)

    def lrange(self, key: str, start: int, end: int) -> list[str]:
        values = self.lists.get(key, [])
        if end == -1:
            return values[start:]
        return values[start:end + 1]

    def expire(self, key: str, seconds: int) -> None:
        self.expiry[key] = seconds


def _build_manager() -> LiveBrowserSessionManager:
    return LiveBrowserSessionManager(
        store=InMemoryLiveBrowserStore(),
        coordinator=InMemorySingleWriterCoordinator(),
        writer_id="test-live-runtime",
        lease_ttl=timedelta(minutes=1),
    )


def test_redis_backed_telemetry_persists_counts_and_incidents():
    redis_client = FakeRedis()
    telemetry = RedisBackedLiveBrowserTelemetry(redis_client)

    telemetry.increment("live_browser_provider_failures_total", outcome="attach")
    telemetry.increment("live_browser_provider_failures_total", outcome="attach")
    telemetry.record_incident(
        kind="provider_readiness_failed",
        owner="python",
        severity="error",
        session_id="lbs_123",
        details={"failures": ["provider_attach_failed"]},
    )

    assert telemetry.get_count("live_browser_provider_failures_total", outcome="attach") == 2
    incidents = telemetry.get_incidents()
    assert incidents[0]["kind"] == "provider_readiness_failed"
    assert incidents[0]["session_id"] == "lbs_123"


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

    telemetry = RedisBackedLiveBrowserTelemetry(FakeRedis())
    result = run_live_browser_maintenance_job(
        manager=manager,
        telemetry=telemetry,
        now=now,
    )

    assert result["provisioning_failed"] == 1
    assert telemetry.get_count("live_browser_maintenance_actions_total", outcome="stale_provisioning_failed") == 1
