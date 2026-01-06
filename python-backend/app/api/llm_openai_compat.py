from __future__ import annotations

import asyncio
import json
import os
import time
import uuid
import hashlib
from datetime import datetime, timezone, timedelta
from typing import Any, Dict, List, Optional, Tuple, AsyncIterator, Callable

import httpx
from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

router = APIRouter(tags=["llm-openai-compat"])

SMARTSPEC_WEB_GATEWAY_URL = os.getenv("SMARTSPEC_WEB_GATEWAY_URL", "").rstrip("/")
SMARTSPEC_WEB_GATEWAY_KEY = os.getenv("SMARTSPEC_WEB_GATEWAY_KEY", "")

LOCALHOST_ONLY = os.getenv("LLM_PROXY_LOCALHOST_ONLY", "1") != "0"

MAX_TOOL_ITERS = int(os.getenv("LLM_PROXY_MAX_TOOL_ITERS", "8"))
MCP_TIMEOUT_SECONDS = float(os.getenv("LLM_PROXY_MCP_TIMEOUT_SECONDS", "20"))
GATEWAY_TIMEOUT_SECONDS = float(os.getenv("LLM_PROXY_GATEWAY_TIMEOUT_SECONDS", "90"))

AUTO_MCP_TOOLS = os.getenv("LLM_PROXY_AUTO_MCP_TOOLS", "1") != "0"

MCP_ALLOWLIST = [t.strip() for t in os.getenv("MCP_TOOL_ALLOWLIST", "").split(",") if t.strip()]

# Write approval
APPROVAL_TOOLS = [t.strip() for t in os.getenv("LLM_PROXY_APPROVAL_TOOLS", "workspace_write_file").split(",") if t.strip()]
APPROVAL_TIMEOUT_SECONDS = float(os.getenv("LLM_PROXY_APPROVAL_TIMEOUT_SECONDS", "120"))
AUTO_APPROVE_NONSTREAM = os.getenv("LLM_PROXY_AUTO_APPROVE_NONSTREAM", "0") == "1"

# Audit log (rotation + retention)
AUDIT_LOG_PATH = os.getenv("LLM_AUDIT_LOG_PATH", "").strip() or "logs/llm_tool_audit.jsonl"
AUDIT_ROTATE_DAILY = os.getenv("LLM_AUDIT_ROTATE_DAILY", "1") != "0"
AUDIT_RETENTION_DAYS = int(os.getenv("LLM_AUDIT_RETENTION_DAYS", "30"))

# In-memory approval store (best for single-process dev; for production use redis/db)
_APPROVAL_LOCK = asyncio.Lock()
_APPROVALS: Dict[str, Dict[str, Any]] = {}  # key -> {"event": asyncio.Event, "approved": bool|None, "writeToken": str|None}


def _approval_key(trace_id: str, tool_call_id: str) -> str:
    return f"{trace_id}:{tool_call_id}"


async def _approval_wait(trace_id: str, tool_call_id: str) -> Dict[str, Any]:
    key = _approval_key(trace_id, tool_call_id)
    async with _APPROVAL_LOCK:
        entry = _APPROVALS.get(key)
        if not entry:
            entry = {"event": asyncio.Event(), "approved": None, "writeToken": None, "created": time.time()}
            _APPROVALS[key] = entry

    try:
        await asyncio.wait_for(entry["event"].wait(), timeout=APPROVAL_TIMEOUT_SECONDS)
    except asyncio.TimeoutError:
        return {"approved": False, "reason": "approval_timeout"}

    approved = entry.get("approved")
    tok = entry.get("writeToken")
    return {"approved": bool(approved), "writeToken": tok}


async def _approval_set(trace_id: str, tool_call_id: str, approved: bool, write_token: Optional[str]) -> None:
    key = _approval_key(trace_id, tool_call_id)
    async with _APPROVAL_LOCK:
        entry = _APPROVALS.get(key)
        if not entry:
            entry = {"event": asyncio.Event(), "approved": None, "writeToken": None, "created": time.time()}
            _APPROVALS[key] = entry
        entry["approved"] = bool(approved)
        entry["writeToken"] = write_token
        entry["event"].set()


async def _approval_gc() -> None:
    now = time.time()
    async with _APPROVAL_LOCK:
        for k in list(_APPROVALS.keys()):
            entry = _APPROVALS[k]
            if now - float(entry.get("created", now)) > (APPROVAL_TIMEOUT_SECONDS + 60):
                _APPROVALS.pop(k, None)


