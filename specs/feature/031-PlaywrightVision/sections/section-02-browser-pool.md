I have all the information needed to write this section. Here is the output:

# Section 02: BrowserPool

## Overview

This section implements `python-backend/app/services/browser_pool.py`, a Playwright browser instance pool with per-tenant concurrency limits, asyncio semaphore for system-wide capacity, Redis atomic counters for per-tenant capacity, idle timeout, and worker-scoped lifecycle via Celery signals.

**Depends on:** Section 01 (exceptions module -- specifically `BrowserCapacityError` and `BrowserLaunchError` from `automation_exceptions.py`)

**Blocks:** Sections 04 (PlaywrightScriptGenerator) and 05 (SelfHealingExecutor), which acquire browser contexts through this pool.

---

## Key Design Decisions

1. **One shared `Browser` object per pool instance** (expensive to create), many `BrowserContext` objects (one per tenant session, cheap, fully isolated). The pool does NOT create one browser per session.

2. **System limit** via `asyncio.Semaphore(SYSTEM_MAX_BROWSERS=10)` -- caps total concurrent contexts across all tenants in a single worker process.

3. **Per-tenant limit** via Redis atomic `INCR`/`DECR` on key `browser_pool:tenant:{tenant_id}` with `TENANT_MAX_BROWSERS=2`. The Redis counter is shared across all Celery worker processes, ensuring multi-worker tenant isolation. The key has a 300-second TTL as a safety net against leaked counters.

4. **Worker-scoped lifecycle** -- The pool is initialized per-Celery-worker using the `worker_process_init` signal and stored as a module-level singleton. Each worker that processes automation tasks initializes its own `BrowserPool` on startup and tears it down on `worker_process_shutdown`. The FastAPI process does NOT manage browser instances.

5. **No `ProcessPoolExecutor`** -- Playwright async is incompatible with process-based parallelism. The pool is asyncio-native throughout.

6. **Context isolation** -- Each `BrowserContext` is configured with: no cookies persistence, no shared storage, a non-bot user agent string, and 1280x800 viewport.

---

## Tests First

**File:** `python-backend/tests/unit/automation/test_browser_pool.py`

Create directory `python-backend/tests/unit/automation/` with an empty `__init__.py`.

The test file must mock `playwright.async_api.async_playwright` and `redis.asyncio.Redis`. No real browser binaries or Redis connections should be needed. Use `unittest.mock.AsyncMock` for async context managers and methods. Use `asyncio` pytest mode (which is already configured as `asyncio_mode = "auto"` in `pyproject.toml`).

### Test stubs

