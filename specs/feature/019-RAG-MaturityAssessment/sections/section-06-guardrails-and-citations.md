Now I have a comprehensive understanding of the codebase and what this section needs. Let me generate the section content.

# Section 06: Guardrails and Citations

## Overview

This section implements Phase 4.1-4.3 and 4.5 of the RAG Maturity Upgrade: the production RAG hardening layer. It introduces three new modules -- `guardrails.py` (retrieval quality assessment with tenant-configurable failure modes), citation tracking on `Document` and `RAGResult`, and `query_router.py` (intent classification to skip RAG for non-knowledge queries). It also adds metadata leakage prevention for FAILED/LOW quality responses.

**Depends on**: Section 05 (reranking) -- the guardrails layer sits downstream of reranking in the pipeline and expects `Document` objects with populated `rerank_score` and `final_score` fields.

**Blocks**: Section 07 (rag-executor) -- the executor integrates guardrails, citations, and query routing into the production execution path.

---

## Files Created

| File | Purpose |
|------|---------|
| `/home/dev/projects/SmartSpecPro/python-backend/app/orchestrator/rag/guardrails.py` | `RetrievalGuardrails`, `RetrievalQuality` enum, `QualityAssessment` dataclass |
| `/home/dev/projects/SmartSpecPro/python-backend/app/orchestrator/rag/query_router.py` | `QueryRouter`, `QueryIntent` enum, `QueryRouteDecision` dataclass |
| `/home/dev/projects/SmartSpecPro/python-backend/tests/orchestrator/rag/test_guardrails.py` | Tests for guardrails quality assessment and failure modes |
| `/home/dev/projects/SmartSpecPro/python-backend/tests/orchestrator/rag/test_citations.py` | Tests for citation generation and context formatting |
| `/home/dev/projects/SmartSpecPro/python-backend/tests/orchestrator/rag/test_query_router.py` | Tests for query intent classification |

## Files Modified

| File | Change |
|------|--------|
| `/home/dev/projects/SmartSpecPro/python-backend/app/orchestrator/rag/hybrid_rag.py` | Add citation fields to `Document` and `RAGResult`; add `get_context_with_citations()` method |
| `/home/dev/projects/SmartSpecPro/python-backend/app/orchestrator/rag/__init__.py` | Export new classes: `RetrievalGuardrails`, `RetrievalQuality`, `QualityAssessment`, `QueryRouter`, `QueryIntent` |

---

## Tests (Write First)

All tests use pytest with `pytest-asyncio`. Tests should be created before the implementation code.

### Test File: `/home/dev/projects/SmartSpecPro/python-backend/tests/orchestrator/rag/test_guardrails.py`

```python
"""Tests for RetrievalGuardrails — quality assessment and tenant failure modes."""

import pytest
from app.orchestrator.rag.guardrails import (
    RetrievalGuardrails,
    RetrievalQuality,
    QualityAssessment,
)
from app.orchestrator.rag.hybrid_rag import Document, RAGResult, SearchMode


class TestRetrievalQuality:
    """Tests for the RetrievalQuality enum values."""

    # Test: enum has HIGH, MEDIUM, LOW, FAILED members
    # Test: string values match expected ("high", "medium", "low", "failed")


class TestQualityAssessment:
    """Tests for QualityAssessment dataclass."""

    # Test: all fields present — quality, confidence_score, top_score, avg_score,
    #       doc_count, recommended_action, explanation


class TestGuardrailsAssess:
    """Tests for RetrievalGuardrails.assess() method."""

    @pytest.fixture
    def guardrails_strict(self):
        """Guardrails configured for strict (enterprise) mode."""
        return RetrievalGuardrails(failure_mode="strict")

    @pytest.fixture
    def guardrails_permissive(self):
        """Guardrails configured for permissive (general) mode."""
        return RetrievalGuardrails(failure_mode="permissive")

    # Test: empty RAGResult (no documents) -> FAILED quality assessment
    # Test: all document scores below 0.15 -> FAILED
    # Test: scores in range 0.15-0.4 -> LOW quality
    # Test: scores in range 0.4-0.7 -> MEDIUM quality
    # Test: scores >= 0.7 with multiple docs -> HIGH quality
    # Test: strict mode + LOW quality -> recommended_action = "refuse_answer"
    # Test: permissive mode + LOW quality -> recommended_action = "warn_user"
    # Test: strict mode + FAILED -> recommended_action = "refuse_answer"
    # Test: permissive mode + FAILED -> recommended_action = "refuse_answer"
    # Test: confidence_score is a float between 0.0 and 1.0
    # Test: doc_count reflects the number of documents in the RAGResult
    # Test: explanation is a non-empty string describing the assessment


class TestGuardrailsSystemPrompt:
    """Tests for build_system_prompt_suffix()."""

    # Test: HIGH quality -> suffix instructs LLM to answer from context only and cite sources
    # Test: MEDIUM quality (permissive) -> suffix warns about potential incompleteness
    # Test: LOW quality (permissive) -> suffix instructs prefixing uncertain parts
    # Test: FAILED or LOW (strict) -> suffix says no relevant info found, do NOT use training data
    # Test: suffix is a non-empty string for every quality level


class TestGuardrailsCustomThresholds:
    """Tests for tenant-configurable score thresholds."""

    # Test: custom thresholds override defaults (e.g., high_threshold=0.8 instead of 0.7)
    # Test: custom thresholds passed via constructor kwargs
```

