"""
Unit tests for Cache Module
"""

import pytest
from unittest.mock import Mock, AsyncMock, patch, MagicMock
from app.core.cache import (
    CacheManager,
    cached,
    QueryOptimizer,
    ConnectionPool,
    ResponseCompressor,
    LazyLoader,
    PerformanceOptimizer,
    get_cache_config,
    CACHE_CONFIGS,
    cache_manager
)


class TestCacheManager:
    """Test CacheManager class"""
    
    def test_initialization(self):
        """Test cache manager initialization"""
        manager = CacheManager()
        
        assert manager.redis is None
        assert manager.memory_cache == {}
        assert manager.default_ttl == 300
    
    def test_initialization_with_redis(self):
        """Test cache manager with Redis client"""
        redis_mock = Mock()
        manager = CacheManager(redis_client=redis_mock)
        
        assert manager.redis == redis_mock
    
    @pytest.mark.asyncio
    async def test_initialize_redis_success(self):
        """Test successful Redis initialization"""
        manager = CacheManager()
        
        with patch('app.core.cache.redis.asyncio') as mock_redis:
            mock_client = AsyncMock()
            mock_client.ping = AsyncMock(return_value=True)
            mock_redis.from_url = AsyncMock(return_value=mock_client)
            
            with patch('app.core.cache.settings') as mock_settings:
                mock_settings.REDIS_URL = 'redis://localhost:6379/0'
                await manager.initialize()
            
            assert manager.redis is not None
    
    @pytest.mark.asyncio
    async def test_initialize_redis_failure(self):
        """Test Redis initialization failure"""
        manager = CacheManager()
        
        with patch('app.core.cache.redis.asyncio') as mock_redis:
            mock_redis.from_url = AsyncMock(side_effect=Exception("Connection failed"))
            
            with patch('app.core.cache.settings'):
                await manager.initialize()
            
            assert manager.redis is None
    
    @pytest.mark.asyncio
    async def test_close_redis(self):
        """Test closing Redis connection"""
        manager = CacheManager()
        manager.redis = AsyncMock()
        manager.redis.close = AsyncMock()
        
        await manager.close()
        
        manager.redis.close.assert_called_once()
        assert manager.redis is None
    
    def test_generate_key(self):
        """Test cache key generation"""
        manager = CacheManager()
        
        key1 = manager._generate_key("prefix", "arg1", "arg2", param="value")
        key2 = manager._generate_key("prefix", "arg1", "arg2", param="value")
        key3 = manager._generate_key("prefix", "arg1", "arg3", param="value")
        
        assert key1 == key2  # Same inputs = same key
        assert key1 != key3  # Different inputs = different key
    
    @pytest.mark.asyncio
    async def test_get_from_redis(self):
        """Test getting value from Redis"""
        manager = CacheManager()
        manager.redis = AsyncMock()
        manager.redis.get = AsyncMock(return_value='{"data": "value"}')
        
        result = await manager.get("test_key")
        
        assert result == {"data": "value"}
    
    @pytest.mark.asyncio
    async def test_get_from_memory_fallback(self):
        """Test fallback to memory cache"""
        manager = CacheManager()
        manager.redis = AsyncMock()
        manager.redis.get = AsyncMock(side_effect=Exception("Redis error"))
        manager.memory_cache["test_key"] = {"data": "value"}
        
        result = await manager.get("test_key")
        
        assert result == {"data": "value"}
    
    @pytest.mark.asyncio
    async def test_get_not_found(self):
        """Test getting non-existent key"""
        manager = CacheManager()
        
        result = await manager.get("nonexistent")
        
        assert result is None
    
    @pytest.mark.asyncio
    async def test_set_in_redis(self):
        """Test setting value in Redis"""
        manager = CacheManager()
        manager.redis = AsyncMock()
        manager.redis.setex = AsyncMock()
        
        await manager.set("test_key", {"data": "value"}, ttl=60)
        
        manager.redis.setex.assert_called_once()
        assert manager.memory_cache["test_key"] == {"data": "value"}
    
    @pytest.mark.asyncio
    async def test_set_default_ttl(self):
        """Test setting value with default TTL"""
        manager = CacheManager()
        manager.redis = AsyncMock()
        manager.redis.setex = AsyncMock()
        
        await manager.set("test_key", {"data": "value"})
        
        call_args = manager.redis.setex.call_args[0]
        assert call_args[1] == 300  # default TTL
    
    @pytest.mark.asyncio
    async def test_set_memory_only(self):
        """Test setting value in memory only"""
        manager = CacheManager()
        
        await manager.set("test_key", {"data": "value"})
        
        assert manager.memory_cache["test_key"] == {"data": "value"}
    
    @pytest.mark.asyncio
    async def test_delete_from_both(self):
        """Test deleting from both Redis and memory"""
        manager = CacheManager()
        manager.redis = AsyncMock()
        manager.redis.delete = AsyncMock()
        manager.memory_cache["test_key"] = "value"
        
        await manager.delete("test_key")
        
        manager.redis.delete.assert_called_once_with("test_key")
        assert "test_key" not in manager.memory_cache
    
    @pytest.mark.asyncio
    async def test_clear_all(self):
        """Test clearing all cache"""
        manager = CacheManager()
        manager.redis = AsyncMock()
        manager.redis.keys = AsyncMock(return_value=["key1", "key2"])
        manager.redis.delete = AsyncMock()
        manager.memory_cache = {"key1": "val1", "key2": "val2"}
        
        await manager.clear("*")
        
        assert len(manager.memory_cache) == 0
    
    @pytest.mark.asyncio
    async def test_clear_by_pattern(self):
        """Test clearing cache by pattern"""
        manager = CacheManager()
        manager.memory_cache = {
            "user:123": "val1",
            "user:456": "val2",
            "post:789": "val3"
        }
        
        await manager.clear("user*")
        
        assert "post:789" in manager.memory_cache
        assert "user:123" not in manager.memory_cache


