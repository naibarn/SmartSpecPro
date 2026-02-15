"""Webhook deduplication via Redis.

Prevents re-processing of webhooks that have already been handled,
using a simple SET with 24h TTL keyed by provider task ID.
"""

import structlog

logger = structlog.get_logger()

DEDUP_TTL_SECONDS = 86400  # 24 hours


class WebhookDedupService:
    """Check and store webhook dedup keys with 24h TTL."""

    def __init__(self, redis_client=None):
        self._redis = redis_client

    async def _get_redis(self):
        if self._redis is not None:
            return self._redis
        try:
            from app.core.cache import cache_manager
            return cache_manager.redis
        except Exception:
            return None

    async def is_duplicate(self, kie_job_id: str) -> bool:
        """Check if this kie_job_id has already been processed."""
        redis = await self._get_redis()
        if redis is None:
            return False
        try:
            key = f"webhook-dedup:{kie_job_id}"
            result = await redis.get(key)
            return result is not None
        except Exception as e:
            logger.warning("webhook_dedup_check_failed", error=str(e))
            return False

    async def mark_processed(self, kie_job_id: str) -> None:
        """Mark a kie_job_id as processed. Key expires after 24h."""
        redis = await self._get_redis()
        if redis is None:
            return
        try:
            key = f"webhook-dedup:{kie_job_id}"
            await redis.setex(key, DEDUP_TTL_SECONDS, "1")
        except Exception as e:
            logger.warning("webhook_dedup_mark_failed", error=str(e))
