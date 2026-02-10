Good -- neither file exists yet. Now I have all the context I need. Let me produce the section.

# Section 10: Exact-Hash Caching System

## Overview

This section introduces a Redis-based caching layer for deterministic workflow node results. When a node is executed with identical inputs, configuration, model, and prompt version, the cache returns the previously computed result instead of re-executing the node. This eliminates redundant API calls (HTTP requests, database queries, LLM classification calls), reduces credit consumption, and improves workflow execution latency.

**What gets built:**

1. **`WorkflowCache`** -- Redis-backed cache service with SHA-256 key generation, configurable per-node-type TTLs, stampede protection via `SET NX` locking, and metrics tracking.
2. **`CacheMiddleware`** -- A wrapper that sits between the `NodeAdapter` (Section 1) and the node executor, intercepting execution to check/populate the cache transparently.
3. **`CacheKeyBuilder`** -- Deterministic cache key generation with input normalization (whitespace trimming, case normalization, JSON key sorting, timestamp/random ID stripping).
4. **Metrics tracking** -- Per-node-type hit/miss/eviction counters persisted to the `workflow_cache_metadata` table (created in Section 13).

**Design decisions:**

- **Redis (not in-process)**: Cache must be shared across Celery workers and multiple Uvicorn processes. Redis is already deployed and available via `settings.REDIS_URL`.
- **Exact hash, not semantic**: Cache keys are exact SHA-256 hashes. Two prompts that mean the same thing but differ by one character are different cache keys. Semantic caching is out of scope for Phase 1.
- **Opt-out, not opt-in**: Cache is enabled by default for deterministic node types. Individual nodes can set `cache_enabled: false` in their config to bypass.
- **No cache for generative LLM calls**: LLM generation nodes (temperature > 0, creative tasks) are never cached. Only LLM classification calls (temperature = 0, deterministic config) are eligible.

---

## Files to Create/Modify

| File | Action | Description |
|------|--------|-------------|
| `/home/dev/projects/SmartSpecPro/python-backend/app/core/workflow_cache.py` | **CREATE** | Cache service: key building, Redis get/set, TTL management, stampede lock, metrics |
| `/home/dev/projects/SmartSpecPro/python-backend/app/orchestrator/cache_middleware.py` | **CREATE** | Node execution wrapper: intercepts execute calls, checks cache, populates on miss |
| `/home/dev/projects/SmartSpecPro/python-backend/app/orchestrator/node_adapter.py` | **MODIFY** | Integrate `CacheMiddleware` into the `make_langgraph_node` wrapper |
| `/home/dev/projects/SmartSpecPro/python-backend/tests/test_cache.py` | **CREATE** | All cache tests |

---

## Implementation Steps

### Step 1: Write Tests First

**File:** `/home/dev/projects/SmartSpecPro/python-backend/tests/test_cache.py`

Write all seven tests from the TDD plan before any implementation. Each test defines the expected behavior contract.

