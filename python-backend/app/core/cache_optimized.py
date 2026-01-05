"""
SmartSpec Pro - Optimized Caching Layer
Priority 5: Performance Optimization

Features:
- Multi-tier caching (L1: Memory, L2: Redis)
- Cache warming and preloading
- Automatic cache invalidation
- Cache compression for large values
- Circuit breaker pattern for Redis failures
- Cache statistics and monitoring
"""

import json
import hashlib
import gzip
import pickle
from typing import Any, Optional, Callable, TypeVar, Generic, Dict, List, Set
from datetime import datetime, timedelta
from functools import wraps
from enum import Enum
from dataclasses import dataclass, field
from collections import OrderedDict
import asyncio
import structlog

logger = structlog.get_logger()

T = TypeVar('T')


class CacheLevel(Enum):
    """Cache storage levels"""
    L1_MEMORY = "memory"
    L2_REDIS = "redis"
    ALL = "all"


class CircuitState(Enum):
    """Circuit breaker states"""
    CLOSED = "closed"  # Normal operation
    OPEN = "open"      # Failing, skip Redis
    HALF_OPEN = "half_open"  # Testing recovery


@dataclass
class CacheStats:
    """Cache statistics"""
    hits: int = 0
    misses: int = 0
    l1_hits: int = 0
    l2_hits: int = 0
    writes: int = 0
    deletes: int = 0
    errors: int = 0
    compressed_writes: int = 0
    
    @property
    def hit_rate(self) -> float:
        total = self.hits + self.misses
        return self.hits / total if total > 0 else 0.0
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            "hits": self.hits,
            "misses": self.misses,
            "l1_hits": self.l1_hits,
            "l2_hits": self.l2_hits,
            "writes": self.writes,
            "deletes": self.deletes,
            "errors": self.errors,
            "hit_rate": round(self.hit_rate * 100, 2),
            "compressed_writes": self.compressed_writes,
        }


@dataclass
class CacheEntry:
    """Cache entry with metadata"""
    value: Any
    created_at: datetime
    ttl: int
    access_count: int = 0
    last_accessed: datetime = field(default_factory=datetime.utcnow)
    compressed: bool = False
    
    @property
    def is_expired(self) -> bool:
        if self.ttl <= 0:
            return False
        return datetime.utcnow() > self.created_at + timedelta(seconds=self.ttl)
    
    def touch(self):
        self.access_count += 1
        self.last_accessed = datetime.utcnow()


class LRUCache:
    """
    Thread-safe LRU cache for L1 memory caching
    """
    
    def __init__(self, max_size: int = 1000):
        self.max_size = max_size
        self._cache: OrderedDict[str, CacheEntry] = OrderedDict()
        self._lock = asyncio.Lock()
    
    async def get(self, key: str) -> Optional[CacheEntry]:
        async with self._lock:
            if key not in self._cache:
                return None
            
            entry = self._cache[key]
            
            # Check expiration
            if entry.is_expired:
                del self._cache[key]
                return None
            
            # Move to end (most recently used)
            self._cache.move_to_end(key)
            entry.touch()
            
            return entry
    
    async def set(self, key: str, entry: CacheEntry):
        async with self._lock:
            # Remove oldest if at capacity
            while len(self._cache) >= self.max_size:
                self._cache.popitem(last=False)
            
            self._cache[key] = entry
    
    async def delete(self, key: str) -> bool:
        async with self._lock:
            if key in self._cache:
                del self._cache[key]
                return True
            return False
    
    async def clear(self, pattern: Optional[str] = None):
        async with self._lock:
            if pattern is None or pattern == "*":
                self._cache.clear()
            else:
                # Simple pattern matching
                pattern_prefix = pattern.rstrip("*")
                keys_to_delete = [
                    k for k in self._cache.keys()
                    if k.startswith(pattern_prefix)
                ]
                for key in keys_to_delete:
                    del self._cache[key]
    
    def size(self) -> int:
        return len(self._cache)


