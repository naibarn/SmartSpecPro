"""Tests for MCP tool discovery and bridging (section-14)."""

import json
from unittest.mock import AsyncMock, MagicMock, patch

import httpx
import pytest

from app.services.mcp_client import (
    McpToolInfo,
    _validate_mcp_url,
    call_tool,
    clear_discovery_cache,
    discover_tools,
)


@pytest.fixture(autouse=True)
def _clear_cache():
    """Clear discovery cache before each test."""
    clear_discovery_cache()
    yield
    clear_discovery_cache()


class TestValidateMcpUrl:
    """SSRF validation for MCP server URLs."""

    def test_blocks_private_ip_10(self):
        assert _validate_mcp_url("http://10.0.0.1/rpc") is not None

    def test_blocks_private_ip_172(self):
        assert _validate_mcp_url("http://172.16.0.1/rpc") is not None

    def test_blocks_private_ip_192(self):
        assert _validate_mcp_url("http://192.168.1.1/rpc") is not None

    def test_blocks_localhost(self):
        assert _validate_mcp_url("http://localhost/rpc") is not None

    def test_blocks_metadata_endpoint(self):
        assert _validate_mcp_url("http://169.254.169.254/latest") is not None

    def test_allows_public_url(self):
        assert _validate_mcp_url("https://mcp.example.com/rpc") is None

    def test_rejects_unsupported_scheme(self):
        assert _validate_mcp_url("ftp://mcp.example.com") is not None


class TestDiscoverTools:
    """Tests for discover_tools function."""

    @pytest.mark.asyncio
    async def test_returns_empty_when_no_servers(self):
        """discover_tools returns empty list on connection error."""
        with patch("app.services.mcp_client.httpx.AsyncClient") as mock_client:
            mock_client.return_value.__aenter__ = AsyncMock(
                return_value=MagicMock(
                    post=AsyncMock(side_effect=httpx.ConnectError("Connection refused"))
                )
            )
            mock_client.return_value.__aexit__ = AsyncMock(return_value=False)
            result = await discover_tools("https://unreachable.example.com", tenant_id="tenant-1")
            assert result == []

    @pytest.mark.asyncio
    async def test_discovers_tools_from_server(self):
        """discover_tools returns parsed tool definitions."""
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.raise_for_status = MagicMock()
        mock_response.json.return_value = {
            "jsonrpc": "2.0",
            "id": 1,
            "result": {
                "tools": [
                    {"name": "search", "description": "Search docs", "inputSchema": {"type": "object"}},
                    {"name": "retrieve", "description": "Get doc", "inputSchema": {"type": "object"}},
                    {"name": "summarize", "description": "Summarize", "inputSchema": {"type": "object"}},
                ]
            },
        }

        mock_client_instance = MagicMock()
        mock_client_instance.post = AsyncMock(return_value=mock_response)

        with patch("app.services.mcp_client.httpx.AsyncClient") as mock_client:
            mock_client.return_value.__aenter__ = AsyncMock(return_value=mock_client_instance)
            mock_client.return_value.__aexit__ = AsyncMock(return_value=False)

            tools = await discover_tools("https://mcp.example.com", tenant_id="tenant-1")

        assert len(tools) == 3
        assert tools[0].name == "search"
        assert tools[1].name == "retrieve"
        assert tools[2].name == "summarize"

    @pytest.mark.asyncio
    async def test_sends_bearer_header(self):
        """discover_tools sends Authorization header when token provided."""
        mock_response = MagicMock()
        mock_response.raise_for_status = MagicMock()
        mock_response.json.return_value = {"jsonrpc": "2.0", "id": 1, "result": {"tools": []}}

        mock_client_instance = MagicMock()
        mock_client_instance.post = AsyncMock(return_value=mock_response)

        with patch("app.services.mcp_client.httpx.AsyncClient") as mock_client:
            mock_client.return_value.__aenter__ = AsyncMock(return_value=mock_client_instance)
            mock_client.return_value.__aexit__ = AsyncMock(return_value=False)

            await discover_tools("https://mcp.example.com", token="secret-token", tenant_id="tenant-1")

        call_kwargs = mock_client_instance.post.call_args
        assert call_kwargs.kwargs["headers"]["Authorization"] == "Bearer secret-token"

    @pytest.mark.asyncio
    async def test_caches_results(self):
        """discover_tools caches results for 60 seconds."""
        mock_response = MagicMock()
        mock_response.raise_for_status = MagicMock()
        mock_response.json.return_value = {
            "jsonrpc": "2.0",
            "id": 1,
            "result": {"tools": [{"name": "cached_tool", "description": "cached"}]},
        }

        mock_client_instance = MagicMock()
        mock_client_instance.post = AsyncMock(return_value=mock_response)

        with patch("app.services.mcp_client.httpx.AsyncClient") as mock_client:
            mock_client.return_value.__aenter__ = AsyncMock(return_value=mock_client_instance)
            mock_client.return_value.__aexit__ = AsyncMock(return_value=False)

            # First call
            tools1 = await discover_tools("https://mcp.example.com", tenant_id="tenant-1")
            # Second call (should use cache)
            tools2 = await discover_tools("https://mcp.example.com", tenant_id="tenant-1")

        # httpx should only be called once due to caching
        assert mock_client_instance.post.call_count == 1
        assert len(tools1) == 1
        assert len(tools2) == 1

    @pytest.mark.asyncio
    async def test_cache_isolated_per_tenant(self):
        """discover_tools cache keys include tenant_id."""
        mock_response = MagicMock()
        mock_response.raise_for_status = MagicMock()
        mock_response.json.return_value = {
            "jsonrpc": "2.0",
            "id": 1,
            "result": {"tools": [{"name": "cached_tool", "description": "cached"}]},
        }

        mock_client_instance = MagicMock()
        mock_client_instance.post = AsyncMock(return_value=mock_response)

        with patch("app.services.mcp_client.httpx.AsyncClient") as mock_client:
            mock_client.return_value.__aenter__ = AsyncMock(return_value=mock_client_instance)
            mock_client.return_value.__aexit__ = AsyncMock(return_value=False)

            await discover_tools("https://mcp.example.com", tenant_id="tenant-1")
            await discover_tools("https://mcp.example.com", tenant_id="tenant-1")
            await discover_tools("https://mcp.example.com", tenant_id="tenant-2")

        assert mock_client_instance.post.call_count == 2

    @pytest.mark.asyncio
    async def test_requires_tenant_id(self):
        """discover_tools fails closed when tenant_id is missing."""
        with pytest.raises(ValueError):
            await discover_tools("https://mcp.example.com", tenant_id=None)

    @pytest.mark.asyncio
    async def test_rejects_blocked_url_before_network_call(self):
        """discover_tools rejects SSRF-blocked URLs before hitting network."""
        with patch("app.services.mcp_client.httpx.AsyncClient") as mock_client:
            result = await discover_tools("http://10.0.0.1/rpc", tenant_id="tenant-1")

        assert result == []
        mock_client.assert_not_called()


