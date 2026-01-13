"""
SmartSpec Pro - Approval Database Models
Phase 3: Human-in-the-loop Approval Gates
"""

from datetime import datetime
from typing import Optional, List
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
    Enum as SQLEnum,
)
from sqlalchemy.orm import relationship
import enum

from app.core.database import Base


class ApprovalStatus(str, enum.Enum):
    """Approval request status."""
    PENDING = "pending"
    APPROVED = "approved"
    REJECTED = "rejected"
    EXPIRED = "expired"
    CANCELLED = "cancelled"


class ApprovalType(str, enum.Enum):
    """Types of approval requests."""
    CODE_EXECUTION = "code_execution"
    FILE_MODIFICATION = "file_modification"
    DEPLOYMENT = "deployment"
    CONFIGURATION_CHANGE = "configuration_change"
    COST_THRESHOLD = "cost_threshold"
    SECURITY_SENSITIVE = "security_sensitive"
    CUSTOM = "custom"


class ApprovalRequest(Base):
    """
    Approval request model.
    Represents a request for human approval before executing an action.
    """
    __tablename__ = "approval_requests"

    id = Column(String(36), primary_key=True)
    
    # Request details
    request_type = Column(SQLEnum(ApprovalType), nullable=False)
    title = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    
    # Context
    tenant_id = Column(String(36), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=True)
    project_id = Column(String(36), nullable=True)
    execution_id = Column(String(36), nullable=True)
    
    # Requester
    requester_id = Column(String(36), ForeignKey("users.id"), nullable=True)
    requester_type = Column(String(50), default="agent")  # "agent", "user", "system"
    
    # Status
    status = Column(SQLEnum(ApprovalStatus), default=ApprovalStatus.PENDING, nullable=False)
    
    # Payload (what needs to be approved)
    payload = Column(JSON, default=dict)
    extra_data = Column(JSON, default=dict)
    
    # Risk assessment
    risk_level = Column(String(20), default="medium")  # low, medium, high, critical
    risk_factors = Column(JSON, default=list)
    
    # Approval chain
    required_approvers = Column(Integer, default=1)
    current_approvals = Column(Integer, default=0)
    
    # Timing
    expires_at = Column(DateTime, nullable=True)
    timeout_action = Column(String(20), default="reject")  # "reject", "approve", "escalate"
    
    # Timestamps
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    resolved_at = Column(DateTime, nullable=True)
    
    # Relationships
    responses = relationship("ApprovalResponse", back_populates="request", cascade="all, delete-orphan")
    
    # Indexes
    __table_args__ = (
        Index("idx_approval_request_status", "status"),
        Index("idx_approval_request_tenant", "tenant_id"),
        Index("idx_approval_request_type", "request_type"),
        Index("idx_approval_request_execution", "execution_id"),
    )


class ApprovalResponse(Base):
    """
    Approval response model.
    Records individual approver decisions.
    """
    __tablename__ = "approval_responses"

    id = Column(String(36), primary_key=True)
    
    # Request reference
    request_id = Column(String(36), ForeignKey("approval_requests.id", ondelete="CASCADE"), nullable=False)
    
    # Approver
    approver_id = Column(String(36), ForeignKey("users.id"), nullable=False)
    
    # Decision
    decision = Column(String(20), nullable=False)  # "approved", "rejected"
    comment = Column(Text, nullable=True)
    
    # Timestamps
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    
    # Relationships
    request = relationship("ApprovalRequest", back_populates="responses")
    
    # Indexes
    __table_args__ = (
        Index("idx_approval_response_request", "request_id"),
        Index("idx_approval_response_approver", "approver_id"),
    )


class ApprovalRule(Base):
    """
    Approval rule model.
    Defines when approval is required and who can approve.
    """
    __tablename__ = "approval_rules"

    id = Column(String(36), primary_key=True)
    name = Column(String(100), nullable=False)
    description = Column(Text, nullable=True)
    
    # Scope
    tenant_id = Column(String(36), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=True)
    project_id = Column(String(36), nullable=True)
    
    # Trigger conditions
    trigger_type = Column(SQLEnum(ApprovalType), nullable=False)
    conditions = Column(JSON, default=dict)  # Additional conditions
    
    # Approvers
    approver_roles = Column(JSON, default=list)  # List of role names
    approver_users = Column(JSON, default=list)  # List of user IDs
    required_approvals = Column(Integer, default=1)
    
    # Behavior
    timeout_minutes = Column(Integer, default=60)
    timeout_action = Column(String(20), default="reject")
    auto_approve_conditions = Column(JSON, default=dict)
    
    # Priority (higher = evaluated first)
    priority = Column(Integer, default=0)
    
    # Status
    is_active = Column(Boolean, default=True)
    
    # Timestamps
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Indexes
    __table_args__ = (
        Index("idx_approval_rule_tenant", "tenant_id"),
        Index("idx_approval_rule_type", "trigger_type"),
        Index("idx_approval_rule_active", "is_active"),
    )
