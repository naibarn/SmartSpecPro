from unittest.mock import AsyncMock, patch

import httpx
import pytest

from app.llm_proxy.providers.kie_ai_provider import (
    KieAIProvider,
    get_model_resolution_stats,
    reset_model_resolution_stats,
    resolve_api_model,
)


def test_resolve_api_model_prefers_config_kie_model_id_variants():
    reset_model_resolution_stats()

    assert resolve_api_model("google-banana-2", {"kie_model_id": "nano-banana-2"}) == "nano-banana-2"
    assert resolve_api_model("google-banana-2", {"kieModelId": "nano-banana-2"}) == "nano-banana-2"

    stats = get_model_resolution_stats()
    assert stats["explicit_api_model"] == 2


def test_resolve_api_model_maps_veo_internal_route_aliases_to_kie_models():
    reset_model_resolution_stats()

    assert resolve_api_model("veo3/generate-veo-3-video-fast") == "veo3_fast"
    assert resolve_api_model("veo3/generate-veo-3-video") == "veo3"

    stats = get_model_resolution_stats()
    assert stats["fallback_alias_map"] == 2


def test_resolve_api_model_maps_happyhorse_alias_to_kie_model():
    reset_model_resolution_stats()

    assert resolve_api_model("happyhorse") == "happyhorse/text-to-video"

    stats = get_model_resolution_stats()
    assert stats["fallback_alias_map"] == 1


def test_resolve_api_model_maps_gemini_omni_alias_to_kie_model():
    reset_model_resolution_stats()

    assert resolve_api_model("gemini-omni") == "gemini-omni-video"
    assert resolve_api_model("gemini_omni_video") == "gemini-omni-video"

    stats = get_model_resolution_stats()
    assert stats["fallback_alias_map"] == 2


@pytest.mark.asyncio
async def test_generate_image_uses_db_model_id_and_endpoint_aliases():
    reset_model_resolution_stats()

    provider = KieAIProvider(api_key="test-key")
    provider.wait_for_task = AsyncMock(return_value={"id": "task-1", "data": []})
    provider._make_request = AsyncMock(return_value={"data": {"taskId": "task-1"}})

    await provider.generate_image(
        model="legacy-model-alias",
        prompt="test prompt",
        callback_url="",
        api_config={
            "kieModelId": "nano-banana-2",
            "apiEndpoint": "/api/v1/veo/generate",
        },
    )

    provider._make_request.assert_awaited_once()
    args, kwargs = provider._make_request.await_args
    assert args[0] == "POST"
    assert args[1] == "veo/generate"
    assert kwargs["data"]["model"] == "nano-banana-2"


@pytest.mark.asyncio
async def test_generate_image_uses_reference_image_config_metadata_for_array_fields():
    provider = KieAIProvider(api_key="test-key")
    provider.wait_for_task = AsyncMock(return_value={"id": "task-1", "data": []})
    provider.create_task = AsyncMock(return_value={"data": {"taskId": "task-1"}})

    await provider.generate_image(
        model="google-banana-2",
        prompt="test prompt",
        callback_url="",
        reference_image_urls=["https://cdn.example.com/ref.png"],
        api_config={
            "provider": "kie.ai",
            "reference_image_input_key": "reference_image",
            "reference_image_input_type": "array",
        },
    )

    provider.create_task.assert_awaited_once()
    args, kwargs = provider.create_task.await_args
    assert kwargs == {}
    assert args[0] == "nano-banana-2"
    assert args[1]["reference_image"] == ["https://cdn.example.com/ref.png"]


@pytest.mark.asyncio
async def test_generate_image_uses_reference_image_config_metadata_for_url_fields():
    provider = KieAIProvider(api_key="test-key")
    provider.wait_for_task = AsyncMock(return_value={"id": "task-1", "data": []})
    provider.create_task = AsyncMock(return_value={"data": {"taskId": "task-1"}})

    await provider.generate_image(
        model="google-banana-2",
        prompt="test prompt",
        callback_url="",
        reference_image_urls=["https://cdn.example.com/ref.png"],
        api_config={
            "provider": "kie.ai",
            "reference_image_input_key": "reference_image",
            "reference_image_input_type": "url",
        },
    )

    provider.create_task.assert_awaited_once()
    args, kwargs = provider.create_task.await_args
    assert kwargs == {}
    assert args[1]["reference_image"] == "https://cdn.example.com/ref.png"


