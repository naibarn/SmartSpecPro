from datetime import UTC, datetime, timedelta

import pytest
from httpx import ASGITransport, AsyncClient
from jose import jwt

from app.main import app
from app.api.live_browser import (
    get_live_browser_adapter_dependency,
    get_live_browser_manager_dependency,
)
from app.core.config import settings
from app.services.live_browser_adapter import (
    InMemoryManagedBrowserBackend,
    ManagedLiveBrowserAdapter,
)
from app.services.live_browser_session_manager import (
    InMemoryLiveBrowserStore,
    InMemorySingleWriterCoordinator,
    LiveBrowserSessionManager,
)


def _build_manager() -> LiveBrowserSessionManager:
    return LiveBrowserSessionManager(
        store=InMemoryLiveBrowserStore(),
        coordinator=InMemorySingleWriterCoordinator(),
        writer_id="test-live-runtime",
        lease_ttl=timedelta(minutes=1),
    )


def _build_adapter() -> ManagedLiveBrowserAdapter:
    return ManagedLiveBrowserAdapter(
        backend=InMemoryManagedBrowserBackend(),
        token_ttl=timedelta(minutes=5),
    )


def _set_runtime_overrides(
    *,
    manager: LiveBrowserSessionManager,
    adapter: ManagedLiveBrowserAdapter,
) -> None:
    async def _manager_override() -> LiveBrowserSessionManager:
        return manager

    async def _adapter_override() -> ManagedLiveBrowserAdapter:
        return adapter

    app.dependency_overrides[get_live_browser_manager_dependency] = _manager_override
    app.dependency_overrides[get_live_browser_adapter_dependency] = _adapter_override


def _build_takeover_proof(
    *,
    session_id: str,
    session_version: int,
    actor_id: str = "42",
    user_id: int = 42,
    tenant_id: str = "tenant-123",
    assurance: str = "recent_sign_in",
    reauthenticated_at: datetime | None = None,
) -> str:
    import time

    issued_at = int(time.time())
    reauth_at = reauthenticated_at or datetime.now(UTC)
    payload = {
        "sub": actor_id,
        "type": "live_browser_takeover_step_up",
        "liveBrowserSessionId": session_id,
        "liveBrowserSessionVersion": session_version,
        "liveBrowserActorId": actor_id,
        "liveBrowserUserId": str(user_id),
        "liveBrowserTenantId": tenant_id,
        "liveBrowserAssurance": assurance,
        "liveBrowserReauthenticatedAt": reauth_at.isoformat(),
        "iat": issued_at,
        "exp": issued_at + 300,
    }
    return jwt.encode(payload, settings.JWT_SECRET, algorithm=settings.ALGORITHM)


@pytest.mark.asyncio
async def test_live_browser_api_supports_create_resume_and_command_flow():
    manager = _build_manager()
    adapter = _build_adapter()

    _set_runtime_overrides(manager=manager, adapter=adapter)
    try:
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            create_response = await client.post(
                "/api/v1/live-browser/sessions",
                json={
                    "request": {
                        "actor": {
                            "actorType": "user",
                            "actorId": "42",
                        },
                        "sourceType": "automation",
                        "sourceId": "task-123",
                        "mode": "observe",
                    },
                    "tenantId": "tenant-123",
                    "userId": 42,
                    "browserPolicyContext": {
                        "allowedDomains": ["example.com"],
                    },
                },
            )

            assert create_response.status_code == 200
            created = create_response.json()
            session_id = created["sessionId"]
            assert created["stream"]["viewerToken"]

            get_response = await client.post(
                f"/api/v1/live-browser/sessions/{session_id}/get",
                json={
                    "request": {
                        "sessionId": session_id,
                        "actor": {
                            "actorType": "user",
                            "actorId": "42",
                        },
                    },
                    "tenantId": "tenant-123",
                    "userId": 42,
                },
            )

            assert get_response.status_code == 200
            session = get_response.json()
            assert session["status"] == "ready"
            assert session["browserContextRef"]["activeTabId"] == "tab_1"

            send_response = await client.post(
                f"/api/v1/live-browser/sessions/{session_id}/commands",
                json={
                    "request": {
                        "sessionId": session_id,
                        "sessionVersion": session["sessionVersion"],
                        "idempotencyKey": "cmd-1",
                        "actor": {
                            "actorType": "user",
                            "actorId": "42",
                        },
                        "command": {
                            "type": "natural_language",
                            "text": "Open the pricing page",
                        },
                    },
                    "tenantId": "tenant-123",
                    "userId": 42,
                },
            )

            assert send_response.status_code == 200
            send_payload = send_response.json()
            assert send_payload["accepted"] is True

            events_response = await client.post(
                f"/api/v1/live-browser/sessions/{session_id}/events",
                json={
                    "request": {
                        "sessionId": session_id,
                        "actor": {
                            "actorType": "user",
                            "actorId": "42",
                        },
                        "limit": 20,
                    },
                    "tenantId": "tenant-123",
                    "userId": 42,
                },
            )

            assert events_response.status_code == 200
            events_payload = events_response.json()
            assert any(event["type"] == "session_created" for event in events_payload["events"])
            assert any(event["type"] == "command_queued" for event in events_payload["events"])
            command_event = next(
                event for event in events_payload["events"] if event["type"] == "command_queued"
            )
            assert command_event["payload"]["session"]["sessionId"] == session_id
            assert command_event["payload"]["session"]["sessionVersion"] == 2
    finally:
        app.dependency_overrides.pop(get_live_browser_manager_dependency, None)
        app.dependency_overrides.pop(get_live_browser_adapter_dependency, None)


