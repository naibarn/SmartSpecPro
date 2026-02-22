"""
SmartSpec Pro - Vector Retriever
Phase 2: Quality & Intelligence

Vector-based retriever using embeddings for semantic similarity search.
Supports multiple embedding providers and vector stores.
"""

from __future__ import annotations

import asyncio
import hashlib
from dataclasses import dataclass
from typing import TYPE_CHECKING, Dict, List, Optional, Tuple

import numpy as np
import structlog

if TYPE_CHECKING:
    from app.orchestrator.rag.hybrid_rag import Document

logger = structlog.get_logger()


@dataclass
class VectorDocument:
    """Document with vector embedding."""
    doc_id: str
    embedding: np.ndarray
    original_doc: Document


class VectorRetriever:
    """
    Vector Retriever for semantic similarity search.
    
    Uses embeddings to find semantically similar documents.
    Supports:
    - OpenAI embeddings
    - Local embeddings (sentence-transformers)
    - Custom embedding functions
    """
    
    # Default embedding dimension
    DEFAULT_DIMENSION = 1536  # OpenAI ada-002
    
    def __init__(
        self,
        threshold: float = 0.5,
        embedding_model: str = "text-embedding-ada-002",
        use_cache: bool = True,
    ) -> None:
        """
        Initialize Vector Retriever.
        
        Args:
            threshold: Minimum similarity threshold
            embedding_model: Embedding model to use
            use_cache: Whether to cache embeddings
        """
        self.threshold = threshold
        self.embedding_model = embedding_model
        self.use_cache = use_cache
        
        # Document storage
        self._documents: Dict[str, VectorDocument] = {}
        
        # Embedding cache
        self._embedding_cache: Dict[str, np.ndarray] = {}
        
        # Embedding client (lazy loaded)
        self._embedding_client = None
        
        logger.info(
            "vector_retriever_initialized",
            model=embedding_model,
            threshold=threshold,
        )
    
    async def _get_embedding(self, text: str) -> np.ndarray:
        """
        Get embedding for text.
        
        Args:
            text: Input text
            
        Returns:
            Embedding vector as numpy array
        """
        # Check cache
        if self.use_cache:
            cache_key = hashlib.md5(text.encode()).hexdigest()
            if cache_key in self._embedding_cache:
                return self._embedding_cache[cache_key]
        
        try:
            # Try to use OpenAI
            embedding = await self._get_openai_embedding(text)
        except Exception as e:
            logger.warning(
                "openai_embedding_failed",
                error=str(e),
            )
            # Fallback to simple embedding
            embedding = self._get_simple_embedding(text)
        
        # Cache
        if self.use_cache:
            self._embedding_cache[cache_key] = embedding
        
        return embedding
    
    async def _get_openai_embedding(self, text: str) -> np.ndarray:
        """Get embedding using OpenAI API."""
        import os
        
        try:
            from openai import AsyncOpenAI
            
            if self._embedding_client is None:
                self._embedding_client = AsyncOpenAI()
            
            response = await self._embedding_client.embeddings.create(
                model=self.embedding_model,
                input=text[:8000],  # Truncate to max length
            )
            
            return np.array(response.data[0].embedding)
            
        except ImportError:
            raise Exception("OpenAI package not installed")
        except Exception as e:
            raise Exception(f"OpenAI embedding failed: {str(e)}")
    
    def _get_simple_embedding(self, text: str) -> np.ndarray:
        """
        Get simple embedding (fallback).
        
        Uses a simple bag-of-words approach with hashing.
        Not as good as neural embeddings but works offline.
        """
        # Simple hash-based embedding
        dimension = self.DEFAULT_DIMENSION
        embedding = np.zeros(dimension)
        
        # Tokenize
        tokens = text.lower().split()
        
        for token in tokens:
            # Hash token to get index
            hash_val = int(hashlib.md5(token.encode()).hexdigest(), 16)
            index = hash_val % dimension
            
            # Add to embedding
            embedding[index] += 1
        
        # Normalize
        norm = np.linalg.norm(embedding)
        if norm > 0:
            embedding = embedding / norm
        
        return embedding
    
    def _cosine_similarity(
        self,
        vec1: np.ndarray,
        vec2: np.ndarray,
    ) -> float:
        """
        Calculate cosine similarity between two vectors.
        
        Args:
            vec1: First vector
            vec2: Second vector
            
        Returns:
            Cosine similarity (0 to 1)
        """
        dot_product = np.dot(vec1, vec2)
        norm1 = np.linalg.norm(vec1)
        norm2 = np.linalg.norm(vec2)
        
        if norm1 == 0 or norm2 == 0:
            return 0.0
        
        return dot_product / (norm1 * norm2)
    
    async def add_document(self, doc: Document) -> None:
        """
        Add a document to the index.
        
        Args:
            doc: Document object with doc_id and content attributes
        """
        doc_id = doc.doc_id
        content = doc.content
        
        # Get embedding
        embedding = await self._get_embedding(content)
        
        # Create vector document
        vector_doc = VectorDocument(
            doc_id=doc_id,
            embedding=embedding,
            original_doc=doc,
        )
        
        # Store
        self._documents[doc_id] = vector_doc
    
    async def retrieve(
        self,
        query: str,
        top_k: int = 10,
        filters: Optional[Dict[str, Any]] = None,
    ) -> List[Any]:
        """
        Retrieve documents similar to the query.
        
        Args:
            query: Search query
            top_k: Number of results to return
            filters: Metadata filters (tenant_id, allowed_scopes)
            
        Returns:
            List of Document objects sorted by similarity
        """
        if not self._documents:
            return []
        
        # Get query embedding
        query_embedding = await self._get_embedding(query)
        
        # Calculate similarities
        similarities: List[Tuple[float, Any]] = []

        for doc_id, vector_doc in self._documents.items():
            # Apply filters before scoring
            if filters and not self._apply_filters(vector_doc, filters):
                continue

            similarity = self._cosine_similarity(
                query_embedding,
                vector_doc.embedding,
            )

            if similarity >= self.threshold:
                # Update score on original document
                vector_doc.original_doc.vector_score = similarity
                similarities.append((similarity, vector_doc.original_doc))
        
        # Sort by similarity
        similarities.sort(key=lambda x: x[0], reverse=True)
        
        # Return top_k
        return [doc for score, doc in similarities[:top_k]]
    
    @staticmethod
    def _apply_filters(vector_doc: VectorDocument, filters: Dict[str, Any]) -> bool:
        """Check if a vector document passes filter criteria."""
        metadata = getattr(vector_doc.original_doc, "metadata", {}) or {}

        if "tenant_id" in filters:
            if metadata.get("tenant_id") != filters["tenant_id"]:
                return False

        if "allowed_scopes" in filters:
            doc_scopes = set(metadata.get("allowed_scopes") or [])
            filter_scopes = set(filters["allowed_scopes"])
            if not doc_scopes & filter_scopes:
                return False

        if "doc_type" in filters:
            doc_type = metadata.get("doc_type")
            filter_type = filters["doc_type"]
            if isinstance(filter_type, list):
                if doc_type not in filter_type:
                    return False
            elif doc_type != filter_type:
                return False

        if "source" in filters:
            if metadata.get("source") != filters["source"]:
                return False

        return True

    async def cleanup(self) -> None:
        """Cleanup resources."""
        self._documents.clear()
        self._embedding_cache.clear()
        self._embedding_client = None

        logger.info("vector_retriever_cleanup_complete")
