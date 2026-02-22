Now I have all the context needed. Let me produce the section content.

# Section 07: RAG Executor Integration

## Overview

This section replaces the stub in `rag_executor.py` with a full implementation that wires together every component built in sections 01 through 06 into the production execution path. The executor bridges the in-memory `HybridRAGEngine` with database-backed storage, loads chunks from PostgreSQL, applies scope-based filtering, invokes the retrieval pipeline (hybrid search, reranking, guardrails), and returns real documents with citations, quality assessment, and metadata. It also respects the tenant's `rag_failure_mode` setting.

**Dependencies on prior sections (reference only):**

- **Section 01 (ACL Schema):** `allowed_scopes` column on `LibraryChunk`, `compute_effective_scopes()` in `scope_engine.py`
- **Section 02 (Scope Propagation):** Scope propagation ensures `allowed_scopes` on chunks and vector stores are current
- **Section 03 (Smart Chunking):** `is_parent` and `parent_chunk_id` columns on `LibraryChunk`; child chunks used for retrieval, parent chunks for context expansion
- **Section 04 (Hybrid Search):** `filters` parameter implemented in `bm25_retriever.py` and `vector_retriever.py`; scope injection in `HybridRAGEngine.retrieve()`
- **Section 05 (Reranking):** `RerankStrategy` enum with fallback chain in `reranker.py`; post-reranking scope verification
- **Section 06 (Guardrails & Citations):** `RetrievalGuardrails`, `QualityAssessment`, `QueryRouter`, citation fields on `Document` and `RAGResult`, `get_context_with_citations()`

---

## Files to Create or Modify

| File | Action |
|------|--------|
| `/home/dev/projects/SmartSpecPro/python-backend/app/orchestrator/node_executors/rag_executor.py` | **Replace** stub with full implementation |
| `/home/dev/projects/SmartSpecPro/python-backend/tests/orchestrator/rag/test_rag_executor.py` | **Create** unit tests |
| `/home/dev/projects/SmartSpecPro/python-backend/tests/orchestrator/rag/test_e2e_scope.py` | **Create** integration tests |

---

## Tests (Write First)

### Unit Tests: `/home/dev/projects/SmartSpecPro/python-backend/tests/orchestrator/rag/test_rag_executor.py`

