import pytest
import httpx
from unittest.mock import AsyncMock, patch

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
