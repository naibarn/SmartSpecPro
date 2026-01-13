"""
SmartSpec Pro - Secret Database Models
Phase 3: Secrets Management
"""

from datetime import datetime
from typing import Optional
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
import enum

from app.core.database import Base


class SecretType(str, enum.Enum):
    """Secret type enum."""
    API_KEY = "api_key"
    PASSWORD = "password"
    TOKEN = "token"
    CERTIFICATE = "certificate"
    SSH_KEY = "ssh_key"
    DATABASE_URL = "database_url"
    WEBHOOK_SECRET = "webhook_secret"
    ENCRYPTION_KEY = "encryption_key"
    CUSTOM = "custom"


class Secret(Base):
    """
    Secret model for secure credential storage.
    All values are encrypted at rest.
    """
    __tablename__ = "secrets"

    id = Column(String(36), primary_key=True)
    name = Column(String(100), nullable=False)
    description = Column(Text, nullable=True)
    
    # Scope
    tenant_id = Column(String(36), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=True)
    project_id = Column(String(36), nullable=True)
    
    # Secret data (encrypted)
    secret_type = Column(SQLEnum(SecretType), default=SecretType.CUSTOM)
    encrypted_value = Column(Text, nullable=False)  # AES-256-GCM encrypted
    value_hash = Column(String(64), nullable=True)  # SHA-256 hash for verification
    
    # Encryption metadata
    encryption_key_id = Column(String(36), nullable=True)  # Reference to key used
    encryption_algorithm = Column(String(50), default="AES-256-GCM")
    
    # Rotation
    rotation_enabled = Column(Boolean, default=False)
    rotation_interval_days = Column(Integer, default=90)
    last_rotated_at = Column(DateTime, nullable=True)
    next_rotation_at = Column(DateTime, nullable=True)
    
    # Expiration
    expires_at = Column(DateTime, nullable=True)
    
    # Access control
    allowed_services = Column(JSON, default=list)  # Services that can access this secret
    
    # Audit
    created_by = Column(String(36), ForeignKey("users.id"), nullable=True)
    last_accessed_at = Column(DateTime, nullable=True)
    access_count = Column(Integer, default=0)
    
    # Timestamps
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Indexes
    __table_args__ = (
        Index("idx_secret_name", "name"),
        Index("idx_secret_tenant", "tenant_id"),
        Index("idx_secret_type", "secret_type"),
        Index("idx_secret_tenant_name", "tenant_id", "name", unique=True),
    )


class SecretVersion(Base):
    """
    Secret version model for tracking secret history.
    Enables rollback and audit trail.
    """
    __tablename__ = "secret_versions"

    id = Column(String(36), primary_key=True)
    secret_id = Column(String(36), ForeignKey("secrets.id", ondelete="CASCADE"), nullable=False)
    
    # Version
    version = Column(Integer, nullable=False)
    
    # Encrypted value
    encrypted_value = Column(Text, nullable=False)
    value_hash = Column(String(64), nullable=True)
    
    # Metadata
    created_by = Column(String(36), ForeignKey("users.id"), nullable=True)
    reason = Column(Text, nullable=True)  # Why this version was created
    
    # Status
    is_current = Column(Boolean, default=True)
    
    # Timestamps
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    
    # Indexes
    __table_args__ = (
        Index("idx_secret_version_secret", "secret_id"),
        Index("idx_secret_version_current", "secret_id", "is_current"),
    )


class AuditEvent(Base):
    """
    Audit event model for security logging.
    Records all security-relevant events.
    """
    __tablename__ = "audit_events"

    id = Column(String(36), primary_key=True)
    
    # Event details
    action = Column(String(50), nullable=False)  # e.g., "login", "secret_read", "role_assign"
    description = Column(Text, nullable=True)
    
    # Actor
    actor_id = Column(String(36), nullable=True)
    actor_email = Column(String(255), nullable=True)
    actor_ip = Column(String(45), nullable=True)
    actor_user_agent = Column(Text, nullable=True)
    
    # Target
    target_type = Column(String(50), nullable=True)  # e.g., "user", "secret", "role"
    target_id = Column(String(36), nullable=True)
    
    # Context
    tenant_id = Column(String(36), ForeignKey("tenants.id", ondelete="SET NULL"), nullable=True)
    project_id = Column(String(36), nullable=True)
    
    # Result
    success = Column(Boolean, default=True)
    error_message = Column(Text, nullable=True)
    
    # Severity
    severity = Column(String(20), default="info")  # debug, info, warning, error, critical
    
    # Additional data
    extra_data = Column(JSON, default=dict)
    
    # Timestamps
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    
    # Indexes
    __table_args__ = (
        Index("idx_audit_action", "action"),
        Index("idx_audit_actor", "actor_id"),
        Index("idx_audit_tenant", "tenant_id"),
        Index("idx_audit_target", "target_type", "target_id"),
        Index("idx_audit_severity", "severity"),
        Index("idx_audit_created", "created_at"),
    )
