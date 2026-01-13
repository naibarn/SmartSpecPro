"""
SmartSpec Pro - Vector Store Database Models
Phase 3: pgvector Integration
"""

from datetime import datetime
from typing import Optional
from sqlalchemy import (
    Column,
    String,
    DateTime,
    Boolean,
    Integer,
    Text,
    JSON,
    ForeignKey,
    Index,
    Float,
    Enum as SQLEnum,
)
import enum

from app.core.database import Base


class VectorIndexType(str, enum.Enum):
    """Vector index type enum."""
    FLAT = "flat"
    IVFFLAT = "ivfflat"
    HNSW = "hnsw"


class VectorCollection(Base):
    """
    Vector collection model.
    Groups related vectors together for efficient querying.
    """
    __tablename__ = "vector_collections"

    id = Column(String(36), primary_key=True)
    name = Column(String(100), nullable=False)
    description = Column(Text, nullable=True)
    
    # Scope
    tenant_id = Column(String(36), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=True)
    project_id = Column(String(36), nullable=True)
    
    # Configuration
    dimension = Column(Integer, nullable=False, default=1536)  # OpenAI default
    distance_metric = Column(String(20), default="cosine")  # cosine, euclidean, inner_product
    
    # Index configuration
    index_type = Column(SQLEnum(VectorIndexType), default=VectorIndexType.HNSW)
    index_params = Column(JSON, default=dict)  # e.g., {"m": 16, "ef_construction": 64}
    
    # Statistics
    vector_count = Column(Integer, default=0)
    total_size_bytes = Column(Integer, default=0)
    
    # Status
    is_indexed = Column(Boolean, default=False)
    last_indexed_at = Column(DateTime, nullable=True)
    
    # Timestamps
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Indexes
    __table_args__ = (
        Index("idx_vector_collection_name", "name"),
        Index("idx_vector_collection_tenant", "tenant_id"),
        Index("idx_vector_collection_tenant_name", "tenant_id", "name", unique=True),
    )


class VectorDocument(Base):
    """
    Vector document model.
    Stores document content and its vector embedding.
    
    Note: The actual vector is stored in a separate pgvector-enabled table
    for efficient similarity search. This table stores metadata.
    """
    __tablename__ = "vector_documents"

    id = Column(String(36), primary_key=True)
    collection_id = Column(String(36), ForeignKey("vector_collections.id", ondelete="CASCADE"), nullable=False)
    
    # Content
    content = Column(Text, nullable=False)
    content_hash = Column(String(64), nullable=True)  # SHA-256 for deduplication
    
    # Metadata
    metadata = Column(JSON, default=dict)
    source = Column(String(255), nullable=True)  # Source file/URL
    source_type = Column(String(50), nullable=True)  # file, url, api, manual
    
    # Chunking info
    chunk_index = Column(Integer, default=0)
    parent_id = Column(String(36), nullable=True)  # Reference to parent document
    
    # Embedding info
    embedding_model = Column(String(100), nullable=True)
    embedding_dimension = Column(Integer, nullable=True)
    
    # Timestamps
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Indexes
    __table_args__ = (
        Index("idx_vector_document_collection", "collection_id"),
        Index("idx_vector_document_hash", "content_hash"),
        Index("idx_vector_document_source", "source"),
    )


class EmbeddingJob(Base):
    """
    Embedding job model.
    Tracks batch embedding operations.
    """
    __tablename__ = "embedding_jobs"

    id = Column(String(36), primary_key=True)
    collection_id = Column(String(36), ForeignKey("vector_collections.id", ondelete="CASCADE"), nullable=False)
    
    # Job details
    status = Column(String(20), default="pending")  # pending, processing, completed, failed
    total_documents = Column(Integer, default=0)
    processed_documents = Column(Integer, default=0)
    failed_documents = Column(Integer, default=0)
    
    # Configuration
    embedding_model = Column(String(100), nullable=False)
    batch_size = Column(Integer, default=100)
    
    # Error tracking
    error_message = Column(Text, nullable=True)
    errors = Column(JSON, default=list)
    
    # Timestamps
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    started_at = Column(DateTime, nullable=True)
    completed_at = Column(DateTime, nullable=True)
    
    # Indexes
    __table_args__ = (
        Index("idx_embedding_job_collection", "collection_id"),
        Index("idx_embedding_job_status", "status"),
    )
