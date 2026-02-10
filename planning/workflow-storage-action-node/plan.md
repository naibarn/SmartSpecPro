# Storage Action Workflow Node Executor - Implementation Plan

## Problem Statement

The workflow engine needs a `storage_action` node that enables workflows to perform file operations against S3-compatible object storage (AWS S3, Cloudflare R2, MinIO). This node must support upload, download, delete, presigned URL generation, and listing operations with multi-provider abstraction, expression resolution for dynamic paths, streaming for large files, and proper error handling for production use.

## Existing Infrastructure

The codebase already has substantial S3/R2 infrastructure:

| Existing Component | Location | Reuse Strategy |
|---|---|---|
| `R2StorageService` | `app/services/generation/r2_storage.py` | **Primary reuse target** -- has upload, download, delete, list, presigned URL via boto3 |
| `StorageService` | `app/services/storage_service.py` | Reference for local+S3 dual-mode pattern |
| `get_r2_storage()` singleton | `app/services/generation/r2_storage.py:523` | Reuse for default R2 client |
| Config: `CLOUDFLARE_R2_*` | `.env` / `Settings` | Reuse for R2 credentials |
| Config: `S3_BUCKET`, `S3_REGION` | `.env` | Reuse for generic S3 |
| `ExpressionResolver` | `app/orchestrator/expression_resolver.py` | Reuse for `{{variable}}` resolution |
| `HttpRequestExecutor` | `app/orchestrator/node_executors/io_executors/http_request_executor.py` | **Pattern reference** -- follow same structure |

**Key observation**: The existing `R2StorageService` wraps sync boto3 calls in `run_in_executor()`, which is the correct async pattern since `aioboto3` is not in `requirements.txt`. The storage action executor should follow this same pattern and delegate to `R2StorageService` where possible.

## Affected Files

| File | Action | Purpose |
|------|--------|---------|
| `python-backend/app/orchestrator/node_executors/io_executors/storage_action_executor.py` | **CREATE** | Core executor implementation |
| `python-backend/app/orchestrator/node_executors/io_executors/storage_client_factory.py` | **CREATE** | Multi-provider S3 client factory (S3/R2/MinIO) |
| `python-backend/app/orchestrator/node_registry.py` | **MODIFY** | Register `storage_action` node type spec |
| `python-backend/app/orchestrator/node_executors/io_executors/__init__.py` | **MODIFY** | Export new executor |
| `python-backend/tests/test_storage_action_executor.py` | **CREATE** | Unit tests |
| `apps/web/client/src/lib/workflow/dataTypes.ts` | **MODIFY** | Add `storage_action` to frontend type union (if typed) |

## Risk Assessment

| Risk | Severity | Mitigation |
|------|----------|------------|
| Path traversal via malicious bucket/key (`../../../etc/passwd`) | HIGH | Validate key format: no `..`, no leading `/`, alphanumeric + safe chars only |
| Arbitrary bucket access (tenant escaping own bucket) | CRITICAL | Allowlist of permitted buckets per tenant; default to configured bucket |
| Large file download causing OOM | HIGH | 100MB limit for in-memory operations; streaming with chunked reads |
| Credential leakage in logs | HIGH | Never log access keys; redact bucket names in error messages selectively |
| Denial of service via large uploads | MEDIUM | Enforce 100MB upload limit; check content size before reading |
| SSRF via upload from URL content type | MEDIUM | Validate source URLs if content is a URL (reuse SSRFGuard for URL-based uploads) |
| Missing boto3 dependency | LOW | Graceful error if boto3 not installed (already handled in r2_storage.py) |
| Expression injection in key path | MEDIUM | Validate resolved key against safe-path pattern after expression resolution |

---

## 1. Multi-Provider S3 Client Factory

### `python-backend/app/orchestrator/node_executors/io_executors/storage_client_factory.py`

