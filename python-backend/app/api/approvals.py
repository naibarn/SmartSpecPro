"""
SmartSpec Pro - Approvals API
Phase 3: Human-in-the-loop Approval Endpoints
"""

from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, status, Query
from pydantic import BaseModel, Field
from datetime import datetime
from enum import Enum

from app.core.auth import get_current_user
from app.models.user import User
from app.orchestrator.approval_gates.approval_service import (
    ApprovalService,
    get_approval_service,
)
from app.multitenancy.tenant_context import get_current_tenant_id

router = APIRouter(prefix="/api/v1/approvals")


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
    APPROVE = "approve"
    REJECT = "reject"


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
# Approval Request Endpoints
# ==========================================

@router.post("/requests", response_model=ApprovalRequestResponse, status_code=status.HTTP_201_CREATED)
async def create_approval_request(
    data: ApprovalRequestCreate,
    current_user: User = Depends(get_current_user),
    tenant_id: Optional[str] = Depends(get_current_tenant_id),
    approval_service: ApprovalService = Depends(get_approval_service),
):
    """
    Create a new approval request.
    
    This is typically called by the system when an action requires approval.
    """
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
    approval_service: ApprovalService = Depends(get_approval_service),
):
    """
    List approval requests.
    
    Returns requests that the current user can view or approve.
    """
    requests = await approval_service.list_requests(
        tenant_id=tenant_id,
        status=status_filter.value if status_filter else None,
        request_type=request_type,
        project_id=project_id,
        user_id=current_user.id,
        page=page,
        page_size=page_size,
    )
    
    total = await approval_service.count_requests(
        tenant_id=tenant_id,
        status=status_filter.value if status_filter else None,
        request_type=request_type,
        project_id=project_id,
        user_id=current_user.id,
    )
    
    return ApprovalListResponse(
        requests=requests,
        total=total,
        page=page,
        page_size=page_size,
    )


@router.get("/requests/pending", response_model=List[ApprovalRequestResponse])
async def list_pending_approvals(
    current_user: User = Depends(get_current_user),
    tenant_id: Optional[str] = Depends(get_current_tenant_id),
    approval_service: ApprovalService = Depends(get_approval_service),
):
    """
    List pending approval requests that the current user can approve.
    """
    requests = await approval_service.list_pending_for_user(
        user_id=current_user.id,
        tenant_id=tenant_id,
    )
    return requests


@router.get("/requests/{request_id}", response_model=ApprovalRequestResponse)
async def get_approval_request(
    request_id: str,
    current_user: User = Depends(get_current_user),
    approval_service: ApprovalService = Depends(get_approval_service),
):
    """
    Get approval request details.
    """
    request = await approval_service.get_request(request_id)
    
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
    approval_service: ApprovalService = Depends(get_approval_service),
):
    """
    Respond to an approval request (approve or reject).
    """
    # Check if user can approve
    can_approve = await approval_service.can_user_approve(
        request_id=request_id,
        user_id=current_user.id,
    )
    
    if not can_approve:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You are not authorized to respond to this request",
        )
    
    # Submit response
    request = await approval_service.submit_response(
        request_id=request_id,
        approver_id=current_user.id,
        decision=data.decision.value,
        comment=data.comment,
    )
    
    if not request:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Failed to submit response. Request may already be resolved.",
        )
    
    return request


@router.post("/requests/{request_id}/cancel", response_model=ApprovalRequestResponse)
async def cancel_approval_request(
    request_id: str,
    current_user: User = Depends(get_current_user),
    approval_service: ApprovalService = Depends(get_approval_service),
):
    """
    Cancel an approval request.
    
    Only the requester can cancel a pending request.
    """
    request = await approval_service.get_request(request_id)
    
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
    approval_service: ApprovalService = Depends(get_approval_service),
):
    """
    List responses for an approval request.
    """
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
    approval_service: ApprovalService = Depends(get_approval_service),
):
    """
    Create an approval rule.
    
    Rules define when approval is required and who can approve.
    """
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
    approval_service: ApprovalService = Depends(get_approval_service),
):
    """
    List approval rules.
    """
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
    approval_service: ApprovalService = Depends(get_approval_service),
):
    """
    Get approval rule details.
    """
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
    approval_service: ApprovalService = Depends(get_approval_service),
):
    """
    Update an approval rule.
    """
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
    approval_service: ApprovalService = Depends(get_approval_service),
):
    """
    Delete an approval rule.
    """
    await approval_service.delete_rule(rule_id)


@router.post("/rules/{rule_id}/toggle", response_model=ApprovalRuleResponse)
async def toggle_approval_rule(
    rule_id: str,
    is_active: bool,
    current_user: User = Depends(get_current_user),
    approval_service: ApprovalService = Depends(get_approval_service),
):
    """
    Enable or disable an approval rule.
    """
    rule = await approval_service.toggle_rule(rule_id, is_active)
    
    if not rule:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Approval rule not found",
        )
    
    return rule
