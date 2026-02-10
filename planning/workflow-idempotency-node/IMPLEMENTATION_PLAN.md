# Idempotency Workflow Node Executor - Implementation Plan

## Problem Statement

Workflow executions that trigger external side effects (API calls, payment processing, email sending, database writes) need deduplication to prevent duplicate operations on retries, replays, or concurrent executions. The idempotency node acts as a guard gate: it computes a fingerprint of the request data, checks Redis for a prior execution with the same fingerprint, and either allows execution to proceed (first-time) or returns early with the cached result / skip signal (duplicate).

This is distinct from the rate limiter node (which throttles throughput) -- the idempotency node prevents the **same logical operation** from running twice.

## Architecture Overview

```
Workflow Execution
    |
    v
[Idempotency Node]
    |
    +-- Determine idempotency mode:
    |       +-- request_fingerprint: Hash selected input fields via SHA-256
    |       +-- custom_key: Use user-provided key (supports {{expressions}})
    |       +-- time_window: Fingerprint + time-window bucketing
    |
    +-- Build Redis key: idempotency:{workflow_id}:{node_id}:{hash}
    |
    +-- Atomic check-and-set via Lua script:
    |       |
    |       +-- Key does NOT exist (first execution):
    |       |       SET key with {executed_at, result: null}
    |       |       Set TTL
    |       |       Return: is_new=true
    |       |
    |       +-- Key EXISTS (duplicate):
    |               Return: is_new=false, stored_data
    |
    +-- If first execution:
    |       Return {executed: true, isDuplicate: false, firstSeenAt: now}
    |
    +-- If duplicate:
            |
            +-- onDuplicate=skip:          Return {executed: false, isDuplicate: true}
            +-- onDuplicate=return_cached:  Return {executed: false, isDuplicate: true, cachedResult: ...}
            +-- onDuplicate=throw_error:    Raise DuplicateExecutionError
```

### Result Caching Flow (Two-Phase)

For `onDuplicate=return_cached`, the node needs to store the result of the downstream operation. This requires a **two-phase protocol**:

1. **Phase 1 (this node executes)**: Claim the idempotency slot in Redis (`SET NX`). Return `executed=true` so downstream nodes run.
2. **Phase 2 (downstream completes)**: The orchestrator (or a dedicated "commit result" mechanism) calls back to store the result in the same Redis key.

For the initial implementation, Phase 2 is handled by the node itself via an optional `resultData` input port that can receive data from downstream nodes when re-entered. A simpler alternative is to only cache "execution happened" (not the result), which is sufficient for `skip` mode.

**Decision**: Implement full result caching. The idempotency key stores `{executed_at, result}`. The `result` field is populated via a second input port (`resultToCache`) that downstream nodes connect to. When this port has data, the executor updates the Redis record with the cached result before returning.

## Affected Files

| File | Action | Description |
|------|--------|-------------|
| `python-backend/app/orchestrator/node_executors/flow_executors/idempotency_executor.py` | **CREATE** | Main executor with fingerprinting, Redis check-and-set, result caching |
| `python-backend/app/orchestrator/node_executors/flow_executors/__init__.py` | **MODIFY** | Export `IdempotencyExecutor` and `DuplicateExecutionError` |
| `python-backend/app/orchestrator/node_registry.py` | **MODIFY** | Register `idempotency` node type with full spec |
| `python-backend/tests/test_idempotency_executor.py` | **CREATE** | Unit + integration tests |

No database changes. No migration needed. No frontend changes (frontend consumes registry from backend API).

## Risk Assessment

| Risk | Level | Mitigation |
|------|-------|------------|
| Redis connection failure | Medium | Fail-closed: raise `ConnectionError`, do not silently allow duplicate |
| Lua script race condition | Low | `SET NX` in Lua is atomic; no TOCTOU possible |
| Key memory leak | Low | Every key gets explicit TTL (default 3600s, configurable) |
| Hash collision (SHA-256) | Negligible | SHA-256 collision probability is ~2^-128; practically impossible |
| Large cached results in Redis | Medium | Cap `resultToCache` size at 1MB; reject larger payloads |
| Clock drift across workers | Low | Uses Redis server time via Lua `redis.call('TIME')` for `firstSeenAt` |
| Expression injection in custom_key | Low | ExpressionResolver already validates against SAFE_EXPR_PATTERN |

---

## Step 1: Fingerprint Generation

The fingerprint is a SHA-256 hash that uniquely identifies a logical operation. Three modes determine how the fingerprint is computed.

### 1.1 Mode: `request_fingerprint`

Hash selected fields from the node's input data. The `fingerprintFields` configuration specifies which fields to include.

```python
import hashlib
import json
from typing import Any


def compute_request_fingerprint(
    inputs: dict[str, Any],
    fingerprint_fields: list[str],
    workflow_id: str,
    node_id: str,
) -> str:
    """Compute SHA-256 fingerprint from selected input fields.

    Args:
        inputs: Node input data (resolved values from upstream nodes).
        fingerprint_fields: List of field names to include in the hash.
            If empty, ALL input fields are included.
        workflow_id: Workflow ID for scoping.
        node_id: Node ID for scoping.

    Returns:
        Hex-encoded SHA-256 hash string.
    """
    # Build the data dict to hash
    if fingerprint_fields:
        data = {k: inputs.get(k) for k in sorted(fingerprint_fields)}
    else:
        # Hash all inputs (excluding internal control fields)
        exclude = {"onDuplicate", "ttl", "fingerprintFields", "idempotencyKey", "mode"}
        data = {k: v for k, v in sorted(inputs.items()) if k not in exclude}

    # Include execution context for scoping
    payload = {
        "workflow_id": workflow_id,
        "node_id": node_id,
        "data": data,
    }

    # JSON serialize with sorted keys for deterministic output
    serialized = json.dumps(payload, sort_keys=True, default=str)
    return hashlib.sha256(serialized.encode("utf-8")).hexdigest()
```