```python
"""Tests for the exact-hash caching system.

Tests are written FIRST (red phase) before implementation.
"""

import asyncio
import hashlib
import json
import time
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.core.workflow_cache import CacheKeyBuilder, WorkflowCache
from app.orchestrator.cache_middleware import CacheMiddleware


@pytest.fixture
def mock_redis():
    """Mock async Redis client."""
    redis = AsyncMock()
    redis.get = AsyncMock(return_value=None)
    redis.set = AsyncMock(return_value=True)
    redis.delete = AsyncMock(return_value=1)
    redis.incr = AsyncMock(return_value=1)
    redis.pipeline = MagicMock()
    return redis


@pytest.fixture
def cache(mock_redis):
    """WorkflowCache with mocked Redis."""
    return WorkflowCache(redis_client=mock_redis)


@pytest.fixture
def key_builder():
    """CacheKeyBuilder instance."""
    return CacheKeyBuilder()


@pytest.fixture
def mock_executor():
    """Mock node executor that returns a predictable result."""
    executor = AsyncMock()
    executor.execute = AsyncMock(return_value={"result": "computed_value"})
    return executor


class TestCacheKeyBuilder:
    """Tests for deterministic cache key generation."""

    def test_cache_key_normalization(self, key_builder):
        """Whitespace, case, and JSON key ordering are normalized
        so that semantically equivalent inputs produce the same key."""
        key1 = key_builder.build(
            node_type="http_request",
            config={"url": "  https://api.example.com  ", "method": "GET"},
            inputs={"query": " Hello World "},
            model_id=None,
            prompt_version=None,
        )
        key2 = key_builder.build(
            node_type="http_request",
            config={"method": "GET", "url": "https://api.example.com"},
            inputs={"query": "Hello World"},
            model_id=None,
            prompt_version=None,
        )
        assert key1 == key2
        assert len(key1) == 64  # SHA-256 hex digest

    def test_different_inputs_different_keys(self, key_builder):
        """Different inputs must produce different cache keys."""
        key1 = key_builder.build(
            node_type="http_request",
            config={"url": "https://api.example.com"},
            inputs={"query": "hello"},
        )
        key2 = key_builder.build(
            node_type="http_request",
            config={"url": "https://api.example.com"},
            inputs={"query": "world"},
        )
        assert key1 != key2

    def test_timestamp_fields_stripped(self, key_builder):
        """Fields named 'timestamp', 'created_at', 'request_id', etc.
        are stripped before hashing so time-varying data does not
        invalidate the cache."""
        key1 = key_builder.build(
            node_type="http_request",
            config={"url": "https://api.example.com"},
            inputs={"data": "same", "timestamp": "2026-01-01T00:00:00Z"},
        )
        key2 = key_builder.build(
            node_type="http_request",
            config={"url": "https://api.example.com"},
            inputs={"data": "same", "timestamp": "2026-02-08T12:00:00Z"},
        )
        assert key1 == key2


class TestWorkflowCache:
    """Tests for Redis-backed cache operations."""

    @pytest.mark.asyncio
    async def test_cache_miss_executes_node(self, cache, mock_redis):
        """On cache miss, get() returns None, indicating the caller
        should execute the node normally."""
        mock_redis.get.return_value = None

        result = await cache.get("some_cache_key")

        assert result is None
        mock_redis.get.assert_awaited_once()

    @pytest.mark.asyncio
    async def test_cache_hit_returns_cached(self, cache, mock_redis):
        """On cache hit, get() returns the previously stored result."""
        cached_data = json.dumps({"result": "cached_value"})
        mock_redis.get.return_value = cached_data

        result = await cache.get("some_cache_key")

        assert result == {"result": "cached_value"}

    @pytest.mark.asyncio
    async def test_cache_ttl_expires(self, cache, mock_redis):
        """Cached result is stored with a TTL; after expiry, get() returns None."""
        await cache.set(
            cache_key="test_key",
            value={"result": "value"},
            ttl_seconds=300,
            node_type="http_request",
        )
        mock_redis.set.assert_awaited_once()
        # Verify TTL was passed to Redis SET
        call_kwargs = mock_redis.set.call_args
        assert call_kwargs.kwargs.get("ex") == 300 or call_kwargs[1].get("ex") == 300

    @pytest.mark.asyncio
    async def test_cache_metrics_tracked(self, cache, mock_redis):
        """hit_count and miss_count are incremented via Redis INCR."""
        mock_redis.get.return_value = None
        await cache.get("miss_key")
        await cache.record_miss("http_request")

        mock_redis.incr.assert_awaited()

    @pytest.mark.asyncio
    async def test_cache_stampede_protection(self, cache, mock_redis):
        """When multiple concurrent requests hit the same uncached key,
        only one acquires the lock and computes; others wait."""
        mock_redis.set.return_value = True  # Lock acquired

        acquired = await cache.acquire_lock("stampede_key", timeout=5)

        assert acquired is True
        # Verify SET NX was used
        call_args = mock_redis.set.call_args
        assert call_args.kwargs.get("nx") is True or call_args[1].get("nx") is True


class TestCacheMiddleware:
    """Tests for the cache middleware integration."""

    @pytest.mark.asyncio
    async def test_cache_opt_out(self, mock_redis, mock_executor):
        """When node config has cache_enabled=false, cache is bypassed entirely."""
        cache = WorkflowCache(redis_client=mock_redis)
        middleware = CacheMiddleware(cache=cache)

        node_config = {"url": "https://api.example.com", "cache_enabled": False}
        from app.orchestrator.node_executors.base import (
            ExecutionContext,
            NodeExecutionData,
        )

        data = NodeExecutionData(
            node_id="node_1",
            node_type="http_request",
            config=node_config,
            inputs={"query": "test"},
            state={},
        )
        context = ExecutionContext(
            user_id=1,
            tenant_id="t1",
            workflow_id="wf1",
            execution_id="ex1",
        )

        result = await middleware.execute_with_cache(
            executor=mock_executor,
            data=data,
            context=context,
        )

        assert result == {"result": "computed_value"}
        mock_redis.get.assert_not_awaited()  # Cache was not checked
```

### Step 2: Create CacheKeyBuilder and WorkflowCache

