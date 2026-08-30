# Section 05 — Guarded Runs, Scheduler, and Admin Procedures

## Objective

Provide one observable, safe execution path for Admin-confirmed manual runs and
daily automatic runs.

## Scope and ownership

Refactor the current synchronous `runCapacityAssessment` into a durable lifecycle
(`requested`, `collecting`, `assessing`, `completed`, `failed`) with requester,
trigger, timezone, timestamps, duration, error class, and policy/collector
versions. The Admin mutation confirms/enqueues and returns run identity/status;
it does not wait indefinitely for LLM completion.

Add deployment-scoped lock/idempotency key, timeout, bounded retry/backoff, and
stale-running recovery. Both triggers invoke the same worker handler. Scheduler
startup/Redis/LLM failure must not block web startup; persist attempt/last
success/next expected run and avoid duplicate retries. Retention cleanup should
be part of a safe scheduled maintenance path or a bounded post-run action.

Keep procedures Admin-only and add manual confirmation/audit event where existing
audit conventions support it. Return safe error classes, never provider secrets.

## TDD first

Test permission denial, one-run idempotency, overlapping manual/scheduled calls,
lifecycle transitions, timeout/retry/failure, stale lock recovery, scheduler
startup failure, trigger/timezone metadata, audit events, and retention execution.

## Acceptance

Daily and manual runs are behaviorally identical after trigger metadata. A slow
LLM cannot hold an HTTP request forever or create concurrent spend. Admin can see
progress/failure/history and retry safely.

## Dependencies

Sections 01, 03, and 04. Blocks final UI run state and integration proof.

## UI/UX Contract

N/A for execution plumbing; run-state presentation is specified in section 06.

### Target User / JTBD

N/A — no browser surface changes.

### Surface Inventory

N/A — no browser surface changes.

### Component Map

N/A — no browser components.

### State Matrix

N/A — no browser states.

### Responsive Matrix

N/A — no layout changes.

### Accessibility Acceptance

N/A — no user-facing markup.

### Copy Contract

N/A — no user-facing copy.

### Browser Evidence Required

N/A — browser proof is owned by section 06 and 08.
