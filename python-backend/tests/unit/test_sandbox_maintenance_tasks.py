"""Tests for sandbox maintenance Celery tasks."""
import pytest
from contextlib import contextmanager
from datetime import datetime, timedelta, timezone
from unittest.mock import patch, MagicMock

from app.tasks.sandbox_maintenance_tasks import (
    cleanup_expired_sandbox_jobs,
    cleanup_orphan_sandboxes,
    detect_stuck_sandbox_jobs,
)

pytestmark = [pytest.mark.unit, pytest.mark.sandbox]


def _mock_session_ctx(mock_session):
    """Create a context manager mock that yields the mock session."""
    @contextmanager
    def ctx():
        yield mock_session
    return ctx


class TestCleanupExpiredSandboxJobs:
    """Data retention: delete sandbox_jobs older than 30 days."""

    @patch("app.tasks.sandbox_maintenance_tasks.get_sync_session")
    def test_deletes_expired_jobs_and_artifacts(self, mock_get_session):
        """Jobs with terminal status and finished_at > 30 days are deleted."""
        mock_session = MagicMock()
        mock_result_artifacts = MagicMock()
        mock_result_artifacts.rowcount = 5
        mock_result_jobs = MagicMock()
        mock_result_jobs.rowcount = 3
        mock_session.execute.side_effect = [mock_result_artifacts, mock_result_jobs]
        mock_get_session.side_effect = _mock_session_ctx(mock_session)

        result = cleanup_expired_sandbox_jobs()

        assert result["deleted_jobs"] == 3
        assert result["deleted_artifacts"] == 5

    @patch("app.tasks.sandbox_maintenance_tasks.get_sync_session")
    def test_handles_database_error(self, mock_get_session):
        """Returns error dict when DB query fails."""
        mock_session = MagicMock()
        mock_session.execute.side_effect = Exception("DB down")
        mock_get_session.side_effect = _mock_session_ctx(mock_session)

        result = cleanup_expired_sandbox_jobs()
        assert "error" in result


class TestOrphanSandboxCleanup:
    """Detect sandboxes without active sandbox_jobs records."""

    @patch("app.tasks.sandbox_maintenance_tasks._is_sandbox_enabled", return_value=False)
    def test_skips_when_opensandbox_disabled(self, mock_enabled):
        """When OPENSANDBOX_ENABLED=false, task is a no-op."""
        result = cleanup_orphan_sandboxes()
        assert result["skipped"] is True
        assert result["reason"] == "opensandbox_disabled"

    @patch("app.tasks.sandbox_maintenance_tasks._is_sandbox_enabled", return_value=True)
    def test_handles_opensandbox_api_failure(self, mock_enabled):
        """If OpenSandbox API is unreachable, task logs warning and exits.

        Since get_sandbox_client is imported lazily inside the function,
        we mock at the source module level.
        """
        with patch(
            "app.integrations.opensandbox.client.get_sandbox_client"
        ) as mock_factory:
            mock_client = MagicMock()
            mock_client.list_sandboxes = MagicMock(
                side_effect=ConnectionError("unreachable")
            )
            mock_factory.return_value = mock_client

            result = cleanup_orphan_sandboxes()
            assert result.get("error") == "api_unreachable"


class TestStuckJobDetection:
    """Jobs in non-terminal status past their timeout should be marked failed."""

    @patch("app.tasks.sandbox_maintenance_tasks._is_sandbox_enabled", return_value=False)
    def test_skips_when_disabled(self, mock_enabled):
        """No-op when sandbox is disabled."""
        result = detect_stuck_sandbox_jobs()
        assert result["skipped"] is True

    @patch("app.tasks.sandbox_maintenance_tasks._is_sandbox_enabled", return_value=True)
    @patch("app.tasks.sandbox_maintenance_tasks.get_sync_session")
    def test_marks_stuck_executing_job_as_timed_out(self, mock_get_session, mock_enabled):
        """Job with status 'executing' past timeout gets status='timed_out'."""
        now = datetime.now(timezone.utc)
        old_time = now - timedelta(seconds=600)  # 10 minutes ago

        mock_session = MagicMock()

        # First query: find non-terminal jobs
        mock_select_result = MagicMock()
        mock_select_result.fetchall.return_value = [
            # (id, status, created_at, started_at, opensandbox_id, timeout_seconds)
            ("job-1", "executing", old_time, old_time, None, 300),
        ]

        # Second query: UPDATE to timed_out
        mock_update_result = MagicMock()
        mock_update_result.rowcount = 1

        mock_session.execute.side_effect = [mock_select_result, mock_update_result]
        mock_get_session.side_effect = _mock_session_ctx(mock_session)

        result = detect_stuck_sandbox_jobs()

        assert result["detected_count"] == 1
        assert result["resolved_count"] == 1

    @patch("app.tasks.sandbox_maintenance_tasks._is_sandbox_enabled", return_value=True)
    @patch("app.tasks.sandbox_maintenance_tasks.get_sync_session")
    def test_preserves_recently_started_jobs(self, mock_get_session, mock_enabled):
        """Jobs within their timeout window are not affected."""
        now = datetime.now(timezone.utc)
        recent_time = now - timedelta(seconds=30)  # Just 30s ago

        mock_session = MagicMock()
        mock_select_result = MagicMock()
        mock_select_result.fetchall.return_value = [
            ("job-2", "executing", recent_time, recent_time, None, 300),
        ]
        mock_session.execute.side_effect = [mock_select_result]
        mock_get_session.side_effect = _mock_session_ctx(mock_session)

        result = detect_stuck_sandbox_jobs()

        assert result["detected_count"] == 0
        assert result["resolved_count"] == 0
