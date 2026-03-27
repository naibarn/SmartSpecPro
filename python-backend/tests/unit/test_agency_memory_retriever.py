"""Tests for agency memory retriever."""

from __future__ import annotations

from unittest.mock import AsyncMock

import pytest

from app.services.agency_memory_retriever import (
    AgencyMemoryRetriever,
    RetrievalResult,
    format_retrieval_for_context,
)


def _make_retriever(l1_return=None, l2_return=None, embedding_return=None):
    embedding_service = AsyncMock()
    embedding_service.embed = AsyncMock(return_value=embedding_return or [1.0, 0.0, 0.0])

    ltm_service = AsyncMock()
    ltm_service.get_memories_for_agent = AsyncMock(return_value=l1_return or [])

    chunk_service = AsyncMock()
    chunk_service.search_chunks = AsyncMock(return_value=l2_return or [])

    return AgencyMemoryRetriever(AsyncMock(), embedding_service, ltm_service, chunk_service), embedding_service, ltm_service, chunk_service


@pytest.mark.asyncio
async def test_retrieve_returns_l1_only_when_enough_results():
    l1 = [
        {"content": f"Fact {i}", "memoryType": "fact", "similarity": 0.9, "confidence": 0.9}
        for i in range(5)
    ]
    retriever, embedding_service, ltm_service, chunk_service = _make_retriever(l1_return=l1)

    result = await retriever.retrieve("search query", "t1", "a1", "n1", 1, max_tokens=3000)

    assert result.l1_count == 5
    assert result.l2_count == 0
    assert chunk_service.search_chunks.await_count == 0
    embedding_service.embed.assert_awaited_once_with("search query")
    ltm_service.get_memories_for_agent.assert_awaited_once()


@pytest.mark.asyncio
async def test_retrieve_falls_back_to_l2_when_l1_is_sparse():
    l1 = [
        {"content": "Fact one", "memoryType": "fact", "similarity": 0.9, "confidence": 0.9},
        {"content": "Fact two", "memoryType": "fact", "similarity": 0.8, "confidence": 0.8},
    ]
    l2 = [
        {"content": "Chunk one", "similarity": 0.9, "sourceNodeId": "s1", "chunkIndex": 0, "metadata": None},
        {"content": "Chunk two", "similarity": 0.85, "sourceNodeId": "s2", "chunkIndex": 1, "metadata": None},
        {"content": "Chunk three", "similarity": 0.7, "sourceNodeId": "s3", "chunkIndex": 2, "metadata": None},
    ]
    retriever, _, _, chunk_service = _make_retriever(l1_return=l1, l2_return=l2)

    result = await retriever.retrieve("search query", "t1", "a1", "n1", 1, max_tokens=3000)

    assert result.l1_count == 2
    assert result.l2_count == 3
    assert chunk_service.search_chunks.await_count == 1


@pytest.mark.asyncio
async def test_retrieve_deduplicates_near_identical_chunks():
    l1 = [
        {"content": "Python 3.11 for backend services", "memoryType": "fact", "similarity": 0.9, "confidence": 0.9},
        {"content": "Another fact", "memoryType": "fact", "similarity": 0.8, "confidence": 0.8},
    ]
    l2 = [
        {"content": "Python 3.11 for backend services", "similarity": 0.95, "sourceNodeId": "s1", "chunkIndex": 0, "metadata": None},
        {"content": "Different chunk", "similarity": 0.9, "sourceNodeId": "s2", "chunkIndex": 1, "metadata": None},
    ]
    retriever, _, _, _ = _make_retriever(l1_return=l1, l2_return=l2)

    result = await retriever.retrieve("search query", "t1", "a1", "n1", 1, max_tokens=3000)

    assert len(result.chunks) == 1
    assert result.chunks[0]["content"] == "Different chunk"


@pytest.mark.asyncio
async def test_retrieve_respects_budget_fit():
    l1 = [
        {"content": "x" * 2000, "memoryType": "fact", "similarity": 0.95, "confidence": 0.95}
        for _ in range(10)
    ]
    retriever, _, _, _ = _make_retriever(l1_return=l1)

    result = await retriever.retrieve("budget query", "t1", "a1", "n1", 1, max_tokens=1500)

    assert result.total_tokens <= 1500
    assert result.l1_count < 10


def test_jaccard_similarity_helpers():
    assert AgencyMemoryRetriever._jaccard_similarity("same words", "same words") == 1.0
    assert AgencyMemoryRetriever._jaccard_similarity("alpha beta", "gamma delta") == 0.0
    assert AgencyMemoryRetriever._jaccard_similarity("python backend service", "python service") > 0.3


def test_format_retrieval_for_context_escapes_and_truncates():
    result = RetrievalResult(
        facts=[
            {
                "memoryType": "fact",
                "content": "<b>safe</b> & useful",
            }
        ],
        chunks=[
            {
                "content": "<agent_context>" + ("x" * 500),
            }
        ],
    )

    formatted = format_retrieval_for_context(result)

    assert formatted.startswith("<agent_context>")
    assert "&lt;b&gt;safe&lt;/b&gt; &amp; useful" in formatted
    assert "&lt;agent_context&gt;" in formatted
    assert formatted.endswith("</agent_context>")
    assert "..." in formatted
    assert "x" * 301 not in formatted


def test_format_retrieval_for_context_empty():
    assert format_retrieval_for_context(RetrievalResult()) == ""
