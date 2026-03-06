"""Tests for BrowserPool -- Playwright instance pool with per-tenant limits."""

import asyncio
from contextlib import asynccontextmanager
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.services.automation_exceptions import BrowserCapacityError, BrowserLaunchError
from app.services.browser_pool import SYSTEM_MAX_BROWSERS, TENANT_MAX_BROWSERS, BrowserPool


@pytest.fixture
def mock_redis():
    """Mock redis.asyncio.Redis with incr/decr/get/expire/delete/set."""
    redis = AsyncMock()
    # Track counters per key for realistic behavior
    counters: dict[str, int] = {}

    async def incr_side_effect(key):
        counters[key] = counters.get(key, 0) + 1
        return counters[key]

    async def decr_side_effect(key):
        counters[key] = counters.get(key, 0) - 1
        return counters[key]

    async def set_side_effect(key, value, **kwargs):
        counters[key] = int(value)

    redis.incr = AsyncMock(side_effect=incr_side_effect)
    redis.decr = AsyncMock(side_effect=decr_side_effect)
    redis.expire = AsyncMock()
    redis.set = AsyncMock(side_effect=set_side_effect)
    redis.delete = AsyncMock()
    redis._counters = counters
    return redis


@pytest.fixture
def mock_playwright():
    """Mock async_playwright() context manager."""
    mock_context = AsyncMock()
    mock_context.close = AsyncMock()

    mock_browser = AsyncMock()
    mock_browser.new_context = AsyncMock(return_value=mock_context)
    mock_browser.close = AsyncMock()

    mock_pw = MagicMock()
    mock_pw.chromium = MagicMock()
    mock_pw.chromium.launch = AsyncMock(return_value=mock_browser)
    mock_pw.stop = AsyncMock()

    mock_pw_cm = AsyncMock()
    mock_pw_cm.start = AsyncMock(return_value=mock_pw)

    with patch("app.services.browser_pool.async_playwright", return_value=mock_pw_cm):
        yield {
            "pw": mock_pw,
            "pw_cm": mock_pw_cm,
            "browser": mock_browser,
            "context": mock_context,
        }


class TestBrowserPoolStartStop:
    async def test_start_initializes_playwright_and_launches_browser(self, mock_playwright, mock_redis):
        pool = BrowserPool(redis_client=mock_redis)
        await pool.start()

        mock_playwright["pw_cm"].start.assert_awaited_once()
        mock_playwright["pw"].chromium.launch.assert_awaited_once_with(headless=True)
        assert pool._started is True

    async def test_stop_closes_browser_and_stops_playwright(self, mock_playwright, mock_redis):
        pool = BrowserPool(redis_client=mock_redis)
        await pool.start()
        await pool.stop()

        mock_playwright["browser"].close.assert_awaited_once()
        mock_playwright["pw"].stop.assert_awaited_once()
        assert pool._started is False

    async def test_start_raises_browser_launch_error_on_failure(self, mock_playwright, mock_redis):
        mock_playwright["pw"].chromium.launch.side_effect = Exception("crash")
        pool = BrowserPool(redis_client=mock_redis)
        with pytest.raises(BrowserLaunchError):
            await pool.start()


class TestBrowserPoolSession:
    async def test_session_yields_browser_context_and_closes_on_exit(self, mock_playwright, mock_redis):
        pool = BrowserPool(redis_client=mock_redis)
        await pool.start()

        async with pool.session("tenant-1") as ctx:
            assert ctx is mock_playwright["context"]

        mock_playwright["context"].close.assert_awaited()

    async def test_session_calls_context_close_even_on_exception(self, mock_playwright, mock_redis):
        pool = BrowserPool(redis_client=mock_redis)
        await pool.start()

        with pytest.raises(ValueError):
            async with pool.session("tenant-1") as ctx:
                raise ValueError("user error")

        mock_playwright["context"].close.assert_awaited()

    async def test_context_configured_with_correct_options(self, mock_playwright, mock_redis):
        pool = BrowserPool(redis_client=mock_redis)
        await pool.start()

        async with pool.session("tenant-1"):
            pass

        call_kwargs = mock_playwright["browser"].new_context.call_args[1]
        assert call_kwargs["viewport"] == {"width": 1280, "height": 800}
        assert "Mozilla" in call_kwargs["user_agent"]
        assert call_kwargs["accept_downloads"] is False


