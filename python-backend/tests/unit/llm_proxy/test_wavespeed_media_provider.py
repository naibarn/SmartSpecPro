from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock

import httpx
import pytest

from app.llm_proxy.providers.wavespeed_media_provider import (
    WAVESPEED_DEFAULT_RESULT_ENDPOINT_TEMPLATE,
    WAVESPEED_DEFAULT_SUBMIT_ENDPOINT,
    WAVESPEED_GPT_IMAGE_25_FLARE_EDIT_MODEL_ID,
    WAVESPEED_GPT_IMAGE_25_FLARE_MODEL_ID,
    WAVESPEED_GPT_IMAGE_25_MAX_REFERENCE_IMAGES,
    WAVESPEED_MINIMAX_H3_MODEL_IDS,
    WAVESPEED_SEEDANCE_2_FAST_IMAGE_TO_VIDEO_MODEL_ID,
    WAVESPEED_SEEDANCE_2_TEXT_TO_VIDEO_MODEL_ID,
    WaveSpeedError,
    WaveSpeedMediaProvider,
    normalize_relative_media_endpoint_path,
    normalize_wavespeed_base_url,
    normalize_wavespeed_poll_response,
)


def test_normalize_wavespeed_base_url_appends_api_root_once():
    assert normalize_wavespeed_base_url("https://api.wavespeed.ai") == "https://api.wavespeed.ai/api/v3"
    assert normalize_wavespeed_base_url("https://api.wavespeed.ai/api/v3") == "https://api.wavespeed.ai/api/v3"
    assert normalize_wavespeed_base_url("https://proxy.example.com/wavespeed") == "https://proxy.example.com/wavespeed/api/v3"
    with pytest.raises(WaveSpeedError, match="https"):
        normalize_wavespeed_base_url("http://api.wavespeed.ai")
    with pytest.raises(WaveSpeedError, match="public host"):
        normalize_wavespeed_base_url("https://127.0.0.1/api/v3")


def test_normalize_relative_media_endpoint_path_rejects_unsafe_values():
    with pytest.raises(WaveSpeedError, match="relative"):
        normalize_relative_media_endpoint_path("https://evil.example.com/submit")
    with pytest.raises(WaveSpeedError, match=r"\.\."):
        normalize_relative_media_endpoint_path("/predictions/../result")
    with pytest.raises(WaveSpeedError, match=r"\.\."):
        normalize_relative_media_endpoint_path("/predictions/%2e%2e/result")
    with pytest.raises(WaveSpeedError, match="relative"):
        normalize_relative_media_endpoint_path("%68%74%74%70%73%3A%2F%2Fevil.example.com/submit")
    with pytest.raises(WaveSpeedError, match="placeholder"):
        normalize_relative_media_endpoint_path("/predictions/{jobId}/result", allow_request_id_placeholder=True)


def test_build_submit_payload_maps_prompt_images_aspect_ratio_and_duration():
    payload = WaveSpeedMediaProvider.build_submit_payload(
        prompt="A cinematic waterfall",
        reference_image_urls=[
            "https://cdn.example.com/1.png",
            "https://cdn.example.com/2.png",
        ],
        aspect_ratio="16:9",
        duration=10,
    )

    assert payload == {
        "prompt": "A cinematic waterfall",
        "images": [
            "https://cdn.example.com/1.png",
            "https://cdn.example.com/2.png",
        ],
        "aspect_ratio": "16:9",
        "duration": 10,
    }


def test_build_submit_payload_rejects_more_than_four_images():
    with pytest.raises(WaveSpeedError, match="at most 4"):
        WaveSpeedMediaProvider.build_submit_payload(
            prompt="A cinematic waterfall",
            reference_image_urls=[
                "https://cdn.example.com/1.png",
                "https://cdn.example.com/2.png",
                "https://cdn.example.com/3.png",
                "https://cdn.example.com/4.png",
                "https://cdn.example.com/5.png",
            ],
            aspect_ratio="16:9",
            duration=10,
        )


def test_build_submit_payload_requires_reference_images_for_image_to_video_models():
    with pytest.raises(WaveSpeedError, match="require at least one reference image"):
        WaveSpeedMediaProvider.build_submit_payload(
            prompt="Animate this still",
            reference_image_urls=[],
            aspect_ratio="21:9",
            duration=5,
            provider_model_id=WAVESPEED_SEEDANCE_2_FAST_IMAGE_TO_VIDEO_MODEL_ID,
        )


