"""
Distributed Rate Limiter using Redis
Enhanced version with per-endpoint and per-user rate limiting
"""

import time
from typing import Optional, Dict
from dataclasses import dataclass
import structlog

logger = structlog.get_logger(__name__)


@dataclass
class RateLimitResult:
    """Result of rate limit check"""
    allowed: bool
    remaining: int
    reset_at: float
    retry_after: Optional[int] = None


# Rate limit configurations per endpoint
RATE_LIMIT_CONFIGS = {
    # Authentication endpoints - very strict
    "/api/v1/auth/login": {"max_requests": 5, "window": 300},  # 5 per 5 min
    "/api/v1/auth/register": {"max_requests": 3, "window": 3600},  # 3 per hour
    "/api/v1/auth/reset-password": {"max_requests": 3, "window": 3600},
    "/api/v1/auth/verify-email": {"max_requests": 5, "window": 300},

    # Marketplace purchase - prevent abuse
    "/api/v1/marketplace/purchase": {"max_requests": 10, "window": 60},  # 10 per min

    # Template submission - prevent spam
    "/api/v1/marketplace/templates": {"max_requests": 5, "window": 300},  # 5 per 5 min

    # Payment endpoints
    "/api/v1/payments/create": {"max_requests": 10, "window": 60},

    # API calls - generous but limited
    "/api/v1": {"max_requests": 100, "window": 60},  # 100 per min default
}


class DistributedRateLimiter:
    """
    Redis-based distributed rate limiter with fallback to memory
    """

    def __init__(self, redis_client=None):
        self.redis = redis_client
        self._redis_available = False
        self._memory_storage: Dict[str, list] = {}

        if self.redis:
            try:
                # Try sync ping for initialization
                # Note: This assumes redis client is async, adapt as needed
                self._redis_available = True
                logger.info("distributed_rate_limiter_initialized", backend="redis")
            except Exception as e:
                logger.warning("redis_unavailable_fallback", error=str(e))
        else:
            logger.info("distributed_rate_limiter_initialized", backend="memory")

    async def check_rate_limit(
        self,
        key: str,
        max_requests: int,
        window_seconds: int
    ) -> RateLimitResult:
        """
        Check rate limit using sliding window algorithm

        Args:
            key: Unique identifier (e.g., "user:123:/api/login")
            max_requests: Maximum requests allowed
            window_seconds: Time window in seconds

        Returns:
            RateLimitResult
        """
        now = time.time()
        window_start = now - window_seconds

        if self._redis_available:
            return await self._check_redis(key, max_requests, window_seconds, now, window_start)
        else:
            return self._check_memory(key, max_requests, window_seconds, now, window_start)

    async def _check_redis(
        self,
        key: str,
        max_requests: int,
        window_seconds: int,
        now: float,
        window_start: float
    ) -> RateLimitResult:
        """Redis-based rate limiting"""
        try:
            redis_key = f"rate_limit:{key}"

            # Remove expired entries
            await self.redis.zremrangebyscore(redis_key, 0, window_start)

            # Count current requests
            current_count = await self.redis.zcard(redis_key)

            if current_count >= max_requests:
                # Get oldest entry to calculate retry time
                oldest = await self.redis.zrange(redis_key, 0, 0, withscores=True)
                retry_after = window_seconds
                if oldest:
                    oldest_time = oldest[0][1]
                    retry_after = int(oldest_time + window_seconds - now)

                return RateLimitResult(
                    allowed=False,
                    remaining=0,
                    reset_at=now + window_seconds,
                    retry_after=max(1, retry_after)
                )

            # Add current request
            await self.redis.zadd(redis_key, {str(now): now})
            await self.redis.expire(redis_key, window_seconds + 60)

            remaining = max(0, max_requests - current_count - 1)

            return RateLimitResult(
                allowed=True,
                remaining=remaining,
                reset_at=now + window_seconds
            )

        except Exception as e:
            logger.error("redis_rate_limit_error", error=str(e))
            # Fail open on Redis errors
            return RateLimitResult(
                allowed=True,
                remaining=max_requests - 1,
                reset_at=now + window_seconds
            )

    def _check_memory(
        self,
        key: str,
        max_requests: int,
        window_seconds: int,
        now: float,
        window_start: float
    ) -> RateLimitResult:
        """Memory-based rate limiting (fallback)"""
        if key not in self._memory_storage:
            self._memory_storage[key] = []

        requests = self._memory_storage[key]

        # Remove expired
        requests[:] = [ts for ts in requests if ts > window_start]

        if len(requests) >= max_requests:
            oldest_time = min(requests)
            retry_after = int(oldest_time + window_seconds - now)

            return RateLimitResult(
                allowed=False,
                remaining=0,
                reset_at=now + window_seconds,
                retry_after=max(1, retry_after)
            )

        requests.append(now)
        remaining = max(0, max_requests - len(requests))

        return RateLimitResult(
            allowed=True,
            remaining=remaining,
            reset_at=now + window_seconds
        )

    def get_rate_limit_config(self, path: str) -> Optional[Dict]:
        """Get rate limit config for endpoint"""
        # Exact match
        if path in RATE_LIMIT_CONFIGS:
            return RATE_LIMIT_CONFIGS[path]

        # Prefix match
        for prefix, config in RATE_LIMIT_CONFIGS.items():
            if path.startswith(prefix):
                return config

        return None


# Global instance
_distributed_rate_limiter: Optional[DistributedRateLimiter] = None


def get_distributed_rate_limiter() -> DistributedRateLimiter:
    """Get or create distributed rate limiter"""
    global _distributed_rate_limiter

    if _distributed_rate_limiter is None:
        try:
            import redis.asyncio as redis
            from app.core.config import settings

            redis_client = redis.from_url(
                settings.REDIS_URL,
                encoding="utf-8",
                decode_responses=True
            )
            _distributed_rate_limiter = DistributedRateLimiter(redis_client)
        except Exception as e:
            logger.warning("redis_init_failed", error=str(e))
            _distributed_rate_limiter = DistributedRateLimiter(None)

    return _distributed_rate_limiter
