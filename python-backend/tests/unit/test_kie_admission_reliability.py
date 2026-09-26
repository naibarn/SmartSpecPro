import asyncio
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

import pytest

class Retry(Exception):
    """Local stand-in for the former broker task retry signal."""

from app.core import redis_client
from app.services import kie_submission_rate_limiter as admission


def _run_in_new_loop(coro):
    # Preserve pytest-asyncio's current loop while reproducing worker loop changes.
    loop = asyncio.new_event_loop()
    try:
        return loop.run_until_complete(coro)
    finally:
        loop.close()


def test_cache_client_is_replaced_between_event_loops(monkeypatch):
    clients = []

    def create(*args, **kwargs):
        owner = asyncio.get_running_loop()

        async def ping():
            assert asyncio.get_running_loop() is owner
            return True

        client = SimpleNamespace(ping=ping)
        clients.append(client)
        return client

    monkeypatch.setenv("REDIS_URL", "redis://localhost")
    monkeypatch.setattr(redis_client, "_cache_client", None)
    monkeypatch.setattr(redis_client, "_cache_client_context", None)
    monkeypatch.setattr(redis_client.Redis, "from_url", create)

    async def probe():
        first = await redis_client.get_cache_redis()
        assert await redis_client.get_cache_redis() is first
        assert await first.ping()

    for _ in range(3):
        _run_in_new_loop(probe())
    assert len(clients) == 3


@pytest.mark.asyncio
async def test_cache_client_is_replaced_after_fork(monkeypatch):
    factory = MagicMock(side_effect=[AsyncMock(), AsyncMock()])
    monkeypatch.setenv("REDIS_URL", "redis://localhost")
    monkeypatch.setattr(redis_client, "_cache_client", None)
    monkeypatch.setattr(redis_client, "_cache_client_context", None)
    monkeypatch.setattr(redis_client.Redis, "from_url", factory)
    monkeypatch.setattr(redis_client.os, "getpid", lambda: 1)
    first = await redis_client.get_cache_redis()
    monkeypatch.setattr(redis_client.os, "getpid", lambda: 2)
    assert await redis_client.get_cache_redis() is not first


@pytest.mark.asyncio
async def test_singleton_limiter_resolves_current_client(monkeypatch):
    clients = [AsyncMock(), AsyncMock()]
    for client in clients:
        client.eval.return_value = [1, 19, 0]
    getter = AsyncMock(side_effect=clients)
    monkeypatch.setattr(admission, "get_cache_redis", getter)
    limiter = admission.KieSubmissionRateLimiter()
    for _ in clients:
        assert (await limiter.acquire(task_id="test")).allowed
    for client in clients:
        client.eval.assert_awaited_once()


@pytest.mark.asyncio
async def test_failed_cache_initialization_can_recover(monkeypatch):
    failed, healthy = AsyncMock(), AsyncMock()
    failed.ping.side_effect = ConnectionError("unavailable")
    monkeypatch.setenv("REDIS_URL", "redis://localhost")
    monkeypatch.setattr(redis_client, "_cache_client", None)
    monkeypatch.setattr(redis_client, "_cache_client_context", None)
    monkeypatch.setattr(redis_client.Redis, "from_url", MagicMock(side_effect=[failed, healthy]))
    assert await redis_client.get_cache_redis() is None
    failed.close.assert_awaited_once()
    assert await redis_client.get_cache_redis() is healthy


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
        "task", admission.KieSubmissionDeferred(10, redis_available=False), 10
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
async def test_limiter_distinguishes_capacity_from_connection_errors(unavailable):
    client = AsyncMock()
    client.eval.return_value = [0, 0, 5]
    if unavailable:
        client.eval.side_effect = RuntimeError("Event loop is closed")
    state = await admission.KieSubmissionRateLimiter(client).acquire(task_id="test")
    assert not state.allowed
    assert state.redis_available is not unavailable
    error = admission.KieSubmissionDeferred(5, redis_available=state.redis_available)
    assert ("ADMISSION_UNAVAILABLE" if unavailable else "QUEUE_FULL") in str(error)


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
    retry = MagicMock(side_effect=Retry())
    monkeypatch.setattr(tasks.generate_image_task, "retry", retry)
    task = tasks.generate_image_task
    task.push_request(retries=0, headers={})
    yield tasks, task, mocks, retry
    task.pop_request()


@pytest.mark.parametrize("redis_available", [True, False])
def test_admission_deferrals_do_not_exhaust_generation_retries(image_task, redis_available):
    _, task, mocks, retry = image_task
    task.request.retries = 8
    task.request.headers = {"kie_admission_deferrals": 8, "trace": "keep"}
    mocks["_generate_image_async"].side_effect = admission.KieSubmissionDeferred(
        10, redis_available=redis_available
    )
    with pytest.raises(Retry):
        task.run("task", "24", {})
    options = retry.call_args.kwargs
    assert options["max_retries"] == 9
    assert options["headers"]["kie_admission_deferrals"] == 9
    assert options["headers"]["trace"] == "keep"
    assert "kie_admission_deadline" in options["headers"]
    mocks["_send_failure_notifications"].assert_not_awaited()
    mocks["_mark_task_failed_async"].assert_not_awaited()


def test_generation_retries_remain_available_after_queue_waits(image_task):
    _, task, mocks, retry = image_task
    task.request.retries = 8
    task.request.headers = {"kie_admission_deferrals": 7}
    mocks["_generate_image_async"].side_effect = RuntimeError("provider unavailable")
    with pytest.raises(Retry):
        task.run("task", "24", {})
    assert retry.call_args.kwargs["countdown"] == 60
    assert retry.call_args.kwargs["max_retries"] == 9
    mocks["_send_failure_notifications"].assert_not_awaited()


def test_generation_retries_still_have_a_limit(image_task):
    _, task, mocks, retry = image_task
    task.request.retries = 10
    task.request.headers = {"kie_admission_deferrals": 7}
    mocks["_generate_image_async"].side_effect = RuntimeError("provider unavailable")
    assert task.run("task", "24", {})["status"] == "failed"
    retry.assert_not_called()
    mocks["_send_failure_notifications"].assert_awaited_once()


@pytest.mark.parametrize("redis_available", [True, False])
def test_queue_wait_deadline_terminates_with_specific_reason(image_task, redis_available):
    tasks, task, mocks, retry = image_task
    task.request.headers = {"kie_admission_deadline": 1}
    mocks["_generate_image_async"].side_effect = admission.KieSubmissionDeferred(
        10, redis_available=redis_available
    )
    result = task.run("task", "24", {})
    assert "ADMISSION_TIMEOUT" in result["error"]
    assert ("QUEUE_FULL" if redis_available else "ADMISSION_UNAVAILABLE") in result["error"]
    assert tasks._is_non_retryable_media_error(RuntimeError(result["error"]))
    retry.assert_not_called()
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
