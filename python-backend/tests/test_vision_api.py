"""
Tests for vision analysis FastAPI endpoint (Section 03: Vision Pipeline).
"""

import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from fastapi.testclient import TestClient


@pytest.fixture
def client():
    """Test client with mocked Celery task."""
    from app.main import app
    return TestClient(app)


VALID_TOKEN = "test-proxy-token"
VALID_PAYLOAD = {
    "asset_id": 1,
    "image_url": "https://example.com/img.jpg",
    "tenant_id": "tenant-1",
    "user_id": 42,
    "system_cost": False,
}


@pytest.mark.unit
class TestVisionAnalyzeAuth:
    """Test authentication for POST /api/v1/vision/analyze."""

    def test_valid_token_returns_200(self, client):
        """Request with valid x-proxy-token returns 200 and task_id."""
        with (
            patch("app.tasks.vision_tasks.analyze_image_task") as mock_task,
            patch("app.api.vision.settings") as mock_settings,
        ):
            mock_settings.SMARTSPEC_PROXY_TOKEN = VALID_TOKEN
            mock_result = MagicMock()
            mock_result.id = "celery-task-uuid-123"
            mock_task.delay.return_value = mock_result

            resp = client.post(
                "/api/v1/vision/analyze",
                json=VALID_PAYLOAD,
                headers={"x-proxy-token": VALID_TOKEN},
            )
            assert resp.status_code == 200
            data = resp.json()
            assert "task_id" in data
            assert data["status"] == "queued"

    def test_missing_token_returns_401(self, client):
        """Request without x-proxy-token returns 401."""
        with patch("app.api.vision.settings") as mock_settings:
            mock_settings.SMARTSPEC_PROXY_TOKEN = VALID_TOKEN

            resp = client.post(
                "/api/v1/vision/analyze",
                json=VALID_PAYLOAD,
                # No auth header
            )
            assert resp.status_code == 401

    def test_invalid_token_returns_401(self, client):
        """Request with wrong x-proxy-token returns 401."""
        with patch("app.api.vision.settings") as mock_settings:
            mock_settings.SMARTSPEC_PROXY_TOKEN = VALID_TOKEN

            resp = client.post(
                "/api/v1/vision/analyze",
                json=VALID_PAYLOAD,
                headers={"x-proxy-token": "wrong-token"},
            )
            assert resp.status_code == 401


@pytest.mark.unit
class TestVisionAnalyzeValidation:
    """Test request body validation."""

    def test_missing_required_fields_returns_422(self, client):
        """Request missing required fields returns 422 validation error."""
        with patch("app.api.vision.settings") as mock_settings:
            mock_settings.SMARTSPEC_PROXY_TOKEN = VALID_TOKEN

            resp = client.post(
                "/api/v1/vision/analyze",
                json={"asset_id": 1},  # missing image_url, tenant_id, user_id
                headers={"x-proxy-token": VALID_TOKEN},
            )
            assert resp.status_code == 422


@pytest.mark.unit
class TestVisionAnalyzeDispatch:
    """Test task dispatch and response."""

    def test_returns_task_id_on_dispatch(self, client):
        """Endpoint returns a Celery task_id after dispatching."""
        with (
            patch("app.tasks.vision_tasks.analyze_image_task") as mock_task,
            patch("app.api.vision.settings") as mock_settings,
        ):
            mock_settings.SMARTSPEC_PROXY_TOKEN = VALID_TOKEN
            mock_result = MagicMock()
            mock_result.id = "abc-123"
            mock_task.delay.return_value = mock_result

            resp = client.post(
                "/api/v1/vision/analyze",
                json=VALID_PAYLOAD,
                headers={"x-proxy-token": VALID_TOKEN},
            )
            assert resp.status_code == 200
            assert resp.json()["task_id"] == "abc-123"
