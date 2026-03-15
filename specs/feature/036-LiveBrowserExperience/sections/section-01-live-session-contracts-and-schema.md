# Section 01: Live Session Contracts And Schema

## Goal

Establish the canonical live-browser data model and request/response contracts so every later section builds on one session vocabulary, one event vocabulary, and one mutation model. This section is the foundation for the rest of the feature.

## Scope

- Add durable schema for live sessions, events, assist requests, control transfers, and idempotency keys.
- Define canonical enums for session status, control mode, assist type, and related API error codes.
- Define Node-to-Python request and response contracts for create, read, command, pause, takeover, return-control, assist-response, approval, reject, cancel, list-events, and stream-token operations.
- Define the event envelope and replay cursor shape for live business events.
- Preserve compatibility with existing browser-policy and approval contracts.

## Implementation Work

1. Add database schema entries and migrations for:
   - `live_browser_sessions`
   - `live_browser_events`
   - `live_browser_assist_requests`
   - `live_browser_control_transfers`
   - `live_browser_idempotency_keys`
2. Define indexes and uniqueness constraints exactly around session lookup, replay, and idempotency requirements.
3. Add shared contract types in the web shared layer and matching Python contract models so both sides validate the same shapes.
4. Define error-code vocabulary including version conflict, invalid transition, session terminated, queue full, lease expired, takeover locked out, step-up auth required, and stream unavailable.
5. Ensure browser-policy approval vocabulary and reason codes remain aligned with the existing contract instead of inventing live-only variants.

## Tests To Write First

- Test: migrations create all live-browser tables and required indexes.
- Test: session status and control mode enums validate only expected values.
- Test: duplicate `(session_id, idempotency_key)` inserts are rejected.
- Test: live event envelopes require `eventId`, `sessionId`, `sessionVersion`, `type`, `timestamp`, and `cursor`.
- Test: error contract serialization includes retryability and current session version for version conflicts.
- Test: shared web and Python contract fixtures remain consistent for representative live-browser payloads.

## Files And Areas Likely Touched

- `apps/web/drizzle/schema.ts`
- new migration files in the repo’s existing migration locations
- `apps/web/shared/*` for live-browser contract types
- `python-backend/app/services/*contract*` or equivalent new contract modules
- `python-backend/app/models/*` for SQLAlchemy mappings if needed

## Risks And Guardrails

- Do not mutate or replace existing browser-policy tables.
- Keep schema additive only.
- Avoid contract drift between TypeScript and Python by building shared fixtures or parity tests immediately.

## Done Criteria

- Schema exists and is additive.
- Shared contracts are defined on both sides.
- Error and event vocabularies are locked down.
- Later sections can use stable IDs, statuses, and payloads without redefining them.

## As-Built

- Actual files changed:
  - `apps/web/drizzle/schema.ts`
  - `apps/web/drizzle/0069_live_browser_foundation.sql`
  - `apps/web/drizzle/meta/_journal.json`
  - `apps/web/drizzle/__tests__/liveBrowserSchema.test.ts`
  - `apps/web/shared/liveBrowser.ts`
  - `apps/web/shared/liveBrowser.test.ts`
  - `apps/web/vitest.config.ts`
  - `python-backend/app/services/live_browser_contract.py`
  - `python-backend/tests/test_live_browser_contract.py`
  - `specs/feature/036-LiveBrowserExperience/fixtures/live-browser-session.json`
  - `specs/feature/036-LiveBrowserExperience/fixtures/live-browser-event-envelope.json`
  - `specs/feature/036-LiveBrowserExperience/fixtures/live-browser-error-version-conflict.json`
  - `specs/feature/036-LiveBrowserExperience/fixtures/live-browser-send-command-request.json`
- Deviations from plan:
  - `pendingApprovalRequestId` remains a string bridge because approval requests are still owned by the Python approval stack rather than a Drizzle-managed table in this repo area.
- Tests added/updated:
  - `apps/web/drizzle/__tests__/liveBrowserSchema.test.ts`
  - `apps/web/shared/liveBrowser.test.ts`
  - `python-backend/tests/test_live_browser_contract.py`
- Known follow-ups:
  - Section 04 should consume the shared request/response schemas for real Node gateway proxying.
  - If the team regenerates Drizzle metadata snapshots later, keep the hand-authored migration aligned.
