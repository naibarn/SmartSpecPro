"""
Unit tests for Enhanced Orchestration features:
- Parallel execution
- Resume from checkpoint
"""

import pytest
from unittest.mock import Mock, AsyncMock, patch, MagicMock
from datetime import datetime

from app.orchestrator.orchestrator import WorkflowOrchestrator
from app.orchestrator.models import (
    ExecutionState,
    ExecutionStatus,
    ParallelExecution,
    CheckpointData,
    WorkflowStep,
)


class TestParallelExecution:
    """Test parallel execution logic."""
    
    @pytest.fixture
    def orchestrator(self):
        """Create orchestrator instance."""
        with patch('app.orchestrator.orchestrator.get_checkpointer'):
            with patch('app.orchestrator.orchestrator.llm_proxy'):
                orch = WorkflowOrchestrator()
                return orch
    
    @pytest.fixture
    def sample_steps(self):
        """Create sample workflow steps."""
        return [
            {"id": "step_0", "name": "Setup", "type": "llm"},
            {"id": "step_1", "name": "Task A", "type": "llm"},
            {"id": "step_2", "name": "Task B", "type": "llm"},
            {"id": "step_3", "name": "Task C", "type": "llm"},
            {"id": "step_4", "name": "Finalize", "type": "llm"},
        ]
    
    def test_add_sequential_edges(self, orchestrator, sample_steps):
        """Test sequential edge creation."""
        mock_workflow = Mock()
        
        orchestrator._add_sequential_edges(mock_workflow, sample_steps)
        
        # Should add edges: 0->1, 1->2, 2->3, 3->4, 4->END
        assert mock_workflow.add_edge.call_count == 5
        
        calls = mock_workflow.add_edge.call_args_list
        assert calls[0][0] == ("step_0", "step_1")
        assert calls[1][0] == ("step_1", "step_2")
        assert calls[2][0] == ("step_2", "step_3")
        assert calls[3][0] == ("step_3", "step_4")
    
    def test_add_parallel_edges_empty_parallel_steps(self, orchestrator, sample_steps):
        """Test parallel edges with empty parallel steps falls back to sequential."""
        mock_workflow = Mock()
        
        orchestrator._add_parallel_edges(mock_workflow, sample_steps, [])
        
        # Should fall back to sequential
        assert mock_workflow.add_edge.call_count == 5
    
    def test_add_parallel_edges_with_parallel_steps(self, orchestrator, sample_steps):
        """Test parallel edges with parallel steps creates fork-join pattern."""
        mock_workflow = Mock()
        parallel_steps = ["step_1", "step_2", "step_3"]
        
        orchestrator._add_parallel_edges(mock_workflow, sample_steps, parallel_steps)
        
        # Should create fork-join pattern:
        # step_0 -> step_1 -> step_4
        # step_0 -> step_2 -> step_4
        # step_0 -> step_3 -> step_4
        # step_4 -> END
        
        calls = mock_workflow.add_edge.call_args_list
        call_args = [c[0] for c in calls]
        
        # Fork edges (step_0 to parallel steps)
        assert ("step_0", "step_1") in call_args
        assert ("step_0", "step_2") in call_args
        assert ("step_0", "step_3") in call_args
        
        # Join edges (parallel steps to step_4)
        assert ("step_1", "step_4") in call_args
        assert ("step_2", "step_4") in call_args
        assert ("step_3", "step_4") in call_args
    
    def test_add_parallel_edges_invalid_parallel_steps(self, orchestrator, sample_steps):
        """Test parallel edges with invalid step IDs falls back to sequential."""
        mock_workflow = Mock()
        parallel_steps = ["invalid_step_1", "invalid_step_2"]
        
        orchestrator._add_parallel_edges(mock_workflow, sample_steps, parallel_steps)
        
        # Should fall back to sequential since no valid parallel steps
        assert mock_workflow.add_edge.call_count == 5
    
    def test_add_parallel_edges_single_parallel_step(self, orchestrator, sample_steps):
        """Test parallel edges with single parallel step."""
        mock_workflow = Mock()
        parallel_steps = ["step_2"]
        
        orchestrator._add_parallel_edges(mock_workflow, sample_steps, parallel_steps)
        
        # Should still work with single parallel step
        calls = mock_workflow.add_edge.call_args_list
        call_args = [c[0] for c in calls]
        
        # Fork edge
        assert ("step_1", "step_2") in call_args
        # Join edge
        assert ("step_2", "step_3") in call_args
    
    def test_parallel_config_model(self):
        """Test ParallelExecution model."""
        config = ParallelExecution(
            enabled=True,
            max_parallel=3,
            steps=["step_1", "step_2", "step_3"]
        )
        
        assert config.enabled is True
        assert config.max_parallel == 3
        assert len(config.steps) == 3
    
    def test_parallel_config_defaults(self):
        """Test ParallelExecution default values."""
        config = ParallelExecution()
        
        assert config.enabled is True
        assert config.max_parallel == 5
        assert config.steps == []


