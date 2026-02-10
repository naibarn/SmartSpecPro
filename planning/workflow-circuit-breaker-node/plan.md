# Circuit Breaker Workflow Node - Implementation Plan

## Problem Statement

Workflow executions that call external services (HTTP APIs, LLM providers, databases) can cascade failures when a downstream dependency is unhealthy. A circuit breaker node allows workflows to detect persistent failures, short-circuit requests to failing services, and automatically recover when the service comes back.

This node provides distributed circuit breaker state via Redis so that circuit state is shared across all workflow executions, Celery workers, and FastAPI instances.

## Affected Files

### New Files
| File | Purpose |
|------|---------|
| `python-backend/app/orchestrator/node_executors/flow_executors/circuit_breaker_executor.py` | Core executor implementation |
| `python-backend/tests/test_circuit_breaker_executor.py` | Unit tests |

### Modified Files
| File | Change |
|------|--------|
| `python-backend/app/orchestrator/node_registry.py` | Register `circuit_breaker` node type spec |
| `python-backend/app/orchestrator/node_executors/flow_executors/__init__.py` | Export `CircuitBreakerExecutor` and `CircuitBreakerOpenError` |

### No Frontend Changes Required
The frontend is registry-driven. Once the node spec is registered in `node_registry.py`, the UI automatically renders the node in the palette, config panel, and connection validator.

---

## 1. State Machine Design

### 1.1 States

```
CLOSED ──(failure_threshold exceeded)──> OPEN
OPEN   ──(timeout elapsed)─────────────> HALF_OPEN
HALF_OPEN ──(success_threshold met)────> CLOSED
HALF_OPEN ──(any failure)──────────────> OPEN
```

| State | Behavior |
|-------|----------|
| `closed` | Normal operation. Upstream result passes through. Failures increment counter. When `failureCount >= failureThreshold`, transition to `open`. |
| `open` | Fail-fast mode. Immediately return `fallbackValue` without executing upstream. After `timeout` seconds elapse since the circuit opened, transition to `half_open`. |
| `half_open` | Probe mode. Allow a limited number of requests through. If `successThreshold` consecutive successes occur, transition to `closed`. Any single failure transitions back to `open`. |

### 1.2 State Transitions

```
┌─────────────────────────────────────────────────────┐
│                                                     │
│    ┌────────┐   failures >= threshold   ┌────────┐  │
│    │ CLOSED │──────────────────────────>│  OPEN  │  │
│    │        │                           │        │  │
│    │ Pass   │<─────────────────────────┐│ Return │  │
│    │ through│  successes >= threshold  ││fallback│  │
│    └────────┘                          │└───┬────┘  │
│         ^                              │    │       │
│         │         ┌───────────┐        │    │       │
│         │         │ HALF_OPEN │────────┘    │       │
│         │         │           │  failure     │       │
│         └─────────│ Limited   │<────────────┘       │
│      successes    │ probe     │  timeout elapsed    │
│      >= threshold └───────────┘                     │
│                                                     │
└─────────────────────────────────────────────────────┘
```

---

## 2. Redis Key Design

All keys use the prefix `circuit:` followed by the resolved `circuitName`.

| Key | Type | Value | TTL |
|-----|------|-------|-----|
| `circuit:{name}:state` | STRING | `closed`, `open`, or `half_open` | `timeout * 3` (refreshed on write) |
| `circuit:{name}:failures` | STRING (int) | Consecutive failure count | `timeout * 3` |
| `circuit:{name}:successes` | STRING (int) | Consecutive success count (half_open only) | `timeout * 3` |
| `circuit:{name}:opened_at` | STRING (float) | Unix timestamp when circuit entered `open` state | `timeout * 3` |
| `circuit:{name}:last_failure_time` | STRING (float) | Unix timestamp of most recent failure | `timeout * 3` |

### 2.1 Key TTL Strategy

