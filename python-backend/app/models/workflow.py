"""SQLAlchemy model for workflows."""
from datetime import datetime
from sqlalchemy import Column, DateTime, ForeignKey, Integer, String, Text, Index, JSON
from sqlalchemy.orm import relationship

from app.core.database import Base


class Workflow(Base):
    """Workflow model - Workflow definitions."""

    __tablename__ = "workflows"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    workflowJson = Column(JSON, nullable=False)
    userId = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    tenantId = Column(String(36), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=True)
    status = Column(String(20), nullable=False, default="draft")
    lastCompiledAt = Column(DateTime(timezone=True), nullable=True)
    schemaVersion = Column(String(10), nullable=False, default="1.0")
    createdAt = Column(DateTime(timezone=True), nullable=False, default=datetime.utcnow)
    updatedAt = Column(DateTime(timezone=True), nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Indexes (defined in table args)
    __table_args__ = (
        Index("workflows_user_idx", "userId"),
        Index("workflows_tenant_idx", "tenantId"),
        Index("workflows_status_idx", "status"),
    )
