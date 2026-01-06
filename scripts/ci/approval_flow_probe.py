#!/usr/bin/env python3
"""Runtime approval-flow probe (no external gateway required).

This script runs the OpenAI-compatible proxy router in-process and simulates:
1) streaming chat that yields a tool call requiring approval (workspace_write_file)
2) approval via POST /v1/tool-approve
3) completion continues and tool executes exactly once
4) non-stream request is denied when AUTO_APPROVE_NONSTREAM is OFF

Output (default): _cov/approval_flow_snapshot.json
"""

from __future__ import annotations

import argparse
import json
import os
import threading
import time
from typing import Any, Dict, List

from fastapi import FastAPI
from fastapi.testclient import TestClient


def _mock_gateway_responses() -> List[Dict[str, Any]]:
    first = {
        "id": "chatcmpl_1",
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
                            "id": "call_1",
                            "type": "function",
                            "function": {
                                "name": "workspace_write_file",
                                "arguments": json.dumps({"path": "README.md", "content": "hi"}),
                            },
                        }
                    ],
                },
                "finish_reason": "tool_calls",
            }
        ],
    }
    second = {
        "id": "chatcmpl_2",
        "object": "chat.completion",
        "created": 0,
        "model": "gpt-4.1-mini",
        "choices": [{"index": 0, "message": {"role": "assistant", "content": "done"}, "finish_reason": "stop"}],
    }
    return [first, second]


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default="_cov/approval_flow_snapshot.json")
    args = ap.parse_args()

    # Make router accessible and ensure approval is required.
    os.environ.setdefault("LLM_PROXY_LOCALHOST_ONLY", "0")
    os.environ.setdefault("SMARTSPEC_WEB_GATEWAY_URL", "")
    os.environ.setdefault("LLM_PROXY_AUTO_MCP_TOOLS", "0")
    os.environ.setdefault("LLM_PROXY_APPROVAL_TOOLS", "workspace_write_file")
    os.environ.setdefault("LLM_PROXY_AUTO_APPROVE_NONSTREAM", "0")
    os.environ.setdefault("LLM_PROXY_APPROVAL_TIMEOUT_SECONDS", "5")
    os.environ.setdefault("LLM_PROXY_MAX_TOOL_ITERS", "2")

    # Import after env is set (module reads env at import time)
    from app.api import llm_openai_compat as mod  # type: ignore

    # Force localhost-only off even if env already existed elsewhere
    mod.LOCALHOST_ONLY = False
    mod.AUTO_MCP_TOOLS = False
    mod.AUTO_APPROVE_NONSTREAM = False
    mod.APPROVAL_TIMEOUT_SECONDS = 5.0
    mod.MAX_TOOL_ITERS = 2

    responses = _mock_gateway_responses()
    call_count = {"n": 0}
    tool_called = {"n": 0}

    async def fake_call_gateway_chat(payload, trace_id):
        idx = call_count["n"]
        call_count["n"] += 1
        return responses[min(idx, len(responses) - 1)]

    async def fake_stream_gateway_chat(payload, trace_id):
        # terminate stream after we finish loop
        yield b"data: [DONE]\n\n"

    async def fake_call_mcp_tool(name, arguments, trace_id):
        tool_called["n"] += 1
        return True, json.dumps({"ok": True, "name": name}), "hash"

    mod._call_gateway_chat = fake_call_gateway_chat  # type: ignore
    mod._stream_gateway_chat = fake_stream_gateway_chat  # type: ignore
    mod._call_mcp_tool = fake_call_mcp_tool  # type: ignore

    app = FastAPI()
    app.include_router(mod.router)

    c_chat = TestClient(app)
    c_approve = TestClient(app)

    probes: Dict[str, Dict[str, Any]] = {}

    # ---- probe 1: streaming approval required + allow after approve ----
    got_approval = {"seen": False}
    got_done = {"seen": False}

    def approve_later():
        for _ in range(50):
            if got_approval["seen"]:
                break
            time.sleep(0.05)
        if not got_approval["seen"]:
            return
        r = c_approve.post("/v1/tool-approve", json={"traceId": "ci-approval", "toolCallId": "call_1", "approved": True})
        probes["approveEndpointOk"] = {"ok": r.status_code == 200, "status": r.status_code, "body": r.text[:200]}

    t = threading.Thread(target=approve_later, daemon=True)
    t.start()

    with c_chat.stream(
        "POST",
        "/v1/chat/completions",
        headers={"x-trace-id": "ci-approval"},
        json={"model": "gpt-4.1-mini", "messages": [{"role": "user", "content": "hi"}], "stream": True},
    ) as resp:
        event = None
        for raw in resp.iter_lines():
            line = raw.decode("utf-8") if isinstance(raw, (bytes, bytearray)) else raw
            if line.startswith("event:"):
                event = line.split(":", 1)[1].strip()
                continue
            if line.startswith("data:"):
                data = line.split(":", 1)[1].strip()
                if event == "tool_approval_required":
                    got_approval["seen"] = True
                if data == "[DONE]":
                    got_done["seen"] = True
                    break

    t.join(timeout=6)

    probes["streamApprovalEvent"] = {"ok": bool(got_approval["seen"])}
    probes["streamFinished"] = {"ok": bool(got_done["seen"])}
    probes["streamToolExecutedOnce"] = {"ok": tool_called["n"] == 1, "count": tool_called["n"]}

    # ---- probe 2: non-stream denied when AUTO_APPROVE_NONSTREAM=0 ----
    # For non-stream we still need to avoid external gateway; mock same gateway responses.
    call_count["n"] = 0
    tool_called["n"] = 0

    r2 = c_chat.post(
        "/v1/chat/completions",
        headers={"x-trace-id": "ci-approval-nonstream"},
        json={"model": "gpt-4.1-mini", "messages": [{"role": "user", "content": "hi"}], "stream": False},
    )
    # expected: 200 with normal response OR 200 with a tool message? In our proxy design,
    # approval denial is surfaced as tool_approval_required event for stream; for non-stream we deny early.
    # The implementation returns 200 with a message describing denial.
    ok = (r2.status_code == 200) and ("nonstream_denied" in r2.text or "tool_approval_required" in r2.text or "approval" in r2.text)
    probes["nonstreamDenied"] = {"ok": ok, "status": r2.status_code, "body": r2.text[:200]}

    overall_ok = all(v.get("ok") is True for v in probes.values() if isinstance(v, dict) and "ok" in v)

    snapshot = {
        "ok": overall_ok,
        "probes": probes,
        "toolCalled": tool_called["n"],
        "generatedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
    }

    os.makedirs(os.path.dirname(args.out) or ".", exist_ok=True)
    with open(args.out, "w", encoding="utf-8") as f:
        json.dump(snapshot, f, ensure_ascii=False, indent=2)

    print(f"Wrote {args.out} ok={overall_ok}")
    return 0 if overall_ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
