Now I have all the context needed to write the section. Let me produce the full section content.

# Section 03: Python SDK Client -- OpenSandbox Integration Module

## Overview

This section covers the creation of the Python OpenSandbox integration module at `/home/dev/projects/SmartSpecPro/python-backend/app/integrations/opensandbox/`. This module provides the low-level HTTP client, Pydantic models, configuration, lifecycle management, execution primitives, and filesystem operations needed to interact with the OpenSandbox API. It also defines the `SandboxBackend` protocol and a `MockSandboxBackend` for testing without a running OpenSandbox server.

This module is the Python-side foundation that all higher-level sandbox services (dispatcher, artifacts, audit, cost -- section-04) build upon. It communicates with the OpenSandbox server over HTTP, which may be running locally via Docker (section-01) or on a remote Hetzner server (section-09).

### Dependencies

- **section-01-docker-foundation**: The OpenSandbox Docker server must be running for integration tests, but unit tests use mocks.
- **section-02-database-schema**: The `MockSandboxBackend` references `sandbox_jobs` table rows. That schema must exist before mock backend tests run against a real database. For pure unit tests, mock the DB session.

### What This Section Does NOT Cover

- Celery workers, dispatcher services, or job orchestration (section-04)
- Node.js tRPC router or TypeScript services (section-05)
- Database schema creation or migration (section-02)

---

## Files to Create

All files live under `/home/dev/projects/SmartSpecPro/python-backend/app/integrations/opensandbox/`:

| File | Purpose |
|------|---------|
| `__init__.py` | Package exports |
| `config.py` | Pydantic settings class for OpenSandbox connection |
| `models.py` | Pydantic models for requests/responses |
| `client.py` | Low-level HTTP client with circuit breaker + retry |
| `lifecycle.py` | High-level sandbox create/poll/destroy |
| `execution.py` | Command and code execution |
| `files.py` | File staging (upload/download) between S3/R2 and sandbox |
| `mock_backend.py` | MockSandboxBackend for testing/CI |

Also modify:
- `/home/dev/projects/SmartSpecPro/python-backend/requirements.txt` -- add `pybreaker>=1.0.0`

Test files to create:
- `/home/dev/projects/SmartSpecPro/python-backend/tests/unit/integrations/__init__.py`
- `/home/dev/projects/SmartSpecPro/python-backend/tests/unit/integrations/opensandbox/__init__.py`
- `/home/dev/projects/SmartSpecPro/python-backend/tests/unit/integrations/opensandbox/test_config.py`
- `/home/dev/projects/SmartSpecPro/python-backend/tests/unit/integrations/opensandbox/test_models.py`
- `/home/dev/projects/SmartSpecPro/python-backend/tests/unit/integrations/opensandbox/test_client.py`
- `/home/dev/projects/SmartSpecPro/python-backend/tests/unit/integrations/opensandbox/test_lifecycle.py`
- `/home/dev/projects/SmartSpecPro/python-backend/tests/unit/integrations/opensandbox/test_execution.py`
- `/home/dev/projects/SmartSpecPro/python-backend/tests/unit/integrations/opensandbox/test_files.py`
- `/home/dev/projects/SmartSpecPro/python-backend/tests/unit/integrations/opensandbox/test_mock_backend.py`

---

## Tests (Write First)

All tests use pytest with `asyncio_mode = "auto"` (configured in `pyproject.toml`). Add the `sandbox` marker to `pyproject.toml` markers list:

```python
"sandbox: OpenSandbox integration tests",
```

### test_config.py

Location: `/home/dev/projects/SmartSpecPro/python-backend/tests/unit/integrations/opensandbox/test_config.py`

```python
"""Tests for OpenSandbox configuration."""
import pytest
from unittest.mock import patch


@pytest.mark.unit
@pytest.mark.sandbox
class TestOpenSandboxConfig:
    """Tests for the OpenSandboxSettings Pydantic config class."""

    def test_defaults_load_when_no_env_vars_set(self):
        """Default settings should be valid with OPENSANDBOX_ENABLED=False."""
        # Instantiate OpenSandboxSettings with no env overrides
        # Assert OPENSANDBOX_ENABLED is False
        # Assert OPENSANDBOX_BASE_URL has a sensible default
        ...

    def test_settings_override_from_environment(self):
        """Env vars should override all defaults."""
        # Patch env with OPENSANDBOX_ENABLED=true, OPENSANDBOX_BASE_URL=http://custom:9090, etc.
        # Instantiate and assert each field matches the env var value
        ...

    def test_disabled_flag_prevents_operations(self):
        """When OPENSANDBOX_ENABLED=false, is_enabled property returns False."""
        ...

    def test_invalid_url_raises_validation_error(self):
        """A malformed base URL should raise a Pydantic validation error."""
        # Patch env with OPENSANDBOX_BASE_URL="not-a-url"
        # Assert ValidationError is raised on instantiation
        ...

    def test_timeout_settings_are_integers(self):
        """Timeout fields parse correctly from string env vars to int."""
        ...
```

