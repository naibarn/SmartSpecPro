from __future__ import annotations

from datetime import datetime, timezone
from unittest.mock import AsyncMock

import httpx
import pytest

from app.services.social.exceptions import MetaApiError, PermissionDeniedError, RateLimitExceededError, TokenExpiredError
from app.services.social.meta_graph_client import MetaGraphClient, scrub_access_tokens


def make_response(status_code: int, payload: dict | None = None, headers: dict[str, str] | None = None) -> httpx.Response:
    request = httpx.Request("POST", "https://graph.facebook.com/v25.0/test")
    return httpx.Response(status_code, json=payload or {}, headers=headers or {}, request=request)


@pytest.mark.asyncio
async def test_send_message_posts_to_messages_endpoint() -> None:
    client = AsyncMock()
    client.request = AsyncMock(return_value=make_response(200, {"id": "mid.1"}))
    client.aclose = AsyncMock()

    api = MetaGraphClient("secret-token", page_id="123", client=client)
    result = await api.send_message("psid_1", "Hello")

    assert result == {"id": "mid.1"}
    method, url = client.request.await_args.args[:2]
    assert method == "POST"
    assert url.endswith("/123/messages")
    assert client.request.await_args.kwargs["json"] == {
        "recipient": {"id": "psid_1"},
        "message": {"text": "Hello"},
    }
    assert client.request.await_args.kwargs["params"]["access_token"] == "secret-token"


@pytest.mark.asyncio
async def test_publish_comment_posts_once_to_target_post_comments_edge() -> None:
    client = AsyncMock()
    client.request = AsyncMock(return_value=make_response(200, {"id": "comment-123"}))
    client.aclose = AsyncMock()

    api = MetaGraphClient("secret-token", page_id="123", client=client)
    result = await api.publish_comment("123_456", "https://example.com/affiliate")

    assert result == {"id": "comment-123"}
    assert client.request.await_count == 1
    assert client.request.await_args.args[0] == "POST"
    assert client.request.await_args.args[1].endswith("/123_456/comments")
    assert client.request.await_args.kwargs["json"] == {"message": "https://example.com/affiliate"}


@pytest.mark.asyncio
async def test_create_post_includes_scheduled_publish_time() -> None:
    client = AsyncMock()
    client.request = AsyncMock(return_value=make_response(200, {"id": "post_1"}))
    client.aclose = AsyncMock()

    api = MetaGraphClient("secret-token", page_id="123", client=client)
    scheduled_at = datetime(2025, 1, 1, tzinfo=timezone.utc)
    await api.create_post("Hello", link="https://example.com", scheduled_at=int(scheduled_at.timestamp()))

    assert client.request.await_args.kwargs["json"]["message"] == "Hello"
    assert client.request.await_args.kwargs["json"]["link"] == "https://example.com"
    assert client.request.await_args.kwargs["json"]["scheduled_publish_time"] == int(scheduled_at.timestamp())
    assert client.request.await_args.kwargs["json"]["published"] is False
    assert client.request.await_args.args[1].endswith("/123/feed")


@pytest.mark.asyncio
async def test_publish_page_photo_streams_private_binary_once_to_pinned_photos_edge() -> None:
    observed: list[httpx.Request] = []
    png = b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01"

    async def handler(request: httpx.Request) -> httpx.Response:
        observed.append(request)
        body = await request.aread()
        assert b'name="source"; filename="marketplace-review.png"' in body
        assert b'Content-Type: image/png' in body
        assert png in body
        assert b'name="caption"' in body and b"Review text #care" in body
        assert b'name="published"' in body and b"true" in body
        assert b'name="access_token"' in body and b"private-token" in body
        assert "access_token" not in str(request.url)
        return httpx.Response(200, json={"id": "photo-123", "post_id": "page-post-456"})

    client = httpx.AsyncClient(transport=httpx.MockTransport(handler))
    async with MetaGraphClient("private-token", page_id="123", client=client, api_version="v25.0") as api:
        receipt = await api.publish_page_photo(
            message="Review text #care",
            content=png,
            filename="review.png",
            content_type="image/png",
        )

    assert receipt == {"id": "photo-123", "post_id": "page-post-456"}
    assert len(observed) == 1
    assert observed[0].method == "POST"
    assert observed[0].url.path == "/v27.0/123/photos"


