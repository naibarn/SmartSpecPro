Now I have full context. Let me produce the section content.

# Section 08: Evaluation and Observability

## Overview

This section implements Phase 5 of the RAG Maturity Upgrade: a complete evaluation pipeline and enhanced observability for the RAG system. It introduces three main components:

1. **`RAGEvaluator`** -- computes retrieval quality metrics (Precision@K, Recall@K, MRR, NDCG@K, and optional Faithfulness) against a ground-truth evaluation dataset.
2. **`EvalDatasetGenerator`** -- auto-generates QA pairs from indexed documents using LLM calls, producing evaluation datasets without manual annotation.
3. **Observability enhancements** -- extends the `rag_retrieval_complete` structured log event in `hybrid_rag.py` with quality, confidence, strategy, scope, and cache fields.
4. **CLI evaluation command** -- a `__main__` entrypoint in `evaluator.py` allowing offline evaluation via `python -m app.orchestrator.rag.evaluator`.

**Dependencies on prior sections (reference only):**

- **Section 07 (RAG Executor):** The executor produces `RAGResult` objects with quality assessments, citations, and metadata. The evaluator uses `HybridRAGEngine` directly to run retrieval against evaluation items.
- **Section 06 (Guardrails & Citations):** `QualityAssessment` from `guardrails.py` and citation fields on `Document`/`RAGResult` are part of the logged event data.
- **Section 04 (Hybrid Search):** `QueryStrategy` enum and `query_processor.py` are referenced in observability log fields.
- **Section 05 (Reranking):** `RerankStrategy` enum from `reranker.py` is referenced in observability log fields.

---

## Files to Create or Modify

| File | Action |
|------|--------|
| `/home/dev/projects/SmartSpecPro/python-backend/app/orchestrator/rag/evaluator.py` | **Create** -- `RAGEvaluator`, `EvalDatasetGenerator`, `EvalMetrics`, `EvalItem`, `EvalDataset`, CLI entrypoint |
| `/home/dev/projects/SmartSpecPro/python-backend/app/orchestrator/rag/hybrid_rag.py` | **Modify** -- extend the `rag_retrieval_complete` log event with new fields |
| `/home/dev/projects/SmartSpecPro/python-backend/app/orchestrator/rag/__init__.py` | **Modify** -- export new evaluator classes |
| `/home/dev/projects/SmartSpecPro/python-backend/tests/orchestrator/rag/test_evaluator.py` | **Create** -- unit tests for metrics computation |
| `/home/dev/projects/SmartSpecPro/python-backend/tests/orchestrator/rag/test_eval_dataset.py` | **Create** -- unit tests for dataset generation |
| `/home/dev/projects/SmartSpecPro/python-backend/tests/orchestrator/rag/test_observability.py` | **Create** -- unit tests for enhanced log events |
| `/home/dev/projects/SmartSpecPro/python-backend/tests/orchestrator/rag/test_evaluator_cli.py` | **Create** -- unit tests for CLI command |

---

## Tests (Write First)

### Unit Tests: `/home/dev/projects/SmartSpecPro/python-backend/tests/orchestrator/rag/test_evaluator.py`

