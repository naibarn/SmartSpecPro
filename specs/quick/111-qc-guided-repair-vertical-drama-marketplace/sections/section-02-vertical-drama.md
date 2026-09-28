# Section 02 — Vertical Drama repair

## Ownership

Vertical Draft QC repair service, job/router state, ledger lineage, and focused
server tests. Do not modify Marketplace files in this section.

## Targets

- `verticalDramaDraftQualityQc.ts`
- `verticalDramaDraftQualityQcJobs.ts`
- `verticalDramaDraftLedger.ts`
- `verticalDramaSeries.ts` and focused router/service tests

## TDD

Prove source binding, one revise/evaluate pair, all existing validators,
parent/new-version persistence, stale rejection, no-improvement retention, and
idempotency before wiring the UI callback.

## Acceptance

Repair produces a durable selectable version and a fresh report while the old
candidate remains active until explicit selection.
