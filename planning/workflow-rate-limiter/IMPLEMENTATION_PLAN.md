# Rate Limiter Workflow Node Executor - Implementation Plan

## Problem Statement

Workflow executions need the ability to throttle request rates using a distributed rate limiter backed by Redis. This node allows workflow authors to enforce rate limits on downstream operations (API calls, LLM requests, media generation) to comply with provider quotas, prevent abuse, and manage resource consumption across multiple concurrent workers.

## Architecture Overview

```
Workflow Execution
    |
    v
[Rate Limiter Node]
    |
    +-- resolve rateLimitKey via ExpressionResolver
    |
    +-- connect to Redis (REDIS_URL from config)
    |
    +-- execute algorithm (Lua script, atomic)
    |       |
    |       +-- token_bucket: decrement tokens, refill based on elapsed time
    |       +-- fixed_window: increment counter in current window
    |       +-- sliding_window: ZADD + ZRANGEBYSCORE on sorted set
    |       |
    |       v
    |   {allowed, remaining, resetTime}
    |
    +-- if allowed=true  --> return outputs, pass through
    +-- if allowed=false
            |
            +-- waitOnLimit=false --> raise RateLimitExceeded error
            +-- waitOnLimit=true  --> async sleep + retry loop
                    |
                    +-- maxWaitTime exceeded --> raise RateLimitExceeded
                    +-- eventually allowed  --> return outputs with waited=true
```

## Affected Files

| File | Action | Description |
|------|--------|-------------|
| `python-backend/app/orchestrator/node_executors/flow_executors/rate_limiter_executor.py` | **CREATE** | Main executor with 3 algorithms + wait/retry |
| `python-backend/app/orchestrator/node_registry.py` | **MODIFY** | Register `rate_limiter` node type with spec |
| `python-backend/tests/test_rate_limiter_executor.py` | **CREATE** | Unit + integration tests |

No database changes. No migration needed.

## Risk Assessment

| Risk | Level | Mitigation |
|------|-------|------------|
| Redis connection failure | Medium | Graceful fallback with clear error message; do not silently allow |
| Lua script errors | Low | Scripts are static, tested at startup; no dynamic code injection |
| Key memory leak | Medium | Every Redis key gets a TTL = 2 * windowSize |
| Infinite wait loop | Low | Hard cap via maxWaitTime (default 60s, absolute max 300s) |
| Clock skew across workers | Low | All timing derived from Redis server via TIME command or Lua `redis.call('TIME')` |

---

## Step 1: Rate Limiter Executor Module

**File**: `python-backend/app/orchestrator/node_executors/flow_executors/rate_limiter_executor.py`

### 1.1 Class Structure

```python
"""Rate Limiter Executor - Distributed rate limiting using Redis."""
import asyncio
import time
from typing import Any

import structlog
from redis.asyncio import Redis

from app.core.config import settings
from app.orchestrator.expression_resolver import ExpressionResolver
from app.orchestrator.node_executors.base import ExecutionContext, NodeExecutionData

logger = structlog.get_logger(__name__)


class RateLimitExceeded(Exception):
    """Raised when rate limit is exceeded and waitOnLimit is false."""

    def __init__(self, key: str, remaining: int, reset_time: float, retry_after: float):
        self.key = key
        self.remaining = remaining
        self.reset_time = reset_time
        self.retry_after = retry_after
        super().__init__(
            f"Rate limit exceeded for key '{key}'. "
            f"Retry after {retry_after:.1f}s. Reset at {reset_time}"
        )


class RateLimiterExecutor:
    """Executor for rate_limiter nodes using Redis-based distributed rate limiting."""

    # Safety caps
    MAX_WAIT_TIME_SECONDS = 300  # 5 minutes absolute max
    MAX_WINDOW_SIZE_SECONDS = 86400  # 24 hours max window
    MAX_REQUESTS_CAP = 100000  # Prevent absurdly large limits
    RETRY_INTERVAL_SECONDS = 0.5  # Polling interval when waiting

    def __init__(self):
        self._redis: Redis | None = None
        self._expression_resolver = ExpressionResolver()

    async def _get_redis(self) -> Redis:
        """Get or create Redis connection."""
        if self._redis is None:
            redis_url = settings.REDIS_URL or "redis://localhost:6379/0"
            self._redis = Redis.from_url(
                redis_url,
                decode_responses=True,
                max_connections=settings.REDIS_MAX_CONNECTIONS,
            )
        return self._redis

    async def execute(
        self,
        data: NodeExecutionData,
        context: ExecutionContext,
    ) -> dict[str, Any]:
        """Execute rate limiting check."""
        # ... see sections below
```

