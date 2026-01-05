from __future__ import annotations

import json
import os
from typing import Any, Dict, List, Optional, Tuple, AsyncIterator

import httpx
from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

router = APIRouter(tags=["llm-openai-compat"])

# Where to forward OpenAI-compatible requests (SmartSpecWeb gateway)
SMARTSPEC_WEB_GATEWAY_URL = os.getenv("SMARTSPEC_WEB_GATEWAY_URL", "").rstrip("/")
SMARTSPEC_WEB_GATEWAY_KEY = os.getenv("SMARTSPEC_WEB_GATEWAY_KEY", "")

# Security: localhost-only by default (desktop-facing)
LOCALHOST_ONLY = os.getenv("LLM_PROXY_LOCALHOST_ONLY", "1") != "0"

# Tool loop safety
MAX_TOOL_ITERS = int(os.getenv("LLM_PROXY_MAX_TOOL_ITERS", "8"))
MCP_TIMEOUT_SECONDS = float(os.getenv("LLM_PROXY_MCP_TIMEOUT_SECONDS", "20"))
GATEWAY_TIMEOUT_SECONDS = float(os.getenv("LLM_PROXY_GATEWAY_TIMEOUT_SECONDS", "90"))

# Tools auto-discovery
AUTO_MCP_TOOLS = os.getenv("LLM_PROXY_AUTO_MCP_TOOLS", "1") != "0"

# Optional allowlist for MCP tools (comma-separated). If empty -> allow all tools exposed by MCP.
MCP_ALLOWLIST = [t.strip() for t in os.getenv("MCP_TOOL_ALLOWLIST", "").split(",") if t.strip()]


def _localhost_only(request: Request):
    if not LOCALHOST_ONLY:
        return
    host = request.client.host if request.client else ""
    if host not in ("127.0.0.1", "localhost", "::1"):
        raise HTTPException(status_code=403, detail="localhost_only")


def _gateway_headers() -> Dict[str, str]:
    h: Dict[str, str] = {"content-type": "application/json"}
    if SMARTSPEC_WEB_GATEWAY_KEY:
        h["x-gateway-key"] = SMARTSPEC_WEB_GATEWAY_KEY
    return h


def _require_gateway():
    if not SMARTSPEC_WEB_GATEWAY_URL:
        raise HTTPException(status_code=500, detail="SMARTSPEC_WEB_GATEWAY_URL_not_set")


class OpenAIChatRequest(BaseModel):
    model: str = "gpt-4.1-mini"
    messages: List[Dict[str, Any]]
    stream: bool = False
    tools: Optional[List[Dict[str, Any]]] = None
    tool_choice: Optional[Any] = None
    temperature: Optional[float] = None
    max_tokens: Optional[int] = None
    response_format: Optional[Dict[str, Any]] = None
    metadata: Optional[Dict[str, Any]] = None
    extra: Dict[str, Any] = Field(default_factory=dict)

    model_config = {"extra": "allow"}


def _extract_tool_calls(resp_json: Dict[str, Any]) -> List[Dict[str, Any]]:
    try:
        msg = resp_json["choices"][0]["message"]
        return msg.get("tool_calls") or []
    except Exception:
        return []


def _append_assistant_toolcall_message(messages: List[Dict[str, Any]], resp_json: Dict[str, Any]) -> None:
    msg = resp_json.get("choices", [{}])[0].get("message", {})
    if not msg:
        return
    out: Dict[str, Any] = {"role": "assistant"}
    if "content" in msg:
        out["content"] = msg.get("content")
    if msg.get("tool_calls"):
        out["tool_calls"] = msg["tool_calls"]
    if msg.get("name"):
        out["name"] = msg["name"]
    messages.append(out)


async def _call_gateway_chat(payload: Dict[str, Any]) -> Dict[str, Any]:
    _require_gateway()
    url = f"{SMARTSPEC_WEB_GATEWAY_URL}/api/v1/llm/openai/chat/completions"
    async with httpx.AsyncClient(timeout=GATEWAY_TIMEOUT_SECONDS) as client:
        r = await client.post(url, headers=_gateway_headers(), json=payload)
        if r.status_code >= 400:
            raise HTTPException(status_code=502, detail=f"gateway_error:{r.status_code}:{r.text}")
        return r.json()


async def _stream_gateway_chat(payload: Dict[str, Any]) -> AsyncIterator[bytes]:
    # Streams text/event-stream bytes from SmartSpecWeb gateway.
    _require_gateway()
    url = f"{SMARTSPEC_WEB_GATEWAY_URL}/api/v1/llm/openai/chat/completions"
    async with httpx.AsyncClient(timeout=None) as client:
        async with client.stream("POST", url, headers=_gateway_headers(), json=payload) as r:
            if r.status_code >= 400:
                text = await r.aread()
                raise HTTPException(status_code=502, detail=f"gateway_error:{r.status_code}:{text.decode('utf-8', errors='ignore')}")
            async for chunk in r.aiter_bytes():
                if chunk:
                    yield chunk


