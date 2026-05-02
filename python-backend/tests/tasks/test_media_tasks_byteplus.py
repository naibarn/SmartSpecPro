"""
Tests for BytePlus polling integration in recover_stuck_tasks.
Tests _normalize_byteplus_task_state, _extract_byteplus_result_url,
and the BytePlus branch of _recover_stuck_tasks_async.
"""
import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from datetime import datetime, timezone, timedelta

from app.tasks.media_tasks import (
    _normalize_byteplus_task_state,
    _extract_byteplus_result_url,
    _build_audio_debug_request_snapshot,
    _extract_kie_failure_message,
    _normalize_kie_task_state,
)
from app.models.media_task import TaskStatus


# --- _normalize_byteplus_task_state ---

@pytest.mark.unit
@pytest.mark.parametrize("raw_status,expected_normalized,expected_raw", [
    ("succeeded", "success", "succeeded"),
    ("failed", "fail", "failed"),
    ("cancelled", "fail", "cancelled"),
    ("queued", "processing", "queued"),
    ("processing", "processing", "processing"),
    ("some_unknown_value", "unknown", "some_unknown_value"),
])
def test_normalize_byteplus_task_state(raw_status, expected_normalized, expected_raw):
    """_normalize_byteplus_task_state maps all known BytePlus status strings correctly."""
    response = {"id": "task-123", "status": raw_status}
    normalized, raw = _normalize_byteplus_task_state(response)
    assert normalized == expected_normalized
    assert raw == expected_raw


def test_normalize_byteplus_task_state_missing_status():
    """Returns 'unknown' when status key is absent."""
    normalized, raw = _normalize_byteplus_task_state({"id": "task-123"})
    assert normalized == "unknown"
    assert raw == ""


@pytest.mark.unit
def test_kie_failure_message_prefers_nested_error_over_top_level_success():
    """Kie can return msg=success while nested successFlag=3 contains the real failure."""
    response = {
        "code": 200,
        "msg": "success",
        "data": {
            "successFlag": 3,
            "errorCode": 400,
            "errorMessage": "The Google model was unable to generate audio for this request.",
        },
    }

    normalized, raw = _normalize_kie_task_state(response)

    assert normalized == "fail"
    assert raw == "successflag_3"
    assert _extract_kie_failure_message(response) == (
        "The Google model was unable to generate audio for this request."
    )


@pytest.mark.unit
def test_audio_debug_snapshot_recognizes_wavespeed_audio_payload():
    """WaveSpeed TTS debug snapshots should show the WaveSpeed URL and text key."""
    snapshot = _build_audio_debug_request_snapshot({
        "model": "alibaba/qwen3-tts-flash",
        "text": "OpenAI ออกอัปเดต Codex CLI รุ่นใหม่",
        "api_config": {
            "provider": "wavespeed_ai",
            "endpoint": "/alibaba/qwen3-tts-flash",
            "query_endpoint": "/predictions/{requestId}/result",
            "text_input_key": "text",
        },
        "extra_params": {
            "voice": "Cherry",
            "format": "mp3",
        },
    })

    assert snapshot["provider_hint"] == "wavespeed_ai"
    assert snapshot["api"]["request_url"] == "https://api.wavespeed.ai/api/v3/alibaba/qwen3-tts-flash"
    assert snapshot["api"]["request_payload"]["text"] == "OpenAI ออกอัปเดต Codex CLI รุ่นใหม่"
    assert snapshot["api"]["request_payload"]["voice"] == "Cherry"


# --- _extract_byteplus_result_url ---

@pytest.mark.unit
def test_extract_byteplus_result_url_video():
    """Returns URL from a video_url content item."""
    response = {
        "content": [
            {"type": "video_url", "video_url": {"url": "https://cdn.example.com/video.mp4"}}
        ]
    }
    url = _extract_byteplus_result_url(response)
    assert url == "https://cdn.example.com/video.mp4"


@pytest.mark.unit
def test_extract_byteplus_result_url_image():
    """Returns URL from an image_url content item."""
    response = {
        "content": [
            {"type": "image_url", "image_url": {"url": "https://cdn.example.com/image.png"}}
        ]
    }
    url = _extract_byteplus_result_url(response)
    assert url == "https://cdn.example.com/image.png"


@pytest.mark.unit
def test_extract_byteplus_result_url_empty_content():
    """Returns None when content array is empty."""
    url = _extract_byteplus_result_url({"content": []})
    assert url is None


@pytest.mark.unit
def test_extract_byteplus_result_url_no_content_key():
    """Returns None when content key is absent."""
    url = _extract_byteplus_result_url({"status": "succeeded"})
    assert url is None


@pytest.mark.unit
def test_extract_byteplus_result_url_non_http():
    """Returns None when URL does not start with 'http'."""
    response = {
        "content": [
            {"type": "video_url", "video_url": {"url": "ftp://cdn.example.com/video.mp4"}}
        ]
    }
    url = _extract_byteplus_result_url(response)
    assert url is None


