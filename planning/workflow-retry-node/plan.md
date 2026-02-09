# Retry Node Executor - Implementation Plan

## Problem Statement

Workflows that call external services (LLM APIs, webhooks, media generation) are inherently unreliable. Transient failures -- rate limits, network timeouts, 5xx errors -- require manual re-runs today. A dedicated **Retry** flow-control node wraps an upstream operation and automatically re-executes it using configurable backoff strategies, eliminating manual intervention for recoverable failures.

## Affected Files

| File | Action | Risk |
|------|--------|------|
| `python-backend/app/orchestrator/node_executors/flow_executors/retry_executor.py` | **CREATE** | Low -- new file, no existing code affected |
| `python-backend/app/orchestrator/node_registry.py` | **MODIFY** -- add `retry` NodeTypeSpec | Low -- append-only |
| `python-backend/tests/test_retry_executor.py` | **CREATE** | Low -- new test file |
| `python-backend/app/orchestrator/node_executors/flow_executors/__init__.py` | **MODIFY** -- add import | Low |

No database changes. No frontend changes required (frontend auto-discovers nodes from the registry API).

---

## 1. Backoff Calculation Logic

Three strategies, all capped by `maxDelay`:

### 1.1 Fixed Strategy

```
delay(attempt) = initialDelay
```

Every retry waits the same duration. Simple and predictable.

**Example** (initialDelay=2s, maxDelay=60s):
```
Attempt 1: execute immediately
Attempt 2: wait 2s
Attempt 3: wait 2s
Attempt 4: wait 2s
```

### 1.2 Exponential Strategy

```
delay(attempt) = min(initialDelay * (backoffMultiplier ^ (attempt - 2)), maxDelay)
```

The exponent is `attempt - 2` because attempt 1 executes immediately and attempt 2 uses `initialDelay` as the base delay (exponent 0 = multiplier of 1).

**Example** (initialDelay=1s, backoffMultiplier=2, maxDelay=60s):
```
Attempt 1: execute immediately
Attempt 2: wait min(1 * 2^0, 60) = 1s
Attempt 3: wait min(1 * 2^1, 60) = 2s
Attempt 4: wait min(1 * 2^2, 60) = 4s
Attempt 5: wait min(1 * 2^3, 60) = 8s
Attempt 6: wait min(1 * 2^4, 60) = 16s
Attempt 7: wait min(1 * 2^5, 60) = 32s
Attempt 8: wait min(1 * 2^6, 60) = 60s  (capped)
```

### 1.3 Linear Strategy

```
delay(attempt) = min(initialDelay * (attempt - 1), maxDelay)
```

Grows linearly. Gentle ramp-up for services that need gradual cool-down.

**Example** (initialDelay=2s, maxDelay=60s):
```
Attempt 1: execute immediately
Attempt 2: wait min(2 * 1, 60) = 2s
Attempt 3: wait min(2 * 2, 60) = 4s
Attempt 4: wait min(2 * 3, 60) = 6s
```

### 1.4 Implementation -- `_calculate_delay` Method

```python
def _calculate_delay(
    self,
    attempt: int,  # 1-indexed, delay is for the wait BEFORE this attempt
    strategy: str,
    initial_delay: float,
    max_delay: float,
    backoff_multiplier: float,
) -> float:
    """
    Calculate the delay in seconds before the given attempt.

    Attempt 1 always returns 0 (execute immediately).
    Attempt 2+ applies the chosen strategy.
    """
    if attempt <= 1:
        return 0.0

    if strategy == "fixed":
        raw_delay = initial_delay
    elif strategy == "exponential":
        raw_delay = initial_delay * (backoff_multiplier ** (attempt - 2))
    elif strategy == "linear":
        raw_delay = initial_delay * (attempt - 1)
    else:
        raise ValueError(f"Unknown retry strategy: {strategy}")

    return min(raw_delay, max_delay)
```

Key properties:
- Pure function -- easy to unit test in isolation.
- `attempt` is 1-indexed to match human-readable "Attempt 1, 2, 3...".
- `maxDelay` cap prevents unbounded waits even with aggressive multipliers.
- Returns `float` seconds for sub-second precision.

---

## 2. Error Type Matching Strategy

### 2.1 Error Classification

Upstream executors raise Python exceptions. The retry node catches them and classifies by type string for filtering.

