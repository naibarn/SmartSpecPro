# Feature 186 — Unified Job Control Plane Adapters

**Status:** PROPOSED — architecture and migration specification; no runtime implementation is included in this document.
**Created:** 2026-09-12
**Scope:** Web/Node job dispatch, Python/Celery execution, Celery Beat scheduling, existing Worker App execution, and the future Cloudflare migration boundary.
**Authority:** This specification defines the canonical job contract, persistence invariants, adapter boundaries, rollout gates, and compatibility rules for Feature 186.
**Continuation:** Extends the existing `worker_jobs` and `worker_job_events` foundation from the worker runtime platform. It does not introduce a second generic `jobs` table.

## Outcome

SmartAIHub has one runtime-neutral Job Control Plane. Business services create and observe a canonical `worker_jobs` record and append lifecycle events to `worker_job_events`; BullMQ, Celery, Celery Beat, Worker App, and future Cloudflare services only implement transport, scheduling, or execution adapters.

The first release keeps the current Redis/BullMQ/Celery infrastructure operating. It adds a durable control-plane contract, lease and heartbeat recovery, centralized business retry policy, idempotency, transactional outbox publication, and adapter-by-adapter migration. A later Cloudflare migration can replace one adapter at a time without changing domain services or the canonical job ID.

The primary operational result is that a Redis outage, broker loss, worker restart, duplicate delivery, or stalled process does not erase the system's answer to these questions:

- What is the canonical job and which tenant owns it?
- What is its current state?
- Which attempt and runner hold its lease?
- What transport/runtime references exist?
- What happened, in order, and what recovery action is allowed?

## Non-negotiable invariants

1. **`worker_jobs.id` is the canonical job ID.** It is generated before any transport submission, is immutable and never reused, and is used by the application, adapters, workers, APIs, logs, notifications, billing guards, and future Cloudflare integrations.
2. **PostgreSQL is the source of truth.** Redis lists, BullMQ job records, Celery broker state, Celery result backends, Cloudflare message IDs, workflow instance IDs, and container instance IDs are transport/execution observations only.
3. **`worker_jobs` is the current materialized state.** It is the fast query surface for status, ownership, lease, attempt, retry, progress, result, and error state.
4. **`worker_job_events` is append-only history.** State-changing operations append an event in the same PostgreSQL transaction as the guarded current-state update. When an external side effect cannot share that transaction, the operation must use a durable outbox/settlement marker and a later guarded event; “best effort” event writes are not accepted. An adapter must never delete or rewrite history.
5. **External IDs are references, not identity.** `provider_job_id`, `queue_job_id`, `celery_task_id`, `workflow_instance_id`, and `container_instance_id` are stored as dispatch/execution references associated with the canonical job and attempt.
6. **Business retry is owned by the Job Control Plane.** Adapter retry settings may protect message delivery, but `attempt`, `max_attempts`, `next_retry_at`, backoff, lease expiry, error classification, and terminal decisions are control-plane state.
7. **Delivery is assumed to be at least once.** Every executor and side effect that can be repeated must be idempotent. A duplicate message must converge on the same `worker_jobs` row and must not double-charge, re-submit a provider operation, publish a duplicate artifact, send a duplicate notification, or fire a duplicate webhook.
8. **A queue is not a lease.** Broker visibility, BullMQ locks, Celery acknowledgements, and workflow execution state cannot replace the application lease/heartbeat contract.
9. **Tenant and actor scope is server-derived.** An adapter payload cannot change `tenantId`, user ownership, authorization, billing scope, or destination policy.
10. **Migration is incremental.** Existing queue families may remain on legacy entry points until their adapter contract and recovery evidence pass. No all-queue stop, bulk rewrite, or destructive data migration is required.

## Current foundation and compatibility posture

The codebase already contains the intended starting point:

- `worker_jobs` already stores tenant scope, runtime type, worker binding, job type, priority, input/instruction/output JSON, timeout/retry policy, idempotency key, lease owner token, lease expiry, and lifecycle timestamps.
- `worker_job_events` already stores job-scoped event history with payload JSON and job/time indexes. Existing assignment sequence uniqueness must remain compatible with the broader event idempotency rules in this feature.
- The current `worker_job_status` enum contains runtime-oriented states such as `queued`, `claimed`, `preparing`, `running`, `uploading`, `publishing`, `indexing`, `completed`, `failed`, `canceled`, and `expired`.
- Celery is already configured with late acknowledgements, prefetch control, time limits, queue routing, and periodic tasks. These settings are reliability controls for the current transport, not the canonical job state.
- Existing media, render, worker, sandbox, notification, indexing, and workflow tables remain systems of record for their domain data. Feature 186 binds their asynchronous execution to `worker_jobs`; it does not replace those domain tables.

The implementation must begin with a call-site inventory. It must not assume that every existing Celery task or queue is already a `worker_jobs` job. Until a mapping is proven, legacy task IDs remain compatibility references and are not presented as canonical IDs.

### Status compatibility rule

There is one canonical current-state field on `worker_jobs`; this feature must not introduce a second generic status column whose values can disagree. The target logical vocabulary is `pending`, `queued`, `leased`, `running`, `waiting_external`, `retry_scheduled`, `succeeded`, `failed`, `cancelled`, and `expired`. Existing values remain read-compatible aliases during migration; new control-plane code must write the target vocabulary after the owning call site has migrated. The implementation must inventory all readers/writers before the enum migration and retain an API projection for legacy consumers until they are migrated.

During migration, the compatibility projection is:

| Existing status | Unified logical meaning | Rule |
|---|---|---|
| `queued` | `queued` | Ready for transport publication or redelivery. |
| `claimed` | `leased` | Legacy claim is valid only when the application lease is present and unexpired. |
| `preparing`, `running` | `running` | Execution has started; heartbeat/lease policy applies. |
| `uploading`, `publishing`, `indexing` | `running` | Domain execution stages; they do not create a second job lifecycle. |
| `completed` | `succeeded` | Compatibility alias until API consumers migrate. |
| `failed` | `failed` | Terminal only when the control-plane retry policy says no retry is allowed. |
| `canceled` | `cancelled` | Terminal spelling is normalized at API boundaries. |
| `expired` | `expired` | Terminal unless an explicit recovery policy creates a new attempt on the same canonical job. |

The physical migration may add the target enum values in an expand/compatibility step and remove legacy values only after the retention window and reader migration are complete. It must not create a second status column or silently reinterpret an existing value. `LEASE_EXPIRED` is a required event; it is not required to become a durable status if the reconciler atomically moves the row from an expired lease to `retry_scheduled`, `failed`, or `expired`.

### Domain projection boundary

`worker_jobs` is authoritative for execution lifecycle only. The existing media, render, workflow, billing, notification, artifact, and other domain tables remain authoritative for their business entities and results. A domain row may project `processing`, `completed`, or `failed` for its own UX, but it must not infer execution truth from Redis or a provider status alone.

When a job transition changes a domain projection, the implementation must either commit both changes in one database transaction or persist a durable projection/settlement outbox item linked to the same canonical job and event. A projection mismatch is reconciled by `job_id` and an explicit domain policy; it is never repaired by creating a replacement job or by blindly copying the queue state.

## Account and tenant data-transfer boundary

Feature 186 also defines the execution boundary for an explicit, authorized data-transfer operation. This operation is separate from changing an account's `currentTenantId`: changing the account tenant does not move old data, files, jobs, credits, transactions, or usage history. A later transfer must be initiated explicitly by an authorized Tenant Admin/System Admin workflow and must never be triggered implicitly by an identity move.

When a System Admin changes an account's tenant binding, the guarded move operation must cancel/fence only that user's verified canonical queueable jobs (`pending`, `queued`, and `retry_scheduled`) before committing the new binding; `leased`, `running`, and `waiting_external` work blocks the move until its execution/provider state is resolved or explicitly reviewed. If queue cancellation partially succeeds but the move cannot commit, the cancellation evidence remains durable and a repeat of the same idempotent action continues from the remaining jobs. A shared broker queue must never be globally flushed. Unbound legacy queue items are handled by an explicit drain/quarantine policy and are never attributed to a user from queue position or payload.

The v1 transfer scope is source-user to target-user within the same active tenant. Transferable resources are limited to resources with a registered, versioned server-side handler and may include:

- images, videos, and files in an allowlisted supported format;
- Series, Presentations, Storyboards, projects, and workflows;
- completed artifacts/results and every other terminal job-linked domain resource whose handler proves ownership, dependency, storage, and audit safety.

The supported-format list is handler-owned and versioned. An unregistered resource type or unsupported format is reported explicitly as `unsupported`; it is never silently skipped. A resource handler may change only approved target-user ownership/access fields. It must preserve tenant scope, primary keys, original authorship/execution actors, canonical `worker_jobs.id`, lifecycle history, billing/usage references, and managed artifact identity. Exposing a transferred result to the target user is not a transfer or rewrite of transaction history, usage history, credits, or job lifecycle history.

The following are always excluded and remain associated with the original scope: transactions, usage history, credits, billing/settlement records, credentials, passwords, sessions/tokens, secrets, admin roles, and active execution state. `pending`, `queued`, and `retry_scheduled` job-linked work is not transferred: the transfer preview must automatically enumerate it, the approved operation must issue a guarded `CANCEL_REQUESTED`/`CANCELLED` action, fence any attempt, mark unpublished outbox work cancelled, retain published dispatch references, remove/cancel transport delivery where supported, and record a separate `queue_cancelled` disposition. A cancelled canonical job must reject later claim/redelivery; a transport message that cannot be deleted is acknowledged only as a no-op or routed to an operator-visible quarantine/DLQ according to adapter capability. No shared queue flush, requeue, provider resubmission, regeneration, credit charge, or replacement job is allowed.

`leased`, `running`, and `waiting_external` work is a blocking conflict. Transfer approval returns a stable `ACTIVE_JOB_BLOCKED` result until those jobs settle or are explicitly reviewed; it must not begin partial transfer around the blocker. The operation must resolve the lease/provider operation or require operator review before continuing. A legacy queue item without a verified one-to-one canonical job binding cannot be inferred or transferred from queue position/payload; it is quarantined or killed under the legacy drain policy with bounded evidence and no copied side effect.

Transfer execution is itself one canonical `worker_jobs` record with `jobType = tenant_data_transfer`; `operationId` is that canonical job ID, and item/plan tables are projections and checkpoints only. A large preview persists immutable per-resource preview items and exposes cursor pagination; approval fingerprints the complete snapshot, not only the first page. Approval must re-enumerate queueable jobs and reject with `PREVIEW_STALE` if the resource, queue-candidate, handler, or policy set changed; it must not silently add newly discovered work after review. The operation is preview-first, has immutable selection/fingerprint and deterministic item keys, persists per-item outcomes and checkpoints, and may enter `paused_on_error` on a recoverable system/database/transport failure. In that state the canonical job maps to `retry_scheduled` with `operatorReviewRequired = true`; the reconciler must not publish it automatically. An authorized, idempotent resume action reuses the same canonical job, attempt policy, item keys, and durable results, skips already transferred/approved-skipped items, and continues until all eligible items settle or explicit conflicts/unsupported/permanent items remain. It must never create a replacement operation or duplicate a paid/provider/artifact side effect.

Cancelling a transfer operation fences its active attempt, marks the canonical transfer job `cancelled`, and marks only unsettled transfer items with an explicit `operator_cancelled` disposition; already transferred items are retained and are not rolled back automatically. Cancellation is terminal for that transfer operation and cannot be resumed as a hidden retry.

## Architecture

```text
                         PostgreSQL
                    Source of Truth
                            │
             ┌──────────────┴──────────────┐
             │                             │
        worker_jobs                 worker_job_events
      current materialized state     append-only history
             │                             │
             └──────────────┬──────────────┘
                            │
                 Unified Job Control Plane
       create · claim · lease · heartbeat · progress
       complete · fail · cancel · retry · reconcile
                            │
                   transactional outbox
                            │
             ┌──────────────┼──────────────┐
             │              │              │
       BullMQAdapter   CeleryAdapter   SchedulerAdapter
             │              │              │
           Redis          Redis       Beat/Cron trigger
             │              │              │
        Node runner     Python task     job intent only
             └──────────────┬──────────────┘
                            │
                    JobExecutor / Services
```

Future adapter topology:

```text
                 Unified Job Control Plane
                            │
       ┌────────────────────┼────────────────────┐
       │                    │                    │
 Cloudflare Queues   Cloudflare Workflows   Cloudflare Containers
  single-step transport  durable orchestration    execution runtime
       │                    │                    │
       └─────────────── canonical worker_jobs ────┘
                            │
                      Worker App Adapter
```

The diagrams describe ownership, not a requirement that all runtimes be deployed together. A job has one canonical record and may have one or more dispatch/attempt references over its lifetime.

## Domain contract

### Canonical job definition

The application-facing contract is runtime-neutral:

```ts
type JobDefinition = {
  contractVersion: string;
  tenantId: string;
  requestedByUserId?: number;
  jobType: string;
  executionClass: "short" | "long" | "external" | "cpu" | "gpu" | "scheduled";
  priority?: number;
  input: Record<string, unknown>;
  idempotencyKey?: string;
  schedule?: {
    scheduleId: string;
    occurrenceKey: string;
  };
  retryPolicy: RetryPolicy;
  timeoutPolicy: TimeoutPolicy;
  requiredCapabilities?: Record<string, unknown>;
};

type JobRef = {
  jobId: string; // worker_jobs.id; canonical and stable
  created: boolean;
};

interface JobControlPlane {
  create(definition: JobDefinition): Promise<JobRef>;
  claim(input: { jobId: string; runnerId: string; adapter: string }): Promise<LeaseContext | null>;
  reconcile(jobId: string): Promise<void>;
}

interface JobDispatcher {
  dispatch(jobId: string, options?: { reason?: string; outboxId?: string; dedupeKey?: string }): Promise<DispatchRef>;
  cancel(jobId: string): Promise<void>;
  retry(jobId: string, options?: { reason?: string }): Promise<void>;
}

type DispatchRequest = {
  jobId: string;
  businessAttempt: number;
  attemptId?: string;
  outboxId: string;
  dedupeKey: string;
  contractVersion: string;
  routingMetadata: Record<string, unknown>;
};

type DispatchRef = {
  jobId: string;
  attemptId?: string;
  adapter: string;
  referenceNamespace: string;
  dispatchId: string;
  dedupeKey: string;
  providerJobId?: string;
  queueJobId?: string;
  celeryTaskId?: string;
  workflowInstanceId?: string;
  containerInstanceId?: string;
};

interface JobTransportAdapter {
  readonly name: string;
  supports(input: { jobType: string; executionClass: string; contractVersion: string }): boolean;
  publish(request: DispatchRequest): Promise<DispatchRef>;
  inspect(reference: DispatchRef): Promise<"unknown" | "published" | "consumed" | "failed">;
  cancel?(reference: DispatchRef): Promise<void>;
}

interface JobReporter {
  heartbeat(lease: LeaseContext): Promise<void>;
  progress(lease: LeaseContext, input: ProgressUpdate): Promise<void>;
  waitForExternal(lease: LeaseContext, input: ExternalWait): Promise<void>;
  complete(lease: LeaseContext, result: JobResult): Promise<void>;
  fail(lease: LeaseContext, error: ClassifiedJobError): Promise<void>;
  assertActive(lease: LeaseContext): Promise<void>;
}

type LeaseContext = {
  jobId: string;
  attemptId: string;
  leaseToken: string;
  fencingVersion: number;
  expiresAt: string;
};
```

The Python boundary exposes the same logical operations. Python business services must not call `.delay()`, `.apply_async()`, or `send_task()` directly. They call a Python `JobDispatcher`/`JobReporter` port or receive a canonical `job_id` from a thin task wrapper.

The concrete transport is selected by server-side routing policy from job type, execution class, capability requirements, tenant policy, and rollout flag. Business services do not import BullMQ, Celery, Redis, Cloudflare bindings, or container APIs.

`create()` canonicalizes server-owned fields and derives a definition hash before opening the transaction. Concurrent creates with the same tenant-scoped idempotency key race on the database uniqueness constraint: the winner creates exactly one `worker_jobs` row and one outbox intent; the loser reloads and returns that row only when the definition hash matches, otherwise it returns `IDEMPOTENCY_CONFLICT`. Client-supplied tenant, actor, adapter, and routing fields are not part of the trusted identity calculation unless validated from the authenticated request.

