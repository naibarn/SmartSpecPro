"""
End-to-end integration tests for the Python vision analysis pipeline (Section 12).

These tests exercise the POST /api/v1/vision/analyze endpoint and the
analyze_image_task Celery task with mocked external APIs.
"""

import pytest
from unittest.mock import patch, AsyncMock, MagicMock
from fastapi.testclient import TestClient
from fastapi import FastAPI

VALID_TOKEN = "test-proxy-token-integration"
VALID_PAYLOAD = {
    "asset_id": 100,
    "image_url": "https://example.com/photo.jpg",
    "tenant_id": "tenant-integration",
    "user_id": 5,
}


def _make_app():
    """Create a test FastAPI app with the vision router."""
    app = FastAPI()
    with patch("app.api.vision.settings") as mock_settings:
        mock_settings.SMARTSPEC_PROXY_TOKEN = VALID_TOKEN
        from app.api.vision import router
        app.include_router(router)
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


class TestVisionPipelineIntegration:
    """End-to-end tests for the Python vision analysis pipeline."""

    def test_analyze_endpoint_enqueues_celery_task(self, client, auth_headers):
        """POST /api/v1/vision/analyze should enqueue analyze_image_task."""
        mock_result = MagicMock()
        mock_result.id = "celery-task-999"
        with (
            patch("app.api.vision._check_multimodal_memory_flag", new=AsyncMock(return_value=True)),
            patch("app.tasks.vision_tasks.analyze_image_task") as mock_task,
        ):
            mock_task.delay.return_value = mock_result
            response = client.post("/api/v1/vision/analyze", json=VALID_PAYLOAD, headers=auth_headers)
        assert response.status_code == 200
        assert response.json()["status"] == "queued"
        assert response.json()["task_id"] == "celery-task-999"
        mock_task.delay.assert_called_once_with(
            VALID_PAYLOAD["asset_id"],
            VALID_PAYLOAD["image_url"],
            VALID_PAYLOAD["tenant_id"],
            VALID_PAYLOAD["user_id"],
            system_cost=False,
        )

    def test_analyze_endpoint_rejects_without_proxy_token(self, client):
        """Endpoint should return 401 without valid x-proxy-token."""
        response = client.post("/api/v1/vision/analyze", json=VALID_PAYLOAD)
        assert response.status_code == 401

    def test_analyze_endpoint_rejects_when_flag_off(self, client, auth_headers):
        """Endpoint should return 403 when multimodalMemory flag is off."""
        with patch("app.api.vision._check_multimodal_memory_flag", new=AsyncMock(return_value=False)):
            response = client.post("/api/v1/vision/analyze", json=VALID_PAYLOAD, headers=auth_headers)
        assert response.status_code == 403
        assert "not enabled" in response.json()["detail"].lower()

    def test_analyze_endpoint_accepts_system_cost_flag(self, client, auth_headers):
        """Endpoint should accept system_cost=True for backfill (no credit deduction)."""
        payload = {**VALID_PAYLOAD, "system_cost": True}
        mock_result = MagicMock()
        mock_result.id = "backfill-task-1"
        with (
            patch("app.api.vision._check_multimodal_memory_flag", new=AsyncMock(return_value=True)),
            patch("app.tasks.vision_tasks.analyze_image_task") as mock_task,
        ):
            mock_task.delay.return_value = mock_result
            response = client.post("/api/v1/vision/analyze", json=payload, headers=auth_headers)
        assert response.status_code == 200
        # system_cost=True passed through to task
        mock_task.delay.assert_called_once_with(
            payload["asset_id"],
            payload["image_url"],
            payload["tenant_id"],
            payload["user_id"],
            system_cost=True,
        )

    def test_check_flag_returns_false_when_redis_unavailable(self):
        """_check_multimodal_memory_flag returns False when Redis is unavailable."""
        import asyncio
        from app.api.vision import _check_multimodal_memory_flag

        with patch(
            "app.core.redis_client.get_redis",
            new=AsyncMock(side_effect=Exception("connection refused")),
        ):
            result = asyncio.run(_check_multimodal_memory_flag("tenant-x"))
        assert result is False

    def test_check_flag_true_when_redis_returns_true_string(self):
        """_check_multimodal_memory_flag returns True when Redis has 'true' value."""
        import asyncio
        from app.api.vision import _check_multimodal_memory_flag

        mock_redis = AsyncMock()
        mock_redis.get = AsyncMock(return_value="true")
        with patch("app.core.redis_client.get_redis", new=AsyncMock(return_value=mock_redis)):
            result = asyncio.run(_check_multimodal_memory_flag("my-tenant"))
        assert result is True

    def test_check_flag_false_when_redis_returns_none(self):
        """_check_multimodal_memory_flag returns False when Redis key doesn't exist."""
        import asyncio
        from app.api.vision import _check_multimodal_memory_flag

        mock_redis = AsyncMock()
        mock_redis.get = AsyncMock(return_value=None)
        with patch("app.core.redis_client.get_redis", new=AsyncMock(return_value=mock_redis)):
            result = asyncio.run(_check_multimodal_memory_flag("no-flag-tenant"))
        assert result is False
