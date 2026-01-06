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
    # avoid localhost-only during tests
    monkeypatch.setattr(mod, "LOCALHOST_ONLY", False)
    # avoid tool auto-fetch
    monkeypatch.setattr(mod, "AUTO_MCP_TOOLS", False)
    # keep tool loop small
    monkeypatch.setattr(mod, "MAX_TOOL_ITERS", 0)


def _iter_sse_events(resp):
    """
    Yields (event, data) pairs from TestClient streaming response.
    """
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


def test_concurrency_rejected_emits_proxy_status(monkeypatch):
    # One slot only, short wait -> rejected for second request
    monkeypatch.setattr(mod, "MAX_CONCURRENT_PER_TRACE", 1)
    monkeypatch.setattr(mod, "CONCURRENCY_WAIT_SECONDS", 0.2)

    # Make tool loop take longer than wait time so the second request rejects
    async def slow_tool_loop(payload, trace_id, emit, is_stream):
        await asyncio_sleep(0.6)

    async def fake_stream_gateway_chat(payload, trace_id):
        yield b"data: [DONE]\n\n"

    # use local helper to avoid importing asyncio in module scope (pytest collection speed)
    import asyncio
    async def asyncio_sleep(s):  # noqa: D401
        await asyncio.sleep(s)

    monkeypatch.setattr(mod, "_tool_loop_with_status", slow_tool_loop)
    monkeypatch.setattr(mod, "_stream_gateway_chat", fake_stream_gateway_chat)

    app = _make_app()
    c = TestClient(app)

    # start first request and keep it holding semaphore
    started = {"ok": False}

    def run_first():
        with c.stream(
            "POST",
            "/v1/chat/completions",
            headers={"x-trace-id": "traceA"},
            json={"model": "gpt-4.1-mini", "messages": [{"role": "user", "content": "hi"}], "stream": True},
        ) as r1:
            assert r1.status_code == 200
            for ev, data in _iter_sse_events(r1):
                if ev == "proxy_status" and "acquired" in data:
                    started["ok"] = True
                if data == "[DONE]":
                    break

    t = threading.Thread(target=run_first, daemon=True)
    t.start()

    # Wait until first acquired slot (or small delay)
    for _ in range(30):
        if started["ok"]:
            break
        time.sleep(0.02)

    assert started["ok"] is True

    # Second request should see queued then rejected
    with c.stream(
        "POST",
        "/v1/chat/completions",
        headers={"x-trace-id": "traceA"},
        json={"model": "gpt-4.1-mini", "messages": [{"role": "user", "content": "hi2"}], "stream": True},
    ) as r2:
        assert r2.status_code == 200
        saw_queued = False
        saw_rejected = False
        for ev, data in _iter_sse_events(r2):
            if ev == "proxy_status" and "queued" in data:
                saw_queued = True
            if ev == "proxy_status" and "rejected" in data:
                saw_rejected = True
            if data == "[DONE]":
                break

    t.join(timeout=2)
    assert saw_queued is True
    assert saw_rejected is True


def test_concurrency_queued_then_acquired(monkeypatch):
    # One slot only, long wait -> second request queued then acquired
    monkeypatch.setattr(mod, "MAX_CONCURRENT_PER_TRACE", 1)
    monkeypatch.setattr(mod, "CONCURRENCY_WAIT_SECONDS", 1.0)

    import asyncio
    async def slow_tool_loop(payload, trace_id, emit, is_stream):
        await asyncio.sleep(0.25)

    async def fake_stream_gateway_chat(payload, trace_id):
        yield b"data: [DONE]\n\n"

    monkeypatch.setattr(mod, "_tool_loop_with_status", slow_tool_loop)
    monkeypatch.setattr(mod, "_stream_gateway_chat", fake_stream_gateway_chat)

    app = _make_app()
    c = TestClient(app)

    # First request holds slot for 0.25s
    started = {"ok": False}

    def run_first():
        with c.stream(
            "POST",
            "/v1/chat/completions",
            headers={"x-trace-id": "traceB"},
            json={"model": "gpt-4.1-mini", "messages": [{"role": "user", "content": "hi"}], "stream": True},
        ) as r1:
            assert r1.status_code == 200
            for ev, data in _iter_sse_events(r1):
                if ev == "proxy_status" and "acquired" in data:
                    started["ok"] = True
                if data == "[DONE]":
                    break

    t = threading.Thread(target=run_first, daemon=True)
    t.start()

    for _ in range(50):
        if started["ok"]:
            break
        time.sleep(0.01)

    assert started["ok"] is True

    # Second request should queue then acquire (not reject)
    with c.stream(
        "POST",
        "/v1/chat/completions",
        headers={"x-trace-id": "traceB"},
        json={"model": "gpt-4.1-mini", "messages": [{"role": "user", "content": "hi2"}], "stream": True},
    ) as r2:
        assert r2.status_code == 200
        saw_queued = False
        saw_acquired = False
        saw_rejected = False
        for ev, data in _iter_sse_events(r2):
            if ev == "proxy_status" and "queued" in data:
                saw_queued = True
            if ev == "proxy_status" and "acquired" in data:
                saw_acquired = True
            if ev == "proxy_status" and "rejected" in data:
                saw_rejected = True
            if data == "[DONE]":
                break

    t.join(timeout=2)
    assert saw_queued is True
    assert saw_acquired is True
    assert saw_rejected is False
