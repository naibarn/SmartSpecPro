"""
Agency execution models for Agency-Swarm integration.

High-write runtime tables managed by SQLAlchemy/Alembic.
References to Drizzle-owned tables (agency_conversations, agencies) use
plain columns without ForeignKey constraints -- referential integrity is
enforced at the application level.
"""

import enum
from datetime import datetime, timezone

from sqlalchemy import (
    BigInteger,
    Boolean,
    Column,
    DateTime,
    Integer,
    Numeric,
    String,
    Text,
    Index,
)
from sqlalchemy.dialects.postgresql import JSON

from app.core.database import Base


class AgencyRunStatus(str, enum.Enum):
    """Lifecycle status for agency runs."""
    QUEUED = "queued"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"


class AgencyMessage(Base):
    """Individual message within an agency conversation.

    Stores messages from all participants (user, agents, system, tool calls).
    Agent-to-agent messages may have PII redacted before storage.
    """

    __tablename__ = "agency_messages"

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    conversation_id = Column(String(36), nullable=False)
    agent_name = Column(String(100), nullable=True)
    role = Column(String(20), nullable=False)  # user / assistant / system / tool
    content = Column(Text, nullable=True)
    input_tokens = Column(Integer, nullable=True)
    output_tokens = Column(Integer, nullable=True)
    credits_used = Column(Numeric(10, 4), nullable=True)
    tool_calls = Column(JSON, nullable=True)
    parent_message_id = Column(BigInteger, nullable=True)
    pii_redacted = Column(Boolean, nullable=False, default=False)
    created_at = Column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
    )

    # Chat Bridge channel metadata (nullable, added by migration 009)
    source_channel = Column(String(20), nullable=True)
    source_connection_id = Column(String(36), nullable=True)
    external_source_id = Column(String(64), nullable=True)

    __table_args__ = (
        Index("agency_messages_conv_idx", "conversation_id"),
        Index("agency_messages_created_idx", "created_at"),
    )

    def to_dict(self):
        """Convert to dictionary for API responses."""
        return {
            "id": self.id,
            "conversationId": self.conversation_id,
            "agentName": self.agent_name,
            "role": self.role,
            "content": self.content,
            "inputTokens": self.input_tokens,
            "outputTokens": self.output_tokens,
            "creditsUsed": str(self.credits_used) if self.credits_used else None,
            "toolCalls": self.tool_calls,
            "parentMessageId": self.parent_message_id,
            "piiRedacted": self.pii_redacted,
            "createdAt": self.created_at.isoformat() if self.created_at else None,
            "sourceChannel": self.source_channel,
            "sourceConnectionId": self.source_connection_id,
            "externalSourceId": self.external_source_id,
        }


