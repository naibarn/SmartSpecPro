# Feature 186 Synthesized Specification

## Objective

Create a runtime-neutral Job Control Plane on top of the existing PostgreSQL `worker_jobs` and `worker_job_events` tables. The control plane owns canonical lifecycle state, business retries, idempotency, application leases, event history, recovery, and domain settlement coordination. BullMQ, Celery, Celery Beat, Cloud Tasks-compatible schedulers, Worker App, and future Cloudflare Queues/Workflows/Containers are replaceable adapters.

## Required outcomes

- `worker_jobs.id` is generated before dispatch, immutable, never reused, and is the only canonical job ID.
- PostgreSQL current state plus append-only events survives broker loss, worker loss, duplicate delivery, ambiguous provider responses, and restart.
- Existing legacy status values remain readable while a single canonical status projection is introduced; no parallel generic `jobs` table is created.
- All accepted state changes are guarded by tenant scope, expected status, attempt, lease token, and fencing version as applicable.
- Business attempt/retry state is centralized; transport retries and provider polling do not silently consume business retry budget.
- Creation and publication use a transactional outbox with stable dedupe keys and bounded publisher leases.
- External waits release execution leases and later reacquire a fenced lease before progress/result/terminal mutation.
- Admin/user monitoring exposes canonical state and safe, audited, idempotent actions without leaking payloads or credentials.
- Existing legacy jobs are inventoried and backfilled only when identity can be proven; ambiguous in-flight jobs are quarantined for operator review.
- The implementation is testable with fake transports and has a staged route toward Cloudflare without coupling domain services to provider APIs.

## Constraints

Use existing Drizzle schema and migration numbering, existing TypeScript/Vitest and Python/pytest conventions, and preserve all unrelated dirty worktree changes. The configured `.env` is not changed. A data-mutating database migration requires a verified backup and an explicit execution gate; implementation includes dry-run and verification tooling first.

## Acceptance boundary

The first implementation must deliver the control-plane core, additive schema, migration/backfill tooling, BullMQ and Celery adapter ports, worker-facing reporter/reconciler paths, monitoring API integration, and focused tests. It must not claim that every historical producer has been cut over or that Cloudflare production deployment is complete; each remaining direct producer is recorded in the rollout manifest and can migrate in a later bounded wave.
