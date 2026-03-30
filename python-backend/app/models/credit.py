'''
Credit Management Models
Compatible with SmartSpecWeb's Drizzle schema (camelCase columns)
'''

import enum
from sqlalchemy import Column, String, Integer, DateTime, ForeignKey, Text, JSON, Index, Enum
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.sql import func

from app.core.database import Base


class TransactionType(str, enum.Enum):
    """Transaction type enum - must match SmartSpecWeb's transaction_type enum exactly"""
    purchase = "purchase"
    usage = "usage"
    bonus = "bonus"
    refund = "refund"
    adjustment = "adjustment"


class CreditTransaction(Base):
    """
    Credit transaction model - matches SmartSpecWeb's credit_transactions table
    Uses camelCase column names to be compatible with Drizzle ORM
    """

    __tablename__ = "credit_transactions"

    # Serial primary key (auto-increment)
    id = Column(Integer, primary_key=True, autoincrement=True)

    # User ID - camelCase to match SmartSpecWeb
    user_id = Column("userId", Integer, ForeignKey("users.id"), nullable=False, index=True)

    # Amount of credits (positive for additions, negative for deductions)
    amount = Column(Integer, nullable=False)

    # Transaction type: usage, purchase, refund, bonus, adjustment
    # Use create_type=False since the enum already exists in PostgreSQL
    type = Column(
        Enum(TransactionType, name="transaction_type", create_type=False),
        nullable=False
    )

    # Human-readable description
    description = Column(String(512))

    # Additional metadata (model, tokens, cost, etc.)
    # Note: Using 'meta' as Python attribute because 'metadata' is reserved in SQLAlchemy
    meta = Column("metadata", JSONB, default={})

    # Balance after this transaction - camelCase to match SmartSpecWeb
    balance_after = Column("balanceAfter", Integer, nullable=False)

    # Reference ID for external systems (e.g., Stripe payment ID)
    reference_id = Column("referenceId", String(128))

    # Timestamp - camelCase to match SmartSpecWeb
    created_at = Column("createdAt", DateTime(timezone=True), server_default=func.now(), nullable=False, index=True)

    # NOTE: No user relationship to avoid MissingGreenlet error in async SQLAlchemy

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
# mypy: ignore-errors