@pytest.mark.asyncio
async def test_publish_page_photo_does_not_retry_ambiguous_timeout() -> None:
    calls = 0
    png = b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01"

    async def handler(_request: httpx.Request) -> httpx.Response:
        nonlocal calls
        calls += 1
        raise httpx.ConnectTimeout("ambiguous request")

    client = httpx.AsyncClient(transport=httpx.MockTransport(handler))
    async with MetaGraphClient("private-token", page_id="123", client=client) as api:
        with pytest.raises(MetaApiError):
            await api.publish_page_photo(
                message="Review",
                content=png,
                filename="review.png",
                content_type="image/png",
            )

    assert calls == 1


@pytest.mark.asyncio
async def test_read_page_photo_status_uses_pinned_graph_version_and_published_story_fields() -> None:
    client = AsyncMock()
    client.request.return_value = make_response(200, {
        "id": "photo-123",
        "page_story_id": "page-story-456",
        "link": "https://www.facebook.com/example/photos/456",
    })
    api = MetaGraphClient("private-token", client=client, api_version="v25.0")

    result = await api.get_page_photo_status("123")

    assert result["page_story_id"] == "page-story-456"
    assert client.request.await_args.args == ("GET", "https://graph.facebook.com/v27.0/123")
    assert client.request.await_args.kwargs["params"]["fields"] == "id,page_story_id,link,created_time"
    assert client.request.await_args.kwargs["params"]["access_token"] == "private-token"


@pytest.mark.asyncio
async def test_read_page_photo_status_rejects_non_provider_ids_before_request() -> None:
    client = AsyncMock()
    api = MetaGraphClient("private-token", client=client)

    with pytest.raises(ValueError):
        await api.get_page_photo_status("123/comments")

    client.request.assert_not_awaited()


@pytest.mark.asyncio
async def test_reels_lifecycle_uses_pinned_version_and_preserves_provider_receipts() -> None:
    client = AsyncMock()
    upload_url = "https://rupload.facebook.com/video-upload/v27.0/456"
    client.request.side_effect = [
        make_response(200, {"video_id": "456", "upload_url": upload_url}),
        make_response(200, {"success": True}),
        make_response(200, {"status": {"uploading_phase": {"bytes_transfered": 3}}}),
        make_response(200, {"success": True, "post_id": "789"}),
    ]
    api = MetaGraphClient("secret-token", page_id="123", client=client, api_version="v25.0")

    async def content():
        yield b"def"

    session = await api.start_reel_upload()
    await api.upload_reel_binary(video_id=session["video_id"], upload_url=session["upload_url"],
                                 content=content(), file_size=6, offset=3)
    status = await api.get_reel_status("456")
    receipt = await api.finish_reel_upload(video_id="456", description="Caption #tag", is_ai_generated=True)

    start, upload, poll, finish = client.request.await_args_list
    assert start.args == ("POST", "https://graph.facebook.com/v27.0/123/video_reels")
    assert start.kwargs["json"] == {"upload_phase": "start"}
    assert upload.args == ("POST", upload_url)
    assert upload.kwargs["headers"] == {"Authorization": "OAuth secret-token", "offset": "3", "file_size": "6",
                                        "Content-Type": "application/octet-stream", "Content-Length": "3"}
    assert upload.kwargs["follow_redirects"] is False
    assert b"".join([chunk async for chunk in upload.kwargs["content"]]) == b"def"
    assert poll.args == ("GET", "https://graph.facebook.com/v27.0/456")
    assert poll.kwargs["params"]["fields"] == "status"
    assert status["status"]["uploading_phase"]["bytes_transfered"] == 3
    assert finish.kwargs["json"] == {"upload_phase": "finish", "video_id": "456", "video_state": "PUBLISHED",
                                      "description": "Caption #tag", "is_ai_generated": True}
    assert receipt == {"success": True, "post_id": "789"}
    assert "permalink" not in receipt


