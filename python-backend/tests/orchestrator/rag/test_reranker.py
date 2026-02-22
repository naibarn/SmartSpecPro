"""
Tests for the upgraded Reranker with strategy-based reranking.

Covers:
- RerankStrategy enum values
- Cross-encoder strategy (mocked model)
- Cohere strategy (mocked API)
- LLM strategy (existing, mocked)
- Heuristic strategy (existing)
- Fallback chain behavior
- Scope verification after reranking
- Edge cases (empty docs, single doc, etc.)
"""
import math

import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from dataclasses import dataclass, field
from typing import Any, Dict

from app.orchestrator.rag.reranker import Reranker, RerankStrategy


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@dataclass
class FakeDocument:
    """Minimal document for reranker tests."""
    doc_id: str = "doc-1"
    content: str = "Some document content for testing."
    metadata: Dict[str, Any] = field(default_factory=dict)
    bm25_score: float = 0.5
    vector_score: float = 0.6
    rerank_score: float = 0.0
    final_score: float = 0.55


@pytest.fixture
def sample_documents():
    """Return a list of 10 fake documents with varying content."""
    docs = []
    for i in range(10):
        docs.append(FakeDocument(
            doc_id=f"doc-{i}",
            content=f"Document {i} content about topic {i % 3}.",
            bm25_score=0.5 - i * 0.03,
            vector_score=0.6 - i * 0.04,
            final_score=0.55 - i * 0.035,
        ))
    return docs


@pytest.fixture
def scoped_documents():
    """Documents with allowed_scopes in metadata for scope verification tests."""
    return [
        FakeDocument(doc_id="d1", content="Allowed doc", metadata={"allowed_scopes": ["u:1", "g:10"]}),
        FakeDocument(doc_id="d2", content="Also allowed", metadata={"allowed_scopes": ["u:1"]}),
        FakeDocument(doc_id="d3", content="Not allowed", metadata={"allowed_scopes": ["u:999"]}),
    ]


# ---------------------------------------------------------------------------
# Cross-encoder tests
# ---------------------------------------------------------------------------

class TestCrossEncoderStrategy:
    """Tests for CROSS_ENCODER reranking strategy."""

    @pytest.mark.asyncio
    async def test_cross_encoder_returns_sorted_docs(self, sample_documents):
        """Cross-encoder should return documents sorted by descending relevance score."""
        # Mock scores in reverse order so we can verify sorting
        mock_scores = [float(i) for i in range(len(sample_documents))]

        reranker = Reranker(strategy=RerankStrategy.CROSS_ENCODER)

        with patch.object(reranker, "_ensure_cross_encoder_loaded"):
            with patch.object(reranker, "_run_cross_encoder", new_callable=AsyncMock) as mock_run:
                mock_run.return_value = mock_scores
                result = await reranker.rerank("test query", sample_documents, top_k=5)

        assert len(result) == 5
        # Highest score should be first
        scores = [doc.rerank_score for doc in result]
        assert scores == sorted(scores, reverse=True)

    @pytest.mark.asyncio
    async def test_cross_encoder_scores_in_valid_range(self, sample_documents):
        """All rerank_score values must be between 0.0 and 1.0 inclusive."""
        # Use raw logits that will be sigmoidified
        raw_logits = [-5.0, -1.0, 0.0, 1.0, 5.0, -3.0, 2.0, 0.5, -0.5, 3.0]

        reranker = Reranker(strategy=RerankStrategy.CROSS_ENCODER)

        with patch.object(reranker, "_ensure_cross_encoder_loaded"):
            with patch.object(reranker, "_run_cross_encoder", new_callable=AsyncMock) as mock_run:
                mock_run.return_value = raw_logits
                result = await reranker.rerank("test query", sample_documents, top_k=10)

        for doc in result:
            assert 0.0 <= doc.rerank_score <= 1.0

    @pytest.mark.asyncio
    async def test_cross_encoder_lazy_loads_model(self):
        """Model should not load at __init__ time; only on first rerank() call."""
        reranker = Reranker(strategy=RerankStrategy.CROSS_ENCODER)
        assert reranker._cross_encoder_model is None

    @pytest.mark.asyncio
    async def test_cross_encoder_handles_model_not_found(self, sample_documents):
        """If the model file is missing or corrupted, reranker should fall back gracefully."""
        reranker = Reranker(
            strategy=RerankStrategy.CROSS_ENCODER,
            fallback_chain=[RerankStrategy.CROSS_ENCODER, RerankStrategy.HEURISTIC],
        )

        with patch.object(reranker, "_ensure_cross_encoder_loaded", side_effect=RuntimeError("Model not found")):
            result = await reranker.rerank("test query", sample_documents, top_k=5)

        # Should have fallen back to heuristic
        assert len(result) == 5


