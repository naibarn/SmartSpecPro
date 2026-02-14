# Implementation Plan: Google Drive & Google Workspace Integration

## 1. Problem Statement

SmartSpecPro users must manually upload every file into the Document Library before the AI can access it. Word/Excel files are read-only with no editing capability. Users with large Google Drive collections must duplicate data to use it within the platform. Additionally, several existing operations (file upload indexing, RAG queries) consume API resources but are not billed, creating revenue leaks.

This plan integrates Google Drive and Google Workspace APIs across 5 phases, adds document editing via Google Docs/Sheets, exposes Drive tools to the AI via MCP, enables RAG indexing of Drive content with federated search, implements incremental sync with webhooks, and establishes a unified credit billing model that fixes existing gaps and covers all new operations.

## 2. Architecture Overview

The integration spans three existing system layers with minimal new infrastructure:

**Frontend (React):** New Settings Integrations tab, Google Drive folder picker, edit session status bar, federated search UI with source badges and filter tabs, sync progress bar, credit estimation dialogs.

**Node.js Backend (tRPC/Express):** New `googleDriveRouter` for OAuth management and Drive operations, webhook handler for sync notifications, federated search service, credit billing extensions for indexing/RAG.

**Python Backend (FastAPI):** Extended OAuth service with Drive scopes, Google Drive MCP tools integrated into existing FastAPI process, content extraction service (Docs/Sheets/Slides APIs), Drive sync Celery tasks, token refresh service.

**Data Layer:** Two new PostgreSQL tables (`google_drive_sync_state`, `google_drive_edit_sessions`), extended metadata usage in existing `library_items`, `library_links`, `library_index_jobs` tables.

### System Flow

```
User → Settings "Connect Google" → Python OAuth (incremental consent) → Encrypted tokens in DB
User → "Edit in Google" → Node.js uploads to Drive → Google editor → User saves back → S3/R2 + re-index
AI Chat → MCP tool call → Python MCP tools → Google API (with user's token) → Response to LLM
Sync webhook → Node.js webhook handler → Celery index job → Content extraction → Embedding → Vector store
Search → Federated query (local DB + vector + Drive API) → RRF merge + dedup → Ranked results
```

## 3. Implementation Sections

### Section 1: Admin Configuration — Google OAuth App Settings

**Goal:** Allow admins to configure Google Cloud OAuth credentials via the existing Admin Settings UI, following the same pattern as SMTP/Stripe configuration.

**What to build:**
- Add "Google OAuth" category to `system_settings` with keys: `googleClientId`, `googleClientSecret`, `googleRedirectUri`. Store `googleClientSecret` with `isSensitive: true` (auto-encrypted).
- Extend `apps/web/server/routers/systemSettings.ts` with a mutation for saving Google OAuth config.
- Add a "Google Drive" section to `AdminSettings.tsx` with fields for Client ID, Client Secret, and Redirect URI. Include a "Test Connection" button that validates the credentials.
- Extend `python-backend/app/core/oauth_config.py` to load Google OAuth config from the database (via internal API or direct DB access) alongside the existing env-var path, with DB taking precedence.

**Key decisions:**
- Credentials stored encrypted in `system_settings` (same pattern as SMTP).
- Python backend reads these dynamically — no restart required when config changes.
- Redirect URI should default to `https://smartaihub.app/auth/callback/google` but be configurable.

---

### Section 2: Per-User Google OAuth — Incremental Consent

**Goal:** Allow each user to connect their Google account with Drive scopes via the Settings page, using incremental consent to avoid re-requesting basic login scopes.

**What to build:**
- Extend `python-backend/app/api/oauth.py` to support a new endpoint for Drive-scoped authorization. This endpoint builds an OAuth URL with the additional scopes (`drive.readonly`, `drive.file`, `documents.readonly`, `spreadsheets.readonly`) and `include_granted_scopes=true` for incremental consent.
- Create `python-backend/app/services/google_token_service.py` with `GoogleTokenService` class providing `get_valid_access_token(user_id)` that handles auto-refresh (5 minutes before expiry) and `invalid_grant` detection.
- Create `apps/web/server/routers/googleDrive.ts` with tRPC procedures: `getConnectionStatus`, `getAuthUrl`, `completeOAuth`, `disconnect`. These proxy to the Python backend.
- Add "Integrations" tab to `Settings.tsx` with a "Google Drive & Workspace" card showing connection status, scopes, sync stats, and Connect/Disconnect buttons.

