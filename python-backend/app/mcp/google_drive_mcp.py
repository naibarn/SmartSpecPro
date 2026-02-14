"""Google Drive MCP tool handlers.

Exposes Drive operations (search, read, list, info) as tool functions
that are invoked via the internal MCP HTTP API.  These are NOT subprocess-based
FastMCP tools -- they are plain async Python functions following the MCP tool
interface pattern (name, description, inputSchema, handler).
"""

import logging
import math
import re
import time
from typing import Any, Optional

logger = logging.getLogger(__name__)

# File ID validation: alphanumeric, hyphens, underscores, max 256 chars
_FILE_ID_RE = re.compile(r"^[a-zA-Z0-9_-]{1,256}$")


# ── Exceptions ──────────────────────────────────────────────────────────────


class ToolError(Exception):
    """Raised for expected tool errors (file not found, permission denied, token expired)."""

    def __init__(self, code: str, message: str):
        self.code = code
        self.message = message
        super().__init__(message)


# ── Helpers ─────────────────────────────────────────────────────────────────

_MIME_FILTER_MAP = {
    "document": "application/vnd.google-apps.document",
    "spreadsheet": "application/vnd.google-apps.spreadsheet",
    "presentation": "application/vnd.google-apps.presentation",
    "pdf": "application/pdf",
    "image": "image/",
}


def _build_drive_service(access_token: str):
    """Build a Google Drive API v3 service from an access token."""
    from google.oauth2.credentials import Credentials
    from googleapiclient.discovery import build

    creds = Credentials(token=access_token)
    return build("drive", "v3", credentials=creds)


def _build_sheets_service(access_token: str):
    """Build a Google Sheets API v4 service from an access token."""
    from google.oauth2.credentials import Credentials
    from googleapiclient.discovery import build

    creds = Credentials(token=access_token)
    return build("sheets", "v4", credentials=creds)


async def _get_access_token(user_id: int, token_service=None) -> str:
    """Obtain a valid Google access token for the user."""
    if token_service is None:
        from app.services.google_token_service import GoogleTokenService
        from app.core.database import get_db_context
        async with get_db_context() as db:
            svc = GoogleTokenService(db)
            return await svc.get_valid_access_token(user_id)
    return await token_service.get_valid_access_token(user_id)


def _validate_file_id(file_id: str) -> str:
    """Validate and return a safe file ID."""
    if not file_id or not _FILE_ID_RE.match(file_id):
        raise ToolError("invalid_input", f"Invalid file ID format: {file_id!r}")
    return file_id


def _validate_query(query: str, max_length: int = 500) -> str:
    """Validate and sanitize a search query."""
    if not query or not query.strip():
        raise ToolError("invalid_input", "Search query cannot be empty")
    query = query.strip()
    if len(query) > max_length:
        raise ToolError("invalid_input", f"Search query too long (max {max_length} chars)")
    # Strip null bytes and control characters
    query = re.sub(r"[\x00-\x08\x0b\x0c\x0e-\x1f]", "", query)
    return query


# ── Tool Handlers ───────────────────────────────────────────────────────────


async def search_drive_files(
    query: str,
    user_id: int,
    tenant_id: str,
    *,
    file_type: Optional[str] = None,
    max_results: int = 10,
    token_service=None,
    drive_service_fn=None,
) -> dict[str, Any]:
    """Search the user's Google Drive for files matching a query.

    Free operation -- no credit charge.
    """
    from app.services.google_token_service import InvalidGrantError

    query = _validate_query(query)

    try:
        access_token = await _get_access_token(user_id, token_service)

        if drive_service_fn:
            drive = drive_service_fn(access_token)
        else:
            drive = _build_drive_service(access_token)

        # Build query string — escape single quotes in user query
        escaped_query = query.replace("\\", "\\\\").replace("'", "\\'")
        q_parts = [f"fullText contains '{escaped_query}' or name contains '{escaped_query}'"]
        q_parts.append("trashed = false")

        if file_type and file_type in _MIME_FILTER_MAP:
            mime = _MIME_FILTER_MAP[file_type]
            if mime.endswith("/"):
                q_parts.append(f"mimeType contains '{mime}'")
            else:
                q_parts.append(f"mimeType = '{mime}'")

        q_str = " and ".join(q_parts)
        max_results = max(1, min(max_results, 50))

        result = drive.files().list(
            q=q_str,
            pageSize=max_results,
            fields="files(id,name,mimeType,modifiedTime,size,webViewLink)",
            orderBy="modifiedTime desc",
        ).execute()

        files = result.get("files", [])
        return {
            "files": files,
            "total": len(files),
        }

    except InvalidGrantError:
        raise ToolError("token_expired", "Google account token has expired. Please reconnect.")
    except Exception as e:
        _handle_google_error(e)
        raise


