# Google Drive Scope Integration — Usage Guide

## Overview

The Google Drive Scope feature adds read-only Drive integration to SmartSpecPro, allowing users to connect their Google Drive, browse/search files, extract content for AI processing, and maintain synchronized virtual references in the library.

## Setup

### 1. Admin Configuration

Navigate to **Admin Settings > OAuth** and configure:

- **Google Client ID** — from Google Cloud Console
- **Google Client Secret** — encrypted at rest (AES-256-GCM)
- **Google Redirect URI** — must match the OAuth consent screen configuration
- **Drive Readonly Scope Approved** — toggle to enable/disable Drive features platform-wide

### 2. Database Migration

The feature adds these tables (auto-created via Drizzle):

| Table | Purpose |
|-------|---------|
| `oauth_connections` | Per-user OAuth tokens (encrypted at rest) |
| `google_drive_sync_state` | Incremental sync cursors and webhook channels |
| `credit_transactions` | Usage billing with idempotency keys |
| `monthly_budget_usage` | Per-user monthly budget tracking |

Run migration:
```bash
cd apps/web && pnpm db:push
```

### 3. Environment Variables

Required in both `apps/web/.env` and `python-backend/.env`:
```
LLM_ENCRYPTION_KEY=<shared-encryption-key>  # Must match between Node.js and Python
```

## User Flow

### Connecting Google Drive

1. User navigates to **Google Drive** section in the dashboard
2. Clicks **Connect Google Drive**
3. Completes OAuth consent with `drive.readonly` + `drive.file` scopes
4. Tokens are encrypted and stored in `oauth_connections`

### Browsing & Searching Files

**Dashboard UI** provides 4 tabs:
- **Browse** — folder tree navigation
- **Search** — full-text search across Drive files
- **Synced** — files with active virtual references
- **Activity** — sync history and status

**Federated Search** — Drive results appear alongside library results in the main search bar, merged via Reciprocal Rank Fusion (RRF).

### Content Extraction

Supported file types:
- Google Docs → plain text
- Google Sheets → CSV per sheet
- Google Slides → text per slide
- PDFs → text extraction
- Plain text files → direct read

Content is sanitized (script/iframe/embed tags stripped) before storage.

### Virtual References

When a Drive file is indexed:
1. Content is extracted and sanitized
2. A `library_item` with `source: 'google_drive'` is created
3. Content is chunked and embedded in the vector store
4. The item appears in the library alongside uploaded files

### Edit in Google

Users can open any Google Doc/Sheet/Slides in the native Google editor:
- Opens in a new browser tab
- Works regardless of the `driveReadonlyScopeApproved` flag
- Uses `drive.file` scope (always available)

### Incremental Sync

When enabled per-user:
1. A Google Drive webhook channel is registered
2. Google sends push notifications on file changes
3. The system processes changes incrementally (delta sync)
4. Webhook channels auto-renew before expiration

### Disconnecting

Users can disconnect Google Drive from the dashboard:
1. OAuth tokens are revoked with Google
2. All virtual references are removed from the library
3. Vector store entries are cleaned up
4. Webhook channels are stopped
5. `oauth_connections` record is deleted

## Architecture

### Node.js (apps/web)

| File | Purpose |
|------|---------|
| `server/routers/googleDrive.ts` | tRPC router — OAuth, browse, search, sync, disconnect |
| `server/routers/systemSettings.ts` | Admin settings mutations for OAuth config |
| `server/routes/webhooks.ts` | Express route for Google Drive push notifications |
| `server/services/federatedSearch.ts` | Federated search with Drive + library merge |
| `server/services/auditLogger.ts` | Audit trail for Drive operations |

### Python Backend (python-backend)

| File | Purpose |
|------|---------|
| `app/services/google_token_service.py` | Token management (encrypt/decrypt/refresh/revoke) |
| `app/services/google_content_extractor.py` | File content extraction from Drive API |
| `app/services/google_drive_content_sanitizer.py` | Content sanitization (XSS prevention) |
| `app/services/google_scope_guard.py` | Scope verification utilities |
| `app/services/library_indexing_service.py` | Virtual reference creation and vector indexing |
| `app/mcp/google_drive_mcp.py` | MCP tool server for AI-driven file access |
| `app/api/v1/oauth.py` | Internal OAuth token exchange endpoint |
| `app/core/smartspecweb_crypto.py` | AES-256-GCM encryption compatible with Node.js |

### Security

- **Token encryption:** AES-256-GCM at rest, decrypt only when needed
- **Input validation:** File IDs validated by regex, queries length-limited
- **Content sanitization:** Script/iframe/embed/event handler removal
- **Tenant isolation:** All queries scoped by userId/tenantId
- **Webhook CSRF:** Triple validation (channelId + resourceId + tokenHash) with timing-safe comparison
- **Audit trail:** 7 event types covering connect, disconnect, refresh, access, sync, webhook, edit
- **Feature flag:** `driveReadonlyScopeApproved` gates Drive features platform-wide
- **Rate limiting:** Drive API calls rate-limited with retry/backoff decorator

## API Endpoints

### tRPC Procedures (googleDrive router)

| Procedure | Type | Description |
|-----------|------|-------------|
| `getConnectionStatus` | query | Check if user has active Drive connection |
| `startOAuth` | mutation | Generate OAuth URL for consent flow |
| `completeOAuth` | mutation | Exchange auth code for tokens |
| `disconnect` | mutation | Revoke tokens and clean up |
| `listFiles` | query | Browse folder contents |
| `searchFiles` | query | Search Drive files by query |
| `getFileInfo` | query | Get metadata for a single file |
| `openForEditing` | mutation | Generate edit URL for Google editor |
| `startSync` | mutation | Enable incremental sync for user |
| `stopSync` | mutation | Disable sync and stop webhooks |
| `getSyncStatus` | query | Get current sync state |

### Webhook Endpoint

```
POST /api/webhooks/gdrive
```

Headers validated: `X-Goog-Channel-ID`, `X-Goog-Resource-ID`, `X-Goog-Channel-Token`

### MCP Tools

| Tool | Description |
|------|-------------|
| `drive_search` | Search Drive files by query |
| `drive_read` | Read file content by ID |
| `drive_sheet` | Read spreadsheet data |
| `drive_list` | List folder contents |
| `drive_info` | Get file metadata |