### test_models.py

Location: `/home/dev/projects/SmartSpecPro/python-backend/tests/unit/integrations/opensandbox/test_models.py`

```python
"""Tests for OpenSandbox Pydantic models."""
import pytest


@pytest.mark.unit
@pytest.mark.sandbox
class TestSandboxModels:
    """Validate Pydantic model construction, serialization, and defaults."""

    def test_sandbox_config_defaults(self):
        """SandboxConfig should have sane defaults for cpu, memory, timeout."""
        ...

    def test_sandbox_config_custom_values(self):
        """SandboxConfig accepts all custom overrides."""
        ...

    def test_sandbox_status_from_api_response(self):
        """SandboxStatus parses a typical OpenSandbox API JSON response."""
        ...

    def test_command_result_captures_all_fields(self):
        """CommandResult stores exit_code, stdout, stderr."""
        ...

    def test_file_entry_serialization(self):
        """FileEntry round-trips through model_dump/model_validate."""
        ...

    def test_sandbox_job_request_validation(self):
        """SandboxJobRequest rejects missing required fields."""
        ...

    def test_sandbox_job_response_includes_timing(self):
        """SandboxJobResponse includes started_at, finished_at, duration_ms."""
        ...
```

### test_client.py

Location: `/home/dev/projects/SmartSpecPro/python-backend/tests/unit/integrations/opensandbox/test_client.py`

This is the most important test file. The client wraps httpx and adds circuit breaker + retry.

```python
"""Tests for OpenSandbox HTTP client."""
import pytest
from unittest.mock import AsyncMock, MagicMock, patch
import httpx


@pytest.mark.unit
@pytest.mark.sandbox
class TestOpenSandboxClient:
    """Tests for the low-level HTTP client wrapper."""

    async def test_create_sandbox_sends_correct_request(self):
        """create_sandbox() POSTs to /api/v1/sandboxes with correct body."""
        # Mock httpx.AsyncClient.post to capture the request
        # Call client.create_sandbox(config)
        # Assert URL, method, headers (API key), body fields
        ...

    async def test_create_sandbox_returns_sandbox_id(self):
        """Successful create returns the sandbox ID string."""
        ...

    async def test_get_sandbox_status_returns_status_model(self):
        """get_sandbox_status() GETs /api/v1/sandboxes/{id} and returns SandboxStatus."""
        ...

    async def test_destroy_sandbox_sends_delete(self):
        """destroy_sandbox() DELETEs /api/v1/sandboxes/{id}."""
        ...

    async def test_run_command_sends_correct_payload(self):
        """run_command() POSTs command string and timeout to execution endpoint."""
        ...

    async def test_write_file_uploads_bytes(self):
        """write_file() POSTs file content to sandbox filesystem endpoint."""
        ...

    async def test_read_file_returns_bytes(self):
        """read_file() GETs file content from sandbox filesystem endpoint."""
        ...

    async def test_list_files_returns_file_entries(self):
        """list_files() returns list of FileEntry models."""
        ...

    async def test_circuit_breaker_opens_after_5_failures(self):
        """After 5 consecutive failures, circuit breaker opens and rejects calls."""
        # Mock httpx to raise ConnectionError 5 times
        # Assert 6th call raises CircuitBreakerError without making HTTP request
        ...

    async def test_circuit_breaker_resets_after_timeout(self):
        """Circuit breaker transitions to half-open after timeout_duration."""
        # Open breaker, advance time past timeout_duration (30s)
        # Assert next call goes through (half-open)
        ...

    async def test_retry_on_429_500_503(self):
        """Client retries on 429, 500, 503 status codes."""
        # Mock httpx to return 503 twice, then 200
        # Assert the call succeeds after retries
        ...

    async def test_no_retry_on_400_403_404(self):
        """Client does NOT retry on 400, 403, 404 (client errors)."""
        # Mock httpx to return 400
        # Assert only 1 call made, raises immediately
        ...

    async def test_connection_pooling_configuration(self):
        """httpx.AsyncClient configured with correct pool limits."""
        # Inspect client._http_client limits
        # Assert max_connections=20, max_keepalive_connections=10
        ...

    async def test_request_timeout_respected(self):
        """Requests that exceed timeout raise TimeoutError."""
        ...

    async def test_api_key_sent_in_header(self):
        """All requests include X-API-Key header."""
        ...
```

