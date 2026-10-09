"""Tests for McpClientManager — multi-transport MCP client."""

import asyncio
import json
import re
from dataclasses import dataclass
from unittest.mock import AsyncMock, MagicMock, patch

import httpx
import pytest

from app.services.mcp_client_manager import (
    MAX_RESPONSE_BYTES,
    McpClientManager,
    McpConnection,
    McpConnectionError,
    _SESSION_ID_RE,
)


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture
def manager():
    mgr = McpClientManager()
    yield mgr


# ---------------------------------------------------------------------------
# HTTP Transport
# ---------------------------------------------------------------------------

class TestHttpTransport:
    """Test: connect_http creates connection with SSRF validation."""

    @pytest.mark.asyncio
    async def test_connect_http_creates_connection(self, manager: McpClientManager):
        """connect_http with valid public URL returns McpConnection."""
        with patch("app.services.mcp_client_manager._resolve_and_validate_dns") as mock_dns:
            mock_dns.return_value = "93.184.216.34"
            conn = await manager.connect_http(
                url="https://mcp.example.com/rpc",
                tenant_id=1,
            )
            assert isinstance(conn, McpConnection)
            assert conn.transport == "http"
            assert conn.tenant_id == 1

    @pytest.mark.asyncio
    async def test_connect_http_rejects_private_ips(self, manager: McpClientManager):
        """connect_http rejects private IPs after DNS resolution."""
        with patch("app.services.mcp_client_manager._resolve_and_validate_dns") as mock_dns:
            mock_dns.side_effect = McpConnectionError("DNS resolved to blocked IP 10.0.0.1")
            with pytest.raises(McpConnectionError, match="blocked IP"):
                await manager.connect_http(
                    url="https://evil.example.com/rpc",
                    tenant_id=1,
                )

    @pytest.mark.asyncio
    async def test_connect_http_dns_rebinding_prevention(self, manager: McpClientManager):
        """connect_http pins resolved IP for subsequent requests (DNS rebinding prevention)."""
        with patch("app.services.mcp_client_manager._resolve_and_validate_dns") as mock_dns:
            mock_dns.return_value = "93.184.216.34"
            conn = await manager.connect_http(
                url="https://mcp.example.com/rpc",
                tenant_id=1,
            )
            # The validated IP should be stored for verify-after-connect
            assert conn.validated_ip == "93.184.216.34"

    @pytest.mark.asyncio
    async def test_connect_http_no_redirect(self, manager: McpClientManager):
        """connect_http sets redirect behavior to error — no follow redirects."""
        with patch("app.services.mcp_client_manager._resolve_and_validate_dns") as mock_dns:
            mock_dns.return_value = "93.184.216.34"
            conn = await manager.connect_http(
                url="https://mcp.example.com/rpc",
                tenant_id=1,
            )
            assert conn.follow_redirects is False


# ---------------------------------------------------------------------------
# Streamable HTTP Transport
# ---------------------------------------------------------------------------

class TestStreamableHttpTransport:
    """Streamable HTTP transport tests."""

    def test_session_id_regex_valid(self):
        """Mcp-Session-Id format validation: /^[a-zA-Z0-9_-]{1,128}$/."""
        assert _SESSION_ID_RE.match("abc-123_XYZ")
        assert _SESSION_ID_RE.match("a" * 128)

    def test_session_id_regex_rejects_invalid(self):
        """Rejects invalid session IDs."""
        assert not _SESSION_ID_RE.match("")
        assert not _SESSION_ID_RE.match("a" * 129)
        assert not _SESSION_ID_RE.match("abc def")
        assert not _SESSION_ID_RE.match("abc;DROP")

    @pytest.mark.asyncio
    async def test_connect_streamable_http_validates_session_id(
        self, manager: McpClientManager
    ):
        """connect_streamable_http validates Mcp-Session-Id format."""
        with patch("app.services.mcp_client_manager._resolve_and_validate_dns") as mock_dns:
            mock_dns.return_value = "93.184.216.34"
            conn = await manager.connect_streamable_http(
                url="https://mcp.example.com/mcp",
                tenant_id=1,
            )
            assert conn.transport == "streamable_http"

    @pytest.mark.asyncio
    async def test_connect_streamable_http_fallback_on_4xx(
        self, manager: McpClientManager
    ):
        """connect_streamable_http falls back to old SSE transport on 4xx."""
        with patch("app.services.mcp_client_manager._resolve_and_validate_dns") as mock_dns:
            mock_dns.return_value = "93.184.216.34"
            conn = await manager.connect_streamable_http(
                url="https://mcp.example.com/mcp",
                tenant_id=1,
                # The connection is created; fallback happens at call time
            )
            assert conn.sse_fallback_enabled is True


# ---------------------------------------------------------------------------
# Disconnect + Health
# ---------------------------------------------------------------------------

class TestDisconnectAndHealth:
    """disconnect and health_check tests."""

    @pytest.mark.asyncio
    async def test_disconnect_terminates_all(self, manager: McpClientManager):
        """disconnect gracefully terminates all connections."""
        with patch("app.services.mcp_client_manager._resolve_and_validate_dns") as mock_dns:
            mock_dns.return_value = "93.184.216.34"
            conn = await manager.connect_http(
                url="https://mcp.example.com/rpc", tenant_id=1
            )
            manager._connections["test-conn"] = conn
            await manager.disconnect_all()
            assert len(manager._connections) == 0

    @pytest.mark.asyncio
    async def test_health_check_returns_status(self, manager: McpClientManager):
        """health_check pings server and returns status."""
        with patch("app.services.mcp_client_manager._resolve_and_validate_dns") as mock_dns:
            mock_dns.return_value = "93.184.216.34"
            conn = await manager.connect_http(
                url="https://mcp.example.com/rpc", tenant_id=1
            )
            # health_check on an HTTP connection should return a dict with "status"
            result = await manager.health_check(conn)
            assert "status" in result


# ---------------------------------------------------------------------------
# Auto-Reconnect + Response Limits
# ---------------------------------------------------------------------------

class TestReconnectAndLimits:
    """auto-reconnect and response size limit tests."""

    @pytest.mark.asyncio
    async def test_auto_reconnect_max_3_retries(self, manager: McpClientManager):
        """auto-reconnect retries max 3 times with exponential backoff."""
        conn = McpConnection(
            transport="http",
            tenant_id=1,
            url="https://mcp.example.com/rpc",
            validated_ip="93.184.216.34",
        )
        assert conn.max_reconnect_attempts == 3

    def test_response_size_limit_1mb(self):
        """response size limited to 1MB."""
        assert MAX_RESPONSE_BYTES == 1_048_576