Keys expire at `timeout * 3` seconds. This ensures:
- Open circuits don't persist indefinitely if no requests arrive after timeout
- Stale state is cleaned up automatically
- TTL is refreshed on every state transition

### 2.2 Atomic Operations via Lua Scripts

All state reads and transitions MUST be atomic to prevent race conditions in distributed environments. Two Lua scripts handle all operations:

**Script 1: `CIRCUIT_BREAKER_CHECK_SCRIPT`** -- Called before execution to determine if the request should proceed or be rejected.

**Script 2: `CIRCUIT_BREAKER_RECORD_SCRIPT`** -- Called after execution to record success or failure and perform state transitions.

---

## 3. Lua Script Specifications

### 3.1 Check Script (Pre-Execution)

```
Input:
  KEYS[1] = circuit:{name}:state
  KEYS[2] = circuit:{name}:opened_at
  ARGV[1] = now (unix timestamp)
  ARGV[2] = timeout (seconds)
  ARGV[3] = ttl (key expiry seconds)

Logic:
  1. Read current state (default: "closed" if not set)
  2. If state == "closed" or state == "half_open":
     -> Return {1, state}  (1 = allowed)
  3. If state == "open":
     a. Read opened_at timestamp
     b. If (now - opened_at) >= timeout:
        -> Transition to "half_open" (atomic SET)
        -> Reset successes counter to 0
        -> Return {1, "half_open"}  (1 = allowed, state transitioned)
     c. Else:
        -> Return {0, "open"}  (0 = rejected)

Output: {allowed (0/1), current_state (string)}
```

### 3.2 Record Script (Post-Execution)

```
Input:
  KEYS[1] = circuit:{name}:state
  KEYS[2] = circuit:{name}:failures
  KEYS[3] = circuit:{name}:successes
  KEYS[4] = circuit:{name}:opened_at
  KEYS[5] = circuit:{name}:last_failure_time
  ARGV[1] = outcome ("success" or "failure")
  ARGV[2] = now (unix timestamp)
  ARGV[3] = failure_threshold
  ARGV[4] = success_threshold
  ARGV[5] = ttl (key expiry seconds)

Logic:
  1. Read current state (default: "closed")

  2. If outcome == "success":
     a. If state == "closed":
        -> Reset failures to 0
        -> No state change
     b. If state == "half_open":
        -> Increment successes
        -> If successes >= success_threshold:
           -> Transition to "closed"
           -> Reset failures to 0, successes to 0
        -> Else: remain in half_open

  3. If outcome == "failure":
     a. Set last_failure_time = now
     b. If state == "closed":
        -> Increment failures
        -> If failures >= failure_threshold:
           -> Transition to "open"
           -> Set opened_at = now
           -> Reset successes to 0
     c. If state == "half_open":
        -> Transition to "open" immediately (any failure in half_open reopens)
        -> Set opened_at = now
        -> Reset successes to 0

  4. Refresh TTL on all keys

Output: {new_state, failure_count, success_count, last_failure_time}
```

---

## 4. Node Registry Specification

### 4.1 NodeTypeSpec

```python
NodeTypeSpec(
    type="circuit_breaker",
    display_name="Circuit Breaker",
    description="Protect workflow from cascading failures with automatic circuit breaking",
    icon="shield-off",
    color="red",
    category="flow_control",
    inputs=[...],  # See 4.2
    outputs=[...], # See 4.3
    executor="app.orchestrator.node_executors.flow_executors.circuit_breaker_executor.CircuitBreakerExecutor",
)
```

### 4.2 Input Specifications

