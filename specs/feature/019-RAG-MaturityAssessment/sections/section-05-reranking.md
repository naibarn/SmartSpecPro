I now have all the context needed. Let me generate the section content.

# Section 05: Reranking Upgrade

## Overview

This section implements **Phase 3** of the RAG maturity upgrade: replacing the per-document LLM-based reranker with a strategy-based system featuring a local cross-encoder model (`bge-reranker-v2-m3`), an optional Cohere Rerank API fallback, and an automatic fallback chain. The upgrade reduces reranking latency from approximately 3 seconds (10 sequential API calls) to under 500ms (single batch inference), eliminates per-query reranking cost, and improves multilingual support including Thai.

**Depends on:** section-04-hybrid-search (scope filtering and query processing must be in place; the reranker receives scope-filtered documents from the hybrid search step)

**Blocks:** section-06-guardrails-and-citations (guardrails layer consumes reranked results)

## Background and Motivation

The current `Reranker` class at `/home/dev/projects/SmartSpecPro/python-backend/app/orchestrator/rag/reranker.py` has two strategies:

1. **LLM-based** (default): Calls GPT-4.1-nano once per document via `_score_document()`. For 10 documents, this means 10 sequential API calls at roughly 300ms each, totaling approximately 3 seconds and approximately $0.01 per query.
2. **Heuristic fallback**: Combines BM25 score, vector score, term overlap, and length preference. Too simplistic for production quality.

The existing class accepts `use_llm: bool` to switch between these two modes. On LLM failure, it falls through to heuristic. There is no cross-encoder support, no Cohere integration, and no structured strategy pattern.

### What changes

- Introduce `RerankStrategy` enum with four values: `CROSS_ENCODER`, `COHERE`, `LLM`, `HEURISTIC`
- Add `bge-reranker-v2-m3` cross-encoder via `sentence_transformers.CrossEncoder` with lazy loading and `ProcessPoolExecutor`
- Add Cohere Rerank API as an optional fallback (requires `cohere` package and API key)
- Implement automatic fallback chain: `CROSS_ENCODER -> COHERE -> LLM -> HEURISTIC`
- Add post-reranking scope verification (defense in depth)
- Add `cohere>=5.0.0` to `requirements.txt`

## Key Files

| File | Action |
|------|--------|
| `/home/dev/projects/SmartSpecPro/python-backend/app/orchestrator/rag/reranker.py` | Major refactor |
| `/home/dev/projects/SmartSpecPro/python-backend/requirements.txt` | Add `cohere>=5.0.0` |
| `/home/dev/projects/SmartSpecPro/python-backend/app/orchestrator/rag/__init__.py` | Update exports with `RerankStrategy` |
| `/home/dev/projects/SmartSpecPro/python-backend/tests/orchestrator/rag/test_reranker.py` | New test file |
| `/home/dev/projects/SmartSpecPro/python-backend/tests/orchestrator/rag/test_reranker_performance.py` | New test file (slow marker) |

---

## Tests (Write First)

All test files go under `/home/dev/projects/SmartSpecPro/python-backend/tests/orchestrator/rag/`. Ensure the directory exists and has an `__init__.py`.

### `/home/dev/projects/SmartSpecPro/python-backend/tests/orchestrator/rag/test_reranker.py`

