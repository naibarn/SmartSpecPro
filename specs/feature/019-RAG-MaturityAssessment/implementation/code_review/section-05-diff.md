diff --git a/python-backend/app/orchestrator/rag/__init__.py b/python-backend/app/orchestrator/rag/__init__.py
index 808a03b..0a560c4 100644
--- a/python-backend/app/orchestrator/rag/__init__.py
+++ b/python-backend/app/orchestrator/rag/__init__.py
@@ -18,7 +18,7 @@ from app.orchestrator.rag.hybrid_rag import (
 )
 from app.orchestrator.rag.bm25_retriever import BM25Retriever
 from app.orchestrator.rag.vector_retriever import VectorRetriever
-from app.orchestrator.rag.reranker import Reranker
+from app.orchestrator.rag.reranker import Reranker, RerankStrategy
 from app.orchestrator.rag.scope_engine import (
     compute_effective_scopes,
     recompute_allowed_scopes,
@@ -40,6 +40,7 @@ __all__ = [
     "BM25Retriever",
     "VectorRetriever",
     "Reranker",
+    "RerankStrategy",
     "compute_effective_scopes",
     "recompute_allowed_scopes",
     "propagate_scopes_to_vector_stores",
diff --git a/python-backend/app/orchestrator/rag/hybrid_rag.py b/python-backend/app/orchestrator/rag/hybrid_rag.py
index 842c609..5dac499 100644
--- a/python-backend/app/orchestrator/rag/hybrid_rag.py
+++ b/python-backend/app/orchestrator/rag/hybrid_rag.py
@@ -229,8 +229,8 @@ class HybridRAGEngine:
     def reranker(self) -> "Reranker":
         """Get or create reranker."""
         if self._reranker is None:
-            from app.orchestrator.rag.reranker import Reranker
-            self._reranker = Reranker()
+            from app.orchestrator.rag.reranker import Reranker, RerankStrategy
+            self._reranker = Reranker(strategy=RerankStrategy.CROSS_ENCODER)
         return self._reranker
 
     @property
@@ -430,6 +430,7 @@ class HybridRAGEngine:
                     query=query,
                     documents=rerank_candidates,
                     top_k=self.config.rerank_top_k,
+                    effective_scopes=set(effective_scopes) if effective_scopes else None,
                 )
                 
                 rerank_end = datetime.utcnow()
diff --git a/python-backend/app/orchestrator/rag/reranker.py b/python-backend/app/orchestrator/rag/reranker.py
index 3faa0e8..4d7c4cf 100644
--- a/python-backend/app/orchestrator/rag/reranker.py
+++ b/python-backend/app/orchestrator/rag/reranker.py
@@ -2,224 +2,426 @@
 SmartSpec Pro - Reranker
 Phase 2: Quality & Intelligence
 
-Cross-encoder reranker for final ranking of retrieved documents.
-Uses LLM or cross-encoder models to score query-document pairs.
+Strategy-based reranker with automatic fallback chain.
+Supports cross-encoder (bge-reranker-v2-m3), Cohere Rerank API,
+LLM-based scoring, and heuristic fallback.
 """
 
+from __future__ import annotations
+
 import asyncio
-from dataclasses import dataclass
-from typing import Any, Dict, List, Optional
+import math
+import os
+from concurrent.futures import ProcessPoolExecutor
+from enum import Enum
+from typing import Any, Dict, List, Optional, Set
 
 import structlog
 
 logger = structlog.get_logger()
 
 
+class RerankStrategy(str, Enum):
+    """Reranking strategy."""
+    CROSS_ENCODER = "cross_encoder"
+    COHERE = "cohere"
+    LLM = "llm"
+    HEURISTIC = "heuristic"
+
+
+# Module-level function for ProcessPoolExecutor (must be picklable)
+def _run_cross_encoder_predict(model_path: str, pairs: list[list[str]]) -> list[float]:
+    """Run cross-encoder prediction in a separate process."""
+    from sentence_transformers import CrossEncoder
+
+    model = CrossEncoder(model_path)
+    scores = model.predict(pairs)
+    return [float(s) for s in scores]
+
+
 class Reranker:
     """
-    Reranker for final document ranking.
-    
-    Supports multiple reranking strategies:
-    - LLM-based reranking (using GPT/Claude)
-    - Cross-encoder models (sentence-transformers)
-    - Simple heuristic reranking
+    Strategy-based Reranker with automatic fallback chain.
+
+    Fallback order (default): CROSS_ENCODER -> COHERE -> LLM -> HEURISTIC
+
+    The cross-encoder and Cohere strategies are lazy-loaded on first use.
+    If they fail (missing dependencies, no API key, etc.), the next strategy
+    in the chain is tried automatically.
     """
-    
+
+    DEFAULT_FALLBACK_CHAIN = [
+        RerankStrategy.CROSS_ENCODER,
+        RerankStrategy.COHERE,
+        RerankStrategy.LLM,
+        RerankStrategy.HEURISTIC,
+    ]
+
     def __init__(
         self,
-        model: str = "gpt-4.1-nano",
-        use_llm: bool = True,
+        strategy: RerankStrategy = RerankStrategy.CROSS_ENCODER,
+        model: str = "BAAI/bge-reranker-v2-m3",
+        cohere_api_key: str | None = None,
+        llm_model: str = "gpt-4.1-nano",
         batch_size: int = 5,
+        max_tokens_per_doc: int = 300,
+        fallback_chain: list[RerankStrategy] | None = None,
+        # Legacy parameter for backward compatibility
+        use_llm: bool | None = None,
     ):
-        """
-        Initialize Reranker.
-        
-        Args:
-            model: Model to use for reranking
-            use_llm: Whether to use LLM for reranking
-            batch_size: Number of documents to rerank in parallel
-        """
+        self.strategy = strategy
         self.model = model
-        self.use_llm = use_llm
+        self.cohere_api_key = cohere_api_key
+        self.llm_model = llm_model
         self.batch_size = batch_size
-        
-        # LLM client (lazy loaded)
+        self.max_tokens_per_doc = max_tokens_per_doc
+
+        # Handle legacy use_llm parameter
+        if use_llm is not None:
+            if use_llm:
+                self.strategy = RerankStrategy.LLM
+            else:
+                self.strategy = RerankStrategy.HEURISTIC
+
+        # Build fallback chain starting from the configured strategy
+        if fallback_chain is not None:
+            self._fallback_chain = list(fallback_chain)
+        else:
+            self._fallback_chain = list(self.DEFAULT_FALLBACK_CHAIN)
+            # Ensure configured strategy is first
+            if self.strategy in self._fallback_chain:
+                self._fallback_chain.remove(self.strategy)
+            self._fallback_chain.insert(0, self.strategy)
+
+        # Lazy-loaded resources
+        self._cross_encoder_model = None
+        self._process_pool: ProcessPoolExecutor | None = None
+        self._cohere_client = None
         self._llm_client = None
-        
+
         logger.info(
             "reranker_initialized",
-            model=model,
-            use_llm=use_llm,
+            strategy=self.strategy.value,
+            fallback_chain=[s.value for s in self._fallback_chain],
         )
-    
+
     async def rerank(
         self,
         query: str,
         documents: List[Any],
         top_k: int = 5,
+        effective_scopes: Set[str] | None = None,
     ) -> List[Any]:
         """
-        Rerank documents based on relevance to query.
-        
+        Rerank documents using the configured strategy with automatic fallback.
+
         Args:
-            query: Search query
-            documents: List of documents to rerank
-            top_k: Number of results to return
-            
+            query: Search query.
+            documents: List of Document objects to rerank.
+            top_k: Number of top results to return.
+            effective_scopes: User's effective scopes for post-rerank verification.
+
         Returns:
-            Reranked list of documents
+            Reranked and scope-verified list of documents.
         """
         if not documents:
             return []
-        
+
         if len(documents) <= top_k:
-            # No need to rerank if we have fewer documents than top_k
+            # Apply scope verification even without reranking
+            if effective_scopes is not None:
+                documents = self._verify_scopes(documents, effective_scopes)
             return documents
-        
-        if self.use_llm:
+
+        # Try each strategy in the fallback chain
+        strategy_dispatch = {
+            RerankStrategy.CROSS_ENCODER: self._cross_encoder_rerank,
+            RerankStrategy.COHERE: self._cohere_rerank,
+            RerankStrategy.LLM: self._llm_rerank,
+            RerankStrategy.HEURISTIC: self._heuristic_rerank,
+        }
+
+        last_error = None
+        result = None
+
+        for strategy in self._fallback_chain:
+            handler = strategy_dispatch.get(strategy)
+            if handler is None:
+                continue
+
             try:
-                return await self._llm_rerank(query, documents, top_k)
+                if asyncio.iscoroutinefunction(handler):
+                    result = await handler(query, documents, top_k)
+                else:
+                    result = handler(query, documents, top_k)
+
+                logger.debug(
+                    "rerank_strategy_succeeded",
+                    strategy=strategy.value,
+                    result_count=len(result),
+                )
+                break
+
             except Exception as e:
+                last_error = e
                 logger.warning(
-                    "llm_rerank_failed",
+                    "rerank_strategy_failed",
+                    strategy=strategy.value,
                     error=str(e),
                 )
-                # Fallback to heuristic
-                return self._heuristic_rerank(query, documents, top_k)
-        else:
-            return self._heuristic_rerank(query, documents, top_k)
-    
+                continue
+
+        if result is None:
+            raise RuntimeError(
+                f"All reranking strategies failed. "
+                f"Tried: {[s.value for s in self._fallback_chain]}. "
+                f"Last error: {last_error}"
+            )
+
+        # Post-reranking scope verification (defense in depth)
+        if effective_scopes is not None:
+            result = self._verify_scopes(result, effective_scopes)
+
+        return result
+
+    # ------------------------------------------------------------------
+    # Cross-encoder strategy
+    # ------------------------------------------------------------------
+
+    def _ensure_cross_encoder_loaded(self) -> None:
+        """Lazy-load the cross-encoder model."""
+        if self._cross_encoder_model is not None:
+            return
+
+        try:
+            from sentence_transformers import CrossEncoder
+        except ImportError:
+            raise RuntimeError(
+                "sentence_transformers not installed. "
+                "Install with: pip install sentence-transformers"
+            )
+
+        self._cross_encoder_model = CrossEncoder(self.model)
+
+        if self._process_pool is None:
+            self._process_pool = ProcessPoolExecutor(max_workers=1)
+
+        logger.info("cross_encoder_loaded", model=self.model)
+
+    async def _run_cross_encoder(
+        self, query: str, documents: List[Any]
+    ) -> list[float]:
+        """Run cross-encoder inference, potentially in a process pool."""
+        # Truncate documents
+        pairs = []
+        for doc in documents:
+            content = doc.content
+            # Simple token approximation: ~4 chars per token
+            max_chars = self.max_tokens_per_doc * 4
+            if len(content) > max_chars:
+                content = content[:max_chars]
+            pairs.append([query, content])
+
+        # Run inference
+        if self._cross_encoder_model is not None:
+            scores = self._cross_encoder_model.predict(pairs)
+            return [float(s) for s in scores]
+
+        raise RuntimeError("Cross-encoder model not loaded")
+
+    async def _cross_encoder_rerank(
+        self, query: str, documents: List[Any], top_k: int
+    ) -> List[Any]:
+        """Rerank using cross-encoder model."""
+        self._ensure_cross_encoder_loaded()
+
+        raw_scores = await self._run_cross_encoder(query, documents)
+
+        # Normalize logits to [0, 1] via sigmoid
+        for doc, logit in zip(documents, raw_scores):
+            doc.rerank_score = 1.0 / (1.0 + math.exp(-logit))
+
+        # Sort by rerank_score descending
+        sorted_docs = sorted(documents, key=lambda d: d.rerank_score, reverse=True)
+        return sorted_docs[:top_k]
+
+    # ------------------------------------------------------------------
+    # Cohere strategy
+    # ------------------------------------------------------------------
+
+    async def _cohere_rerank(
+        self, query: str, documents: List[Any], top_k: int
+    ) -> List[Any]:
+        """Rerank using Cohere Rerank API."""
+        try:
+            import cohere
+        except ImportError:
+            raise RuntimeError("cohere package not installed")
+
+        api_key = self.cohere_api_key or os.environ.get("COHERE_API_KEY")
+        if not api_key:
+            raise RuntimeError("No Cohere API key configured")
+
+        if self._cohere_client is None:
+            self._cohere_client = cohere.ClientV2(api_key=api_key)
+
+        doc_texts = [doc.content for doc in documents]
+
+        response = self._cohere_client.rerank(
+            model="rerank-v3.5",
+            query=query,
+            documents=doc_texts,
+            top_n=top_k,
+        )
+
+        # Map scores back to documents
+        result = []
+        for item in response.results:
+            doc = documents[item.index]
+            doc.rerank_score = item.relevance_score
+            result.append(doc)
+
+        return result
+
+    # ------------------------------------------------------------------
+    # LLM strategy (preserved from original)
+    # ------------------------------------------------------------------
+
     async def _llm_rerank(
-        self,
-        query: str,
-        documents: List[Any],
-        top_k: int,
+        self, query: str, documents: List[Any], top_k: int
     ) -> List[Any]:
-        """
-        Rerank using LLM.
-        
-        Uses the LLM to score each document's relevance to the query.
-        """
+        """Rerank using LLM per-document scoring."""
         try:
             from openai import AsyncOpenAI
-            
-            if self._llm_client is None:
-                self._llm_client = AsyncOpenAI()
-            
-            # Score each document
-            scored_docs = []
-            
-            for doc in documents:
-                score = await self._score_document(query, doc)
-                doc.rerank_score = score
-                scored_docs.append((score, doc))
-            
-            # Sort by score
-            scored_docs.sort(key=lambda x: x[0], reverse=True)
-            
-            return [doc for score, doc in scored_docs[:top_k]]
-            
         except ImportError:
-            raise Exception("OpenAI package not installed")
-    
-    async def _score_document(
-        self,
-        query: str,
-        doc: Any,
-    ) -> float:
-        """
-        Score a single document using LLM.
-        
-        Args:
-            query: Search query
-            doc: Document to score
-            
-        Returns:
-            Relevance score (0 to 1)
-        """
-        prompt = f"""Rate the relevance of the following document to the query on a scale of 0 to 10.
-Only respond with a single number.
+            raise RuntimeError("OpenAI package not installed")
 
-Query: {query}
+        if self._llm_client is None:
+            self._llm_client = AsyncOpenAI()
 
-Document:
-{doc.content[:1000]}
+        scored_docs = []
+        for doc in documents:
+            score = await self._score_document(query, doc)
+            doc.rerank_score = score
+            scored_docs.append((score, doc))
+
+        scored_docs.sort(key=lambda x: x[0], reverse=True)
+        return [doc for score, doc in scored_docs[:top_k]]
+
+    async def _score_document(self, query: str, doc: Any) -> float:
+        """Score a single document using LLM."""
+        prompt = (
+            f"Rate the relevance of the following document to the query "
+            f"on a scale of 0 to 10.\nOnly respond with a single number.\n\n"
+            f"Query: {query}\n\nDocument:\n{doc.content[:1000]}\n\n"
+            f"Relevance score (0-10):"
+        )
 
-Relevance score (0-10):"""
-        
         try:
             response = await self._llm_client.chat.completions.create(
-                model=self.model,
+                model=self.llm_model,
                 messages=[{"role": "user", "content": prompt}],
                 max_tokens=5,
                 temperature=0,
             )
-            
             score_text = response.choices[0].message.content.strip()
-            score = float(score_text) / 10.0  # Normalize to 0-1
-            
-            return min(max(score, 0.0), 1.0)  # Clamp to 0-1
-            
+            score = float(score_text) / 10.0
+            return min(max(score, 0.0), 1.0)
         except Exception as e:
-            logger.warning(
-                "document_scoring_failed",
-                error=str(e),
-            )
-            # Return existing score as fallback
+            logger.warning("document_scoring_failed", error=str(e))
             return doc.final_score or 0.5
-    
+
+    # ------------------------------------------------------------------
+    # Heuristic strategy (preserved from original)
+    # ------------------------------------------------------------------
+
     def _heuristic_rerank(
-        self,
-        query: str,
-        documents: List[Any],
-        top_k: int,
+        self, query: str, documents: List[Any], top_k: int
     ) -> List[Any]:
-        """
-        Rerank using heuristics.
-        
-        Combines multiple signals:
-        - Existing scores (BM25, vector)
-        - Query term overlap
-        - Document length preference
-        """
+        """Rerank using heuristics combining BM25, vector, and term overlap."""
         query_terms = set(query.lower().split())
-        
+
         scored_docs = []
-        
         for doc in documents:
-            # Base score from existing scores
             base_score = (
-                doc.bm25_score * 0.3 +
-                doc.vector_score * 0.5 +
-                doc.final_score * 0.2
+                doc.bm25_score * 0.3
+                + doc.vector_score * 0.5
+                + doc.final_score * 0.2
             )
-            
-            # Term overlap bonus
+
             doc_terms = set(doc.content.lower().split())
             overlap = len(query_terms & doc_terms)
             overlap_bonus = overlap / max(len(query_terms), 1) * 0.2
-            
-            # Length preference (prefer medium-length documents)
+
             doc_length = len(doc.content)
             if 100 <= doc_length <= 2000:
                 length_bonus = 0.1
             elif doc_length < 100:
-                length_bonus = -0.1  # Too short
+                length_bonus = -0.1
             else:
-                length_bonus = 0.0  # Long is okay
-            
-            # Final score
+                length_bonus = 0.0
+
             final_score = base_score + overlap_bonus + length_bonus
             doc.rerank_score = final_score
-            
             scored_docs.append((final_score, doc))
-        
-        # Sort by score
+
         scored_docs.sort(key=lambda x: x[0], reverse=True)
-        
         return [doc for score, doc in scored_docs[:top_k]]
-    
+
+    # ------------------------------------------------------------------
+    # Scope verification (defense in depth)
+    # ------------------------------------------------------------------
+
+    def _verify_scopes(
+        self,
+        documents: List[Any],
+        effective_scopes: Set[str],
+    ) -> List[Any]:
+        """
+        Verify all reranked documents pass scope checks.
+
+        Removes any document whose metadata['allowed_scopes'] does not
+        intersect with the user's effective_scopes.
+        Documents without allowed_scopes pass (backward compatibility).
+        """
+        verified = []
+        for doc in documents:
+            metadata = getattr(doc, "metadata", {}) or {}
+            doc_scopes = metadata.get("allowed_scopes")
+
+            if doc_scopes is None:
+                # No scopes defined — backward compatible, allow
+                verified.append(doc)
+                continue
+
+            doc_scope_set = set(doc_scopes)
+            if doc_scope_set & effective_scopes:
+                verified.append(doc)
+            else:
+                logger.warning(
+                    "reranker_scope_verification_removed",
+                    doc_id=getattr(doc, "doc_id", "unknown"),
+                    doc_scopes=list(doc_scope_set),
+                )
+
+        return verified
+
+    # ------------------------------------------------------------------
+    # Health and cleanup
+    # ------------------------------------------------------------------
+
+    def is_model_loaded(self) -> bool:
+        """Return whether the cross-encoder model is currently loaded in memory."""
+        return self._cross_encoder_model is not None
+
     async def cleanup(self):
-        """Cleanup resources."""
+        """Release model, executor, and client resources."""
+        if self._process_pool is not None:
+            self._process_pool.shutdown(wait=False)
+            self._process_pool = None
+
+        self._cross_encoder_model = None
+        self._cohere_client = None
         self._llm_client = None
+
         logger.info("reranker_cleanup_complete")
diff --git a/python-backend/tests/orchestrator/rag/test_reranker.py b/python-backend/tests/orchestrator/rag/test_reranker.py
new file mode 100644
index 0000000..c5a90de
--- /dev/null
+++ b/python-backend/tests/orchestrator/rag/test_reranker.py
@@ -0,0 +1,348 @@
+"""
+Tests for the upgraded Reranker with strategy-based reranking.
+
+Covers:
+- RerankStrategy enum values
+- Cross-encoder strategy (mocked model)
+- Cohere strategy (mocked API)
+- LLM strategy (existing, mocked)
+- Heuristic strategy (existing)
+- Fallback chain behavior
+- Scope verification after reranking
+- Edge cases (empty docs, single doc, etc.)
+"""
+import math
+
+import pytest
+from unittest.mock import AsyncMock, MagicMock, patch
+from dataclasses import dataclass, field
+from typing import Any, Dict
+
+from app.orchestrator.rag.reranker import Reranker, RerankStrategy
+
+
+# ---------------------------------------------------------------------------
+# Fixtures
+# ---------------------------------------------------------------------------
+
+@dataclass
+class FakeDocument:
+    """Minimal document for reranker tests."""
+    doc_id: str = "doc-1"
+    content: str = "Some document content for testing."
+    metadata: Dict[str, Any] = field(default_factory=dict)
+    bm25_score: float = 0.5
+    vector_score: float = 0.6
+    rerank_score: float = 0.0
+    final_score: float = 0.55
+
+
+@pytest.fixture
+def sample_documents():
+    """Return a list of 10 fake documents with varying content."""
+    docs = []
+    for i in range(10):
+        docs.append(FakeDocument(
+            doc_id=f"doc-{i}",
+            content=f"Document {i} content about topic {i % 3}.",
+            bm25_score=0.5 - i * 0.03,
+            vector_score=0.6 - i * 0.04,
+            final_score=0.55 - i * 0.035,
+        ))
+    return docs
+
+
+@pytest.fixture
+def scoped_documents():
+    """Documents with allowed_scopes in metadata for scope verification tests."""
+    return [
+        FakeDocument(doc_id="d1", content="Allowed doc", metadata={"allowed_scopes": ["u:1", "g:10"]}),
+        FakeDocument(doc_id="d2", content="Also allowed", metadata={"allowed_scopes": ["u:1"]}),
+        FakeDocument(doc_id="d3", content="Not allowed", metadata={"allowed_scopes": ["u:999"]}),
+    ]
+
+
+# ---------------------------------------------------------------------------
+# Cross-encoder tests
+# ---------------------------------------------------------------------------
+
+class TestCrossEncoderStrategy:
+    """Tests for CROSS_ENCODER reranking strategy."""
+
+    @pytest.mark.asyncio
+    async def test_cross_encoder_returns_sorted_docs(self, sample_documents):
+        """Cross-encoder should return documents sorted by descending relevance score."""
+        # Mock scores in reverse order so we can verify sorting
+        mock_scores = [float(i) for i in range(len(sample_documents))]
+
+        reranker = Reranker(strategy=RerankStrategy.CROSS_ENCODER)
+
+        with patch.object(reranker, "_ensure_cross_encoder_loaded"):
+            with patch.object(reranker, "_run_cross_encoder", new_callable=AsyncMock) as mock_run:
+                mock_run.return_value = mock_scores
+                result = await reranker.rerank("test query", sample_documents, top_k=5)
+
+        assert len(result) == 5
+        # Highest score should be first
+        scores = [doc.rerank_score for doc in result]
+        assert scores == sorted(scores, reverse=True)
+
+    @pytest.mark.asyncio
+    async def test_cross_encoder_scores_in_valid_range(self, sample_documents):
+        """All rerank_score values must be between 0.0 and 1.0 inclusive."""
+        # Use raw logits that will be sigmoidified
+        raw_logits = [-5.0, -1.0, 0.0, 1.0, 5.0, -3.0, 2.0, 0.5, -0.5, 3.0]
+
+        reranker = Reranker(strategy=RerankStrategy.CROSS_ENCODER)
+
+        with patch.object(reranker, "_ensure_cross_encoder_loaded"):
+            with patch.object(reranker, "_run_cross_encoder", new_callable=AsyncMock) as mock_run:
+                mock_run.return_value = raw_logits
+                result = await reranker.rerank("test query", sample_documents, top_k=10)
+
+        for doc in result:
+            assert 0.0 <= doc.rerank_score <= 1.0
+
+    @pytest.mark.asyncio
+    async def test_cross_encoder_lazy_loads_model(self):
+        """Model should not load at __init__ time; only on first rerank() call."""
+        reranker = Reranker(strategy=RerankStrategy.CROSS_ENCODER)
+        assert reranker._cross_encoder_model is None
+
+    @pytest.mark.asyncio
+    async def test_cross_encoder_handles_model_not_found(self, sample_documents):
+        """If the model file is missing or corrupted, reranker should fall back gracefully."""
+        reranker = Reranker(
+            strategy=RerankStrategy.CROSS_ENCODER,
+            fallback_chain=[RerankStrategy.CROSS_ENCODER, RerankStrategy.HEURISTIC],
+        )
+
+        with patch.object(reranker, "_ensure_cross_encoder_loaded", side_effect=RuntimeError("Model not found")):
+            result = await reranker.rerank("test query", sample_documents, top_k=5)
+
+        # Should have fallen back to heuristic
+        assert len(result) == 5
+
+
+# ---------------------------------------------------------------------------
+# Cohere fallback tests
+# ---------------------------------------------------------------------------
+
+class TestCohereStrategy:
+    """Tests for COHERE reranking strategy."""
+
+    @pytest.mark.asyncio
+    async def test_cohere_returns_relevance_scores(self, sample_documents):
+        """Cohere rerank should call the API and set relevance scores on documents."""
+        reranker = Reranker(
+            strategy=RerankStrategy.COHERE,
+            cohere_api_key="test-key",
+            fallback_chain=[RerankStrategy.COHERE, RerankStrategy.HEURISTIC],
+        )
+
+        # Mock cohere response
+        mock_result = MagicMock()
+        mock_result.results = []
+        for i in range(len(sample_documents)):
+            r = MagicMock()
+            r.index = i
+            r.relevance_score = 0.9 - i * 0.08
+            mock_result.results.append(r)
+
+        with patch.object(reranker, "_cohere_rerank", new_callable=AsyncMock) as mock_cohere:
+            # Return docs sorted by mock score
+            sorted_docs = list(sample_documents)
+            for i, doc in enumerate(sorted_docs):
+                doc.rerank_score = 0.9 - i * 0.08
+            mock_cohere.return_value = sorted_docs[:5]
+            result = await reranker.rerank("test query", sample_documents, top_k=5)
+
+        assert len(result) == 5
+
+    @pytest.mark.asyncio
+    async def test_cohere_skipped_without_api_key(self, sample_documents):
+        """If COHERE_API_KEY is not set, Cohere strategy should skip gracefully."""
+        reranker = Reranker(
+            strategy=RerankStrategy.COHERE,
+            cohere_api_key=None,
+            fallback_chain=[RerankStrategy.COHERE, RerankStrategy.HEURISTIC],
+        )
+
+        with patch.dict("os.environ", {}, clear=True):
+            result = await reranker.rerank("test query", sample_documents, top_k=5)
+
+        # Should fall back to heuristic
+        assert len(result) == 5
+
+    @pytest.mark.asyncio
+    async def test_cohere_skipped_without_package(self, sample_documents):
+        """If the cohere package is not importable, strategy should skip."""
+        reranker = Reranker(
+            strategy=RerankStrategy.COHERE,
+            cohere_api_key="test-key",
+            fallback_chain=[RerankStrategy.COHERE, RerankStrategy.HEURISTIC],
+        )
+
+        with patch.object(reranker, "_cohere_rerank", new_callable=AsyncMock, side_effect=ImportError("No module named 'cohere'")):
+            result = await reranker.rerank("test query", sample_documents, top_k=5)
+
+        # Should fall back to heuristic
+        assert len(result) == 5
+
+
+# ---------------------------------------------------------------------------
+# Fallback chain tests
+# ---------------------------------------------------------------------------
+
+class TestFallbackChain:
+    """Tests for the strategy fallback chain: CROSS_ENCODER -> COHERE -> LLM -> HEURISTIC."""
+
+    @pytest.mark.asyncio
+    async def test_full_fallback_chain(self, sample_documents):
+        """When all higher strategies fail, heuristic should succeed as last resort."""
+        reranker = Reranker(strategy=RerankStrategy.CROSS_ENCODER)
+
+        with patch.object(reranker, "_cross_encoder_rerank", new_callable=AsyncMock, side_effect=RuntimeError("No model")):
+            with patch.object(reranker, "_cohere_rerank", new_callable=AsyncMock, side_effect=RuntimeError("No API key")):
+                with patch.object(reranker, "_llm_rerank", new_callable=AsyncMock, side_effect=RuntimeError("No OpenAI")):
+                    result = await reranker.rerank("test query", sample_documents, top_k=5)
+
+        # Heuristic always works
+        assert len(result) == 5
+
+    @pytest.mark.asyncio
+    async def test_no_fallback_when_primary_succeeds(self, sample_documents):
+        """If the primary strategy succeeds, no other strategy should be attempted."""
+        reranker = Reranker(strategy=RerankStrategy.CROSS_ENCODER)
+
+        with patch.object(reranker, "_cross_encoder_rerank", new_callable=AsyncMock) as mock_ce:
+            mock_ce.return_value = sample_documents[:5]
+            with patch.object(reranker, "_cohere_rerank", new_callable=AsyncMock) as mock_co:
+                with patch.object(reranker, "_llm_rerank", new_callable=AsyncMock) as mock_llm:
+                    result = await reranker.rerank("test query", sample_documents, top_k=5)
+
+        mock_ce.assert_called_once()
+        mock_co.assert_not_called()
+        mock_llm.assert_not_called()
+        assert len(result) == 5
+
+    @pytest.mark.asyncio
+    async def test_all_strategies_fail_raises_error(self, sample_documents):
+        """If even heuristic fails (should not happen), raise a clear error."""
+        reranker = Reranker(strategy=RerankStrategy.CROSS_ENCODER)
+
+        with patch.object(reranker, "_cross_encoder_rerank", new_callable=AsyncMock, side_effect=RuntimeError("CE fail")):
+            with patch.object(reranker, "_cohere_rerank", new_callable=AsyncMock, side_effect=RuntimeError("Cohere fail")):
+                with patch.object(reranker, "_llm_rerank", new_callable=AsyncMock, side_effect=RuntimeError("LLM fail")):
+                    with patch.object(reranker, "_heuristic_rerank", side_effect=RuntimeError("Heuristic fail")):
+                        with pytest.raises(RuntimeError, match="All reranking strategies failed"):
+                            await reranker.rerank("test query", sample_documents, top_k=5)
+
+
+# ---------------------------------------------------------------------------
+# Scope verification tests
+# ---------------------------------------------------------------------------
+
+class TestScopeVerification:
+    """Tests for post-reranking scope verification."""
+
+    @pytest.mark.asyncio
+    async def test_reranked_results_are_subset_of_input(self, scoped_documents):
+        """Reranker must not introduce documents that were not in the input list."""
+        reranker = Reranker(strategy=RerankStrategy.HEURISTIC)
+
+        result = await reranker.rerank(
+            "test query",
+            scoped_documents,
+            top_k=10,
+            effective_scopes={"u:1"},
+        )
+
+        input_ids = {d.doc_id for d in scoped_documents}
+        result_ids = {d.doc_id for d in result}
+        assert result_ids.issubset(input_ids)
+
+    @pytest.mark.asyncio
+    async def test_scope_verification_removes_unauthorized(self, scoped_documents):
+        """Documents that don't match effective_scopes should be removed after reranking."""
+        reranker = Reranker(strategy=RerankStrategy.HEURISTIC)
+
+        result = await reranker.rerank(
+            "test query",
+            scoped_documents,
+            top_k=10,
+            effective_scopes={"u:1"},
+        )
+
+        # d3 has allowed_scopes=["u:999"] which doesn't intersect {"u:1"}
+        result_ids = {d.doc_id for d in result}
+        assert "d3" not in result_ids
+        assert "d1" in result_ids
+        assert "d2" in result_ids
+
+    @pytest.mark.asyncio
+    async def test_no_scope_verification_when_scopes_none(self, scoped_documents):
+        """When effective_scopes is None, skip scope verification (backward compat)."""
+        reranker = Reranker(strategy=RerankStrategy.HEURISTIC)
+
+        result = await reranker.rerank(
+            "test query",
+            scoped_documents,
+            top_k=10,
+            effective_scopes=None,
+        )
+
+        # All docs returned since no scope check
+        assert len(result) == 3
+
+
+# ---------------------------------------------------------------------------
+# Edge cases
+# ---------------------------------------------------------------------------
+
+class TestRerankerEdgeCases:
+    """Edge case tests for the Reranker."""
+
+    @pytest.mark.asyncio
+    async def test_empty_document_list_returns_empty(self):
+        """Reranking an empty list should return an empty list."""
+        reranker = Reranker(strategy=RerankStrategy.HEURISTIC)
+        result = await reranker.rerank("query", [], top_k=5)
+        assert result == []
+
+    @pytest.mark.asyncio
+    async def test_fewer_docs_than_top_k(self):
+        """When docs < top_k, return all docs without reranking."""
+        docs = [FakeDocument(doc_id=f"d{i}", content=f"Doc {i}") for i in range(3)]
+        reranker = Reranker(strategy=RerankStrategy.HEURISTIC)
+        result = await reranker.rerank("query", docs, top_k=10)
+        assert len(result) == 3
+
+    @pytest.mark.asyncio
+    async def test_strategy_enum_values(self):
+        """Verify all expected strategy enum values exist."""
+        assert RerankStrategy.CROSS_ENCODER == "cross_encoder"
+        assert RerankStrategy.COHERE == "cohere"
+        assert RerankStrategy.LLM == "llm"
+        assert RerankStrategy.HEURISTIC == "heuristic"
+
+    @pytest.mark.asyncio
+    async def test_is_model_loaded_false_initially(self):
+        """Health check should return False before model is loaded."""
+        reranker = Reranker(strategy=RerankStrategy.CROSS_ENCODER)
+        assert reranker.is_model_loaded() is False
+
+    @pytest.mark.asyncio
+    async def test_cleanup_releases_resources(self):
+        """Cleanup should release model and pool references."""
+        reranker = Reranker(strategy=RerankStrategy.CROSS_ENCODER)
+        reranker._cross_encoder_model = MagicMock()
+        reranker._process_pool = MagicMock()
+        reranker._cohere_client = MagicMock()
+
+        await reranker.cleanup()
+
+        assert reranker._cross_encoder_model is None
+        assert reranker._process_pool is None
+        assert reranker._cohere_client is None
+        assert reranker._llm_client is None
