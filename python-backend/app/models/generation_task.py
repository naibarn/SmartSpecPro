"""
SmartSpec Pro - Generation Task Model
Database model for tracking generation tasks.
"""

from datetime import datetime
from typing import Optional, List, Dict, Any
from sqlalchemy import (
    Column,
    String,
    Text,
    Integer,
    Float,
    Boolean,
    DateTime,
    ForeignKey,
    JSON,
    Enum as SQLEnum,
    Index,
)
from sqlalchemy.orm import relationship
import enum

from app.core.database import Base


class MediaType(str, enum.Enum):
    """Type of media being generated."""
    IMAGE = "image"
    VIDEO = "video"
    AUDIO = "audio"


class TaskStatus(str, enum.Enum):
    """Status of a generation task."""
    PENDING = "pending"
    QUEUED = "queued"
    PROCESSING = "processing"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"


class GenerationTask(Base):
    """
    Tracks generation tasks for images, videos, and audio.
    """
    __tablename__ = "generation_tasks"
    
    # Primary key
    id = Column(String(36), primary_key=True)
    
    # User and project
    user_id = Column(String(36), ForeignKey("users.id"), nullable=False, index=True)
    project_id = Column(String(36), nullable=True, index=True)
    
    # Task type and model
    media_type = Column(SQLEnum(MediaType), nullable=False, index=True)
    model_id = Column(String(100), nullable=False, index=True)
    
    # Input
    prompt = Column(Text, nullable=False)
    options = Column(JSON, default=dict)
    reference_files = Column(JSON, default=list)  # List of URLs
    
    # External task tracking
    external_task_id = Column(String(100), nullable=True, index=True)
    external_provider = Column(String(50), default="kie.ai")
    
    # Status
    status = Column(SQLEnum(TaskStatus), default=TaskStatus.PENDING, nullable=False, index=True)
    progress = Column(Float, default=0.0)
    error_message = Column(Text, nullable=True)
    
    # Output
    output_url = Column(Text, nullable=True)
    output_urls = Column(JSON, default=list)  # For multiple outputs
    thumbnail_url = Column(Text, nullable=True)
    output_metadata = Column(JSON, default=dict)
    
    # Credits
    credits_estimated = Column(Float, default=0.0)
    credits_used = Column(Float, default=0.0)
    
    # Timestamps
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False, index=True)
    started_at = Column(DateTime, nullable=True)
    completed_at = Column(DateTime, nullable=True)
    
    # Soft delete
    is_deleted = Column(Boolean, default=False, index=True)
    deleted_at = Column(DateTime, nullable=True)
    
    # Relationships
    user = relationship("User", back_populates="generation_tasks")
    
    # Indexes
    __table_args__ = (
        Index("ix_generation_tasks_user_status", "user_id", "status"),
        Index("ix_generation_tasks_user_media", "user_id", "media_type"),
        Index("ix_generation_tasks_created", "created_at"),
    )
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary."""
        return {
            "id": self.id,
            "user_id": self.user_id,
            "project_id": self.project_id,
            "media_type": self.media_type.value if self.media_type else None,
            "model_id": self.model_id,
            "prompt": self.prompt,
            "options": self.options,
            "reference_files": self.reference_files,
            "external_task_id": self.external_task_id,
            "status": self.status.value if self.status else None,
            "progress": self.progress,
            "error_message": self.error_message,
            "output_url": self.output_url,
            "output_urls": self.output_urls,
            "thumbnail_url": self.thumbnail_url,
            "credits_estimated": self.credits_estimated,
            "credits_used": self.credits_used,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "started_at": self.started_at.isoformat() if self.started_at else None,
            "completed_at": self.completed_at.isoformat() if self.completed_at else None,
        }


class GenerationAPIKey(Base):
    """
    API keys for accessing generation services.
    """
    __tablename__ = "generation_api_keys"
    
    # Primary key
    id = Column(String(36), primary_key=True)
    
    # Owner
    user_id = Column(String(36), ForeignKey("users.id"), nullable=False, index=True)
    project_id = Column(String(36), nullable=True, index=True)
    
    # Key info
    name = Column(String(100), nullable=False)
    key_prefix = Column(String(20), nullable=False)  # First 12 chars for identification
    key_hash = Column(String(64), nullable=False, unique=True, index=True)
    encrypted_key = Column(Text, nullable=False)
    
    # Permissions
    scopes = Column(JSON, default=list)  # List of allowed scopes
    
    # Rate limits
    rate_limit_per_minute = Column(Integer, default=60)
    rate_limit_per_day = Column(Integer, default=10000)
    
    # Origin restrictions
    allowed_origins = Column(JSON, default=list)  # List of allowed origins
    
    # Status
    is_active = Column(Boolean, default=True, index=True)
    
    # Usage stats
    usage_count = Column(Integer, default=0)
    last_used_at = Column(DateTime, nullable=True)
    
    # Timestamps
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    expires_at = Column(DateTime, nullable=True, index=True)
    revoked_at = Column(DateTime, nullable=True)
    
    # Metadata
    metadata = Column(JSON, default=dict)
    
    # Relationships
    user = relationship("User", back_populates="generation_api_keys")
    
    # Indexes
    __table_args__ = (
        Index("ix_gen_api_keys_user_active", "user_id", "is_active"),
    )
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary (without sensitive data)."""
        return {
            "id": self.id,
            "user_id": self.user_id,
            "project_id": self.project_id,
            "name": self.name,
            "key_prefix": self.key_prefix,
            "scopes": self.scopes,
            "rate_limit_per_minute": self.rate_limit_per_minute,
            "rate_limit_per_day": self.rate_limit_per_day,
            "allowed_origins": self.allowed_origins,
            "is_active": self.is_active,
            "usage_count": self.usage_count,
            "last_used_at": self.last_used_at.isoformat() if self.last_used_at else None,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "expires_at": self.expires_at.isoformat() if self.expires_at else None,
        }


class ProviderCredential(Base):
    """
    Encrypted storage for third-party provider credentials.
    """
    __tablename__ = "provider_credentials"
    
    # Primary key
    id = Column(String(36), primary_key=True)
    
    # Owner
    user_id = Column(String(36), ForeignKey("users.id"), nullable=False, index=True)
    project_id = Column(String(36), nullable=True, index=True)
    
    # Provider info
    provider = Column(String(50), nullable=False, index=True)  # e.g., "kie.ai", "cloudflare"
    credential_type = Column(String(50), nullable=False)  # e.g., "api_key", "access_key"
    
    # Encrypted value
    encrypted_value = Column(Text, nullable=False)
    
    # Status
    is_active = Column(Boolean, default=True)
    
    # Timestamps
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Relationships
    user = relationship("User", back_populates="provider_credentials")
    
    # Indexes
    __table_args__ = (
        Index("ix_provider_creds_user_provider", "user_id", "provider"),
        Index("ix_provider_creds_lookup", "user_id", "project_id", "provider", "credential_type"),
    )
