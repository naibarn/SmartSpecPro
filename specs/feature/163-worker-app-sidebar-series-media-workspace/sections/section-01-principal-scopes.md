# Section 01 — Principal, scopes, and Quick Action contracts

## Goal

Create shared strict contracts for effective Worker principal/access, canonical
scope registry, Series projections, Quick Actions, errors, revisions,
idempotency, and contract version.

## Files

- Add `apps/web/shared/workerSeriesControlPlane.ts` and tests under
  `apps/web/shared/__tests__/`.
- Extend `apps/web/shared/workerRuntime.ts` and
  `apps/web/shared/workerAccessKeys.ts` through one canonical registry.
- Add shared error/action/projection schemas and fixtures.

## Required behavior

Resolve principal from server records, not request fields. Represent owner,
active groups, tenant-policy access, `accessSource`, independent capabilities,
authority revision, and safe Series projection. Hidden/unknown Series must use
safe not-found shape. Derive execution/upload scopes from one registry with
explicit route use, permission intersection, and
`vertical_drama_media_operator`; do not silently broaden old presets.

Quick Actions are a discriminated bounded union for select/bind/scan/process/
review/publish/index/queue/pause. Reject raw paths, shell commands, graphs,
provider payloads, unknown keys, and client authority fields. Define stable
errors, cursor, idempotency, request ID, contract version, binding/job states.

## TDD requirements

Test principal fail-closed, access precedence, hidden Series, scope derivation/
token split/preset, strict action input, idempotency key/body hash, cursor
signature/filter binding, and error serialization.

## Acceptance

Server routes and Worker client can import the same exact types without local
redefinitions or authority ambiguity.

## UI/UX Contract

### Target User / JTBD
N/A — shared contract layer; consuming screens must render its safe states.
### Surface Inventory
N/A — no rendered surface.
### Component Map
N/A — schemas only.
### State Matrix
Defines loading, empty, denied, stale, blocked, accepted, failed, revoked, and recovery states.
### Responsive Matrix
N/A — no layout.
### Accessibility Acceptance
Consuming UI must expose stable status/error codes as labeled live status.
### Copy Contract
Machine errors map to Thai/English localized copy without raw identity/path details.
### Browser Evidence Required
N/A — shared contract tests; browser evidence belongs to sections 04/05.
