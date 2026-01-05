'''
Credit Management Models
'''

from sqlalchemy import Column, String, Integer, DateTime, ForeignKey, Text, JSON, Index
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
import uuid

from app.core.database import Base


class CreditTransaction(Base):
    """Credit transaction model for tracking credit changes"""
    
    __tablename__ = "credit_transactions"
    
    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = Column(String(36), ForeignKey("users.id"), nullable=False, index=True)
    type = Column(String(20), nullable=False)  # topup, deduction, refund, adjustment
    amount = Column(Integer, nullable=False)  # Credits (1 USD = 1,000 credits)
    description = Column(Text)
    balance_before = Column(Integer, nullable=False)  # Credits
    balance_after = Column(Integer, nullable=False)  # Credits
    meta_data = Column("metadata", JSON, default={})
    created_at = Column(DateTime(timezone=True), server_default=func.now(), index=True)

    user = relationship("User", back_populates="credit_transactions")
    
    def __repr__(self):
        return f"<CreditTransaction {self.type} {self.amount} for user {self.user_id}>"


class SystemConfig(Base):
    """System configuration model"""
    
    __tablename__ = "system_config"
    
    key = Column(String(100), primary_key=True)
    value = Column(Text, nullable=False)
    description = Column(Text)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    
    def __repr__(self):
        return f"<SystemConfig {self.key}={self.value}>"

# Index for faster queries
Index("ix_credit_transactions_user_id_type", CreditTransaction.user_id, CreditTransaction.type)
