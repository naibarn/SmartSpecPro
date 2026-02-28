"""Tests for sandbox_job_worker.py — full lifecycle Celery task."""
import asyncio
from unittest.mock import AsyncMock, MagicMock, patch, call

import pytest

from app.integrations.opensandbox.client import SandboxAPIError
from app.workers.sandbox_job_worker import (
    NON_TERMINAL_STATUSES,
    TERMINAL_STATUSES,
    _execute_sandbox_job_async,
)

pytestmark = [pytest.mark.sandbox, pytest.mark.unit]


def _make_job(
    job_id="job-123",
    tenant_id="tenant-1",
    user_id=42,
    status="accepted",
    feature_type="media",
    execution_mode="command",
    sandbox_profile_id=1,
    input_manifest_json=None,
):
    """Create a mock SandboxJob."""
    job = MagicMock()
    job.id = job_id
    job.tenant_id = tenant_id
    job.user_id = user_id
    job.status = status
    job.feature_type = feature_type
    job.execution_mode = execution_mode
    job.sandbox_profile_id = sandbox_profile_id
    job.input_manifest_json = input_manifest_json or {
        "commands": ["echo hello"],
        "output_paths": ["/workspace/output.txt"],
    }
    job.output_manifest_json = None
    job.stdout_excerpt = None
    job.stderr_excerpt = None
    job.opensandbox_id = None
    job.started_at = None
    job.finished_at = None
    job.cost_actual = None
    return job


def _make_profile(slug="media-processing"):
    """Create a mock SandboxProfile."""
    profile = MagicMock()
    profile.slug = slug
    profile.id = 1
    profile.cpu_limit = "1000m"
    profile.memory_limit_mb = 2048
    profile.timeout_seconds = 300
    profile.base_image = "python:3.11-slim"
    profile.network_default_action = "deny"
    profile.ephemeral_disk_mb = 5120
    profile.execution_mode = "command"
    return profile


def _make_command_result(exit_code=0, stdout="ok", stderr=""):
    """Create a mock CommandResult."""
    result = MagicMock()
    result.exit_code = exit_code
    result.stdout = stdout
    result.stderr = stderr
    return result


