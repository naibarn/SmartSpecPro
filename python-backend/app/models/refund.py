"""
Refund Model
Stores refund transactions for payments
"""

from datetime import datetime
from sqlalchemy import Column, String, Integer, Float, DateTime, Enum as SQLEnum, Text
from enum import Enum

from app.core.database import Base


class RefundStatus(str, Enum):
    """Refund status enum"""
    PENDING = "pending"
    PROCESSING = "processing"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"


class RefundType(str, Enum):
    """Refund type enum"""
    FULL = "full"
    PARTIAL = "partial"


class Refund(Base):
    """
    Refund transaction
    
    Tracks refunds for payment transactions
    """
    __tablename__ = "refunds"
    
    id = Column(String(36), primary_key=True)
    payment_id = Column(String(36), nullable=False, index=True)
    user_id = Column(String(36), nullable=False, index=True)
    
    # Refund details
    refund_type = Column(SQLEnum(RefundType), nullable=False, default=RefundType.FULL)
    amount_usd = Column(Float, nullable=False)
    credits_deducted = Column(Integer, nullable=False)
    reason = Column(Text, nullable=True)
    
    # Status
    status = Column(SQLEnum(RefundStatus), nullable=False, default=RefundStatus.PENDING)
    
    # Stripe details
    stripe_refund_id = Column(String(255), nullable=True, index=True)
    
    # Metadata
    requested_by = Column(String(36), nullable=True)  # User or admin ID
    requested_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    processed_at = Column(DateTime, nullable=True)
    completed_at = Column(DateTime, nullable=True)
    
    # Audit
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at = Column(DateTime, nullable=True, onupdate=datetime.utcnow)
    
    def __repr__(self):
        return f"<Refund(id={self.id}, payment_id={self.payment_id}, amount=${self.amount_usd}, status={self.status})>"
