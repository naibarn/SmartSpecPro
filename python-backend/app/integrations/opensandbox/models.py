"""OpenSandbox Pydantic models for requests and responses."""
from datetime import datetime
from typing import Any, Optional

from pydantic import BaseModel, ConfigDict, Field, model_validator


class SandboxConfig(BaseModel):
    """Parameters for creating a new sandbox container."""

    model_config = ConfigDict(populate_by_name=True, extra="ignore")

    image: str = "python:3.11-slim"
    timeout_seconds: int = 300
    env_vars: dict[str, str] = Field(default_factory=dict)
    cpu_limit: str = "1000m"
    memory_limit_mb: int = 2048
    disk_limit_mb: int = 5120
    network_action: str = Field(default="deny", alias="network_default_action")
    entrypoint: list[str] = Field(default_factory=lambda: ["sleep", "infinity"])
    metadata: dict[str, str] = Field(default_factory=dict)

    def to_create_payload(self) -> dict[str, Any]:
        """Build OpenSandbox lifecycle payload for POST /v1/sandboxes."""
        payload: dict[str, Any] = {
            "image": {"uri": self.image},
            "timeout": self.timeout_seconds,
            "resourceLimits": {
                "cpu": self.cpu_limit,
                "memory": f"{self.memory_limit_mb}Mi",
                "ephemeral-storage": f"{self.disk_limit_mb}Mi",
            },
            "network": {
                "defaultAction": self.network_action,
            },
            "entrypoint": self.entrypoint,
            "env": self.env_vars or None,
            "metadata": self.metadata or None,
        }
        # Drop empty optional fields.
        return {k: v for k, v in payload.items() if v is not None}


class SandboxStatus(BaseModel):
    """Status of an existing sandbox."""

    model_config = ConfigDict(populate_by_name=True, extra="ignore")

    id: str
    status: str  # creating, running, stopped, error
    created_at: Optional[datetime] = Field(default=None, alias="createdAt")
    reason: Optional[str] = None
    message: Optional[str] = None
    last_transition_at: Optional[datetime] = Field(default=None, alias="lastTransitionAt")
    metadata: dict[str, Any] = Field(default_factory=dict)

    @model_validator(mode="before")
    @classmethod
    def normalize_status_shape(cls, value: Any) -> Any:
        """Accept both legacy flat status and lifecycle status object."""
        if not isinstance(value, dict):
            return value
        status_obj = value.get("status")
        if isinstance(status_obj, dict):
            normalized = dict(value)
            normalized["status"] = status_obj.get("state", "unknown").lower()
            normalized["reason"] = status_obj.get("reason")
            normalized["message"] = status_obj.get("message")
            normalized["lastTransitionAt"] = status_obj.get("lastTransitionAt")
            return normalized
        return value


class CommandResult(BaseModel):
    """Result of a command or code execution."""

    model_config = ConfigDict(populate_by_name=True, extra="ignore")

    exit_code: int = Field(alias="exitCode")
    stdout: str = ""
    stderr: str = ""


class FileEntry(BaseModel):
    """A file or directory entry in the sandbox filesystem."""

    model_config = ConfigDict(populate_by_name=True, extra="ignore")

    name: str
    path: str
    size: int = 0
    is_directory: bool = Field(default=False, alias="isDirectory")
    modified_at: Optional[datetime] = Field(default=None, alias="modifiedAt")


class SandboxJobRequest(BaseModel):
    """Internal request to create a sandbox job."""

    tenant_id: int
    user_id: int
    feature_type: str  # chat, skill, workflow, library, media, presentation, connector
    feature_ref_id: Optional[str] = None
    execution_mode: str  # code, command, browser, file, media
    profile_slug: str = "code-default"
    input_manifest: list[dict[str, Any]] = Field(default_factory=list)
    command: Optional[str] = None
    code: Optional[str] = None
    language: Optional[str] = None
    timeout_override: Optional[int] = None
    idempotency_key: Optional[str] = None


class SandboxJobResponse(BaseModel):
    """Response from a completed sandbox job."""

    job_id: str
    status: str
    exit_code: Optional[int] = None
    stdout_excerpt: Optional[str] = None
    stderr_excerpt: Optional[str] = None
    output_manifest: list[dict[str, Any]] = Field(default_factory=list)
    started_at: Optional[datetime] = None
    finished_at: Optional[datetime] = None
    duration_ms: Optional[int] = None
    cost_actual: Optional[float] = None