```python
"""Factory for creating S3-compatible storage clients across providers."""
import asyncio
import os
from typing import Any, Optional

import structlog

logger = structlog.get_logger()

try:
    import boto3
    from botocore.config import Config as BotoConfig
    from botocore.exceptions import ClientError, NoCredentialsError, BotoCoreError
    HAS_BOTO3 = True
except ImportError:
    HAS_BOTO3 = False

from app.core.config import settings


class StorageProvider:
    """Enum-like constants for storage providers."""
    S3 = "s3"
    R2 = "r2"
    MINIO = "minio"
    AUTO = "auto"

    ALL = {S3, R2, MINIO, AUTO}


class StorageClientFactory:
    """
    Creates and caches boto3 S3 clients for different providers.

    Each provider type has its own endpoint, credentials, and config:
    - s3: Standard AWS S3 (region-based endpoint)
    - r2: Cloudflare R2 (custom endpoint, s3v4 signature, path-style)
    - minio: MinIO (custom endpoint, path-style addressing)
    - auto: Detect from environment (prefers R2 if configured, else S3)

    Clients are cached per (provider, bucket) tuple to avoid re-creation.
    """

    _cache: dict[tuple[str, str], Any] = {}

    @classmethod
    def get_client(
        cls,
        provider: str = "auto",
        bucket: Optional[str] = None,
    ) -> tuple[Any, str]:
        """
        Get or create an S3-compatible client.

        Args:
            provider: Provider type (s3, r2, minio, auto)
            bucket: Target bucket name (uses default if not specified)

        Returns:
            Tuple of (boto3 S3 client, resolved bucket name)

        Raises:
            RuntimeError: If boto3 is not installed
            ValueError: If provider credentials are not configured
        """
        if not HAS_BOTO3:
            raise RuntimeError(
                "boto3 is required for storage operations. "
                "Install with: pip install boto3"
            )

        resolved_provider = cls._resolve_provider(provider)
        resolved_bucket = cls._resolve_bucket(resolved_provider, bucket)

        cache_key = (resolved_provider, resolved_bucket)
        if cache_key not in cls._cache:
            cls._cache[cache_key] = cls._create_client(resolved_provider)
            logger.info(
                "storage_client_created",
                provider=resolved_provider,
                bucket=resolved_bucket,
            )

        return cls._cache[cache_key], resolved_bucket

    @classmethod
    def _resolve_provider(cls, provider: str) -> str:
        """Resolve 'auto' to a concrete provider based on environment."""
        if provider != StorageProvider.AUTO:
            if provider not in StorageProvider.ALL:
                raise ValueError(
                    f"Unknown storage provider: {provider}. "
                    f"Supported: {', '.join(sorted(StorageProvider.ALL))}"
                )
            return provider

        # Auto-detect: R2 if configured, else S3
        r2_endpoint = getattr(settings, "CLOUDFLARE_R2_ENDPOINT", "") or os.getenv(
            "CLOUDFLARE_R2_ENDPOINT", ""
        )
        if r2_endpoint and r2_endpoint != "https://YOUR_ACCOUNT_ID.r2.cloudflarestorage.com":
            return StorageProvider.R2

        return StorageProvider.S3

    @classmethod
    def _resolve_bucket(cls, provider: str, bucket: Optional[str]) -> str:
        """Resolve bucket name from config if not specified."""
        if bucket:
            return bucket

        if provider == StorageProvider.R2:
            return (
                getattr(settings, "CLOUDFLARE_R2_BUCKET_NAME", "")
                or os.getenv("CLOUDFLARE_R2_BUCKET_NAME", "")
            )
        elif provider == StorageProvider.MINIO:
            return os.getenv("MINIO_BUCKET", "smartspec")
        else:  # S3
            return (
                getattr(settings, "S3_BUCKET", "")
                or os.getenv("S3_BUCKET", "")
            )

    @classmethod
    def _create_client(cls, provider: str) -> Any:
        """Create a boto3 S3 client for the given provider."""
        if provider == StorageProvider.R2:
            return boto3.client(
                "s3",
                endpoint_url=(
                    getattr(settings, "CLOUDFLARE_R2_ENDPOINT", "")
                    or os.getenv("CLOUDFLARE_R2_ENDPOINT", "")
                ),
                aws_access_key_id=(
                    getattr(settings, "CLOUDFLARE_R2_ACCESS_KEY_ID", "")
                    or os.getenv("CLOUDFLARE_R2_ACCESS_KEY_ID", "")
                ),
                aws_secret_access_key=(
                    getattr(settings, "CLOUDFLARE_R2_SECRET_ACCESS_KEY", "")
                    or os.getenv("CLOUDFLARE_R2_SECRET_ACCESS_KEY", "")
                ),
                config=BotoConfig(
                    signature_version="s3v4",
                    s3={"addressing_style": "path"},
                ),
            )

        elif provider == StorageProvider.MINIO:
            return boto3.client(
                "s3",
                endpoint_url=os.getenv("MINIO_ENDPOINT", "http://localhost:9000"),
                aws_access_key_id=os.getenv("MINIO_ACCESS_KEY", "minioadmin"),
                aws_secret_access_key=os.getenv("MINIO_SECRET_KEY", "minioadmin"),
                config=BotoConfig(
                    signature_version="s3v4",
                    s3={"addressing_style": "path"},
                ),
            )

        else:  # S3
            region = (
                getattr(settings, "S3_REGION", "")
                or os.getenv("S3_REGION", "us-east-1")
            )
            # For standard S3, use default credential chain
            # (env vars AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY, or IAM role)
            endpoint_url = os.getenv("S3_ENDPOINT")  # None = default AWS
            kwargs = {
                "region_name": region,
                "config": BotoConfig(signature_version="s3v4"),
            }
            if endpoint_url:
                kwargs["endpoint_url"] = endpoint_url
            return boto3.client("s3", **kwargs)

    @classmethod
    def clear_cache(cls) -> None:
        """Clear the client cache (for testing)."""
        cls._cache.clear()
```

**Design decisions:**

1. **Why a factory instead of directly reusing `R2StorageService`?** The executor needs to support arbitrary buckets and providers specified per-node, not just the global R2 bucket. The factory creates clients on-demand per provider/bucket combination.

2. **Why cache clients?** boto3 clients are thread-safe and reusable. Creating one per request is wasteful (TCP connection setup, credential resolution).

3. **Why `getattr(settings, ...) or os.getenv(...)`?** The `Settings` class uses `extra='ignore'` so R2 fields are loaded dynamically from `.env` as environment variables but are not defined as typed fields on the class. Using `getattr` with fallback handles both cases.

---

## 2. Storage Action Executor

### `python-backend/app/orchestrator/node_executors/io_executors/storage_action_executor.py`