**Key design decisions:**
- **Sorted keys**: `json.dumps(sort_keys=True)` ensures deterministic serialization regardless of dict insertion order.
- **`default=str`**: Handles non-JSON-serializable types (datetime, UUID, etc.) by converting to string.
- **Scope includes `workflow_id` and `node_id`**: Two different nodes in the same workflow processing identical data should NOT be considered duplicates.
- **Empty `fingerprintFields` = all fields**: Convenient default for simple cases.

### 1.2 Mode: `custom_key`

User provides an explicit idempotency key, optionally containing `{{expression}}` references.

```python
def compute_custom_key_fingerprint(
    idempotency_key: str,
    state: dict[str, Any],
    workflow_id: str,
    node_id: str,
    expression_resolver: ExpressionResolver,
) -> str:
    """Compute fingerprint from user-provided idempotency key.

    The key is resolved through ExpressionResolver to support
    dynamic values like {{orderId}} or {{userId}}-{{action}}.

    Returns:
        SHA-256 hash of the resolved key + scope.
    """
    resolved_key = expression_resolver.resolve(idempotency_key, state)

    payload = {
        "workflow_id": workflow_id,
        "node_id": node_id,
        "custom_key": resolved_key,
    }

    serialized = json.dumps(payload, sort_keys=True)
    return hashlib.sha256(serialized.encode("utf-8")).hexdigest()
```

### 1.3 Mode: `time_window`

Same as `request_fingerprint` but adds a time-window bucket to the hash. This means the same data is only considered a duplicate within the specified time window. After the window expires, the same data can be processed again.

```python
def compute_time_window_fingerprint(
    inputs: dict[str, Any],
    fingerprint_fields: list[str],
    workflow_id: str,
    node_id: str,
    window_size_seconds: int,
    current_time: float,
) -> str:
    """Compute fingerprint scoped to a time window.

    The time window bucket is floor(now / window_size) * window_size,
    so all requests within the same window produce the same hash.

    Args:
        window_size_seconds: Duration of each deduplication window.
        current_time: Current Unix timestamp (from Redis server time).

    Returns:
        SHA-256 hash including the window bucket.
    """
    window_bucket = int(current_time // window_size_seconds) * window_size_seconds

    if fingerprint_fields:
        data = {k: inputs.get(k) for k in sorted(fingerprint_fields)}
    else:
        exclude = {"onDuplicate", "ttl", "fingerprintFields", "idempotencyKey", "mode"}
        data = {k: v for k, v in sorted(inputs.items()) if k not in exclude}

    payload = {
        "workflow_id": workflow_id,
        "node_id": node_id,
        "data": data,
        "window_bucket": window_bucket,
    }

    serialized = json.dumps(payload, sort_keys=True, default=str)
    return hashlib.sha256(serialized.encode("utf-8")).hexdigest()
```

---

## Step 2: Redis Lua Script (Atomic Check-and-Set)

A single Lua script handles the atomic "check if exists, set if not" operation. This prevents TOCTOU race conditions that would occur with separate GET + SET commands.

### Lua Script

```lua
-- Idempotency Check-and-Set
-- KEYS[1] = idempotency:{hash}
-- ARGV[1] = ttl (seconds)
-- ARGV[2] = now (unix timestamp from Redis server)
-- ARGV[3] = execution_id (for audit trail)
--
-- Returns:
--   {is_new (0 or 1), first_seen_at (string), cached_result (string or "null")}

local idem_key = KEYS[1]
local ttl = tonumber(ARGV[1])
local now = ARGV[2]
local execution_id = ARGV[3]

-- Try to read existing record
local existing = redis.call('GET', idem_key)

if existing == false then
    -- First execution: claim the slot
    local record = cjson.encode({
        executed_at = now,
        execution_id = execution_id,
        result = cjson.null
    })
    redis.call('SET', idem_key, record, 'EX', ttl)
    return {1, now, "null"}
else
    -- Duplicate: return stored data
    local data = cjson.decode(existing)
    local first_seen = data.executed_at or now
    local cached_result = "null"
    if data.result ~= cjson.null and data.result ~= nil then
        cached_result = cjson.encode(data.result)
    end
    return {0, tostring(first_seen), cached_result}
end
```

### Why `SET` with `NX` semantics via Lua instead of `SET NX`?

Using a Lua script instead of raw `SET key value NX EX ttl` gives us:
1. **Atomic read of existing data**: If the key exists, we need to return the stored `first_seen_at` and `cached_result`. A raw `SET NX` only tells us "set succeeded or not" -- it does not return the existing value.
2. **Structured storage**: We store a JSON object with multiple fields, not just a flag.
3. **Consistent with the rate limiter pattern**: The codebase already uses Lua scripts for atomic Redis operations in `rate_limiter_executor.py`.

### Result Caching Update Script

A separate Lua script updates the cached result after downstream execution completes.