@pytest.mark.asyncio
async def test_generate_image_omits_internal_metadata_extra_params_from_provider_payload():
    provider = KieAIProvider(api_key="test-key")
    provider.wait_for_task = AsyncMock(return_value={"id": "task-1", "data": []})
    provider.create_task = AsyncMock(return_value={"data": {"taskId": "task-1"}})

    await provider.generate_image(
        model="google-banana-2",
        prompt="test prompt",
        callback_url="",
        resolution="4K",
        output_format="jpg",
        extra_params={
            "google_search": False,
            "marketplaceContext": {
                "platform": "shopee",
                "productName": "Nordic bedside table",
            },
            "__reserved_credits": 90,
            "__origin_surface": "media_studio",
        },
    )

    provider.create_task.assert_awaited_once()
    args, _ = provider.create_task.await_args
    payload = args[1]
    assert payload["google_search"] is False
    assert payload["resolution"] == "4K"
    assert payload["output_format"] == "jpg"
    assert "marketplaceContext" not in payload
    assert "__reserved_credits" not in payload
    assert "__origin_surface" not in payload


@pytest.mark.asyncio
async def test_generate_video_uses_db_kie_model_id_for_provider_payload():
    reset_model_resolution_stats()

    provider = KieAIProvider(api_key="test-key")
    provider.wait_for_task = AsyncMock(return_value={"id": "task-1", "data": []})
    provider._make_request = AsyncMock(return_value={"data": {"taskId": "task-1"}})

    await provider.generate_video(
        model="veo-3-1",
        prompt="test prompt",
        callback_url="",
        api_config={
            "kie_model_id": "veo3_fast",
            "endpoint": "/api/v1/veo/generate",
        },
    )

    provider._make_request.assert_awaited_once()
    args, kwargs = provider._make_request.await_args
    assert args[0] == "POST"
    assert args[1] == "veo/generate"
    assert kwargs["data"]["model"] == "veo3_fast"


@pytest.mark.asyncio
async def test_generate_video_uses_veo_extend_endpoint_and_task_id_payload():
    provider = KieAIProvider(api_key="test-key")
    provider._make_request = AsyncMock(return_value={"data": {"taskId": "veo_extend_task_xyz"}})

    result = await provider.generate_video(
        model="veo3/extend-video",
        prompt="Continue the presenter segment with the same studio and tone.",
        wait_for_completion=False,
        api_config={
            "endpoint": "/api/v1/veo/extend",
            "payload_format": "veo_extend",
            "generate_type": "video-extend",
            "extend_model": "fast",
        },
        extra_params={
            "source_task_id": "veo_task_abcdef123456",
            "seeds": 12345,
            "watermark": "MyBrand",
            "aspect_ratio": "9:16",
        },
    )

    provider._make_request.assert_awaited_once()
    args, kwargs = provider._make_request.await_args
    assert args[0] == "POST"
    assert args[1] == "veo/extend"
    assert kwargs["data"] == {
        "taskId": "veo_task_abcdef123456",
        "prompt": "Continue the presenter segment with the same studio and tone.",
        "model": "fast",
        "seeds": 12345,
        "watermark": "MyBrand",
    }
    assert result["id"] == "veo_extend_task_xyz"


@pytest.mark.asyncio
async def test_generate_video_veo_extend_requires_source_task_id():
    provider = KieAIProvider(api_key="test-key")
    provider._make_request = AsyncMock()

    with pytest.raises(Exception, match="requires the original Kie taskId"):
        await provider.generate_video(
            model="veo3/extend-video",
            prompt="Extend this video.",
            wait_for_completion=False,
            api_config={
                "endpoint": "/api/v1/veo/extend",
                "payload_format": "veo_extend",
                "generate_type": "video-extend",
            },
            extra_params={
                "video_urls": ["https://cdn.example.com/video.mp4"],
            },
        )

    provider._make_request.assert_not_called()


@pytest.mark.asyncio
async def test_generate_video_normalizes_veo_auto_aspect_ratio_to_kie_enum():
    provider = KieAIProvider(api_key="test-key")
    provider._make_request = AsyncMock(return_value={"data": {"taskId": "task-auto"}})

    await provider.generate_video(
        model="veo3/generate-veo-3-video-lite",
        prompt="test prompt",
        wait_for_completion=False,
        aspect_ratio="auto",
        api_config={
            "kie_model_id": "veo3_lite",
            "endpoint": "/api/v1/veo/generate",
        },
        extra_params={
            "generationType": "TEXT_2_VIDEO",
            "aspect_ratio": "auto",
        },
    )

    provider._make_request.assert_awaited_once()
    _, kwargs = provider._make_request.await_args
    assert kwargs["data"]["aspect_ratio"] == "Auto"
    assert "aspectRatio" not in kwargs["data"]


