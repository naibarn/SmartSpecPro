"""Tests for the media pipeline handler at POST /tasks/process-media."""

import json
from unittest.mock import AsyncMock, MagicMock, patch

import httpx
import pytest
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


JOB_ID = "job-uuid-12345"
KIE_JOB_ID = "kie-task-abc123"
RESULT_URL = "https://cdn.kie.ai/output/result.png"
USER_ID = 42


def _make_payload(**overrides):
    """Build a default process-media payload."""
    base = {
        "job_id": JOB_ID,
        "kie_job_id": KIE_JOB_ID,
        "result_url": RESULT_URL,
        "media_type": "image",
    }
    base.update(overrides)
    return base


def _mock_task(status="processing", result_data=None, user_id=USER_ID, media_type="image"):
    """Create a mock MediaTask row."""
    task = MagicMock()
    task.id = JOB_ID
    task.task_id = KIE_JOB_ID
    task.status = status
    task.result_data = result_data
    task.user_id = user_id
    task.media_type = media_type
    return task


@pytest.mark.unit
@pytest.mark.asyncio
async def test_process_media_downloads_from_kie_result_url(client):
    """POST /tasks/process-media fetches media bytes from the Kie AI result URL."""
    payload = _make_payload()
    mock_task = _mock_task()

    with (
        patch("app.api.v1.task_handlers.AsyncSessionLocal") as MockSession,
        patch("app.api.v1.task_handlers.MediaTaskService") as MockTaskService,
        patch("app.api.v1.task_handlers.download_media", new_callable=AsyncMock) as mock_download,
        patch("app.api.v1.task_handlers.generate_thumbnail", new_callable=AsyncMock) as mock_thumb,
        patch("app.api.v1.task_handlers.extract_metadata", new_callable=AsyncMock) as mock_meta,
        patch("app.api.v1.task_handlers.upload_to_r2", new_callable=AsyncMock) as mock_upload,
    ):
        mock_db = AsyncMock()
        MockSession.return_value.__aenter__ = AsyncMock(return_value=mock_db)
        MockSession.return_value.__aexit__ = AsyncMock(return_value=False)
        MockTaskService.get_task = AsyncMock(return_value=mock_task)
        MockTaskService.update_task_by_external_id = AsyncMock(return_value=mock_task)

        mock_download.return_value = ("/tmp/result.png", 1024, "image/png")
        mock_thumb.return_value = "/tmp/thumb.jpg"
        mock_meta.return_value = {"file_size_bytes": 1024, "width": 800, "height": 600, "mime_type": "image/png"}
        mock_upload.return_value = {
            "result_key": "images/generated/42/job-uuid-12345.png",
            "thumbnail_key": "images/thumbnails/job-uuid-12345.jpg",
            "result_url": "https://r2.example.com/images/generated/42/job-uuid-12345.png",
            "thumbnail_url": "https://r2.example.com/images/thumbnails/job-uuid-12345.jpg",
        }

        resp = await client.post(
            "/tasks/process-media",
            content=json.dumps(payload),
            headers={"content-type": "application/json"},
        )

    assert resp.status_code == 200
    mock_download.assert_awaited_once()