| Name | Display Name | data_type | ui_type | required | accepts_connection | default | validation | placeholder |
|------|-------------|-----------|---------|----------|-------------------|---------|------------|-------------|
| `input` | Input Data | `any` | `json_editor` | `False` | `True` | `None` | -- | `"Data from upstream node to pass through..."` |
| `circuitName` | Circuit Name | `text` | `text` | `True` | `True` | `"default"` | `{"pattern": "^[a-zA-Z0-9_\\-\\.]+$", "min_length": 1, "max_length": 128}` | `"api-service-name (supports {{expressions}})"` |
| `failureThreshold` | Failure Threshold | `number` | `number` | `False` | `False` | `5` | `{"min": 1, "max": 100}` | -- |
| `successThreshold` | Success Threshold (Half-Open) | `number` | `number` | `False` | `False` | `2` | `{"min": 1, "max": 50}` | -- |
| `timeout` | Open Duration (seconds) | `number` | `number` | `False` | `False` | `60` | `{"min": 1, "max": 3600}` | -- |
| `fallbackValue` | Fallback Value | `any` | `json_editor` | `False` | `True` | `None` | -- | `"Value to return when circuit is open..."` |

### 4.3 Output Specifications

| Name | Display Name | data_type |
|------|-------------|-----------|
| `result` | Result | `any` |
| `circuitState` | Circuit State | `text` |
| `failureCount` | Failure Count | `number` |
| `lastFailureTime` | Last Failure Time | `number` |

---

## 5. Executor Implementation

### 5.1 Class Structure

```python
class CircuitBreakerOpenError(Exception):
    """Raised when circuit is open and no fallback is configured."""

class CircuitBreakerExecutor:
    """Executor for circuit_breaker nodes using Redis-based distributed state."""

    # Safety caps
    MAX_TIMEOUT_SECONDS = 3600     # 1 hour max open duration
    MAX_FAILURE_THRESHOLD = 100
    MAX_SUCCESS_THRESHOLD = 50
    MAX_CIRCUIT_NAME_LENGTH = 128

    def __init__(self) -> None:
        self._redis: Redis | None = None
        self._expression_resolver = ExpressionResolver()

    async def _get_redis(self) -> Redis:
        """Get or create async Redis connection. Fail-closed on error."""

    async def execute(self, data: NodeExecutionData, context: ExecutionContext) -> dict[str, Any]:
        """Main execution entry point."""

    async def _check_circuit(self, redis, circuit_name, timeout, ttl) -> dict:
        """Run Lua check script. Returns {allowed, state}."""

    async def _record_outcome(self, redis, circuit_name, outcome, failure_threshold,
                               success_threshold, ttl) -> dict:
        """Run Lua record script. Returns {state, failures, successes, last_failure_time}."""
```

### 5.2 Execute Flow

```
execute(data, context):
  1. Extract & validate configuration (circuitName, thresholds, timeout, fallbackValue)
  2. Resolve circuitName expressions via ExpressionResolver
  3. Get Redis connection (fail-closed)
  4. Run CHECK script (pre-execution):
     - If rejected (circuit is open):
       a. If fallbackValue is configured -> return fallback with circuitState="open"
       b. If no fallback -> raise CircuitBreakerOpenError
     - If allowed (closed or half_open):
       -> Continue to step 5
  5. Determine upstream result:
     - If context.extra_data["circuit_target_fn"] exists -> call it
     - Else -> passthrough data.inputs["input"]
     - Wrap in try/except to capture success/failure
  6. Run RECORD script (post-execution):
     - outcome = "success" or "failure"
  7. Return output dict:
     - result: upstream result or fallback
     - circuitState: current state after recording
     - failureCount: from record result
     - lastFailureTime: from record result
```

### 5.3 Error Handling

| Scenario | Behavior |
|----------|----------|
| Redis unreachable | Raise `ConnectionError` (fail-closed, do NOT silently allow) |
| Circuit open + fallback configured | Return fallback value, `circuitState = "open"` |
| Circuit open + no fallback | Raise `CircuitBreakerOpenError` |
| Upstream execution fails (closed state) | Record failure, propagate original error or return error in output |
| Upstream execution fails (half_open state) | Record failure (circuit reopens), propagate error |
| Invalid circuitName (unsafe chars) | Raise `ValueError` |
| Invalid thresholds (out of range) | Clamp to valid range with warning log |

