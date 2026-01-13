"""
SmartSpec Pro - Tenant Database Models
Phase 3: Multi-tenancy Support
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


class TenantStatus(str, enum.Enum):
    """Tenant status enum."""
    ACTIVE = "active"
    SUSPENDED = "suspended"
    PENDING = "pending"
    DELETED = "deleted"


class TenantPlan(str, enum.Enum):
    """Tenant plan enum."""
    FREE = "free"
    STARTER = "starter"
    PROFESSIONAL = "professional"
    ENTERPRISE = "enterprise"


class Tenant(Base):
    """
    Tenant model for multi-tenancy support.
    Each tenant represents an organization or company.
    """
    __tablename__ = "tenants"

    id = Column(String(36), primary_key=True)
    name = Column(String(255), nullable=False)
    slug = Column(String(100), unique=True, nullable=False, index=True)
    
    # Status and plan
    status = Column(SQLEnum(TenantStatus), default=TenantStatus.ACTIVE, nullable=False)
    plan = Column(SQLEnum(TenantPlan), default=TenantPlan.FREE, nullable=False)
    
    # Owner information
    owner_id = Column(String(36), ForeignKey("users.id"), nullable=True)
    owner_email = Column(String(255), nullable=True)
    
    # Settings (JSON)
    settings = Column(JSON, default=dict)
    
    # Limits
    max_users = Column(Integer, default=5)
    max_projects = Column(Integer, default=10)
    max_storage_gb = Column(Integer, default=10)
    max_api_calls_per_month = Column(Integer, default=10000)
    
    # Usage tracking
    current_users = Column(Integer, default=0)
    current_projects = Column(Integer, default=0)
    current_storage_gb = Column(Integer, default=0)
    current_api_calls = Column(Integer, default=0)
    
    # Billing
    billing_email = Column(String(255), nullable=True)
    stripe_customer_id = Column(String(255), nullable=True)
    
    # Metadata
    description = Column(Text, nullable=True)
    logo_url = Column(String(500), nullable=True)
    website = Column(String(255), nullable=True)
    
    # Timestamps
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    suspended_at = Column(DateTime, nullable=True)
    deleted_at = Column(DateTime, nullable=True)
    
    # Relationships
    users = relationship("TenantUser", back_populates="tenant", cascade="all, delete-orphan")
    
    # Indexes
    __table_args__ = (
        Index("idx_tenant_status", "status"),
        Index("idx_tenant_plan", "plan"),
        Index("idx_tenant_owner", "owner_id"),
    )


class TenantUser(Base):
    """
    Association table for tenant-user relationships.
    Supports users belonging to multiple tenants.
    """
    __tablename__ = "tenant_users"

    id = Column(String(36), primary_key=True)
    tenant_id = Column(String(36), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False)
    user_id = Column(String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    
    # Role within tenant
    role = Column(String(50), default="member", nullable=False)  # owner, admin, member, viewer
    
    # Status
    is_active = Column(Boolean, default=True)
    
    # Timestamps
    joined_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    last_active_at = Column(DateTime, nullable=True)
    
    # Relationships
    tenant = relationship("Tenant", back_populates="users")
    
    # Indexes
    __table_args__ = (
        Index("idx_tenant_user_tenant", "tenant_id"),
        Index("idx_tenant_user_user", "user_id"),
        Index("idx_tenant_user_unique", "tenant_id", "user_id", unique=True),
    )
