# Section 02 — Scheduler Admission, Lease Control, and Artifact Protocol

## 1. Outcome

This workstream makes `remotion_executor` a safe, explicit execution target for
the existing `remotion_render_video` job. It changes server-side routing and
worker admission only; it does not implement the standalone executor process or
add a second render pipeline.

After this section is complete:

- every new Remotion job has one immutable, server-resolved target;
- target resolution and explicit-executor availability checks finish before a
  credit reservation is created and before `worker_jobs` insertion;
- existing callers remain on the Worker App path while the dedicated-executor
  tenant flag is off;
- only a healthy, compatible, non-saturated `remotion_executor` can claim a
  dedicated job;
- every control poll, progress event, artifact operation, and terminal event is
  bound to tenant, runtime, worker, lease, and assignment attempt;
- artifact upload follows the existing Worker App init/upload/complete protocol
  and rejects stale or inconsistent completion;
- Redis is not introduced as a durable job, billing, lease, or artifact source
  of truth.

The durable pull queue remains PostgreSQL-backed `worker_jobs`. The executor
continues to use the existing authenticated Worker REST control plane. MCP does
not participate in claim, heartbeat, lease renewal, or binary upload.

## 2. Scope and non-goals

This section owns the following server surfaces:

- target resolution in `queueRemotionRenderVideoJob`;
- scheduler repository support for a bounded executor-pool availability
  snapshot;
- exact runtime/capability/readiness/concurrency admission in
  `claimWorkerJob`;
- assignment-attempt enforcement for Remotion events and artifacts;
- the read-only worker job control route;
- Remotion MP4 artifact init and completion validation;
- idempotency and credit-ordering behavior around queue insertion;
- focused scheduler, registry, and route tests.

This section does not:

- create `apps/remotion-executor`;
- alter the strict `RemotionRenderVideoWorkerInput` payload;
- allow arbitrary job types to route to `remotion_executor`;
- retarget an existing job after insertion;
- replace the Worker App or its desktop target;
- add a Redis queue for `worker_jobs`;
- transfer MP4 bytes through MCP;
- publish public or signed download URLs in worker events;
- implement Library/media-history authorization, which belongs to section 05;
- implement Redis-wide metrics and key governance, which belongs to section 07.

## 3. Prerequisites from section 01

Section 01 must land before this workstream. This section consumes, rather than
redefines, the following shared contracts from
`apps/web/shared/workerRuntime.ts` and `apps/web/shared/featureFlags.ts`:

- `remotion_executor` in `workerRuntimeTypeValues` and its Drizzle enum
  migration;
- `remotionDedicatedExecutorEnabled`, defaulting to `false`;
- queue-level requested targets `auto | desktop_worker | remotion_executor`;
- API-level resolved labels `desktop_worker | remotion_executor`, mapped to
  durable runtime types `desktop_zeroclaw_managed | remotion_executor`;
- the strict `remotionExecutorReadinessSchema` and its inferred type;
- `REMOTION_RENDER_VIDEO_CAPABILITY_FAMILIES`;
- `REMOTION_RENDER_VIDEO_CLAIM_CAPABILITY`;
- `REMOTION_RENDER_VIDEO_PLATFORM_CONTRACT_VERSION`;
- worker registration, heartbeat, event, artifact, and control request/response
  schemas extended additively for the new runtime.

The readiness contract must include at least:

- `ready: boolean`;
- `checkedAt` as an ISO timestamp;
- `runtimePlatform` and `architecture`;
- `runtimePackId`, `runtimePackVersion`, and executor version;
- `platformContractVersion`;
- the three descriptive capability families and exact claim capability;
- browser launch, FFmpeg, ffprobe, fonts, native dependency, disk, and workspace
  checks;
- `maxConcurrentRenders` as a positive bounded integer;
- a sanitized failure code/reason when `ready` is false.

If section 01 changes a symbol name, it must update this section and the section
index in the same planning revision. Implementers must not create local aliases
with different semantics merely to avoid reconciling the contracts.

## 4. Files and symbols

### 4.1 `apps/web/server/services/workerSchedulerService.ts`

Modify these existing symbols:

- `WorkerSchedulerFeatureFlags` — add
  `remotionDedicatedExecutorEnabled: boolean` while preserving all existing
  flags;
- `WorkerSchedulerRepository` — add one narrow, injectable availability lookup
  for the dedicated pool;
- `isDesktopWorkerDispatchEnabled` — preserve its current meaning and scope;
- `workerJobMatchesSelection` — add dedicated-runtime exact matching without
  weakening legacy desktop behavior;
- `QueueRemotionRenderVideoJobInput` — add the queue-only requested execution
  target and strip it before strict payload parsing;
- `queueRemotionRenderVideoJob` — resolve and persist the target before credit
  reservation and insertion;
- `queueWorkerJobByRuntime` — reject every non-Remotion use of
  `remotion_executor` and prevent generic caller-controlled payloads from
  bypassing the dedicated queue function.

Add these focused symbols:

- `isRemotionDedicatedExecutorDispatchEnabled()` — reads only the operator kill
  switch `REMOTION_DEDICATED_EXECUTOR_DISPATCH_ENABLED`; unset is treated as
  enabled only after the tenant flag remains the outer rollout gate;
- `REMOTION_EXECUTOR_READINESS_MAX_AGE_MS` — phase-one freshness limit of
  60 seconds, covering four missed 15-second Worker heartbeat intervals;
