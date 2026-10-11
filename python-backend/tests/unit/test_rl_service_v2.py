"""
Final Unit tests for Rate Limit Service (Renamed to avoid conflicts)
"""

from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.models.credit import SystemConfig
from app.services.postgres_rate_limit import SlidingWindowDecision
from app.services.rate_limit_service import RateLimit, RateLimitService


@pytest.fixture
def rl_core_db_mock():
    """Unique mock DB fixture"""
    return AsyncMock()

@pytest.fixture
def rl_core_service_instance(rl_core_db_mock):
    """Unique service instance fixture"""
    return RateLimitService(rl_core_db_mock)

class TestRLServiceUnique:
    """Test RateLimitService class with unique name"""

    async def test_initialization(self, rl_core_service_instance, rl_core_db_mock):
        """Test service initialization"""
        assert rl_core_service_instance.db == rl_core_db_mock
        assert rl_core_service_instance._default_limits_cache is None

    async def test_get_redis_lazy_loading(self, rl_core_service_instance):
        """Rate checks delegate to the shared PostgreSQL sliding-window store."""
        rl_core_service_instance._get_limit_for_scope = AsyncMock(return_value=RateLimit(10, 60))
        decision = SlidingWindowDecision(True, count=1, remaining=9, retry_after_seconds=0)
        with patch("app.services.rate_limit_service.consume_sliding_window", new=AsyncMock(return_value=decision)) as consume:
            assert await rl_core_service_instance.check_rate_limit("user1", "api") == (True, 9, 0)
        consume.assert_awaited_once_with("python-rate-limit", "api\0user1", 10, 60)

    async def test_load_default_limits(self, rl_core_service_instance, rl_core_db_mock):
        """Test loading defaults from DB"""
        # Mock DB result
        mock_result = MagicMock()
        mock_result.scalars().all.return_value = [
            SystemConfig(key="rate_limit_default_limit", value="100"),
            SystemConfig(key="rate_limit_default_window", value="60"),
            SystemConfig(key="rate_limit_llm_limit", value="50"),
            SystemConfig(key="rate_limit_llm_window", value="3600")
        ]
        rl_core_db_mock.execute.return_value = mock_result

        limits = await rl_core_service_instance._load_default_limits()

        assert "default" in limits
        assert limits["default"].requests == 100
        assert limits["default"].seconds == 60
        assert "llm" in limits
        assert limits["llm"].requests == 50
        assert limits["llm"].seconds == 3600

    async def test_load_default_limits_malformed_key(self, rl_core_service_instance, rl_core_db_mock):
        """Test loading defaults skips malformed keys"""
        mock_result = MagicMock()
        mock_result.scalars().all.return_value = [
            SystemConfig(key="rate_limit_short", value="100"), # Too short
        ]
        rl_core_db_mock.execute.return_value = mock_result

        limits = await rl_core_service_instance._load_default_limits()
        assert len(limits) == 0

    async def test_get_limit_for_scope_cached(self, rl_core_service_instance):
        """Test getting limit uses cache"""
        rl_core_service_instance._default_limits_cache = {
            "test": RateLimit(requests=10, seconds=10)
        }
        
        limit = await rl_core_service_instance._get_limit_for_scope("test")
        assert limit == RateLimit(requests=10, seconds=10)

    async def test_get_limit_for_scope_fallback(self, rl_core_service_instance):
        """Test getting limit falls back to default if not found"""
        rl_core_service_instance._default_limits_cache = {}
        
        limit = await rl_core_service_instance._get_limit_for_scope("unknown")
        assert limit == RateLimit(requests=60, seconds=60)

    async def test_get_limit_for_scope_loads_db(self, rl_core_service_instance):
        """Test getting limit loads from DB if cache is None"""
        rl_core_service_instance._load_default_limits = AsyncMock(return_value={
            "db_scope": RateLimit(requests=20, seconds=20)
        })
        
        limit = await rl_core_service_instance._get_limit_for_scope("db_scope")
        
        rl_core_service_instance._load_default_limits.assert_called_once()
        assert limit == RateLimit(requests=20, seconds=20)

    async def test_check_rate_limit_below_limit(self, rl_core_service_instance):
        """Test request below limit allowed"""
        rl_core_service_instance._get_limit_for_scope = AsyncMock(return_value=RateLimit(10, 60))
        decision = SlidingWindowDecision(True, count=6, remaining=4, retry_after_seconds=0)
        with patch("app.services.rate_limit_service.consume_sliding_window", new=AsyncMock(return_value=decision)) as consume:
            allowed, remaining, ttl = await rl_core_service_instance.check_rate_limit("user1", "api")

        assert allowed is True
        assert remaining == 4 # 10 - 6
        assert ttl == 0
        consume.assert_awaited_once_with("python-rate-limit", "api\0user1", 10, 60)

    async def test_check_rate_limit_exceeded(self, rl_core_service_instance):
        """Test request exceeded limit denied"""
        rl_core_service_instance._get_limit_for_scope = AsyncMock(return_value=RateLimit(10, 60))
        decision = SlidingWindowDecision(False, count=10, remaining=0, retry_after_seconds=30)
        with patch("app.services.rate_limit_service.consume_sliding_window", new=AsyncMock(return_value=decision)) as consume:
            allowed, remaining, ttl = await rl_core_service_instance.check_rate_limit("user1", "api")

        assert allowed is False
        assert remaining == 0
        assert ttl == 30
        
        consume.assert_awaited_once_with("python-rate-limit", "api\0user1", 10, 60)

    async def test_check_rate_limit_first_request(self, rl_core_service_instance):
        """Test first request (key doesn't exist)"""
        rl_core_service_instance._get_limit_for_scope = AsyncMock(return_value=RateLimit(10, 60))
        decision = SlidingWindowDecision(True, count=1, remaining=9, retry_after_seconds=0)
        with patch("app.services.rate_limit_service.consume_sliding_window", new=AsyncMock(return_value=decision)) as consume:
            allowed, remaining, ttl = await rl_core_service_instance.check_rate_limit("user1", "api")

        assert allowed is True
        assert remaining == 9
        assert ttl == 0
        consume.assert_awaited_once_with("python-rate-limit", "api\0user1", 10, 60)
