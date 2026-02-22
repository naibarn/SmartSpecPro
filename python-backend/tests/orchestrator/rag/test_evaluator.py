"""Tests for RAGEvaluator -- Phase 5.1."""

import math
import pytest
from unittest.mock import AsyncMock, MagicMock

from app.orchestrator.rag.evaluator import (
    RAGEvaluator,
    EvalItem,
    EvalDataset,
    EvalMetrics,
)
from app.orchestrator.rag.hybrid_rag import Document, RAGResult, SearchMode


@pytest.fixture
def evaluator():
    return RAGEvaluator()


@pytest.fixture
def sample_eval_items():
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
    return EvalDataset(items=sample_eval_items)


# ---------------------------------------------------------------------------
# Precision@K
# ---------------------------------------------------------------------------

class TestPrecisionAtK:
    def test_precision_3_of_5(self, evaluator):
        retrieved_ids = ["doc-1", "doc-2", "doc-x", "doc-3", "doc-y"]
        relevant_ids = {"doc-1", "doc-2", "doc-3"}
        precision = evaluator._precision_at_k(retrieved_ids, relevant_ids, k=5)
        assert abs(precision - 0.6) < 1e-9

    def test_precision_all_relevant(self, evaluator):
        retrieved_ids = ["doc-1", "doc-2", "doc-3"]
        relevant_ids = {"doc-1", "doc-2", "doc-3"}
        precision = evaluator._precision_at_k(retrieved_ids, relevant_ids, k=3)
        assert abs(precision - 1.0) < 1e-9

    def test_precision_none_relevant(self, evaluator):
        retrieved_ids = ["doc-x", "doc-y"]
        relevant_ids = {"doc-1", "doc-2"}
        precision = evaluator._precision_at_k(retrieved_ids, relevant_ids, k=2)
        assert abs(precision - 0.0) < 1e-9

    def test_precision_empty_results(self, evaluator):
        precision = evaluator._precision_at_k([], {"doc-1"}, k=5)
        assert precision == 0.0


# ---------------------------------------------------------------------------
# Recall@K
# ---------------------------------------------------------------------------

class TestRecallAtK:
    def test_recall_3_of_10(self, evaluator):
        retrieved_ids = ["doc-1", "doc-x", "doc-2", "doc-3", "doc-y"]
        relevant_ids = {f"doc-{i}" for i in range(1, 11)}
        recall = evaluator._recall_at_k(retrieved_ids, relevant_ids, k=5)
        assert abs(recall - 0.3) < 1e-9

    def test_recall_all_found(self, evaluator):
        retrieved_ids = ["doc-1", "doc-2"]
        relevant_ids = {"doc-1", "doc-2"}
        recall = evaluator._recall_at_k(retrieved_ids, relevant_ids, k=5)
        assert abs(recall - 1.0) < 1e-9

    def test_recall_no_relevant_docs(self, evaluator):
        recall = evaluator._recall_at_k(["doc-x"], set(), k=5)
        assert recall == 0.0


# ---------------------------------------------------------------------------
# MRR
# ---------------------------------------------------------------------------

class TestMRR:
    def test_mrr_first_at_3(self, evaluator):
        retrieved_ids = ["doc-x", "doc-y", "doc-1", "doc-2"]
        relevant_ids = {"doc-1", "doc-2"}
        rr = evaluator._reciprocal_rank(retrieved_ids, relevant_ids)
        assert abs(rr - 1 / 3) < 1e-9

    def test_mrr_first_at_1(self, evaluator):
        retrieved_ids = ["doc-1", "doc-x"]
        relevant_ids = {"doc-1"}
        rr = evaluator._reciprocal_rank(retrieved_ids, relevant_ids)
        assert abs(rr - 1.0) < 1e-9

    def test_mrr_none_relevant(self, evaluator):
        retrieved_ids = ["doc-x", "doc-y"]
        relevant_ids = {"doc-1"}
        rr = evaluator._reciprocal_rank(retrieved_ids, relevant_ids)
        assert rr == 0.0


# ---------------------------------------------------------------------------
# NDCG@K
# ---------------------------------------------------------------------------

class TestNDCG:
    def test_ndcg_binary_relevance(self, evaluator):
        retrieved_ids = ["doc-1", "doc-x", "doc-2", "doc-y", "doc-3"]
        relevant_ids = {"doc-1", "doc-2", "doc-3"}
        ndcg = evaluator._ndcg_at_k(retrieved_ids, relevant_ids, k=5)
        dcg = 1.0 / math.log2(2) + 1.0 / math.log2(4) + 1.0 / math.log2(6)
        idcg = 1.0 / math.log2(2) + 1.0 / math.log2(3) + 1.0 / math.log2(4)
        expected = dcg / idcg
        assert abs(ndcg - expected) < 1e-6

    def test_ndcg_perfect_ranking(self, evaluator):
        retrieved_ids = ["doc-1", "doc-2", "doc-3"]
        relevant_ids = {"doc-1", "doc-2", "doc-3"}
        ndcg = evaluator._ndcg_at_k(retrieved_ids, relevant_ids, k=3)
        assert abs(ndcg - 1.0) < 1e-9

    def test_ndcg_no_relevant(self, evaluator):
        retrieved_ids = ["doc-x", "doc-y"]
        relevant_ids = {"doc-1"}
        ndcg = evaluator._ndcg_at_k(retrieved_ids, relevant_ids, k=2)
        assert ndcg == 0.0


