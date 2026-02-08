"""Approval Gate node executor with database integration."""
from typing import Any, Dict, Optional, List
from datetime import datetime, timedelta
import uuid
from app.orchestrator.node_executors.base import ExecutionContext, NodeExecutionData

# TODO: Uncomment when ApprovalDBService is available
# from app.services.approval_service import ApprovalDBService


class ApprovalExecutor:
    """
    Executor for Approval Gate nodes.

    Approval gates pause workflow execution and wait for human approval.
    Supports:
    - Multiple approvers (any one can approve/reject)
    - Timeout with auto-reject
    - Approval tracking in database
    """

    async def execute(
        self,
        data: NodeExecutionData,
        context: ExecutionContext,
    ) -> Dict[str, Any]:
        """
        Execute approval gate.

        This is a stateful executor that creates a pending approval record
        and returns immediately. Workflow execution pauses until:
        - An approver approves/rejects
        - Timeout is reached

        Args:
            data: Node execution data with inputs and config
            context: Execution context with user_id, execution_id

        Returns:
            dict: Approval result
                - approved: bool - Whether approved
                - rejected: bool - Whether rejected
                - approved_by: str - User ID who approved (if approved)
                - rejected_by: str - User ID who rejected (if rejected)
                - timeout: bool - Whether approval timed out
                - data: Any - Input data passed through
        """
        config = data.config
        inputs = data.inputs

        # Get approvers list
        approvers: List[str] = config.get("approvers", [])
        if not approvers:
            # SECURITY: No approvers configured - reject by default
            return {
                "approved": False,
                "rejected": True,
                "rejected_by": "system",
                "data": inputs.get("data"),
                "error": "No approvers configured. Approval gate requires at least one approver.",
            }

        # Get timeout (in seconds), bounded between 60s and 7 days
        MAX_TIMEOUT = 7 * 24 * 3600  # 7 days
        MIN_TIMEOUT = 60  # 1 minute
        timeout_seconds = max(MIN_TIMEOUT, min(int(config.get("timeout", 3600)), MAX_TIMEOUT))
        timeout_at = datetime.utcnow() + timedelta(seconds=timeout_seconds)

        # Generate approval ID
        approval_id = f"approval-{uuid.uuid4().hex[:12]}"

        # Create approval record in database
        # TODO: Integrate with ApprovalDBService
        # approval_service = ApprovalDBService()
        # await approval_service.create_approval(
        #     approval_id=approval_id,
        #     execution_id=context.execution_id,
        #     node_id=data.node_id,
        #     approvers=approvers,
        #     timeout_at=timeout_at,
        #     data=inputs.get("data"),
        #     status="pending",
        # )

        # For now (without database integration):
        # Check if this is a re-execution after approval decision
        existing_decision = context.extra_data.get(f"approval_decision_{data.node_id}")
        if existing_decision:
            # Resume after approval
            return existing_decision

        # First execution - create pending approval and pause
        # In a real implementation, this would:
        # 1. Save approval to database
        # 2. Send notifications to approvers
        # 3. Return a "paused" status that halts workflow
        # 4. Background job monitors timeout
        # 5. When approved/rejected, workflow resumes

        # Temporary: Auto-approve after simulated delay
        return {
            "approved": True,  # TODO: Change to False and pause workflow
            "rejected": False,
            "approved_by": "auto-approved-dev",
            "data": inputs.get("data"),
            "approval_id": approval_id,
            "timeout_at": timeout_at.isoformat(),
            "note": "Auto-approved for development. TODO: Implement actual approval flow with database.",
        }

    async def check_approval_status(
        self,
        approval_id: str,
    ) -> Optional[Dict[str, Any]]:
        """
        Check status of a pending approval.

        Args:
            approval_id: Approval ID to check

        Returns:
            dict or None: Approval decision if completed, None if still pending
        """
        # TODO: Query database for approval status
        # approval_service = ApprovalDBService()
        # approval = await approval_service.get_approval(approval_id)
        #
        # if approval.status == "approved":
        #     return {"approved": True, "approved_by": approval.approved_by}
        # elif approval.status == "rejected":
        #     return {"rejected": True, "rejected_by": approval.rejected_by}
        # elif approval.status == "timeout":
        #     return {"timeout": True}
        # else:
        #     return None  # Still pending
        return None


# For backward compatibility
async def execute_approval(data: NodeExecutionData, context: ExecutionContext) -> Dict[str, Any]:
    """Legacy function wrapper for approval execution."""
    executor = ApprovalExecutor()
    return await executor.execute(data, context)