class CircuitBreaker:
    """
    Circuit breaker for Redis connection failures
    """
    
    def __init__(
        self,
        failure_threshold: int = 5,
        recovery_timeout: int = 30,
        half_open_requests: int = 3
    ):
        self.failure_threshold = failure_threshold
        self.recovery_timeout = recovery_timeout
        self.half_open_requests = half_open_requests
        
        self.state = CircuitState.CLOSED
        self.failure_count = 0
        self.success_count = 0
        self.last_failure_time: Optional[datetime] = None
    
    def record_success(self):
        if self.state == CircuitState.HALF_OPEN:
            self.success_count += 1
            if self.success_count >= self.half_open_requests:
                self._close()
        elif self.state == CircuitState.CLOSED:
            self.failure_count = 0
    
    def record_failure(self):
        self.failure_count += 1
        self.last_failure_time = datetime.utcnow()
        
        if self.state == CircuitState.HALF_OPEN:
            self._open()
        elif self.failure_count >= self.failure_threshold:
            self._open()
    
    def can_execute(self) -> bool:
        if self.state == CircuitState.CLOSED:
            return True
        
        if self.state == CircuitState.OPEN:
            if self._should_attempt_recovery():
                self._half_open()
                return True
            return False
        
        # HALF_OPEN
        return True
    
    def _should_attempt_recovery(self) -> bool:
        if self.last_failure_time is None:
            return True
        return datetime.utcnow() > self.last_failure_time + timedelta(seconds=self.recovery_timeout)
    
    def _open(self):
        self.state = CircuitState.OPEN
        logger.warning("circuit_breaker_opened", failure_count=self.failure_count)
    
    def _close(self):
        self.state = CircuitState.CLOSED
        self.failure_count = 0
        self.success_count = 0
        logger.info("circuit_breaker_closed")
    
    def _half_open(self):
        self.state = CircuitState.HALF_OPEN
        self.success_count = 0
        logger.info("circuit_breaker_half_open")


