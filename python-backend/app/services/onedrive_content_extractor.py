"""OneDrive file content extraction service.

Extracts text from various file formats downloaded from OneDrive.
"""

import io
import logging
from typing import Optional

logger = logging.getLogger(__name__)


class OneDriveContentExtractor:
    """Extracts text content from OneDrive file bytes."""

    def extract(self, content: bytes, mime_type: str, file_name: str = "") -> dict:
        """Extract text from file content based on MIME type.

        Returns dict with keys: text, char_count, method
        """
        mime_lower = mime_type.lower()
        text = ""
        method = "unknown"

        try:
            if "text/" in mime_lower or self._is_text_file(file_name):
                text = content.decode("utf-8", errors="replace")
                method = "text"
            elif "pdf" in mime_lower or file_name.endswith(".pdf"):
                text = self._extract_pdf(content)
                method = "pdf"
            elif "wordprocessingml" in mime_lower or file_name.endswith(".docx"):
                text = self._extract_docx(content)
                method = "docx"
            elif "presentationml" in mime_lower or file_name.endswith(".pptx"):
                text = self._extract_pptx(content)
                method = "pptx"
            elif "spreadsheetml" in mime_lower or file_name.endswith(".xlsx"):
                text = self._extract_xlsx(content)
                method = "xlsx"
            else:
                # Try as text fallback
                try:
                    text = content.decode("utf-8", errors="strict")
                    method = "text_fallback"
                except (UnicodeDecodeError, ValueError):
                    text = ""
                    method = "unsupported"
        except Exception as e:
            logger.warning("Content extraction failed for %s: %s", file_name, e)
            text = ""
            method = "error"

        return {"text": text, "char_count": len(text), "method": method}

    def _is_text_file(self, name: str) -> bool:
        return name.endswith((
            ".txt", ".md", ".csv", ".json", ".xml",
            ".yaml", ".yml", ".html", ".htm", ".log",
            ".ini", ".cfg", ".toml",
        ))

    def _extract_pdf(self, content: bytes) -> str:
        from PyPDF2 import PdfReader

        reader = PdfReader(io.BytesIO(content))
        texts = []
        for page in reader.pages:
            texts.append(page.extract_text() or "")
        return "\n".join(texts)

    def _extract_docx(self, content: bytes) -> str:
        from docx import Document

        doc = Document(io.BytesIO(content))
        return "\n".join(p.text for p in doc.paragraphs)

    def _extract_pptx(self, content: bytes) -> str:
        from pptx import Presentation

        prs = Presentation(io.BytesIO(content))
        texts = []
        for slide in prs.slides:
            for shape in slide.shapes:
                if hasattr(shape, "text"):
                    texts.append(shape.text)
        return "\n".join(texts)

    def _extract_xlsx(self, content: bytes) -> str:
        from openpyxl import load_workbook

        wb = load_workbook(io.BytesIO(content), read_only=True, data_only=True)
        texts = []
        for ws in wb.worksheets:
            texts.append(f"--- Sheet: {ws.title} ---")
            for row in ws.iter_rows(values_only=True):
                row_text = "\t".join(str(c) if c is not None else "" for c in row)
                if row_text.strip():
                    texts.append(row_text)
        wb.close()
        return "\n".join(texts)
