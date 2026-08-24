# Vertical Drama Series-owned Draft/QC integrity

## Problem

Deleting a Series sets `vertical_drama_draft_ledgers.seriesId` to `NULL`. The
planning shell then treats the preserved ledger as a legacy Draft and creates a
new recovery Series. Draft composition and QC also still accept session-only
identities, so a retry or stale worker can write outside the selected Series.

## Contract

- A new Series-first Draft composition must carry an owner-verified `seriesId`.
- Its durable ledger is the single current Draft owner for that Series and
  keeps all immutable versions.
- Every new QC run carries the same `seriesId`, `draftId`, and session identity.
  Server status, repair, cancellation, selection, and create receipt paths must
  verify the complete tuple instead of trusting a client session or run alone.
- Worker persistence re-checks the ledger association and deletion tombstone
  before writing. A worker that finishes after deletion may report terminal
  failure but cannot append a new version.
- A deleted Series tombstones its linked Draft ledger before the parent delete.
  Draft versions and QC history remain readable; automatic legacy migration
  excludes the tombstone and never recreates the Series.

## Data safety

The tombstone is separate from user archive state. The follow-up cleanup
migration performs an explicit, data-preserving reconciliation: deterministic
`legacyRecovery` Series shells and all remaining NULL-Series legacy ledgers are
archived, never deleted. Their immutable Draft versions/QC snapshots remain in
place, while normal recovery queries exclude archived rows. Source Pack cascade
behavior is preserved in this patch and reported as a separate data-retention
decision.

## Acceptance criteria

1. A new composition/QC request without an owned Series is rejected.
2. The ledger, composition record, QC record, receipt, and planning state all
   resolve to the same Series.
3. A Series cannot have two active current Draft ledgers created by retries.
4. Deleting a Series preserves Draft versions/QC history, marks the ledger
   tombstoned, and a subsequent `/drama-series` visit creates no new Series.
5. A queued/running worker cannot append or update a tombstoned ledger.
6. Focused tests cover wrong-Series receipts, cross-Series recovery, deletion
   races, and the legacy migration exclusion.
7. Archived legacy recovery shells and unbound ledgers do not appear in the
   default Series/Draft recovery lists and cannot be loaded by active Series
   Draft/QC endpoints.

## Operational boundary

The Drizzle migration is additive and is not executed against production by the
implementation task. Before activation, operators must audit duplicate active
ledger links and ambiguous NULL ledgers, back up the affected tables, apply the
migration transactionally, and verify before/after counts.
