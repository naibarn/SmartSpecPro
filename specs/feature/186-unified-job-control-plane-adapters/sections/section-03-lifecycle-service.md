# Section 03 — Guarded Lifecycle Service

## Goal

Make PostgreSQL the owner of current job state, business retry, lease/fencing, event history, and durable settlement coordination.

## Files

- Add `apps/web/server/services/jobControlPlane.ts` with dependency-injected repository/clock/policy ports.
- Add `apps/web/server/services/__tests__/jobControlPlane.test.ts`.
- Add only focused compatibility calls in existing producers after their exact contracts are verified.

## Requirements

Implement create, claim, heartbeat, progress, external wait, complete, fail, cancel, retry scheduling, and reconcile. Create races on tenant-scoped idempotency and compares definition hash. Initial business attempt is 1; claim creates `attemptId`; retry increments exactly once. Every mutation guards expected status, job/tenant, attempt, lease token, and fencing version where relevant, updates current state, and appends an idempotent event in one transaction. Use server time, hard deadlines, result immutability, and stable domain errors for illegal transitions.

## TDD acceptance

Cover concurrent create/claim, duplicate commands, stale lease writes, lease expiry, retry budget, external lease release/reacquisition, terminal immutability, cancellation races, serialization retry, event sequence monotonicity, and domain settlement marker recovery.
