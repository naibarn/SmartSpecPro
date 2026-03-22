"""Resolve template variables in agent instructions at runtime."""

from __future__ import annotations

import re
from datetime import datetime
from typing import Any

import structlog

logger = structlog.get_logger(__name__)

# Pattern matches {variable} or {context.key} or {user.key}
_TEMPLATE_RE = re.compile(r"\{([a-zA-Z_][a-zA-Z0-9_.]*)\}")


def resolve_instructions(
    raw_instructions: str,
    *,
    agent_name: str,
    tool_names: list[str] | None = None,
    context: Any | None = None,  # AgencyRunContext
    user_context: dict[str, Any] | None = None,
) -> str:
    """Resolve all template variables in agent instructions.

    Supported variables:
    - {agent_name} -> agent's display name
    - {current_date} -> YYYY-MM-DD
    - {current_time} -> HH:MM
    - {tool_names} -> comma-separated tool list
    - {context.KEY} -> value from AgencyRunContext
    - {user.KEY} -> value from user_context dict

    Missing variables are left as literal '{variable}'.
    """
    if not raw_instructions:
        return raw_instructions

    now = datetime.now()

    # Build flat variable dict with dotted keys
    variables: dict[str, str] = {
        "agent_name": agent_name,
        "current_date": now.strftime("%Y-%m-%d"),
        "current_time": now.strftime("%H:%M"),
        "tool_names": ", ".join(tool_names) if tool_names else "",
    }

    # Add context.KEY entries from AgencyRunContext snapshot
    if context is not None:
        try:
            snapshot = context.snapshot() if hasattr(context, "snapshot") else {}
            for key, value in snapshot.items():
                if isinstance(key, str) and "." not in key:
                    variables[f"context.{key}"] = str(value)
        except Exception:
            logger.warning("instruction_resolver_context_error", agent=agent_name)

    # Add user.KEY entries
    if user_context:
        for key, value in user_context.items():
            if isinstance(key, str):
                variables[f"user.{key}"] = str(value)

    # Resolve using regex to handle dotted keys properly
    def _replace(match: re.Match) -> str:
        key = match.group(1)
        if key in variables:
            return variables[key]
        # Missing key - return literal
        return match.group(0)

    try:
        resolved = _TEMPLATE_RE.sub(_replace, raw_instructions)
    except Exception as e:
        logger.warning("instruction_resolver_format_error", agent=agent_name, error=str(e))
        return raw_instructions

    logger.debug("instructions_resolved", agent=agent_name, had_variables=resolved != raw_instructions)
    return resolved