# ---------------------------------------------------------------------------
# Faithfulness
# ---------------------------------------------------------------------------

class TestFaithfulness:
    @pytest.mark.asyncio
    async def test_faithfulness_all_supported(self):
        llm = AsyncMock()
        llm.extract_claims = AsyncMock(return_value=["claim1", "claim2"])
        llm.verify_claim = AsyncMock(return_value=True)
        evaluator = RAGEvaluator(llm_client=llm)
        result = await evaluator._faithfulness("answer", "context")
        assert result == 1.0

    @pytest.mark.asyncio
    async def test_faithfulness_partial(self):
        llm = AsyncMock()
        llm.extract_claims = AsyncMock(return_value=["c1", "c2", "c3", "c4"])
        llm.verify_claim = AsyncMock(side_effect=[True, True, False, False])
        evaluator = RAGEvaluator(llm_client=llm)
        result = await evaluator._faithfulness("answer", "context")
        assert abs(result - 0.5) < 1e-9

    @pytest.mark.asyncio
    async def test_faithfulness_none_supported(self):
        llm = AsyncMock()
        llm.extract_claims = AsyncMock(return_value=["c1", "c2"])
        llm.verify_claim = AsyncMock(return_value=False)
        evaluator = RAGEvaluator(llm_client=llm)
        result = await evaluator._faithfulness("answer", "context")
        assert result == 0.0

    @pytest.mark.asyncio
    async def test_faithfulness_skipped_without_llm(self, evaluator):
        result = await evaluator._faithfulness("answer", "context")
        assert result is None


# ---------------------------------------------------------------------------
# Evaluate Dataset
# ---------------------------------------------------------------------------

class TestEvaluateDataset:
    @pytest.mark.asyncio
    async def test_evaluate_returns_all_metrics(self, evaluator, sample_dataset):
        engine = AsyncMock()
        engine.retrieve = AsyncMock(return_value=RAGResult(
            query="test",
            documents=[
                Document(doc_id="doc-1", content="test", final_score=0.9),
                Document(doc_id="doc-3", content="test", final_score=0.8),
            ],
            final_count=2,
            total_time_ms=100,
        ))
        metrics = await evaluator.evaluate(engine, sample_dataset, k=5)
        assert isinstance(metrics, EvalMetrics)
        assert metrics.precision_at_k >= 0
        assert metrics.recall_at_k >= 0
        assert metrics.mrr >= 0
        assert metrics.ndcg_at_k >= 0
        assert metrics.avg_retrieval_ms >= 0

    @pytest.mark.asyncio
    async def test_evaluate_single_returns_per_item(self, evaluator, sample_eval_items):
        engine = AsyncMock()
        engine.retrieve = AsyncMock(return_value=RAGResult(
            query="test",
            documents=[Document(doc_id="doc-1", content="test", final_score=0.9)],
            final_count=1,
            total_time_ms=50,
        ))
        result = await evaluator.evaluate_single(engine, sample_eval_items[0], k=5)
        assert "query" in result
        assert "retrieved_ids" in result
        assert "precision" in result
        assert "recall" in result
        assert "reciprocal_rank" in result
        assert "ndcg" in result


# ---------------------------------------------------------------------------
# Report Generation
# ---------------------------------------------------------------------------

class TestReportGeneration:
    def test_report_contains_metrics(self, evaluator):
        metrics = EvalMetrics(
            precision_at_k=0.6, recall_at_k=0.3, mrr=0.333,
            ndcg_at_k=0.75, faithfulness=0.8,
            avg_retrieval_ms=145.0, p95_total_ms=320.0,
        )
        report = evaluator.generate_report(metrics)
        assert "Precision@K" in report
        assert "Recall@K" in report
        assert "MRR" in report
        assert "NDCG@K" in report
        assert "Faithfulness" in report
        assert "0.6" in report

    def test_report_includes_quality_gates(self, evaluator):
        metrics = EvalMetrics(
            precision_at_k=0.6, recall_at_k=0.95, mrr=0.7,
            ndcg_at_k=0.8, faithfulness=0.85,
            avg_retrieval_ms=145.0, p95_total_ms=1500.0,
        )
        report = evaluator.generate_report(metrics)
        assert "PASS" in report

    def test_report_shows_failing_gates(self, evaluator):
        metrics = EvalMetrics(
            precision_at_k=0.2, recall_at_k=0.3, mrr=0.2,
            ndcg_at_k=0.4, faithfulness=0.5,
            avg_retrieval_ms=500.0, p95_total_ms=3000.0,
        )
        report = evaluator.generate_report(metrics)
        assert "FAIL" in report
