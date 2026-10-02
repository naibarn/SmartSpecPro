"""Tests for BrowserPool -- Playwright instance pool with per-tenant limits."""

import asyncio
from contextlib import asynccontextmanager
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.services.automation_exceptions import BrowserCapacityError, BrowserLaunchError
from app.services.browser_pool import SYSTEM_MAX_BROWSERS, TENANT_MAX_BROWSERS, BrowserPool


@pytest.fixture
def mock_capacity_slots(monkeypatch):
    """In-memory stand-in for the PostgreSQL capacity-slot functions."""
    slots: dict[str, tuple[str, str]] = {}
    next_id = 0

    async def claim(namespace, subject, max_slots, ttl_seconds):
        nonlocal next_id
        occupied = sum(1 for scope, owner in slots.values() if scope == namespace and owner == subject)
        if occupied >= max_slots:
            return None
        next_id += 1
        slot_id = f"slot-{next_id}"
        slots[slot_id] = (namespace, subject)
        return slot_id

    async def release(namespace, slot_id):
        current = slots.get(slot_id)
        if current and current[0] == namespace:
            slots.pop(slot_id, None)

    monkeypatch.setattr("app.services.browser_pool.claim_capacity_slot", claim)
    monkeypatch.setattr("app.services.browser_pool.release_capacity_slot", release)
    return slots


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
    async def test_start_respects_playwright_kill_switch(self, mock_capacity_slots, monkeypatch):
        monkeypatch.setenv("SMARTSPEC_PLAYWRIGHT_ENABLED", "false")

        pool = BrowserPool()

        with pytest.raises(BrowserLaunchError, match="Playwright features are disabled"):
            await pool.start()

    async def test_start_initializes_playwright_and_launches_browser(self, mock_playwright, mock_capacity_slots):
        pool = BrowserPool()
        await pool.start()

        mock_playwright["pw_cm"].start.assert_awaited_once()
        mock_playwright["pw"].chromium.launch.assert_awaited_once_with(headless=True)
        assert pool._started is True

    async def test_stop_closes_browser_and_stops_playwright(self, mock_playwright, mock_capacity_slots):
        pool = BrowserPool()
        await pool.start()
        await pool.stop()

        mock_playwright["browser"].close.assert_awaited_once()
        mock_playwright["pw"].stop.assert_awaited_once()
        assert pool._started is False

    async def test_start_raises_browser_launch_error_on_failure(self, mock_playwright, mock_capacity_slots):
        mock_playwright["pw"].chromium.launch.side_effect = Exception("crash")
        pool = BrowserPool()
        with pytest.raises(BrowserLaunchError):
            await pool.start()


class TestBrowserPoolSession:
    async def test_session_yields_browser_context_and_closes_on_exit(self, mock_playwright, mock_capacity_slots):
        pool = BrowserPool()
        await pool.start()

        async with pool.session("tenant-1") as ctx:
            assert ctx is mock_playwright["context"]

        mock_playwright["context"].close.assert_awaited()

    async def test_session_calls_context_close_even_on_exception(self, mock_playwright, mock_capacity_slots):
        pool = BrowserPool()
        await pool.start()

        with pytest.raises(ValueError):
            async with pool.session("tenant-1") as ctx:
                raise ValueError("user error")

        mock_playwright["context"].close.assert_awaited()

    async def test_context_configured_with_correct_options(self, mock_playwright, mock_capacity_slots):
        pool = BrowserPool()
        await pool.start()

        async with pool.session("tenant-1"):
            pass

        call_kwargs = mock_playwright["browser"].new_context.call_args[1]
        assert call_kwargs["viewport"] == {"width": 1280, "height": 800}
        assert "Mozilla" in call_kwargs["user_agent"]
        assert call_kwargs["accept_downloads"] is False


class TestSystemLimit:
    async def test_acquire_up_to_system_limit_succeeds(self, mock_playwright, mock_capacity_slots):
        pool = BrowserPool()
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

    async def test_11th_acquire_raises_browser_capacity_error(self, mock_playwright, mock_capacity_slots):
        pool = BrowserPool()
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
    async def test_acquire_up_to_tenant_limit_succeeds(self, mock_playwright, mock_capacity_slots):
        pool = BrowserPool()
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

    async def test_3rd_acquire_same_tenant_raises_browser_capacity_error(self, mock_playwright, mock_capacity_slots):
        pool = BrowserPool()
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

    async def test_different_tenants_can_acquire_independently(self, mock_playwright, mock_capacity_slots):
        pool = BrowserPool()
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


class TestPostgresCapacitySlots:
    async def test_capacity_slot_is_released_after_session(self, mock_playwright, mock_capacity_slots):
        pool = BrowserPool()
        await pool.start()

        async with pool.session("tenant-X"):
            assert len(mock_capacity_slots) == 1

        assert mock_capacity_slots == {}

    async def test_slot_released_when_context_creation_fails(self, mock_playwright, mock_capacity_slots):
        mock_playwright["browser"].new_context.side_effect = RuntimeError("browser context failed")
        pool = BrowserPool()
        await pool.start()

        with pytest.raises(RuntimeError, match="browser context failed"):
            async with pool.session("tenant-X"):
                pass

        assert mock_capacity_slots == {}
