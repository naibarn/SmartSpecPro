Now I have all the context I need. Let me produce the section content.

# Section 07: Edit in Google Docs/Sheets

## Overview

This section implements editing of Word (.docx) and Excel (.xlsx) files through Google Docs and Google Sheets respectively. When a user clicks "Edit in Google," the system downloads the file from S3/R2, uploads it to the user's Google Drive with format conversion enabled, and returns a Google editor URL. The user edits in Google's native editor, then saves back or discards the temporary Drive file.

**Dependencies:**
- Section 02 (Database Schema): requires the `google_drive_edit_sessions` table and the `editSessionStatusEnum`
- Section 03 (OAuth Consent): requires a connected Google account and `GoogleTokenService` for obtaining valid access tokens

**Blocks:** Section 14 (Disconnect & Cleanup) -- cleanup must handle active edit sessions.

## Key Concepts

### Edit Session Lifecycle

1. User clicks "Edit in Google Docs/Sheets" on a library item with `office` or `excel` preview type
2. Backend downloads the file from S3/R2 storage
3. Backend uploads the file to the user's Google Drive via the Drive API with `convert=true` (Google converts .docx to Docs format, .xlsx to Sheets format)
4. A `google_drive_edit_sessions` record is created with `status: "active"` and `expires_at` set to 24 hours from now
5. The Google editor URL is returned to the frontend, which opens it in a new tab
6. When the user is done, they click "Save back" or "Discard"
7. **Save back:** exports the file from Google Drive in the original format, uploads to S3/R2 with a new key, creates a content version (reuses the Feature 009 version system from `libraryContentVersions`), updates `library_items.source_url`, deletes the temp Drive file, and enqueues a re-indexing job
8. **Discard:** deletes the temp Drive file and marks the session as discarded

### Conversion Format Mapping

| Original Format | Google Format | Export Format |
|-----------------|---------------|---------------|
| .docx | Google Docs | application/vnd.openxmlformats-officedocument.wordprocessingml.document |
| .xlsx | Google Sheets | application/vnd.openxmlformats-officedocument.spreadsheetml.sheet |
| .pptx | Google Slides | application/vnd.openxmlformats-officedocument.presentationml.presentation |

### Auto-Expire Safety

Stale edit sessions are expired after 24 hours via a periodic Celery task. Before deleting a temp Drive file during expiry:
- Check `files.get(fileId, fields='modifiedTime')` on Google Drive
- If the file was modified within the last 2 hours, extend the session by 24 hours instead of expiring it
- Send an in-app notification 2 hours before expiry so the user can save back

## Tests

Write all tests BEFORE implementation. The tests below establish the expected behavior contracts.

### Vitest: googleDrive router -- edit mutations

**File:** `/home/dev/projects/SmartSpecPro/apps/web/server/routers/googleDrive.test.ts`

Add tests to the `googleDrive` router test file (create it if it does not exist). Mock the storage layer, the Google Drive API calls (via the Python backend proxy), and the database.

