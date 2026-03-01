"""Tests for persona_prefix injection into agent instructions."""

import pytest
from unittest.mock import MagicMock, patch
from typing import Any

from app.services.agency_swarm_adapter import AgencySwarmAdapter, AgentConfig


@pytest.mark.unit
class TestAgencyPersonaPrefix:
    """Test persona_prefix injection into agent instructions."""

    def test_prepends_persona_prefix_to_agent_instructions(self):
        """When persona_prefix is in run config, it is prepended to agent.instructions."""
        adapter = AgencySwarmAdapter()

        config = AgentConfig(
            name="TestAgent",
            instructions="You are a test agent.",
            model="gpt-4o",
            is_entry_point=True,
        )

        run_config = {"persona_prefix": "[PERSONA START]\nBe formal and precise.\n[PERSONA END]"}

        # Mock both _create_model and Agent to avoid real Agent validation
        mock_agent = MagicMock()
        with (
            patch.object(adapter, "_create_model", return_value="mock-model"),
            patch("app.services.agency_swarm_adapter.Agent", return_value=mock_agent) as MockAgent,
        ):
            adapter.create_agent(
                config=config,
                user_token="test-token",
                run_config=run_config,
            )

        # Check that Agent was called with instructions containing persona prefix
        call_kwargs = MockAgent.call_args[1]
        assert call_kwargs["instructions"].startswith("[PERSONA START]")
        assert "Be formal and precise." in call_kwargs["instructions"]
        assert "You are a test agent." in call_kwargs["instructions"]

    def test_agent_instructions_unchanged_when_no_persona_prefix(self):
        """When no persona_prefix in config, agent.instructions are unmodified."""
        adapter = AgencySwarmAdapter()

        config = AgentConfig(
            name="TestAgent",
            instructions="You are a test agent.",
            model="gpt-4o",
            is_entry_point=True,
        )

        mock_agent = MagicMock()
        with (
            patch.object(adapter, "_create_model", return_value="mock-model"),
            patch("app.services.agency_swarm_adapter.Agent", return_value=mock_agent) as MockAgent,
        ):
            adapter.create_agent(
                config=config,
                user_token="test-token",
                run_config=None,
            )

        call_kwargs = MockAgent.call_args[1]
        assert call_kwargs["instructions"] == "You are a test agent."

    def test_agent_instructions_unchanged_with_empty_persona_prefix(self):
        """When persona_prefix is empty string, instructions are not modified."""
        adapter = AgencySwarmAdapter()

        config = AgentConfig(
            name="TestAgent",
            instructions="You are a test agent.",
            model="gpt-4o",
            is_entry_point=True,
        )

        run_config: dict[str, Any] = {"persona_prefix": ""}

        mock_agent = MagicMock()
        with (
            patch.object(adapter, "_create_model", return_value="mock-model"),
            patch("app.services.agency_swarm_adapter.Agent", return_value=mock_agent) as MockAgent,
        ):
            adapter.create_agent(
                config=config,
                user_token="test-token",
                run_config=run_config,
            )

        # Empty string is falsy, so instructions should be unchanged
        call_kwargs = MockAgent.call_args[1]
        assert call_kwargs["instructions"] == "You are a test agent."
