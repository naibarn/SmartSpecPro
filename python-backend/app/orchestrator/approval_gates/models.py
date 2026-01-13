"""
Approval Gates Models
Phase 3: SaaS Readiness
"""

from dataclasses import dataclass, field
from datetime import datetime, timedelta
from enum import Enum
from typing import Optional, Dict, Any, List
import uuid


class ApprovalStatus(str, Enum):
    """Status of an approval request."""
    PENDING = "pending"
    APPROVED = "approved"
    REJECTED = "rejected"
    EXPIRED = "expired"
    CANCELLED = "cancelled"
    AUTO_APPROVED = "auto_approved"


class ApprovalType(str, Enum):
    """Types of approval requests."""
    WORKFLOW_EXECUTION = "workflow_execution"
    CODE_DEPLOYMENT = "code_deployment"
    COST_THRESHOLD = "cost_threshold"
    SECURITY_OPERATION = "security_operation"
    DATA_ACCESS = "data_access"
    CONFIGURATION_CHANGE = "configuration_change"
    USER_ACTION = "user_action"
    EXTERNAL_API_CALL = "external_api_call"
    FILE_OPERATION = "file_operation"
    CUSTOM = "custom"


class ApprovalPriority(str, Enum):
    """Priority levels for approval requests."""
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"


