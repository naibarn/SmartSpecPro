"""Workflow execution tracking model for LangGraph runtime.

Section 13: Database Schema
"""

from datetime import datetime
from sqlalchemy import Column, String, Integer, DateTime, JSON, Text, Index
from app.core.database import Base


class WorkflowExecution(Base):
    """Tracks workflow executions in the LangGraph runtime."""

    __tablename__ = "workflow_executions"

    # Primary key
    id = Column(String(20), primary_key=True)  # exec-{12 hex chars}

    # Workflow reference
    workflow_id = Column(String, nullable=True, index=True)

    # Tenant isolation
    tenant_id = Column(String, nullable=False, index=True)
    user_id = Column(Integer, nullable=False, index=True)

    # Execution state
    status = Column(
        String(20),
        default="running",
        nullable=False,
        index=True,
    )  # running, interrupted, completed, failed

    # Input/output data
    input_data = Column(JSON, nullable=False, default=dict)
    output_data = Column(JSON, nullable=True)

    # Timing
    started_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    completed_at = Column(DateTime, nullable=True)

    # Error handling
    error = Column(Text, nullable=True)

    # Metrics
    node_count = Column(Integer, nullable=True)
    credits_used = Column(Integer, default=0)

    # Indexes for common queries
    __table_args__ = (
        Index("ix_workflow_executions_tenant_status", "tenant_id", "status"),
        Index("ix_workflow_executions_user_status", "user_id", "status"),
    )

    def to_dict(self):
        """Convert to dictionary."""
        return {
            "id": self.id,
            "workflow_id": self.workflow_id,
            "tenant_id": self.tenant_id,
            "user_id": self.user_id,
            "status": self.status,
            "input_data": self.input_data,
            "output_data": self.output_data,
            "started_at": self.started_at.isoformat() + "Z" if self.started_at else None,
            "completed_at": self.completed_at.isoformat() + "Z" if self.completed_at else None,
            "error": self.error,
            "node_count": self.node_count,
            "credits_used": self.credits_used,
        }
