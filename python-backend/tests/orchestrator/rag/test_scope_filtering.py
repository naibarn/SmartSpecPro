"""Tests for scope-aware filtering in BM25 and Vector retrievers.

Validates that:
- BM25 pre-filters candidates by allowed_scopes before scoring
- VectorRetriever applies scope filters (in-memory)
- HybridRAGEngine.retrieve() always injects tenant_id + scope filters
- No cross-tenant results even if scopes overlap
"""

import pytest
import numpy as np
from unittest.mock import AsyncMock, patch

from app.orchestrator.rag.bm25_retriever import BM25Retriever
from app.orchestrator.rag.vector_retriever import VectorRetriever
from app.orchestrator.rag.hybrid_rag import (
    HybridRAGEngine,
    RAGConfig,
    SearchMode,
    Document,
)


# --- BM25 Scope Filtering Tests ---


@pytest.mark.unit
@pytest.mark.asyncio
class TestBM25ScopeFiltering:
    """BM25 retriever must pre-filter candidates by allowed_scopes before scoring."""

    @pytest.fixture
    def retriever(self):
        return BM25Retriever()

    async def test_prefilters_by_allowed_scopes(self, retriever):
        """User with scopes {u:1, g:10} only gets docs with matching scopes."""
        doc_a = Document(
            content="Python machine learning algorithms",
            metadata={"tenant_id": "t1", "allowed_scopes": ["u:1"]},
        )
        doc_b = Document(
            content="Python deep learning neural networks",
            metadata={"tenant_id": "t1", "allowed_scopes": ["u:2"]},
        )
        doc_c = Document(
            content="Python data science pipelines",
            metadata={"tenant_id": "t1", "allowed_scopes": ["g:10"]},
        )
        await retriever.add_document(doc_a)
        await retriever.add_document(doc_b)
        await retriever.add_document(doc_c)

        results = await retriever.retrieve(
            "Python machine learning",
            top_k=10,
            filters={"tenant_id": "t1", "allowed_scopes": ["u:1", "g:10"]},
        )

        result_ids = {r.doc_id for r in results}
        assert doc_a.doc_id in result_ids
        assert doc_c.doc_id in result_ids
        assert doc_b.doc_id not in result_ids

    async def test_tenant_id_filter_always_applied(self, retriever):
        """tenant_id filter is a hard rule -- must always be applied."""
        doc_t1 = Document(
            content="Python programming language guide",
            metadata={"tenant_id": "t1", "allowed_scopes": ["u:1"]},
        )
        doc_t2 = Document(
            content="Python programming advanced tutorial",
            metadata={"tenant_id": "t2", "allowed_scopes": ["u:1"]},
        )
        await retriever.add_document(doc_t1)
        await retriever.add_document(doc_t2)

        results = await retriever.retrieve(
            "Python programming",
            top_k=10,
            filters={"tenant_id": "t1"},
        )

        result_ids = {r.doc_id for r in results}
        assert doc_t1.doc_id in result_ids
        assert doc_t2.doc_id not in result_ids

    async def test_no_cross_tenant_results_even_with_overlapping_scopes(self, retriever):
        """Even if scopes overlap across tenants, tenant_id isolation holds."""
        doc_a = Document(
            content="Shared knowledge base article",
            metadata={"tenant_id": "tenant-a", "allowed_scopes": ["g:10"]},
        )
        doc_b = Document(
            content="Shared knowledge base document",
            metadata={"tenant_id": "tenant-b", "allowed_scopes": ["g:10"]},
        )
        await retriever.add_document(doc_a)
        await retriever.add_document(doc_b)

        results = await retriever.retrieve(
            "knowledge base",
            top_k=10,
            filters={"tenant_id": "tenant-a", "allowed_scopes": ["g:10"]},
        )

        result_ids = {r.doc_id for r in results}
        assert doc_a.doc_id in result_ids
        assert doc_b.doc_id not in result_ids

    async def test_metadata_filter_doc_type(self, retriever):
        """Filter by doc_type returns only matching chunks."""
        doc_code = Document(
            content="Python function definition examples",
            metadata={"tenant_id": "t1", "allowed_scopes": ["u:1"], "doc_type": "code"},
        )
        doc_text = Document(
            content="Python documentation guide text",
            metadata={"tenant_id": "t1", "allowed_scopes": ["u:1"], "doc_type": "document"},
        )
        await retriever.add_document(doc_code)
        await retriever.add_document(doc_text)

        results = await retriever.retrieve(
            "Python",
            top_k=10,
            filters={"tenant_id": "t1", "allowed_scopes": ["u:1"], "doc_type": "code"},
        )

        result_ids = {r.doc_id for r in results}
        assert doc_code.doc_id in result_ids
        assert doc_text.doc_id not in result_ids

    async def test_no_filters_returns_all(self, retriever):
        """Without filters, all matching docs are returned."""
        doc1 = Document(content="Python machine learning", metadata={"tenant_id": "t1"})
        doc2 = Document(content="Python deep learning", metadata={"tenant_id": "t2"})
        await retriever.add_document(doc1)
        await retriever.add_document(doc2)

        results = await retriever.retrieve("Python", top_k=10)

        assert len(results) == 2


# --- Vector Retriever Scope Filtering Tests ---


