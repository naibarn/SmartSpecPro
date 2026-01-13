"""
SmartSpec Pro - Supervisor Agent
Phase 1.1: Supervisor & Kilo Integration

The Supervisor Agent is the "Brain" in the "One Brain, Two Hands" architecture.
It analyzes incoming tasks and routes them to the appropriate executor:
- Kilo Code (Macro-hand): For planning, architecture, and task decomposition
- OpenCode (Micro-hand): For implementation, bug fixes, and testing
"""

import asyncio
import json
from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from typing import Any, Dict, List, Optional, Tuple
from uuid import uuid4

import structlog

from app.services.kilo_session_manager import KiloSessionManager, KiloMode, KiloSession
from app.services.credit_service import CreditService

logger = structlog.get_logger()


# ==================== ENUMS ====================

class TaskType(str, Enum):
    """Types of tasks that can be processed."""
    # Macro tasks (Kilo)
    PLANNING = "planning"           # Create spec, plan, architecture
    DECOMPOSITION = "decomposition" # Break down into smaller tasks
    REVIEW = "review"               # Review and refine plans
    
    # Micro tasks (OpenCode)
    IMPLEMENTATION = "implementation"  # Write code
    BUG_FIX = "bug_fix"               # Fix bugs
    TESTING = "testing"               # Write/run tests
    REFACTORING = "refactoring"       # Refactor code
    
    # Self-handled
    QUESTION = "question"             # Answer questions
    CLARIFICATION = "clarification"   # Ask for clarification
    
    # Unknown
    UNKNOWN = "unknown"


class ExecutorType(str, Enum):
    """Types of executors available."""
    KILO = "kilo"           # Macro-hand
    OPENCODE = "opencode"   # Micro-hand
    SELF = "self"           # Handle internally
    HYBRID = "hybrid"       # Use both (Kilo first, then OpenCode)


# ==================== DATA CLASSES ====================

@dataclass
class RoutingDecision:
    """Represents a routing decision made by the Supervisor."""
    task_id: str
    executor: ExecutorType
    task_type: TaskType
    kilo_mode: Optional[KiloMode] = None
    confidence: float = 0.0
    reasoning: str = ""
    estimated_tokens: int = 0
    created_at: datetime = field(default_factory=datetime.utcnow)
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            "task_id": self.task_id,
            "executor": self.executor.value,
            "task_type": self.task_type.value,
            "kilo_mode": self.kilo_mode.value if self.kilo_mode else None,
            "confidence": self.confidence,
            "reasoning": self.reasoning,
            "estimated_tokens": self.estimated_tokens,
            "created_at": self.created_at.isoformat(),
        }


@dataclass
class SupervisorTask:
    """Represents a task to be processed by the Supervisor."""
    task_id: str
    project_id: str
    user_id: str
    prompt: str
    context: Dict[str, Any] = field(default_factory=dict)
    metadata: Dict[str, Any] = field(default_factory=dict)
    created_at: datetime = field(default_factory=datetime.utcnow)
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            "task_id": self.task_id,
            "project_id": self.project_id,
            "user_id": self.user_id,
            "prompt": self.prompt,
            "context": self.context,
            "metadata": self.metadata,
            "created_at": self.created_at.isoformat(),
        }


@dataclass
class SupervisorResult:
    """Result from Supervisor processing."""
    task_id: str
    success: bool
    routing_decision: RoutingDecision
    executor_result: Optional[Dict[str, Any]] = None
    error: Optional[str] = None
    tokens_used: int = 0
    cost: float = 0.0
    duration_ms: int = 0
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            "task_id": self.task_id,
            "success": self.success,
            "routing_decision": self.routing_decision.to_dict(),
            "executor_result": self.executor_result,
            "error": self.error,
            "tokens_used": self.tokens_used,
            "cost": self.cost,
            "duration_ms": self.duration_ms,
        }


# ==================== SUPERVISOR AGENT ====================