@pytest.mark.asyncio
async def test_live_browser_api_updates_policy_context_and_returns_new_session_version():
    manager = _build_manager()
    adapter = _build_adapter()

    _set_runtime_overrides(manager=manager, adapter=adapter)
    try:
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            create_response = await client.post(
                "/api/v1/live-browser/sessions",
                json={
                    "request": {
                        "actor": {
                            "actorType": "user",
                            "actorId": "42",
                        },
                        "sourceType": "automation",
                        "sourceId": "task-ctx",
                        "mode": "observe",
                    },
                    "tenantId": "tenant-123",
                    "userId": 42,
                    "browserPolicyContext": {
                        "skillDraft": {
                            "status": "building",
                            "skillId": "compare_options",
                            "note": "Building skill draft.",
                        },
                    },
                },
            )

            assert create_response.status_code == 200
            session_id = create_response.json()["sessionId"]

            update_response = await client.post(
                f"/api/v1/live-browser/sessions/{session_id}/policy-context",
                json={
                    "request": {
                        "sessionId": session_id,
                        "sessionVersion": 1,
                        "idempotencyKey": "policy-context-1",
                        "actor": {
                            "actorType": "agent",
                            "actorId": "browser_goal_skill_draft",
                        },
                        "policyContextPatch": {
                            "skillDraft": {
                                "status": "ready",
                                "skillId": "compare_options",
                                "note": "Reusable browser skill draft is ready.",
                            },
                        },
                    },
                    "tenantId": "tenant-123",
                    "userId": 42,
                },
            )

            assert update_response.status_code == 200
            assert update_response.json()["sessionVersion"] == 2
            assert update_response.json()["policyContext"]["skillDraft"]["status"] == "ready"

            get_response = await client.post(
                f"/api/v1/live-browser/sessions/{session_id}/get",
                json={
                    "request": {
                        "sessionId": session_id,
                        "actor": {
                            "actorType": "user",
                            "actorId": "42",
                        },
                    },
                    "tenantId": "tenant-123",
                    "userId": 42,
                },
            )

            assert get_response.status_code == 200
            assert get_response.json()["policyContext"]["skillDraft"]["status"] == "ready"
    finally:
        app.dependency_overrides.pop(get_live_browser_manager_dependency, None)
        app.dependency_overrides.pop(get_live_browser_adapter_dependency, None)


