"""Tests for tool whitelist enforcement in SSPToolBridge."""

import pytest
from app.services.agency_tools import ToolConfig, create_tool_bridge, _make_run_func


@pytest.mark.unit
@pytest.mark.agency
class TestToolWhitelistEnforcement:
    """Tests for tool whitelist enforcement."""

    def test_tool_not_in_whitelist_is_blocked(self):
        config = ToolConfig(
            tool_id="tool-xyz",
            tool_type="builtin",
            risk_level="medium",
            requires_approval=False,
            endpoint_url="http://localhost/tools/xyz",
        )
        # Empty whitelist
        tool_cls = create_tool_bridge(config, whitelist=set())
        instance = tool_cls(query="test query")
        result = instance.run()
        assert "not authorized" in result.lower()

    def test_tool_in_whitelist_is_allowed(self):
        config = ToolConfig(
            tool_id="tool-abc",
            tool_type="builtin",
            risk_level="medium",
            requires_approval=False,
            endpoint_url="http://localhost/tools/abc",
        )
        # Tool is in whitelist -- will attempt HTTP call which should fail
        # in test env, but the point is it doesn't return the blocked message
        tool_cls = create_tool_bridge(config, whitelist={"tool-abc"})
        instance = tool_cls(query="test query")
        result = instance.run()
        # Should NOT contain the blocked message
        assert "not authorized" not in result.lower()

    def test_high_risk_tool_not_in_whitelist_is_blocked(self):
        config = ToolConfig(
            tool_id="tool-danger",
            tool_type="sandbox",
            risk_level="high",
            requires_approval=True,
            endpoint_url="http://localhost/sandbox/danger",
        )
        tool_cls = create_tool_bridge(config, whitelist=set())
        instance = tool_cls(query="test")
        result = instance.run()
        assert "not authorized" in result.lower()

    def test_low_risk_tool_not_needing_whitelist(self):
        config = ToolConfig(
            tool_id="tool-safe",
            tool_type="builtin",
            risk_level="low",
            requires_approval=False,
            endpoint_url="http://localhost/tools/safe",
        )
        # Low-risk tools are not checked against whitelist
        tool_cls = create_tool_bridge(config, whitelist=set())
        instance = tool_cls(query="test")
        result = instance.run()
        # Should not be blocked by whitelist (may fail for other reasons like connection)
        assert "not authorized" not in result.lower()
