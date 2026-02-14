Now I have all the context I need. Let me generate the section content.

# Section 13: Rate Limiting & Error Handling

## Overview

This section implements per-user rate limiting for Google Drive API operations at the Node.js router level, exponential backoff for Google API 429/503 responses in the Python backend, token error detection and recovery, sync error resilience (skip-and-continue), webhook failure fallback to periodic polling, and JSONL audit logging for all Google API calls.

This is a **cross-cutting concern** with no hard dependencies on other sections. It can be implemented at any point and applies to the `googleDriveRouter` (section-03), sync tasks (section-11), MCP tools (section-09), and content extraction (section-06) once those exist.

## Dependencies

- **section-03-oauth-consent** (soft): the `googleDriveRouter` tRPC router where per-user rate limit middleware is applied
- **section-11-sync-webhooks** (soft): the webhook handler and sync Celery tasks where error handling is applied
- **section-06-content-extraction** (soft): the `GoogleContentExtractor` where Google API backoff is applied
- **section-02-database-schema** (soft): the `google_drive_sync_state` table where `last_error` is stored

These are soft dependencies -- rate limiting and error handling utilities can be built and tested independently. They are wired into the other sections' code paths at integration time.

## Tests

### Vitest -- Per-User Rate Limiting (Node.js)

**File:** `/home/dev/projects/SmartSpecPro/apps/web/server/services/googleDriveRateLimiter.test.ts`

```
# Test: Google Drive search respects 30/min per-user limit
# Test: Google Drive read respects 60/min per-user limit
# Test: Google Drive sync respects 5/min per-user limit
# Test: Google Drive edit respects 10/min per-user limit
# Test: rate-limited requests return 429 with retry-after header
# Test: different users have independent rate limit buckets
# Test: rate limit resets after window expires
# Test: getRemaining returns correct remaining count
# Test: getResetTime returns time until window resets
```

### pytest -- Exponential Backoff and Error Handling (Python)

**File:** `/home/dev/projects/SmartSpecPro/python-backend/tests/test_google_api_error_handling.py`

```
# Test: exponential backoff retries on 429 with increasing delays (1s, 2s, 4s, 8s, 16s, 32s cap)
# Test: backoff adds jitter to prevent thundering herd
# Test: exponential backoff retries on 503 responses
# Test: non-retryable errors (400, 404) are not retried
# Test: invalid_grant detection updates connection status to "expired"
# Test: invalid_grant pauses sync and webhooks but preserves existing data
# Test: sync continues after individual file failure (skip and log)
# Test: sync reports summary (succeeded, failed, skipped counts)
# Test: webhook failure falls back to periodic polling after N failures
# Test: audit log entry created for every Google API call with traceId, userId, operation, latency
```

## Implementation Details

### 1. Per-User Rate Limiters for Drive Operations (Node.js)

**File to create:** `/home/dev/projects/SmartSpecPro/apps/web/server/services/googleDriveRateLimiter.ts`

This file follows the exact pattern of the existing `rateLimiter.ts` (at `/home/dev/projects/SmartSpecPro/apps/web/server/services/rateLimiter.ts`) which uses the `createRateLimiter` factory function with sliding window algorithm.

Create four pre-configured rate limiter instances using `createRateLimiter`:

| Operation | Limiter Name | Window | Max Requests | Block Duration |
|-----------|-------------|--------|-------------|----------------|
| Search | `gdrive-search` | 60000ms (1 min) | 30 | 10000ms |
| Read | `gdrive-read` | 60000ms (1 min) | 60 | 10000ms |
| Sync | `gdrive-sync` | 60000ms (1 min) | 5 | 30000ms |
| Edit | `gdrive-edit` | 60000ms (1 min) | 10 | 30000ms |

Export each limiter instance (e.g., `gdriveSearchLimiter`, `gdriveReadLimiter`, `gdriveSyncLimiter`, `gdriveEditLimiter`).

The key for each rate limit check should be the user ID (not IP), since Drive operations are always authenticated. The key format is `user:{userId}`.

**File to create:** `/home/dev/projects/SmartSpecPro/apps/web/server/services/googleDriveRateLimitMiddleware.ts`

Create a tRPC middleware factory function that wraps the rate limiter check into a tRPC middleware. This follows the pattern in `/home/dev/projects/SmartSpecPro/apps/web/server/_core/rateLimitedProcedure.ts` but uses user ID instead of IP:

```typescript
/**
 * Creates a tRPC middleware that enforces per-user rate limiting for
 * Google Drive operations. Throws TRPCError with code TOO_MANY_REQUESTS
 * when the limit is exceeded, including retry-after metadata.
 */
export function createGDriveRateLimitMiddleware(limiter: ReturnType<typeof createRateLimiter>)
```

The middleware should:
1. Extract `userId` from `ctx.session.userId`
2. Call `limiter.isAllowed(String(userId))`
3. If not allowed, throw `TRPCError` with code `TOO_MANY_REQUESTS` and include `retryAfter` in the error's data (from `limiter.getResetTime()`)
4. If allowed, call `next()`

**File to modify:** `/home/dev/projects/SmartSpecPro/apps/web/server/routers/googleDrive.ts` (created by section-03)

Apply the rate limit middleware to the relevant tRPC procedures. Each procedure should use the appropriate limiter via the middleware:

- Search-related procedures (e.g., `searchFiles`, `listFolder`): use `gdriveSearchLimiter`
- Read-related procedures (e.g., `readFile`, `getFileInfo`): use `gdriveReadLimiter`
- Sync-related procedures (e.g., `startSync`, `syncNow`): use `gdriveSyncLimiter`
- Edit-related procedures (e.g., `openForEditing`, `saveBack`): use `gdriveEditLimiter`

The middleware is applied using tRPC's `.use()` method on the procedure builder, before the resolver.

### 2. Google API Exponential Backoff with Jitter (Python)

**File to create:** `/home/dev/projects/SmartSpecPro/python-backend/app/services/google_api_retry.py`

Create a decorator and utility function for retrying Google API calls with exponential backoff and jitter. This builds on the existing pattern in `/home/dev/projects/SmartSpecPro/python-backend/app/core/error_handling.py` but is specifically tuned for Google API rate limits.

The decorator should implement the following backoff schedule:
- Initial delay: 1 second
- Exponential base: 2
- Max delay cap: 32 seconds
- Jitter: add random value between 0 and `delay * 0.5` to prevent thundering herd
- Max retries: 5 (i.e., delays of ~1s, ~2s, ~4s, ~8s, ~16s then give up)

Retryable HTTP status codes from Google:
- `429` -- Too Many Requests (rate limited)
- `503` -- Service Unavailable

Non-retryable status codes that should raise immediately:
- `400` -- Bad Request
- `401` -- Unauthorized (token issue, handle separately)
- `403` -- Forbidden (scope or permission issue)
- `404` -- Not Found

The function signature:

```python
def google_api_retry(
    max_retries: int = 5,
    initial_delay: float = 1.0,
    max_delay: float = 32.0,
    exponential_base: float = 2.0,
):
    """
    Decorator for retrying Google API calls with exponential backoff and jitter.
    Retries on 429 and 503 responses. Adds random jitter to prevent thundering herd.
    """
```

Also create a helper class `GoogleAPIError` that extends `ExternalAPIError` (from the existing error handling module) with fields for HTTP status code and Google error reason.

### 3. Token Error Handling -- `invalid_grant` Detection

**File to modify:** `/home/dev/projects/SmartSpecPro/python-backend/app/services/google_token_service.py` (created by section-03)

When the `GoogleTokenService.get_valid_access_token()` method attempts to refresh a token and receives an `invalid_grant` error from Google's OAuth endpoint, the following sequence must happen:

1. Update the `oauth_connections` record: set `status = 'expired'`
2. Update `google_drive_sync_state` (if exists): set `auto_sync_enabled = false`
3. If a webhook channel is active (section-11), mark it for cleanup (do not attempt to stop it since the token is invalid)
4. Raise a custom `InvalidGrantError` exception that callers can catch

The `InvalidGrantError` is a subclass of `NonRetryableError` (from `/home/dev/projects/SmartSpecPro/python-backend/app/core/error_handling.py`) so that retry decorators do not retry it.

**User notification flow:** When `invalid_grant` is detected, the Node.js `googleDriveRouter.getConnectionStatus` procedure already reads the connection status from the database. The frontend Integrations tab (section-03, section-12) checks for `status === "expired"` and displays a banner with a "Reconnect" button. No additional work is needed in this section for the UI -- just ensure the status is correctly set in the database.