@pytest.mark.asyncio
async def test_live_browser_api_stream_replays_terminal_events_from_last_event_id():
    manager = _build_manager()
    adapter = _build_adapter()

    _set_runtime_overrides(manager=manager, adapter=adapter)
    try:
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            create_response = await client.post(
                "/api/v1/live-browser/sessions",
                json={
                    "request": {
                        "actor": {
                            "actorType": "user",
                            "actorId": "42",
                        },
                        "sourceType": "automation",
                        "sourceId": "task-stream",
                        "mode": "observe",
                    },
                    "tenantId": "tenant-123",
                    "userId": 42,
                },
            )

            assert create_response.status_code == 200
            session_id = create_response.json()["sessionId"]

            first_events_response = await client.post(
                f"/api/v1/live-browser/sessions/{session_id}/events",
                json={
                    "request": {
                        "sessionId": session_id,
                        "actor": {
                            "actorType": "user",
                            "actorId": "42",
                        },
                        "limit": 20,
                    },
                    "tenantId": "tenant-123",
                    "userId": 42,
                },
            )

            first_events_payload = first_events_response.json()
            last_cursor = first_events_payload["events"][-1]["cursor"]

            cancel_response = await client.post(
                f"/api/v1/live-browser/sessions/{session_id}/cancel",
                json={
                    "request": {
                        "sessionId": session_id,
                        "sessionVersion": 1,
                        "idempotencyKey": "cancel-stream-1",
                        "actor": {
                            "actorType": "user",
                            "actorId": "42",
                        },
                        "reason": "user_cancelled",
                    },
                    "tenantId": "tenant-123",
                    "userId": 42,
                },
            )
            assert cancel_response.status_code == 200

            response = await client.get(
                f"/api/v1/live-browser/sessions/{session_id}/stream",
                params={
                    "tenantId": "tenant-123",
                    "userId": 42,
                    "actorType": "user",
                    "actorId": "42",
                    "lastEventId": last_cursor,
                },
            )
            assert response.status_code == 200
            joined = response.text
            assert "event: live_browser_event" in joined
            assert '"type": "session_failed"' in joined
            assert '"sessionId":' in joined
            assert f"id: {session_id}:2:" in joined
    finally:
        app.dependency_overrides.pop(get_live_browser_manager_dependency, None)
        app.dependency_overrides.pop(get_live_browser_adapter_dependency, None)


@pytest.mark.asyncio
async def test_live_browser_api_denies_cross_tenant_session_access():
    manager = _build_manager()
    adapter = _build_adapter()

    _set_runtime_overrides(manager=manager, adapter=adapter)
    try:
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            create_response = await client.post(
                "/api/v1/live-browser/sessions",
                json={
                    "request": {
                        "actor": {
                            "actorType": "user",
                            "actorId": "42",
                        },
                        "sourceType": "automation",
                        "sourceId": "task-sec",
                        "mode": "observe",
                    },
                    "tenantId": "tenant-123",
                    "userId": 42,
                },
            )

            assert create_response.status_code == 200
            session_id = create_response.json()["sessionId"]

            get_response = await client.post(
                f"/api/v1/live-browser/sessions/{session_id}/get",
                json={
                    "request": {
                        "sessionId": session_id,
                        "actor": {
                            "actorType": "user",
                            "actorId": "42",
                        },
                    },
                    "tenantId": "tenant-other",
                    "userId": 42,
                },
            )

            assert get_response.status_code == 403
            assert get_response.json()["detail"] == "Live Browser session access denied"
    finally:
        app.dependency_overrides.pop(get_live_browser_manager_dependency, None)
        app.dependency_overrides.pop(get_live_browser_adapter_dependency, None)


@pytest.mark.asyncio
async def test_live_browser_api_returns_contract_error_for_version_conflicts():
    manager = _build_manager()
    adapter = _build_adapter()

    _set_runtime_overrides(manager=manager, adapter=adapter)
    try:
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            create_response = await client.post(
                "/api/v1/live-browser/sessions",
                json={
                    "request": {
                        "actor": {
                            "actorType": "user",
                            "actorId": "42",
                        },
                        "sourceType": "automation",
                        "mode": "observe",
                    },
                    "tenantId": "tenant-123",
                    "userId": 42,
                },
            )
            session_id = create_response.json()["sessionId"]

            conflict_response = await client.post(
                f"/api/v1/live-browser/sessions/{session_id}/commands",
                json={
                    "request": {
                        "sessionId": session_id,
                        "sessionVersion": 999,
                        "idempotencyKey": "cmd-conflict",
                        "actor": {
                            "actorType": "user",
                            "actorId": "42",
                        },
                        "command": {
                            "type": "natural_language",
                            "text": "Open the pricing page",
                        },
                    },
                    "tenantId": "tenant-123",
                    "userId": 42,
                },
            )

            assert conflict_response.status_code == 409
            assert conflict_response.json()["error"]["code"] == "session_version_conflict"
    finally:
        app.dependency_overrides.pop(get_live_browser_manager_dependency, None)
        app.dependency_overrides.pop(get_live_browser_adapter_dependency, None)