```lua
-- Idempotency Result Cache Update
-- KEYS[1] = idempotency:{hash}
-- ARGV[1] = result_json (serialized result data)
-- ARGV[2] = max_result_size (bytes, for safety cap)
--
-- Returns: 1 if updated, 0 if key not found (expired)

local idem_key = KEYS[1]
local result_json = ARGV[1]
local max_size = tonumber(ARGV[2])

-- Size check
if #result_json > max_size then
    return -1  -- Result too large
end

-- Read existing record
local existing = redis.call('GET', idem_key)
if existing == false then
    return 0  -- Key expired, nothing to update
end

-- Update the result field
local data = cjson.decode(existing)
data.result = cjson.decode(result_json)
local updated = cjson.encode(data)

-- Preserve remaining TTL
local remaining_ttl = redis.call('TTL', idem_key)
if remaining_ttl > 0 then
    redis.call('SET', idem_key, updated, 'EX', remaining_ttl)
else
    redis.call('SET', idem_key, updated)
end

return 1
```

---

## Step 3: Executor Implementation

**File**: `python-backend/app/orchestrator/node_executors/flow_executors/idempotency_executor.py`

### 3.1 Class Structure

```python
"""Idempotency Executor - Distributed deduplication using Redis.

Supports three modes:
- request_fingerprint: SHA-256 hash of selected input fields
- custom_key: User-provided idempotency key (supports {{expressions}})
- time_window: Fingerprint + time-window bucketing

Uses atomic Lua scripts for race-condition-free check-and-set operations.
Fail-closed: Redis errors raise exceptions rather than silently allowing duplicates.
"""
import hashlib
import json
import time
from typing import Any

import structlog
from redis.asyncio import Redis
from redis.exceptions import ConnectionError as RedisConnectionError
from redis.exceptions import RedisError
from redis.exceptions import TimeoutError as RedisTimeoutError

from app.core.config import settings
from app.orchestrator.expression_resolver import ExpressionResolver
from app.orchestrator.node_executors.base import ExecutionContext, NodeExecutionData

logger = structlog.get_logger(__name__)


class DuplicateExecutionError(Exception):
    """Raised when onDuplicate=throw_error and a duplicate is detected."""

    def __init__(self, fingerprint: str, first_seen_at: float):
        self.fingerprint = fingerprint
        self.first_seen_at = first_seen_at
        super().__init__(
            f"Duplicate execution detected (fingerprint: {fingerprint[:16]}...). "
            f"First seen at {first_seen_at}"
        )


class IdempotencyExecutor:
    """Executor for idempotency nodes using Redis-based distributed deduplication.

    Computes a fingerprint of the request data using one of three modes,
    then atomically checks Redis to determine if this is a first execution
    or a duplicate. Supports result caching for return_cached mode.
    """

    # Safety caps
    MAX_TTL_SECONDS = 86400 * 30  # 30 days maximum
    MIN_TTL_SECONDS = 1
    DEFAULT_TTL_SECONDS = 3600  # 1 hour
    MAX_CACHED_RESULT_BYTES = 1_048_576  # 1 MB
    MAX_FINGERPRINT_FIELDS = 50

    VALID_MODES = ("request_fingerprint", "custom_key", "time_window")
    VALID_ON_DUPLICATE = ("skip", "return_cached", "throw_error")

    def __init__(self) -> None:
        self._redis: Redis | None = None
        self._expression_resolver = ExpressionResolver()

    async def _get_redis(self) -> Redis:
        """Get or create async Redis connection.

        Raises:
            ConnectionError: If Redis is unreachable (fail-closed).
        """
        if self._redis is None:
            redis_url = settings.REDIS_URL or "redis://localhost:6379/0"
            self._redis = Redis.from_url(
                redis_url,
                decode_responses=True,
                socket_connect_timeout=5,
                socket_timeout=5,
                retry_on_timeout=True,
            )
            try:
                await self._redis.ping()
            except (RedisConnectionError, RedisTimeoutError, OSError) as e:
                self._redis = None
                raise ConnectionError(
                    f"Cannot connect to Redis at {redis_url} for idempotency: {e}"
                ) from e
        return self._redis

    async def execute(
        self,
        data: NodeExecutionData,
        context: ExecutionContext,
    ) -> dict[str, Any]:
        """Execute idempotency check.

        Args:
            data: Node execution data with config and inputs.
            context: Execution context (user, workflow, execution IDs).

        Returns:
            dict with executed, isDuplicate, cachedResult, firstSeenAt.

        Raises:
            ValueError: On invalid configuration.
            ConnectionError: If Redis is unreachable.
            DuplicateExecutionError: If onDuplicate=throw_error and duplicate detected.
        """
        # ... (see Step 3.2 below)
```

### 3.2 Execute Method (Full Logic)

