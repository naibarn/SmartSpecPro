import asyncio
import base64
import io
from unittest.mock import AsyncMock, patch
from urllib.parse import quote_from_bytes

import httpx
import pytest
from PIL import Image

from app.llm_proxy.providers.kie_ai_provider import (
    KieAIProvider,
    _clean_endpoint,
    _redact_url_for_log,
    _reference_download_error,
    _reference_url_is_private_target,
    get_model_resolution_stats,
    reset_model_resolution_stats,
    resolve_api_model,
    resolve_grok_image_2_operation,
)


def _valid_webp_bytes() -> bytes:
    output = io.BytesIO()
    Image.new("RGBA", (2, 2), (20, 40, 60, 255)).save(output, format="WEBP")
    return output.getvalue()


def test_reference_url_logging_redacts_protected_path_tokens_and_query():
    protected = "https://smartaihub.app/api/mcp/downloads/signed-secret/reference.png?token=secret"

    redacted = _redact_url_for_log(protected)

    assert redacted == "https://smartaihub.app/api/mcp/downloads/[redacted]"
    assert "signed-secret" not in redacted
    assert "token=secret" not in redacted


def test_reference_url_logging_redacts_fragments_on_public_urls():
    redacted = _redact_url_for_log("https://cdn.example.com/reference.png#signed-fragment")

    assert redacted == "https://cdn.example.com/reference.png#[redacted]"
    assert "signed-fragment" not in redacted


def test_managed_path_does_not_bypass_private_target_block():
    assert _reference_url_is_private_target(
        "http://127.0.0.1/api/storage/files/reference.png"
    ) is True
    assert _reference_url_is_private_target(
        "https://smartaihub.app/api/storage/files/reference.png"
    ) is False


def test_reference_download_error_uses_media_specific_retry_markers():
    transient = str(
        _reference_download_error(
            "https://cdn.example.com/video.mp4",
            0,
            reason="http_access",
            status_code=503,
            media_kind="video",
        )
    )
    permanent = str(
        _reference_download_error(
            "https://cdn.example.com/video.mp4",
            0,
            reason="http_access",
            status_code=403,
            permanent=True,
            media_kind="video",
        )
    )
    assert "KIE_REFERENCE_VIDEO_DOWNLOAD_FAILED" in transient
    assert "KIE_REFERENCE_VIDEO_ACCESS_FAILED" in permanent


@pytest.mark.asyncio
@pytest.mark.parametrize("content,expected_type,suffix", [
    (b"\x89PNG\r\n\x1a\nimage", "image/png", ".png"),
    (b"\xff\xd8\xffimage", "image/jpeg", ".jpg"),
    (b"GIF89aimage", "image/gif", ".gif"),
    (_valid_webp_bytes(), "image/png", ".png"),
])
async def test_reference_upload_uses_actual_format_when_metadata_is_wrong(content, expected_type, suffix):
    provider = KieAIProvider(api_key="test-key")
    provider.client.get = AsyncMock(return_value=httpx.Response(
        200, content=content, headers={"content-type": "image/jpeg"},
        request=httpx.Request("GET", "https://example.com/reference.jpg"),
    ))
    provider.client.post = AsyncMock(return_value=httpx.Response(
        200, json={"data": {"downloadUrl": "https://kie.example/upload.png"}},
        request=httpx.Request("POST", "https://kie.example/upload"),
    ))
    await provider._upload_reference_image("https://example.com/reference.jpg", 0)
    name, uploaded, mime = provider.client.post.await_args.kwargs["files"]["file"]
    assert mime == expected_type
    assert name.endswith(suffix)
    if content.startswith(b"RIFF"):
        assert uploaded != content
    else:
        assert uploaded == content


def test_clean_endpoint_removes_repeated_api_version_prefixes():
    assert _clean_endpoint("/api/v1/jobs/createTask") == "jobs/createTask"
    assert _clean_endpoint("api/v1/api/v1/jobs/createTask") == "jobs/createTask"
    assert _clean_endpoint("https://api.kie.ai/api/v1/jobs/createTask") == "jobs/createTask"