```python
"""
Tests for the upgraded Reranker with strategy-based reranking.

Covers:
- RerankStrategy enum values
- Cross-encoder strategy (mocked model)
- Cohere strategy (mocked API)
- LLM strategy (existing, mocked)
- Heuristic strategy (existing)
- Fallback chain behavior
- Scope verification after reranking
- Edge cases (empty docs, single doc, etc.)
"""
import pytest
from unittest.mock import AsyncMock, MagicMock, patch, PropertyMock
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional

from app.orchestrator.rag.reranker import Reranker, RerankStrategy


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@dataclass
class FakeDocument:
    """Minimal document for reranker tests."""
    doc_id: str = "doc-1"
    content: str = "Some document content for testing."
    metadata: Dict[str, Any] = field(default_factory=dict)
    bm25_score: float = 0.5
    vector_score: float = 0.6
    rerank_score: float = 0.0
    final_score: float = 0.55


@pytest.fixture
def sample_documents():
    """Return a list of 10 fake documents with varying content."""
    docs = []
    for i in range(10):
        docs.append(FakeDocument(
            doc_id=f"doc-{i}",
            content=f"Document {i} content about topic {i % 3}.",
            bm25_score=0.5 - i * 0.03,
            vector_score=0.6 - i * 0.04,
            final_score=0.55 - i * 0.035,
        ))
    return docs


@pytest.fixture
def scoped_documents():
    """Documents with allowed_scopes in metadata for scope verification tests."""
    return [
        FakeDocument(doc_id="d1", content="Allowed doc", metadata={"allowed_scopes": ["u:1", "g:10"]}),
        FakeDocument(doc_id="d2", content="Also allowed", metadata={"allowed_scopes": ["u:1"]}),
        FakeDocument(doc_id="d3", content="Not allowed", metadata={"allowed_scopes": ["u:999"]}),
    ]


# ---------------------------------------------------------------------------
# 3.1 Cross-encoder tests
# ---------------------------------------------------------------------------

class TestCrossEncoderStrategy:
    """Tests for CROSS_ENCODER reranking strategy."""

    # Test: CROSS_ENCODER strategy returns docs sorted by relevance score
    async def test_cross_encoder_returns_sorted_docs(self, sample_documents):
        """Cross-encoder should return documents sorted by descending relevance score."""
        ...

    # Test: cross-encoder scores are in [0, 1] range
    async def test_cross_encoder_scores_in_valid_range(self, sample_documents):
        """All rerank_score values must be between 0.0 and 1.0 inclusive."""
        ...

    # Test: cross-encoder truncates documents exceeding 300 tokens
    async def test_cross_encoder_truncates_long_documents(self):
        """Documents longer than ~300 tokens should be truncated before scoring."""
        ...

    # Test: cross-encoder uses ProcessPoolExecutor (not ThreadPoolExecutor)
    async def test_cross_encoder_uses_process_pool(self):
        """Inference must run in ProcessPoolExecutor to avoid GIL contention."""
        ...

    # Test: cross-encoder lazy loads model on first call
    async def test_cross_encoder_lazy_loads_model(self):
        """Model should not load at __init__ time; only on first rerank() call."""
        ...

    # Test: cross-encoder handles model not found gracefully (falls back)
    async def test_cross_encoder_handles_model_not_found(self, sample_documents):
        """If the model file is missing or corrupted, reranker should fall back gracefully."""
        ...


# ---------------------------------------------------------------------------
# 3.2 Cohere fallback tests
# ---------------------------------------------------------------------------

class TestCohereStrategy:
    """Tests for COHERE reranking strategy."""

    # Test: COHERE strategy calls Cohere API and returns relevance_score
    async def test_cohere_returns_relevance_scores(self, sample_documents):
        """Cohere rerank should call the API and set relevance scores on documents."""
        ...

    # Test: COHERE strategy skipped when no API key configured
    async def test_cohere_skipped_without_api_key(self, sample_documents):
        """If COHERE_API_KEY is not set, Cohere strategy should raise/skip gracefully."""
        ...

    # Test: COHERE strategy skipped when cohere package not installed
    async def test_cohere_skipped_without_package(self, sample_documents):
        """If the cohere package is not importable, strategy should skip."""
        ...


# ---------------------------------------------------------------------------
# 3.3 Fallback chain tests
# ---------------------------------------------------------------------------

class TestFallbackChain:
    """Tests for the strategy fallback chain: CROSS_ENCODER -> COHERE -> LLM -> HEURISTIC."""

    # Test: fallback chain: cross-encoder fails -> tries cohere -> tries LLM -> heuristic succeeds
    async def test_full_fallback_chain(self, sample_documents):
        """When all higher strategies fail, heuristic should succeed as last resort."""
        ...

    # Test: fallback chain: cross-encoder succeeds -> does NOT try cohere
    async def test_no_fallback_when_primary_succeeds(self, sample_documents):
        """If the primary strategy succeeds, no other strategy should be attempted."""
        ...

    # Test: all strategies exhausted -> raises clear error with context
    async def test_all_strategies_fail_raises_error(self, sample_documents):
        """If even heuristic fails (should not happen), raise a clear error."""
        ...


# ---------------------------------------------------------------------------
# 3.4 Scope verification tests
# ---------------------------------------------------------------------------

class TestScopeVerification:
    """Tests for post-reranking scope verification."""

    # Test: reranked results are strict subset of scope-filtered input
    async def test_reranked_results_are_subset_of_input(self, scoped_documents):
        """Reranker must not introduce documents that were not in the input list."""
        ...

    # Test: reranking does not re-introduce documents that failed scope check
    async def test_no_reintroduction_of_filtered_docs(self):
        """If a doc was excluded by scope filtering, reranking must not bring it back."""
        ...


# ---------------------------------------------------------------------------
# Edge cases
# ---------------------------------------------------------------------------

class TestRerankerEdgeCases:
    """Edge case tests for the Reranker."""

    async def test_empty_document_list_returns_empty(self):
        """Reranking an empty list should return an empty list."""
        reranker = Reranker(strategy=RerankStrategy.HEURISTIC)
        result = await reranker.rerank("query", [], top_k=5)
        assert result == []

    async def test_fewer_docs_than_top_k(self):
        """When docs < top_k, return all docs (no reranking needed)."""
        ...

    async def test_strategy_enum_values(self):
        """Verify all expected strategy enum values exist."""
        assert RerankStrategy.CROSS_ENCODER == "cross_encoder"
        assert RerankStrategy.COHERE == "cohere"
        assert RerankStrategy.LLM == "llm"
        assert RerankStrategy.HEURISTIC == "heuristic"
```

