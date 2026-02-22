"""
SmartSpec Pro - RAG Evaluator
Phase 5: Evaluation & Observability

Computes retrieval quality metrics (Precision@K, Recall@K, MRR, NDCG@K,
Faithfulness) against ground-truth evaluation datasets. Includes an
EvalDatasetGenerator for auto-generating QA pairs from indexed documents.
"""

from __future__ import annotations

import json
import math
import statistics
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import structlog

logger = structlog.get_logger()


# ---------------------------------------------------------------------------
# Data Structures
# ---------------------------------------------------------------------------

@dataclass
class EvalItem:
    """A single evaluation example."""
    query: str
    expected_answer: str
    expected_doc_ids: list[str]
    tags: list[str] = field(default_factory=list)


@dataclass
class EvalDataset:
    """Collection of evaluation items."""
    items: list[EvalItem]
    documents: list[dict[str, Any]] = field(default_factory=list)

    @classmethod
    def from_json(cls, path: str) -> EvalDataset:
        """Load dataset from a JSON file."""
        p = Path(path)
        if not p.exists():
            raise FileNotFoundError(f"Dataset file not found: {path}")

        data = json.loads(p.read_text())
        items = [
            EvalItem(
                query=item["query"],
                expected_answer=item.get("expected_answer", ""),
                expected_doc_ids=item.get("expected_doc_ids", []),
                tags=item.get("tags", []),
            )
            for item in data.get("items", [])
        ]
        documents = data.get("documents", [])
        return cls(items=items, documents=documents)

    def to_json(self, path: str) -> None:
        """Save dataset to a JSON file."""
        data = {
            "items": [
                {
                    "query": item.query,
                    "expected_answer": item.expected_answer,
                    "expected_doc_ids": item.expected_doc_ids,
                    "tags": item.tags,
                }
                for item in self.items
            ],
            "documents": self.documents,
        }
        Path(path).write_text(json.dumps(data, indent=2))


@dataclass
class EvalMetrics:
    """Aggregated metrics from an evaluation run."""
    precision_at_k: float
    recall_at_k: float
    mrr: float
    ndcg_at_k: float
    faithfulness: float | None  # None when LLM not available
    avg_retrieval_ms: float
    p95_total_ms: float


# ---------------------------------------------------------------------------
# RAGEvaluator
# ---------------------------------------------------------------------------

