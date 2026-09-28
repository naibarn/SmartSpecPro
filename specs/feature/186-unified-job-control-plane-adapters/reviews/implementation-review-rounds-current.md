# Feature 186 implementation review — current convergence run

> Superseded by `implementation-review-rounds-final.md`, the final ten-round
> review for the current implementation slice.

Date: 2026-09-12
Scope: compare the implemented control plane with `spec.md`; fix safe in-scope gaps immediately.
Mode: inline sequential conductor review because SocratiCode and sub-agent tooling were unavailable.

## Round 01 — persistence and migration shape

- Evidence: `0303_feature_186_unified_job_control_plane.sql`, `schema.ts`, migration contract test, local PostgreSQL introspection.
- Finding: canonical tables/columns/indexes were additive and existing `worker_jobs`/`worker_job_events` remained the ledger. No destructive SQL was found.
- Fix: retained the existing design; added a follow-up additive `0304_feature_186_contract_version.sql` when later rounds found version persistence missing.
- Gate: migration test and `verify:feature-186` passed.

## Round 02 — canonical ID, idempotency, and definition hash

- Evidence: `jobControlPlane.ts`, `jobCanonicalization.ts`, idempotency tests, local backfill counts.
- Finding: implementation uses `worker_jobs.id` before publication and hashes a deterministic definition. Idempotency key normalization was not explicit enough.
- Fix: added trim + NFC normalization, runtime bounds, and conflict-safe lookup/storage.
- Gate: canonicalization/control-plane tests passed.

## Round 03 — state machine and guarded transitions

- Evidence: all control-plane transition methods and lifecycle tests.
- Finding: terminal states, stale lease writes, retry state, cancellation, external wait, and deadline transitions are guarded by status/attempt/fence checks.
- Fix: added explicit two-step cancellation methods (`requestCancel`/`finalizeCancel`) and audited `forceFail`; `cancel` remains a compatibility convenience that invokes both.
- Gate: lifecycle tests passed with cancellation and force-fail idempotency coverage.

## Round 04 — lease, heartbeat, fencing, and deadlines

- Evidence: lease hash/fencing predicates, lease expiry recovery, `leaseDurationMs`, reconciler candidate sweep.
- Finding: lease duration was previously one hard-coded value and queued/retry-scheduled jobs could outlive their absolute deadline without a heartbeat.
- Fix: added execution-class lease defaults/env bounds and guarded `expireDeadline` reconciliation for non-terminal queued/leased/retry states.
- Gate: hard-timeout and queued-deadline tests passed; stale writes remain rejected.

## Round 05 — retry, timeout, and business-attempt ownership

- Evidence: `fail`, `recoverExpiredLease`, retry policy validation, attempts/outbox assertions.
- Finding: recovery outbox scheduling used a different default delay from the persisted policy delay, and recovery did not always emit `DISPATCH_REQUESTED`.
- Fix: compute one policy-derived delay and reuse it for `nextRetryAt` and outbox; add dispatch-requested events for retry/recovery.
- Gate: retry tests passed; business attempt increments remain single-control-plane transitions.

## Round 06 — transactional outbox and publication safety

- Evidence: publisher lease/fencing, dispatch/event persistence, quarantine paths, adapter reference checks.
- Finding: unclaimed/quarantined rows could miss `DISPATCH_FAILED`; an adapter could return a mismatched canonical ID/dedupe/reference namespace.
- Fix: quarantine now appends a failure event transactionally; publication rejects/quarantines mismatched adapter references. Added explicit resolver hook for runtimeType-to-adapter routing.
- Gate: outbox code inspection and migration/event tests passed.

## Round 07 — BullMQ/Celery/future transport boundary

- Evidence: `jobTransportAdapters.ts`, fake adapter tests, Python task/client.
- Finding: Celery executor selection trusted producer-supplied `job_type`, which could diverge from PostgreSQL.
- Fix: added authenticated internal `context` endpoint/client and changed the thin Celery task to load server-owned job type/context after claim; payload remains canonical-ID based.
- Gate: Python compile and adapter tests passed.

## Round 08 — scheduler and external orchestration

- Evidence: scheduler adapter, occurrence uniqueness, external wait/resume methods.
- Finding: caller-controlled idempotency could create an orphan scheduled job; occurrence hash omitted schedule metadata; external resume could claim inline.
- Fix: enforce deterministic schedule idempotency, hash the complete scheduled definition, return the existing occurrence job ID, and resume through `RECOVERED` + outbox instead of inline claim. Expired external waits fail closed to operator review when provider inspection is unavailable.
- Gate: scheduler/control-plane tests passed.

## Round 09 — security, tenant scope, admin, and payload safety

- Evidence: `adminProcedure`, internal token route, actor propagation, redaction/bounds, runtime definition validation.
- Finding: admin monitor lacked execution-class filter, overview counts, force-fail, and actor audit propagation; result/error/progress bounds were incomplete.
- Fix: added monitor overview, `executionClass` filter, `force_fail`, actor IDs in operator events, bounded payload/result/error/external-wait validation, and server-owned context loading.
- Gate: router/control-plane tests, migration verifier, Python compile, and diff check passed.

## Round 10 — migration execution, operational truth, and legacy inventory

- Evidence: repo migration runner, local PostgreSQL counts, backfill script, call-site audit, runbook/manifest.
- Finding: local data had new legacy rows/events appear while backfill was running; audit must not falsely claim all queues migrated.
- Fix: made event backfill transactionally serialized per job; reran bounded apply until the checked snapshot had zero missing hashes/sequences/keys; audit reports 52 direct legacy transport call sites and `migratedWave: []` truthfully.
- Gate: `db:migrate` applied 0304 successfully; latest local migration hash matched the file; additive verification passed.

## Round 11 — clean regression round

- Evidence: 8 Feature 186 test files, 31 tests; migration verifier; Python compile; call-site inventory; JSON journal validation; diff check.
- Finding: no new material gap after Round 10 fixes.
- Fix: none.
- Status: CLEAN.

## Round 12 — clean data/convergence round

- Evidence: final local PostgreSQL invariant query and repeat bounded backfill check after all code/schema changes; no provider calls or paid side effects.
- Finding: no new material gap; the final snapshot reported zero missing hashes/sequences/keys and zero duplicate event sequences/attempts.
- Fix: final bounded backfill updated 2 newly-created legacy jobs and 28 legacy events before the zero-gap snapshot.
- Status: CLEAN.

## Convergence result

- Rounds run: 12 (minimum requested: 10).
- Clean consecutive rounds: 2 (Rounds 11–12).
- Must-fix findings: fixed in Rounds 02–10.
- Safely deferred: adapter-by-adapter migration of the 52 legacy direct call sites and production Cloudflare account/deployment proof; both are explicit Feature 186 rollout/external gates.
