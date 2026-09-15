# Feature 186 Hard Cutover Design

## Decision

Make the PostgreSQL Job Control Plane the only side-effecting job ingress. Redis,
BullMQ, and Celery remain execution transports during the migration, but they
are reachable only through registered transport adapters. Domain services create
one canonical `worker_jobs` row and rely on its transactional outbox for
publication. The first cutover therefore replaces the old job-control authority
without requiring an unsafe all-at-once replacement of the workers.

## Problem

Feature 186 currently provides the canonical ledger, leases, events, outbox
primitives, and adapter contracts, but existing producers still call BullMQ or
Celery directly. This leaves two ingress paths and allows transport state and
domain state to diverge. A real cutover must make direct transport submission
structurally unavailable to business code, preserve existing executors through
thin wrappers, and migrate paid/provider side effects without duplicate work.

## Architecture

```text
Domain producer
  -> ControlPlaneJobGateway.create()
  -> worker_jobs + worker_job_events + worker_job_outbox (one transaction)
  -> running outbox publisher
  -> registered BullMQ/Celery adapter
  -> {job_id, contract_version, attempt} envelope
  -> generic executor wrapper
  -> claim(job_id) and fenced JobExecutor
  -> existing domain handler
  -> guarded reporter / settlement markers
```

The canonical ID is generated before publication. The transport reference is
recorded only after an adapter publish succeeds. Broker retry, task retry, and
provider polling never increment the business attempt. A control-plane retry
does so exactly once and creates the next outbox intent.

## Components

### ControlPlaneJobGateway

The gateway is the only producer-facing API. It accepts authenticated server
context, a registered job type, a bounded definition, and an idempotency key. It
canonicalizes tenant/actor/routing fields, validates the handler and adapter
registration, creates the durable job and outbox intent, and returns the stable
canonical ID. It does not accept an adapter object, queue name, provider ID, or
raw transport payload from a caller.

### Executor registry

Each migrated job type registers one executor and one execution class. The
registry maps a canonical job context to the existing business handler. The
generic BullMQ and Celery wrappers load the context, reject unsupported contract
versions before claim, claim the lease, invoke the registry, and report through
the fenced reporter. They do not copy mutable status or tenant fields from the
message.

### Outbox publisher

The publisher runs as a real bounded process loop with a configurable batch
limit, per-row lease, retry schedule, quarantine threshold, and metrics. It
resolves adapters only from server-side routing policy. A publish response is
not acknowledged locally until the dispatch reference and `DISPATCHED` event
are durable. Ambiguous publication uses deterministic transport IDs/queryable
inspection or quarantine; it never blindly republishes an irreversible job.

### Legacy compatibility boundary

During each wave, the old business handler may remain unchanged behind the
generic executor. A compatibility shim may translate its input to the
canonical job context, but the shim cannot create a second job or call a queue.
Direct BullMQ/Celery calls are allowed only in the adapter implementation and
in explicitly listed, non-side-effecting operational probes during migration.

## Migration waves

1. **Ingress foundation:** gateway, registry, publisher loop, adapter resolver,
   static allowlist, metrics, and failure-mode tests.
2. **Low-risk Node jobs:** maintenance, notification, webhook, and automation
   jobs with durable domain idempotency.
3. **Python/Celery jobs:** media/import/presentation/workflow wrappers, moving
   business retry decisions to the control plane while preserving Celery as
   transport.
4. **Paid and provider jobs:** image/video/audio/vision and artifact-producing
   handlers, only after provider operation keys and settlement markers are
   proven for each class.
5. **CPU/external runtimes:** sandbox, Worker App, and container-capable jobs.
6. **Transport replacement:** only after all producers use the gateway and
   Cloudflare account connectivity, rollback, and recovery evidence is real.

Each wave has one active side-effecting producer, a canary allowlist, a drain
rule for in-flight legacy work, a rollback flag, and a reconciliation window.
Dual-run is permitted only for observation or side-effect-free execution.

## Error and safety rules

- PostgreSQL failure before commit means no transport call.
- PostgreSQL success followed by broker failure leaves durable outbox state.
- Duplicate producer requests return the same canonical ID.
- Duplicate delivery claims the same attempt or becomes a no-op; it never
  increments the business attempt by itself.
- A stale lease cannot complete, settle, publish, or mutate a domain projection.
- Provider ambiguity is queried by the persisted operation key or quarantined.
- Cancellation fences the attempt before transport cancellation is requested.
- Capacity exhaustion returns backpressure while preserving a recoverable job.
- Tenant, actor, adapter, queue, and billing scope are server-derived.

## Definition of done

- Every side-effecting producer is either migrated to the gateway or has an
  approved, time-bounded compatibility exception.
- `direct_transport_call_sites` is zero outside adapter/operational allowlists.
- The outbox publisher and reconciler run in the target runtime and expose age,
  quarantine, recovery, and settlement metrics.
- Generic BullMQ/Celery wrappers execute representative handlers using only the
  canonical job ID and fenced lease context.
- Duplicate delivery, lost publish response, worker loss, stale completion,
  cancellation race, provider ambiguity, and settlement replay tests pass.
- No typecheck is required for this rollout because the user explicitly
  excluded it; changed-path tests and structural checks are required instead.
- Cloudflare production cutover remains a separate deployment/account gate and
  is not claimed by this design.

## Trade-off

Keeping Redis/BullMQ/Celery as adapters temporarily adds one more boundary, but
it makes the control-plane authority testable and reversible before introducing
Cloudflare account, network, and provider-side risks. Removing the transports
immediately would make recovery less safe and would couple this migration to a
production deployment proof that is not available locally.