```python
"""
Tests for RAG Executor — Phase 4.4.

Validates that the executor:
1. Queries libraryChunks from PostgreSQL (not mock data)
2. Loads chunks into HybridRAGEngine for the query lifecycle
3. Uses effective_scopes from extra_data for filtering
4. Returns real documents with citations and quality assessment
5. Respects tenant's rag_failure_mode setting
6. Creates AsyncSession scoped to request lifecycle
"""

import pytest
from unittest.mock import AsyncMock, MagicMock, patch, PropertyMock
from dataclasses import dataclass

from app.orchestrator.node_executors.base import ExecutionContext, NodeExecutionData
from app.orchestrator.node_executors.rag_executor import RAGExecutor


@pytest.fixture
def executor():
    """Create a RAGExecutor instance."""
    return RAGExecutor()


@pytest.fixture
def base_context():
    """Create a minimal ExecutionContext with effective_scopes."""
    return ExecutionContext(
        user_id=42,
        tenant_id="tenant-abc",
        workflow_id="wf-1",
        execution_id="exec-1",
        credits_available=100,
        extra_data={
            "effective_scopes": ["u:42", "g:10", "t:tenant-abc", "p:global"],
            "user_token": "test-token",
        },
    )


@pytest.fixture
def base_data():
    """Create a minimal NodeExecutionData with a query."""
    return NodeExecutionData(
        node_id="rag-node-1",
        node_type="rag_query",
        config={"top_k": 5, "mode": "hybrid"},
        inputs={"query": "What is our refund policy?"},
        state={},
    )


class TestRAGExecutorQueryFromDB:
    """Test: executor queries libraryChunks from PostgreSQL (not mock data)."""

    # Test: executor creates an AsyncSession and queries LibraryChunk table
    # filtered by tenant_id from context.tenant_id. Verify the SELECT query
    # targets library_chunks with tenant_id filter and is_parent=False (only
    # child chunks are loaded for retrieval). Mock the session and assert
    # that session.execute() was called with the correct query shape.

    @pytest.mark.asyncio
    async def test_queries_chunks_from_db(self, executor, base_context, base_data):
        """Executor must query LibraryChunk from the database, not return hardcoded data."""
        ...

    @pytest.mark.asyncio
    async def test_only_child_chunks_loaded(self, executor, base_context, base_data):
        """Executor must filter for is_parent=False, loading only child chunks for retrieval."""
        ...


class TestRAGExecutorLoadsIntoEngine:
    """Test: executor loads chunks into HybridRAGEngine for query lifecycle."""

    # Test: After fetching chunks from DB, each chunk is added to the engine
    # via add_document() with correct content, metadata (including chunk_id,
    # parent_doc_id, parent_doc_title, section_heading), tenant_id, and
    # allowed_scopes. The engine should be a fresh instance per request (not
    # a shared singleton), created then cleaned up after the query.

    @pytest.mark.asyncio
    async def test_loads_chunks_into_engine(self, executor, base_context, base_data):
        """Each DB chunk must be added to the engine with correct fields."""
        ...

    @pytest.mark.asyncio
    async def test_engine_is_request_scoped(self, executor, base_context, base_data):
        """Engine should be created fresh per request and cleaned up after."""
        ...


class TestRAGExecutorEffectiveScopes:
    """Test: executor uses effective_scopes from extra_data for filtering."""

    # Test: The executor reads context.extra_data["effective_scopes"] and
    # passes them as the allowed_scopes filter to engine.retrieve(). If
    # effective_scopes is missing from extra_data, the executor should use
    # a safe default of ["u:<user_id>", "p:global"]. Verify the filters dict
    # passed to retrieve() contains both tenant_id and allowed_scopes.

    @pytest.mark.asyncio
    async def test_passes_scopes_to_retrieve(self, executor, base_context, base_data):
        """Effective scopes from extra_data must be passed as filters to retrieve()."""
        ...

    @pytest.mark.asyncio
    async def test_missing_scopes_uses_safe_default(self, executor, base_context, base_data):
        """When effective_scopes is absent, default to ['u:<user_id>', 'p:global']."""
        base_context.extra_data.pop("effective_scopes", None)
        ...


class TestRAGExecutorReturnsRealResults:
    """Test: executor returns real documents with citations and quality assessment."""

    # Test: The return dict must contain "documents" (list of dicts with text,
    # score, chunk_id, parent_doc_title, section_heading, citation_ref),
    # "context" (string with [Source N: ...] citation markers from
    # get_context_with_citations()), "quality" (the QualityAssessment as dict),
    # and "metadata" (total_results, search_mode, retrieval_time_ms, etc.).
    # Must NOT return the hardcoded stub data ("Document 1 content").

    @pytest.mark.asyncio
    async def test_returns_documents_with_citations(self, executor, base_context, base_data):
        """Result must include citation_ref, quality assessment, and real context."""
        ...

    @pytest.mark.asyncio
    async def test_does_not_return_stub_data(self, executor, base_context, base_data):
        """Result must not contain the old hardcoded stub strings."""
        ...


class TestRAGExecutorTenantFailureMode:
    """Test: executor respects tenant's rag_failure_mode setting."""

    # Test: When tenant settings contain rag_failure_mode="strict" and the
    # quality assessment is LOW or FAILED, the executor should return a
    # refusal response with no document content. When rag_failure_mode=
    # "permissive" and quality is LOW, the executor returns results with a
    # caveat. Default is "permissive" for general tenants. The failure mode
    # is read from the Tenant.settings JSON column via DB query.

    @pytest.mark.asyncio
    async def test_strict_mode_refuses_on_low_quality(self, executor, base_context, base_data):
        """Strict failure mode must refuse answer when quality is LOW."""
        ...

    @pytest.mark.asyncio
    async def test_permissive_mode_warns_on_low_quality(self, executor, base_context, base_data):
        """Permissive failure mode must return results with caveat for LOW quality."""
        ...

    @pytest.mark.asyncio
    async def test_default_failure_mode_is_permissive(self, executor, base_context, base_data):
        """When rag_failure_mode is not set in tenant settings, default to permissive."""
        ...


class TestRAGExecutorSessionLifecycle:
    """Test: executor creates AsyncSession scoped to request lifecycle."""

    # Test: The executor uses get_db_context() (the context manager from
    # database.py) to obtain an AsyncSession. The session is opened at the
    # start of execute() and closed when execute() returns (even on error).
    # Verify by mocking get_db_context and asserting __aenter__ and __aexit__
    # were called.

    @pytest.mark.asyncio
    async def test_session_opened_and_closed(self, executor, base_context, base_data):
        """AsyncSession must be opened at start and closed at end of execute()."""
        ...

    @pytest.mark.asyncio
    async def test_session_closed_on_error(self, executor, base_context, base_data):
        """AsyncSession must be closed even if an error occurs during execution."""
        ...
```

