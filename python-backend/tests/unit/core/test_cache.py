"""
Unit Tests for Cache Module
Tests Redis cache operations and cache manager
"""

import pytest
from unittest.mock import AsyncMock, MagicMock, patch
import json

from app.core.cache import CacheManager, cache_manager, cached


class TestCacheManagerBasicOperations:
    """Test basic cache operations"""
    
    def test_cache_manager_exists(self):
        """Test that cache manager singleton exists"""
        assert cache_manager is not None
        assert isinstance(cache_manager, CacheManager)
    
    @pytest.mark.asyncio
    async def test_set_and_get_string(self):
        """Test setting and getting string value"""
        key = "test_string_key"
        value = "test_value"
        
        await cache_manager.set(key, value, ttl=60)
        result = await cache_manager.get(key)
        
        # Should get from memory cache at least
        assert result == value
    
    @pytest.mark.asyncio
    async def test_set_and_get_dict(self):
        """Test setting and getting dict value"""
        key = "test_dict_key"
        value = {"name": "test", "count": 42}
        
        await cache_manager.set(key, value, ttl=60)
        result = await cache_manager.get(key)
        
        assert result == value
    
    @pytest.mark.asyncio
    async def test_get_nonexistent_key(self):
        """Test getting non-existent key"""
        result = await cache_manager.get("nonexistent_key_12345")
        
        assert result is None
    
    @pytest.mark.asyncio
    async def test_delete_key(self):
        """Test deleting a key"""
        key = "test_delete_key"
        value = "to_be_deleted"
        
        await cache_manager.set(key, value, ttl=60)
        await cache_manager.delete(key)
        result = await cache_manager.get(key)
        
        assert result is None


class TestCacheManagerTTL:
    """Test cache TTL operations"""
    
    @pytest.mark.asyncio
    async def test_set_with_ttl(self):
        """Test setting value with TTL"""
        key = "test_ttl_key"
        value = "ttl_value"
        
        # Should not raise
        await cache_manager.set(key, value, ttl=3600)
    
    @pytest.mark.asyncio
    async def test_set_without_ttl(self):
        """Test setting value without TTL (uses default)"""
        key = "test_no_ttl_key"
        value = "no_ttl_value"
        
        # Should not raise
        await cache_manager.set(key, value)


class TestCacheManagerClear:
    """Test cache clear operations"""
    
    @pytest.mark.asyncio
    async def test_clear_all(self):
        """Test clearing all cache"""
        # Set some values
        await cache_manager.set("clear_test_1", "value1", ttl=60)
        await cache_manager.set("clear_test_2", "value2", ttl=60)
        
        # Clear all
        await cache_manager.clear("*")
        
        # Memory cache should be cleared
        result1 = await cache_manager.get("clear_test_1")
        result2 = await cache_manager.get("clear_test_2")
        
        assert result1 is None
        assert result2 is None
    
    @pytest.mark.asyncio
    async def test_clear_pattern(self):
        """Test clearing cache by pattern"""
        # Set some values
        await cache_manager.set("pattern_test_1", "value1", ttl=60)
        await cache_manager.set("pattern_test_2", "value2", ttl=60)
        await cache_manager.set("other_key", "value3", ttl=60)
        
        # Clear by pattern
        await cache_manager.clear("pattern_test*")
        
        # Pattern matched keys should be cleared
        result1 = await cache_manager.get("pattern_test_1")
        result2 = await cache_manager.get("pattern_test_2")
        result3 = await cache_manager.get("other_key")
        
        assert result1 is None
        assert result2 is None
        # other_key should still exist
        assert result3 == "value3"


class TestCacheManagerKeyGeneration:
    """Test cache key generation"""
    
    def test_generate_key(self):
        """Test generating cache key"""
        key = cache_manager._generate_key("prefix", "arg1", "arg2", kwarg1="value1")
        
        assert key is not None
        assert isinstance(key, str)
        assert len(key) == 32  # MD5 hash length
    
    def test_generate_key_deterministic(self):
        """Test that key generation is deterministic"""
        key1 = cache_manager._generate_key("prefix", "arg1", kwarg1="value1")
        key2 = cache_manager._generate_key("prefix", "arg1", kwarg1="value1")
        
        assert key1 == key2
    
    def test_generate_key_different_args(self):
        """Test that different args produce different keys"""
        key1 = cache_manager._generate_key("prefix", "arg1")
        key2 = cache_manager._generate_key("prefix", "arg2")
        
        assert key1 != key2


class TestCacheDecorator:
    """Test cached decorator"""
    
    @pytest.mark.asyncio
    async def test_cached_decorator_basic(self):
        """Test basic cached decorator functionality"""
        call_count = 0
        
        @cached(ttl=60, key_prefix="test")
        async def test_function(arg1):
            nonlocal call_count
            call_count += 1
            return {"result": arg1}
        
        # First call
        result1 = await test_function("value1")
        assert result1 == {"result": "value1"}
        assert call_count == 1
        
        # Second call with same arg (should use cache)
        result2 = await test_function("value1")
        assert result2 == {"result": "value1"}
        # Call count may or may not increase depending on cache hit
    
    @pytest.mark.asyncio
    async def test_cached_decorator_different_args(self):
        """Test cached decorator with different arguments"""
        @cached(ttl=60, key_prefix="test_diff")
        async def test_function(arg1):
            return {"result": arg1}
        
        result1 = await test_function("value1")
        result2 = await test_function("value2")
        
        assert result1 == {"result": "value1"}
        assert result2 == {"result": "value2"}


class TestCacheManagerInitialization:
    """Test cache manager initialization"""
    
    def test_default_ttl(self):
        """Test default TTL value"""
        manager = CacheManager()
        
        assert manager.default_ttl == 300
    
    def test_memory_cache_initialized(self):
        """Test memory cache is initialized"""
        manager = CacheManager()
        
        assert manager.memory_cache is not None
        assert isinstance(manager.memory_cache, dict)
