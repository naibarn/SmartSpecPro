import threading
import time

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.api import llm_openai_compat as mod


def _make_app():
    app = FastAPI()
    app.include_router(mod.router)
    return app


@pytest.fixture(autouse=True)
def _tune(monkeypatch):
    monkeypatch.setattr(mod, "LOCALHOST_ONLY", False)
    monkeypatch.setattr(mod, "AUTO_MCP_TOOLS", False)
    monkeypatch.setattr(mod, "MAX_TOOL_ITERS", 0)


def test_audit_rate_limited_event(monkeypatch):
    events = []

    def fake_audit(evt):
        events.append(evt)

    monkeypatch.setattr(mod, "_audit", fake_audit)

    monkeypatch.setattr(mod, "RATE_LIMIT_COUNT", 1)
    monkeypatch.setattr(mod, "RATE_LIMIT_WINDOW_SECONDS", 60.0)
    monkeypatch.setattr(mod, "MAX_CONCURRENT_PER_TRACE", 1000)
    monkeypatch.setattr(mod, "CONCURRENCY_WAIT_SECONDS", 0.01)

    async def fake_call_gateway_chat(payload, trace_id):
        return {
            "id": "chatcmpl_x",
            "object": "chat.completion",
            "created": 0,
            "model": "gpt-4.1-mini",
            "choices": [{"index": 0, "message": {"role": "assistant", "content": "ok"}, "finish_reason": "stop"}],
        }

    monkeypatch.setattr(mod, "_call_gateway_chat", fake_call_gateway_chat)

    app = _make_app()
    c = TestClient(app)

    r1 = c.post(
        "/v1/chat/completions",
        headers={"x-trace-id": "audit-rl"},
        json={"model": "gpt-4.1-mini", "messages": [{"role": "user", "content": "a"}], "stream": False},
    )
    assert r1.status_code == 200

    r2 = c.post(
        "/v1/chat/completions",
        headers={"x-trace-id": "audit-rl"},
        json={"model": "gpt-4.1-mini", "messages": [{"role": "user", "content": "b"}], "stream": False},
    )
    assert r2.status_code == 429

    assert any(e.get("event") == "rate_limited" and e.get("traceId") == "audit-rl" for e in events), events


def test_audit_concurrency_rejected_event(monkeypatch):
    events = []

    def fake_audit(evt):
        events.append(evt)

    monkeypatch.setattr(mod, "_audit", fake_audit)

    # disable rate limit for this test
    monkeypatch.setattr(mod, "RATE_LIMIT_COUNT", 0)
    monkeypatch.setattr(mod, "RATE_LIMIT_WINDOW_SECONDS", 0.0)

    monkeypatch.setattr(mod, "MAX_CONCURRENT_PER_TRACE", 1)
    monkeypatch.setattr(mod, "CONCURRENCY_WAIT_SECONDS", 0.1)

    import asyncio

    async def slow_call_gateway_chat(payload, trace_id):
        # Hold semaphore long enough so second request times out acquiring
        await asyncio.sleep(0.4)
        return {
            "id": "chatcmpl_x",
            "object": "chat.completion",
            "created": 0,
            "model": "gpt-4.1-mini",
            "choices": [{"index": 0, "message": {"role": "assistant", "content": "ok"}, "finish_reason": "stop"}],
        }

    monkeypatch.setattr(mod, "_call_gateway_chat", slow_call_gateway_chat)

    app = _make_app()
    c = TestClient(app)

    started = {"ok": False}
    done = {"ok": False}

    def run_first():
        started["ok"] = True
        r = c.post(
            "/v1/chat/completions",
            headers={"x-trace-id": "audit-cc"},
            json={"model": "gpt-4.1-mini", "messages": [{"role": "user", "content": "hold"}], "stream": False},
        )
        assert r.status_code == 200
        done["ok"] = True

    t = threading.Thread(target=run_first, daemon=True)
    t.start()

    # Ensure first request has started and likely holding semaphore
    for _ in range(20):
        if started["ok"]:
            break
        time.sleep(0.01)

    r2 = c.post(
        "/v1/chat/completions",
        headers={"x-trace-id": "audit-cc"},
        json={"model": "gpt-4.1-mini", "messages": [{"role": "user", "content": "second"}], "stream": False},
    )
    assert r2.status_code == 429
    assert "concurrency_limit" in r2.text

    t.join(timeout=2)
    assert done["ok"] is True

    assert any(e.get("event") == "concurrency_rejected" and e.get("traceId") == "audit-cc" for e in events), events
