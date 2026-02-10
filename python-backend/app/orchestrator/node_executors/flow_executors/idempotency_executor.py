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


# ---------------------------------------------------------------------------
# Lua Scripts - executed atomically inside Redis
# ---------------------------------------------------------------------------

IDEMPOTENCY_CHECK_SCRIPT = """\
-- Idempotency Check-and-Set
-- KEYS[1] = idempotency:{workflow_id}:{node_id}:{hash}
-- ARGV[1] = ttl (seconds)
-- ARGV[2] = now (unix timestamp from caller)
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
"""

IDEMPOTENCY_CACHE_RESULT_SCRIPT = """\
-- Idempotency Result Cache Update
-- KEYS[1] = idempotency:{workflow_id}:{node_id}:{hash}
-- ARGV[1] = result_json (serialized result data)
-- ARGV[2] = max_result_size (bytes, for safety cap)
--
-- Returns: 1 if updated, 0 if key not found (expired), -1 if too large

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
"""


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

    # Input fields that are configuration, not request data
    _CONTROL_FIELDS = frozenset({
        "onDuplicate",
        "ttl",
        "fingerprintFields",
        "idempotencyKey",
        "mode",
        "resultToCache",
    })

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

    # ------------------------------------------------------------------
    # Main execute entry point
    # ------------------------------------------------------------------

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

    # ------------------------------------------------------------------
    # Fingerprint Computation
    # ------------------------------------------------------------------

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
                raise ValueError("idempotencyKey is required when mode is 'custom_key'")
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
        """SHA-256 hash of selected input fields.

        Args:
            inputs: Node input data (resolved values from upstream nodes).
            fingerprint_fields: List of field names to include in the hash.
                If empty, ALL input fields are included (excluding control fields).
            workflow_id: Workflow ID for scoping.
            node_id: Node ID for scoping.

        Returns:
            Hex-encoded SHA-256 hash string.
        """
        if fingerprint_fields:
            data = {k: inputs.get(k) for k in sorted(fingerprint_fields)}
        else:
            data = {k: v for k, v in sorted(inputs.items()) if k not in self._CONTROL_FIELDS}

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
        """SHA-256 hash of resolved custom key.

        The key is resolved through ExpressionResolver to support
        dynamic values like {{orderId}} or {{userId}}-{{action}}.

        Returns:
            SHA-256 hash of the resolved key + scope.
        """
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
        """SHA-256 hash scoped to a time window.

        The time window bucket is floor(now / window_size) * window_size,
        so all requests within the same window produce the same hash.

        Args:
            inputs: Node input data.
            fingerprint_fields: Fields to include in hash.
            workflow_id: Workflow ID for scoping.
            node_id: Node ID for scoping.
            window_size_seconds: Duration of each deduplication window.

        Returns:
            SHA-256 hash including the window bucket.
        """
        now = time.time()
        window_bucket = int(now // window_size_seconds) * window_size_seconds

        if fingerprint_fields:
            data = {k: inputs.get(k) for k in sorted(fingerprint_fields)}
        else:
            data = {k: v for k, v in sorted(inputs.items()) if k not in self._CONTROL_FIELDS}

        payload = {
            "workflow_id": workflow_id,
            "node_id": node_id,
            "data": data,
            "window_bucket": window_bucket,
        }
        serialized = json.dumps(payload, sort_keys=True, default=str)
        return hashlib.sha256(serialized.encode("utf-8")).hexdigest()

    # ------------------------------------------------------------------
    # Redis Operations
    # ------------------------------------------------------------------

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