### 5.4 Fail-Closed Policy

The circuit breaker follows the same fail-closed policy as the rate limiter:
- If Redis is down, the executor raises `ConnectionError` rather than silently allowing requests
- This prevents uncontrolled request flow when the state store is unavailable
- Workflow authors should combine with the retry node if they want retry-on-Redis-failure behavior

---

## 6. Lua Script Implementation

### 6.1 CIRCUIT_BREAKER_CHECK_SCRIPT

```lua
-- Circuit Breaker Check (Pre-Execution)
-- KEYS[1] = circuit:{name}:state
-- KEYS[2] = circuit:{name}:opened_at
-- KEYS[3] = circuit:{name}:successes
-- ARGV[1] = now (unix timestamp)
-- ARGV[2] = timeout (seconds before open -> half_open)
-- ARGV[3] = ttl (key expiry in seconds)

local state_key = KEYS[1]
local opened_at_key = KEYS[2]
local successes_key = KEYS[3]
local now = tonumber(ARGV[1])
local timeout = tonumber(ARGV[2])
local ttl = tonumber(ARGV[3])

local state = redis.call('GET', state_key)
if state == false then
    state = 'closed'
end

if state == 'closed' or state == 'half_open' then
    return {1, state}
end

-- state == 'open': check if timeout has elapsed
local opened_at = tonumber(redis.call('GET', opened_at_key))
if opened_at == nil then
    -- No opened_at recorded, treat as recoverable -> half_open
    redis.call('SET', state_key, 'half_open')
    redis.call('SET', successes_key, '0')
    redis.call('EXPIRE', state_key, ttl)
    redis.call('EXPIRE', successes_key, ttl)
    return {1, 'half_open'}
end

if (now - opened_at) >= timeout then
    -- Timeout elapsed -> transition to half_open
    redis.call('SET', state_key, 'half_open')
    redis.call('SET', successes_key, '0')
    redis.call('EXPIRE', state_key, ttl)
    redis.call('EXPIRE', successes_key, ttl)
    redis.call('EXPIRE', opened_at_key, ttl)
    return {1, 'half_open'}
end

-- Still within open timeout -> reject
return {0, 'open'}
```

### 6.2 CIRCUIT_BREAKER_RECORD_SCRIPT

