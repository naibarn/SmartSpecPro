"""
Final Unit tests for Rate Limit Service (Renamed to avoid conflicts)
"""

import pytest
from unittest.mock import Mock, AsyncMock, patch, MagicMock
from app.services.rate_limit_service import RateLimitService, RateLimit
from app.models.credit import SystemConfig

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
        assert rl_core_service_instance.redis_client is None
        assert rl_core_service_instance._default_limits_cache is None

    async def test_get_redis_lazy_loading(self, rl_core_service_instance):
        """Test lazy loading of Redis client"""
        with patch("app.services.rate_limit_service.redis.from_url") as mock_from_url:
            mock_client = AsyncMock()
            mock_from_url.return_value = mock_client
            
            # First call should create client
            client1 = await rl_core_service_instance._get_redis()
            assert client1 == mock_client
            mock_from_url.assert_called_once()
            
            # Second call should return cached client
            client2 = await rl_core_service_instance._get_redis()
            assert client2 == mock_client
            mock_from_url.assert_called_once() # Still called only once

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
        # Mock Redis
        mock_redis = AsyncMock()
        rl_core_service_instance._get_redis = AsyncMock(return_value=mock_redis)
        
        # Mock limit
        rl_core_service_instance._get_limit_for_scope = AsyncMock(return_value=RateLimit(10, 60))
        
        # Mock get current count (first pipeline)
        # pipeline enter return value
        mock_pipe = AsyncMock()
        mock_redis.pipeline.return_value.__aenter__.return_value = mock_pipe
        
        # First execution (get) returns e.g. 5
        # Second execution (incr/expire) returns new count e.g. 6
        mock_pipe.execute.side_effect = [[5], [6]]
        
        mock_redis.ttl.return_value = 50

        allowed, remaining, ttl = await rl_core_service_instance.check_rate_limit("user1", "api")

        assert allowed is True
        assert remaining == 4 # 10 - 6
        assert ttl == 50
        
        # Verify first pipeline calls
        assert mock_pipe.get.call_count == 1
        
        # Verify second pipeline calls
        assert mock_pipe.incr.call_count == 1
        assert mock_pipe.expire.call_count == 1

    async def test_check_rate_limit_exceeded(self, rl_core_service_instance):
        """Test request exceeded limit denied"""
        mock_redis = AsyncMock()
        rl_core_service_instance._get_redis = AsyncMock(return_value=mock_redis)
        rl_core_service_instance._get_limit_for_scope = AsyncMock(return_value=RateLimit(10, 60))
        
        # Current count is 10 (at limit)
        mock_pipe = AsyncMock()
        mock_redis.pipeline.return_value.__aenter__.return_value = mock_pipe
        mock_pipe.execute.side_effect = [[10]] # First execution
        
        mock_redis.ttl.return_value = 30

        allowed, remaining, ttl = await rl_core_service_instance.check_rate_limit("user1", "api")

        assert allowed is False
        assert remaining == 0
        assert ttl == 30
        
        # Verify no increment called
        mock_pipe.incr.assert_not_called()

    async def test_check_rate_limit_first_request(self, rl_core_service_instance):
        """Test first request (key doesn't exist)"""
        mock_redis = AsyncMock()
        rl_core_service_instance._get_redis = AsyncMock(return_value=mock_redis)
        rl_core_service_instance._get_limit_for_scope = AsyncMock(return_value=RateLimit(10, 60))
        
        mock_pipe = AsyncMock()
        mock_redis.pipeline.return_value.__aenter__.return_value = mock_pipe
        mock_pipe.execute.side_effect = [[None], [1]] # None for get, 1 for incr
        
        mock_redis.ttl.return_value = 60

        allowed, remaining, ttl = await rl_core_service_instance.check_rate_limit("user1", "api")

        assert allowed is True
        assert remaining == 9
