Now I have comprehensive context. Let me generate the section content.

# Section 11: Incremental Sync and Webhooks

## Overview

This section implements the incremental sync system for keeping Google Drive content indexed and up-to-date within SmartSpecPro. It covers three major subsystems: (1) initial sync -- discovering and indexing files matching user-configured settings, (2) Google Drive Changes API webhooks for real-time update notifications, and (3) periodic channel renewal to keep webhooks alive.

The sync system runs entirely as background Celery tasks, ensuring the user can continue working in the application while files are being processed. A webhook Express route (outside tRPC) receives push notifications from Google, validates them against stored credentials, and enqueues processing tasks.

## Dependencies

This section depends on the following sections being implemented first:

- **Section 02 (Database Schema):** The `google_drive_sync_state` table stores all sync configuration, webhook channel info, progress tracking, and page tokens. Must exist before this section.
- **Section 08 (Virtual References and Indexing):** The `createVirtualDriveReference` function in `libraryService.ts` and the `processGoogleDriveIndexJob` Celery task are called during sync to create and index files. Must exist before this section.
- **Section 03 (OAuth Consent):** The `GoogleTokenService` is needed to obtain valid access tokens for Google API calls during sync and webhook setup.

This section **blocks** Section 14 (Disconnect and Cleanup) which needs to stop webhook channels during disconnect.

## Files to Create or Modify

| File | Action |
|------|--------|
| `/home/dev/projects/SmartSpecPro/apps/web/server/routes/webhooks.ts` | **Create** -- Express route handler for Google Drive webhook POST requests |
| `/home/dev/projects/SmartSpecPro/apps/web/server/_core/index.ts` | **Modify** -- Register the webhook Express route before the tRPC middleware |
| `/home/dev/projects/SmartSpecPro/apps/web/server/routers/googleDrive.ts` | **Modify** -- Add `getSyncStatus`, `startSync`, `updateSyncSettings` tRPC procedures |
| `/home/dev/projects/SmartSpecPro/python-backend/app/tasks/google_drive_tasks.py` | **Create** -- Celery tasks for initial sync, change processing, and channel renewal |
| `/home/dev/projects/SmartSpecPro/python-backend/app/services/google_drive_sync_service.py` | **Create** -- Core sync logic: file listing, change processing, should_index_file filtering |
| `/home/dev/projects/SmartSpecPro/python-backend/app/core/celery_app.py` | **Modify** -- Register new tasks and periodic beat schedule for channel renewal |
| `/home/dev/projects/SmartSpecPro/nginx/conf.d/dev-host.conf` | **Modify** -- Add proxy rule for `/api/webhooks/gdrive` routing to Node.js backend |
| `/home/dev/projects/SmartSpecPro/apps/web/client/src/components/settings/SyncSettingsPanel.tsx` | **Create** -- Sync configuration UI: indexing mode, folder picker, file type filter, progress bar |
| `/home/dev/projects/SmartSpecPro/apps/web/client/src/components/settings/SyncProgressBar.tsx` | **Create** -- Progress bar component for active sync operations |

---

## Tests FIRST

### pytest -- Initial Sync Logic

**File:** `/home/dev/projects/SmartSpecPro/python-backend/tests/test_google_drive_sync.py`

```
@pytest.mark.unit
class TestInitialSync:

    async def test_initial_sync_lists_files_matching_sync_settings():
        """Initial sync should call Drive API files.list with the correct query
        parameters derived from the user's sync settings (indexing mode, file
        type filters, folder selections). Mock the Drive API response and verify
        the query string and parameters passed."""

    async def test_initial_sync_respects_size_guard():
        """Files exceeding the max_file_size_bytes setting in
        google_drive_sync_state should be skipped during initial sync. Create a
        mock file list with one 100MB file and a 50MB guard -- verify the large
        file is not enqueued for indexing."""

    async def test_initial_sync_creates_virtual_references_for_matching_files():
        """For each file matching the sync filters, the sync task should call
        the createVirtualDriveReference endpoint (via internal API call to
        Node.js) to create a library_items record with source='google_drive'.
        Mock the internal API and verify it is called once per matching file."""

    async def test_initial_sync_tracks_progress():
        """During sync, files_total and files_processed should be updated in
        the google_drive_sync_state record. After listing files, files_total is
        set. As each file is processed, files_processed is incremented. Verify
        the DB record is updated at each stage."""

    async def test_initial_sync_is_nonblocking_celery_task():
        """The initial sync function should be decorated as a Celery task. When
        called via .delay(), it should return an AsyncResult immediately. Verify
        the task is registered in the Celery app task registry."""
```

