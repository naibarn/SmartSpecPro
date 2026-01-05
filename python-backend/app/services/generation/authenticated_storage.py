"""
SmartSpec Pro - Authenticated Storage Service
R2 Storage with API Key authentication and usage tracking.
"""

import asyncio
from datetime import datetime
from typing import Any, Dict, List, Optional, Tuple
from uuid import uuid4

import structlog
from sqlalchemy.ext.asyncio import AsyncSession

from app.services.generation.r2_storage import (
    R2StorageService,
    StoragePath,
    get_r2_storage,
)
from app.services.generation.key_service import (
    KeyManagementService,
    get_key_management_service,
)

logger = structlog.get_logger()


# =============================================================================
# STORAGE QUOTA LIMITS
# =============================================================================

class StorageQuota:
    """Storage quota configuration."""
    
    # Default quotas by plan
    FREE_STORAGE_MB = 100
    PRO_STORAGE_MB = 5000
    ENTERPRISE_STORAGE_MB = 50000
    
    # File size limits
    MAX_IMAGE_SIZE_MB = 10
    MAX_VIDEO_SIZE_MB = 500
    MAX_AUDIO_SIZE_MB = 50
    
    # Rate limits
    MAX_UPLOADS_PER_MINUTE = 10
    MAX_DOWNLOADS_PER_MINUTE = 100


# =============================================================================
# STORAGE USAGE TRACKING
# =============================================================================

class StorageUsageTracker:
    """
    Tracks storage usage per user/API key.
    
    In production, this should use Redis or database.
    """
    
    def __init__(self):
        # In-memory tracking (use Redis/DB in production)
        self._usage: Dict[str, Dict[str, Any]] = {}
        self._rate_limits: Dict[str, List[datetime]] = {}
    
    def get_usage(self, user_id: str) -> Dict[str, Any]:
        """Get storage usage for a user."""
        if user_id not in self._usage:
            self._usage[user_id] = {
                "total_bytes": 0,
                "file_count": 0,
                "images_count": 0,
                "videos_count": 0,
                "audio_count": 0,
                "last_updated": datetime.utcnow(),
            }
        return self._usage[user_id]
    
    def add_file(
        self,
        user_id: str,
        file_size: int,
        file_type: str,
    ):
        """Record a new file upload."""
        usage = self.get_usage(user_id)
        usage["total_bytes"] += file_size
        usage["file_count"] += 1
        
        if file_type == "image":
            usage["images_count"] += 1
        elif file_type == "video":
            usage["videos_count"] += 1
        elif file_type == "audio":
            usage["audio_count"] += 1
        
        usage["last_updated"] = datetime.utcnow()
    
    def remove_file(
        self,
        user_id: str,
        file_size: int,
        file_type: str,
    ):
        """Record a file deletion."""
        usage = self.get_usage(user_id)
        usage["total_bytes"] = max(0, usage["total_bytes"] - file_size)
        usage["file_count"] = max(0, usage["file_count"] - 1)
        
        if file_type == "image":
            usage["images_count"] = max(0, usage["images_count"] - 1)
        elif file_type == "video":
            usage["videos_count"] = max(0, usage["videos_count"] - 1)
        elif file_type == "audio":
            usage["audio_count"] = max(0, usage["audio_count"] - 1)
        
        usage["last_updated"] = datetime.utcnow()
    
    def check_rate_limit(self, key: str, limit: int, window_seconds: int = 60) -> bool:
        """Check if rate limit is exceeded."""
        now = datetime.utcnow()
        
        if key not in self._rate_limits:
            self._rate_limits[key] = []
        
        # Remove old entries
        cutoff = now.timestamp() - window_seconds
        self._rate_limits[key] = [
            t for t in self._rate_limits[key]
            if t.timestamp() > cutoff
        ]
        
        if len(self._rate_limits[key]) >= limit:
            return False
        
        self._rate_limits[key].append(now)
        return True


# =============================================================================
# AUTHENTICATED STORAGE SERVICE
# =============================================================================

