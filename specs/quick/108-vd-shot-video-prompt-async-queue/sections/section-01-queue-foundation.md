# Section 01 — Queue Foundation

## Ownership

Own `apps/web/server/services/verticalDramaShotVideoPromptJobs.ts` and its
focused tests. Do not change prompt content rules here.

## Work

- Add Redis record/adapter types and opaque key helpers.
- Add request fingerprinting excluding idempotency key.
- Add atomic admission semantics for idempotency, active-shot dedupe, and
  per-episode sequence assignment.
- Add BullMQ queue/worker initialization, bounded concurrency, per-episode
  lease, FIFO gate, fail-fast enqueue, terminal writes, and shutdown.
- Keep logical attempts at one and make stale running jobs safely terminal
  without blind paid re-execution.

## TDD

Use injected Redis, queue, clock, and executor dependencies. Cover successful
admission, dedupe, conflicts, sequence order, parallel scopes, enqueue failure,
terminal pointer safety, and stale lease behavior.

## Acceptance

No network/provider is required for unit tests. Queue records are bounded and
do not log prompt contents. The service can be imported without starting a
worker until explicit initialization.