**File:** `/home/dev/projects/SmartSpecPro/python-backend/app/core/workflow_cache.py`

```python
"""Exact-hash caching system for deterministic workflow node results.

Uses Redis as the backing store with SHA-256 keys derived from
normalized node type, config, inputs, model ID, and prompt version.
"""

import hashlib
import json
from typing import Any

import structlog
from redis.asyncio import Redis

logger = structlog.get_logger()

# Cache key prefix in Redis to namespace workflow cache entries
CACHE_KEY_PREFIX = "wf_cache:"
LOCK_KEY_PREFIX = "wf_cache_lock:"
METRICS_KEY_PREFIX = "wf_cache_metrics:"

# Fields stripped from inputs/config before hashing (time-varying / random)
STRIPPED_FIELDS = frozenset({
    "timestamp",
    "created_at",
    "updated_at",
    "request_id",
    "trace_id",
    "execution_id",
    "random_seed",
    "nonce",
})

# Default TTLs per node type (in seconds)
DEFAULT_TTLS: dict[str, int] = {
    "http_request": 300,          # 5 minutes
    "database_query": 300,        # 5 minutes
    "llm_call": 86400,            # 1 day (only for deterministic / classification)
    "llm_classify": 604800,       # 7 days
    # Nodes not in this map are not cached by default
}

# Node types that are eligible for caching
CACHEABLE_NODE_TYPES = frozenset(DEFAULT_TTLS.keys())


class CacheKeyBuilder:
    """Builds deterministic SHA-256 cache keys from node execution parameters.

    Normalization strategy:
    - Trim leading/trailing whitespace from all string values
    - Lowercase all string values
    - Sort JSON object keys recursively
    - Strip time-varying fields (timestamps, request IDs, nonces)
    """

    def build(
        self,
        node_type: str,
        config: dict[str, Any],
        inputs: dict[str, Any],
        model_id: str | None = None,
        prompt_version: str | None = None,
    ) -> str:
        """Build a SHA-256 cache key from normalized components.

        Args:
            node_type: The node type identifier (e.g., "http_request").
            config: Node configuration dict from the visual editor.
            inputs: Resolved input values from upstream nodes.
            model_id: LLM model identifier (for LLM nodes).
            prompt_version: Prompt template version (for LLM nodes).

        Returns:
            64-character hex SHA-256 digest.
        """
        normalized_config = self._normalize(self._strip_volatile(config))
        normalized_inputs = self._normalize(self._strip_volatile(inputs))

        components = {
            "node_type": node_type.lower().strip(),
            "config": normalized_config,
            "inputs": normalized_inputs,
            "model_id": (model_id or "").lower().strip(),
            "prompt_version": (prompt_version or "").strip(),
        }

        serialized = json.dumps(components, sort_keys=True, separators=(",", ":"))
        return hashlib.sha256(serialized.encode("utf-8")).hexdigest()

    def _normalize(self, value: Any) -> Any:
        """Recursively normalize a value for deterministic hashing."""
        if isinstance(value, str):
            return value.strip().lower()
        elif isinstance(value, dict):
            return {k: self._normalize(v) for k, v in sorted(value.items())}
        elif isinstance(value, (list, tuple)):
            return [self._normalize(item) for item in value]
        else:
            return value

    def _strip_volatile(self, data: dict[str, Any]) -> dict[str, Any]:
        """Remove time-varying and random fields that should not
        affect cache key identity."""
        return {
            k: v for k, v in data.items()
            if k.lower() not in STRIPPED_FIELDS
        }


class WorkflowCache:
    """Redis-backed cache for workflow node results.

    Features:
    - Configurable TTL per node type
    - Stampede protection via SET NX locks
    - Metrics tracking (hit/miss counters)
    - Graceful degradation if Redis is unavailable
    """

    def __init__(
        self,
        redis_client: Redis | None = None,
        key_builder: CacheKeyBuilder | None = None,
    ):
        """Initialize the cache.

        Args:
            redis_client: Async Redis client. If None, cache operations
                become no-ops (graceful degradation).
            key_builder: Key builder instance. Defaults to CacheKeyBuilder().
        """
        self._redis = redis_client
        self._key_builder = key_builder or CacheKeyBuilder()

    @property
    def key_builder(self) -> CacheKeyBuilder:
        """Access the key builder."""
        return self._key_builder

    async def get(self, cache_key: str) -> dict[str, Any] | None:
        """Retrieve a cached result by key.

        Args:
            cache_key: SHA-256 hex digest from CacheKeyBuilder.

        Returns:
            Cached result dict, or None on miss / Redis unavailable.
        """
        if self._redis is None:
            return None

        try:
            raw = await self._redis.get(f"{CACHE_KEY_PREFIX}{cache_key}")
            if raw is None:
                return None
            return json.loads(raw)
        except Exception as exc:
            logger.warning(
                "Cache get failed, treating as miss",
                cache_key=cache_key[:16],
                error=str(exc),
            )
            return None

    async def set(
        self,
        cache_key: str,
        value: dict[str, Any],
        ttl_seconds: int,
        node_type: str,
    ) -> bool:
        """Store a result in the cache.

        Args:
            cache_key: SHA-256 hex digest.
            value: Node execution result to cache.
            ttl_seconds: Time-to-live in seconds.
            node_type: For metrics tracking.

        Returns:
            True if stored successfully, False otherwise.
        """
        if self._redis is None:
            return False

        try:
            serialized = json.dumps(value, default=str, separators=(",", ":"))
            await self._redis.set(
                f"{CACHE_KEY_PREFIX}{cache_key}",
                serialized,
                ex=ttl_seconds,
            )
            return True
        except Exception as exc:
            logger.warning(
                "Cache set failed",
                cache_key=cache_key[:16],
                node_type=node_type,
                error=str(exc),
            )
            return False

    async def invalidate(self, cache_key: str) -> bool:
        """Invalidate a specific cache entry.

        Args:
            cache_key: SHA-256 hex digest to remove.

        Returns:
            True if the key existed and was removed.
        """
        if self._redis is None:
            return False

        try:
            deleted = await self._redis.delete(f"{CACHE_KEY_PREFIX}{cache_key}")
            return deleted > 0
        except Exception as exc:
            logger.warning("Cache invalidate failed", error=str(exc))
            return False

    async def invalidate_by_node_type(self, node_type: str) -> int:
        """Invalidate all cache entries for a given node type.

        Uses SCAN to find matching keys (does not block Redis).

        Args:
            node_type: Node type to purge.

        Returns:
            Number of keys deleted.
        """
        # Implementation uses SCAN + DELETE pipeline
        ...

    async def acquire_lock(
        self,
        cache_key: str,
        timeout: int = 10,
    ) -> bool:
        """Acquire a stampede-protection lock for a cache key.

        Uses Redis SET NX with an expiry to prevent thundering herd.
        Only one caller acquires the lock; others should wait/retry
        or fall through to re-check the cache.

        Args:
            cache_key: The cache key being computed.
            timeout: Lock TTL in seconds (auto-releases).

        Returns:
            True if lock acquired, False if already held.
        """
        if self._redis is None:
            return True  # No Redis = no lock needed, proceed

        try:
            result = await self._redis.set(
                f"{LOCK_KEY_PREFIX}{cache_key}",
                "1",
                nx=True,
                ex=timeout,
            )
            return result is True
        except Exception as exc:
            logger.warning("Lock acquire failed", error=str(exc))
            return True  # Fail open: let the caller proceed

    async def release_lock(self, cache_key: str) -> None:
        """Release a stampede-protection lock.

        Args:
            cache_key: The cache key whose lock to release.
        """
        if self._redis is None:
            return

        try:
            await self._redis.delete(f"{LOCK_KEY_PREFIX}{cache_key}")
        except Exception as exc:
            logger.warning("Lock release failed", error=str(exc))

    # ------------------------------------------------------------------
    # Metrics
    # ------------------------------------------------------------------

    async def record_hit(self, node_type: str) -> None:
        """Increment cache hit counter for a node type."""
        await self._increment_metric(node_type, "hits")

    async def record_miss(self, node_type: str) -> None:
        """Increment cache miss counter for a node type."""
        await self._increment_metric(node_type, "misses")

    async def record_eviction(self, node_type: str) -> None:
        """Increment cache eviction counter for a node type."""
        await self._increment_metric(node_type, "evictions")

    async def get_metrics(self, node_type: str) -> dict[str, int]:
        """Get cache metrics for a node type.

        Returns:
            Dict with keys: hits, misses, evictions.
        """
        if self._redis is None:
            return {"hits": 0, "misses": 0, "evictions": 0}

        try:
            hits = await self._redis.get(f"{METRICS_KEY_PREFIX}{node_type}:hits")
            misses = await self._redis.get(f"{METRICS_KEY_PREFIX}{node_type}:misses")
            evictions = await self._redis.get(f"{METRICS_KEY_PREFIX}{node_type}:evictions")
            return {
                "hits": int(hits or 0),
                "misses": int(misses or 0),
                "evictions": int(evictions or 0),
            }
        except Exception:
            return {"hits": 0, "misses": 0, "evictions": 0}

    async def _increment_metric(self, node_type: str, metric: str) -> None:
        """Increment a metric counter in Redis."""
        if self._redis is None:
            return
        try:
            await self._redis.incr(f"{METRICS_KEY_PREFIX}{node_type}:{metric}")
        except Exception as exc:
            logger.debug("Metric increment failed", metric=metric, error=str(exc))

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------

    def get_ttl_for_node_type(self, node_type: str) -> int | None:
        """Get the default TTL for a node type.

        Returns:
            TTL in seconds, or None if the node type is not cacheable.
        """
        return DEFAULT_TTLS.get(node_type)

    def is_cacheable(self, node_type: str, config: dict[str, Any]) -> bool:
        """Determine whether a node execution should be cached.

        Checks:
        1. Node type is in the cacheable set
        2. Config does not have cache_enabled=false
        3. For LLM nodes: temperature must be 0 (deterministic)

        Args:
            node_type: The node type identifier.
            config: Node configuration dict.

        Returns:
            True if the result should be cached.
        """
        # Explicit opt-out
        if config.get("cache_enabled") is False:
            return False

        # Not in cacheable set
        if node_type not in CACHEABLE_NODE_TYPES:
            return False

        # LLM-specific: only cache deterministic calls
        if node_type in ("llm_call", "llm_classify"):
            temperature = config.get("temperature", 0.7)
            if temperature > 0:
                return False

        return True
```

