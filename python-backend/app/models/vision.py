"""
SQLAlchemy models for multimodal vision/memory tables (Section 03: Vision Pipeline).

IMPORTANT: Column names match the actual PostgreSQL column names from the Drizzle migration.
The Drizzle schema uses camelCase for both JS property names and DB column names
(e.g., "mediaAssetId" in SQL, not "media_asset_id").
"""

from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import Any, List, Optional

from sqlalchemy import (
    BigInteger,
    Column,
    DateTime,
    ForeignKey,
    Integer,
    JSON,
    Numeric,
    String,
    Text,
    func,
)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column

try:
    from pgvector.sqlalchemy import Vector

    _VECTOR_TYPE = Vector(768)
except ImportError:
    # Fallback: store as JSON array if pgvector Python package not available
    _VECTOR_TYPE = JSON  # type: ignore[assignment]


class Base(DeclarativeBase):
    pass


# Re-use shared Base if available
try:
    from app.core.database import Base  # type: ignore[assignment]
except ImportError:
    pass  # Use local Base defined above


class MediaAsset(Base):
    """Maps to the media_assets table created by Drizzle migration."""

    __tablename__ = "media_assets"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    # NOTE: DB columns are camelCase (Drizzle passes the string as-is)
    tenantId: Mapped[str] = mapped_column("tenantId", String(36), nullable=False)
    userId: Mapped[int] = mapped_column("userId", Integer, ForeignKey("users.id"), nullable=False)
    projectId: Mapped[Optional[str]] = mapped_column("projectId", String(100))
    conversationId: Mapped[Optional[int]] = mapped_column(
        "conversationId", Integer, ForeignKey("conversations.id", ondelete="SET NULL")
    )
    messageId: Mapped[Optional[int]] = mapped_column(
        "messageId", Integer, ForeignKey("messages.id", ondelete="SET NULL")
    )
    sourceType: Mapped[Optional[str]] = mapped_column("sourceType", String(32), default="chat_attachment")
    status: Mapped[Optional[str]] = mapped_column(String(32), default="pending")
    storageKey: Mapped[str] = mapped_column("storageKey", Text, nullable=False)
    originalUrl: Mapped[Optional[str]] = mapped_column("originalUrl", Text)
    thumbnailUrl: Mapped[Optional[str]] = mapped_column("thumbnailUrl", Text)
    mimeType: Mapped[str] = mapped_column("mimeType", String(100), nullable=False)
    width: Mapped[Optional[int]] = mapped_column(Integer)
    height: Mapped[Optional[int]] = mapped_column(Integer)
    fileSize: Mapped[Optional[int]] = mapped_column("fileSize", BigInteger)
    checksumSha256: Mapped[Optional[str]] = mapped_column("checksumSha256", String(64))
    perceptualHash: Mapped[Optional[str]] = mapped_column("perceptualHash", String(128))
    createdAt: Mapped[Optional[datetime]] = mapped_column(
        "createdAt", DateTime(timezone=True), server_default=func.now()
    )
    updatedAt: Mapped[Optional[datetime]] = mapped_column(
        "updatedAt", DateTime(timezone=True), server_default=func.now()
    )


