# Section 02 — Persistence and server media services

## Goal

Persist Series-scoped media roots/metadata and implement authenticated server
admission/publication/index seams. Source footage remains local; server stores
safe metadata and verified derived artifacts only.

## Files

- Extend `apps/web/drizzle/schema.ts` with additive tables/columns and add one
  migration under `apps/web/drizzle/` for media root bindings, media records,
  idempotency/audit/index projection as justified by existing schema.
- Add `apps/web/server/services/verticalDramaSeriesAccessService.ts` and
  `verticalDramaMediaJobService.ts`, `verticalDramaMediaPublicationService.ts`,
  `verticalDramaMediaIndexService.ts`, and `verticalDramaWorkflowResolver.ts`.
- Add typed route helpers/endpoints in
  `apps/web/server/routes/workerRuntime.ts` or a focused companion registered
  from `apps/web/server/_core/index.ts`.
- Add focused server/schema tests under `apps/web/server/services/__tests__/`,
  `apps/web/server/routes/__tests__/`, and shared migration contract tests.

## Required behavior

Extract the owner predicate from `verticalDramaSeries.ts` into a neutral access
service. Resolve current Worker principal and Series access on every request;
fail closed and use safe not-found for hidden Series. Add typed ingest/preprocess
job admission with idempotency, policy/capability checks, current root/binding
revision, and server-owned attribution.

Finalize derived artifacts only with upload-token scope, current principal and
root/policy/rights/shot rechecks, checksum/manifest/QC/dimension/duration
verification, tenant/Series ownership, and immutable provenance. Never accept
source URLs, raw paths, browser R2 keys, or source bytes as a publication
shortcut. Index metadata is tenant + Series filtered, revision-aware and
idempotent.

Migration must be additive, transaction-safe where supported, have active
uniqueness/indexes, dry-run conflict reporting, no blind owner backfill, and no
destructive down migration.

## TDD requirements

Test principal/access precedence, hidden resource behavior, idempotency/replay,
stale/revoked roots, upload scope separation, checksum/QC failures, duplicate
publication, index filtering, migration dry-run conflicts, and rollback
preservation. Use dependency injection/mocks consistent with existing route
tests; do not require live R2 or a live database for unit tests.

## Acceptance

Server can admit a typed local media job and accept only a verified derived
artifact while preserving current Worker jobs and current browser Series
authorization behavior.

## UI/UX Contract

### Target User / JTBD
N/A — server contract only; UI consumes safe projections.
### Surface Inventory
N/A — routes return data, not layout.
### Component Map
N/A — service and route ownership is documented above.
### State Matrix
Responses expose accepted, blocked, stale, unauthorized, failed, published, and indexed states.
### Responsive Matrix
N/A — no layout.
### Accessibility Acceptance
Error codes/messages must be localizable and actionable by consuming screens.
### Copy Contract
Stable machine codes with safe localized message keys; no raw path/provider text.
### Browser Evidence Required
N/A — route/service tests here; browser proof belongs to UI sections.
