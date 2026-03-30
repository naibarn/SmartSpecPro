"""
Agentic feature flag checker.

Reads tenant-scoped feature flags from Redis using the same key format
as the Node.js web app: `feature-flag:{flagName}:{tenantId}`.
Falls back to global key, then hardcoded defaults.
"""

import logging
from typing import Optional

from app.core.redis_client import get_redis

logger = logging.getLogger(__name__)

AGENTIC_FLAGS = {
    "agencyAgenticModeEnabled",
    "agencyReactExecutorEnabled",
    "agencyAutonomousAgentEnabled",
    "agencyLongTermMemoryEnabled",
}

AGENTIC_FLAG_DEFAULTS: dict[str, bool] = {
    "agencyAgenticModeEnabled": True,
    "agencyReactExecutorEnabled": False,
    "agencyAutonomousAgentEnabled": False,
    "agencyLongTermMemoryEnabled": False,
}


async def check_agentic_flag(flag_name: str, tenant_id: str) -> bool:
    """Check if an agentic feature flag is enabled for the given tenant."""
    if flag_name not in AGENTIC_FLAGS:
        raise ValueError(f"Unknown agentic flag: {flag_name}. Must be one of: {sorted(AGENTIC_FLAGS)}")

    default = AGENTIC_FLAG_DEFAULTS[flag_name]

    try:
        redis = await get_redis()
        if redis is None:
            return default

        # Try tenant-scoped key first
        tenant_key = f"feature-flag:{flag_name}:{tenant_id}"
        val: Optional[str] = await redis.get(tenant_key)

        if val is None:
            # Fall back to global key
            global_key = f"feature-flag:{flag_name}"
            val = await redis.get(global_key)

        if val is None:
            return default

        return val.lower() == "true"
    except Exception as e:
        logger.warning(
            "agentic_flag_redis_error",
            extra={"flag": flag_name, "tenant_id": tenant_id, "error": str(e)},
        )
        return default
