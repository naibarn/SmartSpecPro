# Section 05 — Case Needs, Tasks, Facilities, and Messages

**Dependencies:** Sections 03–04. **Owner:** conductor for API/route manifest/schema; frontend implementation may follow stable API contracts. **Status:** In progress (case message history now uses bounded cursor pagination; delivery acknowledgements, channel lifecycle, and offline mutation replay remain open).

## Scope

Implement case-scoped needs with revisions and partial fulfillment; response-task creation, eligibility, offers, responder acceptance/decline, progress, completion, safety stop, handoff and audit; verified facility registration and status; private case messaging; and responder/dashboard UI routes. Every write uses tenant scope, idempotency, state-transition validation and append-only audit. Exact details are visible only to the authorized case owner, assigned responder, or scoped command user.

## Owning surfaces

- API and transactions: `apps/web/server/routes/spec260EmergencyEdge.ts`.
- Route/API contract: `packages/shared/src/emergencyRouteManifest.ts`.
- Client: `apps/web/client/src/pages/EmergencyRoutePage.tsx` and emergency locales.
- Existing tables: needs, response tasks, assignments, facilities, case messages, consent receipts, audit events.

## Exit criteria

- Quantity/revision and task status transitions reject stale, over-fulfilled and unsafe changes.
- Assignment state and task state update atomically; every participant transition has an audit record.
- Responder lists contain only their own assignments and case scopes; message DTOs omit sender identity refs.
- Facilities remain explicitly unverified until a verifier publishes freshness-bounded status.
- All command/respond pages are reachable through role-aware dashboard links; tests are authored and deferred to Section 12.