class RAGEvaluator:
    """Evaluates RAG pipeline quality against ground-truth datasets."""

    def __init__(self, llm_client: Any | None = None):
        self.llm_client = llm_client

    # --- Metric Helpers ---

    def _precision_at_k(
        self, retrieved_ids: list[str], relevant_ids: set[str], k: int,
    ) -> float:
        """Precision@K = relevant docs in top-K / K."""
        if k <= 0 or not retrieved_ids:
            return 0.0
        top_k = retrieved_ids[:k]
        hits = sum(1 for doc_id in top_k if doc_id in relevant_ids)
        return hits / k

    def _recall_at_k(
        self, retrieved_ids: list[str], relevant_ids: set[str], k: int,
    ) -> float:
        """Recall@K = relevant docs in top-K / total relevant."""
        if not relevant_ids:
            return 0.0
        top_k = retrieved_ids[:k]
        hits = sum(1 for doc_id in top_k if doc_id in relevant_ids)
        return hits / len(relevant_ids)

    def _reciprocal_rank(
        self, retrieved_ids: list[str], relevant_ids: set[str],
    ) -> float:
        """Reciprocal Rank = 1 / rank_of_first_relevant."""
        for i, doc_id in enumerate(retrieved_ids, 1):
            if doc_id in relevant_ids:
                return 1.0 / i
        return 0.0

    def _ndcg_at_k(
        self, retrieved_ids: list[str], relevant_ids: set[str], k: int,
    ) -> float:
        """NDCG@K using binary relevance."""
        if k <= 0 or not relevant_ids:
            return 0.0

        top_k = retrieved_ids[:k]

        # DCG
        dcg = 0.0
        for i, doc_id in enumerate(top_k, 1):
            if doc_id in relevant_ids:
                dcg += 1.0 / math.log2(i + 1)

        # IDCG — best possible with min(len(relevant_ids), k) hits at top
        ideal_hits = min(len(relevant_ids), k)
        idcg = 0.0
        for i in range(1, ideal_hits + 1):
            idcg += 1.0 / math.log2(i + 1)

        if idcg == 0.0:
            return 0.0
        return dcg / idcg

    async def _faithfulness(
        self, answer: str, context: str,
    ) -> float | None:
        """Compute faithfulness score using LLM.

        Returns None if self.llm_client is None.
        """
        if self.llm_client is None:
            return None

        # Extract claims and verify against context via LLM
        try:
            claims_response = await self.llm_client.extract_claims(answer)
            if not claims_response:
                return 1.0  # No claims to verify

            supported = 0
            for claim in claims_response:
                is_supported = await self.llm_client.verify_claim(claim, context)
                if is_supported:
                    supported += 1

            return supported / len(claims_response)
        except Exception as e:
            logger.warning("faithfulness_computation_failed", error=str(e))
            return None

    # --- Evaluation ---

    async def evaluate_single(
        self,
        engine: Any,
        item: EvalItem,
        k: int = 5,
        tenant_id: str | None = None,
        effective_scopes: list[str] | None = None,
    ) -> dict[str, Any]:
        """Evaluate a single item and return per-item breakdown."""
        from app.orchestrator.rag.hybrid_rag import SearchMode

        result = await engine.retrieve(
            query=item.query,
            top_k=k,
            mode=SearchMode.HYBRID,
            tenant_id=tenant_id,
            effective_scopes=effective_scopes,
        )

        retrieved_ids = [doc.doc_id for doc in result.documents]
        relevant_ids = set(item.expected_doc_ids)

        precision = self._precision_at_k(retrieved_ids, relevant_ids, k)
        recall = self._recall_at_k(retrieved_ids, relevant_ids, k)
        rr = self._reciprocal_rank(retrieved_ids, relevant_ids)
        ndcg = self._ndcg_at_k(retrieved_ids, relevant_ids, k)

        # Faithfulness
        faith = None
        if self.llm_client and item.expected_answer:
            context_str = result.get_context()
            faith = await self._faithfulness(item.expected_answer, context_str)

        return {
            "query": item.query,
            "retrieved_ids": retrieved_ids,
            "expected_ids": item.expected_doc_ids,
            "precision": precision,
            "recall": recall,
            "reciprocal_rank": rr,
            "ndcg": ndcg,
            "retrieval_ms": result.total_time_ms,
            "faithfulness": faith,
        }

    async def evaluate(
        self,
        engine: Any,
        dataset: EvalDataset,
        k: int = 5,
        tenant_id: str | None = None,
        effective_scopes: list[str] | None = None,
    ) -> EvalMetrics:
        """Run full evaluation across all dataset items."""
        precisions = []
        recalls = []
        rrs = []
        ndcgs = []
        faiths = []
        times_ms = []

        for item in dataset.items:
            breakdown = await self.evaluate_single(
                engine, item, k,
                tenant_id=tenant_id,
                effective_scopes=effective_scopes,
            )
            precisions.append(breakdown["precision"])
            recalls.append(breakdown["recall"])
            rrs.append(breakdown["reciprocal_rank"])
            ndcgs.append(breakdown["ndcg"])
            times_ms.append(breakdown["retrieval_ms"])
            if breakdown["faithfulness"] is not None:
                faiths.append(breakdown["faithfulness"])

        avg_precision = statistics.mean(precisions) if precisions else 0.0
        avg_recall = statistics.mean(recalls) if recalls else 0.0
        avg_mrr = statistics.mean(rrs) if rrs else 0.0
        avg_ndcg = statistics.mean(ndcgs) if ndcgs else 0.0
        avg_faith = statistics.mean(faiths) if faiths else None
        avg_time = statistics.mean(times_ms) if times_ms else 0.0

        # P95 latency
        if times_ms:
            sorted_times = sorted(times_ms)
            p95_idx = int(math.ceil(0.95 * len(sorted_times))) - 1
            p95_time = sorted_times[max(0, p95_idx)]
        else:
            p95_time = 0.0

        return EvalMetrics(
            precision_at_k=avg_precision,
            recall_at_k=avg_recall,
            mrr=avg_mrr,
            ndcg_at_k=avg_ndcg,
            faithfulness=avg_faith,
            avg_retrieval_ms=avg_time,
            p95_total_ms=p95_time,
        )

    def generate_report(self, metrics: EvalMetrics) -> str:
        """Generate a human-readable markdown report."""
        lines = [
            "# RAG Evaluation Report",
            "",
            "## Metrics",
            "",
            "| Metric | Value |",
            "|--------|-------|",
            f"| Precision@K | {metrics.precision_at_k:.3f} |",
            f"| Recall@K | {metrics.recall_at_k:.3f} |",
            f"| MRR | {metrics.mrr:.3f} |",
            f"| NDCG@K | {metrics.ndcg_at_k:.3f} |",
        ]

        if metrics.faithfulness is not None:
            lines.append(f"| Faithfulness | {metrics.faithfulness:.3f} |")
        else:
            lines.append("| Faithfulness | N/A (no LLM) |")

        lines.extend([
            f"| Avg Retrieval (ms) | {metrics.avg_retrieval_ms:.1f} |",
            f"| P95 Latency (ms) | {metrics.p95_total_ms:.1f} |",
            "",
            "## Quality Gates",
            "",
            "| Gate | Threshold | Value | Status |",
            "|------|-----------|-------|--------|",
        ])

        # Quality gates
        recall_pass = metrics.recall_at_k > 0.9
        lines.append(
            f"| Context Recall | > 90% | {metrics.recall_at_k:.1%} | "
            f"{'PASS' if recall_pass else 'FAIL'} |"
        )

        if metrics.faithfulness is not None:
            faith_pass = metrics.faithfulness > 0.8
            lines.append(
                f"| Faithfulness | > 80% | {metrics.faithfulness:.1%} | "
                f"{'PASS' if faith_pass else 'FAIL'} |"
            )
        else:
            lines.append("| Faithfulness | > 80% | N/A | SKIP |")

        mrr_pass = metrics.mrr > 0.6
        lines.append(
            f"| MRR | > 0.6 | {metrics.mrr:.3f} | "
            f"{'PASS' if mrr_pass else 'FAIL'} |"
        )

        latency_pass = metrics.p95_total_ms < 2000
        lines.append(
            f"| P95 Latency | < 2000ms | {metrics.p95_total_ms:.0f}ms | "
            f"{'PASS' if latency_pass else 'FAIL'} |"
        )

        lines.append("")

        return "\n".join(lines)


