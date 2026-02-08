"""
Database-backed Approval Service
Phase 3: SaaS Readiness

This service provides persistent storage for approval requests using SQLAlchemy models.
It complements the in-memory ApprovalService for production use cases.
"""

import structlog
from datetime import datetime, timedelta
from typing import Optional, List
from uuid import uuid4
from sqlalchemy import select, and_, or_
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.approval import (
    ApprovalRequest,
    ApprovalResponse,
    ApprovalStatus,
    ApprovalType,
)

logger = structlog.get_logger(__name__)


class ApprovalDBService:
    """
    Database-backed approval service for persistent approval request storage.

    This service provides CRUD operations for approval requests and responses
    using SQLAlchemy async sessions. It's designed to work alongside or replace
    the in-memory ApprovalService for production environments.
    """

    def __init__(self, db_session: AsyncSession):
        """
        Initialize the approval database service.

        Args:
            db_session: SQLAlchemy async session for database operations
        """
        self.db = db_session
        self._logger = logger.bind(service="approval_db")

    async def create_request(
        self,
        request_type: ApprovalType,
        title: str,
        description: Optional[str] = None,
        tenant_id: Optional[str] = None,
        requester_id: Optional[int] = None,
        requester_type: str = "agent",
        project_id: Optional[str] = None,
        execution_id: Optional[str] = None,
        payload: Optional[dict] = None,
        extra_data: Optional[dict] = None,
        risk_level: str = "medium",
        risk_factors: Optional[List[str]] = None,
        required_approvers: int = 1,
        expires_at: Optional[datetime] = None,
        timeout_action: str = "reject",
    ) -> ApprovalRequest:
        """
        Create a new approval request in the database.

        Args:
            request_type: Type of approval (CODE_EXECUTION, DEPLOYMENT, etc.)
            title: Short title describing the request
            description: Detailed description (optional)
            tenant_id: Tenant ID for multi-tenant isolation
            requester_id: User ID of the requester (if applicable)
            requester_type: Type of requester ("agent", "user", "system")
            project_id: Associated project ID
            execution_id: Associated execution ID
            payload: Request payload data
            extra_data: Additional metadata
            risk_level: Risk level ("low", "medium", "high", "critical")
            risk_factors: List of identified risk factors
            required_approvers: Number of approvals needed
            expires_at: Expiration timestamp (auto-reject after this)
            timeout_action: Action on timeout ("reject", "approve", "escalate")

        Returns:
            Created ApprovalRequest instance
        """
        request_id = str(uuid4())

        # Create request instance
        request = ApprovalRequest(
            id=request_id,
            request_type=request_type,
            title=title,
            description=description,
            tenant_id=tenant_id,
            project_id=project_id,
            execution_id=execution_id,
            requester_id=requester_id,
            requester_type=requester_type,
            status=ApprovalStatus.PENDING,
            payload=payload or {},
            extra_data=extra_data or {},
            risk_level=risk_level,
            risk_factors=risk_factors or [],
            required_approvers=required_approvers,
            current_approvals=0,
            expires_at=expires_at,
            timeout_action=timeout_action,
        )

        # Save to database
        self.db.add(request)
        await self.db.commit()
        await self.db.refresh(request)

        self._logger.info(
            "approval_request_created",
            request_id=request_id,
            request_type=request_type.value,
            title=title,
            tenant_id=tenant_id,
            requester_id=requester_id,
        )

        return request

    async def get_request(self, request_id: str) -> Optional[ApprovalRequest]:
        """
        Retrieve an approval request by ID.

        Args:
            request_id: UUID of the approval request

        Returns:
            ApprovalRequest instance or None if not found
        """
        stmt = select(ApprovalRequest).where(ApprovalRequest.id == request_id)
        result = await self.db.execute(stmt)
        request = result.scalar_one_or_none()

        if request:
            # Check for expiration
            if (
                request.status == ApprovalStatus.PENDING
                and request.expires_at
                and datetime.utcnow() > request.expires_at
            ):
                request.status = ApprovalStatus.EXPIRED
                request.resolved_at = datetime.utcnow()
                await self.db.commit()

                self._logger.info(
                    "approval_request_expired",
                    request_id=request_id,
                    expires_at=request.expires_at.isoformat(),
                )

        return request

    async def list_pending_requests(
        self,
        tenant_id: Optional[str] = None,
        limit: int = 100,
        offset: int = 0,
    ) -> List[ApprovalRequest]:
        """
        List all pending approval requests, optionally filtered by tenant.

        Args:
            tenant_id: Filter by tenant ID (None = all tenants)
            limit: Maximum number of results
            offset: Pagination offset

        Returns:
            List of pending ApprovalRequest instances
        """
        stmt = (
            select(ApprovalRequest)
            .where(ApprovalRequest.status == ApprovalStatus.PENDING)
            .order_by(ApprovalRequest.created_at.desc())
            .limit(limit)
            .offset(offset)
        )

        if tenant_id:
            stmt = stmt.where(ApprovalRequest.tenant_id == tenant_id)

        result = await self.db.execute(stmt)
        requests = result.scalars().all()

        return list(requests)

    async def list_requests(
        self,
        tenant_id: Optional[str] = None,
        status: Optional[ApprovalStatus] = None,
        request_type: Optional[ApprovalType] = None,
        limit: int = 100,
        offset: int = 0,
    ) -> List[ApprovalRequest]:
        """
        List approval requests with optional filters.

        Args:
            tenant_id: Filter by tenant ID
            status: Filter by approval status
            request_type: Filter by request type
            limit: Maximum number of results
            offset: Pagination offset

        Returns:
            List of ApprovalRequest instances
        """
        stmt = (
            select(ApprovalRequest)
            .order_by(ApprovalRequest.created_at.desc())
            .limit(limit)
            .offset(offset)
        )

        filters = []
        if tenant_id:
            filters.append(ApprovalRequest.tenant_id == tenant_id)
        if status:
            filters.append(ApprovalRequest.status == status)
        if request_type:
            filters.append(ApprovalRequest.request_type == request_type)

        if filters:
            stmt = stmt.where(and_(*filters))

        result = await self.db.execute(stmt)
        requests = result.scalars().all()

        return list(requests)

    async def submit_decision(
        self,
        request_id: str,
        approver_id: int,
        decision: str,
        comment: Optional[str] = None,
    ) -> ApprovalResponse:
        """
        Submit an approval decision (approved or rejected).

        Args:
            request_id: UUID of the approval request
            approver_id: User ID of the approver
            decision: Decision ("approved" or "rejected")
            comment: Optional comment explaining the decision

        Returns:
            Created ApprovalResponse instance

        Raises:
            ValueError: If request not found or not in PENDING status
        """
        # Fetch the request
        request = await self.get_request(request_id)
        if not request:
            raise ValueError(f"Approval request {request_id} not found")

        if request.status != ApprovalStatus.PENDING:
            raise ValueError(
                f"Cannot submit decision for request in {request.status.value} status"
            )

        # Create response
        response_id = str(uuid4())
        response = ApprovalResponse(
            id=response_id,
            request_id=request_id,
            approver_id=approver_id,
            decision=decision,
            comment=comment,
        )

        self.db.add(response)

        # Update request based on decision
        if decision == "rejected":
            # Single rejection ends the request
            request.status = ApprovalStatus.REJECTED
            request.resolved_at = datetime.utcnow()
        elif decision == "approved":
            # Increment approval count
            request.current_approvals += 1

            # Check if fully approved
            if request.current_approvals >= request.required_approvers:
                request.status = ApprovalStatus.APPROVED
                request.resolved_at = datetime.utcnow()

        await self.db.commit()
        await self.db.refresh(response)

        self._logger.info(
            "approval_decision_submitted",
            request_id=request_id,
            response_id=response_id,
            approver_id=approver_id,
            decision=decision,
            new_status=request.status.value,
        )

        return response

    async def cleanup_expired_requests(
        self,
        timeout_minutes: int = 10080,  # 7 days default
    ) -> int:
        """
        Mark expired pending requests as EXPIRED.

        Args:
            timeout_minutes: Mark requests pending for longer than this as expired

        Returns:
            Number of requests marked as expired
        """
        cutoff_time = datetime.utcnow() - timedelta(minutes=timeout_minutes)

        stmt = (
            select(ApprovalRequest)
            .where(
                and_(
                    ApprovalRequest.status == ApprovalStatus.PENDING,
                    or_(
                        ApprovalRequest.expires_at < datetime.utcnow(),
                        ApprovalRequest.created_at < cutoff_time,
                    ),
                )
            )
        )

        result = await self.db.execute(stmt)
        expired_requests = result.scalars().all()

        count = 0
        for request in expired_requests:
            request.status = ApprovalStatus.EXPIRED
            request.resolved_at = datetime.utcnow()
            count += 1

        if count > 0:
            await self.db.commit()
            self._logger.info(
                "expired_requests_cleaned_up",
                count=count,
                timeout_minutes=timeout_minutes,
            )

        return count

    async def cancel_request(
        self,
        request_id: str,
        cancelled_by: int,
        reason: Optional[str] = None,
    ) -> Optional[ApprovalRequest]:
        """
        Cancel a pending approval request.

        Args:
            request_id: UUID of the approval request
            cancelled_by: User ID who cancelled the request
            reason: Optional cancellation reason

        Returns:
            Updated ApprovalRequest or None if not found
        """
        request = await self.get_request(request_id)
        if not request:
            return None

        if request.status != ApprovalStatus.PENDING:
            self._logger.warning(
                "cannot_cancel_non_pending_request",
                request_id=request_id,
                status=request.status.value,
            )
            return None

        request.status = ApprovalStatus.CANCELLED
        request.resolved_at = datetime.utcnow()

        await self.db.commit()

        self._logger.info(
            "approval_request_cancelled",
            request_id=request_id,
            cancelled_by=cancelled_by,
            reason=reason,
        )

        return request