### 1.2 Input Validation and Key Resolution

Inside `execute()`:

```python
async def execute(self, data, context):
    config = data.config
    inputs = data.inputs

    # --- Extract and validate configuration ---
    algorithm = inputs.get("algorithm", config.get("algorithm", "token_bucket"))
    if algorithm not in ("token_bucket", "fixed_window", "sliding_window"):
        raise ValueError(f"Invalid rate limiting algorithm: {algorithm}")

    max_requests = int(inputs.get("maxRequests", config.get("maxRequests", 60)))
    if max_requests <= 0 or max_requests > self.MAX_REQUESTS_CAP:
        raise ValueError(
            f"maxRequests must be between 1 and {self.MAX_REQUESTS_CAP}, got {max_requests}"
        )

    window_size = int(inputs.get("windowSize", config.get("windowSize", 60)))
    if window_size <= 0 or window_size > self.MAX_WINDOW_SIZE_SECONDS:
        raise ValueError(
            f"windowSize must be between 1 and {self.MAX_WINDOW_SIZE_SECONDS}s, got {window_size}"
        )

    # Resolve rateLimitKey expressions
    raw_key = inputs.get("rateLimitKey", config.get("rateLimitKey", "default"))
    rate_limit_key = self._expression_resolver.resolve(str(raw_key), data.state)

    wait_on_limit = bool(inputs.get("waitOnLimit", config.get("waitOnLimit", False)))

    max_wait_time = float(inputs.get("maxWaitTime", config.get("maxWaitTime", 60)))
    max_wait_time = min(max_wait_time, self.MAX_WAIT_TIME_SECONDS)

    redis = await self._get_redis()

    # --- Execute the chosen algorithm ---
    check_fn = {
        "token_bucket": self._check_token_bucket,
        "fixed_window": self._check_fixed_window,
        "sliding_window": self._check_sliding_window,
    }[algorithm]

    start_time = time.monotonic()
    waited = False
    waited_time_ms = 0.0

    result = await check_fn(redis, rate_limit_key, max_requests, window_size)

    if not result["allowed"] and wait_on_limit:
        # Enter wait/retry loop
        waited = True
        while not result["allowed"]:
            elapsed = time.monotonic() - start_time
            if elapsed >= max_wait_time:
                raise RateLimitExceeded(
                    key=rate_limit_key,
                    remaining=result["remaining"],
                    reset_time=result["reset_time"],
                    retry_after=result.get("retry_after", 0),
                )
            # Sleep for retry interval or remaining wait time, whichever is smaller
            sleep_time = min(self.RETRY_INTERVAL_SECONDS, max_wait_time - elapsed)
            await asyncio.sleep(sleep_time)
            result = await check_fn(redis, rate_limit_key, max_requests, window_size)

        waited_time_ms = (time.monotonic() - start_time) * 1000

    elif not result["allowed"]:
        # Not allowed and not waiting -- raise error
        raise RateLimitExceeded(
            key=rate_limit_key,
            remaining=result["remaining"],
            reset_time=result["reset_time"],
            retry_after=result.get("retry_after", 0),
        )

    logger.info(
        "rate_limit_check",
        node_id=data.node_id,
        algorithm=algorithm,
        key=rate_limit_key,
        allowed=result["allowed"],
        remaining=result["remaining"],
        waited=waited,
        waited_time_ms=waited_time_ms,
    )

    return {
        "allowed": True,
        "remainingRequests": result["remaining"],
        "resetTime": result["reset_time"],
        "waited": waited,
        "waitedTime": waited_time_ms,
    }
```

