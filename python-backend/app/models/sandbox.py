"""
Sandbox execution models for OpenSandbox integration.

Maps to tables created by Drizzle ORM migrations:
- sandbox_profiles
- sandbox_jobs
- sandbox_artifacts
- tenant_sandbox_policies
"""
import enum
from datetime import datetime, timezone

from sqlalchemy import (
    BigInteger,
    Boolean,
    Column,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import JSONB

from app.core.database import Base


class SandboxExecutionMode(str, enum.Enum):
    """Execution mode for sandbox jobs."""
    CODE = "code"
    COMMAND = "command"
    BROWSER = "browser"
    FILE = "file"
    MEDIA = "media"


class SandboxJobStatus(str, enum.Enum):
    """Lifecycle status for sandbox jobs."""
    ACCEPTED = "accepted"
    POLICY_RESOLVED = "policy_resolved"
    QUEUED = "queued"
    PROVISIONING = "provisioning"
    STAGING_INPUTS = "staging_inputs"
    EXECUTING = "executing"
    COLLECTING_OUTPUTS = "collecting_outputs"
    PERSISTING = "persisting"
    COMPLETED = "completed"
    FAILED = "failed"
    TIMED_OUT = "timed_out"
    CANCELED = "canceled"


class SandboxArtifactType(str, enum.Enum):
    """Classification for sandbox output artifacts."""
    PRIMARY = "primary"
    LOG = "log"
    SCREENSHOT = "screenshot"
    THUMBNAIL = "thumbnail"
    CHUNK = "chunk"
    DEBUG = "debug"


class SandboxFeatureType(str, enum.Enum):
    """Which SmartSpecPro feature triggered the sandbox job."""
    CHAT = "chat"
    SKILL = "skill"
    WORKFLOW = "workflow"
    LIBRARY = "library"
    MEDIA = "media"
    PRESENTATION = "presentation"
    CONNECTOR = "connector"


class SandboxNetworkAction(str, enum.Enum):
    """Network default action for sandbox profiles."""
    DENY = "deny"
    ALLOW = "allow"


class SandboxProfile(Base):
    """Reusable sandbox runtime configuration profiles."""

    __tablename__ = "sandbox_profiles"

    id = Column(Integer, primary_key=True, autoincrement=True)
    slug = Column(String(64), nullable=False, unique=True, index=True)
    name = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)

    execution_mode = Column("executionMode", String(16), nullable=False)
    base_image = Column("baseImage", String(512), nullable=False)
    entrypoint_template = Column("entrypointTemplate", Text, nullable=True)

    cpu_limit = Column("cpuLimit", String(16), nullable=False, default="1000m")
    memory_limit_mb = Column("memoryLimitMb", Integer, nullable=False, default=2048)
    ephemeral_disk_mb = Column("ephemeralDiskMb", Integer, nullable=False, default=5120)
    timeout_seconds = Column("timeoutSeconds", Integer, nullable=False, default=300)

    network_default_action = Column("networkDefaultAction", String(8), nullable=False, default="deny")
    allow_browser = Column("allowBrowser", Boolean, nullable=False, default=False)
    allow_command = Column("allowCommand", Boolean, nullable=False, default=False)
    allow_code_interpreter = Column("allowCodeInterpreter", Boolean, nullable=False, default=False)
    allow_file_upload = Column("allowFileUpload", Boolean, nullable=False, default=True)

    max_input_mb = Column("maxInputMb", Integer, nullable=True, default=50)
    max_output_mb = Column("maxOutputMb", Integer, nullable=True, default=100)

    is_active = Column("isActive", Boolean, nullable=False, default=True)
    version = Column(Integer, nullable=False, default=1)

    created_at = Column("createdAt", DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc))
    updated_at = Column("updatedAt", DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc))

    def to_dict(self):
        """Convert to dictionary for API responses."""
        return {
            "id": self.id,
            "slug": self.slug,
            "name": self.name,
            "description": self.description,
            "executionMode": self.execution_mode,
            "baseImage": self.base_image,
            "cpuLimit": self.cpu_limit,
            "memoryLimitMb": self.memory_limit_mb,
            "ephemeralDiskMb": self.ephemeral_disk_mb,
            "timeoutSeconds": self.timeout_seconds,
            "networkDefaultAction": self.network_default_action,
            "allowBrowser": self.allow_browser,
            "allowCommand": self.allow_command,
            "allowCodeInterpreter": self.allow_code_interpreter,
            "allowFileUpload": self.allow_file_upload,
            "maxInputMb": self.max_input_mb,
            "maxOutputMb": self.max_output_mb,
            "isActive": self.is_active,
            "version": self.version,
        }


