"""Approval Gate node executor using LangGraph native interrupt().

Replaces the previous auto-approve placeholder with a real HITL mechanism.
When this executor runs, the graph pauses and waits for human input.

Also bridges to the ApprovalDBService so that pending approvals appear in
the Dashboard's "Pending Approvals" section.
"""

import json
import uuid
from datetime import datetime, timedelta
from typing import Any, Dict

import structlog
from langgraph.types import interrupt

from app.orchestrator.hitl import ApprovalType, InterruptPayload
from app.orchestrator.node_executors.base import ExecutionContext, NodeExecutionData

# DB approval models -- aliased to avoid collision with hitl.ApprovalType
from app.models.approval import ApprovalStatus as DBApprovalStatus
from app.models.approval import ApprovalType as DBApprovalType

logger = structlog.get_logger()

# Timeout bounds (minutes)
MIN_TIMEOUT_MINUTES = 1
MAX_TIMEOUT_MINUTES = 10080  # 7 days


async def _create_approval_db_record(
    approval_id: str,
    payload: InterruptPayload,
    context: ExecutionContext,
    approvers: list[str],
    timeout_minutes: int,
) -> str | None:
    """Create an approval request row in the database.

    This bridges the LangGraph interrupt mechanism with the ApprovalDBService
    so that the Dashboard's "Pending Approvals" query finds workflow approvals.

    Returns:
        The DB request ID if created successfully, or None on failure.
    """
    from app.core.database import AsyncSessionLocal
    from app.services.approval_db_service import ApprovalDBService

    try:
        async with AsyncSessionLocal() as session:
            service = ApprovalDBService(session)
            db_request = await service.create_request(
                request_type=DBApprovalType.CUSTOM,
                title=payload.message or "Workflow Approval Required",
                description=(
                    f"Approval gate at node '{payload.node_id}' in workflow "
                    f"'{context.workflow_id}' (execution {context.execution_id})"
                ),
                tenant_id=context.tenant_id,
                requester_id=context.user_id,
                requester_type="workflow",
                execution_id=context.execution_id,
                payload=payload.to_dict(),
                extra_data={
                    "approval_id": approval_id,
                    "node_id": payload.node_id,
                    "workflow_id": context.workflow_id,
                    "approvers": approvers,
                },
                risk_level="medium",
                required_approvers=payload.required_approvers,
                expires_at=datetime.utcnow() + timedelta(minutes=timeout_minutes),
                timeout_action="reject",
            )

            logger.info(
                "Approval DB record created",
                db_request_id=db_request.id,
                approval_id=approval_id,
                node_id=payload.node_id,
                tenant_id=context.tenant_id,
            )
            return db_request.id

    except Exception:
        # DB write is non-critical -- the LangGraph interrupt is the primary
        # mechanism.  Log the error but allow the interrupt to proceed.
        logger.exception(
            "Failed to create approval DB record -- interrupt will still proceed",
            approval_id=approval_id,
            node_id=payload.node_id,
        )
        return None


async def _update_approval_db_status(
    db_request_id: str | None,
    response: dict[str, Any],
    tenant_id: str | None,
) -> None:
    """Update the approval request DB row after interrupt() returns.

    Maps the LangGraph resume response to the appropriate DB status
    (APPROVED, REJECTED, or EXPIRED for timeouts).
    """
    if not db_request_id:
        return

    from app.core.database import AsyncSessionLocal
    from app.services.approval_db_service import ApprovalDBService

    try:
        async with AsyncSessionLocal() as session:
            service = ApprovalDBService(session)
            request = await service.get_request(db_request_id, tenant_id=tenant_id)
            if not request or request.status != DBApprovalStatus.PENDING:
                return

            if response.get("timeout"):
                request.status = DBApprovalStatus.EXPIRED
            elif response.get("approved"):
                request.status = DBApprovalStatus.APPROVED
                request.current_approvals = request.required_approvers
            else:
                request.status = DBApprovalStatus.REJECTED

            request.resolved_at = datetime.utcnow()
            await session.commit()

            logger.info(
                "Approval DB record updated after resume",
                db_request_id=db_request_id,
                new_status=request.status.value,
            )

    except Exception:
        logger.exception(
            "Failed to update approval DB record after resume",
            db_request_id=db_request_id,
        )


