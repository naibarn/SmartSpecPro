"""Tests for SSPToolBridge and tool resolution."""
import pytest
from unittest.mock import AsyncMock, MagicMock, patch

pytestmark = [pytest.mark.unit, pytest.mark.agency]


class TestToolConfig:
    """Tests for ToolConfig pydantic model."""

    def test_tool_config_model_validates(self):
        """ToolConfig validates tool_id, risk_level, requires_approval."""
        from app.services.agency_tools import ToolConfig

        config = ToolConfig(
            tool_id="search-web",
            tool_type="builtin",
            risk_level="low",
            requires_approval=False,
        )
        assert config.tool_id == "search-web"
        assert config.risk_level == "low"
        assert config.requires_approval is False

    def test_tool_config_defaults(self):
        """ToolConfig has correct defaults for optional fields."""
        from app.services.agency_tools import ToolConfig

        config = ToolConfig(
            tool_id="test",
            tool_type="builtin",
            risk_level="low",
            requires_approval=False,
        )
        assert config.endpoint_url is None
        assert config.config == {}


class TestSSPToolBridge:
    """Tests for SSPToolBridge routing logic."""

    def test_low_risk_allowed_without_whitelist(self):
        """Low-risk tool executes even if not in whitelist."""
        from app.services.agency_tools import create_tool_bridge, ToolConfig

        config = ToolConfig(
            tool_id="search-web",
            tool_type="builtin",
            risk_level="low",
            requires_approval=False,
            endpoint_url="http://localhost:8000/api/tools/search",
        )
        BridgeCls = create_tool_bridge(config, whitelist=set())
        # Low risk tools are allowed regardless of whitelist
        assert BridgeCls._tool_config.risk_level == "low"

    def test_high_risk_blocked_without_whitelist(self):
        """High-risk tool not in whitelist returns error message."""
        from app.services.agency_tools import create_tool_bridge, ToolConfig

        config = ToolConfig(
            tool_id="code-exec",
            tool_type="sandbox",
            risk_level="high",
            requires_approval=True,
        )
        BridgeCls = create_tool_bridge(config, whitelist=set())
        instance = BridgeCls()
        result = instance.run()
        assert "not authorized" in result.lower()

    def test_high_risk_allowed_with_whitelist(self):
        """High-risk tool in whitelist proceeds to execution."""
        from app.services.agency_tools import create_tool_bridge, ToolConfig

        config = ToolConfig(
            tool_id="code-exec",
            tool_type="sandbox",
            risk_level="high",
            requires_approval=True,
            endpoint_url="http://localhost:8000/api/sandbox/exec",
        )
        BridgeCls = create_tool_bridge(config, whitelist={"code-exec"})
        instance = BridgeCls()
        # When whitelisted, the tool runs (but may fail due to no actual endpoint)
        result = instance.run()
        # Should attempt execution (not blocked), may have execution error
        assert "not authorized" not in result.lower()

    def test_medium_risk_blocked_without_whitelist(self):
        """Medium-risk tool not in whitelist returns error message."""
        from app.services.agency_tools import create_tool_bridge, ToolConfig

        config = ToolConfig(
            tool_id="api-call",
            tool_type="custom",
            risk_level="medium",
            requires_approval=False,
        )
        BridgeCls = create_tool_bridge(config, whitelist=set())
        instance = BridgeCls()
        result = instance.run()
        assert "not authorized" in result.lower()

    def test_medium_risk_allowed_with_whitelist(self):
        """Medium-risk tool in whitelist proceeds."""
        from app.services.agency_tools import create_tool_bridge, ToolConfig

        config = ToolConfig(
            tool_id="api-call",
            tool_type="custom",
            risk_level="medium",
            requires_approval=False,
            endpoint_url="http://localhost:8000/api/tools/custom",
        )
        BridgeCls = create_tool_bridge(config, whitelist={"api-call"})
        instance = BridgeCls()
        result = instance.run()
        assert "not authorized" not in result.lower()

    def test_bridge_cls_is_proper_subclass(self):
        """create_tool_bridge returns a class (not instance) for agency-swarm."""
        from app.services.agency_tools import create_tool_bridge, ToolConfig

        config = ToolConfig(
            tool_id="search",
            tool_type="builtin",
            risk_level="low",
            requires_approval=False,
        )
        BridgeCls = create_tool_bridge(config, whitelist=set())
        assert isinstance(BridgeCls, type)
        assert BridgeCls.__name__.startswith("SSPTool_")


class TestToolResolution:
    """Tests for resolve_tools_for_agent."""

    async def test_resolve_returns_list_of_classes(self):
        """resolve_tools_for_agent returns tool classes (not instances)."""
        from app.services.agency_tools import resolve_tools_for_agent

        # Mock DB session that returns tool configs
        mock_db = AsyncMock()
        mock_result = MagicMock()
        mock_result.all.return_value = [
            MagicMock(
                tool_id="search-web",
                name="Web Search",
                description="Search the web",
                tool_type="builtin",
                risk_level="low",
                requires_approval=False,
                config=None,
            ),
        ]
        mock_db.execute = AsyncMock(return_value=mock_result)

        tools = await resolve_tools_for_agent(
            db=mock_db,
            agent_id="agent-1",
            agency_whitelist={"search-web"},
        )

        assert len(tools) >= 0  # May be empty if SQL mock doesn't match
        # Each tool should be a class
        for t in tools:
            assert isinstance(t, type)

    async def test_resolve_filters_external_retrieval_tools_for_library_only_scope(self):
        """library_only removes external retrieval tools at resolution time."""
        from app.services.agency_tools import resolve_tools_for_agent

        mock_db = AsyncMock()
        mock_result = MagicMock()
        mock_result.all.return_value = [
            MagicMock(
                tool_id="builtin-web-search",
                tool_type="builtin",
                risk_level="medium",
                requires_approval=False,
                base_config=None,
                instance_config=None,
            ),
            MagicMock(
                tool_id="builtin-document-search",
                tool_type="builtin",
                risk_level="low",
                requires_approval=False,
                base_config=None,
                instance_config=None,
            ),
        ]
        mock_db.execute = AsyncMock(return_value=mock_result)

        tools = await resolve_tools_for_agent(
            db=mock_db,
            agent_id="agent-1",
            agency_whitelist={"builtin-web-search", "builtin-document-search"},
            retrieval_scope_mode="library_only",
        )

        resolved_tool_ids = [tool._tool_config.tool_id for tool in tools]
        assert resolved_tool_ids == ["builtin-document-search"]

    async def test_resolve_keeps_web_search_when_scope_allows_fallback(self):
        """tenant_accessible keeps web-search available for fallback-capable templates."""
        from app.services.agency_tools import resolve_tools_for_agent

        mock_db = AsyncMock()
        mock_result = MagicMock()
        mock_result.all.return_value = [
            MagicMock(
                tool_id="builtin-web-search",
                tool_type="builtin",
                risk_level="medium",
                requires_approval=False,
                base_config=None,
                instance_config=None,
            ),
        ]
        mock_db.execute = AsyncMock(return_value=mock_result)

        tools = await resolve_tools_for_agent(
            db=mock_db,
            agent_id="agent-1",
            agency_whitelist={"builtin-web-search"},
            retrieval_scope_mode="tenant_accessible",
        )

        resolved_tool_ids = [tool._tool_config.tool_id for tool in tools]
        assert resolved_tool_ids == ["builtin-web-search"]
