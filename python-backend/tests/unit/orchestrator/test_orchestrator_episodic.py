"""
Unit tests for Orchestrator episodic memory integration.
"""

import pytest
from unittest.mock import Mock, AsyncMock, patch, MagicMock
from datetime import datetime

from app.orchestrator.orchestrator import WorkflowOrchestrator


class TestOrchestratorEpisodicInit:
    """Tests for episodic memory initialization in orchestrator."""
    
    def test_init_creates_episodic_service_attribute(self):
        """Test that init creates episodic service attribute."""
        orchestrator = WorkflowOrchestrator(use_postgres=False)
        
        assert hasattr(orchestrator, '_episodic_memory_service')
        assert orchestrator._episodic_memory_service is None
    
    @patch('app.orchestrator.orchestrator.get_episodic_memory_service')
    def test_episodic_service_property_lazy_init(self, mock_get_service):
        """Test that episodic service is lazily initialized."""
        mock_service = MagicMock()
        mock_get_service.return_value = mock_service
        
        orchestrator = WorkflowOrchestrator(use_postgres=False)
        
        # Not initialized yet
        assert orchestrator._episodic_memory_service is None
        
        # Access property triggers initialization
        service = orchestrator.episodic_memory_service
        
        assert service is mock_service
        mock_get_service.assert_called_once()


class TestOrchestratorRAGContext:
    """Tests for RAG context retrieval."""
    
    @pytest.mark.asyncio
    async def test_get_rag_context_without_service(self):
        """Test get_rag_context returns empty when no service."""
        orchestrator = WorkflowOrchestrator(use_postgres=False)
        orchestrator._episodic_memory_service = None
        
        # Force property to return None
        with patch.object(WorkflowOrchestrator, 'episodic_memory_service', new_callable=lambda: property(lambda self: None)):
            orch = WorkflowOrchestrator(use_postgres=False)
            context = await orch.get_rag_context(query="test")
        
            assert context == {
                "conversations": [],
                "code_snippets": [],
                "workflows": [],
                "total_episodes": 0,
            }
    
    @pytest.mark.asyncio
    async def test_get_rag_context_with_service(self):
        """Test get_rag_context calls service correctly."""
        mock_service = MagicMock()
        mock_service.get_rag_context = AsyncMock(return_value={
            "conversations": [{"content": "test"}],
            "code_snippets": [],
            "workflows": [],
            "total_episodes": 1,
        })
        
        orchestrator = WorkflowOrchestrator(use_postgres=False)
        orchestrator._episodic_memory_service = mock_service
        
        context = await orchestrator.get_rag_context(
            query="How do I create a function?",
            user_id="user-123",
            project_id="project-456",
        )
        
        assert context["total_episodes"] == 1
        mock_service.get_rag_context.assert_called_once_with(
            query="How do I create a function?",
            user_id="user-123",
            project_id="project-456",
            max_episodes=5,
        )


class TestOrchestratorStoreConversation:
    """Tests for storing conversation episodes."""
    
    @pytest.mark.asyncio
    async def test_store_conversation_without_service(self):
        """Test store_conversation returns None when no service."""
        with patch.object(WorkflowOrchestrator, 'episodic_memory_service', new_callable=lambda: property(lambda self: None)):
            orchestrator = WorkflowOrchestrator(use_postgres=False)
            result = await orchestrator.store_conversation_episode(
                user_message="Hello",
                assistant_response="Hi!",
            )
        
            assert result is None
    
    @pytest.mark.asyncio
    async def test_store_conversation_success(self):
        """Test successful conversation storage."""
        mock_service = MagicMock()
        mock_service.store_conversation = AsyncMock(return_value="episode-123")
        
        orchestrator = WorkflowOrchestrator(use_postgres=False)
        orchestrator._episodic_memory_service = mock_service
        
        result = await orchestrator.store_conversation_episode(
            user_message="How do I create a function?",
            assistant_response="Use the def keyword.",
            user_id="user-123",
            session_id="session-456",
            model_used="gpt-4",
            was_helpful=True,
        )
        
        assert result == "episode-123"
        mock_service.store_conversation.assert_called_once()
    
    @pytest.mark.asyncio
    async def test_store_conversation_error_handling(self):
        """Test error handling in conversation storage."""
        mock_service = MagicMock()
        mock_service.store_conversation = AsyncMock(side_effect=Exception("Storage error"))
        
        orchestrator = WorkflowOrchestrator(use_postgres=False)
        orchestrator._episodic_memory_service = mock_service
        
        result = await orchestrator.store_conversation_episode(
            user_message="Hello",
            assistant_response="Hi!",
        )
        
        assert result is None


