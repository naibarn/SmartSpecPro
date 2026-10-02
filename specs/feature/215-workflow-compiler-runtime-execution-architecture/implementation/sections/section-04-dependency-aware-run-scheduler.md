# Section 04 implementation record — dependency-aware run scheduler

Status: partial / in progress.

## Implemented locally

- Initial run admission includes only ready roots; non-ready selected nodes are stored as pending.
- Successful fenced settlement makes successors ready only after every pinned predecessor has committed an artifact reference.
- Successor dispatch recalculates predecessor refs from durable logical node rows and uses the canonical Feature 195 gateway.
- Added a durable `dispatching` claim state with tenant/run/status compare-and-set before successor job creation. Retries can revisit `dispatching` rows and recreate the same deterministic attempt/job key, allowing recovery after a process stop between canonical admission and logical linkage without creating a second canonical job.

## Verification

- Existing focused runtime, settlement, and router contract tests cover root readiness, predecessor output requirements, and canonical idempotency.
- Schema/migration assertions now include the `dispatching` state. A database concurrency/fault-injection test is still required for full proof of the compare-and-set behavior.

## Remaining acceptance gaps

- Initial run, logical rows, canonical job creation, and outbox intents are not one database transaction; no scheduled reconciliation sweep handles a crash before the first root is linked.
- Trigger occurrence/schedule revision/deadline/timezone are not implemented as workflow activation semantics.
- Runtime adapter/bootstrap absence continues to block actual workflow admission.
