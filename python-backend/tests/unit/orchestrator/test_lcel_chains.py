"""
Unit tests for LCEL chains module.
"""

import pytest
from unittest.mock import Mock, AsyncMock, patch, MagicMock
from dataclasses import asdict

from app.orchestrator.lcel_chains import (
    TaskType,
    BudgetPriority,
    ChainConfig,
    ChainInput,
    ChainOutput,
    StreamingChunk,
    LCELChainFactory,
    LCELChainExecutor,
    get_chain_executor,
    reset_chain_executor,
    get_system_prompt,
    format_semantic_context,
    format_episodic_context,
    build_context_section,
    SYSTEM_PROMPTS,
)


class TestTaskType:
    """Tests for TaskType enum."""
    
    def test_task_types_exist(self):
        """Test that all task types are defined."""
        assert TaskType.SIMPLE == "simple"
        assert TaskType.COMPLEX == "complex"
        assert TaskType.CODE_GENERATION == "code_generation"
        assert TaskType.CODE_REVIEW == "code_review"
        assert TaskType.ANALYSIS == "analysis"
        assert TaskType.SUMMARIZATION == "summarization"
        assert TaskType.TRANSLATION == "translation"
        assert TaskType.CONVERSATION == "conversation"
    
    def test_task_type_from_string(self):
        """Test creating task type from string."""
        assert TaskType("simple") == TaskType.SIMPLE
        assert TaskType("code_generation") == TaskType.CODE_GENERATION


class TestBudgetPriority:
    """Tests for BudgetPriority enum."""
    
    def test_budget_priorities_exist(self):
        """Test that all budget priorities are defined."""
        assert BudgetPriority.QUALITY == "quality"
        assert BudgetPriority.BALANCED == "balanced"
        assert BudgetPriority.ECONOMY == "economy"


class TestChainConfig:
    """Tests for ChainConfig dataclass."""
    
    def test_default_config(self):
        """Test default configuration values."""
        config = ChainConfig()
        
        assert config.model_name == "gpt-4.1-mini"
        assert config.temperature == 0.7
        assert config.max_tokens == 4000
        assert config.streaming is False
        assert config.timeout == 60
        assert config.include_semantic_context is True
        assert config.include_episodic_context is True
    
    def test_custom_config(self):
        """Test custom configuration values."""
        config = ChainConfig(
            model_name="gpt-4",
            temperature=0.5,
            max_tokens=8000,
            streaming=True,
        )
        
        assert config.model_name == "gpt-4"
        assert config.temperature == 0.5
        assert config.max_tokens == 8000
        assert config.streaming is True


class TestChainInput:
    """Tests for ChainInput dataclass."""
    
    def test_minimal_input(self):
        """Test minimal input creation."""
        input = ChainInput(prompt="Hello")
        
        assert input.prompt == "Hello"
        assert input.task_type == TaskType.SIMPLE
        assert input.budget_priority == BudgetPriority.BALANCED
        assert input.system_message is None
        assert input.chat_history == []
        assert input.semantic_context is None
        assert input.episodic_context is None
    
    def test_full_input(self):
        """Test full input creation."""
        input = ChainInput(
            prompt="Generate code",
            task_type=TaskType.CODE_GENERATION,
            budget_priority=BudgetPriority.QUALITY,
            system_message="You are a Python expert.",
            semantic_context={"preferences": []},
            episodic_context={"conversations": []},
            variables={"user_id": "user-123"},
        )
        
        assert input.prompt == "Generate code"
        assert input.task_type == TaskType.CODE_GENERATION
        assert input.variables["user_id"] == "user-123"


class TestChainOutput:
    """Tests for ChainOutput dataclass."""
    
    def test_output_creation(self):
        """Test output creation."""
        output = ChainOutput(
            content="Hello, world!",
            model="gpt-4",
            tokens_used=100,
            cost=0.01,
        )
        
        assert output.content == "Hello, world!"
        assert output.model == "gpt-4"
        assert output.tokens_used == 100
        assert output.cost == 0.01


class TestStreamingChunk:
    """Tests for StreamingChunk model."""
    
    def test_chunk_creation(self):
        """Test chunk creation."""
        chunk = StreamingChunk(content="Hello")
        
        assert chunk.content == "Hello"
        assert chunk.is_final is False
        assert chunk.metadata == {}
    
    def test_final_chunk(self):
        """Test final chunk creation."""
        chunk = StreamingChunk(content="", is_final=True)
        
        assert chunk.is_final is True


