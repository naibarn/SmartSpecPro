"""
LangGraph event to SSE translator.

Converts LangGraph astream_events(version="v2") to frontend SSE protocol.
Filters internal routing nodes and unnecessary events.
"""

import json
import time
from datetime import datetime
from typing import Optional

import structlog

from app.orchestrator.ring_buffer import (
    ExecutionRingBuffer,
    SSEEvent,
    get_ring_buffer_store,
)

logger = structlog.get_logger(__name__)

# Internal node filtering
INTERNAL_NODE_PREFIXES = ("__", "_route_", "_router_", "_branch_")
SKIPPED_EVENT_TYPES = {
    "on_retriever_start",
    "on_retriever_end",
    "on_tool_start",
    "on_tool_end",
}


def _should_emit_event(event: dict) -> bool:
    """Determine if a LangGraph event should be forwarded to the SSE client."""
    event_type = event.get("event", "")

    # Skip event types we never forward
    if event_type in SKIPPED_EVENT_TYPES:
        return False

    # For chain events, require langgraph_node metadata
    if event_type in ("on_chain_start", "on_chain_end", "on_chain_error"):
        metadata = event.get("metadata", {})
        node_name = metadata.get("langgraph_node")
        if not node_name:
            return False
        # Skip internal routing nodes
        if any(node_name.startswith(prefix) for prefix in INTERNAL_NODE_PREFIXES):
            return False
        if metadata.get("langgraph_hidden", False):
            return False
        return True

    # Token streaming events always pass
    if event_type == "on_chat_model_stream":
        return True

    # Custom events always pass (workflow_complete, interrupt, progress)
    if event_type == "on_custom_event":
        return True

    return False


