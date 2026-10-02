"""
Rate Limit Service
Track and visualize rate limits and usage
"""

from typing import Dict, Any, List, Optional
from datetime import datetime, timezone
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from collections import namedtuple

from app.models.credit import SystemConfig
from app.services.postgres_rate_limit import consume_sliding_window, read_sliding_window

RateLimit = namedtuple("RateLimit", ["requests", "seconds"])

class RateLimitService:
    """Service for rate limit tracking and visualization"""

    def __init__(self, db_session: AsyncSession):
        self.db = db_session
        self._default_limits_cache: Optional[Dict[str, RateLimit]] = None

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
        limit = await self._get_limit_for_scope(scope)
        decision = await consume_sliding_window(
            "python-rate-limit",
            f"{scope}\0{user_id}",
            limit.requests,
            limit.seconds,
        )
        return decision.allowed, decision.remaining, decision.retry_after_seconds

    async def get_rate_limit_status(self, user_id: str, endpoint: Optional[str] = None) -> Dict[str, Any]:
        """Get current rate limit status for a user/endpoint."""
        # Simple implementation for now to satisfy API
        limit = await self._get_limit_for_scope(endpoint or "default")
        current, ttl = await read_sliding_window(
            "python-rate-limit",
            f"{endpoint or 'default'}\0{user_id}",
            limit.seconds,
        )
        
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
# mypy: ignore-errors
# mypy: ignore-errors