@pytest.mark.asyncio
async def test_make_request_cannot_build_duplicate_api_version_path():
    provider = KieAIProvider(api_key="test-key")
    response = httpx.Response(
        200,
        request=httpx.Request("POST", "https://api.kie.ai/api/v1/jobs/createTask"),
        json={"ok": True},
    )
    provider.client.post = AsyncMock(return_value=response)

    await provider._make_request("POST", "/api/v1/jobs/createTask", data={})

    request = provider.client.post.await_args.args[0]
    assert request == "https://api.kie.ai/api/v1/jobs/createTask"


def test_http_client_is_recreated_when_provider_crosses_event_loops():
    provider = KieAIProvider(api_key="test-key")

    async def get_client():
        return provider._get_client_for_current_loop()

    # Do not unset pytest-asyncio's current loop for later async tests.
    loops = [asyncio.new_event_loop(), asyncio.new_event_loop()]
    try:
        first_client = loops[0].run_until_complete(get_client())
        second_client = loops[1].run_until_complete(get_client())
        loops[0].run_until_complete(first_client.aclose())
        loops[1].run_until_complete(second_client.aclose())
    finally:
        for loop in loops:
            loop.close()

    assert second_client is not first_client


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


def test_resolve_api_model_maps_nano_banana_2_lite_aliases_to_kie_model():
    reset_model_resolution_stats()

    assert resolve_api_model("google-banana-2-lite") == "nano-banana-2-lite"
    assert resolve_api_model("google/nano-banana-2-lite") == "nano-banana-2-lite"
    assert resolve_api_model("gemini-3.1-flash-lite-image") == "nano-banana-2-lite"

    stats = get_model_resolution_stats()
    assert stats["fallback_alias_map"] == 3


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


def test_resolve_api_model_maps_gemini_omni_flash_1_1_aliases_to_exact_kie_model():
    reset_model_resolution_stats()

    assert resolve_api_model("gemini-omni-flash-1-1") == "google/gemini-omni-flash-1-1"
    assert resolve_api_model("gemini_omni_flash_1_1") == "google/gemini-omni-flash-1-1"
    assert resolve_api_model("google/gemini-omni-flash-1-1") == "google/gemini-omni-flash-1-1"

    stats = get_model_resolution_stats()
    assert stats["fallback_alias_map"] == 3


def test_resolve_api_model_maps_grok_imagine_video_15_aliases_to_kie_model():
    reset_model_resolution_stats()

    assert resolve_api_model("grok-imagine-video-1.5") == "grok-imagine-video-1-5-preview"
    assert resolve_api_model("grok-video-1-5") == "grok-imagine-video-1-5-preview"
    assert resolve_api_model("grok-imagine-video-1-5-preview") == "grok-imagine-video-1-5-preview"

    stats = get_model_resolution_stats()
    assert stats["fallback_alias_map"] == 3


def test_resolve_grok_image_2_operation_uses_one_logical_model_for_t2i_and_edit():
    config = {
        "kie_model_id": "grok-imagine-image-2-0/text-to-image",
        "operations": {
            "image-edit": {
                "kie_model_id": "grok-imagine-image-2-0/image-edit",
            },
        },
    }

    _, text_model, text_operation = resolve_grok_image_2_operation(
        "grok-imagine-image-2", config, {}
    )
    edit_config, edit_model, edit_operation = resolve_grok_image_2_operation(
        "grok-imagine-image-2",
        config,
        {"grokOperation": "image-edit", "task_id": "provider-task-1"},
    )

    assert (text_model, text_operation) == (
        "grok-imagine-image-2-0/text-to-image",
        "text-to-image",
    )
    assert (edit_model, edit_operation) == (
        "grok-imagine-image-2-0/image-edit",
        "image-edit",
    )
    assert "aspect_ratio" not in edit_config["drop_params"]


@pytest.mark.asyncio
async def test_grok_image_2_text_to_image_payload_is_exact():
    provider = KieAIProvider(api_key="test-key")
    provider.wait_for_task = AsyncMock(return_value={"id": "task-1", "data": []})
    provider.create_task = AsyncMock(return_value={"data": {"taskId": "task-1"}})

    await provider.generate_image(
        model="grok-imagine-image-2",
        prompt="A cinematic portrait",
        callback_url="",
        api_config={
            "kie_model_id": "grok-imagine-image-2-0/text-to-image",
            "operations": {"text-to-image": {"kie_model_id": "grok-imagine-image-2-0/text-to-image"}},
        },
    )

    args, _ = provider.create_task.await_args
    assert args[0] == "grok-imagine-image-2-0/text-to-image"
    assert args[1]["prompt"] == "A cinematic portrait"
    assert args[1]["aspect_ratio"] == "1:1"


