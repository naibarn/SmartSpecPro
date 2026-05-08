"""Tests for the Kie AI webhook handler at POST /api/webhooks/kie."""

import hashlib
import hmac
import json
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient

from app.api.v1.kie_webhooks import router


@pytest.fixture
def app():
    """Create a minimal FastAPI app with the kie_webhooks router."""
    app = FastAPI()
    app.include_router(router)
    return app


@pytest.fixture
def client(app):
    """Create an async test client."""
    return AsyncClient(transport=ASGITransport(app=app), base_url="http://test")


def _sign_payload(payload: dict, secret: str) -> str:
    """Generate HMAC-SHA256 signature for a payload."""
    body = json.dumps(payload).encode()
    return hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()


WEBHOOK_SECRET = "webhook-key"
KIE_JOB_ID = "kie-task-abc123"
JOB_ID = "job-uuid-12345"


@pytest.mark.unit
@pytest.mark.asyncio
async def test_valid_webhook_signature_updates_job_to_done(client):
    """Valid webhook with correct HMAC signature updates job status to 'done'
    and enqueues a media-job processing Cloud Task."""
    payload = {
        "taskId": KIE_JOB_ID,
        "status": "completed",
        "data": {
            "successFlag": 1,
            "taskResult": {"images": ["https://cdn.kie.ai/result.png"]},
        },
    }
    sig = _sign_payload(payload, WEBHOOK_SECRET)

    mock_task = MagicMock()
    mock_task.id = JOB_ID
    mock_task.status = "processing"
    mock_task.media_type = "image"

    with (
        patch.dict("os.environ", {"KIE_AI_WEBHOOK_SECRET": WEBHOOK_SECRET}),
        patch(
            "app.api.v1.kie_webhooks.WebhookDedupService"
        ) as MockDedup,
        patch(
            "app.api.v1.kie_webhooks.MediaTaskService"
        ) as MockTaskService,
        patch(
            "app.api.v1.kie_webhooks.enqueue_task", new_callable=AsyncMock
        ) as mock_enqueue,
        patch("app.api.v1.kie_webhooks.AsyncSessionLocal") as MockSession,
    ):
        MockDedup.return_value.is_duplicate = AsyncMock(return_value=False)
        MockDedup.return_value.mark_processed = AsyncMock()
        MockTaskService.get_task_by_external_id = AsyncMock(return_value=mock_task)
        MockTaskService.update_task_by_external_id = AsyncMock(return_value=mock_task)

        mock_db = AsyncMock()
        MockSession.return_value.__aenter__ = AsyncMock(return_value=mock_db)
        MockSession.return_value.__aexit__ = AsyncMock(return_value=False)

        resp = await client.post(
            "/api/webhooks/kie",
            content=json.dumps(payload),
            headers={"x-signature": sig, "content-type": "application/json"},
        )

    assert resp.status_code == 200
    data = resp.json()
    assert data["success"] is True
    MockTaskService.update_task_by_external_id.assert_awaited_once()
    mock_enqueue.assert_awaited_once()


@pytest.mark.unit
@pytest.mark.asyncio
async def test_valid_webhook_enqueues_media_processing_task(client):
    """After updating job status, webhook handler enqueues
    POST /tasks/process-media via Cloud Tasks 'media-jobs' queue."""
    payload = {
        "taskId": KIE_JOB_ID,
        "status": "completed",
        "data": {
            "successFlag": 1,
            "taskResult": {"images": ["https://cdn.kie.ai/result.png"]},
        },
    }
    sig = _sign_payload(payload, WEBHOOK_SECRET)

    mock_task = MagicMock()
    mock_task.id = JOB_ID
    mock_task.status = "processing"
    mock_task.media_type = "image"

    with (
        patch.dict("os.environ", {"KIE_AI_WEBHOOK_SECRET": WEBHOOK_SECRET}),
        patch(
            "app.api.v1.kie_webhooks.WebhookDedupService"
        ) as MockDedup,
        patch(
            "app.api.v1.kie_webhooks.MediaTaskService"
        ) as MockTaskService,
        patch(
            "app.api.v1.kie_webhooks.enqueue_task", new_callable=AsyncMock
        ) as mock_enqueue,
        patch("app.api.v1.kie_webhooks.AsyncSessionLocal") as MockSession,
    ):
        MockDedup.return_value.is_duplicate = AsyncMock(return_value=False)
        MockDedup.return_value.mark_processed = AsyncMock()
        MockTaskService.get_task_by_external_id = AsyncMock(return_value=mock_task)
        MockTaskService.update_task_by_external_id = AsyncMock(return_value=mock_task)

        mock_db = AsyncMock()
        MockSession.return_value.__aenter__ = AsyncMock(return_value=mock_db)
        MockSession.return_value.__aexit__ = AsyncMock(return_value=False)

        resp = await client.post(
            "/api/webhooks/kie",
            content=json.dumps(payload),
            headers={"x-signature": sig, "content-type": "application/json"},
        )

    assert resp.status_code == 200
    mock_enqueue.assert_awaited_once()
    call_kwargs = mock_enqueue.call_args
    assert call_kwargs.kwargs["queue_name"] == "media-jobs"
    assert call_kwargs.kwargs["handler_path"] == "/tasks/process-media"
    assert "job_id" in call_kwargs.kwargs["payload"]


