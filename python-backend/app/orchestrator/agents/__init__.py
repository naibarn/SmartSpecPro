"""
SmartSpec Pro - Orchestrator Agents Module
Phase 1: Core Loop Implementation

This module contains the core agents for the SmartSpec Pro orchestration system:
- SupervisorAgent: The "brain" that routes tasks
- KiloAdapter: Interface to Kilo Code (Macro-hand)
- OpenCodeAdapter: Interface to OpenCode (Micro-hand)
- TokenBudgetController: Token and cost management
- HandoffProtocol: Kilo ↔ OpenCode communication

Architecture: "One Brain, Two Hands"
- Brain: SupervisorAgent (LangGraph-based decision making)
- Macro-hand: Kilo Code (spec, plan, tasks)
- Micro-hand: OpenCode (implementation, testing)
"""

from app.orchestrator.agents.supervisor import (
    SupervisorAgent,
    TaskType,
    RoutingDecision,
)
from app.orchestrator.agents.kilo_adapter import (
    KiloAdapter,
    KiloExecutionRequest,
    KiloExecutionResult,
)
from app.orchestrator.agents.opencode_adapter import (
    OpenCodeAdapter,
    OpenCodeExecutionRequest,
    OpenCodeExecutionResult,
)
from app.orchestrator.agents.budget_controller import (
    TokenBudgetController,
    TokenUsage,
    BudgetAllocation,
    BudgetCheckResult,
    BudgetScope,
    BudgetStatus,
)
from app.orchestrator.agents.handoff_protocol import (
    HandoffProtocol,
    HandoffSession,
    HandoffStatus,
    HandoffDirection,
    TaskExecution,
    TaskExecutionStatus,
)

__all__ = [
    # Supervisor
    "SupervisorAgent",
    "TaskType",
    "RoutingDecision",
    # Kilo
    "KiloAdapter",
    "KiloExecutionRequest",
    "KiloExecutionResult",
    # OpenCode
    "OpenCodeAdapter",
    "OpenCodeExecutionRequest",
    "OpenCodeExecutionResult",
    # Budget
    "TokenBudgetController",
    "TokenUsage",
    "BudgetAllocation",
    "BudgetCheckResult",
    "BudgetScope",
    "BudgetStatus",
    # Handoff
    "HandoffProtocol",
    "HandoffSession",
    "HandoffStatus",
    "HandoffDirection",
    "TaskExecution",
    "TaskExecutionStatus",
]
