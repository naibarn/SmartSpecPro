"""Tests for node executors."""
import pytest
from app.orchestrator.node_executors.base import ExecutionContext, NodeExecutionData
from app.orchestrator.node_executors.llm_executor import LLMExecutor
from app.orchestrator.node_executors.rag_executor import RAGExecutor
from app.orchestrator.node_executors.conditional_executor import ConditionalExecutor
from app.orchestrator.node_executors.approval_executor import ApprovalExecutor
from app.orchestrator.node_executors.image_executor import ImageExecutor


@pytest.mark.asyncio
async def test_llm_executor_basic():
    """Test LLM executor returns response and usage."""
    executor = LLMExecutor()
    data = NodeExecutionData(
        node_id="node1",
        node_type="llm_call",
        config={"model": "gpt-4o-mini"},
        inputs={"prompt": "Hello world"},
        state={},
    )
    context = ExecutionContext(
        user_id=1, tenant_id="test", workflow_id="wf1", execution_id="ex1"
    )

    result = await executor.execute(data, context)
    assert "response" in result
    assert "usage" in result


@pytest.mark.asyncio
async def test_rag_executor_basic():
    """Test RAG executor returns documents."""
    executor = RAGExecutor()
    data = NodeExecutionData(
        node_id="node1",
        node_type="rag_query",
        config={},
        inputs={"query": "test query"},
        state={},
    )
    context = ExecutionContext(
        user_id=1, tenant_id="test", workflow_id="wf1", execution_id="ex1"
    )

    result = await executor.execute(data, context)
    assert "documents" in result
    assert "context" in result


@pytest.mark.asyncio
async def test_conditional_executor_basic():
    """Test conditional executor routes based on value."""
    executor = ConditionalExecutor()
    data = NodeExecutionData(
        node_id="node1",
        node_type="conditional",
        config={},
        inputs={"value": True},
        state={},
    )
    context = ExecutionContext(
        user_id=1, tenant_id="test", workflow_id="wf1", execution_id="ex1"
    )

    result = await executor.execute(data, context)
    assert "true" in result or "false" in result
