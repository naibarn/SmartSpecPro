"""Tests for Google Drive MCP tools (section 09)."""

import math
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.mcp.google_drive_mcp import (
    ToolError,
    search_drive_files,
    read_drive_file,
    read_sheet_data,
    list_drive_folder,
    get_drive_file_info,
    GOOGLE_DRIVE_TOOLS,
    TOOL_HANDLERS,
)


def _mock_token_service(token: str = "test-token"):
    svc = AsyncMock()
    svc.get_valid_access_token = AsyncMock(return_value=token)
    return svc


def _mock_drive_service(files_list_result=None, files_get_result=None):
    """Create a mock Drive service factory."""
    drive = MagicMock()
    files_mock = MagicMock()

    if files_list_result is not None:
        files_mock.list.return_value.execute.return_value = files_list_result

    if files_get_result is not None:
        files_mock.get.return_value.execute.return_value = files_get_result

    drive.files.return_value = files_mock
    return lambda token: drive


def _mock_sheets_service(values_result=None):
    """Create a mock Sheets service factory."""
    sheets = MagicMock()
    ss = MagicMock()
    vals = MagicMock()
    vals.get.return_value.execute.return_value = values_result or {"values": []}
    ss.values.return_value = vals
    sheets.spreadsheets.return_value = ss
    return lambda token: sheets


# ── search_drive_files ──────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_search_drive_files_returns_results():
    """search_drive_files calls Drive API with query and returns formatted results."""
    files_result = {
        "files": [
            {"id": "f1", "name": "Budget Report", "mimeType": "application/vnd.google-apps.document", "modifiedTime": "2026-01-01"},
            {"id": "f2", "name": "Budget Sheet", "mimeType": "application/vnd.google-apps.spreadsheet", "modifiedTime": "2026-01-02"},
        ]
    }
    drive_fn = _mock_drive_service(files_list_result=files_result)

    result = await search_drive_files(
        query="budget report",
        user_id=1,
        tenant_id="t1",
        token_service=_mock_token_service(),
        drive_service_fn=drive_fn,
    )

    assert result["total"] == 2
    assert result["files"][0]["name"] == "Budget Report"
    assert result["files"][1]["id"] == "f2"


@pytest.mark.asyncio
async def test_search_drive_files_respects_max_results():
    """search_drive_files passes max_results as pageSize."""
    drive = MagicMock()
    files_mock = MagicMock()
    files_mock.list.return_value.execute.return_value = {"files": []}
    drive.files.return_value = files_mock
    drive_fn = lambda token: drive

    await search_drive_files(
        query="test",
        user_id=1,
        tenant_id="t1",
        max_results=5,
        token_service=_mock_token_service(),
        drive_service_fn=drive_fn,
    )

    call_kwargs = files_mock.list.call_args
    assert call_kwargs.kwargs["pageSize"] == 5


@pytest.mark.asyncio
async def test_search_drive_files_filters_by_type():
    """search_drive_files adds MIME type filter when file_type is specified."""
    drive = MagicMock()
    files_mock = MagicMock()
    files_mock.list.return_value.execute.return_value = {"files": []}
    drive.files.return_value = files_mock
    drive_fn = lambda token: drive

    await search_drive_files(
        query="test",
        user_id=1,
        tenant_id="t1",
        file_type="document",
        token_service=_mock_token_service(),
        drive_service_fn=drive_fn,
    )

    call_kwargs = files_mock.list.call_args
    q = call_kwargs.kwargs["q"]
    assert "application/vnd.google-apps.document" in q


# ── read_drive_file ──────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_read_drive_file_extracts_and_charges():
    """read_drive_file extracts text content and charges credits."""
    mock_extractor = MagicMock()
    mock_extractor.extract.return_value = {"text": "A" * 4000}

    mock_charge = AsyncMock()

    with patch("app.mcp.google_drive_mcp._build_drive_service") as mock_build:
        mock_drive = MagicMock()
        mock_drive.files.return_value.get.return_value.execute.return_value = {
            "id": "abc123", "name": "Test Doc", "mimeType": "application/vnd.google-apps.document"
        }
        mock_build.return_value = mock_drive

        result = await read_drive_file(
            file_id="abc123",
            user_id=1,
            tenant_id="t1",
            token_service=_mock_token_service(),
            content_extractor=mock_extractor,
            credit_charge_fn=mock_charge,
        )

    assert result["char_count"] == 4000
    assert result["text"] == "A" * 4000

    # Credits: max(1, ceil(4000/2000)) = 2, capped at 5
    mock_charge.assert_called_once()
    charge_kwargs = mock_charge.call_args.kwargs
    assert charge_kwargs["amount"] == 2
    assert charge_kwargs["service"] == "gdrive.mcp_read"


