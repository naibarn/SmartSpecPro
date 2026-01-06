from __future__ import annotations

import asyncio
import uuid
from typing import Any, AsyncIterator, Dict, Optional, Tuple

import httpx

from app.core.config import settings


def _auth_headers(trace_id: str) -> Dict[str, str]:
    h: Dict[str, str] = {"x-trace-id": trace_id}
    if settings.SMARTSPEC_WEB_GATEWAY_TOKEN:
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


async def forward_chat_json(payload: Dict[str, Any], trace_id: Optional[str] = None) -> httpx.Response:
    base, _ = _base_urls()
    if not base:
        raise RuntimeError("SMARTSPEC_WEB_GATEWAY_URL not configured")
    tid = _trace_id(trace_id)
    url = f"{base}/v1/chat/completions"
    return await _request_with_retries(
        "POST",
        url,
        json=payload,
        headers={**_auth_headers(tid), "Content-Type": "application/json"},
    )


async def forward_chat_stream(payload: Dict[str, Any], trace_id: Optional[str] = None) -> AsyncIterator[bytes]:
    base, _ = _base_urls()
    if not base:
        raise RuntimeError("SMARTSPEC_WEB_GATEWAY_URL not configured")
    tid = _trace_id(trace_id)
    url = f"{base}/v1/chat/completions"
    headers = {**_auth_headers(tid), "Content-Type": "application/json"}

    timeout = httpx.Timeout(settings.SMARTSPEC_WEB_GATEWAY_TIMEOUT_SECONDS)
    async with httpx.AsyncClient(timeout=timeout) as client:
        async with client.stream("POST", url, json={**payload, "stream": True}, headers=headers) as r:
            r.raise_for_status()
            async for chunk in r.aiter_bytes():
                if chunk:
                    yield chunk


async def forward_models(trace_id: Optional[str] = None) -> httpx.Response:
    base, _ = _base_urls()
    if not base:
        raise RuntimeError("SMARTSPEC_WEB_GATEWAY_URL not configured")
    tid = _trace_id(trace_id)
    url = f"{base}/v1/models"
    return await _request_with_retries("GET", url, headers=_auth_headers(tid))


async def mcp_tools(trace_id: Optional[str] = None) -> httpx.Response:
    _, mcp = _base_urls()
    if not mcp:
        raise RuntimeError("SMARTSPEC_MCP_BASE_URL not configured")
    tid = _trace_id(trace_id)
    url = f"{mcp}/mcp/tools"
    return await _request_with_retries("GET", url, headers=_auth_headers(tid))


async def mcp_call(
    name: str,
    arguments: Dict[str, Any],
    *,
    trace_id: Optional[str] = None,
    write_token: Optional[str] = None,
) -> httpx.Response:
    _, mcp = _base_urls()
    if not mcp:
        raise RuntimeError("SMARTSPEC_MCP_BASE_URL not configured")
    tid = _trace_id(trace_id)
    url = f"{mcp}/mcp/call"
    extra: Dict[str, str] = {}
    if write_token:
        extra["x-mcp-write-token"] = write_token
    headers = {**_auth_headers(tid), **extra, "Content-Type": "application/json"}
    return await _request_with_retries("POST", url, json={"name": name, "arguments": arguments}, headers=headers)