async def _resolve_approvers(
    raw_approvers: list[str],
    tenant_id: str | None,
) -> list[int]:
    """Resolve approver identifiers to user IDs.

    Supports:
    - Numeric user IDs (passed through)
    - Email addresses (looked up in users table)
    - Role names prefixed with 'role:' (e.g. 'role:admin')
    - Group references prefixed with 'group:' (e.g. 'group:Marketing Team' or 'group:123')
      Resolves all active members of the specified user group within the tenant.

    Returns list of resolved user IDs. Unresolvable entries are logged and skipped.
    """
    from app.core.database import AsyncSessionLocal
    from sqlalchemy import text

    resolved_ids: list[int] = []
    emails: list[str] = []
    roles: list[str] = []
    groups: list[str] = []

    for approver in raw_approvers:
        approver_str = str(approver).strip()
        if not approver_str:
            continue
        # Numeric user ID
        try:
            resolved_ids.append(int(approver_str))
            continue
        except ValueError:
            pass
        # Role reference
        if approver_str.startswith("role:"):
            roles.append(approver_str[5:].strip())
            continue
        # Group reference (by name or ID)
        if approver_str.startswith("group:"):
            group_ref = approver_str[6:].strip()
            if group_ref:
                groups.append(group_ref)
            else:
                logger.warning("Empty group reference, skipping", approver=approver_str)
            continue
        # Assume email
        if "@" in approver_str:
            emails.append(approver_str.lower())
            continue
        # Unknown format -- log warning
        logger.warning("Unknown approver format, skipping", approver=approver_str)

    if not emails and not roles and not groups:
        return resolved_ids

    try:
        async with AsyncSessionLocal() as session:
            # Resolve emails
            if emails:
                result = await session.execute(
                    text("SELECT id FROM users WHERE LOWER(email) = ANY(:emails)"),
                    {"emails": emails},
                )
                for row in result:
                    resolved_ids.append(row[0])

            # Resolve roles
            if roles and tenant_id:
                result = await session.execute(
                    text(
                        "SELECT DISTINCT u.id FROM users u "
                        "WHERE u.role = ANY(:roles) "
                        "AND (u.\"tenantId\" = :tenant_id OR u.role = 'admin')"
                    ),
                    {"roles": roles, "tenant_id": tenant_id},
                )
                for row in result:
                    if row[0] not in resolved_ids:
                        resolved_ids.append(row[0])

            # Resolve groups
            if groups and tenant_id:
                for group_ref in groups:
                    # Try as numeric group ID first
                    group_id = None
                    try:
                        group_id = int(group_ref)
                    except ValueError:
                        pass

                    if group_id:
                        # Lookup by group ID
                        result = await session.execute(
                            text(
                                "SELECT gm.\"userId\" FROM group_members gm "
                                "JOIN user_groups ug ON ug.id = gm.\"groupId\" "
                                "WHERE gm.\"groupId\" = :group_id "
                                "AND gm.status = 'active' "
                                "AND ug.\"tenantId\" = :tenant_id "
                                "AND ug.\"deletedAt\" IS NULL"
                            ),
                            {"group_id": group_id, "tenant_id": tenant_id},
                        )
                    else:
                        # Lookup by group name (case-insensitive)
                        result = await session.execute(
                            text(
                                "SELECT gm.\"userId\" FROM group_members gm "
                                "JOIN user_groups ug ON ug.id = gm.\"groupId\" "
                                "WHERE LOWER(ug.name) = LOWER(:group_name) "
                                "AND gm.status = 'active' "
                                "AND ug.\"tenantId\" = :tenant_id "
                                "AND ug.\"deletedAt\" IS NULL"
                            ),
                            {"group_name": group_ref, "tenant_id": tenant_id},
                        )

                    group_user_ids = [row[0] for row in result]
                    if not group_user_ids:
                        logger.warning(
                            "Group has no active members or not found",
                            group_ref=group_ref,
                            tenant_id=tenant_id,
                        )
                    for uid in group_user_ids:
                        if uid not in resolved_ids:
                            resolved_ids.append(uid)
    except Exception:
        logger.exception("Failed to resolve approvers from database")

    return resolved_ids


