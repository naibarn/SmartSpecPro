"""
SmartSpec Pro - Integration Tests
E2E Tests for Supervisor Agent Flow
"""

import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from datetime import datetime

from app.orchestrator.supervisor_integration import (
    SupervisorIntegration,
    ExecutionContext,
    ExecutionResult,
    ExecutionStatus,
    AgentOutput,
)
from app.orchestrator.agents.supervisor import (
    SupervisorAgent,
    SupervisorConfig,
    TaskAnalysis,
    TaskComplexity,
    AgentType,
)
from app.orchestrator.agents.token_budget_controller import (
    TokenBudgetController,
    BudgetConfig,
    BudgetAllocation,
)


class TestSupervisorE2E:
    """End-to-end tests for Supervisor Agent flow."""
    
    @pytest.fixture
    def mock_credit_service(self):
        """Create mock credit service."""
        service = MagicMock()
        service.get_balance = AsyncMock(return_value=MagicMock(available=10000))
        service.deduct_credits = AsyncMock(return_value=True)
        return service
    
    @pytest.fixture
    def supervisor_integration(self, mock_credit_service):
        """Create supervisor integration instance."""
        return SupervisorIntegration(
            credit_service=mock_credit_service,
            supervisor_config=SupervisorConfig(
                default_model="gpt-4o-mini",
                max_analysis_tokens=1000,
            ),
            budget_config=BudgetConfig(
                default_budget=5000,
                warning_threshold=0.8,
            ),
        )
    
    @pytest.mark.asyncio
    async def test_simple_task_execution(self, supervisor_integration):
        """Test simple task execution flow."""
        # Mock the adapters
        with patch.object(
            supervisor_integration.kilo_adapter,
            'execute',
            new_callable=AsyncMock
        ) as mock_kilo:
            mock_kilo.return_value = MagicMock(
                content="Task completed successfully",
                artifacts=[],
                is_complete=True,
                needs_implementation=False,
                tokens_used=500,
                model_used="gpt-4o-mini",
            )
            
            with patch.object(
                supervisor_integration.supervisor,
                'analyze_task',
                new_callable=AsyncMock
            ) as mock_analyze:
                mock_analyze.return_value = TaskAnalysis(
                    complexity=TaskComplexity.SIMPLE,
                    recommended_agent=AgentType.KILO,
                    reasoning="Simple planning task",
                    estimated_tokens=500,
                )
                
                result = await supervisor_integration.execute_task(
                    execution_id="test-exec-001",
                    user_id="user-001",
                    prompt="Create a simple spec for a todo app",
                    workspace="/tmp/test-workspace",
                )
                
                assert result.is_success
                assert result.status == ExecutionStatus.COMPLETED
                assert len(result.outputs) == 1
                assert result.outputs[0].agent == AgentType.KILO
    
    @pytest.mark.asyncio
    async def test_complex_task_with_handoff(self, supervisor_integration):
        """Test complex task with handoff between agents."""
        # Mock Kilo adapter (first call - planning)
        kilo_result_1 = MagicMock(
            content="Plan created: 1. Setup project 2. Implement features",
            artifacts=[{"type": "plan", "path": "plan.md"}],
            is_complete=False,
            needs_implementation=True,
            next_prompt="Implement the planned features",
            tokens_used=800,
            model_used="gpt-4o",
        )
        
        # Mock OpenCode adapter (second call - implementation)
        opencode_result = MagicMock(
            content="Implementation completed",
            artifacts=[{"type": "code", "path": "src/main.py"}],
            is_complete=True,
            needs_planning=False,
            tokens_used=1200,
            model_used="claude-3.5-sonnet",
        )
        
        with patch.object(
            supervisor_integration.kilo_adapter,
            'execute',
            new_callable=AsyncMock,
            return_value=kilo_result_1,
        ):
            with patch.object(
                supervisor_integration.opencode_adapter,
                'execute',
                new_callable=AsyncMock,
                return_value=opencode_result,
            ):
                with patch.object(
                    supervisor_integration.supervisor,
                    'analyze_task',
                    new_callable=AsyncMock,
                ) as mock_analyze:
                    mock_analyze.return_value = TaskAnalysis(
                        complexity=TaskComplexity.COMPLEX,
                        recommended_agent=AgentType.KILO,
                        reasoning="Complex task requiring planning then implementation",
                        estimated_tokens=2000,
                    )
                    
                    with patch.object(
                        supervisor_integration.handoff_protocol,
                        'execute_handoff',
                        new_callable=AsyncMock,
                    ) as mock_handoff:
                        mock_handoff.return_value = MagicMock(
                            success=True,
                            context_for_target="Implement the planned features",
                        )
                        
                        result = await supervisor_integration.execute_task(
                            execution_id="test-exec-002",
                            user_id="user-001",
                            prompt="Build a complete REST API",
                            workspace="/tmp/test-workspace",
                        )
                        
                        assert result.is_success
                        assert len(result.outputs) >= 1
    
    @pytest.mark.asyncio
    async def test_budget_exhaustion(self, supervisor_integration):
        """Test handling of budget exhaustion."""
        # Set up a very low budget
        supervisor_integration.budget_controller = TokenBudgetController(
            config=BudgetConfig(default_budget=100)
        )
        
        with patch.object(
            supervisor_integration.kilo_adapter,
            'execute',
            new_callable=AsyncMock,
        ) as mock_kilo:
            # Return result that uses all budget
            mock_kilo.return_value = MagicMock(
                content="Partial result",
                artifacts=[],
                is_complete=False,
                needs_implementation=True,
                tokens_used=150,  # Exceeds budget
                model_used="gpt-4o",
            )
            
            with patch.object(
                supervisor_integration.supervisor,
                'analyze_task',
                new_callable=AsyncMock,
            ) as mock_analyze:
                mock_analyze.return_value = TaskAnalysis(
                    complexity=TaskComplexity.COMPLEX,
                    recommended_agent=AgentType.KILO,
                    reasoning="Complex task",
                    estimated_tokens=500,
                )
                
                result = await supervisor_integration.execute_task(
                    execution_id="test-exec-003",
                    user_id="user-001",
                    prompt="Complex task",
                    workspace="/tmp/test-workspace",
                )
                
                # Should complete (possibly with warning) due to budget
                assert result.status == ExecutionStatus.COMPLETED
    
    @pytest.mark.asyncio
    async def test_insufficient_credits(self, supervisor_integration):
        """Test handling of insufficient credits."""
        # Mock credit service to return 0 balance
        supervisor_integration.credit_service.get_balance = AsyncMock(
            return_value=MagicMock(available=0)
        )
        
        result = await supervisor_integration.execute_task(
            execution_id="test-exec-004",
            user_id="user-001",
            prompt="Any task",
            workspace="/tmp/test-workspace",
        )
        
        assert result.status == ExecutionStatus.FAILED
        assert "Insufficient credits" in result.error
    
    @pytest.mark.asyncio
    async def test_max_iterations_reached(self, supervisor_integration):
        """Test handling of max iterations."""
        # Mock adapter to never complete
        with patch.object(
            supervisor_integration.kilo_adapter,
            'execute',
            new_callable=AsyncMock,
        ) as mock_kilo:
            mock_kilo.return_value = MagicMock(
                content="Still working...",
                artifacts=[],
                is_complete=False,
                needs_implementation=False,
                next_prompt="Continue...",
                tokens_used=100,
                model_used="gpt-4o-mini",
            )
            
            with patch.object(
                supervisor_integration.supervisor,
                'analyze_task',
                new_callable=AsyncMock,
            ) as mock_analyze:
                mock_analyze.return_value = TaskAnalysis(
                    complexity=TaskComplexity.SIMPLE,
                    recommended_agent=AgentType.KILO,
                    reasoning="Simple task",
                    estimated_tokens=100,
                )
                
                result = await supervisor_integration.execute_task(
                    execution_id="test-exec-005",
                    user_id="user-001",
                    prompt="Infinite task",
                    workspace="/tmp/test-workspace",
                    max_iterations=3,
                )
                
                assert result.status == ExecutionStatus.COMPLETED
                assert result.warning == "Max iterations reached"
                assert len(result.outputs) == 3


