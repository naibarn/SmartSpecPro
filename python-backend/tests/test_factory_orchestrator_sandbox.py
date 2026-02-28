"""Tests for factory_orchestrator.py sandbox migration.

Verifies that _run_cmd routes through sandbox when a runner is provided.
"""

import subprocess
from unittest.mock import MagicMock, patch

import pytest

pytestmark = [pytest.mark.sandbox, pytest.mark.unit]


@pytest.fixture
def mock_runner():
    """Create a mock SandboxMediaRunner with sync interface."""
    runner = MagicMock()
    runner.run_command_sync.return_value = subprocess.CompletedProcess(
        args=["python"], returncode=0, stdout="OK", stderr=""
    )
    return runner


class TestFactoryOrchestratorSandbox:
    """Verify factory_orchestrator.py subprocess calls route through sandbox."""

    def test_run_cmd_uses_runner_when_provided(self, mock_runner):
        """_run_cmd dispatches to runner.run_command_sync when runner is set."""
        from app.orchestrator.factory_orchestrator import SaaSFactoryOrchestrator

        cp = MagicMock()
        with patch("app.orchestrator.factory_orchestrator.validate_workspace", return_value="/tmp/ws"):
            orch = SaaSFactoryOrchestrator(cp, "/tmp/ws")
            orch._runner = mock_runner

            result = orch._run_cmd(["echo", "hello"], "/tmp/ws")

            mock_runner.run_command_sync.assert_called_once()
            assert result.returncode == 0

    def test_run_cmd_uses_subprocess_when_no_runner(self):
        """_run_cmd uses subprocess.run when _runner is None."""
        from app.orchestrator.factory_orchestrator import SaaSFactoryOrchestrator

        cp = MagicMock()
        with patch("app.orchestrator.factory_orchestrator.validate_workspace", return_value="/tmp/ws"):
            orch = SaaSFactoryOrchestrator(cp, "/tmp/ws")

            with patch("subprocess.run") as mock_sub:
                mock_sub.return_value = subprocess.CompletedProcess(
                    args=["echo"], returncode=0, stdout="hello", stderr=""
                )
                result = orch._run_cmd(["echo", "hello"], "/tmp/ws")
                mock_sub.assert_called_once()
