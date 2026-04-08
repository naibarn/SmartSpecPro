from __future__ import annotations

from datetime import datetime, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

import pytest

from app.api.v1.media_generation import fetch_task_result
from app.models.media_task import MediaTask, TaskStatus


def _make_wavespeed_task() -> MediaTask:
    task = MediaTask()
    task.id = "task-1"
    task.task_id = "ws-pred-123"
    task.user_id = 1
    task.media_type = "video"
    task.status = TaskStatus.FAILED.value
    task.model = "wavespeed-ai/cinematic-video-generator"
    task.prompt = "Cyberpunk alley fight"
    task.parameters = {"duration": 5}
    task.result_url = None
    task.result_data = {
        "submission": {
            "provider": "wavespeed_ai",
            "provider_task_id": "ws-pred-123",
        },
    }
    task.error_message = "'str' object has no attribute 'value'"
    task.credits_used = 800
    task.credits_balance = 9200
    task.created_at = datetime.now(timezone.utc)
    task.started_at = datetime.now(timezone.utc)
    task.completed_at = None
    return task


def _make_kie_task() -> MediaTask:
    task = MediaTask()
    task.id = "task-kie-1"
    task.task_id = "veo_task_abcdef123456"
    task.user_id = 1
    task.media_type = "video"
    task.status = TaskStatus.PROCESSING.value
    task.model = "veo3/generate-veo-3-video-fast"
    task.prompt = "A woman walks through a futuristic subway station."
    task.parameters = {"duration": 8}
    task.result_url = None
    task.result_data = {}
    task.error_message = None
    task.credits_used = 300
    task.credits_balance = 9700
    task.created_at = datetime.now(timezone.utc)
    task.started_at = datetime.now(timezone.utc)
    task.completed_at = None
    return task


@pytest.mark.asyncio
async def test_fetch_task_result_repolls_wavespeed_and_returns_completed_task():
    task = _make_wavespeed_task()
    db = AsyncMock()
    db.refresh = AsyncMock()
    current_user = SimpleNamespace(id=1)

    async def fake_poll(task_id: str, *, schedule_next_poll: bool):
        assert task_id == task.id
        assert schedule_next_poll is False
        task.status = TaskStatus.COMPLETED.value
        task.result_url = "https://cdn.example.com/final.mp4"
        task.error_message = None
        task.completed_at = datetime.now(timezone.utc)
        return {
            "status": "completed",
            "task_id": task.id,
            "result_url": task.result_url,
        }

    with patch("app.api.v1.media_generation.MediaTaskService.get_task", new=AsyncMock(return_value=task)), \
         patch("app.tasks.media_tasks._poll_wavespeed_video_task_async", new=AsyncMock(side_effect=fake_poll)) as poll_mock:
        result = await fetch_task_result(task.id, db=db, current_user=current_user)

    assert result["success"] is True
    assert result["fetched"] is True
    assert result["provider_state"] == "completed"
    assert result["task"].status == TaskStatus.COMPLETED.value
    assert result["task"].result_url == "https://cdn.example.com/final.mp4"
    poll_mock.assert_awaited_once_with(task.id, schedule_next_poll=False)
    db.refresh.assert_awaited_once_with(task)


@pytest.mark.asyncio
async def test_fetch_task_result_repolls_wavespeed_and_reports_processing_state():
    task = _make_wavespeed_task()
    task.status = TaskStatus.PROCESSING.value
    task.error_message = None
    task.result_data = {
        "submission": {
            "provider": "wavespeed_ai",
            "provider_task_id": "ws-pred-123",
        },
        "polling": {
            "provider": "wavespeed_ai",
            "raw_status": "processing",
        },
    }
    db = AsyncMock()
    db.refresh = AsyncMock()
    current_user = SimpleNamespace(id=1)

    async def fake_poll(task_id: str, *, schedule_next_poll: bool):
        assert task_id == task.id
        assert schedule_next_poll is False
        return {
            "status": "processing",
            "task_id": task.id,
            "next_delay_seconds": 15,
        }

    with patch("app.api.v1.media_generation.MediaTaskService.get_task", new=AsyncMock(return_value=task)), \
         patch("app.tasks.media_tasks._poll_wavespeed_video_task_async", new=AsyncMock(side_effect=fake_poll)) as poll_mock:
        result = await fetch_task_result(task.id, db=db, current_user=current_user)

    assert result["success"] is True
    assert result["fetched"] is False
    assert result["provider_state"] == "processing"
    assert result["task"].status == TaskStatus.PROCESSING.value
    poll_mock.assert_awaited_once_with(task.id, schedule_next_poll=False)
    db.refresh.assert_awaited_once_with(task)


