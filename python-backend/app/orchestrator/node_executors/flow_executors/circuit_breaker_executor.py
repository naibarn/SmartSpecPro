"""Circuit Breaker Executor - Distributed circuit breaking using Redis.

Implements the circuit breaker pattern with three states:
- closed: Normal operation, requests pass through. Failures are counted.
- open: Fail-fast mode. Returns fallback value or raises CircuitBreakerOpenError.
- half_open: Probe mode. Limited requests allowed to test recovery.

State transitions:
  CLOSED  -> (failures >= threshold)     -> OPEN
  OPEN    -> (timeout elapsed)           -> HALF_OPEN
  HALF_OPEN -> (successes >= threshold)  -> CLOSED
  HALF_OPEN -> (any failure)             -> OPEN

All state transitions use Lua scripts for atomic Redis operations.
Fail-closed: Redis errors raise exceptions rather than silently allowing requests.
"""
import re
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


class CircuitBreakerOpenError(Exception):
    """Raised when circuit is open and no fallback is configured."""

    def __init__(self, circuit_name: str, failure_count: int, last_failure_time: float):
        self.circuit_name = circuit_name
        self.failure_count = failure_count
        self.last_failure_time = last_failure_time
        super().__init__(
            f"Circuit '{circuit_name}' is OPEN (failures={failure_count}). "
            f"No fallback configured. Last failure at {last_failure_time}"
        )


# ---------------------------------------------------------------------------
# Lua Scripts - executed atomically inside Redis
# ---------------------------------------------------------------------------

CIRCUIT_BREAKER_CHECK_SCRIPT = """\
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
"""

CIRCUIT_BREAKER_RECORD_SCRIPT = """\
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
"""

# Pattern for validating circuit names (alphanumeric, underscores, hyphens, dots)
CIRCUIT_NAME_PATTERN = re.compile(r"^[a-zA-Z0-9_\-\.]+$")


