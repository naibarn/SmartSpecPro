"""
Unit tests for MemoryService

Tests cover:
- Store and retrieve memories
- User preferences
- Project facts
- Skill tracking
- Context retrieval for prompts
- Search functionality
"""

import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from datetime import datetime
from uuid import uuid4

from app.services.memory_service import MemoryService, get_memory_service
from app.models.semantic_memory import (
    SemanticMemory,
    MemoryType,
    MemoryScope,
)


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
def memory_service(mock_db_session):
    """Create a MemoryService instance with mock session."""
    return MemoryService(mock_db_session)


@pytest.fixture
def sample_memory():
    """Create a sample SemanticMemory instance."""
    return SemanticMemory(
        id=1,
        memory_key="test:key",
        content="Test content",
        memory_type=MemoryType.USER_PREFERENCE,
        scope=MemoryScope.USER,
        user_id="user-123",
        project_id=None,
        extra_data={"source": "test"},
        importance=0.5,
        access_count=0,
        source_execution_id=None,
        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow(),
    )


class TestMemoryServiceInit:
    """Tests for MemoryService initialization."""
    
    def test_init_with_session(self, mock_db_session):
        """Test initialization with database session."""
        service = MemoryService(mock_db_session)
        assert service.db == mock_db_session
    
    def test_get_memory_service(self, mock_db_session):
        """Test get_memory_service factory function."""
        service = get_memory_service(mock_db_session)
        assert isinstance(service, MemoryService)
        assert service.db == mock_db_session


class TestMemoryServiceStore:
    """Tests for storing memories."""
    
    @pytest.mark.asyncio
    async def test_store_memory(self, memory_service, mock_db_session):
        """Test storing a new memory."""
        # Mock execute to return None (no existing memory)
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = None
        mock_db_session.execute.return_value = mock_result
        
        # Mock refresh to set the id
        async def mock_refresh(obj):
            obj.id = 1
        mock_db_session.refresh.side_effect = mock_refresh
        
        memory = await memory_service.store(
            memory_key="preference:language",
            content="Python",
            memory_type=MemoryType.USER_PREFERENCE,
            scope=MemoryScope.USER,
            user_id="user-123",
        )
        
        assert memory is not None
        mock_db_session.add.assert_called_once()
        mock_db_session.commit.assert_called()
    
    @pytest.mark.asyncio
    async def test_store_memory_update_existing(self, memory_service, mock_db_session, sample_memory):
        """Test storing updates existing memory with same key."""
        # Mock execute to return existing memory
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = sample_memory
        mock_db_session.execute.return_value = mock_result
        
        memory = await memory_service.store(
            memory_key=sample_memory.memory_key,
            content="Updated content",
            memory_type=sample_memory.memory_type,
            scope=sample_memory.scope,
            user_id=sample_memory.user_id,
        )
        
        assert memory.content == "Updated content"
        mock_db_session.commit.assert_called()
    
    @pytest.mark.asyncio
    async def test_store_user_preference(self, memory_service, mock_db_session):
        """Test storing user preference."""
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = None
        mock_db_session.execute.return_value = mock_result
        
        async def mock_refresh(obj):
            obj.id = 1
        mock_db_session.refresh.side_effect = mock_refresh
        
        memory = await memory_service.store_user_preference(
            user_id="user-123",
            key="editor",
            value="vscode",
        )
        
        assert memory is not None
        mock_db_session.add.assert_called_once()
        
        # Verify the memory was created with correct type
        added_memory = mock_db_session.add.call_args[0][0]
        assert added_memory.memory_type == MemoryType.USER_PREFERENCE
        # Uses "pref:" prefix
        assert added_memory.memory_key == "pref:editor"
    
    @pytest.mark.asyncio
    async def test_store_project_fact(self, memory_service, mock_db_session):
        """Test storing project fact."""
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = None
        mock_db_session.execute.return_value = mock_result
        
        async def mock_refresh(obj):
            obj.id = 1
        mock_db_session.refresh.side_effect = mock_refresh
        
        memory = await memory_service.store_project_fact(
            project_id="project-456",
            key="framework",
            value="FastAPI",
            user_id="user-123",
        )
        
        assert memory is not None
        
        # Verify the memory was created with correct type
        added_memory = mock_db_session.add.call_args[0][0]
        assert added_memory.memory_type == MemoryType.PROJECT_FACT
        assert added_memory.memory_key == "fact:framework"
        assert added_memory.project_id == "project-456"
    
    @pytest.mark.asyncio
    async def test_store_skill(self, memory_service, mock_db_session):
        """Test storing user skill."""
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = None
        mock_db_session.execute.return_value = mock_result
        
        async def mock_refresh(obj):
            obj.id = 1
        mock_db_session.refresh.side_effect = mock_refresh
        
        # Use correct parameter name: skill_content instead of proficiency_level
        memory = await memory_service.store_skill(
            user_id="user-123",
            skill_name="python",
            skill_content="Expert level Python programming",
        )
        
        assert memory is not None
        
        added_memory = mock_db_session.add.call_args[0][0]
        assert added_memory.memory_type == MemoryType.SKILL
        assert added_memory.memory_key == "skill:python"