def test_build_submit_payload_supports_extended_aspect_ratios_for_seedance_2_models():
    payload = WaveSpeedMediaProvider.build_submit_payload(
        prompt="A neon city at dusk",
        reference_image_urls=None,
        aspect_ratio="21:9",
        duration=15,
        provider_model_id=WAVESPEED_SEEDANCE_2_TEXT_TO_VIDEO_MODEL_ID,
        resolution="1080p",
    )

    assert payload == {
        "prompt": "A neon city at dusk",
        "aspect_ratio": "21:9",
        "duration": 15,
        "resolution": "1080p",
    }


def test_minimax_h3_reference_to_video_uses_multimodal_reference_keys_and_limits():
    payload = WaveSpeedMediaProvider.build_submit_payload(
        prompt="Use <Picture 1> and <Video 1> with <Audio 1>",
        reference_image_urls=["https://cdn.example.com/character.png"],
        reference_video_urls=["https://cdn.example.com/motion.mp4"],
        reference_audio_urls=["https://cdn.example.com/voice.mp3"],
        aspect_ratio="9:16",
        duration=5,
        resolution="768p",
        provider_model_id=WAVESPEED_MINIMAX_H3_MODEL_IDS["reference_to_video"],
    )

    assert payload == {
        "prompt": "Use <Picture 1> and <Video 1> with <Audio 1>",
        "reference_images": ["https://cdn.example.com/character.png"],
        "reference_videos": ["https://cdn.example.com/motion.mp4"],
        "reference_audios": ["https://cdn.example.com/voice.mp3"],
        "aspect_ratio": "9:16",
        "resolution": "768p",
        "duration": 5,
    }


def test_minimax_h3_image_and_lora_payloads_are_route_specific():
    image_payload = WaveSpeedMediaProvider.build_submit_payload(
        prompt="Animate the first frame",
        reference_image_urls=["https://cdn.example.com/start.png"],
        aspect_ratio="16:9",
        duration=5,
        resolution="480p",
        provider_model_id=WAVESPEED_MINIMAX_H3_MODEL_IDS["image_to_video_lora"],
        extra_params={
            "last_image": "https://cdn.example.com/end.png",
            "loras": [{"path": "https://cdn.example.com/style.safetensors", "scale": 0.8}],
        },
    )

    assert image_payload == {
        "prompt": "Animate the first frame",
        "image": "https://cdn.example.com/start.png",
        "last_image": "https://cdn.example.com/end.png",
        "resolution": "480p",
        "duration": 5,
        "loras": [{"path": "https://cdn.example.com/style.safetensors", "scale": 0.8}],
    }

    with pytest.raises(WaveSpeedError, match="at most 3 LoRA"):
        WaveSpeedMediaProvider.build_submit_payload(
            prompt="Generate a still",
            reference_image_urls=None,
            aspect_ratio="1:1",
            duration=5,
            resolution="1k",
            provider_model_id=WAVESPEED_MINIMAX_H3_MODEL_IDS["text_to_image_lora"],
            extra_params={"loras": [{"path": str(index)} for index in range(4)]},
        )


def test_build_image_submit_payload_includes_required_wavespeed_parameters_without_images():
    payload = WaveSpeedMediaProvider.build_image_submit_payload(
        prompt="A product photo on a white background",
        reference_image_urls=None,
        aspect_ratio="1:1",
        resolution="2k",
        quality="high",
        output_format="webp",
        submit_endpoint="/openai/gpt-image-2.5-flare/text-to-image",
    )

    assert payload == {
        "prompt": "A product photo on a white background",
        "aspect_ratio": "1:1",
        "resolution": "2k",
        "quality": "high",
        "output_format": "webp",
    }


