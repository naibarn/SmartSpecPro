"""
Unit tests for WorkflowOrchestrator memory integration

Tests cover:
- Memory service initialization
- Context retrieval for workflows
- Storing learned facts
- Storing user preferences
"""

import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from datetime import datetime
from uuid import uuid4

from app.orchestrator.orchestrator import WorkflowOrchestrator
from app.services.memory_service import MemoryService
from app.models.semantic_memory import MemoryType, MemoryScope, SemanticMemory


@pytest.fixture
def mock_db_session():
    """Create a mock async database session."""
    session = AsyncMock()
    session.execute = AsyncMock()
    session.commit = AsyncMock()
    session.refresh = AsyncMock()
    session.add = MagicMock()
    session.delete = AsyncMock()
    return session


@pytest.fixture
def orchestrator_with_memory(mock_db_session):
    """Create an orchestrator with mock db session."""
    orchestrator = WorkflowOrchestrator(use_postgres=False, db_session=mock_db_session)
    return orchestrator


@pytest.fixture
def orchestrator_without_memory():
    """Create an orchestrator without db session."""
    return WorkflowOrchestrator(use_postgres=False)


class TestOrchestratorMemoryInit:
    """Tests for orchestrator memory initialization."""
    
    def test_init_with_db_session(self, mock_db_session):
        """Test initialization with database session."""
        orchestrator = WorkflowOrchestrator(use_postgres=False, db_session=mock_db_session)
        assert orchestrator._db_session == mock_db_session
        assert orchestrator._memory_service is None  # Lazy init
    
    def test_init_without_db_session(self):
        """Test initialization without database session."""
        orchestrator = WorkflowOrchestrator(use_postgres=False)
        assert orchestrator._db_session is None
        assert orchestrator._memory_service is None
    
    def test_set_db_session(self, orchestrator_without_memory, mock_db_session):
        """Test setting database session after init."""
        orchestrator_without_memory.set_db_session(mock_db_session)
        assert orchestrator_without_memory._db_session == mock_db_session
    
    def test_memory_service_property_with_session(self, orchestrator_with_memory):
        """Test memory_service property creates service."""
        service = orchestrator_with_memory.memory_service
        assert service is not None
        assert isinstance(service, MemoryService)
    
    def test_memory_service_property_without_session(self, orchestrator_without_memory):
        """Test memory_service property returns None without session."""
        service = orchestrator_without_memory.memory_service
        assert service is None


class TestOrchestratorGetContext:
    """Tests for getting workflow context."""
    
    @pytest.mark.asyncio
    async def test_get_context_without_memory_service(self, orchestrator_without_memory):
        """Test getting context when no memory service available."""
        context = await orchestrator_without_memory.get_context_for_workflow(
            user_id="user-123",
        )
        
        assert context == {"preferences": [], "facts": [], "skills": []}
    
    @pytest.mark.asyncio
    async def test_get_context_with_memory_service(self, orchestrator_with_memory, mock_db_session):
        """Test getting context with memory service."""
        # Mock the memory service response
        mock_result = MagicMock()
        mock_result.scalars.return_value.all.return_value = []
        mock_db_session.execute.return_value = mock_result
        
        context = await orchestrator_with_memory.get_context_for_workflow(
            user_id="user-123",
            project_id="project-456",
        )
        
        assert "preferences" in context
        assert "facts" in context
        assert "skills" in context
    
    @pytest.mark.asyncio
    async def test_get_context_with_memories(self, orchestrator_with_memory, mock_db_session):
        """Test getting context with actual memories."""
        pref_memory = SemanticMemory(
            id=1,
            memory_key="preference:language",
            content="Python",
            memory_type=MemoryType.USER_PREFERENCE,
            scope=MemoryScope.USER,
            user_id="user-123",
            importance=0.8,
            access_count=5,
            created_at=datetime.utcnow(),
            updated_at=datetime.utcnow(),
        )
        
        # Mock to return preference
        call_count = [0]
        def mock_execute_side_effect(*args, **kwargs):
            call_count[0] += 1
            mock_result = MagicMock()
            if call_count[0] == 1:  # preferences
                mock_result.scalars.return_value.all.return_value = [pref_memory]
            else:
                mock_result.scalars.return_value.all.return_value = []
            return mock_result
        
        mock_db_session.execute.side_effect = mock_execute_side_effect
        
        context = await orchestrator_with_memory.get_context_for_workflow(
            user_id="user-123",
        )
        
        assert len(context["preferences"]) == 1
        assert context["preferences"][0]["memory_key"] == "preference:language"


