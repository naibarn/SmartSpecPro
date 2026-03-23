"""
Agentic cost controls — TokenBudgetTracker and ConcurrentRunLimiter.

TokenBudgetTracker: Per-run token budget enforcement (in-memory, synchronous).
ConcurrentRunLimiter: Redis-based per-tenant and per-user concurrency limiting.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from typing import Any, Optional

from app.services.agentic_limits import MAX_TOKENS_BUDGET

logger = logging.getLogger(__name__)


@dataclass
class AcquireResult:
    """Result of a concurrency limiter acquire attempt."""

    success: bool
    error_code: str = ""
    retry_after: int = 0
    message: str = ""


class TokenBudgetTracker:
    """Per-run token budget tracker. Synchronous, in-memory."""

    def __init__(self, budget: int, warning_threshold: float = 0.8) -> None:
        self.budget = min(budget, MAX_TOKENS_BUDGET) if budget > 0 else 0
        self.warning_threshold = warning_threshold
        self._total_tokens: int = 0
        self._warned: bool = False

    def record_usage(self, tokens: int) -> None:
        """Record token usage from an iteration."""
        if tokens > 0:
            self._total_tokens += tokens

    def is_exceeded(self) -> bool:
        """Check if budget has been exceeded."""
        if self.budget == 0:
            return False
        return self._total_tokens >= self.budget

    def should_warn(self) -> bool:
        """Check if warning should fire (fires only once at 80% threshold)."""
        if self.budget == 0 or self._warned:
            return False
        if self._total_tokens >= self.budget * self.warning_threshold:
            self._warned = True
            return True
        return False

    @property
    def total_tokens(self) -> int:
        return self._total_tokens

    def get_status(self) -> dict[str, Any]:
        """Get current budget status."""
        pct = round(self._total_tokens / self.budget * 100, 1) if self.budget > 0 else 0.0
        return {
            "used_tokens": self._total_tokens,
            "budget": self.budget,
            "used_pct": pct,
            "is_exceeded": self.is_exceeded(),
        }


class ConcurrentRunLimiter:
    """Redis-based per-tenant and per-user concurrency limiter for agentic runs."""

    def __init__(
        self,
        redis_client: Any = None,
        per_tenant_max: int = 3,
        per_user_react_max: int = 2,
        per_user_autonomous_max: int = 1,
        ttl_seconds: int = 3600,
    ) -> None:
        self._redis = redis_client
        self.per_tenant_max = per_tenant_max
        self.per_user_react_max = per_user_react_max
        self.per_user_autonomous_max = per_user_autonomous_max
        self.ttl_seconds = ttl_seconds

    def _tenant_key(self, tenant_id: str) -> str:
        return f"agency:concurrency:tenant:{tenant_id}"

    def _user_key(self, tenant_id: str, user_id: str, run_type: str) -> str:
        return f"agency:concurrency:user:{tenant_id}:{user_id}:{run_type}"

    def _user_max(self, run_type: str) -> int:
        if run_type == "autonomous":
            return self.per_user_autonomous_max
        return self.per_user_react_max

    async def acquire(
        self, tenant_id: str, user_id: str, run_type: str, run_id: str = ""
    ) -> AcquireResult:
        """Attempt to acquire a concurrency slot."""
        if self._redis is None:
            return AcquireResult(success=True)

        try:
            tenant_key = self._tenant_key(tenant_id)
            user_key = self._user_key(tenant_id, user_id, run_type)

            # Increment tenant counter
            tenant_count = await self._redis.incr(tenant_key)
            await self._redis.expire(tenant_key, self.ttl_seconds)

            if tenant_count > self.per_tenant_max:
                await self._redis.decr(tenant_key)
                return AcquireResult(
                    success=False,
                    error_code="concurrent_limit_exceeded",
                    retry_after=30,
                    message="Maximum concurrent agentic runs reached. Please wait for an existing run to complete.",
                )

            # Increment user counter
            user_count = await self._redis.incr(user_key)
            await self._redis.expire(user_key, self.ttl_seconds)

            user_max = self._user_max(run_type)
            if user_count > user_max:
                await self._redis.decr(user_key)
                await self._redis.decr(tenant_key)
                return AcquireResult(
                    success=False,
                    error_code="concurrent_limit_exceeded",
                    retry_after=30,
                    message="Maximum concurrent agentic runs reached. Please wait for an existing run to complete.",
                )

            return AcquireResult(success=True)

        except Exception as e:
            logger.warning("concurrency_limiter_acquire_failed", extra={"error": str(e)})
            return AcquireResult(success=True)  # Fail-open

    async def release(
        self, tenant_id: str, user_id: str, run_type: str, run_id: str = ""
    ) -> None:
        """Release a concurrency slot."""
        if self._redis is None:
            return

        try:
            tenant_key = self._tenant_key(tenant_id)
            user_key = self._user_key(tenant_id, user_id, run_type)

            # Decrement with floor of 0
            tenant_val = await self._redis.decr(tenant_key)
            if tenant_val < 0:
                await self._redis.set(tenant_key, 0, ex=self.ttl_seconds)

            user_val = await self._redis.decr(user_key)
            if user_val < 0:
                await self._redis.set(user_key, 0, ex=self.ttl_seconds)

        except Exception as e:
            logger.warning("concurrency_limiter_release_failed", extra={"error": str(e)})
