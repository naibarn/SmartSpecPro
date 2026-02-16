"""Library and indexing schema models for unified media/document retrieval."""

from datetime import datetime

from sqlalchemy import (
    Boolean,
    Column,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    JSON,
    String,
    Text,
    UniqueConstraint,
)

from app.core.database import Base


class LibraryItem(Base):
    """Top-level library item metadata and lifecycle state."""

    __tablename__ = "library_items"

    id = Column(Integer, primary_key=True, autoincrement=True)
    tenant_id = Column(String(36), nullable=False, index=True)
    owner_user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)

    item_type = Column(String(32), nullable=False, index=True)
    source = Column(String(64), nullable=False, index=True)
    title = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)

    status = Column(String(32), nullable=False, default="ready", index=True)
    visibility = Column(String(16), nullable=False, default="private", index=True)

    # `metadata` is reserved in SQLAlchemy declarative, so map DB column via alias.
    metadata_json = Column("metadata", JSON, nullable=False, default=dict)

    source_url = Column(Text, nullable=True)
    thumbnail_url = Column(Text, nullable=True)

    deleted_at = Column(DateTime, nullable=True, index=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at = Column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)

    __table_args__ = (
        Index("ix_library_items_tenant_visibility_status", "tenant_id", "visibility", "status"),
        Index("ix_library_items_tenant_owner_status", "tenant_id", "owner_user_id", "status"),
        Index("ix_library_items_source_type", "source", "item_type"),
    )

    def __init__(self, **kwargs):
        if "metadata" in kwargs and "metadata_json" not in kwargs:
            kwargs["metadata_json"] = kwargs.pop("metadata")
        super().__init__(**kwargs)


