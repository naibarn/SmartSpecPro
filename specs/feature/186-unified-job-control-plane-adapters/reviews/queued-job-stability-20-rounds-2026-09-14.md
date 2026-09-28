# Feature 186 queued-job stability audit — 20 rounds

**Date:** 2026-09-14
**Scope:** PostgreSQL canonical job ledger, outbox publication, active queued/non-terminal jobs, Node/Python runtimes, legacy compatibility, and replacement readiness.
**Environment:** local mini-server runtime and its configured PostgreSQL instance.
**Decision:** `NOT_READY_FOR_LEGACY_REPLACEMENT`

This review is an evidence audit. It does not claim production recovery,
target-account Cloudflare readiness, provider recovery, or PITR readiness from
local tests. No ambiguous provider job was blindly retried.

## Loop ledger

| Round | Surface checked | Result | Evidence / finding |
|---:|---|---|---|
| 1 | Canonical job inventory by status/runtime | FINDING | 519 jobs; 2 non-terminal jobs remain (`tenant_data_transfer` queued and `storyboard.skill.run` waiting external). |
| 2 | Queued-job age and ownership | BLOCKED | The queued transfer job is old and tenant-bound; it is not eligible for an automatic retry because its transfer handler/adapter contract is not enabled. |
| 3 | Queued-to-outbox completeness | PASS | No non-terminal queued/pending/retry job lacks an outbox or has an active unpublished outbox after the quarantine exclusion is applied. |
| 4 | Queued dispatch completeness | PASS | The waiting storyboard job has consumed dispatch evidence for attempts 1 and 2; the transfer job has no dispatch, as expected for quarantine. |
| 5 | Lease/stale-job sweep | PASS | No stale lease was left active after the earlier recovery; the storyboard attempt is in `waiting_external`, not holding an execution lease indefinitely. |
| 6 | Retry schedule and attempt ownership | PASS | Attempt numbers are unique per canonical job; broker/provider polling did not create phantom business attempts. |
| 7 | Quarantine and cancellation semantics | FINDING → FIXED | Quarantined outbox evidence existed, but the parent job review flag was false. Code and data repair now set `operatorReviewRequired=true` with the bounded reason. |
| 8 | Outbox state distribution | FINDING | 2 published outboxes and 1 quarantined outbox; the quarantine is the Feature 189 transfer boundary, not a transport outage. |
| 9 | Companion table inventory/orphan scan | PASS | Attempts, dispatches, outbox, settlements, actions, callbacks, and schedule-occurrence tables exist; no orphan attempts/dispatches/outbox rows were found. |
| 10 | Event sequence legacy profile | FINDING | 138 events across 10 legacy jobs have `eventSequence=NULL`; they are legacy progress/completion/failure events and cannot provide a totally ordered timeline until a migration/backfill policy is accepted. |
| 11 | Assigned event-sequence uniqueness | PASS | 0 duplicate non-null `(workerJobId,eventSequence)` values and 0 duplicate non-null event idempotency keys. |
| 12 | Foreign keys and deletion rules | FINDING | Job-linked lifecycle tables use `RESTRICT`; `worker_job_grants` still has cascade rules, currently with 0 rows. This requires retention/privacy review before broad tenant deletion. |
| 13 | Settlement marker coverage | BLOCKED | `worker_job_settlements` has 0 rows while 517 jobs are terminal. This is not proof that every job requires a settlement marker, but required-effect classification and coverage evidence are absent. |
| 14 | Callback/action idempotency constraints | PASS (structural) | Durable action key uniqueness and provider/replay callback uniqueness are present; no rows currently exercise the path, so production replay evidence remains open. |
| 15 | Schedule occurrence and enum state | FINDING | 0 duplicate/orphan schedule occurrences; however system schedules log disabled because `FEATURE_186_SYSTEM_TENANT_ID` is not configured. Canonical enum contains both legacy and target aliases. |
| 16 | Tenant/runtime/policy integrity | FINDING | No missing tenant/job type/contract/retry JSON; 10 legacy jobs lack `definitionHash`, all completed/failed remotion jobs. Backfill is needed before strict idempotency claims for legacy rows. |
| 17 | Node worker/service freshness | PASS with operational risk | Node PostgreSQL-pull worker is active and enabled with the expected systemd command and env file. Historical startup/restart behavior shows long stop/restart windows that need deployment rehearsal. |
| 18 | Python worker/Celery boundary | BLOCKED | Python PostgreSQL-pull worker code and tests exist, but no running `postgres_job_worker` service was found; Celery media/Beat processes are still active and the Python hard-cutover flag is not enabled. |
| 19 | Static call-site and readiness verifier | PASS (structural) | Direct unowned BullMQ/Celery producers: 0; unowned side-effecting producers: 0; adapter-owned: 47; legacy adapter transport: 3; centralized compatibility status readers: 7. Feature verifier returns `productionReady=false`. |
| 20 | Post-fix final recheck | PASS for safety, NOT READY overall | Active jobs: 2; queued review-blocked: 1; active unpublished non-quarantined outbox: 0; quarantined jobs missing review flag: 0; duplicate assigned sequences: 0. Replacement gate remains blocked by the items below. |

## Changes made during this audit

- Updated `apps/web/server/services/jobOutboxPublisher.ts` so every outbox
  quarantine path also marks the canonical job as operator-review-required in
  the same PostgreSQL transaction as the outbox/event update.
- Added a bounded pure helper and regression coverage in
  `apps/web/server/services/__tests__/jobOutboxPublisher.test.ts`.
- Reconciled the existing quarantined transfer row without dispatching it or
  changing its business status. It now truthfully remains `queued` with
  `operatorReviewRequired=true` and reason `adapter_contract_unsupported`.

## Replacement blockers

These are gates, not reasons to run blind retries:

1. Feature 189 transfer execution/handler registration is not enabled for the
   queued `tenant_data_transfer` job. Owner: Feature 189; disposition is
   quarantine/operator review.
2. Python PostgreSQL-pull runtime is not deployed/running, so the current
   system still depends on Celery for Python execution. Owner: Feature 186
   runtime/deployment.
3. System schedules are disabled until an approved system tenant is configured
   and verified. Do not invent a tenant ID in configuration. Owner:
   deployment/platform operations.
4. The storyboard provider result remains ambiguous. Provider operation status
   or operator evidence is required before resume; no duplicate provider call
   is authorized by this audit.
5. Legacy null event sequences, legacy status-reader drain, settlement and
   domain projection/checkpoint evidence, provider recovery integration,
   deployment recovery, and PITR restore rehearsal are not complete.
6. Cloudflare target-account connectivity/capability/rollback/recovery proof
   is absent; local adapter mocks are not a cutover proof.

## Verification run

- Node focused tests: **40 passed** across the control-plane, outbox, and
  Node deployment wiring suites.
- Python focused contract tests: **11 passed** with `--no-cov`. The normal
  command also ran all 11 tests but exits non-zero because the repository-wide
  coverage gate reports 14.45% against its 80% threshold; this is a coverage
  gate result, not a failed assertion.
- `git diff --check`: passed.
- Feature 186 structural verifier: completed and returned
  `productionReady=false` with explicit blockers.

## Exit decision

The canonical queue is safe against the audited failure modes for the current
local evidence: no active orphaned publication, no duplicate assigned event
sequence, and quarantined work is now visibly blocked for review. It is not
stable enough to replace Redis/BullMQ/Celery system-wide until the replacement
blockers have owners, deployment/recovery evidence, and accepted drain gates.
