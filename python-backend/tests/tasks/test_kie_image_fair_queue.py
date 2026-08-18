from datetime import datetime, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.models.media_task import TaskStatus


def _result(*, scalar=None, rows=None):
    result = MagicMock()
    result.scalar.return_value = scalar
    result.scalars.return_value.all.return_value = rows or []
    return result


@pytest.mark.asyncio
async def test_dispatcher_claims_only_free_per_user_slots():
    from app.tasks.media_tasks import _dispatch_pending_image_tasks_async

    queued = [
        SimpleNamespace(
            id="task-3",
            user_id=7,
            model="nano-banana-2",
            prompt="third",
            parameters={"extra_params": {}},
            celery_task_id=None,
        ),
        SimpleNamespace(
            id="task-4",
            user_id=7,
            model="nano-banana-2",
            prompt="fourth",
            parameters={"extra_params": {}},
            celery_task_id=None,
        ),
    ]
    session = AsyncMock()
    session.__aenter__ = AsyncMock(return_value=session)
    session.__aexit__ = AsyncMock(return_value=False)
    session.execute = AsyncMock(
        side_effect=[_result(), _result(scalar=2), _result(rows=queued[:1])]
    )
    session.commit = AsyncMock()

    apply_async = MagicMock()
    with patch("app.tasks.media_tasks.AsyncSessionLocal", return_value=session), patch(
        "app.tasks.media_tasks.generate_image_task.apply_async", apply_async
    ):
        result = await _dispatch_pending_image_tasks_async(7)

    assert result["available_slots"] == 1
    assert result["dispatched_task_ids"] == ["task-3"]
    assert queued[0].celery_task_id
    assert queued[1].celery_task_id is None
    apply_async.assert_called_once()
    assert apply_async.call_args.kwargs["args"][0:2] == ["task-3", 7]
    assert apply_async.call_args.kwargs["args"][2]["model"] == "nano-banana-2"
    assert session.execute.await_args_list[0].args[1] == {"lock_key": "kie-image-user:7"}
    assert session.execute.await_args_list[1].args[0].compile().params["user_id_1"] == 7


@pytest.mark.asyncio
async def test_kie_async_submission_does_not_wait_and_schedules_poll():
    from app.tasks.media_tasks import _generate_image_async

    task = SimpleNamespace(
        id="task-1",
        status=TaskStatus.PENDING.value,
        started_at=None,
        completed_at=None,
        result_data=None,
        error_message=None,
        task_id=None,
        result_url=None,
        credits_used=None,
        credits_balance=None,
    )
    user = SimpleNamespace(id=11)
    session = AsyncMock()
    session.__aenter__ = AsyncMock(return_value=session)
    session.__aexit__ = AsyncMock(return_value=False)
    lookup_task = MagicMock()
    lookup_task.scalar_one_or_none.return_value = task
    lookup_user = MagicMock()
    lookup_user.scalar_one_or_none.return_value = user
    session.execute = AsyncMock(side_effect=[_result(), lookup_task, lookup_user])
    session.commit = AsyncMock()

    gateway = MagicMock()
    gateway.generate_image = AsyncMock(
        return_value=SimpleNamespace(
            id="kie-provider-1",
            data=[],
            credits_used=10,
            credits_balance=90,
            provider="kie_ai",
            dict=lambda: {"id": "kie-provider-1", "data": [], "provider": "kie_ai"},
        )
    )

    with patch("app.tasks.media_tasks.AsyncSessionLocal", return_value=session), patch(
        "app.tasks.media_tasks.LLMGateway", return_value=gateway
    ), patch("app.tasks.media_tasks.write_media_debug_event", return_value="debug.json"), patch(
        "app.tasks.media_tasks._enqueue_kie_image_poll"
    ) as enqueue_poll:
        result = await _generate_image_async(
            "task-1",
            11,
            {
                "model": "nano-banana-2",
                "prompt": "safe prompt",
                "extra_params": {
                    "__prompt_safety": {
                        "checked": True,
                        "mode": "standard",
                        "skillId": "image-prompt-safety-rewriter",
                        "skillVersion": "1.0.0",
                        "blocked": False,
                    }
                },
            },
        )

    gateway.generate_image.assert_awaited_once()
    assert gateway.generate_image.await_args.kwargs["wait_for_completion"] is False
    enqueue_poll.assert_called_once_with("task-1", 2)
    assert result["status"] == "submitted"
    assert task.task_id == "kie-provider-1"
    assert task.status == TaskStatus.PROCESSING


@pytest.mark.asyncio
async def test_duplicate_celery_delivery_does_not_submit_provider_twice():
    from app.tasks.media_tasks import _generate_image_async

    task = SimpleNamespace(
        id="task-duplicate",
        status=TaskStatus.PROCESSING.value,
        started_at=datetime.now(timezone.utc),
        task_id=None,
    )
    task_lookup = MagicMock()
    task_lookup.scalar_one_or_none.return_value = task
    session = AsyncMock()
    session.__aenter__ = AsyncMock(return_value=session)
    session.__aexit__ = AsyncMock(return_value=False)
    session.execute = AsyncMock(side_effect=[_result(), task_lookup])
    session.commit = AsyncMock()
    gateway = MagicMock()

    with patch("app.tasks.media_tasks.AsyncSessionLocal", return_value=session), patch(
        "app.tasks.media_tasks.LLMGateway", return_value=gateway
    ), patch("app.tasks.media_tasks.write_media_debug_event", return_value="debug.json"):
        result = await _generate_image_async(
            "task-duplicate",
            11,
            {"model": "nano-banana-2", "prompt": "safe prompt"},
        )

    assert result["duplicate_delivery"] is True
    assert result["status"] == "processing"
    gateway.generate_image.assert_not_called()


