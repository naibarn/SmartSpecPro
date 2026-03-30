from __future__ import annotations

import asyncio
import json
from pathlib import Path

import httpx
import pytest

from app.services.social.tiktok_client import TikTokContentPostingClient


@pytest.mark.asyncio
async def test_query_creator_info_uses_expected_endpoint_and_headers():
    requests: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        return httpx.Response(
            200,
            json={
                "error": {"code": "ok", "message": ""},
                "data": {"creator_info": {"privacy_level_options": ["PUBLIC_TO_EVERYONE"]}},
            },
        )

    async_client = httpx.AsyncClient(transport=httpx.MockTransport(handler))
    client = TikTokContentPostingClient("access-token", client=async_client)

    payload = await client.query_creator_info()

    assert payload["data"]["creator_info"]["privacy_level_options"] == ["PUBLIC_TO_EVERYONE"]
    assert requests[0].url.path == "/v2/post/publish/creator_info/query/"
    assert requests[0].headers["authorization"] == "Bearer access-token"
    await client.close()


@pytest.mark.asyncio
async def test_init_direct_video_post_passes_expected_payload():
    captured: dict[str, object] = {}

    def handler(request: httpx.Request) -> httpx.Response:
        captured["method"] = request.method
        captured["path"] = request.url.path
        captured["json"] = request.read().decode("utf-8")
        return httpx.Response(
            200,
            json={
                "error": {"code": "ok", "message": ""},
                "data": {"publish_id": "p_123", "upload_url": "https://open-upload.tiktokapis.com/video/?x=1"},
            },
        )

    async_client = httpx.AsyncClient(transport=httpx.MockTransport(handler))
    client = TikTokContentPostingClient("access-token", client=async_client)

    payload = await client.init_direct_video_post(
        post_info={"title": "Hello", "privacy_level": "PUBLIC_TO_FRIENDS"},
        source_info={"source": "FILE_UPLOAD", "video_size": 123, "chunk_size": 123, "total_chunk_count": 1},
    )

    assert payload["data"]["publish_id"] == "p_123"
    assert captured["method"] == "POST"
    assert captured["path"] == "/v2/post/publish/video/init/"
    body = json.loads(str(captured["json"]))
    assert body["post_info"]["title"] == "Hello"
    assert body["source_info"]["source"] == "FILE_UPLOAD"
    await client.close()


@pytest.mark.asyncio
async def test_upload_file_to_upload_url_streams_chunks(tmp_path: Path):
    file_path = tmp_path / "video.mp4"
    file_path.write_bytes(b"abcdefghij")

    requests: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        return httpx.Response(206 if len(requests) < 3 else 201, json={"ok": True})

    async_client = httpx.AsyncClient(transport=httpx.MockTransport(handler))
    client = TikTokContentPostingClient("access-token", client=async_client)

    await client.upload_file_to_upload_url(
        "https://open-upload.tiktokapis.com/video/?upload_id=abc123",
        file_path,
        chunk_size=4,
    )

    assert len(requests) == 3
    assert requests[0].headers["content-range"] == "bytes 0-3/10"
    assert requests[1].headers["content-range"] == "bytes 4-7/10"
    assert requests[2].headers["content-range"] == "bytes 8-9/10"
    await client.close()


@pytest.mark.asyncio
async def test_wait_for_terminal_status_polling():
    responses = [
        httpx.Response(200, json={"error": {"code": "ok"}, "data": {"status": "PROCESSING"}}),
        httpx.Response(200, json={"error": {"code": "ok"}, "data": {"status": "PUBLISH_COMPLETE"}}),
    ]

    def handler(request: httpx.Request) -> httpx.Response:
        return responses.pop(0)

    async_client = httpx.AsyncClient(transport=httpx.MockTransport(handler))
    client = TikTokContentPostingClient("access-token", client=async_client)

    payload = await client.wait_for_terminal_status("pub_123", poll_interval_seconds=1, timeout_seconds=3)

    assert payload["data"]["status"] == "PUBLISH_COMPLETE"
    await client.close()
