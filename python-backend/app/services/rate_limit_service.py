"""
Rate Limit Service
Track and visualize rate limits and usage
"""

from typing import Dict, Any, List, Optional
from datetime import datetime, timedelta, timezone
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
import redis.asyncio as redis
from collections import namedtuple

from app.core.config import settings
from app.models.credit import SystemConfig

RateLimit = namedtuple("RateLimit", ["requests", "seconds"])

class RateLimitService:
    """Service for rate limit tracking and visualization"""

    def __init__(self, db_session: AsyncSession):
        self.db = db_session
        self.redis_client = None
        self._default_limits_cache: Optional[Dict[str, RateLimit]] = None

    async def _get_redis(self):
        """Get Redis client"""
        if not self.redis_client:
            self.redis_client = redis.from_url(
                settings.REDIS_URL,
                encoding="utf-8",
                decode_responses=True
            )
        return self.redis_client

    async def _get_limit_for_scope(self, scope: str) -> RateLimit:
        """Get the rate limit for a specific scope."""
        if self._default_limits_cache is None:
            self._default_limits_cache = await self._load_default_limits()
        
        return self._default_limits_cache.get(scope, RateLimit(requests=60, seconds=60)) # Default fallback

    async def _load_default_limits(self) -> Dict[str, RateLimit]:
        """Load all rate limit configurations from the database."""
        result = await self.db.execute(
            select(SystemConfig).where(SystemConfig.key.like("rate_limit_%"))
        )
        configs = result.scalars().all()
        
        limits = {}
        # Group by scope (e.g., 'default', 'llm')
        grouped_configs = {}
        for config in configs:
            parts = config.key.split("_")
            if len(parts) >= 4:
                scope = parts[2]
                metric = parts[3]
                if scope not in grouped_configs:
                    grouped_configs[scope] = {}
                grouped_configs[scope][metric] = int(config.value)

        for scope, values in grouped_configs.items():
            limits[scope] = RateLimit(
                requests=values.get("limit", 60),
                seconds=values.get("window", 60)
            )
        return limits

    async def check_rate_limit(self, user_id: str, scope: str) -> tuple[bool, int, int]:
        """
        Check if a request is within the rate limit for a given scope.

        Returns:
            A tuple of (allowed, remaining, reset_in_seconds)
        """
        redis_client = await self._get_redis()
        limit = await self._get_limit_for_scope(scope)

        key = f"rate_limit:{user_id}:{scope}"
        
        # Use a pipeline to perform atomic operations
        async with redis_client.pipeline() as pipe:
            pipe.get(key)
            results = await pipe.execute()
        current = int(results[0]) if results[0] else 0

        if current >= limit.requests:
            ttl = await redis_client.ttl(key)
            return False, 0, ttl

        # Increment and get new value
        async with redis_client.pipeline() as pipe:
            pipe.incr(key)
            pipe.expire(key, limit.seconds)
            results = await pipe.execute()
        new_count = results[0]

        remaining = max(0, limit.requests - new_count)
        ttl = await redis_client.ttl(key)

        return True, remaining, ttl

    async def get_rate_limit_status(self, user_id: str, endpoint: Optional[str] = None) -> Dict[str, Any]:
        """Get current rate limit status for a user/endpoint."""
        # Simple implementation for now to satisfy API
        limit = await self._get_limit_for_scope(endpoint or "default")
        redis_client = await self._get_redis()
        
        key = f"rate_limit:{user_id}:{endpoint or 'default'}"
        current = await redis_client.get(key)
        current = int(current) if current else 0
        ttl = await redis_client.ttl(key)
        
        return {
            "user_id": user_id,
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "rate_limits": {
                endpoint or "default": {
                    "current": current,
                    "limit": limit.requests,
                    "window_seconds": limit.seconds,
                    "reset_in_seconds": max(0, ttl),
                    "percentage": (current / limit.requests * 100) if limit.requests > 0 else 0
                }
            }
        }

    async def get_rate_limit_history(self, user_id: str, hours: int = 24) -> List[Any]:
        """Get rate limit history (Stub)."""
        return []

    async def get_global_rate_limit_stats(self, user_id: str) -> Dict[str, Any]:
        """Get global stats (Stub)."""
        return {
            "user_id": user_id,
            "total_requests_current_window": 0,
            "active_endpoints": 0,
            "top_endpoints": [],
            "timestamp": datetime.now(timezone.utc).isoformat()
        }

    async def get_api_key_rate_limits(self, api_key_id: str) -> Dict[str, Any]:
        """Get API key limits (Stub)."""
        return {
            "api_key_id": api_key_id,
            "rate_limits": {}
        }