class CircuitBreakerExecutor:
    """Executor for circuit_breaker nodes using Redis-based distributed state.

    Implements the circuit breaker pattern to protect workflows from cascading
    failures when downstream services are unhealthy. Circuit state is shared
    across all workflow executions via Redis.

    Fail-closed: any Redis error raises an exception rather than silently allowing.
    """

    # Safety caps
    MAX_TIMEOUT_SECONDS = 3600  # 1 hour max open duration
    MAX_FAILURE_THRESHOLD = 100
    MAX_SUCCESS_THRESHOLD = 50
    MAX_CIRCUIT_NAME_LENGTH = 128

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
            # Verify connectivity -- fail-closed on unreachable Redis
            try:
                await self._redis.ping()
            except (RedisConnectionError, RedisTimeoutError, OSError) as e:
                self._redis = None
                raise ConnectionError(
                    f"Cannot connect to Redis at {redis_url} for circuit breaker: {e}"
                ) from e
        return self._redis

    # ------------------------------------------------------------------
    # Main execute entry point
    # ------------------------------------------------------------------

    async def execute(
        self,
        data: NodeExecutionData,
        context: ExecutionContext,
    ) -> dict[str, Any]:
        """Execute circuit breaker logic.

        1. Extract and validate configuration.
        2. Resolve circuitName expressions.
        3. Connect to Redis (fail-closed).
        4. Run CHECK script to determine if request is allowed.
        5. If rejected (open): return fallback or raise CircuitBreakerOpenError.
        6. If allowed (closed/half_open): evaluate upstream result.
        7. Run RECORD script to update state based on outcome.
        8. Return output dict.

        Args:
            data: Node execution data with config and inputs.
            context: Execution context (user, workflow, execution IDs).

        Returns:
            dict with result, circuitState, failureCount, lastFailureTime.

        Raises:
            ValueError: On invalid configuration (bad circuit name or thresholds).
            ConnectionError: If Redis is unreachable (fail-closed).
            CircuitBreakerOpenError: If circuit is open and no fallback configured.
        """
        config = data.config
        inputs = data.inputs

        # --- Extract and validate configuration ---
        raw_circuit_name = inputs.get("circuitName", config.get("circuitName", "default"))
        circuit_name = self._expression_resolver.resolve(str(raw_circuit_name), data.state)

        # Validate circuit name format
        if not circuit_name or not CIRCUIT_NAME_PATTERN.match(circuit_name):
            raise ValueError(
                f"Invalid circuit name '{circuit_name}'. "
                f"Must match pattern: alphanumeric, underscores, hyphens, dots. "
                f"Max length: {self.MAX_CIRCUIT_NAME_LENGTH}."
            )
        if len(circuit_name) > self.MAX_CIRCUIT_NAME_LENGTH:
            raise ValueError(
                f"Circuit name too long ({len(circuit_name)} chars, "
                f"max {self.MAX_CIRCUIT_NAME_LENGTH})."
            )

        failure_threshold = int(
            inputs.get("failureThreshold", config.get("failureThreshold", 5))
        )
        success_threshold = int(
            inputs.get("successThreshold", config.get("successThreshold", 2))
        )
        timeout = int(inputs.get("timeout", config.get("timeout", 60)))
        fallback_value = inputs.get("fallbackValue", config.get("fallbackValue", None))

        # Clamp thresholds to valid range with warning
        if failure_threshold < 1 or failure_threshold > self.MAX_FAILURE_THRESHOLD:
            clamped = max(1, min(failure_threshold, self.MAX_FAILURE_THRESHOLD))
            logger.warning(
                "circuit_breaker_threshold_clamped",
                param="failureThreshold",
                original=failure_threshold,
                clamped=clamped,
                node_id=data.node_id,
            )
            failure_threshold = clamped

        if success_threshold < 1 or success_threshold > self.MAX_SUCCESS_THRESHOLD:
            clamped = max(1, min(success_threshold, self.MAX_SUCCESS_THRESHOLD))
            logger.warning(
                "circuit_breaker_threshold_clamped",
                param="successThreshold",
                original=success_threshold,
                clamped=clamped,
                node_id=data.node_id,
            )
            success_threshold = clamped

        if timeout < 1 or timeout > self.MAX_TIMEOUT_SECONDS:
            clamped = max(1, min(timeout, self.MAX_TIMEOUT_SECONDS))
            logger.warning(
                "circuit_breaker_threshold_clamped",
                param="timeout",
                original=timeout,
                clamped=clamped,
                node_id=data.node_id,
            )
            timeout = clamped

        ttl = timeout * 3  # Keys expire at 3x timeout for cleanup

        # --- Get Redis connection (fail-closed) ---
        try:
            redis = await self._get_redis()
        except ConnectionError:
            raise
        except (RedisError, OSError) as e:
            raise ConnectionError(f"Redis error during circuit breaker check: {e}") from e

        # --- Step 4: Run CHECK script (pre-execution) ---
        try:
            check_result = await self._check_circuit(redis, circuit_name, timeout, ttl)
        except (RedisError, OSError) as e:
            raise ConnectionError(f"Redis error during circuit breaker check: {e}") from e

        allowed = check_result["allowed"]
        current_state = check_result["state"]

        # --- Step 5: If rejected (circuit is open) ---
        if not allowed:
            logger.info(
                "circuit_breaker_rejected",
                node_id=data.node_id,
                circuit_name=circuit_name,
                state=current_state,
                has_fallback=fallback_value is not None,
            )
            if fallback_value is not None:
                return {
                    "result": fallback_value,
                    "circuitState": "open",
                    "failureCount": 0,
                    "lastFailureTime": 0,
                }
            raise CircuitBreakerOpenError(
                circuit_name=circuit_name,
                failure_count=0,
                last_failure_time=0,
            )

        # --- Step 6: Evaluate upstream result ---
        outcome = "success"
        upstream_result = None
        upstream_error: Exception | None = None

        circuit_target_fn = context.extra_data.get("circuit_target_fn")
        if circuit_target_fn is not None and callable(circuit_target_fn):
            try:
                upstream_result = await circuit_target_fn()
            except Exception as e:
                outcome = "failure"
                upstream_error = e
        else:
            # Passthrough mode: evaluate success/failure from input data
            upstream_result = inputs.get("input")
            if isinstance(upstream_result, dict):
                if upstream_result.get("error") is not None:
                    outcome = "failure"
                elif upstream_result.get("succeeded") is False:
                    outcome = "failure"

        # --- Step 7: Run RECORD script (post-execution) ---
        try:
            record_result = await self._record_outcome(
                redis=redis,
                circuit_name=circuit_name,
                outcome=outcome,
                failure_threshold=failure_threshold,
                success_threshold=success_threshold,
                ttl=ttl,
            )
        except (RedisError, OSError) as e:
            raise ConnectionError(f"Redis error during circuit breaker record: {e}") from e

        new_state = record_result["state"]
        failure_count = record_result["failures"]
        last_failure_time = record_result["last_failure_time"]

        logger.info(
            "circuit_breaker_executed",
            node_id=data.node_id,
            circuit_name=circuit_name,
            outcome=outcome,
            previous_state=current_state,
            new_state=new_state,
            failure_count=failure_count,
        )

        # If upstream failed, propagate the error after recording
        if upstream_error is not None:
            raise upstream_error

        # --- Step 8: Return output ---
        return {
            "result": upstream_result,
            "circuitState": new_state,
            "failureCount": failure_count,
            "lastFailureTime": last_failure_time,
        }

    # ------------------------------------------------------------------
    # Lua script wrappers
    # ------------------------------------------------------------------

    async def _check_circuit(
        self,
        redis: Redis,
        circuit_name: str,
        timeout: int,
        ttl: int,
    ) -> dict[str, Any]:
        """Run the CHECK Lua script to determine if a request is allowed.

        Args:
            redis: Async Redis connection.
            circuit_name: Resolved circuit name.
            timeout: Seconds before open circuit transitions to half_open.
            ttl: Key expiry in seconds.

        Returns:
            dict with 'allowed' (bool) and 'state' (str).
        """
        state_key = f"circuit:{circuit_name}:state"
        opened_at_key = f"circuit:{circuit_name}:opened_at"
        successes_key = f"circuit:{circuit_name}:successes"
        now = time.time()

        result = await redis.eval(
            CIRCUIT_BREAKER_CHECK_SCRIPT,
            3,  # number of keys
            state_key,
            opened_at_key,
            successes_key,
            str(now),
            str(timeout),
            str(ttl),
        )

        return {
            "allowed": int(result[0]) == 1,
            "state": result[1],
        }

    async def _record_outcome(
        self,
        redis: Redis,
        circuit_name: str,
        outcome: str,
        failure_threshold: int,
        success_threshold: int,
        ttl: int,
    ) -> dict[str, Any]:
        """Run the RECORD Lua script to record success/failure and perform state transitions.

        Args:
            redis: Async Redis connection.
            circuit_name: Resolved circuit name.
            outcome: "success" or "failure".
            failure_threshold: Number of failures before opening circuit.
            success_threshold: Number of successes in half_open before closing.
            ttl: Key expiry in seconds.

        Returns:
            dict with 'state', 'failures', 'successes', 'last_failure_time'.
        """
        state_key = f"circuit:{circuit_name}:state"
        failures_key = f"circuit:{circuit_name}:failures"
        successes_key = f"circuit:{circuit_name}:successes"
        opened_at_key = f"circuit:{circuit_name}:opened_at"
        last_failure_key = f"circuit:{circuit_name}:last_failure_time"
        now = time.time()

        result = await redis.eval(
            CIRCUIT_BREAKER_RECORD_SCRIPT,
            5,  # number of keys
            state_key,
            failures_key,
            successes_key,
            opened_at_key,
            last_failure_key,
            outcome,
            str(now),
            str(failure_threshold),
            str(success_threshold),
            str(ttl),
        )

        return {
            "state": result[0],
            "failures": int(result[1]),
            "successes": int(result[2]),
            "last_failure_time": float(result[3]),
        }
