"""
SmartSpec Pro - Approvals API
Phase 3: Human-in-the-loop Approval Endpoints
"""

import asyncio
import os
import secrets
from datetime import datetime, timezone, timedelta
from enum import Enum
from typing import Literal, Optional
from urllib.parse import urlparse

import httpx
import structlog
from fastapi import APIRouter, Depends, Header, HTTPException, Query, status
from pydantic import BaseModel, ConfigDict, Field, StrictInt, StrictStr
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import get_current_user
from app.core.config import settings
from app.core.database import AsyncSessionLocal
from app.models.approval import ApprovalType
from app.models.user import User
from app.multitenancy.tenant_context import get_current_tenant_id
from app.services.approval_db_service import ApprovalDBService

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
    description: str | None = None
    project_id: str | None = None
    execution_id: str | None = None
    payload: dict = Field(default_factory=dict)
    risk_level: RiskLevel = RiskLevel.MEDIUM
    required_approvers: int = Field(1, ge=1, le=10)
    timeout_minutes: int = Field(60, ge=5, le=10080)  # 5 min to 1 week


class Spec224RecoveryGrantIssue(BaseModel):
    model_config = ConfigDict(extra="forbid", populate_by_name=True)

    idempotency_key: str = Field(..., alias="idempotencyKey", min_length=8, max_length=160)
    scope: dict


@router.post("/spec224/recovery-grants")
async def issue_spec224_recovery_grant(
    request: Spec224RecoveryGrantIssue,
    current_user: User = Depends(get_current_user),
    tenant_id: str | None = Depends(get_current_tenant_id),
    db: AsyncSession = Depends(get_db_session),
):
    """Issue a narrow recovery grant only through the authenticated tenant owner."""
    if not tenant_id:
        raise HTTPException(status_code=400, detail="TENANT_CONTEXT_REQUIRED")
    try:
        return await ApprovalDBService(db).issue_spec224_recovery_grant(
            tenant_id=tenant_id,
            owner_id=int(current_user.id),
            idempotency_key=request.idempotency_key,
            scope=request.scope,
        )
    except PermissionError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


class Spec224RecoveryGrantRevoke(BaseModel):
    reason: str = Field(..., min_length=4, max_length=500)


class Spec224RuntimeBinding(BaseModel):
    model_config = ConfigDict(extra="forbid", populate_by_name=True)

    tenant_id: StrictStr = Field(..., alias="tenantId", min_length=1, max_length=255)
    owner_id: StrictInt = Field(..., alias="ownerId", gt=0)
    run_id: StrictStr = Field(..., alias="runId", min_length=1, max_length=255)
    worker_job_id: StrictStr = Field(..., alias="workerJobId", min_length=1, max_length=255)
    attempt: StrictInt = Field(..., ge=1)
    revision: StrictInt = Field(..., ge=0)
    decision_epoch: StrictInt = Field(..., alias="decisionEpoch", ge=0)
    development_run_fencing_version: StrictInt = Field(..., alias="developmentRunFencingVersion", ge=0)
    worker_job_fencing_version: StrictInt = Field(..., alias="workerJobFencingVersion", ge=0)
    runner_id: StrictStr = Field(..., alias="runnerId", min_length=1, max_length=255)
    runner_session_id: StrictStr = Field(..., alias="runnerSessionId", min_length=1, max_length=255)
    capability_snapshot_id: StrictStr = Field(..., alias="capabilitySnapshotId", min_length=1, max_length=255)
    capability_snapshot_revision: StrictStr = Field(..., alias="capabilitySnapshotRevision", min_length=1, max_length=255)


