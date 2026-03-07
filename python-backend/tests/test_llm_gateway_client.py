"""Tests for LLMGatewayClient — the async HTTP client for Node.js LLM Gateway.

All tests mock httpx.AsyncClient to verify:
- Correct header construction (X-Internal-Token, X-User-Id, X-Tenant-Id)
- Correct body construction (messages, model, response_format)
- Error handling for HTTP 402, 429, 5xx, and timeouts
- Retry logic with backoff and Retry-After header

Feature: 032-Browser-Automation-Copilot, Section 02
"""

import pytest
from unittest.mock import AsyncMock, patch, MagicMock
import httpx

from app.services.llm_gateway_client import (
    LLMGatewayClient,
    InsufficientCreditsError,
    GatewayUnavailableError,
)


@pytest.fixture
def client():
    """Create a test client with known config."""
    return LLMGatewayClient(
        base_url="http://localhost:3000",
        token="test-gateway-token",
        timeout=30,
        max_retries=2,
    )


def _mock_response(status_code: int = 200, json_data: dict | None = None, headers: dict | None = None):
    """Build a mock httpx.Response."""
    resp = MagicMock(spec=httpx.Response)
    resp.status_code = status_code
    resp.json.return_value = json_data or {}
    resp.headers = headers or {}
    return resp


@pytest.mark.asyncio
async def test_chat_completion_sends_correct_headers(client):
    """X-Internal-Token, X-User-Id, X-Tenant-Id headers are sent."""
    mock_resp = _mock_response(200, {"choices": [{"message": {"content": "ok"}}]})

    with patch("app.services.llm_gateway_client.httpx.AsyncClient") as MockClient:
        mock_instance = AsyncMock()
        mock_instance.request = AsyncMock(return_value=mock_resp)
        mock_instance.__aenter__ = AsyncMock(return_value=mock_instance)
        mock_instance.__aexit__ = AsyncMock(return_value=False)
        MockClient.return_value = mock_instance

        await client.chat_completion(
            messages=[{"role": "user", "content": "hello"}],
            model="gpt-5.4",
            user_id=42,
            tenant_id="tenant-abc",
        )

        call_args = mock_instance.request.call_args
        headers = call_args.kwargs.get("headers") or call_args[1].get("headers", {})
        assert headers["X-Internal-Token"] == "test-gateway-token"
        assert headers["X-User-Id"] == "42"
        assert headers["X-Tenant-Id"] == "tenant-abc"
        assert "x-trace-id" in headers


@pytest.mark.asyncio
async def test_chat_completion_sends_correct_body(client):
    """Messages, model, and response_format are sent in the body."""
    mock_resp = _mock_response(200, {"choices": []})

    with patch("app.services.llm_gateway_client.httpx.AsyncClient") as MockClient:
        mock_instance = AsyncMock()
        mock_instance.request = AsyncMock(return_value=mock_resp)
        mock_instance.__aenter__ = AsyncMock(return_value=mock_instance)
        mock_instance.__aexit__ = AsyncMock(return_value=False)
        MockClient.return_value = mock_instance

        await client.chat_completion(
            messages=[{"role": "user", "content": "test"}],
            model="gpt-5.4",
            user_id=1,
            response_format={"type": "json_object"},
            temperature=0.5,
        )

        call_args = mock_instance.request.call_args
        body = call_args.kwargs.get("json") or call_args[1].get("json", {})
        assert body["model"] == "gpt-5.4"
        assert body["messages"] == [{"role": "user", "content": "test"}]
        assert body["response_format"] == {"type": "json_object"}
        assert body["temperature"] == 0.5


@pytest.mark.asyncio
async def test_vision_call_constructs_image_blocks(client):
    """vision_call builds OpenAI-format image content blocks."""
    mock_resp = _mock_response(200, {"choices": [{"message": {"content": "screenshot analysis"}}]})

    with patch("app.services.llm_gateway_client.httpx.AsyncClient") as MockClient:
        mock_instance = AsyncMock()
        mock_instance.request = AsyncMock(return_value=mock_resp)
        mock_instance.__aenter__ = AsyncMock(return_value=mock_instance)
        mock_instance.__aexit__ = AsyncMock(return_value=False)
        MockClient.return_value = mock_instance

        await client.vision_call(
            prompt="What do you see?",
            screenshot_b64="aGVsbG8=",
            model="gpt-4o",
            user_id=1,
        )

        call_args = mock_instance.request.call_args
        body = call_args.kwargs.get("json") or call_args[1].get("json", {})
        messages = body["messages"]
        assert len(messages) == 1
        assert messages[0]["role"] == "user"
        content = messages[0]["content"]
        assert len(content) == 2
        assert content[0]["type"] == "text"
        assert content[1]["type"] == "image_url"
        assert content[1]["image_url"]["url"] == "data:image/png;base64,aGVsbG8="


@pytest.mark.asyncio
async def test_service_account_mode_omits_user_id(client):
    """When user_id is None, X-User-Id header is not sent."""
    mock_resp = _mock_response(200, {"choices": []})

    with patch("app.services.llm_gateway_client.httpx.AsyncClient") as MockClient:
        mock_instance = AsyncMock()
        mock_instance.request = AsyncMock(return_value=mock_resp)
        mock_instance.__aenter__ = AsyncMock(return_value=mock_instance)
        mock_instance.__aexit__ = AsyncMock(return_value=False)
        MockClient.return_value = mock_instance

        await client.chat_completion(
            messages=[{"role": "user", "content": "system task"}],
            model="gpt-5.4",
        )

        call_args = mock_instance.request.call_args
        headers = call_args.kwargs.get("headers") or call_args[1].get("headers", {})
        assert "X-User-Id" not in headers
        assert headers["X-Internal-Token"] == "test-gateway-token"


