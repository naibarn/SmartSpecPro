from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.models.media_task import TaskStatus


def _result(*, scalar=None, rows=None):
    result = MagicMock()
    result.scalar.return_value = scalar
    result.scalars.return_value.all.return_value = rows or []
    return result


@pytest.mark.parametrize(
    ("enqueue_name", "expected_task"),
    [
        ("_enqueue_kie_image_poll", "poll_kie_image_task"),
        ("_enqueue_wavespeed_poll", "poll_wavespeed_video_task"),
        ("_enqueue_magnific_poll", "poll_magnific_media_task"),
    ],
)
def test_provider_poll_dispatch_inherits_canonical_job_tenant(enqueue_name, expected_task):
    from app.services.job_execution_context import bind_job_execution, reset_job_execution
    from app.tasks import media_tasks

    context_token = bind_job_execution(
        job_id="canonical-media-job",
        task_ids={"media-task"},
        user_id=42,
        tenant_id="tenant-media-42",
        client=MagicMock(),
        lease=SimpleNamespace(attempt_id="attempt-1"),
    )
    with patch("app.tasks.media_tasks.dispatch_python_task") as dispatch:
        try:
            getattr(media_tasks, enqueue_name)("media-task", 5)
        finally:
            reset_job_execution(context_token)

    assert dispatch.call_args.kwargs["tenant_id"] == "tenant-media-42"
    assert dispatch.call_args.args[0] == getattr(media_tasks, expected_task).name
    assert dispatch.call_args.kwargs["admission_mode"] == "durable_queue"


def test_provider_poll_dispatch_fails_closed_without_canonical_tenant():
    from app.services.job_execution_context import bind_job_execution, reset_job_execution
    from app.tasks import media_tasks

    context_token = bind_job_execution(
        job_id="canonical-media-job",
        task_ids={"media-task"},
        user_id=42,
        client=MagicMock(),
        lease=SimpleNamespace(attempt_id="attempt-1"),
    )
    with patch("app.tasks.media_tasks.dispatch_python_task") as dispatch:
        try:
            with pytest.raises(ValueError, match="MEDIA_POLL_CANONICAL_TENANT_REQUIRED"):
                media_tasks._enqueue_kie_image_poll("media-task", 5)
        finally:
            reset_job_execution(context_token)

    dispatch.assert_not_called()


def test_unified_media_executor_binds_tenant_from_canonical_job_context():
    import asyncio

    from app.services.job_execution_context import current_tenant_id
    from app.tasks import unified_job_task

    observed_tenants = []

    async def execute_media_task(_task_name, _args):
        observed_tenants.append(current_tenant_id())
        return {"status": "submitted"}

    with patch("app.tasks.unified_job_task._execute_hard_media_task", execute_media_task), patch(
        "app.tasks.media_tasks._run_async", side_effect=lambda coro: asyncio.run(coro)
    ):
        result = unified_job_task._execute_legacy_task(
            {
                "tenantId": "tenant-from-control-plane",
                "requestedByUserId": 42,
                "input": {
                    "taskName": "app.tasks.media_tasks.generate_image_task",
                    "args": ["media-task", 42, {}],
                },
            },
            MagicMock(),
            SimpleNamespace(job_id="canonical-job", attempt_id="attempt-1"),
        )

    assert result == {"status": "submitted"}
    assert observed_tenants == ["tenant-from-control-plane"]