class StreamTranslator:
    """
    Translates LangGraph astream_events into SSE event strings.
    Stores events in a ring buffer for reconnection replay.
    """

    def __init__(self, execution_id: str):
        self.execution_id = execution_id
        self._token_seq: dict[str, int] = {}  # node_id -> token sequence counter
        self._node_start_times: dict[str, float] = (
            {}
        )  # node_id -> start time (monotonic)
        store = get_ring_buffer_store()
        self._ring_buffer = store.get_or_create(execution_id)

    def translate_event(self, event: dict) -> Optional[SSEEvent]:
        """
        Translate a single LangGraph event to an SSEEvent.
        Returns None if the event should be filtered out.
        """
        if not _should_emit_event(event):
            return None

        event_type = event.get("event", "")
        metadata = event.get("metadata", {})
        now_iso = datetime.utcnow().isoformat() + "Z"

        if event_type == "on_chain_start":
            return self._translate_node_start(event, metadata, now_iso)
        elif event_type == "on_chain_end":
            return self._translate_node_complete(event, metadata, now_iso)
        elif event_type == "on_chain_error":
            return self._translate_node_error(event, metadata, now_iso)
        elif event_type == "on_chat_model_stream":
            return self._translate_token(event, metadata, now_iso)
        elif event_type == "on_custom_event":
            return self._translate_custom_event(event, metadata, now_iso)

        return None

    def _translate_node_start(
        self, event: dict, metadata: dict, ts: str
    ) -> SSEEvent:
        node_id = metadata.get("langgraph_node", "unknown")
        self._node_start_times[node_id] = time.monotonic()
        event_id = f"{self.execution_id}_{node_id}_start"
        data = json.dumps(
            {
                "nodeId": node_id,
                "nodeName": metadata.get("node_display_name", node_id),
                "event_id": event_id,
                "timestamp": ts,
            }
        )
        sse = SSEEvent(event_id=event_id, event_type="node_start", data=data)
        self._ring_buffer.append(sse)
        return sse

    def _translate_node_complete(
        self, event: dict, metadata: dict, ts: str
    ) -> SSEEvent:
        node_id = metadata.get("langgraph_node", "unknown")
        start_time = self._node_start_times.pop(node_id, None)
        duration_ms = int((time.monotonic() - start_time) * 1000) if start_time else 0
        event_id = f"{self.execution_id}_{node_id}_complete"
        output = event.get("data", {}).get("output", {})
        # Truncate output to prevent oversized SSE payloads
        output_str = json.dumps(output, default=str)
        if len(output_str) > 10240:
            output = {
                "_truncated": True,
                "_size": len(output_str),
                "preview": output_str[:1000],
            }
        data = json.dumps(
            {
                "nodeId": node_id,
                "nodeName": metadata.get("node_display_name", node_id),
                "output": output,
                "durationMs": duration_ms,
                "event_id": event_id,
                "timestamp": ts,
            },
            default=str,
        )
        sse = SSEEvent(event_id=event_id, event_type="node_complete", data=data)
        self._ring_buffer.append(sse)
        return sse

    def _translate_node_error(
        self, event: dict, metadata: dict, ts: str
    ) -> SSEEvent:
        node_id = metadata.get("langgraph_node", "unknown")
        self._node_start_times.pop(node_id, None)
        event_id = f"{self.execution_id}_{node_id}_error"
        error_data = event.get("data", {})
        error_msg = str(error_data.get("error", "Unknown error"))
        data = json.dumps(
            {
                "nodeId": node_id,
                "nodeName": metadata.get("node_display_name", node_id),
                "error": error_msg,
                "event_id": event_id,
                "timestamp": ts,
            }
        )
        sse = SSEEvent(event_id=event_id, event_type="node_error", data=data)
        self._ring_buffer.append(sse)
        return sse

    def _translate_token(self, event: dict, metadata: dict, ts: str) -> SSEEvent:
        node_id = metadata.get("langgraph_node", "unknown")
        seq = self._token_seq.get(node_id, 0)
        self._token_seq[node_id] = seq + 1
        event_id = f"{self.execution_id}_{node_id}_tok_{seq}"
        chunk = event.get("data", {}).get("chunk", "")
        # Extract text content from AIMessageChunk
        token_text = ""
        if hasattr(chunk, "content"):
            token_text = chunk.content
        elif isinstance(chunk, str):
            token_text = chunk
        elif isinstance(chunk, dict):
            token_text = chunk.get("content", str(chunk))
        data = json.dumps(
            {
                "nodeId": node_id,
                "token": token_text,
                "event_id": event_id,
                "timestamp": ts,
            }
        )
        # Token events are NOT stored in ring buffer (too voluminous, not needed for replay)
        return SSEEvent(event_id=event_id, event_type="token", data=data)

    def _translate_custom_event(
        self, event: dict, metadata: dict, ts: str
    ) -> Optional[SSEEvent]:
        name = event.get("name", "")
        custom_data = event.get("data", {})

        if name == "workflow_complete":
            event_id = f"{self.execution_id}_complete"
            data = json.dumps(
                {
                    "executionId": self.execution_id,
                    "totalDurationMs": custom_data.get("total_duration_ms", 0),
                    "nodeResults": custom_data.get("node_results", {}),
                    "event_id": event_id,
                    "timestamp": ts,
                },
                default=str,
            )
            sse = SSEEvent(event_id=event_id, event_type="workflow_complete", data=data)
            self._ring_buffer.append(sse)
            return sse

        elif name == "interrupt":
            node_id = custom_data.get("node_id", "unknown")
            event_id = f"{self.execution_id}_{node_id}_interrupt"
            data = json.dumps(
                {
                    "nodeId": node_id,
                    "approval_id": custom_data.get("approval_id", ""),
                    "approval_type": custom_data.get("approval_type", "approve_reject"),
                    "message": custom_data.get("message", ""),
                    "options": custom_data.get("options", []),
                    "timeout_minutes": custom_data.get("timeout_minutes", 30),
                    "required_approvers": custom_data.get("required_approvers", 1),
                    "event_id": event_id,
                    "timestamp": ts,
                }
            )
            sse = SSEEvent(
                event_id=event_id, event_type="approval_required", data=data
            )
            self._ring_buffer.append(sse)
            return sse

        elif name == "progress":
            node_id = custom_data.get("node_id", "unknown")
            event_id = f"{self.execution_id}_{node_id}_progress"
            data = json.dumps(
                {
                    "nodeId": node_id,
                    "percent": custom_data.get("percent", 0),
                    "message": custom_data.get("message", ""),
                    "event_id": event_id,
                    "timestamp": ts,
                }
            )
            sse = SSEEvent(event_id=event_id, event_type="progress", data=data)
            self._ring_buffer.append(sse)
            return sse

        # Unknown custom event -- skip
        return None