### test_lifecycle.py

Location: `/home/dev/projects/SmartSpecPro/python-backend/tests/unit/integrations/opensandbox/test_lifecycle.py`

```python
"""Tests for OpenSandbox lifecycle management."""
import pytest
from unittest.mock import AsyncMock, patch


@pytest.mark.unit
@pytest.mark.sandbox
class TestSandboxLifecycle:
    """Tests for provision, destroy, and idempotent get_or_create."""

    async def test_provision_sandbox_creates_and_polls_until_ready(self):
        """provision_sandbox() calls create, then polls status until 'running'."""
        # Mock client.create_sandbox to return sandbox_id
        # Mock client.get_sandbox_status to return 'creating' then 'running'
        # Assert sandbox_id returned matches
        ...

    async def test_provision_sandbox_fails_after_max_poll_attempts(self):
        """provision_sandbox() raises after exhausting poll attempts."""
        # Mock status to always return 'creating' (never ready)
        # Assert raises TimeoutError or custom SandboxProvisionError
        ...

    async def test_destroy_sandbox_calls_client_destroy(self):
        """destroy_sandbox() delegates to client and handles success."""
        ...

    async def test_destroy_already_destroyed_sandbox_is_graceful(self):
        """destroy_sandbox() handles 404 (already gone) without raising."""
        ...

    async def test_get_or_create_returns_existing_for_same_job_id(self):
        """get_or_create() with same job_id returns the cached sandbox."""
        # Call once -> provisions new sandbox
        # Call again with same job_id -> returns same sandbox_id without creating
        ...

    async def test_get_or_create_creates_new_for_different_job_id(self):
        """get_or_create() with different job_id provisions a new sandbox."""
        ...
```

### test_execution.py

Location: `/home/dev/projects/SmartSpecPro/python-backend/tests/unit/integrations/opensandbox/test_execution.py`

```python
"""Tests for OpenSandbox execution functions."""
import pytest
from unittest.mock import AsyncMock


@pytest.mark.unit
@pytest.mark.sandbox
class TestSandboxExecution:
    """Tests for run_command and run_code."""

    async def test_run_command_returns_exit_code_stdout_stderr(self):
        """run_command() returns a CommandResult with all three fields."""
        ...

    async def test_run_command_respects_timeout(self):
        """run_command() passes timeout to the client call."""
        ...

    async def test_run_code_sends_to_interpreter_endpoint(self):
        """run_code() sends code and language to the code interpreter API."""
        ...

    async def test_command_failure_returns_nonzero_exit_code(self):
        """A failed command returns non-zero exit_code, stderr populated."""
        ...

    async def test_run_command_truncates_large_output(self):
        """stdout/stderr exceeding max length are truncated."""
        ...
```

### test_files.py

Location: `/home/dev/projects/SmartSpecPro/python-backend/tests/unit/integrations/opensandbox/test_files.py`

```python
"""Tests for OpenSandbox file staging and collection."""
import pytest
from unittest.mock import AsyncMock, patch


@pytest.mark.unit
@pytest.mark.sandbox
class TestSandboxFiles:
    """Tests for stage_inputs and collect_outputs."""

    async def test_stage_inputs_uploads_each_file_from_manifest(self):
        """stage_inputs() downloads each S3 object and uploads into sandbox."""
        # Manifest has 3 files; assert client.write_file called 3 times
        ...

    async def test_stage_inputs_handles_missing_s3_object_gracefully(self):
        """If an S3 object is missing, stage_inputs logs warning and continues."""
        ...

    async def test_collect_outputs_downloads_and_uploads_to_s3(self):
        """collect_outputs() reads files from sandbox and uploads to S3/R2."""
        ...

    async def test_collect_outputs_computes_sha256_checksum(self):
        """Each collected output includes SHA-256 checksum."""
        ...

    async def test_cleanup_sandbox_files_calls_client(self):
        """cleanup_sandbox_files() removes staged files from sandbox."""
        ...
```

### test_mock_backend.py

Location: `/home/dev/projects/SmartSpecPro/python-backend/tests/unit/integrations/opensandbox/test_mock_backend.py`