@pytest.mark.asyncio
async def test_dispatcher_submits_every_unclaimed_task_to_worker_jobs():
    from app.tasks.media_tasks import _dispatch_pending_image_tasks_async

    queued = [
        SimpleNamespace(
            id="task-3",
            user_id=7,
            tenant_id="tenant-7",
            model="nano-banana-2",
            prompt="third",
            status=TaskStatus.PENDING.value,
            parameters={"extra_params": {}},
            celery_task_id=None,
        ),
        SimpleNamespace(
            id="task-4",
            user_id=7,
            tenant_id="tenant-7",
            model="nano-banana-2",
            prompt="fourth",
            status=TaskStatus.PENDING.value,
            parameters={"extra_params": {}},
            celery_task_id=None,
        ),
    ]
    session = AsyncMock()
    session.__aenter__ = AsyncMock(return_value=session)
    session.__aexit__ = AsyncMock(return_value=False)
    execution_results = [
        _result(),
        _result(rows=queued),
        *[_result() for _ in queued],
    ]
    execution_results[2].scalar_one_or_none.return_value = queued[0]
    execution_results[3].scalar_one_or_none.return_value = queued[1]
    session.execute = AsyncMock(side_effect=execution_results)
    session.commit = AsyncMock()

    dispatch = MagicMock(side_effect=lambda *args, **kwargs: SimpleNamespace(id=f"job-{kwargs['args'][0]}"))
    with patch("app.tasks.media_tasks.AsyncSessionLocal", return_value=session), patch(
        "app.tasks.media_tasks.dispatch_python_task", dispatch
    ):
        result = await _dispatch_pending_image_tasks_async(7)

    assert result["submitted_count"] == 2
    assert result["failed_count"] == 0
    assert result["dispatched_task_ids"] == ["task-3", "task-4"]
    assert queued[0].celery_task_id == "job-task-3"
    assert queued[1].celery_task_id == "job-task-4"
    assert dispatch.call_count == 2
    assert {call.kwargs["args"][0] for call in dispatch.call_args_list} == {"task-3", "task-4"}
    assert all(call.kwargs["tenant_id"] == "tenant-7" for call in dispatch.call_args_list)
    assert all(call.kwargs["idempotency_key"].startswith("media:image:tenant-7:") for call in dispatch.call_args_list)
    assert all(call.kwargs["admission_mode"] == "durable_queue" for call in dispatch.call_args_list)
    assert session.execute.await_args_list[0].args[1] == {"lock_key": "kie-image-user:7"}
    assert session.execute.await_args_list[1].args[0].compile().params["user_id_1"] == 7


@pytest.mark.asyncio
async def test_failed_worker_jobs_dispatch_releases_image_claim_for_recovery():
    from app.tasks.media_tasks import _dispatch_pending_image_tasks_async

    task = SimpleNamespace(
        id="task-dispatch-failure",
        user_id=7,
        tenant_id="tenant-7",
        model="nano-banana-2",
        prompt="retry me",
        status=TaskStatus.PENDING.value,
        parameters={"extra_params": {}},
        celery_task_id=None,
        error_message=None,
    )
    session = AsyncMock()
    session.__aenter__ = AsyncMock(return_value=session)
    session.__aexit__ = AsyncMock(return_value=False)
    execution_results = [_result(), _result(rows=[task]), _result()]
    execution_results[2].scalar_one_or_none.return_value = task
    session.execute = AsyncMock(side_effect=execution_results)
    session.commit = AsyncMock()

    with patch("app.tasks.media_tasks.AsyncSessionLocal", return_value=session), patch(
        "app.tasks.media_tasks.dispatch_python_task",
        side_effect=RuntimeError("control plane unavailable"),
    ):
        result = await _dispatch_pending_image_tasks_async(7)

    assert result["submitted_count"] == 0
    assert result["failed_count"] == 1
    assert task.celery_task_id is None
    assert task.error_message == "Local queue dispatch failed; recovery will retry."
    assert session.commit.await_count == 2