```lua
-- Circuit Breaker Record (Post-Execution)
-- KEYS[1] = circuit:{name}:state
-- KEYS[2] = circuit:{name}:failures
-- KEYS[3] = circuit:{name}:successes
-- KEYS[4] = circuit:{name}:opened_at
-- KEYS[5] = circuit:{name}:last_failure_time
-- ARGV[1] = outcome ("success" or "failure")
-- ARGV[2] = now (unix timestamp)
-- ARGV[3] = failure_threshold
-- ARGV[4] = success_threshold
-- ARGV[5] = ttl (key expiry in seconds)

local state_key = KEYS[1]
local failures_key = KEYS[2]
local successes_key = KEYS[3]
local opened_at_key = KEYS[4]
local last_failure_key = KEYS[5]

local outcome = ARGV[1]
local now = tonumber(ARGV[2])
local failure_threshold = tonumber(ARGV[3])
local success_threshold = tonumber(ARGV[4])
local ttl = tonumber(ARGV[5])

local state = redis.call('GET', state_key)
if state == false then
    state = 'closed'
end

local failures = tonumber(redis.call('GET', failures_key) or '0')
if failures == nil then failures = 0 end
local successes = tonumber(redis.call('GET', successes_key) or '0')
if successes == nil then successes = 0 end
local last_failure_time = tonumber(redis.call('GET', last_failure_key) or '0')
if last_failure_time == nil then last_failure_time = 0 end

if outcome == 'success' then
    if state == 'closed' then
        -- Reset failure count on success in closed state
        failures = 0
        redis.call('SET', failures_key, '0')
    elseif state == 'half_open' then
        successes = successes + 1
        redis.call('SET', successes_key, tostring(successes))
        if successes >= success_threshold then
            -- Recovery complete -> close circuit
            state = 'closed'
            failures = 0
            successes = 0
            redis.call('SET', state_key, 'closed')
            redis.call('SET', failures_key, '0')
            redis.call('SET', successes_key, '0')
        end
    end
elseif outcome == 'failure' then
    last_failure_time = now
    redis.call('SET', last_failure_key, tostring(now))

    if state == 'closed' then
        failures = failures + 1
        redis.call('SET', failures_key, tostring(failures))
        if failures >= failure_threshold then
            -- Too many failures -> open circuit
            state = 'open'
            successes = 0
            redis.call('SET', state_key, 'open')
            redis.call('SET', opened_at_key, tostring(now))
            redis.call('SET', successes_key, '0')
        end
    elseif state == 'half_open' then
        -- Any failure in half_open -> reopen immediately
        state = 'open'
        successes = 0
        redis.call('SET', state_key, 'open')
        redis.call('SET', opened_at_key, tostring(now))
        redis.call('SET', successes_key, '0')
    end
end

-- Refresh TTL on all keys
redis.call('EXPIRE', state_key, ttl)
redis.call('EXPIRE', failures_key, ttl)
redis.call('EXPIRE', successes_key, ttl)
redis.call('EXPIRE', opened_at_key, ttl)
redis.call('EXPIRE', last_failure_key, ttl)

return {state, tostring(failures), tostring(successes), tostring(last_failure_time)}
```

---

## 7. Test Plan

### 7.1 Unit Tests (test_circuit_breaker_executor.py)

Tests use `fakeredis.aioredis` to mock Redis without requiring a running instance.

| # | Test | Description |
|---|------|-------------|
| 1 | `test_closed_passthrough` | Closed circuit passes input through unchanged, outputs `circuitState="closed"` |
| 2 | `test_closed_to_open_transition` | After `failureThreshold` consecutive failures, circuit transitions to `open` |
| 3 | `test_open_returns_fallback` | Open circuit returns configured `fallbackValue` without executing upstream |
| 4 | `test_open_no_fallback_raises` | Open circuit with no fallback raises `CircuitBreakerOpenError` |
| 5 | `test_open_to_half_open_transition` | After `timeout` seconds, open circuit transitions to `half_open` |
| 6 | `test_half_open_success_closes` | After `successThreshold` successes in `half_open`, circuit closes |
| 7 | `test_half_open_failure_reopens` | Single failure in `half_open` reopens circuit immediately |
| 8 | `test_success_resets_failure_count` | Success in `closed` state resets failure counter to 0 |
| 9 | `test_expression_resolution` | `circuitName` with `{{variable}}` syntax is resolved correctly |
| 10 | `test_invalid_circuit_name` | Circuit name with unsafe characters raises `ValueError` |
| 11 | `test_redis_connection_failure` | Redis unreachable raises `ConnectionError` (fail-closed) |
| 12 | `test_default_configuration` | Default values (threshold=5, success=2, timeout=60) work correctly |
| 13 | `test_concurrent_state_transitions` | Multiple simultaneous requests produce correct atomic state changes |
| 14 | `test_circuit_name_scoping` | Different `circuitName` values maintain independent state |
| 15 | `test_threshold_validation` | Out-of-range thresholds are clamped to valid range |
| 16 | `test_ttl_refresh` | Redis keys have TTL refreshed on every state change |

### 7.2 Test Markers

```python
@pytest.mark.unit
@pytest.mark.asyncio
```

---

## 8. Implementation Steps

### Step 1: Create executor file
File: `python-backend/app/orchestrator/node_executors/flow_executors/circuit_breaker_executor.py`

