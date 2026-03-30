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
