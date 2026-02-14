# Section 14 Code Review Interview

## Auto-fixes Applied

### Fix 1: TOCTOU race in oauth_connections DELETE (Finding #2 - HIGH)
- Added `AND status = 'revoked'` to the DELETE query in step 10
- Prevents deleting a freshly re-established active connection if user reconnects during cleanup

### Fix 2: Celery task_routes key mismatch (Finding #3 - MEDIUM)
- Changed route key to fully-qualified `app.tasks.google_drive_tasks.disconnect_google_drive_cleanup`
- Removed custom `name=` parameter from task decorator to use auto-generated fully-qualified name
- Consistent with all other task routing entries in celery_app.py

### Fix 3: Missing tenant_id filter in temp file deletion (Finding #5 - MEDIUM)
- Added `AND tenant_id = :tenant_id` to the edit sessions query in `_delete_temp_drive_files`
- Updated function signature to accept `tenant_id` parameter
- Updated call site to pass `tenant_id`
- Ensures multi-tenant safety

## Let-go Items

1. **#1 Vector store cleanup (HIGH)**: Orphaned vectors don't match deleted items, cause no search issues. Admin maintenance task can clean later. Vector store abstraction varies by deployment.
2. **#4 Async/sync mismatch (MEDIUM)**: Celery event loop is single-purpose. Google API client is synchronous by design. Matches existing patterns in same file.
3. **#6 Error detail leaking (MEDIUM)**: Internal-only endpoint. Matches existing `/credits/charge` pattern. Section 15 will address.
4. **#7 No step-tracking for retries (MEDIUM)**: Each step is naturally idempotent. Token revocation check handles None conn gracefully. Not worth the complexity.
5. **#8 Timing-safe comparison (MEDIUM)**: Matches existing Node.js pattern. Section 15 will address across all internal endpoints.
6. **#9 Count accuracy (LOW)**: Counts are for audit logging only. Approximation is acceptable.
7. **#10 No JSONL audit (LOW)**: Standard Python logger is appropriate for Celery tasks. Node.js audit logger is process-local.
8. **#11 Double-click (LOW)**: React Query mutations are single-flight while pending. Non-issue.
9. **#12 Plan deviation (LOW)**: Using internal_gdrive.py instead of oauth.py is better architecture. Code is internally consistent.
