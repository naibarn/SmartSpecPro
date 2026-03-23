"""Tests for MCP client SSRF protection and tenant cache isolation (section-01).

Covers findings F01 (discover_tools SSRF), F02 (call_tool SSRF), F03 (tenant cache).
"""

import pytest
from unittest.mock import patch, AsyncMock, MagicMock

from app.services.mcp_client import (
    discover_tools,
    call_tool,
    _cache_key,
    _validate_mcp_url,
    clear_discovery_cache,
)

pytestmark = [pytest.mark.unit]


@pytest.fixture(autouse=True)
def clear_cache():
    clear_discovery_cache()
    yield
    clear_discovery_cache()


def _mock_httpx_success(tools_payload: list[dict] | None = None):
    """Helper to create a mock httpx client returning a successful tools/list response."""
    tools = tools_payload or [{"name": "search", "description": "Search", "inputSchema": {}}]
    mock_response = MagicMock()
    mock_response.raise_for_status = MagicMock()
    mock_response.json.return_value = {
        "jsonrpc": "2.0",
        "id": 1,
        "result": {"tools": tools},
    }
    mock_client = MagicMock()
    mock_client.post = AsyncMock(return_value=mock_response)
    return mock_client


class TestDiscoverToolsSSRF:
    """F01: SSRF validation must be called in discover_tools."""

    @pytest.mark.asyncio
    async def test_blocks_private_ip_192(self):
        with patch("app.services.mcp_client.httpx.AsyncClient") as mock:
            result = await discover_tools("http://192.168.1.1:8080/rpc", tenant_id=1)
        assert result == []
        mock.assert_not_called()

    @pytest.mark.asyncio
    async def test_blocks_cloud_metadata_endpoint(self):
        with patch("app.services.mcp_client.httpx.AsyncClient") as mock:
            result = await discover_tools("http://169.254.169.254/latest/meta-data/", tenant_id=1)
        assert result == []
        mock.assert_not_called()

    @pytest.mark.asyncio
    async def test_blocks_localhost(self):
        with patch("app.services.mcp_client.httpx.AsyncClient") as mock:
            result = await discover_tools("http://127.0.0.1:6379/rpc", tenant_id=1)
        assert result == []
        mock.assert_not_called()

    @pytest.mark.asyncio
    async def test_blocks_10_network(self):
        with patch("app.services.mcp_client.httpx.AsyncClient") as mock:
            result = await discover_tools("http://10.0.0.1:8080/rpc", tenant_id=1)
        assert result == []
        mock.assert_not_called()

    @pytest.mark.asyncio
    async def test_allows_valid_public_url(self):
        mock_client = _mock_httpx_success()
        with patch("app.services.mcp_client.httpx.AsyncClient") as mock_factory:
            mock_factory.return_value.__aenter__ = AsyncMock(return_value=mock_client)
            mock_factory.return_value.__aexit__ = AsyncMock(return_value=False)
            result = await discover_tools("https://mcp.example.com/rpc", "token", tenant_id=1)
        assert len(result) > 0
        assert result[0].name == "search"


class TestCallToolSSRF:
    """F02: SSRF validation must be called in call_tool."""

    @pytest.mark.asyncio
    async def test_blocks_private_ip(self):
        with patch("app.services.mcp_client.httpx.AsyncClient") as mock:
            result = await call_tool("http://10.0.0.1:8080/rpc", "search", {}, tenant_id=1)
        assert "blocked" in result.lower()
        mock.assert_not_called()

    @pytest.mark.asyncio
    async def test_blocks_metadata_endpoint(self):
        with patch("app.services.mcp_client.httpx.AsyncClient") as mock:
            result = await call_tool("http://169.254.169.254/rpc", "read", {}, tenant_id=1)
        assert "blocked" in result.lower()
        mock.assert_not_called()

    @pytest.mark.asyncio
    async def test_requires_tenant_id(self):
        result = await call_tool("https://mcp.example.com", "search", {}, tenant_id=None)
        assert "tenant_id" in result.lower()


class TestTenantCacheIsolation:
    """F03: Cache must be scoped by tenant_id."""

    def test_cache_key_differs_by_tenant(self):
        key1 = _cache_key("1", "https://mcp.example.com", "abc")
        key2 = _cache_key("2", "https://mcp.example.com", "abc")
        assert key1 != key2

    def test_cache_key_same_tenant_same_key(self):
        key1 = _cache_key("1", "https://mcp.example.com", "abc")
        key2 = _cache_key("1", "https://mcp.example.com", "abc")
        assert key1 == key2

    @pytest.mark.asyncio
    async def test_cached_results_scoped_to_tenant(self):
        """Tenant 1 cache does not serve tenant 2 — both calls in same mock context."""
        tool_a = [{"name": "tool_a", "description": "A", "inputSchema": {}}]

        # Single mock that always returns tool_a
        mock_client = _mock_httpx_success(tool_a)
        with patch("app.services.mcp_client.httpx.AsyncClient") as mock_factory:
            mock_factory.return_value.__aenter__ = AsyncMock(return_value=mock_client)
            mock_factory.return_value.__aexit__ = AsyncMock(return_value=False)

            # Populate cache for tenant 1
            result_t1 = await discover_tools("https://mcp.example.com", tenant_id=1)
            # Tenant 2 should NOT get tenant 1's cache — must make a new HTTP call
            result_t2 = await discover_tools("https://mcp.example.com", tenant_id=2)

        assert result_t1[0].name == "tool_a"
        assert result_t2[0].name == "tool_a"
        # Key assertion: HTTP was called twice (once per tenant), proving cache isolation
        assert mock_client.post.call_count == 2
