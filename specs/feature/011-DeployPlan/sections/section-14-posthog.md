I now have all the context needed. Let me produce the section content.

# Section 14: PostHog Analytics Integration

## Overview

This section implements full-funnel product analytics using PostHog Cloud. It covers client-side SDK initialization in the React app, server-side SDK initialization in both the Node.js and Python backends, identity management (anonymous to identified user), a comprehensive event schema covering acquisition through engagement, and PostHog dashboard definitions.

PostHog is not yet present in the codebase. All SDK packages must be installed and all integration code must be created from scratch.

### Dependencies

- **section-01-gcp-bootstrap** must be complete: the `POSTHOG_API_KEY` secret must exist in GCP Secret Manager.
- PostHog events are emitted by the media pipeline (section-08), so some server-side events reference job data structures from that section. However, the PostHog integration itself is self-contained.
- Graceful shutdown hooks (section-02) should call `posthog.shutdown()` to flush pending events.

---

## Tests First

All tests should be written before implementation. The tests below define the expected behavior for each component of the PostHog integration.

### Identity Management Tests (Vitest)

**File:** `/home/dev/projects/SmartSpecPro/apps/web/server/services/__tests__/posthogIdentity.test.ts`

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Tests for PostHog identity management:
 * - Signup calls posthog.alias then posthog.identify
 * - Login calls posthog.identify with userId
 * - Server-side events use userId as distinctId
 */

describe("PostHog Identity Management", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("signup calls posthog.alias then posthog.identify", async () => {
    // Mock the PostHog client
    // Call the signup handler with an anonymousId and a new userId
    // Assert posthog.alias(anonymousId, userId) was called first
    // Assert posthog.identify({ distinctId: userId }) was called second
  });

  it("login calls posthog.identify with userId", async () => {
    // Mock the PostHog client
    // Call the login success handler with a userId
    // Assert posthog.identify({ distinctId: userId, properties: {...} }) was called
  });

  it("server-side events use userId as distinctId", async () => {
    // Mock the PostHog client
    // Call captureEvent with a userId and event name
    // Assert posthog.capture({ distinctId: userId, event: ... }) was called
    // Assert distinctId is NOT an anonymous ID
  });
});
```

### Event Capture Tests (Vitest)

**File:** `/home/dev/projects/SmartSpecPro/apps/web/server/services/__tests__/posthogEvents.test.ts`

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Tests for PostHog event capture on the Node.js side:
 * - job_submitted event includes job_type property
 * - media_job_completed event includes duration_ms and output_size_bytes
 * - Rate-limited request emits event with rate_limited: true
 */

describe("PostHog Event Capture (Node.js)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("job_submitted event includes job_type property", async () => {
    // Call captureJobSubmitted with a job spec
    // Assert posthog.capture was called with event: "job_submitted"
    // Assert the properties object contains job_type
  });

  it("media_job_completed event includes duration_ms and output_size_bytes", async () => {
    // Call captureMediaJobCompleted with job result data
    // Assert posthog.capture was called with event: "media_job_completed"
    // Assert properties include duration_ms and output_size_bytes
  });

  it("rate-limited request emits event with rate_limited: true", async () => {
    // Call captureRateLimited with request context
    // Assert posthog.capture was called with event containing rate_limited: true
  });
});
```

### Event Capture Tests (Python -- pytest)

**File:** `/home/dev/projects/SmartSpecPro/python-backend/tests/test_posthog_events.py`

```python
"""
Tests for PostHog event capture on the Python side:
- kie_submit_succeeded event is captured on successful Kie AI call
- media_job_completed server-side event includes correct properties
"""
import pytest
from unittest.mock import patch, MagicMock


@pytest.mark.unit
class TestPostHogEventCapture:

    @patch("app.services.posthog_service.posthog")
    def test_kie_submit_succeeded_event(self, mock_posthog):
        """kie_submit_succeeded event is captured on successful Kie AI call."""
        # Import the service function
        # Call capture_kie_submit with user_id and kie_job_id
        # Assert mock_posthog.capture was called with:
        #   distinct_id=user_id,
        #   event="kie_submit_succeeded",
        #   properties containing kie_job_id
        pass

    @patch("app.services.posthog_service.posthog")
    def test_media_job_completed_event(self, mock_posthog):
        """media_job_completed server-side event includes correct properties."""
        # Call capture_media_job_completed with job result data
        # Assert mock_posthog.capture was called with event "media_job_completed"
        # Assert properties include: duration_ms, output_size_bytes, job_type, resolution
        pass
```

