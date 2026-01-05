"""
SmartSpec Pro - Vector Database Client

This module provides a ChromaDB client wrapper for managing vector embeddings
used in episodic memory and semantic search.

Features:
- Persistent and ephemeral storage modes
- Collection management
- Embedding storage and retrieval
- Similarity search
"""

import os
from typing import Optional, List, Dict, Any, Union
from pathlib import Path
import structlog
import chromadb
from chromadb.config import Settings

logger = structlog.get_logger(__name__)


# Global client instance
_chroma_client: Optional[chromadb.ClientAPI] = None


class VectorDBConfig:
    """Configuration for Vector Database."""
    
    def __init__(
        self,
        persist_directory: Optional[str] = None,
        anonymized_telemetry: bool = False,
        allow_reset: bool = True,
    ):
        """
        Initialize VectorDB configuration.
        
        Args:
            persist_directory: Directory for persistent storage. None for ephemeral.
            anonymized_telemetry: Whether to send anonymized usage data.
            allow_reset: Whether to allow resetting the database.
        """
        self.persist_directory = persist_directory or os.getenv(
            "CHROMA_PERSIST_DIR",
            str(Path.home() / ".smartspec" / "chroma")
        )
        self.anonymized_telemetry = anonymized_telemetry
        self.allow_reset = allow_reset


def get_chroma_client(
    config: Optional[VectorDBConfig] = None,
    ephemeral: bool = False
) -> chromadb.ClientAPI:
    """
    Get or create a ChromaDB client instance.
    
    Args:
        config: Optional configuration. Uses defaults if not provided.
        ephemeral: If True, use ephemeral (in-memory) storage.
    
    Returns:
        ChromaDB client instance
    """
    global _chroma_client
    
    if _chroma_client is not None:
        return _chroma_client
    
    if config is None:
        config = VectorDBConfig()
    
    if ephemeral:
        _chroma_client = chromadb.EphemeralClient(
            settings=Settings(
                anonymized_telemetry=config.anonymized_telemetry,
                allow_reset=config.allow_reset,
            )
        )
        logger.info("Created ephemeral ChromaDB client")
    else:
        # Ensure persist directory exists
        Path(config.persist_directory).mkdir(parents=True, exist_ok=True)
        
        _chroma_client = chromadb.PersistentClient(
            path=config.persist_directory,
            settings=Settings(
                anonymized_telemetry=config.anonymized_telemetry,
                allow_reset=config.allow_reset,
            )
        )
        logger.info(
            "Created persistent ChromaDB client",
            persist_directory=config.persist_directory
        )
    
    return _chroma_client


def reset_chroma_client():
    """Reset the global ChromaDB client instance."""
    global _chroma_client
    _chroma_client = None
    logger.info("ChromaDB client reset")


