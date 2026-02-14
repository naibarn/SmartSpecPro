Now I have all the context needed. Let me produce the section content.

# Section 09: Google Drive MCP Server

## Overview

This section implements FastMCP-style tools that expose Google Drive operations to the AI chat system. When a user has connected their Google account, the LLM can invoke tools like `search_drive_files`, `read_drive_file`, `read_sheet_data`, `list_drive_folder`, and `get_drive_file_info` during a conversation. The tools are Python-native (they call Google APIs directly from the Python backend) and are surfaced to the Node.js chat system via internal HTTP API endpoints.

**Dependencies:**
- Section 03 (OAuth Consent): Provides `GoogleTokenService` for obtaining valid user access tokens, and the `oauth_connections` model with status/scopes columns.
- Section 06 (Content Extraction): Provides `GoogleContentExtractor` for extracting text from Drive files (used by `read_drive_file` and `read_sheet_data`).
- Section 04 (Credit Billing): Provides the `deductCredits` function with idempotency support and service tags for billing `gdrive.mcp_read` and `gdrive.mcp_sheet` operations.

**Key files to create:**
- `/home/dev/projects/SmartSpecPro/python-backend/app/mcp/google_drive_mcp.py` -- MCP tool handlers
- `/home/dev/projects/SmartSpecPro/python-backend/app/mcp/__init__.py` -- Package init
- `/home/dev/projects/SmartSpecPro/python-backend/app/api/internal_mcp.py` -- Internal FastAPI router exposing MCP tool endpoints
- `/home/dev/projects/SmartSpecPro/python-backend/tests/test_google_drive_mcp.py` -- Python tests

**Key files to modify:**
- `/home/dev/projects/SmartSpecPro/python-backend/app/main.py` -- Register the internal MCP router
- `/home/dev/projects/SmartSpecPro/apps/web/server/_core/mcpRoutes.ts` -- Extend tool discovery to include Python-native Drive tools
- `/home/dev/projects/SmartSpecPro/apps/web/server/services/chatService.ts` -- Extend `buildChatContext()` to include Drive tools for connected users
- `/home/dev/projects/SmartSpecPro/apps/web/server/_core/mcpRoutes.test.ts` -- Vitest tests for tool discovery

---

## Tests (Write First)

### Python tests: `/home/dev/projects/SmartSpecPro/python-backend/tests/test_google_drive_mcp.py`

```python
"""
Tests for Google Drive MCP tools.

Uses `responses` library to mock Google API HTTP calls.
Uses `unittest.mock` to mock GoogleTokenService and GoogleContentExtractor.
"""
import pytest
from unittest.mock import AsyncMock, patch, MagicMock

# Test: search_drive_files calls Drive API with correct query and returns formatted results
# - Mock GoogleTokenService.get_valid_access_token to return a fake token
# - Mock the Drive API v3 files.list HTTP call with `responses` library
# - Call search_drive_files(query="budget report", user_id=1)
# - Assert result contains formatted file list with id, name, mimeType, modifiedTime

# Test: search_drive_files respects max_results parameter
# - Call search_drive_files(query="test", max_results=5, user_id=1)
# - Assert the Drive API request uses pageSize=5

# Test: read_drive_file extracts text content and charges gdrive.mcp_read credits
# - Mock GoogleContentExtractor.extract to return 4000 chars of text
# - Call read_drive_file(file_id="abc123", user_id=1)
# - Assert credits charged = max(1, ceil(4000 / 2000)) = 2, capped at 5
# - Assert the extracted text is returned

# Test: read_drive_file returns ToolError when file not found (404)
# - Mock Drive API to return 404
# - Call read_drive_file(file_id="nonexistent", user_id=1)
# - Assert raises/returns ToolError with "file_not_found" message

# Test: read_drive_file returns ToolError when token expired
# - Mock GoogleTokenService.get_valid_access_token to raise InvalidGrantError
# - Call read_drive_file(file_id="abc123", user_id=1)
# - Assert raises/returns ToolError with "token_expired" message

# Test: read_sheet_data reads specified sheet and cell range
# - Mock Sheets API to return grid data for "Sheet1!A1:C10"
# - Call read_sheet_data(file_id="abc", sheet_name="Sheet1", cell_range="A1:C10", user_id=1)
# - Assert result contains parsed cell data

# Test: read_sheet_data charges gdrive.mcp_sheet credits based on cell count
# - Mock Sheets API returning 1200 cells
# - Assert credits charged = max(1, ceil(1200 / 500)) = 3, capped at 3

# Test: list_drive_folder lists files with metadata
# - Mock Drive API files.list with parent query
# - Call list_drive_folder(folder_id="folder123", user_id=1)
# - Assert returns list of files with id, name, mimeType, size

# Test: get_drive_file_info returns file metadata without content
# - Mock Drive API files.get
# - Call get_drive_file_info(file_id="abc123", user_id=1)
# - Assert returns metadata dict (name, mimeType, size, modifiedTime, owners, etc.)

# Test: all tools inject user_id from request context (not as parameter)
# - Verify that user_id is read from the auth context / dependency injection
# - Not passed as a tool argument by the LLM
```

