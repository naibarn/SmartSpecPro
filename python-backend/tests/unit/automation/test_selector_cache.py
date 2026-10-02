"""Tests for the PostgreSQL TTL-backed selector action cache."""

import hashlib

import pytest

from app.services.selector_cache import SelectorCache, SelectorCacheEntry


@pytest.fixture
def cache(monkeypatch):
    from app.services import selector_cache as module

    store: dict[tuple[str, str], dict] = {}
    ttls: dict[tuple[str, str], int] = {}

    async def read(namespace, key):
        return store.get((namespace, key))

    async def put(namespace, key, value, ttl):
        store[(namespace, key)] = value
        ttls[(namespace, key)] = ttl

    async def delete(namespace, key):
        store.pop((namespace, key), None)

    monkeypatch.setattr(module, "read_value", read)
    monkeypatch.setattr(module, "put_value", put)
    monkeypatch.setattr(module, "delete_value", delete)
    instance = SelectorCache()
    instance._test_store = store
    instance._test_ttls = ttls
    return instance


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


async def test_put_sets_ttl_seven_days(cache):
    await cache.put("tenant-1", "http://example.com", "click button", SAMPLE_ACTIONS)

    # Check TTL was set to 604800 (7 days)
    key = cache._build_key("tenant-1", "http://example.com", "click button")
    assert cache._test_ttls[("playwright_selector_cache", key)] == 604800


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
    assert key == f"tenant-1:{url_hash}:{goal_hash}"
