from datetime import timedelta

import pytest
from httpx import ASGITransport, AsyncClient

from app.main import app
from app.api.live_browser import (
    get_live_browser_adapter_dependency,
    get_live_browser_manager_dependency,
)
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


@pytest.mark.asyncio
async def test_live_browser_api_supports_create_resume_and_command_flow():
    manager = _build_manager()
    adapter = _build_adapter()

    app.dependency_overrides[get_live_browser_manager_dependency] = lambda: manager
    app.dependency_overrides[get_live_browser_adapter_dependency] = lambda: adapter
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
    finally:
        app.dependency_overrides.pop(get_live_browser_manager_dependency, None)
        app.dependency_overrides.pop(get_live_browser_adapter_dependency, None)


@pytest.mark.asyncio
async def test_live_browser_api_returns_contract_error_for_version_conflicts():
    manager = _build_manager()
    adapter = _build_adapter()

    app.dependency_overrides[get_live_browser_manager_dependency] = lambda: manager
    app.dependency_overrides[get_live_browser_adapter_dependency] = lambda: adapter
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
