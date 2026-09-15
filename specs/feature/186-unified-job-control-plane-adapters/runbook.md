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

1. Complete Feature 186 contract/schema/lifecycle gates first. Then complete Feature 189 identity/transfer gates and Feature 187 environment/promotion rehearsal before Feature 188 activation.
2. Keep the existing producer active while the new adapter runs in observation-only mode.
3. Stop new work from the old producer for the selected job type, enable one side-effecting adapter, and verify canonical IDs in PostgreSQL.
4. Watch lease freshness, outbox age, retry classifications, duplicate side effects, durable action/callback evidence, and domain settlement for the reconciliation window.
5. Roll back new work to the old adapter if an SLO or correctness gate fails. Do not roll back committed canonical history.

### Wave 1 hard-cutover activation

For `webhook.dispatch`, `webhook.api_delivery`, and `embedding.generate`, set
`FEATURE_186_HARD_CUTOVER=true`. The application starts the PostgreSQL outbox
runner and `postgres-pull` adapter; Node execution is owned by the separately
supervised PostgreSQL-pull worker. Both legacy webhook queue initializers
and the embedding queue path return without opening Redis connections. Leave
`FEATURE_186_UNIFIED_BULLMQ` unset unless a later wave explicitly needs the
unified BullMQ transport. Verify the startup log, canonical outbox age, and
the two hard-cutover test suites before accepting traffic.

This is a bounded local/runtime wave, not a claim that all Redis/BullMQ/Celery
producers are gone. The audit must still show the remaining unmigrated
producers and the manifest must retain the production-complete gate.

### Wave 3 Node-domain and media execution activation

The following Node job types now use the same PostgreSQL outbox/direct
executor when hard cutover is enabled: `capacity.assessment`,
`channel.delivery`, `automation.execute`, and `database.backup`. Their legacy
BullMQ initializers are skipped in hard mode; retention and reconciliation
remain timer/reconciler work owned by the application.

The daily capacity schedule uses UTC 03:15 and requires the existing tenant
scope to be supplied as `FEATURE_186_SYSTEM_TENANT_ID`; without it the process
logs a visible configuration gate and does not create an unscoped job.

Python media generation uses the PostgreSQL-pull worker for the initial
submission and keeps provider polling inside the same fenced execution. This
path is intentionally bounded by `FEATURE_186_MEDIA_POLL_DEADLINE_SECONDS`.
It is not production-approved until provider 429/5xx, callback, lease expiry,
duplicate delivery, artifact settlement, and credit-side-effect evidence pass
against the real deployment dependencies.

Do not interpret the centralized legacy status adapter or the remaining static
`.delay()`, `.apply_async()`, or `send_task()` compatibility boundary as
canonical state. Direct producer and reader calls must remain absent from
business/API/recovery modules. The adapter and its rollback retention window
remain blockers for full Redis/BullMQ/Celery retirement; the current audit
count and exact boundary locations must be copied into the rollout manifest
for every release candidate.

### Wave 2 Python PostgreSQL-pull activation

Run a separate Python worker process from `python-backend`:

```bash
FEATURE_186_HARD_CUTOVER=true \
FEATURE_186_POSTGRES_PYTHON_WORKER=true \
uv run python -m app.workers.postgres_job_worker
```

For the full Compose deployment, start the same worker through the opt-in
Feature 186 profile after setting the shared `SMARTSPEC_WEB_GATEWAY_TOKEN`:

```bash
FEATURE_186_HARD_CUTOVER=true \
FEATURE_186_POSTGRES_PYTHON_WORKER=true \
FEATURE_186_SYSTEM_TENANT_ID=<validated-system-tenant-id> \
docker compose -f docker-compose.full.yml --profile feature186 up -d \
  smartspec-python-job-worker
```

The profile is deliberate: it prevents a legacy Celery deployment from
starting a worker that cannot claim canonical jobs. The two Feature 186 flags
must still be true inside the worker container; otherwise it exits before
polling.

With both flags enabled, tenant-bound producers that call
`dispatch_python_task` create `worker_jobs` first. The Node outbox publishes a
`postgres-pull` dispatch record, and the Python worker polls the authenticated
`/api/internal/job-control-plane/ready` endpoint before claiming a fenced lease.
It does not connect to Redis or publish to Celery. The worker must have the
Node control-plane URL and shared internal token configured, and the Node
process must have the additive `0309_feature_186_python_job_runtime` migration
applied.

Do not enable this flag for any unverified legacy domain projection. The
centralized compatibility status adapter is rollback-only and does not make
legacy task state canonical. Tenant binding, status projection, retry
semantics, and side-effect evidence must pass a separate wave. A failed
control-plane connection must leave the
canonical job queued/outbox-visible; it must not fall back to inline execution
or create a second legacy task.

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