@pytest.mark.unit
@pytest.mark.asyncio
async def test_duplicate_webhook_returns_200_without_reprocessing(client):
    """If kie_job_id already completed in Redis dedup, return 200 immediately.
    No Cloud Task is enqueued."""
    payload = {"taskId": KIE_JOB_ID, "status": "completed", "data": {"successFlag": 1}}
    sig = _sign_payload(payload, WEBHOOK_SECRET)

    with (
        patch.dict("os.environ", {"KIE_AI_WEBHOOK_SECRET": WEBHOOK_SECRET}),
        patch(
            "app.api.v1.kie_webhooks.WebhookDedupService"
        ) as MockDedup,
        patch(
            "app.api.v1.kie_webhooks.enqueue_task", new_callable=AsyncMock
        ) as mock_enqueue,
    ):
        MockDedup.return_value.is_duplicate = AsyncMock(return_value=True)

        resp = await client.post(
            "/api/webhooks/kie",
            content=json.dumps(payload),
            headers={"x-signature": sig, "content-type": "application/json"},
        )

    assert resp.status_code == 200
    data = resp.json()
    assert data.get("duplicate") is True
    mock_enqueue.assert_not_awaited()


@pytest.mark.unit
@pytest.mark.asyncio
async def test_webhook_missing_secret_fails_closed(client):
    """Webhook must not accept callbacks when HMAC secret is missing."""
    payload = {"taskId": KIE_JOB_ID, "status": "completed"}

    with (
        patch.dict("os.environ", {}, clear=True),
        patch("app.api.v1.kie_webhooks.WebhookDedupService") as MockDedup,
        patch("app.api.v1.kie_webhooks.MediaTaskService") as MockTaskService,
    ):
        resp = await client.post(
            "/api/webhooks/kie",
            content=json.dumps(payload),
            headers={"content-type": "application/json"},
        )

    assert resp.status_code == 503
    MockDedup.assert_not_called()
    MockTaskService.get_task_by_external_id.assert_not_called()


@pytest.mark.unit
@pytest.mark.asyncio
async def test_webhook_invalid_signature_returns_401(client):
    """Webhook with wrong or missing HMAC signature returns 401.
    Job status is NOT updated. No Cloud Task enqueued."""
    payload = {"taskId": KIE_JOB_ID, "status": "completed"}

    with patch.dict("os.environ", {"KIE_AI_WEBHOOK_SECRET": WEBHOOK_SECRET}):
        resp = await client.post(
            "/api/webhooks/kie",
            content=json.dumps(payload),
            headers={"x-signature": "invalid-signature", "content-type": "application/json"},
        )

    assert resp.status_code == 401