@pytest.mark.asyncio
async def test_kie_provider_submit_only_skips_wait_for_task():
    from app.llm_proxy.providers.kie_ai_provider import KieAIProvider

    provider = KieAIProvider(api_key="test-key")
    provider.create_task = AsyncMock(return_value={"data": {"taskId": "kie-task-1"}})
    provider.wait_for_task = AsyncMock()

    response = await provider.generate_image(
        model="nano-banana-2",
        prompt="safe prompt",
        callback_url="",
        wait_for_completion=False,
    )

    assert response["id"] == "kie-task-1"
    assert response["status"] == "processing"
    provider.wait_for_task.assert_not_awaited()


@pytest.mark.asyncio
async def test_kie_submission_rate_limiter_uses_shared_redis_window():
    from app.services.kie_submission_rate_limiter import KieSubmissionRateLimiter

    redis_client = AsyncMock()
    redis_client.eval = AsyncMock(return_value=[1, 19, 0])
    limiter = KieSubmissionRateLimiter(redis_client=redis_client)

    state = await limiter.acquire(task_id="task-rate-1")

    assert state.allowed is True
    assert state.remaining == 19
    args = redis_client.eval.await_args.args
    assert args[2] == "rate_limit:kie_ai:image_submissions"
    assert args[3:5] == ("20", "10")


@pytest.mark.asyncio
async def test_kie_poller_completes_and_advances_same_user_without_storing_raw_payload():
    from app.tasks.media_tasks import _poll_kie_image_task_async

    task = SimpleNamespace(
        id="task-poll-1",
        user_id=42,
        media_type="image",
        model="nano-banana-2",
        parameters={},
        status=TaskStatus.PROCESSING.value,
        task_id="provider-poll-1",
        started_at=datetime.now(timezone.utc),
        created_at=datetime.now(timezone.utc),
        completed_at=None,
        result_url=None,
        result_data={"polling": {"provider": "kie_ai", "attempts": 0}},
        error_message=None,
    )
    task_lookup = MagicMock()
    task_lookup.scalar_one_or_none.return_value = task
    model_lookup = MagicMock()
    model_lookup.fetchone.return_value = None
    session = AsyncMock()
    session.__aenter__ = AsyncMock(return_value=session)
    session.__aexit__ = AsyncMock(return_value=False)
    session.execute = AsyncMock(side_effect=[task_lookup, model_lookup])
    session.commit = AsyncMock()

    provider = MagicMock()
    provider.get_task_status = AsyncMock(
        return_value={
            "code": 200,
            "data": {
                "taskId": "provider-poll-1",
                "state": "success",
                "param": '{"prompt":"must not persist"}',
                "resultJson": '{"resultUrls":["https://cdn.example/image.png?token=secret"]}',
            },
        }
    )

    with patch("app.tasks.media_tasks.AsyncSessionLocal", return_value=session), patch(
        "app.services.media_provider_service.get_media_provider_key",
        AsyncMock(return_value={"apiKey": "key"}),
    ), patch(
        "app.tasks.media_tasks._kie_image_poll_rate_limiter.acquire",
        AsyncMock(
            return_value=SimpleNamespace(
                allowed=True,
                retry_after_seconds=1,
                redis_available=True,
            )
        ),
    ), patch(
        "app.llm_proxy.providers.kie_ai_provider.KieAIProvider", return_value=provider
    ), patch(
        "app.tasks.media_tasks._dispatch_pending_image_tasks_async", AsyncMock()
    ) as dispatch:
        result = await _poll_kie_image_task_async("task-poll-1", schedule_next_poll=False)

    assert result["status"] == "completed"
    assert task.status == TaskStatus.COMPLETED.value
    assert task.result_url.startswith("https://cdn.example/image.png")
    assert "param" not in str(task.result_data)
    assert "token=secret" not in str(task.result_data)
    dispatch.assert_awaited_once_with(42)


@pytest.mark.asyncio
async def test_kie_poller_never_revives_cancelled_task():
    from app.tasks.media_tasks import _poll_kie_image_task_async

    task = SimpleNamespace(
        id="task-cancelled",
        user_id=42,
        status=TaskStatus.CANCELLED.value,
        task_id="provider-cancelled",
    )
    task_lookup = MagicMock()
    task_lookup.scalar_one_or_none.return_value = task
    session = AsyncMock()
    session.__aenter__ = AsyncMock(return_value=session)
    session.__aexit__ = AsyncMock(return_value=False)
    session.execute = AsyncMock(return_value=task_lookup)

    with patch("app.tasks.media_tasks.AsyncSessionLocal", return_value=session), patch(
        "app.tasks.media_tasks._dispatch_pending_image_tasks_async", AsyncMock()
    ) as dispatch:
        result = await _poll_kie_image_task_async("task-cancelled")

    assert result == {
        "status": "terminal",
        "task_id": "task-cancelled",
        "state": TaskStatus.CANCELLED.value,
    }
    dispatch.assert_not_awaited()
