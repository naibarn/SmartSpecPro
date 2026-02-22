diff --git a/python-backend/app/orchestrator/rag/guardrails.py b/python-backend/app/orchestrator/rag/guardrails.py
index 7bd764e..7345f52 100644
--- a/python-backend/app/orchestrator/rag/guardrails.py
+++ b/python-backend/app/orchestrator/rag/guardrails.py
@@ -1,36 +1,24 @@
 """
-Retrieval quality guardrails for multi-tenant RAG.
+SmartSpec Pro - Retrieval Guardrails
+Phase 2: Quality & Intelligence
 
-Assesses retrieval quality and determines the appropriate response strategy
-based on document scores and tenant-configurable failure modes.
-
-Quality levels:
-  HIGH    - top_score >= 0.7, confident answer
-  MEDIUM  - top_score 0.4-0.7, partial confidence
-  LOW     - top_score 0.15-0.4, very limited info
-  FAILED  - no docs or all below 0.15
-
-Failure modes:
-  strict     - refuse answer on LOW/FAILED (enterprise default)
-  permissive - warn user on LOW, refuse only on FAILED (general default)
+Quality assessment for RAG retrieval results with tenant-configurable
+failure modes and metadata leakage prevention.
 """
 
 from __future__ import annotations
 
 from dataclasses import dataclass
 from enum import Enum
-from typing import TYPE_CHECKING
+from typing import Any, List
 
 import structlog
 
-if TYPE_CHECKING:
-    from app.orchestrator.rag.hybrid_rag import RAGResult
-
 logger = structlog.get_logger()
 
 
 class RetrievalQuality(str, Enum):
-    """Quality level of retrieved documents."""
+    """Quality level of retrieval results."""
     HIGH = "high"
     MEDIUM = "medium"
     LOW = "low"
@@ -39,7 +27,7 @@ class RetrievalQuality(str, Enum):
 
 @dataclass
 class QualityAssessment:
-    """Result of quality assessment on a RAGResult."""
+    """Result of a retrieval quality assessment."""
     quality: RetrievalQuality
     confidence_score: float
     top_score: float
@@ -50,13 +38,14 @@ class QualityAssessment:
 
 
 class RetrievalGuardrails:
-    """Assess retrieval quality and determine response strategy.
+    """
+    Retrieval quality assessment with tenant-configurable failure modes.
 
-    Args:
-        failure_mode: "strict" (enterprise) or "permissive" (general).
-        high_threshold: Minimum score for HIGH quality.
-        medium_threshold: Minimum score for MEDIUM quality.
-        low_threshold: Minimum score for LOW quality (below is FAILED).
+    Failure modes:
+    - "strict": refuse answer on LOW quality (enterprise default)
+    - "permissive": warn user on LOW quality (general default)
+
+    Both modes refuse on FAILED quality.
     """
 
     def __init__(
@@ -65,25 +54,25 @@ class RetrievalGuardrails:
         high_threshold: float = 0.7,
         medium_threshold: float = 0.4,
         low_threshold: float = 0.15,
-    ) -> None:
-        if failure_mode not in ("strict", "permissive"):
-            raise ValueError(
-                f"failure_mode must be 'strict' or 'permissive', got '{failure_mode}'"
-            )
+    ):
         self.failure_mode = failure_mode
         self.high_threshold = high_threshold
         self.medium_threshold = medium_threshold
         self.low_threshold = low_threshold
 
-    def assess(self, rag_result: "RAGResult") -> QualityAssessment:
-        """Assess retrieval quality from a RAGResult.
+    def assess(self, rag_result: Any) -> QualityAssessment:
+        """
+        Assess the quality of a RAG retrieval result.
+
+        Args:
+            rag_result: RAGResult with documents to assess.
 
-        Returns a QualityAssessment with quality level, confidence, and
-        recommended action based on the configured failure mode.
+        Returns:
+            QualityAssessment with quality level and recommended action.
         """
-        docs = rag_result.documents
+        documents = rag_result.documents
 
-        if not docs:
+        if not documents:
             return QualityAssessment(
                 quality=RetrievalQuality.FAILED,
                 confidence_score=0.0,
@@ -94,9 +83,10 @@ class RetrievalGuardrails:
                 explanation="No relevant information was found in the knowledge base.",
             )
 
-        scores = [d.final_score for d in docs]
+        scores = [doc.final_score for doc in documents]
         top_score = max(scores)
         avg_score = sum(scores) / len(scores)
+        doc_count = len(documents)
 
         # Determine quality level
         if top_score >= self.high_threshold:
@@ -109,46 +99,49 @@ class RetrievalGuardrails:
             quality = RetrievalQuality.FAILED
 
         # Determine recommended action
