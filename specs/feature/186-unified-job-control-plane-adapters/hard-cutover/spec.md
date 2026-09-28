# Feature 186 Hard Cutover Implementation Specification

**Status:** IMPLEMENTED LOCALLY — Waves 1–5 use the PostgreSQL Job Control
Plane as the side-effecting ingress for their migrated job types; this is not
production-complete until compatibility drain, domain projection, provider,
deployment, and disaster-recovery evidence gates pass.

## Goal

Every migrated asynchronous operation must create a canonical `worker_jobs`
row and transactional outbox intent before execution. Waves 1–5 execute the
selected Node and Python job types through PostgreSQL outbox/direct or
PostgreSQL-pull adapters without requiring Redis for those paths; Redis,
BullMQ, and Celery remain compatibility infrastructure for rollback/drain and
legacy domain projections. A generic wrapper must claim the canonical job, run
a registered handler, and report through the fenced control-plane contract.

## Required outcomes

1. A producer-facing `ControlPlaneJobGateway` accepts only server-derived
   context and registered job definitions. It returns a stable canonical job
   ID and is idempotent by tenant-scoped definition.
2. An executor registry maps migrated `jobType` values to existing Node or
   Python handlers without copying mutable payload/status authority into the
   transport message.
3. A real bounded outbox publisher loop claims durable rows, resolves adapters
   server-side, persists dispatch references, and quarantines ambiguous or
   poison publication safely.
4. BullMQ and Celery consumers receive only `{ job_id, contract_version,
   business_attempt, attempt_id }`, reject unsupported versions before claim,
   claim a fenced lease, execute the registered handler, and report outcome.
5. Direct side-effecting `.add()`, `.delay()`, `.apply_async()`, and
   `send_task()` call sites are migrated in independently reversible waves.
6. Existing domain side effects retain their authored input, provider operation
   keys, settlement markers, and domain projection reconciliation.
7. Static inventory and runtime metrics prove which producer path is active;
   dual-run side effects are forbidden.

## Non-goals

- Do not delete Redis, BullMQ, Celery, or current workers in this change.
- Do not activate Cloudflare production or mutate credentials/infrastructure.
- Do not introduce a second generic jobs table or a second lifecycle status.
- Do not rewrite domain business logic unless needed to expose a handler port.
- Do not run repository-wide typecheck; the user has explicitly excluded it.

## Existing constraints

The existing Feature 186 foundation provides `worker_jobs`, lifecycle events,
attempts/dispatches/outbox companions, guarded leases, reporters, callbacks,
actions, a reconciler, and focused tests. The current hard-cutover manifest
records Waves 1–5 on PostgreSQL-backed execution. The machine-readable audit
finds no unowned direct BullMQ/Celery producer, scheduler, or application
result-reader calls, 47 adapter-owned Python submission sites, 3 explicit
legacy transport calls inside the compatibility adapter, and one centralized
rollback-only legacy status adapter serving 7 legacy-reader usages. The
hard-cutover work extends those ports rather than creating a parallel
implementation.

## Migration contract

Each producer mapping records: canonical job type, execution class, owner,
handler, adapter, tenant/actor source, side effects, timeout/retry policy,
legacy in-flight drain rule, feature flag, canary, rollback criterion, and
evidence. A job type has one active side-effecting producer at a time. Legacy
IDs remain compatibility references unless a verified one-to-one binding exists.

The first production-safe milestone is a low-risk wave that can be exercised
without paid provider calls. Provider/media jobs are enabled only after their
operation-key and settlement tests pass. Cloudflare replacement remains a
separate later phase after the ingress migration is complete.

## Acceptance criteria

- A successful producer call leaves one job, one `CREATED`/`QUEUED` history, and
  one outbox intent before transport publication.
- Duplicate creates and duplicate outbox publishes converge on the same IDs.
- Outbox publisher loss, broker loss, duplicate delivery, stale lease, and
  cancellation races are recoverable without duplicate side effects.
- Generic wrappers never trust transport tenant/actor/status fields.
- Direct transport inventory reaches zero outside an explicit compatibility
  allowlist, with every exception having an owner and expiry.
- Focused tests and structural audits pass for each completed wave.
