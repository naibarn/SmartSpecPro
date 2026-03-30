"""Tests for Google Drive MCP security hardening (section-02).

Covers F13 (query injection), F15 (response filtering).
"""

from unittest.mock import AsyncMock, MagicMock, patch

import pytest

pytestmark = [pytest.mark.unit]


class TestQuerySanitization:
    """F13: Drive search query must reject injection operators."""

    def test_rejects_or_operator(self):
        """Query with OR operator is sanitized."""
        from app.mcp.google_drive_mcp import _sanitize_drive_query

        result = _sanitize_drive_query("x' or '1'='1")
        assert "'" not in result
        assert "=" not in result

    def test_allows_safe_characters(self):
        """Query with only safe characters passes unchanged."""
        from app.mcp.google_drive_mcp import _sanitize_drive_query

        safe_query = "meeting notes 2026-03-01"
        assert _sanitize_drive_query(safe_query) == safe_query

    def test_allows_thai_characters(self):
        """Thai characters in query are preserved."""
        from app.mcp.google_drive_mcp import _sanitize_drive_query

        thai_query = "รายงานการประชุม"
        assert _sanitize_drive_query(thai_query) == thai_query


class TestResponseFiltering:
    """F15: File info response must not include owner emails."""

    @pytest.mark.asyncio
    async def test_file_info_excludes_owner_emails(self):
        """get_drive_file_info does not return owner email addresses."""
        from app.mcp.google_drive_mcp import get_drive_file_info

        mock_file_meta = {
            "id": "file123",
            "name": "report.docx",
            "mimeType": "application/vnd.google-apps.document",
            "size": "1024",
            "modifiedTime": "2026-01-01T00:00:00Z",
            "createdTime": "2025-12-01T00:00:00Z",
            "webViewLink": "https://docs.google.com/...",
            "owners": [{"emailAddress": "owner@example.com", "displayName": "Owner"}],
            "parents": ["parent-folder-id"],
        }

        mock_drive = MagicMock()
        mock_drive.files.return_value.get.return_value.execute.return_value = mock_file_meta

        with (
            patch("app.mcp.google_drive_mcp._get_access_token", AsyncMock(return_value="token")),
            patch("app.mcp.google_drive_mcp._build_drive_service", return_value=mock_drive),
        ):
            result = await get_drive_file_info("file123", user_id=1, tenant_id="t1")

        # Safe fields present
        assert "id" in result
        assert "name" in result
        assert "webViewLink" in result
        # Sensitive fields filtered
        assert "owners" not in result
        assert "parents" not in result
        # No email in the result at all
        assert "owner@example.com" not in str(result)
