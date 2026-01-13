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
from app.orchestrator.rag.reranker import Reranker

__all__ = [
    "HybridRAGEngine",
    "RAGResult",
    "RAGConfig",
    "SearchMode",
    "BM25Retriever",
    "VectorRetriever",
    "Reranker",
]
