"""
Unit tests for EpisodicMemoryService.
"""

import pytest
from unittest.mock import Mock, AsyncMock, patch, MagicMock
from datetime import datetime

from app.services.episodic_memory_service import (
    EpisodicMemoryService,
    get_episodic_memory_service,
    reset_episodic_memory_service,
)
from app.models.episodic_memory import (
    EpisodicMemory,
    EpisodeType,
    EpisodeSearchResult,
    ConversationEpisode,
    CodeEpisode,
)


@pytest.fixture
def mock_chroma_client():
    """Create a mock ChromaDB client."""
    client = MagicMock()
    return client


@pytest.fixture
def mock_collection():
    """Create a mock ChromaDB collection."""
    collection = MagicMock()
    collection.name = "test_collection"
    collection.count.return_value = 10
    collection.add = MagicMock()
    collection.query = MagicMock(return_value={
        "ids": [["id1", "id2"]],
        "documents": [["doc1", "doc2"]],
        "metadatas": [[
            {"episode_type": "conversation", "importance": 0.8, "created_at": "2026-01-01T00:00:00"},
            {"episode_type": "code_generation", "importance": 0.9, "created_at": "2026-01-01T00:00:00"},
        ]],
        "distances": [[0.1, 0.2]],
    })
    collection.get = MagicMock(return_value={
        "ids": ["id1"],
        "documents": ["doc1"],
        "metadatas": [{"episode_type": "conversation"}],
    })
    collection.delete = MagicMock()
    return collection


@pytest.fixture
def mock_embedding_service():
    """Create a mock embedding service."""
    service = MagicMock()
    service.embed.return_value = [0.1] * 384
    service.embed_batch.return_value = [[0.1] * 384, [0.2] * 384]
    service.get_cache_stats.return_value = {"enabled": True, "size": 0, "max_size": 10000}
    return service


class TestEpisodicMemoryServiceInit:
    """Tests for EpisodicMemoryService initialization."""
    
    @patch('app.services.episodic_memory_service.get_chroma_client')
    @patch('app.services.episodic_memory_service.get_embedding_service')
    @patch('app.services.episodic_memory_service.get_episodic_memory_collection')
    @patch('app.services.episodic_memory_service.get_code_snippets_collection')
    @patch('app.services.episodic_memory_service.get_conversation_history_collection')
    def test_init_creates_collections(
        self,
        mock_conv_coll,
        mock_code_coll,
        mock_episodic_coll,
        mock_embed_service,
        mock_chroma,
    ):
        """Test that initialization creates all collections."""
        mock_chroma.return_value = MagicMock()
        mock_embed_service.return_value = MagicMock()
        mock_episodic_coll.return_value = MagicMock(name="episodic_memories")
        mock_code_coll.return_value = MagicMock(name="code_snippets")
        mock_conv_coll.return_value = MagicMock(name="conversation_history")
        
        service = EpisodicMemoryService()
        
        assert service._episodic_collection is not None
        assert service._code_collection is not None
        assert service._conversation_collection is not None


class TestEpisodicMemoryServiceStore:
    """Tests for storing episodic memories."""
    
    @pytest.fixture
    def service(self, mock_chroma_client, mock_collection, mock_embedding_service):
        """Create service with mocks."""
        with patch('app.services.episodic_memory_service.get_chroma_client', return_value=mock_chroma_client):
            with patch('app.services.episodic_memory_service.get_embedding_service', return_value=mock_embedding_service):
                with patch('app.services.episodic_memory_service.get_episodic_memory_collection', return_value=mock_collection):
                    with patch('app.services.episodic_memory_service.get_code_snippets_collection', return_value=mock_collection):
                        with patch('app.services.episodic_memory_service.get_conversation_history_collection', return_value=mock_collection):
                            yield EpisodicMemoryService()
    
    @pytest.mark.asyncio
    async def test_store_episode(self, service, mock_collection):
        """Test storing a generic episode."""
        episode = EpisodicMemory(
            episode_type=EpisodeType.CONVERSATION,
            content="Test conversation",
            user_id="user-123",
        )
        
        episode_id = await service.store_episode(episode)
        
        assert episode_id == episode.id
        mock_collection.add.assert_called_once()
    
    @pytest.mark.asyncio
    async def test_store_conversation(self, service, mock_collection):
        """Test storing a conversation episode."""
        episode_id = await service.store_conversation(
            user_message="Hello",
            assistant_response="Hi there!",
            user_id="user-123",
            session_id="session-456",
        )
        
        # Episode ID should be returned
        assert episode_id is not None
        # The episode was stored (logged in output)
    
    @pytest.mark.asyncio
    async def test_store_code_episode(self, service, mock_collection):
        """Test storing a code episode."""
        episode_id = await service.store_code_episode(
            code="def hello(): pass",
            language="python",
            description="A simple function",
            user_id="user-123",
            project_id="project-456",
        )
        
        # Episode ID should be returned
        assert episode_id is not None
        # The episode was stored (logged in output)
    
    @pytest.mark.asyncio
    async def test_store_workflow_episode(self, service, mock_collection):
        """Test storing a workflow episode."""
        episode_id = await service.store_workflow_episode(
            workflow_id="wf-123",
            execution_id="exec-456",
            summary="Workflow completed",
            details="Details here",
            was_successful=True,
        )
        
        assert episode_id is not None
        mock_collection.add.assert_called_once()