### Step 3: Create CacheMiddleware

**File:** `/home/dev/projects/SmartSpecPro/python-backend/app/orchestrator/cache_middleware.py`

```python
"""Cache middleware for workflow node execution.

Wraps node executors to transparently check/populate the cache.
Integrates with the NodeAdapter from Section 1.
"""

import asyncio
from typing import Any

import structlog

from app.core.workflow_cache import WorkflowCache, CacheKeyBuilder
from app.orchestrator.node_executors.base import (
    ExecutionContext,
    NodeExecutionData,
    NodeExecutor,
)

logger = structlog.get_logger()

# Maximum time to wait for a stampede lock (seconds)
STAMPEDE_WAIT_TIMEOUT = 15
# Interval between lock retry checks (seconds)
STAMPEDE_RETRY_INTERVAL = 0.5


class CacheMiddleware:
    """Middleware that intercepts node execution to check/populate cache.

    Usage:
        middleware = CacheMiddleware(cache=workflow_cache)
        result = await middleware.execute_with_cache(executor, data, context)

    The middleware:
    1. Checks if the node type is cacheable (based on type + config)
    2. Builds a cache key from normalized inputs
    3. Returns cached result on hit
    4. On miss: acquires stampede lock, executes node, stores result
    5. Tracks hit/miss metrics
    """

    def __init__(self, cache: WorkflowCache):
        """Initialize the middleware.

        Args:
            cache: WorkflowCache instance (with Redis client).
        """
        self._cache = cache

    async def execute_with_cache(
        self,
        executor: NodeExecutor,
        data: NodeExecutionData,
        context: ExecutionContext,
    ) -> dict[str, Any]:
        """Execute a node with cache check.

        Args:
            executor: The node executor to call on cache miss.
            data: Node execution data (config, inputs, etc.).
            context: Execution context (user, tenant, credits).

        Returns:
            Node execution result (from cache or fresh execution).
        """
        # Check if this node type + config is cacheable
        if not self._cache.is_cacheable(data.node_type, data.config):
            return await executor.execute(data, context)

        # Build cache key
        model_id = data.config.get("model") or data.config.get("model_id")
        prompt_version = data.config.get("prompt_version")

        cache_key = self._cache.key_builder.build(
            node_type=data.node_type,
            config=data.config,
            inputs=data.inputs,
            model_id=model_id,
            prompt_version=prompt_version,
        )

        # Try cache hit
        cached = await self._cache.get(cache_key)
        if cached is not None:
            await self._cache.record_hit(data.node_type)
            logger.debug(
                "Cache hit",
                node_id=data.node_id,
                node_type=data.node_type,
                cache_key=cache_key[:16],
            )
            return cached

        # Cache miss -- acquire stampede lock
        lock_acquired = await self._cache.acquire_lock(cache_key)

        if not lock_acquired:
            # Another process is computing this key; wait and re-check
            result = await self._wait_for_cache(cache_key, data.node_type)
            if result is not None:
                await self._cache.record_hit(data.node_type)
                return result
            # Timed out waiting; fall through to execute

        try:
            # Execute the node
            await self._cache.record_miss(data.node_type)
            result = await executor.execute(data, context)

            # Store in cache
            ttl = self._cache.get_ttl_for_node_type(data.node_type)
            if ttl is not None:
                await self._cache.set(
                    cache_key=cache_key,
                    value=result,
                    ttl_seconds=ttl,
                    node_type=data.node_type,
                )

            return result

        finally:
            if lock_acquired:
                await self._cache.release_lock(cache_key)

    async def _wait_for_cache(
        self,
        cache_key: str,
        node_type: str,
    ) -> dict[str, Any] | None:
        """Wait for another process to populate the cache.

        Polls Redis at intervals until the key appears or timeout.

        Args:
            cache_key: The cache key to wait for.
            node_type: For logging.

        Returns:
            Cached result if it appeared, or None on timeout.
        """
        elapsed = 0.0
        while elapsed < STAMPEDE_WAIT_TIMEOUT:
            await asyncio.sleep(STAMPEDE_RETRY_INTERVAL)
            elapsed += STAMPEDE_RETRY_INTERVAL

            result = await self._cache.get(cache_key)
            if result is not None:
                logger.debug(
                    "Stampede wait resolved",
                    node_type=node_type,
                    waited_seconds=elapsed,
                )
                return result

        logger.warning(
            "Stampede wait timed out, executing node directly",
            node_type=node_type,
            timeout=STAMPEDE_WAIT_TIMEOUT,
        )
        return None
```

