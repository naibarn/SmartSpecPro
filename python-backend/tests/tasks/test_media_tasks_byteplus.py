"""
Tests for BytePlus response parsing and the Feature 186 media recovery boundary.
"""
from unittest.mock import patch

import pytest

from app.tasks.media_tasks import (
    _build_audio_debug_request_snapshot,
    _extract_byteplus_result_url,
    _extract_kie_failure_message,
    _normalize_byteplus_task_state,
    _normalize_kie_task_state,
)

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
    # Detailed provider error fields take precedence over the coarse flag.
    assert raw == "provider_error"
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


@pytest.mark.unit
@pytest.mark.asyncio
async def test_legacy_stuck_task_recovery_defers_to_canonical_control_plane():
    """The legacy janitor must not query media rows after the hard cutover."""
    from app.tasks.media_tasks import _recover_stuck_tasks_async

    with patch("app.tasks.media_tasks.AsyncSessionLocal") as session_factory:
        result = await _recover_stuck_tasks_async()

    assert result == {"status": "skipped", "reason": "feature_186_hard_cutover"}
    session_factory.assert_not_called()
