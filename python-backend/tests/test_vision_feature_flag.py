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
    """Create test app with SMARTSPEC_PROXY_TOKEN configured."""
    from unittest.mock import patch as _patch
    with _patch.dict(os.environ, {"SMARTSPEC_PROXY_TOKEN": VALID_TOKEN}):
        from fastapi import FastAPI
        from app.api.vision import router
        app = FastAPI()
        app.include_router(router)
        return app


@pytest.fixture
def client():
    app = _make_app()
    return TestClient(app, raise_server_exceptions=False)


@pytest.fixture
def auth_headers():
    return {"x-proxy-token": VALID_TOKEN}


class TestVisionFeatureFlag:

    def test_vision_endpoint_rejects_when_flag_off(self, client, auth_headers):
        """Returns 403 when multimodalMemory flag is off/missing in Redis."""
        with patch("app.api.vision._check_multimodal_memory_flag", new=AsyncMock(return_value=False)):
            response = client.post("/api/v1/vision/analyze", json=VALID_PAYLOAD, headers=auth_headers)
        assert response.status_code == 403
        assert "not enabled" in response.json()["detail"].lower()

    def test_vision_endpoint_accepts_when_flag_on(self, client, auth_headers):
        """Returns 200 when multimodalMemory flag is on."""
        mock_result = MagicMock()
        mock_result.id = "task-abc-123"
        with (
            patch("app.api.vision._check_multimodal_memory_flag", new=AsyncMock(return_value=True)),
            patch("app.tasks.vision_tasks.analyze_image_task") as mock_task,
        ):
            mock_task.delay.return_value = mock_result
            response = client.post("/api/v1/vision/analyze", json=VALID_PAYLOAD, headers=auth_headers)
        assert response.status_code == 200
        assert response.json()["status"] == "queued"
        assert response.json()["task_id"] == "task-abc-123"

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

    def test_check_flag_returns_false_when_redis_unavailable(self):
        """_check_multimodal_memory_flag returns False when Redis is unavailable."""
        import asyncio
        from app.api.vision import _check_multimodal_memory_flag

        with patch("app.api.vision.get_redis_client", side_effect=Exception("connection refused"), create=True):
            result = asyncio.run(_check_multimodal_memory_flag("tenant-x"))
        assert result is False

    def test_check_flag_reads_correct_redis_key(self):
        """_check_multimodal_memory_flag reads feature_flag:multimodalMemory:{tenant_id}."""
        import asyncio
        from app.api.vision import _check_multimodal_memory_flag

        mock_redis = AsyncMock()
        mock_redis.get = AsyncMock(return_value="true")
        with patch("app.api.vision.get_redis_client", return_value=mock_redis, create=True):
            result = asyncio.run(_check_multimodal_memory_flag("my-tenant"))
        mock_redis.get.assert_called_once_with("feature_flag:multimodalMemory:my-tenant")
        assert result is True
