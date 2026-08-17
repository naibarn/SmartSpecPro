"""Tests for the Kie AI polling handler at POST /tasks/poll-job."""

import json
import time

import pytest
from unittest.mock import AsyncMock, MagicMock, patch

from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient

from app.api.v1.task_handlers import router


@pytest.fixture
def app():
    """Create a minimal FastAPI app with the task_handlers router."""
    app = FastAPI()
    app.include_router(router)
    return app


@pytest.fixture
def client(app):
    """Create an async test client."""
    return AsyncClient(transport=ASGITransport(app=app), base_url="http://test")


KIE_JOB_ID = "kie-task-abc123"
JOB_ID = "job-uuid-12345"


@pytest.mark.unit
@pytest.mark.asyncio
async def test_poll_completed_job_triggers_media_processing(client):
    """Poll for a completed Kie AI job enqueues process-media
    Cloud Task and updates job status to 'done'."""
    payload = {
        "job_id": JOB_ID,
        "kie_job_id": KIE_JOB_ID,
        "attempt": 1,
        "submitted_at": int(time.time() * 1000),
    }

    mock_task = MagicMock()
    mock_task.id = JOB_ID
    mock_task.task_id = KIE_JOB_ID
    mock_task.status = "processing"
    mock_task.model = "test-model"
    mock_task.media_type = "image"
    mock_task.parameters = {}

    kie_response = {
        "data": {
            "successFlag": 1,
            "taskResult": {"images": ["https://cdn.kie.ai/result.png"]},
        }
    }

    with (
        patch(
            "app.api.v1.task_handlers.MediaTaskService"
        ) as MockTaskService,
        patch(
            "app.api.v1.task_handlers.enqueue_task", new_callable=AsyncMock
        ) as mock_enqueue,
        patch(
            "app.services.media_provider_service.initialize_kie_ai_client", new_callable=AsyncMock
        ) as mock_kie_init,
        patch("app.api.v1.task_handlers.AsyncSessionLocal") as MockSession,
    ):
        mock_kie_client = AsyncMock()
        mock_kie_client.get_task_status = AsyncMock(return_value=kie_response)
        mock_kie_init.return_value = mock_kie_client

        MockTaskService.get_task = AsyncMock(return_value=mock_task)
        MockTaskService.update_task_status = AsyncMock(return_value=mock_task)

        mock_db = AsyncMock()
        MockSession.return_value.__aenter__ = AsyncMock(return_value=mock_db)
        MockSession.return_value.__aexit__ = AsyncMock(return_value=False)

        resp = await client.post("/tasks/poll-job", json=payload)

    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "completed"

    # Should enqueue media processing
    mock_enqueue.assert_awaited_once()
    call_kwargs = mock_enqueue.call_args.kwargs
    assert call_kwargs["queue_name"] == "media-jobs"
    assert call_kwargs["handler_path"] == "/tasks/process-media"

    # Should update task status
    MockTaskService.update_task_status.assert_awaited_once()


@pytest.mark.unit
@pytest.mark.asyncio
async def test_poll_in_progress_re_enqueues_with_increased_delay(client):
    """Poll for an in-progress job re-enqueues itself to the
    polling-tasks queue with doubled delay (exponential backoff).
    Delay sequence: 2min -> 4min -> 8min -> ... capped at 30min."""
    payload = {
        "job_id": JOB_ID,
        "kie_job_id": KIE_JOB_ID,
        "attempt": 1,
        "submitted_at": int(time.time() * 1000),
    }

    mock_task = MagicMock()
    mock_task.id = JOB_ID
    mock_task.task_id = KIE_JOB_ID
    mock_task.status = "processing"
    mock_task.model = "test-model"
    mock_task.media_type = "image"
    mock_task.parameters = {}

    kie_response = {"data": {"state": "processing"}}

    with (
        patch(
            "app.api.v1.task_handlers.MediaTaskService"
        ) as MockTaskService,
        patch(
            "app.api.v1.task_handlers.enqueue_task", new_callable=AsyncMock
        ) as mock_enqueue,
        patch(
            "app.services.media_provider_service.initialize_kie_ai_client", new_callable=AsyncMock
        ) as mock_kie_init,
        patch("app.api.v1.task_handlers.AsyncSessionLocal") as MockSession,
    ):
        mock_kie_client = AsyncMock()
        mock_kie_client.get_task_status = AsyncMock(return_value=kie_response)
        mock_kie_init.return_value = mock_kie_client

        MockTaskService.get_task = AsyncMock(return_value=mock_task)

        mock_db = AsyncMock()
        MockSession.return_value.__aenter__ = AsyncMock(return_value=mock_db)
        MockSession.return_value.__aexit__ = AsyncMock(return_value=False)

        resp = await client.post("/tasks/poll-job", json=payload)

    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "polling"

    mock_enqueue.assert_awaited_once()
    call_kwargs = mock_enqueue.call_args.kwargs
    assert call_kwargs["queue_name"] == "polling-tasks"
    assert call_kwargs["handler_path"] == "/tasks/poll-job"
    # attempt 1 → delay = min(120 * 2^1, 1800) = 240s
    assert call_kwargs["delay_seconds"] == 240
    assert call_kwargs["payload"]["attempt"] == 2