```python
def _classify_error(self, error: Exception) -> str:
    """
    Classify an exception into a retry-filterable error type string.

    Returns a lowercase dot-separated identifier like:
    - "timeout" -- asyncio.TimeoutError, httpx.TimeoutException
    - "rate_limit" -- 429 responses, RateLimitError
    - "server_error" -- 5xx responses, InternalServerError
    - "connection" -- ConnectionError, ConnectError
    - "validation" -- ValueError, ValidationError
    - "unknown" -- anything else
    """
    error_type_name = type(error).__name__.lower()
    error_msg = str(error).lower()

    if "timeout" in error_type_name or "timeout" in error_msg:
        return "timeout"
    if "ratelimit" in error_type_name or "429" in error_msg or "rate" in error_msg:
        return "rate_limit"
    if "connection" in error_type_name:
        return "connection"
    if any(code in error_msg for code in ("500", "502", "503", "504")):
        return "server_error"
    if "validation" in error_type_name or isinstance(error, (ValueError, TypeError)):
        return "validation"
    return "unknown"
```

### 2.2 Filter Matching

The `retryOnErrors` configuration accepts an array of error type strings. The special value `"all"` (also the default) matches every error.

```python
def _should_retry(self, error: Exception, retry_on_errors: list[str]) -> bool:
    """
    Determine whether this error should trigger a retry.

    Args:
        error: The caught exception
        retry_on_errors: List of error type strings to retry on.
                        ["all"] means retry on any error.

    Returns:
        True if this error type is in the retry list
    """
    if not retry_on_errors or "all" in retry_on_errors:
        return True

    classified = self._classify_error(error)
    return classified in retry_on_errors
```

### 2.3 Design Rationale

- **String-based matching** rather than exception class matching. This is intentional because:
  - Upstream executors may raise different exception classes for semantically identical failures (e.g. `httpx.TimeoutException` vs `asyncio.TimeoutError`).
  - Users configure retry filters in the workflow UI as strings, not Python classes.
  - Easy to extend without modifying the retry executor -- just add cases to `_classify_error`.
- **"all" default** ensures the node retries everything unless the user explicitly restricts it. This is the safest default for transient failures.
- Non-retryable errors (e.g. `"validation"` excluded from the list) propagate immediately without wasting attempts.

---

## 3. Retry Loop Implementation

### 3.1 Core Execute Method