@pytest.mark.asyncio
async def test_unclaimed_image_recovery_uses_cursor_to_continue_past_first_user_batch():
    from app.tasks.media_tasks import _recover_unclaimed_pending_image_tasks_async

    users = list(range(11, 61))
    session = AsyncMock()
    session.__aenter__ = AsyncMock(return_value=session)
    session.__aexit__ = AsyncMock(return_value=False)
    session.execute = AsyncMock(return_value=_result(rows=users))

    async def dispatch(user_id):
        return {"dispatched_task_ids": [str(user_id)], "failed_count": 0}

    with patch("app.tasks.media_tasks.AsyncSessionLocal", return_value=session), patch(
        "app.tasks.media_tasks._dispatch_pending_image_tasks_async", side_effect=dispatch
    ):
        result = await _recover_unclaimed_pending_image_tasks_async(after_user_id=10)

    assert result == {
        "users_checked": 50,
        "dispatched": 50,
        "dispatch_failures": 0,
        "next_after_user_id": 60,
    }
    compiled = session.execute.await_args.args[0].compile()
    assert "user_id_1" in compiled.params
    assert compiled.params["user_id_1"] == 10
    assert "user_id >" in str(compiled).lower()


def test_recovery_only_requeues_unclaimed_images_during_hard_cutover():
    from app.tasks.media_tasks import recover_stuck_tasks

    result = recover_stuck_tasks()

    assert result == {
        "status": "success",
        "pending_dispatched": 0,
        "dispatch_failures": 0,
    }


@pytest.mark.asyncio
async def test_kie_async_submission_does_not_wait_and_schedules_poll():
    from app.tasks import media_tasks
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
    enqueue_poll.assert_called_once_with(
        "task-1", media_tasks.KIE_IMAGE_CALLBACK_FALLBACK_SECONDS
    )
    assert result["status"] == "submitted"
    assert task.task_id == "kie-provider-1"
    assert task.status == TaskStatus.PROCESSING
    assert task.result_data["polling"]["provider"] == "kie_ai"
    assert task.result_data["polling"]["started_at"]


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
async def test_kie_submission_rate_limiter_uses_shared_postgres_window(monkeypatch):
    from app.services.kie_submission_rate_limiter import KieSubmissionRateLimiter
    from app.services.postgres_rate_limit import SlidingWindowDecision

    async def consume(namespace, subject, limit, window):
        assert (namespace, subject, limit, window) == (
            "kie_image_submission",
            "rate_limit:kie_ai:image_submissions",
            20,
            10,
        )
        return SlidingWindowDecision(True, 1, 19, 0)

    monkeypatch.setattr("app.services.kie_submission_rate_limiter.consume_sliding_window", consume)
    limiter = KieSubmissionRateLimiter()

    state = await limiter.acquire(task_id="task-rate-1")

    assert state.allowed is True
    assert state.remaining == 19


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
                storage_available=True,
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


def test_kie_state_normalizer_prioritizes_provider_failure_over_complete_time():
    from app.tasks.media_tasks import (
        _compact_kie_status,
        _extract_kie_failure_message,
        _normalize_kie_task_state,
    )

    response = {
        "code": 200,
        "msg": "success",
        "data": {
            "taskId": "provider-policy-failure",
            "state": "fail",
            "failCode": "400",
            "failMsg": "Sorry, but the image we created may violate OpenAI's content policies.",
            "completeTime": 1787303374933,
            "resultJson": "",
        },
    }

    assert _normalize_kie_task_state(response) == ("fail", "fail")
    assert "content policies" in _extract_kie_failure_message(response)
    compact = _compact_kie_status(response, "fail", "fail")
    assert compact["failure_code"] == "400"
    assert "content policies" in compact["failure_message"]


@pytest.mark.asyncio
async def test_kie_policy_failure_is_terminal_and_does_not_schedule_another_poll():
    from app.tasks.media_tasks import _poll_kie_image_task_async

    task = SimpleNamespace(
        id="task-policy-terminal",
        user_id=42,
        media_type="image",
        model="nano-banana-2",
        parameters={},
        status=TaskStatus.PROCESSING.value,
        task_id="provider-policy-terminal",
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
                "taskId": task.task_id,
                "state": "fail",
                "failCode": "400",
                "failMsg": "Sorry, but the image we created may violate OpenAI's content policies.",
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
                storage_available=True,
            )
        ),
    ), patch(
        "app.llm_proxy.providers.kie_ai_provider.KieAIProvider", return_value=provider
    ), patch(
        "app.tasks.media_tasks._enqueue_kie_image_poll"
    ) as enqueue_poll, patch(
        "app.tasks.media_tasks._send_failure_notifications", AsyncMock()
    ), patch(
        "app.tasks.media_tasks._dispatch_pending_image_tasks_async", AsyncMock()
    ) as dispatch:
        result = await _poll_kie_image_task_async("task-policy-terminal")

    assert result == {"status": "failed", "task_id": task.id}
    assert task.status == TaskStatus.FAILED.value
    assert "content policies" in task.error_message
    enqueue_poll.assert_not_called()
    dispatch.assert_awaited_once_with(42)


