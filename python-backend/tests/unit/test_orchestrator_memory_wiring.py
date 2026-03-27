"""Tests for agency orchestrator memory wiring."""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.services.agency_orchestrator import AgencyOrchestrator, ExecutionContext

pytestmark = [pytest.mark.unit, pytest.mark.agency]


def _make_orchestrator(node_type: str = "agent"):
    node = {
        "id": "node-1",
        "name": "Agent",
        "instructions": "Do the thing.",
        "model": "claude-sonnet-4-20250514",
        "model_settings": None,
        "is_entry_point": True,
        "node_type": node_type,
        "node_config": {},
    }
    orchestrator = AgencyOrchestrator(
        nodes=[node],
        edges=[],
        adapter=MagicMock(),
        db=AsyncMock(),
        agency_config=MagicMock(
            agency_id="agency-1",
            system_prompt="",
            user_id=7,
            conversation_id="conv-1",
            max_run_time_seconds=60,
            credit_multiplier=1.0,
            creator_fee_credits=0,
            platform_share_pct=20,
            creator_id=None,
        ),
    )
    return orchestrator, node


@pytest.mark.asyncio
async def test_semantic_memory_context_initializes_budget_manager_and_retrieves():
    orch, node = _make_orchestrator()
    ctx = ExecutionContext("User asks about prior work", "tok", "tenant-1", user_id=7)
    session = AsyncMock()
    budget = MagicMock(remaining=1200, completion_reserve_tokens=2048)
    budget.allocate = MagicMock(side_effect=lambda text, label: text)
    retrieval = MagicMock(l1_count=2, l2_count=1)
    session_cm = AsyncMock()
    session_cm.__aenter__.return_value = session
    session_cm.__aexit__.return_value = False

    embedding_service = MagicMock(name="EmbeddingService")
    ltm_service = MagicMock(name="LongTermMemoryService")
    chunk_service = MagicMock(name="AgencyChunkService")
    retriever = AsyncMock()
    retriever.retrieve = AsyncMock(return_value=retrieval)

    with patch("app.services.agency_context_budget.ContextBudgetManager", return_value=budget) as mock_budget, \
         patch("app.core.database.AsyncSessionLocal", return_value=session_cm), \
         patch("app.services.embedding_service.get_embedding_service", return_value=embedding_service) as mock_embedding_ctor, \
         patch("app.services.long_term_memory.LongTermMemoryService", return_value=ltm_service) as mock_ltm_ctor, \
         patch("app.services.agency_chunk_service.AgencyChunkService", return_value=chunk_service) as mock_chunk_ctor, \
         patch("app.services.agency_memory_retriever.AgencyMemoryRetriever", return_value=retriever) as mock_retriever_ctor, \
         patch("app.services.agency_memory_retriever.format_retrieval_for_context", return_value="<agent_context>memory</agent_context>") as mock_format:
        memory_context = await orch._build_semantic_memory_context(node, ctx, "User asks about prior work", "http://localhost:3000")

    assert ctx.budget_manager is budget
    mock_budget.assert_called_once_with(model_name="claude-sonnet-4-20250514")
    mock_embedding_ctor.assert_called_once()
    mock_ltm_ctor.assert_called_once_with(
        db_session=session,
        gateway_url="http://localhost:3000",
        user_token="tok",
        embedding_service=embedding_service,
    )
    mock_chunk_ctor.assert_called_once_with(session, embedding_service)
    mock_retriever_ctor.assert_called_once()
    retriever.retrieve.assert_awaited_once()
    assert retriever.retrieve.await_args.kwargs["max_tokens"] == 600
    mock_format.assert_called_once_with(retrieval)
    assert memory_context == {"long_term_memory": "<agent_context>memory</agent_context>"}


@pytest.mark.asyncio
async def test_store_chunked_output_persists_full_output():
    orch, node = _make_orchestrator()
    ctx = ExecutionContext("Input", "tok", "tenant-1", user_id=7)
    ctx.run_id = "run-1"
    chunk_service = AsyncMock()
    chunk_service.chunk_and_store = AsyncMock(return_value=4)
    session_cm = AsyncMock()
    session = AsyncMock()
    session_cm.__aenter__.return_value = session
    session_cm.__aexit__.return_value = False

    with patch("app.core.database.AsyncSessionLocal", return_value=session_cm), \
         patch("app.services.embedding_service.get_embedding_service", return_value=MagicMock()), \
         patch("app.services.agency_chunk_service.AgencyChunkService", return_value=chunk_service):
        await orch._store_chunked_output(node, ctx, "x" * 4000, executor="react")

    chunk_service.chunk_and_store.assert_awaited_once()
    kwargs = chunk_service.chunk_and_store.await_args.kwargs
    assert kwargs["output"] == "x" * 4000
    assert kwargs["metadata"]["executor"] == "react"
    assert kwargs["run_id"] == "run-1"
    assert kwargs["source_node_id"] == "node-1"


@pytest.mark.asyncio
async def test_execute_node_truncates_results_to_2000_chars():
    orch, node = _make_orchestrator()
    orch._execute_agent_node = AsyncMock(return_value="x" * 5000)
    ctx = ExecutionContext("Input", "tok", "tenant-1", user_id=7)

    result = await orch._execute_node(node, ctx)

    assert result == "x" * 5000
    assert len(ctx.results["node-1"]) == 2000
    assert ctx.results["node-1"] == ("x" * 2000)
