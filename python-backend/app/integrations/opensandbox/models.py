"""OpenSandbox Pydantic models for requests and responses."""
from datetime import datetime
from typing import Any, Optional

from pydantic import BaseModel, Field


class SandboxConfig(BaseModel):
    """Parameters for creating a new sandbox container."""

    image: str = "python:3.11-slim"
    timeout_seconds: int = 300
    env_vars: dict[str, str] = Field(default_factory=dict)
    cpu_limit: str = "1000m"
    memory_limit_mb: int = 2048
    disk_limit_mb: int = 5120
    network_action: str = "deny"
    metadata: dict[str, str] = Field(default_factory=dict)


class SandboxStatus(BaseModel):
    """Status of an existing sandbox."""

    id: str
    status: str  # creating, running, stopped, error
    created_at: Optional[datetime] = None
    metadata: dict[str, Any] = Field(default_factory=dict)


class CommandResult(BaseModel):
    """Result of a command or code execution."""

    exit_code: int
    stdout: str = ""
    stderr: str = ""


class FileEntry(BaseModel):
    """A file or directory entry in the sandbox filesystem."""

    name: str
    path: str
    size: int = 0
    is_directory: bool = False
    modified_at: Optional[datetime] = None


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
