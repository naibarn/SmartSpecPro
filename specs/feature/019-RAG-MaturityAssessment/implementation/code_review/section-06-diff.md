diff --git a/python-backend/app/orchestrator/rag/__init__.py b/python-backend/app/orchestrator/rag/__init__.py
index 0a560c4..8b10dd3 100644
--- a/python-backend/app/orchestrator/rag/__init__.py
+++ b/python-backend/app/orchestrator/rag/__init__.py
@@ -31,6 +31,12 @@ from app.orchestrator.rag.query_processor import (
     QueryStrategy,
     ProcessedQuery,
 )
+from app.orchestrator.rag.guardrails import (
+    RetrievalGuardrails,
+    RetrievalQuality,
+    QualityAssessment,
+)
+from app.orchestrator.rag.query_router import QueryRouter, QueryIntent
 
 __all__ = [
     "HybridRAGEngine",
@@ -49,4 +55,9 @@ __all__ = [
     "QueryProcessor",
     "QueryStrategy",
     "ProcessedQuery",
+    "RetrievalGuardrails",
+    "RetrievalQuality",
+    "QualityAssessment",
+    "QueryRouter",
+    "QueryIntent",
 ]
diff --git a/python-backend/app/orchestrator/rag/guardrails.py b/python-backend/app/orchestrator/rag/guardrails.py
new file mode 100644
index 0000000..443f2d3
--- /dev/null
+++ b/python-backend/app/orchestrator/rag/guardrails.py
@@ -0,0 +1,213 @@
+"""
+Retrieval quality guardrails for multi-tenant RAG.
+
+Assesses retrieval quality and determines the appropriate response strategy
+based on document scores and tenant-configurable failure modes.
+
+Quality levels:
+  HIGH    - top_score >= 0.7, confident answer
+  MEDIUM  - top_score 0.4-0.7, partial confidence
+  LOW     - top_score 0.15-0.4, very limited info
+  FAILED  - no docs or all below 0.15
+
+Failure modes:
+  strict     - refuse answer on LOW/FAILED (enterprise default)
+  permissive - warn user on LOW, refuse only on FAILED (general default)
+"""
+
+from __future__ import annotations
+
+from dataclasses import dataclass
+from enum import Enum
+from typing import TYPE_CHECKING
+
+import structlog
+
+if TYPE_CHECKING:
+    from app.orchestrator.rag.hybrid_rag import RAGResult
+
+logger = structlog.get_logger()
+
+
+class RetrievalQuality(str, Enum):
+    """Quality level of retrieved documents."""
+    HIGH = "high"
+    MEDIUM = "medium"
+    LOW = "low"
+    FAILED = "failed"
+
+
+@dataclass
+class QualityAssessment:
+    """Result of quality assessment on a RAGResult."""
+    quality: RetrievalQuality
+    confidence_score: float
+    top_score: float
+    avg_score: float
+    doc_count: int
+    recommended_action: str  # "proceed", "warn_user", "refuse_answer"
+    explanation: str
+
+
+class RetrievalGuardrails:
+    """Assess retrieval quality and determine response strategy.
+
+    Args:
+        failure_mode: "strict" (enterprise) or "permissive" (general).
+        high_threshold: Minimum score for HIGH quality.
+        medium_threshold: Minimum score for MEDIUM quality.
+        low_threshold: Minimum score for LOW quality (below is FAILED).
+    """
+
+    def __init__(
+        self,
+        failure_mode: str = "strict",
+        high_threshold: float = 0.7,
+        medium_threshold: float = 0.4,
+        low_threshold: float = 0.15,
+    ) -> None:
+        self.failure_mode = failure_mode
+        self.high_threshold = high_threshold
+        self.medium_threshold = medium_threshold
+        self.low_threshold = low_threshold
+
+    def assess(self, rag_result: "RAGResult") -> QualityAssessment:
+        """Assess retrieval quality from a RAGResult.
+
+        Returns a QualityAssessment with quality level, confidence, and
+        recommended action based on the configured failure mode.
+        """
+        docs = rag_result.documents
+
+        if not docs:
+            return QualityAssessment(
+                quality=RetrievalQuality.FAILED,
+                confidence_score=0.0,
+                top_score=0.0,
+                avg_score=0.0,
+                doc_count=0,
+                recommended_action="refuse_answer",
+                explanation="No relevant information was found in the knowledge base.",
+            )
+
+        scores = [d.final_score for d in docs]
+        top_score = max(scores)
+        avg_score = sum(scores) / len(scores)
+
+        # Determine quality level
+        if top_score >= self.high_threshold:
+            quality = RetrievalQuality.HIGH
+        elif top_score >= self.medium_threshold:
+            quality = RetrievalQuality.MEDIUM
+        elif top_score >= self.low_threshold:
+            quality = RetrievalQuality.LOW
+        else:
+            quality = RetrievalQuality.FAILED
+
+        # Determine recommended action
+        action = self._determine_action(quality)
+
+        # Build explanation — prevent metadata leakage for FAILED / strict LOW
+        explanation = self._build_explanation(quality, len(docs), top_score)
+
+        confidence = min(top_score, 1.0)
+
+        logger.debug(
+            "guardrails_assessed",
+            quality=quality.value,
+            top_score=top_score,
+            avg_score=avg_score,
+            doc_count=len(docs),
+            action=action,
+        )
+
+        return QualityAssessment(
+            quality=quality,
+            confidence_score=confidence,
+            top_score=top_score,
+            avg_score=avg_score,
+            doc_count=len(docs),
+            recommended_action=action,
+            explanation=explanation,
+        )
+
+    def _determine_action(self, quality: RetrievalQuality) -> str:
+        if quality == RetrievalQuality.HIGH:
+            return "proceed"
+        if quality == RetrievalQuality.MEDIUM:
+            return "proceed"
+        if quality == RetrievalQuality.LOW:
+            if self.failure_mode == "permissive":
+                return "warn_user"
+            return "refuse_answer"
+        # FAILED
+        return "refuse_answer"
+
+    def _build_explanation(
+        self, quality: RetrievalQuality, doc_count: int, top_score: float,
+    ) -> str:
+        """Build a human-readable explanation without leaking metadata."""
+        if quality == RetrievalQuality.FAILED:
+            return "No relevant information was found in the knowledge base."
+
+        if quality == RetrievalQuality.LOW and self.failure_mode == "strict":
+            return "Very limited relevant information was found."
+
+        if quality == RetrievalQuality.LOW:
+            return (
+                f"Found {doc_count} result(s) with low relevance "
+                f"(best score: {top_score:.2f})."
+            )
+
+        if quality == RetrievalQuality.MEDIUM:
+            return (
+                f"Found {doc_count} result(s) with moderate relevance "
+                f"(best score: {top_score:.2f})."
+            )
+
+        return (
+            f"Found {doc_count} highly relevant result(s) "
+            f"(best score: {top_score:.2f})."
+        )
+
+    def build_system_prompt_suffix(self, assessment: QualityAssessment) -> str:
+        """Return a system prompt suffix to guide LLM behavior based on quality."""
+        q = assessment.quality
+
+        if q == RetrievalQuality.HIGH:
+            return (
+                "Answer based ONLY on the provided context. "
+                "Cite sources using the [Source N] markers."
+            )
+
+        if q == RetrievalQuality.MEDIUM:
+            if self.failure_mode == "permissive":
+                return (
+                    "Context may be incomplete. Clearly state uncertainty "
+                    "where information is missing or unclear."
+                )
+            return (
+                "Context may be incomplete. Clearly state uncertainty "
+                "where information is missing or unclear."
+            )
+
+        if q == RetrievalQuality.LOW:
+            if self.failure_mode == "permissive":
+                return (
+                    "Very limited information found. Prefix uncertain parts "
+                    "with 'Based on limited information:' and clearly indicate "
+                    "what is not covered."
+                )
+            # strict + LOW -> refuse
+            return (
+                "No relevant information was found in the knowledge base. "
+                "Do NOT answer from training data. Inform the user that "
+                "the requested information is not available."
+            )
+
+        # FAILED (both modes)
+        return (
+            "No relevant information was found in the knowledge base. "
+            "Do NOT answer from training data. Inform the user that "
+            "the requested information is not available."
+        )
diff --git a/python-backend/app/orchestrator/rag/hybrid_rag.py b/python-backend/app/orchestrator/rag/hybrid_rag.py
index 5dac499..95ed9e7 100644
--- a/python-backend/app/orchestrator/rag/hybrid_rag.py
+++ b/python-backend/app/orchestrator/rag/hybrid_rag.py
@@ -56,7 +56,21 @@ class Document:
     # Source information
     source_type: str = ""  # memory, file, code, doc
     source_id: Optional[str] = None
-    
+
+    # Citation fields
+    chunk_id: Optional[str] = None
+    parent_doc_id: Optional[str] = None
+    parent_doc_title: Optional[str] = None
+    section_heading: Optional[str] = None
+
+    def citation_ref(self) -> str:
+        """Generate a citation reference string for this document."""
+        if self.parent_doc_title and self.section_heading:
+            return f"[{self.parent_doc_title} - section {self.section_heading}]"
+        if self.parent_doc_title:
+            return f"[{self.parent_doc_title}]"
+        return "[Unknown Source]"
+
     def to_dict(self) -> Dict[str, Any]:
         return {
             "doc_id": self.doc_id,
@@ -70,6 +84,10 @@ class Document:
             },
             "source_type": self.source_type,
             "source_id": self.source_id,
+            "chunk_id": self.chunk_id,
+            "parent_doc_id": self.parent_doc_id,
+            "parent_doc_title": self.parent_doc_title,
+            "section_heading": self.section_heading,
         }
 
 
