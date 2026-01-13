"""
Approval Service
Phase 3: SaaS Readiness
"""

import structlog
import asyncio
from datetime import datetime, timedelta
from typing import Optional, Dict, Any, List, Callable, Awaitable
from enum import Enum

from .models import (
    ApprovalRequest,
    ApprovalStatus,
    ApprovalType,
    ApprovalDecision,
    ApprovalRule,
    ApprovalPriority,
)

logger = structlog.get_logger(__name__)


class ApprovalService:
    """
    Service for managing approval requests and rules.
    """
    
    def __init__(self):
        """Initialize approval service."""
        # Storage (replace with database in production)
        self._requests: Dict[str, ApprovalRequest] = {}
        self._rules: Dict[str, ApprovalRule] = {}
        
        # Indexes
        self._pending_by_tenant: Dict[str, List[str]] = {}
        self._pending_by_approver: Dict[str, List[str]] = {}
        
        # Callbacks
        self._on_approved: List[Callable[[ApprovalRequest], Awaitable[None]]] = []
        self._on_rejected: List[Callable[[ApprovalRequest], Awaitable[None]]] = []
        self._on_expired: List[Callable[[ApprovalRequest], Awaitable[None]]] = []
        
        # Notification handlers
        self._notifiers: List[Callable[[ApprovalRequest, str], Awaitable[None]]] = []
        
        self._logger = logger.bind(service="approval")
        
        # Initialize default rules
        self._initialize_default_rules()
    
    def _initialize_default_rules(self) -> None:
        """Initialize default approval rules."""
        # High cost operations require approval
        cost_rule = ApprovalRule(
            rule_id="default-cost-threshold",
            name="High Cost Operations",
            description="Operations exceeding cost threshold require approval",
            approval_type=ApprovalType.COST_THRESHOLD,
            operation_pattern="*",
            conditions={
                "estimated_cost": {"$gte": 10.0},
            },
            required_approvers=1,
            approver_roles=["admin", "billing_admin"],
            timeout_hours=4,
            priority=100,
        )
        self._rules[cost_rule.rule_id] = cost_rule
        
        # Production deployments require approval
        deploy_rule = ApprovalRule(
            rule_id="default-production-deploy",
            name="Production Deployments",
            description="Deployments to production require approval",
            approval_type=ApprovalType.CODE_DEPLOYMENT,
            operation_pattern="deploy_*",
            conditions={
                "environment": ["production", "prod"],
            },
            required_approvers=2,
            approver_roles=["admin", "developer"],
            timeout_hours=24,
            priority=90,
        )
        self._rules[deploy_rule.rule_id] = deploy_rule
        
        # Security operations require approval
        security_rule = ApprovalRule(
            rule_id="default-security-ops",
            name="Security Operations",
            description="Security-sensitive operations require approval",
            approval_type=ApprovalType.SECURITY_OPERATION,
            operation_pattern="*",
            conditions={
                "risk_level": ["high", "critical"],
            },
            required_approvers=1,
            approver_roles=["admin", "security_admin"],
            timeout_hours=2,
            priority=200,
        )
        self._rules[security_rule.rule_id] = security_rule
    
    # ==================== Rule Management ====================
    
    async def create_rule(self, rule: ApprovalRule) -> ApprovalRule:
        """Create a new approval rule."""
        self._rules[rule.rule_id] = rule
        self._logger.info(
            "rule_created",
            rule_id=rule.rule_id,
            name=rule.name,
        )
        return rule
    
    async def update_rule(
        self,
        rule_id: str,
        updates: Dict[str, Any],
    ) -> Optional[ApprovalRule]:
        """Update an approval rule."""
        rule = self._rules.get(rule_id)
        if not rule:
            return None
        
        allowed_fields = [
            "name", "description", "conditions", "required_approvers",
            "approver_roles", "specific_approvers", "timeout_hours",
            "auto_approve_enabled", "auto_approve_after_hours",
            "is_enabled", "priority",
        ]
        
        for field, value in updates.items():
            if field in allowed_fields:
                setattr(rule, field, value)
        
        rule.updated_at = datetime.utcnow()
        self._logger.info("rule_updated", rule_id=rule_id)
        return rule
    
    async def delete_rule(self, rule_id: str) -> bool:
        """Delete an approval rule."""
        if rule_id in self._rules:
            del self._rules[rule_id]
            self._logger.info("rule_deleted", rule_id=rule_id)
            return True
        return False
    
    async def get_rule(self, rule_id: str) -> Optional[ApprovalRule]:
        """Get a rule by ID."""
        return self._rules.get(rule_id)
    
    async def list_rules(
        self,
        tenant_id: Optional[str] = None,
        approval_type: Optional[ApprovalType] = None,
        enabled_only: bool = True,
    ) -> List[ApprovalRule]:
        """List approval rules."""
        rules = list(self._rules.values())
        
        if tenant_id:
            rules = [
                r for r in rules
                if r.tenant_id is None or r.tenant_id == tenant_id
            ]
        
        if approval_type:
            rules = [r for r in rules if r.approval_type == approval_type]
        
        if enabled_only:
            rules = [r for r in rules if r.is_enabled]
        
        # Sort by priority
        rules.sort(key=lambda r: r.priority, reverse=True)
        return rules
    
    # ==================== Request Management ====================
    
    async def check_approval_required(
        self,
        approval_type: ApprovalType,
        operation: str,
        context: Dict[str, Any],
        tenant_id: Optional[str] = None,
    ) -> Optional[ApprovalRule]:
        """
        Check if approval is required for an operation.
        
        Args:
            approval_type: Type of approval
            operation: Operation name
            context: Operation context
            tenant_id: Tenant ID
        
        Returns:
            Matching rule if approval required, None otherwise
        """
        rules = await self.list_rules(tenant_id, approval_type)
        
        for rule in rules:
            if rule.matches(approval_type, operation, context):
                self._logger.debug(
                    "approval_required",
                    rule_id=rule.rule_id,
                    operation=operation,
                )
                return rule
        
        return None
    
    async def create_request(
        self,
        approval_type: ApprovalType,
        operation: str,
        operation_data: Dict[str, Any],
        requester_id: str,
        tenant_id: Optional[str] = None,
        title: Optional[str] = None,
        description: Optional[str] = None,
        priority: ApprovalPriority = ApprovalPriority.MEDIUM,
        risk_level: str = "medium",
        risk_factors: Optional[List[str]] = None,
        **kwargs,
    ) -> ApprovalRequest:
        """
        Create an approval request.
        
        Args:
            approval_type: Type of approval
            operation: Operation name
            operation_data: Operation data
            requester_id: Requester ID
            tenant_id: Tenant ID
            title: Request title
            description: Request description
            priority: Priority level
            risk_level: Risk level
            risk_factors: Risk factors
            **kwargs: Additional fields
        
        Returns:
            Created approval request
        """
        # Check for matching rule
        context = {
            **operation_data,
            "risk_level": risk_level,
        }
        rule = await self.check_approval_required(
            approval_type, operation, context, tenant_id
        )
        
        if rule:
            # Create request from rule
            request = rule.create_request(
                requester_id=requester_id,
                operation=operation,
                operation_data=operation_data,
                tenant_id=tenant_id,
                title=title,
                description=description,
                priority=priority,
                risk_level=risk_level,
                risk_factors=risk_factors or [],
                **kwargs,
            )
        else:
            # Create request with defaults
            request = ApprovalRequest(
                tenant_id=tenant_id,
                approval_type=approval_type,
                title=title or f"Approval required for {operation}",
                description=description or "",
                priority=priority,
                requester_id=requester_id,
                operation=operation,
                operation_data=operation_data,
                risk_level=risk_level,
                risk_factors=risk_factors or [],
                **kwargs,
            )
        
        # Store request
        self._requests[request.request_id] = request
        
        # Update indexes
        if tenant_id:
            if tenant_id not in self._pending_by_tenant:
                self._pending_by_tenant[tenant_id] = []
            self._pending_by_tenant[tenant_id].append(request.request_id)
        
        self._logger.info(
            "request_created",
            request_id=request.request_id,
            approval_type=approval_type.value,
            operation=operation,
            requester_id=requester_id,
        )
        
        # Send notifications
        await self._notify_approvers(request, "created")
        
        return request
    
    async def get_request(self, request_id: str) -> Optional[ApprovalRequest]:
        """Get a request by ID."""
        request = self._requests.get(request_id)
        
        # Check for expiration
        if request and request.is_expired() and request.status == ApprovalStatus.PENDING:
            request.status = ApprovalStatus.EXPIRED
            await self._trigger_expired(request)
        
        return request
    
    async def list_requests(
        self,
        tenant_id: Optional[str] = None,
        status: Optional[ApprovalStatus] = None,
        approval_type: Optional[ApprovalType] = None,
        requester_id: Optional[str] = None,
        approver_id: Optional[str] = None,
        limit: int = 100,
        offset: int = 0,
    ) -> List[ApprovalRequest]:
        """List approval requests with filtering."""
        requests = list(self._requests.values())
        
        # Apply filters
        if tenant_id:
            requests = [r for r in requests if r.tenant_id == tenant_id]
        
        if status:
            requests = [r for r in requests if r.status == status]
        
        if approval_type:
            requests = [r for r in requests if r.approval_type == approval_type]
        
        if requester_id:
            requests = [r for r in requests if r.requester_id == requester_id]
        
        # Sort by created_at descending
        requests.sort(key=lambda r: r.created_at, reverse=True)
        
        # Apply pagination
        return requests[offset:offset + limit]
    
    async def get_pending_for_approver(
        self,
        user_id: str,
        user_roles: List[str],
        tenant_id: Optional[str] = None,
    ) -> List[ApprovalRequest]:
        """Get pending requests that a user can approve."""
        requests = await self.list_requests(
            tenant_id=tenant_id,
            status=ApprovalStatus.PENDING,
        )
        
        return [
            r for r in requests
            if r.can_approve(user_id, user_roles)
        ]
    
    # ==================== Decision Management ====================
    
    async def approve(
        self,
        request_id: str,
        approver_id: str,
        approver_roles: List[str],
        comment: str = "",
        conditions: Optional[Dict[str, Any]] = None,
    ) -> Optional[ApprovalRequest]:
        """
        Approve a request.
        
        Args:
            request_id: Request ID
            approver_id: Approver ID
            approver_roles: Approver's roles
            comment: Optional comment
            conditions: Optional conditions for approval
        
        Returns:
            Updated request or None if not found/not allowed
        """
        request = await self.get_request(request_id)
        if not request:
            return None
        
        if not request.is_pending():
            self._logger.warning(
                "cannot_approve_non_pending",
                request_id=request_id,
                status=request.status.value,
            )
            return None
        
        if not request.can_approve(approver_id, approver_roles):
            self._logger.warning(
                "approver_not_allowed",
                request_id=request_id,
                approver_id=approver_id,
            )
            return None
        
        # Create decision
        decision = ApprovalDecision(
            approver_id=approver_id,
            status=ApprovalStatus.APPROVED,
            comment=comment,
            conditions=conditions or {},
        )
        
        request.add_decision(decision)
        
        self._logger.info(
            "request_approved",
            request_id=request_id,
            approver_id=approver_id,
            approval_count=request.get_approval_count(),
            required=request.required_approvers,
        )
        
        # Trigger callbacks if fully approved
        if request.status == ApprovalStatus.APPROVED:
            await self._trigger_approved(request)
        
        return request
    
    async def reject(
        self,
        request_id: str,
        approver_id: str,
        approver_roles: List[str],
        comment: str = "",
    ) -> Optional[ApprovalRequest]:
        """
        Reject a request.
        
        Args:
            request_id: Request ID
            approver_id: Approver ID
            approver_roles: Approver's roles
            comment: Rejection reason
        
        Returns:
            Updated request or None if not found/not allowed
        """
        request = await self.get_request(request_id)
        if not request:
            return None
        
        if not request.is_pending():
            return None
        
        if not request.can_approve(approver_id, approver_roles):
            return None
        
        # Create decision
        decision = ApprovalDecision(
            approver_id=approver_id,
            status=ApprovalStatus.REJECTED,
            comment=comment,
        )
        
        request.add_decision(decision)
        
        self._logger.info(
            "request_rejected",
            request_id=request_id,
            approver_id=approver_id,
            reason=comment,
        )
        
        await self._trigger_rejected(request)
        
        return request
    
    async def cancel(
        self,
        request_id: str,
        cancelled_by: str,
        reason: str = "",
    ) -> Optional[ApprovalRequest]:
        """Cancel a pending request."""
        request = await self.get_request(request_id)
        if not request:
            return None
        
        if not request.is_pending():
            return None
        
        # Only requester or admin can cancel
        if cancelled_by != request.requester_id:
            # TODO: Check if admin
            pass
        
        request.status = ApprovalStatus.CANCELLED
        request.completed_at = datetime.utcnow()
        
        self._logger.info(
            "request_cancelled",
            request_id=request_id,
            cancelled_by=cancelled_by,
            reason=reason,
        )
        
        return request
    
    # ==================== Callbacks ====================
    
    def on_approved(
        self,
        callback: Callable[[ApprovalRequest], Awaitable[None]],
    ) -> None:
        """Register callback for approved requests."""
        self._on_approved.append(callback)
    
    def on_rejected(
        self,
        callback: Callable[[ApprovalRequest], Awaitable[None]],
    ) -> None:
        """Register callback for rejected requests."""
        self._on_rejected.append(callback)
    
    def on_expired(
        self,
        callback: Callable[[ApprovalRequest], Awaitable[None]],
    ) -> None:
        """Register callback for expired requests."""
        self._on_expired.append(callback)
    
    def add_notifier(
        self,
        notifier: Callable[[ApprovalRequest, str], Awaitable[None]],
    ) -> None:
        """Add a notification handler."""
        self._notifiers.append(notifier)
    
    async def _trigger_approved(self, request: ApprovalRequest) -> None:
        """Trigger approved callbacks."""
        for callback in self._on_approved:
            try:
                await callback(request)
            except Exception as e:
                self._logger.error(
                    "approved_callback_error",
                    request_id=request.request_id,
                    error=str(e),
                )
        
        await self._notify_approvers(request, "approved")
    
    async def _trigger_rejected(self, request: ApprovalRequest) -> None:
        """Trigger rejected callbacks."""
        for callback in self._on_rejected:
            try:
                await callback(request)
            except Exception as e:
                self._logger.error(
                    "rejected_callback_error",
                    request_id=request.request_id,
                    error=str(e),
                )
        
        await self._notify_approvers(request, "rejected")
    
    async def _trigger_expired(self, request: ApprovalRequest) -> None:
        """Trigger expired callbacks."""
        for callback in self._on_expired:
            try:
                await callback(request)
            except Exception as e:
                self._logger.error(
                    "expired_callback_error",
                    request_id=request.request_id,
                    error=str(e),
                )
        
        await self._notify_approvers(request, "expired")
    
    async def _notify_approvers(
        self,
        request: ApprovalRequest,
        event: str,
    ) -> None:
        """Send notifications to approvers."""
        for notifier in self._notifiers:
            try:
                await notifier(request, event)
            except Exception as e:
                self._logger.error(
                    "notification_error",
                    request_id=request.request_id,
                    event=event,
                    error=str(e),
                )
    
    # ==================== Auto-approval ====================
    
    async def check_auto_approvals(self) -> int:
        """
        Check and process auto-approvals.
        
        Returns:
            Number of auto-approved requests
        """
        count = 0
        now = datetime.utcnow()
        
        for request in list(self._requests.values()):
            if not request.is_pending():
                continue
            
            if request.auto_approve_after:
                auto_approve_time = request.created_at + request.auto_approve_after
                if now >= auto_approve_time:
                    # Check conditions
                    if self._check_auto_approve_conditions(request):
                        request.status = ApprovalStatus.AUTO_APPROVED
                        request.completed_at = now
                        
                        self._logger.info(
                            "auto_approved",
                            request_id=request.request_id,
                        )
                        
                        await self._trigger_approved(request)
                        count += 1
        
        return count
    
    def _check_auto_approve_conditions(self, request: ApprovalRequest) -> bool:
        """Check if auto-approve conditions are met."""
        if not request.auto_approve_conditions:
            return True
        
        # Check each condition
        for key, expected in request.auto_approve_conditions.items():
            actual = request.operation_data.get(key)
            if actual != expected:
                return False
        
        return True


# Global instance
_approval_service: Optional[ApprovalService] = None


def get_approval_service() -> ApprovalService:
    """Get global approval service instance."""
    global _approval_service
    if _approval_service is None:
        _approval_service = ApprovalService()
    return _approval_service
