"""
R2/S3 Storage Service with Database Configuration
Fetches storage settings from PostgreSQL (storage_settings table)
and provides upload functionality for reference images
"""

import os
import httpx
import structlog
import hashlib
from typing import Optional, Dict, Any, TYPE_CHECKING
from datetime import datetime
import boto3
from botocore.config import Config
from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes
from cryptography.hazmat.backends import default_backend
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError, ProgrammingError

if TYPE_CHECKING:
    from sqlalchemy.ext.asyncio import AsyncSession

logger = structlog.get_logger()

# Encryption settings (must match Node.js side)
ENCRYPTION_KEY = os.getenv("STORAGE_ENCRYPTION_KEY") or os.getenv("LLM_ENCRYPTION_KEY") or ""
if not ENCRYPTION_KEY:
    logger.warning("STORAGE_ENCRYPTION_KEY / LLM_ENCRYPTION_KEY not set — encrypted storage settings will fail")


def decrypt_aes256(encrypted_text: str) -> str:
    """Decrypt text encrypted by Node.js encrypt function (AES-256-GCM).

    Delegates to smartspecweb_crypto.decrypt_smartspecweb() which handles
    the current GCM format (iv:authTag:ciphertext) using LLM_ENCRYPTION_KEY.
    """
    try:
        from app.core.smartspecweb_crypto import decrypt_smartspecweb
        return decrypt_smartspecweb(encrypted_text)
    except Exception as e:
        logger.error("decrypt_error", error=str(e))
        return ""


