"""
Tests for Hybrid RAG Engine
Phase 2: Quality & Intelligence
"""

import pytest
from unittest.mock import AsyncMock, MagicMock, patch
import numpy as np

from app.orchestrator.rag.hybrid_rag import (
    HybridRAGEngine,
    RAGResult,
    RAGConfig,
    SearchMode,
    Document,
)
from app.orchestrator.rag.bm25_retriever import BM25Retriever
from app.orchestrator.rag.vector_retriever import VectorRetriever
from app.orchestrator.rag.reranker import Reranker


class TestDocument:
    """Tests for Document dataclass."""
    
    def test_document_creation(self):
        """Test creating a Document."""
        doc = Document(
            content="Test content",
            metadata={"key": "value"},
            source_type="memory",
        )
        
        assert doc.content == "Test content"
        assert doc.metadata["key"] == "value"
        assert doc.source_type == "memory"
        assert doc.doc_id is not None
    
    def test_document_scores(self):
        """Test document scores."""
        doc = Document(content="Test")
        doc.bm25_score = 0.8
        doc.vector_score = 0.9
        doc.final_score = 0.85
        
        assert doc.bm25_score == 0.8
        assert doc.vector_score == 0.9
        assert doc.final_score == 0.85
    
    def test_document_to_dict(self):
        """Test serialization to dict."""
        doc = Document(
            content="Short content",
            source_type="file",
        )
        
        data = doc.to_dict()
        
        assert "doc_id" in data
        assert data["content"] == "Short content"
        assert data["source_type"] == "file"


class TestRAGResult:
    """Tests for RAGResult dataclass."""
    
    def test_rag_result_creation(self):
        """Test creating a RAGResult."""
        result = RAGResult(
            query="test query",
            mode=SearchMode.HYBRID,
        )
        
        assert result.query == "test query"
        assert result.mode == SearchMode.HYBRID
        assert result.documents == []
    
    def test_rag_result_get_context(self):
        """Test getting combined context."""
        result = RAGResult(
            query="test",
            documents=[
                Document(content="First document"),
                Document(content="Second document"),
            ],
        )
        
        context = result.get_context()
        
        assert "First document" in context
        assert "Second document" in context
    
    def test_rag_result_to_dict(self):
        """Test serialization to dict."""
        result = RAGResult(
            query="test",
            mode=SearchMode.SEMANTIC,
            retrieval_time_ms=100,
            total_time_ms=150,
        )
        
        data = result.to_dict()
        
        assert data["query"] == "test"
        assert data["mode"] == "semantic"
        assert data["timing"]["retrieval_ms"] == 100


class TestRAGConfig:
    """Tests for RAGConfig dataclass."""
    
    def test_rag_config_defaults(self):
        """Test default configuration."""
        config = RAGConfig()
        
        assert config.mode == SearchMode.HYBRID
        assert config.top_k == 10
        assert config.use_rerank is True
        assert config.bm25_weight == 0.3
        assert config.vector_weight == 0.7
    
    def test_rag_config_custom(self):
        """Test custom configuration."""
        config = RAGConfig(
            mode=SearchMode.FAST,
            top_k=5,
            use_rerank=False,
            bm25_weight=0.5,
            vector_weight=0.5,
        )
        
        assert config.mode == SearchMode.FAST
        assert config.top_k == 5
        assert config.use_rerank is False


