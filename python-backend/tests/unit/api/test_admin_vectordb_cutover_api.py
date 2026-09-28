"""Unit tests for admin vector cutover API helper and endpoint semantics."""

from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from app.api import admin as admin_api
from app.api.admin import _status_for_cutover_runtime_error


@pytest.mark.asyncio
async def test_reset_failed_vector_jobs_requeues_only_cloudflare_embedding_failures():
    executed = {}

    class Result:
        def fetchall(self):
            return [(101,), (102,)]

    async def execute(statement):
        executed["statement"] = statement.compile(
            compile_kwargs={"literal_binds": True}
        ).string
        return Result()

    committed = []

    async def commit():
        committed.append(True)

    db = SimpleNamespace(execute=execute, commit=commit)

    count = await admin_api._reset_failed_vector_db_index_jobs_for_retry(db)

    assert count == 2
    assert committed == [True]
    assert "Cloudflare Workers AI embedding credentials not configured" in executed["statement"]
    assert "Cloudflare Workers AI embedding request failed" in executed["statement"]


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
async def test_request_vectorize_cutover_requires_server_verified_target(monkeypatch):
    async def fake_probe(db, tenant_id=None):
        raise RuntimeError("target_connectivity_check_failed:vectorize_probe_failed")

    async def unexpected_request(*args, **kwargs):
        raise AssertionError("cutover service must not run after a failed target probe")

    monkeypatch.setattr(admin_api, "_probe_vectorize_cutover_target", fake_probe)
    monkeypatch.setattr(admin_api, "request_provider_cutover", unexpected_request)

    with pytest.raises(HTTPException) as exc:
        await admin_api.request_vectordb_provider_cutover(
            admin_api.CutoverRequestPayload(
                target_provider="cloudflare_vectorize",
                tenant_id="tenant-4",
                campaign_id=10,
                campaign_completed=True,
                connectivity_ok=True,
            ),
            request=SimpleNamespace(),
            admin=SimpleNamespace(),
            db=SimpleNamespace(),
        )

    assert exc.value.status_code == 400
    assert "vectorize_probe_failed" in str(exc.value.detail)


@pytest.mark.asyncio
async def test_request_vectorize_cutover_creates_and_schedules_missing_campaign(monkeypatch):
    current_state = SimpleNamespace(
        tenant_id=None,
        switch_version=1,
        status="idle",
        target_provider=None,
        campaign_id=None,
    )
    staged_state = SimpleNamespace(
        tenant_id=None,
        switch_version=2,
        status="active",
        campaign_status="ready_for_cutover",
        current_read_provider="pgvector",
        target_provider="cloudflare_vectorize",
        campaign_id=77,
        mirror_writes=True,
        freeze_non_emergency_edits=True,
    )
    campaign = SimpleNamespace(id=77, status="queued")
    scheduled: list[int] = []

    async def fake_probe(db, tenant_id=None):
        return {"index_name": "smartaihub-knowledge-v1", "dimensions": 768, "metric": "cosine"}

    async def fake_get_or_create(db, tenant_id=None):
        return current_state

    async def fake_create(*args, **kwargs):
        return campaign

    async def fake_request(*args, **kwargs):
        return staged_state

    async def fake_auto(*args, **kwargs):
        return {
            "automatic": True,
            "cutover_applied": False,
            "current_read_provider": "pgvector",
            "failed_checks": ["projection_pending"],
        }

    def fake_schedule(campaign_id):
        scheduled.append(campaign_id)
        return True

    monkeypatch.setattr(admin_api, "_probe_vectorize_cutover_target", fake_probe)
    monkeypatch.setattr(admin_api, "get_or_create_switch_state", fake_get_or_create)
    monkeypatch.setattr(admin_api, "create_backfill_campaign", fake_create)
    monkeypatch.setattr(admin_api, "request_provider_cutover", fake_request)
    monkeypatch.setattr(admin_api, "maybe_auto_promote_vectorize_cutover", fake_auto)
    monkeypatch.setattr(admin_api, "_schedule_vector_db_backfill_campaign", fake_schedule)

    result = await admin_api.request_vectordb_provider_cutover(
        admin_api.CutoverRequestPayload(
            target_provider="cloudflare_vectorize",
            tenant_id=None,
        ),
        request=SimpleNamespace(),
        admin=SimpleNamespace(),
        db=SimpleNamespace(),
    )

    assert result["preparation"] == {
        "campaign_id": 77,
        "campaign_created": True,
        "backfill_scheduled": True,
        "failed_jobs_reset": 0,
        "retry_scheduled": False,
    }
    assert scheduled == [77]