class TestEpisodicMemoryServiceSearch:
    """Tests for searching episodic memories."""
    
    @pytest.fixture
    def service(self, mock_chroma_client, mock_collection, mock_embedding_service):
        """Create service with mocks."""
        with patch('app.services.episodic_memory_service.get_chroma_client', return_value=mock_chroma_client):
            with patch('app.services.episodic_memory_service.get_embedding_service', return_value=mock_embedding_service):
                with patch('app.services.episodic_memory_service.get_episodic_memory_collection', return_value=mock_collection):
                    with patch('app.services.episodic_memory_service.get_code_snippets_collection', return_value=mock_collection):
                        with patch('app.services.episodic_memory_service.get_conversation_history_collection', return_value=mock_collection):
                            yield EpisodicMemoryService()
    
    @pytest.mark.asyncio
    async def test_search_returns_results(self, service, mock_collection):
        """Test that search returns results."""
        results = await service.search(
            query="test query",
            n_results=10,
        )
        
        assert len(results) == 2
        assert isinstance(results[0], EpisodeSearchResult)
        mock_collection.query.assert_called_once()
    
    @pytest.mark.asyncio
    async def test_search_with_filters(self, service, mock_collection):
        """Test search with filters."""
        results = await service.search(
            query="test query",
            episode_types=[EpisodeType.CONVERSATION],
            user_id="user-123",
            project_id="project-456",
        )
        
        assert len(results) == 2
        # Check that query was called with where filter
        call_args = mock_collection.query.call_args
        assert call_args is not None
    
    @pytest.mark.asyncio
    async def test_search_conversations(self, service, mock_collection):
        """Test searching conversations specifically."""
        results = await service.search_conversations(
            query="hello",
            user_id="user-123",
        )
        
        assert len(results) == 2
    
    @pytest.mark.asyncio
    async def test_search_code(self, service, mock_collection):
        """Test searching code snippets."""
        results = await service.search_code(
            query="function",
            language="python",
            successful_only=True,
        )
        
        assert len(results) == 2


class TestEpisodicMemoryServiceRAG:
    """Tests for RAG context retrieval."""
    
    @pytest.fixture
    def service(self, mock_chroma_client, mock_collection, mock_embedding_service):
        """Create service with mocks."""
        with patch('app.services.episodic_memory_service.get_chroma_client', return_value=mock_chroma_client):
            with patch('app.services.episodic_memory_service.get_embedding_service', return_value=mock_embedding_service):
                with patch('app.services.episodic_memory_service.get_episodic_memory_collection', return_value=mock_collection):
                    with patch('app.services.episodic_memory_service.get_code_snippets_collection', return_value=mock_collection):
                        with patch('app.services.episodic_memory_service.get_conversation_history_collection', return_value=mock_collection):
                            yield EpisodicMemoryService()
    
    @pytest.mark.asyncio
    async def test_get_rag_context(self, service):
        """Test getting RAG context."""
        context = await service.get_rag_context(
            query="How do I create a function?",
            user_id="user-123",
        )
        
        assert "conversations" in context
        assert "code_snippets" in context
        assert "workflows" in context
        assert "total_episodes" in context
    
    @pytest.mark.asyncio
    async def test_get_rag_context_selective(self, service):
        """Test getting RAG context with selective categories."""
        context = await service.get_rag_context(
            query="test",
            include_conversations=True,
            include_code=False,
            include_workflows=False,
        )
        
        assert "conversations" in context
        assert context["code_snippets"] == []
        assert context["workflows"] == []
    
    def test_format_rag_context(self, service):
        """Test formatting RAG context for prompts."""
        context = {
            "conversations": [
                {"content": "User asked about Python", "relevance": 0.9}
            ],
            "code_snippets": [
                {"content": "def hello(): pass", "language": "python", "relevance": 0.8}
            ],
            "workflows": [
                {"summary": "Created API endpoint", "content": "Details", "relevance": 0.7}
            ],
            "total_episodes": 3,
        }
        
        formatted = service.format_rag_context(context)
        
        assert "Relevant Past Conversations" in formatted
        assert "Relevant Code Examples" in formatted
        assert "Relevant Past Workflows" in formatted


