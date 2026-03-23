"""Tests for RAG content-hash deduplication in hybrid_rag.py."""

from __future__ import annotations

import pytest

from app.orchestrator.rag.hybrid_rag import Document, deduplicate_chunks


def _make_doc(content: str, score: float, doc_id: str = "") -> Document:
    doc = Document(content=content)
    doc.final_score = score
    if doc_id:
        doc.doc_id = doc_id
    return doc


class TestDeduplicateChunks:
    def test_duplicate_chunks_removed_highest_score_kept(self):
        """Duplicate chunks should be removed, keeping the highest-scored one."""
        chunks = [
            _make_doc("The quick brown fox", 0.9, "a"),
            _make_doc("Some other content", 0.85, "b"),
            _make_doc("The quick brown fox", 0.8, "c"),  # duplicate of 'a'
        ]

        result = deduplicate_chunks(chunks)

        assert len(result) == 2
        # The higher-scored duplicate should be kept
        result_ids = [d.doc_id for d in result]
        assert "a" in result_ids
        assert "c" not in result_ids

    def test_near_duplicate_via_content_hash(self):
        """Near-duplicates (same content after normalization) should be deduped."""
        chunks = [
            _make_doc("The quick brown fox", 0.9, "a"),
            _make_doc("  The Quick Brown Fox  ", 0.8, "b"),  # same after strip+lower
        ]

        result = deduplicate_chunks(chunks)

        assert len(result) == 1
        assert result[0].doc_id == "a"
        assert result[0].final_score == 0.9

    def test_different_content_chunks_preserved(self):
        """Chunks with unique content should all be preserved."""
        chunks = [
            _make_doc("Alpha content", 0.9, "a"),
            _make_doc("Beta content", 0.8, "b"),
            _make_doc("Gamma content", 0.7, "c"),
            _make_doc("Delta content", 0.6, "d"),
            _make_doc("Epsilon content", 0.5, "e"),
        ]

        result = deduplicate_chunks(chunks)

        assert len(result) == 5

    def test_dedup_preserves_ranking_order(self):
        """After dedup, chunks should still be sorted by score descending."""
        chunks = [
            _make_doc("Content A", 0.95, "a"),
            _make_doc("Content B", 0.90, "b"),
            _make_doc("Content A", 0.85, "c"),  # dup of 'a'
            _make_doc("Content C", 0.80, "d"),
            _make_doc("Content B", 0.75, "e"),  # dup of 'b'
        ]

        result = deduplicate_chunks(chunks)

        assert len(result) == 3
        scores = [d.final_score for d in result]
        assert scores == sorted(scores, reverse=True)

    def test_empty_input(self):
        """Empty input should return empty output."""
        result = deduplicate_chunks([])
        assert result == []

    def test_single_chunk(self):
        """Single chunk should pass through."""
        chunks = [_make_doc("Solo content", 0.9, "a")]
        result = deduplicate_chunks(chunks)
        assert len(result) == 1
        assert result[0].doc_id == "a"
