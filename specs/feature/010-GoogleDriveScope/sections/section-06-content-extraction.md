Now I have enough context to generate the section. Let me compile everything for section-06-content-extraction.

# Section 6: Content Extraction Service

## Overview

This section implements the `GoogleContentExtractor` class in the Python backend, which extracts text content from Google Drive files for RAG indexing (used by Section 8: Virtual References & Indexing) and MCP reads (used by Section 9: MCP Server). It uses Google's structured APIs (Docs, Sheets, Slides) for high-quality extraction with structure-aware chunking that preserves semantic boundaries like headings and slide numbers.

## Dependencies

- **Section 03 (OAuth Consent):** Requires `GoogleTokenService` to obtain valid access tokens for Google API calls. The `GoogleTokenService` class is expected to exist at `python-backend/app/services/google_token_service.py` and provide `get_valid_access_token(user_id) -> str`.
- **Python dependencies:** `google-api-python-client`, `google-auth`, `google-auth-httplib2` must be added to `python-backend/requirements.txt`.

## Files to Create

- `python-backend/app/services/google_content_extractor.py` -- Main extraction service
- `python-backend/tests/test_google_content_extractor.py` -- Tests

## Files to Modify

- `python-backend/requirements.txt` -- Add Google API client dependencies

## New Dependencies (requirements.txt)

Add the following lines to `python-backend/requirements.txt`:

```
# Google API client libraries (Drive, Docs, Sheets, Slides)
google-api-python-client>=2.100.0
google-auth>=2.23.0
google-auth-httplib2>=0.2.0
```

These packages provide:
- `googleapiclient.discovery.build(...)` for constructing typed API clients for Drive, Docs, Sheets, Slides
- `google.oauth2.credentials.Credentials` for wrapping access tokens
- Automatic retry, pagination, and error handling built into the discovery client

## Tests (Write First)

Create `python-backend/tests/test_google_content_extractor.py`. All tests use `@pytest.mark.unit` and mock the Google API HTTP calls using the `responses` library or `unittest.mock.patch` on the `googleapiclient.discovery.build` return values.

### Test File Structure

