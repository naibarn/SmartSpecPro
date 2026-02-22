"""
SmartSpec Pro - Hybrid RAG Engine
Phase 2: Quality & Intelligence

Combines multiple retrieval strategies for optimal context retrieval:
1. BM25 for keyword matching
2. Vector search for semantic similarity
3. Re-ranking for final ordering

Features:
- Reciprocal Rank Fusion (RRF) for combining results
- Configurable weights for each retrieval method
- Caching for performance
- Async support
"""

import asyncio
import hashlib
import time
from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from typing import Any, Dict, List, Optional, Tuple
from uuid import uuid4

import structlog

logger = structlog.get_logger()


# ==================== ENUMS ====================

class SearchMode(str, Enum):
    """Search mode for RAG."""
    HYBRID = "hybrid"  # BM25 + Vector + Rerank
    KEYWORD = "keyword"  # BM25 only
    SEMANTIC = "semantic"  # Vector only
    FAST = "fast"  # BM25 + Vector, no rerank


# ==================== DATA CLASSES ====================

@dataclass
class Document:
    """Represents a document in the RAG system."""
    doc_id: str = field(default_factory=lambda: str(uuid4()))
    content: str = ""
    metadata: Dict[str, Any] = field(default_factory=dict)
    
    # Scores from different retrievers
    bm25_score: float = 0.0
    vector_score: float = 0.0
    rerank_score: float = 0.0
    final_score: float = 0.0
    
    # Source information
    source_type: str = ""  # memory, file, code, doc
    source_id: Optional[str] = None
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            "doc_id": self.doc_id,
            "content": self.content[:500] + "..." if len(self.content) > 500 else self.content,
            "metadata": self.metadata,
            "scores": {
                "bm25": self.bm25_score,
                "vector": self.vector_score,
                "rerank": self.rerank_score,
                "final": self.final_score,
            },
            "source_type": self.source_type,
            "source_id": self.source_id,
        }


@dataclass
class RAGResult:
    """Result from RAG retrieval."""
    query: str = ""
    documents: List[Document] = field(default_factory=list)
    
    # Timing
    retrieval_time_ms: int = 0
    rerank_time_ms: int = 0
    total_time_ms: int = 0
    
    # Stats
    bm25_candidates: int = 0
    vector_candidates: int = 0
    final_count: int = 0
    
    # Mode used
    mode: SearchMode = SearchMode.HYBRID
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            "query": self.query,
            "documents": [d.to_dict() for d in self.documents],
            "timing": {
                "retrieval_ms": self.retrieval_time_ms,
                "rerank_ms": self.rerank_time_ms,
                "total_ms": self.total_time_ms,
            },
            "stats": {
                "bm25_candidates": self.bm25_candidates,
                "vector_candidates": self.vector_candidates,
                "final_count": self.final_count,
            },
            "mode": self.mode.value,
        }
    
    def get_context(self, max_tokens: int = 4000) -> str:
        """Get combined context from documents."""
        context_parts = []
        current_tokens = 0
        
        for doc in self.documents:
            # Estimate tokens (rough: 4 chars per token)
            doc_tokens = len(doc.content) // 4
            
            if current_tokens + doc_tokens > max_tokens:
                break
            
            context_parts.append(doc.content)
            current_tokens += doc_tokens
        
        return "\n\n---\n\n".join(context_parts)


@dataclass
class RAGConfig:
    """Configuration for RAG engine."""
    # Retrieval settings
    mode: SearchMode = SearchMode.HYBRID
    top_k: int = 10

    # BM25 settings
    bm25_weight: float = 0.3
    bm25_k1: float = 1.5
    bm25_b: float = 0.75

    # Vector settings
    vector_weight: float = 0.7
    vector_threshold: float = 0.5

    # Rerank settings
    use_rerank: bool = True
    rerank_top_k: int = 5

    # RRF settings
    rrf_k: int = 60  # Constant for RRF formula

    # Cache settings
    use_cache: bool = True
    cache_ttl_seconds: int = 300

    # Query processing
    query_strategy: "QueryStrategy" = None  # type: ignore[assignment]  # resolved in __post_init__

    def __post_init__(self):
        if self.query_strategy is None:
            from app.orchestrator.rag.query_processor import QueryStrategy as _QS
            self.query_strategy = _QS.PASSTHROUGH