```python
async def execute(
    self,
    data: NodeExecutionData,
    context: ExecutionContext,
) -> dict[str, Any]:
    """
    Execute the retry node.

    The retry node wraps an upstream operation. It receives the operation's
    callable via `data.inputs["operation"]` (a dict with node_type and config),
    or alternatively retries the data flowing through `data.inputs["input"]`.

    The retry node does NOT execute other nodes directly. Instead, it receives
    input data, attempts to pass it through, and if the upstream operation
    (connected via the workflow graph) fails, the orchestrator re-invokes the
    upstream node. The retry node controls the TIMING and DECISION of retries.

    For self-contained retry behavior, the node accepts a callable via
    context.extra_data["retry_target_fn"] injected by the orchestrator.
    """
    config = data.config
    inputs = data.inputs

    # Extract configuration with defaults and validation
    max_attempts = self._validate_max_attempts(config.get("maxAttempts", 3))
    strategy = self._validate_strategy(config.get("strategy", "exponential"))
    initial_delay = max(0.1, float(config.get("initialDelay", 1)))
    max_delay = max(initial_delay, float(config.get("maxDelay", 60)))
    backoff_multiplier = max(1.0, float(config.get("backoffMultiplier", 2)))
    retry_on_errors = config.get("retryOnErrors", ["all"])
    stop_on_success = config.get("stopOnSuccess", True)

    # The operation to retry. Injected by the orchestrator as a callable.
    # Falls back to a passthrough that returns the input data.
    retry_target = context.extra_data.get("retry_target_fn")

    # Track retry metrics
    total_delay_ms = 0.0
    last_error: dict[str, Any] | None = None
    attempt = 0

    for attempt in range(1, max_attempts + 1):
        # Calculate and apply delay
        delay_seconds = self._calculate_delay(
            attempt, strategy, initial_delay, max_delay, backoff_multiplier
        )

        if delay_seconds > 0:
            logger.info(
                "retry_waiting",
                node_id=data.node_id,
                execution_id=context.execution_id,
                attempt=attempt,
                delay_seconds=round(delay_seconds, 2),
                strategy=strategy,
            )
            await asyncio.sleep(delay_seconds)
            total_delay_ms += delay_seconds * 1000

        # Attempt execution
        try:
            logger.info(
                "retry_attempt",
                node_id=data.node_id,
                execution_id=context.execution_id,
                attempt=attempt,
                max_attempts=max_attempts,
            )

            if retry_target is not None:
                result = await retry_target(data, context)
            else:
                # Passthrough mode: the input data IS the result.
                # The orchestrator uses this when the retry node wraps
                # an edge rather than a callable.
                input_data = inputs.get("input")
                if input_data is None:
                    raise ValueError("No input data or retry target function provided")
                result = {"output": input_data}

            # Success
            if stop_on_success:
                logger.info(
                    "retry_succeeded",
                    node_id=data.node_id,
                    execution_id=context.execution_id,
                    attempt=attempt,
                    total_delay_ms=round(total_delay_ms, 2),
                )
                return {
                    "output": result.get("output", result) if isinstance(result, dict) else result,
                    "attemptNumber": attempt,
                    "totalRetries": attempt - 1,
                    "totalDelay": round(total_delay_ms, 2),
                    "lastError": None,
                    "succeeded": True,
                }

        except Exception as exc:
            error_type = self._classify_error(exc)
            last_error = {
                "type": error_type,
                "message": str(exc),
                "attempt": attempt,
                "exceptionClass": type(exc).__name__,
            }

            logger.warning(
                "retry_attempt_failed",
                node_id=data.node_id,
                execution_id=context.execution_id,
                attempt=attempt,
                max_attempts=max_attempts,
                error_type=error_type,
                error_message=str(exc),
            )

            # Check if this error type should trigger a retry
            if not self._should_retry(exc, retry_on_errors):
                logger.info(
                    "retry_skipped_non_retryable",
                    node_id=data.node_id,
                    error_type=error_type,
                    retry_on_errors=retry_on_errors,
                )
                break

            # If this was the last attempt, don't wait
            if attempt == max_attempts:
                break

    # All attempts exhausted or non-retryable error
    logger.error(
        "retry_exhausted",
        node_id=data.node_id,
        execution_id=context.execution_id,
        total_attempts=attempt,
        total_delay_ms=round(total_delay_ms, 2),
        last_error=last_error,
    )

    return {
        "output": None,
        "attemptNumber": attempt,
        "totalRetries": attempt - 1,
        "totalDelay": round(total_delay_ms, 2),
        "lastError": last_error,
        "succeeded": False,
    }
```

### 3.2 Validation Helpers

```python
def _validate_max_attempts(self, value: Any) -> int:
    """Validate and clamp maxAttempts to [1, 10]."""
    try:
        n = int(value)
    except (TypeError, ValueError):
        return 3  # default
    return max(1, min(n, 10))

def _validate_strategy(self, value: Any) -> str:
    """Validate strategy is one of the known values."""
    valid = {"fixed", "exponential", "linear"}
    if value in valid:
        return value
    raise ValueError(
        f"Invalid retry strategy '{value}'. Must be one of: {', '.join(sorted(valid))}"
    )
```

### 3.3 Key Design Decisions

1. **Attempt 1 has zero delay.** The first execution is immediate. Backoff only begins on attempt 2.

2. **maxAttempts=1 means no retries.** The node executes once. If it fails, it returns `succeeded=False` with `lastError`. This is consistent: `totalRetries = attemptNumber - 1`.

3. **`stopOnSuccess=True` by default.** When true, the loop exits on the first successful attempt. When false, the node continues executing all attempts regardless of success (useful for "run N times" scenarios, though unusual for a retry pattern).

4. **Non-retryable errors break immediately.** If `retryOnErrors` is `["timeout", "rate_limit"]` and a `ValidationError` occurs, the node stops without consuming remaining attempts.

5. **Always returns output ports, never raises.** The retry node absorbs exceptions and exposes them via `lastError` and `succeeded=False`. Downstream nodes can branch on `succeeded` using a conditional node.

---

## 4. Integration with Upstream Node Execution

### 4.1 How the Retry Node Fits in the Workflow Graph

The retry node operates in one of two modes:

#### Mode A: Orchestrator-Injected Callable (Preferred)

The LangGraph orchestrator recognizes when a retry node wraps another node. It injects the target node's executor as a callable into `context.extra_data["retry_target_fn"]`:

```
[LLM Call] --edge--> [Retry Node] --edge--> [Next Node]
                          |
                    orchestrator injects:
                    retry_target_fn = llm_executor.execute
```

