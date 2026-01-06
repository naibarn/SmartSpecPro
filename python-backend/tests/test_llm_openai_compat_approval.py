import json
import threading
import time
from pathlib import Path

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

# Import module under test
from app.api import llm_openai_compat as mod


def _make_app():
    app = FastAPI()
    app.include_router(mod.router)
    return app


def _mock_gateway_responses():
    # First response: tool call requesting a write
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
                            "function": {"name": "workspace_write_file", "arguments": json.dumps({"path": "README.md", "content": "hi"})},
                        }
                    ],
                },
                "finish_reason": "tool_calls",
            }
        ],
    }
    # Second response: after tool result, no tool calls
    second = {
        "id": "chatcmpl_2",
        "object": "chat.completion",
        "created": 0,
        "model": "gpt-4.1-mini",
        "choices": [{"index": 0, "message": {"role": "assistant", "content": "done"}, "finish_reason": "stop"}],
    }
    return [first, second]


@pytest.fixture(autouse=True)
def _test_tune(monkeypatch, tmp_path):
    # Make tests fast and avoid localhost-only restrictions
    monkeypatch.setattr(mod, "LOCALHOST_ONLY", False)
    monkeypatch.setattr(mod, "AUTO_MCP_TOOLS", False)
    monkeypatch.setattr(mod, "MAX_TOOL_ITERS", 2)

    # Make audit deterministic and safe
    audit_path = tmp_path / "llm_tool_audit.jsonl"
    monkeypatch.setattr(mod, "AUDIT_LOG_PATH", str(audit_path))
    monkeypatch.setattr(mod, "AUDIT_ROTATE_DAILY", False)
    monkeypatch.setattr(mod, "AUDIT_RETENTION_DAYS", 0)


def _read_audit(path: Path):
    if not path.exists():
        return []
    lines = [l.strip() for l in path.read_text("utf-8").splitlines() if l.strip()]
    out = []
    for l in lines:
        try:
            out.append(json.loads(l))
        except Exception:
            pass
    return out


def test_stream_requires_approval_and_then_runs_tool(monkeypatch, tmp_path):
    monkeypatch.setattr(mod, "APPROVAL_REDIS_URL", "")
    monkeypatch.setattr(mod, "_redis_client", None)
    monkeypatch.setattr(mod, "APPROVAL_TIMEOUT_SECONDS", 3.0)

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
        return True, json.dumps({"ok": True, "name": name}), "hash_ok"

    monkeypatch.setattr(mod, "_call_gateway_chat", fake_call_gateway_chat)
    monkeypatch.setattr(mod, "_stream_gateway_chat", fake_stream_gateway_chat)
    monkeypatch.setattr(mod, "_call_mcp_tool", fake_call_mcp_tool)

    app = _make_app()
    c1 = TestClient(app)
    c2 = TestClient(app)

    got_approval = {"seen": False}
    got_done = {"seen": False}

    def approve_later():
        for _ in range(30):
            if got_approval["seen"]:
                break
            time.sleep(0.05)
        assert got_approval["seen"] is True
        r = c2.post("/v1/tool-approve", json={"traceId": "t1", "toolCallId": "call_1", "approved": True})
        assert r.status_code == 200

    t = threading.Thread(target=approve_later, daemon=True)
    t.start()

    with c1.stream(
        "POST",
        "/v1/chat/completions",
        headers={"x-trace-id": "t1"},
        json={"model": "gpt-4.1-mini", "messages": [{"role": "user", "content": "hi"}], "stream": True},
    ) as resp:
        assert resp.status_code == 200
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

    t.join(timeout=3)
    assert got_approval["seen"] is True
    assert got_done["seen"] is True
    assert tool_called["n"] == 1

    audit = _read_audit(Path(mod.AUDIT_LOG_PATH))
    assert any(e.get("tool") == "workspace_write_file" and e.get("ok") is True for e in audit)


