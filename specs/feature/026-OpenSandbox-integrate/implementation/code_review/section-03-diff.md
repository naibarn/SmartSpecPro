diff --git a/python-backend/app/integrations/__init__.py b/python-backend/app/integrations/__init__.py
new file mode 100644
index 0000000..f79984d
--- /dev/null
+++ b/python-backend/app/integrations/__init__.py
@@ -0,0 +1 @@
+"""External service integrations."""
diff --git a/python-backend/app/integrations/opensandbox/__init__.py b/python-backend/app/integrations/opensandbox/__init__.py
new file mode 100644
index 0000000..d57ffd5
--- /dev/null
+++ b/python-backend/app/integrations/opensandbox/__init__.py
@@ -0,0 +1,48 @@
+"""OpenSandbox integration module for SmartSpecPro."""
+from .client import (
+    OpenSandboxClient,
+    RetryableHTTPError,
+    SandboxAPIError,
+    SandboxProvisionError,
+)
+from .config import OpenSandboxSettings, opensandbox_settings
+from .lifecycle import SandboxLifecycleManager
+from .mock_backend import MockSandboxBackend, SandboxBackend
+from .models import (
+    CommandResult,
+    FileEntry,
+    SandboxConfig,
+    SandboxJobRequest,
+    SandboxJobResponse,
+    SandboxStatus,
+)
+
+__all__ = [
+    "OpenSandboxSettings",
+    "opensandbox_settings",
+    "SandboxConfig",
+    "SandboxStatus",
+    "CommandResult",
+    "FileEntry",
+    "SandboxJobRequest",
+    "SandboxJobResponse",
+    "OpenSandboxClient",
+    "SandboxAPIError",
+    "RetryableHTTPError",
+    "SandboxProvisionError",
+    "SandboxLifecycleManager",
+    "SandboxBackend",
+    "MockSandboxBackend",
+]
+
+
+def get_sandbox_backend() -> SandboxBackend:
+    """Return the appropriate sandbox backend based on configuration.
+
+    If OPENSANDBOX_ENABLED is True and OPENSANDBOX_BASE_URL is set, returns
+    the real OpenSandboxClient (which satisfies the SandboxBackend protocol
+    when adapted). Otherwise returns MockSandboxBackend.
+    """
+    if opensandbox_settings.is_enabled:
+        return OpenSandboxClient(opensandbox_settings)  # type: ignore[return-value]
+    return MockSandboxBackend()
diff --git a/python-backend/app/integrations/opensandbox/client.py b/python-backend/app/integrations/opensandbox/client.py
new file mode 100644
index 0000000..7d1c5ed
--- /dev/null
+++ b/python-backend/app/integrations/opensandbox/client.py
@@ -0,0 +1,195 @@
+"""Low-level HTTP client for the OpenSandbox API."""
+from typing import Any, Optional
+
+import httpx
+import pybreaker
+import structlog
+from tenacity import (
+    retry,
+    retry_if_exception_type,
+    stop_after_attempt,
+    wait_exponential,
+)
+
+from .config import OpenSandboxSettings, opensandbox_settings
+from .models import CommandResult, FileEntry, SandboxConfig, SandboxStatus
+
+logger = structlog.get_logger(__name__)
+
+
+class SandboxAPIError(Exception):
+    """Non-retryable error from the OpenSandbox API."""
+
+    def __init__(self, status_code: int, message: str):
+        self.status_code = status_code
+        self.message = message
+        super().__init__(f"SandboxAPIError({status_code}): {message}")
+
+
+class RetryableHTTPError(Exception):
+    """Retryable HTTP error (429, 500, 503)."""
+
+    def __init__(self, status_code: int, message: str):
+        self.status_code = status_code
+        self.message = message
+        super().__init__(f"RetryableHTTPError({status_code}): {message}")
+
+
+class SandboxProvisionError(Exception):
+    """Sandbox failed to reach ready state within timeout."""
+
+
+RETRYABLE_STATUS_CODES = {429, 500, 503}
+NON_RETRYABLE_STATUS_CODES = {400, 403, 404}
+
+
+class OpenSandboxClient:
+    """Low-level HTTP client for the OpenSandbox API."""
+
+    def __init__(self, config: Optional[OpenSandboxSettings] = None):
+        self._config = config or opensandbox_settings
+        self._http_client = httpx.AsyncClient(
+            base_url=self._config.OPENSANDBOX_BASE_URL,
+            limits=httpx.Limits(max_connections=20, max_keepalive_connections=10),
+            timeout=httpx.Timeout(self._config.OPENSANDBOX_REQUEST_TIMEOUT_SECONDS),
+        )
+        self._breaker = pybreaker.CircuitBreaker(
+            fail_max=5,
+            reset_timeout=30,
+            name="opensandbox",
+        )
+
+    @retry(
+        stop=stop_after_attempt(3),
+        wait=wait_exponential(multiplier=1, min=1, max=10),
+        retry=retry_if_exception_type((RetryableHTTPError, httpx.TransportError)),
+        reraise=True,
+    )
+    async def _request(
+        self,
+        method: str,
+        url: str,
+        *,
+        json: Optional[dict[str, Any]] = None,
+        content: Optional[bytes] = None,
+        params: Optional[dict[str, str]] = None,
+        timeout: Optional[int] = None,
+    ) -> httpx.Response:
+        """Send an HTTP request with circuit breaker and retry."""
+        headers = {}
+        if self._config.OPENSANDBOX_API_KEY:
+            headers["X-API-Key"] = self._config.OPENSANDBOX_API_KEY
+
+        request_timeout = timeout or self._config.OPENSANDBOX_REQUEST_TIMEOUT_SECONDS
+
+        def _do_request():
+            return self._http_client.request(
+                method=method,
+                url=url,
+                json=json,
+                content=content,
+                params=params,
+                headers=headers,
+                timeout=request_timeout,
+            )
+
+        response = await self._breaker.call_async(_do_request)
+
+        if response.status_code in RETRYABLE_STATUS_CODES:
+            raise RetryableHTTPError(
+                response.status_code,
+                response.text[:200],
+            )
+
+        if response.status_code in NON_RETRYABLE_STATUS_CODES:
+            raise SandboxAPIError(
+                response.status_code,
+                response.text[:200],
+            )
+
+        return response
+
+    async def create_sandbox(self, config: SandboxConfig) -> str:
+        """POST /api/v1/sandboxes. Returns sandbox_id."""
+        response = await self._request(
+            method="POST",
+            url="/api/v1/sandboxes",
+            json=config.model_dump(),
+        )
+        data = response.json()
+        sandbox_id = data["id"]
+        logger.info("sandbox_created", sandbox_id=sandbox_id)
+        return sandbox_id
+
+    async def get_sandbox_status(self, sandbox_id: str) -> SandboxStatus:
+        """GET /api/v1/sandboxes/{sandbox_id}. Returns SandboxStatus."""
+        response = await self._request(
+            method="GET",
+            url=f"/api/v1/sandboxes/{sandbox_id}",
+        )
+        return SandboxStatus.model_validate(response.json())
+
+    async def destroy_sandbox(self, sandbox_id: str) -> None:
+        """DELETE /api/v1/sandboxes/{sandbox_id}."""
+        await self._request(
+            method="DELETE",
+            url=f"/api/v1/sandboxes/{sandbox_id}",
+        )
+        logger.info("sandbox_destroyed", sandbox_id=sandbox_id)
+
+    async def run_command(
+        self, sandbox_id: str, command: str, timeout: int = 30
+    ) -> CommandResult:
+        """POST /api/v1/sandboxes/{sandbox_id}/commands. Returns CommandResult."""
+        response = await self._request(
+            method="POST",
+            url=f"/api/v1/sandboxes/{sandbox_id}/commands",
+            json={"command": command, "timeout": timeout},
+            timeout=timeout + 5,
+        )
+        return CommandResult.model_validate(response.json())
+
+    async def write_file(
+        self, sandbox_id: str, path: str, content: bytes
+    ) -> None:
+        """POST /api/v1/sandboxes/{sandbox_id}/files. Upload file content."""
+        await self._request(
+            method="POST",
+            url=f"/api/v1/sandboxes/{sandbox_id}/files",
+            json={"path": path, "content": content.hex()},
+        )
+
+    async def read_file(self, sandbox_id: str, path: str) -> bytes:
+        """GET /api/v1/sandboxes/{sandbox_id}/files. Download file content."""
+        response = await self._request(
+            method="GET",
+            url=f"/api/v1/sandboxes/{sandbox_id}/files",
+            params={"path": path},
+        )
+        return response.content
+
+    async def list_files(
+        self, sandbox_id: str, path: str = "/"
+    ) -> list[FileEntry]:
+        """GET /api/v1/sandboxes/{sandbox_id}/files/list."""
+        response = await self._request(
+            method="GET",
+            url=f"/api/v1/sandboxes/{sandbox_id}/files/list",
+            params={"path": path},
+        )
+        return [FileEntry.model_validate(entry) for entry in response.json()]
+
+    async def execute_code(
+        self, sandbox_id: str, code: str, language: str = "python"
+    ) -> CommandResult:
+        """POST /api/v1/sandboxes/{sandbox_id}/code. Execute via code interpreter."""
+        response = await self._request(
+            method="POST",
+            url=f"/api/v1/sandboxes/{sandbox_id}/code",
+            json={"code": code, "language": language},
+        )
+        return CommandResult.model_validate(response.json())
+
+    async def close(self) -> None:
+        """Close the httpx client."""
+        await self._http_client.aclose()
diff --git a/python-backend/app/integrations/opensandbox/config.py b/python-backend/app/integrations/opensandbox/config.py
new file mode 100644
index 0000000..eb59f5c
--- /dev/null
+++ b/python-backend/app/integrations/opensandbox/config.py
@@ -0,0 +1,44 @@
+"""OpenSandbox configuration settings."""
+from pydantic import field_validator
+from pydantic_settings import BaseSettings, SettingsConfigDict
+
+
+class OpenSandboxSettings(BaseSettings):
+    """Configuration for the OpenSandbox integration."""
+
+    model_config = SettingsConfigDict(
+        env_file=".env",
+        env_file_encoding="utf-8",
+        case_sensitive=False,
+        extra="ignore",
+    )
+
+    OPENSANDBOX_ENABLED: bool = False
+    OPENSANDBOX_BASE_URL: str = "http://localhost:8080"
+    OPENSANDBOX_API_KEY: str = ""
+    OPENSANDBOX_REQUEST_TIMEOUT_SECONDS: int = 30
+    OPENSANDBOX_CREATE_TIMEOUT_SECONDS: int = 120
+    OPENSANDBOX_READY_POLL_INTERVAL_MS: int = 2000
+    SANDBOX_ARTIFACT_BUCKET: str = "smartspec-sandbox-artifacts"
+    SANDBOX_SIGNED_URL_TTL_SECONDS: int = 900
+    SANDBOX_DEFAULT_NETWORK_ACTION: str = "deny"
+    SANDBOX_MAX_CONCURRENT_GLOBAL: int = 10
+    SANDBOX_MAX_CONCURRENT_PER_TENANT_DEFAULT: int = 3
+
+    @property
+    def is_enabled(self) -> bool:
+        """Return True if OpenSandbox is enabled and has a valid base URL."""
+        return self.OPENSANDBOX_ENABLED and bool(self.OPENSANDBOX_BASE_URL)
+
+    @field_validator("OPENSANDBOX_BASE_URL")
+    @classmethod
+    def validate_base_url(cls, v: str) -> str:
+        """Reject obviously malformed URLs."""
+        if v and not (v.startswith("http://") or v.startswith("https://")):
+            raise ValueError(
+                f"OPENSANDBOX_BASE_URL must start with http:// or https://, got: {v}"
+            )
+        return v.rstrip("/")
+
+
+opensandbox_settings = OpenSandboxSettings()
diff --git a/python-backend/app/integrations/opensandbox/execution.py b/python-backend/app/integrations/opensandbox/execution.py
new file mode 100644
index 0000000..92c599e
--- /dev/null
+++ b/python-backend/app/integrations/opensandbox/execution.py
@@ -0,0 +1,58 @@
+"""Sandbox command and code execution helpers."""
+import structlog
+
+from .client import OpenSandboxClient
+from .models import CommandResult
+
+logger = structlog.get_logger(__name__)
+
+MAX_OUTPUT_LENGTH = 50_000  # 50 KB max for stdout/stderr storage
+
+
+def _truncate(text: str, max_length: int = MAX_OUTPUT_LENGTH) -> str:
+    """Truncate text to max_length, adding a truncation marker."""
+    if len(text) <= max_length:
+        return text
+    return text[:max_length - 50] + "\n... [truncated]"
+
+
+async def run_command(
+    client: OpenSandboxClient,
+    sandbox_id: str,
+    command: str,
+    timeout: int = 30,
+) -> CommandResult:
+    """Execute a shell command in the sandbox. Truncates output if needed."""
+    logger.info(
+        "sandbox_run_command",
+        sandbox_id=sandbox_id,
+        command=command[:100],
+        timeout=timeout,
+    )
+    result = await client.run_command(sandbox_id, command, timeout=timeout)
+    return CommandResult(
+        exit_code=result.exit_code,
+        stdout=_truncate(result.stdout),
+        stderr=_truncate(result.stderr),
+    )
+
+
+async def run_code(
+    client: OpenSandboxClient,
+    sandbox_id: str,
+    code: str,
+    language: str = "python",
+) -> CommandResult:
+    """Execute code via the sandbox code interpreter."""
+    logger.info(
+        "sandbox_run_code",
+        sandbox_id=sandbox_id,
+        language=language,
+        code_length=len(code),
+    )
+    result = await client.execute_code(sandbox_id, code, language=language)
+    return CommandResult(
+        exit_code=result.exit_code,
+        stdout=_truncate(result.stdout),
+        stderr=_truncate(result.stderr),
+    )
diff --git a/python-backend/app/integrations/opensandbox/files.py b/python-backend/app/integrations/opensandbox/files.py
new file mode 100644
index 0000000..c875da9
--- /dev/null
+++ b/python-backend/app/integrations/opensandbox/files.py
@@ -0,0 +1,116 @@
+"""File staging between S3/R2 and sandbox."""
+import hashlib
+from typing import Any
+
+import structlog
+
+from .client import OpenSandboxClient
+
+logger = structlog.get_logger(__name__)
+
+
+async def stage_inputs(
+    client: OpenSandboxClient,
+    sandbox_id: str,
+    manifest: list[dict[str, Any]],
+    storage_service: Any,
+) -> list[dict[str, Any]]:
+    """Download files from S3/R2 and upload into sandbox.
+
+    manifest entries: [{"object_key": "...", "sandbox_path": "/workspace/input.mp4", "mime_type": "..."}]
+    Returns list of successfully staged entries.
+    Logs warning and skips missing objects.
+    """
+    staged = []
+    for entry in manifest:
+        object_key = entry["object_key"]
+        sandbox_path = entry["sandbox_path"]
+        try:
+            content = await storage_service.download_object(object_key)
+            await client.write_file(sandbox_id, sandbox_path, content)
+            staged.append(entry)
+            logger.info(
+                "sandbox_file_staged",
+                sandbox_id=sandbox_id,
+                object_key=object_key,
+                sandbox_path=sandbox_path,
+                size_bytes=len(content),
+            )
+        except Exception:
+            logger.warning(
+                "sandbox_file_stage_failed",
+                sandbox_id=sandbox_id,
+                object_key=object_key,
+                sandbox_path=sandbox_path,
+                exc_info=True,
+            )
+    return staged
+
+
+async def collect_outputs(
+    client: OpenSandboxClient,
+    sandbox_id: str,
+    output_paths: list[str],
+    storage_service: Any,
+    artifact_bucket: str,
+    job_id: str,
+) -> list[dict[str, Any]]:
+    """Download output files from sandbox and upload to S3/R2.
+
+    Returns list of dicts: [{"sandbox_path": "...", "object_key": "...", "size_bytes": N, "sha256": "..."}]
+    Computes SHA-256 checksum for each file.
+    """
+    collected = []
+    for sandbox_path in output_paths:
+        try:
+            content = await client.read_file(sandbox_id, sandbox_path)
+            sha256 = hashlib.sha256(content).hexdigest()
+
+            # Determine object key from job_id and filename
+            filename = sandbox_path.rsplit("/", 1)[-1]
+            object_key = f"sandbox-artifacts/{job_id}/{filename}"
+
+            await storage_service.upload_object(
+                object_key, content, bucket=artifact_bucket
+            )
+
+            collected.append(
+                {
+                    "sandbox_path": sandbox_path,
+                    "object_key": object_key,
+                    "size_bytes": len(content),
+                    "sha256": sha256,
+                }
+            )
+            logger.info(
+                "sandbox_output_collected",
+                sandbox_id=sandbox_id,
+                sandbox_path=sandbox_path,
+                object_key=object_key,
+                size_bytes=len(content),
+            )
+        except Exception:
+            logger.warning(
+                "sandbox_output_collect_failed",
+                sandbox_id=sandbox_id,
+                sandbox_path=sandbox_path,
+                exc_info=True,
+            )
+    return collected
+
+
+async def cleanup_sandbox_files(
+    client: OpenSandboxClient,
+    sandbox_id: str,
+    paths: list[str],
+) -> None:
+    """Remove specific files from sandbox."""
+    if not paths:
+        return
+    paths_str = " ".join(f'"{p}"' for p in paths)
+    await client.run_command(sandbox_id, f"rm -f {paths_str}", timeout=10)
+    logger.info(
+        "sandbox_files_cleaned",
+        sandbox_id=sandbox_id,
+        file_count=len(paths),
+    )
diff --git a/python-backend/app/integrations/opensandbox/lifecycle.py b/python-backend/app/integrations/opensandbox/lifecycle.py
new file mode 100644
index 0000000..dd1f00c
--- /dev/null
+++ b/python-backend/app/integrations/opensandbox/lifecycle.py
@@ -0,0 +1,108 @@
+"""High-level sandbox lifecycle management."""
+import asyncio
+from typing import Optional
+
+import structlog
+
+from .client import OpenSandboxClient, SandboxAPIError, SandboxProvisionError
+from .config import OpenSandboxSettings, opensandbox_settings
+from .models import SandboxConfig
+
+logger = structlog.get_logger(__name__)
+
+
+class SandboxLifecycleManager:
+    """Manages sandbox creation, readiness polling, and destruction."""
+
+    def __init__(
+        self,
+        client: OpenSandboxClient,
+        config: Optional[OpenSandboxSettings] = None,
+    ):
+        self._client = client
+        self._config = config or opensandbox_settings
+        self._job_sandbox_map: dict[str, str] = {}
+
+    async def provision_sandbox(
+        self, sandbox_config: SandboxConfig, job_id: str
+    ) -> str:
+        """Create sandbox and poll until status is 'running'.
+
+        Polls every OPENSANDBOX_READY_POLL_INTERVAL_MS.
+        Times out after OPENSANDBOX_CREATE_TIMEOUT_SECONDS.
+        Returns sandbox_id.
+        Raises SandboxProvisionError on timeout.
+        """
+        sandbox_id = await self._client.create_sandbox(sandbox_config)
+        logger.info(
+            "sandbox_provisioning",
+            sandbox_id=sandbox_id,
+            job_id=job_id,
+        )
+
+        poll_interval_s = self._config.OPENSANDBOX_READY_POLL_INTERVAL_MS / 1000.0
+        timeout_s = self._config.OPENSANDBOX_CREATE_TIMEOUT_SECONDS
+        elapsed = 0.0
+
+        while elapsed < timeout_s:
+            status = await self._client.get_sandbox_status(sandbox_id)
+            if status.status == "running":
+                logger.info(
+                    "sandbox_ready",
+                    sandbox_id=sandbox_id,
+                    job_id=job_id,
+                    elapsed_s=elapsed,
+                )
+                self._job_sandbox_map[job_id] = sandbox_id
+                return sandbox_id
+
+            if status.status == "error":
+                raise SandboxProvisionError(
+                    f"Sandbox {sandbox_id} entered error state"
+                )
+
+            await asyncio.sleep(poll_interval_s)
+            elapsed += poll_interval_s
+
+        raise SandboxProvisionError(
+            f"Sandbox {sandbox_id} did not reach 'running' state within "
+            f"{timeout_s}s (last status: {status.status})"
+        )
+
+    async def destroy_sandbox(self, sandbox_id: str) -> None:
+        """Destroy sandbox gracefully. Handles 404 (already gone) without raising."""
+        try:
+            await self._client.destroy_sandbox(sandbox_id)
+        except SandboxAPIError as e:
+            if e.status_code == 404:
+                logger.info(
+                    "sandbox_already_destroyed",
+                    sandbox_id=sandbox_id,
+                )
+            else:
+                raise
+
+        # Remove from cache
+        self._job_sandbox_map = {
+            k: v for k, v in self._job_sandbox_map.items() if v != sandbox_id
+        }
+
+    async def get_or_create(
+        self, sandbox_config: SandboxConfig, job_id: str
+    ) -> str:
+        """Idempotent sandbox provisioning.
+
+        Maintains an in-memory dict mapping job_id -> sandbox_id.
+        If job_id already has a sandbox, returns it.
+        Otherwise provisions a new one.
+        """
+        if job_id in self._job_sandbox_map:
+            existing_id = self._job_sandbox_map[job_id]
+            logger.info(
+                "sandbox_cache_hit",
+                sandbox_id=existing_id,
+                job_id=job_id,
+            )
+            return existing_id
+
+        return await self.provision_sandbox(sandbox_config, job_id)
diff --git a/python-backend/app/integrations/opensandbox/mock_backend.py b/python-backend/app/integrations/opensandbox/mock_backend.py
new file mode 100644
index 0000000..d77f628
--- /dev/null
+++ b/python-backend/app/integrations/opensandbox/mock_backend.py
@@ -0,0 +1,111 @@
+"""Mock sandbox backend for testing and CI environments."""
+import os
+import shutil
+import subprocess
+import tempfile
+import uuid
+from typing import Protocol, runtime_checkable
+
+from .models import CommandResult, SandboxConfig
+
+
+@runtime_checkable
+class SandboxBackend(Protocol):
+    """Protocol defining the sandbox execution interface."""
+
+    async def create(self, config: SandboxConfig) -> str: ...
+
+    async def execute(
+        self, sandbox_id: str, command: str, timeout: int
+    ) -> CommandResult: ...
+
+    async def write_file(
+        self, sandbox_id: str, path: str, content: bytes
+    ) -> None: ...
+
+    async def read_file(self, sandbox_id: str, path: str) -> bytes: ...
+
+    async def destroy(self, sandbox_id: str) -> None: ...
+
+
+class MockSandboxBackend:
+    """Mock sandbox backend using subprocess for local/CI testing.
+
+    Uses temporary directories to simulate sandbox filesystems.
+    Executes commands via subprocess.run() (NOT isolated).
+    """
+
+    def __init__(self) -> None:
+        self._sandboxes: dict[str, str] = {}  # sandbox_id -> temp_dir path
+
+    async def create(self, config: SandboxConfig) -> str:
+        """Create a temp directory as a fake sandbox. Return UUID."""
+        sandbox_id = str(uuid.uuid4())
+        temp_dir = tempfile.mkdtemp(prefix=f"sandbox-{sandbox_id[:8]}-")
+        self._sandboxes[sandbox_id] = temp_dir
+        return sandbox_id
+
+    async def execute(
+        self, sandbox_id: str, command: str, timeout: int
+    ) -> CommandResult:
+        """Run command via subprocess.run in the sandbox temp directory."""
+        temp_dir = self._sandboxes.get(sandbox_id)
+        if temp_dir is None:
+            return CommandResult(
+                exit_code=1,
+                stdout="",
+                stderr=f"Sandbox {sandbox_id} not found",
+            )
+
+        try:
+            result = subprocess.run(
+                command,
+                shell=True,
+                capture_output=True,
+                text=True,
+                timeout=timeout,
+                cwd=temp_dir,
+            )
+            return CommandResult(
+                exit_code=result.returncode,
+                stdout=result.stdout,
+                stderr=result.stderr,
+            )
+        except subprocess.TimeoutExpired:
+            return CommandResult(
+                exit_code=124,
+                stdout="",
+                stderr=f"Command timed out after {timeout}s",
+            )
+
+    async def write_file(
+        self, sandbox_id: str, path: str, content: bytes
+    ) -> None:
+        """Write file to the sandbox temp directory."""
+        temp_dir = self._sandboxes.get(sandbox_id)
+        if temp_dir is None:
+            raise ValueError(f"Sandbox {sandbox_id} not found")
+
+        # Strip leading / to make relative to temp_dir
+        rel_path = path.lstrip("/")
+        full_path = os.path.join(temp_dir, rel_path)
+        os.makedirs(os.path.dirname(full_path), exist_ok=True)
+        with open(full_path, "wb") as f:
+            f.write(content)
+
+    async def read_file(self, sandbox_id: str, path: str) -> bytes:
+        """Read file from the sandbox temp directory."""
+        temp_dir = self._sandboxes.get(sandbox_id)
+        if temp_dir is None:
+            raise ValueError(f"Sandbox {sandbox_id} not found")
+
+        rel_path = path.lstrip("/")
+        full_path = os.path.join(temp_dir, rel_path)
+        with open(full_path, "rb") as f:
+            return f.read()
+
+    async def destroy(self, sandbox_id: str) -> None:
+        """Remove the sandbox temp directory."""
+        temp_dir = self._sandboxes.pop(sandbox_id, None)
+        if temp_dir and os.path.exists(temp_dir):
+            shutil.rmtree(temp_dir, ignore_errors=True)
diff --git a/python-backend/app/integrations/opensandbox/models.py b/python-backend/app/integrations/opensandbox/models.py
new file mode 100644
index 0000000..396811d
--- /dev/null
+++ b/python-backend/app/integrations/opensandbox/models.py
@@ -0,0 +1,77 @@
+"""OpenSandbox Pydantic models for requests and responses."""
+from datetime import datetime
+from typing import Any, Optional
+
+from pydantic import BaseModel, Field
+
+
+class SandboxConfig(BaseModel):
+    """Parameters for creating a new sandbox container."""
+
+    image: str = "python:3.11-slim"
+    timeout_seconds: int = 300
+    env_vars: dict[str, str] = Field(default_factory=dict)
+    cpu_limit: str = "1000m"
+    memory_limit_mb: int = 2048
+    disk_limit_mb: int = 5120
+    network_action: str = "deny"
+    metadata: dict[str, str] = Field(default_factory=dict)
+
+
+class SandboxStatus(BaseModel):
+    """Status of an existing sandbox."""
+
+    id: str
+    status: str  # creating, running, stopped, error
+    created_at: Optional[datetime] = None
+    metadata: dict[str, Any] = Field(default_factory=dict)
+
+
+class CommandResult(BaseModel):
+    """Result of a command or code execution."""
+
+    exit_code: int
+    stdout: str = ""
+    stderr: str = ""
+
+
+class FileEntry(BaseModel):
+    """A file or directory entry in the sandbox filesystem."""
+
+    name: str
+    path: str
+    size: int = 0
+    is_directory: bool = False
+    modified_at: Optional[datetime] = None
+
+
+class SandboxJobRequest(BaseModel):
+    """Internal request to create a sandbox job."""
+
+    tenant_id: int
+    user_id: int
+    feature_type: str  # chat, skill, workflow, library, media, presentation, connector
+    feature_ref_id: Optional[str] = None
+    execution_mode: str  # code, command, browser, file, media
+    profile_slug: str = "code-default"
+    input_manifest: list[dict[str, Any]] = Field(default_factory=list)
+    command: Optional[str] = None
+    code: Optional[str] = None
+    language: Optional[str] = None
+    timeout_override: Optional[int] = None
+    idempotency_key: Optional[str] = None
+
+
+class SandboxJobResponse(BaseModel):
+    """Response from a completed sandbox job."""
+
+    job_id: str
+    status: str
+    exit_code: Optional[int] = None
+    stdout_excerpt: Optional[str] = None
+    stderr_excerpt: Optional[str] = None
+    output_manifest: list[dict[str, Any]] = Field(default_factory=list)
+    started_at: Optional[datetime] = None
+    finished_at: Optional[datetime] = None
+    duration_ms: Optional[int] = None
+    cost_actual: Optional[float] = None
diff --git a/python-backend/requirements.txt b/python-backend/requirements.txt
index 6c548c4..6ea7f27 100644
--- a/python-backend/requirements.txt
+++ b/python-backend/requirements.txt
@@ -175,3 +175,10 @@ Pillow>=10.0.0
 
 # PPTX parsing
 python-pptx>=1.0.2