### Test File: `/home/dev/projects/SmartSpecPro/python-backend/tests/orchestrator/rag/test_citations.py`

```python
"""Tests for citation tracking on Document and RAGResult."""

import pytest
from app.orchestrator.rag.hybrid_rag import Document, RAGResult, SearchMode


class TestDocumentCitationRef:
    """Tests for Document.citation_ref() method."""

    # Test: document with parent_doc_title and section_heading returns
    #       "[Title - section Section]" format
    # Test: document with parent_doc_title but no section_heading returns "[Title]" only
    # Test: document with neither title nor heading returns "[Unknown Source]" or similar fallback
    # Test: citation_ref returns a string


class TestRAGResultGetContextWithCitations:
    """Tests for RAGResult.get_context_with_citations() method."""

    # Test: context includes [Source 1: Title - section Section] markers inline
    # Test: citations list has one entry per unique source document
    # Test: citations are ordered by their first appearance in context
    # Test: multiple documents from the same parent doc produce distinct citations
    #       if they have different section headings
    # Test: max_tokens is respected (same behavior as existing get_context)
    # Test: empty documents list returns empty context and empty citations list


class TestDocumentCitationFields:
    """Tests for new citation-related fields on Document."""

    # Test: Document has chunk_id field (default None)
    # Test: Document has parent_doc_id field (default None)
    # Test: Document has parent_doc_title field (default None)
    # Test: Document has section_heading field (default None)
    # Test: to_dict() includes the new citation fields
```

### Test File: `/home/dev/projects/SmartSpecPro/python-backend/tests/orchestrator/rag/test_query_router.py`