class TestSupervisorAgent:
    """Unit tests for Supervisor Agent."""
    
    @pytest.fixture
    def supervisor(self):
        """Create supervisor agent instance."""
        return SupervisorAgent(config=SupervisorConfig())
    
    @pytest.mark.asyncio
    async def test_analyze_simple_task(self, supervisor):
        """Test analysis of simple task."""
        with patch.object(
            supervisor,
            '_call_llm',
            new_callable=AsyncMock,
        ) as mock_llm:
            mock_llm.return_value = {
                "complexity": "simple",
                "recommended_agent": "kilo",
                "reasoning": "Simple planning task",
                "estimated_tokens": 500,
            }
            
            analysis = await supervisor.analyze_task(
                prompt="Create a simple README",
                context={},
            )
            
            assert analysis.complexity == TaskComplexity.SIMPLE
            assert analysis.recommended_agent == AgentType.KILO
    
    @pytest.mark.asyncio
    async def test_analyze_implementation_task(self, supervisor):
        """Test analysis of implementation task."""
        with patch.object(
            supervisor,
            '_call_llm',
            new_callable=AsyncMock,
        ) as mock_llm:
            mock_llm.return_value = {
                "complexity": "medium",
                "recommended_agent": "opencode",
                "reasoning": "Implementation task",
                "estimated_tokens": 1500,
            }
            
            analysis = await supervisor.analyze_task(
                prompt="Fix the bug in auth.py line 42",
                context={},
            )
            
            assert analysis.recommended_agent == AgentType.OPENCODE


