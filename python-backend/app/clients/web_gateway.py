from __future__ import annotations

import asyncio
import uuid
from typing import Any, AsyncIterator, Dict, Optional, Tuple

import httpx

from app.core.config import settings


def _auth_headers(trace_id: str, user_token: Optional[str] = None) -> Dict[str, str]:
    """
    Build authorization headers for SmartSpecWeb Gateway.
    
    Priority:
    1. User token (for credit tracking per user)
    2. Gateway token (fallback for system calls)
    """
    h: Dict[str, str] = {"x-trace-id": trace_id}
    
    # Prefer user token for credit tracking
    if user_token:
        h["Authorization"] = f"Bearer {user_token}"
        # Also send as x-user-token for SmartSpecWeb to identify user
        h["x-user-token"] = user_token
    elif settings.SMARTSPEC_WEB_GATEWAY_TOKEN:
        h["Authorization"] = f"Bearer {settings.SMARTSPEC_WEB_GATEWAY_TOKEN}"
    
    return h


def _base_urls() -> Tuple[str, str]:
    base = (settings.SMARTSPEC_WEB_GATEWAY_URL or "").rstrip("/")
    mcp = (settings.SMARTSPEC_MCP_BASE_URL or base).rstrip("/")
    return base, mcp


def _trace_id(existing: Optional[str] = None) -> str:
    return existing or str(uuid.uuid4())


def _is_transient(status: int) -> bool:
    return status in (502, 503, 504)


async def _request_with_retries(
    method: str,
    url: str,
    *,
    json: Optional[Dict[str, Any]] = None,
    headers: Optional[Dict[str, str]] = None,
    stream: bool = False,
) -> httpx.Response:
    timeout = httpx.Timeout(settings.SMARTSPEC_WEB_GATEWAY_TIMEOUT_SECONDS)
    retries = max(0, int(settings.SMARTSPEC_WEB_GATEWAY_RETRIES))
    backoff = 0.25

    last_exc: Optional[Exception] = None
    for attempt in range(retries + 1):
        try:
            async with httpx.AsyncClient(timeout=timeout) as client:
                r = await client.request(method, url, json=json, headers=headers)
                if r.status_code >= 400 and _is_transient(r.status_code) and attempt < retries:
                    await asyncio.sleep(backoff * (2 ** attempt))
                    continue
                return r
        except (httpx.ConnectError, httpx.ReadTimeout, httpx.ConnectTimeout) as e:
            last_exc = e
            if attempt < retries:
                await asyncio.sleep(backoff * (2 ** attempt))
                continue
            raise
    if last_exc:
        raise last_exc
    raise RuntimeError("unreachable")


async def forward_chat_json(
    payload: Dict[str, Any],
    trace_id: Optional[str] = None,
    user_token: Optional[str] = None,
) -> httpx.Response:
    """
    Forward chat completion request to SmartSpecWeb Gateway (non-streaming).
    
    Args:
        payload: OpenAI-compatible chat completion request
        trace_id: Optional trace ID for logging
        user_token: User's auth token for credit tracking
    """
    base, _ = _base_urls()
    if not base:
        raise RuntimeError("SMARTSPEC_WEB_GATEWAY_URL not configured")
    tid = _trace_id(trace_id)
    url = f"{base}/v1/chat/completions"
    return await _request_with_retries(
        "POST",
        url,
        json=payload,
        headers={**_auth_headers(tid, user_token), "Content-Type": "application/json"},
    )


async def forward_chat_stream(
    payload: Dict[str, Any],
    trace_id: Optional[str] = None,
    user_token: Optional[str] = None,
) -> AsyncIterator[bytes]:
    """
    Forward chat completion request to SmartSpecWeb Gateway (streaming).
    
    Args:
        payload: OpenAI-compatible chat completion request
        trace_id: Optional trace ID for logging
        user_token: User's auth token for credit tracking
        
    Yields:
        Chunks of SSE data from the upstream response
    """
    base, _ = _base_urls()
    if not base:
        raise RuntimeError("SMARTSPEC_WEB_GATEWAY_URL not configured")
    tid = _trace_id(trace_id)
    url = f"{base}/v1/chat/completions"
    headers = {**_auth_headers(tid, user_token), "Content-Type": "application/json"}

    timeout = httpx.Timeout(settings.SMARTSPEC_WEB_GATEWAY_TIMEOUT_SECONDS)
    async with httpx.AsyncClient(timeout=timeout) as client:
        async with client.stream("POST", url, json={**payload, "stream": True}, headers=headers) as r:
            r.raise_for_status()
            async for chunk in r.aiter_bytes():
                if chunk:
                    yield chunk


async def forward_models(
    trace_id: Optional[str] = None,
    user_token: Optional[str] = None,
) -> httpx.Response:
    """
    Get available models from SmartSpecWeb Gateway.
    
    Args:
        trace_id: Optional trace ID for logging
        user_token: User's auth token (optional, for user-specific model access)
    """
    base, _ = _base_urls()
    if not base:
        raise RuntimeError("SMARTSPEC_WEB_GATEWAY_URL not configured")
    tid = _trace_id(trace_id)
    url = f"{base}/v1/models"
    return await _request_with_retries("GET", url, headers=_auth_headers(tid, user_token))


async def mcp_tools(
    trace_id: Optional[str] = None,
    user_token: Optional[str] = None,
) -> httpx.Response:
    """
    Get available MCP tools from SmartSpecWeb.
    
    Args:
        trace_id: Optional trace ID for logging
        user_token: User's auth token (optional)
    """
    _, mcp = _base_urls()
    if not mcp:
        raise RuntimeError("SMARTSPEC_MCP_BASE_URL not configured")
    tid = _trace_id(trace_id)
    url = f"{mcp}/mcp/tools"
    return await _request_with_retries("GET", url, headers=_auth_headers(tid, user_token))


async def mcp_call(
    name: str,
    arguments: Dict[str, Any],
    *,
    trace_id: Optional[str] = None,
    write_token: Optional[str] = None,
    user_token: Optional[str] = None,
) -> httpx.Response:
    """
    Call an MCP tool on SmartSpecWeb.
    
    Args:
        name: Tool name
        arguments: Tool arguments
        trace_id: Optional trace ID for logging
        write_token: Optional write token for write operations
        user_token: User's auth token for credit tracking
    """
    _, mcp = _base_urls()
    if not mcp:
        raise RuntimeError("SMARTSPEC_MCP_BASE_URL not configured")
    tid = _trace_id(trace_id)
    url = f"{mcp}/mcp/call"
    extra: Dict[str, str] = {}
    if write_token:
        extra["x-mcp-write-token"] = write_token
    headers = {**_auth_headers(tid, user_token), **extra, "Content-Type": "application/json"}
    return await _request_with_retries("POST", url, json={"name": name, "arguments": arguments}, headers=headers)


async def get_user_credits(
    user_token: str,
    trace_id: Optional[str] = None,
) -> httpx.Response:
    """
    Get user's credit balance from SmartSpecWeb.
    
    Args:
        user_token: User's auth token
        trace_id: Optional trace ID for logging
    """
    base, _ = _base_urls()
    if not base:
        raise RuntimeError("SMARTSPEC_WEB_GATEWAY_URL not configured")
    tid = _trace_id(trace_id)
    url = f"{base}/api/v1/credits/balance"
    return await _request_with_retries("GET", url, headers=_auth_headers(tid, user_token))