@pytest.mark.asyncio
async def test_generate_video_normalizes_reference_mode_auto_ratio_to_supported_ratio():
    provider = KieAIProvider(api_key="test-key")
    provider._make_request = AsyncMock(return_value={"data": {"taskId": "task-ref"}})

    await provider.generate_video(
        model="veo3/generate-veo-3-video-fast",
        prompt="test prompt",
        wait_for_completion=False,
        aspect_ratio="auto",
        api_config={
            "kie_model_id": "veo3_fast",
            "endpoint": "/api/v1/veo/generate",
        },
        extra_params={
            "generationType": "REFERENCE_2_VIDEO",
            "aspectRatio": "auto",
        },
    )

    provider._make_request.assert_awaited_once()
    _, kwargs = provider._make_request.await_args
    assert kwargs["data"]["aspect_ratio"] == "16:9"
    assert "aspectRatio" not in kwargs["data"]


@pytest.mark.asyncio
async def test_generate_video_veo_reference_mode_uses_image_urls_as_material_references():
    provider = KieAIProvider(api_key="test-key")
    provider._make_request = AsyncMock(return_value={"data": {"taskId": "task-ref-images"}})

    await provider.generate_video(
        model="veo3/generate-veo-3-video-fast",
        prompt="Use the attached product as visual reference, not as a start frame.",
        wait_for_completion=False,
        aspect_ratio="9:16",
        reference_image_urls=["https://cdn.example.com/ref.png"],
        api_config={
            "kie_model_id": "veo3_fast",
            "endpoint": "/api/v1/veo/generate",
            "reference_image_input_key": "image_urls",
        },
        extra_params={
            "generationType": "REFERENCE_2_VIDEO",
            "imageUrls": ["https://cdn.example.com/ref.png"],
            "enableFallback": False,
        },
    )

    provider._make_request.assert_awaited_once()
    _, kwargs = provider._make_request.await_args
    assert kwargs["data"]["generationType"] == "REFERENCE_2_VIDEO"
    assert kwargs["data"]["imageUrls"] == ["https://cdn.example.com/ref.png"]
    assert "image_urls" not in kwargs["data"]
    assert kwargs["data"]["enableFallback"] is False


@pytest.mark.asyncio
async def test_create_task_receives_happyhorse_video_edit_singular_video_url():
    provider = KieAIProvider(api_key="test-key")
    provider.create_task = AsyncMock(return_value={"data": {"taskId": "task-happyhorse-edit"}})

    await provider.generate_video(
        model="happyhorse/video-edit",
        prompt="Make the jacket red.",
        wait_for_completion=False,
        api_config={
            "kie_model_id": "happyhorse/video-edit",
            "reference_video_input_key": "video_url",
            "reference_video_input_type": "url",
        },
        extra_params={
            "video_url": ["https://cdn.example.com/source.mp4"],
            "audio_setting": "auto",
        },
    )

    provider.create_task.assert_awaited_once()
    args, kwargs = provider.create_task.await_args
    assert kwargs == {}
    assert args[0] == "happyhorse/video-edit"
    assert args[1]["video_url"] == "https://cdn.example.com/source.mp4"
    assert args[1]["audio_setting"] == "auto"


@pytest.mark.asyncio
async def test_generate_video_can_omit_default_duration_and_aspect_ratio_from_market_payload():
    provider = KieAIProvider(api_key="test-key")
    provider.create_task = AsyncMock(return_value={"data": {"taskId": "task-happyhorse-edit"}})

    await provider.generate_video(
        model="happyhorse/video-edit",
        prompt="Make the jacket red.",
        wait_for_completion=False,
        api_config={
            "kie_model_id": "happyhorse/video-edit",
            "reference_video_input_key": "video_url",
            "reference_video_input_type": "url",
            "omit_duration": "true",
            "omit_aspect_ratio": "true",
        },
        extra_params={
            "video_url": ["https://cdn.example.com/source.mp4"],
        },
    )

    args, _ = provider.create_task.await_args
    assert "duration" not in args[1]
    assert "aspect_ratio" not in args[1]


@pytest.mark.asyncio
async def test_generate_video_builds_gemini_omni_video_list_objects():
    provider = KieAIProvider(api_key="test-key")
    provider.create_task = AsyncMock(return_value={"data": {"taskId": "task-gemini-omni"}})

    await provider.generate_video(
        model="gemini-omni-video",
        prompt="Transform this product clip into a cinematic launch video.",
        wait_for_completion=False,
        duration=6,
        aspect_ratio="9:16",
        reference_image_urls=["https://cdn.example.com/ref.png"],
        reference_video_urls=["https://cdn.example.com/source.mp4"],
        api_config={
            "kie_model_id": "gemini-omni-video",
            "reference_image_input_key": "image_urls",
            "reference_image_input_type": "array",
            "reference_video_input_key": "video_list",
            "reference_video_input_type": "object_array",
        },
        extra_params={
            "audio_ids": ["audio_01hx8p0demo"],
            "seed": 123,
        },
    )

    provider.create_task.assert_awaited_once()
    args, kwargs = provider.create_task.await_args
    assert kwargs == {}
    assert args[0] == "gemini-omni-video"
    assert args[1]["image_urls"] == ["https://cdn.example.com/ref.png"]
    assert args[1]["video_list"] == [{"url": "https://cdn.example.com/source.mp4"}]
    assert args[1]["audio_ids"] == ["audio_01hx8p0demo"]
    assert args[1]["duration"] == 6
    assert args[1]["aspect_ratio"] == "9:16"