class Spec224AdmissionBinding(BaseModel):
    """Immutable profile/bundle/attestation identity expected by a protected grant."""
    model_config = ConfigDict(extra="forbid", populate_by_name=True)

    tenant_id: StrictStr = Field(..., alias="tenantId", min_length=1, max_length=36)
    owner_id: StrictInt = Field(..., alias="ownerId", gt=0)
    run_id: StrictStr = Field(..., alias="runId", min_length=1, max_length=255)
    worker_job_id: StrictStr = Field(..., alias="workerJobId", min_length=1, max_length=255)
    work_package_id: StrictStr = Field(..., alias="workPackageId", min_length=6, max_length=84)
    attempt_id: StrictStr = Field(..., alias="attemptId", min_length=1, max_length=255)
    attempt: StrictInt = Field(..., ge=1)
    revision: StrictInt = Field(..., ge=0)
    decision_epoch: StrictInt = Field(..., alias="decisionEpoch", ge=0)
    development_run_fencing_version: StrictInt = Field(..., alias="developmentRunFencingVersion", ge=0)
    worker_job_fencing_version: StrictInt = Field(..., alias="workerJobFencingVersion", ge=0)
    source_commit: StrictStr = Field(..., alias="sourceCommit", pattern=r"^[0-9a-f]{40,64}$")
    source_tree: StrictStr = Field(..., alias="sourceTree", pattern=r"^[0-9a-f]{40,64}$")
    source_sha256: StrictStr = Field(..., alias="sourceSha256", pattern=r"^[0-9a-f]{64}$")
    source_manifest_digest: StrictStr = Field(..., alias="sourceManifestDigest", pattern=r"^[0-9a-f]{64}$")
    profile_id: StrictStr = Field(..., alias="profileId", min_length=1, max_length=255)
    profile_version: StrictInt = Field(..., alias="profileVersion", ge=1)
    profile_digest: StrictStr = Field(..., alias="profileDigest", pattern=r"^[0-9a-f]{64}$")
    bundle_digest: StrictStr = Field(..., alias="bundleDigest", pattern=r"^[0-9a-f]{64}$")
    artifact_evidence_digest: StrictStr = Field(..., alias="artifactEvidenceDigest", pattern=r"^[0-9a-f]{64}$")
    attestation_id: StrictStr = Field(..., alias="attestationId", pattern=r"^[0-9a-f]{64}$")
    runner_id: StrictStr = Field(..., alias="runnerId", min_length=1, max_length=255)
    runner_session_id: StrictStr = Field(..., alias="runnerSessionId", min_length=1, max_length=255)
    capability_snapshot_id: StrictStr = Field(..., alias="capabilitySnapshotId", min_length=1, max_length=255)
    capability_snapshot_revision: StrictStr = Field(..., alias="capabilitySnapshotRevision", min_length=1, max_length=255)


class Spec224RecoveryGrantValidation(BaseModel):
    model_config = ConfigDict(extra="forbid", populate_by_name=True)

    schema_version: Literal["spec224.recovery-grant-validation.v1"] = Field(..., alias="schemaVersion")
    grant_id: str = Field(..., alias="grantId", min_length=36, max_length=36)
    tenant_id: str = Field(..., alias="tenantId", min_length=1, max_length=36)
    source_commit: str = Field(..., alias="sourceCommit", min_length=40, max_length=64)
    source_sha256: str = Field(..., alias="sourceSha256", min_length=64, max_length=64)
    workpackage_id: str = Field(..., alias="workpackageId", min_length=6, max_length=84)
    operation: str = Field(..., min_length=1, max_length=64)
    path: str = Field(..., min_length=1, max_length=500)
    runtime_scope: str = Field(..., alias="runtimeScope", min_length=1, max_length=64)
    environment_scope: str = Field(..., alias="environmentScope", min_length=1, max_length=64)
    runtime_binding: Optional[Spec224RuntimeBinding] = Field(default=None, alias="runtimeBinding")
    admission_binding: Optional[Spec224AdmissionBinding] = Field(default=None, alias="admissionBinding")

class ApprovalRequestResponse(BaseModel):
    """Response model for approval request."""
    id: str
    request_type: str
    title: str
    description: str | None
    tenant_id: str | None
    project_id: str | None
    execution_id: str | None
    requester_id: str | None
    requester_type: str
    status: ApprovalStatus
    payload: dict
    extra_data: dict = Field(default_factory=dict)
    action_digest: str | None = None
    correlation_key: str | None = None
    risk_level: RiskLevel
    required_approvers: int
    current_approvals: int
    expires_at: datetime | None
    created_at: datetime
    resolved_at: datetime | None

    class Config:
        from_attributes = True


class ApprovalResponseCreate(BaseModel):
    """Request model for responding to an approval request."""
    decision: ApprovalDecision
    comment: str | None = None


class ApprovalResponseModel(BaseModel):
    """Response model for approval response."""
    id: str
    request_id: str
    approver_id: str
    decision: str
    comment: str | None
    created_at: datetime

    class Config:
        from_attributes = True


class ApprovalRuleCreate(BaseModel):
    """Request model for creating an approval rule."""
    name: str = Field(..., min_length=2, max_length=100)
    description: str | None = None
    project_id: str | None = None
    trigger_type: str = Field(..., min_length=2, max_length=50)
    conditions: dict = Field(default_factory=dict)
    approver_roles: list[str] = Field(default_factory=list)
    approver_users: list[str] = Field(default_factory=list)
    required_approvals: int = Field(1, ge=1, le=10)
    timeout_minutes: int = Field(60, ge=5, le=10080)
    timeout_action: str = Field("reject", pattern=r"^(approve|reject|escalate)$")


class ApprovalRuleResponse(BaseModel):
    """Response model for approval rule."""
    id: str
    name: str
    description: str | None
    tenant_id: str | None
    project_id: str | None
    trigger_type: str
    conditions: dict
    approver_roles: list[str]
    approver_users: list[str]
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
    requests: list[ApprovalRequestResponse]
    total: int
    page: int
    page_size: int


