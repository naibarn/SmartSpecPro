from __future__ import annotations

import json
from unittest.mock import AsyncMock

import httpx
import pytest

from app.llm_proxy.providers.magnific_provider import (
    MagnificProvider,
    MagnificProviderError,
    normalize_magnific_base_url,
)


def _client(handler):
    return httpx.AsyncClient(transport=httpx.MockTransport(handler))


@pytest.mark.asyncio
async def test_generate_image_uses_magnific_auth_header_and_exact_path():
    requests: list[httpx.Request] = []

    async def handler(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        return httpx.Response(200, json={"data": {"task_id": "task-1", "status": "queued"}})

    provider = MagnificProvider(api_key="secret-key", client=_client(handler))
    try:
        result = await provider.generate_image("magnific/mystic", {"prompt": "A luminous city"})
    finally:
        await provider.aclose()

    assert result["provider_task_id"] == "task-1"
    assert requests[0].url == httpx.URL("https://api.magnific.com/v1/ai/mystic")
    assert requests[0].headers["x-magnific-api-key"] == "secret-key"
    assert "authorization" not in requests[0].headers


@pytest.mark.asyncio
async def test_get_task_status_normalizes_generated_urls():
    async def handler(request: httpx.Request) -> httpx.Response:
        assert request.method == "GET"
        assert request.url == httpx.URL("https://api.magnific.com/v1/ai/mystic/task-1")
        return httpx.Response(200, json={"data": {"status": "completed", "generated": ["https://storage.googleapis.com/smartspec-test/out.png"]}})

    provider = MagnificProvider(api_key="secret-key", client=_client(handler))
    try:
        result = await provider.get_task_status("magnific/mystic", "task-1", "image")
    finally:
        await provider.aclose()

    assert result["status"] == "completed"
    assert result["data"] == [{"url": "https://storage.googleapis.com/smartspec-test/out.png"}]


@pytest.mark.asyncio
async def test_get_task_status_accepts_signed_cdn_result_urls():
    signed_url = (
        "https://cdn-magnific.freepik.com/result.png"
        "?token=exp=1778064563~hmac=abc123&size=stable"
    )

    async def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json={"data": {"status": "completed", "generated": [signed_url]}})

    provider = MagnificProvider(api_key="secret-key", client=_client(handler))
    try:
        result = await provider.get_task_status("magnific/nano-banana-pro", "task-1", "image")
    finally:
        await provider.aclose()

    assert result["status"] == "completed"
    assert result["data"] == [{"url": signed_url}]


@pytest.mark.asyncio
async def test_veo_status_normalizes_video_output_url():
    async def handler(request: httpx.Request) -> httpx.Response:
        assert request.url == httpx.URL("https://api.magnific.com/v1/ai/text-to-video/veo-3-1/task-v")
        return httpx.Response(200, json={"data": {"status": "success", "video_url": "https://storage.googleapis.com/smartspec-test/video.mp4"}})

    provider = MagnificProvider(api_key="secret-key", client=_client(handler))
    try:
        result = await provider.get_task_status("magnific/veo-3-1-text-to-video", "task-v", "video")
    finally:
        await provider.aclose()

    assert result["status"] == "completed"
    assert result["data"] == [{"url": "https://storage.googleapis.com/smartspec-test/video.mp4"}]


@pytest.mark.asyncio
async def test_remove_background_returns_sync_urls_without_polling():
    async def handler(request: httpx.Request) -> httpx.Response:
        assert request.method == "POST"
        assert request.url == httpx.URL("https://api.magnific.com/v1/ai/beta/remove-background")
        return httpx.Response(
            200,
            json={
                "data": {
                    "url": "https://storage.googleapis.com/smartspec-test/cutout.png",
                    "high_resolution": "https://storage.googleapis.com/smartspec-test/cutout-hi.png",
                    "preview": "https://storage.googleapis.com/smartspec-test/cutout-preview.png",
                }
            },
        )

    provider = MagnificProvider(api_key="secret-key", client=_client(handler))
    try:
        result = await provider.remove_background({"image_url": "https://storage.googleapis.com/smartspec-test/source.png"})
    finally:
        await provider.aclose()

    assert result["status"] == "completed"
    assert result["requires_rehost"] is True
    assert result["data"] == [
        {"url": "https://storage.googleapis.com/smartspec-test/cutout.png"},
        {"url": "https://storage.googleapis.com/smartspec-test/cutout-hi.png"},
        {"url": "https://storage.googleapis.com/smartspec-test/cutout-preview.png"},
    ]


