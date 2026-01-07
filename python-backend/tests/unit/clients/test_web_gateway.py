import pytest
import httpx
from unittest.mock import AsyncMock, patch, MagicMock
from app.clients import web_gateway
from app.core.config import settings

@pytest.fixture
def mock_settings(monkeypatch):
    monkeypatch.setattr(settings, "SMARTSPEC_WEB_GATEWAY_URL", "http://gateway.test")
    monkeypatch.setattr(settings, "SMARTSPEC_MCP_BASE_URL", "http://mcp.test")
    monkeypatch.setattr(settings, "SMARTSPEC_WEB_GATEWAY_TOKEN", "test-token")
    monkeypatch.setattr(settings, "SMARTSPEC_WEB_GATEWAY_TIMEOUT_SECONDS", 1.0)
    monkeypatch.setattr(settings, "SMARTSPEC_WEB_GATEWAY_RETRIES", 1)

def test_auth_headers(mock_settings):
    headers = web_gateway._auth_headers("test-trace")
    assert headers["x-trace-id"] == "test-trace"
    assert headers["Authorization"] == "Bearer test-token"

def test_auth_headers_no_token(monkeypatch):
    monkeypatch.setattr(settings, "SMARTSPEC_WEB_GATEWAY_TOKEN", None)
    headers = web_gateway._auth_headers("test-trace")
    assert "Authorization" not in headers

def test_base_urls(mock_settings):
    base, mcp = web_gateway._base_urls()
    assert base == "http://gateway.test"
    assert mcp == "http://mcp.test"

def test_base_urls_fallback(monkeypatch):
    monkeypatch.setattr(settings, "SMARTSPEC_WEB_GATEWAY_URL", "http://gateway.test")
    monkeypatch.setattr(settings, "SMARTSPEC_MCP_BASE_URL", None)
    base, mcp = web_gateway._base_urls()
    assert base == "http://gateway.test"
    assert mcp == "http://gateway.test"

def test_trace_id():
    tid = web_gateway._trace_id("existing")
    assert tid == "existing"
    
    tid2 = web_gateway._trace_id()
    assert len(tid2) == 36 # UUID length

def test_is_transient():
    assert web_gateway._is_transient(502) is True
    assert web_gateway._is_transient(503) is True
    assert web_gateway._is_transient(504) is True
    assert web_gateway._is_transient(400) is False
    assert web_gateway._is_transient(500) is False

@pytest.mark.asyncio
async def test_request_with_retries_success(mock_settings):
    with patch("httpx.AsyncClient.request", new_callable=AsyncMock) as mock_req:
        mock_resp = MagicMock(spec=httpx.Response)
        mock_resp.status_code = 200
        mock_req.return_value = mock_resp
        
        resp = await web_gateway._request_with_retries("GET", "http://test.com")
        assert resp.status_code == 200
        assert mock_req.call_count == 1

@pytest.mark.asyncio
async def test_request_with_retries_retry_then_success(mock_settings):
    with patch("httpx.AsyncClient.request", new_callable=AsyncMock) as mock_req:
        mock_resp_fail = MagicMock(spec=httpx.Response)
        mock_resp_fail.status_code = 502
        
        mock_resp_ok = MagicMock(spec=httpx.Response)
        mock_resp_ok.status_code = 200
        
        mock_req.side_effects = [mock_resp_fail, mock_resp_ok]
        mock_req.return_value = mock_resp_ok # This is a fallback if side_effects doesn't work as expected with AsyncMock
        
        # Manually setting side_effect since side_effects is not a property of AsyncMock
        mock_req.side_effect = [mock_resp_fail, mock_resp_ok]
        
        with patch("asyncio.sleep", new_callable=AsyncMock):
            resp = await web_gateway._request_with_retries("GET", "http://test.com")
            assert resp.status_code == 200
            assert mock_req.call_count == 2

@pytest.mark.asyncio
async def test_request_with_retries_exception_retry(mock_settings):
    with patch("httpx.AsyncClient.request", new_callable=AsyncMock) as mock_req:
        mock_req.side_effect = [httpx.ConnectError("fail"), MagicMock(status_code=200)]
        
        with patch("asyncio.sleep", new_callable=AsyncMock):
            resp = await web_gateway._request_with_retries("GET", "http://test.com")
            assert resp.status_code == 200
            assert mock_req.call_count == 2

