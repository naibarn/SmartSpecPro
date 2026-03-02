"""
GoogleContentExtractor -- extracts text from Google Drive files for RAG indexing and MCP reads.

Uses Google's structured APIs (Docs, Sheets, Slides) for native formats,
and Drive API export/download for PDFs and binary formats.
"""

import re
import time
import signal
import logging
import threading
from dataclasses import dataclass, field
from typing import Any, Optional

logger = logging.getLogger(__name__)

# ── Exceptions ────────────────────────────────────────────────────────


class ExtractionError(Exception):
    """Base exception for content extraction failures."""

    def __init__(self, file_id: str, message: str, cause: Optional[Exception] = None):
        super().__init__(message)
        self.file_id = file_id
        self.cause = cause


class FileTooLargeError(ExtractionError):
    """Raised when a file exceeds the configured size guard."""

    def __init__(self, file_id: str, size_bytes: int, max_bytes: int, unit: str = "bytes"):
        super().__init__(file_id, f"File {file_id} is {size_bytes} {unit}, exceeds limit of {max_bytes}")
        self.size_bytes = size_bytes
        self.max_bytes = max_bytes


class ExtractionTimeoutError(ExtractionError):
    """Raised when extraction exceeds the configured timeout."""

    def __init__(self, file_id: str, timeout_seconds: int):
        super().__init__(file_id, f"Extraction of {file_id} timed out after {timeout_seconds}s")
        self.timeout_seconds = timeout_seconds


# ── Data Classes ──────────────────────────────────────────────────────


@dataclass
class ContentExtractionResult:
    """Result of content extraction from a Google Drive file."""

    text: str
    mime_type: str
    file_id: str
    char_count: int
    metadata: dict[str, Any] = field(default_factory=dict)


# ── Timeout Handler ──────────────────────────────────────────────────


class _TimeoutHandler:
    """Context manager for enforcing extraction timeouts using SIGALRM.

    Falls back to a no-op if not on the main thread (SIGALRM is main-thread only).
    """

    def __init__(self, seconds: int, file_id: str):
        self.seconds = seconds
        self.file_id = file_id
        self._can_use_signal = threading.current_thread() is threading.main_thread()

    def __enter__(self):
        if self._can_use_signal:
            self._old_handler = signal.signal(signal.SIGALRM, self._handler)
            signal.alarm(self.seconds)
        else:
            logger.warning("SIGALRM timeout unavailable (not main thread), skipping timeout for %s", self.file_id)
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        if self._can_use_signal:
            signal.alarm(0)
            signal.signal(signal.SIGALRM, self._old_handler)

    def _handler(self, signum, frame):
        raise ExtractionTimeoutError(self.file_id, self.seconds)


# ── Extractor ─────────────────────────────────────────────────────────