@pytest.mark.asyncio
@pytest.mark.parametrize("url", ["https://evil.test/video-upload/456", "http://rupload.facebook.com/video-upload/456",
                                 "https://rupload.facebook.com/video-upload/123", "https://rupload.facebook.com/video-upload/456?x=1",
                                 "https://rupload.facebook.com@evil.test/video-upload/456"])
async def test_reels_rejects_untrusted_upload_url_without_sending_token(url: str) -> None:
    client = AsyncMock()
    api = MetaGraphClient("secret-token", page_id="123", client=client)

    async def content():
        yield b"bytes"

    with pytest.raises(ValueError):
        await api.upload_reel_binary(video_id="456", upload_url=url, content=content(), file_size=5)
    client.request.assert_not_awaited()


@pytest.mark.asyncio
@pytest.mark.parametrize("method", ["start", "finish", "upload"])
async def test_reels_side_effects_are_not_retried_on_transient_errors(method: str) -> None:
    client = AsyncMock()
    client.request.return_value = make_response(503, {"error": {"message": "unavailable"}})
    api = MetaGraphClient("secret-token", page_id="123", client=client)

    async def content():
        yield b"x"

    with pytest.raises(MetaApiError):
        if method == "start":
            await api.start_reel_upload()
        elif method == "finish":
            await api.finish_reel_upload(video_id="456", description="", is_ai_generated=False)
        else:
            await api.upload_reel_binary(video_id="456", upload_url="https://rupload.facebook.com/video-upload/456",
                                         content=content(), file_size=1)
    assert client.request.await_count == 1


@pytest.mark.asyncio
async def test_reels_requires_explicit_provider_success_for_finish() -> None:
    client = AsyncMock()
    client.request.return_value = make_response(200, {})
    api = MetaGraphClient("secret-token", page_id="123", client=client)
    with pytest.raises(MetaApiError):
        await api.finish_reel_upload(video_id="456", description="", is_ai_generated=False)


@pytest.mark.asyncio
async def test_reels_start_rejects_missing_session() -> None:
    client = AsyncMock()
    client.request.return_value = make_response(200, {"video_id": "456"})
    api = MetaGraphClient("secret-token", page_id="123", client=client)
    with pytest.raises(MetaApiError):
        await api.start_reel_upload()


@pytest.mark.asyncio
async def test_get_comments_uses_after_cursor() -> None:
    client = AsyncMock()
    client.request = AsyncMock(return_value=make_response(200, {"data": []}))
    client.aclose = AsyncMock()

    api = MetaGraphClient("secret-token", client=client)
    await api.get_comments("post_1", limit=20, after="cursor_1")

    assert client.request.await_args.kwargs["params"]["limit"] == 20
    assert client.request.await_args.kwargs["params"]["after"] == "cursor_1"
    assert client.request.await_args.args[1].endswith("/post_1/comments")


@pytest.mark.asyncio
async def test_reply_hide_delete_comment_paths() -> None:
    client = AsyncMock()
    client.request = AsyncMock(return_value=make_response(200, {"id": "ok"}))
    client.aclose = AsyncMock()

    api = MetaGraphClient("secret-token", client=client)

    await api.reply_to_comment("comment_1", "Reply")
    await api.hide_comment("comment_2")
    await api.delete_comment("comment_3")

    assert client.request.await_args_list[0].args[1].endswith("/comment_1/comments")
    assert client.request.await_args_list[1].args[1].endswith("/comment_2")
    assert client.request.await_args_list[2].args[0] == "DELETE"