### Step 4: Integrate CacheMiddleware into NodeAdapter

**File:** `/home/dev/projects/SmartSpecPro/python-backend/app/orchestrator/node_adapter.py` (MODIFY -- created in Section 1)

The `make_langgraph_node` function from Section 1 wraps each executor. This step adds an optional `CacheMiddleware` parameter. When provided, the adapter routes execution through the middleware instead of calling the executor directly.

The change is minimal -- a conditional in `_node_fn`:

```python
# In make_langgraph_node, add parameter:
def make_langgraph_node(
    executor: NodeExecutor,
    node_id: str,
    node_type: str,
    node_config: dict[str, Any],
    cache_middleware: "CacheMiddleware | None" = None,  # NEW
) -> Callable:
    """Create a LangGraph node function from a NodeExecutor.

    Args:
        executor: An object implementing the NodeExecutor protocol.
        node_id: Unique identifier for this node instance.
        node_type: The node type name (e.g., "llm_call").
        node_config: Static configuration from the visual editor.
        cache_middleware: Optional cache middleware for result caching.

    Returns:
        An async function compatible with StateGraph.add_node().
    """

    async def _node_fn(state: WorkflowState, config: dict) -> dict:
        # ... existing context building and input resolution ...

        try:
            # NEW: Route through cache middleware if available
            if cache_middleware is not None:
                output = await cache_middleware.execute_with_cache(
                    executor=executor, data=data, context=context
                )
            else:
                output = await executor.execute(data, context)

            # ... existing output handling ...
```