class TestMemoryServiceRetrieve:
    """Tests for retrieving memories."""
    
    @pytest.mark.asyncio
    async def test_get_by_key(self, memory_service, mock_db_session, sample_memory):
        """Test getting memory by key."""
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = sample_memory
        mock_db_session.execute.return_value = mock_result
        
        memory = await memory_service.get_by_key(
            memory_key=sample_memory.memory_key,
            user_id=sample_memory.user_id,
        )
        
        assert memory is not None
        assert memory.memory_key == sample_memory.memory_key
    
    @pytest.mark.asyncio
    async def test_get_by_key_not_found(self, memory_service, mock_db_session):
        """Test getting non-existent memory by key."""
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = None
        mock_db_session.execute.return_value = mock_result
        
        memory = await memory_service.get_by_key(
            memory_key="nonexistent",
            user_id="user-123",
        )
        
        assert memory is None
    
    @pytest.mark.asyncio
    async def test_get_user_preferences(self, memory_service, mock_db_session, sample_memory):
        """Test getting all user preferences."""
        mock_result = MagicMock()
        mock_result.scalars.return_value.all.return_value = [sample_memory]
        mock_db_session.execute.return_value = mock_result
        
        preferences = await memory_service.get_user_preferences(user_id="user-123")
        
        assert len(preferences) == 1
        assert preferences[0] == sample_memory
    
    @pytest.mark.asyncio
    async def test_get_project_facts(self, memory_service, mock_db_session, sample_memory):
        """Test getting project facts."""
        sample_memory.memory_type = MemoryType.PROJECT_FACT
        sample_memory.project_id = "project-456"
        
        mock_result = MagicMock()
        mock_result.scalars.return_value.all.return_value = [sample_memory]
        mock_db_session.execute.return_value = mock_result
        
        facts = await memory_service.get_project_facts(project_id="project-456")
        
        assert len(facts) == 1
    
    @pytest.mark.asyncio
    async def test_get_skills(self, memory_service, mock_db_session, sample_memory):
        """Test getting user skills."""
        sample_memory.memory_type = MemoryType.SKILL
        
        mock_result = MagicMock()
        mock_result.scalars.return_value.all.return_value = [sample_memory]
        mock_db_session.execute.return_value = mock_result
        
        # Use get_skills instead of get_user_skills
        skills = await memory_service.get_skills(user_id="user-123")
        
        assert len(skills) == 1


class TestMemoryServiceSearch:
    """Tests for searching memories."""
    
    @pytest.mark.asyncio
    async def test_search_by_query(self, memory_service, mock_db_session, sample_memory):
        """Test searching memories by query string."""
        mock_result = MagicMock()
        mock_result.scalars.return_value.all.return_value = [sample_memory]
        mock_db_session.execute.return_value = mock_result
        
        # search requires query parameter
        memories = await memory_service.search(
            query="test",
            user_id="user-123",
        )
        
        assert len(memories) == 1
    
    @pytest.mark.asyncio
    async def test_search_with_memory_types(self, memory_service, mock_db_session, sample_memory):
        """Test searching memories with type filter."""
        mock_result = MagicMock()
        mock_result.scalars.return_value.all.return_value = [sample_memory]
        mock_db_session.execute.return_value = mock_result
        
        # Use memory_types (list) instead of memory_type
        memories = await memory_service.search(
            query="test",
            user_id="user-123",
            memory_types=[MemoryType.USER_PREFERENCE],
        )
        
        assert len(memories) == 1
    
    @pytest.mark.asyncio
    async def test_search_with_limit(self, memory_service, mock_db_session, sample_memory):
        """Test searching with limit."""
        mock_result = MagicMock()
        mock_result.scalars.return_value.all.return_value = [sample_memory]
        mock_db_session.execute.return_value = mock_result
        
        memories = await memory_service.search(
            query="test",
            user_id="user-123",
            limit=10,
        )
        
        assert len(memories) == 1


