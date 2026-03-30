"""Context window budgeting for agency execution."""

from __future__ import annotations

import structlog

logger = structlog.get_logger(__name__)

MODEL_CONTEXT_LIMITS: dict[str, int] = {
    "gpt-4o": 128000,
    "gpt-4o-mini": 128000,
    "gpt-4-turbo": 128000,
    "gpt-3.5-turbo": 16385,
    "claude-3-5-sonnet": 200000,
    "claude-3-opus": 200000,
    "claude-3-haiku": 200000,
    "claude-3-sonnet": 200000,
    "claude-sonnet": 200000,
    "claude-opus": 200000,
    "claude-haiku": 200000,
    "gemini-2.0-flash": 1000000,
    "gemini-1.5-pro": 2000000,
    "gemini-1.5-flash": 1000000,
    "deepseek-chat": 64000,
    "deepseek-coder": 64000,
}

DEFAULT_CONTEXT_LIMIT = 32000
CONTEXT_BUDGET_RATIO = 0.6
COMPLETION_RESERVE_RATIO = 0.2
MIN_COMPLETION_RESERVE_TOKENS = 2048
TRUNCATION_SUFFIX = " [truncated to fit context budget]"


class ContextBudgetManager:
    """Enforce that composed context stays within the target model window."""

    def __init__(self, model_name: str):
        self.model_name = str(model_name or "").strip()
        self.model_limit = self._get_model_limit(self.model_name)
        self.total_budget = int(self.model_limit * CONTEXT_BUDGET_RATIO)
        self.completion_reserve_tokens = max(
            MIN_COMPLETION_RESERVE_TOKENS,
            int(self.model_limit * COMPLETION_RESERVE_RATIO),
        )
        self.input_budget = max(0, self.total_budget - self.completion_reserve_tokens)
        self.used_tokens = 0
        self.allocations: list[tuple[str, int]] = []
        logger.debug(
            "context_budget_init",
            model_name=self.model_name or None,
            model_limit=self.model_limit,
            total_budget=self.total_budget,
            input_budget=self.input_budget,
            completion_reserve_tokens=self.completion_reserve_tokens,
        )

    def _get_model_limit(self, model_name: str) -> int:
        normalized = str(model_name or "").strip().lower()
        if not normalized:
            return DEFAULT_CONTEXT_LIMIT

        for key, limit in MODEL_CONTEXT_LIMITS.items():
            if key.lower() in normalized:
                return limit
        return DEFAULT_CONTEXT_LIMIT

    @property
    def remaining(self) -> int:
        return max(0, self.input_budget - self.used_tokens)

    def estimate_tokens(self, text: str) -> int:
        normalized = str(text or "")
        return len(normalized) // 4 + 1

    def can_fit(self, tokens: int) -> bool:
        return int(tokens) <= self.remaining

    def allocate(self, text: str, label: str) -> str | None:
        normalized = str(text or "")
        tokens = self.estimate_tokens(normalized)
        remaining = self.remaining
        if tokens <= remaining:
            self.used_tokens += tokens
            self.allocations.append((label, tokens))
            logger.debug(
                "context_budget_allocate",
                label=label,
                tokens=tokens,
                remaining=self.remaining,
            )
            return normalized

        if remaining < 25:
            logger.debug(
                "context_budget_skip",
                label=label,
                remaining=remaining,
            )
            return None

        # Leave room for the truncation suffix and keep within the remaining budget.
        max_chars = max(0, remaining * 4 - len(TRUNCATION_SUFFIX))
        candidate = normalized[:max_chars].rstrip()
        truncated = candidate + TRUNCATION_SUFFIX
        while self.estimate_tokens(truncated) > remaining and max_chars > 0:
            max_chars -= 1
            candidate = normalized[:max_chars].rstrip()
            truncated = candidate + TRUNCATION_SUFFIX

        truncated_tokens = self.estimate_tokens(truncated)
        self.used_tokens += truncated_tokens
        self.allocations.append((label, truncated_tokens))
        logger.debug(
            "context_budget_truncated",
            label=label,
            original_tokens=tokens,
            truncated_tokens=truncated_tokens,
            remaining=self.remaining,
        )
        return truncated
