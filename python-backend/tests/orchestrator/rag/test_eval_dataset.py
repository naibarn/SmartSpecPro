"""Tests for EvalDatasetGenerator -- Phase 5.2."""

import pytest
from unittest.mock import AsyncMock, MagicMock

from app.orchestrator.rag.evaluator import (
    EvalDatasetGenerator,
    EvalItem,
    EvalDataset,
)
from app.orchestrator.rag.hybrid_rag import Document


@pytest.fixture
def generator():
    return EvalDatasetGenerator()


@pytest.fixture
def sample_documents():
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
    @pytest.mark.asyncio
    async def test_generates_qa_pairs(self, generator, sample_documents):
        """Generator must produce EvalItem objects from documents."""
        dataset = await generator.generate(sample_documents, num_pairs=3)
        assert isinstance(dataset, EvalDataset)
        # Should have at least the requested pairs + hard negatives
        assert len(dataset.items) >= 3

    @pytest.mark.asyncio
    async def test_each_pair_has_required_fields(self, generator, sample_documents):
        """Each EvalItem must have query, expected_answer, expected_doc_ids."""
        dataset = await generator.generate(sample_documents, num_pairs=2)
        for item in dataset.items:
            assert isinstance(item, EvalItem)
            assert item.query
            assert isinstance(item.expected_doc_ids, list)

    @pytest.mark.asyncio
    async def test_expected_doc_ids_point_to_source(self, generator, sample_documents):
        """expected_doc_ids must reference the source document's doc_id."""
        dataset = await generator.generate(sample_documents, num_pairs=3)
        valid_ids = {doc.doc_id for doc in sample_documents}
        for item in dataset.items:
            if "hard_negative" not in item.tags:
                for doc_id in item.expected_doc_ids:
                    assert doc_id in valid_ids


class TestHardNegatives:
    @pytest.mark.asyncio
    async def test_hard_negatives_included(self, generator, sample_documents):
        """Dataset must include items with empty expected_doc_ids."""
        dataset = await generator.generate(sample_documents, num_pairs=5)
        negatives = [i for i in dataset.items if not i.expected_doc_ids]
        assert len(negatives) >= 1

    @pytest.mark.asyncio
    async def test_hard_negatives_have_clear_tags(self, generator, sample_documents):
        """Hard negative items must be tagged with 'hard_negative'."""
        dataset = await generator.generate(sample_documents, num_pairs=5)
        negatives = [i for i in dataset.items if not i.expected_doc_ids]
        for neg in negatives:
            assert "hard_negative" in neg.tags


class TestDatasetSize:
    @pytest.mark.asyncio
    async def test_minimum_pair_count(self, generator, sample_documents):
        """Dataset must have at least the requested num_pairs items."""
        dataset = await generator.generate(sample_documents, num_pairs=3)
        assert len(dataset.items) >= 3
