"""
PgVector Store for Production Vector Storage
Phase 3: SaaS Readiness
"""

import structlog
from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from typing import Optional, Dict, Any, List, Tuple
import uuid
import json

logger = structlog.get_logger(__name__)


class SearchMode(str, Enum):
    """Search modes for vector store."""
    VECTOR = "vector"  # Pure vector similarity
    KEYWORD = "keyword"  # Full-text search
    HYBRID = "hybrid"  # Combined vector + keyword


class DistanceMetric(str, Enum):
    """Distance metrics for vector similarity."""
    COSINE = "cosine"
    L2 = "l2"
    INNER_PRODUCT = "inner_product"


@dataclass
class VectorDocument:
    """
    A document stored in the vector store.
    """
    
    doc_id: str = field(default_factory=lambda: str(uuid.uuid4()))
    
    # Content
    content: str = ""
    embedding: Optional[List[float]] = None
    
    # Metadata
    metadata: Dict[str, Any] = field(default_factory=dict)
    
    # Multi-tenancy
    tenant_id: Optional[str] = None
    project_id: Optional[str] = None
    
    # Classification
    doc_type: str = "document"  # document, code, memory, etc.
    source: str = ""  # Source file or URL
    
    # Timestamps
    created_at: datetime = field(default_factory=datetime.utcnow)
    updated_at: datetime = field(default_factory=datetime.utcnow)
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary."""
        return {
            "doc_id": self.doc_id,
            "content": self.content,
            "metadata": self.metadata,
            "tenant_id": self.tenant_id,
            "project_id": self.project_id,
            "doc_type": self.doc_type,
            "source": self.source,
            "created_at": self.created_at.isoformat(),
            "updated_at": self.updated_at.isoformat(),
        }


@dataclass
class SearchResult:
    """
    A search result from the vector store.
    """
    
    document: VectorDocument
    score: float
    distance: float
    rank: int
    
    # Hybrid search scores
    vector_score: Optional[float] = None
    keyword_score: Optional[float] = None
    
    # Highlighted content
    highlights: List[str] = field(default_factory=list)
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary."""
        return {
            "document": self.document.to_dict(),
            "score": self.score,
            "distance": self.distance,
            "rank": self.rank,
            "vector_score": self.vector_score,
            "keyword_score": self.keyword_score,
            "highlights": self.highlights,
        }