class TestCallTool:
    """Tests for MCP tool call function."""

    @pytest.mark.asyncio
    async def test_calls_tool_and_returns_result(self):
        """call_tool sends JSON-RPC tools/call and returns text content."""
        mock_response = MagicMock()
        mock_response.raise_for_status = MagicMock()
        mock_response.json.return_value = {
            "jsonrpc": "2.0",
            "id": 1,
            "result": {"content": [{"type": "text", "text": "Search results: found 5 documents"}]},
        }

        mock_client_instance = MagicMock()
        mock_client_instance.post = AsyncMock(return_value=mock_response)

        with patch("app.services.mcp_client.httpx.AsyncClient") as mock_client:
            mock_client.return_value.__aenter__ = AsyncMock(return_value=mock_client_instance)
            mock_client.return_value.__aexit__ = AsyncMock(return_value=False)

            result = await call_tool(
                "https://mcp.example.com",
                "search",
                {"query": "test"},
                tenant_id="tenant-1",
            )

        assert result == "Search results: found 5 documents"

    @pytest.mark.asyncio
    async def test_handles_error_response(self):
        """call_tool returns descriptive error on JSON-RPC error response."""
        mock_response = MagicMock()
        mock_response.raise_for_status = MagicMock()
        mock_response.json.return_value = {
            "jsonrpc": "2.0",
            "id": 1,
            "error": {"code": -1, "message": "not found"},
        }

        mock_client_instance = MagicMock()
        mock_client_instance.post = AsyncMock(return_value=mock_response)

        with patch("app.services.mcp_client.httpx.AsyncClient") as mock_client:
            mock_client.return_value.__aenter__ = AsyncMock(return_value=mock_client_instance)
            mock_client.return_value.__aexit__ = AsyncMock(return_value=False)

            result = await call_tool(
                "https://mcp.example.com",
                "search",
                {"query": "test"},
                tenant_id="tenant-1",
            )

        assert "not found" in result

    @pytest.mark.asyncio
    async def test_handles_timeout(self):
        """call_tool returns timeout error on slow server."""
        mock_client_instance = MagicMock()
        mock_client_instance.post = AsyncMock(side_effect=httpx.TimeoutException("timeout"))

        with patch("app.services.mcp_client.httpx.AsyncClient") as mock_client:
            mock_client.return_value.__aenter__ = AsyncMock(return_value=mock_client_instance)
            mock_client.return_value.__aexit__ = AsyncMock(return_value=False)

            result = await call_tool(
                "https://mcp.example.com",
                "search",
                {"query": "test"},
                timeout=0.1,
                tenant_id="tenant-1",
            )

        assert "timed out" in result

    @pytest.mark.asyncio
    async def test_rejects_blocked_url_before_network_call(self):
        """call_tool rejects SSRF-blocked URLs before hitting network."""
        with patch("app.services.mcp_client.httpx.AsyncClient") as mock_client:
            result = await call_tool(
                "http://169.254.169.254/latest",
                "search",
                {"query": "test"},
                tenant_id="tenant-1",
            )

        assert "blocked" in result.lower()
        mock_client.assert_not_called()


