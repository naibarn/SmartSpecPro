"""Storage Action node executor -- S3/R2/MinIO file operations."""
import asyncio
import base64
import json
import mimetypes
import os
import re
import time
from typing import Any, Optional

import structlog

from app.orchestrator.expression_resolver import ExpressionResolver
from app.orchestrator.node_executors.base import ExecutionContext, NodeExecutionData
from app.orchestrator.node_executors.io_executors.ssrf_guard import SSRFGuard
from app.orchestrator.node_executors.io_executors.storage_client_factory import (
    StorageClientFactory,
    StorageProvider,
)

logger = structlog.get_logger()

try:
    from botocore.exceptions import BotoCoreError, ClientError, NoCredentialsError

    HAS_BOTO3 = True
except ImportError:
    HAS_BOTO3 = False


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
    SUPPORTED_OPERATIONS: set[str] = {"upload", "download", "delete", "get_signed_url", "list"}

    # Regex for validating bucket names (S3 bucket naming rules)
    SAFE_BUCKET_PATTERN: re.Pattern = re.compile(r"^[a-z0-9][a-z0-9.\-]{1,61}[a-z0-9]$")

    def __init__(self):
        self._expression_resolver = ExpressionResolver()

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

    # -----------------------------------------------------------------------
    # Operation Handlers
    # -----------------------------------------------------------------------

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
        3. URL to download and re-upload (with SSRF protection)
        4. Plain text/JSON string to store as file
        """
        key = self._resolve_and_validate_key(config.get("key", ""), state)
        if key is None:
            return self._error_result("Invalid or missing 'key' for upload")

        content = config.get("content") or data.inputs.get("content")
        if content is None:
            return self._error_result("No content provided for upload")

        # Determine content bytes and content type
        content_type = (
            config.get("contentType") or mimetypes.guess_type(key)[0] or "application/octet-stream"
        )
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
                # URL -- validate with SSRF guard, then download content
                tenant_allowlist = context.extra_data.get("ssrf_allowlist", [])
                ssrf_guard = SSRFGuard(tenant_allowlist=tenant_allowlist)
                try:
                    await ssrf_guard.validate_url(content)
                except ValueError as e:
                    logger.warning(
                        "storage_action_ssrf_blocked",
                        url=content,
                        reason=str(e),
                        node_id=data.node_id,
                    )
                    return self._error_result(f"Upload source URL blocked by security policy: {e}")

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
            content_value: Any = file_bytes.decode("utf-8", errors="replace")
        elif content_type == "application/json":
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

        list_params: dict[str, Any] = {
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
                "lastModified": (
                    obj["LastModified"].isoformat()
                    if hasattr(obj["LastModified"], "isoformat")
                    else str(obj["LastModified"])
                ),
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

        # Validate key length (S3 key max is 1024 bytes)
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
            public_url = getattr(settings, "CLOUDFLARE_R2_PUBLIC_URL", "") or os.getenv(
                "CLOUDFLARE_R2_PUBLIC_URL", ""
            )
            custom_domain = getattr(settings, "CLOUDFLARE_R2_CUSTOM_DOMAIN", "") or os.getenv(
                "CLOUDFLARE_R2_CUSTOM_DOMAIN", ""
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
