"""
Split Redis client for Cloud Run deployment.

- Cache client (Upstash): rate limiting, locks, dedup, flags.
  Connected via REDIS_UPSTASH_URL. Falls back to REDIS_URL for local dev.

- Realtime client (Memorystore): pub/sub, concurrency sets.
  Connected via REDIS_MEMORYSTORE_URL. Falls back to REDIS_URL for local dev.

- get_redis(): Compatibility shim that returns the cache client.
"""

import logging
import os
from typing import Optional

from redis.asyncio import Redis

logger = logging.getLogger(__name__)

_redis_client: Optional[Redis] = None
_cache_client: Optional[Redis] = None
_realtime_client: Optional[Redis] = None


# ─── URL resolution (exported for testing) ────────────────────────────────────

def _resolve_cache_url() -> Optional[str]:
    """Resolve the Redis URL for stateless/cache operations."""
    return os.getenv("REDIS_UPSTASH_URL") or os.getenv("REDIS_URL") or None


def _resolve_realtime_url() -> Optional[str]:
    """Resolve the Redis URL for connection-oriented operations."""
    return os.getenv("REDIS_MEMORYSTORE_URL") or os.getenv("REDIS_URL") or None


# ─── Cache client (Upstash or local Redis) ────────────────────────────────────

async def get_cache_redis() -> Optional[Redis]:
    """Get Upstash Redis client for stateless operations (rate limit, locks, dedup)."""
    global _cache_client
    if _cache_client is None:
        url = _resolve_cache_url()
        if url:
            try:
                _cache_client = Redis.from_url(url, encoding="utf-8", decode_responses=True)
                await _cache_client.ping()
            except Exception as e:
                logger.error("redis_cache_connection_failed", extra={"error_type": type(e).__name__})
                _cache_client = None
    return _cache_client


# ─── Realtime client (Memorystore or local Redis) ─────────────────────────────

async def get_realtime_redis() -> Optional[Redis]:
    """Get Memorystore Redis client for pub/sub and connection-oriented ops."""
    global _realtime_client
    if _realtime_client is None:
        url = _resolve_realtime_url()
        if url:
            try:
                _realtime_client = Redis.from_url(url, encoding="utf-8", decode_responses=True)
                await _realtime_client.ping()
            except Exception as e:
                logger.error("redis_realtime_connection_failed", extra={"error_type": type(e).__name__})
                _realtime_client = None
    return _realtime_client


# ─── Compatibility shim ───────────────────────────────────────────────────────

async def get_redis() -> Optional[Redis]:
    """
    Get Redis client instance (compatibility shim).
    Returns the cache client, or falls back to REDIS_URL.
    """
    global _redis_client
    if _redis_client is None:
        try:
            from app.core.settings import settings
            url = _resolve_cache_url() or (settings.REDIS_URL if hasattr(settings, "REDIS_URL") else None)
            if url:
                _redis_client = Redis.from_url(url, encoding="utf-8", decode_responses=True)
                await _redis_client.ping()
        except Exception as e:
            logger.error("redis_connection_failed", extra={"error_type": type(e).__name__})
            _redis_client = None
    return _redis_client