```python
"""
Tests for RAGEvaluator -- Phase 5.1.

Validates:
1. Precision@K calculation with known relevant documents
2. Recall@K calculation with known total relevant documents
3. MRR (Mean Reciprocal Rank) calculation
4. NDCG@K (Normalized Discounted Cumulative Gain) calculation
5. Faithfulness metric extraction and verification
6. Full evaluate() running across a dataset
7. evaluate_single() per-item breakdown
8. Report generation from metrics
"""

import pytest
import math
from unittest.mock import AsyncMock, MagicMock, patch

from app.orchestrator.rag.evaluator import (
    RAGEvaluator,
    EvalItem,
    EvalDataset,
    EvalMetrics,
)


@pytest.fixture
def evaluator():
    """Create a RAGEvaluator instance."""
    return RAGEvaluator()


@pytest.fixture
def sample_eval_items():
    """Create sample evaluation items with known expected doc IDs."""
    return [
        EvalItem(
            query="What is the refund policy?",
            expected_answer="Returns within 30 days.",
            expected_doc_ids=["doc-1", "doc-2"],
            tags=["policy"],
        ),
        EvalItem(
            query="How to reset password?",
            expected_answer="Go to settings and click reset.",
            expected_doc_ids=["doc-3"],
            tags=["faq"],
        ),
    ]


@pytest.fixture
def sample_dataset(sample_eval_items):
    """Create a sample EvalDataset."""
    return EvalDataset(items=sample_eval_items)


class TestPrecisionAtK:
    """Test: Precision@K with 3 relevant in top-5 produces 0.6."""

    # Precision@K = (number of relevant docs in top-K) / K
    # If top-5 results are [rel, rel, irrel, rel, irrel] then precision = 3/5 = 0.6.
    # Verify with various K values and edge cases (K=0, K > results).

    def test_precision_3_of_5(self, evaluator):
        """3 relevant docs in top-5 gives precision 0.6."""
        retrieved_ids = ["doc-1", "doc-2", "doc-x", "doc-3", "doc-y"]
        relevant_ids = {"doc-1", "doc-2", "doc-3"}
        precision = evaluator._precision_at_k(retrieved_ids, relevant_ids, k=5)
        assert abs(precision - 0.6) < 1e-9

    def test_precision_all_relevant(self, evaluator):
        """All docs relevant gives precision 1.0."""
        retrieved_ids = ["doc-1", "doc-2", "doc-3"]
        relevant_ids = {"doc-1", "doc-2", "doc-3"}
        precision = evaluator._precision_at_k(retrieved_ids, relevant_ids, k=3)
        assert abs(precision - 1.0) < 1e-9

    def test_precision_none_relevant(self, evaluator):
        """No relevant docs gives precision 0.0."""
        retrieved_ids = ["doc-x", "doc-y"]
        relevant_ids = {"doc-1", "doc-2"}
        precision = evaluator._precision_at_k(retrieved_ids, relevant_ids, k=2)
        assert abs(precision - 0.0) < 1e-9

    def test_precision_empty_results(self, evaluator):
        """Empty results gives precision 0.0, no division error."""
        precision = evaluator._precision_at_k([], {"doc-1"}, k=5)
        assert precision == 0.0


class TestRecallAtK:
    """Test: Recall@K with 3 relevant in top-5 out of 10 total relevant produces 0.3."""

    # Recall@K = (number of relevant docs in top-K) / (total relevant docs)
    # If we find 3 of 10 relevant docs in top-5, recall = 3/10 = 0.3.

    def test_recall_3_of_10(self, evaluator):
        """3 relevant in top-5, 10 total relevant gives recall 0.3."""
        retrieved_ids = ["doc-1", "doc-x", "doc-2", "doc-3", "doc-y"]
        relevant_ids = {f"doc-{i}" for i in range(1, 11)}  # 10 relevant
        recall = evaluator._recall_at_k(retrieved_ids, relevant_ids, k=5)
        assert abs(recall - 0.3) < 1e-9

    def test_recall_all_found(self, evaluator):
        """All relevant docs found gives recall 1.0."""
        retrieved_ids = ["doc-1", "doc-2"]
        relevant_ids = {"doc-1", "doc-2"}
        recall = evaluator._recall_at_k(retrieved_ids, relevant_ids, k=5)
        assert abs(recall - 1.0) < 1e-9

    def test_recall_no_relevant_docs(self, evaluator):
        """Zero total relevant docs gives recall 0.0, no division error."""
        recall = evaluator._recall_at_k(["doc-x"], set(), k=5)
        assert recall == 0.0


class TestMRR:
    """Test: MRR with first relevant at position 3 produces 0.333."""

    # MRR = mean(1 / rank_of_first_relevant) across queries.
    # For a single query where the first relevant doc is at rank 3: MRR = 1/3.

    def test_mrr_first_at_3(self, evaluator):
        """First relevant doc at position 3 gives MRR ~0.333."""
        retrieved_ids = ["doc-x", "doc-y", "doc-1", "doc-2"]
        relevant_ids = {"doc-1", "doc-2"}
        rr = evaluator._reciprocal_rank(retrieved_ids, relevant_ids)
        assert abs(rr - 1 / 3) < 1e-9

    def test_mrr_first_at_1(self, evaluator):
        """First relevant doc at position 1 gives RR = 1.0."""
        retrieved_ids = ["doc-1", "doc-x"]
        relevant_ids = {"doc-1"}
        rr = evaluator._reciprocal_rank(retrieved_ids, relevant_ids)
        assert abs(rr - 1.0) < 1e-9

    def test_mrr_none_relevant(self, evaluator):
        """No relevant doc found gives RR = 0.0."""
        retrieved_ids = ["doc-x", "doc-y"]
        relevant_ids = {"doc-1"}
        rr = evaluator._reciprocal_rank(retrieved_ids, relevant_ids)
        assert rr == 0.0


class TestNDCG:
    """Test: NDCG@K with graded relevance produces correct normalized score."""

    # NDCG@K = DCG@K / IDCG@K
    # DCG@K = sum(rel_i / log2(i+1)) for i=1..K
    # IDCG@K = ideal DCG (sorted by decreasing relevance)
    # For binary relevance [1, 0, 1, 0, 1] at K=5:
    #   DCG = 1/log2(2) + 0 + 1/log2(4) + 0 + 1/log2(6)
    #   IDCG = 1/log2(2) + 1/log2(3) + 1/log2(4)

    def test_ndcg_binary_relevance(self, evaluator):
        """Binary relevance [1,0,1,0,1] produces correct NDCG."""
        retrieved_ids = ["doc-1", "doc-x", "doc-2", "doc-y", "doc-3"]
        relevant_ids = {"doc-1", "doc-2", "doc-3"}
        ndcg = evaluator._ndcg_at_k(retrieved_ids, relevant_ids, k=5)
        # DCG = 1/1 + 0 + 1/2 + 0 + 1/log2(6)
        # IDCG = 1/1 + 1/log2(3) + 1/2
        dcg = 1.0 / math.log2(2) + 1.0 / math.log2(4) + 1.0 / math.log2(6)
        idcg = 1.0 / math.log2(2) + 1.0 / math.log2(3) + 1.0 / math.log2(4)
        expected = dcg / idcg
        assert abs(ndcg - expected) < 1e-6

    def test_ndcg_perfect_ranking(self, evaluator):
        """All relevant docs at top gives NDCG = 1.0."""
        retrieved_ids = ["doc-1", "doc-2", "doc-3"]
        relevant_ids = {"doc-1", "doc-2", "doc-3"}
        ndcg = evaluator._ndcg_at_k(retrieved_ids, relevant_ids, k=3)
        assert abs(ndcg - 1.0) < 1e-9

    def test_ndcg_no_relevant(self, evaluator):
        """No relevant docs gives NDCG = 0.0."""
        retrieved_ids = ["doc-x", "doc-y"]
        relevant_ids = {"doc-1"}
        ndcg = evaluator._ndcg_at_k(retrieved_ids, relevant_ids, k=2)
        assert ndcg == 0.0


class TestFaithfulness:
    """Test: Faithfulness extraction identifies claims and checks against context."""

    # Faithfulness = (number of claims supported by context) / (total claims)
    # Uses LLM to extract claims from the generated answer, then verifies each
    # claim against the retrieved context. Mock the LLM calls.

    @pytest.mark.asyncio
    async def test_faithfulness_all_supported(self, evaluator):
        """All claims supported by context gives faithfulness 1.0."""
        ...

    @pytest.mark.asyncio
    async def test_faithfulness_partial(self, evaluator):
        """2 of 4 claims supported gives faithfulness 0.5."""
        ...

    @pytest.mark.asyncio
    async def test_faithfulness_none_supported(self, evaluator):
        """No claims supported gives faithfulness 0.0."""
        ...

    @pytest.mark.asyncio
    async def test_faithfulness_skipped_without_llm(self, evaluator):
        """Faithfulness returns None when no LLM is configured."""
        ...


class TestEvaluateDataset:
    """Test: evaluate() runs full dataset and returns EvalMetrics with all fields."""

    # evaluate() iterates over all EvalItems, runs engine.retrieve() for each,
    # computes per-item metrics, and aggregates into an EvalMetrics object.
    # Mock the HybridRAGEngine to return predictable results.

    @pytest.mark.asyncio
    async def test_evaluate_returns_all_metrics(self, evaluator, sample_dataset):
        """evaluate() must return EvalMetrics with all fields populated."""
        ...

    @pytest.mark.asyncio
    async def test_evaluate_single_returns_per_item(self, evaluator, sample_eval_items):
        """evaluate_single() must return per-item breakdown dict."""
        ...


class TestReportGeneration:
    """Test: generate_report() produces readable markdown with tables."""

    def test_report_contains_metrics(self, evaluator):
        """Report must include all metric categories in markdown format."""
        metrics = EvalMetrics(
            precision_at_k=0.6,
            recall_at_k=0.3,
            mrr=0.333,
            ndcg_at_k=0.75,
            faithfulness=0.8,
            avg_retrieval_ms=145.0,
            p95_total_ms=320.0,
        )
        report = evaluator.generate_report(metrics)
        assert "Precision@K" in report
        assert "Recall@K" in report
        assert "MRR" in report
        assert "NDCG@K" in report
        assert "Faithfulness" in report
        assert "0.6" in report

    def test_report_includes_quality_gates(self, evaluator):
        """Report must include quality gate pass/fail status."""
        metrics = EvalMetrics(
            precision_at_k=0.6,
            recall_at_k=0.95,
            mrr=0.7,
            ndcg_at_k=0.8,
            faithfulness=0.85,
            avg_retrieval_ms=145.0,
            p95_total_ms=1500.0,
        )
        report = evaluator.generate_report(metrics)
        # Quality gates from the plan:
        # Context recall > 90%, Faithfulness > 80%, MRR > 0.6, P95 < 2000ms
        assert "PASS" in report or "pass" in report.lower()

    def test_report_shows_failing_gates(self, evaluator):
        """Report must show FAIL for metrics below threshold."""
        metrics = EvalMetrics(
            precision_at_k=0.2,
            recall_at_k=0.3,  # Below 90%
            mrr=0.2,          # Below 0.6
            ndcg_at_k=0.4,
            faithfulness=0.5, # Below 80%
            avg_retrieval_ms=500.0,
            p95_total_ms=3000.0,  # Above 2000ms
        )
        report = evaluator.generate_report(metrics)
        assert "FAIL" in report or "fail" in report.lower()
```