class SandboxJob(Base):
    """Canonical execution record for a sandbox job."""

    __tablename__ = "sandbox_jobs"

    id = Column(String(36), primary_key=True)
    tenant_id = Column("tenantId", String(36), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False)
    user_id = Column("userId", Integer, ForeignKey("users.id"), nullable=False)

    feature_type = Column("featureType", String(16), nullable=False)
    feature_ref_id = Column("featureRefId", String(128), nullable=True)
    execution_mode = Column("executionMode", String(16), nullable=False)

    sandbox_profile_id = Column("sandboxProfileId", Integer, ForeignKey("sandbox_profiles.id"), nullable=True)
    opensandbox_id = Column("opensandboxId", String(128), nullable=True)

    status = Column(String(24), nullable=False, default=SandboxJobStatus.ACCEPTED.value)
    status_reason = Column("statusReason", Text, nullable=True)

    image_uri = Column("imageUri", String(512), nullable=True)
    input_manifest_json = Column("inputManifestJson", JSONB, nullable=True)
    output_manifest_json = Column("outputManifestJson", JSONB, nullable=True)

    stdout_excerpt = Column("stdoutExcerpt", Text, nullable=True)
    stderr_excerpt = Column("stderrExcerpt", Text, nullable=True)

    cost_estimate = Column("costEstimate", Numeric(12, 4), nullable=True)
    cost_actual = Column("costActual", Numeric(12, 4), nullable=True)
    idempotency_key = Column("idempotencyKey", String(128), nullable=True)

    started_at = Column("startedAt", DateTime(timezone=True), nullable=True)
    finished_at = Column("finishedAt", DateTime(timezone=True), nullable=True)
    expires_at = Column("expiresAt", DateTime(timezone=True), nullable=True)

    created_at = Column("createdAt", DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc))
    updated_at = Column("updatedAt", DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc))

    __table_args__ = (
        Index("sandbox_jobs_tenant_status_idx", "tenantId", "status"),
        Index("sandbox_jobs_opensandbox_id_idx", "opensandboxId"),
        Index("sandbox_jobs_user_idx", "userId"),
        Index("sandbox_jobs_created_idx", "createdAt"),
        Index("sandbox_jobs_expires_idx", "expiresAt"),
    )

    def to_dict(self):
        """Convert to dictionary for API responses."""
        return {
            "id": self.id,
            "tenantId": self.tenant_id,
            "userId": self.user_id,
            "featureType": self.feature_type,
            "featureRefId": self.feature_ref_id,
            "executionMode": self.execution_mode,
            "sandboxProfileId": self.sandbox_profile_id,
            "opensandboxId": self.opensandbox_id,
            "status": self.status,
            "statusReason": self.status_reason,
            "costEstimate": str(self.cost_estimate) if self.cost_estimate else None,
            "costActual": str(self.cost_actual) if self.cost_actual else None,
            "startedAt": self.started_at.isoformat() if self.started_at else None,
            "finishedAt": self.finished_at.isoformat() if self.finished_at else None,
            "createdAt": self.created_at.isoformat() if self.created_at else None,
        }


class SandboxArtifact(Base):
    """Output file record from a sandbox job."""

    __tablename__ = "sandbox_artifacts"

    id = Column(Integer, primary_key=True, autoincrement=True)
    sandbox_job_id = Column("sandboxJobId", String(36), ForeignKey("sandbox_jobs.id", ondelete="CASCADE"), nullable=False)

    artifact_type = Column("artifactType", String(16), nullable=False)
    object_key = Column("objectKey", String(512), nullable=False)
    mime_type = Column("mimeType", String(128), nullable=True)
    size_bytes = Column("sizeBytes", BigInteger, nullable=True)
    sha256 = Column(String(64), nullable=True)
    is_primary = Column("isPrimary", Boolean, nullable=False, default=False)
    metadata_json = Column("metadataJson", JSONB, nullable=True)

    created_at = Column("createdAt", DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc))

    __table_args__ = (
        Index("sandbox_artifacts_job_idx", "sandboxJobId"),
        Index("sandbox_artifacts_type_idx", "artifactType"),
    )

    def to_dict(self):
        """Convert to dictionary for API responses."""
        return {
            "id": self.id,
            "sandboxJobId": self.sandbox_job_id,
            "artifactType": self.artifact_type,
            "objectKey": self.object_key,
            "mimeType": self.mime_type,
            "sizeBytes": self.size_bytes,
            "sha256": self.sha256,
            "isPrimary": self.is_primary,
        }


class TenantSandboxPolicy(Base):
    """Per-tenant sandbox usage limits and configuration."""

    __tablename__ = "tenant_sandbox_policies"

    id = Column(Integer, primary_key=True, autoincrement=True)
    tenant_id = Column("tenantId", String(36), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, unique=True)

    default_profile_id = Column("defaultProfileId", Integer, ForeignKey("sandbox_profiles.id"), nullable=True)
    max_concurrent_sandboxes = Column("maxConcurrentSandboxes", Integer, nullable=False, default=5)
    max_daily_runtime_seconds = Column("maxDailyRuntimeSeconds", Integer, nullable=False, default=36000)
    max_single_job_seconds = Column("maxSingleJobSeconds", Integer, nullable=False, default=1800)

    default_network_action = Column("defaultNetworkAction", String(8), nullable=True)
    egress_rules_json = Column("egressRulesJson", JSONB, nullable=True)
    allowed_images_json = Column("allowedImagesJson", JSONB, nullable=True)

    created_at = Column("createdAt", DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc))
    updated_at = Column("updatedAt", DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc))

    def to_dict(self):
        """Convert to dictionary for API responses."""
        return {
            "id": self.id,
            "tenantId": self.tenant_id,
            "defaultProfileId": self.default_profile_id,
            "maxConcurrentSandboxes": self.max_concurrent_sandboxes,
            "maxDailyRuntimeSeconds": self.max_daily_runtime_seconds,
            "maxSingleJobSeconds": self.max_single_job_seconds,
            "defaultNetworkAction": self.default_network_action,
        }