class SupervisorAgent:
    """
    The Supervisor Agent - "Brain" of the system.
    
    Responsibilities:
    1. Analyze incoming tasks to determine their type
    2. Route tasks to appropriate executors (Kilo or OpenCode)
    3. Manage token budgets and costs
    4. Coordinate handoffs between executors
    """
    
    # Keywords for task classification
    PLANNING_KEYWORDS = [
        "สร้าง", "ออกแบบ", "วางแผน", "architecture", "design", "plan",
        "spec", "specification", "requirement", "feature", "ระบบ",
        "create", "build", "develop", "implement new"
    ]
    
    IMPLEMENTATION_KEYWORDS = [
        "เขียน", "code", "implement", "fix", "แก้", "bug", "error",
        "test", "refactor", "optimize", "update", "modify", "change"
    ]
    
    QUESTION_KEYWORDS = [
        "อะไร", "ทำไม", "อย่างไร", "what", "why", "how", "explain",
        "?", "คืออะไร", "หมายความว่า", "ช่วยอธิบาย"
    ]
    
    def __init__(
        self,
        kilo_manager: Optional[KiloSessionManager] = None,
        credit_service: Optional[CreditService] = None,
        default_token_budget: int = 100000,
    ):
        """Initialize the Supervisor Agent."""
        self.kilo_manager = kilo_manager or KiloSessionManager()
        self.credit_service = credit_service
        self.default_token_budget = default_token_budget
        self._active_sessions: Dict[str, KiloSession] = {}
        
        logger.info("supervisor_agent_initialized", token_budget=default_token_budget)
    
    async def process_task(self, task: SupervisorTask) -> SupervisorResult:
        """
        Process a task by analyzing it and routing to the appropriate executor.
        
        Args:
            task: The task to process
            
        Returns:
            SupervisorResult with the outcome
        """
        start_time = datetime.utcnow()
        
        try:
            # Step 1: Analyze and classify the task
            routing_decision = await self._analyze_task(task)
            
            logger.info(
                "task_analyzed",
                task_id=task.task_id,
                executor=routing_decision.executor.value,
                task_type=routing_decision.task_type.value,
                confidence=routing_decision.confidence,
            )
            
            # Step 2: Check token budget
            if not await self._check_budget(task.user_id, routing_decision.estimated_tokens):
                return SupervisorResult(
                    task_id=task.task_id,
                    success=False,
                    routing_decision=routing_decision,
                    error="Insufficient token budget",
                )
            
            # Step 3: Route to appropriate executor
            executor_result = await self._execute_task(task, routing_decision)
            
            # Step 4: Calculate duration and return result
            duration_ms = int((datetime.utcnow() - start_time).total_seconds() * 1000)
            
            return SupervisorResult(
                task_id=task.task_id,
                success=True,
                routing_decision=routing_decision,
                executor_result=executor_result,
                tokens_used=executor_result.get("tokens_used", 0),
                cost=executor_result.get("cost", 0.0),
                duration_ms=duration_ms,
            )
            
        except Exception as e:
            logger.error("supervisor_task_error", task_id=task.task_id, error=str(e))
            duration_ms = int((datetime.utcnow() - start_time).total_seconds() * 1000)
            
            return SupervisorResult(
                task_id=task.task_id,
                success=False,
                routing_decision=RoutingDecision(
                    task_id=task.task_id,
                    executor=ExecutorType.SELF,
                    task_type=TaskType.UNKNOWN,
                ),
                error=str(e),
                duration_ms=duration_ms,
            )
    
    async def _analyze_task(self, task: SupervisorTask) -> RoutingDecision:
        """
        Analyze a task to determine its type and appropriate executor.
        
        Uses keyword matching and context analysis to classify tasks.
        """
        prompt_lower = task.prompt.lower()
        
        # Check for planning/macro tasks
        planning_score = sum(1 for kw in self.PLANNING_KEYWORDS if kw in prompt_lower)
        
        # Check for implementation/micro tasks
        impl_score = sum(1 for kw in self.IMPLEMENTATION_KEYWORDS if kw in prompt_lower)
        
        # Check for questions
        question_score = sum(1 for kw in self.QUESTION_KEYWORDS if kw in prompt_lower)
        
        # Determine task type and executor
        if question_score > planning_score and question_score > impl_score:
            return RoutingDecision(
                task_id=task.task_id,
                executor=ExecutorType.SELF,
                task_type=TaskType.QUESTION,
                confidence=0.8,
                reasoning="Task appears to be a question that can be answered directly",
                estimated_tokens=2000,
            )
        
        if planning_score > impl_score:
            # Macro task - send to Kilo
            kilo_mode = self._determine_kilo_mode(task)
            return RoutingDecision(
                task_id=task.task_id,
                executor=ExecutorType.KILO,
                task_type=TaskType.PLANNING,
                kilo_mode=kilo_mode,
                confidence=0.7 + (planning_score * 0.05),
                reasoning=f"Task requires planning/architecture (score: {planning_score})",
                estimated_tokens=10000,
            )
        
        if impl_score > 0:
            # Check if this is a new feature (needs planning first) or just implementation
            if "new" in prompt_lower or "สร้าง" in prompt_lower or "ใหม่" in prompt_lower:
                # Hybrid: Kilo first for planning, then OpenCode for implementation
                return RoutingDecision(
                    task_id=task.task_id,
                    executor=ExecutorType.HYBRID,
                    task_type=TaskType.PLANNING,
                    kilo_mode=KiloMode.ARCHITECT,
                    confidence=0.75,
                    reasoning="New feature requires planning before implementation",
                    estimated_tokens=20000,
                )
            else:
                # Direct implementation - send to OpenCode
                return RoutingDecision(
                    task_id=task.task_id,
                    executor=ExecutorType.OPENCODE,
                    task_type=TaskType.IMPLEMENTATION,
                    confidence=0.7 + (impl_score * 0.05),
                    reasoning=f"Task is implementation-focused (score: {impl_score})",
                    estimated_tokens=8000,
                )
        
        # Default: Use Kilo in ASK mode for clarification
        return RoutingDecision(
            task_id=task.task_id,
            executor=ExecutorType.KILO,
            task_type=TaskType.CLARIFICATION,
            kilo_mode=KiloMode.ASK,
            confidence=0.5,
            reasoning="Unable to classify task clearly, using ASK mode for clarification",
            estimated_tokens=3000,
        )
    
    def _determine_kilo_mode(self, task: SupervisorTask) -> KiloMode:
        """Determine the appropriate Kilo mode for a task."""
        prompt_lower = task.prompt.lower()
        
        # Check for debug-related keywords
        if any(kw in prompt_lower for kw in ["debug", "bug", "error", "fix", "แก้"]):
            return KiloMode.DEBUG
        
        # Check for code-related keywords
        if any(kw in prompt_lower for kw in ["code", "implement", "เขียน", "โค้ด"]):
            return KiloMode.CODE
        
        # Check for architecture/planning keywords
        if any(kw in prompt_lower for kw in ["design", "architecture", "plan", "ออกแบบ", "วางแผน"]):
            return KiloMode.ARCHITECT
        
        # Default to orchestrator mode for complex tasks
        return KiloMode.ORCHESTRATOR
    
    async def _check_budget(self, user_id: str, estimated_tokens: int) -> bool:
        """Check if user has sufficient token budget."""
        if not self.credit_service:
            return True  # No credit service, allow all
        
        try:
            # Get user's current balance
            balance = await self.credit_service.get_balance(user_id)
            
            # Estimate cost (rough calculation)
            estimated_cost = estimated_tokens * 0.00001  # $0.01 per 1000 tokens
            
            return balance >= estimated_cost
        except Exception as e:
            logger.warning("budget_check_failed", user_id=user_id, error=str(e))
            return True  # Allow on error to not block users
    
    async def _execute_task(
        self,
        task: SupervisorTask,
        decision: RoutingDecision
    ) -> Dict[str, Any]:
        """Execute a task based on the routing decision."""
        
        if decision.executor == ExecutorType.SELF:
            return await self._handle_self(task, decision)
        
        elif decision.executor == ExecutorType.KILO:
            return await self._delegate_to_kilo(task, decision)
        
        elif decision.executor == ExecutorType.OPENCODE:
            return await self._delegate_to_opencode(task, decision)
        
        elif decision.executor == ExecutorType.HYBRID:
            return await self._execute_hybrid(task, decision)
        
        else:
            raise ValueError(f"Unknown executor type: {decision.executor}")
    
    async def _handle_self(
        self,
        task: SupervisorTask,
        decision: RoutingDecision
    ) -> Dict[str, Any]:
        """Handle task internally (questions, clarifications)."""
        # For now, return a placeholder response
        # In production, this would use the LLM to generate a response
        return {
            "type": "self_response",
            "message": "This task was handled internally by the Supervisor.",
            "tokens_used": 100,
            "cost": 0.001,
        }
    
    async def _delegate_to_kilo(
        self,
        task: SupervisorTask,
        decision: RoutingDecision
    ) -> Dict[str, Any]:
        """Delegate task to Kilo Code."""
        try:
            # Get or create Kilo session
            session = await self._get_or_create_kilo_session(
                project_id=task.project_id,
                mode=decision.kilo_mode or KiloMode.ORCHESTRATOR,
            )
            
            # Execute task in Kilo
            result = await self.kilo_manager.execute_task(
                session_id=session.session_id,
                prompt=task.prompt,
            )
            
            return {
                "type": "kilo_response",
                "session_id": session.session_id,
                "mode": decision.kilo_mode.value if decision.kilo_mode else None,
                "result": result,
                "tokens_used": result.get("tokens_used", 0),
                "cost": result.get("cost", 0.0),
            }
            
        except Exception as e:
            logger.error("kilo_delegation_failed", task_id=task.task_id, error=str(e))
            raise
    
    async def _delegate_to_opencode(
        self,
        task: SupervisorTask,
        decision: RoutingDecision
    ) -> Dict[str, Any]:
        """Delegate task to OpenCode."""
        # OpenCode integration will be implemented in Phase 1.2
        # For now, return a placeholder
        return {
            "type": "opencode_response",
            "message": "OpenCode integration pending (Phase 1.2)",
            "tokens_used": 0,
            "cost": 0.0,
        }
    
    async def _execute_hybrid(
        self,
        task: SupervisorTask,
        decision: RoutingDecision
    ) -> Dict[str, Any]:
        """Execute hybrid workflow: Kilo for planning, then OpenCode for implementation."""
        # Step 1: Send to Kilo for planning
        kilo_result = await self._delegate_to_kilo(task, decision)
        
        # Step 2: Parse Kilo output for micro-tasks
        # This will be implemented in Phase 1.3 (Handoff Protocol)
        micro_tasks = self._parse_kilo_output_for_tasks(kilo_result)
        
        # Step 3: Send micro-tasks to OpenCode
        opencode_results = []
        for micro_task in micro_tasks:
            result = await self._delegate_to_opencode(micro_task, decision)
            opencode_results.append(result)
        
        return {
            "type": "hybrid_response",
            "kilo_result": kilo_result,
            "opencode_results": opencode_results,
            "tokens_used": kilo_result.get("tokens_used", 0) + sum(
                r.get("tokens_used", 0) for r in opencode_results
            ),
            "cost": kilo_result.get("cost", 0.0) + sum(
                r.get("cost", 0.0) for r in opencode_results
            ),
        }
    
    def _parse_kilo_output_for_tasks(
        self,
        kilo_result: Dict[str, Any]
    ) -> List[SupervisorTask]:
        """Parse Kilo output to extract micro-tasks for OpenCode."""
        # This will be implemented in Phase 1.3 (Handoff Protocol)
        # For now, return empty list
        return []
    
    async def _get_or_create_kilo_session(
        self,
        project_id: str,
        mode: KiloMode,
    ) -> KiloSession:
        """Get existing Kilo session or create a new one."""
        session_key = f"{project_id}:{mode.value}"
        
        if session_key in self._active_sessions:
            session = self._active_sessions[session_key]
            # Check if session is still valid
            if await self.kilo_manager.is_session_active(session.session_id):
                return session
        
        # Create new session
        session = await self.kilo_manager.create_session(
            project_id=project_id,
            mode=mode,
        )
        
        self._active_sessions[session_key] = session
        return session
    
    async def cleanup(self):
        """Cleanup all active sessions."""
        for session in self._active_sessions.values():
            try:
                await self.kilo_manager.stop_session(session.session_id)
            except Exception as e:
                logger.warning("session_cleanup_failed", session_id=session.session_id, error=str(e))
        
        self._active_sessions.clear()
        logger.info("supervisor_cleanup_complete")
