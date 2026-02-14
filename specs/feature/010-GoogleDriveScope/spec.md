# Feature 010: Google Drive & Google Workspace Integration

> **Status:** Draft
> **Created:** 2026-02-14
> **Scope:** Google OAuth per-user, Google Drive editing, MCP server, RAG integration, Federated Search
> **Affected Systems:** Settings UI, OAuth Service, Library Service, RAG Pipeline, MCP Infrastructure, Chat/LLM System

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Goals & Non-Goals](#2-goals--non-goals)
3. [Architecture Overview](#3-architecture-overview)
4. [Phase 1 — Per-User Google OAuth in Settings](#4-phase-1--per-user-google-oauth-in-settings)
5. [Phase 2 — Word/Excel Editing via Google Docs/Sheets](#5-phase-2--wordexcel-editing-via-google-docssheets)
6. [Phase 3 — MCP Server for Google Drive & Apps](#6-phase-3--mcp-server-for-google-drive--apps)
7. [Phase 4 — RAG Integration & Federated Search](#7-phase-4--rag-integration--federated-search)
8. [Phase 5 — Incremental Sync & Webhooks](#8-phase-5--incremental-sync--webhooks)
   - [8.4 Folder Permission & Indexing Configuration](#84-folder-permission--indexing-configuration)
   - [8.5 Unified Credit Billing Model](#85-unified-credit-billing-model) — All operations (Library, RAG, Drive, LLM, Media)
   - [8.5.12 Vector Database Cost Analysis](#8512-vector-database-cost-analysis) — pgvector, ChromaDB, Cloudflare Vectorize
9. [Database Schema Changes](#9-database-schema-changes)
10. [Security & Privacy](#10-security--privacy)
11. [API Reference](#11-api-reference)
12. [UI/UX Specifications](#12-uiux-specifications)
    - [12.4 Google Drive Dashboard](#124-google-drive-dashboard) — Overview, Files, Credit Usage, Pricing Info
13. [Testing Strategy](#13-testing-strategy)
14. [Rollout Plan](#14-rollout-plan)
15. [Appendix](#15-appendix)

---

## 1. Executive Summary

### Problem

Users currently must manually upload every file into the Document Library before it can be searched, referenced by the AI, or edited. Word and Excel files are read-only — no in-app editing is possible. Users with large collections in Google Drive must duplicate their data to use it within SmartSpecPro.

### Solution

Integrate Google Drive and Google Workspace APIs so that:

1. **Each user** connects their own Google account via OAuth in their Settings page.
2. **Word/Excel files** can be opened in Google Docs/Sheets for editing, then saved back to the library.
3. **An MCP server** exposes Google Drive tools to the AI chat system — enabling file search, content reading, and document management via natural language.
4. **RAG integration** allows the AI to search and retrieve content from the user's Google Drive alongside the local library — without requiring manual file uploads.
5. **Federated search** unifies local library + Google Drive results in a single search experience.

### Key Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Token ownership | Per-user (not service account) | Users control their own data access; no shared service account risk |
| OAuth scope | `drive.readonly` + `documents.readonly` + `spreadsheets.readonly` + `drive.file` | Read for RAG, write only for app-created files |
| MCP transport | Streamable HTTP (server-side) | Integrates with existing MCP HTTP gateway at `/api/mcp/*` |
| Vector storage | Existing ChromaDB/pgvector pipeline | Reuse `libraryIndexJobs` + `libraryChunks` + `embeddingService` |
| File references | Virtual (no duplication) | Link to Drive via metadata; never copy full binary files |
| Content extraction | Google Docs/Sheets/Slides API (structured) | Preserves document structure for better RAG chunking |
| Indexing control | User-configurable (4 modes) | none / selected_folders / all_except / all |
| Credit billing | Operation-based, per-chunk pricing | 2 credits/chunk (~$0.002), pre-flight estimation, monthly budget cap |

---

## 2. Goals & Non-Goals

### Goals

- Users connect their Google account once and gain access to all Google Drive features
- Word/Excel editing via Google Docs/Sheets with seamless save-back flow
- AI chat can search/read Google Drive files via MCP tools
- RAG system indexes Google Drive content for semantic search
- Federated search combines local library + Google Drive in one query
- Works with existing permission model (each user sees only their own Drive)
- Incremental sync keeps the index fresh without re-processing everything

### Non-Goals

- Replacing the local Document Library (Google Drive is complementary, not a replacement)
- Real-time collaborative editing embedded in the app (users edit in Google's native UI)
- Google Workspace admin-level features (domain-wide delegation, admin SDK)
- Google Drive storage management (quotas, trash management within Drive itself)
- Indexing shared drives or team drives (user's "My Drive" only in v1)
- Google Calendar/Gmail integration (future consideration, not in this scope)

---

## 3. Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                    SmartSpecPro Platform                         │
│                                                                 │
│  ┌──────────────────┐   ┌─────────────────────────────────────┐ │
│  │  Settings UI      │   │  Document Management UI             │ │
│  │  "Connect Google" │   │  + Google Drive browser panel       │ │
│  │  OAuth flow       │   │  + "Edit in Google" buttons         │ │
│  └────────┬─────────┘   └─────────────┬───────────────────────┘ │
│           │                           │                         │
│  ┌────────▼───────────────────────────▼─────────────────────┐   │
│  │               tRPC Router Layer (Node.js)                 │   │
│  │  googleDrive.ts  |  library.ts (extended)  |  chat.ts     │   │
│  └────────┬─────────────────┬───────────────────┬───────────┘   │
│           │                 │                   │               │
│  ┌────────▼─────────┐  ┌───▼────────────┐  ┌───▼────────────┐  │
│  │ Google Drive      │  │ Library        │  │ MCP Gateway    │  │
│  │ Service (Node.js) │  │ Service        │  │ /api/mcp/*     │  │
│  │ - OAuth tokens    │  │ (extended)     │  │                │  │
│  │ - Drive API calls │  │               │  │                │  │
│  └────────┬─────────┘  └───┬────────────┘  └───┬────────────┘  │
│           │                │                    │               │
│           │    ┌───────────▼────────────────────▼────────┐      │
│           │    │   Google Drive MCP Server (Python)       │      │
│           │    │   Tools: search, read, list, sync        │      │
│           │    │   Resources: gdrive://files/{id}         │      │
│           │    └───────────┬─────────────────────────────┘      │
│           │                │                                    │
│  ┌────────▼────────────────▼──────────────────────────────┐     │
│  │           Google APIs (external)                        │     │
│  │  Drive API v3  |  Docs API  |  Sheets API  |  Slides   │     │
│  └────────────────────────────────────────────────────────┘     │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  RAG Pipeline (Python backend)                            │   │
│  │  ┌────────────┐  ┌────────────┐  ┌────────────────────┐  │   │
│  │  │ Content     │  │ Chunking   │  │ Embedding Service  │  │   │
│  │  │ Extractor   │──│ Service    │──│ (OpenAI/Cohere)    │  │   │
│  │  │ (Docs API)  │  │ (500 char) │  │                    │  │   │
│  │  └────────────┘  └────────────┘  └────────┬───────────┘  │   │
│  │                                            │              │   │
│  │  ┌─────────────────────────────────────────▼───────────┐  │   │
│  │  │  Vector Store (ChromaDB / pgvector)                  │  │   │
│  │  │  Collection: library_tenant_{tenantId}               │  │   │
│  │  │  + google_drive_tenant_{tenantId}_{userId}           │  │   │
│  │  └─────────────────────────────────────────────────────┘  │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  Federated Search                                         │   │
│  │  ┌──────────┐  ┌───────────────┐  ┌───────────────────┐  │   │
│  │  │ Local DB  │  │ Google Drive   │  │ Vector Store      │  │   │
│  │  │ (keyword) │  │ API (realtime) │  │ (semantic)        │  │   │
│  │  └─────┬────┘  └──────┬────────┘  └──────┬────────────┘  │   │
│  │        └──────────────┼───────────────────┘               │   │
│  │                       ▼                                   │   │
│  │              Merge + Rank + Deduplicate                    │   │
│  └──────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

---

## 4. Phase 1 — Per-User Google OAuth in Settings

### 4.1 Overview

Each user connects their Google account through the Settings page. This grants SmartSpecPro access to their Google Drive and Google Workspace apps. The user's tokens are stored encrypted in the database, per-user.

### 4.2 Existing Infrastructure (Reuse)

| Component | Status | Location |
|-----------|--------|----------|
| Google OAuth provider | Implemented | `python-backend/app/api/oauth.py` |
| OAuthConnection model | Implemented | `python-backend/app/models/oauth.py` |
| Token exchange flow | Implemented | `python-backend/app/services/oauth_service.py` |
| OAuth config from DB | Implemented | `python-backend/app/core/oauth_config.py` |
| Encryption (AES-256-GCM) | Implemented | `apps/web/server/services/crypto.ts` |
| Telegram linking UI pattern | Implemented | `apps/web/client/src/pages/Settings.tsx:1043-1152` |

### 4.3 What to Build

#### 4.3.1 Extend OAuth Scopes

Currently the Python backend requests: `openid email profile`

New scopes required:

```python
# python-backend/app/api/oauth.py
GOOGLE_DRIVE_SCOPES = [
    "openid",
    "email",
    "profile",
    "https://www.googleapis.com/auth/drive.readonly",       # Search/read all files
    "https://www.googleapis.com/auth/drive.file",           # Write only app-created files
    "https://www.googleapis.com/auth/documents.readonly",   # Read Google Docs structure
    "https://www.googleapis.com/auth/spreadsheets.readonly", # Read Google Sheets data
]
```

**Incremental consent:** When a user first logs in via Google (for authentication), request only `openid email profile`. When they click "Connect Google Drive" in Settings, request the additional Drive scopes using `include_granted_scopes=true`.

#### 4.3.2 Node.js tRPC Router (Proxy to Python)

Create `apps/web/server/routers/googleDrive.ts`:

```typescript
export const googleDriveRouter = router({
  // OAuth Management
  getConnectionStatus: protectedProcedure.query(...)    // Is Google connected?
  getAuthUrl: protectedProcedure.mutation(...)           // Get OAuth consent URL (with Drive scopes)
  completeOAuth: protectedProcedure.mutation(...)        // Exchange code for tokens
  disconnect: protectedProcedure.mutation(...)           // Revoke + delete tokens

  // Drive Operations (Phase 2+)
  listFiles: protectedProcedure.query(...)
  searchFiles: protectedProcedure.query(...)
  getFileContent: protectedProcedure.query(...)
  openForEditing: protectedProcedure.mutation(...)
  saveBack: protectedProcedure.mutation(...)

  // Sync Status (Phase 4+)
  getSyncStatus: protectedProcedure.query(...)
  triggerSync: protectedProcedure.mutation(...)
  getSyncHistory: protectedProcedure.query(...)
});
```

#### 4.3.3 Token Refresh Service

```python
# python-backend/app/services/google_token_service.py

class GoogleTokenService:
    async def get_valid_access_token(self, user_id: int) -> str:
        """Get a valid access token, refreshing if needed."""
        connection = await get_oauth_connection(user_id, "google")
        if not connection:
            raise GoogleNotConnectedError()

        if connection.token_expires_at > datetime.utcnow() + timedelta(minutes=5):
            return decrypt(connection.access_token)

        # Refresh
        new_tokens = await self._refresh_token(
            decrypt(connection.refresh_token)
        )
        await update_oauth_connection(user_id, "google", new_tokens)
        return new_tokens["access_token"]

    async def _refresh_token(self, refresh_token: str) -> dict:
        async with httpx.AsyncClient() as client:
            response = await client.post(
                "https://oauth2.googleapis.com/token",
                data={
                    "client_id": config.GOOGLE_CLIENT_ID,
                    "client_secret": config.GOOGLE_CLIENT_SECRET,
                    "refresh_token": refresh_token,
                    "grant_type": "refresh_token",
                }
            )
            response.raise_for_status()
            return response.json()
```

#### 4.3.4 Settings UI — "Connected Accounts" Section

Add a new **"Integrations"** tab to `Settings.tsx` (following the Telegram linking pattern):

```
┌─────────────────────────────────────────────────────┐
│  Settings                                            │
│  ┌────┬─────────┬──────────┬─────────┬──────────────┐│
│  │Prof│ Account │ Security │ Prefs   │ Integrations ││
│  └────┴─────────┴──────────┴─────────┴──────┬───────┘│
│                                              │       │
│  ┌───────────────────────────────────────────▼──────┐│
│  │  Connected Accounts                              ││
│  │                                                  ││
│  │  ┌─────────────────────────────────────────────┐ ││
│  │  │ 🔵 Google Drive & Workspace                 │ ││
│  │  │                                             │ ││
│  │  │ Status: ● Connected as user@gmail.com       │ ││
│  │  │ Scopes: Drive (read), Docs, Sheets          │ ││
│  │  │ Last synced: 2 hours ago                    │ ││
│  │  │ Indexed files: 142                          │ ││
│  │  │                                             │ ││
│  │  │ [Sync Now]  [Manage Folders]  [Disconnect]  │ ││
│  │  └─────────────────────────────────────────────┘ ││
│  │                                                  ││
│  │  ┌─────────────────────────────────────────────┐ ││
│  │  │ 🔷 Telegram                                 │ ││
│  │  │ Status: ● Connected as @username            │ ││
│  │  │ Notifications: High & Critical only         │ ││
│  │  │                                             │ ││
│  │  │ [Settings]  [Disconnect]                    │ ││
│  │  └─────────────────────────────────────────────┘ ││
│  │                                                  ││
│  │  ┌─────────────────────────────────────────────┐ ││
│  │  │ ⬛ GitHub                                    │ ││
│  │  │ Status: ○ Not connected                     │ ││
│  │  │                                             │ ││
│  │  │ [Connect GitHub]                            │ ││
│  │  └─────────────────────────────────────────────┘ ││
│  └──────────────────────────────────────────────────┘│
└──────────────────────────────────────────────────────┘
```

**OAuth Flow (user perspective):**

1. User clicks **"Connect Google"**
2. New popup/tab opens Google OAuth consent screen
3. User approves scopes (Drive, Docs, Sheets)
4. Redirected to `/auth/callback/google?code=...&state=...`
5. Backend exchanges code for tokens, stores encrypted
6. Popup closes, Settings page updates to "Connected"
7. Background: initial sync begins indexing Drive files

---

## 5. Phase 2 — Word/Excel Editing via Google Docs/Sheets

### 5.1 Editing Flow

```
User clicks "Edit in Google Docs"
    │
    ▼
[Server] Download file from S3/R2 (via source_url)
    │
    ▼
[Server] Upload to user's Google Drive (convert=true)
    │   POST https://www.googleapis.com/upload/drive/v3/files
    │   metadata: { mimeType: "application/vnd.google-apps.document" }
    │
    ▼
[Server] Return { driveFileId, editUrl (webViewLink) }
    │
    ▼
[Frontend] Open editUrl in new browser tab
    │
    ▼
[User] Edits document in Google Docs/Sheets native UI
    │
    ▼
[User] Returns to SmartSpecPro, clicks "Save back"
    │
    ▼
[Server] Export from Google Drive
    │   GET https://www.googleapis.com/drive/v3/files/{id}/export
    │   mimeType: "application/vnd.openxmlformats-officedocument..."
    │
    ▼
[Server] Upload exported file to S3/R2 (new key, keep old as version)
    │
    ▼
[Server] Update library_items.source_url
    │
    ▼
[Server] Create content version (reuse version system from Feature 009)
    │
    ▼
[Server] Delete temp file from Google Drive (cleanup)
    │
    ▼
[Server] Re-index content (enqueue libraryIndexJob)
```

### 5.2 Conversion Quality Reference

| Format | Google Convert Quality | Notes |
|--------|----------------------|-------|
| .docx → Google Docs | 90%+ | Tables, images, styles preserved |
| .doc (legacy) → Google Docs | ~70% | Old format, some formatting loss |
| .xlsx → Google Sheets | 95%+ | Formulas, charts, conditional formatting |
| .xls (legacy) → Google Sheets | ~80% | Some macros won't work |
| .pptx → Google Slides | ~85% | Animations may simplify |

### 5.3 Export Format Mapping

| Google Type | Export As | MIME Type |
|-------------|----------|-----------|
| Google Docs | .docx | `application/vnd.openxmlformats-officedocument.wordprocessingml.document` |
| Google Sheets | .xlsx | `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet` |
| Google Slides | .pptx | `application/vnd.openxmlformats-officedocument.presentationml.presentation` |

### 5.4 UI Changes

In `DocumentPreviewPanel.tsx`, add an "Edit in Google" button for Office/Excel preview types:

```tsx
{(previewType === "office" || previewType === "excel") && googleConnected && (
  <Button onClick={handleEditInGoogle} disabled={isOpeningInGoogle}>
    {isOpeningInGoogle ? <Loader2 className="animate-spin" /> : <GoogleIcon />}
    Edit in Google {previewType === "excel" ? "Sheets" : "Docs"}
  </Button>
)}
```

After editing, show a "Save back" status bar:

```
┌──────────────────────────────────────────────────────────────────┐
│  ⓘ This file was opened in Google Docs 5 minutes ago.           │
│     The Google Drive copy may have been edited.                  │
│                                                                  │
│  [Save back to Library]   [Discard Google copy]   [Open again]  │
└──────────────────────────────────────────────────────────────────┘
```

### 5.5 Data Model for Edit Sessions

```typescript
// In-memory or Redis tracking for active edit sessions
interface GoogleEditSession {
  libraryItemId: number;
  userId: number;
  driveFileId: string;           // Google Drive file ID
  originalSourceUrl: string;     // Pre-edit source URL in S3/R2
  originalStorageKey: string;    // For version tracking
  editUrl: string;               // Google Docs/Sheets URL
  createdAt: Date;
  status: "active" | "saved_back" | "discarded" | "expired";
}
```

---

## 6. Phase 3 — MCP Server for Google Drive & Apps

### 6.1 Purpose

Expose Google Drive operations as MCP tools that the AI chat system can invoke. This enables natural-language interactions like:

- "ค้นหาไฟล์รายงานยอดขายในไดรฟ์ของฉัน" → `search_drive_files`
- "อ่านเนื้อหาในไฟล์ proposal.docx" → `read_drive_file`
- "สรุปไฟล์งบประมาณ Q4 จาก Google Sheets" → `read_sheet_data`

### 6.2 MCP Server Design

Create `python-backend/app/mcp/google_drive_mcp.py`:

```python
from mcp.server.fastmcp import FastMCP

mcp = FastMCP("google-drive", version="1.0.0")

# ── Tools ──────────────────────────────────────────────────────

@mcp.tool()
async def search_drive_files(
    query: str,
    file_type: str | None = None,
    max_results: int = 20,
    user_id: int,           # Injected from auth context
) -> list[DriveFileResult]:
    """Search the user's Google Drive for files matching a query.
    Supports file name matching and full-text content search."""

@mcp.tool()
async def read_drive_file(
    file_id: str,
    user_id: int,
) -> DriveFileContent:
    """Read the text content of a Google Drive file.
    Supports Google Docs, Sheets, Slides, PDF, and plain text files."""

@mcp.tool()
async def read_sheet_data(
    file_id: str,
    sheet_name: str | None = None,
    cell_range: str | None = None,   # A1 notation, e.g. "A1:D50"
    user_id: int,
) -> SheetData:
    """Read structured data from a Google Sheets spreadsheet.
    Returns cell values, headers, and sheet metadata."""

@mcp.tool()
async def list_drive_folder(
    folder_id: str | None = None,   # None = root "My Drive"
    user_id: int,
) -> list[DriveFileResult]:
    """List files and folders in a Google Drive directory."""

@mcp.tool()
async def get_drive_file_info(
    file_id: str,
    user_id: int,
) -> DriveFileMetadata:
    """Get detailed metadata for a Google Drive file
    (size, owners, permissions, modification history)."""

# ── Resources ──────────────────────────────────────────────────

@mcp.resource("gdrive://files/{file_id}")
async def drive_file_resource(file_id: str, user_id: int) -> str:
    """Expose a Google Drive file as an MCP resource for AI context."""
    content = await extract_file_text(file_id, user_id)
    return content
```

### 6.3 Integration with Existing MCP Gateway

The existing MCP HTTP gateway at `/api/mcp/*` (`apps/web/server/_core/mcpRoutes.ts`) already supports tool listing and invocation. The Google Drive MCP tools will be registered there:

```typescript
// mcpRoutes.ts — extend tool registry
import { googleDriveMcpTools } from "../services/googleDriveMcpBridge";

const MCP_TOOLS = [
  ...existingTools,
  ...googleDriveMcpTools,  // search_drive_files, read_drive_file, etc.
];
```

### 6.4 Integration with Chat System

Extend the LLM chat context to include available MCP tools:

```typescript
// chatService.ts — buildChatContext()
async function buildChatContext(conversation, user) {
  const context = {
    messages: [...],
    systemPrompt: "...",
  };

  // Check if user has Google Drive connected
  const googleConnected = await isGoogleConnected(user.id);
  if (googleConnected) {
    context.tools = [
      {
        name: "search_drive_files",
        description: "Search the user's Google Drive for files",
        input_schema: { /* Zod schema */ },
      },
      {
        name: "read_drive_file",
        description: "Read content from a Google Drive file",
        input_schema: { /* Zod schema */ },
      },
      // ...
    ];
  }

  return context;
}
```

When the LLM responds with a `tool_use` block, the chat handler executes the MCP tool and returns results:

```typescript
// llmRoutesHandler.ts — handle tool_use response
if (response.stop_reason === "tool_use") {
  const toolCall = response.content.find(b => b.type === "tool_use");
  const result = await mcpGateway.callTool(
    toolCall.name,
    { ...toolCall.input, user_id: ctx.user.id }
  );
  // Append tool result to conversation and continue
}
```

---

## 7. Phase 4 — RAG Integration & Federated Search

### 7.1 Virtual Document References

Instead of downloading full files from Google Drive, create **virtual references** in the library system:

```typescript
// library_items record for a Google Drive file
{
  id: 1234,
  tenantId: "tenant-abc",
  ownerUserId: 42,
  itemType: "document",                     // or "spreadsheet", "presentation"
  source: "google_drive",                   // NEW source type
  title: "Q4 Budget Report",
  description: "Auto-synced from Google Drive",
  status: "ready",
  visibility: "private",
  sourceUrl: null,                           // No local file — virtual reference
  metadata: {
    driveFileId: "1abc...xyz",
    driveMimeType: "application/vnd.google-apps.spreadsheet",
    driveModifiedTime: "2026-02-10T14:30:00Z",
    driveWebViewLink: "https://docs.google.com/spreadsheets/d/1abc...xyz/edit",
    driveOwners: ["user@gmail.com"],
    contentHash: "sha256:abcdef...",         // For change detection
    syncStatus: "synced",
    lastSyncedAt: "2026-02-14T10:00:00Z",
    fileSizeBytes: 24560,
  },
}
```

**Benefits:**
- No storage duplication (files stay in Google Drive)
- Clicking the file opens Google's native editor
- Permissions are controlled by the user's Google OAuth token
- Content is indexed for RAG without storing the full file

### 7.2 Content Extraction Pipeline

For RAG indexing, we need to extract text from Google Drive files. Different file types use different APIs:

```python
# python-backend/app/services/google_content_extractor.py

class GoogleContentExtractor:
    async def extract(self, file_id: str, mime_type: str, access_token: str) -> str:
        if mime_type == "application/vnd.google-apps.document":
            return await self._extract_google_doc(file_id, access_token)
        elif mime_type == "application/vnd.google-apps.spreadsheet":
            return await self._extract_google_sheet(file_id, access_token)
        elif mime_type == "application/vnd.google-apps.presentation":
            return await self._extract_google_slides(file_id, access_token)
        elif mime_type == "application/pdf":
            return await self._extract_via_export(file_id, "text/plain", access_token)
        elif mime_type.startswith("text/"):
            return await self._download_text(file_id, access_token)
        else:
            # For binary formats (.docx, .xlsx), export as text
            return await self._extract_via_export(file_id, "text/plain", access_token)

    async def _extract_google_doc(self, file_id, token) -> str:
        """Use Docs API for structured extraction (preserves headings, lists)."""
        # GET https://docs.googleapis.com/v1/documents/{file_id}
        # Parse body.content → extract paragraphs, tables, lists
        # Return structured text with markdown-like formatting

    async def _extract_google_sheet(self, file_id, token) -> str:
        """Use Sheets API for structured extraction."""
        # GET https://sheets.googleapis.com/v4/spreadsheets/{file_id}
        # Extract all sheets, headers, data rows
        # Return as markdown tables or CSV-like text

    async def _extract_google_slides(self, file_id, token) -> str:
        """Use Slides API for text extraction."""
        # GET https://slides.googleapis.com/v1/presentations/{file_id}
        # Extract text from all slides, speaker notes
```

### 7.3 Indexing Flow

Extend the existing `libraryIndexJobs` system with a new job type:

```python
# New job type: "google_drive_sync"
async def process_google_drive_index_job(job):
    """Index a Google Drive file into the RAG pipeline."""

    # 1. Get user's valid access token
    token = await google_token_service.get_valid_access_token(job.user_id)

    # 2. Fetch file metadata from Drive API
    file_meta = await drive_api.get_file(job.drive_file_id, token)

    # 3. Check content hash — skip if unchanged
    if file_meta.md5Checksum == job.existing_content_hash:
        return  # No changes, skip re-indexing

    # 4. Extract text content
    text = await content_extractor.extract(
        job.drive_file_id, file_meta.mimeType, token
    )

    # 5. Chunk text (reuse existing chunking pipeline)
    chunks = chunk_text_content(text, max_chunk_size=500, overlap=80)

    # 6. Generate embeddings (reuse existing embedding service)
    embeddings = await embedding_service.embed_batch([c.content for c in chunks])

    # 7. Upsert to vector store
    vector_ids = await vector_store.upsert(
        collection=f"library_tenant_{job.tenant_id}",
        ids=[f"gdrive:{job.tenant_id}:{job.drive_file_id}:{i}" for i in range(len(chunks))],
        embeddings=embeddings,
        metadatas=[{
            "source": "google_drive",
            "drive_file_id": job.drive_file_id,
            "chunk_index": i,
            "tenant_id": job.tenant_id,
            "user_id": job.user_id,
        } for i in range(len(chunks))],
        documents=[c.content for c in chunks],
    )

    # 8. Update library_chunks in PostgreSQL
    await upsert_library_chunks(job.library_item_id, chunks, vector_ids)

    # 9. Update library_items metadata
    await update_library_item(job.library_item_id, {
        "status": "ready",
        "metadata.contentHash": file_meta.md5Checksum,
        "metadata.lastSyncedAt": datetime.utcnow().isoformat(),
        "metadata.syncStatus": "synced",
    })
```

### 7.4 Federated Search

When a user searches, query both local library and Google Drive in parallel:

```typescript
// apps/web/server/services/federatedSearch.ts

export async function federatedSearch(
  query: string,
  actor: LibraryActor,
  options: { includeGoogleDrive?: boolean; limit?: number }
): Promise<FederatedSearchResult[]> {
  const tasks: Promise<SearchResult[]>[] = [];

  // 1. Local library search (always)
  tasks.push(searchLibraryItems({ query, limit: options.limit }, actor));

  // 2. Vector semantic search (always)
  tasks.push(vectorSearch(query, actor.tenantId, options.limit));

  // 3. Google Drive real-time search (if connected)
  if (options.includeGoogleDrive) {
    const token = await getGoogleToken(actor.userId);
    if (token) {
      tasks.push(searchGoogleDriveApi(query, token, options.limit));
    }
  }

  const [localResults, vectorResults, driveResults] = await Promise.allSettled(tasks);

  // Merge, deduplicate (by driveFileId / libraryItemId), and rank
  return mergeAndRank({
    local: localResults.status === "fulfilled" ? localResults.value : [],
    vector: vectorResults.status === "fulfilled" ? vectorResults.value : [],
    drive: driveResults?.status === "fulfilled" ? driveResults.value : [],
  });
}
```

**Deduplication logic:**
- If a file exists in both local library (virtual reference) and Drive API results, merge them
- Use `driveFileId` as the dedup key
- Prefer the local library entry for metadata (has embedding scores)
- Prefer Drive API result for freshness metadata (latest modifiedTime)

### 7.5 Search UI Integration

In `DocumentManagement.tsx`, extend the search to show Drive results:

```
┌──────────────────────────────────────────────────────────────────┐
│  Search: [quarterly report________] [🔍]  ☑ Include Google Drive │
│                                                                   │
│  Results (12 found)                                               │
│                                                                   │
│  📄 Q4 Quarterly Report.docx          [Library] ⭐ 0.92         │
│     Updated 2 days ago • 24 KB                                    │
│                                                                   │
│  📊 Sales Dashboard Q4.xlsx           [Google Drive] ⭐ 0.87     │
│     Modified Jan 30 • Google Sheets • [Open in Google]            │
│                                                                   │
│  📝 Meeting Notes - Q4 Review.md      [Library] ⭐ 0.81         │
│     Updated 1 week ago • 8 KB                                     │
│                                                                   │
│  📄 Budget Forecast 2026.xlsx         [Google Drive] ⭐ 0.75     │
│     Modified Feb 1 • Google Sheets • [Import to Library]          │
│                                                                   │
└──────────────────────────────────────────────────────────────────┘
```

---

## 8. Phase 5 — Incremental Sync & Webhooks

### 8.1 Sync Strategy

Use Google Drive Changes API with webhooks for near-real-time sync:

```
[Initial Sync]
  User connects Google → Full scan of Drive
  → Create virtual references for supported file types
  → Index content for RAG

[Incremental Sync]
  Google Drive webhook → POST /api/webhooks/gdrive
  → Identify changed files
  → Update/create virtual references
  → Re-index only changed content (hash comparison)
```

### 8.2 Webhook Handler

```typescript
// apps/web/server/routes/webhooks.ts

router.post("/api/webhooks/gdrive", async (req, res) => {
  // Validate notification headers
  const channelId = req.headers["x-goog-channel-id"];
  const resourceState = req.headers["x-goog-resource-state"];
  const channelToken = req.headers["x-goog-channel-token"];

  // Verify channel token
  if (!verifyWebhookToken(channelToken)) {
    return res.status(403).send("Invalid token");
  }

  // For "sync" notifications, just acknowledge
  if (resourceState === "sync") {
    return res.status(200).send("OK");
  }

  // For "change" notifications, fetch changes
  const syncState = await getSyncState(channelId);
  const changes = await fetchDriveChanges(syncState.userId, syncState.pageToken);

  for (const change of changes) {
    if (change.removed) {
      await markVirtualReferenceDeleted(change.fileId);
    } else {
      await enqueueGoogleDriveIndexJob(syncState.userId, change.fileId);
    }
  }

  // Update page token for next poll
  await updateSyncPageToken(channelId, changes.newStartPageToken);

  res.status(200).send("OK");
});
```

### 8.3 Channel Management

Google Drive webhook channels expire (max 7 days). Implement auto-renewal:

```python
# Celery periodic task: renew channels every 6 days
@celery.task(name="renew_drive_watch_channels")
async def renew_drive_watch_channels():
    """Renew Google Drive webhook channels before they expire."""
    expiring = await get_channels_expiring_within(hours=24)
    for channel in expiring:
        try:
            # Stop old channel
            await drive_api.channels_stop(channel.channel_id, channel.resource_id)
            # Create new channel
            new_channel = await drive_api.changes_watch(
                channel.user_id, channel.page_token
            )
            await update_channel_record(channel.id, new_channel)
        except Exception as e:
            logger.error(f"Failed to renew channel {channel.id}: {e}")
```

### 8.4 Folder Permission & Indexing Configuration

Users have full control over **what** gets indexed and **how**. Four indexing modes are supported:

#### 8.4.1 Indexing Modes

| Mode | Behavior | Best For |
|------|----------|----------|
| `none` | No pre-indexing. Files accessible only via real-time Drive API search and on-demand MCP reads. | Users who want zero credit cost; rely on Google's native search + AI reads on demand |
| `selected_folders` | Only files inside user-selected folders are indexed. | Users who know which folders contain relevant work files |
| `all_except` | All files indexed EXCEPT those in excluded folders. | Users with large Drives who want most files indexed but have personal/irrelevant folders |
| `all` | Every supported file in My Drive is indexed. | Small-to-medium Drives where full semantic search coverage is desired |

#### 8.4.2 Settings Data Structure

```typescript
interface GoogleDriveSyncSettings {
  // Core indexing mode
  indexingMode: "none" | "selected_folders" | "all_except" | "all";

  // Folder selection (mode-dependent)
  selectedFolderIds: string[];     // Used when mode = "selected_folders"
  excludedFolderIds: string[];     // Used when mode = "all_except"

  // File type filter (applied in all modes except "none")
  fileTypeFilter: string[];
  // Options: "document", "spreadsheet", "presentation", "pdf", "text", "image"
  // Default: ["document", "spreadsheet", "presentation", "pdf", "text"]

  // Size guard
  maxFileSizeBytes: number;        // Default: 10MB — files larger than this are skipped
  maxFilesPerSync: number;         // Default: 500 — safety cap per sync operation

  // Auto-sync toggle
  autoSyncEnabled: boolean;        // true = use webhook auto-sync; false = manual only

  // Credit budget protection (see Section 8.5)
  creditBudget: {
    monthlyLimitCredits: number | null;  // null = no limit
    alertThresholdPercent: number;        // Notify when usage reaches this % (default: 80)
  };
}
```

#### 8.4.3 Folder Picker UI

```
┌──────────────────────────────────────────────────────────────┐
│  Google Drive Indexing Settings                               │
│                                                                │
│  Indexing Mode:                                                │
│  ○ None (search via Google only, no credits used)             │
│  ● Selected folders only                                       │
│  ○ All files except excluded folders                           │
│  ○ All files in My Drive                                       │
│                                                                │
│  ────────────────────────────────────────────────             │
│                                                                │
│  Selected Folders:                                             │
│                                                                │
│  📁 My Drive                                                  │
│    ☑ 📁 Work/                                                 │
│      ☑ 📁 Projects/                                           │
│      ☑ 📁 Reports/                                            │
│      ☐ 📁 Personal/                                           │
│    ☑ 📁 Clients/                                              │
│    ☐ 📁 Archived/                                             │
│    ☐ 📁 Photos/                                               │
│                                                                │
│  File types to index:                                          │
│  ☑ Documents (doc, docx, gdoc, pdf, txt, md)                 │
│  ☑ Spreadsheets (xls, xlsx, gsheet, csv)                     │
│  ☑ Presentations (ppt, pptx, gslides)                        │
│  ☐ Images (jpg, png — text extraction via OCR)               │
│                                                                │
│  Max file size: [10 MB ▾]                                     │
│  Auto-sync: [✓ Enabled] (webhook-based, near real-time)      │
│                                                                │
│  ────────────────────────────────────────────────             │
│                                                                │
│  Monthly credit budget: [5,000 credits ▾] ($5.00)             │
│  Alert at: [80% ▾]                                             │
│                                                                │
│  [Save Settings]  [Estimate Cost]  [Sync Now]                  │
└──────────────────────────────────────────────────────────────┘
```

#### 8.4.4 Folder Inclusion/Exclusion Logic

```python
# Determine if a file should be indexed
def should_index_file(file: DriveFile, settings: SyncSettings) -> bool:
    # Mode check
    if settings.indexing_mode == "none":
        return False

    # File type check
    if not matches_file_type_filter(file.mime_type, settings.file_type_filter):
        return False

    # Size check
    if file.size_bytes > settings.max_file_size_bytes:
        return False

    # Folder check (mode-dependent)
    if settings.indexing_mode == "selected_folders":
        return any(is_in_folder(file, fid) for fid in settings.selected_folder_ids)
    elif settings.indexing_mode == "all_except":
        return not any(is_in_folder(file, fid) for fid in settings.excluded_folder_ids)
    elif settings.indexing_mode == "all":
        return True

    return False

def is_in_folder(file: DriveFile, folder_id: str) -> bool:
    """Check if file is inside folder (recursively checks parents)."""
    # Uses Drive API parents field + cached folder hierarchy
    ...
```

---

### 8.5 Unified Credit Billing Model

> **ขอบเขต:** Section นี้ครอบคลุม **ทุก operation ที่ใช้ทรัพยากร** ทั้ง Document Management, RAG, Google Drive, AI Chat, Media — เพื่อให้ตารางราคาสมบูรณ์ ไม่ตกหล่น และรายได้ไม่รั่วไหล

#### 8.5.1 Design Principles

1. **โปร่งใส (Transparent):** ทุก operation แสดงราคาชัดเจน ผู้ใช้ดูประวัติได้ทุกรายการ
2. **ยืดหยุ่น (Flexible):** ตั้ง budget cap, เลือก indexing mode, ปรับได้ทุกเมื่อ
3. **ยุติธรรม (Fair):** จ่ายตามที่ใช้จริง ไฟล์ไม่เปลี่ยนไม่คิดเงิน refund เมื่อ fail
4. **ป้องกันได้ (Controllable):** ตั้งงบรายเดือน แจ้งเตือนก่อนถึงขีดจำกัด
5. **ไม่ขาดรายได้ (Revenue-safe):** ทุก operation ที่ใช้ API/compute ภายนอกต้องคิดเครดิต

#### 8.5.2 Current Billing Gap Analysis

จากการวิเคราะห์ระบบปัจจุบัน พบว่า **embedding generation, file upload indexing, และ RAG queries ไม่ถูกคิดเครดิต** แม้จะใช้ OpenAI API จริง:

| Component | Current Status | Actual Cost (OpenAI) | Revenue Impact |
|-----------|---------------|---------------------|----------------|
| LLM Chat (GPT-4o, Claude, etc.) | ✅ Charged | $2.50-75/1M tokens | Covered |
| Media Generation (image/video/audio) | ✅ Charged | Per-model pricing | Covered |
| **File Upload → Indexing** | ❌ FREE | ~$0.00003/chunk (embedding) | **Revenue leak** |
| **Markdown Save → Re-indexing** | ❌ FREE | Same as above | **Revenue leak** |
| **RAG Semantic Search** | ❌ FREE | ~$0.000003/query (query embedding) | **Revenue leak** |
| **Embedding Generation (bulk)** | ❌ FREE | $0.02-0.13/1M tokens | **Revenue leak** |
| Library keyword search | ✅ Free (correct) | $0 (database only) | N/A |
| File download/preview | ✅ Free (correct) | $0 (S3 GET) | N/A |

**สรุป:** ระบบสูญเสียรายได้จาก embedding costs ประมาณ **$0.05-2.00/user/เดือน** ขึ้นอยู่กับปริมาณ file + search

---

#### 8.5.3 Unified Operation Pricing Table (ครบทุก Operation)

> **1 credit = $0.001 USD** (ยังคงเดิม, 1,000 credits = $1)

##### Category A: Document Management — Upload & Indexing

| # | Operation | Credits | Formula | Service Tag | Rationale |
|---|-----------|---------|---------|-------------|-----------|
| A1 | **Upload file + indexing** | 2–200 | `ceil(chunk_count) × 2` | `library.upload_index` | Embedding API cost + storage compute |
| A2 | **Save markdown + re-index** | 2–200 | `ceil(chunk_count) × 2` | `library.save_reindex` | Same pipeline as upload indexing |
| A3 | **Re-index (content unchanged)** | **0** | Hash check → skip | — | ไม่เรียก API = ไม่คิดเงิน |
| A4 | Upload file (no index — metadata only) | **0** | — | — | ไม่ได้สร้าง embedding |
| A5 | Download / preview file | **0** | — | — | S3 GET ราคาเล็กน้อย absorb ได้ |
| A6 | Delete / restore / version history | **0** | — | — | Database operations only |
| A7 | Share / permission changes | **0** | — | — | Database operations only |
| A8 | Keyword search (list/filter) | **0** | — | — | PostgreSQL query, ไม่ใช้ AI |
| A9 | Create content version snapshot | **0** | — | — | Text copy only, no API |

##### Category B: RAG & Semantic Search

| # | Operation | Credits | Formula | Service Tag | Rationale |
|---|-----------|---------|---------|-------------|-----------|
| B1 | **RAG semantic search** | **1** | Flat per query | `rag.semantic_search` | Query embedding via OpenAI (~125 tokens) |
| B2 | **RAG context retrieval in chat** | **1** | Flat per retrieval | `rag.chat_context` | Included in chat — query embedding cost |
| B3 | RAG keyword/BM25 search only | **0** | — | — | No API call, database only |
| B4 | RAG result display (no embedding) | **0** | — | — | Already-indexed data retrieval |

> **Note B2:** RAG context ที่ AI ดึงมาใช้ใน chat จะคิด 1 credit สำหรับ query embedding **แยกจาก** LLM token cost ของ chat response ที่คิดอยู่แล้ว (เพราะเป็น API call คนละตัว)

##### Category C: Google Drive — Indexing & Sync

| # | Operation | Credits | Formula | Service Tag | Rationale |
|---|-----------|---------|---------|-------------|-----------|
| C1 | **Initial index (Drive file)** | 2–200 | `ceil(chunk_count) × 2` | `gdrive.index` | Same embedding pipeline as A1 |
| C2 | **Re-index (content changed)** | 2–200 | Same formula | `gdrive.reindex` | Only changed files |
| C3 | Re-index (unchanged) | **0** | Hash check → skip | — | ไม่เรียก API |
| C4 | **MCP: read_drive_file** (AI reads) | 1–5 | `ceil(text_length / 2000)` | `gdrive.mcp_read` | Content extraction + tokenization |
| C5 | **MCP: read_sheet_data** | 1–3 | `ceil(cells / 500)` | `gdrive.mcp_sheet` | Structured data extraction |
| C6 | MCP: search_drive_files | **0** | — | — | Google API only, no AI cost |
| C7 | MCP: list_drive_folder | **0** | — | — | Google API only |
| C8 | Real-time Drive search | **0** | — | — | Google Search API |
| C9 | Browse/list folders | **0** | — | — | Metadata only |
| C10 | Edit in Google Docs/Sheets | **0** | — | — | Google's native editor |
| C11 | Save-back from Google | **0** | — | — | Export + S3 upload only |
| C12 | Disconnect Google | **0** | — | — | Cleanup operation |

##### Category D: AI Chat & LLM (existing — ไม่เปลี่ยน)

| # | Operation | Credits | Formula | Service Tag | Status |
|---|-----------|---------|---------|-------------|--------|
| D1 | Chat response (LLM) | Variable | Token-based pricing per model | `chat.llm` | ✅ Already charged |
| D2 | Translation | Variable | Token-based | `translation.llm` | ✅ Already charged |
| D3 | Skill execution (LLM) | Variable | Token-based | `skill.llm` | ✅ Already charged |
| D4 | Free model usage | **0** | `isFree = true` in model map | — | ✅ Logged but free |

##### Category E: Media Generation (existing — ไม่เปลี่ยน)

| # | Operation | Credits | Formula | Service Tag | Status |
|---|-----------|---------|---------|-------------|--------|
| E1 | Image generation | Variable | Model × resolution × count | `media.image` | ✅ Already charged |
| E2 | Video generation | Variable | Model × duration × resolution | `media.video` | ✅ Already charged |
| E3 | Audio/TTS generation | Variable | Model × duration | `media.audio` | ✅ Already charged |

##### Category F: Platform Operations (always free)

| # | Operation | Credits | Rationale |
|---|-----------|---------|-----------|
| F1 | Login / logout / session | **0** | Core platform access |
| F2 | Settings / profile updates | **0** | User management |
| F3 | View dashboard / analytics | **0** | Read-only views |
| F4 | Notification / alerts | **0** | System communication |
| F5 | Admin operations (users, roles) | **0** | Management overhead |
| F6 | View pricing / usage history | **0** | Transparency requires free access |

---

#### 8.5.4 Credit Calculation Formulas

##### Formula 1: Indexing (A1, A2, C1, C2)

```
indexing_credits = ceil(chunk_count × COST_PER_CHUNK)

where:
  COST_PER_CHUNK = 2 credits
  chunk_count    = ceil(text_length / 500)   (500 chars/chunk, 80 overlap)

  Actual API cost per chunk:
    text-embedding-3-small: ~125 tokens × $0.02/1M = $0.0000025
    markup to 2 credits ($0.002) = 800× margin (pgvector), 16× margin (Cloudflare)
    covers: embedding API + vector storage + infra + profit (see §8.5.12)

Examples:
  Small doc (2,000 chars)     → 4 chunks  × 2 =     8 credits ($0.008)
  Medium doc (10,000 chars)   → 20 chunks × 2 =    40 credits ($0.040)
  Large doc (50,000 chars)    → 100 chunks × 2 =  200 credits ($0.200)
  Spreadsheet (30 rows)       → ~6 chunks  × 2 =   12 credits ($0.012)
  PDF report (200 pages)      → ~800 chunks × 2 = 1,600 credits ($1.600)
```

##### Formula 2: MCP Read (C4)

```
mcp_read_credits = max(1, ceil(text_length / 2000))

Examples:
  Short document (1,500 chars) → 1 credit
  Medium document (8,000 chars) → 4 credits
  Long document (10,000 chars) → 5 credits
  Maximum per read = 5 credits (cap)
```

##### Formula 3: RAG Query (B1, B2)

```
rag_query_credits = 1   (flat rate)

Rationale:
  Query text → embedding API: ~50-200 tokens × $0.02/1M = $0.000001-0.000004
  Markup to 1 credit ($0.001) = 333× margin (pgvector), 77× margin (Cloudflare)
  Includes: embedding API + vector DB query + compute + retrieval overhead (see §8.5.12.4)
```

##### Formula 4: Existing LLM (D1-D3, unchanged)

```
llm_credits = ceil(
  (input_tokens / 1,000,000 × model_input_price +
   output_tokens / 1,000,000 × model_output_price) × 1000
)

(Converted from USD to credits, already implemented in creditService.ts)
```

---

#### 8.5.5 Implementation: Charging for Library Upload & Save

**Currently missing** — needs to be added to these functions:

```typescript
// libraryService.ts — uploadLibraryFile()
// AFTER successful indexing job completion (not before, to avoid charging for failed uploads)

// Option: Post-facto charging (recommended)
// When library_index_job completes successfully:
async function onIndexJobComplete(job: LibraryIndexJob) {
  const chunkCount = await getChunkCountForItem(job.libraryItemId);
  const credits = Math.ceil(chunkCount * COST_PER_CHUNK);

  if (credits > 0) {
    await deductCredits({
      userId: job.userId,
      amount: credits,
      type: "usage",
      description: `Library index: ${job.itemTitle} (${chunkCount} chunks)`,
      metadata: {
        service: "library.upload_index",
        libraryItemId: job.libraryItemId,
        chunkCount,
        costPerChunk: COST_PER_CHUNK,
        embeddingModel: currentEmbeddingModel,
      }
    });
  }
}
```

**Pre-flight estimation for large uploads:**

```
┌──────────────────────────────────────────────────────────────┐
│  Upload: Annual_Report_2025.pdf (4.2 MB)                      │
│                                                                │
│  Estimated indexing cost: ~320 credits ($0.32)                 │
│  (Approximately 160 text chunks)                               │
│                                                                │
│  Your balance: 5,000 credits                                   │
│                                                                │
│  ☑ Index file for AI search (recommended)                     │
│  ☐ Upload without indexing (metadata only, free)              │
│                                                                │
│  [Upload]   [Cancel]                                           │
└──────────────────────────────────────────────────────────────┘
```

> **UX Note:** ไฟล์ขนาดเล็ก (<100KB) ไม่แสดง estimation dialog — คิดเครดิตอัตโนมัติ (ต้นทุนต่ำมาก)
> ไฟล์ขนาดใหญ่ (>1MB) แสดง dialog เสมอ เพื่อความโปร่งใส

---

#### 8.5.6 Implementation: Charging for RAG Queries

```typescript
// In RAG query pipeline (hybrid_rag.py or chat context builder):

async function chargeForRagQuery(userId: number, queryText: string) {
  // Only charge if query actually generates embedding (semantic search)
  // BM25-only (keyword) queries remain free
  if (searchMode === "semantic" || searchMode === "hybrid") {
    await deductCredits({
      userId,
      amount: 1,    // Flat 1 credit
      type: "usage",
      description: "RAG semantic search",
      metadata: {
        service: "rag.semantic_search",
        queryLength: queryText.length,
        embeddingModel: currentModel,
        searchMode,
      }
    });
  }
}
```

**Important:** เมื่อ AI chat ดึง RAG context อัตโนมัติ จะคิด:
- **1 credit** สำหรับ RAG query embedding (B2)
- **+ LLM token credits** สำหรับ chat response (D1)
- ทั้งสองรายการแสดงแยกใน transaction history เพื่อความโปร่งใส

---

#### 8.5.7 Google Drive Pre-flight Cost Estimation

Before every sync operation, the system shows estimated cost and requires user confirmation:

```
┌──────────────────────────────────────────────────────────────┐
│  Google Drive Sync — Cost Estimation                          │
│                                                                │
│  Folders: Work/Projects, Work/Reports                          │
│  Files to index: 47 files (234 MB total text content)          │
│                                                                │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  Estimated cost: ~940 credits ($0.94)                    │  │
│  │                                                          │  │
│  │  Breakdown:                                              │  │
│  │  • 32 documents      → ~640 credits                     │  │
│  │  • 10 spreadsheets   → ~200 credits                     │  │
│  │  • 5 presentations   → ~100 credits                     │  │
│  │  • 3 files skipped   (exceed 10MB size limit)           │  │
│  │                                                          │  │
│  │  Your balance: 5,000 credits                            │  │
│  │  After sync:   ~4,060 credits remaining                 │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                │
│  [Start Sync]   [Cancel]   [Adjust Settings]                   │
└──────────────────────────────────────────────────────────────┘
```

**Estimation process:**
1. List files matching sync settings (Drive API metadata — free)
2. Estimate chunk count from `file.size` and `mimeType`
3. Calculate: `estimated_credits = sum(ceil(estimated_text_length / 500) × 2)`
4. Show breakdown by file type
5. Require user click "Start Sync" to proceed

For **incremental sync** (webhook-triggered):
- If `creditBudget.monthlyLimitCredits` allows → auto-index silently
- If would exceed budget → queue as "pending approval" and notify user

---

#### 8.5.8 Monthly Budget Protection

```typescript
interface MonthlyBudgetState {
  userId: number;
  monthKey: string;              // "2026-02"
  totalUsed: number;             // All indexing + RAG credits this month
  monthlyLimit: number | null;   // User-configured limit (null = unlimited)
  alertSent: boolean;
  budgetExhausted: boolean;
}
```

| Event | Action |
|-------|--------|
| Usage reaches `alertThresholdPercent` (default 80%) | In-app notification + Telegram (if connected) |
| Usage reaches 100% of `monthlyLimitCredits` | Stop auto-sync. Banner: "Monthly budget reached. [Increase] [Manual Sync]" |
| New month starts (1st, 00:00 UTC) | Reset `totalUsed`, clear alerts |
| User changes budget mid-month | Apply immediately, recalculate alerts |

> **Scope:** Budget protection ครอบคลุมเครดิตจาก Category A + B + C เท่านั้น (indexing + RAG + Drive)
> Category D (LLM Chat) และ E (Media) คิดแยก ไม่นับรวมใน budget นี้

---

#### 8.5.9 Transaction Logging (Audit Trail)

Every credit operation creates a `creditTransaction` with structured `metadata.service` tag:

```typescript
// Upload + indexing
{
  type: "usage", amount: -40,
  description: "Library index: Q4_Report.docx (20 chunks)",
  metadata: {
    service: "library.upload_index",      // ← SERVICE TAG
    libraryItemId: 456,
    fileName: "Q4_Report.docx",
    chunkCount: 20, costPerChunk: 2,
    embeddingModel: "text-embedding-3-small",
    contentHash: "sha256:abcdef...",
  }
}

// RAG query
{
  type: "usage", amount: -1,
  description: "RAG semantic search",
  metadata: {
    service: "rag.semantic_search",       // ← SERVICE TAG
    queryLength: 84,
    searchMode: "hybrid",
    resultsReturned: 5,
  }
}

// Google Drive index
{
  type: "usage", amount: -40,
  description: "Drive index: Budget_2026.xlsx (20 chunks)",
  metadata: {
    service: "gdrive.index",              // ← SERVICE TAG
    driveFileId: "1abc...xyz",
    fileName: "Budget_2026.xlsx",
    chunkCount: 20, costPerChunk: 2,
    syncJobId: "job-123",
  }
}

// MCP read
{
  type: "usage", amount: -3,
  description: "AI read: Meeting_Notes.gdoc via MCP",
  metadata: {
    service: "gdrive.mcp_read",           // ← SERVICE TAG
    driveFileId: "2def...abc",
    textLength: 5200,
    chatTraceId: "trace-789",
  }
}

// Refund on failure
{
  type: "refund", amount: 40,
  description: "Refund: Drive index failed — Q4_Report.docx",
  metadata: {
    service: "gdrive.index",
    operationType: "index_failed_refund",
    originalTransactionId: 12345,
    errorMessage: "Token expired during indexing",
  }
}
```

**Service Tags สำหรับ filter ใน Dashboard:**

| Tag | Category | Description |
|-----|----------|-------------|
| `library.upload_index` | A | File upload + indexing |
| `library.save_reindex` | A | Markdown save + re-index |
| `rag.semantic_search` | B | RAG query embedding |
| `rag.chat_context` | B | RAG retrieval in chat |
| `gdrive.index` | C | Google Drive file indexing |
| `gdrive.reindex` | C | Google Drive re-indexing |
| `gdrive.mcp_read` | C | MCP read_drive_file |
| `gdrive.mcp_sheet` | C | MCP read_sheet_data |
| `chat.llm` | D | Chat LLM response |
| `translation.llm` | D | Translation LLM |
| `skill.llm` | D | Skill execution LLM |
| `media.image` | E | Image generation |
| `media.video` | E | Video generation |
| `media.audio` | E | Audio generation |

---

#### 8.5.10 Admin-Level Configuration

Tenant admins can set pricing overrides and budget defaults:

```typescript
// system_settings table
{
  category: "credit_pricing",
  key: "indexing_config",
  value: {
    // Indexing pricing
    costPerChunk: 2,               // Default: 2 credits/chunk
    ragQueryCost: 1,               // Default: 1 credit/query
    mcpReadMaxCost: 5,             // Maximum per MCP read

    // Budget defaults for new users
    defaultMonthlyLimit: 10000,
    maxMonthlyLimit: 50000,
    alertThresholdPercent: 80,

    // Upload controls
    showEstimationDialogAboveBytes: 1048576,  // 1MB
    maxFileSizeBytes: 10485760,               // 10MB
    maxChunksPerFile: 1000,                   // Safety cap

    // Enterprise discount (optional)
    discountPercent: 0,            // e.g., 20 for enterprise plans
  }
}
```

---

#### 8.5.11 Revenue Model Summary

| Revenue Stream | Monthly Revenue per Active User (est.) | Volume |
|----------------|---------------------------------------|--------|
| **LLM Chat** (D1-D3) | $1.00–$15.00 | High — primary revenue |
| **Media Gen** (E1-E3) | $0.50–$5.00 | Medium |
| **Library Indexing** (A1-A2) — **NEW** | $0.05–$0.50 | Medium — fills billing gap |
| **RAG Queries** (B1-B2) — **NEW** | $0.01–$0.10 | High volume, low per-unit |
| **Drive Indexing** (C1-C2) — **NEW** | $0.10–$2.00 | Depends on Drive size |
| **MCP Reads** (C4-C5) — **NEW** | $0.01–$0.05 | Low volume |

**ผลกระทบต่อ user:**
- User ที่ upload ไฟล์ 10 ไฟล์/เดือน → เพิ่มค่าใช้จ่าย ~$0.10 (100 credits)
- User ที่ search 50 ครั้ง/เดือน → เพิ่มค่าใช้จ่าย ~$0.05 (50 credits)
- User ที่ sync Google Drive 100 ไฟล์ → เพิ่มค่าใช้จ่าย ~$2.00 (2,000 credits)
- **รวม: เพิ่ม ~$0.15–$2.15/user/เดือน** (ต่ำมากเมื่อเทียบกับ LLM + Media)

---

#### 8.5.12 Vector Database Cost Analysis

> **เป้าหมาย:** พิสูจน์ว่าโมเดลราคา (2 credits/chunk indexing, 1 credit/RAG query) ครอบคลุมต้นทุน vector database **ทุก backend** — ทั้ง pgvector, ChromaDB, และ Cloudflare Vectorize — โดยระบบไม่ขาดทุนในทุกกรณี

##### 8.5.12.1 Vector Database Infrastructure Overview

| Component | Current (Production) | Legacy | Cloud Option |
|-----------|---------------------|--------|--------------|
| **Vector Store** | pgvector (PostgreSQL extension) | ChromaDB (in-memory/persistent) | Cloudflare Vectorize |
| **Embedding Model** | OpenAI text-embedding-3-small (1536-D) | all-MiniLM-L6-v2 (384-D, local) | Same (model-agnostic) |
| **Storage Location** | Same PostgreSQL instance | Separate process | Cloudflare edge network |
| **Indexing Method** | IVFFlat (inverted file index) | HNSW (built-in) | Managed index |

##### 8.5.12.2 Per-Vector Storage Cost Breakdown

**pgvector (self-hosted, current production):**

```
Per vector (1536-D, float32):
  Raw embedding:        1536 × 4 bytes = 6,144 bytes
  Row overhead:         ~28 bytes (PostgreSQL tuple header)
  Metadata (JSONB):     ~200 bytes average
  IVFFlat index entry:  ~2,048 bytes (approximate)
  ─────────────────────────────────────────────────
  Total per vector:     ~8,420 bytes ≈ 8.5 KB

Storage cost (self-hosted PostgreSQL):
  100K vectors:  ~850 MB  → included in existing DB ($0/month marginal)
  500K vectors:  ~4.25 GB → included in existing DB
  1M vectors:    ~8.5 GB  → may require storage upgrade: ~$0.50–$2/month
  10M vectors:   ~85 GB   → dedicated storage: ~$5–$20/month
```

**ChromaDB (legacy, being phased out):**

```
Per vector (384-D, float32 — uses smaller model):
  Raw embedding:        384 × 4 bytes = 1,536 bytes
  HNSW index:           ~500 bytes
  Metadata:             ~200 bytes
  ─────────────────────────────────────────────────
  Total per vector:     ~2,236 bytes ≈ 2.2 KB

Storage cost: in-memory process, no separate charge, included in server RAM
```

**Cloudflare Vectorize (potential future upgrade):**

```
Pricing (as of 2026):
  Stored vectors:      $0.01 / 1,000 vectors / month
  Queried vectors:     $0.01 / 1,000 queries
  Included (free):     5M queried vectors / month, 5M stored vectors

Per vector cost:       $0.00001/vector/month
  100K vectors:  $1.00/month
  500K vectors:  $5.00/month
  1M vectors:    $10.00/month
  10M vectors:   $100.00/month (significant!)
```

##### 8.5.12.3 Total Cost Per Chunk (All Layers)

ต้นทุนจริงของ 1 chunk ประกอบด้วย 3 layers:

```
Layer 1: Embedding API (OpenAI)
  ├── text-embedding-3-small: ~125 tokens × $0.02/1M tokens
  └── = $0.0000025 per chunk

Layer 2: Vector Storage (varies by backend)
  ├── pgvector:   $0.0000000 per chunk/month (self-hosted, marginal cost negligible)
  ├── ChromaDB:   $0.0000000 per chunk/month (in-memory, included)
  └── Cloudflare: $0.0000100 per chunk/month (= $0.01/1000 vectors)

Layer 3: Query Compute
  ├── pgvector:   ~0.5ms CPU per query (negligible at scale)
  ├── ChromaDB:   ~1ms CPU per query (in-memory, fast)
  └── Cloudflare: $0.0000100 per query (= $0.01/1000 queries)
```

**สรุปต้นทุนรวมต่อ chunk (lifetime = 12 months average):**

| Backend | Embedding (1x) | Storage (12mo) | Total 12mo Cost | Charged (2 cr) | Margin |
|---------|----------------|----------------|-----------------|----------------|--------|
| **pgvector** | $0.0000025 | ~$0.000000 | $0.0000025 | $0.002 | **800×** |
| **ChromaDB** | $0.0000025 | ~$0.000000 | $0.0000025 | $0.002 | **800×** |
| **CF Vectorize** | $0.0000025 | $0.000120 | $0.0001225 | $0.002 | **16×** |

> **สรุป:** แม้ย้ายไป Cloudflare Vectorize (แพงที่สุด) margin ยังเหลือ 16× — ระบบไม่ขาดทุน

##### 8.5.12.4 Query Cost Coverage Analysis

RAG query ถูก charge 1 credit ($0.001) — ครอบคลุมหรือไม่?

```
RAG Query Cost Breakdown:
  1. Query embedding (OpenAI):   ~50-200 tokens × $0.02/1M = $0.000001–$0.000004
  2. Vector similarity search:
     - pgvector:   ~$0.000000 (CPU only, negligible)
     - ChromaDB:   ~$0.000000 (in-memory)
     - Cloudflare: ~$0.000010 ($0.01/1K queries)
  3. Result retrieval (top-K):   ~$0.000000 (data fetch)
  ──────────────────────────────────────────────────────────
  Total per query:
     - pgvector:   ~$0.000003
     - Cloudflare: ~$0.000013

  Charged: 1 credit = $0.001
```

| Backend | Query Cost | Charged | Margin |
|---------|-----------|---------|--------|
| **pgvector** | $0.000003 | $0.001 | **333×** |
| **ChromaDB** | $0.000003 | $0.001 | **333×** |
| **CF Vectorize** | $0.000013 | $0.001 | **77×** |

> **สรุป:** ทุก backend มี margin เพียงพอ แม้ Cloudflare ยังมี margin 77×

##### 8.5.12.5 Scale Scenario: Break-Even Analysis

**คำถาม:** ที่ scale ไหนระบบจะเริ่มขาดทุน?

```
Scenario: 1,000 active users × average 500 chunks/user = 500,000 total vectors

Revenue (monthly):
  Indexing: 500K chunks × avg 30% new/month = 150K chunks × 2 cr = 300K credits = $300
  RAG:      1,000 users × 100 queries/month = 100K queries × 1 cr = 100K credits = $100
  Total NEW revenue:                                                 = $400/month

Cost (monthly):
  Backend          | Embedding API   | Vector Storage  | Total Cost | Profit  |
  pgvector         | $0.375          | ~$2.50          | $2.88      | $397.12 |
  ChromaDB         | $0.375          | ~$0.00          | $0.38      | $399.63 |
  CF Vectorize     | $0.375          | $5.00           | $5.38      | $394.63 |

Profit margin:
  pgvector:     99.3%
  ChromaDB:     99.9%
  CF Vectorize: 98.7%
```

**Break-even point (Cloudflare Vectorize worst case):**

```
ต้นทุน vector storage:    $0.01 / 1,000 vectors / month
Revenue per vector:        $0.002 (one-time indexing charge)

Break-even เกิดขึ้นเมื่อ:
  Monthly storage cost > Monthly indexing revenue
  vectors × $0.00001 > new_vectors × $0.002

  ถ้า 5% ของ vectors เป็น new/month:
  V × $0.00001 > 0.05V × $0.002
  $0.00001 > $0.0001  → FALSE (revenue ยังสูงกว่า 10×)

  ถ้า 1% ของ vectors เป็น new/month (mature platform):
  V × $0.00001 > 0.01V × $0.002
  $0.00001 > $0.00002 → FALSE (revenue ยังสูงกว่า 2×)

  ถ้า 0.4% ของ vectors เป็น new/month:
  V × $0.00001 > 0.004V × $0.002
  $0.00001 > $0.000008 → TRUE! ขาดทุน!

  แต่ 0.4% new/month = platform แทบไม่มีผู้ใช้ใหม่ → ไม่ realistic
  + RAG query revenue ($0.001/query) ยังไม่นับรวม → offset storage cost ได้
```

> **สรุป:** ระบบไม่ขาดทุนแม้ในกรณี worst-case (Cloudflare Vectorize + mature platform + low growth)

##### 8.5.12.6 Backend-Agnostic Pricing Strategy

การออกแบบราคาเป็น **backend-agnostic** โดย:

1. **Pricing formula ไม่ผูกกับ backend:** `2 credits/chunk` และ `1 credit/query` เป็น business rate ที่ไม่เปลี่ยนตาม infrastructure
2. **Margin buffer เพียงพอ:** แม้ backend ที่แพงที่สุด (Cloudflare) ยังมี margin 16×+ สำหรับ indexing และ 77×+ สำหรับ query
3. **ไม่ต้องเปลี่ยนราคาเมื่อ migrate:** ย้ายจาก pgvector → Cloudflare ไม่ต้องปรับราคา — margin ลดจาก 800× เป็น 16× ซึ่งยังเพียงพอ
4. **Admin configurable:** Admin สามารถปรับ `COST_PER_CHUNK` ในอนาคตได้ (ref: §8.5.10) หากต้นทุนเปลี่ยนมาก

**Migration Decision Matrix:**

| Criteria | pgvector (Current) | Cloudflare Vectorize | Action Needed |
|----------|-------------------|---------------------|---------------|
| Cost < 1M vectors | ✅ ~$0.50/mo | ⚠️ $10/mo | No migration |
| Cost > 10M vectors | ⚠️ $20/mo + IOPS | ✅ $100/mo managed | Evaluate |
| Global latency | ⚠️ Single region | ✅ Edge network | Evaluate |
| Operational overhead | ⚠️ Self-managed | ✅ Fully managed | Evaluate |
| **Price change needed?** | — | **❌ No** | No price change |

##### 8.5.12.7 Embedding Model Cost Comparison

ราคาอาจเปลี่ยนหาก switch embedding model — แต่ formula ยังครอบคลุม:

| Model | Dimensions | Cost/1M tokens | Cost/chunk (~125 tok) | Charged | Margin |
|-------|-----------|----------------|----------------------|---------|--------|
| text-embedding-3-small **(current)** | 1,536 | $0.020 | $0.0000025 | $0.002 | 800× |
| text-embedding-3-large | 3,072 | $0.130 | $0.0000163 | $0.002 | 123× |
| text-embedding-ada-002 (legacy) | 1,536 | $0.100 | $0.0000125 | $0.002 | 160× |
| all-MiniLM-L6-v2 (local) | 384 | $0.000 | $0.0000000 | $0.002 | ∞ |

> **สรุป:** แม้ upgrade เป็น `text-embedding-3-large` (แพงกว่า 6.5×) margin ยังเหลือ 123× — ไม่ต้องปรับราคา

##### 8.5.12.8 Safeguards & Monitoring

เพื่อป้องกันไม่ให้ต้นทุน vector DB เกินคาด:

1. **Monthly infra cost dashboard (Admin only):**
   ```
   Metrics to track:
   - Total vectors stored (across all tenants)
   - Vector storage size (GB)
   - Embedding API cost (monthly)
   - Vector DB cost (monthly, if cloud)
   - Revenue from indexing + RAG credits (monthly)
   - Profit margin % = (revenue - cost) / revenue × 100
   ```

2. **Alert thresholds:**
   - ⚠️ Warning: profit margin drops below 50%
   - 🔴 Critical: profit margin drops below 20%
   - 🚨 Emergency: profit margin drops below 5% → auto-pause new indexing, notify admin

3. **Auto-scaling pricing (optional future):**
   - If infrastructure cost increases (e.g., migrating to Cloudflare), admin can increase `COST_PER_CHUNK` from 2 to 3 credits via Admin Config (§8.5.10) — no code change needed

4. **Quarterly cost review:**
   - Compare actual embedding API invoices vs credited revenue
   - Verify vector count growth trajectory
   - Evaluate if backend migration is cost-justified

---

## 9. Database Schema Changes

### 9.1 New Table: `google_drive_sync_state`

```sql
CREATE TABLE google_drive_sync_state (
  id            SERIAL PRIMARY KEY,
  tenant_id     VARCHAR(36) NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  page_token    TEXT NOT NULL,                     -- Changes API page token
  channel_id    VARCHAR(128),                      -- Webhook channel ID
  resource_id   VARCHAR(128),                      -- Webhook resource ID
  channel_expiry TIMESTAMP WITH TIME ZONE,         -- When channel expires
  sync_status   VARCHAR(32) DEFAULT 'idle' NOT NULL, -- idle, syncing, error
  last_sync_at  TIMESTAMP WITH TIME ZONE,
  last_error    TEXT,
  settings      JSON DEFAULT '{}'::json NOT NULL,  -- GoogleDriveSyncSettings (see §8.4.2)
  -- Credit budget tracking
  credits_used_this_month  INTEGER DEFAULT 0 NOT NULL,
  budget_month_key         VARCHAR(7),             -- "2026-02" format, resets monthly
  budget_alert_sent        BOOLEAN DEFAULT FALSE NOT NULL,
  created_at    TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  updated_at    TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  UNIQUE(tenant_id, user_id)
);

CREATE INDEX idx_gdrive_sync_channel ON google_drive_sync_state(channel_id);
CREATE INDEX idx_gdrive_sync_expiry ON google_drive_sync_state(channel_expiry)
  WHERE channel_id IS NOT NULL;
```

### 9.2 New Table: `google_drive_edit_sessions`

```sql
CREATE TABLE google_drive_edit_sessions (
  id              SERIAL PRIMARY KEY,
  tenant_id       VARCHAR(36) NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  library_item_id INTEGER NOT NULL REFERENCES library_items(id) ON DELETE CASCADE,
  drive_file_id   VARCHAR(128) NOT NULL,
  edit_url        TEXT NOT NULL,
  original_source_url TEXT,
  status          VARCHAR(32) DEFAULT 'active' NOT NULL, -- active, saved_back, discarded, expired
  created_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  completed_at    TIMESTAMP WITH TIME ZONE
);

CREATE INDEX idx_gdrive_edit_user_status ON google_drive_edit_sessions(user_id, status);
CREATE INDEX idx_gdrive_edit_item ON google_drive_edit_sessions(library_item_id);
```

### 9.3 Extend Existing Tables

**`library_items`:** No schema change needed. The `source` field already supports arbitrary strings. Use `source: "google_drive"` and store Drive metadata in the existing `metadata` JSON column.

**`library_links`:** Already supports arbitrary `link_type` + `link_id`. Use:
- `link_type: "google_drive_file"`, `link_id: driveFileId`

**`library_index_jobs`:** No schema change. Use `job_type: "google_drive_sync"` to distinguish from regular `"initial_index"` jobs.

---

## 10. Security & Privacy

### 10.1 Token Security

| Aspect | Implementation |
|--------|---------------|
| Storage | AES-256-GCM encrypted in `oauth_connections` table |
| Key management | `LLM_ENCRYPTION_KEY` (shared between Node.js and Python) |
| Refresh | Auto-refresh 5 minutes before expiry |
| Revocation | On disconnect: revoke at Google + delete local tokens + delete indexed data |
| Scope | Principle of least privilege: `readonly` for search/RAG, `drive.file` for edit |

### 10.2 Data Privacy

- **No file duplication:** Virtual references only; full files stay in Google Drive
- **Indexed content:** Text chunks + embeddings stored locally (same as regular library items)
- **User isolation:** Each user's Drive data is accessible only by them (enforced by per-user OAuth tokens)
- **Tenant isolation:** Vector collections are per-tenant; Drive content tagged with `user_id`
- **Disconnect cleanup:** When user disconnects Google, all virtual references, chunks, and embeddings are deleted
- **Audit logging:** Every Drive API call logged to JSONL audit log with `traceId`

### 10.3 OAuth Verification Requirements

| Scope | Google Classification | Verification Required |
|-------|----------------------|----------------------|
| `drive.file` | Non-sensitive | Basic verification |
| `drive.readonly` | Restricted | Security assessment by third-party auditor |
| `documents.readonly` | Sensitive | OAuth consent screen verification |
| `spreadsheets.readonly` | Sensitive | OAuth consent screen verification |

**Note:** The `drive.readonly` scope requires **restricted scope verification**, which includes a third-party security assessment. This can take 4-6 weeks. Start the verification process early.

**Alternative:** Start with `drive.file` only (non-sensitive, no audit required). This limits file access to files the user explicitly opens through the app, but avoids the verification requirement. Add `drive.readonly` later when verification is complete.

### 10.4 Rate Limiting

```typescript
// Google Drive API: 12,000 queries per minute per project
// SmartSpecPro internal limits:
const DRIVE_RATE_LIMITS = {
  search: { perUser: 30, perMinute: true },     // 30 searches/min/user
  read: { perUser: 60, perMinute: true },        // 60 reads/min/user
  sync: { perUser: 5, perMinute: true },         // 5 sync triggers/min/user
  edit: { perUser: 10, perMinute: true },        // 10 edit sessions/min/user
};
```

---

## 11. API Reference

### 11.1 tRPC Endpoints (Node.js)

#### `googleDrive.getConnectionStatus`
```
Query → { connected: boolean, email?: string, scopes?: string[], lastSynced?: string, indexedCount?: number }
```

#### `googleDrive.getAuthUrl`
```
Mutation(scopes?: string[]) → { authUrl: string, state: string }
```

#### `googleDrive.completeOAuth`
```
Mutation({ code: string, state: string }) → { success: boolean, email: string }
```

#### `googleDrive.disconnect`
```
Mutation → { success: boolean }
Side effects: Revoke Google tokens, delete virtual references, delete chunks/embeddings
```

#### `googleDrive.searchFiles`
```
Query({ query: string, fileType?: string, folderId?: string, limit?: number })
→ { files: DriveFileResult[], nextPageToken?: string }
```

#### `googleDrive.openForEditing`
```
Mutation({ libraryItemId: number })
→ { editUrl: string, driveFileId: string, sessionId: number }
Precondition: File must have source_url (not a virtual reference)
```

#### `googleDrive.saveBack`
```
Mutation({ sessionId: number })
→ { success: boolean, newSourceUrl: string }
Side effects: Export from Drive, upload to S3/R2, version old file, re-index
```

#### `googleDrive.getSyncStatus`
```
Query → { status: string, lastSync: string, indexedFiles: number, pendingJobs: number }
```

#### `googleDrive.triggerSync`
```
Mutation({ fullSync?: boolean }) → { jobId: string }
```

#### `googleDrive.updateSyncSettings`
```
Mutation({ folders?: string[], fileTypes?: string[] }) → { success: boolean }
```

### 11.2 Python Backend Endpoints

#### `POST /api/google/drive/extract-content`
```
Body: { file_id: string, mime_type: string }
Auth: Bearer token (internal, from Node.js)
→ { content: string, content_type: string, token_count: number }
```

#### `POST /api/google/drive/sync-file`
```
Body: { file_id: string, user_id: number, tenant_id: string }
→ { library_item_id: number, job_id: number }
```

### 11.3 MCP Tools

| Tool | Input | Output | Side Effects |
|------|-------|--------|--------------|
| `search_drive_files` | `{ query, file_type?, max_results? }` | `[{ id, name, mimeType, modifiedTime, webViewLink }]` | None (read-only) |
| `read_drive_file` | `{ file_id }` | `{ content, mimeType, name }` | None (read-only) |
| `read_sheet_data` | `{ file_id, sheet_name?, cell_range? }` | `{ headers, rows, sheetName }` | None (read-only) |
| `list_drive_folder` | `{ folder_id? }` | `[{ id, name, mimeType, isFolder }]` | None (read-only) |
| `get_drive_file_info` | `{ file_id }` | `{ name, size, owners, modifiedTime, permissions }` | None (read-only) |

---

## 12. UI/UX Specifications

### 12.1 Settings Page — Integrations Tab

**States:**

1. **Not Connected:**
   - Google card with "Connect Google Drive" button
   - Brief description of what connecting enables
   - Scope explanation: "SmartSpecPro will be able to read your Google Drive files"

2. **Connecting (popup open):**
   - Button changes to "Connecting..." with spinner
   - Polling for callback completion

3. **Connected:**
   - Shows Google profile (email, avatar)
   - Shows granted scopes
   - Sync status with "Sync Now" button
   - Indexed file count
   - "Manage Folders" opens folder picker dialog
   - "Disconnect" with confirmation dialog

### 12.2 Document Management — Drive Integration

1. **Source filter:** Add "Google Drive" option to scope dropdown (alongside "My Library", "Shared with me")

2. **File badges:** Show `[Google Drive]` badge on virtual references

3. **Click behavior:** Clicking a Google Drive file opens it in Google's native editor (new tab)

4. **Context menu:** "Import to Library" option to download and create a local copy

### 12.3 Chat — Drive Tool Usage

When the AI uses a Drive tool, show a tool-use indicator:

```
┌─────────────────────────────────────────────────────────────────┐
│ 🤖 AI is searching your Google Drive...                         │
│    Tool: search_drive_files                                      │
│    Query: "quarterly report 2026"                                │
│                                                                  │
│ Found 3 matching files:                                          │
│ 📄 Q1 2026 Quarterly Report.docx (Modified Feb 10)              │
│ 📊 Sales Data Q1 2026.xlsx (Modified Feb 8)                     │
│ 📝 Board Meeting Notes Q1.gdoc (Modified Feb 5)                 │
│                                                                  │
│ Based on these files, here is the summary you requested...       │
└─────────────────────────────────────────────────────────────────┘
```

### 12.4 Google Drive Dashboard

เข้าถึงได้จาก **Settings > Integrations > Google Drive > "Dashboard"** หรือจาก **sidebar menu "Google Drive"** (ถ้า connected)

Dashboard ออกแบบเป็น **4 แท็บ** เพื่อให้ดูง่าย แต่ละแท็บมีหน้าที่ชัดเจน:

#### 12.4.1 Dashboard Layout

```
┌──────────────────────────────────────────────────────────────────────┐
│  Google Drive                                            user@gmail │
│  ┌──────────┬────────────┬──────────────┬──────────────┐            │
│  │ Overview │ Files      │ Credit Usage │ Pricing Info │            │
│  └──────────┴────────────┴──────────────┴──────────────┘            │
│                                                                      │
│  ┌──────────────────────────────────────────────────────────────────┐│
│  │                                                                  ││
│  │                    (Tab content area)                             ││
│  │                                                                  ││
│  └──────────────────────────────────────────────────────────────────┘│
└──────────────────────────────────────────────────────────────────────┘
```

#### 12.4.2 Tab 1: Overview (ภาพรวม)

แสดงสถานะทั้งหมดในหน้าเดียว — ออกแบบเป็น card grid

```
┌──────────────────────────────────────────────────────────────────────┐
│  Overview                                                            │
│                                                                      │
│  ┌─────────────────┐ ┌─────────────────┐ ┌─────────────────────────┐│
│  │  Connection      │ │  Sync Status     │ │  Monthly Credits        ││
│  │  ● Connected     │ │  ● Up to date    │ │  940 / 5,000            ││
│  │  user@gmail.com  │ │  Last: 12 min    │ │  ██░░░░░░░░ 18.8%      ││
│  │                  │ │  ago             │ │  $0.94 / $5.00          ││
│  │  [Disconnect]    │ │  [Sync Now]      │ │  [View Details]         ││
│  └─────────────────┘ └─────────────────┘ └─────────────────────────┘│
│                                                                      │
│  ┌─────────────────┐ ┌─────────────────┐ ┌─────────────────────────┐│
│  │  Indexed Files   │ │  Indexing Mode   │ │  Auto-Sync              ││
│  │  142 files       │ │  Selected        │ │  ● Enabled              ││
│  │  2,840 chunks    │ │  Folders         │ │  Webhook active         ││
│  │  28.4 MB text    │ │                  │ │  Expires: 6 days        ││
│  │                  │ │  3 folders       │ │                         ││
│  │  [Browse Files]  │ │  [Manage]        │ │  [Settings]             ││
│  └─────────────────┘ └─────────────────┘ └─────────────────────────┘│
│                                                                      │
│  ── Quick Actions ──────────────────────────────────────────────────│
│                                                                      │
│  [Sync Now]  [Manage Folders]  [View Pricing]  [Export Usage CSV]   │
│                                                                      │
│  ── Recent Activity ────────────────────────────────────────────────│
│                                                                      │
│  14:30  Synced 3 files (auto)                          -24 credits  │
│  14:15  AI read: Budget_2026.xlsx via MCP               -3 credits  │
│  13:00  Initial index: Client_Proposal.docx            -40 credits  │
│  12:45  Re-index skipped: Meeting.gdoc (no changes)     0 credits  │
│  10:00  Manual sync triggered (47 files)              -852 credits  │
│                                                                      │
│  [View All Activity →]                                               │
└──────────────────────────────────────────────────────────────────────┘
```

#### 12.4.3 Tab 2: Files (ไฟล์ที่ Index แล้ว)

ตารางแสดงไฟล์ทั้งหมดที่ถูก index พร้อม filter/search/sort

```
┌──────────────────────────────────────────────────────────────────────┐
│  Indexed Files                                                       │
│                                                                      │
│  [Search files...____________]  Type: [All ▾]  Status: [All ▾]      │
│                                                                      │
│  ┌────┬─────────────────────────┬──────────┬────────┬───────┬──────┐│
│  │    │ File Name               │ Type     │ Chunks │ Cost  │ Last ││
│  │    │                         │          │        │       │ Sync ││
│  ├────┼─────────────────────────┼──────────┼────────┼───────┼──────┤│
│  │ 📄 │ Q4_Report.docx          │ Document │ 20     │ 40 cr │ 2h   ││
│  │ 📊 │ Sales_Dashboard.xlsx    │ Sheet    │ 8      │ 16 cr │ 2h   ││
│  │ 📝 │ Team_Notes              │ G.Doc    │ 4      │  8 cr │ 2h   ││
│  │ 📊 │ Budget_2026.xlsx        │ Sheet    │ 12     │ 24 cr │ 5h   ││
│  │ 📄 │ Client_Proposal.docx    │ Document │ 35     │ 70 cr │ 1d   ││
│  │ 📑 │ Onboarding_Slides       │ G.Slide  │ 15     │ 30 cr │ 1d   ││
│  │ ⚠️ │ Large_Export.xlsx       │ Sheet    │ —      │ —     │ Skip ││
│  │    │ (exceeds 10MB limit)    │          │        │       │      ││
│  └────┴─────────────────────────┴──────────┴────────┴───────┴──────┘│
│                                                                      │
│  Showing 1-7 of 142 files                        [< 1 2 3 ... 21 >]│
│                                                                      │
│  ── Summary ────────────────────────────────────────────────────────│
│  Total indexed: 142 files • 2,840 chunks • 28.4 MB text             │
│  Total indexing cost: 5,680 credits ($5.68)                          │
│  Skipped: 3 files (size limit) • 2 files (unsupported type)         │
└──────────────────────────────────────────────────────────────────────┘
```

**Columns:**
- **File Name:** ชื่อไฟล์ + icon ตามประเภท, คลิกเปิดใน Google Drive
- **Type:** Document / Sheet / Slide / PDF / Text / G.Doc / G.Sheet / G.Slide
- **Chunks:** จำนวน chunks ที่สร้าง (สัมพันธ์กับต้นทุน)
- **Cost:** เครดิตที่ใช้ใน indexing ครั้งล่าสุด
- **Last Sync:** เวลาที่ sync ล่าสุด (relative time)
- **Status icon:** ✓ synced, ⟳ syncing, ⚠️ skipped, ✕ failed

**Sorting:** คลิกหัวคอลัมน์เพื่อ sort (default: Last Sync desc)
**Filter:** by Type, by Status, by Folder
**Search:** full-text search ชื่อไฟล์

#### 12.4.4 Tab 3: Credit Usage (การใช้เครดิต)

แสดงรายละเอียดการใช้เครดิตทั้งหมด พร้อม chart และ breakdown

```
┌──────────────────────────────────────────────────────────────────────┐
│  Credit Usage — February 2026                                        │
│                                                                      │
│  ┌──────────────────────────────────────────────────────────────────┐│
│  │  Monthly Budget                                                  ││
│  │                                                                  ││
│  │  940 / 5,000 credits used                              18.8%    ││
│  │  ████████░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░        ││
│  │  $0.94 spent  •  $4.06 remaining  •  Resets Mar 1               ││
│  │                                                                  ││
│  │  Budget: [5,000 ▾] credits/month    Alert at: [80% ▾]           ││
│  │  [Save Budget Settings]                                          ││
│  └──────────────────────────────────────────────────────────────────┘│
│                                                                      │
│  ── Breakdown by Operation ─────────────────────────────────────────│
│                                                                      │
│  ┌──────────────────────────────┬────────┬───────┬─────────────────┐│
│  │ Operation                    │ Count  │ Total │ % of Total      ││
│  ├──────────────────────────────┼────────┼───────┼─────────────────┤│
│  │ Initial indexing             │ 42     │ 780   │ ████████░░ 83%  ││
│  │ Re-indexing (content changed)│ 8      │  96   │ █░░░░░░░░░ 10%  ││
│  │ Re-indexing (no change)      │ 14     │   0   │ ░░░░░░░░░░  0%  ││
│  │ MCP file reads               │ 12     │  52   │ ░░░░░░░░░░  6%  ││
│  │ RAG semantic queries         │ 6      │  12   │ ░░░░░░░░░░  1%  ││
│  ├──────────────────────────────┼────────┼───────┼─────────────────┤│
│  │ Total                        │ 82     │ 940   │ ██████████ 100% ││
│  └──────────────────────────────┴────────┴───────┴─────────────────┘│
│                                                                      │
│  ── Daily Usage (Last 30 Days) ─────────────────────────────────────│
│                                                                      │
│    200 ┤                                                             │
│    150 ┤              █                                              │
│    100 ┤         █    █                                  █           │
│     50 ┤    █    █    █    █    █         █    █    █    █    █      │
│      0 ┤────────────────────────────────────────────────────────     │
│         Jan 15  Jan 20  Jan 25  Jan 30  Feb 5   Feb 10  Feb 14     │
│                                                                      │
│  ── Transaction History ────────────────────────────────────────────│
│                                                                      │
│  Period: [This month ▾]    Type: [All ▾]    [Export CSV]            │
│                                                                      │
│  ┌──────────┬─────────────────────────────────┬────────┬───────────┐│
│  │ Date     │ Description                     │Credits │ Balance   ││
│  ├──────────┼─────────────────────────────────┼────────┼───────────┤│
│  │ Feb 14   │ Index: Q4_Report.docx           │   -40  │ 4,060    ││
│  │ 14:30    │ 20 chunks • Document            │        │           ││
│  ├──────────┼─────────────────────────────────┼────────┼───────────┤│
│  │ Feb 14   │ Index: Sales_Dashboard.xlsx     │   -16  │ 4,100    ││
│  │ 14:30    │ 8 chunks • Spreadsheet          │        │           ││
│  ├──────────┼─────────────────────────────────┼────────┼───────────┤│
│  │ Feb 14   │ MCP read: Budget_2026.xlsx      │    -3  │ 4,116    ││
│  │ 14:15    │ AI read via chat                │        │           ││
│  ├──────────┼─────────────────────────────────┼────────┼───────────┤│
│  │ Feb 14   │ Re-index: Meeting.gdoc          │     0  │ 4,119    ││
│  │ 14:29    │ No changes detected (skipped)   │        │           ││
│  ├──────────┼─────────────────────────────────┼────────┼───────────┤│
│  │ Feb 14   │ Refund: API error during index  │   +24  │ 4,119    ││
│  │ 14:28    │ Original: Budget_2026.xlsx      │        │           ││
│  ├──────────┼─────────────────────────────────┼────────┼───────────┤│
│  │ Feb 13   │ Initial sync (42 files)         │  -852  │ 4,095    ││
│  │ 10:00    │ Batch index operation            │        │           ││
│  └──────────┴─────────────────────────────────┴────────┴───────────┘│
│                                                                      │
│  Showing 1-7 of 82 transactions                  [< 1 2 3 ... 12 >]│
└──────────────────────────────────────────────────────────────────────┘
```

**Transaction row details (expandable):**
คลิกแต่ละ row เพื่อดูรายละเอียดเพิ่มเติม:

```
┌──────────────────────────────────────────────────────────────────┐
│  ▼ Feb 14, 14:30 — Index: Q4_Report.docx            -40 credits │
│                                                                  │
│  Operation:    Initial indexing                                  │
│  File:         Q4_Report.docx (Google Docs)                     │
│  Drive ID:     1abc...xyz                                        │
│  Text length:  10,240 characters                                 │
│  Chunks:       20 (@ 2 credits each)                            │
│  Content hash: sha256:abcdef...                                  │
│  Sync job:     job-123                                           │
│  Timestamp:    2026-02-14T14:30:12.456Z                         │
│                                                                  │
│  [Open in Google Drive]                                          │
└──────────────────────────────────────────────────────────────────┘
```

#### 12.4.5 Tab 4: Pricing Info (ตารางราคาครบทุก Operation)

**หน้านี้สำคัญมาก** — แสดงราคาของ **ทุก operation ในระบบ** ไม่ใช่เฉพาะ Google Drive
ให้ user เข้าถึงได้ง่ายจากทุกที่ แสดงแบบเข้าใจง่าย ไม่ต้องอ่าน documentation
(Reference: §8.5.3 Unified Operation Pricing Table)

```
┌──────────────────────────────────────────────────────────────────────┐
│  SmartSpecPro — Pricing & Cost Guide (ตารางราคาครบถ้วน)               │
│                                                                      │
│  1 credit = $0.001 USD  •  1,000 credits = $1.00                     │
│                                                                      │
│  ┌─────────────────────────────────────────────────────────────────┐ │
│  │ A. DOCUMENT MANAGEMENT — Upload & Indexing                      │ │
│  └─────────────────────────────────────────────────────────────────┘ │
│                                                                      │
│  ┌────────────────────────────┬──────────┬─────────────────────────┐ │
│  │ Operation                  │ Cost     │ How it works            │ │
│  ├────────────────────────────┼──────────┼─────────────────────────┤ │
│  │ Upload ไฟล์ + indexing      │ 2-200 cr │ คิดตาม chunks ที่สร้าง    │ │
│  │ (รูป, PDF, Doc, Excel...)  │          │ (2 credits ต่อ chunk)   │ │
│  ├────────────────────────────┼──────────┼─────────────────────────┤ │
│  │ บันทึก Markdown + re-index │ 2-200 cr │ เหมือน upload             │ │
│  │ (เฉพาะเมื่อเนื้อหาเปลี่ยน)   │          │ (เนื้อหาเดิม = ฟรี)       │ │
│  ├────────────────────────────┼──────────┼─────────────────────────┤ │
│  │ Upload โดยไม่ index         │ ✓ ฟรี    │ เก็บไฟล์อย่างเดียว        │ │
│  │ (metadata only)            │          │ AI ค้นหาไม่ได้           │ │
│  ├────────────────────────────┼──────────┼─────────────────────────┤ │
│  │ Download / preview ไฟล์     │ ✓ ฟรี    │ ดูหรือดาวน์โหลดไฟล์       │ │
│  ├────────────────────────────┼──────────┼─────────────────────────┤ │
│  │ ค้นหาไฟล์ (keyword)        │ ✓ ฟรี    │ ค้นชื่อ/tag (database)   │ │
│  ├────────────────────────────┼──────────┼─────────────────────────┤ │
│  │ แชร์ / จัดการสิทธิ์           │ ✓ ฟรี    │ เปลี่ยน permission       │ │
│  ├────────────────────────────┼──────────┼─────────────────────────┤ │
│  │ ลบ / กู้คืน / version history│ ✓ ฟรี    │ จัดการไฟล์               │ │
│  └────────────────────────────┴──────────┴─────────────────────────┘ │
│                                                                      │
│  ┌─────────────────────────────────────────────────────────────────┐ │
│  │ B. AI SEARCH & RAG                                              │ │
│  └─────────────────────────────────────────────────────────────────┘ │
│                                                                      │
│  ┌────────────────────────────┬──────────┬─────────────────────────┐ │
│  │ Operation                  │ Cost     │ How it works            │ │
│  ├────────────────────────────┼──────────┼─────────────────────────┤ │
│  │ RAG semantic search        │ 1 cr     │ AI ค้นหาเชิงความหมาย     │ │
│  │ (ค้นหาด้วย AI)              │          │ ผ่าน vector embedding   │ │
│  ├────────────────────────────┼──────────┼─────────────────────────┤ │
│  │ AI ดึงข้อมูลใน Chat        │ 1 cr     │ + ค่า LLM แยกต่างหาก    │ │
│  │ (RAG context retrieval)    │          │ (ดู section D)          │ │
│  ├────────────────────────────┼──────────┼─────────────────────────┤ │
│  │ ค้นหา keyword ธรรมดา       │ ✓ ฟรี    │ ไม่ใช้ AI               │ │
│  └────────────────────────────┴──────────┴─────────────────────────┘ │
│                                                                      │
│  ┌─────────────────────────────────────────────────────────────────┐ │
│  │ C. GOOGLE DRIVE                                                 │ │
│  └─────────────────────────────────────────────────────────────────┘ │
│                                                                      │
│  ┌────────────────────────────┬──────────┬─────────────────────────┐ │
│  │ Operation                  │ Cost     │ How it works            │ │
│  ├────────────────────────────┼──────────┼─────────────────────────┤ │
│  │ Index ไฟล์จาก Drive         │ 2-200 cr │ เหมือน Upload indexing   │ │
│  │ (ครั้งแรก หรือเนื้อหาเปลี่ยน) │          │ (2 cr ต่อ chunk)        │ │
│  ├────────────────────────────┼──────────┼─────────────────────────┤ │
│  │ Re-index (ไม่มีการเปลี่ยน)  │ ✓ ฟรี    │ ตรวจ hash → ข้าม        │ │
│  ├────────────────────────────┼──────────┼─────────────────────────┤ │
│  │ AI อ่านไฟล์จาก Drive        │ 1-5 cr   │ คิดตามขนาดเนื้อหา       │ │
│  │ (MCP read)                 │          │ (ต่อ 2,000 ตัวอักษร)     │ │
│  ├────────────────────────────┼──────────┼─────────────────────────┤ │
│  │ AI อ่าน Google Sheet       │ 1-3 cr   │ คิดตาม cell range       │ │
│  ├────────────────────────────┼──────────┼─────────────────────────┤ │
│  │ ค้นหาไฟล์ใน Drive           │ ✓ ฟรี    │ ใช้ Google Search       │ │
│  ├────────────────────────────┼──────────┼─────────────────────────┤ │
│  │ เปิดดู folder / list        │ ✓ ฟรี    │ ดูรายการเท่านั้น          │ │
│  ├────────────────────────────┼──────────┼─────────────────────────┤ │
│  │ แก้ไขใน Google Docs/Sheet  │ ✓ ฟรี    │ เปิดหน้า Google         │ │
│  ├────────────────────────────┼──────────┼─────────────────────────┤ │
│  │ Save back จาก Google       │ ✓ ฟรี    │ Export + upload         │ │
│  ├────────────────────────────┼──────────┼─────────────────────────┤ │
│  │ ยกเลิกเชื่อมต่อ              │ ✓ ฟรี    │ ลบข้อมูลทั้งหมด          │ │
│  └────────────────────────────┴──────────┴─────────────────────────┘ │
│                                                                      │
│  ┌─────────────────────────────────────────────────────────────────┐ │
│  │ D. AI CHAT & LLM                                               │ │
│  └─────────────────────────────────────────────────────────────────┘ │
│                                                                      │
│  ┌────────────────────────────┬──────────┬─────────────────────────┐ │
│  │ Operation                  │ Cost     │ How it works            │ │
│  ├────────────────────────────┼──────────┼─────────────────────────┤ │
│  │ Chat (GPT-4o, Claude, etc.)│ Variable │ คิดตาม token ที่ใช้       │ │
│  │                            │          │ Input + Output tokens   │ │
│  ├────────────────────────────┼──────────┼─────────────────────────┤ │
│  │ Translation               │ Variable │ คิดตาม token             │ │
│  ├────────────────────────────┼──────────┼─────────────────────────┤ │
│  │ Skill execution           │ Variable │ คิดตาม token             │ │
│  ├────────────────────────────┼──────────┼─────────────────────────┤ │
│  │ Free model (ถ้ามี)          │ ✓ ฟรี    │ บันทึกประวัติแต่ไม่คิดเงิน │ │
│  └────────────────────────────┴──────────┴─────────────────────────┘ │
│                                                                      │
│  ┌─────────────────────────────────────────────────────────────────┐ │
│  │ E. MEDIA GENERATION                                             │ │
│  └─────────────────────────────────────────────────────────────────┘ │
│                                                                      │
│  ┌────────────────────────────┬──────────┬─────────────────────────┐ │
│  │ Operation                  │ Cost     │ How it works            │ │
│  ├────────────────────────────┼──────────┼─────────────────────────┤ │
│  │ สร้างรูปภาพ (Image gen)     │ Variable │ Model × ขนาด × จำนวน    │ │
│  ├────────────────────────────┼──────────┼─────────────────────────┤ │
│  │ สร้างวิดีโอ (Video gen)      │ Variable │ Model × ความยาว × ขนาด  │ │
│  ├────────────────────────────┼──────────┼─────────────────────────┤ │
│  │ สร้างเสียง (TTS)            │ Variable │ Model × ความยาว         │ │
│  └────────────────────────────┴──────────┴─────────────────────────┘ │
│                                                                      │
│  ┌─────────────────────────────────────────────────────────────────┐ │
│  │ F. ALWAYS FREE (ฟรีตลอด)                                        │ │
│  └─────────────────────────────────────────────────────────────────┘ │
│                                                                      │
│  ┌────────────────────────────────────────────────────┐              │
│  │ Login / Settings / Profile / Admin     │ ✓ ฟรี     │              │
│  │ ดู Dashboard / Analytics / ตารางราคา     │ ✓ ฟรี     │              │
│  │ Notification / Alerts                 │ ✓ ฟรี     │              │
│  │ View credit usage / export CSV        │ ✓ ฟรี     │              │
│  └────────────────────────────────────────────────────┘              │
│                                                                      │
│  ══════════════════════════════════════════════════════════════════   │
│  ตัวอย่างการคำนวณ                                                      │
│  ══════════════════════════════════════════════════════════════════   │
│                                                                      │
│  ┌──────────────────────────────────────────────────────────────────┐│
│  │  ตัวอย่าง 1: Upload 5 ไฟล์เข้า Document Management                ││
│  │                                                                  ││
│  │  Report.pdf (5,000 chars)  → 10 chunks × 2 =  20 credits       ││
│  │  Notes.md (2,000 chars)    →  4 chunks × 2 =   8 credits       ││
│  │  Data.xlsx (3,000 chars)   →  6 chunks × 2 =  12 credits       ││
│  │  Photo.jpg                 →  ไม่ index         0 credits       ││
│  │  Logo.png                  →  ไม่ index         0 credits       ││
│  │  ──────────────────────────────────────────────────              ││
│  │  Total:                                        40 credits ($0.04)││
│  └──────────────────────────────────────────────────────────────────┘│
│                                                                      │
│  ┌──────────────────────────────────────────────────────────────────┐│
│  │  ตัวอย่าง 2: Sync Google Drive folder (50 ไฟล์)                   ││
│  │                                                                  ││
│  │  ไฟล์เล็ก × 20 =  160 cr  •  ไฟล์กลาง × 20 = 800 cr             ││
│  │  ไฟล์ใหญ่ × 10 = 2,000 cr                                       ││
│  │  Total:                                   2,960 credits ($2.96) ││
│  │                                                                  ││
│  │  Re-sync ไม่มีเปลี่ยนแปลง = ฟรี                                    ││
│  │  Re-sync 5 ไฟล์เปลี่ยน = ~100 credits ($0.10)                     ││
│  └──────────────────────────────────────────────────────────────────┘│
│                                                                      │
│  ┌──────────────────────────────────────────────────────────────────┐│
│  │  ตัวอย่าง 3: ใช้งานรายวัน (Chat + Search + Library)                ││
│  │                                                                  ││
│  │  Chat 20 ข้อความ (GPT-4o)           ~200 credits               ││
│  │  RAG search 10 ครั้ง                   10 credits               ││
│  │  Upload 3 ไฟล์ + indexing              30 credits               ││
│  │  ──────────────────────────────────────────────────              ││
│  │  Total ต่อวัน:                         ~240 credits ($0.24)     ││
│  │  Total ต่อเดือน (20 วันทำงาน):       ~4,800 credits ($4.80)     ││
│  └──────────────────────────────────────────────────────────────────┘│
│                                                                      │
│  ── Tips ───────────────────────────────────────────────────────────│
│                                                                      │
│  • Upload ไฟล์เล็ก (<100KB) คิดเครดิตอัตโนมัติ ต้นทุนต่ำมาก           │
│  • Upload ไฟล์ใหญ่ (>1MB) ระบบจะแสดงค่าใช้จ่ายก่อน                   │
│  • เลือก "Upload without indexing" ถ้าไม่ต้องการให้ AI ค้นหาได้       │
│  • ไฟล์ที่ไม่เปลี่ยนแปลง re-index ฟรี (ตรวจ hash อัตโนมัติ)            │
│  • ค้นหา keyword ธรรมดาฟรี ใช้ RAG search เฉพาะเมื่อต้องการ AI       │
│  • ตั้ง Monthly Budget เพื่อป้องกันค่าใช้จ่ายเกินคาด                     │
│  • ดู credit usage ได้ตลอด ฟรีไม่เสียเครดิต                           │
│                                                                      │
└──────────────────────────────────────────────────────────────────────┘
```

#### 12.4.6 Navigation & Accessibility

**เข้าถึง Dashboard ได้จาก 3 ทาง:**

1. **Settings > Integrations > Google Drive card > "Dashboard"** button
2. **Sidebar menu** — เมื่อ Google Drive connected จะแสดง menu item "Google Drive" ใต้ "Document Management"
3. **Credit Usage widget** — ทุกที่ที่แสดง credit balance (header bar) จะมี link "Drive Usage" ถ้ามี Drive connected

**เข้าถึง Pricing Info ได้จาก 5 ทาง:**

1. **Dashboard > Tab "Pricing Info"** — ตรงไปตรงมา
2. **Pre-flight estimation dialog > "View Pricing Details"** link
3. **Credit Usage tab > "How is this calculated?"** link ข้าง operation breakdown
4. **Settings > Integrations > Google Drive > "View Pricing"** button
5. **Transaction detail (expanded row) > "How was this cost calculated?"** link

```
┌─────────────────────────────────────────────┐
│  Sidebar                                     │
│                                              │
│  📊 Dashboard                               │
│  💬 Chat                                    │
│  📁 Document Management                     │
│     └─ 🔵 Google Drive        ← NEW         │
│  🎬 Video Editor                            │
│  📋 Skills                                  │
│  ⚙️ Settings                                │
└─────────────────────────────────────────────┘
```

#### 12.4.7 Responsive Design

| Viewport | Layout |
|----------|--------|
| Desktop (>1024px) | Full 4-tab layout, cards in 3-column grid |
| Tablet (768-1024px) | 4-tab layout, cards in 2-column grid, tables scroll horizontally |
| Mobile (<768px) | Tabs become dropdown selector, cards stack vertically, simplified tables |

#### 12.4.8 Component Structure

```
GoogleDriveDashboard/
├── GoogleDriveDashboard.tsx          # Main container + tab router
├── tabs/
│   ├── OverviewTab.tsx               # Status cards + recent activity
│   ├── IndexedFilesTab.tsx           # File table with search/filter/sort
│   ├── CreditUsageTab.tsx            # Budget, breakdown, chart, transactions
│   └── PricingInfoTab.tsx            # Static pricing reference page
├── components/
│   ├── StatusCard.tsx                # Reusable metric card (icon, value, label, action)
│   ├── CreditProgressBar.tsx         # Budget progress bar with color thresholds
│   ├── DailyUsageChart.tsx           # Bar chart (recharts or chart.js)
│   ├── TransactionRow.tsx            # Expandable transaction row
│   ├── TransactionDetail.tsx         # Expanded detail view
│   └── CostEstimationDialog.tsx      # Pre-flight cost modal (reused from sync flow)
└── hooks/
    ├── useGoogleDriveStatus.ts       # trpc query wrapper
    ├── useCreditUsage.ts             # trpc query wrapper with period filter
    └── useIndexedFiles.ts            # trpc query with pagination/filter/sort
```

#### 12.4.9 Required tRPC Endpoints (Dashboard-specific)

```typescript
// New endpoints needed for dashboard
googleDrive.getDashboardOverview: protectedProcedure.query(...)
  // → { connection, syncStatus, creditUsage, indexedStats, recentActivity }

googleDrive.getCreditUsage: protectedProcedure.query(...)
  // Input: { period: "this_month" | "last_month" | "last_30_days" | "all_time" }
  // → { totalUsed, limit, breakdown[], dailyUsage[], alertSent }

googleDrive.getCreditTransactions: protectedProcedure.query(...)
  // Input: { period?, operationType?, limit?, offset? }
  // → { transactions[], total, hasMore }

googleDrive.getIndexedFiles: protectedProcedure.query(...)
  // Input: { search?, fileType?, status?, sortBy?, sortDir?, limit?, offset? }
  // → { files[], total, summary: { totalFiles, totalChunks, totalBytes, totalCredits } }

googleDrive.updateCreditBudget: protectedProcedure.mutation(...)
  // Input: { monthlyLimitCredits: number | null, alertThresholdPercent: number }
  // → { success: boolean }

googleDrive.exportUsageCsv: protectedProcedure.query(...)
  // Input: { period: string }
  // → CSV string (downloaded as file)
```

---

## 13. Testing Strategy

### 13.1 Unit Tests

| Module | Test File | Coverage Target |
|--------|-----------|----------------|
| GoogleTokenService | `test_google_token_service.py` | Token refresh, expiry, error handling |
| GoogleContentExtractor | `test_google_content_extractor.py` | Each file type extraction |
| GoogleDriveMcpTools | `test_google_drive_mcp.py` | All MCP tools with mocked Drive API |
| FederatedSearch | `test_federated_search.ts` | Merge, dedup, ranking logic |
| GoogleDriveRouter | `test_google_drive_router.ts` | All tRPC endpoints |

### 13.2 Integration Tests

| Scenario | Test |
|----------|------|
| OAuth flow end-to-end | Mock Google OAuth, verify token storage |
| Edit flow | Mock Drive upload/export, verify version created |
| Sync flow | Mock Changes API, verify index jobs created |
| Federated search | Mock both local and Drive results, verify merged output |
| Disconnect cleanup | Verify all user data deleted |

### 13.3 Manual Testing Checklist

- [ ] Connect Google account in Settings
- [ ] See indexed Drive files in search results
- [ ] Edit a .docx file via Google Docs, save back
- [ ] Edit a .xlsx file via Google Sheets, save back
- [ ] Ask AI to search Google Drive files in chat
- [ ] Ask AI to read a Drive file and summarize it
- [ ] Disconnect Google, verify all data cleaned up
- [ ] Reconnect and verify fresh sync works
- [ ] Select specific folders, verify only selected folders are indexed

---

## 14. Rollout Plan

### Phase 1: Foundation (Week 1)

| Task | Files | Effort |
|------|-------|--------|
| Per-user Google OAuth in Settings | `Settings.tsx`, `googleDrive.ts` (router), `oauth.py` (extend scopes) | 2 days |
| Token refresh service | `google_token_service.py` | 0.5 day |
| Connection status + disconnect | Frontend + backend | 0.5 day |

### Phase 2: Editing (Week 2)

| Task | Files | Effort |
|------|-------|--------|
| Google Drive Service (upload/export) | `google_drive_service.py` | 1 day |
| Edit session management | `google_drive_edit_sessions` table, router endpoints | 1 day |
| "Edit in Google" UI | `DocumentPreviewPanel.tsx`, `ExcelViewer.tsx` | 1 day |
| Save-back + versioning | Integration with existing version system | 0.5 day |

### Phase 3: MCP Server (Week 3)

| Task | Files | Effort |
|------|-------|--------|
| Google Drive MCP tools | `google_drive_mcp.py` | 1.5 days |
| MCP gateway registration | `mcpRoutes.ts` extension | 0.5 day |
| Chat tool calling integration | `chatService.ts`, `llmRoutesHandler.ts` | 1.5 days |

### Phase 4: RAG & Search (Week 4)

| Task | Files | Effort |
|------|-------|--------|
| Virtual document references | `libraryService.ts` extension | 1 day |
| Content extraction pipeline | `google_content_extractor.py` | 1.5 days |
| Indexing job integration | `library_indexing_service.py` extension | 1 day |
| Federated search | `federatedSearch.ts` | 1 day |
| Search UI integration | `DocumentManagement.tsx` | 0.5 day |

### Phase 5: Sync & Polish (Week 5)

| Task | Files | Effort |
|------|-------|--------|
| Webhook handler | `webhooks.ts` | 1 day |
| Channel management + renewal | Celery task | 0.5 day |
| Folder selection UI | Settings dialog | 1 day |
| Sync status dashboard | Settings UI | 0.5 day |
| Testing + bug fixes | Test files | 2 days |

**Total estimate: ~5 weeks** (1 developer, sequential)
**With parallelization: ~3 weeks** (backend + frontend in parallel)

---

## 15. Appendix

### 15.1 Google OAuth Scopes Reference

| Scope | Access Level | Verification |
|-------|-------------|-------------|
| `openid` | User ID | None |
| `email` | Email address | None |
| `profile` | Name, picture | None |
| `drive.file` | Files created/opened by app | Basic |
| `drive.readonly` | All files (read-only) | Restricted (security audit) |
| `drive.metadata.readonly` | File metadata only | Restricted |
| `documents.readonly` | Google Docs content | Sensitive |
| `spreadsheets.readonly` | Google Sheets content | Sensitive |

### 15.2 Google Drive API Rate Limits

| Limit | Value |
|-------|-------|
| Queries per minute (per project) | 12,000 |
| Queries per minute (per user) | 12,000 |
| Daily upload | 750 GB (rolling 24h) |
| Max file size | 5 TB |
| Export size limit | 10 MB |

### 15.3 File Type to Google Workspace Mapping

| Upload Format | Converts To | Export Back As |
|--------------|-------------|---------------|
| .docx, .doc, .odt, .rtf, .txt, .html | Google Docs | .docx |
| .xlsx, .xls, .ods, .csv, .tsv | Google Sheets | .xlsx |
| .pptx, .ppt, .odp | Google Slides | .pptx |
| .pdf, .jpg, .png (with OCR) | Google Docs | .pdf |

### 15.4 Existing Infrastructure Reuse Map

| Existing Component | Reused In | How |
|-------------------|-----------|-----|
| `OAuthConnection` model (Python) | Phase 1 | Token storage for Drive scopes |
| `oauth_service.py` | Phase 1 | Token exchange, linking, unlinking |
| `crypto.ts` / `smartspecweb_crypto.py` | Phase 1 | Token encryption/decryption |
| `library_items` table | Phase 4 | Virtual references (`source: "google_drive"`) |
| `library_chunks` table | Phase 4 | Store extracted text chunks |
| `library_index_jobs` table | Phase 4 | Indexing job queue |
| `embeddingService.py` | Phase 4 | Generate embeddings for Drive content |
| ChromaDB / pgvector | Phase 4 | Store Drive content vectors |
| `mcpRoutes.ts` gateway | Phase 3 | Register Drive MCP tools |
| `mcp_adapter.py` | Phase 3 | Bridge MCP tools to orchestrator |
| `skillDetector.ts` / `skillExecutor.ts` | Phase 3 | Detect/execute Drive-related intents |
| `relevanceScorer.ts` | Phase 4 | Score Drive results in federated search |
| `libraryService.ts` search | Phase 4 | Merge local + Drive results |
| Telegram linking UI pattern | Phase 1 | Template for "Connect Google" UI |
| `library_content_versions` | Phase 2 | Version old file before save-back |

### 15.5 MCP Tool Design Principles (Applied)

Following the MCP Best Practice Guide (November 2025 specification):

1. **Single responsibility:** One MCP server focused on Google Drive only
2. **Least privilege:** All tools are read-only by default; write operations require explicit user action
3. **Bounded capability:** 5 focused tools (search, read, read_sheet, list, info) — not a monolithic "do everything" tool
4. **Stateless execution:** Each tool call is independent; no session state between calls
5. **Explicit side effects:** Tool descriptions clearly state they are read-only
6. **Error taxonomy:** Specific error types (NotConnected, TokenExpired, FileNotFound, PermissionDenied)
7. **Rate limiting:** Per-user, per-tool limits prevent abuse
8. **Audit logging:** Every tool invocation logged with traceId

### 15.6 Security Checklist

- [ ] OAuth tokens encrypted at rest (AES-256-GCM)
- [ ] PKCE used for authorization code flow (RFC 9700)
- [ ] State parameter validated (CSRF protection)
- [ ] Redirect URI exactly matches registered URI
- [ ] Token refresh handles rotation (new refresh token may be issued)
- [ ] 401/invalid_grant errors prompt re-authentication (not retry)
- [ ] Disconnect revokes token at Google AND deletes local data
- [ ] Per-user rate limits on all Drive API operations
- [ ] Audit log for every Drive API call
- [ ] No sensitive data in URL parameters (tokens in headers only)
- [ ] Webhook validation via channel token
- [ ] HTTPS required for webhook endpoint
- [ ] Virtual references don't expose Drive file content to unauthorized users
