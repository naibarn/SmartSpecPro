"""Tests for OpenSandbox execution functions."""
import pytest
from unittest.mock import AsyncMock


@pytest.mark.unit
@pytest.mark.sandbox
class TestSandboxExecution:
    """Tests for run_command and run_code."""

    async def test_run_command_returns_exit_code_stdout_stderr(self):
        """run_command() returns a CommandResult with all three fields."""
        from app.integrations.opensandbox.execution import run_command
        from app.integrations.opensandbox.models import CommandResult

        mock_client = AsyncMock()
        mock_client.run_command = AsyncMock(
            return_value=CommandResult(exit_code=0, stdout="output\n", stderr="")
        )

        result = await run_command(mock_client, "sb-1", "echo output")
        assert result.exit_code == 0
        assert result.stdout == "output\n"
        assert result.stderr == ""

    async def test_run_command_respects_timeout(self):
        """run_command() passes timeout to the client call."""
        from app.integrations.opensandbox.execution import run_command
        from app.integrations.opensandbox.models import CommandResult

        mock_client = AsyncMock()
        mock_client.run_command = AsyncMock(
            return_value=CommandResult(exit_code=0, stdout="", stderr="")
        )

        await run_command(mock_client, "sb-1", "sleep 5", timeout=60)
        mock_client.run_command.assert_called_once_with("sb-1", "sleep 5", timeout=60)

    async def test_run_code_sends_to_interpreter_endpoint(self):
        """run_code() sends code and language to the code interpreter API."""
        from app.integrations.opensandbox.execution import run_code
        from app.integrations.opensandbox.models import CommandResult

        mock_client = AsyncMock()
        mock_client.execute_code = AsyncMock(
            return_value=CommandResult(exit_code=0, stdout="42\n", stderr="")
        )

        result = await run_code(mock_client, "sb-1", "print(6*7)", language="python")
        assert result.exit_code == 0
        assert result.stdout == "42\n"
        mock_client.execute_code.assert_called_once_with("sb-1", "print(6*7)", language="python")

    async def test_command_failure_returns_nonzero_exit_code(self):
        """A failed command returns non-zero exit_code, stderr populated."""
        from app.integrations.opensandbox.execution import run_command
        from app.integrations.opensandbox.models import CommandResult

        mock_client = AsyncMock()
        mock_client.run_command = AsyncMock(
            return_value=CommandResult(exit_code=1, stdout="", stderr="command not found")
        )

        result = await run_command(mock_client, "sb-1", "nonexistent_cmd")
        assert result.exit_code == 1
        assert "command not found" in result.stderr

    async def test_run_command_truncates_large_output(self):
        """stdout/stderr exceeding max length are truncated."""
        from app.integrations.opensandbox.execution import MAX_OUTPUT_LENGTH, run_command
        from app.integrations.opensandbox.models import CommandResult

        large_output = "x" * (MAX_OUTPUT_LENGTH + 10000)
        mock_client = AsyncMock()
        mock_client.run_command = AsyncMock(
            return_value=CommandResult(exit_code=0, stdout=large_output, stderr="")
        )

        result = await run_command(mock_client, "sb-1", "cat big_file")
        assert len(result.stdout) <= MAX_OUTPUT_LENGTH