@pytest.mark.asyncio
async def test_generate_video_preserves_gemini_omni_video_list_trim_fields():
    provider = KieAIProvider(api_key="test-key")
    provider.create_task = AsyncMock(return_value={"data": {"taskId": "task-gemini-omni"}})

    await provider.generate_video(
        model="gemini-omni-video",
        prompt="Use only the opening movement.",
        wait_for_completion=False,
        api_config={
            "kie_model_id": "gemini-omni-video",
            "reference_video_input_key": "video_list",
            "reference_video_input_type": "object_array",
        },
        extra_params={
            "video_list": [
                {
                    "video_url": "https://cdn.example.com/source.mp4",
                    "start": 1,
                    "end": 7,
                },
            ],
        },
    )

    args, _ = provider.create_task.await_args
    assert args[1]["video_list"] == [
        {"url": "https://cdn.example.com/source.mp4", "start": 1, "ends": 7}
    ]


@pytest.mark.asyncio
async def test_generate_image_retries_retryable_submission_response_until_task_id_available():
    provider = KieAIProvider(api_key="test-key")
    provider.wait_for_task = AsyncMock(return_value={"id": "task-2", "data": [{"url": "https://cdn.example.com/r.png"}]})
    provider._make_request = AsyncMock(side_effect=[
        {"code": 500, "msg": "Server exception, please try again later or contact customer service", "data": None},
        {"data": {"taskId": "task-2"}},
    ])

    with patch("app.llm_proxy.providers.kie_ai_provider.asyncio.sleep", new=AsyncMock()) as sleep_mock:
        result = await provider.generate_image(
            model="legacy-model-alias",
            prompt="test prompt",
            callback_url="",
            api_config={"apiEndpoint": "/api/v1/veo/generate"},
        )

    assert provider._make_request.await_count == 2
    sleep_mock.assert_awaited_once_with(1.0)
    provider.wait_for_task.assert_awaited_once_with("task-2")
    assert result["id"] == "task-2"


@pytest.mark.asyncio
async def test_generate_image_retries_retryable_http_status_error_before_task_id_available():
    provider = KieAIProvider(api_key="test-key")
    provider.wait_for_task = AsyncMock(return_value={"id": "task-3", "data": [{"url": "https://cdn.example.com/r.png"}]})

    request = httpx.Request("POST", "https://api.kie.ai/api/v1/jobs/createTask")
    response = httpx.Response(
        500,
        request=request,
        json={"msg": "Server exception, please try again later or contact customer service"},
    )
    http_error = httpx.HTTPStatusError("Server error", request=request, response=response)

    provider._make_request = AsyncMock(side_effect=[
        http_error,
        {"data": {"taskId": "task-3"}},
    ])

    with patch("app.llm_proxy.providers.kie_ai_provider.asyncio.sleep", new=AsyncMock()) as sleep_mock:
        result = await provider.generate_image(
            model="legacy-model-alias",
            prompt="test prompt",
            callback_url="",
            api_config={"apiEndpoint": "/api/v1/veo/generate"},
        )

    assert provider._make_request.await_count == 2
    sleep_mock.assert_awaited_once_with(1.0)
    provider.wait_for_task.assert_awaited_once_with("task-3")
    assert result["id"] == "task-3"


@pytest.mark.asyncio
async def test_generate_image_raises_clean_error_after_retryable_submission_exhausted():
    provider = KieAIProvider(api_key="test-key")
    provider.wait_for_task = AsyncMock()
    provider._make_request = AsyncMock(return_value={
        "code": 500,
        "msg": "Server exception, please try again later or contact customer service",
        "data": None,
    })

    with patch("app.llm_proxy.providers.kie_ai_provider.asyncio.sleep", new=AsyncMock()):
        with pytest.raises(Exception, match="Kie.ai task submission failed: Server exception"):
            await provider.generate_image(
                model="legacy-model-alias",
                prompt="test prompt",
                callback_url="",
                api_config={"apiEndpoint": "/api/v1/veo/generate"},
            )

    assert provider._make_request.await_count == 3
    provider.wait_for_task.assert_not_called()
