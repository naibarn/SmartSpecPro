"""Dead Letter Queue model for failed workflow nodes.

Section 13: Database Schema
"""

from datetime import datetime
from sqlalchemy import Column, String, Integer, DateTime, JSON, Text, Index
from app.core.database import Base


class WorkflowDeadLetterQueue(Base):
    """Stores failed node executions for manual review and reprocessing."""

    __tablename__ = "workflow_dead_letter_queue"

    # Primary key
    id = Column(Integer, primary_key=True, autoincrement=True)

    # Workflow and execution context
    workflow_id = Column(String, nullable=True, index=True)
    execution_id = Column(String(20), nullable=False, index=True)
    node_id = Column(String, nullable=False)

    # Tenant isolation
    tenant_id = Column(String, nullable=False, index=True)

    # Failed node data
    input_data = Column(JSON, nullable=False, default=dict)
    error = Column(Text, nullable=False)

    # Retry tracking
    retry_count = Column(Integer, default=0, nullable=False)
    status = Column(
        String(20),
        default="pending",
        nullable=False,
        index=True,
    )  # pending, reprocessing, reprocessed, discarded

    # Timestamps
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Indexes for common queries
    __table_args__ = (
        Index("ix_workflow_dlq_tenant_status", "tenant_id", "status"),
        Index("ix_workflow_dlq_workflow_status", "workflow_id", "status"),
    )

    def to_dict(self):
        """Convert to dictionary."""
        return {
            "id": str(self.id),
            "workflow_id": self.workflow_id,
            "execution_id": self.execution_id,
            "node_id": self.node_id,
            "tenant_id": self.tenant_id,
            "input_data": self.input_data,
            "error": self.error,
            "retry_count": self.retry_count,
            "status": self.status,
            "created_at": self.created_at.isoformat() + "Z" if self.created_at else None,
            "updated_at": self.updated_at.isoformat() + "Z" if self.updated_at else None,
        }
