"""Tests for internal MCP API auth hardening (section-02).

Covers F26 (OAuth tools without user_id), F29 (Depends pattern).
"""

import inspect
from unittest.mock import AsyncMock, patch

import pytest
from fastapi.params import Depends as DependsClass

pytestmark = [pytest.mark.unit]


class TestToolListAuth:
    """F26: Tool list returns only browser tools when user_id is None."""

    @pytest.mark.asyncio
    async def test_no_user_id_returns_only_browser_tools(self):
        """When user_id is None, only browser tools are returned (no Drive/OneDrive)."""
        from app.api.internal_mcp import list_tools

        with patch("app.api.internal_mcp._verify_proxy_token", AsyncMock()):
            result = await list_tools(user_id=None)

        tools = result["tools"]
        tool_names = [t["name"] for t in tools]
        # Browser tools should be present
        assert "browser.execute_actions" in tool_names
        assert "sandbox.exec_command" in tool_names
        # OAuth-dependent tools should NOT be present
        for name in tool_names:
            assert "drive" not in name.lower(), f"OAuth tool '{name}' should not be listed without user_id"
            assert "onedrive" not in name.lower(), f"OAuth tool '{name}' should not be listed without user_id"


class TestDependsPattern:
    """F29: _verify_proxy_token must use FastAPI Depends, not manual call."""

    def test_list_tools_uses_depends(self):
        """list_tools endpoint uses Depends() for proxy token verification."""
        from app.api.internal_mcp import list_tools

        sig = inspect.signature(list_tools)
        # Check if any parameter has a Depends default
        has_depends = False
        for param in sig.parameters.values():
            if isinstance(param.default, DependsClass):
                has_depends = True
                break
        assert has_depends, "list_tools should use Depends() for proxy token verification"

    def test_call_tool_uses_depends(self):
        """call_tool endpoint uses Depends() for proxy token verification."""
        from app.api.internal_mcp import call_tool

        sig = inspect.signature(call_tool)
        has_depends = False
        for param in sig.parameters.values():
            if isinstance(param.default, DependsClass):
                has_depends = True
                break
        assert has_depends, "call_tool should use Depends() for proxy token verification"
