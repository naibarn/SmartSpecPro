"""
Tests for agent runtime settings: parallelToolCalls, maxTurns, reasoningEffort.
"""

from unittest.mock import MagicMock, patch, call
import pytest

import app.services.agency_swarm_adapter as adapter_mod
from app.services.agency_swarm_adapter import AgentConfig


def _create_agent_with_mocks(config: AgentConfig):
    """Helper to create an agent with adapter internals mocked."""
    adapter = adapter_mod.AgencySwarmAdapter()
    mock_agent = MagicMock()

    with (
        patch.object(adapter_mod, "Agent", return_value=mock_agent) as MockAgent,
        patch.object(adapter_mod, "OpenAIChatCompletionsModel") as MockModel,
    ):
        MockModel.return_value = MagicMock()
        adapter.create_agent(config=config, user_token="tok")
        return MockAgent, mock_agent


# ── Test 1: ModelSettings includes parallel_tool_calls ─────────────

@pytest.mark.unit
@pytest.mark.agency
def test_model_settings_includes_parallel_tool_calls():
    MockAgent, _ = _create_agent_with_mocks(AgentConfig(
        name="TestAgent",
        instructions="Do stuff",
        model="gpt-4o",
        model_settings={"temperature": 0.7},
        parallel_tool_calls=False,
    ))
    call_kwargs = MockAgent.call_args[1]
    ms = call_kwargs["model_settings"]
    assert ms.parallel_tool_calls is False
    assert ms.temperature == 0.7


# ── Test 2: AgentConfig receives max_turns ───────────────────────────

@pytest.mark.unit
@pytest.mark.agency
def test_agent_config_receives_max_turns():
    MockAgent, _ = _create_agent_with_mocks(AgentConfig(
        name="TestAgent",
        instructions="Do stuff",
        model="gpt-4o",
        max_turns=10,
    ))
    call_kwargs = MockAgent.call_args[1]
    assert call_kwargs["max_turns"] == 10


# ── Test 3: Default max_turns not passed ─────────────────────────────

@pytest.mark.unit
@pytest.mark.agency
def test_default_max_turns_not_passed():
    MockAgent, _ = _create_agent_with_mocks(AgentConfig(
        name="TestAgent",
        instructions="Do stuff",
        model="gpt-4o",
    ))
    call_kwargs = MockAgent.call_args[1]
    assert "max_turns" not in call_kwargs


# ── Test 4: ModelSettings includes reasoning effort ──────────────────

@pytest.mark.unit
@pytest.mark.agency
def test_model_settings_includes_reasoning_effort():
    MockAgent, _ = _create_agent_with_mocks(AgentConfig(
        name="TestAgent",
        instructions="Think hard",
        model="o3",
        model_settings={"reasoningEffort": "high"},
    ))
    call_kwargs = MockAgent.call_args[1]
    ms = call_kwargs["model_settings"]
    assert ms.reasoning is not None
    assert ms.reasoning.effort == "high"


# ── Test 5: ModelSettings without reasoning effort omits it ──────────

@pytest.mark.unit
@pytest.mark.agency
def test_model_settings_without_reasoning_effort():
    MockAgent, _ = _create_agent_with_mocks(AgentConfig(
        name="TestAgent",
        instructions="Normal stuff",
        model="gpt-4o",
        model_settings={"temperature": 0.7},
    ))
    call_kwargs = MockAgent.call_args[1]
    ms = call_kwargs["model_settings"]
    assert ms.reasoning is None
