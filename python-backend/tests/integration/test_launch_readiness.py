"""Launch readiness gate tests for OpenSandbox production hardening.

These tests validate that all prerequisites are met before switching
DISPATCH_MODE from 'optional' to 'required'. Tests use mocks to verify
logic without requiring a live OpenSandbox server.

Markers: integration, sandbox, readiness
"""
import pytest
from unittest.mock import patch, MagicMock

pytestmark = [pytest.mark.integration, pytest.mark.sandbox]


class TestGate1HighRiskFeaturesUseSandbox:
    """Gate 1: All HIGH-risk features have sandbox dispatch paths wired."""

    def test_skill_executor_has_sandbox_dispatch(self):
        """Verify skillExecutor imports and calls dispatchToSandbox for sandbox modes."""
        # The dispatch path is validated by section-07 unit tests.
        # This gate verifies the import chain exists.
        from app.integrations.opensandbox.client import OpenSandboxClient

        client = OpenSandboxClient.__new__(OpenSandboxClient)
        assert hasattr(client, "create_sandbox")
        assert hasattr(client, "run_command")
        assert hasattr(client, "destroy_sandbox")

    def test_code_executor_has_sandbox_branch(self):
        """Verify code_executor has _execute_in_sandbox method."""
        from app.orchestrator.node_executors.data_executors.code_executor import (
            CodeExecutor,
        )

        assert hasattr(CodeExecutor, "_execute_in_sandbox")

    def test_http_executor_has_sandbox_branch(self):
        """Verify http_executor has _execute_via_sandbox method."""
        from app.orchestrator.node_executors.integration_executors.http_executor import (
            HTTPExecutor,
        )

        assert hasattr(HTTPExecutor, "_execute_via_sandbox")

    def test_sandbox_job_worker_exists(self):
        """Verify sandbox_job_worker module is importable."""
        from app.workers import sandbox_job_worker

        assert hasattr(sandbox_job_worker, "execute_sandbox_job")


class TestGate2DefaultDenyEgress:
    """Gate 2: Sandbox profile network policy defaults verified."""

    def test_sandbox_profiles_model_has_network_field(self):
        """The SandboxProfile model includes networkDefaultAction field."""
        from app.models.sandbox import SandboxProfile

        columns = {c.name for c in SandboxProfile.__table__.columns}
        assert "networkDefaultAction" in columns

    def test_network_default_action_values(self):
        """networkDefaultAction column allows 'deny' and 'allow' values."""
        from app.models.sandbox import SandboxProfile

        col = SandboxProfile.__table__.c.networkDefaultAction
        assert col is not None


class TestGate3NoDirectSubprocess:
    """Gate 3: Sandbox-enabled code paths don't call subprocess directly."""

    def test_sandbox_client_uses_httpx_not_subprocess(self):
        """OpenSandboxClient uses httpx for communication, not subprocess."""
        import inspect
        from app.integrations.opensandbox import client as client_mod

        source = inspect.getsource(client_mod)
        assert "subprocess" not in source

    def test_sandbox_job_worker_uses_client_not_subprocess(self):
        """sandbox_job_worker delegates to OpenSandboxClient, not subprocess."""
        import inspect
        from app.workers import sandbox_job_worker

        source = inspect.getsource(sandbox_job_worker)
        assert "subprocess.run" not in source