- `resolveRemotionExecutionTarget(...)` — a pure decision function over the
  requested target, tenant flags, operator gates, and pool snapshot;
- `buildRemotionExecutionRoutingMetadata(...)` — creates the normalized,
  durable routing reason/version fields without copying readiness details or
  secrets into the job;
- `isUniqueWorkerJobIdempotencyConflict(error)` — recognizes only the existing
  tenant/idempotency unique constraint and must not convert unrelated insert
  errors into successful replays.

The new scheduler repository method should be named
`findRemotionExecutorAvailability(tenantId, requirements, now)` and return a
small projection such as:

```text
eligibleWorkerCount
availableSlotCount
newestReadinessAt
reason: ready | no_workers | stale | unhealthy | contract_mismatch | saturated
```

Its default implementation queries `workers`, the latest relevant
`worker_heartbeats`, and active `worker_jobs` in PostgreSQL. It must be scoped to
the tenant and exact runtime. It must not read a client-supplied worker ID, use a
cross-tenant fleet total, or depend on Redis cache contents. The query is an
admission snapshot, not a reservation of capacity; claim-time admission remains
authoritative.

Do not import `workerRegistryService` from the scheduler to obtain this
snapshot. `workerRegistryService` already imports `workerJobMatchesSelection`,
so importing the registry back into the scheduler would create a circular
dependency. Keep the query behind `WorkerSchedulerRepository` or move only the
pure shared readiness parser to a dependency-neutral module if section 01
requires it.

### 4.2 `apps/web/server/services/workerRegistryService.ts`

Modify these existing symbols:

- `WorkerRuntimeRepository.listClaimableJobs` — retain exact tenant/runtime
  filtering;
- `WorkerRuntimeRepository.tryClaimJob` — accept an optional server-derived
  concurrency ceiling for `remotion_executor` and enforce it atomically in the
  claim transaction;
- `registerWorker` and `recordWorkerHeartbeat` — validate and persist the
  normalized dedicated readiness snapshot;
- `ensureWorkerCanClaim` — reject an executor that is unhealthy, stale,
  draining, disabled, paused, or not render-ready;
- `filterClaimableJobsForWorker` — preserve tenant/user/group policy and avoid
  a special bypass for the new runtime;
- `claimWorkerJob` — require exact runtime, readiness, capability, contract, and
  available concurrency before calling `tryClaimJob`;
- `ensureAssignmentAttempt` — include `remotion_render_video` when its durable
  target is `remotion_executor`; retaining the check for dedicated jobs after a
  reclaim is mandatory;
- `recordWorkerJobEvent` — scope sequence replay detection to the active
  assignment attempt for dedicated Remotion jobs;
- `initWorkerArtifactUpload` and `completeWorkerArtifact` — enforce the Remotion
  artifact contract and current assignment;
- `assertRuntimeSpecificJobEventContract` — continue to enforce the existing ten
  progress stages and failure codes, and add completion prerequisites for the
  dedicated target.

Add these focused symbols:

- `readRemotionExecutorReadiness(worker)` — parse the persisted snapshot with
  the section-01 schema and return a typed result rather than trusting arbitrary
  `capabilitiesJson` fields;
- `assertRemotionExecutorClaimReadiness(worker, now)` — enforce status,
  freshness, platform contract, required capability families, exact claim
  token, and positive capacity;
- `isDedicatedRemotionJob(job)` — true only for
  `jobType === "remotion_render_video"` and
  `runtimeType === "remotion_executor"` with matching durable target metadata;
- `getWorkerJobControl(...)` — service-layer implementation for the control
  route;
- `assertRemotionArtifactInitContract(job, payload)` and
  `assertRemotionArtifactCompleteContract(job, payload)` — exact artifact type,
  MIME, file name, size, checksum, lease, assignment, and storage-ref checks;
- `assertRemotionCompletionReady(job, payload, repo)` — prevents
  `job.completed` until the MP4 artifact for the active assignment has been
  completed.

The default `tryClaimJob` implementation must lock the worker row inside the
same PostgreSQL transaction used to update the job, count that worker's active
jobs, and compare the count with the server-parsed `maxConcurrentRenders`.
Checking capacity only before the transaction is a time-of-check/time-of-use
race: two simultaneous claim requests could both observe one available slot.
Legacy runtime claims continue to use existing behavior when no concurrency
ceiling is supplied.

### 4.3 `apps/web/server/routes/workerRuntime.ts`

Reuse all existing middleware, token validation, request-size limits, device
proof verification, and error formatting. Add only the missing generic control
route:

```text
GET /api/worker-jobs/:jobId/control
```

The route requires:

- bearer token use `worker_execution`;
- scope `workers:report`;
- existing device-proof headers;
- the lease owner token in `X-Worker-Lease-Token`;
- the assignment attempt in `X-Worker-Assignment-Attempt`.

Lease and assignment values must not be query parameters because URLs are more
likely to be retained in access logs and diagnostics. Route parsing should use
the shared control-request schema from section 01 and call
`getWorkerJobControl`; it must not duplicate registry authorization logic.

The response is a bounded projection:

```json
{
  "jobId": "job-id",
  "status": "running",
  "cancelRequested": false,
  "leaseExpiresAt": "2026-08-16T12:00:00.000Z",
  "assignmentAttempt": "attempt_...",
  "serverTime": "2026-08-16T11:59:45.000Z"
}
```