### 4. Sync Error Handling -- Skip-and-Continue

**File to modify:** `/home/dev/projects/SmartSpecPro/python-backend/app/tasks/google_drive_tasks.py` (created by section-11)

The sync task (`process_drive_changes` or `initial_sync`) iterates over a list of files to index. When processing an individual file fails (content extraction error, embedding error, credit billing error, etc.), the sync task must:

1. **Not stop** the overall sync -- catch the exception for the individual file
2. **Log the error** with `structlog` including the file ID, file name, error message, and error type
3. **Increment a skip counter** -- track `succeeded`, `failed`, and `skipped` counts
4. **Record the error** in `google_drive_sync_state.last_error` as a JSON string containing the last N errors (keep last 10), each with timestamp, file_id, file_name, and error_message
5. **Continue** to the next file
6. After all files are processed, **report a summary** -- log and return `{ succeeded: N, failed: N, skipped: N, total: N }`

The error handling structure should wrap individual file processing:

```python
async def process_files_batch(files: list[DriveFileMetadata], ...) -> SyncSummary:
    """
    Process a batch of files for indexing. Individual file failures do not
    stop the batch. Returns a summary with succeeded/failed/skipped counts.
    """
```

Specific error types and their handling:
- `InvalidGrantError` -- stop the entire sync (token is invalid, no point continuing)
- `GoogleAPIError` with status 429/503 -- apply backoff, then retry the file (not skip)
- `GoogleAPIError` with status 404 -- file was deleted, skip and mark as removed
- `InsufficientCreditsError` -- stop the sync (budget reached), report remaining files as skipped
- All other errors -- skip the file, log it, continue

### 5. Webhook Failure Fallback to Periodic Polling

**File to modify:** `/home/dev/projects/SmartSpecPro/python-backend/app/tasks/google_drive_tasks.py` (created by section-11)

When webhook delivery fails (Google cannot reach the webhook endpoint, or the channel renewal fails), the system should fall back to periodic polling:

Track webhook health in `google_drive_sync_state` by adding failure tracking logic:

1. Each time the webhook handler is invoked successfully, reset a failure counter (stored in Redis with key `gdrive:webhook_health:{user_id}`, TTL 24h)
2. Each time the channel renewal task fails or no webhook is received for 2x the expected interval, increment the failure counter
3. When the failure counter reaches 3, disable the webhook (`channel_id = null`) and enable a periodic polling mode

**Polling fallback:** Create a Celery periodic task `poll_drive_changes` that runs every 15 minutes. This task:

1. Queries `google_drive_sync_state` records where `channel_id IS NULL` AND `auto_sync_enabled = true`
2. For each such record, fetches changes from the Changes API using the stored `page_token`
3. Processes the changes (same as the webhook handler would)
4. Attempts to re-establish the webhook channel; on success, resume webhook mode

The periodic task should be registered in the Celery beat schedule:

```python
# In celery_app.py beat_schedule:
"poll-drive-changes": {
    "task": "app.tasks.google_drive_tasks.poll_drive_changes",
    "schedule": crontab(minute="*/15"),
}
```

### 6. Audit Logging for Google API Calls

**File to modify:** `/home/dev/projects/SmartSpecPro/apps/web/server/services/auditLogger.ts`

Extend the `AuditEventType` type to include a new event type for Google Drive operations:

```typescript
export type AuditEventType =
  | "llm_request"
  | "llm_response"
  | "llm_stream_end"
  | "media_request"
  | "media_response"
  | "library_mutation"
  | "rollout_gate"
  | "skill_detect"
  | "skill_execute"
  | "gdrive_api_call"  // NEW
  | "error";
```

**File to create:** `/home/dev/projects/SmartSpecPro/apps/web/server/services/googleDriveAuditLogger.ts`

Create a thin wrapper around the existing `auditLogger` singleton that provides a convenient function for logging Google Drive API operations:

```typescript
/**
 * Log a Google Drive API operation to the JSONL audit trail.
 * Automatically includes traceId from the current trace context.
 */
export function logGDriveApiCall(params: {
  userId: number;
  operation: string;      // e.g., "search", "read", "sync", "edit.open", "edit.save_back"
  latencyMs: number;
  success: boolean;
  driveFileId?: string;
  errorMessage?: string;
  metadata?: Record<string, unknown>;
}): void
```