@pytest.mark.asyncio
async def test_kie_image_fetch_failure_is_delayed_and_requeued_through_dispatcher():
    from app.tasks.media_tasks import _poll_kie_image_task_async

    task = SimpleNamespace(
        id="task-fetch-retry",
        user_id=42,
        media_type="image",
        model="gpt-image-2-image-to-image",
        parameters={"reference_image_urls": ["https://smartaihub.app/reference.png"]},
        status=TaskStatus.PROCESSING.value,
        task_id="provider-fetch-retry",
        celery_task_id="celery-original",
        started_at=datetime.now(timezone.utc),
        created_at=datetime.now(timezone.utc),
        completed_at=None,
        result_url=None,
        result_data={"polling": {"provider": "kie_ai", "attempts": 1}},
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
                "taskId": task.task_id,
                "state": "fail",
                "failCode": "400",
                "failMsg": "Image fetch failed. Check access settings or use our File Upload API instead.",
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
                storage_available=True,
            )
        ),
    ), patch(
        "app.llm_proxy.providers.kie_ai_provider.KieAIProvider", return_value=provider
    ), patch(
        "app.tasks.media_tasks._enqueue_kie_image_retry"
    ) as enqueue_retry, patch(
        "app.tasks.media_tasks._dispatch_pending_image_tasks_async", AsyncMock()
    ) as dispatch:
        result = await _poll_kie_image_task_async("task-fetch-retry")

    assert result["status"] == "retry_scheduled"
    assert result["retry_number"] == 1
    assert task.status == TaskStatus.PENDING.value
    assert task.task_id is None
    assert task.celery_task_id.startswith("kie-image-retry:")
    assert task.result_data["polling"]["provider_retry_count"] == 1
    assert task.result_data["polling"]["retry_delay_seconds"] == 15
    enqueue_retry.assert_called_once()
    assert enqueue_retry.call_args.args[0:2] == (task.id, 42)
    assert enqueue_retry.call_args.args[3] == 15
    dispatch.assert_not_awaited()


@pytest.mark.asyncio
async def test_kie_image_fetch_failure_becomes_terminal_after_three_retries():
    from app.tasks.media_tasks import _poll_kie_image_task_async

    task = SimpleNamespace(
        id="task-fetch-exhausted",
        user_id=42,
        media_type="image",
        model="gpt-image-2-image-to-image",
        parameters={},
        status=TaskStatus.PROCESSING.value,
        task_id="provider-fetch-exhausted",
        started_at=datetime.now(timezone.utc),
        created_at=datetime.now(timezone.utc),
        completed_at=None,
        result_url=None,
        result_data={
            "polling": {
                "provider": "kie_ai",
                "attempts": 3,
                "provider_retry_count": 3,
            }
        },
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
                "taskId": task.task_id,
                "state": "fail",
                "failCode": "400",
                "failMsg": "Image fetch failed. Check access settings or use our File Upload API instead.",
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
                storage_available=True,
            )
        ),
    ), patch(
        "app.llm_proxy.providers.kie_ai_provider.KieAIProvider", return_value=provider
    ), patch(
        "app.tasks.media_tasks._enqueue_kie_image_retry"
    ) as enqueue_retry, patch(
        "app.tasks.media_tasks._send_failure_notifications", AsyncMock()
    ) as notify, patch(
        "app.tasks.media_tasks._dispatch_pending_image_tasks_async", AsyncMock()
    ) as dispatch:
        result = await _poll_kie_image_task_async("task-fetch-exhausted")

    assert result == {"status": "failed", "task_id": task.id}
    assert task.status == TaskStatus.FAILED.value
    assert "Image fetch failed" in task.error_message
    enqueue_retry.assert_not_called()
    notify.assert_awaited_once()
    dispatch.assert_awaited_once_with(42)