```python
"""Tests for QueryRouter — intent classification to skip/invoke RAG."""

import pytest
from unittest.mock import AsyncMock, patch
from app.orchestrator.rag.query_router import QueryRouter, QueryIntent, QueryRouteDecision


class TestQueryIntent:
    """Tests for the QueryIntent enum."""

    # Test: enum has KNOWLEDGE, CONVERSATIONAL, CREATIVE members
    # Test: string values match expected ("knowledge", "conversational", "creative")


class TestQueryRouteDecision:
    """Tests for QueryRouteDecision dataclass."""

    # Test: has fields intent, confidence, skip_rag (bool), reason (str)


class TestQueryRouterHeuristics:
    """Tests for fast regex/heuristic routing (no LLM call)."""

    @pytest.fixture
    def router(self):
        """Create a QueryRouter instance."""
        return QueryRouter()

    # Test: "hello" -> CONVERSATIONAL (skip RAG)
    # Test: "hi" -> CONVERSATIONAL (skip RAG)
    # Test: "thanks" / "thank you" -> CONVERSATIONAL (skip RAG)
    # Test: "good morning" -> CONVERSATIONAL (skip RAG)
    # Test: "write me a poem" -> CREATIVE (skip RAG)
    # Test: "write a story about" -> CREATIVE (skip RAG)
    # Test: "what does the policy say about X" -> KNOWLEDGE (needs RAG)
    # Test: "explain the process for Y" -> KNOWLEDGE (needs RAG)
    # Test: "how does Z work" -> KNOWLEDGE (needs RAG)
    # Test: skip_rag is True for CONVERSATIONAL and CREATIVE, False for KNOWLEDGE


class TestQueryRouterLLMFallback:
    """Tests for LLM classification of ambiguous queries."""

    @pytest.fixture
    def router(self):
        """Create a QueryRouter instance."""
        return QueryRouter()

    # Test: ambiguous query that does not match any heuristic falls back to LLM classification
    # Test: LLM classification failure defaults to KNOWLEDGE (safe fallback)
    # Test: LLM classification returns correct intent for edge-case queries


class TestMetadataLeakagePrevention:
    """Tests for metadata leakage prevention on FAILED/LOW quality responses."""

    # Test: FAILED quality response does not include document titles in output
    # Test: LOW quality response in strict mode does not hint at document existence
    # Test: the explanation field in QualityAssessment for FAILED does not leak doc metadata
```

---

## Implementation Details

### 1. Guardrails Module: `/home/dev/projects/SmartSpecPro/python-backend/app/orchestrator/rag/guardrails.py`

This is a new file. It contains three components:

**`RetrievalQuality` enum** with four quality levels:
- `HIGH` -- score >= 0.7, multiple relevant docs. Pipeline proceeds normally.
- `MEDIUM` -- score 0.4-0.7. Partial confidence.
- `LOW` -- score 0.15-0.4. Very limited information.
- `FAILED` -- no docs or all below 0.15. Nothing useful retrieved.

**`QualityAssessment` dataclass** containing:
- `quality: RetrievalQuality` -- the assessed quality level
- `confidence_score: float` -- overall confidence (0.0 to 1.0)
- `top_score: float` -- the highest document score in the result set
- `avg_score: float` -- the average document score
- `doc_count: int` -- number of documents in the result
- `recommended_action: str` -- one of `"proceed"`, `"warn_user"`, `"refuse_answer"`
- `explanation: str` -- human-readable explanation of the assessment

**`RetrievalGuardrails` class** with constructor parameters:
- `failure_mode: str` -- `"strict"` (default for enterprise) or `"permissive"` (default for general users)
- `high_threshold: float = 0.7` -- minimum score for HIGH quality
- `medium_threshold: float = 0.4` -- minimum score for MEDIUM quality
- `low_threshold: float = 0.15` -- minimum score for LOW quality (below this is FAILED)

Methods:

`assess(self, rag_result: RAGResult) -> QualityAssessment`
- If `rag_result.documents` is empty, return `FAILED` immediately.
- Compute `top_score` from the highest `final_score` among all documents.
- Compute `avg_score` from the mean of all `final_score` values.
- Determine quality level from `top_score` against thresholds.
- Determine `recommended_action`:
  - `HIGH` or `MEDIUM` in either mode: `"proceed"`
  - `MEDIUM` in strict mode: `"proceed"` (still sufficient)
  - `LOW` in permissive mode: `"warn_user"`
  - `LOW` in strict mode: `"refuse_answer"`
  - `FAILED` in either mode: `"refuse_answer"`
- Compute `confidence_score` as a normalized value (e.g., `top_score` clamped to [0, 1]).
- Generate `explanation` string.

`build_system_prompt_suffix(self, assessment: QualityAssessment) -> str`
- Returns a string appended to the system prompt to guide LLM behavior based on quality:
  - **HIGH**: `"Answer based ONLY on the provided context. Cite sources."`
  - **MEDIUM** (permissive): `"Context may be incomplete. Clearly state uncertainty."`
  - **LOW** (permissive): `"Very limited information found. Prefix uncertain parts with 'Based on limited information:'"`
  - **FAILED** or **LOW** (strict): `"No relevant information found. Do NOT answer from training data."`