class TestSystemPrompts:
    """Tests for system prompt functions."""
    
    def test_system_prompts_defined(self):
        """Test that system prompts are defined for all task types."""
        for task_type in TaskType:
            assert task_type in SYSTEM_PROMPTS
    
    def test_get_system_prompt_default(self):
        """Test getting default system prompt."""
        prompt = get_system_prompt(TaskType.SIMPLE)
        assert "helpful AI assistant" in prompt
    
    def test_get_system_prompt_code_generation(self):
        """Test getting code generation system prompt."""
        prompt = get_system_prompt(TaskType.CODE_GENERATION)
        assert "software engineer" in prompt
    
    def test_get_system_prompt_custom(self):
        """Test custom system prompt overrides default."""
        custom = "You are a custom assistant."
        prompt = get_system_prompt(TaskType.SIMPLE, custom)
        assert prompt == custom


class TestContextFormatting:
    """Tests for context formatting functions."""
    
    def test_format_semantic_context_empty(self):
        """Test formatting empty semantic context."""
        result = format_semantic_context(None)
        assert result == ""
        
        result = format_semantic_context({})
        assert result == ""
    
    def test_format_semantic_context_with_preferences(self):
        """Test formatting semantic context with preferences."""
        context = {
            "preferences": [
                {"content": "Use Python 3.11"},
                {"content": "Prefer FastAPI"},
            ]
        }
        
        result = format_semantic_context(context)
        
        assert "User Preferences" in result
        assert "Use Python 3.11" in result
        assert "Prefer FastAPI" in result
    
    def test_format_semantic_context_with_facts(self):
        """Test formatting semantic context with facts."""
        context = {
            "facts": [
                {"content": "Project uses PostgreSQL"},
            ]
        }
        
        result = format_semantic_context(context)
        
        assert "Project Facts" in result
        assert "PostgreSQL" in result
    
    def test_format_episodic_context_empty(self):
        """Test formatting empty episodic context."""
        result = format_episodic_context(None)
        assert result == ""
    
    def test_format_episodic_context_with_conversations(self):
        """Test formatting episodic context with conversations."""
        context = {
            "conversations": [
                {"content": "User asked about REST APIs"},
            ]
        }
        
        result = format_episodic_context(context)
        
        assert "Relevant Past Conversations" in result
        assert "REST APIs" in result
    
    def test_format_episodic_context_with_code(self):
        """Test formatting episodic context with code snippets."""
        context = {
            "code_snippets": [
                {"content": "def hello(): pass", "language": "python"},
            ]
        }
        
        result = format_episodic_context(context)
        
        assert "Relevant Code Examples" in result
        assert "```python" in result
        assert "def hello()" in result
    
    def test_build_context_section_empty(self):
        """Test building empty context section."""
        result = build_context_section(None, None)
        assert result == ""
    
    def test_build_context_section_combined(self):
        """Test building combined context section."""
        semantic = {"preferences": [{"content": "Use Python"}]}
        episodic = {"conversations": [{"content": "Previous chat"}]}
        
        result = build_context_section(semantic, episodic)
        
        assert "Context" in result
        assert "Use Python" in result
        assert "Previous chat" in result


class TestLCELChainFactory:
    """Tests for LCELChainFactory."""
    
    @patch('app.orchestrator.lcel_chains.ChatOpenAI')
    def test_factory_init(self, mock_chat):
        """Test factory initialization."""
        factory = LCELChainFactory()
        
        assert factory.config is not None
        assert factory._llm is None
    
    @patch('app.orchestrator.lcel_chains.ChatOpenAI')
    def test_llm_lazy_init(self, mock_chat):
        """Test LLM lazy initialization."""
        mock_chat.return_value = MagicMock()
        
        factory = LCELChainFactory()
        
        # LLM not created yet
        assert factory._llm is None
        
        # Access property triggers creation
        llm = factory.llm
        
        assert llm is not None
        mock_chat.assert_called_once()
    
    @patch('app.orchestrator.lcel_chains.ChatOpenAI')
    def test_create_simple_chain(self, mock_chat):
        """Test creating simple chain."""
        mock_chat.return_value = MagicMock()
        
        factory = LCELChainFactory()
        chain = factory.create_simple_chain()
        
        assert chain is not None
    
    @patch('app.orchestrator.lcel_chains.ChatOpenAI')
    def test_create_chat_chain(self, mock_chat):
        """Test creating chat chain."""
        mock_chat.return_value = MagicMock()
        
        factory = LCELChainFactory()
        chain = factory.create_chat_chain()
        
        assert chain is not None
    
    @patch('app.orchestrator.lcel_chains.ChatOpenAI')
    def test_create_context_aware_chain(self, mock_chat):
        """Test creating context-aware chain."""
        mock_chat.return_value = MagicMock()
        
        factory = LCELChainFactory()
        chain = factory.create_context_aware_chain()
        
        assert chain is not None


