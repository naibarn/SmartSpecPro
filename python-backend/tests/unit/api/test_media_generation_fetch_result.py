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