### Unit Tests: `/home/dev/projects/SmartSpecPro/python-backend/tests/orchestrator/rag/test_eval_dataset.py`

```python
"""
Tests for EvalDatasetGenerator -- Phase 5.2.

Validates:
1. Generator produces valid QA pairs from input documents
2. Each QA pair has query, expected_answer, expected_doc_ids
3. Hard negatives are included (questions with no matching docs)
4. Generated dataset has at least num_pairs entries
"""

import pytest
from unittest.mock import AsyncMock, MagicMock, patch

from app.orchestrator.rag.evaluator import (
    EvalDatasetGenerator,
    EvalItem,
    EvalDataset,
)
from app.orchestrator.rag.hybrid_rag import Document


@pytest.fixture
def generator():
    """Create an EvalDatasetGenerator instance."""
    return EvalDatasetGenerator()


@pytest.fixture
def sample_documents():
    """Create sample documents for QA pair generation."""
    return [
        Document(
            doc_id="doc-1",
            content="Our refund policy allows returns within 30 days of purchase. "
                    "Items must be in original condition with receipt.",
            metadata={"title": "Refund Policy", "section": "Returns"},
        ),
        Document(
            doc_id="doc-2",
            content="To reset your password, navigate to Settings > Security > "
                    "Reset Password. You will receive a verification email.",
            metadata={"title": "User Guide", "section": "Account Security"},
        ),
        Document(
            doc_id="doc-3",
            content="Our premium plan includes unlimited API calls, priority support, "
                    "and custom integrations starting at $99/month.",
            metadata={"title": "Pricing", "section": "Plans"},
        ),
    ]


class TestGeneratorProducesValidPairs:
    """Test: generator produces valid QA pairs from input documents."""

    # The generator calls an LLM to produce 1-3 questions per document chunk.
    # Mock the LLM call to return predictable questions. Each resulting
    # EvalItem must have a non-empty query, an expected_answer derived from
    # the chunk content, and expected_doc_ids pointing to the source chunk.

    @pytest.mark.asyncio
    async def test_generates_qa_pairs(self, generator, sample_documents):
        """Generator must produce EvalItem objects from documents."""
        ...

    @pytest.mark.asyncio
    async def test_each_pair_has_required_fields(self, generator, sample_documents):
        """Each EvalItem must have query, expected_answer, expected_doc_ids."""
        ...

    @pytest.mark.asyncio
    async def test_expected_doc_ids_point_to_source(self, generator, sample_documents):
        """expected_doc_ids must reference the source document's doc_id."""
        ...


class TestHardNegatives:
    """Test: hard negatives are included (questions with no matching docs)."""

    # The generator should produce some questions about topics NOT in the
    # knowledge base. These have empty expected_doc_ids and serve to test
    # the system's ability to correctly return FAILED quality for
    # unanswerable queries. Typically ~10-20% of the dataset.

    @pytest.mark.asyncio
    async def test_hard_negatives_included(self, generator, sample_documents):
        """Dataset must include items with empty expected_doc_ids (hard negatives)."""
        ...

    @pytest.mark.asyncio
    async def test_hard_negatives_have_clear_tags(self, generator, sample_documents):
        """Hard negative items must be tagged with 'hard_negative'."""
        ...


class TestDatasetSize:
    """Test: generated dataset has at least num_pairs entries."""

    # When requesting num_pairs=10, the result dataset must have at least 10 items.
    # The generator may produce slightly more due to multiple questions per chunk.

    @pytest.mark.asyncio
    async def test_minimum_pair_count(self, generator, sample_documents):
        """Dataset must have at least the requested num_pairs items."""
        ...
```

