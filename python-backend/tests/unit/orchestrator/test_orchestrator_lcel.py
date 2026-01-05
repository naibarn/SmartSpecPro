"""
Unit tests for Orchestrator LCEL integration.
"""

import pytest
from unittest.mock import Mock, AsyncMock, patch, MagicMock

from app.orchestrator.orchestrator import WorkflowOrchestrator
from app.orchestrator.lcel_chains import (
    TaskType,
    BudgetPriority,
    ChainInput,
    ChainOutput,
    StreamingChunk,
)


class TestOrchestratorLCELInit:
    """Tests for LCEL initialization in orchestrator."""
    
    def test_init_creates_chain_executor_attribute(self):
        """Test that init creates chain executor attribute."""
        orchestrator = WorkflowOrchestrator(use_postgres=False)
        
        assert hasattr(orchestrator, '_chain_executor')
        assert orchestrator._chain_executor is None
        assert hasattr(orchestrator, '_use_lcel')
        assert orchestrator._use_lcel is True
    
    @patch('app.orchestrator.orchestrator.get_chain_executor')
    def test_chain_executor_property_lazy_init(self, mock_get_executor):
        """Test that chain executor is lazily initialized."""
        mock_executor = MagicMock()
        mock_get_executor.return_value = mock_executor
        
        orchestrator = WorkflowOrchestrator(use_postgres=False)
        
        # Not initialized yet
        assert orchestrator._chain_executor is None
        
        # Access property triggers initialization
        executor = orchestrator.chain_executor
        
        assert executor is mock_executor
        mock_get_executor.assert_called_once()


class TestExecuteLLMStep:
    """Tests for _execute_llm_step method."""
    
    @pytest.mark.asyncio
    async def test_execute_llm_step_uses_lcel_by_default(self):
        """Test that LCEL is used by default."""
        orchestrator = WorkflowOrchestrator(use_postgres=False)
        
        with patch.object(orchestrator, '_execute_llm_step_lcel') as mock_lcel:
            mock_lcel.return_value = {"content": "test"}
            
            result = await orchestrator._execute_llm_step(
                "exec-123",
                "step-456",
                {"prompt": "Hello"},
            )
            
            mock_lcel.assert_called_once()
    
    @pytest.mark.asyncio
    async def test_execute_llm_step_uses_legacy_when_disabled(self):
        """Test that legacy is used when LCEL is disabled."""
        orchestrator = WorkflowOrchestrator(use_postgres=False)
        orchestrator._use_lcel = False
        
        with patch.object(orchestrator, '_execute_llm_step_legacy') as mock_legacy:
            mock_legacy.return_value = {"content": "test"}
            
            result = await orchestrator._execute_llm_step(
                "exec-123",
                "step-456",
                {"prompt": "Hello"},
            )
            
            mock_legacy.assert_called_once()
    
    @pytest.mark.asyncio
    async def test_execute_llm_step_respects_config_override(self):
        """Test that step config can override LCEL mode."""
        orchestrator = WorkflowOrchestrator(use_postgres=False)
        
        with patch.object(orchestrator, '_execute_llm_step_legacy') as mock_legacy:
            mock_legacy.return_value = {"content": "test"}
            
            result = await orchestrator._execute_llm_step(
                "exec-123",
                "step-456",
                {"prompt": "Hello", "use_lcel": False},
            )
            
            mock_legacy.assert_called_once()


class TestExecuteLLMStepLCEL:
    """Tests for _execute_llm_step_lcel method."""
    
    @pytest.mark.asyncio
    async def test_lcel_step_basic_execution(self):
        """Test basic LCEL step execution."""
        orchestrator = WorkflowOrchestrator(use_postgres=False)
        
        mock_output = ChainOutput(
            content="Hello, world!",
            model="gpt-4.1-mini",
            tokens_used=50,
            cost=0.001,
            metadata={"task_type": "simple"},
        )
        
        mock_executor = MagicMock()
        mock_executor.execute = AsyncMock(return_value=mock_output)
        orchestrator._chain_executor = mock_executor
        
        result = await orchestrator._execute_llm_step_lcel(
            "exec-123",
            "step-456",
            {"prompt": "Say hello"},
        )
        
        assert result["content"] == "Hello, world!"
        assert result["model"] == "gpt-4.1-mini"
        assert result["provider"] == "openai"
    
    @pytest.mark.asyncio
    async def test_lcel_step_with_context(self):
        """Test LCEL step with memory context."""
        orchestrator = WorkflowOrchestrator(use_postgres=False)
        
        # Mock memory service
        mock_memory = MagicMock()
        mock_memory.get_context_for_prompt = AsyncMock(return_value={
            "preferences": [{"content": "Use Python"}],
            "facts": [],
            "skills": [],
        })
        orchestrator._memory_service = mock_memory
        
        # Mock episodic service
        mock_episodic = MagicMock()
        mock_episodic.get_rag_context = AsyncMock(return_value={
            "conversations": [],
            "code_snippets": [],
            "workflows": [],
            "total_episodes": 0,
        })
        orchestrator._episodic_memory_service = mock_episodic
        
        # Mock chain executor
        mock_output = ChainOutput(
            content="Response with context",
            model="gpt-4.1-mini",
        )
        mock_executor = MagicMock()
        mock_executor.execute = AsyncMock(return_value=mock_output)
        orchestrator._chain_executor = mock_executor
        
        result = await orchestrator._execute_llm_step_lcel(
            "exec-123",
            "step-456",
            {
                "prompt": "Generate code",
                "user_id": "user-123",
                "project_id": "project-456",
            },
        )
        
        assert result["content"] == "Response with context"
        mock_memory.get_context_for_prompt.assert_called_once()
        mock_episodic.get_rag_context.assert_called_once()
    
    @pytest.mark.asyncio
    async def test_lcel_step_task_type_conversion(self):
        """Test task type string to enum conversion."""
        orchestrator = WorkflowOrchestrator(use_postgres=False)
        
        mock_output = ChainOutput(content="Code", model="gpt-4.1-mini")
        mock_executor = MagicMock()
        mock_executor.execute = AsyncMock(return_value=mock_output)
        orchestrator._chain_executor = mock_executor
        
        await orchestrator._execute_llm_step_lcel(
            "exec-123",
            "step-456",
            {
                "prompt": "Generate code",
                "task_type": "code_generation",
            },
        )
        
        # Check that execute was called with correct task type
        call_args = mock_executor.execute.call_args
        chain_input = call_args[0][0]
        assert chain_input.task_type == TaskType.CODE_GENERATION
    
    @pytest.mark.asyncio
    async def test_lcel_step_fallback_on_error(self):
        """Test fallback to legacy on LCEL error."""
        orchestrator = WorkflowOrchestrator(use_postgres=False)
        
        # Mock chain executor to raise error
        mock_executor = MagicMock()
        mock_executor.execute = AsyncMock(side_effect=Exception("LCEL error"))
        orchestrator._chain_executor = mock_executor
        
        with patch.object(orchestrator, '_execute_llm_step_legacy') as mock_legacy:
            mock_legacy.return_value = {"content": "fallback"}
            
            result = await orchestrator._execute_llm_step_lcel(
                "exec-123",
                "step-456",
                {"prompt": "Hello"},
            )
            
            assert result["content"] == "fallback"
            mock_legacy.assert_called_once()