@pytest.mark.asyncio
async def test_video_upscaler_serializes_controls_and_strips_webhook():
    requests: list[httpx.Request] = []

    async def handler(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        return httpx.Response(200, json={"data": {"task_id": "upscale-1"}})

    provider = MagnificProvider(api_key="secret-key", client=_client(handler))
    try:
        result = await provider.upscale_video(
            "magnific/video-upscaler-precision",
            {
                "video_urls": ["https://storage.googleapis.com/smartspec-test/input.mp4"],
                "fps_boost": True,
                "strength": 70,
                "webhook_url": "https://attacker.example.com/hook",
            },
        )
    finally:
        await provider.aclose()

    body = json.loads(requests[0].content.decode("utf-8"))
    assert result["provider_task_id"] == "upscale-1"
    assert body == {
        "video_urls": ["https://storage.googleapis.com/smartspec-test/input.mp4"],
        "fps_boost": True,
        "strength": 70,
    }


def test_base_url_normalization_rejects_unsafe_hosts():
    assert normalize_magnific_base_url(None) == "https://api.magnific.com"
    with pytest.raises(MagnificProviderError, match="https"):
        normalize_magnific_base_url("http://api.magnific.com")
    with pytest.raises(MagnificProviderError, match="public host"):
        normalize_magnific_base_url("https://127.0.0.1")


@pytest.mark.asyncio
async def test_rejects_unsafe_input_urls_before_submit():
    provider = MagnificProvider(api_key="secret-key", client=_client(lambda request: httpx.Response(200, json={})))
    try:
        with pytest.raises(MagnificProviderError, match="public host"):
            await provider.generate_image("magnific/seedream-v5-lite-edit", {"image_url": "https://127.0.0.1/private.png"})
    finally:
        await provider.aclose()


@pytest.mark.asyncio
async def test_http_400_includes_sanitized_provider_message():
    async def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(400, json={"message": "prompt must be shorter than 3000 characters"})

    provider = MagnificProvider(api_key="secret-key", client=_client(handler))
    try:
        with pytest.raises(MagnificProviderError, match="prompt must be shorter") as exc_info:
            await provider.generate_image("magnific/nano-banana-pro", {"prompt": "x" * 3001})
    finally:
        await provider.aclose()

    assert exc_info.value.category == "validation_error"
    assert exc_info.value.status_code == 400
    assert "secret-key" not in str(exc_info.value)


@pytest.mark.asyncio
async def test_failed_task_status_includes_sanitized_provider_detail():
    async def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(
            200,
            json={
                "data": {
                    "status": "failed",
                    "task_id": "task-1",
                    "error": {"message": "prompt violates provider policy"},
                    "api_key": "should-not-leak",
                }
            },
        )

    provider = MagnificProvider(api_key="secret-key", client=_client(handler))
    try:
        with pytest.raises(MagnificProviderError, match="prompt violates provider policy") as exc_info:
            await provider.get_task_status("magnific/nano-banana-pro", "task-1", "image")
    finally:
        await provider.aclose()

    assert exc_info.value.category == "terminal_task_failure"
    assert exc_info.value.provider_detail is not None
    assert exc_info.value.provider_detail["message"] == "prompt violates provider policy"
    assert exc_info.value.provider_detail["response"]["data"]["api_key"] == "[redacted]"
    assert "secret-key" not in str(exc_info.value)


@pytest.mark.asyncio
async def test_unknown_completed_result_shape_raises_sanitized_error():
    async def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json={"data": {"status": "completed", "secret": "do-not-leak"}})

    provider = MagnificProvider(api_key="secret-key", client=_client(handler))
    try:
        with pytest.raises(MagnificProviderError, match="did not include media URLs") as exc_info:
            await provider.get_task_status("magnific/mystic", "task-1", "image")
    finally:
        await provider.aclose()

    assert "secret-key" not in str(exc_info.value)


@pytest.mark.asyncio
async def test_aclose_closes_http_client():
    client = _client(lambda request: httpx.Response(200, json={}))
    client.aclose = AsyncMock()
    provider = MagnificProvider(api_key="secret-key", client=client)

    await provider.aclose()

    client.aclose.assert_awaited_once()
