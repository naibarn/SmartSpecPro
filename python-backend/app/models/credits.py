"""
SmartSpec Pro - Credits Models
Database models for credits and usage tracking.
"""

from datetime import datetime
from enum import Enum
from typing import Optional
from uuid import uuid4

from sqlalchemy import (
    Boolean,
    Column,
    DateTime,
    Enum as SQLEnum,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
)
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import relationship

from app.core.database import Base


# =============================================================================
# ENUMS
# =============================================================================

class TransactionType(str, Enum):
    """Types of credit transactions."""
    PURCHASE = "purchase"
    USAGE = "usage"
    REFUND = "refund"
    BONUS = "bonus"
    SUBSCRIPTION = "subscription"
    ADJUSTMENT = "adjustment"


class UsageType(str, Enum):
    """Types of credit usage."""
    IMAGE_GENERATION = "image_generation"
    VIDEO_GENERATION = "video_generation"
    AUDIO_GENERATION = "audio_generation"
    STORAGE = "storage"
    API_CALL = "api_call"


# =============================================================================
# CREDITS BALANCE MODEL
# =============================================================================

class CreditsBalance(Base):
    """
    User credits balance.
    
    Tracks total, used, and reserved credits for each user.
    """
    
    __tablename__ = "credits_balances"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), unique=True, nullable=False)
    
    # Credit amounts
    total_credits = Column(Float, default=0.0, nullable=False)
    used_credits = Column(Float, default=0.0, nullable=False)
    reserved_credits = Column(Float, default=0.0, nullable=False)
    
    # Subscription info
    subscription_tier = Column(String(50), default="free")
    monthly_allowance = Column(Float, default=0.0)
    allowance_reset_date = Column(DateTime)
    
    # Timestamps
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Relationships
    user = relationship("User", back_populates="credits_balance")
    transactions = relationship("CreditTransaction", back_populates="balance", cascade="all, delete-orphan")
    
    # Indexes
    __table_args__ = (
        Index("idx_credits_balance_user", "user_id"),
    )
    
    @property
    def available_credits(self) -> float:
        """Get available credits."""
        return self.total_credits - self.used_credits - self.reserved_credits
    
    def reserve(self, amount: float) -> bool:
        """Reserve credits for a pending operation."""
        if self.available_credits >= amount:
            self.reserved_credits += amount
            return True
        return False
    
    def commit(self, amount: float):
        """Commit reserved credits (operation completed)."""
        self.reserved_credits = max(0, self.reserved_credits - amount)
        self.used_credits += amount
    
    def release(self, amount: float):
        """Release reserved credits (operation cancelled)."""
        self.reserved_credits = max(0, self.reserved_credits - amount)
    
    def add(self, amount: float):
        """Add credits to balance."""
        self.total_credits += amount


# =============================================================================
# CREDIT TRANSACTION MODEL
# =============================================================================

class CreditTransaction(Base):
    """
    Credit transaction history.
    
    Records all credit additions and deductions.
    """
    
    __tablename__ = "credit_transactions"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid4)
    balance_id = Column(UUID(as_uuid=True), ForeignKey("credits_balances.id"), nullable=False)
    
    # Transaction details
    transaction_type = Column(SQLEnum(TransactionType), nullable=False)
    amount = Column(Float, nullable=False)  # Positive for additions, negative for deductions
    
    # Balance snapshot
    balance_before = Column(Float, nullable=False)
    balance_after = Column(Float, nullable=False)
    
    # Reference
    reference_type = Column(String(50))  # e.g., "generation_task", "purchase", "subscription"
    reference_id = Column(String(255))  # e.g., task_id, order_id
    
    # Description
    description = Column(Text)
    metadata = Column(JSONB, default={})
    
    # Timestamps
    created_at = Column(DateTime, default=datetime.utcnow)
    
    # Relationships
    balance = relationship("CreditsBalance", back_populates="transactions")
    
    # Indexes
    __table_args__ = (
        Index("idx_credit_transaction_balance", "balance_id"),
        Index("idx_credit_transaction_type", "transaction_type"),
        Index("idx_credit_transaction_created", "created_at"),
        Index("idx_credit_transaction_reference", "reference_type", "reference_id"),
    )


# =============================================================================
# USAGE RECORD MODEL
# =============================================================================

