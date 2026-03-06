Now I have all the context needed. Let me generate the section content.

# Section 03: Selector Cache

## Overview

This section implements `SelectorCache`, a Redis-backed cache for verified Playwright action lists. When the system successfully generates and validates selectors for a given URL + automation goal, the result is cached so that repeat runs skip the expensive Vision LLM call entirely. The cache also tracks self-healing metadata (heal count, last healed timestamp) for analytics and cache quality monitoring.

The `SelectorCache` is used by `PlaywrightScriptGenerator` (section 04) to check for existing action lists before invoking the Vision LLM, and by `SelfHealingExecutor` (section 05) to update cached entries after successful healing or invalidate them after exhausted healing attempts.

## Dependencies

- **Section 01 (Exceptions and URL Validator):** This section uses exception classes from `automation_exceptions.py`, though `SelectorCache` itself does not raise custom exceptions directly. The dependency is structural -- both are Wave 1 modules.
- **Redis:** The cache requires an async Redis client (`redis.asyncio.Redis`). The project already uses Redis extensively (Celery broker, BullMQ, etc.) so no new infrastructure is needed. The existing Redis connection from `python-backend/app/core/` should be reused.

## Tests First

File: `python-backend/tests/unit/automation/test_selector_cache.py`

The test suite must cover 7 cases. Use `fakeredis` (preferred) or mock `redis.asyncio.Redis` to avoid requiring a real Redis instance in unit tests. Coverage target: >= 85%.

```python
"""Tests for SelectorCache — Redis-backed action list cache.

Uses fakeredis.aioredis for isolation. No real Redis needed.
"""
import pytest
import hashlib
from unittest.mock import AsyncMock, patch

# Test: get() returns None on cache miss
async def test_get_returns_none_on_cache_miss():
    """get() with a key that does not exist returns None."""

# Test: put() stores entry, get() returns it with correct fields
async def test_put_stores_and_get_returns_entry():
    """put() followed by get() with same tenant/url/goal returns
    a SelectorCacheEntry with matching actions, url, goal, and
    initial metadata (success_count=0, heal_count=0, etc.)."""

# Test: TTL is set on put (7 days)
async def test_put_sets_ttl_seven_days():
    """After put(), the Redis key has a TTL of approximately 7 days
    (604800 seconds)."""

# Test: mark_heal() updates actions, increments heal_count, updates last_healed, resets TTL
async def test_mark_heal_updates_entry():
    """mark_heal() replaces the actions list, increments heal_count by 1,
    sets last_healed to current timestamp, and resets TTL to 7 days."""

# Test: invalidate() deletes key, subsequent get() returns None
async def test_invalidate_deletes_key():
    """invalidate() removes the cache entry. A subsequent get() returns None."""

# Test: cache key uses tenant_id namespace (different tenants don't share cache)
async def test_cache_key_tenant_isolation():
    """Two different tenant_ids with identical url and goal produce
    different cache keys. put() under tenant A, get() under tenant B
    returns None."""

# Test: cache key uses sha256[:32] of url and goal
async def test_cache_key_uses_sha256_hashes():
    """The Redis key format is selcache:{tenant_id}:{sha256(url)[:32]}:{sha256(goal)[:32]}.
    Verify by computing expected hashes and checking the key used in Redis."""
```

### Test Setup Notes