### Integration Tests: `/home/dev/projects/SmartSpecPro/python-backend/tests/orchestrator/rag/test_e2e_scope.py`

```python
"""
End-to-end scope enforcement integration tests — Phase 4.4.

These tests verify the full pipeline: query through executor with scope
filtering, reranking, and guardrails. Requires prior sections' components.
"""

import pytest
from unittest.mock import AsyncMock, MagicMock, patch

from app.orchestrator.node_executors.base import ExecutionContext, NodeExecutionData
from app.orchestrator.node_executors.rag_executor import RAGExecutor


@pytest.mark.integration
class TestE2EScopeEnforcement:
    """End-to-end tests for scope enforcement through the full RAG pipeline."""

    # Test: full pipeline query through guardrails never returns cross-tenant docs.
    # Set up two tenants with separate documents. Run a query as tenant A.
    # Assert no documents from tenant B appear in results. Mock the DB to
    # return chunks from both tenants, verify executor filters correctly.

    @pytest.mark.asyncio
    async def test_no_cross_tenant_documents_in_results(self):
        """Query as tenant A must never return tenant B's documents."""
        ...

    # Test: full pipeline with scope filtering + reranking + guardrails produces
    # correct results. Set up a user with specific scopes, documents with
    # various allowed_scopes. Run through executor. Assert only scope-matching
    # documents appear and quality assessment is present.

    @pytest.mark.asyncio
    async def test_full_pipeline_respects_scopes_and_produces_quality(self):
        """Full pipeline must respect scopes and include quality assessment."""
        ...
```

---

## Implementation Details

### Current State of `rag_executor.py`

The file at `/home/dev/projects/SmartSpecPro/python-backend/app/orchestrator/node_executors/rag_executor.py` is a 25-line stub. It:
- Accepts `NodeExecutionData` and `ExecutionContext` (see base classes below)
- Reads `data.inputs["query"]`
- Returns hardcoded mock data: two fake documents, a concatenated context string, and static metadata

This must be replaced entirely.

### Base Classes (Already Exist)

From `/home/dev/projects/SmartSpecPro/python-backend/app/orchestrator/node_executors/base.py`:

```python
@dataclass
class ExecutionContext:
    user_id: int
    tenant_id: str | None
    workflow_id: str
    execution_id: str
    credits_available: int = 0
    extra_data: dict[str, Any] = field(default_factory=dict)

@dataclass
class NodeExecutionData:
    node_id: str
    node_type: str
    config: dict[str, Any]   # Node configuration
    inputs: dict[str, Any]   # Resolved input values
    state: dict[str, Any]    # Execution state (outputs from previous nodes)
```

