"""
SmartSpec Pro - Gallery Models
Database models for public gallery with SEO/ASO support.
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
    UniqueConstraint,
)
from sqlalchemy.orm import relationship
import enum

from app.core.database import Base


class GalleryVisibility(str, enum.Enum):
    """Visibility settings for gallery items."""
    PUBLIC = "public"
    UNLISTED = "unlisted"
    PRIVATE = "private"


class GalleryCategory(str, enum.Enum):
    """Categories for gallery items."""
    # Image categories
    PORTRAIT = "portrait"
    LANDSCAPE = "landscape"
    ABSTRACT = "abstract"
    ILLUSTRATION = "illustration"
    PHOTOGRAPHY = "photography"
    PRODUCT = "product"
    ARCHITECTURE = "architecture"
    NATURE = "nature"
    FOOD = "food"
    FASHION = "fashion"
    
    # Video categories
    ANIMATION = "animation"
    CINEMATIC = "cinematic"
    COMMERCIAL = "commercial"
    MUSIC_VIDEO = "music_video"
    EXPLAINER = "explainer"
    
    # Audio categories
    VOICEOVER = "voiceover"
    PODCAST = "podcast"
    MUSIC = "music"
    SOUND_EFFECT = "sound_effect"
    
    # General
    OTHER = "other"


class GalleryItem(Base):
    """
    Gallery item for public showcase.
    
    Features:
    - SEO-optimized metadata
    - Social sharing support
    - Engagement tracking
    - Moderation support
    """
    __tablename__ = "gallery_items"
    
    # Primary key
    id = Column(String(36), primary_key=True)
    
    # SEO-friendly slug
    slug = Column(String(200), unique=True, nullable=False, index=True)
    
    # Owner
    user_id = Column(String(36), ForeignKey("users.id"), nullable=False, index=True)
    
    # Source task (optional)
    generation_task_id = Column(String(36), ForeignKey("generation_tasks.id"), nullable=True)
    
    # Content type
    media_type = Column(String(20), nullable=False, index=True)  # image, video, audio
    model_id = Column(String(100), nullable=True)
    
    # SEO Metadata
    title = Column(String(200), nullable=False)
    description = Column(Text, nullable=True)
    prompt = Column(Text, nullable=True)  # Original prompt (if shared)
    
    # SEO Tags
    tags = Column(JSON, default=list)  # List of tags
    category = Column(SQLEnum(GalleryCategory), default=GalleryCategory.OTHER, index=True)
    
    # Media URLs
    media_url = Column(Text, nullable=False)
    thumbnail_url = Column(Text, nullable=True)
    preview_url = Column(Text, nullable=True)  # For video preview
    
    # Media metadata
    width = Column(Integer, nullable=True)
    height = Column(Integer, nullable=True)
    duration_seconds = Column(Float, nullable=True)  # For video/audio
    file_size_bytes = Column(Integer, nullable=True)
    mime_type = Column(String(50), nullable=True)
    
    # Visibility
    visibility = Column(SQLEnum(GalleryVisibility), default=GalleryVisibility.PUBLIC, index=True)
    is_featured = Column(Boolean, default=False, index=True)
    is_nsfw = Column(Boolean, default=False, index=True)
    
    # Engagement
    view_count = Column(Integer, default=0)
    like_count = Column(Integer, default=0)
    download_count = Column(Integer, default=0)
    share_count = Column(Integer, default=0)
    
    # Moderation
    is_approved = Column(Boolean, default=True, index=True)
    moderation_status = Column(String(20), default="approved")  # pending, approved, rejected
    moderation_notes = Column(Text, nullable=True)
    moderated_at = Column(DateTime, nullable=True)
    moderated_by = Column(String(36), nullable=True)
    
    # Social sharing
    og_image_url = Column(Text, nullable=True)  # Open Graph image
    twitter_card_type = Column(String(20), default="summary_large_image")
    
    # Timestamps
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False, index=True)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    published_at = Column(DateTime, nullable=True, index=True)
    
    # Soft delete
    is_deleted = Column(Boolean, default=False, index=True)
    deleted_at = Column(DateTime, nullable=True)
    
    # Relationships
    user = relationship("User", back_populates="gallery_items")
    generation_task = relationship("GenerationTask")
    likes = relationship("GalleryLike", back_populates="gallery_item", cascade="all, delete-orphan")
    comments = relationship("GalleryComment", back_populates="gallery_item", cascade="all, delete-orphan")
    
    # Indexes
    __table_args__ = (
        Index("ix_gallery_items_public", "visibility", "is_approved", "is_deleted"),
        Index("ix_gallery_items_featured", "is_featured", "visibility"),
        Index("ix_gallery_items_category", "category", "visibility"),
        Index("ix_gallery_items_user_visibility", "user_id", "visibility"),
    )
    
    def to_dict(self, include_prompt: bool = False) -> Dict[str, Any]:
        """Convert to dictionary."""
        data = {
            "id": self.id,
            "slug": self.slug,
            "user_id": self.user_id,
            "media_type": self.media_type,
            "model_id": self.model_id,
            "title": self.title,
            "description": self.description,
            "tags": self.tags,
            "category": self.category.value if self.category else None,
            "media_url": self.media_url,
            "thumbnail_url": self.thumbnail_url,
            "preview_url": self.preview_url,
            "width": self.width,
            "height": self.height,
            "duration_seconds": self.duration_seconds,
            "visibility": self.visibility.value if self.visibility else None,
            "is_featured": self.is_featured,
            "is_nsfw": self.is_nsfw,
            "view_count": self.view_count,
            "like_count": self.like_count,
            "download_count": self.download_count,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "published_at": self.published_at.isoformat() if self.published_at else None,
        }
        
        if include_prompt:
            data["prompt"] = self.prompt
        
        return data
    
    def to_seo_dict(self) -> Dict[str, Any]:
        """Get SEO metadata."""
        return {
            "title": self.title,
            "description": self.description or f"AI-generated {self.media_type} created with SmartSpec Pro",
            "canonical_url": f"/gallery/{self.slug}",
            "og_type": "article" if self.media_type == "image" else "video.other",
            "og_image": self.og_image_url or self.thumbnail_url or self.media_url,
            "twitter_card": self.twitter_card_type,
            "keywords": self.tags,
        }


class GalleryLike(Base):
    """
    Likes on gallery items.
    """
    __tablename__ = "gallery_likes"
    
    # Primary key
    id = Column(String(36), primary_key=True)
    
    # References
    gallery_item_id = Column(String(36), ForeignKey("gallery_items.id"), nullable=False, index=True)
    user_id = Column(String(36), ForeignKey("users.id"), nullable=False, index=True)
    
    # Timestamp
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    
    # Relationships
    gallery_item = relationship("GalleryItem", back_populates="likes")
    user = relationship("User")
    
    # Unique constraint
    __table_args__ = (
        UniqueConstraint("gallery_item_id", "user_id", name="uq_gallery_like"),
    )


class GalleryComment(Base):
    """
    Comments on gallery items.
    """
    __tablename__ = "gallery_comments"
    
    # Primary key
    id = Column(String(36), primary_key=True)
    
    # References
    gallery_item_id = Column(String(36), ForeignKey("gallery_items.id"), nullable=False, index=True)
    user_id = Column(String(36), ForeignKey("users.id"), nullable=False, index=True)
    parent_id = Column(String(36), ForeignKey("gallery_comments.id"), nullable=True)  # For replies
    
    # Content
    content = Column(Text, nullable=False)
    
    # Moderation
    is_approved = Column(Boolean, default=True)
    is_deleted = Column(Boolean, default=False)
    
    # Timestamps
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Relationships
    gallery_item = relationship("GalleryItem", back_populates="comments")
    user = relationship("User")
    replies = relationship("GalleryComment", backref="parent", remote_side=[id])
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary."""
        return {
            "id": self.id,
            "gallery_item_id": self.gallery_item_id,
            "user_id": self.user_id,
            "parent_id": self.parent_id,
            "content": self.content,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }


class GalleryCollection(Base):
    """
    Collections of gallery items (curated sets).
    """
    __tablename__ = "gallery_collections"
    
    # Primary key
    id = Column(String(36), primary_key=True)
    
    # SEO-friendly slug
    slug = Column(String(200), unique=True, nullable=False, index=True)
    
    # Owner
    user_id = Column(String(36), ForeignKey("users.id"), nullable=False, index=True)
    
    # Metadata
    title = Column(String(200), nullable=False)
    description = Column(Text, nullable=True)
    cover_image_url = Column(Text, nullable=True)
    
    # Visibility
    visibility = Column(SQLEnum(GalleryVisibility), default=GalleryVisibility.PUBLIC, index=True)
    is_featured = Column(Boolean, default=False, index=True)
    
    # Stats
    item_count = Column(Integer, default=0)
    
    # Timestamps
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Relationships
    user = relationship("User")
    items = relationship("GalleryCollectionItem", back_populates="collection", cascade="all, delete-orphan")
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary."""
        return {
            "id": self.id,
            "slug": self.slug,
            "user_id": self.user_id,
            "title": self.title,
            "description": self.description,
            "cover_image_url": self.cover_image_url,
            "visibility": self.visibility.value if self.visibility else None,
            "is_featured": self.is_featured,
            "item_count": self.item_count,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }


class GalleryCollectionItem(Base):
    """
    Items in a collection.
    """
    __tablename__ = "gallery_collection_items"
    
    # Primary key
    id = Column(String(36), primary_key=True)
    
    # References
    collection_id = Column(String(36), ForeignKey("gallery_collections.id"), nullable=False, index=True)
    gallery_item_id = Column(String(36), ForeignKey("gallery_items.id"), nullable=False, index=True)
    
    # Order
    position = Column(Integer, default=0)
    
    # Timestamp
    added_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    
    # Relationships
    collection = relationship("GalleryCollection", back_populates="items")
    gallery_item = relationship("GalleryItem")
    
    # Unique constraint
    __table_args__ = (
        UniqueConstraint("collection_id", "gallery_item_id", name="uq_collection_item"),
    )
