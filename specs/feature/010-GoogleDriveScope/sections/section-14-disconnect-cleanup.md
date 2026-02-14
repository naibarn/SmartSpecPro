I now have all the context I need. Let me generate the section content.

# Section 14: Disconnect and Cleanup

## Overview

This section implements the complete cleanup flow when a user disconnects their Google account from SmartSpecPro. The disconnect operation must follow a strict ordering: operations requiring a valid Google access token (deleting temp Drive files, stopping webhook channels) must happen **before** the token is revoked. All local data (edit sessions, library items, chunks, vectors, links, sync state, OAuth connection) is then removed.

The cleanup runs as a background job to avoid HTTP timeout issues, and the user sees a confirmation dialog before initiating the process.

## Dependencies

- **Section 02 (Database Schema):** Provides the `google_drive_sync_state`, `google_drive_edit_sessions`, `library_links`, `library_items`, `library_chunks` tables
- **Section 03 (OAuth Consent):** Provides the `googleDriveRouter` where the `disconnect` mutation is defined, and the `oauth_connections` table in the Python backend
- **Section 07 (Edit in Google):** Provides the `google_drive_edit_sessions` table with active edit sessions that hold temp Drive file IDs
- **Section 08 (Virtual References):** Provides virtual `library_items` with `source: "google_drive"` and associated `library_links` with `link_type: "google_drive_file"`
- **Section 11 (Sync Webhooks):** Provides webhook channel data in `google_drive_sync_state` (channel_id, resource_id, channel_token)

## Files to Create or Modify

### New Files

- `/home/dev/projects/SmartSpecPro/python-backend/app/tasks/google_drive_tasks.py` -- Celery task for background disconnect cleanup
- `/home/dev/projects/SmartSpecPro/apps/web/client/src/components/settings/DisconnectGoogleDialog.tsx` -- Confirmation dialog component

### Modified Files

- `/home/dev/projects/SmartSpecPro/apps/web/server/routers/googleDrive.ts` -- Add `disconnect` mutation (or extend if stub already exists from Section 03)
- `/home/dev/projects/SmartSpecPro/apps/web/server/services/libraryService.ts` -- Add `removeGoogleDriveData(userId, tenantId)` helper
- `/home/dev/projects/SmartSpecPro/python-backend/app/services/google_token_service.py` -- Add `revoke_token(user_id)` method
- `/home/dev/projects/SmartSpecPro/python-backend/app/api/oauth.py` -- Add `/disconnect-google` endpoint for cleanup orchestration

---

## Tests (Write First)

### Vitest -- Disconnect Flow (`apps/web/server/routers/googleDrive.test.ts`)

```
# Test: disconnect cleans up temp Drive files BEFORE revoking token
#   - Mock two active edit sessions with drive_file_id values
#   - Verify files.delete() is called for each temp file before revoke endpoint is hit
#   - Assert ordering via call sequence tracking

# Test: disconnect stops webhook channel BEFORE revoking token
#   - Mock a google_drive_sync_state record with channel_id and resource_id
#   - Verify channels.stop() is called before token revocation
#   - Assert ordering via call sequence tracking

# Test: disconnect revokes token at Google
#   - Verify POST to https://oauth2.googleapis.com/revoke is called with the access token
#   - Verify success even if revoke endpoint returns non-200 (best effort)

# Test: disconnect deletes all google_drive_edit_sessions
#   - Insert 3 edit session records for the user
#   - Call disconnect
#   - Verify all 3 records are deleted

# Test: disconnect deletes all library_items with source="google_drive"
#   - Insert 5 library_items with source="google_drive" and 2 with source="upload"
#   - Call disconnect
#   - Verify only the 5 google_drive items are deleted; the 2 upload items remain

# Test: disconnect deletes corresponding library_chunks
#   - Insert library_chunks referencing google_drive library_items
#   - Call disconnect
#   - Verify chunks for google_drive items are deleted (cascade or explicit)

# Test: disconnect deletes vectors from vector store
#   - Mock vector store delete-by-filter method
#   - Verify it is called with filter { user_id, source: "google_drive" }

# Test: disconnect deletes library_links with link_type="google_drive_file"
#   - Insert library_links with link_type="google_drive_file" for this user
#   - Call disconnect
#   - Verify they are deleted

# Test: disconnect deletes google_drive_sync_state
#   - Insert a sync state record for the user
#   - Call disconnect
#   - Verify the record is deleted

# Test: disconnect deletes oauth_connections for Google
#   - Verify Python backend endpoint is called to delete the oauth_connection record

# Test: disconnect runs as background job (non-blocking)
#   - Verify the mutation returns immediately with a status like { status: "cleanup_started" }
#   - Verify a Celery task or background job is enqueued

# Test: disconnect confirmation dialog shows correct message
#   - Render DisconnectGoogleDialog component
#   - Verify text includes "Disconnecting will remove all indexed Google Drive content from search"
#   - Verify text includes "Your files in Google Drive are not affected"
#   - Verify Cancel and Disconnect buttons are present
```