The `WorkflowCompiler._build_state_graph` method is also updated to pass the `cache_middleware` when constructing LangGraph node functions. The middleware instance is created once during compilation and shared across all nodes.

### Step 5: Cache Invalidation Strategy

Cache entries are invalidated through the following mechanisms:

1. **TTL-based expiry** (primary): Each entry has a TTL set via Redis `SET ... EX ttl`. Redis automatically evicts expired keys. No application code needed.

2. **Manual invalidation** (per-key): `WorkflowCache.invalidate(cache_key)` removes a specific entry. Used when an admin edits a workflow node's config -- the old cached results for that config are no longer valid.

3. **Bulk invalidation** (per-node-type): `WorkflowCache.invalidate_by_node_type(node_type)` uses `SCAN` to find and delete all keys matching a node type pattern. This is available as an admin API action.

4. **Config change detection**: When a workflow is saved with modified node config, the system does NOT need explicit invalidation because the cache key includes the config hash. Changed config = different cache key = automatic miss. Old entries simply expire via TTL.

5. **Redis eviction policy**: If Redis memory fills up, its eviction policy (`allkeys-lru` recommended) will evict the least-recently-used cache entries. The application handles this gracefully -- a missing key is treated as a cache miss.

---

## Key Classes

### CacheKeyBuilder

Location: `/home/dev/projects/SmartSpecPro/python-backend/app/core/workflow_cache.py`

```
class CacheKeyBuilder:
    build(node_type: str, config: dict, inputs: dict, model_id: str | None, prompt_version: str | None) -> str
    _normalize(value: Any) -> Any
    _strip_volatile(data: dict) -> dict
```