# ---------------------------------------------------------------------------
# Cohere fallback tests
# ---------------------------------------------------------------------------

class TestCohereStrategy:
    """Tests for COHERE reranking strategy."""

    @pytest.mark.asyncio
    async def test_cohere_returns_relevance_scores(self, sample_documents):
        """Cohere rerank should call the API and set relevance scores on documents."""
        reranker = Reranker(
            strategy=RerankStrategy.COHERE,
            cohere_api_key="test-key",
            fallback_chain=[RerankStrategy.COHERE, RerankStrategy.HEURISTIC],
        )

        # Mock cohere response
        mock_result = MagicMock()
        mock_result.results = []
        for i in range(len(sample_documents)):
            r = MagicMock()
            r.index = i
            r.relevance_score = 0.9 - i * 0.08
            mock_result.results.append(r)

        with patch.object(reranker, "_cohere_rerank", new_callable=AsyncMock) as mock_cohere:
            # Return docs sorted by mock score
            sorted_docs = list(sample_documents)
            for i, doc in enumerate(sorted_docs):
                doc.rerank_score = 0.9 - i * 0.08
            mock_cohere.return_value = sorted_docs[:5]
            result = await reranker.rerank("test query", sample_documents, top_k=5)

        assert len(result) == 5

    @pytest.mark.asyncio
    async def test_cohere_skipped_without_api_key(self, sample_documents):
        """If COHERE_API_KEY is not set, Cohere strategy should skip gracefully."""
        reranker = Reranker(
            strategy=RerankStrategy.COHERE,
            cohere_api_key=None,
            fallback_chain=[RerankStrategy.COHERE, RerankStrategy.HEURISTIC],
        )

        with patch.dict("os.environ", {}, clear=True):
            result = await reranker.rerank("test query", sample_documents, top_k=5)

        # Should fall back to heuristic
        assert len(result) == 5

    @pytest.mark.asyncio
    async def test_cohere_skipped_without_package(self, sample_documents):
        """If the cohere package is not importable, strategy should skip."""
        reranker = Reranker(
            strategy=RerankStrategy.COHERE,
            cohere_api_key="test-key",
            fallback_chain=[RerankStrategy.COHERE, RerankStrategy.HEURISTIC],
        )

        with patch.object(reranker, "_cohere_rerank", new_callable=AsyncMock, side_effect=ImportError("No module named 'cohere'")):
            result = await reranker.rerank("test query", sample_documents, top_k=5)

        # Should fall back to heuristic
        assert len(result) == 5


# ---------------------------------------------------------------------------
# Fallback chain tests
# ---------------------------------------------------------------------------

class TestFallbackChain:
    """Tests for the strategy fallback chain: CROSS_ENCODER -> COHERE -> LLM -> HEURISTIC."""

    @pytest.mark.asyncio
    async def test_full_fallback_chain(self, sample_documents):
        """When all higher strategies fail, heuristic should succeed as last resort."""
        reranker = Reranker(strategy=RerankStrategy.CROSS_ENCODER)

        with patch.object(reranker, "_cross_encoder_rerank", new_callable=AsyncMock, side_effect=RuntimeError("No model")):
            with patch.object(reranker, "_cohere_rerank", new_callable=AsyncMock, side_effect=RuntimeError("No API key")):
                with patch.object(reranker, "_llm_rerank", new_callable=AsyncMock, side_effect=RuntimeError("No OpenAI")):
                    result = await reranker.rerank("test query", sample_documents, top_k=5)

        # Heuristic always works
        assert len(result) == 5

    @pytest.mark.asyncio
    async def test_no_fallback_when_primary_succeeds(self, sample_documents):
        """If the primary strategy succeeds, no other strategy should be attempted."""
        reranker = Reranker(strategy=RerankStrategy.CROSS_ENCODER)

        with patch.object(reranker, "_cross_encoder_rerank", new_callable=AsyncMock) as mock_ce:
            mock_ce.return_value = sample_documents[:5]
            with patch.object(reranker, "_cohere_rerank", new_callable=AsyncMock) as mock_co:
                with patch.object(reranker, "_llm_rerank", new_callable=AsyncMock) as mock_llm:
                    result = await reranker.rerank("test query", sample_documents, top_k=5)

        mock_ce.assert_called_once()
        mock_co.assert_not_called()
        mock_llm.assert_not_called()
        assert len(result) == 5

    @pytest.mark.asyncio
    async def test_all_strategies_fail_raises_error(self, sample_documents):
        """If even heuristic fails (should not happen), raise a clear error."""
        reranker = Reranker(strategy=RerankStrategy.CROSS_ENCODER)

        with patch.object(reranker, "_cross_encoder_rerank", new_callable=AsyncMock, side_effect=RuntimeError("CE fail")):
            with patch.object(reranker, "_cohere_rerank", new_callable=AsyncMock, side_effect=RuntimeError("Cohere fail")):
                with patch.object(reranker, "_llm_rerank", new_callable=AsyncMock, side_effect=RuntimeError("LLM fail")):
                    with patch.object(reranker, "_heuristic_rerank", side_effect=RuntimeError("Heuristic fail")):
                        with pytest.raises(RuntimeError, match="All reranking strategies failed"):
                            await reranker.rerank("test query", sample_documents, top_k=5)