```python
"""Tests for GoogleContentExtractor service."""

import pytest
from unittest.mock import MagicMock, patch, AsyncMock
from app.services.google_content_extractor import (
    GoogleContentExtractor,
    ContentExtractionResult,
    structure_aware_chunk,
    ExtractionError,
    FileTooLargeError,
    ExtractionTimeoutError,
)


# ── Fixtures ────────────────────────────────────────────────────────


@pytest.fixture
def extractor():
    """Create a GoogleContentExtractor instance with a mock access token."""
    return GoogleContentExtractor(access_token="fake-token")


@pytest.fixture
def mock_docs_service():
    """Mock Google Docs API service."""
    # Return a mock that simulates googleapiclient.discovery.build("docs", "v1", ...)
    ...


@pytest.fixture
def mock_sheets_service():
    """Mock Google Sheets API service."""
    ...


@pytest.fixture
def mock_slides_service():
    """Mock Google Slides API service."""
    ...


@pytest.fixture
def mock_drive_service():
    """Mock Google Drive API service."""
    ...


# ── Google Docs Extraction ──────────────────────────────────────────


@pytest.mark.unit
class TestExtractGoogleDocs:
    """Test extraction from Google Docs using the Docs API."""

    def test_extract_google_docs_returns_markdown_with_heading_structure(self, extractor):
        """
        Given a Google Docs document with headings and body text,
        extract() should return markdown-formatted text preserving the heading hierarchy.
        The Docs API response (documents.get) includes body.content with
        paragraph elements that have namedStyleType (HEADING_1, HEADING_2, NORMAL_TEXT).
        """
        ...

    def test_extract_google_docs_preserves_list_items(self, extractor):
        """Lists in Google Docs should appear as bullet points in the extracted text."""
        ...

    def test_extract_google_docs_handles_empty_document(self, extractor):
        """An empty Google Doc should return an empty string without error."""
        ...


# ── Google Sheets Extraction ────────────────────────────────────────


@pytest.mark.unit
class TestExtractGoogleSheets:
    """Test extraction from Google Sheets using the Sheets API."""

    def test_extract_google_sheets_returns_csv_like_text_with_headers(self, extractor):
        """
        Given a Google Sheets spreadsheet with column headers in row 1,
        extract() should return CSV-like text with column headers repeated
        per sheet (Sheet: <name> prefix, then header row, then data rows).
        """
        ...

    def test_extract_google_sheets_handles_multiple_sheets(self, extractor):
        """Each sheet in the spreadsheet gets its own section in the output."""
        ...

    def test_extract_google_sheets_rejects_over_500k_cells(self, extractor):
        """
        Sheets with more than 500,000 total cells should raise FileTooLargeError.
        Total cells = sum of (rows * columns) across all sheets.
        """
        ...

    def test_extract_google_sheets_paginates_large_sheets(self, extractor):
        """
        For sheets with many rows, extraction should fetch 10,000 rows at a time
        using range-based pagination (A1:Z10000, A10001:Z20000, etc.).
        """
        ...


# ── Google Slides Extraction ────────────────────────────────────────


@pytest.mark.unit
class TestExtractGoogleSlides:
    """Test extraction from Google Slides using the Slides API."""

    def test_extract_google_slides_returns_per_slide_text(self, extractor):
        """
        Given a Google Slides presentation, extract() should return text
        organized per slide: 'Slide 1: <title>\n<body text>\nNotes: <speaker notes>'.
        """
        ...

    def test_extract_google_slides_includes_speaker_notes(self, extractor):
        """Speaker notes from each slide should be included in the extracted text."""
        ...

    def test_extract_google_slides_handles_slides_without_text(self, extractor):
        """Slides with only images (no text boxes) should produce empty slide entries."""
        ...


# ── PDF and Binary Format Extraction ────────────────────────────────


@pytest.mark.unit
class TestExtractPDFAndBinary:
    """Test extraction of PDFs and binary formats via Drive API export."""

    def test_extract_pdf_exports_as_text_plain(self, extractor):
        """
        For PDF files (application/pdf), extract() should use the Drive API
        export endpoint with mimeType='text/plain' to get text content.
        """
        ...

    def test_extract_plain_text_downloads_directly(self, extractor):
        """
        For plain text files (text/plain, text/csv, text/html, etc.),
        extract() should use Drive API media download (files.get with alt=media).
        """
        ...

    def test_extract_docx_binary_exports_as_text(self, extractor):
        """
        For .docx files NOT already in Google format (application/vnd.openxmlformats-...),
        extract() should export as text/plain via the Drive API.
        """
        ...


# ── Size Guards ─────────────────────────────────────────────────────


@pytest.mark.unit
class TestSizeGuards:
    """Test size and timeout protection."""

    def test_extract_rejects_files_larger_than_50mb(self, extractor):
        """
        Files exceeding the max_file_size_bytes guard (default 50MB = 52_428_800 bytes)
        should raise FileTooLargeError before attempting extraction.
        File size is checked via files.get metadata (size field).
        """
        ...

    def test_extract_times_out_after_60_seconds(self, extractor):
        """
        If extraction takes longer than the timeout (default 60s),
        ExtractionTimeoutError should be raised.
        """
        ...

    def test_extract_custom_size_guard(self, extractor):
        """
        The max_file_size_bytes parameter can be overridden per call.
        """
        ...


# ── Structure-Aware Chunking ────────────────────────────────────────


@pytest.mark.unit
class TestStructureAwareChunking:
    """Test structure-aware chunking for Drive content."""

    def test_chunk_docs_splits_by_headings(self):
        """
        Docs content with markdown headings should be split at heading boundaries,
        with each chunk containing the heading hierarchy in its metadata.
        Target chunk size: 200-500 tokens. Overlap: 50-100 tokens.
        """
        ...

    def test_chunk_sheets_splits_by_row_groups_with_headers(self):
        """
        Sheets content should be split into row-group chunks, with each chunk
        repeating the column headers at the top. Metadata includes sheet_name.
        """
        ...

    def test_chunk_slides_splits_per_slide(self):
        """
        Slides content should produce one chunk per slide (or split further
        if a single slide exceeds 500 tokens). Metadata includes slide_number.
        """
        ...

    def test_chunk_preserves_heading_hierarchy_in_metadata(self):
        """
        Each chunk's metadata should include the heading hierarchy path,
        e.g. {"heading_hierarchy": ["Chapter 1", "Section 1.2"]}.
        """
        ...

    def test_chunks_include_correct_metadata(self):
        """
        Every chunk must include metadata keys: file_id, file_name,
        source ('google_drive'), last_modified.
        """
        ...

    def test_chunk_token_range(self):
        """
        Chunks should target 200-500 tokens (roughly 800-2000 chars).
        Overlap should be 50-100 tokens (roughly 200-400 chars).
        These differ from the library's default 500 char / 80 char overlap
        because Google structured APIs provide better semantic boundaries.
        """
        ...
```