class TestCachedDecorator:
    """Test cached decorator"""
    
    @pytest.mark.asyncio
    async def test_cache_hit(self):
        """Test cache hit"""
        call_count = 0
        
        @cached(ttl=60, key_prefix="test")
        async def test_func(arg):
            nonlocal call_count
            call_count += 1
            return f"result_{arg}"
        
        # First call - cache miss
        result1 = await test_func("value")
        assert result1 == "result_value"
        assert call_count == 1
        
        # Second call - cache hit
        result2 = await test_func("value")
        assert result2 == "result_value"
        assert call_count == 1  # Function not called again
    
    @pytest.mark.asyncio
    async def test_cache_miss_different_args(self):
        """Test cache miss with different arguments"""
        call_count = 0
        
        @cached(ttl=60, key_prefix="test")
        async def test_func(arg):
            nonlocal call_count
            call_count += 1
            return f"result_{arg}"
        
        result1 = await test_func("value1")
        result2 = await test_func("value2")
        
        assert result1 == "result_value1"
        assert result2 == "result_value2"
        assert call_count == 2


class TestQueryOptimizer:
    """Test QueryOptimizer class"""
    
    def test_batch_queries(self):
        """Test batching queries"""
        queries = list(range(250))
        
        batches = list(QueryOptimizer.batch_queries(queries, batch_size=100))
        
        assert len(batches) == 3
        assert len(batches[0]) == 100
        assert len(batches[1]) == 100
        assert len(batches[2]) == 50
    
    def test_optimize_select_adds_limit(self):
        """Test adding LIMIT to query"""
        query = "SELECT * FROM users"
        
        optimized = QueryOptimizer.optimize_select(query)
        
        assert "LIMIT" in optimized
        assert "1000" in optimized
    
    def test_optimize_select_preserves_existing_limit(self):
        """Test preserving existing LIMIT"""
        query = "SELECT * FROM users LIMIT 50"
        
        optimized = QueryOptimizer.optimize_select(query)
        
        # Should not add another LIMIT
        assert optimized.count("LIMIT") == 1


