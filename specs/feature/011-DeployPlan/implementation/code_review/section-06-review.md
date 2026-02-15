# Section 06: Cloud Scheduler - Code Review

## Review Summary

The implementation covers the core requirements -- 12 scheduler jobs, handler endpoints, setInterval removal, CSRF exemption, provisioning/validation scripts, and tests. However, there are several significant issues ranging from incorrect SQL to a sync blocking call.

---

## CRITICAL Issues

### 1. SQL references non-existent columns in `process_dead_letters` handler
**File:** `task_handlers.py`, lines 333-344
The handler queries `cloud_task_events` with column names that don't match the Drizzle schema (camelCase columns, no `resolved` column). The exception is masked by the catch returning 200 with `"table_not_ready"`.

### 2. `deliver_scheduled_fallback` handler references wrong columns
**File:** `task_handlers.py`, lines 501-510
Similar issue: `scheduled_messages` table uses camelCase columns. No `delivered`, `delivered_at`, `channel_id`, or `content` columns exist.

### 3. Sync blocking call inside async handler blocks event loop
**File:** `task_handlers.py`, line 257
`cleanup_sessions` calls `cleanup_expired_edit_sessions()` which is sync and uses `get_sync_session()`, blocking the event loop.

---

## HIGH Severity Issues

### 4. Redis client not closed on exception path (resource leak)
**File:** `task_handlers.py`, lines 460-478
If `_cleanup_redis_stale_impl` throws, `redis_client.aclose()` is never reached.

### 5. Error messages leaked to HTTP responses (information disclosure)
Multiple handlers return `str(e)` in response body. Should return generic message.
Affected lines: 137, 159, 192, 214, 238, 265, 286, 309, 475.

### 6. `cleanup_redis_stale` swallows all errors and returns 200 (incorrect retry semantics)
A transient Redis connection error should return 500 for Cloud Tasks retry, not 200.

---

## MEDIUM Severity Issues

### 7. `retry_callbacks` runs two operations sequentially with shared error handling
If first succeeds but second fails, both get retried (duplicated work).

### 8. `_check_dead_letter` function is never called (dead code from Section 4)

### 9. On-demand handler stubs had TODO comments removed without implementation

### 10. No user notification for stale jobs
Original Node.js code called `notifyJobFailure()` — Python replacement doesn't notify users.

---

## LOW Severity Issues

### 11. Shallow idempotency test coverage (mocks prevent actual verification)
### 12. Missing `test_handler_rejects_unauthenticated_request` test
### 13. Missing monitoring alert creation
### 14. Missing local development tooling (`scripts/local-scheduler.sh`)
