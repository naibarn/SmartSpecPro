"""
Approval Workflow for Multi-step Approvals
Phase 3: SaaS Readiness
"""

import structlog
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from enum import Enum
from typing import Optional, Dict, Any, List, Callable, Awaitable
import uuid

from .models import ApprovalRequest, ApprovalStatus, ApprovalType, ApprovalDecision

logger = structlog.get_logger(__name__)


class StepStatus(str, Enum):
    """Status of an approval step."""
    PENDING = "pending"
    IN_PROGRESS = "in_progress"
    APPROVED = "approved"
    REJECTED = "rejected"
    SKIPPED = "skipped"


@dataclass
class ApprovalStep:
    """
    A step in an approval workflow.
    """
    
    step_id: str = field(default_factory=lambda: str(uuid.uuid4()))
    name: str = ""
    description: str = ""
    order: int = 0
    
    # Approval requirements
    required_approvers: int = 1
    approver_roles: List[str] = field(default_factory=list)
    specific_approvers: List[str] = field(default_factory=list)
    
    # Timing
    timeout_hours: int = 24
    
    # Conditions
    skip_conditions: Dict[str, Any] = field(default_factory=dict)
    
    # Status
    status: StepStatus = StepStatus.PENDING
    decisions: List[ApprovalDecision] = field(default_factory=list)
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    
    def start(self) -> None:
        """Start the step."""
        self.status = StepStatus.IN_PROGRESS
        self.started_at = datetime.utcnow()
    
    def get_approval_count(self) -> int:
        """Get number of approvals."""
        return sum(
            1 for d in self.decisions
            if d.status == ApprovalStatus.APPROVED
        )
    
    def is_complete(self) -> bool:
        """Check if step is complete."""
        return self.status in [
            StepStatus.APPROVED,
            StepStatus.REJECTED,
            StepStatus.SKIPPED,
        ]
    
    def should_skip(self, context: Dict[str, Any]) -> bool:
        """Check if step should be skipped based on conditions."""
        if not self.skip_conditions:
            return False
        
        for key, expected in self.skip_conditions.items():
            actual = context.get(key)
            if isinstance(expected, list):
                if actual in expected:
                    return True
            elif actual == expected:
                return True
        
        return False
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary."""
        return {
            "step_id": self.step_id,
            "name": self.name,
            "description": self.description,
            "order": self.order,
            "required_approvers": self.required_approvers,
            "approver_roles": self.approver_roles,
            "specific_approvers": self.specific_approvers,
            "timeout_hours": self.timeout_hours,
            "status": self.status.value,
            "decisions": [d.to_dict() for d in self.decisions],
            "approval_count": self.get_approval_count(),
            "started_at": self.started_at.isoformat() if self.started_at else None,
            "completed_at": self.completed_at.isoformat() if self.completed_at else None,
        }


@dataclass
class ApprovalChain:
    """
    A chain of approval steps.
    """
    
    chain_id: str = field(default_factory=lambda: str(uuid.uuid4()))
    name: str = ""
    description: str = ""
    
    # Steps
    steps: List[ApprovalStep] = field(default_factory=list)
    
    # Current state
    current_step_index: int = 0
    status: ApprovalStatus = ApprovalStatus.PENDING
    
    # Timestamps
    created_at: datetime = field(default_factory=datetime.utcnow)
    completed_at: Optional[datetime] = None
    
    def get_current_step(self) -> Optional[ApprovalStep]:
        """Get the current step."""
        if 0 <= self.current_step_index < len(self.steps):
            return self.steps[self.current_step_index]
        return None
    
    def advance(self) -> Optional[ApprovalStep]:
        """Advance to the next step."""
        self.current_step_index += 1
        
        if self.current_step_index >= len(self.steps):
            self.status = ApprovalStatus.APPROVED
            self.completed_at = datetime.utcnow()
            return None
        
        next_step = self.steps[self.current_step_index]
        next_step.start()
        return next_step
    
    def reject(self) -> None:
        """Reject the chain."""
        self.status = ApprovalStatus.REJECTED
        self.completed_at = datetime.utcnow()
        
        current = self.get_current_step()
        if current:
            current.status = StepStatus.REJECTED
            current.completed_at = datetime.utcnow()
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary."""
        return {
            "chain_id": self.chain_id,
            "name": self.name,
            "description": self.description,
            "steps": [s.to_dict() for s in self.steps],
            "current_step_index": self.current_step_index,
            "current_step": self.get_current_step().to_dict() if self.get_current_step() else None,
            "status": self.status.value,
            "created_at": self.created_at.isoformat(),
            "completed_at": self.completed_at.isoformat() if self.completed_at else None,
        }


