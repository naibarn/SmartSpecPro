"""Tests for LangGraph Runtime Core."""

import pytest
from app.orchestrator.langgraph_runtime import LangGraphRuntime
from app.orchestrator.errors import CompilationError


@pytest.mark.asyncio
async def test_runtime_initialization():
    """Test that runtime initializes correctly."""
    runtime = LangGraphRuntime(use_postgres=False)
    assert not runtime.is_initialized

    await runtime.initialize()
    assert runtime.is_initialized

    await runtime.close()
    assert not runtime.is_initialized


@pytest.mark.asyncio
async def test_compile_rejects_empty_workflow():
    """Test that compilation rejects workflows with no nodes."""
    runtime = LangGraphRuntime(use_postgres=False)
    await runtime.initialize()

    with pytest.raises(CompilationError) as exc_info:
        await runtime.compile({"nodes": [], "edges": []})

    assert "at least one node" in str(exc_info.value)

    await runtime.close()


@pytest.mark.asyncio
async def test_compile_rejects_missing_trigger():
    """Test that compilation requires a trigger node."""
    runtime = LangGraphRuntime(use_postgres=False)
    await runtime.initialize()

    workflow_json = {
        "nodes": [
            {"id": "node1", "data": {"nodeType": "transform", "config": {}}}
        ],
        "edges": []
    }

    with pytest.raises(CompilationError) as exc_info:
        await runtime.compile(workflow_json)

    # Check that one of the errors mentions trigger node
    error_messages = " ".join(exc_info.value.errors).lower()
    assert "trigger node" in error_messages

    await runtime.close()


@pytest.mark.asyncio
async def test_build_config_creates_thread_id():
    """Test that build_config creates namespaced thread_id."""
    runtime = LangGraphRuntime(use_postgres=False)

    config = runtime.build_config(
        tenant_id="tenant123",
        execution_id="exec456",
        user_id=789,
        workflow_id="wf999",
    )

    assert config["configurable"]["thread_id"] == "tenant123:exec456"
    assert config["configurable"]["user_id"] == 789
    assert config["configurable"]["workflow_id"] == "wf999"