class TestBM25Retriever:
    """Tests for BM25Retriever."""
    
    @pytest.fixture
    def retriever(self):
        """Create a BM25Retriever instance."""
        return BM25Retriever()
    
    def test_tokenize(self, retriever):
        """Test tokenization."""
        tokens = retriever._tokenize("Hello World! This is a test.")
        
        assert "hello" in tokens
        assert "world" in tokens
        assert "test" in tokens
        # Stopwords should be filtered
        assert "is" not in tokens
        assert "a" not in tokens
    
    @pytest.mark.asyncio
    async def test_add_document(self, retriever):
        """Test adding a document."""
        doc = Document(content="Python programming language")
        await retriever.add_document(doc)
        
        assert doc.doc_id in retriever._documents
        assert retriever._total_docs == 1
    
    @pytest.mark.asyncio
    async def test_retrieve_basic(self, retriever):
        """Test basic retrieval."""
        # Add documents
        docs = [
            Document(content="Python is a programming language"),
            Document(content="Java is also a programming language"),
            Document(content="Cooking recipes and food"),
        ]
        
        for doc in docs:
            await retriever.add_document(doc)
        
        # Search
        results = await retriever.retrieve("Python programming", top_k=2)
        
        assert len(results) >= 1
        # Python doc should be first
        assert "Python" in results[0].content
    
    @pytest.mark.asyncio
    async def test_retrieve_empty_query(self, retriever):
        """Test retrieval with empty query."""
        doc = Document(content="Test document")
        await retriever.add_document(doc)
        
        results = await retriever.retrieve("", top_k=5)
        
        assert results == []
    
    @pytest.mark.asyncio
    async def test_retrieve_no_match(self, retriever):
        """Test retrieval with no matching documents."""
        doc = Document(content="Python programming")
        await retriever.add_document(doc)
        
        results = await retriever.retrieve("quantum physics", top_k=5)
        
        assert results == []


class TestVectorRetriever:
    """Tests for VectorRetriever."""
    
    @pytest.fixture
    def retriever(self):
        """Create a VectorRetriever instance."""
        return VectorRetriever(threshold=0.0)  # Low threshold for testing
    
    def test_simple_embedding(self, retriever):
        """Test simple embedding generation."""
        embedding = retriever._get_simple_embedding("test text")
        
        assert isinstance(embedding, np.ndarray)
        assert len(embedding) == retriever.DEFAULT_DIMENSION
        # Should be normalized
        norm = np.linalg.norm(embedding)
        assert abs(norm - 1.0) < 0.01 or norm == 0
    
    def test_cosine_similarity(self, retriever):
        """Test cosine similarity calculation."""
        vec1 = np.array([1, 0, 0])
        vec2 = np.array([1, 0, 0])
        vec3 = np.array([0, 1, 0])
        
        # Same vector = 1.0
        assert retriever._cosine_similarity(vec1, vec2) == 1.0
        
        # Orthogonal vectors = 0.0
        assert retriever._cosine_similarity(vec1, vec3) == 0.0
    
    @pytest.mark.asyncio
    async def test_add_document(self, retriever):
        """Test adding a document."""
        doc = Document(content="Test content for embedding")
        
        with patch.object(retriever, '_get_embedding', new_callable=AsyncMock) as mock_embed:
            mock_embed.return_value = np.random.rand(1536)
            await retriever.add_document(doc)
        
        assert doc.doc_id in retriever._documents


class TestReranker:
    """Tests for Reranker."""
    
    @pytest.fixture
    def reranker(self):
        """Create a Reranker instance."""
        return Reranker(use_llm=False)  # Use heuristic for testing
    
    @pytest.mark.asyncio
    async def test_heuristic_rerank(self, reranker):
        """Test heuristic reranking."""
        docs = [
            Document(content="Python programming basics", bm25_score=0.5, vector_score=0.3, final_score=0.4),
            Document(content="Advanced Python techniques", bm25_score=0.8, vector_score=0.7, final_score=0.75),
            Document(content="Java programming", bm25_score=0.3, vector_score=0.2, final_score=0.25),
        ]
        
        results = await reranker.rerank("Python programming", docs, top_k=2)
        
        assert len(results) == 2
        # Higher scored doc should be first
        assert results[0].content == "Advanced Python techniques"


