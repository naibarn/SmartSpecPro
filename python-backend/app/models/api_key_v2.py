"""
SmartSpec Pro - Enhanced API Key Models v2
Database models for secure key management with versioning and audit trails.

Features:
- Key versioning with grace periods
- Comprehensive audit logging
- Rotation policies
- MFA requirements
"""

from datetime import datetime
from enum import Enum
from typing import Optional
import uuid

from sqlalchemy import (
    Column, String, Integer, Boolean, DateTime, 
    ForeignKey, Text, JSON, Index, Enum as SQLEnum,
    UniqueConstraint, CheckConstraint
)
from sqlalchemy.orm import relationship

from app.core.database import Base


# =============================================================================
# ENUMS
# =============================================================================

class KeyStatus(str, Enum):
    """API Key status."""
    ACTIVE = "active"
    INACTIVE = "inactive"
    REVOKED = "revoked"
    EXPIRED = "expired"


class KeyVersionStatus(str, Enum):
    """Key version status."""
    PRIMARY = "primary"
    GRACE_PERIOD = "grace_period"
    INACTIVE = "inactive"


class KeyAuditEventType(str, Enum):
    """Types of key audit events."""
    KEY_CREATED = "key_created"
    KEY_ROTATED = "key_rotated"
    KEY_REVOKED = "key_revoked"
    KEY_DELETED = "key_deleted"
    KEY_ACCESSED = "key_accessed"
    KEY_VALIDATED = "key_validated"
    KEY_VALIDATION_FAILED = "key_validation_failed"
    KEY_EXPIRED = "key_expired"
    ROTATION_SCHEDULED = "rotation_scheduled"
    GRACE_PERIOD_STARTED = "grace_period_started"
    GRACE_PERIOD_ENDED = "grace_period_ended"
    SUSPICIOUS_ACTIVITY = "suspicious_activity"
    MFA_VERIFIED = "mfa_verified"
    MFA_FAILED = "mfa_failed"


# =============================================================================
# API KEY MODEL (Enhanced)
# =============================================================================

