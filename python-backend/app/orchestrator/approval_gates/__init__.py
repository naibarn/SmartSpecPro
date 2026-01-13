"""
SmartSpec Pro - Approval Gates Module
Phase 3: SaaS Readiness

Human-in-the-loop approval system for sensitive operations:
- Workflow approval before execution
- Code deployment approval
- Cost threshold approval
- Security-sensitive operation approval
"""

from .models import (
    ApprovalRequest,
    ApprovalStatus,
    ApprovalType,
    ApprovalDecision,
    ApprovalRule,
)
from .approval_service import (
    ApprovalService,
    get_approval_service,
)
from .approval_workflow import (
    ApprovalWorkflow,
    ApprovalStep,
    ApprovalChain,
)

__all__ = [
    # Models
    "ApprovalRequest",
    "ApprovalStatus",
    "ApprovalType",
    "ApprovalDecision",
    "ApprovalRule",
    # Service
    "ApprovalService",
    "get_approval_service",
    # Workflow
    "ApprovalWorkflow",
    "ApprovalStep",
    "ApprovalChain",
]
