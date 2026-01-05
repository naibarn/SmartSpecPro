"""
SmartSpec Pro - Episodic Memory Model

This module defines the EpisodicMemory model for storing conversation episodes,
code snippets, and other contextual information that can be retrieved via
semantic similarity search.

Episodic memory stores:
- Conversation summaries
- Successful code generations
- Error resolutions
- User feedback on outputs
- Command sequences
"""

from datetime import datetime
from typing import Optional, Dict, Any, List
from enum import Enum
from pydantic import BaseModel, Field
from uuid import uuid4


class EpisodeType(str, Enum):
    """Types of episodic memory."""
    
    # Conversation episodes
    CONVERSATION = "conversation"           # Full conversation summary
    CONVERSATION_TURN = "conversation_turn" # Single turn in conversation
    
    # Code-related episodes
    CODE_GENERATION = "code_generation"     # Successful code generation
    CODE_FIX = "code_fix"                   # Bug fix or error resolution
    CODE_REFACTOR = "code_refactor"         # Code refactoring
    
    # Workflow episodes
    WORKFLOW_SUCCESS = "workflow_success"   # Successful workflow execution
    WORKFLOW_FAILURE = "workflow_failure"   # Failed workflow (for learning)
    
    # Kilo CLI episodes
    KILO_COMMAND = "kilo_command"           # Kilo CLI command sequence
    KILO_SKILL = "kilo_skill"               # Learned Kilo skill
    
    # Feedback episodes
    USER_FEEDBACK = "user_feedback"         # User feedback on output
    CORRECTION = "correction"               # User correction