The retry node calls `retry_target_fn(data, context)` within its loop. The orchestrator passes the upstream node's resolved inputs through `data.inputs["input"]`.

#### Mode B: Passthrough with Error Propagation (Fallback)

If no `retry_target_fn` is injected, the retry node acts as a passthrough:
- On success: returns `data.inputs["input"]` as `output`.
- On failure: the upstream node must have raised, and the orchestrator re-invokes the retry node with the error in `context.extra_data["last_error"]`.

This mode is simpler but requires the orchestrator to handle re-invocation.

### 4.2 Orchestrator Integration Points

The orchestrator (`app/orchestrator/`) needs these minimal changes (documented here for the implementer, not part of this PR):

1. **Node type detection**: When compiling the workflow graph, detect `retry` nodes and identify their upstream target.
2. **Callable injection**: Wrap the upstream executor's `execute()` method and inject it as `retry_target_fn`.
3. **Error propagation**: If the retry node returns `succeeded=False`, the orchestrator should treat it as a node failure for downstream routing.

These orchestrator changes are a separate task. The retry executor itself is self-contained and testable without them (via direct injection in tests).

---

## 5. Registry Spec

### 5.1 NodeTypeSpec Registration

Add to `_register_core_nodes()` in `node_registry.py`, in the "PHASE 2.4: Advanced Flow Control" section (after the Wait node at line ~1031):

```python
# Retry
self.register_node_type(
    NodeTypeSpec(
        type="retry",
        display_name="Retry",
        description="Automatically retry a failed operation with configurable backoff strategy",
        icon="refresh-cw",
        color="yellow",
        category="flow_control",
        inputs=[
            InputSpec(
                name="input",
                display_name="Input Data",
                data_type="any",
                ui_type="json_editor",
                required=False,
                accepts_connection=True,
                placeholder="Data to pass to the retried operation...",
            ),
            InputSpec(
                name="maxAttempts",
                display_name="Max Attempts",
                data_type="number",
                ui_type="number",
                required=False,
                accepts_connection=False,
                default=3,
                validation={"min": 1, "max": 10},
            ),
            InputSpec(
                name="strategy",
                display_name="Backoff Strategy",
                data_type="text",
                ui_type="select",
                required=False,
                accepts_connection=False,
                default="exponential",
                options=[
                    {"label": "Fixed Delay", "value": "fixed"},
                    {"label": "Exponential Backoff", "value": "exponential"},
                    {"label": "Linear Increase", "value": "linear"},
                ],
            ),
            InputSpec(
                name="initialDelay",
                display_name="Initial Delay (seconds)",
                data_type="number",
                ui_type="number",
                required=False,
                accepts_connection=False,
                default=1,
                validation={"min": 0.1, "max": 300},
            ),
            InputSpec(
                name="maxDelay",
                display_name="Max Delay (seconds)",
                data_type="number",
                ui_type="number",
                required=False,
                accepts_connection=False,
                default=60,
                validation={"min": 1, "max": 600},
            ),
            InputSpec(
                name="backoffMultiplier",
                display_name="Backoff Multiplier",
                data_type="number",
                ui_type="number",
                required=False,
                accepts_connection=False,
                default=2,
                validation={"min": 1, "max": 10},
            ),
            InputSpec(
                name="retryOnErrors",
                display_name="Retry On Error Types",
                data_type="array",
                ui_type="multiselect",
                required=False,
                accepts_connection=False,
                default=["all"],
                options=[
                    {"label": "All Errors", "value": "all"},
                    {"label": "Timeout", "value": "timeout"},
                    {"label": "Rate Limit", "value": "rate_limit"},
                    {"label": "Server Error (5xx)", "value": "server_error"},
                    {"label": "Connection Error", "value": "connection"},
                ],
            ),
            InputSpec(
                name="stopOnSuccess",
                display_name="Stop on Success",
                data_type="boolean",
                ui_type="toggle",
                required=False,
                accepts_connection=False,
                default=True,
            ),
        ],
        outputs=[
            OutputSpec(name="output", display_name="Result", data_type="any"),
            OutputSpec(name="attemptNumber", display_name="Final Attempt", data_type="number"),
            OutputSpec(name="totalRetries", display_name="Total Retries", data_type="number"),
            OutputSpec(name="totalDelay", display_name="Total Delay (ms)", data_type="number"),
            OutputSpec(name="lastError", display_name="Last Error", data_type="json"),
            OutputSpec(name="succeeded", display_name="Succeeded", data_type="boolean"),
        ],
        executor="app.orchestrator.node_executors.flow_executors.retry_executor.RetryExecutor",
    )
)
```