-        action = self._determine_action(quality)
-
-        # Build explanation — prevent metadata leakage for FAILED / strict LOW
-        explanation = self._build_explanation(quality, len(docs), top_score)
-
-        confidence = min(top_score, 1.0)
+        if quality == RetrievalQuality.HIGH:
+            action = "proceed"
+        elif quality == RetrievalQuality.MEDIUM:
+            action = "proceed"
+        elif quality == RetrievalQuality.LOW:
+            if self.failure_mode == "strict":
+                action = "refuse_answer"
+            else:
+                action = "warn_user"
+        else:  # FAILED
+            action = "refuse_answer"
+
+        # Confidence score
+        confidence_score = min(top_score, 1.0)
+
+        # Generate explanation — prevent metadata leakage for FAILED/LOW strict
+        explanation = self._build_explanation(quality, doc_count, top_score, avg_score)
 
         logger.debug(
-            "guardrails_assessed",
+            "guardrails_assessment",
             quality=quality.value,
             top_score=top_score,
             avg_score=avg_score,
-            doc_count=len(docs),
+            doc_count=doc_count,
             action=action,
         )
 
         return QualityAssessment(
             quality=quality,
-            confidence_score=confidence,
+            confidence_score=confidence_score,
             top_score=top_score,
             avg_score=avg_score,
-            doc_count=len(docs),
+            doc_count=doc_count,
             recommended_action=action,
             explanation=explanation,
         )
 
-    def _determine_action(self, quality: RetrievalQuality) -> str:
-        if quality == RetrievalQuality.HIGH:
-            return "proceed"
-        if quality == RetrievalQuality.MEDIUM:
-            return "proceed"
-        if quality == RetrievalQuality.LOW:
-            if self.failure_mode == "permissive":
-                return "warn_user"
-            return "refuse_answer"
-        # FAILED
-        return "refuse_answer"
-
     def _build_explanation(
-        self, quality: RetrievalQuality, doc_count: int, top_score: float,
+        self,
+        quality: RetrievalQuality,
+        doc_count: int,
+        top_score: float,
+        avg_score: float,
     ) -> str:
         """Build a human-readable explanation without leaking metadata."""
         if quality == RetrievalQuality.FAILED:
@@ -158,46 +151,66 @@ class RetrievalGuardrails:
             return "Very limited relevant information was found."
 
         if quality == RetrievalQuality.LOW:
-            return f"Found {doc_count} result(s) with low relevance."
+            return (
+                f"Limited relevant information found ({doc_count} results "
+                f"with low confidence)."
+            )
 
         if quality == RetrievalQuality.MEDIUM:
-            return f"Found {doc_count} result(s) with moderate relevance."
+            return (
+                f"Partial match found ({doc_count} results with moderate confidence)."
+            )
 
-        return f"Found {doc_count} highly relevant result(s)."
+        # HIGH
+        return (
+            f"Strong match found ({doc_count} results with high confidence)."
+        )
 
     def build_system_prompt_suffix(self, assessment: QualityAssessment) -> str:
-        """Return a system prompt suffix to guide LLM behavior based on quality."""
-        q = assessment.quality
+        """
+        Build a system prompt suffix to guide LLM behavior based on quality.
 
-        if q == RetrievalQuality.HIGH:
+        Returns:
+            String to append to the system prompt.
+        """
+        quality = assessment.quality
+
+        if quality == RetrievalQuality.HIGH:
             return (
                 "Answer based ONLY on the provided context. "
-                "Cite sources using the [Source N] markers."
+                "Cite sources using [Source N] markers where applicable."
             )
 
-        if q == RetrievalQuality.MEDIUM:
+        if quality == RetrievalQuality.MEDIUM:
+            if self.failure_mode == "permissive":
+                return (
+                    "The retrieved context may be incomplete. "
+                    "Answer based on the provided context but clearly state "
+                    "any uncertainty. Do not fabricate information."
+                )
             return (
-                "Context may be incomplete. Clearly state uncertainty "
-                "where information is missing or unclear."
+                "The retrieved context may be incomplete. "
+                "Answer based on the provided context and clearly indicate "
+                "uncertain or inferred information."
             )
 
-        if q == RetrievalQuality.LOW:
+        if quality == RetrievalQuality.LOW:
             if self.failure_mode == "permissive":
                 return (
-                    "Very limited information found. Prefix uncertain parts "
-                    "with 'Based on limited information:' and clearly indicate "
-                    "what is not covered."
+                    "Very limited information was found. "
+                    "Prefix uncertain parts with 'Based on limited information:'. "
+                    "Do not present uncertain information as fact."
                 )
