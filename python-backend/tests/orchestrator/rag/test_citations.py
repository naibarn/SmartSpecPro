"""Tests for citation tracking on Document and RAGResult."""

import pytest
from app.orchestrator.rag.hybrid_rag import Document, RAGResult, SearchMode


# ---------------------------------------------------------------------------
# Document.citation_ref()
# ---------------------------------------------------------------------------

class TestDocumentCitationRef:
    """Tests for Document.citation_ref() method."""

    def test_title_and_section(self):
        """Document with parent_doc_title and section_heading returns formatted ref."""
        doc = Document(
            doc_id="d1",
            content="Some content",
            parent_doc_title="Project Requirements",
            section_heading="Authentication Flow",
        )
        ref = doc.citation_ref()
        assert ref == "[Project Requirements - section Authentication Flow]"

    def test_title_only(self):
        """Document with title but no section returns title-only ref."""
        doc = Document(
            doc_id="d1",
            content="Some content",
            parent_doc_title="API Documentation",
        )
        ref = doc.citation_ref()
        assert ref == "[API Documentation]"

    def test_no_title_no_section(self):
        """Document with neither title nor heading returns fallback."""
        doc = Document(doc_id="d1", content="Some content")
        ref = doc.citation_ref()
        assert ref == "[Unknown Source]"

    def test_citation_ref_returns_string(self):
        """citation_ref should always return a string."""
        doc = Document(doc_id="d1", content="Content")
        assert isinstance(doc.citation_ref(), str)


# ---------------------------------------------------------------------------
# RAGResult.get_context_with_citations()
# ---------------------------------------------------------------------------

class TestRAGResultGetContextWithCitations:
    """Tests for RAGResult.get_context_with_citations() method."""

    def _make_result(self, docs: list[Document]) -> RAGResult:
        return RAGResult(query="test", documents=docs, final_count=len(docs))

    def test_context_includes_source_markers(self):
        """Context should include [Source N: ...] markers inline."""
        docs = [
            Document(
                doc_id="d1",
                content="Auth details here.",
                parent_doc_title="Requirements",
                parent_doc_id="pdoc-1",
                section_heading="Auth",
            ),
            Document(
                doc_id="d2",
                content="Rate limiting info.",
                parent_doc_title="API Docs",
                parent_doc_id="pdoc-2",
                section_heading="Limits",
            ),
        ]
        result = self._make_result(docs)
        context, citations = result.get_context_with_citations()
        assert "[Source 1:" in context
        assert "[Source 2:" in context

    def test_citations_list_per_unique_source(self):
        """Citations list should have one entry per unique source document."""
        docs = [
            Document(
                doc_id="d1",
                content="Part A",
                parent_doc_id="pdoc-1",
                parent_doc_title="Doc A",
                section_heading="S1",
            ),
            Document(
                doc_id="d2",
                content="Part B",
                parent_doc_id="pdoc-1",
                parent_doc_title="Doc A",
                section_heading="S2",
            ),
        ]
        result = self._make_result(docs)
        _, citations = result.get_context_with_citations()
        # Different sections = distinct citations
        assert len(citations) == 2

    def test_citations_ordered_by_first_appearance(self):
        """Citations should be ordered by their first appearance."""
        docs = [
            Document(
                doc_id="d1",
                content="First",
                parent_doc_id="pdoc-1",
                parent_doc_title="Alpha",
                section_heading="S1",
            ),
            Document(
                doc_id="d2",
                content="Second",
                parent_doc_id="pdoc-2",
                parent_doc_title="Beta",
                section_heading="S1",
            ),
        ]
        result = self._make_result(docs)
        _, citations = result.get_context_with_citations()
        assert citations[0]["title"] == "Alpha"
        assert citations[1]["title"] == "Beta"

    def test_same_parent_different_sections(self):
        """Multiple chunks from same parent but different sections get distinct citations."""
        docs = [
            Document(
                doc_id="d1",
                content="Overview",
                parent_doc_id="pdoc-1",
                parent_doc_title="Spec",
                section_heading="Intro",
            ),
            Document(
                doc_id="d2",
                content="Details",
                parent_doc_id="pdoc-1",
                parent_doc_title="Spec",
                section_heading="Implementation",
            ),
        ]
        result = self._make_result(docs)
        _, citations = result.get_context_with_citations()
        assert len(citations) == 2

    def test_max_tokens_respected(self):
        """Context should not exceed max_tokens budget."""
        long_content = "word " * 2000  # ~2000 tokens (10000 chars)
        docs = [
            Document(
                doc_id="d1",
                content=long_content,
                parent_doc_title="Long Doc",
            ),
            Document(
                doc_id="d2",
                content="Short content.",
                parent_doc_title="Short Doc",
            ),
        ]
        result = self._make_result(docs)
        context, _ = result.get_context_with_citations(max_tokens=500)
        # 500 tokens * ~4 chars/token = ~2000 chars + header overhead
        # Context should be bounded well below the raw 10000 char content
        assert len(context) < 2500

    def test_empty_documents_returns_empty(self):
        """Empty documents list should return empty context and empty citations."""
        result = self._make_result([])
        context, citations = result.get_context_with_citations()
        assert context == ""
        assert citations == []


# ---------------------------------------------------------------------------
# Document citation fields
# ---------------------------------------------------------------------------

class TestDocumentCitationFields:
    """Tests for new citation-related fields on Document."""

    def test_chunk_id_default_none(self):
        doc = Document(doc_id="d1", content="test")
        assert doc.chunk_id is None

    def test_parent_doc_id_default_none(self):
        doc = Document(doc_id="d1", content="test")
        assert doc.parent_doc_id is None

    def test_parent_doc_title_default_none(self):
        doc = Document(doc_id="d1", content="test")
        assert doc.parent_doc_title is None

    def test_section_heading_default_none(self):
        doc = Document(doc_id="d1", content="test")
        assert doc.section_heading is None

    def test_to_dict_includes_citation_fields(self):
        doc = Document(
            doc_id="d1",
            content="test",
            chunk_id="chunk-1",
            parent_doc_id="pdoc-1",
            parent_doc_title="My Doc",
            section_heading="Intro",
        )
        d = doc.to_dict()
        assert d["chunk_id"] == "chunk-1"
        assert d["parent_doc_id"] == "pdoc-1"
        assert d["parent_doc_title"] == "My Doc"
        assert d["section_heading"] == "Intro"