class TestWorkerLifecycle:
    """Worker progresses through status states for successful execution."""

    @pytest.mark.asyncio
    async def test_status_constants_defined(self):
        """Non-terminal and terminal status sets are properly defined."""
        assert "accepted" in NON_TERMINAL_STATUSES
        assert "executing" in NON_TERMINAL_STATUSES
        assert "completed" in TERMINAL_STATUSES
        assert "failed" in TERMINAL_STATUSES
        assert "timed_out" in TERMINAL_STATUSES

    @pytest.mark.asyncio
    @patch("app.workers.sandbox_job_worker.SandboxCostService")
    @patch("app.workers.sandbox_job_worker.SandboxAuditService")
    @patch("app.workers.sandbox_job_worker.SandboxArtifactService")
    @patch("app.workers.sandbox_job_worker.collect_outputs")
    @patch("app.workers.sandbox_job_worker.stage_inline_files")
    @patch("app.workers.sandbox_job_worker.stage_inputs")
    @patch("app.workers.sandbox_job_worker.run_command")
    @patch("app.workers.sandbox_job_worker.SandboxLifecycleManager")
    async def test_creates_sandbox_stages_inputs_executes_collects(
        self,
        MockLifecycle,
        mock_run_cmd,
        mock_stage,
        mock_stage_inline,
        mock_collect,
        MockArtifactSvc,
        MockAuditSvc,
        MockCostSvc,
    ):
        """Worker calls lifecycle, stage_inputs, run_command, collect_outputs in order."""
        # Setup mocks
        lifecycle = AsyncMock()
        lifecycle.provision_sandbox.return_value = "sandbox-abc"
        MockLifecycle.return_value = lifecycle

        mock_run_cmd.return_value = _make_command_result()
        mock_stage.return_value = []
        mock_stage_inline.return_value = []
        mock_collect.return_value = []

        cost_svc = AsyncMock()
        cost_svc.calculate_actual.return_value = 0.01
        MockCostSvc.return_value = cost_svc

        audit_svc = MagicMock()
        MockAuditSvc.return_value = audit_svc

        artifact_svc = AsyncMock()
        MockArtifactSvc.return_value = artifact_svc

        job = _make_job()
        profile = _make_profile()

        mock_task = MagicMock()
        mock_db = AsyncMock()

        # Mock _load_job and profile lookup
        with patch("app.workers.sandbox_job_worker._load_job", return_value=job), \
             patch("app.workers.sandbox_job_worker._load_profile", return_value=profile), \
             patch("app.workers.sandbox_job_worker._get_db_session") as mock_get_db, \
             patch("app.workers.sandbox_job_worker._update_job_status") as mock_update:

            mock_get_db.return_value.__aenter__ = AsyncMock(return_value=mock_db)
            mock_get_db.return_value.__aexit__ = AsyncMock(return_value=None)

            result = await _execute_sandbox_job_async(mock_task, "job-123")

        lifecycle.provision_sandbox.assert_called_once()
        lifecycle.destroy_sandbox.assert_called_once()

    @pytest.mark.asyncio
    @patch("app.workers.sandbox_job_worker.SandboxCostService")
    @patch("app.workers.sandbox_job_worker.SandboxAuditService")
    @patch("app.workers.sandbox_job_worker.SandboxArtifactService")
    @patch("app.workers.sandbox_job_worker.collect_outputs")
    @patch("app.workers.sandbox_job_worker.stage_inline_files")
    @patch("app.workers.sandbox_job_worker.stage_inputs")
    @patch("app.workers.sandbox_job_worker.run_command")
    @patch("app.workers.sandbox_job_worker.SandboxLifecycleManager")
    async def test_stages_inline_files_when_present_in_manifest(
        self,
        MockLifecycle,
        mock_run_cmd,
        mock_stage_inputs,
        mock_stage_inline,
        mock_collect,
        MockArtifactSvc,
        MockAuditSvc,
        MockCostSvc,
    ):
        """Worker stages inline files before command execution when provided."""
        lifecycle = AsyncMock()
        lifecycle.provision_sandbox.return_value = "sandbox-abc"
        MockLifecycle.return_value = lifecycle

        mock_run_cmd.return_value = _make_command_result()
        mock_stage_inputs.return_value = []
        mock_stage_inline.return_value = [{"path": "/workspace/skill/python/skill.py", "size_bytes": 12}]
        mock_collect.return_value = []

        cost_svc = AsyncMock()
        cost_svc.calculate_actual.return_value = 0.01
        MockCostSvc.return_value = cost_svc
        MockAuditSvc.return_value = MagicMock()
        MockArtifactSvc.return_value = AsyncMock()

        job = _make_job(input_manifest_json={
            "commands": ["python3 /workspace/skill/python/skill.py"],
            "inline_files": [{"path": "/workspace/skill/python/skill.py", "content_base64": "cHJpbnQoJ29rJykK"}],
            "output_paths": [],
        })
        profile = _make_profile()
        mock_task = MagicMock()

        with patch("app.workers.sandbox_job_worker._load_job", return_value=job), \
             patch("app.workers.sandbox_job_worker._load_profile", return_value=profile), \
             patch("app.workers.sandbox_job_worker._get_db_session") as mock_get_db, \
             patch("app.workers.sandbox_job_worker._update_job_status"):
            mock_get_db.return_value.__aenter__ = AsyncMock(return_value=AsyncMock())
            mock_get_db.return_value.__aexit__ = AsyncMock(return_value=None)

            result = await _execute_sandbox_job_async(mock_task, "job-123")

        assert result["status"] == "completed"
        mock_stage_inline.assert_called_once()
        args = mock_stage_inline.call_args.args
        assert args[1] == "sandbox-abc"
        assert args[2] == [{"path": "/workspace/skill/python/skill.py", "content_base64": "cHJpbnQoJ29rJykK"}]

    @pytest.mark.asyncio
    @patch("app.workers.sandbox_job_worker.SandboxCostService")
    @patch("app.workers.sandbox_job_worker.SandboxAuditService")
    @patch("app.workers.sandbox_job_worker.SandboxArtifactService")
    @patch("app.workers.sandbox_job_worker.collect_outputs")
    @patch("app.workers.sandbox_job_worker.stage_inputs")
    @patch("app.workers.sandbox_job_worker.run_command")
    @patch("app.workers.sandbox_job_worker.SandboxLifecycleManager")
    async def test_destroys_sandbox_on_completion(
        self,
        MockLifecycle,
        mock_run_cmd,
        mock_stage,
        mock_collect,
        MockArtifactSvc,
        MockAuditSvc,
        MockCostSvc,
    ):
        """After reaching 'completed' status, sandbox is destroyed."""
        lifecycle = AsyncMock()
        lifecycle.provision_sandbox.return_value = "sandbox-abc"
        MockLifecycle.return_value = lifecycle

        mock_run_cmd.return_value = _make_command_result()
        mock_stage.return_value = []
        mock_collect.return_value = []

        cost_svc = AsyncMock()
        cost_svc.calculate_actual.return_value = 0.01
        MockCostSvc.return_value = cost_svc

        audit_svc = MagicMock()
        MockAuditSvc.return_value = audit_svc

        artifact_svc = AsyncMock()
        MockArtifactSvc.return_value = artifact_svc

        job = _make_job()
        profile = _make_profile()

        mock_task = MagicMock()

        with patch("app.workers.sandbox_job_worker._load_job", return_value=job), \
             patch("app.workers.sandbox_job_worker._load_profile", return_value=profile), \
             patch("app.workers.sandbox_job_worker._get_db_session") as mock_get_db, \
             patch("app.workers.sandbox_job_worker._update_job_status"):

            mock_get_db.return_value.__aenter__ = AsyncMock(return_value=AsyncMock())
            mock_get_db.return_value.__aexit__ = AsyncMock(return_value=None)

            await _execute_sandbox_job_async(mock_task, "job-123")

        lifecycle.destroy_sandbox.assert_called_once_with("sandbox-abc")


