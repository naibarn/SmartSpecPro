"""Factory for creating S3-compatible storage clients across providers."""
import os
from typing import Any, Optional

import structlog

logger = structlog.get_logger()

try:
    import boto3
    from botocore.config import Config as BotoConfig

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
                "boto3 is required for storage operations. Install with: pip install boto3"
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
            return getattr(settings, "S3_BUCKET", "") or os.getenv("S3_BUCKET", "")

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
            region = getattr(settings, "S3_REGION", "") or os.getenv("S3_REGION", "us-east-1")
            # For standard S3, use default credential chain
            # (env vars AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY, or IAM role)
            endpoint_url = os.getenv("S3_ENDPOINT")  # None = default AWS
            kwargs: dict[str, Any] = {
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
