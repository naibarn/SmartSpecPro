"""Multi-Model Router Executor - Route requests to different models."""

import logging
from typing import Any
from collections.abc import Sequence

from app.orchestrator.node_executors.base import ExecutionContext, NodeExecutionData

logger = logging.getLogger(__name__)


class MultiModelRouterExecutor:
    """
    Route requests to different models based on criteria.

    Routing strategies:
    - cost: Cheapest model that can handle request
    - complexity: Route based on token count/complexity
    - quality: Use best available model
    - fallback: Try primary, fallback on failure
    """

    MODELS: dict[str, dict[str, float | int | str]] = {
        "gpt-4": {
            "cost_per_1k": 0.03,
            "max_tokens": 8192,
            "quality": "high",
        },
        "gpt-3.5-turbo": {
            "cost_per_1k": 0.002,
            "max_tokens": 4096,
            "quality": "medium",
        },
        "claude-3-opus": {
            "cost_per_1k": 0.015,
            "max_tokens": 200000,
            "quality": "high",
        },
        "claude-3-sonnet": {
            "cost_per_1k": 0.003,
            "max_tokens": 200000,
            "quality": "medium",
        },
    }

    async def execute(
        self, data: NodeExecutionData, context: ExecutionContext
    ) -> dict[str, Any]:
        """Select model based on routing strategy."""
        prompt = str(data.inputs.get("prompt", ""))
        strategy = str(data.inputs.get("strategy", "cost"))
        preferred_model = data.inputs.get("preferred_model")
        if preferred_model is not None:
            preferred_model = str(preferred_model)
        fallback_models = data.inputs.get("fallback_models", [])
        fallback_models_list = (
            [str(model) for model in fallback_models]
            if isinstance(fallback_models, Sequence) and not isinstance(fallback_models, (str, bytes))
            else []
        )
        max_cost_value = data.inputs.get("max_cost")
        max_cost = float(max_cost_value) if isinstance(max_cost_value, (int, float)) else None

        # Estimate token count
        est_tokens = len(prompt.split()) * 1.3

        # Select model based on strategy
        if strategy == "cost":
            selected = self._select_by_cost(est_tokens, max_cost)
        elif strategy == "complexity":
            selected = self._select_by_complexity(prompt, est_tokens)
        elif strategy == "quality":
            selected = self._select_by_quality()
        elif strategy == "fallback":
            selected = preferred_model or (fallback_models_list[0] if fallback_models_list else "gpt-3.5-turbo")
        else:
            selected = preferred_model or "gpt-3.5-turbo"

        return {
            "selected_model": selected,
            "estimated_tokens": int(est_tokens),
            "estimated_cost": self._estimate_cost(selected, est_tokens),
            "strategy": strategy,
        }

    def _select_by_cost(self, tokens: float, max_cost: float | None = None) -> str:
        """Select cheapest model."""
        sorted_models = sorted(self.MODELS.items(), key=lambda x: float(x[1]["cost_per_1k"]))

        for model, config in sorted_models:
            cost = (tokens / 1000) * float(config["cost_per_1k"])
            if max_cost is None or cost <= max_cost:
                return model

        return sorted_models[0][0]

    def _select_by_complexity(self, prompt: str, tokens: float) -> str:
        """Select based on complexity heuristics."""
        # Simple heuristics for complexity
        if tokens > 4000:
            return "claude-3-sonnet"  # High context
        if "reasoning" in prompt.lower() or "analyze" in prompt.lower():
            return "gpt-4"  # Complex reasoning
        return "gpt-3.5-turbo"  # Default

    def _select_by_quality(self) -> str:
        """Select highest quality model."""
        return "gpt-4"

    def _estimate_cost(self, model: str, tokens: float) -> float:
        """Estimate API cost."""
        if model in self.MODELS:
            return (tokens / 1000) * float(self.MODELS[model]["cost_per_1k"])
        return 0.0
