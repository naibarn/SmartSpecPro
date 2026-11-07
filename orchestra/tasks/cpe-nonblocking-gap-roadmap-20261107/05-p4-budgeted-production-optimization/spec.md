# P4 — Budgeted Production Optimization

## Goal

Use verified production, provider and advisory-QC outcomes to recommend or perform only bounded optimizations that stay inside existing user authorization and approved budget.

## Scope

Reconcile Feature 155's cost forecast/ledger requirements and Feature 149's learning/QC ledger with actual current credit/pricing/task contracts. Add source-backed missing pieces for per-operation estimates, budget-aware admission, idempotent settlement, ambiguous provider reconciliation, bounded retry allocation, and optional recommendation quality.

Exclude a second credit balance, description-based cost attribution, hidden provider substitution, budget auto-increase, recurring paid work without fresh budget, or any use of subjective quality as a hard production failure.

## User-Facing Behavior

Users can see forecast, actual/reconciled credits, and optional optimization suggestions. A paid operation that exceeds explicit approved budget retains the normal budget/payment control. A missing optimization or learning service never obstructs the normal configured image/video operation.

## Technical Constraints

- Reuse `pricingCalculator.ts`, `creditService.ts`, `worker_jobs`/outbox task identifiers, provider results, asset ownership and the approved series/episode cost contracts.
- Freeze pricing/routing inputs for reproducibility; make ledger entries idempotent and immutable after settlement except through explicit reconciliation.
- On unknown provider outcome, reconcile before retry. Do not retry or charge twice.
- Optimizer inputs are advisory and tenant-scoped; all dispatch still passes through provider, safety, ownership and budget gates.

## Dependencies

P0 hard-control taxonomy; P2 typed QC outcomes/asset lineage; P3 audio and assembly actual-cost events where those operations are in scope.

## Outputs

An auditable budget/retry policy and optional recommendation path whose failure falls through to current routing, plus reconciled Feature 155/149 requirement evidence.

## Edge Cases

- A provider task times out locally but may still be running remotely.
- An idempotent retry arrives after task result settlement.
- Provider pricing changes between estimate and dispatch.
- Budget reaches cap after initial image but before optional video repair.
- Optimization recommends a model that is disabled, incompatible, or not in the tenant's allowlist.

## Error Handling

Return normal budget/authorization errors for paid work; do not misrepresent them as quality failures. For optimizer, pricing lookup, or analytics errors, keep current user-selected compatible routing and do not create a paid retry.

## Testing Expectations

Cover forecast snapshot, cap admission, concurrent reservations, idempotent duplicate requests, ambiguous outcomes, reconciliation/refund, model incompatibility and flag-off optimizer behavior. Assert no paid generation occurs without a valid budget and no duplicate deductions occur.
