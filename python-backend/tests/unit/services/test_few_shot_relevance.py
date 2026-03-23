"""Tests for few-shot relevance filtering in agency_few_shot.py."""

from __future__ import annotations

import hashlib

import pytest
from unittest.mock import AsyncMock, patch
import numpy as np

from app.services.agency_few_shot import select_relevant_examples, _example_embedding_cache

EMBED_SVC = "app.orchestrator.vector_store.embedding_service.EmbeddingService"


@pytest.fixture(autouse=True)
def clear_cache():
    """Clear the embedding cache before each test."""
    _example_embedding_cache.clear()
    yield
    _example_embedding_cache.clear()


def _make_example(text: str) -> dict:
    return {"user_message": text, "assistant_response": f"Response to {text}"}


def _make_embedding(seed: int, dim: int = 8) -> list[float]:
    """Create a deterministic unit-norm embedding from a seed."""
    rng = np.random.RandomState(seed)
    vec = rng.randn(dim).astype(float)
    vec = vec / np.linalg.norm(vec)
    return vec.tolist()


@pytest.mark.asyncio
async def test_few_examples_pass_through_unchanged():
    """<=3 examples should pass through unchanged without calling embedding service."""
    examples = [_make_example("Hello"), _make_example("World")]

    with patch(EMBED_SVC) as mock_cls:
        result = await select_relevant_examples(examples, "any task")

    assert result == examples
    assert len(result) == 2
    mock_cls.assert_not_called()


@pytest.mark.asyncio
async def test_exactly_three_examples_pass_through():
    """Exactly 3 examples should pass through without filtering."""
    examples = [_make_example(f"ex-{i}") for i in range(3)]

    with patch(EMBED_SVC) as mock_cls:
        result = await select_relevant_examples(examples, "task text")

    assert result == examples
    mock_cls.assert_not_called()


@pytest.mark.asyncio
async def test_more_than_three_filtered_to_top_three():
    """>3 examples should be filtered to top 3 by cosine similarity."""
    examples = [
        _make_example("Solve this math equation: 2x + 3 = 7"),
        _make_example("Write a creative story about a dragon"),
        _make_example("Write a Python function to sort a list"),
        _make_example("Design a logo for a bakery"),
        _make_example("Create a sales pitch for insurance"),
        _make_example("Recipe for chocolate cake"),
    ]
    task = "Write a Python function to sort a list"

    task_emb = _make_embedding(42)
    embeddings = {
        "Solve this math equation: 2x + 3 = 7": _make_embedding(1),
        "Write a creative story about a dragon": _make_embedding(2),
        "Write a Python function to sort a list": task_emb,  # Exact match
        "Design a logo for a bakery": _make_embedding(4),
        "Create a sales pitch for insurance": _make_embedding(5),
        "Recipe for chocolate cake": _make_embedding(6),
    }

    mock_service = AsyncMock()

    async def mock_embed(text: str) -> list[float]:
        if text in embeddings:
            return embeddings[text]
        return task_emb

    mock_service.embed = mock_embed

    with patch(EMBED_SVC, return_value=mock_service):
        result = await select_relevant_examples(examples, task, top_k=3)

    assert len(result) == 3
    result_texts = [ex["user_message"] for ex in result]
    assert "Write a Python function to sort a list" in result_texts
    # Least similar examples should be excluded
    assert "Recipe for chocolate cake" not in result_texts
    assert "Create a sales pitch for insurance" not in result_texts


@pytest.mark.asyncio
async def test_embedding_cache_prevents_redundant_calls():
    """Embedding cache should prevent re-embedding the same example text."""
    examples = [_make_example(f"example-{i}") for i in range(5)]

    call_count = {"embed": 0}

    async def counting_embed(text: str) -> list[float]:
        call_count["embed"] += 1
        return _make_embedding(hash(text) % 1000)

    mock_service = AsyncMock()
    mock_service.embed = counting_embed

    with patch(EMBED_SVC, return_value=mock_service):
        # First call: 5 examples + 1 task = 6 embed calls
        await select_relevant_examples(examples, "task one", top_k=3)
        first_count = call_count["embed"]
        assert first_count == 6  # 5 examples + 1 task

        # Verify example embeddings are cached (task embeddings are never cached)
        for i in range(5):
            key = hashlib.md5(f"example-{i}".encode()).hexdigest()
            assert key in _example_embedding_cache

        # Second call with SAME examples but different task:
        # Should only embed the new task (1 call), examples are cached
        await select_relevant_examples(examples, "task two", top_k=3)
        second_count = call_count["embed"] - first_count
        assert second_count == 1  # Only the new task text


@pytest.mark.asyncio
async def test_embedding_failure_falls_back_to_first_three():
    """If embedding service fails, fall back to returning first 3 examples."""
    examples = [_make_example(f"ex-{i}") for i in range(6)]

    mock_service = AsyncMock()
    mock_service.embed = AsyncMock(side_effect=RuntimeError("API error"))

    with patch(EMBED_SVC, return_value=mock_service):
        result = await select_relevant_examples(examples, "some task", top_k=3)

    assert len(result) == 3
    assert result == examples[:3]


@pytest.mark.asyncio
async def test_custom_top_k():
    """Custom top_k should return that many examples."""
    examples = [_make_example(f"ex-{i}") for i in range(10)]

    mock_service = AsyncMock()
    mock_service.embed = AsyncMock(return_value=_make_embedding(1))

    with patch(EMBED_SVC, return_value=mock_service):
        result = await select_relevant_examples(examples, "task", top_k=5)

    assert len(result) == 5
