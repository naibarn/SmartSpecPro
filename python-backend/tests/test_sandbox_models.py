"""
Tests for sandbox SQLAlchemy models.

Validates model structure, column mappings, and enum definitions.
"""
import pytest
from sqlalchemy import inspect as sa_inspect

from app.models.sandbox import (
    SandboxProfile,
    SandboxJob,
    SandboxArtifact,
    TenantSandboxPolicy,
    SandboxExecutionMode,
    SandboxJobStatus,
    SandboxArtifactType,
    SandboxFeatureType,
    SandboxNetworkAction,
)

pytestmark = [pytest.mark.unit, pytest.mark.sandbox]


class TestSandboxProfileModel:
    """SandboxProfile maps to sandbox_profiles table."""

    def test_tablename_is_sandbox_profiles(self):
        assert SandboxProfile.__tablename__ == "sandbox_profiles"

    def test_has_required_columns(self):
        mapper = sa_inspect(SandboxProfile)
        col_names = [attr.key for attr in mapper.column_attrs]
        required = [
            "id", "slug", "name", "execution_mode", "base_image",
            "cpu_limit", "memory_limit_mb", "timeout_seconds",
            "network_default_action", "is_active", "version",
        ]
        for col in required:
            assert col in col_names, f"Missing column: {col}"

    def test_slug_is_unique(self):
        mapper = sa_inspect(SandboxProfile)
        slug_col = mapper.columns["slug"]
        assert slug_col.unique is True

    def test_to_dict_returns_expected_keys(self):
        profile = SandboxProfile()
        profile.id = 1
        profile.slug = "test"
        profile.name = "Test"
        profile.execution_mode = "code"
        profile.base_image = "python:3.11"
        profile.cpu_limit = "1000m"
        profile.memory_limit_mb = 2048
        profile.ephemeral_disk_mb = 5120
        profile.timeout_seconds = 300
        profile.network_default_action = "deny"
        profile.allow_browser = False
        profile.allow_command = False
        profile.allow_code_interpreter = True
        profile.allow_file_upload = True
        profile.max_input_mb = 50
        profile.max_output_mb = 100
        profile.is_active = True
        profile.version = 1
        d = profile.to_dict()
        assert d["slug"] == "test"
        assert d["executionMode"] == "code"
        assert d["cpuLimit"] == "1000m"


class TestSandboxJobModel:
    """SandboxJob maps to sandbox_jobs table."""

    def test_tablename_is_sandbox_jobs(self):
        assert SandboxJob.__tablename__ == "sandbox_jobs"

    def test_has_required_columns(self):
        mapper = sa_inspect(SandboxJob)
        col_names = [attr.key for attr in mapper.column_attrs]
        required = [
            "id", "tenant_id", "user_id", "feature_type",
            "execution_mode", "status",
        ]
        for col in required:
            assert col in col_names, f"Missing column: {col}"

    def test_status_default_is_accepted(self):
        mapper = sa_inspect(SandboxJob)
        status_col = mapper.columns["status"]
        assert status_col.default is not None

    def test_to_dict_returns_expected_keys(self):
        job = SandboxJob()
        job.id = "test-uuid"
        job.tenant_id = "t1"
        job.user_id = 1
        job.feature_type = "chat"
        job.execution_mode = "code"
        job.status = "accepted"
        job.created_at = None
        d = job.to_dict()
        assert d["id"] == "test-uuid"
        assert d["status"] == "accepted"


class TestSandboxArtifactModel:
    """SandboxArtifact maps to sandbox_artifacts table."""

    def test_tablename_is_sandbox_artifacts(self):
        assert SandboxArtifact.__tablename__ == "sandbox_artifacts"

    def test_has_required_columns(self):
        mapper = sa_inspect(SandboxArtifact)
        col_names = [attr.key for attr in mapper.column_attrs]
        required = ["id", "sandbox_job_id", "artifact_type", "object_key"]
        for col in required:
            assert col in col_names, f"Missing column: {col}"

    def test_foreign_key_references_sandbox_jobs(self):
        mapper = sa_inspect(SandboxArtifact)
        fks = list(mapper.columns["sandbox_job_id"].foreign_keys)
        assert len(fks) == 1
        assert "sandbox_jobs.id" in str(fks[0])


class TestTenantSandboxPolicyModel:
    """TenantSandboxPolicy maps to tenant_sandbox_policies table."""

    def test_tablename_is_tenant_sandbox_policies(self):
        assert TenantSandboxPolicy.__tablename__ == "tenant_sandbox_policies"

    def test_has_required_columns(self):
        mapper = sa_inspect(TenantSandboxPolicy)
        col_names = [attr.key for attr in mapper.column_attrs]
        required = [
            "id", "tenant_id", "max_concurrent_sandboxes",
            "max_daily_runtime_seconds", "max_single_job_seconds",
        ]
        for col in required:
            assert col in col_names, f"Missing column: {col}"

    def test_tenant_id_is_unique(self):
        mapper = sa_inspect(TenantSandboxPolicy)
        tenant_col = mapper.columns["tenant_id"]
        assert tenant_col.unique is True


class TestSandboxEnums:
    """Enum definitions match expected values."""

    def test_execution_mode_values(self):
        values = [e.value for e in SandboxExecutionMode]
        assert set(values) == {"code", "command", "browser", "file", "media"}

    def test_job_status_values(self):
        values = [e.value for e in SandboxJobStatus]
        assert len(values) == 12
        assert "accepted" in values
        assert "completed" in values
        assert "failed" in values

    def test_artifact_type_values(self):
        values = [e.value for e in SandboxArtifactType]
        assert set(values) == {"primary", "log", "screenshot", "thumbnail", "chunk", "debug"}

    def test_feature_type_values(self):
        values = [e.value for e in SandboxFeatureType]
        assert set(values) == {"chat", "skill", "workflow", "library", "media", "presentation", "connector"}

    def test_network_action_values(self):
        values = [e.value for e in SandboxNetworkAction]
        assert set(values) == {"deny", "allow"}