@pytest.mark.asyncio
async def test_request_vectorize_cutover_requeues_failed_jobs_when_already_staged(monkeypatch):
    state = SimpleNamespace(
        tenant_id=None,
        switch_version=2,
        status="active",
        target_provider="cloudflare_vectorize",
        campaign_id=77,
        campaign_status="ready_for_cutover",
        current_read_provider="pgvector",
        mirror_writes=True,
        freeze_non_emergency_edits=True,
    )
    campaign = SimpleNamespace(status="completed")
    db = SimpleNamespace(scalar=lambda _query: None)

    async def fake_scalar(_query):
        return campaign

    db.scalar = fake_scalar

    async def fake_probe(db, tenant_id=None):
        return {"index_name": "smartaihub-knowledge-v1", "dimensions": 768, "metric": "cosine"}

    async def fake_get_or_create(db, tenant_id=None):
        return state

    async def fake_reset(db):
        return 4

    scheduled = []

    def fake_schedule():
        scheduled.append(True)
        return True

    async def fake_auto(*args, **kwargs):
        return {"automatic": True, "cutover_applied": False, "failed_checks": ["projection_pending"]}

    monkeypatch.setattr(admin_api, "_probe_vectorize_cutover_target", fake_probe)
    monkeypatch.setattr(admin_api, "get_or_create_switch_state", fake_get_or_create)
    monkeypatch.setattr(admin_api, "_reset_failed_vector_db_index_jobs_for_retry", fake_reset)
    monkeypatch.setattr(admin_api, "_schedule_vector_db_index_retry", fake_schedule)
    monkeypatch.setattr(admin_api, "maybe_auto_promote_vectorize_cutover", fake_auto)

    result = await admin_api.request_vectordb_provider_cutover(
        admin_api.CutoverRequestPayload(target_provider="cloudflare_vectorize"),
        request=SimpleNamespace(),
        admin=SimpleNamespace(),
        db=db,
    )

    assert result["preparation"]["failed_jobs_reset"] == 4
    assert result["preparation"]["retry_scheduled"] is True
    assert scheduled == [True]


@pytest.mark.asyncio
async def test_vectorize_cutover_probe_reads_saved_config_and_validates_schema(monkeypatch):
    async def fake_resolve_provider(db, tenant_id=None):
        return "pgvector", {
            "vectorizeAccountId": "saved-account",
            "vectorizeApiToken": "saved-token",
            "vectorizeKnowledgeIndexName": "smartaihub-knowledge-v1",
        }

    class FakeVectorizeStore:
        def __init__(self, config):
            assert config.account_id == "saved-account"
            assert config.api_token == "saved-token"
            assert config.index_name == "smartaihub-knowledge-v1"

        async def test_connection(self):
            return {
                "success": True,
                "config": {"dimensions": 768, "metric": "cosine"},
            }

    class FakeEmbedding:
        def __init__(self, account_id, api_token):
            assert account_id == "saved-account"
            assert api_token == "saved-token"

        def embed_text(self, _text):
            return [0.0] * 768

    monkeypatch.setattr(admin_api, "resolve_library_vector_provider_from_db", fake_resolve_provider)
    monkeypatch.setattr(admin_api, "CloudflareVectorizeStore", FakeVectorizeStore)
    monkeypatch.setattr(admin_api, "CloudflareWorkersAIEmbedding", FakeEmbedding)

    result = await admin_api._probe_vectorize_cutover_target(
        SimpleNamespace(),
        tenant_id="tenant-5",
    )

    assert result == {
        "index_name": "smartaihub-knowledge-v1",
        "dimensions": 768,
        "metric": "cosine",
        "embedding_dimensions": 768,
    }


