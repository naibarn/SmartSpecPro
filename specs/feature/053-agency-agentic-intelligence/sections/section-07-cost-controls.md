# Section 07 -- Cost Controls (Budget + Rate Limiting)

## Overview

This section creates `python-backend/app/services/agentic_cost_controls.py` containing two classes: **TokenBudgetTracker** (per-run token budget enforcement with SSE warnings) and **ConcurrentRunLimiter** (Redis-based per-tenant and per-user concurrency limiting). Together they prevent runaway costs from agentic execution loops introduced in Levels 2 and 3.

**Feature**: 053 Agency Agentic Intelligence -- Level 2 cost controls
**Depends on**: section-01-foundation (`agentic_limits.py` provides `MAX_TOKENS_BUDGET`)
**Blocks**: section-08-react-integration (ReActExecutor uses TokenBudgetTracker; orchestrator checks ConcurrentRunLimiter before entering agentic paths)

---

## Files to Create

| File | Purpose |
|------|---------|
| `/home/dev/projects/SmartSpecPro/python-backend/app/services/agentic_cost_controls.py` | TokenBudgetTracker + ConcurrentRunLimiter classes |
| `/home/dev/projects/SmartSpecPro/python-backend/tests/unit/test_cost_controls.py` | Unit tests for both classes |

## Files Referenced (read-only, do not modify)

| File | What to use from it |
|------|---------------------|
| `python-backend/app/services/agentic_limits.py` | `MAX_TOKENS_BUDGET` constant (section-01) |
| `python-backend/app/services/agency_event_emitter.py` | `AgencyEventEmitter.emit()` for SSE events |
| `python-backend/app/core/redis_client.py` | `get_cache_redis()` for Redis access pattern |

---

## Tests -- Write First

All tests go in `/home/dev/projects/SmartSpecPro/python-backend/tests/unit/test_cost_controls.py`.

### TokenBudgetTracker Tests

```
# Test 1: Under budget returns not exceeded
# Create TokenBudgetTracker with budget=50000.
# Call record_usage(1000). Assert is_exceeded() returns False.

# Test 2: Over budget returns exceeded
# Create TokenBudgetTracker with budget=50000.
# Call record_usage(51000). Assert is_exceeded() returns True.

# Test 3: Cumulative usage tracking
# Create TokenBudgetTracker with budget=50000.
# Call record_usage(20000) then record_usage(20000).
# Assert total_tokens == 40000. Assert is_exceeded() is False.
# Call record_usage(15000). Assert is_exceeded() is True.

# Test 4: Warning at 80% threshold
# Create TokenBudgetTracker with budget=50000.
# Call record_usage(40000).
# Assert should_warn() returns True. Assert is_exceeded() returns False.

# Test 5: Warning not triggered below 80%
# Create TokenBudgetTracker with budget=50000.
# Call record_usage(39000).
# Assert should_warn() returns False.

# Test 6: Warning fires only once
# Create TokenBudgetTracker with budget=50000.
# Call record_usage(40000). Assert should_warn() returns True.
# Call should_warn() again. Assert returns False (already warned).

# Test 7: get_status returns correct dict
# Create tracker with budget=50000, call record_usage(25000).
# Assert get_status() returns dict with used_tokens=25000, budget=50000,
# used_pct=50.0, is_exceeded=False.

# Test 8: Zero budget means unlimited (no exceed)
# Create TokenBudgetTracker with budget=0.
# Call record_usage(999999). Assert is_exceeded() returns False.
```

### ConcurrentRunLimiter Tests

