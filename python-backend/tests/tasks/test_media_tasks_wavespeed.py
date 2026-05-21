from __future__ import annotations

from datetime import datetime, timedelta, timezone
from decimal import Decimal
from unittest.mock import AsyncMock, MagicMock, patch

import httpx
import pytest

from app.llm_proxy.gateway_unified import LLMGateway as _RealGateway
from app.llm_proxy.providers.wavespeed_media_provider import WaveSpeedPollResult
from app.models.media_task import TaskStatus
from app.tasks.media_tasks import (
    _generate_video_async,
    _poll_wavespeed_video_task_async,
    _recover_stuck_tasks_async,
    _make_json_safe,
)


def _make_async_session(*execute_results):
    session = AsyncMock()
    session.__aenter__ = AsyncMock(return_value=session)
    session.__aexit__ = AsyncMock(return_value=False)
    session.commit = AsyncMock()
    session.execute = AsyncMock(side_effect=execute_results)
    return session


def _scalar_result(value):
    result = MagicMock()
    result.scalar_one_or_none.return_value = value
    return result


def _make_media_task(task_id: str = "task-1") -> MagicMock:
    task = MagicMock()
    task.id = task_id
    task.task_id = None
    task.model = "wavespeed-ai/cinematic-video-generator"
    task.status = TaskStatus.PROCESSING
    task.started_at = datetime.now(timezone.utc) - timedelta(minutes=1)
    task.created_at = datetime.now(timezone.utc) - timedelta(minutes=1)
    task.result_url = None
    task.result_data = {}
    task.error_message = None
    task.completed_at = None
    task.parameters = {"duration": 10}
    task.credits_used = None
    task.credits_balance = None
    return task


def _make_user(user_id: str = "user-1") -> MagicMock:
    user = MagicMock()
    user.id = user_id
    return user


class _FakeGateway:
    _get_api_config_string = staticmethod(_RealGateway._get_api_config_string)

    def __init__(self, _db, response):
        self._response = response

    async def generate_video(self, _request, _user, wait_for_completion=False):
        assert wait_for_completion is False
        return self._response


@pytest.mark.asyncio
async def test_generate_video_async_persists_sanitized_wavespeed_submission_and_schedules_poll():
    task = _make_media_task()
    user = _make_user()
    response = MagicMock()
    response.id = "ws-pred-123"
    response.provider = "wavespeed_ai"
    response.data = []
    response.credits_used = 800
    response.credits_balance = 9200
    response.dict.return_value = {
        "id": "ws-pred-123",
        "provider": "wavespeed_ai",
        "data": [],
        "credits_used": 800,
        "credits_balance": 9200,
    }

    session = _make_async_session(_scalar_result(task), _scalar_result(user))

    with patch("app.tasks.media_tasks.AsyncSessionLocal", return_value=session), \
         patch("app.tasks.media_tasks.LLMGateway", side_effect=lambda db: _FakeGateway(db, response)), \
         patch("app.services.media_provider_service.get_media_provider_key", new_callable=AsyncMock, return_value={"apiKey": "ws-key", "baseUrl": "https://api.wavespeed.ai"}), \
         patch("app.tasks.media_tasks._enqueue_wavespeed_poll") as enqueue_mock:
        result = await _generate_video_async(
            task.id,
            str(user.id),
            {
                "model": "wavespeed-ai/cinematic-video-generator",
                "prompt": "Sensitive prompt text",
                "duration": 10,
                "aspectRatio": "16:9",
                "referenceImageUrls": [
                    "https://cdn.example.com/1.png",
                    "https://cdn.example.com/2.png",
                ],
            },
        )

    assert result == {
        "status": "submitted",
        "task_id": task.id,
        "external_task_id": "ws-pred-123",
    }
    assert task.task_id == "ws-pred-123"
    assert task.result_data["submission"]["provider"] == "wavespeed_ai"
    assert task.result_data["submission"]["provider_task_id"] == "ws-pred-123"
    assert task.result_data["submission"]["used_sync_mode"] is False
    assert task.result_data["submission"]["request_summary"] == {
        "prompt_length": len("Sensitive prompt text"),
        "generate_type": "text-to-video",
        "has_reference_images": True,
        "reference_image_count": 2,
        "aspect_ratio": "16:9",
        "duration": 10,
        "requested_duration": 10,
    }
    assert "prompt" not in task.result_data["submission"]["request_summary"]
    assert "reference_image_urls" not in task.result_data["submission"]["request_summary"]
    enqueue_mock.assert_called_once_with(task.id, 3)


