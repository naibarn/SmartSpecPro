"""
SmartSpec Pro - Token Budget Controller
Phase 1.3: Token Budget Management

Manages token budgets and cost tracking for workflows.
Integrates with the existing Credit Service for billing.
"""

import asyncio
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from enum import Enum
from typing import Any, Dict, List, Optional
from uuid import uuid4

import structlog

from app.services.credit_service import CreditService

logger = structlog.get_logger()


# ==================== ENUMS ====================

class BudgetStatus(str, Enum):
    """Status of a budget allocation."""
    ACTIVE = "active"
    EXHAUSTED = "exhausted"
    EXPIRED = "expired"
    CANCELLED = "cancelled"


class BudgetScope(str, Enum):
    """Scope of budget allocation."""
    WORKFLOW = "workflow"      # Per-workflow budget
    STAGE = "stage"            # Per-stage budget within workflow
    TASK = "task"              # Per-task budget
    USER_DAILY = "user_daily"  # Daily budget per user
    USER_MONTHLY = "user_monthly"  # Monthly budget per user


# ==================== DATA CLASSES ====================

@dataclass
class TokenUsage:
    """Represents token usage for a single operation."""
    usage_id: str = field(default_factory=lambda: str(uuid4()))
    workflow_id: str = ""
    stage_id: str = ""
    task_id: str = ""
    model: str = ""
    input_tokens: int = 0
    output_tokens: int = 0
    total_tokens: int = 0
    cost: float = 0.0
    timestamp: datetime = field(default_factory=datetime.utcnow)
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            "usage_id": self.usage_id,
            "workflow_id": self.workflow_id,
            "stage_id": self.stage_id,
            "task_id": self.task_id,
            "model": self.model,
            "input_tokens": self.input_tokens,
            "output_tokens": self.output_tokens,
            "total_tokens": self.total_tokens,
            "cost": self.cost,
            "timestamp": self.timestamp.isoformat(),
        }


@dataclass
class BudgetAllocation:
    """Represents a budget allocation for a scope."""
    allocation_id: str = field(default_factory=lambda: str(uuid4()))
    scope: BudgetScope = BudgetScope.WORKFLOW
    scope_id: str = ""  # workflow_id, user_id, etc.
    max_tokens: int = 100000
    max_cost: float = 10.0
    used_tokens: int = 0
    used_cost: float = 0.0
    status: BudgetStatus = BudgetStatus.ACTIVE
    created_at: datetime = field(default_factory=datetime.utcnow)
    expires_at: Optional[datetime] = None
    
    @property
    def remaining_tokens(self) -> int:
        return max(0, self.max_tokens - self.used_tokens)
    
    @property
    def remaining_cost(self) -> float:
        return max(0.0, self.max_cost - self.used_cost)
    
    @property
    def usage_percentage(self) -> float:
        if self.max_tokens == 0:
            return 100.0
        return (self.used_tokens / self.max_tokens) * 100
    
    def is_valid(self) -> bool:
        """Check if budget is still valid."""
        if self.status != BudgetStatus.ACTIVE:
            return False
        if self.expires_at and datetime.utcnow() > self.expires_at:
            return False
        return True
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            "allocation_id": self.allocation_id,
            "scope": self.scope.value,
            "scope_id": self.scope_id,
            "max_tokens": self.max_tokens,
            "max_cost": self.max_cost,
            "used_tokens": self.used_tokens,
            "used_cost": self.used_cost,
            "remaining_tokens": self.remaining_tokens,
            "remaining_cost": self.remaining_cost,
            "usage_percentage": self.usage_percentage,
            "status": self.status.value,
            "created_at": self.created_at.isoformat(),
            "expires_at": self.expires_at.isoformat() if self.expires_at else None,
        }


@dataclass
class BudgetCheckResult:
    """Result of a budget check."""
    allowed: bool
    allocation: Optional[BudgetAllocation] = None
    reason: str = ""
    recommended_max_tokens: int = 0
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            "allowed": self.allowed,
            "allocation": self.allocation.to_dict() if self.allocation else None,
            "reason": self.reason,
            "recommended_max_tokens": self.recommended_max_tokens,
        }