def test_build_image_submit_payload_switches_to_edit_shape_and_caps_at_16_images():
    references = [f"https://cdn.example.com/{index}.png" for index in range(20)]
    payload = WaveSpeedMediaProvider.build_image_submit_payload(
        prompt="Replace the background",
        reference_image_urls=references[:WAVESPEED_GPT_IMAGE_25_MAX_REFERENCE_IMAGES],
        aspect_ratio="16:9",
        submit_endpoint="/openai/gpt-image-2.5-flare/edit",
    )

    assert payload["images"] == references[:WAVESPEED_GPT_IMAGE_25_MAX_REFERENCE_IMAGES]
    assert payload["resolution"] == "1k"
    assert payload["quality"] == "medium"
    assert payload["output_format"] == "png"

    with pytest.raises(WaveSpeedError, match="at most 16"):
        WaveSpeedMediaProvider.build_image_submit_payload(
            prompt="Replace the background",
            reference_image_urls=references,
            aspect_ratio="16:9",
            submit_endpoint=WAVESPEED_GPT_IMAGE_25_FLARE_EDIT_MODEL_ID,
        )


def test_build_image_submit_payload_requires_reference_for_edit_endpoint():
    with pytest.raises(WaveSpeedError, match="requires at least one reference image"):
        WaveSpeedMediaProvider.build_image_submit_payload(
            prompt="Edit this image",
            reference_image_urls=None,
            aspect_ratio="1:1",
            submit_endpoint=WAVESPEED_GPT_IMAGE_25_FLARE_EDIT_MODEL_ID,
        )


def test_gpt_image_model_specs_resolve_text_and_edit_ids_to_one_model():
    text_spec = WaveSpeedMediaProvider.get_model_spec(provider_model_id=WAVESPEED_GPT_IMAGE_25_FLARE_MODEL_ID)
    edit_spec = WaveSpeedMediaProvider.get_model_spec(provider_model_id=WAVESPEED_GPT_IMAGE_25_FLARE_EDIT_MODEL_ID)

    assert text_spec.model_id == WAVESPEED_GPT_IMAGE_25_FLARE_MODEL_ID
    assert edit_spec.model_id == WAVESPEED_GPT_IMAGE_25_FLARE_MODEL_ID
    assert text_spec.generate_type == "text-to-image"
    assert text_spec.max_reference_images == 16


def test_build_submission_record_stores_sanitized_request_summary_only():
    provider = WaveSpeedMediaProvider(api_key="test-key")
    try:
        submission = provider.build_submission_record(
            provider_task_id="pred-123",
            prompt="Sensitive prompt text",
            reference_image_urls=[
                "https://cdn.example.com/1.png",
                "https://cdn.example.com/2.png",
            ],
            aspect_ratio="9:16",
            duration=15,
            resolution="1080p",
            used_sync_mode=False,
        )
    finally:
        import asyncio
        asyncio.run(provider.aclose())

    assert submission["provider"] == "wavespeed_ai"
    assert submission["provider_model_id"] == WaveSpeedMediaProvider.LAUNCH_MODEL_ID
    assert submission["submit_endpoint"] == WAVESPEED_DEFAULT_SUBMIT_ENDPOINT
    assert submission["result_endpoint_template"] == WAVESPEED_DEFAULT_RESULT_ENDPOINT_TEMPLATE
    assert submission["used_sync_mode"] is False
    assert submission["request_summary"] == {
        "prompt_length": len("Sensitive prompt text"),
        "generate_type": "text-to-video",
        "has_reference_images": True,
        "reference_image_count": 2,
        "aspect_ratio": "9:16",
        "duration": 15,
        "requested_duration": 15,
        "requested_resolution": "1080p",
    }


@pytest.mark.parametrize(
    ("payload", "expected_state", "expected_status"),
    [
        ({"data": {"id": "pred-1", "status": "created"}}, "processing", "created"),
        ({"data": {"id": "pred-1", "status": "processing"}}, "processing", "processing"),
        (
            {"data": {"id": "pred-1", "status": "failed", "error": {"message": "quota exceeded"}}},
            "failure",
            "failed",
        ),
    ],
)
def test_normalize_wavespeed_poll_response_maps_upstream_statuses(payload, expected_state, expected_status):
    result = normalize_wavespeed_poll_response(payload)
    assert result.state == expected_state
    assert result.raw_status == expected_status


def test_normalize_wavespeed_poll_response_maps_completed_to_success_when_output_url_is_valid(monkeypatch):
    monkeypatch.setattr(
        "app.llm_proxy.providers.wavespeed_media_provider.validate_uri_strict",
        lambda url: url,
    )
    payload = {
        "data": {
            "id": "pred-1",
            "status": "completed",
            "outputs": ["https://storage.googleapis.com/wavespeed-tests/video.mp4"],
        }
    }

    result = normalize_wavespeed_poll_response(payload)

    assert result.state == "success"
    assert result.raw_status == "completed"
    assert result.result_url == "https://storage.googleapis.com/wavespeed-tests/video.mp4"