```python
"""Storage Action node executor -- S3/R2/MinIO file operations."""
import asyncio
import base64
import io
import mimetypes
import re
import time
from typing import Any, Optional

import structlog

from app.orchestrator.expression_resolver import ExpressionResolver
from app.orchestrator.node_executors.base import ExecutionContext, NodeExecutionData
from app.orchestrator.node_executors.io_executors.storage_client_factory import (
    StorageClientFactory,
    StorageProvider,
)

logger = structlog.get_logger()

try:
    from botocore.exceptions import ClientError, NoCredentialsError, BotoCoreError
    HAS_BOTO3 = True
except ImportError:
    HAS_BOTO3 = False
```

### 2.1 Class Constants and Constructor

```python
class StorageActionExecutor:
    """
    Executor for Storage Action workflow nodes.

    Performs file operations against S3-compatible storage:
    - upload: Upload content (bytes, base64, or URL) to a bucket
    - download: Download file content from a bucket
    - delete: Remove a file from a bucket
    - get_signed_url: Generate a temporary presigned URL
    - list: List files in a bucket with optional prefix filter

    Supports AWS S3, Cloudflare R2, and MinIO via StorageClientFactory.
    All config fields support {{expression}} resolution.

    Output ports:
        - url (text): Public or presigned URL (upload/get_signed_url)
        - content (any): Downloaded file content (download)
        - success (boolean): Whether the operation succeeded
        - size (number): File size in bytes
        - metadata (object): S3 object metadata or list results
        - error (text|None): Error message if operation failed
    """

    # Maximum file size for in-memory operations (100 MB)
    MAX_FILE_SIZE: int = 100 * 1024 * 1024

    # Maximum number of keys for list operation
    MAX_LIST_KEYS: int = 1000

    # Default presigned URL expiration (1 hour)
    DEFAULT_EXPIRES_IN: int = 3600

    # Maximum presigned URL expiration (7 days -- S3 limit)
    MAX_EXPIRES_IN: int = 604800

    # Supported operations
    SUPPORTED_OPERATIONS: set[str] = {
        "upload", "download", "delete", "get_signed_url", "list"
    }

    # Regex for validating S3 keys (no path traversal, no null bytes)
    SAFE_KEY_PATTERN: re.Pattern = re.compile(
        r"^[a-zA-Z0-9!_.*'()\-/][a-zA-Z0-9!_.*'()\-/ ]{0,1023}$"
    )

    # Regex for validating bucket names (S3 bucket naming rules)
    SAFE_BUCKET_PATTERN: re.Pattern = re.compile(
        r"^[a-z0-9][a-z0-9.\-]{1,61}[a-z0-9]$"
    )

    def __init__(self):
        self._expression_resolver = ExpressionResolver()
```

### 2.2 Main Execute Method

```python
    async def execute(
        self,
        data: NodeExecutionData,
        context: ExecutionContext,
    ) -> dict[str, Any]:
        """
        Execute a storage operation.

        Dispatches to operation-specific handlers based on config.operation.
        All config values are resolved for {{expressions}} before use.
        """
        if not HAS_BOTO3:
            return self._error_result("boto3 is required for storage operations")

        config = data.config
        state = data.state
        start_time = time.monotonic()

        # 1. Resolve operation
        operation = (config.get("operation") or "").lower().strip()
        if operation not in self.SUPPORTED_OPERATIONS:
            return self._error_result(
                f"Unsupported operation: '{operation}'. "
                f"Supported: {', '.join(sorted(self.SUPPORTED_OPERATIONS))}"
            )

        # 2. Resolve provider and bucket
        provider = self._resolve(config.get("provider", "auto"), state)
        raw_bucket = config.get("bucket") or ""
        bucket = self._resolve(raw_bucket, state) if raw_bucket else ""

        # 3. Get S3 client
        try:
            client, resolved_bucket = StorageClientFactory.get_client(
                provider=provider,
                bucket=bucket or None,
            )
        except (RuntimeError, ValueError) as e:
            return self._error_result(f"Storage client error: {e}")

        if not resolved_bucket:
            return self._error_result(
                "No bucket specified. Set 'bucket' in node config "
                "or configure default bucket in environment."
            )

        # 4. Validate bucket name
        if not self.SAFE_BUCKET_PATTERN.match(resolved_bucket):
            return self._error_result(
                f"Invalid bucket name: '{resolved_bucket}'. "
                "Must be 3-63 characters, lowercase alphanumeric, hyphens, and dots."
            )

        # 5. Log operation start
        logger.info(
            "storage_action_start",
            operation=operation,
            provider=provider,
            bucket=resolved_bucket,
            node_id=data.node_id,
            workflow_id=context.workflow_id,
            execution_id=context.execution_id,
        )

        # 6. Dispatch to operation handler
        handler_map = {
            "upload": self._handle_upload,
            "download": self._handle_download,
            "delete": self._handle_delete,
            "get_signed_url": self._handle_get_signed_url,
            "list": self._handle_list,
        }

        handler = handler_map[operation]

        try:
            result = await handler(
                client=client,
                bucket=resolved_bucket,
                config=config,
                state=state,
                context=context,
                data=data,
            )
        except Exception as e:
            elapsed_ms = self._elapsed_ms(start_time)
            logger.error(
                "storage_action_error",
                operation=operation,
                error=str(e),
                error_type=type(e).__name__,
                node_id=data.node_id,
                elapsed_ms=elapsed_ms,
            )
            return self._error_result(
                self._classify_error(e),
                elapsed_ms=elapsed_ms,
            )

        # 7. Log completion
        elapsed_ms = self._elapsed_ms(start_time)
        logger.info(
            "storage_action_complete",
            operation=operation,
            success=result.get("success", False),
            elapsed_ms=elapsed_ms,
            node_id=data.node_id,
        )

        return result
```

