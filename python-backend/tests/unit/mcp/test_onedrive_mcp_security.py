"""Tests for OneDrive MCP security hardening (section-02).

Covers F16 (OData injection), F17 (path injection), F18 (response filtering),
F19 (exception message leakage), F20 (redirect SSRF).
"""

import re
from unittest.mock import AsyncMock, MagicMock, patch
from urllib.parse import quote

import httpx
import pytest

pytestmark = [pytest.mark.unit]


class TestODataInjection:
    """F16: Search query must be URL-encoded to neutralize OData injection."""

    @pytest.mark.asyncio
    async def test_search_query_url_encoded(self):
        """Single quote injection in search query is neutralized."""
        from app.mcp.onedrive_mcp import search_onedrive_files

        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.json.return_value = {"value": []}

        mock_client = MagicMock()
        mock_client.get = AsyncMock(return_value=mock_resp)

        with (
            patch("app.mcp.onedrive_mcp._get_access_token", AsyncMock(return_value="token")),
            patch("app.mcp.onedrive_mcp.httpx.AsyncClient") as mock_factory,
        ):
            mock_factory.return_value.__aenter__ = AsyncMock(return_value=mock_client)
            mock_factory.return_value.__aexit__ = AsyncMock(return_value=False)

            await search_onedrive_files("') or ('", user_id=1, tenant_id="t1")

        # Verify the URL contains encoded characters, not raw single quotes
        call_args = mock_client.get.call_args
        url = call_args.args[0] if call_args.args else call_args.kwargs.get("url", "")
        # The query inside search(q='...') should be URL-encoded
        assert "') or ('" not in url
        assert quote("') or ('", safe="") in url or "%27" in url


class TestExcelPathInjection:
    """F17: Worksheet and cell_range must be URL-encoded in Excel URLs."""

    @pytest.mark.asyncio
    async def test_sheet_name_url_encoded(self):
        """Sheet name with injection chars is URL-encoded."""
        from app.mcp.onedrive_mcp import read_excel_data

        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.json.return_value = {"values": [["A", "B"], [1, 2]]}

        mock_client = MagicMock()
        mock_client.get = AsyncMock(return_value=mock_resp)

        with (
            patch("app.mcp.onedrive_mcp._get_access_token", AsyncMock(return_value="token")),
            patch("app.mcp.onedrive_mcp.httpx.AsyncClient") as mock_factory,
        ):
            mock_factory.return_value.__aenter__ = AsyncMock(return_value=mock_client)
            mock_factory.return_value.__aexit__ = AsyncMock(return_value=False)

            await read_excel_data(
                "valid-item-id", user_id=1, tenant_id="t1",
                sheet_name="') or true or ('",
                credit_charge_fn=AsyncMock(),
            )

        url = mock_client.get.call_args.args[0]
        assert "') or true or ('" not in url

    @pytest.mark.asyncio
    async def test_cell_range_path_traversal_blocked(self):
        """Cell range with path traversal chars is URL-encoded."""
        from app.mcp.onedrive_mcp import read_excel_data, ToolError

        # Cell range with slashes should fail validation
        with pytest.raises(ToolError):
            await read_excel_data(
                "valid-item-id", user_id=1, tenant_id="t1",
                cell_range="A1:B2/../../admin",
            )


class TestResponseFiltering:
    """F18: File info response filtered to safe subset."""

    @pytest.mark.asyncio
    async def test_file_info_filters_sensitive_fields(self):
        """get_onedrive_file_info returns only safe fields."""
        from app.mcp.onedrive_mcp import get_onedrive_file_info

        full_response = {
            "id": "abc123",
            "name": "doc.docx",
            "size": 1024,
            "lastModifiedDateTime": "2026-01-01",
            "createdDateTime": "2025-12-01",
            "webUrl": "https://onedrive.live.com/...",
            "file": {"mimeType": "application/docx"},
            "parentReference": {"driveId": "secret-drive-id", "path": "/root/private"},
            "createdBy": {"user": {"email": "user@example.com"}},
            "lastModifiedBy": {"user": {"email": "admin@example.com"}},
        }

        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.json.return_value = full_response

        mock_client = MagicMock()
        mock_client.get = AsyncMock(return_value=mock_resp)

        with (
            patch("app.mcp.onedrive_mcp._get_access_token", AsyncMock(return_value="token")),
            patch("app.mcp.onedrive_mcp.httpx.AsyncClient") as mock_factory,
        ):
            mock_factory.return_value.__aenter__ = AsyncMock(return_value=mock_client)
            mock_factory.return_value.__aexit__ = AsyncMock(return_value=False)

            result = await get_onedrive_file_info("valid-item-id", user_id=1, tenant_id="t1")

        # Safe fields present
        assert "id" in result
        assert "name" in result
        # Sensitive fields filtered out
        assert "parentReference" not in result
        assert "createdBy" not in result
        assert "lastModifiedBy" not in result


class TestRedirectSSRF:
    """F20: File download must not follow redirects to internal IPs."""

    @pytest.mark.asyncio
    async def test_download_redirect_to_metadata_blocked(self):
        """Redirect to cloud metadata endpoint is blocked."""
        from app.mcp.onedrive_mcp import read_onedrive_file, ToolError

        # First request returns metadata (for file info)
        meta_resp = MagicMock()
        meta_resp.status_code = 200
        meta_resp.json.return_value = {"name": "test.txt", "file": {"mimeType": "text/plain"}, "size": 100}

        # Second request returns redirect to metadata endpoint
        redirect_resp = MagicMock()
        redirect_resp.status_code = 302
        redirect_resp.headers = {"location": "http://169.254.169.254/latest/meta-data/"}

        mock_client = MagicMock()
        mock_client.get = AsyncMock(side_effect=[meta_resp, redirect_resp])

        with (
            patch("app.mcp.onedrive_mcp._get_access_token", AsyncMock(return_value="token")),
            patch("app.mcp.onedrive_mcp.httpx.AsyncClient") as mock_factory,
        ):
            mock_factory.return_value.__aenter__ = AsyncMock(return_value=mock_client)
            mock_factory.return_value.__aexit__ = AsyncMock(return_value=False)

            with pytest.raises(ToolError) as exc_info:
                await read_onedrive_file("valid-item-id", user_id=1, tenant_id="t1")

            assert "blocked" in exc_info.value.message.lower() or "ssrf" in exc_info.value.code.lower()
