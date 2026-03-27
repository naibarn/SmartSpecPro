"""Low-level HTTP client for the OpenSandbox API."""
from typing import Any, Optional

import httpx
import structlog
from tenacity import (
    retry,
    retry_if_exception_type,
    stop_after_attempt,
    wait_exponential,
)

try:
    import pybreaker
except ModuleNotFoundError:  # pragma: no cover - fallback for lean worker images
    pybreaker = None

from .config import OpenSandboxSettings, opensandbox_settings
from .models import CommandResult, FileEntry, SandboxConfig, SandboxStatus

logger = structlog.get_logger(__name__)


class _NoopCircuitBreaker:
    """Fallback breaker when pybreaker is unavailable in runtime image."""

    async def call_async(self, fn):
        return await fn()


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
        self._api_prefix_candidates = self._build_api_prefix_candidates(
            self._config.OPENSANDBOX_API_PREFIX
        )
        self._active_api_prefix: Optional[str] = None
        self._http_client = httpx.AsyncClient(
            base_url=self._config.OPENSANDBOX_BASE_URL,
            limits=httpx.Limits(max_connections=20, max_keepalive_connections=10),
            timeout=httpx.Timeout(self._config.OPENSANDBOX_REQUEST_TIMEOUT_SECONDS),
        )
        if pybreaker is not None:
            self._breaker = pybreaker.CircuitBreaker(
                fail_max=5,
                reset_timeout=30,
                name="opensandbox",
            )
        else:
            logger.warning("opensandbox_pybreaker_missing_fallback_noop")
            self._breaker = _NoopCircuitBreaker()

    @staticmethod
    def _normalize_prefix(prefix: str) -> str:
        if not prefix:
            return ""
        normalized = prefix.strip()
        if not normalized:
            return ""
        if not normalized.startswith("/"):
            normalized = f"/{normalized}"
        return normalized.rstrip("/")

    @classmethod
    def _build_api_prefix_candidates(cls, configured: str) -> tuple[str, ...]:
        """Build ordered unique prefix candidates for route compatibility."""
        candidates = [
            cls._normalize_prefix(configured),
            "/v1",
            "/api/v1",
            "",
        ]
        unique: list[str] = []
        for candidate in candidates:
            if candidate not in unique:
                unique.append(candidate)
        return tuple(unique)

    @staticmethod
    def _join_prefix(prefix: str, path: str) -> str:
        normalized_path = path if path.startswith("/") else f"/{path}"
        if not prefix:
            return normalized_path
        return f"{prefix}{normalized_path}"

    def _iter_prefixes(self) -> tuple[str, ...]:
        if self._active_api_prefix is not None:
            return (self._active_api_prefix,)
        return self._api_prefix_candidates

    @staticmethod
    def _rethrow_feature_not_supported(exc: SandboxAPIError, feature: str) -> None:
        """Raise a clearer message when server does not expose legacy exec APIs."""
        if exc.status_code != 404:
            raise exc
        raise SandboxAPIError(
            404,
            (
                f"OpenSandbox server endpoint unavailable for '{feature}'. "
                "This server appears to expose lifecycle APIs only."
            ),
        ) from exc

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
            # New lifecycle API uses OPEN-SANDBOX-API-KEY; keep X-API-Key for
            # backward compatibility with older deployments/proxies.
            headers["OPEN-SANDBOX-API-KEY"] = self._config.OPENSANDBOX_API_KEY
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

    async def _request_with_prefix_fallback(
        self,
        method: str,
        path: str,
        *,
        json: Optional[dict[str, Any]] = None,
        content: Optional[bytes] = None,
        params: Optional[dict[str, str]] = None,
        timeout: Optional[int] = None,
    ) -> httpx.Response:
        """Request API path, probing known prefixes until one works."""
        last_error: Optional[SandboxAPIError] = None
        for prefix in self._iter_prefixes():
            url = self._join_prefix(prefix, path)
            try:
                response = await self._request(
                    method=method,
                    url=url,
                    json=json,
                    content=content,
                    params=params,
                    timeout=timeout,
                )
                if self._active_api_prefix is None:
                    self._active_api_prefix = prefix
                return response
            except SandboxAPIError as exc:
                # Only probe alternate prefixes when no prefix has been learned.
                if self._active_api_prefix is None and exc.status_code == 404:
                    last_error = exc
                    continue
                raise
        if last_error is not None:
            raise last_error
        raise SandboxAPIError(404, f"No OpenSandbox route matched path: {path}")

    async def create_sandbox(self, config: SandboxConfig) -> str:
        """POST /v1/sandboxes (or compatible prefix). Returns sandbox_id."""
        response: httpx.Response
        try:
            response = await self._request_with_prefix_fallback(
                method="POST",
                path="/sandboxes",
                json=config.to_create_payload(),
            )
        except SandboxAPIError as exc:
            # Backward compatibility for older custom schema in legacy servers.
            if exc.status_code != 422:
                raise
            response = await self._request_with_prefix_fallback(
                method="POST",
                path="/sandboxes",
                json=config.model_dump(),
            )
        data = response.json()
        sandbox_id = data.get("id") or data.get("sandboxId") or data.get("sandbox_id")
        if not sandbox_id:
            raise SandboxAPIError(
                response.status_code,
                f"Missing sandbox id in create response: {str(data)[:200]}",
            )
        logger.info("sandbox_created", sandbox_id=sandbox_id)
        return sandbox_id

    async def get_sandbox_status(self, sandbox_id: str) -> SandboxStatus:
        """GET /v1/sandboxes/{sandbox_id}. Returns SandboxStatus."""
        response = await self._request_with_prefix_fallback(
            method="GET",
            path=f"/sandboxes/{sandbox_id}",
        )
        return SandboxStatus.model_validate(response.json())

    async def destroy_sandbox(self, sandbox_id: str) -> None:
        """DELETE /v1/sandboxes/{sandbox_id}."""
        await self._request_with_prefix_fallback(
            method="DELETE",
            path=f"/sandboxes/{sandbox_id}",
        )
        logger.info("sandbox_destroyed", sandbox_id=sandbox_id)

    async def run_command(
        self, sandbox_id: str, command: str, timeout: int = 30
    ) -> CommandResult:
        """POST /v1/sandboxes/{sandbox_id}/commands. Returns CommandResult."""
        try:
            response = await self._request_with_prefix_fallback(
                method="POST",
                path=f"/sandboxes/{sandbox_id}/commands",
                json={"command": command, "timeout": timeout},
                timeout=timeout + 5,
            )
        except SandboxAPIError as exc:
            self._rethrow_feature_not_supported(exc, "run_command")
        return CommandResult.model_validate(response.json())

    async def write_file(
        self, sandbox_id: str, path: str, content: bytes
    ) -> None:
        """POST /v1/sandboxes/{sandbox_id}/files. Upload file content."""
        try:
            await self._request_with_prefix_fallback(
                method="POST",
                path=f"/sandboxes/{sandbox_id}/files",
                json={"path": path, "content": content.hex()},
            )
        except SandboxAPIError as exc:
            self._rethrow_feature_not_supported(exc, "write_file")

    async def read_file(self, sandbox_id: str, path: str) -> bytes:
        """GET /v1/sandboxes/{sandbox_id}/files. Download file content."""
        try:
            response = await self._request_with_prefix_fallback(
                method="GET",
                path=f"/sandboxes/{sandbox_id}/files",
                params={"path": path},
            )
        except SandboxAPIError as exc:
            self._rethrow_feature_not_supported(exc, "read_file")
        return response.content

    async def list_files(
        self, sandbox_id: str, path: str = "/"
    ) -> list[FileEntry]:
        """GET /v1/sandboxes/{sandbox_id}/files/list."""
        try:
            response = await self._request_with_prefix_fallback(
                method="GET",
                path=f"/sandboxes/{sandbox_id}/files/list",
                params={"path": path},
            )
        except SandboxAPIError as exc:
            self._rethrow_feature_not_supported(exc, "list_files")
        return [FileEntry.model_validate(entry) for entry in response.json()]

    async def execute_code(
        self, sandbox_id: str, code: str, language: str = "python"
    ) -> CommandResult:
        """POST /v1/sandboxes/{sandbox_id}/code. Execute via code interpreter."""
        try:
            response = await self._request_with_prefix_fallback(
                method="POST",
                path=f"/sandboxes/{sandbox_id}/code",
                json={"code": code, "language": language},
            )
        except SandboxAPIError as exc:
            self._rethrow_feature_not_supported(exc, "execute_code")
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


# Module-level singleton for convenience
_default_client: OpenSandboxClient | None = None


def get_sandbox_client() -> OpenSandboxClient:
    """Get or create the module-level OpenSandboxClient singleton."""
    global _default_client
    if _default_client is None:
        _default_client = OpenSandboxClient()
    return _default_client
# mypy: ignore-errors