class AuthenticatedStorageService:
    """
    R2 Storage service with API key authentication.
    
    Features:
    - API key validation before operations
    - Usage tracking per user/key
    - Rate limiting
    - Quota enforcement
    """
    
    def __init__(
        self,
        session: AsyncSession,
        r2_storage: Optional[R2StorageService] = None,
    ):
        self.session = session
        self.r2_storage = r2_storage or get_r2_storage()
        self.key_service = get_key_management_service(session)
        self.usage_tracker = StorageUsageTracker()
    
    # =========================================================================
    # AUTHENTICATION
    # =========================================================================
    
    async def validate_api_key(
        self,
        api_key: str,
        required_scope: str = "storage:write",
        ip_address: Optional[str] = None,
        user_agent: Optional[str] = None,
    ) -> Optional[Dict[str, Any]]:
        """
        Validate API key for storage operations.
        
        Args:
            api_key: The API key to validate
            required_scope: Required scope (storage:read, storage:write, storage:delete)
            ip_address: Client IP for logging
            user_agent: Client user agent for logging
            
        Returns:
            Validated key info or None if invalid
        """
        result = await self.key_service.validate_key(
            api_key=api_key,
            required_scope=required_scope,
            ip_address=ip_address,
            user_agent=user_agent,
        )
        
        if not result:
            logger.warning(
                "Storage API key validation failed",
                ip_address=ip_address,
            )
            return None
        
        return result
    
    # =========================================================================
    # AUTHENTICATED UPLOAD
    # =========================================================================
    
    async def upload_file(
        self,
        api_key: str,
        file_path: str,
        key: str,
        content_type: Optional[str] = None,
        metadata: Optional[Dict[str, str]] = None,
        ip_address: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Upload a file with API key authentication.
        
        Args:
            api_key: API key for authentication
            file_path: Path to the local file
            key: Storage key (path in R2)
            content_type: MIME type
            metadata: Additional metadata
            ip_address: Client IP
            
        Returns:
            Upload result with URL and usage info
        """
        # Validate API key
        key_info = await self.validate_api_key(
            api_key,
            required_scope="storage:write",
            ip_address=ip_address,
        )
        
        if not key_info:
            return {"error": "invalid_api_key", "message": "Invalid or expired API key"}
        
        user_id = key_info["user_id"]
        
        # Check rate limit
        rate_key = f"upload:{user_id}"
        if not self.usage_tracker.check_rate_limit(
            rate_key,
            StorageQuota.MAX_UPLOADS_PER_MINUTE,
        ):
            return {"error": "rate_limited", "message": "Upload rate limit exceeded"}
        
        # Get file size
        import os
        file_size = os.path.getsize(file_path)
        
        # Check file size limits
        file_type = self._get_file_type(key)
        max_size = self._get_max_file_size(file_type)
        
        if file_size > max_size:
            return {
                "error": "file_too_large",
                "message": f"File exceeds maximum size of {max_size // (1024*1024)}MB",
            }
        
        # Check quota
        usage = self.usage_tracker.get_usage(user_id)
        quota = self._get_user_quota(user_id)
        
        if usage["total_bytes"] + file_size > quota:
            return {
                "error": "quota_exceeded",
                "message": "Storage quota exceeded",
                "usage_bytes": usage["total_bytes"],
                "quota_bytes": quota,
            }
        
        # Add user metadata
        metadata = metadata or {}
        metadata["user_id"] = user_id
        metadata["api_key_id"] = key_info["id"]
        metadata["uploaded_at"] = datetime.utcnow().isoformat()
        
        # Upload to R2
        try:
            url = await self.r2_storage.upload_file(
                file_path,
                key,
                content_type=content_type,
                metadata=metadata,
            )
            
            # Track usage
            self.usage_tracker.add_file(user_id, file_size, file_type)
            
            logger.info(
                "Authenticated file upload",
                user_id=user_id,
                key=key,
                size=file_size,
            )
            
            return {
                "success": True,
                "url": url,
                "key": key,
                "size": file_size,
                "content_type": content_type,
            }
            
        except Exception as e:
            logger.error("Upload failed", error=str(e))
            return {"error": "upload_failed", "message": str(e)}
    
    async def upload_bytes(
        self,
        api_key: str,
        data: bytes,
        key: str,
        content_type: str = "application/octet-stream",
        metadata: Optional[Dict[str, str]] = None,
        ip_address: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Upload bytes with API key authentication.
        """
        # Validate API key
        key_info = await self.validate_api_key(
            api_key,
            required_scope="storage:write",
            ip_address=ip_address,
        )
        
        if not key_info:
            return {"error": "invalid_api_key", "message": "Invalid or expired API key"}
        
        user_id = key_info["user_id"]
        
        # Check rate limit
        rate_key = f"upload:{user_id}"
        if not self.usage_tracker.check_rate_limit(
            rate_key,
            StorageQuota.MAX_UPLOADS_PER_MINUTE,
        ):
            return {"error": "rate_limited", "message": "Upload rate limit exceeded"}
        
        file_size = len(data)
        file_type = self._get_file_type(key)
        
        # Check file size limits
        max_size = self._get_max_file_size(file_type)
        if file_size > max_size:
            return {
                "error": "file_too_large",
                "message": f"File exceeds maximum size of {max_size // (1024*1024)}MB",
            }
        
        # Check quota
        usage = self.usage_tracker.get_usage(user_id)
        quota = self._get_user_quota(user_id)
        
        if usage["total_bytes"] + file_size > quota:
            return {
                "error": "quota_exceeded",
                "message": "Storage quota exceeded",
            }
        
        # Add metadata
        metadata = metadata or {}
        metadata["user_id"] = user_id
        metadata["api_key_id"] = key_info["id"]
        
        # Upload
        try:
            url = await self.r2_storage.upload_bytes(
                data,
                key,
                content_type=content_type,
                metadata=metadata,
            )
            
            self.usage_tracker.add_file(user_id, file_size, file_type)
            
            return {
                "success": True,
                "url": url,
                "key": key,
                "size": file_size,
            }
            
        except Exception as e:
            return {"error": "upload_failed", "message": str(e)}
    
    async def upload_from_url(
        self,
        api_key: str,
        source_url: str,
        key: str,
        content_type: Optional[str] = None,
        metadata: Optional[Dict[str, str]] = None,
        ip_address: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Download from URL and upload to R2 with authentication.
        """
        # Validate API key
        key_info = await self.validate_api_key(
            api_key,
            required_scope="storage:write",
            ip_address=ip_address,
        )
        
        if not key_info:
            return {"error": "invalid_api_key", "message": "Invalid or expired API key"}
        
        user_id = key_info["user_id"]
        
        # Check rate limit
        rate_key = f"upload:{user_id}"
        if not self.usage_tracker.check_rate_limit(
            rate_key,
            StorageQuota.MAX_UPLOADS_PER_MINUTE,
        ):
            return {"error": "rate_limited", "message": "Upload rate limit exceeded"}
        
        # Add metadata
        metadata = metadata or {}
        metadata["user_id"] = user_id
        metadata["source_url"] = source_url
        
        try:
            url = await self.r2_storage.upload_from_url(
                source_url,
                key,
                content_type=content_type,
                metadata=metadata,
            )
            
            # Estimate file size (we don't know exact size without downloading first)
            file_type = self._get_file_type(key)
            estimated_size = 1024 * 1024  # 1MB estimate
            self.usage_tracker.add_file(user_id, estimated_size, file_type)
            
            return {
                "success": True,
                "url": url,
                "key": key,
            }
            
        except Exception as e:
            return {"error": "upload_failed", "message": str(e)}
    
    # =========================================================================
    # AUTHENTICATED DOWNLOAD
    # =========================================================================
    
    async def download_bytes(
        self,
        api_key: str,
        key: str,
        ip_address: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Download file bytes with API key authentication.
        """
        # Validate API key
        key_info = await self.validate_api_key(
            api_key,
            required_scope="storage:read",
            ip_address=ip_address,
        )
        
        if not key_info:
            return {"error": "invalid_api_key", "message": "Invalid or expired API key"}
        
        user_id = key_info["user_id"]
        
        # Check rate limit
        rate_key = f"download:{user_id}"
        if not self.usage_tracker.check_rate_limit(
            rate_key,
            StorageQuota.MAX_DOWNLOADS_PER_MINUTE,
        ):
            return {"error": "rate_limited", "message": "Download rate limit exceeded"}
        
        try:
            data = await self.r2_storage.download_bytes(key)
            
            return {
                "success": True,
                "data": data,
                "size": len(data),
            }
            
        except Exception as e:
            return {"error": "download_failed", "message": str(e)}
    
    async def generate_presigned_url(
        self,
        api_key: str,
        key: str,
        expires_in: int = 3600,
        method: str = "get_object",
        ip_address: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Generate presigned URL with API key authentication.
        """
        # Validate API key
        required_scope = "storage:read" if method == "get_object" else "storage:write"
        key_info = await self.validate_api_key(
            api_key,
            required_scope=required_scope,
            ip_address=ip_address,
        )
        
        if not key_info:
            return {"error": "invalid_api_key", "message": "Invalid or expired API key"}
        
        try:
            url = await self.r2_storage.generate_presigned_url(
                key,
                expires_in=expires_in,
                method=method,
            )
            
            return {
                "success": True,
                "url": url,
                "expires_in": expires_in,
            }
            
        except Exception as e:
            return {"error": "presign_failed", "message": str(e)}
    
    # =========================================================================
    # AUTHENTICATED DELETE
    # =========================================================================
    
    async def delete_file(
        self,
        api_key: str,
        key: str,
        ip_address: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Delete a file with API key authentication.
        """
        # Validate API key
        key_info = await self.validate_api_key(
            api_key,
            required_scope="storage:delete",
            ip_address=ip_address,
        )
        
        if not key_info:
            return {"error": "invalid_api_key", "message": "Invalid or expired API key"}
        
        user_id = key_info["user_id"]
        
        try:
            # Get file info before deleting
            file_type = self._get_file_type(key)
            
            success = await self.r2_storage.delete_file(key)
            
            if success:
                # Update usage (estimate size)
                self.usage_tracker.remove_file(user_id, 0, file_type)
            
            return {
                "success": success,
                "key": key,
            }
            
        except Exception as e:
            return {"error": "delete_failed", "message": str(e)}
    
    # =========================================================================
    # USAGE INFO
    # =========================================================================
    
    async def get_usage_info(
        self,
        api_key: str,
        ip_address: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Get storage usage information for the authenticated user.
        """
        key_info = await self.validate_api_key(
            api_key,
            required_scope="storage:read",
            ip_address=ip_address,
        )
        
        if not key_info:
            return {"error": "invalid_api_key", "message": "Invalid or expired API key"}
        
        user_id = key_info["user_id"]
        usage = self.usage_tracker.get_usage(user_id)
        quota = self._get_user_quota(user_id)
        
        return {
            "success": True,
            "usage": {
                "total_bytes": usage["total_bytes"],
                "total_mb": round(usage["total_bytes"] / (1024 * 1024), 2),
                "file_count": usage["file_count"],
                "images_count": usage["images_count"],
                "videos_count": usage["videos_count"],
                "audio_count": usage["audio_count"],
            },
            "quota": {
                "total_bytes": quota,
                "total_mb": round(quota / (1024 * 1024), 2),
            },
            "usage_percent": round((usage["total_bytes"] / quota) * 100, 2) if quota > 0 else 0,
        }
    
    # =========================================================================
    # HELPERS
    # =========================================================================
    
    def _get_file_type(self, key: str) -> str:
        """Determine file type from key."""
        if key.startswith("images/") or any(key.endswith(ext) for ext in [".png", ".jpg", ".jpeg", ".webp", ".gif"]):
            return "image"
        elif key.startswith("videos/") or any(key.endswith(ext) for ext in [".mp4", ".webm", ".mov"]):
            return "video"
        elif key.startswith("audio/") or any(key.endswith(ext) for ext in [".mp3", ".wav", ".ogg"]):
            return "audio"
        return "other"
    
    def _get_max_file_size(self, file_type: str) -> int:
        """Get maximum file size for type in bytes."""
        if file_type == "image":
            return StorageQuota.MAX_IMAGE_SIZE_MB * 1024 * 1024
        elif file_type == "video":
            return StorageQuota.MAX_VIDEO_SIZE_MB * 1024 * 1024
        elif file_type == "audio":
            return StorageQuota.MAX_AUDIO_SIZE_MB * 1024 * 1024
        return StorageQuota.MAX_IMAGE_SIZE_MB * 1024 * 1024
    
    def _get_user_quota(self, user_id: str) -> int:
        """Get storage quota for user in bytes."""
        # TODO: Get from user's subscription plan
        return StorageQuota.PRO_STORAGE_MB * 1024 * 1024


# =============================================================================
# FACTORY FUNCTION
# =============================================================================

def get_authenticated_storage(session: AsyncSession) -> AuthenticatedStorageService:
    """Get authenticated storage service instance."""
    return AuthenticatedStorageService(session)