```
# Test 9: First acquire succeeds
# Create ConcurrentRunLimiter with mock Redis, per_tenant_max=3.
# Call acquire(tenant_id="t1", user_id="u1", run_type="react").
# Assert returns success (True or a context object).

# Test 10: Acquire blocked when tenant limit reached
# Create ConcurrentRunLimiter with per_tenant_max=2.
# Acquire twice for tenant "t1" (different users). Both succeed.
# Third acquire for tenant "t1" returns failure with 429-style error info.

# Test 11: Release decrements counter, next acquire succeeds
# Create ConcurrentRunLimiter with per_tenant_max=1.
# Acquire for tenant "t1" -- succeeds.
# Release for tenant "t1".
# Acquire again for tenant "t1" -- succeeds.

# Test 12: Per-user limit enforced (react type)
# Create ConcurrentRunLimiter with per_user_react_max=2.
# Acquire twice for user "u1", run_type="react" -- both succeed.
# Third acquire for user "u1", run_type="react" returns failure.

# Test 13: Per-user limit enforced (autonomous type)
# Create ConcurrentRunLimiter with per_user_autonomous_max=1.
# Acquire for user "u1", run_type="autonomous" -- succeeds.
# Second acquire for user "u1", run_type="autonomous" returns failure.

# Test 14: Different tenants do not interfere
# Create ConcurrentRunLimiter with per_tenant_max=1.
# Acquire for tenant "t1" -- succeeds.
# Acquire for tenant "t2" -- succeeds (independent counter).

# Test 15: TTL fallback prevents stuck counters
# Create ConcurrentRunLimiter. Acquire for tenant "t1".
# Verify Redis key has TTL set (check via mock).
# Simulate TTL expiry. Next acquire should succeed.

# Test 16: Acquire returns error details on limit exceeded
# When acquire fails, returned object/dict contains:
# error_code="concurrent_limit_exceeded", retry_after (int seconds),
# message matching "Maximum concurrent agentic runs reached..."
```

### Test Fixtures

```python
# Use unittest.mock.AsyncMock for Redis client.
# Mock Redis methods: incr, decr, expire, get, set, delete.
# Alternatively, create a simple in-memory mock that tracks keys.
# Do NOT import fakeredis (not in project dependencies).
```

---

## Implementation Details

### `agentic_cost_controls.py`

Location: `/home/dev/projects/SmartSpecPro/python-backend/app/services/agentic_cost_controls.py`

#### TokenBudgetTracker

A simple, synchronous, in-memory class used within a single run. No Redis needed -- the tracker lives for the lifetime of one agentic execution.

**Constructor parameters:**
- `budget: int` -- Maximum allowed tokens. Clamped to `MAX_TOKENS_BUDGET` from `agentic_limits.py`. A value of 0 means unlimited.
- `warning_threshold: float = 0.8` -- Fraction of budget at which to trigger warning.

**State:**
- `_total_tokens: int = 0`
- `_warned: bool = False`

**Methods (all synchronous):**

- `record_usage(tokens: int) -> None` -- Adds `tokens` to `_total_tokens`.

- `is_exceeded() -> bool` -- Returns `True` if `budget > 0` and `_total_tokens >= budget`.

- `should_warn() -> bool` -- Returns `True` exactly once when `_total_tokens >= budget * warning_threshold` and `not _warned`. Sets `_warned = True` on first trigger.

- `get_status() -> dict` -- Returns `{"used_tokens": int, "budget": int, "used_pct": float, "is_exceeded": bool}`.

**SSE integration:** The caller (ReActExecutor in section-08) checks `should_warn()` after each iteration and emits a `budget_warning` SSE event via the event emitter:
```python
# In ReActExecutor (section-08), NOT in this class:
if budget_tracker.should_warn():
    await event_emitter.emit("budget_warning", budget_tracker.get_status())
```

The TokenBudgetTracker itself does NOT hold a reference to the event emitter. It is a pure data tracker.

#### ConcurrentRunLimiter

An async class using Redis to enforce per-tenant and per-user concurrency limits on agentic runs.

**Constructor parameters:**
- `redis_client` -- An async Redis client (from `redis.asyncio`). Can be `None` (limiter becomes a no-op, always allows).
- `per_tenant_max: int = 3` -- Max concurrent agentic runs per tenant.
- `per_user_react_max: int = 2` -- Max concurrent ReAct runs per user.
- `per_user_autonomous_max: int = 1` -- Max concurrent autonomous runs per user.
- `ttl_seconds: int = 3600` -- Fallback TTL for Redis keys to prevent stuck counters.

**Redis key patterns:**
- Tenant counter: `agency:concurrency:tenant:{tenant_id}`
- User counter: `agency:concurrency:user:{tenant_id}:{user_id}:{run_type}`

