"""
SmartSpec Pro - Reranker
Phase 2: Quality & Intelligence

Cross-encoder reranker for final ranking of retrieved documents.
Uses LLM or cross-encoder models to score query-document pairs.
"""

import asyncio
from dataclasses import dataclass
from typing import Any, Dict, List, Optional

import structlog

logger = structlog.get_logger()


class Reranker:
    """
    Reranker for final document ranking.
    
    Supports multiple reranking strategies:
    - LLM-based reranking (using GPT/Claude)
    - Cross-encoder models (sentence-transformers)
    - Simple heuristic reranking
    """
    
    def __init__(
        self,
        model: str = "gpt-4.1-nano",
        use_llm: bool = True,
        batch_size: int = 5,
    ):
        """
        Initialize Reranker.
        
        Args:
            model: Model to use for reranking
            use_llm: Whether to use LLM for reranking
            batch_size: Number of documents to rerank in parallel
        """
        self.model = model
        self.use_llm = use_llm
        self.batch_size = batch_size
        
        # LLM client (lazy loaded)
        self._llm_client = None
        
        logger.info(
            "reranker_initialized",
            model=model,
            use_llm=use_llm,
        )
    
    async def rerank(
        self,
        query: str,
        documents: List[Any],
        top_k: int = 5,
    ) -> List[Any]:
        """
        Rerank documents based on relevance to query.
        
        Args:
            query: Search query
            documents: List of documents to rerank
            top_k: Number of results to return
            
        Returns:
            Reranked list of documents
        """
        if not documents:
            return []
        
        if len(documents) <= top_k:
            # No need to rerank if we have fewer documents than top_k
            return documents
        
        if self.use_llm:
            try:
                return await self._llm_rerank(query, documents, top_k)
            except Exception as e:
                logger.warning(
                    "llm_rerank_failed",
                    error=str(e),
                )
                # Fallback to heuristic
                return self._heuristic_rerank(query, documents, top_k)
        else:
            return self._heuristic_rerank(query, documents, top_k)
    
    async def _llm_rerank(
        self,
        query: str,
        documents: List[Any],
        top_k: int,
    ) -> List[Any]:
        """
        Rerank using LLM.
        
        Uses the LLM to score each document's relevance to the query.
        """
        try:
            from openai import AsyncOpenAI
            
            if self._llm_client is None:
                self._llm_client = AsyncOpenAI()
            
            # Score each document
            scored_docs = []
            
            for doc in documents:
                score = await self._score_document(query, doc)
                doc.rerank_score = score
                scored_docs.append((score, doc))
            
            # Sort by score
            scored_docs.sort(key=lambda x: x[0], reverse=True)
            
            return [doc for score, doc in scored_docs[:top_k]]
            
        except ImportError:
            raise Exception("OpenAI package not installed")
    
    async def _score_document(
        self,
        query: str,
        doc: Any,
    ) -> float:
        """
        Score a single document using LLM.
        
        Args:
            query: Search query
            doc: Document to score
            
        Returns:
            Relevance score (0 to 1)
        """
        prompt = f"""Rate the relevance of the following document to the query on a scale of 0 to 10.
Only respond with a single number.

Query: {query}

Document:
{doc.content[:1000]}

Relevance score (0-10):"""
        
        try:
            response = await self._llm_client.chat.completions.create(
                model=self.model,
                messages=[{"role": "user", "content": prompt}],
                max_tokens=5,
                temperature=0,
            )
            
            score_text = response.choices[0].message.content.strip()
            score = float(score_text) / 10.0  # Normalize to 0-1
            
            return min(max(score, 0.0), 1.0)  # Clamp to 0-1
            
        except Exception as e:
            logger.warning(
                "document_scoring_failed",
                error=str(e),
            )
            # Return existing score as fallback
            return doc.final_score or 0.5
    
    def _heuristic_rerank(
        self,
        query: str,
        documents: List[Any],
        top_k: int,
    ) -> List[Any]:
        """
        Rerank using heuristics.
        
        Combines multiple signals:
        - Existing scores (BM25, vector)
        - Query term overlap
        - Document length preference
        """
        query_terms = set(query.lower().split())
        
        scored_docs = []
        
        for doc in documents:
            # Base score from existing scores
            base_score = (
                doc.bm25_score * 0.3 +
                doc.vector_score * 0.5 +
                doc.final_score * 0.2
            )
            
            # Term overlap bonus
            doc_terms = set(doc.content.lower().split())
            overlap = len(query_terms & doc_terms)
            overlap_bonus = overlap / max(len(query_terms), 1) * 0.2
            
            # Length preference (prefer medium-length documents)
            doc_length = len(doc.content)
            if 100 <= doc_length <= 2000:
                length_bonus = 0.1
            elif doc_length < 100:
                length_bonus = -0.1  # Too short
            else:
                length_bonus = 0.0  # Long is okay
            
            # Final score
            final_score = base_score + overlap_bonus + length_bonus
            doc.rerank_score = final_score
            
            scored_docs.append((final_score, doc))
        
        # Sort by score
        scored_docs.sort(key=lambda x: x[0], reverse=True)
        
        return [doc for score, doc in scored_docs[:top_k]]
    
    async def cleanup(self):
        """Cleanup resources."""
        self._llm_client = None
        logger.info("reranker_cleanup_complete")
