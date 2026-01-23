"""
Marketplace Template Models
Templates that users can purchase and import into their projects
"""

from sqlalchemy import Column, String, Integer, Text, Boolean, DateTime, Enum, ForeignKey, JSON, Index, UniqueConstraint
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from datetime import datetime
import enum
import uuid

from app.core.database import Base


class TemplateStatus(str, enum.Enum):
    """Template status in review/approval process"""
    DRAFT = "draft"  # Creator is still editing
    PENDING_REVIEW = "pending_review"  # Submitted for admin review
    APPROVED = "approved"  # Approved and visible in marketplace
    REJECTED = "rejected"  # Rejected by admin
    SUSPENDED = "suspended"  # Temporarily suspended (policy violation)
    ARCHIVED = "archived"  # No longer available for purchase


class TemplateCategory(str, enum.Enum):
    """Template categories"""
    IMAGE_GENERATION = "image_generation"
    VIDEO_GENERATION = "video_generation"
    AUDIO_GENERATION = "audio_generation"
    MEDIA_SUITE = "media_suite"  # Full image+video+audio
    AI_FEATURES = "ai_features"  # Prompt enhancement, etc.
    UI_COMPONENTS = "ui_components"
    BACKEND_SERVICES = "backend_services"
    FULL_STACK = "full_stack"
    INTEGRATIONS = "integrations"  # Third-party API integrations
    UTILITIES = "utilities"


class TechStack(str, enum.Enum):
    """Technology stack compatibility"""
    REACT = "react"
    VUE = "vue"
    ANGULAR = "angular"
    SVELTE = "svelte"
    NEXT_JS = "nextjs"
    PYTHON_FASTAPI = "python_fastapi"
    NODE_EXPRESS = "node_express"
    TYPESCRIPT = "typescript"
    JAVASCRIPT = "javascript"