@pytest.mark.unit
@pytest.mark.asyncio
async def test_process_media_generates_image_thumbnail(client):
    """For image jobs, handler creates a thumbnail."""
    payload = _make_payload(media_type="image")
    mock_task = _mock_task(media_type="image")

    with (
        patch("app.api.v1.task_handlers.AsyncSessionLocal") as MockSession,
        patch("app.api.v1.task_handlers.MediaTaskService") as MockTaskService,
        patch("app.api.v1.task_handlers.download_media", new_callable=AsyncMock) as mock_download,
        patch("app.api.v1.task_handlers.generate_thumbnail", new_callable=AsyncMock) as mock_thumb,
        patch("app.api.v1.task_handlers.extract_metadata", new_callable=AsyncMock) as mock_meta,
        patch("app.api.v1.task_handlers.upload_to_r2", new_callable=AsyncMock) as mock_upload,
    ):
        mock_db = AsyncMock()
        MockSession.return_value.__aenter__ = AsyncMock(return_value=mock_db)
        MockSession.return_value.__aexit__ = AsyncMock(return_value=False)
        MockTaskService.get_task = AsyncMock(return_value=mock_task)
        MockTaskService.update_task_by_external_id = AsyncMock(return_value=mock_task)

        mock_download.return_value = ("/tmp/result.png", 1024, "image/png")
        mock_thumb.return_value = "/tmp/thumb.jpg"
        mock_meta.return_value = {"file_size_bytes": 1024, "width": 800, "height": 600}
        mock_upload.return_value = {
            "result_key": "k", "thumbnail_key": "t",
            "result_url": "https://r2/k", "thumbnail_url": "https://r2/t",
        }

        resp = await client.post(
            "/tasks/process-media",
            content=json.dumps(payload),
            headers={"content-type": "application/json"},
        )

    assert resp.status_code == 200
    mock_thumb.assert_awaited_once()
    call_args = mock_thumb.call_args
    assert call_args[0][1] == "image"  # media_type argument


@pytest.mark.unit
@pytest.mark.asyncio
async def test_process_media_uploads_to_r2(client):
    """Handler uploads both the full result and thumbnail to R2."""
    payload = _make_payload()
    mock_task = _mock_task()

    with (
        patch("app.api.v1.task_handlers.AsyncSessionLocal") as MockSession,
        patch("app.api.v1.task_handlers.MediaTaskService") as MockTaskService,
        patch("app.api.v1.task_handlers.download_media", new_callable=AsyncMock) as mock_download,
        patch("app.api.v1.task_handlers.generate_thumbnail", new_callable=AsyncMock) as mock_thumb,
        patch("app.api.v1.task_handlers.extract_metadata", new_callable=AsyncMock) as mock_meta,
        patch("app.api.v1.task_handlers.upload_to_r2", new_callable=AsyncMock) as mock_upload,
    ):
        mock_db = AsyncMock()
        MockSession.return_value.__aenter__ = AsyncMock(return_value=mock_db)
        MockSession.return_value.__aexit__ = AsyncMock(return_value=False)
        MockTaskService.get_task = AsyncMock(return_value=mock_task)
        MockTaskService.update_task_by_external_id = AsyncMock(return_value=mock_task)

        mock_download.return_value = ("/tmp/result.png", 1024, "image/png")
        mock_thumb.return_value = "/tmp/thumb.jpg"
        mock_meta.return_value = {"file_size_bytes": 1024, "width": 800, "height": 600}
        mock_upload.return_value = {
            "result_key": "images/generated/42/job-uuid-12345.png",
            "thumbnail_key": "images/thumbnails/job-uuid-12345.jpg",
            "result_url": "https://r2/result.png",
            "thumbnail_url": "https://r2/thumb.jpg",
        }

        resp = await client.post(
            "/tasks/process-media",
            content=json.dumps(payload),
            headers={"content-type": "application/json"},
        )

    assert resp.status_code == 200
    mock_upload.assert_awaited_once()
    call_kwargs = mock_upload.call_args
    assert call_kwargs[0][0] == str(USER_ID)  # user_id
    assert call_kwargs[0][1] == JOB_ID  # job_id


