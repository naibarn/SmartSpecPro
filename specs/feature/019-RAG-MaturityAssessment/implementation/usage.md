# RAG Maturity Assessment — Usage Guide

## Overview

The RAG Maturity Upgrade adds enterprise-grade retrieval-augmented generation to SmartSpecPro. It spans 8 implementation sections covering ACL/scopes, chunking, hybrid search, reranking, guardrails, execution, evaluation, and observability.

**Module location:** `python-backend/app/orchestrator/rag/`
**Test location:** `python-backend/tests/orchestrator/rag/`

---

## Quick Start

### Running the RAG Pipeline

The RAG executor is the main entry point, called by the orchestrator when a workflow node type is `rag_retrieval`:

```python
from app.orchestrator.node_executors.rag_executor import RAGExecutor

executor = RAGExecutor()
result = await executor.execute(node_data, execution_context)
# Returns: { documents, context, citations, quality, metadata }
```

### Running Evaluation

Evaluate RAG quality against a ground-truth dataset:

```bash
cd python-backend
python -m app.orchestrator.rag.evaluator \
    --dataset tests/fixtures/rag_eval_dataset.json \
    --k 5 \
    --output evaluation-report.md
```

### Running Tests

```bash
cd python-backend
# All RAG tests
.venv/bin/python -m pytest tests/orchestrator/rag/ -v

# Specific test file
.venv/bin/python -m pytest tests/orchestrator/rag/test_evaluator.py -v

# With coverage
.venv/bin/python -m pytest tests/orchestrator/rag/ --cov=app/orchestrator/rag
```

---

## Module Architecture

```
app/orchestrator/rag/
├── __init__.py              # Public exports
├── hybrid_rag.py            # HybridRAGEngine (main search orchestrator)
├── bm25_retriever.py        # BM25 keyword retrieval with scope filtering
├── vector_retriever.py      # Vector similarity retrieval with scope filtering
├── reranker.py              # Multi-strategy reranking (cross-encoder, Cohere, LLM, heuristic)
├── query_processor.py       # Query rewriting (passthrough, rewrite, HyDE, multi-query, step-back)
├── query_router.py          # Intent classification (knowledge/conversational/creative)
├── guardrails.py            # Quality assessment and failure modes
├── scope_engine.py          # ACL scope computation and propagation
├── chunker.py               # Smart chunking (recursive, markdown, code) with parent-child
├── evaluator.py             # RAG evaluation metrics + CLI + dataset generator
└── (node_executors/)
    └── rag_executor.py      # Production executor (DB → engine → response)
```

---

## Key Components

### 1. Scope Engine (`scope_engine.py`)

Computes effective scopes for a user based on their direct permissions and group memberships:

```python
from app.orchestrator.rag.scope_engine import compute_effective_scopes

scopes = await compute_effective_scopes(
    user_id="user-123",
    library_item_id="item-456",
    session=db_session,
)
# Returns: ["u:user-123", "g:team-a", "p:global"]
```

### 2. Smart Chunker (`chunker.py`)

Chunks documents with strategy auto-detection:

```python
from app.orchestrator.rag.chunker import SmartChunker, ChunkConfig

chunker = SmartChunker(config=ChunkConfig(
    max_tokens=512,
    overlap_tokens=50,
    strategy="auto",  # auto-detects markdown/code/recursive
))
chunks = chunker.chunk(document_content, metadata={"title": "..."})
```

### 3. Hybrid Search (`hybrid_rag.py`)

Combines BM25 + vector search with reciprocal rank fusion:

```python
from app.orchestrator.rag import HybridRAGEngine, RAGConfig, SearchMode

engine = HybridRAGEngine(config=RAGConfig(
    mode=SearchMode.HYBRID,
    top_k=10,
    use_rerank=True,
    use_cache=True,
))

result = await engine.retrieve(
    query="What is the refund policy?",
    tenant_id="tenant-abc",
    effective_scopes=["u:user-123", "g:team-a"],
    top_k=5,
)
# result.documents, result.total_time_ms, result.final_count
```