**OAuth flow (user perspective):**
1. User clicks "Connect Google Drive" in Settings
2. Popup opens Google OAuth consent screen with Drive scopes
3. User approves → redirected to callback
4. Backend exchanges code for tokens → stores encrypted
5. Popup closes → Settings page updates to "Connected"
6. Background: initial sync assessment begins

**Error handling:**
- `invalid_grant` on refresh → set connection status to "expired", show banner with "Reconnect" button
- Pause sync/webhooks but preserve existing virtual references and vectors

---

### Section 3: Database Schema — New Tables and Extensions

**Goal:** Create the database schema needed for Drive sync state and edit sessions, extend existing tables, and add missing columns/constraints to support the integration.

**IMPORTANT — `tenantId` type:** All new tables MUST use `varchar("tenant_id", { length: 36 })` to match the library tables pattern. The `tenants.id` PK is `varchar(36)`, NOT integer. Using integer will cause FK failures.

**What to build:**

**New Drizzle tables:**
- `google_drive_sync_state`: stores per-user sync configuration (indexing mode, folder selections, file type filters, size guards), webhook channel tracking (channel_id, resource_id, expiry, channel_token), Changes API page token. Columns: `tenant_id varchar(36)`, `user_id integer`, `indexing_mode enum(none/selected_folders/all_except/all)`, `folder_selections jsonb`, `file_type_filter jsonb`, `max_file_size_bytes integer`, `channel_id varchar(128)`, `resource_id varchar(128)`, `channel_token varchar(64)`, `channel_expiry timestamp`, `page_token text`, `files_total integer`, `files_processed integer`, `last_sync_at timestamp`, `last_error text`, `auto_sync_enabled boolean default true`. Unique constraint on `(tenant_id, user_id)`.
- `google_drive_edit_sessions`: tracks active edit sessions linking library items to temporary Drive files. Columns: `tenant_id varchar(36)`, `user_id integer`, `library_item_id integer`, `drive_file_id varchar(128)`, `edit_url text`, `original_source_url text`, `status enum(active/saved_back/discarded/expired)`, `expires_at timestamp`, `created_at timestamp`, `updated_at timestamp`.
- `user_credit_budgets`: per-user monthly budget tracking (applies to ALL credit operations, not just Drive). Columns: `tenant_id varchar(36)`, `user_id integer`, `monthly_limit integer`, `credits_used_this_month integer default 0`, `budget_month_key varchar(7)` (format: "YYYY-MM"), `alert_threshold_pct integer default 80`, `alert_sent boolean default false`, `hard_cap_reached boolean default false`. Unique constraint on `(tenant_id, user_id)`.

