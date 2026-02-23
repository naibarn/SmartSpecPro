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
from app.models.user import User, Role

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
        # Validate required tenant_id for security isolation
        if not tenant_id:
            raise ValueError("tenant_id is required for approval request creation")

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

    async def get_request(self, request_id: str, tenant_id: Optional[str] = None) -> Optional[ApprovalRequest]:
        """
        Retrieve an approval request by ID.

        Args:
            request_id: UUID of the approval request
            tenant_id: Optional tenant ID for security filtering

        Returns:
            ApprovalRequest instance or None if not found
        """
        stmt = select(ApprovalRequest).where(ApprovalRequest.id == request_id)
        if tenant_id:
            stmt = stmt.where(ApprovalRequest.tenant_id == tenant_id)
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
        tenant_id: Optional[str] = None,
        skip_auth_check: bool = False,
    ) -> ApprovalResponse:
        """
        Submit an approval decision (approved or rejected).

        Args:
            request_id: UUID of the approval request
            approver_id: User ID of the approver
            decision: Decision ("approved" or "rejected")
            comment: Optional comment explaining the decision
            tenant_id: Optional tenant ID for security validation
            skip_auth_check: If True, skip can_user_approve() check (for internal/system use only)

        Returns:
            Created ApprovalResponse instance

        Raises:
            ValueError: If request not found or not in PENDING status
            PermissionError: If the user is not authorized to approve this request
        """
        # Validate that the approver is authorized before processing
        if not skip_auth_check:
            can_approve = await self.can_user_approve(
                request_id=request_id,
                user_id=approver_id,
            )
            if not can_approve:
                self._logger.warning(
                    "submit_decision_unauthorized",
                    request_id=request_id,
                    approver_id=approver_id,
                )
                raise PermissionError(
                    f"User {approver_id} is not authorized to approve request {request_id}"
                )

        # Fetch the request with tenant validation
        if tenant_id:
            request = await self.get_request(request_id, tenant_id=tenant_id)
        else:
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

    async def count_requests(
        self,
        tenant_id: Optional[str] = None,
        status: Optional[str] = None,
        request_type: Optional[str] = None,
        project_id: Optional[str] = None,
        user_id: Optional[int] = None,
    ) -> int:
        """
        Count approval requests matching the given filters.

        Args:
            tenant_id: Filter by tenant ID
            status: Filter by approval status
            request_type: Filter by request type
            project_id: Filter by project ID
            user_id: Filter by user ID (for user-specific requests)

        Returns:
            Count of matching requests
        """
        from sqlalchemy import func

        stmt = select(func.count(ApprovalRequest.id))

        filters = []
        if tenant_id:
            filters.append(ApprovalRequest.tenant_id == tenant_id)
        if status:
            filters.append(ApprovalRequest.status == status)
        if request_type:
            filters.append(ApprovalRequest.request_type == request_type)
        if project_id:
            filters.append(ApprovalRequest.project_id == project_id)

        if filters:
            stmt = stmt.where(and_(*filters))

        result = await self.db.execute(stmt)
        count = result.scalar()
        return count or 0

    async def list_pending_for_user(
        self,
        user_id: int,
        tenant_id: Optional[str] = None,
        limit: int = 100,
        offset: int = 0,
    ) -> List[ApprovalRequest]:
        """
        List pending approval requests where the user is a designated approver.

        Filters by the approvers list stored in extra_data->'approvers'.
        If a request has no approvers list in extra_data (legacy/fallback),
        it is still returned for backward compatibility (visible to all
        authenticated users in the tenant).

        Args:
            user_id: User ID to check approval permissions for
            tenant_id: Filter by tenant ID
            limit: Maximum number of results
            offset: Pagination offset

        Returns:
            List of pending ApprovalRequest instances the user can approve
        """
        user_id_str = str(user_id)
        is_admin = await self._is_user_admin(user_id)

        # Portable query path (works across SQLite/Postgres/MySQL):
        # fetch pending requests by tenant, then apply approver filtering in Python.
        stmt = (
            select(ApprovalRequest)
            .where(ApprovalRequest.status == ApprovalStatus.PENDING)
            .order_by(ApprovalRequest.created_at.desc())
        )
        if tenant_id:
            stmt = stmt.where(ApprovalRequest.tenant_id == tenant_id)

        result = await self.db.execute(stmt)
        pending_requests = list(result.scalars().all())

        filtered: List[ApprovalRequest] = []
        for request in pending_requests:
            if is_admin:
                filtered.append(request)
                continue

            extra_data_raw = request.extra_data
            extra_data = extra_data_raw if isinstance(extra_data_raw, dict) else {}
            approvers = extra_data.get("approvers")

            # Legacy fallback: if approvers list is missing/malformed, keep request visible.
            if approvers is None or not isinstance(approvers, list):
                filtered.append(request)
                continue

            if user_id_str in {str(value) for value in approvers}:
                filtered.append(request)

        requests = filtered[offset : offset + limit]

        self._logger.debug(
            "list_pending_for_user",
            user_id=user_id,
            tenant_id=tenant_id,
            count=len(requests),
            total_filtered=len(filtered),
        )

        return list(requests)

    async def _has_already_responded(
        self,
        request_id: str,
        user_id: int,
    ) -> bool:
        """
        Check if a user has already submitted a response for this request.

        Args:
            request_id: UUID of the approval request
            user_id: User ID to check

        Returns:
            True if the user has already responded, False otherwise
        """
        stmt = select(ApprovalResponse).where(
            and_(
                ApprovalResponse.request_id == request_id,
                ApprovalResponse.approver_id == user_id,
            )
        )
        result = await self.db.execute(stmt)
        return result.scalar_one_or_none() is not None

    async def _is_user_admin(self, user_id: int) -> bool:
        """
        Check if a user has admin or domain_admin role.

        Args:
            user_id: User ID to check

        Returns:
            True if the user is an admin or domain_admin
        """
        stmt = select(User).where(User.id == user_id)
        result = await self.db.execute(stmt)
        user = result.scalar_one_or_none()
        if not user:
            return False
        return user.role in (Role.admin, Role.domain_admin)

    async def can_user_approve(
        self,
        request_id: str,
        user_id: int,
    ) -> bool:
        """
        Check if a user is authorized to approve a specific request.

        Authorization is granted if ALL of the following are true:
        1. The request exists and is in PENDING status
        2. The user has not already responded to this request
        3. The user is listed in extra_data['approvers'] OR has admin/domain_admin role

        Args:
            request_id: UUID of the approval request
            user_id: User ID to check permissions for

        Returns:
            True if user can approve, False otherwise
        """
        # Check if request exists and is pending
        request = await self.get_request(request_id)
        if not request:
            self._logger.debug(
                "can_user_approve_request_not_found",
                request_id=request_id,
                user_id=user_id,
            )
            return False
        if request.status != ApprovalStatus.PENDING:
            self._logger.debug(
                "can_user_approve_not_pending",
                request_id=request_id,
                user_id=user_id,
                status=request.status.value,
            )
            return False

        # Check if user has already responded to this request
        if await self._has_already_responded(request_id, user_id):
            self._logger.info(
                "can_user_approve_already_responded",
                request_id=request_id,
                user_id=user_id,
            )
            return False

        # Prevent self-approval (requester cannot approve their own request)
        if request.requester_id is not None and str(user_id) == str(request.requester_id):
            self._logger.info(
                "can_user_approve_self_approval_blocked",
                request_id=request_id,
                user_id=user_id,
            )
            return False

        # Admin/domain_admin users can always approve (bypass approver list)
        if await self._is_user_admin(user_id):
            self._logger.debug(
                "can_user_approve_admin_bypass",
                request_id=request_id,
                user_id=user_id,
            )
            return True

        # Check if user is in the designated approvers list from extra_data
        extra_data = request.extra_data or {}
        approvers = extra_data.get("approvers")

        if approvers is not None:
            # approvers is a list of user ID strings, e.g. ["1", "5", "12"]
            user_id_str = str(user_id)
            if user_id_str not in approvers:
                self._logger.info(
                    "can_user_approve_not_in_approvers_list",
                    request_id=request_id,
                    user_id=user_id,
                    approvers_count=len(approvers),
                )
                return False

        # If no approvers list is set in extra_data, allow any authenticated user
        # (backwards-compatible behavior for requests created without an approvers list)
        return True

    async def submit_response(
        self,
        request_id: str,
        approver_id: int,
        decision: str,
        comment: Optional[str] = None,
    ) -> Optional[ApprovalRequest]:
        """
        Submit an approval response and update request status.

        This is an alias for submit_decision that returns the updated request.
        Authorization is enforced via submit_decision -> can_user_approve().

        Args:
            request_id: UUID of the approval request
            approver_id: User ID of the approver
            decision: Decision ("approved" or "rejected")
            comment: Optional comment explaining the decision

        Returns:
            Updated ApprovalRequest or None if failed

        Raises:
            PermissionError: If the user is not authorized to approve this request
        """
        try:
            await self.submit_decision(
                request_id=request_id,
                approver_id=approver_id,
                decision=decision,
                comment=comment,
            )
            # Return the updated request
            return await self.get_request(request_id)
        except PermissionError:
            # Re-raise authorization errors so callers can return 403
            raise
        except ValueError as e:
            self._logger.warning(
                "submit_response_failed",
                request_id=request_id,
                error=str(e),
            )
            return None

    async def list_responses(
        self,
        request_id: str,
    ) -> List[ApprovalResponse]:
        """
        List all responses for a specific approval request.

        Args:
            request_id: UUID of the approval request

        Returns:
            List of ApprovalResponse instances
        """
        stmt = (
            select(ApprovalResponse)
            .where(ApprovalResponse.request_id == request_id)
            .order_by(ApprovalResponse.created_at.asc())
        )
        result = await self.db.execute(stmt)
        responses = result.scalars().all()
        return list(responses)

    async def cancel_request(
        self,
        request_id: str,
        cancelled_by: int,
        reason: Optional[str] = None,
        tenant_id: Optional[str] = None,
    ) -> Optional[ApprovalRequest]:
        """
        Cancel a pending approval request.

        Args:
            request_id: UUID of the approval request
            cancelled_by: User ID who cancelled the request
            reason: Optional cancellation reason
            tenant_id: Optional tenant ID for security validation

        Returns:
            Updated ApprovalRequest or None if not found
        """
        request = await self.get_request(request_id, tenant_id=tenant_id)
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

    # ==========================================
    # Approval Rule Methods (Stub implementations)
    # ==========================================

    async def create_rule(self, **kwargs):
        """
        Create an approval rule.
        Stub implementation - to be implemented with ApprovalRule model.
        """
        self._logger.warning("create_rule_not_implemented", kwargs=kwargs)
        raise NotImplementedError("Approval rules are not yet implemented")

    async def list_rules(
        self,
        tenant_id: Optional[str] = None,
        project_id: Optional[str] = None,
        trigger_type: Optional[str] = None,
        is_active: bool = True,
    ):
        """
        List approval rules.
        Stub implementation - returns empty list.
        """
        self._logger.debug("list_rules_stub_called")
        return []

    async def get_rule(self, rule_id: str):
        """
        Get approval rule by ID.
        Stub implementation - returns None.
        """
        self._logger.debug("get_rule_stub_called", rule_id=rule_id)
        return None

    async def update_rule(self, rule_id: str, **kwargs):
        """
        Update an approval rule.
        Stub implementation - to be implemented.
        """
        self._logger.warning("update_rule_not_implemented", rule_id=rule_id)
        raise NotImplementedError("Approval rules are not yet implemented")

    async def delete_rule(self, rule_id: str):
        """
        Delete an approval rule.
        Stub implementation - to be implemented.
        """
        self._logger.debug("delete_rule_stub_called", rule_id=rule_id)
        pass  # No-op for now

    async def toggle_rule(self, rule_id: str, is_active: bool):
        """
        Toggle approval rule active status.
        Stub implementation - returns None.
        """
        self._logger.debug("toggle_rule_stub_called", rule_id=rule_id, is_active=is_active)
        return None