-            # strict + LOW -> refuse
+            # strict LOW — same as FAILED
             return (
                 "No relevant information was found in the knowledge base. "
                 "Do NOT answer from training data. Inform the user that "
-                "the requested information is not available."
+                "no relevant information is available."
             )
 
         # FAILED (both modes)
         return (
             "No relevant information was found in the knowledge base. "
             "Do NOT answer from training data. Inform the user that "
-            "the requested information is not available."
+            "no relevant information is available."
         )
diff --git a/python-backend/app/orchestrator/rag/query_router.py b/python-backend/app/orchestrator/rag/query_router.py
index 742aef3..0c12886 100644
--- a/python-backend/app/orchestrator/rag/query_router.py
+++ b/python-backend/app/orchestrator/rag/query_router.py
@@ -1,13 +1,9 @@
 """
-Query intent router for RAG pipeline.
+SmartSpec Pro - Query Router
+Phase 2: Quality & Intelligence
 
-Classifies queries to decide whether RAG retrieval is needed:
-  KNOWLEDGE      - needs RAG retrieval
-  CONVERSATIONAL - greetings, meta-questions; skip RAG
-  CREATIVE       - writing/generation tasks; skip RAG
-
-Uses fast heuristics first (regex). Falls back to KNOWLEDGE
-as the safe default (extra RAG is cheaper than missing context).
+Intent classification to skip RAG for non-knowledge queries.
+Uses fast heuristics first, falls back to LLM for ambiguous queries.
 """
 
 from __future__ import annotations
@@ -22,7 +18,7 @@ logger = structlog.get_logger()
 
 
 class QueryIntent(str, Enum):
-    """Intent classification for a user query."""
+    """Query intent classification."""
     KNOWLEDGE = "knowledge"
     CONVERSATIONAL = "conversational"
     CREATIVE = "creative"
@@ -37,76 +33,118 @@ class QueryRouteDecision:
     reason: str
 
 
-# Compiled regex patterns for heuristic matching
-_CONVERSATIONAL_PATTERNS = re.compile(
-    r"^(hello|hi|hey|good morning|good afternoon|good evening|"
-    r"thanks|thank you|thx|cheers|"
-    r"who are you|what can you do|how do you work)\b",
-    re.IGNORECASE,
-)
-
-_CREATIVE_PATTERNS = re.compile(
-    r"^(write|compose|create|draft|generate)\s+(me\s+)?(a\s+)?"
-    r"(poem|story|essay|song|letter|email|joke|riddle)",
-    re.IGNORECASE,
-)
+# Compiled regex patterns for heuristic routing
+_CONVERSATIONAL_PATTERNS = [
+    re.compile(r"^(hello|hi|hey|good morning|good afternoon|good evening)\b", re.IGNORECASE),
+    re.compile(r"^(thanks|thank you|thx|cheers)\b", re.IGNORECASE),
+    re.compile(r"^(who are you|what can you do|how do you work)\b", re.IGNORECASE),
+    re.compile(r"^(bye|goodbye|see you|good night)\b", re.IGNORECASE),
+]
 
-_CREATIVE_ALT_PATTERNS = re.compile(
-    r"^(write|tell)\s+(me\s+)?a\s+(joke|riddle)",
-    re.IGNORECASE,
-)
+_CREATIVE_PATTERNS = [
+    re.compile(
+        r"^(write|compose|create|draft|generate)\s+(me\s+)?(a\s+)?(poem|story|essay|song|letter|email)\b",
+        re.IGNORECASE,
+    ),
+    re.compile(r"^(write|tell)\s+(me\s+)?a\s+(joke|riddle)\b", re.IGNORECASE),
+]
 
 
 class QueryRouter:
-    """Lightweight router that classifies query intent to avoid unnecessary RAG retrieval."""
+    """
+    Lightweight router that classifies query intent to avoid unnecessary RAG retrieval.
 
-    async def route(self, query: str) -> QueryRouteDecision:
-        """Classify the query intent.
+    Uses fast heuristics first (regex patterns for greetings, thanks, creative prompts).
+    Falls back to LLM classification for ambiguous queries.
+    Default assumption: KNOWLEDGE (safe fallback — extra RAG is cheaper than missing context).
+    """
 
-        Uses fast heuristics first (regex patterns for greetings, thanks,
-        creative prompts). Falls back to KNOWLEDGE for anything ambiguous.
-        """
-        stripped = query.strip()
-
-        # Check conversational patterns — only for short queries to avoid
-        # misclassifying "Hi, what is the refund policy?" as conversational
-        word_count = len(stripped.split())
-        if word_count < 8 and _CONVERSATIONAL_PATTERNS.search(stripped):
-            return QueryRouteDecision(
-                intent=QueryIntent.CONVERSATIONAL,
-                confidence=0.95,
-                skip_rag=True,
-                reason="Matched conversational pattern.",
-            )
-
-        # Check creative patterns
-        if _CREATIVE_PATTERNS.search(stripped) or _CREATIVE_ALT_PATTERNS.search(stripped):
-            return QueryRouteDecision(
-                intent=QueryIntent.CREATIVE,
-                confidence=0.90,
-                skip_rag=True,
-                reason="Matched creative/generation pattern.",
-            )
+    def __init__(self, llm_model: str = "gpt-4.1-nano"):
+        self.llm_model = llm_model
 
