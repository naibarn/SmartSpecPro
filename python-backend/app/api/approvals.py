"""
SmartSpec Pro - Approvals API
Phase 3: Human-in-the-loop Approval Endpoints
"""

import asyncio
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, status, Query
from pydantic import BaseModel, Field
from datetime import datetime, timezone
from enum import Enum

import structlog
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import get_current_user
from app.models.user import User
from app.services.approval_db_service import ApprovalDBService
from app.core.database import AsyncSessionLocal
from app.multitenancy.tenant_context import get_current_tenant_id

_logger = structlog.get_logger(__name__)

router = APIRouter(prefix="/api/v1/approvals")


# ==========================================
# Dependencies
# ==========================================

async def get_db_session():
    """Database session dependency."""
    async with AsyncSessionLocal() as session:
        yield session


# ==========================================
# Enums
# ==========================================

class ApprovalStatus(str, Enum):
    PENDING = "pending"
    APPROVED = "approved"
    REJECTED = "rejected"
    EXPIRED = "expired"
    CANCELLED = "cancelled"


class ApprovalDecision(str, Enum):
    APPROVED = "approved"
    REJECTED = "rejected"


class RiskLevel(str, Enum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"


# ==========================================
# Request/Response Models
# ==========================================

class ApprovalRequestCreate(BaseModel):
    """Request model for creating an approval request."""
    request_type: str = Field(..., min_length=2, max_length=50)
    title: str = Field(..., min_length=2, max_length=255)
    description: Optional[str] = None
    project_id: Optional[str] = None
    execution_id: Optional[str] = None
    payload: dict = Field(default_factory=dict)
    risk_level: RiskLevel = RiskLevel.MEDIUM
    required_approvers: int = Field(1, ge=1, le=10)
    timeout_minutes: int = Field(60, ge=5, le=10080)  # 5 min to 1 week


class ApprovalRequestResponse(BaseModel):
    """Response model for approval request."""
    id: str
    request_type: str
    title: str
    description: Optional[str]
    tenant_id: Optional[str]
    project_id: Optional[str]
    execution_id: Optional[str]
    requester_id: Optional[str]
    requester_type: str
    status: ApprovalStatus
    payload: dict
    risk_level: RiskLevel
    required_approvers: int
    current_approvals: int
    expires_at: Optional[datetime]
    created_at: datetime
    resolved_at: Optional[datetime]

    class Config:
        from_attributes = True


class ApprovalResponseCreate(BaseModel):
    """Request model for responding to an approval request."""
    decision: ApprovalDecision
    comment: Optional[str] = None


class ApprovalResponseModel(BaseModel):
    """Response model for approval response."""
    id: str
    request_id: str
    approver_id: str
    decision: str
    comment: Optional[str]
    created_at: datetime

    class Config:
        from_attributes = True


class ApprovalRuleCreate(BaseModel):
    """Request model for creating an approval rule."""
    name: str = Field(..., min_length=2, max_length=100)
    description: Optional[str] = None
    project_id: Optional[str] = None
    trigger_type: str = Field(..., min_length=2, max_length=50)
    conditions: dict = Field(default_factory=dict)
    approver_roles: List[str] = Field(default_factory=list)
    approver_users: List[str] = Field(default_factory=list)
    required_approvals: int = Field(1, ge=1, le=10)
    timeout_minutes: int = Field(60, ge=5, le=10080)
    timeout_action: str = Field("reject", pattern=r"^(approve|reject|escalate)$")


class ApprovalRuleResponse(BaseModel):
    """Response model for approval rule."""
    id: str
    name: str
    description: Optional[str]
    tenant_id: Optional[str]
    project_id: Optional[str]
    trigger_type: str
    conditions: dict
    approver_roles: List[str]
    approver_users: List[str]
    required_approvals: int
    timeout_minutes: int
    timeout_action: str
    priority: int
    is_active: bool
    created_at: datetime

    class Config:
        from_attributes = True


class ApprovalListResponse(BaseModel):
    """Response model for approval list."""
    requests: List[ApprovalRequestResponse]
    total: int
    page: int
    page_size: int


# ==========================================
# Workflow Resume Helper
# ==========================================


async def _resume_workflow_after_decision(
    approval_request,
    decision: str,
    approver_id: int,
    comment: Optional[str],
) -> None:
    """Resume a paused LangGraph workflow after an approval decision.

    Called as a fire-and-forget background coroutine so the API response
    is not blocked by the (potentially slow) graph resumption.

    The compiled graph is looked up in the in-process execution_registry
    first (fast path). If the process was restarted since the workflow
    paused, we recompile from the DB (slow path, same as the timeout task).
    """
    execution_id = approval_request.execution_id
    tenant_id = approval_request.tenant_id

    if not execution_id:
        _logger.warning(
            "approval_resume_no_execution_id",
            request_id=approval_request.id,
        )
        return

    thread_id = f"{tenant_id}:{execution_id}" if tenant_id else execution_id

    # Build the resume value matching HITLResumeHandler format
    is_approved = decision == "approved"
    resume_value = {
        "approved": is_approved,
        "rejected": not is_approved,
        "decision": decision,
        "input_value": comment if not is_approved else None,
        "comment": comment,
        "approved_by": str(approver_id) if is_approved else None,
        "rejected_by": str(approver_id) if not is_approved else None,
        "responded_at": datetime.now(timezone.utc).isoformat(),
        "timeout": False,
    }

    try:
        from langgraph.types import Command

        command = Command(resume=resume_value)

        # Fast path: get compiled graph from in-process registry
        from app.orchestrator.execution_registry import get_active_execution

        active = get_active_execution(execution_id)
        compiled_graph = active["graph"] if active else None

        if compiled_graph is None:
            # Slow path: recompile from DB (process may have restarted)
            _logger.info(
                "approval_resume_recompiling_graph",
                execution_id=execution_id,
            )
            from app.core.database import get_db_context
            from app.models.workflow import Workflow
            from app.models.workflow_execution import WorkflowExecution
            from sqlalchemy import select

            async with get_db_context() as db:
                result = await db.execute(
                    select(WorkflowExecution).where(
                        WorkflowExecution.id == execution_id,
                    )
                )
                execution = result.scalar_one_or_none()

                if not execution or not execution.workflow_id:
                    _logger.warning(
                        "approval_resume_execution_not_found",
                        execution_id=execution_id,
                    )
                    return

                wf_result = await db.execute(
                    select(Workflow).where(
                        Workflow.id == int(execution.workflow_id)
                    )
                )
                workflow = wf_result.scalar_one_or_none()

                if not workflow or not workflow.workflowJson:
                    _logger.warning(
                        "approval_resume_workflow_not_found",
                        workflow_id=execution.workflow_id,
                    )
                    return

            from app.orchestrator.langgraph_runtime import get_langgraph_runtime

            runtime = get_langgraph_runtime()
            compiled_graph = await runtime.compile(workflow.workflowJson)
        else:
            from app.orchestrator.langgraph_runtime import get_langgraph_runtime

            runtime = get_langgraph_runtime()

        # Resume the workflow
        await runtime.resume(
            compiled_graph=compiled_graph,
            thread_id=thread_id,
            command=command,
        )

        # Update execution status back to running
        from app.core.database import get_db_context
        from app.models.workflow_execution import WorkflowExecution
        from sqlalchemy import select

        async with get_db_context() as db:
            result = await db.execute(
                select(WorkflowExecution).where(
                    WorkflowExecution.id == execution_id,
                )
            )
            execution = result.scalar_one_or_none()
            if execution and execution.status == "interrupted":
                execution.status = "running"
                await db.commit()

        # Clean up the Redis interrupt tracker entry
        try:
            import redis.asyncio as aioredis
            from app.core.config import settings
            from app.orchestrator.hitl import PendingInterruptTracker

            redis_client = aioredis.from_url(
                settings.REDIS_URL, decode_responses=True
            )
            try:
                tracker = PendingInterruptTracker(redis_client)
                # The node_id is stored in the approval request's extra_data
                node_id = (approval_request.extra_data or {}).get("node_id", "")
                if node_id:
                    await tracker.remove_interrupt(thread_id, node_id)
            finally:
                await redis_client.aclose()
        except Exception:
            _logger.debug("approval_resume_redis_cleanup_failed", exc_info=True)

        _logger.info(
            "approval_workflow_resumed",
            execution_id=execution_id,
            thread_id=thread_id,
            decision=decision,
            approver_id=approver_id,
        )

    except Exception:
        _logger.exception(
            "approval_resume_failed",
            execution_id=execution_id,
            request_id=approval_request.id,
        )


# ==========================================
# Approval Request Endpoints
# ==========================================

@router.post("/requests", response_model=ApprovalRequestResponse, status_code=status.HTTP_201_CREATED)
async def create_approval_request(
    data: ApprovalRequestCreate,
    current_user: User = Depends(get_current_user),
    tenant_id: Optional[str] = Depends(get_current_tenant_id),
    db: AsyncSession = Depends(get_db_session),
):
    """
    Create a new approval request.

    This is typically called by the system when an action requires approval.
    """
    approval_service = ApprovalDBService(db)

    request = await approval_service.create_request(
        request_type=data.request_type,
        title=data.title,
        description=data.description,
        tenant_id=tenant_id,
        project_id=data.project_id,
        execution_id=data.execution_id,
        requester_id=current_user.id,
        requester_type="user",
        payload=data.payload,
        risk_level=data.risk_level.value,
        required_approvers=data.required_approvers,
        timeout_minutes=data.timeout_minutes,
    )

    if not request:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Failed to create approval request",
        )

    return request