class AgencyRun(Base):
    """Execution record for a single agency invocation.

    Tracks the full lifecycle from queued through completion or failure,
    including credit accounting (gateway cost + multiplier markup).
    """

    __tablename__ = "agency_runs"

    id = Column(String(36), primary_key=True)
    conversation_id = Column(String(36), nullable=False, index=True)
    user_id = Column(Integer, nullable=False)
    agency_id = Column(String(36), nullable=False)
    tenant_id = Column(String(36), nullable=False)
    status = Column(String(20), nullable=False, default=AgencyRunStatus.QUEUED.value)
    total_gateway_cost = Column(Numeric(12, 4), nullable=True)
    multiplier_markup = Column(Numeric(12, 4), nullable=True)
    total_credits_used = Column(Numeric(12, 4), nullable=True)
    started_at = Column(DateTime(timezone=True), nullable=True)
    completed_at = Column(DateTime(timezone=True), nullable=True)
    duration_ms = Column(Integer, nullable=True)
    error_type = Column(String(50), nullable=True)
    error_message = Column(Text, nullable=True)
    step_count = Column(Integer, nullable=True)
    retry_count = Column(Integer, nullable=True)
    run_metadata = Column("metadata", JSON, nullable=True)
    structured_result = Column(JSON, nullable=True)
    structured_result_parse_status = Column(String(20), nullable=True)
    structured_result_intent = Column(String(50), nullable=True)
    structured_result_summary = Column(Text, nullable=True)
    structured_result_error = Column(Text, nullable=True)

    __table_args__ = (
        Index("agency_runs_conv_idx", "conversation_id"),
        Index("agency_runs_tenant_idx", "tenant_id"),
        Index("agency_runs_user_idx", "user_id"),
        Index("agency_runs_status_idx", "status"),
    )

    def to_dict(self):
        """Convert to dictionary for API responses."""
        return {
            "id": self.id,
            "conversationId": self.conversation_id,
            "userId": self.user_id,
            "agencyId": self.agency_id,
            "tenantId": self.tenant_id,
            "status": self.status,
            "totalGatewayCost": str(self.total_gateway_cost) if self.total_gateway_cost else None,
            "multiplierMarkup": str(self.multiplier_markup) if self.multiplier_markup else None,
            "totalCreditsUsed": str(self.total_credits_used) if self.total_credits_used else None,
            "startedAt": self.started_at.isoformat() if self.started_at else None,
            "completedAt": self.completed_at.isoformat() if self.completed_at else None,
            "durationMs": self.duration_ms,
            "errorType": self.error_type,
            "errorMessage": self.error_message,
            "stepCount": self.step_count,
            "retryCount": self.retry_count,
            "metadata": self.run_metadata,
            "structuredResult": self.structured_result,
            "structuredResultParseStatus": self.structured_result_parse_status,
            "structuredResultIntent": self.structured_result_intent,
            "structuredResultSummary": self.structured_result_summary,
            "structuredResultError": self.structured_result_error,
        }


class AgencyRunArtifact(Base):
    """Run-scoped preview and commit tracking for structured agency outputs."""

    __tablename__ = "agency_run_artifacts"

    id = Column(String(36), primary_key=True)
    run_id = Column(String(36), nullable=False, index=True)
    conversation_id = Column(String(36), nullable=False, index=True)
    agency_id = Column(String(36), nullable=False, index=True)
    tenant_id = Column(String(36), nullable=False, index=True)
    artifact_type = Column(String(50), nullable=False)
    intent = Column(String(50), nullable=False)
    state = Column(String(32), nullable=False, default="preview_generated")
    summary = Column(Text, nullable=True)
    payload_json = Column(JSON, nullable=True)
    payload_storage_key = Column(String(255), nullable=True)
    provenance_json = Column(JSON, nullable=True)
    commit_status = Column(String(32), nullable=False, default="not_committed")
    commit_token = Column(String(64), nullable=False, unique=True)
    target_type = Column(String(64), nullable=True)
    target_id = Column(String(128), nullable=True)
    committed_at = Column(DateTime(timezone=True), nullable=True)
    expired_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
    )
    updated_at = Column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
    )

    __table_args__ = (
        Index("agency_run_artifacts_run_idx", "run_id"),
        Index("agency_run_artifacts_conversation_idx", "conversation_id"),
        Index("agency_run_artifacts_tenant_idx", "tenant_id"),
    )

    def to_dict(self):
        """Convert to dictionary for API responses."""
        return {
            "id": self.id,
            "runId": self.run_id,
            "conversationId": self.conversation_id,
            "agencyId": self.agency_id,
            "tenantId": self.tenant_id,
            "artifactType": self.artifact_type,
            "intent": self.intent,
            "state": self.state,
            "summary": self.summary,
            "payloadJson": self.payload_json,
            "payloadStorageKey": self.payload_storage_key,
            "provenanceJson": self.provenance_json,
            "commitStatus": self.commit_status,
            "commitToken": self.commit_token,
            "targetType": self.target_type,
            "targetId": self.target_id,
            "committedAt": self.committed_at.isoformat() if self.committed_at else None,
            "expiredAt": self.expired_at.isoformat() if self.expired_at else None,
            "createdAt": self.created_at.isoformat() if self.created_at else None,
            "updatedAt": self.updated_at.isoformat() if self.updated_at else None,
        }