```python
"""Tests for MockSandboxBackend."""
import pytest
from unittest.mock import patch, AsyncMock


@pytest.mark.unit
@pytest.mark.sandbox
class TestMockSandboxBackend:
    """Tests that MockSandboxBackend implements the SandboxBackend protocol."""

    def test_implements_sandbox_backend_protocol(self):
        """MockSandboxBackend is runtime-compatible with SandboxBackend protocol."""
        # Use isinstance check or runtime_checkable Protocol verification
        ...

    async def test_create_returns_sandbox_id(self):
        """Mock create() returns a UUID-format sandbox ID."""
        ...

    async def test_execute_runs_via_subprocess(self):
        """Mock execute() runs command via subprocess.run and returns result."""
        # Patch subprocess.run, call mock_backend.execute()
        # Assert subprocess.run was called with the command
        ...

    async def test_execute_captures_stdout_stderr(self):
        """Mock execute() captures stdout and stderr from subprocess."""
        ...

    async def test_write_file_stores_in_temp_directory(self):
        """Mock write_file() writes bytes to a temporary directory."""
        ...

    async def test_read_file_returns_from_temp_directory(self):
        """Mock read_file() reads bytes from the temporary directory."""
        ...

    async def test_destroy_cleans_up_temp_directory(self):
        """Mock destroy() removes the sandbox's temporary directory."""
        ...
```

### Protocol compliance test

Add a shared test to verify both backends satisfy the protocol.

```python
"""Tests for SandboxBackend protocol compliance."""
import pytest


@pytest.mark.unit
@pytest.mark.sandbox
class TestSandboxBackendProtocol:
    """Verify both real and mock backends implement SandboxBackend."""

    def test_real_client_implements_protocol(self):
        """OpenSandboxClient satisfies SandboxBackend protocol."""
        # Import both, use runtime_checkable isinstance check
        ...

    def test_mock_backend_implements_protocol(self):
        """MockSandboxBackend satisfies SandboxBackend protocol."""
        ...
```

---

## Implementation Details

### 1. New Dependency: pybreaker

Add to `/home/dev/projects/SmartSpecPro/python-backend/requirements.txt` in a new section:

```
# ==========================================
# Section 026: OpenSandbox Integration
# ==========================================

# Circuit breaker for sandbox client resilience
pybreaker>=1.0.0
```

Verify that `tenacity>=8.2.0` and `httpx>=0.24.1` already exist in requirements.txt (they do).

### 2. config.py

Location: `/home/dev/projects/SmartSpecPro/python-backend/app/integrations/opensandbox/config.py`

A Pydantic `BaseSettings` class (using `pydantic_settings`) that loads from environment. Follow the same pattern as `/home/dev/projects/SmartSpecPro/python-backend/app/core/config.py` which uses `SettingsConfigDict`.

Key fields and their defaults:

| Field | Type | Default | Env Var |
|-------|------|---------|---------|
| `OPENSANDBOX_ENABLED` | `bool` | `False` | `OPENSANDBOX_ENABLED` |
| `OPENSANDBOX_BASE_URL` | `str` | `http://localhost:8080` | `OPENSANDBOX_BASE_URL` |
| `OPENSANDBOX_API_KEY` | `str` | `""` | `OPENSANDBOX_API_KEY` |
| `OPENSANDBOX_REQUEST_TIMEOUT_SECONDS` | `int` | `30` | `OPENSANDBOX_REQUEST_TIMEOUT_SECONDS` |
| `OPENSANDBOX_CREATE_TIMEOUT_SECONDS` | `int` | `120` | `OPENSANDBOX_CREATE_TIMEOUT_SECONDS` |
| `OPENSANDBOX_READY_POLL_INTERVAL_MS` | `int` | `2000` | `OPENSANDBOX_READY_POLL_INTERVAL_MS` |
| `SANDBOX_ARTIFACT_BUCKET` | `str` | `smartspec-sandbox-artifacts` | `SANDBOX_ARTIFACT_BUCKET` |
| `SANDBOX_SIGNED_URL_TTL_SECONDS` | `int` | `900` | `SANDBOX_SIGNED_URL_TTL_SECONDS` |
| `SANDBOX_DEFAULT_NETWORK_ACTION` | `str` | `deny` | `SANDBOX_DEFAULT_NETWORK_ACTION` |
| `SANDBOX_MAX_CONCURRENT_GLOBAL` | `int` | `10` | `SANDBOX_MAX_CONCURRENT_GLOBAL` |
| `SANDBOX_MAX_CONCURRENT_PER_TENANT_DEFAULT` | `int` | `3` | `SANDBOX_MAX_CONCURRENT_PER_TENANT_DEFAULT` |

Add an `is_enabled` property that returns `OPENSANDBOX_ENABLED and bool(OPENSANDBOX_BASE_URL)`.

Add a URL validator that rejects obviously malformed URLs (must start with `http://` or `https://`).

Export a singleton `opensandbox_settings = OpenSandboxSettings()` at module level.

### 3. models.py

Location: `/home/dev/projects/SmartSpecPro/python-backend/app/integrations/opensandbox/models.py`