```python
async def execute(self, data, context):
    config = data.config
    inputs = data.inputs

    # --- Extract and validate configuration ---
    mode = inputs.get("mode", config.get("mode", "request_fingerprint"))
    if mode not in self.VALID_MODES:
        raise ValueError(
            f"Invalid idempotency mode: {mode}. Must be one of {self.VALID_MODES}"
        )

    on_duplicate = inputs.get("onDuplicate", config.get("onDuplicate", "skip"))
    if on_duplicate not in self.VALID_ON_DUPLICATE:
        raise ValueError(
            f"Invalid onDuplicate action: {on_duplicate}. "
            f"Must be one of {self.VALID_ON_DUPLICATE}"
        )

    ttl = int(inputs.get("ttl", config.get("ttl", self.DEFAULT_TTL_SECONDS)))
    ttl = max(self.MIN_TTL_SECONDS, min(ttl, self.MAX_TTL_SECONDS))

    fingerprint_fields = inputs.get(
        "fingerprintFields", config.get("fingerprintFields", [])
    )
    if isinstance(fingerprint_fields, str):
        # Allow comma-separated string
        fingerprint_fields = [f.strip() for f in fingerprint_fields.split(",") if f.strip()]
    if len(fingerprint_fields) > self.MAX_FINGERPRINT_FIELDS:
        raise ValueError(
            f"Too many fingerprint fields (max {self.MAX_FINGERPRINT_FIELDS})"
        )

    idempotency_key = inputs.get("idempotencyKey", config.get("idempotencyKey", ""))
    result_to_cache = inputs.get("resultToCache", None)

    # --- Compute fingerprint based on mode ---
    fingerprint = self._compute_fingerprint(
        mode=mode,
        inputs=inputs,
        fingerprint_fields=fingerprint_fields,
        idempotency_key=idempotency_key,
        workflow_id=context.workflow_id,
        node_id=data.node_id,
        state=data.state,
        ttl=ttl,
    )

    # --- Build Redis key ---
    redis_key = f"idempotency:{context.workflow_id}:{data.node_id}:{fingerprint}"

    # --- Get Redis connection (fail-closed) ---
    try:
        redis = await self._get_redis()
    except ConnectionError:
        raise
    except (RedisError, OSError) as e:
        raise ConnectionError(f"Redis error during idempotency check: {e}") from e

    # --- Phase 1: Check-and-set ---
    try:
        is_new, first_seen_at, cached_result = await self._check_and_set(
            redis=redis,
            key=redis_key,
            ttl=ttl,
            execution_id=context.execution_id,
        )
    except (RedisError, OSError) as e:
        raise ConnectionError(f"Redis error during idempotency check: {e}") from e

    # --- Phase 2: Cache result if provided ---
    if result_to_cache is not None and is_new:
        try:
            await self._cache_result(redis, redis_key, result_to_cache)
        except (RedisError, OSError) as e:
            logger.warning(
                "idempotency_cache_result_failed",
                node_id=data.node_id,
                error=str(e),
            )
            # Non-fatal: the execution already happened, caching failure
            # should not prevent the workflow from continuing

    # --- Handle duplicate ---
    if not is_new:
        logger.info(
            "idempotency_duplicate_detected",
            node_id=data.node_id,
            fingerprint=fingerprint[:16],
            mode=mode,
            on_duplicate=on_duplicate,
            first_seen_at=first_seen_at,
        )

        if on_duplicate == "throw_error":
            raise DuplicateExecutionError(
                fingerprint=fingerprint,
                first_seen_at=first_seen_at,
            )

        return {
            "executed": False,
            "isDuplicate": True,
            "cachedResult": cached_result if on_duplicate == "return_cached" else None,
            "firstSeenAt": first_seen_at,
        }

    # --- First execution ---
    logger.info(
        "idempotency_first_execution",
        node_id=data.node_id,
        fingerprint=fingerprint[:16],
        mode=mode,
        ttl=ttl,
    )

    return {
        "executed": True,
        "isDuplicate": False,
        "cachedResult": None,
        "firstSeenAt": first_seen_at,
    }
```

### 3.3 Fingerprint Computation (Private Method)

```python
def _compute_fingerprint(
    self,
    mode: str,
    inputs: dict[str, Any],
    fingerprint_fields: list[str],
    idempotency_key: str,
    workflow_id: str,
    node_id: str,
    state: dict[str, Any],
    ttl: int,
) -> str:
    """Route to the correct fingerprinting strategy."""
    if mode == "request_fingerprint":
        return self._fingerprint_from_request(
            inputs, fingerprint_fields, workflow_id, node_id
        )
    elif mode == "custom_key":
        if not idempotency_key:
            raise ValueError(
                "idempotencyKey is required when mode is 'custom_key'"
            )
        return self._fingerprint_from_custom_key(
            idempotency_key, state, workflow_id, node_id
        )
    elif mode == "time_window":
        return self._fingerprint_from_time_window(
            inputs, fingerprint_fields, workflow_id, node_id, ttl
        )
    else:
        raise ValueError(f"Unknown idempotency mode: {mode}")

def _fingerprint_from_request(
    self,
    inputs: dict[str, Any],
    fingerprint_fields: list[str],
    workflow_id: str,
    node_id: str,
) -> str:
    """SHA-256 hash of selected input fields."""
    if fingerprint_fields:
        data = {k: inputs.get(k) for k in sorted(fingerprint_fields)}
    else:
        exclude = {
            "onDuplicate", "ttl", "fingerprintFields",
            "idempotencyKey", "mode", "resultToCache",
        }
        data = {k: v for k, v in sorted(inputs.items()) if k not in exclude}

    payload = {
        "workflow_id": workflow_id,
        "node_id": node_id,
        "data": data,
    }
    serialized = json.dumps(payload, sort_keys=True, default=str)
    return hashlib.sha256(serialized.encode("utf-8")).hexdigest()

def _fingerprint_from_custom_key(
    self,
    idempotency_key: str,
    state: dict[str, Any],
    workflow_id: str,
    node_id: str,
) -> str:
    """SHA-256 hash of resolved custom key."""
    resolved = self._expression_resolver.resolve(idempotency_key, state)
    payload = {
        "workflow_id": workflow_id,
        "node_id": node_id,
        "custom_key": resolved,
    }
    serialized = json.dumps(payload, sort_keys=True)
    return hashlib.sha256(serialized.encode("utf-8")).hexdigest()

def _fingerprint_from_time_window(
    self,
    inputs: dict[str, Any],
    fingerprint_fields: list[str],
    workflow_id: str,
    node_id: str,
    window_size_seconds: int,
) -> str:
    """SHA-256 hash scoped to a time window."""
    now = time.time()
    window_bucket = int(now // window_size_seconds) * window_size_seconds

    if fingerprint_fields:
        data = {k: inputs.get(k) for k in sorted(fingerprint_fields)}
    else:
        exclude = {
            "onDuplicate", "ttl", "fingerprintFields",
            "idempotencyKey", "mode", "resultToCache",
        }
        data = {k: v for k, v in sorted(inputs.items()) if k not in exclude}

    payload = {
        "workflow_id": workflow_id,
        "node_id": node_id,
        "data": data,
        "window_bucket": window_bucket,
    }
    serialized = json.dumps(payload, sort_keys=True, default=str)
    return hashlib.sha256(serialized.encode("utf-8")).hexdigest()
```