class VectorCollection:
    """
    Wrapper for ChromaDB collection with convenient methods.
    
    Provides a simplified interface for common vector operations.
    """
    
    def __init__(
        self,
        name: str,
        client: Optional[chromadb.ClientAPI] = None,
        embedding_function: Optional[Any] = None,
        metadata: Optional[Dict[str, Any]] = None,
    ):
        """
        Initialize a vector collection.
        
        Args:
            name: Collection name
            client: ChromaDB client. Uses global client if not provided.
            embedding_function: Custom embedding function. Uses default if not provided.
            metadata: Optional collection metadata
        """
        self.name = name
        self.client = client or get_chroma_client()
        self.embedding_function = embedding_function
        
        # Get or create collection
        self._collection = self.client.get_or_create_collection(
            name=name,
            embedding_function=embedding_function,
            metadata=metadata or {"hnsw:space": "cosine"}
        )
        
        logger.info("Initialized vector collection", collection_name=name)
    
    @property
    def collection(self) -> chromadb.Collection:
        """Get the underlying ChromaDB collection."""
        return self._collection
    
    def add(
        self,
        ids: List[str],
        documents: Optional[List[str]] = None,
        embeddings: Optional[List[List[float]]] = None,
        metadatas: Optional[List[Dict[str, Any]]] = None,
    ) -> None:
        """
        Add documents or embeddings to the collection.
        
        Args:
            ids: Unique identifiers for each item
            documents: Text documents (will be embedded if no embeddings provided)
            embeddings: Pre-computed embeddings
            metadatas: Metadata for each item
        """
        self._collection.add(
            ids=ids,
            documents=documents,
            embeddings=embeddings,
            metadatas=metadatas,
        )
        logger.debug(
            "Added items to collection",
            collection_name=self.name,
            count=len(ids)
        )
    
    def query(
        self,
        query_texts: Optional[List[str]] = None,
        query_embeddings: Optional[List[List[float]]] = None,
        n_results: int = 10,
        where: Optional[Dict[str, Any]] = None,
        where_document: Optional[Dict[str, Any]] = None,
        include: Optional[List[str]] = None,
    ) -> Dict[str, Any]:
        """
        Query the collection for similar items.
        
        Args:
            query_texts: Text queries (will be embedded)
            query_embeddings: Pre-computed query embeddings
            n_results: Number of results to return
            where: Metadata filter
            where_document: Document content filter
            include: Fields to include in results
        
        Returns:
            Query results with ids, documents, metadatas, and distances
        """
        include = include or ["documents", "metadatas", "distances"]
        
        results = self._collection.query(
            query_texts=query_texts,
            query_embeddings=query_embeddings,
            n_results=n_results,
            where=where,
            where_document=where_document,
            include=include,
        )
        
        logger.debug(
            "Queried collection",
            collection_name=self.name,
            n_results=n_results,
            result_count=len(results.get("ids", [[]])[0])
        )
        
        return results
    
    def get(
        self,
        ids: Optional[List[str]] = None,
        where: Optional[Dict[str, Any]] = None,
        limit: Optional[int] = None,
        include: Optional[List[str]] = None,
    ) -> Dict[str, Any]:
        """
        Get items from the collection by ID or filter.
        
        Args:
            ids: Specific IDs to retrieve
            where: Metadata filter
            limit: Maximum number of results
            include: Fields to include
        
        Returns:
            Retrieved items
        """
        include = include or ["documents", "metadatas"]
        
        return self._collection.get(
            ids=ids,
            where=where,
            limit=limit,
            include=include,
        )
    
    def update(
        self,
        ids: List[str],
        documents: Optional[List[str]] = None,
        embeddings: Optional[List[List[float]]] = None,
        metadatas: Optional[List[Dict[str, Any]]] = None,
    ) -> None:
        """
        Update existing items in the collection.
        
        Args:
            ids: IDs of items to update
            documents: New documents
            embeddings: New embeddings
            metadatas: New metadata
        """
        self._collection.update(
            ids=ids,
            documents=documents,
            embeddings=embeddings,
            metadatas=metadatas,
        )
        logger.debug(
            "Updated items in collection",
            collection_name=self.name,
            count=len(ids)
        )
    
    def delete(
        self,
        ids: Optional[List[str]] = None,
        where: Optional[Dict[str, Any]] = None,
    ) -> None:
        """
        Delete items from the collection.
        
        Args:
            ids: Specific IDs to delete
            where: Metadata filter for deletion
        """
        self._collection.delete(ids=ids, where=where)
        logger.debug(
            "Deleted items from collection",
            collection_name=self.name,
            ids=ids
        )
    
    def count(self) -> int:
        """Get the number of items in the collection."""
        return self._collection.count()
    
    def peek(self, limit: int = 10) -> Dict[str, Any]:
        """
        Peek at items in the collection.
        
        Args:
            limit: Number of items to peek
        
        Returns:
            Sample of items from the collection
        """
        return self._collection.peek(limit=limit)


# Pre-defined collection names
EPISODIC_MEMORY_COLLECTION = "episodic_memories"
CODE_SNIPPETS_COLLECTION = "code_snippets"
CONVERSATION_HISTORY_COLLECTION = "conversation_history"


def get_episodic_memory_collection(
    client: Optional[chromadb.ClientAPI] = None
) -> VectorCollection:
    """
    Get the episodic memory collection.
    
    Args:
        client: Optional ChromaDB client
    
    Returns:
        VectorCollection for episodic memories
    """
    return VectorCollection(
        name=EPISODIC_MEMORY_COLLECTION,
        client=client,
        metadata={
            "hnsw:space": "cosine",
            "description": "Stores episodic memories for RAG retrieval"
        }
    )


def get_code_snippets_collection(
    client: Optional[chromadb.ClientAPI] = None
) -> VectorCollection:
    """
    Get the code snippets collection.
    
    Args:
        client: Optional ChromaDB client
    
    Returns:
        VectorCollection for code snippets
    """
    return VectorCollection(
        name=CODE_SNIPPETS_COLLECTION,
        client=client,
        metadata={
            "hnsw:space": "cosine",
            "description": "Stores code snippets for semantic code search"
        }
    )


def get_conversation_history_collection(
    client: Optional[chromadb.ClientAPI] = None
) -> VectorCollection:
    """
    Get the conversation history collection.
    
    Args:
        client: Optional ChromaDB client
    
    Returns:
        VectorCollection for conversation history
    """
    return VectorCollection(
        name=CONVERSATION_HISTORY_COLLECTION,
        client=client,
        metadata={
            "hnsw:space": "cosine",
            "description": "Stores conversation history for context retrieval"
        }
    )