---

## Implementation Details

### 1. Install PostHog SDKs

**React (client-side):**

Add `posthog-js` to the web app's client dependencies.

**File to modify:** `/home/dev/projects/SmartSpecPro/apps/web/package.json`

Add to `dependencies`:
- `posthog-js` -- the official PostHog browser SDK

**Node.js (server-side):**

Add `posthog-node` to the web app's server dependencies.

**File to modify:** `/home/dev/projects/SmartSpecPro/apps/web/package.json`

Add to `dependencies`:
- `posthog-node` -- the official PostHog Node.js SDK

**Python (server-side):**

Add `posthog` to the Python backend dependencies.

**File to modify:** `/home/dev/projects/SmartSpecPro/python-backend/requirements.txt`

Add:
- `posthog` -- the official PostHog Python SDK

After adding dependencies, run `pnpm install` in `apps/web/` and `pip install -r requirements.txt` in `python-backend/`.

---

### 2. Client-Side SDK Initialization

**File to create:** `/home/dev/projects/SmartSpecPro/apps/web/client/src/lib/posthog.ts`

This module initializes the PostHog browser SDK with the following configuration:

- `api_key`: Read from `import.meta.env.VITE_POSTHOG_API_KEY` (set at build time via Vite env).
- `api_host`: `https://us.i.posthog.com` (PostHog Cloud US endpoint).
- `person_profiles`: `'identified_only'` -- Only create person profiles for users who are explicitly identified (saves cost on anonymous page views).
- `autocapture`: `false` -- Disable automatic event capture to reduce noise and PostHog costs. All events are explicitly defined in the event schema below.
- `session_recording`: `{ maskAllInputs: true }` -- If session recording is enabled, mask all form inputs for PII protection. Session recording can be toggled via PostHog's remote config.
- `capture_pageview`: `false` -- Disable automatic pageview capture; the SPA router handles this manually via a route change listener.

Export a `getPostHog()` function that returns the initialized instance, or `null` if the API key is not configured (e.g., in local development). All client-side PostHog calls should go through this getter to avoid crashes when PostHog is disabled.

**File to modify:** `/home/dev/projects/SmartSpecPro/apps/web/client/src/main.tsx`

Import and call the PostHog initialization function before rendering the React app. The initialization must happen before `createRoot().render()` so that the anonymous `distinct_id` cookie is set before any events fire.

**File to modify:** `/home/dev/projects/SmartSpecPro/apps/web/client/src/App.tsx`

Add a `useEffect` hook (or a dedicated `<PostHogPageViewTracker />` component) that listens to route changes from Wouter and calls `posthog.capture('$pageview')` with the current path. This replaces the disabled automatic pageview capture.

**Vite environment variable:**

**File to modify:** `/home/dev/projects/SmartSpecPro/apps/web/.env.example`

Add:
```
VITE_POSTHOG_API_KEY=phc_your_key_here
```

In production, this is set as a build-time argument when building the Docker image (or in the CI/CD pipeline). It is NOT a secret -- PostHog API keys are designed to be public (they are write-only, data ingestion tokens).

---

### 3. Server-Side SDK Initialization (Node.js)

**File to create:** `/home/dev/projects/SmartSpecPro/apps/web/server/services/posthog.ts`

This module initializes the PostHog Node.js SDK for server-side event capture. Configuration:

- `apiKey`: Read from `process.env.POSTHOG_API_KEY` (mounted from GCP Secret Manager in production).
- `host`: `https://us.i.posthog.com`.
- `flushAt`: `20` -- Batch up to 20 events before sending to PostHog.
- `flushInterval`: `10000` -- Flush events every 10 seconds even if batch is not full.

Export:
- `getPostHogServer()` -- Returns the initialized `PostHog` client, or a no-op stub if the API key is not configured.
- `captureServerEvent(distinctId, event, properties)` -- Convenience wrapper that calls `posthog.capture()` with standard properties (environment, release, timestamp).
- `identifyUser(userId, properties)` -- Calls `posthog.identify()` with user traits.
- `aliasUser(anonymousId, userId)` -- Calls `posthog.alias()` to link anonymous to identified user.
- `shutdownPostHog()` -- Calls `posthog.shutdown()` to flush remaining events. This must be called during graceful shutdown (see section-02).