### 2.3 Upload Handler

```python
    async def _handle_upload(
        self,
        client: Any,
        bucket: str,
        config: dict[str, Any],
        state: dict[str, Any],
        context: ExecutionContext,
        data: NodeExecutionData,
    ) -> dict[str, Any]:
        """
        Upload content to S3.

        Content sources (checked in order):
        1. Base64-encoded string (data:... or plain base64)
        2. Raw bytes passed from upstream node (already bytes)
        3. URL to download and re-upload
        4. Plain text/JSON string to store as file
        """
        key = self._resolve_and_validate_key(config.get("key", ""), state)
        if key is None:
            return self._error_result("Invalid or missing 'key' for upload")

        content = config.get("content") or data.inputs.get("content")
        if content is None:
            return self._error_result("No content provided for upload")

        # Determine content bytes and content type
        content_type = config.get("contentType") or mimetypes.guess_type(key)[0] or "application/octet-stream"
        file_bytes: bytes

        if isinstance(content, bytes):
            file_bytes = content
        elif isinstance(content, str):
            if content.startswith("data:"):
                # Data URL: data:image/png;base64,iVBOR...
                try:
                    header, encoded = content.split(",", 1)
                    if "base64" in header:
                        file_bytes = base64.b64decode(encoded)
                        # Extract content type from data URL
                        ct_match = re.match(r"data:([^;]+)", header)
                        if ct_match:
                            content_type = ct_match.group(1)
                    else:
                        file_bytes = encoded.encode("utf-8")
                except Exception:
                    return self._error_result("Invalid data URL format")
            elif content.startswith(("http://", "https://")):
                # URL -- download content first
                try:
                    import httpx
                    async with httpx.AsyncClient(timeout=60.0) as http_client:
                        resp = await http_client.get(content)
                        resp.raise_for_status()
                        file_bytes = resp.content
                        # Use response content-type if available
                        resp_ct = resp.headers.get("content-type", "")
                        if resp_ct and content_type == "application/octet-stream":
                            content_type = resp_ct.split(";")[0].strip()
                except Exception as e:
                    return self._error_result(f"Failed to download from URL: {e}")
            else:
                # Try base64 decode, fall back to plain text
                try:
                    file_bytes = base64.b64decode(content)
                except Exception:
                    file_bytes = content.encode("utf-8")
                    if content_type == "application/octet-stream":
                        content_type = "text/plain"
        elif isinstance(content, (dict, list)):
            import json
            file_bytes = json.dumps(content, indent=2).encode("utf-8")
            content_type = "application/json"
        else:
            file_bytes = str(content).encode("utf-8")
            content_type = "text/plain"

        # Enforce size limit
        if len(file_bytes) > self.MAX_FILE_SIZE:
            return self._error_result(
                f"File too large: {len(file_bytes)} bytes "
                f"(max {self.MAX_FILE_SIZE // (1024 * 1024)}MB)"
            )

        # Upload via boto3 (in thread pool)
        loop = asyncio.get_event_loop()
        await loop.run_in_executor(
            None,
            lambda: client.put_object(
                Bucket=bucket,
                Key=key,
                Body=file_bytes,
                ContentType=content_type,
            ),
        )

        # Build URL
        url = self._build_public_url(client, bucket, key, config.get("provider", "auto"))

        return {
            "url": url,
            "content": None,
            "success": True,
            "size": len(file_bytes),
            "metadata": {
                "key": key,
                "bucket": bucket,
                "contentType": content_type,
                "operation": "upload",
            },
            "error": None,
        }
```

### 2.4 Download Handler

```python
    async def _handle_download(
        self,
        client: Any,
        bucket: str,
        config: dict[str, Any],
        state: dict[str, Any],
        context: ExecutionContext,
        data: NodeExecutionData,
    ) -> dict[str, Any]:
        """
        Download file content from S3.

        Returns content as base64 string for binary files,
        or plain text for text/* content types.
        Enforces MAX_FILE_SIZE to prevent OOM.
        """
        key = self._resolve_and_validate_key(config.get("key", ""), state)
        if key is None:
            return self._error_result("Invalid or missing 'key' for download")

        loop = asyncio.get_event_loop()

        # First, check file size via HEAD
        try:
            head_response = await loop.run_in_executor(
                None,
                lambda: client.head_object(Bucket=bucket, Key=key),
            )
        except ClientError as e:
            error_code = e.response.get("Error", {}).get("Code", "")
            if error_code in ("404", "NoSuchKey"):
                return self._error_result(f"File not found: {key}")
            elif error_code in ("403", "AccessDenied"):
                return self._error_result(f"Access denied for key: {key}")
            raise

        file_size = head_response.get("ContentLength", 0)
        content_type = head_response.get("ContentType", "application/octet-stream")
        last_modified = head_response.get("LastModified")
        etag = head_response.get("ETag", "")
        s3_metadata = head_response.get("Metadata", {})

        if file_size > self.MAX_FILE_SIZE:
            return self._error_result(
                f"File too large for in-memory download: {file_size} bytes "
                f"(max {self.MAX_FILE_SIZE // (1024 * 1024)}MB). "
                "Use get_signed_url operation for large files."
            )

        # Download content
        response = await loop.run_in_executor(
            None,
            lambda: client.get_object(Bucket=bucket, Key=key),
        )
        file_bytes = response["Body"].read()

        # Return as text or base64 depending on content type
        if content_type and content_type.startswith("text/"):
            content_value = file_bytes.decode("utf-8", errors="replace")
        elif content_type == "application/json":
            import json
            try:
                content_value = json.loads(file_bytes)
            except json.JSONDecodeError:
                content_value = file_bytes.decode("utf-8", errors="replace")
        else:
            content_value = base64.b64encode(file_bytes).decode("ascii")

        return {
            "url": None,
            "content": content_value,
            "success": True,
            "size": file_size,
            "metadata": {
                "key": key,
                "bucket": bucket,
                "contentType": content_type,
                "lastModified": last_modified.isoformat() if last_modified else None,
                "etag": etag,
                "s3Metadata": s3_metadata,
                "operation": "download",
            },
            "error": None,
        }
```