### 4. Reranker (`reranker.py`)

Multi-strategy reranking with automatic fallback:

```python
from app.orchestrator.rag import Reranker, RerankStrategy

reranker = Reranker(strategy=RerankStrategy.CROSS_ENCODER)
# Fallback chain: CROSS_ENCODER → COHERE → LLM → HEURISTIC
reranked = await reranker.rerank(query, documents, top_k=5)
```

### 5. Guardrails (`guardrails.py`)

Quality assessment with configurable failure modes:

```python
from app.orchestrator.rag import RetrievalGuardrails, RetrievalQuality

guardrails = RetrievalGuardrails(failure_mode="strict")
assessment = guardrails.assess(rag_result)
# assessment.quality: HIGH/MEDIUM/LOW/FAILED
# assessment.confidence_score: 0.0-1.0
# assessment.should_respond: bool
```

### 6. Query Router (`query_router.py`)

Classifies query intent to decide retrieval strategy:

```python
from app.orchestrator.rag import QueryRouter, QueryIntent

router = QueryRouter()
decision = router.route("What is the refund policy?")
# decision.intent: KNOWLEDGE/CONVERSATIONAL/CREATIVE
# decision.should_retrieve: bool
```

### 7. RAG Evaluator (`evaluator.py`)

Computes retrieval quality metrics:

```python
from app.orchestrator.rag import RAGEvaluator, EvalDataset

evaluator = RAGEvaluator(llm_client=optional_llm)
dataset = EvalDataset.from_json("eval_dataset.json")
metrics = await evaluator.evaluate(engine, dataset, k=5)
# metrics: precision_at_k, recall_at_k, mrr, ndcg_at_k, faithfulness
report = evaluator.generate_report(metrics)
```

**Quality gate thresholds:**

| Metric | Threshold | Pass Condition |
|--------|-----------|----------------|
| Context Recall | 90% | `recall_at_k > 0.9` |
| Faithfulness | 80% | `faithfulness > 0.8` |
| MRR | 0.6 | `mrr > 0.6` |
| P95 Latency | 2000ms | `p95_total_ms < 2000` |

---

## Observability

The `rag_retrieval_complete` structured log event includes:

| Field | Type | Description |
|-------|------|-------------|
| `query` | str | Truncated query (50 chars) |
| `mode` | str | Search mode (hybrid/keyword/semantic/fast) |
| `results` | int | Number of results returned |
| `total_ms` | int | Total retrieval time |
| `quality` | str | Quality assessment (high/medium/low/failed) |
| `confidence` | float | Confidence score (0.0-1.0) |
| `query_strategy` | str | Query processing strategy used |
| `rerank_strategy` | str | Reranking strategy used |
| `scope_filter_count` | int | Number of scope filters applied |
| `cache_hit` | bool | Whether result was from cache |

---

## Evaluation Dataset Format

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
      "content": "Our refund policy allows returns within 30 days.",
      "metadata": {"title": "Policies"}
    }
  ]
}
```

---

## Configuration

### RAGConfig Options

| Parameter | Default | Description |
|-----------|---------|-------------|
| `mode` | `HYBRID` | Search mode |
| `top_k` | 10 | Number of results |
| `use_rerank` | True | Enable reranking |
| `use_cache` | True | Enable result caching |
| `cache_ttl_seconds` | 300 | Cache TTL |
| `bm25_weight` | 0.3 | BM25 weight in RRF |
| `vector_weight` | 0.7 | Vector weight in RRF |
| `rrf_k` | 60 | RRF constant |
| `rerank_top_k` | 10 | Reranking candidate count |

### Tenant Settings

| Setting | Values | Description |
|---------|--------|-------------|
| `rag_failure_mode` | `strict` / `permissive` | How to handle low-quality results |

Enterprise tenants default to `strict` (blocks FAILED quality responses). Others default to `permissive`.
