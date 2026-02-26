"""Tests for HTTPExecutor sandbox-based egress control.

Markers: unit, sandbox
"""
import pytest
from unittest.mock import AsyncMock, MagicMock, patch

from app.orchestrator.node_executors.integration_executors.http_executor import HTTPExecutor

pytestmark = [pytest.mark.unit, pytest.mark.sandbox]


def make_data(url: str, method: str = "GET", headers: dict = None, body=None):
    """Create a mock NodeExecutionData."""
    data = MagicMock()
    data.inputs = {
        "url": url,
        "method": method,
        "headers": headers or {},
        "body": body,
        "query_params": {},
        "timeout": 30,
        "allow_redirects": True,
    }
    return data


def make_context():
    """Create a mock ExecutionContext."""
    return MagicMock()


class TestHTTPExecutorExternalDetection:
    """Tests for _is_external_url detection."""

    def test_localhost_is_not_external(self):
        executor = HTTPExecutor()
        assert executor._is_external_url("http://localhost:8000/api") is False

    def test_127_0_0_1_is_not_external(self):
        executor = HTTPExecutor()
        assert executor._is_external_url("http://127.0.0.1:8000/api") is False

    def test_private_ip_is_not_external(self):
        executor = HTTPExecutor()
        assert executor._is_external_url("http://192.168.1.1/api") is False
        assert executor._is_external_url("http://10.0.0.1/api") is False
        assert executor._is_external_url("http://172.16.0.1/api") is False

    def test_external_domain_is_external(self):
        executor = HTTPExecutor()
        assert executor._is_external_url("https://api.example.com/data") is True

    def test_empty_url_is_not_external(self):
        executor = HTTPExecutor()
        assert executor._is_external_url("") is False

    def test_no_hostname_is_not_external(self):
        executor = HTTPExecutor()
        assert executor._is_external_url("file:///etc/passwd") is False


class TestHTTPExecutorSandboxRouting:
    """Tests for sandbox routing of external HTTP requests."""

    @pytest.mark.asyncio
    @patch.object(HTTPExecutor, "_is_sandbox_enabled", return_value=True)
    @patch.object(HTTPExecutor, "_execute_via_sandbox", new_callable=AsyncMock)
    async def test_external_requests_route_through_sandbox(self, mock_sandbox, mock_enabled):
        """External HTTP requests route through sandbox when enabled."""
        mock_sandbox.return_value = {
            "status_code": 200,
            "headers": {},
            "body": '{"ok": true}',
            "url": "https://api.example.com/data",
        }
        executor = HTTPExecutor()
        result = await executor.execute(
            make_data("https://api.example.com/data"),
            make_context(),
        )
        mock_sandbox.assert_called_once()
        assert result["status_code"] == 200

    @pytest.mark.asyncio
    @patch.object(HTTPExecutor, "_is_sandbox_enabled", return_value=False)
    @patch.object(HTTPExecutor, "_execute_direct", new_callable=AsyncMock)
    async def test_direct_when_sandbox_disabled(self, mock_direct, mock_enabled):
        """Falls back to direct aiohttp when sandbox disabled."""
        mock_direct.return_value = {
            "status_code": 200,
            "headers": {},
            "body": "ok",
            "url": "https://api.example.com/data",
        }
        executor = HTTPExecutor()
        result = await executor.execute(
            make_data("https://api.example.com/data"),
            make_context(),
        )
        mock_direct.assert_called_once()

    @pytest.mark.asyncio
    @patch.object(HTTPExecutor, "_is_sandbox_enabled", return_value=True)
    @patch.object(HTTPExecutor, "_execute_direct", new_callable=AsyncMock)
    async def test_internal_urls_skip_sandbox(self, mock_direct, mock_enabled):
        """Internal URLs use direct path even when sandbox is enabled."""
        mock_direct.return_value = {
            "status_code": 200,
            "headers": {},
            "body": "ok",
            "url": "http://localhost:8000/api",
        }
        executor = HTTPExecutor()
        result = await executor.execute(
            make_data("http://localhost:8000/api"),
            make_context(),
        )
        mock_direct.assert_called_once()

    @pytest.mark.asyncio
    @patch.object(HTTPExecutor, "_is_sandbox_enabled", return_value=True)
    @patch.object(HTTPExecutor, "_execute_via_sandbox", new_callable=AsyncMock)
    @patch.object(HTTPExecutor, "_execute_direct", new_callable=AsyncMock)
    async def test_falls_back_on_sandbox_failure(self, mock_direct, mock_sandbox, mock_enabled):
        """Falls back to direct on sandbox failure."""
        mock_sandbox.side_effect = ConnectionError("Sandbox unreachable")
        mock_direct.return_value = {
            "status_code": 200,
            "headers": {},
            "body": "ok",
            "url": "https://api.example.com/data",
        }
        executor = HTTPExecutor()
        result = await executor.execute(
            make_data("https://api.example.com/data"),
            make_context(),
        )
        mock_direct.assert_called_once()
        assert result["status_code"] == 200