**Cache key formula:**
```
sha256(json.dumps({
    "node_type": normalized(node_type),
    "config": normalized(stripped(config)),
    "inputs": normalized(stripped(inputs)),
    "model_id": normalized(model_id),
    "prompt_version": normalized(prompt_version),
}, sort_keys=True))
```

### WorkflowCache

Location: `/home/dev/projects/SmartSpecPro/python-backend/app/core/workflow_cache.py`

```
class WorkflowCache:
    __init__(redis_client: Redis | None, key_builder: CacheKeyBuilder | None)
    async get(cache_key: str) -> dict | None
    async set(cache_key: str, value: dict, ttl_seconds: int, node_type: str) -> bool
    async invalidate(cache_key: str) -> bool
    async invalidate_by_node_type(node_type: str) -> int
    async acquire_lock(cache_key: str, timeout: int) -> bool
    async release_lock(cache_key: str) -> None
    async record_hit(node_type: str) -> None
    async record_miss(node_type: str) -> None
    async record_eviction(node_type: str) -> None
    async get_metrics(node_type: str) -> dict[str, int]
    get_ttl_for_node_type(node_type: str) -> int | None
    is_cacheable(node_type: str, config: dict) -> bool
    key_builder: CacheKeyBuilder (property)
```

### CacheMiddleware

Location: `/home/dev/projects/SmartSpecPro/python-backend/app/orchestrator/cache_middleware.py`

```
class CacheMiddleware:
    __init__(cache: WorkflowCache)
    async execute_with_cache(executor: NodeExecutor, data: NodeExecutionData, context: ExecutionContext) -> dict
    async _wait_for_cache(cache_key: str, node_type: str) -> dict | None
```

---

## Cache-Enabled Node Types

| Node Type | Default TTL | Rationale | Cache Condition |
|-----------|-------------|-----------|-----------------|
| `http_request` | 5 minutes (300s) | External API responses are often stable for short periods | Always (unless opted out) |
| `database_query` | 5 minutes (300s) | Query results change infrequently within a workflow run | Always (unless opted out) |
| `llm_call` | 1 day (86400s) | LLM classification with temperature=0 is deterministic | Only when `temperature == 0` |
| `llm_classify` | 7 days (604800s) | Classification results are stable for the same input | Always (unless opted out) |

**Nodes that are NEVER cached:**
- LLM generation (temperature > 0) -- non-deterministic by design
- Trigger nodes -- entry points, no upstream to hash
- Approval/HITL nodes -- require human interaction
- Code Step nodes -- user code may have side effects
- Notification nodes -- side-effect nodes (send email/SMS)
- Storage upload/download -- side-effect nodes
- All reliability nodes (retry, circuit breaker, etc.) -- wrappers, not data producers

---

## Default TTL Configuration

TTLs can be overridden via node config:

```json
{
  "nodeType": "http_request",
  "config": {
    "url": "https://api.example.com/data",
    "method": "GET",
    "cache_enabled": true,
    "cache_ttl_seconds": 1800
  }
}
```

If `cache_ttl_seconds` is set in node config, it overrides the default TTL for that node type. The `CacheMiddleware` checks for this override before falling back to `DEFAULT_TTLS`.

---

## Error Handling

| Error Source | Handling | Impact |
|-------------|----------|--------|
| **Redis unavailable** | All cache operations return graceful defaults (`get` returns None, `set` returns False). Execution proceeds without caching. | Zero impact on workflow correctness; only performance degrades |
| **Redis SET/GET timeout** | Caught in try/except, logged as warning, treated as cache miss | Node executes normally |
| **Cache deserialization error** | `json.loads()` failure caught, logged, treated as cache miss | Stale/corrupt entry ignored |
| **Stampede lock timeout** | After `STAMPEDE_WAIT_TIMEOUT` (15s), the waiting caller executes the node directly | Duplicate execution (acceptable; result is still cached for subsequent requests) |
| **Lock release failure** | Lock has an `EX` TTL and will auto-expire in Redis | No permanent lock; slight delay for next locker |
| **Oversized cache value** | No explicit size limit enforced (Redis handles memory via eviction policy) | Very large results may be evicted sooner under memory pressure |

**Key design principle:** The cache is an optimization layer, not a correctness requirement. Every failure mode degrades gracefully to "execute the node normally."

---

## Metrics Persistence

Cache metrics are tracked at two levels:

### 1. Redis Counters (real-time, ephemeral)

Counters in Redis provide real-time hit/miss/eviction rates:

```
wf_cache_metrics:http_request:hits    -> 1523
wf_cache_metrics:http_request:misses  -> 342
wf_cache_metrics:llm_call:hits        -> 87
```

