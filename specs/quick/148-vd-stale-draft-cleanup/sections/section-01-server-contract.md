# Section 01 — Server contract

## Ownership

Own the Draft ledger service, its focused tests, and the Draft Inbox procedures
inside `verticalDramaSeries.ts`. Do not modify the schema or series deletion paths.

## TDD expectations

- Red tests for exact 5/7/10 thresholds and eligible-state filtering.
- Prove active, applied, archived, cross-owner, and too-new rows are excluded.
- Prove counts cover rows beyond the visible list limit.
- Prove the update returns the actual affected-row count.

## Acceptance checks

- Summary keys and mutation input share one fixed threshold contract.
- Server time/cutoff and owner/status conditions are authoritative.
- No series, version, or object-storage delete call exists in the path.

## Implemented

- Added `apps/web/server/services/verticalDramaDraftCleanup.ts` with one
  service-owned threshold schema, aggregate counts, and a guarded bulk archive.
- Added `archiveStaleDraftJobs` and the additive cleanup summary to the existing
  owner-scoped router.
- Added `verticalDramaDraftCleanup.test.ts`; final Section 01 coverage is 6
  cleanup tests plus the existing ledger regression. Tests assert exact owner,
  status, unarchived, and strict cutoff predicates.
- Review initially found predicate-test and duplicated-threshold gaps; both were
  auto-fixed and the re-review passed.

## Coordination

The client consumes `{ cleanup: { counts: { 5, 7, 10 } } }` from
`listDraftJobs` and calls `archiveStaleDraftJobs({ olderThanDays })`.
