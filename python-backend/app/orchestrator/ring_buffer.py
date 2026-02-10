"""
Ring buffer for SSE event storage and replay.

Replaces the old EventStore with a fixed-size ring buffer per execution.
Supports SSE reconnection via Last-Event-ID header.
"""

from collections import deque
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from typing import Optional


@dataclass
class SSEEvent:
    """A stored SSE event for replay."""

    event_id: str
    event_type: str
    data: str  # JSON string, ready to send
    timestamp: datetime = field(default_factory=datetime.utcnow)

    def to_sse_string(self) -> str:
        """Convert to SSE wire format."""
        return f"event: {self.event_type}\ndata: {self.data}\nid: {self.event_id}\n\n"


class ExecutionRingBuffer:
    """
    Ring buffer storing the last N SSE events for a single execution.
    Supports replay from a given Last-Event-ID for SSE reconnection.
    """

    def __init__(self, max_size: int = 100):
        self._buffer: deque[SSEEvent] = deque(maxlen=max_size)
        self.created_at: datetime = datetime.utcnow()
        self.last_activity: datetime = datetime.utcnow()

    def append(self, event: SSEEvent) -> None:
        """Add an event to the ring buffer."""
        self._buffer.append(event)
        self.last_activity = datetime.utcnow()

    def get_events_since(self, event_id: str) -> list[SSEEvent]:
        """Return all events after the given event_id. Returns [] if not found."""
        for i, evt in enumerate(self._buffer):
            if evt.event_id == event_id:
                return list(self._buffer)[i + 1 :]
        return []

    def get_all(self) -> list[SSEEvent]:
        """Return all buffered events."""
        return list(self._buffer)

    def __len__(self) -> int:
        return len(self._buffer)


class RingBufferStore:
    """
    Manages ring buffers for all active executions.
    Replaces the old EventStore singleton.
    """

    MAX_TRACKED_EXECUTIONS = 500
    DEFAULT_TTL_SECONDS = 300  # 5 minutes after last activity

    def __init__(self, buffer_size: int = 100, ttl_seconds: int = DEFAULT_TTL_SECONDS):
        self._buffers: dict[str, ExecutionRingBuffer] = {}
        self._buffer_size = buffer_size
        self._ttl_seconds = ttl_seconds

    def get_or_create(self, execution_id: str) -> ExecutionRingBuffer:
        """Get or create a ring buffer for an execution."""
        if execution_id not in self._buffers:
            self._maybe_evict()
            self._buffers[execution_id] = ExecutionRingBuffer(max_size=self._buffer_size)
        return self._buffers[execution_id]

    def get(self, execution_id: str) -> Optional[ExecutionRingBuffer]:
        """Get ring buffer for an execution, or None."""
        return self._buffers.get(execution_id)

    def remove(self, execution_id: str) -> None:
        """Remove ring buffer for a completed/failed execution."""
        self._buffers.pop(execution_id, None)

    def cleanup_expired(self) -> int:
        """Remove buffers that have exceeded TTL. Returns count removed."""
        now = datetime.utcnow()
        expired = [
            eid
            for eid, buf in self._buffers.items()
            if (now - buf.last_activity) > timedelta(seconds=self._ttl_seconds)
        ]
        for eid in expired:
            del self._buffers[eid]
        return len(expired)

    def _maybe_evict(self) -> None:
        """Evict oldest buffers if at capacity."""
        while len(self._buffers) >= self.MAX_TRACKED_EXECUTIONS:
            oldest_id = min(
                self._buffers, key=lambda eid: self._buffers[eid].last_activity
            )
            del self._buffers[oldest_id]


# Global singleton
_ring_buffer_store: Optional[RingBufferStore] = None


def get_ring_buffer_store() -> RingBufferStore:
    """Get or create the global ring buffer store."""
    global _ring_buffer_store
    if _ring_buffer_store is None:
        _ring_buffer_store = RingBufferStore()
    return _ring_buffer_store