@router.get("/requests", response_model=ApprovalListResponse)
async def list_approval_requests(
    status_filter: Optional[ApprovalStatus] = None,
    request_type: Optional[str] = None,
    project_id: Optional[str] = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    current_user: User = Depends(get_current_user),
    tenant_id: Optional[str] = Depends(get_current_tenant_id),
    db: AsyncSession = Depends(get_db_session),
):
    """
    List approval requests.

    Returns requests that the current user can view or approve.
    """
    approval_service = ApprovalDBService(db)

    requests = await approval_service.list_requests(
        tenant_id=tenant_id,
        status=status_filter.value if status_filter else None,
        request_type=request_type,
        limit=page_size,
        offset=(page - 1) * page_size,
    )

    total = await approval_service.count_requests(
        tenant_id=tenant_id,
        status=status_filter.value if status_filter else None,
        request_type=request_type,
    )

    return ApprovalListResponse(
        requests=requests,
        total=total,
        page=page,
        page_size=page_size,
    )


@router.get("/requests/pending", response_model=List[ApprovalRequestResponse])
async def list_pending_approvals(
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
    current_user: User = Depends(get_current_user),
    tenant_id: Optional[str] = Depends(get_current_tenant_id),
    db: AsyncSession = Depends(get_db_session),
):
    """
    List pending approval requests that the current user can approve.
    """
    approval_service = ApprovalDBService(db)

    requests = await approval_service.list_pending_for_user(
        user_id=current_user.id,
        tenant_id=tenant_id,
        limit=limit,
        offset=offset,
    )
    return requests


