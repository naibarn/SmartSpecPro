from __future__ import annotations

from app.tasks.media_tasks import (
    _build_magnific_submission_record,
    _get_magnific_poll_policy,
    _next_magnific_poll_delay,
)


def test_magnific_poll_policy_uses_image_video_and_upscaler_windows():
    assert _get_magnific_poll_policy("magnific/mystic")["timeout"] == 15 * 60
    assert _get_magnific_poll_policy("magnific/veo-3-1-text-to-video")["timeout"] == 60 * 60
    assert _get_magnific_poll_policy("magnific/video-upscaler-precision")["timeout"] == 90 * 60


def test_next_magnific_poll_delay_backs_off_and_caps_by_model_policy():
    assert _next_magnific_poll_delay("magnific/mystic") == 2
    assert _next_magnific_poll_delay("magnific/mystic", previous_delay=3) == 6
    assert _next_magnific_poll_delay("magnific/mystic", previous_delay=20) == 20
    assert _next_magnific_poll_delay("magnific/mystic", retry_after=120) == 20
    assert _next_magnific_poll_delay("magnific/video-upscaler-precision", previous_delay=60) == 90


def test_build_magnific_submission_record_persists_recovery_metadata_without_provider_urls():
    record = _build_magnific_submission_record(
        provider_task_id="provider-task-1",
        model_id="magnific/mystic",
        media_type="image",
        request_data={
            "prompt": "A luminous city",
            "negative_prompt": "blur",
            "resolution": "1K",
            "reference_image_urls": ["https://assets.example.com/input.png"],
            "extra_params": {
                "__reserved_credits": 20,
                "__reserved_resolution": "1K",
            },
        },
    )

    assert record["provider"] == "magnific"
    assert record["provider_model_id"] == "magnific/mystic"
    assert record["provider_task_id"] == "provider-task-1"
    assert record["submit_endpoint"] == "/v1/ai/mystic"
    assert record["status_endpoint"] == "/v1/ai/mystic/{taskId}"
    assert record["dispatch_mode"] == "async-polling"
    assert record["pricing_snapshot"] == {
        "reserved_credits": 20,
        "reserved_resolution": "1K",
        "reserved_duration": None,
    }
    assert record["sanitized_submission"] == {
        "prompt_length": 15,
        "has_negative_prompt": True,
        "reference_image_count": 1,
        "reference_video_count": 0,
        "resolution": "1K",
        "duration": None,
    }
    assert "https://assets.example.com/input.png" not in str(record)