@pytest.mark.asyncio
async def test_grok_image_2_image_edit_payload_uses_five_image_urls_and_aspect_ratio():
    provider = KieAIProvider(api_key="test-key")
    provider.wait_for_task = AsyncMock(return_value={"id": "task-2", "data": []})
    provider.create_task = AsyncMock(return_value={"data": {"taskId": "task-2"}})

    await provider.generate_image(
        model="grok-imagine-image-2",
        prompt="Change the background to a studio",
        callback_url="",
        aspect_ratio="3:2",
        reference_image_urls=[
            f"https://cdn.example.com/ref-{index}.png"
            for index in range(1, 6)
        ],
        api_config={
            "kie_model_id": "grok-imagine-image-2-0/text-to-image",
            "reference_image_input_key": "image_urls",
            "reference_image_input_type": "array",
        },
        extra_params={
            "grokOperation": "image-edit",
            "mask_indexs": [{"value": 2}, 3],
        },
    )

    args, _ = provider.create_task.await_args
    assert args[0] == "grok-imagine-image-2-0/image-edit"
    assert args[1] == {
        "prompt": "Change the background to a studio",
        "aspect_ratio": "3:2",
        "image_urls": [
            f"https://cdn.example.com/ref-{index}.png"
            for index in range(1, 6)
        ],
        "mask_indexs": [2, 3],
    }


@pytest.mark.asyncio
async def test_grok_image_2_segment_map_payload_has_no_prompt_or_image_defaults():
    provider = KieAIProvider(api_key="test-key")
    provider.wait_for_task = AsyncMock(return_value={"id": "task-3", "data": []})
    provider.create_task = AsyncMock(return_value={"data": {"taskId": "task-3"}})

    await provider.generate_image(
        model="grok-imagine-image-2/segment-map",
        prompt="",
        callback_url="",
        api_config={"kie_model_id": "grok-imagine-image-2-0/segment-map"},
        extra_params={"task_id": "provider-source-task"},
    )

    args, _ = provider.create_task.await_args
    assert args[0] == "grok-imagine-image-2-0/segment-map"
    assert args[1] == {"task_id": "provider-source-task"}


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
async def test_generate_image_routes_to_configured_model_variant_when_references_exist():
    provider = KieAIProvider(api_key="test-key")
    provider.wait_for_task = AsyncMock(return_value={"id": "task-1", "data": []})
    provider.create_task = AsyncMock(return_value={"data": {"taskId": "task-1"}})
    provider.client.get = AsyncMock(
        return_value=httpx.Response(
            200,
            headers={"content-type": "image/png"},
            content=b"\x89PNG\r\n\x1a\nreference-image",
            request=httpx.Request("GET", "https://smartaihub.app/reference.png"),
        )
    )
    provider.client.post = AsyncMock(
        return_value=httpx.Response(
            200,
            json={
                "code": 200,
                "data": {
                    "downloadUrl": "https://tempfile.redpandaai.co/reference.png",
                },
            },
            request=httpx.Request(
                "POST", "https://kieai.redpandaai.co/api/file-stream-upload"
            ),
        )
    )

    await provider.generate_image(
        model="gpt-image-2-text-to-image",
        prompt="Edit the attached product photo",
        callback_url="",
        reference_image_urls=["https://cdn.example.com/product.png"],
        api_config={
            "kie_model_id": "gpt-image-2-text-to-image",
            "kie_model_id_with_references": "gpt-image-2-image-to-image",
            "reference_image_input_key": "input_urls",
            "reference_image_input_type": "array",
        },
    )

    provider.create_task.assert_awaited_once()
    args, kwargs = provider.create_task.await_args
    assert kwargs == {}
    assert args[0] == "gpt-image-2-image-to-image"
    assert args[1]["input_urls"] == ["https://tempfile.redpandaai.co/reference.png"]
    provider.client.get.assert_awaited_once_with(
        "https://cdn.example.com/product.png",
        follow_redirects=False,
    )
    provider.client.post.assert_awaited_once()
    upload_call = provider.client.post.await_args
    assert upload_call.args[0] == "https://kieai.redpandaai.co/api/file-stream-upload"
    assert upload_call.kwargs["headers"] == {"Authorization": "Bearer test-key"}