class P213CertificationApprovalCreate(BaseModel):
    """Closed server-to-server input for the P213 certification seam."""
    tenant_id: str = Field(..., alias="tenantId", min_length=1, max_length=36)
    requester_id: int = Field(..., alias="requesterId", ge=1)
    project_ref: str = Field(..., alias="projectRef", min_length=1, max_length=160)
    purpose: Literal["p213_certification"]
    fixture: Literal["approval_required"]
    risk_class: Literal["explicit_approval_test"] = Field(alias="riskClass")
    issued_by: Literal["server"] = Field(alias="issuedBy")
    job_id: str = Field(..., alias="jobId", min_length=1, max_length=36)
    operation_key: str = Field(..., alias="operationKey", min_length=1, max_length=200)
    runner_id: str = Field(..., alias="runnerId", min_length=1, max_length=160)
    runner_session_id: str = Field(..., alias="runnerSessionId", min_length=1, max_length=160)
    capability_snapshot_id: str = Field(..., alias="capabilitySnapshotId", min_length=1, max_length=160)
    capability_snapshot_revision: str = Field(..., alias="capabilitySnapshotRevision", min_length=1, max_length=160)
    fencing_version: int = Field(..., alias="fencingVersion", ge=0)
    action_id: str = Field(..., alias="actionId", min_length=1, max_length=255)
    action_description: str = Field(..., alias="actionDescription", min_length=1, max_length=500)
    action_digest: str = Field(..., alias="actionDigest", min_length=1, max_length=255)
    dom_fingerprint: str = Field(..., alias="domFingerprint", min_length=1, max_length=255)
    screenshot_hash: str | None = Field(default=None, alias="screenshotHash", max_length=255)
    correlation_key: str = Field(..., alias="correlationKey", min_length=1, max_length=255)
    approvers: list[int] = Field(default_factory=list, max_length=10)

    class Config:
        populate_by_name = True


class Spec224ExternalAgentApprovalCreate(BaseModel):
    """Closed server-to-server input for an external-agent approval pause."""
    tenant_id: str = Field(..., alias="tenantId", min_length=1, max_length=36)
    requester_id: int = Field(..., alias="requesterId", ge=1)
    job_id: str = Field(..., alias="jobId", min_length=1, max_length=36)
    operation_key: str = Field(..., alias="operationKey", min_length=1, max_length=200)
    provider: Literal["codex", "claude_code"]
    provider_request_id: str = Field(..., alias="providerRequestId", min_length=1, max_length=255)
    runner_id: str = Field(..., alias="runnerId", min_length=1, max_length=160)
    runner_session_id: str = Field(..., alias="runnerSessionId", min_length=1, max_length=160)
    capability_snapshot_id: str = Field(..., alias="capabilitySnapshotId", min_length=1, max_length=160)
    capability_snapshot_revision: str = Field(..., alias="capabilitySnapshotRevision", min_length=1, max_length=160)
    fencing_version: int = Field(..., alias="fencingVersion", ge=0)
    action_id: str = Field(..., alias="actionId", min_length=1, max_length=255)
    semantic_state: dict = Field(default_factory=dict, alias="semanticState")
    correlation_key: str = Field(..., alias="correlationKey", min_length=1, max_length=255)
    approvers: list[int] = Field(default_factory=list, max_length=10)

    class Config:
        populate_by_name = True


class Spec224DecisionDeliveryAck(BaseModel):
    tenant_id: str = Field(..., alias="tenantId", min_length=1, max_length=36)
    job_id: str = Field(..., alias="jobId", min_length=1, max_length=36)
    operation_id: str = Field(..., alias="operationId", min_length=1, max_length=200)
    delivery_id: str = Field(..., alias="deliveryId", min_length=1, max_length=100)
    payload_digest: str = Field(..., alias="payloadDigest", pattern=r"^[a-f0-9]{64}$")
    lease_owner: str = Field(..., alias="leaseOwner", min_length=1, max_length=160)
    lease_epoch: int = Field(..., alias="leaseEpoch", ge=1)
    receipt: dict

    class Config:
        populate_by_name = True


class Spec224DecisionDeliveryClaim(BaseModel):
    worker_id: str = Field(..., alias="workerId", min_length=1, max_length=160)
    limit: int = Field(25, ge=1, le=100)
    lease_seconds: int = Field(60, alias="leaseSeconds", ge=5, le=300)

    class Config:
        populate_by_name = True


def _assert_spec224_gateway_token(token: Optional[str]) -> None:
    expected = str(
        getattr(settings, "SMARTSPEC_WEB_GATEWAY_TOKEN", "")
        or getattr(settings, "SMARTSPEC_PROXY_TOKEN", "")
        or ""
    ).strip()
    if not expected or not token or not secrets.compare_digest(token, expected):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid internal token")


def _assert_spec224_recovery_grant_gateway_token(token: Optional[str]) -> None:
    """Restrict grant validation to the existing SmartSpec Web gateway credential."""
    expected = str(getattr(settings, "SMARTSPEC_WEB_GATEWAY_TOKEN", "") or "").strip()
    if not expected or not token or not secrets.compare_digest(token, expected):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid internal token")


