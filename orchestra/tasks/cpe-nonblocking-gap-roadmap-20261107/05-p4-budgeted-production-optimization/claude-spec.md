# P4 Specification — Budgeted Production Optimization

## Goal

Close the remaining cost visibility, idempotent settlement, bounded retry and optional outcome-learning gaps by reconciling Feature 155 and Feature 149 with the current credit, provider and worker-job contracts. Any optimization remains optional and cannot make subjective CPE quality a prerequisite for ordinary image or video generation.

## Scope

- Reconcile canonical ownership and implemented source for cost forecast, reservation, settlement, ambiguous provider outcomes, refunds/reconciliation and outcome learning.
- Reuse current credit/pricing services, `worker_jobs` plus outbox, provider task IDs and media lineage.
- Make estimates and actuals explainable and idempotent across duplicate requests, retries, webhook delivery and worker restarts.
- Permit opt-in, bounded optimization recommendations only inside explicit user/tenant authorization, provider capability, allowlist, safety and available-budget controls.
- Prove that optimizer, pricing lookup, analytics or learning failure falls back to current configured routing and does not prevent the baseline image/video operation.

## User-Facing Behavior

Users can inspect an estimate before an authorized paid operation and see actual or reconciled credits afterwards. A request above an explicitly configured budget follows the existing budget/payment control. Optional quality or cost recommendations are visible as advice and require existing user authorization before a paid change or retry. A missing or failing CPE optimizer never blocks a normal configured image/video request.

## Technical Constraints

- There is one authoritative credit ledger; do not add a parallel balance or mutable duplicate ledger.
- Snapshot the pricing, model, provider, operation and quantity inputs used for an estimate/reservation.
- Use stable idempotency keys and provider task identifiers; settle once and reconcile unknown outcomes before retry or refund.
- Never infer completion or non-execution solely from a local timeout.
- Never silently substitute a model/provider, auto-increase a budget, auto-enroll recurring paid work or trigger unapproved paid retries.
- Preserve tenant, asset, cancellation, content-safety, provider allowlist/capability and existing payment/credit controls.
- Long-running work remains on the canonical `worker_jobs` plus outbox control plane.

## Dependencies

P0 establishes the hard/advisory policy boundary; P2 supplies versioned QC and media outcomes; P3 supplies audio/assembly actual-cost events where applicable. Existing Feature 155 owns cost/ledger requirements if canonical reconciliation confirms it; Feature 149 owns learning/QC evidence if its scope is still authoritative.

## Outputs

- Canonically reconciled Feature 155/149 requirement and ownership disposition.
- Source-backed estimate/reserve/settle/reconcile contract and focused test matrix.
- Optional, bounded recommendation path with a safe current-routing fallback.
- Evidence that advisory CPE states cannot change image/video eligibility and that duplicate or ambiguous outcomes cannot double charge or retry.

## Edge Cases

- Provider accepted work but the client timed out before receiving its task ID.
- Webhook and worker completion race or arrive more than once.
- Pricing changes after estimate but before dispatch.
- Budget is consumed by another concurrent operation before reserve.
- A user cancels while the provider outcome remains unknown.
- Optimizer recommends a disabled, incompatible, disallowed or more expensive model.
- Quality evidence is stale, unavailable, contradictory or attached to a replaced asset revision.

## Error Handling

Return existing authorization, credit, budget, provider-capability and cancellation outcomes distinctly. On an ambiguous provider state, hold/reconcile the reservation and suppress duplicate dispatch until the existing provider/task contract resolves it. On optimizer, pricing-advice, analytics or quality-service failure, retain the configured compatible route and continue the baseline operation whenever existing hard controls allow it.

## Testing Expectations

Cover estimate snapshots, reservation races, cap enforcement, duplicate dispatch, idempotent settlement, webhook replay, unknown provider outcome, cancellation, refund/reconciliation, price changes, model incompatibility, tenant isolation and optimizer-off/failure behavior. Assert no paid dispatch without a valid existing reserve/authorization, no duplicate debit, no automatic budget increase, and identical production eligibility for every advisory CPE state.

## Non-Goals

No new payment system, provider catalog, job queue, autonomous paid retry loop, quality-score release gate, budget policy redesign, production deployment or automatic training/prompt mutation.