---

## Step 2: Token Bucket Algorithm (Lua Script)

The token bucket algorithm allows bursts up to `maxRequests` tokens, refilling at a rate of `maxRequests / windowSize` tokens per second.

### Redis Keys
- `rate_limit:{key}:tokens` -- Current token count (string, float)
- `rate_limit:{key}:timestamp` -- Last refill timestamp (string, float)

### Lua Script

```lua
-- Token Bucket Rate Limiter
-- KEYS[1] = rate_limit:{key}:tokens
-- KEYS[2] = rate_limit:{key}:timestamp
-- ARGV[1] = max_tokens (bucket capacity)
-- ARGV[2] = refill_rate (tokens per second = max_tokens / window_size)
-- ARGV[3] = now (current unix timestamp with microsecond precision)
-- ARGV[4] = ttl (key expiry in seconds)

local tokens_key = KEYS[1]
local timestamp_key = KEYS[2]
local max_tokens = tonumber(ARGV[1])
local refill_rate = tonumber(ARGV[2])
local now = tonumber(ARGV[3])
local ttl = tonumber(ARGV[4])

-- Get current state
local current_tokens = tonumber(redis.call('GET', tokens_key))
local last_refill = tonumber(redis.call('GET', timestamp_key))

-- Initialize if first request
if current_tokens == nil then
    current_tokens = max_tokens
    last_refill = now
end

-- Calculate tokens to add based on elapsed time
local elapsed = now - last_refill
local tokens_to_add = elapsed * refill_rate
current_tokens = math.min(max_tokens, current_tokens + tokens_to_add)

-- Update last refill timestamp
last_refill = now

-- Try to consume one token
local allowed = 0
if current_tokens >= 1 then
    current_tokens = current_tokens - 1
    allowed = 1
end

-- Persist state
redis.call('SET', tokens_key, tostring(current_tokens))
redis.call('SET', timestamp_key, tostring(last_refill))
redis.call('EXPIRE', tokens_key, ttl)
redis.call('EXPIRE', timestamp_key, ttl)

-- Calculate time until next token
local retry_after = 0
if allowed == 0 then
    retry_after = (1 - current_tokens) / refill_rate
end

-- Calculate reset time (when bucket will be fully refilled)
local tokens_deficit = max_tokens - current_tokens
local reset_time = now + (tokens_deficit / refill_rate)

return {allowed, tostring(current_tokens), tostring(reset_time), tostring(retry_after)}
```

### Python Implementation

```python
TOKEN_BUCKET_SCRIPT = """
-- (Lua script above)
"""

async def _check_token_bucket(
    self,
    redis: Redis,
    key: str,
    max_requests: int,
    window_size: int,
) -> dict[str, Any]:
    """Token bucket rate limit check."""
    tokens_key = f"rate_limit:{key}:tokens"
    timestamp_key = f"rate_limit:{key}:timestamp"
    refill_rate = max_requests / window_size  # tokens per second
    now = time.time()
    ttl = window_size * 2  # TTL = 2x window for safety

    result = await redis.eval(
        self.TOKEN_BUCKET_SCRIPT,
        2,  # number of keys
        tokens_key,
        timestamp_key,
        max_requests,
        refill_rate,
        now,
        ttl,
    )

    allowed = int(result[0]) == 1
    remaining = max(0, int(float(result[1])))
    reset_time = float(result[2])
    retry_after = float(result[3])

    return {
        "allowed": allowed,
        "remaining": remaining,
        "reset_time": reset_time,
        "retry_after": retry_after,
    }
```

---

## Step 3: Fixed Window Algorithm (Lua Script)

Simple counter per time window. The window boundary is calculated as `floor(now / window_size) * window_size`.

### Redis Keys
- `rate_limit:{key}:{window_start}` -- Counter for current window (integer)

### Lua Script

