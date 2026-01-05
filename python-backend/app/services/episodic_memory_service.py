"""
SmartSpec Pro - Episodic Memory Service

This module provides the EpisodicMemoryService for managing episodic memories
using ChromaDB for vector storage and semantic search.

Features:
- Store conversation episodes
- Store code-related episodes
- Semantic similarity search
- RAG context retrieval
- Episode lifecycle management
"""

from datetime import datetime, timedelta
from typing import Optional, List, Dict, Any, Union
import structlog
import chromadb

from app.core.vectordb import (
    VectorCollection,
    get_chroma_client,
    get_episodic_memory_collection,
    get_code_snippets_collection,
    get_conversation_history_collection,
)
from app.models.episodic_memory import (
    EpisodicMemory,
    EpisodeType,
    EpisodeSearchResult,
    ConversationEpisode,
    CodeEpisode,
)
from app.services.embedding_service import (
    EmbeddingService,
    get_embedding_service,
)


logger = structlog.get_logger(__name__)


class EpisodicMemoryService:
    """
    Service for managing episodic memories with vector search.
    
    Provides methods for storing, retrieving, and searching episodic
    memories using ChromaDB for vector storage.
    """
    
    def __init__(
        self,
        chroma_client: Optional[chromadb.ClientAPI] = None,
        embedding_service: Optional[EmbeddingService] = None,
    ):
        """
        Initialize the episodic memory service.
        
        Args:
            chroma_client: Optional ChromaDB client
            embedding_service: Optional embedding service
        """
        self._client = chroma_client or get_chroma_client()
        self._embedding_service = embedding_service or get_embedding_service()
        
        # Initialize collections
        self._episodic_collection = get_episodic_memory_collection(self._client)
        self._code_collection = get_code_snippets_collection(self._client)
        self._conversation_collection = get_conversation_history_collection(self._client)
        
        logger.info("Initialized episodic memory service")
    
    # ==================== STORE OPERATIONS ====================
    
    async def store_episode(
        self,
        episode: EpisodicMemory,
        collection_name: Optional[str] = None,
    ) -> str:
        """
        Store an episodic memory.
        
        Args:
            episode: EpisodicMemory to store
            collection_name: Optional specific collection name
        
        Returns:
            Episode ID
        """
        # Select collection based on episode type
        collection = self._get_collection_for_type(episode.episode_type, collection_name)
        
        # Add to collection
        collection.add(
            ids=[episode.id],
            documents=[episode.content],
            metadatas=[episode.to_chroma_metadata()],
        )
        
        logger.info(
            "Stored episodic memory",
            episode_id=episode.id,
            episode_type=episode.episode_type.value,
            collection=collection.name
        )
        
        return episode.id
    
    async def store_conversation(
        self,
        user_message: str,
        assistant_response: str,
        user_id: Optional[str] = None,
        session_id: Optional[str] = None,
        model_used: Optional[str] = None,
        was_helpful: Optional[bool] = None,
    ) -> str:
        """
        Store a conversation turn.
        
        Args:
            user_message: User's message
            assistant_response: Assistant's response
            user_id: Optional user ID
            session_id: Optional session ID
            model_used: Model used for response
            was_helpful: Whether response was helpful
        
        Returns:
            Episode ID
        """
        episode = ConversationEpisode(
            user_message=user_message,
            assistant_response=assistant_response,
            user_id=user_id,
            session_id=session_id,
            model_used=model_used,
            was_helpful=was_helpful,
        )
        
        return await self.store_episode(
            episode.to_episodic_memory(),
            collection_name=self._conversation_collection.name
        )
    
    async def store_code_episode(
        self,
        code: str,
        language: str,
        description: str,
        user_id: Optional[str] = None,
        project_id: Optional[str] = None,
        file_path: Optional[str] = None,
        episode_type: EpisodeType = EpisodeType.CODE_GENERATION,
        was_successful: bool = True,
        error_message: Optional[str] = None,
    ) -> str:
        """
        Store a code-related episode.
        
        Args:
            code: Code content
            language: Programming language
            description: Description of the code
            user_id: Optional user ID
            project_id: Optional project ID
            file_path: Optional file path
            episode_type: Type of code episode
            was_successful: Whether code was successful
            error_message: Optional error message
        
        Returns:
            Episode ID
        """
        episode = CodeEpisode(
            code=code,
            language=language,
            description=description,
            user_id=user_id,
            project_id=project_id,
            file_path=file_path,
            episode_type=episode_type,
            was_successful=was_successful,
            error_message=error_message,
        )
        
        return await self.store_episode(
            episode.to_episodic_memory(),
            collection_name=self._code_collection.name
        )
    
    async def store_workflow_episode(
        self,
        workflow_id: str,
        execution_id: str,
        summary: str,
        details: str,
        user_id: Optional[str] = None,
        project_id: Optional[str] = None,
        was_successful: bool = True,
        tags: Optional[List[str]] = None,
    ) -> str:
        """
        Store a workflow execution episode.
        
        Args:
            workflow_id: Workflow ID
            execution_id: Execution ID
            summary: Execution summary
            details: Detailed description
            user_id: Optional user ID
            project_id: Optional project ID
            was_successful: Whether workflow succeeded
            tags: Optional tags
        
        Returns:
            Episode ID
        """
        episode = EpisodicMemory(
            episode_type=EpisodeType.WORKFLOW_SUCCESS if was_successful else EpisodeType.WORKFLOW_FAILURE,
            content=f"{summary}\n\n{details}",
            summary=summary,
            user_id=user_id,
            project_id=project_id,
            workflow_id=workflow_id,
            execution_id=execution_id,
            source="workflow_execution",
            importance=0.9 if was_successful else 0.7,
            success_score=1.0 if was_successful else 0.0,
            tags=tags or [],
        )
        
        return await self.store_episode(episode)
    
    # ==================== SEARCH OPERATIONS ====================
    
    async def search(
        self,
        query: str,
        n_results: int = 10,
        episode_types: Optional[List[EpisodeType]] = None,
        user_id: Optional[str] = None,
        project_id: Optional[str] = None,
        min_importance: float = 0.0,
        collection_name: Optional[str] = None,
    ) -> List[EpisodeSearchResult]:
        """
        Search episodic memories by semantic similarity.
        
        Args:
            query: Search query
            n_results: Number of results to return
            episode_types: Optional filter by episode types
            user_id: Optional filter by user ID
            project_id: Optional filter by project ID
            min_importance: Minimum importance score
            collection_name: Optional specific collection
        
        Returns:
            List of search results with relevance scores
        """
        # Build where filter
        where_filter = self._build_where_filter(
            episode_types=episode_types,
            user_id=user_id,
            project_id=project_id,
            min_importance=min_importance,
        )
        
        # Select collection
        collection = self._get_collection(collection_name)
        
        # Query
        results = collection.query(
            query_texts=[query],
            n_results=n_results,
            where=where_filter if where_filter else None,
            include=["documents", "metadatas", "distances"],
        )
        
        # Convert to EpisodeSearchResult
        search_results = []
        if results["ids"] and results["ids"][0]:
            for i, id in enumerate(results["ids"][0]):
                search_results.append(
                    EpisodeSearchResult.from_query_result(
                        id=id,
                        document=results["documents"][0][i],
                        metadata=results["metadatas"][0][i],
                        distance=results["distances"][0][i],
                    )
                )
        
        logger.debug(
            "Searched episodic memories",
            query=query[:50],
            n_results=len(search_results)
        )
        
        return search_results
    
    async def search_conversations(
        self,
        query: str,
        n_results: int = 10,
        user_id: Optional[str] = None,
        session_id: Optional[str] = None,
    ) -> List[EpisodeSearchResult]:
        """
        Search conversation history.
        
        Args:
            query: Search query
            n_results: Number of results
            user_id: Optional user filter
            session_id: Optional session filter
        
        Returns:
            List of matching conversation episodes
        """
        where_filter = {}
        if user_id:
            where_filter["user_id"] = user_id
        if session_id:
            where_filter["session_id"] = session_id
        
        results = self._conversation_collection.query(
            query_texts=[query],
            n_results=n_results,
            where=where_filter if where_filter else None,
            include=["documents", "metadatas", "distances"],
        )
        
        search_results = []
        if results["ids"] and results["ids"][0]:
            for i, id in enumerate(results["ids"][0]):
                search_results.append(
                    EpisodeSearchResult.from_query_result(
                        id=id,
                        document=results["documents"][0][i],
                        metadata=results["metadatas"][0][i],
                        distance=results["distances"][0][i],
                    )
                )
        
        return search_results
    
    async def search_code(
        self,
        query: str,
        n_results: int = 10,
        language: Optional[str] = None,
        project_id: Optional[str] = None,
        successful_only: bool = False,
    ) -> List[EpisodeSearchResult]:
        """
        Search code snippets.
        
        Args:
            query: Search query
            n_results: Number of results
            language: Optional language filter
            project_id: Optional project filter
            successful_only: Only return successful code
        
        Returns:
            List of matching code episodes
        """
        where_filter = {}
        if language:
            where_filter["language"] = language
        if project_id:
            where_filter["project_id"] = project_id
        if successful_only:
            where_filter["success_score"] = {"$gte": 0.5}
        
        results = self._code_collection.query(
            query_texts=[query],
            n_results=n_results,
            where=where_filter if where_filter else None,
            include=["documents", "metadatas", "distances"],
        )
        
        search_results = []
        if results["ids"] and results["ids"][0]:
            for i, id in enumerate(results["ids"][0]):
                search_results.append(
                    EpisodeSearchResult.from_query_result(
                        id=id,
                        document=results["documents"][0][i],
                        metadata=results["metadatas"][0][i],
                        distance=results["distances"][0][i],
                    )
                )
        
        return search_results
    
    # ==================== RAG CONTEXT ====================
    
    async def get_rag_context(
        self,
        query: str,
        user_id: Optional[str] = None,
        project_id: Optional[str] = None,
        max_episodes: int = 5,
        include_conversations: bool = True,
        include_code: bool = True,
        include_workflows: bool = True,
    ) -> Dict[str, Any]:
        """
        Get relevant context for RAG (Retrieval-Augmented Generation).
        
        This method retrieves the most relevant episodic memories
        to be included in LLM prompts for context-aware responses.
        
        Args:
            query: The query/prompt to find context for
            user_id: Optional user ID filter
            project_id: Optional project ID filter
            max_episodes: Maximum episodes per category
            include_conversations: Include conversation history
            include_code: Include code snippets
            include_workflows: Include workflow episodes
        
        Returns:
            Dictionary with categorized relevant episodes
        """
        context = {
            "conversations": [],
            "code_snippets": [],
            "workflows": [],
            "total_episodes": 0,
        }
        
        # Search conversations
        if include_conversations:
            conv_results = await self.search_conversations(
                query=query,
                n_results=max_episodes,
                user_id=user_id,
            )
            context["conversations"] = [
                {
                    "content": r.episode.content,
                    "relevance": r.relevance_score,
                    "created_at": r.episode.created_at.isoformat(),
                }
                for r in conv_results
            ]
        
        # Search code
        if include_code:
            code_results = await self.search_code(
                query=query,
                n_results=max_episodes,
                project_id=project_id,
                successful_only=True,
            )
            context["code_snippets"] = [
                {
                    "content": r.episode.content,
                    "language": r.episode.language,
                    "relevance": r.relevance_score,
                    "file_path": r.episode.file_path,
                }
                for r in code_results
            ]
        
        # Search workflows
        if include_workflows:
            workflow_results = await self.search(
                query=query,
                n_results=max_episodes,
                episode_types=[EpisodeType.WORKFLOW_SUCCESS],
                user_id=user_id,
                project_id=project_id,
            )
            context["workflows"] = [
                {
                    "summary": r.episode.summary,
                    "content": r.episode.content,
                    "relevance": r.relevance_score,
                }
                for r in workflow_results
            ]
        
        context["total_episodes"] = (
            len(context["conversations"]) +
            len(context["code_snippets"]) +
            len(context["workflows"])
        )
        
        logger.debug(
            "Retrieved RAG context",
            query=query[:50],
            total_episodes=context["total_episodes"]
        )
        
        return context
    
    def format_rag_context(self, context: Dict[str, Any]) -> str:
        """
        Format RAG context as a string for LLM prompts.
        
        Args:
            context: Context dictionary from get_rag_context
        
        Returns:
            Formatted context string
        """
        parts = []
        
        if context["conversations"]:
            parts.append("## Relevant Past Conversations\n")
            for conv in context["conversations"][:3]:
                parts.append(f"- {conv['content'][:200]}...\n")
        
        if context["code_snippets"]:
            parts.append("\n## Relevant Code Examples\n")
            for code in context["code_snippets"][:3]:
                lang = code.get("language", "")
                parts.append(f"```{lang}\n{code['content'][:500]}\n```\n")
        
        if context["workflows"]:
            parts.append("\n## Relevant Past Workflows\n")
            for wf in context["workflows"][:3]:
                parts.append(f"- {wf['summary']}\n")
        
        return "".join(parts) if parts else ""
    
    # ==================== DELETE OPERATIONS ====================
    
    async def delete_episode(
        self,
        episode_id: str,
        collection_name: Optional[str] = None,
    ) -> bool:
        """
        Delete an episode by ID.
        
        Args:
            episode_id: Episode ID to delete
            collection_name: Optional collection name
        
        Returns:
            True if deleted
        """
        collection = self._get_collection(collection_name)
        
        try:
            collection.delete(ids=[episode_id])
            logger.info("Deleted episode", episode_id=episode_id)
            return True
        except Exception as e:
            logger.error("Failed to delete episode", episode_id=episode_id, error=str(e))
            return False
    
    async def delete_user_episodes(
        self,
        user_id: str,
        collection_name: Optional[str] = None,
    ) -> int:
        """
        Delete all episodes for a user.
        
        Args:
            user_id: User ID
            collection_name: Optional collection name
        
        Returns:
            Number of deleted episodes
        """
        collection = self._get_collection(collection_name)
        
        # Get all episodes for user
        results = collection.get(
            where={"user_id": user_id},
            include=["metadatas"],
        )
        
        if not results["ids"]:
            return 0
        
        # Delete all
        collection.delete(ids=results["ids"])
        
        deleted_count = len(results["ids"])
        logger.info("Deleted user episodes", user_id=user_id, count=deleted_count)
        
        return deleted_count
    
    # ==================== UTILITY METHODS ====================
    
    def _get_collection_for_type(
        self,
        episode_type: EpisodeType,
        collection_name: Optional[str] = None,
    ) -> VectorCollection:
        """Get the appropriate collection for an episode type."""
        if collection_name:
            return VectorCollection(name=collection_name, client=self._client)
        
        if episode_type in [EpisodeType.CONVERSATION, EpisodeType.CONVERSATION_TURN]:
            return self._conversation_collection
        elif episode_type in [
            EpisodeType.CODE_GENERATION,
            EpisodeType.CODE_FIX,
            EpisodeType.CODE_REFACTOR,
        ]:
            return self._code_collection
        else:
            return self._episodic_collection
    
    def _get_collection(
        self,
        collection_name: Optional[str] = None,
    ) -> VectorCollection:
        """Get collection by name or default."""
        if collection_name:
            return VectorCollection(name=collection_name, client=self._client)
        return self._episodic_collection
    
    def _build_where_filter(
        self,
        episode_types: Optional[List[EpisodeType]] = None,
        user_id: Optional[str] = None,
        project_id: Optional[str] = None,
        min_importance: float = 0.0,
    ) -> Optional[Dict[str, Any]]:
        """Build ChromaDB where filter."""
        conditions = []
        
        if episode_types:
            type_values = [t.value for t in episode_types]
            if len(type_values) == 1:
                conditions.append({"episode_type": type_values[0]})
            else:
                conditions.append({"episode_type": {"$in": type_values}})
        
        if user_id:
            conditions.append({"user_id": user_id})
        
        if project_id:
            conditions.append({"project_id": project_id})
        
        if min_importance > 0:
            conditions.append({"importance": {"$gte": min_importance}})
        
        if not conditions:
            return None
        
        if len(conditions) == 1:
            return conditions[0]
        
        return {"$and": conditions}
    
    def get_stats(self) -> Dict[str, Any]:
        """Get service statistics."""
        return {
            "episodic_count": self._episodic_collection.count(),
            "code_count": self._code_collection.count(),
            "conversation_count": self._conversation_collection.count(),
            "embedding_cache": self._embedding_service.get_cache_stats(),
        }


# Global service instance
_episodic_memory_service: Optional[EpisodicMemoryService] = None


def get_episodic_memory_service(
    chroma_client: Optional[chromadb.ClientAPI] = None,
    force_new: bool = False,
) -> EpisodicMemoryService:
    """
    Get or create the global episodic memory service.
    
    Args:
        chroma_client: Optional ChromaDB client
        force_new: Force creation of new instance
    
    Returns:
        EpisodicMemoryService instance
    """
    global _episodic_memory_service
    
    if _episodic_memory_service is None or force_new:
        _episodic_memory_service = EpisodicMemoryService(chroma_client=chroma_client)
    
    return _episodic_memory_service


def reset_episodic_memory_service() -> None:
    """Reset the global episodic memory service."""
    global _episodic_memory_service
    _episodic_memory_service = None
    logger.info("Episodic memory service reset")
