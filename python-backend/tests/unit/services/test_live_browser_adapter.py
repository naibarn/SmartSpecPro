from datetime import UTC, datetime, timedelta

import pytest

from app.services.live_browser_adapter import (
    InMemoryManagedBrowserBackend,
    LiveBrowserProviderError,
    ManagedLiveBrowserAdapter,
)


def _create_adapter(
    *,
    capabilities: set[str] | None = None,
    health_overrides: dict[str, bool] | None = None,
) -> ManagedLiveBrowserAdapter:
    backend = InMemoryManagedBrowserBackend(
        capabilities=capabilities,
        health_overrides=health_overrides,
    )
    return ManagedLiveBrowserAdapter(backend=backend, token_ttl=timedelta(minutes=5))


def test_adapter_fails_closed_when_required_provider_capabilities_are_missing():
    adapter = _create_adapter(capabilities={"observer_token", "token_refresh"})

    with pytest.raises(LiveBrowserProviderError) as exc_info:
        adapter.provision_session(
            session_id="lbs_provider_123",
            initial_url="https://example.com",
            tab_cap=3,
        )

    error = exc_info.value
    assert error.code == "stream_unavailable"
    assert "provider_missing_controller_token" in error.reason_codes


def test_observer_and_controller_tokens_are_scoped_and_expire_per_session():
    adapter = _create_adapter()
    session = adapter.provision_session(
        session_id="lbs_provider_123",
        initial_url="https://example.com",
        tab_cap=3,
    )

    viewer = adapter.issue_stream_token(
        session_id=session.session_id,
        scope="viewer",
        actor_id="user-42",
        now=datetime(2026, 3, 10, 12, 0, tzinfo=UTC),
    )
    controller = adapter.issue_stream_token(
        session_id=session.session_id,
        scope="controller",
        actor_id="user-42",
        now=datetime(2026, 3, 10, 12, 1, tzinfo=UTC),
    )

    assert viewer.scope == "viewer"
    assert controller.scope == "controller"
    assert viewer.session_id == session.session_id
    assert controller.session_id == session.session_id
    assert viewer.expires_at == datetime(2026, 3, 10, 12, 5, tzinfo=UTC)
    assert controller.expires_at == datetime(2026, 3, 10, 12, 6, tzinfo=UTC)


def test_token_refresh_keeps_transport_attachment_identity_stable():
    adapter = _create_adapter()
    session = adapter.provision_session(
        session_id="lbs_provider_123",
        initial_url="https://example.com",
        tab_cap=3,
    )
    initial = adapter.issue_stream_token(
        session_id=session.session_id,
        scope="controller",
        actor_id="user-42",
        now=datetime(2026, 3, 10, 12, 0, tzinfo=UTC),
    )

    refreshed = adapter.refresh_stream_token(
        session_id=session.session_id,
        refresh_token=initial.refresh_token,
        now=datetime(2026, 3, 10, 12, 3, tzinfo=UTC),
    )

    assert refreshed.scope == "controller"
    assert refreshed.connection_id == initial.connection_id
    assert refreshed.token != initial.token
    assert adapter.get_session(session.session_id).active_controller_connection_id == initial.connection_id


def test_disconnect_callbacks_surface_incidents_without_reassigning_transport_mode():
    adapter = _create_adapter()
    session = adapter.provision_session(
        session_id="lbs_provider_123",
        initial_url="https://example.com",
        tab_cap=3,
    )
    controller = adapter.issue_stream_token(
        session_id=session.session_id,
        scope="controller",
        actor_id="user-42",
    )

    incident = adapter.record_disconnect(
        session_id=session.session_id,
        connection_id=controller.connection_id,
        scope="controller",
        reason="socket_closed",
    )

    assert incident.scope == "controller"
    assert incident.reason == "socket_closed"
    assert adapter.get_session(session.session_id).active_controller_connection_id == controller.connection_id


def test_provider_evidence_handles_are_redacted_and_session_scoped():
    adapter = _create_adapter()
    session = adapter.provision_session(
        session_id="lbs_provider_123",
        initial_url="https://example.com",
        tab_cap=3,
    )

    evidence = adapter.capture_evidence(
        session_id=session.session_id,
        tab_id=session.active_tab_id,
    )

    assert evidence.session_id == session.session_id
    assert evidence.tab_id == session.active_tab_id
    assert evidence.handle_id.startswith("lbeh_")
    assert evidence.metadata["provider"] == "managed_live_browser"
    assert "artifactRef" not in evidence.metadata


def test_readiness_checks_distinguish_allocation_attach_and_refresh_failures():
    adapter = _create_adapter(
        health_overrides={
            "allocation": False,
            "attach": False,
            "token_refresh": False,
        }
    )

    readiness = adapter.check_readiness()

    assert readiness.ready is False
    assert readiness.failures == [
        "provider_allocation_failed",
        "provider_attach_failed",
        "provider_token_refresh_failed",
    ]


def test_readiness_reports_missing_provider_capabilities():
    adapter = _create_adapter(capabilities={"observer_token"})

    readiness = adapter.check_readiness()

    assert readiness.ready is False
    assert "provider_missing_controller_token" in readiness.failures
    assert "provider_missing_reconnect_attach" in readiness.failures


def test_active_tab_restore_requires_the_expected_tab_to_exist():
    adapter = _create_adapter()
    session = adapter.provision_session(
        session_id="lbs_provider_123",
        initial_url="https://example.com",
        tab_cap=3,
    )
    second_tab = adapter.open_tab(
        session_id=session.session_id,
        url="https://example.com/pricing",
        title="Pricing",
    )

    restored = adapter.restore_active_tab(
        session_id=session.session_id,
        tab_id=second_tab.tab_id,
    )
    assert restored.tab_id == second_tab.tab_id

    with pytest.raises(LiveBrowserProviderError) as exc_info:
        adapter.restore_active_tab(
            session_id=session.session_id,
            tab_id="tab_missing",
        )

    assert exc_info.value.code == "stream_unavailable"
    assert "active_tab_restore_failed" in exc_info.value.reason_codes


def test_tab_cap_failures_are_explicit_and_auditable():
    adapter = _create_adapter()
    session = adapter.provision_session(
        session_id="lbs_provider_123",
        initial_url="https://example.com",
        tab_cap=2,
    )
    adapter.open_tab(
        session_id=session.session_id,
        url="https://example.com/pricing",
        title="Pricing",
    )

    with pytest.raises(LiveBrowserProviderError) as exc_info:
        adapter.open_tab(
            session_id=session.session_id,
            url="https://example.com/docs",
            title="Docs",
        )

    error = exc_info.value
    assert error.code == "stream_unavailable"
    assert "tab_cap_exceeded" in error.reason_codes
    assert error.audit_payload["tabCap"] == 2