```python
"""Tests for BrowserPool -- Playwright instance pool with per-tenant limits."""

import asyncio
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

# Will import from the module under test once created
# from app.services.browser_pool import BrowserPool, SYSTEM_MAX_BROWSERS, TENANT_MAX_BROWSERS


@pytest.fixture
def mock_redis():
    """Mock redis.asyncio.Redis with incr/decr/get/expire/delete."""
    # Return an AsyncMock that tracks call counts and simulates atomic counters

@pytest.fixture
def mock_playwright():
    """Mock async_playwright() context manager returning a mock Playwright object."""
    # playwright.chromium.launch() -> mock Browser
    # browser.new_context(**kwargs) -> mock BrowserContext
    # context.close() -> AsyncMock
    # browser.close() -> AsyncMock
    # playwright.stop() -> AsyncMock


class TestBrowserPoolStartStop:
    async def test_start_initializes_playwright_and_launches_browser(self, mock_playwright, mock_redis):
        """start() should call async_playwright().start() then chromium.launch()."""

    async def test_stop_closes_browser_and_stops_playwright(self, mock_playwright, mock_redis):
        """stop() should call browser.close() then playwright.stop()."""

    async def test_start_raises_browser_launch_error_on_failure(self, mock_playwright, mock_redis):
        """If chromium.launch() raises, BrowserLaunchError should propagate."""


class TestBrowserPoolSession:
    async def test_session_yields_browser_context_and_closes_on_exit(self, mock_playwright, mock_redis):
        """session() context manager yields a BrowserContext and calls close() on normal exit."""

    async def test_session_calls_context_close_even_on_exception(self, mock_playwright, mock_redis):
        """context.close() must be called in the finally block even if user code raises."""

    async def test_context_configured_with_correct_options(self, mock_playwright, mock_redis):
        """new_context() called with viewport=1280x800, no cookies, non-bot user agent."""


class TestSystemLimit:
    async def test_acquire_up_to_system_limit_succeeds(self, mock_playwright, mock_redis):
        """10 concurrent session() calls should all succeed."""

    async def test_11th_acquire_raises_browser_capacity_error(self, mock_playwright, mock_redis):
        """The 11th concurrent session() call should raise BrowserCapacityError."""


class TestTenantLimit:
    async def test_acquire_up_to_tenant_limit_succeeds(self, mock_playwright, mock_redis):
        """2 concurrent sessions for tenant 'A' should succeed."""

    async def test_3rd_acquire_same_tenant_raises_browser_capacity_error(self, mock_playwright, mock_redis):
        """3rd session for tenant 'A' raises BrowserCapacityError."""

    async def test_different_tenants_can_acquire_independently(self, mock_playwright, mock_redis):
        """Tenant 'A' at limit 2 should not block tenant 'B' from acquiring."""


class TestRedisCounters:
    async def test_redis_counter_incremented_on_acquire(self, mock_playwright, mock_redis):
        """Redis INCR called on browser_pool:tenant:{tenant_id} during acquire."""

    async def test_redis_counter_decremented_on_release(self, mock_playwright, mock_redis):
        """Redis DECR called on release (context manager exit)."""

    async def test_redis_counter_never_goes_below_zero(self, mock_playwright, mock_redis):
        """If DECR would go below 0, counter is set to 0 instead (safety guard)."""

    async def test_redis_key_has_ttl_safety_net(self, mock_playwright, mock_redis):
        """Redis key should have expire(300) set after INCR for leak protection."""
```

---

## Implementation Details

**File:** `python-backend/app/services/browser_pool.py`

### Constants

- `SYSTEM_MAX_BROWSERS = 10` -- max concurrent contexts across all tenants in one worker
- `TENANT_MAX_BROWSERS = 2` -- max concurrent contexts per tenant (enforced via Redis, shared across workers)
- `IDLE_TIMEOUT_SECONDS = 60` -- unused (reserved for future idle eviction)
- Redis key pattern: `browser_pool:tenant:{tenant_id}` with 300-second TTL safety net

### Class: `BrowserPool`

Constructor parameters:
- `redis_client: redis.asyncio.Redis` -- async Redis client (obtained from `app.core.redis_client.get_redis()` or injected for testing)

Internal state:
- `_playwright: Playwright | None` -- the Playwright instance
- `_browser: Browser | None` -- the shared Chromium browser
- `_semaphore: asyncio.Semaphore` -- initialized with `SYSTEM_MAX_BROWSERS`
- `_redis: redis.asyncio.Redis` -- for per-tenant counters
- `_started: bool` -- guards against double-start or use-before-start

#### `async def start(self) -> None`

1. Call `async_playwright().start()` to get a `Playwright` instance
2. Call `playwright.chromium.launch(headless=True)` to get a `Browser`
3. Set `_started = True`
4. If launch fails, raise `BrowserLaunchError` with the underlying error as details

#### `async def stop(self) -> None`

1. If `_browser` is not None, call `await _browser.close()`
2. If `_playwright` is not None, call `await _playwright.stop()`
3. Set `_started = False`

#### `@asynccontextmanager async def session(self, tenant_id: str) -> AsyncGenerator[BrowserContext, None]`

This is the primary public API. It:

1. Checks `_started` is True, raises `BrowserLaunchError` if not
2. Tries to acquire the system semaphore with `timeout=0` (non-blocking). If acquisition fails, raise `BrowserCapacityError` with message indicating system limit reached
3. Inside the semaphore, checks per-tenant Redis counter:
   - `count = await self._redis.incr(f"browser_pool:tenant:{tenant_id}")`
   - `await self._redis.expire(f"browser_pool:tenant:{tenant_id}", 300)` (safety TTL)
   - If `count > TENANT_MAX_BROWSERS`: decrement back (`await self._redis.decr(...)`) and release semaphore, raise `BrowserCapacityError` with message indicating tenant limit reached