def _assert_spec224_external_payload_safe(value, depth: int = 0) -> None:
    if depth > 6:
        raise ValueError("SPEC224_APPROVAL_PAYLOAD_TOO_DEEP")
    if isinstance(value, list):
        for child in value:
            _assert_spec224_external_payload_safe(child, depth + 1)
        return
    if not isinstance(value, dict):
        return
    for key, child in value.items():
        if any(marker in str(key).lower() for marker in ("token", "secret", "password", "credential", "private_key", "api_key", "authorization")):
            raise ValueError("SPEC224_APPROVAL_SECRET_FIELD")
        _assert_spec224_external_payload_safe(child, depth + 1)


def _spec224_external_resume_payload(
    request: Spec224ExternalAgentApprovalCreate,
    *,
    approval_request_id: str,
    decision: str,
    approver_id: int,
) -> dict:
    _assert_spec224_external_payload_safe(request.semantic_state)
    return {
        "jobId": request.job_id,
        "tenantId": request.tenant_id,
        "operationKey": request.operation_key,
        "provider": request.provider,
        "providerRequestId": request.provider_request_id,
        "runnerId": request.runner_id,
        "runnerSessionId": request.runner_session_id,
        "capabilitySnapshotId": request.capability_snapshot_id,
        "capabilitySnapshotRevision": request.capability_snapshot_revision,
        "fencingVersion": request.fencing_version,
        "actionId": request.action_id,
        "semanticState": request.semantic_state,
        "approvalRequestId": approval_request_id,
        "decision": decision,
        "approverId": approver_id,
    }


def _assert_spec224_external_internal(
    token: str | None, request: Spec224ExternalAgentApprovalCreate
) -> None:
    expected = str(
        getattr(settings, "SMARTSPEC_WEB_GATEWAY_TOKEN", "")
        or getattr(settings, "SMARTSPEC_PROXY_TOKEN", "")
        or ""
    ).strip()
    if not expected or not token or not secrets.compare_digest(token, expected):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid internal token")
    configured_tenant = os.getenv("SMARTSPEC_SPEC224_EXTERNAL_APPROVAL_TENANT_ID", "").strip()
    if not configured_tenant:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="SPEC224_EXTERNAL_APPROVAL_TENANT_NOT_CONFIGURED")
    if configured_tenant != request.tenant_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="SPEC224_EXTERNAL_APPROVAL_TENANT_MISMATCH")
    configured_approver = os.getenv("SMARTSPEC_SPEC224_EXTERNAL_APPROVAL_APPROVER_USER_ID", "").strip()
    try:
        approver_id = int(configured_approver)
    except (TypeError, ValueError):
        approver_id = 0
    if approver_id < 1:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="SPEC224_EXTERNAL_APPROVAL_APPROVER_NOT_CONFIGURED")
    if approver_id == request.requester_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="SPEC224_EXTERNAL_APPROVAL_APPROVER_MUST_BE_DISTINCT")
    if request.approvers != [approver_id]:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="SPEC224_EXTERNAL_APPROVAL_APPROVER_BINDING_MISMATCH")


def _assert_p213_internal(token: str | None, request: P213CertificationApprovalCreate) -> None:
    expected = str(
        getattr(settings, "SMARTSPEC_WEB_GATEWAY_TOKEN", "")
        or getattr(settings, "SMARTSPEC_PROXY_TOKEN", "")
        or ""
    ).strip()
    if os.getenv("P213_CERTIFICATION_MODE") != "true":
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="P213_CERTIFICATION_MODE_DISABLED")
    if not expected or not token or not secrets.compare_digest(token, expected):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid internal token")
    if os.getenv("P213_CERTIFICATION_TENANT_ID", "").strip() != request.tenant_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="P213_CERTIFICATION_TENANT_MISMATCH")
    if os.getenv("P213_CERTIFICATION_REQUESTER_USER_ID", "").strip() != str(request.requester_id):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="P213_CERTIFICATION_REQUESTER_MISMATCH")
    configured_project = os.getenv("P213_CERTIFICATION_PROJECT_REF", "").strip()
    if not configured_project or not request.project_ref.strip():
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="P213_CERTIFICATION_PROJECT_NOT_CONFIGURED")
    if configured_project != request.project_ref.strip():
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="P213_CERTIFICATION_PROJECT_MISMATCH")
    approver_value = os.getenv("P213_CERTIFICATION_APPROVER_USER_ID", "").strip()
    try:
        approver_id = int(approver_value)
    except (TypeError, ValueError):
        approver_id = 0
    if approver_id < 1:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="P213_CERTIFICATION_APPROVER_NOT_CONFIGURED")
    if approver_id == request.requester_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="P213_CERTIFICATION_APPROVER_MUST_BE_DISTINCT")
    if request.approvers != [approver_id]:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="P213_CERTIFICATION_APPROVER_BINDING_MISMATCH")


