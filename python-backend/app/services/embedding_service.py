"""
SmartSpec Pro - Embedding Service

This module provides embedding generation for text content using various
embedding models. It supports both local models and API-based models.

Features:
- Multiple embedding model support
- Caching for efficiency
- Batch processing
- Fallback mechanisms
"""

import os
import hashlib
from typing import Optional, List, Dict, Any, Union
from abc import ABC, abstractmethod
import structlog
from functools import lru_cache

logger = structlog.get_logger(__name__)


class EmbeddingProvider(ABC):
    """Abstract base class for embedding providers."""
    
    @abstractmethod
    def embed_text(self, text: str) -> List[float]:
        """
        Generate embedding for a single text.
        
        Args:
            text: Text to embed
        
        Returns:
            Embedding vector
        """
        pass
    
    @abstractmethod
    def embed_texts(self, texts: List[str]) -> List[List[float]]:
        """
        Generate embeddings for multiple texts.
        
        Args:
            texts: List of texts to embed
        
        Returns:
            List of embedding vectors
        """
        pass
    
    @property
    @abstractmethod
    def dimension(self) -> int:
        """Get the embedding dimension."""
        pass
    
    @property
    @abstractmethod
    def model_name(self) -> str:
        """Get the model name."""
        pass


class ChromaDefaultEmbedding(EmbeddingProvider):
    """
    Use ChromaDB's default embedding function.
    
    This uses the all-MiniLM-L6-v2 model by default, which is
    automatically downloaded and cached by ChromaDB.
    """
    
    def __init__(self):
        """Initialize the default ChromaDB embedding function."""
        from chromadb.utils import embedding_functions
        
        self._ef = embedding_functions.DefaultEmbeddingFunction()
        self._dimension = 384  # all-MiniLM-L6-v2 dimension
        logger.info("Initialized ChromaDB default embedding function")
    
    def embed_text(self, text: str) -> List[float]:
        """Generate embedding for a single text."""
        result = self._ef([text])
        return result[0]
    
    def embed_texts(self, texts: List[str]) -> List[List[float]]:
        """Generate embeddings for multiple texts."""
        return self._ef(texts)
    
    @property
    def dimension(self) -> int:
        return self._dimension
    
    @property
    def model_name(self) -> str:
        return "all-MiniLM-L6-v2"


class OpenAIEmbedding(EmbeddingProvider):
    """
    Use OpenAI's embedding API.
    
    Supports text-embedding-ada-002 and text-embedding-3-small/large models.
    """
    
    def __init__(
        self,
        model: str = "text-embedding-3-small",
        api_key: Optional[str] = None,
        base_url: Optional[str] = None,
    ):
        """
        Initialize OpenAI embedding provider.
        
        Args:
            model: Model name
            api_key: OpenAI API key (uses env var if not provided)
            base_url: Optional custom base URL
        """
        from openai import OpenAI
        
        self._model = model
        self._client = OpenAI(
            api_key=api_key or os.getenv("OPENAI_API_KEY"),
            base_url=base_url,
        )
        
        # Model dimensions
        self._dimensions = {
            "text-embedding-ada-002": 1536,
            "text-embedding-3-small": 1536,
            "text-embedding-3-large": 3072,
        }
        self._dimension = self._dimensions.get(model, 1536)
        
        logger.info("Initialized OpenAI embedding provider", model=model)
    
    def embed_text(self, text: str) -> List[float]:
        """Generate embedding for a single text."""
        response = self._client.embeddings.create(
            model=self._model,
            input=text,
        )
        return response.data[0].embedding
    
    def embed_texts(self, texts: List[str]) -> List[List[float]]:
        """Generate embeddings for multiple texts."""
        response = self._client.embeddings.create(
            model=self._model,
            input=texts,
        )
        return [item.embedding for item in response.data]
    
    @property
    def dimension(self) -> int:
        return self._dimension
    
    @property
    def model_name(self) -> str:
        return self._model


