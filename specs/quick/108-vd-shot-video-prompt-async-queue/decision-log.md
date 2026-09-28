# Decision Log

## Depth

`standard` quick plan. The change spans a queue service, router transport,
client polling/state UX, and regression tests, but it can reuse existing Redis/
BullMQ infrastructure and needs no schema migration.

## Decisions

1. Use a dedicated BullMQ queue with Redis job records and a per-episode FIFO
   sequence/lease. Use bounded worker concurrency across unrelated episodes.
2. Keep the existing mutation input and route name, but make its result an
   admission acknowledgement. Extract the current executor so business logic
   tests remain direct and do not depend on BullMQ.
3. Use meaningful-input request fingerprints excluding `idempotencyKey`.
   Same active shot + same fingerprint joins; same active shot + different
   fingerprint returns conflict.
4. Do not blindly retry LLM jobs because provider calls can consume credits or
   persist before a worker/network failure is observed.
5. Poll server-owned status from the page and invalidate episode detail only
   after terminal success. Do not infer completion from submit acknowledgement.
6. Normalize only strict boolean strings (`"true"`/`"false"`) at the shared
   motion-contract boundary; reject unrelated values.

## Risks to watch

- BullMQ/Redis outage must not leave a falsely queued job.
- Worker crash must not cause an unsafe paid duplicate execution.
- A stale worker must not clear a newer active-shot pointer.
- Existing direct router tests assume final prompt results and need a bounded
  compatibility migration to executor-focused tests plus queue submit tests.
