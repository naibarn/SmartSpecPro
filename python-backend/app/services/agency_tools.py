"""
SSPToolBridge -- bridges SmartSpecPro tools to agency-swarm's BaseTool interface.

Tool routing by risk level:
- low: always allowed, direct HTTP call
- medium: allowed only if whitelisted, direct HTTP call
- high: allowed only if whitelisted, dispatch to OpenSandbox

Whitelist enforcement returns a user-friendly error string (not exception)
so the agent can gracefully explain the denial.
"""

import httpx
import structlog
from pydantic import BaseModel, Field
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession
from typing import Any

logger = structlog.get_logger(__name__)


class ToolConfig(BaseModel):
    """Configuration for a bridged tool."""

    tool_id: str
    tool_type: str  # builtin / skill / sandbox / custom
    risk_level: str  # low / medium / high
    requires_approval: bool
    endpoint_url: str | None = None
    config: dict[str, Any] = {}


def create_tool_bridge(
    tool_config: ToolConfig,
    whitelist: set[str],
) -> type:
    """Create an SSPToolBridge subclass for agency-swarm.

    agency-swarm expects tool CLASSES (not instances) to be passed to Agent.
    This factory creates a dynamic subclass with the tool config baked in
    via closure variables (not class attributes, to avoid Pydantic conflicts).

    Args:
        tool_config: Tool configuration.
        whitelist: Set of allowed tool IDs for this agency.

    Returns:
        A new class (subclass of BaseModel) that agency-swarm can use as a tool.
    """
    # Capture in closure -- accessed by methods, not as class attributes
    captured_config = tool_config
    captured_whitelist = whitelist
    safe_name = tool_config.tool_id.replace("-", "_").replace(".", "_")

    class _SSPToolBridge(BaseModel):
        """SmartSpecPro tool bridge for agency-swarm."""

        query: str = Field(default="", description="Input for the tool")

        def run(self) -> str:
            """Execute the tool with risk-level routing and whitelist enforcement."""
            config = captured_config

            # Whitelist check for medium and high risk
            if config.risk_level in ("medium", "high"):
                if config.tool_id not in captured_whitelist:
                    logger.warning(
                        "agency_tool_blocked",
                        tool_id=config.tool_id,
                        risk_level=config.risk_level,
                    )
                    return (
                        f"Tool '{config.tool_id}' is not authorized for this agency. "
                        f"Only whitelisted tools can be used."
                    )

            # Route based on risk level
            if config.risk_level == "high":
                return self._execute_sandbox()
            else:
                return self._execute_http()

        def _execute_http(self) -> str:
            """Execute via direct HTTP call to service endpoint."""
            if not captured_config.endpoint_url:
                return f"Tool '{captured_config.tool_id}' has no endpoint configured."

            try:
                with httpx.Client(timeout=30.0) as client:
                    resp = client.post(
                        captured_config.endpoint_url,
                        json={"query": self.query, **captured_config.config},
                    )
                    if resp.status_code == 200:
                        return resp.text
                    return f"Tool error (HTTP {resp.status_code}): {resp.text[:200]}"
            except Exception as exc:
                logger.error(
                    "agency_tool_http_error",
                    tool_id=captured_config.tool_id,
                    error=str(exc),
                )
                return f"Tool execution failed: {str(exc)[:200]}"

        def _execute_sandbox(self) -> str:
            """Execute via OpenSandbox dispatch."""
            if not captured_config.endpoint_url:
                return f"Tool '{captured_config.tool_id}' has no sandbox endpoint configured."

            try:
                with httpx.Client(timeout=60.0) as client:
                    resp = client.post(
                        captured_config.endpoint_url,
                        json={
                            "tool_id": captured_config.tool_id,
                            "input": self.query,
                            **captured_config.config,
                        },
                    )
                    if resp.status_code == 200:
                        return resp.text
                    return f"Sandbox error (HTTP {resp.status_code}): {resp.text[:200]}"
            except Exception as exc:
                logger.error(
                    "agency_tool_sandbox_error",
                    tool_id=captured_config.tool_id,
                    error=str(exc),
                )
                return f"Sandbox execution failed: {str(exc)[:200]}"

    # Set a descriptive class name for agency-swarm
    _SSPToolBridge.__name__ = f"SSPTool_{safe_name}"
    _SSPToolBridge.__qualname__ = f"SSPTool_{safe_name}"
    # Store config as accessible attribute for tests
    _SSPToolBridge._tool_config = captured_config  # type: ignore[attr-defined]

    return _SSPToolBridge


async def resolve_tools_for_agent(
    db: AsyncSession,
    agent_id: str,
    agency_whitelist: set[str],
) -> list[type]:
    """Resolve and construct tool bridges for a specific agent.

    Queries agency_agent_tools and agency_tools to get tool configs,
    then creates tool bridge classes for each tool.

    Args:
        db: Database session.
        agent_id: The agent's ID.
        agency_whitelist: Set of tool IDs allowed for this agency.

    Returns:
        List of tool bridge classes (not instances -- agency-swarm
        expects tool classes, not instances).
    """
    query = text("""
        SELECT
            t.id as tool_id,
            t.name,
            t.description,
            t."toolType" as tool_type,
            t."riskLevel" as risk_level,
            t."requiresApproval" as requires_approval,
            t.config
        FROM agency_agent_tools aat
        JOIN agency_tools t ON t.id = aat."toolId"
        WHERE aat."agentId" = :agent_id
    """)

    result = await db.execute(query, {"agent_id": agent_id})
    rows = result.all()

    tool_classes: list[type] = []
    for row in rows:
        config = ToolConfig(
            tool_id=row.tool_id,
            tool_type=row.tool_type or "builtin",
            risk_level=row.risk_level or "low",
            requires_approval=bool(row.requires_approval),
            config=row.config or {},
        )
        tool_cls = create_tool_bridge(config, agency_whitelist)
        tool_classes.append(tool_cls)

    logger.info(
        "agency_tools_resolved",
        agent_id=agent_id,
        tool_count=len(tool_classes),
    )

    return tool_classes