### 5.2 Config vs. Input Design

Configuration fields (`maxAttempts`, `strategy`, `initialDelay`, etc.) are specified as **inputs** with `accepts_connection=False`. This follows the existing pattern in the codebase (see: Wait node duration/unit, Switch node cases). The executor reads them from `data.config` for static values, but they are presented as inputs in the UI for consistency.

**Note on config resolution**: The executor reads retry parameters from `data.config` (set at design time in the UI), while `data.inputs["input"]` carries the runtime data flowing through the workflow. The parameters `maxAttempts`, `strategy`, etc. should be read from `data.config` in the executor, but the registry defines them as `InputSpec` for UI rendering. The orchestrator populates `data.config` from non-connected input specs.

---

## 6. Logging Strategy for Observability

### 6.1 Structured Log Events

All logs use `structlog` with machine-parseable key-value pairs. Each log event includes `node_id` and `execution_id` for correlation.

| Event | Level | When | Key Fields |
|-------|-------|------|------------|
| `retry_attempt` | INFO | Before each attempt | `attempt`, `max_attempts` |
| `retry_waiting` | INFO | Before each sleep | `attempt`, `delay_seconds`, `strategy` |
| `retry_attempt_failed` | WARNING | After failed attempt | `attempt`, `error_type`, `error_message` |
| `retry_skipped_non_retryable` | INFO | Error not in retry list | `error_type`, `retry_on_errors` |
| `retry_succeeded` | INFO | First successful attempt | `attempt`, `total_delay_ms` |
| `retry_exhausted` | ERROR | All attempts failed | `total_attempts`, `total_delay_ms`, `last_error` |

### 6.2 Log Correlation

Every log includes:
- `node_id`: Identifies which retry node in the workflow graph
- `execution_id`: Correlates with the workflow execution trace
- `attempt`: Which attempt number (1-indexed)

This enables queries like:
```bash
# Find all retry exhaustions in the last hour
grep '"retry_exhausted"' python-backend/logs/*.log | jq '.execution_id'

# Trace a specific workflow's retry behavior
grep '"execution_id":"exec-123"' python-backend/logs/*.log | grep '"retry_'
```

### 6.3 Metrics Exposure

The output ports provide all observability data downstream:
- `attemptNumber`: Final attempt that ran (1 = first try succeeded, >1 = retries were needed)
- `totalRetries`: `attemptNumber - 1` (explicit for dashboards)
- `totalDelay`: Cumulative sleep time in milliseconds
- `succeeded`: Boolean for conditional routing
- `lastError`: Full error context for debugging

A downstream workflow node (or the workflow response) can log, alert, or route based on these values.

---

## 7. Test Plan

### 7.1 Unit Tests (`test_retry_executor.py`)

#### Backoff Calculation Tests
- [ ] `test_fixed_strategy_constant_delay` -- All delays equal `initialDelay`
- [ ] `test_exponential_strategy_doubles` -- Delays follow `initialDelay * multiplier^n`
- [ ] `test_linear_strategy_increments` -- Delays follow `initialDelay * attempt`
- [ ] `test_max_delay_caps_all_strategies` -- No delay exceeds `maxDelay`
- [ ] `test_attempt_1_always_zero_delay` -- First attempt has zero delay
- [ ] `test_custom_backoff_multiplier` -- Non-default multiplier (e.g. 3)
- [ ] `test_invalid_strategy_raises_valueerror` -- Unknown strategy name

#### Error Classification Tests
- [ ] `test_classify_timeout_error` -- `asyncio.TimeoutError` -> `"timeout"`
- [ ] `test_classify_rate_limit_error` -- Exception with "429" in message -> `"rate_limit"`
- [ ] `test_classify_connection_error` -- `ConnectionError` -> `"connection"`
- [ ] `test_classify_server_error` -- Exception with "503" in message -> `"server_error"`
- [ ] `test_classify_validation_error` -- `ValueError` -> `"validation"`
- [ ] `test_classify_unknown_error` -- `RuntimeError("custom")` -> `"unknown"`

