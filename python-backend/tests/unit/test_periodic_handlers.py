"""Tests for Cloud Scheduler periodic task handler endpoints.

Verifies that all handler paths referenced by Cloud Scheduler jobs
have corresponding registered endpoints in the FastAPI app, and that
each handler is idempotent (safe to invoke multiple times).
"""

import os
from unittest.mock import AsyncMock, patch
import pytest
import httpx

from app.main import app

# The full list of handler paths that Cloud Scheduler targets
PERIODIC_HANDLER_PATHS = [
    "/tasks/cleanup-expired",
    "/tasks/retry-failed",
    "/tasks/retry-callbacks",
    "/tasks/recover-stuck",
    "/tasks/check-workflows",
    "/tasks/cleanup-sessions",
    "/tasks/renew-drive-channels",
    "/tasks/poll-drive-changes",
    "/tasks/process-dead-letters",
    "/tasks/cleanup-redis-stale",
    "/tasks/deliver-scheduled-fallback",
]

# Shared internal token for OIDC middleware bypass in development
_INTERNAL_TOKEN = "test-internal-token-for-tasks"


@pytest.fixture(autouse=True)
def _set_task_env(monkeypatch):
    """Set environment variables so OIDCAuthMiddleware accepts requests."""
    monkeypatch.setenv("ENVIRONMENT", "development")
    monkeypatch.setenv("TASKS_INTERNAL_TOKEN", _INTERNAL_TOKEN)


@pytest.fixture
def api_client():
    """Create an async test client that passes the internal auth token."""
    transport = httpx.ASGITransport(app=app)
    return httpx.AsyncClient(
        transport=transport,
        base_url="http://test",
        headers={"X-Internal-Token": _INTERNAL_TOKEN},
    )


@pytest.mark.unit
class TestPeriodicHandlerRegistration:
    """All handler paths referenced in Cloud Scheduler must have endpoints."""

    @pytest.mark.parametrize("path", PERIODIC_HANDLER_PATHS)
    @pytest.mark.asyncio
    async def test_handler_path_exists(self, api_client, path):
        """Each handler path must return a status code other than 404/405
        when POSTed to. A 401 is acceptable (means the route exists but
        requires auth). A 404 or 405 means the route is not registered."""
        async with api_client as client:
            response = await client.post(path, json={})
        assert response.status_code not in (404, 405), (
            f"Route {path} returned {response.status_code} - "
            f"endpoint is not registered"
        )

    @pytest.mark.parametrize("path", PERIODIC_HANDLER_PATHS)
    @pytest.mark.asyncio
    async def test_handler_returns_json(self, api_client, path):
        """Each handler should return a JSON response."""
        async with api_client as client:
            response = await client.post(path, json={})
        if response.status_code == 200:
            assert response.headers.get("content-type", "").startswith(
                "application/json"
            )

    @pytest.mark.parametrize("path", PERIODIC_HANDLER_PATHS)
    @pytest.mark.asyncio
    async def test_handler_rejects_get(self, api_client, path):
        """Each handler should not return 200 for GET requests.
        May return 401 (middleware), 404, or 405 depending on config."""
        async with api_client as client:
            response = await client.get(path)
        assert response.status_code != 200, (
            f"Route {path} returned 200 for GET - should be POST only"
        )


@pytest.mark.unit
class TestPeriodicHandlerIdempotency:
    """Each periodic handler must be safe to run twice in succession.

    Mocks the underlying async functions to avoid DB dependencies.
    The focus is on handler-level idempotency, not DB-level behaviour.
    """

    @pytest.mark.asyncio
    @patch(
        "app.tasks.media_tasks._cleanup_expired_tasks_async",
        new_callable=AsyncMock,
        return_value={"status": "completed", "deleted": 0},
    )
    async def test_cleanup_expired_idempotent(self, mock_fn, api_client):
        """Running cleanup-expired twice produces no errors."""
        async with api_client as client:
            r1 = await client.post("/tasks/cleanup-expired", json={})
            r2 = await client.post("/tasks/cleanup-expired", json={})
        assert r1.status_code == 200
        assert r2.status_code == 200
        assert mock_fn.await_count == 2

    @pytest.mark.asyncio
    @patch(
        "app.tasks.media_tasks._retry_failed_tasks_async",
        new_callable=AsyncMock,
        return_value={"status": "completed", "retried": 0},
    )
    async def test_retry_failed_idempotent(self, mock_fn, api_client):
        """Running retry-failed twice does not cause errors."""
        async with api_client as client:
            r1 = await client.post("/tasks/retry-failed", json={})
            r2 = await client.post("/tasks/retry-failed", json={})
        assert r1.status_code == 200
        assert r2.status_code == 200
        assert mock_fn.await_count == 2

    @pytest.mark.asyncio
    async def test_process_dead_letters_idempotent(self, api_client):
        """Running process-dead-letters twice does not cause errors.
        This handler returns 200 even when the dead_letter_tasks table
        doesn't exist yet (migration safety)."""
        async with api_client as client:
            r1 = await client.post("/tasks/process-dead-letters", json={})
            r2 = await client.post("/tasks/process-dead-letters", json={})
        assert r1.status_code == 200
        assert r2.status_code == 200

    @pytest.mark.asyncio
    async def test_cleanup_redis_stale_idempotent(self, api_client):
        """Running cleanup-redis-stale twice does not cause errors.
        Handler returns 200 even when Redis is unavailable (graceful)."""
        async with api_client as client:
            r1 = await client.post("/tasks/cleanup-redis-stale", json={})
            r2 = await client.post("/tasks/cleanup-redis-stale", json={})
        assert r1.status_code == 200
        assert r2.status_code == 200

    @pytest.mark.asyncio
    async def test_deliver_scheduled_fallback_idempotent(self, api_client):
        """Running deliver-scheduled-fallback twice does not cause errors.
        This handler returns 200 even when no scheduled messages exist."""
        async with api_client as client:
            r1 = await client.post("/tasks/deliver-scheduled-fallback", json={})
            r2 = await client.post("/tasks/deliver-scheduled-fallback", json={})
        assert r1.status_code == 200
        assert r2.status_code == 200