@pytest.mark.asyncio
async def test_http_402_raises_insufficient_credits(client):
    """HTTP 402 raises InsufficientCreditsError."""
    mock_resp = _mock_response(402)

    with patch("app.services.llm_gateway_client.httpx.AsyncClient") as MockClient:
        mock_instance = AsyncMock()
        mock_instance.request = AsyncMock(return_value=mock_resp)
        mock_instance.__aenter__ = AsyncMock(return_value=mock_instance)
        mock_instance.__aexit__ = AsyncMock(return_value=False)
        MockClient.return_value = mock_instance

        with pytest.raises(InsufficientCreditsError) as exc_info:
            await client.chat_completion(
                messages=[{"role": "user", "content": "test"}],
                model="gpt-5.4",
                user_id=1,
            )
        assert exc_info.value.trace_id != ""


@pytest.mark.asyncio
async def test_http_429_retries_with_retry_after(client):
    """HTTP 429 retries using Retry-After header value."""
    mock_429 = _mock_response(429, headers={"retry-after": "0.01"})
    mock_200 = _mock_response(200, {"choices": []})

    with patch("app.services.llm_gateway_client.httpx.AsyncClient") as MockClient:
        mock_instance = AsyncMock()
        mock_instance.request = AsyncMock(side_effect=[mock_429, mock_200])
        mock_instance.__aenter__ = AsyncMock(return_value=mock_instance)
        mock_instance.__aexit__ = AsyncMock(return_value=False)
        MockClient.return_value = mock_instance

        result = await client.chat_completion(
            messages=[{"role": "user", "content": "test"}],
            model="gpt-5.4",
            user_id=1,
        )
        assert result == {"choices": []}
        assert mock_instance.request.call_count == 2


@pytest.mark.asyncio
async def test_http_429_gives_up_after_3_retries(client):
    """HTTP 429 gives up after 3 retries and raises GatewayUnavailableError."""
    mock_429 = _mock_response(429, headers={"retry-after": "0.01"})

    with patch("app.services.llm_gateway_client.httpx.AsyncClient") as MockClient:
        mock_instance = AsyncMock()
        mock_instance.request = AsyncMock(return_value=mock_429)
        mock_instance.__aenter__ = AsyncMock(return_value=mock_instance)
        mock_instance.__aexit__ = AsyncMock(return_value=False)
        MockClient.return_value = mock_instance

        with pytest.raises(GatewayUnavailableError):
            await client.chat_completion(
                messages=[{"role": "user", "content": "test"}],
                model="gpt-5.4",
                user_id=1,
            )


@pytest.mark.asyncio
async def test_http_5xx_retries_once(client):
    """HTTP 5xx retries once then raises GatewayUnavailableError."""
    mock_500 = _mock_response(500)

    with patch("app.services.llm_gateway_client.httpx.AsyncClient") as MockClient:
        mock_instance = AsyncMock()
        mock_instance.request = AsyncMock(return_value=mock_500)
        mock_instance.__aenter__ = AsyncMock(return_value=mock_instance)
        mock_instance.__aexit__ = AsyncMock(return_value=False)
        MockClient.return_value = mock_instance

        with pytest.raises(GatewayUnavailableError):
            await client.chat_completion(
                messages=[{"role": "user", "content": "test"}],
                model="gpt-5.4",
                user_id=1,
            )
        assert mock_instance.request.call_count == 2


@pytest.mark.asyncio
async def test_timeout_raises_gateway_unavailable(client):
    """Timeout raises GatewayUnavailableError with traceId."""
    with patch("app.services.llm_gateway_client.httpx.AsyncClient") as MockClient:
        mock_instance = AsyncMock()
        mock_instance.request = AsyncMock(side_effect=httpx.TimeoutException("timed out"))
        mock_instance.__aenter__ = AsyncMock(return_value=mock_instance)
        mock_instance.__aexit__ = AsyncMock(return_value=False)
        MockClient.return_value = mock_instance

        with pytest.raises(GatewayUnavailableError) as exc_info:
            await client.chat_completion(
                messages=[{"role": "user", "content": "test"}],
                model="gpt-5.4",
                user_id=1,
            )
        assert exc_info.value.trace_id != ""


@pytest.mark.asyncio
async def test_successful_response_returns_parsed_json(client):
    """Successful response returns parsed JSON with usage data."""
    expected = {
        "choices": [{"message": {"content": "Hello!"}}],
        "usage": {"prompt_tokens": 10, "completion_tokens": 5, "total_tokens": 15},
    }
    mock_resp = _mock_response(200, expected)

    with patch("app.services.llm_gateway_client.httpx.AsyncClient") as MockClient:
        mock_instance = AsyncMock()
        mock_instance.request = AsyncMock(return_value=mock_resp)
        mock_instance.__aenter__ = AsyncMock(return_value=mock_instance)
        mock_instance.__aexit__ = AsyncMock(return_value=False)
        MockClient.return_value = mock_instance

        result = await client.chat_completion(
            messages=[{"role": "user", "content": "test"}],
            model="gpt-5.4",
            user_id=1,
        )
        assert result == expected
        assert result["usage"]["total_tokens"] == 15
