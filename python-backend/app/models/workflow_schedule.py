"""SQLAlchemy model for workflow schedules."""
from datetime import datetime
from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Integer, String, Index
from sqlalchemy.orm import relationship

from app.core.database import Base


class WorkflowSchedule(Base):
    """Workflow Schedule model - Cron-based workflow triggers."""

    __tablename__ = "workflow_schedules"

    id = Column(Integer, primary_key=True, index=True)
    workflowId = Column(Integer, ForeignKey("workflows.id", ondelete="CASCADE"), nullable=False)
    nodeId = Column(String(36), nullable=False)
    cronExpression = Column(String(100), nullable=False)
    timezone = Column(String(50), nullable=False, default="UTC")
    lastRun = Column(DateTime(timezone=True), nullable=True)
    nextRun = Column(DateTime(timezone=True), nullable=True)
    isActive = Column(Boolean, nullable=False, default=True)
    createdAt = Column(DateTime(timezone=True), nullable=False, default=datetime.utcnow)
    updatedAt = Column(DateTime(timezone=True), nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Indexes (defined in table args)
    __table_args__ = (
        Index("workflow_schedules_workflow_idx", "workflowId"),
        Index("workflow_schedules_next_run_idx", "nextRun"),
        Index("workflow_schedules_active_idx", "isActive"),
    )