class OptimizedCacheManager:
    """
    Optimized Cache Manager with multi-tier caching
    """
    
    # Compression threshold (bytes)
    COMPRESSION_THRESHOLD = 1024
    
    # Default TTLs by data type
    DEFAULT_TTLS = {
        "user": 600,        # 10 minutes
        "session": 3600,    # 1 hour
        "config": 86400,    # 24 hours
        "llm_response": 300,  # 5 minutes
        "workflow": 1800,   # 30 minutes
        "memory": 3600,     # 1 hour
        "default": 300,     # 5 minutes
    }
    
    def __init__(
        self,
        l1_max_size: int = 1000,
        enable_compression: bool = True,
        redis_client=None
    ):
        self.l1_cache = LRUCache(max_size=l1_max_size)
        self.redis = redis_client
        self.enable_compression = enable_compression
        self.circuit_breaker = CircuitBreaker()
        self.stats = CacheStats()
        self._initialized = False
    
    async def initialize(self):
        """Initialize Redis connection"""
        if self._initialized:
            return
        
        try:
            import redis.asyncio as redis
            from app.core.config import settings
            
            redis_url = getattr(settings, 'REDIS_URL', 'redis://localhost:6379/0')
            self.redis = await redis.from_url(
                redis_url,
                encoding="utf-8",
                decode_responses=False,  # We handle encoding ourselves
                socket_timeout=5.0,
                socket_connect_timeout=5.0,
            )
            
            # Test connection
            await self.redis.ping()
            self._initialized = True
            logger.info("redis_cache_initialized", url=redis_url)
            
        except Exception as e:
            logger.warning("redis_cache_initialization_failed", error=str(e))
            self.redis = None
    
    async def close(self):
        """Close Redis connection"""
        if self.redis:
            try:
                await self.redis.close()
                logger.info("redis_cache_closed", stats=self.stats.to_dict())
            except Exception as e:
                logger.warning("redis_close_failed", error=str(e))
            finally:
                self.redis = None
                self._initialized = False
    
    def _generate_key(self, prefix: str, *args, **kwargs) -> str:
        """Generate cache key from arguments"""
        key_data = f"{prefix}:{args}:{sorted(kwargs.items())}"
        return f"smartspec:{hashlib.md5(key_data.encode()).hexdigest()}"
    
    def _serialize(self, value: Any) -> bytes:
        """Serialize value for storage"""
        data = pickle.dumps(value)
        
        # Compress if large enough
        if self.enable_compression and len(data) > self.COMPRESSION_THRESHOLD:
            compressed = gzip.compress(data)
            if len(compressed) < len(data):
                return b"GZIP:" + compressed
        
        return b"RAW:" + data
    
    def _deserialize(self, data: bytes) -> Any:
        """Deserialize value from storage"""
        if data.startswith(b"GZIP:"):
            data = gzip.decompress(data[5:])
        elif data.startswith(b"RAW:"):
            data = data[4:]
        
        return pickle.loads(data)
    
    async def get(
        self,
        key: str,
        level: CacheLevel = CacheLevel.ALL
    ) -> Optional[Any]:
        """Get value from cache"""
        
        # Try L1 first
        if level in (CacheLevel.L1_MEMORY, CacheLevel.ALL):
            entry = await self.l1_cache.get(key)
            if entry is not None:
                self.stats.hits += 1
                self.stats.l1_hits += 1
                return entry.value
        
        # Try L2 (Redis)
        if level in (CacheLevel.L2_REDIS, CacheLevel.ALL):
            if self.redis and self.circuit_breaker.can_execute():
                try:
                    data = await self.redis.get(key)
                    if data:
                        value = self._deserialize(data)
                        self.circuit_breaker.record_success()
                        self.stats.hits += 1
                        self.stats.l2_hits += 1
                        
                        # Promote to L1
                        if level == CacheLevel.ALL:
                            ttl = await self.redis.ttl(key)
                            await self.l1_cache.set(key, CacheEntry(
                                value=value,
                                created_at=datetime.utcnow(),
                                ttl=ttl if ttl > 0 else 300
                            ))
                        
                        return value
                        
                except Exception as e:
                    self.circuit_breaker.record_failure()
                    self.stats.errors += 1
                    logger.warning("redis_get_failed", error=str(e))
        
        self.stats.misses += 1
        return None
    
    async def set(
        self,
        key: str,
        value: Any,
        ttl: Optional[int] = None,
        level: CacheLevel = CacheLevel.ALL,
        data_type: str = "default"
    ):
        """Set value in cache"""
        ttl = ttl or self.DEFAULT_TTLS.get(data_type, self.DEFAULT_TTLS["default"])
        
        entry = CacheEntry(
            value=value,
            created_at=datetime.utcnow(),
            ttl=ttl
        )
        
        # Set in L1
        if level in (CacheLevel.L1_MEMORY, CacheLevel.ALL):
            await self.l1_cache.set(key, entry)
        
        # Set in L2 (Redis)
        if level in (CacheLevel.L2_REDIS, CacheLevel.ALL):
            if self.redis and self.circuit_breaker.can_execute():
                try:
                    serialized = self._serialize(value)
                    await self.redis.setex(key, ttl, serialized)
                    self.circuit_breaker.record_success()
                    
                    if serialized.startswith(b"GZIP:"):
                        self.stats.compressed_writes += 1
                        
                except Exception as e:
                    self.circuit_breaker.record_failure()
                    self.stats.errors += 1
                    logger.warning("redis_set_failed", error=str(e))
        
        self.stats.writes += 1
    
    async def delete(self, key: str, level: CacheLevel = CacheLevel.ALL):
        """Delete value from cache"""
        
        # Delete from L1
        if level in (CacheLevel.L1_MEMORY, CacheLevel.ALL):
            await self.l1_cache.delete(key)
        
        # Delete from L2
        if level in (CacheLevel.L2_REDIS, CacheLevel.ALL):
            if self.redis and self.circuit_breaker.can_execute():
                try:
                    await self.redis.delete(key)
                    self.circuit_breaker.record_success()
                except Exception as e:
                    self.circuit_breaker.record_failure()
                    self.stats.errors += 1
                    logger.warning("redis_delete_failed", error=str(e))
        
        self.stats.deletes += 1
    
    async def clear(self, pattern: str = "*", level: CacheLevel = CacheLevel.ALL):
        """Clear cache by pattern"""
        
        # Clear L1
        if level in (CacheLevel.L1_MEMORY, CacheLevel.ALL):
            await self.l1_cache.clear(pattern)
        
        # Clear L2
        if level in (CacheLevel.L2_REDIS, CacheLevel.ALL):
            if self.redis and self.circuit_breaker.can_execute():
                try:
                    if pattern == "*":
                        pattern = "smartspec:*"
                    keys = await self.redis.keys(pattern)
                    if keys:
                        await self.redis.delete(*keys)
                    self.circuit_breaker.record_success()
                except Exception as e:
                    self.circuit_breaker.record_failure()
                    self.stats.errors += 1
                    logger.warning("redis_clear_failed", error=str(e))
    
    async def get_or_set(
        self,
        key: str,
        factory: Callable,
        ttl: Optional[int] = None,
        data_type: str = "default"
    ) -> Any:
        """Get from cache or compute and store"""
        value = await self.get(key)
        
        if value is not None:
            return value
        
        # Compute value
        if asyncio.iscoroutinefunction(factory):
            value = await factory()
        else:
            value = factory()
        
        # Store in cache
        await self.set(key, value, ttl=ttl, data_type=data_type)
        
        return value
    
    async def invalidate_tags(self, tags: List[str]):
        """Invalidate all cache entries with given tags"""
        for tag in tags:
            await self.clear(f"smartspec:tag:{tag}:*")
    
    def get_stats(self) -> Dict[str, Any]:
        """Get cache statistics"""
        return {
            **self.stats.to_dict(),
            "l1_size": self.l1_cache.size(),
            "circuit_breaker_state": self.circuit_breaker.state.value,
            "redis_available": self.redis is not None and self._initialized,
        }