### Vitest -- DisconnectGoogleDialog Component (`apps/web/client/src/components/settings/DisconnectGoogleDialog.test.tsx`)

```
# Test: DisconnectGoogleDialog renders warning message
#   - Render with open=true
#   - Assert "Disconnecting will remove all indexed Google Drive content" is visible
#   - Assert "Your files in Google Drive are not affected" is visible

# Test: DisconnectGoogleDialog Cancel button closes dialog without calling disconnect
#   - Render with open=true, mock onConfirm and onCancel
#   - Click Cancel
#   - Assert onCancel called, onConfirm NOT called

# Test: DisconnectGoogleDialog Disconnect button calls onConfirm
#   - Render with open=true, mock onConfirm
#   - Click Disconnect
#   - Assert onConfirm called

# Test: DisconnectGoogleDialog Disconnect button shows loading state during mutation
#   - Render with isLoading=true
#   - Assert Disconnect button is disabled and shows spinner/loading text
```

### pytest -- Celery Cleanup Task (`python-backend/tests/test_google_drive_disconnect.py`)

```
# Test: disconnect_cleanup_task deletes temp Drive files via Google API
#   - Mock google API client; insert 2 edit sessions with drive_file_id
#   - Run task
#   - Assert files.delete called for each drive_file_id

# Test: disconnect_cleanup_task stops webhook channel via Google API
#   - Mock channels.stop; set up sync_state with channel_id + resource_id
#   - Run task
#   - Assert channels.stop called with correct channel_id and resource_id

# Test: disconnect_cleanup_task revokes access token
#   - Mock POST to oauth2.googleapis.com/revoke
#   - Run task
#   - Assert revoke called with correct token

# Test: disconnect_cleanup_task handles token-already-revoked gracefully
#   - Mock revoke endpoint returning 400 (token already revoked)
#   - Run task
#   - Assert no exception raised, cleanup continues

# Test: disconnect_cleanup_task handles Drive API errors gracefully
#   - Mock files.delete raising 404 (file already deleted)
#   - Run task
#   - Assert no exception raised, cleanup continues with next file

# Test: disconnect_cleanup_task calls Node.js internal API for local data cleanup
#   - Mock internal API call
#   - Run task
#   - Assert cleanup endpoint called with correct user_id and tenant_id

# Test: disconnect_cleanup_task ordering: Drive ops before revoke before local cleanup
#   - Track call order across all mocked operations
#   - Assert files.delete < channels.stop < revoke < local cleanup
```

### pytest -- Token Revocation (`python-backend/tests/test_google_token_service.py`)

```
# Test: revoke_token sends POST to Google revoke endpoint
#   - Mock httpx POST to oauth2.googleapis.com/revoke
#   - Call revoke_token(user_id)
#   - Assert called with token=access_token in form body

# Test: revoke_token updates oauth_connection status to "revoked"
#   - Insert oauth_connection with status="active"
#   - Call revoke_token
#   - Assert status changed to "revoked"

# Test: revoke_token succeeds even if Google returns error (best effort)
#   - Mock revoke endpoint returning 400
#   - Call revoke_token
#   - Assert no exception, status still set to "revoked"
```

---

## Implementation Details

### 1. Disconnect Mutation (tRPC Router)

**File:** `/home/dev/projects/SmartSpecPro/apps/web/server/routers/googleDrive.ts`

Add a `disconnect` mutation to the `googleDriveRouter`. This mutation is the entry point triggered by the frontend when the user confirms disconnection.

The mutation should:

1. Verify the user is authenticated (use existing `protectedProcedure`).
2. Check that a Google connection exists for this user (query `oauth_connections` via Python backend or check `google_drive_sync_state` locally). If no connection exists, return early with `{ status: "not_connected" }`.
3. Call the Python backend's disconnect endpoint via internal HTTP POST to `/api/internal/google-drive/disconnect`. Pass `userId` and `tenantId`.
4. The Python backend enqueues a Celery task for the actual cleanup work.
5. Return immediately with `{ status: "cleanup_started" }` so the frontend is not blocked.

The mutation signature:

```typescript
disconnect: protectedProcedure
  .mutation(async ({ ctx }) => {
    // 1. Get userId, tenantId from ctx
    // 2. POST to Python backend /api/internal/google-drive/disconnect
    // 3. Return { status: "cleanup_started" }
  })
```

Error handling: If the Python backend is unreachable, throw a `TRPCError` with code `INTERNAL_SERVER_ERROR` and a user-friendly message.

### 2. Python Backend Disconnect Endpoint

**File:** `/home/dev/projects/SmartSpecPro/python-backend/app/api/oauth.py`

Add a new endpoint `POST /api/internal/google-drive/disconnect` that:

1. Accepts `user_id: int` and `tenant_id: str` in the request body.
2. Validates that an `oauth_connections` record exists for this user with `provider="google"`.
3. Enqueues the `disconnect_google_drive_cleanup` Celery task with `user_id` and `tenant_id` as arguments.
4. Returns `{ "status": "cleanup_started", "task_id": "<celery_task_id>" }`.

This endpoint is internal-only (behind the existing internal API auth middleware).

### 3. Celery Cleanup Task (Background Job)

**File:** `/home/dev/projects/SmartSpecPro/python-backend/app/tasks/google_drive_tasks.py`

Create a new Celery task `disconnect_google_drive_cleanup(user_id, tenant_id)` that performs the 11-step cleanup in the correct order. The ordering is critical because steps 1-3 require a valid Google access token.

**Step-by-step cleanup flow:**

```python
@celery_app.task(bind=True, max_retries=2, default_retry_delay=30)
def disconnect_google_drive_cleanup(self, user_id: int, tenant_id: str):
    """
    Complete cleanup when user disconnects Google Drive.
    Order matters: Drive API calls (1-3) must happen before token revocation (3).
    """
    # Phase 1: Operations requiring valid Google token
    # Step 1: Delete temp Drive files from active edit sessions
    # Step 2: Stop webhook channel (channels.stop)
    # Step 3: Revoke access token at Google

    # Phase 2: Local data cleanup (no Google token needed)
    # Step 4: Delete google_drive_edit_sessions
    # Step 5: Delete library_items with source="google_drive"
    # Step 6: Delete library_chunks for those items (cascades or explicit)
    # Step 7: Delete vectors from vector store
    # Step 8: Delete library_links with link_type="google_drive_file"
    # Step 9: Delete google_drive_sync_state
    # Step 10: Delete oauth_connections for Google
    # Step 11: Optionally reset user_credit_budgets (leave for audit)
```

**Phase 1 details (require valid token):**

- **Step 1 -- Delete temp Drive files:** Query `google_drive_edit_sessions` where `user_id` matches and `status = "active"`. For each session, call the Google Drive API `files.delete(fileId=session.drive_file_id)` using the user's access token (obtained via `GoogleTokenService.get_valid_access_token(user_id)`). Wrap each delete in try/except -- if a file is already deleted (404) or the token is invalid, log the error and continue. Do not let a single file failure stop the cleanup.

- **Step 2 -- Stop webhook channel:** Query `google_drive_sync_state` for this user. If `channel_id` and `resource_id` are set, call `channels.stop(body={"id": channel_id, "resourceId": resource_id})` via the Google Drive API. Catch and log errors (channel may already be expired).

- **Step 3 -- Revoke token:** Call `GoogleTokenService.revoke_token(user_id)` which sends `POST https://oauth2.googleapis.com/revoke` with the access token as form data (`token=<access_token>`). This is best-effort -- if the token is already revoked (Google returns 400), log and continue.

**Phase 2 details (local cleanup):**

- **Step 4:** Delete all rows from `google_drive_edit_sessions` where `user_id` matches. This is a simple SQL delete.

- **Step 5:** Delete all rows from `library_items` where `source = "google_drive"` AND `owner_user_id = user_id` AND `tenant_id = tenant_id`. Before deleting, collect the item IDs for use in steps 6-7.

- **Step 6:** Delete `library_chunks` where `library_item_id IN (collected_ids)`. If the `library_items` table has `ON DELETE CASCADE` for chunks, this happens automatically when items are deleted. Verify this cascade exists; if not, delete explicitly before items.

- **Step 7:** Delete vectors from the vector store. Call the vector store service with a metadata filter: `{ "source": "google_drive", "user_id": user_id, "tenant_id": tenant_id }`. The vector store backend (configured via Admin settings -- could be Cloudflare Vectorize, pgvector, etc.) supports delete-by-metadata-filter. This call goes through the existing Python vector store abstraction.

