"""
SmartSpec Pro - Cloudflare R2 Storage Service
Handles file storage for generated media (images, videos, audio).
"""

import asyncio
import hashlib
import mimetypes
from datetime import datetime, timedelta
from io import BytesIO
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple
from uuid import uuid4

import httpx
import structlog
from PIL import Image

from app.core.config import settings

logger = structlog.get_logger()

# Try to import boto3 for S3-compatible API
try:
    import boto3
    from botocore.config import Config
    from botocore.exceptions import ClientError
    HAS_BOTO3 = True
except ImportError:
    HAS_BOTO3 = False
    logger.warning("boto3 not installed, R2 storage will be limited")


# =============================================================================
# STORAGE PATHS
# =============================================================================

class StoragePath:
    """Storage path builder for R2."""
    
    @staticmethod
    def image_generated(user_id: str, task_id: str, ext: str = "png") -> str:
        """Path for generated images."""
        return f"images/generated/{user_id}/{task_id}.{ext}"
    
    @staticmethod
    def image_gallery(gallery_id: str, image_id: str, ext: str = "png") -> str:
        """Path for gallery images."""
        return f"images/gallery/{gallery_id}/{image_id}.{ext}"
    
    @staticmethod
    def image_thumbnail(image_id: str, size: str = "256", ext: str = "jpg") -> str:
        """Path for image thumbnails."""
        return f"images/thumbnails/{size}/{image_id}.{ext}"
    
    @staticmethod
    def video_generated(user_id: str, task_id: str, ext: str = "mp4") -> str:
        """Path for generated videos."""
        return f"videos/generated/{user_id}/{task_id}.{ext}"
    
    @staticmethod
    def video_gallery(gallery_id: str, video_id: str, ext: str = "mp4") -> str:
        """Path for gallery videos."""
        return f"videos/gallery/{gallery_id}/{video_id}.{ext}"
    
    @staticmethod
    def video_thumbnail(video_id: str, ext: str = "jpg") -> str:
        """Path for video thumbnails."""
        return f"videos/thumbnails/{video_id}.{ext}"
    
    @staticmethod
    def audio_generated(user_id: str, task_id: str, ext: str = "mp3") -> str:
        """Path for generated audio."""
        return f"audio/generated/{user_id}/{task_id}.{ext}"


# =============================================================================
# R2 STORAGE SERVICE
# =============================================================================