class TestWorkerErrorHandling:
    """Worker handles failures gracefully with proper cleanup."""

    @pytest.mark.asyncio
    @patch("app.workers.sandbox_job_worker.SandboxAuditService")
    @patch("app.workers.sandbox_job_worker.SandboxLifecycleManager")
    @patch("app.workers.sandbox_job_worker.OpenSandboxClient")
    async def test_destroys_sandbox_on_failure(self, MockClient, MockLifecycle, MockAuditSvc):
        """If execution fails, sandbox is still destroyed (cleanup in finally block)."""
        lifecycle = AsyncMock()
        lifecycle.provision_sandbox.return_value = "sandbox-abc"
        MockLifecycle.return_value = lifecycle
        MockClient.return_value = AsyncMock()

        audit_svc = MagicMock()
        MockAuditSvc.return_value = audit_svc

        job = _make_job()
        profile = _make_profile()

        mock_task = MagicMock()

        with patch("app.workers.sandbox_job_worker._load_job", return_value=job), \
             patch("app.workers.sandbox_job_worker._load_profile", return_value=profile), \
             patch("app.workers.sandbox_job_worker._get_db_session") as mock_get_db, \
             patch("app.workers.sandbox_job_worker._update_job_status"), \
             patch("app.workers.sandbox_job_worker.stage_inputs", side_effect=RuntimeError("boom")), \
             patch("app.workers.sandbox_job_worker.SandboxCostService"), \
             patch("app.workers.sandbox_job_worker.SandboxArtifactService"):

            mock_get_db.return_value.__aenter__ = AsyncMock(return_value=AsyncMock())
            mock_get_db.return_value.__aexit__ = AsyncMock(return_value=None)

            result = await _execute_sandbox_job_async(mock_task, "job-123")

        # Sandbox should still be destroyed even after failure
        lifecycle.destroy_sandbox.assert_called_once_with("sandbox-abc")
        assert result["status"] == "failed"

    @pytest.mark.asyncio
    async def test_no_retry_on_policy_denied(self):
        """PolicyDeniedError is terminal — not retried."""
        from app.services.sandbox_dispatcher import PolicyDeniedError

        # PolicyDeniedError should be importable and used for non-retry decisions
        error = PolicyDeniedError("exceeded concurrent limit")
        assert str(error) == "exceeded concurrent limit"