The `extra_data` dict on `ExecutionContext` is where the calling framework passes pre-computed `effective_scopes` (a list of scope strings like `["u:42", "g:10", "t:tenant-abc", "p:global"]`). The calling code (the node executor framework in `node_adapter.py`) is responsible for computing these scopes via `compute_effective_scopes()` from section 01 and passing them through.

### Database Access Pattern

The executor needs an `AsyncSession` to query chunks from PostgreSQL. Use the existing `get_db_context()` from `/home/dev/projects/SmartSpecPro/python-backend/app/core/database.py`:

```python
from app.core.database import get_db_context

# Usage:
async with get_db_context() as session:
    result = await session.execute(query)
```

This returns an `AsyncSession` scoped to the `async with` block. The session is automatically closed when the block exits, even on error.

### Replacement Implementation: `rag_executor.py`

The new `RAGExecutor.execute()` method must perform these steps in order:

**Step 1: Extract inputs and config.**
- Read `query` from `data.inputs`
- Read `top_k` from `data.config` (default 5)
- Read `mode` from `data.config` (default "hybrid")
- Read `effective_scopes` from `context.extra_data` (default to `["u:<user_id>", "p:global"]`)
- Validate that `context.tenant_id` is present (hard requirement, return error if missing)

**Step 2: Open an AsyncSession and query chunks from PostgreSQL.**
- Use `get_db_context()` to obtain a session
- Query `LibraryChunk` (from `app.models.library`) filtered by:
  - `tenant_id = context.tenant_id`
  - `is_parent = False` (only child chunks are used for retrieval; section 03 adds this column)
  - Optionally limit by `library_item_id` if specified in `data.config`
- Also load the parent `LibraryItem` for each chunk (to get `title`, `item_type`, `visibility`)
- If no chunks are found, return an empty result with FAILED quality

**Step 3: Query tenant settings for `rag_failure_mode`.**
- Query the `Tenant` model (from `app.models.tenant`) by `context.tenant_id`
- Read `tenant.settings.get("rag_failure_mode", "permissive")` from the JSON settings column
- Enterprise tenants default to `"strict"`, general tenants default to `"permissive"`

**Step 4: Instantiate `HybridRAGEngine` with proper config.**
- Create a `RAGConfig` from `data.config` (mode, top_k, etc.)
- Create a fresh `HybridRAGEngine(config=config)` for this request
- This is a request-scoped instance, not a long-lived singleton

**Step 5: Load chunks into the engine.**
- For each child chunk from the DB, call `engine.add_document()` with:
  - `content`: the chunk's text content
  - `metadata`: a dict containing `chunk_id`, `parent_doc_id` (from `library_item_id`), `parent_doc_title` (from the joined `LibraryItem.title`), `section_heading` (from chunk's `metadata_json.get("section_heading", "")`), `allowed_scopes` (from chunk's `allowed_scopes` column added in section 01), `tenant_id`
  - `source_type`: the item's `item_type`
  - `source_id`: str of the chunk's `library_item_id`
  - `doc_id`: str of the chunk's `id` or `vector_ref_id`

**Step 6: Retrieve with scope filters.**
- Call `engine.retrieve()` with:
  - `query`: the user's query
  - `top_k`: from config
  - `mode`: the `SearchMode` enum value
  - `filters`: `{"tenant_id": context.tenant_id, "allowed_scopes": effective_scopes}`
  - `user_id`: `context.user_id` (for credit billing)
- This invokes the full pipeline: query processing (section 04), BM25 + vector retrieval with scope filtering (section 04), RRF fusion, reranking with scope verification (section 05)