### 3.4 Redis Operations (Private Methods)

```python
async def _check_and_set(
    self,
    redis: Redis,
    key: str,
    ttl: int,
    execution_id: str,
) -> tuple[bool, float, Any]:
    """Atomic check-and-set via Lua script.

    Returns:
        Tuple of (is_new, first_seen_at, cached_result).
        is_new: True if this is the first execution.
        first_seen_at: Unix timestamp of the first execution.
        cached_result: Cached result data (or None).
    """
    now = str(time.time())

    result = await redis.eval(
        IDEMPOTENCY_CHECK_SCRIPT,
        1,  # number of keys
        key,
        str(ttl),
        now,
        execution_id,
    )

    is_new = int(result[0]) == 1
    first_seen_at = float(result[1])
    cached_result_str = result[2]

    cached_result = None
    if cached_result_str and cached_result_str != "null":
        try:
            cached_result = json.loads(cached_result_str)
        except (json.JSONDecodeError, TypeError):
            cached_result = None

    return is_new, first_seen_at, cached_result

async def _cache_result(
    self,
    redis: Redis,
    key: str,
    result_data: Any,
) -> None:
    """Update the idempotency record with the execution result.

    Args:
        redis: Redis connection.
        key: The idempotency Redis key.
        result_data: The result to cache.

    Raises:
        ValueError: If result data exceeds MAX_CACHED_RESULT_BYTES.
    """
    result_json = json.dumps(result_data, default=str)

    if len(result_json.encode("utf-8")) > self.MAX_CACHED_RESULT_BYTES:
        raise ValueError(
            f"Result data too large to cache "
            f"(max {self.MAX_CACHED_RESULT_BYTES} bytes)"
        )

    status = await redis.eval(
        IDEMPOTENCY_CACHE_RESULT_SCRIPT,
        1,  # number of keys
        key,
        result_json,
        str(self.MAX_CACHED_RESULT_BYTES),
    )

    if status == -1:
        raise ValueError("Result data too large (rejected by Redis)")
    elif status == 0:
        logger.warning(
            "idempotency_cache_miss",
            key=key,
            msg="Idempotency key expired before result could be cached",
        )
```

---

## Step 4: Node Registry Spec

Add to `_register_core_nodes()` in `python-backend/app/orchestrator/node_registry.py`, within the flow_control section (after the `rate_limiter` registration).

```python
# Idempotency (Deduplication)
self.register_node_type(
    NodeTypeSpec(
        type="idempotency",
        display_name="Idempotency",
        description="Prevent duplicate executions by fingerprinting requests and checking against Redis-backed deduplication store",
        icon="fingerprint",
        color="cyan",
        category="flow_control",
        inputs=[
            InputSpec(
                name="mode",
                display_name="Deduplication Mode",
                data_type="text",
                ui_type="select",
                required=True,
                accepts_connection=False,
                default="request_fingerprint",
                options=[
                    {
                        "label": "Request Fingerprint (hash input data)",
                        "value": "request_fingerprint",
                    },
                    {
                        "label": "Custom Key (user-provided)",
                        "value": "custom_key",
                    },
                    {
                        "label": "Time Window (deduplicate within window)",
                        "value": "time_window",
                    },
                ],
            ),
            InputSpec(
                name="idempotencyKey",
                display_name="Idempotency Key",
                data_type="text",
                ui_type="text",
                required=False,
                accepts_connection=True,
                placeholder="{{orderId}}-{{action}} (required for custom_key mode)",
            ),
            InputSpec(
                name="fingerprintFields",
                display_name="Fingerprint Fields",
                data_type="array",
                ui_type="json_editor",
                required=False,
                accepts_connection=False,
                default=[],
                placeholder='["orderId", "amount", "currency"] (empty = all fields)',
            ),
            InputSpec(
                name="ttl",
                display_name="TTL (seconds)",
                data_type="number",
                ui_type="number",
                required=False,
                accepts_connection=False,
                default=3600,
                validation={"min": 1, "max": 2592000},
                placeholder="How long to remember this execution (default: 1 hour)",
            ),
            InputSpec(
                name="onDuplicate",
                display_name="On Duplicate",
                data_type="text",
                ui_type="select",
                required=False,
                accepts_connection=False,
                default="skip",
                options=[
                    {"label": "Skip (continue with isDuplicate=true)", "value": "skip"},
                    {"label": "Return Cached Result", "value": "return_cached"},
                    {"label": "Throw Error", "value": "throw_error"},
                ],
            ),
            InputSpec(
                name="resultToCache",
                display_name="Result to Cache",
                data_type="any",
                ui_type="json_editor",
                required=False,
                accepts_connection=True,
                placeholder="Connect downstream result for caching (return_cached mode)",
            ),
        ],
        outputs=[
            OutputSpec(
                name="executed",
                display_name="Executed",
                data_type="boolean",
            ),
            OutputSpec(
                name="isDuplicate",
                display_name="Is Duplicate",
                data_type="boolean",
            ),
            OutputSpec(
                name="cachedResult",
                display_name="Cached Result",
                data_type="any",
            ),
            OutputSpec(
                name="firstSeenAt",
                display_name="First Seen At",
                data_type="number",
            ),
        ],
        executor="app.orchestrator.node_executors.flow_executors.idempotency_executor.IdempotencyExecutor",
    )
)
```