@dataclass
class ApprovalWorkflow:
    """
    A complete approval workflow with multiple chains and parallel paths.
    """
    
    workflow_id: str = field(default_factory=lambda: str(uuid.uuid4()))
    name: str = ""
    description: str = ""
    
    # Context
    tenant_id: Optional[str] = None
    project_id: Optional[str] = None
    
    # Request
    request: Optional[ApprovalRequest] = None
    
    # Chains (can be parallel or sequential)
    chains: List[ApprovalChain] = field(default_factory=list)
    parallel: bool = False  # If True, all chains must be approved
    
    # Status
    status: ApprovalStatus = ApprovalStatus.PENDING
    
    # Timestamps
    created_at: datetime = field(default_factory=datetime.utcnow)
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    
    # Callbacks
    on_complete: Optional[Callable[["ApprovalWorkflow"], Awaitable[None]]] = None
    
    def start(self, context: Optional[Dict[str, Any]] = None) -> None:
        """Start the workflow."""
        self.started_at = datetime.utcnow()
        context = context or {}
        
        for chain in self.chains:
            # Check skip conditions for first step
            first_step = chain.steps[0] if chain.steps else None
            if first_step:
                if first_step.should_skip(context):
                    first_step.status = StepStatus.SKIPPED
                    first_step.completed_at = datetime.utcnow()
                    chain.advance()
                else:
                    first_step.start()
    
    def get_pending_steps(self) -> List[ApprovalStep]:
        """Get all pending steps across chains."""
        pending = []
        for chain in self.chains:
            if chain.status == ApprovalStatus.PENDING:
                current = chain.get_current_step()
                if current and current.status == StepStatus.IN_PROGRESS:
                    pending.append(current)
        return pending
    
    def process_decision(
        self,
        step_id: str,
        decision: ApprovalDecision,
    ) -> bool:
        """
        Process a decision for a step.
        
        Args:
            step_id: Step ID
            decision: The decision
        
        Returns:
            True if workflow status changed
        """
        # Find the step
        for chain in self.chains:
            current = chain.get_current_step()
            if current and current.step_id == step_id:
                current.decisions.append(decision)
                
                if decision.status == ApprovalStatus.REJECTED:
                    chain.reject()
                    return self._update_workflow_status()
                
                elif decision.status == ApprovalStatus.APPROVED:
                    if current.get_approval_count() >= current.required_approvers:
                        current.status = StepStatus.APPROVED
                        current.completed_at = datetime.utcnow()
                        chain.advance()
                        return self._update_workflow_status()
        
        return False
    
    def _update_workflow_status(self) -> bool:
        """Update workflow status based on chain statuses."""
        old_status = self.status
        
        if self.parallel:
            # All chains must be approved
            if all(c.status == ApprovalStatus.APPROVED for c in self.chains):
                self.status = ApprovalStatus.APPROVED
                self.completed_at = datetime.utcnow()
            elif any(c.status == ApprovalStatus.REJECTED for c in self.chains):
                self.status = ApprovalStatus.REJECTED
                self.completed_at = datetime.utcnow()
        else:
            # Any chain approved is enough
            if any(c.status == ApprovalStatus.APPROVED for c in self.chains):
                self.status = ApprovalStatus.APPROVED
                self.completed_at = datetime.utcnow()
            elif all(c.status == ApprovalStatus.REJECTED for c in self.chains):
                self.status = ApprovalStatus.REJECTED
                self.completed_at = datetime.utcnow()
        
        return self.status != old_status
    
    def is_complete(self) -> bool:
        """Check if workflow is complete."""
        return self.status in [ApprovalStatus.APPROVED, ApprovalStatus.REJECTED]
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary."""
        return {
            "workflow_id": self.workflow_id,
            "name": self.name,
            "description": self.description,
            "tenant_id": self.tenant_id,
            "project_id": self.project_id,
            "request": self.request.to_dict() if self.request else None,
            "chains": [c.to_dict() for c in self.chains],
            "parallel": self.parallel,
            "status": self.status.value,
            "pending_steps": [s.to_dict() for s in self.get_pending_steps()],
            "created_at": self.created_at.isoformat(),
            "started_at": self.started_at.isoformat() if self.started_at else None,
            "completed_at": self.completed_at.isoformat() if self.completed_at else None,
        }


class WorkflowBuilder:
    """
    Builder for creating approval workflows.
    """
    
    def __init__(self, name: str = "", description: str = ""):
        """Initialize builder."""
        self._workflow = ApprovalWorkflow(name=name, description=description)
        self._current_chain: Optional[ApprovalChain] = None
    
    def set_tenant(self, tenant_id: str) -> "WorkflowBuilder":
        """Set tenant ID."""
        self._workflow.tenant_id = tenant_id
        return self
    
    def set_project(self, project_id: str) -> "WorkflowBuilder":
        """Set project ID."""
        self._workflow.project_id = project_id
        return self
    
    def set_request(self, request: ApprovalRequest) -> "WorkflowBuilder":
        """Set the approval request."""
        self._workflow.request = request
        return self
    
    def set_parallel(self, parallel: bool = True) -> "WorkflowBuilder":
        """Set parallel mode."""
        self._workflow.parallel = parallel
        return self
    
    def add_chain(
        self,
        name: str = "",
        description: str = "",
    ) -> "WorkflowBuilder":
        """Add a new chain."""
        chain = ApprovalChain(name=name, description=description)
        self._workflow.chains.append(chain)
        self._current_chain = chain
        return self
    
    def add_step(
        self,
        name: str,
        required_approvers: int = 1,
        approver_roles: Optional[List[str]] = None,
        specific_approvers: Optional[List[str]] = None,
        timeout_hours: int = 24,
        skip_conditions: Optional[Dict[str, Any]] = None,
        description: str = "",
    ) -> "WorkflowBuilder":
        """Add a step to the current chain."""
        if self._current_chain is None:
            self.add_chain()
        
        step = ApprovalStep(
            name=name,
            description=description,
            order=len(self._current_chain.steps),
            required_approvers=required_approvers,
            approver_roles=approver_roles or [],
            specific_approvers=specific_approvers or [],
            timeout_hours=timeout_hours,
            skip_conditions=skip_conditions or {},
        )
        
        self._current_chain.steps.append(step)
        return self
    
    def on_complete(
        self,
        callback: Callable[[ApprovalWorkflow], Awaitable[None]],
    ) -> "WorkflowBuilder":
        """Set completion callback."""
        self._workflow.on_complete = callback
        return self
    
    def build(self) -> ApprovalWorkflow:
        """Build the workflow."""
        return self._workflow


# Predefined workflow templates
def create_deployment_workflow(
    tenant_id: str,
    project_id: str,
    environment: str,
    request: ApprovalRequest,
) -> ApprovalWorkflow:
    """
    Create a standard deployment approval workflow.
    
    Args:
        tenant_id: Tenant ID
        project_id: Project ID
        environment: Target environment
        request: Approval request
    
    Returns:
        Configured workflow
    """
    builder = WorkflowBuilder(
        name=f"Deployment to {environment}",
        description=f"Approval workflow for deploying to {environment}",
    )
    
    builder.set_tenant(tenant_id)
    builder.set_project(project_id)
    builder.set_request(request)
    
    # Single chain for sequential approval
    builder.add_chain("Deployment Approval")
    
    # Technical review
    builder.add_step(
        name="Technical Review",
        description="Review code changes and technical implementation",
        required_approvers=1,
        approver_roles=["developer", "tech_lead"],
        timeout_hours=24,
        skip_conditions={"environment": ["development", "dev"]},
    )
    
    # QA approval (for staging and production)
    builder.add_step(
        name="QA Approval",
        description="Verify testing is complete",
        required_approvers=1,
        approver_roles=["qa", "qa_lead"],
        timeout_hours=24,
        skip_conditions={"environment": ["development", "dev"]},
    )
    
    # Production approval (only for production)
    builder.add_step(
        name="Production Approval",
        description="Final approval for production deployment",
        required_approvers=2,
        approver_roles=["admin", "tech_lead"],
        timeout_hours=4,
        skip_conditions={"environment": ["development", "dev", "staging"]},
    )
    
    return builder.build()


def create_cost_approval_workflow(
    tenant_id: str,
    estimated_cost: float,
    request: ApprovalRequest,
) -> ApprovalWorkflow:
    """
    Create a cost approval workflow.
    
    Args:
        tenant_id: Tenant ID
        estimated_cost: Estimated cost
        request: Approval request
    
    Returns:
        Configured workflow
    """
    builder = WorkflowBuilder(
        name="Cost Approval",
        description=f"Approval for operation with estimated cost ${estimated_cost:.2f}",
    )
    
    builder.set_tenant(tenant_id)
    builder.set_request(request)
    
    builder.add_chain("Cost Approval")
    
    # Manager approval
    builder.add_step(
        name="Manager Approval",
        description="Manager review of cost",
        required_approvers=1,
        approver_roles=["manager", "admin"],
        timeout_hours=4,
    )
    
    # Finance approval for high costs
    if estimated_cost > 100:
        builder.add_step(
            name="Finance Approval",
            description="Finance review for high-cost operation",
            required_approvers=1,
            approver_roles=["billing_admin", "finance"],
            timeout_hours=24,
        )
    
    return builder.build()
