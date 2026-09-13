# Feature 186 rollout and recovery runbook

## Preconditions

1. Verify the target database, backup/restore point, migration journal, and maintenance window.
2. Run the migration-shape test and a backfill dry-run. Review skipped/ambiguous rows before `--apply`.
3. Record the job types, owning producers, adapter flag, schema version, and rollback flag in `rollout-manifest.yaml`.
4. Confirm build/restart identity, worker-to-PostgreSQL connectivity, and reconciler/outbox metrics.
5. Configure `FEATURE_186_MONITOR_CURSOR_SECRET` as a deployment secret before
   enabling admin cursor pagination; never put it in source control or the
   checked-in `.env` file.

The tenant data-transfer boundary is not enabled by this foundation rollout.
Do not expose `tenant_data_transfer` preview/approval/execution endpoints until
the separately planned registered-handler schema, same-tenant authorization,
queue-cancellation, checkpoint/resume, and browser evidence gates pass. A
missing transfer module is a rollout block, not permission to copy resources
with ad-hoc table updates.

For a Cloudflare wave, create or select only the approved environment-specific
Hyperdrive configuration that points to the existing PostgreSQL database, bind
it to the Worker through the deployment configuration, and prove origin ACL/TLS
access, pool capacity, fresh canonical reads, and bounded transactions. Never
place the Hyperdrive connection string in source control or `.env`; do not use
Hyperdrive cache results as lease/status truth. If the binding or origin is
unavailable, verify that the consumer does not acknowledge work without a
durable PostgreSQL write.

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

## Tenant move and transfer safety

- Treat an account `currentTenantId` move and historical data transfer as
  separate idempotent operations; a tenant move never transfers data by itself.
- Before committing a System Admin binding move, enumerate only verified
  queueable canonical jobs and cancel/fence them. Active
  leased/running/waiting-external work blocks with `ACTIVE_JOB_BLOCKED`.
- If cancellation succeeds but the account update fails, retain the evidence
  and repeat the same action idempotency key; never flush a shared queue or
  infer ownership for an unbound legacy item.
- A transfer requires an approved immutable full-snapshot preview. Resume and
  cancel reuse the same `tenant_data_transfer` job and item keys; completed
  items remain, unsettled items receive explicit cancellation dispositions, and
  no provider, billing, notification, or artifact side effect is repeated.

## Evidence boundary

Local tests prove contract behavior only. Cloudflare account limits, Hyperdrive
binding/origin access, cache behavior, pool capacity, deployment, production
latency, worker connectivity, and live recovery require separate deployment
evidence.