async def _notify_approvers(
    approver_ids: list[int],
    approval_id: str,
    payload: InterruptPayload,
    context: ExecutionContext,
    send_email: bool = False,
) -> None:
    """Send in-app notifications (and optionally email) to all resolved approvers.

    Two notification channels:
    1. **In-app (user_notifications table)** -- Inserts rows into the Node.js
       ``user_notifications`` table so the frontend notification center shows the
       pending approval.  Uses raw SQL because this is a Node.js/Drizzle-managed
       table with camelCase columns and integer user IDs.
    2. **Email (via NotificationService)** -- When *send_email* is True, also
       creates a record through the Python ``NotificationService`` which handles
       SMTP delivery.  The service writes to the separate ``notifications`` table
       (Python-managed), which is harmless and gives us email for free.

    This function is intentionally non-blocking: failures are logged but never
    prevent the LangGraph interrupt from proceeding.
    """
    if not approver_ids:
        return

    from app.core.database import AsyncSessionLocal
    from sqlalchemy import text

    notification_title = "Workflow Approval Required"
    notification_message = payload.message or "A workflow requires your approval"

    notification_data = {
        "approval_id": approval_id,
        "node_id": payload.node_id,
        "workflow_id": context.workflow_id,
        "execution_id": context.execution_id,
        "approval_type": (
            payload.approval_type.value
            if hasattr(payload.approval_type, "value")
            else str(payload.approval_type)
        ),
        "timeout_minutes": payload.timeout_minutes,
        "action_url": f"/workflows/executions/{context.execution_id}",
    }

    # -- 1. In-app notifications (user_notifications table for the Node.js frontend) --
    try:
        async with AsyncSessionLocal() as session:
            for user_id in approver_ids:
                await session.execute(
                    text(
                        "INSERT INTO user_notifications "
                        '("userId", type, title, content, priority, "isRead", "createdAt") '
                        "VALUES (:user_id, 'alert', :title, :content, 'high', false, NOW())"
                    ),
                    {
                        "user_id": user_id,
                        "title": notification_title,
                        "content": json.dumps(
                            {"message": notification_message, **notification_data}
                        ),
                    },
                )
            await session.commit()

            logger.info(
                "In-app approval notifications sent",
                approval_id=approval_id,
                approver_count=len(approver_ids),
            )
    except Exception:
        logger.exception(
            "Failed to send in-app approval notifications -- interrupt will still proceed",
            approval_id=approval_id,
        )

    # -- 2. Email notifications (via NotificationService) --
    if send_email:
        try:
            from app.services.notification_service import NotificationService

            async with AsyncSessionLocal() as session:
                service = NotificationService(session)
                for user_id in approver_ids:
                    await service.create_notification(
                        user_id=str(user_id),
                        type="warning",
                        title=notification_title,
                        message=notification_message,
                        data=notification_data,
                        send_email=True,
                    )

            logger.info(
                "Email approval notifications sent",
                approval_id=approval_id,
                approver_count=len(approver_ids),
            )
        except Exception:
            # Email delivery is best-effort -- never block the interrupt.
            logger.exception(
                "Failed to send email approval notifications -- interrupt will still proceed",
                approval_id=approval_id,
            )


class ApprovalExecutor:
    """Executor for Approval Gate nodes using LangGraph interrupt().

    When executed, this node:
    1. Builds an InterruptPayload from config
    2. Creates a row in the approval_requests DB table (for Dashboard visibility)
    3. Calls interrupt(payload) which pauses the graph
    4. LangGraph checkpoints the state to PostgreSQL
    5. The StreamTranslator emits an approval_required SSE event
    6. The graph remains paused until Command(resume=response) is called
    7. On resume, interrupt() returns the response value
    8. The DB record is updated with the final status (approved/rejected/expired)
    9. The executor formats the response as node output
    """

    async def execute(
        self,
        data: NodeExecutionData,
        context: ExecutionContext,
    ) -> Dict[str, Any]:
        """Execute approval gate -- pauses graph via interrupt()."""
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

        # Resolve approver identifiers to user IDs
        resolved_approver_ids = await _resolve_approvers(approvers, context.tenant_id)
        if not resolved_approver_ids:
            return {
                "approved": False,
                "rejected": True,
                "rejected_by": "system",
                "data": inputs.get("data"),
                "error": "No valid approvers found. Check that approver emails/roles exist in the system.",
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

        # ---- Bridge to ApprovalDBService ----
        # Create a row in the approval_requests table BEFORE calling interrupt()
        # so that the Dashboard's "Pending Approvals" section can display it.
        db_request_id = await _create_approval_db_record(
            approval_id=approval_id,
            payload=payload,
            context=context,
            approvers=[str(uid) for uid in resolved_approver_ids],
            timeout_minutes=timeout_minutes,
        )

        # Send in-app notifications (+ optional email) to resolved approvers
        await _notify_approvers(
            approver_ids=resolved_approver_ids,
            approval_id=approval_id,
            payload=payload,
            context=context,
            send_email=bool(config.get("notify_email", False)),
        )

        logger.info(
            "Approval gate: calling interrupt()",
            node_id=data.node_id,
            approval_id=approval_id,
            db_request_id=db_request_id,
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

        # ---- Update DB record with the outcome ----
        if isinstance(response, dict):
            await _update_approval_db_status(
                db_request_id=db_request_id,
                response=response,
                tenant_id=context.tenant_id,
            )

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
            await _update_approval_db_status(
                db_request_id=db_request_id,
                response={"approved": False, "rejected": True},
                tenant_id=context.tenant_id,
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