@pytest.mark.asyncio
async def test_generate_video_async_sanitizes_decimal_payload_before_db_commit():
    task = _make_media_task()
    user = _make_user()
    response = MagicMock()
    response.id = "ws-pred-456"
    response.provider = "wavespeed_ai"
    response.data = []
    response.credits_used = Decimal("150")
    response.credits_balance = Decimal("9850")
    response.dict.return_value = {
        "id": "ws-pred-456",
        "provider": "wavespeed_ai",
        "data": [],
        "credits_used": Decimal("150"),
        "credits_balance": Decimal("9850"),
        "metrics": {
            "ratio": Decimal("1.25"),
            "nested": [Decimal("2")],
        },
    }

    session = _make_async_session(_scalar_result(task), _scalar_result(user))

    with patch("app.tasks.media_tasks.AsyncSessionLocal", return_value=session), \
         patch("app.tasks.media_tasks.LLMGateway", side_effect=lambda db: _FakeGateway(db, response)), \
         patch("app.services.media_provider_service.get_media_provider_key", new_callable=AsyncMock, return_value={"apiKey": "ws-key", "baseUrl": "https://api.wavespeed.ai"}), \
         patch("app.tasks.media_tasks._enqueue_wavespeed_poll") as enqueue_mock:
        result = await _generate_video_async(
            task.id,
            str(user.id),
            {
                "model": "wavespeed-ai/cinematic-video-generator",
                "prompt": "Decimal payload test",
                "duration": 10,
            },
        )

    assert result["status"] == "submitted"
    assert task.result_data["response"]["credits_used"] == 150
    assert task.result_data["response"]["credits_balance"] == 9850
    assert task.result_data["response"]["metrics"]["ratio"] == 1.25
    assert task.result_data["response"]["metrics"]["nested"] == [2]
    assert _make_json_safe({"value": Decimal("7")}) == {"value": 7}
    enqueue_mock.assert_called_once_with(task.id, 3)


def _make_wavespeed_submission() -> dict:
    return {
        "provider": "wavespeed_ai",
        "provider_model_id": "wavespeed-ai/cinematic-video-generator",
        "provider_task_id": "ws-pred-123",
        "base_url": "https://api.wavespeed.ai/api/v3",
        "submit_endpoint": "/wavespeed-ai/cinematic-video-generator",
        "result_endpoint_template": "/predictions/{requestId}/result",
        "used_sync_mode": False,
        "request_summary": {
            "prompt_length": 20,
            "generate_type": "text-to-video",
            "has_reference_images": True,
            "reference_image_count": 2,
            "aspect_ratio": "16:9",
            "duration": 10,
            "requested_duration": 10,
        },
    }


def _wavespeed_provider_class_mock(instance: MagicMock) -> MagicMock:
    cls = MagicMock()
    cls.POLL_INITIAL_SECONDS = 3
    cls.POLL_TIMEOUT_SECONDS = 1800
    cls.calculate_next_poll_delay = MagicMock(side_effect=lambda previous, retry_after=None: max(retry_after or 0, min(max(previous * 2, 3), 15)))
    cls.extract_retry_after_seconds = MagicMock(side_effect=lambda headers: int(headers.get("Retry-After")) if headers.get("Retry-After") else None)
    cls.return_value = instance
    return cls


