"""
SmartSpec Pro - Hybrid RAG Module
Phase 2: Quality & Intelligence

Hybrid Retrieval-Augmented Generation combining:
- BM25 (keyword-based search)
- Vector Search (semantic similarity)
- Re-ranking (cross-encoder)

This module provides intelligent context retrieval for the orchestrator.
"""

from app.orchestrator.rag.hybrid_rag import (
    HybridRAGEngine,
    RAGResult,
    RAGConfig,
    SearchMode,
)
from app.orchestrator.rag.bm25_retriever import BM25Retriever
from app.orchestrator.rag.vector_retriever import VectorRetriever
from app.orchestrator.rag.reranker import Reranker, RerankStrategy
from app.orchestrator.rag.scope_engine import (
    compute_effective_scopes,
    recompute_allowed_scopes,
    propagate_scopes_to_vector_stores,
    invalidate_rag_cache_for_item,
    handle_permission_change,
)
from app.orchestrator.rag.query_processor import (
    QueryProcessor,
    QueryStrategy,
    ProcessedQuery,
)
from app.orchestrator.rag.guardrails import (
    RetrievalGuardrails,
    RetrievalQuality,
    QualityAssessment,
)
from app.orchestrator.rag.query_router import QueryRouter, QueryIntent

__all__ = [
    "HybridRAGEngine",
    "RAGResult",
    "RAGConfig",
    "SearchMode",
    "BM25Retriever",
    "VectorRetriever",
    "Reranker",
    "RerankStrategy",
    "compute_effective_scopes",
    "recompute_allowed_scopes",
    "propagate_scopes_to_vector_stores",
    "invalidate_rag_cache_for_item",
    "handle_permission_change",
    "QueryProcessor",
    "QueryStrategy",
    "ProcessedQuery",
    "RetrievalGuardrails",
    "RetrievalQuality",
    "QualityAssessment",
    "QueryRouter",
    "QueryIntent",
]