@pytest.mark.unit
@pytest.mark.asyncio
async def test_process_media_updates_db_with_results(client):
    """Handler writes R2 keys, presigned URLs, and metadata to media_tasks."""
    payload = _make_payload()
    mock_task = _mock_task()

    with (
        patch("app.api.v1.task_handlers.AsyncSessionLocal") as MockSession,
        patch("app.api.v1.task_handlers.MediaTaskService") as MockTaskService,
        patch("app.api.v1.task_handlers.download_media", new_callable=AsyncMock) as mock_download,
        patch("app.api.v1.task_handlers.generate_thumbnail", new_callable=AsyncMock),
        patch("app.api.v1.task_handlers.extract_metadata", new_callable=AsyncMock) as mock_meta,
        patch("app.api.v1.task_handlers.upload_to_r2", new_callable=AsyncMock) as mock_upload,
    ):
        mock_db = AsyncMock()
        MockSession.return_value.__aenter__ = AsyncMock(return_value=mock_db)
        MockSession.return_value.__aexit__ = AsyncMock(return_value=False)
        MockTaskService.get_task = AsyncMock(return_value=mock_task)
        MockTaskService.update_task_by_external_id = AsyncMock(return_value=mock_task)

        mock_download.return_value = ("/tmp/result.png", 1024, "image/png")
        mock_meta.return_value = {"file_size_bytes": 1024, "width": 800, "height": 600}
        mock_upload.return_value = {
            "result_key": "images/generated/42/job-uuid-12345.png",
            "thumbnail_key": "images/thumbnails/job-uuid-12345.jpg",
            "result_url": "https://r2/result.png",
            "thumbnail_url": "https://r2/thumb.jpg",
        }

        resp = await client.post(
            "/tasks/process-media",
            content=json.dumps(payload),
            headers={"content-type": "application/json"},
        )

    assert resp.status_code == 200
    # DB should be updated with result data
    MockTaskService.update_task_by_external_id.assert_awaited_once()
    call_kwargs = MockTaskService.update_task_by_external_id.call_args
    assert "result_url" in call_kwargs.kwargs or len(call_kwargs.args) > 3


@pytest.mark.unit
@pytest.mark.asyncio
async def test_process_media_idempotent_returns_200(client):
    """If job already has R2 keys in result_data, return 200 without re-processing."""
    payload = _make_payload()
    mock_task = _mock_task(
        status="completed",
        result_data={"r2_keys": {"result": "images/generated/42/job.png"}},
    )

    with (
        patch("app.api.v1.task_handlers.AsyncSessionLocal") as MockSession,
        patch("app.api.v1.task_handlers.MediaTaskService") as MockTaskService,
        patch("app.api.v1.task_handlers.download_media", new_callable=AsyncMock) as mock_download,
    ):
        mock_db = AsyncMock()
        MockSession.return_value.__aenter__ = AsyncMock(return_value=mock_db)
        MockSession.return_value.__aexit__ = AsyncMock(return_value=False)
        MockTaskService.get_task = AsyncMock(return_value=mock_task)

        resp = await client.post(
            "/tasks/process-media",
            content=json.dumps(payload),
            headers={"content-type": "application/json"},
        )

    assert resp.status_code == 200
    data = resp.json()
    assert data.get("already_processed") is True
    mock_download.assert_not_called()


@pytest.mark.unit
@pytest.mark.asyncio
async def test_process_media_5xx_on_transient_failure(client):
    """Network timeouts return 5xx so Cloud Tasks retries."""
    payload = _make_payload()
    mock_task = _mock_task()

    with (
        patch("app.api.v1.task_handlers.AsyncSessionLocal") as MockSession,
        patch("app.api.v1.task_handlers.MediaTaskService") as MockTaskService,
        patch("app.api.v1.task_handlers.download_media", new_callable=AsyncMock) as mock_download,
        patch("app.api.v1.task_handlers._check_dead_letter", new_callable=AsyncMock) as mock_dlq,
    ):
        mock_db = AsyncMock()
        MockSession.return_value.__aenter__ = AsyncMock(return_value=mock_db)
        MockSession.return_value.__aexit__ = AsyncMock(return_value=False)
        MockTaskService.get_task = AsyncMock(return_value=mock_task)
        mock_download.side_effect = httpx.TimeoutException("Connection timed out")
        mock_dlq.return_value = False

        resp = await client.post(
            "/tasks/process-media",
            content=json.dumps(payload),
            headers={"content-type": "application/json"},
        )

    assert resp.status_code == 500