def _assert_p213_approver_identity(approval_request, approver_id: int, tenant_id: str | None) -> None:
    """Keep the certification-only approver binding ahead of admin bypasses."""
    if os.getenv("P213_CERTIFICATION_MODE") != "true":
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="P213_CERTIFICATION_MODE_DISABLED")
    configured_tenant = os.getenv("P213_CERTIFICATION_TENANT_ID", "").strip()
    if not configured_tenant or approval_request.tenant_id != configured_tenant:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="P213_CERTIFICATION_TENANT_MISMATCH")
    if approval_request.tenant_id != tenant_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="P213_CERTIFICATION_TENANT_MISMATCH")
    configured_value = os.getenv("P213_CERTIFICATION_APPROVER_USER_ID", "").strip()
    try:
        configured_id = int(configured_value)
    except (TypeError, ValueError):
        configured_id = 0
    if configured_id < 1:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="P213_CERTIFICATION_APPROVER_NOT_CONFIGURED")
    if approval_request.requester_id == approver_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="P213_CERTIFICATION_APPROVER_MUST_BE_DISTINCT")
    if approver_id != configured_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="P213_CERTIFICATION_APPROVER_BINDING_MISMATCH")
    extra_data = approval_request.extra_data if isinstance(approval_request.extra_data, dict) else {}
    continuation = extra_data.get("p213WorkerJobResume")
    if not isinstance(continuation, dict):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="P213_CERTIFICATION_RESUME_METADATA_INVALID")
    configured_project = os.getenv("P213_CERTIFICATION_PROJECT_REF", "").strip()
    if not configured_project or continuation.get("projectRef") != configured_project:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="P213_CERTIFICATION_PROJECT_MISMATCH")


# ==========================================
# Workflow Resume Helper
# ==========================================


async def _resume_workflow_after_decision(
    approval_request,
    decision: str,
    approver_id: int,
    comment: str | None,
) -> None:
    """Continue only explicitly identified canonical job-resume requests."""
    extra_data = approval_request.extra_data if isinstance(approval_request.extra_data, dict) else {}
    if isinstance(extra_data.get("spec224ExternalAgentResume"), dict):
        # Spec 224 decisions are committed with a durable delivery intent on the
        # approval authority row. The canonical Feature 186 reconciler delivers
        # and acknowledges that intent; do not launch a fire-and-forget callback.
        _logger.info(
            "spec224_external_decision_delivery_deferred_to_reconciler",
            request_id=approval_request.id,
            job_id=approval_request.execution_id,
        )
        return
    if isinstance(extra_data.get("p213WorkerJobResume"), dict):
        await _resume_p213_worker_job_after_decision(
            approval_request=approval_request,
            decision=decision,
            approver_id=approver_id,
        )
        return

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
        "responded_at": datetime.now(UTC).isoformat(),
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
            from sqlalchemy import select

            from app.core.database import get_db_context
            from app.models.workflow import Workflow
            from app.models.workflow_execution import WorkflowExecution

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
        from sqlalchemy import select

        from app.core.database import get_db_context
        from app.models.workflow_execution import WorkflowExecution

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


async def _resume_p213_worker_job_after_decision(
    approval_request,
    decision: str,
    approver_id: int,
) -> None:
    extra_data = approval_request.extra_data if isinstance(approval_request.extra_data, dict) else {}
    continuation = extra_data.get("p213WorkerJobResume")
    if not isinstance(continuation, dict):
        _logger.error("p213_approval_resume_metadata_missing", request_id=approval_request.id)
        return
    base_url = str(getattr(settings, "SMARTSPEC_WEB_GATEWAY_URL", "") or "").rstrip("/")
    token = str(
        getattr(settings, "SMARTSPEC_WEB_GATEWAY_TOKEN", "")
        or getattr(settings, "SMARTSPEC_PROXY_TOKEN", "")
        or ""
    ).strip()
    parsed_gateway = urlparse(base_url)
    if (
        not base_url
        or parsed_gateway.scheme != "https"
        or not parsed_gateway.hostname
        or parsed_gateway.hostname.lower() in {"localhost", "127.0.0.1", "::1"}
        or not token
    ):
        _logger.error("p213_approval_resume_gateway_not_configured", request_id=approval_request.id)
        return
    payload = {
        **continuation,
        "jobId": approval_request.execution_id,
        "tenantId": approval_request.tenant_id,
        "approvalRequestId": approval_request.id,
        "decision": decision,
        "approverId": approver_id,
    }
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(
                f"{base_url}/api/internal/job-control-plane/approval-decision",
                headers={"x-internal-token": token},
                json=payload,
            )
        if response.status_code >= 400:
            _logger.error(
                "p213_approval_resume_rejected",
                request_id=approval_request.id,
                status=response.status_code,
            )
            return
        _logger.info(
            "p213_approval_resume_submitted",
            request_id=approval_request.id,
            decision=decision,
            job_id=approval_request.execution_id,
        )
    except Exception:
        _logger.exception("p213_approval_resume_failed", request_id=approval_request.id)