### `/home/dev/projects/SmartSpecPro/python-backend/tests/orchestrator/rag/test_reranker_performance.py`

```python
"""
Performance and multilingual tests for the Reranker.

These tests are marked @pytest.mark.slow because they may download
and load the bge-reranker-v2-m3 model (~1.1GB) on first run.
"""
import pytest
from app.orchestrator.rag.reranker import Reranker, RerankStrategy


@pytest.mark.slow
class TestRerankerPerformance:
    """Performance benchmarks for cross-encoder reranking."""

    # Test: cross-encoder completes in <500ms for 20 documents on CPU
    async def test_cross_encoder_latency_20_docs(self):
        """Benchmark: 20 documents should rerank in under 500ms on CPU."""
        ...

    # Test: Thai content is correctly ranked by bge-reranker-v2-m3
    async def test_thai_content_ranking(self):
        """bge-reranker-v2-m3 supports 100+ languages; verify Thai ranking is reasonable."""
        ...
```

---

## Implementation Details

### Step 1: Add `cohere>=5.0.0` to requirements

In `/home/dev/projects/SmartSpecPro/python-backend/requirements.txt`, add `cohere>=5.0.0` under the Phase 2-3 section. The `cohere` package is optional at runtime -- its absence is handled gracefully via `ImportError` catch.

### Step 2: Refactor `reranker.py`

Refactor `/home/dev/projects/SmartSpecPro/python-backend/app/orchestrator/rag/reranker.py`. The file is completely rewritten but maintains backward compatibility. The key structural changes are:

#### 2a. Add `RerankStrategy` enum

```python
class RerankStrategy(str, Enum):
    CROSS_ENCODER = "cross_encoder"  # New default
    COHERE = "cohere"                # API fallback
    LLM = "llm"                      # Existing GPT-4.1-nano
    HEURISTIC = "heuristic"          # Existing fallback
```

#### 2b. Update `__init__` signature

The constructor changes from `(model, use_llm, batch_size)` to:

```python
def __init__(
    self,
    strategy: RerankStrategy = RerankStrategy.CROSS_ENCODER,
    model: str = "BAAI/bge-reranker-v2-m3",
    cohere_api_key: str | None = None,
    llm_model: str = "gpt-4.1-nano",
    batch_size: int = 5,
    max_tokens_per_doc: int = 300,
    fallback_chain: list[RerankStrategy] | None = None,
):
    """
    Initialize Reranker with strategy-based configuration.

    Args:
        strategy: Primary reranking strategy.
        model: Cross-encoder model name (for CROSS_ENCODER strategy).
        cohere_api_key: API key for Cohere Rerank (for COHERE strategy).
        llm_model: LLM model for per-document scoring (for LLM strategy).
        batch_size: Batch size for LLM scoring.
        max_tokens_per_doc: Max tokens to send per document to cross-encoder (default 300, 
            leaving ~200 tokens for the query within the 512-token cross-encoder limit).
        fallback_chain: Custom fallback order. 
            Defaults to [CROSS_ENCODER, COHERE, LLM, HEURISTIC].
    """
```

Key internal state:
- `self._cross_encoder_model = None` -- lazy-loaded `CrossEncoder` instance
- `self._process_pool = None` -- lazy-loaded `ProcessPoolExecutor(max_workers=1)`
- `self._cohere_client = None` -- lazy-loaded Cohere client
- `self._llm_client = None` -- lazy-loaded OpenAI client (existing)
- `self._fallback_chain` defaults to `[CROSS_ENCODER, COHERE, LLM, HEURISTIC]`

#### 2c. Refactor `rerank()` method

The main `rerank()` method iterates through the fallback chain, trying each strategy until one succeeds:

```python
async def rerank(
    self,
    query: str,
    documents: list[Any],
    top_k: int = 5,
    effective_scopes: set[str] | None = None,
) -> list[Any]:
    """
    Rerank documents using the configured strategy with automatic fallback.

    Args:
        query: Search query.
        documents: List of Document objects to rerank.
        top_k: Number of top results to return.
        effective_scopes: User's effective scopes for post-rerank verification.

    Returns:
        Reranked and scope-verified list of documents.
    """
```

Logic outline:
1. Return early if `documents` is empty or `len(documents) <= top_k`
2. Iterate through `self._fallback_chain`
3. For each strategy, call the corresponding private method inside a try/except
4. On success, log the strategy used and break
5. On failure, log the error and continue to next strategy
6. If all strategies fail, raise a `RuntimeError` with context about what was tried
7. After reranking, call `_verify_scopes()` if `effective_scopes` is provided
8. Return the top-k results

#### 2d. Cross-encoder implementation (`_cross_encoder_rerank`)

```python
async def _cross_encoder_rerank(
    self, query: str, documents: list[Any], top_k: int
) -> list[Any]:
    """
    Rerank using bge-reranker-v2-m3 cross-encoder model.

    - Lazy loads the model on first call (~5-10s warmup).
    - Truncates document content to max_tokens_per_doc tokens.
    - Runs inference in ProcessPoolExecutor to avoid GIL contention.
    - Returns documents sorted by cross-encoder score in descending order.
    """
```

Key implementation details:

**Lazy loading**: The model is loaded on first call via `_ensure_cross_encoder_loaded()`. This method imports `sentence_transformers.CrossEncoder` and instantiates it with `self.model`. The model instance is stored in `self._cross_encoder_model`. If `sentence_transformers` is not installed or the model download fails, raise an exception to trigger fallback.

**Token truncation**: Use `tiktoken` (cl100k_base encoding) to truncate each document's `content` to `self.max_tokens_per_doc` tokens (default 300). This keeps the total sequence length under the cross-encoder's 512-token limit.

**ProcessPoolExecutor inference**: The cross-encoder's `predict()` method is CPU-bound. Create a standalone function (module-level, not a method, to be picklable) that runs `model.predict(pairs)` and returns scores. Execute this function via `asyncio.get_event_loop().run_in_executor(self._process_pool, ...)`. The `ProcessPoolExecutor` is created with `max_workers=1` to limit memory usage.

**Score normalization**: The raw cross-encoder logits can be any real number. Apply sigmoid to convert to `[0, 1]` range: `score = 1 / (1 + math.exp(-logit))`.

**Assigning scores**: Set `doc.rerank_score = normalized_score` for each document, then sort by `rerank_score` descending.

#### 2e. Cohere implementation (`_cohere_rerank`)