### 2.5 Delete Handler

```python
    async def _handle_delete(
        self,
        client: Any,
        bucket: str,
        config: dict[str, Any],
        state: dict[str, Any],
        context: ExecutionContext,
        data: NodeExecutionData,
    ) -> dict[str, Any]:
        """
        Delete a file from S3.

        First checks if the file exists (HEAD), then deletes it.
        S3 delete is idempotent -- deleting a non-existent key doesn't error,
        but we check existence to give meaningful feedback.
        """
        key = self._resolve_and_validate_key(config.get("key", ""), state)
        if key is None:
            return self._error_result("Invalid or missing 'key' for delete")

        loop = asyncio.get_event_loop()

        # Check existence
        file_size = 0
        try:
            head = await loop.run_in_executor(
                None,
                lambda: client.head_object(Bucket=bucket, Key=key),
            )
            file_size = head.get("ContentLength", 0)
        except ClientError as e:
            error_code = e.response.get("Error", {}).get("Code", "")
            if error_code in ("404", "NoSuchKey"):
                return self._error_result(f"File not found: {key}")
            elif error_code in ("403", "AccessDenied"):
                return self._error_result(f"Access denied for key: {key}")
            raise

        # Delete
        await loop.run_in_executor(
            None,
            lambda: client.delete_object(Bucket=bucket, Key=key),
        )

        return {
            "url": None,
            "content": None,
            "success": True,
            "size": file_size,
            "metadata": {
                "key": key,
                "bucket": bucket,
                "operation": "delete",
                "deleted": True,
            },
            "error": None,
        }
```

### 2.6 Get Signed URL Handler

```python
    async def _handle_get_signed_url(
        self,
        client: Any,
        bucket: str,
        config: dict[str, Any],
        state: dict[str, Any],
        context: ExecutionContext,
        data: NodeExecutionData,
    ) -> dict[str, Any]:
        """
        Generate a presigned URL for temporary access.

        Supports both download (get_object) and upload (put_object) URLs.
        Default expiration is 3600 seconds (1 hour), max is 604800 (7 days).
        """
        key = self._resolve_and_validate_key(config.get("key", ""), state)
        if key is None:
            return self._error_result("Invalid or missing 'key' for get_signed_url")

        # Parse expiration
        raw_expires = config.get("expiresIn", self.DEFAULT_EXPIRES_IN)
        try:
            expires_in = int(raw_expires)
        except (TypeError, ValueError):
            expires_in = self.DEFAULT_EXPIRES_IN
        expires_in = max(60, min(expires_in, self.MAX_EXPIRES_IN))

        # Determine method: download by default
        method = config.get("signedUrlMethod", "get_object")
        if method not in ("get_object", "put_object"):
            method = "get_object"

        loop = asyncio.get_event_loop()
        url = await loop.run_in_executor(
            None,
            lambda: client.generate_presigned_url(
                method,
                Params={"Bucket": bucket, "Key": key},
                ExpiresIn=expires_in,
            ),
        )

        return {
            "url": url,
            "content": None,
            "success": True,
            "size": 0,
            "metadata": {
                "key": key,
                "bucket": bucket,
                "expiresIn": expires_in,
                "method": method,
                "operation": "get_signed_url",
            },
            "error": None,
        }
```

### 2.7 List Handler

```python
    async def _handle_list(
        self,
        client: Any,
        bucket: str,
        config: dict[str, Any],
        state: dict[str, Any],
        context: ExecutionContext,
        data: NodeExecutionData,
    ) -> dict[str, Any]:
        """
        List files in a bucket with optional prefix filter.

        Returns up to maxKeys files (default 100, max 1000).
        """
        prefix = self._resolve(config.get("prefix", ""), state)

        # Validate prefix (no path traversal)
        if ".." in prefix:
            return self._error_result("Invalid prefix: path traversal not allowed")

        # Parse maxKeys
        raw_max_keys = config.get("maxKeys", 100)
        try:
            max_keys = int(raw_max_keys)
        except (TypeError, ValueError):
            max_keys = 100
        max_keys = max(1, min(max_keys, self.MAX_LIST_KEYS))

        loop = asyncio.get_event_loop()

        list_params = {
            "Bucket": bucket,
            "MaxKeys": max_keys,
        }
        if prefix:
            list_params["Prefix"] = prefix

        response = await loop.run_in_executor(
            None,
            lambda: client.list_objects_v2(**list_params),
        )

        files = []
        total_size = 0
        for obj in response.get("Contents", []):
            file_info = {
                "key": obj["Key"],
                "size": obj["Size"],
                "lastModified": obj["LastModified"].isoformat()
                    if hasattr(obj["LastModified"], "isoformat")
                    else str(obj["LastModified"]),
                "etag": obj.get("ETag", ""),
            }
            files.append(file_info)
            total_size += obj["Size"]

        is_truncated = response.get("IsTruncated", False)
        key_count = response.get("KeyCount", len(files))

        return {
            "url": None,
            "content": files,
            "success": True,
            "size": total_size,
            "metadata": {
                "bucket": bucket,
                "prefix": prefix,
                "fileCount": key_count,
                "isTruncated": is_truncated,
                "maxKeys": max_keys,
                "operation": "list",
            },
            "error": None,
        }
```