@pytest.mark.asyncio
async def test_upload_reference_image_retries_transient_http_failure():
    provider = KieAIProvider(api_key="test-key")
    failed_response = httpx.Response(
        503,
        request=httpx.Request(
            "GET",
            "https://smartaihub.app/api/mcp/downloads/signed-token/reference.png",
        ),
    )
    success_response = httpx.Response(
        200,
        headers={"content-type": "image/png"},
        content=b"\x89PNG\r\n\x1a\nreference-image",
        request=httpx.Request("GET", "https://smartaihub.app/reference.png"),
    )
    provider.client.get = AsyncMock(side_effect=[failed_response, success_response])
    provider.client.post = AsyncMock(
        return_value=httpx.Response(
            200,
            json={"data": {"downloadUrl": "https://kie.example/reference.png"}},
            request=httpx.Request("POST", "https://kieai.redpandaai.co/api/file-stream-upload"),
        )
    )

    with patch(
        "app.llm_proxy.providers.kie_ai_provider.asyncio.sleep",
        new_callable=AsyncMock,
    ) as sleep:
        uploaded_url = await provider._upload_reference_image(
            "https://smartaihub.app/api/mcp/downloads/signed-token/reference.png?token=secret",
            4,
        )

    assert uploaded_url == "https://kie.example/reference.png"
    assert provider.client.get.await_count == 2
    sleep.assert_awaited_once()


@pytest.mark.asyncio
async def test_upload_reference_image_rejects_permanent_http_failure_without_token_leak():
    provider = KieAIProvider(api_key="test-key")
    provider.client.get = AsyncMock(
        return_value=httpx.Response(
            403,
            request=httpx.Request(
                "GET",
                "https://smartaihub.app/api/mcp/downloads/signed-token/reference.png?token=secret",
            ),
        )
    )

    with pytest.raises(RuntimeError) as error:
        await provider._upload_reference_image(
            "https://smartaihub.app/api/mcp/downloads/signed-token/reference.png?token=secret",
            4,
        )

    message = str(error.value)
    assert "KIE_REFERENCE_IMAGE_ACCESS_FAILED" in message
    assert "item 5" in message
    assert "status=403" in message
    assert "smartaihub.app" in message
    assert "secret" not in message
    assert provider.client.get.await_count == 1


@pytest.mark.asyncio
async def test_qwen3_rehosts_protected_reference_before_using_image_urls():
    provider = KieAIProvider(api_key="test-key")
    provider.wait_for_task = AsyncMock(return_value={"id": "task-1", "data": []})
    provider.create_task = AsyncMock(return_value={"data": {"taskId": "task-1"}})
    provider.client.get = AsyncMock(
        return_value=httpx.Response(
            200,
            headers={"content-type": "image/jpeg"},
            content=b"\xff\xd8\xffsmartaihub-reference",
            request=httpx.Request(
                "GET",
                "https://smartaihub.app/api/mcp/downloads/signed/reference.jpg",
            ),
        )
    )
    provider.client.post = AsyncMock(
        return_value=httpx.Response(
            200,
            json={"data": {"downloadUrl": "https://kie.example/reference.jpg"}},
            request=httpx.Request("POST", "https://kieai.redpandaai.co/api/file-stream-upload"),
        )
    )

    protected_url = "https://smartaihub.app/api/mcp/downloads/signed/reference.jpg"
    await provider.generate_image(
        model="qwen3/pro-text-to-image",
        prompt="Use the attached reference",
        callback_url="",
        reference_image_urls=[protected_url],
        api_config={
            "kie_model_id": "qwen3/pro-text-to-image",
            "kie_model_id_with_references": "qwen3/pro-image-to-image",
            "reference_image_input_key": "image_urls",
            "reference_image_input_type": "array",
        },
    )

    args, _ = provider.create_task.await_args
    assert args[0] == "qwen3/pro-image-to-image"
    assert args[1]["image_urls"] == ["https://kie.example/reference.jpg"]
    assert protected_url not in args[1]["image_urls"]
    provider.client.get.assert_awaited_once_with(protected_url, follow_redirects=False)
    provider.client.post.assert_awaited_once()