def test_kie_policy_exception_is_terminal_and_does_not_trigger_celery_retry():
    from app.tasks.media_tasks import poll_kie_image_task

    policy_error = RuntimeError(
        "Provider failed: Sorry, but the image we created may violate OpenAI's content policies."
    )
    retry = MagicMock()
    task_context = SimpleNamespace(
        request=SimpleNamespace(retries=0),
        max_retries=3,
        retry=retry,
    )

    def fail_after_closing(coroutine):
        coroutine.close()
        raise policy_error

    with patch(
        "app.tasks.media_tasks._run_async",
        side_effect=fail_after_closing,
    ), patch(
        "app.tasks.media_tasks._mark_task_failed_async",
        AsyncMock(),
    ) as mark_failed, patch(
        "app.tasks.media_tasks._get_media_task_owner_id_async",
        AsyncMock(return_value=42),
    ), patch(
        "app.tasks.media_tasks._send_failure_notifications",
        AsyncMock(),
    ), patch(
        "app.tasks.media_tasks._dispatch_pending_image_tasks_async",
        AsyncMock(),
    ):
        result = poll_kie_image_task(task_context, "task-policy-exception")

    assert result["status"] == "failed"
    assert result["retryable"] is False
    assert "content policies" in result["error"]
    retry.assert_not_called()
    mark_failed.assert_called_once()


def test_kie_retryable_poll_failure_uses_worker_jobs_retry_in_hard_cutover(monkeypatch):
    from app.tasks import media_tasks
    from app.tasks.unified_job_task import HardTaskRetryRequested

    monkeypatch.setenv("FEATURE_186_HARD_CUTOVER", "true")
    async def fail_poll(_task_id):
        raise ConnectionError("provider status unavailable")

    monkeypatch.setattr(media_tasks, "_poll_kie_image_task_async", fail_poll)
    task_context = SimpleNamespace(
        request=SimpleNamespace(retries=0),
        max_retries=3,
        retry=MagicMock(),
    )
    with pytest.raises(HardTaskRetryRequested):
        media_tasks.poll_kie_image_task(task_context, "task-transient-poll")

    task_context.retry.assert_not_called()


@pytest.mark.parametrize(
    ("task_name", "args"),
    [
        ("poll_kie_image_task", ("task-poll",)),
        ("poll_wavespeed_video_task", ("task-wavespeed",)),
        ("poll_magnific_media_task", ("task-magnific",)),
        (
            "extract_clip_qc_frames",
            ("https://cdn.example/clip.mp4", [0.5], 1, "42"),
        ),
    ],
)
def test_media_poll_and_clip_retries_are_owned_by_worker_jobs(task_name, args):
    from app.tasks import media_tasks
    from app.tasks.unified_job_task import HardTaskRetryRequested

    task_context = SimpleNamespace(
        request=SimpleNamespace(retries=0, id="canonical-job"),
        max_retries=3,
        retry=MagicMock(),
    )

    def fail_task(coroutine):
        coroutine.close()
        raise ConnectionError("provider unavailable")

    task = getattr(media_tasks, task_name)
    with patch("app.tasks.media_tasks._run_async", side_effect=fail_task):
        with pytest.raises(HardTaskRetryRequested):
            task(task_context, *args)

    task_context.retry.assert_not_called()