def _spec224_external_resume_payload_from_record(
    continuation: dict, approval_request_id: str, decision: str, approver_id: int
) -> dict:
    required = (
        "jobId", "tenantId", "operationKey", "provider", "providerRequestId",
        "runnerId", "runnerSessionId", "capabilitySnapshotId",
        "capabilitySnapshotRevision", "fencingVersion", "actionId", "semanticState",
    )
    if any(key not in continuation for key in required):
        raise ValueError("SPEC224_APPROVAL_RESUME_METADATA_INVALID")
    if continuation["provider"] not in ("codex", "claude_code"):
        raise ValueError("SPEC224_APPROVAL_PROVIDER_INVALID")
    _assert_spec224_external_payload_safe(continuation["semanticState"])
    if decision not in ("approved", "rejected") or not isinstance(approver_id, int) or approver_id < 1:
        raise ValueError("SPEC224_APPROVAL_RESUME_DECISION_INVALID")
    return {
        **{key: continuation[key] for key in required},
        "approvalRequestId": approval_request_id,
        "decision": decision,
        "approverId": approver_id,
        "adapter": "codex.v1" if continuation["provider"] == "codex" else "claude.v1",
    }


async def _resume_spec224_external_agent_after_decision(
    approval_request,
    decision: str,
    approver_id: int,
) -> None:
    extra_data = approval_request.extra_data if isinstance(approval_request.extra_data, dict) else {}
    continuation = extra_data.get("spec224ExternalAgentResume")
    if not isinstance(continuation, dict):
        _logger.error("spec224_external_resume_metadata_missing", request_id=approval_request.id)
        return
    if (
        continuation.get("tenantId") != approval_request.tenant_id
        or continuation.get("jobId") != approval_request.execution_id
    ):
        _logger.error("spec224_external_resume_scope_mismatch", request_id=approval_request.id)
        return
    base_url = str(getattr(settings, "SMARTSPEC_WEB_GATEWAY_URL", "") or "").rstrip("/")
    token = str(
        getattr(settings, "SMARTSPEC_WEB_GATEWAY_TOKEN", "")
        or getattr(settings, "SMARTSPEC_PROXY_TOKEN", "")
        or ""
    ).strip()
    parsed_gateway = urlparse(base_url)
    if (
        not base_url
        or parsed_gateway.scheme != "https"
        or not parsed_gateway.hostname
        or parsed_gateway.hostname.lower() in {"localhost", "127.0.0.1", "::1"}
        or not token
    ):
        _logger.error("spec224_external_resume_gateway_not_configured", request_id=approval_request.id)
        return
    try:
        payload = _spec224_external_resume_payload_from_record(
            continuation, approval_request.id, decision, approver_id
        )
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(
                f"{base_url}/api/internal/job-control-plane/approval-decision",
                headers={"x-internal-token": token},
                json=payload,
            )
        if response.status_code >= 400:
            _logger.error(
                "spec224_external_resume_rejected",
                request_id=approval_request.id,
                status=response.status_code,
            )
            return
        _logger.info(
            "spec224_external_resume_submitted",
            request_id=approval_request.id,
            decision=decision,
            job_id=approval_request.execution_id,
        )
    except Exception:
        _logger.exception("spec224_external_resume_failed", request_id=approval_request.id)


@router.post("/internal/p213/requests")
async def create_p213_certification_approval(
    data: P213CertificationApprovalCreate,
    x_internal_token: str | None = Header(default=None, alias="x-internal-token"),
    db: AsyncSession = Depends(get_db_session),
):
    """Create or reuse one P213 request through the existing ApprovalDBService."""
    _assert_p213_internal(x_internal_token, data)
    approval_service = ApprovalDBService(db)
    existing = await approval_service.get_request_by_correlation(data.correlation_key, data.tenant_id)
    if existing:
        return {
            "approvalRequestId": existing.id,
            "status": existing.status.value,
            "correlationKey": existing.correlation_key or data.correlation_key,
        }

    approvers = [str(value) for value in data.approvers if value > 0]
    extra_data = {
        "approvers": approvers,
        "p213WorkerJobResume": {
            "jobId": data.job_id,
            "tenantId": data.tenant_id,
            "projectRef": data.project_ref,
            "operationKey": data.operation_key,
            "runnerId": data.runner_id,
            "runnerSessionId": data.runner_session_id,
            "capabilitySnapshotId": data.capability_snapshot_id,
            "capabilitySnapshotRevision": data.capability_snapshot_revision,
            "fencingVersion": data.fencing_version,
            "actionId": data.action_id,
        },
    }
    payload = {
        "kind": "p213_certification_approval",
        "purpose": data.purpose,
        "fixture": data.fixture,
        "riskClass": data.risk_class,
        "issuedBy": data.issued_by,
        "projectRef": data.project_ref,
        "jobId": data.job_id,
        "operationKey": data.operation_key,
        "runnerId": data.runner_id,
        "runnerSessionId": data.runner_session_id,
        "capabilitySnapshotId": data.capability_snapshot_id,
        "capabilitySnapshotRevision": data.capability_snapshot_revision,
        "fencingVersion": data.fencing_version,
        "actionId": data.action_id,
        "actionDescription": data.action_description,
        "actionDigest": data.action_digest,
        "domFingerprint": data.dom_fingerprint,
        **({"screenshotHash": data.screenshot_hash} if data.screenshot_hash else {}),
    }
    request = await approval_service.create_request(
        request_type=ApprovalType.CUSTOM,
        title="P213 certification browser action approval",
        description=data.action_description,
        tenant_id=data.tenant_id,
        project_id=data.project_ref,
        requester_id=data.requester_id,
        requester_type="system",
        execution_id=data.job_id,
        payload=payload,
        extra_data=extra_data,
        action_digest=data.action_digest,
        dom_fingerprint=data.dom_fingerprint,
        screenshot_hash=data.screenshot_hash,
        correlation_key=data.correlation_key,
        risk_level="high",
        risk_factors=["p213_certification", data.risk_class],
        required_approvers=1,
        expires_at=datetime.utcnow() + timedelta(minutes=15),
        timeout_action="reject",
    )
    return {
        "approvalRequestId": request.id,
        "status": request.status.value,
        "correlationKey": request.correlation_key or data.correlation_key,
    }