### pytest -- File Inclusion Logic

**File:** `/home/dev/projects/SmartSpecPro/python-backend/tests/test_google_drive_sync.py` (continued)

```
@pytest.mark.unit
class TestShouldIndexFile:

    async def test_should_index_file_mode_none_returns_false():
        """When indexing_mode is 'none', should_index_file must return False
        for all files regardless of other settings."""

    async def test_should_index_file_mode_all_returns_true():
        """When indexing_mode is 'all', should_index_file must return True
        for files within size guard and matching type filter."""

    async def test_should_index_file_mode_selected_folders_includes_correct_folders():
        """When indexing_mode is 'selected_folders', only files whose parent
        chain includes one of the folder_selections IDs should return True.
        Test with a file in a selected folder and a file outside it."""

    async def test_should_index_file_mode_all_except_excludes_correct_folders():
        """When indexing_mode is 'all_except', files in excluded folders
        return False while all other files return True."""

    async def test_should_index_file_respects_file_type_filter():
        """When file_type_filter is set (e.g., ['document', 'spreadsheet']),
        only files with matching MIME types should pass. A PDF should fail if
        'pdf' is not in the filter list."""

    async def test_should_index_file_rejects_over_size_guard():
        """Files with size exceeding max_file_size_bytes return False
        regardless of other settings."""

    async def test_should_index_file_skips_google_native_folders():
        """Google Drive folders (mimeType 'application/vnd.google-apps.folder')
        should never be indexed as content -- they are containers, not files."""
```

### Vitest -- Webhook Handler

**File:** `/home/dev/projects/SmartSpecPro/apps/web/server/webhooks.gdrive.test.ts`

```
describe("Google Drive Webhook Handler", () => {

  it("should validate X-Goog-Channel-ID against stored channel_id")
    // Send a POST request with a valid channel_id header that matches a
    // google_drive_sync_state record. The handler should not return 403.
    // Mock the DB query to return a matching record.

  it("should validate X-Goog-Resource-ID against stored resource_id")
    // Send a POST with matching channel_id but mismatched resource_id.
    // Expect 403 response.

  it("should validate X-Goog-Channel-Token against stored channel_token")
    // Send a POST with matching channel_id and resource_id but wrong
    // channel_token. Expect 403 response.

  it("should return 403 on invalid token triple")
    // All three headers present but none matching any DB record.
    // Expect 403 with no Celery task enqueued.

  it("should return 200 immediately for valid webhook")
    // Valid triple matching a DB record. Expect 200 response returned
    // quickly (handler should not block on processing).

  it("should enqueue Celery task for processing changes after validation")
    // After returning 200, verify that a task was dispatched to the Python
    // backend (via internal API call) to process the Drive changes.
    // Mock the internal API call and verify it was called with the correct
    // user_id and tenant_id from the matched sync state record.
})
```

### pytest -- Channel Renewal

**File:** `/home/dev/projects/SmartSpecPro/python-backend/tests/test_google_drive_sync.py` (continued)

```
@pytest.mark.unit
class TestChannelRenewal:

    async def test_renew_drive_watch_channels_renews_expiring_channels():
        """The periodic task should query for google_drive_sync_state records
        where channel_expiry is within the next 24 hours and auto_sync_enabled
        is True. For each, it should call channels.stop on the old channel,
        then changes.watch to create a new one. Mock Google API responses."""

    async def test_renew_drive_watch_channels_generates_new_crypto_random_token():
        """Each renewed channel must get a new channel_token generated via
        secrets.token_hex(32) (64 hex chars). Verify the new token is different
        from the old one and is stored in the DB."""

    async def test_renew_drive_watch_channels_stores_new_channel_info():
        """After successful renewal, the google_drive_sync_state record should
        be updated with new channel_id, resource_id, channel_token, and
        channel_expiry. Verify all four fields are updated."""

    async def test_channel_renewal_handles_token_expired():
        """If the user's Google token has expired (invalid_grant), the renewal
        task should set the oauth_connections status to 'expired', set
        auto_sync_enabled to False on the sync state, and not attempt to
        create a new watch channel. A user notification should be triggered."""
```