### Frontend Category Note

The node uses `category="flow_control"` which is already recognized by the frontend registry (`useNodeRegistry.ts` line 37). No frontend category changes needed.

---

## Step 5: `__init__.py` Update

Update `python-backend/app/orchestrator/node_executors/flow_executors/__init__.py`:

```python
"""Flow control node executors."""
from app.orchestrator.node_executors.flow_executors.idempotency_executor import (
    DuplicateExecutionError,
    IdempotencyExecutor,
)
from app.orchestrator.node_executors.flow_executors.rate_limiter_executor import (
    RateLimiterExecutor,
    RateLimitExceeded,
)
from app.orchestrator.node_executors.flow_executors.retry_executor import (
    RetryExecutor,
)
from app.orchestrator.node_executors.flow_executors.timeout_executor import (
    ExecutionTimeoutError,
    TimeoutExecutor,
)

__all__ = [
    "DuplicateExecutionError",
    "ExecutionTimeoutError",
    "IdempotencyExecutor",
    "RateLimiterExecutor",
    "RateLimitExceeded",
    "RetryExecutor",
    "TimeoutExecutor",
]
```

---

## Step 6: Redis Key Design

### Key Format

```
idempotency:{workflow_id}:{node_id}:{sha256_fingerprint}
```

**Examples:**
```
idempotency:wf-abc123:idem-node-1:a3f2b8c9d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1
```

### Key Value (JSON)

```json
{
    "executed_at": "1707436800.123",
    "execution_id": "exec-789",
    "result": null
}
```

After result caching:
```json
{
    "executed_at": "1707436800.123",
    "execution_id": "exec-789",
    "result": {"status": "ok", "orderId": "ORD-456", "amount": 99.99}
}
```

### TTL Strategy

| Configuration | TTL Value | Use Case |
|--------------|-----------|----------|
| Default | 3600s (1 hour) | Most API deduplication scenarios |
| Short-lived | 60-300s | Rapid retry scenarios, near-real-time dedup |
| Long-lived | 86400s (1 day) | Daily batch deduplication |
| Maximum | 2592000s (30 days) | Monthly billing deduplication |

The TTL applies to the Redis key. After expiry, the same fingerprint will be treated as a new execution.

For `time_window` mode, the TTL should match the window size. The implementation enforces `ttl >= window_size` to prevent the key from expiring before the window closes (which would allow duplicates within the window).

---

## Step 7: Testing Strategy

**File**: `python-backend/tests/test_idempotency_executor.py`

### 7.1 Unit Tests (mock Redis)

| # | Test | Description |
|---|------|-------------|
| 1 | `test_request_fingerprint_deterministic` | Same inputs produce the same hash every time |
| 2 | `test_request_fingerprint_different_data` | Different inputs produce different hashes |
| 3 | `test_request_fingerprint_field_selection` | `fingerprintFields=["a","b"]` only hashes those fields |
| 4 | `test_request_fingerprint_empty_fields_uses_all` | Empty `fingerprintFields` hashes all non-control inputs |
| 5 | `test_custom_key_with_expression` | `{{orderId}}-{{action}}` resolves from state |
| 6 | `test_custom_key_missing_raises` | Mode `custom_key` without `idempotencyKey` raises ValueError |
| 7 | `test_time_window_same_bucket` | Two calls within same window produce same fingerprint |
| 8 | `test_time_window_different_bucket` | Calls in different windows produce different fingerprints |
| 9 | `test_invalid_mode_raises` | Unknown mode raises ValueError |
| 10 | `test_invalid_on_duplicate_raises` | Unknown onDuplicate raises ValueError |
| 11 | `test_ttl_clamped_to_bounds` | TTL < 1 clamped to 1, TTL > 2592000 clamped to 2592000 |
| 12 | `test_fingerprint_fields_too_many_raises` | > 50 fields raises ValueError |
| 13 | `test_fingerprint_fields_from_csv_string` | `"a,b,c"` parsed as `["a","b","c"]` |
| 14 | `test_scope_includes_workflow_and_node_id` | Same data, different workflow/node -> different fingerprint |

### 7.2 Execution Flow Tests (mock Redis eval)

| # | Test | Description |
|---|------|-------------|
| 15 | `test_first_execution_returns_executed_true` | Lua returns is_new=1 -> `{executed: true, isDuplicate: false}` |
| 16 | `test_duplicate_skip_returns_executed_false` | Lua returns is_new=0, onDuplicate=skip -> `{executed: false, isDuplicate: true, cachedResult: None}` |
| 17 | `test_duplicate_return_cached_with_result` | Lua returns cached result -> `{cachedResult: {...}}` |
| 18 | `test_duplicate_return_cached_no_result` | Lua returns null result -> `{cachedResult: None}` |
| 19 | `test_duplicate_throw_error` | Lua returns is_new=0, onDuplicate=throw_error -> raises DuplicateExecutionError |
| 20 | `test_redis_connection_failure` | Redis unreachable -> raises ConnectionError |
| 21 | `test_redis_eval_error` | Redis error during eval -> raises ConnectionError |

