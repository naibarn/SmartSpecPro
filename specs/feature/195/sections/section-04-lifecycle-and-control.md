# Section 04 — Lifecycle, Retry, Control and Nested Execution

## Source coverage

Feature 195 sections 77–117, 157–239 and 251–290; lifecycle states, attempts, retry/DLQ, control commands, nested Jobs, approvals, quality, compensation, billing hooks, artifacts and Runner/MCP/Agent integration.

## Deliverable

Implement lease/heartbeat/expiry/fencing, cancellation/pause/resume/steer, child lineage/budget/cycle guards, approval propagation, quality-gate terminal semantics and immutable provenance/recovery events.

## Files

- Modify: `apps/web/server/services/jobControlPlane.ts`, monitor/control helpers, `apps/web/server/routers/workerJobs.ts`
- Test: lifecycle, control, race, nested-budget and artifact-lineage tests

## TDD steps

1. Add failing race and boundary tests before changing lifecycle code.
2. Run focused tests and confirm failure at the intended decision point.
3. Implement atomic conditional transitions and idempotent control mutations.
4. Rerun tests, then inspect event order and stale side-effect behavior.

## Completion gate

Every terminal state has a durable reason/evidence; stale attempts cannot commit side effects.