@router.get("/requests/{request_id}", response_model=ApprovalRequestResponse)
async def get_approval_request(
    request_id: str,
    current_user: User = Depends(get_current_user),
    tenant_id: Optional[str] = Depends(get_current_tenant_id),
    db: AsyncSession = Depends(get_db_session),
):
    """
    Get approval request details.
    """
    approval_service = ApprovalDBService(db)

    request = await approval_service.get_request(request_id, tenant_id=tenant_id)

    if not request:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Approval request not found",
        )

    return request


@router.post("/requests/{request_id}/respond", response_model=ApprovalRequestResponse)
async def respond_to_approval(
    request_id: str,
    data: ApprovalResponseCreate,
    current_user: User = Depends(get_current_user),
    tenant_id: Optional[str] = Depends(get_current_tenant_id),
    db: AsyncSession = Depends(get_db_session),
):
    """
    Respond to an approval request (approve or reject).

    Authorization checks:
    - Request must exist and be in PENDING status
    - User must not have already responded to this request
    - User must be in the request's approvers list (extra_data.approvers)
      OR have admin/domain_admin role (admin bypass)
    """
    approval_service = ApprovalDBService(db)

    # Verify the request exists first (return 404 if not found)
    approval_request = await approval_service.get_request(request_id, tenant_id=tenant_id)
    if not approval_request:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Approval request not found",
        )

    # Check if user is authorized to approve this request
    can_approve = await approval_service.can_user_approve(
        request_id=request_id,
        user_id=current_user.id,
    )

    if not can_approve:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You are not authorized to respond to this request",
        )

    # Submit response (skip_auth_check=True since we already validated above)
    try:
        request = await approval_service.submit_response(
            request_id=request_id,
            approver_id=current_user.id,
            decision=data.decision.value,
            comment=data.comment,
        )
    except PermissionError:
        # Defense-in-depth: catch authorization errors from the service layer
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You are not authorized to respond to this request",
        )

    if not request:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Failed to submit response. Request may already be resolved.",
        )

    # If the approval request is now fully resolved (APPROVED or REJECTED),
    # resume the paused LangGraph workflow in the background.
    if request.status in ("approved", "rejected"):
        asyncio.ensure_future(
            _resume_workflow_after_decision(
                approval_request=request,
                decision=data.decision.value,
                approver_id=current_user.id,
                comment=data.comment,
            )
        )

    return request


@router.post("/requests/{request_id}/cancel", response_model=ApprovalRequestResponse)
async def cancel_approval_request(
    request_id: str,
    current_user: User = Depends(get_current_user),
    tenant_id: Optional[str] = Depends(get_current_tenant_id),
    db: AsyncSession = Depends(get_db_session),
):
    """
    Cancel an approval request.

    Only the requester can cancel a pending request.
    """
    approval_service = ApprovalDBService(db)

    request = await approval_service.get_request(request_id, tenant_id=tenant_id)

    if not request:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Approval request not found",
        )

    if request.requester_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only the requester can cancel the request",
        )

    if request.status != "pending":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Only pending requests can be cancelled",
        )

    cancelled = await approval_service.cancel_request(request_id)
    return cancelled