```
describe("googleDrive router - edit sessions", () => {
  // Test: openForEditing downloads file from S3 and uploads to Drive with convert=true
  //   - Mock storageGet to return a valid URL and storageFetch to return file content
  //   - Mock the Python backend POST /api/internal/gdrive/upload call
  //   - Verify the upload request includes convert=true
  //   - Verify the returned editUrl matches the Google Docs/Sheets URL

  // Test: openForEditing creates edit session record with status="active" and expires_at
  //   - After calling openForEditing, query google_drive_edit_sessions
  //   - Verify status is "active"
  //   - Verify expires_at is approximately 24 hours from now

  // Test: openForEditing returns editUrl for the Google document
  //   - Verify returned object contains { editUrl, sessionId, driveFileId }

  // Test: openForEditing rejects if user not connected to Google
  //   - Mock getConnectionStatus to return "not_connected"
  //   - Expect TRPCError with code "PRECONDITION_FAILED"

  // Test: openForEditing rejects if active session already exists for this file
  //   - Insert an existing active session for the same library item
  //   - Expect TRPCError with code "CONFLICT"

  // Test: saveBack exports from Drive, uploads to S3, creates version, deletes temp Drive file
  //   - Mock the Python backend export call returning file content
  //   - Mock storagePut to succeed
  //   - Verify library_items.source_url is updated
  //   - Verify the temp Drive file is deleted via API call

  // Test: saveBack enqueues re-indexing job
  //   - After saveBack, verify a library_index_jobs record was created
  //   - Verify jobType is appropriate for re-indexing

  // Test: saveBack marks edit session as saved_back
  //   - After saveBack, verify google_drive_edit_sessions.status is "saved_back"

  // Test: discardEditSession deletes temp Drive file and marks session as discarded
  //   - Mock the Python backend delete call
  //   - Verify google_drive_edit_sessions.status is "discarded"
});
```

### pytest: edit session cleanup task

**File:** `/home/dev/projects/SmartSpecPro/python-backend/tests/test_google_drive_tasks.py`

```
# Test: cleanup task expires sessions older than 24 hours
#   - Create a session with expires_at in the past
#   - Run cleanup_expired_edit_sessions task
#   - Verify session status changed to "expired"
#   - Verify Drive file delete API was called

# Test: cleanup task extends session if Drive file was modified within last 2 hours
#   - Create an expired session
#   - Mock files.get to return modifiedTime within last 2 hours
#   - Run cleanup task
#   - Verify session was NOT expired
#   - Verify expires_at was extended by 24 hours

# Test: cleanup task sends notification 2 hours before expiry
#   - Create a session with expires_at 1.5 hours from now
#   - Run cleanup task
#   - Verify an in-app notification was created for the user

# Test: cleanup task handles token expired gracefully
#   - Create an expired session
#   - Mock Google API to return 401 (token expired)
#   - Run cleanup task
#   - Verify session marked as "expired" (but temp Drive file left in place since we cannot delete it)
#   - Verify no crash / unhandled exception
```

### Vitest: EditInGoogleBar component

**File:** `/home/dev/projects/SmartSpecPro/apps/web/client/src/components/library/EditInGoogleBar.test.tsx`

```
describe("EditInGoogleBar", () => {
  // Test: EditInGoogleBar shows status bar when active edit session exists
  //   - Render with an active session prop
  //   - Verify the bar is visible with session status text

  // Test: EditInGoogleBar shows [Save back] / [Discard] / [Open again] buttons
  //   - Render with an active session prop
  //   - Verify all three buttons are present

  // Test: EditInGoogleBar hidden when no active edit session
  //   - Render with session=null
  //   - Verify nothing is rendered (null or empty)

  // Test: "Edit in Google" button only visible when Google connected
  //   - This test lives in DocumentPreviewPanel tests
  //   - Mock trpc.googleDrive.getConnectionStatus to return "connected"
  //   - Verify the "Edit in Google" button appears for office/excel preview types
  //   - Mock to return "not_connected" and verify button is absent
});
```

## Implementation Details

### 1. tRPC Router: Edit Mutations

**File:** `/home/dev/projects/SmartSpecPro/apps/web/server/routers/googleDrive.ts`

Add three new mutations to the `googleDriveRouter`. This file is created in Section 03 (OAuth Consent) -- this section extends it with edit-related procedures.

#### `openForEditing` mutation

**Input schema (Zod):**
```typescript
z.object({
  libraryItemId: z.number(),
})
```

**Logic:**
1. Verify user has a connected Google account (call Python backend `GET /api/internal/gdrive/connection-status`)
2. Check for existing active edit session for this `libraryItemId` + `userId`. If one exists, return the existing session (do not create a duplicate -- return `CONFLICT` error)
3. Fetch the `library_items` record to get `source_url` and `item_type`
4. Determine the target MIME type for Google conversion:
   - `.docx` items: `application/vnd.google-apps.document`
   - `.xlsx` items: `application/vnd.google-apps.spreadsheet`
   - `.pptx` items: `application/vnd.google-apps.presentation`