### 7.3 Result Caching Tests

| # | Test | Description |
|---|------|-------------|
| 22 | `test_cache_result_on_first_execution` | `resultToCache` provided + is_new -> calls cache update |
| 23 | `test_no_cache_on_duplicate` | `resultToCache` provided + duplicate -> does NOT cache (already cached) |
| 24 | `test_cache_too_large_logs_warning` | Result > 1MB -> logged warning, execution continues |
| 25 | `test_cache_expired_key_logs_warning` | Key expired before caching -> logged warning |

### 7.4 Integration Tests (real Redis, `@pytest.mark.integration`)

| # | Test | Description |
|---|------|-------------|
| 26 | `test_e2e_first_then_duplicate` | Execute twice with same data: first -> executed=true, second -> isDuplicate=true |
| 27 | `test_e2e_different_data_both_execute` | Two different inputs: both -> executed=true |
| 28 | `test_e2e_ttl_expiry` | Set TTL=1s, execute, wait 2s, execute again -> executed=true (key expired) |
| 29 | `test_e2e_result_caching_roundtrip` | First execution caches result, duplicate retrieves it |
| 30 | `test_e2e_concurrent_same_fingerprint` | 10 async tasks with same fingerprint: exactly 1 should get executed=true |
| 31 | `test_e2e_custom_key_mode` | Custom key `order-123` deduplicates, `order-456` does not |
| 32 | `test_e2e_time_window_mode` | Same data, same window -> duplicate; different window -> new |
| 33 | `test_e2e_key_isolation` | Different workflow_id/node_id with same data -> independent keys |

### 7.5 Concurrency Test (Critical)

```python
@pytest.mark.integration
@pytest.mark.asyncio
async def test_concurrent_same_fingerprint_exactly_one_wins(real_redis):
    """
    Fire 20 concurrent requests with identical data.
    Verify EXACTLY 1 gets executed=true (the rest get isDuplicate=true).
    This validates Lua script atomicity for idempotency.
    """
    executor = IdempotencyExecutor()
    executor._redis = real_redis

    executed_count = 0
    duplicate_count = 0
    lock = asyncio.Lock()

    async def make_request(task_id: int):
        nonlocal executed_count, duplicate_count
        data = NodeExecutionData(
            node_id="idem-1",
            node_type="idempotency",
            config={},
            inputs={
                "mode": "request_fingerprint",
                "fingerprintFields": ["orderId", "amount"],
                "onDuplicate": "skip",
                "ttl": 60,
                "orderId": "ORD-999",
                "amount": 49.99,
            },
            state={},
        )
        ctx = ExecutionContext(
            user_id=1,
            tenant_id="test",
            workflow_id="wf-concurrent",
            execution_id=f"exec-{task_id}",
        )
        result = await executor.execute(data, ctx)
        async with lock:
            if result["executed"]:
                executed_count += 1
            else:
                duplicate_count += 1

    tasks = [asyncio.create_task(make_request(i)) for i in range(20)]
    await asyncio.gather(*tasks)

    assert executed_count == 1, f"Expected exactly 1 executed, got {executed_count}"
    assert duplicate_count == 19, f"Expected 19 duplicates, got {duplicate_count}"
```

### 7.6 Test Fixtures

```python
import asyncio
import json
import pytest
from unittest.mock import AsyncMock, MagicMock, patch

from redis.asyncio import Redis

from app.orchestrator.node_executors.base import ExecutionContext, NodeExecutionData
from app.orchestrator.node_executors.flow_executors.idempotency_executor import (
    DuplicateExecutionError,
    IdempotencyExecutor,
)


@pytest.fixture
def execution_context():
    return ExecutionContext(
        user_id=1,
        tenant_id="test-tenant",
        workflow_id="wf-idem-test",
        execution_id="exec-idem-001",
        credits_available=100,
    )


@pytest.fixture
def make_node_data():
    """Factory for creating NodeExecutionData with idempotency config."""
    def _make(
        mode="request_fingerprint",
        fingerprint_fields=None,
        idempotency_key="",
        ttl=3600,
        on_duplicate="skip",
        result_to_cache=None,
        extra_inputs=None,
    ):
        inputs = {
            "mode": mode,
            "fingerprintFields": fingerprint_fields or [],
            "idempotencyKey": idempotency_key,
            "ttl": ttl,
            "onDuplicate": on_duplicate,
        }
        if result_to_cache is not None:
            inputs["resultToCache"] = result_to_cache
        if extra_inputs:
            inputs.update(extra_inputs)

        return NodeExecutionData(
            node_id="idem-node-1",
            node_type="idempotency",
            config={},
            inputs=inputs,
            state={},
        )
    return _make


@pytest.fixture
async def real_redis():
    """Real Redis connection for integration tests."""
    redis = Redis.from_url("redis://localhost:6379/0", decode_responses=True)
    yield redis
    # Cleanup: delete all idempotency test keys
    keys = await redis.keys("idempotency:wf-idem-*")
    if keys:
        await redis.delete(*keys)
    keys = await redis.keys("idempotency:wf-concurrent*")
    if keys:
        await redis.delete(*keys)
    await redis.aclose()
```

---

## Step 8: Edge Cases and Error Handling

### 8.1 Non-JSON-Serializable Input Data

The `default=str` parameter in `json.dumps` handles datetime, UUID, bytes, and other non-serializable types by converting them to strings. This ensures fingerprinting never crashes, at the cost of slightly reduced precision (e.g., two different datetime objects with the same string representation would collide -- this is acceptable).