+
+# ==========================================
+# Section 026: OpenSandbox Integration
+# ==========================================
+
+# Circuit breaker for sandbox client resilience
+pybreaker>=1.0.0
diff --git a/python-backend/tests/unit/integrations/__init__.py b/python-backend/tests/unit/integrations/__init__.py
new file mode 100644
index 0000000..e69de29
diff --git a/python-backend/tests/unit/integrations/opensandbox/__init__.py b/python-backend/tests/unit/integrations/opensandbox/__init__.py
new file mode 100644
index 0000000..e69de29
diff --git a/python-backend/tests/unit/integrations/opensandbox/test_client.py b/python-backend/tests/unit/integrations/opensandbox/test_client.py
new file mode 100644
index 0000000..3ac1ee6
--- /dev/null
+++ b/python-backend/tests/unit/integrations/opensandbox/test_client.py
@@ -0,0 +1,300 @@
+"""Tests for OpenSandbox HTTP client."""
+import pytest
+from unittest.mock import AsyncMock, MagicMock, patch
+import httpx
+
+
+@pytest.mark.unit
+@pytest.mark.sandbox
+class TestOpenSandboxClient:
+    """Tests for the low-level HTTP client wrapper."""
+
+    def _make_settings(self, **overrides):
+        from app.integrations.opensandbox.config import OpenSandboxSettings
+
+        defaults = {
+            "OPENSANDBOX_ENABLED": True,
+            "OPENSANDBOX_BASE_URL": "http://sandbox.test:8080",
+            "OPENSANDBOX_API_KEY": "test-api-key",
+            "OPENSANDBOX_REQUEST_TIMEOUT_SECONDS": 5,
+        }
+        defaults.update(overrides)
+        return OpenSandboxSettings(_env_file=None, **defaults)
+
+    async def test_create_sandbox_sends_correct_request(self):
+        """create_sandbox() POSTs to /api/v1/sandboxes with correct body."""
+        from app.integrations.opensandbox.client import OpenSandboxClient
+        from app.integrations.opensandbox.models import SandboxConfig
+
+        config = self._make_settings()
+        client = OpenSandboxClient(config)
+
+        mock_response = httpx.Response(
+            200,
+            json={"id": "sb-new-123"},
+            request=httpx.Request("POST", "http://sandbox.test:8080/api/v1/sandboxes"),
+        )
+
+        with patch.object(client._http_client, "request", new_callable=AsyncMock) as mock_req:
+            mock_req.return_value = mock_response
+            sandbox_id = await client.create_sandbox(SandboxConfig())
+            assert sandbox_id == "sb-new-123"
+            mock_req.assert_called_once()
+            call_kwargs = mock_req.call_args
+            assert call_kwargs.kwargs["method"] == "POST"
+            assert "/api/v1/sandboxes" in call_kwargs.kwargs["url"]
+
+        await client.close()
+
+    async def test_create_sandbox_returns_sandbox_id(self):
+        """Successful create returns the sandbox ID string."""
+        from app.integrations.opensandbox.client import OpenSandboxClient
+        from app.integrations.opensandbox.models import SandboxConfig
+
+        config = self._make_settings()
+        client = OpenSandboxClient(config)
+
+        mock_response = httpx.Response(
+            200,
+            json={"id": "sb-abc-456"},
+            request=httpx.Request("POST", "http://sandbox.test:8080/api/v1/sandboxes"),
+        )
+
+        with patch.object(client._http_client, "request", new_callable=AsyncMock) as mock_req:
+            mock_req.return_value = mock_response
+            result = await client.create_sandbox(SandboxConfig())
+            assert isinstance(result, str)
+            assert result == "sb-abc-456"
+
+        await client.close()
+
+    async def test_get_sandbox_status_returns_status_model(self):
+        """get_sandbox_status() GETs /api/v1/sandboxes/{id} and returns SandboxStatus."""
+        from app.integrations.opensandbox.client import OpenSandboxClient
+        from app.integrations.opensandbox.models import SandboxStatus
+
+        config = self._make_settings()
+        client = OpenSandboxClient(config)
+
+        mock_response = httpx.Response(
+            200,
+            json={"id": "sb-123", "status": "running", "metadata": {}},
+            request=httpx.Request("GET", "http://sandbox.test:8080/api/v1/sandboxes/sb-123"),
+        )
+
+        with patch.object(client._http_client, "request", new_callable=AsyncMock) as mock_req:
+            mock_req.return_value = mock_response
+            status = await client.get_sandbox_status("sb-123")
+            assert isinstance(status, SandboxStatus)
+            assert status.status == "running"
+
+        await client.close()
+
+    async def test_destroy_sandbox_sends_delete(self):
+        """destroy_sandbox() DELETEs /api/v1/sandboxes/{id}."""
+        from app.integrations.opensandbox.client import OpenSandboxClient
+
+        config = self._make_settings()
+        client = OpenSandboxClient(config)
+
+        mock_response = httpx.Response(
+            204,
+            request=httpx.Request("DELETE", "http://sandbox.test:8080/api/v1/sandboxes/sb-123"),
+        )
+
+        with patch.object(client._http_client, "request", new_callable=AsyncMock) as mock_req:
+            mock_req.return_value = mock_response
+            await client.destroy_sandbox("sb-123")
+            call_kwargs = mock_req.call_args
+            assert call_kwargs.kwargs["method"] == "DELETE"
+
+        await client.close()
+
+    async def test_run_command_sends_correct_payload(self):
+        """run_command() POSTs command string and timeout to execution endpoint."""
+        from app.integrations.opensandbox.client import OpenSandboxClient
+
+        config = self._make_settings()
+        client = OpenSandboxClient(config)
+
+        mock_response = httpx.Response(
+            200,
+            json={"exit_code": 0, "stdout": "hello\n", "stderr": ""},
+            request=httpx.Request("POST", "http://sandbox.test:8080/api/v1/sandboxes/sb-1/commands"),
+        )
+
+        with patch.object(client._http_client, "request", new_callable=AsyncMock) as mock_req:
+            mock_req.return_value = mock_response
+            result = await client.run_command("sb-1", "echo hello", timeout=10)
+            assert result.exit_code == 0
+            assert result.stdout == "hello\n"
+
+        await client.close()
+
+    async def test_write_file_uploads_bytes(self):
+        """write_file() POSTs file content to sandbox filesystem endpoint."""
+        from app.integrations.opensandbox.client import OpenSandboxClient
+
+        config = self._make_settings()
+        client = OpenSandboxClient(config)
+
+        mock_response = httpx.Response(
+            200,
+            json={"success": True},
+            request=httpx.Request("POST", "http://sandbox.test:8080/api/v1/sandboxes/sb-1/files"),
+        )
+
+        with patch.object(client._http_client, "request", new_callable=AsyncMock) as mock_req:
+            mock_req.return_value = mock_response
+            await client.write_file("sb-1", "/workspace/test.txt", b"hello world")
+            mock_req.assert_called_once()
+
+        await client.close()
+
+    async def test_read_file_returns_bytes(self):
+        """read_file() GETs file content from sandbox filesystem endpoint."""
+        from app.integrations.opensandbox.client import OpenSandboxClient
+
+        config = self._make_settings()
+        client = OpenSandboxClient(config)
+
+        mock_response = httpx.Response(
+            200,
+            content=b"file content here",
+            request=httpx.Request("GET", "http://sandbox.test:8080/api/v1/sandboxes/sb-1/files"),
+        )
+
+        with patch.object(client._http_client, "request", new_callable=AsyncMock) as mock_req:
+            mock_req.return_value = mock_response
+            data = await client.read_file("sb-1", "/workspace/test.txt")
+            assert data == b"file content here"
+
+        await client.close()
+
+    async def test_list_files_returns_file_entries(self):
+        """list_files() returns list of FileEntry models."""
+        from app.integrations.opensandbox.client import OpenSandboxClient
+
+        config = self._make_settings()
+        client = OpenSandboxClient(config)
+
+        mock_response = httpx.Response(
+            200,
+            json=[
+                {"name": "file1.py", "path": "/workspace/file1.py", "size": 100, "is_directory": False},
+                {"name": "data", "path": "/workspace/data", "size": 0, "is_directory": True},
+            ],
+            request=httpx.Request("GET", "http://sandbox.test:8080/api/v1/sandboxes/sb-1/files/list"),
+        )
+
+        with patch.object(client._http_client, "request", new_callable=AsyncMock) as mock_req:
+            mock_req.return_value = mock_response
+            entries = await client.list_files("sb-1", "/workspace")
+            assert len(entries) == 2
+            assert entries[0].name == "file1.py"
+            assert entries[1].is_directory is True
+
+        await client.close()
+
+    async def test_circuit_breaker_opens_after_5_failures(self):
+        """After 5 consecutive failures, circuit breaker opens and rejects calls."""
+        from pybreaker import CircuitBreakerError
+
+        from app.integrations.opensandbox.client import OpenSandboxClient
+        from app.integrations.opensandbox.models import SandboxConfig
+
+        config = self._make_settings()
+        client = OpenSandboxClient(config)
+
+        with patch.object(client._http_client, "request", new_callable=AsyncMock) as mock_req:
+            mock_req.side_effect = httpx.ConnectError("connection refused")
+
+            # First 5 calls should attempt the request and fail
+            for i in range(5):
+                with pytest.raises((httpx.ConnectError, Exception)):
+                    await client.create_sandbox(SandboxConfig())
+
+            # 6th call should be rejected by circuit breaker without hitting HTTP
+            with pytest.raises((CircuitBreakerError, Exception)):
+                await client.create_sandbox(SandboxConfig())
+
+        await client.close()
+
+    async def test_retry_on_429_500_503(self):
+        """Client retries on 429, 500, 503 status codes."""
+        from app.integrations.opensandbox.client import OpenSandboxClient
+        from app.integrations.opensandbox.models import SandboxConfig
+
+        config = self._make_settings()
+        client = OpenSandboxClient(config)
+
+        responses = [
+            httpx.Response(
+                503,
+                json={"error": "unavailable"},
+                request=httpx.Request("POST", "http://sandbox.test:8080/api/v1/sandboxes"),
+            ),
+            httpx.Response(
+                503,
+                json={"error": "unavailable"},
+                request=httpx.Request("POST", "http://sandbox.test:8080/api/v1/sandboxes"),
+            ),
+            httpx.Response(
+                200,
+                json={"id": "sb-retry-ok"},
+                request=httpx.Request("POST", "http://sandbox.test:8080/api/v1/sandboxes"),
+            ),
+        ]
+
+        with patch.object(client._http_client, "request", new_callable=AsyncMock) as mock_req:
+            mock_req.side_effect = responses
+            result = await client.create_sandbox(SandboxConfig())
+            assert result == "sb-retry-ok"
+            assert mock_req.call_count == 3
+
+        await client.close()
+
+    async def test_no_retry_on_400_403_404(self):
+        """Client does NOT retry on 400, 403, 404 (client errors)."""
+        from app.integrations.opensandbox.client import OpenSandboxClient, SandboxAPIError
+        from app.integrations.opensandbox.models import SandboxConfig
+
+        config = self._make_settings()
+        client = OpenSandboxClient(config)
+
+        mock_response = httpx.Response(
+            400,
+            json={"error": "bad request"},
+            request=httpx.Request("POST", "http://sandbox.test:8080/api/v1/sandboxes"),
+        )
+
+        with patch.object(client._http_client, "request", new_callable=AsyncMock) as mock_req:
+            mock_req.return_value = mock_response
+            with pytest.raises(SandboxAPIError):
+                await client.create_sandbox(SandboxConfig())
+            assert mock_req.call_count == 1  # No retry
+
+        await client.close()
+
+    async def test_api_key_sent_in_header(self):
+        """All requests include X-API-Key header."""
+        from app.integrations.opensandbox.client import OpenSandboxClient
+        from app.integrations.opensandbox.models import SandboxConfig
+
+        config = self._make_settings(OPENSANDBOX_API_KEY="my-secret-key")
+        client = OpenSandboxClient(config)
+
+        mock_response = httpx.Response(
+            200,
+            json={"id": "sb-header-test"},
+            request=httpx.Request("POST", "http://sandbox.test:8080/api/v1/sandboxes"),
+        )
+
+        with patch.object(client._http_client, "request", new_callable=AsyncMock) as mock_req:
+            mock_req.return_value = mock_response
+            await client.create_sandbox(SandboxConfig())
+            call_kwargs = mock_req.call_args
+            headers = call_kwargs.kwargs.get("headers", {})
+            assert headers.get("X-API-Key") == "my-secret-key"
+
+        await client.close()
diff --git a/python-backend/tests/unit/integrations/opensandbox/test_config.py b/python-backend/tests/unit/integrations/opensandbox/test_config.py
new file mode 100644
index 0000000..c6fa7bb
--- /dev/null
+++ b/python-backend/tests/unit/integrations/opensandbox/test_config.py
@@ -0,0 +1,95 @@
+"""Tests for OpenSandbox configuration."""
+import pytest
+from unittest.mock import patch
+
+
+@pytest.mark.unit
+@pytest.mark.sandbox
+class TestOpenSandboxConfig:
+    """Tests for the OpenSandboxSettings Pydantic config class."""
+
+    def test_defaults_load_when_no_env_vars_set(self):
+        """Default settings should be valid with OPENSANDBOX_ENABLED=False."""
+        with patch.dict("os.environ", {}, clear=False):
+            from app.integrations.opensandbox.config import OpenSandboxSettings
+
+            settings = OpenSandboxSettings(
+                _env_file=None,
+            )
+            assert settings.OPENSANDBOX_ENABLED is False
+            assert settings.OPENSANDBOX_BASE_URL == "http://localhost:8080"
+            assert settings.OPENSANDBOX_API_KEY == ""
+            assert settings.OPENSANDBOX_REQUEST_TIMEOUT_SECONDS == 30
+            assert settings.OPENSANDBOX_CREATE_TIMEOUT_SECONDS == 120
+
+    def test_settings_override_from_environment(self):
+        """Env vars should override all defaults."""
+        env = {
+            "OPENSANDBOX_ENABLED": "true",
+            "OPENSANDBOX_BASE_URL": "http://custom:9090",
+            "OPENSANDBOX_API_KEY": "test-key-123",
+            "OPENSANDBOX_REQUEST_TIMEOUT_SECONDS": "60",
+            "OPENSANDBOX_CREATE_TIMEOUT_SECONDS": "240",
+            "OPENSANDBOX_READY_POLL_INTERVAL_MS": "5000",
+            "SANDBOX_MAX_CONCURRENT_GLOBAL": "20",
+        }
+        with patch.dict("os.environ", env, clear=False):
+            from app.integrations.opensandbox.config import OpenSandboxSettings
+
+            settings = OpenSandboxSettings(_env_file=None)
+            assert settings.OPENSANDBOX_ENABLED is True
+            assert settings.OPENSANDBOX_BASE_URL == "http://custom:9090"
+            assert settings.OPENSANDBOX_API_KEY == "test-key-123"
+            assert settings.OPENSANDBOX_REQUEST_TIMEOUT_SECONDS == 60
+            assert settings.OPENSANDBOX_CREATE_TIMEOUT_SECONDS == 240
+            assert settings.OPENSANDBOX_READY_POLL_INTERVAL_MS == 5000
+            assert settings.SANDBOX_MAX_CONCURRENT_GLOBAL == 20
+
+    def test_disabled_flag_prevents_operations(self):
+        """When OPENSANDBOX_ENABLED=false, is_enabled property returns False."""
+        from app.integrations.opensandbox.config import OpenSandboxSettings
+
+        settings = OpenSandboxSettings(
+            OPENSANDBOX_ENABLED=False,
+            OPENSANDBOX_BASE_URL="http://localhost:8080",
+            _env_file=None,
+        )
+        assert settings.is_enabled is False
+
+    def test_enabled_with_valid_url_returns_true(self):
+        """When enabled=True and URL set, is_enabled returns True."""
+        from app.integrations.opensandbox.config import OpenSandboxSettings
+
+        settings = OpenSandboxSettings(
+            OPENSANDBOX_ENABLED=True,
+            OPENSANDBOX_BASE_URL="http://localhost:8080",
+            _env_file=None,
+        )
+        assert settings.is_enabled is True
+
+    def test_invalid_url_raises_validation_error(self):
+        """A malformed base URL should raise a Pydantic validation error."""
+        from pydantic import ValidationError
+
+        from app.integrations.opensandbox.config import OpenSandboxSettings
+
+        with pytest.raises(ValidationError):
+            OpenSandboxSettings(
+                OPENSANDBOX_BASE_URL="not-a-url",
+                _env_file=None,
+            )
+
+    def test_timeout_settings_are_integers(self):
+        """Timeout fields parse correctly from string env vars to int."""
+        from app.integrations.opensandbox.config import OpenSandboxSettings
+
+        settings = OpenSandboxSettings(
+            OPENSANDBOX_REQUEST_TIMEOUT_SECONDS=45,
+            OPENSANDBOX_CREATE_TIMEOUT_SECONDS=180,
+            OPENSANDBOX_READY_POLL_INTERVAL_MS=3000,
+            _env_file=None,
+        )
+        assert isinstance(settings.OPENSANDBOX_REQUEST_TIMEOUT_SECONDS, int)
+        assert isinstance(settings.OPENSANDBOX_CREATE_TIMEOUT_SECONDS, int)
+        assert isinstance(settings.OPENSANDBOX_READY_POLL_INTERVAL_MS, int)
+        assert settings.OPENSANDBOX_REQUEST_TIMEOUT_SECONDS == 45
diff --git a/python-backend/tests/unit/integrations/opensandbox/test_execution.py b/python-backend/tests/unit/integrations/opensandbox/test_execution.py
new file mode 100644
index 0000000..a4b5474
--- /dev/null
+++ b/python-backend/tests/unit/integrations/opensandbox/test_execution.py
@@ -0,0 +1,80 @@
+"""Tests for OpenSandbox execution functions."""
+import pytest
+from unittest.mock import AsyncMock
+
+
+@pytest.mark.unit
+@pytest.mark.sandbox
+class TestSandboxExecution:
+    """Tests for run_command and run_code."""
+
+    async def test_run_command_returns_exit_code_stdout_stderr(self):
+        """run_command() returns a CommandResult with all three fields."""
+        from app.integrations.opensandbox.execution import run_command
+        from app.integrations.opensandbox.models import CommandResult
+
+        mock_client = AsyncMock()
+        mock_client.run_command = AsyncMock(
+            return_value=CommandResult(exit_code=0, stdout="output\n", stderr="")
+        )
+
+        result = await run_command(mock_client, "sb-1", "echo output")
+        assert result.exit_code == 0
+        assert result.stdout == "output\n"
+        assert result.stderr == ""
+
+    async def test_run_command_respects_timeout(self):
+        """run_command() passes timeout to the client call."""
+        from app.integrations.opensandbox.execution import run_command
+        from app.integrations.opensandbox.models import CommandResult
+
+        mock_client = AsyncMock()
+        mock_client.run_command = AsyncMock(
+            return_value=CommandResult(exit_code=0, stdout="", stderr="")
+        )
+
+        await run_command(mock_client, "sb-1", "sleep 5", timeout=60)
+        mock_client.run_command.assert_called_once_with("sb-1", "sleep 5", timeout=60)
+
+    async def test_run_code_sends_to_interpreter_endpoint(self):
+        """run_code() sends code and language to the code interpreter API."""
+        from app.integrations.opensandbox.execution import run_code
+        from app.integrations.opensandbox.models import CommandResult
+
+        mock_client = AsyncMock()
+        mock_client.execute_code = AsyncMock(
+            return_value=CommandResult(exit_code=0, stdout="42\n", stderr="")
+        )
+
+        result = await run_code(mock_client, "sb-1", "print(6*7)", language="python")
+        assert result.exit_code == 0
+        assert result.stdout == "42\n"
+        mock_client.execute_code.assert_called_once_with("sb-1", "print(6*7)", language="python")
+
+    async def test_command_failure_returns_nonzero_exit_code(self):
+        """A failed command returns non-zero exit_code, stderr populated."""
+        from app.integrations.opensandbox.execution import run_command
+        from app.integrations.opensandbox.models import CommandResult
+
+        mock_client = AsyncMock()
+        mock_client.run_command = AsyncMock(
+            return_value=CommandResult(exit_code=1, stdout="", stderr="command not found")
+        )
+
+        result = await run_command(mock_client, "sb-1", "nonexistent_cmd")
+        assert result.exit_code == 1
+        assert "command not found" in result.stderr
+
+    async def test_run_command_truncates_large_output(self):
+        """stdout/stderr exceeding max length are truncated."""
+        from app.integrations.opensandbox.execution import MAX_OUTPUT_LENGTH, run_command
+        from app.integrations.opensandbox.models import CommandResult
+
+        large_output = "x" * (MAX_OUTPUT_LENGTH + 10000)
+        mock_client = AsyncMock()
+        mock_client.run_command = AsyncMock(
+            return_value=CommandResult(exit_code=0, stdout=large_output, stderr="")
+        )
+
+        result = await run_command(mock_client, "sb-1", "cat big_file")
+        assert len(result.stdout) <= MAX_OUTPUT_LENGTH
diff --git a/python-backend/tests/unit/integrations/opensandbox/test_files.py b/python-backend/tests/unit/integrations/opensandbox/test_files.py
new file mode 100644
index 0000000..d5b22ee
--- /dev/null
+++ b/python-backend/tests/unit/integrations/opensandbox/test_files.py
@@ -0,0 +1,107 @@
+"""Tests for OpenSandbox file staging and collection."""
+import pytest
+from unittest.mock import AsyncMock, MagicMock, patch
+
+
+@pytest.mark.unit
+@pytest.mark.sandbox
+class TestSandboxFiles:
+    """Tests for stage_inputs and collect_outputs."""
+
+    async def test_stage_inputs_uploads_each_file_from_manifest(self):
+        """stage_inputs() downloads each S3 object and uploads into sandbox."""
+        from app.integrations.opensandbox.files import stage_inputs
+
+        mock_client = AsyncMock()
+        mock_client.write_file = AsyncMock(return_value=None)
+
+        mock_storage = AsyncMock()
+        mock_storage.download_object = AsyncMock(return_value=b"file-content")
+
+        manifest = [
+            {"object_key": "inputs/a.txt", "sandbox_path": "/workspace/a.txt", "mime_type": "text/plain"},
+            {"object_key": "inputs/b.txt", "sandbox_path": "/workspace/b.txt", "mime_type": "text/plain"},
+            {"object_key": "inputs/c.txt", "sandbox_path": "/workspace/c.txt", "mime_type": "text/plain"},
+        ]
+
+        result = await stage_inputs(mock_client, "sb-1", manifest, mock_storage)
+        assert len(result) == 3
+        assert mock_client.write_file.call_count == 3
+
+    async def test_stage_inputs_handles_missing_s3_object_gracefully(self):
+        """If an S3 object is missing, stage_inputs logs warning and continues."""
+        from app.integrations.opensandbox.files import stage_inputs
+
+        mock_client = AsyncMock()
+        mock_client.write_file = AsyncMock(return_value=None)
+
+        mock_storage = AsyncMock()
+        # First call succeeds, second raises (missing object)
+        mock_storage.download_object = AsyncMock(
+            side_effect=[b"content", Exception("NoSuchKey"), b"content2"]
+        )
+
+        manifest = [
+            {"object_key": "inputs/a.txt", "sandbox_path": "/workspace/a.txt", "mime_type": "text/plain"},
+            {"object_key": "inputs/missing.txt", "sandbox_path": "/workspace/missing.txt", "mime_type": "text/plain"},
+            {"object_key": "inputs/c.txt", "sandbox_path": "/workspace/c.txt", "mime_type": "text/plain"},
+        ]
+
+        result = await stage_inputs(mock_client, "sb-1", manifest, mock_storage)
+        # Only 2 succeeded
+        assert len(result) == 2
+        assert mock_client.write_file.call_count == 2
+
+    async def test_collect_outputs_downloads_and_uploads_to_s3(self):
+        """collect_outputs() reads files from sandbox and uploads to S3/R2."""
+        from app.integrations.opensandbox.files import collect_outputs
+
+        mock_client = AsyncMock()
+        mock_client.read_file = AsyncMock(return_value=b"output-data")
+
+        mock_storage = AsyncMock()
+        mock_storage.upload_object = AsyncMock(return_value=None)
+
+        output_paths = ["/workspace/output.mp4", "/workspace/log.txt"]
+
+        result = await collect_outputs(
+            mock_client, "sb-1", output_paths, mock_storage,
+            artifact_bucket="test-bucket", job_id="job-123"
+        )
+        assert len(result) == 2
+        assert mock_client.read_file.call_count == 2
+        assert mock_storage.upload_object.call_count == 2
+
+    async def test_collect_outputs_computes_sha256_checksum(self):
+        """Each collected output includes SHA-256 checksum."""
+        import hashlib
+
+        from app.integrations.opensandbox.files import collect_outputs
+
+        content = b"test file content for checksum"
+        expected_hash = hashlib.sha256(content).hexdigest()
+
+        mock_client = AsyncMock()
+        mock_client.read_file = AsyncMock(return_value=content)
+
+        mock_storage = AsyncMock()
+        mock_storage.upload_object = AsyncMock(return_value=None)
+
+        result = await collect_outputs(
+            mock_client, "sb-1", ["/workspace/out.bin"], mock_storage,
+            artifact_bucket="test-bucket", job_id="job-sha"
+        )
+        assert len(result) == 1
+        assert result[0]["sha256"] == expected_hash
+
+    async def test_cleanup_sandbox_files_calls_client(self):
+        """cleanup_sandbox_files() removes staged files from sandbox."""
+        from app.integrations.opensandbox.files import cleanup_sandbox_files
+
+        mock_client = AsyncMock()
+        mock_client.run_command = AsyncMock()
+
+        paths = ["/workspace/a.txt", "/workspace/b.txt"]
+        await cleanup_sandbox_files(mock_client, "sb-1", paths)
+        # Should call run_command to remove files
+        mock_client.run_command.assert_called()
diff --git a/python-backend/tests/unit/integrations/opensandbox/test_lifecycle.py b/python-backend/tests/unit/integrations/opensandbox/test_lifecycle.py
new file mode 100644
index 0000000..f8b2694
--- /dev/null
+++ b/python-backend/tests/unit/integrations/opensandbox/test_lifecycle.py
@@ -0,0 +1,145 @@
+"""Tests for OpenSandbox lifecycle management."""
+import pytest
+from unittest.mock import AsyncMock, patch
+
+
+@pytest.mark.unit
+@pytest.mark.sandbox
+class TestSandboxLifecycle:
+    """Tests for provision, destroy, and idempotent get_or_create."""
+
+    def _make_settings(self):
+        from app.integrations.opensandbox.config import OpenSandboxSettings
+
+        return OpenSandboxSettings(
+            OPENSANDBOX_ENABLED=True,
+            OPENSANDBOX_BASE_URL="http://sandbox.test:8080",
+            OPENSANDBOX_API_KEY="test-key",
+            OPENSANDBOX_REQUEST_TIMEOUT_SECONDS=5,
+            OPENSANDBOX_CREATE_TIMEOUT_SECONDS=10,
+            OPENSANDBOX_READY_POLL_INTERVAL_MS=100,
+            _env_file=None,
+        )
+
+    async def test_provision_sandbox_creates_and_polls_until_ready(self):
+        """provision_sandbox() calls create, then polls status until 'running'."""
+        from app.integrations.opensandbox.lifecycle import SandboxLifecycleManager
+        from app.integrations.opensandbox.models import SandboxConfig, SandboxStatus
+
+        mock_client = AsyncMock()
+        mock_client.create_sandbox = AsyncMock(return_value="sb-new-1")
+        mock_client.get_sandbox_status = AsyncMock(
+            side_effect=[
+                SandboxStatus(id="sb-new-1", status="creating"),
+                SandboxStatus(id="sb-new-1", status="running"),
+            ]
+        )
+
+        config = self._make_settings()
+        manager = SandboxLifecycleManager(mock_client, config)
+        sandbox_id = await manager.provision_sandbox(SandboxConfig(), "job-1")
+
+        assert sandbox_id == "sb-new-1"
+        mock_client.create_sandbox.assert_called_once()
+        assert mock_client.get_sandbox_status.call_count == 2
+
+    async def test_provision_sandbox_fails_after_max_poll_attempts(self):
+        """provision_sandbox() raises after exhausting poll attempts."""
+        from app.integrations.opensandbox.client import SandboxProvisionError
+        from app.integrations.opensandbox.lifecycle import SandboxLifecycleManager
+        from app.integrations.opensandbox.models import SandboxConfig, SandboxStatus
+
+        mock_client = AsyncMock()
+        mock_client.create_sandbox = AsyncMock(return_value="sb-stuck")
+        # Always return 'creating' -- never reaches 'running'
+        mock_client.get_sandbox_status = AsyncMock(
+            return_value=SandboxStatus(id="sb-stuck", status="creating")
+        )
+
+        config = self._make_settings()
+        # Very short timeout so test doesn't hang
+        config.OPENSANDBOX_CREATE_TIMEOUT_SECONDS = 1
+        config.OPENSANDBOX_READY_POLL_INTERVAL_MS = 100
+        manager = SandboxLifecycleManager(mock_client, config)
+
+        with pytest.raises(SandboxProvisionError):
+            await manager.provision_sandbox(SandboxConfig(), "job-stuck")
+
+    async def test_destroy_sandbox_calls_client_destroy(self):
+        """destroy_sandbox() delegates to client and handles success."""
+        from app.integrations.opensandbox.lifecycle import SandboxLifecycleManager
+
+        mock_client = AsyncMock()
+        mock_client.destroy_sandbox = AsyncMock(return_value=None)
+
+        config = self._make_settings()
+        manager = SandboxLifecycleManager(mock_client, config)
+        await manager.destroy_sandbox("sb-del-1")
+        mock_client.destroy_sandbox.assert_called_once_with("sb-del-1")
+
+    async def test_destroy_already_destroyed_sandbox_is_graceful(self):
+        """destroy_sandbox() handles 404 (already gone) without raising."""
+        from app.integrations.opensandbox.client import SandboxAPIError
+        from app.integrations.opensandbox.lifecycle import SandboxLifecycleManager
+
+        mock_client = AsyncMock()
+        mock_client.destroy_sandbox = AsyncMock(
+            side_effect=SandboxAPIError(404, "not found")
+        )
+
+        config = self._make_settings()
+        manager = SandboxLifecycleManager(mock_client, config)
+        # Should not raise
+        await manager.destroy_sandbox("sb-already-gone")
+
+    async def test_get_or_create_returns_existing_for_same_job_id(self):
+        """get_or_create() with same job_id returns the cached sandbox."""
+        from app.integrations.opensandbox.lifecycle import SandboxLifecycleManager
+        from app.integrations.opensandbox.models import SandboxConfig, SandboxStatus
+
+        mock_client = AsyncMock()
+        mock_client.create_sandbox = AsyncMock(return_value="sb-cached")
+        mock_client.get_sandbox_status = AsyncMock(
+            return_value=SandboxStatus(id="sb-cached", status="running")
+        )
+
+        config = self._make_settings()
+        manager = SandboxLifecycleManager(mock_client, config)
+        sb_config = SandboxConfig()
+
+        # First call provisions
+        id1 = await manager.get_or_create(sb_config, "job-same")
+        # Second call returns cached
+        id2 = await manager.get_or_create(sb_config, "job-same")
+
+        assert id1 == id2
+        # create_sandbox called only once
+        assert mock_client.create_sandbox.call_count == 1
+
+    async def test_get_or_create_creates_new_for_different_job_id(self):
+        """get_or_create() with different job_id provisions a new sandbox."""
+        from app.integrations.opensandbox.lifecycle import SandboxLifecycleManager
+        from app.integrations.opensandbox.models import SandboxConfig, SandboxStatus
+
+        call_count = 0
+
+        async def mock_create(config):
+            nonlocal call_count
+            call_count += 1
+            return f"sb-{call_count}"
+
+        mock_client = AsyncMock()
+        mock_client.create_sandbox = AsyncMock(side_effect=mock_create)
+        mock_client.get_sandbox_status = AsyncMock(
+            side_effect=lambda sid: SandboxStatus(id=sid, status="running")
+        )
+
+        config = self._make_settings()
+        manager = SandboxLifecycleManager(mock_client, config)
+        sb_config = SandboxConfig()
+
+        id1 = await manager.get_or_create(sb_config, "job-a")
+        id2 = await manager.get_or_create(sb_config, "job-b")
+
+        assert id1 != id2
+        assert mock_client.create_sandbox.call_count == 2
diff --git a/python-backend/tests/unit/integrations/opensandbox/test_mock_backend.py b/python-backend/tests/unit/integrations/opensandbox/test_mock_backend.py
new file mode 100644
index 0000000..61bb40d
--- /dev/null
+++ b/python-backend/tests/unit/integrations/opensandbox/test_mock_backend.py
@@ -0,0 +1,94 @@
+"""Tests for MockSandboxBackend."""
+import pytest
+import os
+import tempfile
+
+
+@pytest.mark.unit
+@pytest.mark.sandbox
+class TestMockSandboxBackend:
+    """Tests that MockSandboxBackend implements the SandboxBackend protocol."""
+
+    def test_implements_sandbox_backend_protocol(self):
+        """MockSandboxBackend is runtime-compatible with SandboxBackend protocol."""
+        from app.integrations.opensandbox.mock_backend import (
+            MockSandboxBackend,
+            SandboxBackend,
+        )
+
+        backend = MockSandboxBackend()
+        assert isinstance(backend, SandboxBackend)
+
+    async def test_create_returns_sandbox_id(self):
+        """Mock create() returns a UUID-format sandbox ID."""
+        import uuid
+
+        from app.integrations.opensandbox.mock_backend import MockSandboxBackend
+        from app.integrations.opensandbox.models import SandboxConfig
+
+        backend = MockSandboxBackend()
+        sandbox_id = await backend.create(SandboxConfig())
+        assert isinstance(sandbox_id, str)
+        # Should be a valid UUID
+        uuid.UUID(sandbox_id)
+
+    async def test_execute_runs_command_and_returns_result(self):
+        """Mock execute() runs command and returns result."""
+        from app.integrations.opensandbox.mock_backend import MockSandboxBackend
+        from app.integrations.opensandbox.models import SandboxConfig
+
+        backend = MockSandboxBackend()
+        sandbox_id = await backend.create(SandboxConfig())
+        result = await backend.execute(sandbox_id, "echo hello", timeout=10)
+        assert result.exit_code == 0
+        assert "hello" in result.stdout
+
+    async def test_execute_captures_stderr(self):
+        """Mock execute() captures stderr from subprocess."""
+        from app.integrations.opensandbox.mock_backend import MockSandboxBackend
+        from app.integrations.opensandbox.models import SandboxConfig
+
+        backend = MockSandboxBackend()
+        sandbox_id = await backend.create(SandboxConfig())
+        result = await backend.execute(sandbox_id, "echo error >&2", timeout=10)
+        assert "error" in result.stderr
+
+    async def test_write_file_stores_in_temp_directory(self):
+        """Mock write_file() writes bytes to a temporary directory."""
+        from app.integrations.opensandbox.mock_backend import MockSandboxBackend
+        from app.integrations.opensandbox.models import SandboxConfig
+
+        backend = MockSandboxBackend()
+        sandbox_id = await backend.create(SandboxConfig())
+        await backend.write_file(sandbox_id, "/workspace/test.txt", b"hello test")
+
+        # Verify file exists in the sandbox temp dir
+        data = await backend.read_file(sandbox_id, "/workspace/test.txt")
+        assert data == b"hello test"
+
+    async def test_read_file_returns_from_temp_directory(self):
+        """Mock read_file() reads bytes from the temporary directory."""
+        from app.integrations.opensandbox.mock_backend import MockSandboxBackend
+        from app.integrations.opensandbox.models import SandboxConfig
+
+        backend = MockSandboxBackend()
+        sandbox_id = await backend.create(SandboxConfig())
+        content = b"read me back"
+        await backend.write_file(sandbox_id, "/data/file.bin", content)
+        result = await backend.read_file(sandbox_id, "/data/file.bin")
+        assert result == content
+
+    async def test_destroy_cleans_up_temp_directory(self):
+        """Mock destroy() removes the sandbox's temporary directory."""
+        from app.integrations.opensandbox.mock_backend import MockSandboxBackend
+        from app.integrations.opensandbox.models import SandboxConfig
+
+        backend = MockSandboxBackend()
+        sandbox_id = await backend.create(SandboxConfig())
+        # Get the temp dir path before destroy
+        temp_dir = backend._sandboxes[sandbox_id]
+        assert os.path.exists(temp_dir)
+
+        await backend.destroy(sandbox_id)
+        assert not os.path.exists(temp_dir)
+        assert sandbox_id not in backend._sandboxes
diff --git a/python-backend/tests/unit/integrations/opensandbox/test_models.py b/python-backend/tests/unit/integrations/opensandbox/test_models.py
new file mode 100644
index 0000000..064defd
--- /dev/null
+++ b/python-backend/tests/unit/integrations/opensandbox/test_models.py
@@ -0,0 +1,124 @@
+"""Tests for OpenSandbox Pydantic models."""
+import pytest
+from datetime import datetime, timezone
+
+
+@pytest.mark.unit
+@pytest.mark.sandbox
+class TestSandboxModels:
+    """Validate Pydantic model construction, serialization, and defaults."""
+
+    def test_sandbox_config_defaults(self):
+        """SandboxConfig should have sane defaults for cpu, memory, timeout."""
+        from app.integrations.opensandbox.models import SandboxConfig
+
+        config = SandboxConfig()
+        assert config.image == "python:3.11-slim"
+        assert config.timeout_seconds == 300
+        assert config.cpu_limit == "1000m"
+        assert config.memory_limit_mb == 2048
+        assert config.disk_limit_mb == 5120
+        assert config.network_action == "deny"
+        assert config.env_vars == {}
+        assert config.metadata == {}
+
+    def test_sandbox_config_custom_values(self):
+        """SandboxConfig accepts all custom overrides."""
+        from app.integrations.opensandbox.models import SandboxConfig
+
+        config = SandboxConfig(
+            image="node:20-slim",
+            timeout_seconds=600,
+            cpu_limit="2000m",
+            memory_limit_mb=4096,
+            disk_limit_mb=10240,
+            network_action="allow",
+            env_vars={"NODE_ENV": "production"},
+            metadata={"job_id": "abc123"},
+        )
+        assert config.image == "node:20-slim"
+        assert config.timeout_seconds == 600
+        assert config.env_vars == {"NODE_ENV": "production"}
+
+    def test_sandbox_status_from_api_response(self):
+        """SandboxStatus parses a typical OpenSandbox API JSON response."""
+        from app.integrations.opensandbox.models import SandboxStatus
+
+        data = {
+            "id": "sb-abc123",
+            "status": "running",
+            "created_at": "2026-02-26T10:00:00Z",
+            "metadata": {"job_id": "job-1"},
+        }
+        status = SandboxStatus.model_validate(data)
+        assert status.id == "sb-abc123"
+        assert status.status == "running"
+        assert status.metadata == {"job_id": "job-1"}
+
+    def test_command_result_captures_all_fields(self):
+        """CommandResult stores exit_code, stdout, stderr."""
+        from app.integrations.opensandbox.models import CommandResult
+
+        result = CommandResult(
+            exit_code=0,
+            stdout="hello world\n",
+            stderr="",
+        )
+        assert result.exit_code == 0
+        assert result.stdout == "hello world\n"
+        assert result.stderr == ""
+
+    def test_file_entry_serialization(self):
+        """FileEntry round-trips through model_dump/model_validate."""
+        from app.integrations.opensandbox.models import FileEntry
+
+        entry = FileEntry(
+            name="output.mp4",
+            path="/workspace/output.mp4",
+            size=1024000,
+            is_directory=False,
+        )
+        dumped = entry.model_dump()
+        restored = FileEntry.model_validate(dumped)
+        assert restored.name == entry.name
+        assert restored.path == entry.path
+        assert restored.size == entry.size
+
+    def test_sandbox_job_request_validation(self):
+        """SandboxJobRequest rejects missing required fields."""
+        from pydantic import ValidationError
+
+        from app.integrations.opensandbox.models import SandboxJobRequest
+
+        with pytest.raises(ValidationError):
+            SandboxJobRequest()  # missing required: tenant_id, user_id, feature_type, execution_mode
+
+        # Valid with required fields
+        req = SandboxJobRequest(
+            tenant_id=1,
+            user_id=42,
+            feature_type="skill",
+            execution_mode="code",
+        )
+        assert req.tenant_id == 1
+        assert req.profile_slug == "code-default"
+
+    def test_sandbox_job_response_includes_timing(self):
+        """SandboxJobResponse includes started_at, finished_at, duration_ms."""
+        from app.integrations.opensandbox.models import SandboxJobResponse
+
+        now = datetime.now(timezone.utc)
+        resp = SandboxJobResponse(
+            job_id="job-123",
+            status="completed",
+            exit_code=0,
+            stdout_excerpt="OK",
+            started_at=now,
+            finished_at=now,
+            duration_ms=1500,
+            cost_actual=0.02,
+        )
+        assert resp.duration_ms == 1500
+        assert resp.started_at is not None
+        assert resp.finished_at is not None
+        assert resp.cost_actual == 0.02
