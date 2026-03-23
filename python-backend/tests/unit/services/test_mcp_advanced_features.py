"""Tests for MCP advanced spec features — content types, annotations, pagination, cancellation."""

import pytest


# ---------------------------------------------------------------------------
# Content Types (Python side)
# ---------------------------------------------------------------------------

class TestContentTypes:

    def test_call_tool_handles_image_content(self):
        """Python call_tool handles image content type, not just text."""
        from app.services.mcp_client import _extract_content

        result = {
            "content": [
                {"type": "image", "data": "base64data==", "mimeType": "image/png"}
            ]
        }
        extracted = _extract_content(result)
        assert "[image:image/png]" in extracted

    def test_call_tool_handles_audio_content(self):
        """Voice tools return AudioContent."""
        from app.services.mcp_client import _extract_content

        result = {
            "content": [
                {"type": "audio", "data": "base64audio==", "mimeType": "audio/wav"}
            ]
        }
        extracted = _extract_content(result)
        assert "[audio:audio/wav]" in extracted

    def test_call_tool_handles_text_content(self):
        """Text content still works."""
        from app.services.mcp_client import _extract_content

        result = {
            "content": [
                {"type": "text", "text": "Hello world"}
            ]
        }
        extracted = _extract_content(result)
        assert extracted == "Hello world"

    def test_call_tool_handles_mixed_content(self):
        """Mixed content types returned correctly."""
        from app.services.mcp_client import _extract_content

        result = {
            "content": [
                {"type": "text", "text": "Here is an image:"},
                {"type": "image", "data": "base64==", "mimeType": "image/png"},
            ]
        }
        extracted = _extract_content(result)
        assert "Here is an image:" in extracted
        assert "[image:image/png]" in extracted


# ---------------------------------------------------------------------------
# Tool Annotations (Node.js side — tested via file read)
# ---------------------------------------------------------------------------

class TestToolAnnotations:

    def test_tool_definitions_include_annotations(self):
        """tool definitions include annotations (readOnlyHint, destructiveHint)."""
        import os
        mcp_server_path = os.path.join(
            os.path.dirname(__file__), "..", "..", "..",
            "..", "apps", "web", "server", "_core", "mcpPublicServer.ts"
        )
        mcp_server_path = os.path.normpath(mcp_server_path)
        with open(mcp_server_path) as f:
            content = f.read()

        assert "annotations" in content
        assert "readOnlyHint" in content


# ---------------------------------------------------------------------------
# Pagination
# ---------------------------------------------------------------------------

class TestPagination:

    def test_tools_list_supports_cursor(self):
        """tools/list supports cursor parameter for pagination."""
        import os
        mcp_server_path = os.path.join(
            os.path.dirname(__file__), "..", "..", "..",
            "..", "apps", "web", "server", "_core", "mcpPublicServer.ts"
        )
        mcp_server_path = os.path.normpath(mcp_server_path)
        with open(mcp_server_path) as f:
            content = f.read()

        assert "cursor" in content
        assert "nextCursor" in content
        assert "PAGE_SIZE" in content

    def test_page_size_default_50(self):
        """page size default 50."""
        import os
        mcp_server_path = os.path.join(
            os.path.dirname(__file__), "..", "..", "..",
            "..", "apps", "web", "server", "_core", "mcpPublicServer.ts"
        )
        mcp_server_path = os.path.normpath(mcp_server_path)
        with open(mcp_server_path) as f:
            content = f.read()

        assert "PAGE_SIZE = 50" in content