### Vitest tests: `/home/dev/projects/SmartSpecPro/apps/web/server/_core/mcpRoutes.test.ts`

Add the following test cases to the existing test file (or create a new describe block):

```typescript
// Test: mcpRoutes tool listing includes Google Drive tools when user has Google connected
// - Mock the Python backend internal MCP tools endpoint to return Drive tools
// - Mock the user's Google connection status as "connected"
// - GET /api/mcp/tools should return both workspace tools AND Drive tools merged

// Test: mcpRoutes tool listing excludes Google Drive tools when user not connected
// - Mock the user's Google connection status as "not_connected"
// - GET /api/mcp/tools should return only workspace tools (no Drive tools)

// Test: buildChatContext includes Drive tools for connected users
// - Mock user Google connection as connected
// - Call buildChatContext(conversationId, userId)
// - Assert that the returned system prompt or tool definitions include Drive tool descriptions
```

---

## Implementation Details

### 1. Python MCP Tool Module

**File:** `/home/dev/projects/SmartSpecPro/python-backend/app/mcp/__init__.py`

Empty init file to make `mcp` a proper Python package.

**File:** `/home/dev/projects/SmartSpecPro/python-backend/app/mcp/google_drive_mcp.py`

This module defines five tool handler functions. These are NOT subprocess-based FastMCP tools; they are plain async Python functions that are registered as FastAPI internal API endpoints. The "MCP" naming is conceptual -- they follow the MCP tool interface pattern (name, description, inputSchema, handler) but are invoked via HTTP.

Each tool function has this signature pattern:

```python
async def search_drive_files(
    query: str,
    user_id: int,
    tenant_id: str,
    file_type: str | None = None,
    max_results: int = 10,
) -> dict:
    """Search the user's Google Drive for files matching a query.

    Uses Drive API v3 files.list with q parameter.
    Free operation -- no credit charge.
    """
    ...
```

**Tool definitions (5 tools):**

1. **`search_drive_files(query, file_type?, max_results?)`**
   - Calls Drive API v3 `files.list` with `q` parameter built from query string
   - If `file_type` is specified (e.g., "document", "spreadsheet", "pdf"), adds MIME type filter to query
   - Returns list of `{id, name, mimeType, modifiedTime, size, webViewLink}`
   - Free operation -- no credits charged
   - Uses `google-api-python-client` with `googleapiclient.discovery.build("drive", "v3", credentials=creds)`

2. **`read_drive_file(file_id)`**
   - Uses `GoogleContentExtractor.extract(file_id, mime_type, access_token)` from Section 06
   - First calls `files.get` to obtain mime_type if not known
   - Returns extracted text content
   - Credits: `max(1, ceil(len(text) / 2000))`, capped at 5 credits, with service tag `gdrive.mcp_read`
   - Billing is post-deduct (charge after successful extraction)

