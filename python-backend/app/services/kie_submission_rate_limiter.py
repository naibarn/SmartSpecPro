"""Distributed admission control for Kie.ai image task creation."""

from __future__ import annotations

import os
import time
import uuid
from dataclasses import dataclass
from typing import Any

import structlog

from app.core.redis_client import get_cache_redis
from app.services.typhoon_ocr_rate_limiter import SLIDING_WINDOW_SCRIPT

logger = structlog.get_logger(__name__)

KIE_IMAGE_SUBMISSION_RATE_LIMIT_KEY = "rate_limit:kie_ai:image_submissions"


@dataclass(frozen=True)
class KieSubmissionRateLimitState:
    allowed: bool
    remaining: int
    retry_after_seconds: int
    redis_available: bool


class KieSubmissionDeferred(RuntimeError):
    def __init__(self, retry_after_seconds: int, *, redis_available: bool) -> None:
        self.code = (
            "KIE_IMAGE_SUBMISSION_QUEUE_FULL"
            if redis_available
            else "KIE_IMAGE_ADMISSION_UNAVAILABLE"
        )
        message = (
            "Image submission is waiting for a free slot in the system-wide Kie.ai queue."
            if redis_available
            else "Image submission is paused because the system cannot check queue capacity "
            "(Redis unavailable or connection error). This is not a Kie.ai quota rejection."
        )
        super().__init__(f"{self.code}: {message}")
        self.retry_after_seconds = max(1, int(retry_after_seconds))
        self.redis_available = redis_available


class KieSubmissionRateLimiter:
    """System-wide Redis sliding window for Kie.ai image submissions."""

    def __init__(
        self,
        redis_client: Any | None = None,
        *,
        max_requests: int | None = None,
        window_seconds: int | None = None,
        key: str = KIE_IMAGE_SUBMISSION_RATE_LIMIT_KEY,
    ) -> None:
        self._redis = redis_client
        self.max_requests = max(
            1,
            int(max_requests or os.getenv("KIE_IMAGE_SUBMISSIONS_PER_WINDOW", "20")),
        )
        self.window_seconds = max(
            1,
            int(window_seconds or os.getenv("KIE_IMAGE_SUBMISSION_WINDOW_SECONDS", "10")),
        )
        self.key = key

    async def _get_redis(self) -> Any | None:
        # Only explicitly injected clients are retained here. In particular the
        # module-level poll limiter must resolve the current loop's client.
        if self._redis is not None:
            return self._redis
        return await get_cache_redis()

    async def acquire(self, *, task_id: str) -> KieSubmissionRateLimitState:
        redis_client = await self._get_redis()
        if redis_client is None:
            logger.warning("kie_image_submission_rate_limit_unavailable", task_id=task_id)
            return KieSubmissionRateLimitState(False, 0, self.window_seconds, False)

        now = time.time()
        request_id = f"{task_id}:{int(now * 1000)}:{uuid.uuid4().hex}"
        try:
            result = await redis_client.eval(
                SLIDING_WINDOW_SCRIPT,
                1,
                self.key,
                str(self.max_requests),
                str(self.window_seconds),
                str(now),
                request_id,
                str(self.window_seconds * 2),
            )
            if not isinstance(result, (list, tuple)) or len(result) < 3:
                raise ValueError("invalid Redis rate-limit result")
            return KieSubmissionRateLimitState(
                allowed=int(result[0]) == 1,
                remaining=max(0, int(result[1])),
                retry_after_seconds=max(1, int(result[2]) or 1),
                redis_available=True,
            )
        except Exception as exc:
            # Classify common async lifecycle errors without logging Redis URLs
            # or credentials from arbitrary exception messages.
            detail = str(exc).lower()
            reason = (
                "event_loop_closed" if "event loop is closed" in detail
                else "event_loop_mismatch" if "different loop" in detail
                else "redis_command_failed"
            )
            logger.warning(
                "kie_image_submission_rate_limit_error",
                task_id=task_id,
                error_type=type(exc).__name__,
                reason=reason,
                limiter_key=self.key,
            )
            return KieSubmissionRateLimitState(False, 0, self.window_seconds, False)