@pytest.mark.asyncio
async def test_poll_wavespeed_video_task_persists_result_url_and_actual_duration_on_success():
    task = _make_media_task()
    task.task_id = "ws-pred-123"
    task.parameters = {"duration": 10}
    task.result_data = {
        "submission": _make_wavespeed_submission(),
        "polling": {
            "provider": "wavespeed_ai",
            "attempts": 0,
            "next_delay_seconds": 3,
        },
    }

    session = _make_async_session(_scalar_result(task))
    provider = MagicMock()
    provider.poll_prediction = AsyncMock(return_value=WaveSpeedPollResult(
        state="success",
        raw_status="completed",
        provider_task_id="ws-pred-123",
        result_url="https://cdn.example.com/final.mp4",
        error_message=None,
        raw_response={"data": {"id": "ws-pred-123", "status": "completed"}},
    ))
    provider.aclose = AsyncMock()

    with patch("app.tasks.media_tasks.AsyncSessionLocal", return_value=session), \
         patch("app.services.media_provider_service.get_media_provider_key", new_callable=AsyncMock, return_value={"apiKey": "ws-key", "baseUrl": "https://api.wavespeed.ai"}), \
         patch("app.llm_proxy.providers.wavespeed_media_provider.WaveSpeedMediaProvider", new=_wavespeed_provider_class_mock(provider)), \
         patch("app.tasks.media_tasks._enqueue_wavespeed_poll") as enqueue_mock:
        result = await _poll_wavespeed_video_task_async(task.id, schedule_next_poll=True)

    assert result["status"] == "completed"
    assert task.status == TaskStatus.COMPLETED
    assert task.result_url == "https://cdn.example.com/final.mp4"
    assert task.result_data["actual_duration"] == 10
    enqueue_mock.assert_not_called()


@pytest.mark.asyncio
async def test_poll_wavespeed_video_task_retries_429_with_backoff_and_retry_after():
    task = _make_media_task()
    task.task_id = "ws-pred-123"
    task.result_data = {
        "submission": _make_wavespeed_submission(),
        "polling": {
            "provider": "wavespeed_ai",
            "attempts": 1,
            "raw_status": "processing",
            "next_delay_seconds": 3,
        },
    }

    session = _make_async_session(_scalar_result(task))
    provider = MagicMock()
    provider.poll_prediction = AsyncMock(side_effect=httpx.HTTPStatusError(
        "429 Too Many Requests",
        request=MagicMock(),
        response=httpx.Response(429, headers={"Retry-After": "20"}),
    ))
    provider.aclose = AsyncMock()

    with patch("app.tasks.media_tasks.AsyncSessionLocal", return_value=session), \
         patch("app.services.media_provider_service.get_media_provider_key", new_callable=AsyncMock, return_value={"apiKey": "ws-key", "baseUrl": "https://api.wavespeed.ai"}), \
         patch("app.llm_proxy.providers.wavespeed_media_provider.WaveSpeedMediaProvider", new=_wavespeed_provider_class_mock(provider)), \
         patch("app.tasks.media_tasks._enqueue_wavespeed_poll") as enqueue_mock:
        result = await _poll_wavespeed_video_task_async(task.id, schedule_next_poll=True)

    assert result["status"] == "processing"
    assert task.status == TaskStatus.PROCESSING
    assert task.result_data["polling"]["next_delay_seconds"] == 20
    enqueue_mock.assert_called_once_with(task.id, 20)


@pytest.mark.asyncio
async def test_poll_wavespeed_video_task_fails_with_explicit_timeout_after_30_minutes():
    task = _make_media_task()
    task.task_id = "ws-pred-123"
    task.started_at = datetime.now(timezone.utc) - timedelta(minutes=31)
    task.result_data = {
        "submission": _make_wavespeed_submission(),
        "polling": {
            "provider": "wavespeed_ai",
            "attempts": 5,
            "raw_status": "processing",
            "next_delay_seconds": 15,
        },
    }

    session = _make_async_session(_scalar_result(task))

    with patch("app.tasks.media_tasks.AsyncSessionLocal", return_value=session), \
         patch("app.tasks.media_tasks._enqueue_wavespeed_poll") as enqueue_mock:
        result = await _poll_wavespeed_video_task_async(task.id, schedule_next_poll=True)

    assert result["status"] == "failed"
    assert task.status == TaskStatus.FAILED
    assert "timed out after 30 minutes" in (task.error_message or "")
    enqueue_mock.assert_not_called()


@pytest.mark.asyncio
async def test_poll_wavespeed_video_task_returns_terminal_state_when_task_already_completed_as_string():
    task = _make_media_task()
    task.status = "completed"
    task.task_id = "ws-pred-123"
    task.result_url = "https://cdn.example.com/final.mp4"
    task.completed_at = datetime.now(timezone.utc)
    task.result_data = {
        "submission": _make_wavespeed_submission(),
        "polling": {
            "provider": "wavespeed_ai",
            "attempts": 4,
            "raw_status": "completed",
            "next_delay_seconds": 15,
        },
    }

    session = _make_async_session(_scalar_result(task))

    with patch("app.tasks.media_tasks.AsyncSessionLocal", return_value=session), \
         patch("app.tasks.media_tasks._enqueue_wavespeed_poll") as enqueue_mock:
        result = await _poll_wavespeed_video_task_async(task.id, schedule_next_poll=True)

    assert result == {
        "status": "terminal",
        "task_id": task.id,
        "state": "completed",
    }
    enqueue_mock.assert_not_called()


