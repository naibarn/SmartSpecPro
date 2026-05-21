"""Tests for Cloud Tasks handler endpoints under /tasks/*."""
import pytest
from unittest.mock import AsyncMock, patch
from fastapi import FastAPI
from fastapi.responses import JSONResponse
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
class TestProcessVideoHandler:
    """Tests for POST /tasks/process-video."""

    @pytest.mark.asyncio
    async def test_delegates_to_media_generation_process_video_task(self):
        """Handler delegates to media_generation.process_video_task and returns response."""
        app = create_test_app()
        transport = ASGITransport(app=app)

        with (
            patch(
                "app.api.v1.task_handlers.ensure_media_tasks_cloud_task_id_column",
                new_callable=AsyncMock,
            ),
            patch(
                "app.api.v1.task_handlers.record_cloud_task_event",
                new_callable=AsyncMock,
            ) as mock_record_event,
            patch(
                "app.api.v1.media_generation.process_video_task",
                new_callable=AsyncMock,
            ) as mock_process_video_task,
        ):
            mock_process_video_task.return_value = JSONResponse(
                status_code=200,
                content={"success": True, "render_hash": "hash-123"},
            )

            async with AsyncClient(transport=transport, base_url="http://test") as client:
                response = await client.post(
                    "/tasks/process-video",
                    json={
                        "queue_name": "video-jobs-short",
                        "render_spec": {"jobId": "job-123", "renderHash": "hash-123"},
                    },
                )

        assert response.status_code == 200
        mock_process_video_task.assert_awaited_once()
        mock_record_event.assert_awaited_once()


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
class TestRecoverStuckHandler:
    """Tests for POST /tasks/recover-stuck."""

    @pytest.mark.asyncio
    async def test_runs_processing_and_pending_recovery(self):
        app = create_test_app()
        transport = ASGITransport(app=app)

        with (
            patch(
                "app.api.v1.task_handlers.ensure_media_tasks_cloud_task_id_column",
                new_callable=AsyncMock,
            ),
            patch(
                "app.tasks.media_tasks._recover_stuck_tasks_async",
                new_callable=AsyncMock,
                return_value={"status": "success", "recovered_count": 1, "failed_count": 0},
            ) as processing_recovery,
            patch(
                "app.tasks.media_tasks._recover_stuck_pending_tasks_async",
                new_callable=AsyncMock,
                return_value={"status": "success", "recovered": 2},
            ) as pending_recovery,
        ):
            async with AsyncClient(transport=transport, base_url="http://test") as client:
                response = await client.post("/tasks/recover-stuck", json={})

        assert response.status_code == 200
        assert response.json()["pending_recovered"] == 2
        processing_recovery.assert_awaited_once()
        pending_recovery.assert_awaited_once()


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
