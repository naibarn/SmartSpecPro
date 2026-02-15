# Section 13 Code Review: Sentry Integration

## CRITICAL

### 1. `Sentry.Handlers` API does not exist in @sentry/node v10
**Files:** `apps/web/server/_core/index.ts`, `apps/web/server/services/sentry.ts`
`Sentry.Handlers.requestHandler()` and `Sentry.Handlers.errorHandler()` are v7 API. In v10, use `Sentry.setupExpressErrorHandler(app)` instead. The request handler is not needed (expressIntegration handles it).

### 2. Frontend PII scrubbing only covers breadcrumbs, not extra data
**File:** `apps/web/client/src/main.tsx`
Plan says to scrub "breadcrumbs and extra data" but only breadcrumbs are handled.

## IMPORTANT

### 3. Python sentry_config reads os.environ instead of Pydantic settings
**File:** `python-backend/app/core/sentry_config.py`
Existing `config.py` has `SENTRY_DSN` field. Should use settings model.

### 4. X-Request-ID not forwarded in dedicated route handlers
Only the catch-all proxy forwards X-Request-ID. Dedicated routes (mediaJobs, approvals, etc.) don't.

### 5-8. Missing tests from plan
- X-Request-ID forwarding test
- X-Request-ID in log output test
- Python Sentry tags test
- FastAPI exception capture test

### 9. Sentry scope bleed between concurrent requests
Should use `getIsolationScope()` instead of `getCurrentScope()` in v10.

### 10. structlog.contextvars not cleared between requests
Needs `clear_contextvars()` at request start.

### 11. `sourcemap: true` exposes source code in production
Should use `sourcemap: "hidden"` for Sentry-only upload.

## SUGGESTION

### 12. No input validation on X-Request-ID header value
### 13. Python before_send doesn't handle string body data
### 14. init_sentry called before setup_logging

## GOOD

- Correct DSN gating in all three layers
- Comprehensive PII scrubbing on Node.js backend
- Proper correlation ID propagation through catch-all proxy
- Python RequestLoggingMiddleware correctly prefers incoming X-Request-ID
- Sentry flush on graceful shutdown in both services
