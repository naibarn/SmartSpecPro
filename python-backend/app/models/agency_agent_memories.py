"""
Agency Agent Memories — Long-term learnings extracted from agent runs.

SQLAlchemy model for the agency_agent_memories table (Drizzle-owned).
Uses plain columns without ForeignKey constraints for cross-schema references.
"""

import enum
from datetime import datetime, timezone

from sqlalchemy import (
    Boolean,
    Column,
    DateTime,
    Index,
    Integer,
    Numeric,
    String,
    Text,
    UniqueConstraint,
)

from app.core.database import Base


class MemoryType(str, enum.Enum):
    """Type categories for agent memories."""

    constraint = "constraint"
    preference = "preference"
    fact = "fact"
    skill = "skill"


class AgencyAgentMemory(Base):
    """Long-term memory entry for an agency agent, scoped per-user."""

    __tablename__ = "agency_agent_memories"

    id = Column("id", Integer, primary_key=True, autoincrement=True)
    tenant_id = Column("tenantId", String(36), nullable=False)
    agency_id = Column("agencyId", String(36), nullable=False)
    user_id = Column("userId", Integer, nullable=False)
    agent_node_id = Column("agentNodeId", Text, nullable=False)
    memory_type = Column("memoryType", String(20), nullable=False)
    content = Column("content", Text, nullable=False)
    content_hash = Column("contentHash", Text, nullable=False)
    source_run_id = Column("sourceRunId", Text, nullable=True)
    confidence = Column("confidence", Numeric(4, 3), default=1.0)
    use_count = Column("useCount", Integer, default=0, nullable=False)
    last_used_at = Column("lastUsedAt", DateTime(timezone=True), nullable=True)
    created_at = Column(
        "createdAt",
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )
    updated_at = Column(
        "updatedAt",
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
        nullable=False,
    )
    is_active = Column("isActive", Boolean, default=True, nullable=False)

    __table_args__ = (
        Index(
            "ix_agent_memories_lookup",
            "tenantId", "agencyId", "agentNodeId", "userId", "isActive",
        ),
        UniqueConstraint(
            "tenantId", "agencyId", "agentNodeId", "userId", "contentHash",
            name="uq_agent_memories_content",
        ),
    )

    def to_dict(self) -> dict:
        """Convert to camelCase dict for API responses."""
        return {
            "id": self.id,
            "tenantId": self.tenant_id,
            "agencyId": self.agency_id,
            "userId": self.user_id,
            "agentNodeId": self.agent_node_id,
            "memoryType": self.memory_type,
            "content": self.content,
            "contentHash": self.content_hash,
            "sourceRunId": self.source_run_id,
            "confidence": float(self.confidence) if self.confidence else 1.0,
            "useCount": self.use_count or 0,
            "lastUsedAt": self.last_used_at.isoformat() if self.last_used_at else None,
            "createdAt": self.created_at.isoformat() if self.created_at else None,
            "updatedAt": self.updated_at.isoformat() if self.updated_at else None,
            "isActive": self.is_active,
        }