The no-op stub pattern ensures that server code never crashes if PostHog is not configured (e.g., in local development or test environments). The stub should log a debug message and return without error.

---

### 4. Server-Side SDK Initialization (Python)

**File to create:** `/home/dev/projects/SmartSpecPro/python-backend/app/services/posthog_service.py`

This module initializes the PostHog Python SDK. Configuration:

- `api_key`: Read from `settings.POSTHOG_API_KEY` (loaded from environment, sourced from GCP Secret Manager in production).
- `host`: `https://us.i.posthog.com`.
- `debug`: `True` when `settings.ENVIRONMENT == "development"`.
- `on_error`: Log the error with structlog rather than raising.

Export functions:
- `capture_event(distinct_id, event, properties)` -- Captures a server-side event.
- `capture_kie_submit(user_id, kie_job_id, job_type)` -- Captures `kie_submit_succeeded`.
- `capture_media_job_completed(user_id, job_id, job_type, duration_ms, output_size_bytes, resolution)` -- Captures `media_job_completed`.
- `capture_media_job_failed(user_id, job_id, job_type, error_message)` -- Captures `media_job_failed`.
- `shutdown_posthog()` -- Calls `posthog.shutdown()` for graceful shutdown.

If `POSTHOG_API_KEY` is not set, all functions should be no-ops (log a debug message and return).

**File to modify:** `/home/dev/projects/SmartSpecPro/python-backend/app/core/config.py`

Add `POSTHOG_API_KEY: str = ""` to the settings class. This allows the key to be optional (empty string means PostHog is disabled).

**File to modify:** `/home/dev/projects/SmartSpecPro/python-backend/app/main.py`

Add `shutdown_posthog()` to the lifespan shutdown handler to flush pending events on service termination.

---

### 5. Identity Management

Identity management bridges the gap between anonymous visitors and logged-in users. PostHog uses `distinct_id` to identify users across events.

**Pre-login (anonymous):**
PostHog's browser SDK automatically generates a random `distinct_id` stored in a first-party cookie. No action needed -- anonymous pageview events use this ID.

**On signup:**
After the signup API returns success:
1. Call `posthog.alias(anonymousId, newUserId)` -- This links the anonymous cookie ID to the permanent user ID. The `anonymousId` is retrieved via `posthog.get_distinct_id()` before calling `identify`.
2. Call `posthog.identify(newUserId, { email, plan, created_at })` -- This switches the SDK to use `newUserId` for all future events and sets person properties.

**File to modify:** `/home/dev/projects/SmartSpecPro/apps/web/client/src/pages/Signup.tsx`

After the signup mutation succeeds, call the PostHog alias and identify functions. Import `getPostHog` from `@/lib/posthog`.

**On login:**
After the login API returns success:
1. Call `posthog.identify(userId, { email, plan, last_login })` -- This associates the current browser session with the user.

**File to modify:** `/home/dev/projects/SmartSpecPro/apps/web/client/src/pages/Login.tsx`

After the login mutation succeeds, call `posthog.identify()`. Import `getPostHog` from `@/lib/posthog`.

**Server-side events:**
All server-side event captures use the authenticated `userId` as `distinctId`. The user ID is available from the tRPC context (`ctx.user.id`) or from the request payload for Cloud Tasks handlers.

---

### 6. Event Schema

The following events form the complete product analytics funnel. Each event has a specific trigger location and required properties.

#### Acquisition Funnel (client-side)

| Event | Trigger | File | Properties |
|-------|---------|------|------------|
| `$pageview` | SPA route change | `App.tsx` (route change listener) | `$current_url`, path |
| `signup_started` | Signup form rendered/opened | `Signup.tsx` | `referrer` |
| `signup_completed` | Registration API success | `Signup.tsx` | `plan`, `auth_method` |

#### Activation Funnel (client-side + server-side)

| Event | Trigger | File | Properties |
|-------|---------|------|------------|
| `login_started` | Login form submitted | `Login.tsx` (client) | `auth_method` |
| `login_succeeded` | Login API success | `Login.tsx` (client) | `auth_method`, `browser`, `os` |
| `login_failed` | Login API failure | `Login.tsx` (client) | `failure_reason`, `auth_method` |
| `dashboard_viewed` | Dashboard page rendered | `Dashboard.tsx` (client) | - |
| `job_create_clicked` | Generate/create button clicked | `Generate.tsx` or `MediaStudio.tsx` (client) | `job_type` |
| `job_submitted` | Job creation API success | `mediaJobs.ts` router (server) | `job_type`, `queue_name` |