**Metadata leakage prevention**: When quality is `FAILED` or `LOW` in strict mode, the `explanation` field and any system prompt suffix must NOT include document titles, chunk IDs, or any information that hints at the existence of inaccessible documents. The explanation should be generic, e.g., "No relevant information was found in the knowledge base." Audit logging (via structlog) should record the attempted access details separately for internal review, but this information is never surfaced to the user.

### 2. Citation Additions to `Document` and `RAGResult`

Modify `/home/dev/projects/SmartSpecPro/python-backend/app/orchestrator/rag/hybrid_rag.py`.

**Add fields to the `Document` dataclass:**

```python
@dataclass
class Document:
    # ... existing fields ...

    # Citation fields (new)
    chunk_id: str | None = None
    parent_doc_id: str | None = None
    parent_doc_title: str | None = None
    section_heading: str | None = None

    def citation_ref(self) -> str:
        """Generate a citation reference string for this document.

        Returns '[Title - section Section]' if both title and section are present,
        '[Title]' if only title is present, or '[Unknown Source]' as fallback.
        """
        ...
```

**Add to `RAGResult`:**

```python
@dataclass
class RAGResult:
    # ... existing fields ...

    # Citation metadata (new)
    citations: list[dict[str, str]] = field(default_factory=list)

    def get_context_with_citations(self, max_tokens: int = 4000) -> tuple[str, list[dict[str, str]]]:
        """Get combined context with inline [Source N: ...] markers.

        Returns:
            Tuple of (context_string, citations_list).
            The context_string has [Source N: Title - section Section] markers
            prepended to each document's content.
            The citations_list contains ordered dicts with keys:
                - "index": the source number (1-based)
                - "title": parent_doc_title
                - "section": section_heading (if any)
                - "doc_id": parent_doc_id
                - "chunk_id": chunk_id
        """
        ...
```

The existing `get_context()` method remains unchanged for backward compatibility. The new `get_context_with_citations()` method is additive.

**Update `to_dict()` on both `Document` and `RAGResult`** to include the new citation fields. Ensure existing consumers that ignore unknown fields are not broken.

### 3. Query Router: `/home/dev/projects/SmartSpecPro/python-backend/app/orchestrator/rag/query_router.py`

This is a new file. It determines whether a query actually requires RAG retrieval.

**`QueryIntent` enum:**
- `KNOWLEDGE = "knowledge"` -- requires RAG retrieval
- `CONVERSATIONAL = "conversational"` -- greetings, meta-questions; skip RAG
- `CREATIVE = "creative"` -- writing/generation tasks; skip RAG

**`QueryRouteDecision` dataclass:**
- `intent: QueryIntent`
- `confidence: float` -- 0.0 to 1.0
- `skip_rag: bool` -- True if RAG should be skipped
- `reason: str` -- human-readable explanation

**`QueryRouter` class:**

```python
class QueryRouter:
    """Lightweight router that classifies query intent to avoid unnecessary RAG retrieval."""

    async def route(self, query: str) -> QueryRouteDecision:
        """Classify the query intent.

        Uses fast heuristics first (regex patterns for greetings, thanks,
        creative prompts). Falls back to LLM classification for ambiguous queries.
        Default assumption: KNOWLEDGE (safe fallback -- extra RAG is cheaper
        than missing relevant context).
        """
        ...
```

**Heuristic patterns** (checked first, no LLM call needed):

Conversational patterns -- regex matching for common greetings and social phrases:
- Greetings: `^(hello|hi|hey|good morning|good afternoon|good evening)\\b`
- Thanks: `^(thanks|thank you|thx|cheers)\\b`
- Meta-questions about the bot itself: `^(who are you|what can you do|how do you work)\\b`

Creative patterns -- regex matching for generation/writing requests:
- `^(write|compose|create|draft|generate)\\s+(me\\s+)?(a\\s+)?(poem|story|essay|song|letter|email)`
- `^(write|tell)\\s+(me\\s+)?a\\s+(joke|riddle)`