### Unit Tests: `/home/dev/projects/SmartSpecPro/python-backend/tests/orchestrator/rag/test_observability.py`

```python
"""
Tests for observability enhancements -- Phase 5.3.

Validates that the rag_retrieval_complete structured log event emitted by
HybridRAGEngine.retrieve() includes all required fields:
1. quality level (from guardrails assessment)
2. confidence score
3. query_strategy (which QueryProcessor strategy was used)
4. rerank_strategy (which Reranker strategy succeeded)
5. scope_filter_count (how many scopes were in the filter)
6. cache_hit (whether the result came from cache)
"""

import pytest
from unittest.mock import AsyncMock, MagicMock, patch, call
import structlog

from app.orchestrator.rag.hybrid_rag import (
    HybridRAGEngine,
    RAGConfig,
    SearchMode,
    Document,
)


@pytest.fixture
def engine_with_docs():
    """Create a HybridRAGEngine with test documents pre-loaded.

    Returns a configured engine with caching disabled and reranking disabled
    for test isolation. Documents are added with metadata including
    allowed_scopes and tenant_id.
    """
    config = RAGConfig(
        mode=SearchMode.HYBRID,
        use_rerank=False,
        use_cache=False,
    )
    engine = HybridRAGEngine(config=config)
    return engine


class TestLogEventIncludesQuality:
    """Test: rag_retrieval_complete log event includes quality level."""

    # After retrieve() completes, the structured log event emitted via
    # logger.info("rag_retrieval_complete", ...) must include a "quality"
    # field with one of: "high", "medium", "low", "failed".
    # Mock the guardrails to return a known quality level.

    @pytest.mark.asyncio
    async def test_quality_in_log(self, engine_with_docs):
        """Log event must include quality field from QualityAssessment."""
        ...


class TestLogEventIncludesConfidence:
    """Test: rag_retrieval_complete log event includes confidence score."""

    # The "confidence" field should be a float between 0.0 and 1.0
    # derived from QualityAssessment.confidence_score.

    @pytest.mark.asyncio
    async def test_confidence_in_log(self, engine_with_docs):
        """Log event must include confidence float."""
        ...


class TestLogEventIncludesQueryStrategy:
    """Test: rag_retrieval_complete log event includes query_strategy."""

    # The "query_strategy" field should reflect which QueryProcessor
    # strategy was used: "passthrough", "rewrite", "hyde", "multi_query",
    # or "step_back". For default config this is "passthrough".

    @pytest.mark.asyncio
    async def test_query_strategy_in_log(self, engine_with_docs):
        """Log event must include query_strategy field."""
        ...


class TestLogEventIncludesRerankStrategy:
    """Test: rag_retrieval_complete log event includes rerank_strategy."""

    # The "rerank_strategy" field should reflect which reranking strategy
    # succeeded: "cross_encoder", "cohere", "llm", "heuristic", or "none"
    # when reranking is disabled.

    @pytest.mark.asyncio
    async def test_rerank_strategy_in_log(self, engine_with_docs):
        """Log event must include rerank_strategy field."""
        ...


class TestLogEventIncludesScopeFilterCount:
    """Test: rag_retrieval_complete log event includes scope_filter_count."""

    # The "scope_filter_count" field is an integer reflecting how many
    # scope strings were in the filter. For example, if the filters dict
    # contains allowed_scopes=["u:42", "g:10", "p:global"], the count is 3.
    # If no scope filters were provided, count is 0.

    @pytest.mark.asyncio
    async def test_scope_filter_count_in_log(self, engine_with_docs):
        """Log event must include scope_filter_count integer."""
        ...


class TestLogEventIncludesCacheHit:
    """Test: rag_retrieval_complete log event includes cache_hit boolean."""

    # The "cache_hit" field is a boolean: True if the result was served
    # from cache, False if retrieval was performed fresh.

    @pytest.mark.asyncio
    async def test_cache_hit_true(self):
        """When result is from cache, cache_hit must be True."""
        ...

    @pytest.mark.asyncio
    async def test_cache_hit_false(self, engine_with_docs):
        """When result is computed fresh, cache_hit must be False."""
        ...
```

