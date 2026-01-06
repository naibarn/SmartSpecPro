import json
import types
import pytest

from fastapi.testclient import TestClient

from app.main import app
from app.core.config import settings


class _MockStreamResponse:
    def __init__(self, chunks):
        self._chunks = chunks
        self.status_code = 200
        self.headers = {"content-type": "text/event-stream"}

    def raise_for_status(self):
        return None

    async def aiter_bytes(self):
        for c in self._chunks:
            yield c

    async def __aenter__(self):
        return self

    async def __aexit__(self, exc_type, exc, tb):
        return False


class _MockClient:
    def __init__(self, *args, **kwargs):
        self._requests = []

    async def __aenter__(self):
        return self

    async def __aexit__(self, exc_type, exc, tb):
        return False

    async def request(self, method, url, json=None, headers=None):
        # models endpoint
        if url.endswith("/v1/models"):
            body = {"object": "list", "data": [{"id": "gpt-4o-mini", "object": "model"}]}
            return types.SimpleNamespace(
                status_code=200,
                headers={"content-type": "application/json"},
                content=jsonlib(body),
            )
        # chat json endpoint
        body = {"id": "cmpl_1", "object": "chat.completion", "choices": [{"message": {"role": "assistant", "content": "ok"}}]}
        return types.SimpleNamespace(
            status_code=200,
            headers={"content-type": "application/json"},
            content=jsonlib(body),
        )

    def stream(self, method, url, json=None, headers=None):
        # Return SSE bytes
        chunks = [b"data: {\"id\":\"1\"}\n\n", b"data: [DONE]\n\n"]
        return _MockStreamResponse(chunks)


def jsonlib(obj):
    return json.dumps(obj).encode("utf-8")


@pytest.fixture(autouse=True)
def _set_gateway_env(monkeypatch):
    # Ensure gateway mode is enabled for tests
    monkeypatch.setattr(settings, "SMARTSPEC_USE_WEB_GATEWAY", True, raising=False)
    monkeypatch.setattr(settings, "SMARTSPEC_WEB_GATEWAY_URL", "http://web.local", raising=False)
    monkeypatch.setattr(settings, "SMARTSPEC_WEB_GATEWAY_TOKEN", "t", raising=False)
    monkeypatch.setattr(settings, "SMARTSPEC_PROXY_TOKEN", "", raising=False)
    yield


@pytest.mark.unit
def test_chat_completions_json(monkeypatch):
    import httpx

    monkeypatch.setattr(httpx, "AsyncClient", _MockClient)

    c = TestClient(app)
    r = c.post("/v1/chat/completions", json={"model": "gpt-4o-mini", "messages": [{"role": "user", "content": "hi"}]})
    assert r.status_code == 200
    j = r.json()
    assert j["choices"][0]["message"]["content"] == "ok"


@pytest.mark.unit
def test_chat_completions_stream(monkeypatch):
    import httpx

    monkeypatch.setattr(httpx, "AsyncClient", _MockClient)

    c = TestClient(app)
    r = c.post("/v1/chat/completions", json={"stream": True, "model": "gpt-4o-mini", "messages": [{"role": "user", "content": "hi"}]})
    assert r.status_code == 200
    # Should contain SSE done
    assert "[DONE]" in r.text


@pytest.mark.unit
def test_models(monkeypatch):
    import httpx

    monkeypatch.setattr(httpx, "AsyncClient", _MockClient)

    c = TestClient(app)
    r = c.get("/v1/models")
    assert r.status_code == 200
    j = r.json()
    assert j["object"] == "list"