**Step 7: Apply guardrails and quality assessment.**
- Import `RetrievalGuardrails` from `app.orchestrator.rag.guardrails` (section 06)
- Create an instance and call `guardrails.assess(rag_result)` to get a `QualityAssessment`
- Check the quality against the tenant's `rag_failure_mode`:
  - If `strict` and quality is `LOW` or `FAILED`: return a refusal response with no document content; do not include document titles in the response (metadata leakage prevention from section 06, phase 4.5)
  - If `permissive` and quality is `FAILED`: return refusal
  - If `permissive` and quality is `LOW`: return results with caveat prefix
  - Otherwise: return results normally

**Step 8: Build response.**
- Build the return dict with:
  - `documents`: list of dicts, each with `text`, `score`, `chunk_id`, `parent_doc_title`, `section_heading`, `citation_ref` (from `Document.citation_ref()` added in section 06)
  - `context`: string from `rag_result.get_context_with_citations()` (the citation-annotated context from section 06)
  - `quality`: the `QualityAssessment` serialized as a dict (quality level, confidence_score, recommended_action, explanation)
  - `metadata`: `total_results`, `search_mode`, `retrieval_time_ms`, `rerank_time_ms`, `total_time_ms`, `bm25_candidates`, `vector_candidates`

**Step 9: Clean up.**
- Call `engine.cleanup()` to release in-memory data
- The AsyncSession is automatically closed by the `async with` block

### Method Signature

The `execute()` method signature remains unchanged to satisfy the `NodeExecutor` protocol:

```python
async def execute(
    self,
    data: NodeExecutionData,
    context: ExecutionContext,
) -> dict:
```

### Error Handling

- If `context.tenant_id` is `None`, return `{"documents": [], "context": "", "quality": {"quality": "failed", ...}, "metadata": {"error": "tenant_id is required"}}`
- If the database query fails, log the error and return a FAILED quality response with no documents
- If `HybridRAGEngine` raises during retrieval, catch the exception, log it, and return a FAILED response
- Always ensure `engine.cleanup()` runs (use try/finally)

### Import Map

The executor needs these imports:

```python
from app.orchestrator.node_executors.base import ExecutionContext, NodeExecutionData
from app.core.database import get_db_context
from app.models.library import LibraryChunk, LibraryItem
from app.models.tenant import Tenant
from app.orchestrator.rag.hybrid_rag import HybridRAGEngine, RAGConfig, SearchMode, Document
from app.orchestrator.rag.guardrails import RetrievalGuardrails, RetrievalQuality
from sqlalchemy import select
from sqlalchemy.orm import selectinload
import structlog
```

### Key Architectural Decisions

1. **Request-scoped engine**: A new `HybridRAGEngine` is created per `execute()` call and cleaned up after. This avoids cross-request state leakage and ensures scope filters are always fresh. The in-memory nature of the BM25/Vector retrievers means the engine is loaded with only the current tenant's chunks for that query.

2. **Chunks loaded per query**: The executor loads all non-parent chunks for the tenant from the database. For tenants with very large document collections, this should be paginated or limited in a future optimization. For now, loading all child chunks is acceptable because the retrieval and filtering steps handle relevance ranking.

3. **Effective scopes pre-computed**: The executor does **not** call `compute_effective_scopes()` itself. The calling framework (node adapter) pre-computes them and passes via `extra_data["effective_scopes"]`. This keeps the executor focused on retrieval, and avoids a second DB round-trip for group membership queries.

4. **Tenant failure mode from DB**: The executor queries the `Tenant` model for `settings["rag_failure_mode"]` on each request. This allows tenant admins to change the failure mode without restarting the service. The Tenant query is cheap (single row by PK).

5. **Metadata leakage prevention**: When quality is FAILED or LOW in strict mode, the response must not include document titles, section headings, or any hints about what documents exist. The `documents` list is returned empty and `context` is a generic refusal message.

### Example Return Value (Successful Retrieval)