class PgVectorStore:
    """
    Production-grade vector store using pgvector.
    
    Features:
    - Vector similarity search
    - Full-text search
    - Hybrid search
    - Multi-tenant isolation
    - Automatic index management
    """
    
    def __init__(
        self,
        connection_string: Optional[str] = None,
        table_name: str = "vector_documents",
        embedding_dimension: int = 1536,
        distance_metric: DistanceMetric = DistanceMetric.COSINE,
    ):
        """
        Initialize vector store.
        
        Args:
            connection_string: PostgreSQL connection string
            table_name: Table name for documents
            embedding_dimension: Dimension of embeddings
            distance_metric: Distance metric for similarity
        """
        self.connection_string = connection_string
        self.table_name = table_name
        self.embedding_dimension = embedding_dimension
        self.distance_metric = distance_metric
        
        self._connection = None
        self._logger = logger.bind(component="pgvector_store")
        
        # In-memory fallback for development
        self._documents: Dict[str, VectorDocument] = {}
        self._use_memory = connection_string is None
    
    async def initialize(self) -> None:
        """Initialize the vector store (create tables, indexes)."""
        if self._use_memory:
            self._logger.info("using_memory_store")
            return
        
        try:
            import asyncpg
            
            self._connection = await asyncpg.connect(self.connection_string)
            
            # Enable pgvector extension
            await self._connection.execute("CREATE EXTENSION IF NOT EXISTS vector")
            
            # Create table
            await self._connection.execute(f"""
                CREATE TABLE IF NOT EXISTS {self.table_name} (
                    doc_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                    content TEXT NOT NULL,
                    embedding vector({self.embedding_dimension}),
                    metadata JSONB DEFAULT '{{}}',
                    tenant_id VARCHAR(255),
                    project_id VARCHAR(255),
                    doc_type VARCHAR(100) DEFAULT 'document',
                    source TEXT,
                    created_at TIMESTAMP DEFAULT NOW(),
                    updated_at TIMESTAMP DEFAULT NOW(),
                    search_vector tsvector GENERATED ALWAYS AS (
                        to_tsvector('english', content)
                    ) STORED
                )
            """)
            
            # Create indexes
            await self._create_indexes()
            
            self._logger.info("pgvector_initialized", table=self.table_name)
            
        except ImportError:
            self._logger.warning("asyncpg_not_installed", fallback="memory")
            self._use_memory = True
        except Exception as e:
            self._logger.error("initialization_failed", error=str(e))
            self._use_memory = True
    
    async def _create_indexes(self) -> None:
        """Create necessary indexes."""
        if self._use_memory or not self._connection:
            return
        
        # Vector index (IVFFlat for approximate search)
        await self._connection.execute(f"""
            CREATE INDEX IF NOT EXISTS idx_{self.table_name}_embedding
            ON {self.table_name}
            USING ivfflat (embedding vector_cosine_ops)
            WITH (lists = 100)
        """)
        
        # Full-text search index
        await self._connection.execute(f"""
            CREATE INDEX IF NOT EXISTS idx_{self.table_name}_search
            ON {self.table_name}
            USING gin(search_vector)
        """)
        
        # Tenant index
        await self._connection.execute(f"""
            CREATE INDEX IF NOT EXISTS idx_{self.table_name}_tenant
            ON {self.table_name}(tenant_id)
        """)
        
        # Project index
        await self._connection.execute(f"""
            CREATE INDEX IF NOT EXISTS idx_{self.table_name}_project
            ON {self.table_name}(project_id)
        """)
    
    async def close(self) -> None:
        """Close the connection."""
        if self._connection:
            await self._connection.close()
            self._connection = None
    
    # ==================== CRUD Operations ====================
    
    async def add_document(
        self,
        content: str,
        embedding: List[float],
        metadata: Optional[Dict[str, Any]] = None,
        tenant_id: Optional[str] = None,
        project_id: Optional[str] = None,
        doc_type: str = "document",
        source: str = "",
        doc_id: Optional[str] = None,
    ) -> VectorDocument:
        """
        Add a document to the store.
        
        Args:
            content: Document content
            embedding: Vector embedding
            metadata: Optional metadata
            tenant_id: Tenant ID
            project_id: Project ID
            doc_type: Document type
            source: Source reference
            doc_id: Optional document ID
        
        Returns:
            Created document
        """
        doc = VectorDocument(
            doc_id=doc_id or str(uuid.uuid4()),
            content=content,
            embedding=embedding,
            metadata=metadata or {},
            tenant_id=tenant_id,
            project_id=project_id,
            doc_type=doc_type,
            source=source,
        )
        
        if self._use_memory:
            self._documents[doc.doc_id] = doc
        else:
            await self._connection.execute(f"""
                INSERT INTO {self.table_name}
                (doc_id, content, embedding, metadata, tenant_id, project_id, doc_type, source)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            """,
                uuid.UUID(doc.doc_id),
                content,
                embedding,
                json.dumps(metadata or {}),
                tenant_id,
                project_id,
                doc_type,
                source,
            )
        
        self._logger.debug(
            "document_added",
            doc_id=doc.doc_id,
            tenant_id=tenant_id,
        )
        
        return doc
    
    async def add_documents(
        self,
        documents: List[Tuple[str, List[float], Dict[str, Any]]],
        tenant_id: Optional[str] = None,
        project_id: Optional[str] = None,
    ) -> List[VectorDocument]:
        """
        Add multiple documents in batch.
        
        Args:
            documents: List of (content, embedding, metadata) tuples
            tenant_id: Tenant ID
            project_id: Project ID
        
        Returns:
            List of created documents
        """
        results = []
        
        for content, embedding, metadata in documents:
            doc = await self.add_document(
                content=content,
                embedding=embedding,
                metadata=metadata,
                tenant_id=tenant_id,
                project_id=project_id,
            )
            results.append(doc)
        
        self._logger.info(
            "documents_added",
            count=len(results),
            tenant_id=tenant_id,
        )
        
        return results
    
    async def get_document(self, doc_id: str) -> Optional[VectorDocument]:
        """Get a document by ID."""
        if self._use_memory:
            return self._documents.get(doc_id)
        
        row = await self._connection.fetchrow(f"""
            SELECT * FROM {self.table_name} WHERE doc_id = $1
        """, uuid.UUID(doc_id))
        
        if row:
            return self._row_to_document(row)
        return None
    
    async def update_document(
        self,
        doc_id: str,
        content: Optional[str] = None,
        embedding: Optional[List[float]] = None,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> Optional[VectorDocument]:
        """Update a document."""
        if self._use_memory:
            doc = self._documents.get(doc_id)
            if doc:
                if content:
                    doc.content = content
                if embedding:
                    doc.embedding = embedding
                if metadata:
                    doc.metadata.update(metadata)
                doc.updated_at = datetime.utcnow()
            return doc
        
        # Build update query
        updates = []
        params = []
        param_idx = 1
        
        if content:
            updates.append(f"content = ${param_idx}")
            params.append(content)
            param_idx += 1
        
        if embedding:
            updates.append(f"embedding = ${param_idx}")
            params.append(embedding)
            param_idx += 1
        
        if metadata:
            updates.append(f"metadata = metadata || ${param_idx}")
            params.append(json.dumps(metadata))
            param_idx += 1
        
        if not updates:
            return await self.get_document(doc_id)
        
        updates.append("updated_at = NOW()")
        params.append(uuid.UUID(doc_id))
        
        await self._connection.execute(f"""
            UPDATE {self.table_name}
            SET {', '.join(updates)}
            WHERE doc_id = ${param_idx}
        """, *params)
        
        return await self.get_document(doc_id)
    
    async def delete_document(self, doc_id: str) -> bool:
        """Delete a document."""
        if self._use_memory:
            if doc_id in self._documents:
                del self._documents[doc_id]
                return True
            return False
        
        result = await self._connection.execute(f"""
            DELETE FROM {self.table_name} WHERE doc_id = $1
        """, uuid.UUID(doc_id))
        
        return "DELETE 1" in result
    
    async def delete_by_tenant(self, tenant_id: str) -> int:
        """Delete all documents for a tenant."""
        if self._use_memory:
            to_delete = [
                doc_id for doc_id, doc in self._documents.items()
                if doc.tenant_id == tenant_id
            ]
            for doc_id in to_delete:
                del self._documents[doc_id]
            return len(to_delete)
        
        result = await self._connection.execute(f"""
            DELETE FROM {self.table_name} WHERE tenant_id = $1
        """, tenant_id)
        
        # Parse "DELETE n" to get count
        count = int(result.split()[1]) if result else 0
        self._logger.info("documents_deleted", tenant_id=tenant_id, count=count)
        return count
    
    # ==================== Search Operations ====================
    
    async def search(
        self,
        query_embedding: List[float],
        query_text: Optional[str] = None,
        mode: SearchMode = SearchMode.HYBRID,
        tenant_id: Optional[str] = None,
        project_id: Optional[str] = None,
        doc_types: Optional[List[str]] = None,
        limit: int = 10,
        threshold: float = 0.0,
        metadata_filter: Optional[Dict[str, Any]] = None,
    ) -> List[SearchResult]:
        """
        Search for similar documents.
        
        Args:
            query_embedding: Query vector
            query_text: Query text for keyword search
            mode: Search mode
            tenant_id: Filter by tenant
            project_id: Filter by project
            doc_types: Filter by document types
            limit: Maximum results
            threshold: Minimum similarity score
            metadata_filter: Filter by metadata
        
        Returns:
            List of search results
        """
        if self._use_memory:
            return await self._search_memory(
                query_embedding=query_embedding,
                query_text=query_text,
                mode=mode,
                tenant_id=tenant_id,
                project_id=project_id,
                doc_types=doc_types,
                limit=limit,
                threshold=threshold,
            )
        
        return await self._search_pgvector(
            query_embedding=query_embedding,
            query_text=query_text,
            mode=mode,
            tenant_id=tenant_id,
            project_id=project_id,
            doc_types=doc_types,
            limit=limit,
            threshold=threshold,
            metadata_filter=metadata_filter,
        )
    
    async def _search_memory(
        self,
        query_embedding: List[float],
        query_text: Optional[str],
        mode: SearchMode,
        tenant_id: Optional[str],
        project_id: Optional[str],
        doc_types: Optional[List[str]],
        limit: int,
        threshold: float,
    ) -> List[SearchResult]:
        """In-memory search implementation."""
        import math
        
        results = []
        
        for doc in self._documents.values():
            # Apply filters
            if tenant_id and doc.tenant_id != tenant_id:
                continue
            if project_id and doc.project_id != project_id:
                continue
            if doc_types and doc.doc_type not in doc_types:
                continue
            
            # Calculate vector similarity
            vector_score = 0.0
            if doc.embedding and mode in [SearchMode.VECTOR, SearchMode.HYBRID]:
                vector_score = self._cosine_similarity(query_embedding, doc.embedding)
            
            # Calculate keyword score
            keyword_score = 0.0
            if query_text and mode in [SearchMode.KEYWORD, SearchMode.HYBRID]:
                keyword_score = self._keyword_score(query_text, doc.content)
            
            # Combined score
            if mode == SearchMode.HYBRID:
                score = 0.7 * vector_score + 0.3 * keyword_score
            elif mode == SearchMode.VECTOR:
                score = vector_score
            else:
                score = keyword_score
            
            if score >= threshold:
                results.append(SearchResult(
                    document=doc,
                    score=score,
                    distance=1 - vector_score,
                    rank=0,
                    vector_score=vector_score,
                    keyword_score=keyword_score,
                ))
        
        # Sort by score
        results.sort(key=lambda r: r.score, reverse=True)
        
        # Assign ranks
        for i, result in enumerate(results[:limit]):
            result.rank = i + 1
        
        return results[:limit]
    
    async def _search_pgvector(
        self,
        query_embedding: List[float],
        query_text: Optional[str],
        mode: SearchMode,
        tenant_id: Optional[str],
        project_id: Optional[str],
        doc_types: Optional[List[str]],
        limit: int,
        threshold: float,
        metadata_filter: Optional[Dict[str, Any]],
    ) -> List[SearchResult]:
        """pgvector search implementation."""
        # Build WHERE clause
        conditions = []
        params = [query_embedding]
        param_idx = 2
        
        if tenant_id:
            conditions.append(f"tenant_id = ${param_idx}")
            params.append(tenant_id)
            param_idx += 1
        
        if project_id:
            conditions.append(f"project_id = ${param_idx}")
            params.append(project_id)
            param_idx += 1
        
        if doc_types:
            conditions.append(f"doc_type = ANY(${param_idx})")
            params.append(doc_types)
            param_idx += 1
        
        if metadata_filter:
            conditions.append(f"metadata @> ${param_idx}")
            params.append(json.dumps(metadata_filter))
            param_idx += 1
        
        where_clause = " AND ".join(conditions) if conditions else "TRUE"
        
        # Build query based on mode
        if mode == SearchMode.VECTOR:
            query = f"""
                SELECT *,
                    1 - (embedding <=> $1) as vector_score,
                    0 as keyword_score,
                    1 - (embedding <=> $1) as score
                FROM {self.table_name}
                WHERE {where_clause}
                ORDER BY embedding <=> $1
                LIMIT {limit}
            """
        elif mode == SearchMode.KEYWORD and query_text:
            params.append(query_text)
            query = f"""
                SELECT *,
                    0 as vector_score,
                    ts_rank(search_vector, plainto_tsquery('english', ${param_idx})) as keyword_score,
                    ts_rank(search_vector, plainto_tsquery('english', ${param_idx})) as score
                FROM {self.table_name}
                WHERE {where_clause}
                    AND search_vector @@ plainto_tsquery('english', ${param_idx})
                ORDER BY keyword_score DESC
                LIMIT {limit}
            """
        else:  # HYBRID
            params.append(query_text or "")
            query = f"""
                SELECT *,
                    1 - (embedding <=> $1) as vector_score,
                    ts_rank(search_vector, plainto_tsquery('english', ${param_idx})) as keyword_score,
                    0.7 * (1 - (embedding <=> $1)) + 
                    0.3 * ts_rank(search_vector, plainto_tsquery('english', ${param_idx})) as score
                FROM {self.table_name}
                WHERE {where_clause}
                ORDER BY score DESC
                LIMIT {limit}
            """
        
        rows = await self._connection.fetch(query, *params)
        
        results = []
        for i, row in enumerate(rows):
            doc = self._row_to_document(row)
            results.append(SearchResult(
                document=doc,
                score=row["score"],
                distance=1 - row["vector_score"],
                rank=i + 1,
                vector_score=row["vector_score"],
                keyword_score=row["keyword_score"],
            ))
        
        return results
    
    def _cosine_similarity(self, a: List[float], b: List[float]) -> float:
        """Calculate cosine similarity between two vectors."""
        import math
        
        dot_product = sum(x * y for x, y in zip(a, b))
        norm_a = math.sqrt(sum(x * x for x in a))
        norm_b = math.sqrt(sum(x * x for x in b))
        
        if norm_a == 0 or norm_b == 0:
            return 0.0
        
        return dot_product / (norm_a * norm_b)
    
    def _keyword_score(self, query: str, content: str) -> float:
        """Simple keyword matching score."""
        query_terms = set(query.lower().split())
        content_terms = set(content.lower().split())
        
        if not query_terms:
            return 0.0
        
        matches = len(query_terms & content_terms)
        return matches / len(query_terms)
    
    def _row_to_document(self, row) -> VectorDocument:
        """Convert database row to VectorDocument."""
        return VectorDocument(
            doc_id=str(row["doc_id"]),
            content=row["content"],
            embedding=list(row["embedding"]) if row.get("embedding") else None,
            metadata=json.loads(row["metadata"]) if isinstance(row["metadata"], str) else row["metadata"],
            tenant_id=row["tenant_id"],
            project_id=row["project_id"],
            doc_type=row["doc_type"],
            source=row["source"],
            created_at=row["created_at"],
            updated_at=row["updated_at"],
        )
    
    # ==================== Statistics ====================
    
    async def get_stats(
        self,
        tenant_id: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Get store statistics."""
        if self._use_memory:
            docs = list(self._documents.values())
            if tenant_id:
                docs = [d for d in docs if d.tenant_id == tenant_id]
            
            return {
                "total_documents": len(docs),
                "by_type": {},
                "storage_type": "memory",
            }
        
        # Get counts by type
        query = f"""
            SELECT doc_type, COUNT(*) as count
            FROM {self.table_name}
            {"WHERE tenant_id = $1" if tenant_id else ""}
            GROUP BY doc_type
        """
        
        params = [tenant_id] if tenant_id else []
        rows = await self._connection.fetch(query, *params)
        
        by_type = {row["doc_type"]: row["count"] for row in rows}
        total = sum(by_type.values())
        
        return {
            "total_documents": total,
            "by_type": by_type,
            "storage_type": "pgvector",
            "embedding_dimension": self.embedding_dimension,
        }


# Global instance
_vector_store: Optional[PgVectorStore] = None


def get_vector_store() -> PgVectorStore:
    """Get global vector store instance."""
    global _vector_store
    if _vector_store is None:
        _vector_store = PgVectorStore()
    return _vector_store