# Global cache manager instance
cache_manager = OptimizedCacheManager()


def cached(
    ttl: Optional[int] = None,
    key_prefix: str = "cache",
    data_type: str = "default",
    level: CacheLevel = CacheLevel.ALL
):
    """
    Caching decorator with advanced options
    
    Args:
        ttl: Time to live in seconds (uses default for data_type if not specified)
        key_prefix: Prefix for cache key
        data_type: Type of data for default TTL selection
        level: Cache level to use
    
    Example:
        @cached(ttl=600, key_prefix="user", data_type="user")
        async def get_user(user_id: str):
            return await db.get_user(user_id)
    """
    def decorator(func: Callable):
        @wraps(func)
        async def wrapper(*args, **kwargs):
            # Generate cache key
            key = cache_manager._generate_key(key_prefix, func.__name__, *args, **kwargs)
            
            # Try to get from cache
            cached_value = await cache_manager.get(key, level=level)
            if cached_value is not None:
                logger.debug("cache_hit", key=key[:50], function=func.__name__)
                return cached_value
            
            # Cache miss - call function
            logger.debug("cache_miss", key=key[:50], function=func.__name__)
            result = await func(*args, **kwargs)
            
            # Store in cache
            await cache_manager.set(key, result, ttl=ttl, level=level, data_type=data_type)
            
            return result
        
        # Add cache invalidation method
        async def invalidate(*args, **kwargs):
            key = cache_manager._generate_key(key_prefix, func.__name__, *args, **kwargs)
            await cache_manager.delete(key, level=level)
        
        wrapper.invalidate = invalidate
        
        return wrapper
    return decorator


def cache_aside(
    ttl: Optional[int] = None,
    key_prefix: str = "cache",
    data_type: str = "default"
):
    """
    Cache-aside pattern decorator
    
    Automatically handles cache invalidation on write operations
    """
    def decorator(func: Callable):
        @wraps(func)
        async def wrapper(*args, **kwargs):
            key = cache_manager._generate_key(key_prefix, func.__name__, *args, **kwargs)
            
            # Execute function
            result = await func(*args, **kwargs)
            
            # Invalidate cache after write
            await cache_manager.delete(key)
            
            return result
        
        return wrapper
    return decorator


# Cache warming utilities
class CacheWarmer:
    """
    Utility for warming cache with frequently accessed data
    """
    
    def __init__(self, cache: OptimizedCacheManager):
        self.cache = cache
        self._warmup_tasks: List[Callable] = []
    
    def register(self, func: Callable, *args, **kwargs):
        """Register a function for cache warming"""
        self._warmup_tasks.append((func, args, kwargs))
    
    async def warm(self):
        """Execute all registered warmup tasks"""
        logger.info("cache_warming_started", task_count=len(self._warmup_tasks))
        
        for func, args, kwargs in self._warmup_tasks:
            try:
                await func(*args, **kwargs)
            except Exception as e:
                logger.warning("cache_warming_task_failed", 
                            function=func.__name__, error=str(e))
        
        logger.info("cache_warming_completed")


# Global cache warmer
cache_warmer = CacheWarmer(cache_manager)