5. Download the file content from S3/R2 using `storageGet` to get the URL, then `fetch` the content as a Buffer
6. Call Python backend `POST /api/internal/gdrive/upload` with:
   - `file_content` (base64-encoded)
   - `file_name` (original title)
   - `mime_type` (target Google MIME type)
   - `convert: true`
   - `user_id` from context
7. The Python backend handles the Google Drive API upload, returning `{ driveFileId, editUrl }`
8. Insert a `google_drive_edit_sessions` record:
   - `tenantId`: from context
   - `userId`: from context
   - `libraryItemId`: input
   - `driveFileId`: from Python response
   - `editUrl`: from Python response
   - `originalSourceUrl`: the current `source_url` of the library item
   - `status`: `"active"`
   - `expiresAt`: `new Date(Date.now() + 24 * 60 * 60 * 1000)`
9. Return `{ sessionId, editUrl, driveFileId }`

#### `saveBack` mutation

**Input schema (Zod):**
```typescript
z.object({
  sessionId: z.number(),
})
```

**Logic:**
1. Fetch the `google_drive_edit_sessions` record. Verify it belongs to the current user and has `status: "active"`
2. Determine the export MIME type based on the original file type:
   - Google Docs: `application/vnd.openxmlformats-officedocument.wordprocessingml.document`
   - Google Sheets: `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`
   - Google Slides: `application/vnd.openxmlformats-officedocument.presentationml.presentation`
3. Call Python backend `POST /api/internal/gdrive/export` with `{ driveFileId, exportMimeType, userId }`
4. Receive file content (base64-encoded) from the response
5. Generate a new S3/R2 storage key (e.g., `library/{tenantId}/{itemId}/edited-{timestamp}.{ext}`)
6. Upload to S3/R2 using `storagePut(newKey, fileBuffer, contentType)`
7. Create a content version using the existing `createContentVersion` function from `libraryService.ts` -- this stores the previous `source_url` as a version snapshot
8. Update `library_items.source_url` to the new S3/R2 URL
9. Call Python backend `DELETE /api/internal/gdrive/files/{driveFileId}` to delete the temp Drive file
10. Update `google_drive_edit_sessions.status` to `"saved_back"`
11. Enqueue a re-indexing job by inserting into `library_index_jobs` with `jobType: "reindex"` and the appropriate `libraryItemId`
12. Return `{ success: true, newSourceUrl }`

#### `discardEditSession` mutation

**Input schema (Zod):**
```typescript
z.object({
  sessionId: z.number(),
})
```

**Logic:**
1. Fetch the `google_drive_edit_sessions` record. Verify it belongs to the current user and has `status: "active"`
2. Call Python backend `DELETE /api/internal/gdrive/files/{driveFileId}` to delete the temp Drive file
3. Update `google_drive_edit_sessions.status` to `"discarded"`
4. Return `{ success: true }`

#### `getActiveEditSession` query

**Input schema (Zod):**
```typescript
z.object({
  libraryItemId: z.number(),
})
```

**Logic:**
1. Query `google_drive_edit_sessions` for a record matching `libraryItemId`, `userId`, and `status: "active"`
2. Return the session object or `null`

### 2. Python Backend: Google Drive File Operations

**File:** `/home/dev/projects/SmartSpecPro/python-backend/app/api/google_drive.py`

This file is created in Section 03 (OAuth). This section adds three internal endpoints used by the Node.js tRPC router:

#### `POST /api/internal/gdrive/upload`