class GoogleContentExtractor:
    """Extracts text content from Google Drive files using Google's structured APIs."""

    GOOGLE_DOC_MIME = "application/vnd.google-apps.document"
    GOOGLE_SHEET_MIME = "application/vnd.google-apps.spreadsheet"
    GOOGLE_SLIDES_MIME = "application/vnd.google-apps.presentation"

    def __init__(
        self,
        access_token: str,
        max_file_size_bytes: int = 52_428_800,
        max_sheet_cells: int = 500_000,
        timeout_seconds: int = 60,
    ):
        self._access_token = access_token
        self._max_file_size_bytes = max_file_size_bytes
        self._max_sheet_cells = max_sheet_cells
        self._timeout_seconds = timeout_seconds
        self._drive_service = None
        self._docs_service = None
        self._sheets_service = None
        self._slides_service = None

    @staticmethod
    def _execute_with_retry(request, max_retries: int = 3):
        """Execute a Google API request with 429 rate-limit retry."""
        for attempt in range(max_retries + 1):
            try:
                return request.execute()
            except Exception as e:
                status_code = getattr(e, "status_code", None)
                if status_code is None and hasattr(e, "resp"):
                    status_code = int(e.resp.get("status", 0))
                if status_code == 429 and attempt < max_retries:
                    retry_after = 60
                    if hasattr(e, "resp") and "retry-after" in (e.resp or {}):
                        try:
                            retry_after = int(e.resp["retry-after"])
                        except (ValueError, TypeError):
                            pass
                    wait = min(retry_after, 300)
                    logger.warning(
                        "Google API 429 in extractor (attempt %d/%d), retrying in %ds",
                        attempt + 1, max_retries, wait,
                    )
                    time.sleep(wait)
                    continue
                raise

    def _build_credentials(self):
        from google.oauth2.credentials import Credentials
        return Credentials(token=self._access_token)

    def _get_drive_service(self):
        if not self._drive_service:
            from googleapiclient.discovery import build
            self._drive_service = build("drive", "v3", credentials=self._build_credentials())
        return self._drive_service

    def _get_docs_service(self):
        if not self._docs_service:
            from googleapiclient.discovery import build
            self._docs_service = build("docs", "v1", credentials=self._build_credentials())
        return self._docs_service

    def _get_sheets_service(self):
        if not self._sheets_service:
            from googleapiclient.discovery import build
            self._sheets_service = build("sheets", "v4", credentials=self._build_credentials())
        return self._sheets_service

    def _get_slides_service(self):
        if not self._slides_service:
            from googleapiclient.discovery import build
            self._slides_service = build("slides", "v1", credentials=self._build_credentials())
        return self._slides_service

    def extract(
        self,
        file_id: str,
        mime_type: str,
        *,
        max_file_size_bytes: Optional[int] = None,
    ) -> ContentExtractionResult:
        """Extract text content from a Google Drive file."""
        max_size = max_file_size_bytes if max_file_size_bytes is not None else self._max_file_size_bytes

        try:
            with _TimeoutHandler(self._timeout_seconds, file_id):
                # Dispatch based on MIME type
                if mime_type == self.GOOGLE_DOC_MIME:
                    text, meta = self._extract_google_doc(file_id)
                elif mime_type == self.GOOGLE_SHEET_MIME:
                    text, meta = self._extract_google_sheet(file_id)
                elif mime_type == self.GOOGLE_SLIDES_MIME:
                    text, meta = self._extract_google_slides(file_id)
                elif mime_type == "application/pdf":
                    self._check_file_size(file_id, max_size)
                    text, meta = self._extract_via_export(file_id, "text/plain")
                elif mime_type.startswith("text/"):
                    self._check_file_size(file_id, max_size)
                    text, meta = self._extract_plain_download(file_id)
                elif "openxmlformats" in mime_type or mime_type in (
                    "application/msword",
                    "application/vnd.ms-excel",
                    "application/vnd.ms-powerpoint",
                ):
                    self._check_file_size(file_id, max_size)
                    text, meta = self._extract_via_export(file_id, "text/plain")
                else:
                    # Try export as text for unknown types
                    self._check_file_size(file_id, max_size)
                    text, meta = self._extract_via_export(file_id, "text/plain")

                logger.info("Extracted %d chars from %s (type=%s)", len(text), file_id, mime_type)

        except (FileTooLargeError, ExtractionTimeoutError):
            raise
        except ExtractionError:
            raise
        except Exception as e:
            # Preserve Google API HTTP status codes for callers
            http_status = getattr(e, "status_code", None) or getattr(e, "resp", {}).get("status") if hasattr(e, "resp") else None
            msg = f"Extraction failed: {e}"
            if http_status:
                msg = f"Extraction failed (HTTP {http_status}): {e}"
            err = ExtractionError(file_id, msg, cause=e)
            err.http_status = http_status  # type: ignore[attr-defined]
            raise err

        # Sanitize extracted content before returning
        from app.services.google_drive_content_sanitizer import sanitize_drive_content
        text = sanitize_drive_content(text)

        return ContentExtractionResult(
            text=text,
            mime_type=mime_type,
            file_id=file_id,
            char_count=len(text),
            metadata=meta,
        )

    def _check_file_size(self, file_id: str, max_size: int):
        """Check file size against the limit."""
        try:
            meta = self._execute_with_retry(self._get_drive_service().files().get(
                fileId=file_id, fields="size"
            ))
            size = int(meta.get("size", 0))
            if size > max_size:
                raise FileTooLargeError(file_id, size, max_size)
        except FileTooLargeError:
            raise
        except Exception as e:
            # Propagate HTTP 4xx errors (auth/not-found) instead of swallowing
            status = getattr(e, "status_code", None)
            if status is None and hasattr(e, "resp"):
                status = int(e.resp.get("status", 0))
            if status and 400 <= status < 500:
                raise ExtractionError(file_id, f"Cannot access file (HTTP {status}): {e}", cause=e)
            # For non-HTTP errors (e.g. no 'size' on native files), proceed
            logger.debug("Could not check file size for %s: %s", file_id, e)

    def _extract_google_doc(self, file_id: str) -> tuple[str, dict]:
        """Extract text from a Google Doc using the Docs API."""
        doc = self._execute_with_retry(self._get_docs_service().documents().get(documentId=file_id))
        title = doc.get("title", "")
        body = doc.get("body", {})
        content = body.get("content", [])

        lines: list[str] = []
        for element in content:
            paragraph = element.get("paragraph")
            if not paragraph:
                continue

            style = paragraph.get("paragraphStyle", {})
            named_style = style.get("namedStyleType", "NORMAL_TEXT")
            has_bullet = "bullet" in paragraph

            # Build paragraph text
            text_parts = []
            for el in paragraph.get("elements", []):
                text_run = el.get("textRun")
                if text_run:
                    text_parts.append(text_run.get("content", ""))

            para_text = "".join(text_parts).rstrip("\n")
            if not para_text.strip():
                lines.append("")
                continue

            # Convert headings to markdown
            if named_style.startswith("HEADING_"):
                level = int(named_style.split("_")[1])
                lines.append(f"{'#' * level} {para_text}")
            elif has_bullet:
                lines.append(f"- {para_text}")
            else:
                lines.append(para_text)

        full_text = "\n".join(lines).strip()
        return full_text, {"title": title, "type": "google_doc"}

    def _extract_google_sheet(self, file_id: str) -> tuple[str, dict]:
        """Extract text from a Google Sheet using the Sheets API."""
        sheets_svc = self._get_sheets_service()

        # Get sheet metadata
        spreadsheet = self._execute_with_retry(sheets_svc.spreadsheets().get(
            spreadsheetId=file_id, fields="sheets.properties,properties.title"
        ))

        ss_title = spreadsheet.get("properties", {}).get("title", "")
        sheets = spreadsheet.get("sheets", [])

        # Cell count guard
        total_cells = 0
        for sheet in sheets:
            props = sheet.get("properties", {})
            grid = props.get("gridProperties", {})
            rows = grid.get("rowCount", 0)
            cols = grid.get("columnCount", 0)
            total_cells += rows * cols

        if total_cells > self._max_sheet_cells:
            raise FileTooLargeError(file_id, total_cells, self._max_sheet_cells, unit="cells")

        # Extract each sheet
        sections: list[str] = []
        sheet_names: list[str] = []
        for sheet in sheets:
            props = sheet.get("properties", {})
            sheet_name = props.get("title", "Sheet")
            sheet_names.append(sheet_name)

            # Fetch values
            result = self._execute_with_retry(sheets_svc.spreadsheets().values().get(
                spreadsheetId=file_id, range=sheet_name
            ))
            values = result.get("values", [])

            if not values:
                sections.append(f"Sheet: {sheet_name}\n(empty)")
                continue

            # Format as tab-separated text
            lines = [f"Sheet: {sheet_name}"]
            for row in values:
                lines.append("\t".join(str(cell) for cell in row))
            sections.append("\n".join(lines))

        full_text = "\n\n".join(sections)
        return full_text, {"title": ss_title, "type": "google_sheet", "sheet_names": sheet_names}

    def _extract_google_slides(self, file_id: str) -> tuple[str, dict]:
        """Extract text from Google Slides using the Slides API."""
        presentation = self._execute_with_retry(self._get_slides_service().presentations().get(
            presentationId=file_id
        ))

        title = presentation.get("title", "")
        slides = presentation.get("slides", [])

        sections: list[str] = []
        for i, slide in enumerate(slides, 1):
            slide_texts: list[str] = []
            for element in slide.get("pageElements", []):
                shape = element.get("shape")
                if shape and "text" in shape:
                    for text_el in shape["text"].get("textElements", []):
                        text_run = text_el.get("textRun")
                        if text_run:
                            slide_texts.append(text_run.get("content", ""))

            # Speaker notes
            notes_texts: list[str] = []
            notes_page = slide.get("slideProperties", {}).get("notesPage")
            if notes_page:
                for element in notes_page.get("pageElements", []):
                    shape = element.get("shape")
                    if shape and "text" in shape:
                        for text_el in shape["text"].get("textElements", []):
                            text_run = text_el.get("textRun")
                            if text_run:
                                notes_texts.append(text_run.get("content", ""))

            slide_content = "".join(slide_texts).strip()
            notes_content = "".join(notes_texts).strip()

            parts = [f"Slide {i}:"]
            if slide_content:
                parts.append(slide_content)
            if notes_content:
                parts.append(f"Notes: {notes_content}")

            sections.append("\n".join(parts))

        full_text = "\n\n".join(sections)
        return full_text, {"title": title, "type": "google_slides", "slide_count": len(slides)}

    def _extract_via_export(self, file_id: str, export_mime: str) -> tuple[str, dict]:
        """Export a file using the Drive API."""
        content = self._execute_with_retry(self._get_drive_service().files().export(
            fileId=file_id, mimeType=export_mime
        ))

        if isinstance(content, bytes):
            text = content.decode("utf-8", errors="replace")
        else:
            text = str(content)

        return text, {"type": "drive_export", "export_mime": export_mime}

    def _extract_plain_download(self, file_id: str) -> tuple[str, dict]:
        """Download a plain text file directly."""
        content = self._execute_with_retry(self._get_drive_service().files().get_media(
            fileId=file_id
        ))

        if isinstance(content, bytes):
            text = content.decode("utf-8", errors="replace")
        else:
            text = str(content)

        return text, {"type": "direct_download"}