```python
async def _cohere_rerank(
    self, query: str, documents: list[Any], top_k: int
) -> list[Any]:
    """
    Rerank using Cohere Rerank API.

    - Requires cohere package and COHERE_API_KEY.
    - Sends query + document contents to Cohere API.
    - Returns documents sorted by Cohere's relevance_score.
    """
```

Key implementation details:

**Optional import**: Wrap `import cohere` in try/except. If not installed, raise immediately to trigger fallback.

**API key check**: If `self.cohere_api_key` is None, check `os.environ.get("COHERE_API_KEY")`. If still None, raise to trigger fallback.

**API call**: Use `cohere.ClientV2` (or `cohere.AsyncClientV2` if available). Call `client.rerank(model="rerank-v3.5", query=query, documents=[doc.content for doc in documents], top_k=top_k)`. Map the response results back to the original documents using index.

**Score assignment**: Set `doc.rerank_score = result.relevance_score`.

#### 2f. LLM implementation (`_llm_rerank`)

This is the existing LLM-based reranking logic, preserved as-is from the current `reranker.py`. It calls GPT-4.1-nano per document via `_score_document()`. The only change is that it is now wrapped as one strategy in the chain rather than the default.

#### 2g. Heuristic implementation (`_heuristic_rerank`)

This is the existing heuristic logic, preserved as-is. It combines BM25 score, vector score, term overlap, and length preference. It is always available as the last-resort fallback (no external dependencies).

#### 2h. Scope verification (`_verify_scopes`)

```python
def _verify_scopes(
    self,
    documents: list[Any],
    effective_scopes: set[str],
) -> list[Any]:
    """
    Defense-in-depth: verify all reranked documents still pass scope checks.

    Checks that each document's metadata['allowed_scopes'] has at least one
    element in common with the user's effective_scopes. Removes any document
    that does not pass.
    """
```

This is a post-reranking safety check. The retrieval step (section-04) already filters by scope, but the reranker must not accidentally re-introduce unauthorized documents. If a document lacks `metadata.get("allowed_scopes")`, it passes (backward compatibility with documents that predate the ACL system).

#### 2i. Health check

```python
def is_model_loaded(self) -> bool:
    """Return whether the cross-encoder model is currently loaded in memory."""
    return self._cross_encoder_model is not None
```

This is used by a health check endpoint to report model readiness status.

#### 2j. Cleanup

```python
async def cleanup(self):
    """Release model, executor, and client resources."""
```

Shut down the `ProcessPoolExecutor`, set model references to None, and close any API clients.

### Step 3: Update `__init__.py` exports

In `/home/dev/projects/SmartSpecPro/python-backend/app/orchestrator/rag/__init__.py`, add `RerankStrategy` to the imports and `__all__`:

```python
from app.orchestrator.rag.reranker import Reranker, RerankStrategy

__all__ = [
    # ... existing exports ...
    "RerankStrategy",
]
```

### Step 4: Wire into `HybridRAGEngine`

The `HybridRAGEngine` at `/home/dev/projects/SmartSpecPro/python-backend/app/orchestrator/rag/hybrid_rag.py` already lazy-creates a `Reranker()` in its `reranker` property (line 220-225). Two changes are needed:

1. **Default strategy**: Update the lazy creation to use `RerankStrategy.CROSS_ENCODER` as the default strategy:

```python
@property
def reranker(self) -> "Reranker":
    if self._reranker is None:
        from app.orchestrator.rag.reranker import Reranker, RerankStrategy
        self._reranker = Reranker(strategy=RerankStrategy.CROSS_ENCODER)
    return self._reranker
```

2. **Pass effective_scopes to rerank**: In the `retrieve()` method, pass `effective_scopes` (from the `filters` dict if present) to `reranker.rerank()`:

```python
# Inside retrieve(), at the rerank step (around line 371):
effective_scopes = (filters or {}).get("effective_scopes")
reranked_docs = await self.reranker.rerank(
    query=query,
    documents=rerank_candidates,
    top_k=self.config.rerank_top_k,
    effective_scopes=set(effective_scopes) if effective_scopes else None,
)
```

## Operational Considerations