This function calls `auditLogger.log()` with:
- `eventType: "gdrive_api_call"`
- `traceId` from `getTraceId()` (imported from `traceContext.ts`)
- `userId` from the params
- `timing: { totalMs: latencyMs }`
- `metadata` containing `operation`, `driveFileId`, `success`, and any additional metadata
- `errorMessage` if the operation failed

**Python-side audit logging:** In the Python backend, use `structlog` (already available) to log Google API calls. The existing structured logging configuration writes to stdout/stderr which is captured by the process manager. For Google API calls specifically, log entries should include:

- `event`: `"google_api_call"`
- `user_id`: the user making the request
- `operation`: the API method (e.g., `files.list`, `files.get`, `documents.get`)
- `latency_ms`: time taken
- `status`: HTTP status code from Google
- `drive_file_id`: if applicable
- `error`: error message if failed

This is done inline where Google API calls are made (in `google_content_extractor.py`, `google_drive_mcp.py`, `google_drive_tasks.py`) rather than as a separate service.

## File Summary

### New Files

| File | Purpose |
|------|---------|
| `/home/dev/projects/SmartSpecPro/apps/web/server/services/googleDriveRateLimiter.ts` | Per-user rate limiter instances for Drive operations |
| `/home/dev/projects/SmartSpecPro/apps/web/server/services/googleDriveRateLimitMiddleware.ts` | tRPC middleware factory for applying rate limits |
| `/home/dev/projects/SmartSpecPro/apps/web/server/services/googleDriveAuditLogger.ts` | Thin wrapper for JSONL audit logging of Drive operations |
| `/home/dev/projects/SmartSpecPro/apps/web/server/services/googleDriveRateLimiter.test.ts` | Tests for rate limiting |
| `/home/dev/projects/SmartSpecPro/python-backend/app/services/google_api_retry.py` | Exponential backoff decorator for Google API calls |
| `/home/dev/projects/SmartSpecPro/python-backend/tests/test_google_api_error_handling.py` | Tests for backoff, error handling, sync resilience |

### Modified Files

| File | Change |
|------|--------|
| `/home/dev/projects/SmartSpecPro/apps/web/server/services/auditLogger.ts` | Add `"gdrive_api_call"` to `AuditEventType` union |
| `/home/dev/projects/SmartSpecPro/apps/web/server/routers/googleDrive.ts` | Apply rate limit middleware to procedures (after section-03 creates this file) |
| `/home/dev/projects/SmartSpecPro/python-backend/app/services/google_token_service.py` | Add `InvalidGrantError` handling that sets connection status to `"expired"` (after section-03 creates this file) |
| `/home/dev/projects/SmartSpecPro/python-backend/app/tasks/google_drive_tasks.py` | Add skip-and-continue error handling and webhook failure fallback polling task (after section-11 creates this file) |
| `/home/dev/projects/SmartSpecPro/python-backend/app/core/celery_app.py` | Add `poll-drive-changes` to beat schedule |

## Implementation Checklist

1. Create `googleDriveRateLimiter.ts` with four rate limiter instances using `createRateLimiter`
2. Create `googleDriveRateLimitMiddleware.ts` with `createGDriveRateLimitMiddleware` factory
3. Write Vitest tests for rate limiting (the test file above)
4. Create `google_api_retry.py` with exponential backoff decorator and `GoogleAPIError` class
5. Create `InvalidGrantError` in `google_api_retry.py` (subclass of `NonRetryableError`)
6. Write pytest tests for backoff, jitter, invalid_grant, sync skip-and-continue, webhook fallback
7. Add `"gdrive_api_call"` to `AuditEventType` in `auditLogger.ts`
8. Create `googleDriveAuditLogger.ts` wrapper function
9. Wire rate limit middleware into `googleDrive.ts` procedures (once section-03 is implemented)
10. Wire `google_api_retry` decorator onto Google API call sites in `google_content_extractor.py`, `google_drive_mcp.py`, `google_drive_tasks.py` (once sections 06, 09, 11 are implemented)
11. Add skip-and-continue error handling to the sync task's file processing loop (once section-11 is implemented)
12. Add webhook health tracking and `poll_drive_changes` periodic task (once section-11 is implemented)
13. Register `poll-drive-changes` in the Celery beat schedule in `celery_app.py`