```lua
-- Fixed Window Rate Limiter
-- KEYS[1] = rate_limit:{key}:{window_start}
-- ARGV[1] = max_requests
-- ARGV[2] = ttl (key expiry in seconds)

local window_key = KEYS[1]
local max_requests = tonumber(ARGV[1])
local ttl = tonumber(ARGV[2])

-- Increment counter
local current = redis.call('INCR', window_key)

-- Set TTL on first request in this window
if current == 1 then
    redis.call('EXPIRE', window_key, ttl)
end

local allowed = 0
if current <= max_requests then
    allowed = 1
end

local remaining = math.max(0, max_requests - current)

return {allowed, remaining, current}
```

### Python Implementation

```python
FIXED_WINDOW_SCRIPT = """
-- (Lua script above)
"""

async def _check_fixed_window(
    self,
    redis: Redis,
    key: str,
    max_requests: int,
    window_size: int,
) -> dict[str, Any]:
    """Fixed window rate limit check."""
    now = time.time()
    window_start = int(now // window_size) * window_size
    window_key = f"rate_limit:{key}:{window_start}"
    ttl = window_size * 2  # TTL = 2x window size

    result = await redis.eval(
        self.FIXED_WINDOW_SCRIPT,
        1,  # number of keys
        window_key,
        max_requests,
        ttl,
    )

    allowed = int(result[0]) == 1
    remaining = int(result[1])
    reset_time = float(window_start + window_size)

    return {
        "allowed": allowed,
        "remaining": remaining,
        "reset_time": reset_time,
        "retry_after": reset_time - now if not allowed else 0,
    }
```

---

## Step 4: Sliding Window Algorithm (Sorted Set + Lua)

Uses a Redis sorted set where each element is a unique request ID and the score is the request timestamp. Requests older than `window_size` seconds are pruned on each check.

### Redis Keys
- `rate_limit:{key}:requests` -- Sorted set (member=unique_id, score=timestamp)

### Lua Script

```lua
-- Sliding Window Rate Limiter (Log-based)
-- KEYS[1] = rate_limit:{key}:requests
-- ARGV[1] = max_requests
-- ARGV[2] = window_size (seconds)
-- ARGV[3] = now (current unix timestamp)
-- ARGV[4] = request_id (unique identifier for this request)
-- ARGV[5] = ttl (key expiry in seconds)

local requests_key = KEYS[1]
local max_requests = tonumber(ARGV[1])
local window_size = tonumber(ARGV[2])
local now = tonumber(ARGV[3])
local request_id = ARGV[4]
local ttl = tonumber(ARGV[5])

-- Remove entries outside the window
local window_start = now - window_size
redis.call('ZREMRANGEBYSCORE', requests_key, '-inf', tostring(window_start))

-- Count current requests in window
local current_count = redis.call('ZCARD', requests_key)

local allowed = 0
if current_count < max_requests then
    -- Add this request
    redis.call('ZADD', requests_key, tostring(now), request_id)
    allowed = 1
    current_count = current_count + 1
end

-- Set TTL on the sorted set
redis.call('EXPIRE', requests_key, ttl)

local remaining = math.max(0, max_requests - current_count)

-- Calculate when the oldest entry in the window will expire
local oldest = redis.call('ZRANGE', requests_key, 0, 0, 'WITHSCORES')
local retry_after = 0
if #oldest >= 2 and allowed == 0 then
    retry_after = tonumber(oldest[2]) + window_size - now
end

return {allowed, remaining, tostring(retry_after)}
```

### Python Implementation

```python
SLIDING_WINDOW_SCRIPT = """
-- (Lua script above)
"""

async def _check_sliding_window(
    self,
    redis: Redis,
    key: str,
    max_requests: int,
    window_size: int,
) -> dict[str, Any]:
    """Sliding window (log) rate limit check."""
    now = time.time()
    request_id = f"{context.execution_id}:{data.node_id}:{now}"
    requests_key = f"rate_limit:{key}:requests"
    ttl = window_size * 2

    result = await redis.eval(
        self.SLIDING_WINDOW_SCRIPT,
        1,  # number of keys
        requests_key,
        max_requests,
        window_size,
        now,
        request_id,
        ttl,
    )

    allowed = int(result[0]) == 1
    remaining = int(result[1])
    retry_after = float(result[2])

    return {
        "allowed": allowed,
        "remaining": remaining,
        "reset_time": now + window_size,
        "retry_after": retry_after,
    }
```