@pytest.mark.unit
@pytest.mark.asyncio
async def test_poll_timed_out_marks_job_timeout(client):
    """If the job has been polling for >24 hours, mark as 'timeout',
    and do NOT re-enqueue."""
    submitted_at = int((time.time() - 25 * 3600) * 1000)  # 25 hours ago
    payload = {
        "job_id": JOB_ID,
        "kie_job_id": KIE_JOB_ID,
        "attempt": 10,
        "submitted_at": submitted_at,
    }

    mock_task = MagicMock()
    mock_task.id = JOB_ID
    mock_task.task_id = KIE_JOB_ID
    mock_task.status = "processing"
    mock_task.model = "test-model"
    mock_task.media_type = "image"
    mock_task.parameters = {}

    kie_response = {"data": {"state": "processing"}}

    with (
        patch(
            "app.api.v1.task_handlers.MediaTaskService"
        ) as MockTaskService,
        patch(
            "app.api.v1.task_handlers.enqueue_task", new_callable=AsyncMock
        ) as mock_enqueue,
        patch(
            "app.services.media_provider_service.initialize_kie_ai_client", new_callable=AsyncMock
        ) as mock_kie_init,
        patch("app.api.v1.task_handlers.AsyncSessionLocal") as MockSession,
    ):
        mock_kie_client = AsyncMock()
        mock_kie_client.get_task_status = AsyncMock(return_value=kie_response)
        mock_kie_init.return_value = mock_kie_client

        MockTaskService.get_task = AsyncMock(return_value=mock_task)
        MockTaskService.update_task_status = AsyncMock(return_value=mock_task)

        mock_db = AsyncMock()
        MockSession.return_value.__aenter__ = AsyncMock(return_value=mock_db)
        MockSession.return_value.__aexit__ = AsyncMock(return_value=False)

        resp = await client.post("/tasks/poll-job", json=payload)

    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "timeout"

    # Should NOT re-enqueue
    mock_enqueue.assert_not_awaited()

    # Should mark as failed/timeout
    MockTaskService.update_task_status.assert_awaited_once()


@pytest.mark.unit
@pytest.mark.asyncio
async def test_poll_already_completed_returns_200(client):
    """If the job was already completed (webhook arrived first),
    return 200 without calling Kie AI status API or enqueuing anything."""
    payload = {
        "job_id": JOB_ID,
        "kie_job_id": KIE_JOB_ID,
        "attempt": 1,
        "submitted_at": int(time.time() * 1000),
    }

    mock_task = MagicMock()
    mock_task.id = JOB_ID
    mock_task.task_id = KIE_JOB_ID
    mock_task.status = "completed"  # Already done

    with (
        patch(
            "app.api.v1.task_handlers.MediaTaskService"
        ) as MockTaskService,
        patch(
            "app.api.v1.task_handlers.enqueue_task", new_callable=AsyncMock
        ) as mock_enqueue,
        patch(
            "app.services.media_provider_service.initialize_kie_ai_client", new_callable=AsyncMock
        ) as mock_kie_init,
        patch("app.api.v1.task_handlers.AsyncSessionLocal") as MockSession,
    ):
        MockTaskService.get_task = AsyncMock(return_value=mock_task)

        mock_db = AsyncMock()
        MockSession.return_value.__aenter__ = AsyncMock(return_value=mock_db)
        MockSession.return_value.__aexit__ = AsyncMock(return_value=False)

        resp = await client.post("/tasks/poll-job", json=payload)

    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "already_completed"

    # Should NOT call Kie API or enqueue
    mock_kie_init.assert_not_awaited()
    mock_enqueue.assert_not_awaited()