# ==================== PRICING ====================

# Token pricing per 1M tokens (approximate)
MODEL_PRICING = {
    # OpenAI
    "gpt-4o": {"input": 2.50, "output": 10.00},
    "gpt-4o-mini": {"input": 0.15, "output": 0.60},
    "gpt-4-turbo": {"input": 10.00, "output": 30.00},
    "gpt-3.5-turbo": {"input": 0.50, "output": 1.50},
    
    # Anthropic
    "claude-3.5-sonnet": {"input": 3.00, "output": 15.00},
    "claude-3-opus": {"input": 15.00, "output": 75.00},
    "claude-3-haiku": {"input": 0.25, "output": 1.25},
    
    # Deepseek
    "deepseek-chat": {"input": 0.14, "output": 0.28},
    "deepseek-coder": {"input": 0.14, "output": 0.28},
    
    # Default fallback
    "default": {"input": 1.00, "output": 3.00},
}


def calculate_cost(model: str, input_tokens: int, output_tokens: int) -> float:
    """Calculate cost for token usage."""
    pricing = MODEL_PRICING.get(model, MODEL_PRICING["default"])
    
    input_cost = (input_tokens / 1_000_000) * pricing["input"]
    output_cost = (output_tokens / 1_000_000) * pricing["output"]
    
    return input_cost + output_cost


# ==================== TOKEN BUDGET CONTROLLER ====================

