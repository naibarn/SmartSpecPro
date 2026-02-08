Now let me extract the relevant content from the TDD and implementation plans specifically for section-09-sse-stream.

Based on the prompt files, I can now write the section content. Let me compile the relevant information about SSE streaming for section-09.

# SSE Execution Stream

## Overview

This section implements real-time execution event streaming for workflow execution, allowing the frontend to visualize workflow progress in real-time as nodes execute. The implementation uses Server-Sent Events (SSE) with cookie-based authentication and supports event replay for connection recovery.

**Depends on:** section-08-workflow-api (Workflow API endpoints and orchestrator integration)

**Blocks:** section-12-execution-viz (frontend execution visualization consumes SSE events)

**Files affected:**
- `python-backend/app/api/workflow.py` (new SSE endpoint)
- `python-backend/app/orchestrator/orchestrator.py` (event emission integration)
- `python-backend/tests/test_sse_execution.py` (test suite)

---

## Tests (TDD)

Write these tests in `python-backend/tests/test_sse_execution.py` BEFORE implementing:

```python
# tests/test_sse_execution.py

# Test: GET /execute/{id}/stream — returns event-stream content type
# Verify response header Content-Type: text/event-stream

# Test: SSE — authenticates via session cookie (not header)
# Make SSE request WITH session cookie, verify 200
# Make SSE request WITHOUT session cookie, verify 401

# Test: SSE — unauthenticated request returns 401

# Test: SSE — emits node_start event when node begins execution
# Connect SSE, execute workflow, verify node_start event contains nodeId, nodeName, timestamp

# Test: SSE — emits node_complete event with output summary and duration
# Verify node_complete event contains nodeId, nodeName, output (summary), durationMs, timestamp

# Test: SSE — emits node_error event with error details
# Trigger node error, verify event contains nodeId, nodeName, error message

# Test: SSE — emits workflow_complete event after all nodes finish
# Execute multi-node workflow, verify workflow_complete event at end with totalDurationMs, nodeResults summary

# Test: SSE — emits workflow_error event on unrecoverable failure
# Trigger workflow-level error, verify workflow_error event contains executionId, error, failedNodeId

# Test: SSE — supports Last-Event-ID reconnection (replays missed events)
# Connect SSE, receive some events, disconnect
# Reconnect with Last-Event-ID header pointing to middle event
# Verify replayed events are sent before new events continue

# Test: SSE — closes connection when workflow completes
# After workflow_complete event, verify connection closes (no more events)
```

---

## Implementation Details

### 9.1 Event Types and Data Structure

Define SSE event types and their payloads:

```python
# python-backend/app/orchestrator/events.py (new file)

from dataclasses import dataclass
from typing import Any, Optional
from datetime import datetime

@dataclass
class WorkflowEvent:
    """Base class for workflow execution events"""
    event_type: str  # 'node_start', 'node_complete', 'node_error', 'workflow_complete', 'workflow_error'
    event_id: str    # Unique event ID for reconnection
    timestamp: datetime
    
    def to_sse_string(self) -> str:
        """Convert to SSE format for transmission"""
        # Format: event: node_start\ndata: {...json...}\nid: {event_id}\n\n

@dataclass
class NodeStartEvent(WorkflowEvent):
    node_id: str
    node_name: str

@dataclass
class NodeCompleteEvent(WorkflowEvent):
    node_id: str
    node_name: str
    output: dict  # Summary of outputs
    duration_ms: int  # Execution time

@dataclass
class NodeErrorEvent(WorkflowEvent):
    node_id: str
    node_name: str
    error: str  # Error message

@dataclass
class WorkflowCompleteEvent(WorkflowEvent):
    execution_id: str
    total_duration_ms: int
    node_results: dict  # Summary of all node results

@dataclass
class WorkflowErrorEvent(WorkflowEvent):
    execution_id: str
    error: str
    failed_node_id: Optional[str] = None
```

### 9.2 SSE Endpoint

Add to `python-backend/app/api/workflow.py`:

```python
from fastapi.responses import StreamingResponse
from fastapi import Cookie, Header
from typing import Optional

@router.get("/execute/{execution_id}/stream")
async def stream_workflow_execution(
    execution_id: str,
    request: Request,
    session: Optional[str] = Cookie(None),  # Cookie-based authentication
    last_event_id: Optional[str] = Header(None),  # Reconnection support
    current_user: User = Depends(get_current_user_from_cookie),
) -> StreamingResponse:
    """
    SSE endpoint for real-time workflow execution visualization.
    
    Authentication: Session cookie (EventSource API sends cookies automatically)
    Reconnection: Last-Event-ID header replays missed events
    
    Event format:
        event: {event_type}\n
        data: {json}\n
        id: {event_id}\n\n
    """
    # Stub: implementation loads execution from DB, connects to orchestrator event stream
    pass
```

**Key design points:**
- Use `StreamingResponse` for SSE
- Authenticate via session cookie (standard for EventSource API)
- Support Last-Event-ID header for reconnection
- Tenant isolation: verify execution belongs to current user's tenant

### 9.3 Orchestrator Integration

The `Orchestrator` class emits events during execution. Update `python-backend/app/orchestrator/orchestrator.py`:

```python
# In WorkflowOrchestrator class

class WorkflowOrchestrator:
    def __init__(self):
        self.event_listeners: list[Callable] = []
    
    def subscribe_to_events(self, listener: Callable[[WorkflowEvent], None]) -> None:
        """Subscribe to execution events"""
        self.event_listeners.append(listener)
    
    def emit_event(self, event: WorkflowEvent) -> None:
        """Emit event to all listeners"""
        for listener in self.event_listeners:
            await listener(event)
    
    async def execute_node(self, node: Node, context: ExecutionContext) -> dict:
        """Execute a single node and emit events"""
        node_id = node["id"]
        node_name = node["data"]["label"]
        
        # Emit start event
        self.emit_event(NodeStartEvent(
            event_id=f"{node_id}_start",
            timestamp=datetime.now(),
            node_id=node_id,
            node_name=node_name,
        ))
        
        start_time = time.time()
        try:
            # Execute node via appropriate executor
            result = await executor.execute(node["data"]["config"], inputs, context)
            duration_ms = int((time.time() - start_time) * 1000)
            
            # Emit complete event
            self.emit_event(NodeCompleteEvent(
                event_id=f"{node_id}_complete",
                timestamp=datetime.now(),
                node_id=node_id,
                node_name=node_name,
                output=self._summarize_output(result),
                duration_ms=duration_ms,
            ))
            
            return result
        
        except Exception as e:
            # Emit error event
            self.emit_event(NodeErrorEvent(
                event_id=f"{node_id}_error",
                timestamp=datetime.now(),
                node_id=node_id,
                node_name=node_name,
                error=str(e),
            ))
            raise
    
    async def execute_workflow(self, workflow: dict, context: ExecutionContext) -> dict:
        """Execute entire workflow and emit completion events"""
        execution_id = context.execution_id
        start_time = time.time()
        
        try:
            result = await self._execute_nodes(workflow, context)
            duration_ms = int((time.time() - start_time) * 1000)
            
            # Emit workflow complete event
            self.emit_event(WorkflowCompleteEvent(
                event_id=f"{execution_id}_complete",
                timestamp=datetime.now(),
                execution_id=execution_id,
                total_duration_ms=duration_ms,
                node_results=result,
            ))
            
            return result
        
        except Exception as e:
            # Emit workflow error event
            self.emit_event(WorkflowErrorEvent(
                event_id=f"{execution_id}_error",
                timestamp=datetime.now(),
                execution_id=execution_id,
                error=str(e),
                failed_node_id=context.current_node_id,
            ))
            raise
```

### 9.4 Event Storage for Replay

To support Last-Event-ID reconnection, store emitted events in memory (or Redis for distributed systems):

