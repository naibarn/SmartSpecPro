"""Tests for CodeExecutor sandbox migration.

Markers: unit, sandbox
"""
import pytest
from unittest.mock import AsyncMock, MagicMock, patch

from app.orchestrator.node_executors.data_executors.code_executor import CodeExecutor

pytestmark = [pytest.mark.unit, pytest.mark.sandbox]


def make_data(code: str, input_data=None, timeout: int = 30):
    """Create a mock NodeExecutionData."""
    data = MagicMock()
    data.inputs = {"code": code, "input": input_data, "timeout": timeout}
    return data


def make_context():
    """Create a mock ExecutionContext."""
    return MagicMock()


class TestCodeExecutorSandboxRouting:
    """Tests for sandbox vs RestrictedPython routing."""

    @pytest.mark.asyncio
    @patch.object(CodeExecutor, "_is_sandbox_enabled", return_value=True)
    @patch.object(CodeExecutor, "_execute_in_sandbox", new_callable=AsyncMock)
    async def test_routes_to_sandbox_when_enabled(self, mock_sandbox, mock_enabled):
        """Code node executes in sandbox when OPENSANDBOX_ENABLED=true."""
        mock_sandbox.return_value = {"result": 42, "stdout": ""}
        executor = CodeExecutor()
        result = await executor.execute(make_data("result = 42"), make_context())
        mock_sandbox.assert_called_once()
        assert result["result"] == 42

    @pytest.mark.asyncio
    @patch.object(CodeExecutor, "_is_sandbox_enabled", return_value=False)
    async def test_uses_restricted_python_when_disabled(self, mock_enabled):
        """Code node uses RestrictedPython when OPENSANDBOX_ENABLED=false."""
        executor = CodeExecutor()
        result = await executor.execute(make_data("result = 2 + 2"), make_context())
        assert result["result"] == 4

    @pytest.mark.asyncio
    @patch.object(CodeExecutor, "_is_sandbox_enabled", return_value=True)
    @patch.object(CodeExecutor, "_get_dispatch_mode", return_value="optional")
    @patch.object(CodeExecutor, "_execute_in_sandbox", new_callable=AsyncMock)
    async def test_falls_back_on_sandbox_failure_optional(self, mock_sandbox, mock_mode, mock_enabled):
        """Falls back to RestrictedPython when sandbox fails in optional mode."""
        mock_sandbox.side_effect = ConnectionError("Sandbox unreachable")
        executor = CodeExecutor()
        result = await executor.execute(make_data("result = 10"), make_context())
        assert result["result"] == 10

    @pytest.mark.asyncio
    @patch.object(CodeExecutor, "_is_sandbox_enabled", return_value=True)
    @patch.object(CodeExecutor, "_get_dispatch_mode", return_value="required")
    @patch.object(CodeExecutor, "_execute_in_sandbox", new_callable=AsyncMock)
    async def test_raises_on_sandbox_failure_required(self, mock_sandbox, mock_mode, mock_enabled):
        """Raises error when sandbox fails in required mode."""
        mock_sandbox.side_effect = ConnectionError("Sandbox unreachable")
        executor = CodeExecutor()
        with pytest.raises(ConnectionError):
            await executor.execute(make_data("result = 10"), make_context())

    @pytest.mark.asyncio
    async def test_rejects_empty_code(self):
        """Empty code raises ValueError."""
        executor = CodeExecutor()
        with pytest.raises(ValueError, match="Python code is required"):
            await executor.execute(make_data(""), make_context())


class TestCodeExecutorRestrictedPython:
    """Tests for the RestrictedPython fallback path."""

    @pytest.mark.asyncio
    @patch.object(CodeExecutor, "_is_sandbox_enabled", return_value=False)
    async def test_returns_result_value(self, mock_enabled):
        """RestrictedPython returns the result variable."""
        executor = CodeExecutor()
        result = await executor.execute(make_data("result = 3 * 7"), make_context())
        assert result["result"] == 21