The definition hash is a server-derived cryptographic digest of a deterministic canonical form: authenticated tenant, contract version, job type, execution class, normalized input, schedule definition, retry policy, timeout policy, and required capabilities. Object-key ordering, omitted optional defaults, numeric representation, and Unicode normalization must be specified so equivalent requests hash alike; the idempotency key itself and server-generated IDs/timestamps do not participate. Persist `definitionHash` on `worker_jobs` (or in a uniquely linked immutable record) before the create response so conflict checks do not depend on reconstructing mutable legacy payloads.

### Executor contract

```text
transport message { job_id }
        │
        ▼
controlPlane.claim(job_id, runner)
        │ guarded lease acquisition
        ▼
JobExecutor.execute(job context)
        │
        ├─ reporter.heartbeat(lease)
        ├─ reporter.progress(lease, ...)
        ├─ domain service / provider call
        └─ reporter.complete(lease, ...) or reporter.fail(lease, ...)
```

An executor wrapper may deserialize the transport envelope and establish runtime context. It must not own business workflow, billing, provider polling policy, notification policy, or terminal status decisions. Existing domain services can be extracted behind the executor boundary without changing their domain semantics.

CPU-heavy and long-running work such as FFmpeg, Remotion, large JSON transforms, compression, video analysis, and audio separation must not execute on a Node event loop that is responsible for renewing transport locks. Route it to Python, Worker App, a dedicated process, or a container according to capability policy.

## Persistence model

### `worker_jobs` extensions

Extend the existing table only where the field is part of canonical current state. Exact SQL names and nullability are implementation-plan decisions after call-site and migration inspection, but the logical model must cover:

| Logical field | Persistence rule |
|---|---|
| `id` | Existing primary key; canonical job ID. Never replace with a provider ID. |
| `tenantId`, actor fields | Server-derived ownership and audit scope. |
| `jobType`, `executionClass`, `priority` | Allowlisted routing inputs; not arbitrary executable code. |
| `contractVersion` | Persisted immutable envelope/schema contract version; retries, recovery, and adapters reuse the canonical row's version rather than hard-coding a transport version. |
| `definitionHash` | Immutable server-derived digest of the canonical create definition; persisted before the create response and used for idempotency-conflict checks. |
| `status` | Single canonical materialized state with compatibility projection for legacy values. |
| `attempt`, `maxAttempts`, `nextRetryAt` | Business-level retry state; incremented only by guarded control-plane transitions. |
| `timeoutPolicyJson` | Persisted soft/hard timeout policy; soft timeout is a cooperative request signal and hard timeout is an enforced execution bound. `timeoutSeconds` remains a legacy compatibility projection. |
| `idempotencyKey` | Tenant-scoped unique key where supplied; duplicate create returns the existing job reference. |
| `leaseOwnerToken`, `leaseExpiresAt`, `heartbeatAt` | Current application lease. Store only a non-replayable token representation if raw token storage is not required by an existing protocol. |
| `runnerId`/worker binding | Current execution owner; use existing worker binding where it is authoritative and add an ephemeral runner identity only if required. |
| `scheduledAt`, `startedAt`, `finishedAt` | Lifecycle timestamps; all timestamps are UTC with server time. |
| `errorCode`, `errorMessage` | Last classified error, redacted for secrets and bounded in size. Existing `statusReason`/`failureReason` may provide this projection only when the API exposes a stable safe code/message mapping; otherwise add dedicated canonical fields. |
| `operatorReviewRequired`, `operatorReviewReason` | Explicit review gate and bounded reason for ambiguous/unknown recovery, transfer pause, poison outbox, or other fail-closed conditions; a review flag never authorizes automatic dispatch. |
| `progressJson` | Current progress projection: percent, stage, message, and optional measured metadata. |
| `payloadRef`, `resultRef` | References to managed storage or domain rows for large payload/result data; do not persist expiring URLs as canonical data. A committed result reference is immutable for that attempt/job except through an explicit redaction/compliance workflow. |
| schedule identity | `scheduleId` plus `occurrenceKey`, either on the row or through a unique companion mapping, must be sufficient to deduplicate scheduled creation. |

Existing `inputJson`, `instructionsJson`, `outputJson`, `retryPolicyJson`, and timeout fields remain compatible during migration. Sensitive credentials, signed URLs with unnecessary lifetime, and arbitrary shell/code expressions must not be placed in durable job payloads.

### `worker_job_events`

Events are append-only, tenant-scoped through the parent job, and ordered by a server-assigned monotonic per-job event sequence plus creation timestamp. The existing assignment sequence is a separate compatibility key and must not be assumed to provide total lifecycle ordering. Event writes must be idempotent using a stable event key such as `(workerJobId, attemptId, eventKey)` or the existing assignment/sequence contract. State-transition events are never sampled. `HEARTBEAT` and high-frequency `PROGRESS` events use a documented per-class sampling/coalescing policy while the latest value remains on `worker_jobs`; raw high-volume telemetry belongs outside the lifecycle ledger.

The logical event record therefore includes `eventSequence` (monotonic within `workerJobId`) and an idempotency key/event key in addition to the existing event type, attempt, payload, and timestamp. Event sequence allocation is performed under the canonical job row lock (or an equivalent serializable allocator) in the same transaction as the guarded state change; a timestamp or application-process counter is not sufficient. If the existing `sequence` column cannot serve both assignment ordering and lifecycle ordering without ambiguity, add a separately named field rather than overloading it.

The initial event vocabulary is:

```text
CREATED
QUEUED
DISPATCH_REQUESTED
DISPATCH_ATTEMPTED
DISPATCHED
DISPATCH_FAILED
LEASE_ACQUIRED
STARTED
HEARTBEAT
PROGRESS
WAITING_EXTERNAL
TIMEOUT
OPERATOR_ACTION
RETRY_SCHEDULED
LEASE_EXPIRED
RECOVERED
FAILED
COMPLETED
CANCEL_REQUESTED
CANCELLED
EXPIRED
CALLBACK_ACCEPTED
CALLBACK_REJECTED
SETTLEMENT_RECORDED
PROJECTION_REPAIRED
```

Event payloads must include only bounded structured data: actor/source, attempt ID, adapter name, external reference, stage, safe error code, and measured values. Raw provider responses, secrets, access tokens, arbitrary user prompt text, and unbounded logs belong in redacted logs or managed artifacts with a reference.

### Companion metadata tables

Companion tables are allowed only for one-to-many history or publication coordination that cannot safely fit on the current row. They are not alternative job sources of truth:

- `worker_job_attempts`: one record per control-plane attempt, linked to `worker_jobs.id`; logically includes immutable `attemptId`, business `attempt` number, `leaseGeneration`, start/finish timestamps, runner, lease snapshot, terminal classification, and recovery reason.
- `worker_job_dispatches`: one record per transport publication/republication; logically includes immutable `dispatchId`/`dedupeKey`, adapter name, `referenceNamespace`, dispatch kind, canonical job ID, attempt ID, the external reference (`provider_job_id`/`queue_job_id`/`celery_task_id`/future reference), publication status, and timestamps.
- Legacy task identifiers may be stored in the same dispatch-reference record with an explicit `legacy` reference type and source; they are never promoted to canonical identity without a verified one-to-one binding.
- `worker_job_outbox`: transactional publication intent linked to the canonical job and event/attempt; stores a versioned envelope, dedupe key, publish attempts, and `publishedAt`/failure metadata.
- `worker_job_outbox` also stores `nextAttemptAt`, publisher lease/fencing metadata, and a quarantine/operator-review reason so one lost or poison publisher cannot block the queue.
- `worker_job_outbox.cancelledAt` (or an equivalent immutable cancellation marker) prevents unpublished intent from being republished after a guarded cancellation; published dispatch references remain retained for reconciliation.
- `worker_job_settlements`: one durable settlement/projection marker per idempotency key for result publication, billing/credit guards, notification, webhook, or other domain completion that cannot share the lifecycle transaction. It is evidence/coordination metadata, not an independent job state.
- `worker_job_actions`: one durable record per operator/API mutation idempotency key, storing actor, reason, expected state/attempt/fencing target, authorization scope, effective outcome, and safe error. A unique constraint makes a repeated action return the original outcome and prevents a second effective mutation.
- `worker_job_callbacks`: one durable inbound-callback/replay record keyed by adapter namespace plus authenticated provider event ID. When a provider supplies no stable event ID, the adapter must use a documented bounded replay key; if it cannot prove replay identity, the callback may request read-only inspection but may not mutate canonical state.
- Transfer plan/preview/item/checkpoint companions, when required by the transfer domain, persist the immutable preview fingerprint, deterministic item keys, handler/policy versions, dispositions, and resumable results linked to the canonical `tenant_data_transfer` job. They must not own status, retry, lease, result identity, or create identity.
- A schedule-occurrence companion mapping may be used when existing schedule tables cannot safely own `scheduleId` plus `occurrenceKey`; it must have a unique constraint and point back to `worker_jobs.id`.

