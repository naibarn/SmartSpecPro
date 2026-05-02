"""Playwright browser instance pool with per-tenant concurrency limits."""

from __future__ import annotations

import asyncio
import logging
import time
from contextlib import asynccontextmanager
from typing import TYPE_CHECKING, AsyncGenerator

from app.services.automation_exceptions import BrowserCapacityError, BrowserLaunchError

if TYPE_CHECKING:
    import redis.asyncio as aioredis
    from playwright.async_api import Browser, BrowserContext, Playwright

logger = logging.getLogger(__name__)

async_playwright = None

SYSTEM_MAX_BROWSERS = 10
TENANT_MAX_BROWSERS = 2
IDLE_TIMEOUT_SECONDS = 60
_REDIS_KEY_PREFIX = "browser_pool:tenant:"
_REDIS_TTL = 300

_USER_AGENT = (
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
)


class BrowserPool:
    """Manages a shared Chromium browser with per-tenant context limits."""

    def __init__(self, redis_client: aioredis.Redis) -> None:
        self._redis = redis_client
        self._playwright: Playwright | None = None
        self._browser: Browser | None = None
        self._semaphore = asyncio.Semaphore(SYSTEM_MAX_BROWSERS)
        self._started = False
        self._active_sessions: dict[str, float] = {}

    async def start(self) -> None:
        try:
            global async_playwright
            from app.services.playwright_feature_gate import require_playwright_enabled

            require_playwright_enabled()
            if async_playwright is None:
                from playwright.async_api import async_playwright as _async_playwright

                async_playwright = _async_playwright

            pw_cm = async_playwright()
            self._playwright = await pw_cm.start()
            self._browser = await self._playwright.chromium.launch(headless=True)
            self._started = True
            logger.info("BrowserPool started")
        except Exception as exc:
            raise BrowserLaunchError(
                f"Failed to launch browser: {exc}",
                details={"error": str(exc)},
            ) from exc

    async def stop(self) -> None:
        if self._browser is not None:
            try:
                await self._browser.close()
            except Exception:
                logger.warning("Error closing browser, killing child processes", exc_info=True)
                self._kill_child_chrome_processes()
        if self._playwright is not None:
            try:
                await self._playwright.stop()
            except Exception:
                logger.warning("Error stopping playwright", exc_info=True)
        self._started = False
        logger.info("BrowserPool stopped")

    @staticmethod
    def _kill_child_chrome_processes() -> None:
        """Kill any orphaned chrome child processes spawned by this worker."""
        import os
        import signal

        my_pid = os.getpid()
        try:
            import subprocess

            result = subprocess.run(
                ["pgrep", "-P", str(my_pid), "-f", "chrom"],
                capture_output=True,
                text=True,
                timeout=5,
            )
            for line in result.stdout.strip().splitlines():
                pid = int(line.strip())
                try:
                    os.kill(pid, signal.SIGKILL)
                    logger.info("Killed orphaned chrome child PID=%d", pid)
                except OSError:
                    pass
        except Exception:
            logger.warning("Failed to enumerate chrome children", exc_info=True)

    @asynccontextmanager
    async def session(self, tenant_id: str) -> AsyncGenerator[BrowserContext, None]:
        if not self._started:
            raise BrowserLaunchError("BrowserPool not started")

        # System-wide limit (non-blocking)
        try:
            await asyncio.wait_for(self._semaphore.acquire(), timeout=0.01)
        except asyncio.TimeoutError:
            raise BrowserCapacityError(
                "Browser system capacity limit reached",
                details={"system_max": SYSTEM_MAX_BROWSERS},
            )

        redis_key = f"{_REDIS_KEY_PREFIX}{tenant_id}"
        context: BrowserContext | None = None
        try:
            # Per-tenant limit via Redis
            count = await self._redis.incr(redis_key)
            await self._redis.expire(redis_key, _REDIS_TTL)

            if count > TENANT_MAX_BROWSERS:
                await self._redis.decr(redis_key)
                raise BrowserCapacityError(
                    f"Browser tenant capacity limit reached for {tenant_id}",
                    details={"tenant_id": tenant_id, "tenant_max": TENANT_MAX_BROWSERS},
                )

            assert self._browser is not None
            context = await self._browser.new_context(
                viewport={"width": 1280, "height": 800},
                user_agent=_USER_AGENT,
                accept_downloads=False,
            )
            session_key = f"{tenant_id}:{id(context)}"
            self._active_sessions[session_key] = time.monotonic()

            yield context
        except BrowserCapacityError:
            self._semaphore.release()
            raise
        finally:
            if context is not None:
                session_key = f"{tenant_id}:{id(context)}"
                self._active_sessions.pop(session_key, None)
                try:
                    await context.close()
                except Exception:
                    logger.warning("Failed to close browser context", exc_info=True)

                result = await self._redis.decr(redis_key)
                if result < 0:
                    await self._redis.set(redis_key, 0, ex=_REDIS_TTL)

                self._semaphore.release()

    async def force_release_orphans(self, max_age_seconds: int = 360) -> int:
        """Release contexts held longer than max_age_seconds. Returns count released."""
        now = time.monotonic()
        released = 0
        orphans = [
            (key, ts)
            for key, ts in self._active_sessions.items()
            if (now - ts) > max_age_seconds
        ]
        for key, _ts in orphans:
            tenant_id = key.split(":")[0]
            redis_key = f"{_REDIS_KEY_PREFIX}{tenant_id}"
            self._active_sessions.pop(key, None)
            try:
                result = await self._redis.decr(redis_key)
                if result < 0:
                    await self._redis.set(redis_key, 0, ex=_REDIS_TTL)
                self._semaphore.release()
                released += 1
            except Exception:
                logger.warning("Failed to release orphan %s", key, exc_info=True)
        return released