# ── Structure-Aware Chunking ──────────────────────────────────────────


def _estimate_tokens(text: str) -> int:
    """Estimate token count using word count approximation."""
    return len(text.split())


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
    sheet_name: Optional[str] = None,
) -> list[dict[str, Any]]:
    """Split extracted text into chunks using structure-aware boundaries."""
    base_meta = {
        "file_id": file_id,
        "file_name": file_name,
        "source": "google_drive",
        "last_modified": last_modified,
    }

    if content_type == "google_doc":
        return _chunk_doc(text, base_meta, max_tokens, min_tokens, overlap_tokens)
    elif content_type == "google_sheet":
        return _chunk_sheet(text, base_meta, max_tokens, sheet_name)
    elif content_type == "google_slides":
        return _chunk_slides(text, base_meta, max_tokens)
    else:
        return _chunk_plain(text, base_meta, max_tokens, overlap_tokens)


def _chunk_doc(
    text: str,
    base_meta: dict,
    max_tokens: int,
    min_tokens: int,
    overlap_tokens: int,
) -> list[dict[str, Any]]:
    """Chunk Google Docs content by heading boundaries."""
    lines = text.split("\n")
    sections: list[tuple[list[str], str]] = []  # (heading_hierarchy, text)
    current_hierarchy: list[str] = []
    current_lines: list[str] = []

    for line in lines:
        stripped = line.lstrip()
        if stripped.startswith("#"):
            # Save previous section
            if current_lines:
                section_text = "\n".join(current_lines).strip()
                if section_text:
                    sections.append((list(current_hierarchy), section_text))
                current_lines = []

            # Determine heading level and update hierarchy
            level = 0
            for ch in stripped:
                if ch == "#":
                    level += 1
                else:
                    break
            heading = stripped[level:].strip()
            current_hierarchy = current_hierarchy[: level - 1] + [heading]
            current_lines.append(line)
        else:
            current_lines.append(line)

    # Final section
    if current_lines:
        section_text = "\n".join(current_lines).strip()
        if section_text:
            sections.append((list(current_hierarchy), section_text))

    # Build chunks, merging small sections
    chunks: list[dict[str, Any]] = []
    idx = 0
    pending_text = ""
    pending_hierarchy: list[str] = []

    for hierarchy, section_text in sections:
        combined = f"{pending_text}\n{section_text}".strip() if pending_text else section_text
        tokens = _estimate_tokens(combined)

        if tokens < min_tokens:
            pending_text = combined
            pending_hierarchy = hierarchy
            continue

        if tokens <= max_tokens:
            chunks.append({
                "chunk_index": idx,
                "content": combined,
                "content_type": "text",
                "token_count": tokens,
                "metadata": {**base_meta, "heading_hierarchy": hierarchy},
            })
            idx += 1
            pending_text = ""
            pending_hierarchy = []
        else:
            # Split large section
            words = combined.split()
            for start in range(0, len(words), max_tokens - overlap_tokens):
                chunk_words = words[start : start + max_tokens]
                chunk_text = " ".join(chunk_words)
                chunks.append({
                    "chunk_index": idx,
                    "content": chunk_text,
                    "content_type": "text",
                    "token_count": len(chunk_words),
                    "metadata": {**base_meta, "heading_hierarchy": hierarchy},
                })
                idx += 1
            pending_text = ""
            pending_hierarchy = []

    # Flush remaining
    if pending_text:
        tokens = _estimate_tokens(pending_text)
        chunks.append({
            "chunk_index": idx,
            "content": pending_text,
            "content_type": "text",
            "token_count": tokens,
            "metadata": {**base_meta, "heading_hierarchy": pending_hierarchy},
        })

    return chunks