class R2StorageService:
    """
    Cloudflare R2 storage service for media files.
    
    Uses S3-compatible API via boto3.
    """
    
    def __init__(
        self,
        access_key_id: Optional[str] = None,
        secret_access_key: Optional[str] = None,
        bucket_name: Optional[str] = None,
        endpoint_url: Optional[str] = None,
        public_url: Optional[str] = None,
    ):
        self.access_key_id = access_key_id or settings.CLOUDFLARE_R2_ACCESS_KEY_ID
        self.secret_access_key = secret_access_key or settings.CLOUDFLARE_R2_SECRET_ACCESS_KEY
        self.bucket_name = bucket_name or settings.CLOUDFLARE_R2_BUCKET_NAME
        self.endpoint_url = endpoint_url or settings.CLOUDFLARE_R2_ENDPOINT
        self.public_url = public_url or settings.CLOUDFLARE_R2_PUBLIC_URL
        
        self._client = None
        self._http_client: Optional[httpx.AsyncClient] = None
    
    @property
    def client(self):
        """Get or create S3 client."""
        if not HAS_BOTO3:
            raise RuntimeError("boto3 is required for R2 storage")
        
        if self._client is None:
            self._client = boto3.client(
                "s3",
                endpoint_url=self.endpoint_url,
                aws_access_key_id=self.access_key_id,
                aws_secret_access_key=self.secret_access_key,
                config=Config(
                    signature_version="s3v4",
                    s3={"addressing_style": "path"},
                ),
            )
        return self._client
    
    @property
    def http_client(self) -> httpx.AsyncClient:
        """Get or create HTTP client for downloads."""
        if self._http_client is None or self._http_client.is_closed:
            self._http_client = httpx.AsyncClient(
                timeout=httpx.Timeout(300.0, connect=30.0),
                follow_redirects=True,
            )
        return self._http_client
    
    async def close(self):
        """Close the HTTP client."""
        if self._http_client and not self._http_client.is_closed:
            await self._http_client.aclose()
    
    # =========================================================================
    # UPLOAD OPERATIONS
    # =========================================================================
    
    async def upload_file(
        self,
        file_path: str,
        key: str,
        content_type: Optional[str] = None,
        metadata: Optional[Dict[str, str]] = None,
    ) -> str:
        """
        Upload a local file to R2.
        
        Args:
            file_path: Path to the local file
            key: Storage key (path in R2)
            content_type: MIME type (auto-detected if not provided)
            metadata: Additional metadata
            
        Returns:
            Public URL of the uploaded file
        """
        if not content_type:
            content_type, _ = mimetypes.guess_type(file_path)
            content_type = content_type or "application/octet-stream"
        
        extra_args = {"ContentType": content_type}
        if metadata:
            extra_args["Metadata"] = metadata
        
        # Run in thread pool to avoid blocking
        loop = asyncio.get_event_loop()
        await loop.run_in_executor(
            None,
            lambda: self.client.upload_file(
                file_path,
                self.bucket_name,
                key,
                ExtraArgs=extra_args,
            ),
        )
        
        logger.info("File uploaded to R2", key=key, content_type=content_type)
        return self.get_public_url(key)
    
    async def upload_bytes(
        self,
        data: bytes,
        key: str,
        content_type: str = "application/octet-stream",
        metadata: Optional[Dict[str, str]] = None,
    ) -> str:
        """
        Upload bytes to R2.
        
        Args:
            data: File content as bytes
            key: Storage key (path in R2)
            content_type: MIME type
            metadata: Additional metadata
            
        Returns:
            Public URL of the uploaded file
        """
        extra_args = {"ContentType": content_type}
        if metadata:
            extra_args["Metadata"] = metadata
        
        loop = asyncio.get_event_loop()
        await loop.run_in_executor(
            None,
            lambda: self.client.put_object(
                Bucket=self.bucket_name,
                Key=key,
                Body=data,
                **extra_args,
            ),
        )
        
        logger.info("Bytes uploaded to R2", key=key, size=len(data))
        return self.get_public_url(key)
    
    async def upload_from_url(
        self,
        source_url: str,
        key: str,
        content_type: Optional[str] = None,
        metadata: Optional[Dict[str, str]] = None,
    ) -> str:
        """
        Download from URL and upload to R2.
        
        Args:
            source_url: URL to download from
            key: Storage key (path in R2)
            content_type: MIME type (auto-detected from response)
            metadata: Additional metadata
            
        Returns:
            Public URL of the uploaded file
        """
        logger.info("Downloading from URL", source_url=source_url)
        
        response = await self.http_client.get(source_url)
        response.raise_for_status()
        
        if not content_type:
            content_type = response.headers.get("content-type", "application/octet-stream")
        
        return await self.upload_bytes(
            response.content,
            key,
            content_type=content_type,
            metadata=metadata,
        )
    
    # =========================================================================
    # DOWNLOAD OPERATIONS
    # =========================================================================
    
    async def download_file(self, key: str, file_path: str) -> str:
        """
        Download a file from R2.
        
        Args:
            key: Storage key
            file_path: Local path to save the file
            
        Returns:
            Local file path
        """
        loop = asyncio.get_event_loop()
        await loop.run_in_executor(
            None,
            lambda: self.client.download_file(
                self.bucket_name,
                key,
                file_path,
            ),
        )
        
        logger.info("File downloaded from R2", key=key, file_path=file_path)
        return file_path
    
    async def download_bytes(self, key: str) -> bytes:
        """
        Download file content as bytes.
        
        Args:
            key: Storage key
            
        Returns:
            File content as bytes
        """
        loop = asyncio.get_event_loop()
        response = await loop.run_in_executor(
            None,
            lambda: self.client.get_object(
                Bucket=self.bucket_name,
                Key=key,
            ),
        )
        
        return response["Body"].read()
    
    # =========================================================================
    # DELETE OPERATIONS
    # =========================================================================
    
    async def delete_file(self, key: str) -> bool:
        """
        Delete a file from R2.
        
        Args:
            key: Storage key
            
        Returns:
            True if deleted successfully
        """
        try:
            loop = asyncio.get_event_loop()
            await loop.run_in_executor(
                None,
                lambda: self.client.delete_object(
                    Bucket=self.bucket_name,
                    Key=key,
                ),
            )
            logger.info("File deleted from R2", key=key)
            return True
        except Exception as e:
            logger.error("Error deleting file", key=key, error=str(e))
            return False
    
    async def delete_files(self, keys: List[str]) -> int:
        """
        Delete multiple files from R2.
        
        Args:
            keys: List of storage keys
            
        Returns:
            Number of files deleted
        """
        if not keys:
            return 0
        
        objects = [{"Key": key} for key in keys]
        
        loop = asyncio.get_event_loop()
        response = await loop.run_in_executor(
            None,
            lambda: self.client.delete_objects(
                Bucket=self.bucket_name,
                Delete={"Objects": objects},
            ),
        )
        
        deleted_count = len(response.get("Deleted", []))
        logger.info("Files deleted from R2", count=deleted_count)
        return deleted_count
    
    # =========================================================================
    # URL OPERATIONS
    # =========================================================================
    
    def get_public_url(self, key: str) -> str:
        """Get the public URL for a file."""
        return f"{self.public_url.rstrip('/')}/{key}"
    
    async def generate_presigned_url(
        self,
        key: str,
        expires_in: int = 3600,
        method: str = "get_object",
    ) -> str:
        """
        Generate a presigned URL for upload or download.
        
        Args:
            key: Storage key
            expires_in: URL expiration in seconds
            method: 'get_object' for download, 'put_object' for upload
            
        Returns:
            Presigned URL
        """
        loop = asyncio.get_event_loop()
        url = await loop.run_in_executor(
            None,
            lambda: self.client.generate_presigned_url(
                method,
                Params={"Bucket": self.bucket_name, "Key": key},
                ExpiresIn=expires_in,
            ),
        )
        return url
    
    # =========================================================================
    # LIST OPERATIONS
    # =========================================================================
    
    async def list_files(
        self,
        prefix: str = "",
        max_keys: int = 1000,
    ) -> List[Dict[str, Any]]:
        """
        List files in R2.
        
        Args:
            prefix: Key prefix to filter by
            max_keys: Maximum number of keys to return
            
        Returns:
            List of file info dicts
        """
        loop = asyncio.get_event_loop()
        response = await loop.run_in_executor(
            None,
            lambda: self.client.list_objects_v2(
                Bucket=self.bucket_name,
                Prefix=prefix,
                MaxKeys=max_keys,
            ),
        )
        
        files = []
        for obj in response.get("Contents", []):
            files.append({
                "key": obj["Key"],
                "size": obj["Size"],
                "last_modified": obj["LastModified"],
                "etag": obj["ETag"],
                "url": self.get_public_url(obj["Key"]),
            })
        
        return files
    
    async def file_exists(self, key: str) -> bool:
        """Check if a file exists in R2."""
        try:
            loop = asyncio.get_event_loop()
            await loop.run_in_executor(
                None,
                lambda: self.client.head_object(
                    Bucket=self.bucket_name,
                    Key=key,
                ),
            )
            return True
        except:
            return False
    
    # =========================================================================
    # THUMBNAIL GENERATION
    # =========================================================================
    
    async def create_image_thumbnail(
        self,
        source_key: str,
        target_key: str,
        size: Tuple[int, int] = (256, 256),
        format: str = "JPEG",
        quality: int = 85,
    ) -> str:
        """
        Create a thumbnail from an image in R2.
        
        Args:
            source_key: Source image key
            target_key: Target thumbnail key
            size: Thumbnail size (width, height)
            format: Output format (JPEG, PNG, WEBP)
            quality: Output quality (1-100)
            
        Returns:
            Public URL of the thumbnail
        """
        # Download source image
        image_bytes = await self.download_bytes(source_key)
        
        # Create thumbnail
        loop = asyncio.get_event_loop()
        thumbnail_bytes = await loop.run_in_executor(
            None,
            lambda: self._create_thumbnail(image_bytes, size, format, quality),
        )
        
        # Upload thumbnail
        content_type = f"image/{format.lower()}"
        return await self.upload_bytes(thumbnail_bytes, target_key, content_type)
    
    def _create_thumbnail(
        self,
        image_bytes: bytes,
        size: Tuple[int, int],
        format: str,
        quality: int,
    ) -> bytes:
        """Create thumbnail from image bytes (sync)."""
        img = Image.open(BytesIO(image_bytes))
        
        # Convert to RGB if necessary
        if img.mode in ("RGBA", "P") and format == "JPEG":
            img = img.convert("RGB")
        
        # Create thumbnail
        img.thumbnail(size, Image.Resampling.LANCZOS)
        
        # Save to bytes
        output = BytesIO()
        img.save(output, format=format, quality=quality, optimize=True)
        return output.getvalue()


# =============================================================================
# SINGLETON INSTANCE
# =============================================================================

_storage_instance: Optional[R2StorageService] = None


def get_r2_storage() -> R2StorageService:
    """Get the singleton R2 storage instance."""
    global _storage_instance
    if _storage_instance is None:
        _storage_instance = R2StorageService()
    return _storage_instance


async def shutdown_r2_storage():
    """Shutdown the R2 storage service."""
    global _storage_instance
    if _storage_instance:
        await _storage_instance.close()
        _storage_instance = None
