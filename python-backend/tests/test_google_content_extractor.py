"""Tests for GoogleContentExtractor service."""

import pytest
from unittest.mock import MagicMock, patch

from app.services.google_content_extractor import (
    GoogleContentExtractor,
    ContentExtractionResult,
    structure_aware_chunk,
    ExtractionError,
    FileTooLargeError,
    ExtractionTimeoutError,
)


@pytest.fixture
def extractor():
    """Create a GoogleContentExtractor with mock credentials."""
    return GoogleContentExtractor(access_token="fake-token")


# ── Google Docs Extraction ──────────────────────────────────────────


@pytest.mark.unit
class TestExtractGoogleDocs:

    def test_extract_google_docs_returns_markdown_with_heading_structure(self, extractor):
        mock_doc = {
            "title": "Test Doc",
            "body": {
                "content": [
                    {"paragraph": {"paragraphStyle": {"namedStyleType": "HEADING_1"}, "elements": [{"textRun": {"content": "Introduction\n"}}]}},
                    {"paragraph": {"paragraphStyle": {"namedStyleType": "NORMAL_TEXT"}, "elements": [{"textRun": {"content": "Hello world.\n"}}]}},
                    {"paragraph": {"paragraphStyle": {"namedStyleType": "HEADING_2"}, "elements": [{"textRun": {"content": "Details\n"}}]}},
                    {"paragraph": {"paragraphStyle": {"namedStyleType": "NORMAL_TEXT"}, "elements": [{"textRun": {"content": "Some details.\n"}}]}},
                ],
            },
        }
        mock_svc = MagicMock()
        mock_svc.documents().get().execute.return_value = mock_doc
        extractor._docs_service = mock_svc

        with patch.object(extractor, "_docs_service", mock_svc):
            extractor._docs_service = mock_svc
            text, meta = extractor._extract_google_doc("file1")

        assert "# Introduction" in text
        assert "## Details" in text
        assert "Hello world." in text
        assert meta["type"] == "google_doc"

    def test_extract_google_docs_preserves_list_items(self, extractor):
        mock_doc = {
            "title": "List Doc",
            "body": {
                "content": [
                    {"paragraph": {"paragraphStyle": {"namedStyleType": "NORMAL_TEXT"}, "bullet": {}, "elements": [{"textRun": {"content": "Item 1\n"}}]}},
                    {"paragraph": {"paragraphStyle": {"namedStyleType": "NORMAL_TEXT"}, "bullet": {}, "elements": [{"textRun": {"content": "Item 2\n"}}]}},
                ],
            },
        }
        mock_svc = MagicMock()
        mock_svc.documents().get().execute.return_value = mock_doc
        extractor._docs_service = mock_svc

        text, meta = extractor._extract_google_doc("file2")
        assert "- Item 1" in text
        assert "- Item 2" in text

    def test_extract_google_docs_handles_empty_document(self, extractor):
        mock_doc = {"title": "Empty", "body": {"content": []}}
        mock_svc = MagicMock()
        mock_svc.documents().get().execute.return_value = mock_doc
        extractor._docs_service = mock_svc

        text, meta = extractor._extract_google_doc("file3")
        assert text == ""


# ── Google Sheets Extraction ────────────────────────────────────────


@pytest.mark.unit
class TestExtractGoogleSheets:

    def test_extract_google_sheets_returns_csv_like_text_with_headers(self, extractor):
        mock_svc = MagicMock()
        mock_svc.spreadsheets().get().execute.return_value = {
            "properties": {"title": "Test Sheet"},
            "sheets": [{"properties": {"title": "Sheet1", "gridProperties": {"rowCount": 3, "columnCount": 2}}}],
        }
        mock_svc.spreadsheets().values().get().execute.return_value = {
            "values": [["Name", "Age"], ["Alice", "30"], ["Bob", "25"]],
        }
        extractor._sheets_service = mock_svc

        text, meta = extractor._extract_google_sheet("sheet1")
        assert "Sheet: Sheet1" in text
        assert "Name\tAge" in text
        assert "Alice\t30" in text

    def test_extract_google_sheets_handles_multiple_sheets(self, extractor):
        mock_svc = MagicMock()
        mock_svc.spreadsheets().get().execute.return_value = {
            "properties": {"title": "Multi"},
            "sheets": [
                {"properties": {"title": "Sheet1", "gridProperties": {"rowCount": 2, "columnCount": 1}}},
                {"properties": {"title": "Sheet2", "gridProperties": {"rowCount": 2, "columnCount": 1}}},
            ],
        }
        mock_svc.spreadsheets().values().get().execute.side_effect = [
            {"values": [["A"], ["1"]]},
            {"values": [["B"], ["2"]]},
        ]
        extractor._sheets_service = mock_svc

        text, meta = extractor._extract_google_sheet("sheet2")
        assert "Sheet: Sheet1" in text
        assert "Sheet: Sheet2" in text
        assert len(meta["sheet_names"]) == 2

    def test_extract_google_sheets_rejects_over_500k_cells(self, extractor):
        mock_svc = MagicMock()
        mock_svc.spreadsheets().get().execute.return_value = {
            "properties": {"title": "Big"},
            "sheets": [{"properties": {"title": "Sheet1", "gridProperties": {"rowCount": 1000, "columnCount": 1000}}}],
        }
        extractor._sheets_service = mock_svc

        with pytest.raises(FileTooLargeError):
            extractor._extract_google_sheet("big_sheet")


