"""Tests for AgencyExecutor workflow node executor.

Run: cd /home/dev/projects/SmartSpecPro/python-backend && pytest tests/unit/test_agency_executor.py -v
"""
import asyncio
from contextlib import contextmanager

import pytest
from unittest.mock import AsyncMock, MagicMock, patch

from app.orchestrator.node_executors.base import ExecutionContext, NodeExecutionData
from app.orchestrator.node_registry import NodeRegistry

VALID_UUID = "a1b2c3d4-e5f6-7890-abcd-ef1234567890"


# ---- Registration Tests ----


@pytest.mark.unit
@pytest.mark.agency
def test_agency_executor_registered_in_node_registry():
    """AgencyExecutor is registered as 'agency_run' in NodeRegistry."""
    registry = NodeRegistry.get_instance()
    spec = registry.get_node_type("agency_run")
    assert spec is not None
    assert spec.type == "agency_run"
    assert spec.display_name == "Agency Run"
    assert spec.category == "ai"
    assert spec.executor == "app.orchestrator.node_executors.agency_executor.AgencyExecutor"


@pytest.mark.unit
@pytest.mark.agency
def test_agency_run_node_has_correct_inputs():
    """agency_run node has agency_id (required) and message (required, connectable) inputs."""
    registry = NodeRegistry.get_instance()
    spec = registry.get_node_type("agency_run")
    assert spec is not None
    input_names = [i.name for i in spec.inputs]
    assert "agency_id" in input_names
    assert "message" in input_names
    agency_id_input = next(i for i in spec.inputs if i.name == "agency_id")
    assert agency_id_input.required is True
    assert agency_id_input.accepts_connection is False
    message_input = next(i for i in spec.inputs if i.name == "message")
    assert message_input.required is True
    assert message_input.accepts_connection is True


@pytest.mark.unit
@pytest.mark.agency
def test_agency_run_node_has_correct_outputs():
    """agency_run node outputs result (text) and run_metadata (json)."""
    registry = NodeRegistry.get_instance()
    spec = registry.get_node_type("agency_run")
    assert spec is not None
    output_names = [o.name for o in spec.outputs]
    assert "result" in output_names
    assert "run_metadata" in output_names


# ---- Execution Helpers ----


def _make_context(**overrides) -> ExecutionContext:
    defaults = {
        "user_id": 42,
        "tenant_id": "tenant-1",
        "workflow_id": "wf-1",
        "execution_id": "exec-1",
        "credits_available": 1000,
        "extra_data": {"user_token": "tok-abc"},
    }
    defaults.update(overrides)
    return ExecutionContext(**defaults)


def _make_data(**overrides) -> NodeExecutionData:
    defaults = {
        "node_id": "node-1",
        "node_type": "agency_run",
        "config": {},
        "inputs": {"agency_id": VALID_UUID, "message": "Hello agents"},
        "state": {},
    }
    defaults.update(overrides)
    return NodeExecutionData(**defaults)


def _make_run_result(**overrides):
    from pydantic import BaseModel

    class MockRunResult(BaseModel):
        run_id: str = "run-123"
        response: str = "Agent response here"
        agent_name: str = "ceo"
        total_tokens: int = 500
        step_count: int = 3
        duration_ms: int = 2500

    return MockRunResult(**overrides)


@contextmanager
def _mock_executor_deps(mock_service):
    """Mock settings, AsyncSessionLocal, and AgencyService for executor tests."""
    mock_session = AsyncMock()
    mock_session.close = AsyncMock()

    with (
        patch(
            "app.orchestrator.node_executors.agency_executor.settings",
            AGENCY_SWARM_ENABLED=True,
        ),
        patch(
            "app.orchestrator.node_executors.agency_executor.AsyncSessionLocal",
            return_value=mock_session,
        ),
        patch(
            "app.orchestrator.node_executors.agency_executor.AgencyService",
            return_value=mock_service,
        ),
    ):
        yield mock_session


# ---- Execution Tests ----


@pytest.mark.unit
@pytest.mark.agency
@pytest.mark.asyncio
async def test_agency_executor_receives_workflow_input_and_returns_output():
    """AgencyExecutor calls AgencyService.execute_run with correct params and returns result."""
    from app.orchestrator.node_executors.agency_executor import AgencyExecutor

    mock_service = AsyncMock()
    mock_service.execute_run = AsyncMock(return_value=_make_run_result())

    with _mock_executor_deps(mock_service):
        executor = AgencyExecutor()
        result = await executor.execute(_make_data(), _make_context())

    assert result["outputs"]["result"] == "Agent response here"
    assert result["outputs"]["run_metadata"]["run_id"] == "run-123"
    assert result["outputs"]["run_metadata"]["agent_steps"] == 3
    assert result["outputs"]["run_metadata"]["duration_ms"] == 2500
    assert result["agency_id"] == VALID_UUID
    assert result["cost"] == 0  # Credits tracked inside AgencyService