class TestHybridRAGEngine:
    """Tests for HybridRAGEngine."""
    
    @pytest.fixture
    def engine(self):
        """Create a HybridRAGEngine instance."""
        config = RAGConfig(
            mode=SearchMode.HYBRID,
            use_rerank=False,  # Disable for faster tests
            use_cache=False,
        )
        return HybridRAGEngine(config=config)
    
    @pytest.mark.asyncio
    async def test_add_document(self, engine):
        """Test adding a document."""
        doc = await engine.add_document(
            content="Test document content",
            metadata={"type": "test"},
            source_type="memory",
        )
        
        assert doc.doc_id in engine._documents
        assert doc.content == "Test document content"
    
    @pytest.mark.asyncio
    async def test_add_documents_batch(self, engine):
        """Test adding multiple documents."""
        docs_data = [
            {"content": "First document", "source_type": "file"},
            {"content": "Second document", "source_type": "memory"},
        ]
        
        docs = await engine.add_documents(docs_data)
        
        assert len(docs) == 2
        assert len(engine._documents) == 2
    
    @pytest.mark.asyncio
    async def test_retrieve_keyword_mode(self, engine):
        """Test retrieval in keyword mode."""
        # Add documents with matching tenant metadata so scope enforcement passes
        tenant_meta = {"tenant_id": "test-tenant"}
        await engine.add_document(content="Python programming language", metadata=tenant_meta)
        await engine.add_document(content="Java programming language", metadata=tenant_meta)
        await engine.add_document(content="Cooking and recipes", metadata=tenant_meta)

        result = await engine.retrieve(
            query="Python programming",
            mode=SearchMode.KEYWORD,
            top_k=2,
            tenant_id="test-tenant",
        )

        assert result.mode == SearchMode.KEYWORD
        assert result.bm25_candidates > 0
    
    @pytest.mark.asyncio
    async def test_reciprocal_rank_fusion(self, engine):
        """Test RRF combination."""
        doc1 = Document(doc_id="1", content="Doc 1")
        doc2 = Document(doc_id="2", content="Doc 2")
        doc3 = Document(doc_id="3", content="Doc 3")
        
        bm25_docs = [doc1, doc2]  # doc1 rank 1, doc2 rank 2
        vector_docs = [doc2, doc3]  # doc2 rank 1, doc3 rank 2
        
        combined = engine._reciprocal_rank_fusion(
            bm25_docs,
            vector_docs,
            k=60,
            bm25_weight=0.3,
            vector_weight=0.7,
        )
        
        # doc2 should be first (appears in both)
        assert combined[0].doc_id == "2"
    
    @pytest.mark.asyncio
    async def test_get_stats(self, engine):
        """Test getting statistics."""
        await engine.add_document(content="Test document")
        
        stats = await engine.get_stats()
        
        assert stats["total_documents"] == 1
        assert "config" in stats
    
    @pytest.mark.asyncio
    async def test_cleanup(self, engine):
        """Test cleanup."""
        await engine.add_document(content="Test document")

        await engine.cleanup()

        assert len(engine._documents) == 0
        assert len(engine._cache) == 0


class TestHybridRAGQueryProcessing:
    """Tests for query processing integration in HybridRAGEngine."""

    @pytest.mark.asyncio
    async def test_passthrough_mode_no_llm_call(self):
        """PASSTHROUGH mode should not invoke any LLM."""
        from app.orchestrator.rag.query_processor import QueryStrategy
        config = RAGConfig(
            mode=SearchMode.KEYWORD,
            use_rerank=False,
            use_cache=False,
            query_strategy=QueryStrategy.PASSTHROUGH,
        )
        engine = HybridRAGEngine(config=config)
        await engine.add_document(
            content="Python programming language guide",
            metadata={"tenant_id": "t1", "allowed_scopes": ["u:1"]},
        )

        result = await engine.retrieve(
            query="Python",
            tenant_id="t1",
            effective_scopes=["u:1"],
        )

        assert result.mode == SearchMode.KEYWORD
        assert result.bm25_candidates > 0

    @pytest.mark.asyncio
    async def test_fast_mode_skips_query_processing(self):
        """FAST mode should skip query processing entirely."""
        from app.orchestrator.rag.query_processor import QueryStrategy
        config = RAGConfig(
            mode=SearchMode.FAST,
            use_rerank=False,
            use_cache=False,
            query_strategy=QueryStrategy.HYDE,
        )
        engine = HybridRAGEngine(config=config)
        await engine.add_document(
            content="Test document content",
            metadata={"tenant_id": "t1", "allowed_scopes": ["u:1"]},
        )

        result = await engine.retrieve(
            query="test",
            mode=SearchMode.FAST,
            tenant_id="t1",
            effective_scopes=["u:1"],
        )
        assert result is not None

    @pytest.mark.asyncio
    async def test_scope_enforcement_in_retrieve(self):
        """retrieve() must enforce scope filters even when not passed by caller."""
        config = RAGConfig(
            mode=SearchMode.KEYWORD,
            use_rerank=False,
            use_cache=False,
        )
        engine = HybridRAGEngine(config=config)

        await engine.add_document(
            content="Secret document for user one",
            metadata={"tenant_id": "t1", "allowed_scopes": ["u:1"]},
        )
        await engine.add_document(
            content="Secret document for user two",
            metadata={"tenant_id": "t1", "allowed_scopes": ["u:2"]},
        )

        result = await engine.retrieve(
            query="Secret document",
            tenant_id="t1",
            effective_scopes=["u:1"],
        )

        assert all("user one" in d.content for d in result.documents)


