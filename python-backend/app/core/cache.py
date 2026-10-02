"""Caching and performance helpers backed by PostgreSQL ephemeral state."""

import hashlib
from typing import Any, Optional, Callable
from datetime import timedelta
from functools import wraps
import structlog
from app.services.postgres_ephemeral_store import (
    delete_namespace,
    delete_value,
    put_value,
    read_value,
    take_value,
)

logger = structlog.get_logger()


class CacheManager:
    """Shared TTL cache stored in the PostgreSQL ephemeral-state table."""

    _namespace = "application_cache"

    def __init__(self):
        self.memory_cache = {}
        self.default_ttl = 300  # 5 minutes

    async def initialize(self):
        """Retained as a no-op lifecycle hook for app startup compatibility."""

    async def close(self):
        """PostgreSQL connections are managed by the shared database pool."""

    def _generate_key(self, prefix: str, *args, **kwargs) -> str:
        """Generate cache key from arguments"""
        key_data = f"{prefix}:{args}:{sorted(kwargs.items())}"
        return hashlib.sha256(key_data.encode()).hexdigest()
    
    async def get(self, key: str) -> Optional[Any]:
        """Read a live cached value from PostgreSQL."""
        try:
            value = await read_value(self._namespace, key)
            if value is not None:
                self.memory_cache[key] = value
            return value
        except Exception as exc:
            logger.warning("postgres_cache_read_failed", error_type=type(exc).__name__)
            return self.memory_cache.get(key)

    async def take(self, key: str) -> Optional[Any]:
        """Atomically read and remove a one-time cached value."""
        value = await take_value(self._namespace, key)
        self.memory_cache.pop(key, None)
        return value
    
    async def set(self, key: str, value: Any, ttl: int = None):
        """Set value in cache"""
        ttl = ttl or self.default_ttl
        
        try:
            await put_value(self._namespace, key, value, ttl)
        except Exception as exc:
            logger.warning("postgres_cache_write_failed", error_type=type(exc).__name__)
        self.memory_cache[key] = value
    
    async def delete(self, key: str):
        """Delete value from cache"""
        try:
            await delete_value(self._namespace, key)
        except Exception as exc:
            logger.warning("postgres_cache_delete_failed", error_type=type(exc).__name__)
        self.memory_cache.pop(key, None)
    
    async def clear(self, pattern: str = "*"):
        """Clear cache by pattern"""
        if pattern == "*":
            try:
                await delete_namespace(self._namespace)
            except Exception as exc:
                logger.warning("postgres_cache_clear_failed", error_type=type(exc).__name__)
            self.memory_cache.clear()
        else:
            keys_to_delete = [
                k for k in self.memory_cache.keys()
                if pattern.replace("*", "") in k
            ]
            for key in keys_to_delete:
                try:
                    await delete_value(self._namespace, key)
                except Exception as exc:
                    logger.warning("postgres_cache_delete_failed", error_type=type(exc).__name__)
                self.memory_cache.pop(key, None)


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
# mypy: ignore-errors