### 8.2 Nested Object Fingerprinting

`json.dumps(sort_keys=True)` recursively sorts keys in nested objects, so `{"a": {"z": 1, "a": 2}}` and `{"a": {"a": 2, "z": 1}}` produce the same hash. This is the desired behavior.

### 8.3 `None` vs Missing Fields

When `fingerprintFields=["a", "b"]` and input only has `"a"`:
- `inputs.get("b")` returns `None`
- The fingerprint includes `"b": null`
- This is distinct from not specifying `"b"` at all in `fingerprintFields`

This is intentional: if a user explicitly lists a field, its absence (None) should still be part of the fingerprint.

### 8.4 Redis Key Collision Between Workflows

Keys are scoped by `workflow_id` and `node_id`:
```
idempotency:{workflow_id}:{node_id}:{hash}
```

This means:
- Same data in different workflows -> different keys (no collision)
- Same data in different idempotency nodes within the same workflow -> different keys
- Same data in the same node, same workflow -> same key (intended deduplication)

### 8.5 Time Window Mode and TTL Interaction

For `time_window` mode, the TTL should be at least as long as the window size to prevent the key from expiring before the window closes. The implementation enforces this:

```python
if mode == "time_window":
    # In time_window mode, TTL serves as the window size
    # The actual Redis TTL should be 2x to account for clock drift
    redis_ttl = ttl * 2
```

However, for simplicity in the initial implementation, the TTL input serves dual purpose: it is both the window size (for bucketing) and the Redis key TTL. This is documented in the input placeholder.

---

## Implementation Order

| Step | Task | Files | Depends On |
|------|------|-------|------------|
| 1 | Create `idempotency_executor.py` with class skeleton and Lua scripts | `flow_executors/idempotency_executor.py` | -- |
| 2 | Implement fingerprint computation methods (3 modes) | Same file | Step 1 |
| 3 | Implement `_check_and_set` and `_cache_result` Redis operations | Same file | Step 1 |
| 4 | Implement `execute()` with full validation and flow logic | Same file | Steps 2-3 |
| 5 | Register `idempotency` node type in registry | `node_registry.py` | Step 1 |
| 6 | Update `flow_executors/__init__.py` with exports | `__init__.py` | Step 1 |
| 7 | Write unit tests (fingerprinting, validation, mocked Redis) | `tests/test_idempotency_executor.py` | Step 4 |
| 8 | Write integration tests (real Redis, concurrency) | Same test file | Step 4 |
| 9 | Run `pytest` to verify all tests pass | -- | Steps 7-8 |
| 10 | Run `black`, `ruff`, `mypy` for code quality | -- | Steps 1-8 |

---

## Verification Steps

After implementation:

1. `cd python-backend && pytest tests/test_idempotency_executor.py -v` -- All tests pass
2. `cd python-backend && pytest` -- No regressions in existing tests
3. `cd python-backend && black app/orchestrator/node_executors/flow_executors/idempotency_executor.py tests/test_idempotency_executor.py` -- Formatting OK
4. `cd python-backend && ruff check app/orchestrator/node_executors/flow_executors/idempotency_executor.py` -- No lint errors
5. `cd python-backend && mypy app/orchestrator/node_executors/flow_executors/idempotency_executor.py` -- Type check passes
6. Verify idempotency Redis keys are created with correct TTLs
7. Verify concurrency test passes (exactly 1 winner out of N concurrent requests)
8. Verify node appears in registry: `GET /api/v1/workflows/node-types` includes `idempotency`

---

## Usage Examples (for workflow authors)

### Example 1: Prevent Duplicate Payment Processing

```
[Webhook Trigger] --> [Idempotency] --> [Process Payment] --> [Send Receipt]
                        |
                        mode: custom_key
                        idempotencyKey: "payment-{{body.orderId}}"
                        ttl: 86400 (24 hours)
                        onDuplicate: return_cached
```

If the webhook is called twice with the same `orderId`, the second call returns the cached payment result without processing again.

### Example 2: Deduplicate Notification Sends

```
[Event Trigger] --> [Idempotency] --> [Conditional] --> [Send Email]
                        |                  |
                        mode: request_fingerprint
                        fingerprintFields: ["userId", "notificationType"]
                        ttl: 3600 (1 hour)
                        onDuplicate: skip
```

If the same user triggers the same notification type within an hour, the duplicate is skipped.

### Example 3: Daily Report Deduplication

```
[Schedule Trigger (every 15 min)] --> [Idempotency] --> [Generate Report] --> [Send to Slack]
                                        |
                                        mode: time_window
                                        fingerprintFields: ["reportType"]
                                        ttl: 86400 (24 hours = window size)
                                        onDuplicate: skip
```

Even if the schedule fires every 15 minutes, the report only generates once per 24-hour window.

---

## Comparison with Rate Limiter

| Feature | Rate Limiter | Idempotency |
|---------|-------------|-------------|
| Purpose | Throttle throughput | Prevent duplicate operations |
| Scope | Per time window, any request | Per unique request fingerprint |
| Redis data | Counter / sorted set | JSON record with result cache |
| Atomicity | Lua script for counter ops | Lua script for check-and-set |
| Result caching | No | Yes (optional) |
| Key format | `rate_limit:{key}:*` | `idempotency:{wf}:{node}:{hash}` |
| Typical TTL | Seconds to minutes | Minutes to days |
| Category | `flow_control` | `flow_control` |