# ==================== HYBRID RAG ENGINE ====================

class HybridRAGEngine:
    """
    Hybrid RAG Engine combining multiple retrieval strategies.
    
    Architecture:
    1. Query → BM25 Retriever → Keyword candidates
    2. Query → Vector Retriever → Semantic candidates
    3. Candidates → RRF Fusion → Combined ranking
    4. Combined → Reranker → Final results
    """
    
    def __init__(
        self,
        config: Optional[RAGConfig] = None,
        bm25_retriever: Optional["BM25Retriever"] = None,
        vector_retriever: Optional["VectorRetriever"] = None,
        reranker: Optional["Reranker"] = None,
    ):
        """Initialize the Hybrid RAG Engine."""
        self.config = config or RAGConfig()
        
        # Initialize retrievers (lazy loading)
        self._bm25_retriever = bm25_retriever
        self._vector_retriever = vector_retriever
        self._reranker = reranker
        self._query_processor = None
        
        # Document store
        self._documents: Dict[str, Document] = {}
        
        # Cache
        self._cache: Dict[str, Tuple[RAGResult, datetime]] = {}
        
        logger.info(
            "hybrid_rag_initialized",
            mode=self.config.mode.value,
            top_k=self.config.top_k,
        )
    
    @property
    def bm25_retriever(self) -> "BM25Retriever":
        """Get or create BM25 retriever."""
        if self._bm25_retriever is None:
            from app.orchestrator.rag.bm25_retriever import BM25Retriever
            self._bm25_retriever = BM25Retriever(
                k1=self.config.bm25_k1,
                b=self.config.bm25_b,
            )
        return self._bm25_retriever
    
    @property
    def vector_retriever(self) -> "VectorRetriever":
        """Get or create vector retriever."""
        if self._vector_retriever is None:
            from app.orchestrator.rag.vector_retriever import VectorRetriever
            self._vector_retriever = VectorRetriever(
                threshold=self.config.vector_threshold,
            )
        return self._vector_retriever
    
    @property
    def reranker(self) -> "Reranker":
        """Get or create reranker."""
        if self._reranker is None:
            from app.orchestrator.rag.reranker import Reranker, RerankStrategy
            self._reranker = Reranker(strategy=RerankStrategy.CROSS_ENCODER)
        return self._reranker

    @property
    def query_processor(self) -> "QueryProcessor":
        """Get or create query processor."""
        if self._query_processor is None:
            from app.orchestrator.rag.query_processor import QueryProcessor
            self._query_processor = QueryProcessor()
        return self._query_processor

    async def add_document(
        self,
        content: str,
        metadata: Optional[Dict[str, Any]] = None,
        source_type: str = "memory",
        source_id: Optional[str] = None,
        doc_id: Optional[str] = None,
    ) -> Document:
        """
        Add a document to the RAG system.
        
        Args:
            content: Document content
            metadata: Optional metadata
            source_type: Type of source (memory, file, code, doc)
            source_id: ID of the source
            doc_id: Optional document ID
            
        Returns:
            The created Document
        """
        doc = Document(
            doc_id=doc_id or str(uuid4()),
            content=content,
            metadata=metadata or {},
            source_type=source_type,
            source_id=source_id,
        )
        
        self._documents[doc.doc_id] = doc
        
        # Add to retrievers
        await self.bm25_retriever.add_document(doc)
        await self.vector_retriever.add_document(doc)
        
        logger.debug(
            "document_added",
            doc_id=doc.doc_id,
            source_type=source_type,
            content_length=len(content),
        )
        
        return doc
    
    async def add_documents(
        self,
        documents: List[Dict[str, Any]],
    ) -> List[Document]:
        """Add multiple documents."""
        results = []
        for doc_data in documents:
            doc = await self.add_document(
                content=doc_data.get("content", ""),
                metadata=doc_data.get("metadata"),
                source_type=doc_data.get("source_type", "memory"),
                source_id=doc_data.get("source_id"),
                doc_id=doc_data.get("doc_id"),
            )
            results.append(doc)
        return results
    
    async def retrieve(
        self,
        query: str,
        top_k: Optional[int] = None,
        mode: Optional[SearchMode] = None,
        filters: Optional[Dict[str, Any]] = None,
        user_id: Optional[int] = None,
        tenant_id: Optional[str] = None,
        effective_scopes: Optional[List[str]] = None,
    ) -> RAGResult:
        """
        Retrieve relevant documents for a query.

        Args:
            query: Search query
            top_k: Number of results to return
            mode: Search mode override
            filters: Metadata filters
            user_id: Optional user ID for credit billing (None = no billing)
            tenant_id: Tenant ID for cache isolation
            effective_scopes: User's effective scope list for cache isolation

        Returns:
            RAGResult with ranked documents
        """
        top_k = top_k or self.config.top_k
        mode = mode or self.config.mode

        # Fail-closed: warn and return empty result if tenant_id is missing
        if tenant_id is None:
            logger.warning(
                "retrieve_missing_tenant_id",
                query=query[:50],
                msg="tenant_id is required for tenant-isolated retrieval",
            )
            return RAGResult(query=query, mode=mode)

        # Enforce tenant and scope isolation — server-side, non-bypassable
        enforced_filters = dict(filters or {})
        if tenant_id:
            enforced_filters["tenant_id"] = tenant_id
        if effective_scopes is not None:
            enforced_filters["allowed_scopes"] = effective_scopes

        # Check cache — include tenant_id, scope hash, and query strategy
        scope_hash = hashlib.sha256(str(sorted(effective_scopes or [])).encode()).hexdigest()[:16]
        strategy_val = getattr(self.config.query_strategy, "value", "passthrough")
        cache_key = f"{tenant_id}:{scope_hash}:{query}:{top_k}:{mode.value}:{strategy_val}"
        if self.config.use_cache and cache_key in self._cache:
            cached_result, cached_time = self._cache[cache_key]
            if (datetime.utcnow() - cached_time).total_seconds() < self.config.cache_ttl_seconds:
                logger.debug("cache_hit", query=query[:50])
                return cached_result

        start_time = datetime.utcnow()
        result = RAGResult(query=query, mode=mode)

        try:
            # Step 0: Query processing
            from app.orchestrator.rag.query_processor import ProcessedQuery, QueryStrategy as QS

            if mode == SearchMode.FAST:
                processed = ProcessedQuery(
                    original=query,
                    processed=query,
                    alternatives=[],
                    strategy_used="passthrough",
                    hypothetical_doc=None,
                )
            else:
                processed = await self.query_processor.process(
                    query=query,
                    strategy=self.config.query_strategy,
                )

            retrieval_query = processed.processed

            # Step 1: Retrieve candidates
            retrieval_start = datetime.utcnow()

            bm25_docs = []
            vector_docs = []

            if mode in [SearchMode.HYBRID, SearchMode.KEYWORD, SearchMode.FAST]:
                bm25_docs = await self.bm25_retriever.retrieve(
                    query=query,  # BM25 always uses original query (keyword matching)
                    top_k=top_k * 2,
                    filters=enforced_filters,
                )
                result.bm25_candidates = len(bm25_docs)

            if mode in [SearchMode.HYBRID, SearchMode.SEMANTIC, SearchMode.FAST]:
                vector_docs = await self.vector_retriever.retrieve(
                    query=retrieval_query,  # Vector uses processed query (may be HyDE doc)
                    top_k=top_k * 2,
                    filters=enforced_filters,
                )
                result.vector_candidates = len(vector_docs)
            
            retrieval_end = datetime.utcnow()
            result.retrieval_time_ms = int(
                (retrieval_end - retrieval_start).total_seconds() * 1000
            )
            
            # Step 2: Combine results using RRF
            if mode == SearchMode.KEYWORD:
                combined_docs = bm25_docs
            elif mode == SearchMode.SEMANTIC:
                combined_docs = vector_docs
            else:
                combined_docs = self._reciprocal_rank_fusion(
                    bm25_docs,
                    vector_docs,
                    k=self.config.rrf_k,
                    bm25_weight=self.config.bm25_weight,
                    vector_weight=self.config.vector_weight,
                )
            
            # Step 3: Rerank if enabled
            if self.config.use_rerank and mode == SearchMode.HYBRID:
                rerank_start = datetime.utcnow()
                
                # Take top candidates for reranking
                rerank_candidates = combined_docs[:top_k * 2]
                reranked_docs = await self.reranker.rerank(
                    query=query,
                    documents=rerank_candidates,
                    top_k=self.config.rerank_top_k,
                    effective_scopes=set(effective_scopes) if effective_scopes else None,
                )
                
                rerank_end = datetime.utcnow()
                result.rerank_time_ms = int(
                    (rerank_end - rerank_start).total_seconds() * 1000
                )
                
                result.documents = reranked_docs[:top_k]
            else:
                result.documents = combined_docs[:top_k]
            
            result.final_count = len(result.documents)
            
            # Calculate total time
            end_time = datetime.utcnow()
            result.total_time_ms = int(
                (end_time - start_time).total_seconds() * 1000
            )
            
            # Cache result
            if self.config.use_cache:
                self._cache[cache_key] = (result, datetime.utcnow())
            
            logger.info(
                "rag_retrieval_complete",
                query=query[:50],
                mode=mode.value,
                results=result.final_count,
                total_ms=result.total_time_ms,
            )

            # Bill for semantic/hybrid searches (BM25-only is free)
            if user_id and mode in (SearchMode.SEMANTIC, SearchMode.HYBRID, SearchMode.FAST):
                try:
                    from app.services.credit_billing_client import charge_credits_post_deduct
                    query_hash = hashlib.sha256(query.encode()).hexdigest()[:16]
                    ts_minute = int(time.time()) // 60
                    await charge_credits_post_deduct(
                        user_id=user_id,
                        amount=1,
                        service="rag.semantic_search",
                        idempotency_key=f"rag-search:{query_hash}:{user_id}:{ts_minute}",
                        source_type="rag",
                    )
                except Exception as billing_err:
                    logger.warning("rag_billing_failed", error=str(billing_err))

            return result
            
        except Exception as e:
            logger.error("rag_retrieval_error", query=query[:50], error=str(e))
            raise
    
    def _reciprocal_rank_fusion(
        self,
        bm25_docs: List[Document],
        vector_docs: List[Document],
        k: int = 60,
        bm25_weight: float = 0.3,
        vector_weight: float = 0.7,
    ) -> List[Document]:
        """
        Combine results using Reciprocal Rank Fusion.
        
        RRF Score = sum(weight / (k + rank))
        
        Args:
            bm25_docs: Documents from BM25
            vector_docs: Documents from vector search
            k: RRF constant (default 60)
            bm25_weight: Weight for BM25 results
            vector_weight: Weight for vector results
            
        Returns:
            Combined and ranked documents
        """
        doc_scores: Dict[str, float] = {}
        doc_map: Dict[str, Document] = {}
        
        # Score BM25 results
        for rank, doc in enumerate(bm25_docs, 1):
            score = bm25_weight / (k + rank)
            doc_scores[doc.doc_id] = doc_scores.get(doc.doc_id, 0) + score
            doc.bm25_score = 1 / rank  # Normalized rank score
            doc_map[doc.doc_id] = doc
        
        # Score vector results
        for rank, doc in enumerate(vector_docs, 1):
            score = vector_weight / (k + rank)
            doc_scores[doc.doc_id] = doc_scores.get(doc.doc_id, 0) + score
            
            if doc.doc_id in doc_map:
                doc_map[doc.doc_id].vector_score = 1 / rank
            else:
                doc.vector_score = 1 / rank
                doc_map[doc.doc_id] = doc
        
        # Update final scores and sort
        for doc_id, score in doc_scores.items():
            doc_map[doc_id].final_score = score
        
        sorted_docs = sorted(
            doc_map.values(),
            key=lambda d: d.final_score,
            reverse=True,
        )
        
        return sorted_docs
    
    async def clear_cache(self):
        """Clear the cache."""
        self._cache.clear()
        logger.info("rag_cache_cleared")
    
    async def get_stats(self) -> Dict[str, Any]:
        """Get RAG engine statistics."""
        return {
            "total_documents": len(self._documents),
            "cache_size": len(self._cache),
            "config": {
                "mode": self.config.mode.value,
                "top_k": self.config.top_k,
                "use_rerank": self.config.use_rerank,
            },
        }
    
    async def cleanup(self):
        """Cleanup resources."""
        self._cache.clear()
        self._documents.clear()
        
        if self._bm25_retriever:
            await self._bm25_retriever.cleanup()
        if self._vector_retriever:
            await self._vector_retriever.cleanup()
        if self._reranker:
            await self._reranker.cleanup()
        
        logger.info("hybrid_rag_cleanup_complete")
