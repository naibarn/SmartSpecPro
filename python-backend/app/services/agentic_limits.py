"""Platform-wide hard caps for agentic execution loops.

All limits are env-configurable via SSP_* environment variables.
Constants are read at import time (module-level).
"""

import logging
import os

logger = logging.getLogger(__name__)


def _env_int(var: str, default: int) -> int:
    """Read an integer from an environment variable with a fallback default."""
    raw = os.environ.get(var, str(default))
    try:
        return int(raw)
    except (ValueError, TypeError):
        logger.warning("Invalid integer for %s=%r, using default %d", var, raw, default)
        return default


# Level 1: Reflection loop
MAX_REFLECTION_CYCLES: int = _env_int("SSP_MAX_REFLECTION_CYCLES", 10)

# Level 2: ReAct loop
MAX_REACT_ITERATIONS: int = _env_int("SSP_MAX_REACT_ITERATIONS", 20)

# Token budgets (all levels)
MAX_TOKENS_BUDGET: int = _env_int("SSP_MAX_TOKENS_BUDGET", 100000)
MAX_TOKENS_PER_ITERATION: int = _env_int("SSP_MAX_TOKENS_PER_ITERATION", 8000)

# Level 3: Autonomous planning
MAX_PLAN_DEPTH: int = _env_int("SSP_MAX_PLAN_DEPTH", 5)
MAX_TOTAL_ITERATIONS: int = _env_int("SSP_MAX_TOTAL_ITERATIONS", 50)

# Cross-agent delegation
MAX_DELEGATION_DEPTH: int = _env_int("SSP_MAX_DELEGATION_DEPTH", 3)

# Long-term memory
MAX_MEMORY_CONTENT_LENGTH: int = _env_int("SSP_MAX_MEMORY_CONTENT_LENGTH", 500)
MAX_MEMORIES_PER_AGENT: int = _env_int("SSP_MAX_MEMORIES_PER_AGENT", 100)


def clamp_to_limit(user_value: int, limit: int) -> int:
    """Clamp a user-provided value between 0 and the platform limit."""
    return max(0, min(user_value, limit))