```python
{
    "documents": [
        {
            "text": "Our refund policy allows returns within 30 days...",
            "score": 0.87,
            "chunk_id": "chunk-123",
            "parent_doc_title": "Company Policies v2.3",
            "section_heading": "Refund and Returns",
            "citation_ref": "[Company Policies v2.3 -- S Refund and Returns]",
        },
        # ... more documents
    ],
    "context": "[Source 1: Company Policies v2.3 -- S Refund and Returns]\nOur refund policy allows returns within 30 days...\n\n---\n\n[Source 2: FAQ Document]...",
    "quality": {
        "quality": "high",
        "confidence_score": 0.87,
        "top_score": 0.92,
        "avg_score": 0.78,
        "doc_count": 3,
        "recommended_action": "proceed",
        "explanation": "Multiple highly relevant documents found.",
    },
    "metadata": {
        "total_results": 3,
        "search_mode": "hybrid",
        "retrieval_time_ms": 145,
        "rerank_time_ms": 52,
        "total_time_ms": 210,
        "bm25_candidates": 8,
        "vector_candidates": 12,
    },
}
```

### Example Return Value (Strict Mode Refusal)

```python
{
    "documents": [],
    "context": "No relevant information was found to answer this query.",
    "quality": {
        "quality": "failed",
        "confidence_score": 0.0,
        "top_score": 0.0,
        "avg_score": 0.0,
        "doc_count": 0,
        "recommended_action": "refuse_answer",
        "explanation": "No documents passed the quality threshold.",
    },
    "metadata": {
        "total_results": 0,
        "search_mode": "hybrid",
        "retrieval_time_ms": 95,
        "total_time_ms": 100,
        "failure_mode": "strict",
    },
}
```

---

## Implementation Checklist

1. Write `test_rag_executor.py` with all test classes and methods described above
2. Write `test_e2e_scope.py` with integration test stubs
3. Replace the stub in `rag_executor.py` with the full implementation following the 9-step flow
4. Run `cd /home/dev/projects/SmartSpecPro/python-backend && pytest tests/orchestrator/rag/test_rag_executor.py -v` to verify unit tests pass
5. Run `cd /home/dev/projects/SmartSpecPro/python-backend && pytest tests/orchestrator/rag/test_e2e_scope.py -v -m integration` to verify integration tests pass
6. Run `cd /home/dev/projects/SmartSpecPro/python-backend && pytest tests/orchestrator/rag/ -v` to verify no regressions in existing RAG tests
7. Run `cd /home/dev/projects/SmartSpecPro/python-backend && pytest --cov=app/orchestrator/node_executors/rag_executor --cov-fail-under=80` to verify coverage

---

## Actual Implementation Notes

### Files Created/Modified
- `python-backend/app/orchestrator/node_executors/rag_executor.py` — Full replacement of 25-line stub with ~180-line implementation
- `python-backend/tests/orchestrator/rag/test_rag_executor.py` — 15 unit tests across 7 test classes
- `python-backend/tests/orchestrator/rag/test_e2e_scope.py` — 2 integration tests

### Deviations from Plan
- Added `TestRAGExecutorEdgeCases` class (not in plan) with tests for missing tenant_id and no-chunks scenarios
- Total test count: 17 (plan specified ~14 across 6 classes)

### Code Review Fixes Applied
- **H1**: Sanitized error response — `_failed_response` no longer leaks raw exception strings; uses generic "internal retrieval error"
- **H2**: Enterprise tenants now default to `rag_failure_mode="strict"` based on `tenant.plan.value == "enterprise"`
- **H3**: Removed unused `import time`
- **M1**: `citations` list from `get_context_with_citations()` now included in response dict
- **M3**: Added query length validation (empty or >10000 chars rejected before DB access)
- **M4**: Added `MAX_CHUNKS = 10000` hard ceiling with `.limit()` on chunk query and warning log

### Test Results
- 17 new tests (15 unit + 2 integration): all passing
- 225 total RAG tests: all passing, zero regressions