### 2.8 Private Helper Methods

```python
    # -----------------------------------------------------------------------
    # Validation and Helpers
    # -----------------------------------------------------------------------

    def _resolve(self, text: str, state: dict[str, Any]) -> str:
        """Resolve {{expressions}} in a string."""
        if not text or "{{" not in text:
            return text
        return self._expression_resolver.resolve(text, state)

    def _resolve_and_validate_key(
        self,
        raw_key: str,
        state: dict[str, Any],
    ) -> Optional[str]:
        """
        Resolve expressions in key and validate the result.

        Returns None if the key is invalid or empty.
        Blocks path traversal attacks (../) and null bytes.
        """
        if not raw_key:
            return None

        key = self._resolve(raw_key, state)
        if not key:
            return None

        # Strip leading slash (S3 keys shouldn't start with /)
        key = key.lstrip("/")

        if not key:
            return None

        # Block path traversal
        if ".." in key:
            logger.warning("storage_action_path_traversal_blocked", key=key)
            return None

        # Block null bytes
        if "\x00" in key:
            logger.warning("storage_action_null_byte_blocked", key=key)
            return None

        # Validate character set and length (S3 key max is 1024 bytes)
        if len(key.encode("utf-8")) > 1024:
            return None

        return key

    def _build_public_url(
        self,
        client: Any,
        bucket: str,
        key: str,
        provider: str,
    ) -> str:
        """Build a public URL for an uploaded file."""
        resolved_provider = StorageClientFactory._resolve_provider(provider)

        if resolved_provider == StorageProvider.R2:
            import os
            public_url = (
                getattr(settings, "CLOUDFLARE_R2_PUBLIC_URL", "")
                or os.getenv("CLOUDFLARE_R2_PUBLIC_URL", "")
            )
            custom_domain = (
                getattr(settings, "CLOUDFLARE_R2_CUSTOM_DOMAIN", "")
                or os.getenv("CLOUDFLARE_R2_CUSTOM_DOMAIN", "")
            )
            base = custom_domain or public_url
            if base:
                return f"{base.rstrip('/')}/{key}"

        # Fallback: construct S3-style URL
        region = os.getenv("S3_REGION", "us-east-1")
        return f"https://{bucket}.s3.{region}.amazonaws.com/{key}"

    def _classify_error(self, error: Exception) -> str:
        """Classify a boto3/botocore error into a user-friendly message."""
        error_str = str(error)

        if HAS_BOTO3:
            if isinstance(error, ClientError):
                code = error.response.get("Error", {}).get("Code", "")
                message = error.response.get("Error", {}).get("Message", "")

                if code in ("NoSuchBucket",):
                    return f"Bucket not found: {message}"
                elif code in ("NoSuchKey", "404"):
                    return f"File not found: {message}"
                elif code in ("AccessDenied", "403"):
                    return f"Access denied: {message}"
                elif code in ("InvalidBucketName",):
                    return f"Invalid bucket name: {message}"
                elif code in ("EntityTooLarge",):
                    return f"File too large: {message}"
                elif code in ("SlowDown", "RequestLimitExceeded"):
                    return f"Rate limited by storage provider: {message}"
                else:
                    return f"Storage error ({code}): {message}"

            elif isinstance(error, NoCredentialsError):
                return (
                    "No storage credentials configured. "
                    "Set S3/R2/MinIO access keys in environment."
                )

            elif isinstance(error, BotoCoreError):
                return f"Storage connection error: {error_str}"

        return f"Storage operation failed: {error_str}"

    def _elapsed_ms(self, start_time: float) -> float:
        """Calculate elapsed time in milliseconds."""
        return round((time.monotonic() - start_time) * 1000, 2)

    def _error_result(
        self,
        error_message: str,
        elapsed_ms: float = 0,
    ) -> dict[str, Any]:
        """Build a standardized error output dict."""
        return {
            "url": None,
            "content": None,
            "success": False,
            "size": 0,
            "metadata": {},
            "error": error_message,
        }
```

**Key design decisions in the executor:**

1. **Output port consistency**: Every operation returns the same dict shape `{url, content, success, size, metadata, error}`. Unused ports are `None`/`0`/`{}`. This matches the node registry output spec.

2. **Content encoding strategy for download**: Text files are returned as plain strings, JSON files are parsed, binary files are base64-encoded. This keeps everything JSON-serializable for workflow state.

3. **Upload content flexibility**: Accepts bytes, base64 strings, data URLs, HTTP URLs (downloads and re-uploads), JSON objects, and plain text. The handler auto-detects format.

4. **Size guard before download**: Uses `HEAD` request to check file size before downloading, preventing OOM for huge files. Users are directed to `get_signed_url` for files over 100MB.

