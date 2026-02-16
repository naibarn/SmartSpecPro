"""Unit tests for admin vector cutover API helper and endpoint semantics."""

from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from app.api import admin as admin_api
from app.api.admin import _status_for_cutover_runtime_error


def test_cutover_runtime_error_maps_version_conflict_to_http_409():
    exc = RuntimeError("switch_state_version_conflict:expected=2:actual=3")
    assert _status_for_cutover_runtime_error(exc) == 409


def test_cutover_runtime_error_maps_other_errors_to_http_400():
    exc = RuntimeError("target_connectivity_check_failed")
    assert _status_for_cutover_runtime_error(exc) == 400


@pytest.mark.asyncio
async def test_assert_config_edit_endpoint_returns_conflict_when_cutover_freeze_active(monkeypatch):
    state = SimpleNamespace(
        tenant_id="tenant-1",
        switch_version=2,
        status="active",
        freeze_non_emergency_edits=True,
    )

    async def fake_get_or_create_switch_state(db, tenant_id=None):
        return state

    def fake_assert_config_edit_allowed(current_state, emergency=False):
        raise PermissionError("cutover_non_emergency_edit_blocked")

    monkeypatch.setattr(admin_api, "get_or_create_switch_state", fake_get_or_create_switch_state)
    monkeypatch.setattr(admin_api, "assert_config_edit_allowed", fake_assert_config_edit_allowed)

    with pytest.raises(HTTPException) as exc:
        await admin_api.assert_vectordb_config_edit_allowed(
            admin_api.CutoverConfigEditRequest(tenant_id="tenant-1", emergency=False),
            request=SimpleNamespace(),
            admin=SimpleNamespace(),
            db=SimpleNamespace(),
        )

    assert exc.value.status_code == 409
    assert "cutover_non_emergency_edit_blocked" in str(exc.value.detail)


@pytest.mark.asyncio
async def test_assert_config_edit_endpoint_returns_state_payload_when_allowed(monkeypatch):
    state = SimpleNamespace(
        tenant_id="tenant-2",
        switch_version=3,
        status="idle",
        freeze_non_emergency_edits=False,
    )

    async def fake_get_or_create_switch_state(db, tenant_id=None):
        return state

    def fake_assert_config_edit_allowed(current_state, emergency=False):
        return None

    monkeypatch.setattr(admin_api, "get_or_create_switch_state", fake_get_or_create_switch_state)
    monkeypatch.setattr(admin_api, "assert_config_edit_allowed", fake_assert_config_edit_allowed)

    result = await admin_api.assert_vectordb_config_edit_allowed(
        admin_api.CutoverConfigEditRequest(tenant_id="tenant-2", emergency=False),
        request=SimpleNamespace(),
        admin=SimpleNamespace(),
        db=SimpleNamespace(),
    )

    assert result["allowed"] is True
    assert result["tenant_id"] == "tenant-2"
    assert result["switch_version"] == 3
    assert result["freeze_non_emergency_edits"] is False


@pytest.mark.asyncio
async def test_request_cutover_endpoint_maps_version_conflict_to_http_409(monkeypatch):
    async def fake_request_provider_cutover(*args, **kwargs):
        raise RuntimeError("switch_state_version_conflict:expected=4:actual=5")

    monkeypatch.setattr(admin_api, "request_provider_cutover", fake_request_provider_cutover)

    with pytest.raises(HTTPException) as exc:
        await admin_api.request_vectordb_provider_cutover(
            admin_api.CutoverRequestPayload(
                target_provider="pgvector",
                tenant_id="tenant-3",
                campaign_completed=True,
                connectivity_ok=True,
            ),
            request=SimpleNamespace(),
            admin=SimpleNamespace(),
            db=SimpleNamespace(),
        )

    assert exc.value.status_code == 409
    assert "switch_state_version_conflict" in str(exc.value.detail)


@pytest.mark.asyncio
async def test_vectordb_health_uses_cloudflare_env_fallbacks(monkeypatch):
    async def fake_build_snapshot(db, tenant_id=None):
        return {
            "tenant_id": tenant_id,
            "provider_status": {
                "current_read_provider": "cloudflare_vectorize",
                "target_provider": None,
                "switch_status": "idle",
                "mirror_writes": False,
            },
            "queue_status": {"lag_minutes": 0.0},
            "campaign_progress": {"processed": 0, "failed": 0},
            "latency_status": {
                "current_p95_ms": 10.0,
                "baseline_p95_ms": 10.0,
                "window_minutes": 15.0,
            },
            "recent_failures": [],
            "timestamp": "2026-02-16T00:00:00Z",
        }

    def fake_build_provider_settings_diagnostics(*, provider_name, config, connection_health, capabilities=None):
        return {
            "provider": provider_name,
            "config_masked": config,
            "connection_health": connection_health,
            "capabilities": capabilities or {},
        }

    monkeypatch.setattr(admin_api, "build_admin_vector_health_snapshot", fake_build_snapshot)
    monkeypatch.setattr(
        admin_api,
        "build_provider_settings_diagnostics",
        fake_build_provider_settings_diagnostics,
    )
    monkeypatch.setattr(admin_api, "evaluate_vector_alert_policies", lambda **kwargs: [])

    monkeypatch.delenv("VECTORIZE_ACCOUNT_ID", raising=False)
    monkeypatch.delenv("CF_ACCOUNT_ID", raising=False)
    monkeypatch.delenv("VECTORIZE_API_TOKEN", raising=False)
    monkeypatch.delenv("CF_VECTORIZE_API_TOKEN", raising=False)
    monkeypatch.setenv("CLOUDFLARE_ACCOUNT_ID", "cf-account-fallback")
    monkeypatch.setenv("CLOUDFLARE_AI_API_KEY", "cf-token-fallback")

    result = await admin_api.get_vectordb_health(
        request=SimpleNamespace(),
        tenant_id=None,
        admin=SimpleNamespace(),
        db=SimpleNamespace(),
    )

    config = result["provider_diagnostics"]["config_masked"]
    assert config["account_id"] == "cf-account-fallback"
    assert config["api_token"] == "cf-token-fallback"
