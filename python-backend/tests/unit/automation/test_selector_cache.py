"""Tests for SelectorCache — Redis-backed action list cache."""

import hashlib
from unittest.mock import AsyncMock

import pytest

from app.services.selector_cache import SelectorCache, SelectorCacheEntry


@pytest.fixture
def mock_redis():
    """Mock redis.asyncio.Redis with get/set/delete."""
    redis = AsyncMock()
    store: dict[str, bytes] = {}
    ttls: dict[str, int] = {}

    async def set_side_effect(key, value, **kwargs):
        store[key] = value if isinstance(value, bytes) else value.encode()
        if "ex" in kwargs:
            ttls[key] = kwargs["ex"]

    async def get_side_effect(key):
        return store.get(key)

    async def delete_side_effect(*keys):
        for k in keys:
            store.pop(k, None)
            ttls.pop(k, None)

    redis.set = AsyncMock(side_effect=set_side_effect)
    redis.get = AsyncMock(side_effect=get_side_effect)
    redis.delete = AsyncMock(side_effect=delete_side_effect)
    redis._store = store
    redis._ttls = ttls
    return redis


@pytest.fixture
def cache(mock_redis):
    return SelectorCache(redis_client=mock_redis)


SAMPLE_ACTIONS = [{"action": "click", "selector": "#btn"}]


async def test_get_returns_none_on_cache_miss(cache):
    result = await cache.get("tenant-1", "http://example.com", "click button")
    assert result is None


async def test_put_stores_and_get_returns_entry(cache):
    await cache.put("tenant-1", "http://example.com", "click button", SAMPLE_ACTIONS)
    entry = await cache.get("tenant-1", "http://example.com", "click button")

    assert entry is not None
    assert isinstance(entry, SelectorCacheEntry)
    assert entry.url == "http://example.com"
    assert entry.goal == "click button"
    assert entry.actions == SAMPLE_ACTIONS
    assert entry.success_count == 0
    assert entry.heal_count == 0


async def test_put_sets_ttl_seven_days(cache, mock_redis):
    await cache.put("tenant-1", "http://example.com", "click button", SAMPLE_ACTIONS)

    # Check TTL was set to 604800 (7 days)
    key = cache._build_key("tenant-1", "http://example.com", "click button")
    assert mock_redis._ttls.get(key) == 604800


async def test_mark_heal_updates_entry(cache):
    await cache.put("tenant-1", "http://example.com", "click button", SAMPLE_ACTIONS)

    new_actions = [{"action": "click", "selector": "#new-btn"}]
    await cache.mark_heal("tenant-1", "http://example.com", "click button", new_actions)

    entry = await cache.get("tenant-1", "http://example.com", "click button")
    assert entry is not None
    assert entry.actions == new_actions
    assert entry.heal_count == 1
    assert entry.last_healed is not None


async def test_invalidate_deletes_key(cache):
    await cache.put("tenant-1", "http://example.com", "click button", SAMPLE_ACTIONS)
    await cache.invalidate("tenant-1", "http://example.com", "click button")

    entry = await cache.get("tenant-1", "http://example.com", "click button")
    assert entry is None


async def test_cache_key_tenant_isolation(cache):
    await cache.put("tenant-A", "http://example.com", "goal", SAMPLE_ACTIONS)
    entry = await cache.get("tenant-B", "http://example.com", "goal")
    assert entry is None


async def test_cache_key_uses_sha256_hashes(cache):
    url = "http://example.com"
    goal = "click button"
    key = cache._build_key("tenant-1", url, goal)

    url_hash = hashlib.sha256(url.encode()).hexdigest()[:32]
    goal_hash = hashlib.sha256(goal.encode()).hexdigest()[:32]
    assert key == f"selcache:tenant-1:{url_hash}:{goal_hash}"
