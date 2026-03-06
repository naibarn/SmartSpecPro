"""Playwright browser instance pool with per-tenant concurrency limits."""

from __future__ import annotations

import asyncio
import logging
import time
from contextlib import asynccontextmanager
from typing import TYPE_CHECKING, AsyncGenerator

from playwright.async_api import BrowserContext, async_playwright

from app.services.automation_exceptions import BrowserCapacityError, BrowserLaunchError

if TYPE_CHECKING:
    import redis.asyncio as aioredis
    from playwright.async_api import Browser, Playwright

logger = logging.getLogger(__name__)

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
            await self._browser.close()
        if self._playwright is not None:
            await self._playwright.stop()
        self._started = False
        logger.info("BrowserPool stopped")

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


def get_browser_pool() -> BrowserPool:
    """Return the worker-scoped BrowserPool singleton. Raises if not initialized."""
    if _pool is None:
        raise BrowserLaunchError("BrowserPool not initialized -- is this a Celery worker?")
    return _pool
