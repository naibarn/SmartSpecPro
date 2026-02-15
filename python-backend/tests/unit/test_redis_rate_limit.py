"""
Tests for the Python-side Redis rate limiting and split Redis client configuration.
"""

import os
import time
from unittest.mock import AsyncMock, MagicMock, patch

import pytest


class TestPythonRedisClients:
    """Verify the Python Redis client adapter correctly routes operations."""

    def test_cache_client_uses_upstash_url(self):
        """Cache operations use REDIS_UPSTASH_URL."""
        from app.core.redis_client import _resolve_cache_url

        env = {"REDIS_UPSTASH_URL": "rediss://upstash:6379", "REDIS_URL": "redis://local:6379"}
        with patch.dict(os.environ, env, clear=False):
            url = _resolve_cache_url()
            assert url == "rediss://upstash:6379"

    def test_cache_client_falls_back_to_redis_url(self):
        """Falls back to REDIS_URL when REDIS_UPSTASH_URL not set."""
        from app.core.redis_client import _resolve_cache_url

        cleared = {"REDIS_UPSTASH_URL": ""}
        env = {"REDIS_URL": "redis://local:6379"}
        with patch.dict(os.environ, {**env, **cleared}, clear=False):
            url = _resolve_cache_url()
            assert url == "redis://local:6379"

    def test_realtime_client_uses_memorystore_url(self):
        """Realtime operations use REDIS_MEMORYSTORE_URL."""
        from app.core.redis_client import _resolve_realtime_url

        env = {"REDIS_MEMORYSTORE_URL": "redis://10.0.0.5:6379", "REDIS_URL": "redis://local:6379"}
        with patch.dict(os.environ, env, clear=False):
            url = _resolve_realtime_url()
            assert url == "redis://10.0.0.5:6379"

    def test_realtime_client_falls_back_to_redis_url(self):
        """Falls back to REDIS_URL when REDIS_MEMORYSTORE_URL not set."""
        from app.core.redis_client import _resolve_realtime_url

        cleared = {"REDIS_MEMORYSTORE_URL": ""}
        env = {"REDIS_URL": "redis://local:6379"}
        with patch.dict(os.environ, {**env, **cleared}, clear=False):
            url = _resolve_realtime_url()
            assert url == "redis://local:6379"


class TestPythonRateLimiting:
    """Rate limiting via distributed_rate_limiter.py."""

    @pytest.mark.asyncio
    async def test_request_within_limit_is_allowed(self):
        """Requests under the threshold should return allowed=True."""
        from app.core.distributed_rate_limiter import DistributedRateLimiter

        mock_redis = AsyncMock()
        mock_redis.zremrangebyscore = AsyncMock(return_value=0)
        mock_redis.zcard = AsyncMock(return_value=2)
        mock_redis.zadd = AsyncMock(return_value=1)
        mock_redis.expire = AsyncMock(return_value=1)

        limiter = DistributedRateLimiter(redis_client=mock_redis)
        result = await limiter.check_rate_limit("test:key", max_requests=5, window_seconds=60)

        assert result.allowed is True
        assert result.remaining == 2  # 5 - 2 - 1

    @pytest.mark.asyncio
    async def test_request_over_limit_returns_blocked(self):
        """Exceeding the limit should return allowed=False with retry_after."""
        from app.core.distributed_rate_limiter import DistributedRateLimiter

        now = time.time()
        mock_redis = AsyncMock()
        mock_redis.zremrangebyscore = AsyncMock(return_value=0)
        mock_redis.zcard = AsyncMock(return_value=5)
        mock_redis.zrange = AsyncMock(return_value=[(str(now - 30), now - 30)])

        limiter = DistributedRateLimiter(redis_client=mock_redis)
        result = await limiter.check_rate_limit("test:key", max_requests=5, window_seconds=60)

        assert result.allowed is False
        assert result.retry_after is not None
        assert result.retry_after > 0

    @pytest.mark.asyncio
    async def test_fails_open_when_redis_unavailable(self):
        """When Redis is unreachable, requests are allowed (fail-open)."""
        from app.core.distributed_rate_limiter import DistributedRateLimiter

        # No redis client (None)
        limiter = DistributedRateLimiter(redis_client=None)
        result = await limiter.check_rate_limit("test:key", max_requests=5, window_seconds=60)

        # Should use memory fallback and allow
        assert result.allowed is True

    def test_uses_upstash_url_for_rate_limiting(self):
        """get_distributed_rate_limiter uses REDIS_UPSTASH_URL when available."""
        import importlib
        import redis.asyncio as redis_mod

        env = {"REDIS_UPSTASH_URL": "rediss://upstash:6379"}
        with patch.dict(os.environ, env, clear=False):
            with patch.object(redis_mod, "from_url") as mock_from_url:
                mock_client = MagicMock()
                mock_from_url.return_value = mock_client

                # Reset the singleton
                import app.core.distributed_rate_limiter as drl
                drl._distributed_rate_limiter = None
                limiter = drl.get_distributed_rate_limiter()
                # Restore
                drl._distributed_rate_limiter = None

                # Should use the upstash URL
                mock_from_url.assert_called_once()
                call_url = mock_from_url.call_args[0][0]
                assert "upstash" in call_url