5. **Delete checks existence first**: Even though S3 delete is idempotent, we check via HEAD first so the workflow gets a meaningful "file not found" error instead of silent success.

---

## 3. Node Registry Spec

### Addition to `python-backend/app/orchestrator/node_registry.py`

Add within `_register_core_nodes()`, in the I/O section (after `http_request`):

```python
        # Storage Action
        self.register_node_type(
            NodeTypeSpec(
                type="storage_action",
                display_name="Storage Action",
                description="Upload, download, delete, or manage files in S3-compatible storage (AWS S3, Cloudflare R2, MinIO)",
                icon="hard-drive",
                color="cyan",
                category="integrations",
                inputs=[
                    InputSpec(
                        name="operation",
                        display_name="Operation",
                        data_type="text",
                        ui_type="select",
                        required=True,
                        accepts_connection=False,
                        default="upload",
                        options=[
                            {"label": "Upload File", "value": "upload"},
                            {"label": "Download File", "value": "download"},
                            {"label": "Delete File", "value": "delete"},
                            {"label": "Get Signed URL", "value": "get_signed_url"},
                            {"label": "List Files", "value": "list"},
                        ],
                    ),
                    InputSpec(
                        name="provider",
                        display_name="Storage Provider",
                        data_type="text",
                        ui_type="select",
                        required=False,
                        accepts_connection=False,
                        default="auto",
                        options=[
                            {"label": "Auto (from config)", "value": "auto"},
                            {"label": "AWS S3", "value": "s3"},
                            {"label": "Cloudflare R2", "value": "r2"},
                            {"label": "MinIO", "value": "minio"},
                        ],
                    ),
                    InputSpec(
                        name="bucket",
                        display_name="Bucket",
                        data_type="text",
                        ui_type="text",
                        required=False,
                        accepts_connection=True,
                        placeholder="my-bucket (default: from config)",
                    ),
                    InputSpec(
                        name="key",
                        display_name="File Key (Path)",
                        data_type="text",
                        ui_type="text",
                        required=False,  # Not needed for list
                        accepts_connection=True,
                        placeholder="path/to/file.pdf (supports {{expressions}})",
                    ),
                    InputSpec(
                        name="content",
                        display_name="File Content",
                        data_type="any",
                        ui_type="textarea",
                        required=False,  # Only for upload
                        accepts_connection=True,
                        placeholder="Base64, URL, or text content to upload...",
                    ),
                    InputSpec(
                        name="contentType",
                        display_name="Content Type",
                        data_type="text",
                        ui_type="text",
                        required=False,
                        accepts_connection=False,
                        placeholder="auto-detected from key extension",
                    ),
                    InputSpec(
                        name="expiresIn",
                        display_name="URL Expiration (seconds)",
                        data_type="number",
                        ui_type="number",
                        required=False,
                        accepts_connection=False,
                        default=3600,
                        validation={"min": 60, "max": 604800},
                    ),
                    InputSpec(
                        name="prefix",
                        display_name="Prefix Filter",
                        data_type="text",
                        ui_type="text",
                        required=False,  # Only for list
                        accepts_connection=True,
                        placeholder="images/2026/ (for list operation)",
                    ),
                    InputSpec(
                        name="maxKeys",
                        display_name="Max Results",
                        data_type="number",
                        ui_type="number",
                        required=False,  # Only for list
                        accepts_connection=False,
                        default=100,
                        validation={"min": 1, "max": 1000},
                    ),
                ],
                outputs=[
                    OutputSpec(
                        name="url",
                        display_name="URL",
                        data_type="text",
                    ),
                    OutputSpec(
                        name="content",
                        display_name="File Content",
                        data_type="any",
                    ),
                    OutputSpec(
                        name="success",
                        display_name="Success",
                        data_type="boolean",
                    ),
                    OutputSpec(
                        name="size",
                        display_name="Size (bytes)",
                        data_type="number",
                    ),
                    OutputSpec(
                        name="metadata",
                        display_name="Metadata",
                        data_type="json",
                    ),
                    OutputSpec(
                        name="error",
                        display_name="Error",
                        data_type="text",
                    ),
                ],
                executor="app.orchestrator.node_executors.io_executors.storage_action_executor.StorageActionExecutor",
            )
        )
```

**Conditional config display** (frontend concern, not blocking for backend):

The frontend `DynamicNodeConfig` component should conditionally show inputs based on the selected operation:

| Input | upload | download | delete | get_signed_url | list |
|-------|--------|----------|--------|----------------|------|
| operation | SHOW | SHOW | SHOW | SHOW | SHOW |
| provider | SHOW | SHOW | SHOW | SHOW | SHOW |
| bucket | SHOW | SHOW | SHOW | SHOW | SHOW |
| key | SHOW | SHOW | SHOW | SHOW | HIDE |
| content | SHOW | HIDE | HIDE | HIDE | HIDE |
| contentType | SHOW | HIDE | HIDE | HIDE | HIDE |
| expiresIn | HIDE | HIDE | HIDE | SHOW | HIDE |
| prefix | HIDE | HIDE | HIDE | HIDE | SHOW |
| maxKeys | HIDE | HIDE | HIDE | HIDE | SHOW |

This can be implemented via a `visibilityRules` field on `InputSpec` in the future, or handled client-side in `DynamicNodeConfig.tsx`.

---

## 4. Security Considerations

### 4.1 Bucket Access Control