class TokenBudgetController:
    """
    Token Budget Controller.
    
    Manages token budgets and cost tracking for workflows.
    Integrates with Credit Service for billing.
    
    Features:
    1. Multi-level budget allocation (workflow, stage, task)
    2. Real-time usage tracking
    3. Budget enforcement with soft/hard limits
    4. Cost calculation and Credit Service integration
    """
    
    # Default budget limits
    DEFAULT_WORKFLOW_TOKENS = 100000
    DEFAULT_WORKFLOW_COST = 10.0
    DEFAULT_STAGE_TOKENS = 30000
    DEFAULT_TASK_TOKENS = 10000
    
    # Warning thresholds
    WARNING_THRESHOLD = 0.8  # 80% usage
    CRITICAL_THRESHOLD = 0.95  # 95% usage
    
    def __init__(
        self,
        credit_service: Optional[CreditService] = None,
        enforce_limits: bool = True,
    ):
        """Initialize the Token Budget Controller."""
        self.credit_service = credit_service
        self.enforce_limits = enforce_limits
        
        # In-memory storage (should be replaced with database in production)
        self._allocations: Dict[str, BudgetAllocation] = {}
        self._usage_history: List[TokenUsage] = []
        
        logger.info("token_budget_controller_initialized", enforce_limits=enforce_limits)
    
    async def create_allocation(
        self,
        scope: BudgetScope,
        scope_id: str,
        max_tokens: Optional[int] = None,
        max_cost: Optional[float] = None,
        expires_in_hours: Optional[int] = None,
    ) -> BudgetAllocation:
        """
        Create a new budget allocation.
        
        Args:
            scope: The scope of the budget
            scope_id: Identifier for the scope (workflow_id, user_id, etc.)
            max_tokens: Maximum tokens allowed (uses default if not specified)
            max_cost: Maximum cost allowed (uses default if not specified)
            expires_in_hours: Hours until expiration (None for no expiration)
            
        Returns:
            The created BudgetAllocation
        """
        # Determine defaults based on scope
        if max_tokens is None:
            if scope == BudgetScope.WORKFLOW:
                max_tokens = self.DEFAULT_WORKFLOW_TOKENS
            elif scope == BudgetScope.STAGE:
                max_tokens = self.DEFAULT_STAGE_TOKENS
            elif scope == BudgetScope.TASK:
                max_tokens = self.DEFAULT_TASK_TOKENS
            else:
                max_tokens = self.DEFAULT_WORKFLOW_TOKENS
        
        if max_cost is None:
            max_cost = self.DEFAULT_WORKFLOW_COST
        
        # Calculate expiration
        expires_at = None
        if expires_in_hours:
            expires_at = datetime.utcnow() + timedelta(hours=expires_in_hours)
        
        allocation = BudgetAllocation(
            scope=scope,
            scope_id=scope_id,
            max_tokens=max_tokens,
            max_cost=max_cost,
            expires_at=expires_at,
        )
        
        self._allocations[allocation.allocation_id] = allocation
        
        logger.info(
            "budget_allocation_created",
            allocation_id=allocation.allocation_id,
            scope=scope.value,
            scope_id=scope_id,
            max_tokens=max_tokens,
            max_cost=max_cost,
        )
        
        return allocation
    
    async def check_budget(
        self,
        allocation_id: str,
        estimated_tokens: int,
    ) -> BudgetCheckResult:
        """
        Check if an operation is allowed within budget.
        
        Args:
            allocation_id: The allocation to check
            estimated_tokens: Estimated tokens for the operation
            
        Returns:
            BudgetCheckResult indicating if operation is allowed
        """
        allocation = self._allocations.get(allocation_id)
        
        if not allocation:
            return BudgetCheckResult(
                allowed=not self.enforce_limits,
                reason="Allocation not found",
            )
        
        if not allocation.is_valid():
            return BudgetCheckResult(
                allowed=False,
                allocation=allocation,
                reason=f"Budget is {allocation.status.value}",
            )
        
        # Check if operation would exceed budget
        projected_usage = allocation.used_tokens + estimated_tokens
        
        if projected_usage > allocation.max_tokens:
            if self.enforce_limits:
                return BudgetCheckResult(
                    allowed=False,
                    allocation=allocation,
                    reason=f"Would exceed token budget ({projected_usage} > {allocation.max_tokens})",
                    recommended_max_tokens=allocation.remaining_tokens,
                )
            else:
                logger.warning(
                    "budget_exceeded_soft",
                    allocation_id=allocation_id,
                    projected=projected_usage,
                    max=allocation.max_tokens,
                )
        
        # Check warning thresholds
        usage_ratio = projected_usage / allocation.max_tokens
        
        if usage_ratio >= self.CRITICAL_THRESHOLD:
            logger.warning(
                "budget_critical",
                allocation_id=allocation_id,
                usage_percentage=usage_ratio * 100,
            )
        elif usage_ratio >= self.WARNING_THRESHOLD:
            logger.info(
                "budget_warning",
                allocation_id=allocation_id,
                usage_percentage=usage_ratio * 100,
            )
        
        return BudgetCheckResult(
            allowed=True,
            allocation=allocation,
            reason="Within budget",
            recommended_max_tokens=allocation.remaining_tokens,
        )
    
    async def record_usage(
        self,
        allocation_id: str,
        model: str,
        input_tokens: int,
        output_tokens: int,
        workflow_id: str = "",
        stage_id: str = "",
        task_id: str = "",
    ) -> TokenUsage:
        """
        Record token usage and update budget.
        
        Args:
            allocation_id: The allocation to update
            model: The model used
            input_tokens: Number of input tokens
            output_tokens: Number of output tokens
            workflow_id: Optional workflow identifier
            stage_id: Optional stage identifier
            task_id: Optional task identifier
            
        Returns:
            The recorded TokenUsage
        """
        total_tokens = input_tokens + output_tokens
        cost = calculate_cost(model, input_tokens, output_tokens)
        
        usage = TokenUsage(
            workflow_id=workflow_id,
            stage_id=stage_id,
            task_id=task_id,
            model=model,
            input_tokens=input_tokens,
            output_tokens=output_tokens,
            total_tokens=total_tokens,
            cost=cost,
        )
        
        self._usage_history.append(usage)
        
        # Update allocation
        allocation = self._allocations.get(allocation_id)
        if allocation:
            allocation.used_tokens += total_tokens
            allocation.used_cost += cost
            
            # Check if budget is exhausted
            if allocation.used_tokens >= allocation.max_tokens:
                allocation.status = BudgetStatus.EXHAUSTED
                logger.warning(
                    "budget_exhausted",
                    allocation_id=allocation_id,
                    used_tokens=allocation.used_tokens,
                    max_tokens=allocation.max_tokens,
                )
        
        # Deduct from Credit Service if available
        if self.credit_service:
            try:
                await self.credit_service.deduct_credits(
                    amount=cost,
                    description=f"Token usage: {model} ({total_tokens} tokens)",
                    metadata={
                        "allocation_id": allocation_id,
                        "model": model,
                        "input_tokens": input_tokens,
                        "output_tokens": output_tokens,
                    },
                )
            except Exception as e:
                logger.error("credit_deduction_failed", error=str(e))
        
        logger.debug(
            "usage_recorded",
            allocation_id=allocation_id,
            model=model,
            total_tokens=total_tokens,
            cost=cost,
        )
        
        return usage
    
    async def get_allocation(self, allocation_id: str) -> Optional[BudgetAllocation]:
        """Get a budget allocation by ID."""
        return self._allocations.get(allocation_id)
    
    async def get_usage_summary(
        self,
        workflow_id: Optional[str] = None,
        start_time: Optional[datetime] = None,
        end_time: Optional[datetime] = None,
    ) -> Dict[str, Any]:
        """
        Get usage summary with optional filters.
        
        Args:
            workflow_id: Filter by workflow
            start_time: Filter by start time
            end_time: Filter by end time
            
        Returns:
            Summary dictionary
        """
        filtered_usage = self._usage_history
        
        if workflow_id:
            filtered_usage = [u for u in filtered_usage if u.workflow_id == workflow_id]
        
        if start_time:
            filtered_usage = [u for u in filtered_usage if u.timestamp >= start_time]
        
        if end_time:
            filtered_usage = [u for u in filtered_usage if u.timestamp <= end_time]
        
        # Calculate totals
        total_input = sum(u.input_tokens for u in filtered_usage)
        total_output = sum(u.output_tokens for u in filtered_usage)
        total_tokens = sum(u.total_tokens for u in filtered_usage)
        total_cost = sum(u.cost for u in filtered_usage)
        
        # Group by model
        by_model: Dict[str, Dict[str, Any]] = {}
        for usage in filtered_usage:
            if usage.model not in by_model:
                by_model[usage.model] = {
                    "input_tokens": 0,
                    "output_tokens": 0,
                    "total_tokens": 0,
                    "cost": 0.0,
                    "count": 0,
                }
            by_model[usage.model]["input_tokens"] += usage.input_tokens
            by_model[usage.model]["output_tokens"] += usage.output_tokens
            by_model[usage.model]["total_tokens"] += usage.total_tokens
            by_model[usage.model]["cost"] += usage.cost
            by_model[usage.model]["count"] += 1
        
        return {
            "total_input_tokens": total_input,
            "total_output_tokens": total_output,
            "total_tokens": total_tokens,
            "total_cost": total_cost,
            "operation_count": len(filtered_usage),
            "by_model": by_model,
        }
    
    async def cancel_allocation(self, allocation_id: str) -> bool:
        """Cancel a budget allocation."""
        allocation = self._allocations.get(allocation_id)
        if not allocation:
            return False
        
        allocation.status = BudgetStatus.CANCELLED
        logger.info("allocation_cancelled", allocation_id=allocation_id)
        return True
    
    async def cleanup_expired(self) -> int:
        """Clean up expired allocations."""
        now = datetime.utcnow()
        expired_count = 0
        
        for allocation in self._allocations.values():
            if allocation.expires_at and now > allocation.expires_at:
                if allocation.status == BudgetStatus.ACTIVE:
                    allocation.status = BudgetStatus.EXPIRED
                    expired_count += 1
        
        if expired_count > 0:
            logger.info("expired_allocations_cleaned", count=expired_count)
        
        return expired_count