@pytest.mark.unit
def test_extract_byteplus_result_url_unknown_type():
    """Returns None for unknown content item types."""
    response = {
        "content": [
            {"type": "unknown_type", "data": {"url": "https://cdn.example.com/file"}}
        ]
    }
    url = _extract_byteplus_result_url(response)
    assert url is None


# --- _recover_stuck_tasks_async integration (mocked) ---

BYTEPLUS_VIDEO_MODEL = "seedance-1-0-pro-250528"
KIE_AI_MODEL = "kling-2.6"
BYTEPLUS_PATCH = "app.llm_proxy.providers.byteplus_modelark_provider.BytePlusModelArkProvider"
GET_PROVIDER_KEY_PATCH = "app.services.media_provider_service.get_media_provider_key"


def _make_stuck_task(model: str, task_id: str = "ext-task-001", internal_id: int = 1) -> MagicMock:
    """Create a mock MediaTask in PROCESSING state."""
    task = MagicMock()
    task.id = internal_id
    task.task_id = task_id
    task.model = model
    task.status = TaskStatus.PROCESSING
    task.started_at = datetime.now(timezone.utc) - timedelta(minutes=10)
    task.result_url = None
    task.error_message = None
    task.result_data = None
    task.completed_at = None
    task.parameters = None
    return task


def _make_byteplus_class_mock(instance: MagicMock) -> MagicMock:
    """Create a mock BytePlusModelArkProvider class with real VIDEO_MODELS set."""
    from app.llm_proxy.providers.byteplus_modelark_provider import BytePlusModelArkProvider as Real
    cls = MagicMock()
    cls.VIDEO_MODELS = Real.VIDEO_MODELS
    cls.IMAGE_MODELS = Real.IMAGE_MODELS
    cls.return_value = instance
    return cls


def _make_byteplus_provider_mock(status_response: dict | None = None, raise_exc: Exception | None = None) -> MagicMock:
    """Create a mock BytePlusModelArkProvider instance."""
    provider = MagicMock()
    if raise_exc is not None:
        provider.get_task_status = AsyncMock(side_effect=raise_exc)
    else:
        provider.get_task_status = AsyncMock(return_value=status_response or {})
    provider.aclose = AsyncMock()
    return provider


async def _run_recover_async():
    """Import and run _recover_stuck_tasks_async."""
    from app.tasks.media_tasks import _recover_stuck_tasks_async
    return await _recover_stuck_tasks_async()


@pytest.fixture
def mock_db_session():
    """Mock AsyncSession that returns configurable stuck tasks."""
    session = AsyncMock()
    session.commit = AsyncMock()
    session.execute = AsyncMock()
    return session


def _setup_db_session(mock_session: MagicMock, tasks: list) -> None:
    """Configure mock DB session to return given tasks from stuck task query."""
    result_mock = MagicMock()
    result_mock.scalars.return_value.all.return_value = tasks
    mock_session.execute.return_value = result_mock


@pytest.mark.unit
@pytest.mark.asyncio
async def test_recover_stuck_tasks_dispatches_byteplus_for_seedance_model():
    """Tasks with a BytePlus VIDEO_MODEL are routed to BytePlusModelArkProvider."""
    task = _make_stuck_task(BYTEPLUS_VIDEO_MODEL)
    bp_provider = _make_byteplus_provider_mock(
        status_response={"status": "processing"}
    )
    bp_cls_mock = _make_byteplus_class_mock(bp_provider)

    with patch("app.tasks.media_tasks.AsyncSessionLocal") as mock_session_cls, \
         patch(BYTEPLUS_PATCH, new=bp_cls_mock), \
         patch(GET_PROVIDER_KEY_PATCH, new_callable=AsyncMock, return_value={"apiKey": "key", "baseUrl": None}):
        mock_session = AsyncMock()
        mock_session.__aenter__ = AsyncMock(return_value=mock_session)
        mock_session.__aexit__ = AsyncMock(return_value=False)
        _setup_db_session(mock_session, [task])
        mock_session_cls.return_value = mock_session
        await _run_recover_async()

    bp_provider.get_task_status.assert_awaited_once_with(task.task_id)
    bp_provider.aclose.assert_awaited_once()