### Test Count Summary

| Test Class | Test Count | Description |
|---|---|---|
| TestExtractGoogleDocs | 3 | Docs API extraction, heading structure, empty docs |
| TestExtractGoogleSheets | 4 | Sheets API, multi-sheet, cell limit, pagination |
| TestExtractGoogleSlides | 3 | Slides API, speaker notes, image-only slides |
| TestExtractPDFAndBinary | 3 | PDF export, plain text download, binary export |
| TestSizeGuards | 3 | 50MB limit, 60s timeout, custom limits |
| TestStructureAwareChunking | 6 | Heading splits, row groups, per-slide, metadata |
| **Total** | **22** | |

## Implementation Details

### File: `python-backend/app/services/google_content_extractor.py`

#### Class: `GoogleContentExtractor`

The extractor wraps the Google API Python client and provides a unified `extract()` method that dispatches to the correct Google API based on MIME type.

**Constructor:**

```python
class GoogleContentExtractor:
    """Extracts text content from Google Drive files using Google's structured APIs.

    Uses the Docs, Sheets, and Slides APIs for Google-native formats,
    and the Drive API export/download for other formats (PDF, plain text, binary).

    Args:
        access_token: A valid Google OAuth2 access token (obtained via GoogleTokenService).
        max_file_size_bytes: Maximum file size allowed for extraction. Default 50MB.
        max_sheet_cells: Maximum total cells across all sheets. Default 500,000.
        timeout_seconds: Maximum time for a single extraction. Default 60s.
    """

    def __init__(
        self,
        access_token: str,
        max_file_size_bytes: int = 52_428_800,
        max_sheet_cells: int = 500_000,
        timeout_seconds: int = 60,
    ):
        ...
```

**API Client Construction:**

Build the Google API service objects lazily (on first use) using `googleapiclient.discovery.build`. The access token is wrapped in a `google.oauth2.credentials.Credentials` object.

```python
def _build_credentials(self) -> "google.oauth2.credentials.Credentials":
    """Wrap the access token in a Credentials object for the Google API client."""
    from google.oauth2.credentials import Credentials
    return Credentials(token=self._access_token)

def _get_drive_service(self):
    """Lazy-build and cache the Drive API v3 service."""
    ...

def _get_docs_service(self):
    """Lazy-build and cache the Docs API v1 service."""
    ...

def _get_sheets_service(self):
    """Lazy-build and cache the Sheets API v4 service."""
    ...

def _get_slides_service(self):
    """Lazy-build and cache the Slides API v1 service."""
    ...
```

**Main Extract Method:**

```python
def extract(
    self,
    file_id: str,
    mime_type: str,
    *,
    max_file_size_bytes: int | None = None,
) -> "ContentExtractionResult":
    """Extract text content from a Google Drive file.

    Dispatches to the appropriate Google API based on the file's MIME type:
    - application/vnd.google-apps.document -> Docs API (documents.get)
    - application/vnd.google-apps.spreadsheet -> Sheets API (spreadsheets.get)
    - application/vnd.google-apps.presentation -> Slides API (presentations.get)
    - application/pdf -> Drive API export as text/plain
    - text/* -> Drive API direct download
    - Binary office formats -> Drive API export as text/plain

    Args:
        file_id: The Google Drive file ID.
        mime_type: The file's MIME type (from Drive file metadata).
        max_file_size_bytes: Override the default size guard for this call.

    Returns:
        ContentExtractionResult with extracted text and metadata.

    Raises:
        FileTooLargeError: If the file exceeds the size guard.
        ExtractionTimeoutError: If extraction exceeds the timeout.
        ExtractionError: For all other extraction failures.
    """
    ...
```

**MIME Type Dispatch Logic:**

The `extract()` method checks the MIME type and routes to the appropriate private method:

| MIME Type | Method | Google API Used |
|---|---|---|
| `application/vnd.google-apps.document` | `_extract_google_doc(file_id)` | Docs API v1 `documents.get` |
| `application/vnd.google-apps.spreadsheet` | `_extract_google_sheet(file_id)` | Sheets API v4 `spreadsheets.get` + `spreadsheets.values.get` |
| `application/vnd.google-apps.presentation` | `_extract_google_slides(file_id)` | Slides API v1 `presentations.get` |
| `application/pdf` | `_extract_via_export(file_id, "text/plain")` | Drive API v3 `files.export` |
| `text/*` | `_extract_plain_download(file_id)` | Drive API v3 `files.get` with `alt=media` |
| `application/vnd.openxmlformats-*` (docx, xlsx, pptx) | `_extract_via_export(file_id, "text/plain")` | Drive API v3 `files.export` |

**Size Guard Check:**

Before dispatching, call `_check_file_size(file_id, max_size)` which uses `drive.files().get(fileId=file_id, fields="size").execute()` and compares against the limit. Google-native formats (Docs/Sheets/Slides) do not have a `size` field in the API response, so the size guard only applies to non-native formats. For Sheets, the cell count guard applies instead (checked after fetching spreadsheet metadata with `sheets.spreadsheets().get(spreadsheetId=file_id, fields="sheets.properties")`).

#### Google Docs Extraction (`_extract_google_doc`)

Uses the Docs API `documents.get` endpoint. Iterates over `body.content` structural elements:

- Each `paragraph` element has a `paragraphStyle.namedStyleType` indicating the heading level (`HEADING_1` through `HEADING_6`, or `NORMAL_TEXT`).
- Convert heading paragraphs to markdown format: `HEADING_1` becomes `# Title`, `HEADING_2` becomes `## Subtitle`, etc.
- Concatenate all `textRun.content` values within each paragraph's `elements` array.
- Lists: detect `paragraph.bullet` property and render as `- item`.
- Return the full text as a single markdown-formatted string.

#### Google Sheets Extraction (`_extract_google_sheet`)

Uses the Sheets API:

1. First call `spreadsheets().get(spreadsheetId=file_id, fields="sheets.properties")` to get sheet names, row counts, and column counts.
2. Calculate total cells (`sum(rows * cols for each sheet)`) and check against `max_sheet_cells`.
3. For each sheet, fetch values using `spreadsheets().values().get(spreadsheetId=file_id, range=sheet_name)`.
4. For large sheets (over 10,000 rows), paginate by fetching ranges: `SheetName!A1:Z10000`, `SheetName!A10001:Z20000`, etc.
5. Format output as: `Sheet: <name>\n<header_row>\n<data_rows>` with tab-separated values.
6. Separate sheets with double newlines.

#### Google Slides Extraction (`_extract_google_slides`)

Uses the Slides API `presentations().get(presentationId=file_id)`:

1. Iterate over `slides` array in the response.
2. For each slide, iterate over `pageElements` to find `shape` elements with `text` bodies.
3. Concatenate `textRun.content` from all text elements.
4. Extract speaker notes from `slideProperties.notesPage.pageElements` text.
5. Format output as: `Slide <N>: <title_text>\n<body_text>\nNotes: <speaker_notes>`.

#### Data Classes

```python
@dataclass
class ContentExtractionResult:
    """Result of content extraction from a Google Drive file.

    Attributes:
        text: The extracted plain text or markdown content.
        mime_type: The original MIME type of the source file.
        file_id: The Google Drive file ID.
        char_count: Number of characters in the extracted text.
        metadata: Additional extraction metadata (sheet names, slide count, etc.).
    """
    text: str
    mime_type: str
    file_id: str
    char_count: int
    metadata: dict[str, Any]


class ExtractionError(Exception):
    """Base exception for content extraction failures."""
    ...

class FileTooLargeError(ExtractionError):
    """Raised when a file exceeds the configured size guard."""
    ...

class ExtractionTimeoutError(ExtractionError):
    """Raised when extraction exceeds the configured timeout."""
    ...
```

### Structure-Aware Chunking

The `structure_aware_chunk` function is a standalone function (not a method) that takes the extracted text plus content-type context and produces chunks with metadata. This function is separate from the existing `chunk_text_content` in `library_indexing_service.py` because Drive content uses different chunking parameters optimized for structured APIs.

