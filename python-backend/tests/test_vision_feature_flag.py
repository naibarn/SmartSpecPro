"""
Tests for vision endpoint feature flag gating (Section 09).
"""

import pytest
from unittest.mock import AsyncMock, patch, MagicMock
from fastapi.testclient import TestClient

import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


VALID_TOKEN = "test-proxy-token"
VALID_PAYLOAD = {
    "asset_id": 1,
    "image_url": "https://example.com/img.jpg",
    "tenant_id": "tenant-1",
    "user_id": 1,
}


def _make_app():
    """Create test app."""
    from fastapi import FastAPI
    from app.api.vision import router
    from app.core.database import get_db
    app = FastAPI()
    app.include_router(router)

    async def db_override():
        yield AsyncMock()

    app.dependency_overrides[get_db] = db_override
    return app


@pytest.fixture
def client():
    app = _make_app()
    with patch("app.api.vision.settings") as mock_settings:
        mock_settings.SMARTSPEC_PROXY_TOKEN = VALID_TOKEN
        yield TestClient(app, raise_server_exceptions=False)


@pytest.fixture
def auth_headers():
    return {"x-proxy-token": VALID_TOKEN}


class TestVisionFeatureFlag:

    def test_vision_endpoint_rejects_when_flag_off(self, client, auth_headers):
        """Returns 403 when multimodalMemory flag is off/missing in PostgreSQL."""
        with patch("app.api.vision._check_multimodal_memory_flag", new=AsyncMock(return_value=False)):
            response = client.post("/api/v1/vision/analyze", json=VALID_PAYLOAD, headers=auth_headers)
        assert response.status_code == 403
        assert "not enabled" in response.json()["detail"].lower()

    def test_vision_endpoint_accepts_when_flag_on(self, client, auth_headers):
        """Returns 200 when multimodalMemory flag is on."""
        mock_result = MagicMock(id="job-abc-123")
        with (
            patch("app.api.vision._check_multimodal_memory_flag", new=AsyncMock(return_value=True)),
            patch("app.api.vision.dispatch_python_task", return_value=mock_result) as dispatch,
            patch("app.tasks.vision_tasks.analyze_image_task") as mock_task,
        ):
            mock_task.name = "app.tasks.vision_tasks.analyze_image_task"
            response = client.post("/api/v1/vision/analyze", json=VALID_PAYLOAD, headers=auth_headers)
        assert response.status_code == 200
        assert response.json()["status"] == "queued"
        assert response.json()["task_id"] == "job-abc-123"
        dispatch.assert_called_once()

    def test_vision_endpoint_rejects_without_proxy_token(self, client):
        """Returns 401 when x-proxy-token header is missing."""
        response = client.post("/api/v1/vision/analyze", json=VALID_PAYLOAD)
        assert response.status_code == 401

    def test_vision_endpoint_rejects_invalid_proxy_token(self, client):
        """Returns 401 when x-proxy-token header has wrong value."""
        response = client.post(
            "/api/v1/vision/analyze",
            json=VALID_PAYLOAD,
            headers={"x-proxy-token": "wrong-token"},
        )
        assert response.status_code == 401

    def test_check_flag_returns_false_when_database_lookup_fails(self):
        """Feature-flag lookup fails closed when PostgreSQL cannot be read."""
        from app.api.vision import _check_multimodal_memory_flag

        db = AsyncMock()
        db.execute.side_effect = Exception("database unavailable")
        result = __import__("asyncio").run(_check_multimodal_memory_flag("tenant-x", db))
        assert result is False

    def test_check_flag_reads_tenant_override_from_postgres(self):
        """Tenant-scoped PostgreSQL override is checked before the global value."""
        from app.api.vision import _check_multimodal_memory_flag

        db = AsyncMock()
        tenant_result = MagicMock()
        tenant_result.scalar_one_or_none.return_value = True
        db.execute.return_value = tenant_result
        result = __import__("asyncio").run(_check_multimodal_memory_flag("my-tenant", db))
        assert db.execute.await_count == 1
        assert db.execute.await_args.args[1] == {"scope_key": "tenant:my-tenant:multimodalMemory"}
        assert result is True

    def test_check_flag_prefers_explicit_tenant_false_over_global_true(self):
        """An explicit tenant false value must override a global true value."""
        from app.api.vision import _check_multimodal_memory_flag

        db = AsyncMock()
        tenant_result = MagicMock()
        tenant_result.scalar_one_or_none.return_value = False
        db.execute.return_value = tenant_result
        result = __import__("asyncio").run(_check_multimodal_memory_flag("tenant-x", db))
        assert result is False

    def test_vision_task_not_dispatched_when_flag_off(self, client, auth_headers):
        """analyze_image_task.delay() is NOT called when feature flag is off."""
        with (
            patch("app.api.vision._check_multimodal_memory_flag", new=AsyncMock(return_value=False)),
            patch("app.api.vision.dispatch_python_task") as dispatch,
        ):
            client.post("/api/v1/vision/analyze", json=VALID_PAYLOAD, headers=auth_headers)
        dispatch.assert_not_called()

    def test_vision_endpoint_propagates_task_dispatch_error(self, client, auth_headers):
        """Returns 500 when canonical worker-job dispatch fails."""
        with (
            patch("app.api.vision._check_multimodal_memory_flag", new=AsyncMock(return_value=True)),
            patch("app.api.vision.dispatch_python_task") as dispatch,
            patch("app.tasks.vision_tasks.analyze_image_task") as mock_task,
        ):
            mock_task.name = "app.tasks.vision_tasks.analyze_image_task"
            dispatch.side_effect = Exception("worker control plane unavailable")
            response = client.post("/api/v1/vision/analyze", json=VALID_PAYLOAD, headers=auth_headers)
        # When task.delay() raises, the endpoint should return a 500 error
        assert response.status_code == 500
