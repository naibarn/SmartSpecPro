# Section 03 — Historical Backfill

## Ownership

Own `apps/web/scripts/backfill-media-task-artifacts.ts`, the npm script, and backfill tests.

## Work

Implement bounded source scans, dry-run, cursor/checkpoint, source/time/limit filters, per-row outcome reporting, quarantine for missing tenant identity, and retry-safe reuse of the shared durability service. Include image/video/audio and all supported task projections where their source URL and owner are available.

## TDD

Test no-write dry runs, restart after failure, idempotent reruns, expiry versus transient errors, and quarantine behavior.

## Acceptance

The command can process historical rows without deleting or regenerating media, resume after interruption, and report exactly which rows remain unresolved.
