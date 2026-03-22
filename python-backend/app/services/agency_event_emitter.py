"""
AgencyEventEmitter — publishes agency run events to Redis for SSE consumption.

Events are published to channel ``agency:stream:{run_id}`` and persisted to
list ``agency:stream:{run_id}:events`` for replay on reconnect.
"""

from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Any, Optional

import structlog

logger = structlog.get_logger(__name__)

REPLAY_LIST_TTL = 1800  # 30 minutes
CANCEL_KEY_TTL = 300    # 5 minutes


class AgencyEventEmitter:
    """Publishes agency run events to Redis for SSE consumption.

    Events are published to channel ``agency:stream:{run_id}`` and
    persisted to list ``agency:stream:{run_id}:events`` for replay.
    """

    def __init__(
        self,
        redis_client: Any,
        run_id: str,
        agency_id: str,
    ) -> None:
        self._redis = redis_client
        self._run_id = run_id
        self._agency_id = agency_id
        self._event_counter = 0
        self._channel = f"agency:stream:{run_id}"
        self._list_key = f"agency:stream:{run_id}:events"

    @property
    def run_id(self) -> str:
        return self._run_id

    @property
    def agency_id(self) -> str:
        return self._agency_id

    async def emit(self, event_type: str, data: dict[str, Any]) -> None:
        """Publish event to Redis channel and persist to replay list.

        Assigns monotonic event ID, wraps in envelope, publishes JSON
        to Redis channel, and RPUSHes to replay list with 30-min TTL.
        """
        self._event_counter += 1
        envelope = {
            "id": str(self._event_counter),
            "event": event_type,
            "data": data,
            "ts": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "Z",
        }
        json_str = json.dumps(envelope, separators=(",", ":"))

        try:
            await self._redis.publish(self._channel, json_str)
            await self._redis.rpush(self._list_key, json_str)
            await self._redis.expire(self._list_key, REPLAY_LIST_TTL)
        except Exception:
            logger.warning(
                "agency_event_emit_failed",
                event_type=event_type,
                run_id=self._run_id,
            )

    async def emit_meta(self) -> None:
        """Emit the initial 'meta' event with runId and agencyId."""
        await self.emit("meta", {
            "runId": self._run_id,
            "agencyId": self._agency_id,
        })

    async def emit_complete(self, usage: dict[str, Any]) -> None:
        """Emit 'run_complete' event with token/cost usage."""
        await self.emit("run_complete", {
            "runId": self._run_id,
            "usage": usage,
        })

    async def emit_error(self, code: str, message: str) -> None:
        """Emit 'error' event."""
        await self.emit("error", {"code": code, "message": message})


async def check_cancelled(redis_client: Any, run_id: str) -> Optional[str]:
    """Check Redis for cancellation signal. Returns mode or None."""
    if redis_client is None:
        return None
    try:
        val = await redis_client.get(f"agency:cancel:{run_id}")
        if val:
            return val if isinstance(val, str) else val.decode()
    except Exception:
        pass
    return None
