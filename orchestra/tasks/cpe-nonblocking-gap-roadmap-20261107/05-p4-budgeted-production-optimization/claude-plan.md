# P4 Implementation Plan — Budgeted Production Optimization

## Requirement ledger

| ID | Requirement | Existing state | Completion predicate |
|---|---|---|---|
| CPE-15 | Cost-aware production and retries | Credit/pricing primitives exist; Feature 155 canonical status is unresolved | Estimates are input-snapshotted; paid work reserves within the existing budget; actuals settle once; unknown outcomes reconcile before retry |
| NB-07 | Credit/budget enforcement and idempotency | Credit service and task idempotency exist; cross-provider ambiguity proof is incomplete | Duplicate requests, webhook replay and worker restart cannot double-dispatch or double-debit |
| NB-03 | Quality remains advisory | Some QC severity gates exist; broad Feature 157 gate wording requires reconciliation | Low score, warnings, unavailable analytics and stale QC do not change baseline image/video eligibility |
| NB-08 | Tenant, safety, capability and cancellation controls | Controls exist across current services; full optimization boundary proof is incomplete | Recommendations cannot bypass tenant scope, explicit authorization, safety, allowlist, capability or cancellation |
| LEARN-01 | Optional outcome learning | Feature 149 has unresolved requirements | Learning records are revision-bound and advisory; absence/failure has no dispatch or approval side effect |

## Sequence

1. Reconcile Feature 155 and Feature 149 registry entries, handoffs, source claims and unresolved requirements. Reuse their canonical owner; do not create a competing SPEC or ledger.
2. Trace the authoritative pricing calculator, credit reservation/settlement, media operation idempotency and provider task reconciliation paths. Record the current invariant and missing evidence before edits.
3. Freeze estimate inputs (operation, quantity, model/provider, price version and relevant options) and use existing reservation semantics. Define how price drift is displayed and handled without hidden provider substitution.
4. Exercise duplicate dispatch, webhook replay, task retry, worker restart, concurrency and ambiguous provider outcomes. Resolve unknown state before any redispatch or refund.
5. Connect verified, revision-bound cost and outcome evidence to optional recommendation/learning. Keep recommendations advisory and require the existing explicit authorization path for any paid change.
6. Add feature-off, service-failure, tenant isolation, cancellation, budget-cap and image/video eligibility proofs. Record a source-backed completion handoff for unresolved non-blocking items.

## Owned paths

Existing `pricingCalculator.ts`, `creditService.ts`, provider task reconciliation, `worker_jobs`/outbox adapters, Feature 155/149 canonical artifacts and focused credit/provider/CPE tests. Do not introduce another cost balance, job system, optimizer dispatch path or mutable asset pointer.

## Dependencies

P0 non-blocking policy; P2 advisory QC and stable asset lineage; P3 audio/assembly operation-cost events where those features are in scope.

## Definition of done

No paid operation bypasses existing authorization or budget; no duplicate or ambiguous outcome double-charges or triggers a duplicate paid attempt; estimates and actuals are explainable; learning and recommendations are optional; CPE advisory/unavailable states preserve baseline image/video eligibility; existing tenant, safety, capability and cancellation protections pass focused verification.

No production deployment is part of this phase.
