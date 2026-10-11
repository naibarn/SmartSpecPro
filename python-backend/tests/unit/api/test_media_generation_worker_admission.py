from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from app.api.v1 import media_generation
from app.llm_proxy.models import ImageGenerationRequest
from app.models.media_task import TaskStatus


@pytest.mark.asyncio
async def test_image_admission_persists_pending_when_worker_dispatch_is_unavailable(monkeypatch):
    dispatch = AsyncMock(return_value={
        "dispatched_task_ids": [],
        "failed_count": 1,
    })
    monkeypatch.setattr(
        media_generation,
        "_dispatch_pending_image_tasks_async",
        dispatch,
    )

    task = SimpleNamespace(
        id="task-1",
        celery_task_id=None,
        status=TaskStatus.PENDING.value,
        error_message=None,
        completed_at=None,
        to_dict=lambda: {
            "id": "task-1", "user_id": 1, "media_type": "image",
            "status": task.status, "model": "test-model", "prompt": "frame",
            "created_at": "2026-09-29T00:00:00+00:00",
        },
    )
    create_task = AsyncMock(return_value=task)
    monkeypatch.setattr(media_generation.MediaTaskService, "create_task", create_task)
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

    response = await media_generation.generate_image_async(request, db, user)

    assert task.status == TaskStatus.PENDING.value
    assert "dispatch" in task.error_message.lower()
    assert response.id == "task-1"
    create_task.assert_awaited_once()
    dispatch.assert_awaited_once_with(user.id)
    db.commit.assert_awaited_once()


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("dispatch_result", "dispatch_error"),
    [
        ({"dispatched_task_ids": [], "failed_count": 2}, None),
        ({"dispatched_task_ids": ["task-0"], "failed_count": 1}, None),
        (None, RuntimeError("control plane unavailable")),
    ],
)
async def test_image_batch_dispatch_failure_keeps_tasks_pending_for_recovery(
    monkeypatch, dispatch_result, dispatch_error
):
    tasks = [
        SimpleNamespace(
            id=f"task-{index}",
            status=TaskStatus.PENDING.value,
            error_message=None,
            completed_at=None,
        )
        for index in range(2)
    ]
    create_task = AsyncMock(side_effect=tasks)
    dispatch = (
        AsyncMock(side_effect=dispatch_error)
        if dispatch_error
        else AsyncMock(return_value=dispatch_result)
    )
    monkeypatch.setattr(media_generation, "validate_image_prompt_safety", lambda _parameters: None)
    monkeypatch.setattr(media_generation.MediaTaskService, "create_task", create_task)
    monkeypatch.setattr(media_generation, "_dispatch_pending_image_tasks_async", dispatch)
    db = SimpleNamespace(commit=AsyncMock())
    request = media_generation.BatchGenerationRequest(
        model="gpt-image-2-5-sunburst-text-to-image",
        prompts=["portrait one", "portrait two"],
        media_type="image",
    )
    user = SimpleNamespace(id=24, currentTenantId="tenant-1")

    response = await media_generation.batch_generate(request, db, user)

    assert response.task_ids == ["task-0", "task-1"]
    assert response.total_tasks == 2
    assert all(task.status == TaskStatus.PENDING.value for task in tasks)
    assert all(task.error_message is None for task in tasks)