### Vitest -- Sync Settings UI

**File:** `/home/dev/projects/SmartSpecPro/apps/web/client/src/components/settings/SyncSettingsPanel.test.tsx`

```
describe("SyncSettingsPanel", () => {

  it("should render indexing mode radio buttons")
    // The panel should show radio buttons for: None, Selected Folders,
    // All Except, All. The current mode from the sync state should be
    // pre-selected.

  it("should show folder picker when mode is selected_folders or all_except")
    // When indexing mode is 'selected_folders' or 'all_except', a folder
    // picker tree view should be visible. When mode is 'none' or 'all',
    // the folder picker should be hidden.

  it("should show Estimate Cost button that displays estimated credit cost")
    // Clicking "Estimate Cost" should call the backend to count matching
    // files and display the estimated credit cost in a confirmation dialog.

  it("should show sync progress bar during active sync")
    // When getSyncStatus returns files_total > 0 and files_processed <
    // files_total, a progress bar should be visible showing
    // "files_processed / files_total" with a percentage.
})
```

---

## Implementation Details

### 1. Webhook Express Route

**File:** `/home/dev/projects/SmartSpecPro/apps/web/server/routes/webhooks.ts`

Google sends webhook notifications as raw HTTP POST requests (not JSON-RPC or tRPC format). Therefore, the webhook handler must be a plain Express route, not a tRPC procedure.

The handler performs **triple validation**: all three headers (`X-Goog-Channel-ID`, `X-Goog-Resource-ID`, `X-Goog-Channel-Token`) must match a single `google_drive_sync_state` row. This is the primary security mechanism -- the channel token is a cryptographically random 64-character hex string generated during webhook setup.

**Route structure:**

```typescript
// webhooks.ts
import { Router } from "express";

export function createWebhookRouter(): Router {
  const router = Router();

  router.post("/gdrive", async (req, res) => {
    // 1. Extract headers
    const channelId = req.headers["x-goog-channel-id"] as string;
    const resourceId = req.headers["x-goog-resource-id"] as string;
    const channelToken = req.headers["x-goog-channel-token"] as string;

    // 2. Validate all three against google_drive_sync_state
    //    Query: WHERE channel_id = ? AND resource_id = ? AND channel_token = ?
    //    If no match -> return 403

    // 3. Return 200 immediately (Google requires fast response)
    res.status(200).send("OK");

    // 4. Fire-and-forget: call Python backend internal API to process changes
    //    POST /api/internal/gdrive/process-changes
    //    Body: { userId, tenantId, pageToken (from sync_state) }
  });

  return router;
}
```

**Key design decisions:**

- The handler returns 200 **before** processing changes. Google requires a response within a few seconds or it marks the channel as failing.
- The actual change processing is delegated to a Celery task in the Python backend, called via an internal HTTP request. This keeps the Node.js handler fast and non-blocking.
- The `X-Goog-Channel-Token` is compared using a timing-safe comparison (via `crypto.timingSafeEqual`) to prevent timing attacks on the token value.
- Google sends a `sync` notification type when the channel is first created. The handler should detect `X-Goog-Resource-State: sync` and skip processing (just return 200).

### 2. Register Webhook Route in Express

**File:** `/home/dev/projects/SmartSpecPro/apps/web/server/_core/index.ts`

Add the webhook route **before** the CSRF check middleware, since Google webhook requests will not include an Origin header from an allowed domain. The route must also be placed before the `/api/v1/*` catch-all proxy to Python.

```typescript
import { createWebhookRouter } from "../routes/webhooks";

// Add AFTER the JSON body parser, BEFORE the CSRF check
// The existing CSRF check already skips requests without an Origin header,
// but the webhook route should be mounted at a clear path.

// Mount webhook routes
app.use("/api/webhooks", createWebhookRouter());
```