async def read_drive_file(
    file_id: str,
    user_id: int,
    tenant_id: str,
    *,
    token_service=None,
    content_extractor=None,
    credit_charge_fn=None,
) -> dict[str, Any]:
    """Read the text content of a Google Drive file.

    Credits: max(1, ceil(char_count / 2000)), capped at 5.
    Service tag: gdrive.mcp_read
    """
    from app.services.google_token_service import InvalidGrantError

    file_id = _validate_file_id(file_id)

    try:
        access_token = await _get_access_token(user_id, token_service)

        # Get file metadata for mime type
        drive = _build_drive_service(access_token)
        file_meta = drive.files().get(
            fileId=file_id,
            fields="id,name,mimeType",
        ).execute()

        mime_type = file_meta.get("mimeType", "")

        # Extract content
        if content_extractor is None:
            from app.services.google_content_extractor import GoogleContentExtractor
            content_extractor = GoogleContentExtractor(access_token=access_token)

        extracted = content_extractor.extract(file_id=file_id, mime_type=mime_type)
        text = extracted.get("text", "") if isinstance(extracted, dict) else getattr(extracted, "text", str(extracted))

        if not text:
            return {"text": "", "file_name": file_meta.get("name", ""), "char_count": 0}

        # Calculate and charge credits
        char_count = len(text)
        credits = min(max(1, math.ceil(char_count / 2000)), 5)
        idempotency_key = f"mcp:read_drive_file:{file_id}:{int(time.time()) // 60}"

        if credit_charge_fn:
            await credit_charge_fn(
                user_id=user_id,
                amount=credits,
                service="gdrive.mcp_read",
                idempotency_key=idempotency_key,
                metadata={"file_id": file_id, "char_count": char_count},
            )
        else:
            from app.services.credit_billing_client import charge_credits_post_deduct
            await charge_credits_post_deduct(
                user_id=user_id,
                amount=credits,
                service="gdrive.mcp_read",
                idempotency_key=idempotency_key,
                metadata={"file_id": file_id, "char_count": char_count},
            )

        return {
            "text": text,
            "file_name": file_meta.get("name", ""),
            "char_count": char_count,
            "credits_charged": credits,
        }

    except InvalidGrantError:
        raise ToolError("token_expired", "Google account token has expired. Please reconnect.")
    except ToolError:
        raise
    except Exception as e:
        _handle_google_error(e)
        raise


async def read_sheet_data(
    file_id: str,
    user_id: int,
    tenant_id: str,
    *,
    sheet_name: Optional[str] = None,
    cell_range: Optional[str] = None,
    token_service=None,
    sheets_service_fn=None,
    credit_charge_fn=None,
) -> dict[str, Any]:
    """Read data from a Google Sheet.

    Credits: max(1, ceil(total_cells / 500)), capped at 3.
    Service tag: gdrive.mcp_sheet
    """
    from app.services.google_token_service import InvalidGrantError

    file_id = _validate_file_id(file_id)
    if cell_range and not re.match(r"^[A-Za-z0-9:!]+$", cell_range):
        raise ToolError("invalid_input", f"Invalid cell range format: {cell_range!r}")

    try:
        access_token = await _get_access_token(user_id, token_service)

        if sheets_service_fn:
            sheets = sheets_service_fn(access_token)
        else:
            sheets = _build_sheets_service(access_token)

        # Build range string
        range_str = sheet_name or "Sheet1"
        if cell_range:
            range_str = f"{range_str}!{cell_range}"

        result = sheets.spreadsheets().values().get(
            spreadsheetId=file_id,
            range=range_str,
        ).execute()

        values = result.get("values", [])
        headers = values[0] if values else []
        rows = values[1:] if len(values) > 1 else []
        total_cells = sum(len(row) for row in values)

        # Calculate and charge credits
        credits = min(max(1, math.ceil(total_cells / 500)), 3)
        idempotency_key = f"mcp:read_sheet_data:{file_id}:{int(time.time()) // 60}"

        if credit_charge_fn:
            await credit_charge_fn(
                user_id=user_id,
                amount=credits,
                service="gdrive.mcp_sheet",
                idempotency_key=idempotency_key,
                metadata={"file_id": file_id, "total_cells": total_cells},
            )
        else:
            from app.services.credit_billing_client import charge_credits_post_deduct
            await charge_credits_post_deduct(
                user_id=user_id,
                amount=credits,
                service="gdrive.mcp_sheet",
                idempotency_key=idempotency_key,
                metadata={"file_id": file_id, "total_cells": total_cells},
            )

        return {
            "sheet_name": sheet_name or "Sheet1",
            "headers": headers,
            "rows": rows,
            "total_cells": total_cells,
            "credits_charged": credits,
        }

    except InvalidGrantError:
        raise ToolError("token_expired", "Google account token has expired. Please reconnect.")
    except ToolError:
        raise
    except Exception as e:
        _handle_google_error(e)
        raise


