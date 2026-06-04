import pytest
from datetime import datetime
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

from app.models.media_task import TaskStatus
from app.tasks.media_tasks import (
    _generate_image_async,
    _generate_audio_async,
    _is_non_retryable_media_error,
    _mark_task_failed_async,
    _mark_task_retrying_async,
)


def _db_result(value):
    result = MagicMock()
    result.scalar_one_or_none.return_value = value
    return result


def _mock_session_with_execute_sequence(*results):
    session = AsyncMock()
    session.__aenter__ = AsyncMock(return_value=session)
    session.__aexit__ = AsyncMock(return_value=False)
    session.execute = AsyncMock(side_effect=[_db_result(value) for value in results])
    session.commit = AsyncMock()
    return session


def test_provider_prompt_refusals_are_non_retryable():
    error = RuntimeError("500: Image generation failed: Task failed: We're so sorry, but the prompt cannot be processed.")

    assert _is_non_retryable_media_error(error) is True


def test_invalid_audio_voice_errors_are_non_retryable():
    error = RuntimeError("Kie.ai task submission failed: Invalid voice parameter: abc123.")

    assert _is_non_retryable_media_error(error) is True


def test_provider_credit_errors_are_non_retryable():
    error = RuntimeError(
        "500: Video generation failed: Kie.ai task submission failed: "
        "Credits insufficient : Your current balance isn’t enough to run this request."
    )

    assert _is_non_retryable_media_error(error) is True


def test_prompt_length_errors_are_non_retryable():
    error = RuntimeError(
        "500: Image generation failed: Kie.ai task submission failed: prompt exceeds maximum length"
    )

    assert _is_non_retryable_media_error(error) is True


def test_transient_provider_errors_remain_retryable():
    assert _is_non_retryable_media_error(RuntimeError("temporary provider timeout")) is False


@pytest.mark.unit
@pytest.mark.asyncio
async def test_generate_image_async_keeps_task_non_terminal_on_exception():
    task = MagicMock()
    task.id = "task-1"
    task.status = TaskStatus.PENDING
    task.started_at = None
    task.completed_at = None
    task.result_data = None
    task.error_message = None

    user = SimpleNamespace(id="user-1")
    session = _mock_session_with_execute_sequence(task, user)
    gateway = MagicMock()
    gateway.generate_image = AsyncMock(side_effect=RuntimeError("transient provider error"))

    with patch("app.tasks.media_tasks.AsyncSessionLocal", return_value=session), \
         patch("app.tasks.media_tasks.write_media_debug_event", return_value="/tmp/image-debug.json"), \
         patch("app.tasks.media_tasks.LLMGateway", return_value=gateway):
        with pytest.raises(RuntimeError, match="transient provider error"):
            await _generate_image_async(
                "task-1",
                "user-1",
                {"model": "flux-2.0", "prompt": "hello world"},
            )

    assert task.status == TaskStatus.PROCESSING
    assert task.error_message is None
    assert task.completed_at is None
    assert task.result_data["failure"]["error"] == "transient provider error"
    assert task.result_data["failure"]["error_type"] == "RuntimeError"


@pytest.mark.unit
@pytest.mark.asyncio
async def test_generate_image_async_persists_provider_task_id_without_final_url():
    task = MagicMock()
    task.id = "task-image-submitted"
    task.status = TaskStatus.PENDING
    task.started_at = None
    task.completed_at = None
    task.result_data = None
    task.error_message = None
    task.task_id = None
    task.result_url = None

    user = SimpleNamespace(id="user-1")
    session = _mock_session_with_execute_sequence(task, user)
    gateway = MagicMock()
    gateway.generate_image = AsyncMock(return_value=SimpleNamespace(
        id="provider-image-123",
        data=[],
        credits_used=12,
        credits_balance=88,
        provider="kie_ai",
        dict=lambda: {
            "id": "provider-image-123",
            "data": [],
            "provider": "kie_ai",
        },
    ))

    with patch("app.tasks.media_tasks.AsyncSessionLocal", return_value=session), \
         patch("app.tasks.media_tasks.write_media_debug_event", return_value="/tmp/image-debug.json"), \
         patch("app.tasks.media_tasks.LLMGateway", return_value=gateway):
        result = await _generate_image_async(
            "task-image-submitted",
            "user-1",
            {"model": "nano-banana-2", "prompt": "hello world"},
        )

    assert result["status"] == "submitted"
    assert result["external_task_id"] == "provider-image-123"
    assert task.status == TaskStatus.PROCESSING
    assert task.task_id == "provider-image-123"
    assert task.result_url is None
    assert task.completed_at is None