class TestTokenBudgetController:
    """Unit tests for Token Budget Controller."""
    
    @pytest.fixture
    def controller(self):
        """Create budget controller instance."""
        return TokenBudgetController(
            config=BudgetConfig(
                default_budget=5000,
                warning_threshold=0.8,
            )
        )
    
    def test_allocate_budget(self, controller):
        """Test budget allocation."""
        allocation = controller.allocate_budget(
            execution_id="exec-001",
            available_credits=10000,
        )
        
        assert allocation.execution_id == "exec-001"
        assert allocation.total_budget == 5000
        assert allocation.is_sufficient
    
    def test_record_usage(self, controller):
        """Test recording token usage."""
        controller.allocate_budget("exec-001", 10000)
        
        controller.record_usage(
            execution_id="exec-001",
            tokens=1000,
            model="gpt-4o",
        )
        
        usage = controller.get_usage("exec-001")
        assert usage.total_tokens == 1000
    
    def test_budget_check(self, controller):
        """Test budget check."""
        controller.allocate_budget("exec-001", 10000)
        
        # Should have budget
        assert controller.check_budget("exec-001")
        
        # Use most of budget
        controller.record_usage("exec-001", 4500, "gpt-4o")
        
        # Should still have budget (but warning)
        assert controller.check_budget("exec-001")
        
        # Use remaining budget
        controller.record_usage("exec-001", 600, "gpt-4o")
        
        # Should be out of budget
        assert not controller.check_budget("exec-001")
    
    def test_release_budget(self, controller):
        """Test releasing budget."""
        controller.allocate_budget("exec-001", 10000)
        controller.record_usage("exec-001", 1000, "gpt-4o")
        
        controller.release_budget("exec-001")
        
        # Should not have usage anymore
        assert controller.get_usage("exec-001") is None


class TestExecutionContext:
    """Unit tests for Execution Context."""
    
    def test_context_creation(self):
        """Test context creation."""
        context = ExecutionContext(
            execution_id="exec-001",
            user_id="user-001",
            workspace="/tmp/workspace",
            project_context={"name": "test-project"},
        )
        
        assert context.execution_id == "exec-001"
        assert context.user_id == "user-001"
        assert context.workspace == "/tmp/workspace"
        assert context.project_context["name"] == "test-project"
        assert context.created_at is not None


class TestExecutionResult:
    """Unit tests for Execution Result."""
    
    def test_successful_result(self):
        """Test successful execution result."""
        outputs = [
            AgentOutput(
                agent=AgentType.KILO,
                content="Plan created",
                tokens_used=500,
            ),
            AgentOutput(
                agent=AgentType.OPENCODE,
                content="Implementation done",
                tokens_used=1000,
            ),
        ]
        
        result = ExecutionResult(
            execution_id="exec-001",
            status=ExecutionStatus.COMPLETED,
            outputs=outputs,
        )
        
        assert result.is_success
        assert result.final_output == "Implementation done"
        assert result.total_tokens == 1500
    
    def test_failed_result(self):
        """Test failed execution result."""
        result = ExecutionResult(
            execution_id="exec-001",
            status=ExecutionStatus.FAILED,
            error="Something went wrong",
        )
        
        assert not result.is_success
        assert result.error == "Something went wrong"
        assert result.final_output is None