4. Creates a new `BrowserContext` via `self._browser.new_context()` with:
   - `viewport={"width": 1280, "height": 800}`
   - `user_agent="Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"`
   - `accept_downloads=False`
   - No cookies or storage state
5. `yield context`
6. In `finally` block (guaranteeing cleanup regardless of exceptions):
   - `await context.close()`
   - Decrement Redis counter: `result = await self._redis.decr(f"browser_pool:tenant:{tenant_id}")`
   - If `result < 0`: reset to 0 via `await self._redis.set(f"browser_pool:tenant:{tenant_id}", 0, ex=300)`
   - Release the semaphore

### Semaphore timeout approach

The system semaphore uses a non-blocking try-acquire pattern. In Python's `asyncio.Semaphore`, there is no built-in `try_acquire`. Instead, use `asyncio.wait_for(self._semaphore.acquire(), timeout=0.01)` and catch `asyncio.TimeoutError`, converting it to `BrowserCapacityError`. Alternatively, track the count manually with an `_active_count` integer protected by a lock -- either approach is acceptable, but the `wait_for` approach is simpler.

### Module-level singleton and Celery integration

At the bottom of `browser_pool.py`, define:

```python
_pool: BrowserPool | None = None

def get_browser_pool() -> BrowserPool:
    """Return the worker-scoped BrowserPool singleton. Raises if not initialized."""
    if _pool is None:
        raise BrowserLaunchError("BrowserPool not initialized -- is this a Celery worker?")
    return _pool
```

The Celery `worker_process_init` and `worker_process_shutdown` signals will be wired up in Section 07 (Celery tasks). For now, the module exposes `get_browser_pool()` and the `BrowserPool` class. The signal wiring is deferred because it depends on the Celery app configuration from that section.

### Redis client acquisition

The pool receives its Redis client via constructor injection. In production (Celery worker), the caller obtains it from `app.core.redis_client`. In tests, a mock is injected directly. The pool uses the async Redis API (`redis.asyncio.Redis`) -- same library already used throughout the codebase (see `python-backend/app/core/redis_client.py`).

### Health watchdog (referenced, implemented in Section 07)

A Celery beat task running every 5 minutes will check for orphaned browser contexts (acquired > 360 seconds ago), force-release them, and reset Redis counters if out of sync. This task is defined in Section 07 but depends on `BrowserPool` exposing enough state for the check. The pool should maintain a `_active_sessions: dict[str, float]` mapping `tenant_id -> acquire_timestamp` that the health check can inspect. Add a method:

```python
async def force_release_orphans(self, max_age_seconds: int = 360) -> int:
    """Release contexts held longer than max_age_seconds. Returns count released.
    
    Resets Redis counters for affected tenants.
    Called by the browser-pool-health-watchdog beat task.
    """
```

This method iterates `_active_sessions`, identifies entries older than `max_age_seconds`, decrements their Redis counters, releases semaphore slots, and removes them from the tracking dict. The actual `context.close()` call for orphans is best-effort (the context may already be dead).

---

## File Checklist

| Action | File Path |
|--------|-----------|
| Create | `python-backend/tests/unit/automation/__init__.py` |
| Create | `python-backend/tests/unit/automation/test_browser_pool.py` |
| Create | `python-backend/app/services/browser_pool.py` |

## Dependencies

- **Section 01** must be complete: `BrowserCapacityError` and `BrowserLaunchError` must exist in `python-backend/app/services/automation_exceptions.py`
- **Redis** async client from `python-backend/app/core/redis_client.py` (already exists)
- **Playwright** package must be installed: `pip install playwright` and `playwright install chromium`
- The Celery signal wiring (`worker_process_init` / `worker_process_shutdown`) is implemented in **Section 07**, not here. This section only provides the `BrowserPool` class and the `get_browser_pool()` accessor.