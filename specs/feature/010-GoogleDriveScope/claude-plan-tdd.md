# TDD Plan: Google Drive & Google Workspace Integration

Companion document to `claude-plan.md`. Defines test stubs to write BEFORE implementing each section.

## Testing Infrastructure

**TypeScript (Vitest):** `apps/web/server/*.test.ts` — `describe` → `it` → `expect`, `vi.mock()` for dependencies, DB mocked via `vi.mock("../db")`.

**Python (pytest):** `python-backend/tests/test_*.py` — markers `@pytest.mark.unit`, `.integration`, `.auth`, `.credits`. 80% coverage enforced. Async with `@pytest.mark.asyncio`. Use `responses` or `httpx` mocking for external APIs.

**Google API mocking:** Use `responses` library (Python) to mock Google Drive/Docs/Sheets/Slides API HTTP calls. Create fixtures for common Google API responses (file metadata, content, error responses).

---

## Section 1: Admin Configuration — Google OAuth App Settings

### Vitest (systemSettings router)
```
# Test: saveGoogleOAuthConfig stores client_id, client_secret (encrypted), redirect_uri
# Test: saveGoogleOAuthConfig rejects non-admin users
# Test: getGoogleOAuthConfig returns masked client_secret for display
# Test: testGoogleConnection validates credentials format before calling Google
# Test: testGoogleConnection returns error for invalid credentials
```

### Vitest (AdminSettings UI)
```
# Test: GoogleOAuthConfigPanel renders form fields for client_id, client_secret, redirect_uri
# Test: GoogleOAuthConfigPanel shows "Saved" toast on successful save
# Test: GoogleOAuthConfigPanel shows "Test Connection" button and handles success/failure states
```

### pytest (oauth_config)
```
# Test: load_google_oauth_config reads from DB system_settings
# Test: load_google_oauth_config falls back to env vars when DB config missing
# Test: load_google_oauth_config DB config takes precedence over env vars
# Test: load_google_oauth_config decrypts sensitive values correctly
```

---

## Section 2: Per-User Google OAuth — Incremental Consent

### pytest (google_token_service)
```
# Test: get_valid_access_token returns cached token when not expired
# Test: get_valid_access_token refreshes token when within 5 minutes of expiry
# Test: get_valid_access_token raises InvalidGrantError on invalid_grant response
# Test: get_valid_access_token updates stored token after successful refresh
# Test: get_valid_access_token handles concurrent refresh requests (only one refresh)
# Test: build_drive_auth_url includes drive.readonly, drive.file, documents.readonly, spreadsheets.readonly scopes
# Test: build_drive_auth_url sets include_granted_scopes=true for incremental consent
# Test: build_drive_auth_url sets access_type=offline and prompt=consent
```

### Vitest (googleDrive router)
```
# Test: getConnectionStatus returns "not_connected" when no oauth_connection exists
# Test: getConnectionStatus returns "connected" with email and scopes when connected
# Test: getConnectionStatus returns "expired" when connection status is expired
# Test: getAuthUrl returns valid Google OAuth URL with correct scopes
# Test: completeOAuth exchanges code for tokens and stores encrypted
# Test: completeOAuth handles duplicate connection (upsert, not error)
# Test: disconnect calls Python backend and returns success
```

### Vitest (Settings UI)
```
# Test: IntegrationsTab renders Google Drive card with Connect button when not connected
# Test: IntegrationsTab shows Connected status with email when connected
# Test: IntegrationsTab shows "Connection expired" banner with Reconnect button when expired
# Test: Connect button opens popup with OAuth URL
```

---

## Section 3: Database Schema — New Tables and Extensions

### Vitest (schema validation)
```
# Test: google_drive_sync_state table has unique constraint on (tenant_id, user_id)
# Test: google_drive_sync_state.tenant_id is varchar(36) matching tenants.id type
# Test: google_drive_edit_sessions table has correct column types and defaults
# Test: user_credit_budgets table has unique constraint on (tenant_id, user_id)
# Test: library_links unique index is on (linkType, linkId, tenant_id) not (linkType, linkId)
# Test: credit_transactions has nullable idempotency_key with unique index
```