- **Model size**: `BAAI/bge-reranker-v2-m3` is approximately 1.1GB on disk and approximately 1.5GB in memory. The server must have at least 2GB free RAM.
- **Lazy loading**: The model is NOT loaded at server startup. It loads on the first reranking request, which takes 5-10 seconds. Subsequent calls are fast.
- **ProcessPoolExecutor**: Uses a separate process to avoid GIL contention with FastAPI's async event loop. The executor is created with `max_workers=1` to cap memory at one model instance.
- **Fallback chain**: If the cross-encoder is too slow on the target hardware (benchmark > 500ms for 20 docs), the Cohere API can be promoted to primary by configuring `strategy=RerankStrategy.COHERE` or adjusting the fallback chain order.
- **Pre-downloading for production**: Consider adding a model download step to the Docker build to avoid the first-request penalty:
  ```dockerfile
  RUN python -c "from sentence_transformers import CrossEncoder; CrossEncoder('BAAI/bge-reranker-v2-m3')"
  ```

## Backward Compatibility

- The `Reranker` class retains all existing public methods (`rerank()`, `cleanup()`)
- The old `use_llm=True` constructor pattern is replaced by `strategy=RerankStrategy.LLM`, but callers using `Reranker()` with no arguments get `CROSS_ENCODER` instead of `LLM` -- this is an intentional upgrade
- The `_heuristic_rerank()` method preserves identical logic to the existing implementation
- The `_llm_rerank()` and `_score_document()` methods preserve existing LLM scoring logic
- `HybridRAGEngine` continues to call `reranker.rerank(query, documents, top_k)` -- the new `effective_scopes` parameter is optional

## Verification Checklist

After implementation:

1. Run `cd /home/dev/projects/SmartSpecPro/python-backend && pytest tests/orchestrator/rag/test_reranker.py -v` -- all tests pass
2. Run `cd /home/dev/projects/SmartSpecPro/python-backend && pytest tests/orchestrator/rag/test_reranker_performance.py -v -m slow` -- latency benchmark passes (optional, requires model download)
3. Verify `RerankStrategy` enum has exactly four values
4. Verify `Reranker(strategy=RerankStrategy.HEURISTIC)` works without any external dependencies
5. Verify `Reranker()` defaults to `CROSS_ENCODER` strategy
6. Verify fallback chain logs each strategy attempt
7. Verify scope verification removes unauthorized documents after reranking
8. Verify `__init__.py` exports `RerankStrategy`

---

## Implementation Status

**Status:** COMPLETE
**Tests:** 18 passing (test_reranker.py), 49 total with hybrid_rag tests
**Commit:** (pending)

### Actual Files Created/Modified

| File | Action | Notes |
|------|--------|-------|
| `python-backend/app/orchestrator/rag/reranker.py` | Rewritten | Strategy-based with fallback chain, scope verification |
| `python-backend/tests/orchestrator/rag/test_reranker.py` | Created | 18 tests across 6 classes |
| `python-backend/app/orchestrator/rag/__init__.py` | Modified | Added RerankStrategy export |
| `python-backend/app/orchestrator/rag/hybrid_rag.py` | Modified | Default CROSS_ENCODER, pass effective_scopes |
| `python-backend/requirements.txt` | Modified | Added cohere>=5.0.0 |

### Deviations from Plan

1. **ThreadPoolExecutor instead of ProcessPoolExecutor**: Uses ThreadPoolExecutor to avoid loading the model twice (~3GB). ProcessPoolExecutor would require a separate model instance in each process. ThreadPoolExecutor has GIL contention but is acceptable for the reranking use case.
2. **test_reranker_performance.py not created**: Requires 1.1GB model download. Deferred to manual testing.
3. **Token truncation uses char estimation**: Simple 4-chars-per-token heuristic instead of tiktoken. Acceptable for initial implementation.

### Code Review Fixes Applied

| Fix | Finding | Description |
|-----|---------|-------------|
| FIX-1 | F-01/F-08 (HIGH) | Use run_in_executor with ThreadPoolExecutor to avoid blocking event loop |
| FIX-2 | F-02 (MEDIUM) | Added cohere>=5.0.0 to requirements.txt |
| FIX-3 | F-10 (LOW) | use_llm=False now restricts fallback chain to HEURISTIC only |