It never includes `inputJson`, `instructionsJson`, billing metadata, storage
keys, provider credentials, signed URLs, or other workers' data. A job already
marked `canceled` returns `cancelRequested: true` to the still-valid current
assignment so the executor can terminate locally. A stale lease or stale
assignment returns `409`; wrong tenant/runtime/worker returns the existing
scope-safe `403`/`404` behavior and reveals no cross-tenant job details.

No changes are required to route names for register, heartbeat, claim, events,
artifact init, or artifact complete. The dedicated executor must use the
canonical routes already listed in the feature specification.

### 4.4 Focused tests

Extend existing test files rather than creating parallel suites with duplicate
fixtures:

- `apps/web/server/services/__tests__/queueRemotionRenderVideoJob.test.ts`;
- `apps/web/server/services/__tests__/workerRegistryService.test.ts`;
- `apps/web/server/routes/__tests__/workerRuntime.test.ts`;
- `apps/web/server/services/__tests__/assertRuntimeSpecificJobEventContract.remotion.test.ts`;
- `apps/web/server/services/__tests__/workerArtifactService.test.ts` only when
  publication verification needs an assertion at that boundary.

Create a new focused file only if the scheduler availability SQL cannot be
tested cleanly through the existing injected repository. If needed, name it
`apps/web/server/services/__tests__/remotionExecutorAdmission.test.ts` and keep
it limited to availability/readiness projection behavior.

## 5. Target-resolution contract

### 5.1 Requested versus resolved target

`executionTarget` is queue metadata, not Remotion payload data. It must be
removed from `rawInput` before `remotionRenderVideoWorkerInputSchema.parse` so
the strict shared payload remains byte-compatible with the Worker App and
portable renderer.

The requested value is:

```text
auto | desktop_worker | remotion_executor
```

Missing input normalizes to `auto`. The durable value is always one of:

```text
desktop_worker | remotion_executor
```

The resolved target maps to runtime type as follows:

| Resolved target | Durable `runtimeType` |
|---|---|
| `desktop_worker` | `desktop_zeroclaw_managed` |
| `remotion_executor` | `remotion_executor` |

The scheduler persists the resolved target in both the runtime type and
normalized routing metadata. The Remotion payload itself remains unchanged.

### 5.2 Resolution inputs

Only server-owned state participates in resolution:

- the normalized requested target from a trusted server caller;
- `remotionRenderVideoJobEnabled`;
- `remotionDedicatedExecutorEnabled`;
- `DESKTOP_ZEROCLAW_WORKER_DISPATCH_ENABLED`;
- `REMOTION_DEDICATED_EXECUTOR_DISPATCH_ENABLED`;
- job type and fixed Remotion contract requirements;
- a tenant-scoped PostgreSQL executor availability snapshot;
- render profile and any platform requirement derived by server code.

Hermes, browser clients, workers, and raw `inputJson` may request a target only
through the typed server API. They may not provide a runtime type, capability
list, preferred worker, readiness result, target reason, or target version.

### 5.3 Decision table

The resolution function follows this table after the global
`remotionRenderVideoJobEnabled` check:

| Requested target | Dedicated tenant flag / operator gate / healthy slot | Desktop operator gate | Result |
|---|---:|---:|---|
| `desktop_worker` | ignored | on | resolve `desktop_worker` |
| `desktop_worker` | ignored | off | `dispatch_disabled`, no reservation or insert |
| `remotion_executor` | all ready | any | resolve `remotion_executor` |
| `remotion_executor` | any requirement false | any | `executor_unavailable`, no reservation or insert |
| `auto` | all ready | any | resolve `remotion_executor` |
| `auto` | unavailable | on | resolve `desktop_worker` |
| `auto` | unavailable | off | `dispatch_unavailable`, no reservation or insert |

An availability lookup failure is not the same as a healthy pool with zero
slots. For explicit dedicated selection it returns a typed transient
`executor_admission_unavailable` response. For `auto`, the scheduler may fall
back to desktop only when the desktop gate is on; it records
`auto_desktop_admission_unknown` as the target reason. It must not infer
executor health from an old cache value.

### 5.4 Exact operation order

`queueRemotionRenderVideoJob` must execute in this order:

1. Strip queue-only fields, including `executionTarget`, and parse the strict
   Remotion payload.
2. Apply the existing per-user submission rate limit.
3. Read tenant flags and enforce `remotionRenderVideoJobEnabled`.
4. Build the existing server-owned idempotency key.
5. Query the durable job by tenant and idempotency key.
6. If a job exists, return it unchanged with `created: false`; never re-resolve,
   retarget, reserve credits, or insert because current fleet health changed.
7. Enforce the existing preview concurrency rule.
8. Resolve the requested target using current server-owned gates and the
   tenant-scoped pool snapshot.
9. Construct immutable routing metadata and target-specific capability
   requirements.
10. Reserve credits once for the new logical job.
11. Insert the job with the resolved runtime and routing metadata.
12. On insert failure, release the reservation through the existing credit
    service. If the failure is the tenant/idempotency unique constraint, read
    and return the winning row after the losing reservation is released.

Steps 8 and 9 must finish before steps 10 and 11. No explicit-target readiness
error may leave a reservation behind. The idempotency replay lookup deliberately
precedes current target resolution: retrying a previously accepted request must
return its immutable job even when the original executor is now offline or the
rollout flag is now disabled.

If reservation release fails after an insertion failure, do not swallow the
error silently. Emit a sanitized billing-reconciliation audit/metric containing
the reservation ID, tenant, idempotency key hash, and failure class, then return
a typed server error. Never attempt a second insert to compensate.

### 5.5 Persisted routing metadata