- **Step 8:** Delete `library_links` where `link_type = "google_drive_file"` and the associated `library_item_id` is in the collected item IDs. If these cascade from `library_items` deletion, no explicit delete is needed, but verify.

- **Step 9:** Delete the `google_drive_sync_state` record for this `(tenant_id, user_id)`.

- **Step 10:** Delete the `oauth_connections` record where `user_id = user_id` AND `provider = "google"`. Alternatively, set its `status` to `"revoked"` for audit trail purposes.

- **Step 11:** The `user_credit_budgets` record is left intact for audit purposes. The budget applies to all credit operations (not just Drive), so it should not be deleted. Only Drive-specific tracking would be cleared, but since the budget tracks total monthly usage, no change is needed.

**Error handling in the Celery task:**

- Each phase and each step within Phase 1 is wrapped in individual try/except blocks.
- If Phase 1 fails entirely (e.g., token service is down), the task retries up to 2 times with a 30-second delay.
- If Phase 2 fails, it also retries, but Phase 1 steps check whether they already completed (idempotent -- skip files already deleted, skip channel already stopped).
- The task logs each step completion to the audit logger for traceability.

### 4. Token Revocation in GoogleTokenService

**File:** `/home/dev/projects/SmartSpecPro/python-backend/app/services/google_token_service.py`

Add a `revoke_token` method to the `GoogleTokenService` class:

```python
async def revoke_token(self, user_id: int) -> bool:
    """
    Revoke the user's Google OAuth token and update connection status.

    Sends POST to https://oauth2.googleapis.com/revoke with the access token.
    Updates oauth_connections.status to 'revoked' regardless of Google's response
    (best-effort revocation).

    Returns True if revocation was successful, False if Google returned an error
    (token may already be revoked).
    """
```

The method:
1. Fetches the `oauth_connections` record for this user with `provider="google"`.
2. Decrypts the access token using `smartspecweb_crypto.decrypt_smartspecweb()` (tokens are stored encrypted by the Node.js app using `LLM_ENCRYPTION_KEY`).
3. Sends `POST https://oauth2.googleapis.com/revoke` with `Content-Type: application/x-www-form-urlencoded` and body `token=<access_token>`.
4. Updates the `oauth_connections.status` column to `"revoked"` regardless of the HTTP response.
5. Returns `True` on 200, `False` on any error (but does not raise).

### 5. Local Data Cleanup Helper in libraryService

**File:** `/home/dev/projects/SmartSpecPro/apps/web/server/services/libraryService.ts`

Add a function `removeGoogleDriveData(userId: number, tenantId: string)` that handles the Node.js-side database cleanup. This function is called by either the Python task (via an internal API endpoint) or directly by the tRPC router.

```typescript
export async function removeGoogleDriveData(
  userId: number,
  tenantId: string
): Promise<{ itemsDeleted: number; chunksDeleted: number; linksDeleted: number }> {
  /**
   * Remove all Google Drive virtual references and associated data for a user.
   *
   * Steps:
   * 1. Find all library_items with source="google_drive", owner_user_id=userId, tenant_id=tenantId
   * 2. Collect their IDs
   * 3. Delete library_chunks for those item IDs (if not cascaded)
   * 4. Delete library_links for those item IDs (if not cascaded)
   * 5. Delete the library_items themselves
   * 6. Return counts for logging/audit
   */
}
```

Since `library_chunks` and `library_links` both have `onDelete: "cascade"` referencing `library_items.id`, deleting the `library_items` rows will cascade to their chunks and links automatically. However, the function should still count the affected rows before deletion for audit logging purposes.

The function uses Drizzle ORM queries:

```typescript
// Find Google Drive items for this user
const driveItems = await db
  .select({ id: libraryItems.id })
  .from(libraryItems)
  .where(and(
    eq(libraryItems.source, "google_drive"),
    eq(libraryItems.ownerUserId, userId),
    eq(libraryItems.tenantId, tenantId)
  ));

const itemIds = driveItems.map(i => i.id);
if (itemIds.length === 0) return { itemsDeleted: 0, chunksDeleted: 0, linksDeleted: 0 };

// Count chunks and links before cascade delete
// ... count queries ...

// Delete items (cascades to chunks and links)
await db.delete(libraryItems).where(inArray(libraryItems.id, itemIds));
```

### 6. Internal API Endpoint for Local Cleanup

**File:** `/home/dev/projects/SmartSpecPro/apps/web/server/_core/index.ts`

Register an Express route `POST /api/internal/google-drive/cleanup` that:

1. Validates the request comes from the Python backend (via internal API auth -- existing `SMARTSPEC_WEB_GATEWAY_TOKEN` header check pattern).
2. Accepts `{ userId, tenantId }` in the request body.
3. Calls `removeGoogleDriveData(userId, tenantId)`.
4. Also deletes the `google_drive_edit_sessions` and `google_drive_sync_state` records for this user (these tables are Drizzle-managed in the Node.js app).
5. Returns `{ status: "ok", itemsDeleted, chunksDeleted, linksDeleted }`.

This endpoint is needed because the Celery task running in Python cannot directly access the Node.js Drizzle database layer. The Python task calls this endpoint after completing Phase 1 (Google API operations).

### 7. Confirmation Dialog Component

**File:** `/home/dev/projects/SmartSpecPro/apps/web/client/src/components/settings/DisconnectGoogleDialog.tsx`

A React component using Radix UI `AlertDialog` that shows a confirmation before disconnecting.

Props:
```typescript
interface DisconnectGoogleDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  isLoading: boolean;
}
```

Content:
- Title: "Disconnect Google Drive"
- Body text: "Disconnecting will remove all indexed Google Drive content from search. Your files in Google Drive are not affected. This action cannot be undone."
- Cancel button (secondary style, closes dialog)
- Disconnect button (destructive/red style, calls `onConfirm`, shows loading spinner when `isLoading` is true)

The parent component (Settings Integrations tab from Section 12) manages the dialog state and calls the `disconnect` tRPC mutation on confirm.

### 8. Integration with Settings UI

The Disconnect button lives in the Google Drive card in the Settings Integrations tab (built in Section 12). When clicked, it opens the `DisconnectGoogleDialog`. On confirm:

```typescript
const disconnectMutation = trpc.googleDrive.disconnect.useMutation({
  onSuccess: () => {
    toast.success("Google Drive disconnected. Cleanup is in progress.");
    // Invalidate connection status query to refresh UI
    utils.googleDrive.getConnectionStatus.invalidate();
  },
  onError: (err) => {
    toast.error(`Failed to disconnect: ${err.message}`);
  },
});
```

After a successful disconnect mutation, the connection status query returns `"not_connected"` and the UI updates to show the "Connect" button instead of the connected state.

---

## Sequence Diagram

```
User clicks "Disconnect" → DisconnectGoogleDialog opens
User confirms → tRPC disconnect mutation fires
  → Node.js POST to Python /api/internal/google-drive/disconnect
  → Python enqueues Celery task, returns { status: "cleanup_started" }
  → Node.js returns { status: "cleanup_started" } to frontend
  → Frontend shows "Cleanup in progress" toast

Celery task runs (background):
  Phase 1 (requires Google token):
    1. files.delete() for each active edit session's temp Drive file
    2. channels.stop() for webhook channel
    3. POST to oauth2.googleapis.com/revoke (revoke token)

  Phase 2 (local cleanup):
    4. Call Node.js POST /api/internal/google-drive/cleanup
       → Deletes edit sessions, sync state, library items (cascades chunks+links)
    5. Delete vectors from vector store (Python vector store client)
    6. Delete oauth_connections record for Google
    7. Log completion to audit trail
```

---

## Edge Cases and Error Handling

1. **Token already expired/revoked:** If `GoogleTokenService.get_valid_access_token()` fails during Phase 1, skip steps 1-2 (cannot delete Drive files or stop channel without token), proceed directly to step 3 (revoke -- will fail gracefully) and then Phase 2. The temp Drive files will remain in the user's Google Drive but are harmless (the user can delete them manually).

2. **Partial cleanup from previous attempt:** The task must be idempotent. If it runs twice (e.g., first run failed mid-way and retried), each step handles "already done" gracefully:
   - `files.delete()` on already-deleted file returns 404 -- catch and continue
   - `channels.stop()` on expired channel -- catch and continue
   - Deleting records that don't exist -- no-op via SQL `WHERE` clause

3. **User reconnects during cleanup:** The Celery task should check at the start of Phase 2 whether a new `oauth_connections` record exists for Google (created after the cleanup was initiated). If so, abort Phase 2 to avoid deleting the new connection's data. Log a warning.

4. **Large number of items:** If a user has thousands of indexed Drive files, the local cleanup (Step 5) should use batched deletes to avoid long-running transactions. Delete in batches of 500 item IDs.

5. **Vector store unavailable:** If the vector store delete fails (Step 7), log the error but do not fail the entire cleanup. The orphaned vectors will not match any library items and will not appear in search results. They can be cleaned up later by an admin maintenance task.