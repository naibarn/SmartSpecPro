#!/usr/bin/env python3
"""Runtime tool-status streaming probe (no external gateway required).

Goal:
- Ensure SSE stream emits tool status events (e.g. event: tool_status) during tool execution.
- Ensure tool auto-executes when AUTO_MCP_TOOLS=1 and does not require approval.

Output (default): _cov/tool_status_snapshot.json
"""

from __future__ import annotations

import argparse
import json
import os
import time
from typing import Any, Dict, List

from fastapi import FastAPI
from fastapi.testclient import TestClient


def _mock_gateway_responses() -> List[Dict[str, Any]]:
    first = {
        "id": "chatcmpl_ts1",
        "object": "chat.completion",
        "created": 0,
        "model": "gpt-4.1-mini",
        "choices": [
            {
                "index": 0,
                "message": {
                    "role": "assistant",
                    "content": None,
                    "tool_calls": [
                        {
                            "id": "call_ts1",
                            "type": "function",
                            "function": {
                                "name": "workspace_read_file",
                                "arguments": json.dumps({"path": "README.md"}),
                            },
                        }
                    ],
                },
                "finish_reason": "tool_calls",
            }
        ],
    }
    second = {
        "id": "chatcmpl_ts2",
        "object": "chat.completion",
        "created": 0,
        "model": "gpt-4.1-mini",
        "choices": [{"index": 0, "message": {"role": "assistant", "content": "done"}, "finish_reason": "stop"}],
    }
    return [first, second]


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default="_cov/tool_status_snapshot.json")
    args = ap.parse_args()

    # Enable auto tool execution; disable approvals for this probe.
    os.environ.setdefault("LLM_PROXY_LOCALHOST_ONLY", "0")
    os.environ.setdefault("SMARTSPEC_WEB_GATEWAY_URL", "")
    os.environ.setdefault("LLM_PROXY_AUTO_MCP_TOOLS", "1")
    os.environ.setdefault("LLM_PROXY_APPROVAL_TOOLS", "")
    os.environ.setdefault("LLM_PROXY_AUTO_APPROVE_NONSTREAM", "0")
    os.environ.setdefault("LLM_PROXY_MAX_TOOL_ITERS", "2")

    from app.api import llm_openai_compat as mod  # type: ignore

    mod.LOCALHOST_ONLY = False
    mod.AUTO_MCP_TOOLS = True
    mod.AUTO_APPROVE_NONSTREAM = False
    mod.MAX_TOOL_ITERS = 2

    responses = _mock_gateway_responses()
    call_count = {"n": 0}
    tool_called = {"n": 0}

    async def fake_call_gateway_chat(payload, trace_id):
        idx = call_count["n"]
        call_count["n"] += 1
        return responses[min(idx, len(responses) - 1)]

    async def fake_stream_gateway_chat(payload, trace_id):
        yield b"data: [DONE]\n\n"

    async def fake_call_mcp_tool(name, arguments, trace_id):
        tool_called["n"] += 1
        time.sleep(0.05)
        return True, json.dumps({"ok": True, "name": name}), "hash"

    mod._call_gateway_chat = fake_call_gateway_chat  # type: ignore
    mod._stream_gateway_chat = fake_stream_gateway_chat  # type: ignore
    mod._call_mcp_tool = fake_call_mcp_tool  # type: ignore

    app = FastAPI()
    app.include_router(mod.router)
    c = TestClient(app)

    saw_tool_status = False
    saw_tool_name = False
    saw_approval = False
    finished = False

    with c.stream(
        "POST",
        "/v1/chat/completions",
        headers={"x-trace-id": "ci-toolstatus"},
        json={"model": "gpt-4.1-mini", "messages": [{"role": "user", "content": "read file"}], "stream": True},
    ) as resp:
        event = None
        for raw in resp.iter_lines():
            line = raw.decode("utf-8") if isinstance(raw, (bytes, bytearray)) else raw
            if line.startswith("event:"):
                event = line.split(":", 1)[1].strip()
                if event == "tool_approval_required":
                    saw_approval = True
                if event == "tool_status":
                    saw_tool_status = True
                continue
            if line.startswith("data:"):
                data = line.split(":", 1)[1].strip()
                if event == "tool_status":
                    if "workspace_read_file" in data:
                        saw_tool_name = True
                if data == "[DONE]":
                    finished = True
                    break

    probes: Dict[str, Any] = {
        "streamToolStatusEvent": {"ok": bool(saw_tool_status)},
        "streamToolNamePresent": {"ok": bool(saw_tool_name)},
        "noApprovalEvent": {"ok": not saw_approval},
        "streamFinished": {"ok": bool(finished)},
        "toolExecuted": {"ok": tool_called["n"] == 1, "count": tool_called["n"]},
    }
    overall_ok = all(v.get("ok") is True for v in probes.values() if isinstance(v, dict) and "ok" in v)

    snap = {
        "ok": overall_ok,
        "probes": probes,
        "generatedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
    }

    os.makedirs(os.path.dirname(args.out) or ".", exist_ok=True)
    with open(args.out, "w", encoding="utf-8") as f:
        json.dump(snap, f, ensure_ascii=False, indent=2)

    print(f"Wrote {args.out} ok={overall_ok}")
    return 0 if overall_ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