@pytest.mark.asyncio
async def test_data_url_is_uploaded_as_original_bytes_instead_of_sent_to_kie():
    provider = KieAIProvider(api_key="test-key")
    provider.client.get = AsyncMock()
    provider.client.post = AsyncMock(
        return_value=httpx.Response(
            200,
            json={"data": {"downloadUrl": "https://kie.example/data-reference.png"}},
            request=httpx.Request("POST", "https://kieai.redpandaai.co/api/file-stream-upload"),
        )
    )
    source = b"\x89PNG\r\n\x1a\ndata-url-reference"
    data_url = "data:image/png;base64," + base64.b64encode(source).decode("ascii")

    uploaded_url = await provider._upload_reference_image(data_url, 0)

    assert uploaded_url == "https://kie.example/data-reference.png"
    provider.client.get.assert_not_awaited()
    uploaded = provider.client.post.await_args.kwargs["files"]["file"]
    assert uploaded[1] == source
    assert uploaded[2] == "image/png"


@pytest.mark.asyncio
async def test_percent_encoded_data_url_preserves_original_bytes():
    provider = KieAIProvider(api_key="test-key")
    provider.client.post = AsyncMock(
        return_value=httpx.Response(
            200,
            json={"data": {"downloadUrl": "https://kie.example/data-reference.png"}},
            request=httpx.Request("POST", "https://kieai.redpandaai.co/api/file-stream-upload"),
        )
    )
    source = b"\x89PNG\r\n\x1a\npercent-encoded"

    await provider._upload_reference_image(
        "data:image/png," + quote_from_bytes(source),
        0,
    )

    uploaded = provider.client.post.await_args.kwargs["files"]["file"]
    assert uploaded[1] == source
    assert uploaded[2] == "image/png"


@pytest.mark.asyncio
async def test_invalid_base64_data_url_fails_before_kie_upload():
    provider = KieAIProvider(api_key="test-key")
    provider.client.post = AsyncMock()

    with pytest.raises(RuntimeError, match="INVALID_DATA_URL"):
        await provider._upload_reference_image(
            "data:image/png;base64,not-valid-base64!",
            0,
        )

    provider.client.post.assert_not_awaited()


@pytest.mark.asyncio
async def test_file_upload_business_error_fails_before_generation_submission():
    provider = KieAIProvider(api_key="test-key")
    provider._make_request = AsyncMock()
    provider.client.get = AsyncMock(
        return_value=httpx.Response(
            200,
            content=b"\x89PNG\r\n\x1a\nreference",
            request=httpx.Request("GET", "https://cdn.example.com/reference.png"),
        )
    )
    provider.client.post = AsyncMock(
        return_value=httpx.Response(
            200,
            json={"code": 500, "data": {"downloadUrl": "https://kie.example/reference.png"}},
            request=httpx.Request("POST", "https://kieai.redpandaai.co/api/file-stream-upload"),
        )
    )

    with pytest.raises(RuntimeError, match="upload failed"):
        await provider.generate_image(
            model="qwen3/image-to-image",
            prompt="Use the attached image.",
            callback_url="",
            reference_image_urls=["https://cdn.example.com/reference.png"],
            api_config={
                "kie_model_id": "qwen3/image-to-image",
                "reference_image_input_key": "image_urls",
                "reference_image_input_type": "array",
                "reference_image_require_upload": True,
            },
        )

    provider._make_request.assert_not_awaited()


@pytest.mark.asyncio
async def test_private_reference_target_is_blocked_before_network_fetch():
    provider = KieAIProvider(api_key="test-key")
    provider.client.get = AsyncMock()
    provider.client.post = AsyncMock()

    with pytest.raises(RuntimeError, match="ACCESS_FAILED"):
        await provider._upload_reference_image("http://127.0.0.1:8080/private.png", 0)

    provider.client.get.assert_not_awaited()
    provider.client.post.assert_not_awaited()


