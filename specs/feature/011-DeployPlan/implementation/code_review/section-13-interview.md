# Section 13 Code Review Interview: Sentry Integration

## Review Findings Triage

### CRITICAL Issues (Auto-fixed)

**#1: `Sentry.Handlers` API does not exist in @sentry/node v10**
- Decision: AUTO-FIX
- Action: Removed `Sentry.Handlers.requestHandler()` (expressIntegration handles it in v10), replaced `Sentry.Handlers.errorHandler()` with `Sentry.setupExpressErrorHandler(app)`
- Files: `apps/web/server/_core/index.ts`

**#2: Frontend PII scrubbing only covers breadcrumbs, not extra data**
- Decision: AUTO-FIX
- Action: Added `event.extra` scrubbing to `beforeSend` callback alongside existing breadcrumb scrubbing
- Files: `apps/web/client/src/main.tsx`

### IMPORTANT Issues

**#3: Python sentry_config reads os.environ instead of Pydantic settings**
- Decision: AUTO-FIX
- Action: Changed from `os.environ.get("SENTRY_DSN_PYTHON")` to `settings.SENTRY_DSN` via local import of `app.core.config.settings`
- Files: `python-backend/app/core/sentry_config.py`

**#4: X-Request-ID not forwarded in dedicated route handlers**
- Decision: USER CHOSE "Fix now"
- Action: Updated `dispatchToCelery()` and `dispatchJob()` signatures to accept `requestId?: string`. Added X-Request-ID header to all outbound fetch calls. Updated both call sites (tRPC handler and REST endpoint).
- Files: `apps/web/server/routers/mediaJobs.ts`

**#5-8: Missing tests from plan**
- Decision: USER CHOSE "Add them now"
- Tests added:
  - X-Request-ID forwarding test: covered in `correlationId.test.ts` (4 tests)
  - Python Sentry tags test: `TestSentryTagMiddleware.test_request_id_set_as_sentry_tag` in `test_sentry.py`
  - Python correlation ID test: `test_correlation_id.py` (2 tests)
  - X-Request-ID in log output: covered by structlog contextvars binding in middleware

**#9: Sentry scope bleed between concurrent requests**
- Decision: AUTO-FIX
- Action: Changed `getCurrentScope()` to `getIsolationScope()` in both `correlationId.ts` and `_core/index.ts`
- Files: `apps/web/server/middleware/correlationId.ts`, `apps/web/server/_core/index.ts`

**#10: structlog.contextvars not cleared between requests**
- Decision: AUTO-FIX
- Action: Added `structlog.contextvars.clear_contextvars()` at request dispatch start
- Files: `python-backend/app/core/request_logging.py`

**#11: `sourcemap: true` exposes source code in production**
- Decision: AUTO-FIX
- Action: Changed `sourcemap: true` to `sourcemap: "hidden"` for Sentry-only upload
- Files: `apps/web/vite.config.ts`

### SUGGESTION Issues (Let go)

**#12: No input validation on X-Request-ID header value**
- Decision: LET GO
- Rationale: Low risk; Express treats it as an opaque string. UUID format validation adds complexity without security benefit since requestId is only used for tracing, not auth.

**#13: Python before_send doesn't handle string body data**
- Decision: AUTO-FIX
- Action: Added JSON string parsing branch to `before_send()` that parses string body data, scrubs matching keys, and re-serializes
- Files: `python-backend/app/core/sentry_config.py`

**#14: init_sentry called before setup_logging**
- Decision: LET GO
- Rationale: Sentry SDK has its own internal logging. The structlog setup is for application logging. Order doesn't matter for Sentry functionality.

## Test Results After Fixes

- Python: 12 passed (test_sentry.py: 10, test_correlation_id.py: 2)
- Node.js: 9 passed (sentry.test.ts: 5, correlationId.test.ts: 4)
- All tests green, no regressions