For a dedicated target, persist:

```text
runtimeType: remotion_executor
capabilityRequirementsJson.executionTarget: remotion_executor
capabilityRequirementsJson.capabilityFamilies: existing Remotion families
capabilityRequirementsJson.requiredClaimCapability: existing contract token
capabilityRequirementsJson.preferredWorkerId: null unless set by admin policy
capabilityRequirementsJson.renderProfile: preview | final
capabilityRequirementsJson.targetResolutionVersion: REMOTION_EXECUTION_TARGET_POLICY_VERSION
instructionsJson.executionRouting.requestedTarget: normalized requested value
instructionsJson.executionRouting.resolvedTarget: remotion_executor
instructionsJson.executionRouting.reason: normalized server reason
instructionsJson.executionRouting.version: REMOTION_EXECUTION_TARGET_POLICY_VERSION
```

For desktop, persist the same routing envelope with `desktop_worker` while
retaining the existing runtime and capabilities. This makes status and audit
projections deterministic without changing `inputJson`.

Do not persist the executor count, machine ID, host path, readiness details,
signed URLs, or the worker selected at queue time. Pool health is transient and
must not become authority for later claims.

The target is immutable after insertion. Reconciliation, retries, page refresh,
and MCP status reads use the stored target. An already queued dedicated job
remains dedicated if the pool goes offline; it stays visibly queued and is not
silently moved to a desktop worker.

## 6. Scheduler restrictions

`queueWorkerJobByRuntime` must not become a generic escape hatch. Its
`remotion_executor` branch may accept only `jobType ===
"remotion_render_video"` and must delegate to `queueRemotionRenderVideoJob`
with an explicit dedicated target. Every other job type returns
`unsupported_job_type` before any repository or billing call.

The dedicated route must continue to build capability requirements from shared
constants. It must ignore or reject caller-provided capability families,
contract tokens, runtime type, preferred worker, billing metadata, and routing
reason. Administrator worker pinning, if later enabled, is resolved from a
server-owned policy record and is not part of the public or MCP request schema.

All current Remotion entry points—Video Project, Vertical Drama, and
Marketplace—must continue to call `queueRemotionRenderVideoJob`. This section
must use targeted search and tests to prove no entry point inserts a
`remotion_render_video` row directly.

## 7. Pool availability and readiness

### 7.1 Queue-time pool snapshot

A worker contributes an available slot only when all of the following are true:

- tenant matches the request tenant;
- runtime type is exactly `remotion_executor`;
- worker status is `online`;
- worker is not revoked, disabled, draining, or paused;
- `lastSeenAt` and readiness `checkedAt` are no older than 60 seconds;
- the readiness payload passes `remotionExecutorReadinessSchema`;
- `ready` is true;
- platform contract equals
  `REMOTION_RENDER_VIDEO_PLATFORM_CONTRACT_VERSION`;
- every `REMOTION_RENDER_VIDEO_CAPABILITY_FAMILIES` entry is advertised;
- the exact `REMOTION_RENDER_VIDEO_CLAIM_CAPABILITY` is advertised;
- browser, FFmpeg, ffprobe, fonts, disk, native dependency, and workspace
  checks are healthy;
- active assigned render count is less than `maxConcurrentRenders`;
- any server-owned platform/profile restriction matches.

Malformed, missing, future-version, or unknown readiness fields fail closed.
One unhealthy worker does not poison a pool that has another eligible slot. The
snapshot returns aggregate counts and a normalized reason only; it does not
expose worker identities to the queue caller.

### 7.2 Registration and heartbeat ingestion

`registerWorker` validates runtime-specific metadata before persisting a new
executor. Runtime token, registration auth context, payload runtime, tenant,
external reference, and device binding must all describe the same
`remotion_executor` principal.

`recordWorkerHeartbeat` reparses fresh readiness on every dedicated heartbeat.
It stores a normalized snapshot under the existing capability/health envelope,
including current job count and readiness timestamp, while sanitizing all
worker-supplied detail. A heartbeat cannot set tenant flags, operator gates,
target reasons, or its own claim limit above the shared maximum. If the doctor
reports `ready: false`, the server records the reason and makes the worker
ineligible; it does not discard the heartbeat or pretend the worker is healthy.

The server must use its receipt time for freshness decisions. A worker timestamp
is retained for diagnostics but cannot extend readiness validity into the
future. Excessive clock skew becomes an unhealthy readiness reason.

### 7.3 Claim-time authoritative gate

Queue-time availability is advisory because capacity can change before a claim.
At claim time the server repeats all principal and readiness checks against the
claiming worker's persisted server-normalized snapshot.

For a dedicated job, `workerJobMatchesSelection` requires both:

1. the exact versioned claim capability; and
2. every descriptive Remotion capability family.

The current legacy desktop Remotion rule remains compatible: existing desktop
jobs continue to require the versioned claim capability without suddenly
requiring new dedicated-only readiness metadata.

`claimWorkerJob` skips an ineligible dedicated candidate and continues scanning
the bounded candidate list. It does not throw out an unrelated claim attempt
because one candidate is stale, preserving the existing skip-candidate behavior.
The service returns `job: null` when no candidate qualifies.

The final capacity decision occurs inside `tryClaimJob` under a PostgreSQL
worker-row lock. The transaction verifies that the candidate is still queued or
reclaimable, that the worker still owns an available slot, and that the existing
lease fields still match before updating the job to `claimed`. This retains the
existing compare-and-set behavior and prevents two concurrent requests from
oversubscribing a one-slot executor.