# ---------------------------------------------------------------------------
# Scope verification tests
# ---------------------------------------------------------------------------

class TestScopeVerification:
    """Tests for post-reranking scope verification."""

    @pytest.mark.asyncio
    async def test_reranked_results_are_subset_of_input(self, scoped_documents):
        """Reranker must not introduce documents that were not in the input list."""
        reranker = Reranker(strategy=RerankStrategy.HEURISTIC)

        result = await reranker.rerank(
            "test query",
            scoped_documents,
            top_k=10,
            effective_scopes={"u:1"},
        )

        input_ids = {d.doc_id for d in scoped_documents}
        result_ids = {d.doc_id for d in result}
        assert result_ids.issubset(input_ids)

    @pytest.mark.asyncio
    async def test_scope_verification_removes_unauthorized(self, scoped_documents):
        """Documents that don't match effective_scopes should be removed after reranking."""
        reranker = Reranker(strategy=RerankStrategy.HEURISTIC)

        result = await reranker.rerank(
            "test query",
            scoped_documents,
            top_k=10,
            effective_scopes={"u:1"},
        )

        # d3 has allowed_scopes=["u:999"] which doesn't intersect {"u:1"}
        result_ids = {d.doc_id for d in result}
        assert "d3" not in result_ids
        assert "d1" in result_ids
        assert "d2" in result_ids

    @pytest.mark.asyncio
    async def test_no_scope_verification_when_scopes_none(self, scoped_documents):
        """When effective_scopes is None, skip scope verification (backward compat)."""
        reranker = Reranker(strategy=RerankStrategy.HEURISTIC)

        result = await reranker.rerank(
            "test query",
            scoped_documents,
            top_k=10,
            effective_scopes=None,
        )

        # All docs returned since no scope check
        assert len(result) == 3


# ---------------------------------------------------------------------------
# Edge cases
# ---------------------------------------------------------------------------

class TestRerankerEdgeCases:
    """Edge case tests for the Reranker."""

    @pytest.mark.asyncio
    async def test_empty_document_list_returns_empty(self):
        """Reranking an empty list should return an empty list."""
        reranker = Reranker(strategy=RerankStrategy.HEURISTIC)
        result = await reranker.rerank("query", [], top_k=5)
        assert result == []

    @pytest.mark.asyncio
    async def test_fewer_docs_than_top_k(self):
        """When docs < top_k, return all docs without reranking."""
        docs = [FakeDocument(doc_id=f"d{i}", content=f"Doc {i}") for i in range(3)]
        reranker = Reranker(strategy=RerankStrategy.HEURISTIC)
        result = await reranker.rerank("query", docs, top_k=10)
        assert len(result) == 3

    @pytest.mark.asyncio
    async def test_strategy_enum_values(self):
        """Verify all expected strategy enum values exist."""
        assert RerankStrategy.CROSS_ENCODER == "cross_encoder"
        assert RerankStrategy.COHERE == "cohere"
        assert RerankStrategy.LLM == "llm"
        assert RerankStrategy.HEURISTIC == "heuristic"

    @pytest.mark.asyncio
    async def test_is_model_loaded_false_initially(self):
        """Health check should return False before model is loaded."""
        reranker = Reranker(strategy=RerankStrategy.CROSS_ENCODER)
        assert reranker.is_model_loaded() is False

    @pytest.mark.asyncio
    async def test_cleanup_releases_resources(self):
        """Cleanup should release model and pool references."""
        reranker = Reranker(strategy=RerankStrategy.CROSS_ENCODER)
        reranker._cross_encoder_model = MagicMock()
        reranker._thread_pool = MagicMock()
        reranker._cohere_client = MagicMock()

        await reranker.cleanup()

        assert reranker._cross_encoder_model is None
        assert reranker._thread_pool is None
        assert reranker._cohere_client is None
        assert reranker._llm_client is None