Pydantic V2 models (use `BaseModel` from `pydantic`). All models use `model_dump()` / `model_validate()`.

**`SandboxConfig`** -- Creation parameters sent to OpenSandbox API:

```python
class SandboxConfig(BaseModel):
    """Parameters for creating a new sandbox container."""
    image: str = "python:3.11-slim"
    timeout_seconds: int = 300
    env_vars: dict[str, str] = Field(default_factory=dict)
    cpu_limit: str = "1000m"
    memory_limit_mb: int = 2048
    disk_limit_mb: int = 5120
    network_action: str = "deny"  # "deny" or "allow"
    metadata: dict[str, str] = Field(default_factory=dict)
```

**`SandboxStatus`** -- Parsed response from status endpoint:

```python
class SandboxStatus(BaseModel):
    """Status of an existing sandbox."""
    id: str
    status: str  # creating, running, stopped, error
    created_at: Optional[datetime] = None
    metadata: dict[str, Any] = Field(default_factory=dict)
```

**`CommandResult`** -- Execution result:

```python
class CommandResult(BaseModel):
    """Result of a command or code execution."""
    exit_code: int
    stdout: str = ""
    stderr: str = ""
```

**`FileEntry`** -- Filesystem listing entry:

```python
class FileEntry(BaseModel):
    """A file or directory entry in the sandbox filesystem."""
    name: str
    path: str
    size: int = 0
    is_directory: bool = False
    modified_at: Optional[datetime] = None
```

**`SandboxJobRequest`** -- Internal job request model (used between Python services, not sent to OpenSandbox API):

```python
class SandboxJobRequest(BaseModel):
    """Internal request to create a sandbox job."""
    tenant_id: int
    user_id: int
    feature_type: str  # chat, skill, workflow, library, media, presentation, connector
    feature_ref_id: Optional[str] = None
    execution_mode: str  # code, command, browser, file, media
    profile_slug: str = "code-default"
    input_manifest: list[dict[str, Any]] = Field(default_factory=list)
    command: Optional[str] = None
    code: Optional[str] = None
    language: Optional[str] = None
    timeout_override: Optional[int] = None
    idempotency_key: Optional[str] = None
```

**`SandboxJobResponse`** -- Internal job response model:

```python
class SandboxJobResponse(BaseModel):
    """Response from a completed sandbox job."""
    job_id: str
    status: str
    exit_code: Optional[int] = None
    stdout_excerpt: Optional[str] = None
    stderr_excerpt: Optional[str] = None
    output_manifest: list[dict[str, Any]] = Field(default_factory=list)
    started_at: Optional[datetime] = None
    finished_at: Optional[datetime] = None
    duration_ms: Optional[int] = None
    cost_actual: Optional[float] = None
```

### 4. client.py

Location: `/home/dev/projects/SmartSpecPro/python-backend/app/integrations/opensandbox/client.py`

This is the core HTTP client. It follows patterns from the existing `web_gateway_client.py` but adds circuit breaker and retry, and uses a shared (connection-pooled) httpx client rather than creating a new one per request.

Key design points:

- **Shared `httpx.AsyncClient`**: Created once with `limits=httpx.Limits(max_connections=20, max_keepalive_connections=10)`. Stored as instance attribute.
- **pybreaker circuit breaker**: `pybreaker.CircuitBreaker(fail_max=5, timeout_duration=30)`. Wrap each HTTP call. When open, raises `pybreaker.CircuitBreakerError` immediately.
- **tenacity retry**: Decorator with `stop=stop_after_attempt(3)`, `wait=wait_exponential(multiplier=1, min=1, max=10)`, `retry=retry_if_exception_type(...)`. Retry on `httpx.TransportError`, and on HTTP responses with status 429, 500, 503. Do NOT retry on 400, 403, 404.
- **API key header**: All requests include `X-API-Key: {api_key}` header.
- **Timeout**: Per-request timeout from config, passable as override.

Class signature:

