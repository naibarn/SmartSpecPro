"""Tests for MCPExecutor security hardening (section-01).

Covers findings F07 (SSRF), F08 (ownership), F09 (URL leakage),
F10 (error message leakage), F11 (structlog), F12 (timeout clamping).
"""

import importlib
from unittest.mock import AsyncMock, MagicMock, patch

import httpx
import pytest

from app.orchestrator.node_executors.integration_executors.mcp_executor import (
    MCPExecutor,
    _normalize_timeout,
)

pytestmark = [pytest.mark.unit]

MODULE_PATH = "app.orchestrator.node_executors.integration_executors.mcp_executor"


class _AsyncSessionCM:
    def __init__(self, session):
        self._session = session

    async def __aenter__(self):
        return self._session

    async def __aexit__(self, exc_type, exc, tb):
        return False


def _make_workflow(*, user_id: int = 7, tenant_id: str = "tenant-1"):
    return MagicMock(userId=user_id, tenantId=tenant_id)


def _owned_session(user_id: int = 7, tenant_id: str = "tenant-1"):
    """Create a mock session that returns an owned workflow."""
    session = MagicMock()
    session.execute = AsyncMock(
        return_value=MagicMock(
            scalar_one_or_none=MagicMock(
                return_value=_make_workflow(user_id=user_id, tenant_id=tenant_id)
            )
        )
    )
    return session


def _default_context():
    return {"workflow_id": "123", "user_id": 7, "tenant_id": "tenant-1"}


class TestExecutorSSRF:
    """F07: Executor blocks private IPs and metadata endpoints."""

    @pytest.mark.asyncio
    async def test_blocks_private_ip(self):
        executor = MCPExecutor()
        with patch(f"{MODULE_PATH}.AsyncSessionLocal", side_effect=AssertionError("DB should not be reached")):
            result = await executor.execute(
                "node-1", "mcp",
                {"mcp_server_url": "http://127.0.0.1:5432", "method": "call_tool"},
                {}, _default_context(),
            )
        assert not result.success
        assert "blocked" in result.error.lower()

    @pytest.mark.asyncio
    async def test_blocks_metadata_endpoint(self):
        executor = MCPExecutor()
        with patch(f"{MODULE_PATH}.AsyncSessionLocal", side_effect=AssertionError("DB should not be reached")):
            result = await executor.execute(
                "node-1", "mcp",
                {"mcp_server_url": "http://169.254.169.254/latest/"},
                {}, _default_context(),
            )
        assert not result.success
        assert "blocked" in result.error.lower()


class TestOutputSanitization:
    """F09: server_url must not appear in success output metadata."""

    @pytest.mark.asyncio
    async def test_server_url_not_in_metadata(self):
        executor = MCPExecutor()
        session = _owned_session()

        mock_response = MagicMock()
        mock_response.raise_for_status = MagicMock()
        mock_response.json.return_value = {
            "jsonrpc": "2.0", "id": 1,
            "result": {"resources": [{"uri": "file://doc-1"}]},
        }
        mock_client = MagicMock()
        mock_client.post = AsyncMock(return_value=mock_response)

        with (
            patch(f"{MODULE_PATH}.AsyncSessionLocal", return_value=_AsyncSessionCM(session)),
            patch(f"{MODULE_PATH}.httpx.AsyncClient") as mock_factory,
        ):
            mock_factory.return_value.__aenter__ = AsyncMock(return_value=mock_client)
            mock_factory.return_value.__aexit__ = AsyncMock(return_value=False)
            result = await executor.execute(
                "node-1", "mcp",
                {"mcp_server_url": "https://mcp.example.com", "method": "list_resources"},
                {}, _default_context(),
            )

        assert result.success
        assert "server_url" not in result.outputs.get("metadata", {})
        assert "mcp_server_url" not in str(result.outputs)