@pytest.mark.asyncio
async def test_read_drive_file_token_expired():
    """read_drive_file returns ToolError when token is expired."""
    from app.services.google_token_service import InvalidGrantError

    token_svc = AsyncMock()
    token_svc.get_valid_access_token = AsyncMock(side_effect=InvalidGrantError("expired"))

    with pytest.raises(ToolError) as exc_info:
        await read_drive_file(
            file_id="abc123",
            user_id=1,
            tenant_id="t1",
            token_service=token_svc,
        )

    assert exc_info.value.code == "token_expired"


# ── read_sheet_data ──────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_read_sheet_data_returns_parsed_cells():
    """read_sheet_data reads specified range and returns structured data."""
    values_result = {
        "values": [
            ["Name", "Age", "City"],
            ["Alice", "30", "NYC"],
            ["Bob", "25", "LA"],
        ]
    }
    sheets_fn = _mock_sheets_service(values_result=values_result)
    mock_charge = AsyncMock()

    result = await read_sheet_data(
        file_id="sheet1",
        user_id=1,
        tenant_id="t1",
        sheet_name="Sheet1",
        cell_range="A1:C3",
        token_service=_mock_token_service(),
        sheets_service_fn=sheets_fn,
        credit_charge_fn=mock_charge,
    )

    assert result["headers"] == ["Name", "Age", "City"]
    assert len(result["rows"]) == 2
    assert result["total_cells"] == 9


@pytest.mark.asyncio
async def test_read_sheet_data_charges_credits():
    """read_sheet_data charges credits based on cell count."""
    # 1200 cells -> max(1, ceil(1200/500)) = 3, capped at 3
    values = [["c"] * 40 for _ in range(30)]  # 40*30 = 1200 cells
    values_result = {"values": values}
    sheets_fn = _mock_sheets_service(values_result=values_result)
    mock_charge = AsyncMock()

    result = await read_sheet_data(
        file_id="sheet1",
        user_id=1,
        tenant_id="t1",
        token_service=_mock_token_service(),
        sheets_service_fn=sheets_fn,
        credit_charge_fn=mock_charge,
    )

    assert result["total_cells"] == 1200
    charge_kwargs = mock_charge.call_args.kwargs
    assert charge_kwargs["amount"] == 3
    assert charge_kwargs["service"] == "gdrive.mcp_sheet"


# ── list_drive_folder ────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_list_drive_folder_lists_files():
    """list_drive_folder returns files in a folder."""
    files_result = {
        "files": [
            {"id": "f1", "name": "doc1.txt", "mimeType": "text/plain", "size": "1024"},
            {"id": "f2", "name": "sheet.xlsx", "mimeType": "application/vnd.google-apps.spreadsheet"},
        ]
    }
    drive_fn = _mock_drive_service(files_list_result=files_result)

    result = await list_drive_folder(
        user_id=1,
        tenant_id="t1",
        folder_id="folder123",
        token_service=_mock_token_service(),
        drive_service_fn=drive_fn,
    )

    assert len(result["files"]) == 2
    assert result["files"][0]["name"] == "doc1.txt"


# ── get_drive_file_info ──────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_get_drive_file_info_returns_metadata():
    """get_drive_file_info returns file metadata dict."""
    file_meta = {
        "id": "abc123",
        "name": "Test Doc",
        "mimeType": "application/vnd.google-apps.document",
        "size": "2048",
        "modifiedTime": "2026-02-14T00:00:00Z",
        "owners": [{"emailAddress": "user@example.com"}],
    }
    drive_fn = _mock_drive_service(files_get_result=file_meta)

    result = await get_drive_file_info(
        file_id="abc123",
        user_id=1,
        tenant_id="t1",
        token_service=_mock_token_service(),
        drive_service_fn=drive_fn,
    )

    assert result["name"] == "Test Doc"
    assert result["mimeType"] == "application/vnd.google-apps.document"
    assert result["owners"][0]["emailAddress"] == "user@example.com"


# ── Tool Registry ───────────────────────────────────────────────────────


def test_tool_registry_has_5_tools():
    """GOOGLE_DRIVE_TOOLS has exactly 5 tools."""
    assert len(GOOGLE_DRIVE_TOOLS) == 5
    names = {t["name"] for t in GOOGLE_DRIVE_TOOLS}
    assert names == {"search_drive_files", "read_drive_file", "read_sheet_data", "list_drive_folder", "get_drive_file_info"}


def test_tool_handlers_match_registry():
    """TOOL_HANDLERS has a handler for every registered tool."""
    for tool in GOOGLE_DRIVE_TOOLS:
        assert tool["name"] in TOOL_HANDLERS, f"Missing handler for {tool['name']}"