@pytest.mark.asyncio
async def test_poll_wavespeed_video_task_recovers_failed_terminal_bug_when_result_url_already_exists():
    task = _make_media_task()
    task.status = "failed"
    task.task_id = "ws-pred-123"
    task.result_url = "https://cdn.example.com/final.mp4"
    task.error_message = "'str' object has no attribute 'value'"
    task.completed_at = datetime.now(timezone.utc)
    task.result_data = {
        "submission": _make_wavespeed_submission(),
        "polling": {
            "provider": "wavespeed_ai",
            "attempts": 4,
            "raw_status": "completed",
            "next_delay_seconds": 15,
        },
    }

    session = _make_async_session(_scalar_result(task))

    with patch("app.tasks.media_tasks.AsyncSessionLocal", return_value=session), \
         patch("app.tasks.media_tasks._enqueue_wavespeed_poll") as enqueue_mock:
        result = await _poll_wavespeed_video_task_async(task.id, schedule_next_poll=True)

    assert result == {
        "status": "completed",
        "task_id": task.id,
        "result_url": "https://cdn.example.com/final.mp4",
        "recovered": True,
    }
    assert task.status == TaskStatus.COMPLETED
    assert task.error_message is None
    enqueue_mock.assert_not_called()


@pytest.mark.asyncio
async def test_recover_stuck_tasks_repolls_recent_failed_wavespeed_terminal_bug():
    task = _make_media_task()
    task.status = TaskStatus.FAILED
    task.task_id = "ws-pred-123"
    task.result_url = None
    task.error_message = "'str' object has no attribute 'value'"
    task.completed_at = datetime.now(timezone.utc) - timedelta(minutes=1)
    task.result_data = {
        "submission": _make_wavespeed_submission(),
        "polling": {
            "provider": "wavespeed_ai",
            "attempts": 4,
            "raw_status": "completed",
            "next_delay_seconds": 15,
        },
    }

    processing_result = MagicMock()
    processing_result.scalars.return_value.all.return_value = []
    failed_result = MagicMock()
    failed_result.scalars.return_value.all.return_value = [task]

    session = AsyncMock()
    session.__aenter__ = AsyncMock(return_value=session)
    session.__aexit__ = AsyncMock(return_value=False)
    session.commit = AsyncMock()
    session.execute = AsyncMock(side_effect=[processing_result, failed_result])

    with patch("app.tasks.media_tasks.AsyncSessionLocal", return_value=session), \
         patch("app.tasks.media_tasks._poll_wavespeed_video_task_async", new_callable=AsyncMock, return_value={"status": "completed"}) as poll_mock:
        result = await _recover_stuck_tasks_async()

    assert result["status"] == "success"
    assert result["recovered_count"] == 1
    poll_mock.assert_awaited_once_with(task.id, schedule_next_poll=True)


@pytest.mark.asyncio
async def test_recover_stuck_tasks_fails_processing_task_without_provider_task_id():
    task = _make_media_task("task-missing-provider-id")
    task.status = TaskStatus.PROCESSING
    task.task_id = None
    task.started_at = datetime.now(timezone.utc) - timedelta(minutes=15)
    task.created_at = task.started_at

    processing_result = MagicMock()
    processing_result.scalars.return_value.all.return_value = [task]
    failed_result = MagicMock()
    failed_result.scalars.return_value.all.return_value = []

    session = _make_async_session(processing_result, failed_result)

    with patch("app.tasks.media_tasks.AsyncSessionLocal", return_value=session):
        result = await _recover_stuck_tasks_async()

    assert result["status"] == "success"
    assert result["failed_count"] == 1
    assert task.status == TaskStatus.FAILED
    assert "no provider task ID" in task.error_message
    assert task.completed_at is not None
    session.commit.assert_awaited_once()