**Note on `request_id` uniqueness**: The sliding window needs a unique member per request to avoid deduplication in the sorted set. We use `{execution_id}:{node_id}:{timestamp}` which is unique across concurrent executions.

---

## Step 5: Redis Connection Management

The executor creates a Redis connection lazily on first use. Key design decisions:

1. **Connection reuse**: The executor instance is created per-execution by the orchestrator. The Redis connection pool is shared via `Redis.from_url` with `max_connections` from settings.

2. **Connection cleanup**: Not needed per-execution. The `redis.asyncio.Redis` client manages its own connection pool with automatic cleanup.

3. **Error handling**: If Redis is unreachable, the executor raises a clear error rather than silently allowing the request (fail-closed behavior).

```python
async def _get_redis(self) -> Redis:
    """Get or create async Redis connection."""
    if self._redis is None:
        redis_url = settings.REDIS_URL or "redis://localhost:6379/0"
        self._redis = Redis.from_url(
            redis_url,
            decode_responses=True,
            socket_connect_timeout=5,
            socket_timeout=5,
            retry_on_timeout=True,
        )
        # Verify connectivity
        try:
            await self._redis.ping()
        except Exception as e:
            self._redis = None
            raise ConnectionError(
                f"Cannot connect to Redis at {redis_url} for rate limiting: {e}"
            ) from e
    return self._redis
```

### Key TTL Strategy

All Redis keys used by the rate limiter have explicit TTLs to prevent memory leaks:

| Algorithm | Key | TTL |
|-----------|-----|-----|
| token_bucket | `rate_limit:{key}:tokens` | `2 * windowSize` |
| token_bucket | `rate_limit:{key}:timestamp` | `2 * windowSize` |
| fixed_window | `rate_limit:{key}:{window}` | `2 * windowSize` |
| sliding_window | `rate_limit:{key}:requests` | `2 * windowSize` |

The `2x` multiplier ensures keys survive one full window cycle beyond the current window, preventing premature cleanup while still guaranteeing eventual garbage collection.

---

## Step 6: Wait/Retry Logic

When `waitOnLimit=true`, the executor enters an async retry loop:

```
1. Check rate limit
2. If allowed --> return immediately
3. If not allowed:
   a. Calculate elapsed time since first check
   b. If elapsed >= maxWaitTime --> raise RateLimitExceeded
   c. Sleep for min(RETRY_INTERVAL, remaining_wait_time)
   d. Go to step 1
```

### Backoff Strategy

- **Fixed interval**: 500ms between retries. This is a reasonable balance between latency and Redis load.
- **No exponential backoff**: Rate limit windows are typically short (seconds to minutes). Exponential backoff would add unnecessary latency.
- **Adaptive hint**: The Lua scripts return `retry_after` indicating when the next token/slot will be available. The executor could optionally use this to sleep more precisely, but the 500ms polling is simpler and more resilient to clock drift.

### Safety Caps

| Parameter | Default | Absolute Max | Rationale |
|-----------|---------|-------------|-----------|
| `maxWaitTime` | 60s | 300s | Prevent workflow from blocking forever |
| `windowSize` | 60s | 86400s (24h) | Reasonable upper bound for a window |
| `maxRequests` | 60 | 100000 | Prevent nonsensical configurations |
| Retry interval | 500ms | N/A | Fixed, not user-configurable |

---

## Step 7: Node Registry Spec

Add to `_register_core_nodes()` in `python-backend/app/orchestrator/node_registry.py`:

```python
# Rate Limiter
self.register_node_type(
    NodeTypeSpec(
        type="rate_limiter",
        display_name="Rate Limiter",
        description="Throttle workflow execution rate using distributed Redis-based rate limiting",
        icon="gauge",
        color="red",
        category="flow_control",
        inputs=[
            InputSpec(
                name="algorithm",
                display_name="Algorithm",
                data_type="text",
                ui_type="select",
                required=True,
                accepts_connection=False,
                default="token_bucket",
                options=[
                    {"label": "Token Bucket (smooth, allows bursts)", "value": "token_bucket"},
                    {"label": "Fixed Window (simple counter)", "value": "fixed_window"},
                    {"label": "Sliding Window (precise, higher Redis cost)", "value": "sliding_window"},
                ],
            ),
            InputSpec(
                name="maxRequests",
                display_name="Max Requests",
                data_type="number",
                ui_type="number",
                required=True,
                accepts_connection=True,
                default=60,
                validation={"min": 1, "max": 100000},
                placeholder="Number of requests allowed per window",
            ),
            InputSpec(
                name="windowSize",
                display_name="Window Size (seconds)",
                data_type="number",
                ui_type="number",
                required=True,
                accepts_connection=True,
                default=60,
                validation={"min": 1, "max": 86400},
                placeholder="Time window in seconds",
            ),
            InputSpec(
                name="rateLimitKey",
                display_name="Rate Limit Key",
                data_type="text",
                ui_type="text",
                required=True,
                accepts_connection=True,
                default="default",
                placeholder="Key for grouping (supports {{expressions}})",
            ),
            InputSpec(
                name="waitOnLimit",
                display_name="Wait When Limited",
                data_type="boolean",
                ui_type="toggle",
                required=False,
                accepts_connection=False,
                default=False,
            ),
            InputSpec(
                name="maxWaitTime",
                display_name="Max Wait Time (seconds)",
                data_type="number",
                ui_type="number",
                required=False,
                accepts_connection=False,
                default=60,
                validation={"min": 1, "max": 300},
                placeholder="Maximum time to wait if rate limited",
            ),
        ],
        outputs=[
            OutputSpec(name="allowed", display_name="Allowed", data_type="boolean"),
            OutputSpec(name="remainingRequests", display_name="Remaining Requests", data_type="number"),
            OutputSpec(name="resetTime", display_name="Reset Time (Unix)", data_type="number"),
            OutputSpec(name="waited", display_name="Had to Wait", data_type="boolean"),
            OutputSpec(name="waitedTime", display_name="Wait Time (ms)", data_type="number"),
        ],
        executor="app.orchestrator.node_executors.flow_executors.rate_limiter_executor.RateLimiterExecutor",
    )
)
```

---

## Step 8: Testing Strategy

**File**: `python-backend/tests/test_rate_limiter_executor.py`

### Test Categories

#### 8.1 Unit Tests (mock Redis)

These tests mock the Redis client to verify executor logic without requiring a real Redis instance.

| # | Test | Description |
|---|------|-------------|
| 1 | `test_valid_config_parsing` | Verify algorithm, maxRequests, windowSize, key are parsed correctly |
| 2 | `test_invalid_algorithm_raises` | Unknown algorithm raises ValueError |
| 3 | `test_invalid_max_requests_raises` | maxRequests <= 0 or > cap raises ValueError |
| 4 | `test_invalid_window_size_raises` | windowSize <= 0 or > cap raises ValueError |
| 5 | `test_expression_resolution_in_key` | `rateLimitKey: "user-{{userId}}"` resolves from state |
| 6 | `test_wait_timeout_raises` | waitOnLimit=true with maxWaitTime exceeded raises RateLimitExceeded |
| 7 | `test_max_wait_time_cap` | maxWaitTime > 300 is capped to 300 |
| 8 | `test_redis_connection_error` | Redis unreachable raises ConnectionError |

#### 8.2 Algorithm Tests (mock Redis eval)

Mock `redis.eval()` to return predetermined results and verify the executor handles each algorithm's output format correctly.

| # | Test | Description |
|---|------|-------------|
| 9 | `test_token_bucket_allowed` | First request with full bucket succeeds |
| 10 | `test_token_bucket_denied` | Request with 0 tokens is denied |
| 11 | `test_token_bucket_refill` | After waiting, tokens refill and request succeeds |
| 12 | `test_fixed_window_allowed` | Request within limit succeeds |
| 13 | `test_fixed_window_boundary` | Request at maxRequests boundary is denied |
| 14 | `test_fixed_window_new_window` | New window resets counter |
| 15 | `test_sliding_window_allowed` | Request within window limit succeeds |
| 16 | `test_sliding_window_denied` | Request exceeding window limit is denied |