@pytest.mark.asyncio
async def test_live_browser_api_queues_initial_execution_intent_during_create():
    manager = _build_manager()
    adapter = _build_adapter()

    _set_runtime_overrides(manager=manager, adapter=adapter)
    try:
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            create_response = await client.post(
                "/api/v1/live-browser/sessions",
                json={
                    "request": {
                        "actor": {
                            "actorType": "user",
                            "actorId": "42",
                        },
                        "sourceType": "automation",
                        "sourceId": "task-123",
                        "mode": "observe",
                        "executionIntent": {
                            "prompt": "Inspect checkout flow",
                        },
                    },
                    "tenantId": "tenant-123",
                    "userId": 42,
                    "browserPolicyContext": {
                        "allowedDomains": ["example.com"],
                    },
                },
            )

            assert create_response.status_code == 200
            created = create_response.json()
            session_id = created["sessionId"]
            assert created["status"] == "agent_running"
            assert created["controlMode"] == "agent_control"

            get_response = await client.post(
                f"/api/v1/live-browser/sessions/{session_id}/get",
                json={
                    "request": {
                        "sessionId": session_id,
                        "actor": {
                            "actorType": "user",
                            "actorId": "42",
                        },
                    },
                    "tenantId": "tenant-123",
                    "userId": 42,
                },
            )

            assert get_response.status_code == 200
            session = get_response.json()
            assert session["status"] == "agent_running"
            assert session["browserContextRef"]["activeCommand"]["text"] == "Inspect checkout flow"
            assert session["policyContext"]["executionIntent"]["prompt"] == "Inspect checkout flow"

            events_response = await client.post(
                f"/api/v1/live-browser/sessions/{session_id}/events",
                json={
                    "request": {
                        "sessionId": session_id,
                        "actor": {
                            "actorType": "user",
                            "actorId": "42",
                        },
                        "limit": 20,
                    },
                    "tenantId": "tenant-123",
                    "userId": 42,
                },
            )

            assert events_response.status_code == 200
            events_payload = events_response.json()
            assert any(event["type"] == "agent_started" for event in events_payload["events"])
            assert any(event["type"] == "command_queued" for event in events_payload["events"])
    finally:
        app.dependency_overrides.pop(get_live_browser_manager_dependency, None)
        app.dependency_overrides.pop(get_live_browser_adapter_dependency, None)


@pytest.mark.asyncio
async def test_live_browser_api_rejects_takeover_without_step_up_proof():
    manager = _build_manager()
    adapter = _build_adapter()

    _set_runtime_overrides(manager=manager, adapter=adapter)
    try:
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            create_response = await client.post(
                "/api/v1/live-browser/sessions",
                json={
                    "request": {
                        "actor": {
                            "actorType": "user",
                            "actorId": "42",
                        },
                        "sourceType": "automation",
                        "mode": "observe",
                    },
                    "tenantId": "tenant-123",
                    "userId": 42,
                },
            )
            session_id = create_response.json()["sessionId"]

            takeover_response = await client.post(
                f"/api/v1/live-browser/sessions/{session_id}/take-control",
                json={
                    "request": {
                        "sessionId": session_id,
                        "sessionVersion": 1,
                        "idempotencyKey": "takeover-missing-proof",
                        "actor": {
                            "actorType": "user",
                            "actorId": "42",
                        },
                        "reason": "manual_takeover_requested",
                    },
                    "tenantId": "tenant-123",
                    "userId": 42,
                },
            )

            assert takeover_response.status_code == 400
            assert takeover_response.json()["error"]["code"] == "step_up_auth_required"
    finally:
        app.dependency_overrides.pop(get_live_browser_manager_dependency, None)
        app.dependency_overrides.pop(get_live_browser_adapter_dependency, None)


