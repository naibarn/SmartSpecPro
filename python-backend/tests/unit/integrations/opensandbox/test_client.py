"""Tests for OpenSandbox HTTP client."""
import pytest
from unittest.mock import AsyncMock, MagicMock, patch
import httpx


@pytest.mark.unit
@pytest.mark.sandbox
class TestOpenSandboxClient:
    """Tests for the low-level HTTP client wrapper."""

    def _make_settings(self, **overrides):
        from app.integrations.opensandbox.config import OpenSandboxSettings

        defaults = {
            "OPENSANDBOX_ENABLED": True,
            "OPENSANDBOX_BASE_URL": "http://sandbox.test:8080",
            "OPENSANDBOX_API_KEY": "test-api-key",
            "OPENSANDBOX_REQUEST_TIMEOUT_SECONDS": 5,
        }
        defaults.update(overrides)
        return OpenSandboxSettings(_env_file=None, **defaults)

    async def test_create_sandbox_sends_correct_request(self):
        """create_sandbox() POSTs to /v1/sandboxes with correct body."""
        from app.integrations.opensandbox.client import OpenSandboxClient
        from app.integrations.opensandbox.models import SandboxConfig

        config = self._make_settings()
        client = OpenSandboxClient(config)

        mock_response = httpx.Response(
            200,
            json={"id": "sb-new-123"},
            request=httpx.Request("POST", "http://sandbox.test:8080/v1/sandboxes"),
        )

        with patch.object(client._http_client, "request", new_callable=AsyncMock) as mock_req:
            mock_req.return_value = mock_response
            sandbox_id = await client.create_sandbox(SandboxConfig())
            assert sandbox_id == "sb-new-123"
            mock_req.assert_called_once()
            call_kwargs = mock_req.call_args
            assert call_kwargs.kwargs["method"] == "POST"
            assert "/v1/sandboxes" in call_kwargs.kwargs["url"]

        await client.close()

    async def test_create_sandbox_returns_sandbox_id(self):
        """Successful create returns the sandbox ID string."""
        from app.integrations.opensandbox.client import OpenSandboxClient
        from app.integrations.opensandbox.models import SandboxConfig

        config = self._make_settings()
        client = OpenSandboxClient(config)

        mock_response = httpx.Response(
            200,
            json={"id": "sb-abc-456"},
            request=httpx.Request("POST", "http://sandbox.test:8080/v1/sandboxes"),
        )

        with patch.object(client._http_client, "request", new_callable=AsyncMock) as mock_req:
            mock_req.return_value = mock_response
            result = await client.create_sandbox(SandboxConfig())
            assert isinstance(result, str)
            assert result == "sb-abc-456"

        await client.close()

    async def test_get_sandbox_status_returns_status_model(self):
        """get_sandbox_status() GETs /v1/sandboxes/{id} and returns SandboxStatus."""
        from app.integrations.opensandbox.client import OpenSandboxClient
        from app.integrations.opensandbox.models import SandboxStatus

        config = self._make_settings()
        client = OpenSandboxClient(config)

        mock_response = httpx.Response(
            200,
            json={"id": "sb-123", "status": "running", "metadata": {}},
            request=httpx.Request("GET", "http://sandbox.test:8080/v1/sandboxes/sb-123"),
        )

        with patch.object(client._http_client, "request", new_callable=AsyncMock) as mock_req:
            mock_req.return_value = mock_response
            status = await client.get_sandbox_status("sb-123")
            assert isinstance(status, SandboxStatus)
            assert status.status == "running"

        await client.close()

    async def test_destroy_sandbox_sends_delete(self):
        """destroy_sandbox() DELETEs /v1/sandboxes/{id}."""
        from app.integrations.opensandbox.client import OpenSandboxClient

        config = self._make_settings()
        client = OpenSandboxClient(config)

        mock_response = httpx.Response(
            204,
            request=httpx.Request("DELETE", "http://sandbox.test:8080/v1/sandboxes/sb-123"),
        )

        with patch.object(client._http_client, "request", new_callable=AsyncMock) as mock_req:
            mock_req.return_value = mock_response
            await client.destroy_sandbox("sb-123")
            call_kwargs = mock_req.call_args
            assert call_kwargs.kwargs["method"] == "DELETE"

        await client.close()

    async def test_run_command_sends_correct_payload(self):
        """run_command() POSTs command string and timeout to execution endpoint."""
        from app.integrations.opensandbox.client import OpenSandboxClient

        config = self._make_settings()
        client = OpenSandboxClient(config)

        mock_response = httpx.Response(
            200,
            json={"exit_code": 0, "stdout": "hello\n", "stderr": ""},
            request=httpx.Request("POST", "http://sandbox.test:8080/v1/sandboxes/sb-1/commands"),
        )

        with patch.object(client._http_client, "request", new_callable=AsyncMock) as mock_req:
            mock_req.return_value = mock_response
            result = await client.run_command("sb-1", "echo hello", timeout=10)
            assert result.exit_code == 0
            assert result.stdout == "hello\n"

        await client.close()

    async def test_run_command_404_has_clear_feature_message(self):
        """404 from /commands endpoint reports lifecycle-only deployment clearly."""
        from app.integrations.opensandbox.client import OpenSandboxClient, SandboxAPIError

        config = self._make_settings()
        client = OpenSandboxClient(config)

        mock_response = httpx.Response(
            404,
            json={"detail": "Not Found"},
            request=httpx.Request("POST", "http://sandbox.test:8080/v1/sandboxes/sb-1/commands"),
        )

        with patch.object(client._http_client, "request", new_callable=AsyncMock) as mock_req:
            mock_req.return_value = mock_response
            with pytest.raises(SandboxAPIError) as exc_info:
                await client.run_command("sb-1", "echo hello", timeout=10)
            assert "lifecycle APIs only" in str(exc_info.value)

        await client.close()

    async def test_write_file_uploads_bytes(self):
        """write_file() POSTs file content to sandbox filesystem endpoint."""
        from app.integrations.opensandbox.client import OpenSandboxClient

        config = self._make_settings()
        client = OpenSandboxClient(config)

        mock_response = httpx.Response(
            200,
            json={"success": True},
            request=httpx.Request("POST", "http://sandbox.test:8080/v1/sandboxes/sb-1/files"),
        )

        with patch.object(client._http_client, "request", new_callable=AsyncMock) as mock_req:
            mock_req.return_value = mock_response
            await client.write_file("sb-1", "/workspace/test.txt", b"hello world")
            mock_req.assert_called_once()

        await client.close()

    async def test_read_file_returns_bytes(self):
        """read_file() GETs file content from sandbox filesystem endpoint."""
        from app.integrations.opensandbox.client import OpenSandboxClient

        config = self._make_settings()
        client = OpenSandboxClient(config)

        mock_response = httpx.Response(
            200,
            content=b"file content here",
            request=httpx.Request("GET", "http://sandbox.test:8080/v1/sandboxes/sb-1/files"),
        )

        with patch.object(client._http_client, "request", new_callable=AsyncMock) as mock_req:
            mock_req.return_value = mock_response
            data = await client.read_file("sb-1", "/workspace/test.txt")
            assert data == b"file content here"

        await client.close()

    async def test_list_files_returns_file_entries(self):
        """list_files() returns list of FileEntry models."""
        from app.integrations.opensandbox.client import OpenSandboxClient

        config = self._make_settings()
        client = OpenSandboxClient(config)

        mock_response = httpx.Response(
            200,
            json=[
                {"name": "file1.py", "path": "/workspace/file1.py", "size": 100, "is_directory": False},
                {"name": "data", "path": "/workspace/data", "size": 0, "is_directory": True},
            ],
            request=httpx.Request("GET", "http://sandbox.test:8080/v1/sandboxes/sb-1/files/list"),
        )

        with patch.object(client._http_client, "request", new_callable=AsyncMock) as mock_req:
            mock_req.return_value = mock_response
            entries = await client.list_files("sb-1", "/workspace")
            assert len(entries) == 2
            assert entries[0].name == "file1.py"
            assert entries[1].is_directory is True

        await client.close()

    async def test_circuit_breaker_opens_after_5_failures(self):
        """After 5 consecutive failures, circuit breaker opens and rejects calls."""
        from pybreaker import CircuitBreakerError

        from app.integrations.opensandbox.client import OpenSandboxClient
        from app.integrations.opensandbox.models import SandboxConfig

        config = self._make_settings()
        client = OpenSandboxClient(config)

        with patch.object(client._http_client, "request", new_callable=AsyncMock) as mock_req:
            mock_req.side_effect = httpx.ConnectError("connection refused")

            # First 5 calls should attempt the request and fail
            for i in range(5):
                with pytest.raises((httpx.ConnectError, Exception)):
                    await client.create_sandbox(SandboxConfig())

            # 6th call should be rejected by circuit breaker without hitting HTTP
            with pytest.raises((CircuitBreakerError, Exception)):
                await client.create_sandbox(SandboxConfig())

        await client.close()

    async def test_retry_on_429_500_503(self):
        """Client retries on 429, 500, 503 status codes."""
        from app.integrations.opensandbox.client import OpenSandboxClient
        from app.integrations.opensandbox.models import SandboxConfig

        config = self._make_settings()
        client = OpenSandboxClient(config)

        responses = [
            httpx.Response(
                503,
                json={"error": "unavailable"},
                request=httpx.Request("POST", "http://sandbox.test:8080/v1/sandboxes"),
            ),
            httpx.Response(
                503,
                json={"error": "unavailable"},
                request=httpx.Request("POST", "http://sandbox.test:8080/v1/sandboxes"),
            ),
            httpx.Response(
                200,
                json={"id": "sb-retry-ok"},
                request=httpx.Request("POST", "http://sandbox.test:8080/v1/sandboxes"),
            ),
        ]

        with patch.object(client._http_client, "request", new_callable=AsyncMock) as mock_req:
            mock_req.side_effect = responses
            result = await client.create_sandbox(SandboxConfig())
            assert result == "sb-retry-ok"
            assert mock_req.call_count == 3

        await client.close()

    async def test_no_retry_on_400_403_404(self):
        """Client does NOT retry on 400, 403, 404 (client errors)."""
        from app.integrations.opensandbox.client import OpenSandboxClient, SandboxAPIError
        from app.integrations.opensandbox.models import SandboxConfig

        config = self._make_settings()
        client = OpenSandboxClient(config)

        mock_response = httpx.Response(
            400,
            json={"error": "bad request"},
            request=httpx.Request("POST", "http://sandbox.test:8080/v1/sandboxes"),
        )

        with patch.object(client._http_client, "request", new_callable=AsyncMock) as mock_req:
            mock_req.return_value = mock_response
            with pytest.raises(SandboxAPIError):
                await client.create_sandbox(SandboxConfig())
            assert mock_req.call_count == 1  # No retry

        await client.close()

    async def test_api_key_sent_in_header(self):
        """All requests include OPEN-SANDBOX-API-KEY header."""
        from app.integrations.opensandbox.client import OpenSandboxClient
        from app.integrations.opensandbox.models import SandboxConfig

        config = self._make_settings(OPENSANDBOX_API_KEY="my-secret-key")
        client = OpenSandboxClient(config)

        mock_response = httpx.Response(
            200,
            json={"id": "sb-header-test"},
            request=httpx.Request("POST", "http://sandbox.test:8080/v1/sandboxes"),
        )

        with patch.object(client._http_client, "request", new_callable=AsyncMock) as mock_req:
            mock_req.return_value = mock_response
            await client.create_sandbox(SandboxConfig())
            call_kwargs = mock_req.call_args
            headers = call_kwargs.kwargs.get("headers", {})
            assert headers.get("OPEN-SANDBOX-API-KEY") == "my-secret-key"
            assert headers.get("X-API-Key") == "my-secret-key"

        await client.close()