@router.post("/internal/spec224-external/requests")
async def create_spec224_external_agent_approval(
    data: Spec224ExternalAgentApprovalCreate,
    x_internal_token: str | None = Header(default=None, alias="x-internal-token"),
    db: AsyncSession = Depends(get_db_session),
):
    """Create or reuse an external-agent approval in the existing authority."""
    _assert_spec224_external_internal(x_internal_token, data)
    approval_service = ApprovalDBService(db)
    existing = await approval_service.get_request_by_correlation(data.correlation_key, data.tenant_id)
    if existing:
        return {
            "approvalRequestId": existing.id,
            "status": existing.status.value,
            "correlationKey": existing.correlation_key or data.correlation_key,
        }

    _assert_spec224_external_payload_safe(data.semantic_state)
    continuation = {
        "jobId": data.job_id,
        "tenantId": data.tenant_id,
        "requesterId": data.requester_id,
        "operationKey": data.operation_key,
        "provider": data.provider,
        "providerRequestId": data.provider_request_id,
        "runnerId": data.runner_id,
        "runnerSessionId": data.runner_session_id,
        "capabilitySnapshotId": data.capability_snapshot_id,
        "capabilitySnapshotRevision": data.capability_snapshot_revision,
        "fencingVersion": data.fencing_version,
        "actionId": data.action_id,
        "semanticState": data.semantic_state,
    }
    request = await approval_service.create_request(
        request_type=ApprovalType.CODE_EXECUTION,
        title=f"Approve {data.provider} tool request for {data.job_id}",
        description="An external agent requested owner approval for a bounded operation.",
        tenant_id=data.tenant_id,
        requester_id=data.requester_id,
        requester_type="system",
        execution_id=data.job_id,
        payload={
            "kind": "spec224_external_agent_approval",
            "provider": data.provider,
            "operationKey": data.operation_key,
            "spec224ExternalAgentResume": continuation,
        },
        extra_data={"approvers": [str(value) for value in data.approvers], "spec224ExternalAgentResume": continuation},
        correlation_key=data.correlation_key,
        risk_level="high",
        risk_factors=["spec224_external_agent", data.provider],
        required_approvers=1,
        expires_at=datetime.utcnow() + timedelta(minutes=15),
        timeout_action="reject",
    )
    return {
        "approvalRequestId": request.id,
        "status": request.status.value,
        "correlationKey": request.correlation_key or data.correlation_key,
    }


@router.get("/internal/spec224-external/requests/{request_id}/decision")
async def get_spec224_external_agent_decision(
    request_id: str,
    tenant_id: str = Query(..., alias="tenantId", min_length=1, max_length=36),
    job_id: str = Query(..., alias="jobId", min_length=1, max_length=36),
    operation_id: str = Query(..., alias="operationId", min_length=1, max_length=200),
    x_internal_token: Optional[str] = Header(default=None, alias="x-internal-token"),
    db: AsyncSession = Depends(get_db_session),
):
    """Read a decision intent only within its persisted job/tenant/operation scope."""
    _assert_spec224_gateway_token(x_internal_token)
    service = ApprovalDBService(db)
    request = await service.get_request(request_id, tenant_id=tenant_id)
    if not request or request.execution_id != job_id:
        return {"status": "missing", "delivery": None}
    extra_data = request.extra_data if isinstance(request.extra_data, dict) else {}
    correlation = extra_data.get("spec224ExternalAgentResume")
    if (
        not isinstance(correlation, dict)
        or correlation.get("jobId") != job_id
        or correlation.get("tenantId") != tenant_id
        or correlation.get("operationKey") != operation_id
    ):
        return {"status": "missing", "delivery": None}
    correlation = dict(correlation)
    if "requesterId" not in correlation and isinstance(request.requester_id, int):
        correlation["requesterId"] = request.requester_id
    delivery = await service.get_spec224_decision_delivery(
        request_id, tenant_id, job_id, operation_id
    )
    return {"status": request.status.value, "correlation": correlation, "delivery": delivery}


