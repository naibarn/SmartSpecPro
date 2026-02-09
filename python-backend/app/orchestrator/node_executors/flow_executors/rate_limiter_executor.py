"""Rate Limiter Executor - Distributed rate limiting using Redis.

Supports three algorithms:
- token_bucket: Smooth rate limiting with burst allowance
- fixed_window: Simple counter per time window
- sliding_window: Precise sliding window using sorted sets

All algorithms use Lua scripts for atomic Redis operations.
Fail-closed: Redis errors raise exceptions rather than silently allowing requests.
"""
import asyncio
import time
import uuid
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


# ---------------------------------------------------------------------------
# Lua Scripts - executed atomically inside Redis
# ---------------------------------------------------------------------------

TOKEN_BUCKET_SCRIPT = """\
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
"""

FIXED_WINDOW_SCRIPT = """\
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
"""

SLIDING_WINDOW_SCRIPT = """\
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
"""


class RateLimiterExecutor:
    """Executor for rate_limiter nodes using Redis-based distributed rate limiting.

    Supports three algorithms: token_bucket, fixed_window, sliding_window.
    All use Lua scripts for atomic Redis operations.
    Fail-closed: any Redis error raises an exception rather than silently allowing.
    """

    # Safety caps
    MAX_WAIT_TIME_SECONDS = 300  # 5 minutes absolute max
    MAX_WINDOW_SIZE_SECONDS = 86400  # 24 hours max window
    MAX_REQUESTS_CAP = 100_000  # Prevent absurdly large limits
    RETRY_INTERVAL_SECONDS = 0.5  # Polling interval when waiting

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
                    f"Cannot connect to Redis at {redis_url} for rate limiting: {e}"
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
        """Execute rate limiting check.

        Extracts configuration from inputs/config, resolves expression-based keys,
        runs the chosen algorithm against Redis, and optionally waits/retries if
        the request is rate-limited and waitOnLimit is enabled.

        Args:
            data: Node execution data with config and inputs.
            context: Execution context (user, workflow, execution IDs).

        Returns:
            dict with allowed, remainingRequests, resetTime, waited, waitedTime.

        Raises:
            ValueError: On invalid configuration.
            ConnectionError: If Redis is unreachable.
            RateLimitExceeded: If rate limited and waitOnLimit is false or wait timeout exceeded.
        """
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

        # Resolve rateLimitKey expressions (e.g. "user-{{userId}}")
        raw_key = inputs.get("rateLimitKey", config.get("rateLimitKey", "default"))
        rate_limit_key = self._expression_resolver.resolve(str(raw_key), data.state)

        wait_on_limit = bool(inputs.get("waitOnLimit", config.get("waitOnLimit", False)))

        max_wait_time = float(inputs.get("maxWaitTime", config.get("maxWaitTime", 60)))
        max_wait_time = min(max_wait_time, self.MAX_WAIT_TIME_SECONDS)

        # Get Redis connection -- fail-closed if unreachable
        try:
            redis = await self._get_redis()
        except ConnectionError:
            raise
        except (RedisError, OSError) as e:
            raise ConnectionError(f"Redis error during rate limit check: {e}") from e

        # --- Select algorithm ---
        check_fn = {
            "token_bucket": self._check_token_bucket,
            "fixed_window": self._check_fixed_window,
            "sliding_window": self._check_sliding_window,
        }[algorithm]

        # --- Execute rate limit check with optional wait/retry ---
        start_time = time.monotonic()
        waited = False
        waited_time_ms = 0.0

        try:
            result = await check_fn(redis, rate_limit_key, max_requests, window_size, context, data)
        except (RedisError, OSError) as e:
            raise ConnectionError(f"Redis error during rate limit check: {e}") from e

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
                try:
                    result = await check_fn(
                        redis, rate_limit_key, max_requests, window_size, context, data
                    )
                except (RedisError, OSError) as e:
                    raise ConnectionError(f"Redis error during rate limit retry: {e}") from e

            waited_time_ms = (time.monotonic() - start_time) * 1000

        elif not result["allowed"]:
            # Not allowed and not waiting -- raise immediately
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

    # ------------------------------------------------------------------
    # Token Bucket Algorithm
    # ------------------------------------------------------------------

    async def _check_token_bucket(
        self,
        redis: Redis,
        key: str,
        max_requests: int,
        window_size: int,
        context: ExecutionContext,
        data: NodeExecutionData,
    ) -> dict[str, Any]:
        """Token bucket rate limit check.

        Allows bursts up to max_requests tokens, refilling at
        max_requests / window_size tokens per second.
        """
        tokens_key = f"rate_limit:{key}:tokens"
        timestamp_key = f"rate_limit:{key}:timestamp"
        refill_rate = max_requests / window_size  # tokens per second
        now = time.time()
        ttl = window_size * 2  # TTL = 2x window for safety

        result = await redis.eval(
            TOKEN_BUCKET_SCRIPT,
            2,  # number of keys
            tokens_key,
            timestamp_key,
            str(max_requests),
            str(refill_rate),
            str(now),
            str(ttl),
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

    # ------------------------------------------------------------------
    # Fixed Window Algorithm
    # ------------------------------------------------------------------

    async def _check_fixed_window(
        self,
        redis: Redis,
        key: str,
        max_requests: int,
        window_size: int,
        context: ExecutionContext,
        data: NodeExecutionData,
    ) -> dict[str, Any]:
        """Fixed window rate limit check.

        Simple counter per time window. Window boundary is
        floor(now / window_size) * window_size.
        """
        now = time.time()
        window_start = int(now // window_size) * window_size
        window_key = f"rate_limit:{key}:{window_start}"
        ttl = window_size * 2  # TTL = 2x window size

        result = await redis.eval(
            FIXED_WINDOW_SCRIPT,
            1,  # number of keys
            window_key,
            str(max_requests),
            str(ttl),
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

    # ------------------------------------------------------------------
    # Sliding Window Algorithm
    # ------------------------------------------------------------------

    async def _check_sliding_window(
        self,
        redis: Redis,
        key: str,
        max_requests: int,
        window_size: int,
        context: ExecutionContext,
        data: NodeExecutionData,
    ) -> dict[str, Any]:
        """Sliding window (log-based) rate limit check.

        Uses a Redis sorted set where each element is a unique request ID
        and the score is the request timestamp. Entries older than
        window_size seconds are pruned on each check.
        """
        now = time.time()
        # Unique request ID to prevent sorted set deduplication
        request_id = f"{context.execution_id}:{data.node_id}:{now}:{uuid.uuid4().hex[:8]}"
        requests_key = f"rate_limit:{key}:requests"
        ttl = window_size * 2

        result = await redis.eval(
            SLIDING_WINDOW_SCRIPT,
            1,  # number of keys
            requests_key,
            str(max_requests),
            str(window_size),
            str(now),
            request_id,
            str(ttl),
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
