# Plan/Spec Alignment Review Round 4

## Verdict

The plan has been updated to close the six implementation-readiness gaps found
in the latest alignment audit. The changes remain planning-only and do not touch
application code.

## Improvements Applied

- Added a Section 12 preflight slice that gates Section 05 worker/runtime work
  before HyperFrames package installation or execution.
- Converted MVP open questions into resolved first-release decisions and left
  only beyond-MVP questions open.
- Added exact polling contract requirements: 5-15 second normal intervals,
  30-second max backoff, terminal stop statuses, cache metadata, and tests.
- Added explicit charge summary requirements for start, preview, and Library
  finalize responses with `creditEstimate`, `quotaDecision`, or
  `noChargeReason`.
- Added safe auto-repair policy and UI requirements for stale input hash, missing
  snapshot, retryable worker/dependency/storage failure, and minor layout
  warning cases.
- Added migration decision checkpoint requirements before any dedicated
  HyperFrames tables: dry-run SQL, rollback SQL, backfill, dual-read, cutover
  flag, cleanup proof, and old/new ledger tests.

## Residual Risk

Implementation still needs to align command names with actual `apps/web`
scripts, confirm package/runtime details through the preflight gate, and keep
browser evidence mandatory for Product Detail, Storyboard Review, MediaStudio,
Library, and Video Editor handoff.
