Now I have all the context I need to write the comprehensive Section 03 document. Let me produce it.

# Section 03: Human-in-the-Loop via interrupt()

## Overview

This section replaces the existing `ApprovalExecutor` (which auto-approves in dev mode with TODO comments for real approval flow) with a production-grade Human-in-the-Loop (HITL) system using LangGraph's native `interrupt()` function. The current `ApprovalExecutor` at `/home/dev/projects/SmartSpecPro/python-backend/app/orchestrator/node_executors/approval_executor.py` simulates approvals without actually pausing the graph; the rewrite makes the graph truly pause, checkpoint its state to PostgreSQL, notify the frontend via SSE, and resume only when a human responds or a timeout fires.

**What gets built:**

1. **Rewritten `ApprovalExecutor`** -- calls `interrupt()` with a structured payload instead of returning a mock auto-approval. The graph pauses and checkpoints state automatically via LangGraph's built-in interrupt mechanism.
2. **`InterruptPayload` dataclass** -- typed payload schema for the interrupt data (message, options, timeout, required approvers).
3. **`HITLResumeHandler`** -- validates and processes resume responses, supporting approve/reject/input/decision approval types and multi-approver quorum.
4. **`PendingInterruptTracker`** -- Redis-backed tracker that stores metadata about active interrupts (thread_id, node_id, timeout_at, approval_count) for the timeout checker to query.
5. **Celery periodic task** -- checks pending interrupts every 30 seconds and auto-rejects those past their timeout, with optional escalation chain.
6. **Resume flow integration** -- wires `Command(resume=response)` through `LangGraphRuntime.resume()` (from Section 01) and the `POST /execute/{id}/resume` endpoint (from Section 14).

**Why native interrupt():**
- The current `ApprovalExecutor` does not actually pause the graph -- it returns immediately with an auto-approval. There is no mechanism for real human interaction.
- LangGraph's `interrupt()` function natively pauses the graph, checkpoints state, and supports resumption via `Command(resume=...)`. This eliminates the need for a custom `HumanInterruptManager`.
- Interrupt data is stored in the checkpoint itself, surviving server restarts without additional infrastructure.
- The `dispatch_custom_event("interrupt", ...)` mechanism (from Section 02) sends the interrupt payload to the frontend as an `approval_required` SSE event.

---

## Files to Create/Modify

| File | Action | Description |
|------|--------|-------------|
| `/home/dev/projects/SmartSpecPro/python-backend/app/orchestrator/node_executors/approval_executor.py` | **REWRITE** | Replace auto-approval with `interrupt()` call |
| `/home/dev/projects/SmartSpecPro/python-backend/app/orchestrator/hitl.py` | **CREATE** | InterruptPayload, HITLResumeHandler, PendingInterruptTracker |
| `/home/dev/projects/SmartSpecPro/python-backend/app/tasks/workflow_tasks.py` | **CREATE** | Celery periodic task for timeout checking |
| `/home/dev/projects/SmartSpecPro/python-backend/app/core/celery_app.py` | **MODIFY** | Add beat schedule entry for interrupt timeout checker |
| `/home/dev/projects/SmartSpecPro/python-backend/app/orchestrator/langgraph_runtime.py` | **MODIFY** | Wire resume with Command(resume=...) and interrupt tracking |
| `/home/dev/projects/SmartSpecPro/python-backend/app/api/workflows.py` | **MODIFY** | Update resume endpoint to validate and pass HITL response |
| `/home/dev/projects/SmartSpecPro/python-backend/tests/test_hitl.py` | **CREATE** | All HITL tests |

---

## Implementation Steps

### Step 1: Create InterruptPayload and Supporting Types

**File:** `/home/dev/projects/SmartSpecPro/python-backend/app/orchestrator/hitl.py`

Define the interrupt payload schema, the resume handler, and the pending interrupt tracker.