No companion table may define its own independent job status, retry counter, lease, result, or idempotency identity.

`DispatchRef` is a reference envelope, not a status record: it must identify the adapter namespace and stable dispatch dedupe key, and may contain only provider/transport IDs needed for reconciliation. `publish()` is idempotent for that dedupe key and returns the existing reference when the publication already exists. `inspect()` is read-only and must distinguish not-found/unknown from published, consumed, and failed observations; an observation never mutates canonical state without a guarded control-plane command.

### Constraints, indexes, and retention

The implementation plan must define database-level protection for the invariants rather than relying only on service code:

- tenant-scoped idempotency is unique for non-null keys; keys have bounded length and a documented normalization rule; a null key does not collapse unrelated jobs; the canonicalized definition hash is stored or derivable so reuse of a key with different meaning returns an explicit `IDEMPOTENCY_CONFLICT`;
- attempt number is unique per canonical job, and a dispatch/outbox dedupe key is unique for the publication being protected;
- `eventSequence` is unique per canonical job, and schedule occurrence uniqueness is scoped by tenant plus `scheduleId` plus `occurrenceKey`;
- a provider/external reference is unique within its adapter/reference namespace where the provider contract permits it, preventing one external task from binding to two canonical jobs;
- event idempotency keys prevent duplicate lifecycle events while allowing legitimate repeated `HEARTBEAT`/`PROGRESS` events under their bounded sequence policy;
- foreign keys from attempts, dispatches, outbox rows, settlements, actions, callbacks, schedule occurrences, and transfer plan/item/checkpoint records point to `worker_jobs.id` with deletion behavior chosen to preserve audit history. A pre-existing cascade must not silently erase lifecycle or settlement evidence; parent deletion is blocked or preceded by verified immutable archival/redaction under the retention and privacy policy;
- query paths have indexes for tenant/status/priority, due retries, unexpired/expired leases, unpublished outbox rows, job timeline reads, and external-reference reconciliation;
- terminal job/event retention, archival, and partitioning are explicit operational policies. Retention must not silently delete evidence needed for billing settlement, audit, incident recovery, or the configured rollback window.
- tenant deletion/export and privacy workflows define how job payloads, events, dispatch references, and managed artifacts are redacted, retained, or deleted without breaking the minimum audit/settlement obligations; a provider ID is not a reason to retain secret material.

The exact index names and migration order belong in the implementation plan, but omission of these constraints is not acceptable as an implementation shortcut.

The initial business attempt is numbered `1`. A new business retry increments `attempt` exactly once in the guarded control-plane transition; broker redelivery, provider polling, adapter retry, and worker heartbeat do not increment it. `worker_job_attempts.attemptId` identifies that attempt, while a lease/fencing generation identifies the current holder of the attempt. This distinction is required so a duplicate delivery of the same attempt cannot consume another retry budget.

## State machine and ownership

```text
pending ──create/commit──> queued
queued ──outbox publish──> queued + DISPATCHED
queued ──claim──> leased ──start──> running
running ──external wait──> waiting_external ──resume──> running
running ──success──> succeeded
running ──retryable error──> retry_scheduled ──due──> queued
running ──permanent error──> failed
running ──lease timeout──> [LEASE_EXPIRED event] ──recover──> retry_scheduled | failed | expired
pending/queued/leased/running/waiting_external/retry_scheduled ──CANCEL_REQUESTED + cancel──> cancelled
pending/queued/running/waiting_external/retry_scheduled ──deadline──> expired
```

For a transfer operation paused by a recoverable system/database/transport error, the operation projection is `paused_on_error` while the canonical job remains `retry_scheduled` with `operatorReviewRequired`; due-retry reconciliation must not dispatch it until an authorized idempotent resume command clears the review gate. This is a transfer-specific recovery projection and does not add a second canonical status column.

An `unknown` or ambiguous failure is normally materialized as `failed` with
`operatorReviewRequired = true`; it is not automatically retried. An explicitly
authorized, idempotent operator-resolution action may, after inspecting durable
side-effect/provider evidence, record `succeeded`, `expired`, or a guarded
`retry_scheduled` recovery on the same canonical job. This is the only exception
to ordinary terminal-failure reopening, is audited with the evidence and target
attempt, and must not create a replacement job or reuse an unresolved provider
operation with a new idempotency key.

Only the arrows shown, the explicit unknown-resolution exception above, plus idempotent repeats of an already-applied command, are legal. Attempts to complete a cancelled/expired/failed job, claim a terminal job, heartbeat an unleased job, or retry a succeeded job return a stable domain error such as `JOB_STATE_CONFLICT` and append no misleading success event. A terminal job may be reprocessed only through an explicitly authorized new business request that creates a new canonical job, except for the evidence-backed unknown-resolution exception; ordinary `retry` always means another attempt on the existing canonical job and never an implicit clone.

The `retry`/`requeue` operator actions are state-specific: they may request a due or recoverable non-terminal attempt and preserve the same canonical ID, but they cannot reopen `succeeded`, `cancelled`, `expired`, or terminal `failed` jobs. Reprocessing a terminal job is a new business request with a new `worker_jobs.id`, an explicit causal reference to the original, and its own idempotency key. This keeps the admin action list from implying that a terminal row can be mutated back into execution.

Every transition is a guarded transaction:

1. Load the current row and verify tenant/job ownership.
2. Acquire a row lock or compare-and-swap guard and verify the expected state, attempt, lease token, and fencing version where applicable.
3. Update `worker_jobs` current state and increment the fencing version on lease replacement.
4. Append the corresponding `worker_job_events` row with an idempotency key.
5. Create any outbox intent needed for the next dispatch.

Stale workers cannot heartbeat, complete, fail, publish a result, or mutate a domain side effect after their lease/fencing version has been replaced. A late callback may append a diagnostic event but cannot overwrite a newer terminal/current state. The implementation must prove this with concurrent transition tests, not only sequential unit tests.

### Lease and heartbeat

`status = running` is never sufficient to prove liveness. A successful claim creates an attempt ID, lease token, owner identity, fencing version, expiry, and heartbeat timestamp. The worker heartbeats at a bounded interval shorter than the lease duration. Heartbeat updates are guarded by job ID, attempt ID, lease token, and fencing version. Lease renewal uses PostgreSQL/server time, has a maximum extension/deadline from the job policy, and cannot extend a job beyond its hard deadline merely because heartbeats continue.

The reconciler identifies `running`/`waiting_external` rows whose lease has expired. It must:

- append `LEASE_EXPIRED` with the prior owner and attempt;
- verify that no newer lease or terminal transition won the race;
- classify the recovery as retryable or terminal using the central policy;
- schedule a bounded retry through the outbox, or mark `failed`/`expired`;
- never blindly submit a provider operation again when an idempotency/provider status check can establish that the original operation succeeded.

The lease interval, heartbeat interval, external-provider deadline, and reconciler cadence are per execution class and configuration-controlled. They must be measured in tests and not hard-coded from a single workload. A provider operation key must be persisted before the first external submission, and any returned provider reference must be persisted before the executor reports durable progress. If provider status cannot be checked after an ambiguous failure, recovery fails closed for operator review rather than guessing that the operation was lost.

The provider operation key is deterministically derived from the canonical job, business attempt, and logical operation (or is an explicitly persisted equivalent accepted by the provider). A retry must reuse that key when it represents the same external operation; it must not generate a fresh random key that defeats duplicate detection. `worker_job_events` records the safe operation/reference metadata needed to prove which side effect was attempted.

## Retry, timeout, and idempotency policy

### Two retry layers