class R2StorageService:
    """
    R2/S3 Storage Service that fetches configuration from database

    IMPORTANT: This is a singleton service. Do NOT store request-scoped
    objects (like db sessions) as instance variables. Pass them as parameters instead.
    """

    def __init__(self):
        self._settings_cache: Optional[Dict[str, Any]] = None
        self._cache_timestamp: Optional[datetime] = None
        self._cache_ttl_seconds = 300  # Cache settings for 5 minutes (longer TTL since settings rarely change)
        self._s3_client: Optional[Any] = None

    def get_cached_settings(self) -> Optional[Dict[str, Any]]:
        """Get settings from cache if available and not expired"""
        if self._settings_cache and self._cache_timestamp:
            age = (datetime.utcnow() - self._cache_timestamp).total_seconds()
            if age < self._cache_ttl_seconds:
                logger.debug("r2_storage_using_cache")
                return self._settings_cache
        return None

    async def get_active_settings(self, db_session: Optional["AsyncSession"] = None, force_refresh: bool = False) -> Optional[Dict[str, Any]]:
        """
        Get active storage settings from database

        Args:
            db_session: SQLAlchemy async session (required if cache is empty/expired)
            force_refresh: Force refresh from database

        Returns:
            Storage settings dict or None if not configured
        """
        # Check cache first (unless force refresh)
        if not force_refresh:
            cached = self.get_cached_settings()
            if cached:
                return cached

        # No cache or expired - need to fetch from database
        if not db_session:
            # Return cached settings even if expired, rather than failing
            if self._settings_cache:
                logger.warning("r2_storage_using_stale_cache", message="No db session provided, using stale cache")
                return self._settings_cache
            logger.warning("r2_storage_no_settings", message="No db session and no cached settings available")
            return None

        try:
            logger.info("r2_storage_fetching_settings_from_db")
            result = await db_session.execute(text("""
                SELECT
                    id,
                    name,
                    "displayName",
                    "providerType",
                    endpoint,
                    region,
                    bucket,
                    "accessKeyIdEncrypted",
                    "secretAccessKeyEncrypted",
                    "hasCredentials",
                    "publicUrlPrefix",
                    "devTunnelUrl",
                    "pathPrefix",
                    "configJson"
                FROM storage_settings
                WHERE "isActive" = true
                LIMIT 1
            """))

            row = result.fetchone()

            if not row:
                logger.info("no_active_storage_settings")
                return None

            # Convert row to dict using SQLAlchemy 2.0 _mapping for compatibility
            settings = dict(row._mapping)

            # Decrypt credentials
            if settings.get("accessKeyIdEncrypted"):
                settings["accessKeyId"] = decrypt_aes256(settings["accessKeyIdEncrypted"])
            if settings.get("secretAccessKeyEncrypted"):
                settings["secretAccessKey"] = decrypt_aes256(settings["secretAccessKeyEncrypted"])

            # Remove encrypted fields
            settings.pop("accessKeyIdEncrypted", None)
            settings.pop("secretAccessKeyEncrypted", None)

            # Cache settings (thread-safe since we're just assigning references)
            self._settings_cache = settings
            self._cache_timestamp = datetime.utcnow()

            logger.info("storage_settings_loaded",
                       name=settings.get("name"),
                       provider_type=settings.get("providerType"))

            return settings

        except ProgrammingError as e:
            # Table doesn't exist or SQL syntax error - this is not a critical error
            # Just means storage_settings migration hasn't been run yet
            error_str = str(e)
            if "storage_settings" in error_str and ("does not exist" in error_str or "undefined" in error_str):
                logger.warning("storage_settings_table_not_found",
                              message="storage_settings table doesn't exist. Run migrations to enable R2 storage.")
            else:
                logger.error("get_storage_settings_sql_error", error=error_str)
            return None
        except SQLAlchemyError as e:
            # Catch all SQLAlchemy errors to prevent them from bubbling up
            logger.error("get_storage_settings_db_error", error=str(e), exc_info=True)
            return None
        except Exception as e:
            logger.error("get_storage_settings_error", error=str(e), exc_info=True)
            return None

    def _get_s3_client(self, settings: Dict[str, Any]) -> Any:
        """Get boto3 S3 client for the given settings"""
        if not settings.get("accessKeyId") or not settings.get("secretAccessKey"):
            raise ValueError("Storage credentials not configured")

        endpoint = settings.get("endpoint")
        region = settings.get("region", "auto")

        # Configure for R2/S3
        # Handle None configJson by using empty dict
        config_json = settings.get("configJson") or {}
        config = Config(
            signature_version='s3v4',
            s3={'addressing_style': 'path' if config_json.get("forcePathStyle") else 'virtual'}
        )

        client = boto3.client(
            's3',
            endpoint_url=endpoint,
            region_name=region,
            aws_access_key_id=settings["accessKeyId"],
            aws_secret_access_key=settings["secretAccessKey"],
            config=config
        )

        return client

    def _generate_file_key(self, settings: Dict[str, Any], filename: str, folder: str = "reference") -> str:
        """Generate unique file key with path prefix"""
        path_prefix = settings.get("pathPrefix", "uploads/").rstrip("/")
        timestamp = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
        file_hash = hashlib.sha256(f"{filename}{timestamp}".encode()).hexdigest()[:8]

        # Get file extension
        ext = filename.rsplit(".", 1)[-1] if "." in filename else "png"

        return f"{path_prefix}/{folder}/{timestamp}_{file_hash}.{ext}"

    def _get_content_type(self, filename: str) -> str:
        """Get MIME type from filename"""
        ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
        content_types = {
            "png": "image/png",
            "jpg": "image/jpeg",
            "jpeg": "image/jpeg",
            "gif": "image/gif",
            "webp": "image/webp",
            "mp4": "video/mp4",
            "webm": "video/webm",
        }
        return content_types.get(ext, "application/octet-stream")

    async def upload_file(
        self,
        file_content: bytes,
        filename: str,
        folder: str = "reference",
        content_type: Optional[str] = None,
        db_session: Optional["AsyncSession"] = None
    ) -> Optional[str]:
        """
        Upload file to R2/S3 storage

        Args:
            file_content: File bytes
            filename: Original filename
            folder: Folder path (e.g., "reference", "generated")
            content_type: MIME type (auto-detected if not provided)
            db_session: Optional SQLAlchemy session (uses cached settings if not provided)

        Returns:
            Public URL of uploaded file or None if upload failed
        """
        settings = await self.get_active_settings(db_session=db_session)

        if not settings:
            logger.warning("upload_file_no_settings", filename=filename)
            return None

        if settings.get("providerType") == "local":
            logger.info("local_storage_not_supported_for_external_access")
            return None

        try:
            client = self._get_s3_client(settings)

            file_key = self._generate_file_key(settings, filename, folder)

            if not content_type:
                content_type = self._get_content_type(filename)

            # Upload to S3/R2
            client.put_object(
                Bucket=settings.get("bucket", ""),
                Key=file_key,
                Body=file_content,
                ContentType=content_type,
            )

            # Build public URL
            public_url_prefix = settings.get("publicUrlPrefix", "").rstrip("/")
            if public_url_prefix:
                url = f"{public_url_prefix}/{file_key}"
            else:
                # Fallback to endpoint URL
                endpoint = settings.get("endpoint", "").rstrip("/")
                bucket = settings.get("bucket", "")
                url = f"{endpoint}/{bucket}/{file_key}"

            logger.info("file_uploaded_r2",
                       key=file_key,
                       url=url,
                       size=len(file_content))

            return url

        except Exception as e:
            logger.error("upload_file_error",
                        error=str(e),
                        filename=filename)
            return None

    async def upload_from_url(
        self,
        source_url: str,
        filename: Optional[str] = None,
        folder: str = "reference",
        db_session: Optional["AsyncSession"] = None
    ) -> Optional[str]:
        """
        Download file from URL and upload to R2/S3

        Args:
            source_url: URL to download from
            filename: Optional filename (derived from URL if not provided)
            folder: Folder path
            db_session: Optional SQLAlchemy session (uses cached settings if not provided)

        Returns:
            Public URL of uploaded file or None if failed
        """
        try:
            async with httpx.AsyncClient(timeout=60.0) as client:
                response = await client.get(source_url, follow_redirects=True)
                response.raise_for_status()

                file_content = response.content

                # Derive filename from URL if not provided
                if not filename:
                    url_path = source_url.split("?")[0]
                    filename = url_path.rsplit("/", 1)[-1] or "file.png"

                # Get content type from response
                content_type = response.headers.get("content-type", "").split(";")[0]

                return await self.upload_file(
                    file_content,
                    filename,
                    folder,
                    content_type or None,
                    db_session=db_session
                )

        except Exception as e:
            logger.error("upload_from_url_error",
                        url=source_url,
                        error=str(e))
            return None

    async def resolve_reference_url(self, url: str, db_session: Optional["AsyncSession"] = None) -> str:
        """
        Resolve a reference image URL to a publicly accessible URL

        If the URL is already public (https://), returns as-is.
        If the URL is a local/internal path, uploads to R2 and returns public URL.

        Args:
            url: Original URL (can be relative path or internal Docker URL)
            db_session: Optional SQLAlchemy session for database operations

        Returns:
            Public URL accessible by external services
        """
        if not url:
            return url

        # Already a public URL
        if url.startswith("https://") and not "smartspec-web" in url and not "localhost" in url:
            return url

        # Internal Docker URL or relative path - needs to be uploaded to R2
        logger.info("resolving_internal_url", original_url=url)

        # Determine the full URL to download from
        if url.startswith("/"):
            # Relative path - construct internal URL
            node_server_url = os.getenv("NODE_SERVER_URL", "http://smartspec-web:3000")
            full_url = f"{node_server_url}{url}"
        elif url.startswith("http://smartspec-web") or url.startswith("http://localhost"):
            # Already internal URL
            full_url = url
        else:
            # Unknown format, return as-is
            return url

        # Download and upload to R2
        public_url = await self.upload_from_url(full_url, folder="reference", db_session=db_session)

        if public_url:
            logger.info("url_resolved_to_r2",
                       original=url,
                       public_url=public_url)
            return public_url

        # Failed to upload - return original URL
        logger.warning("url_resolution_failed", url=url)
        return url

    async def resolve_reference_urls(self, urls: list, db_session: Optional["AsyncSession"] = None) -> list:
        """
        Resolve multiple reference image URLs

        Args:
            urls: List of URLs to resolve
            db_session: Optional SQLAlchemy session for database operations

        Returns:
            List of resolved public URLs
        """
        if not urls:
            return urls

        resolved = []
        for url in urls:
            resolved_url = await self.resolve_reference_url(url, db_session=db_session)
            resolved.append(resolved_url)

        return resolved


# Singleton instance
_r2_service: Optional[R2StorageService] = None


def get_r2_storage_service() -> R2StorageService:
    """Get or create R2 storage service instance"""
    global _r2_service

    if _r2_service is None:
        _r2_service = R2StorageService()
        logger.info("r2_storage_service_initialized")

    return _r2_service
