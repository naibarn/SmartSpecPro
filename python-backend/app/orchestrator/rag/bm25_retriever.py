"""
SmartSpec Pro - BM25 Retriever
Phase 2: Quality & Intelligence

BM25 (Best Matching 25) retriever for keyword-based search.
Uses the Okapi BM25 algorithm for term frequency-based ranking.
"""

import math
import re
from collections import Counter
from dataclasses import dataclass
from typing import Any, Dict, List, Optional, Set

import structlog

logger = structlog.get_logger()


@dataclass
class TokenizedDocument:
    """Document with tokenized content."""
    doc_id: str
    tokens: List[str]
    token_counts: Counter
    length: int
    original_doc: Any  # Reference to original Document


class BM25Retriever:
    """
    BM25 Retriever for keyword-based search.
    
    BM25 Formula:
    score(D, Q) = Σ IDF(qi) * (f(qi, D) * (k1 + 1)) / (f(qi, D) + k1 * (1 - b + b * |D|/avgdl))
    
    Where:
    - f(qi, D) = frequency of term qi in document D
    - |D| = length of document D
    - avgdl = average document length
    - k1, b = tuning parameters
    """
    
    # Default stopwords
    STOPWORDS = {
        "a", "an", "the", "and", "or", "but", "in", "on", "at", "to", "for",
        "of", "with", "by", "from", "as", "is", "was", "are", "were", "been",
        "be", "have", "has", "had", "do", "does", "did", "will", "would",
        "could", "should", "may", "might", "must", "shall", "can", "need",
        "it", "its", "this", "that", "these", "those", "i", "you", "he",
        "she", "we", "they", "what", "which", "who", "whom", "when", "where",
        "why", "how", "all", "each", "every", "both", "few", "more", "most",
        "other", "some", "such", "no", "nor", "not", "only", "own", "same",
        "so", "than", "too", "very", "just", "also", "now", "here", "there",
    }
    
    def __init__(
        self,
        k1: float = 1.5,
        b: float = 0.75,
        use_stopwords: bool = True,
        min_token_length: int = 2,
    ):
        """
        Initialize BM25 Retriever.
        
        Args:
            k1: Term frequency saturation parameter (1.2-2.0)
            b: Document length normalization (0.0-1.0)
            use_stopwords: Whether to filter stopwords
            min_token_length: Minimum token length to include
        """
        self.k1 = k1
        self.b = b
        self.use_stopwords = use_stopwords
        self.min_token_length = min_token_length
        
        # Document storage
        self._documents: Dict[str, TokenizedDocument] = {}
        
        # Inverted index: term -> set of doc_ids
        self._inverted_index: Dict[str, Set[str]] = {}
        
        # Document frequency: term -> number of documents containing term
        self._doc_freq: Counter = Counter()
        
        # Corpus statistics
        self._total_docs: int = 0
        self._avg_doc_length: float = 0.0
        self._total_length: int = 0
        
        logger.info("bm25_retriever_initialized", k1=k1, b=b)
    
    def _tokenize(self, text: str) -> List[str]:
        """
        Tokenize text into terms.
        
        Args:
            text: Input text
            
        Returns:
            List of tokens
        """
        # Lowercase and split on non-alphanumeric
        tokens = re.findall(r"\b\w+\b", text.lower())
        
        # Filter
        filtered = []
        for token in tokens:
            # Skip short tokens
            if len(token) < self.min_token_length:
                continue
            
            # Skip stopwords
            if self.use_stopwords and token in self.STOPWORDS:
                continue
            
            # Skip pure numbers
            if token.isdigit():
                continue
            
            filtered.append(token)
        
        return filtered
    
    async def add_document(self, doc: Any) -> None:
        """
        Add a document to the index.
        
        Args:
            doc: Document object with doc_id and content attributes
        """
        doc_id = doc.doc_id
        content = doc.content
        
        # Tokenize
        tokens = self._tokenize(content)
        token_counts = Counter(tokens)
        
        # Create tokenized document
        tokenized_doc = TokenizedDocument(
            doc_id=doc_id,
            tokens=tokens,
            token_counts=token_counts,
            length=len(tokens),
            original_doc=doc,
        )
        
        # Remove old version if exists
        if doc_id in self._documents:
            await self._remove_document(doc_id)
        
        # Store document
        self._documents[doc_id] = tokenized_doc
        
        # Update inverted index
        for token in set(tokens):
            if token not in self._inverted_index:
                self._inverted_index[token] = set()
            self._inverted_index[token].add(doc_id)
            self._doc_freq[token] += 1
        
        # Update corpus statistics
        self._total_docs += 1
        self._total_length += len(tokens)
        self._avg_doc_length = self._total_length / self._total_docs
    
    async def _remove_document(self, doc_id: str) -> None:
        """Remove a document from the index."""
        if doc_id not in self._documents:
            return
        
        doc = self._documents[doc_id]
        
        # Update inverted index
        for token in set(doc.tokens):
            if token in self._inverted_index:
                self._inverted_index[token].discard(doc_id)
                self._doc_freq[token] -= 1
                
                if self._doc_freq[token] <= 0:
                    del self._doc_freq[token]
                    del self._inverted_index[token]
        
        # Update statistics
        self._total_docs -= 1
        self._total_length -= doc.length
        if self._total_docs > 0:
            self._avg_doc_length = self._total_length / self._total_docs
        else:
            self._avg_doc_length = 0.0
        
        # Remove document
        del self._documents[doc_id]
    
    def _idf(self, term: str) -> float:
        """
        Calculate Inverse Document Frequency.
        
        IDF(qi) = log((N - n(qi) + 0.5) / (n(qi) + 0.5) + 1)
        
        Args:
            term: Query term
            
        Returns:
            IDF score
        """
        n = self._doc_freq.get(term, 0)
        N = self._total_docs
        
        if N == 0:
            return 0.0
        
        return math.log((N - n + 0.5) / (n + 0.5) + 1)
    
    def _score_document(
        self,
        doc: TokenizedDocument,
        query_tokens: List[str],
    ) -> float:
        """
        Calculate BM25 score for a document.
        
        Args:
            doc: Tokenized document
            query_tokens: Query tokens
            
        Returns:
            BM25 score
        """
        score = 0.0
        
        for term in query_tokens:
            if term not in doc.token_counts:
                continue
            
            # Term frequency in document
            tf = doc.token_counts[term]
            
            # IDF
            idf = self._idf(term)
            
            # BM25 term score
            numerator = tf * (self.k1 + 1)
            denominator = tf + self.k1 * (
                1 - self.b + self.b * (doc.length / self._avg_doc_length)
            )
            
            score += idf * (numerator / denominator)
        
        return score
    
    async def retrieve(
        self,
        query: str,
        top_k: int = 10,
        filters: Optional[Dict[str, Any]] = None,
    ) -> List[Any]:
        """
        Retrieve documents matching the query.
        
        Args:
            query: Search query
            top_k: Number of results to return
            filters: Metadata filters (not implemented yet)
            
        Returns:
            List of Document objects sorted by BM25 score
        """
        if not self._documents:
            return []
        
        # Tokenize query
        query_tokens = self._tokenize(query)
        
        if not query_tokens:
            return []
        
        # Find candidate documents (documents containing at least one query term)
        candidate_ids: Set[str] = set()
        for token in query_tokens:
            if token in self._inverted_index:
                candidate_ids.update(self._inverted_index[token])
        
        if not candidate_ids:
            return []
        
        # Score candidates
        scored_docs = []
        for doc_id in candidate_ids:
            doc = self._documents[doc_id]
            score = self._score_document(doc, query_tokens)
            
            if score > 0:
                # Update score on original document
                doc.original_doc.bm25_score = score
                scored_docs.append((score, doc.original_doc))
        
        # Sort by score
        scored_docs.sort(key=lambda x: x[0], reverse=True)
        
        # Return top_k
        return [doc for score, doc in scored_docs[:top_k]]
    
    async def cleanup(self):
        """Cleanup resources."""
        self._documents.clear()
        self._inverted_index.clear()
        self._doc_freq.clear()
        self._total_docs = 0
        self._avg_doc_length = 0.0
        self._total_length = 0
        
        logger.info("bm25_retriever_cleanup_complete")