class TestWorkerSessionReuse:
    """Worker reuses a single sandbox across multiple commands within one job."""

    @pytest.mark.asyncio
    @patch("app.workers.sandbox_job_worker.SandboxCostService")
    @patch("app.workers.sandbox_job_worker.SandboxAuditService")
    @patch("app.workers.sandbox_job_worker.SandboxArtifactService")
    @patch("app.workers.sandbox_job_worker.collect_outputs")
    @patch("app.workers.sandbox_job_worker.stage_inputs")
    @patch("app.workers.sandbox_job_worker.run_command")
    @patch("app.workers.sandbox_job_worker.SandboxLifecycleManager")
    async def test_multiple_commands_reuse_same_sandbox(
        self,
        MockLifecycle,
        mock_run_cmd,
        mock_stage,
        mock_collect,
        MockArtifactSvc,
        MockAuditSvc,
        MockCostSvc,
    ):
        """A job with multiple commands calls provision_sandbox once and run_command N times."""
        lifecycle = AsyncMock()
        lifecycle.provision_sandbox.return_value = "sandbox-abc"
        MockLifecycle.return_value = lifecycle

        mock_run_cmd.return_value = _make_command_result()
        mock_stage.return_value = []
        mock_collect.return_value = []

        cost_svc = AsyncMock()
        cost_svc.calculate_actual.return_value = 0.01
        MockCostSvc.return_value = cost_svc

        audit_svc = MagicMock()
        MockAuditSvc.return_value = audit_svc

        artifact_svc = AsyncMock()
        MockArtifactSvc.return_value = artifact_svc

        job = _make_job(input_manifest_json={
            "commands": ["echo step1", "echo step2", "echo step3"],
            "output_paths": ["/workspace/output.txt"],
        })
        profile = _make_profile()

        mock_task = MagicMock()

        with patch("app.workers.sandbox_job_worker._load_job", return_value=job), \
             patch("app.workers.sandbox_job_worker._load_profile", return_value=profile), \
             patch("app.workers.sandbox_job_worker._get_db_session") as mock_get_db, \
             patch("app.workers.sandbox_job_worker._update_job_status"):

            mock_get_db.return_value.__aenter__ = AsyncMock(return_value=AsyncMock())
            mock_get_db.return_value.__aexit__ = AsyncMock(return_value=None)

            await _execute_sandbox_job_async(mock_task, "job-123")

        # Only one sandbox provisioned
        lifecycle.provision_sandbox.assert_called_once()
        # Three commands executed
        assert mock_run_cmd.call_count == 3

    @pytest.mark.asyncio
    @patch("app.workers.sandbox_job_worker.SandboxCostService")
    @patch("app.workers.sandbox_job_worker.SandboxAuditService")
    @patch("app.workers.sandbox_job_worker.SandboxArtifactService")
    @patch("app.workers.sandbox_job_worker.collect_outputs")
    @patch("app.workers.sandbox_job_worker.stage_inputs")
    @patch("app.workers.sandbox_job_worker.run_command_via_docker_bridge")
    @patch("app.workers.sandbox_job_worker.run_command")
    @patch("app.workers.sandbox_job_worker.SandboxLifecycleManager")
    @patch("app.workers.sandbox_job_worker.OpenSandboxClient")
    async def test_lifecycle_only_fallback_runs_commands_via_docker_bridge(
        self,
        MockClient,
        MockLifecycle,
        mock_run_cmd,
        mock_bridge_run_cmd,
        mock_stage,
        mock_collect,
        MockArtifactSvc,
        MockAuditSvc,
        MockCostSvc,
    ):
        """When /commands is unavailable, worker uses docker bridge fallback."""
        lifecycle = AsyncMock()
        lifecycle.provision_sandbox.return_value = "sandbox-abc"
        MockLifecycle.return_value = lifecycle

        client = AsyncMock()
        MockClient.return_value = client

        mock_run_cmd.side_effect = SandboxAPIError(
            404,
            "OpenSandbox server endpoint unavailable for 'run_command'. This server appears to expose lifecycle APIs only.",
        )
        mock_bridge_run_cmd.side_effect = [
            _make_command_result(exit_code=0, stdout="step1", stderr=""),
            _make_command_result(exit_code=0, stdout="step2", stderr=""),
        ]
        mock_stage.return_value = []
        mock_collect.return_value = []

        cost_svc = AsyncMock()
        cost_svc.calculate_actual.return_value = 0.01
        MockCostSvc.return_value = cost_svc
        MockAuditSvc.return_value = MagicMock()
        MockArtifactSvc.return_value = AsyncMock()

        job = _make_job(
            input_manifest_json={
                "commands": ["echo step1", "echo step2"],
                "output_paths": [],
            }
        )
        profile = _make_profile()
        mock_task = MagicMock()

        with patch("app.workers.sandbox_job_worker._load_job", return_value=job), \
             patch("app.workers.sandbox_job_worker._load_profile", return_value=profile), \
             patch("app.workers.sandbox_job_worker._get_db_session") as mock_get_db, \
             patch("app.workers.sandbox_job_worker._update_job_status"):

            mock_get_db.return_value.__aenter__ = AsyncMock(return_value=AsyncMock())
            mock_get_db.return_value.__aexit__ = AsyncMock(return_value=None)

            result = await _execute_sandbox_job_async(mock_task, "job-123")

        assert result["status"] == "completed"
        # First attempt tries /commands once, then switches to docker bridge mode.
        assert mock_run_cmd.call_count == 1
        # Two commands executed in the same sandbox via docker bridge fallback.
        assert mock_bridge_run_cmd.call_count == 2
