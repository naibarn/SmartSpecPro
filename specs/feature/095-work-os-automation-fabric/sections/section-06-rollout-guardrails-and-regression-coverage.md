# Section 06 - Rollout, Guardrails, and Regression Coverage

## Goal

Ship the automation fabric safely by staging rollout, enforcing guardrails, and covering the first workflow family with regression tests.

## What this section must deliver

- A staged rollout order that starts with read-only projections and manual assist.
- Guardrails that keep ownership, approval, checkpoint, and exception state inside the Work OS boundary.
- Tenant isolation coverage across the fabric.
- Idempotency protection for retries and resumes.
- Regression coverage for adapter routing, checkpoint resume, and the first release workflow family.

## Files likely to change

- Rollout and feature-flag helpers
- Work OS service and router tests
- Adapter policy helpers
- Any release gate or safety helper used by the orchestration path

## Implementation notes

- Roll out in slices:
  1. canonical run envelope and read-only projections
  2. mode selection and checkpoint state
  3. execution adapters
  4. human edit / approval / resume flow
  5. evidence surfacing and operator dashboards
  6. safety gates and idempotency protection
- Keep manual assist usable through the entire rollout.
- Require an allowlist for external side-effect steps.
- Treat retries and resumes as dedupe-sensitive operations.

## Expected behavior

- Unsafe or unsupported steps fail closed.
- Repeated retries do not create duplicate media, exports, or approvals.
- Legacy users can still use the older surfaces while the fabric is introduced.

## Test expectations

- Tenant isolation tests.
- Legacy compatibility tests.
- Allowlist and policy-gating tests.
- Retry/idempotency tests.
- End-to-end regression coverage for the first workflow family.

## Risks to watch

- A hidden mutation path bypassing the canonical boundary.
- Duplicate side effects on retry or resume.
- Shipping higher autonomy before the safety gates are in place.

## Implementation Result

The rollout and guardrail slice is now partially enforced by runtime contracts and tests:

- The automation fabric persists canonical run state, mode transitions, checkpoints, and policy snapshots in the database instead of relying on ad hoc state.
- Surface allowlists and mode-transition checks fail closed in the policy layer before a run or step can advance.
- Regression coverage now includes the canonical run model, policy resolution, step-route preview, checkpoint resume behavior, browser adapter queuing, browser claim reconciliation, and real adapter execution dispatch with idempotent replay coverage.
- Browser/external automation now has a durable claim row plus polling/reconciliation path so retries do not create duplicate launches and terminal completion can be observed even after process restarts.
- A background browser-automation reconciler job now polls pending claims on a timer during server startup, so completion state converges automatically even if no operator opens the Work OS console.
- The Work OS console and Monitoring UI now surface run summary, checkpoint resume, and browser automation health so operators can understand and control the fabric without leaving the admin surfaces.
