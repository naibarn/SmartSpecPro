"""Communication flow configuration and round-trip tracking."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

import structlog

logger = structlog.get_logger(__name__)


@dataclass
class FlowConfig:
    """Parsed flowConfig from agencyCommunicationFlows."""

    context_fields: list[str] | None = None
    require_summary: bool = False
    max_round_trips: int = 0  # 0 = unlimited
    timeout: int = 0  # 0 = no timeout

    @classmethod
    def from_dict(cls, data: dict[str, Any] | None) -> FlowConfig | None:
        """Parse a flowConfig dict from the database."""
        if not data:
            return None
        return cls(
            context_fields=data.get("contextFields"),
            require_summary=data.get("requireSummary", False),
            max_round_trips=data.get("maxRoundTrips", 0),
            timeout=data.get("timeout", 0),
        )


class RoundTripTracker:
    """Tracks round-trip counts per (fromAgent, toAgent) pair."""

    def __init__(self) -> None:
        self._counts: dict[tuple[str, str], int] = {}

    def increment(self, from_agent: str, to_agent: str) -> None:
        """Increment counter for agent pair."""
        key = (from_agent, to_agent)
        self._counts[key] = self._counts.get(key, 0) + 1

    def get_count(self, from_agent: str, to_agent: str) -> int:
        """Get current count for agent pair."""
        return self._counts.get((from_agent, to_agent), 0)

    def is_limit_reached(
        self, from_agent: str, to_agent: str, config: FlowConfig | None
    ) -> bool:
        """Check if round-trip limit is reached for this pair.

        Returns False if config is None or maxRoundTrips is 0 (unlimited).
        """
        if config is None or config.max_round_trips <= 0:
            return False

        count = self.get_count(from_agent, to_agent)
        if count >= config.max_round_trips:
            logger.info(
                "round_trip_limit_reached",
                from_agent=from_agent,
                to_agent=to_agent,
                count=count,
                limit=config.max_round_trips,
            )
            return True
        return False


async def build_context_injection(
    context: Any,  # AgencyRunContext
    config: FlowConfig | None,
) -> str:
    """Build context injection string for handoff based on flowConfig.contextFields.

    Extracts specified keys from AgencyRunContext and formats them
    as a readable context block to prepend to the receiving agent's prompt.
    """
    if config is None or not config.context_fields:
        return ""

    parts: list[str] = []
    for field_name in config.context_fields:
        value = await context.get(field_name)
        if value is not None:
            parts.append(f"- {field_name}: {value}")

    if not parts:
        return ""

    return "Shared context:\n" + "\n".join(parts)
