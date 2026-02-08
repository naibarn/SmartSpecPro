"""SQLAlchemy model for workflow event subscriptions."""
from datetime import datetime
from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Integer, String, Index, JSON
from sqlalchemy.orm import relationship

from app.core.database import Base


class WorkflowEventSubscription(Base):
    """Workflow Event Subscription model - System event triggers."""

    __tablename__ = "workflow_event_subscriptions"

    id = Column(Integer, primary_key=True, index=True)
    workflowId = Column(Integer, ForeignKey("workflows.id", ondelete="CASCADE"), nullable=False)
    nodeId = Column(String(36), nullable=False)
    eventType = Column(String(100), nullable=False)
    filterConditions = Column(JSON, nullable=True)
    isActive = Column(Boolean, nullable=False, default=True)
    createdAt = Column(DateTime(timezone=True), nullable=False, default=datetime.utcnow)
    updatedAt = Column(DateTime(timezone=True), nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Indexes (defined in table args)
    __table_args__ = (
        Index("workflow_event_subscriptions_workflow_idx", "workflowId"),
        Index("workflow_event_subscriptions_event_type_idx", "eventType"),
        Index("workflow_event_subscriptions_active_idx", "isActive"),
    )
