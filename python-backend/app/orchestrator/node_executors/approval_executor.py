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
async def execute_approval(
    data: NodeExecutionData, context: ExecutionContext
) -> Dict[str, Any]:
    """Legacy function wrapper for approval execution."""
    executor = ApprovalExecutor()
    return await executor.execute(data, context)