| Layer | Owner | Purpose | Must not decide |
|---|---|---|---|
| Transport retry | BullMQ/Celery/Cloudflare adapter | Redeliver a message when delivery/consumer execution fails transiently. | Business attempt count, billing, provider re-submission, terminal job state. |
| Business retry | Job Control Plane | Decide whether the canonical job gets another attempt, when, and with which policy. | Transport-specific lock/ack details. |

The transport envelope contains only the canonical `job_id`, contract version, attempt/dispatch reference, and bounded routing metadata. It does not copy a mutable status snapshot that could become authoritative by accident. The consumer treats `job_id` and the server-loaded row as authoritative; any tenant, actor, job type, priority, capability, or adapter value arriving in the message is advisory at most and must be checked against PostgreSQL before claim.

Errors are classified before retry:

- **Retryable:** timeout, connection reset, provider 429, provider 5xx, temporary unavailable, lease loss before a durable side-effect marker, or transient storage failure.
- **Permanent:** invalid input, unsupported format, permission denial, insufficient credit, invalid credential, provider 400, policy rejection, or deterministic contract mismatch.
- **Unknown:** fail closed to `failed` with a safe `unknown_error` code and an explicit `operatorReviewRequired` marker, unless an approved job class defines a separate review state; never retry forever by default.

Backoff is bounded and persisted as `nextRetryAt`. A retry policy must declare `maxAttempts`, base/max delay, jitter policy, absolute deadline, timeout class, and allowed error classes. The delay calculation must be deterministic for a given job/attempt or use bounded server-side jitter that is recorded for audit. A retry is a new attempt on the same canonical job, not a new canonical job and not an unbounded adapter retry loop.

Soft and hard timeouts have distinct behavior. A soft timeout requests cooperative cancellation and records a timeout event; a hard timeout terminates/reclaims the execution according to runtime capability and lets the control plane classify retry versus failure. Provider polling has its own deadline and must transition to `waiting_external` rather than holding a worker lease indefinitely when the workload supports asynchronous completion. `waiting_external` persists the provider operation key/reference and releases the active execution lease; a later callback or poll creates a dispatch signal and must reacquire a fenced lease before changing progress or terminal state. Returning from external wait does not increment the business attempt unless the central retry policy explicitly did so.

Idempotency is required before any side effect involving credits, payments, provider generation, email, notifications, revenue sharing, webhooks, artifact publication, or schedule creation. A duplicate canonical create returns the existing `worker_jobs.id`; a duplicate execution returns the existing result or resumes from a durable side-effect marker.

## Transactional outbox and reconciliation

Job creation and publication intent are committed together:

```text
BEGIN
  insert worker_jobs (canonical id, payload, policy, idempotency key)
  insert worker_job_events (CREATED)
  insert worker_job_outbox (DISPATCH_REQUESTED)
COMMIT

outbox publisher
  ├─ claim one outbox row and persist DISPATCH_ATTEMPTED
  ├─ publish { job_id, business_attempt [, attempt_id] } with stable dedupeKey
  ├─ persist worker_job_dispatches reference + DISPATCHED
  └─ mark outbox published
```

The publisher must not assume that a remote publish and a PostgreSQL update are one transaction. If the process crashes after publish but before the local reference is committed, the same outbox row and dedupe key are retried; the adapter must return the existing publication or a queryable equivalent. If an adapter cannot provide this idempotency boundary, the outbox row enters operator review and is not blindly republished when the message could trigger a paid or irreversible side effect. PostgreSQL still contains the intent in every failure case, and no failure path creates a second canonical job.

The initial outbox envelope carries `jobId`, `businessAttempt: 1`, and no `attemptId`; the guarded consumer claim creates the immutable `attemptId` and lease generation. A retry outbox is created only after the control-plane transition has incremented the business attempt and created its attempt record, so it carries both values. This prevents publication timing from creating phantom attempts while retaining a stable transport dedupe boundary.

Outbox publication uses a short-lived publisher lease/claim separate from the execution lease. The claim is guarded by `outboxId`, `dedupeKey`, and a publisher fencing token, has a `nextAttemptAt` and bounded publish-attempt count, and can be reclaimed after publisher loss. A successful adapter call is not acknowledged locally until the dispatch reference and event are durably written. Poison outbox rows are quarantined with an operator-visible reason and do not block unrelated rows.

The central `job-reconciler` runs every 1–5 minutes, subject to capacity and deployment policy. It checks at least:

- expired leases for `running`/`waiting_external` jobs;
- `queued` jobs whose outbox is unpublished or whose dispatch reference is missing;
- stale `retry_scheduled` jobs whose `nextRetryAt` is due;
- external waits beyond provider timeout, using provider status/idempotency before deciding recovery;
- running jobs past their persisted soft timeout, recording one idempotent cooperative `TIMEOUT` request while leaving the worker lease available for graceful shutdown;
- outbox rows with repeated failures and dispatches with no acknowledged execution evidence;
- duplicate schedule occurrences and terminal jobs with unresolved settlement/notification work.

Reconciliation is itself idempotent, bounded per tick, tenant-aware, and observable. It must not scan or mutate arbitrary domain rows without an explicit job binding.

### Failure-mode contract

| Failure | Canonical behavior | Forbidden behavior |
|---|---|---|
| PostgreSQL unavailable before create commit | Return failure; no transport publish is attempted. | Publishing a job that has no canonical row. |
| PostgreSQL unavailable after create commit | Leave outbox intent durable; retry publication later. | Reporting success because the broker accepted a message. |
| Broker/Redis unavailable | Keep `worker_jobs` queued/retry-scheduled and alert on outbox age. | Marking the job failed solely because transport is down. |
| Worker/process/container lost | Let lease expire, fence the attempt, inspect side-effect evidence, then retry or fail centrally. | Reusing the old lease or blindly duplicating an ambiguous provider call. |
| Provider result is ambiguous | Query by provider operation key/reference or move to operator review. | Assuming timeout means provider cancellation. |
| Domain projection write fails after execution | Keep a durable result/settlement marker and reconcile the projection. | Charging/publishing twice or marking success with no recoverable result. |
| Poison/unsupported contract message | Reject before claim, record safe failure, and route to operator review/DLQ policy. | Infinite redelivery or destructive message deletion without evidence. |
| Database serialization/deadlock during a transition | Retry the database transaction a bounded number of times using the same event/action idempotency key. | Repeating the external side effect or appending duplicate lifecycle events. |

Cancellation is also two-phase when transport cancellation is not guaranteed: the control plane first records `CANCEL_REQUESTED` and fences the current attempt, then asks the adapter to cancel if supported. The executor must observe the fence before committing a result. The canonical row becomes `CANCELLED` only through a guarded transition; a transport-level cancel failure is visible and does not erase the cancellation request or event history.

## Adapter specifications

### BullMQ adapter

- Accepts only a canonical `job_id` envelope and versioned routing metadata.
- Uses a BullMQ/Redis job ID as a transport reference, never as `worker_jobs.id`.
- Records the BullMQ ID in `worker_job_dispatches` and relevant events.
- Does not write business completion/failure state from BullMQ events alone; the executor reports through the control plane.
- Moves CPU-heavy work out of the Node event loop. Lock tuning is a bounded mitigation, not the primary stuck-job fix.
- Transport-level stalled/retry events produce observations and reconciliation signals, not independent business attempts.

### Celery adapter

- Publishes a task containing the canonical `job_id`, not a copied business payload that can diverge from PostgreSQL.
- The Celery task is a thin wrapper: load context, claim/renew lease, call `JobExecutor`, report outcome.
- Existing `.delay()`/`.apply_async()` call sites migrate behind the adapter in bounded queue-family waves.
- `acks_late`, prefetch, reject-on-worker-lost, soft/hard time limits, and queue routing remain transport/runtime controls. Their values must be class-specific where global values would be unsafe.
- `task.retry()` may be used only as a bounded transport safeguard and must not increment the canonical business attempt without a control-plane transition.
- A worker-lost or time-limit signal is reported as a classified control-plane event; the reconciler owns the final retry/fail decision.

### Celery Beat / scheduler adapter