class TestSystemLimit:
    async def test_acquire_up_to_system_limit_succeeds(self, mock_playwright, mock_redis):
        pool = BrowserPool(redis_client=mock_redis)
        await pool.start()

        # Create unique contexts for each session
        contexts = [AsyncMock() for _ in range(SYSTEM_MAX_BROWSERS)]
        mock_playwright["browser"].new_context = AsyncMock(side_effect=contexts)

        sessions = []
        for i in range(SYSTEM_MAX_BROWSERS):
            cm = pool.session(f"tenant-{i}")
            ctx = await cm.__aenter__()
            sessions.append((cm, ctx))

        assert len(sessions) == SYSTEM_MAX_BROWSERS

        # Cleanup
        for cm, ctx in sessions:
            await cm.__aexit__(None, None, None)

    async def test_11th_acquire_raises_browser_capacity_error(self, mock_playwright, mock_redis):
        pool = BrowserPool(redis_client=mock_redis)
        await pool.start()

        contexts = [AsyncMock() for _ in range(SYSTEM_MAX_BROWSERS)]
        mock_playwright["browser"].new_context = AsyncMock(side_effect=contexts)

        sessions = []
        for i in range(SYSTEM_MAX_BROWSERS):
            cm = pool.session(f"tenant-{i}")
            ctx = await cm.__aenter__()
            sessions.append((cm, ctx))

        with pytest.raises(BrowserCapacityError, match="system"):
            async with pool.session("tenant-overflow"):
                pass

        for cm, ctx in sessions:
            await cm.__aexit__(None, None, None)


class TestTenantLimit:
    async def test_acquire_up_to_tenant_limit_succeeds(self, mock_playwright, mock_redis):
        pool = BrowserPool(redis_client=mock_redis)
        await pool.start()

        contexts = [AsyncMock() for _ in range(TENANT_MAX_BROWSERS)]
        mock_playwright["browser"].new_context = AsyncMock(side_effect=contexts)

        sessions = []
        for _ in range(TENANT_MAX_BROWSERS):
            cm = pool.session("tenant-A")
            ctx = await cm.__aenter__()
            sessions.append((cm, ctx))

        assert len(sessions) == TENANT_MAX_BROWSERS

        for cm, ctx in sessions:
            await cm.__aexit__(None, None, None)

    async def test_3rd_acquire_same_tenant_raises_browser_capacity_error(self, mock_playwright, mock_redis):
        pool = BrowserPool(redis_client=mock_redis)
        await pool.start()

        contexts = [AsyncMock() for _ in range(TENANT_MAX_BROWSERS)]
        mock_playwright["browser"].new_context = AsyncMock(side_effect=contexts)

        sessions = []
        for _ in range(TENANT_MAX_BROWSERS):
            cm = pool.session("tenant-A")
            ctx = await cm.__aenter__()
            sessions.append((cm, ctx))

        with pytest.raises(BrowserCapacityError, match="tenant"):
            async with pool.session("tenant-A"):
                pass

        for cm, ctx in sessions:
            await cm.__aexit__(None, None, None)

    async def test_different_tenants_can_acquire_independently(self, mock_playwright, mock_redis):
        pool = BrowserPool(redis_client=mock_redis)
        await pool.start()

        contexts = [AsyncMock() for _ in range(4)]
        mock_playwright["browser"].new_context = AsyncMock(side_effect=contexts)

        sessions = []
        for _ in range(TENANT_MAX_BROWSERS):
            cm = pool.session("tenant-A")
            ctx = await cm.__aenter__()
            sessions.append((cm, ctx))

        for _ in range(TENANT_MAX_BROWSERS):
            cm = pool.session("tenant-B")
            ctx = await cm.__aenter__()
            sessions.append((cm, ctx))

        assert len(sessions) == 4

        for cm, ctx in sessions:
            await cm.__aexit__(None, None, None)


class TestRedisCounters:
    async def test_redis_counter_incremented_on_acquire(self, mock_playwright, mock_redis):
        pool = BrowserPool(redis_client=mock_redis)
        await pool.start()

        async with pool.session("tenant-X"):
            pass

        mock_redis.incr.assert_awaited_with("browser_pool:tenant:tenant-X")

    async def test_redis_counter_decremented_on_release(self, mock_playwright, mock_redis):
        pool = BrowserPool(redis_client=mock_redis)
        await pool.start()

        async with pool.session("tenant-X"):
            pass

        mock_redis.decr.assert_awaited_with("browser_pool:tenant:tenant-X")

    async def test_redis_counter_never_goes_below_zero(self, mock_playwright, mock_redis):
        pool = BrowserPool(redis_client=mock_redis)
        await pool.start()

        # Force counter to go negative on decr
        mock_redis._counters["browser_pool:tenant:tenant-Z"] = 0
        mock_redis.decr = AsyncMock(return_value=-1)

        async with pool.session("tenant-Z"):
            pass

        # Should set to 0 when decr returns negative
        mock_redis.set.assert_awaited()

    async def test_redis_key_has_ttl_safety_net(self, mock_playwright, mock_redis):
        pool = BrowserPool(redis_client=mock_redis)
        await pool.start()

        async with pool.session("tenant-X"):
            pass

        mock_redis.expire.assert_awaited_with("browser_pool:tenant:tenant-X", 300)