```python
class OpenSandboxClient:
    """Low-level HTTP client for the OpenSandbox API."""

    def __init__(self, config: Optional[OpenSandboxSettings] = None):
        """Initialize with config; create httpx client and circuit breaker."""
        ...

    async def create_sandbox(self, config: SandboxConfig) -> str:
        """POST /api/v1/sandboxes. Returns sandbox_id."""
        ...

    async def get_sandbox_status(self, sandbox_id: str) -> SandboxStatus:
        """GET /api/v1/sandboxes/{sandbox_id}. Returns SandboxStatus."""
        ...

    async def destroy_sandbox(self, sandbox_id: str) -> None:
        """DELETE /api/v1/sandboxes/{sandbox_id}."""
        ...

    async def run_command(self, sandbox_id: str, command: str, timeout: int = 30) -> CommandResult:
        """POST /api/v1/sandboxes/{sandbox_id}/commands. Returns CommandResult."""
        ...

    async def write_file(self, sandbox_id: str, path: str, content: bytes) -> None:
        """POST /api/v1/sandboxes/{sandbox_id}/files. Upload file content."""
        ...

    async def read_file(self, sandbox_id: str, path: str) -> bytes:
        """GET /api/v1/sandboxes/{sandbox_id}/files?path={path}. Download file content."""
        ...

    async def list_files(self, sandbox_id: str, path: str = "/") -> list[FileEntry]:
        """GET /api/v1/sandboxes/{sandbox_id}/files/list?path={path}."""
        ...

    async def execute_code(self, sandbox_id: str, code: str, language: str = "python") -> CommandResult:
        """POST /api/v1/sandboxes/{sandbox_id}/code. Execute via code interpreter."""
        ...

    async def close(self) -> None:
        """Close the httpx client. Call on shutdown."""
        ...
```

The retry logic should be implemented as a private helper method `_request()` that wraps `self._http_client.request()` with the tenacity decorator and circuit breaker check. Each public method calls `_request()` with the appropriate method, URL, and payload.

For the retry-on-status-code logic, raise a custom `RetryableHTTPError` exception inside `_request()` when status is 429/500/503, and configure tenacity to retry on that exception type. For 400/403/404, raise a non-retryable `SandboxAPIError`.

Custom exceptions to define (can be in `client.py` or a separate `exceptions.py`):

```python
class SandboxAPIError(Exception):
    """Non-retryable error from the OpenSandbox API."""
    def __init__(self, status_code: int, message: str): ...

class RetryableHTTPError(Exception):
    """Retryable HTTP error (429, 500, 503)."""
    def __init__(self, status_code: int, message: str): ...

class SandboxProvisionError(Exception):
    """Sandbox failed to reach ready state within timeout."""
    ...
```

### 5. lifecycle.py

Location: `/home/dev/projects/SmartSpecPro/python-backend/app/integrations/opensandbox/lifecycle.py`

High-level sandbox lifecycle management that wraps the low-level client.

```python
class SandboxLifecycleManager:
    """Manages sandbox creation, readiness polling, and destruction."""

    def __init__(self, client: OpenSandboxClient, config: Optional[OpenSandboxSettings] = None):
        ...

    async def provision_sandbox(self, sandbox_config: SandboxConfig, job_id: str) -> str:
        """Create sandbox and poll until status is 'running'.
        
        Polls every OPENSANDBOX_READY_POLL_INTERVAL_MS. 
        Times out after OPENSANDBOX_CREATE_TIMEOUT_SECONDS.
        Returns sandbox_id.
        Raises SandboxProvisionError on timeout.
        """
        ...

    async def destroy_sandbox(self, sandbox_id: str) -> None:
        """Destroy sandbox gracefully. Handles 404 (already destroyed) without raising."""
        ...

    async def get_or_create(self, sandbox_config: SandboxConfig, job_id: str) -> str:
        """Idempotent sandbox provisioning.
        
        Maintains an in-memory dict mapping job_id -> sandbox_id.
        If job_id already has a sandbox, returns it.
        Otherwise provisions a new one.
        """
        ...
```

The `get_or_create` method maintains a simple `dict[str, str]` mapping `job_id -> sandbox_id`. This is instance-scoped (per-worker), not shared across Celery workers. For cross-worker idempotency, the `sandbox_jobs.idempotencyKey` database column is used (handled in section-04).

### 6. execution.py

Location: `/home/dev/projects/SmartSpecPro/python-backend/app/integrations/opensandbox/execution.py`

Thin wrappers around client methods with logging and output truncation.

```python
MAX_OUTPUT_LENGTH = 50_000  # 50 KB max for stdout/stderr storage

async def run_command(client: OpenSandboxClient, sandbox_id: str, command: str, timeout: int = 30) -> CommandResult:
    """Execute a shell command in the sandbox. Truncates output if needed."""
    ...

async def run_code(client: OpenSandboxClient, sandbox_id: str, code: str, language: str = "python") -> CommandResult:
    """Execute code via the sandbox code interpreter."""
    ...
```

These are module-level functions (not a class) because they are stateless. They take the client as a parameter, making them easy to test with a mock client.

### 7. files.py

Location: `/home/dev/projects/SmartSpecPro/python-backend/app/integrations/opensandbox/files.py`

File staging between S3/R2 and sandbox.