class UsageRecord(Base):
    """
    Detailed usage record.
    
    Records individual usage events for analytics and billing.
    """
    
    __tablename__ = "usage_records"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    api_key_id = Column(UUID(as_uuid=True), ForeignKey("api_keys_v2.id"), nullable=True)
    
    # Usage details
    usage_type = Column(SQLEnum(UsageType), nullable=False)
    credits_used = Column(Float, nullable=False)
    
    # Resource info
    resource_type = Column(String(50))  # e.g., "image", "video", "audio"
    resource_id = Column(String(255))  # e.g., task_id
    model_id = Column(String(100))
    
    # Request details
    request_metadata = Column(JSONB, default={})  # prompt, options, etc.
    response_metadata = Column(JSONB, default={})  # output_url, duration, etc.
    
    # Status
    status = Column(String(50), default="completed")  # completed, failed, refunded
    
    # Client info
    ip_address = Column(String(45))
    user_agent = Column(Text)
    
    # Timestamps
    started_at = Column(DateTime, default=datetime.utcnow)
    completed_at = Column(DateTime)
    
    # Relationships
    user = relationship("User", back_populates="usage_records")
    
    # Indexes
    __table_args__ = (
        Index("idx_usage_record_user", "user_id"),
        Index("idx_usage_record_api_key", "api_key_id"),
        Index("idx_usage_record_type", "usage_type"),
        Index("idx_usage_record_started", "started_at"),
        Index("idx_usage_record_model", "model_id"),
    )


# =============================================================================
# SUBSCRIPTION PLAN MODEL
# =============================================================================

class SubscriptionPlan(Base):
    """
    Subscription plan configuration.
    
    Defines credit allowances and limits for each plan.
    """
    
    __tablename__ = "subscription_plans"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid4)
    
    # Plan info
    name = Column(String(100), unique=True, nullable=False)
    display_name = Column(String(100), nullable=False)
    description = Column(Text)
    
    # Pricing
    price_monthly = Column(Float, default=0.0)
    price_yearly = Column(Float, default=0.0)
    currency = Column(String(3), default="USD")
    
    # Credits
    monthly_credits = Column(Float, default=0.0)
    bonus_credits = Column(Float, default=0.0)  # One-time bonus on signup
    
    # Limits
    max_storage_mb = Column(Integer, default=100)
    max_image_size_mb = Column(Integer, default=10)
    max_video_size_mb = Column(Integer, default=500)
    max_video_duration_seconds = Column(Integer, default=30)
    
    # Rate limits
    requests_per_minute = Column(Integer, default=10)
    requests_per_day = Column(Integer, default=100)
    
    # Features
    features = Column(JSONB, default=[])  # List of feature flags
    
    # Status
    is_active = Column(Boolean, default=True)
    is_public = Column(Boolean, default=True)  # Visible on pricing page
    
    # Timestamps
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Indexes
    __table_args__ = (
        Index("idx_subscription_plan_name", "name"),
        Index("idx_subscription_plan_active", "is_active"),
    )


# =============================================================================
# DEFAULT PLANS
# =============================================================================

DEFAULT_PLANS = [
    {
        "name": "free",
        "display_name": "Free",
        "description": "Get started with basic features",
        "price_monthly": 0,
        "price_yearly": 0,
        "monthly_credits": 10,
        "bonus_credits": 5,
        "max_storage_mb": 100,
        "max_image_size_mb": 5,
        "max_video_size_mb": 100,
        "max_video_duration_seconds": 5,
        "requests_per_minute": 5,
        "requests_per_day": 50,
        "features": ["image_generation", "basic_support"],
    },
    {
        "name": "pro",
        "display_name": "Pro",
        "description": "For professionals and small teams",
        "price_monthly": 29,
        "price_yearly": 290,
        "monthly_credits": 500,
        "bonus_credits": 50,
        "max_storage_mb": 5000,
        "max_image_size_mb": 10,
        "max_video_size_mb": 500,
        "max_video_duration_seconds": 30,
        "requests_per_minute": 20,
        "requests_per_day": 500,
        "features": [
            "image_generation",
            "video_generation",
            "audio_generation",
            "priority_queue",
            "email_support",
            "api_access",
        ],
    },
    {
        "name": "enterprise",
        "display_name": "Enterprise",
        "description": "For large teams and organizations",
        "price_monthly": 199,
        "price_yearly": 1990,
        "monthly_credits": 5000,
        "bonus_credits": 500,
        "max_storage_mb": 50000,
        "max_image_size_mb": 50,
        "max_video_size_mb": 2000,
        "max_video_duration_seconds": 120,
        "requests_per_minute": 100,
        "requests_per_day": 5000,
        "features": [
            "image_generation",
            "video_generation",
            "audio_generation",
            "priority_queue",
            "dedicated_support",
            "api_access",
            "custom_models",
            "sla",
            "audit_logs",
        ],
    },
]
