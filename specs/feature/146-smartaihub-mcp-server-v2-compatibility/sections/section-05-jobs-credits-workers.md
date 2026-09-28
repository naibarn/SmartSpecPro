# Section 05 — Async jobs, idempotency, credits, workers, and uploads

## Scope

Own MCP adapters over existing media/Remotion/worker/credit/artifact services.
Do not add a competing job or credit source of truth.

## Required design

Normalize existing IDs into a projection containing kind, status, progress,
credit amounts, public error, result reference, and cancellation capability.
Retain authoritative IDs internally and reject cross-kind guesses.

For mutations, normalize/hash input, enforce idempotency, estimate using the
server model registry, atomically reserve/create or reuse the authoritative job,
publish the existing outbox/queue event, and return immediately. Reuse Feature
145's worker lease, progress, artifact init/upload/complete, checksum, R2,
publication, media-history, and billing reconciliation paths.

The current outer MCP Redis replay cache is best-effort and cannot establish
exactly-once business effects. Each mutating tool must use the existing durable
tenant/owner-scoped idempotency/job/credit record; a same key with a different
request hash is a conflict, and Redis loss must not cause a second generation.
Modern idempotency keys must be based on authenticated principal + tenant +
canonical tool + normalized request hash, never on a legacy MCP session ID.

Before mutation, validate model capability, provider connection state, quota,
concurrency, maximum credits, and any explicit expensive-action confirmation.

Job state transitions must be monotonic and terminal states immutable except for
an explicit reconciliation transition. A submitted request must not be counted
as completed until the artifact publication/checksum and billing outcome are
durable.

Do not advertise Tasks or subscriptions until durable mapping, restart recovery,
ownership, cancellation, fanout/backpressure, and failure tests exist. Phase 1
uses job_id plus status polling/backoff hints.

Redis may hold ephemeral rate/cache/session/grant data only. DB/job/credit/
artifact/device records remain authoritative.

Run a live-schema/Drizzle-ledger preflight before adding a migration. Define
retention/reconciliation for sessions, idempotency cache, download grants,
artifacts, audit events, and abandoned credit reservations without deleting
user-visible media or billing evidence.

## TDD contract

Test duplicate submit, same-key/different-hash, credit race, DB rollback, queue
failure, worker crash, duplicate callback, R2 failure, cancellation, result
publication, status ownership, and Worker App parity for a completed Remotion
video.

## Exit criteria

MCP and web/Worker App produce the same durable job, credit, artifact, history,
and ACL-visible output; no double charge, orphan reservation, or lost completed
file is possible under tested failures.

## Implementation status — 2026-08-17

The MCP additions reuse existing durable services. Remotion guide aliases use
the owner/tenant-scoped worker-job projection, and image/video/credit calls
continue through canonical registry handlers. No new Redis-backed source of
truth, queue, credit ledger, artifact table, or upload path was introduced.

Durable retry/settlement, worker lease, R2 checksum/publication, Media History
registration, and Windows/macOS executor parity still require Feature 145
integration and native evidence gates.
