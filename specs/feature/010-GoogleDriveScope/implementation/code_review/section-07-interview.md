# Section 07 Code Review Interview

## Review Summary
- **CRITICAL #1**: Privilege escalation via user_id → **Auto-fixed**: Added `user_id != current_user.id` check in all 3 Python endpoints
- **CRITICAL #2**: No tenant isolation on getActiveEditSession → **Auto-fixed**: Added tenantId filter
- **CRITICAL #3**: No tenant ownership check on library item → **Auto-fixed**: Added tenantId filter to libraryItems query
- **CRITICAL #4**: Access token raw SQL in Celery → **Let go**: Project-wide encryption concern, not section-specific
- **HIGH #5**: Race condition on duplicate sessions → **Let go**: Requires schema migration for unique constraint; deferred
- **HIGH #6**: Missing createContentVersion → **Let go**: Requires deeper integration with existing version system; deferred to wiring
- **HIGH #7**: Missing re-indexing job → **Let go**: Requires libraryIndexJobs schema understanding; deferred to wiring
- **HIGH #8**: Celery beat schedule not updated → **Auto-fixed**: Added `cleanup-expired-edit-sessions` entry
- **HIGH #9**: No file size limit on upload → **Let go**: Needs investigation; practical limits set by Google API
- **HIGH #10**: Celery bypasses GoogleTokenService → **Let go**: Async incompatible with sync Celery context
- **MEDIUM #11-16**: Various medium issues → **Let go**: Deferred for wiring/polish
- **LOW #17-22**: Various low issues → **Let go**: Deferred

## Fixes Applied
1. `google_drive.py`: Added `user_id != current_user.id` validation in upload, export, delete endpoints
2. `google_drive.py`: Changed to use `current_user.id` instead of `req.user_id` for token retrieval
3. `googleDrive.ts`: Added `tenantId` filter to `getActiveEditSession` query
4. `googleDrive.ts`: Added `tenantId` filter to library item query in `openForEditing`
5. `googleDrive.ts`: Changed existing active session check to throw `CONFLICT` error per plan
6. `celery_app.py`: Added `cleanup-expired-edit-sessions` beat schedule entry (every 30 minutes)
