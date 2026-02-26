"""Low-level HTTP client for the OpenSandbox API."""
from typing import Any, Optional

import httpx
import pybreaker
import structlog
from tenacity import (
    retry,
    retry_if_exception_type,
    stop_after_attempt,
    wait_exponential,
)

from .config import OpenSandboxSettings, opensandbox_settings
from .models import CommandResult, FileEntry, SandboxConfig, SandboxStatus

logger = structlog.get_logger(__name__)


class SandboxAPIError(Exception):
    """Non-retryable error from the OpenSandbox API."""

    def __init__(self, status_code: int, message: str):
        self.status_code = status_code
        self.message = message
        super().__init__(f"SandboxAPIError({status_code}): {message}")


class RetryableHTTPError(Exception):
    """Retryable HTTP error (429, 500, 503)."""

    def __init__(self, status_code: int, message: str):
        self.status_code = status_code
        self.message = message
        super().__init__(f"RetryableHTTPError({status_code}): {message}")


class SandboxProvisionError(Exception):
    """Sandbox failed to reach ready state within timeout."""


RETRYABLE_STATUS_CODES = {429, 500, 503}
NON_RETRYABLE_STATUS_CODES = {400, 403, 404}


class OpenSandboxClient:
    """Low-level HTTP client for the OpenSandbox API."""

    def __init__(self, config: Optional[OpenSandboxSettings] = None):
        self._config = config or opensandbox_settings
        self._http_client = httpx.AsyncClient(
            base_url=self._config.OPENSANDBOX_BASE_URL,
            limits=httpx.Limits(max_connections=20, max_keepalive_connections=10),
            timeout=httpx.Timeout(self._config.OPENSANDBOX_REQUEST_TIMEOUT_SECONDS),
        )
        self._breaker = pybreaker.CircuitBreaker(
            fail_max=5,
            reset_timeout=30,
            name="opensandbox",
        )

    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=1, max=10),
        retry=retry_if_exception_type((RetryableHTTPError, httpx.TransportError)),
        reraise=True,
    )
    async def _request(
        self,
        method: str,
        url: str,
        *,
        json: Optional[dict[str, Any]] = None,
        content: Optional[bytes] = None,
        params: Optional[dict[str, str]] = None,
        timeout: Optional[int] = None,
    ) -> httpx.Response:
        """Send an HTTP request with circuit breaker and retry."""
        headers = {}
        if self._config.OPENSANDBOX_API_KEY:
            headers["X-API-Key"] = self._config.OPENSANDBOX_API_KEY

        request_timeout = timeout or self._config.OPENSANDBOX_REQUEST_TIMEOUT_SECONDS

        async def _do_request():
            return await self._http_client.request(
                method=method,
                url=url,
                json=json,
                content=content,
                params=params,
                headers=headers,
                timeout=request_timeout,
            )

        response = await self._breaker.call_async(_do_request)

        if response.status_code in RETRYABLE_STATUS_CODES:
            raise RetryableHTTPError(
                response.status_code,
                response.text[:200],
            )

        if response.status_code in NON_RETRYABLE_STATUS_CODES:
            raise SandboxAPIError(
                response.status_code,
                response.text[:200],
            )

        # Catch-all for other error status codes (401, 405, 409, etc.)
        if response.status_code >= 400:
            raise SandboxAPIError(
                response.status_code,
                response.text[:200],
            )

        return response

    async def create_sandbox(self, config: SandboxConfig) -> str:
        """POST /api/v1/sandboxes. Returns sandbox_id."""
        response = await self._request(
            method="POST",
            url="/api/v1/sandboxes",
            json=config.model_dump(),
        )
        data = response.json()
        sandbox_id = data["id"]
        logger.info("sandbox_created", sandbox_id=sandbox_id)
        return sandbox_id

    async def get_sandbox_status(self, sandbox_id: str) -> SandboxStatus:
        """GET /api/v1/sandboxes/{sandbox_id}. Returns SandboxStatus."""
        response = await self._request(
            method="GET",
            url=f"/api/v1/sandboxes/{sandbox_id}",
        )
        return SandboxStatus.model_validate(response.json())

    async def destroy_sandbox(self, sandbox_id: str) -> None:
        """DELETE /api/v1/sandboxes/{sandbox_id}."""
        await self._request(
            method="DELETE",
            url=f"/api/v1/sandboxes/{sandbox_id}",
        )
        logger.info("sandbox_destroyed", sandbox_id=sandbox_id)

    async def run_command(
        self, sandbox_id: str, command: str, timeout: int = 30
    ) -> CommandResult:
        """POST /api/v1/sandboxes/{sandbox_id}/commands. Returns CommandResult."""
        response = await self._request(
            method="POST",
            url=f"/api/v1/sandboxes/{sandbox_id}/commands",
            json={"command": command, "timeout": timeout},
            timeout=timeout + 5,
        )
        return CommandResult.model_validate(response.json())

    async def write_file(
        self, sandbox_id: str, path: str, content: bytes
    ) -> None:
        """POST /api/v1/sandboxes/{sandbox_id}/files. Upload file content."""
        await self._request(
            method="POST",
            url=f"/api/v1/sandboxes/{sandbox_id}/files",
            json={"path": path, "content": content.hex()},
        )

    async def read_file(self, sandbox_id: str, path: str) -> bytes:
        """GET /api/v1/sandboxes/{sandbox_id}/files. Download file content."""
        response = await self._request(
            method="GET",
            url=f"/api/v1/sandboxes/{sandbox_id}/files",
            params={"path": path},
        )
        return response.content

    async def list_files(
        self, sandbox_id: str, path: str = "/"
    ) -> list[FileEntry]:
        """GET /api/v1/sandboxes/{sandbox_id}/files/list."""
        response = await self._request(
            method="GET",
            url=f"/api/v1/sandboxes/{sandbox_id}/files/list",
            params={"path": path},
        )
        return [FileEntry.model_validate(entry) for entry in response.json()]

    async def execute_code(
        self, sandbox_id: str, code: str, language: str = "python"
    ) -> CommandResult:
        """POST /api/v1/sandboxes/{sandbox_id}/code. Execute via code interpreter."""
        response = await self._request(
            method="POST",
            url=f"/api/v1/sandboxes/{sandbox_id}/code",
            json={"code": code, "language": language},
        )
        return CommandResult.model_validate(response.json())

    async def close(self) -> None:
        """Close the httpx client."""
        await self._http_client.aclose()


class OpenSandboxBackendAdapter:
    """Adapts OpenSandboxClient to the SandboxBackend protocol interface."""

    def __init__(self, client: OpenSandboxClient):
        self._client = client

    async def create(self, config: "SandboxConfig") -> str:
        return await self._client.create_sandbox(config)

    async def execute(
        self, sandbox_id: str, command: str, timeout: int
    ) -> "CommandResult":
        return await self._client.run_command(sandbox_id, command, timeout=timeout)

    async def write_file(
        self, sandbox_id: str, path: str, content: bytes
    ) -> None:
        await self._client.write_file(sandbox_id, path, content)

    async def read_file(self, sandbox_id: str, path: str) -> bytes:
        return await self._client.read_file(sandbox_id, path)

    async def destroy(self, sandbox_id: str) -> None:
        await self._client.destroy_sandbox(sandbox_id)