class TestOrchestratorStoreFact:
    """Tests for storing learned facts."""
    
    @pytest.mark.asyncio
    async def test_store_fact_without_memory_service(self, orchestrator_without_memory):
        """Test storing fact when no memory service available."""
        result = await orchestrator_without_memory.store_learned_fact(
            user_id="user-123",
            key="framework",
            value="FastAPI",
        )
        
        assert result is False
    
    @pytest.mark.asyncio
    async def test_store_fact_with_project(self, orchestrator_with_memory, mock_db_session):
        """Test storing project fact."""
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = None
        mock_db_session.execute.return_value = mock_result
        
        async def mock_refresh(obj):
            obj.id = uuid4()
        mock_db_session.refresh.side_effect = mock_refresh
        
        result = await orchestrator_with_memory.store_learned_fact(
            user_id="user-123",
            key="framework",
            value="FastAPI",
            project_id="project-456",
            execution_id="exec-789",
        )
        
        assert result is True
        mock_db_session.add.assert_called_once()
    
    @pytest.mark.asyncio
    async def test_store_fact_without_project(self, orchestrator_with_memory, mock_db_session):
        """Test storing fact without project."""
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = None
        mock_db_session.execute.return_value = mock_result
        
        async def mock_refresh(obj):
            obj.id = uuid4()
        mock_db_session.refresh.side_effect = mock_refresh
        
        result = await orchestrator_with_memory.store_learned_fact(
            user_id="user-123",
            key="general_fact",
            value="Some value",
        )
        
        assert result is True
    
    @pytest.mark.asyncio
    async def test_store_fact_error_handling(self, orchestrator_with_memory, mock_db_session):
        """Test storing fact handles errors gracefully."""
        mock_db_session.execute.side_effect = Exception("Database error")
        
        result = await orchestrator_with_memory.store_learned_fact(
            user_id="user-123",
            key="framework",
            value="FastAPI",
        )
        
        assert result is False


class TestOrchestratorStorePreference:
    """Tests for storing user preferences."""
    
    @pytest.mark.asyncio
    async def test_store_preference_without_memory_service(self, orchestrator_without_memory):
        """Test storing preference when no memory service available."""
        result = await orchestrator_without_memory.store_user_preference(
            user_id="user-123",
            key="editor",
            value="vscode",
        )
        
        assert result is False
    
    @pytest.mark.asyncio
    async def test_store_preference_success(self, orchestrator_with_memory, mock_db_session):
        """Test storing preference successfully."""
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = None
        mock_db_session.execute.return_value = mock_result
        
        async def mock_refresh(obj):
            obj.id = uuid4()
        mock_db_session.refresh.side_effect = mock_refresh
        
        result = await orchestrator_with_memory.store_user_preference(
            user_id="user-123",
            key="editor",
            value="vscode",
        )
        
        assert result is True
        mock_db_session.add.assert_called_once()
    
    @pytest.mark.asyncio
    async def test_store_preference_error_handling(self, orchestrator_with_memory, mock_db_session):
        """Test storing preference handles errors gracefully."""
        mock_db_session.execute.side_effect = Exception("Database error")
        
        result = await orchestrator_with_memory.store_user_preference(
            user_id="user-123",
            key="editor",
            value="vscode",
        )
        
        assert result is False


class TestOrchestratorMemoryServiceReset:
    """Tests for memory service reset on session change."""
    
    def test_set_db_session_resets_memory_service(self, orchestrator_with_memory, mock_db_session):
        """Test that setting new db session resets memory service."""
        # Access memory service to initialize it
        _ = orchestrator_with_memory.memory_service
        assert orchestrator_with_memory._memory_service is not None
        
        # Set new session
        new_session = AsyncMock()
        orchestrator_with_memory.set_db_session(new_session)
        
        # Memory service should be reset
        assert orchestrator_with_memory._memory_service is None
        assert orchestrator_with_memory._db_session == new_session