```python
"""Human-in-the-Loop (HITL) support for LangGraph interrupt/resume.

Provides:
- InterruptPayload: structured data sent to the frontend when a graph pauses
- HITLResumeHandler: validates and processes resume responses
- PendingInterruptTracker: Redis-backed tracker for timeout monitoring
"""

from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from enum import Enum
from typing import Any, Optional

import structlog

logger = structlog.get_logger()


class ApprovalType(str, Enum):
    """Types of human approval interactions."""
    APPROVE_REJECT = "approve_reject"
    INPUT = "input"  # Free-form text input
    DECISION = "decision"  # Choose from multiple options


@dataclass
class InterruptPayload:
    """Structured payload for an interrupt() call.

    This is the data that gets:
    1. Stored in the LangGraph checkpoint
    2. Sent to the frontend via SSE as an approval_required event
    3. Used by the timeout checker to determine expiry

    Attributes:
        node_id: The node that triggered the interrupt.
        message: Human-readable message shown to approvers.
        approval_type: Type of response expected.
        options: Available options (for DECISION type).
        timeout_minutes: Minutes before auto-reject (bounded 1-10080).
        required_approvers: Number of approvals needed before resume.
        notification_channel: Channel for notifying approvers.
        data: Opaque data to pass through the approval gate.
        approval_id: Unique ID for tracking this interrupt.
    """
    node_id: str
    message: str
    approval_type: ApprovalType = ApprovalType.APPROVE_REJECT
    options: list[str] = field(default_factory=list)
    timeout_minutes: int = 60
    required_approvers: int = 1
    notification_channel: str | None = None
    data: Any = None
    approval_id: str = ""

    def to_dict(self) -> dict[str, Any]:
        """Serialize for interrupt() call and SSE event."""
        return {
            "node_id": self.node_id,
            "message": self.message,
            "approval_type": self.approval_type.value,
            "options": self.options,
            "timeout_minutes": self.timeout_minutes,
            "required_approvers": self.required_approvers,
            "notification_channel": self.notification_channel,
            "data": self.data,
            "approval_id": self.approval_id,
        }


@dataclass
class ResumeResponse:
    """Validated response from a human approver.

    Attributes:
        approved: Whether the request was approved (for APPROVE_REJECT).
        rejected: Whether the request was rejected.
        decision: Selected option (for DECISION type).
        input_value: Free-form input (for INPUT type).
        comment: Optional comment from the approver.
        approved_by: User ID of the approver.
        responded_at: Timestamp of the response.
    """
    approved: bool = False
    rejected: bool = False
    decision: str | None = None
    input_value: str | None = None
    comment: str | None = None
    approved_by: str | None = None
    responded_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))


class HITLResumeHandler:
    """Validates and processes resume responses for interrupted workflows.

    Handles:
    - Validation of response against the original interrupt payload
    - Multi-approver quorum tracking
    - Building the final state update for the resumed graph
    """

    def validate_response(
        self,
        response: dict[str, Any],
        payload: InterruptPayload,
    ) -> ResumeResponse:
        """Validate a raw response dict against the interrupt payload.

        Args:
            response: Raw response from the API endpoint.
            payload: The original interrupt payload.

        Returns:
            Validated ResumeResponse.

        Raises:
            ValueError: If the response is invalid for the approval type.
        """
        ...

    def build_resume_value(
        self,
        response: ResumeResponse,
        payload: InterruptPayload,
    ) -> dict[str, Any]:
        """Build the value to pass to Command(resume=...).

        Returns:
            Dict with approval result that becomes the node output.
        """
        ...


class PendingInterruptTracker:
    """Redis-backed tracker for active interrupts awaiting response.

    Stores metadata about each pending interrupt so the timeout
    checker Celery task can find and auto-reject expired ones.

    Redis key pattern: hitl:pending:{thread_id}:{node_id}
    Redis value: JSON with timeout_at, approval_id, payload, approvals_received

    TTL: Set to timeout_minutes + 5min buffer (auto-cleanup if checker misses it).
    """

    def __init__(self, redis_client: Any):
        """Initialize with an async Redis client."""
        self._redis = redis_client

    async def register_interrupt(
        self,
        thread_id: str,
        node_id: str,
        payload: InterruptPayload,
        timeout_at: datetime,
    ) -> None:
        """Register a new pending interrupt for timeout tracking."""
        ...

    async def get_pending_interrupt(
        self,
        thread_id: str,
        node_id: str,
    ) -> Optional[dict[str, Any]]:
        """Get metadata for a pending interrupt, or None if not found/expired."""
        ...

    async def record_approval(
        self,
        thread_id: str,
        node_id: str,
        approver_id: str,
    ) -> int:
        """Record an approval and return the new approval count."""
        ...

    async def remove_interrupt(
        self,
        thread_id: str,
        node_id: str,
    ) -> None:
        """Remove a pending interrupt after resolution (approved/rejected/timeout)."""
        ...

    async def get_all_expired(self) -> list[dict[str, Any]]:
        """Scan for all pending interrupts past their timeout_at.

        Returns:
            List of dicts with thread_id, node_id, payload, timeout_at.
        """
        ...
```

### Step 2: Rewrite ApprovalExecutor with interrupt()

**File:** `/home/dev/projects/SmartSpecPro/python-backend/app/orchestrator/node_executors/approval_executor.py`

The existing `ApprovalExecutor` is fully rewritten. Instead of returning an auto-approval dict, it calls `interrupt()` which pauses the LangGraph graph and checkpoints state.

