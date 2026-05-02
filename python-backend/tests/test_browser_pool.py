"""Tests for BrowserPool worker-loop lifecycle and session management.

Validates that the persistent worker event loop pattern works correctly:
- BrowserPool + tasks share the same event loop
- Cross-loop usage is prevented by design
- Session acquire/release works with Redis counting
"""

import asyncio
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.services.browser_pool import (
    BrowserPool,
    get_browser_pool,
    get_worker_loop,
)


# ── get_worker_loop ──────────────────────────────────────────────────────────


class TestGetWorkerLoop:
    def test_returns_event_loop(self):
        """get_worker_loop() returns an asyncio event loop."""
        # Reset global state for isolation
        import app.services.browser_pool as bp

        old = bp._worker_loop
        bp._worker_loop = None
        try:
            loop = get_worker_loop()
            assert isinstance(loop, asyncio.AbstractEventLoop)
            assert not loop.is_closed()
        finally:
            # Close the loop we just created and restore
            if bp._worker_loop is not old:
                bp._worker_loop.close()
            bp._worker_loop = old

    def test_get_browser_pool_respects_playwright_kill_switch(self, monkeypatch):
        """get_browser_pool() fails closed when local Playwright is disabled."""
        from app.services.automation_exceptions import BrowserLaunchError
        import app.services.browser_pool as bp

        monkeypatch.setenv("SMARTSPEC_PLAYWRIGHT_ENABLED", "false")
        old_pool = bp._pool
        bp._pool = None
        try:
            with pytest.raises(BrowserLaunchError, match="Playwright features are disabled"):
                get_browser_pool()
        finally:
            bp._pool = old_pool

    def test_browser_pool_health_check_skips_when_disabled(self, monkeypatch):
        """Beat health checks must not lazy-start Playwright during an incident."""
        from app.tasks.automation_copilot_task import browser_pool_health_check

        monkeypatch.setenv("SMARTSPEC_PLAYWRIGHT_ENABLED", "false")

        assert browser_pool_health_check() == {"disabled": True, "released": 0}

    def test_returns_same_loop_on_second_call(self):
        """get_worker_loop() returns the same loop instance on repeated calls."""
        import app.services.browser_pool as bp

        old = bp._worker_loop
        bp._worker_loop = None
        try:
            loop1 = get_worker_loop()
            loop2 = get_worker_loop()
            assert loop1 is loop2
        finally:
            if bp._worker_loop is not old:
                bp._worker_loop.close()
            bp._worker_loop = old

    def test_creates_new_loop_if_closed(self):
        """get_worker_loop() creates a new loop if the current one is closed."""
        import app.services.browser_pool as bp

        old = bp._worker_loop
        bp._worker_loop = None
        try:
            loop1 = get_worker_loop()
            loop1.close()
            loop2 = get_worker_loop()
            assert loop2 is not loop1
            assert not loop2.is_closed()
        finally:
            if bp._worker_loop is not old:
                bp._worker_loop.close()
            bp._worker_loop = old


# ── BrowserPool session ──────────────────────────────────────────────────────


class TestBrowserPoolSession:
    @pytest.mark.asyncio
    async def test_session_acquires_and_releases_semaphore(self):
        """Session context manager properly acquires and releases the system semaphore."""
        mock_redis = AsyncMock()
        mock_redis.incr = AsyncMock(return_value=1)
        mock_redis.expire = AsyncMock()
        mock_redis.decr = AsyncMock(return_value=0)
        mock_redis.set = AsyncMock()

        pool = BrowserPool(redis_client=mock_redis)
        pool._started = True

        mock_context = AsyncMock()
        mock_browser = AsyncMock()
        mock_browser.new_context = AsyncMock(return_value=mock_context)
        pool._browser = mock_browser

        initial_value = pool._semaphore._value

        async with pool.session("test-tenant") as ctx:
            assert pool._semaphore._value == initial_value - 1
            assert ctx is mock_context

        assert pool._semaphore._value == initial_value

    @pytest.mark.asyncio
    async def test_session_increments_and_decrements_redis_counter(self):
        """Session increments Redis tenant counter on enter and decrements on exit."""
        mock_redis = AsyncMock()
        mock_redis.incr = AsyncMock(return_value=1)
        mock_redis.expire = AsyncMock()
        mock_redis.decr = AsyncMock(return_value=0)

        pool = BrowserPool(redis_client=mock_redis)
        pool._started = True

        mock_context = AsyncMock()
        mock_browser = AsyncMock()
        mock_browser.new_context = AsyncMock(return_value=mock_context)
        pool._browser = mock_browser

        async with pool.session("t1") as _ctx:
            mock_redis.incr.assert_called_once_with("browser_pool:tenant:t1")

        mock_redis.decr.assert_called_once_with("browser_pool:tenant:t1")

    @pytest.mark.asyncio
    async def test_session_rejects_when_not_started(self):
        """Session raises BrowserLaunchError if pool is not started."""
        from app.services.automation_exceptions import BrowserLaunchError

        mock_redis = AsyncMock()
        pool = BrowserPool(redis_client=mock_redis)
        # _started is False by default

        with pytest.raises(BrowserLaunchError, match="not started"):
            async with pool.session("t1"):
                pass

    @pytest.mark.asyncio
    async def test_session_rejects_over_tenant_limit(self):
        """Session raises BrowserCapacityError when tenant limit exceeded."""
        from app.services.automation_exceptions import BrowserCapacityError

        mock_redis = AsyncMock()
        mock_redis.incr = AsyncMock(return_value=3)  # Over TENANT_MAX_BROWSERS=2
        mock_redis.expire = AsyncMock()
        mock_redis.decr = AsyncMock(return_value=2)

        pool = BrowserPool(redis_client=mock_redis)
        pool._started = True
        pool._browser = AsyncMock()

        with pytest.raises(BrowserCapacityError, match="tenant capacity"):
            async with pool.session("t1"):
                pass


# ── Event loop lifecycle integration ─────────────────────────────────────────


class TestEventLoopLifecycle:
    def test_run_async_uses_worker_loop(self):
        """_run_async from the task module uses get_worker_loop, not a new loop."""
        import app.services.browser_pool as bp

        old = bp._worker_loop
        bp._worker_loop = None
        try:
            from app.tasks.automation_copilot_task import _run_async

            async def return_42():
                return 42

            result = _run_async(return_42())
            # After _run_async, the worker loop should still be open
            assert bp._worker_loop is not None
            assert not bp._worker_loop.is_closed()
            assert result == 42
        finally:
            if bp._worker_loop is not old:
                bp._worker_loop.close()
            bp._worker_loop = old

    def test_run_async_reuses_loop(self):
        """Multiple _run_async calls reuse the same event loop."""
        import app.services.browser_pool as bp

        old = bp._worker_loop
        bp._worker_loop = None
        try:
            from app.tasks.automation_copilot_task import _run_async

            async def get_loop_id():
                return id(asyncio.get_running_loop())

            id1 = _run_async(get_loop_id())
            id2 = _run_async(get_loop_id())
            assert id1 == id2
        finally:
            if bp._worker_loop is not old:
                bp._worker_loop.close()
            bp._worker_loop = old
