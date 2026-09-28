from datetime import UTC, datetime
from types import SimpleNamespace

from app.services.live_browser_adapter import (
    InMemoryManagedBrowserBackend,
    ManagedLiveBrowserAdapter,
)
from app.tasks.live_browser_tasks import build_live_browser_readiness_snapshot


def test_in_memory_backend_is_test_only_and_never_provider_ready():
    adapter = ManagedLiveBrowserAdapter(backend=InMemoryManagedBrowserBackend())

    readiness = adapter.check_readiness(now=datetime(2026, 9, 20, tzinfo=UTC))

    assert readiness.ready is False
    assert readiness.state == "TEST_ONLY"
    assert "provider_backend_in_memory" in readiness.failures
    assert readiness.evidence["backend_kind"] == "in_memory"
    assert readiness.evidence["probe_result"] == "synthetic"


def test_readiness_snapshot_projects_backend_provenance_evidence():
    adapter = ManagedLiveBrowserAdapter(backend=InMemoryManagedBrowserBackend())
    snapshot = build_live_browser_readiness_snapshot(
        manager=SimpleNamespace(list_sessions=lambda: []),
        adapter=adapter,
        now=datetime(2026, 9, 20, 12, 0, tzinfo=UTC),
    )

    assert snapshot["providerReady"] is False
    assert snapshot["readiness_state"] == "TEST_ONLY"
    assert snapshot["backend_kind"] == "in_memory"
    assert snapshot["execution_target"] == "test_only"
    assert snapshot["provider_identity"] == "in_memory"
    assert snapshot["probe_result"] == "synthetic"


def test_synthetic_probe_is_never_ready_even_when_backend_kind_is_not_in_memory():
    class MislabelledBackend(InMemoryManagedBrowserBackend):
        def readiness_evidence(self, *, now):
            evidence = super().readiness_evidence(now=now)
            evidence["backend_kind"] = "browser_pool"
            return evidence

    readiness = ManagedLiveBrowserAdapter(
        backend=MislabelledBackend()
    ).check_readiness(now=datetime(2026, 9, 20, tzinfo=UTC))

    assert readiness.ready is False
    assert "provider_probe_synthetic" in readiness.failures