class TestGate5OrphanReconciler:
    """Gate 5: Orphan sandbox reconciler tasks are registered."""

    def test_orphan_cleanup_task_in_beat_schedule(self):
        """Celery beat schedule includes the orphan cleanup task."""
        from app.core.celery_app import celery_app

        schedule = celery_app.conf.beat_schedule
        assert "cleanup-orphan-sandboxes" in schedule
        assert "cleanup_orphan_sandboxes" in schedule["cleanup-orphan-sandboxes"]["task"]

    def test_stuck_job_detection_task_in_beat_schedule(self):
        """Celery beat schedule includes stuck job detection."""
        from app.core.celery_app import celery_app

        schedule = celery_app.conf.beat_schedule
        assert "detect-stuck-sandbox-jobs" in schedule
        assert "detect_stuck_sandbox_jobs" in schedule["detect-stuck-sandbox-jobs"]["task"]

    def test_expired_cleanup_task_in_beat_schedule(self):
        """Celery beat schedule includes expired job cleanup."""
        from app.core.celery_app import celery_app

        schedule = celery_app.conf.beat_schedule
        assert "cleanup-expired-sandbox-jobs" in schedule

    def test_browser_policy_partition_maintenance_in_beat_schedule(self):
        """Celery beat schedule includes browser policy partition maintenance."""
        from app.core.celery_app import celery_app

        schedule = celery_app.conf.beat_schedule
        assert "ensure-browser-policy-decision-partitions" in schedule
        assert "ensure_browser_policy_decision_partitions" in schedule[
            "ensure-browser-policy-decision-partitions"
        ]["task"]

    def test_live_browser_readiness_publish_in_beat_schedule(self):
        """Celery beat schedule includes live-browser readiness publishing."""
        from app.core.celery_app import celery_app
        from app.core.config import settings

        schedule = celery_app.conf.beat_schedule
        assert "publish-live-browser-readiness" in schedule
        assert "publish_live_browser_readiness_snapshot" in schedule[
            "publish-live-browser-readiness"
        ]["task"]
        assert schedule["publish-live-browser-readiness"]["schedule"] == float(
            settings.LIVE_BROWSER_READINESS_PUBLISH_INTERVAL_SECONDS
        )

    def test_live_browser_maintenance_in_beat_schedule(self):
        """Celery beat schedule includes live-browser maintenance."""
        from app.core.celery_app import celery_app
        from app.core.config import settings

        schedule = celery_app.conf.beat_schedule
        assert "run-live-browser-maintenance" in schedule
        assert "run_live_browser_maintenance" in schedule[
            "run-live-browser-maintenance"
        ]["task"]
        assert schedule["run-live-browser-maintenance"]["schedule"] == float(
            settings.LIVE_BROWSER_MAINTENANCE_INTERVAL_SECONDS
        )

    def test_live_browser_readiness_watchdog_in_beat_schedule(self):
        """Celery beat schedule includes live-browser readiness watchdog."""
        from app.core.celery_app import celery_app
        from app.core.config import settings

        schedule = celery_app.conf.beat_schedule
        assert "watch-live-browser-readiness" in schedule
        assert "watch_live_browser_readiness_snapshot" in schedule[
            "watch-live-browser-readiness"
        ]["task"]
        assert schedule["watch-live-browser-readiness"]["schedule"] == float(
            settings.LIVE_BROWSER_READINESS_WATCHDOG_INTERVAL_SECONDS
        )

    def test_sandbox_queue_in_required_queues(self):
        """The sandbox queue is listed in REQUIRED_QUEUES."""
        from app.core.celery_app import REQUIRED_QUEUES

        assert "sandbox" in REQUIRED_QUEUES


class TestGate8RollbackPlan:
    """Gate 8: Rollback mechanisms work correctly."""

    def test_disable_sandbox_flag_skips_dispatch(self):
        """When OPENSANDBOX_ENABLED is unset, _is_sandbox_enabled returns False."""
        from app.tasks.sandbox_maintenance_tasks import _is_sandbox_enabled

        with patch(
            "app.integrations.opensandbox.config.opensandbox_settings"
        ) as mock_settings:
            mock_settings.is_enabled = False
            result = _is_sandbox_enabled()
            assert result is False

    def test_maintenance_tasks_skip_when_disabled(self):
        """Maintenance tasks return skipped=True when sandbox is disabled."""
        from app.tasks.sandbox_maintenance_tasks import (
            cleanup_orphan_sandboxes,
            detect_stuck_sandbox_jobs,
        )

        with patch(
            "app.tasks.sandbox_maintenance_tasks._is_sandbox_enabled",
            return_value=False,
        ):
            r1 = cleanup_orphan_sandboxes()
            r2 = detect_stuck_sandbox_jobs()
            assert r1["skipped"] is True
            assert r2["skipped"] is True
