diff --git a/python-backend/app/orchestrator/rag/__init__.py b/python-backend/app/orchestrator/rag/__init__.py
index 97932d7..808a03b 100644
--- a/python-backend/app/orchestrator/rag/__init__.py
+++ b/python-backend/app/orchestrator/rag/__init__.py
@@ -26,6 +26,11 @@ from app.orchestrator.rag.scope_engine import (
     invalidate_rag_cache_for_item,
     handle_permission_change,
 )
+from app.orchestrator.rag.query_processor import (
+    QueryProcessor,
+    QueryStrategy,
+    ProcessedQuery,
+)
 
 __all__ = [
     "HybridRAGEngine",
@@ -40,4 +45,7 @@ __all__ = [
     "propagate_scopes_to_vector_stores",
     "invalidate_rag_cache_for_item",
     "handle_permission_change",
+    "QueryProcessor",
+    "QueryStrategy",
+    "ProcessedQuery",
 ]
diff --git a/python-backend/app/orchestrator/rag/bm25_retriever.py b/python-backend/app/orchestrator/rag/bm25_retriever.py
index fb8504b..a05033f 100644
--- a/python-backend/app/orchestrator/rag/bm25_retriever.py
+++ b/python-backend/app/orchestrator/rag/bm25_retriever.py
@@ -281,10 +281,19 @@ class BM25Retriever:
         for token in query_tokens:
             if token in self._inverted_index:
                 candidate_ids.update(self._inverted_index[token])
-        
+
         if not candidate_ids:
             return []
-        
+
+        # Apply filters BEFORE scoring for efficiency
+        if filters:
+            candidate_ids = {
+                doc_id for doc_id in candidate_ids
+                if self._apply_filters(doc_id, filters)
+            }
+            if not candidate_ids:
+                return []
+
         # Score candidates
         scored_docs = []
         for doc_id in candidate_ids:
@@ -302,6 +311,46 @@ class BM25Retriever:
         # Return top_k
         return [doc for score, doc in scored_docs[:top_k]]
     
+    def _apply_filters(self, doc_id: str, filters: Dict[str, Any]) -> bool:
+        """Check if a document passes all filter criteria.
+
+        Returns True if the document should be included in results.
+        """
+        doc = self._documents.get(doc_id)
+        if doc is None or doc.original_doc is None:
+            return False
+
+        metadata = getattr(doc.original_doc, "metadata", {}) or {}
+
+        # tenant_id: exact match
+        if "tenant_id" in filters:
+            if metadata.get("tenant_id") != filters["tenant_id"]:
+                return False
+
+        # allowed_scopes: intersection check
+        if "allowed_scopes" in filters:
+            doc_scopes = set(metadata.get("allowed_scopes") or [])
+            filter_scopes = set(filters["allowed_scopes"])
+            if not doc_scopes & filter_scopes:
+                return False
+
+        # doc_type: exact match or list membership
+        if "doc_type" in filters:
+            doc_type = metadata.get("doc_type")
+            filter_type = filters["doc_type"]
+            if isinstance(filter_type, list):
+                if doc_type not in filter_type:
+                    return False
+            elif doc_type != filter_type:
+                return False
+
+        # source: exact match
+        if "source" in filters:
+            if metadata.get("source") != filters["source"]:
+                return False
+
+        return True
+
     async def cleanup(self):
         """Cleanup resources."""
         self._documents.clear()
@@ -310,5 +359,5 @@ class BM25Retriever:
         self._total_docs = 0
         self._avg_doc_length = 0.0
         self._total_length = 0
-        
+
         logger.info("bm25_retriever_cleanup_complete")
diff --git a/python-backend/app/orchestrator/rag/hybrid_rag.py b/python-backend/app/orchestrator/rag/hybrid_rag.py
index 0e9dd7c..7fdae05 100644
--- a/python-backend/app/orchestrator/rag/hybrid_rag.py
+++ b/python-backend/app/orchestrator/rag/hybrid_rag.py
@@ -133,27 +133,35 @@ class RAGConfig:
     # Retrieval settings
     mode: SearchMode = SearchMode.HYBRID
     top_k: int = 10
-    
+
     # BM25 settings
     bm25_weight: float = 0.3
     bm25_k1: float = 1.5
     bm25_b: float = 0.75
-    
+
     # Vector settings
     vector_weight: float = 0.7
     vector_threshold: float = 0.5
-    
+
     # Rerank settings
     use_rerank: bool = True
     rerank_top_k: int = 5
-    
+
     # RRF settings
     rrf_k: int = 60  # Constant for RRF formula
-    
+
     # Cache settings
     use_cache: bool = True
     cache_ttl_seconds: int = 300
 
+    # Query processing
+    query_strategy: "QueryStrategy" = None  # type: ignore[assignment]
+
+    def __post_init__(self):
+        if self.query_strategy is None:
+            from app.orchestrator.rag.query_processor import QueryStrategy
+            self.query_strategy = QueryStrategy.PASSTHROUGH
+
 
 # ==================== HYBRID RAG ENGINE ====================
 
@@ -182,6 +190,7 @@ class HybridRAGEngine:
         self._bm25_retriever = bm25_retriever
         self._vector_retriever = vector_retriever
         self._reranker = reranker
+        self._query_processor = None
         
         # Document store
         self._documents: Dict[str, Document] = {}
@@ -223,7 +232,15 @@ class HybridRAGEngine:
             from app.orchestrator.rag.reranker import Reranker
             self._reranker = Reranker()
         return self._reranker
-    
+
+    @property
+    def query_processor(self) -> "QueryProcessor":
+        """Get or create query processor."""
+        if self._query_processor is None:
+            from app.orchestrator.rag.query_processor import QueryProcessor
+            self._query_processor = QueryProcessor()
+        return self._query_processor
+
     async def add_document(
         self,
         content: str,
@@ -322,38 +339,65 @@ class HybridRAGEngine:
             )
             return RAGResult(query=query, mode=mode)
 
-        # Check cache — include tenant_id and scope hash for isolation
+        # Enforce tenant and scope isolation — server-side, non-bypassable
+        enforced_filters = dict(filters or {})
+        if tenant_id:
+            enforced_filters["tenant_id"] = tenant_id
+        if effective_scopes:
+            enforced_filters["allowed_scopes"] = effective_scopes
+
+        # Check cache — include tenant_id, scope hash, and query strategy
         scope_hash = hashlib.sha256(str(sorted(effective_scopes or [])).encode()).hexdigest()[:16]
-        cache_key = f"{tenant_id}:{scope_hash}:{query}:{top_k}:{mode.value}"
+        strategy_val = getattr(self.config.query_strategy, "value", "passthrough")
+        cache_key = f"{tenant_id}:{scope_hash}:{query}:{top_k}:{mode.value}:{strategy_val}"
         if self.config.use_cache and cache_key in self._cache:
             cached_result, cached_time = self._cache[cache_key]
             if (datetime.utcnow() - cached_time).seconds < self.config.cache_ttl_seconds:
                 logger.debug("cache_hit", query=query[:50])
                 return cached_result
-        
+
         start_time = datetime.utcnow()
         result = RAGResult(query=query, mode=mode)
-        
+
         try:
+            # Step 0: Query processing
+            from app.orchestrator.rag.query_processor import ProcessedQuery, QueryStrategy as QS
+
+            if mode == SearchMode.FAST:
+                processed = ProcessedQuery(
+                    original=query,
+                    processed=query,
+                    alternatives=[],
+                    strategy_used="passthrough",
+                    hypothetical_doc=None,
+                )
+            else:
+                processed = await self.query_processor.process(
+                    query=query,
+                    strategy=self.config.query_strategy,
+                )
+
+            retrieval_query = processed.processed
+
             # Step 1: Retrieve candidates
             retrieval_start = datetime.utcnow()
-            
+
             bm25_docs = []
             vector_docs = []
-            
+
             if mode in [SearchMode.HYBRID, SearchMode.KEYWORD, SearchMode.FAST]:
                 bm25_docs = await self.bm25_retriever.retrieve(
-                    query=query,
-                    top_k=top_k * 2,  # Get more candidates for fusion
-                    filters=filters,
+                    query=query,  # BM25 always uses original query (keyword matching)
+                    top_k=top_k * 2,
+                    filters=enforced_filters,
                 )
                 result.bm25_candidates = len(bm25_docs)
-            
+
             if mode in [SearchMode.HYBRID, SearchMode.SEMANTIC, SearchMode.FAST]:
                 vector_docs = await self.vector_retriever.retrieve(
-                    query=query,
+                    query=retrieval_query,  # Vector uses processed query (may be HyDE doc)
                     top_k=top_k * 2,
-                    filters=filters,
+                    filters=enforced_filters,
                 )
                 result.vector_candidates = len(vector_docs)
             
diff --git a/python-backend/app/orchestrator/rag/query_processor.py b/python-backend/app/orchestrator/rag/query_processor.py
new file mode 100644
index 0000000..ff3859f
--- /dev/null
+++ b/python-backend/app/orchestrator/rag/query_processor.py
@@ -0,0 +1,162 @@
+"""Query processing strategies for RAG retrieval.
+
+Provides pre-retrieval query transformation to improve search quality.
+All strategies are opt-in; default PASSTHROUGH has zero overhead.
+"""
+
+from __future__ import annotations
+
+from dataclasses import dataclass, field
+from enum import Enum
+from typing import Any, Callable
+
+import structlog
+
+logger = structlog.get_logger()
+
+
+class QueryStrategy(str, Enum):
+    PASSTHROUGH = "passthrough"
+    REWRITE = "rewrite"
+    HYDE = "hyde"
+    MULTI_QUERY = "multi_query"
+    STEP_BACK = "step_back"
+
+
+@dataclass
+class ProcessedQuery:
+    original: str
+    processed: str
+    alternatives: list[str] = field(default_factory=list)
+    strategy_used: str = "passthrough"
+    hypothetical_doc: str | None = None
+
+
+class QueryProcessor:
+    """Processes queries before retrieval to improve search quality.
+
+    Each strategy transforms the user query into a form that produces
+    better retrieval results. Default is PASSTHROUGH (no transformation).
+    """
+
+    def __init__(
+        self,
+        llm_client: Callable[..., Any] | None = None,
+        model: str = "gpt-4.1-nano",
+    ):
+        self._llm_client = llm_client
+        self._model = model
+
+    async def process(
+        self,
+        query: str,
+        strategy: QueryStrategy = QueryStrategy.PASSTHROUGH,
+    ) -> ProcessedQuery:
+        """Process a query using the specified strategy."""
+        if strategy == QueryStrategy.PASSTHROUGH:
+            return self._passthrough(query)
+
+        # LLM-dependent strategies require a client
+        if self._llm_client is None:
+            logger.warning(
+                "query_processor_no_llm_client",
+                strategy=strategy.value,
+                msg="No LLM client; falling back to passthrough",
+            )
+            return self._passthrough(query)
+
+        dispatch = {
+            QueryStrategy.REWRITE: self._rewrite,
+            QueryStrategy.HYDE: self._hyde,
+            QueryStrategy.MULTI_QUERY: self._multi_query,
+            QueryStrategy.STEP_BACK: self._step_back,
+        }
+        handler = dispatch.get(strategy)
+        if handler is None:
+            return self._passthrough(query)
+
+        try:
+            return await handler(query)
+        except Exception as exc:
+            logger.warning(
+                "query_processor_fallback",
+                strategy=strategy.value,
+                error=str(exc),
+            )
+            return self._passthrough(query)
+
+    def _passthrough(self, query: str) -> ProcessedQuery:
+        return ProcessedQuery(
+            original=query,
+            processed=query,
+            alternatives=[],
+            strategy_used="passthrough",
+            hypothetical_doc=None,
+        )
+
+    async def _rewrite(self, query: str) -> ProcessedQuery:
+        prompt = (
+            "Rewrite this search query for better information retrieval. "
+            "Return ONLY the rewritten query, nothing else.\n\n"
+            f"Query: {query}"
+        )
+        result = await self._llm_client(prompt)
+        cleaned = result.strip()
+        return ProcessedQuery(
+            original=query,
+            processed=cleaned,
+            strategy_used="rewrite",
+        )
+
+    async def _hyde(self, query: str) -> ProcessedQuery:
+        prompt = (
+            "Write a short paragraph (3-5 sentences) that would answer this question. "
+            "Write as if you are an authoritative source.\n\n"
+            f"Question: {query}"
+        )
+        hypothetical = await self._llm_client(prompt)
+        hypothetical = hypothetical.strip()
+        return ProcessedQuery(
+            original=query,
+            processed=hypothetical,
+            strategy_used="hyde",
+            hypothetical_doc=hypothetical,
+        )
+
+    async def _multi_query(self, query: str) -> ProcessedQuery:
+        prompt = (
+            "Generate 3-5 alternative search queries for the following query. "
+            "Return each query on a new line, nothing else.\n\n"
+            f"Query: {query}"
+        )
+        result = await self._llm_client(prompt)
+        lines = [line.strip() for line in result.strip().split("\n") if line.strip()]
+        # Deduplicate while preserving order
+        seen: set[str] = set()
+        unique: list[str] = []
+        for line in lines:
+            if line not in seen:
+                seen.add(line)
+                unique.append(line)
+        # Cap at 5
+        alternatives = unique[:5]
+        return ProcessedQuery(
+            original=query,
+            processed=query,
+            alternatives=alternatives,
+            strategy_used="multi_query",
+        )
+
+    async def _step_back(self, query: str) -> ProcessedQuery:
+        prompt = (
+            "Given this specific question, generate a more general question "
+            "that would help find the answer. Return ONLY the broader question.\n\n"
+            f"Question: {query}"
+        )
+        result = await self._llm_client(prompt)
+        broader = result.strip()
+        return ProcessedQuery(
+            original=query,
+            processed=broader,
+            strategy_used="step_back",
+        )
diff --git a/python-backend/app/orchestrator/rag/vector_retriever.py b/python-backend/app/orchestrator/rag/vector_retriever.py
index d35964e..a440f17 100644
--- a/python-backend/app/orchestrator/rag/vector_retriever.py
+++ b/python-backend/app/orchestrator/rag/vector_retriever.py
@@ -228,13 +228,17 @@ class VectorRetriever:
         
         # Calculate similarities
         similarities: List[Tuple[float, Any]] = []
-        
+
         for doc_id, vector_doc in self._documents.items():
+            # Apply filters before scoring
+            if filters and not self._apply_filters(vector_doc, filters):
+                continue
+
             similarity = self._cosine_similarity(
                 query_embedding,
                 vector_doc.embedding,
             )
-            
+
             if similarity >= self.threshold:
                 # Update score on original document
                 vector_doc.original_doc.vector_score = similarity
@@ -246,10 +250,36 @@ class VectorRetriever:
         # Return top_k
         return [doc for score, doc in similarities[:top_k]]
     
+    @staticmethod
+    def _apply_filters(vector_doc: VectorDocument, filters: Dict[str, Any]) -> bool:
+        """Check if a vector document passes filter criteria."""
+        metadata = getattr(vector_doc.original_doc, "metadata", {}) or {}
+
+        if "tenant_id" in filters:
+            if metadata.get("tenant_id") != filters["tenant_id"]:
+                return False
+
+        if "allowed_scopes" in filters:
+            doc_scopes = set(metadata.get("allowed_scopes") or [])
+            filter_scopes = set(filters["allowed_scopes"])
+            if not doc_scopes & filter_scopes:
+                return False
+
+        if "doc_type" in filters:
+            doc_type = metadata.get("doc_type")
+            filter_type = filters["doc_type"]
+            if isinstance(filter_type, list):
+                if doc_type not in filter_type:
+                    return False
+            elif doc_type != filter_type:
+                return False
+
+        return True
+
     async def cleanup(self):
         """Cleanup resources."""
         self._documents.clear()
         self._embedding_cache.clear()
         self._embedding_client = None
-        
+
         logger.info("vector_retriever_cleanup_complete")
diff --git a/python-backend/tests/orchestrator/rag/test_hybrid_rag.py b/python-backend/tests/orchestrator/rag/test_hybrid_rag.py
index 55441eb..ceb41c3 100644
--- a/python-backend/tests/orchestrator/rag/test_hybrid_rag.py
+++ b/python-backend/tests/orchestrator/rag/test_hybrid_rag.py
@@ -309,18 +309,19 @@ class TestHybridRAGEngine:
     @pytest.mark.asyncio
     async def test_retrieve_keyword_mode(self, engine):
         """Test retrieval in keyword mode."""
-        # Add documents
-        await engine.add_document(content="Python programming language")
-        await engine.add_document(content="Java programming language")
-        await engine.add_document(content="Cooking and recipes")
-        
+        # Add documents with matching tenant metadata so scope enforcement passes
+        tenant_meta = {"tenant_id": "test-tenant"}
+        await engine.add_document(content="Python programming language", metadata=tenant_meta)
+        await engine.add_document(content="Java programming language", metadata=tenant_meta)
+        await engine.add_document(content="Cooking and recipes", metadata=tenant_meta)
+
         result = await engine.retrieve(
             query="Python programming",
             mode=SearchMode.KEYWORD,
             top_k=2,
             tenant_id="test-tenant",
         )
-        
+
         assert result.mode == SearchMode.KEYWORD
         assert result.bm25_candidates > 0
     
@@ -366,6 +367,79 @@ class TestHybridRAGEngine:
         assert len(engine._cache) == 0
 
 
+class TestHybridRAGQueryProcessing:
+    """Tests for query processing integration in HybridRAGEngine."""
+
+    @pytest.mark.asyncio
+    async def test_passthrough_mode_no_llm_call(self):
+        """PASSTHROUGH mode should not invoke any LLM."""
+        from app.orchestrator.rag.query_processor import QueryStrategy
+        config = RAGConfig(
+            mode=SearchMode.KEYWORD,
+            use_rerank=False,
+            use_cache=False,
+            query_strategy=QueryStrategy.PASSTHROUGH,
+        )
+        engine = HybridRAGEngine(config=config)
+        await engine.add_document(content="Python programming language guide")
+
+        result = await engine.retrieve(
+            query="Python",
+            tenant_id="t1",
+            effective_scopes=["u:1"],
+        )
+
+        assert result.mode == SearchMode.KEYWORD
+
+    @pytest.mark.asyncio
+    async def test_fast_mode_skips_query_processing(self):
+        """FAST mode should skip query processing entirely."""
+        from app.orchestrator.rag.query_processor import QueryStrategy
+        config = RAGConfig(
+            mode=SearchMode.FAST,
+            use_rerank=False,
+            use_cache=False,
+            query_strategy=QueryStrategy.HYDE,
+        )
+        engine = HybridRAGEngine(config=config)
+        await engine.add_document(content="Test document content")
+
+        result = await engine.retrieve(
+            query="test",
+            mode=SearchMode.FAST,
+            tenant_id="t1",
+            effective_scopes=["u:1"],
+        )
+        assert result is not None
+
+    @pytest.mark.asyncio
+    async def test_scope_enforcement_in_retrieve(self):
+        """retrieve() must enforce scope filters even when not passed by caller."""
+        config = RAGConfig(
+            mode=SearchMode.KEYWORD,
+            use_rerank=False,
+            use_cache=False,
+        )
+        engine = HybridRAGEngine(config=config)
+
+        await engine.add_document(
+            content="Secret document for user one",
+            metadata={"tenant_id": "t1", "allowed_scopes": ["u:1"]},
+        )
+        await engine.add_document(
+            content="Secret document for user two",
+            metadata={"tenant_id": "t1", "allowed_scopes": ["u:2"]},
+        )
+
+        result = await engine.retrieve(
+            query="Secret document",
+            tenant_id="t1",
+            effective_scopes=["u:1"],
+        )
+
+        assert all("user one" in d.content for d in result.documents)
+
+
 class TestCacheKeyIsolation:
     """Tests for tenant-aware cache key generation."""
 
@@ -389,8 +463,8 @@ class TestCacheKeyIsolation:
         import hashlib
 
         scope_hash = hashlib.sha256(str(sorted(["u:1", "p:global"])).encode()).hexdigest()[:16]
-        key_a = f"tenant-a:{scope_hash}:testing:10:hybrid"
-        key_b = f"tenant-b:{scope_hash}:testing:10:hybrid"
+        key_a = f"tenant-a:{scope_hash}:testing:10:hybrid:passthrough"
+        key_b = f"tenant-b:{scope_hash}:testing:10:hybrid:passthrough"
         assert key_a != key_b
         assert key_a in engine._cache
         assert key_b in engine._cache
@@ -413,8 +487,8 @@ class TestCacheKeyIsolation:
         # Different scopes produce different hashes
         assert hash_a != hash_b
 
-        key_a = f"tenant-1:{hash_a}:testing:10:hybrid"
-        key_b = f"tenant-1:{hash_b}:testing:10:hybrid"
+        key_a = f"tenant-1:{hash_a}:testing:10:hybrid:passthrough"
+        key_b = f"tenant-1:{hash_b}:testing:10:hybrid:passthrough"
         assert key_a != key_b
 
     @pytest.mark.asyncio
@@ -435,7 +509,7 @@ class TestCacheKeyIsolation:
         import hashlib
 
         scope_b = hashlib.sha256(str(sorted(["u:2", "p:global", "g:5"])).encode()).hexdigest()[:16]
-        key_b = f"t1:{scope_b}:test:10:hybrid"
+        key_b = f"t1:{scope_b}:test:10:hybrid:passthrough"
 
         # User B's cache key should not exist in engine's cache
         assert key_b not in engine._cache
diff --git a/python-backend/tests/orchestrator/rag/test_query_processor.py b/python-backend/tests/orchestrator/rag/test_query_processor.py
new file mode 100644
index 0000000..bd9686b
--- /dev/null
+++ b/python-backend/tests/orchestrator/rag/test_query_processor.py
@@ -0,0 +1,206 @@
+"""Tests for QueryProcessor strategies.
+
+Validates:
+- PASSTHROUGH returns original query unchanged, no LLM call
+- REWRITE calls LLM and returns cleaned query
+- HYDE generates hypothetical document
+- MULTI_QUERY generates 3-5 distinct query variations
+- STEP_BACK produces a broader/abstracted version of the query
+- LLM failure falls back to PASSTHROUGH
+- ProcessedQuery.strategy_used matches the strategy applied
+"""
+
+import pytest
+from unittest.mock import AsyncMock, MagicMock, patch
+
+from app.orchestrator.rag.query_processor import (
+    QueryProcessor,
+    QueryStrategy,
+    ProcessedQuery,
+)
+
+
+@pytest.mark.unit
+@pytest.mark.asyncio
+class TestPassthroughStrategy:
+    """PASSTHROUGH strategy returns original query unchanged."""
+
+    async def test_returns_original_query_unchanged(self):
+        processor = QueryProcessor()
+        result = await processor.process("What is Python?", strategy=QueryStrategy.PASSTHROUGH)
+
+        assert result.original == "What is Python?"
+        assert result.processed == "What is Python?"
+        assert result.alternatives == []
+        assert result.hypothetical_doc is None
+        assert result.strategy_used == "passthrough"
+
+    async def test_no_llm_call_made(self):
+        mock_llm = AsyncMock()
+        processor = QueryProcessor(llm_client=mock_llm)
+        await processor.process("test query", strategy=QueryStrategy.PASSTHROUGH)
+
+        mock_llm.assert_not_called()
+
+
+@pytest.mark.unit
+@pytest.mark.asyncio
+class TestRewriteStrategy:
+    """REWRITE strategy cleans up the query via LLM."""
+
+    async def test_calls_llm_and_returns_cleaned_query(self):
+        mock_llm = AsyncMock()
+        mock_llm.return_value = "What are the best practices for Python programming?"
+        processor = QueryProcessor(llm_client=mock_llm)
+
+        result = await processor.process(
+            "python best practis how",
+            strategy=QueryStrategy.REWRITE,
+        )
+
+        assert result.strategy_used == "rewrite"
+        assert result.processed == "What are the best practices for Python programming?"
+        assert result.original == "python best practis how"
+        mock_llm.assert_called_once()
+
+    async def test_llm_failure_falls_back_to_passthrough(self):
+        mock_llm = AsyncMock(side_effect=Exception("LLM error"))
+        processor = QueryProcessor(llm_client=mock_llm)
+
+        result = await processor.process("test query", strategy=QueryStrategy.REWRITE)
+
+        assert result.strategy_used == "passthrough"
+        assert result.processed == "test query"
+
+
+@pytest.mark.unit
+@pytest.mark.asyncio
+class TestHyDEStrategy:
+    """HyDE generates a hypothetical document and uses it for retrieval."""
+
+    async def test_generates_hypothetical_document(self):
+        mock_llm = AsyncMock()
+        mock_llm.return_value = (
+            "Python is a high-level programming language known for its readability. "
+            "It supports multiple programming paradigms including procedural, "
+            "object-oriented, and functional programming."
+        )
+        processor = QueryProcessor(llm_client=mock_llm)
+
+        result = await processor.process("What is Python?", strategy=QueryStrategy.HYDE)
+
+        assert result.strategy_used == "hyde"
+        assert result.hypothetical_doc is not None
+        assert len(result.hypothetical_doc) > 0
+        assert result.processed == result.hypothetical_doc
+
+    async def test_llm_failure_falls_back_to_passthrough(self):
+        mock_llm = AsyncMock(side_effect=Exception("LLM timeout"))
+        processor = QueryProcessor(llm_client=mock_llm)
+
+        result = await processor.process("What is Python?", strategy=QueryStrategy.HYDE)
+
+        assert result.strategy_used == "passthrough"
+        assert result.processed == "What is Python?"
+        assert result.hypothetical_doc is None
+
+
+@pytest.mark.unit
+@pytest.mark.asyncio
+class TestMultiQueryStrategy:
+    """MULTI_QUERY generates 3-5 query variations."""
+
+    async def test_generates_variations(self):
+        mock_llm = AsyncMock()
+        mock_llm.return_value = (
+            "What are Python programming best practices?\n"
+            "How to write clean Python code?\n"
+            "Python coding standards and conventions\n"
+            "Best ways to program in Python"
+        )
+        processor = QueryProcessor(llm_client=mock_llm)
+
+        result = await processor.process(
+            "python best practices",
+            strategy=QueryStrategy.MULTI_QUERY,
+        )
+
+        assert result.strategy_used == "multi_query"
+        assert len(result.alternatives) >= 2
+        assert len(result.alternatives) <= 5
+        assert result.processed == "python best practices"
+
+    async def test_variations_are_deduplicated(self):
+        mock_llm = AsyncMock()
+        mock_llm.return_value = (
+            "Python best practices\n"
+            "Python best practices\n"  # duplicate
+            "Python coding standards\n"
+            "How to write good Python"
+        )
+        processor = QueryProcessor(llm_client=mock_llm)
+
+        result = await processor.process(
+            "python best practices",
+            strategy=QueryStrategy.MULTI_QUERY,
+        )
+
+        assert len(result.alternatives) == len(set(result.alternatives))
+
+    async def test_llm_failure_falls_back_to_passthrough(self):
+        mock_llm = AsyncMock(side_effect=Exception("API error"))
+        processor = QueryProcessor(llm_client=mock_llm)
+
+        result = await processor.process("test", strategy=QueryStrategy.MULTI_QUERY)
+
+        assert result.strategy_used == "passthrough"
+        assert result.alternatives == []
+
+
+@pytest.mark.unit
+@pytest.mark.asyncio
+class TestStepBackStrategy:
+    """STEP_BACK produces a broader version of the query."""
+
+    async def test_produces_broader_query(self):
+        mock_llm = AsyncMock()
+        mock_llm.return_value = "What are common programming language design principles?"
+        processor = QueryProcessor(llm_client=mock_llm)
+
+        result = await processor.process(
+            "Why does Python use indentation for blocks?",
+            strategy=QueryStrategy.STEP_BACK,
+        )
+
+        assert result.strategy_used == "step_back"
+        assert result.processed != result.original
+        assert result.processed == "What are common programming language design principles?"
+
+    async def test_llm_failure_falls_back_to_passthrough(self):
+        mock_llm = AsyncMock(side_effect=Exception("LLM error"))
+        processor = QueryProcessor(llm_client=mock_llm)
+
+        result = await processor.process("test", strategy=QueryStrategy.STEP_BACK)
+
+        assert result.strategy_used == "passthrough"
+        assert result.processed == "test"
+
+
+@pytest.mark.unit
+class TestProcessedQuery:
+    """Tests for the ProcessedQuery dataclass."""
+
+    def test_strategy_used_matches_applied_strategy(self):
+        pq = ProcessedQuery(
+            original="test",
+            processed="test",
+            alternatives=[],
+            strategy_used="passthrough",
+            hypothetical_doc=None,
+        )
+        assert pq.strategy_used == "passthrough"
+
+    def test_no_llm_client_forces_passthrough(self):
+        """QueryProcessor with no llm_client should use passthrough for all LLM strategies."""
+        processor = QueryProcessor(llm_client=None)
+        assert processor._llm_client is None
diff --git a/python-backend/tests/orchestrator/rag/test_scope_filtering.py b/python-backend/tests/orchestrator/rag/test_scope_filtering.py
new file mode 100644
index 0000000..8088aff
--- /dev/null
+++ b/python-backend/tests/orchestrator/rag/test_scope_filtering.py
@@ -0,0 +1,299 @@
+"""Tests for scope-aware filtering in BM25 and Vector retrievers.
+
+Validates that:
+- BM25 pre-filters candidates by allowed_scopes before scoring
+- VectorRetriever applies scope filters (in-memory)
+- HybridRAGEngine.retrieve() always injects tenant_id + scope filters
+- No cross-tenant results even if scopes overlap
+"""
+
+import pytest
+import numpy as np
+from unittest.mock import AsyncMock, patch
+
+from app.orchestrator.rag.bm25_retriever import BM25Retriever
+from app.orchestrator.rag.vector_retriever import VectorRetriever
+from app.orchestrator.rag.hybrid_rag import (
+    HybridRAGEngine,
+    RAGConfig,
+    SearchMode,
+    Document,
+)
+
+
+# --- BM25 Scope Filtering Tests ---
+
+
+@pytest.mark.unit
+@pytest.mark.asyncio
+class TestBM25ScopeFiltering:
+    """BM25 retriever must pre-filter candidates by allowed_scopes before scoring."""
+
+    @pytest.fixture
+    def retriever(self):
+        return BM25Retriever()
+
+    async def test_prefilters_by_allowed_scopes(self, retriever):
+        """User with scopes {u:1, g:10} only gets docs with matching scopes."""
+        doc_a = Document(
+            content="Python machine learning algorithms",
+            metadata={"tenant_id": "t1", "allowed_scopes": ["u:1"]},
+        )
+        doc_b = Document(
+            content="Python deep learning neural networks",
+            metadata={"tenant_id": "t1", "allowed_scopes": ["u:2"]},
+        )
+        doc_c = Document(
+            content="Python data science pipelines",
+            metadata={"tenant_id": "t1", "allowed_scopes": ["g:10"]},
+        )
+        await retriever.add_document(doc_a)
+        await retriever.add_document(doc_b)
+        await retriever.add_document(doc_c)
+
+        results = await retriever.retrieve(
+            "Python machine learning",
+            top_k=10,
+            filters={"tenant_id": "t1", "allowed_scopes": ["u:1", "g:10"]},
+        )
+
+        result_ids = {r.doc_id for r in results}
+        assert doc_a.doc_id in result_ids
+        assert doc_c.doc_id in result_ids
+        assert doc_b.doc_id not in result_ids
+
+    async def test_tenant_id_filter_always_applied(self, retriever):
+        """tenant_id filter is a hard rule -- must always be applied."""
+        doc_t1 = Document(
+            content="Python programming language guide",
+            metadata={"tenant_id": "t1", "allowed_scopes": ["u:1"]},
+        )
+        doc_t2 = Document(
+            content="Python programming advanced tutorial",
+            metadata={"tenant_id": "t2", "allowed_scopes": ["u:1"]},
+        )
+        await retriever.add_document(doc_t1)
+        await retriever.add_document(doc_t2)
+
+        results = await retriever.retrieve(
+            "Python programming",
+            top_k=10,
+            filters={"tenant_id": "t1"},
+        )
+
+        result_ids = {r.doc_id for r in results}
+        assert doc_t1.doc_id in result_ids
+        assert doc_t2.doc_id not in result_ids
+
+    async def test_no_cross_tenant_results_even_with_overlapping_scopes(self, retriever):
+        """Even if scopes overlap across tenants, tenant_id isolation holds."""
+        doc_a = Document(
+            content="Shared knowledge base article",
+            metadata={"tenant_id": "tenant-a", "allowed_scopes": ["g:10"]},
+        )
+        doc_b = Document(
+            content="Shared knowledge base document",
+            metadata={"tenant_id": "tenant-b", "allowed_scopes": ["g:10"]},
+        )
+        await retriever.add_document(doc_a)
+        await retriever.add_document(doc_b)
+
+        results = await retriever.retrieve(
+            "knowledge base",
+            top_k=10,
+            filters={"tenant_id": "tenant-a", "allowed_scopes": ["g:10"]},
+        )
+
+        result_ids = {r.doc_id for r in results}
+        assert doc_a.doc_id in result_ids
+        assert doc_b.doc_id not in result_ids
+
+    async def test_metadata_filter_doc_type(self, retriever):
+        """Filter by doc_type returns only matching chunks."""
+        doc_code = Document(
+            content="Python function definition examples",
+            metadata={"tenant_id": "t1", "allowed_scopes": ["u:1"], "doc_type": "code"},
+        )
+        doc_text = Document(
+            content="Python documentation guide text",
+            metadata={"tenant_id": "t1", "allowed_scopes": ["u:1"], "doc_type": "document"},
+        )
+        await retriever.add_document(doc_code)
+        await retriever.add_document(doc_text)
+
+        results = await retriever.retrieve(
+            "Python",
+            top_k=10,
+            filters={"tenant_id": "t1", "allowed_scopes": ["u:1"], "doc_type": "code"},
+        )
+
+        result_ids = {r.doc_id for r in results}
+        assert doc_code.doc_id in result_ids
+        assert doc_text.doc_id not in result_ids
+
+    async def test_no_filters_returns_all(self, retriever):
+        """Without filters, all matching docs are returned."""
+        doc1 = Document(content="Python machine learning", metadata={"tenant_id": "t1"})
+        doc2 = Document(content="Python deep learning", metadata={"tenant_id": "t2"})
+        await retriever.add_document(doc1)
+        await retriever.add_document(doc2)
+
+        results = await retriever.retrieve("Python", top_k=10)
+
+        assert len(results) == 2
+
+
+# --- Vector Retriever Scope Filtering Tests ---
+
+
+@pytest.mark.unit
+@pytest.mark.asyncio
+class TestVectorRetrieverScopeFiltering:
+    """VectorRetriever must apply scope filters in-memory mode."""
+
+    @pytest.fixture
+    def retriever(self):
+        return VectorRetriever(threshold=0.0)
+
+    async def test_in_memory_scope_filtering(self, retriever):
+        """In-memory mode filters by allowed_scopes metadata."""
+        doc_a = Document(
+            content="Machine learning algorithms",
+            metadata={"tenant_id": "t1", "allowed_scopes": ["u:1"]},
+        )
+        doc_b = Document(
+            content="Machine learning frameworks",
+            metadata={"tenant_id": "t1", "allowed_scopes": ["u:2"]},
+        )
+
+        with patch.object(retriever, "_get_embedding", new_callable=AsyncMock) as mock_emb:
+            # Use simple embeddings that will match
+            mock_emb.side_effect = lambda text: np.ones(1536) / np.sqrt(1536)
+            await retriever.add_document(doc_a)
+            await retriever.add_document(doc_b)
+
+            results = await retriever.retrieve(
+                "machine learning",
+                top_k=10,
+                filters={"tenant_id": "t1", "allowed_scopes": ["u:1"]},
+            )
+
+        result_ids = {r.doc_id for r in results}
+        assert doc_a.doc_id in result_ids
+        assert doc_b.doc_id not in result_ids
+
+    async def test_tenant_filter_on_vector_retriever(self, retriever):
+        """Tenant filter is enforced in vector retrieval."""
+        doc_t1 = Document(
+            content="Important document",
+            metadata={"tenant_id": "t1", "allowed_scopes": ["u:1"]},
+        )
+        doc_t2 = Document(
+            content="Important document copy",
+            metadata={"tenant_id": "t2", "allowed_scopes": ["u:1"]},
+        )
+
+        with patch.object(retriever, "_get_embedding", new_callable=AsyncMock) as mock_emb:
+            mock_emb.side_effect = lambda text: np.ones(1536) / np.sqrt(1536)
+            await retriever.add_document(doc_t1)
+            await retriever.add_document(doc_t2)
+
+            results = await retriever.retrieve(
+                "important",
+                top_k=10,
+                filters={"tenant_id": "t1"},
+            )
+
+        result_ids = {r.doc_id for r in results}
+        assert doc_t1.doc_id in result_ids
+        assert doc_t2.doc_id not in result_ids
+
+    async def test_no_filters_returns_all(self, retriever):
+        """Without filters, all docs above threshold returned."""
+        doc1 = Document(content="Document one", metadata={"tenant_id": "t1"})
+        doc2 = Document(content="Document two", metadata={"tenant_id": "t2"})
+
+        with patch.object(retriever, "_get_embedding", new_callable=AsyncMock) as mock_emb:
+            mock_emb.side_effect = lambda text: np.ones(1536) / np.sqrt(1536)
+            await retriever.add_document(doc1)
+            await retriever.add_document(doc2)
+
+            results = await retriever.retrieve("document", top_k=10)
+
+        assert len(results) == 2
+
+
+# --- HybridRAGEngine Scope Injection Tests ---
+
+
+@pytest.mark.unit
+@pytest.mark.asyncio
+class TestHybridRAGEngineScopeInjection:
+    """HybridRAGEngine.retrieve() must always inject tenant_id + scope filters."""
+
+    @pytest.fixture
+    def engine(self):
+        config = RAGConfig(
+            mode=SearchMode.KEYWORD,
+            use_rerank=False,
+            use_cache=False,
+        )
+        return HybridRAGEngine(config=config)
+
+    async def test_injects_tenant_and_scope_filters(self, engine):
+        """retrieve() must enforce tenant_id and scope filters server-side."""
+        await engine.add_document(
+            content="Test document for scoping",
+            metadata={"tenant_id": "t1", "allowed_scopes": ["u:1"]},
+        )
+
+        # Spy on the BM25 retriever
+        original_retrieve = engine.bm25_retriever.retrieve
+        calls = []
+
+        async def spy_retrieve(query, top_k=10, filters=None):
+            calls.append(filters)
+            return await original_retrieve(query, top_k=top_k, filters=filters)
+
+        engine.bm25_retriever.retrieve = spy_retrieve
+
+        await engine.retrieve(
+            query="Test",
+            tenant_id="t1",
+            effective_scopes=["u:1", "g:10"],
+        )
+
+        assert len(calls) == 1
+        assert calls[0]["tenant_id"] == "t1"
+        assert calls[0]["allowed_scopes"] == ["u:1", "g:10"]
+
+    async def test_caller_cannot_bypass_scope_enforcement(self, engine):
+        """Caller-provided filters cannot remove tenant/scope constraints."""
+        await engine.add_document(
+            content="Test document",
+            metadata={"tenant_id": "t1", "allowed_scopes": ["u:1"]},
+        )
+
+        original_retrieve = engine.bm25_retriever.retrieve
+        calls = []
+
+        async def spy_retrieve(query, top_k=10, filters=None):
+            calls.append(filters)
+            return await original_retrieve(query, top_k=top_k, filters=filters)
+
+        engine.bm25_retriever.retrieve = spy_retrieve
+
+        # Caller provides tenant_id="evil" in filters but server enforces "t1"
+        await engine.retrieve(
+            query="Test",
+            tenant_id="t1",
+            effective_scopes=["u:1"],
+            filters={"tenant_id": "evil", "some_extra": "value"},
+        )
+
+        assert len(calls) == 1
+        # Server-side tenant_id OVERRIDES caller's "evil"
+        assert calls[0]["tenant_id"] == "t1"
+        assert calls[0]["allowed_scopes"] == ["u:1"]
+        # Extra filters preserved
+        assert calls[0]["some_extra"] == "value"
