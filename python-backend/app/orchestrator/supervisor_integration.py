"""
SmartSpec Pro - Supervisor Integration
Phase 1: Core Loop - Integrates Supervisor Agent with existing Orchestrator

This module provides the bridge between the existing WorkflowOrchestrator
and the new Supervisor Agent architecture ("One Brain, Two Hands").
"""

from typing import Optional, Dict, Any, List
from datetime import datetime
import structlog
from enum import Enum
from dataclasses import dataclass, field

from app.orchestrator.agents.supervisor import (
    SupervisorAgent,
    RoutingDecision,
    SupervisorTask,
    SupervisorResult,
    TaskType,
    ExecutorType,
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
from app.orchestrator.agents.handoff_protocol import (
    HandoffProtocol,
    HandoffSession,
    TaskExecution,
    HandoffDirection,
    HandoffStatus,
)
from app.orchestrator.agents.budget_controller import (
    TokenBudgetController,
    TokenUsage,
    BudgetAllocation,
    BudgetCheckResult,
    BudgetStatus,
    BudgetScope,
)
from app.services.credit_service import CreditService

logger = structlog.get_logger()


# ==================== ENUMS ====================

class ExecutionStatus(str, Enum):
    """Execution status enum."""
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"


# ==================== DATA CLASSES ====================

@dataclass
class ExecutionContext:
    """Context for a supervised execution."""
    execution_id: str
    user_id: str
    workspace: str
    project_context: Dict[str, Any] = field(default_factory=dict)
    created_at: datetime = field(default_factory=datetime.utcnow)


@dataclass
class AgentOutput:
    """Output from an agent execution."""
    agent: ExecutorType
    content: str
    artifacts: List[Dict[str, Any]] = field(default_factory=list)
    is_complete: bool = False
    needs_handoff: bool = False
    next_prompt: Optional[str] = None
    tokens_used: int = 0


@dataclass
class ExecutionResult:
    """Result of a supervised execution."""
    execution_id: str
    status: ExecutionStatus
    outputs: List[AgentOutput] = field(default_factory=list)
    error: Optional[str] = None
    warning: Optional[str] = None
    completed_at: datetime = field(default_factory=datetime.utcnow)
    
    @property
    def is_success(self) -> bool:
        return self.status == ExecutionStatus.COMPLETED and not self.error
    
    @property
    def final_output(self) -> Optional[str]:
        if self.outputs:
            return self.outputs[-1].content
        return None
    
    @property
    def total_tokens(self) -> int:
        return sum(o.tokens_used for o in self.outputs)


@dataclass
class HandoffResult:
    """Result of a handoff between agents."""
    success: bool
    target_agent: Optional[ExecutorType] = None
    context_for_target: Optional[str] = None
    error: Optional[str] = None


# ==================== SUPERVISOR INTEGRATION ====================

class SupervisorIntegration:
    """
    Integrates the Supervisor Agent with the existing orchestrator.
    
    This class acts as the main entry point for the "One Brain, Two Hands"
    architecture, coordinating between:
    - Supervisor Agent (Brain): Makes routing decisions
    - Kilo Adapter (Macro Hand): Handles planning and architecture
    - OpenCode Adapter (Micro Hand): Handles implementation
    - Handoff Protocol: Manages transitions between agents
    - Token Budget Controller: Manages cost/token limits
    """
    
    def __init__(
        self,
        credit_service: Optional[CreditService] = None,
    ):
        """
        Initialize the supervisor integration.
        
        Args:
            credit_service: Credit service for billing
        """
        self.credit_service = credit_service
        
        # Initialize components
        self.supervisor = SupervisorAgent()
        self.kilo_adapter = KiloAdapter()
        self.opencode_adapter = OpenCodeAdapter()
        self.handoff_protocol = HandoffProtocol()
        self.budget_controller = TokenBudgetController()
        
        # State tracking
        self._active_executions: Dict[str, ExecutionContext] = {}
        
        logger.info("Supervisor integration initialized")
    
    async def execute_task(
        self,
        execution_id: str,
        user_id: str,
        prompt: str,
        workspace: str,
        project_context: Optional[Dict[str, Any]] = None,
        max_iterations: int = 10,
    ) -> ExecutionResult:
        """
        Execute a task using the Supervisor Agent architecture.
        
        This is the main entry point for task execution. The Supervisor
        analyzes the task and routes it to the appropriate agent (Kilo or OpenCode).
        
        Args:
            execution_id: Unique execution identifier
            user_id: User ID for billing
            prompt: Task description/prompt
            workspace: Workspace directory path
            project_context: Optional project context
            max_iterations: Maximum number of agent iterations
        
        Returns:
            ExecutionResult with status and outputs
        """
        logger.info(
            "Starting supervised execution",
            execution_id=execution_id,
            user_id=user_id,
        )
        
        # Create execution context
        context = ExecutionContext(
            execution_id=execution_id,
            user_id=user_id,
            workspace=workspace,
            project_context=project_context or {},
        )
        self._active_executions[execution_id] = context
        
        try:
            # Allocate budget
            budget = await self._allocate_budget(user_id, execution_id)
            if not budget.is_sufficient:
                return ExecutionResult(
                    execution_id=execution_id,
                    status=ExecutionStatus.FAILED,
                    error="Insufficient credits for execution",
                )
            
            # Analyze task with Supervisor
            task = SupervisorTask(
                task_id=execution_id,
                project_id=workspace,
                user_id=user_id,
                prompt=prompt,
                context=project_context or {},
            )
            
            routing = await self.supervisor.analyze_task(task)
            
            # Execute based on routing decision
            result = await self._execute_with_routing(
                context=context,
                prompt=prompt,
                routing=routing,
                budget=budget,
                max_iterations=max_iterations,
            )
            
            # Finalize budget
            await self._finalize_budget(user_id, execution_id, budget)
            
            return result
            
        except Exception as e:
            logger.error(
                "Supervised execution failed",
                execution_id=execution_id,
                error=str(e),
            )
            return ExecutionResult(
                execution_id=execution_id,
                status=ExecutionStatus.FAILED,
                error=str(e),
            )
        finally:
            # Cleanup
            if execution_id in self._active_executions:
                del self._active_executions[execution_id]
    
    async def _allocate_budget(
        self,
        user_id: str,
        execution_id: str,
    ) -> BudgetAllocation:
        """Allocate token budget for execution."""
        # Get user's available credits
        available_credits = 0
        if self.credit_service:
            try:
                balance = await self.credit_service.get_balance(user_id)
                available_credits = balance.available if balance else 0
            except Exception as e:
                logger.warning(f"Failed to get credit balance: {e}")
                available_credits = 10000  # Default for testing
        else:
            available_credits = 10000  # Default for testing
        
        # Allocate budget
        return self.budget_controller.allocate_budget(
            execution_id=execution_id,
            available_credits=available_credits,
        )
    
    async def _finalize_budget(
        self,
        user_id: str,
        execution_id: str,
        budget: BudgetAllocation,
    ) -> None:
        """Finalize budget and deduct credits."""
        # Get final usage
        usage = self.budget_controller.get_usage(execution_id)
        
        if usage and self.credit_service:
            try:
                # Deduct credits based on actual usage
                await self.credit_service.deduct_credits(
                    user_id=user_id,
                    amount=usage.total_cost,
                    reason=f"Execution {execution_id}",
                    metadata={
                        "execution_id": execution_id,
                        "tokens_used": usage.total_tokens,
                    },
                )
            except Exception as e:
                logger.error(f"Failed to deduct credits: {e}")
        
        # Release budget
        self.budget_controller.release_budget(execution_id)
    
    async def _execute_with_routing(
        self,
        context: ExecutionContext,
        prompt: str,
        routing: RoutingDecision,
        budget: BudgetAllocation,
        max_iterations: int,
    ) -> ExecutionResult:
        """Execute task with intelligent routing between agents."""
        iterations = 0
        current_executor = routing.executor
        current_prompt = prompt
        outputs: List[AgentOutput] = []
        
        while iterations < max_iterations:
            iterations += 1
            
            # Check budget
            if not self.budget_controller.check_budget(context.execution_id):
                logger.warning(
                    "Budget exhausted",
                    execution_id=context.execution_id,
                    iteration=iterations,
                )
                break
            
            # Execute with appropriate agent
            if current_executor == ExecutorType.KILO:
                output = await self._execute_kilo(
                    context=context,
                    prompt=current_prompt,
                    budget=budget,
                )
            else:
                output = await self._execute_opencode(
                    context=context,
                    prompt=current_prompt,
                    budget=budget,
                )
            
            outputs.append(output)
            
            # Check if task is complete
            if output.is_complete:
                return ExecutionResult(
                    execution_id=context.execution_id,
                    status=ExecutionStatus.COMPLETED,
                    outputs=outputs,
                )
            
            # Check if handoff is needed
            if output.needs_handoff:
                handoff_result = await self._handle_handoff(
                    context=context,
                    current_executor=current_executor,
                    output=output,
                )
                
                if handoff_result.success and handoff_result.target_agent:
                    current_executor = handoff_result.target_agent
                    current_prompt = handoff_result.context_for_target or prompt
                else:
                    # Handoff failed, continue with current agent
                    current_prompt = output.next_prompt or prompt
            else:
                current_prompt = output.next_prompt or prompt
        
        # Max iterations reached
        return ExecutionResult(
            execution_id=context.execution_id,
            status=ExecutionStatus.COMPLETED,
            outputs=outputs,
            warning="Max iterations reached",
        )
    
    async def _execute_kilo(
        self,
        context: ExecutionContext,
        prompt: str,
        budget: BudgetAllocation,
    ) -> AgentOutput:
        """Execute task with Kilo adapter (macro-level)."""
        request = KiloExecutionRequest(
            execution_id=context.execution_id,
            prompt=prompt,
            workspace=context.workspace,
            mode="architect",  # Default to architect mode for macro tasks
        )
        
        result = await self.kilo_adapter.execute(request)
        
        # Track token usage
        if result.tokens_used:
            self.budget_controller.record_usage(
                execution_id=context.execution_id,
                tokens=result.tokens_used,
                model=result.model_used or "unknown",
            )
        
        return AgentOutput(
            agent=ExecutorType.KILO,
            content=result.content,
            artifacts=result.artifacts,
            is_complete=result.is_complete,
            needs_handoff=result.needs_implementation,
            next_prompt=result.next_prompt,
            tokens_used=result.tokens_used,
        )
    
    async def _execute_opencode(
        self,
        context: ExecutionContext,
        prompt: str,
        budget: BudgetAllocation,
    ) -> AgentOutput:
        """Execute task with OpenCode adapter (micro-level)."""
        request = OpenCodeExecutionRequest(
            execution_id=context.execution_id,
            prompt=prompt,
            workspace=context.workspace,
        )
        
        result = await self.opencode_adapter.execute(request)
        
        # Track token usage
        if result.tokens_used:
            self.budget_controller.record_usage(
                execution_id=context.execution_id,
                tokens=result.tokens_used,
                model=result.model_used or "unknown",
            )
        
        return AgentOutput(
            agent=ExecutorType.OPENCODE,
            content=result.content,
            artifacts=result.artifacts,
            is_complete=result.is_complete,
            needs_handoff=result.needs_planning,
            next_prompt=result.next_prompt,
            tokens_used=result.tokens_used,
        )
    
    async def _handle_handoff(
        self,
        context: ExecutionContext,
        current_executor: ExecutorType,
        output: AgentOutput,
    ) -> HandoffResult:
        """Handle handoff between agents."""
        # Determine direction
        if current_executor == ExecutorType.KILO:
            direction = HandoffDirection.KILO_TO_OPENCODE
            target = ExecutorType.OPENCODE
        else:
            direction = HandoffDirection.OPENCODE_TO_KILO
            target = ExecutorType.KILO
        
        # Create handoff session
        session = await self.handoff_protocol.create_session(
            execution_id=context.execution_id,
            direction=direction,
            source_output=output.content,
            artifacts=output.artifacts,
            context=context.project_context,
        )
        
        # Execute handoff
        result = await self.handoff_protocol.execute_handoff(session)
        
        return HandoffResult(
            success=result.status == HandoffStatus.COMPLETED,
            target_agent=target,
            context_for_target=result.context_for_target if hasattr(result, 'context_for_target') else None,
            error=result.error if hasattr(result, 'error') else None,
        )


# Factory function
def get_supervisor_integration(
    credit_service: Optional[CreditService] = None,
) -> SupervisorIntegration:
    """
    Get a SupervisorIntegration instance.
    
    Args:
        credit_service: Optional credit service for billing
    
    Returns:
        SupervisorIntegration instance
    """
    return SupervisorIntegration(credit_service=credit_service)