## 8. Lease, assignment, events, and cancellation

### 8.1 Assignment identity

The existing `leaseOwnerToken` and derived `assignmentAttempt` remain the
assignment identity. A dedicated Remotion claim response must include both. The
attempt is persisted in `outputJson.assignmentAttempt` using the existing
`buildAssignmentAttempt(jobId, workerId, leaseOwnerToken)` behavior.

For dedicated Remotion jobs, every event, control poll, artifact init, and
artifact complete call must pass both values. `ensureLease` and
`ensureAssignmentAttempt` execute after tenant/runtime/worker scope checks and
before any mutation or storage authorization.

When a lease expires and a job is reclaimed, the new claim gets a new lease and
attempt. Events from the old process are rejected with `stale_worker_lease` or
`stale_assignment_attempt`; they may not update progress, complete an artifact,
publish output, settle credits, or alter the new lease.

### 8.2 Event sequence and transitions

Remotion event replay detection is scoped to the active assignment attempt, as
already done for HyperFrames and Hermes jobs. Sequence number 1 is valid again
after a legitimate reclaim because old-attempt events are excluded from the
active sequence window.

The existing progress-stage and failure-code lists remain authoritative.
Unknown progress stages, unknown failure codes, duplicate sequence numbers,
backward sequence numbers, and illegal state transitions retain typed 4xx/409
responses.

Non-terminal progress extends the active lease through existing behavior.
Terminal state does not create a new lease. Billing settlement and publication
remain server-owned and idempotent by job/reservation/artifact identity.

### 8.3 Control route and cancellation

`getWorkerJobControl` reads the job by tenant and ID, applies
`ensureJobScopedAccess`, `ensureLease`, and `ensureAssignmentAttempt`, then
returns the bounded projection described above.

The executor polls control between render stages and during the long browser
render. When the server-side cancel path sets the durable status to `canceled`,
the route returns `cancelRequested: true`. The executor then terminates its
local child process and must not send `job.completed`. A completion or artifact
call arriving after cancellation is rejected by the active-state guard.

This section does not introduce a new cancellation state. It uses the existing
durable `canceled` status and the existing user/admin cancellation guard. If a
future explicit `cancel_requested` state is added, that requires a separate
schema/migration decision.

## 9. Artifact protocol

### 9.1 Required sequence

The dedicated executor follows exactly this sequence:

1. Finish rendering to a job-scoped local file.
2. Compute SHA-256 and byte size from the final immutable file.
3. Send `job.uploading` for the active lease/attempt.
4. Call `artifacts/init-upload` with artifact type, file name, MIME, size,
   checksum, lease, and attempt using a `worker_upload` token.
5. Upload bytes to the exact server-issued destination without a Smart AI Hub
   bearer token.
6. Call `artifacts/complete` with the returned storage reference and the same
   immutable metadata, lease, and attempt.
7. Send the existing Remotion progress descriptors and only then send
   `job.completed` with the Worker App-compatible output shape.
8. Let the server verify/publish artifacts and settle credits.

No terminal success is accepted before step 6 succeeds.

### 9.2 Init validation

For a dedicated Remotion job, `initWorkerArtifactUpload` accepts only:

- active job status suitable for upload;
- `artifactType === "remotion_render_mp4"`;
- `contentType === "video/mp4"`;
- a sanitized `.mp4` file name;
- positive size within the existing worker artifact limit;
- a lowercase 64-character SHA-256 digest;
- current tenant/runtime/worker/lease/assignment.

The server derives `storageRef` through the existing
`worker-artifacts/{tenantId}/{jobId}/...` builder. The worker cannot choose a
bucket, prefix, object key, host, or public URL. Repeating init for an expired
presign with the same job, attempt, size, content type, and checksum must derive
the same object identity. Repeating with different immutable metadata is a
conflict.

The dedicated phase-one path requires a usable presigned upload. If active
storage cannot produce one, init returns a typed transient
`artifact_upload_unavailable` error; it must not return a `method: server`
response unless a real authenticated streaming upload route exists. Legacy
runtime behavior is unchanged.

### 9.3 Upload and complete validation

`completeWorkerArtifact` verifies:

- job scope and active status;
- current lease and assignment attempt;
- artifact type, content type, checksum, and size equal the init contract;
- storage reference belongs to the exact tenant/job/attempt-derived object;
- the object exists and its stored length equals the declared size;
- storage-provider checksum attestation equals the declared SHA-256 when
  supported;
- a duplicate `(workerJobId, storageRef)` has identical artifact type,
  checksum, size, content type, and assignment attempt.

The init contract must be recoverable server-side. Prefer a durable,
idempotent upload-intent representation attached to the job or artifact
metadata rather than a Redis-only record. If section 01 supplies an additive
upload-intent schema, use it. A process restart or Redis eviction must not allow
completion metadata to change silently.

When the storage provider cannot attest SHA-256 directly, the verification
adapter must stream-hash the object without buffering the MP4 in server memory,
or fail closed with `artifact_checksum_unverifiable`. An ETag is not treated as
SHA-256. The provider-specific optimization belongs behind the existing storage
layer; registry code consumes only a normalized existence/size/checksum result.

An existing artifact is idempotent only when every immutable field matches. A
reused storage ref with a different checksum, size, MIME, artifact type, or
assignment returns `409` and never updates the existing row.

### 9.4 Terminal completion gate