```python
# python-backend/app/orchestrator/event_store.py (new file)

from collections import deque
from datetime import datetime, timedelta

class EventStore:
    """In-memory event store with TTL (typically 60 seconds)"""
    
    def __init__(self, max_events: int = 1000, ttl_seconds: int = 60):
        self.events: deque[WorkflowEvent] = deque(maxlen=max_events)
        self.ttl_seconds = ttl_seconds
    
    def add_event(self, event: WorkflowEvent) -> None:
        """Add event to store"""
        self.events.append(event)
    
    def get_events_since(self, event_id: str) -> list[WorkflowEvent]:
        """Get all events since the given event ID (for reconnection)"""
        # Stub: find event by ID, return all events after it
        pass
    
    def cleanup_expired(self) -> None:
        """Remove events older than TTL"""
        # Stub: remove events older than now - ttl_seconds
        pass
```

### 9.5 SSE Response Formatting

Helper function to format events for SSE transmission:

```python
def format_event_for_sse(event: WorkflowEvent) -> str:
    """
    Format a WorkflowEvent as SSE data.
    
    Format:
        event: node_start
        data: {"nodeId":"n1","nodeName":"LLM Call",...}
        id: n1_start
        
        (blank line)
    """
    import json
    
    event_data = {
        "eventType": event.event_type,
        "timestamp": event.timestamp.isoformat(),
        # Type-specific fields
        **asdict(event),  # Recursively convert dataclass to dict
    }
    
    return (
        f"event: {event.event_type}\n"
        f"data: {json.dumps(event_data)}\n"
        f"id: {event.event_id}\n"
        f"\n"
    )
```

---

## Connection Lifecycle

1. **Connect:** Client calls `GET /execute/{execution_id}/stream`
   - Server verifies user owns execution
   - Server subscribes event emitter to a channel for this execution
   - Server streams events as they occur

2. **Normal flow:** Events emit as nodes execute
   - SSE endpoint receives events from orchestrator
   - Formats and sends to client
   - Client receives via EventSource listener

3. **Disconnect + Reconnect:** Network hiccup or tab backgrounding
   - Client reconnects with `Last-Event-ID` header
   - Server checks event store for missed events
   - Replays events since last ID before continuing

4. **Complete:** After `workflow_complete` or `workflow_error`
   - Server closes SSE connection
   - Client stops listening

---

## Frontend Consumption

The frontend connects to this SSE endpoint using the JavaScript EventSource API:

```typescript
// Stub: Frontend integration (full implementation in section-12-execution-viz)

const eventSource = new EventSource(`/api/v1/workflow/execute/${executionId}/stream`);

eventSource.addEventListener('node_start', (event) => {
  const data = JSON.parse(event.data);
  executionStore.updateNodeStatus(data.nodeId, 'running');
});

eventSource.addEventListener('node_complete', (event) => {
  const data = JSON.parse(event.data);
  executionStore.updateNodeStatus(data.nodeId, 'success', data.output);
});

eventSource.addEventListener('workflow_complete', (event) => {
  eventSource.close();
});
```

---

## File Paths Summary

| File | Purpose |
|------|---------|
| `python-backend/app/orchestrator/events.py` | Event dataclasses (node_start, node_complete, etc.) |
| `python-backend/app/orchestrator/event_store.py` | In-memory event storage with TTL for reconnection replay |
| `python-backend/app/api/workflow.py` | `GET /execute/{id}/stream` SSE endpoint |
| `python-backend/app/orchestrator/orchestrator.py` | Event emission integration in execute_node and execute_workflow |
| `python-backend/tests/test_sse_execution.py` | SSE tests: event emission, reconnection, authentication |

---

## Dependencies

- **Depends on:** section-08-workflow-api (workflow API endpoints, orchestrator)
- **Used by:** section-12-execution-viz (frontend consumes SSE events for real-time visualization)

---

## Key Implementation Notes

1. **Authentication:** Use session cookies (EventSource sends them automatically). Validate in SSE endpoint.

2. **Event ID generation:** Use `{nodeId}_{eventType}` or UUID. Must be unique and stable for reconnection.

3. **Event replay:** Keep events in memory (or Redis) with short TTL (60 seconds). On reconnection, send missed events before resuming live stream.

4. **Connection closure:** After `workflow_complete` or `workflow_error`, stop emitting events and close the connection.

5. **Error propagation:** Emit `node_error` events for individual node failures (workflow continues if configured). Emit `workflow_error` only for unrecoverable failures.

6. **Timing:** Include `timestamp` in all events for synchronization and debug logging.