"""
agency_model_resolver — Resolve the best LLM model for an agent node
based on capability requirements.

Calls the Node.js internal API which uses the same selectBestLlmModel()
logic as the Chat system — ensuring consistent model selection across
both Chat and Agency.
"""

from __future__ import annotations

import json
import os
from typing import Any

import httpx
import structlog

logger = structlog.get_logger(__name__)

# Cache resolved models for the duration of a single agency run
# (avoids repeated HTTP calls for agents with identical requirements)
_resolve_cache: dict[str, str] = {}

DEFAULT_MODEL = "gpt-4o"


async def resolve_agent_model(
    requirements: dict[str, Any],
    fallback_model: str | None = None,
) -> str:
    """Resolve the best LLM model matching the given capability requirements.

    Calls GET /api/internal/models/resolve on the Node.js backend,
    which uses selectBestLlmModel() with priority scoring.

    Args:
        requirements: Capability dict (supportsVision, strategy, etc.)
        fallback_model: Model to use if resolution fails (default: gpt-4o)

    Returns:
        Model ID string (e.g., "gpt-4o", "claude-sonnet-4-20250514")
    """
    if not requirements:
        return fallback_model or DEFAULT_MODEL

    # Cache key based on sorted requirements
    cache_key = json.dumps(requirements, sort_keys=True)
    if cache_key in _resolve_cache:
        return _resolve_cache[cache_key]

    internal_url = os.getenv("SMARTSPEC_INTERNAL_URL", "http://127.0.0.1:3000")
    internal_token = os.getenv("SMARTSPEC_WEB_GATEWAY_TOKEN", "")

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(
                f"{internal_url}/api/internal/models/resolve",
                params={"requirements": json.dumps(requirements)},
                headers={"X-Internal-Token": internal_token},
            )
            if resp.status_code == 200:
                data = resp.json()
                model_id = data.get("modelId")
                if model_id:
                    _resolve_cache[cache_key] = model_id
                    logger.info(
                        "agency_model_resolved",
                        model_id=model_id,
                        provider=data.get("provider"),
                        strategy=requirements.get("strategy", "default"),
                    )
                    return model_id
    except Exception as exc:
        logger.warning("agency_model_resolve_error", error=str(exc)[:200])

    resolved = fallback_model or DEFAULT_MODEL
    logger.info("agency_model_resolve_fallback", model=resolved)
    return resolved


def clear_resolve_cache() -> None:
    """Clear the per-run model resolve cache."""
    _resolve_cache.clear()