#### 8.3 Wait/Retry Tests (mock Redis + asyncio)

| # | Test | Description |
|---|------|-------------|
| 17 | `test_wait_then_allow` | Rate limited, waits, eventually allowed. Verify `waited=True`, `waitedTime > 0` |
| 18 | `test_wait_timeout_exceeded` | Rate limited, waits, never allowed within maxWaitTime. Raises RateLimitExceeded |
| 19 | `test_no_wait_when_allowed` | Request allowed on first try. `waited=False`, `waitedTime=0` |
| 20 | `test_no_wait_raises_immediately` | waitOnLimit=false, denied. Raises RateLimitExceeded without any sleep |

#### 8.4 Integration Tests (requires real Redis, mark with @pytest.mark.integration)

These tests use a real Redis instance to verify the Lua scripts execute correctly.

| # | Test | Description |
|---|------|-------------|
| 21 | `test_token_bucket_e2e` | Execute 10 requests with limit=5, verify first 5 allowed, rest denied |
| 22 | `test_fixed_window_e2e` | Execute requests across window boundary, verify counter resets |
| 23 | `test_sliding_window_e2e` | Execute requests, verify sliding behavior with ZCARD |
| 24 | `test_concurrent_requests` | 20 asyncio tasks all hitting the same key with limit=10. Verify exactly 10 allowed |
| 25 | `test_key_ttl_set` | After rate limit check, verify Redis keys have correct TTL |
| 26 | `test_different_keys_independent` | Two different keys don't interfere with each other |

#### 8.5 Test Fixtures

```python
import pytest
import asyncio
from unittest.mock import AsyncMock, MagicMock, patch
from redis.asyncio import Redis

from app.orchestrator.node_executors.base import ExecutionContext, NodeExecutionData
from app.orchestrator.node_executors.flow_executors.rate_limiter_executor import (
    RateLimiterExecutor,
    RateLimitExceeded,
)


@pytest.fixture
def execution_context():
    return ExecutionContext(
        user_id=1,
        tenant_id="test-tenant",
        workflow_id="wf-123",
        execution_id="exec-456",
        credits_available=100,
    )


@pytest.fixture
def make_node_data():
    """Factory for creating NodeExecutionData with rate limiter config."""
    def _make(
        algorithm="token_bucket",
        max_requests=10,
        window_size=60,
        rate_limit_key="test-key",
        wait_on_limit=False,
        max_wait_time=60,
    ):
        return NodeExecutionData(
            node_id="rate-limiter-1",
            node_type="rate_limiter",
            config={},
            inputs={
                "algorithm": algorithm,
                "maxRequests": max_requests,
                "windowSize": window_size,
                "rateLimitKey": rate_limit_key,
                "waitOnLimit": wait_on_limit,
                "maxWaitTime": max_wait_time,
            },
            state={},
        )
    return _make


@pytest.fixture
async def real_redis():
    """Real Redis connection for integration tests."""
    redis = Redis.from_url("redis://localhost:6379/0", decode_responses=True)
    yield redis
    # Cleanup: delete all rate_limit test keys
    keys = await redis.keys("rate_limit:test-*")
    if keys:
        await redis.delete(*keys)
    await redis.close()
```

---

## Step 9: Concurrency Test (Critical)

The most important test verifies that the Lua scripts are truly atomic under concurrent load:

