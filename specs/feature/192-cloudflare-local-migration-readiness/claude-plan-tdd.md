# Feature 192 TDD Plan

Tests are written before implementation for each wave. Web and Cloudflare
tests use Vitest conventions already present in the repository. Python parity
uses pytest under `python-backend`; if pytest is unavailable, the verification
command reports a prerequisite failure rather than passing silently. No
project-wide TypeScript typecheck is required under the repository RAM rule.

## Wave 0 — Inventory and ownership

- Test inventory output contains every required classification category.
- Test each remaining direct producer/consumer/status/scheduler/callback/
  poller/projection record has owner, active producer, rollback, late-delivery,
  drain, and evidence fields.
- Test Google OAuth/Drive allowlist entries are positive and Google runtime
  entries are negative/fail-closed.
- Test generated evidence contains no secret, signed URL, or database URL.

## Wave 1 — Hard-cutover startup safety

- Test hard-cutover startup does not initialize BullMQ, Celery, Cloud Run,
  Cloud Tasks, Docker, or Google runtime publishers.
- Test Media Doctor is disabled/observation-only under hard cutover.
- Test Redis outage cannot make Redis canonical for job state.
- Test each classified timer either creates canonical intent or is a documented
  non-job health/stream/cache timer; business side effects cannot run inline.
- Test Drive cleanup remains an allowed product integration while its scheduling
  path does not select retired Google infrastructure.

## Wave 2 — Canonical Worker handler

- Test valid envelope validation and rejection of unsupported contract, invalid
  IDs/attempt, oversized body/routing, unsafe values, and client routing/tenant
  tampering.
- Test internal dispatch authentication success, missing token, wrong token,
  and activation disabled behavior.
- Test deterministic duplicate outbox/dedupe publication returns the original
  disposition without a second side effect.
- Test Queue duplicate delivery, stale lease, cancellation/late delivery,
  lost acknowledgement, PostgreSQL outage, and transient transaction retry.
- Test no external operation occurs inside the canonical transaction.
- Test callback replay, invalid signature, cross-tenant reference, bounded
  quarantine, settlement retry, and redaction.
- Test separate Queue, Workflow, Container, Cron, Worker App, R2, and
  Vectorize fakes, including Vectorize tenant filter/delete ownership and
  checkpoint/rebuild behavior.

## Wave 3 — Scheduler and provider admission

- Test duplicate schedule occurrence returns the same canonical job.
- Test same occurrence with changed definition returns idempotency conflict.
- Test timezone/DST and missed-occurrence policy behavior.
- Test every business scheduler creates canonical intent and does not execute
  provider/billing/notification/cleanup work inline.
- Test provider saturation accepts canonical creation and leaves work queued.
- Test account/user/rate-window/running reservations, fairness cooldown,
  restart recovery, and release only after terminal provider evidence.
- Test waiting-external releases lease, persists operation key/deadline/fence,
  and polling/callback does not consume a generation token or resubmit.

## Wave 4 — Compatibility drain closure

- Test the direct-call inventory has no unapproved migrated producers.
- Test legacy status projection and canonical status cannot disagree.
- Test late legacy delivery after cancellation/expiry/terminal failure is a
  no-op or quarantine observation.
- Test provider operation key reuse after ambiguous delivery.
- Test exactly one side-effecting producer per job type and rollback preserves
  canonical job identity/history.

## Wave 5 — Migration reconciliation

- Test journal-authoritative reconciliation distinguishes current, historical,
  superseded, missing, and orphan SQL without relying on file counts.
- Test dry-run, resume, bounded failure, quarantine, and rerun safety.
- Test legacy status aliases, nullable idempotency, event sequence, attempts,
  dispatches, outbox, settlement/callback/action foreign keys, tenant indexes,
  delete behavior, and no second status/retry/lease/job ledger.
- Test no external provider call and no production mutation occur in verifier
  mode.

## Wave 6 — Failure tests, Python parity, and CI

- Test the fixed ESM/CommonJS import boundary for focused web job-control tests.
- Test Python dispatcher/reporter envelope parity and fencing fields.
- Test both hard-cutover flags select PostgreSQL-pull worker and reject Celery,
  Beat, Docker, Cloud Run, and copied-payload fallback.
- Test Python provider operation persistence, waiting-external lease release,
  durable polling, and ambiguous-response no-resubmit behavior.
- Test Queue duplicates, lost publish response, lease expiry, callback replay,
  provider 429/5xx, settlement retry, SQL serialization/deadlock retry, Redis
  outage, and Hyperdrive failure.
- Test the focused verification command fails explicitly for missing pytest or
  database prerequisites.

## Wave 7 — Evidence and handoff

- Test readiness manifest remains activation disabled with local contract true,
  target/production proof false, and Google OAuth/Drive product integration
  allowed.
- Test evidence includes command/result/build/schema/journal/commit/worktree
  identity, timestamp, owner, and reviewer without secrets.
- Test deployment dry-run validates required environment/binding/rollback/
  evidence fields and never deploys or requests credentials.
- Test numeric budgets and 13-source/four-index Vectorize inventory.
- Test backup/PITR is recorded as external blocked evidence; local replay is
  not accepted as restore rehearsal.
- Test the final spec-to-code gap report records unresolved external gates
  separately from local failures.
