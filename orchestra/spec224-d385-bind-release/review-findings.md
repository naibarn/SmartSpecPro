# Targeted Review — Spec 224 Bind/Release Recovery

## Round 1 — binding immutability and release idempotency
- Finding fixed: a persisted manifest/projection binding could be replaced; added a fail-closed predicate that permits first bind only for an unbound pending job and retries only when both copies equal the candidate.
- Finding fixed: duplicate release trusted queued status alone; release event now stores a stable binding digest, and replay requires the same digest. Queued without a release event is rejected as ambiguous.
- Gates: focused Vitest 7 files / 102 passed; Prettier and `git diff --check` passed.
- Status: clean for local contract behavior; PostgreSQL crash/concurrency proof remains open.

## Round 2 — tenant, cross-record, and replay review
- Confirmed reads/writes remain scoped by job ID, tenant ID, and actor ID in authorization persistence; canonical release verifies run/manifest/job/tenant/actor/workspace relationships before changing status.
- Confirmed status transition, release event, queued/dispatch events, and outbox insertion remain within the existing control-plane transaction; no new queue, ledger, or authority was added.
- Confirmed binding identity is stable across object key ordering; null, nested, non-finite, conflicting digest input, and queued-without-event states fail closed.
- Round 2 reviewed the canonical digest comparison after the final code adjustment; fresh focused tests, format, and diff checks were rerun afterward.
- Status: targeted conductor review clean; not an independent reviewer result or PostgreSQL evidence.
