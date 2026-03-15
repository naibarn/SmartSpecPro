"""Durable live-browser runtime models."""

from __future__ import annotations

from datetime import datetime
import enum

from sqlalchemy import JSON, Column, DateTime, ForeignKey, Index, Integer, String, Text
from sqlalchemy.orm import relationship

from app.core.database import Base


class LiveBrowserSourceType(str, enum.Enum):
    AUTOMATION = "automation"
    WORKFLOW = "workflow"
    AGENCY = "agency"


class LiveBrowserSessionStatus(str, enum.Enum):
    CREATED = "created"
    PROVISIONING = "provisioning"
    READY = "ready"
    AGENT_RUNNING = "agent_running"
    WAITING_FOR_HUMAN = "waiting_for_human"
    HUMAN_CONTROLLING = "human_controlling"
    WAITING_FOR_RUNTIME_RECOVERY = "waiting_for_runtime_recovery"
    FAILED_RECOVERY_REQUIRED = "failed_recovery_required"
    COMPLETED = "completed"
    CANCELLED = "cancelled"
    FAILED = "failed"
    EXPIRED = "expired"


class LiveBrowserControlMode(str, enum.Enum):
    OBSERVE = "observe"
    APPROVE_ONLY = "approve_only"
    TAKEOVER = "takeover"
    AGENT_CONTROL = "agent_control"


class LiveBrowserActorType(str, enum.Enum):
    AGENT = "agent"
    USER = "user"
    SYSTEM = "system"
    POLICY = "policy"


class LiveBrowserEventType(str, enum.Enum):
    SESSION_CREATED = "session_created"
    SESSION_STATE_CHANGED = "session_state_changed"
    STREAM_READY = "stream_ready"
    FRAME_UPDATED = "frame_updated"
    URL_CHANGED = "url_changed"
    COMMAND_QUEUED = "command_queued"
    COMMAND_STARTED = "command_started"
    COMMAND_COMPLETED = "command_completed"
    COMMAND_FAILED = "command_failed"
    ASSIST_REQUESTED = "assist_requested"
    ASSIST_RESOLVED = "assist_resolved"
    APPROVAL_REQUESTED = "approval_requested"
    APPROVAL_RESOLVED = "approval_resolved"
    TAKEOVER_STARTED = "takeover_started"
    TAKEOVER_LEASE_EXPIRING = "takeover_lease_expiring"
    TAKEOVER_ENDED = "takeover_ended"
    INCIDENT = "incident"
    AGENT_STARTED = "agent_started"
    AGENT_RESUMED = "agent_resumed"
    NAVIGATION_COMPLETED = "navigation_completed"
    SESSION_COMPLETED = "session_completed"
    SESSION_FAILED = "session_failed"