@@ -91,7 +109,10 @@ class RAGResult:
     
     # Mode used
     mode: SearchMode = SearchMode.HYBRID
-    
+
+    # Citation metadata
+    citations: List[Dict[str, Any]] = field(default_factory=list)
+
     def to_dict(self) -> Dict[str, Any]:
         return {
             "query": self.query,
@@ -107,25 +128,71 @@ class RAGResult:
                 "final_count": self.final_count,
             },
             "mode": self.mode.value,
+            "citations": self.citations,
         }
-    
+
     def get_context(self, max_tokens: int = 4000) -> str:
         """Get combined context from documents."""
         context_parts = []
         current_tokens = 0
-        
+
         for doc in self.documents:
             # Estimate tokens (rough: 4 chars per token)
             doc_tokens = len(doc.content) // 4
-            
+
             if current_tokens + doc_tokens > max_tokens:
                 break
-            
+
             context_parts.append(doc.content)
             current_tokens += doc_tokens
-        
+
         return "\n\n---\n\n".join(context_parts)
 
+    def get_context_with_citations(
+        self, max_tokens: int = 4000,
+    ) -> Tuple[str, List[Dict[str, Any]]]:
+        """Get combined context with inline [Source N: ...] markers.
+
+        Returns:
+            Tuple of (context_string, citations_list).
+        """
+        if not self.documents:
+            return "", []
+
+        context_parts: List[str] = []
+        citations: List[Dict[str, Any]] = []
+        seen_keys: Dict[Tuple[Optional[str], Optional[str]], int] = {}
+        current_tokens = 0
+
+        for doc in self.documents:
+            doc_tokens = len(doc.content) // 4
+            # Account for the header line too (~20 chars overhead)
+            header_tokens = 20
+
+            if current_tokens + doc_tokens + header_tokens > max_tokens:
+                break
+
+            # Deduplicate by (parent_doc_id, section_heading)
+            cite_key = (doc.parent_doc_id, doc.section_heading)
+            if cite_key not in seen_keys:
+                idx = len(citations) + 1
+                seen_keys[cite_key] = idx
+                citations.append({
+                    "index": idx,
+                    "title": doc.parent_doc_title or "Unknown Source",
+                    "section": doc.section_heading,
+                    "doc_id": doc.parent_doc_id,
+                    "chunk_id": doc.chunk_id,
+                })
+
+            source_idx = seen_keys[cite_key]
+            ref = doc.citation_ref()
+            header = f"[Source {source_idx}: {ref[1:-1]}]"  # strip outer brackets from ref
+            context_parts.append(f"{header}\n{doc.content}")
+            current_tokens += doc_tokens + header_tokens
+
+        return "\n\n---\n\n".join(context_parts), citations
+
 
 @dataclass
 class RAGConfig:
diff --git a/python-backend/app/orchestrator/rag/query_router.py b/python-backend/app/orchestrator/rag/query_router.py
new file mode 100644
index 0000000..dd0d2cd
--- /dev/null
+++ b/python-backend/app/orchestrator/rag/query_router.py
@@ -0,0 +1,110 @@
+"""
+Query intent router for RAG pipeline.
+
+Classifies queries to decide whether RAG retrieval is needed:
+  KNOWLEDGE      - needs RAG retrieval
+  CONVERSATIONAL - greetings, meta-questions; skip RAG
+  CREATIVE       - writing/generation tasks; skip RAG
+
+Uses fast heuristics first (regex). Falls back to KNOWLEDGE
+as the safe default (extra RAG is cheaper than missing context).
+"""
+
+from __future__ import annotations
+
+import re
+from dataclasses import dataclass
+from enum import Enum
+
+import structlog
+
+logger = structlog.get_logger()
+
+
+class QueryIntent(str, Enum):
+    """Intent classification for a user query."""
+    KNOWLEDGE = "knowledge"
+    CONVERSATIONAL = "conversational"
+    CREATIVE = "creative"
+
+
+@dataclass
+class QueryRouteDecision:
+    """Result of query intent classification."""
+    intent: QueryIntent
+    confidence: float
+    skip_rag: bool
+    reason: str
+
+
+# Compiled regex patterns for heuristic matching
+_CONVERSATIONAL_PATTERNS = re.compile(
+    r"^(hello|hi|hey|good morning|good afternoon|good evening|"
+    r"thanks|thank you|thx|cheers|"
+    r"who are you|what can you do|how do you work)\b",
+    re.IGNORECASE,
+)
+
+_CREATIVE_PATTERNS = re.compile(
+    r"^(write|compose|create|draft|generate)\s+(me\s+)?(a\s+)?"
+    r"(poem|story|essay|song|letter|email|joke|riddle)",
+    re.IGNORECASE,
+)
+
+_CREATIVE_ALT_PATTERNS = re.compile(
+    r"^(write|tell)\s+(me\s+)?a\s+(joke|riddle)",
+    re.IGNORECASE,
+)
+
+
+class QueryRouter:
+    """Lightweight router that classifies query intent to avoid unnecessary RAG retrieval."""
+
+    async def route(self, query: str) -> QueryRouteDecision:
+        """Classify the query intent.
+
+        Uses fast heuristics first (regex patterns for greetings, thanks,
+        creative prompts). Falls back to KNOWLEDGE for anything ambiguous.
+        """
+        stripped = query.strip()
+
+        # Check conversational patterns
+        if _CONVERSATIONAL_PATTERNS.search(stripped):
+            return QueryRouteDecision(
+                intent=QueryIntent.CONVERSATIONAL,
+                confidence=0.95,
+                skip_rag=True,
+                reason="Matched conversational pattern.",
+            )
+
+        # Check creative patterns
+        if _CREATIVE_PATTERNS.search(stripped) or _CREATIVE_ALT_PATTERNS.search(stripped):
+            return QueryRouteDecision(
+                intent=QueryIntent.CREATIVE,
+                confidence=0.90,
+                skip_rag=True,
+                reason="Matched creative/generation pattern.",
+            )
+
+        # Default: KNOWLEDGE (safe fallback)
+        try:
+            decision = await self._classify_with_llm(stripped)
+            if decision is not None:
+                return decision
+        except Exception:
+            logger.debug("query_router_llm_fallback_failed", query=stripped[:50])
+
+        return QueryRouteDecision(
+            intent=QueryIntent.KNOWLEDGE,
+            confidence=0.5,
+            skip_rag=False,
+            reason="No heuristic match; defaulting to knowledge query.",
+        )
+
+    async def _classify_with_llm(self, query: str) -> QueryRouteDecision | None:
+        """Attempt LLM-based classification for ambiguous queries.
+
+        Returns None if classification is inconclusive or unavailable.
+        Currently returns None (LLM integration deferred to Section 07).
+        """
+        return None
diff --git a/python-backend/tests/orchestrator/rag/test_citations.py b/python-backend/tests/orchestrator/rag/test_citations.py
new file mode 100644
index 0000000..50783c2
--- /dev/null
+++ b/python-backend/tests/orchestrator/rag/test_citations.py
@@ -0,0 +1,168 @@
+"""Tests for citation tracking on Document and RAGResult."""
+
+import pytest
+from app.orchestrator.rag.hybrid_rag import Document, RAGResult, SearchMode
+
+
+class TestDocumentCitationFields:
+    """Tests for new citation-related fields on Document."""
+
+    def test_chunk_id_default_none(self):
+        doc = Document()
+        assert doc.chunk_id is None
+
+    def test_parent_doc_id_default_none(self):
+        doc = Document()
+        assert doc.parent_doc_id is None
+
+    def test_parent_doc_title_default_none(self):
+        doc = Document()
+        assert doc.parent_doc_title is None
+
+    def test_section_heading_default_none(self):
+        doc = Document()
+        assert doc.section_heading is None
+
+    def test_to_dict_includes_citation_fields(self):
+        doc = Document(
+            chunk_id="chunk-1",
+            parent_doc_id="pdoc-1",
+            parent_doc_title="My Document",
+            section_heading="Section A",
+        )
+        d = doc.to_dict()
+        assert d["chunk_id"] == "chunk-1"
+        assert d["parent_doc_id"] == "pdoc-1"
+        assert d["parent_doc_title"] == "My Document"
+        assert d["section_heading"] == "Section A"
+
+
+class TestDocumentCitationRef:
+    """Tests for Document.citation_ref() method."""
+
+    def test_title_and_section(self):
+        doc = Document(parent_doc_title="My Report", section_heading="Introduction")
+        ref = doc.citation_ref()
+        assert "My Report" in ref
+        assert "Introduction" in ref
+
+    def test_title_only(self):
+        doc = Document(parent_doc_title="My Report")
+        ref = doc.citation_ref()
+        assert "My Report" in ref
+        assert "section" not in ref.lower() or "Introduction" not in ref
+
+    def test_no_title_fallback(self):
+        doc = Document()
+        ref = doc.citation_ref()
+        assert "Unknown" in ref or "unknown" in ref
+
+    def test_returns_string(self):
+        doc = Document(parent_doc_title="Title")
+        assert isinstance(doc.citation_ref(), str)
+
+
+class TestRAGResultGetContextWithCitations:
+    """Tests for RAGResult.get_context_with_citations() method."""
+
+    def _make_result_with_citations(self) -> RAGResult:
+        docs = [
+            Document(
+                doc_id="d1",
+                content="Auth flow uses JWT tokens.",
+                final_score=0.9,
+                parent_doc_id="pdoc-1",
+                parent_doc_title="Project Requirements",
+                section_heading="Authentication Flow",
+                chunk_id="c1",
+            ),
+            Document(
+                doc_id="d2",
+                content="Rate limit is 100 req/min.",
+                final_score=0.8,
+                parent_doc_id="pdoc-2",
+                parent_doc_title="API Documentation",
+                section_heading="Rate Limiting",
+                chunk_id="c2",
+            ),
+        ]
+        return RAGResult(query="test", documents=docs, final_count=2)
+
+    def test_context_has_source_markers(self):
+        result = self._make_result_with_citations()
+        context, citations = result.get_context_with_citations()
+        assert "[Source 1:" in context
+        assert "[Source 2:" in context
+
+    def test_citations_list_per_unique_source(self):
+        result = self._make_result_with_citations()
+        _, citations = result.get_context_with_citations()
+        assert len(citations) == 2
+
+    def test_citations_ordered_by_first_appearance(self):
+        result = self._make_result_with_citations()
+        _, citations = result.get_context_with_citations()
+        assert citations[0]["index"] == 1
+        assert citations[1]["index"] == 2
+
+    def test_same_parent_different_sections_distinct_citations(self):
+        docs = [
+            Document(
+                doc_id="d1",
+                content="Part one.",
+                final_score=0.9,
+                parent_doc_id="pdoc-1",
+                parent_doc_title="Big Doc",
+                section_heading="Section A",
+                chunk_id="c1",
+            ),
+            Document(
+                doc_id="d2",
+                content="Part two.",
+                final_score=0.8,
+                parent_doc_id="pdoc-1",
+                parent_doc_title="Big Doc",
+                section_heading="Section B",
+                chunk_id="c2",
+            ),
+        ]
+        result = RAGResult(query="test", documents=docs, final_count=2)
+        _, citations = result.get_context_with_citations()
+        assert len(citations) == 2
+
+    def test_max_tokens_respected(self):
+        docs = [
+            Document(
+                doc_id=f"d{i}",
+                content="x" * 2000,
+                final_score=0.9 - i * 0.1,
+                parent_doc_title=f"Doc {i}",
+                chunk_id=f"c{i}",
+            )
+            for i in range(10)
+        ]
+        result = RAGResult(query="test", documents=docs, final_count=10)
+        context, citations = result.get_context_with_citations(max_tokens=500)
+        # At ~4 chars per token, 500 tokens = ~2000 chars.
+        # Each doc is 2000 chars + header. Should include at most 1 doc.
+        assert len(citations) <= 2
+
+    def test_empty_documents_returns_empty(self):
+        result = RAGResult(query="test", documents=[], final_count=0)
+        context, citations = result.get_context_with_citations()
+        assert context == ""
+        assert citations == []
+
+
+class TestRAGResultCitationsField:
+    """Tests for the citations field on RAGResult."""
+
+    def test_citations_default_empty_list(self):
+        result = RAGResult()
+        assert result.citations == []
+
+    def test_to_dict_includes_citations(self):
+        result = RAGResult(citations=[{"index": 1, "title": "Test"}])
+        d = result.to_dict()
+        assert "citations" in d
+        assert len(d["citations"]) == 1
diff --git a/python-backend/tests/orchestrator/rag/test_guardrails.py b/python-backend/tests/orchestrator/rag/test_guardrails.py
new file mode 100644
index 0000000..2e0ff5a
--- /dev/null
+++ b/python-backend/tests/orchestrator/rag/test_guardrails.py
@@ -0,0 +1,263 @@
+"""Tests for RetrievalGuardrails — quality assessment and tenant failure modes."""
+
+import pytest
+from app.orchestrator.rag.guardrails import (
+    RetrievalGuardrails,
+    RetrievalQuality,
+    QualityAssessment,
+)
+from app.orchestrator.rag.hybrid_rag import Document, RAGResult, SearchMode
+
+
+def _make_docs(scores: list[float]) -> list[Document]:
+    """Helper: create Document list with given final_scores."""
+    return [
+        Document(doc_id=f"doc-{i}", content=f"Content {i}", final_score=s)
+        for i, s in enumerate(scores)
+    ]
+
+
+def _make_rag_result(scores: list[float]) -> RAGResult:
+    """Helper: create a RAGResult with documents at given scores."""
+    return RAGResult(
+        query="test query",
+        documents=_make_docs(scores),
+        final_count=len(scores),
+    )
+
+
+class TestRetrievalQuality:
+    """Tests for the RetrievalQuality enum values."""
+
+    def test_enum_members_exist(self):
+        assert hasattr(RetrievalQuality, "HIGH")
+        assert hasattr(RetrievalQuality, "MEDIUM")
+        assert hasattr(RetrievalQuality, "LOW")
+        assert hasattr(RetrievalQuality, "FAILED")
+
+    def test_string_values(self):
+        assert RetrievalQuality.HIGH.value == "high"
+        assert RetrievalQuality.MEDIUM.value == "medium"
+        assert RetrievalQuality.LOW.value == "low"
+        assert RetrievalQuality.FAILED.value == "failed"
+
+
+class TestQualityAssessment:
+    """Tests for QualityAssessment dataclass."""
+
+    def test_all_fields_present(self):
+        qa = QualityAssessment(
+            quality=RetrievalQuality.HIGH,
+            confidence_score=0.85,
+            top_score=0.85,
+            avg_score=0.75,
+            doc_count=3,
+            recommended_action="proceed",
+            explanation="Good results found.",
+        )
+        assert qa.quality == RetrievalQuality.HIGH
+        assert qa.confidence_score == 0.85
+        assert qa.top_score == 0.85
+        assert qa.avg_score == 0.75
+        assert qa.doc_count == 3
+        assert qa.recommended_action == "proceed"
+        assert qa.explanation == "Good results found."
+
+
+class TestGuardrailsAssess:
+    """Tests for RetrievalGuardrails.assess() method."""
+
+    @pytest.fixture
+    def guardrails_strict(self):
+        return RetrievalGuardrails(failure_mode="strict")
+
+    @pytest.fixture
+    def guardrails_permissive(self):
+        return RetrievalGuardrails(failure_mode="permissive")
+
+    def test_empty_result_is_failed(self, guardrails_strict):
+        result = _make_rag_result([])
+        assessment = guardrails_strict.assess(result)
+        assert assessment.quality == RetrievalQuality.FAILED
+        assert assessment.confidence_score == 0.0
+        assert assessment.recommended_action == "refuse_answer"
+
+    def test_all_scores_below_low_threshold_is_failed(self, guardrails_strict):
+        result = _make_rag_result([0.05, 0.10, 0.03])
+        assessment = guardrails_strict.assess(result)
+        assert assessment.quality == RetrievalQuality.FAILED
+
+    def test_scores_in_low_range(self, guardrails_strict):
+        result = _make_rag_result([0.20, 0.18, 0.16])
+        assessment = guardrails_strict.assess(result)
+        assert assessment.quality == RetrievalQuality.LOW
+
+    def test_scores_in_medium_range(self, guardrails_strict):
+        result = _make_rag_result([0.55, 0.45, 0.35])
+        assessment = guardrails_strict.assess(result)
+        assert assessment.quality == RetrievalQuality.MEDIUM
+
+    def test_scores_high_quality(self, guardrails_strict):
+        result = _make_rag_result([0.85, 0.78, 0.72])
+        assessment = guardrails_strict.assess(result)
+        assert assessment.quality == RetrievalQuality.HIGH
+
+    def test_strict_low_quality_refuses(self, guardrails_strict):
+        result = _make_rag_result([0.20])
+        assessment = guardrails_strict.assess(result)
+        assert assessment.recommended_action == "refuse_answer"
+
+    def test_permissive_low_quality_warns(self, guardrails_permissive):
+        result = _make_rag_result([0.20])
+        assessment = guardrails_permissive.assess(result)
+        assert assessment.recommended_action == "warn_user"
+
+    def test_strict_failed_refuses(self, guardrails_strict):
+        result = _make_rag_result([0.05])
+        assessment = guardrails_strict.assess(result)
+        assert assessment.recommended_action == "refuse_answer"
+
+    def test_permissive_failed_refuses(self, guardrails_permissive):
+        result = _make_rag_result([0.05])
+        assessment = guardrails_permissive.assess(result)
+        assert assessment.recommended_action == "refuse_answer"
+
+    def test_confidence_score_between_0_and_1(self, guardrails_strict):
+        result = _make_rag_result([0.55, 0.45])
+        assessment = guardrails_strict.assess(result)
+        assert 0.0 <= assessment.confidence_score <= 1.0
+
+    def test_doc_count_matches_result(self, guardrails_strict):
+        result = _make_rag_result([0.8, 0.7, 0.6])
+        assessment = guardrails_strict.assess(result)
+        assert assessment.doc_count == 3
+
+    def test_explanation_is_nonempty(self, guardrails_strict):
+        result = _make_rag_result([0.5])
+        assessment = guardrails_strict.assess(result)
+        assert isinstance(assessment.explanation, str)
+        assert len(assessment.explanation) > 0
+
+
+class TestGuardrailsSystemPrompt:
+    """Tests for build_system_prompt_suffix()."""
+
+    def test_high_quality_suffix(self):
+        g = RetrievalGuardrails(failure_mode="permissive")
+        assessment = QualityAssessment(
+            quality=RetrievalQuality.HIGH,
+            confidence_score=0.85,
+            top_score=0.85,
+            avg_score=0.8,
+            doc_count=3,
+            recommended_action="proceed",
+            explanation="High quality results.",
+        )
+        suffix = g.build_system_prompt_suffix(assessment)
+        assert "cite" in suffix.lower() or "source" in suffix.lower()
+
+    def test_medium_quality_permissive_suffix(self):
+        g = RetrievalGuardrails(failure_mode="permissive")
+        assessment = QualityAssessment(
+            quality=RetrievalQuality.MEDIUM,
+            confidence_score=0.5,
+            top_score=0.5,
+            avg_score=0.45,
+            doc_count=2,
+            recommended_action="proceed",
+            explanation="Medium quality.",
+        )
+        suffix = g.build_system_prompt_suffix(assessment)
+        assert "incomplete" in suffix.lower() or "uncertain" in suffix.lower()
+
+    def test_low_quality_permissive_suffix(self):
+        g = RetrievalGuardrails(failure_mode="permissive")
+        assessment = QualityAssessment(
+            quality=RetrievalQuality.LOW,
+            confidence_score=0.2,
+            top_score=0.2,
+            avg_score=0.18,
+            doc_count=1,
+            recommended_action="warn_user",
+            explanation="Low quality.",
+        )
+        suffix = g.build_system_prompt_suffix(assessment)
+        assert "limited" in suffix.lower()
+
+    def test_failed_strict_suffix(self):
+        g = RetrievalGuardrails(failure_mode="strict")
+        assessment = QualityAssessment(
+            quality=RetrievalQuality.FAILED,
+            confidence_score=0.0,
+            top_score=0.0,
+            avg_score=0.0,
+            doc_count=0,
+            recommended_action="refuse_answer",
+            explanation="No results.",
+        )
+        suffix = g.build_system_prompt_suffix(assessment)
+        assert "do not" in suffix.lower() or "training" in suffix.lower()
+
+    def test_suffix_always_nonempty(self):
+        g = RetrievalGuardrails(failure_mode="strict")
+        for quality in RetrievalQuality:
+            assessment = QualityAssessment(
+                quality=quality,
+                confidence_score=0.5,
+                top_score=0.5,
+                avg_score=0.5,
+                doc_count=1,
+                recommended_action="proceed",
+                explanation="Test.",
+            )
+            suffix = g.build_system_prompt_suffix(assessment)
+            assert isinstance(suffix, str)
+            assert len(suffix) > 0
+
+
+class TestGuardrailsCustomThresholds:
+    """Tests for tenant-configurable score thresholds."""
+
+    def test_custom_high_threshold(self):
+        g = RetrievalGuardrails(failure_mode="strict", high_threshold=0.9)
+        result = _make_rag_result([0.85])
+        assessment = g.assess(result)
+        # 0.85 < 0.9, so should NOT be HIGH
+        assert assessment.quality == RetrievalQuality.MEDIUM
+
+    def test_custom_thresholds_via_constructor(self):
+        g = RetrievalGuardrails(
+            failure_mode="permissive",
+            high_threshold=0.8,
+            medium_threshold=0.5,
+            low_threshold=0.2,
+        )
+        result = _make_rag_result([0.3])
+        assessment = g.assess(result)
+        # 0.3 >= 0.2 (low) but < 0.5 (medium) -> LOW
+        assert assessment.quality == RetrievalQuality.LOW
+
+
+class TestMetadataLeakagePrevention:
+    """Tests that FAILED/LOW (strict) assessments don't leak metadata."""
+
+    def test_failed_explanation_no_doc_titles(self):
+        g = RetrievalGuardrails(failure_mode="strict")
+        docs = [
+            Document(
+                doc_id="doc-secret",
+                content="Secret content",
+                final_score=0.05,
+                metadata={"title": "Top Secret Report"},
+            )
+        ]
+        result = RAGResult(query="find secrets", documents=docs, final_count=1)
+        assessment = g.assess(result)
+        assert "Top Secret Report" not in assessment.explanation
+        assert "doc-secret" not in assessment.explanation
+
+    def test_low_strict_explanation_no_hints(self):
+        g = RetrievalGuardrails(failure_mode="strict")
+        result = _make_rag_result([0.2])
+        assessment = g.assess(result)
+        assert "doc-" not in assessment.explanation
diff --git a/python-backend/tests/orchestrator/rag/test_query_router.py b/python-backend/tests/orchestrator/rag/test_query_router.py
new file mode 100644
index 0000000..24eaaa7
--- /dev/null
+++ b/python-backend/tests/orchestrator/rag/test_query_router.py
@@ -0,0 +1,130 @@
+"""Tests for QueryRouter — intent classification to skip/invoke RAG."""
+
+import pytest
+from unittest.mock import AsyncMock, patch
+from app.orchestrator.rag.query_router import QueryRouter, QueryIntent, QueryRouteDecision
+
+
+class TestQueryIntent:
+    """Tests for the QueryIntent enum."""
+
+    def test_enum_members_exist(self):
+        assert hasattr(QueryIntent, "KNOWLEDGE")
+        assert hasattr(QueryIntent, "CONVERSATIONAL")
+        assert hasattr(QueryIntent, "CREATIVE")
+
+    def test_string_values(self):
+        assert QueryIntent.KNOWLEDGE.value == "knowledge"
+        assert QueryIntent.CONVERSATIONAL.value == "conversational"
+        assert QueryIntent.CREATIVE.value == "creative"
+
+
+class TestQueryRouteDecision:
+    """Tests for QueryRouteDecision dataclass."""
+
+    def test_all_fields_present(self):
+        decision = QueryRouteDecision(
+            intent=QueryIntent.KNOWLEDGE,
+            confidence=0.9,
+            skip_rag=False,
+            reason="Looks like a knowledge query.",
+        )
+        assert decision.intent == QueryIntent.KNOWLEDGE
+        assert decision.confidence == 0.9
+        assert decision.skip_rag is False
+        assert decision.reason == "Looks like a knowledge query."
+
+
+@pytest.mark.asyncio
+class TestQueryRouterHeuristics:
+    """Tests for fast regex/heuristic routing (no LLM call)."""
+
+    @pytest.fixture
+    def router(self):
+        return QueryRouter()
+
+    async def test_hello_is_conversational(self, router):
+        decision = await router.route("hello")
+        assert decision.intent == QueryIntent.CONVERSATIONAL
+        assert decision.skip_rag is True
+
+    async def test_hi_is_conversational(self, router):
+        decision = await router.route("hi")
+        assert decision.intent == QueryIntent.CONVERSATIONAL
+        assert decision.skip_rag is True
+
+    async def test_thanks_is_conversational(self, router):
+        decision = await router.route("thanks")
+        assert decision.intent == QueryIntent.CONVERSATIONAL
+        assert decision.skip_rag is True
+
+    async def test_thank_you_is_conversational(self, router):
+        decision = await router.route("thank you for the help")
+        assert decision.intent == QueryIntent.CONVERSATIONAL
+        assert decision.skip_rag is True
+
+    async def test_good_morning_is_conversational(self, router):
+        decision = await router.route("good morning")
+        assert decision.intent == QueryIntent.CONVERSATIONAL
+        assert decision.skip_rag is True
+
+    async def test_write_poem_is_creative(self, router):
+        decision = await router.route("write me a poem about cats")
+        assert decision.intent == QueryIntent.CREATIVE
+        assert decision.skip_rag is True
+
+    async def test_write_story_is_creative(self, router):
+        decision = await router.route("write a story about a dragon")
+        assert decision.intent == QueryIntent.CREATIVE
+        assert decision.skip_rag is True
+
+    async def test_policy_question_is_knowledge(self, router):
+        decision = await router.route("what does the policy say about vacation time")
+        assert decision.intent == QueryIntent.KNOWLEDGE
+        assert decision.skip_rag is False
+
+    async def test_explain_process_is_knowledge(self, router):
+        decision = await router.route("explain the process for onboarding new employees")
+        assert decision.intent == QueryIntent.KNOWLEDGE
+        assert decision.skip_rag is False
+
+    async def test_how_does_work_is_knowledge(self, router):
+        decision = await router.route("how does the authentication system work")
+        assert decision.intent == QueryIntent.KNOWLEDGE
+        assert decision.skip_rag is False
+
+    async def test_skip_rag_true_for_non_knowledge(self, router):
+        conv = await router.route("hey there")
+        assert conv.skip_rag is True
+        creative = await router.route("compose me a song about coding")
+        assert creative.skip_rag is True
+
+    async def test_skip_rag_false_for_knowledge(self, router):
+        decision = await router.route("what are the security requirements")
+        assert decision.skip_rag is False
+
+
+@pytest.mark.asyncio
+class TestQueryRouterLLMFallback:
+    """Tests for LLM classification of ambiguous queries."""
+
+    @pytest.fixture
+    def router(self):
+        return QueryRouter()
+
+    async def test_llm_failure_defaults_to_knowledge(self, router):
+        """When LLM classification fails, default to KNOWLEDGE (safe fallback)."""
+        # An ambiguous query that doesn't match heuristics
+        with patch.object(
+            router, "_classify_with_llm", new_callable=AsyncMock,
+            side_effect=Exception("LLM unavailable"),
+        ):
+            decision = await router.route("tell me something interesting about our quarterly numbers")
+            assert decision.intent == QueryIntent.KNOWLEDGE
+            assert decision.skip_rag is False
+
+    async def test_ambiguous_query_falls_back(self, router):
+        """Ambiguous queries that don't match heuristics should default to KNOWLEDGE."""
+        decision = await router.route("tell me about the project timeline and milestones")
+        assert decision.intent == QueryIntent.KNOWLEDGE
+        assert decision.skip_rag is False