@pytest.mark.asyncio
async def test_forward_chat_json(mock_settings):
    with patch("app.clients.web_gateway._request_with_retries", new_callable=AsyncMock) as mock_req:
        mock_req.return_value = MagicMock(status_code=200)
        await web_gateway.forward_chat_json({"test": "data"})
        assert mock_req.called
        args, kwargs = mock_req.call_args
        assert args[0] == "POST"
        assert "/v1/chat/completions" in args[1]
        assert kwargs["json"] == {"test": "data"}

@pytest.mark.asyncio
async def test_forward_chat_stream(mock_settings):
    mock_client = MagicMock()
    mock_resp = MagicMock()
    mock_resp.aiter_bytes.return_value = [b"chunk1", b"chunk2"]
    
    # Mocking the async context managers
    mock_client.stream.return_value.__aenter__.return_value = mock_resp
    
    with patch("httpx.AsyncClient", return_value=mock_client):
        chunks = []
        async for chunk in web_gateway.forward_chat_stream({"test": "data"}):
            chunks.append(chunk)
        
        assert chunks == [b"chunk1", b"chunk2"]

@pytest.mark.asyncio
async def test_forward_models(mock_settings):
    with patch("app.clients.web_gateway._request_with_retries", new_callable=AsyncMock) as mock_req:
        await web_gateway.forward_models()
        assert mock_req.called
        assert mock_req.call_args[0][0] == "GET"
        assert "/v1/models" in mock_req.call_args[0][1]

@pytest.mark.asyncio
async def test_mcp_tools(mock_settings):
    with patch("app.clients.web_gateway._request_with_retries", new_callable=AsyncMock) as mock_req:
        await web_gateway.mcp_tools()
        assert mock_req.called
        assert "/mcp/tools" in mock_req.call_args[0][1]

@pytest.mark.asyncio
async def test_mcp_call(mock_settings):
    with patch("app.clients.web_gateway._request_with_retries", new_callable=AsyncMock) as mock_req:
        await web_gateway.mcp_call("tool_name", {"arg1": "val1"}, write_token="secret")
        assert mock_req.called
        assert "/mcp/call" in mock_req.call_args[0][1]
        assert mock_req.call_args[1]["json"] == {"name": "tool_name", "arguments": {"arg1": "val1"}}
        assert mock_req.call_args[1]["headers"]["x-mcp-write-token"] == "secret"

@pytest.mark.asyncio
async def test_request_with_retries_exhausted(mock_settings):
    with patch("httpx.AsyncClient.request", new_callable=AsyncMock) as mock_req:
        mock_req.side_effect = httpx.ConnectError("fail")
        
        with patch("asyncio.sleep", new_callable=AsyncMock):
            with pytest.raises(httpx.ConnectError):
                await web_gateway._request_with_retries("GET", "http://test.com")
            
            # Retries = 1 (default in mock_settings), so initial + 1 retry = 2 calls
            assert mock_req.call_count == 2

@pytest.mark.asyncio
async def test_forward_chat_json_no_url(monkeypatch):
    monkeypatch.setattr(settings, "SMARTSPEC_WEB_GATEWAY_URL", None)
    # Ensure fallback doesn't happen from MCP URL if that logic exists, 
    # checking code: base = (settings.SMARTSPEC_WEB_GATEWAY_URL or "").rstrip("/")
    # If None, it becomes "".
    
    with pytest.raises(RuntimeError, match="SMARTSPEC_WEB_GATEWAY_URL not configured"):
        await web_gateway.forward_chat_json({"test": "data"})

@pytest.mark.asyncio
async def test_forward_chat_stream_no_url(monkeypatch):
    monkeypatch.setattr(settings, "SMARTSPEC_WEB_GATEWAY_URL", None)
    
    with pytest.raises(RuntimeError, match="SMARTSPEC_WEB_GATEWAY_URL not configured"):
        # Access the async generator
        async for _ in web_gateway.forward_chat_stream({"test": "data"}):
            pass