class TestResumeFromCheckpoint:
    """Test resume from checkpoint functionality."""
    
    @pytest.fixture
    def orchestrator(self):
        """Create orchestrator instance."""
        with patch('app.orchestrator.orchestrator.get_checkpointer'):
            with patch('app.orchestrator.orchestrator.llm_proxy'):
                orch = WorkflowOrchestrator()
                return orch
    
    @pytest.fixture
    def sample_checkpoint(self):
        """Create sample checkpoint data."""
        state = ExecutionState(
            execution_id="exec_123",
            workflow_id="workflow_456",
            status=ExecutionStatus.PAUSED,
            created_at=datetime.now(),
            updated_at=datetime.now(),
            user_prompt="Test prompt",
            goal="Test goal",
            current_step_id="step_2",
            completed_steps=2,
            total_steps=5,
            aggregate_output={"step_0": "output_0", "step_1": "output_1"}
        )
        
        return CheckpointData(
            checkpoint_id="cp_789",
            execution_id="exec_123",
            created_at=datetime.now(),
            state=state,
            step_id="step_2",
            step_name="Task B",
            can_resume=True,
            metadata={
                "steps": [
                    {"id": "step_0", "name": "Setup"},
                    {"id": "step_1", "name": "Task A"},
                    {"id": "step_2", "name": "Task B"},
                    {"id": "step_3", "name": "Task C"},
                    {"id": "step_4", "name": "Finalize"},
                ]
            }
        )
    
    @pytest.mark.asyncio
    async def test_resume_checkpoint_not_found(self, orchestrator):
        """Test resume with non-existent checkpoint."""
        with patch('app.orchestrator.orchestrator.checkpoint_manager') as mock_cm:
            mock_cm.load_checkpoint.return_value = None
            
            with pytest.raises(ValueError, match="Checkpoint not found"):
                await orchestrator.resume_from_checkpoint("invalid_cp")
    
    @pytest.mark.asyncio
    async def test_resume_checkpoint_cannot_resume(self, orchestrator, sample_checkpoint):
        """Test resume with non-resumable checkpoint."""
        sample_checkpoint.can_resume = False
        
        with patch('app.orchestrator.orchestrator.checkpoint_manager') as mock_cm:
            mock_cm.load_checkpoint.return_value = sample_checkpoint
            
            with pytest.raises(ValueError, match="cannot be resumed"):
                await orchestrator.resume_from_checkpoint("cp_789")
    
    @pytest.mark.asyncio
    async def test_resume_no_steps(self, orchestrator, sample_checkpoint):
        """Test resume with no steps in checkpoint or parameters."""
        sample_checkpoint.metadata = {}
        
        with patch('app.orchestrator.orchestrator.checkpoint_manager') as mock_cm:
            mock_cm.load_checkpoint.return_value = sample_checkpoint
            
            with pytest.raises(ValueError, match="No workflow steps found"):
                await orchestrator.resume_from_checkpoint("cp_789")
    
    @pytest.mark.asyncio
    async def test_resume_step_not_found(self, orchestrator, sample_checkpoint):
        """Test resume with checkpoint step not in workflow."""
        sample_checkpoint.step_id = "invalid_step"
        
        with patch('app.orchestrator.orchestrator.checkpoint_manager') as mock_cm:
            mock_cm.load_checkpoint.return_value = sample_checkpoint
            
            with pytest.raises(ValueError, match="not found in workflow steps"):
                await orchestrator.resume_from_checkpoint("cp_789")
    
    @pytest.mark.asyncio
    async def test_resume_successful(self, orchestrator, sample_checkpoint):
        """Test successful resume from checkpoint."""
        with patch('app.orchestrator.orchestrator.checkpoint_manager') as mock_cm:
            with patch('app.orchestrator.orchestrator.state_manager') as mock_sm:
                mock_cm.load_checkpoint.return_value = sample_checkpoint
                mock_sm.get_state.return_value = sample_checkpoint.state
                mock_sm.states = {}
                
                # Mock _build_graph to return a mock graph
                mock_graph = AsyncMock()
                mock_graph.astream = AsyncMock(return_value=iter([
                    {"step_2": {"output": "result_2"}},
                    {"step_3": {"output": "result_3"}},
                    {"step_4": {"output": "result_4"}},
                ]))
                
                with patch.object(orchestrator, '_build_graph', return_value=mock_graph):
                    result = await orchestrator.resume_from_checkpoint("cp_789")
                    
                    # Should restore state
                    assert mock_sm.states["exec_123"] == sample_checkpoint.state
                    
                    # Should update status to running
                    mock_sm.update_status.assert_called()
    
    def test_checkpoint_data_model(self):
        """Test CheckpointData model."""
        state = ExecutionState(
            execution_id="exec_123",
            workflow_id="workflow_456",
            status=ExecutionStatus.PAUSED,
            created_at=datetime.now(),
            updated_at=datetime.now(),
            user_prompt="Test",
            goal="Test goal"
        )
        
        checkpoint = CheckpointData(
            checkpoint_id="cp_123",
            execution_id="exec_123",
            created_at=datetime.now(),
            state=state,
            step_id="step_1",
            step_name="Test Step",
            can_resume=True
        )
        
        assert checkpoint.checkpoint_id == "cp_123"
        assert checkpoint.can_resume is True
        assert checkpoint.step_id == "step_1"


