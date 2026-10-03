# Phase 4 Plan — Canonical Full Verification Enqueue

## Read-only inventory findings

- `createCanonicalJobInTransaction` in `server/services/jobControlPlane.ts` writes the `worker_jobs` row, lifecycle events and outbox row in the caller's Drizzle transaction.
- The database-backed `DevelopmentRunPersistenceAdapter` already owns that Drizzle transaction and appends phase-neutral `SPEC224_VERIFICATION_*` events to the originating canonical job.
- The default `JobExecutorRegistry` is the server-owned dispatch registry; `POSTGRES_NODE_JOB_TYPES` controls PostgreSQL worker pickup.
- `createDevelopmentRunService.recordVerificationEvent` is idempotent and does not change phase state or attempts, but it is currently a separate helper and does not atomically enqueue a job.
- `spec224VerificationLeaseStore` already provides TTL/fencing. Existing `admit(full)` combines resource admission and lease acquisition, so enqueue preflight needs a new assessment-only API; the executor must perform fresh admission and acquire the lease after claim.
- Canonical jobs have no resource-wait status. An admission-time `QUEUED_RESOURCE` is therefore a phase-neutral DevelopmentRun event with no worker job. A later, new request idempotency key may try again. If capacity disappears after queueing, the worker records `RESOURCE_BLOCKED` as a verification outcome and completes the request job with that explicit outcome; it does not call job failure or phase repair.
- No production Spec 224 full-verification workspace runtime is configured. The producer must return/persist `NOT_CONFIGURED` without creating a job by default. The executor registry entry is a fail-closed boundary for already-persisted deliveries; it records `NOT_CONFIGURED` and must not claim verification success.
- No new table is required: `worker_jobs`, `worker_job_outbox`, the Spec 224 projection, and existing `VERIFICATION_ADMISSION`/`VERIFICATION_OUTCOME` event types provide the required storage.

## Implementation decisions

1. Add a resource-only assessment method; preserve existing `admit(full)` lease semantics.
2. Add a transaction-scoped canonical job enqueue seam to `DevelopmentRunPersistenceTx`. The database adapter calls `createCanonicalJobInTransaction`; adapters without the seam return `NOT_CONFIGURED`.
3. Add a phase-neutral full-verification request service with expected projection revision/fencing validation, stable idempotency key, resource admission, and transactionally coupled run event + canonical job/outbox creation.
4. Register one fixed `spec224.verification.full` job type in the PostgreSQL worker and the default registry. The job payload contains only run/workspace/revision/profile references; it cannot choose executable or shell arguments.
5. Provide an injected runtime contract. With no runtime bound, submission returns `NOT_CONFIGURED` and creates no job. Worker execution re-samples resources, obtains the existing full lease/fence, and records `PASSED`, `CODE_FAILED`, `BASELINE_FAILED`, or `RESOURCE_BLOCKED` as a phase-neutral outcome. Resource blocking is an outcome, never a worker code failure.
6. Add a protected Spec 226 mutation so an authenticated run owner can request full verification; the local CLI remains unable to spawn `full`.

## Safety constraints

- No local `full` child process.
- No alternate queue, schema, table, or migration.
- No full TypeScript check/build and no dependency installation.
- Missing runtime returns `NOT_CONFIGURED`; no simulated success.
- Worker attempt count is one for a verification request. Verification outcomes do not mutate `DevelopmentRun.phaseAttempt`.

## Deferred operational proof

Live PostgreSQL transaction/outbox behavior, configured workspace execution, cgroup admission, lease heartbeats under process interruption, and production deployment are unavailable to this isolated worktree and remain explicit gates.

## Implementation status (2026-10-03)

- Implemented assessment-only resource admission; `admit(full)` still acquires the fenced lease after a successful assessment.
- Implemented the authenticated Spec 226 full-verification request mutation with expected revision/fence checks and audit logging.
- Implemented idempotent, phase-neutral admission events and a transaction-scoped `createCanonicalJobInTransaction` seam. The same Drizzle transaction writes the run projection/event and canonical job/outbox when a verification runtime is configured.
- Registered the fixed `spec224.verification.full` type in the PostgreSQL Node worker and default executor registry. The current executor fails closed by recording `NOT_CONFIGURED`; it cannot report `PASSED`.
- The default service has no full workspace runtime configured, so it records `NOT_CONFIGURED` and does not enqueue. No schema or migration change was needed.
- Focused Node tests and syntax checks pass. Vitest is unavailable in this isolated worktree; database-backed transaction and actual worker execution remain unverified.
- Remaining production gap: bind a real workspace verification runtime that performs fresh worker-side resource admission, acquires/heartbeats/releases the Spec 224 lease, and reports exact evidence. Until then the default path is intentionally not executable.