```python
"""Approval Gate node executor using LangGraph native interrupt().

Replaces the previous auto-approve placeholder with a real HITL mechanism.
When this executor runs, the graph pauses and waits for human input.
"""

import uuid
from typing import Any, Dict

import structlog
from langgraph.types import interrupt

from app.orchestrator.hitl import ApprovalType, InterruptPayload
from app.orchestrator.node_executors.base import ExecutionContext, NodeExecutionData

logger = structlog.get_logger()

# Timeout bounds (minutes)
MIN_TIMEOUT_MINUTES = 1
MAX_TIMEOUT_MINUTES = 10080  # 7 days


class ApprovalExecutor:
    """Executor for Approval Gate nodes using LangGraph interrupt().

    When executed, this node:
    1. Builds an InterruptPayload from config
    2. Calls interrupt(payload) which pauses the graph
    3. LangGraph checkpoints the state to PostgreSQL
    4. The StreamTranslator emits an approval_required SSE event
    5. The graph remains paused until Command(resume=response) is called
    6. On resume, interrupt() returns the response value
    7. The executor formats the response as node output
    """

    async def execute(
        self,
        data: NodeExecutionData,
        context: ExecutionContext,
    ) -> Dict[str, Any]:
        """Execute approval gate -- pauses graph via interrupt().

        Args:
            data: Node execution data with config and inputs.
            context: Execution context.

        Returns:
            Approval result dict after human response or timeout.
        """
        config = data.config
        inputs = data.inputs

        # Validate approvers
        approvers: list[str] = config.get("approvers", [])
        if not approvers:
            return {
                "approved": False,
                "rejected": True,
                "rejected_by": "system",
                "data": inputs.get("data"),
                "error": "No approvers configured. Approval gate requires at least one approver.",
            }

        # Build interrupt payload
        timeout_minutes = max(
            MIN_TIMEOUT_MINUTES,
            min(int(config.get("timeout_minutes", 60)), MAX_TIMEOUT_MINUTES),
        )

        approval_id = f"approval-{uuid.uuid4().hex[:12]}"

        payload = InterruptPayload(
            node_id=data.node_id,
            message=config.get("message", "Approval required"),
            approval_type=ApprovalType(config.get("approval_type", "approve_reject")),
            options=config.get("options", []),
            timeout_minutes=timeout_minutes,
            required_approvers=max(1, int(config.get("required_approvers", 1))),
            notification_channel=config.get("notification_channel"),
            data=inputs.get("data"),
            approval_id=approval_id,
        )

        logger.info(
            "Approval gate: calling interrupt()",
            node_id=data.node_id,
            approval_id=approval_id,
            timeout_minutes=timeout_minutes,
            required_approvers=payload.required_approvers,
        )

        # -- This is the key line --
        # interrupt() pauses the graph and checkpoints state.
        # When Command(resume=response) is called, interrupt() returns
        # the response value and execution continues from this point.
        response = interrupt(payload.to_dict())

        # Execution resumes here after human response
        logger.info(
            "Approval gate: resumed after interrupt",
            node_id=data.node_id,
            approval_id=approval_id,
            response_keys=list(response.keys()) if isinstance(response, dict) else None,
        )

        # Format the response as node output
        if isinstance(response, dict):
            return {
                "approved": response.get("approved", False),
                "rejected": response.get("rejected", False),
                "approved_by": response.get("approved_by"),
                "rejected_by": response.get("rejected_by"),
                "decision": response.get("decision"),
                "input_value": response.get("input_value"),
                "comment": response.get("comment"),
                "timeout": response.get("timeout", False),
                "data": inputs.get("data"),
                "approval_id": approval_id,
            }
        else:
            # Unexpected response format -- treat as rejection
            logger.warning(
                "Approval gate: unexpected response format",
                node_id=data.node_id,
                response_type=type(response).__name__,
            )
            return {
                "approved": False,
                "rejected": True,
                "rejected_by": "system",
                "data": inputs.get("data"),
                "error": f"Unexpected response format: {type(response).__name__}",
                "approval_id": approval_id,
            }


# Backward compatibility
async def execute_approval(data: NodeExecutionData, context: ExecutionContext) -> Dict[str, Any]:
    """Legacy function wrapper for approval execution."""
    executor = ApprovalExecutor()
    return await executor.execute(data, context)
```

**How interrupt() works at runtime:**

1. When the graph reaches the approval node, the `NodeAdapter` (from Section 01) calls `executor.execute()`.
2. Inside `execute()`, `interrupt(payload.to_dict())` is called.
3. LangGraph catches the `GraphInterrupt` exception internally, checkpoints the current state to PostgreSQL via `AsyncPostgresSaver`, and stops execution.
4. The `astream_events` stream emits a `dispatch_custom_event("interrupt", payload)` event.
5. The `StreamTranslator` (from Section 02) translates this to an `approval_required` SSE event sent to the frontend.
6. When the user responds via `POST /execute/{id}/resume`, `LangGraphRuntime.resume()` calls `compiled_graph.ainvoke(Command(resume=response), config)`.
7. LangGraph restores the checkpoint and calls `interrupt()` again -- but this time `interrupt()` returns the `response` value instead of pausing.
8. Execution continues from the line after `interrupt()`, and the response is formatted as node output.

### Step 3: Register Pending Interrupt for Timeout Tracking

**Modification to** `/home/dev/projects/SmartSpecPro/python-backend/app/orchestrator/langgraph_runtime.py`

After the graph pauses at an interrupt, the runtime needs to register the interrupt with the `PendingInterruptTracker` so the Celery timeout checker can find it. This is done by inspecting the graph state after execution pauses.

