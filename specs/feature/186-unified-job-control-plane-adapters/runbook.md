# Feature 186 rollout and recovery runbook

## Preconditions

1. Verify the target database, backup/restore point, migration journal, and maintenance window.
2. Run the migration-shape test and a backfill dry-run. Review skipped/ambiguous rows before `--apply`.
3. Record the job types, owning producers, adapter flag, schema version, and rollback flag in `rollout-manifest.yaml`.
4. Confirm build/restart identity, worker-to-PostgreSQL connectivity, and reconciler/outbox metrics.

Canonical lifecycle-event retention is append-only: `worker_job_events` must not
be deleted in place. Any future retention process must first archive immutable,
redacted evidence to an approved store, verify the archive, and retain the
configured billing/audit/rollback window before considering compaction.

## Wave procedure

1. Keep the existing producer active while the new adapter runs in observation-only mode.
2. Stop new work from the old producer for the selected job type, enable one side-effecting adapter, and verify canonical IDs in PostgreSQL.
3. Watch lease freshness, outbox age, retry classifications, duplicate side effects, and domain settlement for the reconciliation window.
4. Roll back new work to the old adapter if an SLO or correctness gate fails. Do not roll back committed canonical history.

## Recovery rules

- PostgreSQL is unavailable: do not publish new work; preserve the outbox intent and retry later.
- Broker/provider publish is ambiguous: inspect the stable dedupe/reference key; quarantine rather than blindly resubmit paid work.
- Worker loss: let the application lease expire, fence the attempt, inspect side-effect evidence, then recover centrally.
- A late callback must pass signature/replay/tenant/reference checks and reacquire a fenced lease before changing state.
- `worker_job_events` is append-only; never repair a mismatch by deleting history or creating a replacement job implicitly.

## Evidence boundary

Local tests prove contract behavior only. Cloudflare account limits, bindings, deployment, production latency, worker connectivity, and live recovery require separate deployment evidence.