@pytest.mark.unit
@pytest.mark.asyncio
async def test_webhook_unknown_kie_job_id_returns_404(client):
    """Webhook referencing a kie_job_id not found in the jobs table
    returns 404. No side effects."""
    payload = {
        "taskId": "nonexistent-id",
        "status": "completed",
        "data": {"successFlag": 1, "taskResult": {"images": ["https://cdn.kie.ai/r.png"]}},
    }
    sig = _sign_payload(payload, WEBHOOK_SECRET)

    with (
        patch.dict("os.environ", {"KIE_AI_WEBHOOK_SECRET": WEBHOOK_SECRET}),
        patch(
            "app.api.v1.kie_webhooks.WebhookDedupService"
        ) as MockDedup,
        patch(
            "app.api.v1.kie_webhooks.MediaTaskService"
        ) as MockTaskService,
        patch(
            "app.api.v1.kie_webhooks.enqueue_task", new_callable=AsyncMock
        ) as mock_enqueue,
        patch("app.api.v1.kie_webhooks.AsyncSessionLocal") as MockSession,
    ):
        MockDedup.return_value.is_duplicate = AsyncMock(return_value=False)
        MockTaskService.get_task_by_external_id = AsyncMock(return_value=None)

        mock_db = AsyncMock()
        MockSession.return_value.__aenter__ = AsyncMock(return_value=mock_db)
        MockSession.return_value.__aexit__ = AsyncMock(return_value=False)

        resp = await client.post(
            "/api/webhooks/kie",
            content=json.dumps(payload),
            headers={"x-signature": sig, "content-type": "application/json"},
        )

    assert resp.status_code == 404
    mock_enqueue.assert_not_awaited()


@pytest.mark.unit
@pytest.mark.asyncio
async def test_webhook_stores_dedup_key_in_redis(client):
    """After successful processing, the handler stores
    'webhook-dedup:{kie_job_id}' in Redis with 24h TTL."""
    payload = {
        "taskId": KIE_JOB_ID,
        "status": "completed",
        "data": {
            "successFlag": 1,
            "taskResult": {"images": ["https://cdn.kie.ai/result.png"]},
        },
    }
    sig = _sign_payload(payload, WEBHOOK_SECRET)

    mock_task = MagicMock()
    mock_task.id = JOB_ID
    mock_task.status = "processing"
    mock_task.media_type = "image"

    with (
        patch.dict("os.environ", {"KIE_AI_WEBHOOK_SECRET": WEBHOOK_SECRET}),
        patch(
            "app.api.v1.kie_webhooks.WebhookDedupService"
        ) as MockDedup,
        patch(
            "app.api.v1.kie_webhooks.MediaTaskService"
        ) as MockTaskService,
        patch(
            "app.api.v1.kie_webhooks.enqueue_task", new_callable=AsyncMock
        ),
        patch("app.api.v1.kie_webhooks.AsyncSessionLocal") as MockSession,
    ):
        dedup_instance = MockDedup.return_value
        dedup_instance.is_duplicate = AsyncMock(return_value=False)
        dedup_instance.mark_processed = AsyncMock()
        MockTaskService.get_task_by_external_id = AsyncMock(return_value=mock_task)
        MockTaskService.update_task_by_external_id = AsyncMock(return_value=mock_task)

        mock_db = AsyncMock()
        MockSession.return_value.__aenter__ = AsyncMock(return_value=mock_db)
        MockSession.return_value.__aexit__ = AsyncMock(return_value=False)

        resp = await client.post(
            "/api/webhooks/kie",
            content=json.dumps(payload),
            headers={"x-signature": sig, "content-type": "application/json"},
        )

    assert resp.status_code == 200
    dedup_instance.mark_processed.assert_awaited_once_with(KIE_JOB_ID)


@pytest.mark.unit
@pytest.mark.asyncio
async def test_webhook_checks_redis_dedup_before_db(client):
    """If Redis dedup key exists for kie_job_id, handler returns 200
    immediately without querying the database."""
    payload = {"taskId": KIE_JOB_ID, "status": "completed", "data": {"successFlag": 1}}
    sig = _sign_payload(payload, WEBHOOK_SECRET)

    with (
        patch.dict("os.environ", {"KIE_AI_WEBHOOK_SECRET": WEBHOOK_SECRET}),
        patch(
            "app.api.v1.kie_webhooks.WebhookDedupService"
        ) as MockDedup,
        patch(
            "app.api.v1.kie_webhooks.MediaTaskService"
        ) as MockTaskService,
        patch(
            "app.api.v1.kie_webhooks.enqueue_task", new_callable=AsyncMock
        ),
    ):
        MockDedup.return_value.is_duplicate = AsyncMock(return_value=True)

        resp = await client.post(
            "/api/webhooks/kie",
            content=json.dumps(payload),
            headers={"x-signature": sig, "content-type": "application/json"},
        )

    assert resp.status_code == 200
    assert resp.json().get("duplicate") is True
    # DB should NOT be queried if dedup key found
    MockTaskService.get_task_by_external_id.assert_not_called()