- Beat performs scheduling only: it creates a job intent for the due occurrence.
- Beat does not execute cleanup, billing settlement, workflow processing, provider polling, or other business logic inline.
- Every scheduled trigger supplies `scheduleId` and deterministic `occurrenceKey`, for example `cleanup:2026-09-13` or `billing:settlement:tenant123:2026-09`.
- Every schedule declares its canonical timezone, schedule version, and missed-occurrence policy (`skip`, `coalesce`, or bounded `catch_up`). The occurrence key is generated from that schedule definition using database/server time, not an adapter host clock.
- The control plane validates that `scheduleId`, schedule version, timezone, and occurrence window agree with the stored schedule definition; a caller-supplied occurrence key cannot select another tenant or schedule definition. A unique constraint makes duplicate Beat/Cron delivery return the existing canonical job, while a same-occurrence definition mismatch returns `IDEMPOTENCY_CONFLICT`.
- The same scheduler port can later be implemented by Cloudflare Cron or another scheduler without changing the scheduled domain service.

### Future Cloudflare adapters

The Cloudflare boundary is intentionally capability-based and must be verified against the deployment account/plan during implementation:

- **Cloudflare Queues Adapter:** single-step/asynchronous message transport; maps the canonical job ID into a message and relies on control-plane idempotency for duplicate delivery.
- **Cloudflare Workflows Adapter:** durable multi-step orchestration for jobs whose workflow needs persisted step boundaries, waiting, approvals, or long-lived coordination. Workflow instance IDs remain references attached to the canonical job.
- **Cloudflare Containers Adapter:** execution for CPU/memory/filesystem-heavy workloads that do not belong in a Worker event loop. Container instance identity and lifecycle signals remain execution metadata.
- **Cloudflare Cron Scheduler Adapter:** creates scheduled job intents with the same occurrence dedupe contract as Celery Beat.
- **Worker App Adapter:** dispatches to a registered Worker App/runtime using existing worker capability and artifact contracts; it does not create a second job ledger.

### Cloudflare PostgreSQL connectivity boundary

When a Cloudflare adapter is enabled, its control-plane connectivity must use a
dedicated Hyperdrive configuration and binding for the existing PostgreSQL
source of truth. Hyperdrive is only a connection/pooling/query gateway; it is
not a replacement database, a D1 ledger, a cache-authoritative state store, or
a reason to create a second `worker_jobs` table. The environment-specific
Hyperdrive configuration, binding name (for example `HYPERDRIVE`), database
firewall/ACL, TLS, and origin target are deployment configuration and must not
be committed to source control or copied into `.env`.

Canonical lifecycle writes and fresh reads of `worker_jobs`,
`worker_job_events`, attempts, dispatches, outbox rows, and settlement markers
must use a supported PostgreSQL driver through that binding. Reads that decide
lease, fencing, status, outbox publication, or terminal recovery must bypass
or disable query caching where necessary so a cached result cannot become
canonical truth. Database transactions remain short and bounded: never hold a
transaction or Hyperdrive origin connection across provider calls, external
waits, or transport publication. Pool capacity, query duration, transaction
duration, and regional latency are per-environment rollout budgets.

If Hyperdrive or PostgreSQL is unavailable, a Cloudflare consumer must not
acknowledge a message or report completion without a durable control-plane
write; it follows bounded redelivery or operator-visible quarantine according
to the job class. A new Hyperdrive configuration/binding, connectivity proof,
cache behavior proof, pool-capacity proof, and rollback evidence are explicit
Cloudflare deployment gates. Local mocks and health checks do not satisfy
these gates.

The future adapter may use provider-native retries and durable steps, but it must still report canonical lease, progress, result, and terminal state to PostgreSQL. A provider-native workflow that cannot safely reconcile with `worker_jobs` is not an accepted migration target.

Provider-native workflow/step retries are transport or orchestration retries, not new business attempts. Their idempotency key must include the canonical job ID, business attempt, logical step key, and contract version; a step completion marker is persisted before the workflow acknowledges that step. A workflow pause/resume or replay must therefore converge on the same step result and cannot rerun a paid side effect with a fresh key.

Cloudflare-specific bindings, database connectivity, regional latency, execution limits, secrets, queue consumer configuration, workflow step limits, and container lifecycle behavior are deployment concerns that must be validated in the target account. The adapter contract must define what happens when PostgreSQL is temporarily unreachable: do not acknowledge/complete a message as successful without a durable control-plane write; use bounded redelivery or operator-visible failure according to the job class. Provider-native state must be mapped to canonical events and references without allowing a provider callback to bypass lease fencing.

Callbacks and webhooks from an external provider must pass the provider's authenticated signature/credential check, use replay protection where supported, and correlate to the stored operation/reference and canonical tenant before they can request reconciliation. An unauthenticated or cross-tenant callback is recorded as a bounded security observation and cannot claim, complete, cancel, or alter a job.

## Progress and result reporting

Progress is control-plane data, not a BullMQ `updateProgress()` value or Celery result-backend value:

```json
{
  "progress": 45,
  "stage": "video_generation",
  "message": "Waiting for provider",
  "measured": { "providerPollCount": 3 }
}
```

Progress updates are bounded, rate-limited, tenant-scoped, and guarded by the complete `LeaseContext`. `progress` is constrained to 0–100, stage names and stage order are allowlisted per job type, and an update from an older attempt cannot move progress backward or overwrite a newer attempt. Within one stage, progress is monotonic unless an explicit stage reset event is recorded; a stage transition may reset its local percentage but cannot regress the overall completed stage sequence. The latest value is materialized on `worker_jobs`; important transitions append `PROGRESS` events. Results reference verified managed artifacts or domain rows and are committed atomically with `COMPLETED` whenever the domain transaction allows it. When the domain transaction is separate, a durable result/settlement marker must be committed before the guarded terminal transition so reconciliation can safely finish either side.

## Admin and observability requirements

The Job Control Plane must expose an admin/operator view before broad adapter migration. At minimum it supports:

- counts for queued, leased/running, waiting external, retry scheduled, failed, stale, and terminal-unsettled jobs;
- canonical job ID, tenant/actor scope, job type, execution class, current adapter, attempt/max attempts, runner, heartbeat, lease expiry, and safe error;
- cursor-paginated job search/filtering by tenant, status, type, adapter, execution class, stale state, and created-time window;
- a paginated chronological event timeline with a bounded time/row window and dispatch references/recovery decisions;
- safe actions for retry, cancel, requeue, force-fail, and inspect redacted payload/error, each authorized and audited;
- operator actions require an actor, reason, target attempt/state, and idempotency key; repeated action requests return the original outcome and append at most one effective `OPERATOR_ACTION` event;
- explicit distinction between PostgreSQL state and transport observations;
- links to runbooks and correlation IDs without exposing secrets or signed URLs.

Required metrics/log fields include canonical `jobId`, attempt ID, tenant ID, job type, adapter, queue, runner, status transition, latency, retry reason, lease age, outbox age, and provider reference. Alerts are based on stale canonical rows/outbox age and recovery SLOs, not queue length alone.

Operational policies must also define per-class admission limits: maximum payload/result size, maximum concurrent jobs per tenant and execution class, maximum reconciler work per tick, outbox age SLO, heartbeat freshness SLO, and maximum event/progress write rate. When capacity is exhausted, creation or dispatch returns a truthful backpressure result and leaves the canonical job recoverable; it must not create an unbounded broker backlog or consume paid work speculatively.

## Security and data safety

- Every control-plane read/write verifies tenant ownership and actor authorization before loading or mutating a job.
- Admin actions require the existing admin authorization boundary, are audited, and use guarded transitions; “force fail” cannot delete history or silently settle billing.
- Control-plane and admin mutation endpoints use the existing authentication, authorization, CSRF/rate-limit, and audit boundaries; retrying a request is safe only through its action idempotency key.
- Tenant-scoped operators can access only their tenant's jobs; platform operators require the existing elevated scope for cross-tenant views/actions, and every cross-tenant result is filtered and audited rather than inferred from a client-supplied tenant ID.
- Lease tokens are unguessable, scoped to a job/attempt, rotated on reacquisition, and never logged. Prefer hashing at rest when raw comparison is not required.
- Payload/result inspection is redacted and bounded. Never display provider credentials, Redis URLs, database URLs, signed storage URLs, or arbitrary command strings.
- Job type, execution class, capability requirements, and adapter selection are allowlisted server-side. User input cannot select a backend binding or execute shell/Python code.
- Payloads, event data, progress messages, provider responses, and result metadata have explicit size/depth limits and are validated before persistence. Large data uses managed storage references with ownership checks.
- Credit/payment/provider side effects require an idempotency key and durable settlement marker. A retry must preserve authored creative state and must not silently regenerate or consume credits again.
- Cross-tenant reconciliation, dispatch, and admin queries fail closed. Background system jobs use an explicit system tenant/actor representation rather than a fake user.