```python
# Accepts: file_content (base64), file_name, mime_type, convert (bool), user_id
# Uses GoogleTokenService to get a valid access token
# Calls Google Drive API: files.create with upload
#   - media_body: decoded file content
#   - body: { name, mimeType (target Google type if convert=true) }
#   - convert param handled by setting target mimeType in body
# Returns: { driveFileId, editUrl }
# editUrl format: https://docs.google.com/document/d/{id}/edit
#                 https://docs.google.com/spreadsheets/d/{id}/edit
```

#### `POST /api/internal/gdrive/export`

```python
# Accepts: drive_file_id, export_mime_type, user_id
# Uses GoogleTokenService to get a valid access token
# Calls Google Drive API: files.export(fileId, mimeType)
# Returns: { content: base64-encoded file content, size: int }
```

#### `DELETE /api/internal/gdrive/files/{file_id}`

```python
# Accepts: file_id (path param), user_id (from auth context)
# Uses GoogleTokenService to get a valid access token
# Calls Google Drive API: files.delete(fileId)
# Returns: { success: true }
# Handles 404 gracefully (file already deleted)
```

### 3. Python Backend: Celery Task for Edit Session Cleanup

**File:** `/home/dev/projects/SmartSpecPro/python-backend/app/tasks/google_drive_tasks.py`

Create a new Celery task file for Google Drive background operations. Register the periodic task in the Celery beat schedule.

```python
# Task: cleanup_expired_edit_sessions
# Runs periodically (every 30 minutes via Celery beat)
#
# Logic:
# 1. Query all google_drive_edit_sessions with status="active"
# 2. For sessions where expires_at < now():
#    a. Call Google Drive API: files.get(fileId, fields='modifiedTime')
#    b. If modifiedTime is within last 2 hours:
#       - Extend expires_at by 24 hours
#       - Log: "Extended session {id} because Drive file was recently modified"
#    c. Else:
#       - Call files.delete(fileId) to remove temp file
#       - Set session status to "expired"
# 3. For sessions where expires_at is within 2 hours:
#    - Send in-app notification to user: "Your edit session for '{file_title}' expires soon. Save your changes."
#    - (In-app notification via existing notification system or a simple DB insert)
# 4. Handle errors:
#    - Token expired (401): mark session as "expired", skip Drive file deletion
#    - File not found (404): mark session as "expired" (file was already deleted)
#    - Other errors: log and retry next cycle
```

### 4. Frontend: "Edit in Google" Button in DocumentPreviewPanel

**File:** `/home/dev/projects/SmartSpecPro/apps/web/client/src/components/library/DocumentPreviewPanel.tsx`

Modify the existing `DocumentPreviewPanel` component to add an "Edit in Google Docs/Sheets" button. The button appears only when:
- The `previewType` is `"office"` or `"excel"`
- The user has a connected Google account (query `trpc.googleDrive.getConnectionStatus`)

**Location in the component:** Add the button in the header area, next to the existing "Download File" button.

**Behavior:**
- On click, call `trpc.googleDrive.openForEditing.mutate({ libraryItemId: item.id })`
- On success, open the `editUrl` in a new tab via `window.open(editUrl, '_blank')`
- Show a loading spinner while the mutation is in progress
- If an active session already exists (returned from server), offer to open the existing edit URL

### 5. Frontend: EditInGoogleBar Status Bar Component

**File:** `/home/dev/projects/SmartSpecPro/apps/web/client/src/components/library/EditInGoogleBar.tsx`

Create a new component that renders a status bar when an active Google edit session exists for the currently previewed file.

**Props:**
```typescript
interface EditInGoogleBarProps {
  libraryItemId: number;
}
```

