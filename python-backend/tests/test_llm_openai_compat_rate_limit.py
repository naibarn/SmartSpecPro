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
    # Keep concurrency wide-open so we test only rate-limit behavior
    monkeypatch.setattr(mod, "MAX_CONCURRENT_PER_TRACE", 1000)
    monkeypatch.setattr(mod, "CONCURRENCY_WAIT_SECONDS", 0.01)


def _iter_sse_events(resp):
    event = None
    for raw in resp.iter_lines():
        line = raw.decode("utf-8") if isinstance(raw, (bytes, bytearray)) else raw
        if line.startswith("event:"):
            event = line.split(":", 1)[1].strip()
            continue
        if line.startswith("data:"):
            data = line.split(":", 1)[1].strip()
            yield event, data
            if data == "[DONE]":
                return


def test_rate_limit_nonstream_429(monkeypatch):
    # 2 requests per 60s allowed; 3rd should be 429
    monkeypatch.setattr(mod, "RATE_LIMIT_COUNT", 2)
    monkeypatch.setattr(mod, "RATE_LIMIT_WINDOW_SECONDS", 60.0)

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

    for i in range(2):
        r = c.post(
            "/v1/chat/completions",
            headers={"x-trace-id": "rlns"},
            json={"model": "gpt-4.1-mini", "messages": [{"role": "user", "content": f"hi{i}"}], "stream": False},
        )
        assert r.status_code == 200

    r3 = c.post(
        "/v1/chat/completions",
        headers={"x-trace-id": "rlns"},
        json={"model": "gpt-4.1-mini", "messages": [{"role": "user", "content": "hi2"}], "stream": False},
    )
    assert r3.status_code == 429
    assert "rate_limited" in r3.text


def test_rate_limit_stream_emits_proxy_status_and_done(monkeypatch):
    # 1 request per 60s allowed; 2nd should rate-limit in stream mode
    monkeypatch.setattr(mod, "RATE_LIMIT_COUNT", 1)
    monkeypatch.setattr(mod, "RATE_LIMIT_WINDOW_SECONDS", 60.0)

    async def fake_call_gateway_chat(payload, trace_id):
        return {
            "id": "chatcmpl_x",
            "object": "chat.completion",
            "created": 0,
            "model": "gpt-4.1-mini",
            "choices": [{"index": 0, "message": {"role": "assistant", "content": "ok"}, "finish_reason": "stop"}],
        }

    async def fake_stream_gateway_chat(payload, trace_id):
        yield b"data: [DONE]\n\n"

    monkeypatch.setattr(mod, "_call_gateway_chat", fake_call_gateway_chat)
    monkeypatch.setattr(mod, "_stream_gateway_chat", fake_stream_gateway_chat)

    app = _make_app()
    c = TestClient(app)

    # First streaming request consumes quota
    with c.stream(
        "POST",
        "/v1/chat/completions",
        headers={"x-trace-id": "rls"},
        json={"model": "gpt-4.1-mini", "messages": [{"role": "user", "content": "hi"}], "stream": True},
    ) as r1:
        assert r1.status_code == 200
        for _ev, data in _iter_sse_events(r1):
            if data == "[DONE]":
                break

    # Second streaming request should be rate-limited: expect proxy_status rate_limited + DONE
    with c.stream(
        "POST",
        "/v1/chat/completions",
        headers={"x-trace-id": "rls"},
        json={"model": "gpt-4.1-mini", "messages": [{"role": "user", "content": "hi2"}], "stream": True},
    ) as r2:
        assert r2.status_code == 200
        saw_rate = False
        saw_done = False
        for ev, data in _iter_sse_events(r2):
            if ev == "proxy_status" and "rate_limited" in data:
                saw_rate = True
            if data == "[DONE]":
                saw_done = True
                break

    assert saw_rate is True
    assert saw_done is True


def test_rate_limit_window_allows_after_time(monkeypatch):
    # small window for test
    monkeypatch.setattr(mod, "RATE_LIMIT_COUNT", 1)
    monkeypatch.setattr(mod, "RATE_LIMIT_WINDOW_SECONDS", 0.2)

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
        headers={"x-trace-id": "rlw"},
        json={"model": "gpt-4.1-mini", "messages": [{"role": "user", "content": "a"}], "stream": False},
    )
    assert r1.status_code == 200

    r2 = c.post(
        "/v1/chat/completions",
        headers={"x-trace-id": "rlw"},
        json={"model": "gpt-4.1-mini", "messages": [{"role": "user", "content": "b"}], "stream": False},
    )
    assert r2.status_code == 429

    time.sleep(0.25)

    r3 = c.post(
        "/v1/chat/completions",
        headers={"x-trace-id": "rlw"},
        json={"model": "gpt-4.1-mini", "messages": [{"role": "user", "content": "c"}], "stream": False},
    )
    assert r3.status_code == 200
