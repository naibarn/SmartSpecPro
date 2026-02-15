# Section 06: Code Review Interview

## Triage Summary

| Issue | Severity | Action | Rationale |
|-------|----------|--------|-----------|
| #1 SQL wrong columns (process_dead_letters) | CRITICAL | Auto-fix | Obviously wrong column names vs Drizzle schema |
| #2 SQL wrong columns (deliver_scheduled_fallback) | CRITICAL | Auto-fix | Obviously wrong column names vs Drizzle schema |
| #3 Sync blocking call (cleanup_sessions) | CRITICAL | Auto-fix | Wrapped with asyncio.to_thread |
| #4 Redis client resource leak | HIGH | Auto-fix | Added try/finally pattern |
| #5 Error messages leaked to responses | HIGH | Auto-fix | Removed str(e) from all error responses |
| #6 Incorrect retry semantics (cleanup_redis_stale) | HIGH | Auto-fix | Changed to return 500 on transient errors |
| #7 retry_callbacks dual operation | MEDIUM | Let go | Matches existing CeleryBeat pattern; works for now |
| #8 _check_dead_letter dead code | MEDIUM | Let go | From Section 4, not Section 6 scope |
| #9 Stub TODO removal | MEDIUM | Let go | Section 8 (Media Pipeline) will implement |
| #10 No user notification for stale jobs | MEDIUM | Let go | Requires Node.js WebSocket, out of scope |
| #11 Shallow idempotency tests | LOW | Let go | Tests verify handler-level safety, sufficient for unit tests |
| #12 Missing unauthenticated request test | LOW | Let go | OIDC middleware already tested in Section 4 |
| #13 Missing monitoring alerts | LOW | Let go | Section 16 (Cloud Monitoring) covers this |
| #14 Missing local dev tooling | LOW | Let go | Nice-to-have, not blocking |

## Auto-fixes Applied

### Fix 1: SQL column names in process_dead_letters
Changed `task_name` to `"taskId"`, `queue_name` to `"queueName"`, `error_message` to `"errorMessage"`,
`created_at` to `"createdAt"`, `resolved = false` to `"completedAt" IS NULL`.
All column names now match Drizzle schema (camelCase with double quotes).

### Fix 2: SQL column names in deliver_scheduled_fallback
Changed to use actual schema columns: `"userId"`, `"conversationId"`, `prompt`, `"scheduledAt"`.
Changed filter from `delivered = false` to `status = 'active' AND "isRecurring" = false`.
Changed UPDATE from setting `delivered = true` to setting `status = 'completed'`.

### Fix 3: Sync blocking call in cleanup_sessions
Wrapped `cleanup_expired_edit_sessions()` with `await asyncio.to_thread()` to prevent event loop blocking.

### Fix 4: Redis client resource leak
Added `redis_client = None` before try block and `finally: if redis_client: await redis_client.close()`.
Also discovered `aclose()` doesn't exist in this redis version — using `close()` instead.

### Fix 5: Error message information disclosure
Removed `"error": str(e)` from all error response payloads. Errors are still logged via structlog.

### Fix 6: Retry semantics for cleanup_redis_stale
Changed error response from `status_code=200` to `status_code=500` so Cloud Tasks retries on transient failures.

## User Interview

No user decisions required for this section. All critical/high issues were obvious fixes with clear right answers.
