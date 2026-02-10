"""Human-in-the-Loop (HITL) support for LangGraph interrupt/resume.

Provides:
- InterruptPayload: structured data sent to the frontend when a graph pauses
- HITLResumeHandler: validates and processes resume responses
- PendingInterruptTracker: Redis-backed tracker for timeout monitoring
"""

import json
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
        resume_response = ResumeResponse(
            approved_by=response.get("approved_by"),
            comment=response.get("comment"),
        )

        if payload.approval_type == ApprovalType.APPROVE_REJECT:
            # Validate approve/reject response
            if "approved" in response:
                resume_response.approved = bool(response["approved"])
                resume_response.rejected = not resume_response.approved
            elif "rejected" in response:
                resume_response.rejected = bool(response["rejected"])
                resume_response.approved = not resume_response.rejected
            else:
                raise ValueError(
                    "APPROVE_REJECT approval type requires 'approved' or 'rejected' field"
                )

        elif payload.approval_type == ApprovalType.DECISION:
            # Validate decision response
            decision = response.get("decision")
            if not decision:
                raise ValueError("DECISION approval type requires 'decision' field")
            if decision not in payload.options:
                raise ValueError(
                    f"Decision '{decision}' not in allowed options: {payload.options}"
                )
            resume_response.decision = decision
            resume_response.approved = True  # Valid decision counts as approval

        elif payload.approval_type == ApprovalType.INPUT:
            # Validate input response
            input_value = response.get("input_value")
            if input_value is None:
                raise ValueError("INPUT approval type requires 'input_value' field")
            resume_response.input_value = str(input_value)
            resume_response.approved = True  # Valid input counts as approval

        return resume_response

    def build_resume_value(
        self,
        response: ResumeResponse,
        payload: InterruptPayload,
    ) -> dict[str, Any]:
        """Build the value to pass to Command(resume=...).

        Returns:
            Dict with approval result that becomes the node output.
        """
        return {
            "approved": response.approved,
            "rejected": response.rejected,
            "decision": response.decision,
            "input_value": response.input_value,
            "comment": response.comment,
            "approved_by": response.approved_by,
            "responded_at": response.responded_at.isoformat(),
            "timeout": False,
        }


class PendingInterruptTracker:
    """Redis-backed tracker for active interrupts awaiting response.

    Stores metadata about each pending interrupt so the timeout
    checker Celery task can find and auto-reject expired ones.

    Redis key pattern: hitl:pending:{thread_id}:{node_id}
    Redis value: JSON with timeout_at, approval_id, payload, approvals_received

    TTL: Set to timeout_minutes + 5min buffer (auto-cleanup if checker misses it).
    """

    def __init__(self, redis_client: Any):
        """Initialize with a Redis client."""
        self._redis = redis_client
        self._key_prefix = "hitl:pending:"

    def _make_key(self, thread_id: str, node_id: str) -> str:
        """Build Redis key for a pending interrupt."""
        return f"{self._key_prefix}{thread_id}:{node_id}"

    async def register_interrupt(
        self,
        thread_id: str,
        node_id: str,
        payload: InterruptPayload,
        timeout_at: datetime,
    ) -> None:
        """Register a new pending interrupt for timeout tracking."""
        key = self._make_key(thread_id, node_id)
        value = json.dumps(
            {
                "thread_id": thread_id,
                "node_id": node_id,
                "payload": payload.to_dict(),
                "timeout_at": timeout_at.isoformat(),
                "approvals_received": 0,
                "created_at": datetime.now(timezone.utc).isoformat(),
            }
        )

        # TTL = timeout_minutes + 5 min buffer
        ttl_seconds = (payload.timeout_minutes + 5) * 60

        await self._redis.setex(key, ttl_seconds, value)

        logger.info(
            "Registered pending interrupt",
            thread_id=thread_id,
            node_id=node_id,
            approval_id=payload.approval_id,
            timeout_at=timeout_at.isoformat(),
        )

    async def get_pending_interrupt(
        self,
        thread_id: str,
        node_id: str,
    ) -> Optional[dict[str, Any]]:
        """Get metadata for a pending interrupt, or None if not found/expired."""
        key = self._make_key(thread_id, node_id)
        value = await self._redis.get(key)
        if not value:
            return None
        try:
            return json.loads(value)
        except json.JSONDecodeError:
            logger.warning("Failed to decode pending interrupt JSON", key=key)
            return None

    async def record_approval(
        self,
        thread_id: str,
        node_id: str,
        approver_id: str,
    ) -> int:
        """Record an approval and return the new approval count.

        Returns:
            Updated approval count, or 0 if interrupt not found.
        """
        pending = await self.get_pending_interrupt(thread_id, node_id)
        if not pending:
            return 0

        pending["approvals_received"] = pending.get("approvals_received", 0) + 1

        # Re-save with same TTL
        key = self._make_key(thread_id, node_id)
        ttl = await self._redis.ttl(key)
        if ttl > 0:
            await self._redis.setex(key, ttl, json.dumps(pending))

        logger.info(
            "Recorded approval",
            thread_id=thread_id,
            node_id=node_id,
            approver_id=approver_id,
            new_count=pending["approvals_received"],
        )

        return pending["approvals_received"]

    async def remove_interrupt(
        self,
        thread_id: str,
        node_id: str,
    ) -> None:
        """Remove a pending interrupt after resolution (approved/rejected/timeout)."""
        key = self._make_key(thread_id, node_id)
        await self._redis.delete(key)
        logger.info("Removed pending interrupt", thread_id=thread_id, node_id=node_id)

    async def get_all_expired(self) -> list[dict[str, Any]]:
        """Scan for all pending interrupts past their timeout_at.

        Returns:
            List of dicts with thread_id, node_id, payload, timeout_at.
        """
        expired = []
        now = datetime.now(timezone.utc)

        # Scan all pending interrupt keys
        pattern = f"{self._key_prefix}*"
        cursor = 0
        while True:
            cursor, keys = await self._redis.scan(cursor, match=pattern, count=100)
            for key in keys:
                value = await self._redis.get(key)
                if value:
                    try:
                        pending = json.loads(value)
                        timeout_at = datetime.fromisoformat(pending["timeout_at"])
                        if timeout_at <= now:
                            expired.append(pending)
                    except (json.JSONDecodeError, KeyError, ValueError):
                        logger.warning("Failed to parse pending interrupt", key=key)
            if cursor == 0:
                break

        logger.info("Scanned for expired interrupts", count=len(expired))
        return expired
