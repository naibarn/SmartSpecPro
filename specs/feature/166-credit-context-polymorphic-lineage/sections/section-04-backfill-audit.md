# Section 04 — Historical Backfill, Audit, Caller Guard, and Runbook

## Goal

Provide safe operational tools for verified historical attribution and detect
new coverage gaps without guessing or modifying financial history.

## Dependencies and owned files

Depends on sections 01–03. Own:

- `apps/web/scripts/backfill-credit-context-lineage.ts`
- `apps/web/scripts/audit-credit-context-lineage.ts`
- `apps/web/scripts/audit-credit-context-callers.ts`
- focused script tests
- `docs/runbooks/credit-context-lineage-rollout.md`

## Required implementation

Backfill is dry-run by default and supports `--dry-run`, `--apply`,
`--batch-size`, `--start-id`, `--run-id`, `--pause-after-batch`, `--tenant-id`,
and `--user-id`. Persist an immutable scan watermark, resumable cursor,
bounded batch counters, lease owner/expiry, status, operator, and parity
evidence. Reject a second active run for the same scope; resume paused/stale
runs idempotently.

Only structured metadata (`seriesId`, `jobId`, `taskId`, `runId`, `skillRunId`,
conversation ID), verified Skill settlement relation, durable task/run identity,
and authoritative ownership may create links. Never infer from timestamp,
description, same user, Skill slug alone, nearest job, or unverified trace text.
Malformed/missing/conflicting/foreign rows are counted with stable disposition
codes as unattributed, ambiguous, permanent skip, or retryable deferred.

Print run ID, scan-through ID, cursor, before/after ledger count and amount
sums, balances, context/link counts, ownership/missing-source rejections,
duplicates, and data-quality totals for every batch/final report. Do not run as
part of migration.

The audit script is read-only and reports orphan/multiple-primary links,
tenant/user mismatch, resolver/state drift, integrity exceptions, missing
tenant on new rows, and direct-ledger/report parity. The caller AST audit ignores
comments/tests, detects direct calls/aliases/wrappers, emits stable JSON with
caller/symbol/source/schema/commit/context classification, and fails CI for an
unclassified production caller or ledger bypass.

The runbook documents backup/snapshot, migration/index preflight, dry-run,
canary, pause/resume, restore rehearsal, parity, feature flags, alert response,
and separates local proof from authenticated staging/production proof.

## TDD-first tests

Test dry-run default, filters, watermark/cursor, lease conflict, pause/resume,
duplicate rerun, verified evidence, prohibited guessing, malformed row skip,
disposition stability, parity counters, audit read-only behavior, AST caller
classification/comment-test exclusion, and runbook required commands/flags.

## Completion evidence

Run tools against a fixture or dry-run environment and retain JSON evidence.
Do not apply production backfill or migration. Record the missing section-writer
template as a planning-tooling issue, not a lineage-data result.

## Implemented locally

Added dry-run-first resumable backfill with immutable scoped
watermark/cursor/lease, cumulative counters, mode/version guards, and
active-run protection, read-only lineage audit, AST caller inventory, and the
rollout runbook. No migration or backfill was executed against production.
