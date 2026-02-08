"""Workflow execution events for SSE streaming."""
import json
from dataclasses import asdict, dataclass
from datetime import datetime
from typing import Any, Optional


@dataclass
class WorkflowEvent:
    """Base class for workflow execution events."""

    event_type: str  # 'node_start', 'node_complete', 'node_error', 'workflow_complete', 'workflow_error'
    event_id: str  # Unique event ID for reconnection
    timestamp: datetime

    def to_sse_string(self) -> str:
        """
        Convert to SSE format for transmission.

        Format:
            event: node_start
            data: {"nodeId":"n1","nodeName":"LLM Call",...}
            id: n1_start

            (blank line)
        """
        event_data = asdict(self)
        # Convert datetime to ISO string
        event_data["timestamp"] = self.timestamp.isoformat()

        return (
            f"event: {self.event_type}\n"
            f"data: {json.dumps(event_data)}\n"
            f"id: {self.event_id}\n"
            f"\n"
        )


@dataclass
class NodeStartEvent(WorkflowEvent):
    """Event emitted when a node starts execution."""

    node_id: str
    node_name: str

    def __post_init__(self):
        if not self.event_type:
            self.event_type = "node_start"


@dataclass
class NodeCompleteEvent(WorkflowEvent):
    """Event emitted when a node completes successfully."""

    node_id: str
    node_name: str
    output: dict[str, Any]  # Summary of outputs
    duration_ms: int  # Execution time

    def __post_init__(self):
        if not self.event_type:
            self.event_type = "node_complete"


@dataclass
class NodeErrorEvent(WorkflowEvent):
    """Event emitted when a node encounters an error."""

    node_id: str
    node_name: str
    error: str  # Error message

    def __post_init__(self):
        if not self.event_type:
            self.event_type = "node_error"


@dataclass
class WorkflowCompleteEvent(WorkflowEvent):
    """Event emitted when the entire workflow completes successfully."""

    execution_id: str
    total_duration_ms: int
    node_results: dict[str, Any]  # Summary of all node results

    def __post_init__(self):
        if not self.event_type:
            self.event_type = "workflow_complete"


@dataclass
class WorkflowErrorEvent(WorkflowEvent):
    """Event emitted when the workflow encounters an unrecoverable error."""

    execution_id: str
    error: str
    failed_node_id: Optional[str] = None

    def __post_init__(self):
        if not self.event_type:
            self.event_type = "workflow_error"


def format_event_for_sse(event: WorkflowEvent) -> str:
    """
    Format a WorkflowEvent as SSE data.

    This is a convenience wrapper around event.to_sse_string().
    """
    return event.to_sse_string()