**Existing Drizzle table modifications:**
- `library_links`: add `tenant_id varchar(36)` column. Change unique index from `(linkType, linkId)` to `(linkType, linkId, tenant_id)` to allow per-tenant dedup (multiple tenants can reference the same Drive file, but within a tenant it's unique).
- `credit_transactions`: add `idempotency_key varchar(256)` nullable column with a unique index on `(idempotency_key)` where not null. This enables idempotent charging for indexing, sync, and MCP operations.

**Python/Alembic migration (oauth_connections):**
- Add `status varchar(20)` column (values: `active`, `expired`, `revoked`) with default `active`.
- Add `scopes text` column to store granted OAuth scopes as comma-separated string.
- Add `tenant_id varchar(36)` column (nullable, for multi-tenant isolation).
- Add unique constraint on `(user_id, provider)` to prevent duplicate connections.
- Add upsert logic to OAuth callback handler for reconnection without duplicates.

**Run migrations immediately after schema changes (Drizzle + Alembic).**

**Existing table extensions (metadata only, no schema changes needed):**
- `library_items.source` → use value `"google_drive"` for virtual references
- `library_items.metadata` (JSON) → store driveFileId, driveMimeType, driveModifiedTime, contentHash, syncStatus
- `library_links.link_type` → use `"google_drive_file"` with `link_id = driveFileId`
- `library_index_jobs.jobType` → use `"google_drive_sync"`

---

### Section 4: Unified Credit Billing — Fix Gaps + New Operations

**Goal:** Implement credit billing for all operations that consume API resources, fixing existing revenue leaks and adding billing for new Drive operations.

**What to build:**

**Fix existing gaps:**
- Add credit charging after successful library upload indexing in `libraryService.ts`. When a `libraryIndexJob` completes, count chunks created and charge `ceil(chunk_count) × 2` credits with service tag `library.upload_index`.
- Add credit charging for markdown save + re-indexing with service tag `library.save_reindex`.
- Add credit charging for RAG semantic search in the embedding query path (Python backend). Charge 1 credit per semantic/hybrid query with service tag `rag.semantic_search`. BM25-only queries remain free.
- Add credit charging for RAG context retrieval in chat with service tag `rag.chat_context`.

**New Drive operations billing:**
- `gdrive.index` / `gdrive.reindex`: same formula as upload indexing (`ceil(chunk_count) × 2`)
- `gdrive.mcp_read`: `max(1, ceil(text_length / 2000))`, capped at 5 credits
- `gdrive.mcp_sheet`: `max(1, ceil(cells / 500))`, capped at 3 credits
- Free operations: `search_drive_files`, `list_drive_folder`, edit in Google, save-back, browse/metadata

**Billing infrastructure:**
- Idempotent charging: extend `deductCredits()` to accept optional `idempotencyKey` parameter. Use Redis dedup cache (24h TTL) as fast-path check + the `idempotency_key` unique index on `credit_transactions` (added in Section 3) as final safety net.
- Post-deduct pattern: charge after successful operation, refund on failure with `type: "refund"` transaction
- All transactions include `metadata.service` tag for dashboard filtering
- Pre-flight estimation function: `estimateIndexingCost(fileCount, totalSize)` → returns estimated credits

**Admin pricing config:**
- Add `"credit_pricing"` to `settingCategorySchema` enum in `systemSettings.ts` (currently only has: stripe, invoice, email, general, oauth, ai, telegram, vectordb).
- Store pricing parameters in `system_settings` under category `credit_pricing`: `costPerChunk`, `ragQueryCost`, `mcpReadMaxCost`, `showEstimationDialogAboveBytes`, etc.
- Admin can adjust pricing without code changes

---

### Section 5: Monthly Budget Protection

**Goal:** Implement per-user monthly credit budget caps with tiered alerts for ALL credit operations (not just Drive).

**What to build:**
- Budget state tracking via `user_credit_budgets` table (created in Section 3). This applies to ALL credit-consuming operations: library upload indexing, RAG queries, Drive indexing, MCP reads — not just Drive operations.
- After each credit deduction (any `deductCredits()` call with service tags library.*, rag.*, gdrive.*), increment `credits_used_this_month` and check budget:
  - Usage reaches alert threshold (default 80%) → in-app notification + Telegram (if connected)
  - Usage reaches 100% → stop auto-sync, block credit-consuming operations, show banner "Monthly budget reached. [Increase] [Override]"
  - New month (budget_month_key mismatch) → reset `credits_used_this_month` and clear alerts
- UI: budget configuration in Settings page (monthly limit, alert threshold). Applies to the user globally, visible in both Google Drive dashboard and general Settings.
- Pre-sync budget check: before starting a sync, estimate cost and check if it would exceed remaining budget. If so, queue as "pending approval" with notification.

---

### Section 6: Word/Excel Editing via Google Docs/Sheets

**Goal:** Enable editing of Word/Excel files through Google Docs/Sheets, with manual save-back to the library.

**What to build:**
- Add `openForEditing` mutation to `googleDriveRouter`: downloads file from S3/R2, uploads to user's Google Drive with `convert=true` (so Google converts .docx→Docs, .xlsx→Sheets), returns `editUrl` and creates `google_drive_edit_sessions` record.
- Add `saveBack` mutation: exports file from Google Drive in original format (.docx/.xlsx), uploads to S3/R2 with new key, creates content version (reuse Feature 009 version system), updates `library_items.source_url`, deletes temp Drive file, enqueues re-indexing job.
- Add `discardEditSession` mutation: deletes the temp Drive file, marks session as discarded.
- Frontend: add "Edit in Google Docs/Sheets" button to `DocumentPreviewPanel.tsx` for office/excel preview types (visible only when Google is connected).
- Status bar component: when an active edit session exists for the current file, show a bar with the session state and [Save back] / [Discard] / [Open again] buttons.
- Auto-expire stale edit sessions after 24 hours via a periodic Celery task. **Expiry safety:** before deleting a temp Drive file, check `files.get(fileId, fields='modifiedTime')` — if the file was modified within the last 2 hours, extend the session expiry by 24 hours instead of expiring it. Send the user an in-app notification 2 hours before expiry to give them a chance to save back.

**Conversion format mapping:**
- .docx → Google Docs → export as .docx
- .xlsx → Google Sheets → export as .xlsx
- .pptx → Google Slides → export as .pptx

---

### Section 7: Google Drive MCP Server

**Goal:** Expose Google Drive operations as MCP tools that the AI chat system can invoke for natural-language file interactions.

**What to build:**
- Create `python-backend/app/mcp/google_drive_mcp.py` with FastMCP tools:
  - `search_drive_files(query, file_type?, max_results?)` — searches user's Drive via Drive API v3
  - `read_drive_file(file_id)` — extracts text content using content extractor (see Section 9)
  - `read_sheet_data(file_id, sheet_name?, cell_range?)` — reads structured spreadsheet data
  - `list_drive_folder(folder_id?)` — lists files in a Drive folder
  - `get_drive_file_info(file_id)` — returns file metadata
- Resource endpoints: `gdrive://files/{file_id}` for direct content access
- Auth injection: tools receive `user_id` from request context (injected by existing MCP gateway auth). Use `GoogleTokenService` to get valid access token.
- Error handling: `ToolError` for expected errors (file not found, permission denied, token expired). `mask_error_details=True` in production.
- Register tools in existing MCP tool registry (extend `mcpRoutes.ts` and Python `mcp_adapter.py`).
- Credit billing: `read_drive_file` charges `gdrive.mcp_read` credits, `read_sheet_data` charges `gdrive.mcp_sheet` credits. Search/list are free.

**MCP tool integration architecture:**

The existing MCP flow is: Node.js chat → `mcp_adapter.py` (Python HTTP client) → Node.js `mcpRoutes.ts` (file-based tools). The Drive MCP tools are Python-native (they call Google APIs directly), so the integration flow is different:

```
Node.js chat system
  → LLM returns tool_use for "search_drive_files"
  → Node.js calls Python backend via HTTP (POST /api/internal/mcp/tools/call)
  → Python FastAPI routes to google_drive_mcp.py handler (same process, no subprocess)
  → Handler gets user_id from JWT auth context
  → Handler calls GoogleTokenService.get_valid_access_token(user_id)
  → Handler calls Google Drive API
  → Returns result to Node.js → injected into LLM context
```

- Register Drive tools in Python FastAPI as internal API endpoints (alongside existing `/api/mcp/*` proxy routes).
- Extend Node.js `mcpRoutes.ts` tool discovery to also query Python backend for its native tools, merging both tool lists for the LLM.
- Auth context propagated via the existing internal API JWT (Node.js → Python) which already carries `user_id` and `tenant_id`.

**Chat system integration:**
- Extend `buildChatContext()` to include Google Drive MCP tools when user has Google connected.
- When LLM responds with `tool_use` for a Drive tool, execute via the Python backend internal API and return results.

---

### Section 8: Content Extraction Service

**Goal:** Extract text content from Google Drive files for RAG indexing and MCP reads, using Google's structured APIs for best quality.

**What to build:**
- Create `python-backend/app/services/google_content_extractor.py` with `GoogleContentExtractor` class:
  - `extract(file_id, mime_type, access_token) → str`
  - Google Docs: use Docs API (`documents.get`) to extract body content with heading structure preserved as markdown
  - Google Sheets: use Sheets API (`spreadsheets.get`) to extract all sheets as CSV-like text with headers
  - Google Slides: use Slides API (`presentations.get`) to extract per-slide text + speaker notes
  - PDFs: export as text/plain via Drive API export
  - Binary formats (.docx, .xlsx not already in Google format): export as text/plain
  - Plain text files: direct download
- Structure-aware chunking: split Docs by headings, Sheets by row groups with column headers, Slides per slide. Use 200-500 token chunks with 50-100 token overlap. Note: the existing library RAG pipeline uses 500 char/80 char overlap — Drive content uses different parameters because Google structured APIs provide better semantic boundaries (heading-based splits). The vector store handles mixed chunk sizes fine since embeddings are dimension-normalized.
- Metadata preserved per chunk: file_id, file_name, source ("google_drive"), last_modified, heading hierarchy, sheet name, slide number.

**Google API client library:** Use `google-api-python-client` + `google-auth` + `google-auth-httplib2` for all Google API interactions (Drive, Docs, Sheets, Slides). These provide automatic retry, pagination handling, and type-safe request building, significantly reducing implementation effort vs. raw HTTP.

**Size guards (defaults):** Max file size for extraction: 50MB. Max sheet cells: 500,000. Extraction timeout: 60 seconds per file. For large Sheets, use pagination (fetch 10,000 rows at a time).

---

### Section 9: Virtual Document References & Indexing

**Goal:** Create virtual references in the library for Google Drive files and index their content for RAG without duplicating files.

**What to build:**
- Extend `libraryService.ts` with `createVirtualDriveReference(driveFile, actor)`:
  - Creates `library_items` record with `source: "google_drive"`, `sourceUrl: null`, and Drive metadata in JSON column
  - Creates `library_links` record with `link_type: "google_drive_file"`, `link_id: driveFileId`, `tenant_id: actor.tenantId`
  - Uses dedup via `library_links` unique index `(linkType, linkId, tenant_id)` to prevent duplicate references for the same Drive file within a tenant. Multiple tenants can independently reference the same Drive file.
- Create `processGoogleDriveIndexJob` in Python backend:
  1. Get user's valid access token via `GoogleTokenService`
  2. Fetch file metadata from Drive API
  3. Check content hash — skip if unchanged (no re-charge)
  4. Extract text content via `GoogleContentExtractor`
  5. Chunk with structure-aware strategy
  6. Generate embeddings via existing embedding service
  7. Upsert to vector store (same store as library, using Admin-configured backend)
  8. Upsert `library_chunks` in PostgreSQL
  9. Update `library_items` metadata (contentHash, lastSyncedAt, syncStatus)
  10. Charge credits (post-deduct, with refund on failure)
- Vector IDs: format `gdrive:{tenantId}:{driveFileId}:{chunkIndex}` for deduplication
- Metadata per vector: `source: "google_drive"`, `drive_file_id`, `tenant_id`, `user_id` for filtering

---

### Section 10: Federated Search

**Goal:** Unify local library search and Google Drive search into a single search experience with merged ranking and source filtering.

**What to build:**
- Create `apps/web/server/services/federatedSearch.ts`:
  - Execute three search backends in parallel: local DB (keyword), vector store (semantic), Google Drive API (real-time)
  - Normalize results to common format: `{ id, title, source, score, metadata, preview }`
  - Deduplication: first by canonical ID (driveFileId matching library_links), then by content hash for cross-source matches
  - Merge via Reciprocal Rank Fusion (RRF) with k=60
  - Return merged results with source badges
- Frontend in `DocumentManagement.tsx`:
  - Add "Include Google Drive" checkbox (default on when connected)
  - Display merged results with [Library] / [Google Drive] badges
  - Add filter tabs: All | Library | Google Drive
  - Google Drive results show "Open in Google" button instead of preview
  - Virtual references (indexed Drive files) show both source and indexed status
- tRPC procedure: `library.federatedSearch(query, includeGoogleDrive, limit)` that delegates to the federated search service

**Latency and timeout strategy:**
- Per-leg timeouts: local DB 2s, vector store 3s, Google Drive API 3s.
- Graceful degradation: return local results immediately. If the Drive API leg fails or times out, return results with a `driveResultsStatus: "timeout" | "error" | "unavailable"` flag so the frontend can show "Some Drive results may be missing" instead of failing the entire search.
- If user's Google connection is expired, skip the Drive API leg entirely and note `driveResultsStatus: "disconnected"`.

---

### Section 11: Incremental Sync & Webhooks

**Goal:** Keep the Google Drive index fresh using the Changes API with webhook notifications, supporting user-configurable indexing modes.

**What to build:**

**Initial Sync:**
- When user first connects or clicks "Sync Now": list all files matching sync settings (indexing mode, folder filter, file type filter, size guard), create virtual references, enqueue indexing jobs.
- Progress tracking: store sync progress in `google_drive_sync_state` (files_total, files_processed), expose via `getSyncStatus` tRPC query, poll from frontend to show progress bar.
- Non-blocking: sync runs as a Celery task chain, user can continue using the app.

**Webhook Setup:**
- After initial sync: call `changes.watch()` to create a webhook channel pointing to `https://smartaihub.app/api/webhooks/gdrive`. Generate a cryptographically random channel token (32 bytes hex via `crypto.randomBytes(32).toString('hex')`) and store it in `google_drive_sync_state.channel_token`.
- Store channel_id, resource_id, channel_token, expiry in `google_drive_sync_state`.
- Register the webhook Express route in `apps/web/server/_core/index.ts` (NOT a tRPC procedure — Google sends raw POST requests).
- Webhook handler in `apps/web/server/routes/webhooks.ts`:
  1. Validate the triple: `X-Goog-Channel-ID` + `X-Goog-Resource-ID` + `X-Goog-Channel-Token` must all match a stored `google_drive_sync_state` record. Reject with 403 if any mismatch.
  2. Return 200 immediately (Google requires response within a few seconds).
  3. Enqueue a Celery task to fetch changes via Changes API and process them (non-blocking).
  4. The Celery task fetches changes, enqueues index jobs for changed files, marks removed files.
- **Nginx:** Add proxy rule for `/api/webhooks/gdrive` in `nginx/conf.d/dev-host.conf` to route to Node.js backend (same as other `/api/*` routes).

**Channel Renewal:**
- Celery periodic task (`renew_drive_watch_channels`): every 6 hours, check for channels expiring within 24 hours and renew them (stop old → create new).

**File Inclusion Logic:**
- `should_index_file(file, settings)`: checks indexing mode, file type filter, size guard, folder inclusion/exclusion.
- For `selected_folders` and `all_except` modes: traverse parent chain using cached folder hierarchy.

**Sync Settings UI:**
- Settings panel in Integrations tab: indexing mode radio buttons, folder picker (tree view with checkboxes), file type filter checkboxes, max file size dropdown, auto-sync toggle.
- "Estimate Cost" button: counts matching files and shows estimated credit cost before starting sync.
- "Sync Now" button: triggers manual sync.

---

### Section 12: Settings UI — Google Drive Dashboard

**Goal:** Provide a comprehensive Google Drive management interface within the Settings Integrations tab.

**What to build:**
- **Overview panel:** Connection status, email, scopes, last sync time, indexed file count, storage used.
- **Files panel:** List of indexed Drive files with sync status, last indexed time, chunk count. Search/filter within indexed files. "Re-index" and "Remove from index" actions.
- **Credit Usage panel:** Monthly usage breakdown by category (indexing, RAG, MCP reads). Budget meter with progress bar. Usage history chart (last 30 days). Current pricing display.
- **Pricing Info panel:** Display current credit pricing table (categories A-F from spec). Show cost examples for common operations.
- **Folder picker dialog:** Tree view of Google Drive folders. Checkboxes for inclusion/exclusion based on indexing mode. Lazy-loading of subfolders via Drive API.

---

### Section 13: Rate Limiting & Error Handling

**Goal:** Implement rate limiting for Google API calls and robust error handling for all Drive operations.

**What to build:**
- Internal rate limits (per-user, enforced at Node.js router level):
  - Search: 30/min, Read: 60/min, Sync: 5/min, Edit: 10/min
- Google API rate limit handling: exponential backoff with jitter (1s → 2s → 4s... cap 32s) on 429/503 responses.
- Token error handling: detect `invalid_grant`, update connection status to "expired", notify user via in-app banner.
- Sync error handling: individual file failures don't stop the sync; log error, skip file, continue. Record errors in `google_drive_sync_state.last_error`. After sync: report summary (X succeeded, Y failed, Z skipped).
- Webhook failure handling: if webhook delivery fails repeatedly, fall back to periodic polling (every 15 minutes).
- Audit logging: all Google API calls logged to JSONL audit with traceId, userId, operation type, latency.

---

### Section 14: Disconnect & Cleanup

**Goal:** Implement complete cleanup when a user disconnects their Google account.

**What to build:**
- `disconnect` mutation flow (order matters — Drive API calls must happen before token revocation):
  1. Cleanup temp Drive files from active edit sessions (requires valid token to call `files.delete()` on Google Drive)
  2. Stop webhook channel (`channels.stop`) (requires valid token)
  3. Revoke access token at Google (`POST https://oauth2.googleapis.com/revoke`) — NOW safe to revoke
  4. Delete all `google_drive_edit_sessions` for this user
  5. Delete all `library_items` with `source: "google_drive"` for this user
  6. Delete corresponding `library_chunks` records
  7. Delete vectors from vector store (by user_id + source metadata filter)
  8. Delete `library_links` with `link_type: "google_drive_file"` for this user
  9. Delete `google_drive_sync_state` record
  10. Delete `oauth_connections` record for Google provider
  11. Reset `user_credit_budgets` record (or leave for audit — just clear the Drive-related tracking)
- Confirmation dialog: "Disconnecting will remove all indexed Google Drive content from search. Your files in Google Drive are not affected."
- Cleanup runs as a background job to avoid timeout.

---

### Section 15: Security Hardening

**Goal:** Ensure all security requirements are met across the integration.

**What to build:**
- Token encryption validation: verify that all OAuth tokens stored in `oauth_connections` are encrypted with AES-256-GCM.
- Scope verification: verify that access tokens have required scopes before making API calls. Handle scope changes gracefully.
- Input validation: all tRPC inputs validated with Zod schemas. All Python inputs validated with Pydantic models.
- Tenant isolation: every Drive operation verifies `tenantId` matches the authenticated user's tenant. Vector queries always filter by `tenant_id`.
- CSRF protection: webhook endpoint validates `x-goog-channel-token` against stored channel token.
- Content sanitization: text extracted from Google Drive files is sanitized before storage (strip potentially harmful content).
- Audit trail: every sensitive operation (connect, disconnect, token refresh, data access) logged with traceId.

**Google Verification Note & Phased Deployment:**
- The `drive.readonly` scope requires restricted scope verification with a third-party security assessment (4-6 weeks).
- **Phase 1 (Sections 1-6)** can ship with `drive.file` scope only — this supports OAuth connection, editing via Google Docs/Sheets, admin config, credit billing, and budget protection. These features only access files that the app creates (temp edit files).
- **Phases 3-5 (Sections 7, 9, 10, 11)** are BLOCKED until `drive.readonly` is approved. Without it: `search_drive_files` returns nothing useful, `list_drive_folder` sees only app-created files, and incremental sync cannot scan existing Drive files.
- **Implementation recommendation:** Build all sections, but gate Sections 7/9/10/11 behind a `driveReadonlyScopeApproved` flag in system_settings. When verification completes, Admin flips the flag to enable full Drive integration without code deployment.

## 4. Implementation Order

The sections should be implemented in dependency order:

1. **Section 1** (Admin Config) — no dependencies, enables everything
2. **Section 3** (Database Schema) — needed by all subsequent sections
3. **Section 2** (OAuth) — depends on 1, 3
4. **Section 4** (Credit Billing) — depends on 3; can parallel with Section 2
5. **Section 5** (Budget Protection) — depends on 4
6. **Section 8** (Content Extraction) — depends on 2 (needs tokens)
7. **Section 6** (Edit in Google) — depends on 2, 3
8. **Section 9** (Virtual References & Indexing) — depends on 4, 8
9. **Section 7** (MCP Server) — depends on 2, 8
10. **Section 10** (Federated Search) — depends on 9
11. **Section 11** (Sync & Webhooks) — depends on 9
12. **Section 12** (Dashboard UI) — depends on 2, 4, 5
13. **Section 13** (Rate Limiting) — can be built throughout, finalized after all sections
14. **Section 14** (Disconnect) — depends on 9, 11
15. **Section 15** (Security) — cross-cutting, finalized last

## 5. Affected Files

### New Files
```
apps/web/server/routers/googleDrive.ts          # tRPC router
apps/web/server/services/federatedSearch.ts      # Federated search service
apps/web/server/routes/webhooks.ts               # Webhook handler (if not extending existing)
apps/web/client/src/components/settings/GoogleDrivePanel.tsx  # Settings UI
apps/web/client/src/components/settings/FolderPicker.tsx      # Folder picker dialog
apps/web/client/src/components/settings/SyncProgressBar.tsx   # Sync progress
apps/web/client/src/components/library/EditInGoogleBar.tsx    # Edit session status bar
python-backend/app/services/google_token_service.py           # Token management
python-backend/app/services/google_content_extractor.py       # Content extraction
python-backend/app/mcp/google_drive_mcp.py                    # MCP tools
python-backend/app/tasks/google_drive_tasks.py                # Celery tasks (sync, cleanup)
```

### Modified Files
```
apps/web/drizzle/schema.ts                      # New tables + library_links tenant_id + credit_transactions idempotency_key
apps/web/server/_core/index.ts                   # Register googleDrive router + webhook Express route
apps/web/server/_core/mcpRoutes.ts               # Extend tool discovery to include Python-native tools
apps/web/server/routers/systemSettings.ts        # Google OAuth config + credit_pricing category
apps/web/server/routers/library.ts               # Federated search integration
apps/web/server/services/libraryService.ts       # Virtual references, billing hooks
apps/web/client/src/pages/AdminSettings.tsx      # Google OAuth config panel
apps/web/client/src/pages/Settings.tsx           # Integrations tab
apps/web/client/src/pages/DocumentManagement.tsx # Federated search UI
apps/web/client/src/components/library/DocumentPreviewPanel.tsx  # Edit in Google button
python-backend/app/api/oauth.py                  # Drive scope endpoint
python-backend/app/models/oauth.py               # Add status, scopes, tenant_id, unique constraint
python-backend/app/services/oauth_service.py     # Extended for Drive tokens + upsert logic
python-backend/app/core/oauth_config.py          # DB config loading
python-backend/app/tasks/media_tasks.py          # or new task file for Drive
python-backend/app/services/library_indexing_service.py  # Drive indexing job type
nginx/conf.d/dev-host.conf                       # Webhook URL proxy rule
```

## 6. Risk Assessment

| Risk | Impact | Mitigation |
|------|--------|------------|
| Google scope verification takes 4-6 weeks | Blocks Phases 3-5 (MCP, RAG, sync) | Ship Phase 1-2 (Sections 1-6) with `drive.file`; gate Sections 7/9/10/11 behind feature flag; enable after verification |
| Google API rate limits exceeded | Sync failures, degraded search | Exponential backoff, internal rate limits, batch requests |
| Large initial sync overwhelms system | Slow indexing, high credit costs | Pre-flight estimation, batch processing, per-user queuing |
| Token expiry during long sync | Partial sync, data inconsistency | Refresh token check before each batch, retry on auth errors |
| Vector store scaling (10M+ vectors) | Performance degradation | Tenant partitioning, index optimization, monitoring |
| Credit billing double-charge | User trust issues | Idempotency keys, Redis dedup, DB constraints |
| Drive webhook delivery failures | Stale index | Fallback to periodic polling, channel health monitoring |