If no heuristic matches, check if the query is very short (< 5 words) and purely social. Otherwise, either call a cheap LLM model (gpt-4.1-nano) for classification, or default to `KNOWLEDGE`.

**LLM fallback**: If the LLM call fails for any reason (network, rate limit, etc.), default to `KNOWLEDGE`. This is the safe fallback because an unnecessary RAG retrieval is far less harmful than skipping RAG when the user actually needs information.

### 4. Export Updates: `/home/dev/projects/SmartSpecPro/python-backend/app/orchestrator/rag/__init__.py`

Add imports and exports for the new classes:

```python
from app.orchestrator.rag.guardrails import (
    RetrievalGuardrails,
    RetrievalQuality,
    QualityAssessment,
)
from app.orchestrator.rag.query_router import QueryRouter, QueryIntent

__all__ = [
    # ... existing exports ...
    "RetrievalGuardrails",
    "RetrievalQuality",
    "QualityAssessment",
    "QueryRouter",
    "QueryIntent",
]
```

---

## Quality Assessment Logic (Detailed)

The `assess()` method follows this algorithm:

1. If `len(rag_result.documents) == 0`: return `FAILED` with `confidence_score=0.0`, `recommended_action="refuse_answer"`.
2. Compute `top_score = max(doc.final_score for doc in rag_result.documents)`.
3. Compute `avg_score = mean(doc.final_score for doc in rag_result.documents)`.
4. Determine quality level:
   - If `top_score >= high_threshold` (default 0.7): `HIGH`
   - Elif `top_score >= medium_threshold` (default 0.4): `MEDIUM`
   - Elif `top_score >= low_threshold` (default 0.15): `LOW`
   - Else: `FAILED`
5. Determine action based on quality and failure mode:
   - `HIGH` -> `"proceed"`
   - `MEDIUM` -> `"proceed"` (both modes)
   - `LOW` + `"permissive"` -> `"warn_user"`
   - `LOW` + `"strict"` -> `"refuse_answer"`
   - `FAILED` -> `"refuse_answer"` (both modes)
6. Set `confidence_score = min(top_score, 1.0)`.
7. Set `doc_count = len(rag_result.documents)`.
8. Generate `explanation` -- a sentence describing the assessment without leaking document metadata when quality is `FAILED` or `LOW` in strict mode.

---

## Metadata Leakage Prevention (Detailed)

When the quality assessment is `FAILED` or `LOW` in strict mode:

- The `explanation` field must use generic wording: "No relevant information was found in the knowledge base." or "Very limited relevant information was found."
- Do NOT include: document titles, chunk IDs, section headings, parent document IDs, tenant IDs, scope information, or any other metadata that reveals the existence or nature of documents the user cannot access.
- The `build_system_prompt_suffix()` output for these cases must similarly be generic and not reference specific documents.
- Logging via structlog should record the full details (query, document scores, document IDs, scopes checked) for audit purposes, but this log output is internal-only and never returned in the API response.

For `LOW` quality in permissive mode, document titles MAY be included in citations since the user is allowed to see partial results. The metadata leakage prevention only applies when the response is being refused or the assessment indicates insufficient evidence.

---

## Citation Format Specification

Each document in the result gets a citation marker when `get_context_with_citations()` is called:

```
[Source 1: Project Requirements - section Authentication Flow]
The authentication flow uses JWT tokens with refresh rotation...

---

[Source 2: API Documentation - section Rate Limiting]
Rate limiting is configured at 100 requests per minute...
```

The returned `citations` list:
```python
[
    {
        "index": 1,
        "title": "Project Requirements",
        "section": "Authentication Flow",
        "doc_id": "doc-abc-123",
        "chunk_id": "chunk-def-456",
    },
    {
        "index": 2,
        "title": "API Documentation",
        "section": "Rate Limiting",
        "doc_id": "doc-ghi-789",
        "chunk_id": "chunk-jkl-012",
    },
]
```

Citations are deduplicated by `(parent_doc_id, section_heading)` pair. If two chunks come from the same document and section, they share one citation number. Citation indices are 1-based and ordered by first appearance in the context.

---

## Tenant Configuration

