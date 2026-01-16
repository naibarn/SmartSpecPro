"""
API Key Service
Manages API key operations including validation for OpenCode Gateway
"""

import secrets
import hashlib
from typing import Optional, List, Dict, Any, Tuple
from datetime import datetime, timedelta
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_
from sqlalchemy.orm import joinedload
import structlog

from app.models.api_key import APIKey, APIKeyUsage
from app.models.user import User
from app.core.security_enhanced import TokenGenerator

logger = structlog.get_logger()


class APIKeyService:
    """Service for managing API keys"""
    
    @staticmethod
    def generate_api_key() -> tuple[str, str, str]:
        """
        Generate new API key
        
        Returns:
            (key, key_hash, key_prefix) tuple
        """
        # Generate random key with SmartSpec format
        key = TokenGenerator.generate_api_key()
        
        # Hash for storage
        key_hash = TokenGenerator.hash_token(key)
        
        # Prefix for display (first 16 chars + last 4 chars)
        key_prefix = f"{key[:16]}...{key[-4:]}"
        
        return key, key_hash, key_prefix
    
    @staticmethod
    async def validate_api_key(
        db: AsyncSession,
        raw_key: str
    ) -> Optional[Tuple[APIKey, User]]:
        """
        Validate API key from request and return key + user.
        
        This is the main validation method used by OpenCode Gateway
        to authenticate incoming requests.
        
        Args:
            db: Database session
            raw_key: Raw API key from Authorization header
        
        Returns:
            (APIKey, User) tuple if valid, None if invalid
        """
        # Check format first
        if not TokenGenerator.is_valid_api_key_format(raw_key):
            logger.warning("api_key_invalid_format", key_prefix=raw_key[:20] if raw_key else "empty")
            return None
        
        # Hash the raw key
        key_hash = TokenGenerator.hash_token(raw_key)
        
        try:
            # Find API key by hash with user relationship
            result = await db.execute(
                select(APIKey)
                .options(joinedload(APIKey.user))
                .where(APIKey.key_hash == key_hash)
            )
            api_key = result.scalar_one_or_none()
            
            if not api_key:
                logger.warning("api_key_not_found", key_hash=key_hash[:16])
                return None
            
            # Check if valid (active and not expired)
            if not api_key.is_valid():
                logger.warning(
                    "api_key_invalid",
                    key_id=str(api_key.id),
                    is_active=api_key.is_active,
                    is_expired=api_key.is_expired()
                )
                return None
            
            # Update last_used_at
            api_key.last_used_at = datetime.utcnow()
            await db.commit()
            
            logger.info(
                "api_key_validated",
                key_id=str(api_key.id),
                user_id=str(api_key.user_id),
                key_name=api_key.name
            )
            
            return (api_key, api_key.user)
            
        except Exception as e:
            logger.error("api_key_validation_error", error=str(e))
            return None
    
    @staticmethod
    async def validate_api_key_with_permission(
        db: AsyncSession,
        raw_key: str,
        endpoint: str,
        method: str
    ) -> Optional[Tuple[APIKey, User]]:
        """
        Validate API key and check permission for specific endpoint.
        
        Args:
            db: Database session
            raw_key: Raw API key from Authorization header
            endpoint: API endpoint being accessed
            method: HTTP method (GET, POST, etc.)
        
        Returns:
            (APIKey, User) tuple if valid and has permission, None otherwise
        """
        result = await APIKeyService.validate_api_key(db, raw_key)
        
        if not result:
            return None
        
        api_key, user = result
        
        # Check endpoint permission
        if not api_key.has_permission(endpoint, method):
            logger.warning(
                "api_key_permission_denied",
                key_id=str(api_key.id),
                endpoint=endpoint,
                method=method
            )
            return None
        
        return result
    
    @staticmethod
    async def create_api_key(
        db: AsyncSession,
        user: User,
        name: str,
        permissions: Optional[Dict[str, Any]] = None,
        rate_limit: int = 60,
        expires_in_days: Optional[int] = None,
        description: Optional[str] = None
    ) -> tuple[APIKey, str]:
        """
        Create new API key
        
        Args:
            db: Database session
            user: User object
            name: Key name
            permissions: Permission dict
            rate_limit: Rate limit (requests per minute)
            expires_in_days: Expiration in days (None = no expiration)
            description: Key description
        
        Returns:
            (APIKey, raw_key) tuple
        """
        # Generate key
        raw_key, key_hash, key_prefix = APIKeyService.generate_api_key()
        
        # Calculate expiration
        expires_at = None
        if expires_in_days:
            expires_at = datetime.utcnow() + timedelta(days=expires_in_days)
        
        # Default permissions for OpenCode access
        default_permissions = {
            "endpoints": [
                "/v1/opencode/*",
                "/v1/chat/*",
                "/v1/models"
            ],
            "methods": ["GET", "POST"]
        }
        
        # Create API key
        api_key = APIKey(
            user_id=user.id,
            name=name,
            key_hash=key_hash,
            key_prefix=key_prefix,
            permissions=permissions or default_permissions,
            rate_limit=rate_limit,
            expires_at=expires_at,
            description=description
        )
        
        db.add(api_key)
        await db.commit()
        await db.refresh(api_key)
        
        logger.info(
            "api_key_created",
            user_id=str(user.id),
            key_id=str(api_key.id),
            name=name,
            expires_at=expires_at.isoformat() if expires_at else None
        )
        
        return api_key, raw_key
    
    @staticmethod
    async def create_opencode_api_key(
        db: AsyncSession,
        user: User,
        name: str = "OpenCode Access",
        expires_in_days: int = 90
    ) -> tuple[APIKey, str]:
        """
        Create API key specifically for OpenCode access.
        
        This is a convenience method that creates an API key with
        appropriate permissions for OpenCode CLI/OpenWork integration.
        
        Args:
            db: Database session
            user: User object
            name: Key name (default: "OpenCode Access")
            expires_in_days: Expiration in days (default: 90)
        
        Returns:
            (APIKey, raw_key) tuple
        """
        permissions = {
            "endpoints": [
                "/v1/opencode/*",
                "/v1/chat/completions",
                "/v1/models"
            ],
            "methods": ["GET", "POST"],
            "features": ["opencode", "chat", "streaming"]
        }
        
        return await APIKeyService.create_api_key(
            db=db,
            user=user,
            name=name,
            permissions=permissions,
            rate_limit=200,  # Higher rate limit for OpenCode
            expires_in_days=expires_in_days,
            description="API key for OpenCode CLI and OpenWork integration"
        )
    
    @staticmethod
    async def get_api_key_by_hash(
        db: AsyncSession,
        key_hash: str
    ) -> Optional[APIKey]:
        """Get API key by hash"""
        result = await db.execute(
            select(APIKey).where(APIKey.key_hash == key_hash)
        )
        return result.scalar_one_or_none()
    
    @staticmethod
    async def get_api_key_by_id(
        db: AsyncSession,
        key_id: str,
        user: Optional[User] = None
    ) -> Optional[APIKey]:
        """
        Get API key by ID.
        
        Args:
            db: Database session
            key_id: API key ID
            user: Optional user to verify ownership
        
        Returns:
            APIKey if found (and owned by user if specified)
        """
        query = select(APIKey).where(APIKey.id == key_id)
        
        if user:
            query = query.where(APIKey.user_id == user.id)
        
        result = await db.execute(query)
        return result.scalar_one_or_none()
    
    @staticmethod
    async def get_user_api_keys(
        db: AsyncSession,
        user: User,
        include_inactive: bool = False
    ) -> List[APIKey]:
        """Get all API keys for user"""
        query = select(APIKey).where(APIKey.user_id == user.id)
        
        if not include_inactive:
            query = query.where(APIKey.is_active == True)
        
        result = await db.execute(query.order_by(APIKey.created_at.desc()))
        return result.scalars().all()
    
    @staticmethod
    async def update_api_key(
        db: AsyncSession,
        api_key: APIKey,
        name: Optional[str] = None,
        permissions: Optional[Dict[str, Any]] = None,
        rate_limit: Optional[int] = None,
        is_active: Optional[bool] = None,
        description: Optional[str] = None
    ) -> APIKey:
        """Update API key"""
        if name is not None:
            api_key.name = name
        if permissions is not None:
            api_key.permissions = permissions
        if rate_limit is not None:
            api_key.rate_limit = rate_limit
        if is_active is not None:
            api_key.is_active = is_active
        if description is not None:
            api_key.description = description
        
        api_key.updated_at = datetime.utcnow()
        
        await db.commit()
        await db.refresh(api_key)
        
        logger.info(
            "api_key_updated",
            key_id=str(api_key.id),
            name=api_key.name
        )
        
        return api_key
    
    @staticmethod
    async def revoke_api_key(
        db: AsyncSession,
        api_key: APIKey
    ) -> APIKey:
        """
        Revoke (deactivate) API key.
        
        This is preferred over deletion as it maintains audit trail.
        """
        api_key.is_active = False
        api_key.updated_at = datetime.utcnow()
        
        await db.commit()
        await db.refresh(api_key)
        
        logger.info(
            "api_key_revoked",
            key_id=str(api_key.id),
            name=api_key.name
        )
        
        return api_key
    
    @staticmethod
    async def delete_api_key(
        db: AsyncSession,
        api_key: APIKey
    ):
        """Delete API key permanently"""
        await db.delete(api_key)
        await db.commit()
        
        logger.info(
            "api_key_deleted",
            key_id=str(api_key.id),
            name=api_key.name
        )
    
    @staticmethod
    async def rotate_api_key(
        db: AsyncSession,
        api_key: APIKey
    ) -> tuple[APIKey, str]:
        """
        Rotate API key (generate new key, keep same ID)
        
        This method replaces the old key hash with a new one.
        The old key becomes immediately invalid since we only store hashes.
        
        Returns:
            (APIKey, new_raw_key) tuple
        """
        # Generate new key
        new_raw_key, new_key_hash, new_key_prefix = APIKeyService.generate_api_key()
        
        # Update API key (old key hash is replaced, making old key invalid)
        api_key.key_hash = new_key_hash
        api_key.key_prefix = new_key_prefix
        api_key.updated_at = datetime.utcnow()
        
        # Note: Old key is now invalid as we only store the hash
        
        await db.commit()
        await db.refresh(api_key)
        
        logger.info(
            "api_key_rotated",
            key_id=str(api_key.id),
            name=api_key.name
        )
        
        return api_key, new_raw_key
    
    @staticmethod
    async def record_usage(
        db: AsyncSession,
        api_key: APIKey,
        endpoint: str,
        method: str,
        status_code: int,
        response_time: int,
        credits_used: int = 0,
        ip_address: Optional[str] = None,
        user_agent: Optional[str] = None
    ):
        """Record API key usage"""
        usage = APIKeyUsage(
            api_key_id=api_key.id,
            endpoint=endpoint,
            method=method,
            status_code=status_code,
            response_time=response_time,
            credits_used=credits_used,
            ip_address=ip_address,
            user_agent=user_agent
        )
        
        # Update last used timestamp
        api_key.last_used_at = datetime.utcnow()
        
        db.add(usage)
        await db.commit()
    
    @staticmethod
    async def get_usage_stats(
        db: AsyncSession,
        api_key: APIKey,
        days: int = 30
    ) -> Dict[str, Any]:
        """Get usage statistics for API key"""
        since = datetime.utcnow() - timedelta(days=days)
        
        result = await db.execute(
            select(APIKeyUsage).where(
                and_(
                    APIKeyUsage.api_key_id == api_key.id,
                    APIKeyUsage.timestamp >= since
                )
            )
        )
        usage_logs = result.scalars().all()
        
        if not usage_logs:
            return {
                "total_requests": 0,
                "total_credits": 0,
                "avg_response_time": 0,
                "error_rate": 0,
                "period_days": days
            }
        
        total_requests = len(usage_logs)
        total_credits = sum(log.credits_used for log in usage_logs)
        avg_response_time = sum(log.response_time for log in usage_logs) / total_requests
        errors = sum(1 for log in usage_logs if log.status_code >= 400)
        error_rate = errors / total_requests if total_requests > 0 else 0
        
        # Group by endpoint
        by_endpoint = {}
        for log in usage_logs:
            if log.endpoint not in by_endpoint:
                by_endpoint[log.endpoint] = {"count": 0, "credits": 0}
            by_endpoint[log.endpoint]["count"] += 1
            by_endpoint[log.endpoint]["credits"] += log.credits_used
        
        return {
            "total_requests": total_requests,
            "total_credits": total_credits,
            "avg_response_time": avg_response_time,
            "error_rate": error_rate,
            "period_days": days,
            "by_endpoint": by_endpoint
        }
    
    @staticmethod
    async def check_rate_limit(
        db: AsyncSession,
        api_key: APIKey,
        window_seconds: int = 60
    ) -> Tuple[bool, Dict[str, Any]]:
        """
        Check if API key is within rate limit.
        
        Args:
            db: Database session
            api_key: API key to check
            window_seconds: Time window in seconds
        
        Returns:
            (is_allowed, rate_limit_info) tuple
        """
        since = datetime.utcnow() - timedelta(seconds=window_seconds)
        
        result = await db.execute(
            select(APIKeyUsage).where(
                and_(
                    APIKeyUsage.api_key_id == api_key.id,
                    APIKeyUsage.timestamp >= since
                )
            )
        )
        recent_requests = len(result.scalars().all())
        
        is_allowed = recent_requests < api_key.rate_limit
        remaining = max(0, api_key.rate_limit - recent_requests)
        
        return is_allowed, {
            "limit": api_key.rate_limit,
            "remaining": remaining,
            "reset_at": (datetime.utcnow() + timedelta(seconds=window_seconds)).isoformat(),
            "window_seconds": window_seconds
        }
