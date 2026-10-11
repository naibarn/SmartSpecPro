"""Tests for the active browser MCP security boundary.

Covers the retired command-execution surface, domain SSRF blocklist, and
gateway configuration behavior.
"""

from unittest.mock import patch

import pytest

pytestmark = [pytest.mark.unit]


class TestRetiredCommandSurface:
    """OpenSandbox-backed command execution must stay unavailable."""

    def test_command_execution_is_not_exported_as_an_mcp_tool(self):
        from app.mcp import browser_tools_mcp

        assert set(browser_tools_mcp.TOOL_HANDLERS) == {"browser.execute_actions"}
        assert not hasattr(browser_tools_mcp, "handle_sandbox_exec_command")


class TestDomainValidation:
    """F23: allowed_domains must be validated against SSRF blocklist."""

    @pytest.mark.asyncio
    async def test_blocks_localhost_domain(self):
        """localhost in allowed_domains is rejected."""
        from app.mcp.browser_tools_mcp import _validate_domains

        result = _validate_domains(["localhost", "example.com"])
        assert "localhost" not in result
        assert "example.com" in result

    @pytest.mark.asyncio
    async def test_blocks_metadata_ip(self):
        """Cloud metadata IP in allowed_domains is rejected."""
        from app.mcp.browser_tools_mcp import _validate_domains

        result = _validate_domains(["169.254.169.254", "github.com"])
        assert "169.254.169.254" not in result
        assert "github.com" in result

    @pytest.mark.asyncio
    async def test_blocks_private_ip(self):
        """Private IPs in allowed_domains are rejected."""
        from app.mcp.browser_tools_mcp import _validate_domains

        result = _validate_domains(["192.168.1.1", "10.0.0.1", "example.com"])
        assert "192.168.1.1" not in result
        assert "10.0.0.1" not in result
        assert "example.com" in result

    @pytest.mark.asyncio
    async def test_allows_valid_public_domains(self):
        """Valid public domains pass validation."""
        from app.mcp.browser_tools_mcp import _validate_domains

        result = _validate_domains(["example.com", "github.com"])
        assert result == ["example.com", "github.com"]


class TestLocalhostFallback:
    """F24: Missing SMARTSPEC_WEB_GATEWAY_URL must raise error, not fallback."""

    @pytest.mark.asyncio
    async def test_missing_gateway_url_raises_error(self):
        """Missing SMARTSPEC_WEB_GATEWAY_URL raises ToolError, not fallback to localhost."""
        from app.mcp.browser_tools_mcp import handle_browser_execute_actions, ToolError

        with patch("app.mcp.browser_tools_mcp.settings") as mock_settings:
            mock_settings.SMARTSPEC_WEB_GATEWAY_URL = ""
            mock_settings.SMARTSPEC_WEB_GATEWAY_TOKEN = "valid-token"

            with pytest.raises(ToolError) as exc_info:
                await handle_browser_execute_actions(
                    allowed_domains=["example.com"],
                    actions=[{"type": "navigate", "url": "https://example.com"}],
                    user_id=1, tenant_id="t1",
                )
            assert "not configured" in exc_info.value.message.lower()