class APIKeyV2(Base):
    """
    Enhanced API Key Model with versioning support.
    
    Features:
    - Multiple active versions during rotation
    - Automatic rotation policies
    - MFA requirements for sensitive operations
    - Comprehensive metadata
    """
    
    __tablename__ = "api_keys_v2"
    
    # Primary key
    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    
    # Ownership
    user_id = Column(String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    project_id = Column(String(36), nullable=True, index=True)
    
    # Key identification
    name = Column(String(255), nullable=False)
    key_prefix = Column(String(20), nullable=False)  # e.g., "ss_live_xxxx"
    description = Column(Text, nullable=True)
    
    # Status
    status = Column(SQLEnum(KeyStatus), default=KeyStatus.ACTIVE, nullable=False, index=True)
    current_version = Column(Integer, default=1, nullable=False)
    
    # Permissions
    scopes = Column(JSON, default=list)  # ["image:generate", "video:generate", "*"]
    allowed_origins = Column(JSON, nullable=True)  # ["https://example.com"]
    allowed_ips = Column(JSON, nullable=True)  # ["192.168.1.0/24"]
    
    # Rate limiting
    rate_limit_per_minute = Column(Integer, default=60, nullable=False)
    rate_limit_per_day = Column(Integer, default=10000, nullable=False)
    
    # Rotation policy
    rotation_enabled = Column(Boolean, default=False)
    rotation_interval_days = Column(Integer, default=90)
    rotation_grace_period_hours = Column(Integer, default=24)
    rotation_notify_before_days = Column(Integer, default=7)
    last_rotation_at = Column(DateTime, nullable=True)
    next_rotation_at = Column(DateTime, nullable=True)
    
    # MFA requirements
    mfa_required_for_rotation = Column(Boolean, default=True)
    mfa_required_for_revoke = Column(Boolean, default=True)
    
    # Usage statistics
    total_usage_count = Column(Integer, default=0)
    last_used_at = Column(DateTime, nullable=True)
    
    # Metadata
    metadata = Column(JSON, default=dict)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    expires_at = Column(DateTime, nullable=True)
    revoked_at = Column(DateTime, nullable=True)
    revoked_reason = Column(Text, nullable=True)
    
    # Relationships
    user = relationship("User", back_populates="api_keys_v2")
    versions = relationship("APIKeyVersion", back_populates="api_key", cascade="all, delete-orphan", order_by="desc(APIKeyVersion.version)")
    audit_logs = relationship("KeyAuditLog", back_populates="api_key", cascade="all, delete-orphan")
    
    # Indexes
    __table_args__ = (
        Index('idx_apikey_v2_user_status', 'user_id', 'status'),
        Index('idx_apikey_v2_project', 'project_id', 'status'),
        Index('idx_apikey_v2_rotation', 'rotation_enabled', 'next_rotation_at'),
    )
    
    def __repr__(self):
        return f"<APIKeyV2 {self.name} ({self.key_prefix}) v{self.current_version}>"
    
    def is_active(self) -> bool:
        """Check if key is active."""
        if self.status != KeyStatus.ACTIVE:
            return False
        if self.expires_at and datetime.utcnow() > self.expires_at:
            return False
        return True
    
    def has_scope(self, required_scope: str) -> bool:
        """Check if key has required scope."""
        if not self.scopes:
            return True
        if "*" in self.scopes:
            return True
        return required_scope in self.scopes
    
    def needs_rotation(self) -> bool:
        """Check if key needs rotation based on policy."""
        if not self.rotation_enabled or not self.next_rotation_at:
            return False
        return datetime.utcnow() >= self.next_rotation_at


# =============================================================================
# API KEY VERSION MODEL
# =============================================================================

class APIKeyVersion(Base):
    """
    API Key Version Model.
    
    Stores individual versions of an API key for rotation support.
    Multiple versions can be active during grace periods.
    """
    
    __tablename__ = "api_key_versions"
    
    # Primary key
    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    
    # Foreign key to parent key
    api_key_id = Column(String(36), ForeignKey("api_keys_v2.id", ondelete="CASCADE"), nullable=False, index=True)
    
    # Version info
    version = Column(Integer, nullable=False)
    status = Column(SQLEnum(KeyVersionStatus), default=KeyVersionStatus.PRIMARY, nullable=False)
    
    # Cryptographic data
    key_hash = Column(String(64), unique=True, nullable=False, index=True)
    encrypted_key = Column(Text, nullable=False)
    salt = Column(String(64), nullable=False)  # Unique salt for this version
    
    # Grace period
    grace_period_ends_at = Column(DateTime, nullable=True)
    
    # Metadata
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    deactivated_at = Column(DateTime, nullable=True)
    
    # Relationships
    api_key = relationship("APIKeyV2", back_populates="versions")
    
    # Constraints
    __table_args__ = (
        UniqueConstraint('api_key_id', 'version', name='uq_apikey_version'),
        Index('idx_keyversion_hash', 'key_hash'),
        Index('idx_keyversion_status', 'api_key_id', 'status'),
        Index('idx_keyversion_grace', 'status', 'grace_period_ends_at'),
    )
    
    def __repr__(self):
        return f"<APIKeyVersion {self.api_key_id} v{self.version} ({self.status.value})>"
    
    def is_valid(self) -> bool:
        """Check if this version is valid for use."""
        if self.status == KeyVersionStatus.INACTIVE:
            return False
        
        if self.status == KeyVersionStatus.GRACE_PERIOD:
            if self.grace_period_ends_at and datetime.utcnow() > self.grace_period_ends_at:
                return False
        
        return True


# =============================================================================
# KEY AUDIT LOG MODEL
# =============================================================================

class KeyAuditLog(Base):
    """
    Comprehensive audit log for key operations.
    
    Tracks all key-related events for security and compliance.
    """
    
    __tablename__ = "key_audit_logs"
    
    # Primary key
    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    
    # Event info
    event_type = Column(SQLEnum(KeyAuditEventType), nullable=False, index=True)
    timestamp = Column(DateTime, default=datetime.utcnow, nullable=False, index=True)
    
    # Actor info
    user_id = Column(String(36), ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    
    # Target info
    api_key_id = Column(String(36), ForeignKey("api_keys_v2.id", ondelete="SET NULL"), nullable=True, index=True)
    key_version = Column(Integer, nullable=True)
    
    # Request context
    ip_address = Column(String(45), nullable=True)
    user_agent = Column(Text, nullable=True)
    request_id = Column(String(36), nullable=True)
    
    # Event details
    details = Column(JSON, default=dict)
    
    # Result
    success = Column(Boolean, default=True, nullable=False)
    error_code = Column(String(50), nullable=True)
    error_message = Column(Text, nullable=True)
    
    # Risk assessment
    risk_score = Column(Integer, default=0)  # 0-100
    is_suspicious = Column(Boolean, default=False, index=True)
    
    # Relationships
    api_key = relationship("APIKeyV2", back_populates="audit_logs")
    
    # Indexes
    __table_args__ = (
        Index('idx_keyaudit_user_time', 'user_id', 'timestamp'),
        Index('idx_keyaudit_key_time', 'api_key_id', 'timestamp'),
        Index('idx_keyaudit_event_time', 'event_type', 'timestamp'),
        Index('idx_keyaudit_suspicious', 'is_suspicious', 'timestamp'),
    )
    
    def __repr__(self):
        return f"<KeyAuditLog {self.event_type.value} key={self.api_key_id}>"
    
    def to_dict(self):
        """Convert to dictionary."""
        return {
            "id": self.id,
            "event_type": self.event_type.value,
            "timestamp": self.timestamp.isoformat() if self.timestamp else None,
            "user_id": self.user_id,
            "api_key_id": self.api_key_id,
            "key_version": self.key_version,
            "ip_address": self.ip_address,
            "details": self.details,
            "success": self.success,
            "error_message": self.error_message,
            "risk_score": self.risk_score,
            "is_suspicious": self.is_suspicious,
        }


# =============================================================================
# MFA VERIFICATION MODEL
# =============================================================================

class KeyMFAVerification(Base):
    """
    MFA verification records for key operations.
    
    Tracks MFA challenges and verifications for sensitive key operations.
    """
    
    __tablename__ = "key_mfa_verifications"
    
    # Primary key
    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    
    # User and key
    user_id = Column(String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    api_key_id = Column(String(36), ForeignKey("api_keys_v2.id", ondelete="CASCADE"), nullable=True)
    
    # Operation being authorized
    operation = Column(String(50), nullable=False)  # "rotate", "revoke", "delete"
    
    # Challenge
    challenge_token = Column(String(64), unique=True, nullable=False)
    challenge_type = Column(String(20), nullable=False)  # "totp", "email", "sms"
    challenge_sent_at = Column(DateTime, default=datetime.utcnow)
    challenge_expires_at = Column(DateTime, nullable=False)
    
    # Verification
    verified = Column(Boolean, default=False)
    verified_at = Column(DateTime, nullable=True)
    attempts = Column(Integer, default=0)
    max_attempts = Column(Integer, default=3)
    
    # Request context
    ip_address = Column(String(45), nullable=True)
    user_agent = Column(Text, nullable=True)
    
    # Metadata
    created_at = Column(DateTime, default=datetime.utcnow)
    
    # Indexes
    __table_args__ = (
        Index('idx_mfa_token', 'challenge_token'),
        Index('idx_mfa_user_op', 'user_id', 'operation', 'verified'),
    )
    
    def __repr__(self):
        return f"<KeyMFAVerification {self.operation} user={self.user_id}>"
    
    def is_expired(self) -> bool:
        """Check if challenge is expired."""
        return datetime.utcnow() > self.challenge_expires_at
    
    def can_attempt(self) -> bool:
        """Check if more attempts are allowed."""
        return self.attempts < self.max_attempts and not self.is_expired()


# =============================================================================
# ROTATION SCHEDULE MODEL
# =============================================================================

class KeyRotationSchedule(Base):
    """
    Scheduled key rotations.
    
    Tracks upcoming and completed scheduled rotations.
    """
    
    __tablename__ = "key_rotation_schedules"
    
    # Primary key
    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    
    # Target key
    api_key_id = Column(String(36), ForeignKey("api_keys_v2.id", ondelete="CASCADE"), nullable=False, index=True)
    
    # Schedule
    scheduled_at = Column(DateTime, nullable=False, index=True)
    
    # Notification tracking
    notification_sent = Column(Boolean, default=False)
    notification_sent_at = Column(DateTime, nullable=True)
    
    # Execution
    executed = Column(Boolean, default=False)
    executed_at = Column(DateTime, nullable=True)
    execution_result = Column(String(20), nullable=True)  # "success", "failed", "skipped"
    execution_error = Column(Text, nullable=True)
    new_version = Column(Integer, nullable=True)
    
    # Metadata
    created_at = Column(DateTime, default=datetime.utcnow)
    
    # Indexes
    __table_args__ = (
        Index('idx_rotation_pending', 'executed', 'scheduled_at'),
        Index('idx_rotation_notify', 'notification_sent', 'scheduled_at'),
    )
    
    def __repr__(self):
        return f"<KeyRotationSchedule key={self.api_key_id} at={self.scheduled_at}>"