@pytest.mark.unit
@pytest.mark.agency
@pytest.mark.asyncio
async def test_agency_executor_respects_workflow_timeout():
    """AgencyExecutor wraps execute_run in asyncio.wait_for with timeout."""
    from app.orchestrator.node_executors.agency_executor import AgencyExecutor

    async def slow_run(*args, **kwargs):
        await asyncio.sleep(10)
        return _make_run_result()

    mock_service = AsyncMock()
    mock_service.execute_run = slow_run

    data = _make_data(inputs={"agency_id": VALID_UUID, "message": "Hi"})
    data.config["timeout_seconds"] = 0.1

    with _mock_executor_deps(mock_service):
        executor = AgencyExecutor()
        result = await executor.execute(data, _make_context())

    assert result["outputs"]["status"] == "error"
    assert "timeout" in result["error"].lower() or "timed out" in result["error"].lower()


@pytest.mark.unit
@pytest.mark.agency
@pytest.mark.asyncio
async def test_agency_executor_handles_agency_failure_gracefully():
    """AgencyExecutor returns error output dict (not exception) when agency run fails."""
    from app.orchestrator.node_executors.agency_executor import AgencyExecutor

    mock_service = AsyncMock()
    mock_service.execute_run = AsyncMock(side_effect=RuntimeError("LLM provider down"))

    with _mock_executor_deps(mock_service):
        executor = AgencyExecutor()
        result = await executor.execute(_make_data(), _make_context())

    assert result["outputs"]["result"] == ""
    assert result["outputs"]["status"] == "error"
    assert "LLM provider down" in result["error"]


@pytest.mark.unit
@pytest.mark.agency
@pytest.mark.asyncio
async def test_agency_executor_missing_agency_id_returns_error():
    """AgencyExecutor returns error when agency_id is not in inputs or config."""
    from app.orchestrator.node_executors.agency_executor import AgencyExecutor

    data = _make_data(inputs={"message": "Hello"}, config={})

    with patch(
        "app.orchestrator.node_executors.agency_executor.settings",
        AGENCY_SWARM_ENABLED=True,
    ):
        executor = AgencyExecutor()
        result = await executor.execute(data, _make_context())

    assert result["outputs"]["status"] == "error"
    assert "agency_id" in result["error"].lower()


@pytest.mark.unit
@pytest.mark.agency
@pytest.mark.asyncio
async def test_agency_executor_passes_user_token_to_agency_service():
    """AgencyExecutor extracts user_token from context.extra_data and passes to AgencyService."""
    from app.orchestrator.node_executors.agency_executor import AgencyExecutor

    mock_service = AsyncMock()
    mock_service.execute_run = AsyncMock(return_value=_make_run_result())

    ctx = _make_context(extra_data={"user_token": "my-secret-token"})

    with _mock_executor_deps(mock_service):
        executor = AgencyExecutor()
        await executor.execute(_make_data(), ctx)

    call_args = mock_service.execute_run.call_args
    run_context = call_args[1].get("context") or call_args[0][2]
    assert run_context.user_token == "my-secret-token"


@pytest.mark.unit
@pytest.mark.agency
@pytest.mark.asyncio
async def test_agency_executor_passes_tenant_id_from_context():
    """AgencyExecutor uses context.tenant_id for tenant isolation in agency lookup."""
    from app.orchestrator.node_executors.agency_executor import AgencyExecutor

    mock_service = AsyncMock()
    mock_service.execute_run = AsyncMock(return_value=_make_run_result())

    ctx = _make_context(tenant_id="tenant-xyz")

    with _mock_executor_deps(mock_service):
        executor = AgencyExecutor()
        await executor.execute(_make_data(), ctx)

    call_args = mock_service.execute_run.call_args
    run_context = call_args[1].get("context") or call_args[0][2]
    assert run_context.tenant_id == "tenant-xyz"


@pytest.mark.unit
@pytest.mark.agency
@pytest.mark.asyncio
async def test_agency_executor_checks_feature_flag():
    """AgencyExecutor returns error when AGENCY_SWARM_ENABLED is false."""
    from app.orchestrator.node_executors.agency_executor import AgencyExecutor

    with patch(
        "app.orchestrator.node_executors.agency_executor.settings"
    ) as mock_settings:
        mock_settings.AGENCY_SWARM_ENABLED = False
        executor = AgencyExecutor()
        result = await executor.execute(_make_data(), _make_context())

    assert result["outputs"]["status"] == "error"
    assert "disabled" in result["error"].lower() or "not enabled" in result["error"].lower()


@pytest.mark.unit
@pytest.mark.agency
@pytest.mark.asyncio
async def test_agency_executor_closes_session_on_success():
    """AgencyExecutor closes the DB session after successful execution."""
    from app.orchestrator.node_executors.agency_executor import AgencyExecutor

    mock_service = AsyncMock()
    mock_service.execute_run = AsyncMock(return_value=_make_run_result())

    with _mock_executor_deps(mock_service) as mock_session:
        executor = AgencyExecutor()
        await executor.execute(_make_data(), _make_context())

    mock_session.close.assert_awaited_once()


@pytest.mark.unit
@pytest.mark.agency
@pytest.mark.asyncio
async def test_agency_executor_closes_session_on_failure():
    """AgencyExecutor closes the DB session even when execution fails."""
    from app.orchestrator.node_executors.agency_executor import AgencyExecutor

    mock_service = AsyncMock()
    mock_service.execute_run = AsyncMock(side_effect=RuntimeError("boom"))

    with _mock_executor_deps(mock_service) as mock_session:
        executor = AgencyExecutor()
        await executor.execute(_make_data(), _make_context())

    mock_session.close.assert_awaited_once()