@pytest.mark.asyncio
async def test_style_reference_uses_the_same_safe_attachment_boundary():
    provider = KieAIProvider(api_key="test-key")
    provider.create_task = AsyncMock(return_value={"data": {"taskId": "task-1"}})
    provider.wait_for_task = AsyncMock(return_value={"id": "task-1", "data": []})
    provider.client.get = AsyncMock(
        return_value=httpx.Response(
            200,
            headers={"content-type": "image/webp"},
            content=_valid_webp_bytes(),
            request=httpx.Request("GET", "https://smartaihub.app/api/mcp/downloads/style.webp"),
        )
    )
    provider.client.post = AsyncMock(
        return_value=httpx.Response(
            200,
            json={"data": {"downloadUrl": "https://kie.example/style.webp"}},
            request=httpx.Request("POST", "https://kieai.redpandaai.co/api/file-stream-upload"),
        )
    )

    await provider.generate_image(
        model="google-banana-2-lite",
        prompt="Apply the attached style",
        callback_url="",
        reference_style_url="https://smartaihub.app/api/mcp/downloads/style.webp",
    )

    args, _ = provider.create_task.await_args
    assert args[1]["style_reference"] == "https://kie.example/style.webp"


@pytest.mark.asyncio
async def test_reference_with_image_header_but_invalid_bytes_fails_before_upload():
    provider = KieAIProvider(api_key="test-key")
    provider.client.get = AsyncMock(
        return_value=httpx.Response(
            200,
            headers={"content-type": "image/png"},
            content=b"not-an-image",
            request=httpx.Request("GET", "https://cdn.example.com/reference.png"),
        )
    )
    provider.client.post = AsyncMock()

    with pytest.raises(RuntimeError, match="invalid image content"):
        await provider._upload_reference_image("https://cdn.example.com/reference.png", 0)

    provider.client.post.assert_not_awaited()


@pytest.mark.asyncio
async def test_video_reference_rehosts_overlong_url_before_submission():
    provider = KieAIProvider(api_key="test-key")
    provider.create_task = AsyncMock(return_value={"data": {"taskId": "video-task-1"}})
    provider.client.get = AsyncMock(
        return_value=httpx.Response(
            200,
            headers={"content-type": "video/mp4"},
            content=b"\x00\x00\x00\x18ftypisomvideo-reference",
            request=httpx.Request("GET", "https://cdn.example.com/reference.mp4"),
        )
    )
    provider.client.post = AsyncMock(
        return_value=httpx.Response(
            200,
            json={"data": {"downloadUrl": "https://kie.example/reference.mp4"}},
            request=httpx.Request("POST", "https://kieai.redpandaai.co/api/file-stream-upload"),
        )
    )

    long_url = "https://cdn.example.com/reference.mp4?" + ("token=" + ("x" * 2200))
    await provider.generate_video(
        model="test-video-model",
        prompt="Animate the attached video",
        callback_url="",
        wait_for_completion=False,
        reference_video_urls=[long_url],
        api_config={
            "kie_model_id": "test-video-model/image-to-video",
            "reference_video_input_key": "video_urls",
            "reference_video_input_type": "array",
        },
    )

    args, _ = provider.create_task.await_args
    assert args[1]["video_urls"] == ["https://kie.example/reference.mp4"]
    assert long_url not in args[1]["video_urls"]
    provider.client.get.assert_awaited_once_with(long_url, follow_redirects=False)


@pytest.mark.asyncio
async def test_generate_image_keeps_default_model_variant_without_references():
    provider = KieAIProvider(api_key="test-key")
    provider.wait_for_task = AsyncMock(return_value={"id": "task-1", "data": []})
    provider.create_task = AsyncMock(return_value={"data": {"taskId": "task-1"}})

    await provider.generate_image(
        model="gpt-image-2-text-to-image",
        prompt="Create a cinematic product photo",
        callback_url="",
        api_config={
            "kie_model_id": "gpt-image-2-text-to-image",
            "kie_model_id_with_references": "gpt-image-2-image-to-image",
            "reference_image_input_key": "input_urls",
            "reference_image_input_type": "array",
        },
    )

    provider.create_task.assert_awaited_once()
    args, kwargs = provider.create_task.await_args
    assert kwargs == {}
    assert args[0] == "gpt-image-2-text-to-image"
    assert "input_urls" not in args[1]


