"""Tests for docker_executor.py sandbox migration.

Verifies that command execution routes through sandbox when enabled.
"""

import subprocess
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

pytestmark = [pytest.mark.sandbox, pytest.mark.unit]


class TestDockerExecutorSandbox:
    """Verify docker_executor.py routes through sandbox when enabled."""

    @pytest.mark.asyncio
    async def test_execute_uses_sandbox_when_sandbox_mode(self):
        """Commands dispatch to sandbox runner in SANDBOX mode."""
        from app.services.docker_executor import DockerExecutor, DockerExecutionMode

        runner = AsyncMock()
        runner.run_command.return_value = subprocess.CompletedProcess(
            args=["echo", "hello"], returncode=0, stdout="hello\n", stderr=""
        )

        executor = DockerExecutor(mode=DockerExecutionMode.SANDBOX)
        executor._sandbox_runner = runner

        returncode, stdout, stderr = await executor.execute(["echo", "hello"])

        runner.run_command.assert_called_once()
        assert returncode == 0
        assert stdout == "hello\n"

    @pytest.mark.asyncio
    async def test_execute_uses_host_when_host_mode(self):
        """Commands use asyncio subprocess in HOST mode (no sandbox)."""
        from app.services.docker_executor import DockerExecutor, DockerExecutionMode

        executor = DockerExecutor(mode=DockerExecutionMode.HOST)

        mock_process = AsyncMock()
        mock_process.returncode = 0
        mock_process.communicate.return_value = (b"hello\n", b"")

        with patch("asyncio.create_subprocess_exec", return_value=mock_process):
            with patch("asyncio.wait_for", return_value=(b"hello\n", b"")):
                returncode, stdout, stderr = await executor.execute(
                    ["echo", "hello"], capture_output=True
                )

    @pytest.mark.asyncio
    async def test_sandbox_mode_exists_in_enum(self):
        """DockerExecutionMode has a SANDBOX variant."""
        from app.services.docker_executor import DockerExecutionMode

        assert hasattr(DockerExecutionMode, "SANDBOX")
        assert DockerExecutionMode.SANDBOX.value == "sandbox"