@pytest.mark.unit
@pytest.mark.asyncio
async def test_recover_stuck_tasks_dispatches_kieai_for_non_byteplus_model():
    """Tasks with a non-BytePlus model use the Kie.ai path — BytePlus provider not called."""
    task = _make_stuck_task(KIE_AI_MODEL)
    bp_cls_mock = _make_byteplus_class_mock(MagicMock())

    kie_provider = MagicMock()
    kie_provider.get_task_status = AsyncMock(return_value={"status": "processing"})

    with patch("app.tasks.media_tasks.AsyncSessionLocal") as mock_session_cls, \
         patch(BYTEPLUS_PATCH, new=bp_cls_mock), \
         patch("app.llm_proxy.providers.kie_ai_provider.KieAIProvider", return_value=kie_provider), \
         patch(GET_PROVIDER_KEY_PATCH, new_callable=AsyncMock, return_value={"apiKey": "kie-key", "baseUrl": None}):
        mock_session = AsyncMock()
        mock_session.__aenter__ = AsyncMock(return_value=mock_session)
        mock_session.__aexit__ = AsyncMock(return_value=False)
        _setup_db_session(mock_session, [task])
        mock_session_cls.return_value = mock_session
        await _run_recover_async()

    # BytePlus class was never instantiated
    bp_cls_mock.assert_not_called()
    # Kie.ai provider was called
    kie_provider.get_task_status.assert_awaited_once()


@pytest.mark.unit
@pytest.mark.asyncio
async def test_recover_stuck_tasks_completed_on_byteplus_succeeded():
    """Task is marked COMPLETED when BytePlus status is 'succeeded' and URL is extracted."""
    task = _make_stuck_task(BYTEPLUS_VIDEO_MODEL)
    status_response = {
        "status": "succeeded",
        "content": [{"type": "video_url", "video_url": {"url": "https://cdn.example.com/output.mp4"}}],
    }
    bp_provider = _make_byteplus_provider_mock(status_response=status_response)
    bp_cls_mock = _make_byteplus_class_mock(bp_provider)

    with patch("app.tasks.media_tasks.AsyncSessionLocal") as mock_session_cls, \
         patch(BYTEPLUS_PATCH, new=bp_cls_mock), \
         patch(GET_PROVIDER_KEY_PATCH, new_callable=AsyncMock, return_value={"apiKey": "key", "baseUrl": None}):
        mock_session = AsyncMock()
        mock_session.__aenter__ = AsyncMock(return_value=mock_session)
        mock_session.__aexit__ = AsyncMock(return_value=False)
        _setup_db_session(mock_session, [task])
        mock_session_cls.return_value = mock_session
        await _run_recover_async()

    assert task.status == TaskStatus.COMPLETED
    assert task.result_url == "https://cdn.example.com/output.mp4"
    assert task.completed_at is not None


@pytest.mark.unit
@pytest.mark.asyncio
async def test_recover_stuck_tasks_failed_on_byteplus_failed():
    """Task is marked FAILED when BytePlus status is 'failed'."""
    task = _make_stuck_task(BYTEPLUS_VIDEO_MODEL)
    status_response = {
        "status": "failed",
        "error": {"message": "Quota exceeded"},
    }
    bp_provider = _make_byteplus_provider_mock(status_response=status_response)
    bp_cls_mock = _make_byteplus_class_mock(bp_provider)

    with patch("app.tasks.media_tasks.AsyncSessionLocal") as mock_session_cls, \
         patch(BYTEPLUS_PATCH, new=bp_cls_mock), \
         patch(GET_PROVIDER_KEY_PATCH, new_callable=AsyncMock, return_value={"apiKey": "key", "baseUrl": None}):
        mock_session = AsyncMock()
        mock_session.__aenter__ = AsyncMock(return_value=mock_session)
        mock_session.__aexit__ = AsyncMock(return_value=False)
        _setup_db_session(mock_session, [task])
        mock_session_cls.return_value = mock_session
        await _run_recover_async()

    assert task.status == TaskStatus.FAILED
    assert task.error_message is not None
    assert "Quota exceeded" in task.error_message


@pytest.mark.unit
@pytest.mark.asyncio
async def test_recover_stuck_tasks_failed_on_byteplus_cancelled():
    """Task is marked FAILED when BytePlus status is 'cancelled'."""
    task = _make_stuck_task(BYTEPLUS_VIDEO_MODEL)
    status_response = {"status": "cancelled"}
    bp_provider = _make_byteplus_provider_mock(status_response=status_response)
    bp_cls_mock = _make_byteplus_class_mock(bp_provider)

    with patch("app.tasks.media_tasks.AsyncSessionLocal") as mock_session_cls, \
         patch(BYTEPLUS_PATCH, new=bp_cls_mock), \
         patch(GET_PROVIDER_KEY_PATCH, new_callable=AsyncMock, return_value={"apiKey": "key", "baseUrl": None}):
        mock_session = AsyncMock()
        mock_session.__aenter__ = AsyncMock(return_value=mock_session)
        mock_session.__aexit__ = AsyncMock(return_value=False)
        _setup_db_session(mock_session, [task])
        mock_session_cls.return_value = mock_session
        await _run_recover_async()

    assert task.status == TaskStatus.FAILED
    assert task.completed_at is not None