@pytest.mark.asyncio
async def test_request_vectorize_cutover_auto_promotes_when_server_gate_passes(monkeypatch):
    state = SimpleNamespace(
        tenant_id="tenant-auto-api",
        switch_version=3,
        status="active",
        campaign_status="ready_for_cutover",
        current_read_provider="pgvector",
        target_provider="cloudflare_vectorize",
        mirror_writes=True,
        freeze_non_emergency_edits=True,
    )
    campaign = SimpleNamespace(status="completed")
    async def fake_scalar(_query):
        return campaign

    db = SimpleNamespace(scalar=fake_scalar)
    auto_calls = []

    async def fake_probe(db, tenant_id=None):
        return {
            "index_name": "smartaihub-knowledge-v1",
            "dimensions": 768,
            "metric": "cosine",
        }

    async def fake_request(*args, **kwargs):
        return state

    async def fake_auto(db, **kwargs):
        auto_calls.append(kwargs)
        return {
            "automatic": True,
            "cutover_applied": True,
            "current_read_provider": "cloudflare_vectorize",
            "failed_checks": [],
            "gate": {"passed": True},
        }

    async def fake_get_or_create(db, tenant_id=None):
        state.status = "cutover_complete"
        state.current_read_provider = "cloudflare_vectorize"
        state.mirror_writes = False
        state.freeze_non_emergency_edits = False
        return state

    monkeypatch.setattr(admin_api, "_probe_vectorize_cutover_target", fake_probe)
    monkeypatch.setattr(admin_api, "request_provider_cutover", fake_request)
    monkeypatch.setattr(admin_api, "maybe_auto_promote_vectorize_cutover", fake_auto)
    monkeypatch.setattr(admin_api, "get_or_create_switch_state", fake_get_or_create)

    result = await admin_api.request_vectordb_provider_cutover(
        admin_api.CutoverRequestPayload(
            target_provider="cloudflare_vectorize",
            tenant_id="tenant-auto-api",
            campaign_id=42,
        ),
        request=SimpleNamespace(),
        admin=SimpleNamespace(),
        db=db,
    )

    assert result["status"] == "cutover_complete"
    assert result["current_read_provider"] == "cloudflare_vectorize"
    assert result["automatic_promotion"]["cutover_applied"] is True
    assert auto_calls[0]["target_index"] == "smartaihub-knowledge-v1"


@pytest.mark.asyncio
async def test_approve_vectorize_cutover_rechecks_target_before_read_switch(monkeypatch):
    state = SimpleNamespace(
        target_provider="cloudflare_vectorize",
        campaign_id=12,
    )

    async def fake_get_or_create_switch_state(db, tenant_id=None):
        return state

    async def fake_probe(db, tenant_id=None):
        raise RuntimeError("target_connectivity_check_failed:vectorize_probe_failed")

    async def unexpected_approve(*args, **kwargs):
        raise AssertionError("read switch must not run after a failed target probe")

    monkeypatch.setattr(admin_api, "get_or_create_switch_state", fake_get_or_create_switch_state)
    monkeypatch.setattr(admin_api, "_probe_vectorize_cutover_target", fake_probe)
    monkeypatch.setattr(admin_api, "approve_read_cutover", unexpected_approve)

    with pytest.raises(HTTPException) as exc:
        await admin_api.approve_vectordb_provider_cutover(
            admin_api.CutoverApprovePayload(
                coverage_ratio=1.0,
                smoke_passed=True,
                parity_ratio=1.0,
            ),
            request=SimpleNamespace(),
            admin=SimpleNamespace(),
            db=SimpleNamespace(),
        )

    assert exc.value.status_code == 400
    assert "vectorize_probe_failed" in str(exc.value.detail)


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
    async def fake_resolve_provider(db, tenant_id=None):
        return "cloudflare_vectorize", {
            "vectorizeAccountId": "db-account",
            "vectorizeApiToken": "db-token",
            "vectorizeKnowledgeIndexName": "smartaihub-library",
        }

    monkeypatch.setattr(admin_api, "resolve_library_vector_provider_from_db", fake_resolve_provider)
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
    monkeypatch.setenv("CF_VECTORIZE_API_TOKEN", "cf-vectorize-token-fallback")

    result = await admin_api.get_vectordb_health(
        request=SimpleNamespace(),
        tenant_id=None,
        admin=SimpleNamespace(),
        db=SimpleNamespace(),
    )

    config = result["provider_diagnostics"]["config_masked"]
    assert config["account_id_configured"] is True
    assert config["api_token_configured"] is True
