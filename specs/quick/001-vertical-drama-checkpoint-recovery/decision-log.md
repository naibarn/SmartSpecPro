# Decision log

## Planning depth

Choose `standard` quick-plan: the work spans service, router, UI, and tests but
does not require a schema migration or a new external service. Promote to full
deep-plan only if implementation discovers a durable DB contract is required.

## Decisions

1. Add an explicit recovery operation to the existing Redis/BullMQ service.
   This minimizes migration risk and reuses the already-tested checkpoint
   executor path.
2. Add a recoverable read model separate from active-job polling. Failed jobs
   must be truthful and refresh-discoverable without blocking normal submit.
3. Use the same domain job id and checkpoint while creating a fresh BullMQ
   delivery. This avoids rebuilding the story and preserves per-job progress.
4. Make the server return a recovery decision/summary. The UI must not infer
   recoverability from raw status or episode counts.
5. Recovery remains explicit in the UI. Automatic handling may classify and
   explain the best action, but must not silently start paid work.

## Review stabilization

- Round 1: verified the design covers worker, API, UI, tests, ownership, and
  credit boundaries.
- Round 2: added separate recoverable discovery so terminal cleanup cannot hide
  the repair button after refresh.
- Round 3: added idempotency/per-series locking and a no-checkpoint refusal
  path to prevent duplicate or unsafe work.
- Round 4: added UI state, accessibility, localization, responsive, and
  browser-evidence requirements.
- Round 5: confirmed no production enqueue, migration, or unrelated refactor is
  required; plan is ready for implementation.