```python
def structure_aware_chunk(
    text: str,
    *,
    content_type: str,
    file_id: str,
    file_name: str,
    last_modified: str,
    max_tokens: int = 500,
    min_tokens: int = 200,
    overlap_tokens: int = 75,
    sheet_name: str | None = None,
) -> list[dict[str, Any]]:
    """Split extracted text into chunks using structure-aware boundaries.

    Different strategies are used based on content_type:
    - 'google_doc': Split at heading boundaries (markdown ## lines).
      Each chunk's metadata includes heading_hierarchy.
    - 'google_sheet': Split by row groups, repeating column headers
      at the top of each chunk. metadata includes sheet_name.
    - 'google_slides': One chunk per slide (split further if >max_tokens).
      metadata includes slide_number.
    - 'plain': Fall back to token-based splitting with overlap.

    Args:
        text: The extracted text content.
        content_type: One of 'google_doc', 'google_sheet', 'google_slides', 'plain'.
        file_id: Drive file ID for metadata.
        file_name: File name for metadata.
        last_modified: ISO timestamp of last modification.
        max_tokens: Maximum tokens per chunk (default 500).
        min_tokens: Minimum tokens per chunk; merge small chunks (default 200).
        overlap_tokens: Token overlap between chunks (default 75).
        sheet_name: Sheet name for Google Sheets chunks.

    Returns:
        List of chunk dicts with keys:
            chunk_index (int), content (str), content_type (str),
            token_count (int), metadata (dict with file_id, file_name,
            source, last_modified, heading_hierarchy?, sheet_name?, slide_number?)
    """
    ...
```

**Chunking strategies by content type:**

1. **Google Docs (`google_doc`):**
   - Split text at lines starting with `#` (markdown headings produced by the Docs extractor).
   - Each section between headings becomes a candidate chunk.
   - If a section exceeds `max_tokens`, sub-split using token-based splitting with overlap.
   - If a section is below `min_tokens`, merge with the next section.
   - Track the heading hierarchy: when you see a `# Heading`, reset the hierarchy to `[heading]`. When you see `## Sub`, set hierarchy to `[parent_heading, sub]`, etc.
   - Each chunk's metadata includes `heading_hierarchy: list[str]`.

2. **Google Sheets (`google_sheet`):**
   - First line of the text block is treated as the header row.
   - Split subsequent rows into groups of roughly `max_tokens` worth of text.
   - Prepend the header row to each chunk.
   - Each chunk's metadata includes `sheet_name`.

3. **Google Slides (`google_slides`):**
   - Split text at `Slide N:` markers (produced by the Slides extractor).
   - Each slide becomes one chunk. If a slide exceeds `max_tokens`, sub-split.
   - Each chunk's metadata includes `slide_number: int`.

4. **Plain text (`plain`):**
   - Use token-count-based splitting with overlap, similar to the existing `chunk_text_content` but with the Drive-specific parameters (200-500 token range, 75 token overlap).

**Token counting:** Use a simple word-count approximation (`len(text.split())`) for token counting. This is consistent with how the existing `chunk_text_content` function computes `token_count` in `library_indexing_service.py`.

**Chunk return format:** Each chunk is a dict matching the existing pattern:

```python
{
    "chunk_index": 0,
    "content": "## Introduction\nThis document covers...",
    "content_type": "text",
    "token_count": 342,
    "metadata": {
        "file_id": "1abc...",
        "file_name": "Project Plan.gdoc",
        "source": "google_drive",
        "last_modified": "2026-02-14T10:00:00Z",
        "heading_hierarchy": ["Introduction"],
    },
}
```

This format is compatible with the existing `process_library_index_job` pipeline's chunk format (same keys: `chunk_index`, `content`, `content_type`, `token_count`, `metadata`), so the virtual references indexing job (Section 8) can pass these chunks directly to the embedding service and vector upsert functions.

### Timeout Implementation

Wrap extraction logic in a `signal.alarm`-based timeout (Unix) or `concurrent.futures.ThreadPoolExecutor` with a timeout for cross-platform compatibility. The recommended approach is:

```python
import signal

class _TimeoutHandler:
    """Context manager for enforcing extraction timeouts."""

    def __init__(self, seconds: int):
        self.seconds = seconds

    def __enter__(self):
        signal.signal(signal.SIGALRM, self._handler)
        signal.alarm(self.seconds)
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        signal.alarm(0)

    def _handler(self, signum, frame):
        raise ExtractionTimeoutError(
            f"Extraction timed out after {self.seconds} seconds"
        )
```

Since this runs inside Celery workers (Linux), `signal.alarm` is reliable. If running in an async context (FastAPI endpoint), use `asyncio.wait_for` instead.

### Error Handling

The extractor should raise structured exceptions:

- `FileTooLargeError(file_id, size_bytes, max_bytes)` when size guard triggers.
- `ExtractionTimeoutError(file_id, timeout_seconds)` when timeout triggers.
- `ExtractionError(file_id, message, cause)` for all other failures (API errors, network issues, malformed responses).

Google API errors from `googleapiclient.errors.HttpError` should be caught and wrapped in `ExtractionError` with the HTTP status code preserved for callers to inspect (e.g., 404 for file not found, 403 for permission denied).

### Integration Points

**Downstream consumers (do not implement in this section):**
- Section 8 (Virtual References & Indexing): Calls `extractor.extract(file_id, mime_type)` then passes the result through `structure_aware_chunk()` and feeds chunks into the embedding pipeline.
- Section 9 (MCP Server): Calls `extractor.extract(file_id, mime_type)` for the `read_drive_file` MCP tool and returns the text to the LLM context.

**Upstream dependency:**
- `GoogleTokenService.get_valid_access_token(user_id)` (from Section 3) provides the access token passed to the `GoogleContentExtractor` constructor. This section does NOT call `GoogleTokenService` directly -- callers are responsible for obtaining the token and passing it in.

### Configuration Defaults

| Parameter | Default | Description |
|---|---|---|
| `max_file_size_bytes` | 52,428,800 (50 MB) | Max file size for non-native formats |
| `max_sheet_cells` | 500,000 | Max total cells across all sheets |
| `timeout_seconds` | 60 | Max seconds per extraction |
| `max_tokens` (chunking) | 500 | Max tokens per chunk |
| `min_tokens` (chunking) | 200 | Min tokens per chunk (merge below this) |
| `overlap_tokens` (chunking) | 75 | Token overlap between chunks |
| Sheet pagination batch | 10,000 rows | Rows fetched per Sheets API call |

These values differ from the existing library chunking parameters (`500 char / 80 char overlap` in `library_indexing_service.py`) because Google structured APIs provide better semantic boundaries (heading-based splits). The vector store handles mixed chunk sizes since embeddings are dimension-normalized.

## Implementation Checklist

1. Add `google-api-python-client>=2.100.0`, `google-auth>=2.23.0`, `google-auth-httplib2>=0.2.0` to `/home/dev/projects/SmartSpecPro/python-backend/requirements.txt`.
2. Create `/home/dev/projects/SmartSpecPro/python-backend/tests/test_google_content_extractor.py` with all 22 tests as stubs.
3. Create `/home/dev/projects/SmartSpecPro/python-backend/app/services/google_content_extractor.py` with:
   - `ContentExtractionResult` dataclass
   - `ExtractionError`, `FileTooLargeError`, `ExtractionTimeoutError` exceptions
   - `GoogleContentExtractor` class with `extract()` method and private extraction methods
   - `structure_aware_chunk()` standalone function
4. Implement Google Docs extraction (`_extract_google_doc`): iterate `body.content`, convert headings to markdown.
5. Implement Google Sheets extraction (`_extract_google_sheet`): get sheet metadata, check cell count guard, fetch values with pagination.
6. Implement Google Slides extraction (`_extract_google_slides`): iterate slides, extract text and speaker notes.
7. Implement PDF/binary extraction (`_extract_via_export`, `_extract_plain_download`): use Drive API export and media download.
8. Implement size guard check (`_check_file_size`): fetch file metadata, compare against limit.
9. Implement timeout wrapper using `signal.alarm`.
10. Implement `structure_aware_chunk()` with heading-based, row-group, per-slide, and plain-text strategies.
11. Run tests: `cd /home/dev/projects/SmartSpecPro/python-backend && pytest tests/test_google_content_extractor.py -v`.
12. Verify all 22 tests pass.