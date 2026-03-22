"""Tests for the agentic execution path in AgencyOrchestrator."""

from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.services.agency_orchestrator import AgencyOrchestrator, ExecutionContext

pytestmark = [pytest.mark.unit, pytest.mark.agency]


def _build_orchestrator(node_config=None, adapter=None):
    """Build an AgencyOrchestrator with a single agent node for testing."""
    _adapter = adapter or MagicMock()
    _adapter.create_agent = MagicMock(return_value=MagicMock(name="Agent"))
    _adapter.create_agency = MagicMock(return_value="agency-object")
    # Default: returns completion on first call
    _adapter.run = AsyncMock(
        return_value=MagicMock(response='{"complete": true, "answer": "done"}')
    )

    node = {
        "id": "agent-1",
        "name": "TestAgent",
        "instructions": "You are a test agent.",
        "model": "gpt-4o-mini",
        "model_settings": None,
        "is_entry_point": True,
        "node_type": "agent",
        "node_config": node_config or {},
    }

    orchestrator = AgencyOrchestrator(
        nodes=[node],
        edges=[],
        adapter=_adapter,
        db=AsyncMock(),
        agency_config=MagicMock(
            system_prompt="",
            user_id=1,
            conversation_id="test-conv",
            max_run_time_seconds=60,
            credit_multiplier=1.0,
            creator_fee_credits=0,
            platform_share_pct=20,
            creator_id=None,
        ),
    )
    return orchestrator, _adapter


@pytest.mark.asyncio
async def test_agentic_mode_calls_planning_prompt():
    """Agentic mode augments instructions with planning prompt."""
    orch, adapter = _build_orchestrator(
        node_config={"executionMode": "agentic", "planningStrategy": "basic", "maxReflectionCycles": 3}
    )
    ctx = ExecutionContext("test input", "token", "tenant-1")
    result = await orch._execute_agent_node(orch.nodes["agent-1"], ctx)

    # Check planning prompt was in the instructions passed to create_agent
    config_arg = adapter.create_agent.call_args.kwargs["config"]
    assert "You have up to" in config_arg.instructions
    assert "3" in config_arg.instructions
    assert result == "done"


@pytest.mark.asyncio
async def test_agentic_mode_reflection_loop():
    """Agent is called multiple times until CompletionSignal received."""
    orch, adapter = _build_orchestrator(
        node_config={"executionMode": "agentic", "maxReflectionCycles": 5}
    )
    # First call: no signal. Second call: completion.
    adapter.run = AsyncMock(side_effect=[
        MagicMock(response="Still thinking about this..."),
        MagicMock(response='{"complete": true, "answer": "final"}'),
    ])
    ctx = ExecutionContext("test input", "token", "tenant-1")
    result = await orch._execute_agent_node(orch.nodes["agent-1"], ctx)

    assert adapter.run.call_count == 2
    assert result == "final"


@pytest.mark.asyncio
async def test_agentic_mode_max_cycles_respected():
    """Loop stops after maxReflectionCycles even without CompletionSignal."""
    orch, adapter = _build_orchestrator(
        node_config={"executionMode": "agentic", "maxReflectionCycles": 3}
    )
    adapter.run = AsyncMock(
        return_value=MagicMock(response="No completion signal here")
    )
    ctx = ExecutionContext("test input", "token", "tenant-1")
    result = await orch._execute_agent_node(orch.nodes["agent-1"], ctx)

    assert adapter.run.call_count == 3
    assert result == "No completion signal here"


@pytest.mark.asyncio
async def test_single_shot_mode_unchanged():
    """Without executionMode='agentic', single-shot path runs once."""
    orch, adapter = _build_orchestrator(node_config={})
    # Set db=None to skip tool resolution in single-shot path
    orch.db = None
    adapter.run = AsyncMock(
        return_value=MagicMock(response="single shot answer")
    )
    ctx = ExecutionContext("test input", "token", "tenant-1")
    result = await orch._execute_agent_node(orch.nodes["agent-1"], ctx)

    assert adapter.run.call_count == 1
    assert result == "single shot answer"


@pytest.mark.asyncio
async def test_ctx_results_overwritten_not_accumulated():
    """ctx.results[node_id] is overwritten each cycle, not accumulated."""
    orch, adapter = _build_orchestrator(
        node_config={"executionMode": "agentic", "maxReflectionCycles": 3}
    )
    adapter.run = AsyncMock(side_effect=[
        MagicMock(response="cycle 1 output"),
        MagicMock(response="cycle 2 output"),
        MagicMock(response='{"complete": true, "answer": "cycle 3 final"}'),
    ])
    ctx = ExecutionContext("test input", "token", "tenant-1")
    await orch._execute_agent_node(orch.nodes["agent-1"], ctx)

    # Should only contain the last cycle's text
    assert "cycle 1" not in ctx.results.get("agent-1", "")
    assert "cycle 2" not in ctx.results.get("agent-1", "")


@pytest.mark.asyncio
async def test_agentic_mode_zero_cycles_returns_empty():
    """When maxReflectionCycles=0, agentic returns empty without calling LLM."""
    orch, adapter = _build_orchestrator(
        node_config={"executionMode": "agentic", "maxReflectionCycles": 0}
    )
    ctx = ExecutionContext("test input", "token", "tenant-1")
    result = await orch._execute_agent_node(orch.nodes["agent-1"], ctx)

    assert result == ""
    assert adapter.run.call_count == 0


def test_delegation_depth_exists():
    """ExecutionContext has delegation_depth field defaulting to 0."""
    ctx = ExecutionContext("msg", "token", "tenant-1")
    assert hasattr(ctx, "delegation_depth")
    assert ctx.delegation_depth == 0