class TestLCELChainExecutor:
    """Tests for LCELChainExecutor."""
    
    @patch('app.orchestrator.lcel_chains.ChatOpenAI')
    def test_executor_init(self, mock_chat):
        """Test executor initialization."""
        executor = LCELChainExecutor()
        
        assert executor.config is not None
        assert executor.factory is not None
        assert executor.memory_service is None
        assert executor.episodic_service is None
    
    @patch('app.orchestrator.lcel_chains.ChatOpenAI')
    def test_executor_with_services(self, mock_chat):
        """Test executor with memory services."""
        mock_memory = MagicMock()
        mock_episodic = MagicMock()
        
        executor = LCELChainExecutor(
            memory_service=mock_memory,
            episodic_service=mock_episodic,
        )
        
        assert executor.memory_service is mock_memory
        assert executor.episodic_service is mock_episodic
    
    @pytest.mark.asyncio
    @patch('app.orchestrator.lcel_chains.ChatOpenAI')
    async def test_execute_simple(self, mock_chat):
        """Test simple execution."""
        # Mock the LLM response
        mock_llm = MagicMock()
        mock_llm.ainvoke = AsyncMock(return_value=MagicMock(content="Hello!"))
        mock_chat.return_value = mock_llm
        
        executor = LCELChainExecutor()
        
        # Mock the chain
        with patch.object(executor.factory, 'create_simple_chain') as mock_chain:
            mock_chain.return_value = MagicMock()
            mock_chain.return_value.ainvoke = AsyncMock(return_value="Hello!")
            
            input = ChainInput(prompt="Say hello")
            output = await executor.execute(input)
            
            assert output.content == "Hello!"
            assert output.model == "gpt-4.1-mini"
    
    @pytest.mark.asyncio
    @patch('app.orchestrator.lcel_chains.ChatOpenAI')
    async def test_execute_with_context(self, mock_chat):
        """Test execution with context."""
        mock_llm = MagicMock()
        mock_chat.return_value = mock_llm
        
        executor = LCELChainExecutor()
        
        with patch.object(executor.factory, 'create_context_aware_chain') as mock_chain:
            mock_chain.return_value = MagicMock()
            mock_chain.return_value.ainvoke = AsyncMock(return_value="Response with context")
            
            input = ChainInput(
                prompt="Generate code",
                semantic_context={"preferences": [{"content": "Use Python"}]},
            )
            output = await executor.execute(input)
            
            assert output.content == "Response with context"
            assert output.metadata["has_semantic_context"] is True


class TestGlobalFunctions:
    """Tests for global functions."""
    
    @patch('app.orchestrator.lcel_chains.LCELChainExecutor')
    def test_get_chain_executor(self, mock_executor_class):
        """Test getting global chain executor."""
        reset_chain_executor()
        
        mock_executor_class.return_value = MagicMock()
        
        executor1 = get_chain_executor()
        executor2 = get_chain_executor()
        
        # Should return same instance
        assert executor1 is executor2
        
        reset_chain_executor()
    
    @patch('app.orchestrator.lcel_chains.LCELChainExecutor')
    def test_get_chain_executor_force_new(self, mock_executor_class):
        """Test forcing new chain executor."""
        reset_chain_executor()
        
        mock_executor_class.return_value = MagicMock()
        
        executor1 = get_chain_executor()
        executor2 = get_chain_executor(force_new=True)
        
        # Should create new instance
        assert mock_executor_class.call_count == 2
        
        reset_chain_executor()
    
    def test_reset_chain_executor(self):
        """Test resetting chain executor."""
        reset_chain_executor()
        
        # Should not raise
        reset_chain_executor()