class MarketplaceTemplate(Base):
    """
    Templates available for purchase in marketplace
    Creator uploads template, admin reviews, users purchase with credits
    """
    __tablename__ = "marketplace_templates"

    # Primary fields
    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()), index=True)
    creator_id = Column(String(36), ForeignKey("users.id"), nullable=False, index=True)

    # Template info
    name = Column(String(255), nullable=False)
    slug = Column(String(255), unique=True, nullable=False, index=True)  # URL-friendly name
    tagline = Column(String(500), nullable=False)  # Short description
    description = Column(Text, nullable=False)  # Full markdown description

    # Categorization
    category = Column(Enum(TemplateCategory), nullable=False, index=True)
    tags = Column(JSON, nullable=True)  # Array of string tags
    tech_stack = Column(JSON, nullable=False)  # Array of TechStack enums

    # Pricing
    price_credits = Column(Integer, nullable=False)  # Price in credits

    # Status and visibility
    status = Column(Enum(TemplateStatus), default=TemplateStatus.DRAFT, nullable=False, index=True)
    is_featured = Column(Boolean, default=False, nullable=False, index=True)

    # File storage
    template_file_url = Column(Text, nullable=False)  # ZIP file URL in R2/S3
    preview_images = Column(JSON, nullable=True)  # Array of image URLs
    demo_video_url = Column(Text, nullable=True)

    # Template metadata
    version = Column(String(50), default="1.0.0", nullable=False)
    readme_content = Column(Text, nullable=True)  # README.md content
    changelog = Column(Text, nullable=True)  # Version history

    # Requirements
    min_smartspec_version = Column(String(50), nullable=True)
    dependencies = Column(JSON, nullable=True)  # Required packages/libraries

    # Statistics
    download_count = Column(Integer, default=0, nullable=False)
    purchase_count = Column(Integer, default=0, nullable=False)
    rating_average = Column(Integer, nullable=True)  # 1-5 stars (x100 for precision)
    rating_count = Column(Integer, default=0, nullable=False)
    view_count = Column(Integer, default=0, nullable=False)

    # Revenue tracking
    total_revenue_credits = Column(Integer, default=0, nullable=False)  # Total earned (85%)
    platform_commission_credits = Column(Integer, default=0, nullable=False)  # Platform earned (15%)

    # Review process
    submitted_at = Column(DateTime(timezone=True), nullable=True)
    reviewed_at = Column(DateTime(timezone=True), nullable=True)
    reviewed_by = Column(String(36), ForeignKey("users.id"), nullable=True)
    review_notes = Column(Text, nullable=True)  # Admin feedback
    rejection_reason = Column(Text, nullable=True)

    # Timestamps
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)
    published_at = Column(DateTime(timezone=True), nullable=True)

    # Relationships
    creator = relationship("User", foreign_keys=[creator_id])
    reviewer = relationship("User", foreign_keys=[reviewed_by])
    purchases = relationship("TemplatePurchase", back_populates="template", lazy="dynamic")
    reviews = relationship("TemplateReview", back_populates="template", lazy="dynamic")

    # Indexes for performance and security
    __table_args__ = (
        Index('idx_template_status_category', status, category),
        Index('idx_template_featured_status', is_featured, status),
        Index('idx_template_creator_status', creator_id, status),
        # New indexes for analytics and revenue queries
        Index('idx_template_creator_revenue', creator_id, total_revenue_credits),
        Index('idx_template_purchase_count', purchase_count.desc()),
        Index('idx_template_rating', rating_average.desc(), rating_count),
        # Index for pending reviews
        Index('idx_template_status_submitted', status, submitted_at.desc()),
    )

    def to_dict(self):
        """Convert to dictionary for API responses"""
        return {
            "id": self.id,
            "creator_id": self.creator_id,
            "name": self.name,
            "slug": self.slug,
            "tagline": self.tagline,
            "description": self.description,
            "category": self.category.value,
            "tags": self.tags or [],
            "tech_stack": self.tech_stack or [],
            "price_credits": self.price_credits,
            "status": self.status.value,
            "is_featured": self.is_featured,
            "template_file_url": self.template_file_url if self.status == TemplateStatus.APPROVED else None,
            "preview_images": self.preview_images or [],
            "demo_video_url": self.demo_video_url,
            "version": self.version,
            "readme_content": self.readme_content,
            "min_smartspec_version": self.min_smartspec_version,
            "dependencies": self.dependencies or [],
            "download_count": self.download_count,
            "purchase_count": self.purchase_count,
            "rating_average": self.rating_average / 100.0 if self.rating_average else None,
            "rating_count": self.rating_count,
            "view_count": self.view_count,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
            "published_at": self.published_at.isoformat() if self.published_at else None,
        }


class TemplatePurchase(Base):
    """
    Record of template purchases
    Tracks credit transactions and enables download access
    """
    __tablename__ = "template_purchases"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()), index=True)
    template_id = Column(String(36), ForeignKey("marketplace_templates.id"), nullable=False, index=True)
    buyer_id = Column(String(36), ForeignKey("users.id"), nullable=False, index=True)

    # Transaction details
    price_paid_credits = Column(Integer, nullable=False)  # Price at time of purchase
    creator_revenue = Column(Integer, nullable=False)  # 85% to creator
    platform_commission = Column(Integer, nullable=False)  # 15% to platform

    # Buyer's credit balance at time of purchase
    buyer_balance_before = Column(Integer, nullable=False)
    buyer_balance_after = Column(Integer, nullable=False)

    # Download tracking
    download_count = Column(Integer, default=0, nullable=False)
    last_downloaded_at = Column(DateTime(timezone=True), nullable=True)

    # Purchase metadata
    template_version = Column(String(50), nullable=False)  # Version purchased
    purchased_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    # Relationships
    template = relationship("MarketplaceTemplate", back_populates="purchases")
    buyer = relationship("User", foreign_keys=[buyer_id])

    # Indexes and constraints
    __table_args__ = (
        Index('idx_purchase_buyer_template', buyer_id, template_id),
        Index('idx_purchase_template_date', template_id, purchased_at),
        # CRITICAL: Unique constraint to prevent duplicate purchases
        UniqueConstraint('buyer_id', 'template_id', name='uq_purchase_buyer_template'),
    )

    def to_dict(self):
        return {
            "id": self.id,
            "template_id": self.template_id,
            "buyer_id": self.buyer_id,
            "price_paid_credits": self.price_paid_credits,
            "template_version": self.template_version,
            "download_count": self.download_count,
            "last_downloaded_at": self.last_downloaded_at.isoformat() if self.last_downloaded_at else None,
            "purchased_at": self.purchased_at.isoformat() if self.purchased_at else None,
        }


