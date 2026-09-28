# Section 02 — Control Plane, access, binding persistence

## Goal

Implement neutral Series access, REST discovery/binding/workspace/Quick Action
routes, additive persistence, idempotency/revision/audit, and revoke lifecycle.

## Files

- Add `apps/web/server/services/verticalDramaSeriesAccessService.ts`.
- Add binding/control-plane services under `apps/web/server/services/`.
- Add an additive Drizzle migration and schema entries for bindings/audit/
  idempotency as needed; preserve unrelated schema work.
- Extend `apps/web/server/routes/workerRuntime.ts` or a focused companion and
  register from `apps/web/server/_core/index.ts`.
- Add route/service/schema tests under existing `__tests__` directories.

## Required behavior

Use existing Worker auth/device-proof middleware. List/detail routes return
safe paginated projections with principal/filter-scoped signed cursors. Bind
requires current access, Worker status/device, root metadata, policy snapshot,
idempotency, and `If-Match`; active uniqueness is transactional. Revoke marks
binding revoked, blocks new claims/intake/publication, drains/quarantines
pinned work, and preserves source/artifacts/history.

Every request rejects or ignores client user/owner/tenant/path/provider graph
authority. Use stable status/error/request ID/contract version/rate-limit
responses and no-store permission projections. `accepted` is not completed.

Migration is additive, dry-run reports conflicts, unresolved legacy ownership
is not backfilled, and rollback disables new routes/flags without deletion.

## TDD requirements

Test route auth/scopes/tenant, principal access, pagination/cursor, body bounds,
idempotency conflict, concurrent bind/If-Match, revoke state transitions,
hidden Series non-enumeration, and migration dry-run/invariants.

## Acceptance

Worker can securely list/select/bind/revoke a Series root using real route
handlers and durable server state, while legacy Worker routes remain intact.

## UI/UX Contract

### Target User / JTBD
N/A — REST/control-plane layer; UI consumes safe projections.
### Surface Inventory
N/A — endpoints only.
### Component Map
N/A — access/binding services and route handlers.
### State Matrix
Routes expose loading/empty/denied/stale/conflict/blocked/accepted/revoked/recovery outcomes.
### Responsive Matrix
N/A — no layout.
### Accessibility Acceptance
Errors include stable actionable keys for consuming screens.
### Copy Contract
Safe localized messages; no raw path, secret, or hidden-Series detail.
### Browser Evidence Required
N/A — route/service tests; browser proof belongs to shell screens.
