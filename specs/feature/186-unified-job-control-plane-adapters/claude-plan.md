# Feature 186 Implementation Plan

## 1. Delivery strategy

Implement the first safe slice as an additive control-plane foundation rather than attempting a blind rewrite of every queue producer. The canonical row and event ledger are extended first, then all new dispatches flow through a service port. Existing routes and tasks receive compatibility helpers and are migrated only where the call-site inventory proves the binding. Every later queue-family cutover reuses the same service and does not change `worker_jobs.id`.

The implementation is organized into eight sections and must be completed in dependency order. Section 01 establishes contracts and canonicalization. Section 02 adds persistence and the additive migration. Section 03 implements guarded lifecycle transitions. Section 04 implements outbox and transport adapters. Section 05 adds executor/reporter/reconciler integration. Section 06 adds monitoring and safe actions. Section 07 adds Python/Celery/Beat compatibility and data backfill. Section 08 closes tests, migration verification, manifests, and operational evidence.

## 2. Target file layout

```text
apps/web/drizzle/schema.ts                         # additive logical fields/tables
apps/web/drizzle/0303_feature_186_job_control.sql  # expand migration
apps/web/server/services/jobControlPlane.ts        # canonical service and ports
apps/web/server/services/jobCanonicalization.ts    # deterministic definition hash
apps/web/server/services/jobOutboxPublisher.ts    # publisher claim/retry/quarantine
apps/web/server/services/jobTransportAdapters.ts  # BullMQ and generic adapters
apps/web/server/services/jobReconciler.ts          # lease/outbox/recovery sweep
apps/web/server/services/jobMonitorService.ts     # canonical admin/user projections
apps/web/server/routers/workerJobs.ts              # compatibility-safe API actions
apps/web/server/jobs/jobReconcilerJob.ts           # bounded scheduler entry point
apps/web/server/scripts/backfillJobControlPlane.ts # dry-run/batched backfill
apps/web/server/services/__tests__/...             # focused contract tests
python-backend/app/services/job_control_plane.py  # Python port/client
python-backend/app/tasks/job_adapter.py            # thin Celery wrapper helpers
python-backend/tests/services/test_job_control_plane.py
specs/.../rollout-manifest.json                    # migration inventory/evidence
```

Exact names may be adjusted to match existing exports, but no new generic jobs table is permitted.

## 3. Section 01 — contracts and canonicalization

Create runtime-neutral TypeScript types for job definition, lease context, progress, result, classified error, dispatch request/reference, operator action, and schedule occurrence. Define the legal status vocabulary and transition command names in one module. The public create contract must derive tenant/actor from authenticated context; client payload cannot select an adapter or runtime binding.

Implement deterministic canonicalization for the definition hash. Normalize object keys, optional defaults, numeric and Unicode representation, bounded strings, and schedule/retry/timeout policies. Exclude idempotency key, generated IDs, timestamps, and transport references. Return a stable `IDEMPOTENCY_CONFLICT` when the tenant-scoped key already exists with a different hash. Keep all payloads bounded and redact secrets before persistence.

Tests must cover equivalent definitions producing the same hash, meaningful differences producing different hashes, tenant isolation, null versus non-null idempotency keys, malformed payload rejection, and secret/redaction rules.

## 4. Section 02 — persistence and data migration

Extend `worker_jobs` with only canonical current-state fields that are absent and safe to add: definition hash, canonical attempt/max-attempt/retry fields, execution class, fencing version, heartbeat, progress/result references, and schedule identity as required by the actual schema. Preserve existing columns and legacy enum values during expand. Extend `worker_job_events` with lifecycle event sequence and idempotency key without overloading assignment sequence.

Add companion tables for attempts, dispatch references, outbox publication, and schedule occurrence mapping. Each table must foreign-key to `worker_jobs.id`, use tenant-aware indexes, and have uniqueness constraints for attempts, event sequence, idempotency, schedule occurrence, external reference namespace, and outbox dedupe. Do not add a second status/retry/lease source.

The migration must be additive and restart-safe. Existing rows receive only deterministic metadata that can be derived from existing fields. Existing status values remain readable aliases. A batched backfill command supports `--dry-run`, bounded batch size, resume cursor, verification-only mode, and an explicit quarantine report for rows with missing tenant, ambiguous legacy binding, conflicting idempotency, or unsafe payload. It must not infer identity from queue position or issue provider calls.

Migration tests use a representative schema/data fixture and verify legacy statuses, nullable idempotency keys, existing assignment sequences, foreign-key behavior, rerun safety, rollback-safe expand behavior, and quarantine counts.

## 5. Section 03 — guarded lifecycle service

Implement repository-backed control-plane methods for create, claim, heartbeat, progress, external wait, completion, failure, cancel, retry scheduling, and reconciliation. Every mutating method runs in a transaction, checks tenant ownership and expected state, and uses attempt/lease/fencing guards. Create races on the database idempotency constraint and returns the existing job only when the definition hash matches.

Create the initial business attempt as logical attempt 1 but assign `attemptId` at the first guarded claim. A retry increments the business attempt exactly once and creates its attempt record. Lease generation/fencing is separate from business attempt. State-changing events use a per-job server sequence and stable idempotency key. Illegal transitions return stable domain errors and do not append misleading success events.

Lease renewal uses database/server time, a class-specific interval, and a hard deadline. External wait releases the active lease; callback/poll paths must reacquire a fenced lease. Results and settlement markers are written before terminal success when domain data is in another transaction. Late workers can append bounded diagnostics but cannot mutate a newer state or side effect.

Tests cover concurrent create, claim races, stale heartbeat/completion, duplicate commands, lease expiry, hard deadline, external wait/reacquisition, retry budget, illegal transitions, result immutability, and serialization/deadlock retry using the same idempotency key.