@pytest.mark.unit
@pytest.mark.asyncio
async def test_recover_stuck_tasks_no_change_on_byteplus_processing():
    """Task remains PROCESSING when BytePlus status is 'queued'."""
    task = _make_stuck_task(BYTEPLUS_VIDEO_MODEL)
    bp_provider = _make_byteplus_provider_mock(status_response={"status": "queued"})
    bp_cls_mock = _make_byteplus_class_mock(bp_provider)

    with patch("app.tasks.media_tasks.AsyncSessionLocal") as mock_session_cls, \
         patch(BYTEPLUS_PATCH, new=bp_cls_mock), \
         patch(GET_PROVIDER_KEY_PATCH, new_callable=AsyncMock, return_value={"apiKey": "key", "baseUrl": None}):
        mock_session = AsyncMock()
        mock_session.__aenter__ = AsyncMock(return_value=mock_session)
        mock_session.__aexit__ = AsyncMock(return_value=False)
        _setup_db_session(mock_session, [task])
        mock_session_cls.return_value = mock_session
        await _run_recover_async()

    assert task.status == TaskStatus.PROCESSING
    assert task.completed_at is None


@pytest.mark.unit
@pytest.mark.asyncio
async def test_recover_stuck_tasks_skip_when_byteplus_not_configured():
    """When get_media_provider_key('byteplus_modelark') returns None, task is skipped."""
    task = _make_stuck_task(BYTEPLUS_VIDEO_MODEL)
    bp_provider = _make_byteplus_provider_mock()
    bp_cls_mock = _make_byteplus_class_mock(bp_provider)

    with patch("app.tasks.media_tasks.AsyncSessionLocal") as mock_session_cls, \
         patch(BYTEPLUS_PATCH, new=bp_cls_mock), \
         patch(GET_PROVIDER_KEY_PATCH, new_callable=AsyncMock, return_value=None):
        mock_session = AsyncMock()
        mock_session.__aenter__ = AsyncMock(return_value=mock_session)
        mock_session.__aexit__ = AsyncMock(return_value=False)
        _setup_db_session(mock_session, [task])
        mock_session_cls.return_value = mock_session
        await _run_recover_async()

    # Provider was never called
    bp_provider.get_task_status.assert_not_awaited()
    # Task remains unchanged
    assert task.status == TaskStatus.PROCESSING


@pytest.mark.unit
@pytest.mark.asyncio
async def test_recover_stuck_tasks_no_fail_on_byteplus_429():
    """HTTP 429 from BytePlus does NOT mark the task as FAILED — task stays PROCESSING."""
    import httpx
    task = _make_stuck_task(BYTEPLUS_VIDEO_MODEL)
    mock_response = MagicMock()
    mock_response.status_code = 429
    exc = httpx.HTTPStatusError("rate limited", request=MagicMock(), response=mock_response)
    bp_provider = _make_byteplus_provider_mock(raise_exc=exc)
    bp_cls_mock = _make_byteplus_class_mock(bp_provider)

    with patch("app.tasks.media_tasks.AsyncSessionLocal") as mock_session_cls, \
         patch(BYTEPLUS_PATCH, new=bp_cls_mock), \
         patch(GET_PROVIDER_KEY_PATCH, new_callable=AsyncMock, return_value={"apiKey": "key", "baseUrl": None}):
        mock_session = AsyncMock()
        mock_session.__aenter__ = AsyncMock(return_value=mock_session)
        mock_session.__aexit__ = AsyncMock(return_value=False)
        _setup_db_session(mock_session, [task])
        mock_session_cls.return_value = mock_session
        await _run_recover_async()

    assert task.status == TaskStatus.PROCESSING


@pytest.mark.unit
@pytest.mark.asyncio
async def test_recover_stuck_tasks_aclose_called_after_byteplus_check():
    """BytePlusModelArkProvider.aclose() is called even when get_task_status raises."""
    task = _make_stuck_task(BYTEPLUS_VIDEO_MODEL)
    bp_provider = _make_byteplus_provider_mock(raise_exc=RuntimeError("network error"))
    bp_cls_mock = _make_byteplus_class_mock(bp_provider)

    with patch("app.tasks.media_tasks.AsyncSessionLocal") as mock_session_cls, \
         patch(BYTEPLUS_PATCH, new=bp_cls_mock), \
         patch(GET_PROVIDER_KEY_PATCH, new_callable=AsyncMock, return_value={"apiKey": "key", "baseUrl": None}):
        mock_session = AsyncMock()
        mock_session.__aenter__ = AsyncMock(return_value=mock_session)
        mock_session.__aexit__ = AsyncMock(return_value=False)
        _setup_db_session(mock_session, [task])
        mock_session_cls.return_value = mock_session
        await _run_recover_async()

    bp_provider.aclose.assert_awaited_once()
