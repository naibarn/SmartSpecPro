"""
Payment Transaction Model
"""

from datetime import datetime
from decimal import Decimal
from typing import Optional
from sqlalchemy import Column, Integer, String, DECIMAL, DateTime, ForeignKey, JSON, Index
from sqlalchemy.orm import relationship

from app.core.database import Base


class PaymentTransaction(Base):
    """
    Payment Transaction Model
    
    Tracks all payment transactions through Stripe
    """
    __tablename__ = "payment_transactions"
    
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    
    # Stripe info
    stripe_session_id = Column(String(255), unique=True, index=True)
    stripe_payment_intent_id = Column(String(255), index=True)
    stripe_customer_id = Column(String(255))
    
    # Payment info
    amount_usd = Column(DECIMAL(10, 2), nullable=False)
    currency = Column(String(3), default="USD")
    status = Column(String(50), nullable=False, index=True)  # pending, completed, failed, refunded
    
    # Credits info
    credits_amount = Column(Integer)
    credits_added_at = Column(DateTime)
    
    # Metadata
    payment_method = Column(String(50))
    meta_data = Column("metadata", JSON)
    
    # Timestamps
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)
    completed_at = Column(DateTime)
    
    # Relationships
    user = relationship("User", back_populates="payment_transactions")
    
    def __repr__(self):
        return f"<PaymentTransaction(id={self.id}, user_id={self.user_id}, amount=${self.amount_usd}, status={self.status})>"
    
    def to_dict(self):
        """Convert to dictionary"""
        return {
            "id": self.id,
            "user_id": self.user_id,
            "stripe_session_id": self.stripe_session_id,
            "stripe_payment_intent_id": self.stripe_payment_intent_id,
            "amount_usd": float(self.amount_usd) if self.amount_usd else None,
            "currency": self.currency,
            "status": self.status,
            "credits_amount": self.credits_amount,
            "payment_method": self.payment_method,
            "metadata": self.meta_data,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
            "completed_at": self.completed_at.isoformat() if self.completed_at else None,
            "credits_added_at": self.credits_added_at.isoformat() if self.credits_added_at else None,
        }


# Add indexes
Index('idx_payment_transactions_user_status', PaymentTransaction.user_id, PaymentTransaction.status)
Index('idx_payment_transactions_created', PaymentTransaction.created_at.desc())

# Index for faster queries
Index("ix_payment_transactions_user_id_status", PaymentTransaction.user_id, PaymentTransaction.status)
