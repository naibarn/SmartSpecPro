"""Tests for Cloud Tasks handler endpoints under /tasks/*."""
import pytest
from unittest.mock import patch
from fastapi import FastAPI
from httpx import AsyncClient, ASGITransport

from app.api.v1.task_handlers import router


def create_test_app() -> FastAPI:
    """Create a test app with task handlers."""
    app = FastAPI()
    app.include_router(router)
    return app


@pytest.mark.unit
class TestPollJobHandler:
    """Tests for POST /tasks/poll-job."""

    @pytest.mark.asyncio
    async def test_returns_200_for_valid_request(self):
        """Handler accepts valid request and returns 200."""
        app = create_test_app()
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.post(
                "/tasks/poll-job",
                json={"job_id": "test-123", "kie_job_id": "kie-456", "attempt": 0},
            )
            assert response.status_code == 200


@pytest.mark.unit
class TestProcessMediaHandler:
    """Tests for POST /tasks/process-media."""

    @pytest.mark.asyncio
    async def test_returns_200_for_valid_request(self):
        """Handler accepts valid request and returns 200."""
        app = create_test_app()
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.post(
                "/tasks/process-media",
                json={"job_id": "test-123", "kie_job_id": "kie-456"},
            )
            assert response.status_code == 200


@pytest.mark.unit
class TestCleanupExpiredHandler:
    """Tests for POST /tasks/cleanup-expired."""

    @pytest.mark.asyncio
    async def test_returns_200_with_deleted_count(self):
        """Handler returns 200 with deleted_count."""
        app = create_test_app()
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.post("/tasks/cleanup-expired", json={})
            assert response.status_code == 200
            data = response.json()
            assert "deleted_count" in data


@pytest.mark.unit
class TestAllTaskEndpoints:
    """Cross-cutting tests for all /tasks/* endpoints."""

    @pytest.mark.asyncio
    async def test_all_endpoints_accept_json_payload(self):
        """All endpoints accept JSON payloads."""
        app = create_test_app()
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            endpoints = [
                ("/tasks/poll-job", {"job_id": "j1", "kie_job_id": "k1", "attempt": 0}),
                ("/tasks/process-media", {"job_id": "j1", "kie_job_id": "k1"}),
                ("/tasks/cleanup-expired", {}),
                ("/tasks/retry-failed", {}),
                ("/tasks/recover-stuck", {}),
            ]

            for path, payload in endpoints:
                response = await client.post(path, json=payload)
                assert response.status_code == 200, f"{path} failed with {response.status_code}"
