"""Durable callback event models for media provider webhooks."""

from datetime import datetime
import enum

from sqlalchemy import Column, DateTime, ForeignKey, Index, Integer, JSON, String, Text

from app.core.database import Base


class CallbackEventStatus(str, enum.Enum):
    """Lifecycle status for callback events."""

    PENDING = "pending"
    PROCESSING = "processing"
    RETRY_PENDING = "retry_pending"
    COMPLETED = "completed"
    FAILED = "failed"


class CallbackDLQStatus(str, enum.Enum):
    """Status for dead-letter callback entries."""

    PENDING = "pending"
    REPROCESSED = "reprocessed"
    DISCARDED = "discarded"


class MediaCallbackEvent(Base):
    """Durable callback event ledger for idempotent processing."""

    __tablename__ = "media_callback_events"

    id = Column(Integer, primary_key=True, autoincrement=True)
    provider_name = Column(String(64), nullable=False, default="kie_ai", index=True)
    provider_task_id = Column(String(128), nullable=True, index=True)
    event_fingerprint = Column(String(64), nullable=False, unique=True, index=True)

    payload = Column(JSON, nullable=False, default=dict)
    normalized_status = Column(String(32), nullable=True)
    result_url = Column(Text, nullable=True)
    error_message = Column(Text, nullable=True)

    status = Column(String(24), nullable=False, default=CallbackEventStatus.PENDING.value, index=True)
    attempt_count = Column(Integer, nullable=False, default=0)
    max_attempts = Column(Integer, nullable=False, default=5)
    next_retry_at = Column(DateTime, nullable=True, index=True)

    processed_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at = Column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)

    __table_args__ = (
        Index("ix_media_callback_events_status_retry", "status", "next_retry_at"),
        Index("ix_media_callback_events_provider_task_status", "provider_task_id", "status"),
    )


class MediaCallbackDLQ(Base):
    """Dead-letter queue entries for terminal callback failures."""

    __tablename__ = "media_callback_dlq"

    id = Column(Integer, primary_key=True, autoincrement=True)
    event_id = Column(Integer, ForeignKey("media_callback_events.id", ondelete="SET NULL"), nullable=True, index=True)

    provider_name = Column(String(64), nullable=False, default="kie_ai", index=True)
    provider_task_id = Column(String(128), nullable=True, index=True)
    event_fingerprint = Column(String(64), nullable=False, index=True)

    payload = Column(JSON, nullable=False, default=dict)
    error_message = Column(Text, nullable=False)
    retry_count = Column(Integer, nullable=False, default=0)
    status = Column(String(24), nullable=False, default=CallbackDLQStatus.PENDING.value, index=True)

    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    resolved_at = Column(DateTime, nullable=True)