- Each test should create a fresh `SelectorCache` instance with a fresh `fakeredis` (or mock) connection.
- The `PlaywrightAction` objects used in tests can be minimal stubs -- they just need to be JSON-serializable Pydantic models (or dicts).
- Use `pytest.mark.asyncio` (or rely on `asyncio_mode="auto"` from the project's pytest config).
- The `__init__.py` file for `python-backend/tests/unit/automation/` must exist (create it empty if it does not already exist from section 01).

## Implementation Details

File: `python-backend/app/services/selector_cache.py`

### Data Models

Define a `SelectorCacheEntry` Pydantic model that holds all cached data:

```python
from pydantic import BaseModel, Field
from datetime import datetime

class SelectorCacheEntry(BaseModel):
    """Cached selector data for a URL + goal combination."""
    url: str
    goal: str
    actions: list  # list of PlaywrightAction dicts
    success_count: int = 0
    fail_count: int = 0
    heal_count: int = 0
    last_verified: datetime | None = None
    last_healed: datetime | None = None
    created_at: datetime = Field(default_factory=datetime.utcnow)
```

The `actions` field stores a list of `PlaywrightAction` objects serialized to dicts. The exact `PlaywrightAction` type is defined in section 04 (PlaywrightScriptGenerator). For the purposes of this section, `actions` is `list[dict]` -- any JSON-serializable list works.

### Cache Key Format

```
selcache:{tenant_id}:{sha256(url)[:32]}:{sha256(goal)[:32]}
```

- The `selcache:` prefix distinguishes these keys from other Redis namespaces (automation status uses `automation:`, browser pool uses `browser_pool:`).
- `sha256[:32]` means the first 32 hex characters of the SHA-256 hash of the string. This keeps keys reasonably short while maintaining uniqueness.
- `tenant_id` is included to enforce multi-tenant isolation at the cache level.

Build the key with a private helper method:

```python
def _build_key(self, tenant_id: str, url: str, goal: str) -> str:
    """Build Redis key: selcache:{tenant_id}:{sha256(url)[:32]}:{sha256(goal)[:32]}"""
    url_hash = hashlib.sha256(url.encode()).hexdigest()[:32]
    goal_hash = hashlib.sha256(goal.encode()).hexdigest()[:32]
    return f"selcache:{tenant_id}:{url_hash}:{goal_hash}"
```

### Class Structure

```python
class SelectorCache:
    """Redis cache for verified Playwright selectors.

    TTL: 7 days (604800 seconds), reset on successful use or heal.
    No PostgreSQL backup — cache miss triggers regeneration.
    """

    CACHE_TTL_SECONDS = 7 * 24 * 60 * 60  # 604800

    def __init__(self, redis_client):
        """Accept an async Redis client instance (redis.asyncio.Redis)."""

    async def get(self, tenant_id: str, url: str, goal: str) -> SelectorCacheEntry | None:
        """Return cached entry if found, None on miss.

        Reads the JSON-serialized SelectorCacheEntry from Redis.
        Does NOT refresh TTL on read (only on put/mark_heal).
        """

    async def put(self, tenant_id: str, url: str, goal: str,
                  actions: list) -> None:
        """Store a verified action list with 7-day TTL.

        Creates a new SelectorCacheEntry with the provided actions and
        current timestamp as created_at. If the key already exists, it
        is overwritten and TTL is reset.
        Uses Redis SET with EX parameter for atomic set+expire.
        """

    async def mark_heal(self, tenant_id: str, url: str, goal: str,
                        new_actions: list) -> None:
        """Update cache after a successful self-heal.

        1. Read existing entry (if missing, treat as new put)
        2. Replace actions with new_actions
        3. Increment heal_count by 1
        4. Set last_healed to current UTC timestamp
        5. Write back with TTL reset to 7 days
        """

    async def invalidate(self, tenant_id: str, url: str, goal: str) -> None:
        """Delete the cache entry for this tenant/url/goal.

        Called when all healing attempts are exhausted and the cached
        selectors are known to be invalid. Uses Redis DEL.
        """
```

### Redis Operations

- **get**: `await self._redis.get(key)` -- returns bytes or None. Deserialize with `json.loads()` and construct `SelectorCacheEntry`.
- **put**: `await self._redis.set(key, json.dumps(entry.model_dump(mode="json")), ex=self.CACHE_TTL_SECONDS)` -- atomic set with expiry.
- **mark_heal**: Read-modify-write pattern. Use `GET` then `SET` with `EX`. No need for transactions since only one task operates on a given key at a time (the execution is serial per URL+goal).
- **invalidate**: `await self._redis.delete(key)`.

### Serialization

Use Pydantic's `model_dump(mode="json")` to serialize `SelectorCacheEntry` for Redis storage. This handles `datetime` serialization to ISO strings automatically. On read, use `SelectorCacheEntry.model_validate(json.loads(raw))` to deserialize.

### Module Location and Imports

Create the file at `python-backend/app/services/selector_cache.py`. Ensure `python-backend/app/services/__init__.py` exists (it should already).

The module needs:
- `hashlib` (stdlib)
- `json` (stdlib)
- `datetime` (stdlib)
- `pydantic` (already a project dependency)
- `redis.asyncio` (already a project dependency, used throughout the backend)

### Integration Points

Downstream consumers (implemented in later sections):

1. **PlaywrightScriptGenerator** (section 04) calls `cache.get()` before invoking the Vision LLM. On successful script generation, calls `cache.put()`.
2. **SelfHealingExecutor** (section 05) calls `cache.mark_heal()` after a successful heal, and `cache.invalidate()` when healing is exhausted.

The `SelectorCache` instance is created in the Celery worker initialization (section 07) using the worker's shared Redis connection and passed to the generator and executor services.

## File Checklist

| Action | File Path |
|--------|-----------|
| Create | `python-backend/app/services/selector_cache.py` |
| Create | `python-backend/tests/unit/automation/test_selector_cache.py` |
| Create (if missing) | `python-backend/tests/unit/automation/__init__.py` |