@router.post("/internal/spec224-external/decision-deliveries/claim")
async def claim_spec224_external_decision_deliveries(
    data: Spec224DecisionDeliveryClaim,
    x_internal_token: Optional[str] = Header(default=None, alias="x-internal-token"),
    db: AsyncSession = Depends(get_db_session),
):
    """Claim pending decisions for the already-running Feature 186 reconciler."""
    _assert_spec224_gateway_token(x_internal_token)
    claims = await ApprovalDBService(db).claim_spec224_decision_deliveries(
        worker_id=data.worker_id,
        limit=data.limit,
        lease_seconds=data.lease_seconds,
    )
    return {"claims": claims}


@router.post("/internal/spec224-external/requests/{request_id}/decision/ack")
async def acknowledge_spec224_external_agent_decision(
    request_id: str,
    data: Spec224DecisionDeliveryAck,
    x_internal_token: Optional[str] = Header(default=None, alias="x-internal-token"),
    db: AsyncSession = Depends(get_db_session),
):
    """Persist the canonical control-plane receipt idempotently."""
    _assert_spec224_gateway_token(x_internal_token)
    _assert_spec224_external_payload_safe(data.receipt)
    if (
        set(data.receipt) - {"deliveryId", "payloadDigest", "result", "acknowledgedAt"}
        or data.receipt.get("deliveryId") != data.delivery_id
        or data.receipt.get("payloadDigest") != data.payload_digest
        or data.receipt.get("result") not in {"resumed", "failed", "duplicate", "operator_review", "cancel_requested"}
        or not isinstance(data.receipt.get("acknowledgedAt"), str)
    ):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="SPEC224_DECISION_RECEIPT_MISMATCH")
    acknowledged = await ApprovalDBService(db).acknowledge_spec224_decision_delivery(
        request_id,
        data.tenant_id,
        data.job_id,
        data.operation_id,
        data.delivery_id,
        data.payload_digest,
        data.receipt,
        data.lease_owner,
        data.lease_epoch,
    )
    if not acknowledged:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="SPEC224_DECISION_ACK_REJECTED")
    return {"acknowledged": True, "deliveryId": data.delivery_id}

@router.post("/requests", response_model=ApprovalRequestResponse, status_code=status.HTTP_201_CREATED)
async def create_approval_request(
    data: ApprovalRequestCreate,
    current_user: User = Depends(get_current_user),
    tenant_id: str | None = Depends(get_current_tenant_id),
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
    status_filter: ApprovalStatus | None = None,
    request_type: str | None = None,
    project_id: str | None = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    current_user: User = Depends(get_current_user),
    tenant_id: str | None = Depends(get_current_tenant_id),
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


@router.get("/requests/pending", response_model=list[ApprovalRequestResponse])
async def list_pending_approvals(
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
    current_user: User = Depends(get_current_user),
    tenant_id: str | None = Depends(get_current_tenant_id),
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
    tenant_id: str | None = Depends(get_current_tenant_id),
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
    tenant_id: str | None = Depends(get_current_tenant_id),
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

    extra_data = approval_request.extra_data if isinstance(approval_request.extra_data, dict) else {}
    if isinstance(extra_data.get("p213WorkerJobResume"), dict):
        _assert_p213_approver_identity(approval_request, current_user.id, tenant_id)

    # Check if user is authorized to approve this request
    can_approve = await approval_service.can_user_approve(
        request_id=request_id,
        user_id=current_user.id,
    )

    if not can_approve:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You are not authorized to respond to this request",
        ) from None

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
        ) from None

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
    tenant_id: str | None = Depends(get_current_tenant_id),
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

    cancelled = await approval_service.cancel_request(
        request_id,
        cancelled_by=current_user.id,
        tenant_id=tenant_id,
    )
    if not cancelled:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Approval request changed before cancellation could be persisted",
        )
    return cancelled


@router.get("/requests/{request_id}/responses", response_model=list[ApprovalResponseModel])
async def list_approval_responses(
    request_id: str,
    current_user: User = Depends(get_current_user),
    tenant_id: str | None = Depends(get_current_tenant_id),
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
    tenant_id: str | None = Depends(get_current_tenant_id),
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


@router.get("/rules", response_model=list[ApprovalRuleResponse])
async def list_approval_rules(
    project_id: str | None = None,
    trigger_type: str | None = None,
    is_active: bool = True,
    current_user: User = Depends(get_current_user),
    tenant_id: str | None = Depends(get_current_tenant_id),
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