class LiveBrowserSession(Base):
    __tablename__ = "live_browser_sessions"

    id = Column(String(64), primary_key=True)
    tenant_id = Column("tenantId", String(36), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False)
    user_id = Column("userId", Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    source_type = Column("sourceType", String(32), nullable=False)
    source_id = Column("sourceId", String(128), nullable=True)
    status = Column("status", String(64), nullable=False, default=LiveBrowserSessionStatus.CREATED.value)
    control_mode = Column("controlMode", String(64), nullable=False, default=LiveBrowserControlMode.OBSERVE.value)
    session_version = Column("sessionVersion", Integer, nullable=False, default=1)
    controller_actor_type = Column("controllerActorType", String(32), nullable=True)
    controller_actor_id = Column("controllerActorId", String(64), nullable=True)
    controller_connection_id = Column("controllerConnectionId", String(128), nullable=True)
    controller_lease_expires_at = Column("controllerLeaseExpiresAt", DateTime(timezone=True), nullable=True)
    runtime_owner_id = Column("runtimeOwnerId", String(128), nullable=True)
    runtime_owner_claimed_at = Column("runtimeOwnerClaimedAt", DateTime(timezone=True), nullable=True)
    pause_reason = Column("pauseReason", String(128), nullable=True)
    pending_assist_request_id = Column("pendingAssistRequestId", String(64), nullable=True)
    pending_approval_request_id = Column("pendingApprovalRequestId", String(64), nullable=True)
    policy_context_json = Column("policyContextJson", JSON, nullable=False, default=dict)
    browser_context_ref = Column("browserContextRef", JSON, nullable=False, default=dict)
    stream_ref = Column("streamRef", JSON, nullable=False, default=dict)
    active_tab_count = Column("activeTabCount", Integer, nullable=False, default=1)
    started_at = Column("startedAt", DateTime(timezone=True), nullable=False, default=datetime.utcnow)
    last_activity_at = Column("lastActivityAt", DateTime(timezone=True), nullable=False, default=datetime.utcnow)
    ended_at = Column("endedAt", DateTime(timezone=True), nullable=True)
    end_reason = Column("endReason", String(128), nullable=True)

    events = relationship("LiveBrowserEvent", back_populates="session", cascade="all, delete-orphan")
    idempotency_keys = relationship(
        "LiveBrowserIdempotencyKey",
        back_populates="session",
        cascade="all, delete-orphan",
    )

    __table_args__ = (
        Index("live_browser_sessions_tenant_status_idx", "tenantId", "status"),
        Index("live_browser_sessions_user_activity_idx", "userId", "lastActivityAt"),
        Index("live_browser_sessions_runtime_owner_idx", "runtimeOwnerId", "runtimeOwnerClaimedAt"),
    )


class LiveBrowserIdempotencyKey(Base):
    __tablename__ = "live_browser_idempotency_keys"

    id = Column(Integer, primary_key=True, autoincrement=True)
    session_id = Column("sessionId", String(64), ForeignKey("live_browser_sessions.id", ondelete="CASCADE"), nullable=False)
    idempotency_key = Column("idempotencyKey", String(128), nullable=False)
    command_type = Column("commandType", String(64), nullable=False)
    response_json = Column("responseJson", JSON, nullable=False, default=dict)
    created_at = Column("createdAt", DateTime(timezone=True), nullable=False, default=datetime.utcnow)
    expires_at = Column("expiresAt", DateTime(timezone=True), nullable=False)

    session = relationship("LiveBrowserSession", back_populates="idempotency_keys")

    __table_args__ = (
        Index("uq_live_browser_idempotency_keys_session_key", "sessionId", "idempotencyKey", unique=True),
        Index("live_browser_idempotency_keys_expires_idx", "expiresAt"),
    )


class LiveBrowserEvent(Base):
    __tablename__ = "live_browser_events"

    id = Column(String(64), primary_key=True)
    session_id = Column("sessionId", String(64), ForeignKey("live_browser_sessions.id", ondelete="CASCADE"), nullable=False)
    session_version_at = Column("sessionVersionAt", Integer, nullable=False)
    tenant_id = Column("tenantId", String(36), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False)
    event_type = Column("eventType", String(64), nullable=False)
    actor_type = Column("actorType", String(32), nullable=False)
    actor_id = Column("actorId", String(64), nullable=True)
    payload_json = Column("payloadJson", JSON, nullable=False, default=dict)
    screenshot_ref = Column("screenshotRef", String(255), nullable=True)
    cursor = Column("cursor", String(255), nullable=False)
    created_at = Column("createdAt", DateTime(timezone=True), nullable=False, default=datetime.utcnow)

    session = relationship("LiveBrowserSession", back_populates="events")

    __table_args__ = (
        Index("uq_live_browser_events_session_cursor", "sessionId", "cursor", unique=True),
        Index("live_browser_events_session_created_idx", "sessionId", "createdAt"),
        Index("live_browser_events_session_version_idx", "sessionId", "sessionVersionAt"),
    )


class LiveBrowserAssistRequest(Base):
    __tablename__ = "live_browser_assist_requests"

    id = Column(String(64), primary_key=True)
    session_id = Column("sessionId", String(64), ForeignKey("live_browser_sessions.id", ondelete="CASCADE"), nullable=False)
    session_version_at = Column("sessionVersionAt", Integer, nullable=False)
    tenant_id = Column("tenantId", String(36), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False)
    request_type = Column("requestType", String(32), nullable=False)
    status = Column(String(32), nullable=False, default="pending")
    prompt = Column(Text, nullable=False)
    context_json = Column("contextJson", JSON, nullable=False, default=dict)
    response_json = Column("responseJson", JSON, nullable=False, default=dict)
    resolved_session_version_at = Column("resolvedSessionVersionAt", Integer, nullable=True)
    requested_at = Column("requestedAt", DateTime(timezone=True), nullable=False, default=datetime.utcnow)
    resolved_at = Column("resolvedAt", DateTime(timezone=True), nullable=True)

    __table_args__ = (
        Index("live_browser_assist_requests_session_status_idx", "sessionId", "status"),
        Index("live_browser_assist_requests_session_requested_idx", "sessionId", "requestedAt"),
    )


class LiveBrowserControlTransfer(Base):
    __tablename__ = "live_browser_control_transfers"

    id = Column(String(64), primary_key=True)
    session_id = Column("sessionId", String(64), ForeignKey("live_browser_sessions.id", ondelete="CASCADE"), nullable=False)
    session_version_at = Column("sessionVersionAt", Integer, nullable=False)
    tenant_id = Column("tenantId", String(36), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False)
    from_actor_type = Column("fromActorType", String(32), nullable=False)
    from_actor_id = Column("fromActorId", String(64), nullable=True)
    to_actor_type = Column("toActorType", String(32), nullable=False)
    to_actor_id = Column("toActorId", String(64), nullable=True)
    reason = Column(String(128), nullable=False)
    policy_check_hash = Column("policyCheckHash", String(128), nullable=True)
    created_at = Column("createdAt", DateTime(timezone=True), nullable=False, default=datetime.utcnow)

    __table_args__ = (
        Index("live_browser_control_transfers_session_created_idx", "sessionId", "createdAt"),
    )
