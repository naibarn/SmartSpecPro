#!/usr/bin/env python3
"""Runtime streaming probe (SSE token flow) without external gateway.

We verify:
- /v1/chat/completions with stream=true returns SSE
- at least 1 data chunk contains assistant text (delta/content)
- terminates with [DONE]
- does not emit tool-status or approval events for a simple text-only completion

Output: _cov/streaming_snapshot.json
"""

from __future__ import annotations

import argparse
import json
import os
import time
from typing import Any, Dict

from fastapi import FastAPI
from fastapi.testclient import TestClient


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default="_cov/streaming_snapshot.json")
    args = ap.parse_args()

    # Prefer the proxy's own streaming implementation (no tools).
    os.environ.setdefault("LLM_PROXY_LOCALHOST_ONLY", "0")
    os.environ.setdefault("SMARTSPEC_WEB_GATEWAY_URL", "")
    os.environ.setdefault("LLM_PROXY_AUTO_MCP_TOOLS", "0")
    os.environ.setdefault("LLM_PROXY_APPROVAL_TOOLS", "")
    os.environ.setdefault("LLM_PROXY_MAX_TOOL_ITERS", "1")

    from app.api import llm_openai_compat as mod  # type: ignore

    mod.LOCALHOST_ONLY = False
    mod.AUTO_MCP_TOOLS = False
    mod.MAX_TOOL_ITERS = 1

    # Mock gateway call: return a plain text assistant response.
    async def fake_call_gateway_chat(payload, trace_id):
        return {
            "id": "chatcmpl_stream_1",
            "object": "chat.completion",
            "created": 0,
            "model": payload.get("model", "gpt-4.1-mini"),
            "choices": [
                {
                    "index": 0,
                    "message": {"role": "assistant", "content": "Hello streaming world!"},
                    "finish_reason": "stop",
                }
            ],
        }

    # If implementation uses gateway stream, provide a minimal stream too (harmless).
    async def fake_stream_gateway_chat(payload, trace_id):
        # Standard OpenAI SSE "data: {json}" lines.
        chunks = [
            {"id": "chatcmpl_stream_1", "object": "chat.completion.chunk", "created": 0, "model": payload.get("model", "gpt-4.1-mini"),
             "choices": [{"index": 0, "delta": {"role": "assistant"}, "finish_reason": None}]},
            {"id": "chatcmpl_stream_1", "object": "chat.completion.chunk", "created": 0, "model": payload.get("model", "gpt-4.1-mini"),
             "choices": [{"index": 0, "delta": {"content": "Hello "}, "finish_reason": None}]},
            {"id": "chatcmpl_stream_1", "object": "chat.completion.chunk", "created": 0, "model": payload.get("model", "gpt-4.1-mini"),
             "choices": [{"index": 0, "delta": {"content": "streaming "}, "finish_reason": None}]},
            {"id": "chatcmpl_stream_1", "object": "chat.completion.chunk", "created": 0, "model": payload.get("model", "gpt-4.1-mini"),
             "choices": [{"index": 0, "delta": {"content": "world!"}, "finish_reason": "stop"}]},
        ]
        for c in chunks:
            yield ("data: " + json.dumps(c) + "\n\n").encode("utf-8")
        yield b"data: [DONE]\n\n"

    mod._call_gateway_chat = fake_call_gateway_chat  # type: ignore
    mod._stream_gateway_chat = fake_stream_gateway_chat  # type: ignore

    app = FastAPI()
    app.include_router(mod.router)
    c = TestClient(app)

    saw_text_chunk = False
    saw_done = False
    saw_tool_status = False
    saw_approval = False
    data_chunks = 0

    with c.stream(
        "POST",
        "/v1/chat/completions",
        headers={"x-trace-id": "ci-streaming"},
        json={"model": "gpt-4.1-mini", "messages": [{"role": "user", "content": "hi"}], "stream": True},
    ) as resp:
        event = None
        for raw in resp.iter_lines():
            line = raw.decode("utf-8") if isinstance(raw, (bytes, bytearray)) else raw
            if line.startswith("event:"):
                event = line.split(":", 1)[1].strip()
                if event == "tool_status":
                    saw_tool_status = True
                if event == "tool_approval_required":
                    saw_approval = True
                continue

            if line.startswith("data:"):
                data = line.split(":", 1)[1].strip()
                if data == "[DONE]":
                    saw_done = True
                    break
                data_chunks += 1
                # Heuristic: accept either proxy-native streaming JSON or OpenAI chunk JSON.
                if "delta" in data and "content" in data:
                    saw_text_chunk = True
                elif "content" in data and "Hello" in data:
                    saw_text_chunk = True

    probes: Dict[str, Any] = {
        "sseHasTextChunk": {"ok": bool(saw_text_chunk), "dataChunks": data_chunks},
        "sseHasDone": {"ok": bool(saw_done)},
        "noToolStatusEvents": {"ok": not saw_tool_status},
        "noApprovalEvents": {"ok": not saw_approval},
    }

    overall_ok = all(v.get("ok") is True for v in probes.values() if isinstance(v, dict) and "ok" in v)

    snap = {"ok": overall_ok, "probes": probes, "generatedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())}

    os.makedirs(os.path.dirname(args.out) or ".", exist_ok=True)
    with open(args.out, "w", encoding="utf-8") as f:
        json.dump(snap, f, ensure_ascii=False, indent=2)

    print(f"Wrote {args.out} ok={overall_ok}")
    return 0 if overall_ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
