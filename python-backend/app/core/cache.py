"""
Caching and Performance Optimization
Redis-based caching with fallback to in-memory
"""

import json
import hashlib
from typing import Any, Optional, Callable
from datetime import timedelta
from functools import wraps
import structlog

logger = structlog.get_logger()


class CacheManager:
    """
    Cache Manager
    
    Manages caching with Redis (primary) and in-memory (fallback)
    """
    
    def __init__(self, redis_client=None):
        self.redis = redis_client
        self.memory_cache = {}
        self.default_ttl = 300  # 5 minutes
    
    async def initialize(self):
        """Initialize Redis connection"""
        try:
            import redis.asyncio as redis
            from app.core.config import settings
            
            redis_url = getattr(settings, 'REDIS_URL', 'redis://localhost:6379/0')
            self.redis = await redis.from_url(redis_url, encoding="utf-8", decode_responses=True)
            
            # Test connection
            await self.redis.ping()
            logger.info("redis_initialized", url=redis_url)
        except Exception as e:
            logger.warning("redis_initialization_failed", error=str(e))
            self.redis = None
    
    async def close(self):
        """Close Redis connection"""
        if self.redis:
            try:
                await self.redis.close()
                logger.info("redis_connection_closed")
            except Exception as e:
                logger.warning("redis_close_failed", error=str(e))
            finally:
                self.redis = None
    
    def _generate_key(self, prefix: str, *args, **kwargs) -> str:
        """Generate cache key from arguments"""
        key_data = f"{prefix}:{args}:{sorted(kwargs.items())}"
        return hashlib.md5(key_data.encode()).hexdigest()
    
    async def get(self, key: str) -> Optional[Any]:
        """Get value from cache"""
        # Try Redis first
        if self.redis:
            try:
                value = await self.redis.get(key)
                if value:
                    return json.loads(value)
            except Exception as e:
                logger.warning("redis_get_failed", error=str(e))
        
        # Fallback to memory cache
        return self.memory_cache.get(key)
    
    async def set(self, key: str, value: Any, ttl: int = None):
        """Set value in cache"""
        ttl = ttl or self.default_ttl
        
        # Try Redis first
        if self.redis:
            try:
                await self.redis.setex(
                    key,
                    ttl,
                    json.dumps(value)
                )
            except Exception as e:
                logger.warning("redis_set_failed", error=str(e))
        
        # Always set in memory cache as fallback
        self.memory_cache[key] = value
    
    async def delete(self, key: str):
        """Delete value from cache"""
        # Delete from Redis
        if self.redis:
            try:
                await self.redis.delete(key)
            except Exception as e:
                logger.warning("redis_delete_failed", error=str(e))
        
        # Delete from memory cache
        self.memory_cache.pop(key, None)
    
    async def clear(self, pattern: str = "*"):
        """Clear cache by pattern"""
        # Clear Redis
        if self.redis:
            try:
                keys = await self.redis.keys(pattern)
                if keys:
                    await self.redis.delete(*keys)
            except Exception as e:
                logger.warning("redis_clear_failed", error=str(e))
        
        # Clear memory cache
        if pattern == "*":
            self.memory_cache.clear()
        else:
            # Simple pattern matching for memory cache
            keys_to_delete = [
                k for k in self.memory_cache.keys()
                if pattern.replace("*", "") in k
            ]
            for key in keys_to_delete:
                del self.memory_cache[key]


# Global cache manager
cache_manager = CacheManager()


def cached(ttl: int = 300, key_prefix: str = "cache"):
    """
    Caching decorator
    
    Args:
        ttl: Time to live in seconds
        key_prefix: Prefix for cache key
    
    Example:
        @cached(ttl=600, key_prefix="user")
        async def get_user(user_id: str):
            return await db.get_user(user_id)
    """
    def decorator(func: Callable):
        @wraps(func)
        async def wrapper(*args, **kwargs):
            # Generate cache key
            key = cache_manager._generate_key(key_prefix, *args, **kwargs)
            
            # Try to get from cache
            cached_value = await cache_manager.get(key)
            if cached_value is not None:
                logger.debug("cache_hit", key=key, function=func.__name__)
                return cached_value
            
            # Cache miss - call function
            logger.debug("cache_miss", key=key, function=func.__name__)
            result = await func(*args, **kwargs)
            
            # Store in cache
            await cache_manager.set(key, result, ttl=ttl)
            
            return result
        
        return wrapper
    return decorator


