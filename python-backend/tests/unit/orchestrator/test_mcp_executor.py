"""Unit tests for MCPExecutor SSRF/auth hardening."""

from unittest.mock import AsyncMock, MagicMock, patch

import httpx
import pytest

from app.orchestrator.node_executors.integration_executors.mcp_executor import MCPExecutor

pytestmark = [pytest.mark.unit]


class _AsyncSessionCM:
    def __init__(self, session):
        self._session = session

    async def __aenter__(self):
        return self._session

    async def __aexit__(self, exc_type, exc, tb):
        return False


def _make_workflow(*, user_id: int = 7, tenant_id: str = "tenant-1"):
    return MagicMock(userId=user_id, tenantId=tenant_id)


@pytest.mark.asyncio
async def test_rejects_blocked_server_before_db_or_network():
    executor = MCPExecutor()
    context = {"workflow_id": "123", "user_id": 7, "tenant_id": "tenant-1"}

    with patch("app.orchestrator.node_executors.integration_executors.mcp_executor.AsyncSessionLocal") as mock_session_factory, patch(
        "app.orchestrator.node_executors.integration_executors.mcp_executor.httpx.AsyncClient"
    ) as mock_client:
        result = await executor.execute(
            "node-1",
            "mcp",
            {"mcp_server_url": "http://10.0.0.1", "method": "list_resources"},
            {},
            context,
        )

    assert not result.success
    assert result.error == "MCP server URL blocked by SSRF protection"
    mock_session_factory.assert_not_called()
    mock_client.assert_not_called()


@pytest.mark.asyncio
async def test_rejects_unauthorized_workflow_before_network():
    executor = MCPExecutor()
    context = {"workflow_id": "123", "user_id": 7, "tenant_id": "tenant-1"}
    session = MagicMock()
    session.execute = AsyncMock(return_value=MagicMock(scalar_one_or_none=MagicMock(return_value=_make_workflow(user_id=99))))

    with (
        patch(
            "app.orchestrator.node_executors.integration_executors.mcp_executor.AsyncSessionLocal",
            return_value=_AsyncSessionCM(session),
        ) as mock_session_factory,
        patch("app.orchestrator.node_executors.integration_executors.mcp_executor.httpx.AsyncClient") as mock_client,
    ):
        result = await executor.execute(
            "node-1",
            "mcp",
            {"mcp_server_url": "https://mcp.example.com", "method": "list_resources"},
            {},
            context,
        )

    assert not result.success
    assert result.error == "Unauthorized workflow access"
    mock_session_factory.assert_called_once()
    mock_client.assert_not_called()


@pytest.mark.asyncio
async def test_clamps_timeout_and_strips_server_url_from_metadata():
    executor = MCPExecutor()
    context = {"workflow_id": "123", "user_id": 7, "tenant_id": "tenant-1"}
    session = MagicMock()
    session.execute = AsyncMock(return_value=MagicMock(scalar_one_or_none=MagicMock(return_value=_make_workflow())))

    mock_response = MagicMock()
    mock_response.raise_for_status = MagicMock()
    mock_response.json.return_value = {
        "jsonrpc": "2.0",
        "id": 1,
        "result": {"resources": [{"uri": "file://doc-1"}]},
    }

    mock_client_instance = MagicMock()
    mock_client_instance.post = AsyncMock(return_value=mock_response)

    with (
        patch(
            "app.orchestrator.node_executors.integration_executors.mcp_executor.AsyncSessionLocal",
            return_value=_AsyncSessionCM(session),
        ),
        patch("app.orchestrator.node_executors.integration_executors.mcp_executor.httpx.AsyncClient") as mock_client_factory,
    ):
        mock_client_factory.return_value.__aenter__ = AsyncMock(return_value=mock_client_instance)
        mock_client_factory.return_value.__aexit__ = AsyncMock(return_value=False)

        result = await executor.execute(
            "node-1",
            "mcp",
            {
                "mcp_server_url": "https://mcp.example.com",
                "method": "list_resources",
                "timeout": 9999,
            },
            {},
            context,
        )

    assert result.success
    assert result.outputs["data"]["count"] == 1
    assert result.outputs["metadata"] == {"method": "list_resources", "status": "success"}
    assert mock_client_factory.call_args.kwargs["timeout"] == 120.0


@pytest.mark.asyncio
async def test_returns_generic_http_error_message():
    executor = MCPExecutor()
    context = {"workflow_id": "123", "user_id": 7, "tenant_id": "tenant-1"}
    session = MagicMock()
    session.execute = AsyncMock(return_value=MagicMock(scalar_one_or_none=MagicMock(return_value=_make_workflow())))

    mock_response = MagicMock()
    mock_response.raise_for_status = MagicMock(side_effect=httpx.HTTPError("boom"))

    mock_client_instance = MagicMock()
    mock_client_instance.post = AsyncMock(return_value=mock_response)

    with (
        patch(
            "app.orchestrator.node_executors.integration_executors.mcp_executor.AsyncSessionLocal",
            return_value=_AsyncSessionCM(session),
        ),
        patch("app.orchestrator.node_executors.integration_executors.mcp_executor.httpx.AsyncClient") as mock_client_factory,
    ):
        mock_client_factory.return_value.__aenter__ = AsyncMock(return_value=mock_client_instance)
        mock_client_factory.return_value.__aexit__ = AsyncMock(return_value=False)

        result = await executor.execute(
            "node-1",
            "mcp",
            {"mcp_server_url": "https://mcp.example.com", "method": "list_resources"},
            {},
            context,
        )

    assert not result.success
    assert result.error == "MCP server request failed"
    assert "mcp.example.com" not in result.error
