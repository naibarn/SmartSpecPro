"""Event store for SSE reconnection support.

DEPRECATED: This module is deprecated and will be removed in a future release.
Use app.orchestrator.ring_buffer.RingBufferStore instead.
"""
import warnings

warnings.warn(
    "event_store.EventStore is deprecated. Use ring_buffer.RingBufferStore instead. "
    "This module will be removed after streaming tests pass.",
    DeprecationWarning,
    stacklevel=2,
)

from collections import defaultdict, deque
from datetime import datetime, timedelta
from typing import Optional

import structlog

from app.orchestrator.events import WorkflowEvent

logger = structlog.get_logger(__name__)


class EventStore:
    """
    In-memory event store with TTL for SSE reconnection replay.

    Stores events per execution_id with automatic cleanup of expired events.
    Supports replay via Last-Event-ID header.
    """

    # Max tracked executions to prevent unbounded memory growth
    MAX_TRACKED_EXECUTIONS = 500
    # Cleanup runs every N add_event calls (lazy cleanup)
    CLEANUP_INTERVAL = 100

    def __init__(self, max_events_per_execution: int = 1000, ttl_seconds: int = 60):
        """
        Initialize event store.

        Args:
            max_events_per_execution: Max events to keep per execution (FIFO)
            ttl_seconds: Time-to-live for events (cleanup after this duration)
        """
        self.max_events_per_execution = max_events_per_execution
        self.ttl_seconds = ttl_seconds
        self._add_count = 0

        # execution_id -> deque of events
        self.events: dict[str, deque[WorkflowEvent]] = defaultdict(
            lambda: deque(maxlen=max_events_per_execution)
        )

        # event_id -> event (for quick lookup during reconnection)
        self.event_index: dict[str, WorkflowEvent] = {}

        # execution_id -> last_activity timestamp
        self.last_activity: dict[str, datetime] = {}

    def add_event(self, execution_id: str, event: WorkflowEvent) -> None:
        """
        Add event to store.

        Args:
            execution_id: Execution this event belongs to
            event: Event to store
        """
        self.events[execution_id].append(event)
        self.event_index[event.event_id] = event
        self.last_activity[execution_id] = datetime.utcnow()

        # Periodic lazy cleanup to prevent memory leaks
        self._add_count += 1
        if self._add_count >= self.CLEANUP_INTERVAL:
            self._add_count = 0
            self.cleanup_expired()

        logger.debug(
            "event_stored",
            execution_id=execution_id,
            event_type=event.event_type,
            event_id=event.event_id,
        )

    def get_events_since(self, execution_id: str, event_id: str) -> list[WorkflowEvent]:
        """
        Get all events since the given event ID (for reconnection replay).

        Args:
            execution_id: Execution to fetch events for
            event_id: Last event ID received by client (resume after this)

        Returns:
            List of events that occurred after event_id
        """
        execution_events = self.events.get(execution_id, deque())

        if not execution_events:
            logger.warning(
                "no_events_for_execution",
                execution_id=execution_id,
            )
            return []

        # Find the event with the given ID
        try:
            event_index = next(
                i for i, evt in enumerate(execution_events) if evt.event_id == event_id
            )

            # Return all events after this one
            missed_events = list(execution_events)[event_index + 1 :]

            logger.info(
                "replaying_events",
                execution_id=execution_id,
                last_event_id=event_id,
                replay_count=len(missed_events),
            )

            return missed_events

        except StopIteration:
            # Event ID not found - might have been cleaned up
            logger.warning(
                "event_id_not_found",
                execution_id=execution_id,
                event_id=event_id,
                note="Event may have expired or ID is invalid",
            )
            return []

    def get_all_events(self, execution_id: str) -> list[WorkflowEvent]:
        """
        Get all events for an execution.

        Args:
            execution_id: Execution to fetch events for

        Returns:
            List of all stored events for this execution
        """
        return list(self.events.get(execution_id, deque()))

    def cleanup_expired(self) -> None:
        """Remove events older than TTL and enforce max executions limit."""
        now = datetime.utcnow()
        expired_executions = []

        for execution_id, last_activity in self.last_activity.items():
            if now - last_activity > timedelta(seconds=self.ttl_seconds):
                expired_executions.append(execution_id)

        for execution_id in expired_executions:
            self._remove_execution(execution_id)

        # Evict oldest executions if over limit
        while len(self.events) > self.MAX_TRACKED_EXECUTIONS:
            oldest_id = min(self.last_activity, key=self.last_activity.get)  # type: ignore[arg-type]
            self._remove_execution(oldest_id)
            logger.warning(
                "evicted_oldest_execution",
                execution_id=oldest_id,
                reason="max_tracked_executions_exceeded",
            )

    def _remove_execution(self, execution_id: str) -> None:
        """Remove all data for an execution."""
        execution_events = self.events.pop(execution_id, deque())

        for event in execution_events:
            self.event_index.pop(event.event_id, None)

        self.last_activity.pop(execution_id, None)

        logger.info(
            "cleaned_up_expired_events",
            execution_id=execution_id,
            event_count=len(execution_events),
        )

    def clear_execution(self, execution_id: str) -> None:
        """
        Clear all events for a specific execution.

        Useful after workflow completes to free memory.

        Args:
            execution_id: Execution to clear
        """
        self._remove_execution(execution_id)


# Global event store instance
_event_store: Optional[EventStore] = None


def get_event_store() -> EventStore:
    """Get or create the global event store instance."""
    global _event_store
    if _event_store is None:
        _event_store = EventStore()
    return _event_store
