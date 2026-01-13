"""
Unit Tests for Supervisor Agent
Phase 1: Core Loop Implementation
"""

import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from datetime import datetime

from app.orchestrator.agents.supervisor import (
    SupervisorAgent,
    TaskType,
    RoutingDecision,
)


class TestSupervisorAgent:
    """Test suite for SupervisorAgent."""
    
    @pytest.fixture
    def supervisor(self):
        """Create a SupervisorAgent instance for testing."""
        return SupervisorAgent()
    
    # ==================== Task Classification Tests ====================
    
    @pytest.mark.asyncio
    async def test_classify_architecture_task(self, supervisor):
        """Test classification of architecture-related tasks."""
        prompts = [
            "Design a new authentication system",
            "Create the architecture for a payment gateway",
            "Plan the database schema for user management",
            "Architect a microservices solution",
        ]
        
        for prompt in prompts:
            task_type = await supervisor.classify_task(prompt)
            assert task_type == TaskType.ARCHITECTURE, f"Failed for: {prompt}"
    
    @pytest.mark.asyncio
    async def test_classify_implementation_task(self, supervisor):
        """Test classification of implementation tasks."""
        prompts = [
            "Implement the login function",
            "Write code for the API endpoint",
            "Add validation to the form",
            "Create a new component for the dashboard",
        ]
        
        for prompt in prompts:
            task_type = await supervisor.classify_task(prompt)
            assert task_type == TaskType.IMPLEMENTATION, f"Failed for: {prompt}"
    
    @pytest.mark.asyncio
    async def test_classify_bugfix_task(self, supervisor):
        """Test classification of bugfix tasks."""
        prompts = [
            "Fix the login bug",
            "Debug the payment processing error",
            "Resolve the null pointer exception",
            "Fix issue #123",
        ]
        
        for prompt in prompts:
            task_type = await supervisor.classify_task(prompt)
            assert task_type == TaskType.BUGFIX, f"Failed for: {prompt}"
    
    @pytest.mark.asyncio
    async def test_classify_testing_task(self, supervisor):
        """Test classification of testing tasks."""
        prompts = [
            "Write unit tests for the auth module",
            "Add integration tests for the API",
            "Create test coverage for the service",
            "Test the new feature",
        ]
        
        for prompt in prompts:
            task_type = await supervisor.classify_task(prompt)
            assert task_type == TaskType.TESTING, f"Failed for: {prompt}"
    
    @pytest.mark.asyncio
    async def test_classify_refactor_task(self, supervisor):
        """Test classification of refactoring tasks."""
        prompts = [
            "Refactor the database layer",
            "Clean up the legacy code",
            "Optimize the query performance",
            "Restructure the module",
        ]
        
        for prompt in prompts:
            task_type = await supervisor.classify_task(prompt)
            assert task_type == TaskType.REFACTOR, f"Failed for: {prompt}"
    
    # ==================== Routing Decision Tests ====================
    
    @pytest.mark.asyncio
    async def test_route_to_kilo_for_architecture(self, supervisor):
        """Test that architecture tasks are routed to Kilo."""
        decision = await supervisor.route_task(
            prompt="Design a new microservices architecture",
            task_type=TaskType.ARCHITECTURE,
        )
        
        assert decision.target == "kilo"
        assert decision.mode == "architect"
    
    @pytest.mark.asyncio
    async def test_route_to_opencode_for_implementation(self, supervisor):
        """Test that implementation tasks are routed to OpenCode."""
        decision = await supervisor.route_task(
            prompt="Implement the login function",
            task_type=TaskType.IMPLEMENTATION,
        )
        
        assert decision.target == "opencode"
    
    @pytest.mark.asyncio
    async def test_route_to_opencode_for_bugfix(self, supervisor):
        """Test that bugfix tasks are routed to OpenCode."""
        decision = await supervisor.route_task(
            prompt="Fix the authentication bug",
            task_type=TaskType.BUGFIX,
        )
        
        assert decision.target == "opencode"
    
    @pytest.mark.asyncio
    async def test_route_complex_task_to_handoff(self, supervisor):
        """Test that complex tasks trigger handoff protocol."""
        decision = await supervisor.route_task(
            prompt="Build a complete user management system with authentication, authorization, and profile management",
            task_type=TaskType.ARCHITECTURE,
            complexity="high",
        )
        
        assert decision.use_handoff is True
    
    # ==================== Context Management Tests ====================
    
    @pytest.mark.asyncio
    async def test_context_accumulation(self, supervisor):
        """Test that context is accumulated across interactions."""
        # First interaction
        await supervisor.process_interaction(
            prompt="Create a user service",
            result="Created user_service.py",
        )
        
        # Second interaction
        await supervisor.process_interaction(
            prompt="Add authentication to the user service",
            result="Added auth to user_service.py",
        )
        
        context = supervisor.get_context()
        assert len(context["interactions"]) == 2
    
    @pytest.mark.asyncio
    async def test_context_includes_files(self, supervisor):
        """Test that context tracks modified files."""
        await supervisor.process_interaction(
            prompt="Create a user service",
            result="Created user_service.py",
            files_modified=["app/services/user_service.py"],
        )
        
        context = supervisor.get_context()
        assert "app/services/user_service.py" in context.get("files_modified", [])
    
    # ==================== Budget Integration Tests ====================
    
    @pytest.mark.asyncio
    async def test_respects_token_budget(self, supervisor):
        """Test that supervisor respects token budget limits."""
        # Set a low budget
        supervisor.set_token_budget(max_tokens=1000)
        
        # Try to route a task
        decision = await supervisor.route_task(
            prompt="Implement a complex feature",
            task_type=TaskType.IMPLEMENTATION,
            estimated_tokens=5000,
        )
        
        # Should recommend smaller scope
        assert decision.recommended_max_tokens <= 1000
    
    # ==================== Error Handling Tests ====================
    
    @pytest.mark.asyncio
    async def test_handles_empty_prompt(self, supervisor):
        """Test handling of empty prompts."""
        with pytest.raises(ValueError):
            await supervisor.classify_task("")
    
    @pytest.mark.asyncio
    async def test_handles_invalid_task_type(self, supervisor):
        """Test handling of invalid task types."""
        decision = await supervisor.route_task(
            prompt="Do something",
            task_type=None,
        )
        
        # Should default to a safe option
        assert decision.target in ["kilo", "opencode"]


class TestRoutingDecision:
    """Test suite for RoutingDecision dataclass."""
    
    def test_routing_decision_creation(self):
        """Test creating a RoutingDecision."""
        decision = RoutingDecision(
            target="kilo",
            mode="architect",
            use_handoff=False,
            reason="Architecture task",
        )
        
        assert decision.target == "kilo"
        assert decision.mode == "architect"
        assert decision.use_handoff is False
    
    def test_routing_decision_to_dict(self):
        """Test converting RoutingDecision to dictionary."""
        decision = RoutingDecision(
            target="opencode",
            mode=None,
            use_handoff=True,
            reason="Complex implementation",
        )
        
        result = decision.to_dict()
        
        assert result["target"] == "opencode"
        assert result["use_handoff"] is True
        assert "reason" in result
