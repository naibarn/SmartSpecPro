"""Per-run token budget enforcement."""

from __future__ import annotations

from typing import Any

from app.services.agentic_limits import MAX_TOKENS_BUDGET

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