@router.get("/requests/{request_id}/responses", response_model=List[ApprovalResponseModel])
async def list_approval_responses(
    request_id: str,
    current_user: User = Depends(get_current_user),
    tenant_id: Optional[str] = Depends(get_current_tenant_id),
    db: AsyncSession = Depends(get_db_session),
):
    """
    List responses for an approval request.
    """
    approval_service = ApprovalDBService(db)

    # Verify the parent request belongs to the tenant before returning responses
    request = await approval_service.get_request(request_id, tenant_id=tenant_id)
    if not request:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Approval request not found",
        )

    responses = await approval_service.list_responses(request_id)
    return responses


# ==========================================
# Approval Rule Endpoints
# ==========================================

@router.post("/rules", response_model=ApprovalRuleResponse, status_code=status.HTTP_201_CREATED)
async def create_approval_rule(
    data: ApprovalRuleCreate,
    current_user: User = Depends(get_current_user),
    tenant_id: Optional[str] = Depends(get_current_tenant_id),
    db: AsyncSession = Depends(get_db_session),
):
    """
    Create an approval rule.

    Rules define when approval is required and who can approve.
    Only administrators can manage approval rules.
    """
    if not hasattr(current_user, 'role') or current_user.role not in ("admin", "domain_admin"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only administrators can manage approval rules",
        )

    approval_service = ApprovalDBService(db)

    rule = await approval_service.create_rule(
        name=data.name,
        description=data.description,
        tenant_id=tenant_id,
        project_id=data.project_id,
        trigger_type=data.trigger_type,
        conditions=data.conditions,
        approver_roles=data.approver_roles,
        approver_users=data.approver_users,
        required_approvals=data.required_approvals,
        timeout_minutes=data.timeout_minutes,
        timeout_action=data.timeout_action,
    )

    if not rule:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Failed to create approval rule",
        )

    return rule


@router.get("/rules", response_model=List[ApprovalRuleResponse])
async def list_approval_rules(
    project_id: Optional[str] = None,
    trigger_type: Optional[str] = None,
    is_active: bool = True,
    current_user: User = Depends(get_current_user),
    tenant_id: Optional[str] = Depends(get_current_tenant_id),
    db: AsyncSession = Depends(get_db_session),
):
    """
    List approval rules.
    """
    approval_service = ApprovalDBService(db)

    rules = await approval_service.list_rules(
        tenant_id=tenant_id,
        project_id=project_id,
        trigger_type=trigger_type,
        is_active=is_active,
    )
    return rules


@router.get("/rules/{rule_id}", response_model=ApprovalRuleResponse)
async def get_approval_rule(
    rule_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    """
    Get approval rule details.
    """
    approval_service = ApprovalDBService(db)

    rule = await approval_service.get_rule(rule_id)

    if not rule:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Approval rule not found",
        )

    return rule


@router.patch("/rules/{rule_id}", response_model=ApprovalRuleResponse)
async def update_approval_rule(
    rule_id: str,
    data: ApprovalRuleCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    """
    Update an approval rule.

    Only administrators can manage approval rules.
    """
    if not hasattr(current_user, 'role') or current_user.role not in ("admin", "domain_admin"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only administrators can manage approval rules",
        )

    approval_service = ApprovalDBService(db)

    rule = await approval_service.update_rule(
        rule_id=rule_id,
        **data.model_dump(exclude_unset=True),
    )

    if not rule:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Approval rule not found",
        )

    return rule


@router.delete("/rules/{rule_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_approval_rule(
    rule_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    """
    Delete an approval rule.

    Only administrators can manage approval rules.
    """
    if not hasattr(current_user, 'role') or current_user.role not in ("admin", "domain_admin"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only administrators can manage approval rules",
        )

    approval_service = ApprovalDBService(db)

    await approval_service.delete_rule(rule_id)


@router.post("/rules/{rule_id}/toggle", response_model=ApprovalRuleResponse)
async def toggle_approval_rule(
    rule_id: str,
    is_active: bool,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    """
    Enable or disable an approval rule.

    Only administrators can manage approval rules.
    """
    if not hasattr(current_user, 'role') or current_user.role not in ("admin", "domain_admin"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only administrators can manage approval rules",
        )

    approval_service = ApprovalDBService(db)

    rule = await approval_service.toggle_rule(rule_id, is_active)

    if not rule:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Approval rule not found",
        )

    return rule
