"""Cross-instance API rate limiting backed by PostgreSQL."""

from dataclasses import dataclass
from typing import Optional, Dict

import structlog

from app.services.postgres_rate_limit import consume_sliding_window

logger = structlog.get_logger(__name__)


@dataclass
class RateLimitResult:
    """Result of a distributed rate-limit check."""

    allowed: bool
    remaining: int
    reset_at: float
    retry_after: Optional[int] = None


RATE_LIMIT_CONFIGS = {
    "/api/v1/auth/login": {"max_requests": 5, "window": 300},
    "/api/v1/auth/register": {"max_requests": 3, "window": 3600},
    "/api/v1/auth/reset-password": {"max_requests": 3, "window": 3600},
    "/api/v1/auth/verify-email": {"max_requests": 5, "window": 300},
    "/api/v1/marketplace/purchase": {"max_requests": 10, "window": 60},
    "/api/v1/marketplace/templates": {"max_requests": 5, "window": 300},
    "/api/v1/payments/create": {"max_requests": 10, "window": 60},
    "/api/v1": {"max_requests": 100, "window": 60},
}


class DistributedRateLimiter:
    """PostgreSQL-backed sliding-window limiter."""

    async def check_rate_limit(
        self,
        key: str,
        max_requests: int,
        window_seconds: int,
    ) -> RateLimitResult:
        try:
            decision = await consume_sliding_window(
                "python_api_rate_limit",
                key,
                max_requests,
                window_seconds,
            )
        except Exception as exc:
            logger.error("postgres_rate_limit_error", error_type=type(exc).__name__)
            return RateLimitResult(
                allowed=True,
                remaining=max_requests - 1,
                reset_at=0,
            )

        return RateLimitResult(
            allowed=decision.allowed,
            remaining=decision.remaining,
            reset_at=0,
            retry_after=decision.retry_after_seconds or None,
        )

    def get_rate_limit_config(self, path: str) -> Optional[Dict]:
        """Get the most specific configured endpoint limit."""
        if path in RATE_LIMIT_CONFIGS:
            return RATE_LIMIT_CONFIGS[path]
        for prefix, config in RATE_LIMIT_CONFIGS.items():
            if path.startswith(prefix):
                return config
        return None


_distributed_rate_limiter: Optional[DistributedRateLimiter] = None


def get_distributed_rate_limiter() -> DistributedRateLimiter:
    """Return the process-local adapter for the shared PostgreSQL limiter."""
    global _distributed_rate_limiter
    if _distributed_rate_limiter is None:
        _distributed_rate_limiter = DistributedRateLimiter()
    return _distributed_rate_limiter