class TestEpisodicMemoryServiceDelete:
    """Tests for deleting episodic memories."""
    
    @pytest.fixture
    def service(self, mock_chroma_client, mock_collection, mock_embedding_service):
        """Create service with mocks."""
        with patch('app.services.episodic_memory_service.get_chroma_client', return_value=mock_chroma_client):
            with patch('app.services.episodic_memory_service.get_embedding_service', return_value=mock_embedding_service):
                with patch('app.services.episodic_memory_service.get_episodic_memory_collection', return_value=mock_collection):
                    with patch('app.services.episodic_memory_service.get_code_snippets_collection', return_value=mock_collection):
                        with patch('app.services.episodic_memory_service.get_conversation_history_collection', return_value=mock_collection):
                            yield EpisodicMemoryService()
    
    @pytest.mark.asyncio
    async def test_delete_episode(self, service, mock_collection):
        """Test deleting an episode."""
        result = await service.delete_episode("episode-123")
        
        assert result is True
        mock_collection.delete.assert_called_once_with(ids=["episode-123"])
    
    @pytest.mark.asyncio
    async def test_delete_user_episodes(self, service, mock_collection):
        """Test deleting all episodes for a user."""
        deleted_count = await service.delete_user_episodes("user-123")
        
        assert deleted_count == 1  # Based on mock get return
        mock_collection.get.assert_called_once()
        mock_collection.delete.assert_called_once()


class TestEpisodicMemoryServiceStats:
    """Tests for service statistics."""
    
    @pytest.fixture
    def service(self, mock_chroma_client, mock_collection, mock_embedding_service):
        """Create service with mocks."""
        with patch('app.services.episodic_memory_service.get_chroma_client', return_value=mock_chroma_client):
            with patch('app.services.episodic_memory_service.get_embedding_service', return_value=mock_embedding_service):
                with patch('app.services.episodic_memory_service.get_episodic_memory_collection', return_value=mock_collection):
                    with patch('app.services.episodic_memory_service.get_code_snippets_collection', return_value=mock_collection):
                        with patch('app.services.episodic_memory_service.get_conversation_history_collection', return_value=mock_collection):
                            yield EpisodicMemoryService()
    
    def test_get_stats(self, service, mock_collection):
        """Test getting service statistics."""
        stats = service.get_stats()
        
        assert "episodic_count" in stats
        assert "code_count" in stats
        assert "conversation_count" in stats
        assert "embedding_cache" in stats


class TestEpisodicMemoryModel:
    """Tests for EpisodicMemory model."""
    
    def test_create_episodic_memory(self):
        """Test creating an episodic memory."""
        episode = EpisodicMemory(
            episode_type=EpisodeType.CONVERSATION,
            content="Test content",
            user_id="user-123",
        )
        
        assert episode.id is not None
        assert episode.episode_type == EpisodeType.CONVERSATION
        assert episode.content == "Test content"
        assert episode.importance == 1.0
    
    def test_to_chroma_metadata(self):
        """Test converting to ChromaDB metadata."""
        episode = EpisodicMemory(
            episode_type=EpisodeType.CODE_GENERATION,
            content="def hello(): pass",
            user_id="user-123",
            project_id="project-456",
            language="python",
            tags=["python", "function"],
        )
        
        metadata = episode.to_chroma_metadata()
        
        assert metadata["episode_type"] == "code_generation"
        assert metadata["user_id"] == "user-123"
        assert metadata["project_id"] == "project-456"
        assert metadata["language"] == "python"
        assert metadata["tags"] == "python,function"
    
    def test_from_chroma_result(self):
        """Test creating from ChromaDB result."""
        episode = EpisodicMemory.from_chroma_result(
            id="test-id",
            document="Test content",
            metadata={
                "episode_type": "conversation",
                "user_id": "user-123",
                "importance": 0.8,
                "created_at": "2026-01-01T00:00:00",
            }
        )
        
        assert episode.id == "test-id"
        assert episode.content == "Test content"
        assert episode.episode_type == EpisodeType.CONVERSATION
        assert episode.user_id == "user-123"
        assert episode.importance == 0.8
    
    def test_to_dict(self):
        """Test converting to dictionary."""
        episode = EpisodicMemory(
            episode_type=EpisodeType.WORKFLOW_SUCCESS,
            content="Workflow completed",
            summary="Success",
        )
        
        data = episode.to_dict()
        
        assert data["episode_type"] == "workflow_success"
        assert data["content"] == "Workflow completed"
        assert data["summary"] == "Success"