class TestMiddlewareIntegration:
    """Test middleware integration."""
    
    def test_rate_limiter_import(self):
        """Test rate limiter can be imported."""
        from app.core.security import rate_limiter
        assert rate_limiter is not None
    
    def test_rate_limiter_check(self):
        """Test rate limiter check function."""
        from app.core.security import RateLimiter
        
        limiter = RateLimiter(max_requests=5, window_seconds=60)
        
        # First 5 requests should pass
        for _ in range(5):
            assert limiter.check_rate_limit("test_client") is True
        
        # 6th request should fail
        assert limiter.check_rate_limit("test_client") is False
    
    def test_security_headers_middleware_import(self):
        """Test security headers middleware can be imported."""
        from app.core.middleware import SecurityHeadersMiddleware
        assert SecurityHeadersMiddleware is not None
    
    def test_request_validation_middleware_import(self):
        """Test request validation middleware can be imported."""
        from app.core.request_validator import RequestValidationMiddleware
        assert RequestValidationMiddleware is not None
    
    def test_setup_middleware_import(self):
        """Test setup_middleware function can be imported."""
        from app.core.middleware import setup_middleware
        assert setup_middleware is not None


class TestProviderFactoryFixed:
    """Test that provider factory tests are no longer skipped."""
    
    def test_factory_creates_openai_when_key_exists(self):
        """Test factory creates OpenAI provider when API key is set."""
        from app.llm_proxy.providers.factory import ProviderFactory
        
        class MockSettings:
            OPENAI_API_KEY = "test-key"
            OPENAI_BASE_URL = None
            ANTHROPIC_API_KEY = None
            GOOGLE_API_KEY = None
            GROQ_API_KEY = None
            OLLAMA_BASE_URL = "http://localhost:11434"
            OPENROUTER_API_KEY = None
            ZAI_API_KEY = None
        
        factory = ProviderFactory(MockSettings())
        providers = factory.create_all_providers()
        
        assert "openai" in providers
        assert "anthropic" not in providers
        assert providers["openai"].name == "OpenAI"
    
    def test_factory_creates_ollama_disabled(self):
        """Test factory creates Ollama provider but disabled."""
        from app.llm_proxy.providers.factory import ProviderFactory
        
        class MockSettings:
            OPENAI_API_KEY = None
            ANTHROPIC_API_KEY = None
            GOOGLE_API_KEY = None
            GROQ_API_KEY = None
            OLLAMA_BASE_URL = "http://localhost:11434"
            OPENROUTER_API_KEY = None
            ZAI_API_KEY = None
        
        factory = ProviderFactory(MockSettings())
        providers = factory.create_all_providers()
        
        assert "ollama" in providers
        assert not providers["ollama"].enabled