The CSRF middleware in `index.ts` already allows requests without an `Origin` header to pass through (line 135: `if (!origin) return next()`). Since Google webhook POSTs do not include an `Origin` header, they will not be blocked by CSRF. However, for clarity, the webhook path should also be added to the CSRF exemption list alongside the existing `/v1/media/callback/kie-ai` exemption:

```typescript
if (
  req.path === "/v1/media/callback/kie-ai" ||
  req.originalUrl === "/api/v1/media/callback/kie-ai" ||
  req.path.startsWith("/webhooks/gdrive")
) {
  return next();
}
```

### 3. Nginx Proxy Configuration

**File:** `/home/dev/projects/SmartSpecPro/nginx/conf.d/dev-host.conf`

Google sends webhook notifications to the public URL `https://smartaihub.app/api/webhooks/gdrive`. Currently, all `/api/` requests are proxied to the Python backend (`backend_host` on port 8000). The webhook route must be routed to the Node.js backend (`web_host` on port 3000) instead.

Add a new `location` block **before** the generic `/api/` block in both the port 80 and port 443 server blocks:

```nginx
# Google Drive webhooks -> Node.js backend (must come BEFORE /api/)
location /api/webhooks/ {
    proxy_pass http://web_host;
    proxy_http_version 1.1;

    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;

    # Short timeouts -- webhooks should respond quickly
    proxy_connect_timeout 10s;
    proxy_send_timeout 10s;
    proxy_read_timeout 10s;
}
```

This block must appear before the `/api/` block because nginx matches the most specific prefix first only when using `=` or `~` modifiers. For prefix matches without modifiers, nginx uses the longest matching prefix, so `/api/webhooks/` will naturally match before `/api/`. However, placing it physically before `/api/` makes the intent clear and prevents configuration confusion.

### 4. Initial Sync Celery Task

**File:** `/home/dev/projects/SmartSpecPro/python-backend/app/tasks/google_drive_tasks.py`

The initial sync task runs when the user first connects Google Drive or clicks "Sync Now". It discovers all files matching the user's sync settings, creates virtual references, and enqueues indexing jobs.

```python
# google_drive_tasks.py

from app.core.celery_app import celery_app

@celery_app.task(bind=True, max_retries=3, default_retry_delay=60)
def initial_drive_sync(self, user_id: int, tenant_id: str):
    """
    Perform initial sync of a user's Google Drive.

    Steps:
    1. Load sync settings from google_drive_sync_state
    2. Get valid access token via GoogleTokenService
    3. List all files using Drive API files.list (paginated)
    4. Filter files using should_index_file()
    5. Update files_total in sync state
    6. For each matching file:
       a. Call Node.js internal API to create virtual reference
       b. Increment files_processed
    7. Set up webhook channel via changes.watch()
    8. Store channel_id, resource_id, channel_token, channel_expiry, page_token
    9. Update last_sync_at
    """
```

**File listing pagination:** Google Drive `files.list` returns a maximum of 100 files per page (configurable up to 1000). The sync task must paginate using `nextPageToken` until all files are retrieved. Use `fields` parameter to request only needed metadata: `id, name, mimeType, size, modifiedTime, parents`.

**Query construction by indexing mode:**

- `all`: `trashed = false` (no folder filter)
- `selected_folders`: `trashed = false and '<folderId>' in parents` for each selected folder, with recursive traversal
- `all_except`: `trashed = false`, then filter out excluded folders client-side after listing
- `none`: do not run sync at all

For `selected_folders` mode, the sync must recursively discover files within subfolders. This is done by first listing folders within each selected folder, then listing files within those subfolders, building a folder hierarchy cache to avoid redundant API calls.

### 5. should_index_file Function

**File:** `/home/dev/projects/SmartSpecPro/python-backend/app/services/google_drive_sync_service.py`