## Completeness closure requirements

The following requirements close the remaining implementation ambiguity. They
are part of Feature 186 acceptance, not optional documentation or future
convenience work.

### Server context and command idempotency

The public create/dispatch/report APIs must accept an authenticated server
context rather than trusting `tenantId`, actor, adapter, routing, or billing
fields from a transport payload. The internal context includes tenant scope,
actor type/ID, authorization scope, correlation ID, and request/action
idempotency key. System jobs use an explicit system actor and tenant policy.

Every mutating operator/API command has a durable action record before its
response is returned. The action records the expected status, attempt,
fencing version, and authorization decision. A retried request with the same
action key returns the original result; a reused key with a different command
or target returns `IDEMPOTENCY_CONFLICT`.

### Ambiguous publication and inbound callbacks

Each adapter must define how a publish is deduplicated when the process loses
the response after the remote side effect. BullMQ/Celery task IDs and any
provider message ID used for this purpose must be deterministically derived
from the outbox/dispatch dedupe key where the transport permits it. An adapter
without a queryable or deterministic publication boundary must quarantine the
outbox item for operator resolution rather than blind republish.

Inbound callbacks are accepted only after signature/key validation, tenant and
stored-operation correlation, timestamp/replay-window checks, and durable
callback-idempotency insertion. Duplicate callbacks return the original
disposition. Callback records may request reconciliation, but only a guarded
lease-bearing control-plane command may change progress, settlement, or
terminal state. Invalid, cross-tenant, or replayed callbacks are bounded
security observations and cannot claim or complete a job.

### Transaction, ordering, and recovery semantics

The implementation must document the PostgreSQL isolation level, row-lock or
compare-and-swap predicate, event-sequence allocator, and bounded transaction
retry policy for every state-changing command. No transaction may span a
provider call, transport publish, external wait, or callback network request.
After a serialization/deadlock retry, the same command/action/event key is
reused and no external side effect is repeated automatically.

If a result, billing, notification, webhook, artifact, or domain projection
cannot commit with the lifecycle transition, its settlement marker must state
the effect type, idempotency key, canonical job/attempt, result digest or
managed reference, and current reconciliation disposition. A terminal job is
not reported as fully settled until all required markers are durably resolved
or explicitly placed in operator review.

### API and observability contract

Status APIs must expose canonical status, compatibility status, attempt,
lease/stale information, operator-review state, and transport observations as
separate fields. They must not expose raw lease tokens, credentials, signed
URLs, unrestricted payloads, or provider responses. Cursor pagination uses a
validated signed cursor and a stable `(createdAt, id)` ordering; page limits,
filter limits, and event time/row windows are server-enforced.

Metrics and logs must use bounded/cardinality-safe labels and must distinguish
canonical transitions from broker/provider observations. Required dashboards
must show recovery latency, outbox age, settlement age, stale lease age,
callback rejection, quarantine, and per-tenant admission/backpressure. Alert
thresholds and owners are recorded per execution class before enabling it.

### Capacity, time, and disaster recovery

The rollout manifest must contain numeric per-class budgets for payload/result
size, concurrent jobs per tenant and class, publisher/reconciler work per tick,
heartbeat freshness, lease duration, provider deadline, outbox age, event rate,
and database transaction/query duration. Admission control must reject or
defer work truthfully before provider/credit side effects when a budget is
exhausted.

Backup/PITR, restore, archival, and region/database failover procedures must
preserve the canonical job/event/settlement ordering and provider idempotency
evidence. A restore rehearsal must prove that replaying outbox, callback, or
reconciler work does not duplicate a paid/provider/artifact side effect.

### Migration ownership and completion proof

The call-site inventory must separately track producers, consumers, status
readers/writers, result pollers, callbacks, and domain projections. Each wave
has one named owner, one active side-effecting producer, a legacy drain rule,
an enable flag, a canary sample, rollback criteria, and evidence links.

Feature 186 is not considered production-complete while any discovered
side-effecting producer is outside an approved compatibility allowlist, while
tenant transfer remains exposed without registered handlers and its own
checkpoint tests, or while a Cloudflare adapter lacks target-account
connectivity, capability, rollback, and recovery evidence. Local mocks,
structural migration checks, and health endpoints are necessary but do not
substitute for these gates.

## Migration strategy

Migration is adapter-by-adapter and reversible at each queue-family boundary.

### Phase 0 — inventory and compatibility contract

- Inventory direct BullMQ `.add()`, worker processors, Celery `.delay()`/`.apply_async()`/`send_task()`, Beat entries, queue monitors, task result polling, provider callbacks, billing settlement, notifications, and existing worker-job bindings.
- Map each call site to a domain job type, execution class, owner, side effects, timeout, retry behavior, and existing ID.
- Identify which current tasks can bind to `worker_jobs` immediately and which require a compatibility wrapper.
- Define how in-flight legacy tasks are observed, linked to a canonical job, or allowed to drain; no backfill may infer identity from a queue position or create a duplicate side effect.
- Define the status projection and event naming without changing runtime behavior.

### Phase 1 — control-plane foundation

- Extend `worker_jobs` and `worker_job_events` with the minimum canonical current-state and history fields.
- Add guarded transition/service ports, event idempotency, lease/heartbeat, error classification, and focused tests.
- Add attempt/dispatch/outbox companions only where required by the one-to-many or transactional publication use case.
- Add a reconciler in observe-only mode first, then enable bounded recovery for explicitly allowlisted job classes.

### Phase 2 — adapter extraction

- Introduce `JobDispatcher`, `JobExecutor`, `JobReporter`, and `SchedulerAdapter` ports in the owning runtime packages.
- Convert one low-risk BullMQ queue and one low-risk Celery task class to thin wrappers.
- Preserve legacy entry points as compatibility shims until callers are migrated and evidence confirms no direct transport call remains in the selected domain service.
- Keep CPU-heavy processing off Node workers as each class migrates.

### Phase 3 — outbox and operational control

- Enable transactional outbox publication for new jobs and retry dispatches.
- Add admin Job Monitor, stale/outbox alerts, redacted event inspection, and runbooks.
- Enable schedule occurrence dedupe and convert Beat entries to job-intent creators.
- Run duplicate-delivery, broker-loss, worker-loss, lease-expiry, and delayed-reconciliation tests before expanding scope.

### Phase 4 — queue-family rollout

- Migrate queue families independently: media/API, video/CPU, presentation, sandbox, vision/audio, workflow/maintenance, notifications/webhooks, and other bound domains.
- For each wave, compare canonical state with transport observations, measure retry/duplicate behavior, and keep a rollback flag to the previous adapter path.
- Each cutover has a preflight inventory, bounded canary, explicit producer ownership switch, post-cutover reconciliation window, and rollback decision based on canonical metrics; the old producer is disabled for new work before the new side-effecting producer is enabled.
- Do not delete old transport records or identifiers until the retention and reconciliation window has passed.

### Phase 5 — Cloudflare migration

- Implement and test Cloudflare Queues, Workflows, Containers, and Cron adapters behind the same ports.
- Start with a non-critical queue in shadow/limited mode, then shift one job class at a time.
- Shadow mode must be observation-only or use a side-effect-free executor; it must not run a provider call, charge credits, publish artifacts, send notifications, or execute a duplicate business operation.
- Prove that duplicate delivery, provider timeout, workflow pause/resume, container restart, and deployment rollback still converge on the same `worker_jobs.id`.
- Retire BullMQ/Celery only after all canonical jobs have an accepted alternative, operational dashboards are equivalent, and recovery evidence is production-grade.

No phase may require a simultaneous migration of all queues, a rewrite of domain services, or a destructive copy from `worker_jobs` into a new generic `jobs` table.

Each rollout wave must publish a small migration manifest containing the selected job types, owning call sites, active adapter flag, compatibility projection, schema version, backfill/drain rule, rollback flag, and evidence links. A job type must have one active side-effecting producer/adapter at a time; dual-run is allowed only for observation or side-effect-free execution. Rollback returns new work to the previous adapter while preserving the same canonical IDs and does not roll back committed terminal history.

