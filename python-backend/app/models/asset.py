"""
SmartSpec Pro - Asset Model
Database model for managing project assets (images, videos, audio).
"""

from datetime import datetime
from typing import Optional, List, Dict, Any
from sqlalchemy import (
    Column,
    String,
    Text,
    Integer,
    Boolean,
    DateTime,
    ForeignKey,
    JSON,
    Enum as SQLEnum,
    Index,
)
from sqlalchemy.orm import relationship
import enum
import uuid

from app.core.database import Base


class AssetType(str, enum.Enum):
    """Type of asset."""
    IMAGE = "image"
    VIDEO = "video"
    AUDIO = "audio"


class AssetStatus(str, enum.Enum):
    """Status of an asset."""
    ACTIVE = "active"
    ARCHIVED = "archived"
    DELETED = "deleted"


class Asset(Base):
    """
    Asset model for tracking project media files.
    
    Features:
    - Version tracking with parent_asset_id
    - Metadata storage for generation details
    - Tags for searchability
    - Soft delete support
    """
    __tablename__ = "assets"
    
    # Primary key
    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    
    # User and project association
    user_id = Column(String(36), ForeignKey("users.id"), nullable=False, index=True)
    project_id = Column(String(36), nullable=True, index=True)
    spec_id = Column(String(100), nullable=True, index=True)  # e.g., "SPEC-004-DESKTOP-APP"
    
    # File information
    filename = Column(String(255), nullable=False)
    original_filename = Column(String(255), nullable=True)  # Original name before sanitization
    relative_path = Column(Text, nullable=False)  # Path relative to project root
    file_size = Column(Integer, nullable=True)  # Size in bytes
    mime_type = Column(String(100), nullable=True)  # e.g., "image/png"
    
    # Asset type and status
    asset_type = Column(SQLEnum(AssetType), nullable=False, index=True)
    status = Column(SQLEnum(AssetStatus), default=AssetStatus.ACTIVE, nullable=False, index=True)
    
    # Version tracking
    version = Column(Integer, default=1, nullable=False)
    is_latest = Column(Boolean, default=True, nullable=False, index=True)
    parent_asset_id = Column(String(36), ForeignKey("assets.id"), nullable=True)
    
    # Generation tracking
    generation_task_id = Column(String(36), nullable=True, index=True)
    
    # Metadata
    asset_metadata = Column(JSON, default=dict)
    """
    Metadata structure:
    {
        "prompt": "...",
        "model": "google-nano-banana-pro",
        "provider": "kie.ai",
        "width": 1024,
        "height": 1024,
        "duration": 10.5,  # for video/audio
        "format": "png",
        "generation_time_ms": 5000,
        "cost_credits": 10
    }
    """
    
    # Tags for searchability
    tags = Column(JSON, default=list)
    """
    Tags structure:
    ["hero", "banner", "marketing", "v2"]
    """
    
    # Description
    description = Column(Text, nullable=True)
    alt_text = Column(String(500), nullable=True)  # For accessibility
    
    # Timestamps
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False, index=True)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)
    deleted_at = Column(DateTime, nullable=True)
    
    # Relationships
    parent_asset = relationship("Asset", remote_side=[id], backref="versions")
    
    # Indexes for common queries
    __table_args__ = (
        Index("ix_assets_user_project", "user_id", "project_id"),
        Index("ix_assets_user_type", "user_id", "asset_type"),
        Index("ix_assets_project_spec", "project_id", "spec_id"),
        Index("ix_assets_latest_active", "is_latest", "status"),
    )
    
    def __repr__(self):
        return f"<Asset(id={self.id}, filename={self.filename}, type={self.asset_type}, version={self.version})>"
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert asset to dictionary."""
        return {
            "id": self.id,
            "user_id": self.user_id,
            "project_id": self.project_id,
            "spec_id": self.spec_id,
            "filename": self.filename,
            "original_filename": self.original_filename,
            "relative_path": self.relative_path,
            "file_size": self.file_size,
            "mime_type": self.mime_type,
            "asset_type": self.asset_type.value if self.asset_type else None,
            "status": self.status.value if self.status else None,
            "version": self.version,
            "is_latest": self.is_latest,
            "parent_asset_id": self.parent_asset_id,
            "generation_task_id": self.generation_task_id,
            "metadata": self.asset_metadata,
            "tags": self.tags,
            "description": self.description,
            "alt_text": self.alt_text,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }
    
    @classmethod
    def get_mime_type(cls, filename: str) -> str:
        """Get MIME type from filename extension."""
        ext = filename.lower().split('.')[-1] if '.' in filename else ''
        mime_types = {
            # Images
            'png': 'image/png',
            'jpg': 'image/jpeg',
            'jpeg': 'image/jpeg',
            'gif': 'image/gif',
            'webp': 'image/webp',
            'svg': 'image/svg+xml',
            # Videos
            'mp4': 'video/mp4',
            'webm': 'video/webm',
            'mov': 'video/quicktime',
            'avi': 'video/x-msvideo',
            # Audio
            'mp3': 'audio/mpeg',
            'wav': 'audio/wav',
            'ogg': 'audio/ogg',
            'flac': 'audio/flac',
            'm4a': 'audio/mp4',
        }
        return mime_types.get(ext, 'application/octet-stream')
    
    @classmethod
    def get_asset_type_from_mime(cls, mime_type: str) -> AssetType:
        """Determine asset type from MIME type."""
        if mime_type.startswith('image/'):
            return AssetType.IMAGE
        elif mime_type.startswith('video/'):
            return AssetType.VIDEO
        elif mime_type.startswith('audio/'):
            return AssetType.AUDIO
        else:
            return AssetType.IMAGE  # Default to image