### pytest (Alembic migration)
```
# Test: oauth_connections migration adds status column with default 'active'
# Test: oauth_connections migration adds scopes column
# Test: oauth_connections migration adds unique constraint on (user_id, provider)
# Test: migration is reversible (downgrade works)
```

---

## Section 4: Unified Credit Billing — Fix Gaps + New Operations

### Vitest (credit billing)
```
# Test: deductCredits with idempotencyKey succeeds on first call
# Test: deductCredits with duplicate idempotencyKey is a no-op (returns original transaction)
# Test: deductCredits without idempotencyKey still works (backward compatible)
# Test: library upload index job charges ceil(chunk_count) * 2 credits on completion
# Test: library upload index job tags transaction with service="library.upload_index"
# Test: markdown save re-index charges credits with service="library.save_reindex"
```

### pytest (RAG billing)
```
# Test: semantic search charges 1 credit per query with service="rag.semantic_search"
# Test: BM25-only search does not charge credits
# Test: RAG chat context charges credits with service="rag.chat_context"
```

### pytest (Drive billing formulas)
```
# Test: gdrive.index charges ceil(chunk_count) * 2 credits
# Test: gdrive.mcp_read charges max(1, ceil(text_length / 2000)), capped at 5
# Test: gdrive.mcp_sheet charges max(1, ceil(cells / 500)), capped at 3
# Test: search_drive_files does not charge credits
# Test: list_drive_folder does not charge credits
# Test: post-deduct refund on failure creates refund transaction
```

### Vitest (system settings)
```
# Test: settingCategorySchema accepts "credit_pricing" as valid category
# Test: credit_pricing settings can be saved and retrieved by admin
```

---

## Section 5: Monthly Budget Protection

### Vitest (budget checking)
```
# Test: deductCredits increments user_credit_budgets.credits_used_this_month
# Test: deductCredits triggers alert notification at 80% threshold
# Test: deductCredits blocks operation at 100% budget (hard cap)
# Test: budget resets when budget_month_key changes (new month)
# Test: budget check works for non-Drive operations (library.upload_index)
```

### Vitest (budget UI)
```
# Test: BudgetPanel shows progress bar with current/limit
# Test: BudgetPanel shows alert state when threshold reached
# Test: budget configuration saves monthly_limit and alert_threshold_pct
```

---

## Section 6: Word/Excel Editing via Google Docs/Sheets

### Vitest (googleDrive router - edit)
```
# Test: openForEditing downloads file from S3 and uploads to Drive with convert=true
# Test: openForEditing creates edit session record with status="active" and expires_at
# Test: openForEditing returns editUrl for the Google document
# Test: openForEditing rejects if user not connected to Google
# Test: openForEditing rejects if active session already exists for this file
# Test: saveBack exports from Drive, uploads to S3, creates version, deletes temp Drive file
# Test: saveBack enqueues re-indexing job
# Test: saveBack marks edit session as saved_back
# Test: discardEditSession deletes temp Drive file and marks session as discarded
```

### pytest (edit session cleanup task)
```
# Test: cleanup task expires sessions older than 24 hours
# Test: cleanup task extends session if Drive file was modified within last 2 hours
# Test: cleanup task sends notification 2 hours before expiry
# Test: cleanup task handles token expired gracefully (marks expired but cannot delete Drive file)
```

### Vitest (EditInGoogleBar component)
```
# Test: EditInGoogleBar shows status bar when active edit session exists
# Test: EditInGoogleBar shows [Save back] / [Discard] / [Open again] buttons
# Test: EditInGoogleBar hidden when no active edit session
# Test: "Edit in Google" button only visible when Google connected
```

---

## Section 7: Google Drive MCP Server

