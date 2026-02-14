"""
Content sanitizer for text extracted from Google Drive files.

Strips dangerous HTML/script content while preserving legitimate text,
markdown formatting, and code blocks.
"""

import re


# Patterns to strip (compiled for performance)
_SCRIPT_RE = re.compile(r"<script[^>]*>.*?</script>", re.DOTALL | re.IGNORECASE)
_STYLE_RE = re.compile(r"<style[^>]*>.*?</style>", re.DOTALL | re.IGNORECASE)
_IFRAME_RE = re.compile(r"<iframe[^>]*>.*?</iframe>", re.DOTALL | re.IGNORECASE)
_OBJECT_RE = re.compile(r"<object[^>]*>.*?</object>", re.DOTALL | re.IGNORECASE)
_EMBED_RE = re.compile(r"<embed[^>]*/?\s*>", re.IGNORECASE)
_EVENT_HANDLER_RE = re.compile(r"\s+on\w+\s*=\s*[\"'][^\"']*[\"']", re.IGNORECASE)
_JAVASCRIPT_URI_RE = re.compile(r"javascript\s*:", re.IGNORECASE)
_DATA_URI_EXEC_RE = re.compile(
    r"data\s*:\s*(text/html|application/javascript|text/javascript)", re.IGNORECASE
)
_NULL_BYTES_RE = re.compile(r"[\x00]")
_CONTROL_CHARS_RE = re.compile(r"[\x01-\x08\x0b\x0c\x0e-\x1f]")


def sanitize_drive_content(raw_text: str) -> str:
    """
    Sanitize text extracted from Google Drive files before storage.

    Strips:
    - <script> tags and their content
    - <style> tags and their content
    - HTML event handlers (onclick, onerror, onload, etc.)
    - <iframe>, <object>, <embed> tags
    - javascript: URIs
    - Data URIs with executable MIME types
    - Null bytes and control characters (except newlines/tabs)

    Preserves:
    - Plain text content
    - Markdown formatting (headings, lists, bold, italic, code)
    - Non-harmful HTML entities (&amp;, &lt;, etc.)
    - Code blocks (content within ``` fences is preserved as-is)
    """
    if not raw_text:
        return ""

    # Protect code blocks from sanitization
    code_blocks: list[str] = []
    code_block_re = re.compile(r"```[\s\S]*?```", re.MULTILINE)

    def _save_code_block(match: re.Match) -> str:
        code_blocks.append(match.group(0))
        return f"__CODE_BLOCK_{len(code_blocks) - 1}__"

    text = code_block_re.sub(_save_code_block, raw_text)

    # Strip dangerous patterns
    text = _SCRIPT_RE.sub("", text)
    text = _STYLE_RE.sub("", text)
    text = _IFRAME_RE.sub("", text)
    text = _OBJECT_RE.sub("", text)
    text = _EMBED_RE.sub("", text)
    text = _EVENT_HANDLER_RE.sub("", text)
    text = _JAVASCRIPT_URI_RE.sub("", text)
    text = _DATA_URI_EXEC_RE.sub("data:blocked", text)

    # Strip null bytes and control chars (keep \n, \r, \t)
    text = _NULL_BYTES_RE.sub("", text)
    text = _CONTROL_CHARS_RE.sub("", text)

    # Restore code blocks
    for i, block in enumerate(code_blocks):
        text = text.replace(f"__CODE_BLOCK_{i}__", block)

    return text