Contains:
- `CircuitBreakerOpenError` exception class
- `CIRCUIT_BREAKER_CHECK_SCRIPT` Lua string
- `CIRCUIT_BREAKER_RECORD_SCRIPT` Lua string
- `CircuitBreakerExecutor` class with `execute()`, `_get_redis()`, `_check_circuit()`, `_record_outcome()` methods

Pattern follows `rate_limiter_executor.py` exactly: same Redis connection approach, same structlog usage, same fail-closed policy, same expression resolution.

### Step 2: Register in node_registry.py
Add the `circuit_breaker` NodeTypeSpec to `_register_core_nodes()` in the flow_control section, after the existing `rate_limiter` registration.

### Step 3: Update flow_executors/__init__.py
Add imports and exports for `CircuitBreakerExecutor` and `CircuitBreakerOpenError`.

### Step 4: Write tests
Create `python-backend/tests/test_circuit_breaker_executor.py` with all 16 test cases.

### Step 5: Verify
- Run `pytest tests/test_circuit_breaker_executor.py -v`
- Run `ruff check app/orchestrator/node_executors/flow_executors/circuit_breaker_executor.py`
- Run `black --check app/orchestrator/node_executors/flow_executors/circuit_breaker_executor.py`
- Run `mypy app/orchestrator/node_executors/flow_executors/circuit_breaker_executor.py`

---

## 9. Risk Assessment

| Risk | Severity | Mitigation |
|------|----------|------------|
| Redis race conditions on state transitions | HIGH | Lua scripts execute atomically within Redis; all state reads and writes are in a single EVAL call |
| Redis unavailability during workflow execution | MEDIUM | Fail-closed policy prevents uncontrolled flow; workflow authors use retry node for resilience |
| Memory leak from orphaned Redis keys | LOW | All keys have TTL = `timeout * 3`; automatic cleanup by Redis |
| Circuit name collision across tenants | MEDIUM | Circuit names should be scoped by tenant; documentation should recommend `{{context.tenantId}}-service-name` pattern |
| Thundering herd on half_open transition | LOW | Only the first request to transition open->half_open succeeds atomically; subsequent requests in the same Lua eval window will see half_open and proceed, but `successThreshold` prevents premature closure |

---

## 10. Integration Notes

### 10.1 Workflow Composition Patterns

The circuit breaker node is designed to compose with other flow_control nodes:

```
[HTTP Request] --> [Circuit Breaker] --> [Retry] --> [Output]
                        |
                        v (open)
                   [Fallback Logic]
```

- **Circuit Breaker + Retry**: Place retry AFTER circuit breaker. The circuit breaker prevents retrying a known-dead service. If the circuit is closed/half_open, the retry node handles transient failures.
- **Circuit Breaker + Rate Limiter**: Place rate limiter BEFORE circuit breaker. Rate limiting controls request volume; circuit breaking handles failure detection.
- **Circuit Breaker + Timeout**: Place timeout around the upstream operation. If the timeout fires, the circuit breaker records a failure.

### 10.2 Orchestrator Integration

The orchestrator injects a `circuit_target_fn` into `context.extra_data` when the circuit breaker wraps an upstream callable (same pattern as `retry_target_fn` in the retry executor). When no target function is injected, the executor operates in passthrough mode using `data.inputs["input"]`.

In passthrough mode, the circuit breaker evaluates success/failure based on whether the input data indicates an error:
- If `input` is a dict with key `"error"` or `"succeeded": False` -> record as failure
- Otherwise -> record as success

### 10.3 Frontend Behavior

No frontend changes needed. The registry-driven architecture means:
- The node appears in the workflow palette under "Flow Control" with the `shield-off` icon
- The DynamicNodeConfig component renders all input fields automatically
- Connection validation uses the port data types from the registry
- The node is draggable and connectable like all other nodes