The `failure_mode` setting is stored in the tenant's configuration (accessed via tenant settings in the database). The guardrails module does not read tenant settings directly -- instead, the calling code (the RAG executor in Section 07) passes the `failure_mode` string to the `RetrievalGuardrails` constructor.

Default values:
- Enterprise tenants: `failure_mode="strict"`
- General tenants: `failure_mode="permissive"`

Custom thresholds can also be stored in tenant settings and passed to the constructor:
- `high_threshold` (default: 0.7)
- `medium_threshold` (default: 0.4)
- `low_threshold` (default: 0.15)

---

## Implementation Checklist

1. Write all three test files (`test_guardrails.py`, `test_citations.py`, `test_query_router.py`) with the test stubs described above. Run them to confirm they all fail (red phase).
2. Create `/home/dev/projects/SmartSpecPro/python-backend/app/orchestrator/rag/guardrails.py` with `RetrievalQuality`, `QualityAssessment`, and `RetrievalGuardrails`.
3. Modify `/home/dev/projects/SmartSpecPro/python-backend/app/orchestrator/rag/hybrid_rag.py` to add citation fields to `Document` (`chunk_id`, `parent_doc_id`, `parent_doc_title`, `section_heading`, `citation_ref()`) and to `RAGResult` (`citations`, `get_context_with_citations()`).
4. Create `/home/dev/projects/SmartSpecPro/python-backend/app/orchestrator/rag/query_router.py` with `QueryIntent`, `QueryRouteDecision`, and `QueryRouter`.
5. Update `/home/dev/projects/SmartSpecPro/python-backend/app/orchestrator/rag/__init__.py` to export the new classes.
6. Run all tests. Verify they pass (`pytest python-backend/tests/orchestrator/rag/test_guardrails.py python-backend/tests/orchestrator/rag/test_citations.py python-backend/tests/orchestrator/rag/test_query_router.py -v`).
7. Run the full RAG test suite to ensure no regressions: `pytest python-backend/tests/orchestrator/rag/ -v`.
8. Verify coverage meets the 80% threshold on the new files.

---

## Actual Implementation Summary

### Files Created
| File | Lines | Tests |
|------|-------|-------|
| `python-backend/app/orchestrator/rag/guardrails.py` | ~170 | 22 tests |
| `python-backend/app/orchestrator/rag/query_router.py` | ~115 | 14 tests |
| `python-backend/tests/orchestrator/rag/test_guardrails.py` | ~316 | — |
| `python-backend/tests/orchestrator/rag/test_citations.py` | ~168 | 14 tests |
| `python-backend/tests/orchestrator/rag/test_query_router.py` | ~130 | — |

### Files Modified
| File | Change |
|------|--------|
| `python-backend/app/orchestrator/rag/hybrid_rag.py` | Added 4 citation fields to Document, `citation_ref()`, `citations` field + `get_context_with_citations()` to RAGResult, updated `to_dict()` |
| `python-backend/app/orchestrator/rag/__init__.py` | Added exports for `RetrievalGuardrails`, `RetrievalQuality`, `QualityAssessment`, `QueryRouter`, `QueryIntent` |

### Test Results
- 58 new tests (22 guardrails + 14 citations + 14 query router + 8 enum/dataclass)
- 210 total RAG tests passing, 0 failures

### Deviations from Plan
1. **failure_mode validation**: Added `ValueError` on invalid `failure_mode` values (code review G07).
2. **Explanation strings**: Removed raw numeric scores from user-facing explanations to prevent metadata leakage (code review G01).
3. **Citation dedup key**: Uses `doc_id` as fallback when `parent_doc_id` is None to prevent untagged documents from collapsing into a single citation (code review G04).
4. **Conversational pattern guard**: Added word-count check (< 8 words) to prevent misclassifying "Hi, what is the refund policy?" as conversational (code review G05).
5. **MEDIUM system prompt suffix**: Removed dead if/else duplication — both strict and permissive modes use the same MEDIUM suffix (code review G02).
6. **LLM classification stub**: `_classify_with_llm` returns None; deferred to Section 07 as planned.