"""
Rate Limit Service
Track and visualize rate limits and usage
"""

from typing import Dict, Any, List, Optional
from datetime import datetime, timedelta
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
            self.redis_client = await redis.from_url(
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

    async def check_rate_limit(self, user_id: str, scope: str) -> (bool, int, int):
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
