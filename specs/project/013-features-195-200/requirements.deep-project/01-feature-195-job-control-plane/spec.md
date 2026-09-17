# Feature 195 — Job Control Plane Planning Spec

## Goal

Plan and implement the durable execution control plane so every long-running task has one PostgreSQL `worker_jobs` record, transactional outbox intent, bounded retry, lease/fencing, event history and observable terminal projection.

## Scope

In scope: existing `worker_jobs` evolution, attempts, dispatches, provider reservations, outbox publication, queue lanes, admission, retry/DLQ, capacity and lease rules, monitoring APIs/UI integrations and Feature 196/197 contracts. Out of scope: Goal/Plan semantics, Chat UX, MCP upstream lifecycle and External Agent provider logic.

## User-Facing Behavior

Users can submit long-running work, see durable queued/running/waiting/failed/completed states, retry or cancel when authorized, and receive truthful progress. A queue or runtime outage does not erase an admitted Job or falsely reject a valid durable admission.

## Technical Constraints

Use Drizzle/PostgreSQL and existing Web/Worker service conventions. `worker_jobs.id` is canonical; queue messages are dispatch envelopes. Use server-derived tenant authority, idempotency keys, bounded retries, lease fencing, append-only events and no secrets in payloads/logs. Cloudflare Queues/Containers are approved runtime boundaries. Do not run whole-repository typecheck.

## Dependencies

Inputs: current `apps/web/drizzle/schema.ts`, existing worker scheduler/control-plane services, current migrations and Feature 186 foundations. Consumers: Features 196–200 use Job admission, status, cancellation and result contracts.

## Outputs

Produces canonical Job/outbox/attempt/dispatch/reservation contracts, lifecycle transitions, retry/lease helpers, publication/reconciliation interfaces, focused API/service tests and migration/rollback evidence.

## Edge Cases

1. Database commit succeeds but queue publication fails; the outbox remains recoverable and the Job is not rolled back.
2. A stale lease holder reports success after another attempt owns the fence; stale side effects are rejected.
3. Duplicate browser/provider webhook delivery must converge to one idempotent transition.
4. Provider capacity is unavailable while a valid Job remains durably admitted.

## Error Handling

Classify admission, publication, dispatch, provider, execution and terminal errors separately. Persist retryable failures with bounded backoff and a next-attempt timestamp; route exhausted work to DLQ/terminal state; expose recovery readiness without fabricating completion.

## Testing Expectations

Add focused Drizzle/migration contract tests, service lifecycle tests, outbox/consumer dedupe tests, lease/fencing race tests, retry/DLQ tests, tenant authorization tests, route contract tests and targeted UI state tests. Run package-local tests and static checks; do not run repository-wide typecheck.