class TestConnectionPool:
    """Test ConnectionPool class"""
    
    def test_initialization(self):
        """Test connection pool initialization"""
        pool = ConnectionPool(min_size=10, max_size=50, timeout=60)
        
        assert pool.min_size == 10
        assert pool.max_size == 50
        assert pool.timeout == 60
    
    def test_default_values(self):
        """Test default pool values"""
        pool = ConnectionPool()
        
        assert pool.min_size == 5
        assert pool.max_size == 20
        assert pool.timeout == 30
    
    def test_get_pool_config(self):
        """Test getting pool configuration"""
        pool = ConnectionPool(min_size=10, max_size=30)
        
        config = pool.get_pool_config()
        
        assert config["pool_size"] == 10
        assert config["max_overflow"] == 20
        assert config["pool_timeout"] == 30
        assert config["pool_pre_ping"] is True


class TestResponseCompressor:
    """Test ResponseCompressor class"""
    
    def test_should_compress_json(self):
        """Test compression for JSON"""
        result = ResponseCompressor.should_compress("application/json", 2048)
        
        assert result is True
    
    def test_should_compress_html(self):
        """Test compression for HTML"""
        result = ResponseCompressor.should_compress("text/html", 2048)
        
        assert result is True
    
    def test_should_not_compress_small_content(self):
        """Test no compression for small content"""
        result = ResponseCompressor.should_compress("application/json", 512)
        
        assert result is False
    
    def test_should_not_compress_binary(self):
        """Test no compression for binary content"""
        result = ResponseCompressor.should_compress("image/png", 10240)
        
        assert result is False


class TestLazyLoader:
    """Test LazyLoader class"""
    
    @pytest.mark.asyncio
    async def test_lazy_loading(self):
        """Test lazy loading"""
        call_count = 0
        
        async def loader():
            nonlocal call_count
            call_count += 1
            return "loaded_value"
        
        lazy = LazyLoader(loader)
        
        # Not loaded yet
        assert lazy._loaded is False
        
        # First get - loads value
        value1 = await lazy.get()
        assert value1 == "loaded_value"
        assert call_count == 1
        
        # Second get - uses cached value
        value2 = await lazy.get()
        assert value2 == "loaded_value"
        assert call_count == 1  # Not called again
    
    @pytest.mark.asyncio
    async def test_reset(self):
        """Test resetting lazy loader"""
        async def loader():
            return "value"
        
        lazy = LazyLoader(loader)
        
        await lazy.get()
        assert lazy._loaded is True
        
        lazy.reset()
        
        assert lazy._loaded is False
        assert lazy._value is None


class TestPerformanceOptimizer:
    """Test PerformanceOptimizer class"""
    
    def test_paginate_first_page(self):
        """Test pagination first page"""
        query = Mock()
        query.limit = Mock(return_value=query)
        query.offset = Mock(return_value=query)
        
        result = PerformanceOptimizer.paginate(query, page=1, page_size=20)
        
        query.limit.assert_called_with(20)
        query.offset.assert_called_with(0)
    
    def test_paginate_second_page(self):
        """Test pagination second page"""
        query = Mock()
        query.limit = Mock(return_value=query)
        query.offset = Mock(return_value=query)
        
        result = PerformanceOptimizer.paginate(query, page=2, page_size=20)
        
        query.offset.assert_called_with(20)
    
    @pytest.mark.asyncio
    async def test_parallel_fetch(self):
        """Test parallel fetching"""
        async def task1():
            return "result1"
        
        async def task2():
            return "result2"
        
        results = await PerformanceOptimizer.parallel_fetch([task1(), task2()])
        
        assert results == ["result1", "result2"]


class TestCacheConfigs:
    """Test cache configurations"""
    
    def test_cache_configs_exist(self):
        """Test cache configs are defined"""
        assert "user" in CACHE_CONFIGS
        assert "credits" in CACHE_CONFIGS
        assert "dashboard" in CACHE_CONFIGS
    
    def test_get_cache_config_existing(self):
        """Test getting existing cache config"""
        config = get_cache_config("user")
        
        assert config["ttl"] == 600
        assert config["prefix"] == "user"
    
    def test_get_cache_config_default(self):
        """Test getting default cache config"""
        config = get_cache_config("nonexistent")
        
        assert config["ttl"] == 300
        assert config["prefix"] == "default"


class TestGlobalCacheManager:
    """Test global cache manager instance"""
    
    def test_cache_manager_exists(self):
        """Test global cache manager exists"""
        assert cache_manager is not None
        assert isinstance(cache_manager, CacheManager)