@dataclass
class ApprovalDecision:
    """
    A decision made on an approval request.
    """
    
    decision_id: str = field(default_factory=lambda: str(uuid.uuid4()))
    approver_id: str = ""
    approver_email: Optional[str] = None
    approver_name: Optional[str] = None
    
    # Decision
    status: ApprovalStatus = ApprovalStatus.PENDING
    comment: str = ""
    
    # Conditions (for conditional approval)
    conditions: Dict[str, Any] = field(default_factory=dict)
    
    # Timestamps
    decided_at: datetime = field(default_factory=datetime.utcnow)
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary."""
        return {
            "decision_id": self.decision_id,
            "approver_id": self.approver_id,
            "approver_email": self.approver_email,
            "approver_name": self.approver_name,
            "status": self.status.value,
            "comment": self.comment,
            "conditions": self.conditions,
            "decided_at": self.decided_at.isoformat(),
        }


@dataclass
class ApprovalRequest:
    """
    An approval request for human-in-the-loop operations.
    """
    
    request_id: str = field(default_factory=lambda: str(uuid.uuid4()))
    
    # Context
    tenant_id: Optional[str] = None
    project_id: Optional[str] = None
    workflow_id: Optional[str] = None
    task_id: Optional[str] = None
    
    # Request details
    approval_type: ApprovalType = ApprovalType.CUSTOM
    title: str = ""
    description: str = ""
    priority: ApprovalPriority = ApprovalPriority.MEDIUM
    
    # Requester
    requester_id: str = ""
    requester_email: Optional[str] = None
    requester_name: Optional[str] = None
    
    # Operation details
    operation: str = ""  # e.g., "execute_workflow", "deploy_code"
    operation_data: Dict[str, Any] = field(default_factory=dict)
    
    # Risk assessment
    risk_level: str = "medium"  # low, medium, high, critical
    risk_factors: List[str] = field(default_factory=list)
    
    # Approval requirements
    required_approvers: int = 1
    approver_roles: List[str] = field(default_factory=list)  # Roles that can approve
    specific_approvers: List[str] = field(default_factory=list)  # Specific user IDs
    
    # Status
    status: ApprovalStatus = ApprovalStatus.PENDING
    decisions: List[ApprovalDecision] = field(default_factory=list)
    
    # Timing
    created_at: datetime = field(default_factory=datetime.utcnow)
    expires_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    
    # Auto-approval settings
    auto_approve_after: Optional[timedelta] = None
    auto_approve_conditions: Dict[str, Any] = field(default_factory=dict)
    
    # Callback
    callback_url: Optional[str] = None
    callback_data: Dict[str, Any] = field(default_factory=dict)
    
    def __post_init__(self):
        """Set default expiration if not set."""
        if self.expires_at is None:
            # Default 24 hour expiration
            self.expires_at = self.created_at + timedelta(hours=24)
    
    def is_expired(self) -> bool:
        """Check if request has expired."""
        if self.expires_at is None:
            return False
        return datetime.utcnow() > self.expires_at
    
    def is_pending(self) -> bool:
        """Check if request is still pending."""
        return self.status == ApprovalStatus.PENDING and not self.is_expired()
    
    def get_approval_count(self) -> int:
        """Get number of approvals."""
        return sum(
            1 for d in self.decisions
            if d.status == ApprovalStatus.APPROVED
        )
    
    def get_rejection_count(self) -> int:
        """Get number of rejections."""
        return sum(
            1 for d in self.decisions
            if d.status == ApprovalStatus.REJECTED
        )
    
    def is_fully_approved(self) -> bool:
        """Check if request has enough approvals."""
        return self.get_approval_count() >= self.required_approvers
    
    def can_approve(self, user_id: str, user_roles: List[str]) -> bool:
        """
        Check if a user can approve this request.
        
        Args:
            user_id: User ID
            user_roles: User's roles
        
        Returns:
            True if user can approve
        """
        # Cannot approve own request
        if user_id == self.requester_id:
            return False
        
        # Check if already decided
        for decision in self.decisions:
            if decision.approver_id == user_id:
                return False
        
        # Check specific approvers
        if self.specific_approvers:
            return user_id in self.specific_approvers
        
        # Check approver roles
        if self.approver_roles:
            return any(role in user_roles for role in self.approver_roles)
        
        # Default: anyone can approve
        return True
    
    def add_decision(self, decision: ApprovalDecision) -> None:
        """Add a decision to the request."""
        self.decisions.append(decision)
        
        # Update status based on decisions
        if decision.status == ApprovalStatus.REJECTED:
            self.status = ApprovalStatus.REJECTED
            self.completed_at = datetime.utcnow()
        elif self.is_fully_approved():
            self.status = ApprovalStatus.APPROVED
            self.completed_at = datetime.utcnow()
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary."""
        return {
            "request_id": self.request_id,
            "tenant_id": self.tenant_id,
            "project_id": self.project_id,
            "workflow_id": self.workflow_id,
            "task_id": self.task_id,
            "approval_type": self.approval_type.value,
            "title": self.title,
            "description": self.description,
            "priority": self.priority.value,
            "requester_id": self.requester_id,
            "requester_email": self.requester_email,
            "requester_name": self.requester_name,
            "operation": self.operation,
            "operation_data": self.operation_data,
            "risk_level": self.risk_level,
            "risk_factors": self.risk_factors,
            "required_approvers": self.required_approvers,
            "approver_roles": self.approver_roles,
            "specific_approvers": self.specific_approvers,
            "status": self.status.value,
            "decisions": [d.to_dict() for d in self.decisions],
            "approval_count": self.get_approval_count(),
            "rejection_count": self.get_rejection_count(),
            "created_at": self.created_at.isoformat(),
            "expires_at": self.expires_at.isoformat() if self.expires_at else None,
            "completed_at": self.completed_at.isoformat() if self.completed_at else None,
            "is_expired": self.is_expired(),
            "is_pending": self.is_pending(),
        }