class TestExecuteLLMStepLegacy:
    """Tests for _execute_llm_step_legacy method."""
    
    @pytest.mark.asyncio
    async def test_legacy_step_execution(self):
        """Test legacy step execution."""
        orchestrator = WorkflowOrchestrator(use_postgres=False)
        
        mock_response = MagicMock()
        mock_response.content = "Legacy response"
        mock_response.provider = "openai"
        mock_response.model = "gpt-4"
        mock_response.tokens_used = 100
        mock_response.cost = 0.01
        
        with patch('app.orchestrator.orchestrator.llm_proxy') as mock_proxy:
            mock_proxy.invoke = AsyncMock(return_value=mock_response)
            
            result = await orchestrator._execute_llm_step_legacy(
                "exec-123",
                "step-456",
                {"prompt": "Hello"},
            )
            
            assert result["content"] == "Legacy response"
            assert result["provider"] == "openai"
            assert result["model"] == "gpt-4"


class TestStreamLLMStep:
    """Tests for stream_llm_step method."""
    
    @pytest.mark.asyncio
    async def test_stream_basic(self):
        """Test basic streaming."""
        orchestrator = WorkflowOrchestrator(use_postgres=False)
        
        # Mock chain executor streaming
        async def mock_stream(input):
            yield StreamingChunk(content="Hello")
            yield StreamingChunk(content=" world")
            yield StreamingChunk(content="!", is_final=True)
        
        mock_executor = MagicMock()
        mock_executor.stream = mock_stream
        orchestrator._chain_executor = mock_executor
        
        chunks = []
        async for chunk in orchestrator.stream_llm_step(
            "exec-123",
            "step-456",
            {"prompt": "Say hello"},
        ):
            chunks.append(chunk)
        
        assert len(chunks) == 3
        assert chunks[0].content == "Hello"
        assert chunks[1].content == " world"
        assert chunks[2].is_final is True
    
    @pytest.mark.asyncio
    async def test_stream_with_context(self):
        """Test streaming with context retrieval."""
        orchestrator = WorkflowOrchestrator(use_postgres=False)
        
        # Mock memory service
        mock_memory = MagicMock()
        mock_memory.get_context_for_prompt = AsyncMock(return_value={
            "preferences": [],
            "facts": [],
            "skills": [],
        })
        orchestrator._memory_service = mock_memory
        
        # Mock episodic service
        mock_episodic = MagicMock()
        mock_episodic.get_rag_context = AsyncMock(return_value={
            "conversations": [],
            "code_snippets": [],
            "workflows": [],
            "total_episodes": 0,
        })
        orchestrator._episodic_memory_service = mock_episodic
        
        # Mock chain executor streaming
        async def mock_stream(input):
            yield StreamingChunk(content="Response", is_final=True)
        
        mock_executor = MagicMock()
        mock_executor.stream = mock_stream
        orchestrator._chain_executor = mock_executor
        
        chunks = []
        async for chunk in orchestrator.stream_llm_step(
            "exec-123",
            "step-456",
            {
                "prompt": "Hello",
                "user_id": "user-123",
            },
        ):
            chunks.append(chunk)
        
        assert len(chunks) == 1
        mock_memory.get_context_for_prompt.assert_called_once()
        mock_episodic.get_rag_context.assert_called_once()
    
    @pytest.mark.asyncio
    async def test_stream_error_handling(self):
        """Test streaming error handling."""
        orchestrator = WorkflowOrchestrator(use_postgres=False)
        
        # Mock chain executor to raise error
        async def mock_stream(input):
            raise Exception("Stream error")
            yield  # Make it a generator
        
        mock_executor = MagicMock()
        mock_executor.stream = mock_stream
        orchestrator._chain_executor = mock_executor
        
        chunks = []
        async for chunk in orchestrator.stream_llm_step(
            "exec-123",
            "step-456",
            {"prompt": "Hello"},
        ):
            chunks.append(chunk)
        
        # Should yield error chunk
        assert len(chunks) == 1
        assert chunks[0].is_final is True
        assert chunks[0].metadata.get("error") is True
        assert "Error" in chunks[0].content