**Methods:**

- `async acquire(tenant_id: str, user_id: str, run_type: str, run_id: str) -> AcquireResult` -- Atomically increments both tenant and user counters. If either exceeds the limit, decrements back and returns a failure result. Uses `INCR` + check + conditional `DECR` pattern. Sets TTL on each key via `EXPIRE`. Returns `AcquireResult(success=True)` or `AcquireResult(success=False, error_code="concurrent_limit_exceeded", retry_after=30, message="Maximum concurrent agentic runs reached. Please wait for an existing run to complete.")`.

- `async release(tenant_id: str, user_id: str, run_type: str, run_id: str) -> None` -- Decrements both counters. Uses `DECR` with a floor of 0 (never go negative). Should be called in a `finally` block by the orchestrator.

**`AcquireResult` dataclass:**
```python
@dataclass
class AcquireResult:
    success: bool
    error_code: str = ""
    retry_after: int = 0
    message: str = ""
```

**No-op behavior:** If `redis_client is None`, `acquire()` always returns success, `release()` is a no-op. This ensures local development without Redis still works.

**Race condition handling:** The `INCR` command in Redis is atomic. The check-and-rollback pattern (INCR, check, DECR if over) has a small window where two concurrent acquires might both succeed before either checks. This is acceptable for this use case -- the limits are soft caps, not security boundaries. For stricter enforcement, a Lua script could be used in a future iteration.

---

## Integration Points

### How section-08 (react-integration) uses these classes

The orchestrator in section-08 will:

1. **Before entering agentic path:** Call `ConcurrentRunLimiter.acquire()`. If it returns failure, return HTTP 429 with `Retry-After` header and the error message. Do NOT proceed with agentic execution.

2. **Create TokenBudgetTracker** with the agent's configured `maxTokensBudget` (from `nodeConfig`, clamped by `MAX_TOKENS_BUDGET`).

3. **After each ReAct iteration:** Call `budget_tracker.record_usage(response.usage.total_tokens)`. Check `budget_tracker.is_exceeded()` -- if `True`, exit the loop with `status: "budget_exceeded"`. Check `budget_tracker.should_warn()` -- if `True`, emit `budget_warning` SSE event.

4. **In finally block:** Call `ConcurrentRunLimiter.release()` to free the concurrency slot.

### SSE event contract

The `budget_warning` event emitted by the caller follows this shape:
```python
{
    "event": "budget_warning",
    "data": {
        "usedPct": 82.5,        # float, percentage
        "tokensUsed": 41250,    # int, tokens consumed so far
        "budget": 50000         # int, configured budget
    }
}
```

This matches the event type listed in section-08 and the SSE infrastructure from 052 section-09.

### Dependencies from section-01

This module imports `MAX_TOKENS_BUDGET` from `agentic_limits.py` (section-01-foundation). The import:
```python
from app.services.agentic_limits import MAX_TOKENS_BUDGET
```

If section-01 is not yet implemented, the module should define a local fallback: `MAX_TOKENS_BUDGET = 100_000`.

---

## Boundary Conditions

- **budget=0** means unlimited; `is_exceeded()` always returns `False`, `should_warn()` always returns `False`.
- **Negative token values** passed to `record_usage()` should be ignored (clamped to 0).
- **Redis unavailable:** ConcurrentRunLimiter with `redis_client=None` is a no-op (all acquires succeed).
- **Redis errors during acquire/release:** Catch exceptions, log warning, and allow the run to proceed (fail-open). Cost control is a safety net, not a security gate -- it should not block legitimate runs due to Redis flakiness.
- **TTL expiry:** Keys auto-expire after `ttl_seconds`. This handles cases where `release()` is never called (process crash, timeout). The counter resets to 0 on expiry, which is correct because all runs associated with that counter have also expired.

---

## Naming and Style

- Follow Black 100-char line length.
- Use `structlog.get_logger(__name__)` for logging.
- Use `@dataclass` for `AcquireResult`.
- All async methods use `async def`.
- Type hints on all public methods.
- Docstrings on classes and public methods.