class EpisodicMemory(BaseModel):
    """
    Model for episodic memory entries.
    
    Episodic memories are stored in ChromaDB with embeddings for
    semantic similarity search. This model defines the structure
    of the metadata stored alongside the embeddings.
    """
    
    # Identification
    id: str = Field(default_factory=lambda: str(uuid4()))
    episode_type: EpisodeType
    
    # Content
    content: str  # Main content (will be embedded)
    summary: Optional[str] = None  # Short summary
    
    # Context
    user_id: Optional[str] = None
    project_id: Optional[str] = None
    session_id: Optional[str] = None
    workflow_id: Optional[str] = None
    execution_id: Optional[str] = None
    
    # Source tracking
    source: Optional[str] = None  # Where this episode came from
    source_messages: Optional[List[Dict[str, str]]] = None  # Original messages
    
    # Code-specific fields
    language: Optional[str] = None  # Programming language
    file_path: Optional[str] = None  # Related file path
    code_snippet: Optional[str] = None  # Actual code
    
    # Relevance
    importance: float = Field(default=1.0, ge=0.0, le=1.0)
    success_score: Optional[float] = None  # 0.0-1.0 for success rating
    
    # Timestamps
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
    
    # Tags for filtering
    tags: List[str] = Field(default_factory=list)
    
    # Extra metadata
    extra_data: Dict[str, Any] = Field(default_factory=dict)
    
    def to_chroma_metadata(self) -> Dict[str, Any]:
        """
        Convert to ChromaDB-compatible metadata.
        
        ChromaDB metadata must be flat (no nested dicts/lists) and
        values must be str, int, float, or bool.
        """
        metadata = {
            "episode_type": self.episode_type.value,
            "importance": self.importance,
            "created_at": self.created_at.isoformat(),
        }
        
        # Add optional fields if present
        if self.user_id:
            metadata["user_id"] = self.user_id
        if self.project_id:
            metadata["project_id"] = self.project_id
        if self.session_id:
            metadata["session_id"] = self.session_id
        if self.workflow_id:
            metadata["workflow_id"] = self.workflow_id
        if self.execution_id:
            metadata["execution_id"] = self.execution_id
        if self.source:
            metadata["source"] = self.source
        if self.language:
            metadata["language"] = self.language
        if self.file_path:
            metadata["file_path"] = self.file_path
        if self.success_score is not None:
            metadata["success_score"] = self.success_score
        if self.summary:
            metadata["summary"] = self.summary
        if self.tags:
            metadata["tags"] = ",".join(self.tags)  # Flatten to string
        
        return metadata
    
    @classmethod
    def from_chroma_result(
        cls,
        id: str,
        document: str,
        metadata: Dict[str, Any]
    ) -> "EpisodicMemory":
        """
        Create an EpisodicMemory from ChromaDB query result.
        
        Args:
            id: Document ID
            document: Document content
            metadata: Document metadata
        
        Returns:
            EpisodicMemory instance
        """
        # Parse tags back to list
        tags = []
        if "tags" in metadata and metadata["tags"]:
            tags = metadata["tags"].split(",")
        
        # Parse datetime
        created_at = datetime.utcnow()
        if "created_at" in metadata:
            try:
                created_at = datetime.fromisoformat(metadata["created_at"])
            except (ValueError, TypeError):
                pass
        
        return cls(
            id=id,
            episode_type=EpisodeType(metadata.get("episode_type", "conversation")),
            content=document,
            summary=metadata.get("summary"),
            user_id=metadata.get("user_id"),
            project_id=metadata.get("project_id"),
            session_id=metadata.get("session_id"),
            workflow_id=metadata.get("workflow_id"),
            execution_id=metadata.get("execution_id"),
            source=metadata.get("source"),
            language=metadata.get("language"),
            file_path=metadata.get("file_path"),
            importance=metadata.get("importance", 1.0),
            success_score=metadata.get("success_score"),
            created_at=created_at,
            tags=tags,
        )
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary representation."""
        return {
            "id": self.id,
            "episode_type": self.episode_type.value,
            "content": self.content,
            "summary": self.summary,
            "user_id": self.user_id,
            "project_id": self.project_id,
            "session_id": self.session_id,
            "workflow_id": self.workflow_id,
            "execution_id": self.execution_id,
            "source": self.source,
            "language": self.language,
            "file_path": self.file_path,
            "code_snippet": self.code_snippet,
            "importance": self.importance,
            "success_score": self.success_score,
            "created_at": self.created_at.isoformat(),
            "updated_at": self.updated_at.isoformat(),
            "tags": self.tags,
            "extra_data": self.extra_data,
        }


class EpisodeSearchResult(BaseModel):
    """Result from episodic memory search."""
    
    episode: EpisodicMemory
    distance: float  # Similarity distance (lower = more similar)
    relevance_score: float  # Normalized relevance (higher = more relevant)
    
    @classmethod
    def from_query_result(
        cls,
        id: str,
        document: str,
        metadata: Dict[str, Any],
        distance: float
    ) -> "EpisodeSearchResult":
        """
        Create from ChromaDB query result.
        
        Args:
            id: Document ID
            document: Document content
            metadata: Document metadata
            distance: Cosine distance
        
        Returns:
            EpisodeSearchResult instance
        """
        episode = EpisodicMemory.from_chroma_result(id, document, metadata)
        
        # Convert distance to relevance score (1 - distance for cosine)
        relevance_score = max(0.0, 1.0 - distance)
        
        return cls(
            episode=episode,
            distance=distance,
            relevance_score=relevance_score
        )


class ConversationEpisode(BaseModel):
    """
    Specialized model for conversation episodes.
    
    Stores a conversation turn or summary with associated context.
    """
    
    id: str = Field(default_factory=lambda: str(uuid4()))
    
    # Conversation content
    user_message: str
    assistant_response: str
    
    # Context
    user_id: Optional[str] = None
    session_id: Optional[str] = None
    
    # Metadata
    model_used: Optional[str] = None
    tokens_used: Optional[int] = None
    response_time_ms: Optional[int] = None
    
    # Quality indicators
    user_rating: Optional[int] = None  # 1-5 rating
    was_helpful: Optional[bool] = None
    
    # Timestamps
    created_at: datetime = Field(default_factory=datetime.utcnow)
    
    def to_episodic_memory(self) -> EpisodicMemory:
        """Convert to EpisodicMemory for storage."""
        content = f"User: {self.user_message}\n\nAssistant: {self.assistant_response}"
        
        return EpisodicMemory(
            id=self.id,
            episode_type=EpisodeType.CONVERSATION_TURN,
            content=content,
            summary=self.user_message[:200],  # First 200 chars as summary
            user_id=self.user_id,
            session_id=self.session_id,
            source="conversation",
            importance=0.7 if self.was_helpful else 0.5,
            success_score=self.user_rating / 5.0 if self.user_rating else None,
            created_at=self.created_at,
            extra_data={
                "model_used": self.model_used,
                "tokens_used": self.tokens_used,
                "response_time_ms": self.response_time_ms,
            }
        )


class CodeEpisode(BaseModel):
    """
    Specialized model for code-related episodes.
    
    Stores code generation, fixes, or refactoring with context.
    """
    
    id: str = Field(default_factory=lambda: str(uuid4()))
    
    # Code content
    code: str
    language: str
    description: str
    
    # Context
    user_id: Optional[str] = None
    project_id: Optional[str] = None
    file_path: Optional[str] = None
    
    # Type of code episode
    episode_type: EpisodeType = EpisodeType.CODE_GENERATION
    
    # Quality
    was_successful: bool = True
    error_message: Optional[str] = None
    
    # Timestamps
    created_at: datetime = Field(default_factory=datetime.utcnow)
    
    def to_episodic_memory(self) -> EpisodicMemory:
        """Convert to EpisodicMemory for storage."""
        content = f"{self.description}\n\n```{self.language}\n{self.code}\n```"
        
        return EpisodicMemory(
            id=self.id,
            episode_type=self.episode_type,
            content=content,
            summary=self.description[:200],
            user_id=self.user_id,
            project_id=self.project_id,
            source="code_generation",
            language=self.language,
            file_path=self.file_path,
            code_snippet=self.code,
            importance=0.9 if self.was_successful else 0.6,
            success_score=1.0 if self.was_successful else 0.0,
            created_at=self.created_at,
            tags=[self.language, "code"],
            extra_data={
                "error_message": self.error_message,
            }
        )