#### Delivery Funnel (server-side)

| Event | Trigger | File | Properties |
|-------|---------|------|------------|
| `kie_submit_succeeded` | Kie AI accepts job | `posthog_service.py` (Python) | `kie_job_id`, `job_type` |
| `kie_callback_received` | Webhook from Kie AI | webhook handler (Python) | `kie_job_id`, `latency_ms` |
| `kie_poll_completed` | Polling finds job done | poll handler (Python) | `kie_job_id`, `poll_count` |
| `media_job_started` | Media processing begins | `posthog_service.py` (Python) | `job_id`, `job_type` |
| `media_job_completed` | Media processing done | `posthog_service.py` (Python) | `job_type`, `duration_ms`, `output_size_bytes`, `resolution` |
| `media_job_failed` | Media processing error | `posthog_service.py` (Python) | `job_type`, `error_message` |
| `video_render_started` | Video render begins | video job runner (Python) | `render_hash`, `profile` |
| `video_render_completed` | Video render done | video job runner (Python) | `render_hash`, `profile`, `duration_ms`, `output_size_bytes` |
| `video_render_failed` | Video render error | video job runner (Python) | `render_hash`, `error_message` |

#### Engagement (client-side)

| Event | Trigger | File | Properties |
|-------|---------|------|------------|
| `output_viewed` | User views generated output | result viewer component (client) | `job_type`, `media_type` |
| `output_downloaded` | User downloads output | download handler (client) | `job_type`, `media_type`, `file_size` |
| `gallery_upload` | User promotes to gallery | gallery promotion handler (client) | `media_type` |
| `gallery_view` | User views gallery item | Gallery page (client) | `item_id` |

#### Abuse/Operational (server-side)

| Event | Trigger | File | Properties |
|-------|---------|------|------------|
| `rate_limited` | Rate limit hit | rate limit middleware (server) | `endpoint`, `ip_hash`, `rate_limited: true` |

### Standard Properties

All events should carry these standard properties where available:

- `environment`: `"staging"` or `"production"`
- `release`: Git commit SHA or Docker image tag
- `request_id`: Correlation ID from `X-Request-ID` header (links to Sentry traces)

---

### 7. Integrate Events into Existing Code

The following files need modifications to emit PostHog events at the appropriate points.

**Client-side files to modify:**

| File | Change |
|------|--------|
| `/home/dev/projects/SmartSpecPro/apps/web/client/src/pages/Signup.tsx` | Add `signup_started` on mount, `signup_completed` on success, plus `alias` and `identify` calls |
| `/home/dev/projects/SmartSpecPro/apps/web/client/src/pages/Login.tsx` | Add `login_started` on submit, `login_succeeded`/`login_failed` on result, plus `identify` call |
| `/home/dev/projects/SmartSpecPro/apps/web/client/src/pages/Dashboard.tsx` | Add `dashboard_viewed` on mount |
| `/home/dev/projects/SmartSpecPro/apps/web/client/src/pages/Generate.tsx` or equivalent | Add `job_create_clicked` on button click |
| `/home/dev/projects/SmartSpecPro/apps/web/client/src/App.tsx` | Add route change listener for `$pageview` |

**Server-side files to modify (Node.js):**

| File | Change |
|------|--------|
| `/home/dev/projects/SmartSpecPro/apps/web/server/routers/mediaJobs.ts` | Import `captureServerEvent` and emit `job_submitted` after successful job creation |
| `/home/dev/projects/SmartSpecPro/apps/web/server/_core/index.ts` (or main server entry) | Add `shutdownPostHog()` call in the SIGTERM handler |

**Server-side files to modify (Python):**

| File | Change |
|------|--------|
| `/home/dev/projects/SmartSpecPro/python-backend/app/api/v1/media_generation.py` | Import and call `capture_kie_submit` after Kie AI submission succeeds |
| `/home/dev/projects/SmartSpecPro/python-backend/app/main.py` | Import `shutdown_posthog` and call it in the lifespan shutdown |
| `/home/dev/projects/SmartSpecPro/python-backend/app/core/config.py` | Add `POSTHOG_API_KEY` setting |

