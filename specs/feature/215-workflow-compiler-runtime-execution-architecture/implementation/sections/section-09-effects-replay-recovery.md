# Section 09 implementation record — effects, replay, and recovery

Status: partial / in progress.

## Implemented locally

- Job result settlement is accepted only from the canonical succeeded worker job and matching physical attempt fence.
- Per-node retries, terminal failure, cancellation, and expiry are projected to logical state through post-settlement hooks.
- Duplicate post-failure/retry projection is idempotent; physical retry attempts continue to be owned by Feature 195.
- Output settlement requires an artifact reference and explicit content digest; no digest is fabricated from a reference.

## Remaining acceptance gaps

- There is no durable outbox/reconciler for a process crash or transient failure after physical completion but before the post-commit logical projection.
- Provider-side idempotency receipts, ambiguous submission recovery, compensation/saga replay, cache effects, and orphan repair are not implemented.
- Cancellation/retry races need a database-backed integration test with actual lease generations.
