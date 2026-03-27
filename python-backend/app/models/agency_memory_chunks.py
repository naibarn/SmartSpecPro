"""
Agency Memory Chunks — Level 2 raw output chunks for agency memory retrieval.

SQLAlchemy model for the agency_memory_chunks table (Drizzle-owned).
Uses plain columns without ForeignKey constraints for cross-schema references.
"""

from __future__ import annotations

from datetime import datetime, timezone
from uuid import uuid4

from sqlalchemy import (
    Column,
    DateTime,
    Index,
    Integer,
    String,
    Text,
)
from sqlalchemy.dialects.postgresql import JSONB

from app.core.database import Base

try:
    from pgvector.sqlalchemy import Vector

    _VECTOR_TYPE = Vector(1536)
except ImportError:
    from sqlalchemy import JSON

    _VECTOR_TYPE = JSON  # type: ignore[assignment]


class AgencyMemoryChunk(Base):
    """Raw agent output chunk stored for semantic fallback retrieval."""

    __tablename__ = "agency_memory_chunks"

    id = Column("id", Text, primary_key=True, default=lambda: str(uuid4()))
    tenant_id = Column("tenantId", String(36), nullable=False)
    agency_id = Column("agencyId", String(36), nullable=False)
    user_id = Column("userId", Integer, nullable=False)
    agent_node_id = Column("agentNodeId", Text, nullable=False)
    run_id = Column("runId", Text, nullable=False)
    source_node_id = Column("sourceNodeId", Text, nullable=False)
    chunk_index = Column("chunkIndex", Integer, nullable=False)
    content = Column("content", Text, nullable=False)
    embedding = Column("embedding", _VECTOR_TYPE, nullable=True)
    metadata_json = Column("metadata", JSONB, nullable=True)
    created_at = Column(
        "createdAt",
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )
    expires_at = Column(
        "expiresAt",
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    __table_args__ = (
        Index("memory_chunks_scope_idx", "tenantId", "agencyId", "agentNodeId", "userId"),
        Index("memory_chunks_expires_idx", "expiresAt"),
        Index("memory_chunks_run_idx", "runId", "sourceNodeId"),
    )

    def to_dict(self) -> dict:
        """Convert to camelCase dict for API responses."""
        return {
            "id": self.id,
            "tenantId": self.tenant_id,
            "agencyId": self.agency_id,
            "userId": self.user_id,
            "agentNodeId": self.agent_node_id,
            "runId": self.run_id,
            "sourceNodeId": self.source_node_id,
            "chunkIndex": self.chunk_index,
            "content": self.content,
            "metadata": self.metadata_json,
            "createdAt": self.created_at.isoformat() if self.created_at else None,
            "expiresAt": self.expires_at.isoformat() if self.expires_at else None,
        }
# mypy: ignore-errors