def _chunk_sheet(
    text: str,
    base_meta: dict,
    max_tokens: int,
    sheet_name: Optional[str],
) -> list[dict[str, Any]]:
    """Chunk Google Sheets content by row groups with header repetition."""
    lines = text.split("\n")
    if not lines:
        return []

    # Find header line (first line after "Sheet: ..." marker)
    header = ""
    data_lines: list[str] = []
    for line in lines:
        if line.startswith("Sheet:"):
            continue
        if not header:
            header = line
        else:
            data_lines.append(line)

    chunks: list[dict[str, Any]] = []
    idx = 0
    batch: list[str] = []
    batch_tokens = _estimate_tokens(header)

    for row in data_lines:
        row_tokens = _estimate_tokens(row)
        if batch_tokens + row_tokens > max_tokens and batch:
            chunk_text = f"{header}\n" + "\n".join(batch)
            chunks.append({
                "chunk_index": idx,
                "content": chunk_text,
                "content_type": "text",
                "token_count": _estimate_tokens(chunk_text),
                "metadata": {**base_meta, "sheet_name": sheet_name},
            })
            idx += 1
            batch = []
            batch_tokens = _estimate_tokens(header)
        batch.append(row)
        batch_tokens += row_tokens

    if batch:
        chunk_text = f"{header}\n" + "\n".join(batch)
        chunks.append({
            "chunk_index": idx,
            "content": chunk_text,
            "content_type": "text",
            "token_count": _estimate_tokens(chunk_text),
            "metadata": {**base_meta, "sheet_name": sheet_name},
        })

    return chunks