## Acceptance criteria

### Persistence and lifecycle

- A job can be created with a canonical `worker_jobs.id` before any adapter publish.
- Duplicate create with the same tenant-scoped idempotency key returns the same canonical job and does not create a second outbox intent.
- Reusing an idempotency key with a different canonicalized job definition returns `IDEMPOTENCY_CONFLICT` and does not mutate the existing job.
- Every accepted state transition updates `worker_jobs` and appends a corresponding `worker_job_events` event, with guarded concurrency behavior.
- Lease acquisition, heartbeat, expiry, recovery, and stale completion races are deterministic and tested.
- External wait releases the active lease, callback/poll reacquisition is fenced, and cancel/timeout cannot be undone by a late worker.
- Lifecycle timeline reads are totally ordered by the canonical per-job event sequence, including concurrent writers.
- Attempt count and retry schedule are controlled by PostgreSQL and remain correct when Redis/broker state is unavailable.
- Domain projection failures leave a durable result/settlement marker and are recoverable by canonical `job_id` without creating a replacement job.
- Operator/API action retries return the original durable outcome, while a reused action key with a different target or command returns `IDEMPOTENCY_CONFLICT`.
- Event sequence allocation remains totally ordered under concurrent writers and bounded database transaction retries do not duplicate events or external effects.
- Unknown/ambiguous failures have an evidence-backed operator-resolution path that is audited and cannot silently create a new job or provider operation.
- Before a job class is enabled, its lease/heartbeat, timeout, retry, payload, concurrency, outbox-age, and event-rate budgets are recorded in the rollout manifest and exercised by a bounded test fixture.

### Adapter boundaries

- Business services contain no direct BullMQ/Celery/Beat/Cloudflare dispatch calls after their migration wave.
- BullMQ and Celery wrappers accept canonical job IDs and call the shared executor/reporting contract.
- Every reporter operation, including progress and completion, carries the attempt/lease fencing context; a job ID alone is insufficient for a worker write.
- Beat creates job intents only; it does not execute business logic.
- External references are queryable without becoming job identity or status truth.
- Transport retries cannot silently increment business attempts or trigger billing/provider side effects.
- Requeue, retry, and cancel actions preserve the same canonical job ID and append an auditable event; none creates an untracked replacement job.

### Reliability and safety

- Duplicate delivery tests prove no duplicate credit deduction, provider submission, notification, webhook, or artifact publication.
- Broker loss after database commit is recovered through outbox publication.
- Publish success followed by producer response loss is reconciled without creating a duplicate canonical job.
- Publish ambiguity is either resolved by a deterministic/queryable adapter dedupe boundary or quarantined for operator review; it is never blindly republished for an irreversible effect.
- Worker crash, event-loop stall, container restart, provider timeout, and late callback paths are bounded and observable.
- Authenticated callback replay, cross-tenant callback, invalid signature, and duplicate callback tests prove no unauthorized or duplicate terminal mutation.
- Retryable and permanent errors are classified; no default retry loop is unbounded.
- Tenant authorization, admin actions, payload redaction, secret handling, and audit events are covered by tests.

### Cloud migration readiness

- A fake/in-memory adapter can execute the same contract without changing domain code.
- Unsupported contract versions are rejected before claim, recorded with a safe error/event, and remain recoverable through an explicitly compatible adapter or operator action.
- A Cloudflare Queues-like at-least-once adapter test demonstrates idempotent convergence.
- A Workflow-like multi-step adapter test demonstrates persisted step/reference mapping without replacing PostgreSQL truth.
- A Container-like executor test demonstrates capability routing, heartbeat, timeout, and artifact reporting.
- The rollout runbook identifies exact deploy, flag, migration, rollback, and evidence gates. Mock tests are not presented as production Cloudflare proof.
- Backup/restore or PITR rehearsal proves that replaying outbox, callback, and reconciler work preserves event ordering and does not duplicate paid/provider/artifact side effects.

## Verification plan

Focused verification should be organized by contract, not by transport implementation alone:

1. Unit tests for state transitions, guarded leases, event idempotency, error classification, backoff, occurrence keys, and redaction.
2. Repository/service tests for concurrent idempotent create, transactional create + outbox, duplicate publication, publisher loss, and poison-row quarantine.
3. Adapter contract tests run against fake BullMQ, Celery, scheduler, queue, workflow, container, and Worker App adapters.
4. Failure-injection tests for broker outage, worker loss, process timeout, lost publish response, duplicate message, stale callback, provider 429/5xx/400, database contention, external-wait lease release/reacquisition, and schedule timezone/DST/missed-occurrence behavior.
5. Integration tests for representative media, video, presentation, sandbox, workflow, notification, and billing-bound jobs, with no real paid provider calls unless separately authorized.
6. Browser/admin tests for monitor state, event timeline, authorization, redaction, safe actions, and truthful distinction between canonical state and queue observations.
7. Migration tests against a representative copy of the existing schema/data must cover legacy status aliases, existing assignment/event sequences, nullable/duplicate idempotency keys, in-flight task bindings, and rollback-safe backfill/drain behavior before constraints become strict.
8. Static call-site checks and impact review must verify that migrated domain services no longer import or call direct transport APIs, while compatibility shims and intentionally unmigrated call sites are enumerated in the rollout manifest.
9. Deployment evidence must separately identify schema migration, service restart/build identity, adapter flag state, worker connectivity, and production recovery proof.

## Risks and trade-offs

| Decision | Benefit | Cost / mitigation |
|---|---|---|
| Extend `worker_jobs` instead of creating `jobs` | Preserves existing worker bindings and avoids two ledgers. | Requires careful status/call-site inventory and compatibility aliases. |
| PostgreSQL current state plus append-only events | Survives broker loss and makes stuck-job recovery explainable. | Adds writes and retention/partitioning work; use indexes, bounded payloads, and retention policy. |
| Central business retry plus adapter transport retry | Same semantics across BullMQ, Celery, and Cloudflare. | More explicit code; test duplicate and lost-ack cases rather than relying on broker defaults. |
| Lease/heartbeat owned by the control plane | Detects dead workers consistently across runtimes. | Requires worker cooperation and a reconciler; use class-specific intervals and bounded sweeps. |
| Thin executor wrappers | Makes future runtime replacement low-cost. | Existing tasks need staged extraction; preserve compatibility shims during rollout. |
| Separate future Queues/Workflows/Containers adapters | Matches single-step transport, durable orchestration, and heavy execution boundaries. | Cloud provider limits and account capabilities must be revalidated before implementation; keep the adapter contract provider-neutral. |

## Explicit non-goals

- No new parallel generic `jobs` table.
- No immediate deletion of BullMQ, Celery, Celery Beat, Redis, or current queue configuration.
- No rewrite of every domain service in one release.
- No reliance on Redis queue length as the definition of stuck, running, or completed.
- No unlimited retry, automatic destructive cleanup, silent provider regeneration, or duplicate credit consumption.
- No Cloudflare deployment, production cutover, `.env` mutation, credential migration, or infrastructure provisioning in this specification.
- No claim that mock adapters or local health checks prove a production Cloudflare deployment.

## External platform references

These references inform the future adapter boundary and must be revalidated during implementation:

- [Cloudflare Queues delivery guarantees](https://developers.cloudflare.com/queues/reference/delivery-guarantees/) — default at-least-once delivery and idempotency guidance.
- [Cloudflare Queues batching, retries, and delays](https://developers.cloudflare.com/queues/configuration/batching-retries/) — transport retry/DLQ and delay behavior.
- [Cloudflare Workflows overview](https://developers.cloudflare.com/workflows/) and [rules of Workflows](https://developers.cloudflare.com/workflows/build/rules-of-workflows/) — durable multi-step execution, waits, retries, and idempotent steps.
- [Cloudflare Containers overview](https://developers.cloudflare.com/containers/) — containerized CPU/memory/filesystem-heavy execution managed from Workers.
- [Cloudflare Hyperdrive PostgreSQL connection](https://developers.cloudflare.com/hyperdrive/examples/connect-to-postgres/) and [Hyperdrive limits](https://developers.cloudflare.com/hyperdrive/platform/limits/) — the future connectivity binding, origin pool, and query/connection limits must be validated in the target account.

These links are architectural inputs, not permission to couple the business layer directly to provider APIs.