3. **`read_sheet_data(file_id, sheet_name?, cell_range?)`**
   - Uses Sheets API (`spreadsheets.values.get`) for targeted range reads
   - If no sheet_name/range, reads first sheet entirely
   - Returns structured data: `{sheet_name, headers, rows, total_cells}`
   - Credits: `max(1, ceil(total_cells / 500))`, capped at 3 credits, service tag `gdrive.mcp_sheet`

4. **`list_drive_folder(folder_id?)`**
   - If `folder_id` is None, lists root folder
   - Calls Drive API `files.list` with `parents in "folder_id"` query
   - Returns `{files: [{id, name, mimeType, size, modifiedTime}], next_page_token?}`
   - Free operation -- no credits charged

5. **`get_drive_file_info(file_id)`**
   - Calls Drive API `files.get` with fields: `id, name, mimeType, size, modifiedTime, createdTime, owners, webViewLink, parents`
   - Returns file metadata dict
   - Free operation -- no credits charged

**Error handling pattern:**

```python
class ToolError(Exception):
    """Raised for expected tool errors (file not found, permission denied, token expired)."""
    def __init__(self, code: str, message: str):
        self.code = code
        self.message = message
        super().__init__(message)
```

Each tool wraps its logic in try/except:
- `googleapiclient.errors.HttpError` with status 404 raises `ToolError("file_not_found", "...")`
- `googleapiclient.errors.HttpError` with status 403 raises `ToolError("permission_denied", "...")`
- `InvalidGrantError` (from GoogleTokenService) raises `ToolError("token_expired", "...")`
- In production (`mask_error_details=True` from env), error messages are generic. In dev, they include details.

**Auth flow within each tool:**
1. Receive `user_id` and `tenant_id` from the FastAPI dependency injection (JWT auth context from the internal API call)
2. Call `GoogleTokenService.get_valid_access_token(user_id)` to get a valid OAuth token
3. Build Google API credentials from the token: `google.oauth2.credentials.Credentials(token=access_token)`
4. Build the service: `googleapiclient.discovery.build("drive", "v3", credentials=creds)`
5. Execute the API call

**Credit billing within tools** (for `read_drive_file` and `read_sheet_data`):
- After successful content retrieval, call the Node.js credit deduction endpoint via `web_gateway` HTTP client
- Use the existing `web_gateway.py` pattern: `POST {base}/api/internal/credits/deduct` with `user_token` for auth
- Include `idempotencyKey` formatted as `mcp:{tool_name}:{file_id}:{timestamp_minute}` to prevent double-charging on retries within the same minute
- Include `metadata.service` tag (`gdrive.mcp_read` or `gdrive.mcp_sheet`)

**Tool registry constant** -- a list of tool definitions exposed for discovery:

```python
GOOGLE_DRIVE_TOOLS = [
    {
        "name": "search_drive_files",
        "description": "Search the user's Google Drive for files matching a query. Returns file names, types, and IDs.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "query": {"type": "string", "description": "Search query string"},
                "file_type": {"type": "string", "enum": ["document", "spreadsheet", "presentation", "pdf", "image"], "description": "Optional file type filter"},
                "max_results": {"type": "integer", "default": 10, "description": "Maximum results to return (1-50)"},
            },
            "required": ["query"],
        },
    },
    # ... similar entries for all 5 tools
]
```

### 2. Internal FastAPI Router

**File:** `/home/dev/projects/SmartSpecPro/python-backend/app/api/internal_mcp.py`

This router exposes two endpoints that the Node.js backend calls:

```python
router = APIRouter(prefix="/api/internal/mcp", tags=["Internal MCP"])
```

**Endpoints:**

1. **`GET /api/internal/mcp/tools`** -- Returns the list of available Python-native MCP tools
   - Protected by the gateway key (`x-gateway-key` header, same pattern as `internal_provider.py`)
   - Optionally accepts `user_id` query param; if the user does not have a Google connection with status "active", returns an empty tools list
   - Response: `{"tools": [...]}` matching the OpenAI function-calling tool format