@pytest.mark.unit
@pytest.mark.asyncio
async def test_generate_audio_async_persists_provider_task_id_without_final_url():
    task = MagicMock()
    task.id = "task-audio-submitted"
    task.status = TaskStatus.PENDING
    task.started_at = None
    task.completed_at = None
    task.result_data = None
    task.error_message = None
    task.task_id = None
    task.result_url = None

    user = SimpleNamespace(id="user-1")
    session = _mock_session_with_execute_sequence(task, user)
    gateway = MagicMock()
    gateway.generate_audio = AsyncMock(return_value=SimpleNamespace(
        id="provider-audio-123",
        data=[],
        metadata={},
        credits_used=5,
        credits_balance=95,
        provider="uvoice",
        dict=lambda: {
            "id": "provider-audio-123",
            "data": [],
            "provider": "uvoice",
        },
    ))

    with patch("app.tasks.media_tasks.AsyncSessionLocal", return_value=session), \
         patch("app.tasks.media_tasks.write_media_debug_event", return_value="/tmp/audio-debug.json"), \
         patch("app.tasks.media_tasks.LLMGateway", return_value=gateway):
        result = await _generate_audio_async(
            "task-audio-submitted",
            "user-1",
            {"model": "uvoice/tts-standard", "text": "hello world"},
        )

    assert result["status"] == "submitted"
    assert result["external_task_id"] == "provider-audio-123"
    assert task.status == TaskStatus.PROCESSING
    assert task.task_id == "provider-audio-123"
    assert task.result_url is None
    assert task.completed_at is None


@pytest.mark.unit
@pytest.mark.asyncio
async def test_mark_task_retrying_async_sets_pending_with_visible_retry_error():
    task = MagicMock()
    task.id = "task-2"
    task.status = TaskStatus.PROCESSING
    task.started_at = datetime.utcnow()
    task.completed_at = datetime.utcnow()
    task.error_message = "provider failed"
    task.result_data = {
        "failure": {"error": "provider failed"},
        "debug": {"trace_id": "trace-1"},
    }

    session = _mock_session_with_execute_sequence(task)

    with patch("app.tasks.media_tasks.AsyncSessionLocal", return_value=session):
        await _mark_task_retrying_async("task-2", RuntimeError("provider failed"), retry_after_seconds=60)

    assert task.status == TaskStatus.PENDING
    assert task.started_at is not None
    assert task.completed_at is None
    assert task.error_message == "Retry scheduled in 60s: provider failed"
    assert "failure" not in task.result_data
    assert task.result_data["retry"]["scheduled"] is True
    assert task.result_data["retry"]["retry_after_seconds"] == 60
    assert "next_retry_at" in task.result_data["retry"]
    assert task.result_data["retry"]["last_error"] == "provider failed"


@pytest.mark.unit
@pytest.mark.asyncio
async def test_mark_task_failed_async_sets_terminal_failure_and_clears_retry():
    task = MagicMock()
    task.id = "task-3"
    task.status = TaskStatus.PENDING
    task.started_at = None
    task.completed_at = None
    task.error_message = None
    task.result_data = {
        "retry": {"scheduled": True, "retry_after_seconds": 60},
        "debug": {"trace_id": "trace-2"},
    }

    session = _mock_session_with_execute_sequence(task)

    with patch("app.tasks.media_tasks.AsyncSessionLocal", return_value=session):
        await _mark_task_failed_async("task-3", RuntimeError("provider failed permanently"))

    assert task.status == TaskStatus.FAILED
    assert task.error_message == "provider failed permanently"
    assert task.completed_at is not None
    assert "retry" not in task.result_data
    assert task.result_data["failure"]["error"] == "provider failed permanently"
    assert task.result_data["failure"]["error_type"] == "RuntimeError"