class TestMemoryServiceContext:
    """Tests for context retrieval."""
    
    @pytest.mark.asyncio
    async def test_get_context_for_prompt(self, memory_service, mock_db_session):
        """Test getting context for LLM prompt."""
        # Create sample memories for different types
        pref_memory = SemanticMemory(
            id=1,
            memory_key="pref:language",
            content="Python",
            memory_type=MemoryType.USER_PREFERENCE,
            scope=MemoryScope.USER,
            user_id="user-123",
            importance=0.8,
            access_count=5,
            created_at=datetime.utcnow(),
            updated_at=datetime.utcnow(),
        )
        
        fact_memory = SemanticMemory(
            id=2,
            memory_key="fact:framework",
            content="FastAPI",
            memory_type=MemoryType.PROJECT_FACT,
            scope=MemoryScope.PROJECT,
            user_id="user-123",
            project_id="project-456",
            importance=0.7,
            access_count=3,
            created_at=datetime.utcnow(),
            updated_at=datetime.utcnow(),
        )
        
        skill_memory = SemanticMemory(
            id=3,
            memory_key="skill:python",
            content="expert",
            memory_type=MemoryType.SKILL,
            scope=MemoryScope.USER,
            user_id="user-123",
            importance=0.9,
            access_count=10,
            created_at=datetime.utcnow(),
            updated_at=datetime.utcnow(),
        )
        
        # Mock different calls for different types
        call_count = [0]
        def mock_execute_side_effect(*args, **kwargs):
            call_count[0] += 1
            mock_result = MagicMock()
            if call_count[0] == 1:  # preferences
                mock_result.scalars.return_value.all.return_value = [pref_memory]
            elif call_count[0] == 2:  # facts
                mock_result.scalars.return_value.all.return_value = [fact_memory]
            elif call_count[0] == 3:  # skills
                mock_result.scalars.return_value.all.return_value = [skill_memory]
            else:
                mock_result.scalars.return_value.all.return_value = []
            return mock_result
        
        mock_db_session.execute.side_effect = mock_execute_side_effect
        
        context = await memory_service.get_context_for_prompt(
            user_id="user-123",
            project_id="project-456",
            include_preferences=True,
            include_facts=True,
            include_skills=True,
        )
        
        assert "preferences" in context
        assert "facts" in context
        assert "skills" in context
        assert len(context["preferences"]) == 1
        assert len(context["facts"]) == 1
        assert len(context["skills"]) == 1
    
    @pytest.mark.asyncio
    async def test_get_context_for_prompt_empty(self, memory_service, mock_db_session):
        """Test getting context when no memories exist."""
        mock_result = MagicMock()
        mock_result.scalars.return_value.all.return_value = []
        mock_db_session.execute.return_value = mock_result
        
        context = await memory_service.get_context_for_prompt(
            user_id="user-123",
        )
        
        assert context["preferences"] == []
        assert context["facts"] == []
        assert context["skills"] == []


class TestMemoryServiceDelete:
    """Tests for deleting memories."""
    
    @pytest.mark.asyncio
    async def test_delete_memory(self, memory_service, mock_db_session, sample_memory):
        """Test deleting a memory by ID."""
        # Mock execute to return rowcount > 0
        mock_result = MagicMock()
        mock_result.rowcount = 1
        mock_db_session.execute.return_value = mock_result
        
        # delete takes memory_id, not memory_key
        result = await memory_service.delete(memory_id=sample_memory.id)
        
        assert result is True
        mock_db_session.commit.assert_called()
    
    @pytest.mark.asyncio
    async def test_delete_memory_not_found(self, memory_service, mock_db_session):
        """Test deleting non-existent memory."""
        mock_result = MagicMock()
        mock_result.rowcount = 0
        mock_db_session.execute.return_value = mock_result
        
        result = await memory_service.delete(memory_id=999)
        
        assert result is False


class TestMemoryServiceUpdate:
    """Tests for updating memories."""
    
    @pytest.mark.asyncio
    async def test_update_importance(self, memory_service, mock_db_session, sample_memory):
        """Test updating memory importance score."""
        # Mock execute for update
        mock_update_result = MagicMock()
        mock_update_result.rowcount = 1
        
        # Mock execute for get_by_id
        mock_get_result = MagicMock()
        sample_memory.importance = 0.9
        mock_get_result.scalar_one_or_none.return_value = sample_memory
        
        mock_db_session.execute.side_effect = [mock_update_result, mock_get_result]
        
        # update_importance takes memory_id, not memory_key
        memory = await memory_service.update_importance(
            memory_id=sample_memory.id,
            importance=0.9,
        )
        
        assert memory is not None
        assert memory.importance == 0.9
        mock_db_session.commit.assert_called()
    
    @pytest.mark.asyncio
    async def test_boost_importance(self, memory_service, mock_db_session, sample_memory):
        """Test boosting importance score."""
        original_importance = sample_memory.importance
        
        # Mock for get_by_id
        mock_get_result = MagicMock()
        mock_get_result.scalar_one_or_none.return_value = sample_memory
        
        # Mock for update
        mock_update_result = MagicMock()
        mock_update_result.rowcount = 1
        
        # After boost
        boosted_memory = SemanticMemory(
            id=sample_memory.id,
            memory_key=sample_memory.memory_key,
            content=sample_memory.content,
            memory_type=sample_memory.memory_type,
            scope=sample_memory.scope,
            user_id=sample_memory.user_id,
            importance=original_importance + 0.1,
            access_count=sample_memory.access_count + 1,
            created_at=sample_memory.created_at,
            updated_at=datetime.utcnow(),
        )
        mock_get_result2 = MagicMock()
        mock_get_result2.scalar_one_or_none.return_value = boosted_memory
        
        mock_db_session.execute.side_effect = [mock_get_result, mock_update_result, mock_get_result2]
        
        memory = await memory_service.boost_importance(
            memory_id=sample_memory.id,
            boost=0.1,
        )
        
        assert memory is not None
        assert memory.importance == original_importance + 0.1