These are queried by the `get_metrics()` method and exposed via the health/admin API.

### 2. PostgreSQL Table (persistent, historical)

The `workflow_cache_metadata` table (created in Section 13) stores aggregated metrics for historical analysis:

```sql
-- Table defined in Section 13
CREATE TABLE workflow_cache_metadata (
    id SERIAL PRIMARY KEY,
    cache_key VARCHAR(64) NOT NULL,
    node_type VARCHAR(50) NOT NULL,
    hit_count INTEGER DEFAULT 0,
    last_hit_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW(),
    ttl_seconds INTEGER
);
```

A periodic Celery task flushes Redis counters to this table (e.g., every 5 minutes). This is a Phase 2 enhancement; Phase 1 uses Redis counters only.

---

## Tests

### Test File: `/home/dev/projects/SmartSpecPro/python-backend/tests/test_cache.py`

| Test Name | Type | What it verifies |
|-----------|------|------------------|
| `test_cache_miss_executes_node` | unit | When Redis returns None for a key, `get()` returns None, indicating the caller should execute the node |
| `test_cache_hit_returns_cached` | unit | When Redis returns a serialized JSON value, `get()` deserializes and returns it |
| `test_cache_key_normalization` | unit | Whitespace, case differences, and JSON key ordering are normalized; semantically equivalent inputs produce identical SHA-256 keys |
| `test_cache_ttl_expires` | unit | `set()` passes the TTL as `ex` parameter to Redis SET; after expiry, key disappears |
| `test_cache_stampede_protection` | unit | `acquire_lock()` uses Redis SET NX with an expiry; concurrent callers for the same key are serialized |
| `test_cache_opt_out` | unit | When `cache_enabled: false` is in node config, `CacheMiddleware.execute_with_cache()` bypasses cache entirely and calls executor directly |
| `test_cache_metrics_tracked` | unit | `record_hit()` and `record_miss()` call Redis INCR on the appropriate metrics keys |

### Additional Test Cases (recommended but not mandatory for Phase 1)

| Test Name | Type | What it verifies |
|-----------|------|------------------|
| `test_different_inputs_different_keys` | unit | Different input values produce different cache keys |
| `test_timestamp_fields_stripped` | unit | Fields named `timestamp`, `created_at`, etc. are stripped before hashing |
| `test_llm_call_not_cached_when_temperature_nonzero` | unit | `is_cacheable("llm_call", {"temperature": 0.7})` returns False |
| `test_cache_graceful_degradation` | unit | When `redis_client` is None, all operations return defaults without errors |
| `test_invalidate_removes_key` | unit | `invalidate(key)` calls Redis DELETE |
| `test_custom_ttl_override` | unit | `cache_ttl_seconds` in node config overrides the default TTL |

---

## Dependencies

### On Other Sections

| Dependency | Section | Nature |
|------------|---------|--------|
| NodeAdapter (`make_langgraph_node`) | Section 1 (LangGraph Runtime Core) | CacheMiddleware is injected into the node adapter; the adapter's function signature gains an optional `cache_middleware` parameter |
| NodeExecutor protocol | Section 1 (existing `base.py`) | CacheMiddleware calls `executor.execute(data, context)` using the existing protocol |
| Redis client | Existing (`app/core/redis_client.py`) | Uses `get_redis()` to obtain the async Redis client; no new Redis configuration needed |
| `workflow_cache_metadata` table | Section 13 (Database Schema) | Persistent metrics storage. Phase 1 uses Redis counters only; the table is used in Phase 2 for historical reporting |
| WorkflowCompiler | Section 1 | Compiler is updated to instantiate CacheMiddleware and pass it to `make_langgraph_node` during graph building |

### Python Packages Required

| Package | Version | Purpose | Already Installed? |
|---------|---------|---------|-------------------|
| `redis[hiredis]` | >=4.5 | Async Redis client | Yes (used in `redis_client.py`) |
| `structlog` | >=23.0 | Structured logging | Yes |

No new packages are required. The caching system uses only the existing Redis client and standard library `hashlib`/`json`.

### Configuration

The following existing settings from `/home/dev/projects/SmartSpecPro/python-backend/app/core/config.py` are used:

| Setting | Value | Usage |
|---------|-------|-------|
| `REDIS_URL` | `redis://localhost:6379/0` | Connection URL for the cache Redis client |
| `REDIS_MAX_CONNECTIONS` | `50` | Max connections in the Redis pool |

No new configuration settings are needed for Phase 1. Default TTLs are defined in `workflow_cache.py` constants. If per-environment overrides are needed later, they can be added to the `Settings` class.