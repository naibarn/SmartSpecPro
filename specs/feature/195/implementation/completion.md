# Feature 195 implementation evidence

## Section status

- section-01-contracts: implemented. Added canonical transition and lease-fence helpers and integrated them into guarded lease updates.
- section-02-persistence: verified against the existing additive migrations/schema; no missing canonical table or safe constraint justified a new migration.
- section-03-publication-and-capacity: verified against the existing admission/outbox/publisher implementation and focused Feature 186 tests.
- section-04-lifecycle-and-control: verified existing lease, heartbeat, retry, cancellation, recovery and operator-action paths; stale attempt fencing now uses the shared helper.
- section-05-monitoring-and-integrations: verified existing monitor/router projections and the cross-spec contract matrix; the inline Task Control tab in the app-wide `AI Chat & Feedback` surface now provides a user-facing canonical Job summary and recent-job handoff to `/worker-jobs`.
- section-06-migration-and-release-gates: implemented release/rollback documentation and migration-contract coverage remains green.

The Feature 186 producer audit also found and fixed three Vector DB maintenance
call sites that bypassed the producer boundary. Admin backfill/retry scheduling
and bounded campaign continuation now use `dispatch_python_task`; the manifest
is refreshed to the verified inventory (`direct=0`, `unmigrated=0`,
`adapter-owned=40`).

## Evidence

Focused Feature 195 suite: `jobControlPlaneTypes`, `jobControlPlane`,
`jobControlPlaneGateway` — 3 files, 48 tests passed.

No whole-repository typecheck was run.

Focused UI evidence is covered by the shared Task Control tab tests and
responsive browser smoke recorded under Features 198–200; the Job data remains
read-only/user-scoped and the Chat surface stays inline on the current page.

## 2026-09-18 implementation audit corrections

- Added a repository-boundary transition assertion so the default PostgreSQL
  update path cannot bypass the canonical Feature 195 lifecycle table.
- Added dependency-aware claim gating for Job graphs: queued dependents wait
  for successful prerequisites and fail closed with operator review when a
  prerequisite is missing or terminally failed.
- Added focused regression coverage for both dependency paths.
