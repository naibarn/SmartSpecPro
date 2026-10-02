from __future__ import annotations

from dataclasses import dataclass

import structlog
from app.services.postgres_rate_limit import consume_sliding_window

logger = structlog.get_logger(__name__)

TYPHOON_OCR_RATE_LIMIT_KEY = "rate_limit:typhoon_ocr_1_5:requests"
TYPHOON_OCR_RATE_LIMIT_REQUESTS_PER_MINUTE = 20
TYPHOON_OCR_RATE_LIMIT_WINDOW_SECONDS = 60

@dataclass(frozen=True)
class TyphoonOcrRateLimitState:
    allowed: bool
    remaining: int | None
    retry_after_seconds: int
    storage_available: bool
    error_message: str | None = None


class TyphoonOcrRateLimiter:
    """System-wide Typhoon OCR rate limiter backed by PostgreSQL."""

    def __init__(
        self,
        *,
        max_requests: int = TYPHOON_OCR_RATE_LIMIT_REQUESTS_PER_MINUTE,
        window_seconds: int = TYPHOON_OCR_RATE_LIMIT_WINDOW_SECONDS,
        key: str = TYPHOON_OCR_RATE_LIMIT_KEY,
    ) -> None:
        self.max_requests = max(1, int(max_requests))
        self.window_seconds = max(1, int(window_seconds))
        self.key = key

    async def acquire(self, *, trace_id: str | None = None) -> TyphoonOcrRateLimitState:
        try:
            decision = await consume_sliding_window(
                "typhoon-ocr",
                self.key,
                self.max_requests,
                self.window_seconds,
            )
        except Exception as exc:
            logger.warning(
                "typhoon_ocr_rate_limit.postgres_error",
                trace_id=trace_id,
                key=self.key,
                error_type=type(exc).__name__,
                error=str(exc)[:200],
            )
            return TyphoonOcrRateLimitState(
                allowed=False,
                remaining=0,
                retry_after_seconds=self.window_seconds,
                storage_available=False,
                error_message=(
                    "Typhoon OCR rate limit check failed. "
                    f"Request blocked to protect the system-wide {self.max_requests} requests per minute cap."
                ),
            )
        return TyphoonOcrRateLimitState(
            allowed=decision.allowed,
            remaining=decision.remaining,
            retry_after_seconds=decision.retry_after_seconds,
            storage_available=True,
            error_message=(
                f"Typhoon OCR rate limit exceeded ({self.max_requests} requests per minute). "
                f"Retry after {decision.retry_after_seconds} seconds."
                if not decision.allowed
                else None
            ),
        )
