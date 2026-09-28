# Section 03 — Source Pack API and Gate

## Objective

Expose the source workflow through the existing vertical-drama tRPC router and
enforce readiness at every server entry point, including direct draft calls and
pre-series composition jobs.

## Target Files

- `apps/web/server/routers/verticalDramaSeries.ts`
- `apps/web/server/services/verticalDramaSeries/sourcePackService.ts`
- `apps/web/server/services/verticalDramaSeries/sourcePackReadiness.ts`
- `apps/web/server/services/verticalDramaSeries/sourcePackSecurity.ts`
- `apps/web/server/routers/*.test.ts`

## Tests First

1. Reject missing tenant/owner on every read and write.
2. Test server-issued or server-claimed cryptographic draft sessions, attach-once,
   cross-owner rejection, and legacy ID rotation.
3. Test idempotent slot/asset mutations and optimistic version conflicts.
4. Assert bounded `VD_SOURCE_PACK_NOT_READY` with repair items and booleans.
5. Assert existing `verticalDramaSeries.create` attaches atomically and returns
   the same series on retry; do not add a second shell-create endpoint.
6. Reject stale/missing source readiness from draft, generation, and repair calls.

## Implementation

- Add queries/mutations for staged pack creation, profile selection, slot CRUD,
  asset attachment, analysis requests, rights decisions, readiness, and attach.
- Use server-issued session tokens bound to user and tenant. Treat old client
  `Math.random` IDs as recoverable job correlation only, never authorization.
- Extend the existing create input with an optional source-pack/session claim and
  perform the pack attach in the same database transaction as shell creation.
- Create a single typed readiness error containing `code`, `draftReady`,
  `productionReady`, `blockingItems`, and `repairableItems`; redact claim text
  and URLs from logs.
- Compose source-pack readiness with the existing Draft Quality QC/foundation
  receipt so either gate can block while the creator sees one combined summary.

## Acceptance

- No direct route can bypass a required Source Pack gate.
- All mutations are tenant/owner/series scoped and retry-safe.
- A text-only draft can proceed only under the documented rights matrix; render
  always requires production readiness.

## UI/UX Contract

### Target User / JTBD

Understand exactly why drafting is blocked and what action fixes it.

### Surface Inventory

Readiness panel, repair actions, expired-session notice, and retry action.

### Component Map

ReadinessPanel, BlockingItem, RepairAction, RetryButton.

### State Matrix

Checking, ready, blocked, stale, partial, failed, and unauthorized.

### Responsive Matrix

Blocking items stack on mobile and use a two-column summary on desktop.

### Accessibility Acceptance

Use alert/status roles appropriately, preserve focus after repair, and expose action labels.

### Copy Contract

Each block states the missing input, why it matters, and the next safe action.

### Browser Evidence Required

Capture blocked-to-ready transition and an unauthorized session response.
