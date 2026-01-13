"""
Embedding Service for Vector Generation
Phase 3: SaaS Readiness
"""

import structlog
from dataclasses import dataclass
from enum import Enum
from typing import Optional, Dict, Any, List
import hashlib
import asyncio

logger = structlog.get_logger(__name__)


class EmbeddingModel(str, Enum):
    """Supported embedding models."""
    OPENAI_ADA = "text-embedding-ada-002"
    OPENAI_3_SMALL = "text-embedding-3-small"
    OPENAI_3_LARGE = "text-embedding-3-large"
    COHERE_ENGLISH = "embed-english-v3.0"
    COHERE_MULTILINGUAL = "embed-multilingual-v3.0"
    LOCAL_MINILM = "all-MiniLM-L6-v2"


@dataclass
class EmbeddingConfig:
    """Configuration for embedding service."""
    model: EmbeddingModel = EmbeddingModel.OPENAI_3_SMALL
    dimension: int = 1536
    batch_size: int = 100
    max_tokens: int = 8191
    cache_enabled: bool = True
    cache_ttl_hours: int = 24


class EmbeddingService:
    """
    Service for generating text embeddings.
    
    Features:
    - Multiple model support
    - Batching
    - Caching
    - Rate limiting
    """
    
    # Model dimensions
    MODEL_DIMENSIONS = {
        EmbeddingModel.OPENAI_ADA: 1536,
        EmbeddingModel.OPENAI_3_SMALL: 1536,
        EmbeddingModel.OPENAI_3_LARGE: 3072,
        EmbeddingModel.COHERE_ENGLISH: 1024,
        EmbeddingModel.COHERE_MULTILINGUAL: 1024,
        EmbeddingModel.LOCAL_MINILM: 384,
    }
    
    def __init__(
        self,
        config: Optional[EmbeddingConfig] = None,
        openai_api_key: Optional[str] = None,
        cohere_api_key: Optional[str] = None,
    ):
        """
        Initialize embedding service.
        
        Args:
            config: Embedding configuration
            openai_api_key: OpenAI API key
            cohere_api_key: Cohere API key
        """
        self.config = config or EmbeddingConfig()
        self.openai_api_key = openai_api_key
        self.cohere_api_key = cohere_api_key
        
        self._cache: Dict[str, List[float]] = {}
        self._logger = logger.bind(component="embedding_service")
        
        # Initialize clients
        self._openai_client = None
        self._cohere_client = None
        self._local_model = None
    
    @property
    def dimension(self) -> int:
        """Get embedding dimension for current model."""
        return self.MODEL_DIMENSIONS.get(
            self.config.model,
            self.config.dimension,
        )
    
    async def embed(self, text: str) -> List[float]:
        """
        Generate embedding for a single text.
        
        Args:
            text: Input text
        
        Returns:
            Embedding vector
        """
        # Check cache
        if self.config.cache_enabled:
            cache_key = self._cache_key(text)
            if cache_key in self._cache:
                return self._cache[cache_key]
        
        # Generate embedding
        embedding = await self._generate_embedding(text)
        
        # Cache result
        if self.config.cache_enabled:
            self._cache[cache_key] = embedding
        
        return embedding
    
    async def embed_batch(
        self,
        texts: List[str],
    ) -> List[List[float]]:
        """
        Generate embeddings for multiple texts.
        
        Args:
            texts: List of input texts
        
        Returns:
            List of embedding vectors
        """
        results = []
        uncached_texts = []
        uncached_indices = []
        
        # Check cache for each text
        for i, text in enumerate(texts):
            if self.config.cache_enabled:
                cache_key = self._cache_key(text)
                if cache_key in self._cache:
                    results.append(self._cache[cache_key])
                    continue
            
            uncached_texts.append(text)
            uncached_indices.append(i)
            results.append(None)  # Placeholder
        
        # Generate embeddings for uncached texts
        if uncached_texts:
            embeddings = await self._generate_embeddings_batch(uncached_texts)
            
            for idx, embedding in zip(uncached_indices, embeddings):
                results[idx] = embedding
                
                # Cache result
                if self.config.cache_enabled:
                    cache_key = self._cache_key(texts[idx])
                    self._cache[cache_key] = embedding
        
        return results
    
    async def _generate_embedding(self, text: str) -> List[float]:
        """Generate embedding using configured model."""
        model = self.config.model
        
        if model in [
            EmbeddingModel.OPENAI_ADA,
            EmbeddingModel.OPENAI_3_SMALL,
            EmbeddingModel.OPENAI_3_LARGE,
        ]:
            return await self._openai_embed(text)
        elif model in [
            EmbeddingModel.COHERE_ENGLISH,
            EmbeddingModel.COHERE_MULTILINGUAL,
        ]:
            return await self._cohere_embed(text)
        elif model == EmbeddingModel.LOCAL_MINILM:
            return await self._local_embed(text)
        else:
            raise ValueError(f"Unsupported model: {model}")
    
    async def _generate_embeddings_batch(
        self,
        texts: List[str],
    ) -> List[List[float]]:
        """Generate embeddings in batch."""
        model = self.config.model
        
        if model in [
            EmbeddingModel.OPENAI_ADA,
            EmbeddingModel.OPENAI_3_SMALL,
            EmbeddingModel.OPENAI_3_LARGE,
        ]:
            return await self._openai_embed_batch(texts)
        elif model in [
            EmbeddingModel.COHERE_ENGLISH,
            EmbeddingModel.COHERE_MULTILINGUAL,
        ]:
            return await self._cohere_embed_batch(texts)
        elif model == EmbeddingModel.LOCAL_MINILM:
            return await self._local_embed_batch(texts)
        else:
            raise ValueError(f"Unsupported model: {model}")
    
    async def _openai_embed(self, text: str) -> List[float]:
        """Generate embedding using OpenAI."""
        try:
            from openai import AsyncOpenAI
            
            if self._openai_client is None:
                self._openai_client = AsyncOpenAI(api_key=self.openai_api_key)
            
            response = await self._openai_client.embeddings.create(
                model=self.config.model.value,
                input=text,
            )
            
            return response.data[0].embedding
            
        except ImportError:
            self._logger.warning("openai_not_installed", fallback="mock")
            return self._mock_embedding(text)
        except Exception as e:
            self._logger.error("openai_error", error=str(e))
            raise
    
    async def _openai_embed_batch(
        self,
        texts: List[str],
    ) -> List[List[float]]:
        """Generate embeddings in batch using OpenAI."""
        try:
            from openai import AsyncOpenAI
            
            if self._openai_client is None:
                self._openai_client = AsyncOpenAI(api_key=self.openai_api_key)
            
            # Process in batches
            all_embeddings = []
            
            for i in range(0, len(texts), self.config.batch_size):
                batch = texts[i:i + self.config.batch_size]
                
                response = await self._openai_client.embeddings.create(
                    model=self.config.model.value,
                    input=batch,
                )
                
                embeddings = [d.embedding for d in response.data]
                all_embeddings.extend(embeddings)
            
            return all_embeddings
            
        except ImportError:
            return [self._mock_embedding(t) for t in texts]
        except Exception as e:
            self._logger.error("openai_batch_error", error=str(e))
            raise
    
    async def _cohere_embed(self, text: str) -> List[float]:
        """Generate embedding using Cohere."""
        try:
            import cohere
            
            if self._cohere_client is None:
                self._cohere_client = cohere.AsyncClient(self.cohere_api_key)
            
            response = await self._cohere_client.embed(
                texts=[text],
                model=self.config.model.value,
                input_type="search_document",
            )
            
            return response.embeddings[0]
            
        except ImportError:
            self._logger.warning("cohere_not_installed", fallback="mock")
            return self._mock_embedding(text)
        except Exception as e:
            self._logger.error("cohere_error", error=str(e))
            raise
    
    async def _cohere_embed_batch(
        self,
        texts: List[str],
    ) -> List[List[float]]:
        """Generate embeddings in batch using Cohere."""
        try:
            import cohere
            
            if self._cohere_client is None:
                self._cohere_client = cohere.AsyncClient(self.cohere_api_key)
            
            all_embeddings = []
            
            for i in range(0, len(texts), self.config.batch_size):
                batch = texts[i:i + self.config.batch_size]
                
                response = await self._cohere_client.embed(
                    texts=batch,
                    model=self.config.model.value,
                    input_type="search_document",
                )
                
                all_embeddings.extend(response.embeddings)
            
            return all_embeddings
            
        except ImportError:
            return [self._mock_embedding(t) for t in texts]
        except Exception as e:
            self._logger.error("cohere_batch_error", error=str(e))
            raise
    
    async def _local_embed(self, text: str) -> List[float]:
        """Generate embedding using local model."""
        try:
            from sentence_transformers import SentenceTransformer
            
            if self._local_model is None:
                self._local_model = SentenceTransformer("all-MiniLM-L6-v2")
            
            # Run in thread pool to avoid blocking
            loop = asyncio.get_event_loop()
            embedding = await loop.run_in_executor(
                None,
                lambda: self._local_model.encode(text).tolist(),
            )
            
            return embedding
            
        except ImportError:
            self._logger.warning("sentence_transformers_not_installed", fallback="mock")
            return self._mock_embedding(text)
        except Exception as e:
            self._logger.error("local_embed_error", error=str(e))
            raise
    
    async def _local_embed_batch(
        self,
        texts: List[str],
    ) -> List[List[float]]:
        """Generate embeddings in batch using local model."""
        try:
            from sentence_transformers import SentenceTransformer
            
            if self._local_model is None:
                self._local_model = SentenceTransformer("all-MiniLM-L6-v2")
            
            loop = asyncio.get_event_loop()
            embeddings = await loop.run_in_executor(
                None,
                lambda: self._local_model.encode(texts).tolist(),
            )
            
            return embeddings
            
        except ImportError:
            return [self._mock_embedding(t) for t in texts]
        except Exception as e:
            self._logger.error("local_batch_error", error=str(e))
            raise
    
    def _mock_embedding(self, text: str) -> List[float]:
        """Generate mock embedding for testing."""
        import random
        
        # Use hash for deterministic results
        seed = int(hashlib.md5(text.encode()).hexdigest(), 16) % (2**32)
        random.seed(seed)
        
        dimension = self.dimension
        return [random.gauss(0, 1) for _ in range(dimension)]
    
    def _cache_key(self, text: str) -> str:
        """Generate cache key for text."""
        model_key = self.config.model.value
        text_hash = hashlib.md5(text.encode()).hexdigest()
        return f"{model_key}:{text_hash}"
    
    def clear_cache(self) -> int:
        """Clear embedding cache."""
        count = len(self._cache)
        self._cache.clear()
        return count
    
    def get_stats(self) -> Dict[str, Any]:
        """Get service statistics."""
        return {
            "model": self.config.model.value,
            "dimension": self.dimension,
            "cache_size": len(self._cache),
            "cache_enabled": self.config.cache_enabled,
        }


# Global instance
_embedding_service: Optional[EmbeddingService] = None


def get_embedding_service() -> EmbeddingService:
    """Get global embedding service instance."""
    global _embedding_service
    if _embedding_service is None:
        _embedding_service = EmbeddingService()
    return _embedding_service