2. **`POST /api/internal/mcp/tools/call`** -- Executes a specific tool
   - Protected by gateway key
   - Request body: `{"name": "search_drive_files", "arguments": {"query": "..."}, "user_id": 123, "tenant_id": "abc"}`
   - The `user_id` and `tenant_id` come from the Node.js backend (which authenticated the user via JWT) -- they are NOT sent by the LLM
   - Routes to the appropriate handler function in `google_drive_mcp.py`
   - Returns: `{"ok": true, "content": [{"type": "text", "text": "..."}]}` on success
   - Returns: `{"ok": false, "error": {"code": "file_not_found", "message": "..."}}` on ToolError
   - Catches `ToolError` and returns structured error; catches unexpected exceptions and returns 500 with masked message in production

**Auth verification:**
- The internal API uses the same `x-gateway-key` header pattern as the existing `/api/v1/internal/provider` endpoint
- The `user_id` and `tenant_id` are passed in the request body by Node.js (which already validated them from the user's JWT session)
- The tool handlers use these IDs to fetch the user's Google OAuth tokens from the database

### 3. Register in Python Main App

**File to modify:** `/home/dev/projects/SmartSpecPro/python-backend/app/main.py`

Add a new import and `app.include_router` call:

```python
from app.api import internal_mcp
# ...
app.include_router(internal_mcp.router, tags=["Internal MCP"])
```

Place it near the existing `internal_provider` router registration (around line 201).

### 4. Extend Node.js MCP Tool Discovery

**File to modify:** `/home/dev/projects/SmartSpecPro/apps/web/server/_core/mcpRoutes.ts`

The existing `registerMCPRoutes` function serves local workspace tools. Extend the `toolsHandler` to also query the Python backend for Drive tools and merge them into the tool list.

**Changes to `toolsHandler`:**

```typescript
// In the toolsHandler function, after building the local `tools` list:
// 1. Check if the authenticated user has a Google connection (query oauth_connections)
// 2. If connected, fetch Python-native tools from POST to Python backend
// 3. Merge both tool lists and return
```

The implementation should:
- Make an HTTP call to `http://localhost:8000/api/internal/mcp/tools?user_id={userId}` with the gateway key header
- Merge the returned tools array with the existing local `tools` array
- Cache the Python tools list for 60 seconds (they don't change often) using a simple in-memory Map with TTL
- If the Python backend is unreachable, gracefully degrade (return only local tools, log warning)
- Add a timeout of 2 seconds for the Python backend call

**Changes to `callHandler`:**

```typescript
// When a tool call comes in for a Drive tool name (starts with "search_drive_", "read_drive_", etc.):
// 1. Forward the call to Python backend: POST /api/internal/mcp/tools/call
// 2. Pass user_id and tenant_id from the auth context
// 3. Return the result to the caller
```

The implementation should:
- Check if the requested tool name exists in the local `tools` array first
- If not found locally, forward to the Python backend internal MCP endpoint
- Pass `{name, arguments, user_id: auth.sub, tenant_id: auth.tenantId}` in the POST body
- Return the Python response directly (it follows the same `{ok, content}` format)

### 5. Extend Chat Context for Drive Tools

**File to modify:** `/home/dev/projects/SmartSpecPro/apps/web/server/services/chatService.ts`

The `buildChatContext` function (around line 619) currently builds a message array for LLM requests. Extend it to include Google Drive tool availability when the user has an active Google connection.

**Changes:**

After the entity memories block (step 2) and before the summaries block (step 3), add a step that:
1. Checks if the user has an active Google OAuth connection (query `oauth_connections` table for `user_id` with `provider = 'google'` and `status = 'active'`)
2. If connected, appends a system message informing the LLM about available Drive tools:

```
You have access to the user's Google Drive via the following tools:
- search_drive_files: Search for files by name or content
- read_drive_file: Read the text content of a Drive file
- read_sheet_data: Read data from a Google Sheet
- list_drive_folder: List files in a Drive folder
- get_drive_file_info: Get metadata about a Drive file

Use these tools when the user asks about their Google Drive files, wants to find documents, or needs content from their Drive.
```

3. The connection check should be cached per-request (not per-call) to avoid N+1 queries. A simple pattern: check once at the beginning of `buildChatContext` and pass the flag through.

**Important note:** The actual tool execution in the chat flow (when the LLM returns a `tool_use` response) is handled by the existing tool dispatch mechanism. The chat router already has infrastructure for processing tool calls. The Drive tool calls are dispatched through the same `mcpRoutes.ts` `callHandler` which now knows how to forward to the Python backend. No changes needed to the chat router's tool dispatch logic itself -- only the tool listing and context need updating.

### 6. Integration Architecture Summary

The complete flow for a Drive MCP tool call during chat:

```
1. User asks: "What's in my Q4 budget spreadsheet?"
2. Node.js chat router calls buildChatContext() 
   -> includes Drive tools system message (because user is Google-connected)
3. LLM sees available tools, decides to call search_drive_files(query="Q4 budget")
4. Chat router receives tool_use response from LLM
5. Chat router calls mcpRoutes callHandler with tool name + arguments
6. callHandler sees "search_drive_files" is not a local tool
7. callHandler forwards to Python: POST http://localhost:8000/api/internal/mcp/tools/call
   Body: {name: "search_drive_files", arguments: {query: "Q4 budget"}, user_id: 42, tenant_id: "t1"}
8. Python internal_mcp router validates gateway key
9. Python routes to google_drive_mcp.search_drive_files handler
10. Handler calls GoogleTokenService.get_valid_access_token(42) -> access_token
11. Handler calls Drive API files.list with query -> returns results
12. Handler returns {ok: true, content: [{type: "text", text: "...formatted results..."}]}
13. Node.js receives response, injects into LLM context as tool result
14. LLM continues conversation with the file list information
```

For `read_drive_file`, steps 10-12 additionally include:
- Content extraction via `GoogleContentExtractor`
- Credit billing via `POST /api/internal/credits/deduct` with service tag `gdrive.mcp_read`

### 7. Feature Flag Gating

The Drive MCP tools are gated behind the `driveReadonlyScopeApproved` feature flag (stored in `system_settings` under category `oauth`). This flag controls whether Drive tools that read user files (which require `drive.readonly` scope) are enabled.

**Where the gate is applied:**
- In the Python `GET /api/internal/mcp/tools` endpoint: if the flag is not set, return an empty tools list
- In the Node.js `toolsHandler`: skip the Python backend call entirely if the flag is not set

**How to check the flag:**
- Python: query `system_settings` for `category='oauth'`, `key='driveReadonlyScopeApproved'`, `value='true'`
- Node.js: use the existing system settings service to check the same key

When the flag is disabled, the Drive MCP tools are invisible to the LLM and cannot be invoked. The user's Google connection still works for edit-in-Google features (Section 07) which only need `drive.file` scope.

---

## Implementation Checklist

1. Create `/home/dev/projects/SmartSpecPro/python-backend/app/mcp/__init__.py` (empty package init)
2. Create `/home/dev/projects/SmartSpecPro/python-backend/app/mcp/google_drive_mcp.py` with the five tool handlers and tool registry constant
3. Create `/home/dev/projects/SmartSpecPro/python-backend/app/api/internal_mcp.py` with the two internal API endpoints
4. Modify `/home/dev/projects/SmartSpecPro/python-backend/app/main.py` to register the internal MCP router
5. Modify `/home/dev/projects/SmartSpecPro/apps/web/server/_core/mcpRoutes.ts` to extend tool discovery and call forwarding for Python-native tools
6. Modify `/home/dev/projects/SmartSpecPro/apps/web/server/services/chatService.ts` to include Drive tools in `buildChatContext()` for connected users
7. Create `/home/dev/projects/SmartSpecPro/python-backend/tests/test_google_drive_mcp.py` with all test stubs
8. Add test cases to `/home/dev/projects/SmartSpecPro/apps/web/server/_core/mcpRoutes.test.ts` for merged tool listing behavior
9. Verify `google-api-python-client`, `google-auth`, and `google-auth-httplib2` are in `/home/dev/projects/SmartSpecPro/python-backend/requirements.txt` (these may already be added by Section 06)