@dataclass
class ApprovalRule:
    """
    Rule that determines when approval is required.
    """
    
    rule_id: str = field(default_factory=lambda: str(uuid.uuid4()))
    name: str = ""
    description: str = ""
    
    # Scope
    tenant_id: Optional[str] = None
    project_id: Optional[str] = None
    
    # Trigger conditions
    approval_type: ApprovalType = ApprovalType.CUSTOM
    operation_pattern: str = "*"  # Glob pattern for operation names
    
    # Conditions (all must be true to trigger)
    conditions: Dict[str, Any] = field(default_factory=dict)
    # Example conditions:
    # {
    #     "cost_threshold": 100.0,
    #     "risk_level": ["high", "critical"],
    #     "environment": ["production"],
    # }
    
    # Approval requirements
    required_approvers: int = 1
    approver_roles: List[str] = field(default_factory=list)
    specific_approvers: List[str] = field(default_factory=list)
    
    # Timing
    timeout_hours: int = 24
    
    # Auto-approval
    auto_approve_enabled: bool = False
    auto_approve_after_hours: Optional[int] = None
    auto_approve_conditions: Dict[str, Any] = field(default_factory=dict)
    
    # Status
    is_enabled: bool = True
    priority: int = 0  # Higher priority rules are evaluated first
    
    # Metadata
    created_at: datetime = field(default_factory=datetime.utcnow)
    updated_at: datetime = field(default_factory=datetime.utcnow)
    
    def matches(
        self,
        approval_type: ApprovalType,
        operation: str,
        context: Dict[str, Any],
    ) -> bool:
        """
        Check if rule matches the given operation.
        
        Args:
            approval_type: Type of approval
            operation: Operation name
            context: Operation context
        
        Returns:
            True if rule matches
        """
        if not self.is_enabled:
            return False
        
        # Check approval type
        if self.approval_type != approval_type:
            return False
        
        # Check operation pattern
        if not self._matches_pattern(self.operation_pattern, operation):
            return False
        
        # Check conditions
        for key, expected in self.conditions.items():
            actual = context.get(key)
            if not self._check_condition(actual, expected):
                return False
        
        return True
    
    def _matches_pattern(self, pattern: str, value: str) -> bool:
        """Check if value matches glob pattern."""
        if pattern == "*":
            return True
        
        import fnmatch
        return fnmatch.fnmatch(value, pattern)
    
    def _check_condition(self, actual: Any, expected: Any) -> bool:
        """Check if actual value meets expected condition."""
        if isinstance(expected, list):
            return actual in expected
        elif isinstance(expected, dict):
            # Support operators: $gt, $lt, $gte, $lte, $eq, $ne
            for op, val in expected.items():
                if op == "$gt" and not (actual > val):
                    return False
                elif op == "$lt" and not (actual < val):
                    return False
                elif op == "$gte" and not (actual >= val):
                    return False
                elif op == "$lte" and not (actual <= val):
                    return False
                elif op == "$eq" and not (actual == val):
                    return False
                elif op == "$ne" and not (actual != val):
                    return False
            return True
        else:
            return actual == expected
    
    def create_request(
        self,
        requester_id: str,
        operation: str,
        operation_data: Dict[str, Any],
        **kwargs,
    ) -> ApprovalRequest:
        """
        Create an approval request based on this rule.
        
        Args:
            requester_id: ID of the requester
            operation: Operation name
            operation_data: Operation data
            **kwargs: Additional request fields
        
        Returns:
            ApprovalRequest
        """
        return ApprovalRequest(
            tenant_id=kwargs.get("tenant_id", self.tenant_id),
            project_id=kwargs.get("project_id", self.project_id),
            approval_type=self.approval_type,
            title=kwargs.get("title", f"Approval required for {operation}"),
            description=kwargs.get("description", self.description),
            requester_id=requester_id,
            operation=operation,
            operation_data=operation_data,
            required_approvers=self.required_approvers,
            approver_roles=self.approver_roles,
            specific_approvers=self.specific_approvers,
            expires_at=datetime.utcnow() + timedelta(hours=self.timeout_hours),
            auto_approve_after=timedelta(hours=self.auto_approve_after_hours) if self.auto_approve_after_hours else None,
            auto_approve_conditions=self.auto_approve_conditions,
            **{k: v for k, v in kwargs.items() if k not in ["tenant_id", "project_id", "title", "description"]},
        )
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary."""
        return {
            "rule_id": self.rule_id,
            "name": self.name,
            "description": self.description,
            "tenant_id": self.tenant_id,
            "project_id": self.project_id,
            "approval_type": self.approval_type.value,
            "operation_pattern": self.operation_pattern,
            "conditions": self.conditions,
            "required_approvers": self.required_approvers,
            "approver_roles": self.approver_roles,
            "specific_approvers": self.specific_approvers,
            "timeout_hours": self.timeout_hours,
            "auto_approve_enabled": self.auto_approve_enabled,
            "auto_approve_after_hours": self.auto_approve_after_hours,
            "is_enabled": self.is_enabled,
            "priority": self.priority,
            "created_at": self.created_at.isoformat(),
            "updated_at": self.updated_at.isoformat(),
        }
