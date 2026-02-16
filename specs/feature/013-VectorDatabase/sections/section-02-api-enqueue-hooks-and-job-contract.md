# Section 02: API Enqueue Hooks and Job Contract

## Objective
Extend API-side indexing triggers so gallery/library lifecycle events reliably enqueue vector jobs using a versioned, tenant-safe payload contract compatible with existing Celery processing.

## Scope
- Define/extend vector indexing payload schema with `domain`, `operation`, `tenant context`, `dedupe key`, and payload version.
- Add enqueue hooks to gallery and library create/update/delete flows.
- Add enqueue coverage for media-to-library ingestion path where indexing-relevant records are produced.
- Ensure non-blocking enqueue behavior and timeout/error handling that does not break primary API writes.
- Preserve backward compatibility for in-flight legacy payloads.

## Out of Scope
- Worker dispatch/idempotency internals (Section 03).
- Campaign backfill/resume logic (Section 05).

## Dependencies
- section-01-provider-abstraction-foundation

## Implementation Tasks
1. Define payload schema and versioning strategy that supports both immediate index and delete operations.
2. Instrument gallery router/service write paths to enqueue index/delete jobs with tenant/domain metadata.
3. Instrument library upload/delete flows and ingestion-derived object creation paths similarly.
4. Implement dedupe-key generation rules that remain stable across retried enqueue calls.
5. Add parser compatibility layer so legacy payload versions remain valid during rollout.
6. Add backpressure hook points so queue health signals can throttle non-critical enqueue paths when required.

## TDD-First Test Stubs
- Gallery create/update/delete enqueue payload includes required fields.
- Library create/upload/delete enqueue payload matches contract.
- Ingestion path emits expected source metadata.
- Legacy payload parser remains compatible with in-flight jobs.
- Non-blocking enqueue preserves API write success on transient queue errors.
- Backpressure threshold logic throttles as configured.

## Risk Controls
- Make enqueue failures observable via audit events without failing core write transaction when safe.
- Keep payload parser additive/version-tolerant to avoid mixed-version deployment breakage.
- Validate tenant attribution on enqueue boundary to prevent cross-tenant indexing mistakes.

## Done Criteria
- Gallery/library paths consistently emit index/delete jobs.
- Payload schema is versioned and backward compatible.
- Test coverage confirms enqueue behavior, compatibility, and throttle semantics.

## As-Built (2026-02-16)

### Actual files changed
- `apps/web/server/services/libraryIndexJobContract.ts`
- `apps/web/server/services/libraryIndexJobContract.test.ts`
- `apps/web/server/services/libraryService.ts`
- `apps/web/server/services/libraryService.test.ts`
- `apps/web/server/services/mediaLibraryService.ts`
- `apps/web/server/services/mediaLibraryService.test.ts`

### Deviations from plan
- Payload contract and parser compatibility are implemented at service layer and not yet persisted as dedicated queue table columns.
- Gallery enqueue coverage is implemented via media-to-library ingestion (`mediaLibraryService`) and library mutation hooks; direct standalone gallery router enqueue integration remains follow-up.

### Tests added/updated
- Added: `apps/web/server/services/libraryIndexJobContract.test.ts`
  - gallery/library payload required fields
  - stable dedupe key generation
  - v2 + legacy parser compatibility
  - backpressure threshold behavior
- Updated: `apps/web/server/services/libraryService.test.ts`
  - upload path preserves write success when enqueue fails transiently
- Updated: `apps/web/server/services/mediaLibraryService.test.ts`
  - safe enqueue integration for media-to-library ingestion path

### Known follow-ups
- Persist payload contract fields in queue DB rows for worker-native parsing and diagnostics.
- Feed live queue lag/failure metrics into backpressure policy instead of static env values.
