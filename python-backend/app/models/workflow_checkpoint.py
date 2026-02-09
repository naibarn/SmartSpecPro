"""SQLAlchemy model for workflow execution checkpoints.

Provides persistent storage for user-controlled checkpoint nodes
within the workflow editor.
"""

import uuid
from datetime import datetime

from sqlalchemy import (
    Column,
    DateTime,
    Index,
    Integer,
    JSON,
    String,
)

from app.core.database import Base


class WorkflowExecutionCheckpoint(Base):
    """Stores execution state snapshots at user-defined checkpoint nodes."""

    __tablename__ = "workflow_execution_checkpoints"

    # Primary key -- UUID string
    id = Column(
        String(36),
        primary_key=True,
        default=lambda: str(uuid.uuid4()),
    )

    # Workflow reference (Workflow.id is Integer in workflows table)
    workflow_id = Column(Integer, nullable=False, index=True)

    # Execution reference (WorkflowExecution.id is String(20))
    execution_id = Column(String(20), nullable=False, index=True)

    # User-assigned checkpoint name (unique per workflow)
    checkpoint_name = Column(String(255), nullable=False)

    # Serialized state snapshot (max 1 MB enforced at application layer)
    state_data = Column(JSON, nullable=True)

    # Serialized node output data
    node_data = Column(JSON, nullable=True)

    # Size of state_data in bytes (for monitoring and limit enforcement)
    state_size_bytes = Column(Integer, nullable=False, default=0)

    # Metadata
    node_id = Column(String(255), nullable=True)  # Node that created the checkpoint
    created_by_user_id = Column(Integer, nullable=True)
    tenant_id = Column(String(36), nullable=True)

    created_at = Column(
        DateTime, nullable=False, default=datetime.utcnow
    )

    __table_args__ = (
        # Unique constraint: one checkpoint name per workflow
        Index(
            "uq_wec_workflow_checkpoint_name",
            "workflow_id",
            "checkpoint_name",
            unique=True,
        ),
        # Query pattern: list checkpoints for a workflow, newest first
        Index(
            "ix_wec_workflow_created",
            "workflow_id",
            "created_at",
        ),
        # Query pattern: list checkpoints for an execution
        Index(
            "ix_wec_execution",
            "execution_id",
        ),
        # Tenant isolation
        Index(
            "ix_wec_tenant",
            "tenant_id",
        ),
    )

    def to_dict(self) -> dict:
        """Convert to API response dictionary."""
        return {
            "id": self.id,
            "workflow_id": self.workflow_id,
            "execution_id": self.execution_id,
            "checkpoint_name": self.checkpoint_name,
            "state_size_bytes": self.state_size_bytes,
            "node_id": self.node_id,
            "created_by_user_id": self.created_by_user_id,
            "tenant_id": self.tenant_id,
            "created_at": (
                self.created_at.isoformat() + "Z" if self.created_at else None
            ),
            # state_data and node_data are intentionally excluded from the
            # default dict to avoid large payloads in list responses.
            # Use to_full_dict() when the caller needs state.
        }

    def to_full_dict(self) -> dict:
        """Convert to dictionary including state and node data."""
        d = self.to_dict()
        d["state_data"] = self.state_data
        d["node_data"] = self.node_data
        return d