@pytest.mark.parametrize("task_name", ["generate_video_task", "generate_audio_task"])
def test_media_generation_retries_are_owned_by_worker_jobs(task_name):
    from app.tasks import media_tasks
    from app.tasks.unified_job_task import HardTaskRetryRequested

    task_context = SimpleNamespace(
        request=SimpleNamespace(retries=0, id="canonical-job"),
        max_retries=3,
        retry=MagicMock(),
    )
    task = getattr(media_tasks, task_name)
    mark_retry = AsyncMock()
    calls = 0

    def fail_generation(coroutine):
        nonlocal calls
        calls += 1
        coroutine.close()
        if calls == 1:
            raise ConnectionError("provider unavailable")
        return None

    with patch("app.tasks.media_tasks._run_async", side_effect=fail_generation), patch(
        "app.tasks.media_tasks._mark_task_retrying_async", mark_retry
    ):
        with pytest.raises(HardTaskRetryRequested):
            task(task_context, "task-generation", "42", {"model": "model"})

    mark_retry.assert_called_once()
    task_context.retry.assert_not_called()


@pytest.mark.asyncio
async def test_periodic_failed_task_sweep_does_not_requeue_mixed_policy_error():
    from app.tasks.media_tasks import _retry_failed_tasks_async

    task = SimpleNamespace(
        id="task-policy-periodic",
        user_id=42,
        media_type="image",
        status=TaskStatus.FAILED,
        error_message=(
            "Provider failed: Sorry, but the image we created may violate "
            "OpenAI's content policies. timeout while recording provider status"
        ),
        completed_at=datetime.now(timezone.utc),
        parameters={"model": "nano-banana-2"},
    )
    result = MagicMock()
    result.scalars.return_value.all.return_value = [task]
    session = AsyncMock()
    session.__aenter__ = AsyncMock(return_value=session)
    session.__aexit__ = AsyncMock(return_value=False)
    session.execute = AsyncMock(return_value=result)
    session.commit = AsyncMock()

    with patch("app.tasks.media_tasks.AsyncSessionLocal", return_value=session), patch(
        "app.tasks.media_tasks.dispatch_python_task"
    ) as submit:
        outcome = await _retry_failed_tasks_async()

    assert outcome["retried_count"] == 0
    assert task.status == TaskStatus.FAILED
    submit.assert_not_called()


@pytest.mark.asyncio
async def test_periodic_image_retry_reenters_canonical_worker_jobs_dispatcher():
    from app.tasks.media_tasks import _retry_failed_tasks_async

    task = SimpleNamespace(
        id="task-transient-requeue",
        user_id=42,
        media_type="image",
        status=TaskStatus.FAILED,
        error_message="temporary provider connection failure",
        completed_at=datetime.now(timezone.utc),
        parameters={"model": "nano-banana-2"},
        task_id="old-provider-task",
        celery_task_id="old-celery-task",
        started_at=datetime.now(timezone.utc),
    )
    result = MagicMock()
    result.scalars.return_value.all.return_value = [task]
    session = AsyncMock()
    session.__aenter__ = AsyncMock(return_value=session)
    session.__aexit__ = AsyncMock(return_value=False)
    session.execute = AsyncMock(return_value=result)
    session.commit = AsyncMock()

    with patch("app.tasks.media_tasks.AsyncSessionLocal", return_value=session), patch(
        "app.tasks.media_tasks.dispatch_python_task"
    ) as submit, patch(
        "app.tasks.media_tasks._dispatch_pending_image_tasks_async", AsyncMock()
    ) as dispatch:
        outcome = await _retry_failed_tasks_async()

    assert outcome["retried_count"] == 1
    assert task.status == TaskStatus.PENDING
    assert task.task_id is None
    assert task.celery_task_id is None
    submit.assert_not_called()
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