### pytest (MCP tools)
```
# Test: search_drive_files calls Drive API with correct query and returns formatted results
# Test: search_drive_files respects max_results parameter
# Test: read_drive_file extracts text content and charges gdrive.mcp_read credits
# Test: read_drive_file returns ToolError when file not found (404)
# Test: read_drive_file returns ToolError when token expired
# Test: read_sheet_data reads specified sheet and cell range
# Test: read_sheet_data charges gdrive.mcp_sheet credits based on cell count
# Test: list_drive_folder lists files with metadata
# Test: get_drive_file_info returns file metadata without content
# Test: all tools inject user_id from request context (not as parameter)
```

### Vitest (MCP tool discovery)
```
# Test: mcpRoutes tool listing includes Google Drive tools when user has Google connected
# Test: mcpRoutes tool listing excludes Google Drive tools when user not connected
# Test: buildChatContext includes Drive tools for connected users
```

---

## Section 8: Content Extraction Service

### pytest (google_content_extractor)
```
# Test: extract Google Docs returns markdown with heading structure
# Test: extract Google Sheets returns CSV-like text with column headers per sheet
# Test: extract Google Slides returns per-slide text with slide numbers
# Test: extract PDF exports as text/plain via Drive API
# Test: extract plain text downloads content directly
# Test: extract rejects files larger than 50MB size guard
# Test: extract handles Google Sheets with >500K cells (pagination)
# Test: extract times out after 60 seconds
# Test: structure-aware chunking splits Docs by headings
# Test: structure-aware chunking preserves heading hierarchy in metadata
# Test: chunks include correct metadata (file_id, source, last_modified)
```

---

## Section 9: Virtual Document References & Indexing

### Vitest (libraryService - virtual references)
```
# Test: createVirtualDriveReference creates library_items with source="google_drive"
# Test: createVirtualDriveReference creates library_links with tenant_id
# Test: createVirtualDriveReference deduplicates within same tenant (upsert/skip)
# Test: createVirtualDriveReference allows same driveFileId across different tenants
# Test: createVirtualDriveReference enqueues index job
```

### pytest (Drive index job)
```
# Test: processGoogleDriveIndexJob fetches file, extracts, chunks, embeds, upserts
# Test: processGoogleDriveIndexJob skips unchanged files (content hash match)
# Test: processGoogleDriveIndexJob charges credits post-deduct with idempotency key
# Test: processGoogleDriveIndexJob refunds on failure
# Test: processGoogleDriveIndexJob handles token expired (marks item for retry)
# Test: vector IDs follow format gdrive:{tenantId}:{driveFileId}:{chunkIndex}
# Test: vectors tagged with source, drive_file_id, tenant_id, user_id metadata
```

---

## Section 10: Federated Search

### Vitest (federatedSearch service)
```
# Test: federatedSearch executes local DB, vector store, and Drive API in parallel
# Test: federatedSearch returns merged results ranked by RRF with k=60
# Test: federatedSearch deduplicates by canonical ID (driveFileId matching library_links)
# Test: federatedSearch deduplicates by content hash for cross-source matches
# Test: federatedSearch returns results with [Library] / [Google Drive] source badges
# Test: federatedSearch respects Drive API timeout (3s) and returns partial results
# Test: federatedSearch sets driveResultsStatus="timeout" when Drive API times out
# Test: federatedSearch sets driveResultsStatus="disconnected" when Google not connected
# Test: federatedSearch works without Google Drive (library-only mode)
# Test: filter tabs (All | Library | Google Drive) apply source filtering
```

### Vitest (DocumentManagement UI)
```
# Test: search results show source badges
# Test: filter tabs render and switch between All/Library/Google Drive
# Test: "Include Google Drive" checkbox visible when connected
# Test: Drive results show "Open in Google" button
```

---

## Section 11: Incremental Sync & Webhooks

### pytest (initial sync)
```
# Test: initial sync lists files matching sync settings (indexing mode, filters)
# Test: initial sync respects size guard
# Test: initial sync creates virtual references for matching files
# Test: initial sync tracks progress (files_total, files_processed)
# Test: initial sync is non-blocking (runs as Celery task)
# Test: should_index_file correctly applies indexing mode (none/selected_folders/all_except/all)
# Test: should_index_file respects file type filter
```