# ---------------------------------------------------------------------------
# EvalDatasetGenerator
# ---------------------------------------------------------------------------

class EvalDatasetGenerator:
    """Generates QA evaluation pairs from indexed documents."""

    def __init__(self, llm_client: Any | None = None):
        self.llm_client = llm_client

    async def generate(
        self,
        documents: list[Any],
        num_pairs: int = 200,
    ) -> EvalDataset:
        """Generate an evaluation dataset from documents."""
        items: list[EvalItem] = []

        for doc in documents:
            if len(items) >= num_pairs:
                break

            if self.llm_client is not None:
                try:
                    qa_pairs = await self.llm_client.generate_qa(doc.content)
                    for pair in qa_pairs:
                        items.append(EvalItem(
                            query=pair["question"],
                            expected_answer=pair["answer"],
                            expected_doc_ids=[doc.doc_id],
                            tags=list(doc.metadata.get("tags", [])),
                        ))
                except Exception as e:
                    logger.warning("qa_generation_failed", doc_id=doc.doc_id, error=str(e))
            else:
                # Fallback: generate simple question from content
                items.append(EvalItem(
                    query=f"What does the document say about: {doc.content[:50]}?",
                    expected_answer=doc.content[:200],
                    expected_doc_ids=[doc.doc_id],
                    tags=list(doc.metadata.get("tags", [])),
                ))

        # Add hard negatives (~15% of total)
        num_negatives = max(1, int(len(items) * 0.15))
        for i in range(num_negatives):
            items.append(EvalItem(
                query=f"What is the meaning of life according to document {i}?",
                expected_answer="",
                expected_doc_ids=[],
                tags=["hard_negative"],
            ))

        return EvalDataset(items=items)


# ---------------------------------------------------------------------------
# CLI Entrypoint
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    import argparse
    import asyncio
    import sys

    parser = argparse.ArgumentParser(
        description="Run RAG evaluation against a dataset.",
    )
    parser.add_argument(
        "--dataset", required=True,
        help="Path to JSON dataset file",
    )
    parser.add_argument(
        "--k", type=int, default=5,
        help="Number of top results to evaluate (default: 5)",
    )
    parser.add_argument(
        "--output", default=None,
        help="Output file path for markdown report (default: stdout)",
    )

    args = parser.parse_args()

    # Validate dataset path
    if not Path(args.dataset).exists():
        print(f"Error: Dataset file not found: {args.dataset}", file=sys.stderr)
        sys.exit(1)

    try:
        dataset = EvalDataset.from_json(args.dataset)
    except (json.JSONDecodeError, KeyError) as e:
        print(f"Error: Malformed dataset JSON: {e}", file=sys.stderr)
        sys.exit(1)

    async def _run() -> None:
        from app.orchestrator.rag.hybrid_rag import HybridRAGEngine, RAGConfig

        engine = HybridRAGEngine(config=RAGConfig())

        # Load documents from the dataset file if present
        for doc_data in dataset.documents:
            await engine.add_document(
                content=doc_data.get("content", ""),
                metadata=doc_data.get("metadata", {}),
                doc_id=doc_data.get("doc_id"),
            )

        evaluator = RAGEvaluator()
        metrics = await evaluator.evaluate(engine, dataset, k=args.k)
        report = evaluator.generate_report(metrics)

        if args.output:
            Path(args.output).write_text(report)
            print(f"Report written to {args.output}")
        else:
            print(report)

        await engine.cleanup()

    asyncio.run(_run())