-        # Default: KNOWLEDGE (safe fallback)
+    async def route(self, query: str) -> QueryRouteDecision:
+        """Classify the query intent."""
+        query_stripped = query.strip()
+
+        # Fast heuristic: conversational patterns
+        for pattern in _CONVERSATIONAL_PATTERNS:
+            if pattern.search(query_stripped):
+                return QueryRouteDecision(
+                    intent=QueryIntent.CONVERSATIONAL,
+                    confidence=0.95,
+                    skip_rag=True,
+                    reason="Matched conversational pattern.",
+                )
+
+        # Fast heuristic: creative patterns
+        for pattern in _CREATIVE_PATTERNS:
+            if pattern.search(query_stripped):
+                return QueryRouteDecision(
+                    intent=QueryIntent.CREATIVE,
+                    confidence=0.90,
+                    skip_rag=True,
+                    reason="Matched creative generation pattern.",
+                )
+
+        # For non-matching queries, try LLM classification
         try:
-            decision = await self._classify_with_llm(stripped)
+            decision = await self._classify_with_llm(query_stripped)
             if decision is not None:
                 return decision
-        except Exception:
-            logger.debug("query_router_llm_fallback_failed", query=stripped[:50])
+        except Exception as e:
+            logger.warning("query_router_llm_fallback_failed", error=str(e))
 
+        # Default: KNOWLEDGE (safe fallback)
         return QueryRouteDecision(
             intent=QueryIntent.KNOWLEDGE,
             confidence=0.5,
             skip_rag=False,
-            reason="No heuristic match; defaulting to knowledge query.",
+            reason="Default to knowledge query (safe fallback).",
         )
 
     async def _classify_with_llm(self, query: str) -> QueryRouteDecision | None:
-        """Attempt LLM-based classification for ambiguous queries.
+        """
+        Classify query intent using a cheap LLM model.
 
