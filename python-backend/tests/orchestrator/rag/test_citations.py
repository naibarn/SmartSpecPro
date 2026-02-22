"""Tests for citation tracking on Document and RAGResult."""

import pytest
from app.orchestrator.rag.hybrid_rag import Document, RAGResult, SearchMode


class TestDocumentCitationFields:
    """Tests for new citation-related fields on Document."""

    def test_chunk_id_default_none(self):
        doc = Document()
        assert doc.chunk_id is None

    def test_parent_doc_id_default_none(self):
        doc = Document()
        assert doc.parent_doc_id is None

    def test_parent_doc_title_default_none(self):
        doc = Document()
        assert doc.parent_doc_title is None

    def test_section_heading_default_none(self):
        doc = Document()
        assert doc.section_heading is None

    def test_to_dict_includes_citation_fields(self):
        doc = Document(
            chunk_id="chunk-1",
            parent_doc_id="pdoc-1",
            parent_doc_title="My Document",
            section_heading="Section A",
        )
        d = doc.to_dict()
        assert d["chunk_id"] == "chunk-1"
        assert d["parent_doc_id"] == "pdoc-1"
        assert d["parent_doc_title"] == "My Document"
        assert d["section_heading"] == "Section A"


class TestDocumentCitationRef:
    """Tests for Document.citation_ref() method."""

    def test_title_and_section(self):
        doc = Document(parent_doc_title="My Report", section_heading="Introduction")
        ref = doc.citation_ref()
        assert "My Report" in ref
        assert "Introduction" in ref

    def test_title_only(self):
        doc = Document(parent_doc_title="My Report")
        ref = doc.citation_ref()
        assert "My Report" in ref
        assert "section" not in ref.lower() or "Introduction" not in ref

    def test_no_title_fallback(self):
        doc = Document()
        ref = doc.citation_ref()
        assert "Unknown" in ref or "unknown" in ref

    def test_returns_string(self):
        doc = Document(parent_doc_title="Title")
        assert isinstance(doc.citation_ref(), str)


class TestRAGResultGetContextWithCitations:
    """Tests for RAGResult.get_context_with_citations() method."""

    def _make_result_with_citations(self) -> RAGResult:
        docs = [
            Document(
                doc_id="d1",
                content="Auth flow uses JWT tokens.",
                final_score=0.9,
                parent_doc_id="pdoc-1",
                parent_doc_title="Project Requirements",
                section_heading="Authentication Flow",
                chunk_id="c1",
            ),
            Document(
                doc_id="d2",
                content="Rate limit is 100 req/min.",
                final_score=0.8,
                parent_doc_id="pdoc-2",
                parent_doc_title="API Documentation",
                section_heading="Rate Limiting",
                chunk_id="c2",
            ),
        ]
        return RAGResult(query="test", documents=docs, final_count=2)

    def test_context_has_source_markers(self):
        result = self._make_result_with_citations()
        context, citations = result.get_context_with_citations()
        assert "[Source 1:" in context
        assert "[Source 2:" in context

    def test_citations_list_per_unique_source(self):
        result = self._make_result_with_citations()
        _, citations = result.get_context_with_citations()
        assert len(citations) == 2

    def test_citations_ordered_by_first_appearance(self):
        result = self._make_result_with_citations()
        _, citations = result.get_context_with_citations()
        assert citations[0]["index"] == 1
        assert citations[1]["index"] == 2

    def test_same_parent_different_sections_distinct_citations(self):
        docs = [
            Document(
                doc_id="d1",
                content="Part one.",
                final_score=0.9,
                parent_doc_id="pdoc-1",
                parent_doc_title="Big Doc",
                section_heading="Section A",
                chunk_id="c1",
            ),
            Document(
                doc_id="d2",
                content="Part two.",
                final_score=0.8,
                parent_doc_id="pdoc-1",
                parent_doc_title="Big Doc",
                section_heading="Section B",
                chunk_id="c2",
            ),
        ]
        result = RAGResult(query="test", documents=docs, final_count=2)
        _, citations = result.get_context_with_citations()
        assert len(citations) == 2

    def test_max_tokens_respected(self):
        docs = [
            Document(
                doc_id=f"d{i}",
                content="x" * 2000,
                final_score=0.9 - i * 0.1,
                parent_doc_title=f"Doc {i}",
                chunk_id=f"c{i}",
            )
            for i in range(10)
        ]
        result = RAGResult(query="test", documents=docs, final_count=10)
        context, citations = result.get_context_with_citations(max_tokens=500)
        # At ~4 chars per token, 500 tokens = ~2000 chars.
        # Each doc is 2000 chars + header. Should include at most 1 doc.
        assert len(citations) <= 2

    def test_empty_documents_returns_empty(self):
        result = RAGResult(query="test", documents=[], final_count=0)
        context, citations = result.get_context_with_citations()
        assert context == ""
        assert citations == []


class TestRAGResultCitationsField:
    """Tests for the citations field on RAGResult."""

    def test_citations_default_empty_list(self):
        result = RAGResult()
        assert result.citations == []

    def test_to_dict_includes_citations(self):
        result = RAGResult(citations=[{"index": 1, "title": "Test"}])
        d = result.to_dict()
        assert "citations" in d
        assert len(d["citations"]) == 1