#### Error Filter Tests
- [ ] `test_should_retry_all_matches_everything` -- `["all"]` retries any error
- [ ] `test_should_retry_specific_types` -- `["timeout"]` only retries timeouts
- [ ] `test_should_not_retry_excluded_type` -- `["timeout"]` does not retry validation errors
- [ ] `test_should_retry_empty_list_defaults_to_all` -- `[]` treated as `["all"]`

#### Retry Loop Tests
- [ ] `test_success_on_first_attempt` -- Returns immediately, `totalRetries=0`
- [ ] `test_success_on_third_attempt` -- Fails twice, succeeds on third
- [ ] `test_all_attempts_exhausted` -- All fail, returns `succeeded=False`
- [ ] `test_max_attempts_1_no_retry` -- Single attempt, no retry on failure
- [ ] `test_non_retryable_error_stops_early` -- Stops before exhausting attempts
- [ ] `test_stop_on_success_false_continues` -- Runs all attempts even after success
- [ ] `test_total_delay_accumulates` -- `totalDelay` sums all sleep durations
- [ ] `test_output_includes_all_ports` -- All 6 output ports present in result

#### Validation Tests
- [ ] `test_max_attempts_clamped_to_10` -- `maxAttempts=99` becomes 10
- [ ] `test_max_attempts_clamped_to_1` -- `maxAttempts=0` becomes 1
- [ ] `test_initial_delay_minimum_0_1` -- `initialDelay=0` becomes 0.1
- [ ] `test_max_delay_at_least_initial_delay` -- `maxDelay < initialDelay` corrected

#### Integration Tests
- [ ] `test_with_injected_callable` -- Callable via `context.extra_data["retry_target_fn"]`
- [ ] `test_passthrough_mode_with_input` -- No callable, passes input through

### 7.2 Test Approach

- Mock `asyncio.sleep` to avoid real delays in tests.
- Use `pytest.mark.asyncio` (auto mode is configured in `pyproject.toml`).
- Target: >95% branch coverage for the retry executor.

---

## 8. Implementation Steps

### Step 1: Create `retry_executor.py`

**File**: `python-backend/app/orchestrator/node_executors/flow_executors/retry_executor.py`

Create the `RetryExecutor` class with:
- `execute()` method (main retry loop)
- `_calculate_delay()` (backoff math)
- `_classify_error()` (error classification)
- `_should_retry()` (error filter matching)
- `_validate_max_attempts()` (input validation)
- `_validate_strategy()` (input validation)

### Step 2: Register in Node Registry

**File**: `python-backend/app/orchestrator/node_registry.py`

Add the `retry` NodeTypeSpec in the "PHASE 2.4: Advanced Flow Control" section, after the Wait node registration (around line 1031).

### Step 3: Update `__init__.py`

**File**: `python-backend/app/orchestrator/node_executors/flow_executors/__init__.py`

Add: `from .retry_executor import RetryExecutor`

### Step 4: Write Tests

**File**: `python-backend/tests/test_retry_executor.py`

Implement all test cases from section 7.1.

### Step 5: Verify

```bash
cd python-backend
pytest tests/test_retry_executor.py -v
ruff check app/orchestrator/node_executors/flow_executors/retry_executor.py
black --check app/orchestrator/node_executors/flow_executors/retry_executor.py
```

---

## 9. Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|-----------|
| Unbounded sleep duration | Worker blocked for minutes | `maxDelay` cap (600s hard limit), `maxAttempts` cap (10) |
| Memory leak from error accumulation | OOM on long-running workflows | Only store `lastError` (most recent), not all errors |
| Celery task timeout during retries | Task killed mid-retry | Total max retry time: 10 attempts * 600s = 100 min. Celery soft_time_limit should be set accordingly. Document this. |
| `asyncio.sleep` blocks the event loop thread | Reduced concurrency | `asyncio.sleep` is non-blocking (yields to event loop). This is correct for async executors. |
| Race condition if same node retried concurrently | Duplicate executions | Each workflow execution has its own `ExecutionContext`. No shared state. |

---

## 10. Future Enhancements (Out of Scope)

- **Jitter**: Add random jitter to exponential backoff to prevent thundering herd. (`delay * (0.5 + random() * 0.5)`)
- **Circuit breaker integration**: If N consecutive executions of the same retry node fail, disable the workflow.
- **Retry budget**: Global rate limit on retries per workflow to prevent resource exhaustion.
- **Persistent retry state**: Store retry state in Redis so retries survive worker restarts.
- **Custom error classifiers**: Allow users to define regex patterns for error matching.
