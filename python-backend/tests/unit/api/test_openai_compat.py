import pytest
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch
from fastapi.testclient import TestClient
from fastapi import FastAPI
from app.api.openai_compat import router, _get_user_from_token, _require_proxy_token
from app.core.config import settings

@pytest.fixture
def app():
    _app = FastAPI()
    _app.include_router(router)
    return _app

@pytest.fixture
def client(app):
    # Starlette defaults the ASGI peer to "testclient", which is not a
    # loopback address and correctly trips the localhost-only production guard.
    return TestClient(app, client=("127.0.0.1", 50000))

@pytest.fixture
def mock_settings(monkeypatch):
    monkeypatch.setattr(settings, "SMARTSPEC_USE_WEB_GATEWAY", True)
    monkeypatch.setattr(settings, "SMARTSPEC_WEB_GATEWAY_URL", "http://gateway.test")
    monkeypatch.setattr(settings, "SMARTSPEC_PROXY_TOKEN", "test-proxy-token")
    monkeypatch.setattr(settings, "DEBUG", False)
    monkeypatch.setattr(settings, "SMARTSPEC_LOCALHOST_ONLY", False)

@pytest.mark.asyncio
async def test_chat_completions_json(client, mock_settings):
    with patch("app.api.openai_compat.forward_chat_json", new_callable=AsyncMock) as mock_forward, \
         patch("app.api.openai_compat.reject_legacy_key_http") as mock_reject:
        
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.content = b'{"id": "chatcmpl-123"}'
        mock_resp.headers = {"content-type": "application/json"}
        mock_forward.return_value = mock_resp
        
        response = client.post(
            "/v1/chat/completions",
            json={"model": "gpt-3.5-turbo", "messages": [], "stream": False},
            headers={"Authorization": "Bearer test-proxy-token"}
        )
        
        assert response.status_code == 200
        assert mock_forward.called
        assert response.json()["id"] == "chatcmpl-123"

@pytest.mark.asyncio
async def test_chat_completions_stream(client, mock_settings):
    async def mock_gen(payload, trace_id, user_token=None):
        yield b"data: chunk1\n\n"
        yield b"data: chunk2\n\n"

    with patch("app.api.openai_compat.forward_chat_stream", side_effect=mock_gen), \
         patch("app.api.openai_compat.reject_legacy_key_http"):
        
        response = client.post(
            "/v1/chat/completions",
            json={"model": "gpt-3.5-turbo", "messages": [], "stream": True},
            headers={"Authorization": "Bearer test-proxy-token"}
        )
        
        assert response.status_code == 200
        assert response.headers["content-type"].startswith("text/event-stream")
        assert response.content == b"data: chunk1\n\ndata: chunk2\n\n"

@pytest.mark.asyncio
async def test_models_success(client, mock_settings):
    with patch("app.api.openai_compat.forward_models", new_callable=AsyncMock) as mock_forward, \
         patch("app.api.openai_compat.reject_legacy_key_http"):
        
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.content = b'{"data": []}'
        mock_resp.headers = {"content-type": "application/json"}
        mock_forward.return_value = mock_resp
        
        response = client.get(
            "/v1/models",
            headers={"x-proxy-token": "test-proxy-token"}
        )
        
        assert response.status_code == 200
        assert response.json()["data"] == []

@pytest.mark.asyncio
async def test_unauthorized(client, mock_settings):
    with patch("app.api.openai_compat.reject_legacy_key_http"):
        response = client.get("/v1/models", headers={"Authorization": "Bearer wrong-token"})
        assert response.status_code == 401

@pytest.mark.asyncio
async def test_localhost_only(client, monkeypatch):
    monkeypatch.setattr(settings, "SMARTSPEC_LOCALHOST_ONLY", True)
    monkeypatch.setattr(settings, "SMARTSPEC_PROXY_TOKEN", "test-proxy-token")
    monkeypatch.setattr(settings, "SMARTSPEC_USE_WEB_GATEWAY", True)
    monkeypatch.setattr(settings, "SMARTSPEC_WEB_GATEWAY_URL", "http://gateway.test")
    mock_response = MagicMock()
    mock_response.status_code = 200
    mock_response.content = b'{"data": []}'
    mock_response.headers = {"content-type": "application/json"}
    with patch("app.api.openai_compat.reject_legacy_key_http"):
        with patch("app.api.openai_compat.forward_models", new_callable=AsyncMock) as forward:
            forward.return_value = mock_response
            response = client.get("/v1/models", headers={"x-proxy-token": "test-proxy-token"})

    assert response.status_code == 200
    assert forward.called


@pytest.mark.asyncio
async def test_web_session_proxy_token_resolves_the_authorized_user(monkeypatch):
    expected_user = SimpleNamespace(id=73)
    result = SimpleNamespace(scalar_one_or_none=lambda: expected_user)
    db = SimpleNamespace(execute=AsyncMock(return_value=result))
    request = SimpleNamespace(headers={"authorization": "Bearer signed-user-token"})

    with patch("app.api.openai_compat.verify_token", return_value={"user_id": 73}):
        assert await _get_user_from_token(request, db) is expected_user

    db.execute.assert_awaited_once()


@pytest.mark.asyncio
async def test_web_session_user_id_string_is_bound_to_integer_database_id():
    expected_user = SimpleNamespace(id=73)
    result = SimpleNamespace(scalar_one_or_none=lambda: expected_user)
    db = SimpleNamespace(execute=AsyncMock(return_value=result))
    request = SimpleNamespace(headers={"authorization": "Bearer signed-user-token"})

    with patch("app.api.openai_compat.verify_token", return_value={"user_id": "73"}):
        assert await _get_user_from_token(request, db) is expected_user

    query = db.execute.await_args.args[0]
    assert query.compile().params["id_1"] == 73


def test_proxy_auth_requires_a_valid_identity_when_no_shared_proxy_token_is_configured(monkeypatch):
    monkeypatch.setattr(settings, "SMARTSPEC_PROXY_TOKEN", "")
    monkeypatch.setattr(settings, "DEBUG", True)
    request = SimpleNamespace(headers={})

    with pytest.raises(Exception) as exc:
        _require_proxy_token(request)

    assert getattr(exc.value, "status_code", None) == 401


def test_proxy_auth_rejects_tokens_without_a_database_user_identity(monkeypatch):
    monkeypatch.setattr(settings, "SMARTSPEC_PROXY_TOKEN", "configured-proxy-token")
    request = SimpleNamespace(headers={"authorization": "Bearer forged-role-token"})

    with patch("app.api.openai_compat.verify_token", return_value={"role": "admin"}):
        with pytest.raises(Exception) as exc:
            _require_proxy_token(request)

    assert getattr(exc.value, "status_code", None) == 401

@pytest.mark.asyncio
async def test_gateway_disabled(client, monkeypatch):
    monkeypatch.setattr(settings, "SMARTSPEC_USE_WEB_GATEWAY", False)
    monkeypatch.setattr(settings, "SMARTSPEC_PROXY_TOKEN", "token")
    monkeypatch.setattr(settings, "SMARTSPEC_LOCALHOST_ONLY", False)
    with patch("app.api.openai_compat.reject_legacy_key_http"):
        response = client.get("/v1/models", headers={"x-proxy-token": "token"})
        assert response.status_code == 503