The executor currently allows any bucket name. For production multi-tenant environments, add a bucket allowlist:

```python
# In ExecutionContext.extra_data or a separate config:
ALLOWED_BUCKETS = {"smartspec", "smartspec-media", "smartspec-staging"}

# Before executing any operation:
if resolved_bucket not in allowed_buckets:
    return self._error_result(f"Bucket '{resolved_bucket}' not permitted")
```

**Implementation recommendation**: Add a `storage_allowed_buckets` field to `ExecutionContext.extra_data`, populated by the workflow orchestrator from tenant configuration. This is a Phase 2 enhancement.

### 4.2 Key Path Validation

Implemented in `_resolve_and_validate_key()`:
- Blocks `..` path traversal
- Blocks null bytes
- Strips leading `/`
- Enforces 1024-byte max length (S3 limit)

### 4.3 Upload Source URL Validation

When upload content is a URL, the current implementation uses `httpx` to download it. For production hardening, integrate `SSRFGuard` from `io_executors/ssrf_guard.py`:

```python
# In _handle_upload, URL download section:
from app.orchestrator.node_executors.io_executors.ssrf_guard import SSRFGuard

ssrf_guard = SSRFGuard(tenant_allowlist=context.extra_data.get("ssrf_allowlist", []))
await ssrf_guard.validate_url(content)  # Raises ValueError if blocked
```

**This should be included in the initial implementation, not deferred.**

### 4.4 Credential Isolation

The executor uses `StorageClientFactory` which reads credentials from environment/settings. It does **not** accept credentials from workflow node config. This is intentional: users should not be able to specify arbitrary S3 credentials via the workflow UI.

For multi-tenant scenarios where different tenants have different S3 accounts, credentials should be stored encrypted in the database (using the encryption system documented in CLAUDE.md) and loaded by the orchestrator into `ExecutionContext.extra_data`.

---

## 5. Test Plan

### `python-backend/tests/test_storage_action_executor.py`

```python
"""Tests for StorageActionExecutor."""
import base64
import pytest
from unittest.mock import AsyncMock, MagicMock, patch

from app.orchestrator.node_executors.base import ExecutionContext, NodeExecutionData
from app.orchestrator.node_executors.io_executors.storage_action_executor import (
    StorageActionExecutor,
)
from app.orchestrator.node_executors.io_executors.storage_client_factory import (
    StorageClientFactory,
)
```

**Test categories:**

| Category | Tests | Purpose |
|----------|-------|---------|
| Upload | 6 tests | Base64, URL, text, JSON, large file rejection, data URL |
| Download | 4 tests | Text file, binary file, JSON file, file not found |
| Delete | 3 tests | Successful delete, file not found, access denied |
| Get Signed URL | 3 tests | Default expiry, custom expiry, max expiry clamping |
| List | 3 tests | With prefix, empty results, truncated results |
| Validation | 5 tests | Invalid operation, path traversal, null bytes, missing key, invalid bucket |
| Client Factory | 4 tests | Auto-detect R2, auto-detect S3, explicit MinIO, missing credentials |
| Error Classification | 3 tests | NoSuchBucket, AccessDenied, NoCredentialsError |

All tests should mock `boto3.client` and `StorageClientFactory.get_client` to avoid requiring real S3 credentials.

---

## 6. Verification Steps

After implementation:

1. **Run unit tests**: `cd python-backend && pytest tests/test_storage_action_executor.py -v`
2. **Run linting**: `cd python-backend && ruff check app/orchestrator/node_executors/io_executors/storage_action_executor.py app/orchestrator/node_executors/io_executors/storage_client_factory.py`
3. **Run type check**: `cd python-backend && mypy app/orchestrator/node_executors/io_executors/storage_action_executor.py`
4. **Verify registry**: Start FastAPI, hit `GET /api/v1/workflow/node-types` and confirm `storage_action` appears with correct inputs/outputs
5. **Verify import chain**: `python -c "from app.orchestrator.node_executors.io_executors.storage_action_executor import StorageActionExecutor; print('OK')"`
6. **Run full test suite**: `cd python-backend && pytest` (ensure no regressions, 80% coverage maintained)

---

## 7. Implementation Order

1. Create `storage_client_factory.py` (no dependencies on other new code)
2. Create `storage_action_executor.py` (depends on factory)
3. Update `io_executors/__init__.py` to export both
4. Add `storage_action` to `node_registry.py`
5. Create `test_storage_action_executor.py`
6. Run verification steps
7. (Optional) Update frontend `DynamicNodeConfig.tsx` for conditional field visibility

## 8. Dependencies

No new pip packages required. The executor uses:
- `boto3` (already in `requirements.txt`)
- `httpx` (already in `requirements.txt`, for URL-based uploads)
- `structlog` (already in `requirements.txt`)
- Standard library: `asyncio`, `base64`, `io`, `mimetypes`, `re`, `time`, `json`

## 9. Future Enhancements (Out of Scope)

- **Multipart upload** for files > 5MB (use `client.create_multipart_upload`)
- **Streaming download** with `StreamingBody` for files > 100MB
- **Copy operation** (S3 copy_object for moving files between keys/buckets)
- **Bucket allowlist** per tenant from database configuration
- **Progress tracking** via SSE for large transfers
- **Versioned downloads** (S3 object versioning)
- **Lifecycle rules** (set expiration on uploaded objects)
- **Frontend conditional field visibility** based on selected operation
