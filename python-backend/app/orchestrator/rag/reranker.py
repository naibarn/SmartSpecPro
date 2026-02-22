"""
SmartSpec Pro - Reranker
Phase 2: Quality & Intelligence

Strategy-based reranker with automatic fallback chain.
Supports cross-encoder (bge-reranker-v2-m3), Cohere Rerank API,
LLM-based scoring, and heuristic fallback.
"""

from __future__ import annotations

import asyncio
import math
import os
from concurrent.futures import ThreadPoolExecutor
from enum import Enum
from typing import Any, Dict, List, Optional, Set

import structlog

logger = structlog.get_logger()


class RerankStrategy(str, Enum):
    """Reranking strategy."""
    CROSS_ENCODER = "cross_encoder"
    COHERE = "cohere"
    LLM = "llm"
    HEURISTIC = "heuristic"



class Reranker:
    """
    Strategy-based Reranker with automatic fallback chain.

    Fallback order (default): CROSS_ENCODER -> COHERE -> LLM -> HEURISTIC

    The cross-encoder and Cohere strategies are lazy-loaded on first use.
    If they fail (missing dependencies, no API key, etc.), the next strategy
    in the chain is tried automatically.
    """

    DEFAULT_FALLBACK_CHAIN = [
        RerankStrategy.CROSS_ENCODER,
        RerankStrategy.COHERE,
        RerankStrategy.LLM,
        RerankStrategy.HEURISTIC,
    ]

    def __init__(
        self,
        strategy: RerankStrategy = RerankStrategy.CROSS_ENCODER,
        model: str = "BAAI/bge-reranker-v2-m3",
        cohere_api_key: str | None = None,
        llm_model: str = "gpt-4.1-nano",
        batch_size: int = 5,
        max_tokens_per_doc: int = 300,
        fallback_chain: list[RerankStrategy] | None = None,
        # Legacy parameter for backward compatibility
        use_llm: bool | None = None,
    ):
        self.strategy = strategy
        self.model = model
        self.cohere_api_key = cohere_api_key
        self.llm_model = llm_model
        self.batch_size = batch_size
        self.max_tokens_per_doc = max_tokens_per_doc

        # Handle legacy use_llm parameter
        if use_llm is not None:
            if use_llm:
                self.strategy = RerankStrategy.LLM
            else:
                self.strategy = RerankStrategy.HEURISTIC

        # Build fallback chain starting from the configured strategy
        if fallback_chain is not None:
            self._fallback_chain = list(fallback_chain)
        elif use_llm is False:
            # Legacy: use_llm=False means heuristic only, no other strategies
            self._fallback_chain = [RerankStrategy.HEURISTIC]
        else:
            self._fallback_chain = list(self.DEFAULT_FALLBACK_CHAIN)
            # Ensure configured strategy is first
            if self.strategy in self._fallback_chain:
                self._fallback_chain.remove(self.strategy)
            self._fallback_chain.insert(0, self.strategy)

        # Lazy-loaded resources
        self._cross_encoder_model = None
        self._thread_pool: ThreadPoolExecutor | None = None
        self._cohere_client = None
        self._llm_client = None

        logger.info(
            "reranker_initialized",
            strategy=self.strategy.value,
            fallback_chain=[s.value for s in self._fallback_chain],
        )

    async def rerank(
        self,
        query: str,
        documents: List[Any],
        top_k: int = 5,
        effective_scopes: Set[str] | None = None,
    ) -> List[Any]:
        """
        Rerank documents using the configured strategy with automatic fallback.

        Args:
            query: Search query.
            documents: List of Document objects to rerank.
            top_k: Number of top results to return.
            effective_scopes: User's effective scopes for post-rerank verification.

        Returns:
            Reranked and scope-verified list of documents.
        """
        if not documents:
            return []

        if len(documents) <= top_k:
            # Apply scope verification even without reranking
            if effective_scopes is not None:
                documents = self._verify_scopes(documents, effective_scopes)
            return documents

        # Try each strategy in the fallback chain
        strategy_dispatch = {
            RerankStrategy.CROSS_ENCODER: self._cross_encoder_rerank,
            RerankStrategy.COHERE: self._cohere_rerank,
            RerankStrategy.LLM: self._llm_rerank,
            RerankStrategy.HEURISTIC: self._heuristic_rerank,
        }

        last_error = None
        result = None

        for strategy in self._fallback_chain:
            handler = strategy_dispatch.get(strategy)
            if handler is None:
                continue

            try:
                if asyncio.iscoroutinefunction(handler):
                    result = await handler(query, documents, top_k)
                else:
                    result = handler(query, documents, top_k)

                logger.debug(
                    "rerank_strategy_succeeded",
                    strategy=strategy.value,
                    result_count=len(result),
                )
                break

            except Exception as e:
                last_error = e
                logger.warning(
                    "rerank_strategy_failed",
                    strategy=strategy.value,
                    error=str(e),
                )
                continue

        if result is None:
            raise RuntimeError(
                f"All reranking strategies failed. "
                f"Tried: {[s.value for s in self._fallback_chain]}. "
                f"Last error: {last_error}"
            )

        # Post-reranking scope verification (defense in depth)
        if effective_scopes is not None:
            result = self._verify_scopes(result, effective_scopes)

        return result

    # ------------------------------------------------------------------
    # Cross-encoder strategy
    # ------------------------------------------------------------------

    def _ensure_cross_encoder_loaded(self) -> None:
        """Lazy-load the cross-encoder model."""
        if self._cross_encoder_model is not None:
            return

        try:
            from sentence_transformers import CrossEncoder
        except ImportError:
            raise RuntimeError(
                "sentence_transformers not installed. "
                "Install with: pip install sentence-transformers"
            )

        self._cross_encoder_model = CrossEncoder(self.model)

        if self._thread_pool is None:
            self._thread_pool = ThreadPoolExecutor(max_workers=1)

        logger.info("cross_encoder_loaded", model=self.model)

    async def _run_cross_encoder(
        self, query: str, documents: List[Any]
    ) -> list[float]:
        """Run cross-encoder inference in a thread pool to avoid blocking the event loop."""
        # Truncate documents
        pairs = []
        for doc in documents:
            content = doc.content
            # Simple token approximation: ~4 chars per token
            max_chars = self.max_tokens_per_doc * 4
            if len(content) > max_chars:
                content = content[:max_chars]
            pairs.append([query, content])

        if self._cross_encoder_model is None:
            raise RuntimeError("Cross-encoder model not loaded")

        # Run CPU-bound inference in thread pool to avoid blocking async event loop
        loop = asyncio.get_event_loop()
        model = self._cross_encoder_model
        scores = await loop.run_in_executor(
            self._thread_pool,
            lambda: model.predict(pairs),
        )
        return [float(s) for s in scores]

    async def _cross_encoder_rerank(
        self, query: str, documents: List[Any], top_k: int
    ) -> List[Any]:
        """Rerank using cross-encoder model."""
        self._ensure_cross_encoder_loaded()

        raw_scores = await self._run_cross_encoder(query, documents)

        # Normalize logits to [0, 1] via sigmoid
        for doc, logit in zip(documents, raw_scores):
            doc.rerank_score = 1.0 / (1.0 + math.exp(-logit))

        # Sort by rerank_score descending
        sorted_docs = sorted(documents, key=lambda d: d.rerank_score, reverse=True)
        return sorted_docs[:top_k]

    # ------------------------------------------------------------------
    # Cohere strategy
    # ------------------------------------------------------------------

    async def _cohere_rerank(
        self, query: str, documents: List[Any], top_k: int
    ) -> List[Any]:
        """Rerank using Cohere Rerank API."""
        try:
            import cohere
        except ImportError:
            raise RuntimeError("cohere package not installed")

        api_key = self.cohere_api_key or os.environ.get("COHERE_API_KEY")
        if not api_key:
            raise RuntimeError("No Cohere API key configured")

        if self._cohere_client is None:
            self._cohere_client = cohere.ClientV2(api_key=api_key)

        doc_texts = [doc.content for doc in documents]

        response = self._cohere_client.rerank(
            model="rerank-v3.5",
            query=query,
            documents=doc_texts,
            top_n=top_k,
        )

        # Map scores back to documents
        result = []
        for item in response.results:
            doc = documents[item.index]
            doc.rerank_score = item.relevance_score
            result.append(doc)

        return result

    # ------------------------------------------------------------------
    # LLM strategy (preserved from original)
    # ------------------------------------------------------------------

    async def _llm_rerank(
        self, query: str, documents: List[Any], top_k: int
    ) -> List[Any]:
        """Rerank using LLM per-document scoring."""
        try:
            from openai import AsyncOpenAI
        except ImportError:
            raise RuntimeError("OpenAI package not installed")

        if self._llm_client is None:
            self._llm_client = AsyncOpenAI()

        scored_docs = []
        for doc in documents:
            score = await self._score_document(query, doc)
            doc.rerank_score = score
            scored_docs.append((score, doc))

        scored_docs.sort(key=lambda x: x[0], reverse=True)
        return [doc for score, doc in scored_docs[:top_k]]

    async def _score_document(self, query: str, doc: Any) -> float:
        """Score a single document using LLM."""
        prompt = (
            f"Rate the relevance of the following document to the query "
            f"on a scale of 0 to 10.\nOnly respond with a single number.\n\n"
            f"Query: {query}\n\nDocument:\n{doc.content[:1000]}\n\n"
            f"Relevance score (0-10):"
        )

        try:
            response = await self._llm_client.chat.completions.create(
                model=self.llm_model,
                messages=[{"role": "user", "content": prompt}],
                max_tokens=5,
                temperature=0,
            )
            score_text = response.choices[0].message.content.strip()
            score = float(score_text) / 10.0
            return min(max(score, 0.0), 1.0)
        except Exception as e:
            logger.warning("document_scoring_failed", error=str(e))
            return doc.final_score or 0.5

    # ------------------------------------------------------------------
    # Heuristic strategy (preserved from original)
    # ------------------------------------------------------------------

    def _heuristic_rerank(
        self, query: str, documents: List[Any], top_k: int
    ) -> List[Any]:
        """Rerank using heuristics combining BM25, vector, and term overlap."""
        query_terms = set(query.lower().split())

        scored_docs = []
        for doc in documents:
            base_score = (
                doc.bm25_score * 0.3
                + doc.vector_score * 0.5
                + doc.final_score * 0.2
            )

            doc_terms = set(doc.content.lower().split())
            overlap = len(query_terms & doc_terms)
            overlap_bonus = overlap / max(len(query_terms), 1) * 0.2

            doc_length = len(doc.content)
            if 100 <= doc_length <= 2000:
                length_bonus = 0.1
            elif doc_length < 100:
                length_bonus = -0.1
            else:
                length_bonus = 0.0

            final_score = base_score + overlap_bonus + length_bonus
            doc.rerank_score = final_score
            scored_docs.append((final_score, doc))

        scored_docs.sort(key=lambda x: x[0], reverse=True)
        return [doc for score, doc in scored_docs[:top_k]]

    # ------------------------------------------------------------------
    # Scope verification (defense in depth)
    # ------------------------------------------------------------------

    def _verify_scopes(
        self,
        documents: List[Any],
        effective_scopes: Set[str],
    ) -> List[Any]:
        """
        Verify all reranked documents pass scope checks.

        Removes any document whose metadata['allowed_scopes'] does not
        intersect with the user's effective_scopes.
        Documents without allowed_scopes pass (backward compatibility).
        """
        verified = []
        for doc in documents:
            metadata = getattr(doc, "metadata", {}) or {}
            doc_scopes = metadata.get("allowed_scopes")

            if doc_scopes is None:
                # No scopes defined — backward compatible, allow
                verified.append(doc)
                continue

            doc_scope_set = set(doc_scopes)
            if doc_scope_set & effective_scopes:
                verified.append(doc)
            else:
                logger.warning(
                    "reranker_scope_verification_removed",
                    doc_id=getattr(doc, "doc_id", "unknown"),
                    doc_scopes=list(doc_scope_set),
                )

        return verified

    # ------------------------------------------------------------------
    # Health and cleanup
    # ------------------------------------------------------------------

    def is_model_loaded(self) -> bool:
        """Return whether the cross-encoder model is currently loaded in memory."""
        return self._cross_encoder_model is not None

    async def cleanup(self):
        """Release model, executor, and client resources."""
        if self._thread_pool is not None:
            self._thread_pool.shutdown(wait=False)
            self._thread_pool = None

        self._cross_encoder_model = None
        self._cohere_client = None
        self._llm_client = None

        logger.info("reranker_cleanup_complete")