def test_stream_deny_approval_does_not_run_tool_and_audits(monkeypatch):
    monkeypatch.setattr(mod, "APPROVAL_REDIS_URL", "")
    monkeypatch.setattr(mod, "_redis_client", None)
    monkeypatch.setattr(mod, "APPROVAL_TIMEOUT_SECONDS", 3.0)

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
        return True, json.dumps({"ok": True, "name": name}), "hash_ok"

    monkeypatch.setattr(mod, "_call_gateway_chat", fake_call_gateway_chat)
    monkeypatch.setattr(mod, "_stream_gateway_chat", fake_stream_gateway_chat)
    monkeypatch.setattr(mod, "_call_mcp_tool", fake_call_mcp_tool)

    app = _make_app()
    c1 = TestClient(app)
    c2 = TestClient(app)

    got_approval = {"seen": False}

    def deny_later():
        for _ in range(30):
            if got_approval["seen"]:
                break
            time.sleep(0.05)
        r = c2.post("/v1/tool-approve", json={"traceId": "tdeny", "toolCallId": "call_1", "approved": False})
        assert r.status_code == 200

    threading.Thread(target=deny_later, daemon=True).start()

    with c1.stream(
        "POST",
        "/v1/chat/completions",
        headers={"x-trace-id": "tdeny"},
        json={"model": "gpt-4.1-mini", "messages": [{"role": "user", "content": "hi"}], "stream": True},
    ) as resp:
        assert resp.status_code == 200
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
                    break

    assert got_approval["seen"] is True
    assert tool_called["n"] == 0

    audit = _read_audit(Path(mod.AUDIT_LOG_PATH))
    denied = [e for e in audit if e.get("tool") == "workspace_write_file" and e.get("ok") is False]
    assert len(denied) >= 1


def test_stream_approval_timeout_audits_and_no_tool(monkeypatch):
    monkeypatch.setattr(mod, "APPROVAL_REDIS_URL", "")
    monkeypatch.setattr(mod, "_redis_client", None)
    monkeypatch.setattr(mod, "APPROVAL_TIMEOUT_SECONDS", 0.3)  # fast timeout
    monkeypatch.setattr(mod, "APPROVAL_POLL_INTERVAL", 0.05)

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
        return True, json.dumps({"ok": True, "name": name}), "hash_ok"

    monkeypatch.setattr(mod, "_call_gateway_chat", fake_call_gateway_chat)
    monkeypatch.setattr(mod, "_stream_gateway_chat", fake_stream_gateway_chat)
    monkeypatch.setattr(mod, "_call_mcp_tool", fake_call_mcp_tool)

    app = _make_app()
    c1 = TestClient(app)

    got_approval = {"seen": False}

    with c1.stream(
        "POST",
        "/v1/chat/completions",
        headers={"x-trace-id": "ttimeout"},
        json={"model": "gpt-4.1-mini", "messages": [{"role": "user", "content": "hi"}], "stream": True},
    ) as resp:
        assert resp.status_code == 200
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
                    break

    assert got_approval["seen"] is True
    assert tool_called["n"] == 0

    audit = _read_audit(Path(mod.AUDIT_LOG_PATH))
    denied = [e for e in audit if e.get("tool") == "workspace_write_file" and e.get("ok") is False]
    assert len(denied) >= 1


def test_stream_approval_with_redis_store(monkeypatch, mock_redis):
    # Enable redis store (mocked)
    monkeypatch.setattr(mod, "APPROVAL_REDIS_URL", "redis://mock/0")
    monkeypatch.setattr(mod, "_redis_client", None)
    monkeypatch.setattr(mod, "APPROVAL_TIMEOUT_SECONDS", 3.0)

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
        return True, json.dumps({"ok": True, "name": name}), "hash_ok"

    monkeypatch.setattr(mod, "_call_gateway_chat", fake_call_gateway_chat)
    monkeypatch.setattr(mod, "_stream_gateway_chat", fake_stream_gateway_chat)
    monkeypatch.setattr(mod, "_call_mcp_tool", fake_call_mcp_tool)

    app = _make_app()
    c1 = TestClient(app)
    c2 = TestClient(app)

    got_approval = {"seen": False}

    def approve_later():
        for _ in range(30):
            if got_approval["seen"]:
                break
            time.sleep(0.05)
        r = c2.post("/v1/tool-approve", json={"traceId": "t2", "toolCallId": "call_1", "approved": True})
        assert r.status_code == 200

    threading.Thread(target=approve_later, daemon=True).start()

    with c1.stream(
        "POST",
        "/v1/chat/completions",
        headers={"x-trace-id": "t2"},
        json={"model": "gpt-4.1-mini", "messages": [{"role": "user", "content": "hi"}], "stream": True},
    ) as resp:
        assert resp.status_code == 200
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
                    break

    assert got_approval["seen"] is True
    assert tool_called["n"] == 1
