from __future__ import annotations

import time
import uuid
from dataclasses import dataclass
from typing import Any

import structlog

from app.core.redis_client import get_cache_redis

logger = structlog.get_logger(__name__)

TYPHOON_OCR_RATE_LIMIT_KEY = "rate_limit:typhoon_ocr_1_5:requests"
TYPHOON_OCR_RATE_LIMIT_REQUESTS_PER_MINUTE = 20
TYPHOON_OCR_RATE_LIMIT_WINDOW_SECONDS = 60
TYPHOON_OCR_RATE_LIMIT_TTL_SECONDS = 120

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
    retry_after = math.max(0, math.ceil(tonumber(oldest[2]) + window_size - now))
end

return {allowed, remaining, retry_after}
"""


@dataclass(frozen=True)
class TyphoonOcrRateLimitState:
    allowed: bool
    remaining: int | None
    retry_after_seconds: int
    redis_available: bool
    error_message: str | None = None


class TyphoonOcrRateLimiter:
    """System-wide Typhoon OCR rate limiter backed by Redis."""

    def __init__(
        self,
        redis_client: Any | None = None,
        *,
        max_requests: int = TYPHOON_OCR_RATE_LIMIT_REQUESTS_PER_MINUTE,
        window_seconds: int = TYPHOON_OCR_RATE_LIMIT_WINDOW_SECONDS,
        ttl_seconds: int = TYPHOON_OCR_RATE_LIMIT_TTL_SECONDS,
        key: str = TYPHOON_OCR_RATE_LIMIT_KEY,
    ) -> None:
        self._redis = redis_client
        self.max_requests = max(1, int(max_requests))
        self.window_seconds = max(1, int(window_seconds))
        self.ttl_seconds = max(self.window_seconds * 2, int(ttl_seconds))
        self.key = key

    async def _get_redis(self) -> Any | None:
        if self._redis is None:
            self._redis = await get_cache_redis()
        return self._redis

    async def acquire(self, *, trace_id: str | None = None) -> TyphoonOcrRateLimitState:
        redis_client = await self._get_redis()
        if redis_client is None:
            logger.warning(
                "typhoon_ocr_rate_limit.redis_unavailable",
                trace_id=trace_id,
                key=self.key,
                limit=self.max_requests,
                window_seconds=self.window_seconds,
            )
            return TyphoonOcrRateLimitState(
                allowed=False,
                remaining=0,
                retry_after_seconds=self.window_seconds,
                redis_available=False,
                error_message=(
                    "Typhoon OCR rate limit enforcement is unavailable. "
                    f"Request blocked to protect the system-wide {self.max_requests} requests per minute cap."
                ),
            )

        now = time.time()
        request_id = f"{int(now * 1000)}:{uuid.uuid4().hex}"

        try:
            result = await redis_client.eval(
                SLIDING_WINDOW_SCRIPT,
                1,
                self.key,
                str(self.max_requests),
                str(self.window_seconds),
                str(now),
                request_id,
                str(self.ttl_seconds),
            )
        except Exception as exc:
            logger.warning(
                "typhoon_ocr_rate_limit.redis_error",
                trace_id=trace_id,
                key=self.key,
                error_type=type(exc).__name__,
                error=str(exc)[:200],
            )
            return TyphoonOcrRateLimitState(
                allowed=False,
                remaining=0,
                retry_after_seconds=self.window_seconds,
                redis_available=False,
                error_message=(
                    "Typhoon OCR rate limit check failed. "
                    f"Request blocked to protect the system-wide {self.max_requests} requests per minute cap."
                ),
            )

        if not isinstance(result, (list, tuple)) or len(result) < 3:
            logger.warning(
                "typhoon_ocr_rate_limit.invalid_redis_result",
                trace_id=trace_id,
                key=self.key,
                result_type=type(result).__name__,
            )
            return TyphoonOcrRateLimitState(
                allowed=False,
                remaining=0,
                retry_after_seconds=self.window_seconds,
                redis_available=False,
                error_message=(
                    "Typhoon OCR rate limit check returned an invalid response. "
                    f"Request blocked to protect the system-wide {self.max_requests} requests per minute cap."
                ),
            )

        allowed = int(result[0]) == 1
        remaining = max(0, int(result[1]))
        retry_after_seconds = max(0, int(result[2]))

        return TyphoonOcrRateLimitState(
            allowed=allowed,
            remaining=remaining,
            retry_after_seconds=retry_after_seconds,
            redis_available=True,
            error_message=(
                f"Typhoon OCR rate limit exceeded ({self.max_requests} requests per minute). "
                f"Retry after {retry_after_seconds} seconds."
                if not allowed
                else None
            ),
        )