def _chunk_slides(
    text: str,
    base_meta: dict,
    max_tokens: int,
) -> list[dict[str, Any]]:
    """Chunk Google Slides content per slide."""
    slides = re.split(r"(?=^Slide \d+:)", text, flags=re.MULTILINE)
    slides = [s.strip() for s in slides if s.strip()]

    chunks: list[dict[str, Any]] = []
    idx = 0
    for slide_text in slides:
        # Extract slide number
        match = re.match(r"Slide (\d+):", slide_text)
        slide_num = int(match.group(1)) if match else idx + 1

        tokens = _estimate_tokens(slide_text)
        if tokens <= max_tokens:
            chunks.append({
                "chunk_index": idx,
                "content": slide_text,
                "content_type": "text",
                "token_count": tokens,
                "metadata": {**base_meta, "slide_number": slide_num},
            })
            idx += 1
        else:
            # Split large slide
            words = slide_text.split()
            for start in range(0, len(words), max_tokens):
                chunk_words = words[start : start + max_tokens]
                chunks.append({
                    "chunk_index": idx,
                    "content": " ".join(chunk_words),
                    "content_type": "text",
                    "token_count": len(chunk_words),
                    "metadata": {**base_meta, "slide_number": slide_num},
                })
                idx += 1

    return chunks


def _chunk_plain(
    text: str,
    base_meta: dict,
    max_tokens: int,
    overlap_tokens: int,
) -> list[dict[str, Any]]:
    """Chunk plain text by token count with overlap."""
    words = text.split()
    if not words:
        return []

    chunks: list[dict[str, Any]] = []
    idx = 0
    step = max(1, max_tokens - overlap_tokens)
    for start in range(0, len(words), step):
        chunk_words = words[start : start + max_tokens]
        if not chunk_words:
            break
        chunks.append({
            "chunk_index": idx,
            "content": " ".join(chunk_words),
            "content_type": "text",
            "token_count": len(chunk_words),
            "metadata": {**base_meta},
        })
        idx += 1

    return chunks