```python
def should_index_file(
    file_metadata: dict,
    sync_settings: GoogleDriveSyncState,
    folder_hierarchy_cache: dict[str, list[str]] | None = None,
) -> bool:
    """
    Determine whether a Drive file should be indexed based on sync settings.

    Checks in order:
    1. Reject Google Drive folders (mimeType 'application/vnd.google-apps.folder')
    2. Check indexing_mode (none -> always False, all -> continue checking)
    3. Check file_type_filter (if set, file's mimeType must match)
    4. Check max_file_size_bytes (reject files exceeding the guard)
    5. For selected_folders mode: check if file's parent chain includes any selected folder
    6. For all_except mode: check if file's parent chain includes any excluded folder
    
    Returns True if the file should be indexed, False otherwise.
    """
```

**MIME type mapping for file_type_filter:** The file type filter stores user-friendly categories. Map them to Google Drive MIME types:

- `document`: `application/vnd.google-apps.document`, `application/vnd.openxmlformats-officedocument.wordprocessingml.document`, `application/msword`
- `spreadsheet`: `application/vnd.google-apps.spreadsheet`, `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`, `application/vnd.ms-excel`
- `presentation`: `application/vnd.google-apps.presentation`, `application/vnd.openxmlformats-officedocument.presentationml.presentation`
- `pdf`: `application/pdf`
- `text`: `text/plain`, `text/csv`, `text/markdown`
- `image`: `image/*` (not typically indexed for RAG but supported)

### 6. Change Processing Celery Task

**File:** `/home/dev/projects/SmartSpecPro/python-backend/app/tasks/google_drive_tasks.py`

```python
@celery_app.task(bind=True, max_retries=3, default_retry_delay=30)
def process_drive_changes(self, user_id: int, tenant_id: str):
    """
    Fetch and process changes from Google Drive Changes API.

    Called after a webhook notification or on periodic fallback polling.

    Steps:
    1. Load sync state to get the current page_token
    2. Get valid access token
    3. Call changes.list(pageToken=page_token)
    4. For each change:
       a. If change.removed: mark the virtual reference as deleted
       b. If change.file exists and should_index_file(): enqueue re-index
       c. If change.file exists but should NOT index: skip
    5. Update page_token to newStartPageToken from response
    6. If response has nextPageToken: process remaining pages recursively
    7. Update last_sync_at in sync state
    """
```

The Changes API returns a `newStartPageToken` that must be stored for the next call. This is how incremental sync works -- each call only returns changes since the last stored token.

### 7. Webhook Channel Setup and Renewal

**File:** `/home/dev/projects/SmartSpecPro/python-backend/app/services/google_drive_sync_service.py`

```python
import secrets

async def setup_watch_channel(
    user_id: int,
    tenant_id: str,
    access_token: str,
) -> dict:
    """
    Create a Google Drive Changes API watch channel.

    1. Get the current startPageToken from changes.getStartPageToken()
    2. Generate a crypto-random channel token: secrets.token_hex(32) (64 hex chars)
    3. Generate a unique channel_id: f"ssp-{tenant_id}-{user_id}-{uuid4().hex[:8]}"
    4. Call changes.watch() with:
       - id: channel_id
       - type: "web_hook"
       - address: "https://smartaihub.app/api/webhooks/gdrive"
       - token: channel_token
       - expiration: now + 7 days (in ms since epoch)
    5. Store channel_id, resource_id (from response), channel_token,
       channel_expiry, page_token in google_drive_sync_state

    Returns dict with channel_id, resource_id, expiration.
    """
```

**Channel renewal periodic task:**

**File:** `/home/dev/projects/SmartSpecPro/python-backend/app/tasks/google_drive_tasks.py`

```python
@celery_app.task
def renew_drive_watch_channels():
    """
    Periodic task (every 6 hours via Celery Beat).

    Query google_drive_sync_state for records where:
    - auto_sync_enabled = True
    - channel_expiry is within the next 24 hours
    - channel_id is not null

    For each:
    1. Call channels.stop() on the old channel
    2. Call setup_watch_channel() to create a new one
    3. Update sync state with new channel info

    Error handling:
    - If token is expired (invalid_grant): set auto_sync_enabled=False,
      set oauth_connections.status='expired', send user notification
    - If Google API error: log and retry on next cycle
    """
```

Register in Celery Beat schedule in `/home/dev/projects/SmartSpecPro/python-backend/app/core/celery_app.py`:

```python
# Add to celery_app.conf.beat_schedule:
"renew-drive-watch-channels": {
    "task": "app.tasks.google_drive_tasks.renew_drive_watch_channels",
    "schedule": crontab(minute=0, hour="*/6"),  # Every 6 hours
},
```

Also add the task routes:

```python
# Add to task_routes:
"app.tasks.google_drive_tasks.initial_drive_sync": {"queue": "media"},
"app.tasks.google_drive_tasks.process_drive_changes": {"queue": "media"},
"app.tasks.google_drive_tasks.renew_drive_watch_channels": {"queue": "media"},
```

### 8. tRPC Procedures for Sync Management

**File:** `/home/dev/projects/SmartSpecPro/apps/web/server/routers/googleDrive.ts`

Add these procedures to the existing `googleDriveRouter` (created in Section 03):

```typescript
// getSyncStatus: returns current sync state for the authenticated user
getSyncStatus: protectedProcedure
  .query(async ({ ctx }) => {
    // Query google_drive_sync_state WHERE tenant_id = ctx.tenantId AND user_id = ctx.userId
    // Return: indexingMode, folderSelections, fileTypeFilter, maxFileSizeBytes,
    //         filesTotal, filesProcessed, lastSyncAt, lastError, autoSyncEnabled
  }),

// startSync: triggers initial sync or manual re-sync
startSync: protectedProcedure
  .mutation(async ({ ctx }) => {
    // 1. Verify user has active Google connection
    // 2. Call Python backend: POST /api/internal/gdrive/start-sync
    //    Body: { userId, tenantId }
    // 3. Return { started: true }
  }),

// updateSyncSettings: save indexing mode, folder selections, file type filter
updateSyncSettings: protectedProcedure
  .input(z.object({
    indexingMode: z.enum(["none", "selected_folders", "all_except", "all"]),
    folderSelections: z.array(z.object({
      folderId: z.string(),
      folderName: z.string(),
    })).optional(),
    fileTypeFilter: z.array(z.string()).optional(),
    maxFileSizeBytes: z.number().positive().optional(),
    autoSyncEnabled: z.boolean().optional(),
  }))
  .mutation(async ({ ctx, input }) => {
    // Upsert google_drive_sync_state with the new settings
    // If indexingMode changed from "none" to something else, optionally trigger sync
  }),

// estimateSyncCost: count matching files and estimate credit cost
estimateSyncCost: protectedProcedure
  .mutation(async ({ ctx }) => {
    // Call Python backend to list files matching current settings (without indexing)
    // Return { fileCount, estimatedCredits, estimatedSizeMb }
  }),
```

### 9. Sync Settings UI Component

**File:** `/home/dev/projects/SmartSpecPro/apps/web/client/src/components/settings/SyncSettingsPanel.tsx`

This component is embedded within the Google Drive section of the Settings Integrations tab. It provides:

- **Indexing mode radio group:** Four options -- "None" (no indexing), "Selected Folders" (pick specific folders), "All Except" (index everything except specific folders), "All" (index entire Drive). The radio group triggers `updateSyncSettings` on change.
- **Folder picker:** Shown only when mode is "selected_folders" or "all_except". Uses a tree view with checkboxes. Folders are lazy-loaded from Drive API via a tRPC procedure. The Section 12 (Dashboard UI) `FolderPicker` component can be reused or referenced here.
- **File type filter:** Checkboxes for document categories: Documents, Spreadsheets, Presentations, PDFs, Text Files. Defaults to all checked.
- **Max file size dropdown:** Options like 10MB, 25MB, 50MB (default), 100MB.
- **Auto-sync toggle:** When enabled, webhook notifications trigger automatic re-indexing. When disabled, the user must click "Sync Now" manually.
- **Estimate Cost button:** Calls `estimateSyncCost` and displays a dialog showing the number of matching files and estimated credit cost.
- **Sync Now button:** Triggers `startSync` and shows the progress bar.

**File:** `/home/dev/projects/SmartSpecPro/apps/web/client/src/components/settings/SyncProgressBar.tsx`

A simple progress bar component that polls `getSyncStatus` every 2 seconds while a sync is in progress (when `files_processed < files_total`). Displays:

