"""Tests for OpenSandbox Pydantic models."""
import pytest
from datetime import datetime, timezone


@pytest.mark.unit
@pytest.mark.sandbox
class TestSandboxModels:
    """Validate Pydantic model construction, serialization, and defaults."""

    def test_sandbox_config_defaults(self):
        """SandboxConfig should have sane defaults for cpu, memory, timeout."""
        from app.integrations.opensandbox.models import SandboxConfig

        config = SandboxConfig()
        assert config.image == "python:3.11-slim"
        assert config.timeout_seconds == 300
        assert config.cpu_limit == "1000m"
        assert config.memory_limit_mb == 2048
        assert config.disk_limit_mb == 5120
        assert config.network_action == "deny"
        assert config.env_vars == {}
        assert config.metadata == {}

    def test_sandbox_config_custom_values(self):
        """SandboxConfig accepts all custom overrides."""
        from app.integrations.opensandbox.models import SandboxConfig

        config = SandboxConfig(
            image="node:20-slim",
            timeout_seconds=600,
            cpu_limit="2000m",
            memory_limit_mb=4096,
            disk_limit_mb=10240,
            network_action="allow",
            env_vars={"NODE_ENV": "production"},
            metadata={"job_id": "abc123"},
        )
        assert config.image == "node:20-slim"
        assert config.timeout_seconds == 600
        assert config.env_vars == {"NODE_ENV": "production"}

    def test_sandbox_status_from_api_response(self):
        """SandboxStatus parses a typical OpenSandbox API JSON response."""
        from app.integrations.opensandbox.models import SandboxStatus

        data = {
            "id": "sb-abc123",
            "status": "running",
            "created_at": "2026-02-26T10:00:00Z",
            "metadata": {"job_id": "job-1"},
        }
        status = SandboxStatus.model_validate(data)
        assert status.id == "sb-abc123"
        assert status.status == "running"
        assert status.metadata == {"job_id": "job-1"}

    def test_command_result_captures_all_fields(self):
        """CommandResult stores exit_code, stdout, stderr."""
        from app.integrations.opensandbox.models import CommandResult

        result = CommandResult(
            exit_code=0,
            stdout="hello world\n",
            stderr="",
        )
        assert result.exit_code == 0
        assert result.stdout == "hello world\n"
        assert result.stderr == ""

    def test_file_entry_serialization(self):
        """FileEntry round-trips through model_dump/model_validate."""
        from app.integrations.opensandbox.models import FileEntry

        entry = FileEntry(
            name="output.mp4",
            path="/workspace/output.mp4",
            size=1024000,
            is_directory=False,
        )
        dumped = entry.model_dump()
        restored = FileEntry.model_validate(dumped)
        assert restored.name == entry.name
        assert restored.path == entry.path
        assert restored.size == entry.size

    def test_sandbox_job_request_validation(self):
        """SandboxJobRequest rejects missing required fields."""
        from pydantic import ValidationError

        from app.integrations.opensandbox.models import SandboxJobRequest

        with pytest.raises(ValidationError):
            SandboxJobRequest()  # missing required: tenant_id, user_id, feature_type, execution_mode

        # Valid with required fields
        req = SandboxJobRequest(
            tenant_id=1,
            user_id=42,
            feature_type="skill",
            execution_mode="code",
        )
        assert req.tenant_id == 1
        assert req.profile_slug == "code-default"

    def test_sandbox_job_response_includes_timing(self):
        """SandboxJobResponse includes started_at, finished_at, duration_ms."""
        from app.integrations.opensandbox.models import SandboxJobResponse

        now = datetime.now(timezone.utc)
        resp = SandboxJobResponse(
            job_id="job-123",
            status="completed",
            exit_code=0,
            stdout_excerpt="OK",
            started_at=now,
            finished_at=now,
            duration_ms=1500,
            cost_actual=0.02,
        )
        assert resp.duration_ms == 1500
        assert resp.started_at is not None
        assert resp.finished_at is not None
        assert resp.cost_actual == 0.02