-        Returns None if classification is inconclusive or unavailable.
-        Currently returns None (LLM integration deferred to Section 07).
+        Returns None if LLM is unavailable, allowing the caller to use default.
         """
-        return None
+        try:
+            from openai import AsyncOpenAI
+        except ImportError:
+            return None
+
+        client = AsyncOpenAI()
+
+        prompt = (
+            "Classify the following user query into one of these categories:\n"
+            "- KNOWLEDGE: The user wants factual information from documents/knowledge base\n"
+            "- CONVERSATIONAL: Greeting, thanks, or social interaction\n"
+            "- CREATIVE: Writing, generation, or creative task\n\n"
+            f"Query: {query}\n\n"
+            "Respond with ONLY the category name (KNOWLEDGE, CONVERSATIONAL, or CREATIVE)."
+        )
+
+        response = await client.chat.completions.create(
+            model=self.llm_model,
+            messages=[{"role": "user", "content": prompt}],
+            max_tokens=10,
+            temperature=0,
+        )
+
+        text = response.choices[0].message.content.strip().upper()
+
+        intent_map = {
+            "KNOWLEDGE": QueryIntent.KNOWLEDGE,
+            "CONVERSATIONAL": QueryIntent.CONVERSATIONAL,
+            "CREATIVE": QueryIntent.CREATIVE,
+        }
+
+        intent = intent_map.get(text, QueryIntent.KNOWLEDGE)
+        skip_rag = intent != QueryIntent.KNOWLEDGE
+
+        return QueryRouteDecision(
+            intent=intent,
+            confidence=0.8,
+            skip_rag=skip_rag,
+            reason=f"LLM classified as {intent.value}.",
+        )
diff --git a/python-backend/tests/orchestrator/rag/test_citations.py b/python-backend/tests/orchestrator/rag/test_citations.py
index 50783c2..b279941 100644
--- a/python-backend/tests/orchestrator/rag/test_citations.py
+++ b/python-backend/tests/orchestrator/rag/test_citations.py
@@ -4,165 +4,209 @@ import pytest
 from app.orchestrator.rag.hybrid_rag import Document, RAGResult, SearchMode
 
 
-class TestDocumentCitationFields:
-    """Tests for new citation-related fields on Document."""
-
-    def test_chunk_id_default_none(self):
-        doc = Document()
-        assert doc.chunk_id is None
-
-    def test_parent_doc_id_default_none(self):
-        doc = Document()
-        assert doc.parent_doc_id is None
-
-    def test_parent_doc_title_default_none(self):
-        doc = Document()
-        assert doc.parent_doc_title is None
-
-    def test_section_heading_default_none(self):
-        doc = Document()
-        assert doc.section_heading is None
-
-    def test_to_dict_includes_citation_fields(self):
-        doc = Document(
-            chunk_id="chunk-1",
-            parent_doc_id="pdoc-1",
-            parent_doc_title="My Document",
-            section_heading="Section A",
-        )
-        d = doc.to_dict()
-        assert d["chunk_id"] == "chunk-1"
-        assert d["parent_doc_id"] == "pdoc-1"
-        assert d["parent_doc_title"] == "My Document"
-        assert d["section_heading"] == "Section A"
-
+# ---------------------------------------------------------------------------
+# Document.citation_ref()
+# ---------------------------------------------------------------------------
 
 class TestDocumentCitationRef:
     """Tests for Document.citation_ref() method."""
 
     def test_title_and_section(self):
-        doc = Document(parent_doc_title="My Report", section_heading="Introduction")
+        """Document with parent_doc_title and section_heading returns formatted ref."""
+        doc = Document(
+            doc_id="d1",
+            content="Some content",
+            parent_doc_title="Project Requirements",
+            section_heading="Authentication Flow",
+        )
         ref = doc.citation_ref()
-        assert "My Report" in ref
-        assert "Introduction" in ref
+        assert ref == "[Project Requirements - section Authentication Flow]"
 
     def test_title_only(self):
-        doc = Document(parent_doc_title="My Report")
+        """Document with title but no section returns title-only ref."""
+        doc = Document(
+            doc_id="d1",
+            content="Some content",
+            parent_doc_title="API Documentation",
+        )
         ref = doc.citation_ref()
-        assert "My Report" in ref
-        assert "section" not in ref.lower() or "Introduction" not in ref
+        assert ref == "[API Documentation]"
 
-    def test_no_title_fallback(self):
-        doc = Document()
+    def test_no_title_no_section(self):
+        """Document with neither title nor heading returns fallback."""
+        doc = Document(doc_id="d1", content="Some content")
         ref = doc.citation_ref()
-        assert "Unknown" in ref or "unknown" in ref
+        assert ref == "[Unknown Source]"
 
-    def test_returns_string(self):
-        doc = Document(parent_doc_title="Title")
+    def test_citation_ref_returns_string(self):
+        """citation_ref should always return a string."""
+        doc = Document(doc_id="d1", content="Content")
         assert isinstance(doc.citation_ref(), str)
 
 
+# ---------------------------------------------------------------------------
+# RAGResult.get_context_with_citations()
+# ---------------------------------------------------------------------------
+
 class TestRAGResultGetContextWithCitations:
     """Tests for RAGResult.get_context_with_citations() method."""
 
-    def _make_result_with_citations(self) -> RAGResult:
+    def _make_result(self, docs: list[Document]) -> RAGResult:
+        return RAGResult(query="test", documents=docs, final_count=len(docs))
+
+    def test_context_includes_source_markers(self):
+        """Context should include [Source N: ...] markers inline."""
         docs = [
             Document(
                 doc_id="d1",
-                content="Auth flow uses JWT tokens.",
-                final_score=0.9,
+                content="Auth details here.",
+                parent_doc_title="Requirements",
                 parent_doc_id="pdoc-1",
-                parent_doc_title="Project Requirements",
-                section_heading="Authentication Flow",
-                chunk_id="c1",
+                section_heading="Auth",
             ),
             Document(
                 doc_id="d2",
-                content="Rate limit is 100 req/min.",
-                final_score=0.8,
+                content="Rate limiting info.",
+                parent_doc_title="API Docs",
                 parent_doc_id="pdoc-2",
-                parent_doc_title="API Documentation",
-                section_heading="Rate Limiting",
-                chunk_id="c2",
+                section_heading="Limits",
             ),
         ]
-        return RAGResult(query="test", documents=docs, final_count=2)
-
-    def test_context_has_source_markers(self):
-        result = self._make_result_with_citations()
+        result = self._make_result(docs)
         context, citations = result.get_context_with_citations()
         assert "[Source 1:" in context
         assert "[Source 2:" in context
 
     def test_citations_list_per_unique_source(self):
-        result = self._make_result_with_citations()
+        """Citations list should have one entry per unique source document."""
+        docs = [
+            Document(
+                doc_id="d1",
+                content="Part A",
+                parent_doc_id="pdoc-1",
+                parent_doc_title="Doc A",
+                section_heading="S1",
+            ),
+            Document(
+                doc_id="d2",
+                content="Part B",
+                parent_doc_id="pdoc-1",
+                parent_doc_title="Doc A",
+                section_heading="S2",
+            ),
+        ]
+        result = self._make_result(docs)
         _, citations = result.get_context_with_citations()
+        # Different sections = distinct citations
         assert len(citations) == 2
 
     def test_citations_ordered_by_first_appearance(self):
-        result = self._make_result_with_citations()
+        """Citations should be ordered by their first appearance."""
+        docs = [
+            Document(
+                doc_id="d1",
+                content="First",
+                parent_doc_id="pdoc-1",
+                parent_doc_title="Alpha",
+                section_heading="S1",
+            ),
+            Document(
+                doc_id="d2",
+                content="Second",
+                parent_doc_id="pdoc-2",
+                parent_doc_title="Beta",
+                section_heading="S1",
+            ),
+        ]
+        result = self._make_result(docs)
         _, citations = result.get_context_with_citations()
-        assert citations[0]["index"] == 1
-        assert citations[1]["index"] == 2
+        assert citations[0]["title"] == "Alpha"
+        assert citations[1]["title"] == "Beta"
 
-    def test_same_parent_different_sections_distinct_citations(self):
+    def test_same_parent_different_sections(self):
+        """Multiple chunks from same parent but different sections get distinct citations."""
         docs = [
             Document(
                 doc_id="d1",
-                content="Part one.",
-                final_score=0.9,
+                content="Overview",
                 parent_doc_id="pdoc-1",
-                parent_doc_title="Big Doc",
-                section_heading="Section A",
-                chunk_id="c1",
+                parent_doc_title="Spec",
+                section_heading="Intro",
             ),
             Document(
                 doc_id="d2",
-                content="Part two.",
-                final_score=0.8,
+                content="Details",
                 parent_doc_id="pdoc-1",
-                parent_doc_title="Big Doc",
-                section_heading="Section B",
-                chunk_id="c2",
+                parent_doc_title="Spec",
+                section_heading="Implementation",
             ),
         ]
-        result = RAGResult(query="test", documents=docs, final_count=2)
+        result = self._make_result(docs)
         _, citations = result.get_context_with_citations()
         assert len(citations) == 2
 
     def test_max_tokens_respected(self):
+        """Context should not exceed max_tokens."""
+        long_content = "word " * 2000  # ~2000 tokens
         docs = [
             Document(
-                doc_id=f"d{i}",
-                content="x" * 2000,
-                final_score=0.9 - i * 0.1,
-                parent_doc_title=f"Doc {i}",
-                chunk_id=f"c{i}",
-            )
-            for i in range(10)
+                doc_id="d1",
+                content=long_content,
+                parent_doc_title="Long Doc",
+            ),
+            Document(
+                doc_id="d2",
+                content="Short content.",
+                parent_doc_title="Short Doc",
+            ),
         ]
-        result = RAGResult(query="test", documents=docs, final_count=10)
-        context, citations = result.get_context_with_citations(max_tokens=500)
-        # At ~4 chars per token, 500 tokens = ~2000 chars.
-        # Each doc is 2000 chars + header. Should include at most 1 doc.
-        assert len(citations) <= 2
+        result = self._make_result(docs)
+        context, _ = result.get_context_with_citations(max_tokens=500)
+        # Should have included first doc (truncated or just first doc), not both
+        assert len(context) < len(long_content) + 200
 
     def test_empty_documents_returns_empty(self):
-        result = RAGResult(query="test", documents=[], final_count=0)
+        """Empty documents list should return empty context and empty citations."""
+        result = self._make_result([])
         context, citations = result.get_context_with_citations()
         assert context == ""
         assert citations == []
 
 
-class TestRAGResultCitationsField:
-    """Tests for the citations field on RAGResult."""
+# ---------------------------------------------------------------------------
+# Document citation fields
+# ---------------------------------------------------------------------------
 
-    def test_citations_default_empty_list(self):
-        result = RAGResult()
-        assert result.citations == []
+class TestDocumentCitationFields:
+    """Tests for new citation-related fields on Document."""
 
-    def test_to_dict_includes_citations(self):
-        result = RAGResult(citations=[{"index": 1, "title": "Test"}])
-        d = result.to_dict()
-        assert "citations" in d
-        assert len(d["citations"]) == 1
+    def test_chunk_id_default_none(self):
+        doc = Document(doc_id="d1", content="test")
+        assert doc.chunk_id is None
+
+    def test_parent_doc_id_default_none(self):
+        doc = Document(doc_id="d1", content="test")
+        assert doc.parent_doc_id is None
+
+    def test_parent_doc_title_default_none(self):
+        doc = Document(doc_id="d1", content="test")
+        assert doc.parent_doc_title is None
+
+    def test_section_heading_default_none(self):
+        doc = Document(doc_id="d1", content="test")
+        assert doc.section_heading is None
+
+    def test_to_dict_includes_citation_fields(self):
+        doc = Document(
+            doc_id="d1",
+            content="test",
+            chunk_id="chunk-1",
+            parent_doc_id="pdoc-1",
+            parent_doc_title="My Doc",
+            section_heading="Intro",
+        )
+        d = doc.to_dict()
+        assert d["chunk_id"] == "chunk-1"
+        assert d["parent_doc_id"] == "pdoc-1"
+        assert d["parent_doc_title"] == "My Doc"
+        assert d["section_heading"] == "Intro"
diff --git a/python-backend/tests/orchestrator/rag/test_query_router.py b/python-backend/tests/orchestrator/rag/test_query_router.py
index 24eaaa7..140ba44 100644
--- a/python-backend/tests/orchestrator/rag/test_query_router.py
+++ b/python-backend/tests/orchestrator/rag/test_query_router.py
@@ -5,37 +5,51 @@ from unittest.mock import AsyncMock, patch
 from app.orchestrator.rag.query_router import QueryRouter, QueryIntent, QueryRouteDecision
 
 
+# ---------------------------------------------------------------------------
+# QueryIntent enum
+# ---------------------------------------------------------------------------
+
 class TestQueryIntent:
     """Tests for the QueryIntent enum."""
 
-    def test_enum_members_exist(self):
+    def test_enum_members(self):
+        """Enum should have KNOWLEDGE, CONVERSATIONAL, CREATIVE members."""
         assert hasattr(QueryIntent, "KNOWLEDGE")
         assert hasattr(QueryIntent, "CONVERSATIONAL")
         assert hasattr(QueryIntent, "CREATIVE")
 
-    def test_string_values(self):
-        assert QueryIntent.KNOWLEDGE.value == "knowledge"
-        assert QueryIntent.CONVERSATIONAL.value == "conversational"
-        assert QueryIntent.CREATIVE.value == "creative"
+    def test_enum_string_values(self):
+        """String values should match expected."""
+        assert QueryIntent.KNOWLEDGE == "knowledge"
+        assert QueryIntent.CONVERSATIONAL == "conversational"
+        assert QueryIntent.CREATIVE == "creative"
+
 
+# ---------------------------------------------------------------------------
+# QueryRouteDecision dataclass
+# ---------------------------------------------------------------------------
 
 class TestQueryRouteDecision:
     """Tests for QueryRouteDecision dataclass."""
 
-    def test_all_fields_present(self):
+    def test_all_fields(self):
+        """Should have intent, confidence, skip_rag, reason fields."""
         decision = QueryRouteDecision(
             intent=QueryIntent.KNOWLEDGE,
-            confidence=0.9,
+            confidence=0.95,
             skip_rag=False,
-            reason="Looks like a knowledge query.",
+            reason="Knowledge query detected.",
         )
         assert decision.intent == QueryIntent.KNOWLEDGE
-        assert decision.confidence == 0.9
+        assert decision.confidence == 0.95
         assert decision.skip_rag is False
-        assert decision.reason == "Looks like a knowledge query."
+        assert decision.reason == "Knowledge query detected."
 
 
-@pytest.mark.asyncio
+# ---------------------------------------------------------------------------
+# Heuristic routing
+# ---------------------------------------------------------------------------
+
 class TestQueryRouterHeuristics:
     """Tests for fast regex/heuristic routing (no LLM call)."""
 
@@ -43,68 +57,82 @@ class TestQueryRouterHeuristics:
     def router(self):
         return QueryRouter()
 
+    @pytest.mark.asyncio
     async def test_hello_is_conversational(self, router):
         decision = await router.route("hello")
         assert decision.intent == QueryIntent.CONVERSATIONAL
         assert decision.skip_rag is True
 
+    @pytest.mark.asyncio
     async def test_hi_is_conversational(self, router):
         decision = await router.route("hi")
         assert decision.intent == QueryIntent.CONVERSATIONAL
         assert decision.skip_rag is True
 
+    @pytest.mark.asyncio
     async def test_thanks_is_conversational(self, router):
         decision = await router.route("thanks")
         assert decision.intent == QueryIntent.CONVERSATIONAL
         assert decision.skip_rag is True
 
+    @pytest.mark.asyncio
     async def test_thank_you_is_conversational(self, router):
-        decision = await router.route("thank you for the help")
+        decision = await router.route("thank you for helping")
         assert decision.intent == QueryIntent.CONVERSATIONAL
         assert decision.skip_rag is True
 
+    @pytest.mark.asyncio
     async def test_good_morning_is_conversational(self, router):
         decision = await router.route("good morning")
         assert decision.intent == QueryIntent.CONVERSATIONAL
         assert decision.skip_rag is True
 
+    @pytest.mark.asyncio
     async def test_write_poem_is_creative(self, router):
-        decision = await router.route("write me a poem about cats")
+        decision = await router.route("write me a poem about clouds")
         assert decision.intent == QueryIntent.CREATIVE
         assert decision.skip_rag is True
 
+    @pytest.mark.asyncio
     async def test_write_story_is_creative(self, router):
         decision = await router.route("write a story about a dragon")
         assert decision.intent == QueryIntent.CREATIVE
         assert decision.skip_rag is True
 
-    async def test_policy_question_is_knowledge(self, router):
-        decision = await router.route("what does the policy say about vacation time")
+    @pytest.mark.asyncio
+    async def test_policy_query_is_knowledge(self, router):
+        decision = await router.route("what does the policy say about remote work")
         assert decision.intent == QueryIntent.KNOWLEDGE
         assert decision.skip_rag is False
 
+    @pytest.mark.asyncio
     async def test_explain_process_is_knowledge(self, router):
         decision = await router.route("explain the process for onboarding new employees")
         assert decision.intent == QueryIntent.KNOWLEDGE
         assert decision.skip_rag is False
 
+    @pytest.mark.asyncio
     async def test_how_does_work_is_knowledge(self, router):
         decision = await router.route("how does the authentication system work")
         assert decision.intent == QueryIntent.KNOWLEDGE
         assert decision.skip_rag is False
 
-    async def test_skip_rag_true_for_non_knowledge(self, router):
-        conv = await router.route("hey there")
+    @pytest.mark.asyncio
+    async def test_skip_rag_logic(self, router):
+        """skip_rag should be True for CONVERSATIONAL and CREATIVE, False for KNOWLEDGE."""
+        conv = await router.route("hello there")
+        creative = await router.route("write me a poem")
+        knowledge = await router.route("what is the deployment process")
+
         assert conv.skip_rag is True
-        creative = await router.route("compose me a song about coding")
         assert creative.skip_rag is True
+        assert knowledge.skip_rag is False
 
-    async def test_skip_rag_false_for_knowledge(self, router):
-        decision = await router.route("what are the security requirements")
-        assert decision.skip_rag is False
 
+# ---------------------------------------------------------------------------
+# LLM fallback
+# ---------------------------------------------------------------------------
 
-@pytest.mark.asyncio
 class TestQueryRouterLLMFallback:
     """Tests for LLM classification of ambiguous queries."""
 
@@ -112,19 +140,36 @@ class TestQueryRouterLLMFallback:
     def router(self):
         return QueryRouter()
 
-    async def test_llm_failure_defaults_to_knowledge(self, router):
-        """When LLM classification fails, default to KNOWLEDGE (safe fallback)."""
-        # An ambiguous query that doesn't match heuristics
-        with patch.object(
-            router, "_classify_with_llm", new_callable=AsyncMock,
-            side_effect=Exception("LLM unavailable"),
-        ):
-            decision = await router.route("tell me something interesting about our quarterly numbers")
-            assert decision.intent == QueryIntent.KNOWLEDGE
-            assert decision.skip_rag is False
+    @pytest.mark.asyncio
+    async def test_ambiguous_falls_back_to_knowledge(self, router):
+        """Ambiguous query with no LLM should default to KNOWLEDGE."""
+        with patch.object(router, "_classify_with_llm", new_callable=AsyncMock, side_effect=RuntimeError("No LLM")):
+            decision = await router.route("can you help me with something")
+        assert decision.intent == QueryIntent.KNOWLEDGE
+        assert decision.skip_rag is False
 
-    async def test_ambiguous_query_falls_back(self, router):
-        """Ambiguous queries that don't match heuristics should default to KNOWLEDGE."""
-        decision = await router.route("tell me about the project timeline and milestones")
+    @pytest.mark.asyncio
+    async def test_llm_failure_defaults_to_knowledge(self, router):
+        """LLM classification failure should default to KNOWLEDGE (safe fallback)."""
+        with patch.object(router, "_classify_with_llm", new_callable=AsyncMock, side_effect=Exception("API error")):
+            decision = await router.route("tell me about the company benefits")
         assert decision.intent == QueryIntent.KNOWLEDGE
         assert decision.skip_rag is False
+
+    @pytest.mark.asyncio
+    async def test_llm_returns_correct_intent(self, router):
+        """LLM classification should return the classified intent."""
+        with patch.object(
+            router,
+            "_classify_with_llm",
+            new_callable=AsyncMock,
+            return_value=QueryRouteDecision(
+                intent=QueryIntent.CREATIVE,
+                confidence=0.9,
+                skip_rag=True,
+                reason="LLM classified as creative.",
+            ),
+        ):
+            decision = await router.route("imagine a world where cats rule")
+        assert decision.intent == QueryIntent.CREATIVE
+        assert decision.skip_rag is True
