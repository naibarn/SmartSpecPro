# Section 08 implementation record — checkpoints and resume

Status: partial / in progress.

## Implemented locally

- Each successful, fenced node settlement writes an idempotently looked-up checkpoint with completed node IDs, per-node artifact refs/content digests, source plan hash, and a canonical checkpoint digest.
- Run-from admission validates tenant/version/content/input identity and the checkpoint's per-node ref/digest map before use.
- Completed predecessor refs are projected into the resumed node's canonical job input envelope and persisted logical node row.
- The pinned run-plan hash includes checkpoint/target/mode and per-node input refs.
- Run-level approve/reject/input submission now fails closed until an authorized Spec 225 attention/approval source is linked; generic worker `resumeExternal` is not accepted as human approval evidence.
- Run-level retry/resume fails closed until it can select and authorize the actual failed logical node attempts. Cancel first resolves all canonical job refs in the tenant, then requests cancellation for every verified non-terminal job with an action-derived idempotency key.

## Verification

- Runtime regression test confirms a resumed target receives the completed predecessor artifact ref.
- Runtime regression test confirms human approval/input and run-level retry/resume controls remain blocked without their owner/logical-node bridge; the adapter preflight receives trusted tenant/actor identity.
- Latest focused 7-file suite passes 86 tests; Drizzle metadata check passes.

## Remaining acceptance gaps

- Human suspension/approval and authorized one-time resume actions are not connected to Specs 225/226.
- Checkpoint creation and physical completion are separate logical tables within the same post-completion hook window; a crash before checkpoint projection needs durable retry/reconciliation.
- Existing legacy checkpoints without per-node ref/digest data are rejected by canonical run-from.