Before accepting `job.completed` for a dedicated Remotion job,
`assertRemotionCompletionReady` verifies that the active assignment has one
completed `remotion_render_mp4` artifact and that the terminal payload's MP4
descriptor points to that exact storage ref/checksum/size. Inline manifest,
render log, and probe report descriptors continue to use the existing Remotion
output schema and sanitization rules.

`recordWorkerJobEvent` then follows its existing order: validate event, persist
terminal state/event, publish through `publishWorkerArtifacts`, and reconcile
credits. If publication fails, the server converts the attempted success to a
typed failed state as it does today. The executor never invents a playback URL;
publication and downstream reconciliation resolve safe server projections.

## 10. Idempotency and billing invariants

The existing server-derived key based on project, revision, and render profile
remains authoritative. Execution target is intentionally not added to the key:
the same logical render must not create one desktop job and one executor job.

The invariants are:

- one logical key has at most one durable job per tenant;
- an idempotent replay never performs target resolution again;
- an idempotent replay never reserves credits again;
- a worker retry or lease reclaim reuses the same job and reservation;
- changing the rollout flag or fleet health never retargets the row;
- a concurrent unique-constraint loser releases its reservation before
  returning the winning row;
- completion reconciliation remains idempotent by reservation and job ID;
- failure, cancellation, expiry, or insertion failure cannot silently strand a
  reservation.

The queue response should include the stored resolved target in its safe
projection so callers can explain why a request is waiting, but it must not
include readiness details, internal worker IDs, or billing secrets.

## 11. Redis policy and outage behavior

This workstream must not add a Redis dependency to the pull-based worker queue.
Current authoritative behavior already lives in PostgreSQL:

- job/idempotency row lookup and insertion;
- credit reservation metadata;
- worker registration/readiness snapshot;
- claim compare-and-set;
- lease and assignment attempt;
- event sequence history;
- artifact metadata and terminal state.

No render input, output, media bytes, artifact body, full prompt, credential,
lease token, signed URL, or durable readiness record may be stored in Redis.

If section 07 adds an optional short-lived availability cache, this section
must use it only as a performance hint. A cache miss, eviction, malformed value,
or Redis outage falls back to the tenant-scoped PostgreSQL availability query;
it never turns stale cached health into a positive admission decision. Cache
contents must have an explicit namespace, bounded value size, and TTL no longer
than the 60-second readiness window.

If a future queue adapter introduces a Redis operation that is genuinely
required for safe coordination, its failure must occur before credit
reservation and insertion and return `executor_admission_unavailable` or
`coordination_unavailable`. It must not fall back by inserting a second job,
changing the target, issuing an unleased claim, or accepting an unverified
artifact.

Therefore Redis outage tests for this workstream assert one of two safe states:

- the PostgreSQL-only path continues with identical authorization and
  idempotency guarantees; or
- an explicitly Redis-dependent operation fails closed before side effects.

There is no allowed state in which Redis failure produces a duplicate job,
duplicate net reservation, cross-tenant claim, missing lease check, or terminal
success without a verified artifact.

## 12. Error contract

Use existing `WorkerSchedulerError` and `WorkerRuntimeServiceError` envelopes.
Messages must be actionable but must not expose fleet internals.

| Code | HTTP | Meaning and side-effect rule |
|---|---:|---|
| `feature_disabled` | 403 | Base Remotion feature is disabled; no reservation/insert. |
| `dispatch_disabled` | 503 | Explicit desktop target is operator-disabled; no reservation/insert. |
| `executor_unavailable` | 503 | Explicit executor target has no eligible slot or rollout gate; no reservation/insert. |
| `executor_admission_unavailable` | 503 | Availability could not be evaluated safely; no reservation/insert. |
| `dispatch_unavailable` | 503 | `auto` has neither a dedicated nor desktop path; no reservation/insert. |
| `unsupported_job_type` | 400 | Generic scheduler attempted a non-Remotion dedicated job; no side effect. |
| `worker_state_invalid` | 409 | Worker is unhealthy, draining, paused, saturated, or job state is invalid. |
| `stale_worker_lease` | 409 | Lease missing, expired, or replaced; no mutation. |
| `stale_assignment_attempt` | 409 | Attempt does not match active assignment; no mutation. |
| `artifact_upload_unavailable` | 503 | No usable upload destination; no artifact row or success event. |
| `artifact_contract_mismatch` | 409 | Init/complete immutable fields differ; no overwrite. |
| `artifact_checksum_unverifiable` | 409 | Stored bytes cannot be verified; no completion/publication. |

Pool counts, machine names, storage keys, lease tokens, checksums from other
artifacts, and signed URLs must not appear in user-facing error text.

## 13. TDD implementation order and test stubs

Implementation follows red-green-refactor in the order below. The snippets are
test names and assertions, not full implementations.

### 13.1 Scheduler target resolution

Extend `queueRemotionRenderVideoJob.test.ts` first:

```ts
describe("queueRemotionRenderVideoJob target admission", () => {
  it("keeps missing target on desktop when the dedicated tenant flag is off");
  it("resolves explicit desktop before reserve and insert");
  it("rejects explicit desktop when its operator gate is off without reserving");
  it("resolves explicit executor only with flag, gate, and a healthy slot");
  it("rejects explicit executor_unavailable before reserve and insert");
  it("auto selects a healthy executor before reserve and insert");
  it("auto falls back to desktop when executor readiness is absent or stale");
  it("auto fails without side effects when neither target is available");
  it("strips executionTarget before strict Remotion payload parsing");
  it("persists one immutable target and normalized reason/version");
  it("returns an existing idempotent job without rechecking current readiness");
  it("does not include target in the logical render idempotency key");
  it("refunds a reservation and returns the winner on a concurrent unique conflict");
  it("surfaces refund reconciliation failure without retrying insertion");
});
```