```python
import hashlib

async def stage_inputs(
    client: OpenSandboxClient,
    sandbox_id: str,
    manifest: list[dict],
    storage_service: Any,  # R2StorageService or compatible
) -> list[dict]:
    """Download files from S3/R2 and upload into sandbox.
    
    manifest entries: [{"object_key": "...", "sandbox_path": "/workspace/input.mp4", "mime_type": "..."}]
    Returns list of successfully staged entries.
    Logs warning and skips missing objects.
    """
    ...

async def collect_outputs(
    client: OpenSandboxClient,
    sandbox_id: str,
    output_paths: list[str],
    storage_service: Any,
    artifact_bucket: str,
    job_id: str,
) -> list[dict]:
    """Download output files from sandbox and upload to S3/R2.
    
    Returns list of dicts: [{"sandbox_path": "...", "object_key": "...", "size_bytes": N, "sha256": "..."}]
    Computes SHA-256 checksum for each file.
    """
    ...

async def cleanup_sandbox_files(client: OpenSandboxClient, sandbox_id: str, paths: list[str]) -> None:
    """Remove specific files from sandbox."""
    ...
```

The `collect_outputs` function must compute SHA-256 checksums. Use `hashlib.sha256(content).hexdigest()` on the bytes content read from the sandbox.

### 8. mock_backend.py

Location: `/home/dev/projects/SmartSpecPro/python-backend/app/integrations/opensandbox/mock_backend.py`

A `MockSandboxBackend` that implements the `SandboxBackend` protocol using subprocess for local/CI execution.

```python
import subprocess
import tempfile
import uuid
from typing import Protocol, runtime_checkable

@runtime_checkable
class SandboxBackend(Protocol):
    """Protocol defining the sandbox execution interface."""
    async def create(self, config: SandboxConfig) -> str: ...
    async def execute(self, sandbox_id: str, command: str, timeout: int) -> CommandResult: ...
    async def write_file(self, sandbox_id: str, path: str, content: bytes) -> None: ...
    async def read_file(self, sandbox_id: str, path: str) -> bytes: ...
    async def destroy(self, sandbox_id: str) -> None: ...


class MockSandboxBackend:
    """Mock sandbox backend using subprocess for local/CI testing.
    
    Uses temporary directories to simulate sandbox filesystems.
    Executes commands via subprocess.run() (NOT isolated).
    Records would-be sandbox_jobs rows (caller handles actual DB writes).
    """

    def __init__(self):
        self._sandboxes: dict[str, str] = {}  # sandbox_id -> temp_dir path

    async def create(self, config: SandboxConfig) -> str:
        """Create a temp directory as a fake sandbox. Return UUID."""
        ...

    async def execute(self, sandbox_id: str, command: str, timeout: int) -> CommandResult:
        """Run command via subprocess.run in the sandbox temp directory."""
        ...

    async def write_file(self, sandbox_id: str, path: str, content: bytes) -> None:
        """Write file to the sandbox temp directory."""
        ...

    async def read_file(self, sandbox_id: str, path: str) -> bytes:
        """Read file from the sandbox temp directory."""
        ...

    async def destroy(self, sandbox_id: str) -> None:
        """Remove the sandbox temp directory."""
        ...
```

The `SandboxBackend` protocol should be defined here (or in models.py) with `@runtime_checkable` so tests can use `isinstance()` checks.

The `OpenSandboxClient` from `client.py` also satisfies this protocol since it has the same method signatures. However, the client has slightly different method names (`create_sandbox` vs `create`). To resolve this, create a thin `OpenSandboxBackendAdapter` class in `client.py` or in `__init__.py` that adapts the client to the protocol interface.

### 9. __init__.py

Location: `/home/dev/projects/SmartSpecPro/python-backend/app/integrations/opensandbox/__init__.py`

Export the key public API:

```python
"""OpenSandbox integration module for SmartSpecPro."""
from .config import OpenSandboxSettings, opensandbox_settings
from .models import (
    SandboxConfig,
    SandboxStatus,
    CommandResult,
    FileEntry,
    SandboxJobRequest,
    SandboxJobResponse,
)
from .client import OpenSandboxClient, SandboxAPIError, RetryableHTTPError, SandboxProvisionError
from .lifecycle import SandboxLifecycleManager
from .mock_backend import SandboxBackend, MockSandboxBackend

__all__ = [
    "OpenSandboxSettings",
    "opensandbox_settings",
    "SandboxConfig",
    "SandboxStatus",
    "CommandResult",
    "FileEntry",
    "SandboxJobRequest",
    "SandboxJobResponse",
    "OpenSandboxClient",
    "SandboxAPIError",
    "RetryableHTTPError",
    "SandboxProvisionError",
    "SandboxLifecycleManager",
    "SandboxBackend",
    "MockSandboxBackend",
]
```

