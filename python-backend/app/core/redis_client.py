"""
Redis client stub - provides get_redis() function
"""
from typing import Optional
from redis.asyncio import Redis

_redis_client: Optional[Redis] = None


async def get_redis() -> Optional[Redis]:
    """
    Get Redis client instance.
    Returns None if Redis is not configured or unavailable.
    """
    global _redis_client

    # Lazy initialization
    if _redis_client is None:
        try:
            from app.core.settings import settings
            if settings.REDIS_URL:
                _redis_client = Redis.from_url(
                    settings.REDIS_URL,
                    encoding="utf-8",
                    decode_responses=True
                )
                # Test connection
                await _redis_client.ping()
        except Exception as e:
            print(f"[Redis] Connection failed: {e}")
            _redis_client = None

    return _redis_client
