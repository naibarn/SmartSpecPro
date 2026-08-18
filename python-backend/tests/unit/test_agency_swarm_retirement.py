"""Regression tests for the permanent Agency Swarm retirement boundary."""

import pytest

from app.services.agency_swarm_adapter import (
    AgencyConfig,
    AgencySwarmAdapter,
    AgencySwarmRetiredError,
    AgentConfig,
)


def test_legacy_adapter_keeps_config_shapes_without_sdk_imports() -> None:
    agent = AgentConfig(name="legacy", instructions="unused", model="legacy-model")
    agency = AgencyConfig(
        agency_id="agency-1",
        name="Legacy",
        system_prompt="unused",
        communication_flows=[],
        tenant_id="tenant-1",
        user_id=1,
        conversation_id="conversation-1",
    )
    assert agent.name == "legacy"
    assert agency.agency_id == "agency-1"


def test_legacy_adapter_rejects_provider_execution() -> None:
    with pytest.raises(AgencySwarmRetiredError, match="retired"):
        AgencySwarmAdapter().create_agent(
            AgentConfig(name="legacy", instructions="unused", model="legacy-model"),
            user_token="unused",
        )


def test_legacy_adapter_stream_cleanup_is_idempotent() -> None:
    assert AgencySwarmAdapter.extract_stream_usage(object()) == (0, 0, 0, 0, [])
    assert AgencySwarmAdapter.cancel_stream(object()) is None