### Unit Tests: `/home/dev/projects/SmartSpecPro/python-backend/tests/orchestrator/rag/test_evaluator_cli.py`

```python
"""
Tests for evaluator CLI entrypoint -- Phase 5.4.

Validates:
1. CLI runs without error with valid dataset
2. CLI produces output file at specified path
3. CLI output contains all metric categories
4. CLI with invalid dataset path shows clear error
"""

import pytest
import json
import os
import tempfile
from unittest.mock import AsyncMock, MagicMock, patch


class TestCLIWithValidDataset:
    """Test: CLI runs without error with valid dataset."""

    # The CLI is invoked via `python -m app.orchestrator.rag.evaluator`
    # with --dataset, --k, and --output arguments. A valid dataset JSON
    # file contains a list of EvalItem dicts. Mock the HybridRAGEngine
    # to avoid actual retrieval, verify the CLI exits cleanly (exit code 0).

    def test_cli_exits_cleanly(self):
        """CLI must exit with code 0 for valid inputs."""
        ...


class TestCLIProducesOutputFile:
    """Test: CLI produces output file at specified path."""

    # After running the CLI with --output /tmp/report.md, the file must
    # exist and contain non-empty content.

    def test_output_file_created(self):
        """CLI must create the output file at the specified path."""
        ...


class TestCLIOutputContent:
    """Test: CLI output contains all metric categories."""

    # The output markdown must contain sections for Precision@K, Recall@K,
    # MRR, NDCG@K, and quality gate pass/fail status.

    def test_output_has_all_metrics(self):
        """Output file must contain all metric category headers."""
        ...


class TestCLIInvalidDataset:
    """Test: CLI with invalid dataset path shows clear error."""

    # When the --dataset path does not exist, the CLI must print a clear
    # error message and exit with non-zero code. Must NOT produce a
    # traceback or generic Python exception.

    def test_invalid_path_error_message(self):
        """CLI must show clear error for non-existent dataset path."""
        ...

    def test_malformed_json_error(self):
        """CLI must show clear error for malformed JSON dataset."""
        ...
```

---

## Implementation Details

### Data Structures in `evaluator.py`

The file `/home/dev/projects/SmartSpecPro/python-backend/app/orchestrator/rag/evaluator.py` introduces the following data structures.

**`EvalItem`** -- a single evaluation example with a query, expected answer, and the document IDs that should be retrieved:

```python
@dataclass
class EvalItem:
    query: str
    expected_answer: str
    expected_doc_ids: list[str]
    tags: list[str] = field(default_factory=list)
```

**`EvalDataset`** -- a collection of `EvalItem` objects, loadable from JSON:

```python
@dataclass
class EvalDataset:
    items: list[EvalItem]

    @classmethod
    def from_json(cls, path: str) -> "EvalDataset":
        """Load dataset from a JSON file.

        JSON structure: {"items": [{"query": ..., "expected_answer": ...,
        "expected_doc_ids": [...], "tags": [...]}]}
        """
        ...

    def to_json(self, path: str) -> None:
        """Save dataset to a JSON file."""
        ...
```

**`EvalMetrics`** -- aggregated metrics from an evaluation run:

```python
@dataclass
class EvalMetrics:
    precision_at_k: float
    recall_at_k: float
    mrr: float
    ndcg_at_k: float
    faithfulness: float | None   # None when LLM not available
    avg_retrieval_ms: float
    p95_total_ms: float
```

### `RAGEvaluator` Class

The `RAGEvaluator` is the main evaluation driver. Its public interface:

```python
class RAGEvaluator:
    """Evaluates RAG pipeline quality against ground-truth datasets."""

    def __init__(self, llm_client: Any | None = None):
        """Initialize evaluator. llm_client is optional; needed only for faithfulness."""
        ...

    async def evaluate(
        self,
        engine: HybridRAGEngine,
        dataset: EvalDataset,
        k: int = 5,
    ) -> EvalMetrics:
        """Run full evaluation across all dataset items.

        For each EvalItem:
        1. Call engine.retrieve(item.query, top_k=k)
        2. Extract retrieved doc IDs from result.documents
        3. Compute per-item precision, recall, MRR, NDCG
        4. Optionally compute faithfulness (if llm_client set)
        5. Track retrieval timing

        Aggregates per-item metrics into averages. Returns EvalMetrics.
        """
        ...

    async def evaluate_single(
        self,
        engine: HybridRAGEngine,
        item: EvalItem,
        k: int = 5,
    ) -> dict:
        """Evaluate a single item and return per-item breakdown.

        Returns dict with: query, retrieved_ids, expected_ids, precision,
        recall, reciprocal_rank, ndcg, retrieval_ms, faithfulness.
        """
        ...

    def generate_report(self, metrics: EvalMetrics) -> str:
        """Generate a human-readable markdown report from EvalMetrics.

        Includes:
        - Table of all metrics with values
        - Quality gate pass/fail status for each threshold
        - Summary paragraph

        Quality gate thresholds:
        - Context recall > 90% -> PASS/FAIL
        - Faithfulness > 80% -> PASS/FAIL (skipped if None)
        - MRR > 0.6 -> PASS/FAIL
        - P95 latency < 2000ms -> PASS/FAIL
        """
        ...
```

The evaluator contains private helper methods for individual metric calculations:

```python
    def _precision_at_k(
        self, retrieved_ids: list[str], relevant_ids: set[str], k: int
    ) -> float:
        """Precision@K = relevant docs in top-K / K.

        Returns 0.0 if K is 0 or retrieved_ids is empty.
        """
        ...

    def _recall_at_k(
        self, retrieved_ids: list[str], relevant_ids: set[str], k: int
    ) -> float:
        """Recall@K = relevant docs in top-K / total relevant.

        Returns 0.0 if relevant_ids is empty (no division by zero).
        """
        ...

    def _reciprocal_rank(
        self, retrieved_ids: list[str], relevant_ids: set[str]
    ) -> float:
        """Reciprocal Rank = 1 / rank_of_first_relevant.

        Returns 0.0 if no relevant document is found in retrieved_ids.
        """
        ...

    def _ndcg_at_k(
        self, retrieved_ids: list[str], relevant_ids: set[str], k: int
    ) -> float:
        """NDCG@K = DCG@K / IDCG@K.

        Uses binary relevance (1 if in relevant_ids, 0 otherwise).
        DCG@K = sum(rel_i / log2(i+1)) for i=1..K
        IDCG@K = ideal DCG with all relevant at top positions.
        Returns 0.0 if no relevant docs exist or K is 0.
        """
        ...

    async def _faithfulness(
        self,
        answer: str,
        context: str,
    ) -> float | None:
        """Compute faithfulness score using LLM.

        Steps:
        1. Extract atomic claims from the answer via LLM
        2. For each claim, check if it is supported by the context via LLM
        3. Faithfulness = supported_claims / total_claims

        Returns None if self.llm_client is None (LLM not configured).
        """
        ...
```

### `EvalDatasetGenerator` Class

This utility auto-generates evaluation datasets from indexed documents using an LLM:

```python
class EvalDatasetGenerator:
    """Generates QA evaluation pairs from indexed documents."""

    def __init__(self, llm_client: Any | None = None):
        """Initialize. Requires an llm_client for QA generation."""
        ...

    async def generate(
        self,
        documents: list[Document],
        num_pairs: int = 200,
    ) -> EvalDataset:
        """Generate an evaluation dataset from documents.

        For each document chunk:
        1. Send chunk content to LLM with prompt: "Generate 1-3 questions
           that this text can answer. Return as JSON array of
           {question, answer} objects."
        2. Create an EvalItem for each QA pair with:
           - query: the generated question
           - expected_answer: the generated answer (based on chunk content)
           - expected_doc_ids: [chunk.doc_id]
           - tags: derived from chunk metadata
        3. After generating positive pairs, add hard negatives:
           - ~10-20% of total pairs
           - Questions about topics NOT in any document
           - expected_doc_ids = [] (empty)
           - tags: ["hard_negative"]
        4. Shuffle and return.

        If num_pairs exceeds what can be generated, return all available.
        Target: at least num_pairs items (may exceed slightly).
        """
        ...
```

### Observability Enhancements in `hybrid_rag.py`

Modify the `logger.info("rag_retrieval_complete", ...)` call in `HybridRAGEngine.retrieve()` at `/home/dev/projects/SmartSpecPro/python-backend/app/orchestrator/rag/hybrid_rag.py` (currently around line 398-404).

The current log event:

```python
logger.info(
    "rag_retrieval_complete",
    query=query[:50],
    mode=mode.value,
    results=result.final_count,
    total_ms=result.total_time_ms,
)
```

Must be extended to include these additional fields:

```python
logger.info(
    "rag_retrieval_complete",
    query=query[:50],
    mode=mode.value,
    results=result.final_count,
    total_ms=result.total_time_ms,
    # --- New fields (Phase 5) ---
    quality=quality_level,              # str: "high"/"medium"/"low"/"failed"
    confidence=confidence_score,        # float: 0.0-1.0
    query_strategy=query_strategy_used, # str: "passthrough"/"rewrite"/"hyde"/etc.
    rerank_strategy=rerank_strategy_used, # str: "cross_encoder"/"cohere"/"llm"/"heuristic"/"none"
    scope_filter_count=scope_count,     # int: number of scopes in filter
    cache_hit=was_cache_hit,            # bool: True if served from cache
)
```

To populate these fields, the `retrieve()` method needs:

1. **`quality` and `confidence`**: After retrieval, run `RetrievalGuardrails().assess(result)` to get a `QualityAssessment`. Extract `assessment.quality.value` and `assessment.confidence_score`. Import `RetrievalGuardrails` from `app.orchestrator.rag.guardrails` (section 06). If guardrails are not available (ImportError), default to `quality="unknown"` and `confidence=0.0`.

2. **`query_strategy`**: Track which query processing strategy was used. If `QueryProcessor` is configured (section 04), record `processed_query.strategy_used`. Default: `"passthrough"`.

3. **`rerank_strategy`**: Track which reranking strategy succeeded. If reranking ran, record the strategy from the reranker. If reranking was disabled or mode is FAST, record `"none"`. The `Reranker` should expose a `last_strategy_used` attribute after `rerank()` completes.

4. **`scope_filter_count`**: Count the number of scope strings in the `filters.get("allowed_scopes", [])` list. Default 0 if no scope filters provided.

5. **`cache_hit`**: Set a boolean flag at the top of `retrieve()`. If the result is served from cache, set `cache_hit = True` and include it in the log event. If retrieval runs fresh, `cache_hit = False`. The current cache-hit path returns early (line 314-318) -- it needs to emit the log event before returning, or the log must be emitted unconditionally at the end.

**Important architectural note on cache_hit logging**: The current code returns early on cache hit (before the log event). To log cache hits, either:
- (A) Add a separate `logger.info("rag_retrieval_complete", ..., cache_hit=True)` in the cache-hit branch before the early return, or
- (B) Restructure the method so the log event is always emitted at the end regardless of cache path.

Option (A) is simpler and avoids restructuring the method. The cache-hit log event should include all the same fields, with the quality/confidence/strategy values from the cached result.

### CLI Entrypoint

Add a `__main__` block at the bottom of `evaluator.py`:

```python
if __name__ == "__main__":
    """CLI for running RAG evaluation.

    Usage:
        python -m app.orchestrator.rag.evaluator \
            --dataset tests/fixtures/rag_eval_dataset.json \
            --k 5 \
            --output evaluation-report.md

    Arguments:
        --dataset: Path to JSON file containing EvalDataset
        --k: Number of top results to evaluate (default: 5)
        --output: Path to write the markdown report (default: stdout)
    """
    ...
```

The CLI should:
1. Parse arguments using `argparse`
2. Validate the dataset path exists; print clear error and exit with code 1 if not
3. Load the dataset with `EvalDataset.from_json(path)`; handle malformed JSON gracefully
4. Create a `HybridRAGEngine` with default `RAGConfig`
5. Load documents referenced by the dataset (if engine needs to be pre-populated, this requires a database session or a pre-populated engine)
6. Run `evaluator.evaluate(engine, dataset, k=k)`
7. Generate report with `evaluator.generate_report(metrics)`
8. Write report to `--output` path or print to stdout