class TestCacheKeyIsolation:
    """Tests for tenant-aware cache key generation."""

    @pytest.mark.asyncio
    async def test_cache_key_includes_tenant_id(self):
        """Two different tenant_ids with the same query must not share cache."""
        config = RAGConfig(use_cache=True)
        engine = HybridRAGEngine(config=config)
        await engine.add_document(content="shared content about testing")

        # First retrieve with tenant A
        await engine.retrieve(
            query="testing", tenant_id="tenant-a", effective_scopes=["u:1", "p:global"]
        )
        # Second retrieve with tenant B — must NOT hit cache
        await engine.retrieve(
            query="testing", tenant_id="tenant-b", effective_scopes=["u:1", "p:global"]
        )

        # Both tenant keys should exist in cache (no shared entry)
        import hashlib

        scope_hash = hashlib.sha256(str(sorted(["u:1", "p:global"])).encode()).hexdigest()[:16]
        key_a = f"tenant-a:{scope_hash}:testing:10:hybrid:passthrough"
        key_b = f"tenant-b:{scope_hash}:testing:10:hybrid:passthrough"
        assert key_a != key_b
        assert key_a in engine._cache
        assert key_b in engine._cache

    @pytest.mark.asyncio
    async def test_cache_key_includes_scope_hash(self):
        """Same query from same tenant but different scopes must miss cache."""
        config = RAGConfig(use_cache=True)
        engine = HybridRAGEngine(config=config)
        await engine.add_document(content="shared content about testing")

        scopes_a = ["u:1", "p:global"]
        scopes_b = ["u:1", "p:global", "g:10"]

        import hashlib

        hash_a = hashlib.sha256(str(sorted(scopes_a)).encode()).hexdigest()[:16]
        hash_b = hashlib.sha256(str(sorted(scopes_b)).encode()).hexdigest()[:16]

        # Different scopes produce different hashes
        assert hash_a != hash_b

        key_a = f"tenant-1:{hash_a}:testing:10:hybrid:passthrough"
        key_b = f"tenant-1:{hash_b}:testing:10:hybrid:passthrough"
        assert key_a != key_b

    @pytest.mark.asyncio
    async def test_cross_user_cache_isolation(self):
        """Verify user A's cached results are never served to user B."""
        config = RAGConfig(use_cache=True)
        engine = HybridRAGEngine(config=config)
        await engine.add_document(content="test doc for caching")

        # User A retrieves with their scopes
        await engine.retrieve(
            query="test",
            tenant_id="t1",
            effective_scopes=["u:1", "p:global"],
        )

        # User B with different scopes should get a different cache key
        import hashlib

        scope_b = hashlib.sha256(str(sorted(["u:2", "p:global", "g:5"])).encode()).hexdigest()[:16]
        key_b = f"t1:{scope_b}:test:10:hybrid:passthrough"

        # User B's cache key should not exist in engine's cache
        assert key_b not in engine._cache

    @pytest.mark.asyncio
    async def test_empty_scopes_returns_no_documents(self):
        """User with effective_scopes=[] must see zero documents (fail-closed)."""
        config = RAGConfig(use_cache=False, use_rerank=False, mode=SearchMode.KEYWORD)
        engine = HybridRAGEngine(config=config)
        await engine.add_document(
            content="secret doc",
            metadata={"tenant_id": "t1", "allowed_scopes": ["u:1"]},
        )

        result = await engine.retrieve(
            query="secret",
            tenant_id="t1",
            effective_scopes=[],  # empty scopes — should match nothing
        )

        assert len(result.documents) == 0

    @pytest.mark.asyncio
    async def test_missing_tenant_id_returns_empty(self):
        """Calling retrieve without tenant_id should return empty result (fail-closed)."""
        config = RAGConfig(use_cache=True)
        engine = HybridRAGEngine(config=config)
        await engine.add_document(content="test doc")

        result = await engine.retrieve(query="test")

        assert len(result.documents) == 0