@pytest.mark.asyncio
async def test_live_browser_api_accepts_takeover_with_valid_step_up_proof():
    manager = _build_manager()
    adapter = _build_adapter()

    _set_runtime_overrides(manager=manager, adapter=adapter)
    try:
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            create_response = await client.post(
                "/api/v1/live-browser/sessions",
                json={
                    "request": {
                        "actor": {
                            "actorType": "user",
                            "actorId": "42",
                        },
                        "sourceType": "automation",
                        "mode": "observe",
                    },
                    "tenantId": "tenant-123",
                    "userId": 42,
                },
            )
            session_id = create_response.json()["sessionId"]
            takeover_proof = _build_takeover_proof(session_id=session_id, session_version=1)

            takeover_response = await client.post(
                f"/api/v1/live-browser/sessions/{session_id}/take-control",
                json={
                    "request": {
                        "sessionId": session_id,
                        "sessionVersion": 1,
                        "idempotencyKey": "takeover-with-proof",
                        "actor": {
                            "actorType": "user",
                            "actorId": "42",
                        },
                        "reason": "manual_takeover_requested",
                    },
                    "tenantId": "tenant-123",
                    "userId": 42,
                    "takeoverProof": takeover_proof,
                },
            )

            assert takeover_response.status_code == 200
            assert takeover_response.json()["controlMode"] == "takeover"
    finally:
        app.dependency_overrides.pop(get_live_browser_manager_dependency, None)
        app.dependency_overrides.pop(get_live_browser_adapter_dependency, None)


@pytest.mark.asyncio
async def test_live_browser_api_rejects_recent_sign_in_proof_on_sensitive_pages():
    manager = _build_manager()
    adapter = _build_adapter()

    _set_runtime_overrides(manager=manager, adapter=adapter)
    try:
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            create_response = await client.post(
                "/api/v1/live-browser/sessions",
                json={
                    "request": {
                        "actor": {
                            "actorType": "user",
                            "actorId": "42",
                        },
                        "sourceType": "automation",
                        "mode": "observe",
                        "initialUrl": "https://accounts.example.com/login",
                    },
                    "tenantId": "tenant-123",
                    "userId": 42,
                },
            )
            session_id = create_response.json()["sessionId"]
            takeover_proof = _build_takeover_proof(session_id=session_id, session_version=1)

            takeover_response = await client.post(
                f"/api/v1/live-browser/sessions/{session_id}/take-control",
                json={
                    "request": {
                        "sessionId": session_id,
                        "sessionVersion": 1,
                        "idempotencyKey": "takeover-sensitive-page-no-mfa",
                        "actor": {
                            "actorType": "user",
                            "actorId": "42",
                        },
                        "reason": "manual_takeover_requested",
                    },
                    "tenantId": "tenant-123",
                    "userId": 42,
                    "takeoverProof": takeover_proof,
                },
            )

            assert takeover_response.status_code == 400
            assert takeover_response.json()["error"]["code"] == "step_up_auth_required"
            assert takeover_response.json()["error"]["reasonCodes"] == ["sensitive_page_mfa_required"]
    finally:
        app.dependency_overrides.pop(get_live_browser_manager_dependency, None)
        app.dependency_overrides.pop(get_live_browser_adapter_dependency, None)


@pytest.mark.asyncio
async def test_live_browser_api_accepts_mfa_takeover_proof_on_sensitive_pages():
    manager = _build_manager()
    adapter = _build_adapter()

    _set_runtime_overrides(manager=manager, adapter=adapter)
    try:
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            create_response = await client.post(
                "/api/v1/live-browser/sessions",
                json={
                    "request": {
                        "actor": {
                            "actorType": "user",
                            "actorId": "42",
                        },
                        "sourceType": "automation",
                        "mode": "observe",
                        "initialUrl": "https://app.example.com/billing/checkout",
                    },
                    "tenantId": "tenant-123",
                    "userId": 42,
                },
            )
            session_id = create_response.json()["sessionId"]
            takeover_proof = _build_takeover_proof(
                session_id=session_id,
                session_version=1,
                assurance="mfa",
            )

            takeover_response = await client.post(
                f"/api/v1/live-browser/sessions/{session_id}/take-control",
                json={
                    "request": {
                        "sessionId": session_id,
                        "sessionVersion": 1,
                        "idempotencyKey": "takeover-sensitive-page-mfa",
                        "actor": {
                            "actorType": "user",
                            "actorId": "42",
                        },
                        "reason": "manual_takeover_requested",
                    },
                    "tenantId": "tenant-123",
                    "userId": 42,
                    "takeoverProof": takeover_proof,
                },
            )

            assert takeover_response.status_code == 200
            assert takeover_response.json()["controlMode"] == "takeover"
    finally:
        app.dependency_overrides.pop(get_live_browser_manager_dependency, None)
        app.dependency_overrides.pop(get_live_browser_adapter_dependency, None)
