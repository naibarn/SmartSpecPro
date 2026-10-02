"""Distributed admission control for Kie.ai image task creation."""

from __future__ import annotations

import os
from dataclasses import dataclass

import structlog

from app.services.postgres_rate_limit import consume_sliding_window

logger = structlog.get_logger(__name__)

KIE_IMAGE_SUBMISSION_RATE_LIMIT_KEY = "rate_limit:kie_ai:image_submissions"


@dataclass(frozen=True)
class KieSubmissionRateLimitState:
    allowed: bool
    remaining: int
    retry_after_seconds: int
    storage_available: bool


class KieSubmissionDeferred(RuntimeError):
    def __init__(
        self,
        retry_after_seconds: int,
        *,
        storage_available: bool,
    ) -> None:
        self.code = (
            "KIE_IMAGE_SUBMISSION_QUEUE_FULL"
            if storage_available
            else "KIE_IMAGE_ADMISSION_UNAVAILABLE"
        )
        message = (
            "Image submission is waiting for a free slot in the system-wide Kie.ai queue."
            if storage_available
            else "Image submission is paused because the system cannot check queue capacity "
            "(PostgreSQL rate-limit storage is unavailable). This is not a Kie.ai quota rejection."
        )
        super().__init__(f"{self.code}: {message}")
        self.retry_after_seconds = max(1, int(retry_after_seconds))
        self.storage_available = storage_available


class KieSubmissionRateLimiter:
    """System-wide PostgreSQL sliding window for Kie.ai image submissions."""

    def __init__(
        self,
        *,
        max_requests: int | None = None,
        window_seconds: int | None = None,
        key: str = KIE_IMAGE_SUBMISSION_RATE_LIMIT_KEY,
    ) -> None:
        self.max_requests = max(
            1,
            int(max_requests or os.getenv("KIE_IMAGE_SUBMISSIONS_PER_WINDOW", "20")),
        )
        self.window_seconds = max(
            1,
            int(window_seconds or os.getenv("KIE_IMAGE_SUBMISSION_WINDOW_SECONDS", "10")),
        )
        self.key = key

    async def acquire(self, *, task_id: str) -> KieSubmissionRateLimitState:
        try:
            decision = await consume_sliding_window(
                "kie_image_submission",
                self.key,
                self.max_requests,
                self.window_seconds,
            )
            return KieSubmissionRateLimitState(
                allowed=decision.allowed,
                remaining=decision.remaining,
                retry_after_seconds=max(1, decision.retry_after_seconds or 1),
                storage_available=True,
            )
        except Exception as exc:
            logger.warning(
                "kie_image_submission_rate_limit_error",
                task_id=task_id,
                error_type=type(exc).__name__,
                database_error_code=(
                    getattr(getattr(exc, "orig", None), "sqlstate", None)
                    or getattr(getattr(exc, "orig", None), "pgcode", None)
                ),
                limiter_key=self.key,
            )
            return KieSubmissionRateLimitState(False, 0, self.window_seconds, False)