@pytest.mark.unit
@pytest.mark.asyncio
class TestVectorRetrieverScopeFiltering:
    """VectorRetriever must apply scope filters in-memory mode."""

    @pytest.fixture
    def retriever(self):
        return VectorRetriever(threshold=0.0)

    async def test_in_memory_scope_filtering(self, retriever):
        """In-memory mode filters by allowed_scopes metadata."""
        doc_a = Document(
            content="Machine learning algorithms",
            metadata={"tenant_id": "t1", "allowed_scopes": ["u:1"]},
        )
        doc_b = Document(
            content="Machine learning frameworks",
            metadata={"tenant_id": "t1", "allowed_scopes": ["u:2"]},
        )

        with patch.object(retriever, "_get_embedding", new_callable=AsyncMock) as mock_emb:
            # Use simple embeddings that will match
            mock_emb.side_effect = lambda text: np.ones(1536) / np.sqrt(1536)
            await retriever.add_document(doc_a)
            await retriever.add_document(doc_b)

            results = await retriever.retrieve(
                "machine learning",
                top_k=10,
                filters={"tenant_id": "t1", "allowed_scopes": ["u:1"]},
            )

        result_ids = {r.doc_id for r in results}
        assert doc_a.doc_id in result_ids
        assert doc_b.doc_id not in result_ids

    async def test_tenant_filter_on_vector_retriever(self, retriever):
        """Tenant filter is enforced in vector retrieval."""
        doc_t1 = Document(
            content="Important document",
            metadata={"tenant_id": "t1", "allowed_scopes": ["u:1"]},
        )
        doc_t2 = Document(
            content="Important document copy",
            metadata={"tenant_id": "t2", "allowed_scopes": ["u:1"]},
        )

        with patch.object(retriever, "_get_embedding", new_callable=AsyncMock) as mock_emb:
            mock_emb.side_effect = lambda text: np.ones(1536) / np.sqrt(1536)
            await retriever.add_document(doc_t1)
            await retriever.add_document(doc_t2)

            results = await retriever.retrieve(
                "important",
                top_k=10,
                filters={"tenant_id": "t1"},
            )

        result_ids = {r.doc_id for r in results}
        assert doc_t1.doc_id in result_ids
        assert doc_t2.doc_id not in result_ids

    async def test_no_filters_returns_all(self, retriever):
        """Without filters, all docs above threshold returned."""
        doc1 = Document(content="Document one", metadata={"tenant_id": "t1"})
        doc2 = Document(content="Document two", metadata={"tenant_id": "t2"})

        with patch.object(retriever, "_get_embedding", new_callable=AsyncMock) as mock_emb:
            mock_emb.side_effect = lambda text: np.ones(1536) / np.sqrt(1536)
            await retriever.add_document(doc1)
            await retriever.add_document(doc2)

            results = await retriever.retrieve("document", top_k=10)

        assert len(results) == 2


# --- HybridRAGEngine Scope Injection Tests ---


@pytest.mark.unit
@pytest.mark.asyncio
class TestHybridRAGEngineScopeInjection:
    """HybridRAGEngine.retrieve() must always inject tenant_id + scope filters."""

    @pytest.fixture
    def engine(self):
        config = RAGConfig(
            mode=SearchMode.KEYWORD,
            use_rerank=False,
            use_cache=False,
        )
        return HybridRAGEngine(config=config)

    async def test_injects_tenant_and_scope_filters(self, engine):
        """retrieve() must enforce tenant_id and scope filters server-side."""
        await engine.add_document(
            content="Test document for scoping",
            metadata={"tenant_id": "t1", "allowed_scopes": ["u:1"]},
        )

        # Spy on the BM25 retriever
        original_retrieve = engine.bm25_retriever.retrieve
        calls = []

        async def spy_retrieve(query, top_k=10, filters=None):
            calls.append(filters)
            return await original_retrieve(query, top_k=top_k, filters=filters)

        engine.bm25_retriever.retrieve = spy_retrieve

        await engine.retrieve(
            query="Test",
            tenant_id="t1",
            effective_scopes=["u:1", "g:10"],
        )

        assert len(calls) == 1
        assert calls[0]["tenant_id"] == "t1"
        assert calls[0]["allowed_scopes"] == ["u:1", "g:10"]

    async def test_caller_cannot_bypass_scope_enforcement(self, engine):
        """Caller-provided filters cannot remove tenant/scope constraints."""
        await engine.add_document(
            content="Test document",
            metadata={"tenant_id": "t1", "allowed_scopes": ["u:1"]},
        )

        original_retrieve = engine.bm25_retriever.retrieve
        calls = []

        async def spy_retrieve(query, top_k=10, filters=None):
            calls.append(filters)
            return await original_retrieve(query, top_k=top_k, filters=filters)

        engine.bm25_retriever.retrieve = spy_retrieve

        # Caller provides tenant_id="evil" in filters but server enforces "t1"
        await engine.retrieve(
            query="Test",
            tenant_id="t1",
            effective_scopes=["u:1"],
            filters={"tenant_id": "evil", "some_extra": "value"},
        )

        assert len(calls) == 1
        # Server-side tenant_id OVERRIDES caller's "evil"
        assert calls[0]["tenant_id"] == "t1"
        assert calls[0]["allowed_scopes"] == ["u:1"]
        # Extra filters preserved
        assert calls[0]["some_extra"] == "value"