def _localhost_only(request: Request):
    if not LOCALHOST_ONLY:
        return
    host = request.client.host if request.client else ""
    if host not in ("127.0.0.1", "localhost", "::1"):
        raise HTTPException(status_code=403, detail="localhost_only")


def _require_gateway():
    if not SMARTSPEC_WEB_GATEWAY_URL:
        raise HTTPException(status_code=500, detail="SMARTSPEC_WEB_GATEWAY_URL_not_set")


def _ensure_dir_for_file(path: str):
    d = os.path.dirname(path)
    if d:
        os.makedirs(d, exist_ok=True)


def _sha256_json(obj: Any) -> str:
    try:
        b = json.dumps(obj, sort_keys=True, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    except Exception:
        b = str(obj).encode("utf-8", errors="ignore")
    return hashlib.sha256(b).hexdigest()


def _audit_resolve_path(base_path: str) -> str:
    if not AUDIT_ROTATE_DAILY:
        return base_path
    date = datetime.now(timezone.utc).strftime("%Y%m%d")
    if "{date}" in base_path:
        return base_path.replace("{date}", date)
    if base_path.endswith(".jsonl"):
        return base_path[:-5] + f".{date}.jsonl"
    return base_path + f".{date}"


def _audit_retention_cleanup(base_path: str):
    if not AUDIT_ROTATE_DAILY or AUDIT_RETENTION_DAYS <= 0:
        return
    try:
        base_dir = os.path.dirname(base_path) or "."
        base_name = os.path.basename(base_path)
        if base_name.endswith(".jsonl"):
            prefix = base_name[:-5] + "."
            suffix = ".jsonl"
        else:
            prefix = base_name + "."
            suffix = ""
        cutoff = datetime.now(timezone.utc) - timedelta(days=AUDIT_RETENTION_DAYS)
        for fn in os.listdir(base_dir):
            if not fn.startswith(prefix) or (suffix and not fn.endswith(suffix)):
                continue
            mid = fn[len(prefix):]
            if suffix and mid.endswith(suffix):
                mid = mid[:-len(suffix)]
            if len(mid) != 8 or not mid.isdigit():
                continue
            dt = datetime.strptime(mid, "%Y%m%d").replace(tzinfo=timezone.utc)
            if dt < cutoff:
                try:
                    os.remove(os.path.join(base_dir, fn))
                except Exception:
                    pass
    except Exception:
        pass


def _audit(event: Dict[str, Any]):
    """
    Best-effort append JSONL.
    We intentionally do NOT log raw tool arguments/results; only hashes + metadata.
    """
    try:
        path = _audit_resolve_path(AUDIT_LOG_PATH)
        _ensure_dir_for_file(path)
        with open(path, "a", encoding="utf-8") as f:
            f.write(json.dumps(event, ensure_ascii=False) + "\n")
        _audit_retention_cleanup(AUDIT_LOG_PATH)
    except Exception:
        pass


def _gateway_headers(trace_id: str) -> Dict[str, str]:
    h: Dict[str, str] = {"content-type": "application/json", "x-trace-id": trace_id}
    if SMARTSPEC_WEB_GATEWAY_KEY:
        h["x-gateway-key"] = SMARTSPEC_WEB_GATEWAY_KEY
    return h


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


class ToolApproveRequest(BaseModel):
    traceId: str
    toolCallId: str
    approved: bool
    writeToken: Optional[str] = None


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


async def _call_gateway_chat(payload: Dict[str, Any], trace_id: str) -> Dict[str, Any]:
    _require_gateway()
    url = f"{SMARTSPEC_WEB_GATEWAY_URL}/api/v1/llm/openai/chat/completions"
    async with httpx.AsyncClient(timeout=GATEWAY_TIMEOUT_SECONDS) as client:
        r = await client.post(url, headers=_gateway_headers(trace_id), json=payload)
        if r.status_code >= 400:
            raise HTTPException(status_code=502, detail=f"gateway_error:{r.status_code}:{r.text}")
        return r.json()


async def _stream_gateway_chat(payload: Dict[str, Any], trace_id: str) -> AsyncIterator[bytes]:
    _require_gateway()
    url = f"{SMARTSPEC_WEB_GATEWAY_URL}/api/v1/llm/openai/chat/completions"
    async with httpx.AsyncClient(timeout=None) as client:
        async with client.stream("POST", url, headers=_gateway_headers(trace_id), json=payload) as r:
            if r.status_code >= 400:
                text = await r.aread()
                raise HTTPException(status_code=502, detail=f"gateway_error:{r.status_code}:{text.decode('utf-8', errors='ignore')}")
            async for chunk in r.aiter_bytes():
                if chunk:
                    yield chunk


async def _fetch_mcp_tools(trace_id: str) -> Optional[List[Dict[str, Any]]]:
    _require_gateway()
    url = f"{SMARTSPEC_WEB_GATEWAY_URL}/api/mcp/tools"
    async with httpx.AsyncClient(timeout=10) as client:
        r = await client.get(url, headers=_gateway_headers(trace_id))
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


async def _call_mcp_tool(name: str, arguments: Any, trace_id: str) -> Tuple[bool, str, str]:
    _require_gateway()
    if MCP_ALLOWLIST and name not in MCP_ALLOWLIST:
        out = {"ok": False, "name": name, "error": "tool_not_allowed"}
        return False, json.dumps(out, ensure_ascii=False), _sha256_json(out)

    url = f"{SMARTSPEC_WEB_GATEWAY_URL}/api/mcp/invoke"
    payload = {"name": name, "arguments": arguments}
    started = time.time()
    async with httpx.AsyncClient(timeout=MCP_TIMEOUT_SECONDS) as client:
        r = await client.post(url, headers=_gateway_headers(trace_id), json=payload)
        took_ms = int((time.time() - started) * 1000)

        if r.status_code >= 400:
            out = {"ok": False, "name": name, "error": f"mcp_http_{r.status_code}", "detail": r.text, "took_ms": took_ms}
            return False, json.dumps(out, ensure_ascii=False), _sha256_json(out)

        try:
            data = r.json()
            data.setdefault("took_ms", took_ms)
            return True, json.dumps(data, ensure_ascii=False), _sha256_json(data)
        except Exception:
            out = {"ok": True, "name": name, "result": r.text, "took_ms": took_ms}
            return True, json.dumps(out, ensure_ascii=False), _sha256_json(out)


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


def _sse_event(event: str, data: Dict[str, Any]) -> bytes:
    return (f"event: {event}\n" + f"data: {json.dumps(data, ensure_ascii=False)}\n\n").encode("utf-8")


async def _require_approval_if_needed(tool_name: str, trace_id: str, tool_call_id: str, emit: Callable[[bytes], None], is_stream: bool) -> Dict[str, Any]:
    if tool_name not in APPROVAL_TOOLS:
        return {"approved": True}

    if not is_stream and not AUTO_APPROVE_NONSTREAM:
        emit(_sse_event("tool_approval_required", {"traceId": trace_id, "toolCallId": tool_call_id, "name": tool_name, "reason": "nonstream_denied"}))
        return {"approved": False, "reason": "nonstream_denied"}

    emit(_sse_event("tool_approval_required", {"traceId": trace_id, "toolCallId": tool_call_id, "name": tool_name}))
    decision = await _approval_wait(trace_id, tool_call_id)
    return decision


async def _tool_loop_with_status(payload: Dict[str, Any], trace_id: str, emit: Callable[[bytes], None], is_stream: bool) -> None:
    resp = await _call_gateway_chat(payload, trace_id)
    for _ in range(MAX_TOOL_ITERS):
        tool_calls = _extract_tool_calls(resp)
        if not tool_calls:
            return

        messages: List[Dict[str, Any]] = payload.get("messages") or []
        _append_assistant_toolcall_message(messages, resp)

        for tc in tool_calls:
            tc_id = tc.get("id") or ""
            fn = (tc.get("function") or {})
            name = fn.get("name") or "unknown_tool"
            args = _parse_arguments(fn.get("arguments"))
            args_hash = _sha256_json(args)

            emit(_sse_event("tool_status", {"traceId": trace_id, "phase": "start", "name": name, "toolCallId": tc_id, "argsHash": args_hash}))

            approval = await _require_approval_if_needed(name, trace_id, tc_id, emit, is_stream=is_stream)
            if not approval.get("approved", False):
                reason = approval.get("reason", "not_approved")
                deny_obj = {"ok": False, "name": name, "error": f"write_not_approved:{reason}"}
                content = json.dumps(deny_obj, ensure_ascii=False)
                result_hash = _sha256_json(deny_obj)

                _audit({
                    "ts": int(time.time() * 1000),
                    "traceId": trace_id,
                    "tool": name,
                    "toolCallId": tc_id,
                    "argsHash": args_hash,
                    "resultHash": result_hash,
                    "ok": False,
                })

                emit(_sse_event("tool_status", {"traceId": trace_id, "phase": "end", "name": name, "toolCallId": tc_id, "ok": False, "resultHash": result_hash, "message": "not_approved"}))
                messages.append({"role": "tool", "tool_call_id": tc_id, "content": f"ERROR: {content}"})
                continue

            if approval.get("writeToken") and isinstance(args, dict):
                args = dict(args)
                args.setdefault("writeToken", approval["writeToken"])

            ok, content, result_hash = await _call_mcp_tool(name, args, trace_id)

            _audit({
                "ts": int(time.time() * 1000),
                "traceId": trace_id,
                "tool": name,
                "toolCallId": tc_id,
                "argsHash": args_hash,
                "resultHash": result_hash,
                "ok": ok,
            })

            emit(_sse_event("tool_status", {"traceId": trace_id, "phase": "end", "name": name, "toolCallId": tc_id, "ok": ok, "resultHash": result_hash}))

            messages.append({"role": "tool", "tool_call_id": tc_id, "content": content if ok else f"ERROR: {content}"})

        resp = await _call_gateway_chat(payload, trace_id)

    emit(_sse_event("tool_status", {"traceId": trace_id, "phase": "limit", "message": "max_tool_iters_reached"}))


@router.post("/v1/tool-approve")
async def tool_approve(req: ToolApproveRequest, request: Request):
    _localhost_only(request)
    await _approval_set(req.traceId, req.toolCallId, req.approved, req.writeToken)
    await _approval_gc()
    return {"ok": True}


@router.post("/v1/chat/completions")
async def chat_completions(req: OpenAIChatRequest, request: Request):
    _localhost_only(request)
    trace_id = request.headers.get("x-trace-id") or uuid.uuid4().hex

    payload = req.model_dump(exclude={"extra"}, by_alias=True)
    payload.update(req.extra)

    messages: List[Dict[str, Any]] = list(payload.get("messages") or [])
    payload["messages"] = messages

    if AUTO_MCP_TOOLS and not payload.get("tools"):
        tools = await _fetch_mcp_tools(trace_id)
        if tools:
            payload["tools"] = tools
            if payload.get("tool_choice") is None:
                payload["tool_choice"] = "auto"

    if not req.stream:
        await _tool_loop_with_status(payload, trace_id, emit=lambda _: None, is_stream=False)
        payload["stream"] = False
        return await _call_gateway_chat(payload, trace_id)

    payload["stream"] = False

    async def gen():
        yield _sse_event("trace", {"traceId": trace_id})

        q: List[bytes] = []

        def emit(b: bytes):
            q.append(b)

        await _tool_loop_with_status(payload, trace_id, emit=emit, is_stream=True)
        while q:
            yield q.pop(0)

        payload["stream"] = True
        try:
            async for chunk in _stream_gateway_chat(payload, trace_id):
                yield chunk
        except Exception:
            payload["stream"] = False
            resp = await _call_gateway_chat(payload, trace_id)
            chunk = {
                "id": resp.get("id", "chatcmpl_fallback"),
                "object": "chat.completion.chunk",
                "created": resp.get("created", 0),
                "model": resp.get("model", req.model),
                "choices": [{"index": 0, "delta": {"content": resp.get("choices", [{}])[0].get("message", {}).get("content", "")}, "finish_reason": "stop"}],
            }
            yield (f"data: {json.dumps(chunk, ensure_ascii=False)}\n\n").encode("utf-8")
            yield b"data: [DONE]\n\n"

    return StreamingResponse(gen(), media_type="text/event-stream")


@router.post("/api/v1/llm/openai/chat/completions")
async def chat_completions_alias(req: OpenAIChatRequest, request: Request):
    return await chat_completions(req, request)


@router.get("/v1/models")
async def models(request: Request):
    _localhost_only(request)
    return {"object": "list", "data": [{"id": "gpt-4.1-mini", "object": "model"}, {"id": "gpt-4.1", "object": "model"}]}