@pytest.mark.asyncio
async def test_generate_image_does_not_switch_non_opt_in_model_with_references():
    provider = KieAIProvider(api_key="test-key")
    provider.wait_for_task = AsyncMock(return_value={"id": "task-1", "data": []})
    provider.create_task = AsyncMock(return_value={"data": {"taskId": "task-1"}})

    await provider.generate_image(
        model="other-canonical-model",
        prompt="Edit the attached photo",
        callback_url="",
        reference_image_urls=["https://cdn.example.com/reference.png"],
        api_config={
            "kie_model_id": "other-provider-model",
            "reference_image_input_key": "image_input",
            "reference_image_input_type": "array",
        },
    )

    provider.create_task.assert_awaited_once()
    args, kwargs = provider.create_task.await_args
    assert kwargs == {}
    assert args[0] == "other-provider-model"
    assert args[1]["image_input"] == ["https://cdn.example.com/reference.png"]


@pytest.mark.asyncio
async def test_generate_image_uses_nano_banana_2_lite_reference_images_without_api_config():
    provider = KieAIProvider(api_key="test-key")
    provider.wait_for_task = AsyncMock(return_value={"id": "task-1", "data": []})
    provider.create_task = AsyncMock(return_value={"data": {"taskId": "task-1"}})

    await provider.generate_image(
        model="google-banana-2-lite",
        prompt="test prompt",
        callback_url="",
        reference_image_urls=["https://cdn.example.com/ref.png"],
    )

    provider.create_task.assert_awaited_once()
    args, kwargs = provider.create_task.await_args
    assert kwargs == {}
    assert args[0] == "nano-banana-2-lite"
    assert args[1]["image_urls"] == ["https://cdn.example.com/ref.png"]
    assert args[1]["aspect_ratio"] == "auto"
    assert "resolution" not in args[1]
    assert "output_format" not in args[1]


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
            "reference_image_manifest": [
                {
                    "placeholder": "@Image1",
                    "role": "product",
                    "url": "https://cdn.example.com/very-long-product-file-name.png",
                },
            ],
            "reference_image_role_order": ["@Image1=product"],
            "reference_image_role_counts": {"product": 1, "total": 1},
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
    assert "reference_image_manifest" not in payload
    assert "reference_image_role_order" not in payload
    assert "reference_image_role_counts" not in payload
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
async def test_generate_video_builds_grok_imagine_video_15_payload():
    provider = KieAIProvider(api_key="test-key")
    provider.create_task = AsyncMock(return_value={"data": {"taskId": "task-grok-15"}})

    await provider.generate_video(
        model="grok-imagine-video-1.5",
        prompt="A cinematic product reveal with soft studio light.",
        callback_url="",
        wait_for_completion=False,
        reference_image_urls=[
            f"https://cdn.example.com/product-{index}.png"
            for index in range(1, 8)
        ],
        resolution="1080p",
        duration=15,
        aspect_ratio="16:9",
        api_config={
            "kie_model_id": "grok-imagine-video-1-5-preview",
            "generate_type": "image-to-video",
        },
    )

    provider.create_task.assert_awaited_once()
    args, kwargs = provider.create_task.await_args
    assert kwargs == {}
    assert args[0] == "grok-imagine-video-1-5-preview"
    assert args[1] == {
        "prompt": "A cinematic product reveal with soft studio light.",
        "duration": 15,
        "aspect_ratio": "16:9",
        "resolution": "1080p",
        "image_urls": [
            f"https://cdn.example.com/product-{index}.png"
            for index in range(1, 8)
        ],
    }


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
async def test_generate_image_prepares_dynamic_image_field_without_high_level_refs():
    provider = KieAIProvider(api_key="test-key")
    provider.create_task = AsyncMock(return_value={"data": {"taskId": "task-dynamic-image"}})
    provider.wait_for_task = AsyncMock(return_value={"id": "task-dynamic-image", "data": []})
    provider.client.get = AsyncMock(
        return_value=httpx.Response(
            200,
            content=b"\x89PNG\r\n\x1a\ndynamic-image",
            request=httpx.Request("GET", "https://smartaihub.app/api/storage/files/ref.png"),
        )
    )
    provider.client.post = AsyncMock(
        return_value=httpx.Response(
            200,
            json={"data": {"downloadUrl": "https://kie.example/dynamic-image.png"}},
            request=httpx.Request("POST", "https://kieai.redpandaai.co/api/file-stream-upload"),
        )
    )

    await provider.generate_image(
        model="qwen3/image-to-image",
        prompt="Use the attached image.",
        callback_url="",
        api_config={
            "kie_model_id": "qwen3/image-to-image",
            "reference_image_input_key": "image_urls",
            "reference_image_input_type": "array",
        },
        extra_params={
            "image_urls": ["https://smartaihub.app/api/storage/files/ref.png"],
        },
    )

    args, _ = provider.create_task.await_args
    assert args[1]["image_urls"] == ["https://kie.example/dynamic-image.png"]
    provider.client.get.assert_awaited_once()
    provider.client.post.assert_awaited_once()


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
async def test_generate_video_uploads_object_array_reference_before_preserving_trim_fields():
    provider = KieAIProvider(api_key="test-key")
    provider.create_task = AsyncMock(return_value={"data": {"taskId": "task-gemini-omni"}})
    provider.client.get = AsyncMock(
        return_value=httpx.Response(
            200,
            content=b"\x00\x00\x00\x18ftypisomvideo-reference",
            request=httpx.Request("GET", "https://cdn.example.com/source.mp4"),
        )
    )
    provider.client.post = AsyncMock(
        return_value=httpx.Response(
            200,
            json={"data": {"downloadUrl": "https://kie.example/source.mp4"}},
            request=httpx.Request("POST", "https://kieai.redpandaai.co/api/file-stream-upload"),
        )
    )

    await provider.generate_video(
        model="gemini-omni-video",
        prompt="Use only the opening movement.",
        wait_for_completion=False,
        api_config={
            "kie_model_id": "gemini-omni-video",
            "reference_video_input_key": "video_list",
            "reference_video_input_type": "object_array",
            "reference_video_require_upload": True,
        },
        extra_params={
            "video_list": [{
                "video_url": "https://cdn.example.com/source.mp4",
                "start": 1,
                "end": 7,
            }],
        },
    )

    args, _ = provider.create_task.await_args
    assert args[1]["video_list"] == [
        {"url": "https://kie.example/source.mp4", "start": 1, "ends": 7}
    ]
    provider.client.get.assert_awaited_once_with(
        "https://cdn.example.com/source.mp4",
        follow_redirects=False,
    )
    provider.client.post.assert_awaited_once()