@pytest.mark.unit
@pytest.mark.asyncio
async def test_poll_kie_api_error_returns_5xx_for_retry(client):
    """If Kie AI status API returns a transient error (network, 5xx),
    the handler returns 5xx so Cloud Tasks retries automatically."""
    payload = {
        "job_id": JOB_ID,
        "kie_job_id": KIE_JOB_ID,
        "attempt": 1,
        "submitted_at": int(time.time() * 1000),
    }

    mock_task = MagicMock()
    mock_task.id = JOB_ID
    mock_task.task_id = KIE_JOB_ID
    mock_task.status = "processing"
    mock_task.model = "test-model"
    mock_task.parameters = {}

    with (
        patch(
            "app.api.v1.task_handlers.MediaTaskService"
        ) as MockTaskService,
        patch(
            "app.api.v1.task_handlers.enqueue_task", new_callable=AsyncMock
        ),
        patch(
            "app.services.media_provider_service.initialize_kie_ai_client", new_callable=AsyncMock
        ) as mock_kie_init,
        patch("app.api.v1.task_handlers.AsyncSessionLocal") as MockSession,
    ):
        mock_kie_client = AsyncMock()
        mock_kie_client.get_task_status = AsyncMock(
            side_effect=Exception("Connection timeout")
        )
        mock_kie_init.return_value = mock_kie_client

        MockTaskService.get_task = AsyncMock(return_value=mock_task)

        mock_db = AsyncMock()
        MockSession.return_value.__aenter__ = AsyncMock(return_value=mock_db)
        MockSession.return_value.__aexit__ = AsyncMock(return_value=False)

        resp = await client.post("/tasks/poll-job", json=payload)

    assert resp.status_code == 500


@pytest.mark.unit
@pytest.mark.asyncio
async def test_poll_kie_permanent_error_marks_failed(client):
    """If Kie AI status API returns a permanent error (task cancelled,
    invalid task ID), mark job as failed and return 200."""
    payload = {
        "job_id": JOB_ID,
        "kie_job_id": KIE_JOB_ID,
        "attempt": 1,
        "submitted_at": int(time.time() * 1000),
    }

    mock_task = MagicMock()
    mock_task.id = JOB_ID
    mock_task.task_id = KIE_JOB_ID
    mock_task.status = "processing"
    mock_task.model = "test-model"
    mock_task.media_type = "image"
    mock_task.parameters = {}

    kie_response = {"data": {"state": "cancelled", "errorMessage": "Task was cancelled"}}

    with (
        patch(
            "app.api.v1.task_handlers.MediaTaskService"
        ) as MockTaskService,
        patch(
            "app.api.v1.task_handlers.enqueue_task", new_callable=AsyncMock
        ) as mock_enqueue,
        patch(
            "app.services.media_provider_service.initialize_kie_ai_client", new_callable=AsyncMock
        ) as mock_kie_init,
        patch("app.api.v1.task_handlers.AsyncSessionLocal") as MockSession,
    ):
        mock_kie_client = AsyncMock()
        mock_kie_client.get_task_status = AsyncMock(return_value=kie_response)
        mock_kie_init.return_value = mock_kie_client

        MockTaskService.get_task = AsyncMock(return_value=mock_task)
        MockTaskService.update_task_status = AsyncMock(return_value=mock_task)

        mock_db = AsyncMock()
        MockSession.return_value.__aenter__ = AsyncMock(return_value=mock_db)
        MockSession.return_value.__aexit__ = AsyncMock(return_value=False)

        resp = await client.post("/tasks/poll-job", json=payload)

    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "failed"

    MockTaskService.update_task_status.assert_awaited_once()
    mock_enqueue.assert_not_awaited()
