# Decision Log

## Planning depth

- Depth: standard
- Reason: bounded feature touching queue service, router transport, client
  orchestration, lifecycle wiring, and focused tests without a schema change.

## Decisions

1. Use Redis + BullMQ following the existing story-job pattern.
2. Preserve the current prompt mutation body as an exported worker executor.
3. Submit returns `{ jobId, status, deduped }`; a separate query returns job
   status and the old prompt result on success.
4. Dedupe active work per tenant/user/series/episode/shot and support an exact
   client idempotency key.
5. Use polling rather than WebSocket/SSE.
6. Use one queue attempt to avoid blind duplicate paid work.
7. Avoid a DB migration; prompt durability remains in episode JSONB.

## Stabilization review

- Round 1: `[AUTO-FIX]` Added shot number to active-key scope so a multi-shot
  batch does not collapse into one job.
- Round 2: `[AUTO-FIX]` Added queue-dispatch terminal failure handling to avoid
  permanently queued records.
- Round 3: `[AUTO-FIX]` Added ownership validation for status and active-job
  recovery.
- Round 4: `[AUTO-FIX]` Disabled blind worker retries because prompt generation
  can consume credits before a process failure.
- Round 5: Clean — completeness, contradictions, security, and obvious gaps.
- Round 6: Clean — second consecutive clean review; plan stabilized.

## Promotion triggers

Promote if implementation requires a schema migration, a cross-process
exactly-once credit ledger, or a realtime push channel. None is required for
the approved flow.