@pytest.mark.asyncio
async def test_generate_video_builds_gemini_omni_flash_1_1_frame_payload_with_kie_resolution():
    provider = KieAIProvider(api_key="test-key")
    provider.create_task = AsyncMock(return_value={"data": {"taskId": "task-gemini-flash-11"}})

    await provider.generate_video(
        model="gemini-omni-flash-1-1",
        prompt="A cinematic product reveal.",
        wait_for_completion=False,
        resolution="4K",
        api_config={
            "kie_model_id": "google/gemini-omni-flash-1-1",
            "reference_image_input_key": "image_urls",
            "reference_image_input_type": "array",
            "reference_video_input_key": "video_list",
            "reference_video_input_type": "object_array",
        },
        extra_params={
            "first_frame_url": "https://cdn.example.com/start.png",
            "last_frame_url": "https://cdn.example.com/end.png",
            "resolution": "4K",
        },
    )

    provider.create_task.assert_awaited_once()
    args, kwargs = provider.create_task.await_args
    assert kwargs == {}
    assert args[0] == "google/gemini-omni-flash-1-1"
    assert args[1] == {
        "prompt": "A cinematic product reveal.",
        "duration": "4",
        "aspect_ratio": "16:9",
        "resolution": "4k",
        "first_frame_url": "https://cdn.example.com/start.png",
        "last_frame_url": "https://cdn.example.com/end.png",
    }


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