class TestOrchestratorStoreCode:
    """Tests for storing code episodes."""
    
    @pytest.mark.asyncio
    async def test_store_code_without_service(self):
        """Test store_code returns None when no service."""
        with patch.object(WorkflowOrchestrator, 'episodic_memory_service', new_callable=lambda: property(lambda self: None)):
            orchestrator = WorkflowOrchestrator(use_postgres=False)
            result = await orchestrator.store_code_episode(
                code="def hello(): pass",
                language="python",
                description="A function",
            )
        
            assert result is None
    
    @pytest.mark.asyncio
    async def test_store_code_success(self):
        """Test successful code storage."""
        mock_service = MagicMock()
        mock_service.store_code_episode = AsyncMock(return_value="episode-456")
        
        orchestrator = WorkflowOrchestrator(use_postgres=False)
        orchestrator._episodic_memory_service = mock_service
        
        result = await orchestrator.store_code_episode(
            code="def hello(): print('Hello')",
            language="python",
            description="A greeting function",
            user_id="user-123",
            project_id="project-456",
            file_path="/src/hello.py",
            was_successful=True,
        )
        
        assert result == "episode-456"
        mock_service.store_code_episode.assert_called_once()


class TestOrchestratorStoreWorkflow:
    """Tests for storing workflow episodes."""
    
    @pytest.mark.asyncio
    async def test_store_workflow_without_service(self):
        """Test store_workflow returns None when no service."""
        with patch.object(WorkflowOrchestrator, 'episodic_memory_service', new_callable=lambda: property(lambda self: None)):
            orchestrator = WorkflowOrchestrator(use_postgres=False)
            result = await orchestrator.store_workflow_episode(
                workflow_id="wf-123",
                execution_id="exec-456",
                summary="Test",
                details="Details",
            )
        
            assert result is None
    
    @pytest.mark.asyncio
    async def test_store_workflow_success(self):
        """Test successful workflow storage."""
        mock_service = MagicMock()
        mock_service.store_workflow_episode = AsyncMock(return_value="episode-789")
        
        orchestrator = WorkflowOrchestrator(use_postgres=False)
        orchestrator._episodic_memory_service = mock_service
        
        result = await orchestrator.store_workflow_episode(
            workflow_id="wf-123",
            execution_id="exec-456",
            summary="API endpoint created",
            details="Created GET /users endpoint",
            user_id="user-123",
            project_id="project-456",
            was_successful=True,
        )
        
        assert result == "episode-789"
        mock_service.store_workflow_episode.assert_called_once()


class TestOrchestratorFullContext:
    """Tests for getting full context (semantic + episodic)."""
    
    @pytest.mark.asyncio
    async def test_get_full_context(self):
        """Test getting full context combines both memory types."""
        # Mock semantic memory service
        mock_memory_service = MagicMock()
        mock_memory_service.get_context_for_prompt = AsyncMock(return_value={
            "preferences": [{"content": "Use Python"}],
            "facts": [{"content": "FastAPI project"}],
            "skills": [],
        })
        
        # Mock episodic memory service
        mock_episodic_service = MagicMock()
        mock_episodic_service.get_rag_context = AsyncMock(return_value={
            "conversations": [{"content": "Previous chat"}],
            "code_snippets": [{"content": "def hello(): pass", "language": "python"}],
            "workflows": [],
            "total_episodes": 2,
        })
        
        orchestrator = WorkflowOrchestrator(use_postgres=False)
        orchestrator._memory_service = mock_memory_service
        orchestrator._episodic_memory_service = mock_episodic_service
        
        context = await orchestrator.get_full_context(
            query="How do I add a new endpoint?",
            user_id="user-123",
            project_id="project-456",
        )
        
        assert "semantic" in context
        assert "episodic" in context
        assert context["user_id"] == "user-123"
        assert context["project_id"] == "project-456"
    
    def test_format_context_for_prompt(self):
        """Test formatting context for LLM prompts."""
        orchestrator = WorkflowOrchestrator(use_postgres=False)
        
        context = {
            "semantic": {
                "preferences": [{"content": "Use Python 3.11"}],
                "facts": [{"content": "FastAPI backend"}],
                "skills": [{"content": "REST API design"}],
            },
            "episodic": {
                "conversations": [{"content": "User asked about endpoints"}],
                "code_snippets": [{"content": "def get_users(): pass", "language": "python"}],
                "workflows": [],
            },
        }
        
        formatted = orchestrator.format_context_for_prompt(context)
        
        assert "User Preferences" in formatted
        assert "Project Facts" in formatted
        assert "Available Skills" in formatted
        assert "Relevant Past Conversations" in formatted
        assert "Relevant Code Examples" in formatted
    
    def test_format_context_empty(self):
        """Test formatting empty context."""
        orchestrator = WorkflowOrchestrator(use_postgres=False)
        
        context = {
            "semantic": {
                "preferences": [],
                "facts": [],
                "skills": [],
            },
            "episodic": {
                "conversations": [],
                "code_snippets": [],
                "workflows": [],
            },
        }
        
        formatted = orchestrator.format_context_for_prompt(context)
        
        assert formatted == ""