class TestErrorMessageSanitization:
    """F10: Error messages must not contain hostnames or ports."""

    @pytest.mark.asyncio
    async def test_http_error_message_is_generic(self):
        executor = MCPExecutor()
        session = _owned_session()

        mock_response = MagicMock()
        mock_response.raise_for_status = MagicMock(
            side_effect=httpx.ConnectError("Connection to 10.0.0.1:8080 refused")
        )
        mock_client = MagicMock()
        mock_client.post = AsyncMock(return_value=mock_response)

        with (
            patch(f"{MODULE_PATH}.AsyncSessionLocal", return_value=_AsyncSessionCM(session)),
            patch(f"{MODULE_PATH}.httpx.AsyncClient") as mock_factory,
        ):
            mock_factory.return_value.__aenter__ = AsyncMock(return_value=mock_client)
            mock_factory.return_value.__aexit__ = AsyncMock(return_value=False)
            result = await executor.execute(
                "node-1", "mcp",
                {"mcp_server_url": "https://mcp.example.com", "method": "list_resources"},
                {}, _default_context(),
            )

        assert not result.success
        assert "10.0.0.1" not in result.error
        assert ":8080" not in result.error
        assert "failed" in result.error.lower() or "error" in result.error.lower()


class TestTimeoutClamping:
    """F12: Timeout clamped to 120s maximum, defaults to 30s."""

    def test_clamps_to_120(self):
        assert _normalize_timeout(7200) == 120.0

    def test_defaults_to_30(self):
        assert _normalize_timeout(None) == 30.0

    def test_minimum_is_1(self):
        assert _normalize_timeout(0.1) == 1.0

    @pytest.mark.asyncio
    async def test_executor_uses_clamped_timeout(self):
        executor = MCPExecutor()
        session = _owned_session()

        mock_response = MagicMock()
        mock_response.raise_for_status = MagicMock()
        mock_response.json.return_value = {
            "jsonrpc": "2.0", "id": 1,
            "result": {"resources": []},
        }
        mock_client = MagicMock()
        mock_client.post = AsyncMock(return_value=mock_response)

        with (
            patch(f"{MODULE_PATH}.AsyncSessionLocal", return_value=_AsyncSessionCM(session)),
            patch(f"{MODULE_PATH}.httpx.AsyncClient") as mock_factory,
        ):
            mock_factory.return_value.__aenter__ = AsyncMock(return_value=mock_client)
            mock_factory.return_value.__aexit__ = AsyncMock(return_value=False)
            await executor.execute(
                "node-1", "mcp",
                {"mcp_server_url": "https://mcp.example.com", "method": "list_resources", "timeout": 9999},
                {}, _default_context(),
            )

        assert mock_factory.called, "httpx.AsyncClient was never instantiated — ownership or SSRF check may have short-circuited"
        assert mock_factory.call_args.kwargs["timeout"] == 120.0


class TestWorkflowOwnership:
    """F08: Executor blocks when context user does not own workflow."""

    @pytest.mark.asyncio
    async def test_blocks_unauthorized_user(self):
        executor = MCPExecutor()
        session = _owned_session(user_id=99)  # workflow owned by user 99

        with (
            patch(f"{MODULE_PATH}.AsyncSessionLocal", return_value=_AsyncSessionCM(session)),
            patch(f"{MODULE_PATH}.httpx.AsyncClient") as mock_client,
        ):
            result = await executor.execute(
                "node-1", "mcp",
                {"mcp_server_url": "https://mcp.example.com", "method": "list_resources"},
                {},
                {"workflow_id": "123", "user_id": 7, "tenant_id": "tenant-1"},  # user 7 != owner 99
            )

        assert not result.success
        assert "unauthorized" in result.error.lower()
        assert "123" not in result.error  # workflow_id must not leak
        assert "999" not in result.error
        mock_client.assert_not_called()


class TestStructlog:
    """F11: Module uses structlog, not stdlib logging."""

    def test_uses_structlog(self):
        import structlog
        mod = importlib.import_module(MODULE_PATH)
        assert hasattr(mod, "logger")
        # structlog.get_logger returns a BoundLoggerLazyProxy
        assert "structlog" in type(mod.logger).__module__
