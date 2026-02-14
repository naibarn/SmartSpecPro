# Synthesized Specification: Google Drive & Google Workspace Integration

## Overview

Integrate Google Drive and Google Workspace APIs into SmartSpecPro to enable per-user Google OAuth, document editing via Google Docs/Sheets, MCP-based AI tools for Drive operations, RAG indexing of Drive content, federated search, incremental sync with webhooks, and unified credit billing for all operations.

## Scope

All 5 phases are in scope:
1. **Phase 1:** Per-User Google OAuth in Settings
2. **Phase 2:** Word/Excel Editing via Google Docs/Sheets
3. **Phase 3:** MCP Server for Google Drive & Apps
4. **Phase 4:** RAG Integration & Federated Search
5. **Phase 5:** Incremental Sync, Webhooks & Unified Credit Billing

Additionally, **fix existing billing gaps** (upload indexing, RAG queries not being charged) alongside new Drive billing.

## Key Requirements (from spec + interview)

### Authentication & Configuration
- Per-user Google OAuth tokens (not service account)
- Incremental consent: basic `openid email profile` on login, additional Drive scopes on "Connect Google Drive"
- OAuth scopes: `drive.readonly`, `drive.file`, `documents.readonly`, `spreadsheets.readonly`
- Google Client ID/Secret configured via **Admin Settings UI** (like SMTP/Stripe), stored encrypted in `system_settings`
- Google Cloud Project needs to be created (not yet existing)
- Token refresh 5 minutes before expiry; handle `invalid_grant` by showing "Connection expired" + Reconnect button

### Document Editing (Phase 2)
- "Edit in Google Docs/Sheets" button on Office/Excel files in DocumentPreviewPanel
- Flow: download from S3/R2 → upload to user's Drive (convert=true) → open in Google → user edits → user clicks "Save back" manually → export from Drive → upload to S3/R2 → create version → delete Drive temp → re-index
- Status bar shows edit state with [Save back] / [Discard] / [Open again] buttons
- No auto-polling; purely user-initiated save-back

### MCP Server (Phase 3)
- Deploy within existing Python FastAPI backend (no separate process)
- Tools: `search_drive_files`, `read_drive_file`, `read_sheet_data`, `list_drive_folder`, `get_drive_file_info`
- Resources: `gdrive://files/{file_id}`, `gdrive://files/{file_id}/metadata`
- Auth context injected via middleware (JWT → user_id + tenant_id)
- Use `ToolError` for expected errors, `mask_error_details=True` in production
- Register tools in existing MCP HTTP gateway at `/api/mcp/*`

### RAG & Federated Search (Phase 4)
- Virtual document references (no file duplication; files stay in Drive)
- Content extraction via Google Docs/Sheets/Slides structured APIs
- Chunking: semantic/structure-aware (headings for docs, rows for sheets, per-slide for presentations)
- Vector DB: same as library (currently ChromaDB/pgvector), must be flexible to support any Admin-configured vector DB backend
- Federated search: merged view (ranked by relevance with [Library]/[Google Drive] badges) + filter tabs (All | Library | Google Drive)
- Deduplication by canonical ID (driveFileId) first, then content hash

### Incremental Sync (Phase 5)
- Google Drive Changes API with webhook channels (max 7-day TTL, auto-renew at ~5.6 days)
- 4 indexing modes: none, selected_folders, all_except, all
- Folder picker UI with file type filter and size guard
- Initial sync: progress bar ("Syncing: 234/1,000 files") + non-blocking (user can work during sync)
- Scale: 50-200 users, ~1,000 files/user → ~200K files total, ~1-10M vectors

### Unified Credit Billing
- **Fix existing gaps:**
  - A1/A2: Upload indexing → `ceil(chunk_count) × 2` credits
  - B1/B2: RAG semantic search → 1 credit flat per query
- **New Drive billing:**
  - C1/C2: Drive indexing → same formula as upload indexing
  - C4: MCP read_drive_file → `ceil(text_length / 2000)`, max 5 credits
  - C5: MCP read_sheet_data → `ceil(cells / 500)`, max 3 credits
- Pricing: 1 credit = $0.001 USD, 2 credits/chunk (~$0.002)
- Pre-flight cost estimation UI for large uploads/syncs
- Monthly budget caps with tiered alerts (80% default threshold)
- Idempotent charging with idempotency keys
- Post-deduct pattern (charge after successful indexing, refund on failure)
- All transactions tagged with service tags for dashboard filtering

### Error Handling
- Token revoked/expired → show "Connection expired" status + "Reconnect" button
- Pause sync/webhooks until reconnection; DO NOT delete virtual references or vectors
- Google API rate limiting: exponential backoff, internal per-user limits

### Database Changes
- New table: `google_drive_sync_state` (per user, stores page token, channel info, settings, budget tracking)
- New table: `google_drive_edit_sessions` (tracks active edit sessions)
- Extend existing tables: `library_items.source = "google_drive"`, `library_links.link_type = "google_drive_file"`, `library_index_jobs.job_type = "google_drive_sync"`

### Security
- Token storage: AES-256-GCM encrypted in `oauth_connections`
- User isolation: per-user OAuth tokens, per-tenant vector collections
- Disconnect cleanup: revoke tokens + delete virtual refs + delete chunks/embeddings
- Rate limiting: per-user limits on search (30/min), read (60/min), sync (5/min), edit (10/min)
- Note: `drive.readonly` requires Google restricted scope verification (4-6 weeks)

## Non-Goals
- Replacing local Document Library
- Real-time collaborative editing in-app
- Google Workspace admin features
- Shared/Team Drives (v1 = My Drive only)
- Google Calendar/Gmail integration

## Existing Infrastructure to Reuse
- OAuth flow (`python-backend/app/api/oauth.py`, `oauth_service.py`)
- Library service patterns (`libraryService.ts`, `libraryItems`, `libraryChunks`, `libraryIndexJobs`)
- MCP gateway (`/api/mcp/*`, `mcp_adapter.py`, `mcp_executor.py`)
- RAG pipeline (embedding service, chunking, vector store abstraction)
- Credit system (`creditTransactions`, `deductCredits()`)
- Storage abstraction (`storagePut/storageDelete`)
- Audit logging (`apiAuditEvents`, JSONL audit logs)
- System settings (Admin UI for encrypted config)
