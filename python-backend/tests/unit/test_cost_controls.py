"""Tests for TokenBudgetTracker and ConcurrentRunLimiter."""

import pytest
from unittest.mock import AsyncMock

from app.services.agentic_cost_controls import (
    AcquireResult,
    ConcurrentRunLimiter,
    TokenBudgetTracker,
)


# ── TokenBudgetTracker Tests ──


def test_under_budget_not_exceeded():
    t = TokenBudgetTracker(budget=50000)
    t.record_usage(1000)
    assert t.is_exceeded() is False


def test_over_budget_exceeded():
    t = TokenBudgetTracker(budget=50000)
    t.record_usage(51000)
    assert t.is_exceeded() is True


def test_cumulative_usage_tracking():
    t = TokenBudgetTracker(budget=50000)
    t.record_usage(20000)
    t.record_usage(20000)
    assert t.total_tokens == 40000
    assert t.is_exceeded() is False
    t.record_usage(15000)
    assert t.is_exceeded() is True


def test_warning_at_80_threshold():
    t = TokenBudgetTracker(budget=50000)
    t.record_usage(40000)
    assert t.should_warn() is True
    assert t.is_exceeded() is False


def test_warning_not_triggered_below_80():
    t = TokenBudgetTracker(budget=50000)
    t.record_usage(39000)
    assert t.should_warn() is False


def test_warning_fires_only_once():
    t = TokenBudgetTracker(budget=50000)
    t.record_usage(40000)
    assert t.should_warn() is True
    assert t.should_warn() is False


def test_get_status_returns_correct_dict():
    t = TokenBudgetTracker(budget=50000)
    t.record_usage(25000)
    status = t.get_status()
    assert status["used_tokens"] == 25000
    assert status["budget"] == 50000
    assert status["used_pct"] == 50.0
    assert status["is_exceeded"] is False


def test_zero_budget_means_unlimited():
    t = TokenBudgetTracker(budget=0)
    t.record_usage(999999)
    assert t.is_exceeded() is False
    assert t.should_warn() is False


# ── ConcurrentRunLimiter Tests ──


def make_mock_redis_counter():
    """Create mock Redis that simulates Lua eval for atomic acquire."""
    counters: dict[str, int] = {}
    mock = AsyncMock()

    async def mock_eval(script, numkeys, *args):
        """Simulate the acquire Lua script behavior."""
        tenant_key = args[0]
        user_key = args[1]
        tenant_max = int(args[2])
        user_max = int(args[3])

        counters[tenant_key] = counters.get(tenant_key, 0) + 1
        if counters[tenant_key] > tenant_max:
            counters[tenant_key] -= 1
            return -1

        counters[user_key] = counters.get(user_key, 0) + 1
        if counters[user_key] > user_max:
            counters[user_key] -= 1
            counters[tenant_key] -= 1
            return -2

        return 1

    async def mock_decr(key):
        counters[key] = counters.get(key, 0) - 1
        return counters[key]

    async def mock_set(key, value, **kwargs):
        counters[key] = int(value)

    mock.eval = AsyncMock(side_effect=mock_eval)
    mock.decr = AsyncMock(side_effect=mock_decr)
    mock.expire = AsyncMock()
    mock.set = AsyncMock(side_effect=mock_set)
    mock._counters = counters
    return mock


@pytest.mark.asyncio
async def test_first_acquire_succeeds():
    redis = make_mock_redis_counter()
    limiter = ConcurrentRunLimiter(redis, per_tenant_max=3)
    result = await limiter.acquire("t1", "u1", "react", "run1")
    assert result.success is True


@pytest.mark.asyncio
async def test_acquire_blocked_when_tenant_limit_reached():
    redis = make_mock_redis_counter()
    limiter = ConcurrentRunLimiter(redis, per_tenant_max=2)
    r1 = await limiter.acquire("t1", "u1", "react", "run1")
    r2 = await limiter.acquire("t1", "u2", "react", "run2")
    r3 = await limiter.acquire("t1", "u3", "react", "run3")
    assert r1.success is True
    assert r2.success is True
    assert r3.success is False
    assert r3.error_code == "concurrent_limit_exceeded"


@pytest.mark.asyncio
async def test_release_decrements_next_acquire_succeeds():
    redis = make_mock_redis_counter()
    limiter = ConcurrentRunLimiter(redis, per_tenant_max=1)
    r1 = await limiter.acquire("t1", "u1", "react", "run1")
    assert r1.success is True
    await limiter.release("t1", "u1", "react", "run1")
    r2 = await limiter.acquire("t1", "u1", "react", "run2")
    assert r2.success is True


@pytest.mark.asyncio
async def test_per_user_limit_react():
    redis = make_mock_redis_counter()
    limiter = ConcurrentRunLimiter(redis, per_tenant_max=10, per_user_react_max=2)
    r1 = await limiter.acquire("t1", "u1", "react", "run1")
    r2 = await limiter.acquire("t1", "u1", "react", "run2")
    r3 = await limiter.acquire("t1", "u1", "react", "run3")
    assert r1.success is True
    assert r2.success is True
    assert r3.success is False


@pytest.mark.asyncio
async def test_per_user_limit_autonomous():
    redis = make_mock_redis_counter()
    limiter = ConcurrentRunLimiter(redis, per_tenant_max=10, per_user_autonomous_max=1)
    r1 = await limiter.acquire("t1", "u1", "autonomous", "run1")
    r2 = await limiter.acquire("t1", "u1", "autonomous", "run2")
    assert r1.success is True
    assert r2.success is False


@pytest.mark.asyncio
async def test_different_tenants_independent():
    redis = make_mock_redis_counter()
    limiter = ConcurrentRunLimiter(redis, per_tenant_max=1)
    r1 = await limiter.acquire("t1", "u1", "react", "run1")
    r2 = await limiter.acquire("t2", "u2", "react", "run2")
    assert r1.success is True
    assert r2.success is True


@pytest.mark.asyncio
async def test_ttl_passed_to_lua_script():
    redis = make_mock_redis_counter()
    limiter = ConcurrentRunLimiter(redis, per_tenant_max=3, ttl_seconds=3600)
    await limiter.acquire("t1", "u1", "react", "run1")
    # TTL is passed as ARGV[3] to the Lua script
    redis.eval.assert_called_once()
    call_args = redis.eval.call_args[0]
    assert call_args[6] == 3600  # ttl_seconds is ARGV[3] (7th positional after script, numkeys, 2 keys, 2 args)


@pytest.mark.asyncio
async def test_acquire_returns_error_details():
    redis = make_mock_redis_counter()
    limiter = ConcurrentRunLimiter(redis, per_tenant_max=1)
    await limiter.acquire("t1", "u1", "react", "run1")
    result = await limiter.acquire("t1", "u2", "react", "run2")
    assert result.success is False
    assert result.error_code == "concurrent_limit_exceeded"
    assert result.retry_after == 30
    assert "Maximum concurrent" in result.message


@pytest.mark.asyncio
async def test_none_redis_is_noop():
    limiter = ConcurrentRunLimiter(redis_client=None)
    result = await limiter.acquire("t1", "u1", "react", "run1")
    assert result.success is True
    await limiter.release("t1", "u1", "react", "run1")  # No error