class EmbeddingService:
    """
    Service for generating and managing text embeddings.
    
    Provides a unified interface for embedding generation with
    caching and fallback support.
    """
    
    def __init__(
        self,
        provider: Optional[EmbeddingProvider] = None,
        cache_enabled: bool = True,
        max_cache_size: int = 10000,
    ):
        """
        Initialize the embedding service.
        
        Args:
            provider: Embedding provider to use. Defaults to ChromaDB default.
            cache_enabled: Whether to cache embeddings
            max_cache_size: Maximum number of cached embeddings
        """
        self._provider = provider or ChromaDefaultEmbedding()
        self._cache_enabled = cache_enabled
        self._cache: Dict[str, List[float]] = {}
        self._max_cache_size = max_cache_size
        
        logger.info(
            "Initialized embedding service",
            provider=self._provider.model_name,
            cache_enabled=cache_enabled
        )
    
    @property
    def provider(self) -> EmbeddingProvider:
        """Get the current embedding provider."""
        return self._provider
    
    @property
    def dimension(self) -> int:
        """Get the embedding dimension."""
        return self._provider.dimension
    
    def _get_cache_key(self, text: str) -> str:
        """Generate cache key for text."""
        return hashlib.md5(text.encode()).hexdigest()
    
    def _get_from_cache(self, text: str) -> Optional[List[float]]:
        """Get embedding from cache if available."""
        if not self._cache_enabled:
            return None
        
        key = self._get_cache_key(text)
        return self._cache.get(key)
    
    def _add_to_cache(self, text: str, embedding: List[float]) -> None:
        """Add embedding to cache."""
        if not self._cache_enabled:
            return
        
        # Simple LRU-like behavior: remove oldest if full
        if len(self._cache) >= self._max_cache_size:
            # Remove first item (oldest)
            first_key = next(iter(self._cache))
            del self._cache[first_key]
        
        key = self._get_cache_key(text)
        self._cache[key] = embedding
    
    def embed(self, text: str) -> List[float]:
        """
        Generate embedding for text.
        
        Args:
            text: Text to embed
        
        Returns:
            Embedding vector
        """
        # Check cache first
        cached = self._get_from_cache(text)
        if cached is not None:
            return cached
        
        # Generate embedding
        embedding = self._provider.embed_text(text)
        
        # Cache result
        self._add_to_cache(text, embedding)
        
        return embedding
    
    def embed_batch(self, texts: List[str]) -> List[List[float]]:
        """
        Generate embeddings for multiple texts.
        
        Args:
            texts: List of texts to embed
        
        Returns:
            List of embedding vectors
        """
        if not texts:
            return []
        
        # Check cache for each text
        results: List[Optional[List[float]]] = [None] * len(texts)
        uncached_indices: List[int] = []
        uncached_texts: List[str] = []
        
        for i, text in enumerate(texts):
            cached = self._get_from_cache(text)
            if cached is not None:
                results[i] = cached
            else:
                uncached_indices.append(i)
                uncached_texts.append(text)
        
        # Generate embeddings for uncached texts
        if uncached_texts:
            new_embeddings = self._provider.embed_texts(uncached_texts)
            
            for idx, embedding in zip(uncached_indices, new_embeddings):
                results[idx] = embedding
                self._add_to_cache(texts[idx], embedding)
        
        return results  # type: ignore
    
    def clear_cache(self) -> None:
        """Clear the embedding cache."""
        self._cache.clear()
        logger.info("Embedding cache cleared")
    
    def get_cache_stats(self) -> Dict[str, Any]:
        """Get cache statistics."""
        return {
            "enabled": self._cache_enabled,
            "size": len(self._cache),
            "max_size": self._max_cache_size,
        }


# Global embedding service instance
_embedding_service: Optional[EmbeddingService] = None


def get_embedding_service(
    provider: Optional[EmbeddingProvider] = None,
    force_new: bool = False,
) -> EmbeddingService:
    """
    Get or create the global embedding service.
    
    Args:
        provider: Optional custom provider
        force_new: Force creation of new instance
    
    Returns:
        EmbeddingService instance
    """
    global _embedding_service
    
    if _embedding_service is None or force_new:
        _embedding_service = EmbeddingService(provider=provider)
    
    return _embedding_service


def reset_embedding_service() -> None:
    """Reset the global embedding service."""
    global _embedding_service
    _embedding_service = None
    logger.info("Embedding service reset")