- `"{files_processed} / {files_total} files indexed"`
- Percentage complete as a visual bar
- Elapsed time
- "Sync complete" message when `files_processed === files_total`

The component stops polling when sync is complete or when the component unmounts.

### 10. Python Backend Internal API Endpoints

**File:** `/home/dev/projects/SmartSpecPro/python-backend/app/api/internal_gdrive.py` (or extend existing internal routes)

The Node.js webhook handler and tRPC procedures call these internal endpoints on the Python backend:

```python
@router.post("/api/internal/gdrive/start-sync")
async def start_sync(request: StartSyncRequest):
    """Enqueue initial_drive_sync Celery task."""

@router.post("/api/internal/gdrive/process-changes")
async def trigger_process_changes(request: ProcessChangesRequest):
    """Enqueue process_drive_changes Celery task."""

@router.post("/api/internal/gdrive/estimate-cost")
async def estimate_sync_cost(request: EstimateCostRequest):
    """Count matching files and return estimated credits without indexing."""
```

These endpoints are authenticated via the existing internal JWT mechanism (Node.js generates a short-lived bearer token carrying `user_id` and `tenant_id`).

### 11. Webhook Channel Token Security

The channel token is the primary defense against spoofed webhook requests. Security requirements:

- Generated using `secrets.token_hex(32)` in Python (64 hex characters = 256 bits of entropy)
- On the Node.js side, comparison uses `crypto.timingSafeEqual(Buffer.from(storedToken), Buffer.from(receivedToken))` to prevent timing attacks
- The token is stored in `google_drive_sync_state.channel_token` (varchar(64))
- A new token is generated on every channel renewal -- tokens are never reused
- The channel_id format (`ssp-{tenantId}-{userId}-{randomSuffix}`) allows quick lookup but the token provides the actual authentication

### 12. Feature Flag Gating

Per the phased deployment plan, the incremental sync and webhook functionality requires the `drive.readonly` scope, which needs Google verification approval. This section should be gated behind a `driveReadonlyScopeApproved` flag in `system_settings`:

- When the flag is `false`: the Sync Settings panel shows a message explaining that sync requires scope approval, and the "Sync Now" button is disabled
- When the flag is `true`: full sync functionality is available
- The flag is checked at the tRPC procedure level (`startSync`, `updateSyncSettings`) to prevent API-level bypass
- The webhook handler still validates and responds to requests even when the flag is off (to avoid Google marking the channel as dead), but it does not enqueue processing tasks

---

## Error Handling

- **Token expiry during sync:** If `GoogleTokenService.get_valid_access_token()` raises `InvalidGrantError` mid-sync, the task should update `oauth_connections.status` to `expired`, set `auto_sync_enabled` to `False`, record the error in `last_error`, and stop processing. Do not retry the task.
- **Google API rate limit (429):** Retry with exponential backoff (handled by Section 13 rate limiting, but the sync task should respect `Retry-After` headers from Google).
- **Individual file failures during sync:** Log the error, increment `files_processed`, continue with next file. Record failures in `last_error` as a summary (e.g., "3 files failed: [fileId1, fileId2, fileId3]").
- **Webhook delivery failure from Google:** Google retries webhook delivery with exponential backoff for up to several hours. If the channel appears dead, Section 13 implements a fallback to periodic polling.
- **Channel renewal failure:** If channels.stop or changes.watch fails, log the error and retry on the next 6-hour cycle. If it fails 3 consecutive times, disable auto_sync and notify the user.

## Verification

After implementing this section:

1. Run `pytest python-backend/tests/test_google_drive_sync.py` -- all tests pass
2. Run `pnpm vitest run apps/web/server/webhooks.gdrive.test.ts` -- all tests pass
3. Run `pnpm vitest run apps/web/client/src/components/settings/SyncSettingsPanel.test.tsx` -- all tests pass
4. Verify nginx config is valid: `nginx -t` within the nginx container
5. Verify the webhook route responds to `curl -X POST https://smartaihub.app/api/webhooks/gdrive` with 403 (no valid headers)
6. Verify Celery task registration: `celery -A app.core.celery_app inspect registered | grep google_drive`
7. Type check: `cd apps/web && pnpm check` passes with no new errors