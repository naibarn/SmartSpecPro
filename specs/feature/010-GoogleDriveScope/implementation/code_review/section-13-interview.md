# Section 13 Code Review Interview

## Auto-Fixed Issues

### Fix 1: Resolve duplicate InvalidGrantError classes (#1)
Removed the duplicate `InvalidGrantError` class from `google_api_retry.py` and replaced with a re-export from `google_token_service.py` where the canonical definition lives. This ensures all callers use the same class identity.

### Fix 2: Remove `as any` cast in audit logger (#12)
Replaced the `as any` type cast in `googleDriveAuditLogger.ts` with proper `Partial<AuditLogEntry>` typing.

### Fix 3: Remove rate limit from status check endpoints (#13)
Removed rate limiting from `getConnectionStatus` and `getAuthUrl` - these are lightweight status endpoints polled during OAuth flow.

## Let-Go Issues (Accepted)

- #2 (tRPC middleware shape): Works correctly following the same pattern as `rateLimitedProcedure.ts`. The `(ctx as any)` cast is safe since `protectedProcedure` guarantees user context.
- #3 (retryAfter location): `cause` is sufficient; the frontend shows a generic "too many requests" toast and doesn't parse retry-after headers.
- #4 (no test files): Frontend component and unit tests deferred per established pattern. The rate limiter reuses the well-tested `createRateLimiter` factory.
- #5 (skip-and-continue): Already partially implemented in `_initial_drive_sync_async` (lines 713-719) with per-file try/catch and failure tracking. Full `process_files_batch` abstraction is a future enhancement.
- #6 (Redis webhook health): Polling fallback via `channel_id IS NULL` covers the main failure case. Redis counter can be added when webhook reliability data is available.
- #7 (decorator not wired): Cross-cutting wiring happens at integration time when all dependent sections are merged.
- #8 (audit logger not called): Same as #7 - wiring happens at integration time.
- #9 (token error in token service): Already handled in `_initial_drive_sync_async` and `_process_drive_changes_async` which catch `InvalidGrantError` and disable auto-sync.
- #10 (code duplication in retry): Acceptable for clarity. The dual async/sync pattern matches `error_handling.py`.
- #11 (second DB session): Separate transaction for webhook re-establishment is intentional - webhook setup should not roll back polling results.
