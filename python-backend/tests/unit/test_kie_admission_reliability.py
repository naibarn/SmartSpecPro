import asyncio
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

import pytest

from app.services import kie_submission_rate_limiter as admission
from app.services.postgres_rate_limit import SlidingWindowDecision


def _run_in_new_loop(coro):
    # Preserve pytest-asyncio's current loop while reproducing worker loop changes.
    loop = asyncio.new_event_loop()
    try:
        return loop.run_until_complete(coro)
    finally:
        loop.close()


@pytest.mark.asyncio
async def test_queue_wait_preserves_previous_generation_error(monkeypatch):
    from app.tasks import media_tasks as tasks

    task = SimpleNamespace(result_data=None, status="processing", completed_at=None)
    session = AsyncMock()
    session.__aenter__.return_value = session
    result = MagicMock()
    result.scalar_one_or_none.return_value = task
    session.execute.return_value = result
    monkeypatch.setattr(tasks, "AsyncSessionLocal", lambda: session)
    await tasks._mark_task_retrying_async("task", RuntimeError("reference download timeout"), 60)
    await tasks._mark_task_retrying_async(
        "task", admission.KieSubmissionDeferred(10, storage_available=False), 10
    )
    assert task.error_message.startswith("Queue check scheduled")
    assert task.result_data["last_generation_error"] == "reference download timeout"
    assert task.result_data["retry"]["code"] == "KIE_IMAGE_ADMISSION_UNAVAILABLE"
    assert "failure" not in task.result_data
    await tasks._mark_task_failed_async("task", RuntimeError("KIE_IMAGE_ADMISSION_TIMEOUT"))
    assert task.result_data["last_generation_error"] == "reference download timeout"
    assert "retry" not in task.result_data


@pytest.mark.asyncio
@pytest.mark.parametrize("unavailable", [False, True])
async def test_limiter_distinguishes_capacity_from_storage_errors(unavailable, monkeypatch):
    async def consume(*_args):
        if unavailable:
            raise RuntimeError("database unavailable")
        return SlidingWindowDecision(False, 20, 0, 5)

    monkeypatch.setattr(admission, "consume_sliding_window", consume)
    state = await admission.KieSubmissionRateLimiter().acquire(task_id="test")
    assert not state.allowed
    assert state.storage_available is not unavailable
    error = admission.KieSubmissionDeferred(5, storage_available=state.storage_available)
    assert ("ADMISSION_UNAVAILABLE" if unavailable else "QUEUE_FULL") in str(error)


def test_deferred_admission_exception_uses_storage_availability_without_name_errors():
    error = admission.KieSubmissionDeferred(5, storage_available=False)
    assert error.code == "KIE_IMAGE_ADMISSION_UNAVAILABLE"
    assert error.retry_after_seconds == 5
    assert error.storage_available is False


@pytest.fixture
def image_task(monkeypatch):
    from app.tasks import media_tasks as tasks

    mocks = {}
    for name in ("_generate_image_async", "_mark_task_retrying_async",
                 "_mark_task_failed_async", "_send_failure_notifications",
                 "_dispatch_pending_image_tasks_async"):
        mocks[name] = AsyncMock()
        monkeypatch.setattr(tasks, name, mocks[name])
    monkeypatch.setattr(tasks, "_run_async", _run_in_new_loop)
    task = tasks.generate_image_task
    task_context = SimpleNamespace(
        request=SimpleNamespace(retries=0, headers={}),
        max_retries=task.max_retries,
        retry=MagicMock(),
    )
    yield tasks, task, task_context, mocks


@pytest.mark.parametrize("storage_available", [True, False])
def test_admission_deferrals_do_not_exhaust_generation_retries(image_task, storage_available):
    _, task, task_context, mocks = image_task
    from app.tasks.unified_job_task import HardTaskRetryRequested

    task_context.request.retries = 8
    task_context.request.headers = {"kie_admission_deferrals": 8, "trace": "keep"}
    mocks["_generate_image_async"].side_effect = admission.KieSubmissionDeferred(
        10, storage_available=storage_available
    )
    with pytest.raises(HardTaskRetryRequested):
        task.run(task_context, "task", "24", {})
    task_context.retry.assert_not_called()
    mocks["_mark_task_retrying_async"].assert_awaited_once()
    mocks["_send_failure_notifications"].assert_not_awaited()
    mocks["_mark_task_failed_async"].assert_not_awaited()


def test_generation_retries_remain_available_after_queue_waits(image_task):
    _, task, task_context, mocks = image_task
    from app.tasks.unified_job_task import HardTaskRetryRequested

    task_context.request.retries = 8
    task_context.request.headers = {"kie_admission_deferrals": 7}
    mocks["_generate_image_async"].side_effect = RuntimeError("provider unavailable")
    with pytest.raises(HardTaskRetryRequested):
        task.run(task_context, "task", "24", {})
    task_context.retry.assert_not_called()
    mocks["_mark_task_retrying_async"].assert_awaited_once()
    mocks["_send_failure_notifications"].assert_not_awaited()


def test_generation_retries_still_have_a_limit(image_task):
    _, task, task_context, mocks = image_task
    task_context.request.retries = 10
    task_context.request.headers = {"kie_admission_deferrals": 7}
    mocks["_generate_image_async"].side_effect = RuntimeError("provider unavailable")
    assert task.run(task_context, "task", "24", {})["status"] == "failed"
    task_context.retry.assert_not_called()
    mocks["_send_failure_notifications"].assert_awaited_once()


@pytest.mark.parametrize("storage_available", [True, False])
def test_queue_wait_deadline_terminates_with_specific_reason(image_task, storage_available):
    tasks, task, task_context, mocks = image_task
    task_context.request.headers = {"kie_admission_deadline": 1}
    mocks["_generate_image_async"].side_effect = admission.KieSubmissionDeferred(
        10, storage_available=storage_available
    )
    result = task.run(task_context, "task", "24", {})
    assert "ADMISSION_TIMEOUT" in result["error"]
    assert ("QUEUE_FULL" if storage_available else "ADMISSION_UNAVAILABLE") in result["error"]
    assert tasks._is_non_retryable_media_error(RuntimeError(result["error"]))
    task_context.retry.assert_not_called()
    mocks["_send_failure_notifications"].assert_awaited_once()


def test_reference_404_error_explains_remediation_without_signed_url():
    from app.llm_proxy.providers.kie_ai_provider import _reference_download_error

    error = _reference_download_error(
        "https://example.com/private-token/image.png?secret=yes", 5,
        reason="http_access", status_code=404, permanent=True,
    )
    assert "item 6" in str(error)
    assert "HTTP 404" in str(error)
    assert "upload this image again" in str(error)
    assert "private-token" not in str(error)
    assert "secret" not in str(error)