### Vitest (webhook handler)
```
# Test: webhook handler validates X-Goog-Channel-ID against stored channel_id
# Test: webhook handler validates X-Goog-Resource-ID against stored resource_id
# Test: webhook handler validates X-Goog-Channel-Token against stored channel_token
# Test: webhook handler returns 403 on invalid token triple
# Test: webhook handler returns 200 immediately (non-blocking)
# Test: webhook handler enqueues Celery task for processing changes
```

### pytest (channel renewal)
```
# Test: renew_drive_watch_channels renews channels expiring within 24 hours
# Test: renew_drive_watch_channels generates new crypto-random channel token
# Test: renew_drive_watch_channels stores new channel info in sync state
# Test: channel renewal handles token expired (pauses sync, notifies user)
```

### Vitest (Sync Settings UI)
```
# Test: SyncSettingsPanel shows indexing mode radio buttons
# Test: FolderPicker renders tree view with checkboxes
# Test: "Estimate Cost" button shows estimated credit cost
# Test: SyncProgressBar displays progress during active sync
```

---

## Section 12: Settings UI — Google Drive Dashboard

### Vitest (Dashboard components)
```
# Test: OverviewPanel shows connection status, email, scopes, last sync time
# Test: FilesPanel lists indexed Drive files with sync status
# Test: FilesPanel supports re-index and remove-from-index actions
# Test: CreditUsagePanel shows monthly breakdown by category
# Test: CreditUsagePanel shows budget meter with progress bar
# Test: PricingInfoPanel displays current credit pricing table
# Test: FolderPickerDialog lazy-loads subfolders on expand
```

---

## Section 13: Rate Limiting & Error Handling

### Vitest (rate limiting)
```
# Test: Google Drive search respects 30/min per-user limit
# Test: Google Drive read respects 60/min per-user limit
# Test: rate-limited requests return 429 with retry-after header
```

### pytest (error handling)
```
# Test: exponential backoff retries on 429 with increasing delays (1s, 2s, 4s, 8s, 16s, 32s cap)
# Test: backoff adds jitter to prevent thundering herd
# Test: invalid_grant detection updates connection status to "expired"
# Test: sync continues after individual file failure (skip and log)
# Test: sync reports summary (succeeded, failed, skipped counts)
# Test: webhook failure falls back to periodic polling after N failures
```

---

## Section 14: Disconnect & Cleanup

### Vitest (disconnect flow)
```
# Test: disconnect cleans up temp Drive files BEFORE revoking token
# Test: disconnect stops webhook channel BEFORE revoking token
# Test: disconnect revokes token at Google
# Test: disconnect deletes all google_drive_edit_sessions
# Test: disconnect deletes all library_items with source="google_drive"
# Test: disconnect deletes corresponding library_chunks
# Test: disconnect deletes vectors from vector store
# Test: disconnect deletes library_links with link_type="google_drive_file"
# Test: disconnect deletes google_drive_sync_state
# Test: disconnect deletes oauth_connections for Google
# Test: disconnect runs as background job (non-blocking)
# Test: disconnect confirmation dialog shows correct message
```

---

## Section 15: Security Hardening

### pytest (security)
```
# Test: OAuth tokens in DB are encrypted with AES-256-GCM (not plaintext)
# Test: scope verification rejects API calls when required scope missing
# Test: tenant isolation: user A cannot access user B's Drive data
# Test: vector queries always include tenant_id filter
# Test: webhook token is cryptographically random (32 bytes minimum)
# Test: webhook validation rejects requests with wrong channel token
# Test: content sanitization strips script tags and other harmful content
# Test: audit log entries created for connect, disconnect, token refresh
```

### Vitest (security)
```
# Test: all tRPC mutations validate input with Zod schemas
# Test: Drive operations verify tenantId matches authenticated user
# Test: driveReadonlyScopeApproved flag gates Sections 7/9/10/11
```
