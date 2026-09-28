# TDD guidance

## Foundation first

Add failing shared tests for deterministic repair plans, no plan when passed,
bounded target/preserve paths, and legacy state parsing. Then implement the
additive schemas and pure builders.

## Vertical Drama

Add service tests that prove: one revise + one evaluate, immutable/story-control
rejection, missing metadata recovery, ledger parent/new-version lineage,
stale-fingerprint rejection, no-improvement retention, and duplicate request
deduplication. Add router tests for tenant/owner/candidate binding. Update panel
tests for confirmation and result comparison.

## Marketplace

Add service tests for baseline/repair artifact persistence, malformed revision,
product truth/reference/shot contract rejection, fresh evaluation, no active
replacement on a non-pass result, and idempotent outbox requests. Add router
tests for story-plan state and owner binding. Add panel/surface tests for repair
and explicit selection.

## Test setup

Prefer injected evaluate/revise, reservation, storage, and job dependencies.
Use deterministic fingerprints and fixed timestamps. Do not require provider
credentials or a live paid model for focused tests. Preserve existing test
fixtures and avoid broad snapshots that include unrelated dirty metadata.
