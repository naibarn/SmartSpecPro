from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest
from fastapi import HTTPException

from app.api.v1 import media_generation
from app.llm_proxy.models import ImageGenerationRequest
from app.models.media_task import TaskStatus


class _Inspect:
    def __init__(self, queues, ping_replies=None):
        self._queues = queues
        self._ping_replies = ping_replies if ping_replies is not None else {"presentation@host": {"ok": "pong"}}

    def active_queues(self):
        return self._queues

    def ping(self, timeout):
        return self._ping_replies


class _Control:
    def __init__(self, queues, ping_replies=None):
        self._inspect = _Inspect(queues, ping_replies)

    def inspect(self, timeout):
        return self._inspect


class _CeleryTask:
    def __init__(self, queues, ping_replies=None):
        self.app = SimpleNamespace(control=_Control(queues, ping_replies))


def test_worker_health_requires_media_queue_even_when_another_worker_pings(monkeypatch):
    monkeypatch.setattr(media_generation, "CELERY_ENABLED", True)
    monkeypatch.setattr(
        media_generation,
        "generate_image_task",
        _CeleryTask({"presentation@host": [{"name": "presentation_export"}]}),
    )

    assert media_generation._has_responsive_celery_worker() is False


def test_worker_health_accepts_worker_subscribed_to_media(monkeypatch):
    monkeypatch.setattr(media_generation, "CELERY_ENABLED", True)
    monkeypatch.setattr(
        media_generation,
        "generate_image_task",
        _CeleryTask({"media@host": [{"name": "media"}]}),
    )

    assert media_generation._has_responsive_celery_worker() is True


@pytest.mark.asyncio
async def test_image_admission_rejects_before_persist_when_media_worker_is_missing(monkeypatch):
    monkeypatch.setattr(media_generation, "CELERY_ENABLED", True)
    monkeypatch.setattr(media_generation, "_has_responsive_celery_worker", lambda: False)
    create_task = AsyncMock(side_effect=AssertionError("task must not be persisted"))
    monkeypatch.setattr(media_generation.MediaTaskService, "create_task", create_task)

    request = ImageGenerationRequest(
        model="gpt-image-2-text-to-image",
        prompt="frame",
        tenant_id="tenant-1",
        extra_params={
            "__prompt_safety": {
                "checked": True,
                "skillId": "image-prompt-safety-rewriter",
                "mode": "standard",
            }
        },
    )
    user = SimpleNamespace(id=1, currentTenantId="tenant-1")

    with pytest.raises(HTTPException) as exc_info:
        await media_generation.generate_image_async(request, None, object(), user)

    assert exc_info.value.status_code == 503
    create_task.assert_not_awaited()


@pytest.mark.asyncio
async def test_image_dispatch_failure_marks_claimed_row_failed(monkeypatch):
    monkeypatch.setattr(media_generation, "CELERY_ENABLED", True)
    monkeypatch.setattr(media_generation, "_has_responsive_celery_worker", lambda: True)
    monkeypatch.setattr(
        media_generation,
        "_dispatch_pending_image_tasks_async",
        AsyncMock(side_effect=RuntimeError("broker unavailable")),
    )

    task = SimpleNamespace(
        id="task-1",
        celery_task_id=None,
        status=TaskStatus.PENDING.value,
        error_message=None,
        completed_at=None,
        to_dict=lambda: {"id": "task-1", "status": "failed"},
    )
    monkeypatch.setattr(media_generation.MediaTaskService, "create_task", AsyncMock(return_value=task))
    db = SimpleNamespace(refresh=AsyncMock(), commit=AsyncMock())
    request = ImageGenerationRequest(
        model="gpt-image-2-text-to-image",
        prompt="frame",
        tenant_id="tenant-1",
        extra_params={
            "__prompt_safety": {
                "checked": True,
                "skillId": "image-prompt-safety-rewriter",
                "mode": "standard",
            }
        },
    )
    user = SimpleNamespace(id=1, currentTenantId="tenant-1")

    with pytest.raises(HTTPException) as exc_info:
        await media_generation.generate_image_async(request, None, db, user)

    assert exc_info.value.status_code == 503
    assert task.status == TaskStatus.FAILED.value
    assert "dispatch" in task.error_message.lower()
    db.commit.assert_awaited_once()