Every ordering test uses mock invocation order and explicitly asserts:

```text
resolve/readiness < reserveCredits < insertJob
```

Failure cases assert `reserveCredits` and `insertJob` were never called.

Add `queueWorkerJobByRuntime` regressions in the existing scheduler suite:

```ts
describe("remotion_executor generic routing guard", () => {
  it("delegates only remotion_render_video through the dedicated queue function");
  it("rejects every other job type before repository and billing calls");
  it("cannot accept caller-provided capability, target-reason, or billing metadata");
});
```

### 13.2 Availability and readiness

Test the injected availability repository or the focused admission test file:

```ts
describe("findRemotionExecutorAvailability", () => {
  it("counts only tenant-scoped remotion_executor workers");
  it("rejects offline, unhealthy, disabled, draining, paused, and revoked workers");
  it("rejects stale server heartbeat or readiness receipt time");
  it("rejects malformed readiness and future worker timestamps");
  it("rejects stale platform contracts and missing capability families");
  it("reports saturated when active jobs reach maxConcurrentRenders");
  it("reports ready when at least one compatible slot remains");
  it("never treats optional Redis cache failure as healthy evidence");
});
```

### 13.3 Registration and claim

Extend `workerRegistryService.test.ts`:

```ts
describe("remotion_executor registration and claim", () => {
  it("registers through existing tenant/runtime/device-bound auth");
  it("normalizes a healthy doctor snapshot without storing secrets");
  it("records ready false and makes the worker ineligible");
  it("rejects wrong runtime, stale contract, missing family, and missing claim token");
  it("rejects stale readiness and clock-skewed readiness");
  it("rejects a saturated executor");
  it("atomically allows only one claim for one available slot");
  it("skips an ineligible Remotion candidate and can claim a later eligible job");
  it("preserves legacy desktop Remotion claim behavior");
  it("returns and persists leaseOwnerToken plus assignmentAttempt");
});
```

The concurrency test runs two claim promises against a transaction-capable test
repository or integration database and proves only one receives the job/slot.
A pair of independent mocks that cannot model locking is insufficient proof.

### 13.4 Lease, events, and control route

Extend registry and route suites:

```ts
describe("dedicated Remotion lease and control", () => {
  it("requires assignmentAttempt for every dedicated Remotion event");
  it("scopes sequence replay to the active assignment attempt");
  it("rejects old lease events after reclaim without mutating the new job");
  it("returns only bounded control fields for the current assignment");
  it("requires worker_execution, workers:report, device proof, lease, and attempt");
  it("rejects cross-tenant, wrong-runtime, wrong-worker, stale-lease, and stale-attempt reads");
  it("returns cancelRequested true for a canceled active assignment");
  it("never returns inputJson, billing metadata, storage refs, or signed URLs");
  it("rejects job.completed after cancellation");
});
```

Route tests must prove lease and assignment are read from headers and that
query-string copies are ignored/rejected.

### 13.5 Artifact lifecycle

Extend registry/artifact tests:

```ts
describe("dedicated Remotion artifact protocol", () => {
  it("accepts only remotion_render_mp4 video/mp4 for the active assignment");
  it("rejects invalid sha256, zero/oversized files, unsafe names, and wrong MIME");
  it("derives a tenant/job-scoped storage ref and ignores caller key input");
  it("re-inits the same immutable upload idempotently after presign expiry");
  it("rejects re-init with changed size, checksum, MIME, or attempt");
  it("rejects init and complete for stale lease or assignment");
  it("rejects complete when stored object is absent or size differs");
  it("rejects checksum mismatch and never trusts ETag as sha256");
  it("returns the existing artifact only when every immutable field matches");
  it("rejects job.completed until the active MP4 artifact is complete");
  it("publishes and settles one time after valid terminal completion");
  it("never exposes or logs the presigned upload URL");
});
```

### 13.6 Redis failure and idempotency regression

Add focused failure injections:

```ts
describe("scheduler admission during Redis failure", () => {
  it("continues safely through PostgreSQL when optional availability cache is down");
  it("fails before reserve/insert when a required coordination dependency is down");
  it("does not duplicate a job or net reservation after a retry");
  it("does not persist render payloads, artifacts, credentials, or signed URLs in Redis");
});
```

Also rerun the existing desktop Remotion, HyperFrames assignment, Hermes claim,
artifact idempotency, worker auth, and worker route suites. This section is not
accepted if dedicated tests pass by weakening those existing gates.

## 14. Verification commands

Run focused tests from `apps/web` using the repository's existing Vitest setup:

```bash
npx vitest run \
  server/services/__tests__/queueRemotionRenderVideoJob.test.ts \
  server/services/__tests__/workerRegistryService.test.ts \
  server/services/__tests__/assertRuntimeSpecificJobEventContract.remotion.test.ts \
  server/services/__tests__/workerArtifactService.test.ts \
  server/routes/__tests__/workerRuntime.test.ts
```

If a new admission test file is created, add it to the same invocation. Then run
the narrow shared-schema and worker-auth regressions selected by section 01.

Run changed-file diagnostics and `git diff --check`. Repository-wide typecheck
may still contain unrelated baseline failures; report focused proof separately
and do not claim global cleanliness unless the full command actually passes.

## 15. Observability and audit proof