_pool: BrowserPool | None = None
_worker_loop: asyncio.AbstractEventLoop | None = None


def get_worker_loop() -> asyncio.AbstractEventLoop:
    """Return the persistent worker-scoped event loop.

    Playwright's async API binds to the event loop where the browser was
    launched.  All async operations (browser pool, Redis, HTTP) MUST run
    on the same loop to avoid cross-loop hangs.
    """
    global _worker_loop
    if _worker_loop is None or _worker_loop.is_closed():
        _worker_loop = asyncio.new_event_loop()
    return _worker_loop


def get_browser_pool() -> BrowserPool:
    """Return the worker-scoped BrowserPool singleton, starting it on first use."""
    from app.services.playwright_feature_gate import require_playwright_enabled

    require_playwright_enabled()
    if _pool is None:
        init_browser_pool_sync()
    if _pool is None:
        raise BrowserLaunchError("BrowserPool not initialized -- Playwright failed to start")
    return _pool


def init_browser_pool_sync() -> None:
    """Initialize the BrowserPool singleton for the current worker process."""
    global _pool
    if _pool is not None:
        return

    from app.services.playwright_feature_gate import require_playwright_enabled

    require_playwright_enabled()

    import os

    import redis.asyncio as aioredis

    redis_url = os.getenv("REDIS_URL", os.getenv("CELERY_BROKER_URL", "redis://localhost:6379/0"))
    redis_client = aioredis.from_url(redis_url)

    loop = get_worker_loop()
    try:
        pool = BrowserPool(redis_client=redis_client)
        loop.run_until_complete(pool.start())
        _pool = pool
        logger.info("BrowserPool initialized")
    except Exception:
        logger.warning("BrowserPool init skipped (Playwright not available)", exc_info=True)
    # NOTE: Do NOT close the loop — it must stay alive for Playwright operations


def shutdown_browser_pool_sync() -> None:
    """Shut down the BrowserPool singleton. Called from Celery worker_process_shutdown signal."""
    global _pool, _worker_loop
    if _pool is None:
        return

    loop = get_worker_loop()
    try:
        loop.run_until_complete(asyncio.wait_for(_pool.stop(), timeout=5.0))
    except Exception:
        logger.warning("BrowserPool shutdown error (timeout or exception)", exc_info=True)
        # Last resort: kill chrome children directly
        BrowserPool._kill_child_chrome_processes()
    finally:
        _pool = None
        if _worker_loop is not None:
            _worker_loop.close()
            _worker_loop = None


def _atexit_cleanup() -> None:
    """Emergency cleanup when process exits without graceful Celery shutdown."""
    try:
        shutdown_browser_pool_sync()
    except Exception:
        pass


import atexit as _atexit

_atexit.register(_atexit_cleanup)
