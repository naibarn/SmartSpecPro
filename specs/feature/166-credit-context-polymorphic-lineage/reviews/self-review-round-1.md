# Plan Self-review Round 1

## Findings

1. The plan covered the migration, ledger, resolver, billing, backfill, report,
   UI, and rollout requirements, but omitted the two locked report configuration
   keys and the explicit 500 ms report budget. This was a real implementability
   gap because the rollout gate could not be configured from the plan.
2. The repository migration sequence differed from the initial source spec.
   `spec.md` was corrected to 0264 before the plan was finalized.
3. No unresolved contradictions were found between the shared accounting rule,
   self/admin scope rules, and UI data-quality presentation.

## Result

- Structural integrity: PASS after fix.
- Completeness vs synthesized spec: PASS after adding
  `CREDIT_CONTEXT_MAX_EXPORT_DAYS`, interactive range, and
  `CREDIT_CONTEXT_REPORT_P95_BUDGET_MS`.
- Implementability: PASS.
- Internal consistency: PASS.
- Edge cases/failure modes: PASS.

The missing configuration keys were auto-fixed in `claude-plan.md`.

## Round 2 — data and accounting attack

Checked that every financial path remains on `credit_transactions`, that
revenue rows are excluded from user cost, that invalid refunds are exceptions,
and that parent/root links cannot multiply counts. Checked the null legacy
tenant rule and transaction-time tenant requirement. PASS; no fix required.

## Round 3 — authorization and failure attack

Checked self/admin scope separation, tenant predicate ordering before label
resolution, foreign-context errors, cache/idempotency conflicts, queue
re-authorization, audit failure behavior, and temporary source unavailability.
PASS; no fix required.

## Round 4 — migration and operations attack

Checked UUID consistency, journal ordering, additive/no-balance-change
migration, index/report gating, dry-run/resume/lease behavior, backup/restore
runbook, local-versus-production evidence, and feature-flag defaults. PASS; no
fix required.

## Round 5 — API/UI/test traceability attack

Checked history compatibility, shared summary/detail/export accounting service,
watermark and pagination propagation, safe labels/raw-ID policy, responsive
viewport matrix, accessibility/copy/browser evidence, and matching TDD stubs.
PASS; no fix required. The plan is ready for section splitting.