@pytest.mark.unit
@pytest.mark.asyncio
async def test_process_media_200_on_permanent_error(client):
    """When download returns 404 (permanent error), update job as failed and return 200."""
    payload = _make_payload()
    mock_task = _mock_task()

    mock_response = MagicMock()
    mock_response.status_code = 404

    with (
        patch("app.api.v1.task_handlers.AsyncSessionLocal") as MockSession,
        patch("app.api.v1.task_handlers.MediaTaskService") as MockTaskService,
        patch("app.api.v1.task_handlers.download_media", new_callable=AsyncMock) as mock_download,
    ):
        mock_db = AsyncMock()
        MockSession.return_value.__aenter__ = AsyncMock(return_value=mock_db)
        MockSession.return_value.__aexit__ = AsyncMock(return_value=False)
        MockTaskService.get_task = AsyncMock(return_value=mock_task)
        MockTaskService.update_task_by_external_id = AsyncMock()

        mock_download.side_effect = httpx.HTTPStatusError(
            "Not Found",
            request=MagicMock(),
            response=mock_response,
        )

        resp = await client.post(
            "/tasks/process-media",
            content=json.dumps(payload),
            headers={"content-type": "application/json"},
        )

    assert resp.status_code == 200
    data = resp.json()
    assert data.get("status") == "failed"
    MockTaskService.update_task_by_external_id.assert_awaited_once()


@pytest.mark.unit
@pytest.mark.asyncio
async def test_process_media_unknown_job_returns_200(client):
    """If job_id not found in DB, return 200 (don't retry)."""
    payload = _make_payload()

    with (
        patch("app.api.v1.task_handlers.AsyncSessionLocal") as MockSession,
        patch("app.api.v1.task_handlers.MediaTaskService") as MockTaskService,
    ):
        mock_db = AsyncMock()
        MockSession.return_value.__aenter__ = AsyncMock(return_value=mock_db)
        MockSession.return_value.__aexit__ = AsyncMock(return_value=False)
        MockTaskService.get_task = AsyncMock(return_value=None)

        resp = await client.post(
            "/tasks/process-media",
            content=json.dumps(payload),
            headers={"content-type": "application/json"},
        )

    assert resp.status_code == 200
    data = resp.json()
    assert data.get("status") == "not_found"


@pytest.mark.unit
@pytest.mark.asyncio
async def test_process_media_dead_letter_on_final_retry(client):
    """On final retry attempt, mark job as failed and return 200."""
    payload = _make_payload()
    mock_task = _mock_task()

    with (
        patch("app.api.v1.task_handlers.AsyncSessionLocal") as MockSession,
        patch("app.api.v1.task_handlers.MediaTaskService") as MockTaskService,
        patch("app.api.v1.task_handlers.download_media", new_callable=AsyncMock) as mock_download,
        patch("app.api.v1.task_handlers._check_dead_letter", new_callable=AsyncMock) as mock_dlq,
    ):
        mock_db = AsyncMock()
        MockSession.return_value.__aenter__ = AsyncMock(return_value=mock_db)
        MockSession.return_value.__aexit__ = AsyncMock(return_value=False)
        MockTaskService.get_task = AsyncMock(return_value=mock_task)
        MockTaskService.update_task_by_external_id = AsyncMock()
        mock_download.side_effect = httpx.TimeoutException("Connection timed out")
        mock_dlq.return_value = True  # Final retry

        resp = await client.post(
            "/tasks/process-media",
            content=json.dumps(payload),
            headers={"content-type": "application/json"},
        )

    assert resp.status_code == 200
    data = resp.json()
    assert data.get("status") == "dead_letter"
    MockTaskService.update_task_by_external_id.assert_awaited_once()