```python
# Addition to LangGraphRuntime class (from Section 01)

async def execute_with_interrupt_tracking(
    self,
    compiled_graph: Any,
    input_data: dict[str, Any],
    config: dict[str, Any],
) -> dict[str, Any]:
    """Execute a workflow, tracking any interrupts for timeout monitoring.

    Wraps execute() to detect when the graph pauses at an interrupt
    and registers it with the PendingInterruptTracker.

    Args:
        compiled_graph: Compiled LangGraph graph.
        input_data: Initial state values.
        config: LangGraph config with configurable.

    Returns:
        Final or interrupted state.
    """
    ...

async def resume(
    self,
    compiled_graph: Any,
    thread_id: str,
    response: dict[str, Any],
    config: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Resume from interrupt with HITL response validation.

    Enhanced from Section 01 to:
    1. Validate the response against the original interrupt payload
    2. Remove the interrupt from the PendingInterruptTracker
    3. Handle multi-approver quorum (if required_approvers > 1)
    4. Pass Command(resume=validated_response) to the graph

    Args:
        compiled_graph: The compiled graph.
        thread_id: Thread ID (tenant_id:execution_id).
        response: User response dict.
        config: Optional config overrides.

    Returns:
        Final state after resumption.

    Raises:
        ValueError: If response is invalid or interrupt not found.
        RuntimeError: If interrupt already resolved.
    """
    ...

async def _auto_reject_interrupt(
    self,
    compiled_graph: Any,
    thread_id: str,
    node_id: str,
    escalation_target: str | None = None,
) -> None:
    """Auto-reject a timed-out interrupt.

    Called by the Celery timeout checker. Resumes the graph with
    a timeout rejection response.

    Args:
        compiled_graph: The compiled graph.
        thread_id: Thread ID.
        node_id: The interrupted node.
        escalation_target: Optional user/channel to escalate to.
    """
    ...
```

### Step 4: Celery Periodic Task for Timeout Checking

**File:** `/home/dev/projects/SmartSpecPro/python-backend/app/tasks/workflow_tasks.py`

A Celery beat task that runs every 30 seconds, scans for expired interrupts, and auto-rejects them.

```python
"""Celery tasks for workflow management.

Tasks:
- check_interrupt_timeouts: Periodic task checking for expired HITL interrupts
- gc_checkpoints: Periodic task for checkpoint garbage collection (from Section 01)
"""

import structlog
from app.core.celery_app import celery_app

logger = structlog.get_logger()


@celery_app.task(name="app.tasks.workflow_tasks.check_interrupt_timeouts")
def check_interrupt_timeouts():
    """Periodic task: check for timed-out HITL interrupts.

    Runs every 30 seconds via Celery beat. For each expired interrupt:
    1. Checks if an escalation chain is configured
    2. If escalation target exists and hasn't been tried, re-notify with escalation
    3. Otherwise, auto-rejects by resuming the graph with a timeout response
    4. Removes the interrupt from the PendingInterruptTracker
    5. Updates the workflow execution status

    This task is synchronous (Celery doesn't natively support async).
    It uses asyncio.run() to call async functions from the runtime.
    """
    ...


@celery_app.task(name="app.tasks.workflow_tasks.gc_checkpoints")
def gc_checkpoints_task():
    """Periodic task: garbage-collect old checkpoint rows.

    From Section 01. Runs daily at 3:00 AM.
    """
    ...
```

### Step 5: Update Celery Beat Schedule

**File:** `/home/dev/projects/SmartSpecPro/python-backend/app/core/celery_app.py`

Add the interrupt timeout checker to the beat schedule.

```python
# Addition to celery_app.conf.beat_schedule:

celery_app.conf.beat_schedule.update({
    "check-interrupt-timeouts": {
        "task": "app.tasks.workflow_tasks.check_interrupt_timeouts",
        "schedule": 30.0,  # Every 30 seconds
    },
    "gc-checkpoints": {
        "task": "app.tasks.workflow_tasks.gc_checkpoints",
        "schedule": crontab(hour=3, minute=30),  # Daily at 3:30 AM UTC
    },
})
```

Also add the workflow tasks queue routing:

```python
# Addition to task_routes:
"app.tasks.workflow_tasks.check_interrupt_timeouts": {"queue": "celery"},
"app.tasks.workflow_tasks.gc_checkpoints": {"queue": "celery"},
```

### Step 6: Update Resume Endpoint for HITL Validation

**File:** `/home/dev/projects/SmartSpecPro/python-backend/app/api/workflows.py`

The resume endpoint (defined in Section 14) needs to integrate with `HITLResumeHandler` for response validation and multi-approver support.

```python
# Modification to the resume_workflow endpoint:

@router.post("/execute/{execution_id}/resume")
async def resume_workflow(
    execution_id: str,
    request: ResumeWorkflowRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Resume a paused workflow after HITL interrupt.

    Enhanced with:
    - Response validation against interrupt payload
    - Multi-approver quorum tracking
    - Already-resolved detection (409 Conflict)
    - Timeout detection (if interrupt expired while user was responding)
    """
    # ... existing validation from Section 14 ...

    # Additional HITL-specific validation:
    # 1. Get the pending interrupt metadata from PendingInterruptTracker
    # 2. Validate the response against the interrupt's approval_type
    # 3. For multi-approver: record approval, check quorum
    # 4. If quorum not met, return 202 Accepted (partial approval)
    # 5. If quorum met, call runtime.resume() with validated response
    # 6. If interrupt already resolved, return 409 Conflict
    ...
```

### Step 7: Frontend SSE Event Handling (from Section 02)

The `approval_required` SSE event is already defined in Section 02's `StreamTranslator`. When the graph interrupts:

1. LangGraph emits `dispatch_custom_event("interrupt", payload)` during `astream_events`
2. `StreamTranslator._translate_custom_event()` maps `name == "interrupt"` to SSE event type `approval_required`
3. The frontend `useSSEWorkflowStream.ts` hook (modified in Section 02) receives the event and updates node status to `pending`
4. The UI shows an approval dialog with the message, options, and timeout from the payload
5. User responds via `trpc.workflow.resume.mutate({ executionId, response })` (from Section 14)

No additional frontend changes are needed beyond what Section 02 already defines.

---

## Key Classes and Function Signatures

### ApprovalExecutor (rewritten)

Location: `/home/dev/projects/SmartSpecPro/python-backend/app/orchestrator/node_executors/approval_executor.py`

```
class ApprovalExecutor:
    async execute(data: NodeExecutionData, context: ExecutionContext) -> Dict[str, Any]
        # Calls interrupt(payload.to_dict()) -- graph pauses here
        # On resume, interrupt() returns the response
        # Formats response as node output dict

async execute_approval(data, context) -> Dict[str, Any]
    # Backward-compatible wrapper
```

### InterruptPayload

Location: `/home/dev/projects/SmartSpecPro/python-backend/app/orchestrator/hitl.py`

```
@dataclass
class InterruptPayload:
    node_id: str
    message: str
    approval_type: ApprovalType = APPROVE_REJECT
    options: list[str] = []
    timeout_minutes: int = 60  # bounded 1..10080
    required_approvers: int = 1
    notification_channel: str | None = None
    data: Any = None
    approval_id: str = ""

    def to_dict() -> dict[str, Any]
```

### HITLResumeHandler

Location: `/home/dev/projects/SmartSpecPro/python-backend/app/orchestrator/hitl.py`

```
class HITLResumeHandler:
    def validate_response(response: dict, payload: InterruptPayload) -> ResumeResponse
    def build_resume_value(response: ResumeResponse, payload: InterruptPayload) -> dict[str, Any]
```

### PendingInterruptTracker

Location: `/home/dev/projects/SmartSpecPro/python-backend/app/orchestrator/hitl.py`

```
class PendingInterruptTracker:
    __init__(redis_client: Any)
    async register_interrupt(thread_id: str, node_id: str, payload: InterruptPayload, timeout_at: datetime) -> None
    async get_pending_interrupt(thread_id: str, node_id: str) -> Optional[dict]
    async record_approval(thread_id: str, node_id: str, approver_id: str) -> int
    async remove_interrupt(thread_id: str, node_id: str) -> None
    async get_all_expired() -> list[dict]
```

### LangGraphRuntime (additions)

Location: `/home/dev/projects/SmartSpecPro/python-backend/app/orchestrator/langgraph_runtime.py`

```
class LangGraphRuntime:
    # Existing from Section 01:
    async execute(compiled_graph, input_data, config) -> dict
    async resume(compiled_graph, thread_id, command, config) -> dict

    # Added for HITL:
    async execute_with_interrupt_tracking(compiled_graph, input_data, config) -> dict
    async resume(compiled_graph, thread_id, response: dict, config) -> dict  # enhanced
    async _auto_reject_interrupt(compiled_graph, thread_id, node_id, escalation_target) -> None
```

---

## Checkpoint State Preservation During Interrupt

When `interrupt()` is called inside the `ApprovalExecutor`:

1. **LangGraph catches the internal `GraphInterrupt` exception** and does NOT propagate it to the `NodeAdapter`. The graph execution loop handles it.
2. **The current state is checkpointed** to PostgreSQL via `AsyncPostgresSaver`. This includes:
   - `node_outputs` from all previously completed nodes
   - `current_node` set to the approval node ID
   - `messages`, `errors`, `audit_trail` accumulations
   - The interrupt payload itself (stored in the checkpoint's pending writes)
3. **The checkpoint thread_id** is `{tenant_id}:{execution_id}`, ensuring multi-tenant isolation.
4. **On server restart**, the checkpoint survives in PostgreSQL. The graph can be resumed from the exact interrupt point by calling `compiled_graph.ainvoke(Command(resume=response), config)` with the same `thread_id`.

**Important**: The `NodeAdapter` from Section 01 wraps executor calls in try/except. However, `interrupt()` does NOT raise a normal exception -- LangGraph handles it internally before the adapter's exception handler fires. The audit trail entry for `node_start` is still recorded, but `node_complete` is deferred until after resume.

---

## Multi-Approver Support

When `required_approvers > 1`:

1. The `PendingInterruptTracker` stores an `approvals_received` counter and list of approver IDs.
2. When a user responds via the resume endpoint:
   a. `HITLResumeHandler.validate_response()` validates the response.
   b. `PendingInterruptTracker.record_approval()` increments the counter and stores the approver ID.
   c. If `approvals_received < required_approvers`, the endpoint returns HTTP 202 Accepted with `{"status": "partial_approval", "approvals": N, "required": M}`. The graph remains paused.
   d. If `approvals_received >= required_approvers`, the graph is resumed with a consolidated response containing all approver IDs.
3. If any single approver rejects, the graph is immediately resumed with a rejection response (no quorum needed for rejection).
4. Duplicate approvals from the same user are ignored (idempotent).

---

## Timeout Handling and Escalation

### Timeout Flow

1. When the graph interrupts, `PendingInterruptTracker.register_interrupt()` stores the interrupt metadata in Redis with key `hitl:pending:{thread_id}:{node_id}` and a Redis TTL of `timeout_minutes + 5` minutes.
2. The Celery periodic task `check_interrupt_timeouts` runs every 30 seconds:
   a. Calls `PendingInterruptTracker.get_all_expired()` which scans for keys where `timeout_at < now()`.
   b. For each expired interrupt, checks if an escalation chain is configured.
   c. If escalation target exists and hasn't been notified, sends notification and extends timeout by the escalation period.
   d. If no escalation or escalation already attempted, calls `LangGraphRuntime._auto_reject_interrupt()`.
3. `_auto_reject_interrupt()` resumes the graph with:
   ```python
   response = {
       "approved": False,
       "rejected": True,
       "rejected_by": "system",
       "timeout": True,
       "timeout_at": timeout_at.isoformat(),
   }
   ```
4. The interrupt is removed from the tracker.
5. The workflow execution status is updated to `running` (it will complete normally, following the rejection path).

### Escalation Chain

The escalation chain is an optional list of `(user_id, additional_timeout_minutes)` pairs configured on the approval node:

```python
# Example config:
{
    "approvers": ["user-1", "user-2"],
    "timeout_minutes": 30,
    "escalation": [
        {"target": "manager-1", "extend_minutes": 60},
        {"target": "director-1", "extend_minutes": 120},
    ]
}
```

When the initial timeout fires:
1. First escalation: Notify `manager-1`, extend timeout by 60 minutes.
2. If extended timeout fires: Notify `director-1`, extend by 120 minutes.
3. If final extended timeout fires: Auto-reject.

The `PendingInterruptTracker` stores an `escalation_index` to track which level has been reached.

---

## Error Handling

| Error Scenario | Handling | HTTP Status (if API) |
|----------------|----------|---------------------|
| **No approvers configured** | `ApprovalExecutor` returns immediate rejection without calling `interrupt()` | N/A (graph continues) |
| **Invalid approval_type in config** | Falls back to `APPROVE_REJECT` with warning log | N/A |
| **Timeout expired** | Celery task auto-rejects, graph resumes on rejection path | N/A |
| **Resume on non-interrupted execution** | Endpoint returns error | 409 Conflict |
| **Resume with invalid response format** | `HITLResumeHandler` raises ValueError, endpoint returns error | 400 Bad Request |
| **Resume on already-resolved interrupt** | `PendingInterruptTracker.get_pending_interrupt()` returns None, endpoint returns error | 409 Conflict |
| **Duplicate approval from same user** | Ignored (idempotent), returns current approval count | 200 OK |
| **Redis unavailable for tracker** | Falls back to checkpoint-only mode (no timeout monitoring), logs warning | N/A (degrades gracefully) |
| **Checkpoint not found on resume** | `LangGraphRuntime.resume()` raises error | 404 Not Found |
| **Celery beat not running** | Timeouts will not fire; interrupts remain pending indefinitely. Health check should flag this. | N/A |
| **Server restart during interrupt** | Checkpoint survives in PostgreSQL; Redis tracker re-populated on next beat cycle or manually | N/A |

---

## Tests

### Test File: `/home/dev/projects/SmartSpecPro/python-backend/tests/test_hitl.py`

| Test Name | Type | What it verifies |
|-----------|------|------------------|
| `test_interrupt_pauses_graph` | integration | Calling `interrupt()` inside `ApprovalExecutor` pauses the graph; execution does not proceed past the approval node; checkpoint is created in the checkpointer |
| `test_interrupt_sends_sse_event` | integration | When the graph interrupts, `astream_events` emits an `on_custom_event` with `name="interrupt"` that the `StreamTranslator` maps to an `approval_required` SSE event containing `nodeId`, `message`, `options`, and `timeout` |
| `test_resume_with_approval` | integration | After interrupt, calling `compiled_graph.ainvoke(Command(resume={"approved": True, "approved_by": "user-1"}), config)` continues graph execution; the approval node output has `approved=True` |
| `test_resume_with_rejection` | integration | Resuming with `{"approved": False, "rejected": True}` continues graph; downstream conditional can route to the rejection branch based on the node output |
| `test_timeout_auto_rejects` | integration | Register interrupt with `timeout_minutes=0` (immediate); run `check_interrupt_timeouts` task; verify the graph is resumed with `timeout=True` and `rejected=True` |
| `test_interrupt_survives_restart` | integration | Create interrupt with PostgreSQL checkpointer; dispose runtime; create new runtime instance; resume the workflow from the checkpoint; verify execution completes |

### Test Stubs

```python
"""Tests for Human-in-the-Loop (HITL) interrupt/resume functionality."""

import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from datetime import datetime, timezone, timedelta

from app.orchestrator.hitl import (
    ApprovalType,
    HITLResumeHandler,
    InterruptPayload,
    PendingInterruptTracker,
    ResumeResponse,
)
from app.orchestrator.node_executors.approval_executor import ApprovalExecutor
from app.orchestrator.node_executors.base import ExecutionContext, NodeExecutionData


@pytest.fixture
def approval_executor():
    """Create an ApprovalExecutor instance."""
    return ApprovalExecutor()


@pytest.fixture
def sample_interrupt_payload():
    """Create a sample InterruptPayload."""
    return InterruptPayload(
        node_id="approval-1",
        message="Please approve this deployment",
        approval_type=ApprovalType.APPROVE_REJECT,
        options=[],
        timeout_minutes=60,
        required_approvers=1,
        notification_channel=None,
        data={"deployment_version": "v2.1.0"},
        approval_id="approval-abc123def456",
    )


@pytest.fixture
def sample_execution_context():
    """Create a sample ExecutionContext."""
    return ExecutionContext(
        user_id=1,
        tenant_id="tenant-1",
        workflow_id="wf-1",
        execution_id="exec-abc123def456",
    )


@pytest.fixture
def sample_node_data():
    """Create sample NodeExecutionData for an approval node."""
    return NodeExecutionData(
        node_id="approval-1",
        node_type="approval_gate",
        config={
            "message": "Please approve this deployment",
            "approval_type": "approve_reject",
            "approvers": ["user-2", "user-3"],
            "timeout_minutes": 60,
            "required_approvers": 1,
        },
        inputs={"data": {"deployment_version": "v2.1.0"}},
        state={},
    )


class TestInterruptPayload:
    """Tests for InterruptPayload dataclass."""

    def test_to_dict_serializes_all_fields(self, sample_interrupt_payload):
        """Verify to_dict() includes all fields with correct types."""
        result = sample_interrupt_payload.to_dict()
        assert result["node_id"] == "approval-1"
        assert result["message"] == "Please approve this deployment"
        assert result["approval_type"] == "approve_reject"
        assert result["timeout_minutes"] == 60
        assert result["required_approvers"] == 1
        assert result["approval_id"] == "approval-abc123def456"

    def test_timeout_bounds_respected(self):
        """Verify timeout is bounded between MIN and MAX."""
        payload = InterruptPayload(
            node_id="n1",
            message="test",
            timeout_minutes=99999,  # exceeds MAX
        )
        # Bounding is done in ApprovalExecutor, not InterruptPayload
        assert payload.timeout_minutes == 99999  # raw value stored


class TestHITLResumeHandler:
    """Tests for HITLResumeHandler validation."""

    def test_validate_approve_reject_response(self, sample_interrupt_payload):
        """Valid approve_reject response passes validation."""
        handler = HITLResumeHandler()
        response = handler.validate_response(
            {"approved": True, "comment": "Looks good"},
            sample_interrupt_payload,
        )
        assert response.approved is True
        assert response.comment == "Looks good"

    def test_validate_decision_response(self):
        """Decision response must include a valid option."""
        handler = HITLResumeHandler()
        payload = InterruptPayload(
            node_id="n1",
            message="Choose environment",
            approval_type=ApprovalType.DECISION,
            options=["staging", "production"],
        )
        response = handler.validate_response(
            {"decision": "staging"},
            payload,
        )
        assert response.decision == "staging"

    def test_validate_decision_invalid_option_raises(self):
        """Decision with invalid option raises ValueError."""
        handler = HITLResumeHandler()
        payload = InterruptPayload(
            node_id="n1",
            message="Choose",
            approval_type=ApprovalType.DECISION,
            options=["a", "b"],
        )
        with pytest.raises(ValueError, match="not a valid option"):
            handler.validate_response({"decision": "c"}, payload)


class TestPendingInterruptTracker:
    """Tests for PendingInterruptTracker Redis operations."""

    @pytest.fixture
    def mock_redis(self):
        """Create a mock async Redis client."""
        redis = AsyncMock()
        redis.set = AsyncMock()
        redis.get = AsyncMock(return_value=None)
        redis.delete = AsyncMock()
        redis.scan = AsyncMock(return_value=(0, []))
        return redis

    @pytest.mark.asyncio
    async def test_register_and_get_interrupt(
        self, mock_redis, sample_interrupt_payload
    ):
        """Register interrupt and retrieve it."""
        tracker = PendingInterruptTracker(mock_redis)
        timeout_at = datetime.now(timezone.utc) + timedelta(minutes=60)

        await tracker.register_interrupt(
            thread_id="tenant-1:exec-abc123def456",
            node_id="approval-1",
            payload=sample_interrupt_payload,
            timeout_at=timeout_at,
        )
        mock_redis.set.assert_called_once()

    @pytest.mark.asyncio
    async def test_record_approval_increments_count(self, mock_redis):
        """Recording an approval increments the approval count."""
        tracker = PendingInterruptTracker(mock_redis)
        # Setup mock to return existing interrupt data
        import json
        mock_redis.get.return_value = json.dumps({
            "approvals_received": 0,
            "approver_ids": [],
            "required_approvers": 2,
        })
        mock_redis.set.return_value = True

        count = await tracker.record_approval(
            thread_id="tenant-1:exec-abc123def456",
            node_id="approval-1",
            approver_id="user-2",
        )
        # Implementation should return updated count
        ...

    @pytest.mark.asyncio
    async def test_remove_interrupt(self, mock_redis):
        """Removing an interrupt deletes the Redis key."""
        tracker = PendingInterruptTracker(mock_redis)
        await tracker.remove_interrupt(
            thread_id="tenant-1:exec-abc123def456",
            node_id="approval-1",
        )
        mock_redis.delete.assert_called_once()


@pytest.mark.integration
class TestInterruptPausesGraph:
    """Integration tests for the full interrupt/resume cycle."""

    async def test_interrupt_pauses_graph(self):
        """interrupt() inside ApprovalExecutor pauses graph execution.

        Setup:
        - Build a 3-node workflow: trigger -> approval -> output
        - Compile with MemorySaver checkpointer
        - Execute the workflow

        Assert:
        - Graph execution stops at the approval node
        - Checkpoint exists for the thread_id
        - State contains node_outputs from the trigger but not the output node
        """
        ...

    async def test_interrupt_sends_sse_event(self):
        """Interrupted graph emits approval_required SSE event.

        Setup:
        - Build workflow with approval node
        - Execute with astream_events

        Assert:
        - Event stream includes on_custom_event with name="interrupt"
        - Event data contains node_id, message, options, timeout
        - StreamTranslator maps to approval_required SSE event type
        """
        ...

    async def test_resume_with_approval(self):
        """Approved interrupt resumes and completes the graph.

        Setup:
        - Execute workflow until it interrupts
        - Resume with Command(resume={"approved": True, "approved_by": "user-1"})

        Assert:
        - Graph continues past approval node
        - Approval node output has approved=True
        - Downstream nodes execute
        - Final state includes outputs from all nodes
        """
        ...

    async def test_resume_with_rejection(self):
        """Rejected interrupt resumes on rejection path.

        Setup:
        - Build workflow: trigger -> approval -> (approved path | rejected path)
        - Execute until interrupt
        - Resume with {"approved": False, "rejected": True}

        Assert:
        - Graph continues on the rejection branch
        - Approval node output has rejected=True
        """
        ...

    async def test_timeout_auto_rejects(self):
        """Expired interrupt is auto-rejected by Celery task.

        Setup:
        - Register interrupt with timeout_at in the past
        - Call check_interrupt_timeouts()

        Assert:
        - Graph is resumed with timeout=True, rejected=True
        - Interrupt is removed from PendingInterruptTracker
        """
        ...

    async def test_interrupt_survives_restart(self):
        """Interrupt state persists in PostgreSQL across runtime restarts.

        Setup:
        - Execute workflow with PostgreSQL checkpointer until interrupt
        - Close and destroy the LangGraphRuntime instance
        - Create a new LangGraphRuntime instance
        - Resume the workflow using the same thread_id

        Assert:
        - Resume succeeds
        - Graph completes from the interrupt point
        - Final state is correct
        """
        ...
```

---

## Dependencies on Other Sections

| Section | Dependency | Nature |
|---------|-----------|--------|
| **Section 01 (LangGraph Runtime Core)** | `LangGraphRuntime.resume()`, `WorkflowCompiler`, `NodeAdapter`, `WorkflowState`, `AsyncPostgresSaver` checkpointer | HITL builds on top of the runtime. `resume()` is the primary integration point. The `NodeAdapter` wraps `ApprovalExecutor` like any other executor. |
| **Section 02 (Streaming Integration)** | `StreamTranslator` mapping `on_custom_event(name="interrupt")` to `approval_required` SSE event | The interrupt payload reaches the frontend through the streaming layer. Section 02 already defines this mapping. |
| **Section 14 (API Endpoints)** | `POST /execute/{id}/resume` endpoint, `ResumeWorkflowRequest` schema | The resume API endpoint is defined in Section 14. This section enhances it with HITL-specific validation (response format, multi-approver quorum, already-resolved detection). |
| **Section 09 (HITL & Code Nodes)** | Approval node type registration (node #32) | Section 09 registers the `approval_gate` node type in the node registry with its config schema. The executor built here is referenced by the registry entry. |
| **Section 13 (Database Schema)** | `workflow_executions` table with `status` column including `interrupted` value | The resume endpoint checks `execution.status == "interrupted"` before allowing resume. |
| **Section 16 (Backward Compatibility)** | Existing `approval_gate` node type continues to work | The rewritten `ApprovalExecutor` must handle the same config schema as the existing one (approvers, timeout, message). The backward-compat wrapper `execute_approval()` is preserved. |

### Python Packages Required

| Package | Version | Purpose | Already Installed? |
|---------|---------|---------|-------------------|
| `langgraph` | >=0.2 | `interrupt()` and `Command(resume=...)` | Yes |
| `redis` / `aioredis` | Any | PendingInterruptTracker storage | Yes (Redis used throughout) |
| `celery` | Any | Periodic timeout checker task | Yes |

No new packages are required for this section.
<!-- SECTION_STATE
status: implemented
commit_hash: fdd41b769140447fe0d83514da1646f8edd7eb45
implementation_notes: Section 03 HITL interrupt fully implemented - InterruptPayload, HITLResumeHandler, PendingInterruptTracker, rewritten ApprovalExecutor with interrupt(), 14 passing tests
END_SECTION_STATE -->
