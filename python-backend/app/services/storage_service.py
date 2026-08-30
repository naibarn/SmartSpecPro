"""
File Storage Service
Handles local and S3 storage for generated media files
"""

import os
import boto3
import structlog
from typing import Optional, BinaryIO
from pathlib import Path
from datetime import datetime
import hashlib
import mimetypes

logger = structlog.get_logger()


class StorageService:
    """Unified storage service supporting local and S3 storage"""

    def __init__(
        self,
        storage_type: str = "local",  # "local" or "s3"
        local_base_path: str = "./media_storage",
        s3_bucket: Optional[str] = None,
        s3_region: Optional[str] = None,
        cdn_base_url: Optional[str] = None
    ):
        self.storage_type = storage_type
        self.local_base_path = Path(local_base_path)
        self.s3_bucket = s3_bucket
        self.s3_region = s3_region
        self.cdn_base_url = cdn_base_url

        if storage_type == "local":
            self.local_base_path.mkdir(parents=True, exist_ok=True)
        elif storage_type == "s3":
            if not s3_bucket:
                raise ValueError("S3 bucket name required for S3 storage")
            self.s3_client = boto3.client("s3", region_name=s3_region)

    def _generate_file_path(self, user_id: str, task_id: str, media_type: str, extension: str) -> str:
        """Generate organized file path"""
        # Create path: {user_id}/{media_type}/{year}/{month}/{task_id}.{ext}
        now = datetime.utcnow()
        return f"{user_id}/{media_type}/{now.year}/{now.month:02d}/{task_id}.{extension}"

    def _get_content_type(self, extension: str) -> str:
        """Get MIME type for file extension"""
        content_types = {
            "png": "image/png",
            "jpg": "image/jpeg",
            "jpeg": "image/jpeg",
            "gif": "image/gif",
            "webp": "image/webp",
            "mp4": "video/mp4",
            "webm": "video/webm",
            "mov": "video/quicktime",
            "mp3": "audio/mpeg",
            "wav": "audio/wav",
            "ogg": "audio/ogg",
        }
        return content_types.get(extension.lower(), "application/octet-stream")

    async def save_file(
        self,
        file_content: bytes,
        user_id: str,
        task_id: str,
        media_type: str,
        extension: str
    ) -> str:
        """
        Save file to storage (local or S3)

        Returns:
            str: Public URL or local path to the file
        """
        file_path = self._generate_file_path(user_id, task_id, media_type, extension)

        # This legacy service is retained only for non-media compatibility.
        # Generated media must use the authenticated R2 storage services so a
        # stale STORAGE_TYPE=s3/local configuration cannot bypass the durable
        # media boundary.
        media_kind = media_type.lower().split("/", 1)[0]
        if media_kind in {"image", "video", "audio"}:
            raise RuntimeError(
                "Persistent image/video/audio storage requires Cloudflare R2; "
                "use app.services.r2_storage_service instead"
            )

        if self.storage_type == "local":
            return await self._save_local(file_content, file_path)
        elif self.storage_type == "s3":
            return await self._save_s3(file_content, file_path, extension)
        else:
            raise ValueError(f"Unknown storage type: {self.storage_type}")

    async def _save_local(self, file_content: bytes, file_path: str) -> str:
        """Save file to local storage"""
        full_path = self.local_base_path / file_path
        full_path.parent.mkdir(parents=True, exist_ok=True)

        with open(full_path, "wb") as f:
            f.write(file_content)

        logger.info("file_saved_locally", path=str(full_path), size=len(file_content))
        return str(full_path)

    async def _save_s3(self, file_content: bytes, file_path: str, extension: str) -> str:
        """Save file to S3 storage"""
        content_type = self._get_content_type(extension)

        self.s3_client.put_object(
            Bucket=self.s3_bucket,
            Key=file_path,
            Body=file_content,
            ContentType=content_type,
            ACL="public-read"  # Make files publicly accessible
        )

        # Generate URL
        if self.cdn_base_url:
            url = f"{self.cdn_base_url}/{file_path}"
        else:
            url = f"https://{self.s3_bucket}.s3.{self.s3_region}.amazonaws.com/{file_path}"

        logger.info("file_saved_s3", path=file_path, url=url, size=len(file_content))
        return url

    async def delete_file(self, file_path_or_url: str) -> bool:
        """Delete file from storage"""
        if self.storage_type == "local":
            return await self._delete_local(file_path_or_url)
        elif self.storage_type == "s3":
            return await self._delete_s3(file_path_or_url)
        return False

    async def _delete_local(self, file_path: str) -> bool:
        """Delete file from local storage"""
        try:
            full_path = Path(file_path)
            if full_path.exists():
                full_path.unlink()
                logger.info("file_deleted_locally", path=file_path)
                return True
        except Exception as e:
            logger.error("file_delete_error_local", path=file_path, error=str(e))
        return False

    async def _delete_s3(self, file_url: str) -> bool:
        """Delete file from S3 storage"""
        try:
            # Extract S3 key from URL
            if self.cdn_base_url and file_url.startswith(self.cdn_base_url):
                key = file_url.replace(self.cdn_base_url + "/", "")
            elif "amazonaws.com/" in file_url:
                key = file_url.split("amazonaws.com/")[1]
            else:
                key = file_url

            self.s3_client.delete_object(Bucket=self.s3_bucket, Key=key)
            logger.info("file_deleted_s3", key=key)
            return True
        except Exception as e:
            logger.error("file_delete_error_s3", url=file_url, error=str(e))
        return False

    async def download_and_store(
        self,
        source_url: str,
        user_id: str,
        task_id: str,
        media_type: str,
        extension: str
    ) -> Optional[str]:
        """
        Download file from external URL and store locally/S3

        Args:
            source_url: External URL to download from
            user_id: User ID
            task_id: Task ID
            media_type: Type of media (image/video/audio)
            extension: File extension

        Returns:
            str: Stored file URL or path
        """
        import httpx

        try:
            async with httpx.AsyncClient(timeout=300.0) as client:
                response = await client.get(source_url)
                response.raise_for_status()

                file_content = response.content
                return await self.save_file(file_content, user_id, task_id, media_type, extension)

        except Exception as e:
            logger.error("download_and_store_error", url=source_url, error=str(e))
            return None

    def get_file_url(self, file_path: str) -> str:
        """Get public URL for a file"""
        if self.storage_type == "local":
            # For local storage, return API endpoint URL
            return f"/api/v1/media/files/{file_path}"
        elif self.storage_type == "s3":
            if self.cdn_base_url:
                return f"{self.cdn_base_url}/{file_path}"
            else:
                return f"https://{self.s3_bucket}.s3.{self.s3_region}.amazonaws.com/{file_path}"
        return file_path


# Singleton instance
_storage_service: Optional[StorageService] = None


def get_storage_service() -> StorageService:
    """Get or create storage service instance"""
    global _storage_service

    if _storage_service is None:
        # Load from environment variables
        storage_type = os.getenv("STORAGE_TYPE", "local")
        local_path = os.getenv("MEDIA_STORAGE_PATH", "./media_storage")
        s3_bucket = os.getenv("S3_BUCKET")
        s3_region = os.getenv("S3_REGION", "us-east-1")
        cdn_url = os.getenv("CDN_BASE_URL")

        _storage_service = StorageService(
            storage_type=storage_type,
            local_base_path=local_path,
            s3_bucket=s3_bucket,
            s3_region=s3_region,
            cdn_base_url=cdn_url
        )

        logger.info("storage_service_initialized", storage_type=storage_type)

    return _storage_service