---

### 8. PostHog Dashboards

Create these dashboards in the PostHog Cloud UI (manual setup, not code). Document the dashboard definitions here for the implementer to recreate:

**1. Signup Funnel**
- Type: Funnel
- Steps: `$pageview` (where path contains `/signup`) -> `signup_started` -> `signup_completed`
- Conversion window: 30 minutes
- Breakdown: by `auth_method`

**2. Login Health**
- Type: Funnel + Trends
- Funnel steps: `login_started` -> `login_succeeded`
- Trends: `login_failed` count over time, broken down by `failure_reason`
- Time range: Last 7 days

**3. Job Pipeline**
- Type: Funnel
- Steps: `job_submitted` -> `kie_submit_succeeded` -> `media_job_completed`
- Conversion window: 1 hour
- Show: conversion rate, median time between steps
- Breakdown: by `job_type`

**4. Video Rendering**
- Type: Funnel + Trends
- Funnel: `video_render_started` -> `video_render_completed`
- Trends: `video_render_failed` count, p95 `duration_ms` from `video_render_completed`
- Breakdown: by `profile` (preview/standard/high)

**5. Retention**
- Type: Retention
- Cohort: Users who performed `login_succeeded` on day 0
- Return event: Any event (or `job_submitted`) on subsequent days
- Period: Weekly
- Time range: Last 8 weeks

---

### 9. Graceful Shutdown Integration

Both the Node.js and Python services must flush PostHog events on shutdown to avoid data loss.

**Node.js:**

In the SIGTERM handler (which will be set up as part of section-02), call `shutdownPostHog()` from the PostHog service module. This calls `posthog.shutdown()` which flushes the event batch and closes the HTTP connection. Place this call after stopping new connections but before closing DB/Redis connections.

Shutdown order:
1. `server.close()` -- stop accepting connections
2. Drain in-flight requests
3. `shutdownPostHog()` -- flush PostHog events
4. Flush Sentry
5. Close Redis
6. Close DB pool

**Python:**

In the FastAPI lifespan's shutdown phase (the `yield` point in the `asynccontextmanager`), call `shutdown_posthog()`. This calls `posthog.shutdown()` which flushes pending events.

The existing lifespan handler in `/home/dev/projects/SmartSpecPro/python-backend/app/main.py` already has a shutdown section after the `yield`. Add the PostHog shutdown call there, before closing the database engine.

---

### 10. Local Development and Testing Behavior

When `POSTHOG_API_KEY` (or `VITE_POSTHOG_API_KEY` on the client) is not set or is empty:

- **Client-side:** `getPostHog()` returns `null`. All client-side PostHog calls are guarded with `posthog?.capture(...)` pattern, so they silently do nothing.
- **Node.js server:** `getPostHogServer()` returns a no-op stub object whose methods log debug messages and return immediately.
- **Python server:** All `capture_*` functions check for the API key at the top and return early if not configured.

This ensures local development and test environments never send events to PostHog and never crash due to missing configuration.

For **unit tests**, mock the PostHog SDK entirely using `vi.mock('posthog-node')` (Vitest) or `@patch("app.services.posthog_service.posthog")` (pytest). Tests should verify that the correct events and properties are passed to the PostHog capture function, not that PostHog actually receives them.

---

## Summary of Files

### Files to Create

| File | Purpose |
|------|---------|
| `/home/dev/projects/SmartSpecPro/apps/web/client/src/lib/posthog.ts` | Client-side PostHog SDK init and helper |
| `/home/dev/projects/SmartSpecPro/apps/web/server/services/posthog.ts` | Server-side PostHog SDK init (Node.js) |
| `/home/dev/projects/SmartSpecPro/python-backend/app/services/posthog_service.py` | Server-side PostHog SDK init (Python) |
| `/home/dev/projects/SmartSpecPro/apps/web/server/services/__tests__/posthogIdentity.test.ts` | Identity management tests |
| `/home/dev/projects/SmartSpecPro/apps/web/server/services/__tests__/posthogEvents.test.ts` | Node.js event capture tests |
| `/home/dev/projects/SmartSpecPro/python-backend/tests/test_posthog_events.py` | Python event capture tests |

### Files to Modify

