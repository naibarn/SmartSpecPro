"""Tests for ReAct integration path in AgencyOrchestrator."""

import pytest
from unittest.mock import AsyncMock, MagicMock, patch

from app.services.react_executor import ReActResult
from app.services.agentic_cost_controls import AcquireResult

pytestmark = [pytest.mark.unit]


def _make_node(node_config=None):
    """Build a mock node dict configured for ReAct."""
    default_config = {
        "executionMode": "agentic",
        "planningStrategy": "react",
        "maxReflectionCycles": 5,
        "maxTokensBudget": 50000,
    }
    if node_config:
        default_config.update(node_config)
    return {
        "id": "agent-1",
        "name": "Test Agent",
        "node_type": "agent",
        "instructions": "You are helpful.",
        "model": "gpt-4o",
        "node_config": default_config,
        "tools": [
            {"toolId": "builtin-web-search", "toolConfig": {}},
        ],
    }


def _make_ctx():
    """Build a mock ExecutionContext."""
    ctx = MagicMock()
    ctx.tenant_id = "tenant-1"
    ctx.user_id = "user-1"
    ctx.user_token = "test-token"
    ctx.run_id = "run-1"
    ctx.results = {}
    ctx.get_context_text.return_value = "Do something"
    return ctx


@pytest.mark.asyncio
async def test_react_path_activated_for_react_strategy():
    """When planningStrategy == 'react', ReActExecutor is used."""
    node = _make_node()
    ctx = _make_ctx()

    mock_result = ReActResult(
        status="complete", final_answer="done", iterations=2, total_tokens=5000
    )

    with patch("app.services.agentic_feature_flags.check_agentic_flag", return_value=True), \
         patch("app.core.redis_client.get_cache_redis", return_value=AsyncMock()), \
         patch("app.services.agentic_cost_controls.ConcurrentRunLimiter") as MockLimiter, \
         patch("app.services.react_executor.ReActExecutor") as MockExecutor, \
         patch("openai.AsyncOpenAI"):

        MockLimiter.return_value.acquire = AsyncMock(return_value=MagicMock(success=True))
        MockLimiter.return_value.release = AsyncMock()

        mock_exec_instance = AsyncMock()
        mock_exec_instance.execute.return_value = mock_result
        MockExecutor.return_value = mock_exec_instance

        from app.services.agency_orchestrator import AgencyOrchestrator
        orch = MagicMock(spec=AgencyOrchestrator)
        orch.event_emitter = None
        orch._resolve_tool_configs_for_react = AsyncMock(return_value=([], {}))

        result = await AgencyOrchestrator._execute_react_path(orch, node, ctx, "Do something")

    assert result == "done"


@pytest.mark.asyncio
async def test_non_react_strategy_uses_reflection_loop():
    """When planningStrategy == 'basic', ReActExecutor is NOT used."""
    node = _make_node({"planningStrategy": "basic"})
    ctx = _make_ctx()

    from app.services.agency_orchestrator import AgencyOrchestrator
    orch = MagicMock(spec=AgencyOrchestrator)
    orch._execute_agent_node_agentic_reflection = AsyncMock(return_value="reflection result")

    result = await AgencyOrchestrator._execute_agent_node_agentic(orch, node, ctx, "Do something")
    assert result == "reflection result"
    orch._execute_agent_node_agentic_reflection.assert_called_once()


@pytest.mark.asyncio
async def test_react_path_respects_feature_flag():
    """When agencyReactExecutorEnabled is False, falls back to reflection loop."""
    node = _make_node()
    ctx = _make_ctx()

    from app.services.agency_orchestrator import AgencyOrchestrator
    orch = MagicMock(spec=AgencyOrchestrator)
    orch._execute_agent_node_agentic_reflection = AsyncMock(return_value="fallback result")

    with patch("app.services.agentic_feature_flags.check_agentic_flag", return_value=False):
        result = await AgencyOrchestrator._execute_react_path(orch, node, ctx, "Do something")

    assert result == "fallback result"


@pytest.mark.asyncio
async def test_concurrent_run_limiter_blocks_when_full():
    """When limiter returns failure, return error message."""
    node = _make_node()
    ctx = _make_ctx()

    from app.services.agency_orchestrator import AgencyOrchestrator
    orch = MagicMock(spec=AgencyOrchestrator)

    with patch("app.services.agentic_feature_flags.check_agentic_flag", return_value=True), \
         patch("app.core.redis_client.get_cache_redis", return_value=AsyncMock()), \
         patch("app.services.agentic_cost_controls.ConcurrentRunLimiter") as MockLimiter:

        MockLimiter.return_value.acquire = AsyncMock(
            return_value=AcquireResult(
                success=False,
                error_code="concurrent_limit_exceeded",
                retry_after=30,
                message="Maximum concurrent agentic runs reached.",
            )
        )
        MockLimiter.return_value.release = AsyncMock()

        result = await AgencyOrchestrator._execute_react_path(orch, node, ctx, "Do something")

    assert "Maximum concurrent" in result


@pytest.mark.asyncio
async def test_gateway_client_created_with_user_token():
    """AsyncOpenAI is constructed with api_key=ctx.user_token."""
    node = _make_node()
    ctx = _make_ctx()
    ctx.user_token = "my-secret-token"

    mock_result = ReActResult(
        status="complete", final_answer="done", iterations=1, total_tokens=100
    )

    with patch("app.services.agentic_feature_flags.check_agentic_flag", return_value=True), \
         patch("app.core.redis_client.get_cache_redis", return_value=AsyncMock()), \
         patch("app.services.agentic_cost_controls.ConcurrentRunLimiter") as MockLimiter, \
         patch("app.services.react_executor.ReActExecutor") as MockExecutor, \
         patch("openai.AsyncOpenAI") as MockOpenAI:

        MockLimiter.return_value.acquire = AsyncMock(return_value=MagicMock(success=True))
        MockLimiter.return_value.release = AsyncMock()
        mock_exec_instance = AsyncMock()
        mock_exec_instance.execute.return_value = mock_result
        MockExecutor.return_value = mock_exec_instance

        from app.services.agency_orchestrator import AgencyOrchestrator
        orch = MagicMock(spec=AgencyOrchestrator)
        orch.event_emitter = None
        orch._resolve_tool_configs_for_react = AsyncMock(return_value=([], {}))

        await AgencyOrchestrator._execute_react_path(orch, node, ctx, "test")

        MockOpenAI.assert_called_once()
        call_kwargs = MockOpenAI.call_args[1]
        assert call_kwargs["api_key"] == "my-secret-token"
        assert "/v1" in call_kwargs["base_url"]