async def list_drive_folder(
    user_id: int,
    tenant_id: str,
    *,
    folder_id: Optional[str] = None,
    token_service=None,
    drive_service_fn=None,
) -> dict[str, Any]:
    """List files in a Google Drive folder.

    Free operation -- no credit charge.
    """
    from app.services.google_token_service import InvalidGrantError

    if folder_id:
        folder_id = _validate_file_id(folder_id)

    try:
        access_token = await _get_access_token(user_id, token_service)

        if drive_service_fn:
            drive = drive_service_fn(access_token)
        else:
            drive = _build_drive_service(access_token)

        parent = folder_id or "root"
        q = f"'{parent}' in parents and trashed = false"

        result = drive.files().list(
            q=q,
            pageSize=100,
            fields="files(id,name,mimeType,size,modifiedTime),nextPageToken",
            orderBy="name",
        ).execute()

        return {
            "files": result.get("files", []),
            "next_page_token": result.get("nextPageToken"),
        }

    except InvalidGrantError:
        raise ToolError("token_expired", "Google account token has expired. Please reconnect.")
    except Exception as e:
        _handle_google_error(e)
        raise


async def get_drive_file_info(
    file_id: str,
    user_id: int,
    tenant_id: str,
    *,
    token_service=None,
    drive_service_fn=None,
) -> dict[str, Any]:
    """Get metadata about a Google Drive file.

    Free operation -- no credit charge.
    """
    from app.services.google_token_service import InvalidGrantError

    file_id = _validate_file_id(file_id)

    try:
        access_token = await _get_access_token(user_id, token_service)

        if drive_service_fn:
            drive = drive_service_fn(access_token)
        else:
            drive = _build_drive_service(access_token)

        file_meta = drive.files().get(
            fileId=file_id,
            fields="id,name,mimeType,size,modifiedTime,createdTime,owners,webViewLink,parents",
        ).execute()

        return file_meta

    except InvalidGrantError:
        raise ToolError("token_expired", "Google account token has expired. Please reconnect.")
    except Exception as e:
        _handle_google_error(e)
        raise


# ── Error Handling ──────────────────────────────────────────────────────────


def _handle_google_error(exc: Exception):
    """Convert Google API errors to ToolError."""
    status = getattr(exc, "status_code", None)
    if status is None and hasattr(exc, "resp"):
        status = int(getattr(exc.resp, "status", 0))

    if status == 404:
        raise ToolError("file_not_found", "File not found or has been deleted.")
    if status == 403:
        raise ToolError("permission_denied", "You do not have permission to access this file.")


# ── Tool Registry ──────────────────────────────────────────────────────────

GOOGLE_DRIVE_TOOLS: list[dict[str, Any]] = [
    {
        "name": "search_drive_files",
        "description": "Search the user's Google Drive for files matching a query. Returns file names, types, and IDs.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "query": {"type": "string", "description": "Search query string"},
                "file_type": {
                    "type": "string",
                    "enum": ["document", "spreadsheet", "presentation", "pdf", "image"],
                    "description": "Optional file type filter",
                },
                "max_results": {
                    "type": "integer",
                    "default": 10,
                    "description": "Maximum results to return (1-50)",
                },
            },
            "required": ["query"],
        },
    },
    {
        "name": "read_drive_file",
        "description": "Read the text content of a Google Drive file. Supports Docs, Sheets, Slides, PDFs, and plain text files.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "file_id": {"type": "string", "description": "Google Drive file ID"},
            },
            "required": ["file_id"],
        },
    },
    {
        "name": "read_sheet_data",
        "description": "Read data from a Google Sheet. Returns headers and rows. Optionally specify a sheet name and cell range.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "file_id": {"type": "string", "description": "Google Sheets file ID"},
                "sheet_name": {"type": "string", "description": "Sheet tab name (default: Sheet1)"},
                "cell_range": {"type": "string", "description": "Cell range like A1:C10"},
            },
            "required": ["file_id"],
        },
    },
    {
        "name": "list_drive_folder",
        "description": "List files in a Google Drive folder. If no folder ID is provided, lists the root folder.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "folder_id": {"type": "string", "description": "Folder ID (omit for root)"},
            },
        },
    },
    {
        "name": "get_drive_file_info",
        "description": "Get metadata about a Google Drive file including name, type, size, modification date, and owners.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "file_id": {"type": "string", "description": "Google Drive file ID"},
            },
            "required": ["file_id"],
        },
    },
]

# Handler dispatch map
TOOL_HANDLERS = {
    "search_drive_files": search_drive_files,
    "read_drive_file": read_drive_file,
    "read_sheet_data": read_sheet_data,
    "list_drive_folder": list_drive_folder,
    "get_drive_file_info": get_drive_file_info,
}
