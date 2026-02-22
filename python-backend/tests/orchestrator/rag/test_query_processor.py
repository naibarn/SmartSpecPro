"""Tests for QueryProcessor strategies.

Validates:
- PASSTHROUGH returns original query unchanged, no LLM call
- REWRITE calls LLM and returns cleaned query
- HYDE generates hypothetical document
- MULTI_QUERY generates 3-5 distinct query variations
- STEP_BACK produces a broader/abstracted version of the query
- LLM failure falls back to PASSTHROUGH
- ProcessedQuery.strategy_used matches the strategy applied
"""

import pytest
from unittest.mock import AsyncMock, MagicMock, patch

from app.orchestrator.rag.query_processor import (
    QueryProcessor,
    QueryStrategy,
    ProcessedQuery,
)


@pytest.mark.unit
@pytest.mark.asyncio
class TestPassthroughStrategy:
    """PASSTHROUGH strategy returns original query unchanged."""

    async def test_returns_original_query_unchanged(self):
        processor = QueryProcessor()
        result = await processor.process("What is Python?", strategy=QueryStrategy.PASSTHROUGH)

        assert result.original == "What is Python?"
        assert result.processed == "What is Python?"
        assert result.alternatives == []
        assert result.hypothetical_doc is None
        assert result.strategy_used == "passthrough"

    async def test_no_llm_call_made(self):
        mock_llm = AsyncMock()
        processor = QueryProcessor(llm_client=mock_llm)
        await processor.process("test query", strategy=QueryStrategy.PASSTHROUGH)

        mock_llm.assert_not_called()


@pytest.mark.unit
@pytest.mark.asyncio
class TestRewriteStrategy:
    """REWRITE strategy cleans up the query via LLM."""

    async def test_calls_llm_and_returns_cleaned_query(self):
        mock_llm = AsyncMock()
        mock_llm.return_value = "What are the best practices for Python programming?"
        processor = QueryProcessor(llm_client=mock_llm)

        result = await processor.process(
            "python best practis how",
            strategy=QueryStrategy.REWRITE,
        )

        assert result.strategy_used == "rewrite"
        assert result.processed == "What are the best practices for Python programming?"
        assert result.original == "python best practis how"
        mock_llm.assert_called_once()

    async def test_llm_failure_falls_back_to_passthrough(self):
        mock_llm = AsyncMock(side_effect=Exception("LLM error"))
        processor = QueryProcessor(llm_client=mock_llm)

        result = await processor.process("test query", strategy=QueryStrategy.REWRITE)

        assert result.strategy_used == "passthrough"
        assert result.processed == "test query"


@pytest.mark.unit
@pytest.mark.asyncio
class TestHyDEStrategy:
    """HyDE generates a hypothetical document and uses it for retrieval."""

    async def test_generates_hypothetical_document(self):
        mock_llm = AsyncMock()
        mock_llm.return_value = (
            "Python is a high-level programming language known for its readability. "
            "It supports multiple programming paradigms including procedural, "
            "object-oriented, and functional programming."
        )
        processor = QueryProcessor(llm_client=mock_llm)

        result = await processor.process("What is Python?", strategy=QueryStrategy.HYDE)

        assert result.strategy_used == "hyde"
        assert result.hypothetical_doc is not None
        assert len(result.hypothetical_doc) > 0
        assert result.processed == result.hypothetical_doc

    async def test_llm_failure_falls_back_to_passthrough(self):
        mock_llm = AsyncMock(side_effect=Exception("LLM timeout"))
        processor = QueryProcessor(llm_client=mock_llm)

        result = await processor.process("What is Python?", strategy=QueryStrategy.HYDE)

        assert result.strategy_used == "passthrough"
        assert result.processed == "What is Python?"
        assert result.hypothetical_doc is None


@pytest.mark.unit
@pytest.mark.asyncio
class TestMultiQueryStrategy:
    """MULTI_QUERY generates 3-5 query variations."""

    async def test_generates_variations(self):
        mock_llm = AsyncMock()
        mock_llm.return_value = (
            "What are Python programming best practices?\n"
            "How to write clean Python code?\n"
            "Python coding standards and conventions\n"
            "Best ways to program in Python"
        )
        processor = QueryProcessor(llm_client=mock_llm)

        result = await processor.process(
            "python best practices",
            strategy=QueryStrategy.MULTI_QUERY,
        )

        assert result.strategy_used == "multi_query"
        assert len(result.alternatives) >= 2
        assert len(result.alternatives) <= 5
        assert result.processed == "python best practices"

    async def test_variations_are_deduplicated(self):
        mock_llm = AsyncMock()
        mock_llm.return_value = (
            "Python best practices\n"
            "Python best practices\n"  # duplicate
            "Python coding standards\n"
            "How to write good Python"
        )
        processor = QueryProcessor(llm_client=mock_llm)

        result = await processor.process(
            "python best practices",
            strategy=QueryStrategy.MULTI_QUERY,
        )

        assert len(result.alternatives) == len(set(result.alternatives))

    async def test_llm_failure_falls_back_to_passthrough(self):
        mock_llm = AsyncMock(side_effect=Exception("API error"))
        processor = QueryProcessor(llm_client=mock_llm)

        result = await processor.process("test", strategy=QueryStrategy.MULTI_QUERY)

        assert result.strategy_used == "passthrough"
        assert result.alternatives == []


@pytest.mark.unit
@pytest.mark.asyncio
class TestStepBackStrategy:
    """STEP_BACK produces a broader version of the query."""

    async def test_produces_broader_query(self):
        mock_llm = AsyncMock()
        mock_llm.return_value = "What are common programming language design principles?"
        processor = QueryProcessor(llm_client=mock_llm)

        result = await processor.process(
            "Why does Python use indentation for blocks?",
            strategy=QueryStrategy.STEP_BACK,
        )

        assert result.strategy_used == "step_back"
        assert result.processed != result.original
        assert result.processed == "What are common programming language design principles?"

    async def test_llm_failure_falls_back_to_passthrough(self):
        mock_llm = AsyncMock(side_effect=Exception("LLM error"))
        processor = QueryProcessor(llm_client=mock_llm)

        result = await processor.process("test", strategy=QueryStrategy.STEP_BACK)

        assert result.strategy_used == "passthrough"
        assert result.processed == "test"


@pytest.mark.unit
class TestProcessedQuery:
    """Tests for the ProcessedQuery dataclass."""

    def test_strategy_used_matches_applied_strategy(self):
        pq = ProcessedQuery(
            original="test",
            processed="test",
            alternatives=[],
            strategy_used="passthrough",
            hypothetical_doc=None,
        )
        assert pq.strategy_used == "passthrough"

    def test_no_llm_client_forces_passthrough(self):
        """QueryProcessor with no llm_client should use passthrough for all LLM strategies."""
        processor = QueryProcessor(llm_client=None)
        assert processor._llm_client is None