| File | Change |
|------|--------|
| `/home/dev/projects/SmartSpecPro/apps/web/package.json` | Add `posthog-js` and `posthog-node` dependencies |
| `/home/dev/projects/SmartSpecPro/python-backend/requirements.txt` | Add `posthog` dependency |
| `/home/dev/projects/SmartSpecPro/apps/web/client/src/main.tsx` | Initialize PostHog before React render |
| `/home/dev/projects/SmartSpecPro/apps/web/client/src/App.tsx` | Add route change pageview tracking |
| `/home/dev/projects/SmartSpecPro/apps/web/client/src/pages/Signup.tsx` | Add signup events + alias/identify |
| `/home/dev/projects/SmartSpecPro/apps/web/client/src/pages/Login.tsx` | Add login events + identify |
| `/home/dev/projects/SmartSpecPro/apps/web/server/routers/mediaJobs.ts` | Emit `job_submitted` event |
| `/home/dev/projects/SmartSpecPro/python-backend/app/core/config.py` | Add `POSTHOG_API_KEY` setting |
| `/home/dev/projects/SmartSpecPro/python-backend/app/main.py` | Add PostHog shutdown to lifespan |
| `/home/dev/projects/SmartSpecPro/python-backend/app/api/v1/media_generation.py` | Emit `kie_submit_succeeded` event (DEFERRED - not wired yet) |
| `/home/dev/projects/SmartSpecPro/apps/web/.env.example` | Add `VITE_POSTHOG_API_KEY` |
| `/home/dev/projects/SmartSpecPro/apps/web/client/src/pages/Generate.tsx` | Add `job_create_clicked` event |
| `/home/dev/projects/SmartSpecPro/apps/web/server/_core/index.ts` | PostHog shutdown in SIGTERM handler |

---

## Implementation Notes (Actual)

### Deviations from Plan

1. **Package location**: `posthog-js` and `posthog-node` installed in `apps/web/package.json` (correct), initially installed in root `package.json` then fixed during review.
2. **Initial pageview tracking**: `PostHogPageViewTracker` uses `useRef<string | null>(null)` to capture the first page load (review fix #2).
3. **PII protection**: `login_failed` event uses enumerated `failure_reason` values instead of raw error messages (review fix #3).
4. **Identity safety**: Login `identify` call skips if no `userId`/`id` in response (review fix #8).
5. **`signup_started` timing**: Fires on component mount via `useEffect`, not on form submit (review fix #7).
6. **Deferred integrations**: `dashboard_viewed`, `rate_limited`, and `capture_kie_submit` wiring not implemented - SDK infrastructure is in place.
7. **Python release property**: `capture_event` includes `release` from settings.APP_VERSION (review fix #16).

### Test Results

- **Node.js (Vitest):** 7 tests passing
  - `posthogIdentity.test.ts`: 3 tests (alias, identify, capture with userId)
  - `posthogEvents.test.ts`: 4 tests (event props, environment, no-op without key, shutdown)
- **Python (pytest):** 4 tests passing
  - `test_posthog_events.py`: 4 tests (kie_submit, media_completed, media_failed, no-op)

### Files Created
- `apps/web/client/src/lib/posthog.ts`
- `apps/web/server/services/posthog.ts`
- `apps/web/server/services/__tests__/posthogIdentity.test.ts`
- `apps/web/server/services/__tests__/posthogEvents.test.ts`
- `python-backend/app/services/posthog_service.py`
- `python-backend/tests/test_posthog_events.py`

### Files Modified
- `apps/web/client/src/main.tsx` (PostHog init)
- `apps/web/client/src/App.tsx` (PostHogPageViewTracker, useLocation import)
- `apps/web/client/src/pages/Generate.tsx` (job_create_clicked event)
- `apps/web/client/src/pages/Login.tsx` (login_started/succeeded/failed, identify)
- `apps/web/client/src/pages/Signup.tsx` (signup_started on mount, signup_completed, alias/identify)
- `apps/web/server/routers/mediaJobs.ts` (job_submitted event)
- `apps/web/server/_core/index.ts` (PostHog shutdown in SIGTERM/SIGINT)
- `apps/web/package.json` (posthog-js, posthog-node)
- `apps/web/.env.example` (VITE_POSTHOG_API_KEY, POSTHOG_API_KEY)
- `python-backend/app/core/config.py` (POSTHOG_API_KEY setting)
- `python-backend/app/main.py` (PostHog shutdown in lifespan)
- `python-backend/requirements.txt` (posthog>=3.0.0)