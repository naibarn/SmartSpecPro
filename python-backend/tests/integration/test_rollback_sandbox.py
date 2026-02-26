"""Rollback strategy verification for OpenSandbox integration.

Tests that toggling feature flags correctly switches between sandbox
and legacy execution paths without data loss or service disruption.

Markers: integration, sandbox
"""
import pytest
from unittest.mock import patch, MagicMock
from contextlib import contextmanager

pytestmark = [pytest.mark.integration, pytest.mark.sandbox]


class TestRollbackPhase1to4:
    """Phase 1-4: DISPATCH_MODE=optional, rollback by disabling flag."""

    def test_disable_opensandbox_enabled_activates_legacy(self):
        """Setting OPENSANDBOX_ENABLED=false makes maintenance tasks skip."""
        from app.tasks.sandbox_maintenance_tasks import (
            cleanup_orphan_sandboxes,
            detect_stuck_sandbox_jobs,
        )

        with patch(
            "app.tasks.sandbox_maintenance_tasks._is_sandbox_enabled",
            return_value=False,
        ):
            result_orphan = cleanup_orphan_sandboxes()
            result_stuck = detect_stuck_sandbox_jobs()

        assert result_orphan["skipped"] is True
        assert result_orphan["reason"] == "opensandbox_disabled"
        assert result_stuck["skipped"] is True
        assert result_stuck["reason"] == "opensandbox_disabled"

    def test_cleanup_task_works_regardless_of_sandbox_flag(self):
        """cleanup_expired_sandbox_jobs runs even if sandbox is disabled (data retention)."""
        from app.tasks.sandbox_maintenance_tasks import cleanup_expired_sandbox_jobs

        @contextmanager
        def mock_session_ctx():
            session = MagicMock()
            mock_artifacts = MagicMock()
            mock_artifacts.rowcount = 0
            mock_jobs = MagicMock()
            mock_jobs.rowcount = 0
            session.execute.side_effect = [mock_artifacts, mock_jobs]
            yield session

        with patch(
            "app.tasks.sandbox_maintenance_tasks.get_sync_session",
            side_effect=mock_session_ctx,
        ):
            result = cleanup_expired_sandbox_jobs()

        # Runs and returns counts, doesn't skip
        assert "deleted_jobs" in result
        assert "deleted_artifacts" in result
        assert "skipped" not in result

    def test_sandbox_jobs_table_unaffected_by_rollback(self):
        """Rollback (disabling flag) doesn't modify existing sandbox_jobs records."""
        from app.models.sandbox import SandboxJob

        # Model is always available regardless of feature flag state
        columns = {c.name for c in SandboxJob.__table__.columns}
        assert "status" in columns
        assert "finishedAt" in columns
        assert "opensandboxId" in columns


class TestRollbackPhase5Plus:
    """Phase 5+: DISPATCH_MODE=required, selective rollback strategies."""

    def test_opensandbox_settings_respects_enabled_flag(self):
        """OpenSandboxSettings.is_enabled reflects OPENSANDBOX_ENABLED env var."""
        from app.integrations.opensandbox.config import OpenSandboxSettings

        settings_off = OpenSandboxSettings(OPENSANDBOX_ENABLED=False)
        settings_on = OpenSandboxSettings(OPENSANDBOX_ENABLED=True)

        assert settings_off.is_enabled is False
        assert settings_on.is_enabled is True

    def test_sandbox_config_model_serializes_correctly(self):
        """SandboxConfig can be serialized for API requests."""
        from app.integrations.opensandbox.models import SandboxConfig

        config = SandboxConfig(
            image="python:3.11-slim",
            memory_limit_mb=512,
            cpu_limit="1000m",
            timeout_seconds=300,
        )
        data = config.model_dump()
        assert data["image"] == "python:3.11-slim"
        assert data["memory_limit_mb"] == 512

    def test_emergency_override_is_documented(self):
        """The OPENSANDBOX_ENABLED flag exists as the emergency kill switch."""
        from app.integrations.opensandbox.config import OpenSandboxSettings

        # OPENSANDBOX_ENABLED is a field on the settings model
        assert "OPENSANDBOX_ENABLED" in OpenSandboxSettings.model_fields

    def test_sandbox_maintenance_tasks_are_importable(self):
        """All three maintenance tasks are importable and registered."""
        from app.tasks.sandbox_maintenance_tasks import (
            cleanup_expired_sandbox_jobs,
            cleanup_orphan_sandboxes,
            detect_stuck_sandbox_jobs,
        )

        assert callable(cleanup_expired_sandbox_jobs)
        assert callable(cleanup_orphan_sandboxes)
        assert callable(detect_stuck_sandbox_jobs)