```python
@pytest.mark.integration
@pytest.mark.asyncio
async def test_concurrent_requests_exactly_n_allowed(real_redis):
    """
    Fire 50 concurrent requests with limit=10.
    Verify EXACTLY 10 are allowed (not 11, not 9).
    This validates Lua script atomicity.
    """
    executor = RateLimiterExecutor()
    executor._redis = real_redis

    # Clean up any existing keys
    await real_redis.delete("rate_limit:concurrency-test:tokens")
    await real_redis.delete("rate_limit:concurrency-test:timestamp")

    allowed_count = 0
    denied_count = 0
    lock = asyncio.Lock()

    async def make_request():
        nonlocal allowed_count, denied_count
        data = NodeExecutionData(
            node_id="rl-1",
            node_type="rate_limiter",
            config={},
            inputs={
                "algorithm": "token_bucket",
                "maxRequests": 10,
                "windowSize": 3600,  # 1 hour, so no refill during test
                "rateLimitKey": "concurrency-test",
                "waitOnLimit": False,
            },
            state={},
        )
        ctx = ExecutionContext(
            user_id=1, tenant_id="t", workflow_id="w",
            execution_id=f"exec-{id(asyncio.current_task())}",
        )
        try:
            result = await executor.execute(data, ctx)
            async with lock:
                allowed_count += 1
        except RateLimitExceeded:
            async with lock:
                denied_count += 1

    tasks = [asyncio.create_task(make_request()) for _ in range(50)]
    await asyncio.gather(*tasks)

    assert allowed_count == 10, f"Expected 10 allowed, got {allowed_count}"
    assert denied_count == 40, f"Expected 40 denied, got {denied_count}"
```

---

## Step 10: Frontend Node Registration (Informational)

The frontend registry in `apps/web/client/src/lib/workflow/useNodeRegistry.ts` will also need a corresponding entry. This is outside the scope of this Python backend plan, but the node type string `"rate_limiter"` and the input/output specs above define the contract the frontend must implement.

---

## Implementation Order

| Step | Task | Files | Depends On |
|------|------|-------|------------|
| 1 | Create `rate_limiter_executor.py` with class skeleton | `flow_executors/rate_limiter_executor.py` | -- |
| 2 | Implement token bucket Lua script + `_check_token_bucket` | Same file | Step 1 |
| 3 | Implement fixed window Lua script + `_check_fixed_window` | Same file | Step 1 |
| 4 | Implement sliding window Lua script + `_check_sliding_window` | Same file | Step 1 |
| 5 | Implement `execute()` with validation, key resolution, wait/retry | Same file | Steps 2-4 |
| 6 | Register `rate_limiter` node type in registry | `node_registry.py` | Step 1 |
| 7 | Write unit tests (validation, mocked algorithms) | `tests/test_rate_limiter_executor.py` | Step 5 |
| 8 | Write integration tests (real Redis, concurrency) | Same test file | Step 5 |
| 9 | Run `pytest` to verify all tests pass | -- | Steps 7-8 |

---

## Verification Steps

After implementation:

1. `cd python-backend && pytest tests/test_rate_limiter_executor.py -v` -- All tests pass
2. `cd python-backend && pytest` -- No regressions in existing tests
3. `cd python-backend && black app/orchestrator/node_executors/flow_executors/rate_limiter_executor.py tests/test_rate_limiter_executor.py` -- Formatting OK
4. `cd python-backend && ruff check app/orchestrator/node_executors/flow_executors/rate_limiter_executor.py` -- No lint errors
5. `cd python-backend && mypy app/orchestrator/node_executors/flow_executors/rate_limiter_executor.py` -- Type check passes
6. Verify Redis keys are created with correct TTLs after integration tests
7. Verify Redis keys are cleaned up by TTL (no memory leak)

---

## Algorithm Selection Guide (for workflow authors)

| Algorithm | Best For | Pros | Cons |
|-----------|----------|------|------|
| **Token Bucket** | API rate limiting, smooth traffic | Allows bursts, smooth refill | Slightly more complex state |
| **Fixed Window** | Simple quotas, hourly/daily limits | Simple, low Redis cost | Boundary spike problem (2x burst at window edge) |
| **Sliding Window** | Precise limiting, audit trails | Most accurate, no boundary spikes | Higher Redis memory (stores each request), O(N) cleanup |

### Fixed Window Boundary Problem Example

With a 10 req/min fixed window:
- 10 requests at 0:59 (end of window 1) -- all allowed
- 10 requests at 1:01 (start of window 2) -- all allowed
- Result: 20 requests in 2 seconds, despite 10/min limit

The sliding window algorithm does not have this problem. The token bucket mitigates it via smooth refill.