@pytest.mark.asyncio
async def test_subscribe_webhooks_uses_subscribed_fields() -> None:
    client = AsyncMock()
    client.request = AsyncMock(return_value=make_response(200, {"success": True}))
    client.aclose = AsyncMock()

    api = MetaGraphClient("secret-token", page_id="123", client=client)
    await api.subscribe_webhooks(["messages", "feed"])

    assert client.request.await_args.kwargs["json"]["subscribed_fields"] == "messages,feed"
    assert client.request.await_args.args[1].endswith("/123/subscribed_apps")


@pytest.mark.asyncio
async def test_retries_on_429_with_exponential_backoff(monkeypatch: pytest.MonkeyPatch) -> None:
    client = AsyncMock()
    client.request = AsyncMock(
        side_effect=[
            make_response(429, {"error": {"message": "rate limited", "code": 4}}, {"Retry-After": "1"}),
            make_response(429, {"error": {"message": "rate limited", "code": 4}}),
            make_response(200, {"id": "ok"}),
        ]
    )
    client.aclose = AsyncMock()
    sleeps: list[float] = []
    monkeypatch.setattr("app.services.social.meta_graph_client.asyncio.sleep", AsyncMock(side_effect=lambda s: sleeps.append(s)))

    api = MetaGraphClient("secret-token", page_id="123", client=client)
    await api.send_message("psid_1", "Hello")

    assert sleeps[0] == 1.0
    assert sleeps[1] == 2


@pytest.mark.asyncio
async def test_retries_on_502_and_503(monkeypatch: pytest.MonkeyPatch) -> None:
    client = AsyncMock()
    client.request = AsyncMock(
        side_effect=[
            make_response(502, {"error": {"message": "bad gateway"}}),
            make_response(503, {"error": {"message": "unavailable"}}),
            make_response(200, {"id": "ok"}),
        ]
    )
    client.aclose = AsyncMock()
    sleeps: list[float] = []
    monkeypatch.setattr("app.services.social.meta_graph_client.asyncio.sleep", AsyncMock(side_effect=lambda s: sleeps.append(s)))

    api = MetaGraphClient("secret-token", page_id="123", client=client)
    await api.send_message("psid_1", "Hello")

    assert sleeps == [1, 2]


@pytest.mark.asyncio
async def test_does_not_retry_on_400() -> None:
    client = AsyncMock()
    client.request = AsyncMock(return_value=make_response(400, {"error": {"message": "bad request", "code": 100}}))
    client.aclose = AsyncMock()

    api = MetaGraphClient("secret-token", page_id="123", client=client)
    with pytest.raises(MetaApiError):
        await api.send_message("psid_1", "Hello")

    assert client.request.await_count == 1


@pytest.mark.asyncio
async def test_raises_token_expired_for_code_190() -> None:
    client = AsyncMock()
    client.request = AsyncMock(return_value=make_response(400, {"error": {"message": "expired", "code": 190}}))
    client.aclose = AsyncMock()

    api = MetaGraphClient("secret-token", page_id="123", client=client)
    with pytest.raises(TokenExpiredError):
        await api.send_message("psid_1", "Hello")


@pytest.mark.asyncio
async def test_raises_permission_denied_for_code_10() -> None:
    client = AsyncMock()
    client.request = AsyncMock(return_value=make_response(400, {"error": {"message": "forbidden", "code": 10}}))
    client.aclose = AsyncMock()

    api = MetaGraphClient("secret-token", page_id="123", client=client)
    with pytest.raises(PermissionDeniedError):
        await api.send_message("psid_1", "Hello")


@pytest.mark.asyncio
async def test_close_calls_aclose() -> None:
    client = AsyncMock()
    client.request = AsyncMock(return_value=make_response(200, {"ok": True}))
    client.aclose = AsyncMock()

    api = MetaGraphClient("secret-token", client=client)
    await api.close()

    client.aclose.assert_awaited_once()


def test_scrub_access_tokens_removes_token_from_urls() -> None:
    url = "https://graph.facebook.com/v25.0/123/messages?access_token=secret-token&foo=bar"
    assert "secret-token" not in scrub_access_tokens(url)
