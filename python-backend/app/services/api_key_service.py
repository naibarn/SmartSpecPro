"""
API Key Service
Manages API key operations
"""

import secrets
import hashlib
from typing import Optional, List, Dict, Any
from datetime import datetime, timedelta
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_
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
        # Generate random key
        key = TokenGenerator.generate_api_key()
        
        # Hash for storage
        key_hash = TokenGenerator.hash_token(key)
        
        # Prefix for display
        key_prefix = f"{key[:8]}...{key[-8:]}"
        
        return key, key_hash, key_prefix
    
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
        
        # Create API key
        api_key = APIKey(
            user_id=user.id,
            name=name,
            key_hash=key_hash,
            key_prefix=key_prefix,
            permissions=permissions or {},
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
            name=name
        )
        
        return api_key, raw_key
    
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
    async def delete_api_key(
        db: AsyncSession,
        api_key: APIKey
    ):
        """Delete API key"""
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
                "error_rate": 0
            }
        
        total_requests = len(usage_logs)
        total_credits = sum(log.credits_used for log in usage_logs)
        avg_response_time = sum(log.response_time for log in usage_logs) / total_requests
        errors = sum(1 for log in usage_logs if log.status_code >= 400)
        error_rate = errors / total_requests if total_requests > 0 else 0
        
        return {
            "total_requests": total_requests,
            "total_credits": total_credits,
            "avg_response_time": avg_response_time,
            "error_rate": error_rate,
            "period_days": days
        }