def test_normalize_wavespeed_poll_response_requires_outputs_not_urls_get():
    payload = {
        "data": {
            "id": "pred-1",
            "status": "completed",
            "urls": {"get": "https://api.wavespeed.ai/api/v3/predictions/pred-1/result"},
            "outputs": [],
        }
    }

    result = normalize_wavespeed_poll_response(payload)

    assert result.state == "failure"
    assert result.result_url is None
    assert "outputs[0]" in (result.error_message or "")


def test_normalize_wavespeed_poll_response_rejects_private_final_media_urls():
    payload = {
        "data": {
            "id": "pred-1",
            "status": "completed",
            "outputs": ["http://127.0.0.1/private.mp4"],
        }
    }

    result = normalize_wavespeed_poll_response(payload)

    assert result.state == "failure"
    assert "unsafe final media URL" in (result.error_message or "")


@pytest.mark.asyncio
async def test_create_prediction_posts_to_normalized_submit_endpoint():
    provider = WaveSpeedMediaProvider(api_key="test-key", base_url="https://api.wavespeed.ai")
    response = MagicMock()
    response.raise_for_status = MagicMock()
    response.json.return_value = {"data": {"id": "pred-123", "status": "created"}}
    provider.client.post = AsyncMock(return_value=response)

    try:
        await provider.create_prediction(
            prompt="A cinematic waterfall",
            reference_image_urls=["https://cdn.example.com/1.png"],
            aspect_ratio="16:9",
            duration=5,
        )
    finally:
        await provider.aclose()

    called_url = provider.client.post.await_args.args[0]
    called_json = provider.client.post.await_args.kwargs["json"]
    assert called_url == "https://api.wavespeed.ai/api/v3/wavespeed-ai/cinematic-video-generator"
    assert called_json["images"] == ["https://cdn.example.com/1.png"]
    assert called_json["duration"] == 5


@pytest.mark.asyncio
async def test_create_prediction_uses_model_specific_endpoint_for_seedance_2_fast_i2v():
    provider = WaveSpeedMediaProvider(
        api_key="test-key",
        provider_model_id=WAVESPEED_SEEDANCE_2_FAST_IMAGE_TO_VIDEO_MODEL_ID,
    )
    response = MagicMock()
    response.raise_for_status = MagicMock()
    response.json.return_value = {"data": {"id": "pred-456", "status": "created"}}
    provider.client.post = AsyncMock(return_value=response)

    try:
        await provider.create_prediction(
            prompt="Animate this portrait",
            reference_image_urls=["https://cdn.example.com/start.png"],
            aspect_ratio="21:9",
            duration=5,
            resolution="720p",
        )
    finally:
        await provider.aclose()

    called_url = provider.client.post.await_args.args[0]
    called_json = provider.client.post.await_args.kwargs["json"]
    assert called_url == "https://api.wavespeed.ai/api/v3/bytedance/seedance-2.0-fast/image-to-video"
    assert called_json == {
        "prompt": "Animate this portrait",
        "images": ["https://cdn.example.com/start.png"],
        "aspect_ratio": "21:9",
        "duration": 5,
        "resolution": "720p",
    }


@pytest.mark.asyncio
async def test_wait_for_completion_honors_retry_after_and_reaches_timeout_without_looping_forever(monkeypatch):
    provider = WaveSpeedMediaProvider(api_key="test-key")
    sleep_calls: list[int] = []

    async def fake_poll_prediction(_request_id: str):
        raise httpx.HTTPStatusError(
            "429 Too Many Requests",
            request=MagicMock(),
            response=httpx.Response(429, headers={"Retry-After": "20"}),
        )

    async def fake_sleep(delay: int):
        sleep_calls.append(delay)

    provider.poll_prediction = fake_poll_prediction  # type: ignore[method-assign]
    monkeypatch.setattr("app.llm_proxy.providers.wavespeed_media_provider.asyncio.sleep", fake_sleep)

    try:
        with pytest.raises(Exception, match="30 minutes"):
            await provider.wait_for_completion(request_id="pred-123")
    finally:
        await provider.aclose()

    assert sleep_calls
    assert sleep_calls[0] == 20