## 6. Section 04 — outbox and adapters

Implement transactional outbox insertion with job creation and `CREATED`/`QUEUED` events. The publisher claims rows with a short-lived publisher lease and fencing token, records attempt metadata, and publishes a minimal envelope containing canonical job ID, contract version, business attempt, optional attempt ID, outbox ID, stable dedupe key, and bounded routing metadata. It persists the dispatch reference and event before local acknowledgement.

Implement a provider-neutral `JobTransportAdapter` port with `supports`, idempotent `publish`, read-only `inspect`, and optional idempotent `cancel`. Add BullMQ and Celery transport implementations that store external IDs as references and never write business terminal state from broker events. Handle lost publish responses by retrying the same dedupe key; quarantine poison/unsupported rows with an operator-visible reason and bounded retry count.

Tests cover broker outage, duplicate publish, publish response loss, publisher crash/reclaim, unsupported contract, poison quarantine, adapter capability/version rejection, reference namespace uniqueness, and cancel behavior.

## 7. Section 05 — execution, scheduler, and reconciliation

Add a thin executor wrapper that claims by canonical ID, invokes the existing domain executor, and reports all heartbeat/progress/wait/result/error calls with `LeaseContext`. Add a bounded reconciler for expired leases, missing dispatch evidence, due retries, external timeout, unresolved settlement, and duplicate schedule occurrences. Reconciler work is tenant-aware, bounded per tick, idempotent, and observable.

Add scheduler occurrence validation for tenant, schedule ID/version, timezone, occurrence window, missed policy, and deterministic occurrence key. Beat/Cron only creates job intent; it never runs business logic inline. Add the web scheduled entry point and a Python-compatible scheduler hook without duplicating scheduler state.

Tests cover worker crash, event-loop stall, provider ambiguity, external callbacks, scheduler duplicate/mismatch, DST/timezone, missed occurrence policies, and reconciler boundedness.

## 8. Section 06 — monitor and security boundary

Extend the existing worker-job monitor without breaking legacy aliases. Provide cursor-paginated canonical job search, paginated event timeline ordered by lifecycle sequence, dispatch/attempt references, stale/outbox age, safe error, and explicit PostgreSQL-versus-transport observations. Add safe retry/requeue/cancel/force-fail actions only in legal states. Every operator action requires authenticated actor, tenant/elevated scope, reason, target state/attempt, action idempotency key, and one effective `OPERATOR_ACTION` event.

Preserve tenant isolation and existing auth/CSRF/rate-limit/audit boundaries. Redact payloads, provider responses, credentials, signed URLs, and arbitrary command strings. Verify provider callback signatures/replay protection and correlate callbacks to stored tenant/reference before reconciliation.

Tests cover user/admin authorization, cross-tenant denial, cursor tampering, redaction, action idempotency, illegal admin actions, callback authentication, and rate/backpressure limits. Browser coverage is required for loading, empty, error, populated, stale, and action-disabled monitor states; no new visual system is required.

## 9. Section 07 — Python/Celery compatibility and backfill

Add a Python job-control client/port using existing HTTP/config conventions. It sends canonical job IDs and bounded metadata to the web control plane, maps lease/report errors to stable domain errors, and never treats Celery task IDs as canonical. Add thin Celery wrappers for selected low-risk task classes; retain `acks_late`, prefetch, time limits, and queue routing as transport settings. `task.retry()` remains transport-only.

Add Beat migration helpers that create occurrence intents with deterministic keys and do not execute domain work inline. Inventory all direct Celery calls and write the rollout manifest listing migrated, compatibility, and intentionally unmigrated call sites. Backfill legacy task references only with a verified one-to-one binding; ambiguous records remain quarantined.

Python tests cover client failures, retry semantics, canonical-ID payloads, Beat occurrence dedupe, broker outage, and legacy compatibility.

## 10. Section 08 — verification and operations

Add focused web and Python contract suites, migration verification, fake adapters for BullMQ/Celery/Queues/Workflows/Containers/Worker App, and failure-injection tests. Add runbook/manifests describing schema migration, backup, dry-run, backfill, rollout flags, canary, producer ownership switch, drain, rollback, reconciler evidence, and production proof requirements.

Run checks in this order: focused tests per section, schema/typecheck on changed paths, migration dry-run against a test database, integration tests with `RUN_DB_INTEGRATION_TESTS=true` only when a safe test database is confirmed, then broader tests. Do not run a mutating production/local data backfill from the active `.env` without backup and explicit target verification.

## 11. Cross-cutting risks and mitigations

- Existing direct writers may bypass invariants: keep a compatibility projection and inventory, then migrate by call-site wave; add static checks for selected paths.
- Existing enum/readers may reject new statuses: expand first, write aliases until reader migration, and preserve legacy values.
- Lost external publication may duplicate paid work: stable provider/outbox idempotency keys, durable markers, and operator review on ambiguity.
- Dirty worktree can cause accidental overwrite: edit only named Feature 186 and central files whose exact hunk is owned by this feature; never format the repository globally.
- Schema change can damage real data: additive migration, backup gate, dry-run, batch/resume/quarantine, and no destructive cleanup.

## 12. Definition of done

All eight section files have implementation notes and focused tests; the additive migration is generated and verified; core service and adapters pass contract tests; monitor actions are guarded/audited; Python compatibility is tested; backfill dry-run reports complete/ambiguous counts; the rollout manifest lists every discovered direct producer; and a final spec-to-code review runs at least 10 rounds with immediate fixes for every concrete gap. Any remaining production/deployment proof is explicitly marked as an external gate, not claimed as complete.