@pytest.mark.asyncio
async def test_fetch_task_result_marks_kie_successflag_3_as_failed():
    task = _make_kie_task()
    db = AsyncMock()
    current_user = SimpleNamespace(id=1)

    status_response = {
        "code": 200,
        "msg": "success",
        "data": {
            "taskId": task.task_id,
            "successFlag": 3,
            "errorCode": "GENERATION_FAILED",
            "errorMessage": "Upstream generation failed",
        },
    }

    async def fake_update_task_status(_db, task_id, status, **kwargs):
        assert task_id == task.id
        task.status = status.value if hasattr(status, "value") else status
        task.error_message = kwargs.get("error_message")
        task.result_data = kwargs.get("result_data")
        task.completed_at = datetime.now(timezone.utc)
        return task

    fake_client = SimpleNamespace(get_task_status=AsyncMock(return_value=status_response))

    with patch("app.api.v1.media_generation.MediaTaskService.get_task", new=AsyncMock(return_value=task)), \
         patch("app.api.v1.media_generation.MediaTaskService.update_task_status", new=AsyncMock(side_effect=fake_update_task_status)), \
         patch("app.api.v1.media_generation.initialize_kie_ai_client", new=AsyncMock(return_value=fake_client)):
        result = await fetch_task_result(task.id, db=db, current_user=current_user)

    assert result["success"] is False
    assert result["fetched"] is True
    assert result["kie_state"] == "successflag_3"
    assert result["task"].status == TaskStatus.FAILED.value
    assert "Upstream generation failed" in (result["task"].error_message or "")
    fake_client.get_task_status.assert_awaited_once()


@pytest.mark.asyncio
async def test_fetch_task_result_treats_kie_result_urls_as_completed_without_state():
    task = _make_kie_task()
    db = AsyncMock()
    current_user = SimpleNamespace(id=1)

    status_response = {
        "code": 200,
        "msg": "success",
        "data": {
            "taskId": task.task_id,
            "completeTime": "2025-06-06 10:30:00",
            "response": {
                "taskId": task.task_id,
                "resultUrls": [
                    "https://cdn.example.com/final.mp4",
                ],
            },
        },
    }

    async def fake_update_task_status(_db, task_id, status, **kwargs):
        assert task_id == task.id
        task.status = status.value if hasattr(status, "value") else status
        task.result_url = kwargs.get("result_url")
        task.result_data = kwargs.get("result_data")
        task.completed_at = datetime.now(timezone.utc)
        return task

    fake_client = SimpleNamespace(get_task_status=AsyncMock(return_value=status_response))

    with patch("app.api.v1.media_generation.MediaTaskService.get_task", new=AsyncMock(return_value=task)), \
         patch("app.api.v1.media_generation.MediaTaskService.update_task_status", new=AsyncMock(side_effect=fake_update_task_status)), \
         patch("app.api.v1.media_generation.initialize_kie_ai_client", new=AsyncMock(return_value=fake_client)):
        result = await fetch_task_result(task.id, db=db, current_user=current_user)

    assert result["success"] is True
    assert result["fetched"] is True
    assert result["kie_state"] == "result_url"
    assert result["task"].status == TaskStatus.COMPLETED.value
    assert result["task"].result_url == "https://cdn.example.com/final.mp4"
    fake_client.get_task_status.assert_awaited_once()