Emit structured, sanitized fields for:

- target requested/resolved/reason/version;
- tenant and job ID;
- dedicated flag and operator gate state as booleans;
- pool result reason and aggregate eligible/available counts;
- claim accepted/rejected reason;
- readiness age bucket, never raw secrets or paths;
- concurrency ceiling and active count;
- lease expiry and assignment conflict counts without lease tokens;
- artifact init/complete/retry/checksum outcome without signed URLs;
- idempotency hit/conflict and reservation reconciliation outcome;
- Redis optional-cache fallback or required-coordination failure.

Audit enrollment/registration remains in the registry. This workstream adds or
extends audit events for target resolution, dedicated claim, cancellation
observation, artifact init, artifact complete, terminal publication, and billing
reconciliation. Logs must redact query strings, bearer tokens, device proof,
lease tokens, storage credentials, local paths, and presigned URLs.

## 16. Dependencies and parallel work

Hard dependency:

- section 01 shared runtime, target, readiness, feature-flag, schema, and enum
  migration contracts.

This section may run in parallel with:

- section 03 Hermes MCP, provided it calls only the target-aware scheduler and
  does not duplicate target resolution;
- section 05 media access, provided artifact publication ownership remains
  server-side and storage authorization names stay canonical;
- section 07 Redis/security, provided Redis remains optional for this
  PostgreSQL pull queue unless a separately justified fail-closed dependency is
  documented.

This section blocks:

- section 04 executor worker loop and control-plane client;
- section 08 end-to-end acceptance and rollout.

The executor team may implement mocks against the shared request/response
schemas, but it must not freeze route assumptions until the control and artifact
tests in this section pass.

## 17. Deployment and rollback

### 17.1 Dark deployment

Deploy in this order:

1. Apply the additive runtime enum migration from section 01.
2. Deploy shared contracts, registry acceptance, control route, and scheduler
   code with `remotionDedicatedExecutorEnabled` false for every tenant.
3. Keep `REMOTION_DEDICATED_EXECUTOR_DISPATCH_ENABLED=false` during initial
   production verification.
4. Register doctor-only executors and verify readiness/heartbeat/claim rejection
   without selecting new jobs.
5. Enable the operator gate while tenant flags remain false.
6. Enable one internal tenant and preview profile only after section 04/06
   runtime proof exists.

With the tenant flag off, missing-target callers continue to resolve to
`desktop_worker`, and existing Worker App jobs and workers behave exactly as
before.

### 17.2 Kill switch

The immediate rollback control is
`REMOTION_DEDICATED_EXECUTOR_DISPATCH_ENABLED=false` plus disabling
`remotionDedicatedExecutorEnabled` for tenants. This stops new dedicated target
selection and new dedicated claims according to operator policy.

Disabling the flag does not mutate existing jobs. Existing dedicated jobs remain
durable and visibly targeted. Operators choose one of these safe actions:

- allow already claimed jobs to drain on a verified executor;
- leave queued jobs paused until the pool is restored;
- cancel queued jobs through the existing authorized cancellation path and let
  billing reconciliation refund them.

Do not retarget existing rows to desktop during rollback. Do not delete worker,
job, event, artifact, or reservation rows. Do not reverse the PostgreSQL enum
migration after `remotion_executor` rows exist.

### 17.3 Code rollback compatibility

The previous server version may not understand `remotion_executor`; therefore a
binary rollback after dedicated rows exist requires the operator gate and tenant
flags to be disabled first, active dedicated claims to be drained/canceled, and
database compatibility to be confirmed. Prefer a forward fix that leaves the
additive enum and metadata readable.

The routing metadata is additive JSON and must be ignored safely by older
desktop-only readers. The strict Remotion `inputJson` remains unchanged, which
preserves Worker App rendering and downstream reconciliation compatibility.

## 18. Definition of done

This workstream is complete only when all of the following are true:

- explicit and automatic target decisions are deterministic and persisted;
- target resolution and dedicated availability checks precede both credit
  reservation and insertion;
- idempotent replay returns the original immutable job without re-resolution;
- flag-off behavior is byte-compatible at the Remotion payload boundary and
  remains desktop-routable;
- generic scheduling cannot route another job type to `remotion_executor`;
- registration and heartbeat reject malformed readiness and store no secrets;
- queue-time admission and claim-time admission both require exact contract and
  capabilities;
- concurrency is enforced atomically at claim;
- Remotion events, control reads, artifacts, and completion require current
  lease and assignment attempt;
- the control route exposes only its bounded cancellation/lease projection;
- artifact init/complete is idempotent, assignment-bound, size/checksum-bound,
  and publication-gated;
- Redis outage behavior is deterministic and cannot duplicate a job or charge;
- focused tests pass alongside existing desktop, HyperFrames, Hermes, artifact,
  auth, and route regressions;
- dark deployment and rollback can be executed without deleting or retargeting
  durable work.

## UI/UX Contract

### Target User / JTBD
N/A — shared server contracts and scheduler admission; no browser task is changed.

### Surface Inventory
N/A — no browser route or component is introduced.

### Component Map
N/A — no frontend ownership changes.

### State Matrix
N/A — state is represented by API/job outcomes and test fixtures.

### Responsive Matrix
N/A — no responsive layout is changed.

### Accessibility Acceptance
N/A — no browser interaction is introduced; errors remain bounded and sanitized.

### Copy Contract
N/A — no browser copy is added.

### Browser Evidence Required
N/A — operational evidence belongs to Section 08.