async def _call_mcp_tool(name: str, arguments: Any) -> Tuple[bool, str]:
    _require_gateway()
    if MCP_ALLOWLIST and name not in MCP_ALLOWLIST:
        return False, f"tool_not_allowed:{name}"

    url = f"{SMARTSPEC_WEB_GATEWAY_URL}/api/mcp/invoke"
    payload = {"name": name, "arguments": arguments}
    async with httpx.AsyncClient(timeout=MCP_TIMEOUT_SECONDS) as client:
        r = await client.post(url, headers=_gateway_headers(), json=payload)
        if r.status_code >= 400:
            return False, f"mcp_error:{r.status_code}:{r.text}"
        try:
            data = r.json()
            return True, json.dumps(data, ensure_ascii=False)
        except Exception:
            return True, r.text


async def _fetch_mcp_tools() -> Optional[List[Dict[str, Any]]]:
    # Fetch tools from SmartSpecWeb MCP server and convert to OpenAI tools list.
    _require_gateway()
    url = f"{SMARTSPEC_WEB_GATEWAY_URL}/api/mcp/tools"
    async with httpx.AsyncClient(timeout=10) as client:
        r = await client.get(url, headers=_gateway_headers())
        if r.status_code >= 400:
            return None
        data = r.json()
        tools = data.get("tools") if isinstance(data, dict) else None
        if not isinstance(tools, list):
            return None
        out: List[Dict[str, Any]] = []
        for t in tools:
            if not isinstance(t, dict):
                continue
            fn = t.get("function") or {}
            name = fn.get("name")
            if not name:
                continue
            if MCP_ALLOWLIST and name not in MCP_ALLOWLIST:
                continue
            out.append({"type": "function", "function": fn})
        return out


def _parse_arguments(arg_str: Any) -> Any:
    if arg_str is None:
        return {}
    if isinstance(arg_str, (dict, list)):
        return arg_str
    s = str(arg_str).strip()
    if not s:
        return {}
    try:
        return json.loads(s)
    except Exception:
        return {"raw": s}


def _sse_wrap_single_json(resp_json: Dict[str, Any]) -> bytes:
    # Fallback if upstream doesn't stream: return an SSE-shaped response.
    chunk = {
        "id": resp_json.get("id", "chatcmpl_fallback"),
        "object": "chat.completion.chunk",
        "created": resp_json.get("created", 0),
        "model": resp_json.get("model", "unknown"),
        "choices": [
            {
                "index": 0,
                "delta": {"content": resp_json.get("choices", [{}])[0].get("message", {}).get("content", "")},
                "finish_reason": "stop",
            }
        ],
    }
    return (f"data: {json.dumps(chunk, ensure_ascii=False)}\n\n" + "data: [DONE]\n\n").encode("utf-8")


async def _run_tool_loop_until_ready(payload: Dict[str, Any]) -> Dict[str, Any]:
    # Run non-streaming tool loop until response has no tool_calls.
    resp = await _call_gateway_chat(payload)
    for _ in range(MAX_TOOL_ITERS):
        tool_calls = _extract_tool_calls(resp)
        if not tool_calls:
            return resp

        messages: List[Dict[str, Any]] = payload.get("messages") or []
        _append_assistant_toolcall_message(messages, resp)

        for tc in tool_calls:
            tc_id = tc.get("id") or ""
            fn = (tc.get("function") or {})
            name = fn.get("name") or ""
            args = _parse_arguments(fn.get("arguments"))
            ok, content = await _call_mcp_tool(name, args)
            messages.append(
                {
                    "role": "tool",
                    "tool_call_id": tc_id,
                    "content": content if ok else f"ERROR: {content}",
                }
            )

        resp = await _call_gateway_chat(payload)

    return resp


@router.post("/v1/chat/completions")
async def chat_completions(req: OpenAIChatRequest, request: Request):
    # OpenAI-compatible chat completions proxy with:
    # - Automatic MCP tool execution (tool loop)
    # - Streaming (SSE) for final assistant answer
    _localhost_only(request)

    payload = req.model_dump(exclude={"extra"}, by_alias=True)
    payload.update(req.extra)

    messages: List[Dict[str, Any]] = list(payload.get("messages") or [])
    payload["messages"] = messages

    # Auto-inject MCP tools if none provided
    if AUTO_MCP_TOOLS and not payload.get("tools"):
        tools = await _fetch_mcp_tools()
        if tools:
            payload["tools"] = tools
            if payload.get("tool_choice") is None:
                payload["tool_choice"] = "auto"

    if not req.stream:
        payload["stream"] = False
        return await _run_tool_loop_until_ready(payload)

    # Streaming: internal tool loop (non-stream) then final stream
    payload["stream"] = False
    final_non_stream = await _run_tool_loop_until_ready(payload)

    # Now stream final answer for real-time tokens
    payload["stream"] = True

    async def gen():
        try:
            async for chunk in _stream_gateway_chat(payload):
                yield chunk
        except Exception:
            yield _sse_wrap_single_json(final_non_stream)

    return StreamingResponse(gen(), media_type="text/event-stream")


@router.post("/api/v1/llm/openai/chat/completions")
async def chat_completions_alias(req: OpenAIChatRequest, request: Request):
    return await chat_completions(req, request)


@router.get("/v1/models")
async def models(request: Request):
    _localhost_only(request)
    return {
        "object": "list",
        "data": [
            {"id": "gpt-4.1-mini", "object": "model"},
            {"id": "gpt-4.1", "object": "model"},
        ],
    }