Also create the parent package `__init__.py` if it does not exist:
- `/home/dev/projects/SmartSpecPro/python-backend/app/integrations/__init__.py` (empty)

---

## Backend Selection Logic

The decision of whether to use `OpenSandboxClient` (real) or `MockSandboxBackend` is made at the service layer (section-04), not in this module. This module only provides the building blocks. However, a convenience factory function can be added to `__init__.py`:

```python
def get_sandbox_backend() -> SandboxBackend:
    """Return the appropriate sandbox backend based on configuration.
    
    If OPENSANDBOX_ENABLED is True and OPENSANDBOX_BASE_URL is set, returns
    an adapter around OpenSandboxClient. Otherwise returns MockSandboxBackend.
    """
    if opensandbox_settings.is_enabled:
        client = OpenSandboxClient(opensandbox_settings)
        return OpenSandboxBackendAdapter(client)
    return MockSandboxBackend()
```

---

## TODO Checklist

1. Add `pybreaker>=1.0.0` to `/home/dev/projects/SmartSpecPro/python-backend/requirements.txt`
2. Add `"sandbox: OpenSandbox integration tests"` marker to `pyproject.toml`
3. Create `/home/dev/projects/SmartSpecPro/python-backend/app/integrations/__init__.py`
4. Create `/home/dev/projects/SmartSpecPro/python-backend/app/integrations/opensandbox/__init__.py`
5. Create all test files under `/home/dev/projects/SmartSpecPro/python-backend/tests/unit/integrations/opensandbox/` (with `__init__.py` files)
6. Implement `config.py` (Pydantic settings)
7. Implement `models.py` (Pydantic models)
8. Implement `client.py` (HTTP client with circuit breaker + retry)
9. Implement `lifecycle.py` (provision/destroy/get_or_create)
10. Implement `execution.py` (run_command, run_code)
11. Implement `files.py` (stage_inputs, collect_outputs, cleanup)
12. Implement `mock_backend.py` (SandboxBackend protocol + MockSandboxBackend)
13. Run tests: `cd /home/dev/projects/SmartSpecPro/python-backend && pytest tests/unit/integrations/opensandbox/ -m sandbox -v`
14. Verify all tests pass and coverage is adequate

---

## Implementation Notes (Actual)

### Deviations from Plan

1. **pybreaker API**: Used `reset_timeout=30` instead of `timeout_duration=30` (pybreaker v1.4.1 API change)
2. **Added `OpenSandboxBackendAdapter`** in `client.py` — adapts OpenSandboxClient method names to SandboxBackend protocol
3. **`get_sandbox_backend()`** returns `OpenSandboxBackendAdapter(client)` not raw client (fixes protocol compliance)
4. **`_do_request` made async** — `async def _do_request()` with `await self._http_client.request(...)` for correct pybreaker integration
5. **Added catch-all for HTTP status >= 400** — handles 401, 405, 409 etc. that were falling through silently
6. **Shell injection fix** in `cleanup_sandbox_files` — replaced f-string quoting with `shlex.quote()`
7. **Path traversal protection** in `MockSandboxBackend` — added `os.path.realpath()` validation in write_file/read_file
8. **Monotonic timing** in `lifecycle.py` — replaced float accumulation with `asyncio.get_event_loop().time()` for accurate timeout
9. **Filename collision prevention** in `collect_outputs` — object keys now include `{idx:03d}-` prefix

### Test Results

- **52 tests** (48 original + 4 added via code review: path traversal x2, protocol compliance x2)
- All passing in 8.5s
- Covers: config, models, client (12 tests incl. circuit breaker + retry), lifecycle, execution, files, mock_backend, protocol compliance

### Files Created

| File | Lines |
|------|-------|
| `app/integrations/__init__.py` | 1 |
| `app/integrations/opensandbox/__init__.py` | 50 |
| `app/integrations/opensandbox/config.py` | 44 |
| `app/integrations/opensandbox/models.py` | 80 |
| `app/integrations/opensandbox/client.py` | 230 |
| `app/integrations/opensandbox/lifecycle.py` | 110 |
| `app/integrations/opensandbox/execution.py` | 55 |
| `app/integrations/opensandbox/files.py` | 120 |
| `app/integrations/opensandbox/mock_backend.py` | 115 |
| `tests/unit/integrations/opensandbox/` (7 test files) | ~650 |

### Modified Files

| File | Change |
|------|--------|
| `requirements.txt` | Added `pybreaker>=1.0.0` |