For the CLI to work without a running database, it can accept a pre-populated engine or dataset file that includes document content alongside the QA pairs. The fixture dataset at `tests/fixtures/rag_eval_dataset.json` should follow this format:

```json
{
  "items": [
    {
      "query": "What is the refund policy?",
      "expected_answer": "Returns within 30 days.",
      "expected_doc_ids": ["doc-1"],
      "tags": ["policy"]
    }
  ],
  "documents": [
    {
      "doc_id": "doc-1",
      "content": "Our refund policy allows...",
      "metadata": {"title": "Policies"}
    }
  ]
}
```

### Quality Gate Thresholds

The following thresholds are used by `generate_report()` to determine pass/fail:

| Metric | Threshold | Pass Condition |
|--------|-----------|----------------|
| Context Recall (Recall@K) | 90% | `recall_at_k > 0.9` |
| Faithfulness | 80% | `faithfulness > 0.8` (skipped if None) |
| MRR | 0.6 | `mrr > 0.6` |
| P95 Latency | 2000ms | `p95_total_ms < 2000` |

These thresholds are recommended defaults and can be overridden via constructor arguments or CLI flags in the future.

### Exports in `__init__.py`

Add the following to `/home/dev/projects/SmartSpecPro/python-backend/app/orchestrator/rag/__init__.py`:

```python
from app.orchestrator.rag.evaluator import (
    RAGEvaluator,
    EvalDatasetGenerator,
    EvalMetrics,
    EvalItem,
    EvalDataset,
)
```

And add them to the `__all__` list.

---

## Actual Implementation Notes

### Files Created/Modified

| File | Action | Tests |
|------|--------|-------|
| `python-backend/app/orchestrator/rag/evaluator.py` | **Created** (460 lines) | 22 + 6 + 5 tests |
| `python-backend/app/orchestrator/rag/hybrid_rag.py` | **Modified** — observability fields in retrieve() | 6 observability tests |
| `python-backend/app/orchestrator/rag/__init__.py` | **Modified** — added evaluator exports | — |
| `python-backend/tests/orchestrator/rag/test_evaluator.py` | **Created** — 22 tests across 8 classes | — |
| `python-backend/tests/orchestrator/rag/test_eval_dataset.py` | **Created** — 6 tests across 3 classes | — |
| `python-backend/tests/orchestrator/rag/test_observability.py` | **Created** — 6 tests across 6 classes | — |
| `python-backend/tests/orchestrator/rag/test_evaluator_cli.py` | **Created** — 5 tests across 4 classes | — |

### Deviations from Plan

1. **evaluate_single() and evaluate() signatures** — Added optional `tenant_id` and `effective_scopes` parameters (not in original plan) per code review H2. These pass through to `engine.retrieve()` for proper tenant isolation during evaluation.

2. **Observability test approach** — Plan specified `patch.object(structlog.get_logger().__class__, "info")` for mocking logs. This doesn't work with structlog's `BoundLoggerLazyProxy`. Tests use `caplog.at_level("INFO")` with a `_extract_log_event()` helper that parses captured log records instead.

3. **CLI tests** — Plan used `subprocess.run(["python", ...])`. Changed to `sys.executable` because the `python` binary isn't available in the venv (only `python3`).

4. **Cache-hit quality computation (H3)** — Plan logged `quality="unknown"` for cache hits. Post-review fix computes quality from cached result via `RetrievalGuardrails(failure_mode="permissive").assess(cached_result)` before logging.

5. **Rerank strategy observability (H1)** — Plan referenced `Reranker.last_strategy_used` which doesn't exist. Changed to `self.reranker.strategy.value` to log the configured strategy.

6. **Exception narrowing (M5)** — The bare `except Exception: pass` around guardrails assessment in observability was narrowed to `except (ImportError, AttributeError): pass`.

7. **EvalDataset.documents** — Added `documents: list[dict]` field to `EvalDataset` dataclass (not in original plan) to support CLI loading documents from the dataset JSON file without a database.

### Test Results

- 264 RAG tests passing (39 new + 225 existing)
- Zero regressions
- All 4 new test files passing

---

## Implementation Checklist

1. [x] Write `test_evaluator.py` — 22 tests
2. [x] Write `test_eval_dataset.py` — 6 tests
3. [x] Write `test_observability.py` — 6 tests (caplog approach)
4. [x] Write `test_evaluator_cli.py` — 5 tests (sys.executable)
5. [x] Create `evaluator.py` — EvalItem, EvalDataset, EvalMetrics, RAGEvaluator, EvalDatasetGenerator, CLI
6. [x] Modify `hybrid_rag.py` — extended log with quality, confidence, query_strategy, rerank_strategy, scope_filter_count, cache_hit
7. [x] Update `__init__.py` — exported 5 new classes
8. [x] Code review fixes applied: H1 (reranker strategy), H2 (tenant_id), H3 (cache quality), M5 (narrow exception)
9. [x] All 264 RAG tests passing