class QueryOptimizer:
    """
    Query Optimizer
    
    Optimizes database queries
    """
    
    @staticmethod
    def batch_queries(queries: list, batch_size: int = 100):
        """Batch multiple queries"""
        for i in range(0, len(queries), batch_size):
            yield queries[i:i + batch_size]
    
    @staticmethod
    def optimize_select(query: str) -> str:
        """Add query hints for optimization"""
        # Add LIMIT if not present
        if "LIMIT" not in query.upper():
            query += " LIMIT 1000"
        
        return query


class ConnectionPool:
    """
    Connection Pool Manager
    
    Manages database connection pooling
    """
    
    def __init__(
        self,
        min_size: int = 5,
        max_size: int = 20,
        timeout: int = 30
    ):
        self.min_size = min_size
        self.max_size = max_size
        self.timeout = timeout
        self.active_connections = 0
    
    def get_pool_config(self) -> dict:
        """Get connection pool configuration"""
        return {
            "pool_size": self.min_size,
            "max_overflow": self.max_size - self.min_size,
            "pool_timeout": self.timeout,
            "pool_recycle": 3600,  # Recycle connections after 1 hour
            "pool_pre_ping": True  # Verify connections before use
        }


class ResponseCompressor:
    """
    Response Compressor
    
    Compresses API responses
    """
    
    @staticmethod
    def should_compress(content_type: str, size: int) -> bool:
        """Check if response should be compressed"""
        # Only compress text-based content
        compressible_types = [
            "application/json",
            "text/html",
            "text/plain",
            "text/css",
            "application/javascript"
        ]
        
        # Only compress if > 1KB
        return any(ct in content_type for ct in compressible_types) and size > 1024


class LazyLoader:
    """
    Lazy Loader
    
    Lazy loading for expensive operations
    """
    
    def __init__(self, loader_func: Callable):
        self.loader_func = loader_func
        self._value = None
        self._loaded = False
    
    async def get(self):
        """Get value (load if not loaded)"""
        if not self._loaded:
            self._value = await self.loader_func()
            self._loaded = True
        return self._value
    
    def reset(self):
        """Reset loader"""
        self._value = None
        self._loaded = False


class PerformanceOptimizer:
    """
    Performance Optimizer
    
    Collection of performance optimization utilities
    """
    
    @staticmethod
    def paginate(query, page: int = 1, page_size: int = 20):
        """Add pagination to query"""
        offset = (page - 1) * page_size
        return query.limit(page_size).offset(offset)
    
    @staticmethod
    def select_fields(query, fields: list):
        """Select only specific fields"""
        # Implementation depends on ORM
        return query
    
    @staticmethod
    async def parallel_fetch(tasks: list):
        """Fetch multiple items in parallel"""
        import asyncio
        return await asyncio.gather(*tasks)


# Cache configurations for different data types
CACHE_CONFIGS = {
    "user": {"ttl": 600, "prefix": "user"},  # 10 minutes
    "credits": {"ttl": 60, "prefix": "credits"},  # 1 minute
    "dashboard": {"ttl": 300, "prefix": "dashboard"},  # 5 minutes
    "payments": {"ttl": 3600, "prefix": "payments"},  # 1 hour
    "llm_models": {"ttl": 86400, "prefix": "llm_models"},  # 24 hours
}


def get_cache_config(data_type: str) -> dict:
    """Get cache configuration for data type"""
    return CACHE_CONFIGS.get(data_type, {"ttl": 300, "prefix": "default"})
