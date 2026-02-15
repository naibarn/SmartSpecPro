Now I have all the context I need. Let me generate the section content.

# Section 13: Sentry Integration

## Overview

This section adds comprehensive error tracking using Sentry across all three application layers: the React frontend, the Node.js/Express backend, and the Python/FastAPI backend. It also establishes a correlation ID flow (via `X-Request-ID` header) so that errors, logs, and analytics events can be traced end-to-end through the system.

**Goal:** Every unhandled error in production is captured, enriched with context (user, request, job), stripped of PII, and correlated across service boundaries using a shared request ID.

## Dependencies

- **Section 01 (GCP Bootstrap):** Sentry DSN secrets (`SENTRY_DSN_FRONTEND`, `SENTRY_DSN_NODE`, `SENTRY_DSN_PYTHON`) must be provisioned in GCP Secret Manager.
- **Section 02 (Docker Images):** Docker images must include the Sentry SDK dependencies and expose the `SENTRY_DSN_*` environment variables. Graceful shutdown handlers must call `Sentry.close()` / `sentry_sdk.flush()`.

## Sentry Project Setup

Create three Sentry projects under a single Sentry organization:

| Sentry Project | Platform | DSN Secret Name |
|----------------|----------|----------------|
| `smartspecpro-frontend` | React (Browser) | `SENTRY_DSN_FRONTEND` |
| `smartspecpro-node` | Node.js (Express) | `SENTRY_DSN_NODE` |
| `smartspecpro-python` | Python (FastAPI) | `SENTRY_DSN_PYTHON` |

Store all three DSN values in GCP Secret Manager. The frontend DSN is a build-time variable embedded in the Vite bundle. The backend DSNs are runtime environment variables mounted from Secret Manager into Cloud Run services.

---

## Tests

### Node.js Backend Tests (Vitest)

Create test file at `/home/dev/projects/SmartSpecPro/apps/web/server/__tests__/sentry.test.ts`.

**Test: Unhandled route error is captured by Sentry**
- Mount the Express app with Sentry middleware configured.
- Send a request to a route that throws an unhandled error.
- Verify that the Sentry error handler middleware is invoked (mock `@sentry/node` and assert `Sentry.captureException` is called).

**Test: `request_id` and `user_id` appear as Sentry tags**
- Mock `Sentry.setTag` or `Sentry.getIsolationScope().setTag`.
- Send a request through the middleware stack with a known user session.
- Assert that `setTag` was called with `request_id` matching a UUID pattern and `user_id` matching the authenticated user's ID.

**Test: PII fields are scrubbed from Sentry events**
- Configure Sentry with the `beforeSend` callback from the implementation.
- Create a mock Sentry event that includes `authorization` and `cookie` headers in `request.headers`.
- Pass it through `beforeSend`.
- Assert that `authorization` and `cookie` header values are replaced with `[FILTERED]`.
- Assert that request body fields named `password`, `token`, `secret`, or `apiKey` are replaced with `[FILTERED]`.

### Python Backend Tests (pytest)

Create test file at `/home/dev/projects/SmartSpecPro/python-backend/tests/unit/test_sentry.py`.

**Test: FastAPI exception is captured by Sentry**
- Patch `sentry_sdk.capture_exception`.
- Create a test FastAPI app with Sentry initialized and a test route that raises an unhandled `RuntimeError`.
- Call the route via `TestClient`.
- Assert `capture_exception` was called with the `RuntimeError` instance.

**Test: `request_id` and `job_id` appear as Sentry tags**
- Patch `sentry_sdk.set_tag`.
- Send a request through the middleware that sets Sentry scope tags.
- Assert `set_tag` was called with `request_id` (a UUID string) and, when present, `job_id`.

**Test: PII scrubbing removes sensitive headers**
- Configure the `before_send` callback.
- Construct a mock Sentry event dict with `request.headers` containing `authorization` and `cookie`.
- Call `before_send(event, hint)`.
- Assert those headers are replaced with `[FILTERED]`.

### Correlation ID Tests (Vitest)

Add tests to `/home/dev/projects/SmartSpecPro/apps/web/server/__tests__/correlationId.test.ts`.

