"""
SmartSpec Pro - Vector Store Module
Phase 3: SaaS Readiness

Production-grade vector storage using pgvector:
- Efficient vector similarity search
- Hybrid search (vector + keyword)
- Multi-tenant isolation
- Index management
"""

from .pgvector_store import (
    PgVectorStore,
    VectorDocument,
    SearchResult,
    SearchMode,
    get_vector_store,
)
from .embedding_service import (
    EmbeddingService,
    EmbeddingModel,
    get_embedding_service,
)
from .index_manager import (
    IndexManager,
    IndexConfig,
    IndexType,
)

__all__ = [
    # Store
    "PgVectorStore",
    "VectorDocument",
    "SearchResult",
    "SearchMode",
    "get_vector_store",
    # Embedding
    "EmbeddingService",
    "EmbeddingModel",
    "get_embedding_service",
    # Index
    "IndexManager",
    "IndexConfig",
    "IndexType",
]
