"""
Integration tests for the Python vision analysis pipeline (Section 12).

These tests exercise the POST /api/v1/vision/analyze endpoint and the
worker-job dispatch with mocked external APIs.
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
    from app.core.database import get_db

    async def db_override():
        yield AsyncMock()

    app.dependency_overrides[get_db] = db_override
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

    def test_analyze_endpoint_dispatches_worker_job(self, client, auth_headers):
        """POST /api/v1/vision/analyze should dispatch a canonical worker job."""
        with (
            patch("app.api.vision._check_multimodal_memory_flag", new=AsyncMock(return_value=True)),
            patch("app.tasks.vision_tasks.analyze_image_task") as mock_task,
            patch("app.api.vision.dispatch_python_task", return_value=MagicMock(id="job-999")) as dispatch,
        ):
            mock_task.name = "app.tasks.vision_tasks.analyze_image_task"
            response = client.post("/api/v1/vision/analyze", json=VALID_PAYLOAD, headers=auth_headers)
        assert response.status_code == 200
        assert response.json()["status"] == "queued"
        assert response.json()["task_id"] == "job-999"
        assert dispatch.call_args.args[0] == "app.tasks.vision_tasks.analyze_image_task"
        assert dispatch.call_args.kwargs["args"] == (
            VALID_PAYLOAD["asset_id"], VALID_PAYLOAD["image_url"],
            VALID_PAYLOAD["tenant_id"], VALID_PAYLOAD["user_id"],
        )
        assert dispatch.call_args.kwargs["kwargs"] == {"system_cost": False}

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
        with (
            patch("app.api.vision._check_multimodal_memory_flag", new=AsyncMock(return_value=True)),
            patch("app.tasks.vision_tasks.analyze_image_task") as mock_task,
            patch("app.api.vision.dispatch_python_task", return_value=MagicMock(id="backfill-job-1")) as dispatch,
        ):
            mock_task.name = "app.tasks.vision_tasks.analyze_image_task"
            response = client.post("/api/v1/vision/analyze", json=payload, headers=auth_headers)
        assert response.status_code == 200
        assert dispatch.call_args.kwargs["kwargs"] == {"system_cost": True}

    def test_check_flag_returns_false_when_database_lookup_fails(self):
        """_check_multimodal_memory_flag fails closed when PostgreSQL is unavailable."""
        import asyncio
        from app.api.vision import _check_multimodal_memory_flag

        db = AsyncMock()
        db.execute.side_effect = Exception("database unavailable")
        result = asyncio.run(_check_multimodal_memory_flag("tenant-x", db))
        assert result is False

    def test_check_flag_true_when_tenant_database_override_is_true(self):
        """Tenant-specific PostgreSQL flag enables vision analysis."""
        import asyncio
        from app.api.vision import _check_multimodal_memory_flag

        db = AsyncMock()
        row = MagicMock()
        row.scalar_one_or_none.return_value = True
        db.execute.return_value = row
        result = asyncio.run(_check_multimodal_memory_flag("my-tenant", db))
        assert result is True

    def test_check_flag_false_when_database_has_no_override(self, monkeypatch):
        """Missing tenant/global rows and environment override remain disabled."""
        import asyncio
        from app.api.vision import _check_multimodal_memory_flag

        monkeypatch.delenv("MULTIMODALMEMORY", raising=False)
        db = AsyncMock()
        row = MagicMock()
        row.scalar_one_or_none.return_value = None
        db.execute.return_value = row
        result = asyncio.run(_check_multimodal_memory_flag("no-flag-tenant", db))
        assert result is False