class TemplateReview(Base):
    """
    User reviews and ratings for purchased templates
    """
    __tablename__ = "template_reviews"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()), index=True)
    template_id = Column(String(36), ForeignKey("marketplace_templates.id"), nullable=False, index=True)
    reviewer_id = Column(String(36), ForeignKey("users.id"), nullable=False, index=True)
    purchase_id = Column(String(36), ForeignKey("template_purchases.id"), nullable=False)

    # Review content
    rating = Column(Integer, nullable=False)  # 1-5 stars
    title = Column(String(255), nullable=True)
    review_text = Column(Text, nullable=True)

    # Helpful votes
    helpful_count = Column(Integer, default=0, nullable=False)

    # Moderation
    is_verified_purchase = Column(Boolean, default=True, nullable=False)
    is_hidden = Column(Boolean, default=False, nullable=False)  # Admin can hide

    # Timestamps
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

    # Relationships
    template = relationship("MarketplaceTemplate", back_populates="reviews")
    reviewer = relationship("User", foreign_keys=[reviewer_id])
    purchase = relationship("TemplatePurchase")

    # Constraints: One review per purchase
    __table_args__ = (
        Index('idx_review_template_rating', template_id, rating),
        Index('idx_review_purchase', purchase_id, unique=True),
    )

    def to_dict(self):
        return {
            "id": self.id,
            "template_id": self.template_id,
            "reviewer_id": self.reviewer_id,
            "rating": self.rating,
            "title": self.title,
            "review_text": self.review_text,
            "helpful_count": self.helpful_count,
            "is_verified_purchase": self.is_verified_purchase,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }


class TemplateRevenueLedger(Base):
    """
    Detailed ledger of revenue distribution
    Tracks all credit flows for transparency
    """
    __tablename__ = "template_revenue_ledger"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    purchase_id = Column(String(36), ForeignKey("template_purchases.id"), nullable=False, index=True)
    template_id = Column(String(36), ForeignKey("marketplace_templates.id"), nullable=False, index=True)

    # Parties involved
    buyer_id = Column(String(36), ForeignKey("users.id"), nullable=False)
    creator_id = Column(String(36), ForeignKey("users.id"), nullable=False)

    # Credit flow
    total_credits = Column(Integer, nullable=False)  # 100%
    creator_credits = Column(Integer, nullable=False)  # 85%
    platform_credits = Column(Integer, nullable=False)  # 15%

    # Transaction timestamp
    recorded_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    # Relationships
    purchase = relationship("TemplatePurchase")
    template = relationship("MarketplaceTemplate")

    __table_args__ = (
        Index('idx_ledger_creator_date', creator_id, recorded_at),
        Index('idx_ledger_template_date', template_id, recorded_at),
    )

    def to_dict(self):
        return {
            "id": self.id,
            "purchase_id": self.purchase_id,
            "template_id": self.template_id,
            "buyer_id": self.buyer_id,
            "creator_id": self.creator_id,
            "total_credits": self.total_credits,
            "creator_credits": self.creator_credits,
            "platform_credits": self.platform_credits,
            "recorded_at": self.recorded_at.isoformat() if self.recorded_at else None,
        }