class LibraryLink(Base):
    """Stable source lineage mapping for each library item."""

    __tablename__ = "library_links"

    id = Column(Integer, primary_key=True, autoincrement=True)
    library_item_id = Column(
        Integer,
        ForeignKey("library_items.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    link_type = Column(String(64), nullable=False)
    link_id = Column(String(128), nullable=False)
    provider_task_id = Column(String(128), nullable=True, index=True)
    tenant_id = Column(String(36), nullable=True, index=True)

    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)

    __table_args__ = (
        UniqueConstraint("link_type", "link_id", "tenant_id", name="library_links_source_tenant_unique"),
        Index("ix_library_links_item_type", "library_item_id", "link_type"),
    )


class LibraryChunk(Base):
    """Chunk-level content records used for indexing and retrieval."""

    __tablename__ = "library_chunks"

    id = Column(Integer, primary_key=True, autoincrement=True)
    tenant_id = Column(String(36), nullable=False, index=True)
    library_item_id = Column(
        Integer,
        ForeignKey("library_items.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    chunk_index = Column(Integer, nullable=False)
    content = Column(Text, nullable=False)
    content_type = Column(String(32), nullable=False, default="text")
    token_count = Column(Integer, nullable=True)
    vector_ref_id = Column(String(128), nullable=True, index=True)

    metadata_json = Column("metadata", JSON, nullable=False, default=dict)

    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)

    __table_args__ = (
        UniqueConstraint("library_item_id", "chunk_index", name="uq_library_chunks_item_chunk"),
        Index("ix_library_chunks_tenant_content_type", "tenant_id", "content_type"),
    )

    def __init__(self, **kwargs):
        if "metadata" in kwargs and "metadata_json" not in kwargs:
            kwargs["metadata_json"] = kwargs.pop("metadata")
        super().__init__(**kwargs)


class LibraryPermission(Base):
    """ACL extension table for per-item sharing controls."""

    __tablename__ = "library_permissions"

    id = Column(Integer, primary_key=True, autoincrement=True)
    tenant_id = Column(String(36), nullable=False, index=True)
    library_item_id = Column(
        Integer,
        ForeignKey("library_items.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    subject_type = Column(String(32), nullable=False)
    subject_id = Column(String(64), nullable=False)
    permission_level = Column(String(32), nullable=False, default="read")
    granted_by_user_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)

    expires_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at = Column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)

    __table_args__ = (
        UniqueConstraint(
            "library_item_id",
            "subject_type",
            "subject_id",
            name="uq_library_permissions_subject",
        ),
        Index("ix_library_permissions_tenant_subject", "tenant_id", "subject_type", "subject_id"),
    )


class LibraryIndexJob(Base):
    """Async indexing queue state and retry metadata."""

    __tablename__ = "library_index_jobs"

    id = Column(Integer, primary_key=True, autoincrement=True)
    tenant_id = Column(String(36), nullable=False, index=True)
    library_item_id = Column(
        Integer,
        ForeignKey("library_items.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    job_type = Column(String(64), nullable=False)
    status = Column(String(24), nullable=False, default="pending", index=True)
    attempt_count = Column(Integer, nullable=False, default=0)
    max_attempts = Column(Integer, nullable=False, default=5)

    run_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    next_retry_at = Column(DateTime, nullable=True, index=True)

    last_error = Column(Text, nullable=True)
    started_at = Column(DateTime, nullable=True)
    completed_at = Column(DateTime, nullable=True)

    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at = Column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)

    __table_args__ = (
        Index("ix_library_index_jobs_tenant_status_run_at", "tenant_id", "status", "run_at"),
        Index("ix_library_index_jobs_status_retry", "status", "next_retry_at"),
        Index("ix_library_index_jobs_item_status", "library_item_id", "status"),
    )


class LibraryBackfillCampaign(Base):
    """Persistent backfill/reindex campaign checkpoint and counter state."""

    __tablename__ = "library_backfill_campaigns"

    id = Column(Integer, primary_key=True, autoincrement=True)
    tenant_id = Column(String(36), nullable=True, index=True)
    domain = Column(String(16), nullable=False, default="library", index=True)
    status = Column(String(24), nullable=False, default="queued", index=True)

    cursor = Column(Integer, nullable=False, default=0)
    queued_count = Column(Integer, nullable=False, default=0)
    processed_count = Column(Integer, nullable=False, default=0)
    succeeded_count = Column(Integer, nullable=False, default=0)
    failed_count = Column(Integer, nullable=False, default=0)
    skipped_count = Column(Integer, nullable=False, default=0)

    checkpoint_json = Column("checkpoint", JSON, nullable=False, default=dict)
    diagnostics_json = Column("diagnostics", JSON, nullable=False, default=dict)
    last_error = Column(Text, nullable=True)

    started_at = Column(DateTime, nullable=True)
    completed_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at = Column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)

    __table_args__ = (
        Index("ix_library_backfill_campaign_domain_status", "domain", "status"),
        Index("ix_library_backfill_campaign_tenant_domain", "tenant_id", "domain"),
    )


class LibraryProviderSwitchState(Base):
    """Persistent switch-state and governance controls for provider cutover."""

    __tablename__ = "library_provider_switch_states"

    id = Column(Integer, primary_key=True, autoincrement=True)
    tenant_id = Column(String(36), nullable=True, index=True)

    current_read_provider = Column(String(64), nullable=False, default="cloudflare_vectorize")
    target_provider = Column(String(64), nullable=True)
    previous_read_provider = Column(String(64), nullable=True)

    campaign_id = Column(Integer, nullable=True)
    campaign_status = Column(String(24), nullable=False, default="idle", index=True)
    status = Column(String(24), nullable=False, default="idle", index=True)
    switch_version = Column(Integer, nullable=False, default=1)
    readiness_gate = Column(String(64), nullable=False, default="coverage_95_plus_smoke")

    freeze_non_emergency_edits = Column(Boolean, nullable=False, default=False)
    mirror_writes = Column(Boolean, nullable=False, default=False)

    readiness_json = Column("readiness", JSON, nullable=False, default=dict)
    reconciliation_json = Column("reconciliation", JSON, nullable=False, default=dict)
    last_rollback_reason = Column(Text, nullable=True)

    started_at = Column(DateTime, nullable=True)
    completed_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at = Column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)

    __table_args__ = (
        Index("ix_library_provider_switch_state_tenant_status", "tenant_id", "status"),
        Index("ix_library_provider_switch_state_campaign", "campaign_status", "status"),
    )