class MediaAssetAnalysis(Base):
    """Maps to the media_asset_analysis table."""

    __tablename__ = "media_asset_analysis"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    mediaAssetId: Mapped[int] = mapped_column(
        "mediaAssetId", BigInteger, ForeignKey("media_assets.id", ondelete="CASCADE"), nullable=False
    )
    provider: Mapped[Optional[str]] = mapped_column(String(64))
    model: Mapped[Optional[str]] = mapped_column(String(128))
    shortCaption: Mapped[Optional[str]] = mapped_column("shortCaption", Text)
    detailedCaption: Mapped[Optional[str]] = mapped_column("detailedCaption", Text)
    ocrText: Mapped[Optional[str]] = mapped_column("ocrText", Text)
    objects: Mapped[Optional[Any]] = mapped_column(JSON)
    styles: Mapped[Optional[Any]] = mapped_column(JSON)
    materials: Mapped[Optional[Any]] = mapped_column(JSON)
    colors: Mapped[Optional[Any]] = mapped_column(JSON)
    rooms: Mapped[Optional[Any]] = mapped_column(JSON)
    architectureTags: Mapped[Optional[Any]] = mapped_column("architectureTags", JSON)
    aestheticScore: Mapped[Optional[Decimal]] = mapped_column("aestheticScore", Numeric(4, 3))
    safetyLabels: Mapped[Optional[Any]] = mapped_column("safetyLabels", JSON)
    extractedJson: Mapped[Optional[Any]] = mapped_column("extractedJson", JSON)
    createdAt: Mapped[Optional[datetime]] = mapped_column(
        "createdAt", DateTime(timezone=True), server_default=func.now()
    )


class MultimodalMemoryItem(Base):
    """Maps to the multimodal_memory_items table."""

    __tablename__ = "multimodal_memory_items"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    tenantId: Mapped[Optional[str]] = mapped_column("tenantId", String(36))
    userId: Mapped[Optional[int]] = mapped_column("userId", Integer, ForeignKey("users.id", ondelete="CASCADE"))
    projectId: Mapped[Optional[str]] = mapped_column("projectId", String(100))
    conversationId: Mapped[Optional[int]] = mapped_column(
        "conversationId", Integer, ForeignKey("conversations.id", ondelete="SET NULL")
    )
    messageId: Mapped[Optional[int]] = mapped_column("messageId", Integer)
    mediaAssetId: Mapped[Optional[int]] = mapped_column(
        "mediaAssetId", BigInteger, ForeignKey("media_assets.id", ondelete="CASCADE")
    )
    memoryKind: Mapped[Optional[str]] = mapped_column("memoryKind", String(32))
    title: Mapped[Optional[str]] = mapped_column(Text)
    summary: Mapped[Optional[str]] = mapped_column(Text)
    searchableText: Mapped[str] = mapped_column("searchableText", Text, nullable=False)
    sourceRole: Mapped[Optional[str]] = mapped_column("sourceRole", String(16))
    salience: Mapped[Optional[Decimal]] = mapped_column(Numeric, default=Decimal("0.500"))
    confidence: Mapped[Optional[Decimal]] = mapped_column(Numeric, default=Decimal("0.800"))
    lastAccessedAt: Mapped[Optional[datetime]] = mapped_column("lastAccessedAt", DateTime(timezone=True))
    accessCount: Mapped[Optional[int]] = mapped_column("accessCount", Integer, default=0)
    createdAt: Mapped[Optional[datetime]] = mapped_column(
        "createdAt", DateTime(timezone=True), server_default=func.now()
    )
    updatedAt: Mapped[Optional[datetime]] = mapped_column(
        "updatedAt", DateTime(timezone=True), server_default=func.now()
    )


class MultimodalMemoryVector(Base):
    """Maps to the multimodal_memory_vectors table."""

    __tablename__ = "multimodal_memory_vectors"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    memoryItemId: Mapped[int] = mapped_column(
        "memoryItemId", BigInteger, ForeignKey("multimodal_memory_items.id", ondelete="CASCADE"), nullable=False
    )
    provider: Mapped[str] = mapped_column(String(64), nullable=False)
    model: Mapped[Optional[str]] = mapped_column(String(128))
    modality: Mapped[Optional[str]] = mapped_column(String(16))
    embedding: Mapped[Optional[Any]] = mapped_column(_VECTOR_TYPE)
    embeddingVersion: Mapped[Optional[str]] = mapped_column("embeddingVersion", String(32))
    createdAt: Mapped[Optional[datetime]] = mapped_column(
        "createdAt", DateTime(timezone=True), server_default=func.now()
    )