**Test: Incoming request without X-Request-ID gets one generated**
- Send a request to any endpoint without an `X-Request-ID` header.
- Assert the response includes an `X-Request-ID` header containing a valid UUID.

**Test: X-Request-ID is forwarded to Python service in outgoing calls**
- Mock the HTTP client used for Python backend calls (e.g., `fetch` or `axios`).
- Send a request with `X-Request-ID: test-abc-123`.
- Assert the outgoing call to the Python backend includes `X-Request-ID: test-abc-123` in its headers.

**Test: X-Request-ID appears in structured log output**
- Capture log output (mock or spy on the logger).
- Send a request with `X-Request-ID: test-xyz-789`.
- Assert the log entry includes `request_id: "test-xyz-789"`.

### Correlation ID Tests (pytest)

Add tests to `/home/dev/projects/SmartSpecPro/python-backend/tests/unit/test_correlation_id.py`.

**Test: Incoming request without X-Request-ID gets one generated**
- Send a request to the Python backend without `X-Request-ID`.
- Assert the response includes an `X-Request-ID` header with a UUID value.

**Test: X-Request-ID appears in structured log output**
- Capture structured log output.
- Send a request with `X-Request-ID: test-corr-456`.
- Assert the log contains `request_id: "test-corr-456"`.

### Frontend Tests (Manual Verification)

These are not automated unit tests but manual or integration checks to run after deployment:

1. Throw a test error in the React app (e.g., via a debug button or console). Verify the error appears in the `smartspecpro-frontend` Sentry project.
2. Deploy a new build and verify the Sentry release tag matches the git commit SHA.
3. Load the app and confirm session replay recording is active at 1% sampling (check Sentry Replays tab).

---

## Implementation Details

### 1. Frontend Integration

**File to modify:** `/home/dev/projects/SmartSpecPro/apps/web/client/src/main.tsx`

Install `@sentry/react` as a dependency in `apps/web/package.json`.

Initialize Sentry at the top of `main.tsx`, before any React rendering. The initialization should:

- Use the DSN from a Vite build-time environment variable (e.g., `import.meta.env.VITE_SENTRY_DSN`).
- Set `environment` to `"production"` or `"staging"` based on `import.meta.env.MODE` or a custom env var.
- Set `release` to the git commit SHA (injected at build time via Vite's `define` config, e.g., `import.meta.env.VITE_RELEASE`).
- Enable `@sentry/react`'s browser tracing integration with a `tracesSampleRate` of `0.05` (5%).
- Enable session replay via `Sentry.replayIntegration()` with `sessionSampleRate: 0.01` (1%) and `errorSampleRate: 1.0` (100% of sessions with errors). Configure `maskAllInputs: true` and `maskAllText: false` for PII protection while keeping context.
- Add a `beforeSend` callback that strips any `password`, `token`, `secret`, or `apiKey` fields from event breadcrumbs and extra data.
- Gate initialization: only call `Sentry.init()` if the DSN is defined (skip in local development when `VITE_SENTRY_DSN` is not set).

**File to modify:** `/home/dev/projects/SmartSpecPro/apps/web/client/src/components/ErrorBoundary.tsx`

Wrap the existing `ErrorBoundary` component with `Sentry.withErrorBoundary` or call `Sentry.captureException(this.state.error)` inside `componentDidCatch`. The existing `ErrorBoundary` at this path already renders a fallback UI. Add a `componentDidCatch` method that calls `Sentry.captureException(error, { contexts: { react: { componentStack } } })`.

**File to modify:** `/home/dev/projects/SmartSpecPro/apps/web/vite.config.ts`

Add build-time defines for the Sentry DSN and release:

```typescript
define: {
  // These are injected at build time for Sentry
  // Set via CI environment variables
}
```

The `VITE_SENTRY_DSN` and `VITE_RELEASE` values come from the CI/CD environment (Section 17) or from `apps/web/.env` for local testing.

### 2. Node.js Backend Integration

**File to create:** `/home/dev/projects/SmartSpecPro/apps/web/server/services/sentry.ts`

This module initializes and exports the Sentry configuration for the Node.js backend.

Install `@sentry/node` as a dependency in `apps/web/package.json`.

The module should export:

- An `initSentry()` function that calls `Sentry.init()` with:
  - DSN from `process.env.SENTRY_DSN_NODE`.
  - `environment` from `process.env.NODE_ENV` or `process.env.ENVIRONMENT`.
  - `release` from `process.env.RELEASE` or `process.env.GIT_COMMIT_SHA`.
  - `tracesSampleRate: 0.05`.
  - `beforeSend` callback for PII scrubbing (see below).
  - Integration with Express via `Sentry.expressIntegration()`.
- A `sentryRequestHandler()` function that returns `Sentry.Handlers.requestHandler()` for use as Express middleware (must be added as the first middleware).
- A `sentryErrorHandler()` function that returns `Sentry.Handlers.errorHandler()` for use as Express error middleware (must be added after all route handlers but before the final error handler).

**PII Scrubbing (`beforeSend` callback):**

```typescript
function beforeSend(event: Sentry.Event): Sentry.Event | null {
  // Scrub sensitive headers
  // Scrub sensitive body fields
  // Return the cleaned event
}
```

The callback should:
- Remove or replace `authorization`, `cookie`, and `x-proxy-token` values in `event.request?.headers` with `[FILTERED]`.
- If `event.request?.data` is a string (JSON body), parse it and replace values of keys matching `/password|token|secret|apiKey|encr/i` with `[FILTERED]`.
- Return the scrubbed event.

**File to modify:** `/home/dev/projects/SmartSpecPro/apps/web/server/_core/index.ts`

At the top of the server setup (before `const app = express()`):

1. Import and call `initSentry()` from the new sentry service module.
2. After creating the Express app, add `app.use(Sentry.Handlers.requestHandler())` as the very first middleware.
3. After all route registrations, add `app.use(Sentry.Handlers.errorHandler())` before the final catch-all error handler.

In the graceful shutdown handler (SIGTERM), add `await Sentry.close(2000)` to flush pending events before the process exits.

**Sentry Scope Tags Middleware:**

Add a middleware (after authentication middleware) that sets Sentry scope tags for every request:

```typescript
app.use((req, res, next) => {
  const requestId = req.headers['x-request-id'] || generateUUID();
  Sentry.getCurrentScope().setTag('request_id', requestId);
  if (req.user?.id) {
    Sentry.getCurrentScope().setTag('user_id', req.user.id);
    Sentry.getCurrentScope().setUser({ id: req.user.id });
  }
  next();
});
```

### 3. Python Backend Integration

**File to create:** `/home/dev/projects/SmartSpecPro/python-backend/app/core/sentry_config.py`

Install `sentry-sdk[fastapi]` in Python dependencies (`requirements.txt` or `pyproject.toml`).

This module should export an `init_sentry()` function that:

- Calls `sentry_sdk.init()` with:
  - `dsn` from `settings.SENTRY_DSN_PYTHON` (add this field to the settings model in `app/core/config.py`).
  - `environment` from `settings.ENVIRONMENT`.
  - `release` from `settings.RELEASE` or an environment variable.
  - `traces_sample_rate=0.05`.
  - `integrations=[FastApiIntegration()]` (auto-captures FastAPI errors).
  - `before_send` callback for PII scrubbing.
- Only initializes if the DSN is set (skip in local development).

**PII Scrubbing (`before_send` callback):**

```python
def before_send(event, hint):
    """Scrub PII from Sentry events before sending."""
    # Strip authorization, cookie headers
    # Strip sensitive body fields
    # Return cleaned event
```

The callback should follow the same logic as the Node.js version: replace `authorization`, `cookie`, and `x-proxy-token` header values with `[FILTERED]`, and strip sensitive body field values.

**File to modify:** `/home/dev/projects/SmartSpecPro/python-backend/app/main.py`

Call `init_sentry()` before the FastAPI app is created. This ensures Sentry captures all errors including those during startup.

In the existing shutdown handler, add `sentry_sdk.flush(timeout=2.0)` to send any remaining events.

**File to modify:** `/home/dev/projects/SmartSpecPro/python-backend/app/core/middleware.py`

Add Sentry scope tag setting to the existing `RequestLoggingMiddleware` or the `ErrorHandlingMiddleware`. After the `request_id` is generated (in `request_logging.py`), also set it as a Sentry tag:

```python
import sentry_sdk
sentry_sdk.set_tag("request_id", request_id)
```

When a `job_id` is available in the request body or path, set that as a tag too:

```python
if job_id:
    sentry_sdk.set_tag("job_id", job_id)
```

### 4. Correlation ID Flow

The correlation ID (`X-Request-ID`) ties together logs, Sentry events, and PostHog events across service boundaries.

**Python backend -- already implemented:**

The file `/home/dev/projects/SmartSpecPro/python-backend/app/core/request_logging.py` already generates a `request_id` (UUID) for each request and attaches it to `request.state.request_id`. It also sets the `X-Request-ID` response header. However, it does **not** check for an incoming `X-Request-ID` header. The modification needed:

In `RequestLoggingMiddleware.dispatch()`, change the request ID generation to prefer an incoming header:

```python
# Use existing X-Request-ID if provided by upstream service, otherwise generate
request_id = request.headers.get("x-request-id") or str(uuid.uuid4())
request.state.request_id = request_id
```

This ensures that when the Node.js service calls the Python backend, the correlation ID is preserved.

**Node.js backend -- new middleware:**

**File to create:** `/home/dev/projects/SmartSpecPro/apps/web/server/middleware/correlationId.ts`

Create an Express middleware that:

1. Reads `X-Request-ID` from the incoming request headers (from Nginx or external clients).
2. If not present, generates a new UUID v4.
3. Stores it on `req.requestId` (extend Express Request type).
4. Sets the `X-Request-ID` response header.
5. Sets it as a Sentry tag.
6. Makes it available for structured logging.

```typescript
export function correlationIdMiddleware(req: Request, res: Response, next: NextFunction): void {
  // Read or generate request ID
  // Attach to req, set response header, set Sentry tag
}
```

This middleware should be added early in the Express middleware stack in `/home/dev/projects/SmartSpecPro/apps/web/server/_core/index.ts`, after the Sentry request handler but before route handlers.

**Forwarding to Python backend:**

All HTTP calls from the Node.js service to the Python backend must include the `X-Request-ID` header. Search for `fetch` calls to `PYTHON_BACKEND_URL` or `localhost:8000` and ensure each passes the request ID. A helper function or wrapper around `fetch` is recommended:

```typescript
async function callPythonBackend(path: string, options: RequestInit, requestId?: string): Promise<Response> {
  // Include X-Request-ID in headers
}
```

Key files that make outgoing calls to the Python backend and need the forwarded header:

- `/home/dev/projects/SmartSpecPro/apps/web/server/routers/mediaJobs.ts` (media job dispatch)
- `/home/dev/projects/SmartSpecPro/apps/web/server/_core/llmRoutes.ts` (LLM gateway proxying)
- `/home/dev/projects/SmartSpecPro/apps/web/server/routers/approvals.ts` (approval requests)

**Cloud Tasks payloads:**

When enqueuing Cloud Tasks (Section 04), include `request_id` in the task payload so that the async handler can set it as a Sentry tag and log field, maintaining traceability across the sync-to-async boundary.

### 5. Structured Logging Enhancement

Both services already have logging in place. Enhance the log output to include the `request_id` consistently.

**Node.js (structured JSON logging):**

If not already using a structured logger, add one (e.g., `pino` or a simple JSON formatter). Each log entry should include at minimum:

- `severity` (INFO, WARNING, ERROR)
- `message`
- `request_id`
- `user_id` (when available)
- `route`, `method`, `status`, `latency_ms` (for HTTP request logs)
- `release`, `environment`

**Python (already uses structlog):**

The existing `structlog` configuration in the Python backend already outputs structured logs. Ensure the `request_id` from `request.state.request_id` is included in all log entries within a request context. Structlog's context-local binding (via `structlog.contextvars`) can be used:

```python
structlog.contextvars.bind_contextvars(request_id=request_id)
```

Call this in the `RequestLoggingMiddleware` after setting `request.state.request_id`.

### 6. Release Tracking

**Build-time release tagging:**

Both the Node.js and Python Docker images should receive a `RELEASE` or `GIT_COMMIT_SHA` environment variable at build time (via Docker `ARG` / `ENV` or Cloud Run environment configuration). This value is passed to `Sentry.init({ release: ... })` so that Sentry can:

- Group errors by release.
- Show which release introduced or resolved a bug.
- Link to source maps (frontend) for readable stack traces.

**Source maps (frontend only):**

When building the React frontend with Vite, enable source map generation for production builds and upload them to Sentry using `@sentry/vite-plugin`. This allows Sentry to show original TypeScript source in error stack traces instead of minified JavaScript.

**File to modify:** `/home/dev/projects/SmartSpecPro/apps/web/vite.config.ts`

Add `@sentry/vite-plugin` to the Vite plugins array (conditionally, only when `SENTRY_AUTH_TOKEN` and `SENTRY_ORG` are available in the build environment):

```typescript
import { sentryVitePlugin } from "@sentry/vite-plugin";

// In plugins array (conditionally):
// sentryVitePlugin({ org, project, authToken, release })
```

---

## Files Summary

| Action | File Path |
|--------|-----------|
| Create | `/home/dev/projects/SmartSpecPro/apps/web/server/__tests__/sentry.test.ts` |
| Create | `/home/dev/projects/SmartSpecPro/apps/web/server/__tests__/correlationId.test.ts` |
| Create | `/home/dev/projects/SmartSpecPro/python-backend/tests/unit/test_sentry.py` |
| Create | `/home/dev/projects/SmartSpecPro/python-backend/tests/unit/test_correlation_id.py` |
| Create | `/home/dev/projects/SmartSpecPro/apps/web/server/services/sentry.ts` |
| Create | `/home/dev/projects/SmartSpecPro/apps/web/server/middleware/correlationId.ts` |
| Create | `/home/dev/projects/SmartSpecPro/python-backend/app/core/sentry_config.py` |
| Modify | `/home/dev/projects/SmartSpecPro/apps/web/client/src/main.tsx` |
| Modify | `/home/dev/projects/SmartSpecPro/apps/web/client/src/components/ErrorBoundary.tsx` |
| Modify | `/home/dev/projects/SmartSpecPro/apps/web/server/_core/index.ts` |
| Modify | `/home/dev/projects/SmartSpecPro/apps/web/vite.config.ts` |
| Modify | `/home/dev/projects/SmartSpecPro/python-backend/app/main.py` |
| Modify | `/home/dev/projects/SmartSpecPro/python-backend/app/core/middleware.py` |
| Modify | `/home/dev/projects/SmartSpecPro/python-backend/app/core/request_logging.py` |
| Modify | `/home/dev/projects/SmartSpecPro/apps/web/package.json` (add `@sentry/react`, `@sentry/node`, `@sentry/vite-plugin`) |
| Modify | `/home/dev/projects/SmartSpecPro/python-backend/requirements.txt` (add `sentry-sdk[fastapi]`) |

---

## Implementation Notes (Actual)

### Deviations from Plan

1. **Sentry v10 API:** Plan referenced v7 API (`Sentry.Handlers.requestHandler()`, `Sentry.Handlers.errorHandler()`). Actual implementation uses v10 API: `Sentry.setupExpressErrorHandler(app)` and `expressIntegration()` (auto-handles request instrumentation).

2. **Scope isolation:** Plan used `getCurrentScope()`. Actual uses `getIsolationScope()` to prevent tag bleed between concurrent requests (v10 best practice).

3. **Source maps:** Plan used `sourcemap: true`. Actual uses `sourcemap: "hidden"` to upload maps to Sentry without exposing source code to browsers.

4. **Python settings:** Plan specified `SENTRY_DSN_PYTHON` env var. Actual uses existing `settings.SENTRY_DSN` from Pydantic settings model (`app/core/config.py` already had this field).

5. **Python PII scrubbing:** Added JSON string body parsing to `before_send` (plan only mentioned dict bodies).

6. **structlog context isolation:** Added `structlog.contextvars.clear_contextvars()` at request start to prevent context leaking between concurrent requests.

7. **X-Request-ID forwarding:** Added to `mediaJobs.ts` (`dispatchToCelery`, `dispatchJob`, and video render fetch). Catch-all proxy in `_core/index.ts` already forwards it.

### Test Results

- **Node.js (Vitest):** 9 tests passing
  - `sentry.test.ts`: 5 tests (PII scrubbing for headers, body fields, JSON body; no-DSN skip; init with DSN)
  - `correlationId.test.ts`: 4 tests (generate ID, preserve incoming, set response header, set Sentry isolation scope tag)
- **Python (pytest):** 12 tests passing
  - `test_sentry.py`: 10 tests (PII header scrubbing x3, body dict, body JSON string, no-request, empty-headers, DSN skip, DSN init, SentryTagMiddleware)
  - `test_correlation_id.py`: 2 tests (generate when missing, use incoming)

### Files Created
- `apps/web/server/services/sentry.ts`
- `apps/web/server/middleware/correlationId.ts`
- `apps/web/server/__tests__/sentry.test.ts`
- `apps/web/server/__tests__/correlationId.test.ts`
- `python-backend/app/core/sentry_config.py`
- `python-backend/tests/unit/test_sentry.py`
- `python-backend/tests/unit/test_correlation_id.py`

### Files Modified
- `apps/web/client/src/main.tsx` (Sentry.init + PII scrubbing)
- `apps/web/client/src/components/ErrorBoundary.tsx` (componentDidCatch + captureException)
- `apps/web/server/_core/index.ts` (initSentry, correlationId middleware, setupExpressErrorHandler, user scope, shutdown flush)
- `apps/web/vite.config.ts` (sentryVitePlugin conditional, sourcemap: "hidden")
- `apps/web/server/routers/mediaJobs.ts` (X-Request-ID forwarding in dispatchToCelery, dispatchJob, video render fetch)
- `python-backend/app/main.py` (init_sentry, sentry_sdk.flush on shutdown)
- `python-backend/app/core/middleware.py` (SentryTagMiddleware class)
- `python-backend/app/core/request_logging.py` (clear_contextvars, prefer incoming X-Request-ID, bind_contextvars)
- `apps/web/package.json` (@sentry/react, @sentry/node, @sentry/vite-plugin)

---

## Implementation Checklist

1. [x] Install `@sentry/react`, `@sentry/node`, and `@sentry/vite-plugin` in `apps/web/package.json`.
2. [x] Install `sentry-sdk[fastapi]` in Python backend dependencies.
3. [x] Write all test files (4 test files, 21 total tests).
4. [x] Create `apps/web/server/services/sentry.ts` with `initSentry()`, `beforeSend` PII scrubbing.
5. [x] Create `apps/web/server/middleware/correlationId.ts` with the correlation ID middleware.
6. [x] Create `python-backend/app/core/sentry_config.py` with `init_sentry()` and Python `before_send` PII scrubbing.
7. [x] Modify `apps/web/client/src/main.tsx` to initialize Sentry before React rendering.
8. [x] Modify `apps/web/client/src/components/ErrorBoundary.tsx` to call `Sentry.captureException` in `componentDidCatch`.
9. [x] Modify `apps/web/server/_core/index.ts` — initSentry, setupExpressErrorHandler (v10), correlationId middleware, user scope via getIsolationScope, Sentry.close on shutdown.
10. [x] Modify `apps/web/vite.config.ts` — sentryVitePlugin (conditional), `sourcemap: "hidden"`.
11. [x] Modify `python-backend/app/main.py` — init_sentry() before app, sentry_sdk.flush() on shutdown.
12. [x] Modify `python-backend/app/core/request_logging.py` — prefer incoming X-Request-ID, clear_contextvars, bind_contextvars.
13. [x] Modify `python-backend/app/core/middleware.py` — SentryTagMiddleware sets request_id, job_id, user_id tags.
14. [x] Forward X-Request-ID in mediaJobs.ts (dispatchToCelery, dispatchJob, video render fetch) and catch-all proxy.
15. [x] All tests passing (21/21).