# Provider Intake, Fairness, and Durable Polling Design

## Decision

Provider-backed jobs are accepted into the canonical PostgreSQL queue before
provider capacity is available. Provider submission is a separate durable
dispatch phase. A job that has been submitted to Kie.ai, WaveSpeedAI, or
OpenRouter enters `waiting_external`; it does not hold a Node/Python execution
lease while the provider runs. A durable poll/reconciliation record schedules
status checks until terminal evidence is obtained.

`worker_jobs` remains the only job lifecycle source of truth. Provider account
rows, reservations, polling records, fairness state, and transport references
are coordination/evidence companions and cannot expose a second job status,
attempt counter, result identity, or create identity.

## Why this boundary is required

Provider work can take from one minute to thirty minutes or longer. Keeping a
worker lease or an in-memory timer open for that interval causes worker slot
starvation, restarts, duplicate submissions, and lost polling after deployment.
Cloudflare Queues delivery and Workflow retries also do not replace the
application lease, provider idempotency, or PostgreSQL result evidence.

Callbacks remain optional. The system must be complete with polling alone.
Callbacks, when available, are merely an authenticated signal to accelerate a
poll and still pass through callback replay protection and the same guarded
control-plane transition.

## Durable data model

### Provider accounts

Keep `llm_providers` and `media_providers` as logical provider definitions.
Add provider-account companions with at most five account slots per logical
provider. Existing credentials are migrated to slot 1; no credential is
returned to clients or copied into a job payload.

Each account stores encrypted credentials, account label/hint, enabled and
health/cooldown state, capability/model scope, provider-specific rate and
concurrency overrides, and last health evidence. The database enforces a
unique `(provider_id, account_slot)` and slot range 1..5. Provider routing
selects an account server-side from validated capability and tenant policy.

### Provider reservations

Add a `worker_job_provider_reservations` companion keyed by canonical job and
business attempt. It records provider/account, reservation kind, deterministic
operation key, provider reference, reservation status, owner/fencing data,
`nextPollAt`, polling attempt/count, provider deadline, and safe recovery
reason. Reservation kinds are separate for submission token, provider-running
slot, and poll request budget. A running reservation is released only after
terminal provider evidence or an authorized recovery decision.

### Fairness and account windows

Persist scheduler state per provider/account pool and server-derived user key:
active count, last served time, and `fairnessEligibleAt`. Persist account
window/cooldown state or derive it from reservation events in a bounded
window. The scheduler may use PostgreSQL row locks or advisory locks for the
short selection transaction, but never holds a transaction over an HTTP call.

## Submission algorithm

1. The authenticated request creates `worker_jobs`, `CREATED`/`QUEUED`, and an
   outbox intent in one transaction. Provider saturation never rejects a valid
   request. An independently exceeded application backlog budget may reject
   before any provider or credit side effect.
2. A provider scheduler selects only eligible provider jobs from PostgreSQL,
   using bounded `FOR UPDATE SKIP LOCKED` batches and server-derived provider,
   account, tenant, and user scope.
3. It reserves the account rate token, provider-running slot, and user active
   slot in a short transaction. If any dimension is full, the row remains
   `queued` and receives a persisted next-eligible time.
4. Outside the transaction, it submits with a deterministic operation key
   derived from canonical job ID, business attempt, and logical operation.
5. It persists the provider reference and transitions the job to
   `waiting_external` through a guarded transaction. If the HTTP response is
   lost, it queries by operation key/reference before considering recovery.
   An adapter without a queryable/deterministic publication boundary is
   quarantined rather than blindly resubmitted.
6. The provider-running reservation remains held while the provider task is
   pending. Submission tokens are not consumed by polling, callbacks, or
   broker redelivery.

## Polling algorithm without callback URLs

After submission, store `providerTaskId`/reference and `nextPollAt` in the
reservation/evidence record and materialize `waiting_external` on
`worker_jobs`. Release the execution lease immediately. A poll scheduler
claims due records with a short poller lease, performs one provider status
request outside PostgreSQL, then commits one idempotent outcome:

- pending: update `nextPollAt` with adaptive backoff and release the poller
  lease;
- completed: download/copy the provider output into managed storage while
  preserving provider idempotency, then commit result reference, settlement,
  projection, and `succeeded` as one transaction where possible;
- failed/cancelled/timeout: release reservations and use central error
  classification to retry, fail, expire, or request operator review;
- unknown/ambiguous: inspect by operation key/reference; fail closed to
  operator review when evidence is insufficient.

Recommended polling cadence is provider-configured and bounded: begin around
2-5 seconds, increase to 10-30 seconds for long waits, and cap the interval
per provider/job class. Use per-account poll budgets so thousands of waiting
jobs cannot create an API storm. A provider deadline is independent from the
worker lease and is persisted on the reservation. Polling does not create a
new business attempt.

The poller is a normal durable worker process today and may later run behind
Cloudflare Queue delayed messages, Workflow waits, or Cron sweeps. It must
never rely on `setTimeout`, process memory, a browser tab, or a callback URL for
correctness. A callback only wakes or prioritizes a durable poll record.

## Fairness policy

The initial burst permits up to three active provider jobs per user, subject to
account/provider limits. It then applies a persisted fairness cooldown of at
most 15 seconds. If another eligible user exists, that competitor is selected
immediately. If no competitor exists at the deadline and capacity remains,
the same user receives one additional slot and the cooldown is applied again.
When a provider slot is released, the scheduler wakes immediately and prefers
an eligible waiting competitor; otherwise it refills the same user. This is a
fairness rule, not a provider quota and not a queue length.

Selection order is deterministic enough for audit: eligible time, fairness
deadline, last-served time, priority, creation time, and canonical job ID.
All state needed to make that decision is persisted or derivable from
PostgreSQL. In-memory Bottleneck limits remain local safety guards only.

## Cloudflare and Docker boundary

Cloudflare Queues/Workflows/Containers are transport or execution adapters;
Hyperdrive connects to the existing PostgreSQL source of truth. Cloudflare
consumers must not acknowledge a message until canonical lifecycle evidence is
durable. Provider polling uses delayed durable signals or Cron sweeps, not
long-lived Worker requests.

Docker/Celery/BullMQ may remain during the compatibility drain and rollback
window. They are not an accepted steady-state provider polling runtime after
Cloudflare cutover. The cutover gate requires: all selected provider job types
have a Cloudflare adapter and poller, no new Docker queue producer, drained or
explicitly quarantined legacy work, target-account Hyperdrive/connectivity
proof, duplicate/lost-response recovery proof, provider restart proof, and a
rollback plan that preserves the same canonical IDs and provider operation
keys. Local mocks, Wrangler validation, and health endpoints are insufficient.

## Capacity target

“Thousands of users waiting” is primarily a PostgreSQL durability and polling
budget problem, not a Cloudflare queue-length problem. The design supports
thousands to tens of thousands of queued rows if PostgreSQL indexes, outbox
throughput, scheduler shard count, account limits, and poll budgets are sized
and load-tested. Completion throughput remains bounded by provider quotas and
configured account slots. The rollout manifest must therefore publish numeric
targets for queued rows, submission decisions/sec, poll requests/sec,
database query/transaction latency, outbox age, and maximum provider wait
time; capacity is not claimed from the data model alone.

## Required evidence

- concurrent reservation tests prove no account/user/running slot oversubscription;
- fairness tests prove competitor interleaving and the 15-second idle fallback;
- 1-30+ minute polling tests prove no worker lease is held and no duplicate
  provider submission occurs after restart or lost HTTP response;
- provider terminal evidence releases reservations exactly once;
- callback-free operation passes end-to-end with durable `nextPollAt`;
- Cloudflare target-account Hyperdrive, Queue/Workflow/Container capability,
  rollback, restore/PITR, and no-Docker cutover evidence are recorded before
  activation.
