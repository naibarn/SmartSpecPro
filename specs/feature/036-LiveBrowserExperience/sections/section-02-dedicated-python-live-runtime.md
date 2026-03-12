# Section 02: Dedicated Python Live Runtime

## Goal

Create the authoritative long-lived Python runtime that owns live-browser session state, versioning, lease handling, and recovery behavior. This section is where the feature stops being a collection of routes and becomes a coherent runtime service.

## Scope

- Implement `LiveBrowserSessionManager` as a dedicated long-lived runtime component.
- Define session lifecycle ownership separate from Celery job execution.
- Persist session state transitions and durable business events.
- Implement CAS version checks and idempotency result replay.
- Handle recovery states and stale-lease cleanup without delegating authority to transient request handlers.
- Define runtime topology and single-writer ownership rules across replicas or restarts.

## Implementation Work

1. Add a runtime service or process boundary in Python for live sessions.
2. Implement session creation, lookup, state mutation, and terminalization operations against durable storage.
3. Add idempotency recording and response replay around all mutating commands.
4. Add takeover lease management, heartbeat/renewal logic, and disconnect grace handling.
5. Implement recovery decision logic for Node restart, Python restart, and incomplete provider/runtime recovery.
6. Keep Celery limited to background cleanup and maintenance rather than canonical session ownership.
7. Define how replicated live-session service instances preserve one logical writer per session.

## Tests To Write First

- Test: valid state transitions increment `sessionVersion`.
- Test: invalid state transitions do not mutate persistent state.
- Test: stale `sessionVersion` requests return the correct conflict response.
- Test: duplicate mutating requests with the same idempotency key return the stored prior response.
- Test: controller lease expiry moves the session to the expected waiting state.
- Test: recovery logic moves sessions to `failed_recovery_required` when authoritative runtime reconstruction is incomplete.
- Test: multi-instance deployment preserves single-writer behavior for each session.

## Files And Areas Likely Touched

- new Python live-browser runtime modules under `python-backend/app/`
- FastAPI router modules for live-browser APIs
- persistence/service modules for sessions and event storage
- maintenance task modules for lease and expiry cleanup

## Risks And Guardrails

- Do not split authority across FastAPI handlers, Celery workers, and provider callbacks.
- Keep all state transitions routed through one manager abstraction.
- Prefer durable event emission at transition time rather than reconstructing history later.
- Do not leave replica coordination implicit; single-writer behavior must be designed and tested.

## Done Criteria

- A dedicated live-session runtime exists.
- Session mutation authority is centralized.
- Versioning, idempotency, and recovery semantics are implemented and testable.
- Celery is no longer a candidate system of record for live sessions.

## As-Built

- Actual files changed:
  - `apps/web/drizzle/0069_live_browser_foundation.sql`
  - `apps/web/drizzle/__tests__/liveBrowserSchema.test.ts`
  - `apps/web/drizzle/schema.ts`
  - `python-backend/app/core/database.py`
  - `python-backend/app/models/__init__.py`
  - `python-backend/app/models/live_browser.py`
  - `python-backend/app/services/live_browser_session_manager.py`
  - `python-backend/tests/unit/services/test_live_browser_session_manager.py`
- Deviations from plan:
  - Durable persistence is implemented with SQLAlchemy-backed session, event, and idempotency storage plus durable runtime-owner claims on `live_browser_sessions`.
  - Real API/runtime entrypoint wiring is still deferred to the later gateway/runtime integration sections rather than being completed inside section 02.
- Tests added/updated:
  - `apps/web/drizzle/__tests__/liveBrowserSchema.test.ts`
  - `python-backend/tests/unit/services/test_live_browser_session_manager.py`
- Known follow-ups:
  - Wire the durable manager into real live-browser routes and maintenance jobs before later sections depend on it.
  - Add explicit runtime-owner heartbeat/maintenance wiring so writer reclamation is not only mutation-driven once the dedicated live-runtime service loop exists.