# ── Google Slides Extraction ────────────────────────────────────────


@pytest.mark.unit
class TestExtractGoogleSlides:

    def test_extract_google_slides_returns_per_slide_text(self, extractor):
        mock_svc = MagicMock()
        mock_svc.presentations().get().execute.return_value = {
            "title": "Test Pres",
            "slides": [
                {
                    "pageElements": [
                        {"shape": {"text": {"textElements": [{"textRun": {"content": "Slide Title"}}]}}},
                    ],
                    "slideProperties": {},
                },
            ],
        }
        extractor._slides_service = mock_svc

        text, meta = extractor._extract_google_slides("slides1")
        assert "Slide 1:" in text
        assert "Slide Title" in text

    def test_extract_google_slides_includes_speaker_notes(self, extractor):
        mock_svc = MagicMock()
        mock_svc.presentations().get().execute.return_value = {
            "title": "Notes Pres",
            "slides": [
                {
                    "pageElements": [{"shape": {"text": {"textElements": [{"textRun": {"content": "Content"}}]}}}],
                    "slideProperties": {
                        "notesPage": {
                            "pageElements": [{"shape": {"text": {"textElements": [{"textRun": {"content": "Speaker note here"}}]}}}],
                        },
                    },
                },
            ],
        }
        extractor._slides_service = mock_svc

        text, meta = extractor._extract_google_slides("slides2")
        assert "Notes: Speaker note here" in text


# ── Size Guards ─────────────────────────────────────────────────────


@pytest.mark.unit
class TestSizeGuards:

    def test_extract_rejects_files_larger_than_50mb(self, extractor):
        mock_svc = MagicMock()
        mock_svc.files().get().execute.return_value = {"size": "60000000"}
        extractor._drive_service = mock_svc

        with pytest.raises(FileTooLargeError):
            extractor._check_file_size("big_file", 52_428_800)

    def test_extract_custom_size_guard(self, extractor):
        mock_svc = MagicMock()
        mock_svc.files().get().execute.return_value = {"size": "2000"}
        extractor._drive_service = mock_svc

        with pytest.raises(FileTooLargeError):
            extractor._check_file_size("file", 1000)


# ── Structure-Aware Chunking ────────────────────────────────────────


@pytest.mark.unit
class TestStructureAwareChunking:

    def test_chunk_docs_splits_by_headings(self):
        text = "# Chapter 1\n" + "Word " * 300 + "\n# Chapter 2\n" + "More " * 300
        chunks = structure_aware_chunk(
            text,
            content_type="google_doc",
            file_id="f1",
            file_name="doc.gdoc",
            last_modified="2026-01-01T00:00:00Z",
        )
        assert len(chunks) >= 2
        assert all(c["metadata"]["source"] == "google_drive" for c in chunks)

    def test_chunk_sheets_splits_by_row_groups_with_headers(self):
        header = "Name\tAge\tCity"
        rows = "\n".join([f"Person{i}\t{20+i}\tCity{i}" for i in range(200)])
        text = f"Sheet: Data\n{header}\n{rows}"
        chunks = structure_aware_chunk(
            text,
            content_type="google_sheet",
            file_id="f2",
            file_name="sheet.gsheet",
            last_modified="2026-01-01T00:00:00Z",
            sheet_name="Data",
        )
        assert len(chunks) >= 2
        # Each chunk should contain the header
        for c in chunks:
            assert "Name" in c["content"]
            assert c["metadata"]["sheet_name"] == "Data"

    def test_chunk_slides_splits_per_slide(self):
        text = "Slide 1:\nTitle content\n\nSlide 2:\nMore content\n\nSlide 3:\nFinal"
        chunks = structure_aware_chunk(
            text,
            content_type="google_slides",
            file_id="f3",
            file_name="pres.gslides",
            last_modified="2026-01-01T00:00:00Z",
        )
        assert len(chunks) == 3
        assert chunks[0]["metadata"]["slide_number"] == 1
        assert chunks[2]["metadata"]["slide_number"] == 3

    def test_chunk_preserves_heading_hierarchy_in_metadata(self):
        text = "# Main\nIntro text here with enough words to meet the minimum.\n## Sub\nSub text here with enough words to meet the minimum for the chunk."
        chunks = structure_aware_chunk(
            text,
            content_type="google_doc",
            file_id="f4",
            file_name="doc.gdoc",
            last_modified="2026-01-01T00:00:00Z",
            min_tokens=1,
        )
        has_hierarchy = any("heading_hierarchy" in c["metadata"] for c in chunks)
        assert has_hierarchy

    def test_chunks_include_correct_metadata(self):
        text = "Some plain text content for testing metadata inclusion."
        chunks = structure_aware_chunk(
            text,
            content_type="plain",
            file_id="f5",
            file_name="test.txt",
            last_modified="2026-02-14T10:00:00Z",
        )
        assert len(chunks) >= 1
        meta = chunks[0]["metadata"]
        assert meta["file_id"] == "f5"
        assert meta["file_name"] == "test.txt"
        assert meta["source"] == "google_drive"
        assert meta["last_modified"] == "2026-02-14T10:00:00Z"