**Internal behavior:**
- Uses `trpc.googleDrive.getActiveEditSession.useQuery({ libraryItemId })` to check for an active session
- If no active session, renders nothing (`null`)
- If active session exists, renders a horizontal bar (similar to the markdown editor's status bar) showing:
  - Status icon (editing indicator)
  - Text: "Editing in Google Docs" or "Editing in Google Sheets"
  - Time remaining until expiry
  - Three action buttons:
    - **Save back**: calls `trpc.googleDrive.saveBack.mutate({ sessionId })`, shows loading state, shows success toast on completion
    - **Discard**: calls `trpc.googleDrive.discardEditSession.mutate({ sessionId })` with a confirmation dialog ("Discard all changes made in Google?"), shows success toast
    - **Open again**: opens `session.editUrl` in a new tab via `window.open`

**Styling:** Use Tailwind classes consistent with the rest of the library UI. The bar should have a subtle blue/indigo background to indicate an active editing state. Use Radix UI `AlertDialog` for the discard confirmation.

**Placement:** Render this component inside `DocumentPreviewPanel.tsx`, just above the preview content area, when the file is an office/excel type. Pass `item.id` as `libraryItemId`.

### 6. Wire EditInGoogleBar into DocumentPreviewPanel

**File:** `/home/dev/projects/SmartSpecPro/apps/web/client/src/components/library/DocumentPreviewPanel.tsx`

Add the `EditInGoogleBar` component rendering just after the document header area (after the gradient header `div` with title and badges), before the preview type switch. It should render for `office` and `excel` preview types:

```typescript
// After the header div and before the previewType conditionals:
{(previewType === "office" || previewType === "excel") && item.id ? (
  <EditInGoogleBar libraryItemId={item.id} />
) : null}
```

Import `EditInGoogleBar` at the top of the file.

## File Summary

| File | Action | Description |
|------|--------|-------------|
| `/home/dev/projects/SmartSpecPro/apps/web/server/routers/googleDrive.ts` | Modify (extend) | Add `openForEditing`, `saveBack`, `discardEditSession`, `getActiveEditSession` procedures |
| `/home/dev/projects/SmartSpecPro/apps/web/server/routers/googleDrive.test.ts` | Create/Modify | Tests for edit session mutations |
| `/home/dev/projects/SmartSpecPro/python-backend/app/api/google_drive.py` | Modify (extend) | Add internal endpoints: upload, export, delete file |
| `/home/dev/projects/SmartSpecPro/python-backend/app/tasks/google_drive_tasks.py` | Create | Celery task for `cleanup_expired_edit_sessions` |
| `/home/dev/projects/SmartSpecPro/python-backend/tests/test_google_drive_tasks.py` | Create | Tests for edit session cleanup task |
| `/home/dev/projects/SmartSpecPro/apps/web/client/src/components/library/EditInGoogleBar.tsx` | Create | Status bar component for active edit sessions |
| `/home/dev/projects/SmartSpecPro/apps/web/client/src/components/library/EditInGoogleBar.test.tsx` | Create | Component tests |
| `/home/dev/projects/SmartSpecPro/apps/web/client/src/components/library/DocumentPreviewPanel.tsx` | Modify | Add "Edit in Google" button and wire in `EditInGoogleBar` |

## Important Notes

- The `google_drive_edit_sessions` table must already exist (created in Section 02). If implementing this section before Section 02 is complete, create the table definition first.
- The Python backend endpoints (`/api/internal/gdrive/*`) use the `GoogleTokenService` from Section 03. The token service handles refresh automatically -- no manual token management is needed in this section.
- Editing is free (no credit charge). Only re-indexing after save-back incurs credits (handled by the existing indexing pipeline from Section 04).
- The `drive.file` scope (not `drive.readonly`) is sufficient for edit operations because the app creates the temporary Drive files itself. This means edit functionality works even before Google's `drive.readonly` scope verification is approved.
- The `createContentVersion` function already exists in `libraryService.ts` (Feature 009 version system) and should be reused for creating a snapshot before overwriting `source_url`.
- The `storagePut` and `storageGet` functions from `/home/dev/projects/SmartSpecPro/apps/web/server/storage.ts` handle S3/R2/local storage abstraction transparently.