class TestConversationEpisode:
    """Tests for ConversationEpisode model."""
    
    def test_create_conversation_episode(self):
        """Test creating a conversation episode."""
        conv = ConversationEpisode(
            user_message="Hello",
            assistant_response="Hi there!",
            user_id="user-123",
        )
        
        assert conv.user_message == "Hello"
        assert conv.assistant_response == "Hi there!"
    
    def test_to_episodic_memory(self):
        """Test converting to EpisodicMemory."""
        conv = ConversationEpisode(
            user_message="How do I create a function?",
            assistant_response="You can use the def keyword.",
            user_id="user-123",
            was_helpful=True,
        )
        
        episode = conv.to_episodic_memory()
        
        assert episode.episode_type == EpisodeType.CONVERSATION_TURN
        assert "User:" in episode.content
        assert "Assistant:" in episode.content
        assert episode.importance == 0.7  # was_helpful=True


class TestCodeEpisode:
    """Tests for CodeEpisode model."""
    
    def test_create_code_episode(self):
        """Test creating a code episode."""
        code_ep = CodeEpisode(
            code="def hello(): print('Hello')",
            language="python",
            description="A greeting function",
        )
        
        assert code_ep.code == "def hello(): print('Hello')"
        assert code_ep.language == "python"
    
    def test_to_episodic_memory(self):
        """Test converting to EpisodicMemory."""
        code_ep = CodeEpisode(
            code="def hello(): pass",
            language="python",
            description="A simple function",
            was_successful=True,
        )
        
        episode = code_ep.to_episodic_memory()
        
        assert episode.episode_type == EpisodeType.CODE_GENERATION
        assert "```python" in episode.content
        assert episode.language == "python"
        assert episode.importance == 0.9  # was_successful=True


class TestEpisodeSearchResult:
    """Tests for EpisodeSearchResult model."""
    
    def test_from_query_result(self):
        """Test creating from query result."""
        result = EpisodeSearchResult.from_query_result(
            id="test-id",
            document="Test content",
            metadata={"episode_type": "conversation", "importance": 0.8, "created_at": "2026-01-01T00:00:00"},
            distance=0.2,
        )
        
        assert result.episode.id == "test-id"
        assert result.distance == 0.2
        assert result.relevance_score == 0.8  # 1 - 0.2


class TestGlobalFunctions:
    """Tests for global service functions."""
    
    @patch('app.services.episodic_memory_service.EpisodicMemoryService')
    def test_get_episodic_memory_service(self, mock_service_class):
        """Test getting global service instance."""
        reset_episodic_memory_service()
        
        mock_service_class.return_value = MagicMock()
        
        service1 = get_episodic_memory_service()
        service2 = get_episodic_memory_service()
        
        # Should return same instance
        assert service1 is service2
        
        # Clean up
        reset_episodic_memory_service()
    
    @patch('app.services.episodic_memory_service.EpisodicMemoryService')
    def test_get_episodic_memory_service_force_new(self, mock_service_class):
        """Test forcing new service instance."""
        reset_episodic_memory_service()
        
        mock_service_class.return_value = MagicMock()
        
        service1 = get_episodic_memory_service()
        service2 = get_episodic_memory_service(force_new=True)
        
        # Should create new instance
        assert mock_service_class.call_count == 2
        
        # Clean up
        reset_episodic_memory_service()