@pytest.mark.asyncio
async def test_kie_poller_keeps_provider_job_processing_after_soft_deadline():
    from app.tasks.media_tasks import _poll_kie_image_task_async

    old_started_at = datetime.now(timezone.utc) - timedelta(seconds=90)
    task = SimpleNamespace(
        id="task-soft-timeout",
        user_id=42,
        media_type="image",
        model="nano-banana-2",
        parameters={},
        status=TaskStatus.PROCESSING.value,
        task_id="provider-soft-timeout",
        started_at=old_started_at,
        created_at=old_started_at,
        completed_at=None,
        result_url=None,
        result_data={
            "polling": {
                "provider": "kie_ai",
                "attempts": 3,
                "started_at": old_started_at.isoformat(),
            }
        },
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
    provider.get_task_status = AsyncMock(return_value={
        "code": 200,
        "data": {"taskId": task.task_id, "state": "generating"},
    })

    with patch("app.tasks.media_tasks.AsyncSessionLocal", return_value=session), patch(
        "app.services.media_provider_service.get_media_provider_key",
        AsyncMock(return_value={"apiKey": "key"}),
    ), patch(
        "app.tasks.media_tasks._kie_image_poll_rate_limiter.acquire",
        AsyncMock(return_value=SimpleNamespace(
            allowed=True, retry_after_seconds=1, storage_available=True,
        )),
    ), patch(
        "app.llm_proxy.providers.kie_ai_provider.KieAIProvider", return_value=provider
    ), patch(
        "app.tasks.media_tasks.KIE_IMAGE_POLL_SOFT_TIMEOUT_SECONDS", 60
    ), patch(
        "app.tasks.media_tasks.KIE_IMAGE_POLL_HARD_TIMEOUT_SECONDS", 180
    ):
        result = await _poll_kie_image_task_async("task-soft-timeout", schedule_next_poll=False)

    assert result["status"] == "processing"
    assert task.status == TaskStatus.PROCESSING.value
    assert task.result_data["polling"]["soft_timeout_reached"] is True
    assert task.result_data["polling"]["timeout_stage"] == "soft"
    assert task.error_message is None


@pytest.mark.asyncio
async def test_kie_poller_reconciles_late_success_for_failed_timeout_task():
    from app.tasks.media_tasks import _poll_kie_image_task_async

    task = SimpleNamespace(
        id="task-late-success",
        user_id=42,
        media_type="image",
        model="nano-banana-2",
        parameters={},
        status=TaskStatus.FAILED.value,
        task_id="provider-late-success",
        started_at=datetime.now(timezone.utc) - timedelta(minutes=12),
        created_at=datetime.now(timezone.utc) - timedelta(minutes=12),
        completed_at=datetime.now(timezone.utc),
        result_url=None,
        result_data={"polling": {"provider": "kie_ai", "attempts": 40}},
        error_message="Kie.ai image polling timed out",
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
    provider.get_task_status = AsyncMock(return_value={
        "code": 200,
        "data": {
            "taskId": task.task_id,
            "state": "success",
            "resultJson": '{"resultUrls":["https://cdn.example/late.png"]}',
        },
    })

    with patch("app.tasks.media_tasks.AsyncSessionLocal", return_value=session), patch(
        "app.services.media_provider_service.get_media_provider_key",
        AsyncMock(return_value={"apiKey": "key"}),
    ), patch(
        "app.tasks.media_tasks._kie_image_poll_rate_limiter.acquire",
        AsyncMock(return_value=SimpleNamespace(
            allowed=True, retry_after_seconds=1, storage_available=True,
        )),
    ), patch(
        "app.llm_proxy.providers.kie_ai_provider.KieAIProvider", return_value=provider
    ), patch(
        "app.tasks.media_tasks._dispatch_pending_image_tasks_async", AsyncMock()
    ) as dispatch, patch(
        "app.tasks.media_tasks._send_failure_notifications", AsyncMock()
    ) as notify:
        result = await _poll_kie_image_task_async(
            "task-late-success",
            schedule_next_poll=False,
            allow_failed_recovery=True,
        )

    assert result["status"] == "completed"
    assert task.status == TaskStatus.COMPLETED.value
    assert task.result_url == "https://cdn.example/late.png"
    assert task.error_message is None
    dispatch.assert_awaited_once_with(42)
    notify.assert_not_awaited()