class TestResolveMcpToolsForAgent:
    """Tests for resolve_mcp_tools_for_agent integration."""

    @pytest.mark.asyncio
    async def test_returns_empty_when_no_mcp_servers(self):
        """resolve_mcp_tools_for_agent returns [] when agent has no mcpServers."""
        with patch.dict("os.environ", {"AGENCY_MCP_BRIDGE_ENABLED": "true"}):
            from app.services.agency_tools import resolve_mcp_tools_for_agent

            result = await resolve_mcp_tools_for_agent({"mcpServers": None})
            assert result == []

    @pytest.mark.asyncio
    async def test_returns_empty_when_feature_disabled(self):
        """resolve_mcp_tools_for_agent returns [] when feature flag is off."""
        with patch.dict("os.environ", {"AGENCY_MCP_BRIDGE_ENABLED": "false"}):
            from app.services.agency_tools import resolve_mcp_tools_for_agent

            result = await resolve_mcp_tools_for_agent({
                "mcpServers": [{"url": "https://mcp.example.com", "name": "ext"}],
            })
            assert result == []

    @pytest.mark.asyncio
    async def test_skips_ssrf_blocked_server(self):
        """resolve_mcp_tools_for_agent skips servers with SSRF-blocked URLs."""
        with patch.dict("os.environ", {"AGENCY_MCP_BRIDGE_ENABLED": "true"}):
            from app.services.agency_tools import resolve_mcp_tools_for_agent

            result = await resolve_mcp_tools_for_agent({
                "mcpServers": [{"url": "http://10.0.0.1/rpc", "name": "internal"}],
            }, tenant_id="tenant-1")
            assert result == []

    @pytest.mark.asyncio
    async def test_resolves_tools_with_tenant_scope(self):
        """resolve_mcp_tools_for_agent passes tenant_id through to MCP discovery."""
        mock_response = [
            McpToolInfo(name="search", description="Search docs", input_schema={"type": "object"}),
        ]
        with patch.dict("os.environ", {"AGENCY_MCP_BRIDGE_ENABLED": "true"}), patch(
            "app.services.mcp_client.discover_tools", AsyncMock(return_value=mock_response)
        ) as mock_discover:
            from app.services.agency_tools import resolve_mcp_tools_for_agent

            tools = await resolve_mcp_tools_for_agent(
                {"mcpServers": [{"url": "https://mcp.example.com", "name": "ext"}]},
                tenant_id="tenant-1",
            )

        assert len(tools) == 1
        assert mock_discover.await_args.kwargs["tenant_id"] == "tenant-1"

    @pytest.mark.asyncio
    async def test_resolve_mcp_tools_requires_tenant_id(self):
        """resolve_mcp_tools_for_agent fails closed without tenant_id."""
        with patch.dict("os.environ", {"AGENCY_MCP_BRIDGE_ENABLED": "true"}):
            from app.services.agency_tools import resolve_mcp_tools_for_agent

            with pytest.raises(ValueError):
                await resolve_mcp_tools_for_agent(
                    {"mcpServers": [{"url": "https://mcp.example.com", "name": "ext"}]},
                )
